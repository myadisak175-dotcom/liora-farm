import * as THREE from "three";

export const CONFIG = Object.freeze({
  worldSize: 42,
  grassRepeat: 8,
  worldLimit: 18,

  playerHeight: 1.7,
  playerGroundOffset: -0.02,
  walkSpeed: 2.4,
  runSpeed: 5.2,
  runThreshold: 0.78,

  dev: {
    groundPaint: true,
  },

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
  },

  depth: {
    groundOrder: 0,
    playerOrder: 10,
  },

  shadows: {
    mapSize: 2048,
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

  terrain: {
    size: 42,
    segments: 72,
    renderOrder: 0,
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
    cloudHeight: -7,
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
});

const DIRT_TEST_TEXTURE = "data:image/webp;base64,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";

export const ASSETS = Object.freeze({
  grass: "./assets/textures/grass.webp",
  dirtPath: "./assets/textures/dirt_path_refined.webp",
  player: "./assets/models/player/liora_all_animations_web.glb",
  ground: Object.freeze({
    grass: "./assets/textures/grass.webp",
    dirt: DIRT_TEST_TEXTURE,
    sand: null,
    rock: null,
    tileAtlas: null,
  }),
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
