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

  // `stamps` is every circle ever drawn; `groups` records how many stamps each
  // finger-drag produced. Undo pops a whole drag — one swipe used to cost 19
  // taps of ↶ because every stamp was its own undo step.
  const stamps = [];
  const groups = [];
  let saveTimer = null;
  let openGroup = null;

  // Undo used to redraw every stroke from scratch, and each stroke is two
  // radial gradients — a long painting session made undo hitch for a second.
  // One rolling snapshot means replay only ever redraws the tail.
  const snapshotInterval = Math.max(1, config.snapshotInterval ?? 40);
  const snapshotCanvas = document.createElement("canvas");
  snapshotCanvas.width = snapshotCanvas.height = size;
  const snapshotCtx = snapshotCanvas.getContext("2d");
  let snapshotCount = 0;

  function clearCanvas() {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  function clearSnapshot() {
    snapshotCtx.save();
    snapshotCtx.globalCompositeOperation = "source-over";
    snapshotCtx.globalAlpha = 1;
    snapshotCtx.fillStyle = "#000";
    snapshotCtx.fillRect(0, 0, size, size);
    snapshotCtx.restore();
    snapshotCount = 0;
  }

  // `count` is how many stamps the snapshot represents — not always the
  // current stroke count, since a rebuild snapshots an earlier boundary.
  function takeSnapshot(count = stamps.length) {
    snapshotCtx.save();
    snapshotCtx.globalCompositeOperation = "copy";
    snapshotCtx.globalAlpha = 1;
    snapshotCtx.drawImage(canvas, 0, 0);
    snapshotCtx.restore();
    snapshotCount = count;
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

  function replayAll() {
    clearCanvas();
    clearSnapshot();
    for (let i = 0; i < stamps.length; i += 1) {
      drawStroke(...stamps[i]);
      // Must be i + 1, not the default: the snapshot represents the stamps
      // drawn so far, not the whole list. Labelling it with the full length
      // made the first undo after a reload silently drop the stamps between
      // the last boundary and the end.
      if ((i + 1) % snapshotInterval === 0) takeSnapshot(i + 1);
    }
    texture.needsUpdate = true;
  }

  function replay() {
    // Undoing back past the snapshot means the snapshot is stale; rebuild it
    // once at the nearest boundary instead of on every subsequent undo.
    if (snapshotCount > stamps.length) {
      const boundary =
        Math.floor(stamps.length / snapshotInterval) * snapshotInterval;
      clearCanvas();
      clearSnapshot();
      for (let i = 0; i < boundary; i += 1) drawStroke(...stamps[i]);
      takeSnapshot(boundary);
    }

    ctx.save();
    ctx.globalCompositeOperation = "copy";
    ctx.globalAlpha = 1;
    ctx.drawImage(snapshotCanvas, 0, 0);
    ctx.restore();

    for (let i = snapshotCount; i < stamps.length; i += 1) {
      drawStroke(...stamps[i]);
    }
    texture.needsUpdate = true;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          config.storageKey,
          JSON.stringify(exportData())
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
      strokes: stamps.map((stamp) => [...stamp]),
      // Added alongside `strokes` rather than as a new schema version: an older
      // build ignores this field and simply undoes stamp by stamp again.
      groups: [...groups],
    };
  }

  function normalizeGroups(rawGroups, total) {
    const sizes = [];
    let counted = 0;
    for (const value of Array.isArray(rawGroups) ? rawGroups : []) {
      const size = Math.floor(Number(value));
      if (!Number.isFinite(size) || size < 1) continue;
      if (counted + size > total) break;
      sizes.push(size);
      counted += size;
    }
    // Anything not covered (older saves, or a truncated list) falls back to one
    // stamp per undo step, which is what those saves meant anyway.
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
      const raw = localStorage.getItem(config.storageKey);
      if (!raw) return;
      importData(JSON.parse(raw), { save: false });
    } catch (error) {
      console.warn("Ground paint could not be loaded", error);
    }
  }

  clearCanvas();
  // The snapshot has to start as opaque black too — replay copies it wholesale
  // over the live canvas, and a transparent snapshot would wipe the base.
  clearSnapshot();
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

  function addStamp(x, z, layer, radius, strength) {
    const entry = [
      +x.toFixed(2),
      +z.toFixed(2),
      +radius.toFixed(2),
      layer,
      +strength.toFixed(2),
    ];
    stamps.push(entry);
    drawStroke(...entry);
    if (stamps.length - snapshotCount >= snapshotInterval) takeSnapshot();
    if (openGroup) openGroup.count += 1;
    return entry;
  }

  function beginStroke({ layer, radius, strength = config.strength }) {
    if (openGroup) endStroke();
    openGroup = { layer, radius, strength, count: 0, x: null, z: null };
  }

  /**
   * Extends the current drag to (x, z), filling in the space since the last
   * point. Without this the brush only stamped where the finger happened to be
   * reported: a fast swipe (or one dropped frame) left a visible hole in the
   * middle of the stroke.
   */
  function strokeTo(x, z) {
    if (!openGroup) return 0;
    const { layer, radius, strength } = openGroup;
    const spacing = Math.max(0.05, radius / 3);

    if (openGroup.x === null) {
      addStamp(x, z, layer, radius, strength);
      openGroup.x = x;
      openGroup.z = z;
      texture.needsUpdate = true;
      return 1;
    }

    const dx = x - openGroup.x;
    const dz = z - openGroup.z;
    const distance = Math.hypot(dx, dz);
    if (distance < spacing) return 0;

    // Guard against a pathological jump (e.g. a camera cut) turning into
    // thousands of stamps in one event.
    const steps = Math.min(96, Math.floor(distance / spacing));
    for (let i = 1; i <= steps; i += 1) {
      const t = (i * spacing) / distance;
      addStamp(
        openGroup.x + dx * t,
        openGroup.z + dz * t,
        layer,
        radius,
        strength
      );
    }
    openGroup.x += dx * ((steps * spacing) / distance);
    openGroup.z += dz * ((steps * spacing) / distance);
    texture.needsUpdate = true;
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

  return {
    texture,
    applyTo,
    exportData,
    importData,
    beginStroke,
    strokeTo,
    endStroke,
    /** Number of undo steps — one per finger-drag, not per stamp. */
    get strokeCount() {
      return groups.length + (openGroup && openGroup.count ? 1 : 0);
    },
    get stampCount() {
      return stamps.length;
    },
    /** One-shot dab, used by tests and any caller that is not dragging. */
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
      clearCanvas();
      clearSnapshot();
      texture.needsUpdate = true;
      scheduleSave();
    },
    dispose() {
      clearTimeout(saveTimer);
      texture.dispose();
    },
  };
}
