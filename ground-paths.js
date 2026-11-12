// ground-paths.js  —  trodden dirt paths: warm sandy earth worn into the meadow, grass breaking into it in clumps at the edges,
// flat stones set into it and pebbles by its sides
//
// The way a studio lays a road over a landscape: the path is a ribbon that follows a line over the ground (a spline decal), with
// its own painted look, sitting a hair above the land. The ground's own colour map (stylized-grassfield.js) is told where the
// path is too, so the grass stops at it and the shadows fall on it, and the ribbon reads that map back: wherever the map says
// grass grows, the ribbon is not drawn, so the grass and the path meet along one ragged edge.
//
//   const P = createPaths({ paths: [{ points: [[x, z], ...], half: 1.2 }], seed });
//   heightFn: h += P.sink(x, z)                    the path lies a few centimetres below the grass
//   paint:    [earth, sand, mow] from P.paint(x, z)  bare earth on the path, clumps of grass at its edges, short grass beside it
//   group.add(P.ribbon(heightAt, map))             the painted path itself (after the ground map is made)
//   P.stones(heightAt)                             [{ type, seed, x, z, ry, s, y }] flat stones and pebbles to set into it
//   P.flowers                                      [x, z, radius] places beside the path for a few flowers

import * as THREE from 'three';
import { _internal } from './stylized-nature.js';

const { fbm3, mulberry32, NOISE, HAZEF, rgb, shared } = _internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const COLORS = { light: '#e9d4a3', mid: '#d7ba82', dark: '#bb9a63', damp: '#a98b57', rim: '#94824f', speckLight: '#f4e8c8', speckDark: '#9b8253' };

export function createPaths({ paths = [], seed = 1 } = {}) {
  const lines = paths.map(p => ({ pts: densify(p.points, 0.5), half: p.half || 1.1 }));
  for (const l of lines) {
    l.box = [Math.min(...l.pts.map(q => q[0])) - l.half * 2 - 1, Math.max(...l.pts.map(q => q[0])) + l.half * 2 + 1, Math.min(...l.pts.map(q => q[1])) - l.half * 2 - 1, Math.max(...l.pts.map(q => q[1])) + l.half * 2 + 1];
    l.len = [0]; for (let i = 1; i < l.pts.length; i++) l.len.push(l.len[i - 1] + Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]));
  }
  // the nearest path: how far from its middle, and how wide it is there
  const near = (x, z) => {
    let best = 1e9, half = 1;
    for (const l of lines) {
      const [x0, x1, z0, z1] = l.box;
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      for (let i = 0; i < l.pts.length - 1; i++) {
        const ax = l.pts[i][0], az = l.pts[i][1], bx = l.pts[i + 1][0] - ax, bz = l.pts[i + 1][1] - az;
        const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz))), d = Math.hypot(x - ax - bx * t, z - az - bz * t);
        if (d < best) { best = d; half = l.half; }
      }
    }
    return { d: best, half };
  };
  // the path's edge wanders: broad bends and small bites
  const edge = (x, z, d) => d + (fbm3(x * 0.45, 1.3, z * 0.45, seed + 3, 2) - 0.5) * 0.7 + (fbm3(x * 1.8, 2.7, z * 1.8, seed + 5, 2) - 0.5) * 0.22;
  return {
    near,
    sink(x, z) { const { d, half } = near(x, z); return d > half * 2 ? 0 : -0.07 * (1 - ss(half * 0.55, half * 1.15, d)); },
    paint(x, z) {
      const { d, half } = near(x, z);
      if (d > half * 2.2) return null;
      const e = edge(x, z, d);
      let earth = 1 - ss(half * 0.72, half * 1.02, e);
      // clumps of grass that have pushed in from the edges (none in the middle, where feet keep it bare)
      const clump = ss(0.6, 0.66, fbm3(x * 0.95, 4.1, z * 0.95, seed + 9, 2)) * ss(half * 0.3, half * 0.75, d);
      earth *= 1 - clump;
      const mow = (1 - ss(half * 1.0, half * 1.7, e)) * 0.85;                // the grass right beside it is short, trodden
      return [earth, 0, mow];
    },
    // the painted path: a ribbon over the ground, as wide as the path and a little more (the ground map decides where it shows)
    ribbon(heightAt, map) {
      const group = new THREE.Group(); group.name = 'paths';
      const mat = pathMaterial(map);
      for (const l of lines) {
        const ACROSS = 12, W = l.half * 1.45, pos = [], acr = [], idx = [];
        for (let k = 0; k < l.pts.length; k++) {
          const a = l.pts[Math.max(0, k - 1)], b = l.pts[Math.min(l.pts.length - 1, k + 1)], p = l.pts[k];
          let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
          for (let i = 0; i <= ACROSS; i++) {
            const u = -1 + 2 * i / ACROSS, x = p[0] - tz * u * W, z = p[1] + tx * u * W;
            pos.push(x, heightAt(x, z) + 0.035, z); acr.push(u * W / l.half);
          }
        }
        for (let k = 0; k < l.pts.length - 1; k++) for (let i = 0; i < ACROSS; i++) { const a = k * (ACROSS + 1) + i, b = a + ACROSS + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('aAcross', new THREE.Float32BufferAttribute(acr, 1));
        g.setIndex(idx); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat); m.renderOrder = 0; m.name = 'path';
        m.userData = { kind: 'path', dispose: () => g.dispose() };
        group.add(m);
      }
      group.userData.dispose = () => mat.dispose();
      return group;
    },
    // flat stones worn into the path (alone or in twos and threes) and pebbles at its sides
    stones() {
      const rng = mulberry32(seed * 97 + 5), out = [];
      for (const l of lines) {
        const total = l.len[l.len.length - 1];
        for (let s = 1 + rng() * 2; s < total - 0.5; s += 1.8 + rng() * 2.8) {
          const [x, z, tx, tz] = along(l, s), n = rng() < 0.3 ? 2 + Math.floor(rng() * 2) : 1;
          const off = (rng() - 0.5) * l.half * 1.1;
          for (let k = 0; k < n; k++) {
            const o = off + (k ? (rng() - 0.5) * 0.9 : 0), f = k * (0.55 + rng() * 0.2);
            out.push({ type: 'flagstone', seed: 1 + Math.floor(rng() * 9999), x: x - tz * o + tx * f, z: z + tx * o + tz * f, ry: rng() * 360, s: 0.55 + rng() * 0.45, sink: 0.02 });
          }
        }
        for (let s = 2 + rng() * 3; s < total - 1; s += 3.5 + rng() * 4) {
          const [x, z, tx, tz] = along(l, s), side = rng() < 0.5 ? -1 : 1, o = side * l.half * (0.95 + rng() * 0.4);
          out.push({ type: 'pebbles', seed: 1 + Math.floor(rng() * 9999), x: x - tz * o, z: z + tx * o, ry: rng() * 360, s: 0.45 + rng() * 0.35, sink: 0.02 });
        }
      }
      return out;
    },
    // a few places beside the path for flowers
    get flowers() {
      const rng = mulberry32(seed * 53 + 11), out = [];
      for (const l of lines) {
        const total = l.len[l.len.length - 1];
        for (let s = 3 + rng() * 4; s < total - 1; s += 6 + rng() * 6) {
          const [x, z, tx, tz] = along(l, s), o = (rng() < 0.5 ? -1 : 1) * l.half * (1.7 + rng() * 0.8);
          out.push([x - tz * o, z + tx * o, 0.8 + rng() * 0.8]);
        }
      }
      return out;
    },
  };
}

