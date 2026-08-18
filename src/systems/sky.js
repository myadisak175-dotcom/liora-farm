import * as THREE from "three";
import { createFantasyHorizon } from "./background/fantasy-horizon.js";

function normalizeWind(direction = {}) {
  const x = Number(direction.x) || 0;
  const z = Number(direction.z) || 0;
  const length = Math.hypot(x, z) || 1;
  return new THREE.Vector2(x / length, z / length);
}

function wrapDistance(value, halfSpan) {
  const span = halfSpan * 2;
  return ((((value + halfSpan) % span) + span) % span) - halfSpan;
}

/**
 * Soft, low-poly cloud field.
 *
 * The old puffs were one static BasicMaterial ring. They looked like white
 * rocks suspended above the horizon and, more importantly, did not move with
 * the cloud shadows crossing the ground. This keeps the same single draw call
 * and small sphere budget, but adds a soft silhouette, a pale-blue underside
 * and a wrapped drift field driven by the world's wind direction.
 */
function buildCloudLayer(config, windConfig = {}) {
  const ringDefinitions = [
    { count: config.cloudCount, radius: config.cloudRingRadius, height: config.cloudHeight, phase: 0 },
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

  const geometry = new THREE.SphereGeometry(1, 12, 8);
  const baseCloud = new THREE.Color(config.cloudColor);
  const uniforms = {
    cloudTopColor: { value: baseCloud.clone() },
    cloudBottomColor: { value: new THREE.Color(config.lowerColor).lerp(baseCloud, 0.42) },
    cloudOpacity: { value: Number(config.cloudOpacity ?? 0.72) },
  };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    uniforms,
    vertexShader: `
      varying vec3 vCloudNormal;
      varying vec3 vCloudViewPosition;
      varying float vCloudUp;
      void main() {
        vec4 cloudPosition = vec4(position, 1.0);
        vec3 cloudNormal = normal;
        #ifdef USE_INSTANCING
          cloudPosition = instanceMatrix * cloudPosition;
          vec3 cloudScaleSq = vec3(
            dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz),
            dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz),
            dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz)
          );
          cloudNormal = (
            instanceMatrix * vec4(cloudNormal / max(cloudScaleSq, vec3(0.00001)), 0.0)
          ).xyz;
        #endif
        vec4 mvPosition = modelViewMatrix * cloudPosition;
        vCloudViewPosition = mvPosition.xyz;
        vCloudNormal = normalize(normalMatrix * cloudNormal);
        vCloudUp = normalize(cloudNormal).y;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 cloudTopColor;
      uniform vec3 cloudBottomColor;
      uniform float cloudOpacity;
      varying vec3 vCloudNormal;
      varying vec3 vCloudViewPosition;
      varying float vCloudUp;
      void main() {
        float topLight = smoothstep(-0.48, 0.82, vCloudUp);
        vec3 cloudColor = mix(cloudBottomColor, cloudTopColor, topLight);
        vec3 viewDirection = normalize(-vCloudViewPosition);
        float facing = abs(dot(normalize(vCloudNormal), viewDirection));
        float softEdge = smoothstep(0.025, 0.42, facing);
        float alpha = cloudOpacity * mix(0.22, 1.0, softEdge);
        alpha *= mix(0.9, 1.0, topLight);
        gl_FragColor = vec4(cloudColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, total);
  mesh.name = "SkyClouds";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -25;

  const scale = config.cloudScale ?? 1;
  const direction = normalizeWind(windConfig.direction);
  const side = new THREE.Vector2(-direction.y, direction.x);
  const halfSpan = Math.max(
    config.cloudRingRadius + (config.cloudSpread ?? 10) * 1.8,
    config.cloudRingRadius * 1.15
  );
  const driftSpeed = Math.max(0, Number(config.cloudDriftSpeed ?? 1.42) || 0);
  const bobAmount = Math.max(0, Number(config.cloudBob ?? 0.7) || 0);
  const morphAmount = THREE.MathUtils.clamp(Number(config.cloudMorph ?? 0.035) || 0, 0, 0.12);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const puffScale = new THREE.Vector3();
  const clusters = [];

  for (const ring of ringDefinitions) {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = (i / ring.count) * Math.PI * 2 + ring.phase + (i % 2) * 0.18;
      const radius = ring.radius + (i % 3) * 2.6 * scale;
      const centreX = Math.cos(angle) * radius;
      const centreZ = Math.sin(angle) * radius;
      const puffCount = puffCountFor(i);
      const cluster = {
        along: centreX * direction.x + centreZ * direction.y,
        across: centreX * side.x + centreZ * side.y,
        height: ring.height - (i % 2) * 1.1 * scale,
        phase: angle * 1.37 + i * 0.41,
        puffs: [],
      };

      for (let p = 0; p < puffCount; p += 1) {
        const offsetX = (p - puffCount / 2) * 1.4 * scale;
        const offsetZ = (((p * 7) % 3) - 1) * 0.8 * scale;
        cluster.puffs.push({
          along: offsetX * direction.x + offsetZ * direction.y,
          across: offsetX * side.x + offsetZ * side.y,
          y: (p % 2) * 0.45 * scale,
          xScale: (2.2 + (p % 2) * 0.8) * scale,
          yScale: (0.85 + (p % 3) * 0.25) * scale,
          zScale: (1.6 + ((p + 1) % 2) * 0.6) * scale,
          phase: cluster.phase + p * 0.83,
        });
      }
      clusters.push(cluster);
    }
  }

  let time = 0;
  function updateMatrices() {
    let index = 0;
    for (const cluster of clusters) {
      const centreAlong = wrapDistance(cluster.along + time * driftSpeed, halfSpan);
      const centreAcross = cluster.across + Math.sin(time * 0.025 + cluster.phase) * scale * 0.7;
      const centreX = direction.x * centreAlong + side.x * centreAcross;
      const centreZ = direction.y * centreAlong + side.y * centreAcross;
      const centreY = cluster.height + Math.sin(time * 0.08 + cluster.phase) * bobAmount;

      for (const puff of cluster.puffs) {
        if (index >= mesh.count) break;
        const flutter = Math.sin(time * 0.11 + puff.phase);
        const along = puff.along + flutter * scale * 0.055;
        const across = puff.across + Math.cos(time * 0.09 + puff.phase) * scale * 0.04;
        position.set(
          centreX + direction.x * along + side.x * across,
          centreY + puff.y + flutter * bobAmount * 0.18,
          centreZ + direction.y * along + side.y * across
        );
        const morph = 1 + flutter * morphAmount;
        puffScale.set(puff.xScale * morph, puff.yScale / morph, puff.zScale * (2 - morph));
        matrix.compose(position, quaternion, puffScale);
        mesh.setMatrixAt(index, matrix);
        index += 1;
      }
      if (index >= mesh.count) break;
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function setAtmosphere(horizon, lower) {
    const brightness = THREE.MathUtils.clamp(
      horizon.r * 0.2126 + horizon.g * 0.7152 + horizon.b * 0.0722,
      0.08,
      1
    );
    uniforms.cloudTopColor.value
      .copy(baseCloud)
      .multiplyScalar(0.2 + brightness * 0.8)
      .lerp(horizon, 0.12);
    uniforms.cloudBottomColor.value
      .copy(horizon)
      .lerp(lower, 0.55)
      .lerp(baseCloud, 0.34)
      .multiplyScalar(0.42 + brightness * 0.58);
  }

  function setDensity(value) {
    const density = THREE.MathUtils.clamp(Number(value ?? 1), 0.25, 1);
    mesh.count = Math.max(12, Math.round(total * density));
    updateMatrices();
  }

  setDensity(1);
  return {
    mesh,
    geometry,
    material,
    update(delta = 0) {
      time = (time + Math.max(0, Number(delta) || 0)) % 100000;
      updateMatrices();
    },
    setAtmosphere,
    setDensity,
  };
}

export function createSky(config, distantRangeConfig = {}, windConfig = {}) {
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
      zenithHold: { value: Number(config.zenithHold ?? 0.62) },
      sunDirection: { value: new THREE.Vector3(0.4, 0.8, 0.2).normalize() },
      sunColor: { value: new THREE.Color(config.sunColor ?? 0xfff5dc) },
      sunSize: { value: Number(config.sunSize ?? 0.028) },
      sunGlow: { value: Number(config.sunGlow ?? 0.34) },
      sunStrength: { value: 1 },
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
      uniform float zenithHold;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform float sunSize;
      uniform float sunGlow;
      uniform float sunStrength;
      varying vec3 vSkyDirection;
      void main() {
        vec3 direction = normalize(vSkyDirection);
        float y = clamp(direction.y, -1.0, 1.0);
        vec3 color;
        if (y >= 0.0) {
          // Reach full sky colour early and hold it: a summer sky is blue
          // nearly all the way down, with the pale band kept to the last few
          // degrees above the ground.
          float t = smoothstep(0.0, max(0.08, zenithHold), y);
          color = mix(horizonColor, zenithColor, t * t * (3.0 - 2.0 * t));
        } else {
          float t = smoothstep(0.0, 0.95, -y);
          color = mix(horizonColor, lowerColor, t);
        }

        // The sun, drawn straight into the dome. sunSize is the angular
        // radius of the disc in radians, so it has to be compared against an
        // angle — a cosine threshold of the same number is twenty times wider
        // than it looks, which turns the sun into a fog bank. The two halo
        // terms are the tight core bloom and the warm wash around it.
        float toSun = max(dot(direction, sunDirection), 0.0);
        float angleToSun = acos(clamp(toSun, -1.0, 1.0));
        float disc = 1.0 - smoothstep(sunSize * 0.72, sunSize, angleToSun);
        float halo = pow(toSun, 900.0) * 0.55 + pow(toSun, 40.0) * 0.2;
        color += sunColor * (halo * sunGlow + disc * 0.75) * sunStrength;

        gl_FragColor = vec4(color, 1.0);
        // Not decoration. A hand-written ShaderMaterial gets none of three's
        // output pipeline for free: without these the dome wrote raw linear
        // values straight to the canvas and skipped tone mapping entirely, so
        // the sky was the one large surface in frame graded differently from
        // everything beneath it — and no amount of tuning the ground colours
        // could make the two meet at the horizon.
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
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

  const clouds = buildCloudLayer(config, windConfig);
  group.add(clouds.mesh);

  let fantasyHorizon = createFantasyHorizon(distantRangeConfig);
  group.add(fantasyHorizon.group);

  let lastHorizon = null;
  let lastLower = null;

  return {
    group,
    update(camera, delta = 0) {
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      clouds.update(delta);
      fantasyHorizon.update();
    },
    /**
     * Where the sun sits and how strongly it burns through. Strength goes to
     * zero below the horizon so the disc sets instead of sinking through the
     * ground and glowing from underneath it.
     */
    setSun(direction, color, strength = 1) {
      if (direction) skyMaterial.uniforms.sunDirection.value.copy(direction).normalize();
      if (color) skyMaterial.uniforms.sunColor.value.copy(color);
      skyMaterial.uniforms.sunStrength.value = THREE.MathUtils.clamp(Number(strength) || 0, 0, 1);
    },
    setColors(zenith, horizon, lower) {
      skyMaterial.uniforms.zenithColor.value.copy(zenith);
      skyMaterial.uniforms.horizonColor.value.copy(horizon);
      skyMaterial.uniforms.lowerColor.value.copy(lower);
      clouds.setAtmosphere(horizon, lower);
      lastHorizon = horizon;
      lastLower = lower;
      fantasyHorizon.setAtmosphere(horizon, lower);
    },
    rebuildDistantRange(nextConfig) {
      group.remove(fantasyHorizon.group);
      fantasyHorizon.dispose();
      fantasyHorizon = createFantasyHorizon(nextConfig);
      group.add(fantasyHorizon.group);
      if (lastHorizon && lastLower) fantasyHorizon.setAtmosphere(lastHorizon, lastLower);
    },
    setStars(amount) {
      starMaterial.opacity = THREE.MathUtils.clamp(amount, 0, 1) * (config.starOpacity ?? 0.9);
      stars.visible = starMaterial.opacity > 0.01;
    },
    setQuality(preset = {}) {
      clouds.setDensity(preset.skyCloudDensity ?? 1);
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
