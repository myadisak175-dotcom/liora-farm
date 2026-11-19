/* ==========================================================================
   rune-circle.js  —  the circles of runes of the plant boss's sky beam (skybeam-fx.js): the one that opens on the ground
   round it, and those that open in the sky over it. Rings, a band of runes, stars drawn inside them, small circles
   riding on the rim. One job: paint a circle's picture, and draw it lying flat. It decides nothing: whoever makes one
   says how far it has opened, how it turns, how bright it is and how far it has broken up.

     const picture = runeCirclePicture('ground' | 'sky' | 'halo', { size, seed })
                                     a circle painted once on a canvas (its lines in red, their glow in green): a texture
     const circle = createRuneCircle({ picture, look, radius, split })
                                     a Mesh: a flat square lying on its back (facing up, seen from under too), radius
                                     metres from its middle to its outer ring. split: [a, b], where its three zones meet
                                     (0..1 of its radius): each zone can be turned on its own
     circle.userData.set({ open, spin, alpha, pulse, broken, fill })
         open 0..1     how far round it has been drawn (it draws itself round, a bright point at the pen's end; the
                       middle zone the other way round)
         spin [a, b, c]   radians its outer, middle and inner zone are turned
         alpha 0..1    how strongly it shows             pulse   its glow swelled, 0 as it lies
         broken 0..1   how far it has broken into bits and gone
         fill 0..1     a soft light all over its inside
     RUNE_LOOKS        the colours: a line's heart, the line, the glow round it

   How it is drawn: light laid over the picture in one blend (a line covers what is under it, its glow adds to it; by
   day the glow covers a little too, or gold on green grass would turn to yellow-green). One draw call each.
   ========================================================================== */
import * as THREE from 'three';
import { mulberry32, _internal as natureInternal } from './stylized-nature.js';

const { NOISE } = natureInternal;
const col = h => new THREE.Color().setHex(parseInt(h.slice(1), 16), THREE.LinearSRGBColorSpace);      // (as written: the kit paints in the picture's own tones)

export const RUNE_LOOKS = {
  ground: { core: '#fffbe2', main: '#ffd84a', deep: '#ff9a1e' },          // gold on the grass
  sky: { core: '#fff6c4', main: '#ffd43a', deep: '#22b888' },             // gold lines, a green-blue light round them
  halo: { core: '#f4ffd0', main: '#c6ee6a', deep: '#1f9f80' },            // the widest and highest: yellow-green
};

