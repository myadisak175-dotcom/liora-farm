import * as THREE from "three";

// One screen-wide switch: coarse pointer (phone/tablet) gets the cheaper
// renderer settings. Everything else is authored once and scaled from here,
// so there is no second "mobile config" to keep in sync.
const IS_TOUCH =
  typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export const QUALITY = Object.freeze({
  isTouch: IS_TOUCH,
  maxPixelRatio: IS_TOUCH ? 1.5 : 2,
  antialias: !IS_TOUCH,
  shadowMapSize: IS_TOUCH ? 1024 : 2048,
});

export const CONFIG = Object.freeze({
  // Half-width of the walkable area. The build limit and the visible cliff
  // edge are derived from terrain.size so they can never drift apart again.
  worldLimit: 19.5,

  playerHeight: 1.7,
  playerGroundOffset: -0.02,
  playerRadius: 0.34,
  walkSpeed: 2.4,
  runSpeed: 5.2,
  runThreshold: 0.78,
  // Steeper than this and Liora walks along the slope instead of up it —
  // without a limit you can climb a sculpted wall like a ladder.
  maxWalkSlope: 0.75,

  animationSpeed: {
    idle: 1,
    walk: 0.9,
    run: 1,
  },

  camera: {
    fov: 38,
    near: 0.1,
    far: 100,
    baseOffset: new THREE.Vector3(8, 10, 10),
    minZoom: 0.65,
    maxZoom: 1.55,
    zoomStep: 0.12,
    orbitSensitivity: 0.006,
    pitchSensitivity: 0.0045,
    minPitch: THREE.MathUtils.degToRad(28),
    maxPitch: THREE.MathUtils.degToRad(55),
    followDeadZone: 0.55,
    followSharpness: 3.2,
    positionSharpness: 5.5,
    // Build mode: one finger on empty ground pans, two fingers rotate.
    panLimit: 21,
    twoFingerRotateSensitivity: 0.005,
  },

  depth: {
    playerOrder: 10,
  },

  shadows: {
    mapSize: QUALITY.shadowMapSize,
    bounds: 12,
    near: 0.5,
    far: 40,
    bias: -0.00015,
    normalBias: 0.035,
    radius: 2,
  },

  contactShadow: {
    width: 0.72,
    depth: 0.4,
    y: 0.022,
    opacity: 0.31,
    nightOpacity: 0.38,
    footWidth: 0.18,
    footDepth: 0.12,
    footY: 0.026,
    footOpacity: 0.34,
    footNightOpacity: 0.4,
    footSide: 0.115,
    footForward: 0.035,
    renderOrder: 5,
  },

  island: {
    size: 42,
    cliffDepth: 5.5,
    bottomInset: 5.5,
    bottomThickness: 1.8,
    cliffColor: 0x6f5a47,
    bottomColor: 0x4f4338,
    skyColor: 0x9bd8f5,
  },

  // Ground shape comes from the height field, sampled by both the geometry and
  // by getHeight(). 0.5 m spacing over 42 m = an 85x85 grid, 7,225 vertices.
  terrain: {
    size: 42,
    spacing: 0.5,
    renderOrder: 0,
  },

  // Sculpting brushes. Heights are metres.
  sculpt: {
    minRadius: 1,
    maxRadius: 6,
    defaultRadius: 3,
    // Metres per second of held brush, at the centre of the falloff.
    strength: 0.9,
    smoothRate: 3.2,
    flattenRate: 2.6,
    minHeight: -3,
    maxHeight: 7,
    // The rim has to fall back to 0 or the island silhouette breaks away from
    // the fixed cliff geometry underneath it.
    edgeMargin: 4,
    // Reserved ground (the farm beds) stays flat, with a soft ramp around it.
    reservedFeather: 1.6,
    undoLimit: 12,
    storageKey: "liora.terrain-height.v1",
  },

  // The ring that shows where a brush will land and how wide it is.
  brushCursor: {
    segments: 48,
    color: 0xffffff,
    blockedColor: 0xff8a72,
    opacity: 0.85,
    lift: 0.05,
    renderOrder: 8,
  },

  // Free-brush splat painting over the single ground mesh.
  groundPaint: {
    resolution: 1024,
    textureRepeat: 8,
    minRadius: 0.5,
    maxRadius: 4.5,
    defaultRadius: 1.6,
    strength: 1,
    storageKey: "liora.ground-paint.v1",
    // Replaying every stroke got slow past a few hundred strokes, so the
    // canvas is snapshotted every N strokes and replay starts from there.
    snapshotInterval: 40,
  },

  farmPlot: {
    position: { x: -5.2, z: -2.8 },
    y: 0.028,
    rotation: THREE.MathUtils.degToRad(-8),
    rows: 3,
    columns: 3,
    cellSize: 1.02,
    gap: 0.16,
    moundHeight: 0.075,
    cornerRadius: 0.17,
    bevelSize: 0.035,
    bevelThickness: 0.025,
    soilColor: 0x8a5a36,
    furrowColor: 0x684127,
    furrowWidth: 0.055,
    furrowHeight: 0.018,
    furrowY: 0.055,
    renderOrder: 2,
    // Nothing may be built on the plot: the beds are 3.4 m across, plus a
    // little margin so a wall never crowds the rows.
    reservedRadius: 2.4,
  },

  // The first real gameplay loop: plant -> wait -> harvest -> pouch.
  farming: {
    reach: 2.1,
    growSeconds: 40,
    seedColor: 0x6fae54,
    leafColor: 0x4f9440,
    rootColor: 0xe3705a,
    sproutHeight: 0.18,
    ripeHeight: 0.44,
    storageKey: "liora.farm.v1",
  },

  builder: {
    storageKey: "liora.island-layout.v1",
    defaultMap: "./maps/home-island.json",
    ghostOpacity: 0.55,
    selectionColor: 0x7ce0ff,
    saveDebounceMs: 250,
    gridSize: 0.5,
    snapDefault: false,
    historyLimit: 50,
  },

  sky: {
    radius: 85,
    zenithColor: 0x68bdf0,
    horizonColor: 0xdff4ff,
    lowerColor: 0xb9dff2,
    cloudColor: 0xffffff,
    cloudOpacity: 0.72,
    cloudCount: 10,
    cloudRingRadius: 31,
    // Was -7, i.e. underneath the island where the camera never looks.
    cloudHeight: 9,
    starCount: 220,
    starSize: 0.32,
    starOpacity: 0.9,
  },

  dayNight: {
    startHour: 8,
    realSecondsPerDay: 1440,
  },

  runFx: {
    maxParticles: 24,
    spawnInterval: 0.085,
    life: 0.38,
    color: 0xe9dfc6,
    opacity: 0.42,
    size: 0.32,
    grow: 0.85,
    height: 0.11,
    heightJitter: 0.05,
    backOffset: 0.28,
    backJitter: 0.16,
    sideSpread: 0.42,
    backwardDrift: 0.38,
    sideDrift: 0.34,
    riseSpeed: 0.34,
    riseJitter: 0.18,
    gravity: 0.55,
    renderOrder: 6,
  },

  // Fog used to start at 30 on a 42-wide island, which washed the far edge
  // out to flat sky colour. Pushed back so the island stays readable.
  fog: {
    near: 46,
    far: 96,
  },
});

// Model binaries live under builder/assets/ because that is where they were
// uploaded. Only these two constants need to change if they ever move.
const MODEL_DIR = "./builder/assets/models/builder";
const TEXTURE_DIR = "./assets/textures";

export const ASSETS = Object.freeze({
  grass: `${TEXTURE_DIR}/grass.webp`,
  dirt: `${TEXTURE_DIR}/dirt_ground.png`,
  sand: `${TEXTURE_DIR}/sand.webp`,
  rock: `${TEXTURE_DIR}/rock.webp`,
  player: "./assets/models/player/liora_all_animations_web.glb",
  modelDir: MODEL_DIR,
});

export const ANIMATIONS = Object.freeze({
  idle: "Idle_9",
  walk: "Walking",
  run: "Running",
  pickUp: "Male_Bend_Over_Pick_Up",
  pullRadish: "Pull_Radish",
  hammer: "Heavy_Hammer_Swing",
  mirror: "Mirror_Viewing",
});
