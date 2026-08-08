import { tileToWorld } from "./iso.js";
import { currentZone } from "./world.js";

const TREE_PARTS = [
  "assets/objects/tree_oak.part0",
  "assets/objects/tree_oak.part1",
  "assets/objects/tree_oak.part2",
];

const TREE_LAYOUT = {
  farm: [
    { i: 8, j: 9, scale: 0.92 },
    { i: 12, j: 28, scale: 0.82 },
    { i: 29, j: 8, scale: 0.76 },
  ],
  forest: [
    { i: 8, j: 10, scale: 1.0 },
    { i: 11, j: 17, scale: 0.88 },
    { i: 15, j: 29, scale: 0.94 },
    { i: 23, j: 11, scale: 0.84 },
    { i: 28, j: 25, scale: 1.02 },
    { i: 35, j: 16, scale: 0.9 },
  ],
  village: [
    { i: 7, j: 8, scale: 0.68 },
    { i: 27, j: 29, scale: 0.72 },
  ],
};

let treeImage = null;

export async function loadTreeAsset() {
  const parts = await Promise.all(TREE_PARTS.map((url) => fetch(url).then((r) => {
    if (!r.ok) throw new Error(`โหลดต้นไม้ไม่ได้: ${url}`);
    return r.text();
  })));

  const image = new Image();
  image.src = `data:image/webp;base64,${parts.join("")}`;
  await image.decode();
  treeImage = image;
}

export function drawTrees(ctx) {
  if (!treeImage) return;
  const zone = currentZone();
  const trees = TREE_LAYOUT[zone.id] ?? [];

  for (const tree of trees) {
    const p = tileToWorld(tree.i, tree.j);
    const w = 256 * tree.scale;
    const h = 237 * tree.scale;
    const x = p.x + 96 - w / 2;
    const y = p.y + 48 - h + 24 * tree.scale;
    ctx.drawImage(treeImage, x, y, w, h);
  }
}
