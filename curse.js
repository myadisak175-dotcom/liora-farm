/* ==========================================================================
   curse.js  —  the village under a curse: the world drained of colour, dimmer, misty, under a heavy sky

     const curse = createCurse({ sky, haze: N.uniforms });
     curse.apply(scene, { keep: [player.object] });   // once, after everything is in the scene (and after the cloud shadows)
     curse.update(renderer);                          // every frame (only keeps the screen size for the dark edges)
     curse.changed();                                 // after a slider moves: the mist and the clouds follow

   A trial (?curse=1): one slider from "as it is" to "cursed", to find how gloomy the start of the game should be.
   How it reaches everything without editing the other files: every material of the kit is a ShaderMaterial whose main()
   ends the shader, so apply() adds a few lines at the end of each, after the light of the hour (cloud-shadows.js) has been
   laid on: the colour is greyed, tinted, dimmed, darker toward the screen's edges. The sky dome takes it too.
   Left in colour on purpose: the one who plays (keep), so she is the only colour in a grey world.
   The water takes half a dose: what it mirrors and what shows through it are cursed already.
   The mist is the kit's own haze, brought nearer and thicker; the clouds are the sky's own, made to cover more.
   Mobile-safe: a handful of operations per pixel, no textures, no loops.
   ========================================================================== */
import * as THREE from 'three';

// the sliders (tuner-panel.js shows them). amount: the whole curse; the rest: how much of each part it brings at full strength
export const CURSE_TUNE = {
  amount: { value: 0.65 },
  gray: { value: 0.8 },        // colour drained (1: grey)
  dark: { value: 0.45 },       // dimmer
  tint: { value: 0.5 },        // a cold violet cast, the colour of what rises from the abyss
  mist: { value: 0.6 },        // the haze comes near and thick
  vignette: { value: 0.5 },    // darker toward the screen's edges
  clouds: { value: 0.6 },      // a heavier sky
};

// the panel's rows (tuner-panel.js): a heading, or [name in CURSE_TUNE, label, min, max, step]
export const CURSE_CONTROLS = [
  ['คำสาป (เลื่อนจากสวยไปหม่น)'],
  ['amount', 'ความแรงของคำสาป', 0, 1, 0.01],
  ['ส่วนผสม (ตอนคำสาปเต็มที่)'],
  ['gray', 'สีซีด', 0, 1, 0.01],
  ['dark', 'ความมืด', 0, 1, 0.01],
  ['tint', 'โทนม่วงหม่น', 0, 1, 0.01],
  ['mist', 'หมอก', 0, 1, 0.01],
  ['vignette', 'ขอบจอมืด', 0, 1, 0.01],
  ['clouds', 'เมฆครึ้ม (เห็นผลหลังเลื่อนราวครึ่งวินาที)', 0, 1, 0.01],
];

const TINT = [0.82, 0.78, 0.98];      // what the colour is multiplied by at full tint: cold, a little violet
const MIST = { near: 6, far: 70, max: 0.9 };      // the haze at full mist (metres from the eye; how thick at most)
const CLOUD_COVER = 0.92;              // the sky's cloud cover at full clouds

const FRAG = /* glsl */`
uniform vec4 uCurse;          // grey, dark, tint, vignette: each already times the amount
uniform vec3 uCurseTint;
uniform vec2 uCurseRes;       // the drawing buffer's size in pixels (for the dark edges)
`;
const TAIL = /* glsl */`
  { vec3 cC = gl_FragColor.rgb; float cL = dot(cC, vec3(0.299, 0.587, 0.114));
    cC = mix(cC, vec3(cL), uCurse.x);
    cC = mix(cC, cC * uCurseTint, uCurse.z);
    cC *= 1.0 - 0.6 * uCurse.y;
    vec2 cQ = gl_FragCoord.xy / uCurseRes - 0.5;
    cC *= 1.0 - uCurse.w * smoothstep(0.08, 0.5, dot(cQ, cQ));
    gl_FragColor.rgb = cC; }
`;
const beforeEnd = (src, code) => { const i = src.lastIndexOf('}'); return src.slice(0, i) + code + src.slice(i); };   // main() is the last thing in every shader of the kit

export function createCurse({ sky = null, haze = null } = {}) {
  const t = CURSE_TUNE;
  const uniforms = { uCurse: { value: new THREE.Vector4() }, uCurseTint: { value: new THREE.Vector3(...TINT) }, uCurseRes: { value: new THREE.Vector2(1, 1) } };
  const water = { uCurse: { value: new THREE.Vector4() }, uCurseTint: uniforms.uCurseTint, uCurseRes: uniforms.uCurseRes };      // half a dose
  // what the mist and the clouds were before the curse: the curse goes from there
  const base = {
    near: haze ? haze.uHazeNear.value : 0, far: haze ? haze.uHazeFar.value : 0, max: haze ? haze.uHazeMax.value : 0,
    cover: sky && sky.userData.tune ? sky.userData.tune.cover.value : 0,
  };
  const done = new Set();
  const size = new THREE.Vector2();

  function patch(m, u) {
    if (m.fragmentShader.includes('uniform vec4 uCurse;')) return false;
    m.fragmentShader = FRAG + beforeEnd(m.fragmentShader, TAIL);
    Object.assign(m.uniforms, u);
    m.needsUpdate = true;
    return true;
  }

  const api = {
    uniforms,
    // give every material under root the curse; keep: objects whose materials stay as they are (the one who plays)
    apply(root, { keep = [] } = {}) {
      const kept = new Set();
      for (const k of keep) if (k) k.traverse(o => { for (const m of [].concat(o.material || [])) kept.add(m); });
      const skyMats = new Set();
      if (sky) sky.traverse(o => { for (const m of [].concat(o.material || [])) skyMats.add(m); });
      let n = 0;
      root.traverse(o => {
        for (const m of [].concat(o.material || [])) {
          if (!m.isShaderMaterial || done.has(m) || kept.has(m)) continue;
          done.add(m);
          if (m.userData && m.userData.noGrade && !skyMats.has(m)) continue;       // a shadow that only darkens: left alone (the sky dome is not)
          if (patch(m, m.uniforms && m.uniforms.uThrough ? water : uniforms)) n++;   // the water: half a dose
        }
      });
      api.changed();
      return n;
    },
    // after a slider moves (and once at the start): the colour, the mist and the clouds follow
    changed() {
      const a = t.amount.value;
      uniforms.uCurse.value.set(t.gray.value * a, t.dark.value * a, t.tint.value * a, t.vignette.value * a);
      water.uCurse.value.copy(uniforms.uCurse.value).multiplyScalar(0.5);
      water.uCurse.value.w = uniforms.uCurse.value.w;                           // (the dark edges are the screen's: the same everywhere)
      if (haze) {
        const k = t.mist.value * a;
        haze.uHazeNear.value = base.near + (MIST.near - base.near) * k;
        haze.uHazeFar.value = base.far + (MIST.far - base.far) * k;
        haze.uHazeMax.value = base.max + (MIST.max - base.max) * k;
      }
      if (sky && sky.userData.tune) {
        sky.userData.tune.cover.value = base.cover + (CLOUD_COVER - base.cover) * t.clouds.value * a;
        if (sky.userData.hurry) sky.userData.hurry(2.5);                         // the clouds are a baked picture: redraw it soon
      }
    },
    update(renderer) {
      renderer.getDrawingBufferSize(size);
      uniforms.uCurseRes.value.copy(size);
    },
  };
  return api;
}
