import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
const { chromium, webkit, devices } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || '/tmp/liora-smoke/node_modules/playwright/index.mjs'));
const root = process.cwd();
fs.mkdirSync('smoke-results', { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const baseline = requested.startsWith('/baseline/');
  const base = baseline ? '/tmp/liora-baseline' : root;
  const relative = baseline ? requested.slice('/baseline/'.length) : requested.slice(1);
  const file = path.resolve(base, relative || 'index.html');
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
server.listen(8000, '127.0.0.1');
await once(server, 'listening');
const chrome = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const safari = await webkit.launch();
const reports = [];
let failures = 0;
async function run(name, browser, { baseline = false, hold = null, safe = false, previewOnly = false, texture = false } = {}) {
  const context = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const page = await context.newPage();
  const report = { name, errors: [], warnings: [], held: [], externalRequests: [] };
  await page.addInitScript(() => {
    window.__testDraws = 0;
    const proto = window.WebGL2RenderingContext?.prototype;
    if (proto) for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const original = proto[name];
      proto[name] = function (...args) { window.__testDraws++; return original.apply(this, args); };
    }
    localStorage.setItem('liora.blank-start.revision', 'blank-land-v1');
    localStorage.setItem('liora.quality.v2', 'high');
    localStorage.setItem('liora.startup-test.sentinel', 'keep-me');
  });
  page.on('pageerror', (error) => report.errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (['warning', 'error'].includes(message.type())) report.warnings.push(message.text()); });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    // WebKit exposes in-memory GLB image blobs here; these are not CDN traffic.
    if (url.protocol === 'blob:' || url.protocol === 'data:') return route.continue();
    // A working first-party engine must not rely on any third-party CDN.
    if (url.hostname !== '127.0.0.1') {
      report.externalRequests.push(url.href);
      return route.abort();
    }
    const pathname = url.pathname;
    const matched = hold === 'village' ? pathname.endsWith('/liora_village_background.webp')
      : hold === 'forest' ? pathname.includes('/assets/models/') && !pathname.includes('/player/')
      : hold === 'player' ? pathname.includes('/assets/models/player/')
      : texture ? pathname.includes('/assets/textures/') && /grass/i.test(pathname)
      : false;
    if (matched) { report.held.push(url.href); return; }
    return route.continue();
  });
  try {
    const url = `http://127.0.0.1:8000/${baseline ? 'baseline/' : ''}${safe ? '?safe=1' : ''}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (baseline || previewOnly) await page.waitForTimeout(6000);
    else await page.waitForFunction(() => window.__lioraBooted === true, null, { timeout: 40000 });
    if (!baseline && !previewOnly && !hold && !safe && !texture) {
      await page.waitForFunction(() => window.__lioraWoodlandState === 'ready', null, { timeout: 20000 });
    }
    await page.waitForTimeout(300);
    report.state = await page.evaluate(() => ({
      booted: window.__lioraBooted, stage: window.__lioraBootState, draws: window.__testDraws,
      firstFrameMs: window.__lioraFirstFrameAt, error: window.__lioraBootError,
      revision: window.__lioraRevision, engine: window.__lioraEngineSource,
      woodlandState: window.__lioraWoodlandState, woodland: window.__liora?.woodland,
      missingTextures: window.__liora?.missingTextures,
      sentinel: localStorage.getItem('liora.startup-test.sentinel'),
      savedQuality: localStorage.getItem('liora.quality.v2'), recoveryMode: window.__lioraRecoveryMode,
      status: document.querySelector('#status')?.textContent,
    }));
    await page.screenshot({ path: `smoke-results/${name}.png` });
    assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
    assert.equal(report.state.sentinel, 'keep-me');
    if (baseline) {
      assert.equal(report.state.booted, false);
      assert.equal(report.state.draws, 0, 'baseline should reproduce no 3D frame when village is pending');
      assert.ok(report.held.length);
    } else {
      assert.ok(report.state.draws > 0, 'must actually draw WebGL, not just set a ready flag');
      assert.equal(report.state.engine, 'local');
      assert.equal(report.externalRequests.length, 0, 'production boot should use no CDN');
      if (previewOnly) assert.equal(report.state.booted, false);
      else assert.equal(report.state.booted, true);
      if (hold || texture) assert.ok(report.held.length, 'fault injection must affect a real request');
      if (!hold && !texture) assert.ok(!report.warnings.some(message => message.includes("Couldn't load texture")), 'normal boot must retain embedded GLB textures');
      if (safe) {
        assert.equal(report.state.recoveryMode, true);
        assert.equal(report.state.savedQuality, 'high', 'recovery quality must not overwrite saved preference');
        assert.equal(report.state.woodlandState, 'skipped-recovery');
      }
    }
    // A real painted save survives recovery/reload; neither retry route clears it.
    if (safe) {
      const saved = await page.evaluate(() => {
        const paint = window.__liora.paint;
        paint.paintAt(2, 3, { radius: 1, layer: 0, strength: 0.7 });
        paint.flushSave();
        return JSON.stringify(paint.exportData());
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__lioraBooted, null, { timeout: 40000 });
      assert.equal(await page.evaluate(() => JSON.stringify(window.__liora.paint.exportData())), saved);
      report.paintSavePreserved = true;
    }
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.failure = error.stack || String(error);
    failures++;
    try {
      report.failureState = await page.evaluate(() => ({ stage: window.__lioraBootState, error: window.__lioraBootError, draws: window.__testDraws, status: document.querySelector('#status')?.textContent }));
      await page.screenshot({ path: `smoke-results/${name}-failure.png` });
    } catch {}
  } finally {
    fs.writeFileSync(`smoke-results/${name}.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    reports.push(report);
    await context.close();
  }
}
try {
  if (fs.existsSync('/tmp/liora-baseline/index.html')) await run('before-stalled-village', chrome, { baseline: true, hold: 'village' });
  await run('chrome-normal', chrome);
  await run('chrome-stalled-village', chrome, { hold: 'village' });
  await run('chrome-stalled-forest', chrome, { hold: 'forest' });
  await run('chrome-stalled-player-preview', chrome, { hold: 'player', previewOnly: true });
  await run('chrome-stalled-ground', chrome, { texture: true });
  await run('chrome-recovery', chrome, { safe: true });
  await run('webkit-normal', safari);
  await run('webkit-stalled-village', safari, { hold: 'village' });
  await run('webkit-recovery', safari, { safe: true });
} finally {
  fs.writeFileSync('smoke-results/summary.json', JSON.stringify({ failures, passed: reports.filter(r => r.passed).length, reports }, null, 2));
  await chrome.close(); await safari.close(); server.close();
}
process.exitCode = failures ? 1 : 0;
