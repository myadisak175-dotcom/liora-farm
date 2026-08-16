import * as THREE from "three";
import { createFantasyHorizon } from "./background/fantasy-horizon.js";
import { DISTANT_RANGE_CONFIG } from "./background/distant-range-config.js";

/**
 * The cloud layer used to be one THREE.Mesh per puff — roughly 85 separate
 * objects, so 85 draw calls every frame for decoration. They share a geometry
 * and a material, which is exactly the case InstancedMesh exists for: same
 * clouds, one draw call.
 */
function buildCloudLayer(config) {
  const ringDefinitions = [
    {
      count: config.cloudCount,
      radius: config.cloudRingRadius,
      height: config.cloudHeight,
      phase: 0,
    },
    {
      count: Math.max(6, Math.round(config.cloudCount * 0.7)),
      radius: config.cloudRingRadius + (config.cloudSpread ?? 10),
      height: config.cloudHeight + (config.cloudSpread ?? 10) * 0.35,
      phase: 0.47,
    },
  ];

  const puffCountFor = (i) => 4 + (i % 3);
  let total = 0;
  for (const ring of ringDefinitions) {
    for (let i = 0; i < ring.count; i += 1) total += puffCountFor(i);
  }

  const geometry = new THREE.SphereGeometry(1, 10, 6);
  const material = new THREE.MeshBasicMaterial({
    color: config.cloudColor,
    transparent: true,
    opacity: config.cloudOpacity,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, total);
  mesh.name = "SkyClouds";
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -25;

  const scale = config.cloudScale ?? 1;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const puffScale = new THREE.Vector3();
  let index = 0;

  for (const ring of ringDefinitions) {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = (i / ring.count) * Math.PI * 2 + ring.phase + (i % 2) * 0.18;
      const radius = ring.radius + (i % 3) * 2.6 * scale;
      const centreX = Math.cos(angle) * radius;
      const centreY = ring.height - (i % 2) * 1.1 * scale;
      const centreZ = Math.sin(angle) * radius;

      const puffCount = puffCountFor(i);
      for (let p = 0; p < puffCount; p += 1) {
        position.set(
          centreX + (p - puffCount / 2) * 1.4 * scale,
          centreY + (p % 2) * 0.45 * scale,
          centreZ + (((p * 7) % 3) - 1) * 0.8 * scale
        );
        puffScale.set(
          (2.2 + (p % 2) * 0.8) * scale,
          (0.85 + (p % 3) * 0.25) * scale,
          (1.6 + ((p + 1) % 2) * 0.6) * scale
        );
        matrix.compose(position, quaternion, puffScale);
        mesh.setMatrixAt(index, matrix);
        index += 1;
      }
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, geometry, material };
}

export function createSky(config, distantRangeConfig = DISTANT_RANGE_CONFIG) {
  const group = new THREE.Group();
  group.name = "SkySystem";

  const skyGeometry = new THREE.SphereGeometry(config.radius, 40, 24);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      zenithColor: { value: new THREE.Color(config.zenithColor) },
      horizonColor: { value: new THREE.Color(config.horizonColor) },
      lowerColor: { value: new THREE.Color(config.lowerColor) },
    },
    vertexShader: `
      varying vec3 vSkyDirection;
      void main() {
        vSkyDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 zenithColor;
      uniform vec3 horizonColor;
      uniform vec3 lowerColor;
      varying vec3 vSkyDirection;

      void main() {
        float y = clamp(vSkyDirection.y, -1.0, 1.0);
        vec3 color;
        if (y >= 0.0) {
          float t = smoothstep(0.0, 0.88, y);
          color = mix(horizonColor, zenithColor, t);
        } else {
          float t = smoothstep(0.0, 0.95, -y);
          color = mix(horizonColor, lowerColor, t);
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const dome = new THREE.Mesh(skyGeometry, skyMaterial);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  group.add(dome);

  const starCount = config.starCount ?? 220;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const y = Math.random() * 0.92 + 0.08;
    const r = Math.sqrt(1 - y * y) * (config.radius - 2);
    starPositions[i * 3] = Math.cos(theta) * r;
    starPositions[i * 3 + 1] = y * (config.radius - 2);
    starPositions[i * 3 + 2] = Math.sin(theta) * r;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: config.starSize ?? 0.32,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.renderOrder = -900;
  group.add(stars);

  const clouds = buildCloudLayer(config);
  group.add(clouds.mesh);

  const fantasyHorizon = createFantasyHorizon(distantRangeConfig);
  group.add(fantasyHorizon.group);

  const baseCloud = new THREE.Color(config.cloudColor);

  return {
    group,
    update(camera) {
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      fantasyHorizon.update();
    },
    setColors(zenith, horizon, lower) {
      skyMaterial.uniforms.zenithColor.value.copy(zenith);
      skyMaterial.uniforms.horizonColor.value.copy(horizon);
      skyMaterial.uniforms.lowerColor.value.copy(lower);
      clouds.material.color.copy(baseCloud).lerp(horizon, 0.45);
      fantasyHorizon.setAtmosphere(horizon, lower);
    },
    setStars(amount) {
      starMaterial.opacity = THREE.MathUtils.clamp(amount, 0, 1) * (config.starOpacity ?? 0.9);
      stars.visible = starMaterial.opacity > 0.01;
    },
    dispose() {
      skyGeometry.dispose();
      skyMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      clouds.geometry.dispose();
      clouds.material.dispose();
      fantasyHorizon.dispose();
    },
  };
}
