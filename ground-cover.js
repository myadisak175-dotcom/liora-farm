/* ==========================================================================
   ground-cover.js  —  the layer between the grass and the bushes: ferns and tall grass tufts.
   One job: build those plants, many at once, in one draw call.

   Every frond and every blade is a ribbon that leaves the ground steeply and bends over along its length (an arc), lying
   in the world its own way: from above a fern is a rosette, from the side a fountain. Nothing turns to face the eye.
     a fern   eight to eleven long fronds arching outward, three to five young ones standing in its middle (lighter);
              deep, cool greens: it grows in the shade
     a tuft   some twenty long blades from one foot, the outer ones bent right over; the grass's own greens, lighter
              toward the tips; most carry a few pale plumes on straight stalks above the blades
   Three flat tones from the light on the ribbon's upper face, the picture's own tone and how far along it is.
   They sway in the wind, and part round whoever walks through them (stylized-nature's setWalker): nothing here is solid.
   In dead land (stylized-nature's setDryness) the ferns wilt brown and many go, the grass tufts are straw: see DRY_TONES.

   createGroundCover([{ kind: 'fern' | 'tuft', x, y, z, seed, scale }, ...]) -> Mesh
     mesh.userData.thin(k)   draw only the share k (0..1) of its ribbons: for those far off
   setGroundCoverSun(vec3)   world direction toward the sun: the light on them follows it live
   setGroundCoverBrush(on)   the ferns as a brush lays them (on, as it starts; off: as they were): see BRUSH
   every frame: stylized-nature's update(dt) (time + wind are shared with the other plants)
   ========================================================================== */
import * as THREE from 'three';
import { mulberry32, uniforms as natureUniforms, NATURE_VCOMMON, NATURE_HAZEF, _internal as natureInternal } from './stylized-nature.js';

const range = (rng, a, b) => a + rng() * (b - a);
const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

const SUN = { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() };
export function setGroundCoverSun(v) {
  SUN.value.copy(v);
  if (SUN.value.y < 0.12) SUN.value.y = 0.12;                       // (at night they keep a low light)
  SUN.value.normalize();
}

// BRUSH: the ferns as a brush lays them, as the anime trees' leaves (anime-tree.js, BRUSH) and the grass's painterly look.
// Nothing is added to draw: the same ribbons, the same fronds. Two things change, on the ferns only (the tufts and their
// plumes stay as they are):
//   - the leaflets are brush dabs: round where the brush came down, drawn out to the tip, their edges broken by bristles
//   - the tones run in strokes: where the light steps from one tone to the next is moved by long patches that lean the
//     same way over the plant, so a stroke of light or of shade runs over several leaflets at once
const BRUSH = { value: 1 };
export function setGroundCoverBrush(on = true) {
  BRUSH.value = on ? 1 : 0;
  if (material) material.uniforms.uMask.value = coverAtlas(on);
}
export const groundCoverBrush = () => BRUSH.value > 0.5;

// four tones each, shade to light
const TONES = {
  fern: ['#27421f', '#3e622b', '#5d8435', '#8cab3c'],
  blade: ['#4e7c36', '#76a03e', '#a3c64c', '#cde270'],
  plume: ['#a8975c', '#cdbd80', '#eadfae', '#fbf6da'],
};
// DRYNESS (stylized-nature's setDryness: the picture the trees and the grass die by): in dead land a fern is a brown,
// wilted thing, lower and bent further over, and about half of them are gone; the blades and plumes are straw. Each goes at
// a dryness of its own, so dying land is green and brown together. Nothing baked: the picture changes, they come back
const DRY_TONES = {
  fern: ['#33271c', '#57412b', '#7e6240', '#a3895c'],
  blade: ['#6e6448', '#8f8361', '#b3a57c', '#d4caad'],      // (the dry grass's own: stylized-grassfield's DRY_GROUND)
  plume: ['#7c7466', '#9c9482', '#bdb59f', '#dcd5c1'],
};
const WIDE = 0.3;                 // a ribbon is this wide for its length (the pictures are drawn for it)

