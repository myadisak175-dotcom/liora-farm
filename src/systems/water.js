import * as THREE from "three";

export function createAnimatedWater({ size, config, terrainField, texture = null }) {
  const segments = Math.max(8, Math.round(config.segments ?? 28));
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: config.opacity,
    roughness: config.roughness,
    metalness: config.metalness,
    emissive: config.emissive,
    emissiveIntensity: config.emissiveIntensity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const waveHeight = config.waveHeight ?? 0.055;
  const waveScale = config.waveScale ?? 0.58;
  const waveSpeed = config.waveSpeed ?? 0.7;
  const shimmerStrength = config.shimmerStrength ?? 0.18;
  const shoreFade = config.shoreFade ?? 0.18;
  const foamDepth = config.foamDepth ?? 0.15;
  const shallowColor = new THREE.Color(config.shallowColor ?? 0x8ee4ef);
  const deepColor = new THREE.Color(config.deepColor ?? 0x287aa8);
  const foamColor = new THREE.Color(config.foamColor ?? 0xf4ffff);
  // Keep the shoreline warmer and less saturated than the open water. The
  // defaults are intentionally subtle so existing authored water colour still
  // leads; projects can override these later without touching the shader.
  const shorelineColor = new THREE.Color(config.shorelineColor ?? 0xbde8d4);
  const shorelineDepth = Math.max(0.03, config.shorelineDepth ?? 0.24);
  const shorelineStrength = THREE.MathUtils.clamp(
    config.shorelineStrength ?? 0.42,
    0,
    1
  );
  const depthColorStart = Math.max(0, config.depthColorStart ?? 0.08);
  const depthColorEnd = Math.max(
    depthColorStart + 0.05,
    config.depthColorEnd ?? Math.min(1.25, terrainField.maxDepth)
  );
  const textureRepeat = Math.max(0.25, config.textureRepeat ?? 4);
  const textureStrength = THREE.MathUtils.clamp(config.textureStrength ?? 0.35, 0, 1);
  const textureSpeed = new THREE.Vector2(
    config.textureSpeedX ?? 0.008,
    config.textureSpeedY ?? -0.006
  );
  let shaderRef = null;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = { value: 0 };
    shader.uniforms.uWaveHeight = { value: waveHeight };
    shader.uniforms.uWaveScale = { value: waveScale };
    shader.uniforms.uWaveSpeed = { value: waveSpeed };
    shader.uniforms.uShimmerStrength = { value: shimmerStrength };
    shader.uniforms.uTerrainField = { value: terrainField.texture };
    shader.uniforms.uTerrainMaxDepth = { value: terrainField.maxDepth };
    shader.uniforms.uShoreFade = { value: shoreFade };
    shader.uniforms.uFoamDepth = { value: foamDepth };
    shader.uniforms.uShallowColor = { value: shallowColor };
    shader.uniforms.uDeepColor = { value: deepColor };
    shader.uniforms.uFoamColor = { value: foamColor };
    shader.uniforms.uShorelineColor = { value: shorelineColor };
    shader.uniforms.uShorelineDepth = { value: shorelineDepth };
    shader.uniforms.uShorelineStrength = { value: shorelineStrength };
    shader.uniforms.uDepthColorStart = { value: depthColorStart };
    shader.uniforms.uDepthColorEnd = { value: depthColorEnd };

    let textureUniforms = "";
    let textureBlend = "";
    if (texture) {
      shader.uniforms.uWaterTexture = { value: texture };
      shader.uniforms.uWaterTextureRepeat = { value: textureRepeat };
      shader.uniforms.uWaterTextureStrength = { value: textureStrength };
      shader.uniforms.uWaterTextureSpeed = { value: textureSpeed };
      textureUniforms = `
       uniform sampler2D uWaterTexture;
       uniform float uWaterTextureRepeat;
       uniform float uWaterTextureStrength;
       uniform vec2 uWaterTextureSpeed;`;
      textureBlend = `
       vec2 waterDetailUv = vWaterUv * uWaterTextureRepeat
         + uWaterTextureSpeed * uWaterTime;
       vec3 waterDetail = texture2D(uWaterTexture, waterDetailUv).rgb;
       diffuseColor.rgb = mix(
         diffuseColor.rgb,
         waterDetail,
         uWaterTextureStrength * wet
       );`;
    }

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
       uniform float uWaterTime;
       uniform float uWaveHeight;
       uniform float uWaveScale;
       uniform float uWaveSpeed;
       varying vec2 vWaterCoord;
       varying vec2 vWaterUv;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float waterT = uWaterTime * uWaveSpeed;
       float waveA = sin((position.x * 0.62 + position.y * 0.28) * uWaveScale + waterT * 1.30);
       float waveB = sin((position.y * 0.74 - position.x * 0.21) * uWaveScale * 1.35 - waterT * 1.05);
       float waveC = sin((position.x + position.y) * uWaveScale * 0.42 + waterT * 0.72);
       transformed.z += (waveA * 0.52 + waveB * 0.33 + waveC * 0.15) * uWaveHeight;
       vWaterCoord = position.xy;
       vWaterUv = uv;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
       uniform float uWaterTime;
       uniform float uWaterSpeed;
       uniform float uWaveSpeed;
       uniform float uShimmerStrength;
       uniform sampler2D uTerrainField;
       uniform float uTerrainMaxDepth;
       uniform float uShoreFade;
       uniform float uFoamDepth;
       uniform vec3 uShallowColor;
       uniform vec3 uDeepColor;
       uniform vec3 uFoamColor;
       uniform vec3 uShorelineColor;
       uniform float uShorelineDepth;
       uniform float uShorelineStrength;
       uniform float uDepthColorStart;
       uniform float uDepthColorEnd;
       varying vec2 vWaterCoord;
       varying vec2 vWaterUv;${textureUniforms}`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
       float depth = texture2D(uTerrainField, vWaterUv).r * uTerrainMaxDepth;
       float wet = smoothstep(0.0, uShoreFade, depth);
       float deepMix = smoothstep(uDepthColorStart, uDepthColorEnd, depth);
       diffuseColor.rgb = mix(uShallowColor, uDeepColor, deepMix);

       float shoreline = 1.0 - smoothstep(0.015, uShorelineDepth, depth);
       diffuseColor.rgb = mix(
         diffuseColor.rgb,
         uShorelineColor,
         shoreline * uShorelineStrength * wet
       );
       diffuseColor.a *= wet;
       ${textureBlend}

       float shimmerT = uWaterTime * uWaveSpeed;
       float rippleA = 0.5 + 0.5 * sin(vWaterCoord.x * 0.92 + vWaterCoord.y * 0.38 + shimmerT * 1.85);
       float rippleB = 0.5 + 0.5 * sin(vWaterCoord.y * 1.18 - vWaterCoord.x * 0.31 - shimmerT * 1.42);
       float shimmer = smoothstep(0.79, 1.0, rippleA * 0.58 + rippleB * 0.42);
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.94, 1.0), shimmer * uShimmerStrength);

       float foamNear = 1.0 - smoothstep(uFoamDepth * 0.55, uFoamDepth, depth);
       float foamWet = smoothstep(0.018, 0.05, depth);
       float foamNoise = 0.70 + 0.30 * sin(vWaterCoord.x * 2.8 + vWaterCoord.y * 2.1 + shimmerT * 1.25);
       float foam = foamNear * foamWet * foamNoise;
       diffuseColor.rgb = mix(diffuseColor.rgb, uFoamColor, clamp(foam, 0.0, 0.82));`
    );
    shaderRef = shader;
  };
  material.customProgramCacheKey = () =>
    `liora-depth-water-v4-${texture ? "textured" : "plain"}`;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "HomeIslandWater";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = config.level;
  mesh.renderOrder = config.renderOrder ?? 1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return {
    mesh,
    level: config.level,
    update() {
      if (shaderRef) shaderRef.uniforms.uWaterTime.value = performance.now() * 0.001;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture?.dispose();
    },
  };
}
