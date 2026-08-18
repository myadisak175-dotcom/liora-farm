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

function macroNoise(x, z, scale, seed) {
  const phase = seed * 0.071;
  const a = Math.sin(x * scale + phase) * 0.52;
  const b = Math.sin(z * scale * 0.83 - phase * 1.7) * 0.31;
  const c = Math.sin((x + z) * scale * 0.47 + phase * 0.6) * 0.17;
  return clamp(a + b + c, -1, 1);
}

/**
 * How much of the far hills' height is present at ring `t`.
 *
 * This used to be `sin(PI * t)`, which is zero at *both* ends — so the
 * outermost ring, the one ring that actually draws the horizon line, was
 * forced perfectly flat. That is why the world ended in a ruler-straight edge
 * no matter how large `heightVariation` grew, and why the painted backdrop
 * behind it was cut by a line rather than met by a skyline.
 *
 * Now the hills grow in over the first third of the ring and then hold, so the
 * rim is a silhouette. Exported because the height sampler and the mesh must
 * agree to the millimetre: they used to carry two copies of the same
 * expression, which is precisely the kind of pair that drifts apart.
 */
export function hillEnvelope(t) {
  return Math.pow(smoothstep01(clamp(t, 0, 1) / 0.34), 0.8);
}

function squareRadiusAtAngle(halfSize, angle) {
  const sx = Math.abs(Math.sin(angle));
  const cz = Math.abs(Math.cos(angle));
  return halfSize / Math.max(1e-6, sx, cz);
}

/** Inverse of smoothstep01, so a world radius can be turned back into a ring t. */
function inverseSmoothstep01(value) {
  const y = clamp(value, 0, 1);
  return 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3);
}

/**
 * The outer world's surface height at a world point, without a raycast.
 *
 * Scenery placed outside the playable square has to sit on this mesh, and it
 * is generated, not authored — so the only honest way to place anything on it
 * is to run the same formula the vertices came from. Sampling it any other way
 * (a fixed y, a raycast against a mesh that may not be built yet) is how you
 * get a tree line that floats in one build and sinks in the next.
 *
 * This solves the vertex loop backwards: world radius -> ring `t` -> the same
 * base/envelope/noise terms. It agrees with the mesh exactly at vertices and
 * interpolates between them; the mesh is flat-shaded triangles, so expect a
 * few centimetres of disagreement mid-triangle. Sink scenery slightly rather
 * than chasing that.
 */
export function createOuterWorldHeightSampler(config = {}, textureWorldSize = 80) {
  const terrainHalf = Math.max(1, Number(textureWorldSize) || 80) / 2;
  const innerHalfSize = clamp(
    Number(config.innerRadius) || terrainHalf - 1.5, 1, Math.max(1, terrainHalf)
  );
  const outerRadius = Math.max(
    innerHalfSize * Math.SQRT2 + 1, Number(config.outerRadius) || 82
  );
  const innerY = Number.isFinite(config.innerY) ? config.innerY : -0.08;
  const outerY = Number.isFinite(config.outerY) ? config.outerY : 0.6;
  const heightVariation = Math.max(0, Number(config.heightVariation) || 0);
  const edgeBlendWidth = Math.max(1, Number(config.edgeBlendWidth) || 40);
  const seed = Number(config.noiseSeed) || 0;

  return function heightAt(x, z) {
    const radius = Math.hypot(x, z);
    const angle = Math.atan2(x, z);
    const seamRadius = squareRadiusAtAngle(innerHalfSize, angle);
    const span = Math.max(1e-6, outerRadius - seamRadius);
    const eased = clamp((radius - seamRadius) / span, 0, 1);
    const t = inverseSmoothstep01(eased);

    const authoredBaseY = innerY + (outerY - innerY) * eased;
    const authoredEnvelope = hillEnvelope(t);
    const edgeBlend = smoothstep01(Math.max(0, radius - seamRadius) / edgeBlendWidth);

    const baseY = innerY + (authoredBaseY - innerY) * edgeBlend;
    const envelope = authoredEnvelope * edgeBlend;
    return baseY + broadNoise(angle, t, seed) * heightVariation * envelope;
  };
}

