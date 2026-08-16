/**
 * Landscape starting points.
 *
 * The horizon dials are the right tool for *adjusting* a world and the wrong
 * one for *starting* a world. Most of them are multipliers over the ridge
 * bands authored in config.js — "ภูเขากลาง — ระยะ 1.2×" is a meaningful nudge
 * when you can see what it is nudging, and meaningless as a first move on an
 * empty map. You cannot reach a desert from a temperate island by dragging
 * multipliers, because the thing being multiplied is still an island.
 *
 * A preset is therefore stated in absolute dial positions: it does not care
 * what the dials were before. Pick one, then tune from there.
 *
 * Each preset only names the dials that define its character. Everything it
 * leaves out falls back to the map's own defaults, so a preset stays a
 * starting point rather than a reset button.
 */

export const WORLD_PRESETS = Object.freeze([
  Object.freeze({
    id: "island",
    label: "เกาะกลางหมอก",
    hint: "ค่ามาตรฐาน — ภูเขาล้อมรอบ ขอบฟ้าสว่าง",
    dials: Object.freeze({
      exposure: 1.12,
      sunScale: 1,
      hemiScale: 1,
      cloudShadowStrength: 0.3,
      fogNear: 88,
      fogFar: 460,
      groundRadius: 600,
      groundY: 6,
      groundVariation: 3.2,
      groundSkyBlend: 0.72,
      foothillDistance: 1,
      foothillHeight: 1,
      rangeDistance: 1,
      rangeHeight: 1,
      peakDistance: 1,
      peakHeight: 1,
      hazeOpacity: 0.26,
      mountainsEnabled: true,
      peaksEnabled: true,
      hazeEnabled: true,
    }),
  }),
  Object.freeze({
    id: "coast",
    label: "ชายทะเล",
    // The sea reads as sea because nothing interrupts the horizon line and the
    // ground never climbs. Mountains are pushed away rather than switched off,
    // so the far side of the bay still has something in it.
    hint: "ขอบฟ้าโล่ง พื้นแบน ภูเขาอยู่ไกลมาก",
    dials: Object.freeze({
      exposure: 1.2,
      sunScale: 1.05,
      hemiScale: 1.1,
      cloudShadowStrength: 0.22,
      fogNear: 120,
      fogFar: 620,
      groundRadius: 820,
      groundY: -1.5,
      groundVariation: 0.8,
      groundSkyBlend: 0.88,
      groundEdgeBlend: 56,
      foothillDistance: 1.9,
      foothillHeight: 0.45,
      rangeDistance: 1.8,
      rangeHeight: 0.6,
      peakDistance: 1.7,
      peakHeight: 0.75,
      hazeOpacity: 0.34,
      cameraMinPitchDeg: 10,
      mountainsEnabled: true,
      peaksEnabled: true,
      hazeEnabled: true,
    }),
  }),
  Object.freeze({
    id: "valley",
    label: "หุบเขา",
    // Enclosure is the whole feeling: ridges close and tall enough to crop the
    // sky, fog tight so the walls read as near, and a small visible world.
    hint: "ภูเขาชิดและสูง ฟ้าแคบ รู้สึกถูกโอบ",
    dials: Object.freeze({
      exposure: 1.05,
      sunScale: 1.15,
      hemiScale: 0.85,
      cloudShadowStrength: 0.38,
      fogNear: 70,
      fogFar: 300,
      groundRadius: 380,
      groundY: 9,
      groundVariation: 5.5,
      groundSkyBlend: 0.6,
      groundEdgeBlend: 34,
      foothillDistance: 0.62,
      foothillHeight: 1.85,
      rangeDistance: 0.7,
      rangeHeight: 2,
      peakDistance: 0.85,
      peakHeight: 1.6,
      hazeOpacity: 0.4,
      cameraMinPitchDeg: 18,
      mountainsEnabled: true,
      peaksEnabled: true,
      hazeEnabled: true,
    }),
  }),
  Object.freeze({
    id: "desert",
    // Deserts look enormous because the air is clear: fog starts late and never
    // fully closes, so distance is carried by the ground fading into the sky
    // rather than by haze. Cloud shadows go near-zero — that is what a cloudless
    // sky means, and it is also why the light feels harsh.
    label: "ทะเลทราย",
    hint: "อากาศใส มองไกลสุด แดดแข็ง เงาคม",
    dials: Object.freeze({
      exposure: 1.24,
      sunScale: 1.3,
      hemiScale: 0.7,
      cloudShadowStrength: 0.08,
      fogNear: 200,
      fogFar: 700,
      groundRadius: 900,
      groundY: 3,
      groundVariation: 2.2,
      groundSkyBlend: 0.5,
      groundEdgeBlend: 72,
      groundTextureReach: 2,
      foothillDistance: 1.6,
      foothillHeight: 0.7,
      rangeDistance: 1.5,
      rangeHeight: 1.1,
      peakDistance: 1.4,
      peakHeight: 1.2,
      hazeOpacity: 0.1,
      cameraMinPitchDeg: 12,
      mountainsEnabled: true,
      peaksEnabled: true,
      hazeEnabled: true,
    }),
  }),
]);

export function getWorldPreset(id) {
  return WORLD_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * Absolute, not relative: the result does not depend on where the dials were.
 * Two people picking "ทะเลทราย" on differently-tuned maps land in the same
 * place, which is the only way a preset is useful as a starting point.
 */
export function applyWorldPreset(id, defaults) {
  const preset = getWorldPreset(id);
  if (!preset) return { ...defaults };
  return { ...defaults, ...preset.dials };
}
