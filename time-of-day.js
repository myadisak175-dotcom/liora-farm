/* ==========================================================================
   time-of-day.js  —  day, evening and night

     const tod = createTimeOfDay({ sky, shadows, scene, level, rgb, setHaze });
     tod.update(dt);                 // every frame: the clock moves on and the look follows
     tod.next();                     // jump to the next of: noon, dusk, night
     tod.auto = false;               // stop the clock

   One job: turn an hour (0..24) into a look and hand it to the systems that draw it. It owns no pictures of its own.
     sky      the colours of the air and clouds, where the sun and moon are, how many stars
     scene    the haze the land fades into, and the colour the distant land blends toward (uFar of every material)
     shadows  the light of the hour: one colour every material is multiplied by (white at noon, warm at dusk, blue at night)
     level    where the sun is, so the shadows on the ground lie the right way (drawn in the background by the level)
   The look between two key hours is a smooth blend of their colours.
   ========================================================================== */
import * as THREE from 'three';

// hour, then the look at that hour. grade: what the whole scene is multiplied by.
const KEYS = [
  { h: 0,    top: '#070d24', mid: '#12214a', hor: '#243665', sunCol: '#6a7fb0', light: '#5d70a6', ambTop: '#33457c', ambBot: '#1b2750', grade: [0.26, 0.35, 0.66], stars: 1 },
  { h: 4.8,  top: '#080e26', mid: '#14234d', hor: '#27396a', sunCol: '#6a7fb0', light: '#5d70a6', ambTop: '#33457c', ambBot: '#1b2750', grade: [0.26, 0.35, 0.66], stars: 1 },
  { h: 5.8,  top: '#2a3a78', mid: '#9a6f9a', hor: '#e3a193', sunCol: '#ffae88', light: '#ffc9b0', ambTop: '#b78aa5', ambBot: '#6d6495', grade: [0.80, 0.66, 0.74], stars: 0.35 },
  { h: 6.8,  top: '#3a5fae', mid: '#e5a284', hor: '#f6c9a2', sunCol: '#ffc794', light: '#ffe0c4', ambTop: '#dcb5a8', ambBot: '#9a82a0', grade: [1.0, 0.82, 0.70], stars: 0 },
  { h: 8.5,  top: '#2767c2', mid: '#74aee6', hor: '#d5e3ee', sunCol: '#fff0d0', light: '#fffaf0', ambTop: '#c9d8ef', ambBot: '#8499bf', grade: [1.0, 0.97, 0.92], stars: 0 },
  { h: 11,   top: '#1d68c9', mid: '#63a9e8', hor: '#cde6f2', sunCol: '#fff6dc', light: '#ffffff', ambTop: '#c9d8ef', ambBot: '#8499bf', grade: [1, 1, 1], stars: 0 },
  { h: 15.5, top: '#1f66c4', mid: '#6aaae4', hor: '#d0e4ef', sunCol: '#fff3d4', light: '#ffffff', ambTop: '#c9d8ef', ambBot: '#8499bf', grade: [1.0, 0.99, 0.95], stars: 0 },
  { h: 17.3, top: '#3a63ae', mid: '#efa874', hor: '#f7cb9c', sunCol: '#ffc88a', light: '#ffe2bf', ambTop: '#e2b9a6', ambBot: '#9a7f9c', grade: [1.0, 0.82, 0.66], stars: 0 },
  { h: 18.4, top: '#32478f', mid: '#c9708a', hor: '#f2a37a', sunCol: '#ff9a62', light: '#ffc4a0', ambTop: '#b78aa5', ambBot: '#6d6495', grade: [0.90, 0.60, 0.55], stars: 0.1 },
  { h: 19.4, top: '#1b2755', mid: '#4a4a86', hor: '#8d7aa6', sunCol: '#c88aa0', light: '#b4a0c8', ambTop: '#7d78b0', ambBot: '#464f80', grade: [0.52, 0.50, 0.72], stars: 0.55 },
  { h: 20.8, top: '#070d24', mid: '#12214a', hor: '#243665', sunCol: '#6a7fb0', light: '#5d70a6', ambTop: '#33457c', ambBot: '#1b2750', grade: [0.26, 0.35, 0.66], stars: 1 },
  { h: 24,   top: '#070d24', mid: '#12214a', hor: '#243665', sunCol: '#6a7fb0', light: '#5d70a6', ambTop: '#33457c', ambBot: '#1b2750', grade: [0.26, 0.35, 0.66], stars: 1 },
];
const PRESETS = [12.5, 18.2, 22.5];                              // noon, dusk, night: what the button cycles through
const NAMES = [[5.5, 8, 'เช้า'], [8, 16.5, 'กลางวัน'], [16.5, 19.3, 'เย็น']];

const smooth = t => t * t * (3 - 2 * t);
const sstep = (a, b, x) => smooth(Math.min(1, Math.max(0, (x - a) / (b - a))));

