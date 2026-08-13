import * as THREE from "three";

export function createAnimatedWater({ size, config }) {
  const segments = Math.max(8, Math.round(config.segments ?? 28));
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const material = new THREE.MeshStandardMaterial({
    color: config.color,
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
  let shaderRef = null;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = { value: 0 };
    shader.uniforms.uWaveHeight = { value: waveHeight };
    shader.uniforms.uWaveScale = { value: waveScale };
    shader.uniforms.uWaveSpeed = { value: waveSpeed };
    shader.uniforms.uShimmerStrength = { value: shimmerStrength };

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
       uniform float uWaterTime;
       uniform float uWaveHeight;
       uniform float uWaveScale;
       uniform float uWaveSpeed;
       varying vec2 vWaterCoord;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float waterT = uWaterTime * uWaveSpeed;
       float waveA = sin((position.x * 0.62 + position.y * 0.28) * uWaveScale + waterT * 1.30);
       float waveB = sin((position.y * 0.74 - position.x * 0.21) * uWaveScale * 1.35 - waterT * 1.05);
       float waveC = sin((position.x + position.y) * uWaveScale * 0.42 + waterT * 0.72);
       transformed.z += (waveA * 0.52 + waveB * 0.33 + waveC * 0.15) * uWaveHeight;
       vWaterCoord = position.xy;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
       uniform float uWaterTime;
       uniform float uWaveSpeed;
       uniform float uShimmerStrength;
       varying vec2 vWaterCoord;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
       float shimmerT = uWaterTime * uWaveSpeed;
       float rippleA = 0.5 + 0.5 * sin(vWaterCoord.x * 0.92 + vWaterCoord.y * 0.38 + shimmerT * 1.85);
       float rippleB = 0.5 + 0.5 * sin(vWaterCoord.y * 1.18 - vWaterCoord.x * 0.31 - shimmerT * 1.42);
       float shimmer = smoothstep(0.79, 1.0, rippleA * 0.58 + rippleB * 0.42);
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.94, 1.0), shimmer * uShimmerStrength);`
    );
    shaderRef = shader;
  };
  material.customProgramCacheKey = () => "liora-animated-water-v1";

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
    },
  };
}
