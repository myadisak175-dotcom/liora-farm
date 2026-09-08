from pathlib import Path
p=Path('.')
def R(name, old, new):
    f=p/name; s=f.read_text(); assert old in s,(name,old[:100]); f.write_text(s.replace(old,new,1))

(p/'src/systems/load-budget.js').write_text('''/** Bound a load without allowing its late result to mutate its caller. */
export function withLoadBudget(promise, milliseconds, label = "asset", onLate = null) {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new Error(`Load timed out: ${label}`));
    }, milliseconds);
    Promise.resolve(promise).then((value) => {
      clearTimeout(timer);
      if (expired) {
        try { onLate?.(value); } catch (error) { console.warn("Late load cleanup failed", error); }
        return;
      }
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      if (!expired) reject(error);
    });
  });
}

/** Covers both headers and body: a stalled JSON body also has a deadline. */
export async function fetchBootJSON(url, milliseconds = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
''')
R('src/systems/ground-texture-array.js','import * as THREE from "three";','import * as THREE from "three";\nimport { withLoadBudget } from "./load-budget.js";')
R('src/systems/ground-texture-array.js','const texture = await textureLoader.loadAsync(layer.texture);','const texture = await withLoadBudget(textureLoader.loadAsync(layer.texture), 8000, layer.texture, (late) => late.dispose());')
R('src/systems/ground-texture-array.js','''        missing.push(layer.key);
        return fallbackTile(size);''','''        missing.push(layer.key);
        const pixels = fallbackTile(size);
        // The base-map path needs an image as well as the array's pixels.
        const image = document.createElement("canvas");
        image.width = image.height = size;
        image.getContext("2d").putImageData(new ImageData(pixels, size, size), 0, 0);
        images.set(layer.key, image);
        return pixels;''')
R('src/zones/home-island.js','import * as THREE from "three";','import * as THREE from "three";\nimport { withLoadBudget } from "../systems/load-budget.js";')
R('src/zones/home-island.js','waterTexture = await textureLoader.loadAsync(`${assets.textureDir}/${config.water.texture}`);','waterTexture = await withLoadBudget(textureLoader.loadAsync(`${assets.textureDir}/${config.water.texture}`), 8000, "water texture", (late) => late.dispose());')
R('src/editor/asset-loader.js','import { getBuildableAsset } from "./asset-catalog.js";','import { getBuildableAsset } from "./asset-catalog.js";\nimport { withLoadBudget } from "../systems/load-budget.js";')
R('src/editor/asset-loader.js','const request = loadWithThree(path)','const request = withLoadBudget(loadWithThree(path), 12000, path)')
R('src/editor/layout-runtime.js','import { WORLD_LOGIC } from "../systems/world-logic.js";','import { WORLD_LOGIC } from "../systems/world-logic.js";\nimport { fetchBootJSON } from "../systems/load-budget.js";')
R('src/editor/layout-runtime.js','''    const response = await fetch(defaultMapUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Default map request failed: ${response.status}`);
    return response.json();''','''    return fetchBootJSON(defaultMapUrl);''')
R('src/editor/layout-runtime.js','''  async function load() {
    if (!layoutStore.hasSavedLayout()) {''','''  async function load() {
    // Reuse the same authored map instead of three consecutive no-store loads.
    const mapRequest = fetchDefaultMap();
    mapRequest.catch(() => {});
    if (!layoutStore.hasSavedLayout()) {''')
R('src/editor/layout-runtime.js','''        const map = await fetchDefaultMap();''','''        const map = await mapRequest;''')
R('src/editor/layout-runtime.js','''    await applyAuthoredHorizon();
    await applyAuthoredLogic();''','''    await applyAuthoredHorizon(mapRequest);
    await applyAuthoredLogic(mapRequest);''')
R('src/editor/layout-runtime.js','''  async function applyAuthoredHorizon() {
    try {
      const map = await fetchDefaultMap();''','''  async function applyAuthoredHorizon(mapRequest = null) {
    try {
      const map = await (mapRequest ?? fetchDefaultMap());''')
