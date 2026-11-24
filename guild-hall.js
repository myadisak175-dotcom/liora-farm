/* ==========================================================================
   guild-hall.js  —  the adventurers' guild, built from the village's own building kit (a trial: guild-hall.html)
   The same pieces the hill village's houses are made of (Quaternius' Medieval Village MegaKit, CC0: village-kit.js): stone
   walls below, timber and plaster above, the kit's round-tiled roof and timber gables stretched over a hall 12 m by 16 m, a
   four-storey tower at its corner, shuttered windows, a balcony over the door. What the kit has no piece for is made here
   and painted from the kit's own pictures (its boards, carved panels, cut stone, rubble and plaster), so it all sits together:
   the doorway's stone arch, the floors, the stair, the gallery, the roof's timbers and every piece of furniture.

   Inside, the hall of an isekai guild: the reception counter across the far end under a gallery, the quest board by the door
   with its ranks F to S, the materials counter with its scales, the bar with its barrels, a fireplace with a beast's skull
   over it, tables, and three wheel chandeliers under the open roof. It is lit by its own lamps (a shader with the lamps in
   it: warm pools of light, the fire flickering), not by the sun. She walks in through the door with no cut, as she did into
   the old guild (stylized-guild.js, whose way of walking and of being seen into this keeps): the outside is thinned away
   while she is in, and the rooms are seen like a doll's house. Up the stair along the east wall to the gallery.

     const kit = await loadVillageKit();
     const guild = createGuildHall({ kit, x, y, z, yaw, heightAt });      // y: the hall's floor (the plaza lies GUILD_HALL.plinth below it)
     scene.add(guild.group);
     guild.heightAt(x, z, land)   the height to stand at: a floor, a stair, the gallery, the steps, or the land
     guild.collide(p)         keeps { x, z } out of the walls, rails and furniture of the storey she is on
     guild.follow(pos)        every frame: which storey she is on (-1 out of doors, 0 the hall, 1 the gallery)
     guild.update(dt, camera) every frame: shows and hides the outside, the walls' things, the gallery; the lamps flicker
     guild.colliders          [[x, z, r], ...] solid things out of doors;  guild.bare [[x, z, r]]: no grass (the paving)
     guild.spots              places for people and for things to do later: [x, z, storey, facing]
     guild.night(k)           0 by day .. 1 at night: how much the lamps light the rooms against the daylight

   The plan (metres, the hall's own frame): x across, z along it, the door at +z, y = 0 the hall's floor.
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propMaterial } from './stylized-props.js';

const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ------------------------------------------------------------------ the plan
const W = 12, D = 16, IX = W / 2 - 0.2, IZ = D / 2 - 0.2;            // the hall; IX, IZ: the room's walls (the kit's plaster lies 0.2 m in)
const F1 = 3, TOP = 6, PLINTH = 0.45;                                    // the gallery's floor; the walls' top; the floor above the plaza
const ROOF_S = [1.5, 1.5, D / 14];                                       // the kit's biggest roof (8 x 14), stretched over the hall
const SLOPE = 6.78 / 4.98, RIDGE = TOP + 6.0 * ROOF_S[1];                // (the kit's roof climbs 6.78 m in 4.98 m)
const roofIn = x => RIDGE - 0.62 - Math.abs(x) * SLOPE;                  // the underside of the roof's boards, x across the hall
const DOOR = { half: 1.15, spring: 2.12, crown: 2.6, ring: 0.27 };      // the front doorway: half its width, its arch
const GAL = { z1: -3.8 };                                                // the gallery: from the back wall to here, at F1
const STAIR = { x0: 4.55, x1: IX, z0: 0.3, z1: GAL.z1, n: 16 };          // up the east wall: its foot at z0, its top at the gallery
const TRUSS = [-6.4, -2.4, 1.6, 5.6];                                    // the roof's trusses (the chandeliers hang from the last three)
const STEP = { half: 1.9, run: 0.38 };                                   // the steps up to the door: three risers of PLINTH / 3
const POSTS = [-3.3, 3.3];                                               // the posts under the gallery's edge
const PLAZA = { u0: -7.4, u1: 7.4, v0: D / 2 + 0.12, v1: 15.6 };          // the paved plaza before the door
const OUT = 1, S0 = 2, S1 = 4;                                           // which storeys a wall stands on: out of doors, the hall, the gallery
export const GUILD_HALL = {
  width: W, depth: D, plinth: PLINTH, gallery: F1,
  foot: { x0: -7.1, x1: 10.2, z0: -8.2, z1: 9.3 },                       // all the building stands on (the tower, the chimney, the steps)
};

// the kit's pictures: a strip of a trim sheet [picture, v at its top, v at its bottom, metres to the sheet's width], or a picture
// that tiles all over [picture, metres across, metres down] (as the kit's own walls lay them)
const STRIP = {
  wood: [/WoodTrim/, 0.008, 0.300, 2], dark: [/WoodTrim/, 0.318, 0.612, 2], carved: [/WoodTrim/, 0.634, 0.776, 2], grey: [/WoodTrim/, 0.800, 0.940, 2],
  cobble: [/RockTrim/, 0.010, 0.300, 2.4], slab: [/RockTrim/, 0.345, 0.575, 2.4], ashlar: [/RockTrim/, 0.605, 0.985, 2.4],
};
const TILE = { plaster: [/Plaster/, 2, 2.4], rubble: [/UnevenBrick/, 2, 2.11], brick: [/T_Brick/, 2, 2] };
// flat colours (display values) for what the kit has no picture of
const C = {
  iron: '#3b383d', ironHi: '#77737a', gold: '#d6a446', brass: '#b8873c', cloth: '#2c5a9c', clothDark: '#20457a', red: '#9a3030', redDark: '#6e2222',
  paper: '#efe3c2', paperOld: '#d9c597', candle: '#f3e8cc', bone: '#e6d9bb', boneDark: '#b9a888', horn: '#4b3b31', soot: '#231d1b', ember: '#ff9a3a',
  burlap: '#b8975f', burlapDark: '#8f7347', leather: '#7a4a2c', fur: '#8a6a4c', furDark: '#5e4632', green: '#4f7a3a', glassBlue: '#7fb8d8', steel: '#a9adb5',
  books: ['#8e2f2f', '#2f4f86', '#3f6b45', '#b07a2a', '#6a3f7a', '#5a3a26', '#c9b48a'], bottles: ['#3f7d5a', '#7a3d2a', '#2f5f8a', '#8a6a2a', '#5a2f6a', '#9a8a5a'],
  ranks: ['#8a8a8a', '#5f9a4f', '#3f8f8f', '#3f66b0', '#7a4fb0', '#b04040', '#d6a446'],
};
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

// ------------------------------------------------------------------ the painter: faces and boxes painted from the kit's pictures
// (each on a strip of a trim sheet or on a tiling picture, at the kit's own scale), or in a flat colour, or from the guild's own
// pictures (the sign, the papers: guildArt). at(x, y, z, yaw) .. back(): a frame to build in.
function painter(seed) {
  const rng = mulberry(seed * 7919 + 3);
  const tex = new Map(), flat = { p: [], n: [], c: [], i: [] }, art = { p: [], n: [], uv: [], c: [], i: [] }, solids = [];
  const M = new THREE.Matrix4(), NM = new THREE.Matrix3(), stack = [], V = new THREE.Vector3();
  const P3 = p => { V.set(p[0], p[1], p[2]).applyMatrix4(M); return [V.x, V.y, V.z]; };
  const N3 = n => { V.set(n[0], n[1], n[2]).applyMatrix3(NM).normalize(); return [V.x, V.y, V.z]; };
  const bucket = re => { if (!tex.has(re.source)) tex.set(re.source, { re, p: [], n: [], uv: [], c: [], i: [] }); return tex.get(re.source); };
  const emit = (o, pts, n, uvs, col) => {
    const b = o.p.length / 3, nn = N3(n);
    pts.forEach((p, k) => { o.p.push(...P3(p)); o.n.push(...nn); if (uvs) o.uv.push(...uvs[k]); o.c.push(col[0], col[1], col[2]); });
    if (pts.length === 4) o.i.push(b, b + 1, b + 2, b, b + 2, b + 3); else o.i.push(b, b + 1, b + 2);
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = a => Math.hypot(a[0], a[1], a[2]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const tintOf = t => (Array.isArray(t) ? t : [t, t, t]);
  const colOf = (mat, t) => { const k = tintOf(t); if (mat[0] === '#') { const c = hex(mat); return [c[0] * k[0], c[1] * k[1], c[2] * k[2]]; } return k; };
  // a flat face, corners a b c d counter-clockwise seen from its front; a→b is the way a board's grain runs
  function quad(mat, a, b, c, d, tint = 1) {
    const e1 = sub(b, a), e2 = sub(d, a), L = len(e1), H = len(e2);
    if (L < 1e-5 || H < 1e-5) return;
    const nr = cross(e1, e2), nl = len(nr), n = [nr[0] / nl, nr[1] / nl, nr[2] / nl], col = colOf(mat, tint);
    if (mat[0] === '#') { emit(flat, [a, b, c, d], n, null, col); return; }
    if (STRIP[mat]) {
      const [re, v0, v1, m] = STRIP[mat], hs = (v1 - v0) * m;
      if (H > hs * 1.02) {                                                // wider than the strip: in rows (boards, courses, panels)
        const rows = Math.ceil(H / hs);
        for (let r = 0; r < rows; r++) quad(mat, lerp(a, d, r / rows), lerp(b, c, r / rows), lerp(b, c, (r + 1) / rows), lerp(a, d, (r + 1) / rows), tint);
        return;
      }
      const va = v0 + rng() * (hs - H) / m, vd = va + H / m, u0 = rng() * 3;
      emit(bucket(re), [a, b, c, d], n, [[u0, vd], [u0 + L / m, vd], [u0 + L / m, va], [u0, va]], col);
      return;
    }
    const [re, mu, mv] = TILE[mat], u0 = rng(), w0 = rng();
    emit(bucket(re), [a, b, c, d], n, [[u0, w0 + H / mv], [u0 + L / mu, w0 + H / mv], [u0 + L / mu, w0], [u0, w0]], col);
  }
  // a face whose picture coordinates are given (any number of corners in a fan, counter-clockwise from its front)
  function poly(mat, pts, uvs, tint = 1) {
    const nr = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), nl = len(nr) || 1, n = [nr[0] / nl, nr[1] / nl, nr[2] / nl], col = colOf(mat, tint);
    const o = mat === 'art' ? art : mat[0] === '#' ? flat : bucket((STRIP[mat] || TILE[mat])[0]);
    for (let k = 1; k < pts.length - 1; k++) emit(o, [pts[0], pts[k], pts[k + 1]], n, o === flat ? null : [uvs[0], uvs[k], uvs[k + 1]], col);
  }
  // the guild's own picture on a face: rect = [u0, v0, u1, v1] of the art (v from its top)
  function artQuad(rect, a, b, c, d, tint = 1) {
    const [u0, v0, u1, v1] = rect, nr = cross(sub(b, a), sub(d, a)), nl = len(nr) || 1;
    emit(art, [a, b, c, d], [nr[0] / nl, nr[1] / nl, nr[2] / nl], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], tintOf(tint));
  }
  // a box standing on y0 (its foot), centred on (cx, cz): w along x, h up, d along z; turned rx, rz then ry about its middle.
  // top / bottom / sides: other paints for those faces. grain: 'x' | 'y' | 'z' to say which way its boards run (else the longest)
  const corners = [
    [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
    [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
  ];
  const R = new THREE.Matrix4(), E = new THREE.Euler();
  function box(mat, cx, y0, cz, w, h, d, { ry = 0, rx = 0, rz = 0, tint = 1, top = mat, bottom = mat, sides = mat, front = null, grain = null, skip = '' } = {}) {
    E.set(rx, ry, rz, 'YZX'); R.makeRotationFromEuler(E).setPosition(cx, y0 + h / 2, cz);
    const half = [w / 2, h / 2, d / 2], P = c => { V.set(c[0] * half[0], c[1] * half[1], c[2] * half[2]).applyMatrix4(R); return [V.x, V.y, V.z]; };
    const names = ['+x', '-x', '+z', '-z', '+y', '-y'], AB = ['z', 'z', 'x', 'x', 'x', 'x'], AD = ['y', 'y', 'y', 'y', 'z', 'z'], size = { x: w, y: h, z: d };
    for (let f = 0; f < 6; f++) {
      if (skip.includes(names[f])) continue;
      const [a, b, c, dd] = corners[f].map(P), m = f === 4 ? top : f === 5 ? bottom : f === 2 && front ? front : sides;
      // which way the grain runs: as told, else along the face's longer edge
      const longer = size[AD[f]] > size[AB[f]];
      const turn = grain ? AD[f] === grain || (AB[f] !== grain && longer) : longer;
      if (turn) quad(m, b, c, dd, a, tint); else quad(m, a, b, c, dd, tint);
    }
  }
  // a solid of three.js (cylinder, cone, sphere, torus...) in a flat colour, placed by its own matrix in the frame
  function solid(geo, color, m = null) {
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    if (m) geo.applyMatrix4(m);
    geo.applyMatrix4(M);
    const c = hex(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set(c, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (!geo.index) { const ix = []; for (let i = 0; i < n; i++) ix.push(i); geo.setIndex(ix); }
    solids.push(geo);
  }
  // a tube along points [[x, y, z], ...], its radius going from r0 to r1, in a flat colour (or two, alternating)
  function tube(pts, r0, r1, color, color2 = color, sides = 7) {
    const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), q = new THREE.Quaternion();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]), l = a.distanceTo(b);
      if (l < 1e-4) continue;
      const ra = r0 + (r1 - r0) * i / (pts.length - 1), rb = r0 + (r1 - r0) * (i + 1) / (pts.length - 1);
      q.setFromUnitVectors(up, d.subVectors(b, a).normalize());
      solid(new THREE.CylinderGeometry(rb, ra, l * 1.04, sides), i % 2 ? color2 : color, new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, new THREE.Vector3(1, 1, 1)));
    }
  }
  const at = (x, y, z, yaw = 0, s = 1) => {
    stack.push(M.clone());
    M.multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s)));
    NM.getNormalMatrix(M);
  };
  const back = () => { M.copy(stack.pop()); NM.getNormalMatrix(M); };
  const make = (o, withUv) => {
    if (!o.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
    if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3)); g.setIndex(o.i);
    return g;
  };
  return {
    rng, quad, poly, box, solid, tube, artQuad, at, back,
    get matrix() { return M; },
    // hand the painted faces to a kit builder (merged with its pieces of the same picture); the flat-coloured and the guild's
    // own pictured ones come back as geometries
    flush(b) {
      for (const o of tex.values()) { const g = make(o, true); if (g) b.paint(o.re, g); }
      const f = make(flat, false), list = f ? [f, ...solids] : solids;
      const flatG = list.length ? mergeGeometries(list) : null;
      list.forEach(g => g.dispose());
      return { flat: flatG, art: make(art, true) };
    },
  };
}

// ------------------------------------------------------------------ the guild's own pictures: its sign, banners, papers, ranks
// (drawn once on a canvas: the sign's wood is the kit's own dark boards)
function guildArt(kit) {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), rect = {}, R = (name, x, y, w, h) => { rect[name] = [x / S, y / S, (x + w) / S, (y + h) / S]; return [x, y, w, h]; };
  const wood = kit.picture(/WoodTrim/), img = wood && wood.image;
  const boards = (x, y, w, h, v0 = 0.318, v1 = 0.612) => {
    if (img) { try { g.drawImage(img, 0, v0 * img.height, img.width * Math.min(1, w / h * (v1 - v0)), (v1 - v0) * img.height, x, y, w, h); return; } catch (e) { /* (a picture that cannot be drawn: plain wood) */ } }
    g.fillStyle = '#6b4128'; g.fillRect(x, y, w, h);
  };
  const THAI = '"Noto Serif Thai", "Noto Sans Thai", "Leelawadee UI", Tahoma, Loma, Garuda, sans-serif';
  // the guild's badge: a shield, two swords crossed behind it, a star on it
  const badge = (cx, cy, s, field = '#2c5a9c') => {
    g.save(); g.translate(cx, cy); g.scale(s, s); g.lineJoin = 'round';
    for (const e of [-1, 1]) {                                            // the swords
      g.save(); g.rotate(e * 0.72);
      g.fillStyle = '#d9dde3'; g.strokeStyle = '#3b383d'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-7, 40); g.lineTo(-7, -78); g.lineTo(0, -96); g.lineTo(7, -78); g.lineTo(7, 40); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#d6a446'; g.fillRect(-26, 38, 52, 10); g.strokeRect(-26, 38, 52, 10);
      g.fillStyle = '#5a3a26'; g.fillRect(-6, 48, 12, 30); g.fillStyle = '#d6a446'; g.beginPath(); g.arc(0, 84, 8, 0, 7); g.fill();
      g.restore();
    }
    g.beginPath(); g.moveTo(-46, -50); g.quadraticCurveTo(0, -62, 46, -50); g.lineTo(46, 2); g.quadraticCurveTo(44, 46, 0, 70); g.quadraticCurveTo(-44, 46, -46, 2); g.closePath();
    g.fillStyle = '#d6a446'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#6e4a1c'; g.stroke();
    g.save(); g.scale(0.8, 0.8); g.beginPath(); g.moveTo(-46, -50); g.quadraticCurveTo(0, -62, 46, -50); g.lineTo(46, 2); g.quadraticCurveTo(44, 46, 0, 70); g.quadraticCurveTo(-44, 46, -46, 2); g.closePath(); g.fillStyle = field; g.fill(); g.restore();
    g.fillStyle = '#f1d27a'; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 9 : 22; g.lineTo(Math.cos(a) * r, Math.sin(a) * r + 2); }
    g.fill();
    g.restore();
  };
  // ---- the sign over the door: dark boards, a carved rim, the badge either end, the name in gold
  {
    const [x, y, w, h] = R('sign', 0, 0, 1024, 192);
    boards(x, y, w, h);
    g.strokeStyle = '#2a1a10'; g.lineWidth = 10; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    g.strokeStyle = '#d6a446'; g.lineWidth = 4; g.strokeRect(x + 20, y + 20, w - 40, h - 40);
    badge(x + 112, y + 96, 0.78); badge(x + w - 112, y + 96, 0.78);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold 76px ${THAI}`; g.fillStyle = '#2a1a10'; g.fillText('กิลด์นักผจญภัย', x + w / 2 + 3, y + 84 + 4);
    g.fillStyle = '#f1cf6e'; g.fillText('กิลด์นักผจญภัย', x + w / 2, y + 84);
    g.font = 'bold 26px Georgia, "Times New Roman", serif'; g.fillStyle = '#e8c766'; g.fillText('ADVENTURERS’ GUILD', x + w / 2, y + 150);
  }
  // ---- a banner: blue cloth, a gold edge, the badge, a fringe
  {
    const [x, y, w, h] = R('banner', 0, 192, 192, 384);
    g.fillStyle = '#2c5a9c'; g.fillRect(x, y, w, h);
    g.fillStyle = '#244c86'; for (let i = 0; i < 6; i++) g.fillRect(x + 14 + i * 30, y, 8, h);
    g.fillStyle = '#d6a446'; g.fillRect(x, y, w, 16); g.fillRect(x, y + 16, 10, h - 60); g.fillRect(x + w - 10, y + 16, 10, h - 60);
    badge(x + w / 2, y + 160, 1.05, '#7a2626');
    g.fillStyle = '#d6a446'; g.beginPath(); g.moveTo(x, y + h - 44); g.lineTo(x + w, y + h - 44); g.lineTo(x + w / 2, y + h); g.closePath(); g.fill();
    g.fillStyle = '#2c5a9c'; g.beginPath(); g.moveTo(x + 10, y + h - 44); g.lineTo(x + w - 10, y + h - 44); g.lineTo(x + w / 2, y + h - 10); g.closePath(); g.fill();
  }
  // ---- notes for the board: a parchment, a title, lines of writing, a picture of what is wanted, a seal; and a wanted poster
  const ink = '#3a2a1c';
  const beasts = [
    p => { p.beginPath(); p.ellipse(0, 10, 30, 22, 0, Math.PI, 0); p.lineTo(30, 14); p.lineTo(-30, 14); p.fill(); p.fillStyle = '#efe3c2'; p.fillRect(-12, 0, 6, 8); p.fillRect(6, 0, 6, 8); },      // a slime
    p => { p.beginPath(); p.moveTo(-34, 16); p.lineTo(-20, -18); p.lineTo(-10, -4); p.lineTo(10, -4); p.lineTo(20, -18); p.lineTo(34, 16); p.lineTo(0, 30); p.closePath(); p.fill(); },     // a wolf's head
    p => { p.beginPath(); p.moveTo(0, 30); p.quadraticCurveTo(-30, 0, 0, -30); p.quadraticCurveTo(30, 0, 0, 30); p.fill(); p.strokeStyle = '#efe3c2'; p.lineWidth = 3; p.beginPath(); p.moveTo(0, 28); p.lineTo(0, -24); p.stroke(); },      // a herb
    p => { p.beginPath(); p.arc(0, 4, 20, 0, 7); p.fill(); p.beginPath(); p.moveTo(-18, -4); p.lineTo(-38, -16); p.lineTo(-20, 8); p.moveTo(18, -4); p.lineTo(38, -16); p.lineTo(20, 8); p.fill(); },      // a goblin
    p => { p.beginPath(); p.moveTo(0, -6); p.lineTo(-40, -26); p.lineTo(-30, 0); p.lineTo(-44, 6); p.lineTo(-10, 12); p.lineTo(0, 30); p.lineTo(10, 12); p.lineTo(44, 6); p.lineTo(30, 0); p.lineTo(40, -26); p.closePath(); p.fill(); },      // a wyvern
    p => { p.beginPath(); p.arc(0, -2, 22, 0, 7); p.fill(); p.fillRect(-12, 16, 24, 12); p.fillStyle = '#efe3c2'; p.beginPath(); p.arc(-8, -4, 6, 0, 7); p.arc(8, -4, 6, 0, 7); p.fill(); },      // a skull
    p => { p.beginPath(); p.moveTo(-28, 20); p.lineTo(-28, -8); p.lineTo(-14, 6); p.lineTo(0, -18); p.lineTo(14, 6); p.lineTo(28, -8); p.lineTo(28, 20); p.closePath(); p.fill(); },      // a crown (an escort)
    p => { p.beginPath(); p.ellipse(0, 6, 26, 16, 0, 0, 7); p.fill(); p.beginPath(); p.moveTo(22, 0); p.lineTo(40, -14); p.lineTo(40, 16); p.closePath(); p.fill(); },      // a fish
  ];
  rect.papers = [];
  for (let i = 0; i < 8; i++) {
    const [x, y, w, h] = R('p' + i, 192 + (i % 4) * 136, 192 + Math.floor(i / 4) * 176, 128, 168); rect.papers.push(rect['p' + i]);
    const old = i % 3 === 2;
    g.fillStyle = old ? '#d9c597' : '#efe3c2'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(90,60,30,0.10)'; g.fillRect(x, y, w, 6); g.fillRect(x, y + h - 6, w, 6); g.fillRect(x, y, 5, h); g.fillRect(x + w - 5, y, 5, h);
    g.fillStyle = ink; g.fillRect(x + 22, y + 14, w - 44, 7);                       // the title
    g.save(); g.translate(x + w / 2, y + 62); g.fillStyle = ink; beasts[i](g); g.restore();
    g.fillStyle = 'rgba(58,42,28,0.75)';
    for (let k = 0; k < 4; k++) g.fillRect(x + 14, y + 104 + k * 12, w - 28 - (k * 17 % 30), 4);
    g.fillStyle = '#9a3030'; g.beginPath(); g.arc(x + w - 24, y + h - 20, 11, 0, 7); g.fill();
    g.fillStyle = '#d6a446'; g.beginPath(); g.arc(x + 22, y + h - 20, 7, 0, 7); g.arc(x + 34, y + h - 20, 7, 0, 7); g.fill();
  }
  {
    const [x, y, w, h] = R('wanted', 736, 192, 152, 200);
    g.fillStyle = '#e2cf9c'; g.fillRect(x, y, w, h);
    g.fillStyle = ink; g.font = 'bold 26px Georgia, serif'; g.textAlign = 'center'; g.fillText('WANTED', x + w / 2, y + 28);
    g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(x + 24, y + 44, w - 48, 92);
    g.beginPath(); g.arc(x + w / 2, y + 82, 22, 0, 7); g.fill(); g.fillRect(x + w / 2 - 34, y + 104, 68, 32);
    g.font = 'bold 20px Georgia, serif'; g.fillText('5,000 G', x + w / 2, y + 166);
  }
  // ---- the ranks over the board: F to S, each its colour
  rect.ranks = [];
  'FEDCBAS'.split('').forEach((r, i) => {
    const [x, y, w, h] = R('r' + r, 192 + i * 64, 544, 60, 60); rect.ranks.push(rect['r' + r]);
    boards(x, y, w, h);
    g.fillStyle = C.ranks[i]; g.beginPath(); g.arc(x + w / 2, y + h / 2, 24, 0, 7); g.fill();
    g.strokeStyle = '#2a1a10'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#fff6dc'; g.font = 'bold 32px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(r, x + w / 2, y + h / 2 + 2);
  });
  // ---- the counters' boards: what is done there
  const label = (name, text, icon, x, y, w = 400, h = 88) => {
    R(name, x, y, w, h); boards(x, y, w, h);
    g.strokeStyle = '#2a1a10'; g.lineWidth = 6; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold 46px ${THAI}`;
    g.fillStyle = '#2a1a10'; g.fillText(text, x + w / 2 + 28 + 2, y + h / 2 + 3); g.fillStyle = '#f1cf6e'; g.fillText(text, x + w / 2 + 28, y + h / 2);
    g.save(); g.translate(x + 46, y + h / 2); g.fillStyle = '#f1cf6e'; g.strokeStyle = '#f1cf6e'; g.lineWidth = 4; icon(g); g.restore();
  };
  label('lReception', 'รับภารกิจ', p => { p.beginPath(); p.moveTo(-16, 18); p.lineTo(12, -18); p.lineTo(18, -12); p.lineTo(-10, 22); p.closePath(); p.fill(); p.fillRect(-20, 20, 14, 4); }, 0, 640);
  label('lExchange', 'รับซื้อวัตถุดิบ', p => { p.beginPath(); p.moveTo(0, -20); p.lineTo(0, 20); p.moveTo(-20, -12); p.lineTo(20, -12); p.stroke(); p.beginPath(); p.arc(-16, 4, 8, 0, Math.PI); p.arc(16, 4, 8, 0, Math.PI); p.fill(); }, 0, 736, 460);
  label('lTavern', 'โรงเตี๊ยม', p => { p.fillRect(-14, -16, 22, 34); p.beginPath(); p.arc(12, 0, 9, -1.4, 1.4); p.stroke(); }, 0, 832);
  label('lBoard', 'กระดานภารกิจ', p => { p.fillRect(-16, -20, 32, 40); p.fillStyle = '#2a1a10'; p.fillRect(-10, -12, 20, 4); p.fillRect(-10, -2, 20, 4); p.fillRect(-10, 8, 14, 4); }, 0, 928, 460);
  // ---- a map of the lands, for the wall and the meeting table
  {
    const [x, y, w, h] = R('map', 480, 640, 320, 224);
    g.fillStyle = '#e2cf9c'; g.fillRect(x, y, w, h);
    g.fillStyle = '#c8b07a'; g.strokeStyle = '#6e4a1c'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x + 30, y + 60); g.bezierCurveTo(x + 90, y + 10, x + 180, y + 40, x + 210, y + 70); g.bezierCurveTo(x + 280, y + 60, x + 300, y + 140, x + 250, y + 180);
    g.bezierCurveTo(x + 180, y + 210, x + 90, y + 200, x + 60, y + 160); g.bezierCurveTo(x + 20, y + 130, x + 10, y + 90, x + 30, y + 60); g.fill(); g.stroke();
    g.fillStyle = '#6e8a4a'; for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(x + 80 + (k * 37) % 150, y + 80 + (k * 23) % 80, 8, 0, 7); g.fill(); }
    g.strokeStyle = '#7a3d2a'; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(x + 70, y + 150); g.lineTo(x + 140, y + 120); g.lineTo(x + 210, y + 140); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#9a3030'; g.lineWidth = 5; g.beginPath(); g.moveTo(x + 200, y + 130); g.lineTo(x + 220, y + 150); g.moveTo(x + 220, y + 130); g.lineTo(x + 200, y + 150); g.stroke();
    g.strokeStyle = '#6e4a1c'; g.lineWidth = 2; g.beginPath(); g.arc(x + w - 36, y + 36, 18, 0, 7); g.stroke(); g.beginPath(); g.moveTo(x + w - 36, y + 14); g.lineTo(x + w - 36, y + 58); g.moveTo(x + w - 58, y + 36); g.lineTo(x + w - 14, y + 36); g.stroke();
  }
  const texture = new THREE.CanvasTexture(cv);
  texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture, rect };
}

