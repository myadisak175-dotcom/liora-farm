import * as THREE from "three";

const EPS = 1e-8;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep01(value) {
  const t = clamp(value, 0, 1);
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
  const sx = smoothstep01(fx);
  const sz = smoothstep01(fz);
  const n00 = hash2(ix, iz, seed);
  const n10 = hash2(ix + 1, iz, seed);
  const n01 = hash2(ix, iz + 1, seed);
  const n11 = hash2(ix + 1, iz + 1, seed);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sz;
}

export function createRidgeProfile(config = {}) {
  const enabled = config.enabled !== false && config.type === "ridge";
  const radius = Math.max(0, Number(config.radius) || 0);
  const feather = Math.max(0.25, Number(config.feather) || 1);
  const height = Math.max(0, Number(config.height) || 0);
  const noiseAmplitude = Math.max(0, Number(config.noiseAmplitude) || 0);
  const noiseScale = Math.max(0.0001, Number(config.noiseScale) || 0.05);
  const noiseSeed = Math.round(Number(config.noiseSeed) || 0);

  function floor(x, z) {
    if (!enabled || height <= 0) return 0;
    const noise = (smoothNoise(x, z, noiseScale, noiseSeed) - 0.5) * 2;
    const start = radius + noise * noiseAmplitude;
    const distance = Math.hypot(x, z);
    return height * smoothstep01((distance - start) / feather);
  }

  return Object.freeze({
    enabled,
    type: config.type ?? "none",
    radius,
    feather,
    height,
    noiseAmplitude,
    noiseScale,
    noiseSeed,
    floor,
  });
}

function createCompositeRaycast({ heights, cells, spacing, worldSize }) {
  const half = worldSize / 2;
  const gridX = (x) => (x + half) / spacing;
  const gridZ = (z) => (z + half) / spacing;
  const worldX = (ix) => ix * spacing - half;
  const worldZ = (iz) => iz * spacing - half;
  const at = (ix, iz) => heights[clamp(iz, 0, cells - 1) * cells + clamp(ix, 0, cells - 1)];

  function sample(x, z) {
    const gx = clamp(gridX(x), 0, cells - 1);
    const gz = clamp(gridZ(z), 0, cells - 1);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    return at(ix, iz) * (1 - fx) * (1 - fz)
      + at(ix + 1, iz) * fx * (1 - fz)
      + at(ix, iz + 1) * (1 - fx) * fz
      + at(ix + 1, iz + 1) * fx * fz;
  }

  return function raycast(origin, direction, { maxDistance = 140 } = {}) {
    if (!(direction?.y < 0) || !(maxDistance > 0)) return null;

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

    const startY = origin.y + direction.y * t - sample(
      origin.x + direction.x * t,
      origin.z + direction.z * t
    );
    if (startY < -1e-6) return null;
    if (Math.abs(startY) <= 1e-6) {
      const x = origin.x + direction.x * t;
      const z = origin.z + direction.z * t;
      return { x, y: sample(x, z), z, distance: t };
    }

    const probeT = Math.min(tEnd, t + 1e-7);
    let ix = clamp(Math.floor(gridX(origin.x + direction.x * probeT)), 0, cells - 2);
    let iz = clamp(Math.floor(gridZ(origin.z + direction.z * probeT)), 0, cells - 2);
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
          const root = Math.sqrt(Math.max(0, disc));
          roots.push((-q1 - root) / (2 * q2), (-q1 + root) / (2 * q2));
        }
      }
      let best = Infinity;
      for (const root of roots) {
        if (root >= fromT - 1e-7 && root <= toT + 1e-7 && root < best) best = root;
      }
      return Number.isFinite(best) ? clamp(best, fromT, toT) : null;
    }

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
      if (nextTX <= cellEnd + EPS) { ix += stepX; nextTX += deltaTX; }
      if (nextTZ <= cellEnd + EPS) { iz += stepZ; nextTZ += deltaTZ; }
    }
    return null;
  };
}

