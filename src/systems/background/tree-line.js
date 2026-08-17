import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * A ring of scattered trees in the middle ground, between the farm edge and
 * the first mountain band.
 *
 * That stretch — roughly 38 m to 166 m — was 128 metres of flat ground with
 * nothing on it, and it is the part of the outer world that fills the most
 * screen: a 12 m object at 60 m covers 30% of the screen height, at 180 m only
 * 10%. Every piece of scenery in the project was sitting past 166 m, so the
 * nearest and largest band was also the emptiest one. That reads as "โล่ง".
 *
 * Three decisions carry this file.
 *
 * ## 1. Sectors, because one InstancedMesh cannot be culled
 *
 * `editor/instanced-pool.js` already documents the trap: an InstancedMesh's
 * bounding sphere covers every instance, so a single mesh holding the whole
 * ring is never outside the frustum and every tree is submitted every frame.
 * A portrait phone sees about 18 degrees of horizontal FOV — 5% of the ring —
 * so that would waste 95% of the work.
 *
 * The ring is therefore split into `sectors` wedges, each with its own meshes
 * and its own tight bounding sphere. Two or three wedges are in frustum at a
 * time and the rest cost nothing but a sphere test.
 *
 * ## 2. Generated from a seed, never saved
 *
 * This is scenery, like `mountainBackdrop.chunks`, not something the player
 * owns. It must not go through the builder or the layout store: a few hundred
 * trees in the save file would bloat every autosave, and the player would be
 * able to delete the horizon by accident.
 *
 * ## 3. Nothing shorter than `minHeight`
 *
 * A 0.69 m bush is about 8 pixels tall at 60 m. It cannot be seen and it is
 * not free, so the catalog's own `sourceHeight` is used to refuse it rather
 * than leaving that judgement to whoever edits the config next.
 *
 * Wind needs no special handling: `wind-material.js` derives its phase from
 * `modelMatrix * instanceMatrix * position`, so instanced scenery sways with
 * the right per-tree offset for free.
 */

const TAU = Math.PI * 2;

/** Deterministic PRNG — the same seed must give the same forest every boot. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Instanceable meshes inside one loaded variant.
 *
 * Mirrors `instanced-pool.js`: a mesh with an array material would need
 * per-group draws and defeats the point, so the variant is skipped instead of
 * half-supported.
 */
function collectParts(model) {
  const parts = [];
  let usable = true;
  model.updateMatrixWorld(true);
  model.traverse((node) => {
    if (!node?.isMesh || !node.geometry || !node.material) return;
    if (Array.isArray(node.material)) usable = false;
    parts.push({ geometry: node.geometry, material: node.material, local: node.matrixWorld.clone() });
  });
  return usable && parts.length ? parts : null;
}

/**
 * Clumped scatter across an annulus.
 *
 * Uniform density reads as an orchard, not a tree line, and costs more for a
 * worse silhouette. Trees are grown around a handful of clump centres with a
 * falloff, which leaves the gaps that make a treeline look like one.
 */
function scatter({ random, count, innerRadius, outerRadius, clumps, clumpSpread }) {
  const centres = Array.from({ length: Math.max(1, clumps) }, () => ({
    angle: random() * TAU,
    radius: innerRadius + (outerRadius - innerRadius) * random(),
  }));

  const points = [];
  for (let i = 0; i < count; i += 1) {
    const centre = centres[Math.floor(random() * centres.length)];
    // Two uniforms approximate a bell, which is what keeps clumps soft-edged.
    const spreadAngle = (random() + random() - 1) * clumpSpread;
    const spreadRadius = (random() + random() - 1) * (outerRadius - innerRadius) * 0.55;
    const radius = centre.radius + spreadRadius;
    if (radius < innerRadius || radius > outerRadius) continue;
    const angle = centre.angle + spreadAngle;
    points.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      angle: ((angle % TAU) + TAU) % TAU,
      rotation: random() * TAU,
      scale: 1,
      random: random(),
    });
  }
  return points;
}

/**
 * @param assets      catalog entries keyed by id (NATURE_V2_ASSETS)
 * @param heightAt    surface height of the outer world at a world point
 * @param onModel     optional hook, called with the loaded variant before its
 *                    materials are collected — this is where wind patches them
 */
