/* ==========================================================================
   stylized-buildings.js  —  village pieces built in code, in the kit's flat-colour look
   Stand-ins until real models take their place: every piece is a handful of boxes, slabs and cylinders, each one flat
   colour (on the vertices, like the restyled models in stylized-props.js), flat-shaded so the kit's three bands of
   light fall cleanly on every face. Draw them with propMaterial().

     const g = houseGeometry({ w: 6, d: 5, floors: 2, seed: 3 });     // local space: ridge along x, door on the +z side, y = 0 at the ground
     place(g, x, y, z, yaw);                                          // turn it and stand it somewhere
     const mesh = new THREE.Mesh(mergeGeometries([...]), propMaterial());

   houseGeometry      a timber-framed house with a tiled roof (1 or 2 floors, chimney, door, shuttered windows)
   towerGeometry      a square stone keep with battlements, a corner turret and pointed roofs
   wheelGeometry      a water wheel, turning about its x axis (a mesh of its own, so it can spin)
   stoneBridgeGeometry  a humpbacked stone bridge along x; stoneBridgeDeck(u, opts) is the height of its deck above its base
   wellGeometry       a round stone well under a little roof
   fenceGeometry      posts and two rails along a line of points on the ground (world space)
   rectCircles        circles along the walls of a turned rectangle, for colliders

   No shaders here: one job, the shapes.
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rgb = hex => { const c = new THREE.Color(hex).convertLinearToSRGB(); return [c.r, c.g, c.b]; };      // display values, like the rest of the kit
export const BUILD_COLORS = {
  stone: '#dccdb0', stoneDark: '#b3a58e', plaster: '#f2e8cf', timber: '#8c5b38', timberDark: '#5e4030',
  roof: '#c8603a', roofDark: '#a44a30', door: '#7a4a2c', glass: '#4f6a86', water: '#3f86a6', flag: '#c9483a',
  shutters: ['#5f8f6a', '#4f7f96', '#b0563c', '#8a6a3a'],
};
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// a little workshop: add pieces, each one flat colour, then merge them into one geometry
function kit(seed = 1) {
  const parts = [], rng = mulberry(seed * 2654435761 % 2147483647);
  const add = (g, col, vary = 0.05) => {
    if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }          // every face its own corners: flat shading
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    const c = rgb(col), k = 1 + (rng() - 0.5) * 2 * vary, n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c[0] * k; a[i * 3 + 1] = c[1] * k; a[i * 3 + 2] = c[2] * k; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    parts.push(g);
    return g;
  };
  return {
    rng,
    // a box standing on y0, centred on (cx, cz); rx / ry / rz turn it about its own middle
    box(cx, y0, cz, w, h, d, col, { rx = 0, ry = 0, rz = 0, vary } = {}) {
      const g = new THREE.BoxGeometry(w, h, d);
      if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry);
      g.translate(cx, y0 + h / 2, cz);
      return add(g, col, vary);
    },
    cyl(cx, y0, cz, r0, r1, h, seg, col, { rx = 0, rz = 0, ry = 0, vary } = {}) {       // r0 at the bottom, r1 at the top
      const g = new THREE.CylinderGeometry(r1, r0, h, seg);
      if (ry) g.rotateY(ry); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz);
      g.translate(cx, y0 + h / 2, cz);
      return add(g, col, vary);
    },
    // a flat triangle or four-cornered face from points [x, y, z] (seen from both sides by the prop material)
    face(pts, col, vary) {
      const v = pts.length === 3 ? pts : [pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3));
      return add(g, col, vary);
    },
    raw: add,
    done() { const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g; },
  };
}

// turn a geometry about the vertical and stand it at (x, y, z)
export function place(g, x, y, z, yaw = 0) { g.rotateY(yaw); g.translate(x, y, z); return g; }

// a pitched roof over a w x d box whose walls end at y = top: two tiled slabs and a ridge, ridge along x
function pitchedRoof(K, w, d, top, rise, col, dark, { over = 0.55, gable = 0.5, thick = 0.2 } = {}) {
  const a = Math.atan2(rise, d / 2), len = (d / 2 + over) / Math.cos(a);
  for (const s of [1, -1]) {
    const zc = s * len / 2 * Math.cos(a), yc = top + rise - len / 2 * Math.sin(a);
    K.box(0, yc - thick / 2 + 0.12, zc, w + gable * 2, thick, len, col, { rx: s * a, vary: 0.04 });
  }
  K.box(0, top + rise + 0.02, 0, w + gable * 2 + 0.06, 0.18, 0.5, dark);
}

export function houseGeometry({ w = 6, d = 5, wall = 2.9, roof = 2.5, floors = 1, chimney = true, doorX = null, seed = 1, colors = BUILD_COLORS } = {}) {
  const K = kit(seed), C = colors, r = K.rng;
  const shutter = C.shutters[Math.floor(r() * C.shutters.length)];
  doorX = doorX ?? (r() < 0.5 ? -1 : 1) * w * 0.2;
  // footing (it goes well below the ground, so a slope never shows a gap) and walls
  K.box(0, -1.6, 0, w + 0.3, 2.05, d + 0.3, C.stone);
  K.box(0, 0.45, 0, w, wall - 0.45, d, C.plaster, { vary: 0.02 });
  const frame = (W, D, y0, y1) => {                                       // the timber frame of one floor
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * (W / 2 - 0.03), y0, sz * (D / 2 - 0.03), 0.26, y1 - y0, 0.26, C.timber);
    for (const s of [-1, 1]) {
      K.box(0, y1 - 0.22, s * (D / 2 + 0.03), W + 0.12, 0.22, 0.1, C.timber);
      K.box(s * (W / 2 + 0.03), y1 - 0.22, 0, 0.1, 0.22, D + 0.12, C.timber);
      K.box(0, y0, s * (D / 2 + 0.03), W + 0.12, 0.16, 0.1, C.timber);
      K.box(s * (W / 2 + 0.03), y0, 0, 0.1, 0.16, D + 0.12, C.timber);
      for (const t of [-0.25, 0.25]) K.box(t * W, y0, s * (D / 2 + 0.03), 0.14, y1 - y0, 0.08, C.timber);
      K.box(s * (W / 2 + 0.03), y0, 0, 0.08, y1 - y0, 0.14, C.timber);
      // a brace in each end bay
      for (const e of [-1, 1]) K.box(e * W * 0.375, y0 + (y1 - y0) * 0.5 - 0.06, s * (D / 2 + 0.035), 0.12, (y1 - y0) * 1.05, 0.06, C.timber, { rz: e * s * 0.42 });
    }
  };
  const win = (x, y, D, side) => {                                         // side: +1 front, -1 back
    K.box(x, y, side * (D / 2 + 0.05), 0.85, 0.95, 0.08, C.glass, { vary: 0.03 });
    K.box(x, y - 0.12, side * (D / 2 + 0.1), 1.05, 0.12, 0.18, C.timber);
    K.box(x, y + 0.95, side * (D / 2 + 0.07), 1.0, 0.1, 0.1, C.timber);
    for (const e of [-1, 1]) K.box(x + e * 0.62, y, side * (D / 2 + 0.07), 0.32, 0.95, 0.07, shutter, { vary: 0.03 });
  };
  const endWin = (y, W, side) => { K.box(side * (W / 2 + 0.05), y, 0, 0.08, 0.9, 0.8, C.glass, { vary: 0.03 }); K.box(side * (W / 2 + 0.1), y - 0.12, 0, 0.18, 0.12, 1.0, C.timber); };
  frame(w, d, 0.45, wall);
  // door and step, then windows clear of the door
  K.box(doorX, 0.45, d / 2 + 0.06, 1.0, 1.9, 0.12, C.door);
  K.box(doorX, 2.35, d / 2 + 0.08, 1.36, 0.18, 0.12, C.timber);
  for (const e of [-1, 1]) K.box(doorX + e * 0.6, 0.45, d / 2 + 0.08, 0.16, 1.9, 0.12, C.timber);
  K.box(doorX, 0.1, d / 2 + 0.55, 1.5, 0.35, 0.9, C.stoneDark);
  win(-doorX * 1.6, 1.25, d, 1);
  win(-w * 0.26, 1.25, d, -1); win(w * 0.26, 1.25, d, -1);
  endWin(1.25, w, r() < 0.5 ? 1 : -1);
  let W = w, D = d, top = wall;
  if (floors > 1) {                                                        // the upper floor juts out over the lower one
    W = w + 0.5; D = d + 0.5; top = wall + 2.5;
    K.box(0, wall, 0, W, 2.5, D, C.plaster, { vary: 0.02 });
    frame(W, D, wall, top);
    win(-W * 0.26, wall + 0.85, D, 1); win(W * 0.26, wall + 0.85, D, 1); win(0, wall + 0.85, D, -1);
    endWin(wall + 0.85, W, 1); endWin(wall + 0.85, W, -1);
  }
  // gable ends: plaster up to the ridge, a post and a collar beam
  for (const s of [-1, 1]) {
    K.face([[s * W / 2, top, -D / 2], [s * W / 2, top, D / 2], [s * W / 2, top + roof, 0]], C.plaster, 0.02);
    K.box(s * (W / 2 + 0.03), top, 0, 0.08, roof * 0.92, 0.16, C.timber);
    K.box(s * (W / 2 + 0.03), top + roof * 0.42, 0, 0.08, 0.14, D * 0.52, C.timber);
  }
  pitchedRoof(K, W, D, top, roof, C.roof, C.roofDark);
  if (chimney) {
    const cx = (r() < 0.5 ? -1 : 1) * (W / 2 - 1.0), cz = -D * 0.22;
    K.box(cx, top + 0.3, cz, 0.75, roof + 0.9, 0.75, C.stone);
    K.box(cx, top + roof + 1.2, cz, 0.95, 0.18, 0.95, C.stoneDark);
  }
  const g = K.done();
  g.userData = { w: W + 0.3, d: D + 0.3, height: top + roof };
  return g;
}

export function towerGeometry({ s = 5.5, h = 12, seed = 1, colors = BUILD_COLORS } = {}) {
  const K = kit(seed), C = colors;
  K.box(0, -2.2, 0, s + 1.0, 3.5, s + 1.0, C.stoneDark);                   // a battered foot, deep into the knoll
  K.box(0, 1.3, 0, s, h - 1.3, s, C.stone, { vary: 0.02 });
  K.box(0, h * 0.55, 0, s + 0.24, 0.3, s + 0.24, C.stoneDark);
  K.box(0, h - 0.5, 0, s + 0.7, 0.5, s + 0.7, C.stoneDark);
  // battlements
  const P = s / 2 + 0.2, n = 5;
  for (const sg of [-1, 1]) {
    K.box(0, h, sg * P, s + 0.7, 0.75, 0.3, C.stone);
    K.box(sg * P, h, 0, 0.3, 0.75, s + 0.7, C.stone);
    for (let i = 0; i < n; i++) {
      const t = -P + (i + 0.5) * (2 * P) / n;
      K.box(t, h + 0.75, sg * P, 0.72, 0.6, 0.3, C.stone);
      K.box(sg * P, h + 0.75, t, 0.3, 0.6, 0.72, C.stone);
    }
  }
  K.cyl(0, h + 0.1, 0, s * 0.6, 0.05, 3.4, 4, C.roof, { ry: Math.PI / 4, vary: 0.03 });      // a pointed roof inside the battlements
  // a round stair turret on one corner, a little taller than the keep
  K.cyl(s / 2, -2.2, -s / 2, 1.45, 1.45, h + 3.6, 10, C.stone, { vary: 0.03 });
  K.cyl(s / 2, h + 1.4, -s / 2, 1.7, 1.7, 0.3, 10, C.stoneDark);
  K.cyl(s / 2, h + 1.7, -s / 2, 1.95, 0.05, 3.0, 10, C.roof, { vary: 0.03 });
  // arrow slits and a window, a door at the foot of the +z face
  for (const [dx, dz, ry] of [[0, 1, 0], [0, -1, 0], [1, 0, Math.PI / 2], [-1, 0, Math.PI / 2]]) {
    K.box(dx * (s / 2 + 0.03), h * 0.3, dz * (s / 2 + 0.03), 0.24, 1.2, 0.08, C.timberDark, { ry });
    K.box(dx * (s / 2 + 0.03), h * 0.7, dz * (s / 2 + 0.03), 0.7, 1.0, 0.08, C.glass, { ry });
  }
  K.box(0, 0, (s + 1) / 2 + 0.05, 1.4, 2.3, 0.14, C.door);
  K.box(0, 2.3, (s + 1) / 2 + 0.06, 1.9, 0.3, 0.16, C.stone);
  for (const e of [-1, 1]) K.box(e * 0.85, 0, (s + 1) / 2 + 0.06, 0.3, 2.3, 0.16, C.stone);
  // a flag on the turret
  K.cyl(s / 2, h + 4.6, -s / 2, 0.05, 0.05, 2.2, 5, C.timberDark);
  K.box(s / 2 + 0.5, h + 6.1, -s / 2, 0.95, 0.55, 0.04, C.flag);
  const g = K.done();
  g.userData = { w: s + 1.0, d: s + 1.0, height: h + 4 };
  return g;
}

// a water wheel turning about its x axis, its middle at the origin
export function wheelGeometry({ radius = 2.0, width = 1.0, paddles = 12, axle = null, seed = 1, colors = BUILD_COLORS } = {}) {
  const K = kit(seed), C = colors, R = radius, seg = 2 * R * Math.sin(Math.PI / paddles) + 0.12;
  for (let i = 0; i < paddles; i++) {
    const t = i / paddles * Math.PI * 2, y = Math.sin(t), z = Math.cos(t);
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.1, 0.16, seg); g.rotateX(-t - Math.PI / 2); g.translate(s * width * 0.45, R * y, R * z); K.raw(g, C.timber);          // rim
      const sp = new THREE.BoxGeometry(0.08, 0.1, R); sp.rotateX(-t); sp.translate(s * width * 0.45, R * 0.5 * y, R * 0.5 * z); K.raw(sp, C.timber);       // spoke
    }
    const p = new THREE.BoxGeometry(width, 0.07, 0.6); p.rotateX(-t); p.translate(0, (R + 0.05) * y, (R + 0.05) * z); K.raw(p, C.timberDark);                  // paddle
  }
  const AX = axle ?? width * 1.5;
  K.cyl(0, -AX / 2, 0, 0.22, 0.22, AX, 8, C.timberDark, { rz: Math.PI / 2 });      // axle (turned to lie along x: it ends up centred on the origin)
  return K.done();
}

const BRIDGE = { length: 11, width: 2.9, rise: 1.0, lip: 0.15 };
// height of the stone bridge's deck above its base, u metres along it from the middle
export function stoneBridgeDeck(u, { length = BRIDGE.length, rise = BRIDGE.rise, lip = BRIDGE.lip } = {}) { return lip + rise * (1 - Math.pow(2 * u / length, 2)); }
// a humpbacked stone bridge along x: base at y = 0 (the bank), one arch over the water
export function stoneBridgeGeometry({ length = BRIDGE.length, width = BRIDGE.width, rise = BRIDGE.rise, span = 2.7, seed = 1, colors = BUILD_COLORS } = {}) {
  const K = kit(seed), C = colors, L = length, deck = u => stoneBridgeDeck(u, { length, rise });
  const body = new THREE.Shape();
  body.moveTo(-L / 2, deck(-L / 2));
  for (let i = 1; i <= 20; i++) { const u = -L / 2 + L * i / 20; body.lineTo(u, deck(u)); }
  body.lineTo(L / 2, -2.2); body.lineTo(span, -2.2); body.lineTo(span, -1.0);
  for (let i = 1; i <= 14; i++) { const t = Math.PI * i / 14; body.lineTo(span * Math.cos(t), -1.0 + 1.75 * Math.sin(t)); }       // the arch
  body.lineTo(-span, -2.2); body.lineTo(-L / 2, -2.2); body.closePath();
  const bg = new THREE.ExtrudeGeometry(body, { depth: width, bevelEnabled: false, curveSegments: 1 });
  bg.translate(0, 0, -width / 2);
  K.raw(bg, C.stone, 0.02);
  for (const s of [-1, 1]) {                                                // parapets, and a row of darker coping stones on top
    const p = new THREE.Shape();
    p.moveTo(-L / 2, deck(-L / 2));
    for (let i = 1; i <= 20; i++) { const u = -L / 2 + L * i / 20; p.lineTo(u, deck(u)); }
    for (let i = 20; i >= 0; i--) { const u = -L / 2 + L * i / 20; p.lineTo(u, deck(u) + 0.6); }
    p.closePath();
    const pg = new THREE.ExtrudeGeometry(p, { depth: 0.32, bevelEnabled: false, curveSegments: 1 });
    pg.translate(0, 0, s * (width / 2 - 0.02) - 0.16);
    K.raw(pg, C.stone, 0.02);
    for (let i = 0; i < 12; i++) {
      const u = -L / 2 + L * (i + 0.5) / 12, sl = Math.atan(-rise * 8 * u / (L * L));
      K.box(u, deck(u) + 0.6, s * (width / 2 - 0.02), L / 12 - 0.06, 0.14, 0.42, C.stoneDark, { rz: sl });
    }
    for (const e of [-1, 1]) K.box(e * (L / 2 - 0.1), deck(L / 2) - 0.6, s * (width / 2 - 0.02), 0.5, 1.6, 0.5, C.stoneDark);      // end posts
  }
  for (let i = 0; i <= 8; i++) {                                            // arch stones on both faces
    const t = Math.PI * i / 8;
    for (const s of [-1, 1]) K.box(span * Math.cos(t) * 1.04, -1.0 + 1.75 * Math.sin(t) * 1.04 - 0.2, s * (width / 2 + 0.03), 0.5, 0.42, 0.1, C.stoneDark, { rz: t - Math.PI / 2 });
  }
  const g = K.done();
  g.userData = { length, width };
  return g;
}

export function wellGeometry({ seed = 1, colors = BUILD_COLORS } = {}) {
  const K = kit(seed), C = colors;
  K.cyl(0, -0.6, 0, 1.0, 0.95, 1.45, 10, C.stone);
  K.cyl(0, 0.85, 0, 1.05, 1.05, 0.14, 10, C.stoneDark);
  K.cyl(0, 0.6, 0, 0.72, 0.72, 0.05, 10, C.water, { vary: 0 });
  for (const s of [-1, 1]) K.box(s * 0.92, 0.85, 0, 0.14, 1.75, 0.14, C.timber);
  K.box(0, 2.3, 0, 2.1, 0.12, 0.12, C.timberDark);
  K.cyl(0, 1.95, 0, 0.12, 0.12, 0.9, 6, C.timberDark, { rz: Math.PI / 2 });
  pitchedRoof(K, 1.9, 1.5, 2.55, 0.75, C.roof, C.roofDark, { over: 0.3, gable: 0.25, thick: 0.12 });
  for (const s of [-1, 1]) K.face([[s * 0.95, 2.55, -0.75], [s * 0.95, 2.55, 0.75], [s * 0.95, 3.3, 0]], C.timber);
  return K.done();
}

// posts and two rails along a line of [x, z] points (world space); gate: [from, to] leaves that stretch of the first side open
export function fenceGeometry({ points, heightAt, closed = true, gap = null, spacing = 1.7, seed = 1, colors = BUILD_COLORS } = {}) {
  const K = kit(seed), C = colors, posts = [];
  const pts = closed ? [...points, points[0]] : points;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k < n; k++) {
      const x0 = ax + (bx - ax) * k / n, z0 = az + (bz - az) * k / n, x1 = ax + (bx - ax) * (k + 1) / n, z1 = az + (bz - az) * (k + 1) / n;
      const open = gap && i === gap[0] && k === gap[1];
      posts.push([x0, z0, x1, z1, open]);
    }
  }
  const out = [];
  for (const [x0, z0, x1, z1, open] of posts) {
    const y0 = heightAt(x0, z0), y1 = heightAt(x1, z1), len = Math.hypot(x1 - x0, z1 - z0);
    K.box(x0, y0 - 0.3, z0, 0.16, 1.4 + K.rng() * 0.12, 0.16, C.timber, { ry: K.rng() * 0.3 });
    if (open) { K.box(x1, y1 - 0.3, z1, 0.16, 1.5, 0.16, C.timber); continue; }
    const ry = Math.atan2(-(z1 - z0), x1 - x0), rz = Math.atan2(y1 - y0, len);
    for (const h of [0.42, 0.85]) K.box((x0 + x1) / 2, (y0 + y1) / 2 + h, (z0 + z1) / 2, len + 0.1, 0.09, 0.07, C.timber, { rz, ry });
    for (let t = 0.25; t < len; t += 0.5) out.push([x0 + (x1 - x0) * t / len, z0 + (z1 - z0) * t / len, 0.22]);
  }
  const g = K.done();
  g.userData = { circles: out };
  return g;
}

// circles [x, z, r] along the walls of a w x d rectangle turned by yaw at (x, z): something solid to walk into
export function rectCircles(x, z, w, d, yaw = 0, r = 0.55) {
  const out = [], c = Math.cos(yaw), s = Math.sin(yaw), hw = Math.max(0.01, w / 2 - r), hd = Math.max(0.01, d / 2 - r);
  const put = (lx, lz) => out.push([x + lx * c + lz * s, z - lx * s + lz * c, r]);
  const nx = Math.max(1, Math.ceil(2 * hw / (r * 1.5))), nz = Math.max(1, Math.ceil(2 * hd / (r * 1.5)));
  for (let i = 0; i <= nx; i++) { const lx = -hw + 2 * hw * i / nx; put(lx, -hd); put(lx, hd); }
  for (let j = 1; j < nz; j++) { const lz = -hd + 2 * hd * j / nz; put(-hw, lz); put(hw, lz); }
  return out;
}
