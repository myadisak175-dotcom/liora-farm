/* ==========================================================================
   thorn-vine.js  —  the curse's thorn vines: thick tapering stems that rise from the ground, swing over in an S and end in a
   curl, set with pale thorns. One job: build them. Low poly (a six-sided stem, four-sided thorns), one draw call a vine.

     createThornVine({ seed, look: 'curse' | 'green', size }) -> Mesh       one vine (about 2.5 m high at size 1)
     createThornClump({ seed, look, size, count }) -> Group               a few vines from one root, leaning out every way
     every frame: stylized-nature's update(dt) (the vines sway on the same time and wind as the other plants)

   How it is drawn, the kit's way: flat tones, not smooth light.
     - the stem: four tones stepped by the light (deep shade -> lit), lighter along its top as it rises, and a rim of light
       along its outline
     - a dark band round the stem where each thorn sits (as a drawn vine has)
     - the thorns: three pale tones, bone-coloured on a cursed vine, a cool grey-green on a green one
   Wind: the stem sways more toward its tip; the root stays still. Haze: the kit's (far vines melt into the air), so the cloud
   shadows and the light of the hour reach them too.
   ========================================================================== */
import * as THREE from 'three';
import { mulberry32, uniforms as natureUniforms, NATURE_VCOMMON, NATURE_HAZEF } from './stylized-nature.js';

const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const range = (rng, a, b) => a + rng() * (b - a);

// the looks: stem tones (deep -> lit), the band at a thorn's foot, thorn tones (deep -> lit)
export const VINE_LOOKS = {
  curse: { stem: ['#1d1424', '#33213e', '#4d3359', '#6f5180'], band: '#120b16', thorn: ['#7d7468', '#bdb3a0', '#ece3cf'] },
  green: { stem: ['#3b6620', '#5c972b', '#84c03b', '#b7e05c'], band: '#355e1d', thorn: ['#86998c', '#c4d2c8', '#eef4ef'] },
};

const SIDES = 6;            // the stem's sides
const RINGS = 56;           // rings along a vine
const THORN_SIDES = 4;

const VS = /* glsl */`
${NATURE_VCOMMON}
uniform vec3 uSun;
attribute vec4 aVine;       // x: how far along the vine 0..1, y: band (a thorn's foot) 0..1, z: 0 stem / 1 thorn, w: the vine's own phase
varying vec3 vN;
varying vec3 vV;
varying vec4 vVine;
void main() {
  float ph = objPhase() + aVine.w * 6.28;
  float t = aVine.x;
  // sway: nothing at the root, most at the tip (a slow swing and a quicker shiver), stronger in the wind
  float k = t * t * (0.6 + 0.6 * uWind) * objScale();
  vec3 p = position + vec3(sin(uTime * 0.9 + ph) * 0.09 + sin(uTime * 2.3 + ph * 1.7) * 0.025,
                           0.0,
                           cos(uTime * 0.7 + ph * 1.3) * 0.07) * k;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - (modelMatrix * vec4(p, 1.0)).xyz);
  vVine = aVine;
  vHaze = hazeAt(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FS = /* glsl */`