R('src/editor/layout-runtime.js','''  async function applyAuthoredLogic() {
    try {
      const map = await fetchDefaultMap();''','''  async function applyAuthoredLogic(mapRequest = null) {
    try {
      const map = await (mapRequest ?? fetchDefaultMap());''')
f=p/'src/systems/world-logic.js'; f.write_text('import { fetchBootJSON } from "./load-budget.js";\n'+f.read_text())
R('src/systems/world-logic.js','''    const response = await fetch("./maps/index.json", { cache: "no-store" });
    if (!response.ok) return fallback;
    const index = await response.json();''','''    const index = await fetchBootJSON("./maps/index.json");''')
R('src/systems/world-logic.js','''      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`World logic map request failed: ${response.status}`);
      const map = await response.json();''','''      const map = await fetchBootJSON(url);''')
R('src/main.js','import * as THREE from "three";','import * as THREE from "three";\nimport { fetchBootJSON, withLoadBudget } from "./systems/load-budget.js";')
R('src/main.js','const APP_REVISION = "world24";','''const APP_REVISION = "world24-startup2";
const recoveryMode = new URLSearchParams(location.search).get("safe") === "1";
if (recoveryMode) QUALITY.set("low", { persist: false });
window.__lioraRecoveryMode = recoveryMode;
let appDisposed = false;
let previewFrame = 0;''')
R('src/main.js','function setBootState(state) { window.__lioraBootState = state; }','''function setBootState(state) {
  window.__lioraBootState = state;
  const labels = { renderer: "กำลังเริ่มภาพ 3D…", map: "กำลังอ่านแผนที่…", world: "กำลังโหลดพื้นฟาร์ม…", systems: "กำลังเตรียมฟาร์ม…", player: "กำลังโหลดตัวละคร…", layout: "กำลังโหลดสิ่งของที่บันทึกไว้…" };
  if (labels[state]) window.__lioraSetBootStatus?.(labels[state]);
}''')
R('src/main.js','''  const response = await fetch(CONFIG.builder.mapIndex, { cache: "no-store" });
  if (response.ok) {
    const index = await response.json();''','''  const response = await fetchBootJSON(CONFIG.builder.mapIndex);
  if (response) {
    const index = response;''')
R('src/main.js','''const MAP_CONFIG = {
  ...CONFIG,''','''const MAP_CONFIG = {
  ...CONFIG,
  paintedBackdrop: recoveryMode ? { ...CONFIG.paintedBackdrop, enabled: false } : CONFIG.paintedBackdrop,''')
R('src/main.js','clockButton.onclick = () => dayNight.nextPreset();','''clockButton.onclick = () => dayNight.nextPreset();

// Show actual terrain while the player model and saved objects are pending.
const previewTarget = new THREE.Vector3(0, 0.7, 5);
camera.position.copy(CONFIG.camera.baseOffset).add(previewTarget);
camera.lookAt(previewTarget);
function renderBootPreview() {
  if (appDisposed || window.__lioraBooted) return;
  renderer.render(scene, camera);
  window.__lioraFirstFrameAt ??= performance.now();
  previewFrame = requestAnimationFrame(renderBootPreview);
}
renderBootPreview();
renderer.domElement.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  window.__lioraShowBootProblem?.("ระบบภาพหยุดทำงาน — เปิดโหมดเบาได้โดยไม่ลบเซฟ", "WebGL context lost", true);
});''')
R('src/main.js','config: CONFIG.floatingIslands,','config: recoveryMode ? { ...CONFIG.floatingIslands, enabled: false } : CONFIG.floatingIslands,')
R('src/main.js','''try {
  distantVillageBackdrop = await createDistantVillageBackdrop({
    url: `${ASSETS.textureDir}/liora_village_background.webp`,
    anisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()),
  });
  scene.add(distantVillageBackdrop.group);
} catch (error) {
  // A missing decorative village must never prevent the farm from booting.
  console.warn("Distant village backdrop unavailable", error);
}''','''if (!recoveryMode) {
  // An optional image that never completes must not postpone the first frame.
  createDistantVillageBackdrop({
    url: `${ASSETS.textureDir}/liora_village_background.webp`,
    anisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()),
  }).then((backdrop) => {
    if (appDisposed) { backdrop.dispose(); return; }
    distantVillageBackdrop = backdrop;
    scene.add(backdrop.group);
  }).catch((error) => console.warn("Distant village backdrop unavailable", error));
}''')
R('src/main.js','config: CONFIG.treeLine,','config: recoveryMode ? { ...CONFIG.treeLine, enabled: false } : CONFIG.treeLine,')
R('src/main.js','''  dispose() {
    systems.dispose();''','''  dispose() {
    appDisposed = true;
    cancelAnimationFrame(previewFrame);
    systems.dispose();''')
