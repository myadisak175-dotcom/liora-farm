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

function applyTextureDistanceFade(material, config = {}) {
  if (!material?.map) return;
  const start = Math.max(0, Number(config.textureFadeStart) || 80);
  const end = Math.max(start + 1, Number(config.textureFadeEnd) || 150);
  material.userData = material.userData || {};
  material.userData.textureFade = { start, end };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOuterTextureFadeStart = { value: start };
    shader.uniforms.uOuterTextureFadeEnd = { value: end };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vOuterWorldRadius;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvOuterWorldRadius = length( transformed.xz );");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vOuterWorldRadius;\nuniform float uOuterTextureFadeStart;\nuniform float uOuterTextureFadeEnd;"
      )
      .replace(
        "#include <map_fragment>",
        [
          "vec3 outerWorldBaseDiffuse = diffuseColor.rgb;",
          "#include <map_fragment>",
          "float outerWorldTextureFade = smoothstep( uOuterTextureFadeStart, uOuterTextureFadeEnd, vOuterWorldRadius );",
          "diffuseColor.rgb = mix( diffuseColor.rgb, outerWorldBaseDiffuse, outerWorldTextureFade );",
        ].join("\n")
      );
  };
  material.customProgramCacheKey = () => `outer-world-texture-fade:${start}:${end}`;
}

export function createOuterWorldGround({ config = {}, texture = null, textureWorldSize = 80 } = {}) {
  const group = new THREE.Group();
  group.name = "OuterWorldGround";

  if (config.enabled === false) {
    return { group, mesh: null, stats: { meshes: 0, triangles: 0 }, dispose() {} };
  }

  const geometry = buildOuterWorldGeometry(config, textureWorldSize);
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    vertexColors: true,
    fog: true,
  });
  material.name = "OuterWorldGroundMaterial";
  applyTextureDistanceFade(material, config);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "OuterWorldGroundMesh";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = Number(config.renderOrder) || -8;
  group.add(mesh);

  return {
    group,
    mesh,
    stats: { meshes: 1, triangles: (geometry.index?.count ?? 0) / 3 },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
