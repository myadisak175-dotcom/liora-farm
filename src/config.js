import * as THREE from "three";
import { createQuality } from "./systems/quality.js";

/**
 * Live quality tier. Was a frozen `isTouch` boolean, which gave a flagship
 * phone and a budget phone identical settings; it is now a preset the player
 * can override, and the getters keep the old field names working.
 */
export const QUALITY = createQuality();

export const BUILD = "worlds-9-one-stack";

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
    // `far` has to clear the sky dome, which has to clear every painted band
    // seen from the far side of the walkable world. See systems/world-layers.js
    // — the stack is checked rather than trusted.
    fov: 38, near: 0.35, far: 900,
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
  /**
   * The land between the farm and the painted horizon.
   *
   * These numbers used to live in `paintedBackdrop.world`, layered over a
   * second set authored for the 3D ridges. The ridges are gone, so there is
   * one horizon and one set of numbers for the land in front of it.
   */
  outerWorld: {
    enabled: true,
    innerRadius: 38.5,
    // Inside the nearest painted band (430 m). Ground authored past a band is
    // either invisible or, since the bands do not write depth, drawn over it —
    // and either way it costs triangles nobody sees.
    outerRadius: 418,
    innerYOffset: -0.08,
    // Where the horizon line falls. Above the camera's eye the rim climbs the
    // backdrop and swallows the treeline.
    outerY: 1.4,
    // Only visible at all since hillEnvelope() stopped forcing the rim flat;
    // this is the horizon's silhouette now.
    heightVariation: 4.5,
    segments: 112,
    rings: 18,
    noiseSeed: 37,
    colorNear: 0xffffff,
    colorMid: 0x9dbb72,
    colorFar: 0x789a5f,
    edgeBlendWidth: 40,
    // Air, not a curtain. Scene fog already aims at the same pale horizon
    // colour, and the two compose — at 0.5 with fog closing at 552 m the last
    // stretch of meadow became a flat cream bar under the treeline.
    skyBlendStrength: 0.1,
    skyBlendStart: 300,
    skyBlendEnd: 412,
    renderOrder: -8,
  },
  /**
   * Scattered trees between the farm edge and the first mountain band.
   *
   * Everything else in the world sat past 166 m, which left 128 m of flat
   * ground in the band that fills the most screen. `count` is the dial that
   * matters — it is a total across the whole ring, and only about 5% of the
   * ring is in frustum on a portrait phone, so the visible triangle cost is
   * roughly `count * 0.05 * (average tris of the picks below)`.
   *
   * 420 pines/dead trees averaging ~2.3k triangles works out near 48k visible
   * triangles. Raise it and watch worst-frame in `?perf=1`, not average FPS.
   *
   * Items are catalog ids from editor/nature-catalog-v2.js, so adding a kind
   * of tree here is one line and no code. Anything under `minHeight` is
   * refused: a 0.69 m bush is ~8 px tall at 60 m and cannot be seen.
   */
  treeLine: {
    enabled: true,
    innerRadius: 52,
    outerRadius: 96,
    count: 420,
    sectors: 16,
    clumps: 11,
    clumpSpread: 0.30,
    scaleJitter: 0.26,
    minHeight: 1.5,
    sink: 0.15,
    seed: 20260817,
    items: [
      // Pines lead: the cheapest real trees in the set at ~2.1k each, and a
      // conifer silhouette reads at distance better than a round canopy.
      { id: "v2-pinetree-2", weight: 3 },
      { id: "v2-pinetree-1", weight: 3 },
      { id: "v2-pinetree-4", weight: 2 },
      { id: "v2-pinetree-5", weight: 2 },
      { id: "v2-pinetree-3", weight: 1 },
      // A few broadleaf and bare trees so the band is not one repeated shape.
      { id: "v2-birchtree-4", weight: 1 },
      { id: "v2-deadtree-5", weight: 1 },
      { id: "v2-rock-4", weight: 1 },
    ],
  },
  /**
   * Painted horizon bands — an alternative to the built ranges above.
   *
   * `repeat` is chosen so one copy of the strip keeps roughly its painted
   * aspect ratio at that radius: a strip 3172 px wide and 333 tall wrapped
   * once around r=800 would be 500 m tall. Four copies bring it to ~130 m,
   * which is the 7-8 degrees the portrait camera can actually show, and it
   * quadruples the pixels per degree at the same time.
   */
  paintedBackdrop: {
    enabled: true,
    bands: [
      {
        name: "PaintedPeaks",
        texture: "./assets/textures/backdrop-peaks.webp",
        // Inside camera.far (780), or the whole band is clipped away.
        radius: 720, height: 148, y: 18, repeat: 4, tint: 0xe8f2f6, haze: 0.34, renderOrder: -28,
      },
      {
        name: "PaintedForest",
        texture: "./assets/textures/backdrop-forest.webp",
        radius: 430, height: 78, y: -3, repeat: 3, tint: 0xecf4ec, haze: 0.2, renderOrder: -27,
      },
    ],
  },
  /**
   * The authored GLB islands drifting over the far ridgeline.
   *
   * These used to live inside `distantRange` alongside the instanced peak
   * rings and the mist band. Those are gone with the built horizon, and one
   * key holding one thing does not need a wrapper around it.
   *
   * `y` is the constraint that matters, not `radius`. An island is only on
   * screen while `atan2(y - cameraY, distance)` stays under
   * `camera.minPitch - camera.fov/2`.
   */
  floatingIslands: {
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
  /**
   * A clear summer afternoon: a saturated blue overhead that stays blue most
   * of the way down, a narrow pale band at the horizon, and fat white cumulus.
   *
   * The old palette put a near-white horizon (0xecfaff) against a pale zenith
   * (0x78c9f4) and blended between them across almost the whole dome, so the
   * sky read as haze from every camera angle — no depth, and no summer.
   * `zenithHold` is what keeps the blue high: the gradient reaches the horizon
   * colour only in the last stretch above the ground.
   */
  sky: {
    radius: 820, zenithColor: 0x3f9de3, horizonColor: 0xe4f4ff, lowerColor: 0xbfe4f6,
    zenithHold: 0.12,
    // The sun is drawn into the dome itself, so it costs no draw call. Size is
    // the angular radius of the disc; the glow is what actually sells warmth.
    sunColor: 0xfff5dc, sunSize: 0.045, sunGlow: 0.42,
    cloudColor: 0xffffff, cloudOpacity: 0.86, cloudCount: 18, cloudRingRadius: 300,
    // The portrait camera only exposes about 12 degrees above the horizon at
    // its lowest pitch. y=62 at r=300 keeps the cloud bellies inside that band;
    // the old y=132 put every puff more than 20 degrees above the screen.
    cloudHeight: 68, cloudSpread: 58, cloudScale: 10.5, cloudDriftSpeed: 1.42,
    cloudBob: 0.7, cloudMorph: 0.035,
    starCount: 220, starSize: 0.95, starOpacity: 0.9,
  },
  /**
   * `daylight` is the midday palette every other hour interpolates towards.
   * It lives here rather than inside day-night.js because the sky dome is
   * built from `sky` above and the two have to be the same colours — when they
   * were separate constants in separate files they drifted apart.
   */
  dayNight: {
    startHour: 8,
    realSecondsPerDay: 1440,
    daylight: {
      zenith: 0x3f9de3,
      horizon: 0xe4f4ff,
      lower: 0xbfe4f6,
      sun: 0xfff2cf,
      hemiSky: 0xfff8e8,
      hemiGround: 0x557455,
    },
  },
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
    strength: 0.13,
    scale: 320,
    detailScale: 127,
    // speed * scale is the pattern's world velocity, and it has to match
    // sky.cloudDriftSpeed or the shadows outrun the clouds casting them.
    speed: 0.00445,
    coverage: 0.46,
    softness: 0.17,
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
    // A light brush around the skirt, not the old wide force field that laid
    // whole bushes flat before Liora reached them.
    interaction: { enabled: true, radius: 1.05, strength: 0.24 },
  },
  environmentLife: {
    enabled: true,
    leaves: {
      enabled: false, maxCount: 42, radius: 11, minHeight: 0.35, maxHeight: 3.1,
      speed: 0.92, fallSpeed: 0.16, swirl: 0.34, size: 0.12,
    },
    insects: {
      // Six, not fourteen. A meadow with a dozen butterflies in every frame
      // reads as an infestation; a few working one patch of flowers reads as
      // summer.
      enabled: true, maxCount: 6, radius: 8.5, minHeight: 0.45, maxHeight: 1.75,
      // How far a butterfly wanders from its patch, and how wide the patch is.
      // Short hops read as flitting; long ones look like a bird crossing the
      // field.
      wanderRange: 1.5,
      patchSpread: 1.4,
      // How long a butterfly works one patch before looking around again. Short
      // enough that flowers planted while it is flying get found.
      patchSeconds: 14,
      speedMin: 0.55, speedMax: 1.15, size: 0.21,
    },
  },

  /**
   * Fog does not have to hide the world's edge any more — the painted bands
   * stand behind it and do that — so it starts past the whole visible field
   * and reads as air rather than as a curtain.
   */
  fog: { near: 340, far: 780 },
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
