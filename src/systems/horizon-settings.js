/**
 * The horizon as a small set of dials, plus the rules that keep it seamless.
 *
 * `src/config.js` describes the horizon as ~120 authored numbers: eight ridge
 * chunks per band with individual angles, spans and heights, two peak rings,
 * fog, camera pitch. That is the right shape for authoring it once and the
 * wrong shape for adjusting it on a phone.
 *
 * This module collapses it to a short list of dials. Distance and height come
 * out as multipliers over the authored values, so dragging "ภูเขาชั้นกลาง
 * ไกลขึ้น" moves the whole band while preserving the variation that stops it
 * reading as a fence. Nothing here touches THREE or the DOM — it is pure data
 * in, pure data out, which is why the rules can be tested directly.
 */

import { checkLayerStack, describeLayerStack } from "./world-layers.js";

const DEG = 180 / Math.PI;

export const HORIZON_STORAGE_KEY = "liora.horizon.v1";

/**
 * Every dial, with the range the slider is allowed to reach.
 *
 * The ranges are the first line of defence: a value that cannot be selected
 * cannot break the scene. `check()` below is the second, for the combinations
 * that are individually fine but wrong together.
 *
 * `primary` marks the handful that answer the complaints people actually
 * arrive with — the picture is flat, the farm looks pasted onto a different
 * world, I cannot see the sky, the map edge is visible. Those show in the
 * compact panel; the rest live behind the "เพิ่มเติม" drawer, following the
 * same rule the sculpt tab does. The count is capped in the HUD test, because
 * a compact panel with ten sliders in it is not a compact panel.
 */
export const HORIZON_DIALS = [
  // Blend dials. These answer "why does the farm look pasted onto a different
  // world" rather than "where are the mountains", so they lead the panel.
  { key: "exposure", label: "ความสว่างภาพรวม", min: 0.6, max: 1.8, step: 0.02, unit: "×", group: "ภาพรวม", primary: true },
  // Direct-vs-ambient is the dial that decides whether anything in the scene
  // has a shape. Lower ambient = deeper form, at the cost of darker shadows.
  { key: "sunScale", label: "แสงตรง (ให้เงาลึก)", min: 0.4, max: 1.8, step: 0.02, unit: "×", group: "ภาพรวม", primary: true },
  { key: "hemiScale", label: "แสงรอบทิศ (ยิ่งมากยิ่งแบน)", min: 0.2, max: 2, step: 0.02, unit: "×", group: "ภาพรวม" },
  { key: "cloudShadowStrength", label: "ความเข้มเงาเมฆ", min: 0, max: 0.7, step: 0.02, unit: "", group: "ภาพรวม" },
  { key: "groundSkyBlend", label: "พื้นไกลกลืนกับฟ้า", min: 0, max: 1, step: 0.02, unit: "", group: "รอยต่อ", primary: true },
  { key: "groundEdgeBlend", label: "ความกว้างรอยกลืนขอบไร่", min: 8, max: 120, step: 2, unit: " ม.", group: "รอยต่อ" },
  { key: "cameraMinPitchDeg", label: "มุมก้มกล้องต่ำสุด", min: 6, max: 40, step: 1, unit: "°", group: "กล้อง", primary: true },
  // Both ranges grew when the painted bands took over hiding the world's edge.
  // Fog no longer has to close over the rim, so it is free to start past the
  // whole visible field — the old 240 m ceiling forced the last stretch of
  // meadow to bleach toward the sky's near-white horizon colour.
  { key: "fogNear", label: "หมอกเริ่ม", min: 40, max: 400, step: 2, unit: " ม.", group: "หมอก", primary: true },
  { key: "fogFar", label: "หมอกทึบเต็มที่", min: 120, max: 780, step: 5, unit: " ม.", group: "หมอก" },
  { key: "groundRadius", label: "ขนาดพื้นที่มองเห็น", min: 120, max: 900, step: 10, unit: " ม.", group: "พื้น", primary: true },
  { key: "groundY", label: "ความสูงพื้นปลายขอบ", min: -6, max: 20, step: 0.5, unit: " ม.", group: "พื้น" },
  { key: "groundVariation", label: "ความขรุขระของพื้นไกล", min: 0, max: 12, step: 0.2, unit: " ม.", group: "พื้น" },
  // The middle-ground band. `count` spans the whole ring but only ~5% of it is
  // ever in frustum, so this dial costs about `count * 0.05 * tris` per frame.
  { key: "treeLineCount", label: "ต้นไม้กลางทุ่ง — จำนวน", min: 0, max: 900, step: 20, unit: " ต้น", group: "กลางทุ่ง", primary: true },
  { key: "treeLineInner", label: "กลางทุ่ง — เริ่มที่", min: 44, max: 120, step: 2, unit: " ม.", group: "กลางทุ่ง" },
  { key: "treeLineOuter", label: "กลางทุ่ง — สิ้นสุดที่", min: 60, max: 165, step: 2, unit: " ม.", group: "กลางทุ่ง" },
];

