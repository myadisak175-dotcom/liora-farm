/* ==========================================================================
   cave-grass.js  —  the grass of a room of the caves' kit: the tufts its bake scattered, reading the ground they stand on

     const grass = createCaveGrass({ bin, grass, ground, scale, sprite, kind, fog, fogDensity })
       bin, grass   the room's baked file and where the tufts lie in it (NAME.json's bin.grass: tufts, root, rnd, lie, light)
       ground       the room's ground (cave-ground.js' createCaveGround): its `reads` is how this file reads it
       scale        what the baked light was divided by (bin.lightScale)
       sprite       { uSprPos, uSprCol }: the one light that moves (cave-light.js' uniforms, shared)
       kind         a word from GRASSES (the room's "grass")
       fog          the room's dark far off: its colour (a Vector3) and density, as the ground's
     scene.add(grass.object)
     every frame: grass.update(dt);  grass.setWalker(position)      // her feet: the blades there part
     grass.stats   { tufts, blades, triangles, cells }

   One job: draw any kit room's grass.

   IT READS THE GROUND, AS THE MEADOW'S GRASS DOES. Above the ground the grass and the ground read one map
   (stylized-grassfield.js): the ground's colour at a spot is the blade's own at its root, and how much grass the map says
   grows there is how tall the blade stands, so no root is seen and the grass thins out into earth instead of stopping at
   a line. Here it is the same, with the cave's own ground: at every tuft's foot this shader reads the very paint and
   pictures cave-ground.js draws there, by the same lines of shader (cave-ground.js' READ):
     how tall     by how much of a ground that grows grass shows at the foot (the bake's kinds say which grow: turf):
                  full height where it lies whole, shrinking to nothing where it fades into moss, a trodden way, a
                  water's sand; and by that ground's own picture there: on its bare dark patches nothing stands
     its colour   that ground's picture at the foot, tinted as the ground tints it: deep between the roots, the ground's
                  own colour, a lighter tip
   A picture is read from a smaller copy of itself (`uLod`): one read stands for a whole tuft's foot, not for a leaf's
   edge under it. So change the ground (its paint, a kind's picture or tint) and the grass follows; nothing of its colour
   or of its patch's edge is baked. What the bake does give each tuft (tools/make-cave-room.py scatters them by rule: on
   ground that grows grass, not in water, not on steep ground or laid stone): its foot on the rock, its own dice, how the
   rock slopes there, and the light on it there.

   The look is the game's own grass (the tufts that follow her over the meadow), under a roof:
     a tuft     five soft blades from one foot, each a leaf of two parts that arcs over, turned to the eye, every one a
                little differently; taller in clumps (the bake says how tall)
     the light  what was baked where the tuft stands (as the rock under it is lit), and the sprite's as it passes
     it moves   a slow breath through the cave (a cave has no wind: `sway` is small) and each blade's own flutter; the
                blades at her feet part
     far off    it sinks into the cave's dark with the ground; right in front of the lens a blade sinks away
   Drawn in pieces of 6 m by 6 m a storey, so what is out of view is skipped.

   A LOOK OF GRASS is a line in GRASSES: its tip's colour, how deep the dark between its roots is, a blade's height and
   width, how far apart a tuft's blades stand, how much it sways, and a light of its own (glow: 0 none).
   ========================================================================== */
import * as THREE from 'three';
import { READ, num } from './cave-ground.js';

export const GRASSES = {
  green: { tip: '#c6e26c', deep: [0.7, 0.9, 0.9], height: 0.3, width: 0.058, tuft: 0.11, sway: 0.4, glow: 0 },      // the meadow's own, under a roof
  pale: { tip: '#e4e8c4', deep: [0.78, 0.86, 0.9], height: 0.24, width: 0.05, tuft: 0.1, sway: 0.3, glow: 0 },       // grass that has never seen the sun
  glow: { tip: '#9ff3df', deep: [0.6, 0.85, 0.95], height: 0.28, width: 0.055, tuft: 0.11, sway: 0.35, glow: 0.3 },  // its tips a faint light of their own
};