// the point s metres along a path, and its direction there
function along(l, s) {
  let i = 1; while (i < l.len.length - 1 && l.len[i] < s) i++;
  const a = l.pts[i - 1], b = l.pts[i], t = (s - l.len[i - 1]) / Math.max(1e-6, l.len[i] - l.len[i - 1]);
  const dx = b[0] - a[0], dz = b[1] - a[1], dl = Math.hypot(dx, dz) || 1;
  return [a[0] + dx * t, a[1] + dz * t, dx / dl, dz / dl];
}

// the path's paint: warm and light down the middle, darker towards the edges, broad flat dabs of tone like a painted
// background, fine grains of sand, damp darker spots, and a dark rim where it meets the grass. Where the ground map says grass
// grows, nothing is drawn; the grass and its roots carry on from there.
function pathMaterial(map) {
  const C = COLORS;
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map.texture }, uMapRect: { value: map.rect }, uCast: { value: map.cast || null }, uCastTint: { value: new THREE.Vector3(...(map.castTint || [0.5, 0.6, 0.76])) },
      uLight: { value: rgb(C.light) }, uMid: { value: rgb(C.mid) }, uDark: { value: rgb(C.dark) }, uDamp: { value: rgb(C.damp) }, uRim: { value: rgb(C.rim) },
      uSpL: { value: rgb(C.speckLight) }, uSpD: { value: rgb(C.speckDark) },
      uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
    },
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      attribute float aAcross;
      varying vec3 vWP;
      varying float vAcross, vHaze;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vAcross = aAcross;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${HAZEF}
      uniform sampler2D uMap, uCast;
      uniform vec3 uMapRect, uCastTint, uLight, uMid, uDark, uDamp, uRim, uSpL, uSpD;
      varying vec3 vWP;
      varying float vAcross;
      void main() {
        vec2 uv = (vWP.xz - uMapRect.xy) * uMapRect.z + 0.5;
        vec4 m = texture2D(uMap, uv);
        float grass = m.a + (noise2(vWP.xz * 6.0) - 0.5) * 0.22 + (noise2(vWP.xz * 17.0) - 0.5) * 0.08;
        if (grass > 0.5) discard;                                                // the grass's ground, not the path's
        float t = abs(vAcross);
        // broad flat dabs of tone (three steps, wobbly edges), lighter down the middle
        float dab = noise2(vWP.xz * 0.9) * 0.55 + noise2(vWP.xz * 2.6 + 3.0) * 0.3 + noise2(vWP.xz * 7.0) * 0.15 - t * 0.35;
        vec3 col = dab > 0.46 ? uLight : (dab > 0.3 ? uMid : uDark);
        col = mix(col, uDamp, smoothstep(0.66, 0.7, noise2(vWP.xz * 0.55 + 11.0)) * 0.6);       // damp, darker spots
        // grains of sand: a few light and dark specks
        vec2 cell = floor(vWP.xz * 16.0);
        float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        col = h > 0.965 ? mix(col, uSpL, 0.7) : (h < 0.035 ? mix(col, uSpD, 0.6) : col);
        // where the grass begins: a dark rim of roots and damp earth
        col = mix(col, uRim, smoothstep(0.18, 0.48, grass) * 0.75);
        col *= mix(vec3(1.0), uCastTint, texture2D(uCast, uv).r);                // the sun's shadows
        gl_FragColor = vec4(mix(col, uHaze, vHaze), 1.0);
      }`,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

// Catmull-Rom through the control points, about every `step` metres
function densify(pts, step = 1) {
  const out = [], P = i => pts[Math.min(pts.length - 1, Math.max(0, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2), n = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => 0.5 * ((2 * b[j]) + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
