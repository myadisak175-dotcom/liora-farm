import * as THREE from "three";

export const PAINT_LAYERS = Object.freeze({
  DIRT: 0,
  SAND: 1,
  ROCK: 2,
  GRASS: 3,
});

const INK = { 0: "255,0,0", 1: "0,255,0", 2: "0,0,255" };

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
      // Longest feather: dirt should melt into grass the most.
      return [
        [0.00, 0.00],
        [0.08, 0.00],
        [0.20, 0.08],
        [0.34, 0.18],
        [0.50, 0.34],
        [0.66, 0.54],
        [0.80, 0.72],
        [0.90, 0.86],
        [0.97, 0.96],
        [1.00, 1.00],
      ];
    case PAINT_LAYERS.SAND:
      // Medium soft: still fluffy, but keep shoreline/path shape a bit clearer.
      return [
        [0.00, 0.00],
        [0.12, 0.00],
        [0.26, 0.10],
        [0.42, 0.24],
        [0.58, 0.42],
        [0.74, 0.62],
        [0.86, 0.80],
        [0.94, 0.92],
        [1.00, 1.00],
      ];
    case PAINT_LAYERS.ROCK:
      // Shorter feather: reduce the grey halo around rock edges.
      return [
        [0.00, 0.00],
        [0.18, 0.00],
        [0.34, 0.10],
        [0.52, 0.26],
        [0.68, 0.46],
        [0.82, 0.68],
        [0.92, 0.86],
        [0.98, 0.96],
        [1.00, 1.00],
      ];
    case PAINT_LAYERS.GRASS:
    default:
      // Grass erase should feel forgiving like dirt.
      return [
        [0.00, 0.00],
        [0.08, 0.00],
        [0.20, 0.08],
        [0.34, 0.18],
        [0.50, 0.34],
        [0.66, 0.54],
        [0.80, 0.72],
        [0.90, 0.86],
        [0.97, 0.96],
        [1.00, 1.00],
      ];
  }
}

/**
 * Free-brush splat painting for the single ground mesh.
 * Owns the splat canvas + stroke history only. It never touches the DOM,
 * the camera or the builder; the caller decides when a stroke happens.
 */
