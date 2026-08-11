import * as THREE from "three";

function toPoint(value) {
  if (Array.isArray(value)) return { x: Number(value[0]) || 0, z: Number(value[1]) || 0 };
  return { x: Number(value?.x) || 0, z: Number(value?.z) || 0 };
}

function samplePath(points, samplesPerSegment = 12) {
  const source = points.map(toPoint);
  if (source.length < 2) return source;

  const curve = new THREE.CatmullRomCurve3(
    source.map((point) => new THREE.Vector3(point.x, 0, point.z)),
    false,
    "centripetal",
    0.5
  );
  const samples = Math.max(8, (source.length - 1) * samplesPerSegment);
  return curve.getPoints(samples).map((point) => ({ x: point.x, z: point.z }));
}

function makeRibbon(points, width, y) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const halfWidth = width / 2;

  for (let i = 0; i < points.length; i += 1) {
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangentX = next.x - previous.x;
    const tangentZ = next.z - previous.z;
    const length = Math.hypot(tangentX, tangentZ) || 1;
    const normalX = -tangentZ / length;
    const normalZ = tangentX / length;
    const left = { x: points[i].x + normalX * halfWidth, z: points[i].z + normalZ * halfWidth };
    const right = { x: points[i].x - normalX * halfWidth, z: points[i].z - normalZ * halfWidth };

    positions.push(left.x, y, left.z, right.x, y, right.z);
    uvs.push(i / Math.max(1, points.length - 1), 0, i / Math.max(1, points.length - 1), 1);

    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function distanceToSegment(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1) : 0;
  const px = a.x + dx * t;
  const pz = a.z + dz * t;
  return { distance: Math.hypot(x - px, z - pz), t, x: px, z: pz };
}

function nearestPathPoint(x, z, points) {
  let best = { distance: Infinity, x, z, segment: 0, t: 0 };
  for (let i = 0; i < points.length - 1; i += 1) {
    const hit = distanceToSegment(x, z, points[i], points[i + 1]);
    if (hit.distance < best.distance) best = { ...hit, segment: i };
  }
  return best;
}

