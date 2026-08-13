import * as THREE from "three";

export const PAINT_LAYERS = Object.freeze({
  DIRT: 0,
  SAND: 1,
  ROCK: 2,
  GRASS: 3,
});

export const DIRT_VARIANTS = Object.freeze({
  DIRT: "dirt",
  SOFT_DIRT: "dirtSoft",
  DIRT_PATH: "dirtPath",
});

const PRIMARY_INK = { 0: "255,0,0", 1: "0,255,0", 2: "0,0,255" };
const EXTRA_INK = {
  [DIRT_VARIANTS.SOFT_DIRT]: "255,0,0",
  [DIRT_VARIANTS.DIRT_PATH]: "0,255,0",
};
const VALID_LAYERS = new Set(Object.values(PAINT_LAYERS));
const VALID_DIRT_VARIANTS = new Set(Object.values(DIRT_VARIANTS));
const VARIANT_EVENT = "liora-paint-variant";

function parseRgb(rgb) {
  return rgb.split(",").map(Number);
}

function mixRgb(a, b, amount) {
  const ca = parseRgb(a);
  const cb = parseRgb(b);
  return ca
    .map((value, index) => Math.round(value + (cb[index] - value) * amount))
    .join(",");
}

function gradientProfile(layer) {
  switch (layer) {
    case PAINT_LAYERS.DIRT:
      return [
        [0.00, 0.00], [0.08, 0.00], [0.20, 0.08], [0.34, 0.18],
        [0.50, 0.34], [0.66, 0.54], [0.80, 0.72], [0.90, 0.86],
        [0.97, 0.96], [1.00, 1.00],
      ];
    case PAINT_LAYERS.SAND:
      return [
        [0.00, 0.00], [0.12, 0.00], [0.26, 0.10], [0.42, 0.24],
        [0.58, 0.42], [0.74, 0.62], [0.86, 0.80], [0.94, 0.92],
        [1.00, 1.00],
      ];
    case PAINT_LAYERS.ROCK:
      return [
        [0.00, 0.00], [0.18, 0.00], [0.34, 0.10], [0.52, 0.26],
        [0.68, 0.46], [0.82, 0.68], [0.92, 0.86], [0.98, 0.96],
        [1.00, 1.00],
      ];
    case PAINT_LAYERS.GRASS:
    default:
      return [
        [0.00, 0.00], [0.08, 0.00], [0.20, 0.08], [0.34, 0.18],
        [0.50, 0.34], [0.66, 0.54], [0.80, 0.72], [0.90, 0.86],
        [0.97, 0.96], [1.00, 1.00],
      ];
  }
}

function makeMask(size) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return { canvas, ctx, texture };
}

function clearBlack(ctx, size) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

function copyCanvas(targetCtx, sourceCanvas) {
  targetCtx.save();
  targetCtx.globalCompositeOperation = "copy";
  targetCtx.globalAlpha = 1;
  targetCtx.drawImage(sourceCanvas, 0, 0);
  targetCtx.restore();
}

function v2StorageKey(key) {
  return /\.v1$/.test(key) ? key.replace(/\.v1$/, ".v2") : `${key}.v2`;
}

/**
 * Paint V2 keeps the original RGB splat untouched in concept and adds a second
 * RGB mask for optional texture variants. The old V1 localStorage key remains
 * read-only so rolling back to the stable build restores the old paint safely.
 */
