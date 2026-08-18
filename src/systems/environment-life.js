import * as THREE from "three";

const TAU = Math.PI * 2;
const LEAF_COLORS = Object.freeze([0x789f43, 0x94ad4c, 0xc59b45, 0x9b7440, 0x6d8d39]);
const DAY_INSECT_COLORS = Object.freeze([
  0xff78bb, // blossom pink
  0xa88cff, // soft violet
  0x58d9e5, // turquoise
  0xffc94f, // warm gold
  0xff8b70, // coral
  0x82dc7c, // spring green
]);
const NIGHT_INSECT_COLORS = Object.freeze([0xb5ddff, 0xc8adff, 0x91f5dc, 0xffdc89]);

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
  context.fillStyle = "rgba(255,255,255,0.96)";
  context.strokeStyle = "rgba(54,35,78,0.46)";
  context.lineWidth = 2.1;

  const wing = (x, y, radiusX, radiusY, rotation) => {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.beginPath();
    context.ellipse(0, 0, radiusX, radiusY, 0, 0, TAU);
    context.fill();
    context.stroke();
    context.restore();
  };

  // Two forewings plus rounder hindwings make the billboard read as a
  // butterfly even at phone scale. Dark markings survive the per-instance
  // tint, so every palette colour still has a clear silhouette.
  wing(21, 25, 13, 8, -0.48);
  wing(43, 25, 13, 8, 0.48);
  wing(23, 37, 9, 7, 0.34);
  wing(41, 37, 9, 7, -0.34);

  context.fillStyle = "rgba(66,39,92,0.34)";
  for (const [x, y, radius] of [[17, 23, 2.8], [47, 23, 2.8], [22, 36, 2], [42, 36, 2]]) {
    context.beginPath();
    context.arc(x, y, radius, 0, TAU);
    context.fill();
  }

  context.fillStyle = "#30213e";
  context.beginPath();
  context.ellipse(32, 34, 2.7, 12, 0, 0, TAU);
  context.fill();
  context.strokeStyle = "rgba(48,33,62,0.88)";
  context.lineWidth = 1.35;
  context.beginPath();
  context.moveTo(31, 23);
  context.quadraticCurveTo(26, 17, 24, 16);
  context.moveTo(33, 23);
  context.quadraticCurveTo(38, 17, 40, 16);
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * How one butterfly flies, as pure state math.
 *
 * The old flight was a circle: each insect orbited a fixed anchor at a fixed
 * height forever, which reads as a moth trapped in a jar rather than something
 * alive. A butterfly instead crosses to somewhere it wants to be, wanders off
 * the straight line on the way, and every so often settles on the ground for a
 * few seconds with its wings barely moving.
 *
 * `context.groundAt` is the walkable surface and `context.overWater` says
 * whether that spot is water — a butterfly may fly across a pond, but it will
 * not land on one.
 */
export const BUTTERFLY_REST_CHANCE = 0.34;

export function pickButterflyTarget(insect, context = {}) {
  const {
    groundAt: sample = () => 0,
    overWater = () => false,
    random = Math.random,
    minHeight = 0.45,
    maxHeight = 1.75,
    range = 2.6,
  } = context;
  const angle = random() * TAU;
  const distance = 0.35 + random() * Math.max(0.2, range);
  // Anchored to the patch it belongs to. Wandering from wherever it currently
  // is turns a group of butterflies into a slow random walk across the field;
  // real ones stay with the flowers they are working.
  const homeX = Number.isFinite(insect.patchX) ? insect.patchX : insect.x;
  const homeZ = Number.isFinite(insect.patchZ) ? insect.patchZ : insect.z;
  const x = homeX + Math.cos(angle) * distance;
  const z = homeZ + Math.sin(angle) * distance;
  const ground = Number(sample(x, z)) || 0;
  // Landing is a choice made when the destination is picked, so the approach
  // can slope down into it instead of dropping out of the air on arrival.
  const wantsRest = random() < BUTTERFLY_REST_CHANCE && !overWater(x, z);
  insect.targetX = x;
  insect.targetZ = z;
  const bloom = Number.isFinite(insect.patchBloom) ? Math.max(0, insect.patchBloom) : 0;
  insect.targetY = wantsRest
    ? ground + (bloom > 0.05 ? bloom : 0.06)
    : ground + minHeight + random() * Math.max(0.01, maxHeight - minHeight);
  insect.landing = wantsRest;
  insect.legTime = 0;
  return insect;
}

