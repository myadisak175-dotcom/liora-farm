function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function distanceToSegment(x, z, a, b) {
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const wx = x - a[0];
  const wz = z - a[1];
  const vv = vx * vx + vz * vz;
  if (vv <= 1e-8) return Math.hypot(wx, wz);
  const t = clamp01((wx * vx + wz * vz) / vv);
  return Math.hypot(x - (a[0] + vx * t), z - (a[1] + vz * t));
}

function distanceToPolyline(x, z, points) {
  let best = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    best = Math.min(best, distanceToSegment(x, z, points[index], points[index + 1]));
  }
  return best;
}

function radialWeight(x, z, entry) {
  const radius = Math.max(0.01, Number(entry.radius) || 0.01);
  const inner = Math.max(0, Math.min(radius, Number(entry.innerRadius) || 0));
  const distance = Math.hypot(x - Number(entry.x || 0), z - Number(entry.z || 0));
  if (distance >= radius) return 0;
  if (distance <= inner || radius <= inner) return 1;
  return 1 - smoothstep((distance - inner) / (radius - inner));
}

function applyTerrainSeed(height, spec = {}) {
  if (!height?.heights || !Number.isFinite(height.cells) || !Number.isFinite(height.spacing)) return false;

  const cells = height.cells;
  const spacing = height.spacing;
  const half = ((cells - 1) * spacing) / 2;
  const values = height.heights;
  const baseHeight = Number(spec.baseHeight) || 0;
  const lakes = Array.isArray(spec.lakes) ? spec.lakes : [];
  const rivers = Array.isArray(spec.rivers) ? spec.rivers : [];
  const hills = Array.isArray(spec.hills) ? spec.hills : [];
  const flats = Array.isArray(spec.flats) ? spec.flats : [];
  const bridges = Array.isArray(spec.bridges) ? spec.bridges : [];
  const edgeStart = Number(spec.edgeFade?.start);
  const edgeEnd = Number(spec.edgeFade?.end);

  values.fill(baseHeight);

  for (let iz = 0; iz < cells; iz += 1) {
    const z = iz * spacing - half;
    for (let ix = 0; ix < cells; ix += 1) {
      const x = ix * spacing - half;
      let value = baseHeight;

      for (const hill of hills) {
        const weight = radialWeight(x, z, hill);
        if (weight <= 0) continue;
        value += (Number(hill.height) || 0) * weight;
      }

      for (const lake of lakes) {
        const weight = radialWeight(x, z, lake);
        if (weight <= 0) continue;
        value = Math.min(value, (Number(lake.depth) || -1) * weight);
      }

      for (const river of rivers) {
        const points = Array.isArray(river.points) ? river.points : [];
        if (points.length < 2) continue;
        const width = Math.max(0.05, Number(river.width) || 1);
        const feather = Math.max(width, Number(river.feather) || width * 2);
        const distance = distanceToPolyline(x, z, points);
        if (distance >= feather) continue;
        const weight = distance <= width ? 1 : 1 - smoothstep((distance - width) / (feather - width));
        value = Math.min(value, (Number(river.depth) || -0.9) * weight);
      }

      for (const bridge of bridges) {
        const dx = Math.abs(x - Number(bridge.x || 0));
        const dz = Math.abs(z - Number(bridge.z || 0));
        const halfWidth = Math.max(0.1, Number(bridge.halfWidth) || 1.5);
        const halfDepth = Math.max(0.1, Number(bridge.halfDepth) || 1.2);
        const feather = Math.max(0.05, Number(bridge.feather) || 0.7);
        if (dx > halfWidth + feather || dz > halfDepth + feather) continue;
        const wx = 1 - smoothstep(Math.max(0, dx - halfWidth) / feather);
        const wz = 1 - smoothstep(Math.max(0, dz - halfDepth) / feather);
        const weight = Math.min(wx, wz);
        const target = Number(bridge.height) || 0;
        value = value * (1 - weight) + target * weight;
      }

      for (const flat of flats) {
        const weight = radialWeight(x, z, flat);
        if (weight <= 0) continue;
        const target = Number(flat.height) || 0;
        value = value * (1 - weight) + target * weight;
      }

      if (Number.isFinite(edgeStart) && Number.isFinite(edgeEnd) && edgeEnd > edgeStart) {
        const edgeDistance = Math.max(Math.abs(x), Math.abs(z));
        if (edgeDistance > edgeStart) {
          const weight = 1 - smoothstep((edgeDistance - edgeStart) / (edgeEnd - edgeStart));
          value *= weight;
        }
      }

      values[iz * cells + ix] = value;
    }
  }

  // exportData reads the edited Float32Array; importing that payload marks the
  // real terrain mesh dirty through the system's supported path and persists it.
  const applied = height.importData(height.exportData());
  height.flushSave?.();
  return applied;
}