function createWaterMaterial(config) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 },
      deepColor: { value: new THREE.Color(config.deepColor) },
      shallowColor: { value: new THREE.Color(config.shallowColor) },
      highlightColor: { value: new THREE.Color(config.highlightColor) },
      opacity: { value: config.opacity },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 deepColor;
      uniform vec3 shallowColor;
      uniform vec3 highlightColor;
      uniform float opacity;
      varying vec2 vUv;

      void main() {
        float flow = vUv.x * 18.0 - time * 0.8;
        float bandA = sin(flow + sin(vUv.y * 9.0 + time * 0.2) * 0.8) * 0.5 + 0.5;
        float bandB = sin(flow * 0.47 - vUv.y * 13.0) * 0.5 + 0.5;
        float shimmer = smoothstep(0.72, 0.98, mix(bandA, bandB, 0.45));
        float edge = smoothstep(0.0, 0.16, vUv.y) * smoothstep(0.0, 0.16, 1.0 - vUv.y);
        vec3 base = mix(deepColor, shallowColor, 0.35 + bandB * 0.25);
        base = mix(base, highlightColor, shimmer * 0.18 * edge);
        gl_FragColor = vec4(base, opacity * (0.78 + edge * 0.22));
      }
    `,
  });
}

function createBridge(config, points) {
  const bridgeConfig = config.bridge ?? {};
  const index = THREE.MathUtils.clamp(
    Math.round(Number(bridgeConfig.pathIndex ?? Math.floor(points.length / 2))),
    1,
    points.length - 2
  );
  const centre = points[index];
  const previous = points[index - 1];
  const next = points[index + 1];
  const tangentX = next.x - previous.x;
  const tangentZ = next.z - previous.z;
  const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
  const normalX = -tangentZ / tangentLength;
  const normalZ = tangentX / tangentLength;
  const group = new THREE.Group();
  group.name = "RiverBridge";
  group.position.set(centre.x, bridgeConfig.y ?? 0.14, centre.z);
  group.rotation.y = Math.atan2(-normalZ, normalX);

  const width = Number(bridgeConfig.width ?? 5.2);
  const depth = Number(bridgeConfig.depth ?? 1.7);
  const deckMaterial = new THREE.MeshStandardMaterial({
    color: bridgeConfig.deckColor ?? 0x8b5a36,
    roughness: 0.92,
    metalness: 0,
  });
  const railMaterial = new THREE.MeshStandardMaterial({
    color: bridgeConfig.railColor ?? 0x684127,
    roughness: 0.95,
    metalness: 0,
  });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, depth), deckMaterial);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, 0.14), railMaterial);
    rail.position.set(0, 0.42, side * (depth / 2 - 0.12));
    rail.castShadow = true;
    group.add(rail);
    for (const x of [-width * 0.42, width * 0.42]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), railMaterial);
      post.position.set(x, 0.27, side * (depth / 2 - 0.12));
      post.castShadow = true;
      group.add(post);
    }
  }

  return {
    group,
    centre,
    tangentX: tangentX / tangentLength,
    tangentZ: tangentZ / tangentLength,
    normalX,
    normalZ,
    width,
    depth,
    dispose() {
      group.traverse((node) => {
        if (node.isMesh) node.geometry.dispose();
      });
      deckMaterial.dispose();
      railMaterial.dispose();
    },
  };
}

export function createRiver(config = {}) {
  const group = new THREE.Group();
  group.name = "CalmRiver";
  const path = samplePath(config.points ?? [], config.samplesPerSegment ?? 12);
  if (path.length < 2) return { group, update() {}, isBlocked: () => false, dispose() {} };

  const width = Number(config.width ?? 4.4);
  const bankWidth = Number(config.bankWidth ?? 0.65);
  const bank = new THREE.Mesh(
    makeRibbon(path, width + bankWidth * 2, Number(config.bankY ?? 0.006)),
    new THREE.MeshStandardMaterial({
      color: config.bankColor ?? 0x9b8159,
      roughness: 1,
      metalness: 0,
    })
  );
  bank.name = "RiverBank";
  bank.receiveShadow = true;
  group.add(bank);

  const waterMaterial = createWaterMaterial({
    deepColor: config.deepColor ?? 0x2e87ae,
    shallowColor: config.shallowColor ?? 0x6fc6d4,
    highlightColor: config.highlightColor ?? 0xd7f7ef,
    opacity: config.opacity ?? 0.94,
  });
  const water = new THREE.Mesh(
    makeRibbon(path, width, Number(config.waterY ?? 0.026)),
    waterMaterial
  );
  water.name = "RiverWater";
  water.renderOrder = 2;
  group.add(water);

  const bridge = createBridge(config, path);
  group.add(bridge.group);

  function isBridgePoint(x, z) {
    const dx = x - bridge.centre.x;
    const dz = z - bridge.centre.z;
    const along = dx * bridge.tangentX + dz * bridge.tangentZ;
    const across = dx * bridge.normalX + dz * bridge.normalZ;
    return Math.abs(along) <= bridge.depth * 0.62 && Math.abs(across) <= bridge.width * 0.55;
  }

  return {
    group,
    water,
    bridge: bridge.group,
    update(delta) {
      waterMaterial.uniforms.time.value += Math.min(Number(delta) || 0, 0.05);
    },
    isInWater(x, z) {
      return nearestPathPoint(x, z, path).distance <= width * 0.48;
    },
    isBlocked(x, z) {
      return this.isInWater(x, z) && !isBridgePoint(x, z);
    },
    dispose() {
      bank.geometry.dispose();
      bank.material.dispose();
      water.geometry.dispose();
      waterMaterial.dispose();
      bridge.dispose();
    },
  };
}
