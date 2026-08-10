import * as THREE from "three";

export function createSky(config) {
  const group = new THREE.Group();
  group.name = "SkySystem";

  // Full 360° sky sphere. The gradient is based on the sphere's LOCAL
  // direction, so orbiting or moving the camera never shifts the horizon.
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

  // Clouds wrap around all azimuths instead of existing only on one side.
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
      // Keep the full sky sphere centered on the camera: no edge can ever be reached.
      dome.position.copy(camera.position);
    },
  };
}
