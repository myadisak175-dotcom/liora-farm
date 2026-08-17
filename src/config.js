import * as THREE from "three";
import { createQuality } from "./systems/quality.js";

/**
 * Live quality tier. Was a frozen `isTouch` boolean, which gave a flagship
 * phone and a budget phone identical settings; it is now a preset the player
 * can override, and the getters keep the old field names working.
 */
export const QUALITY = createQuality();

export const BUILD = "worlds-2-floating-island-framed";

export const CONFIG = Object.freeze({
  /**
   * Tone mapping is what stops sunlit ground clipping to flat white.
   * Without it a 2.5 sun + 2.2 hemi rig writes >1.0 into an 8-bit buffer,
   * every bright surface lands on the same white, and the farm and the outer
   * world lose the shading that would otherwise tie them together.
   * "neutral" (Khronos PBR Neutral) rolls off highlights while keeping the
   * stylised saturation that ACES would wash out.
   */
  render: { toneMapping: "neutral", exposure: 1.12 },
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
    fov: 38, near: 0.35, far: 780,
    baseOffset: new THREE.Vector3(8, 10, 10),
    minZoom: 0.65, maxZoom: 1.55, zoomStep: 0.12,
    orbitSensitivity: 0.006, pitchSensitivity: 0.0045,
    /**
     * `minPitch` is the only thing that decides whether the sky exists.
     *
     * The camera looks straight at the player, so the top of the screen sits at
     * `minPitch - fov/2` degrees. At the old 14 deg that is 5 deg above the
     * horizon: enough for a mountain ridge, not enough for anything that
     * floats. Everything above it — haze, floating islands, the sky gradient —
     * was being built, lit and paid for off-screen.
     *
     * 7 deg opens 12 deg of sky when the player drags the camera down, which
     * is what `checkHorizonRules` now measures every backdrop against. Raising
     * this number again silently pushes the islands back off the top edge, so
     * change it and re-read the horizon panel.
     */
    minPitch: THREE.MathUtils.degToRad(7), maxPitch: THREE.MathUtils.degToRad(55),
    followDeadZone: 0.55, followSharpness: 3.2, positionSharpness: 5.5,
    panLimit: 40, twoFingerRotateSensitivity: 0.005,
  },
  depth: { playerOrder: 10 },
  shadows: { mapSize: QUALITY.shadowMapSize, bounds: QUALITY.preset.shadowBounds, near: 0.5, far: 40, bias: -0.00015, normalBias: 0.035, radius: 2, minCasterHeight: 0.9 },
  lighting: { sunScale: 1, hemiScale: 1 },
  objectShadows: { enabled: true, opacity: 0.34, radiusScale: 1.15, maxRadius: 6, lift: 0.02, capacityStep: 64, renderOrder: 3 },
  contactShadow: {
    width: 0.72, depth: 0.4, y: 0.022, opacity: 0.31, nightOpacity: 0.38,
    footWidth: 0.18, footDepth: 0.12, footY: 0.026, footOpacity: 0.34,
    footNightOpacity: 0.4, footSide: 0.115, footForward: 0.035, renderOrder: 5,
  },
  island: { size: 80, cliffDepth: 5.5, bottomInset: 5.5, bottomThickness: 1.8, cliffColor: 0x6f5a47, bottomColor: 0x4f4338, skyColor: 0x9bd8f5 },
  terrain: {
    size: 80, spacing: 0.5, renderOrder: 0,
    detailNormal: { enabled: true, size: 128, repeat: 42, strength: 0.24, heightScale: 3.2, seed: 29 },
  },
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
  worldBoundary: { enabled: false, type: "none" },
  outerWorld: {
    enabled: true,
    innerRadius: 38.5,
    outerRadius: 600,
    innerYOffset: -0.08,
    outerY: 6,
    heightVariation: 3.2,
    segments: 112,
    rings: 18,
    noiseSeed: 37,
    colorNear: 0xffffff,
    colorMid: 0xdfe6cd,
    colorFar: 0xc6d3c8,
    edgeBlendWidth: 40,
    textureFadeReach: 1.45,
    textureFadeStart: 80,
    textureFadeEnd: 150,
    skyBlendStrength: 0.72,
    skyBlendStart: 120,
    skyBlendEnd: 460,
    renderOrder: -8,
  },
  mountainBackdrop: {
    enabled: true,
    hazeStrength: 0.45,
    castShadow: false,
    receiveShadow: false,
    near: {
      innerRadius: 166,
      outerRadius: 196,
      baseY: -16,
      shoulderRatio: 0.6,
      depthJitter: 5,
      crestSegments: 9,
      crestRoughness: 0.3,
      colorLow: 0x6d8360,
      colorMid: 0x7d8f72,
      colorPeak: 0x93a08d,
      chunks: [
        { angle: 12, radius: 172, span: 26, height: 15 },
        { angle: 48, radius: 191, span: 22, height: 13.5 },
        { angle: 88, radius: 168, span: 24, height: 16 },
        { angle: 141, radius: 187, span: 21, height: 14 },
        { angle: 196, radius: 170, span: 26, height: 16.5 },
        { angle: 237, radius: 194, span: 22, height: 14.5 },
        { angle: 281, radius: 167, span: 23, height: 15.5 },
        { angle: 328, radius: 184, span: 22, height: 13.5 },
      ],
    },
    far: {
      innerRadius: 252,
      outerRadius: 298,
      baseY: -22,
      shoulderRatio: 0.66,
      depthJitter: 9,
      crestSegments: 11,
      crestRoughness: 0.34,
      colorLow: 0x7e8f9e,
      colorMid: 0x8d9dab,
      colorPeak: 0xa8b3bd,
      chunks: [
        { angle: 26, radius: 268, span: 30, height: 21 },
        { angle: 70, radius: 291, span: 26, height: 18.5 },
        { angle: 112, radius: 256, span: 28, height: 22 },
        { angle: 158, radius: 284, span: 24, height: 19.5 },
        { angle: 205, radius: 261, span: 30, height: 21.5 },
        { angle: 249, radius: 295, span: 26, height: 20 },
        { angle: 296, radius: 254, span: 27, height: 23 },
        { angle: 344, radius: 287, span: 25, height: 19 },
      ],
    },
  },
  distantRange: {
    enabled: true,
    peaks: [
      {
        count: 11, radiusMin: 330, radiusMax: 385, baseY: -24,
        heightMin: 47, heightMax: 57, widthMin: 68, widthMax: 112,
        color: 0x93a3bd, seed: 17,
      },
      {
        count: 13, radiusMin: 400, radiusMax: 462, baseY: -28,
        heightMin: 59, heightMax: 71, widthMin: 84, widthMax: 138,
        color: 0xa6b4ca, seed: 91,
      },
    ],
    haze: {
      enabled: true, count: 52, radiusMin: 190, radiusMax: 400,
      yMin: 1.5, yMax: 13, widthMin: 44, widthMax: 96,
      depthMin: 30, depthMax: 66, heightMin: 2, heightMax: 5,
      color: 0xeaf6ff, opacity: 0.26, seed: 4242, driftSpeed: 0.0016,
    },
    floatingIslands: {
      enabled: false,
      bobAmplitude: 1.1,
      bobSpeed: 0.45,
      items: [
        { angle: 0.72, radius: 288, y: 58, scale: 9.5, phase: 0.2 },
        { angle: 2.82, radius: 326, y: 78, scale: 7.2, phase: 2.0 },
        { angle: 4.72, radius: 302, y: 48, scale: 8.4, phase: 4.1 },
      ],
    },
    /**
     * The authored 1+3 island cluster, framed for the portrait phone view.
     *
     * These numbers used to live in `config-floating-island-tuned.js`, swapped
     * in over this file by an import-map alias in `index.html`. Three separate
     * `?v=` strings had to match byte-for-byte or the browser silently loaded
     * the untuned values, and every test imported this file directly and so
     * never saw the ones the game ran. They are folded back in here.
     *
     * `y` is the constraint that matters, not `radius`. An island is only on
     * screen while `atan2(y - cameraY, distance)` stays under
     * `camera.minPitch - camera.fov/2`; at the previous y of 72-96 the whole
     * cluster sat about 10 degrees above the top edge and could never be seen
     * at any pitch or zoom. `checkHorizonRules` now fails loudly on that
     * instead of leaving it to be found by eye.
     *
     * Angles keep the tuned composition: hero centred on the default camera
     * heading, two supports ~6 degrees to either side so the cluster fits the
     * narrow horizontal FOV, and one further back aligned with the hero.
     */
    floatingIslandBackdrop: {
      enabled: true,
      items: [
        { role: "hero", angle: 3.97, radius: 280, y: 45, scale: 11.8, rotationY: -0.72,
          bobAmplitude: 0.75, bobSpeed: 0.22, swayAmplitude: 0.022, swaySpeed: 0.11,
          yawAmplitude: 0.05, yawSpeed: 0.07, phase: 0.0 },
        { role: "support", angle: 3.80, radius: 236, y: 36, scale: 7.4, rotationY: 0.42,
          bobAmplitude: 0.55, bobSpeed: 0.18, swayAmplitude: 0.018, swaySpeed: 0.09,
          yawAmplitude: 0.04, yawSpeed: 0.05, phase: 1.7 },
        { role: "support", angle: 4.14, radius: 244, y: 38, scale: 6.6, rotationY: -1.0,
          bobAmplitude: 0.48, bobSpeed: 0.2, swayAmplitude: 0.016, swaySpeed: 0.1,
          yawAmplitude: 0.035, yawSpeed: 0.06, phase: 3.2 },
        { role: "support", angle: 3.97, radius: 320, y: 54, scale: 5.6, rotationY: 1.04,
          bobAmplitude: 0.42, bobSpeed: 0.17, swayAmplitude: 0.014, swaySpeed: 0.08,
          yawAmplitude: 0.03, yawSpeed: 0.05, phase: 4.6 },
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
    aoStrength: 0.55, aoContrast: 0.42,
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
    mapIndex: "./maps/index.json",
    ghostOpacity: 0.55, selectionColor: 0x7ce0ff, saveDebounceMs: 250,
    gridSize: 0.5, snapDefault: false, historyLimit: 50,
  },
  sky: {
    radius: 700, zenithColor: 0x68bdf0, horizonColor: 0xdff4ff, lowerColor: 0xb9dff2,
    cloudColor: 0xffffff, cloudOpacity: 0.72, cloudCount: 18, cloudRingRadius: 300,
    cloudHeight: 132, cloudSpread: 52, cloudScale: 12,
    starCount: 220, starSize: 0.95, starOpacity: 0.9,
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
  cloudShadows: {
    enabled: true,
    strength: 0.3,
    scale: 190,
    detailScale: 74,
    speed: 0.0075,
    coverage: 0.52,
    softness: 0.36,
    tileSize: 128,
    seed: 11,
  },
  wind: {
    enabled: true,
    direction: { x: 0.8, z: 0.35 },
    strength: 0.55,
    speed: 0.75,
    gust: { strength: 0.3, speed: 0.18, scale: 0.07 },
    naturePalette: { enabled: true, strength: 0.28 },
  },
  /**
   * `far` was 460, which put the hero island ~57% blended into the sky colour
   * before it was even on screen. 520 keeps it readable and still sits under
   * the nearest world rim (outerWorld.outerRadius - worldLimit = 562), so the
   * "ขอบโลกถูกหมอกกลืนสนิท" rule still passes.
   */
  fog: { near: 88, far: 520 },
});

const MODEL_DIR = "./assets/models/builder";
const TEXTURE_DIR = "./assets/textures";
export const ASSETS = Object.freeze({
  textureDir: TEXTURE_DIR,
  player: "./assets/models/player/liora_all_animations_web.glb",
  modelDir: MODEL_DIR,
  floatingIslandHero: "./assets/models/background/floating_island_hero.glb?v=framed1",
});
export const ANIMATIONS = Object.freeze({
  idle: "Idle_9", walk: "Walking", run: "Running", pickUp: "Male_Bend_Over_Pick_Up",
  pullRadish: "Pull_Radish", hammer: "Heavy_Hammer_Swing", mirror: "Mirror_Viewing",
});