export async function createTreeLine({
  config = {},
  assets = {},
  heightAt = () => 0,
  anisotropy = 1,
  onModel = null,
} = {}) {
  const group = new THREE.Group();
  group.name = "TreeLine";
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  let disposed = false;
  const stats = { trees: 0, meshes: 0, triangles: 0, skipped: [] };

  // Retained across rebuilds so tuning a slider never re-downloads a GLB.
  let loadedPicks = null;
  let live = { ...config };
  let heightSampler = heightAt;

  const controller = {
    group,
    stats,
    /**
     * Re-scatter with new numbers, reusing the geometry already in memory.
     *
     * The horizon panel drives this while the player drags a slider, so it
     * must not touch the network. `heightAt` comes back in because moving the
     * ground dials changes the surface these trees are standing on.
     */
    rebuild(next = {}, nextHeightAt = null) {
      live = { ...live, ...next };
      if (nextHeightAt) heightSampler = nextHeightAt;
      if (loadedPicks) place();
    },
    dispose() {
      disposed = true;
      group.clear();
      for (const texture of textures) texture.dispose?.();
      for (const material of materials) material.dispose?.();
      for (const geometry of geometries) geometry.dispose?.();
      textures.clear();
      materials.clear();
      geometries.clear();
    },
  };

  const entries = Array.isArray(config.items) ? config.items : [];
  if (config.enabled === false || entries.length === 0) return controller;

  // Everything that can move at runtime is read inside `place()` from `live`.
  // Only the height gate is fixed here: which variants are *eligible* is
  // decided once, because it depends on the catalog rather than on a slider.
  const minHeight = Math.max(0, Number(config.minHeight) ?? 1.5);

  // Resolve the catalog entries first so a bad id fails loudly at boot rather
  // than as a missing tree nobody notices.
  const picks = [];
  for (const entry of entries) {
    const asset = assets[entry.id];
    if (!asset) {
      stats.skipped.push(`${entry.id}: not in the nature catalog`);
      continue;
    }
    if (asset.sourceHeight < minHeight) {
      // The rule from the header: too short to resolve at this distance.
      stats.skipped.push(
        `${entry.id}: ${asset.sourceHeight} m is under minHeight ${minHeight} m`
      );
      continue;
    }
    picks.push({ asset, weight: Math.max(0, Number(entry.weight) || 1), entry });
  }
  if (!picks.length) return controller;

  const totalWeight = picks.reduce((sum, pick) => sum + pick.weight, 0);

  // Load in the background. Middle-ground scenery must never hold up the boot.
  const loader = new GLTFLoader();
  const files = [...new Set(picks.map((pick) => pick.asset.modelPath))];
  Promise.all(files.map((path) => loader.loadAsync(path).then(
    (gltf) => [path, gltf],
    (error) => [path, null, error]
  ))).then((loaded) => {
    if (disposed) return;
    const scenes = new Map(loaded.map(([path, gltf]) => [path, gltf?.scene ?? null]));

    for (const pick of picks) {
      const scene = scenes.get(pick.asset.modelPath);
      const source = pick.asset.nodeName ? scene?.getObjectByName(pick.asset.nodeName) : scene;
      if (!source) {
        stats.skipped.push(`${pick.asset.id}: ${pick.asset.nodeName} missing from the GLB`);
        pick.parts = null;
        continue;
      }
      const model = source.clone(true);
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      model.scale.setScalar(1);
      // Wind patches the shared material, so it has to run before the parts
      // are collected. `wind-material.js` reads the phase from
      // `modelMatrix * instanceMatrix * position`, so one shared material
      // sways every instance with its own offset — instancing needs no
      // special case here.
      onModel?.(model, pick.asset);
      const parts = collectParts(model);
      pick.parts = parts;
      if (!parts) {
        stats.skipped.push(`${pick.asset.id}: array material, not instanceable`);
        continue;
      }
      for (const part of parts) {
        geometries.add(part.geometry);
        materials.add(part.material);
        part.material.fog = true;
        if (part.material.map) {
          part.material.map.anisotropy = Math.min(2, anisotropy);
          textures.add(part.material.map);
        }
        const index = part.geometry.index;
        part.triangles = index ? index.count / 3 : part.geometry.attributes.position.count / 3;
      }
    }

    loadedPicks = picks.filter((pick) => pick.parts);
    if (!loadedPicks.length) return;
    place();
  }).catch((error) => {
    group.userData.loadError = String(error?.message ?? error ?? "unknown error");
    console.warn("Tree line unavailable", error);
  });

  function place() {
    const usable = loadedPicks;
    const innerRadius = Math.max(1, Number(live.innerRadius) || 52);
    const outerRadius = Math.max(innerRadius + 1, Number(live.outerRadius) || 92);
    const sectors = Math.max(4, Math.round(Number(live.sectors) || 16));
    const count = Math.max(0, Math.round(Number(live.count) || 0));
    const seed = Number(live.seed) || 1;
    const sink = Number(live.sink) || 0.15;
    const heightAt = heightSampler;

    // A rebuild replaces the band wholesale; the geometry and materials are
    // shared with the retained picks, so only the InstancedMeshes are dropped.
    group.clear();
    stats.trees = 0;
    stats.meshes = 0;
    stats.triangles = 0;
    if (live.enabled === false || count === 0) {
      stats.sectors = 0;
      return;
    }

    const random = mulberry32(seed);
    const points = scatter({
      random,
      count,
      innerRadius,
      outerRadius,
      clumps: Math.round(Number(live.clumps) || 9),
      clumpSpread: Number(live.clumpSpread) || 0.28,
    });

    const scaleJitter = Math.max(0, Number(live.scaleJitter) || 0.25);
    // sector -> pick -> instances
    const buckets = new Map();
    for (const point of points) {
      let roll = random() * totalWeight;
      let chosen = usable[usable.length - 1];
      for (const pick of usable) {
        roll -= pick.weight;
        if (roll <= 0) { chosen = pick; break; }
      }
      if (!chosen.parts) continue;
      const sector = Math.floor(point.angle / TAU * sectors) % sectors;
      const key = `${sector}|${chosen.asset.id}`;
      if (!buckets.has(key)) buckets.set(key, { sector, pick: chosen, points: [] });
      point.scale = 1 + (point.random - 0.5) * 2 * scaleJitter;
      buckets.get(key).points.push(point);
    }

    const matrix = new THREE.Matrix4();
    const instance = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    // One Group per *sector*, holding every variant that landed in it — not
    // one per (sector, variant). Both cull the same, but the wedge is the unit
    // the design is about, and `group.children.length` should be readable as
    // "how many wedges exist" rather than a number that moves whenever an
    // entry is added to the config.
    const sectorGroups = new Map();
    const sectorGroup = (index) => {
      if (!sectorGroups.has(index)) {
        const next = new THREE.Group();
        next.name = `TreeLineSector${index}`;
        sectorGroups.set(index, next);
        group.add(next);
      }
      return sectorGroups.get(index);
    };

    for (const bucket of buckets.values()) {
      const parent = sectorGroup(bucket.sector);
      for (const part of bucket.pick.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, bucket.points.length);
        mesh.name = `${parent.name}:${bucket.pick.asset.id}`;
        // Scenery, exactly like the mountain bands and the floating islands.
        // Shadow casting here would double the draw count for silhouettes the
        // player cannot resolve at this distance anyway.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.matrixAutoUpdate = false;
        // The whole point of the sector split: a tight sphere per wedge.
        mesh.frustumCulled = true;

        bucket.points.forEach((point, i) => {
          position.set(point.x, heightAt(point.x, point.z) - sink, point.z);
          quaternion.setFromAxisAngle(up, point.rotation);
          scaleVec.setScalar(point.scale);
          instance.compose(position, quaternion, scaleVec);
          matrix.multiplyMatrices(instance, part.local);
          mesh.setMatrixAt(i, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        parent.add(mesh);
        stats.meshes += 1;
        stats.triangles += (part.triangles ?? 0) * bucket.points.length;
      }
      stats.trees += bucket.points.length;
    }
    stats.sectors = sectorGroups.size;

    if (stats.skipped.length) {
      console.warn("Tree line skipped some entries:", stats.skipped);
    }
  }

  return controller;
}
