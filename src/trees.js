import { tileToWorld } from "./iso.js";
import { currentZone, zoneSize } from "./world.js";

const TREE_PARTS = [
  "assets/objects/tree_oak.part0",
  "assets/objects/tree_oak.part1",
  "assets/objects/tree_oak.part2"
];

const INTERIOR_TREES = {
  farm: [
    { i: 8, j: 9, scale: 0.92 },
    { i: 12, j: 28, scale: 0.82 },
    { i: 29, j: 8, scale: 0.78 }
  ],
  forest: [
    { i: 8, j: 10, scale: 1.00 },
    { i: 11, j: 17, scale: 0.90 },
    { i: 15, j: 29, scale: 0.96 },
    { i: 23, j: 11, scale: 0.88 },
    { i: 28, j: 25, scale: 1.02 },
    { i: 35, j: 16, scale: 0.92 }
  ],
  village: [
    { i: 7, j: 8, scale: 0.72 },
    { i: 27, j: 29, scale: 0.76 }
  ]
};

let treeImage = null;
const borderCache = new Map();

function isExitGap(n, max) {
  const middle = Math.floor((max - 1) / 2);
  return Math.abs(n - middle) <= 2;
}

function makeBorderTrees(zoneId) {
  const { h, w } = zoneSize();
  const step = zoneId === "forest" ? 3 : zoneId === "village" ? 6 : 4;
  const trees = [];

  for (let j = 2; j < w - 2; j += step) {
    if (!isExitGap(j, w)) {
      trees.push({ i: 1, j, scale: zoneId === "forest" ? 0.94 : 0.80 });
      trees.push({ i: h - 2, j, scale: zoneId === "forest" ? 0.90 : 0.76 });
    }
  }
  for (let i = 2; i < h - 2; i += step) {
    if (!isExitGap(i, h)) {
      trees.push({ i, j: 1, scale: zoneId === "forest" ? 0.92 : 0.78 });
      trees.push({ i, j: w - 2, scale: zoneId === "forest" ? 0.96 : 0.80 });
    }
  }
  return trees;
}

function borderTrees(zoneId) {
  const { h, w } = zoneSize();
  const key = `${zoneId}:${h}x${w}`;
  if (!borderCache.has(key)) borderCache.set(key, makeBorderTrees(zoneId));
  return borderCache.get(key);
}

export async function loadTreeAsset() {
  const parts = await Promise.all(TREE_PARTS.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`โหลดต้นไม้ไม่ได้: ${url}`);
    return (await response.text()).trim();
  }));

  const image = new Image();
  image.src = `data:image/webp;base64,${parts.join("")}`;
  if (image.decode) await image.decode();
  else await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });
  treeImage = image;
}

export function drawTrees(ctx) {
  if (!treeImage) return;

  const zone = currentZone();
  const trees = [
    ...borderTrees(zone.id),
    ...(INTERIOR_TREES[zone.id] ?? [])
  ].sort((a, b) => (a.i + a.j) - (b.i + b.j));

  for (const tree of trees) {
    const p = tileToWorld(tree.i, tree.j);
    const w = 520 * tree.scale;
    const h = 480 * tree.scale;
    const x = p.x + 96 - w / 2;
    const y = p.y + 48 - h + 34 * tree.scale;

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#142614";
    ctx.beginPath();
    ctx.ellipse(p.x + 96, p.y + 67, 50 * tree.scale, 20 * tree.scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.drawImage(treeImage, x, y, w, h);
  }
}