/** Ground the player has painted as flowering, by any of its names. */
export const FLOWER_SURFACES = new Set(["flower_grass", "flowers", "meadow"]);

/**
 * Where a group of butterflies should be working.
 *
 * Order matters: a flower bush the player actually placed beats a painted
 * flower meadow, which beats open grass. Without this they spread evenly
 * around the player, which reads as a cloud of insects following her rather
 * than as butterflies visiting flowers.
 */
export function findFlowerPatch({
  player,
  radius = 8.5,
  random = Math.random,
  flowerSpots = null,
  surfaceAt = null,
  attempts = 6,
} = {}) {
  const px = Number(player?.x) || 0;
  const pz = Number(player?.z) || 0;

  const spots = typeof flowerSpots === "function" ? flowerSpots() : null;
  if (Array.isArray(spots) && spots.length > 0) {
    const near = spots.filter((spot) => {
      const dx = Number(spot?.x) - px;
      const dz = Number(spot?.z) - pz;
      return Number.isFinite(dx) && Number.isFinite(dz) && dx * dx + dz * dz <= radius * radius;
    });
    if (near.length > 0) {
      const spot = near[Math.min(near.length - 1, Math.floor(random() * near.length))];
      const bloom = Number(spot.bloom);
      return {
        x: Number(spot.x),
        z: Number(spot.z),
        // How far above the ground the flowers themselves are, so a butterfly
        // settles in the bloom instead of on the grass under it.
        bloom: Number.isFinite(bloom) && bloom > 0 ? bloom : 0,
        kind: "bush",
      };
    }
  }

  let fallback = null;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const angle = random() * TAU;
    const distance = 1.5 + Math.sqrt(random()) * Math.max(1, radius - 1.5);
    const x = px + Math.cos(angle) * distance;
    const z = pz + Math.sin(angle) * distance;
    fallback ??= { x, z, bloom: 0, kind: "open" };
    if (typeof surfaceAt !== "function") break;
    let surface = "";
    try { surface = String(surfaceAt(x, z) ?? ""); } catch { surface = ""; }
    if (FLOWER_SURFACES.has(surface)) return { x, z, bloom: 0, kind: "painted" };
  }
  return fallback ?? { x: px, z: pz, bloom: 0, kind: "open" };
}

