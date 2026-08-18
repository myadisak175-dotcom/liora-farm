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
  { key: "groundTextureReach", label: "ลายหญ้าไปไกลแค่ไหน", min: 0.4, max: 3, step: 0.05, unit: "×", group: "รอยต่อ" },
  { key: "cameraMinPitchDeg", label: "มุมก้มกล้องต่ำสุด", min: 6, max: 40, step: 1, unit: "°", group: "กล้อง", primary: true },
  { key: "fogNear", label: "หมอกเริ่ม", min: 40, max: 240, step: 2, unit: " ม.", group: "หมอก", primary: true },
  { key: "fogFar", label: "หมอกทึบเต็มที่", min: 120, max: 700, step: 5, unit: " ม.", group: "หมอก" },
  { key: "groundRadius", label: "ขนาดพื้นที่มองเห็น", min: 120, max: 900, step: 10, unit: " ม.", group: "พื้น", primary: true },
  { key: "groundY", label: "ความสูงพื้นปลายขอบ", min: -6, max: 20, step: 0.5, unit: " ม.", group: "พื้น" },
  { key: "groundVariation", label: "ความขรุขระของพื้นไกล", min: 0, max: 12, step: 0.2, unit: " ม.", group: "พื้น" },
  { key: "foothillDistance", label: "เนินเขา — ระยะ", min: 0.5, max: 2, step: 0.05, unit: "×", group: "เนินเขา" },
  { key: "foothillHeight", label: "เนินเขา — ความสูง", min: 0.3, max: 2.5, step: 0.05, unit: "×", group: "เนินเขา" },
  { key: "rangeDistance", label: "ภูเขากลาง — ระยะ", min: 0.5, max: 2, step: 0.05, unit: "×", group: "ภูเขากลาง" },
  { key: "rangeHeight", label: "ภูเขากลาง — ความสูง", min: 0.3, max: 2.5, step: 0.05, unit: "×", group: "ภูเขากลาง" },
  { key: "peakDistance", label: "ยอดไกล — ระยะ", min: 0.5, max: 1.8, step: 0.05, unit: "×", group: "ยอดไกล" },
  { key: "peakHeight", label: "ยอดไกล — ความสูง", min: 0.3, max: 2.5, step: 0.05, unit: "×", group: "ยอดไกล" },
  { key: "hazeOpacity", label: "ความเข้มหมอกขอบฟ้า", min: 0, max: 0.6, step: 0.02, unit: "", group: "หมอก" },
  // The middle-ground band. `count` spans the whole ring but only ~5% of it is
  // ever in frustum, so this dial costs about `count * 0.05 * tris` per frame.
  { key: "treeLineCount", label: "ต้นไม้กลางทุ่ง — จำนวน", min: 0, max: 900, step: 20, unit: " ต้น", group: "กลางทุ่ง", primary: true },
  { key: "treeLineInner", label: "กลางทุ่ง — เริ่มที่", min: 44, max: 120, step: 2, unit: " ม.", group: "กลางทุ่ง" },
  { key: "treeLineOuter", label: "กลางทุ่ง — สิ้นสุดที่", min: 60, max: 165, step: 2, unit: " ม.", group: "กลางทุ่ง" },
];

