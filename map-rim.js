/* ==========================================================================
   map-rim.js  —  what lies past the map's edge: the land runs on, into wooded hills

     const rim = createMapRim({ rect: [x0, z0, x1, z1], heightAt, terrainMaterial, far, zc, cliffPaint,
                                horizon: { center: [x, z], radius }, clear: (x, z) => true, ways: [{ x, z, dx, dz, half }], seed });
     group.add(rim);
     rim.userData.setSun(dir);       // the crowns are lit by it, as the trees are
     rim.userData.dispose();

   One job: nothing in the world may end where the map's land ends. The land's own mesh stops at rect; from there

     1. the apron   the land's last metre is carried on outward, cliffs and all, in the land's own paint, and over some
                    seventy metres turns into hills of its own that rise as they go (so the far side is closed by land, not
                    by sky). Its first ring lies on the land's edge points, a hair under them.
     2. the woods   the same ground, further out and coarser, to the foot of the far hills (stylized-sky.js: the nearest
                    ring of ridges, which the level moves out to horizon.radius). The apron dives under it where they meet;
                    both are painted alike there, so no line shows. From some twenty metres out the meadow goes under trees:
                    it is meadow with woods on it (groves, more or less of them: RIM_LOOK.groves): under a wood the ground
                    is painted as a wood seen from afar, crowns light on top and dark between (the patch of the land's
                    shader below; aWood says how deep in a wood a point is).
     3. the crowns  the trees themselves: each one camera-facing card with a leafy outline, lit as the ball it stands for
                    (the way anime-tree.js lights a puff: the ball lends its normal, the light steps through the crowns'
                    five flat tones), on a thin trunk where it stands near enough to tell. Two triangles a crown, one draw
                    call for all of them. They begin in the last metres of the land itself, among its own trees (never
                    nearer than she can come by twenty metres), stand close in the groves, a few alone out on the meadow,
                    fewer and bigger the further off.
     4. the ways    a way that runs off the land (ways: where it meets the edge, which way it is going, how wide it is)
                    goes on over the apron as trodden earth, bends, narrows and is lost under the trees a little way into
                    the wood; no crown stands on it.

     5. shadows     every tree throws one on the meadow under it, as the land's own trees do (soft, cool, lying away from the
                    sun and moving with it), so a tree out on a hill stands on the hill. Past the land's edge they are a
                    small picture the rim's ground reads (with the land's grass look: stylized-terrain.js, grassLook); the
                    trees in the land's own last metres are handed to the level (userData.inLand) for the land's shadows.

     6. the grass   the meadow's blades stand on this ground too, as far as they are drawn (stylized-grassfield.js, PAST THE
                    LAND). They cannot ask the land's heights or its ground map out here, so the rim hands them a picture of
                    itself (userData.grass: the sheet): its height, where grass grows, where the woods are, how it leans to
                    the sun, read off its own two meshes; and its trees' shadows.

   Nothing here is walked on, and nothing moves but a slow sway of the crowns.
   Mobile-safe: no loops in the shaders, no uniform arrays.
   ========================================================================== */
import * as THREE from 'three';
import { _internal, NATURE_VCOMMON, NATURE_HAZEF } from './stylized-nature.js';
import { ANIME_PALETTES } from './anime-tree.js';

const { rgb, fbm3, mulberry32 } = _internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const RIM_LOOK = {
  apron: [-1, 0, 2.5, 6, 11, 18, 27, 38],      // metres out from the land's edge: the apron's rings (the first lies under the land)
  apronStep: 1,                   // metres between its points along the edge (the land's own are half a metre apart)
  woodsFrom: 26, woodsRings: 15, woodsStep: 4,      // the woods' ground: from here out to the far hills, in this many rings
  wood: [10, 26],                 // metres out: where the woods begin (from none to all; the line itself is ragged)
  groves: 0.5,                    // how much of the rim is wood (0: all meadow, 1: all wood): it lies in groves, meadow between them
  lone: 0.035,                    // and how many trees stand alone out on the meadow (of the places a crown could stand)
  rise: [7, 21],                  // metres the hills stand above the land's edge at their crest: the least, and what a high hill adds
  crowns: 9,                      // metres between crowns where they stand closest
  crownR: [4.6, 6.6],             // a crown's radius near the land (the land's own trees: 12 to 18 m tall); out by the far hills they are drawn up to 1.7 times as big
  trunk: [4.2, 4],                // a trunk's height up to the crown: the least, and what a tree may add
  inLand: 10,                     // crowns also stand in the land's own last metres, this far in from its edge
  floor: ['#22361a', '#3d5a2c', '#5f7f38'],      // the wood's ground, seen from afar: shade between crowns, a crown, a sunlit crown
  bark: ['#6e5044', '#4a3631'],   // a trunk: its sunny side, its shaded side
  dead: ['#554f49', '#746d64', '#958e82', '#9a9489'],      // where the land is dead (stylized-nature's setDryness): a bare crown's greys, shade to light (the dead trees' twigs: anime-tree.js), and its trunk
  way: ['#dcc07c', '#c3a162'],    // a way that runs off the land: its trodden earth, its rim (the soft ways' own earth: ground-paths.js)
  wayRun: 30,                     // metres past the land's edge such a way is still seen
  sheet: 90,                      // the grass's picture of the rim (see the sheet below) reaches this far past the land's longer side
};

