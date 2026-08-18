/**
 * Landscape starting points.
 *
 * The horizon dials are the right tool for *adjusting* a world and the wrong
 * one for *starting* one. Character comes from several of them agreeing —
 * clear air means late fog AND weak ground haze AND faint cloud shadows — and
 * you cannot arrive at that by dragging one slider at a time.
 *
 * A preset is therefore stated in absolute dial positions: it does not care
 * what the dials were before. Pick one, then tune from there.
 *
 * Every preset has to satisfy the horizon rules on its own, which is checked
 * in the tests — a starting point that starts you in a broken world is worse
 * than no starting point at all.
 *
 * Each preset only names the dials that define its character. Everything it
 * leaves out falls back to the map's own defaults, so a preset stays a
 * starting point rather than a reset button.
 */

export const WORLD_PRESETS = Object.freeze([
  Object.freeze({
    id: "island",
    label: "เกาะกลางหมอก",
    hint: "ค่ามาตรฐาน — ทุ่งกว้าง แสงนุ่ม",
    dials: Object.freeze({
      exposure: 1.12,
      sunScale: 1,
      hemiScale: 1,
      cloudShadowStrength: 0.13,
      fogNear: 340,
      fogFar: 780,
      groundRadius: 418,
      groundY: 1.4,
      groundVariation: 4.5,
      groundSkyBlend: 0.1,
    }),
  }),
  Object.freeze({
    id: "coast",
    label: "ชายทะเล",
    // The sea reads as sea because nothing interrupts the horizon line and the
    // ground never climbs: a low flat rim, a wide blend band, and enough haze
    // on the last stretch to suggest water light without bleaching it.
    hint: "ขอบฟ้าโล่ง พื้นแบน อากาศชื้น",
    dials: Object.freeze({
      exposure: 1.2,
      sunScale: 1.05,
      hemiScale: 1.1,
      cloudShadowStrength: 0.16,
      fogNear: 300,
      fogFar: 780,
      groundRadius: 418,
      groundY: -1.5,
      groundVariation: 0.8,
      groundSkyBlend: 0.22,
      groundEdgeBlend: 56,
    }),
  }),
  Object.freeze({
    id: "valley",
    label: "หุบเขา",
    // Enclosure is the whole feeling: a small visible world with the land
    // climbing and breaking up around it, tight fog so the distance reads as
    // near, and a steeper camera because there is less sky worth showing.
    hint: "โลกแคบ พื้นสูงและขรุขระ รู้สึกถูกโอบ",
    dials: Object.freeze({
      exposure: 1.05,
      sunScale: 1.15,
      hemiScale: 0.85,
      cloudShadowStrength: 0.24,
      fogNear: 240,
      fogFar: 620,
      groundRadius: 300,
      groundY: 6,
      groundVariation: 7,
      groundSkyBlend: 0.15,
      groundEdgeBlend: 34,
      // A steeper camera is the point — and at 18° the authored islands sit
      // above the top edge, so the preset switches them off rather than
      // paying for scenery nobody can see.
      cameraMinPitchDeg: 18,
      islandsEnabled: false,
      treeLineCount: 620,
      treeLineInner: 46,
      treeLineOuter: 110,
    }),
  }),
  Object.freeze({
    id: "desert",
    // Deserts look enormous because the air is clear: fog starts very late and
    // the ground keeps its own colour to the rim. Cloud shadows go near-zero —
    // that is what a cloudless sky means, and why the light feels harsh.
    label: "ทะเลทราย",
    hint: "อากาศใส มองไกลสุด แดดแข็ง เงาคม",
    dials: Object.freeze({
      exposure: 1.24,
      sunScale: 1.3,
      hemiScale: 0.7,
      cloudShadowStrength: 0.04,
      fogNear: 380,
      fogFar: 780,
      groundRadius: 418,
      groundY: 2,
      groundVariation: 2.2,
      groundSkyBlend: 0.05,
      groundEdgeBlend: 72,
      treeLineCount: 60,
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
