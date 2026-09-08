import * as THREE from "three";
import { createInstancedPools } from "../editor/instanced-pool.js";
import {
  createWoodlandPlan, woodlandItemAllowed, woodlandGroundStrokes,
} from "./woodland-layout.js";

/** A small dithered window through foreground trees keeps Liora readable.
 * Shared per-asset materials keep batching; the shadow pass stays intact. */
export function applyWoodlandCutaway(material, uniforms) {
  if (!material.isMeshStandardMaterial || material.userData.woodlandCutaway) return;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  const key = previousKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.woodlandFocus = uniforms.focus;
    shader.uniforms.woodlandRadius = uniforms.radius;
    shader.uniforms.woodlandCutaway = uniforms.strength;
    shader.fragmentShader = `uniform vec3 woodlandFocus;
uniform float woodlandRadius;
uniform float woodlandCutaway;
${shader.fragmentShader}`.replace("#include <clipping_planes_fragment>", `
#include <clipping_planes_fragment>
float woodlandAlong = dot(-vViewPosition, woodlandFocus) / max(dot(woodlandFocus, woodlandFocus), 0.001);
float woodlandDistance = length(-vViewPosition - woodlandFocus * woodlandAlong);
if (woodlandAlong > 0.0 && woodlandAlong < 0.97) {
  float woodlandHole = 1.0 - smoothstep(woodlandRadius * 0.55, woodlandRadius, woodlandDistance);
  float woodlandDither = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (woodlandDither < woodlandHole * woodlandCutaway) discard;
}`);
  };
  material.customProgramCacheKey = () => `${key}|woodland-cutaway-v1`;
  material.userData.woodlandCutaway = true;
  material.needsUpdate = true;
}

/** Uses the production GLB loader, wind and plant pools. Source GLBs remain
 * shared with Builder; only this environment owns the generated placements. */