export function createWorldBoundary({ config = {}, baseHeight, worldSize, spacing, renderOrder = 0 } = {}) {
  if (!baseHeight) throw new Error("World boundary needs the editable terrain height field");
  const profile = createRidgeProfile(config);
  if (!profile.enabled) {
    return {
      profile,
      height: baseHeight,
      heightView: baseHeight,
      sample: (x, z) => baseHeight.sample(x, z),
      createMesh: () => null,
      refresh() {},
      dispose() {},
    };
  }

  const cells = baseHeight.cells;
  const half = worldSize / 2;
  const floorGrid = new Float32Array(cells * cells);
  const compositeHeights = new Float32Array(cells * cells);
  const worldX = (ix) => ix * spacing - half;
  const worldZ = (iz) => iz * spacing - half;

  for (let iz = 0; iz < cells; iz += 1) {
    for (let ix = 0; ix < cells; ix += 1) {
      floorGrid[iz * cells + ix] = profile.floor(worldX(ix), worldZ(iz));
    }
  }

  function refresh() {
    const source = baseHeight.heights;
    for (let i = 0; i < compositeHeights.length; i += 1) {
      compositeHeights[i] = Math.max(source[i], floorGrid[i]);
    }
  }
  refresh();

  const raycast = createCompositeRaycast({
    heights: compositeHeights,
    cells,
    spacing,
    worldSize,
  });

  function sample(x, z) {
    return Math.max(baseHeight.sample(x, z), profile.floor(x, z));
  }

  function slopeAt(x, z) {
    const step = spacing;
    const dx = (sample(x + step, z) - sample(x - step, z)) / (2 * step);
    const dz = (sample(x, z + step) - sample(x, z - step)) / (2 * step);
    return Math.hypot(dx, dz);
  }

  const refreshAfter = new Set(["tick", "undo", "naturalize", "importData"]);
  const refreshAlways = new Set(["clear"]);
  const height = new Proxy(baseHeight, {
    get(target, property) {
      if (property === "heights") return compositeHeights;
      if (property === "sample") return sample;
      if (property === "slopeAt") return slopeAt;
      if (property === "raycast") return raycast;
      if (property === "boundaryFloor") return profile.floor;
      if (property === "worldBoundary") return profile;
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (refreshAlways.has(property)) {
        return (...args) => {
          const result = value(...args);
          refresh();
          return result;
        };
      }
      if (refreshAfter.has(property)) {
        return (...args) => {
          const result = value(...args);
          if (result) refresh();
          return result;
        };
      }
      return value;
    },
  });

  const heightView = Object.freeze({ cells, spacing, heights: compositeHeights });
  let mesh = null;

  function createMesh(material) {
    if (mesh || !material) return mesh;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const vertexMap = new Map();
    const atFloor = (ix, iz) => floorGrid[clamp(iz, 0, cells - 1) * cells + clamp(ix, 0, cells - 1)];

    function vertex(ix, iz) {
      const key = iz * cells + ix;
      if (vertexMap.has(key)) return vertexMap.get(key);
      const x = worldX(ix);
      const z = worldZ(iz);
      const y = atFloor(ix, iz) + 0.003;
      const dx = (atFloor(ix + 1, iz) - atFloor(ix - 1, iz)) / (2 * spacing);
      const dz = (atFloor(ix, iz + 1) - atFloor(ix, iz - 1)) / (2 * spacing);
      let nx = -dx;
      let ny = 1;
      let nz = -dz;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const index = positions.length / 3;
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      uvs.push((x + half) / worldSize, (-z + half) / worldSize);
      vertexMap.set(key, index);
      return index;
    }

    for (let iz = 0; iz < cells - 1; iz += 1) {
      for (let ix = 0; ix < cells - 1; ix += 1) {
        const f00 = atFloor(ix, iz);
        const f10 = atFloor(ix + 1, iz);
        const f01 = atFloor(ix, iz + 1);
        const f11 = atFloor(ix + 1, iz + 1);
        if (Math.max(f00, f10, f01, f11) <= 0.001) continue;
        const a = vertex(ix, iz);
        const b = vertex(ix + 1, iz);
        const c = vertex(ix + 1, iz + 1);
        const d = vertex(ix, iz + 1);
        indices.push(a, d, b, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    // The ridge shares the terrain material, which now declares vertexColors
    // for baked AO. A shared material with a missing attribute renders black,
    // so the ridge carries a neutral one rather than opting out of the shader.
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(
      new Float32Array(positions.length).fill(1),
      3
    ));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    mesh = new THREE.Mesh(geometry, material);
    mesh.name = "HomeIslandWorldBoundary";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = renderOrder;
    mesh.userData.worldBoundary = true;
    return mesh;
  }

  return {
    profile,
    height,
    heightView,
    sample,
    slopeAt,
    raycast,
    createMesh,
    refresh,
    get mesh() { return mesh; },
    get triangleCount() { return mesh?.geometry?.index ? mesh.geometry.index.count / 3 : 0; },
    dispose() {
      mesh?.geometry?.dispose();
      mesh = null;
    },
  };
}
