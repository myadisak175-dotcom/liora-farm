import * as THREE from "three";
import { CHANNELS_PER_PAGE } from "./ground-layers.js";

const CHANNEL_INK = ["255,0,0", "0,255,0", "0,0,255"];

// Below this a layer's contribution is invisible but still costs a texture
// fetch, so the shader skips it. 1/400th of a layer is well under one 8-bit
// step of the splat texture.
const WEIGHT_EPSILON = 0.0025;

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

/**
 * Free-brush splat painting for the single ground mesh.
 *
 * Weights live in "pages": one canvas per three paintable layers, using r/g/b.
 * Pages are created the first time something actually paints onto them, so a
 * world that only uses dirt and sand costs exactly one page no matter how many
 * layers the config declares. The base layer (grass) owns no channel — its
 * weight is the leftover, which is also what makes it the eraser.
 *
 * Owns the splat canvases and the stroke history only. It never touches the
 * DOM chrome, the camera or the builder; the caller decides when a stroke
 * happens.
 */
export function createGroundPaint({ config, worldSize, layers, layerArray }) {
  const size = config.resolution;
  const half = worldSize / 2;
  const pixelsPerUnit = size / worldSize;
  const snapshotInterval = Math.max(1, config.snapshotInterval ?? 40);

  // `stamps` is every circle ever drawn; `groups` records how many stamps each
  // finger-drag produced. Undo pops a whole drag — one swipe used to cost 19
  // taps of ↶ because every stamp was its own undo step.
  const stamps = [];
  const groups = [];
  const pages = new Map();
  let saveTimer = null;
  let openGroup = null;
  let boundMaterial = null;
  let pageRevision = 0;

  function blankCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    return canvas;
  }

  function fillBlack(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  function createPage(index) {
    const canvas = blankCanvas();
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    fillBlack(ctx);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;

    // Undo used to redraw every stroke from scratch, and each stroke is two
    // radial gradients — a long painting session made undo hitch for a second.
    // One rolling snapshot per page means replay only ever redraws the tail,
    // and the snapshot canvas is not allocated until a page is busy enough to
    // need one.
    return {
      index,
      canvas,
      ctx,
      texture,
      stamps: [],
      snapshotCanvas: null,
      snapshotCtx: null,
      snapshotCount: 0,
    };
  }

  /** Pages in ascending index order — the order the shader declares them in. */
  function activePages() {
    return [...pages.values()].sort((a, b) => a.index - b.index);
  }

  function ensurePage(index) {
    const existing = pages.get(index);
    if (existing) return existing;
    const page = createPage(index);
    pages.set(index, page);
    pageRevision += 1;
    // A page the shader has never heard of contributes nothing until the
    // program is rebuilt, so the first stroke on a new layer would silently
    // do nothing without this.
    if (boundMaterial) boundMaterial.needsUpdate = true;
    return page;
  }

  function clearSnapshot(page) {
    if (page.snapshotCtx) fillBlack(page.snapshotCtx);
    page.snapshotCount = 0;
  }

  // `count` is how many of the page's stamps the snapshot represents — not
  // always the current stamp count, since a rebuild snapshots an earlier
  // boundary.
  function takeSnapshot(page, count = page.stamps.length) {
    if (!page.snapshotCanvas) {
      page.snapshotCanvas = blankCanvas();
      page.snapshotCtx = page.snapshotCanvas.getContext("2d");
      // The snapshot has to start as opaque black too — replay copies it
      // wholesale over the live canvas, and a transparent snapshot would wipe
      // the base.
      fillBlack(page.snapshotCtx);
    }
    page.snapshotCtx.save();
    page.snapshotCtx.globalCompositeOperation = "copy";
    page.snapshotCtx.globalAlpha = 1;
    page.snapshotCtx.drawImage(page.canvas, 0, 0);
    page.snapshotCtx.restore();
    page.snapshotCount = count;
  }

  function gradient(ctx, cx, cy, r, innerRgb, outerRgb, feather) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [stop, mix] of feather) {
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

  function paintPage(page, cx, cy, r, alpha, ink, feather) {
    if (!ink) {
      // Base layer: pull every channel on this page back towards zero, which
      // hands the weight back to the base surface.
      stamp(
        page.ctx,
        cx,
        cy,
        r,
        gradient(page.ctx, cx, cy, r, "0,0,0", "255,255,255", feather),
        "multiply",
        alpha
      );
      return;
    }
    stamp(
      page.ctx,
      cx,
      cy,
      r,
      gradient(page.ctx, cx, cy, r, ink, "255,255,255", feather),
      "multiply",
      alpha
    );
    stamp(
      page.ctx,
      cx,
      cy,
      r,
      gradient(page.ctx, cx, cy, r, ink, "0,0,0", feather),
      "lighter",
      alpha
    );
  }

  /**
   * Draws one stamp and files it on the pages it touched.
   * `record` is false during a replay, where the page lists already exist.
   */
  function drawStroke(entry, { record = true } = {}) {
    const [x, z, radius, layerId, strength] = entry;
    const layer = layers.get(layerId);
    if (!layer) return;

    const cx = (x + half) * pixelsPerUnit;
    const cy = (z + half) * pixelsPerUnit;
    const r = Math.max(1, radius * pixelsPerUnit);
    const alpha = THREE.MathUtils.clamp(strength, 0, 1);

    if (layer.base) {
      // Erasing a page that does not exist yet is a no-op on black, so this
      // deliberately does not create one.
      for (const page of pages.values()) {
        paintPage(page, cx, cy, r, alpha, null, layer.feather);
        if (record) page.stamps.push(entry);
        page.texture.needsUpdate = true;
      }
      return;
    }

    const page = ensurePage(Math.floor(layer.channel / CHANNELS_PER_PAGE));
    paintPage(
      page,
      cx,
      cy,
      r,
      alpha,
      CHANNEL_INK[layer.channel % CHANNELS_PER_PAGE],
      layer.feather
    );
    if (record) page.stamps.push(entry);
    page.texture.needsUpdate = true;
  }

  /** Redraws one page from its own stamp list, refreshing its snapshot. */
  function rebuildPage(page) {
    fillBlack(page.ctx);
    clearSnapshot(page);
    for (let i = 0; i < page.stamps.length; i += 1) {
      const entry = page.stamps[i];
      const layer = layers.get(entry[3]);
      if (!layer) continue;
      const cx = (entry[0] + half) * pixelsPerUnit;
      const cy = (entry[1] + half) * pixelsPerUnit;
      const r = Math.max(1, entry[2] * pixelsPerUnit);
      const alpha = THREE.MathUtils.clamp(entry[4], 0, 1);
      paintPage(
        page,
        cx,
        cy,
        r,
        alpha,
        layer.base ? null : CHANNEL_INK[layer.channel % CHANNELS_PER_PAGE],
        layer.feather
      );
      // Must be i + 1, not the tail length: the snapshot represents the stamps
      // drawn so far, not the whole list. Labelling it with the full length
      // made the first undo after a reload silently drop the stamps between
      // the last boundary and the end.
      if ((i + 1) % snapshotInterval === 0) takeSnapshot(page, i + 1);
    }
    page.texture.needsUpdate = true;
  }

  /** Cheap redraw after an undo: copy the snapshot, replay only the tail. */
  function replayPage(page) {
    // Undoing back past the snapshot means the snapshot is stale; rebuild it
    // once at the nearest boundary instead of on every subsequent undo.
    if (!page.snapshotCanvas || page.snapshotCount > page.stamps.length) {
      const boundary =
        Math.floor(page.stamps.length / snapshotInterval) * snapshotInterval;
      const tail = page.stamps.splice(boundary);
      rebuildPage(page);
      takeSnapshot(page, boundary);
      page.stamps.push(...tail);
    } else {
      page.ctx.save();
      page.ctx.globalCompositeOperation = "copy";
      page.ctx.globalAlpha = 1;
      page.ctx.drawImage(page.snapshotCanvas, 0, 0);
      page.ctx.restore();
    }

    for (let i = page.snapshotCount; i < page.stamps.length; i += 1) {
      const entry = page.stamps[i];
      const layer = layers.get(entry[3]);
      if (!layer) continue;
      const cx = (entry[0] + half) * pixelsPerUnit;
      const cy = (entry[1] + half) * pixelsPerUnit;
      const r = Math.max(1, entry[2] * pixelsPerUnit);
      paintPage(
        page,
        cx,
        cy,
        r,
        THREE.MathUtils.clamp(entry[4], 0, 1),
        layer.base ? null : CHANNEL_INK[layer.channel % CHANNELS_PER_PAGE],
        layer.feather
      );
    }
    page.texture.needsUpdate = true;
  }

  function replayAll() {
    for (const page of pages.values()) {
      page.stamps.length = 0;
      fillBlack(page.ctx);
      clearSnapshot(page);
      page.texture.needsUpdate = true;
    }
    for (const entry of stamps) {
      drawStroke(entry);
      // Checked across every page, not just the one this stamp hit: a base
      // layer erase lands on all of them, and a page that never crosses the
      // interval would replay its whole history on the first undo.
      for (const page of pages.values()) {
        if (page.stamps.length - page.snapshotCount >= snapshotInterval) {
          takeSnapshot(page);
        }
      }
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(config.storageKey, JSON.stringify(exportData()));
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
    const layerId = Number(stroke[3]);
    const strength = Number(stroke[4]);
    if (![x, z, radius, layerId, strength].every(Number.isFinite)) return null;
    // Layer ids come straight off disk, so an id that no longer exists in the
    // config (a layer someone removed) has to be dropped rather than drawn.
    if (!layers.isValidId(layerId)) return null;
    return [x, z, radius, layerId, THREE.MathUtils.clamp(strength, 0, 1)];
  }

  function exportData() {
    return {
      version: 1,
      strokes: stamps.map((entry) => [...entry]),
      // Added alongside `strokes` rather than as a new schema version: an older
      // build ignores this field and simply undoes stamp by stamp again.
      groups: [...groups],
    };
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

  // Page 0 always exists so the shader has something to sample even on a world
  // that has never been painted.
  ensurePage(0);
  load();

  function buildFragmentChunk() {
    const used = activePages();
    const lines = [
      "vec2 splatUv = vMapUv / uRepeat;",
      "vec2 tileUv = vMapUv;",
      // Gradients must be taken outside the weight branches below: derivatives
      // are undefined in non-uniform control flow, which is exactly why the
      // sampling uses textureGrad instead of a plain lookup.
      "vec2 tileDx = dFdx(tileUv);",
      "vec2 tileDy = dFdy(tileUv);",
    ];
    for (const page of used) {
      lines.push(
        `vec3 splat${page.index} = texture2D(uSplat${page.index}, splatUv).rgb;`
      );
    }
    lines.push("vec3 surface = vec3(0.0);", "float total = 0.0;", "float painted = 0.0;");

    for (const layer of layers.paintable) {
      const pageIndex = Math.floor(layer.channel / CHANNELS_PER_PAGE);
      if (!pages.has(pageIndex)) continue;
      const component = "rgb"[layer.channel % CHANNELS_PER_PAGE];
      const w = `w_${layer.key}`;
      lines.push(
        `float ${w} = splat${pageIndex}.${component};`,
        `painted += ${w};`,
        `if (${w} > ${WEIGHT_EPSILON}) {`,
        `  surface += textureGrad(uLayers, vec3(tileUv, ${layer.slot}.0), tileDx, tileDy).rgb * ${w};`,
        `  total += ${w};`,
        `}`
      );
    }

    lines.push(
      "float wBase = 1.0 - clamp(painted, 0.0, 1.0);",
      `surface += textureGrad(uLayers, vec3(tileUv, ${layers.base.slot}.0), tileDx, tileDy).rgb * wBase;`,
      "total += wBase;",
      "surface /= max(total, 0.001);",
      "diffuseColor *= vec4(surface, 1.0);"
    );
    return lines.join("\n");
  }

  /**
   * Blends every ground layer inside ONE material.
   * No overlay tiles, so painted edges stay soft.
   */
  function applyTo(material) {
    boundMaterial = material;
    material.onBeforeCompile = (shader) => {
      if (!shader.fragmentShader.includes("#include <map_fragment>")) {
        console.error("Ground paint: shader anchor <map_fragment> not found");
        return;
      }

      const used = activePages();
      shader.uniforms.uLayers = { value: layerArray };
      shader.uniforms.uRepeat = { value: config.textureRepeat };
      for (const page of used) {
        shader.uniforms[`uSplat${page.index}`] = { value: page.texture };
      }

      const declarations = [
        // GLSL ES 3.0 gives sampler2DArray no default precision in fragment
        // shaders, unlike sampler2D — without this the program will not link.
        "precision highp sampler2DArray;",
        "uniform sampler2DArray uLayers;",
        "uniform float uRepeat;",
        ...used.map((page) => `uniform sampler2D uSplat${page.index};`),
      ].join("\n");

      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${declarations}`)
        .replace(
          "#include <map_fragment>",
          // vMapUv already carries the base map's repeat transform, so it runs
          // 0..uRepeat across the ground. Divide it back down for the splat
          // lookup and use it as-is for the tiled surface lookup.
          `\n${buildFragmentChunk()}\n`
        );
    };
    // The key has to move whenever the generated source does, or three hands
    // back the cached program and the new layer never shows up.
    material.customProgramCacheKey = () =>
      `liora-ground-splat-v8:${layers.all.length}:${activePages()
        .map((page) => page.index)
        .join("-")}:${pageRevision}`;
    material.needsUpdate = true;
  }

  function addStamp(x, z, layerId, radius, strength) {
    const entry = [
      +x.toFixed(2),
      +z.toFixed(2),
      +radius.toFixed(2),
      layerId,
      +strength.toFixed(2),
    ];
    stamps.push(entry);
    drawStroke(entry);
    for (const page of pages.values()) {
      if (page.stamps.length - page.snapshotCount >= snapshotInterval) {
        takeSnapshot(page);
      }
    }
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
    layers,
    applyTo,
    exportData,
    importData,
    beginStroke,
    strokeTo,
    endStroke,
    /** Splat pages currently allocated — one per three painted-on layers. */
    get pageCount() {
      return pages.size;
    },
    /**
     * The raw weight canvas for one page. Exposed for the smoke test, which
     * asserts on pixels rather than on bookkeeping, and for anything that
     * later wants to draw a minimap from the paint.
     */
    pageCanvas(index) {
      return pages.get(index)?.canvas ?? null;
    },
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
      const start = Math.max(0, stamps.length - count);
      const removed = stamps.splice(start, count);
      // Every stamp in a group shares one layer, so the group hit either one
      // page or — for the base-layer eraser — all of them. Either way the
      // entries sit at the tail of those pages' lists.
      const layer = layers.get(removed[0]?.[3]);
      const touched = layer?.base
        ? [...pages.values()]
        : [pages.get(layers.pageOf(removed[0]?.[3]))].filter(Boolean);
      for (const page of touched) {
        page.stamps.splice(Math.max(0, page.stamps.length - removed.length));
        replayPage(page);
      }
      scheduleSave();
      return true;
    },
    clear() {
      openGroup = null;
      stamps.length = 0;
      groups.length = 0;
      for (const page of pages.values()) {
        page.stamps.length = 0;
        fillBlack(page.ctx);
        clearSnapshot(page);
        page.texture.needsUpdate = true;
      }
      scheduleSave();
    },
    dispose() {
      clearTimeout(saveTimer);
      for (const page of pages.values()) page.texture.dispose();
      pages.clear();
    },
  };
}
