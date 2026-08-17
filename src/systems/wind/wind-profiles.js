const PROFILES = Object.freeze({
  tree: Object.freeze({
    // base / mid / tip map to trunk / branches / leaves for a mixed tree mesh.
    // Tuned for a readable cozy breeze at the game's isometric phone scale.
    base: 0.07,
    mid: 0.34,
    tip: 0.76,
    flutter: 0.22,
    amplitude: 0.14,
    frequency: 0.82,
    spatial: 1.05,
    rootLock: 0.18,
    interaction: 0,
  }),
  bush: Object.freeze({
    base: 0.14,
    mid: 0.5,
    tip: 0.72,
    flutter: 0.22,
    amplitude: 0.22,
    frequency: 1.05,
    spatial: 1.2,
    rootLock: 0.2,
    interaction: 0.38,
  }),
  grass: Object.freeze({
    base: 0.05,
    mid: 0.74,
    tip: 1.0,
    flutter: 0.3,
    amplitude: 0.42,
    frequency: 1.35,
    spatial: 1.45,
    rootLock: 0.22,
    interaction: 0.72,
  }),
  flower: Object.freeze({
    base: 0.06,
    mid: 0.56,
    tip: 0.78,
    flutter: 0.18,
    amplitude: 0.28,
    frequency: 1.02,
    spatial: 1.28,
    rootLock: 0.2,
    interaction: 0.62,
  }),
});

const TRUNK = /(trunk|bark|wood|stem)/i;
const BRANCH = /(branch|twig)/i;
const LEAF = /(leaf|leaves|foliage|needle|frond)/i;
const TREE_FILE = /(birch-trees|dead-trees-[12]|maple-trees|palm-trees|pine-trees|trees)\.glb$/i;

export function getWindProfile(name) {
  return PROFILES[name] ?? null;
}

/**
 * Mesh names are more specific than a shared material name (for example a
 * Branch mesh may still use a generic Wood material), so explicit mesh roles
 * win before material-name hints. Unknown meshes intentionally stay `mixed`
 * and use the shader's height layering.
 */
export function classifyTreePart(mesh, material) {
  const meshName = mesh?.name ?? "";
  const materialName = material?.name ?? "";
  if (LEAF.test(meshName)) return "leaf";
  if (BRANCH.test(meshName)) return "branch";
  if (TRUNK.test(meshName)) return "trunk";
  if (LEAF.test(materialName)) return "leaf";
  if (BRANCH.test(materialName)) return "branch";
  if (TRUNK.test(materialName)) return "trunk";
  return "mixed";
}

export function getPartWeights(profileName, part = "mixed", { isTouch = false } = {}) {
  const profile = getWindProfile(profileName);
  if (!profile) return null;

  let base = profile.base;
  let mid = profile.mid;
  let tip = profile.tip;
  let flutter = profile.flutter;
  let rootLock = profile.rootLock;

  if (profileName === "tree") {
    if (part === "trunk") {
      mid *= 0.16;
      tip = 0;
      flutter = 0;
    } else if (part === "branch") {
      base *= 0.2;
      tip *= 0.28;
      flutter *= 0.2;
      rootLock = 0.06;
    } else if (part === "leaf") {
      base = 0;
      mid *= 0.38;
      rootLock = 0.025;
    }
  }

  // Keep the large sway identical on touch devices. Only trim a small amount
  // of high-frequency flutter so the breeze still reads clearly on a phone.
  if (isTouch) flutter *= 0.85;

  return {
    base,
    mid,
    tip,
    flutter,
    amplitude: profile.amplitude,
    frequency: profile.frequency,
    spatial: profile.spatial,
    rootLock,
    interaction: profile.interaction,
  };
}

/**
 * V1 does not change the persisted asset schema. Wind type is inferred from
 * the World V2 source file, so old saves remain byte-for-byte compatible.
 */
export function inferAssetWindProfile(asset) {
  if (!asset?.worldV2 || !asset.modelPath) return null;
  const file = asset.modelPath.split("/").at(-1) ?? "";
  if (file === "rocks.glb") return null;
  if (TREE_FILE.test(file)) return "tree";
  if (file === "grass.glb") return "grass";
  if (file === "flowers.glb") return "flower";
  if (file === "bushes.glb" || file === "flower-bushes.glb") return "bush";
  return null;
}

export const WIND_PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));
