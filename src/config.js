import * as THREE from "three";

export const CONFIG = Object.freeze({
  playerHeight: 1.7,
  playerGroundOffset: -0.02,
  playerRadius: 0.34,
  walkSpeed: 2.4,
  runSpeed: 5.2,
  runThreshold: 0.78,
  maxWalkSlope: 0.75,
  worldLimit: 38,
  animationSpeed: { idle: 1, walk: 0.9, run: 1 },
  terrain: { size: 80 },
  water: {
    level: -20,
    player: {
      slowStart: 0.1,
      runDepth: 0.16,
      maxWadeDepth: 0.38,
      minSpeedMultiplier: 0.65,
    },
  },
  camera: {
    fov: 38,
    near: 0.35,
    far: 300,
    baseOffset: new THREE.Vector3(8, 10, 10),
    minZoom: 0.65,
    maxZoom: 1.55,
    zoomStep: 0.12,
    orbitSensitivity: 0.006,
    pitchSensitivity: 0.0045,
    minPitch: THREE.MathUtils.degToRad(12),
    maxPitch: THREE.MathUtils.degToRad(55),
    followDeadZone: 0.55,
    followSharpness: 3.2,
    positionSharpness: 5.5,
    panLimit: 40,
    twoFingerRotateSensitivity: 0.005,
  },
});

export const ASSETS = Object.freeze({
  player: "./assets/models/player/liora_all_animations_web.glb",
  grass: "./assets/textures/grass.webp",
});

export const ANIMATIONS = Object.freeze({
  idle: "Idle_9",
  walk: "Walking",
  run: "Running",
});
