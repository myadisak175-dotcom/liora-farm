import * as THREE from "three";

const TAU = Math.PI * 2;
const LEAF_COLORS = Object.freeze([0x789f43, 0x94ad4c, 0xc59b45, 0x9b7440, 0x6d8d39]);
const DAY_INSECT_COLORS = Object.freeze([0xffd66e, 0xf7a8c6, 0xa8dff4, 0xf4f0c8]);
const NIGHT_INSECT_COLORS = Object.freeze([0xffe87d, 0xc9ff8a, 0x91f5c6]);

function clampCount(value, maximum) {
  const number = Number(value);
  return THREE.MathUtils.clamp(
    Number.isFinite(number) ? Math.round(number) : maximum,
    0,
    maximum
  );
}

/** Pure count resolver, exported so the mobile budgets stay testable. */
export function resolveEnvironmentCounts(preset = {}, config = {}) {
  const leaves = config.leaves ?? {};
  const insects = config.insects ?? {};
  const leafMaximum = Math.max(0, Math.round(Number(leaves.maxCount) || 0));
  const insectMaximum = Math.max(0, Math.round(Number(insects.maxCount) || 0));
  return {
    leaves: leaves.enabled === false ? 0 : clampCount(preset.leafCount, leafMaximum),
    insects: insects.enabled === false ? 0 : clampCount(preset.insectCount, insectMaximum),
  };
}