// --------------------------------------------------------------------------
// the pictures: four cells side by side, each a ribbon from its foot (bottom) to its tip (top).
// red = where there is paint, green = its tone (0 shade .. 1 light)
//   0, 1  a fern's frond: a midrib with leaflets down both sides, longest a quarter of the way up, none at the tip
//   2     a blade of grass: folded along its middle, one half in the light
//   3     a plume: a bare stalk with a feathery head
// --------------------------------------------------------------------------
const atlas = {};
function coverAtlas(brush = false) {
  const key = brush ? 'brush' : 'plain';
  if (atlas[key]) return atlas[key];
  const W = 128, H = 512, cv = document.createElement('canvas');
  cv.width = W * 4; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, H);
  const rng = mulberry32(2203), bristles = mulberry32(5309);          // (the bristles their own: the rest is drawn as before)
  const paint = t => `rgb(255,${Math.round(Math.min(1, Math.max(0, t)) * 255)},0)`;
  const cell = (k, draw) => { g.save(); g.beginPath(); g.rect(k * W + 1, 0, W - 2, H); g.clip(); draw(k * W + W / 2); g.restore(); };
  // a leaflet from (x, y) out at ang: a lance, a tone darker at its foot. BRUSH: a dab instead, round where the brush came
  // down a little out from the rib and drawn out to a soft point, its edge broken by tufts of bristles
  const leaflet = (x, y, ang, len, wid, t) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const gr = g.createLinearGradient(x, y, x + c * len, y + s * len);
    gr.addColorStop(0, paint(t * (brush ? 0.72 : 0.6))); gr.addColorStop(1, paint(t));      // (a dab is fuller at its foot: a little lighter there)
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x, y);
    if (!brush) {
      g.quadraticCurveTo(x + c * len * 0.4 - s * wid, y + s * len * 0.4 + c * wid, x + c * len, y + s * len);
      g.quadraticCurveTo(x + c * len * 0.4 + s * wid, y + s * len * 0.4 - c * wid, x, y);
    } else {
      g.save(); g.translate(x, y); g.rotate(ang);
      const r = wid * 0.6;                                             // (as wide as the lance at its widest, but full sooner)
      g.moveTo(0, 0);
      g.bezierCurveTo(len * 0.12, -r, len * 0.42, -r * 1.05, len * 0.62, -r * 0.7);
      g.quadraticCurveTo(len * 0.88, -r * 0.3, len, 0);
      g.quadraticCurveTo(len * 0.88, r * 0.3, len * 0.62, r * 0.7);
      g.bezierCurveTo(len * 0.42, r * 1.05, len * 0.12, r, 0, 0);
      for (let k = 0; k < 6; k++) {
        const along = 0.18 + bristles() * 0.6, side = bristles() < 0.5 ? -1 : 1;
        const u = len * along, v = side * r * (0.75 - Math.abs(along - 0.4) * 0.6), rx = len * (0.07 + bristles() * 0.06), ry = r * (0.22 + bristles() * 0.16);
        g.moveTo(u + rx, v); g.ellipse(u, v, rx, ry, side * 0.35, 0, Math.PI * 2);
      }
      g.restore();
    }
    g.fill();
  };
  const frond = (cx, longest, lean) => {
    for (let y = H - 34; y > 10;) {
      const s = 1 - y / H;                                             // 0 foot .. 1 tip
      const L = longest * (s < 0.22 ? 0.5 + 2.27 * s : 1 - Math.pow((s - 0.22) / 0.78, 1.7)) + 3, wid = Math.max(2.5, L * 0.17);
      for (const side of [-1, 1]) leaflet(cx, y - (side > 0 ? wid * 0.7 : 0), -Math.PI / 2 + side * (lean - 0.3 * s), L, wid, (side > 0 ? 0.52 : 0.72) + 0.28 * rng());
      y -= Math.max(6, wid * 1.5);
    }
    g.strokeStyle = paint(0.9); g.lineWidth = 3.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, H - 3); g.lineTo(cx, 8); g.stroke();
  };
  cell(0, cx => frond(cx, 58, 1.02));
  cell(1, cx => frond(cx, 50, 0.9));
  cell(2, cx => {                                                       // a blade: its two halves either side of the fold
    for (const side of [-1, 1]) {
      g.fillStyle = paint(side < 0 ? 0.92 : 0.5);
      g.beginPath(); g.moveTo(cx, H - 2); g.lineTo(cx + side * 5, H - 2);
      g.bezierCurveTo(cx + side * 14, H * 0.72, cx + side * 12, H * 0.3, cx + 1, 4);
      g.lineTo(cx, H - 2); g.fill();
    }
  });
  cell(3, cx => {                                                       // a plume: strokes up and out from the stalk's top third
    g.lineCap = 'round';
    g.strokeStyle = paint(0.5); g.lineWidth = 3; g.beginPath(); g.moveTo(cx, H - 2); g.lineTo(cx, 14); g.stroke();
    for (let y = 196; y > 12; y -= 5) {
      const k = (196 - y) / 184, hw = 27 * Math.pow(Math.sin(Math.PI * Math.pow(k, 0.75)), 0.8) + 2;
      for (const side of [-1, 1]) {
        g.strokeStyle = paint(0.55 + 0.45 * rng()); g.lineWidth = 3.4;
        g.beginPath(); g.moveTo(cx, y); g.lineTo(cx + side * hw * (0.7 + 0.3 * rng()), y - 14 - 8 * rng()); g.stroke();
      }
    }
  });
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
  return (atlas[key] = t);
}