// --------------------------------------------------------------------------
// the picture: drawn once on a canvas
// --------------------------------------------------------------------------
const TAU = Math.PI * 2;
const BOLD = 1.3;                    // every line this much thicker than drawn: a circle is seen from far off, and low
// what the pen can do, on a canvas `size` across whose circle has radius R about (c, c)
function pen(g, c, R, rng) {
  const P = (r, a) => [c + Math.cos(a) * r * R, c + Math.sin(a) * r * R];
  const me = {
    width(w) { g.lineWidth = w * R * BOLD; },
    ring(r, w) { me.width(w); g.beginPath(); g.arc(c, c, r * R, 0, TAU); g.stroke(); },
    line(r0, a0, r1, a1, w) { me.width(w); g.beginPath(); g.moveTo(...P(r0, a0)); g.lineTo(...P(r1, a1)); g.stroke(); },
    // a star: n points on a ring, each joined to the one `step` further round
    star(n, r, step, w, turn = 0) {
      me.width(w); g.beginPath();
      for (let k = 0; k < n; k++) { g.moveTo(...P(r, turn + k / n * TAU)); g.lineTo(...P(r, turn + (k + step) / n * TAU)); }
      g.stroke();
    },
    ticks(r0, r1, n, w, turn = 0) { for (let k = 0; k < n; k++) me.line(r0, turn + k / n * TAU, r1, turn + k / n * TAU, w); },
    dots(r, n, size, turn = 0) { for (let k = 0; k < n; k++) { const [x, y] = P(r, turn + k / n * TAU); g.beginPath(); g.arc(x, y, size * R, 0, TAU); g.fill(); } },
    // a band of runes between two rings: each a stave across the band with one to three strokes off it, no two alike
    runes(r0, r1, n, w, turn = 0) {
      const h = r1 - r0, pad = h * 0.16;
      for (let k = 0; k < n; k++) {
        const a = turn + (k + 0.5) / n * TAU, wide = TAU / n * 0.3;
        const kind = rng();
        if (kind < 0.12) { const [x, y] = P(r0 + h * 0.5, a); g.beginPath(); g.arc(x, y, h * 0.1 * R, 0, TAU); g.fill(); continue; }      // (a stop between words)
        me.line(r0 + pad, a, r1 - pad, a, w);
        const strokes = 1 + Math.floor(rng() * 3);
        for (let s = 0; s < strokes; s++) {
          const f0 = rng(), f1 = rng(), sideways = (rng() < 0.5 ? -1 : 1) * wide * (0.6 + 0.4 * rng());
          me.line(r0 + pad + (h - 2 * pad) * f0, a, r0 + pad + (h - 2 * pad) * f1, a + sideways, w);
          if (rng() < 0.3) me.line(r0 + pad + (h - 2 * pad) * f1, a + sideways, r0 + pad + (h - 2 * pad) * (1 - f0), a, w);      // (back to the stave: a closed shape)
        }
      }
    },
    // a small circle riding at (r, a): its ring, a ring inside it, a little star in its middle
    moon(r, a, size, w) {
      const [x, y] = P(r, a);
      g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(x, y, size * R, 0, TAU); g.fill(); g.restore();      // (it lies over the ring it rides on)
      me.width(w); g.beginPath(); g.arc(x, y, size * R, 0, TAU); g.stroke();
      me.width(w * 0.6); g.beginPath(); g.arc(x, y, size * 0.66 * R, 0, TAU); g.stroke();
      g.beginPath();
      for (let k = 0; k < 4; k++) { const b = a + k / 4 * TAU; g.moveTo(x + Math.cos(b) * size * 0.5 * R, y + Math.sin(b) * size * 0.5 * R); g.lineTo(x - Math.cos(b) * size * 0.5 * R, y - Math.sin(b) * size * 0.5 * R); }
      g.stroke();
    },
    // a crescent, its horns turned toward the middle
    crescent(r, a, size) {
      const [x, y] = P(r, a), [x2, y2] = P(r - size * 0.42, a);
      g.beginPath(); g.arc(x, y, size * R, 0, TAU); g.fill();
      g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(x2, y2, size * 0.86 * R, 0, TAU); g.fill(); g.restore();
    },
  };
  return me;
}
// what each kind of circle is made of (radii in parts of its own radius; where its zones meet is its maker's to say)
const DESIGNS = {
  // the one on the ground: two rings with runes between them, a six-pointed star, a ring of runes in its middle
  ground(p) {
    p.ring(0.985, 0.012); p.ring(0.94, 0.02); p.runes(0.83, 0.94, 44, 0.011); p.ring(0.825, 0.014);
    p.dots(0.803, 24, 0.007);
    // (0.787: the outer zone ends)
    p.ring(0.725, 0.01); p.star(6, 0.725, 2, 0.013, Math.PI / 6); p.star(6, 0.725, 1, 0.007, 0);
    for (let k = 0; k < 6; k++) p.moon(0.725, Math.PI / 6 + k / 6 * TAU, 0.05, 0.01);
    p.ring(0.3625, 0.012);                                               // (the star's sides lie on it)
    // (0.35: the middle zone ends)
    p.ring(0.33, 0.01); p.runes(0.245, 0.33, 18, 0.01); p.ring(0.24, 0.012);
    p.star(3, 0.225, 1, 0.01, -Math.PI / 2); p.star(3, 0.225, 1, 0.01, Math.PI / 2); p.ring(0.085, 0.01); p.ticks(0.085, 0.13, 8, 0.008);
  },
  // the great one in the sky: runes round its rim, four small circles riding on it, squares and a star inside, a moon
  sky(p) {
    p.ring(0.985, 0.016); p.ring(0.955, 0.008); p.runes(0.84, 0.95, 36, 0.013); p.ring(0.835, 0.016);
    for (let k = 0; k < 4; k++) p.moon(0.905, Math.PI / 4 + k / 4 * TAU, 0.1, 0.013);
    p.ticks(0.795, 0.835, 72, 0.006);
    // (0.78: the outer zone ends)
    p.ring(0.76, 0.01); p.star(4, 0.76, 1, 0.013, 0); p.star(4, 0.76, 1, 0.013, Math.PI / 4); p.star(8, 0.76, 1, 0.006, Math.PI / 8);
    p.dots(0.6, 8, 0.016, Math.PI / 8);
    p.ring(0.5, 0.014);
    // (0.48: the middle zone ends)
    p.ring(0.46, 0.01); p.star(6, 0.46, 2, 0.013, Math.PI / 2); p.ring(0.265, 0.012); p.runes(0.19, 0.265, 14, 0.01);
    p.ring(0.185, 0.01); p.crescent(0.0, 0, 0.1);
  },
  // the widest, over it: thin and sparse, to be read from far off
  halo(p) {
    p.ring(0.985, 0.014); p.ticks(0.9, 0.985, 96, 0.006); p.ring(0.9, 0.008);
    p.runes(0.76, 0.88, 28, 0.014); p.ring(0.745, 0.012);
    // (0.72: the outer zone ends)
    p.ring(0.69, 0.008); p.star(12, 0.69, 4, 0.008, 0); p.ring(0.52, 0.006);
    for (let k = 0; k < 6; k++) p.moon(0.52, k / 6 * TAU, 0.06, 0.012);
    p.ring(0.345, 0.012);
    // (0.33: the middle zone ends)
    p.ticks(0.2, 0.315, 24, 0.008); p.ring(0.2, 0.012);
  },
};
export const RUNE_SPLITS = { ground: [0.787, 0.35], sky: [0.78, 0.48], halo: [0.72, 0.33] };

