import * as THREE from "three";

export function createSky(config) {
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

  // Lightweight star field. Visibility is faded by the day/night system.
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

  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: config.cloudColor,
    transparent: true,
    opacity: config.cloudOpacity,
    depthWrite: false,
    depthTest: true,
  });
  const cloudGeometry = new THREE.SphereGeometry(1, 10, 6);

  const ringDefinitions = [
    { count: config.cloudCount, radius: config.cloudRingRadius, height: config.cloudHeight, phase: 0 },
    { count: Math.max(6, Math.round(config.cloudCount * 0.7)), radius: config.cloudRingRadius + 10, height: config.cloudHeight + 4, phase: 0.47 },
  ];

  for (const ring of ringDefinitions) {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = (i / ring.count) * Math.PI * 2 + ring.phase + (i % 2) * 0.18;
      const radius = ring.radius + (i % 3) * 2.6;
      const cloud = new THREE.Group();
      cloud.position.set(
        Math.cos(angle) * radius,
        ring.height - (i % 2) * 1.1,
        Math.sin(angle) * radius
      );

      const puffCount = 4 + (i % 3);
      for (let p = 0; p < puffCount; p += 1) {
        const puff = new THREE.Mesh(cloudGeometry, cloudMaterial);
        puff.position.set(
          (p - puffCount / 2) * 1.4,
          (p % 2) * 0.45,
          ((p * 7) % 3 - 1) * 0.8
        );
        puff.scale.set(
          2.2 + (p % 2) * 0.8,
          0.85 + (p % 3) * 0.25,
          1.6 + ((p + 1) % 2) * 0.6
        );
        cloud.add(puff);
      }
      group.add(cloud);
    }
  }

  return {
    group,
    update(camera) {
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
    },
    setColors(zenith, horizon, lower) {
      skyMaterial.uniforms.zenithColor.value.copy(zenith);
      skyMaterial.uniforms.horizonColor.value.copy(horizon);
      skyMaterial.uniforms.lowerColor.value.copy(lower);
    },
    setStars(amount) {
      starMaterial.opacity = THREE.MathUtils.clamp(amount, 0, 1) * (config.starOpacity ?? 0.9);
      stars.visible = starMaterial.opacity > 0.01;
    },
  };
}