/**
 * Visual-only terrain outside the 80 m gameplay square.
 *
 * The first metres are deliberately boring: same texture, same tint and almost
 * the same height as the gameplay edge. Only after `edgeBlendWidth` do hills,
 * far tint and macro colour variation take over. This prevents the square farm
 * from reading as one material pasted on top of a different "outside world".
 */
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

  // Keep the first stretch beyond the farm edge visually continuous. The old
  // implementation started noise/tint immediately at the seam, which made the
  // playable square readable even though the geometry overlapped correctly.
  // 24 m turned out to be under one camera-width at default zoom, so the tint
  // change still landed on screen next to the untinted farm.
  const edgeBlendWidth = Math.max(1, Number(config.edgeBlendWidth) || 40);
  const macroStrength = clamp(Number(config.macroVariationStrength) || 0.16, 0, 0.5);
  const macroScale = Math.max(0.001, Number(config.macroVariationScale) || 0.018);

  const nearColor = colorChannels(config.colorNear ?? 0xffffff);
  const midColor = colorChannels(config.colorMid ?? 0xe5edcc);
  const farColor = colorChannels(config.colorFar ?? 0xc7d2b8);
  const macroWarm = colorChannels(config.macroWarmColor ?? 0xe5dfb2);
  const macroCool = colorChannels(config.macroCoolColor ?? 0xb4cbb5);

  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const eased = smoothstep01(t);
    const authoredBaseY = innerY + (outerY - innerY) * eased;
    const authoredEnvelope = hillEnvelope(t);
    const authoredTint = t < 0.56
      ? mixColor(nearColor, midColor, t / 0.56)
      : mixColor(midColor, farColor, (t - 0.56) / 0.44);

    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = segment / segments * TAU;
      const seamRadius = squareRadiusAtAngle(innerHalfSize, angle);
      const radius = seamRadius + (outerRadius - seamRadius) * eased;
      const distanceFromSeam = Math.max(0, radius - seamRadius);
      const edgeBlend = smoothstep01(distanceFromSeam / edgeBlendWidth);
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;

      // Do not let the decorative world peel away vertically right after the
      // real terrain ends. Height/noise grows in only after the blend band.
      const baseY = innerY + (authoredBaseY - innerY) * edgeBlend;
      const envelope = authoredEnvelope * edgeBlend;
      const y = baseY + broadNoise(angle, t, seed) * heightVariation * envelope;

      // Macro colour is broad, non-directional and vertex-based (effectively
      // free compared with sampling another texture). It breaks up large green
      // sheets after the fine grass texture has faded without making new bands.
      let tint = mixColor(nearColor, authoredTint, edgeBlend);
      const macro = macroNoise(x, z, macroScale, seed);
      const macroTarget = macro >= 0 ? macroWarm : macroCool;
      const macroAmount = Math.abs(macro) * macroStrength * edgeBlend;
      tint = mixColor(tint, macroTarget, macroAmount);

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
  geometry.userData = {
    ...(geometry.userData || {}),
    edgeBlendWidth,
    macroVariationStrength: macroStrength,
    macroVariationScale: macroScale,
  };
  return geometry;
}

/**
 * Fade high-frequency grass before grazing-angle mip levels turn it into long
 * horizontal streaks. The authored config is treated as an upper bound: on an
 * 80 m gameplay terrain we start no later than 60 m and finish no later than
 * 128 m. This keeps the real farm fully detailed but stops the same 5 m grass
 * tile being asked to describe hundreds of metres of horizon.
 *
 * A tiny per-vertex distance jitter makes the fade boundary organic rather
 * than a mathematically perfect ring. All trig runs in the vertex shader on a
 * ~2k-vertex mesh, not per pixel.
 */