R('src/main.js','''  player = await createPlayer({''','''  player = await withLoadBudget(createPlayer({''')
R('src/main.js','''    animations: ANIMATIONS,
  });
  scene.add(player.root);''','''    animations: ANIMATIONS,
  }), 25000, "player model");
  scene.add(player.root);''')
f=p/'src/main.js';s=f.read_text();start=s.index('// Generate after saved terrain');end=s.index('reportRescuedSaves();',start);block=s[start:end];s=s[:start]+s[end:]
s=s.replace('window.__lioraBooted = true;','window.__lioraBooted = true;\ncancelAnimationFrame(previewFrame);\nwindow.__lioraFinishBoot?.();',1)
s=s.replace('systems.start(animate);','''systems.start(animate);
// Let the first playable frame render before beginning optional woodland work.
window.__lioraWoodlandState = recoveryMode ? "skipped-recovery" : "pending";
requestAnimationFrame(() => { if (!appDisposed) void loadWoodland(); });

async function loadWoodland() {
'''+block+'''  if (window.__lioraWoodlandState === "pending") window.__lioraWoodlandState = "disabled";
}
''',1)
s=s.replace('if (CONFIG.woodland.enabled && CONFIG.woodland.mapIds.includes(mapScope.id)) {','if (!recoveryMode && CONFIG.woodland?.enabled && CONFIG.woodland.mapIds.includes(mapScope.id)) {',1)
s=s.replace('  setStatus("กำลังโหลดป่าริมฟาร์ม…");','  window.__lioraWoodlandState = "loading";',1)
s=s.replace('    woodland = await createWoodland({','    const loaded = await createWoodland({',1)
s=s.replace('''        woodlandColliders = next;
        colliders''','''        if (appDisposed) return;
        woodlandColliders = next;
        colliders''',1)
s=s.replace('''    if (woodland.stats.failedAssets.length)''','''    if (appDisposed) { loaded?.dispose(); return; }
    woodland = loaded;
    // Account for edits or quality changes made while the assets were pending.
    woodland?.setBlockers(woodlandBlockers());
    woodland?.setQuality(QUALITY.preset);
    window.__lioraWoodlandState = woodland?.stats.failedAssets.length ? "degraded" : "ready";
    if (woodland?.stats.failedAssets.length)''',1)
s=s.replace('''    console.warn("Walkable woodland unavailable", error);''','''    window.__lioraWoodlandState = "error";
    console.warn("Walkable woodland unavailable", error);''',1)
f.write_text(s)

f=p/'index.html';s=f.read_text()
s=s.replace('<script>\n(async () => {','''<script>
window.__lioraBootState = "engine";
window.__lioraSetBootStatus = (text) => {
  const el = document.querySelector("#status");
  if (el) { el.textContent = text; el.classList.remove("hidden", "error"); }
};
(async () => {''',1)
s=s.replace('''    const probe = await fetch(`${LOCAL}three.module.js`, { method: "HEAD", cache: "no-store" });
    if (probe.ok) base = LOCAL;''','''    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const probe = await fetch(`${LOCAL}three.module.js`, { method: "HEAD", cache: "no-store", signal: controller.signal });
      if (probe.ok) base = LOCAL;
    } finally { clearTimeout(timer); }''',1)