// ------------------------------------------------------------------ light: little glows (candle flames, lamp glass, the fire) drawn as
// soft billboards added onto the picture; kind 0 a round glow, 1 a flame
function glowMesh(list, time) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const at = new Float32Array(list.length * 3), col = new Float32Array(list.length * 4), kind = new Float32Array(list.length * 2);
  list.forEach((g, i) => { at.set(g.p, i * 3); col.set([...g.col, g.size], i * 4); kind.set([g.kind || 0, g.phase ?? i * 1.37], i * 2); });
  geo.setAttribute('iAt', new THREE.InstancedBufferAttribute(at, 3)); geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(col, 4)); geo.setAttribute('iKind', new THREE.InstancedBufferAttribute(kind, 2));
  geo.instanceCount = list.length;
  const fade = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uFade: fade },
    vertexShader: /* glsl */`
      attribute vec3 iAt; attribute vec4 iCol; attribute vec2 iKind;
      uniform float uTime;
      varying vec2 vUv; varying vec3 vCol; varying float vKind, vFlick;
      void main() {
        vUv = position.xy; vCol = iCol.rgb; vKind = iKind.x;
        float t = uTime * (iKind.x > 0.5 ? 1.0 : 0.6) + iKind.y * 6.1;
        vFlick = 0.86 + 0.08 * sin(t * 9.3) + 0.06 * sin(t * 23.7 + 1.3);
        vec4 mv = modelViewMatrix * vec4(iAt, 1.0);
        vec2 s = iKind.x > 0.5 ? vec2(0.55, 1.0) * iCol.a * (0.92 + 0.08 * vFlick) : vec2(iCol.a);
        mv.xy += position.xy * s + (iKind.x > 0.5 ? vec2(0.0, 0.32 * iCol.a) : vec2(0.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uFade;
      varying vec2 vUv; varying vec3 vCol; varying float vKind, vFlick;
      void main() {
        float a;
        vec3 c = vCol;
        if (vKind > 0.5) {
          float y = vUv.y + 0.5, w = 0.5 * (1.0 - y) * smoothstep(0.0, 0.3, y) * 1.7 + 0.02;
          a = smoothstep(w, w * 0.25, abs(vUv.x)) * smoothstep(1.0, 0.55, y);
          float core = smoothstep(w * 0.7, 0.0, abs(vUv.x)) * smoothstep(0.75, 0.15, y);
          c = mix(c, vec3(1.0, 0.97, 0.85), core);
          a *= 1.2;
        } else a = exp(-dot(vUv, vUv) * 14.0) * 0.9;
        gl_FragColor = vec4(c * a * vFlick * uFade, 0.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false; m.renderOrder = 5; m.name = 'guildGlow';
  m.userData = { fade, dispose() { geo.dispose(); mat.dispose(); } };
  return m;
}

// ------------------------------------------------------------------ materials
// the outside: the kit's own paint in the sun's light (stylized-props.js), thinned away dot by dot while she is in
function outsideMaterial(map, see) {
  const base = propMaterial(map);
  return new THREE.ShaderMaterial({
    defines: { ...base.defines }, uniforms: { ...base.uniforms, uSee: see },
    vertexColors: true, vertexShader: base.vertexShader, side: THREE.DoubleSide,
    fragmentShader: base.fragmentShader.replace('void main() {', 'uniform float uSee;\nvoid main() {\n  if (uSee < 0.999 && fract(dot(floor(gl_FragCoord.xy), vec2(0.7548777, 0.5698403))) >= uSee) discard;'),
  });
}
// the windows' glass: the kit's flat glass by day; by night the warm light of the rooms behind it
function glassMaterial(see, glow) {
  const m = outsideMaterial(null, see);
  m.uniforms = { ...m.uniforms, uGlow: glow };
  m.fragmentShader = m.fragmentShader.replace('uniform float uSee;', 'uniform float uSee, uGlow;')
    .replace('gl_FragColor = vec4(mix(clamp(base * light, 0.0, 1.0), uHaze, vHaze), 1.0);', 'gl_FragColor = vec4(mix(mix(clamp(base * light, 0.0, 1.0), uHaze, vHaze), vec3(1.0, 0.74, 0.4), uGlow * 0.85), 1.0);');
  return m;
}
// the rooms: the same paint in the light of their own lamps: a soft light from above (more by day, through the windows),
// banded as the prop material bands the sun's, and warm pools round every lamp (falling away to nothing at its reach)
const LAMPS = 16;
function roomMaterial(map, side, shared) {
  return new THREE.ShaderMaterial({
    defines: map ? { ROOM_MAP: 1, LAMPS } : { LAMPS },
    uniforms: { uMap: { value: map }, ...shared },
    vertexColors: true, side,
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      varying vec3 vCol, vWN, vWP;
      varying float vHaze;
      #ifdef ROOM_MAP
        varying vec2 vUv;
      #endif
      void main() {
        #ifdef ROOM_MAP
          vUv = uv;
        #endif
        vCol = color;
        vWN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uKey, uUp, uDown, uHaze;
      uniform vec4 uLamp[LAMPS];
      uniform vec3 uLampCol[LAMPS];
      varying vec3 vCol, vWN, vWP;
      varying float vHaze;
      #ifdef ROOM_MAP
        uniform sampler2D uMap;
        varying vec2 vUv;
      #endif
      void main() {
        vec3 base = vCol;
        #ifdef ROOM_MAP
          vec3 t = texture2D(uMap, vUv).rgb;
          base *= mix(t * 12.92, 1.055 * pow(t, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), t));
        #endif
        vec3 n = normalize(vWN) * (gl_FrontFacing ? 1.0 : -1.0);
        float k = dot(n, uKey) * 0.5 + 0.5;
        vec3 light = mix(uDown, uUp, n.y * 0.5 + 0.5) * (k > 0.64 ? 1.0 : (k > 0.4 ? 0.9 : 0.8));
        for (int i = 0; i < LAMPS; i++) {
          vec3 d = uLamp[i].xyz - vWP;
          float r = uLamp[i].w, dd = dot(d, d);
          if (dd > r * r) continue;
          float f = 1.0 - dd / (r * r);
          light += uLampCol[i] * f * f * (0.45 + 0.55 * max(0.0, dot(n, d * inversesqrt(dd + 1e-4))));
        }
        gl_FragColor = vec4(mix(clamp(base * light, 0.0, 1.0), uHaze, vHaze), 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ the guild
export function createGuildHall({ kit, x: X = 0, y: Y = 0, z: Z = 0, yaw = 0, heightAt = () => Y - PLINTH, look = 'kit', plaza = true, seed = 9 } = {}) {
  const group = new THREE.Group();
  group.name = 'guildHall';
  group.position.set(X, Y, Z); group.rotation.y = yaw;
  group.updateMatrixWorld(true);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const toLocal = (x, z) => { const dx = x - X, dz = z - Z; return [dx * cy - dz * sy, dx * sy + dz * cy]; };
  const toWorld = (u, v) => [X + u * cy + v * sy, Z - u * sy + v * cy];
  const groundY = (u, v) => { const [x, z] = toWorld(u, v); return heightAt(x, z) - Y; };      // the land under a spot, in the hall's frame
  const art = guildArt(kit);
  const A = art.rect;
  const mat4 = (x, y, z, ry = 0, s = null) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), s ? new THREE.Vector3(...s) : new THREE.Vector3(1, 1, 1));

  // the layers she is seen into, each built from the kit's pieces and painted faces, and its little glows:
  //   out: the outside (the sun's light; thinned away while she is in)     walls: the room's side of the walls (seen from in front only)
  //   hall: the hall's floor and all that stands on it      gallery: the gallery's floor and all on it      under: the gallery's underside
  //   roof: the roof's timbers and boards, the chandeliers      N, S, E, W: what hangs on or stands against each wall
  const layers = {};
  for (const [name, i] of [['out', 1], ['walls', 2], ['hall', 3], ['gallery', 4], ['under', 5], ['roof', 6], ['N', 7], ['S', 8], ['E', 9], ['W', 10], ['NG', 11]]) {
    layers[name] = { b: kit.builder(), P: painter(seed * 31 + i), glow: [] };
  }
  const L = layers;
  const segs = [], rounds = [], colliders = [];                           // walls and rails [u1, v1, u2, v2, half, storeys]; furniture [u, v, r, storeys]
  const wall = (u1, v1, u2, v2, half, on) => segs.push([u1, v1, u2, v2, half, on]);
  const round = (u, v, r, on) => rounds.push([u, v, r, on]);
  const solidOut = (u, v, r) => { const [x, z] = toWorld(u, v); colliders.push([x, z, r]); round(u, v, r, OUT); };
  const lamps = [];                                                         // [x, y, z, reach, r, g, b, flicker] in the hall's frame
  const glow = (layer, p, col, size, kind = 0) => L[layer].glow.push({ p, col, size, kind });
  const flame = (layer, x, y, z, s = 0.09) => { glow(layer, [x, y, z], [1.0, 0.62, 0.22], s, 1); glow(layer, [x, y + s * 0.5, z], [0.9, 0.55, 0.25], s * 4.5, 0); };

  // ================================================================== the outside
  {
    const O = L.out, P = O.P;
    // ---- the walls: the kit's 2 m walls, stone below and timber and plaster above; each in two (its outside to `out`, its room
    // side to `walls`). A side's walls, left to right from outside, and what each is:  - plain  g timber grid  w window (with
    // shutters on the upper storey)  1 window, no shutters  t a narrow window  d a door  . nothing (the doorway, made below)
    // i its room side only (behind the tower)
    const SIDES = {
      front: { n: W / 2, at: k => [-W / 2 + 1 + 2 * k, D / 2], yaw: 0 },
      back: { n: W / 2, at: k => [W / 2 - 1 - 2 * k, -D / 2], yaw: Math.PI },
      east: { n: D / 2, at: k => [W / 2, D / 2 - 1 - 2 * k], yaw: Math.PI / 2 },
      west: { n: D / 2, at: k => [-W / 2, -D / 2 + 1 + 2 * k], yaw: -Math.PI / 2 },
    };
    const PLAN = {
      front: ['11..11', 'wg11gw'], back: ['w----d', 'w-tt-w'], east: ['ii----11', 'iiwgwgwg'], west: ['1------1', 'wgwggwgw'],
    };
    const KIND = {
      stone: { '-': 'Wall_UnevenBrick_Straight', g: 'Wall_UnevenBrick_Straight', w: 'Wall_UnevenBrick_Window_Wide_Round', 1: 'Wall_UnevenBrick_Window_Wide_Round', t: 'Wall_UnevenBrick_Window_Thin_Round', d: 'Wall_UnevenBrick_Door_Round' },
      plaster: { '-': 'Wall_Plaster_Straight', g: 'Wall_Plaster_WoodGrid', w: 'Wall_Plaster_Window_Wide_Round', 1: 'Wall_Plaster_Window_Wide_Round', t: 'Wall_Plaster_Window_Thin_Round', d: 'Wall_Plaster_Door_Round' },
    };
    for (const [side, S] of Object.entries(SIDES)) {
      for (let f = 0; f < 2; f++) {
        const row = PLAN[side][f], K = KIND[f ? 'plaster' : 'stone'], fy = f * 3;
        for (let k = 0; k < S.n; k++) {
          const code = row[k], [x, z] = S.at(k), m = mat4(x, fy, z, S.yaw);
          const both = name => { O.b.place(name, m, 'out'); L.walls.b.place(name, m, 'in'); };
          if (code === '.') continue;
          if (code === 'i') { L.walls.b.place(K['-'], m, 'in'); continue; }
          both(K[code]);
          if (code === 'w' || code === '1') { both('Window_Wide_Round1'); if (code === 'w' && f) O.b.place('WindowShutters_Wide_Round_Open', m); }
          if (code === 't') { both('Window_Thin_Round1'); if (f) O.b.place('WindowShutters_Thin_Round_Open', m); }
          if (code === 'd') {                                                // a door that stays shut: a leaf outside and one in, a hair apart
            both('DoorFrame_Round_WoodDark');
            const c = Math.cos(S.yaw), s = Math.sin(S.yaw), dx = x - 0.51 * c, dz = z + 0.51 * s;
            O.b.place('Door_8_Round', mat4(dx + s * 0.03, fy, dz + c * 0.03, S.yaw));
            L.hall.b.place('Door_8_Round', mat4(dx - s * 0.03, fy, dz - c * 0.03, S.yaw));
          }
        }
      }
    }
    for (let f = 0; f < 2; f++) for (const [cx, cz, turn] of [[W / 2, D / 2, 0], [-W / 2, D / 2, -Math.PI / 2], [-W / 2, -D / 2, Math.PI], [W / 2, -D / 2, Math.PI / 2]]) O.b.place('Corner_Exterior_Wood', mat4(cx, f * 3, cz, turn));
    // ---- the roof and its gables: the kit's, stretched
    O.b.place('Roof_RoundTiles_8x14', mat4(0, TOP, 0, 0, ROOF_S));
    O.b.place('Roof_Front_Brick8', mat4(0, TOP, D / 2, 0, [ROOF_S[0], ROOF_S[1], 1]));
    O.b.place('Roof_Front_Brick8', mat4(0, TOP, -D / 2, Math.PI, [ROOF_S[0], ROOF_S[1], 1]));
    // ---- the footing all round: cut stone, a little proud of the walls
    P.box('ashlar', 0, -PLINTH - 1.2, 0, W + 0.24, 1.2 + PLINTH - 0.02, D + 0.24, { top: 'slab' });
    // ---- the tower at the front east corner: four storeys of the kit's brick and its tower roof, a door into it
    O.b.house({ w: 4, l: 4, floors: 4, wall: 'brick', upper: 'brick', tower: true, door: 'front', doorAt: 1, seed: 44, windows: 0.45, shutters: false, chimney: false }, 8, 0, 6, 0);
    P.box('ashlar', 8, -PLINTH - 1.2, 6, 4.24, 1.2 + PLINTH - 0.02, 4.24, { top: 'slab' });
    for (const e of [-1, 1]) wall(6, 4 + (e > 0 ? 4 : 0), 10, 4 + (e > 0 ? 4 : 0), 0.15, OUT);
    wall(10, 4, 10, 8, 0.15, OUT);
    // a flag over it, the guild's blue
    P.solid(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6), C.iron, mat4(8, 12 + 6.6 + 1.6, 6));
    P.artQuad(A.banner, [8.03, 20.4, 6], [8.03, 20.4, 4.8], [8.03, 21.6, 4.8], [8.03, 21.6, 6]);
    P.artQuad(A.banner, [7.97, 20.4, 4.8], [7.97, 20.4, 6], [7.97, 21.6, 6], [7.97, 21.6, 4.8]);
    // ---- the chimney of the hall's fireplace, up the west wall
    P.box('rubble', -6.5, -PLINTH - 0.6, 0, 1.0, TOP + 0.4 + PLINTH + 0.6, 1.3);
    O.b.place('Prop_Chimney2', mat4(-6.5, TOP + 0.4, 0, -Math.PI / 2));
    wall(-6.0, -0.65, -7.0, -0.65, 0.1, OUT); wall(-7.0, -0.65, -7.0, 0.65, 0.1, OUT); wall(-7.0, 0.65, -6.0, 0.65, 0.1, OUT);

    // ---- the doorway: a stone arch over two doors standing open, in a bay of the front wall the kit has no piece for
    const { half: dh, spring: sp, crown: cr, ring } = DOOR;
    const Rr = (dh * dh + (cr - sp) * (cr - sp)) / (2 * (cr - sp)), cyA = cr - Rr, a0 = Math.atan2(sp - cyA, dh);      // the arch: a part of a circle
    const archY = x => cyA + Math.sqrt(Math.max(0, Rr * Rr - x * x));
    const zo = D / 2, zi = D / 2 - 0.2, N = 14;
    const rub = (x, y) => [x / 2 + 0.37, (3 - y) / 2.11];
    const pla = (x, y) => [x / 2 + 0.11, (3 - y) / 2.4];
    // the wall's face either side of the door and over the arch (rubble outside, plaster in)
    for (const [face, z, tile, uvf, sgn] of [['out', zo, 'rubble', rub, 1], ['in', zi, 'plaster', pla, -1]]) {
      const Pp = face === 'out' ? P : L.walls.P, top = 3.0;
      for (const [x0, x1] of [[-2, -dh], [dh, 2]]) {
        const pts = sgn > 0 ? [[x0, 0, z], [x1, 0, z], [x1, top, z], [x0, top, z]] : [[x1, 0, z], [x0, 0, z], [x0, top, z], [x1, top, z]];
        Pp.poly(tile, pts, pts.map(p => uvf(p[0], p[1])));
      }
      for (let i = 0; i < N; i++) {
        const xa = -dh + 2 * dh * i / N, xb = -dh + 2 * dh * (i + 1) / N, ya = archY(xa), yb = archY(xb);
        const pts = sgn > 0 ? [[xa, ya, z], [xb, yb, z], [xb, top, z], [xa, top, z]] : [[xb, yb, z], [xa, ya, z], [xa, top, z], [xb, top, z]];
        Pp.poly(tile, pts, pts.map(p => uvf(p[0], p[1])));
      }
    }
    // the beam the storey's walls have at their top, across the bay (both faces)
    P.box('dark', 0, 2.88, D / 2 + 0.046, 4, 0.234, 0.092);
    L.walls.P.box('dark', 0, 2.88, D / 2 - 0.255, 4, 0.234, 0.11);
    // the ring of cut stones round the arch, a hand proud of the wall, and its keystone
    for (let i = 0; i < 9; i++) {
      const ta = Math.PI - a0 - (Math.PI - 2 * a0) * i / 9, tb = Math.PI - a0 - (Math.PI - 2 * a0) * (i + 1) / 9;
      const ia = [Math.cos(ta) * Rr, cyA + Math.sin(ta) * Rr], ib = [Math.cos(tb) * Rr, cyA + Math.sin(tb) * Rr];
      const oa = [Math.cos(ta) * (Rr + ring), cyA + Math.sin(ta) * (Rr + ring)], ob = [Math.cos(tb) * (Rr + ring), cyA + Math.sin(tb) * (Rr + ring)];
      const z1 = zo + 0.07, v = 0.62 + (i % 3) * 0.1;
      P.poly('ashlar', [[ia[0], ia[1], z1], [ib[0], ib[1], z1], [ob[0], ob[1], z1], [oa[0], oa[1], z1]], [[0.1 * i, v + 0.1], [0.1 * i + 0.12, v + 0.1], [0.1 * i + 0.12, v], [0.1 * i, v]]);
      P.poly('ashlar', [[oa[0], oa[1], zo], [oa[0], oa[1], z1], [ob[0], ob[1], z1], [ob[0], ob[1], zo]], [[0, 0.62], [0, 0.64], [0.1, 0.64], [0.1, 0.62]]);
    }
    P.box('ashlar', 0, cr - 0.06, zo + 0.06, 0.34, ring + 0.16, 0.2, { tint: 1.08 });
    // the jambs: cut stone up either side, a little proud
    for (const e of [-1, 1]) P.box('ashlar', e * (dh + 0.17), 0, zo + 0.04, 0.34, sp, 0.16, { grain: 'y' });
    // the doorway's sides and the arch's underside (seen from both sides of the door: they go with the room's walls)
    for (const e of [-1, 1]) {
      const x = e * dh, pts = e < 0 ? [[x, 0, zo], [x, 0, zi], [x, sp, zi], [x, sp, zo]] : [[x, 0, zi], [x, 0, zo], [x, sp, zo], [x, sp, zi]];
      L.walls.P.poly('ashlar', pts, [[0, 0.98], [0.1, 0.98], [0.1, 0.62], [0, 0.62]]);
    }
    for (let i = 0; i < N; i++) {
      const xa = -dh + 2 * dh * i / N, xb = -dh + 2 * dh * (i + 1) / N, ya = archY(xa), yb = archY(xb);
      L.walls.P.poly('ashlar', [[xa, ya, zo], [xa, ya, zi], [xb, yb, zi], [xb, yb, zo]], [[i * 0.06, 0.62], [i * 0.06, 0.7], [i * 0.06 + 0.06, 0.7], [i * 0.06 + 0.06, 0.62]]);
    }
    // the threshold, and the steps down to the plaza
    L.hall.P.box('slab', 0, -0.06, D / 2 - 0.1, dh * 2 + 0.1, 0.06, 0.22);
    for (let i = 0; i < 3; i++) {
      const topY = -(i + 1) * PLINTH / 3, z0 = D / 2 + 0.12;
      P.box('slab', 0, topY - 0.5, z0 + (i + 1) * STEP.run / 2, STEP.half * 2 + i * 0.24, 0.5, (i + 1) * STEP.run, { sides: 'ashlar' });
    }
    // the two doors, standing open into the hall (the kit's iron-bound doors)
    L.S.b.place('Door_4_Flat', mat4(-dh - 0.03, 0, IZ - 0.15, Math.PI - 0.06));
    L.S.b.place('Door_4_Flat', mat4(dh + 0.03, 0, IZ - 0.15, 0.06, [1, 1, -1]));
    // the walls she cannot walk through: the doorway is the gap
    wall(-W / 2, D / 2 - 0.1, -dh, D / 2 - 0.1, 0.1, OUT | S0); wall(dh, D / 2 - 0.1, W / 2, D / 2 - 0.1, 0.1, OUT | S0);
    wall(-W / 2, -D / 2 + 0.1, W / 2, -D / 2 + 0.1, 0.1, OUT | S0 | S1);
    wall(W / 2 - 0.1, -D / 2, W / 2 - 0.1, D / 2, 0.1, OUT | S0 | S1); wall(-W / 2 + 0.1, -D / 2, -W / 2 + 0.1, D / 2, 0.1, OUT | S0 | S1);

    // ---- the balcony over the door, on the kit's brackets, with the guild's sign along its front
    P.box('dark', 0, 2.92, D / 2 + 0.58, 4.1, 0.1, 1.16);
    for (const x of [-1, 1]) O.b.place('Balcony_Cross_Straight', mat4(x, 3.0, D / 2, 0));
    for (const e of [-1, 1]) O.b.place('Balcony_Cross_Straight', mat4(e * 1.0, 3.0, D / 2 + 0.5, e * Math.PI / 2, [0.5, 1, 1]));
    for (const e of [-1, 1]) O.b.place('Prop_Support', mat4(e * 1.85, 0.05, D / 2, 0, [1, 1, 0.6]));
    P.box('dark', 0, 2.62, D / 2 + 1.18, 4.0, 0.32, 0.06);
    P.artQuad(A.sign, [-1.95, 3.22, D / 2 + 1.13], [1.95, 3.22, D / 2 + 1.13], [1.95, 3.95, D / 2 + 1.13], [-1.95, 3.95, D / 2 + 1.13]);
    P.box('dark', 0, 3.17, D / 2 + 1.1, 4.06, 0.06, 0.06); P.box('dark', 0, 3.95, D / 2 + 1.1, 4.06, 0.06, 0.06);
    // ---- the guild's badge on the gable: a shield, two swords crossed behind it, in its blue and gold
    {
      const by = TOP + 2.7, bz = D / 2 + 0.55;
      const shield = new THREE.Shape();
      shield.moveTo(-0.95, 0.8); shield.quadraticCurveTo(0, 1.0, 0.95, 0.8); shield.lineTo(0.95, -0.05); shield.quadraticCurveTo(0.9, -0.8, 0, -1.25); shield.quadraticCurveTo(-0.9, -0.8, -0.95, -0.05); shield.closePath();
      const ext = (s, d) => new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 10 });
      P.solid(ext(shield, 0.1), C.gold, mat4(0, by, bz));
      const g2 = ext(shield, 0.06); g2.scale(0.82, 0.82, 1); P.solid(g2, C.cloth, mat4(0, by - 0.04, bz + 0.08));
      for (const e of [-1, 1]) {
        const blade = new THREE.BoxGeometry(0.14, 3.1, 0.05); blade.rotateZ(e * 0.75); P.solid(blade, C.steel, mat4(0, by - 0.1, bz - 0.06));
        const guard = new THREE.BoxGeometry(0.62, 0.12, 0.08); guard.translate(0, -1.05, 0); guard.rotateZ(e * 0.75); P.solid(guard, C.gold, mat4(0, by - 0.1, bz - 0.04));
        const grip = new THREE.BoxGeometry(0.11, 0.5, 0.08); grip.translate(0, -1.38, 0); grip.rotateZ(e * 0.75); P.solid(grip, C.leather, mat4(0, by - 0.1, bz - 0.04));
      }
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.14 : 0.34; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      P.solid(ext(star, 0.05), C.gold, mat4(0, by + 0.05, bz + 0.15));
    }
    // ---- banners down the upper storey, either side of the balcony, on iron rods
    for (const e of [-1, 1]) {
      const x = e * 3, z = D / 2 + 0.16;
      P.solid(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6).rotateZ(Math.PI / 2), C.iron, mat4(x, 5.62, z));
      P.artQuad(A.banner, [x - 0.48, 3.25, z], [x + 0.48, 3.25, z], [x + 0.48, 5.6, z], [x - 0.48, 5.6, z]);
    }
    // ---- lanterns either side of the door
    for (const e of [-1, 1]) {
      const x = e * 1.72, y = 2.2, z = D / 2 + 0.26;
      P.box(C.iron, x, y + 0.1, D / 2 + 0.1, 0.05, 0.05, 0.3);
      P.box(C.iron, x, y - 0.18, z, 0.24, 0.04, 0.24); P.box(C.iron, x, y + 0.2, z, 0.26, 0.05, 0.26);
      P.solid(new THREE.ConeGeometry(0.19, 0.18, 4).rotateY(Math.PI / 4), C.iron, mat4(x, y + 0.34, z));
      P.box('#ffd68a', x, y - 0.14, z, 0.17, 0.34, 0.17);
      glow('out', [x, y + 0.03, z], [1.0, 0.62, 0.25], 0.9);
    }
    // ---- out of doors: a stack of crates and barrels by the west corner, a wagon, a notice board, lamp posts
    const ground = (u, v) => groundY(u, v);
    O.b.place('Prop_Crate', mat4(-5.0, ground(-5.0, 9.0), 9.0, 0.3)); O.b.place('Prop_Crate', mat4(-4.2, ground(-4.2, 9.6), 9.6, -0.2, [0.8, 0.8, 0.8]));
    O.b.place('Prop_Crate', mat4(-4.95, ground(-5.0, 9.0) + 1.06, 9.05, 0.1, [0.85, 0.85, 0.85]));
    solidOut(-4.8, 9.25, 0.95);
    barrel(P, -6.3, ground(-6.3, 9.0), 9.0, { r: 0.36, h: 0.95 }); barrel(P, -6.9, ground(-6.9, 9.6), 9.6, { r: 0.33, h: 0.9 }); solidOut(-6.6, 9.3, 0.7);
    O.b.place('Prop_Wagon', mat4(-9.6, ground(-9.6, 4.5), 4.5, 0.25)); solidOut(-9.6, 3.6, 1.2); solidOut(-9.9, 2.2, 1.2); solidOut(-9.3, 4.9, 1.0);
    {                                                                      // the notice board out front: two posts, a little roof, papers
      const u = 5.2, v = 11.2, ry = -0.35, gy = ground(u, v);
      P.at(u, gy, v, ry);
      for (const e of [-1, 1]) P.box('dark', e * 1.0, -0.3, 0, 0.14, 2.75, 0.14, { grain: 'y' });
      P.box('wood', 0, 0.9, 0, 2.0, 1.2, 0.06);
      P.box('dark', 0, 2.1, -0.02, 2.2, 0.08, 0.14); P.box('dark', 0, 0.84, -0.02, 2.2, 0.08, 0.14);
      for (const e of [-1, 1]) P.box('dark', 0, 2.42 + e * 0.0, e * 0.28, 2.5, 0.06, 0.62, { rx: e * 0.6 });
      for (let k = 0; k < 6; k++) P.artQuad(A.papers[(k * 3) % 8], [-0.85 + (k % 3) * 0.58, 1.0 + Math.floor(k / 3) * 0.55, 0.035], [-0.47 + (k % 3) * 0.58, 1.0 + Math.floor(k / 3) * 0.55, 0.035], [-0.47 + (k % 3) * 0.58, 1.48 + Math.floor(k / 3) * 0.55, 0.035], [-0.85 + (k % 3) * 0.58, 1.48 + Math.floor(k / 3) * 0.55, 0.035]);
      P.back();
      const c = Math.cos(ry), s = Math.sin(ry);
      for (const e of [-1, 1]) solidOut(u + e * c, v - e * s, 0.2);
    }
    for (const [u, v] of [[-3.4, 12.2], [3.4, 13.6]]) {                    // lamp posts on the plaza
      const gy = ground(u, v);
      P.box('ashlar', u, gy - 0.2, v, 0.5, 0.5, 0.5);
      P.box('dark', u, gy + 0.3, v, 0.14, 2.6, 0.14, { grain: 'y' });
      P.box(C.iron, u, gy + 2.9, v, 0.3, 0.05, 0.3); P.box('#ffd68a', u, gy + 2.95, v, 0.2, 0.3, 0.2); P.solid(new THREE.ConeGeometry(0.22, 0.2, 4).rotateY(Math.PI / 4), C.iron, mat4(u, gy + 3.35, v));
      glow('out', [u, gy + 3.1, v], [1.0, 0.62, 0.25], 1.1);
      solidOut(u, v, 0.3);
    }
    // ---- the plaza before the door: the kit's rubble laid on the land as paving, a kerb of cut stone round its edge
    if (plaza) {
      const { u0, u1, v0, v1 } = PLAZA, nu = Math.ceil((u1 - u0) / 0.9), nv = Math.ceil((v1 - v0) / 0.9);
      const p = (u, v) => [u, groundY(u, v) + 0.025, v], uv = (u, v) => [u / 2.2, v / 2.3];
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const ua = u0 + (u1 - u0) * i / nu, ub = u0 + (u1 - u0) * (i + 1) / nu, va = v0 + (v1 - v0) * j / nv, vb = v0 + (v1 - v0) * (j + 1) / nv;
        P.poly('rubble', [p(ua, vb), p(ub, vb), p(ub, va), p(ua, va)], [uv(ua, vb), uv(ub, vb), uv(ub, va), uv(ua, va)], [1.12, 1.06, 0.98]);
      }
      const kerb = (ua, va, ub, vb) => { const n = Math.max(1, Math.round(Math.hypot(ub - ua, vb - va) / 0.8)); for (let k = 0; k < n; k++) { const u = ua + (ub - ua) * (k + 0.5) / n, v = va + (vb - va) * (k + 0.5) / n; P.box('ashlar', u, groundY(u, v) - 0.25, v, ub === ua ? 0.24 : Math.abs(ub - ua) / n - 0.02, 0.36, vb === va ? 0.24 : Math.abs(vb - va) / n - 0.02); } };
      kerb(u0, v1, u1, v1); kerb(u0, v0 + 0.4, u0, v1); kerb(u1, v0 + 0.4, u1, v1);
    }
  }

  // ================================================================== the rooms: the walls' room side, floors, roof
  {
    const Wl = L.walls.P;
    // the gables' inner faces up to the roof's boards, and the strips of wall between the walls' top and the roof
    const yk = roofIn(IX);
    for (const [z, s] of [[IZ, -1], [-IZ, 1]]) {
      const pts = s < 0 ? [[IX, TOP, z], [-IX, TOP, z], [-IX, yk, z], [0, roofIn(0), z], [IX, yk, z]] : [[-IX, TOP, z], [IX, TOP, z], [IX, yk, z], [0, roofIn(0), z], [-IX, yk, z]];
      Wl.poly('plaster', pts, pts.map(p => [p[0] / 2, (14 - p[1]) / 2.4]));
      // timbers on the gable: a collar, two posts and two braces
      const Pg = s < 0 ? L.S.P : L.N.P, zz = z + s * 0.06;
      Pg.box('dark', 0, 10.2, zz, 2 * (RIDGE - 0.62 - 10.4) / SLOPE, 0.24, 0.12);
      for (const e of [-1, 1]) Pg.box('dark', e * 2.2, TOP + 0.1, zz, 0.22, roofIn(2.2) - TOP - 0.15, 0.12, { grain: 'y' });
    }
    for (const e of [-1, 1]) {
      const x = e * IX, pts = e > 0 ? [[x, TOP, -IZ], [x, TOP, IZ], [x, yk, IZ], [x, yk, -IZ]] : [[x, TOP, IZ], [x, TOP, -IZ], [x, yk, -IZ], [x, yk, IZ]];
      Wl.poly('plaster', pts, pts.map(p => [p[2] / 2, (7 - p[1]) / 2.4]));
    }
    // panelling round the hall's walls (a dado of dark boards with a rail on top), and timber posts up the walls every 4 m
    const dado = (Pd, a, b, h = 1.05) => {                                   // from a to b ([x, z]) along a wall, facing into the room
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l;
      Pd.quad('dark', [a[0] + nx * 0.02, 0, a[1] + nz * 0.02], [b[0] + nx * 0.02, 0, b[1] + nz * 0.02], [b[0] + nx * 0.02, h, b[1] + nz * 0.02], [a[0] + nx * 0.02, h, a[1] + nz * 0.02], 0.92);
      Pd.at((a[0] + b[0]) / 2 + nx * 0.05, 0, (a[1] + b[1]) / 2 + nz * 0.05, Math.atan2(-dz, dx));
      Pd.box('dark', 0, h, 0, l, 0.07, 0.07); Pd.box('dark', 0, 0, 0, l, 0.12, 0.05);
      Pd.back();
    };
    dado(L.S.P, [IX, IZ], [dh(), IZ]); dado(L.S.P, [-dh(), IZ], [-IX, IZ]);
    dado(L.N.P, [-IX, -IZ], [IX, -IZ]); dado(L.E.P, [IX, -IZ], [IX, IZ]); dado(L.W.P, [-IX, IZ], [-IX, -IZ]);
    function dh() { return DOOR.half + 0.36; }
    for (const z of TRUSS) for (const e of [-1, 1]) (e > 0 ? L.E : L.W).P.box('dark', e * (IX - 0.06), 0, z, 0.12, TOP + 0.4, 0.24, { grain: 'y' });
    for (const x of [-4, 4]) { L.N.P.box('dark', x, 0, -IZ + 0.06, 0.24, TOP + 0.4, 0.12, { grain: 'y' }); L.S.P.box('dark', x, 0, IZ - 0.06, 0.24, TOP + 0.4, 0.12, { grain: 'y' }); }

    // ---- the hall's floor: boards along the hall, ends staggered
    const Hp = L.hall.P;
    for (let x = -IX, i = 0; x < IX - 0.01; x += 0.3, i++) {
      const x1 = Math.min(IX, x + 0.3);
      let z = -IZ + ((i * 0.73) % 1) * 2.2 - 2.2;
      while (z < IZ) {
        const z1 = Math.min(IZ, z + 2.2 + Hp.rng() * 1.6), za = Math.max(-IZ, z);
        if (z1 > za + 0.01) Hp.quad('wood', [x, 0, za], [x, 0, z1], [x1, 0, z1], [x1, 0, za], 0.9 + Hp.rng() * 0.16);
        z = z1;
      }
    }
    // a runner from the door to the reception counter
    Hp.box(C.red, 0, 0.005, (IZ - 0.3 + GAL.z1 - 0.2) / 2, 1.9, 0.012, IZ - 0.3 - GAL.z1 + 0.2);
    for (const e of [-1, 1]) Hp.box(C.gold, e * 0.82, 0.008, (IZ - 0.3 + GAL.z1 - 0.2) / 2, 0.08, 0.012, IZ - 0.3 - GAL.z1 + 0.2);
    for (const z of [IZ - 0.45, GAL.z1 + 0.15]) Hp.box(C.gold, 0, 0.008, z, 1.9, 0.012, 0.08);

    // ---- the gallery: its boards on top, its edge beam, its underside with joists, its rail (the kit's balcony rail)
    const Gp = L.gallery.P, Up = L.under.P;
    for (let z = GAL.z1, i = 0; z > -IZ + 0.01; z -= 0.3, i++) {
      const z1 = Math.max(-IZ, z - 0.3);
      Gp.quad('wood', [-IX, F1, z], [IX, F1, z], [IX, F1, z1], [-IX, F1, z1], 0.88 + Gp.rng() * 0.18);
    }
    Gp.box('dark', 0, F1 - 0.32, GAL.z1 + 0.08, W - 0.4, 0.32, 0.16, { skip: '+y' });
    Up.quad('dark', [-IX, F1 - 0.28, -IZ], [IX, F1 - 0.28, -IZ], [IX, F1 - 0.28, GAL.z1], [-IX, F1 - 0.28, GAL.z1], 0.85);
    for (let x = -IX + 0.7; x < IX - 0.3; x += 1.25) Up.box('dark', x, F1 - 0.5, (GAL.z1 - IZ) / 2, 0.16, 0.22, IZ + GAL.z1 - 0.02, { skip: '+y', grain: 'z' });
    const railEnd = STAIR.x0 - 0.05, nr = 5, seg = (railEnd + IX) / nr;
    for (let k = 0; k < nr; k++) L.gallery.b.place('Balcony_Cross_Straight', mat4(-IX + seg * (k + 0.5), F1, GAL.z1 - 1.0, 0, [seg / 2, 1, 1]));
    Gp.box('dark', railEnd, F1, GAL.z1, 0.16, 1.2, 0.16, { grain: 'y' });
    wall(-IX, GAL.z1, railEnd, GAL.z1, 0.08, S1);
    // the posts under its edge, on stone feet
    for (const x of POSTS) {
      Hp.box('dark', x, 0, GAL.z1 + 0.08, 0.26, F1 - 0.32, 0.26, { grain: 'y' });
      Hp.box('ashlar', x, 0, GAL.z1 + 0.08, 0.38, 0.3, 0.38);
      for (const e of [-1, 1]) Hp.box('dark', x + e * 0.32, F1 - 0.62, GAL.z1 + 0.08, 0.5, 0.12, 0.16, { rz: e * -0.7 });
      round(x, GAL.z1 + 0.08, 0.22, S0);
    }

    // ---- the stair up the east wall: treads of pale board, dark risers and strings, a rail on its open side
    {
      const S = STAIR, run = (S.z0 - S.z1) / S.n, rise = F1 / S.n, xm = (S.x0 + S.x1) / 2, w = S.x1 - S.x0;
      for (let i = 0; i < S.n; i++) {
        const z = S.z0 - (i + 0.5) * run, y = (i + 1) * rise;
        Hp.box('wood', xm, y - 0.05, z, w, 0.05, run + 0.03, { grain: 'x' });
        Hp.box('dark', xm, y - rise, z + run / 2 - 0.02, w - 0.04, rise - 0.05, 0.03, { grain: 'x' });
      }
      // the string on the open side, and the boards closing in the space under the stair
      const len = Math.hypot(S.z0 - S.z1, F1), ang = Math.atan2(F1, S.z0 - S.z1);
      Hp.box('dark', S.x0 - 0.02, (F1 - 0.25) / 2 - 0.08, (S.z0 + S.z1) / 2, 0.08, 0.3, len, { rx: ang });
      for (let i = 0; i < S.n; i++) {
        const za = S.z0 - i * run, zb = za - run, ya = i * rise, yb = ya + rise;
        Hp.quad('dark', [S.x0 - 0.03, 0, zb], [S.x0 - 0.03, 0, za], [S.x0 - 0.03, Math.max(0.001, ya - 0.1), za], [S.x0 - 0.03, yb - 0.1, zb], 0.85);
      }
      // the rail: a post at the foot and the top, a hand rail, balusters
      Hp.box('dark', S.x0, 0, S.z0 - 0.1, 0.14, 1.15, 0.14, { grain: 'y' });
      Hp.box('dark', S.x0, F1 / 2 + 0.9, (S.z0 + S.z1) / 2, 0.08, 0.08, len + 0.1, { rx: ang, grain: 'z' });
      for (let i = 1; i < S.n; i += 2) { const z = S.z0 - (i + 0.5) * run; Hp.box('dark', S.x0, (i + 1) * rise, z, 0.05, 0.9, 0.05, { grain: 'y' }); }
      wall(S.x0, S.z0 - 0.35, S.x0, S.z1, 0.07, S0 | S1);                    // its open side
      wall(S.x0, S.z1, S.x1, S.z1, 0.05, S0);                                // and no way in under its top
    }

    // ---- the roof inside: its boards (rows along the hall), purlins, a ridge beam, and four trusses of dark timber (a tie beam,
    // a king post, two rafters, a collar, braces, knee braces down to the posts on the walls)
    const Rp = L.roof.P;
    const beam = (a, b, z, t = 0.22, dp = 0.22) => { const dx = b[0] - a[0], dy = b[1] - a[1]; Rp.box('dark', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - t / 2, z, Math.hypot(dx, dy), t, dp, { rz: Math.atan2(dy, dx), grain: 'x' }); };
    for (const e of [-1, 1]) {
      const y0 = roofIn(IX) - 0.02, y1 = roofIn(0) - 0.02, xa = e * IX;
      Rp.quad('dark', ...(e > 0 ? [[xa, y0, -IZ], [xa, y0, IZ], [0, y1, IZ], [0, y1, -IZ]] : [[xa, y0, IZ], [xa, y0, -IZ], [0, y1, -IZ], [0, y1, IZ]]), 0.82);
      for (const f of [0.35, 0.7]) { const x = e * IX * (1 - f), y = roofIn(x) - 0.2; Rp.box('dark', x, y, 0, 0.2, 0.22, 2 * IZ, { grain: 'z' }); }
    }
    Rp.box('dark', 0, roofIn(0) - 0.32, 0, 0.26, 0.3, 2 * IZ, { grain: 'z' });          // the ridge beam
    for (const z of TRUSS) {
      Rp.box('dark', 0, TOP + 0.05, z, 2 * IX + 0.1, 0.34, 0.3, { grain: 'x' });       // the tie beam
      Rp.box('dark', 0, TOP + 0.39, z, 0.26, roofIn(0) - TOP - 0.6, 0.26, { grain: 'y' });      // the king post
      const yc = TOP + 4.4, xc = (RIDGE - 0.78 - yc) / SLOPE;
      Rp.box('dark', 0, yc - 0.1, z, 2 * xc, 0.2, 0.2, { grain: 'x' });              // the collar
      for (const e of [-1, 1]) {
        beam([e * IX, roofIn(IX) - 0.16], [0, roofIn(0) - 0.16], z, 0.26, 0.24);      // a rafter
        beam([0, TOP + 1.9], [e * 2.9, roofIn(2.9) - 0.26], z, 0.16, 0.16);           // a brace
        beam([e * (IX - 1.1), TOP + 0.06], [e * (IX - 0.06), TOP - 0.85], z, 0.14, 0.16);      // a knee brace down to the wall's post
      }
    }
  }

  // ================================================================== the hall: what stands in it
  const Hp = L.hall.P;
  // ---- the reception counter across the far end, under the gallery: three places, a lamp, a bell and a book at each
  {
    const z0 = -4.3, d = 0.62, x0 = -3.0, x1 = 3.0, h = 1.05;
    counter(Hp, x0, x1, z0, d, h);
    for (const x of [-1, 1]) { Hp.box('dark', x, h, z0 - d / 2, 0.05, 0.36, d); }
    for (const [k, x] of [-2, 0, 2].entries()) {
      Hp.solid(new THREE.CylinderGeometry(0.02, 0.07, 0.08, 10), C.brass, mat4(x + 0.55, h + 0.04, z0 - 0.2));        // the bell
      Hp.solid(new THREE.SphereGeometry(0.03, 8, 6), C.brass, mat4(x + 0.55, h + 0.1, z0 - 0.2));
      Hp.box(C.books[k * 2 % 7], x - 0.15, h, z0 - 0.3, 0.42, 0.05, 0.3, { ry: 0.15 }); Hp.box(C.paper, x - 0.15, h + 0.05, z0 - 0.3, 0.38, 0.01, 0.27, { ry: 0.15 });      // an open ledger
      Hp.box(C.paper, x + 0.2, h, z0 - 0.45, 0.24, 0.06, 0.3, { ry: -0.2 });      // a stack of forms
      Hp.solid(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 8), C.iron, mat4(x - 0.55, h + 0.03, z0 - 0.42));      // ink and a quill
      Hp.box(C.paper, x - 0.52, h + 0.06, z0 - 0.42, 0.01, 0.22, 0.04, { rz: 0.35 });
      lamp(L.hall, x - 0.75, h, z0 - 0.18);
      lamps.push([x, 2.2, z0 - 0.3, 3.0, 0.42, 0.33, 0.2, 0.3]);
      Hp.box('dark', x, 0, z0 - 1.25, 0.4, 0.62, 0.4); round(x, z0 - 1.25, 0.25, S0);      // a stool behind
    }
    wall(x0, z0 - d / 2, x1, z0 - d / 2, d / 2, S0);
    // the board hung over it from the gallery's edge
    hangSign(L.under, 0, F1 - 0.55, GAL.z1 + 0.18, 1.6, A.lReception);
    // behind: pigeonholes up the back wall, full of rolled papers
    pigeonholes(L.N.P, -2.8, 2.8, -IZ, 2.5);
  }
  // ---- the materials counter in the west corner under the gallery: scales, a tray of glowing stones, horns and hides
  {
    const z0 = -4.3, d = 0.62, x0 = -IX, x1 = -3.6, h = 1.0;
    counter(Hp, x0, x1, z0, d, h, 'wood');
    wall(x0, z0 - d / 2, x1, z0 - d / 2, d / 2, S0);
    hangSign(L.under, -4.7, F1 - 0.55, GAL.z1 + 0.18, 1.5, A.lExchange);
    scales(Hp, -4.2, h + 0.025, z0 - 0.3);
    Hp.box('dark', -5.1, h, z0 - 0.3, 0.55, 0.06, 0.4);                  // a tray of magic stones, glowing
    for (let i = 0; i < 7; i++) {
      const x = -5.3 + (i % 4) * 0.13, z = z0 - 0.4 + Math.floor(i / 4) * 0.16, col = ['#7fd8ff', '#b98cff', '#8affc0'][i % 3];
      Hp.solid(new THREE.OctahedronGeometry(0.06), col, mat4(x, h + 0.12, z, i));
      glow('hall', [x, h + 0.12, z], hex(col).map(c => c * 0.8), 0.32);
    }
    lamps.push([-5.1, h + 0.4, z0 - 0.3, 1.4, 0.16, 0.3, 0.42, 0]);
    // behind: crates of the kit's, sacks, a horn and a hide on the wall
    L.hall.b.place('Prop_Crate', mat4(-5.1, 0, -6.9, 0.2, [0.7, 0.7, 0.7])); L.hall.b.place('Prop_Crate', mat4(-4.2, 0, -7.1, -0.15, [0.6, 0.6, 0.6]));
    L.hall.b.place('Prop_Crate', mat4(-5.05, 0.74, -6.9, 0.5, [0.55, 0.55, 0.55]));
    round(-5.1, -6.9, 0.5, S0); round(-4.2, -7.1, 0.42, S0);
    for (const [x, z] of [[-3.9, -6.2], [-4.4, -5.9]]) { sack(Hp, x, z); round(x, z, 0.3, S0); }
    hide(L.W.P, -IX + 0.04, 1.4, -6.6);
    for (const y of [1.25, 1.7, 2.15]) {
      L.N.P.box('dark', -4.6, y, -IZ + 0.16, 1.9, 0.04, 0.3, { grain: 'x' });
      for (let i = 0; i < 9; i++) bottle(L.N.P, -5.4 + i * 0.2, y + 0.04, -IZ + 0.16, ['#c8324a', '#3a7ad0', '#4fb05a', '#d8b040', '#9a5ad0'][(i + Math.round(y * 3)) % 5]);
    }
    for (const x of [-5.55, -3.65]) L.N.P.box('dark', x, 1.0, -IZ + 0.16, 0.05, 1.4, 0.3, { grain: 'y' });
  }
  // ---- the fireplace on the west wall: a stone chimney breast to the roof, a beam over the fire, a beast's skull above
  {
    const xb = -IX, xf = -5.0, zw = 1.2, Pw = L.hall.P;
    Pw.box('ashlar', (xb + xf) / 2, 0, -zw + 0.25, xf - xb, 1.25, 0.5, { grain: 'y' }); Pw.box('ashlar', (xb + xf) / 2, 0, zw - 0.25, xf - xb, 1.25, 0.5, { grain: 'y' });
    Pw.box('dark', xf + 0.04, 1.22, 0, 0.3, 0.24, 2 * zw + 0.3, { grain: 'z' });      // the mantel
    Pw.box('rubble', (xb + xf) / 2 - 0.05, 1.46, 0, xf - xb - 0.1, roofIn(IX) - 1.46, 2 * zw - 0.2);
    Pw.box(C.soot, xb + 0.12, 0, 0, 0.1, 1.22, 2 * zw - 0.9); Pw.box(C.soot, (xb + xf) / 2, 1.0, 0, xf - xb - 0.1, 0.24, 2 * zw - 0.9);
    Pw.box('slab', xf + 0.35, 0, 0, 0.75, 0.06, 2 * zw + 0.4);              // the hearth stone
    for (const [z, r] of [[-0.25, 0.3], [0.2, -0.25], [0, 0.05]]) Pw.solid(new THREE.CylinderGeometry(0.08, 0.08, 0.75, 7).rotateX(Math.PI / 2).rotateY(r), C.leather, mat4(-5.45, 0.12 + Math.abs(r) * 0.2, z));
    for (const [z, s] of [[-0.25, 0.3], [0.1, 0.36], [0.35, 0.26], [-0.05, 0.42]]) glow('hall', [-5.45, 0.24, z], [1.0, 0.52, 0.18], s, 1);
    glow('hall', [-5.3, 0.45, 0], [1.0, 0.45, 0.15], 1.5);
    lamps.push([-4.7, 0.6, 0, 5.2, 0.95, 0.5, 0.2, 1]);
    wall(xb, -zw - 0.05, xf, -zw - 0.05, 0.05, S0); wall(xf, -zw, xf, zw, 0.1, S0); wall(xb, zw + 0.05, xf, zw + 0.05, 0.05, S0);
    skull(L.W.P, xf + 0.06, 3.3, 0, 1.0);
    for (const e of [-1, 1]) { shieldOnWall(L.W.P, -IX + 0.05, 4.2, e * 2.3, e > 0 ? C.cloth : C.red); }
    // two chairs before it, a little table between
    for (const e of [-1, 1]) { armchair(Hp, -3.55, e * 0.85, -Math.PI / 2 + e * 0.5); round(-3.55, e * 0.85, 0.42, S0); }
    Hp.solid(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12), '#6b4128', mat4(-3.4, 0.55, 0)); Hp.solid(new THREE.CylinderGeometry(0.05, 0.08, 0.55, 8), '#4a2e1c', mat4(-3.4, 0.27, 0));
    mug(Hp, -3.35, 0.575, 0.08); round(-3.4, 0, 0.3, S0);
  }
  // ---- the bar along the west wall by the door: a counter, stools, barrels on a rack behind with bottles over them
  {
    const xc = -4.3, z0 = 3.6, z1 = 6.8, d = 0.6, h = 1.08;
    Hp.at(xc, 0, (z0 + z1) / 2, Math.PI / 2);
    counter(Hp, -(z1 - z0) / 2, (z1 - z0) / 2, 0.3, d, h);
    Hp.back();
    wall(xc, z0, xc, z1, d / 2, S0);
    for (const z of [4.0, 4.8, 5.6, 6.4]) { stool(Hp, -3.6, z); round(-3.6, z, 0.2, S0); }
    for (const [z, k] of [[4.3, 0], [5.2, 1], [6.1, 2]]) mug(Hp, xc + 0.1, h, z + k * 0.07);
    L.W.P.box('dark', -IX + 0.03, 2.85, 5.2, 0.05, 0.42, 1.98, { grain: 'z' });
    L.W.P.artQuad(A.lTavern, [-IX + 0.06, 2.88, 6.1], [-IX + 0.06, 2.88, 4.3], [-IX + 0.06, 3.24, 4.3], [-IX + 0.06, 3.24, 6.1]);
    // the rack of barrels against the wall, taps out
    const Pw = L.W.P;
    Pw.box('dark', -IX + 0.42, 0, 5.2, 0.7, 0.42, 3.6, { grain: 'z' });
    for (const z of [3.9, 4.85, 5.8, 6.7]) { barrel(Pw, -IX + 0.42, 0.42, z, { r: 0.36, h: 0.78, lying: true }); Pw.box(C.brass, -IX + 0.84, 0.75, z, 0.08, 0.05, 0.05); }
    for (const y of [1.75, 2.3]) {
      Pw.box('dark', -IX + 0.15, y, 5.2, 0.3, 0.05, 3.6, { grain: 'z' });
      for (let i = 0; i < 14; i++) bottle(Pw, -IX + 0.15, y + 0.05, 3.55 + i * 0.24 + Pw.rng() * 0.05, C.bottles[(i + (y > 2 ? 3 : 0)) % 6]);
    }
    lamps.push([-4.9, 2.6, 4.4, 3.4, 0.42, 0.3, 0.16, 0.25]); lamps.push([-4.9, 2.6, 6.2, 3.4, 0.42, 0.3, 0.16, 0.25]);
    for (const z of [4.4, 6.2]) hangingLamp(L.roof, -4.7, 2.7, z);
  }
  // ---- tables: a long one with benches, round ones with stools, one by the stair
  {
    longTable(Hp, -2.5, 1.9, 2.1, 0.8);
    for (const e of [-1, 1]) { bench(Hp, -2.5 + e * 0.72, 1.9, 2.0); }
    wall(-2.5, 1.0, -2.5, 2.8, 0.82, S0);
    for (const [x, z, r] of [[-2.0, 5.5, 0.6], [2.3, -1.2, 0.55], [2.6, 5.4, 0.55]]) {
      roundTable(Hp, x, z, r);
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + x; stool(Hp, x + Math.cos(a) * (r + 0.35), z + Math.sin(a) * (r + 0.35)); }
      round(x, z, r + 0.42, S0);
      mug(Hp, x + 0.15, 0.82, z - 0.1); mug(Hp, x - 0.2, 0.82, z + 0.12);
      flame('hall', x, 0.98, z, 0.05); Hp.solid(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), C.candle, mat4(x, 0.885, z));
    }
    for (const [x, z] of [[-2.7, 1.2], [-2.3, 2.6]]) { mug(Hp, x, 0.81, z); }
    Hp.solid(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 12), '#c9b48a', mat4(-2.5, 0.825, 1.9));
  }
  // ---- the quest board on the east wall by the door: seven columns of notes under the ranks F .. S, a wanted poster
  {
    const Pe = L.E.P, x = IX - 0.05, z0 = 1.3, z1 = 6.5, y0 = 0.95, y1 = 2.85;
    Pe.box('wood', x - 0.03, y0, (z0 + z1) / 2, 0.06, y1 - y0, z1 - z0, { tint: [0.95, 0.8, 0.62], grain: 'z' });
    Pe.box('dark', x - 0.08, y0 - 0.12, (z0 + z1) / 2, 0.14, 0.12, z1 - z0 + 0.24, { grain: 'z' }); Pe.box('dark', x - 0.08, y1, (z0 + z1) / 2, 0.14, 0.12, z1 - z0 + 0.24, { grain: 'z' });
    for (const z of [z0 - 0.06, z1 + 0.06]) Pe.box('dark', x - 0.08, 0, z, 0.14, y1 + 0.12, 0.12, { grain: 'y' });
    Pe.box('dark', x - 0.1, y1 + 0.12, (z0 + z1) / 2, 0.08, 0.5, 2.6, { grain: 'z' });
    Pe.artQuad(A.lBoard, [x - 0.15, y1 + 0.16, (z0 + z1) / 2 - 1.25], [x - 0.15, y1 + 0.16, (z0 + z1) / 2 + 1.25], [x - 0.15, y1 + 0.58, (z0 + z1) / 2 + 1.25], [x - 0.15, y1 + 0.58, (z0 + z1) / 2 - 1.25]);
    const cw = (z1 - z0) / 7;
    for (let c = 0; c < 7; c++) {
      const zc = z0 + (c + 0.5) * cw, rr = A.ranks[c];
      Pe.artQuad(rr, [x - 0.07, y1 - 0.3, zc - 0.14], [x - 0.07, y1 - 0.3, zc + 0.14], [x - 0.07, y1 - 0.02, zc + 0.14], [x - 0.07, y1 - 0.02, zc - 0.14]);
      const many = 4 - Math.floor(c / 2);
      for (let k = 0; k < many; k++) {
        const pz = zc + (Pe.rng() - 0.5) * 0.18, py = y1 - 0.75 - k * 0.42 + (Pe.rng() - 0.5) * 0.06, w = 0.27, h = 0.34, t = (Pe.rng() - 0.5) * 0.16;
        if (py < y0 + 0.05) break;
        const ct = Math.cos(t), st = Math.sin(t), q = (a, b) => [x - 0.065 - k * 0.002, py + a * st + b * ct, pz + a * ct - b * st];
        Pe.artQuad(A.papers[(c * 3 + k) % 8], q(-w / 2, -h / 2), q(w / 2, -h / 2), q(w / 2, h / 2), q(-w / 2, h / 2));
        Pe.box(C.red, x - 0.075, py + h / 2 - 0.05, pz, 0.02, 0.04, 0.04);
      }
    }
    const wq = (a, b) => [x - 0.07, 1.6 + b, 0.75 + a];
    Pe.artQuad(A.wanted, wq(-0.27, -0.36), wq(0.27, -0.36), wq(0.27, 0.36), wq(-0.27, 0.36));
    for (const z of [z0 - 0.4, z1 + 0.35]) { sconce(L.E, x, 2.6, z, -1); lamps.push([x - 0.4, 2.7, z, 3.6, 0.38, 0.3, 0.18, 0.2]); }
    // a wyvern's head over it
    skull(L.E.P, IX - 0.02, 4.5, 5.0, 1.2, -1, 1);
  }
  // ---- by the door: a rack of practice weapons, a barrel of staves; and the banner over the door inside
  {
    const P = L.S.P;
    weaponRack(P, 4.2, IZ - 0.25);
    barrel(P, 5.3, 0, IZ - 0.45, { r: 0.3, h: 0.8 }); for (let i = 0; i < 4; i++) P.box('wood', 5.3 + (i - 1.5) * 0.08, 0.5, IZ - 0.45 + (i % 2 - 0.5) * 0.1, 0.05, 1.2, 0.05, { rz: (i - 1.5) * 0.06, grain: 'y' });
    round(4.2, IZ - 0.3, 0.45, S0); round(5.3, IZ - 0.45, 0.35, S0); round(3.4, IZ - 0.3, 0.3, S0);
    P.artQuad(A.banner, [0.7, 3.5, IZ - 0.04], [-0.7, 3.5, IZ - 0.04], [-0.7, 5.7, IZ - 0.04], [0.7, 5.7, IZ - 0.04]);
    for (const e of [-1, 1]) { sconce(L.S, e * 1.85, 2.3, IZ - 0.05, 0, -1); }
    lamps.push([0, 2.4, IZ - 0.6, 3.2, 0.3, 0.24, 0.14, 0.2]);
    // a bench by the door, west
    bench(Hp, -3.2, IZ - 0.4, 1.6, Math.PI / 2); round(-3.2, IZ - 0.4, 0.4, S0); round(-2.6, IZ - 0.4, 0.4, S0); round(-3.8, IZ - 0.4, 0.4, S0);
  }
  // ---- behind the stair, under the gallery: stores (crates, barrels, a cabinet)
  {
    L.hall.b.place('Prop_Crate', mat4(4.9, 0, -6.8, 0.1, [0.75, 0.75, 0.75])); L.hall.b.place('Prop_Crate', mat4(4.0, 0, -7.0, -0.3, [0.65, 0.65, 0.65]));
    barrel(Hp, 5.1, 0, -5.4, { r: 0.33, h: 0.85 }); barrel(Hp, 4.4, 0, -5.6, { r: 0.3, h: 0.8 });
    for (const [x, z, r] of [[4.9, -6.8, 0.5], [4.0, -7.0, 0.45], [5.1, -5.4, 0.35], [4.4, -5.6, 0.32]]) round(x, z, r, S0);
  }
  // ---- the chandeliers: wheels of wood and iron on chains from the trusses, a ring of candles each
  for (const z of TRUSS.slice(1)) { chandelier(L.roof, 0, 4.4, z, 0.85); lamps.push([0, 4.2, z, 7.5, 0.62, 0.46, 0.26, 0.15]); }

  // ================================================================== the gallery
  {
    const Gp = L.gallery.P;
    // the guild master's desk looking out over the hall, a chair, a crystal ball; books behind
    desk(Gp, 0, -5.6);
    Gp.solid(new THREE.SphereGeometry(0.13, 16, 12), C.glassBlue, mat4(0.6, F1 + 0.93, -5.55)); Gp.solid(new THREE.CylinderGeometry(0.08, 0.1, 0.06, 10), C.brass, mat4(0.6, F1 + 0.8, -5.55));
    glow('gallery', [0.6, F1 + 0.93, -5.55], [0.3, 0.6, 0.9], 0.6);
    flame('gallery', -0.65, F1 + 1.0, -5.6, 0.05); Gp.solid(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8), C.candle, mat4(-0.65, F1 + 0.88, -5.6));
    wall(-1.0, -5.6, 1.0, -5.6, 0.42, S1); round(0, -6.45, 0.35, S1);
    for (const e of [-1, 1]) { bookshelf(L.NG.P, e * 3.0, -IZ + 0.22, 1.5); wall(e * 2.2, -IZ + 0.24, e * 3.8, -IZ + 0.24, 0.22, S1); }
    lamps.push([0, F1 + 1.4, -5.4, 3.2, 0.32, 0.25, 0.15, 0.25]);
    // the meeting table at the west end, the map of the lands on it and on the wall
    roundTable(Gp, -4.0, -6.0, 0.75, F1);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; chair(Gp, -4.0 + Math.cos(a) * 1.05, -6.0 + Math.sin(a) * 1.05, Math.atan2(-Math.cos(a), -Math.sin(a)), F1); }
    round(-4.0, -6.0, 1.3, S1);
    Gp.artQuad(A.map, [-4.45, F1 + 0.83, -5.7], [-3.55, F1 + 0.83, -5.7], [-3.55, F1 + 0.83, -6.3], [-4.45, F1 + 0.83, -6.3]);
    L.walls.P.artQuad(A.map, [-IX + 0.04, F1 + 1.0, -4.3], [-IX + 0.04, F1 + 1.0, -5.9], [-IX + 0.04, F1 + 2.1, -5.9], [-IX + 0.04, F1 + 2.1, -4.3]);
    // a globe and a suit of armour at the east end, banners hung from the rail over the hall
    Gp.solid(new THREE.CylinderGeometry(0.18, 0.24, 0.6, 8), '#4a2e1c', mat4(3.6, F1 + 0.3, -6.9)); Gp.solid(new THREE.SphereGeometry(0.3, 16, 12), '#3f6b8a', mat4(3.6, F1 + 0.95, -6.9));
    Gp.solid(new THREE.TorusGeometry(0.34, 0.02, 6, 24), C.brass, mat4(3.6, F1 + 0.95, -6.9, 0.4)); round(3.6, -6.9, 0.35, S1);
    armour(Gp, 5.1, -5.0); round(5.1, -5.0, 0.4, S1);
    for (const x of [-2.2, 2.2]) Gp.artQuad(A.banner, [x - 0.4, F1 - 1.2, GAL.z1 + 0.05], [x + 0.4, F1 - 1.2, GAL.z1 + 0.05], [x + 0.4, F1 + 1.05, GAL.z1 + 0.05], [x - 0.4, F1 + 1.05, GAL.z1 + 0.05]);
    for (const x of [-3.9, 3.9]) { sconce(L.gallery, x, F1 + 1.7, -IZ + 0.05, 0, 1); lamps.push([x, F1 + 1.8, -IZ + 0.6, 3.8, 0.36, 0.28, 0.16, 0.2]); }
  }

  // ================================================================== furniture makers (in a painter's frame; y = the floor they stand on)
  function counter(P, x0, x1, z0, d, h, top = 'dark') {                    // front at z0 (facing +z), from x0 to x1
    const xm = (x0 + x1) / 2, w = x1 - x0, zm = z0 - d / 2;
    P.box('dark', xm, 0, zm, w, 0.12, d - 0.06);
    P.box('carved', xm, 0.12, z0 - 0.05, w, h - 0.2, 0.05, { grain: 'x', skip: '-z' });
    P.box('dark', xm, 0.12, zm, w - 0.04, h - 0.2, d - 0.14);
    P.box(top, xm, h - 0.08, zm + 0.02, w + 0.08, 0.08, d + 0.08, { grain: 'x' });
    for (let x = x0 + 0.02; x <= x1 + 0.01; x += Math.max(0.6, w / Math.round(w / 1.1))) P.box('dark', Math.min(x, x1 - 0.04), 0, z0 - 0.02, 0.09, h - 0.08, 0.06, { grain: 'y' });
  }
  function lamp(layer, x, y, z) {                                          // a candle in a glass on the counter
    const P = layer.P;
    P.box(C.iron, x, y, z, 0.12, 0.02, 0.12); P.box('#ffe2a8', x, y + 0.02, z, 0.1, 0.16, 0.1); P.box(C.iron, x, y + 0.18, z, 0.12, 0.02, 0.12);
    glow(layer === L.hall ? 'hall' : layer === L.gallery ? 'gallery' : 'out', [x, y + 0.1, z], [1.0, 0.62, 0.25], 0.55);
  }
  function hangSign(layer, x, y, z, w, rect, ry = 0) {                    // a board on two chains, its picture on both faces
    const P = layer.P, h = w * (rect[3] - rect[1]) / (rect[2] - rect[0]);
    P.at(x, y, z, ry);
    P.box('dark', 0, -0.03, 0, w + 0.06, h + 0.06, 0.04);
    P.artQuad(rect, [-w / 2, 0, 0.025], [w / 2, 0, 0.025], [w / 2, h, 0.025], [-w / 2, h, 0.025]);
    P.artQuad(rect, [w / 2, 0, -0.025], [-w / 2, 0, -0.025], [-w / 2, h, -0.025], [w / 2, h, -0.025]);
    for (const e of [-1, 1]) P.box(C.iron, e * w * 0.38, h, 0, 0.02, 0.5, 0.02);
    P.back();
  }
  function pigeonholes(P, x0, x1, z, h) {                                  // against a wall at z (facing +z)
    const zc = z + 0.22, w = x1 - x0;
    P.box('dark', (x0 + x1) / 2, 0, zc, w, h, 0.42, { skip: '+z' });
    const nx = Math.round(w / 0.36), ny = Math.round((h - 0.3) / 0.34);
    for (let i = 0; i <= nx; i++) P.box('dark', x0 + w * i / nx, 0.3, zc + 0.2, 0.04, h - 0.3, 0.04, { grain: 'y' });
    for (let j = 0; j <= ny; j++) P.box('dark', (x0 + x1) / 2, 0.3 + (h - 0.3) * j / ny - 0.02, zc + 0.2, w, 0.04, 0.04, { grain: 'x' });
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      if (P.rng() < 0.25) continue;
      const cx = x0 + w * (i + 0.5) / nx, cyy = 0.3 + (h - 0.3) * j / ny;
      for (let k = 0; k < 2 + Math.floor(P.rng() * 3); k++) P.solid(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6).rotateX(Math.PI / 2), P.rng() < 0.3 ? C.paperOld : C.paper, mat4(cx - 0.1 + k * 0.06, cyy + 0.05 + (k % 2) * 0.05, zc + 0.05));
    }
  }
  function scales(P, x, y, z) {
    P.solid(new THREE.CylinderGeometry(0.1, 0.13, 0.05, 12), C.brass, mat4(x, y, z)); P.solid(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), C.brass, mat4(x, y + 0.05, z));
    P.box(C.brass, x, y + 0.53, z, 0.6, 0.03, 0.03);
    for (const e of [-1, 1]) { P.box(C.brass, x + e * 0.28, y + 0.32, z, 0.006, 0.22, 0.006); P.solid(new THREE.CylinderGeometry(0.11, 0.07, 0.04, 12), C.brass, mat4(x + e * 0.28, y + 0.3, z)); }
    P.solid(new THREE.OctahedronGeometry(0.05), '#b98cff', mat4(x - 0.28, y + 0.36, z));
    glow('hall', [x - 0.28, y + 0.36, z], [0.5, 0.35, 0.8], 0.28);
  }
  function sack(P, x, z) {
    P.solid(new THREE.SphereGeometry(0.28, 10, 8).scale(1, 1.15, 0.9), C.burlap, mat4(x, 0.3, z)); P.solid(new THREE.CylinderGeometry(0.06, 0.12, 0.12, 8), C.burlapDark, mat4(x, 0.62, z));
  }
  function hide(P, x, y, z) {                                              // a beast's pelt nailed to a wall facing +x
    const s = new THREE.Shape();
    s.moveTo(0, 0.6); s.bezierCurveTo(0.35, 0.7, 0.3, 0.3, 0.55, 0.25); s.bezierCurveTo(0.45, 0, 0.5, -0.4, 0.3, -0.6); s.lineTo(0, -0.45); s.lineTo(-0.3, -0.6); s.bezierCurveTo(-0.5, -0.4, -0.45, 0, -0.55, 0.25); s.bezierCurveTo(-0.3, 0.3, -0.35, 0.7, 0, 0.6);
    const g = new THREE.ShapeGeometry(s, 8); g.rotateY(Math.PI / 2); P.solid(g, C.fur, mat4(x, y, z));
  }
  function skull(P, x, y, z, s, dir = 1, kind = 0) {                       // a great beast's skull on a plaque: on a wall facing +x (dir 1) or -x
    const f = dir, w = (dx, dy, dz) => [x + f * dx * s, y + dy * s, z + f * dz * s];      // (dx out from the wall, dy up, dz along it)
    const M4 = (dx, dy, dz, rz = 0, sc = [1, 1, 1]) => new THREE.Matrix4().compose(new THREE.Vector3(...w(dx, dy, dz)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, f > 0 ? 0 : Math.PI, rz)), new THREE.Vector3(sc[0] * s, sc[1] * s, sc[2] * s));
    // the plaque: a dark shield of wood
    const pl = new THREE.Shape(); pl.moveTo(0, 0.5); pl.quadraticCurveTo(0.42, 0.5, 0.45, 0.1); pl.quadraticCurveTo(0.4, -0.35, 0, -0.55); pl.quadraticCurveTo(-0.4, -0.35, -0.45, 0.1); pl.quadraticCurveTo(-0.42, 0.5, 0, 0.5);
    const pg = new THREE.ExtrudeGeometry(pl, { depth: 0.06, bevelEnabled: false, curveSegments: 8 }); pg.rotateY(Math.PI / 2);
    P.solid(pg, '#4a2e1c', M4(0, 0, 0));
    const bone = kind ? '#d9cfae' : C.bone, dark = '#2a2220';
    P.solid(new THREE.SphereGeometry(0.3, 12, 9), bone, M4(0.2, 0.05, 0, 0, [1.25, 0.95, 1.1]));                         // the crown of the head
    P.solid(new THREE.CylinderGeometry(0.075, 0.17, 0.62, 6).rotateZ(-Math.PI / 2), bone, M4(0.6, -0.02, 0, -0.12, [1, 0.85, 1.05]));      // the snout
    P.solid(new THREE.CylinderGeometry(0.05, 0.12, 0.55, 6).rotateZ(-Math.PI / 2), C.boneDark, M4(0.55, -0.2, 0, -0.3, [1, 0.6, 0.9]));      // the jaw, a little open
    for (const e of [-1, 1]) {
      P.solid(new THREE.SphereGeometry(0.075, 8, 6), dark, M4(0.38, 0.1, e * 0.15, 0, [0.8, 1, 1]));                     // the eyes' hollows
      P.solid(new THREE.SphereGeometry(0.025, 6, 4), dark, M4(0.9, 0.0, e * 0.05));                                     // nostrils
      for (let i = 0; i < 4; i++) P.solid(new THREE.ConeGeometry(0.022, 0.09, 5).rotateZ(Math.PI), '#f3ead2', M4(0.42 + i * 0.11, -0.12, e * (0.1 - i * 0.012)));      // teeth
      // a horn: out of the back of the head, up and out, its tip curling forward
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push(w(0.06 + (kind ? 0.08 : 0.05) * t + (kind ? 0.1 : 0.3) * t * t * t, 0.2 + (kind ? 0.95 : 0.25) * t + (kind ? -0.15 : 0.55) * t * t, e * (0.2 + (kind ? 0.42 : 0.75) * t - (kind ? 0 : 0.2) * t * t)));
      }
      P.tube(pts, 0.11 * s, 0.014 * s, '#3d2f27', '#5a4636');
      if (kind) P.tube([w(0.25, 0.25, e * 0.18), w(0.22, 0.45, e * 0.3), w(0.3, 0.55, e * 0.36)], 0.04 * s, 0.008 * s, '#3d2f27', '#5a4636');
    }
  }
  function shieldOnWall(P, x, y, z, col) {                                  // a round shield and two crossed swords behind it, on a wall facing +x
    for (const e of [-1, 1]) P.box(C.steel, x + 0.04, y - 0.6, z, 0.03, 1.2, 0.07, { rx: e * 0.7 });
    P.solid(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 16).rotateZ(Math.PI / 2), col, mat4(x + 0.08, y, z));
    P.solid(new THREE.CylinderGeometry(0.39, 0.39, 0.04, 16).rotateZ(Math.PI / 2), C.gold, mat4(x + 0.06, y, z));
    P.solid(new THREE.SphereGeometry(0.09, 8, 6), C.gold, mat4(x + 0.12, y, z));
  }
  function armchair(P, x, z, ry) {
    P.at(x, 0, z, ry);
    P.box('dark', 0, 0, 0, 0.7, 0.42, 0.7); P.box(C.red, 0, 0.42, 0.02, 0.6, 0.12, 0.6);
    P.box('dark', 0, 0.42, -0.3, 0.7, 0.75, 0.12, { grain: 'y' }); P.box(C.red, 0, 0.55, -0.22, 0.56, 0.55, 0.06);
    for (const e of [-1, 1]) P.box('dark', e * 0.32, 0.42, 0, 0.1, 0.28, 0.66);
    P.back();
  }
  function mug(P, x, y, z) { P.solid(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 10), '#8a5a34', mat4(x, y + 0.06, z)); P.solid(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 10), '#f0e0b0', mat4(x, y + 0.122, z)); }
  function bottle(P, x, y, z, col) {
    P.solid(new THREE.CylinderGeometry(0.045, 0.05, 0.2, 8), col, mat4(x, y + 0.1, z)); P.solid(new THREE.CylinderGeometry(0.015, 0.035, 0.1, 6), col, mat4(x, y + 0.25, z));
    P.solid(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 6), '#a08060', mat4(x, y + 0.315, z));
  }
  function stool(P, x, z) { P.solid(new THREE.CylinderGeometry(0.2, 0.18, 0.06, 10), '#7a4e2e', mat4(x, 0.6, z)); for (let k = 0; k < 3; k++) { const a = k * 2.094; P.box('dark', x + Math.cos(a) * 0.12, 0, z + Math.sin(a) * 0.12, 0.05, 0.6, 0.05, { grain: 'y' }); } }
  function bench(P, x, z, len, ry = 0) {
    P.at(x, 0, z, ry);
    P.box('wood', 0, 0.42, 0, 0.36, 0.06, len, { grain: 'z' });
    for (const e of [-1, 1]) P.box('dark', 0, 0, e * (len / 2 - 0.2), 0.3, 0.42, 0.08);
    P.back();
  }
  function longTable(P, x, z, len, w, y = 0) {
    P.box('wood', x, y + 0.74, z, w, 0.07, len, { grain: 'z' });
    for (const e of [-1, 1]) P.box('dark', x, y, z + e * (len / 2 - 0.25), w - 0.2, 0.74, 0.1);
    P.box('dark', x, y + 0.2, z, 0.1, 0.1, len - 0.5, { grain: 'z' });
  }
  function roundTable(P, x, z, r, y = 0) {
    P.solid(new THREE.CylinderGeometry(r, r, 0.07, 16), '#8a5a34', mat4(x, y + 0.74, z));
    P.solid(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.02, 16), '#a2703f', mat4(x, y + 0.805, z));
    P.solid(new THREE.CylinderGeometry(0.07, 0.1, 0.74, 8), '#4a2e1c', mat4(x, y, z)); P.solid(new THREE.CylinderGeometry(0.32, 0.36, 0.05, 12), '#4a2e1c', mat4(x, y, z));
  }
  function chair(P, x, z, ry, y = 0) {
    P.at(x, y, z, ry);
    P.box('wood', 0, 0.45, 0, 0.44, 0.05, 0.42); for (const a of [-1, 1]) for (const b of [-1, 1]) P.box('dark', a * 0.18, 0, b * 0.17, 0.05, 0.45, 0.05, { grain: 'y' });
    P.box('dark', 0, 0.5, -0.19, 0.44, 0.5, 0.05, { grain: 'x' });
    P.back();
  }
  function desk(P, x, z) {
    const y = F1;
    P.box('dark', x, y + 0.72, z, 2.0, 0.08, 0.85, { grain: 'x' });
    for (const e of [-1, 1]) P.box('carved', x + e * 0.8, y, z, 0.36, 0.72, 0.8, { grain: 'z' });
    P.box('carved', x, y + 0.1, z + 0.36, 1.3, 0.55, 0.04, { grain: 'x' });
    P.box(C.paper, x - 0.15, y + 0.8, z, 0.5, 0.01, 0.36, { ry: 0.2 }); P.box(C.books[0], x + 0.25, y + 0.8, z - 0.15, 0.3, 0.08, 0.22, { ry: -0.3 });
    P.at(x, y, z - 0.85, 0);                                               // the master's chair, high-backed
    P.box('dark', 0, 0, 0, 0.62, 0.48, 0.58); P.box(C.red, 0, 0.48, 0.02, 0.54, 0.08, 0.5); P.box('carved', 0, 0.48, -0.3, 0.62, 1.1, 0.08, { grain: 'y' });
    P.box(C.gold, 0, 1.5, -0.3, 0.2, 0.14, 0.1);
    P.back();
  }
  function bookshelf(P, x, z, w) {                                          // against the back wall at z (facing +z), on the gallery
    const y = F1, h = 2.2;
    P.box('dark', x, y, z, w, h, 0.4, { skip: '+z' });
    for (let r = 0; r < 5; r++) {
      const yy = y + 0.1 + r * 0.43;
      P.box('dark', x, yy - 0.04, z + 0.02, w - 0.04, 0.04, 0.36, { grain: 'x' });
      for (let a = x - w / 2 + 0.08; a < x + w / 2 - 0.12;) {
        const bw = 0.05 + P.rng() * 0.05, bh = 0.24 + P.rng() * 0.12;
        if (P.rng() < 0.88) P.box(C.books[Math.floor(P.rng() * 7)], a + bw / 2, yy, z + 0.03, bw, bh, 0.3, { rz: P.rng() < 0.1 ? 0.25 : 0 });
        a += bw + 0.008;
      }
    }
  }
  function armour(P, x, z) {
    const y = F1;
    P.solid(new THREE.CylinderGeometry(0.3, 0.32, 0.06, 10), '#4a2e1c', mat4(x, y, z)); P.box('dark', x, y, z, 0.06, 1.6, 0.06, { grain: 'y' });
    P.solid(new THREE.CylinderGeometry(0.2, 0.26, 0.55, 10), C.steel, mat4(x, y + 0.95, z)); P.solid(new THREE.CylinderGeometry(0.15, 0.16, 0.26, 10), C.steel, mat4(x, y + 1.55, z));
    P.box(C.steel, x, y + 1.38, z, 0.76, 0.12, 0.22); P.solid(new THREE.SphereGeometry(0.15, 10, 8), C.steel, mat4(x, y + 1.72, z));
    P.solid(new THREE.ConeGeometry(0.05, 0.25, 6), C.red, mat4(x, y + 1.95, z));
    P.box(C.cloth, x, y + 0.65, z, 0.4, 0.4, 0.3);
  }
  function weaponRack(P, x, z) {                                            // against the front wall (facing -z)
    for (const e of [-1, 1]) P.box('dark', x + e * 0.8, 0, z, 0.1, 1.4, 0.3);
    for (const y of [0.35, 1.2]) P.box('dark', x, y, z, 1.7, 0.08, 0.1);
    for (let i = 0; i < 5; i++) {
      const xx = x - 0.6 + i * 0.3;
      if (i % 2) { P.box('wood', xx, 0.1, z - 0.05, 0.05, 1.9, 0.05, { grain: 'y' }); P.solid(new THREE.ConeGeometry(0.05, 0.25, 4), C.steel, mat4(xx, 2.12, z - 0.05)); }
      else { P.box(C.steel, xx, 0.38, z - 0.05, 0.08, 1.0, 0.02); P.box('dark', xx, 1.3, z - 0.05, 0.3, 0.05, 0.06); P.box('dark', xx, 1.35, z - 0.05, 0.05, 0.25, 0.05); }
    }
  }
  function sconce(layer, x, y, z, dirX, dirZ = 0) {                           // an iron arm off a wall with a candle in a glass
    const P = layer.P, ox = dirX * 0.18, oz = dirZ * 0.18;
    P.box(C.iron, x + ox / 2, y - 0.02, z + oz / 2, Math.abs(ox) + 0.04, 0.04, Math.abs(oz) + 0.04);
    P.box(C.iron, x, y - 0.15, z, 0.1, 0.3, 0.1);
    P.box('#ffe2a8', x + ox, y, z + oz, 0.12, 0.18, 0.12); P.box(C.iron, x + ox, y + 0.18, z + oz, 0.15, 0.03, 0.15);
    glow(layer === L.gallery ? 'gallery' : layer === L.E ? 'E' : layer === L.S ? 'S' : 'hall', [x + ox, y + 0.09, z + oz], [1.0, 0.62, 0.25], 0.7);
  }
  function hangingLamp(layer, x, y, z) {
    const P = layer.P;
    P.box(C.iron, x, y + 0.3, z, 0.02, roofIn(x) - y - 0.3, 0.02);
    P.box(C.iron, x, y - 0.2, z, 0.22, 0.03, 0.22); P.box('#ffd68a', x, y - 0.17, z, 0.18, 0.3, 0.18); P.box(C.iron, x, y + 0.13, z, 0.24, 0.04, 0.24);
    P.solid(new THREE.ConeGeometry(0.17, 0.16, 4).rotateY(Math.PI / 4), C.iron, mat4(x, y + 0.25, z));
    glow('roof', [x, y - 0.02, z], [1.0, 0.62, 0.25], 0.8);
  }
  function chandelier(layer, x, y, z, r) {                                  // a cart wheel hung flat, candles round its rim
    const P = layer.P;
    P.solid(new THREE.TorusGeometry(r, 0.06, 6, 24).rotateX(Math.PI / 2), '#4a2e1c', mat4(x, y, z));
    P.solid(new THREE.TorusGeometry(r + 0.04, 0.025, 4, 24).rotateX(Math.PI / 2), C.iron, mat4(x, y - 0.02, z));
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; P.box('#4a2e1c', x + Math.cos(a) * r / 2, y - 0.03, z + Math.sin(a) * r / 2, r, 0.05, 0.05, { ry: -a }); }
    P.solid(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 8), '#4a2e1c', mat4(x, y - 0.07, z));
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; P.tube([[x + Math.cos(a) * r, y + 0.02, z + Math.sin(a) * r], [x, y + 1.15, z]], 0.012, 0.012, C.iron, C.iron, 4); }
    P.solid(new THREE.TorusGeometry(0.07, 0.015, 4, 10), C.iron, mat4(x, y + 1.17, z));
    P.box(C.iron, x, y + 1.17, z, 0.025, TOP + 0.05 - y - 1.17, 0.025);
    for (let k = 0; k < 10; k++) {
      const a = k * Math.PI / 5, cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
      P.solid(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6), C.candle, mat4(cx, y + 0.05, cz));
      glow('roof', [cx, y + 0.3, cz], [1.0, 0.6, 0.22], 0.08, 1);
    }
    glow('roof', [x, y + 0.2, z], [1.0, 0.55, 0.2], 3.2);
  }
  function barrel(P, x, y, z, { r = 0.35, h = 0.9, lying = false, ry = 0 } = {}) {      // staves of dark board, iron hoops
    const n = 12, prof = t => r * (0.88 + 0.12 * Math.sin(Math.PI * t));
    P.at(x, y + (lying ? r : 0), z, ry);
    const put = (px, py, pz) => (lying ? [py - h / 2, px, pz] : [px, py, pz]);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      for (let s = 0; s < 3; s++) {
        const t0 = s / 3, t1 = (s + 1) / 3, r0 = prof(t0), r1 = prof(t1);
        const p = (a, rr, t) => put(Math.cos(a) * rr, t * h, Math.sin(a) * rr);
        P.quad('dark', p(a0, r0, t0), p(a0, r1, t1), p(a1, r1, t1), p(a1, r0, t0), 0.95 + (i % 3) * 0.05);
      }
    }
    for (const t of [0.15, 0.85]) {
      const g = new THREE.TorusGeometry(prof(t) + 0.01, 0.018, 4, 18); g.rotateX(Math.PI / 2);
      if (lying) g.rotateZ(Math.PI / 2);
      P.solid(g, C.iron, lying ? mat4(t * h - h / 2, 0, 0) : mat4(0, t * h, 0));
    }
    const cap = new THREE.CircleGeometry(r * 0.88, n);
    if (lying) { const c1 = cap.clone().rotateY(Math.PI / 2); P.solid(c1, '#6b4128', mat4(h / 2, 0, 0)); P.solid(cap.rotateY(-Math.PI / 2), '#6b4128', mat4(-h / 2, 0, 0)); }
    else P.solid(cap.rotateX(-Math.PI / 2), '#6b4128', mat4(0, h, 0));
    P.back();
  }

  // ================================================================== meshes
  const see = { value: 1 }, time = { value: 0 }, glowing = { value: 0 };
  const shared = {
    uKey: { value: new THREE.Vector3(0.35, 0.85, 0.4).normalize() },
    uUp: { value: new THREE.Vector3() }, uDown: { value: new THREE.Vector3() },
    uLamp: { value: Array.from({ length: LAMPS }, () => new THREE.Vector4(0, -1e4, 0, 0.01)) },
    uLampCol: { value: Array.from({ length: LAMPS }, () => new THREE.Vector3()) },
    uHaze: propMaterial().uniforms.uHaze, uHazeNear: propMaterial().uniforms.uHazeNear, uHazeFar: propMaterial().uniforms.uHazeFar, uHazeMax: propMaterial().uniforms.uHazeMax,
  };
  const mats = new Map(), made = [];
  const materialFor = (kind, map) => {
    const key = kind + ':' + (map ? map.uuid : '-');
    if (!mats.has(key)) { const m = kind === 'out' ? outsideMaterial(map, see) : roomMaterial(map, kind === 'front' ? THREE.FrontSide : THREE.DoubleSide, shared); mats.set(key, m); made.push(m); }
    return mats.get(key);
  };
  const meshes = {};
  for (const [name, Lr] of Object.entries(layers)) {
    const { flat, art: artG } = Lr.P.flush(Lr.b);
    const g = Lr.b.build({ look });
    const kind = name === 'out' ? 'out' : (name === 'walls' || name === 'under') ? 'front' : 'room';
    if (name === 'out') for (const m of g.children) if (m.name === 'kit:glass') { m.material = glassMaterial(see, glowing); m.layers.enable(1); }
    for (const m of g.children) if (m.name !== 'kit:glass' || name !== 'out') m.material = materialFor(kind, m.material.uniforms && m.material.uniforms.uMap ? m.material.uniforms.uMap.value : null);
    if (flat) { const m = new THREE.Mesh(flat, materialFor(kind, null)); m.name = name + ':flat'; m.userData.dispose = () => flat.dispose(); g.add(m); }
    if (artG) { const m = new THREE.Mesh(artG, materialFor(kind, art.texture)); m.name = name + ':art'; m.userData.dispose = () => artG.dispose(); g.add(m); }
    if (Lr.glow.length) { const gm = glowMesh(Lr.glow, time); g.add(gm); Lr.glowMesh = gm; }
    g.name = 'guild:' + name;
    group.add(g);
    meshes[name] = g;
  }
  // the lamps in the world's frame, for the rooms' material (r g b: its colour and strength; the last: how much it flickers)
  const lampWorld = lamps.slice(0, LAMPS).map(([x, y, z, reach, r, g, b, fl]) => { const [wx, wz] = toWorld(x, z); return { p: new THREE.Vector4(wx, Y + y, wz, reach), c: new THREE.Vector3(r, g, b), fl, ph: wx * 1.7 + wz }; });
  lampWorld.forEach((l, i) => shared.uLamp.value[i].copy(l.p));
  let nightK = 0;
  const setLight = () => {
    const k = nightK;
    glowing.value = k;
    shared.uUp.value.set(0.86 - 0.5 * k, 0.8 - 0.47 * k, 0.72 - 0.36 * k);
    shared.uDown.value.set(0.6 - 0.36 * k, 0.55 - 0.34 * k, 0.53 - 0.27 * k);
  };
  setLight();

  // ================================================================== walking
  let storey = -1;
  const inHall = (u, v, pad = 0) => Math.abs(u) < W / 2 + pad && Math.abs(v) < D / 2 + pad;
  const inStair = (u, v) => u > STAIR.x0 - 0.05 && u < W / 2 && v < STAIR.z0 + 0.1 && v > STAIR.z1 - 0.3;
  const tStair = v => (STAIR.z0 - v) / (STAIR.z0 - STAIR.z1);
  const climb = t => Math.min(F1, Math.max(0, t * F1 + F1 / STAIR.n * 0.5));      // on the treads, not through them
  const floorAt = (u, v) => (storey <= 1 && inStair(u, v) ? climb(tStair(v)) : storey === 1 ? F1 : 0);
  const onSteps = (u, v) => Math.abs(u) < STEP.half && v > D / 2 - 0.05 && v < D / 2 + 0.12 + 3 * STEP.run;
  const bare = [];
  {                                                                         // no grass under the building and on the plaza before it
    const add = (u, v, r) => { const [x, z] = toWorld(u, v); bare.push([x, z, r]); };
    for (let u = -6.6; u <= 10.6; u += 0.8) for (let v = -8.6; v <= 9.4; v += 0.8) add(u, v, 0.75);
    for (let u = PLAZA.u0; u <= PLAZA.u1 + 0.01; u += 0.7) for (let v = PLAZA.v0; v <= PLAZA.v1 + 0.3; v += 0.7) add(u, v, 0.7);
  }
  const hiddenWalls = { E: true, W: true, N: true, S: true };
  const guild = {
    group, colliders, bare, site: { x: X, y: Y, z: Z, yaw }, plan: GUILD_HALL,
    get storey() { return storey; }, set storey(s) { storey = s; },
    toLocal, toWorld,
    // the paved ground of the plaza before the door and round the building: d (0 = on it .. 1 at its edge), for a level's ways
    ground(x, z) {
      const [u, v] = toLocal(x, z);
      const box = (u0, u1, v0, v1) => { const du = Math.max(u0 - u, u - u1), dv = Math.max(v0 - v, v - v1); return Math.min(0, Math.max(du, dv)) + Math.hypot(Math.max(0, du), Math.max(0, dv)); };
      const s = Math.min(box(-7.2, 7.2, 8.3, 15.5), box(-6.8, 10.8, -8.8, 9.0));
      return s > 2 ? null : { d: Math.max(0, s + 0.6), paved: s < 0 ? 1 : 0 };
    },
    // what her foot is on (step-sounds.js): the hall's boards, the steps' and the plaza's stone; null: the land's own
    surfaceAt(x, z) {
      const [u, v] = toLocal(x, z);
      if (storey >= 0 && inHall(u, v, 0.05)) return 'wood';
      if (onSteps(u, v) || (plaza && u > PLAZA.u0 && u < PLAZA.u1 && v > PLAZA.v0 - 0.2 && v < PLAZA.v1)) return 'stone';
      return null;
    },
    heightAt(x, z, land) {
      const [u, v] = toLocal(x, z);
      if (storey >= 0 && inHall(u, v, 0.05)) return Y + floorAt(u, v);
      if (onSteps(u, v)) return Y + Math.max(-PLINTH, Math.min(0, -PLINTH / 3 * ((v - D / 2 - 0.12) / STEP.run + 0.5)));
      return land;
    },
    collide(p) {
      const bit = 1 << (storey + 1), Rr = 0.28;
      let [u, v] = toLocal(p.x, p.z);
      if (u < -12 || u > 14 || v < -11 || v > 17) return;
      for (let pass = 0; pass < 2; pass++) {
        for (const [u1, v1, u2, v2, half, on] of segs) {
          if (!(on & bit)) continue;
          const du = u2 - u1, dv = v2 - v1, t = Math.max(0, Math.min(1, ((u - u1) * du + (v - v1) * dv) / (du * du + dv * dv))), qu = u1 + du * t, qv = v1 + dv * t;
          let ou = u - qu, ov = v - qv, d = Math.hypot(ou, ov);
          if (d >= Rr + half) continue;
          if (d < 1e-5) { const l = Math.hypot(du, dv); ou = -dv / l; ov = du / l; d = 1; }
          u = qu + ou / d * (Rr + half); v = qv + ov / d * (Rr + half);
        }
        for (const [cu, cv, r, on] of rounds) {
          if (!(on & bit)) continue;
          const ou = u - cu, ov = v - cv, d = Math.hypot(ou, ov);
          if (d < r + Rr && d > 1e-5) { u = cu + ou / d * (r + Rr); v = cv + ov / d * (r + Rr); }
        }
      }
      [p.x, p.z] = toWorld(u, v);
    },
    follow(pos) {
      const [u, v] = toLocal(pos.x, pos.z);
      herV = v; herU = u;
      if (storey < 0) { if (inHall(u, v, -0.05)) storey = 0; return; }
      if (!inHall(u, v, 0.05)) { storey = -1; return; }
      if (storey <= 1 && inStair(u, v)) storey = tStair(v) < 0.5 ? 0 : 1;
    },
    update(dt, camera) {
      time.value += dt;
      // the lamps flicker (the fire most), the light of the hour
      lampWorld.forEach((l, i) => { const f = l.fl ? 1 + l.fl * (0.09 * Math.sin(time.value * 7.3 + l.ph) + 0.06 * Math.sin(time.value * 17.1 + l.ph * 2.3)) : 1; shared.uLampCol.value[i].copy(l.c).multiplyScalar(f * (0.8 + 0.5 * nightK)); });
      const inside = storey >= 0;
      let cu = 99, cv = 99, cyy = 0;
      if (camera) { [cu, cv] = toLocal(camera.position.x, camera.position.z); cyy = camera.position.y - Y; }
      // the eye in the building while she is outside it (her back to a wall, or just out of the door): the outside goes too, so
      // the building is never between her and the eye
      const eyeIn = Math.abs(cu) < W / 2 + 0.6 && cv > -D / 2 - 0.6 && cv < D / 2 + 0.6 && cyy > -0.5 && cyy < roofIn(cu) + 1.2;
      const eyeTower = cu > 5.6 && cu < 10.4 && cv > 3.6 && cv < 8.4 && cyy < 19;
      const open = inside || eyeIn || eyeTower;
      see.value += ((open ? 0 : 1) - see.value) * Math.min(1, dt * 9 + (dt <= 0 ? 1 : 0));
      if (Math.abs(see.value - (open ? 0 : 1)) < 0.01) see.value = open ? 0 : 1;
      meshes.out.visible = see.value > 0.001;
      if (L.out.glowMesh) L.out.glowMesh.userData.fade.value = see.value;
      // the eye in the building and she out of it: all of the inside goes too (its furniture would stand between them)
      const peek = open && !inside && !eyeTower;
      meshes.walls.visible = !peek;
      for (const k of ['hall', 'roof']) meshes[k].visible = !peek;
      // the gallery and its underside: away while the eye is above its floor and she is below it, under or near it
      const galleryAway = peek || (open && storey <= 0 && cyy > F1 - 0.3 && (cv < GAL.z1 + 0.6 || herV < GAL.z1 + 0.6));
      meshes.gallery.visible = !galleryAway; meshes.under.visible = !galleryAway;
      if (!peek) meshes.roof.visible = !open || cyy < roofIn(cu) - 0.3;
      // each wall's own things while the eye is on its room side
      hiddenWalls.E = open && (peek || cu > IX); hiddenWalls.W = open && (peek || cu < -IX); hiddenWalls.N = open && (peek || cv < -IZ); hiddenWalls.S = open && (peek || cv > IZ);
      for (const k of ['E', 'W', 'N', 'S']) meshes[k].visible = !hiddenWalls[k];
      meshes.NG.visible = !hiddenWalls.N && meshes.gallery.visible;
    },
    night(k) { nightK = Math.min(1, Math.max(0, k)); setLight(); },
    // places for people, and for things to do, later: [x, z, storey, the way they face]
    spots: {},
    lamps: lampWorld,
    dispose() { group.traverse(o => { if (o.userData && o.userData.dispose && o !== group) o.userData.dispose(); }); made.forEach(m => m.dispose()); art.texture.dispose(); },
  };
  let herU = 0, herV = 99;
  const spot = (u, v, s, face) => { const [x, z] = toWorld(u, v); return [x, z, s, face + yaw]; };
  Object.assign(guild.spots, {
    door: spot(0, D / 2 + 2.2, -1, Math.PI), plaza: spot(0, 12.5, -1, Math.PI), inside: spot(0, 6.2, 0, Math.PI),
    reception: [spot(-2, -5.4, 0, 0), spot(0, -5.4, 0, 0), spot(2, -5.4, 0, 0)], counter: spot(0, -3.4, 0, Math.PI),
    board: spot(3.9, 3.9, 0, Math.PI / 2), bar: spot(-5.1, 5.2, 0, Math.PI / 2), barSeat: spot(-3.2, 5.2, 0, -Math.PI / 2), exchange: spot(-4.7, -5.4, 0, 0),
    hearth: spot(-3.9, 0, 0, -Math.PI / 2), stair: spot(5.2, 1.2, 0, Math.PI), gallery: spot(1.6, -4.4, 1, 0), master: spot(0, -6.45, 1, 0),
  });
  group.userData.dispose = guild.dispose;
  console.info('[guild-hall]', Object.entries(meshes).map(([k, g]) => `${k}:${g.children.length}`).join(' '), 'tris', Math.round(Object.values(meshes).reduce((s, g) => s + g.children.reduce((t, m) => t + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0), 0)), 'lamps', lamps.length);
  return guild;
}
