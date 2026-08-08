import { loadAssets } from "./assets.js";
import { Camera } from "./camera.js";
import { drawGround } from "./ground.js";
import { loadTreeAsset, drawTrees } from "./trees.js";
import { tileToWorld } from "./iso.js";
import { ZONES, currentZone, setZone, zoneSize } from "./world.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const camera = new Camera();
let assets = null;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  camera.resize(canvas.width, canvas.height);
  clampCamera();
}

function getWorldBounds() {
  const { h, w } = zoneSize();
  const points = [
    tileToWorld(0, 0),
    tileToWorld(0, w - 1),
    tileToWorld(h - 1, 0),
    tileToWorld(h - 1, w - 1)
  ];
  return {
    minX: Math.min(...points.map(p => p.x)),
    maxX: Math.max(...points.map(p => p.x)) + 192,
    minY: Math.min(...points.map(p => p.y)),
    maxY: Math.max(...points.map(p => p.y)) + 96
  };
}

function clampAxis(value, min, max, viewport) {
  const half = viewport / 2;
  const lo = min + half;
  const hi = max - half;
  if (lo > hi) return (min + max) / 2;
  return Math.max(lo, Math.min(hi, value));
}

function clampCamera() {
  if (!canvas.width || !canvas.height) return;
  const b = getWorldBounds();
  const marginX = 120;
  const marginY = 120;
  camera.x = clampAxis(camera.x, b.minX - marginX, b.maxX + marginX, canvas.width);
  camera.y = clampAxis(camera.y, b.minY - marginY, b.maxY + marginY, canvas.height);
}

function centreOnZone() {
  const b = getWorldBounds();
  camera.x = (b.minX + b.maxX) / 2;
  camera.y = (b.minY + b.maxY) / 2;
  clampCamera();
}

function frame() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#10190f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  camera.apply(ctx);
  drawGround(ctx, assets, camera.view);
  drawTrees(ctx);
  requestAnimationFrame(frame);
}

let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dpr = canvas.width / canvas.clientWidth;
  camera.panByPixels(
    (e.clientX - drag.x) * dpr,
    (e.clientY - drag.y) * dpr
  );
  drag = { x: e.clientX, y: e.clientY };
  clampCamera();
});

canvas.addEventListener("pointerup", () => drag = null);
canvas.addEventListener("pointercancel", () => drag = null);
window.addEventListener("resize", resize);

function syncZoneBar() {
  const id = currentZone().id;
  document.querySelectorAll("#zonebar button[data-zone]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.zone === id));
  });
}

function buildZoneBar() {
  const bar = document.getElementById("zonebar");
  bar.replaceChildren();

  for (const [id, zone] of Object.entries(ZONES)) {
    const button = document.createElement("button");
    button.textContent = zone.title;
    button.dataset.zone = id;
    button.onclick = () => {
      setZone(id);
      centreOnZone();
      syncZoneBar();
    };
    bar.appendChild(button);
  }

  const reset = document.createElement("button");
  reset.textContent = "จัดมุมมอง";
  reset.onclick = centreOnZone;
  bar.appendChild(reset);
  syncZoneBar();
}

async function start() {
  const status = document.getElementById("status");
  try {
    [assets] = await Promise.all([
      loadAssets(),
      loadTreeAsset()
    ]);
  } catch (error) {
    status.textContent = error?.message || "โหลดเกมไม่สำเร็จ";
    console.error(error);
    return;
  }

  status.remove();
  resize();
  centreOnZone();
  buildZoneBar();
  requestAnimationFrame(frame);
}

start();
