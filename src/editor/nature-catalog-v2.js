// Generated from assets/models/world-v2/nature/nature-manifest.json.
import { CONFIG } from "../config.js";

export const NATURE_V2_CATEGORY = "nature";
const ROOT = "./assets/models/world-v2/nature";

function item({ id, label, icon, file, nodeName, height, width, tris, kind }) {
  const isTree = kind === "tree";
  const isRock = kind === "rock";
  const footprintRadius = +(Math.max(0.12, width * (isTree ? 0.45 : isRock ? 0.48 : 0.42))).toFixed(3);
  const walkRadius = isTree ? 0.48 : isRock ? +(Math.max(0.22, width * 0.38)).toFixed(3) : 0;
  // Authored height is the real world height here, so the shadow rule reads
  // straight off it. See CONFIG.shadows.minCasterHeight.
  const castShadow = height >= CONFIG.shadows.minCasterHeight;
  // Plants are scattered by the hundred and are 620 tris at worst, so they are
  // worth batching into one draw call per type. Trees and rocks are placed in
  // tens and are far heavier, so they keep per-object culling instead. This is
  // deliberately a separate judgement from the shadow rule above, not the same
  // number twice — see editor/instanced-pool.js.
  const instanced = kind === "plant";
  return Object.freeze({ id, label, icon, category: NATURE_V2_CATEGORY, modelPath: `${ROOT}/${file}`, nodeName,
    footprintRadius, blockRadius: 0, walkRadius, defaultScale: 1, minScale: 0.6, maxScale: 1.8, scaleStep: 0.05,
    sizeAxis: "height", sizeInPlayers: +(height / 1.7).toFixed(4), terrainSnap: true, maxGroundSlope: null, groundProbeRadius: null,
    sourceHeight: height, sourceWidth: width, tris, castShadow, instanced, worldV2: true });
}