function applyPaintSeed(paint, spec = {}) {
  if (!paint?.importData) return false;

  const layerIds = spec.layerIds ?? {};
  const strokes = [];
  const groups = [];
  const resolveLayer = (value) => {
    if (Number.isFinite(value)) return Number(value);
    return Number(layerIds[value]);
  };

  function addStamp(x, z, radius, layer, strength = 1) {
    const layerId = resolveLayer(layer);
    if (!Number.isFinite(layerId)) return;
    strokes.push([
      +Number(x).toFixed(2),
      +Number(z).toFixed(2),
      +Number(radius).toFixed(2),
      layerId,
      +Number(strength).toFixed(2),
    ]);
  }

  function addGroup(fn) {
    const start = strokes.length;
    fn();
    const count = strokes.length - start;
    if (count > 0) groups.push(count);
  }

  for (const area of Array.isArray(spec.areas) ? spec.areas : []) {
    addGroup(() => addStamp(area.x, area.z, area.radius, area.layer, area.strength ?? 1));
  }

  for (const route of Array.isArray(spec.routes) ? spec.routes : []) {
    const points = Array.isArray(route.points) ? route.points : [];
    if (points.length < 2) continue;
    addGroup(() => {
      for (let index = 0; index < points.length - 1; index += 1) {
        const a = points[index];
        const b = points[index + 1];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const distance = Math.hypot(dx, dz);
        const step = Math.max(0.25, Number(route.step) || Number(route.radius) * 0.7 || 1);
        const steps = Math.max(1, Math.ceil(distance / step));
        for (let i = 0; i <= steps; i += 1) {
          if (index > 0 && i === 0) continue;
          const t = i / steps;
          addStamp(
            a[0] + dx * t,
            a[1] + dz * t,
            route.radius,
            route.layer,
            route.strength ?? 1
          );
        }
      }
    });
  }

  for (const ring of Array.isArray(spec.rings) ? spec.rings : []) {
    addGroup(() => {
      const count = Math.max(3, Math.round(Number(ring.count) || 12));
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2;
        addStamp(
          Number(ring.x) + Math.cos(angle) * Number(ring.radius),
          Number(ring.z) + Math.sin(angle) * Number(ring.radius),
          ring.stampRadius,
          ring.layer,
          ring.strength ?? 1
        );
      }
    });
  }

  const applied = paint.importData({
    version: 1,
    strokes,
    groups,
    autoSurface: spec.autoSurface !== false,
  });
  paint.flushSave?.();
  return applied;
}

/**
 * Seeds an authored blockout map from compact, human-readable map data.
 * The feature is opt-in: production maps without `blockout` never execute it.
 * Once the map is exported from the editor it becomes ordinary baked
 * groundPaint + terrainHeight data and no longer needs this generator.
 */
export function applyBlockoutPreset({ height, paint, preset }) {
  if (!preset || typeof preset !== "object") return { terrain: false, paint: false };
  return {
    terrain: preset.terrain ? applyTerrainSeed(height, preset.terrain) : false,
    paint: preset.paint ? applyPaintSeed(paint, preset.paint) : false,
  };
}
