import * as THREE from "three";

export const CONFIG = Object.freeze({
  worldSize: 42,
  grassRepeat: 8,
  pathSize: 30,
  worldLimit: 18,
  playerHeight: 1.7,
  walkSpeed: 3.2,
  runSpeed: 5.2,
  runThreshold: 0.78,
  camera: {
    fov: 38,
    near: 0.1,
    far: 100,
    baseOffset: new THREE.Vector3(8, 10, 10),
    minZoom: 0.65,
    maxZoom: 1.55,
    zoomStep: 0.12,
  },
  depth: {
    groundOrder: 0,
    pathOrder: 1,
    playerOrder: 10,
    pathY: 0.003,
    pathAlphaTest: 0.28,
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