export async function createWoodland({
  scene, config, mapId, assets, loader, paint,
  heightAt = () => 0, waterLevel = -Infinity,
  blockers = [], quality = {}, prepareModel = () => {}, onCollidersChange = () => {},
}) {
  if (!config?.enabled || !config.mapIds.includes(mapId)) return null;
  const group = new THREE.Group();
  group.name = "WalkableWoodland";
  const pools = createInstancedPools({ scene: group });
  const plan = createWoodlandPlan(config, assets);
  const templates = new Map();
  const holders = new Map();
  const ownedMaterials = new Set();
  const failedAssets = [];
  const focus = new THREE.Vector3();
  const uniforms = {
    focus: { value: focus }, radius: { value: config.cutawayRadius }, strength: { value: 0 },
  };
  let currentBlockers = blockers;
  let currentQuality = quality;
  let colliders = [];
  let activeItems = [];
  let groundSignature = "";
  let strokeSignature = "";
  let disposed = false;

  // One fetch per shared file, one measured template per variant. Wind is
  // shared; each tree variant gets one owned cutaway material, never one per
  // placed tree. Recreating this grove cannot inherit an old camera uniform.
  await Promise.all([...new Set(plan.items.map((item) => item.assetId))].map(async (assetId) => {
    try {
      const asset = assets[assetId];
      const model = await loader.load(assetId);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model, true);
      const sourceHeight = box.max.y - box.min.y;
      if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) throw new Error("Empty forest model");
      const metrics = { scaleNormalization: asset.sourceHeight / sourceHeight, baseOffset: box.min.y };
      prepareModel(model, asset);
      const isTree = plan.items.some((item) => item.assetId === assetId && item.kind === "tree");
      if (isTree) model.traverse((node) => {
        if (!node.isMesh) return;
        const source = Array.isArray(node.material) ? node.material : [node.material];
        const decorated = source.map((material) => {
          const next = material.clone();
          next.onBeforeCompile = material.onBeforeCompile;
          next.customProgramCacheKey = material.customProgramCacheKey.bind(material);
          ownedMaterials.add(next);
          applyWoodlandCutaway(next, uniforms);
          return next;
        });
        node.material = Array.isArray(node.material) ? decorated : decorated[0];
      });
      const instanced = asset.instanced && pools.ensure(assetId, model, metrics);
      templates.set(assetId, { model, metrics, instanced });
    } catch (error) {
      failedAssets.push(assetId);
      console.warn(`Woodland asset unavailable: ${assetId}`, error);
    }
  }));

  for (const item of plan.items) {
    const template = templates.get(item.assetId);
    if (!template || template.instanced) continue;
    const holder = new THREE.Group();
    holder.name = item.id;
    const model = template.model.clone(true);
    // Object3D.clone does not copy customDepthMaterial. Preserve the wind
    // shadow hooks from the prepared template without cloning any material.
    const sourceMeshes = [];
    template.model.traverse((node) => { if (node.isMesh) sourceMeshes.push(node); });
    let meshIndex = 0;
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.customDepthMaterial = sourceMeshes[meshIndex++]?.customDepthMaterial;
    });
    holder.add(model);
    group.add(holder);
    holders.set(item.id, holder);
  }

  function refresh({ groundChanged = false } = {}) {
    if (disposed) return;
    activeItems = [];
    colliders = [];
    const density = config.plantDensity[currentQuality.id] ?? config.plantDensity.medium;
    for (const item of plan.items) {
      const template = templates.get(item.assetId);
      if (!template) continue;
      const allowed = (item.kind !== "plant" || item.densityRank <= density)
        && woodlandItemAllowed(item, { config, blockers: currentBlockers, heightAt, waterLevel });
      const height = heightAt(item.x, item.z);
      if (template.instanced) {
        if (!allowed) pools.remove(item.id);
        else if (!pools.holds(item.id)) pools.add(item, height);
        else if (groundChanged) pools.update(item, height);
      } else {
        const holder = holders.get(item.id);
        holder.visible = allowed;
        if (allowed) {
          const scale = item.scale * template.metrics.scaleNormalization;
          holder.position.set(item.x, height - template.metrics.baseOffset * scale, item.z);
          holder.rotation.y = item.rotation;
          holder.scale.setScalar(scale);
        }
      }
      if (!allowed) continue;
      activeItems.push(item);
      if (item.radius > 0) colliders.push({ id: item.id, x: item.x, z: item.z, radius: item.radius });
    }
    const signature = activeItems.filter((item) => item.kind === "tree").map((item) => item.id).join(",")
      + JSON.stringify(currentBlockers);
    if (signature !== groundSignature || groundChanged) {
      groundSignature = signature;
      const strokes = woodlandGroundStrokes(plan, activeItems, config).filter(([x, z, radius]) =>
        heightAt(x, z) >= waterLevel + config.waterClearance
        && !currentBlockers.some((area) => Math.hypot(x - area.x, z - area.z) < area.radius + radius * 0.5));
      const nextStrokeSignature = JSON.stringify(strokes);
      if (nextStrokeSignature !== strokeSignature) {
        strokeSignature = nextStrokeSignature;
        paint.setAuthoredStrokes(strokes);
      }
    }
    onCollidersChange(colliders);
  }

  // Add the completed grove atomically, so partially loaded trees never create
  // invisible colliders. An unavailable variant simply leaves a walkable gap.
  refresh({ groundChanged: true });
  scene.add(group);
  return {
    group,
    get colliders() { return colliders; },
    get items() { return activeItems; },
    get stats() {
      return {
        trees: activeItems.filter((item) => item.kind === "tree").length,
        rocks: activeItems.filter((item) => item.kind === "rock").length,
        plants: activeItems.filter((item) => item.kind === "plant").length,
        colliders: colliders.length, plantDrawCalls: pools.stats.drawCalls,
        failedAssets: [...failedAssets],
      };
    },
    setBlockers(next) { currentBlockers = next; refresh(); },
    refreshTerrain() { refresh({ groundChanged: true }); },
    setQuality(preset) { currentQuality = preset; refresh(); },
    update(delta, { camera, position, active = true } = {}) {
      if (disposed || !camera || !position) return;
      camera.updateMatrixWorld();
      focus.set(position.x, position.y + 0.85, position.z).applyMatrix4(camera.matrixWorldInverse);
      uniforms.strength.value = active ? config.cutawayStrength : 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pools.dispose();
      for (const material of ownedMaterials) material.dispose();
      ownedMaterials.clear();
      holders.clear();
      templates.clear();
      colliders = [];
      onCollidersChange(colliders);
      paint.setAuthoredStrokes([]);
      scene.remove(group);
      group.clear();
    },
  };
}