export function runeCirclePicture(kind = 'ground', { size = 1024, seed = 1 } = {}) {
  const rng = mulberry32(seed * 977 + kind.length * 13);
  const c = size / 2, R = size * 0.47;
  const lines = document.createElement('canvas'); lines.width = lines.height = size;
  const g = lines.getContext('2d');
  g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  DESIGNS[kind](pen(g, c, R, rng));
  // their glow: the same lines, blurred (twice: a tight light and a wide one)
  const soft = document.createElement('canvas'); soft.width = soft.height = size;
  const s = soft.getContext('2d');
  if ('filter' in s) {
    s.filter = `blur(${(size * 0.006).toFixed(1)}px)`; s.drawImage(lines, 0, 0);
    s.filter = `blur(${(size * 0.02).toFixed(1)}px)`; s.globalAlpha = 0.9; s.drawImage(lines, 0, 0); s.drawImage(lines, 0, 0);
  } else {
    s.shadowColor = '#fff';
    s.shadowBlur = size * 0.012; s.drawImage(lines, 0, 0);
    s.shadowBlur = size * 0.04; s.drawImage(lines, 0, 0);
  }
  // one picture: red its lines, green their glow
  const a = g.getImageData(0, 0, size, size).data, b = s.getImageData(0, 0, size, size).data;
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { out[i * 4] = a[i * 4 + 3]; out[i * 4 + 1] = b[i * 4 + 3]; out[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// --------------------------------------------------------------------------
// the circle: a flat square, lying on its back
// --------------------------------------------------------------------------
const VS = /* glsl */`
varying vec2 vP;
void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = /* glsl */`
${NOISE}
#define TAU 6.2831853
uniform sampler2D uMap;
uniform vec3 uCore, uMain, uDeep;
uniform vec3 uSpin;
uniform vec2 uSplit;
uniform float uOpen, uA, uPulse, uBroken, uFill, uCover, uSpan;
varying vec2 vP;
vec2 turn(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main() {
  vec2 p = vP / uSpan;                               // 1 at the picture's edge
  float r = length(p) / 0.94;                        // 1 at its outer ring
  if (max(abs(p.x), abs(p.y)) > 1.0 || uA < 0.003) discard;
  // its three zones, each turned on its own (the middle one drawn round the other way)
  float zone = r > uSplit.x ? 0.0 : (r > uSplit.y ? 1.0 : 2.0);
  vec2 q = turn(p, zone < 0.5 ? uSpin.x : (zone < 1.5 ? uSpin.y : uSpin.z));
  vec2 tx = texture2D(uMap, q * 0.5 + 0.5).rg;
  // drawn round as it opens: by how far round a point is, the pen's end bright
  float at = fract(atan(q.y, q.x) / TAU + 0.25 + zone * 0.31);
  if (zone > 0.5 && zone < 1.5) at = 1.0 - at;
  float open = uOpen * 1.08;
  float drawn = 1.0 - smoothstep(open - 0.05, open, at);
  float tip = exp(-(at - open + 0.03) * (at - open + 0.03) / 0.0009) * step(uOpen, 0.995) * step(0.005, uOpen);
  // broken into bits: they go one after another, those left burning brighter
  float bit = noise2(q * 17.0 + 3.0) * 0.7 + noise2(q * 5.0 - 7.0) * 0.3;
  float kept = 1.0 - smoothstep(bit - 0.08, bit, uBroken * 1.1);
  // (its glow: none under a line, so a line keeps its own colour; and gone before the picture's square edge)
  float line = tx.r * drawn * kept, glow = tx.g * drawn * kept * (1.0 - 0.85 * tx.r) * (1.0 - smoothstep(1.0, 1.055, r));
  float hot = 1.0 + 0.7 * min(uPulse, 1.3) + 1.2 * tip + 0.6 * uBroken * kept;
  vec3 c = mix(uMain, uCore, smoothstep(0.5, 0.98, line) * 0.45 + 0.18 * min(uPulse, 1.0)) * line;
  vec3 light = uDeep * glow * (0.3 + 0.16 * hot) + uMain * tx.g * tip * 0.8;
  light += uDeep * min(uFill, 1.0) * (1.0 - smoothstep(0.0, 1.0, r)) * 0.2;
  float cover = clamp(line + glow * 0.35 * uCover, 0.0, 1.0);
  vec4 o = vec4((c * min(hot, 1.5) + light) * uA, cover * uA * uCover);
  if (o.a < 0.003 && max(o.r, max(o.g, o.b)) < 0.003) discard;
  gl_FragColor = o;
}`;

export function createRuneCircle({ picture, look = RUNE_LOOKS.ground, radius = 1, split = RUNE_SPLITS.ground, cover = 1 } = {}) {
  const span = radius / 0.94;                         // (the picture's edge: its outer ring lies at 0.94 of it)
  const geo = new THREE.PlaneGeometry(span * 2, span * 2).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true,
    uniforms: {
      uMap: { value: picture }, uCore: { value: col(look.core) }, uMain: { value: col(look.main) }, uDeep: { value: col(look.deep) },
      uSpin: { value: new THREE.Vector3() }, uSplit: { value: new THREE.Vector2(split[0], split[1]) }, uSpan: { value: span },
      uOpen: { value: 0 }, uA: { value: 0 }, uPulse: { value: 0 }, uBroken: { value: 0 }, uFill: { value: 0 }, uCover: { value: cover },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'rune_circle'; mesh.frustumCulled = false; mesh.visible = false;
  const U = mat.uniforms;
  mesh.userData = {
    radius,
    set({ open, spin, alpha, pulse, broken, fill } = {}) {
      if (open !== undefined) U.uOpen.value = open;
      if (spin) U.uSpin.value.set(spin[0], spin[1], spin[2]);
      if (alpha !== undefined) { U.uA.value = alpha; mesh.visible = alpha > 0.003; }
      if (pulse !== undefined) U.uPulse.value = pulse;
      if (broken !== undefined) U.uBroken.value = broken;
      if (fill !== undefined) U.uFill.value = fill;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
  return mesh;
}