export const NATURE_V2_ASSETS = Object.freeze({
  "v2-birchtree-3": item({ id: "v2-birchtree-3", label: "V2 เบิร์ช 3", icon: "🌳", file: "birch-trees.glb", nodeName: "BirchTree_3", height: 5.75, width: 3.43, tris: 6818, kind: "tree" }),
  "v2-birchtree-5": item({ id: "v2-birchtree-5", label: "V2 เบิร์ช 5", icon: "🌳", file: "birch-trees.glb", nodeName: "BirchTree_5", height: 5.52, width: 3.58, tris: 4520, kind: "tree" }),
  "v2-birchtree-4": item({ id: "v2-birchtree-4", label: "V2 เบิร์ช 4", icon: "🌳", file: "birch-trees.glb", nodeName: "BirchTree_4", height: 4.21, width: 2.78, tris: 3562, kind: "tree" }),
  "v2-birchtree-1": item({ id: "v2-birchtree-1", label: "V2 เบิร์ช 1", icon: "🌳", file: "birch-trees.glb", nodeName: "BirchTree_1", height: 5.45, width: 2.71, tris: 4598, kind: "tree" }),
  "v2-birchtree-2": item({ id: "v2-birchtree-2", label: "V2 เบิร์ช 2", icon: "🌳", file: "birch-trees.glb", nodeName: "BirchTree_2", height: 7.57, width: 3.35, tris: 7660, kind: "tree" }),
  "v2-plant-1": item({ id: "v2-plant-1", label: "V2 พุ่ม 1", icon: "🌿", file: "bushes.glb", nodeName: "Plant_1", height: 0.69, width: 1.24, tris: 420, kind: "plant" }),
  "v2-bush": item({ id: "v2-bush", label: "V2 พุ่ม 2", icon: "🌿", file: "bushes.glb", nodeName: "Bush", height: 0.69, width: 1.09, tris: 400, kind: "plant" }),
  "v2-bush-flowers": item({ id: "v2-bush-flowers", label: "V2 พุ่ม 3", icon: "🌿", file: "bushes.glb", nodeName: "Bush_Flowers", height: 0.76, width: 1.11, tris: 478, kind: "plant" }),
  "v2-deadtree-10": item({ id: "v2-deadtree-10", label: "V2 ต้นไม้แห้ง 10", icon: "🪵", file: "dead-trees-2.glb", nodeName: "DeadTree_10", height: 7.13, width: 5.46, tris: 3208, kind: "tree" }),
  "v2-deadtree-9": item({ id: "v2-deadtree-9", label: "V2 ต้นไม้แห้ง 9", icon: "🪵", file: "dead-trees-2.glb", nodeName: "DeadTree_9", height: 3.3, width: 2.06, tris: 824, kind: "tree" }),
  "v2-deadtree-8": item({ id: "v2-deadtree-8", label: "V2 ต้นไม้แห้ง 8", icon: "🪵", file: "dead-trees-2.glb", nodeName: "DeadTree_8", height: 6.28, width: 8.17, tris: 4944, kind: "tree" }),
  "v2-deadtree-7": item({ id: "v2-deadtree-7", label: "V2 ต้นไม้แห้ง 7", icon: "🪵", file: "dead-trees-2.glb", nodeName: "DeadTree_7", height: 6.31, width: 6.14, tris: 3504, kind: "tree" }),
  "v2-deadtree-6": item({ id: "v2-deadtree-6", label: "V2 ต้นไม้แห้ง 6", icon: "🪵", file: "dead-trees-2.glb", nodeName: "DeadTree_6", height: 6.41, width: 5.41, tris: 2984, kind: "tree" }),
  "v2-deadtree-5": item({ id: "v2-deadtree-5", label: "V2 ต้นไม้แห้ง 5", icon: "🪵", file: "dead-trees-1.glb", nodeName: "DeadTree_5", height: 2.6, width: 1.53, tris: 1360, kind: "tree" }),
  "v2-deadtree-4": item({ id: "v2-deadtree-4", label: "V2 ต้นไม้แห้ง 4", icon: "🪵", file: "dead-trees-1.glb", nodeName: "DeadTree_4", height: 4.61, width: 4.85, tris: 3528, kind: "tree" }),
  "v2-deadtree-3": item({ id: "v2-deadtree-3", label: "V2 ต้นไม้แห้ง 3", icon: "🪵", file: "dead-trees-1.glb", nodeName: "DeadTree_3", height: 4.96, width: 4.22, tris: 4928, kind: "tree" }),
  "v2-deadtree-2": item({ id: "v2-deadtree-2", label: "V2 ต้นไม้แห้ง 2", icon: "🪵", file: "dead-trees-1.glb", nodeName: "DeadTree_2", height: 6.2, width: 3.42, tris: 5344, kind: "tree" }),
  "v2-deadtree-1": item({ id: "v2-deadtree-1", label: "V2 ต้นไม้แห้ง 1", icon: "🪵", file: "dead-trees-1.glb", nodeName: "DeadTree_1", height: 6.2, width: 3.09, tris: 4792, kind: "tree" }),
  "v2-petals-1": item({ id: "v2-petals-1", label: "V2 พุ่มดอกไม้ 1", icon: "🌺", file: "flower-bushes.glb", nodeName: "Petals_1", height: 0.63, width: 0.67, tris: 90, kind: "plant" }),
  "v2-plant-2": item({ id: "v2-plant-2", label: "V2 พุ่มดอกไม้ 2", icon: "🌺", file: "flower-bushes.glb", nodeName: "Plant_2", height: 0.55, width: 1.47, tris: 160, kind: "plant" }),
  "v2-plant-flowers": item({ id: "v2-plant-flowers", label: "V2 พุ่มดอกไม้ 3", icon: "🌺", file: "flower-bushes.glb", nodeName: "Plant_Flowers", height: 1.18, width: 1.53, tris: 330, kind: "plant" }),
  "v2-flower-5-clump": item({ id: "v2-flower-5-clump", label: "V2 ดอกไม้ 5 กอ", icon: "🌼", file: "flowers.glb", nodeName: "Flower_5_Clump", height: 0.45, width: 0.43, tris: 136, kind: "plant" }),
  "v2-flower-4-clump": item({ id: "v2-flower-4-clump", label: "V2 ดอกไม้ 4 กอ", icon: "🌼", file: "flowers.glb", nodeName: "Flower_4_Clump", height: 0.45, width: 0.43, tris: 136, kind: "plant" }),
  "v2-flower-3-clump": item({ id: "v2-flower-3-clump", label: "V2 ดอกไม้ 3 กอ", icon: "🌼", file: "flowers.glb", nodeName: "Flower_3_Clump", height: 0.45, width: 0.43, tris: 136, kind: "plant" }),
  "v2-flower-2-clump": item({ id: "v2-flower-2-clump", label: "V2 ดอกไม้ 2 กอ", icon: "🌼", file: "flowers.glb", nodeName: "Flower_2_Clump", height: 0.45, width: 0.43, tris: 136, kind: "plant" }),
  "v2-flower-2": item({ id: "v2-flower-2", label: "V2 ดอกไม้ 2", icon: "🌼", file: "flowers.glb", nodeName: "Flower_2", height: 0.36, width: 0.25, tris: 34, kind: "plant" }),
  "v2-flower-1-clump": item({ id: "v2-flower-1-clump", label: "V2 ดอกไม้ 1 กอ", icon: "🌼", file: "flowers.glb", nodeName: "Flower_1_Clump", height: 0.67, width: 0.47, tris: 620, kind: "plant" }),
  "v2-flower-1": item({ id: "v2-flower-1", label: "V2 ดอกไม้ 1", icon: "🌼", file: "flowers.glb", nodeName: "Flower_1", height: 0.49, width: 0.27, tris: 162, kind: "plant" }),
  "v2-grass-large-extruded": item({ id: "v2-grass-large-extruded", label: "V2 หญ้า 1", icon: "🌾", file: "grass.glb", nodeName: "Grass_Large_Extruded", height: 0.51, width: 0.74, tris: 516, kind: "plant" }),
  "v2-grass-small": item({ id: "v2-grass-small", label: "V2 หญ้า 2", icon: "🌾", file: "grass.glb", nodeName: "Grass_Small", height: 0.39, width: 0.47, tris: 58, kind: "plant" }),
  "v2-mapletree-5": item({ id: "v2-mapletree-5", label: "V2 เมเปิล 5", icon: "🍁", file: "maple-trees.glb", nodeName: "MapleTree_5", height: 7.28, width: 7.01, tris: 4504, kind: "tree" }),
  "v2-mapletree-4": item({ id: "v2-mapletree-4", label: "V2 เมเปิล 4", icon: "🍁", file: "maple-trees.glb", nodeName: "MapleTree_4", height: 3.59, width: 2.77, tris: 1256, kind: "tree" }),
  "v2-mapletree-3": item({ id: "v2-mapletree-3", label: "V2 เมเปิล 3", icon: "🍁", file: "maple-trees.glb", nodeName: "MapleTree_3", height: 6.99, width: 8.98, tris: 6678, kind: "tree" }),
  "v2-mapletree-2": item({ id: "v2-mapletree-2", label: "V2 เมเปิล 2", icon: "🍁", file: "maple-trees.glb", nodeName: "MapleTree_2", height: 6.71, width: 6.7, tris: 4800, kind: "tree" }),
  "v2-mapletree-1": item({ id: "v2-mapletree-1", label: "V2 เมเปิล 1", icon: "🍁", file: "maple-trees.glb", nodeName: "MapleTree_1", height: 6.64, width: 6.23, tris: 3848, kind: "tree" }),
  "v2-palmtree-3": item({ id: "v2-palmtree-3", label: "V2 ปาล์ม 3", icon: "🌴", file: "palm-trees.glb", nodeName: "PalmTree_3", height: 4.67, width: 4.47, tris: 344, kind: "tree" }),
  "v2-palmtree-5": item({ id: "v2-palmtree-5", label: "V2 ปาล์ม 5", icon: "🌴", file: "palm-trees.glb", nodeName: "PalmTree_5", height: 1.8, width: 3.62, tris: 264, kind: "tree" }),
  "v2-palmtree-4": item({ id: "v2-palmtree-4", label: "V2 ปาล์ม 4", icon: "🌴", file: "palm-trees.glb", nodeName: "PalmTree_4", height: 3.65, width: 4.95, tris: 472, kind: "tree" }),
  "v2-palmtree-1": item({ id: "v2-palmtree-1", label: "V2 ปาล์ม 1", icon: "🌴", file: "palm-trees.glb", nodeName: "PalmTree_1", height: 5.1, width: 5.09, tris: 472, kind: "tree" }),
  "v2-palmtree-2": item({ id: "v2-palmtree-2", label: "V2 ปาล์ม 2", icon: "🌴", file: "palm-trees.glb", nodeName: "PalmTree_2", height: 5.28, width: 5.58, tris: 368, kind: "tree" }),
  "v2-pinetree-5": item({ id: "v2-pinetree-5", label: "V2 สน 5", icon: "🌲", file: "pine-trees.glb", nodeName: "PineTree_5", height: 4.3, width: 3.31, tris: 838, kind: "tree" }),
  "v2-pinetree-4": item({ id: "v2-pinetree-4", label: "V2 สน 4", icon: "🌲", file: "pine-trees.glb", nodeName: "PineTree_4", height: 4.48, width: 4.84, tris: 2686, kind: "tree" }),
  "v2-pinetree-3": item({ id: "v2-pinetree-3", label: "V2 สน 3", icon: "🌲", file: "pine-trees.glb", nodeName: "PineTree_3", height: 2.35, width: 1.76, tris: 1998, kind: "tree" }),
  "v2-pinetree-1": item({ id: "v2-pinetree-1", label: "V2 สน 1", icon: "🌲", file: "pine-trees.glb", nodeName: "PineTree_1", height: 4.5, width: 3.03, tris: 2128, kind: "tree" }),
  "v2-pinetree-2": item({ id: "v2-pinetree-2", label: "V2 สน 2", icon: "🌲", file: "pine-trees.glb", nodeName: "PineTree_2", height: 6.91, width: 3.28, tris: 2716, kind: "tree" }),
  "v2-rock-4": item({ id: "v2-rock-4", label: "V2 หิน 4", icon: "🪨", file: "rocks.glb", nodeName: "Rock_4", height: 2.15, width: 0.86, tris: 456, kind: "rock" }),
  "v2-rock-1": item({ id: "v2-rock-1", label: "V2 หิน 1", icon: "🪨", file: "rocks.glb", nodeName: "Rock_1", height: 1.08, width: 0.89, tris: 228, kind: "rock" }),
  "v2-rock-2": item({ id: "v2-rock-2", label: "V2 หิน 2", icon: "🪨", file: "rocks.glb", nodeName: "Rock_2", height: 1.12, width: 1.08, tris: 202, kind: "rock" }),
  "v2-rock-3": item({ id: "v2-rock-3", label: "V2 หิน 3", icon: "🪨", file: "rocks.glb", nodeName: "Rock_3", height: 1.31, width: 0.9, tris: 712, kind: "rock" }),
  "v2-rock-5": item({ id: "v2-rock-5", label: "V2 หิน 5", icon: "🪨", file: "rocks.glb", nodeName: "Rock_5", height: 1.69, width: 1.32, tris: 632, kind: "rock" }),
  "v2-normaltree-1": item({ id: "v2-normaltree-1", label: "V2 ต้นไม้ 1", icon: "🌳", file: "trees.glb", nodeName: "NormalTree_1", height: 6.87, width: 4.05, tris: 8520, kind: "tree" }),
  "v2-normaltree-2": item({ id: "v2-normaltree-2", label: "V2 ต้นไม้ 2", icon: "🌳", file: "trees.glb", nodeName: "NormalTree_2", height: 6.56, width: 4.55, tris: 8084, kind: "tree" }),
  "v2-normaltree-3": item({ id: "v2-normaltree-3", label: "V2 ต้นไม้ 3", icon: "🌳", file: "trees.glb", nodeName: "NormalTree_3", height: 5.28, width: 5.04, tris: 7096, kind: "tree" }),
  "v2-normaltree-4": item({ id: "v2-normaltree-4", label: "V2 ต้นไม้ 4", icon: "🌳", file: "trees.glb", nodeName: "NormalTree_4", height: 5.1, width: 5.67, tris: 6338, kind: "tree" }),
  "v2-normaltree-5": item({ id: "v2-normaltree-5", label: "V2 ต้นไม้ 5", icon: "🌳", file: "trees.glb", nodeName: "NormalTree_5", height: 2.98, width: 3.1, tris: 2182, kind: "tree" }),
});

export function getNatureV2Assets() { return Object.values(NATURE_V2_ASSETS); }
