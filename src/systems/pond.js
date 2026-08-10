import * as THREE from "three";

export function createPond(config) {
  const group = new THREE.Group();
  group.name = "HomeIslandPond";
  group.position.set(config.position.x, config.y, config.position.z);

  const points = config.outline.map(([x, z]) => new THREE.Vector2(x, z));
  const shape = new THREE.Shape(points);

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: config.bankColor,
    roughness: 1,
    metalness: 0,
  });
  const base = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    baseMaterial
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.015;
  base.receiveShadow = true;
  group.add(base);

  const waterMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      shallowColor: { value: new THREE.Color(config.shallowColor) },
      deepColor: { value: new THREE.Color(config.deepColor) },
      highlightColor: { value: new THREE.Color(config.highlightColor) },
      opacity: { value: config.opacity },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 shallowColor;
      uniform vec3 deepColor;
      uniform vec3 highlightColor;
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vec2 p = vWorldPosition.xz;
        float w1 = sin(p.x * 2.2 + time * 1.25) * 0.5 + 0.5;
        float w2 = sin(p.y * 2.8 - time * 1.0 + p.x * 0.8) * 0.5 + 0.5;
        float wave = mix(w1, w2, 0.5);

        float radial = smoothstep(0.2, 0.95, length(vUv - 0.5) * 1.55);
        vec3 color = mix(deepColor, shallowColor, radial);

        float sparkle = smoothstep(0.78, 0.98, wave) * 0.22;
        color = mix(color, highlightColor, sparkle);

        gl_FragColor = vec4(color, opacity);
      }
    `,
  });

  const water = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    waterMaterial
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.028;
  water.renderOrder = config.renderOrder;
  group.add(water);

  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: config.stoneColor,
    roughness: 1,
    metalness: 0,
  });
  const stoneGeometry = new THREE.DodecahedronGeometry(0.25, 0);

  for (const stone of config.stones) {
    const mesh = new THREE.Mesh(stoneGeometry, stoneMaterial);
    mesh.position.set(stone.x, 0.08, stone.z);
    mesh.scale.set(stone.sx, stone.sy, stone.sz);
    mesh.rotation.set(stone.rx, stone.ry, stone.rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return {
    group,
    update(delta) {
      waterMaterial.uniforms.time.value += delta;
    },
  };
}