export function stepButterfly(insect, delta, context = {}) {
  const {
    random = Math.random,
    restSeconds = 1.4,
    restVariation = 2.4,
  } = context;
  const dt = Math.min(0.05, Math.max(0, Number(delta) || 0));

  if (insect.mode === "rest") {
    insect.restTimer -= dt;
    // Resting wings open and close slowly rather than stopping dead.
    insect.flapRate += (1.7 - insect.flapRate) * Math.min(1, dt * 4);
    insect.y += ((insect.targetY ?? insect.y) - insect.y) * Math.min(1, dt * 6);
    if (insect.restTimer <= 0) {
      insect.mode = "cruise";
      pickButterflyTarget(insect, context);
    }
    insect.flapPhase += insect.flapRate * dt * TAU;
    return insect;
  }

  const dx = (insect.targetX ?? insect.x) - insect.x;
  const dy = (insect.targetY ?? insect.y) - insect.y;
  const dz = (insect.targetZ ?? insect.z) - insect.z;
  const flat = Math.hypot(dx, dz);
  insect.legTime = (insect.legTime ?? 0) + dt;

  if (flat < 0.12 && Math.abs(dy) < 0.12) {
    if (insect.landing) {
      insect.mode = "rest";
      insect.restTimer = restSeconds + random() * restVariation;
      insect.landing = false;
      return insect;
    }
    pickButterflyTarget(insect, context);
    return insect;
  }
  // A leg that is taking too long — a target behind a rise, say — is abandoned
  // rather than chased forever.
  if (insect.legTime > 9) {
    pickButterflyTarget(insect, context);
    return insect;
  }

  const speed = Math.max(0.05, insect.speed || 0.8);
  const heading = Math.atan2(dz, dx);
  const step = Math.min(flat, speed * dt);
  // The wobble is the whole point: a butterfly never holds a straight line, so
  // it slides sideways across its own heading as it goes.
  insect.wobblePhase = (insect.wobblePhase ?? 0) + dt * (2.6 + speed);
  const sway = Math.sin(insect.wobblePhase) * speed * dt * 0.85;
  insect.x += Math.cos(heading) * step - Math.sin(heading) * sway;
  insect.z += Math.sin(heading) * step + Math.cos(heading) * sway;

  // Climbing costs effort and beats faster; a glide down is slower and lazier.
  const climb = Math.sign(dy) * Math.min(Math.abs(dy), speed * dt * 0.9);
  insect.y += climb + Math.sin(insect.wobblePhase * 1.7) * dt * 0.16;
  const targetFlap = climb > 0 ? 11.5 : 7.5;
  insect.flapRate += (targetFlap - insect.flapRate) * Math.min(1, dt * 3);
  insect.flapPhase += insect.flapRate * dt * TAU;
  insect.heading = heading;
  return insect;
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
  /**
   * The painted ground under a point, used to find flowering meadow. Renamed
   * locally because `surfaceAt` below already means the walkable height.
   */
  surfaceAt: paintedSurfaceAt = null,
  /** Positions of flower bushes the player has placed, if any. */
  flowerSpots = null,
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
      // No vertexColors here: the per-instance tint arrives through
      // setColorAt/instanceColor, and switching USE_COLOR on without a colour
      // attribute on the geometry renders every instance black.
      vertexColors: false,
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
      vertexColors: false,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.84,
      alphaTest: 0.04,
      depthWrite: false,
      fog: true,
      toneMapped: false,
    });
    insectMesh = new THREE.InstancedMesh(insectGeometry, insectMaterial, insectMaximum);
    insectMesh.name = "Butterflies";
    insectMesh.count = 0;
    insectMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    insectMesh.frustumCulled = false;
    insectMesh.castShadow = false;
    insectMesh.receiveShadow = false;
    insectMesh.renderOrder = 5;
    group.add(insectMesh);

    for (let i = 0; i < insectMaximum; i += 1) {
      insects.push({
        x: 0, y: 0, z: 0,
        patchX: 0, patchZ: 0, patchBloom: 0, patchTimer: 0,
        targetX: 0, targetY: 0, targetZ: 0,
        mode: "cruise", landing: false, restTimer: 0, legTime: 0,
        initialized: false,
        phase: Math.random() * TAU,
        wobblePhase: Math.random() * TAU,
        flapPhase: Math.random() * TAU,
        flapRate: 9,
        heading: 0,
        speed: 0.8,
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
    insectMaterial.opacity = night ? 0.96 : 0.9;
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

  function butterflyContext() {
    const minHeight = Math.max(0.2, Number(insectConfig.minHeight) || 0.45);
    return {
      groundAt: surfaceAt,
      // Flying over the pond is fine. Landing on it is not.
      overWater: (x, z) => groundAt(getGroundHeight, x, z) < flightFloor - 0.02,
      minHeight,
      maxHeight: Math.max(minHeight, Number(insectConfig.maxHeight) || 1.75),
      range: Math.max(0.4, Number(insectConfig.wanderRange) || 1.5),
    };
  }

  /** How long one butterfly works a patch before looking for a better one. */
  function patchLifetime() {
    const base = Math.max(2, Number(insectConfig.patchSeconds) || 14);
    return base + Math.random() * base * 0.6;
  }

  function movePatch(insect, patch) {
    insect.patchX = patch.x;
    insect.patchZ = patch.z;
    insect.patchBloom = Number(patch.bloom) || 0;
    insect.patchTimer = patchLifetime();
  }

  function respawnInsect(insect, player) {
    const radius = Math.max(2, Number(insectConfig.radius) || 8.5);
    // Butterflies are re-seeded onto a patch of flowers rather than scattered
    // evenly around the player.
    const patch = findFlowerPatch({ player, radius, flowerSpots, surfaceAt: paintedSurfaceAt });
    movePatch(insect, patch);
    const angle = Math.random() * TAU;
    const spread = Math.max(0.4, Number(insectConfig.patchSpread) || 1.4);
    insect.x = patch.x + Math.cos(angle) * spread * Math.sqrt(Math.random());
    insect.z = patch.z + Math.sin(angle) * spread * Math.sqrt(Math.random());
    const context = butterflyContext();
    const ground = surfaceAt(insect.x, insect.z);
    insect.y = ground + context.minHeight + Math.random() * (context.maxHeight - context.minHeight);
    const speedMin = Math.max(0.05, Number(insectConfig.speedMin) || 0.55);
    const speedMax = Math.max(speedMin, Number(insectConfig.speedMax) || 1.15);
    insect.speed = speedMin + Math.random() * (speedMax - speedMin);
    insect.mode = "cruise";
    insect.restTimer = 0;
    insect.flapRate = 9;
    insect.phase = Math.random() * TAU;
    insect.initialized = true;
    pickButterflyTarget(insect, context);
  }

  function updateInsects(step, player, camera, hour) {
    if (!insectMesh || activeInsects === 0) return;
    setInsectPalette(hour >= 19 || hour < 5.5);
    const radius = Math.max(2, Number(insectConfig.radius) || 8.5);
    const limitSq = (radius * 1.2) ** 2;
    const context = butterflyContext();

    for (let i = 0; i < activeInsects; i += 1) {
      const insect = insects[i];
      if (!insect.initialized) respawnInsect(insect, player);
      const dx = insect.x - player.x;
      const dz = insect.z - player.z;
      if (dx * dx + dz * dz > limitSq) respawnInsect(insect, player);
      else if (!Number.isFinite(insect.patchX)) respawnInsect(insect, player);

      // The world changes underneath them: flowers get planted, moved, dug up,
      // and ground gets painted. Re-reading on a timer is what lets a butterfly
      // find a bush that appeared after it took off, instead of working an
      // empty patch until something pushes it out of range.
      insect.patchTimer -= step;
      if (insect.patchTimer <= 0 && insect.mode !== "rest") {
        movePatch(insect, findFlowerPatch({ player, radius, flowerSpots, surfaceAt: paintedSurfaceAt }));
      }
      stepButterfly(insect, step, context);
      position.set(insect.x, insect.y, insect.z);

      if (camera?.quaternion) quaternion.copy(camera.quaternion);
      else quaternion.setFromAxisAngle(cameraForward, 0);
      rollQuaternion.setFromAxisAngle(cameraForward, Math.sin(insect.wobblePhase * 0.7) * 0.3);
      quaternion.multiply(rollQuaternion);
      // Folding the billboard horizontally is what reads as wingbeat. A
      // resting butterfly holds its wings nearly shut and barely moves them.
      const beat = Math.abs(Math.sin(insect.flapPhase));
      const fold = insect.mode === "rest" ? 0.24 + beat * 0.3 : 0.3 + beat * 0.94;
      scale.set(fold, 0.9, 1);
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
    updateInsects(step, player, camera, Number(hour) || 0);
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