// --------------------------------------------------------------------------
// shader: a ribbon bent into an arc. It leaves the ground at an angle (rise) and turns downward steadily along its length
// (droop), so where it is at any point along it is known outright: nothing to add up step by step
// --------------------------------------------------------------------------
const VS = /* glsl */`
${NATURE_VCOMMON}
uniform vec4 uWalker;     // her feet (world) + how far round her the plants part
uniform float uFold;      // how far the two halves of a ribbon stand up from its middle (the tangent of the angle)
attribute vec4 iRoot;     // xyz: the foot; w: 0 fern, 1 blade of grass, 2 plume
attribute vec4 iArc;      // x: the way it points (about up), y: its length, z: rise (rad from level), w: droop (rad, foot to tip)
attribute vec4 iLook;     // x: width (negative: the picture mirrored), y: atlas cell, z: phase, w: tint (-1 .. 1)
varying vec2 vUv;
varying vec3 vN;
varying vec3 vK;          // x: kind, y: how far along (0 foot .. 1 tip), z: tint
varying vec3 vP;          // where it is (world), still: the brush strokes stay on the plant as it sways
uniform sampler2D uDryMap;  // DRYNESS: how dead the land is here (red), over the rect uDryRect
uniform vec4 uDryRect;
varying float vDry;
void main() {
  vec3 root = (modelMatrix * vec4(iRoot.xyz, 1.0)).xyz;
  float dry = texture2D(uDryMap, clamp((root.xz - uDryRect.xy) * uDryRect.zw, 0.0, 1.0)).r;
  vDry = dry;
  if (iRoot.w < 0.5 && dry > mix(0.6, 1.02, fract(iLook.z * 5.13 + 0.37))) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }      // (a fern gone: the half that goes first)
  float t = position.y + 0.5, u = position.x;
  float a = iArc.z - 0.2 * dry, d = max(iArc.w, 0.02) + 0.55 * dry * step(iRoot.w, 0.5), ang = a - d * t;      // (dry: it rises less, and a fern bends further over)
  vec2 arc = vec2(sin(a) - sin(ang), cos(ang) - cos(a)) / d * iArc.y * (1.0 - 0.28 * dry);      // out, up
  vec3 dir = vec3(cos(iArc.x), 0.0, sin(iArc.x)), side = vec3(-dir.z, 0.0, dir.x);
  vec3 face = -sin(ang) * dir + vec3(0.0, cos(ang), 0.0);              // its upper face
  // folded along its middle into a shallow V (a frond's leaflets stand up from its rib, a blade is keeled): seen from the
  // side it still shows a face, and is never a line
  vec3 p = root + dir * arc.x + vec3(0.0, arc.y, 0.0) + side * u * iLook.x + face * abs(u * iLook.x) * uFold;
  vP = p;
  float ph = iLook.z + root.x * 0.3 + root.z * 0.2;
  p += vec3(sin(uTime * 1.3 + ph), 0.0, cos(uTime * 1.05 + ph * 1.3)) * (iRoot.w < 0.5 ? 0.03 : 0.075) * iArc.y * t * t * uWind;
  // someone walking through: what is near her legs parts and sinks, the more the further along the ribbon (its foot stays)
  vec2 away = p.xz - uWalker.xz;
  float wd = length(away), wy = p.y - uWalker.y;
  float push = (1.0 - smoothstep(0.1, uWalker.w * 1.25, wd)) * (1.0 - smoothstep(0.9, 1.5, wy)) * step(-0.6, wy) * t;
  p.xz += away / max(wd, 0.05) * push * 0.32;
  p.y -= push * clamp(wy * 0.5, 0.0, 0.22);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vHaze = hazeAt(mv.xyz);
  gl_Position = projectionMatrix * mv;
  vUv = vec2((uv.x + iLook.y) * 0.25, uv.y);
  vN = normalize(face - side * sign(u * iLook.x + 1e-5) * uFold * 0.8);      // each half leans a little its own way
  vK = vec3(iRoot.w, t, iLook.w);
}`;
const FS = /* glsl */`
${NATURE_HAZEF}
${natureInternal.NOISE}
uniform sampler2D uMask;
uniform vec3 uSun;
uniform float uBrush, uBrushW;      // the ferns' tones laid in brush strokes (see BRUSH), and how far a stroke moves a tone
uniform vec3 uF0, uF1, uF2, uF3, uG0, uG1, uG2, uG3, uP0, uP1, uP2, uP3;
uniform vec3 uDF0, uDF1, uDF2, uDF3, uDG0, uDG1, uDG2, uDG3, uDP0, uDP1, uDP2, uDP3;      // DRYNESS: the same, dead
varying vec2 vUv;
varying vec3 vN;
varying vec3 vK;
varying vec3 vP;
varying float vDry;
void main() {
  vec4 m = texture2D(uMask, vUv);
  float w = max(fwidth(m.r), 1e-3) * 0.75;
  float alpha = smoothstep(0.5 - w, 0.5 + w, m.r);
  if (alpha < 0.02) discard;
  float tone = m.g / max(m.r, 0.05);
  float v = (dot(normalize(vN), uSun) * 0.5 + 0.5) * 0.5 + tone * 0.38 + vK.y * 0.2 + vK.z * 0.1;
  if (uBrush > 0.5 && vK.x < 0.5) {
    // BRUSH: long patches leaning one way over the plant (a fern is small: the patches are a third of a tree's)
    vec2 sq = vec2(vP.x * 0.8 + vP.z * 0.6 + vP.y * 0.45, vP.y - (vP.x * 0.6 - vP.z * 0.8) * 0.3) * 3.0;
    float stroke = noise2(vec2(sq.x * 0.7, sq.y * 2.1)) * 0.65 + noise2(vec2(sq.x * 1.7 + 5.0, sq.y * 4.8)) * 0.35;
    v += (stroke - 0.5) * uBrushW;
  }
  vec3 c0 = uF0, c1 = uF1, c2 = uF2, c3 = uF3;
  if (vK.x > 1.5) { c0 = uP0; c1 = uP1; c2 = uP2; c3 = uP3; }
  else if (vK.x > 0.5) { c0 = uG0; c1 = uG1; c2 = uG2; c3 = uG3; }
  if (vDry > 0.002) {                                                   // DRYNESS: the dead tones, by how dead the land is (each plant at its own pace)
    vec3 d0 = uDF0, d1 = uDF1, d2 = uDF2, d3 = uDF3;
    if (vK.x > 1.5) { d0 = uDP0; d1 = uDP1; d2 = uDP2; d3 = uDP3; }
    else if (vK.x > 0.5) { d0 = uDG0; d1 = uDG1; d2 = uDG2; d3 = uDG3; }
    float k = smoothstep(0.05, 0.6, vDry);
    c0 = mix(c0, d0, k); c1 = mix(c1, d1, k); c2 = mix(c2, d2, k); c3 = mix(c3, d3, k);
  }
  vec3 col = mix(c0, c1, step(0.42, v));
  col = mix(col, c2, step(0.62, v));
  col = mix(col, c3, step(0.84, v));
  gl_FragColor = vec4(mix(col, uHaze, vHaze), alpha);
}`;
let material = null;
function coverMaterial() {
  if (material) return material;
  const U = { ...natureUniforms, uSun: SUN, uMask: { value: coverAtlas(BRUSH.value > 0.5) }, uFold: { value: 0.5 }, uBrush: BRUSH, uBrushW: { value: 0.25 } };
  for (const [k, name] of [['F', 'fern'], ['G', 'blade'], ['P', 'plume']]) {
    TONES[name].forEach((c, i) => { U['u' + k + i] = { value: rgb(c) }; });
    DRY_TONES[name].forEach((c, i) => { U['uD' + k + i] = { value: rgb(c) }; });
  }
  return (material = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, alphaToCoverage: true, side: THREE.DoubleSide }));
}

