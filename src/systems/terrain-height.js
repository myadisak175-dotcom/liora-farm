/**
 * The island's height field.
 *
 * One Float32Array over the whole island, one bilinear sample() that both the
 * geometry and the gameplay read. That single source of truth is the point:
 * when height lives only in a vertex shader the collision mesh stays flat, the
 * ground raycast returns the wrong point, and placing or painting on a slope
 * lands somewhere else. Here the vertices are moved for real, so picking,
 * shadows and normals all follow for free.
 *
 * Knows nothing about Three.js beyond writing into a position attribute, and
 * nothing about the DOM.
 */

export const SCULPT_TOOLS = Object.freeze({
  RAISE: "raise",
  LOWER: "lower",
  SMOOTH: "smooth",
  FLATTEN: "flatten",
});

export function createTerrainHeight({
  config,
  worldSize,
  spacing,
  reservedAreas = [],
}) {
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new Error("Terrain height needs the grid spacing from CONFIG.terrain");
  }
  const half = worldSize / 2;
  const cells = Math.round(worldSize / spacing) + 1;
  const heights = new Float32Array(cells * cells);

  const undoStack = [];
  let openStroke = null;
  let dirty = true;
  let saveTimer = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------ addressing
  const gridX = (x) => (x + half) / spacing;
  const gridZ = (z) => (z + half) / spacing;
  const worldX = (ix) => ix * spacing - half;
  const worldZ = (iz) => iz * spacing - half;
  const at = (ix, iz) =>
    heights[clamp(iz, 0, cells - 1) * cells + clamp(ix, 0, cells - 1)];

  /** Bilinear height at any world point. This is getHeight(). */
  function sample(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const gx = clamp(gridX(x), 0, cells - 1);
    const gz = clamp(gridZ(z), 0, cells - 1);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const h00 = at(ix, iz);
    const h10 = at(ix + 1, iz);
    const h01 = at(ix, iz + 1);
    const h11 = at(ix + 1, iz + 1);
    return (
      h00 * (1 - fx) * (1 - fz) +
      h10 * fx * (1 - fz) +
      h01 * (1 - fx) * fz +
      h11 * fx * fz
    );
  }

  /** Steepness at a point, as a slope ratio (rise / run). */
  function slopeAt(x, z) {
    const step = spacing;
    const dx = (sample(x + step, z) - sample(x - step, z)) / (2 * step);
    const dz = (sample(x, z + step) - sample(x, z - step)) / (2 * step);
    return Math.hypot(dx, dz);
  }

  // ------------------------------------------------------------ constraints
  /** 1 in the middle of the island, easing to 0 at the rim. */
  function edgeFactor(x, z) {
    const margin = config.edgeMargin;
    const inner = half - margin;
    const d = Math.max(Math.abs(x), Math.abs(z));
    if (d <= inner) return 1;
    if (d >= half) return 0;
    const t = 1 - (d - inner) / margin;
    return t * t * (3 - 2 * t);
  }

  /** The farm beds and anything else reserved must stay dead flat. */
  function reservedFactor(x, z) {
    let factor = 1;
    for (const area of reservedAreas) {
      const outer = Number(area.radius ?? 0) + config.reservedFeather;
      const d = Math.hypot(x - area.x, z - area.z);
      if (d >= outer) continue;
      if (d <= area.radius) return 0;
      const t = (d - area.radius) / config.reservedFeather;
      factor = Math.min(factor, t * t * (3 - 2 * t));
    }
    return factor;
  }

  function writeCell(ix, iz, value) {
    const x = worldX(ix);
    const z = worldZ(iz);
    const allowed = edgeFactor(x, z) * reservedFactor(x, z);
    heights[iz * cells + ix] = clamp(
      value * allowed,
      config.minHeight,
      config.maxHeight
    );
  }

  // ---------------------------------------------------------------- brushes
  function falloff(distance, radius) {
    if (distance >= radius) return 0;
    const t = 1 - distance / radius;
    return t * t * (3 - 2 * t);
  }

  function neighbourAverage(ix, iz) {
    return (
      at(ix - 1, iz) + at(ix + 1, iz) + at(ix, iz - 1) + at(ix, iz + 1)
    ) / 4;
  }

  function stamp(x, z, amount) {
    const { tool, radius, target } = openStroke;
    const minIx = Math.max(0, Math.floor(gridX(x - radius)));
    const maxIx = Math.min(cells - 1, Math.ceil(gridX(x + radius)));
    const minIz = Math.max(0, Math.floor(gridZ(z - radius)));
    const maxIz = Math.min(cells - 1, Math.ceil(gridZ(z + radius)));

    for (let iz = minIz; iz <= maxIz; iz += 1) {
      for (let ix = minIx; ix <= maxIx; ix += 1) {
        const weight = falloff(
          Math.hypot(worldX(ix) - x, worldZ(iz) - z),
          radius
        );
        if (weight <= 0) continue;
        const current = heights[iz * cells + ix];
        let next = current;

        if (tool === SCULPT_TOOLS.RAISE) next = current + amount * weight;
        else if (tool === SCULPT_TOOLS.LOWER) next = current - amount * weight;
        else if (tool === SCULPT_TOOLS.SMOOTH) {
          const pull = clamp(weight * amount * config.smoothRate, 0, 1);
          next = current + (neighbourAverage(ix, iz) - current) * pull;
        } else if (tool === SCULPT_TOOLS.FLATTEN) {
          const pull = clamp(weight * amount * config.flattenRate, 0, 1);
          next = current + (target - current) * pull;
        }

        writeCell(ix, iz, next);
      }
    }
    dirty = true;
  }

  // ---------------------------------------------------------------- strokes
  function pushUndo() {
    undoStack.push(Float32Array.from(heights));
    while (undoStack.length > config.undoLimit) undoStack.shift();
  }

  /**
   * A stroke is: begin, then moveTo as the finger travels, and tick(dt) at a
   * steady rate. Rate-based rather than per-event on purpose — a sculpt brush
   * that only bites when the finger moves feels dead when you hold it still,
   * and bites twice as hard on a fast phone.
   */
  function beginStroke({ tool, radius, strength = config.strength, x = 0, z = 0 }) {
    if (openStroke) endStroke();
    pushUndo();
    openStroke = {
      tool,
      radius,
      strength,
      // Flatten levels everything to whatever was under the first touch.
      target: sample(x, z),
      x,
      z,
      appliedX: x,
      appliedZ: z,
      touched: false,
    };
  }

  function moveTo(x, z) {
    if (!openStroke) return false;
    openStroke.x = x;
    openStroke.z = z;
    return true;
  }

  /** Applies `dt` seconds of brush at the current position. */
  function tick(dt) {
    if (!openStroke || !(dt > 0)) return 0;
    const { x, z, appliedX, appliedZ, radius, strength } = openStroke;
    const distance = Math.hypot(x - appliedX, z - appliedZ);
    // Spread the same amount of material along the path travelled since the
    // last tick, so a fast swipe leaves a trail instead of dotted craters.
    const steps = clamp(Math.ceil(distance / (radius / 3)), 1, 12);
    const amount = (strength * dt) / steps;

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      stamp(appliedX + (x - appliedX) * t, appliedZ + (z - appliedZ) * t, amount);
    }

    openStroke.appliedX = x;
    openStroke.appliedZ = z;
    openStroke.touched = true;
    return steps;
  }

  function endStroke() {
    if (!openStroke) return false;
    const { touched } = openStroke;
    openStroke = null;
    if (!touched) {
      undoStack.pop(); // nothing happened, drop the snapshot again
      return false;
    }
    scheduleSave();
    return true;
  }

  function undo() {
    endStroke();
    const previous = undoStack.pop();
    if (!previous) return false;
    heights.set(previous);
    dirty = true;
    scheduleSave();
    return true;
  }

  function clear() {
    openStroke = null;
    pushUndo();
    heights.fill(0);
    dirty = true;
    scheduleSave();
  }

  function isFlat() {
    for (let i = 0; i < heights.length; i += 1) {
      if (Math.abs(heights[i]) > 1e-4) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- storage
  /** Int16 centimetres: exact enough, and the whole island fits in ~19 KB. */
  function exportData() {
    const quantised = new Int16Array(heights.length);
    for (let i = 0; i < heights.length; i += 1) {
      quantised[i] = Math.round(clamp(heights[i], -320, 320) * 100);
    }
    let binary = "";
    const bytes = new Uint8Array(quantised.buffer);
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return { version: 1, cells, spacing, data: btoa(binary) };
  }

  function importData(payload, { save = true } = {}) {
    if (payload?.version !== 1 || typeof payload.data !== "string") return false;
    if (payload.cells !== cells || payload.spacing !== spacing) {
      console.warn("Terrain height grid changed shape — keeping it flat");
      return false;
    }
    try {
      const binary = atob(payload.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const quantised = new Int16Array(bytes.buffer);
      if (quantised.length !== heights.length) return false;
      for (let i = 0; i < heights.length; i += 1) heights[i] = quantised[i] / 100;
      undoStack.length = 0;
      dirty = true;
      if (save) scheduleSave();
      return true;
    } catch (error) {
      console.warn("Terrain height could not be read", error);
      return false;
    }
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      localStorage.setItem(config.storageKey, JSON.stringify(exportData()));
      return true;
    } catch (error) {
      console.warn("Terrain height could not be saved", error);
      return false;
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 300);
  }

  function flushSave() {
    if (saveTimer === null) return true;
    return persist();
  }

  function load() {
    try {
      const raw = localStorage.getItem(config.storageKey);
      if (raw) importData(JSON.parse(raw), { save: false });
    } catch (error) {
      console.warn("Terrain height could not be loaded", error);
    }
  }

  // --------------------------------------------------------------- geometry
  /**
   * Writes heights into a plane's position attribute.
   *
   * The mesh is the usual PlaneGeometry rotated -90° about X, so local
   * (x, y, z) shows up in the world as (x, z, -y): local Z is world height and
   * world Z is -local Y. Each vertex is read back rather than assuming the
   * generator's ordering, so this cannot silently mirror the island.
   */
  function applyTo(geometry) {
    const position = geometry.getAttribute("position");
    for (let v = 0; v < position.count; v += 1) {
      position.setZ(v, sample(position.getX(v), -position.getY(v)));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    dirty = false;
  }

  load();

  return {
    cells,
    spacing,
    heights,
    SCULPT_TOOLS,
    sample,
    slopeAt,
    applyTo,
    beginStroke,
    moveTo,
    tick,
    endStroke,
    undo,
    clear,
    isFlat,
    exportData,
    importData,
    flushSave,
    get isDirty() {
      return dirty;
    },
    get undoDepth() {
      return undoStack.length;
    },
    dispose() {
      clearTimeout(saveTimer);
    },
  };
}