s=s.replace('''  const map = document.createElement("script");''','''  window.__lioraEngineSource = base === LOCAL ? "local" : "cdn";
  window.__lioraSetBootStatus("กำลังโหลดระบบภาพ 3D…");
  const map = document.createElement("script");''',1)
s=s.replace('v=woodland1','v=startup2')
s=s.replace('''    "./src/systems/quality.js":''','''    "./src/zones/home-island.js": "./src/zones/home-island.js?v=startup2",
    "./src/systems/ground-texture-array.js": "./src/systems/ground-texture-array.js?v=startup2",
    "./src/editor/asset-loader.js": "./src/editor/asset-loader.js?v=startup2",
    "./src/editor/layout-runtime.js": "./src/editor/layout-runtime.js?v=startup2",
    "./src/systems/world-logic.js": "./src/systems/world-logic.js?v=startup2",
    "./src/systems/quality.js":''',1)
s=s.replace('''  await Promise.all([
''','''  window.__lioraBootState = "modules";
  await Promise.all([
''',1)
s=s.replace('''  const audio = document.createElement("script");
  audio.type = "module";
  audio.src = "./src/audio-runtime.js?v=audio24-route2";
  document.head.append(audio);''','''  const startAudio = () => {
    const audio = document.createElement("script");
    audio.type = "module";
    audio.src = "./src/audio-runtime.js?v=audio24-route2";
    document.head.append(audio);
  };
  if (window.__lioraBooted) startAudio();
  else window.addEventListener("liora:boot-ready", startAudio, { once: true });''',1)
start=s.index('function showBootProblem(text, detail = "") {');end=s.index('</script>',start)
s=s[:start]+'''function showBootProblem(text, detail = "", force = false) {
  if (window.__lioraBooted && !force) return;
  const status = document.querySelector("#status");
  status.textContent = text;
  status.title = detail;
  status.classList.remove("hidden");
  status.classList.add("error");
  window.__lioraBootError = detail || window.__lioraBootError;
  document.querySelector("#boot-recovery").hidden = false;
}
window.__lioraShowBootProblem = showBootProblem;
const recovery = document.createElement("div");
recovery.id = "boot-recovery";
recovery.hidden = true;
recovery.style.cssText = "position:fixed;z-index:10000;left:16px;right:16px;top:110px;text-align:center";
for (const [label, safe] of [["ลองโหลดใหม่", false], ["เปิดโหมดเบา (ไม่ลบเซฟ)", true]]) {
  const button = document.createElement("button");
  button.textContent = label;
  button.type = "button";
  button.style.cssText = "margin:4px;padding:12px;border-radius:12px;background:#fff;color:#173c4b;border:1px solid #173c4b";
  button.onclick = () => {
    const url = new URL(location.href);
    url.searchParams.set("retry", Date.now());
    if (safe) url.searchParams.set("safe", "1");
    else url.searchParams.delete("safe");
    location.assign(url);
  };
  recovery.append(button);
}
document.body.append(recovery);
window.addEventListener("error", (event) => showBootProblem("โหลดเกมไม่สำเร็จ — กดลองใหม่ได้โดยไม่ลบเซฟ", String(event.error?.message ?? event.message ?? "")));
window.addEventListener("unhandledrejection", (event) => showBootProblem("โหลดเกมไม่สำเร็จ — กดลองใหม่ได้โดยไม่ลบเซฟ", String(event.reason?.message ?? event.reason ?? "")));
// Do not wait for window.load: the resource that hangs can prevent it firing.
const bootWatchdog = setInterval(() => {
  if (window.__lioraBooted) return;
  showBootProblem(`กำลังโหลดนาน (${window.__lioraBootState ?? "starting"}) — ลองใหม่หรือเปิดโหมดเบาได้`, String(window.__lioraBootError ?? ""));
}, 12000);
window.__lioraFinishBoot = () => {
  clearInterval(bootWatchdog);
  recovery.hidden = true;
  document.querySelector("#status").classList.remove("error");
  window.dispatchEvent(new Event("liora:boot-ready"));
};
''' + s[end:]
f.write_text(s)
# This script is a one-time migration on the repair branch, not shipped runtime.
Path(__file__).unlink()
