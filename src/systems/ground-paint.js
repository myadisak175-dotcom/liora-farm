import * as THREE from "three";
import { CHANNELS_PER_PAGE } from "./ground-layers.js";

const CHANNEL_INK = ["255,0,0", "0,255,0", "0,0,255"];
const WEIGHT_EPSILON = 0.0025;

function parseRgb(rgb) {
  return rgb.split(",").map(Number);
}

function mixRgb(a, b, amount) {
  const ca = parseRgb(a);
  const cb = parseRgb(b);
  return ca.map((value, index) => Math.round(value + (cb[index] - value) * amount)).join(",");
}

export function createGroundPaint({
  config,
  worldSize,
  layers,
  layerArray,
  terrainField = null,
  autoSurfaceConfig = null,
}) {
  const size = config.resolution;
  const half = worldSize / 2;
  const pixelsPerUnit = size / worldSize;
  const snapshotInterval = Math.max(1, config.snapshotInterval ?? 40);
  const manualOverrideSize = Math.max(64, Math.min(size, config.manualOverrideResolution ?? 256));
  const manualPixelsPerUnit = manualOverrideSize / worldSize;
  const stamps = [];
  const groups = [];
  const pages = new Map();
  let saveTimer = null;
  let openGroup = null;
  let boundMaterial = null;
  let pageRevision = 0;
  let autoSurfaceEnabled = Boolean(autoSurfaceConfig?.enabledByDefault ?? true);
  const autoSurfaceUniform = { value: autoSurfaceEnabled ? 1 : 0 };

  // Manual paint must always win over slope/depth-driven Auto Surface.
  // Painted non-base layers already carry explicit splat weights, but the base
  // layer (grass) is represented by "whatever is left", so it needs a tiny
  // coverage mask to distinguish "untouched grass" from "the player painted
  // grass here on purpose". 256² is plenty for a soft brush and costs only
  // ~0.25 MB as RGBA8. The mask is rebuilt from the existing stroke history,
  // so the save schema does not change.
  const manualCanvas = document.createElement("canvas");
  manualCanvas.width = manualCanvas.height = manualOverrideSize;
  const manualCtx = manualCanvas.getContext("2d", { willReadFrequently: true });
  const manualTexture = new THREE.CanvasTexture(manualCanvas);
  manualTexture.colorSpace = THREE.NoColorSpace;
  manualTexture.generateMipmaps = false;
  manualTexture.minFilter = THREE.LinearFilter;
  manualTexture.magFilter = THREE.LinearFilter;
  manualTexture.wrapS = manualTexture.wrapT = THREE.ClampToEdgeWrapping;

  function clearManualOverride() {
    manualCtx.save();
    manualCtx.globalCompositeOperation = "copy";
    manualCtx.globalAlpha = 1;
    manualCtx.fillStyle = "#000";
    manualCtx.fillRect(0, 0, manualOverrideSize, manualOverrideSize);
    manualCtx.restore();
    manualTexture.needsUpdate = true;
  }

  function paintManualOverride(entry) {
    const [x, z, radius, , strength] = entry;
    const cx = (x + half) * manualPixelsPerUnit;
    const cy = (z + half) * manualPixelsPerUnit;
    const r = Math.max(1, radius * manualPixelsPerUnit);
    const alpha = THREE.MathUtils.clamp(strength, 0, 1);
    const g = manualCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgb(255,255,255)");
    g.addColorStop(0.72, "rgb(255,255,255)");
    g.addColorStop(1, "rgb(0,0,0)");
    stamp(manualCtx, cx, cy, r, g, "lighter", alpha);
    manualTexture.needsUpdate = true;
  }

  function rebuildManualOverride() {
    clearManualOverride();
    for (const entry of stamps) paintManualOverride(entry);
  }

  clearManualOverride();

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

  function activePages() {
    return [...pages.values()].sort((a, b) => a.index - b.index);
  }

  function ensurePage(index) {
    const existing = pages.get(index);
    if (existing) return existing;
    const page = createPage(index);
    pages.set(index, page);
    pageRevision += 1;
    if (boundMaterial) boundMaterial.needsUpdate = true;
    return page;
  }

  function clearSnapshot(page) {
    if (page.snapshotCtx) fillBlack(page.snapshotCtx);
    page.snapshotCount = 0;
  }

  function takeSnapshot(page, count = page.stamps.length) {
    if (!page.snapshotCanvas) {
      page.snapshotCanvas = blankCanvas();
      page.snapshotCtx = page.snapshotCanvas.getContext("2d");
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
      const rgb = mix <= 0 ? innerRgb : mix >= 1 ? outerRgb : mixRgb(innerRgb, outerRgb, mix);
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

  function drawStroke(entry, { record = true, recordManual = true } = {}) {
    const [x, z, radius, layerId, strength] = entry;
    const layer = layers.get(layerId);
    if (!layer) return;
    const cx = (x + half) * pixelsPerUnit;
    const cy = (z + half) * pixelsPerUnit;
    const r = Math.max(1, radius * pixelsPerUnit);
    const alpha = THREE.MathUtils.clamp(strength, 0, 1);
    if (recordManual) paintManualOverride(entry);

    if (layer.base) {
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
      if ((i + 1) % snapshotInterval === 0) takeSnapshot(page, i + 1);
    }
    page.texture.needsUpdate = true;
  }

  function replayPage(page) {
    if (!page.snapshotCanvas || page.snapshotCount > page.stamps.length) {
      const boundary = Math.floor(page.stamps.length / snapshotInterval) * snapshotInterval;
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
    clearManualOverride();
    for (const page of pages.values()) {
      page.stamps.length = 0;
      fillBlack(page.ctx);
      clearSnapshot(page);
      page.texture.needsUpdate = true;
    }
    for (const entry of stamps) {
      drawStroke(entry);
      for (const page of pages.values()) {
        if (page.stamps.length - page.snapshotCount >= snapshotInterval) takeSnapshot(page);
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
    if (!layers.isValidId(layerId)) return null;
    return [x, z, radius, layerId, THREE.MathUtils.clamp(strength, 0, 1)];
  }

  function exportData() {
    return {
      version: 1,
      strokes: stamps.map((entry) => [...entry]),
      groups: [...groups],
      autoSurface: autoSurfaceEnabled,
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
    groups.splice(0, groups.length, ...normalizeGroups(sameLength ? data.groups : null, stamps.length));
    openGroup = null;
    if (typeof data.autoSurface === "boolean") {
      autoSurfaceEnabled = data.autoSurface;
      autoSurfaceUniform.value = autoSurfaceEnabled ? 1 : 0;
    }
    replayAll();
    if (save) scheduleSave();
    return true;
  }

  function load() {
    try {
      const raw = localStorage.getItem(config.storageKey);
      if (raw) importData(JSON.parse(raw), { save: false });
    } catch (error) {
      console.warn("Ground paint could not be loaded", error);
    }
  }

  ensurePage(0);
  load();

  const sandLayer = layers.get(autoSurfaceConfig?.sandLayerId ?? -1);
  const rockLayer = layers.get(autoSurfaceConfig?.rockLayerId ?? -1);
  const hasProceduralSurface = Boolean(terrainField && sandLayer && rockLayer);

  function buildFragmentChunk() {
    const used = activePages();
    const lines = [
      "vec2 splatUv = vMapUv / uRepeat;",
      "vec2 tileUv = vMapUv;",
      "vec2 tileDx = dFdx(tileUv);",
      "vec2 tileDy = dFdy(tileUv);",
    ];
    for (const page of used) {
      lines.push(`vec3 splat${page.index} = texture2D(uSplat${page.index}, splatUv).rgb;`);
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
      "float proceduralLeft = 1.0 - clamp(painted, 0.0, 1.0);",
      "float manualOverride = texture2D(uManualOverride, splatUv).r;",
      "float autoRoom = proceduralLeft * (1.0 - manualOverride);"
    );
    if (hasProceduralSurface) {
      lines.push(
        "vec4 terrainField = texture2D(uTerrainField, splatUv);",
        "float autoRock = terrainField.b * uAutoSurfaceEnabled * autoRoom;",
        "float autoSand = terrainField.g * uAutoSurfaceEnabled * autoRoom;",
        `if (autoRock > ${WEIGHT_EPSILON}) {`,
        `  surface += textureGrad(uLayers, vec3(tileUv, ${rockLayer.slot}.0), tileDx, tileDy).rgb * autoRock;`,
        "  total += autoRock;",
        "}",
        `if (autoSand > ${WEIGHT_EPSILON}) {`,
        `  surface += textureGrad(uLayers, vec3(tileUv, ${sandLayer.slot}.0), tileDx, tileDy).rgb * autoSand;`,
        "  total += autoSand;",
        "}",
        "proceduralLeft = max(0.0, proceduralLeft - autoRock - autoSand);"
      );
    }
    lines.push(
      "float wBase = proceduralLeft;",
      `surface += textureGrad(uLayers, vec3(tileUv, ${layers.base.slot}.0), tileDx, tileDy).rgb * wBase;`,
      "total += wBase;",
      "surface /= max(total, 0.001);",
      "diffuseColor *= vec4(surface, 1.0);"
    );
    return lines.join("\n");
  }

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
      shader.uniforms.uManualOverride = { value: manualTexture };
      for (const page of used) shader.uniforms[`uSplat${page.index}`] = { value: page.texture };
      if (hasProceduralSurface) {
        shader.uniforms.uTerrainField = { value: terrainField.texture };
        shader.uniforms.uAutoSurfaceEnabled = autoSurfaceUniform;
      }

      const declarations = [
        "precision highp sampler2DArray;",
        "uniform sampler2DArray uLayers;",
        "uniform float uRepeat;",
        "uniform sampler2D uManualOverride;",
        ...used.map((page) => `uniform sampler2D uSplat${page.index};`),
        ...(hasProceduralSurface
          ? ["uniform sampler2D uTerrainField;", "uniform float uAutoSurfaceEnabled;"]
          : []),
      ].join("\n");

      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${declarations}`)
        .replace("#include <map_fragment>", `\n${buildFragmentChunk()}\n`);
    };
    material.customProgramCacheKey = () =>
      `liora-ground-splat-v10:${layers.all.length}:${activePages().map((page) => page.index).join("-")}:${pageRevision}:${hasProceduralSurface ? 1 : 0}`;
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
      if (page.stamps.length - page.snapshotCount >= snapshotInterval) takeSnapshot(page);
    }
    if (openGroup) openGroup.count += 1;
    return entry;
  }

  function beginStroke({ layer, radius, strength = config.strength }) {
    if (openGroup) endStroke();
    openGroup = { layer, radius, strength, count: 0, x: null, z: null };
  }

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
    const steps = Math.min(96, Math.floor(distance / spacing));
    for (let i = 1; i <= steps; i += 1) {
      const t = (i * spacing) / distance;
      addStamp(openGroup.x + dx * t, openGroup.z + dz * t, layer, radius, strength);
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
    setAutoSurfaceEnabled(enabled) {
      autoSurfaceEnabled = Boolean(enabled);
      autoSurfaceUniform.value = autoSurfaceEnabled ? 1 : 0;
      scheduleSave();
      return autoSurfaceEnabled;
    },
    get autoSurfaceEnabled() {
      return autoSurfaceEnabled;
    },
    get pageCount() {
      return pages.size;
    },
    pageCanvas(index) {
      return pages.get(index)?.canvas ?? null;
    },
    manualOverrideCanvas() {
      return manualCanvas;
    },
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
      const start = Math.max(0, stamps.length - count);
      const removed = stamps.splice(start, count);
      const layer = layers.get(removed[0]?.[3]);
      const touched = layer?.base
        ? [...pages.values()]
        : [pages.get(layers.pageOf(removed[0]?.[3]))].filter(Boolean);
      for (const page of touched) {
        // Drop exactly the entries this group put on THIS page — not a blind
        // "last N", which over-removed on pages created after the strokes were
        // laid down and silently ate other layers' work.
        let dropped = 0;
        for (let i = page.stamps.length - 1; i >= 0 && dropped < removed.length; i -= 1) {
          if (removed.includes(page.stamps[i])) {
            page.stamps.splice(i, 1);
            dropped += 1;
          }
        }
        replayPage(page);
      }
      rebuildManualOverride();
      scheduleSave();
      return true;
    },
    clear() {
      openGroup = null;
      stamps.length = 0;
      groups.length = 0;
      clearManualOverride();
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
      manualTexture.dispose();
    },
  };
}