// ---- the leafy card: r = inside the crown's outline, g = a tone of its own for each leaf (so the light steps leaf by leaf)
function leafMask(seed, S = 128) {
  const rng = mulberry32(seed * 977 + 5), d = new Uint8Array(S * S * 4);
  const leaf = (cx, cy, len, wid, ang, tone) => {
    const c = Math.cos(ang), s = Math.sin(ang), r = Math.ceil(len * S / 2) + 1, px = (cx * 0.5 + 0.5) * S, py = (cy * 0.5 + 0.5) * S;
    for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(S - 1, py + r); y++) for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(S - 1, px + r); x++) {
      const dx = (x + 0.5 - px) * 2 / S, dy = (y + 0.5 - py) * 2 / S, u = (dx * c + dy * s) / len, v = (-dx * s + dy * c) / wid;
      if (Math.abs(u) < 1 && Math.abs(v) < (1 - u * u) * (0.75 + 0.25 * u)) { const o = (y * S + x) * 4; d[o] = 255; d[o + 1] = tone; d[o + 3] = 255; }      // a leaf: broad at its foot, a point at its tip
    }
  };
  for (let i = 0; i < 260; i++) {                                    // the body of the crown, leaf over leaf
    const a = rng() * 6.283, q = Math.sqrt(rng()) * 0.62;
    leaf(Math.cos(a) * q, Math.sin(a) * q, 0.2 + rng() * 0.1, 0.11 + rng() * 0.05, a + (rng() - 0.5) * 1.6, 40 + rng() * 175);
  }
  for (let i = 0; i < 46; i++) {                                     // its outline: leaves that point outward, some long, some short
    const a = (i + rng() * 0.8) / 46 * 6.283, q = 0.66 + rng() * 0.12;
    leaf(Math.cos(a) * q, Math.sin(a) * q, 0.14 + rng() * 0.1, 0.08 + rng() * 0.04, a + (rng() - 0.5) * 0.9, 40 + rng() * 175);
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

const CROWN_VS = /* glsl */`
${NATURE_VCOMMON}
attribute vec4 iPos;      // xyz: the crown's middle, w: its radius
attribute vec4 iLook;     // x: how squat it is, y: its own tone (lighter or darker than the next), z: seed, w: its trunk's height (0: none drawn)
attribute float aPart;    // 0: the crown's card, 1: the trunk's
uniform sampler2D uDryMap;  // DRYNESS: how dead the land is (stylized-nature's setDryness), over the rect uDryRect
uniform vec4 uDryRect;
varying vec2 vUv;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vFwd;
varying vec3 vLook;
varying float vPart;
varying float vDry;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vRight = right; vUp = up; vFwd = cross(right, up);
  vUv = position.xy; vPart = aPart; vLook = iLook.xyz;
  vDry = texture2D(uDryMap, clamp((iPos.xz - uDryRect.xy) * uDryRect.zw, 0.0, 1.0)).r;
  vec3 p = iPos.xyz;
  if (aPart < 0.5) {
    float sway = sin(uTime * 0.8 + iLook.z * 6.28) * 0.05 * uWind;      // the wind in the crown
    p += (right * (position.x + sway) + up * position.y * iLook.x) * iPos.w;
  } else {
    vec3 side = normalize(vec3(right.x, 0.0, right.z));
    p.y -= iPos.w * iLook.x * 0.4;                                    // the trunk ends up inside the crown
    p += side * position.x * 0.085 * iPos.w + vec3(0.0, 0.5 * (position.y - 1.0) * iLook.w, 0.0);
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vHaze = hazeAt(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const CROWN_FS = /* glsl */`
${NATURE_HAZEF}
uniform sampler2D uMask;
uniform vec3 uC0, uC1, uC2, uC3, uC4, uBark0, uBark1, uSun;
uniform vec3 uDead0, uDead1, uDead2, uDeadBark;      // DRYNESS: a dead crown's greys, shade to light; its trunk
uniform vec4 uStep;
varying vec2 vUv;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vFwd;
varying vec3 vLook;
varying float vPart;
varying float vDry;
void main() {
  vec3 col;
  if (vPart > 0.5) {
    col = vUv.x * dot(vRight, uSun) > 0.0 ? uBark0 : uBark1;      // the trunk: lit on the sun's side
    col = mix(col, uDeadBark * (vUv.x * dot(vRight, uSun) > 0.0 ? 1.0 : 0.78), vDry);
  } else {
    float a = vLook.z * 6.283, c = cos(a), s = sin(a);
    vec3 t = texture2D(uMask, vec2(vUv.x * c - vUv.y * s, vUv.x * s + vUv.y * c) * 0.5 + 0.5).rgb;      // (each crown's card turned its own way)
    if (t.r < 0.5) discard;
    // DRYNESS: a dead tree's crown is bare twigs. Seen from this far: most of its leaves gone (which: by each leaf's own
    // tone), what is left a lace of dry grey the sky shows through
    if (vDry > 0.001 && fract(t.g * 7.31 + vLook.z) < vDry * 0.62) discard;
    // the ball the card stands for lends its normal; the light steps through the flat tones, leaf by leaf
    vec3 n = normalize(vRight * vUv.x + vUp * vUv.y + vFwd * sqrt(max(0.02, 1.0 - dot(vUv, vUv))));
    float v = (dot(n, uSun) * 0.5 + 0.5) * 0.66 + n.y * 0.2 + (t.g - 0.5) * 0.3 + vLook.y;
    col = uC0;
    col = mix(col, uC1, step(uStep.x, v));
    col = mix(col, uC2, step(uStep.y, v));
    col = mix(col, uC3, step(uStep.z, v));
    col = mix(col, uC4, step(uStep.w, v));
    if (vDry > 0.001) {
      vec3 dead = mix(uDead0, uDead1, step(uStep.y, v));
      dead = mix(dead, uDead2, step(uStep.w, v));
      col = mix(col, dead, smoothstep(0.05, 0.6, vDry));
    }
  }
  gl_FragColor = vec4(mix(col, uHaze, vHaze), 1.0);
}`;

// ---- the land's own paint, with the wood laid over it past the edge (a patch of stylized-terrain.js's shader)
function rimMaterial(terrainMaterial, far, zc, cliffPaint, look, paint, shade) {
  const m = terrainMaterial(far, [1e5, 1e5], zc, { cliffPaint, ...paint });       // (no fade to the far colour: the haze does that. paint: the land's own meadow, see createMapRim)
  const swap = (src, a, b) => { if (!src.includes(a)) throw new Error('map-rim: the land\'s shader has no "' + a + '"'); return src.replace(a, b); };
  m.vertexShader = swap(swap(m.vertexShader, 'attribute float aBank;', 'attribute float aBank;\n      attribute float aWood;\n      varying float vWood;'), 'vBank = aBank;', 'vBank = aBank; vWood = aWood;');
  m.fragmentShader = swap(swap(m.fragmentShader, 'varying float vBank;', 'varying float vBank;\n      varying float vWood;\n      uniform vec3 uW0, uW1, uW2;'), 'col = mix(col, uHaze, vHaze);', /* glsl */`
        // MAP RIM: past the land's edge the meadow goes under trees. A wood seen from afar: crowns light on top, dark between
        // them; lighter the deeper in (there the eye looks over the crowns, not under them). Its edge wanders and is ragged
        float wd = vWood + (j - 0.37) * 0.45 + (noise2(vWP.xz * 0.11 + 4.0) - 0.5) * 0.6 - vPath * 2.5;      // (a way into the wood is not overgrown)
        if (wd > 0.5) {
          float wv = noise2(vWP.xz * 0.21 + 3.0) * 0.6 + noise2(vWP.xz * 0.57 + 9.0) * 0.4 + (n.y - 0.9) * 1.2 + (vWood - 1.0) * 0.22;
          // (in dead land, dz: the trees are bare and the dry ground shows between them, a little darker under them)
          col = mix(wv > 0.66 ? uW2 : (wv > 0.5 ? uW1 : uW0), col * (wv > 0.5 ? 0.94 : 0.82), dz);
        }
        col = mix(col, uHaze, vHaze);`);
  // the trees' shadows: on the meadow's own ground colour, before its tones are laid in (so only with the land's grass look)
  const mark = '// GRASS_GROUND';
  if (shade && m.fragmentShader.includes(mark)) {
    m.fragmentShader = swap(swap(m.fragmentShader, 'uniform vec3 uW0, uW1, uW2;', 'uniform vec3 uW0, uW1, uW2;\n      uniform sampler2D uRimShade;\n      uniform vec3 uRimShadeRect, uRimShadeTint;\n      uniform float uRimShadeK;'),
      mark, 'gm.rgb *= mix(vec3(1.0), uRimShadeTint, texture2D(uRimShade, (vWP.xz - uRimShadeRect.xy) * uRimShadeRect.z + 0.5).r * uRimShadeK);\n            ' + mark);
    Object.assign(m.uniforms, { uRimShade: { value: shade.texture }, uRimShadeRect: { value: shade.rect }, uRimShadeTint: { value: shade.tint }, uRimShadeK: shade.k });
  }
  look.floor.forEach((c, i) => { m.uniforms['uW' + i] = { value: rgb(c) }; });
  m.uniforms.uP0.value = rgb(look.way[0]); m.uniforms.uP1.value = rgb(look.way[1]);
  return m;
}

// paint: { ground, grassLook } as the land's own paint has them (stylized-terrain.js), so the rim's meadow is the land's
export function createMapRim({ rect, heightAt, terrainMaterial, far = '#cde6f2', zc = 0, cliffPaint = null, horizon, clear = () => true, ways = [], seed = 1, look = RIM_LOOK, paint = null } = {}) {
  const [X0, Z0, X1, Z1] = rect, [HCX, HCZ] = horizon.center, R = horizon.radius * 0.985;
  const group = new THREE.Group(); group.name = 'mapRim';
  const cx = x => Math.min(X1 - 0.02, Math.max(X0 + 0.02, x)), cz = z => Math.min(Z1 - 0.02, Math.max(Z0 + 0.02, z));
  const outside = (x, z) => { const dx = Math.max(X0 - x, 0, x - X1), dz = Math.max(Z0 - z, 0, z - Z1); return dx || dz ? Math.hypot(dx, dz) : -Math.min(x - X0, X1 - x, z - Z0, Z1 - z); };      // metres out from the land's edge (under 0: in from it)

  // ---- the land's edge, all the way round (north, east, south, west), every metre: its height as it is, smoothed a little
  // (the apron's cliffs soften as they go out) and smoothed a lot (the level the hills stand on)
  const W = X1 - X0, D = Z1 - Z0, PER = 2 * (W + D), NP = Math.round(PER);
  const edgeAt = s => { s = ((s % PER) + PER) % PER; return s < W ? [X0 + s, Z0] : s < W + D ? [X1, Z0 + s - W] : s < 2 * W + D ? [X1 - (s - W - D), Z1] : [X0, Z1 - (s - 2 * W - D)]; };
  const e0 = new Float32Array(NP);
  for (let i = 0; i < NP; i++) { const [x, z] = edgeAt(i * PER / NP); e0[i] = heightAt(cx(x), cz(z)); }
  const smooth = (src, half, times) => {
    let a = src;
    for (let t = 0; t < times; t++) {
      const b = new Float32Array(NP); let sum = 0;
      for (let k = -half; k <= half; k++) sum += a[(k + NP) % NP];
      for (let i = 0; i < NP; i++) { b[i] = sum / (2 * half + 1); sum += a[(i + half + 1) % NP] - a[(i - half + NP) % NP]; }
      a = b;
    }
    return a;
  };
  const e1 = smooth(e0, 9, 2), e2 = smooth(e0, 42, 2);
  const at = (e, s) => { const f = (((s % PER) + PER) % PER) * NP / PER, i = Math.floor(f) % NP; return lerp(e[i], e[(i + 1) % NP], f - Math.floor(f)); };
  // how high the rim's ground stands: at arclength s of the edge, d metres out, at (x, z); T: how far out the far hills are there
  const ground = (s, d, x, z, T) => {
    if (d <= 0) return at(e0, s);
    const f = d / T, hill = fbm3(x * 0.011, 1.3, z * 0.011, seed + 31, 3), roll = fbm3(x * 0.034, 4.1, z * 0.034, seed + 47, 3);
    const near = lerp(at(e0, s), at(e1, s), ss(1.5, 13, d));              // (a cliff that runs off the land soon lies back into a grassy slope)
    const crest = ss(0.04, 0.5, f) * (1 - 0.5 * ss(0.68, 1, f));          // up to the crest, and down a little behind it to the foot of the far hills
    const hills = at(e2, s) + 2.5 + (look.rise[0] + look.rise[1] * hill) * crest;
    return lerp(near, hills, ss(8, 75, d)) + (roll - 0.5) * 9 * ss(4, 50, d);
  };
  // the rim is meadow with woods on it: groves some fifty metres across, more of them on the hills' shoulders than in the dips
  const grove = (x, z) => ss(-0.05, 0.05, fbm3(x * 0.013, 7.7, z * 0.013, seed + 63, 3) * 0.75 + fbm3(x * 0.041, 2.9, z * 0.041, seed + 71, 2) * 0.25 - (1 - look.groves * 0.94) * 0.99 + 0.02);
  const wood = (d, x, z) => (ss(look.wood[0], look.wood[1], d) + ss(70, 190, d)) * grove(x, z);      // 0: meadow, 1: under trees, up to 2: deep in a wood
  // a way that runs off the land: how much of it is at (x, z) (1 on it, 0 off it), and how near it a point is (in its widths)
  const wayAt = (x, z) => {
    let on = 0, near = 9;
    for (const w of ways) {
      const rx = x - w.x, rz = z - w.z, u = rx * w.dx + rz * w.dz, L = look.wayRun;
      if (u < -12 || u > L + 8) continue;
      const half = w.half * (1 - 0.35 * ss(8, L, u)), v = Math.abs(rx * w.dz - rz * w.dx - 3.4 * Math.sin(u * 0.085) * ss(3, 22, u));      // it bends as it goes, and narrows
      on = Math.max(on, (1 - ss(half * 0.75, half * 1.25, v)) * (1 - ss(L * 0.55, L, u)) * ss(-1.5, -0.5, u));
      near = Math.min(near, v / half);
    }
    return [on, near];
  };

  // ---- a ring of ground round the land: points every `step` metres along its edge (and a fan of them round each corner),
  // at each of the distances `rings` (a function of how far out the far hills are there)
  const ringMesh = (step, fan, rings, sink) => {
    const pts = [];                                                    // [x, z, nx, nz, s]: a point of the edge, the way out from it
    const sides = [[X0, Z0, 1, 0, 0, -1, W], [X1, Z0, 0, 1, 1, 0, D], [X1, Z1, -1, 0, 0, 1, W], [X0, Z1, 0, -1, -1, 0, D]];
    let s0 = 0;
    sides.forEach(([x, z, tx, tz, nx, nz, len], k) => {
      const n = Math.max(1, Math.round(len / step)), [, , , , mx, mz] = sides[(k + 1) % 4];
      for (let i = 0; i <= n; i++) pts.push([x + tx * len * i / n, z + tz * len * i / n, nx, nz, s0 + len * i / n]);
      for (let i = 1; i < fan; i++) { const a = i / fan * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a); pts.push([x + tx * len, z + tz * len, nx * c + mx * sn, nz * c + mz * sn, s0 + len]); }
      s0 += len;
    });
    const NPT = pts.length, NR = rings(100).length, pos = new Float32Array(NPT * NR * 3), bank = new Float32Array(NPT * NR).fill(10), path = new Float32Array(NPT * NR), wd = new Float32Array(NPT * NR);
    pts.forEach(([x, z, nx, nz, s], i) => {
      const qx = x - HCX, qz = z - HCZ, qn = qx * nx + qz * nz, T = -qn + Math.sqrt(Math.max(0, qn * qn - qx * qx - qz * qz + R * R));      // metres from the edge out to the far hills, this way
      rings(T).forEach((d, k) => {
        const o = k * NPT + i, px = x + nx * d, pz = z + nz * d;
        let y = ground(s, d, px, pz, T) - sink(k, NR);
        // the first rings lie along the land's own edge, a hair under it: never over it, between two of its points either
        if (d <= 0) y = Math.min(heightAt(cx(px), cz(pz)), heightAt(cx(px + nz * 0.5), cz(pz - nx * 0.5)), heightAt(cx(px - nz * 0.5), cz(pz + nx * 0.5))) - 0.08 + d;
        pos[o * 3] = px; pos[o * 3 + 1] = y; pos[o * 3 + 2] = pz; wd[o] = wood(d, px, pz); path[o] = wayAt(px, pz)[0];
      });
    });
    const idx = new Uint32Array(NPT * (NR - 1) * 6);
    let q = 0;
    for (let k = 0; k < NR - 1; k++) for (let i = 0; i < NPT; i++) { const a = k * NPT + i, b = k * NPT + (i + 1) % NPT, c = a + NPT, e = b + NPT; idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = e; idx[q++] = c; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setAttribute('aBank', new THREE.BufferAttribute(bank, 1)); g.setAttribute('aPath', new THREE.BufferAttribute(path, 1)); g.setAttribute('aWood', new THREE.BufferAttribute(wd, 1));
    g.computeVertexNormals();
    return g;
  };
  // the picture of the trees' shadows on the rim's ground: all the rim, a little under a metre to a point (filled in below)
  const SH = 1024, shadeData = new Uint8Array(SH * SH), shadeTex = new THREE.DataTexture(shadeData, SH, SH, THREE.RedFormat, THREE.UnsignedByteType);
  shadeTex.colorSpace = THREE.NoColorSpace; shadeTex.unpackAlignment = 1; shadeTex.magFilter = shadeTex.minFilter = THREE.LinearFilter;
  shadeTex.wrapS = shadeTex.wrapT = THREE.ClampToEdgeWrapping;
  const shade = { texture: shadeTex, rect: new THREE.Vector3(HCX, HCZ, 1 / (2 * R)), tint: new THREE.Vector3(...(paint && paint.ground && paint.ground.castTint ? paint.ground.castTint : [0.5, 0.6, 0.76])), k: { value: 1 } };
  const mat = rimMaterial(terrainMaterial, far, zc, cliffPaint, look, paint, shade);
  const A = look.apron, apronG = ringMesh(look.apronStep, 10, () => A, (k, n) => k === n - 1 ? 4 : 0);      // (its last ring dives under the woods)
  const woodsG = ringMesh(look.woodsStep, 22, T => Array.from({ length: look.woodsRings + 1 }, (_, k) => look.woodsFrom + (Math.max(T, look.woodsFrom + 30) - look.woodsFrom) * Math.pow(k / look.woodsRings, 1.6)), k => k === 0 ? 3 : 0);
  const apron = new THREE.Mesh(apronG, mat), woods = new THREE.Mesh(woodsG, mat);
  apron.name = 'rimApron'; woods.name = 'rimWoods';
  apron.frustumCulled = woods.frustumCulled = false;                   // (they lie all round: some of each is always in view)
  group.add(apron, woods);

  // ---- the sheet: this ground as the grass must know it to stand on it (stylized-grassfield.js, PAST THE LAND). A picture
  // of the land's surroundings, some 60 cm to a point, with in r g b a
  //   r  how high the ground stands            g  how much grass grows there: none on rock, none on a way out
  //   b  how deep in a wood it lies (aWood, less on a way: the measure the ground's own paint goes by, above)
  //   a  how its slope leans to the sun (what the paint lightens the meadow by: stylized-terrain.js, grassLook)
  // read off the two meshes themselves, point by point, the upper of them where one dives under the other: so a tuft stands
  // on the ground that is drawn, not on the one that was meant. Inside the land's edge it says what the land says (the
  // grass does not ask there, but a point beside the edge is made of both).
  const SR = Math.min(R, Math.max(W, D) / 2 + look.sheet), SN = 1024, sheetData = new Float32Array(SN * SN * 4), top = new Float32Array(SN * SN).fill(-1e9);
  const texel = v => (v + SR) / (2 * SR) * SN - 0.5;                    // (from metres off the middle to points of the picture)
  for (const g of [apronG, woodsG]) {
    const P = g.attributes.position.array, NV = g.attributes.normal.array, WD = g.attributes.aWood.array, PA = g.attributes.aPath.array, I = g.index.array;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const ax = P[a * 3] - HCX, az = P[a * 3 + 2] - HCZ, bx = P[b * 3] - HCX, bz = P[b * 3 + 2] - HCZ, cx_ = P[c * 3] - HCX, cz_ = P[c * 3 + 2] - HCZ;
      const i0 = Math.max(0, Math.ceil(texel(Math.min(ax, bx, cx_)))), i1 = Math.min(SN - 1, Math.floor(texel(Math.max(ax, bx, cx_))));
      const j0 = Math.max(0, Math.ceil(texel(Math.min(az, bz, cz_)))), j1 = Math.min(SN - 1, Math.floor(texel(Math.max(az, bz, cz_))));
      if (i0 > i1 || j0 > j1) continue;
      const den = (bz - cz_) * (ax - cx_) + (cx_ - bx) * (az - cz_);
      if (Math.abs(den) < 1e-9) continue;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) / SN * 2 * SR - SR, pz = (j + 0.5) / SN * 2 * SR - SR;
        const u = ((bz - cz_) * (px - cx_) + (cx_ - bx) * (pz - cz_)) / den, v = ((cz_ - az) * (px - cx_) + (ax - cx_) * (pz - cz_)) / den, w = 1 - u - v;
        if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
        const y = u * P[a * 3 + 1] + v * P[b * 3 + 1] + w * P[c * 3 + 1], o = j * SN + i;
        if (y <= top[o]) continue;
        top[o] = y;
        let nx = u * NV[a * 3] + v * NV[b * 3] + w * NV[c * 3], ny = u * NV[a * 3 + 1] + v * NV[b * 3 + 1] + w * NV[c * 3 + 1], nz = u * NV[a * 3 + 2] + v * NV[b * 3 + 2] + w * NV[c * 3 + 2];
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const path = u * PA[a] + v * PA[b] + w * PA[c], steep = Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(ny, 0.05);
        sheetData[o * 4] = y;
        sheetData[o * 4 + 1] = (1 - ss(0.7, 1.1, steep)) * (1 - ss(0.15, 0.55, path));      // (the land's own rule for a slope: no grass on a cliff)
        sheetData[o * 4 + 2] = u * WD[a] + v * WD[b] + w * WD[c] - path * 2.5;
        sheetData[o * 4 + 3] = (nz * 0.35 - nx * 0.3) / Math.max(ny, 0.3);
      }
    }
  }
  for (let j = 0; j < SN; j++) for (let i = 0; i < SN; i++) {
    const o = j * SN + i, x = HCX + (i + 0.5) / SN * 2 * SR - SR, z = HCZ + (j + 0.5) / SN * 2 * SR - SR;
    if (x > X0 && x < X1 && z > Z0 && z < Z1) {                          // on the land: as the land has it
      const e = 0.6, sx = (heightAt(cx(x + e), z) - heightAt(cx(x - e), z)) / (2 * e), sz = (heightAt(x, cz(z + e)) - heightAt(x, cz(z - e))) / (2 * e);
      sheetData[o * 4] = heightAt(x, z); sheetData[o * 4 + 1] = 1; sheetData[o * 4 + 2] = 0; sheetData[o * 4 + 3] = sx * 0.3 - sz * 0.35;
    } else if (top[o] < -1e8 || i === 0 || j === 0 || i === SN - 1 || j === SN - 1) sheetData[o * 4 + 1] = 0;      // no ground here, or the picture's own edge (what lies past it reads this): no grass
  }
  const sheetHalf = new Uint16Array(SN * SN * 4);
  for (let k = 0; k < sheetHalf.length; k++) sheetHalf[k] = THREE.DataUtils.toHalfFloat(sheetData[k]);
  const sheetTex = new THREE.DataTexture(sheetHalf, SN, SN, THREE.RGBAFormat, THREE.HalfFloatType);
  sheetTex.colorSpace = THREE.NoColorSpace; sheetTex.magFilter = sheetTex.minFilter = THREE.LinearFilter;
  sheetTex.wrapS = sheetTex.wrapT = THREE.ClampToEdgeWrapping; sheetTex.needsUpdate = true;

  // ---- the crowns: a jittered grid of them over the rim, close along the wood's edge, thinning out behind it
  const rng = mulberry32(seed * 131 + 9), G = look.crowns, ipos = [], ilook = [];
  const outer = [], inLand = [];                                       // every tree, for its shadow: [x, z, its height, its crown's radius], past the land's edge / in the land
  const sOf = (x, z) => { const ex = cx(x), ez = cz(z), dn = ez - Z0, de = X1 - ex, ds = Z1 - ez, dw = ex - X0, m = Math.min(dn, de, ds, dw); return m === dn ? ex - X0 : m === de ? W + ez - Z0 : m === ds ? W + D + X1 - ex : 2 * W + D + Z1 - ez; };      // the nearest point of the edge, as arclength
  const crown = (x, z, d, y, big, trunk) => {
    const r = lerp(look.crownR[0], look.crownR[1], rng()) * big, h = trunk ? (look.trunk[0] + rng() * look.trunk[1]) * Math.sqrt(big) : 0, squat = 0.78 + rng() * 0.2;
    ipos.push(x, y + (trunk ? h : 2 + rng() * 3) + r * squat * 0.45, z, r);
    ilook.push(squat, (rng() - 0.5) * 0.2 - 0.04 * ss(40, 160, d), rng(), trunk ? h + r * squat * 0.05 : 0);
    if (trunk) (d < 0 ? inLand : outer).push([x, z, h + r * squat * 1.3, r * 0.9]);
    return r;
  };
  for (let gz = HCZ - R; gz < HCZ + R; gz += G) for (let gx = HCX - R; gx < HCX + R; gx += G) {
    const x = gx + rng() * G, z = gz + rng() * G, d = outside(x, z), pick = rng();
    if (d < -look.inLand || Math.hypot(x - HCX, z - HCZ) > R - 6) continue;
    const g = grove(x, z), lone = g < 0.5;                               // out on the meadow: a tree alone, now and then
    const keep = lone ? look.lone * (d < 0 ? 0 : 1) : (d < 0 ? 0.6 : d < look.wood[0] ? 0.55 : d < 75 ? 1 : Math.pow(75 / d, 1.5));      // (far off, fewer and bigger: there they overlap from where she looks)
    if (pick > keep || (d < 0 && !clear(x, z)) || wayAt(x, z)[1] < 2.6) continue;      // (and none on a way out, nor close beside it)
    let y, T = 200;
    if (d < 0) y = heightAt(x, z);
    else {
      const ex = cx(x), ez = cz(z), nx = (x - ex) / d, nz = (z - ez) / d, qx = ex - HCX, qz = ez - HCZ, qn = qx * nx + qz * nz;
      T = -qn + Math.sqrt(Math.max(0, qn * qn - qx * qx - qz * qz + R * R));
      y = ground(sOf(x, z), d, x, z, T);
    }
    const big = 1 + 0.7 * ss(60, 200, d), near = d < 46, r = crown(x, z, d, y, big, true);      // (every tree on its trunk: a crown with none would hang in the air over the meadow)
    if ((near || lone) && rng() < 0.55) {                                         // a near crown is seldom one ball: a second, smaller, beside it and a little higher or lower
      const a = rng() * 6.283, o = r * (0.55 + rng() * 0.3), n0 = ipos.length;
      crown(x + Math.cos(a) * o, z + Math.sin(a) * o, d, y, big * 0.72, false);
      ipos[n0 + 1] = ipos[n0 - 3] + (rng() - 0.35) * r * 0.6;
    }
  }
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0, -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  quad.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 1, 0, 0, 0, 0]), 1));      // (the trunk first: the crown is drawn over its top)
  quad.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  quad.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(ipos), 4));
  quad.setAttribute('iLook', new THREE.InstancedBufferAttribute(new Float32Array(ilook), 4));
  quad.instanceCount = ipos.length / 4;
  const pal = ANIME_PALETTES.game, mask = leafMask(seed);
  const crownMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: _internal.shared.uTime, uWind: _internal.shared.uWind, uDebug: _internal.shared.uDebug,
      uHaze: _internal.shared.uHaze, uHazeNear: _internal.shared.uHazeNear, uHazeFar: _internal.shared.uHazeFar, uHazeMax: _internal.shared.uHazeMax,
      uMask: { value: mask }, uSun: { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() },
      uC0: { value: rgb(pal.tones[0]) }, uC1: { value: rgb(pal.tones[1]) }, uC2: { value: rgb(pal.tones[2]) }, uC3: { value: rgb(pal.tones[3]) }, uC4: { value: rgb(pal.tones[4]) },
      uStep: { value: new THREE.Vector4(...pal.steps) }, uBark0: { value: rgb(look.bark[0]) }, uBark1: { value: rgb(look.bark[1]) },
      uDryMap: _internal.shared.uDryMap, uDryRect: _internal.shared.uDryRect,
      ...Object.fromEntries((look.dead || RIM_LOOK.dead).map((c, i) => [i < 3 ? 'uDead' + i : 'uDeadBark', { value: rgb(c) }])),
    },
    vertexShader: CROWN_VS, fragmentShader: CROWN_FS, side: THREE.DoubleSide,
  });
  // ---- the shadows of the trees past the land's edge, for a sun at dir: each an ellipse lying away from the sun (as the
  // land's own are: its ground map's cast), into the picture. The first time at once; after that a few trees at a time, and
  // the new picture goes in whole when it is done
  let job = 0;
  const baked = new THREE.Vector3();
  const shadows = (dir, atOnce = false) => {
    const my = ++job, buf = new Uint8Array(SH * SH), span = 2 * R, px0 = HCX - R, pz0 = HCZ - R;
    const dxz = Math.hypot(dir.x, dir.z) || 1, ly = Math.max(0.3, dir.y), ux = -dir.x / dxz, uz = -dir.z / dxz, len = dxz / ly;
    let i = 0;
    const some = () => {
      if (my !== job) return;
      const t0 = performance.now();
      for (; i < outer.length && (atOnce || performance.now() - t0 < 3); i++) {
        const [tx, tz, h, rr] = outer[i], a = len * h / 2 + rr, b = rr * 1.1, x = tx + ux * len * h / 2, z = tz + uz * len * h / 2, r = Math.max(a, b);
        const i0 = Math.max(0, Math.floor((x - r - px0) / span * SH)), i1 = Math.min(SH - 1, Math.ceil((x + r - px0) / span * SH));
        const j0 = Math.max(0, Math.floor((z - r - pz0) / span * SH)), j1 = Math.min(SH - 1, Math.ceil((z + r - pz0) / span * SH));
        for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) {
          const dx = px0 + (k + 0.5) / SH * span - x, dz = pz0 + (j + 0.5) / SH * span - z, u = (dx * ux + dz * uz) / a, v = (-dx * uz + dz * ux) / b, d = Math.hypot(u, v);
          if (d >= 1) continue;
          const c = Math.round((1 - ss(0.55, 1, d)) * 0.7 * 255), o = j * SH + k;
          if (c > buf[o]) buf[o] = c;
        }
      }
      if (i < outer.length) setTimeout(some, 0); else { shadeData.set(buf); shadeTex.needsUpdate = true; }
    };
    baked.copy(dir);
    some();
  };
  shadows(crownMat.uniforms.uSun.value, true);
  const crowns = new THREE.Mesh(quad, crownMat);
  crowns.name = 'rimCrowns'; crowns.frustumCulled = false;
  group.add(crowns);

  group.userData = {
    kind: 'mapRim', crowns: quad.instanceCount, triangles: (apronG.index.count + woodsG.index.count) / 3 + quad.instanceCount * 4,
    inLand,                                                              // the trees in the land's own last metres: [x, z, height, crown's radius], for the land's own shadows
    // for the meadow's blades (createFollowGrass, beyond): the sheet and where it lies (centre x, z, 1 / its size), and the
    // trees' shadows as the rim's own ground has them
    grass: { sheet: sheetTex, rect: new THREE.Vector3(HCX, HCZ, 1 / (2 * SR)), shade: shadeTex, shadeRect: shade.rect, shadeTint: shade.tint, shadeK: shade.k },
    // the sun: the crowns are lit by it, and the shadows lie away from it (k: how dark shadows are now, 0 at night)
    setSun(dir, k = 1) {
      const u = crownMat.uniforms.uSun.value; u.copy(dir); if (u.y < 0.12) u.y = 0.12; u.normalize();      // (never lit from below the horizon: as the trees)
      shade.k.value = k;
      if (baked.distanceToSquared(u) > 0.0012) shadows(u);                                                // (the sun has moved a couple of degrees)
    },
    dispose() { job++; apronG.dispose(); woodsG.dispose(); quad.dispose(); mat.dispose(); crownMat.dispose(); mask.dispose(); shadeTex.dispose(); sheetTex.dispose(); },
  };
  return group;
}
