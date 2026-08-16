const PROFILES = Object.freeze({
  tree: Object.freeze({
    // base / mid / tip map to trunk / branches / leaves for a mixed tree mesh.
    base: 0.06,
    mid: 0.28,
    tip: 0.62,
    flutter: 0.16,
    amplitude: 0.055,
    frequency: 0.72,
    spatial: 1,
    rootLock: 0.18,
  }),
  bush: Object.freeze({
    base: 0.12,
    mid: 0.42,
    tip: 0.6,
    flutter: 0.16,
    amplitude: 0.12,
    frequency: 0.95,
    spatial: 1.15,
    rootLock: 0.2,
  }),
  grass: Object.freeze({
    base: 0.04,
    mid: 0.65,
    tip: 0.95,
    flutter: 0.22,
    amplitude: 0.25,
    frequency: 1.22,
    spatial: 1.35,
    rootLock: 0.22,
  }),
  flower: Object.freeze({
    base: 0.05,
    mid: 0.48,
    tip: 0.68,
    flutter: 0.12,
    amplitude: 0.16,
    frequency: 0.9,
    spatial: 1.2,
    rootLock: 0.2,
  }),
});

const TRUNK = /(trunk|bark|wood|stem)/i;
const BRANCH = /(branch|twig)/i;
const LEAF = /(leaf|leaves|foliage|needle|frond)/i;

export function getWindProfile(name) {
  return PROFILES[name] ?? null;
}

/**
 * Material and mesh names are only hints. Unknown tree meshes intentionally
 * stay `mixed` so the shader can separate trunk/branch/leaf force by height.
 */
export function classifyTreePart(mesh, material) {
  const text = `${mesh?.name ?? ""} ${material?.name ?? ""}`;
  if (TRUNK.test(text)) return "trunk";
  if (BRANCH.test(text)) return "branch";
  if (LEAF.test(text)) return "leaf";
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

  // Touch devices keep the large readable sway but spend less vertex work on
  // tiny high-frequency motion, which is the first detail to disappear on a phone.
  if (isTouch) flutter *= 0.65;

  return {
    base,
    mid,
    tip,
    flutter,
    amplitude: profile.amplitude,
    frequency: profile.frequency,
    spatial: profile.spatial,
    rootLock,
  };
}

export function inferNatureWindProfile({ file, kind } = {}) {
  if (kind === "rock") return null;
  if (kind === "tree") return "tree";
  if (file === "grass.glb") return "grass";
  if (file === "flowers.glb") return "flower";
  return kind === "plant" ? "bush" : null;
}

export const WIND_PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));
