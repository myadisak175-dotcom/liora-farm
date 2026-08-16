import * as THREE from "three";

const IS_TOUCH =
  typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export const QUALITY = Object.freeze({
  isTouch: IS_TOUCH,
  maxPixelRatio: IS_TOUCH ? 1.5 : 2,
  antialias: !IS_TOUCH,
  shadowMapSize: IS_TOUCH ? 1024 : 2048,
});

export const CONFIG = Object.freeze({
  worldLimit: 26.5,
  playerHeight: 1.7,
  playerGroundOffset: -0.02,
  playerRadius: 0.34,
  walkSpeed: 2.4,
  runSpeed: 5.2,
  runThreshold: 0.78,
  maxWalkSlope: 0.75,
  animationSpeed: { idle: 1, walk: 0.9, run: 1 },
  camera: {
    fov: 38, near: 0.1, far: 100,
    baseOffset: new THREE.Vector3(8, 10, 10),
    minZoom: 0.65, maxZoom: 1.55, zoomStep: 0.12,
    orbitSensitivity: 0.006, pitchSensitivity: 0.0045,
    minPitch: THREE.MathUtils.degToRad(28), maxPitch: THREE.MathUtils.degToRad(55),
    followDeadZone: 0.55, followSharpness: 3.2, positionSharpness: 5.5,
    panLimit: 28, twoFingerRotateSensitivity: 0.005,
  },
  depth: { playerOrder: 10 },
  // `minCasterHeight`: the sun's shadow camera already covers only 24 x 24 m
  // around the player, but everything inside that box is drawn a second time
  // into the depth pass. Under a top-down camera a 0.4 m grass clump casts a
  // shadow a few texels wide that nobody can see, and ground cover is exactly
  // what gets placed in the hundreds — so anything shorter than this casts
  // nothing. Solid props (crates, barrels) stay above the line on purpose.
  shadows: { mapSize: QUALITY.shadowMapSize, bounds: 12, near: 0.5, far: 40, bias: -0.00015, normalBias: 0.035, radius: 2, minCasterHeight: 0.9 },
  contactShadow: {
    width: 0.72, depth: 0.4, y: 0.022, opacity: 0.31, nightOpacity: 0.38,
    footWidth: 0.18, footDepth: 0.12, footY: 0.026, footOpacity: 0.34,
    footNightOpacity: 0.4, footSide: 0.115, footForward: 0.035, renderOrder: 5,
  },
  island: { size: 56, cliffDepth: 5.5, bottomInset: 5.5, bottomThickness: 1.8, cliffColor: 0x6f5a47, bottomColor: 0x4f4338, skyColor: 0x9bd8f5 },
  terrain: { size: 56, spacing: 0.5, renderOrder: 0 },
  water: {
    level: -0.6,
    color: 0x55b7df,
    shallowColor: 0xb7edf0,
    deepColor: 0x287aa8,
    foamColor: 0xf4ffff,
    shorelineColor: 0xd5eee0,
    shorelineDepth: 0.34,
    shorelineStrength: 0.48,
    depthColorStart: 0.18,
    depthColorEnd: 1.3,
    texture: "clear_water.webp", textureRepeat: 8, textureStrength: 0.42,
    textureSpeedX: 0.008, textureSpeedY: -0.006,
    opacity: 0.64, roughness: 0.28, metalness: 0.03, emissive: 0x123e55, emissiveIntensity: 0.1,
    shoreFade: 0.28, foamDepth: 0.12, waveHeight: 0.055, waveScale: 0.68, waveSpeed: 0.7,
    shimmerStrength: 0.18, renderOrder: 1,
    player: { slowStart: 0.1, runDepth: 0.16, maxWadeDepth: 0.38, minSpeedMultiplier: 0.65 },
    interaction: {
      minDepth: 0.07,
      clipInset: 0.055,
      waterlineWidth: 0.07,
      tintStrength: 0.18,
      shadowFadeStart: 0.02,
      shadowFadeEnd: 0.06,
      castShadowDisableDepth: 0.06,
    },
  },
  terrainField: {
    maxDepth: 3.5, rockSlope: 0.6, rockFeather: 0.12, sandFeather: 0.18,
    sandLayerId: 1, rockLayerId: 2, enabledByDefault: true,
  },
  /**
   * Home Island's visible world boundary. The playable area ends in a noisy
   * terrain ridge instead of a straight edge or an invisible wall. Movement
   * still keeps `worldLimit` as a safety backstop behind the ridge.
   *
   * The ridge is a procedural floor layered over editable terrain: sculpting
   * can raise land above it but cannot expose ground below it. Generated ridge
   * height is never written into terrain saves, so these values can be re-tuned
   * later without old saves pinning a previous ridge height.
   */
  worldBoundary: {
    enabled: true,
    type: "ridge",
    // Must finish before terrain.size / 2. 19.5 + 1.75 + 4.75 = 26 m < 28 m.
    radius: 19.5,
    feather: 4.75,
    height: 4.8,
    noiseAmplitude: 1.75,
    noiseScale: 0.055,
    noiseSeed: 91,
  },
  /**
   * Visual-only land that starts underneath the outer ridge and carries the
   * eye into the mountain backdrop. Gameplay terrain remains 56 m wide; this
   * mesh is not walkable, sculptable, paintable, buildable or persisted.
   */
  outerWorld: {
    enabled: true,
    innerRadius: 25.5,
    outerRadius: 47,
    innerYOffset: -0.08,
    outerY: 2.4,
    heightVariation: 1.7,
    segments: 72,
    rings: 9,
    noiseSeed: 37,
    colorNear: 0xffffff,
    colorMid: 0xe5edcc,
    colorFar: 0xc1ccb0,
    renderOrder: -8,
  },
  /**
   * Visual horizon closure behind the physical ridge. Mountain chunks are
   * merged into exactly two meshes (near + far), never collide, never save,
   * and never enter the shadow pass. `height` on each chunk is its world-space
   * peak Y; the base is intentionally buried below the island so sky cannot
   * leak underneath when the camera orbits.
   */
  mountainBackdrop: {
    enabled: true,
    castShadow: false,
    receiveShadow: false,
    near: {
      innerRadius: 45,
      outerRadius: 52,
      baseY: -6,
      peakMin: 7.5,
      peakMax: 12,
      shoulderRatio: 0.62,
      depthJitter: 2.2,
      colorLow: 0x70884f,
      colorMid: 0x72805a,
      colorPeak: 0x7a8170,
      chunks: [
        { angle: 0, radius: 47, span: 31, height: 9.2 },
        { angle: 23, radius: 48, span: 30, height: 11.4 },
        { angle: 47, radius: 46.5, span: 32, height: 8.6 },
        { angle: 70, radius: 48.5, span: 31, height: 10.1 },
        { angle: 94, radius: 47, span: 33, height: 11.8 },
        { angle: 118, radius: 49, span: 30, height: 8.4 },
        { angle: 141, radius: 46.5, span: 32, height: 10.7 },
        { angle: 165, radius: 48, span: 31, height: 9.1 },
        { angle: 188, radius: 47, span: 33, height: 11.2 },
        { angle: 211, radius: 49, span: 30, height: 8.7 },
        { angle: 234, radius: 46.5, span: 32, height: 10.3 },
        { angle: 258, radius: 48, span: 31, height: 9.5 },
        { angle: 281, radius: 47, span: 33, height: 11.6 },
        { angle: 305, radius: 49, span: 30, height: 8.8 },
        { angle: 329, radius: 46.5, span: 32, height: 10.5 },
        { angle: 347, radius: 48, span: 30, height: 9.3 },
      ],
    },
    far: {
      innerRadius: 56,
      outerRadius: 66,
      baseY: -8,
      peakMin: 11,
      peakMax: 17,
      shoulderRatio: 0.68,
      depthJitter: 3,
      colorLow: 0x708493,
      colorMid: 0x7d8f9b,
      colorPeak: 0x93a1a7,
      chunks: [
        { angle: 12, radius: 60, span: 40, height: 14 },
        { angle: 43, radius: 59, span: 38, height: 16.5 },
        { angle: 74, radius: 61, span: 41, height: 12.8 },
        { angle: 105, radius: 58, span: 39, height: 15.2 },
        { angle: 136, radius: 61, span: 41, height: 13.4 },
        { angle: 167, radius: 59, span: 39, height: 16 },
        { angle: 198, radius: 60, span: 40, height: 12.6 },
        { angle: 229, radius: 58, span: 39, height: 15.6 },
        { angle: 260, radius: 61, span: 41, height: 13 },
        { angle: 291, radius: 59, span: 39, height: 16.8 },
        { angle: 322, radius: 60, span: 40, height: 13.7 },
        { angle: 351, radius: 58, span: 39, height: 15 },
      ],
    },
  },
  sculpt: {
    minRadius: 1, maxRadius: 6, defaultRadius: 3, strength: 0.9, waterLevel: -0.6,
    smoothRate: 3.2, flattenRate: 2.6, minHeight: -3, maxHeight: 7,
    edgeMargin: 4, reservedFeather: 1.6, defaultRoughness: 0.55,
    noiseScale: 0.22, noiseOctaves: 4, noiseAmplitude: 0.72, noiseSeed: 17,
    erosionIterations: 8, erosionTalus: 0.28, erosionRate: 0.24,
    undoLimit: 40, storageKey: "liora.terrain-height.v1",
  },
  brushCursor: {
    segments: 48, color: 0xffffff, blockedColor: 0xff8a72, waterColor: 0x66d9ff,
    waterLevel: -0.6, opacity: 0.85, lift: 0.05, renderOrder: 8,
  },
  groundPaint: {
    maxLayers: 16,
    layers: [
      { id: 3, key: "grass", label: "หญ้า", icon: "🌿", texture: "grass.webp", feather: "long", base: true },
      { id: 0, key: "dirt", label: "ดิน", icon: "🟫", texture: "dirt_ground.webp", feather: "long" },
      { id: 1, key: "sand", label: "ทราย", icon: "🏖️", texture: "sand.webp", feather: "medium" },
      { id: 2, key: "rock", label: "หิน", icon: "🪨", texture: "rock.webp", feather: "short" },
      { id: 4, key: "cracked_dirt", label: "ดินแตกระแหง", icon: "🏜️", texture: "cracked_dirt.webp", feather: "medium" },
      { id: 5, key: "flower_grass", label: "หญ้าดอกไม้", icon: "🌼", texture: "flower_grass.webp", feather: "long" },
      { id: 6, key: "meadow_grass", label: "หญ้าทุ่ง", icon: "☘️", texture: "meadow_grass.webp", feather: "long" },
      { id: 7, key: "cobblestone_path", label: "ทางเดินหิน", icon: "🪨", texture: "cobblestone_path.webp", feather: "medium" },
    ],
    tileSize: 512, resolution: 1024, textureRepeat: 10.67,
    minRadius: 0.5, maxRadius: 4.5, defaultRadius: 1.6, strength: 1,
    storageKey: "liora.ground-paint.v1", snapshotInterval: 40,
  },
  farmPlot: {
    position: { x: -5.2, z: -2.8 }, y: 0.028, rotation: THREE.MathUtils.degToRad(-8),
    rows: 3, columns: 3, cellSize: 1.02, gap: 0.16, moundHeight: 0.075,
    cornerRadius: 0.17, bevelSize: 0.035, bevelThickness: 0.025,
    soilColor: 0x8a5a36, furrowColor: 0x684127, furrowWidth: 0.055,
    furrowHeight: 0.018, furrowY: 0.055, renderOrder: 2, reservedRadius: 2.4,
  },
  farming: {
    reach: 2.1, growSeconds: 40, seedColor: 0x6fae54, leafColor: 0x4f9440,
    rootColor: 0xe3705a, sproutHeight: 0.18, ripeHeight: 0.44, storageKey: "liora.farm.v1",
  },
  builder: {
    storageKey: "liora.island-layout.v1", defaultMap: "./maps/home-island.json",
    ghostOpacity: 0.55, selectionColor: 0x7ce0ff, saveDebounceMs: 250,
    gridSize: 0.5, snapDefault: false, historyLimit: 50,
  },
  sky: {
    radius: 85, zenithColor: 0x68bdf0, horizonColor: 0xdff4ff, lowerColor: 0xb9dff2,
    cloudColor: 0xffffff, cloudOpacity: 0.72, cloudCount: 10, cloudRingRadius: 38,
    cloudHeight: 9, starCount: 220, starSize: 0.32, starOpacity: 0.9,
  },
  dayNight: { startHour: 8, realSecondsPerDay: 1440 },
  runFx: {
    maxParticles: 24, spawnInterval: 0.085, life: 0.38, color: 0xe9dfc6, opacity: 0.42,
    size: 0.32, grow: 0.85, height: 0.11, heightJitter: 0.05, backOffset: 0.28,
    backJitter: 0.16, sideSpread: 0.42, backwardDrift: 0.38, sideDrift: 0.34,
    riseSpeed: 0.34, riseJitter: 0.18, gravity: 0.55,
    waterMinDepth: 0.06, waterSpawnInterval: 0.075, waterColor: 0xcff8ff,
    waterOpacity: 0.68, waterSize: 0.23, waterLife: 0.3, waterHeight: 0.035,
    waterHeightJitter: 0.035, waterBackwardDrift: 0.2, waterSideDrift: 0.5,
    waterRiseSpeed: 0.55, waterRiseJitter: 0.25, renderOrder: 6,
  },
  wind: {
    enabled: true,
    direction: { x: 0.8, z: 0.35 },
    strength: 0.55,
    speed: 0.75,
    gust: { strength: 0.3, speed: 0.18, scale: 0.07 },
    // One visual tuning knob for the green parts of wind-enabled Nature assets.
    // 0 = authored colour. 0.28 ~= 28% less green saturation + a subtle warm bias.
    naturePalette: { enabled: true, strength: 0.28 },
  },
  fog: { near: 46, far: 96 },
});

const MODEL_DIR = "./assets/models/builder";
const TEXTURE_DIR = "./assets/textures";
export const ASSETS = Object.freeze({
  textureDir: TEXTURE_DIR,
  player: "./assets/models/player/liora_all_animations_web.glb",
  modelDir: MODEL_DIR,
});
export const ANIMATIONS = Object.freeze({
  idle: "Idle_9", walk: "Walking", run: "Running", pickUp: "Male_Bend_Over_Pick_Up",
  pullRadish: "Pull_Radish", hammer: "Heavy_Hammer_Swing", mirror: "Mirror_Viewing",
});