import * as THREE from "three";

export function createSky(config) {
  const group = new THREE.Group();
  group.name = "SkySystem";

  const skyGeometry = new THREE.SphereGeometry(config.radius, 32, 16);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenithColor: { value: new THREE.Color(config.zenithColor) },
      horizonColor: { value: new THREE.Color(config.horizonColor) },
      lowerColor: { value: new THREE.Color(config.lowerColor) },
    },
    vertexShader: `
      varying vec3 vWorldDirection;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(worldPosition.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 zenithColor;
      uniform vec3 horizonColor;
      uniform vec3 lowerColor;
      varying vec3 vWorldDirection;

      void main() {
        float y = clamp(vWorldDirection.y, -1.0, 1.0);
        vec3 color;

        if (y >= 0.0) {
          float t = smoothstep(0.0, 0.85, y);
          color = mix(horizonColor, zenithColor, t);
        } else {
          float t = smoothstep(0.0, 0.75, -y);
          color = mix(horizonColor, lowerColor, t);
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const dome = new THREE.Mesh(skyGeometry, skyMaterial);
  dome.frustumCulled = false;
  dome.renderOrder = -100;
  group.add(dome);

  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: config.cloudColor,
    transparent: true,
    opacity: config.cloudOpacity,
    depthWrite: false,
  });
  const cloudGeometry = new THREE.SphereGeometry(1, 10, 6);

  for (let i = 0; i < config.cloudCount; i += 1) {
    const angle = (i / config.cloudCount) * Math.PI * 2 + (i % 2) * 0.32;
    const radius = config.cloudRingRadius + (i % 3) * 4.5;
    const cloud = new THREE.Group();
    cloud.position.set(
      Math.cos(angle) * radius,
      config.cloudHeight - (i % 2) * 1.4,
      Math.sin(angle) * radius
    );

    const puffCount = 4 + (i % 3);
    for (let p = 0; p < puffCount; p += 1) {
      const puff = new THREE.Mesh(cloudGeometry, cloudMaterial);
      puff.position.set((p - puffCount / 2) * 1.4, (p % 2) * 0.45, ((p * 7) % 3 - 1) * 0.8);
      puff.scale.set(2.2 + (p % 2) * 0.8, 0.85 + (p % 3) * 0.25, 1.6 + ((p + 1) % 2) * 0.6);
      cloud.add(puff);
    }

    group.add(cloud);
  }

  return {
    group,
    update(camera) {
      dome.position.copy(camera.position);
    },
  };
}