// --------------------------------------------------------------------------
export function createGroundCover(list) {
  const ribbons = [];
  let ferns = 0, tufts = 0;
  for (const e of list) {
    const rng = mulberry32(Math.round(e.seed ?? 1) * 7717 + 3), s = e.scale ?? 1;
    // one ribbon: kind, its foot's offset from the plant's, the way it points, length, rise, droop, cell, tint
    const add = (kind, ox, oz, az, len, rise, droop, cellI, tint) => {
      ribbons.push([e.x + ox, e.y - 0.03, e.z + oz, kind, az, len, rise, droop, len * WIDE * (rng() < 0.5 ? -1 : 1), cellI, rng() * 6.28, tint]);
    };
    const a0 = rng() * 6.28;
    if (e.kind === 'fern') {
      ferns++;
      const outer = 8 + Math.floor(rng() * 4), inner = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < outer; i++)                                   // the grown fronds: out and over
        add(0, 0, 0, a0 + i / outer * 6.28 + (rng() - 0.5) * 0.5, range(rng, 0.9, 1.2) * s, range(rng, 1.24, 1.4), range(rng, 1.3, 1.65), rng() < 0.5 ? 0 : 1, range(rng, -1, 0.1));
      for (let i = 0; i < inner; i++)                                   // the young ones: upright in the middle, lighter
        add(0, 0, 0, a0 + 1 + i / inner * 6.28 + (rng() - 0.5) * 0.8, range(rng, 0.55, 0.8) * s, range(rng, 1.36, 1.5), range(rng, 0.7, 1.15), rng() < 0.5 ? 0 : 1, range(rng, 0.3, 1));
    } else {
      tufts++;
      const n = 18 + Math.floor(rng() * 9);
      for (let i = 0; i < n; i++) {                                     // blades from a small foot, the outer ones bent right over
        const az = a0 + i * 2.4 + (rng() - 0.5), out = rng();
        add(1, Math.cos(az) * 0.07 * s * out, Math.sin(az) * 0.07 * s * out, az, range(rng, 0.62, 1.0) * s, range(rng, 1.15, 1.45) - 0.12 * out, 0.55 + 0.95 * out * range(rng, 0.6, 1), 2, range(rng, -1, 1));
      }
      for (let i = 0, k = rng() < 0.65 ? 1 + Math.floor(rng() * 3) : 0; i < k; i++)      // plumes on straight stalks above them
        add(2, 0, 0, a0 + i * 2.1 + rng(), range(rng, 0.95, 1.25) * s, range(rng, 1.36, 1.5), range(rng, 0.25, 0.6), 3, range(rng, -0.5, 1));
    }
  }
  // in a shuffled order, so the first part of them is every plant thinned evenly (see thin below)
  const sh = mulberry32(ribbons.length * 13 + 7);
  for (let i = ribbons.length - 1; i > 0; i--) { const j = Math.floor(sh() * (i + 1)), t = ribbons[i]; ribbons[i] = ribbons[j]; ribbons[j] = t; }
  const R = new Float32Array(ribbons.length * 4), A = new Float32Array(ribbons.length * 4), L = new Float32Array(ribbons.length * 4);
  ribbons.forEach((b, i) => { R.set(b.slice(0, 4), i * 4); A.set(b.slice(4, 8), i * 4); L.set(b.slice(8, 12), i * 4); });
  const strip = new THREE.PlaneGeometry(1, 1, 2, 5);                    // (two across: the fold along its middle)
  const g = new THREE.InstancedBufferGeometry();
  g.index = strip.index;
  g.setAttribute('position', strip.attributes.position);
  g.setAttribute('uv', strip.attributes.uv);
  g.setAttribute('iRoot', new THREE.InstancedBufferAttribute(R, 4));
  g.setAttribute('iArc', new THREE.InstancedBufferAttribute(A, 4));
  g.setAttribute('iLook', new THREE.InstancedBufferAttribute(L, 4));
  const all = ribbons.length;
  g.instanceCount = all;
  const mesh = new THREE.Mesh(g, coverMaterial());
  mesh.frustumCulled = false;
  mesh.name = 'ground_cover';
  mesh.userData = {
    kind: 'groundCover', ferns, tufts, ribbons: all,
    thin(k) { g.instanceCount = Math.max(1, Math.round(all * Math.min(1, k))); },      // from far off: only this share of the ribbons is drawn
    dispose() { g.dispose(); },
  };
  return mesh;
}