export const HORIZON_TOGGLES = [
  { key: "mountainsEnabled", label: "ภูเขา" },
  { key: "peaksEnabled", label: "ยอดเขาไกล" },
  { key: "hazeEnabled", label: "หมอกขอบฟ้า" },
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
    groundTextureReach: config.outerWorld.textureFadeReach ?? 1,
    cameraMinPitchDeg: Math.round(config.camera.minPitch * DEG),
    fogNear: config.fog.near,
    fogFar: config.fog.far,
    groundRadius: config.outerWorld.outerRadius,
    groundY: config.outerWorld.outerY,
    groundVariation: config.outerWorld.heightVariation,
    foothillDistance: 1,
    foothillHeight: 1,
    rangeDistance: 1,
    rangeHeight: 1,
    peakDistance: 1,
    peakHeight: 1,
    hazeOpacity: config.distantRange.haze.opacity,
    mountainsEnabled: config.mountainBackdrop.enabled !== false,
    peaksEnabled: config.distantRange.enabled !== false,
    hazeEnabled: config.distantRange.haze.enabled !== false,
    // The authored GLB cluster is the live system; `floatingIslands` is the
    // procedural one and ships disabled. Reading this toggle's default from
    // `floatingIslands` alone switched the visible islands off at boot, since
    // the panel applies once during construction.
    islandsEnabled: config.distantRange.floatingIslandBackdrop?.enabled === true
      || config.distantRange.floatingIslands.enabled === true,
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

function scaleBand(band, distanceScale, heightScale, groundFloor) {
  return {
    ...band,
    innerRadius: band.innerRadius * distanceScale,
    outerRadius: band.outerRadius * distanceScale,
    baseY: Math.min(band.baseY, groundFloor - 6),
    chunks: band.chunks.map((chunk) => ({
      ...chunk,
      radius: chunk.radius * distanceScale,
      height: chunk.height * heightScale,
    })),
  };
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
    textureFadeReach: dials.groundTextureReach,
    skyBlendStrength: dials.groundSkyBlend,
    // Anchored to the dials rather than to fixed metres, so shrinking the
    // visible world does not leave the sky blend finishing past its own edge.
    skyBlendStart: config.outerWorld.innerRadius + dials.groundEdgeBlend * 2,
    skyBlendEnd: Math.max(
      config.outerWorld.innerRadius + dials.groundEdgeBlend * 2 + 40,
      dials.groundRadius * 0.78
    ),
  };

  const paintedHorizon = config.paintedBackdrop?.enabled === true
    && (config.paintedBackdrop.bands?.length ?? 0) > 0;
  const mountainBackdrop = {
    ...config.mountainBackdrop,
    // Same rule as the peak rings: the painted bands are the far scenery now,
    // and the panel must not rebuild the ridges behind them.
    enabled: dials.mountainsEnabled && !paintedHorizon,
    near: scaleBand(config.mountainBackdrop.near, dials.foothillDistance, dials.foothillHeight, ground.min),
    far: scaleBand(config.mountainBackdrop.far, dials.rangeDistance, dials.rangeHeight, ground.min),
  };

  const distantRange = {
    ...config.distantRange,
    enabled: dials.peaksEnabled,
    // Painted horizon bands carry their own summits. Leaving the instanced
    // peak rings in would build a second range behind them — and the panel
    // rebuilds this config, so the rule has to live here too, not only where
    // the sky is first created.
    peaks: (config.paintedBackdrop?.enabled === true && (config.paintedBackdrop.bands?.length ?? 0) > 0
      ? []
      : config.distantRange.peaks
    ).map((ring) => ({
      ...ring,
      radiusMin: ring.radiusMin * dials.peakDistance,
      radiusMax: ring.radiusMax * dials.peakDistance,
      heightMin: ring.heightMin * dials.peakHeight,
      heightMax: ring.heightMax * dials.peakHeight,
      baseY: Math.min(ring.baseY, ground.min - 6),
    })),
    haze: {
      ...config.distantRange.haze,
      enabled: dials.hazeEnabled,
      opacity: dials.hazeOpacity,
      radiusMin: config.distantRange.haze.radiusMin * dials.rangeDistance,
      radiusMax: config.distantRange.haze.radiusMax * dials.peakDistance,
    },
    // One toggle, two systems, and only one of them is live. The dial may turn
    // a system off but never on against config: the procedural islands ship
    // disabled, and letting the toggle enable them would quietly build a
    // second, older set of islands beside the authored ones.
    floatingIslands: {
      ...config.distantRange.floatingIslands,
      enabled: dials.islandsEnabled && config.distantRange.floatingIslands.enabled !== false,
    },
    // The "เกาะลอยฟ้า" toggle used to drive only `floatingIslands`, the
    // procedural system that ships disabled — so pressing it did nothing at
    // all while the authored GLB cluster it looks like it controls ignored it.
    floatingIslandBackdrop: {
      ...config.distantRange.floatingIslandBackdrop,
      enabled: dials.islandsEnabled
        && config.distantRange.floatingIslandBackdrop?.enabled !== false,
    },
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
    mountainBackdrop,
    distantRange,
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

  const nearestRim = resolved.outerWorld.outerRadius - reach;
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

  const skyItems = resolved.distantRange?.floatingIslandBackdrop?.enabled === false
    ? []
    : (resolved.distantRange?.floatingIslandBackdrop?.items ?? []);

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

  const bands = [];
  if (resolved.mountainBackdrop.enabled) {
    bands.push(["เนินเขา", resolved.mountainBackdrop.near]);
    bands.push(["ภูเขากลาง", resolved.mountainBackdrop.far]);
  }

  const rooted = bands.every(([, b]) => b.baseY < resolved.ground.min)
    && (!resolved.distantRange.enabled
      || resolved.distantRange.peaks.every((r) => r.baseY < resolved.ground.min));
  const clears = bands.every(([, b]) =>
    Math.min(...b.chunks.map((c) => c.height)) > resolved.ground.max + 2);

  const faded = bands
    .filter(([, b]) => fogAt(b.outerRadius + reach) > 0.97)
    .map(([name]) => name);

  return [
    {
      id: "rim",
      label: "ขอบโลกถูกหมอกกลืนสนิท",
      pass: resolved.fog.far < nearestRim,
      detail: `หมอกทึบที่ ${Math.round(resolved.fog.far)} ม. · ขอบใกล้สุด ${Math.round(nearestRim)} ม.`,
      fix: "ขยายพื้น หรือลดระยะหมอก",
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
      id: "visible",
      label: "ภูเขายังมองเห็นผ่านหมอก",
      pass: faded.length === 0,
      detail: faded.length ? `จางหายหมด: ${faded.join(", ")}` : "ทุกชั้นยังเห็นได้",
      fix: "ดึงภูเขาเข้ามาใกล้",
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
  const band = (b) =>
    `      innerRadius: ${n(b.innerRadius, 1)},\n` +
    `      outerRadius: ${n(b.outerRadius, 1)},\n` +
    `      baseY: ${n(b.baseY, 1)},\n` +
    `      chunks: [\n` +
    b.chunks
      .map((c) => `        { angle: ${c.angle}, radius: ${n(c.radius, 1)}, span: ${c.span}, height: ${n(c.height, 1)} },`)
      .join("\n") +
    `\n      ],`;

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
    textureFadeReach: ${n(resolved.outerWorld.textureFadeReach, 2)},
    skyBlendStrength: ${n(resolved.outerWorld.skyBlendStrength, 2)},
    skyBlendStart: ${n(resolved.outerWorld.skyBlendStart, 0)},
    skyBlendEnd: ${n(resolved.outerWorld.skyBlendEnd, 0)},

mountainBackdrop.enabled: ${resolved.mountainBackdrop.enabled},
mountainBackdrop.near:
${band(resolved.mountainBackdrop.near)}
mountainBackdrop.far:
${band(resolved.mountainBackdrop.far)}

distantRange.enabled: ${resolved.distantRange.enabled},
distantRange.peaks: [
${resolved.distantRange.peaks
  .map(
    (r) =>
      `  { count: ${r.count}, radiusMin: ${n(r.radiusMin, 0)}, radiusMax: ${n(r.radiusMax, 0)}, baseY: ${n(r.baseY, 1)},\n` +
      `    heightMin: ${n(r.heightMin, 1)}, heightMax: ${n(r.heightMax, 1)}, widthMin: ${r.widthMin}, widthMax: ${r.widthMax},\n` +
      `    color: 0x${r.color.toString(16)}, seed: ${r.seed} },`
  )
  .join("\n")}
],
distantRange.haze.enabled: ${resolved.distantRange.haze.enabled},
distantRange.haze.opacity: ${n(resolved.distantRange.haze.opacity, 2)},
distantRange.floatingIslands.enabled: ${resolved.distantRange.floatingIslands.enabled},
`;
}