function applyDistanceShading(material, config = {}, textureWorldSize = 80) {
  const worldSize = Math.max(1, Number(textureWorldSize) || 80);

  // `textureFadeReach` scales the anti-banding caps. The caps exist so a 5 m
  // grass tile is never asked to describe 600 m of horizon, but at 1.0 they
  // also killed the texture only ~22 m past the seam, which is precisely
  // where the eye is looking for continuity.
  const reach = clamp(Number(config.textureFadeReach) || 1, 0.4, 3);
  const requestedStart = Math.max(0, Number(config.textureFadeStart) || 80);
  const requestedEnd = Math.max(requestedStart + 1, Number(config.textureFadeEnd) || 150);
  const start = Math.min(requestedStart, worldSize * 0.75 * reach);
  const end = Math.max(start + 1, Math.min(requestedEnd, worldSize * 1.6 * reach));
  const jitter = Math.max(0, Number(config.textureFadeJitter) || 10);

  // Ground-only aerial perspective. Scene fog cannot cover this because the
  // horizon rules keep fog.near past the farm on purpose; this fades the far
  // ground into whatever colour the sky currently is instead.
  const innerRadius = Math.max(1, Number(config.innerRadius) || worldSize / 2);
  const outerRadius = Math.max(innerRadius + 1, Number(config.outerRadius) || 600);
  const skyStrength = clamp(Number(config.skyBlendStrength ?? 0.72), 0, 1);
  const skyStart = Number.isFinite(config.skyBlendStart)
    ? config.skyBlendStart
    : innerRadius + (Number(config.edgeBlendWidth) || 40) * 2;
  const skyEnd = Math.max(skyStart + 1, Number.isFinite(config.skyBlendEnd)
    ? config.skyBlendEnd
    : outerRadius * 0.78);

  const skyColor = new THREE.Color(config.skyBlendColor ?? 0xdff4ff);

  material.userData = material.userData || {};
  material.userData.textureFade = { requestedStart, requestedEnd, start, end, jitter, reach };
  material.userData.skyBlend = { start: skyStart, end: skyEnd, strength: skyStrength };

  const hasMap = Boolean(material.map);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOuterTextureFadeStart = { value: start };
    shader.uniforms.uOuterTextureFadeEnd = { value: end };
    shader.uniforms.uOuterTextureFadeJitter = { value: jitter };
    shader.uniforms.uOuterSkyColor = { value: skyColor };
    shader.uniforms.uOuterSkyBlendStart = { value: skyStart };
    shader.uniforms.uOuterSkyBlendEnd = { value: skyEnd };
    shader.uniforms.uOuterSkyBlendStrength = { value: skyStrength };
    // Keep a handle so day/night can retint without recompiling.
    material.userData.uniforms = shader.uniforms;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vOuterWorldRadius;\nvarying float vOuterFadeJitter;\nuniform float uOuterTextureFadeJitter;"
      )
      .replace(
        "#include <begin_vertex>",
        [
          "#include <begin_vertex>",
          "vOuterWorldRadius = length( transformed.xz );",
          "float outerJitterA = sin( transformed.x * 0.047 + transformed.z * 0.019 );",
          "float outerJitterB = sin( transformed.z * 0.041 - transformed.x * 0.013 );",
          "vOuterFadeJitter = ( outerJitterA * 0.65 + outerJitterB * 0.35 ) * uOuterTextureFadeJitter;",
        ].join("\n")
      );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      [
        "#include <common>",
        "varying float vOuterWorldRadius;",
        "varying float vOuterFadeJitter;",
        "uniform float uOuterTextureFadeStart;",
        "uniform float uOuterTextureFadeEnd;",
        "uniform vec3 uOuterSkyColor;",
        "uniform float uOuterSkyBlendStart;",
        "uniform float uOuterSkyBlendEnd;",
        "uniform float uOuterSkyBlendStrength;",
      ].join("\n")
    );

    if (hasMap) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        [
          "vec3 outerWorldBaseDiffuse = diffuseColor.rgb;",
          "#include <map_fragment>",
          "float outerWorldTextureFade = smoothstep(",
          "  uOuterTextureFadeStart + vOuterFadeJitter,",
          "  uOuterTextureFadeEnd + vOuterFadeJitter,",
          "  vOuterWorldRadius",
          ");",
          "diffuseColor.rgb = mix( diffuseColor.rgb, outerWorldBaseDiffuse, outerWorldTextureFade );",
        ].join("\n")
      );
    }

    // Done in linear working space, before tone mapping, so the blend behaves
    // like real atmosphere rather than a decal painted on the final image.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      [
        "float outerSkyBlend = smoothstep(",
        "  uOuterSkyBlendStart + vOuterFadeJitter,",
        "  uOuterSkyBlendEnd + vOuterFadeJitter,",
        "  vOuterWorldRadius",
        ") * uOuterSkyBlendStrength;",
        "outgoingLight = mix( outgoingLight, uOuterSkyColor, outerSkyBlend );",
        "#include <opaque_fragment>",
      ].join("\n")
    );
  };

  material.customProgramCacheKey = () =>
    `outer-world-blend:${hasMap}:${start}:${end}:${jitter}:${skyStart}:${skyEnd}:${skyStrength}`;

  return {
    /** Called every frame by day/night so the horizon colour always agrees. */
    setSkyColor(color) {
      skyColor.copy(color);
    },
  };
}

export function createOuterWorldGround({ config = {}, texture = null, textureWorldSize = 80 } = {}) {
  const group = new THREE.Group();
  group.name = "OuterWorldGround";

  if (config.enabled === false) {
    return {
      group,
      mesh: null,
      stats: { meshes: 0, triangles: 0 },
      setAtmosphere() {},
      dispose() {},
    };
  }

  const geometry = buildOuterWorldGeometry(config, textureWorldSize);
  // Was MeshLambertMaterial while the gameplay terrain is MeshStandardMaterial.
  // Two different BRDFs under the same lights means the two surfaces can never
  // agree in brightness at the seam, no matter how the colours are tuned.
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    fog: true,
  });
  material.name = "OuterWorldGroundMaterial";
  const shading = applyDistanceShading(material, config, textureWorldSize);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "OuterWorldGroundMesh";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = Number(config.renderOrder) || -8;
  group.add(mesh);

  return {
    group,
    mesh,
    material,
    stats: { meshes: 1, triangles: (geometry.index?.count ?? 0) / 3 },
    setAtmosphere(horizonColor) {
      if (horizonColor) shading.setSkyColor(horizonColor);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