export function createGroundPaint({ config, worldSize, textures }) {
  const size = config.resolution;
  const half = worldSize / 2;
  const pixelsPerUnit = size / worldSize;

  const primary = makeMask(size);
  const extra = makeMask(size);
  const texture = primary.texture;
  const extraTexture = extra.texture;

  const stamps = [];
  const groups = [];
  let saveTimer = null;
  let openGroup = null;
  let currentDirtVariant = DIRT_VARIANTS.DIRT;

  const snapshotInterval = Math.max(1, config.snapshotInterval ?? 40);
  const primarySnapshot = document.createElement("canvas");
  const extraSnapshot = document.createElement("canvas");
  primarySnapshot.width = primarySnapshot.height = size;
  extraSnapshot.width = extraSnapshot.height = size;
  const primarySnapshotCtx = primarySnapshot.getContext("2d");
  const extraSnapshotCtx = extraSnapshot.getContext("2d");
  let snapshotCount = 0;

  const legacyKey = config.storageKey;
  const storageKey = v2StorageKey(legacyKey);

  function markDirty() {
    texture.needsUpdate = true;
    extraTexture.needsUpdate = true;
  }

  function clearCanvases() {
    clearBlack(primary.ctx, size);
    clearBlack(extra.ctx, size);
  }

  function clearSnapshots() {
    clearBlack(primarySnapshotCtx, size);
    clearBlack(extraSnapshotCtx, size);
    snapshotCount = 0;
  }

  function takeSnapshot(count = stamps.length) {
    copyCanvas(primarySnapshotCtx, primary.canvas);
    copyCanvas(extraSnapshotCtx, extra.canvas);
    snapshotCount = count;
  }

  function gradient(ctx, cx, cy, r, innerRgb, outerRgb, layer) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [stop, mix] of gradientProfile(layer)) {
      const rgb = mix <= 0
        ? innerRgb
        : mix >= 1
          ? outerRgb
          : mixRgb(innerRgb, outerRgb, mix);
      g.addColorStop(stop, `rgb(${rgb})`);
    }
    return g;
  }

  function stamp(ctx, cx, cy, r, fill, mode, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = mode;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function eraseMask(ctx, cx, cy, r, layer, alpha) {
    stamp(
      ctx,
      cx,
      cy,
      r,
      gradient(ctx, cx, cy, r, "0,0,0", "255,255,255", layer),
      "multiply",
      alpha
    );
  }

  function paintInk(ctx, cx, cy, r, layer, alpha, ink) {
    stamp(
      ctx,
      cx,
      cy,
      r,
      gradient(ctx, cx, cy, r, ink, "255,255,255", layer),
      "multiply",
      alpha
    );
    stamp(
      ctx,
      cx,
      cy,
      r,
      gradient(ctx, cx, cy, r, ink, "0,0,0", layer),
      "lighter",
      alpha
    );
  }

  function normalizeVariant(layer, variant) {
    if (layer !== PAINT_LAYERS.DIRT) return null;
    return VALID_DIRT_VARIANTS.has(variant) ? variant : DIRT_VARIANTS.DIRT;
  }

  function drawStroke(x, z, radius, layer, strength, variant = null) {
    const cx = (x + half) * pixelsPerUnit;
    const cy = (z + half) * pixelsPerUnit;
    const r = Math.max(1, radius * pixelsPerUnit);
    const alpha = THREE.MathUtils.clamp(strength, 0, 1);

    if (layer === PAINT_LAYERS.GRASS) {
      eraseMask(primary.ctx, cx, cy, r, layer, alpha);
      eraseMask(extra.ctx, cx, cy, r, layer, alpha);
      return;
    }

    const dirtVariant = normalizeVariant(layer, variant);
    if (layer === PAINT_LAYERS.DIRT && dirtVariant !== DIRT_VARIANTS.DIRT) {
      eraseMask(primary.ctx, cx, cy, r, layer, alpha);
      paintInk(extra.ctx, cx, cy, r, layer, alpha, EXTRA_INK[dirtVariant]);
      return;
    }

    const ink = PRIMARY_INK[layer];
    if (!ink) return;
    eraseMask(extra.ctx, cx, cy, r, layer, alpha);
    paintInk(primary.ctx, cx, cy, r, layer, alpha, ink);
  }

  function replayAll() {
    clearCanvases();
    clearSnapshots();
    for (let i = 0; i < stamps.length; i += 1) {
      drawStroke(...stamps[i]);
      if ((i + 1) % snapshotInterval === 0) takeSnapshot(i + 1);
    }
    markDirty();
  }

  function replay() {
    if (snapshotCount > stamps.length) {
      const boundary = Math.floor(stamps.length / snapshotInterval) * snapshotInterval;
      clearCanvases();
      clearSnapshots();
      for (let i = 0; i < boundary; i += 1) drawStroke(...stamps[i]);
      takeSnapshot(boundary);
    }

    copyCanvas(primary.ctx, primarySnapshot);
    copyCanvas(extra.ctx, extraSnapshot);
    for (let i = snapshotCount; i < stamps.length; i += 1) drawStroke(...stamps[i]);
    markDirty();
  }

  function exportData() {
    return {
      version: 1,
      strokes: stamps.map((entry) => [...entry]),
      groups: [...groups],
    };
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(exportData()));
    } catch (error) {
      console.warn("Ground paint V2 could not be saved", error);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  }

  function normalizeStroke(stroke) {
    if (!Array.isArray(stroke) || stroke.length < 5) return null;
    const x = Number(stroke[0]);
    const z = Number(stroke[1]);
    const radius = Number(stroke[2]);
    const layer = Number(stroke[3]);
    const strength = Number(stroke[4]);
    if (![x, z, radius, layer, strength].every(Number.isFinite)) return null;
    if (!VALID_LAYERS.has(layer)) return null;
    const variant = normalizeVariant(layer, stroke[5]);
    return [x, z, radius, layer, THREE.MathUtils.clamp(strength, 0, 1), variant];
  }

  function normalizeGroups(rawGroups, total) {
    const sizes = [];
    let counted = 0;
    for (const value of Array.isArray(rawGroups) ? rawGroups : []) {
      const groupSize = Math.floor(Number(value));
      if (!Number.isFinite(groupSize) || groupSize < 1) continue;
      if (counted + groupSize > total) break;
      sizes.push(groupSize);
      counted += groupSize;
    }
    while (counted < total) {
      sizes.push(1);
      counted += 1;
    }
    return sizes;
  }

  function importData(data, { save = true } = {}) {
    if (data?.version !== 1 || !Array.isArray(data.strokes)) return false;
    const normalized = data.strokes.map(normalizeStroke).filter(Boolean);
    const sameLength = normalized.length === data.strokes.length;
    stamps.splice(0, stamps.length, ...normalized);
    groups.splice(
      0,
      groups.length,
      ...normalizeGroups(sameLength ? data.groups : null, stamps.length)
    );
    openGroup = null;
    replayAll();
    if (save) scheduleSave();
    return true;
  }

  function load() {
    try {
      const v2 = localStorage.getItem(storageKey);
      if (v2) {
        importData(JSON.parse(v2), { save: false });
        return;
      }
      const legacy = localStorage.getItem(legacyKey);
      if (!legacy) return;
      if (importData(JSON.parse(legacy), { save: false })) scheduleSave();
    } catch (error) {
      console.warn("Ground paint could not be loaded", error);
    }
  }

  clearCanvases();
  clearSnapshots();
  markDirty();
  load();

  function applyTo(material) {
    material.onBeforeCompile = (shader) => {
      if (!shader.fragmentShader.includes("#include <map_fragment>")) {
        console.error("Ground paint: shader anchor <map_fragment> not found");
        return;
      }

      shader.uniforms.uSplat = { value: texture };
      shader.uniforms.uSplatExtra = { value: extraTexture };
      shader.uniforms.uGrass = { value: textures.grass };
      shader.uniforms.uDirt = { value: textures.dirt };
      shader.uniforms.uSand = { value: textures.sand };
      shader.uniforms.uRock = { value: textures.rock };
      shader.uniforms.uSoftDirt = { value: textures.dirtSoft };
      shader.uniforms.uDirtPath = { value: textures.dirtPath };
      shader.uniforms.uRepeat = { value: config.textureRepeat };

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nuniform sampler2D uSplat;\nuniform sampler2D uSplatExtra;\nuniform sampler2D uGrass;\nuniform sampler2D uDirt;\nuniform sampler2D uSand;\nuniform sampler2D uRock;\nuniform sampler2D uSoftDirt;\nuniform sampler2D uDirtPath;\nuniform float uRepeat;`
        )
        .replace(
          "#include <map_fragment>",
          `
vec2 splatUv = vMapUv / uRepeat;
vec2 tileUv = vMapUv;
vec3 splat = texture2D(uSplat, splatUv).rgb;
vec3 splatExtra = texture2D(uSplatExtra, splatUv).rgb;

float wDirt = splat.r;
float wSand = splat.g;
float wRock = splat.b;
float wSoftDirt = splatExtra.r;
float wDirtPath = splatExtra.g;
float painted = wDirt + wSand + wRock + wSoftDirt + wDirtPath;
float wGrass = 1.0 - clamp(painted, 0.0, 1.0);

vec3 grassColor = texture2D(uGrass, tileUv).rgb;
vec3 dirtColor = texture2D(uDirt, tileUv).rgb;
vec3 sandColor = texture2D(uSand, tileUv).rgb;
vec3 rockColor = texture2D(uRock, tileUv).rgb;
vec3 softDirtColor = texture2D(uSoftDirt, tileUv).rgb;
vec3 dirtPathColor = texture2D(uDirtPath, tileUv).rgb;

vec3 surface =
  grassColor * wGrass +
  dirtColor * wDirt +
  sandColor * wSand +
  rockColor * wRock +
  softDirtColor * wSoftDirt +
  dirtPathColor * wDirtPath;
surface /= max(wGrass + painted, 0.001);
diffuseColor *= vec4(surface, 1.0);
`
        );
    };
    material.customProgramCacheKey = () => "liora-ground-splat-v8-extra-textures";
    material.needsUpdate = true;
  }

  function addStamp(x, z, layer, radius, strength, variant) {
    const entry = [
      +x.toFixed(2),
      +z.toFixed(2),
      +radius.toFixed(2),
      layer,
      +strength.toFixed(2),
      normalizeVariant(layer, variant),
    ];
    stamps.push(entry);
    drawStroke(...entry);
    if (stamps.length - snapshotCount >= snapshotInterval) takeSnapshot();
    if (openGroup) openGroup.count += 1;
    return entry;
  }

  function beginStroke({ layer, radius, strength = config.strength }) {
    if (openGroup) endStroke();
    openGroup = {
      layer,
      radius,
      strength,
      variant: normalizeVariant(layer, currentDirtVariant),
      count: 0,
      x: null,
      z: null,
    };
  }

  function strokeTo(x, z) {
    if (!openGroup) return 0;
    const { layer, radius, strength, variant } = openGroup;
    const spacing = Math.max(0.05, radius / 3);

    if (openGroup.x === null) {
      addStamp(x, z, layer, radius, strength, variant);
      openGroup.x = x;
      openGroup.z = z;
      markDirty();
      return 1;
    }

    const dx = x - openGroup.x;
    const dz = z - openGroup.z;
    const distance = Math.hypot(dx, dz);
    if (distance < spacing) return 0;

    const steps = Math.min(96, Math.floor(distance / spacing));
    for (let i = 1; i <= steps; i += 1) {
      const t = (i * spacing) / distance;
      addStamp(
        openGroup.x + dx * t,
        openGroup.z + dz * t,
        layer,
        radius,
        strength,
        variant
      );
    }
    openGroup.x += dx * ((steps * spacing) / distance);
    openGroup.z += dz * ((steps * spacing) / distance);
    markDirty();
    return steps;
  }

  function endStroke() {
    if (!openGroup) return false;
    const { count } = openGroup;
    openGroup = null;
    if (count > 0) {
      groups.push(count);
      scheduleSave();
      return true;
    }
    return false;
  }

  function onVariantChange(event) {
    const variant = event?.detail?.variant;
    currentDirtVariant = VALID_DIRT_VARIANTS.has(variant)
      ? variant
      : DIRT_VARIANTS.DIRT;
  }
  window.addEventListener(VARIANT_EVENT, onVariantChange);

  return {
    texture,
    extraTexture,
    applyTo,
    exportData,
    importData,
    beginStroke,
    strokeTo,
    endStroke,
    get strokeCount() {
      return groups.length + (openGroup && openGroup.count ? 1 : 0);
    },
    get stampCount() {
      return stamps.length;
    },
    paintAt(x, z, { layer, radius, strength = config.strength }) {
      beginStroke({ layer, radius, strength });
      strokeTo(x, z);
      endStroke();
    },
    undo() {
      endStroke();
      if (!groups.length) return false;
      const count = groups.pop();
      stamps.splice(Math.max(0, stamps.length - count), count);
      replay();
      scheduleSave();
      return true;
    },
    clear() {
      openGroup = null;
      stamps.length = 0;
      groups.length = 0;
      clearCanvases();
      clearSnapshots();
      markDirty();
      scheduleSave();
    },
    flushSave() {
      clearTimeout(saveTimer);
      persist();
    },
    dispose() {
      clearTimeout(saveTimer);
      window.removeEventListener(VARIANT_EVENT, onVariantChange);
      texture.dispose();
      extraTexture.dispose();
    },
  };
}
