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
  worldLimit: 38,
  playerHeight: 1.7,
  playerGroundOffset: -0.02,
  playerRadius: 0.34,
  walkSpeed: 2.4,
  runSpeed: 5.2,
  runThreshold: 0.78,
  maxWalkSlope: 0.75,
  animationSpeed: { idle: 1, walk: 0.9, run: 1 },
  camera: {
    fov: 38, near: 0.1, far: 150,
    baseOffset: new THREE.Vector3(8, 10, 10),
    minZoom: 0.65, maxZoom: 1.55, zoomStep: 0.12,
    orbitSensitivity: 0.006, pitchSensitivity: 0.0045,
    minPitch: THREE.MathUtils.degToRad(28), maxPitch: THREE.MathUtils.degToRad(55),
    followDeadZone: 0.55, followSharpness: 3.2, positionSharpness: 5.5,
    panLimit: 40, twoFingerRotateSensitivity: 0.005,
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
  island: { size: 80, cliffDepth: 5.5, bottomInset: 5.5, bottomThickness: 1.8, cliffColor: 0x6f5a47, bottomColor: 0x4f4338, skyColor: 0x9bd8f5 },
  terrain: { size: 80, spacing: 0.5, renderOrder: 0 },
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
    texture: "clear_water.webp", textureRepeat: 11.43, textureStrength: 0.42,
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
   * Home Farm now uses an open 80 m terrain instead of a 360-degree generated
   * ridge. `worldLimit` remains a safety backstop 2 m inside the terrain edge;
   * selective forests, rocks, water and other natural boundaries can be added
   * later without enclosing the whole map in one mountain ring.
   */
  worldBoundary: {
    enabled: false,
    type: "none",
  },
  /**
   * Visual-only land that overlaps the edge of the 80 m gameplay terrain and
   * carries the eye far into the horizon. This does not expand collision,
   * sculpting, painting, Builder placement, farming or save data.
   */
  outerWorld: {
    enabled: true,
    innerRadius: 38.5,
    outerRadius: 82,
    innerYOffset: -0.08,
    outerY: 0.6,
    heightVariation: 2.2,
    segments: 80,
    rings: 10,
    noiseSeed: 37,
    colorNear: 0xffffff,
    colorMid: 0xe5edcc,
    colorFar: 0xc7d2b8,
    renderOrder: -8,
  },
  /**
   * Sparse scenic mountains only. The close 360-degree mountain ring is gone:
   * there is no near layer, and the remaining far chunks sit beyond the visual
   * ground with wide open gaps between them so Home Farm reads as an open world
   * rather than a valley enclosed on every side.
   */
  mountainBackdrop: {
    enabled: true,
    castShadow: false,
    receiveShadow: false,
    near: {
      innerRadius: 86,
      outerRadius: 94,
      baseY: -5,
      peakMin: 6.5,
      peakMax: 9,
      shoulderRatio: 0.64,
      depthJitter: 2,
      colorLow: 0x7b8b67,
      colorMid: 0x849176,
      colorPeak: 0x8e9789,
      chunks: [],
    },
    far: {
      innerRadius: 92,
      outerRadius: 114,
      baseY: -7,
      peakMin: 9.5,
      peakMax: 14,
      shoulderRatio: 0.68,
      depthJitter: 3,
      colorLow: 0x81929c,
      colorMid: 0x8e9da5,
      colorPeak: 0xa4afb4,
      chunks: [
        { angle: 18, radius: 98, span: 24, height: 12 },
        { angle: 54, radius: 103, span: 22, height: 13.6 },
        { angle: 96, radius: 96, span: 20, height: 11.2 },
        { angle: 214, radius: 101, span: 24, height: 12.7 },
        { angle: 258, radius: 108, span: 22, height: 14 },
        { angle: 308, radius: 99, span: 21, height: 11.7 },
        { angle: 346, radius: 104, span: 23, height: 13.1 },
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
    tileSize: 512, resolution: 1024, textureRepeat: 15.24,
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
    radius: 135, zenithColor: 0x68bdf0, horizonColor: 0xdff4ff, lowerColor: 0xb9dff2,
    cloudColor: 0xffffff, cloudOpacity: 0.72, cloudCount: 10, cloudRingRadius: 52,
    cloudHeight: 11, starCount: 220, starSize: 0.32, starOpacity: 0.9,
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
  fog: { near: 68, far: 138 },
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