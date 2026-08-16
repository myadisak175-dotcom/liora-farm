/**
 * The horizon as a small set of dials, plus the rules that keep it seamless.
 *
 * `src/config.js` describes the horizon as ~120 authored numbers: eight ridge
 * chunks per band with individual angles, spans and heights, two peak rings,
 * fog, camera pitch. That is the right shape for authoring it once and the
 * wrong shape for adjusting it on a phone.
 *
 * This module collapses it to fifteen dials. Distance and height come out as
 * multipliers over the authored values, so dragging "ภูเขาชั้นกลาง ไกลขึ้น"
 * moves the whole band while preserving the variation that stops it reading as
 * a fence. Nothing here touches THREE or the DOM — it is pure data in, pure
 * data out, which is why the rules can be tested directly.
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
 * `primary` marks the four dials that answer the original complaint — can I
 * see the sky, is the map edge visible, is the farm hazy. Those show in the
 * compact panel; the rest live behind the "เพิ่มเติม" drawer, following the
 * same rule the sculpt tab does.
 */
export const HORIZON_DIALS = [
  { key: "cameraMinPitchDeg", label: "มุมก้มกล้องต่ำสุด", min: 6, max: 40, step: 1, unit: "°", group: "กล้อง", primary: true },
  { key: "fogNear", label: "หมอกเริ่ม", min: 40, max: 240, step: 2, unit: " ม.", group: "หมอก", primary: true },
  { key: "fogFar", label: "หมอกทึบเต็มที่", min: 120, max: 700, step: 5, unit: " ม.", group: "หมอก", primary: true },
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
];

export const HORIZON_TOGGLES = [
  { key: "mountainsEnabled", label: "ภูเขา" },
  { key: "peaksEnabled", label: "ยอดเขาไกล" },
  { key: "hazeEnabled", label: "หมอกขอบฟ้า" },
  { key: "islandsEnabled", label: "เกาะลอยฟ้า" },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Reads the current authored config back out as dial positions. */
export function horizonDefaults(config) {
  return {
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
    islandsEnabled: config.distantRange.floatingIslands.enabled === true,
  };
}

/** Drops unknown keys and clamps every dial into its slider range. */
export function sanitizeHorizon(settings, config) {
  const base = horizonDefaults(config);
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
export function resolveHorizon(settings, config) {
  const dials = sanitizeHorizon(settings, config);
  const ground = groundExtent(dials, config);

  const outerWorld = {
    ...config.outerWorld,
    outerRadius: dials.groundRadius,
    outerY: dials.groundY,
    heightVariation: dials.groundVariation,
  };

  const mountainBackdrop = {
    ...config.mountainBackdrop,
    enabled: dials.mountainsEnabled,
    near: scaleBand(config.mountainBackdrop.near, dials.foothillDistance, dials.foothillHeight, ground.min),
    far: scaleBand(config.mountainBackdrop.far, dials.rangeDistance, dials.rangeHeight, ground.min),
  };

  const distantRange = {
    ...config.distantRange,
    enabled: dials.peaksEnabled,
    peaks: config.distantRange.peaks.map((ring) => ({
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
    floatingIslands: {
      ...config.distantRange.floatingIslands,
      enabled: dials.islandsEnabled,
    },
  };

  return {
    dials,
    ground,
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
      id: "rooted",
      label: "ภูเขาโผล่จากพื้น ไม่ลอย ไม่จม",
      pass: rooted && clears,
      detail: `พื้นไกลอยู่ช่วง ${resolved.ground.min.toFixed(1)} ถึง ${resolved.ground.max.toFixed(1)} ม.`,
      fix: "ลดความขรุขระพื้น หรือเพิ่มความสูงภูเขา",
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
camera.minPitch: THREE.MathUtils.degToRad(${resolved.dials.cameraMinPitchDeg}),
fog: { near: ${n(resolved.fog.near, 0)}, far: ${n(resolved.fog.far, 0)} },

outerWorld:
    outerRadius: ${n(resolved.outerWorld.outerRadius, 0)},
    outerY: ${n(resolved.outerWorld.outerY, 1)},
    heightVariation: ${n(resolved.outerWorld.heightVariation, 1)},

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