function groundAt(sample, x, z) {
  try {
    const value = Number(sample?.(x, z));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function makeLeafGeometry(size) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, size, 0,
    -size * 0.58, 0, size * 0.08,
    0, -size, 0,
    size * 0.58, 0, -size * 0.08,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function makeInsectTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    return texture;
  }
  context.clearRect(0, 0, 64, 64);
  context.fillStyle = "#fff";

  context.save();
  context.translate(31, 31);
  context.rotate(-0.48);
  context.beginPath();
  context.ellipse(-9, -4, 13, 7, 0, 0, TAU);
  context.fill();
  context.restore();

  context.save();
  context.translate(33, 31);
  context.rotate(0.48);
  context.beginPath();
  context.ellipse(9, -4, 13, 7, 0, 0, TAU);
  context.fill();
  context.restore();

  context.beginPath();
  context.ellipse(32, 34, 3, 12, 0, 0, TAU);
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function windSnapshot(wind) {
  const direction = wind?.uniforms?.direction?.value;
  const x = Number(direction?.x ?? 0.8);
  const z = Number(direction?.y ?? direction?.z ?? 0.35);
  const length = Math.hypot(x, z) || 1;
  return {
    x: x / length,
    z: z / length,
    strength: Math.max(0, Number(wind?.uniforms?.strength?.value ?? 0.55) || 0),
    gust: Math.max(0, Number(wind?.uniforms?.gustStrength?.value ?? 0.3) || 0),
    gustSpeed: Math.max(0.01, Number(wind?.uniforms?.gustSpeed?.value ?? 0.18) || 0.18),
  };
}

/**
 * Small life around the player: wind-carried leaves and a handful of flying
 * insects. Both effects are fixed-capacity InstancedMeshes, so changing the
 * quality tier changes matrix uploads, not draw calls or allocations.
 */
export function createEnvironmentLife({
  scene,
  config = {},
  wind = null,
  getGroundHeight = () => 0,
  waterLevel = null,
  quality = {},
} = {}) {
  const enabled = config.enabled !== false;
  const leafConfig = config.leaves ?? {};
  const insectConfig = config.insects ?? {};
  const group = new THREE.Group();
  group.name = "EnvironmentLife";

  const leafMaximum = enabled && leafConfig.enabled !== false
    ? Math.max(0, Math.round(Number(leafConfig.maxCount) || 0))
    : 0;
  const insectMaximum = enabled && insectConfig.enabled !== false
    ? Math.max(0, Math.round(Number(insectConfig.maxCount) || 0))
    : 0;

  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const quaternion = new THREE.Quaternion();
  const rollQuaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const cameraForward = new THREE.Vector3(0, 0, 1);

  let leafGeometry = null;
  let leafMaterial = null;
  let leafMesh = null;
  const leaves = [];
  if (leafMaximum > 0) {
    leafGeometry = makeLeafGeometry(Math.max(0.03, Number(leafConfig.size) || 0.12));
    leafMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      fog: true,
    });
    leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, leafMaximum);
    leafMesh.name = "WindLeaves";
    leafMesh.count = 0;
    leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    leafMesh.frustumCulled = false;
    leafMesh.castShadow = false;
    leafMesh.receiveShadow = false;
    leafMesh.renderOrder = 4;
    group.add(leafMesh);

    for (let i = 0; i < leafMaximum; i += 1) {
      leaves.push({
        position: new THREE.Vector3(),
        initialized: false,
        ground: 0,
        life: 0,
        phase: Math.random() * TAU,
        speed: 1,
        fall: 0.1,
        tumbleX: 1,
        tumbleY: 1,
        tumbleZ: 1,
        size: 1,
      });
      leafMesh.setColorAt(i, new THREE.Color(LEAF_COLORS[i % LEAF_COLORS.length]));
    }
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  }

  let insectGeometry = null;
  let insectTexture = null;
  let insectMaterial = null;
  let insectMesh = null;
  const insects = [];
  if (insectMaximum > 0) {
    const insectSize = Math.max(0.05, Number(insectConfig.size) || 0.16);
    insectGeometry = new THREE.PlaneGeometry(insectSize * 1.45, insectSize);
    insectTexture = makeInsectTexture();
    insectMaterial = new THREE.MeshBasicMaterial({
      map: insectTexture,
      color: 0xffffff,
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.84,
      alphaTest: 0.04,
      depthWrite: false,
      fog: true,
      toneMapped: false,
    });
    insectMesh = new THREE.InstancedMesh(insectGeometry, insectMaterial, insectMaximum);
    insectMesh.name = "FlyingInsects";
    insectMesh.count = 0;
    insectMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    insectMesh.frustumCulled = false;
    insectMesh.castShadow = false;
    insectMesh.receiveShadow = false;
    insectMesh.renderOrder = 5;
    group.add(insectMesh);

    for (let i = 0; i < insectMaximum; i += 1) {
      insects.push({
        anchor: new THREE.Vector3(),
        initialized: false,
        phase: Math.random() * TAU,
        orbit: 0.4,
        speed: 0.8,
        bobSpeed: 1.5,
        height: 1,
      });
    }
  }

  let activeLeaves = 0;
  let activeInsects = 0;
  let elapsed = 0;
  let nightMode = null;

  const numericWaterLevel = Number(waterLevel);
  const flightFloor = waterLevel !== null && waterLevel !== undefined && Number.isFinite(numericWaterLevel)
    ? numericWaterLevel
    : -Infinity;
  const surfaceAt = (x, z) => Math.max(flightFloor, groundAt(getGroundHeight, x, z));

  function setInsectPalette(night) {
    if (!insectMesh || nightMode === night) return;
    nightMode = night;
    const palette = night ? NIGHT_INSECT_COLORS : DAY_INSECT_COLORS;
    for (let i = 0; i < insectMaximum; i += 1) {
      insectMesh.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    }
    if (insectMesh.instanceColor) insectMesh.instanceColor.needsUpdate = true;
    insectMaterial.opacity = night ? 0.94 : 0.84;
    insectMaterial.blending = night ? THREE.AdditiveBlending : THREE.NormalBlending;
    insectMaterial.needsUpdate = true;
  }

  function setQuality(preset = {}) {
    const counts = resolveEnvironmentCounts(preset, {
      leaves: { ...leafConfig, maxCount: leafMaximum },
      insects: { ...insectConfig, maxCount: insectMaximum },
    });
    activeLeaves = enabled ? counts.leaves : 0;
    activeInsects = enabled ? counts.insects : 0;
    if (leafMesh) {
      leafMesh.count = activeLeaves;
      leafMesh.visible = activeLeaves > 0;
    }
    if (insectMesh) {
      insectMesh.count = activeInsects;
      insectMesh.visible = activeInsects > 0;
    }
  }

  function respawnLeaf(leaf, player, weather, initial = false) {
    const radius = Math.max(2, Number(leafConfig.radius) || 11);
    const sideX = -weather.z;
    const sideZ = weather.x;
    let along;
    let across;
    if (initial) {
      const angle = Math.random() * TAU;
      const distance = Math.sqrt(Math.random()) * radius;
      along = Math.cos(angle) * distance;
      across = Math.sin(angle) * distance;
    } else {
      along = -radius * (0.65 + Math.random() * 0.35);
      across = (Math.random() - 0.5) * radius * 1.8;
    }

    leaf.position.x = player.x + weather.x * along + sideX * across;
    leaf.position.z = player.z + weather.z * along + sideZ * across;
    leaf.ground = surfaceAt(leaf.position.x, leaf.position.z);
    const minHeight = Math.max(0.1, Number(leafConfig.minHeight) || 0.35);
    const maxHeight = Math.max(minHeight, Number(leafConfig.maxHeight) || 3.1);
    leaf.position.y = leaf.ground + minHeight + Math.random() * (maxHeight - minHeight);
    leaf.life = 7 + Math.random() * 9;
    leaf.phase = Math.random() * TAU;
    leaf.speed = (Number(leafConfig.speed) || 0.92) * (0.62 + Math.random() * 0.76);
    leaf.fall = (Number(leafConfig.fallSpeed) || 0.16) * (0.62 + Math.random() * 0.8);
    leaf.tumbleX = 0.7 + Math.random() * 1.8;
    leaf.tumbleY = 0.5 + Math.random() * 1.5;
    leaf.tumbleZ = 0.8 + Math.random() * 2.2;
    leaf.size = 0.68 + Math.random() * 0.62;
    leaf.initialized = true;
  }

  function updateLeaves(delta, player, weather) {
    if (!leafMesh || activeLeaves === 0) return;
    const radius = Math.max(2, Number(leafConfig.radius) || 11);
    const limitSq = (radius + 3) ** 2;
    const swirl = Math.max(0, Number(leafConfig.swirl) || 0.34);
    const sideX = -weather.z;
    const sideZ = weather.x;
    const gust = 1 + weather.gust * 0.34 * Math.sin(elapsed * weather.gustSpeed + 0.6);
    const drive = leafConfig.speed === 0 ? 0 : Math.max(0.25, weather.strength) * gust;

    for (let i = 0; i < activeLeaves; i += 1) {
      const leaf = leaves[i];
      if (!leaf.initialized) respawnLeaf(leaf, player, weather, true);
      leaf.life -= delta;
      const sideDrift = Math.sin(elapsed * 1.1 + leaf.phase) * swirl;
      leaf.position.x += (weather.x * leaf.speed * drive + sideX * sideDrift) * delta;
      leaf.position.z += (weather.z * leaf.speed * drive + sideZ * sideDrift) * delta;
      leaf.position.y += (-leaf.fall + Math.sin(elapsed * 2.15 + leaf.phase) * 0.055) * delta;

      const dx = leaf.position.x - player.x;
      const dz = leaf.position.z - player.z;
      if (leaf.position.y < leaf.ground + 0.34) {
        leaf.ground = surfaceAt(leaf.position.x, leaf.position.z);
      }
      if (leaf.life <= 0 || dx * dx + dz * dz > limitSq || leaf.position.y <= leaf.ground + 0.045) {
        respawnLeaf(leaf, player, weather, false);
      }

      euler.set(
        elapsed * leaf.tumbleX + leaf.phase,
        elapsed * leaf.tumbleY + leaf.phase * 0.7,
        elapsed * leaf.tumbleZ
      );
      quaternion.setFromEuler(euler);
      scale.setScalar(leaf.size);
      matrix.compose(leaf.position, quaternion, scale);
      leafMesh.setMatrixAt(i, matrix);
    }
    leafMesh.instanceMatrix.needsUpdate = true;
  }

  function respawnInsect(insect, player) {
    const radius = Math.max(2, Number(insectConfig.radius) || 8.5);
    const angle = Math.random() * TAU;
    const distance = 1.2 + Math.sqrt(Math.random()) * (radius - 1.2);
    insect.anchor.x = player.x + Math.cos(angle) * distance;
    insect.anchor.z = player.z + Math.sin(angle) * distance;
    const ground = surfaceAt(insect.anchor.x, insect.anchor.z);
    const minHeight = Math.max(0.2, Number(insectConfig.minHeight) || 0.45);
    const maxHeight = Math.max(minHeight, Number(insectConfig.maxHeight) || 1.75);
    insect.height = ground + minHeight + Math.random() * (maxHeight - minHeight);
    const orbitMin = Math.max(0.05, Number(insectConfig.orbitMin) || 0.22);
    const orbitMax = Math.max(orbitMin, Number(insectConfig.orbitMax) || 0.85);
    insect.orbit = orbitMin + Math.random() * (orbitMax - orbitMin);
    const speedMin = Math.max(0.05, Number(insectConfig.speedMin) || 0.55);
    const speedMax = Math.max(speedMin, Number(insectConfig.speedMax) || 1.15);
    insect.speed = speedMin + Math.random() * (speedMax - speedMin);
    insect.bobSpeed = 1.25 + Math.random() * 1.4;
    insect.phase = Math.random() * TAU;
    insect.initialized = true;
  }

  function updateInsects(player, camera, hour) {
    if (!insectMesh || activeInsects === 0) return;
    setInsectPalette(hour >= 19 || hour < 5.5);
    const radius = Math.max(2, Number(insectConfig.radius) || 8.5);
    const limitSq = (radius * 1.2) ** 2;

    for (let i = 0; i < activeInsects; i += 1) {
      const insect = insects[i];
      if (!insect.initialized) respawnInsect(insect, player);
      const anchorDx = insect.anchor.x - player.x;
      const anchorDz = insect.anchor.z - player.z;
      if (anchorDx * anchorDx + anchorDz * anchorDz > limitSq) respawnInsect(insect, player);

      const phase = elapsed * insect.speed + insect.phase;
      position.set(
        insect.anchor.x + Math.cos(phase) * insect.orbit + Math.sin(phase * 0.43) * 0.18,
        insect.height + Math.sin(elapsed * insect.bobSpeed + insect.phase) * 0.16,
        insect.anchor.z + Math.sin(phase * 1.17) * insect.orbit
      );

      if (camera?.quaternion) quaternion.copy(camera.quaternion);
      else quaternion.setFromAxisAngle(cameraForward, 0);
      rollQuaternion.setFromAxisAngle(cameraForward, Math.sin(phase * 0.7) * 0.28);
      quaternion.multiply(rollQuaternion);
      const flap = 0.32 + Math.abs(Math.sin(elapsed * 8.5 + insect.phase)) * 0.92;
      scale.set(flap, 0.9, 1);
      matrix.compose(position, quaternion, scale);
      insectMesh.setMatrixAt(i, matrix);
    }
    insectMesh.instanceMatrix.needsUpdate = true;
  }

  function update(delta, { position: player, state = {}, camera = null, hour = 12 } = {}) {
    const step = Math.min(0.05, Math.max(0, Number(delta) || 0));
    elapsed = (elapsed + step) % 100000;
    wind?.setInteraction?.(player, state);
    if (!enabled || !player) {
      if (leafMesh) leafMesh.visible = false;
      if (insectMesh) insectMesh.visible = false;
      return;
    }
    if (leafMesh) leafMesh.visible = activeLeaves > 0;
    if (insectMesh) insectMesh.visible = activeInsects > 0;
    const weather = windSnapshot(wind);
    updateLeaves(step, player, weather);
    updateInsects(player, camera, Number(hour) || 0);
  }

  // Publish only after every optional GPU resource has been constructed. If a
  // browser refuses one, main.js can fall back without leaving half a system
  // attached to the scene.
  scene?.add?.(group);
  setQuality(quality?.preset ?? quality);

  return {
    group,
    update,
    setQuality,
    get stats() {
      return { leaves: activeLeaves, insects: activeInsects };
    },
    dispose() {
      wind?.setInteraction?.(null);
      leafGeometry?.dispose();
      leafMaterial?.dispose();
      insectGeometry?.dispose();
      insectMaterial?.dispose();
      insectTexture?.dispose();
      scene?.remove?.(group);
    },
  };
}

/** Decorative failure must never stop walking, saving or the plant response. */
export function createEnvironmentLifeFallback(wind = null) {
  return {
    group: null,
    update(_delta, { position = null, state = {} } = {}) {
      wind?.setInteraction?.(position, state);
    },
    setQuality() {},
    get stats() {
      return { leaves: 0, insects: 0, degraded: true };
    },
    dispose() {
      wind?.setInteraction?.(null);
    },
  };
}
