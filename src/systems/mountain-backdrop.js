import * as THREE from "three";

const DEG = Math.PI / 180;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function colorChannels(hex) {
  const value = Number(hex) >>> 0;
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

function mixColor(a, b, t) {
  const k = clamp(t, 0, 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function crestNoise(seed, i) {
  const a = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  const b = Math.sin(seed * 39.3468 + i * 11.135) * 24634.6345;
  return (a - Math.floor(a)) * 0.65 + (b - Math.floor(b)) * 0.35 - 0.5;
}

function pushVertex(positions, colors, x, y, z, color) {
  positions.push(x, y, z);
  colors.push(color[0], color[1], color[2]);
  return positions.length / 3 - 1;
}

function buildLayerGeometry(layer = {}) {
  const chunks = Array.isArray(layer.chunks) ? layer.chunks : [];
  const positions = [];
  const colors = [];
  const indices = [];

  const baseY = Number.isFinite(layer.baseY) ? layer.baseY : -14;
  const shoulderRatio = clamp(Number(layer.shoulderRatio) || 0.62, 0.2, 0.9);
  const defaultRadius = (Number(layer.innerRadius) + Number(layer.outerRadius)) / 2 || 120;
  const depth = Math.max(6, Math.abs(Number(layer.outerRadius) - Number(layer.innerRadius)) || 16);
  const depthJitter = Math.max(0, Number(layer.depthJitter) || 0);
  const crestSegments = clamp(Math.round(Number(layer.crestSegments) || 9), 3, 24);
  const crestRoughness = clamp(Number(layer.crestRoughness) ?? 0.3, 0, 0.9);

  const low = colorChannels(layer.colorLow ?? 0x6d8360);
  const mid = colorChannels(layer.colorMid ?? 0x7d8f72);
  const peak = colorChannels(layer.colorPeak ?? 0x93a08d);

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    const angle = (Number(chunk.angle) || 0) * DEG;
    const radius = Number(chunk.radius) || defaultRadius;
    const span = clamp(Number(chunk.span) || 30, 8, 80) * DEG;
    const peakY = Number.isFinite(chunk.height)
      ? chunk.height
      : (Number(layer.peakMin) + Number(layer.peakMax)) / 2 || 18;
    const rise = Math.max(0.1, peakY - baseY);
    const halfWidth = Math.max(3, radius * Math.sin(span / 2));
    const seed = chunkIndex + 1 + Math.abs(Number(layer.baseY) || 0) * 0.017;

    const radialX = Math.sin(angle);
    const radialZ = Math.cos(angle);
    const tangentX = Math.cos(angle);
    const tangentZ = -Math.sin(angle);

    const point = (side, radialOffset, y) => ({
      x: radialX * (radius + radialOffset) + tangentX * (halfWidth * side),
      y,
      z: radialZ * (radius + radialOffset) + tangentZ * (halfWidth * side),
    });

    const frontRow = [];
    const crestRow = [];
    const backRow = [];

    for (let i = 0; i <= crestSegments; i += 1) {
      const u = i / crestSegments;
      const side = u * 2 - 1;
      const bell = Math.pow(Math.cos(side * Math.PI * 0.5), 0.85);
      const wobble = 1 + crestNoise(seed, i) * crestRoughness;
      const shoulder = shoulderRatio + (1 - shoulderRatio) * bell;
      const crestY = baseY + rise * bell * shoulder * Math.max(0.05, wobble);
      const crestOffset = crestNoise(seed * 1.7, i + 5) * depthJitter;
      const heightMix = clamp((crestY - baseY) / rise, 0, 1);

      frontRow.push(point(side, -depth * 0.45, baseY));
      crestRow.push({ point: point(side, crestOffset, crestY), heightMix });
      backRow.push(point(side, depth * 0.55, baseY));
    }

    const frontIndex = [];
    const crestIndex = [];
    const backIndex = [];
    for (let i = 0; i <= crestSegments; i += 1) {
      const f = frontRow[i];
      const c = crestRow[i];
      const b = backRow[i];
      const crestColor = c.heightMix < 0.55
        ? mixColor(low, mid, c.heightMix / 0.55)
        : mixColor(mid, peak, (c.heightMix - 0.55) / 0.45);
      frontIndex.push(pushVertex(positions, colors, f.x, f.y, f.z, low));
      crestIndex.push(pushVertex(positions, colors, c.point.x, c.point.y, c.point.z, crestColor));
      backIndex.push(pushVertex(positions, colors, b.x, b.y, b.z, low));
    }

    for (let i = 0; i < crestSegments; i += 1) {
      indices.push(
        frontIndex[i], crestIndex[i], frontIndex[i + 1],
        frontIndex[i + 1], crestIndex[i], crestIndex[i + 1],
        crestIndex[i], backIndex[i], crestIndex[i + 1],
        crestIndex[i + 1], backIndex[i], backIndex[i + 1]
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function createLayer(layer, name, renderOrder, depth) {
  const geometry = buildLayerGeometry(layer);
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    fog: true,
    side: THREE.DoubleSide,
  });
  material.name = `${name}Material`;
  // `depth` is how far into the haze this band sits, 0 near .. 1 far. Scene
  // fog already pulls these toward the fog colour, but fog is one flat colour
  // per frame while a real range separates because each band sits further
  // into the air. Tinting the material toward the live sky colour by depth is
  // what makes two ridges read as two distances rather than one cutout.
  material.userData.hazeDepth = depth;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = renderOrder;
  return { mesh, geometry, material };
}

export function createMountainBackdrop(config = {}) {
  const group = new THREE.Group();
  group.name = "MountainBackdrop";

  if (config.enabled === false) {
    return {
      group,
      meshes: [],
      stats: { meshes: 0, triangles: 0 },
      dispose() {},
    };
  }

  const hazeStrength = THREE.MathUtils.clamp(Number(config.hazeStrength ?? 0.45), 0, 1);
  const layers = [];
  if (config.far?.chunks?.length) {
    layers.push(createLayer(config.far, "FarMountainBackdrop", -21, 1));
  }
  if (config.near?.chunks?.length) {
    layers.push(createLayer(config.near, "NearMountainBackdrop", -20, 0.55));
  }

  for (const layer of layers) group.add(layer.mesh);

  const triangles = layers.reduce(
    (sum, layer) => sum + (layer.geometry.index?.count ?? 0) / 3,
    0
  );

  return {
    group,
    meshes: layers.map((layer) => layer.mesh),
    stats: { meshes: layers.length, triangles },
    /**
     * Called every frame by the day/night cycle with the sky's current horizon
     * colour, so the ranges shift with the hour instead of staying stuck on a
     * daytime grey-green while the sky goes orange behind them.
     */
    setAtmosphere(horizonColor) {
      if (!horizonColor || hazeStrength <= 0) return;
      for (const layer of layers) {
        const haze = hazeStrength * layer.material.userData.hazeDepth;
        // Not a lerp of material.color: the ridge colours live in the vertex
        // attribute, and material.color multiplies them, so lerping it toward
        // a dark night sky would just crush the mountains to black. Fading the
        // albedo down while adding the sky back as emissive reproduces
        // mix(rock, sky, haze) — light lost to distance, replaced by light
        // scattered in the air between here and there.
        layer.material.color.setRGB(1 - haze, 1 - haze, 1 - haze);
        layer.material.emissive.setRGB(
          horizonColor.r * haze,
          horizonColor.g * haze,
          horizonColor.b * haze
        );
      }
    },
    dispose() {
      for (const layer of layers) {
        layer.geometry.dispose();
        layer.material.dispose();
      }
    },
  };
}

export { buildLayerGeometry };
