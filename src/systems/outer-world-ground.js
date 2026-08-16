import * as THREE from "three";

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
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
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function broadNoise(angle, t, seed) {
  const phase = seed * 0.173;
  const angular =
    Math.sin(angle * 3 + phase) * 0.48 +
    Math.sin(angle * 7 - phase * 1.7) * 0.27 +
    Math.sin(angle * 11 + phase * 0.63) * 0.15;
  const radial = Math.sin(angle * 5 + t * 8.4 + phase * 2.1) * 0.1;
  return angular + radial;
}

function squareRadiusAtAngle(halfSize, angle) {
  const sx = Math.abs(Math.sin(angle));
  const cz = Math.abs(Math.cos(angle));
  return halfSize / Math.max(1e-6, sx, cz);
}

export function buildOuterWorldGeometry(config = {}, textureWorldSize = 80) {
  const uvWorld = Math.max(1, Number(textureWorldSize) || 80);
  const terrainHalf = uvWorld / 2;

  // `innerRadius` used to mean a circular ring radius. Home Farm is square,
  // so that circle cut deeply through the playable terrain near the corners.
  // Keep the config name for compatibility, but interpret it as the half-size
  // of the square seam. With 38.5 on an 80 m terrain the visual mesh overlaps
  // the real terrain by only 1.5 m on every side, including the corners.
  const innerHalfSize = clamp(
    Number(config.innerRadius) || terrainHalf - 1.5,
    1,
    Math.max(1, terrainHalf)
  );
  const maxInnerRadius = innerHalfSize * Math.SQRT2;
  const outerRadius = Math.max(maxInnerRadius + 1, Number(config.outerRadius) || 82);
  const innerY = Number.isFinite(config.innerY) ? config.innerY : -0.08;
  const outerY = Number.isFinite(config.outerY) ? config.outerY : 0.6;
  const heightVariation = Math.max(0, Number(config.heightVariation) || 0);
  const segments = clamp(Math.round(Number(config.segments) || 80), 24, 160);
  const rings = clamp(Math.round(Number(config.rings) || 10), 2, 32);
  const seed = Number(config.noiseSeed) || 0;

  const nearColor = colorChannels(config.colorNear ?? 0xffffff);
  const midColor = colorChannels(config.colorMid ?? 0xe5edcc);
  const farColor = colorChannels(config.colorFar ?? 0xc7d2b8);

  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const eased = smoothstep01(t);
    const baseY = innerY + (outerY - innerY) * eased;
    const envelope = Math.pow(Math.sin(Math.PI * t), 0.8);
    const tint = t < 0.56
      ? mixColor(nearColor, midColor, t / 0.56)
      : mixColor(midColor, farColor, (t - 0.56) / 0.44);

    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = segment / segments * TAU;
      const seamRadius = squareRadiusAtAngle(innerHalfSize, angle);
      const radius = seamRadius + (outerRadius - seamRadius) * eased;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const y = baseY + broadNoise(angle, t, seed) * heightVariation * envelope;

      positions.push(x, y, z);
      colors.push(tint[0], tint[1], tint[2]);
      uvs.push(x / uvWorld + 0.5, -z / uvWorld + 0.5);
    }
  }

  const row = segments + 1;
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = ring * row + segment;
      const b = a + 1;
      const d = (ring + 1) * row + segment;
      const c = d + 1;
      indices.push(a, d, b, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

/**
 * Cheap visual-only land outside Home Farm's playable terrain.
 *
 * The inner seam follows the real square terrain edge, then smoothly rounds out
 * into a broad circular horizon. It is never used for collision, ground
 * sampling, Builder placement, sculpting, farming or persistence; its only job
 * is to make the visible world feel much larger than the gameplay grid without
 * letting a circular visual mesh cut through the playable square.
 */
export function createOuterWorldGround({ config = {}, texture = null, textureWorldSize = 80 } = {}) {
  const group = new THREE.Group();
  group.name = "OuterWorldGround";

  if (config.enabled === false) {
    return {
      group,
      mesh: null,
      stats: { meshes: 0, triangles: 0 },
      dispose() {},
    };
  }

  const geometry = buildOuterWorldGeometry(config, textureWorldSize);
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    vertexColors: true,
    fog: true,
  });
  material.name = "OuterWorldGroundMaterial";

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "OuterWorldGroundMesh";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = Number(config.renderOrder) || -8;
  group.add(mesh);

  return {
    group,
    mesh,
    stats: {
      meshes: 1,
      triangles: (geometry.index?.count ?? 0) / 3,
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