// a tuft's blades: offset x, offset z (tuft units), height factor, turn (the meadow's own five)
const BLADES = [[0, 0, 1.0, 0.0], [0.9, 0.25, 0.78, 0.9], [-0.75, 0.55, 0.7, -0.8], [0.2, -0.95, 0.62, 0.45], [-0.5, -0.7, 0.86, -0.35]];
function tuftGeometry() {
  const pos = [], bl = [], idx = [];
  BLADES.forEach((b, i) => {
    pos.push(-0.5, 0, 0, 0.5, 0, 0, -0.4, 0.5, 0, 0.4, 0.5, 0, 0, 1, 0);
    for (let k = 0; k < 5; k++) bl.push(...b);
    const o = i * 5; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3, o + 2, o + 3, o + 4);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(bl, 4));
  g.setIndex(idx);
  return g;
}

// the vertex shader for a room's ground: at a tuft's foot the ground is read as cave-ground.js reads it (READ), from the
// kind laid last down to the first: how much of each shows there; the ones that grow grass give it its height and colour
const small = (s, uv) => `textureLod(${s}, ${uv}, uLod)`;      // (a picture read from a smaller copy of it)
const vertexFor = ({ kinds, pars }) => {
  const lay = kinds.map((k, i) => [k, i]).reverse().map(([k, i]) => `
  a = ${READ.shows(k)}; seen = a * left; left *= 1.0 - a;      // ${k.name}` + (k.grows ? `
  if (seen > 0.0) {
    vec3 c = ${READ.colour(k, i, small)};
    float stands = ${k.grey ? '1.0' : `smoothstep(0.5, 0.78, dot(c, LUM) / max(dot(vec3(${(k.mean || [0.5, 0.5, 0.5]).map(num).join(', ')}) * uKT${i}, LUM), 1e-3))`};      // (none on its picture's bare dark patches)
    grow += seen * ${num(k.grows)} * stands; shade += c * seen; share += seen;
  }` : '')).join('');
  return /* glsl */`
${pars}
attribute vec4 aBlade;     // this blade inside its tuft: offset x, offset z, height factor, turn
attribute vec3 iRoot;      // the tuft's foot
attribute vec4 iRnd;       // turn, how tall / 2, phase, tint (each 0..1)
attribute vec4 iLie;       // how the ground slopes there in x, in z; which sheet its floor is on (/ 255)
attribute vec4 iLight;     // rgb: the light baked on it
uniform float uTime, uSway, uTuft, uScale, uLod;
uniform vec2 uBlade;       // width, height
uniform vec3 uTip, uDeep;
uniform float uGlow;
uniform vec4 uWalker;      // x, y, z of whoever walks through the grass, w = radius
uniform vec4 uSprPos;
uniform vec3 uSprCol;
varying vec3 vRoot, vMid, vTip;
varying float vY, vD;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 foot = (modelMatrix * vec4(iRoot, 1.0)).xyz;
  // ---- the ground at its foot: the stone, the paint, and what the kinds laid there leave to be seen of one another
  vec2 xz = foot.xz;
  float sheet = floor(iLie.z * 255.0 + 0.5);
  ${READ.paint(kinds, READ.where)}
  vec3 stone = ${READ.stone(small)};
  float rag = ${READ.rag}, a, seen, left = 1.0, grow = 0.0, share = 0.0;
  vec3 shade = vec3(0.0);${lay}
  if (grow <= 0.02) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }      // (nothing grows here: folded away)
  vec3 ground = shade / max(share, 1e-3);
  // ---- the tuft
  float turn = iRnd.x * 2.0 - 1.0, tall = iRnd.y * 2.0, phase = iRnd.z;
  // this blade's own root inside the tuft, on the ground as it slopes there
  float ta = turn * 3.1416, tc = cos(ta), ts = sin(ta);
  vec2 off = vec2(aBlade.x * tc - aBlade.y * ts, aBlade.x * ts + aBlade.y * tc);
  vec2 slope = iLie.xy * 2.0 - 1.0;
  vec3 root = vec3(foot.x + off.x * uTuft, foot.y + dot(off, slope) * uTuft - 0.015, foot.z + off.y * uTuft);
  float h = uBlade.y * tall * aBlade.z * smoothstep(0.1, 0.75, grow);      // (as the meadow's: by how much grass the ground says grows here)
  vec3 toC = cameraPosition - root;
  float dist = length(toC.xz);
  h *= smoothstep(0.35, 1.2, length(toC));                 // blades right in front of the lens sink away
  vec2 toCam = toC.xz / max(dist, 0.001);
  // face the eye, every blade turned a little differently
  float fa = turn * 0.6 + aBlade.w * 0.75;
  float ca = cos(fa), sa = sin(fa);
  vec2 f = vec2(toCam.x * ca - toCam.y * sa, toCam.x * sa + toCam.y * ca);
  vec2 right = vec2(f.y, -f.x);
  // a slow breath through the cave + each blade's own flutter; the blades also splay out of their tuft
  float gust = noise2(foot.xz * 0.16 - uTime * vec2(0.21, 0.13));
  float sway = (gust - 0.4) * 1.1 + sin(uTime * 1.9 + (phase + aBlade.w * 0.13) * 6.283) * 0.12;
  vec2 lean = vec2(0.86, 0.5) * sway * 0.5 * uSway + off * 0.42;
  // someone walking through: the blades right at their feet part a little, nothing gets flattened
  vec2 away = root.xz - uWalker.xz;
  float wd = length(away);
  float push = (1.0 - smoothstep(0.08, uWalker.w, wd)) * (1.0 - smoothstep(0.6, 1.4, abs(root.y - uWalker.y)));
  lean += away / max(wd, 0.05) * push * 0.42;
  h *= 1.0 - 0.12 * push;
  float y = position.y;
  float w = uBlade.x * (0.8 + 0.4 * fract(phase * 7.0)) * (1.0 + dist * 0.035);     // far blades wider: thin blades would shimmer
  vec3 p = root;
  p.xz += right * (position.x * w) + lean * (h * y * y);                              // y squared: the blade arcs over instead of tilting stiffly
  p.y += h * y * (1.0 - 0.3 * min(dot(lean, lean), 1.6) * y);
  vY = y;
  // the light where the tuft stands: baked, and the sprite's
  vec3 L = iLight.rgb * uScale;
  vec3 d = uSprPos.xyz - foot; float sd = length(d);
  float k = sd / max(uSprPos.w, 1e-3);
  float s = uSprPos.w > 0.0 ? (1.0 - smoothstep(0.0, 1.0, k)) / (1.0 + 9.0 * k * k) : 0.0;
  L += uSprCol * s * clamp(d.y / max(sd, 1e-3) * 0.65 + 0.35, 0.0, 1.0);
  // three stops up the blade: deep between the roots, the ground's own colour, a lighter tip (tall blades and clumps
  // catch more of the light; a sheen where the breath passes)
  float tint = clamp((iRnd.w * 2.0 - 1.0) * 0.45 + (aBlade.z - 0.8) * 0.9 + (tall - 1.0) * 0.7, -1.0, 1.0);
  float amt = clamp(0.7 + 0.34 * tint + 0.25 * gust * uSway, 0.0, 1.15);
  vRoot = ground * uDeep * L;
  vMid = ground * L;
  vTip = mix(ground, mix(ground * 1.17, uTip, 0.3), amt) * L + uTip * uGlow * amt;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
};
const FS = /* glsl */`
uniform vec3 uFogCol;
uniform float uFogD;
varying vec3 vRoot, vMid, vTip;
varying float vY, vD;
void main() {
  vec3 col = mix(vRoot, vMid, smoothstep(0.0, 0.42, vY));
  col = mix(col, vTip, smoothstep(0.3, 1.0, vY));
  col = mix(col, uFogCol, clamp(1.0 - exp(-vD * uFogD), 0.0, 0.88));
  gl_FragColor = vec4(col, 1.0);
}`;

const hex3 = (h) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };
const CELL = 6, STOREY = 4;        // m: the pieces it is drawn in

export function createCaveGrass({ bin, grass, ground, scale = 4, sprite = null, kind = 'green', fog = null, fogDensity = 0.018 } = {}) {
  const look = GRASSES[kind] || GRASSES.green, reads = ground.reads;
  const n = grass.tufts;
  const root = new Float32Array(bin, grass.root, n * 3), rnd = new Uint8Array(bin, grass.rnd, n * 4);
  const lie = new Uint8Array(bin, grass.lie, n * 4), light = new Uint8Array(bin, grass.light, n * 4);
  const uniforms = {
    ...reads.uniforms,                                     // (the ground's own: its paint, its pictures, their tints)
    uTime: { value: 0 }, uSway: { value: look.sway }, uTuft: { value: look.tuft }, uScale: { value: scale },
    uLod: { value: 4.5 },                                  // (a picture 16 to 32 times smaller: 7 to 15 cm a dot of it)
    uBlade: { value: new THREE.Vector2(look.width, look.height) }, uTip: { value: hex3(look.tip) },
    uDeep: { value: new THREE.Vector3(look.deep[0], look.deep[1], look.deep[2]) }, uGlow: { value: look.glow },
    uWalker: { value: new THREE.Vector4(0, -999, 0, 0.55) },
    uSprPos: sprite ? sprite.uSprPos : { value: new THREE.Vector4(0, -999, 0, 0) },
    uSprCol: sprite ? sprite.uSprCol : { value: new THREE.Vector3(0, 0, 0) },
    uFogCol: { value: fog || hex3('#0a1420') }, uFogD: { value: fogDensity },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: vertexFor(reads), fragmentShader: FS, uniforms, defines: { ...reads.defines }, side: THREE.DoubleSide });
  material.userData.noCave = true;                       // (its light is its own: baked, and the sprite's read here)
  const tuft = tuftGeometry();
  const object = new THREE.Group();
  object.name = 'cave-grass';
  // the tufts by the piece of the room each stands in
  const cells = new Map();
  for (let i = 0; i < n; i++) {
    const key = Math.floor(root[i * 3] / CELL) + ',' + Math.floor(root[i * 3 + 1] / STOREY) + ',' + Math.floor(root[i * 3 + 2] / CELL);
    let c = cells.get(key); if (!c) cells.set(key, c = []);
    c.push(i);
  }
  const made = [];
  for (const ids of cells.values()) {
    const m = ids.length, r3 = new Float32Array(m * 3), r4 = new Uint8Array(m * 4), e4 = new Uint8Array(m * 4), l4 = new Uint8Array(m * 4);
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    ids.forEach((i, k) => {
      for (let e = 0; e < 3; e++) { const v = root[i * 3 + e]; r3[k * 3 + e] = v; if (v < lo[e]) lo[e] = v; if (v > hi[e]) hi[e] = v; }
      for (let e = 0; e < 4; e++) { r4[k * 4 + e] = rnd[i * 4 + e]; e4[k * 4 + e] = lie[i * 4 + e]; l4[k * 4 + e] = light[i * 4 + e]; }
      e4[k * 4 + 2] = reads.sheetOf(root[i * 3], root[i * 3 + 1], root[i * 3 + 2]);      // (which of the ground's sheets its floor is on)
    });
    const g = new THREE.InstancedBufferGeometry();
    g.index = tuft.index;
    g.setAttribute('position', tuft.attributes.position);
    g.setAttribute('aBlade', tuft.attributes.aBlade);
    g.setAttribute('iRoot', new THREE.InstancedBufferAttribute(r3, 3));
    g.setAttribute('iRnd', new THREE.InstancedBufferAttribute(r4, 4, true));
    g.setAttribute('iLie', new THREE.InstancedBufferAttribute(e4, 4, true));
    g.setAttribute('iLight', new THREE.InstancedBufferAttribute(l4, 4, true));
    g.instanceCount = m;
    const mid = new THREE.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
    g.boundingSphere = new THREE.Sphere(mid, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + look.height * 2 + 0.3);
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'cave-grass-cell';
    object.add(mesh); made.push(g);
  }
  return {
    object, uniforms, look,
    stats: { tufts: n, blades: n * BLADES.length, triangles: n * BLADES.length * 3, cells: made.length },
    update(dt) { uniforms.uTime.value += dt; },
    setWalker(pos, r = 0.55) { uniforms.uWalker.value.set(pos.x, pos.y, pos.z, r); },
    dispose() { for (const g of made) g.dispose(); tuft.dispose(); material.dispose(); },
  };
}
