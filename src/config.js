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

  // Ground is deliberately dead flat. Shape is expressed by painting
  // surfaces, not by height. getHeight() always returns 0.
  terrain: {
    size: 42,
    segments: 1,
    renderOrder: 0,
  },

  // Free-brush splat painting over the single ground mesh.
  groundPaint: {
    resolution: 1024,
    textureRepeat: 8,
    minRadius: 0.5,
    maxRadius: 4.5,
    defaultRadius: 1.6,
    strength: 0.85,
    storageKey: "liora.ground-paint.v1",
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

  builder: {
    storageKey: "liora.island-layout.v1",
    defaultMap: "./maps/home-island.json",
    ghostOpacity: 0.55,
    selectionColor: 0x7ce0ff,
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

// Model binaries live under builder/assets/ because that is where they were
// uploaded. Only these two constants need to change if they ever move.
const MODEL_DIR = "./builder/assets/models/builder";
const TEXTURE_DIR = "./assets/textures";

export const ASSETS = Object.freeze({
  grass: `${TEXTURE_DIR}/grass.webp`,
  dirt: `${TEXTURE_DIR}/dirt.webp`,
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