export const HORIZON_TOGGLES = [
  { key: "islandsEnabled", label: "เกาะลอยฟ้า" },
  { key: "treeLineEnabled", label: "ต้นไม้กลางทุ่ง" },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * The dial positions a fresh world starts from.
 *
 * `authored` is the horizon block saved inside a map file. It matters because
 * "ค่าตั้งต้น" has to mean *this map's* sky, not the one that happens to be in
 * config.js — otherwise resetting a desert map drops you back onto the home
 * island's palette, and a second map can never have its own horizon at all.
 * config.js remains the base layer, so a map only has to state what it changes.
 */
export function horizonDefaults(config, authored = null) {
  const base = configDefaults(config);
  if (!authored || typeof authored !== "object") return base;

  const next = { ...base };
  for (const dial of HORIZON_DIALS) {
    const value = Number(authored[dial.key]);
    if (Number.isFinite(value)) next[dial.key] = clamp(value, dial.min, dial.max);
  }
  for (const toggle of HORIZON_TOGGLES) {
    if (typeof authored[toggle.key] === "boolean") next[toggle.key] = authored[toggle.key];
  }
  return next;
}

function configDefaults(config) {
  return {
    exposure: config.render?.exposure ?? 1,
    sunScale: config.lighting?.sunScale ?? 1,
    hemiScale: config.lighting?.hemiScale ?? 1,
    cloudShadowStrength: config.cloudShadows?.strength ?? 0,
    groundSkyBlend: config.outerWorld.skyBlendStrength ?? 0.72,
    groundEdgeBlend: config.outerWorld.edgeBlendWidth ?? 40,
    cameraMinPitchDeg: Math.round(config.camera.minPitch * DEG),
    fogNear: config.fog.near,
    fogFar: config.fog.far,
    groundRadius: config.outerWorld.outerRadius,
    groundY: config.outerWorld.outerY,
    groundVariation: config.outerWorld.heightVariation,
    islandsEnabled: config.floatingIslands?.enabled !== false,
    treeLineEnabled: config.treeLine?.enabled !== false,
    treeLineCount: config.treeLine?.count ?? 0,
    treeLineInner: config.treeLine?.innerRadius ?? 52,
    treeLineOuter: config.treeLine?.outerRadius ?? 96,
  };
}

/** Drops unknown keys and clamps every dial into its slider range. */
export function sanitizeHorizon(settings, config, authored = null) {
  const base = horizonDefaults(config, authored);
  const next = { ...base };
  if (!settings || typeof settings !== "object") return next;

  for (const dial of HORIZON_DIALS) {
    const value = Number(settings[dial.key]);
    if (Number.isFinite(value)) next[dial.key] = clamp(value, dial.min, dial.max);
  }
  for (const toggle of HORIZON_TOGGLES) {
    if (typeof settings[toggle.key] === "boolean") next[toggle.key] = settings[toggle.key];
  }
  return next;
}

/**
 * How far the undulating visual ground can reach, worst case.
 *
 * Deliberately a conservative bound rather than the measured extreme: the
 * ridge-rooting rule has to hold for every noise seed, not just the one that
 * happens to ship. `broadNoise` sums coefficients to 1.0, so the swing can
 * never exceed `heightVariation`.
 */
export function groundExtent(settings, config) {
  const innerY = config.outerWorld.innerYOffset;
  const lo = Math.min(innerY, settings.groundY) - settings.groundVariation;
  const hi = Math.max(innerY, settings.groundY) + settings.groundVariation;
  return { min: lo, max: hi };
}

/** Turns dial positions into the concrete config objects the systems consume. */
export function resolveHorizon(settings, config, authored = null) {
  const dials = sanitizeHorizon(settings, config, authored);
  const ground = groundExtent(dials, config);

  const outerWorld = {
    ...config.outerWorld,
    outerRadius: dials.groundRadius,
    outerY: dials.groundY,
    heightVariation: dials.groundVariation,
    edgeBlendWidth: dials.groundEdgeBlend,
    skyBlendStrength: dials.groundSkyBlend,
    // Anchored to the dials rather than to fixed metres, so shrinking the
    // visible world does not leave the sky blend finishing past its own edge.
    skyBlendStart: config.outerWorld.innerRadius + dials.groundEdgeBlend * 2,
    skyBlendEnd: Math.max(
      config.outerWorld.innerRadius + dials.groundEdgeBlend * 2 + 40,
      dials.groundRadius * 0.78
    ),
  };

  // One toggle, one system. It may turn the islands off but never on against
  // config, so a map that ships without them cannot grow them from the panel.
  const floatingIslands = {
    ...config.floatingIslands,
    enabled: dials.islandsEnabled && config.floatingIslands?.enabled !== false,
  };

  // `outer` must stay below `inner`; the sliders are independent, so a player
  // can cross them over and the band would silently vanish.
  const treeLineInner = dials.treeLineInner;
  const treeLineOuter = Math.max(treeLineInner + 8, dials.treeLineOuter);

  return {
    dials,
    ground,
    treeLine: {
      ...config.treeLine,
      enabled: dials.treeLineEnabled && config.treeLine?.enabled !== false,
      count: Math.round(dials.treeLineCount),
      innerRadius: treeLineInner,
      outerRadius: treeLineOuter,
    },
    exposure: dials.exposure,
    lighting: { sunScale: dials.sunScale, hemiScale: dials.hemiScale },
    cloudShadowStrength: dials.cloudShadowStrength,
    fog: { near: dials.fogNear, far: Math.max(dials.fogNear + 10, dials.fogFar) },
    cameraMinPitch: dials.cameraMinPitchDeg / DEG,
    outerWorld,
    paintedBackdrop: config.paintedBackdrop ?? { bands: [] },
    floatingIslands,
  };
}

/**
 * The four rules from docs/HORIZON.md, evaluated against live dial positions.
 */
export function checkHorizonRules(resolved, config) {
  const reach = config.worldLimit;
  const terrainHalf = config.terrain.size / 2;
  const fogSpan = Math.max(1, resolved.fog.far - resolved.fog.near);
  const fogAt = (d) => clamp((d - resolved.fog.near) / fogSpan, 0, 1);

  const farmDiagonal = Math.hypot(reach + terrainHalf, reach + terrainHalf);
  const topEdgeDeg = resolved.cameraMinPitch * DEG - config.camera.fov / 2;

  /**
   * Whether anything hung in the sky is actually inside the camera's frustum.
   *
   * The "กล้องก้มลงแล้วเห็นท้องฟ้า" rule below only asks whether *some* sky is
   * on screen. It passed happily at minPitch 14° — 5° of visible sky — while
   * the whole floating-island cluster sat at 15° and could not be seen at any
   * pitch or zoom. A rule that measures the opening but never the content is
   * how a backdrop gets authored, tuned twice and shipped invisible.
   *
   * Worst case is the player standing at the near edge of the farm: that is
   * the shortest ground distance, so the steepest angle up to the island. The
   * camera also sits behind the player, which buys back a little of it.
   */
  // Read x/y/z rather than calling Vector3.length(): the HUD tests hand this
  // function a plain `{x, y, z}` stub, and a rule that only works with a real
  // three.js object is a rule the tests cannot check.
  const offset = config.camera.baseOffset ?? { x: 0, y: 0, z: 0 };
  const camOffset = Math.hypot(offset.x ?? 0, offset.y ?? 0, offset.z ?? 0) || 1;
  const camY = Math.sin(resolved.cameraMinPitch) * camOffset;
  const camBack = Math.cos(resolved.cameraMinPitch) * camOffset;
  // Half the authored GLB's height, in model units, before per-item scale.
  const ISLAND_HALF_HEIGHT = 0.66;

  const skyItems = resolved.floatingIslands?.enabled === false
    ? []
    : (resolved.floatingIslands?.items ?? []);

  const offscreen = skyItems
    .map((item, index) => {
      const radius = Number(item.radius) || 0;
      const scale = Number(item.scale) || 1;
      const rise = Number(item.y) || 0;
      const bob = Number(item.bobAmplitude) || 0;
      // Nearest the camera can ever get to it, and the highest it ever bobs.
      const distance = Math.max(1, radius - reach + camBack);
      const topY = rise + bob + scale * ISLAND_HALF_HEIGHT;
      const edgeDeg = Math.atan2(topY - camY, distance) * DEG;
      return {
        name: item.role === "hero" ? "เกาะหลัก" : `เกาะรอง ${index}`,
        edgeDeg,
        // topEdgeDeg is negative above the horizon; flip it to an elevation.
        headroomDeg: -topEdgeDeg - edgeDeg,
      };
    })
    .filter((entry) => entry.headroomDeg < 0);

  const painted = (resolved.paintedBackdrop?.bands ?? []).map((band) => ({
    name: band.name ?? "แถบภาพ",
    radius: Number(band.radius) || 0,
    bottom: (Number(band.y) || 0) - (Number(band.height) || 0) / 2,
    top: (Number(band.y) || 0) + (Number(band.height) || 0) / 2,
  }));

  // Buried at the bottom so no sky shows under a band, clear of the land at
  // the top so the ground never cuts its skyline off.
  const rooted = painted.every((band) => band.bottom < resolved.ground.min);
  const clears = painted.every((band) => band.top > resolved.ground.max + 2);

  // Distance is one question, so it is asked once, over the whole stack —
  // see systems/world-layers.js. This replaces three rules that were each
  // written after a different layer broke a different way.
  const stack = checkLayerStack({
    ...config,
    outerWorld: resolved.outerWorld,
    treeLine: resolved.treeLine,
    paintedBackdrop: resolved.paintedBackdrop,
    floatingIslands: resolved.floatingIslands,
  });
  const stackFaults = [
    ...stack.clipped.map((l) => `${l.label} เลยระยะกล้อง (${Math.round(l.farthest)} ม.)`),
    ...stack.outsideSky.map((l) => `${l.label} อยู่นอกโดมฟ้า (${Math.round(l.farthest)} ม.)`),
    ...stack.overrunning.map((l) => `${l.label} ทะลุ ${stack.nearestBackdrop?.label} (${Math.round(l.far)} ม.)`),
  ];

  /**
   * How much of the far ground's own colour has been replaced by pale air.
   *
   * Scene fog and the ground's sky blend both aim at the same near-white
   * horizon colour and compose multiplicatively, so it is easy to author each
   * one at a reasonable-looking strength and still arrive at ground that is
   * entirely sky. That is what happened: fog reached full opacity 180 m before
   * the rim while the blend was already at half, and the last stretch of
   * meadow became a flat cream bar under the painted treeline. On a near-level
   * plane every one of those metres is squeezed into a few dozen pixels above
   * the grass, so a gradient there does not read as distance — it reads as a
   * wall.
   *
   * Only meaningful with painted bands: a built horizon *wants* its rim fogged
   * out, which is the `rim` rule above.
   */
  const rimFog = fogAt(resolved.outerWorld.outerRadius);
  const rimBlend = clamp(Number(resolved.outerWorld.skyBlendStrength) || 0, 0, 1);
  const rimWash = 1 - (1 - rimBlend) * (1 - rimFog);

  return [
    {
      id: "stack",
      label: "ชั้นระยะเรียงถูก ไม่มีชั้นไหนทะลุกัน",
      pass: stackFaults.length === 0,
      detail: stackFaults.length ? stackFaults.join(" · ") : describeLayerStack(stack.layers),
      fix: "ลดขนาดพื้นที่มองเห็น ดึงแถบภาพเข้ามา หรือขยายโดมฟ้าและระยะกล้อง",
    },
    {
      id: "farm",
      label: "ไร่ยังคมชัด ไม่โดนหมอก",
      pass: fogAt(farmDiagonal) < 0.25 && resolved.fog.near > terrainHalf * Math.SQRT2,
      detail: `มุมไกลสุดของไร่ (${Math.round(farmDiagonal)} ม.) โดนหมอก ${Math.round(fogAt(farmDiagonal) * 100)}%`,
      fix: "เพิ่มค่า “หมอกเริ่ม”",
    },
    {
      id: "view",
      label: "กล้องก้มลงแล้วเห็นท้องฟ้า",
      pass: topEdgeDeg < 0,
      detail: topEdgeDeg < 0
        ? `เห็นเหนือแนวระนาบได้ ${(-topEdgeDeg).toFixed(1)}°`
        : `ขอบบนจอยังต่ำกว่าแนวระนาบ ${topEdgeDeg.toFixed(1)}°`,
      fix: "ลดมุมก้มกล้องต่ำสุด",
    },
    {
      id: "islands",
      label: "เกาะลอยฟ้าอยู่ในกรอบจอ",
      pass: offscreen.length === 0,
      detail: skyItems.length === 0
        ? "ปิดเกาะลอยฟ้าอยู่"
        : offscreen.length
          ? `เลยขอบบนจอ: ${offscreen
              .map((entry) => `${entry.name} ${Math.abs(entry.headroomDeg).toFixed(1)}°`)
              .join(", ")}`
          : `เกาะทุกชิ้นอยู่ในจอ (${skyItems.length} ชิ้น)`,
      fix: "ลดค่า y ของเกาะ ดึงระยะออกไปไกลขึ้น หรือลดมุมก้มกล้องต่ำสุด",
    },
    {
      id: "rooted",
      label: "ภูเขาโผล่จากพื้น ไม่ลอย ไม่จม",
      pass: rooted && clears,
      detail: `พื้นไกลอยู่ช่วง ${resolved.ground.min.toFixed(1)} ถึง ${resolved.ground.max.toFixed(1)} ม.`,
      fix: "ลดความขรุขระพื้น หรือเพิ่มความสูงภูเขา",
    },
    {
      id: "seam",
      label: "ขอบไร่กลืนกับพื้นนอก ไม่เป็นเส้น",
      pass:
        resolved.outerWorld.edgeBlendWidth >= 24
        && resolved.outerWorld.skyBlendStart > reach + 24
        && resolved.outerWorld.skyBlendEnd < resolved.outerWorld.outerRadius,
      detail:
        `กลืนขอบ ${Math.round(resolved.outerWorld.edgeBlendWidth)} ม. · `
        + `เริ่มกลืนฟ้าที่ ${Math.round(resolved.outerWorld.skyBlendStart)} ม. · `
        + `เดินได้ถึง ${reach} ม.`,
      fix: "เพิ่มความกว้างรอยกลืน หรือขยายพื้นที่มองเห็น",
    },
    {
      id: "airy",
      label: "พื้นไกลยังเป็นทุ่ง ไม่กลายเป็นแถบหมอก",
      pass: rimWash <= 0.55,
      detail: `พื้นตรงขอบถูกกลืนไปกับฟ้า ${Math.round(rimWash * 100)}% `
        + `(หมอก ${Math.round(rimFog * 100)}% + กลืนฟ้า ${Math.round(rimBlend * 100)}%)`,
      fix: "เลื่อน “หมอกเริ่ม” ออกไป หรือลด “พื้นไกลกลืนกับฟ้า”",
    },
  ];
}

/**
 * The horizon block that goes inside a map file.
 *
 * Only dials that actually differ from config.js are written. A map that says
 * nothing about fog inherits whatever the game's baseline fog becomes later,
 * which is the behaviour you want when a shared default is tuned after ten
 * maps already exist — otherwise every map freezes a copy of today's numbers
 * and none of them ever benefit from a fix.
 */
export function horizonForMap(settings, config) {
  const dials = sanitizeHorizon(settings, config);
  const base = horizonDefaults(config);
  const out = {};
  for (const dial of HORIZON_DIALS) {
    if (Math.abs(dials[dial.key] - base[dial.key]) > 1e-9) out[dial.key] = dials[dial.key];
  }
  for (const toggle of HORIZON_TOGGLES) {
    if (dials[toggle.key] !== base[toggle.key]) out[toggle.key] = dials[toggle.key];
  }
  return out;
}

/** config.js-shaped text, ready to paste over the authored values. */
export function horizonSnippet(resolved) {
  const n = (v, d = 2) => Number(v.toFixed(d));
  return `// ---- ค่าจากแผงขอบฟ้า — วางทับใน src/config.js ----
render: { toneMapping: "neutral", exposure: ${n(resolved.exposure, 2)} },
lighting: { sunScale: ${n(resolved.lighting.sunScale, 2)}, hemiScale: ${n(resolved.lighting.hemiScale, 2)} },
cloudShadows.strength: ${n(resolved.cloudShadowStrength, 2)},
camera.minPitch: THREE.MathUtils.degToRad(${resolved.dials.cameraMinPitchDeg}),
fog: { near: ${n(resolved.fog.near, 0)}, far: ${n(resolved.fog.far, 0)} },

outerWorld:
    outerRadius: ${n(resolved.outerWorld.outerRadius, 0)},
    outerY: ${n(resolved.outerWorld.outerY, 1)},
    heightVariation: ${n(resolved.outerWorld.heightVariation, 1)},
    edgeBlendWidth: ${n(resolved.outerWorld.edgeBlendWidth, 0)},
    skyBlendStrength: ${n(resolved.outerWorld.skyBlendStrength, 2)},
    skyBlendStart: ${n(resolved.outerWorld.skyBlendStart, 0)},
    skyBlendEnd: ${n(resolved.outerWorld.skyBlendEnd, 0)},

treeLine:
    enabled: ${resolved.treeLine.enabled},
    count: ${resolved.treeLine.count},
    innerRadius: ${n(resolved.treeLine.innerRadius, 0)},
    outerRadius: ${n(resolved.treeLine.outerRadius, 0)},

floatingIslands.enabled: ${resolved.floatingIslands.enabled},
`;
}
