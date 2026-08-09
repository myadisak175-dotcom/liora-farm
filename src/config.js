import * as THREE from "three";

export const CONFIG = Object.freeze({
  worldSize: 42,
  grassRepeat: 8,
  pathSize: 30,
  worldLimit: 18,
  playerHeight: 1.7,
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
    pathOrder: 1,
    playerOrder: 10,
    pathY: 0.003,
    pathAlphaTest: 0.28,
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
});

export const ASSETS = Object.freeze({
  grass: "./assets/textures/grass.webp",
  dirtPath: "./assets/textures/dirt_path_refined.webp",
  player: "./assets/models/player/liora_all_animations_web.glb",
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