export function createGroundPaint({ config, worldSize, textures }) {
  const size = config.resolution;
  const half = worldSize / 2;
  const pixelsPerUnit = size / worldSize;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;

  const strokes = [];
  let saveTimer = null;

  function clearCanvas() {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  function gradient(cx, cy, r, innerRgb, outerRgb, layer) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [stop, mix] of gradientProfile(layer)) {
      const rgb =
        mix <= 0
          ? innerRgb
          : mix >= 1
            ? outerRgb
            : mixRgb(innerRgb, outerRgb, mix);
      g.addColorStop(stop, `rgb(${rgb})`);
    }
    return g;
  }

  function stamp(cx, cy, r, fill, mode, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = mode;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawStroke(x, z, radius, layer, strength) {
    const cx = (x + half) * pixelsPerUnit;
    const cy = (z + half) * pixelsPerUnit;
    const r = Math.max(1, radius * pixelsPerUnit);
    const alpha = THREE.MathUtils.clamp(strength, 0, 1);

    if (layer === PAINT_LAYERS.GRASS) {
      stamp(
        cx,
        cy,
        r,
        gradient(cx, cy, r, "0,0,0", "255,255,255", layer),
        "multiply",
        alpha
      );
      return;
    }

    const ink = INK[layer];
    if (!ink) return;
    stamp(
      cx,
      cy,
      r,
      gradient(cx, cy, r, ink, "255,255,255", layer),
      "multiply",
      alpha
    );
    stamp(
      cx,
      cy,
      r,
      gradient(cx, cy, r, ink, "0,0,0", layer),
      "lighter",
      alpha
    );
  }

  function replay() {
    clearCanvas();
    for (const stroke of strokes) drawStroke(...stroke);
    texture.needsUpdate = true;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          config.storageKey,
          JSON.stringify({ version: 1, strokes })
        );
      } catch (error) {
        console.warn("Ground paint could not be saved", error);
      }
    }, 250);
  }

  function normalizeStroke(stroke) {
    if (!Array.isArray(stroke) || stroke.length < 5) return null;
    const x = Number(stroke[0]);
    const z = Number(stroke[1]);
    const radius = Number(stroke[2]);
    const layer = Number(stroke[3]);
    const strength = Number(stroke[4]);
    if (![x, z, radius, layer, strength].every(Number.isFinite)) return null;
    if (![PAINT_LAYERS.DIRT, PAINT_LAYERS.SAND, PAINT_LAYERS.ROCK, PAINT_LAYERS.GRASS].includes(layer)) {
      return null;
    }
    return [x, z, radius, layer, THREE.MathUtils.clamp(strength, 0, 1)];
  }

  function exportData() {
    return {
      version: 1,
      strokes: strokes.map((stroke) => [...stroke]),
    };
  }

  function importData(data, { save = true } = {}) {
    if (data?.version !== 1 || !Array.isArray(data.strokes)) return false;
    const normalized = data.strokes.map(normalizeStroke).filter(Boolean);
    strokes.splice(0, strokes.length, ...normalized);
    replay();
    if (save) scheduleSave();
    return true;
  }

  function load() {
    try {
      const raw = localStorage.getItem(config.storageKey);
      if (!raw) return;
      importData(JSON.parse(raw), { save: false });
    } catch (error) {
      console.warn("Ground paint could not be loaded", error);
    }
  }

  clearCanvas();
  texture.needsUpdate = true;
  load();

  /**
   * Blends grass/dirt/sand/rock inside ONE ground material.
   * No overlay tiles, so painted edges stay soft.
   */
  function applyTo(material) {
    material.onBeforeCompile = (shader) => {
      if (!shader.fragmentShader.includes("#include <map_fragment>")) {
        console.error("Ground paint: shader anchor <map_fragment> not found");
        return;
      }

      shader.uniforms.uSplat = { value: texture };
      shader.uniforms.uGrass = { value: textures.grass };
      shader.uniforms.uDirt = { value: textures.dirt };
      shader.uniforms.uSand = { value: textures.sand };
      shader.uniforms.uRock = { value: textures.rock };
      shader.uniforms.uRepeat = { value: config.textureRepeat };

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nuniform sampler2D uSplat;\nuniform sampler2D uGrass;\nuniform sampler2D uDirt;\nuniform sampler2D uSand;\nuniform sampler2D uRock;\nuniform float uRepeat;`
        )
        .replace(
          "#include <map_fragment>",
          `
// vMapUv already carries the grass map's repeat transform, so it runs
// 0..uRepeat across the ground. Divide it back down for the splat lookup
// and use it as-is for the tiled surface lookup.
vec2 splatUv = vMapUv / uRepeat;
vec2 tileUv = vMapUv;
vec3 splat = texture2D(uSplat, splatUv).rgb;
float wDirt = splat.r;
float wSand = splat.g;
float wRock = splat.b;
float wGrass = 1.0 - clamp(wDirt + wSand + wRock, 0.0, 1.0);

vec3 grassColor = texture2D(uGrass, tileUv).rgb;
vec3 dirtColor = texture2D(uDirt, tileUv).rgb;
vec3 sandColor = texture2D(uSand, tileUv).rgb;
vec3 rockColor = texture2D(uRock, tileUv).rgb;

vec3 surface =
  grassColor * wGrass +
  dirtColor * wDirt +
  sandColor * wSand +
  rockColor * wRock;
surface /= max(wGrass + wDirt + wSand + wRock, 0.001);
diffuseColor *= vec4(surface, 1.0);
`
        );
    };
    material.customProgramCacheKey = () =>
      "liora-ground-splat-v7-per-layer-feather";
    material.needsUpdate = true;
  }

  return {
    texture,
    applyTo,
    exportData,
    importData,
    get strokeCount() {
      return strokes.length;
    },
    paintAt(x, z, { layer, radius, strength = config.strength }) {
      const stroke = [
        +x.toFixed(2),
        +z.toFixed(2),
        +radius.toFixed(2),
        layer,
        +strength.toFixed(2),
      ];
      strokes.push(stroke);
      drawStroke(...stroke);
      texture.needsUpdate = true;
      scheduleSave();
    },
    undo() {
      if (!strokes.length) return false;
      strokes.pop();
      replay();
      scheduleSave();
      return true;
    },
    clear() {
      strokes.length = 0;
      replay();
      scheduleSave();
    },
    dispose() {
      clearTimeout(saveTimer);
      texture.dispose();
    },
  };
}
