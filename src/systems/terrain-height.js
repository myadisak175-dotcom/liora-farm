/**
 * Editable island height field. The Float32Array is the single source of truth
 * for rendering, collision, water depth and procedural surface rules.
 */
export const SCULPT_TOOLS = Object.freeze({
  RAISE: "raise",
  LOWER: "lower",
  SMOOTH: "smooth",
  FLATTEN: "flatten",
});

export function createTerrainHeight({ config, worldSize, spacing, reservedAreas = [] }) {
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new Error("Terrain height needs the grid spacing from CONFIG.terrain");
  }
  const half = worldSize / 2;
  const cells = Math.round(worldSize / spacing) + 1;
  const heights = new Float32Array(cells * cells);
  const undoStack = [];
  let openStroke = null;
  let dirty = true;
  let finalizePending = true;
  let saveTimer = null;
  let dirtyMinIx = 0;
  let dirtyMaxIx = cells - 1;
  let dirtyMinIz = 0;
  let dirtyMaxIz = cells - 1;
  let vertexMap = null;
  let defaultStrength = config.strength;
  let defaultRoughness = config.defaultRoughness ?? 0.55;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const gridX = (x) => (x + half) / spacing;
  const gridZ = (z) => (z + half) / spacing;
  const worldX = (ix) => ix * spacing - half;
  const worldZ = (iz) => iz * spacing - half;
  const at = (ix, iz) => heights[clamp(iz, 0, cells - 1) * cells + clamp(ix, 0, cells - 1)];

  function markDirty(ix0 = 0, iz0 = 0, ix1 = cells - 1, iz1 = cells - 1) {
    if (!dirty) {
      dirtyMinIx = ix0;
      dirtyMaxIx = ix1;
      dirtyMinIz = iz0;
      dirtyMaxIz = iz1;
    } else {
      dirtyMinIx = Math.min(dirtyMinIx, ix0);
      dirtyMaxIx = Math.max(dirtyMaxIx, ix1);
      dirtyMinIz = Math.min(dirtyMinIz, iz0);
      dirtyMaxIz = Math.max(dirtyMaxIz, iz1);
    }
    dirty = true;
  }

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
    return h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
  }

  function slopeAt(x, z) {
    const step = spacing;
    const dx = (sample(x + step, z) - sample(x - step, z)) / (2 * step);
    const dz = (sample(x, z + step) - sample(x, z - step)) / (2 * step);
    return Math.hypot(dx, dz);
  }

  /**
   * Where a ray first meets the editable height field, without touching the
   * rendered mesh.
   *
   * Pointer painting calls this every move, so using THREE.Raycaster against
   * ~14,000 triangles was needlessly expensive. A naive long-step ray march is
   * fast but can jump over a narrow ridge and hit the ground behind it. This
   * version walks the X/Z grid cell-by-cell (2D DDA) and solves the bilinear
   * height patch in each visited cell. That guarantees the nearest top-surface
   * hit, including thin peaks that are only one terrain cell wide.
   *
   * `origin`/`direction` are any {x,y,z}; direction must be normalized.
   * Returns {x, y, z, distance} or null.
   */
  function raycast(origin, direction, { maxDistance = 140 } = {}) {
    if (!(direction.y < 0) || !(maxDistance > 0)) return null;

    const EPS = 1e-8;

    // Clip the ray against the square X/Z domain first. Outside the terrain
    // there is no top surface, and sample() intentionally clamps for gameplay
    // queries, so using it before this clip would invent ground beyond the rim.
    let enter = 0;
    let exit = maxDistance;
    for (const [o, d] of [[origin.x, direction.x], [origin.z, direction.z]]) {
      if (Math.abs(d) < EPS) {
        if (o < -half || o > half) return null;
        continue;
      }
      let a = (-half - o) / d;
      let b = (half - o) / d;
      if (a > b) [a, b] = [b, a];
      enter = Math.max(enter, a);
      exit = Math.min(exit, b);
      if (enter > exit) return null;
    }
    if (exit < 0) return null;
    let t = Math.max(0, enter);
    const tEnd = Math.min(maxDistance, exit);
    if (t > tEnd) return null;

    const signedHeight = (time) => {
      const x = origin.x + direction.x * time;
      const y = origin.y + direction.y * time;
      const z = origin.z + direction.z * time;
      return y - sample(x, z);
    };

    // If the ray enters the clipped terrain from the side already below the
    // height field, it cannot hit the top later because it is travelling down.
    // A value near zero is a legitimate edge hit.
    const startAbove = signedHeight(t);
    if (startAbove < -1e-6) return null;
    if (Math.abs(startAbove) <= 1e-6) {
      const x = origin.x + direction.x * t;
      const z = origin.z + direction.z * t;
      return { x, y: sample(x, z), z, distance: t };
    }

    // Pick the cell just *inside* the travel direction when starting exactly
    // on a grid line. This avoids a zero-length first cell and keeps DDA stable.
    const probeT = Math.min(tEnd, t + 1e-7);
    const probeX = origin.x + direction.x * probeT;
    const probeZ = origin.z + direction.z * probeT;
    let ix = clamp(Math.floor(gridX(probeX)), 0, cells - 2);
    let iz = clamp(Math.floor(gridZ(probeZ)), 0, cells - 2);

    const stepX = direction.x > EPS ? 1 : direction.x < -EPS ? -1 : 0;
    const stepZ = direction.z > EPS ? 1 : direction.z < -EPS ? -1 : 0;
    const deltaTX = stepX ? spacing / Math.abs(direction.x) : Infinity;
    const deltaTZ = stepZ ? spacing / Math.abs(direction.z) : Infinity;
    let nextTX = stepX > 0
      ? (worldX(ix + 1) - origin.x) / direction.x
      : stepX < 0 ? (worldX(ix) - origin.x) / direction.x : Infinity;
    let nextTZ = stepZ > 0
      ? (worldZ(iz + 1) - origin.z) / direction.z
      : stepZ < 0 ? (worldZ(iz) - origin.z) / direction.z : Infinity;

    function firstRootInCell(cellX, cellZ, fromT, toT) {
      if (toT < fromT - EPS) return null;
      const x0 = worldX(cellX);
      const z0 = worldZ(cellZ);
      const h00 = at(cellX, cellZ);
      const h10 = at(cellX + 1, cellZ);
      const h01 = at(cellX, cellZ + 1);
      const h11 = at(cellX + 1, cellZ + 1);
      const a = h00;
      const b = h10 - h00;
      const c = h01 - h00;
      const d = h11 - h10 - h01 + h00;
      const u0 = (origin.x - x0) / spacing;
      const v0 = (origin.z - z0) / spacing;
      const du = direction.x / spacing;
      const dv = direction.z / spacing;

      // f(t) = rayY(t) - bilinearHeight(rayX(t), rayZ(t)).
      const q2 = -(d * du * dv);
      const q1 = direction.y - (b * du + c * dv + d * (u0 * dv + v0 * du));
      const q0 = origin.y - (a + b * u0 + c * v0 + d * u0 * v0);
      const roots = [];
      if (Math.abs(q2) < 1e-12) {
        if (Math.abs(q1) < 1e-12) {
          if (Math.abs(q0) <= 1e-7) roots.push(fromT);
        } else {
          roots.push(-q0 / q1);
        }
      } else {
        const disc = q1 * q1 - 4 * q2 * q0;
        if (disc >= -1e-10) {
          const sqrtDisc = Math.sqrt(Math.max(0, disc));
          roots.push((-q1 - sqrtDisc) / (2 * q2), (-q1 + sqrtDisc) / (2 * q2));
        }
      }
      let best = Infinity;
      for (const root of roots) {
        if (root >= fromT - 1e-7 && root <= toT + 1e-7 && root < best) best = root;
      }
      return Number.isFinite(best) ? clamp(best, fromT, toT) : null;
    }

    // A vertical ray never changes X/Z, so the first cell contains the whole
    // useful interval. The same solver handles it without special sampling.
    if (!stepX && !stepZ) {
      const hit = firstRootInCell(ix, iz, t, tEnd);
      if (hit == null) return null;
      const x = origin.x + direction.x * hit;
      const z = origin.z + direction.z * hit;
      return { x, y: sample(x, z), z, distance: hit };
    }

    while (t <= tEnd + EPS && ix >= 0 && ix < cells - 1 && iz >= 0 && iz < cells - 1) {
      const cellEnd = Math.min(nextTX, nextTZ, tEnd);
      const hit = firstRootInCell(ix, iz, t, cellEnd);
      if (hit != null) {
        const x = origin.x + direction.x * hit;
        const z = origin.z + direction.z * hit;
        return { x, y: sample(x, z), z, distance: hit };
      }
      if (cellEnd >= tEnd - EPS) break;

      t = cellEnd;
      if (nextTX <= cellEnd + EPS) {
        ix += stepX;
        nextTX += deltaTX;
      }
      if (nextTZ <= cellEnd + EPS) {
        iz += stepZ;
        nextTZ += deltaTZ;
      }
    }
    return null;
  }

  function edgeFactor(x, z) {
    const margin = config.edgeMargin;
    const inner = half - margin;
    const d = Math.max(Math.abs(x), Math.abs(z));
    if (d <= inner) return 1;
    if (d >= half) return 0;
    const t = 1 - (d - inner) / margin;
    return t * t * (3 - 2 * t);
  }

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
    const index = iz * cells + ix;
    const next = clamp(value * allowed, config.minHeight, config.maxHeight);
    if (Math.abs(next - heights[index]) <= 1e-7) return false;
    heights[index] = next;
    markDirty(ix, iz, ix, iz);
    return true;
  }

  function falloff(distance, radius) {
    if (distance >= radius) return 0;
    const t = 1 - distance / radius;
    return t * t * (3 - 2 * t);
  }

  function hash2(ix, iz, seed = 0) {
    let n = (ix * 374761393 + iz * 668265263 + seed * 69069) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    n ^= n >>> 16;
    return (n >>> 0) / 4294967295;
  }

  function smoothNoise(x, z, scale, seed) {
    const gx = x * scale;
    const gz = z * scale;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const n00 = hash2(ix, iz, seed);
    const n10 = hash2(ix + 1, iz, seed);
    const n01 = hash2(ix, iz + 1, seed);
    const n11 = hash2(ix + 1, iz + 1, seed);
    const a = n00 + (n10 - n00) * sx;
    const b = n01 + (n11 - n01) * sx;
    return a + (b - a) * sz;
  }

  function fbm(x, z) {
    let amplitude = 0.57;
    let scale = config.noiseScale ?? 0.22;
    let sum = 0;
    let total = 0;
    const octaves = Math.max(1, Math.round(config.noiseOctaves ?? 4));
    for (let octave = 0; octave < octaves; octave += 1) {
      sum += smoothNoise(x, z, scale, (config.noiseSeed ?? 17) + octave * 31) * amplitude;
      total += amplitude;
      amplitude *= 0.5;
      scale *= 2.03;
    }
    return total > 0 ? sum / total : 0.5;
  }

  function neighbourAverage(ix, iz) {
    return (at(ix - 1, iz) + at(ix + 1, iz) + at(ix, iz - 1) + at(ix, iz + 1)) / 4;
  }

  function stamp(x, z, amount) {
    const { tool, radius, target, roughness } = openStroke;
    const minIx = Math.max(0, Math.floor(gridX(x - radius)));
    const maxIx = Math.min(cells - 1, Math.ceil(gridX(x + radius)));
    const minIz = Math.max(0, Math.floor(gridZ(z - radius)));
    const maxIz = Math.min(cells - 1, Math.ceil(gridZ(z + radius)));
    let changed = false;
    for (let iz = minIz; iz <= maxIz; iz += 1) {
      for (let ix = minIx; ix <= maxIx; ix += 1) {
        const wx = worldX(ix);
        const wz = worldZ(iz);
        const weight = falloff(Math.hypot(wx - x, wz - z), radius);
        if (weight <= 0) continue;
        const current = heights[iz * cells + ix];
        let next = current;
        if (tool === SCULPT_TOOLS.RAISE) {
          const noise = fbm(wx, wz);
          const rough = clamp(roughness ?? 0, 0, 1);
          const modulation = clamp(1 + (noise - 0.5) * 2 * (config.noiseAmplitude ?? 0.72) * rough, 0.35, 1.75);
          next = current + amount * weight * modulation;
        } else if (tool === SCULPT_TOOLS.LOWER) {
          next = current - amount * weight;
        } else if (tool === SCULPT_TOOLS.SMOOTH) {
          const pull = clamp(weight * amount * config.smoothRate, 0, 1);
          next = current + (neighbourAverage(ix, iz) - current) * pull;
        } else if (tool === SCULPT_TOOLS.FLATTEN) {
          const pull = clamp(weight * amount * config.flattenRate, 0, 1);
          next = current + (target - current) * pull;
        }
        if (writeCell(ix, iz, next)) changed = true;
      }
    }
    return changed;
  }

  function pushUndo() {
    undoStack.push(Float32Array.from(heights));
    while (undoStack.length > config.undoLimit) undoStack.shift();
  }

  function beginStroke({ tool, radius, strength = defaultStrength, roughness = defaultRoughness, x = 0, z = 0 }) {
    if (openStroke) endStroke();
    pushUndo();
    openStroke = { tool, radius, strength, roughness, target: sample(x, z), x, z, appliedX: x, appliedZ: z, touched: false };
  }

  function moveTo(x, z) {
    if (!openStroke) return false;
    openStroke.x = x;
    openStroke.z = z;
    return true;
  }

  /**
   * Applies one frame of the open stroke. Returns TRUE when the height field
   * actually changed, which is what the caller uses to decide whether placed
   * objects need re-seating on the new ground:
   *
   *   if (height.tick(dt)) onTerrainChange();
   *
   * This used to `return 0` on every path, so that call was dead code and
   * buildings only caught up with the terrain when the finger was lifted.
   */
  function tick(dt) {
    if (!openStroke || !(dt > 0)) return false;
    const { x, z, appliedX, appliedZ, radius, strength } = openStroke;
    const distance = Math.hypot(x - appliedX, z - appliedZ);
    const steps = clamp(Math.ceil(distance / Math.max(0.1, radius / 3)), 1, 12);
    const amount = (strength * dt) / steps;
    let changed = false;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      if (stamp(appliedX + (x - appliedX) * t, appliedZ + (z - appliedZ) * t, amount)) changed = true;
    }
    openStroke.appliedX = x;
    openStroke.appliedZ = z;
    if (changed) openStroke.touched = true;
    return changed;
  }

  function endStroke() {
    if (!openStroke) return false;
    const { touched } = openStroke;
    openStroke = null;
    if (!touched) {
      undoStack.pop();
      return false;
    }
    finalizePending = true;
    scheduleSave();
    return true;
  }

  function undo() {
    endStroke();
    const previous = undoStack.pop();
    if (!previous) return false;
    heights.set(previous);
    markDirty();
    finalizePending = true;
    scheduleSave();
    return true;
  }

  function clear() {
    openStroke = null;
    pushUndo();
    heights.fill(0);
    markDirty();
    finalizePending = true;
    scheduleSave();
  }

  function isFlat() {
    for (let i = 0; i < heights.length; i += 1) if (Math.abs(heights[i]) > 1e-4) return false;
    return true;
  }

  function naturalize({ iterations = config.erosionIterations ?? 8, talus = config.erosionTalus ?? 0.28, rate = config.erosionRate ?? 0.24 } = {}) {
    endStroke();
    pushUndo();
    const delta = new Float32Array(heights.length);
    const passes = clamp(Math.round(iterations), 1, 24);
    const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let pass = 0; pass < passes; pass += 1) {
      delta.fill(0);
      for (let iz = 1; iz < cells - 1; iz += 1) {
        for (let ix = 1; ix < cells - 1; ix += 1) {
          const x = worldX(ix);
          const z = worldZ(iz);
          if (edgeFactor(x, z) * reservedFactor(x, z) < 0.15) continue;
          const index = iz * cells + ix;
          const current = heights[index];
          let steepest = 0;
          let targetIndex = -1;
          for (const [ox, oz] of neighbours) {
            const ni = (iz + oz) * cells + (ix + ox);
            const diff = current - heights[ni];
            if (diff > steepest) { steepest = diff; targetIndex = ni; }
          }
          if (targetIndex < 0 || steepest <= talus) continue;
          const move = Math.min((steepest - talus) * rate, steepest * 0.35);
          delta[index] -= move;
          delta[targetIndex] += move;
        }
      }
      for (let i = 0; i < heights.length; i += 1) heights[i] += delta[i];
    }
    for (let iz = 0; iz < cells; iz += 1) {
      for (let ix = 0; ix < cells; ix += 1) {
        const i = iz * cells + ix;
        const allowed = edgeFactor(worldX(ix), worldZ(iz)) * reservedFactor(worldX(ix), worldZ(iz));
        heights[i] = clamp(heights[i] * allowed, config.minHeight, config.maxHeight);
      }
    }
    markDirty();
    finalizePending = true;
    scheduleSave();
    return true;
  }

  function exportData() {
    const quantised = new Int16Array(heights.length);
    for (let i = 0; i < heights.length; i += 1) quantised[i] = Math.round(clamp(heights[i], -320, 320) * 100);
    let binary = "";
    const bytes = new Uint8Array(quantised.buffer);
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    return { version: 1, cells, spacing, data: btoa(binary) };
  }

  function decodePayload(payload) {
    const binary = atob(payload.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  function importData(payload, { save = true } = {}) {
    if (payload?.version !== 1 || typeof payload.data !== "string") return false;
    const oldCells = Math.round(Number(payload.cells));
    const oldSpacing = Number(payload.spacing);
    if (!Number.isFinite(oldCells) || oldCells < 2 || !Number.isFinite(oldSpacing) || oldSpacing <= 0) return false;
    try {
      const quantised = decodePayload(payload);
      if (quantised.length !== oldCells * oldCells) return false;
      const oldHeights = new Float32Array(quantised.length);
      for (let i = 0; i < oldHeights.length; i += 1) oldHeights[i] = quantised[i] / 100;
      const oldWorldSize = (oldCells - 1) * oldSpacing;
      const oldHalf = oldWorldSize / 2;
      const oldAt = (ix, iz) => oldHeights[clamp(iz, 0, oldCells - 1) * oldCells + clamp(ix, 0, oldCells - 1)];
      const oldSample = (x, z) => {
        const gx = clamp((x + oldHalf) / oldSpacing, 0, oldCells - 1);
        const gz = clamp((z + oldHalf) / oldSpacing, 0, oldCells - 1);
        const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
        return oldAt(ix, iz) * (1 - fx) * (1 - fz) + oldAt(ix + 1, iz) * fx * (1 - fz) + oldAt(ix, iz + 1) * (1 - fx) * fz + oldAt(ix + 1, iz + 1) * fx * fz;
      };
      for (let iz = 0; iz < cells; iz += 1) {
        for (let ix = 0; ix < cells; ix += 1) heights[iz * cells + ix] = oldSample(worldX(ix), worldZ(iz));
      }
      undoStack.length = 0;
      markDirty();
      finalizePending = true;
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
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 300); }
  function flushSave() { return saveTimer === null ? true : persist(); }
  function load() {
    try {
      const raw = localStorage.getItem(config.storageKey);
      if (raw) importData(JSON.parse(raw), { save: false });
    } catch (error) {
      console.warn("Terrain height could not be loaded", error);
    }
  }

  function ensureVertexMap(geometry) {
    const position = geometry.getAttribute("position");
    if (vertexMap && vertexMap.length === cells * cells) return;
    vertexMap = new Int32Array(cells * cells);
    vertexMap.fill(-1);
    for (let v = 0; v < position.count; v += 1) {
      const ix = clamp(Math.round(gridX(position.getX(v))), 0, cells - 1);
      const iz = clamp(Math.round(gridZ(-position.getY(v))), 0, cells - 1);
      vertexMap[iz * cells + ix] = v;
    }
  }

  function setLocalNormal(normal, vertex, ix, iz) {
    const dx = (at(ix + 1, iz) - at(ix - 1, iz)) / (2 * spacing);
    const dz = (at(ix, iz + 1) - at(ix, iz - 1)) / (2 * spacing);
    let nx = -dx, ny = dz, nz = 1;
    const inv = 1 / Math.hypot(nx, ny, nz);
    nx *= inv; ny *= inv; nz *= inv;
    normal.setXYZ(vertex, nx, ny, nz);
  }

  function applyTo(geometry) {
    ensureVertexMap(geometry);
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    if (dirty) {
      const minIx = clamp(dirtyMinIx, 0, cells - 1), maxIx = clamp(dirtyMaxIx, 0, cells - 1);
      const minIz = clamp(dirtyMinIz, 0, cells - 1), maxIz = clamp(dirtyMaxIz, 0, cells - 1);
      for (let iz = minIz; iz <= maxIz; iz += 1) {
        for (let ix = minIx; ix <= maxIx; ix += 1) {
          const v = vertexMap[iz * cells + ix];
          if (v >= 0) position.setZ(v, heights[iz * cells + ix]);
        }
      }
      const nminX = Math.max(0, minIx - 1), nmaxX = Math.min(cells - 1, maxIx + 1);
      const nminZ = Math.max(0, minIz - 1), nmaxZ = Math.min(cells - 1, maxIz + 1);
      for (let iz = nminZ; iz <= nmaxZ; iz += 1) {
        for (let ix = nminX; ix <= nmaxX; ix += 1) {
          const v = vertexMap[iz * cells + ix];
          if (v >= 0) setLocalNormal(normal, v, ix, iz);
        }
      }
      position.needsUpdate = true;
      normal.needsUpdate = true;
      dirty = false;
    }
    if (finalizePending) {
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      finalizePending = false;
    }
  }

  load();
  return {
    cells, spacing, heights, SCULPT_TOOLS, sample, slopeAt, raycast, applyTo,
    beginStroke, moveTo, tick, endStroke, undo, clear, naturalize,
    setBrushProfile({ strength, roughness } = {}) {
      if (Number.isFinite(strength)) defaultStrength = clamp(strength, 0.05, 3);
      if (Number.isFinite(roughness)) defaultRoughness = clamp(roughness, 0, 1);
      return { strength: defaultStrength, roughness: defaultRoughness };
    },
    get brushProfile() { return { strength: defaultStrength, roughness: defaultRoughness }; },
    isFlat, exportData, importData, flushSave,
    get isDirty() { return dirty || finalizePending; },
    get undoDepth() { return undoStack.length; },
    dispose() { clearTimeout(saveTimer); },
  };
}