export function createTimeOfDay({ sky, shadows = null, scene, level = null, rgb, setHaze = null, hour = 11, daySeconds = 720, azimuthNoon = 128.7, maxElevation = 56 } = {}) {
  const look = sky.userData.look;
  // the keys, with their colours turned into the kit's own raw colour vectors once
  const keys = KEYS.map(k => ({ ...k, c: Object.fromEntries(['top', 'mid', 'hor', 'sunCol', 'light', 'ambTop', 'ambBot'].map(n => [n, rgb(k[n])])), g: new THREE.Vector3(...k.grade) }));
  // everything that fades into the haze colour at a distance, and the soft mist sprites
  const fars = [], sprites = [];
  scene.traverse(o => {
    for (const m of [].concat(o.material || [])) {
      if (m.uniforms && m.uniforms.uFar && !fars.includes(m.uniforms.uFar)) fars.push(m.uniforms.uFar);
      if (m.isSpriteMaterial && !sprites.some(s => s.m === m)) sprites.push({ m, base: m.color.clone(), op: m.opacity });
    }
  });

  const cur = { top: new THREE.Vector3(), mid: new THREE.Vector3(), hor: new THREE.Vector3(), sunCol: new THREE.Vector3(), light: new THREE.Vector3(), ambTop: new THREE.Vector3(), ambBot: new THREE.Vector3(), grade: new THREE.Vector3() };
  const sun = new THREE.Vector3(), moon = new THREE.Vector3();
  const state = { hour, auto: true, speed: 24 / daySeconds, elevation: 0, daylight: 1 };

  function sunAt(h) {
    const el = maxElevation * Math.sin(Math.PI * (h - 6) / 12) * Math.PI / 180;       // up at noon, as far below at midnight
    const az = (azimuthNoon + (h - 12) * 15) * Math.PI / 180;
    return sun.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  }

  function apply() {
    const h = state.hour;
    let i = 0;
    while (i < keys.length - 2 && h >= keys[i + 1].h) i++;
    const a = keys[i], b = keys[i + 1], t = smooth(Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h))));
    for (const n of ['top', 'mid', 'hor', 'sunCol', 'light', 'ambTop', 'ambBot']) cur[n].lerpVectors(a.c[n], b.c[n], t);
    cur.grade.lerpVectors(a.g, b.g, t);
    const stars = a.stars + (b.stars - a.stars) * t;

    sunAt(h);
    moon.copy(sun).multiplyScalar(-1);
    const sinEl = sun.y, day = sstep(-0.04, 0.3, sinEl);
    state.elevation = Math.asin(sinEl) * 180 / Math.PI; state.daylight = day;

    look.uTop.value.copy(cur.top); look.uMid.value.copy(cur.mid); look.uHor.value.copy(cur.hor);
    look.uSunCol.value.copy(cur.sunCol); look.uLight.value.copy(cur.light); look.uAmbTop.value.copy(cur.ambTop); look.uAmbBot.value.copy(cur.ambBot);
    look.uSun.value.copy(sun);                                        // the dome's sun is the same vector as sky.userData.sun
    look.uMoon.value.copy(moon);
    look.uStars.value = stars;
    const moonSee = sstep(-0.02, 0.14, moon.y) * (1 - day * 0.92);
    look.uMoonCol.value.set(0.86, 0.91, 1.0).multiplyScalar(moonSee);
    sky.userData.lightDir.copy(sinEl > 0.04 ? sun : moon);            // clouds are lit by whichever of the two is up

    // the land fades into the colour of the horizon
    if (setHaze) setHaze(cur.hor);
    for (const f of fars) f.value.copy(cur.hor);
    // the light of the hour on everything; water mirrors a graded world, so it takes a slightly softer dose
    if (shadows) {
      shadows.uniforms.uGrade.value.copy(cur.grade);
      shadows.uniforms.uGradeW.value.set(Math.pow(cur.grade.x, 0.9), Math.pow(cur.grade.y, 0.9), Math.pow(cur.grade.z, 0.9));
      shadows.strength = day;                                          // cloud shadows follow the daylight
    }
    for (const s of sprites) { s.m.color.setRGB(s.base.r * Math.pow(cur.grade.x, 0.8), s.base.g * Math.pow(cur.grade.y, 0.8), s.base.b * Math.pow(cur.grade.z, 0.8)); }
    if (level && level.setSun) level.setSun(sun, day);
  }

  const api = {
    get hour() { return state.hour; },
    get auto() { return state.auto; },
    set auto(v) { state.auto = !!v; },
    get daylight() { return state.daylight; },
    get sunElevation() { return state.elevation; },
    get phase() {
      const h = state.hour;
      for (const [a, b, n] of NAMES) if (h >= a && h < b) return n;
      return 'กลางคืน';
    },
    set(h) {
      state.hour = ((h % 24) + 24) % 24;
      apply();
      sky.userData.hurry && sky.userData.hurry(3);                       // clouds are lit from somewhere new: redraw them quickly
    },
    next() {                                                           // noon -> dusk -> night -> noon
      const h = state.hour, nx = PRESETS.find(p => p > h + 0.4);
      api.set(nx ?? PRESETS[0]);
      return api.phase;
    },
    update(dt) {
      if (!state.auto) return;
      state.hour = (state.hour + dt * state.speed) % 24;
      apply();
    },
    apply,
  };
  apply();
  return api;
}
