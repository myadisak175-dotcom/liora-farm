// Pure, deterministic map content. No storage, renderer or DOM is involved.
function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function catmull(a, b, c, d, t) {
  return 0.5 * ((2 * b) + (-a + c) * t
    + (2 * a - 5 * b + 4 * c - d) * t * t
    + (-a + 3 * b - 3 * c + d) * t * t * t);
}

export function sampleWoodlandTrails(config) {
  return config.trails.map((points) => {
    const samples = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[Math.max(0, i - 1)];
      const b = points[i];
      const c = points[i + 1];
      const d = points[Math.min(points.length - 1, i + 2)];
      const steps = Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / config.trailSpacing);
      for (let step = 0; step < steps; step += 1) {
        const t = step / steps;
        samples.push({
          x: catmull(a[0], b[0], c[0], d[0], t),
          z: catmull(a[1], b[1], c[1], d[1], t),
        });
      }
    }
    const last = points.at(-1);
    samples.push({ x: last[0], z: last[1] });
    return samples;
  });
}

export function distanceToWoodlandTrail(x, z, trails) {
  let closest = Infinity;
  for (const trail of trails) {
    for (let i = 1; i < trail.length; i += 1) {
      const a = trail[i - 1];
      const b = trail[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz;
      const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq)) : 0;
      closest = Math.min(closest, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
    }
  }
  return closest;
}

export function woodlandItemAllowed(item, {
  blockers = [], heightAt = () => 0, waterLevel = -Infinity, config,
} = {}) {
  const radius = item.clearance;
  if (blockers.some((area) => Math.hypot(item.x - area.x, item.z - area.z)
      < radius + area.radius + config.obstacleMargin)) return false;
  const height = heightAt(item.x, item.z);
  if (!Number.isFinite(height) || height < waterLevel + config.waterClearance) return false;
  const step = 0.5;
  const dx = (heightAt(item.x + step, item.z) - heightAt(item.x - step, item.z)) / (2 * step);
  const dz = (heightAt(item.x, item.z + step) - heightAt(item.x, item.z - step)) / (2 * step);
  return Number.isFinite(dx + dz) && Math.hypot(dx, dz) <= config.maxSlope;
}

export function createWoodlandPlan(config, assets) {
  const random = randomFrom(config.seed);
  const trails = sampleWoodlandTrails(config);
  const { bounds } = config;
  const items = [];

  function pick(choices) {
    const available = choices.filter((choice) => assets[choice.id] && choice.weight > 0);
    let weight = random() * available.reduce((sum, choice) => sum + choice.weight, 0);
    for (const choice of available) {
      weight -= choice.weight;
      if (weight <= 0) return assets[choice.id];
    }
    return available.length ? assets[available.at(-1).id] : null;
  }

  function pointInGrove() {
    const grove = config.groves[Math.floor(random() * config.groves.length)];
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * grove.radius;
    return { x: grove.x + Math.cos(angle) * radius, z: grove.z + Math.sin(angle) * radius };
  }

  function scatter(kind, count, choices) {
    let placed = 0;
    for (let attempt = 0; placed < count && attempt < count * config.placementAttempts; attempt += 1) {
      const asset = pick(choices);
      if (!asset) break;
      const point = pointInGrove();
      const { x, z } = point;
      const scale = kind === "tree"
        ? config.treeScaleMin + random() * (config.treeScaleMax - config.treeScaleMin)
        : 0.7 + random() * 0.55;
      const radius = asset.walkRadius * scale;
      // Tree crowns can overlap, but trunks and the entire trail stay clear.
      const clearance = kind === "tree" ? Math.max(radius, asset.sourceWidth * scale * 0.24)
        : Math.max(radius, asset.sourceWidth * scale * 0.45);
      if (x - clearance < bounds.minX || x + clearance > bounds.maxX
          || z - clearance < bounds.minZ || z + clearance > bounds.maxZ) continue;
      if (distanceToWoodlandTrail(x, z, trails) < config.trailRadius + clearance) continue;
      if (config.clearings.some((area) => Math.hypot(x - area.x, z - area.z) < area.radius + clearance)) continue;
      if (items.some((other) => {
        const spacing = kind === "tree" && other.kind === "tree" ? config.treeSpacing
          : kind === "plant" && other.kind === "plant" ? config.plantSpacing
          : Math.max(0.65, radius + other.radius + 0.2);
        return Math.hypot(x - other.x, z - other.z) < spacing;
      })) continue;
      items.push({
        id: `woodland-${kind}-${placed}`, assetId: asset.id, kind,
        x: +x.toFixed(3), z: +z.toFixed(3),
        scale: +scale.toFixed(3), rotation: random() * Math.PI * 2,
        radius, clearance, densityRank: random(),
      });
      placed += 1;
    }
  }

  scatter("tree", config.treeCount, config.trees);
  scatter("rock", config.rockCount, config.rocks);
  scatter("plant", config.plantCount, config.plants);
  return { items, trails };
}

export function woodlandGroundStrokes(plan, activeItems, config) {
  const litter = activeItems.filter((item) => item.kind === "tree").map((item) => [
    item.x, item.z, config.litterRadius * item.scale, config.dirtLayer, config.litterStrength,
  ]);
  const trail = plan.trails.flatMap((points) => points.map((point, index) => [
    point.x, point.z,
    config.trailRadius * (0.96 + Math.sin(index * 0.55) * 0.04),
    config.dirtLayer, config.trailStrength,
  ]));
  return [...litter, ...trail];
}
