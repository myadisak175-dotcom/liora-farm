/**
 * Headless test runner for the tools/test/*.test.html pages.
 *
 * Drives Chromium over the DevTools protocol rather than --dump-dom because
 * --window-size is ignored in headless: an earlier version of this runner
 * reported phone viewports while actually laying out at 500x577, which is
 * exactly the kind of pass that hides a broken mobile panel.
 *
 *   node tools/test/run.mjs [--port 8811] [--chrome <path>]
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

const PORT = Number(flag("port", 8811));
const ROOT = path.resolve(import.meta.dirname, "../..");
const CHROME =
  flag("chrome", process.env.CHROME_PATH) ??
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(
    (candidate) => fs.existsSync(candidate)
  );

const PAGES = [
  { file: "tools/test/builder-controller.test.html", viewports: [[900, 800]] },
  { file: "tools/test/nature-v2.test.html", viewports: [[900, 800]] },
  { file: "tools/test/wind-system.test.html", viewports: [[900, 800]] },
  { file: "tools/test/wind-shader-compile.test.html", viewports: [[900, 800]] },
  { file: "tools/test/instanced-pool.test.html", viewports: [[900, 800]] },
  { file: "tools/test/local-store.test.html", viewports: [[900, 800]] },
  { file: "tools/test/runtime-modules.test.html", viewports: [[900, 800]] },
  { file: "tools/test/ground-layers.test.html", viewports: [[900, 800]] },
  { file: "tools/test/ground-shader.test.html", viewports: [[900, 800]] },
  { file: "tools/test/terrain-height.test.html", viewports: [[900, 800]] },
  { file: "tools/test/builder-hud.test.html", viewports: [[375, 667]] },
  { file: "tools/test/paint-panel.test.html", viewports: [[390, 664], [360, 560], [320, 480]] },
];

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".webp": "image/webp", ".glb": "model/gltf-binary",
};
const server = http.createServer((request, response) => {
  const file = path.join(ROOT, decodeURIComponent(request.url.split("?")[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});
server.listen(PORT);
await once(server, "listening");

if (!CHROME) {
  console.error("No Chromium found. Pass --chrome <path> or set CHROME_PATH.");
  process.exit(2);
}
const chrome = spawn(CHROME, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader",
  "--remote-debugging-port=0", "--user-data-dir=" + fs.mkdtempSync("/tmp/liora-test-"),
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let stderr = "";
const wsUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Chromium never printed a DevTools URL:\n" + stderr)), 30000);
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk;
    const found = /ws:\/\/[^\s]+/.exec(stderr);
    if (found) { clearTimeout(timer); resolve(found[0]); }
  });
});

const socket = new WebSocket(wsUrl);
await once(socket, "open");
let nextId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });

let failures = 0;
let total = 0;

for (const page of PAGES) {
  for (const [width, height] of page.viewports) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);
    await send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: true,
    }, sessionId);

    const url = `http://localhost:${PORT}/${page.file}`;
    await send("Page.navigate", { url }, sessionId);

    const evaluate = async (expression) => {
      const { result } = await send("Runtime.evaluate", {
        expression, returnByValue: true, awaitPromise: true,
      }, sessionId);
      return result.value;
    };

    let done = false;
    for (let tick = 0; tick < 200 && !done; tick += 1) {
      done = await evaluate("Boolean(window.__done)").catch(() => false);
      if (!done) await new Promise((r) => setTimeout(r, 100));
    }

    const label = `${page.file} @ ${width}x${height}`;
    if (!done) {
      const text = await evaluate("document.querySelector('#out')?.textContent ?? ''");
      console.log(`\n✗ ${label}\n  timed out — ${String(text).slice(0, 400)}`);
      failures += 1;
      total += 1;
    } else {
      const results = (await evaluate("window.__results")) ?? [];
      const bad = results.filter((entry) => !entry.pass);
      total += results.length;
      failures += bad.length;
      console.log(`\n${bad.length ? "✗" : "✓"} ${label} — ${results.length - bad.length}/${results.length}`);
      for (const entry of bad) console.log(`   FAIL ${entry.name}${entry.detail ? ` | ${entry.detail}` : ""}`);
    }
    await send("Target.closeTarget", { targetId });
  }
}

console.log(`\n${total - failures}/${total} checks passed`);
socket.close();
chrome.kill();
server.close();
process.exit(failures ? 1 : 0);