${NATURE_HAZEF}
uniform vec3 uSun;
uniform vec3 uS0, uS1, uS2, uS3, uBand, uT0, uT1, uT2;
varying vec3 vN;
varying vec3 vV;
varying vec4 vVine;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float lam = dot(n, uSun) * 0.5 + 0.5;
  float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.0);
  vec3 col;
  if (vVine.z < 0.5) {
    // the stem: stepped light, lighter toward the tip and on what faces up, a rim of light on its outline
    float v = lam + (vVine.x - 0.4) * 0.14 + max(n.y, 0.0) * 0.12 + rim * 0.22;
    col = uS0;
    col = mix(col, uS1, step(0.42, v));
    col = mix(col, uS2, step(0.62, v));
    col = mix(col, uS3, step(0.86, v));
    col = mix(col, uBand, smoothstep(0.45, 0.6, vVine.y));          // the dark band where a thorn sits
  } else {
    // a thorn: three pale tones
    float v = lam + rim * 0.15;
    col = uT0;
    col = mix(col, uT1, step(0.45, v));
    col = mix(col, uT2, step(0.72, v));
  }
  gl_FragColor = vec4(mix(col, uHaze, vHaze), 1.0);
}`;

// one material per look, shared by every vine of it
const SUN = { value: new THREE.Vector3(-0.55, 0.7, 0.45).normalize() };
export function setVineSun(v) { SUN.value.copy(v); if (SUN.value.y < 0.12) SUN.value.y = 0.12; SUN.value.normalize(); }
const mats = {};
function material(look) {
  if (mats[look]) return mats[look];
  const L = VINE_LOOKS[look] || VINE_LOOKS.curse;
  return (mats[look] = new THREE.ShaderMaterial({
    uniforms: {
      ...natureUniforms, uSun: SUN,
      uS0: { value: rgb(L.stem[0]) }, uS1: { value: rgb(L.stem[1]) }, uS2: { value: rgb(L.stem[2]) }, uS3: { value: rgb(L.stem[3]) },
      uBand: { value: rgb(L.band) }, uT0: { value: rgb(L.thorn[0]) }, uT1: { value: rgb(L.thorn[1]) }, uT2: { value: rgb(L.thorn[2]) },
    },
    vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide,      // (both sides: a thorn's faces are not all wound alike)
  }));
}

// the vine's line: up out of the ground leaning out, forward and up in an S, back over the top, then a curl that winds
// down into itself. In the vine's own frame: x forward, y up, z to the side
function vinePath(rng, size) {
  const j = (v, k) => v + (rng() - 0.5) * 2 * k;
  const f = range(rng, 0.85, 1.15), h = range(rng, 0.85, 1.15), sd = rng() < 0.5 ? 1 : -1;
  const P = (x, y, z) => new THREE.Vector3(x * f * size, y * h * size, z * sd * size);
  const pts = [
    P(0, -0.2, 0), P(j(0.12, 0.05), 0.55, j(0.04, 0.05)), P(j(0.75, 0.12), j(1.15, 0.1), j(0.18, 0.1)),
    P(j(1.75, 0.15), j(1.25, 0.12), j(0.1, 0.12)), P(j(2.3, 0.12), j(1.85, 0.12), j(-0.2, 0.12)),
    P(j(1.8, 0.12), j(2.45, 0.1), j(-0.35, 0.1)), P(j(1.0, 0.12), j(2.4, 0.1), j(-0.25, 0.1)),
  ];
  // the curl: a spiral in the upright plane, starting where the line ends and heading on the way it was going (back, -x)
  const end = pts[pts.length - 1], R = range(rng, 0.42, 0.55) * size, turns = range(rng, 1.15, 1.45) * Math.PI * 2;
  const c = end.clone().add(new THREE.Vector3(0, -R, 0));
  for (let i = 1; i <= 16; i++) {
    const th = (i / 16) * turns, r = R * (1 - (i / 16) * 0.82);
    const a = Math.PI / 2 + th;                                      // starting straight above the middle, turning toward -x then down
    pts.push(new THREE.Vector3(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, c.z - (i / 16) * 0.12 * size * sd));
  }
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

// the stem's radius along it (t 0..1): thick at the root with a flared foot, thin at the tip
const radiusAt = (t, size) => (0.25 * Math.pow(1 - t, 0.7) + 0.022 + 0.16 * Math.exp(-t * 16)) * size;

function vineGeometry(seed, size) {
  const rng = mulberry32(seed * 977 + 13);
  const curve = vinePath(rng, size), len = curve.getLength();
  const frames = curve.computeFrenetFrames(RINGS, false);
  const pos = [], nor = [], vine = [], idx = [];
  const phase = rng();
  // where the thorns sit: along the vine, round it by the golden angle, none on the very root or the fine tip
  const thorns = [];
  for (let t = range(rng, 0.08, 0.12), k = 0; t < 0.88; t += range(rng, 0.09, 0.13), k++) thorns.push({ t, a: k * 2.39996 + (rng() - 0.5) * 0.7 });
  // the dark crescent round a thorn's foot: narrow along the stem, and only on the thorn's own side of it
  const outOf = T => { const i = Math.round(T.t * RINGS); return frames.normals[i].clone().multiplyScalar(Math.cos(T.a)).addScaledVector(frames.binormals[i], Math.sin(T.a)); };
  for (const T of thorns) T.out = outOf(T);
  const bandAt = (t, n) => {
    let b = 0;
    for (const T of thorns) {
      const d = (t - T.t) * len / (radiusAt(T.t, size) * 1.05);
      b = Math.max(b, Math.exp(-d * d) * THREE.MathUtils.smoothstep(n.dot(T.out), -0.1, 0.5));
    }
    return b;
  };
  // the stem: RINGS + 1 rings of SIDES (+1 to close the seam) points
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS, p = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i], r = radiusAt(t, size);
    for (let s = 0; s <= SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2, n = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      vine.push(t, bandAt(t, n), 0, phase);
    }
  }
  for (let i = 0; i < RINGS; i++) for (let s = 0; s < SIDES; s++) {
    const a = i * (SIDES + 1) + s, b = a + SIDES + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);                         // (wound to face out)
  }
  // the thorns: a four-sided spike in two parts, bent a little toward the tip, its foot sunk into the stem
  for (const T of thorns) {
    const i = Math.round(T.t * RINGS), p = curve.getPointAt(T.t), tan = curve.getTangentAt(T.t);
    const N = frames.normals[i], B = frames.binormals[i], r = radiusAt(T.t, size);
    const out = T.out.clone().normalize();
    const L = r * range(rng, 2.5, 3.1) + 0.08 * size, w = r * range(rng, 0.85, 1.0);
    const dirMid = out.clone().addScaledVector(tan, 0.25).normalize(), dirTip = out.clone().addScaledVector(tan, 0.55).normalize();
    const foot = p.clone().addScaledVector(out, r * 0.45);
    const mid = foot.clone().addScaledVector(dirMid, L * 0.5), tip = foot.clone().addScaledVector(dirMid, L * 0.5).addScaledVector(dirTip, L * 0.5);
    const u = tan.clone().cross(out).normalize(), v = out.clone().cross(u).normalize();      // across the thorn
    const base0 = pos.length / 3;
    const ringAt = (c, rad, dir) => {
      for (let s = 0; s < THORN_SIDES; s++) {
        const a = (s / THORN_SIDES) * Math.PI * 2 + Math.PI / 4, n = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
        pos.push(c.x + n.x * rad, c.y + n.y * rad, c.z + n.z * rad);
        const nn = n.clone().addScaledVector(dir, 0.35).normalize();
        nor.push(nn.x, nn.y, nn.z);
        vine.push(T.t, 0, 1, phase);
      }
    };
    ringAt(foot, w, out); ringAt(mid, w * 0.42, dirMid);
    pos.push(tip.x, tip.y, tip.z); nor.push(dirTip.x, dirTip.y, dirTip.z); vine.push(T.t, 0, 1, phase);
    const tipI = base0 + THORN_SIDES * 2;
    for (let s = 0; s < THORN_SIDES; s++) {
      const s1 = (s + 1) % THORN_SIDES, a0 = base0 + s, a1 = base0 + s1, b0 = base0 + THORN_SIDES + s, b1 = base0 + THORN_SIDES + s1;
      idx.push(a0, a1, b0, a1, b1, b0, b0, b1, tipI);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aVine', new THREE.Float32BufferAttribute(vine, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geometry: g, thorns: thorns.length };
}

export function createThornVine({ seed = 1, look = 'curse', size = 1 } = {}) {
  const { geometry, thorns } = vineGeometry(seed, size);
  const mesh = new THREE.Mesh(geometry, material(look));
  mesh.name = 'thorn_vine';
  mesh.userData = { kind: 'thornVine', seed, look, thorns, triangles: geometry.index.count / 3, dispose() { geometry.dispose(); } };
  return mesh;
}

// a clump: count vines from one root, each turned its own way and a little smaller than the one before (the first, the
// tallest), leaning out so the clump spreads like a thicket
export function createThornClump({ seed = 1, look = 'curse', size = 1, count = 4 } = {}) {
  const rng = mulberry32(seed * 313 + 5), group = new THREE.Group();
  let triangles = 0;
  const a0 = rng() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const s = size * (i === 0 ? 1 : range(rng, 0.55, 0.85));
    const v = createThornVine({ seed: seed * 17 + i, look, size: s });
    const a = a0 + (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.8, d = i === 0 ? 0 : range(rng, 0.15, 0.45) * size;
    v.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    v.rotation.y = -a + (rng() - 0.5) * 0.6;
    group.add(v);
    triangles += v.userData.triangles;
  }
  group.name = 'thorn_clump';
  group.userData = { kind: 'thornClump', seed, look, triangles, dispose() { for (const v of group.children) v.userData.dispose(); } };
  return group;
}
