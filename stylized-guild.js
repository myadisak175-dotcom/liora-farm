/* ==========================================================================
   stylized-guild.js  —  the adventurers' guild: a hall to walk into, a duelling ring and a training yard
   The place only (no people yet): a three-storey hall built in code from the village kit (stylized-buildings.js), standing
   on its own levelled ground where the keep used to be. She walks in through the door with no cut: the outside of the hall
   is drawn away while she is in it, and the rooms are seen like a doll's house.

     GUILD_SITE                       where everything stands (world metres); GUILD_SITE.pad goes to createValley({ tiers: { pads } })
     const guild = createGuild({ heightAt, padY });       // heightAt: the land's own height;  padY: the height of the levelled ground
     scene.add(guild.group);
     guild.colliders        [[x, z, r], ...]  solid things out of doors (posts, the ring's kerb, the dummies)
     guild.cleared(x, z)    true where plants, rocks and village props make way for the guild
     guild.ground(x, z)     null, or { d, paved }: trodden or paved ground laid by the guild (d as in the level's ways: 0 = bare)
     guild.bare             [[x, z, r], ...]  where no grass grows;   guild.casts  [[x, z, height, radius], ...]  what throws shade
     guild.heightAt(x, z, land)   the height to stand at: a floor of the hall, a stair, or the land
     guild.collide(p)       keeps { x, z } out of the walls, rails and furniture of the storey she is on
     guild.follow(pos)      every frame, with where she is: works out which storey she is on (-1 = out of doors)
     guild.update(dt, camera)   every frame: shows and hides the outside, the storeys and the ceilings
     guild.storey           -1 out of doors, 0 the hall, 1 the gallery, 2 the attic
     guild.spots            places for people and for things to do later: { reception, board, shop, ... } as [x, z, storey]

   How it is seen from inside: inner walls are drawn from their front only; what hangs on a wall is put away with it when the
   eye is behind that wall; a floor or ceiling above her is drawn only while the eye is below it; and if the eye itself is in
   the hall while she is outside, the outside and the inner walls both go. So nothing is ever between her and the eye.

   How the walking works: the hall is three floors at fixed heights joined by two straight stairs. A stair is a strip where the
   height runs from one floor to the next; she changes storey halfway up it. Walls, rails and furniture are line segments and
   circles in the hall's own plan, each marked with the storeys it stands on, so a rail upstairs never stops her downstairs.
   ========================================================================== */
import * as THREE from 'three';
import { kit, BUILD_COLORS } from './stylized-buildings.js';
import { propMaterial } from './stylized-props.js';

const HX = -30.5, HZ = -76.75;                                             // the middle of the hall (the plan below is measured from here)
export const GUILD_SITE = {
  hall: { x: HX, z: HZ, w: 9, d: 11.5 },                                   // w along x (the front door is in the east wall), d along z
  pad: { x: -34.25, z: -78.25, hx: 12.05, hz: 8.25, skirt: 2.4, at: [-33, -77] },      // the levelled ground: x -46.3..-22.2, z -86.5..-70
  arena: { x: HX - 10.6, z: HZ - 3.85, r: 4.8 },                           // the duelling ring behind the hall
  yard: { x0: HX - 15.3, x1: HX - 5.0, z0: HZ + 1.9, z1: HZ + 6.3 },        // the training yard, south of the ring
  steps: { x0: -22.0, x1: -17.8, z: HZ, half: 1.5 },                       // the stone steps up from the terrace (top at x0)
  view: { x: -17.2, z: -75.9, yaw: -Math.PI / 2 },                         // a place to stand and look at it
};

const C = {
  ...BUILD_COLORS,
  floor: '#c79a64', wood: '#8c5b38', woodDark: '#5e4030', woodLight: '#b9854f', sand: '#e9d8a6', sandMark: '#f4ead0',
  banner: '#3f6fa8', bannerDark: '#2f5788', gold: '#e0b84a', paper: '#f3ead0', paperOld: '#e2d2a8', iron: '#5c6270',
  carpet: '#a8433a', fire: '#f08a2c', fireHot: '#f6d875', soot: '#3a322e', pane: '#c6e6f2', straw: '#dcb95c', cork: '#b88a58',
  books: ['#a8433a', '#3f6fa8', '#5f8f6a', '#e0a43c', '#8e5aa0', '#6b4630', '#d8c8a0'],
  potions: ['#d8475a', '#4f9fd0', '#6fbf6a', '#e6c95a', '#a56fd0'],
};
// the hall, measured from its middle: u east (+x), v south (+z), y up from the levelled ground
const W = 9, D = 11.5, T = 0.3, IU = W / 2 - T, IV = D / 2 - T;            // IU, IV: the inner faces of the walls
const Y0 = 0.18, Y1 = 3.58, Y2 = 6.58, RR = 5.0;                           // the three floors; the roof rises RR above the eaves (at Y2)
const W2 = W + 0.4, D2 = D + 0.4;                                          // the upper storey juts out a little
const roofY = v => Y2 + RR * (1 - Math.abs(v) / (D2 / 2));                 // the roof's underside over a spot
const KNEE = 3.3;                                                          // the attic's side walls stand this far from the ridge line
const DOOR = 1.15, BACK = [1.4, 3.0], BALC = 0.65, BDOOR = 1.98;                         // half the front door; the back door (v from..to); half the balcony door
const STAIR_A = { u0: 3.6, u1: -1.4, v0: -IV, v1: -4.1, n: 17 };           // hall to gallery, along the north wall, climbing west
const STAIR_B = { v0: -2.2, v1: 2.1, u0: -IU, u1: -2.9, n: 15 };           // gallery to attic, along the west wall, climbing south
const ATRIUM = { u0: -1.6, u1: 2.2, v0: -2.4, v1: 2.6 };                   // the gallery looks down into the hall through this
const BALCONY = { u0: W2 / 2, u1: W2 / 2 + 1.25, v: 1.7 };
const OUT = 1, S0 = 2, S1 = 4, S2 = 8;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// a flat face that looks along `facing` (seen from that side only by the rooms' material)
const face = (K, pts, col, facing, vary) => { if (dot(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), facing) < 0) pts = [...pts].reverse(); K.face(pts, col, vary); };

export function createGuild({ heightAt, padY, seed = 5 } = {}) {
  const group = new THREE.Group();
  group.name = 'guild';
  group.position.set(HX, padY, HZ);
  const rngOf = s => { let a = s * 2654435761 % 2147483647; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const rng = rngOf(seed);
  const pick = a => a[Math.floor(rng() * a.length)];
  const segs = [], rounds = [], colliders = [];                           // walls and rails [u1, v1, u2, v2, half, storeys]; furniture [u, v, r, storeys]
  const wall = (u1, v1, u2, v2, half, on) => segs.push([u1, v1, u2, v2, half, on]);
  const round = (u, v, r, on) => rounds.push([u, v, r, on]);
  const solidOut = (u, v, r) => colliders.push([HX + u, HZ + v, r]);

  // ------------------------------------------------------------------ pieces used over and over
  // an inner wall face on the plane u = at (axis 'u') or v = at (axis 'v'), from a0 to a1 along the other way, between yb and yt;
  // holes [[a0, a1, top]] are doorways; the bottom `dado` of the wall is a darker band
  const innerWall = (K, axis, at, a0, a1, yb, yt, facing, { holes = [], low = C.stoneDark, high = C.plaster, dado = 1.0 } = {}) => {
    const P = (a, y) => axis === 'u' ? [at, y, a] : [a, y, at];
    const piece = (p0, p1, y0, y1, col) => { if (p1 - p0 > 0.01 && y1 - y0 > 0.01) face(K, [P(p0, y0), P(p1, y0), P(p1, y1), P(p0, y1)], col, facing, 0.015); };
    let a = a0;
    for (const [h0, h1, top] of [...holes].sort((p, q) => p[0] - q[0])) {
      piece(a, h0, yb, yb + dado, low); piece(a, h0, yb + dado, yt, high);
      piece(h0, h1, yb + top, yt, high);
      a = h1;
    }
    piece(a, a1, yb, yb + dado, low); piece(a, a1, yb + dado, yt, high);
  };
  // floor boards over a rectangle, laid along u
  const boards = (K, u0, u1, v0, v1, y, col = C.floor) => {
    const n = Math.max(1, Math.round((v1 - v0) / 0.46));
    for (let i = 0; i < n; i++) face(K, [[u0, y, v0 + (v1 - v0) * i / n], [u1, y, v0 + (v1 - v0) * i / n], [u1, y, v0 + (v1 - v0) * (i + 1) / n], [u0, y, v0 + (v1 - v0) * (i + 1) / n]], col, [0, 1, 0], 0.07);
  };
  // the underside of a floor, with joists
  const ceiling = (K, u0, u1, v0, v1, y) => {
    face(K, [[u0, y, v0], [u1, y, v0], [u1, y, v1], [u0, y, v1]], C.woodLight, [0, -1, 0], 0.03);
    for (let v = v0 + 0.5; v < v1 - 0.2; v += 1.15) K.box((u0 + u1) / 2, y - 0.16, v, u1 - u0, 0.16, 0.14, C.wood);
  };
  // a rail along a straight line (posts, a top rail, a lower rail); solid on the storeys in `on`
  const rail = (K, u1, v1, u2, v2, y, on, { h = 0.95, col = C.wood } = {}) => {
    const len = Math.hypot(u2 - u1, v2 - v1), n = Math.max(1, Math.round(len / 0.95)), ry = Math.atan2(-(v2 - v1), u2 - u1);
    for (let i = 0; i <= n; i++) K.box(u1 + (u2 - u1) * i / n, y, v1 + (v2 - v1) * i / n, 0.1, h, 0.1, C.woodDark);
    K.box((u1 + u2) / 2, y + h - 0.04, (v1 + v2) / 2, len + 0.14, 0.09, 0.13, col, { ry });
    K.box((u1 + u2) / 2, y + h * 0.45, (v1 + v2) / 2, len, 0.06, 0.06, col, { ry });
    if (on) wall(u1, v1, u2, v2, 0.06, on);
  };
  // a window: seen from outside (glass, sill, shutters) on a wall facing dir = [du, dv], and from inside as a bright pane
  const windowOut = (K, u, v, y, dir, { w = 0.95, h = 1.25, shutter = C.shutters[1] } = {}) => {
    const [du, dv] = dir, ry = du ? Math.PI / 2 : 0, o = 0.05;
    K.box(u + du * o, y, v + dv * o, w, h, 0.08, C.glass, { ry, vary: 0.03 });
    K.box(u + du * 0.1, y - 0.12, v + dv * 0.1, w + 0.2, 0.12, 0.2, C.timber, { ry });
    K.box(u + du * 0.07, y + h, v + dv * 0.07, w + 0.1, 0.1, 0.12, C.timber, { ry });
    K.box(u + du * 0.07, y + h * 0.5 - 0.03, v + dv * 0.07, w, 0.06, 0.1, C.timber, { ry });
    if (shutter) for (const e of [-1, 1]) K.box(u + du * 0.07 + (du ? 0 : e * (w / 2 + 0.2)), y, v + dv * 0.07 + (du ? e * (w / 2 + 0.2) : 0), 0.36, h, 0.07, shutter, { ry, vary: 0.03 });
  };
  const windowIn = (K, u, v, y, dir, { w = 0.95, h = 1.25 } = {}) => {     // dir: the way the wall faces (into the room)
    const [du, dv] = dir, ry = du ? Math.PI / 2 : 0;
    K.box(u + du * 0.02, y, v + dv * 0.02, w, h, 0.03, C.pane, { ry, vary: 0.02 });
    K.box(u + du * 0.04, y - 0.1, v + dv * 0.04, w + 0.2, 0.1, 0.12, C.wood, { ry });
    K.box(u + du * 0.04, y + h, v + dv * 0.04, w + 0.14, 0.09, 0.08, C.wood, { ry });
    K.box(u + du * 0.04, y, v + dv * 0.04, 0.06, h, 0.06, C.wood, { ry });
    K.box(u + du * 0.04, y + h * 0.5 - 0.03, v + dv * 0.04, w, 0.06, 0.06, C.wood, { ry });
  };
  // shelves of books (or of goods) against a wall: along u (axis 'u') or along v, its back at `back`, facing dir (+1 / -1)
  const shelves = (K, axis, a0, a1, back, dir, y, { h = 2.0, deep = 0.36, goods = null } = {}) => {
    const mid = (a0 + a1) / 2, len = a1 - a0;
    const B = (a, yy, off, w, hh, d, col, o) => axis === 'u' ? K.box(a, yy, back + dir * off, w, hh, d, col, o) : K.box(back + dir * off, yy, a, d, hh, w, col, o);
    B(mid, y, deep / 2, len, h, deep, C.woodDark);
    const rows = Math.max(2, Math.round(h / 0.5));
    for (let r = 0; r < rows; r++) {
      const yy = y + 0.12 + r * (h - 0.16) / rows;
      B(mid, yy - 0.05, deep / 2 + 0.02, len - 0.06, 0.05, deep, C.wood);
      for (let a = a0 + 0.1; a < a1 - 0.25;) {
        const w = 0.16 + rng() * 0.3, hh = (goods ? 0.16 : 0.24) + rng() * 0.14;
        if (rng() < 0.82) B(a + w / 2, yy, deep / 2 + 0.03, w, hh, deep - 0.06, pick(goods || C.books), { vary: 0.06 });
        a += w + (goods ? 0.08 : 0.015);
      }
    }
  };
  const table = (K, u, v, y, { r = 0.6, on = 0 } = {}) => {               // a round table with stools
    K.cyl(u, y + 0.7, v, r, r, 0.08, 10, C.woodLight);
    K.cyl(u, y, v, 0.09, 0.12, 0.7, 6, C.woodDark);
    K.cyl(u, y, v, 0.3, 0.3, 0.05, 8, C.woodDark);
    const a0 = rng() * 6.28;
    for (let i = 0; i < 3; i++) { const a = a0 + i * 2.094; K.cyl(u + Math.cos(a) * (r + 0.32), y, v + Math.sin(a) * (r + 0.32), 0.17, 0.2, 0.42, 7, C.wood, { vary: 0.08 }); }
    K.cyl(u + 0.15, y + 0.78, v - 0.1, 0.07, 0.06, 0.14, 6, C.gold);        // a mug and a plate
    K.cyl(u - 0.2, y + 0.78, v + 0.12, 0.14, 0.14, 0.02, 8, C.paper);
    if (on) round(u, v, r + 0.3, on);
  };
  const barrel = (K, u, v, y, s = 1) => { K.cyl(u, y, v, 0.3 * s, 0.3 * s, 0.8 * s, 9, C.wood, { vary: 0.08 }); K.cyl(u, y + 0.18 * s, v, 0.315 * s, 0.315 * s, 0.07 * s, 9, C.iron); K.cyl(u, y + 0.56 * s, v, 0.315 * s, 0.315 * s, 0.07 * s, 9, C.iron); };
  const crate = (K, u, v, y, s = 0.6, ry = 0) => { K.box(u, y, v, s, s, s, C.woodLight, { ry, vary: 0.08 }); K.box(u, y + s - 0.04, v, s + 0.04, 0.05, s + 0.04, C.wood, { ry }); };
  const lantern = (K, u, y, v) => { K.box(u, y, v, 0.2, 0.28, 0.2, C.lantern); K.box(u, y + 0.28, v, 0.26, 0.06, 0.26, C.iron); K.box(u, y - 0.05, v, 0.24, 0.05, 0.24, C.iron); };
  // a banner hanging flat against a wall that faces +u
  const banner = (K, u, v, yTop, len, w = 0.8) => {
    K.box(u, yTop - len, v, 0.05, len, w, C.banner, { vary: 0.03 });
    K.box(u + 0.01, yTop - len, v, 0.05, 0.22, w, C.gold);
    K.box(u + 0.012, yTop - len * 0.5, v, 0.05, 0.34, 0.34, C.gold, { rx: Math.PI / 4 });
    K.box(u + 0.02, yTop - 0.02, v, 0.1, 0.08, w + 0.2, C.timberDark);
  };
  // the guild's badge on a wall that faces +u: a shield and two crossed blades
  const badge = (K, u, y, v, s = 1) => {
    K.box(u, y - 0.72 * s, v, 0.08, 1.44 * s, 1.24 * s, C.gold);
    K.box(u + 0.03, y - 0.62 * s, v, 0.08, 1.24 * s, 1.04 * s, C.banner);
    K.box(u + 0.02, y - 1.0 * s, v, 0.08, 0.8 * s, 0.8 * s, C.gold, { rx: Math.PI / 4 });
    K.box(u + 0.04, y - 0.92 * s, v, 0.08, 0.64 * s, 0.64 * s, C.banner, { rx: Math.PI / 4 });
    for (const e of [-1, 1]) { K.box(u + 0.08, y - 0.85 * s, v, 0.05, 1.7 * s, 0.1 * s, C.stone, { rx: e * 0.7 }); K.box(u + 0.085, y - 0.47 * s, v + e * 0.32 * s, 0.06, 0.1 * s, 0.4 * s, C.timberDark, { rx: e * 0.7 }); }
  };

  // ------------------------------------------------------------------ the outside of the hall
  const KE = kit(seed + 1);
  {
    const K = KE;
    K.box(0, -2.4, 0, W + 0.5, 2.4 + Y0, D + 0.5, C.stoneDark);             // footing, deep into the ground
    // ground storey: stone, with the two doorways left open
    const wallBox = (axis, at, a0, a1, yb, yt, col, th = T) => { if (a1 - a0 > 0.01) axis === 'u' ? K.box(at, yb, (a0 + a1) / 2, th, yt - yb, a1 - a0, col, { vary: 0.02 }) : K.box((a0 + a1) / 2, yb, at, a1 - a0, yt - yb, th, col, { vary: 0.02 }); };
    const E = W / 2 - T / 2, N = D / 2 - T / 2;
    wallBox('u', E, -D / 2, -DOOR, Y0, Y1, C.stone); wallBox('u', E, DOOR, D / 2, Y0, Y1, C.stone); wallBox('u', E, -DOOR, DOOR, Y0 + 2.7, Y1, C.stone);
    wallBox('u', -E, -D / 2, BACK[0], Y0, Y1, C.stone); wallBox('u', -E, BACK[1], D / 2, Y0, Y1, C.stone); wallBox('u', -E, BACK[0], BACK[1], Y0 + 2.2, Y1, C.stone);
    wallBox('v', -N, -W / 2, W / 2, Y0, Y1, C.stone); wallBox('v', N, -W / 2, W / 2, Y0, Y1, C.stone);
    for (const su of [-1, 1]) for (const sv of [-1, 1]) K.box(su * (W / 2 - 0.1), Y0, sv * (D / 2 - 0.1), 0.62, Y1 - Y0, 0.62, C.stoneDark);      // corner piers
    K.box(0, Y0 + 1.5, 0, W + 0.12, 0.2, D + 0.12, C.stoneDark);            // a string course (the doors cut it: covered by their frames)
    // the front door: a stone frame, a keystone, two steps, lanterns
    for (const e of [-1, 1]) K.box(W / 2 + 0.06, Y0, e * (DOOR + 0.2), 0.34, 2.8, 0.44, C.stoneDark);
    K.box(W / 2 + 0.06, Y0 + 2.7, 0, 0.4, 0.5, DOOR * 2 + 0.9, C.stoneDark);
    K.box(W / 2 + 0.1, Y0 + 2.76, 0, 0.42, 0.56, 0.5, C.stone);
    K.box(W / 2 + 0.55, -0.4, 0, 1.1, 0.4 + Y0, DOOR * 2 + 1.4, C.stone);
    K.box(W / 2 + 1.0, -0.4, 0, 0.9, 0.4 + Y0 * 0.5, DOOR * 2 + 2.0, C.stoneDark);
    for (const e of [-1, 1]) lantern(K, W / 2 + 0.3, Y0 + 2.05, e * (DOOR + 0.72));
    // the door leaves stand open, out over the step (edge on from the front); they go with the outside when she is in
    for (const e of [-1, 1]) {
      K.box(W / 2 + 0.72, Y0, e * (DOOR - 0.05), 1.1, 2.6, 0.08, C.door, { vary: 0.03 });
      for (const y of [0.5, 1.9]) K.box(W / 2 + 0.72, Y0 + y, e * (DOOR - 0.05), 1.0, 0.12, 0.11, C.iron);
      wall(W / 2, e * (DOOR - 0.05), W / 2 + 1.25, e * (DOOR - 0.05), 0.05, OUT);
    }
    K.box(-W / 2 - 0.7, Y0, BACK[0] + 0.05, 1.2, 2.15, 0.07, C.door, { vary: 0.03 }); wall(-W / 2, BACK[0] + 0.05, -W / 2 - 1.3, BACK[0] + 0.05, 0.05, OUT);
    // the back door: a plain frame and a step
    for (const v of BACK) K.box(-W / 2 - 0.05, Y0, v, 0.3, 2.3, 0.26, C.timber);
    K.box(-W / 2 - 0.05, Y0 + 2.2, (BACK[0] + BACK[1]) / 2, 0.3, 0.24, BACK[1] - BACK[0] + 0.5, C.timber);
    K.box(-W / 2 - 0.5, -0.4, (BACK[0] + BACK[1]) / 2, 0.9, 0.4 + Y0 * 0.6, BACK[1] - BACK[0] + 0.6, C.stoneDark);
    // ground windows, banners and the badge over the door
    for (const v of [-3.5, 3.5]) windowOut(K, W / 2, v, Y0 + 1.15, [1, 0], { h: 1.4, shutter: null });
    windowOut(K, -W / 2, -0.6, Y0 + 1.25, [-1, 0], { shutter: null }); windowOut(K, 3.4, D / 2, Y0 + 1.25, [0, 1], { shutter: null });
    windowOut(K, 0.4, D / 2, Y0 + 1.6, [0, 1], { shutter: null, h: 0.9 });
    for (const v of [-2.25, 2.25]) banner(K, W / 2 + 0.06, v, Y1 - 0.25, 2.3);
    // upper storey: plaster in a timber frame
    const E2 = W2 / 2 - 0.25, N2 = D2 / 2 - 0.25;
    wallBox('u', E2, -D2 / 2, D2 / 2, Y1, Y2, C.plaster, 0.5); wallBox('u', -E2, -D2 / 2, D2 / 2, Y1, Y2, C.plaster, 0.5);
    wallBox('v', -N2, -W2 / 2, W2 / 2, Y1, Y2, C.plaster, 0.5); wallBox('v', N2, -W2 / 2, W2 / 2, Y1, Y2, C.plaster, 0.5);
    K.box(0, Y1 - 0.2, 0, W2 + 0.1, 0.24, D2 + 0.1, C.timber);              // the jetty beam
    K.box(0, Y2 - 0.22, 0, W2 + 0.1, 0.22, D2 + 0.1, C.timber);
    for (const su of [-1, 1]) for (const sv of [-1, 1]) K.box(su * (W2 / 2 - 0.02), Y1, sv * (D2 / 2 - 0.02), 0.3, Y2 - Y1, 0.3, C.timber);
    const studs = (axis, at, a0, a1, n, out) => {
      for (let i = 1; i < n; i++) { const a = a0 + (a1 - a0) * i / n; axis === 'u' ? K.box(at + out * 0.03, Y1, a, 0.08, Y2 - Y1, 0.16, C.timber) : K.box(a, Y1, at + out * 0.03, 0.16, Y2 - Y1, 0.08, C.timber); }
      for (const e of [0, 1]) {                                            // a brace in each end bay
        const a = a0 + (a1 - a0) * (e ? 1 - 0.5 / n : 0.5 / n), lean = (e ? -1 : 1) * 0.5 * (axis === 'u' ? -out : out);
        axis === 'u' ? K.box(at + out * 0.035, Y1 + 0.1, a, 0.06, (Y2 - Y1) * 0.98, 0.13, C.timber, { rx: lean }) : K.box(a, Y1 + 0.1, at + out * 0.035, 0.13, (Y2 - Y1) * 0.98, 0.06, C.timber, { rz: lean });
      }
    };
    studs('u', W2 / 2, -D2 / 2, D2 / 2, 6, 1); studs('u', -W2 / 2, -D2 / 2, D2 / 2, 6, -1); studs('v', D2 / 2, -W2 / 2, W2 / 2, 5, 1); studs('v', -D2 / 2, -W2 / 2, W2 / 2, 5, -1);
    for (const v of [-3.95, 3.95]) windowOut(K, W2 / 2, v, Y1 + 0.95, [1, 0], { shutter: C.shutters[1] });
    for (const v of [-3.95, 0, 3.95]) windowOut(K, -W2 / 2, v, Y1 + 0.95, [-1, 0], { shutter: C.shutters[1] });
    for (const u of [-2.8, 0, 2.8]) { windowOut(K, u, -D2 / 2, Y1 + 0.95, [0, -1], { shutter: C.shutters[1] }); windowOut(K, u, D2 / 2, Y1 + 0.95, [0, 1], { shutter: C.shutters[1] }); }
    badge(K, W2 / 2 + 0.05, Y1 + 1.45, 0, 1.0);
    // gables: plaster up to the ridge; the east one has the balcony door in it
    const gable = (su, door) => {
      const u = su * W2 / 2, h = D2 / 2, yr = v => Y2 + RR * (1 - Math.abs(v) / h) - 0.05;
      if (door) {
        K.face([[u, Y2, -h], [u, Y2, -BALC], [u, yr(BALC), -BALC]], C.plaster, 0.02); K.face([[u, Y2, h], [u, Y2, BALC], [u, yr(BALC), BALC]], C.plaster, 0.02);
        K.face([[u, Y2 + BDOOR, -BALC], [u, Y2 + BDOOR, BALC], [u, yr(BALC), BALC], [u, yr(BALC), -BALC]], C.plaster, 0.02);
        K.face([[u, yr(BALC), -BALC], [u, yr(BALC), BALC], [u, yr(0), 0]], C.plaster, 0.02);
        for (const e of [-1, 1]) K.box(u - su * 0.2, Y2, e * (BALC + 0.08), 0.5, 2.2, 0.16, C.timber);
        K.box(u - su * 0.2, Y2 + BDOOR, 0, 0.5, 0.16, BALC * 2 + 0.4, C.timber);
      } else K.face([[u, Y2, -h], [u, Y2, h], [u, yr(0), 0]], C.plaster, 0.02);
      K.box(u + su * 0.03, Y2 + 2.25, 0, 0.08, RR * 0.93 - 2.25, 0.18, C.timber);
      K.box(u + su * 0.03, Y2 + RR * 0.5, 0, 0.08, 0.16, D2 * 0.5, C.timber);
      for (const e of [-1, 1]) K.box(u + su * 0.03, Y2, e * h * 0.5, 0.08, RR * 0.48, 0.14, C.timber);
      K.cyl(u + su * 0.05, Y2 + RR * 0.62, 0, 0.42, 0.42, 0.08, 10, C.glass, { rz: Math.PI / 2 });      // a round window under the ridge
      K.cyl(u + su * 0.03, Y2 + RR * 0.62 - 0.07, 0, 0.5, 0.5, 0.08, 10, C.timber, { rz: Math.PI / 2 });
    };
    gable(1, true); gable(-1, false);
    windowOut(K, -W2 / 2, 0, Y2 + 0.7, [-1, 0], { shutter: null, w: 1.1, h: 1.3 });
    // the roof: two tiled slopes with courses of darker tiles, a ridge, a little turret with the guild's flag
    {
      const a = Math.atan2(RR, D2 / 2), over = 0.7, len = (D2 / 2 + over) / Math.cos(a), top = Y2, L = W2 + 1.2;
      for (const s of [1, -1]) {
        const zc = s * len / 2 * Math.cos(a), yc = top + RR - len / 2 * Math.sin(a);
        K.box(0, yc - 0.1 + 0.12, zc, L, 0.22, len, C.roof, { rx: s * a, vary: 0.03 });
        for (const f of [0.2, 0.47, 0.74]) K.box(0, top + RR - f * len * Math.sin(a) + 0.2, s * f * len * Math.cos(a), L + 0.04, 0.1, 0.5, C.roofDark, { rx: s * a });      // courses of darker tiles
        K.box(0, top - 0.42, s * (D2 / 2 + over - 0.1), L, 0.16, 0.2, C.timberDark);       // the eaves board
      }
      K.box(0, top + RR + 0.04, 0, L + 0.1, 0.2, 0.56, C.roofDark);
      K.box(0, top + RR - 0.5, 0, 1.5, 1.9, 1.5, C.plaster);
      for (const su of [-1, 1]) for (const sv of [-1, 1]) K.box(su * 0.72, top + RR - 0.5, sv * 0.72, 0.16, 1.9, 0.16, C.timber);
      for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) K.box(du * 0.76, top + RR + 0.55, dv * 0.76, du ? 0.06 : 0.6, 0.6, du ? 0.6 : 0.06, C.glass);
      K.cyl(0, top + RR + 1.4, 0, 1.35, 0.04, 2.2, 4, C.roofDark, { ry: Math.PI / 4, vary: 0.03 });
      K.cyl(0, top + RR + 3.5, 0, 0.05, 0.05, 2.4, 5, C.timberDark);
      K.box(0.62, top + RR + 5.1, 0, 1.15, 0.7, 0.04, C.banner); K.box(0.62, top + RR + 5.35, 0, 1.15, 0.14, 0.05, C.gold);
      // the chimney of the hall's fireplace, up the south wall
      K.box(-3.1, 0, D / 2 + 0.3, 1.5, Y1 + 0.2, 0.75, C.stone); K.box(-3.1, Y1 + 0.2, D / 2 + 0.36, 1.1, Y2 - Y1 + 2.9, 0.62, C.stone, { vary: 0.03 });
      K.box(-3.1, Y2 + 2.9, D / 2 + 0.36, 1.3, 0.2, 0.82, C.stoneDark);
    }
  }
  // the balcony over the door (drawn from outside, and when she is up in the attic)
  const KB = kit(seed + 2);
  {
    const K = KB, { u0, u1, v } = BALCONY;
    K.box((u0 + u1) / 2, Y2 - 0.16, 0, u1 - u0 + 0.1, 0.16, v * 2 + 0.1, C.woodLight);
    for (const e of [-1, 1]) { K.box(u0 + 0.45, Y2 - 1.0, e * (v - 0.25), 0.14, 1.15, 0.14, C.timber, { rz: -0.75 }); K.box(u0 + 0.06, Y2 - 1.1, e * (v - 0.25), 0.14, 0.95, 0.14, C.timber); }
    rail(K, u1 - 0.05, -v, u1 - 0.05, v, Y2, S2); rail(K, u0, -v, u1 - 0.05, -v, Y2, S2); rail(K, u0, v, u1 - 0.05, v, Y2, S2);
    K.cyl(u1 - 0.35, Y2, v - 0.4, 0.03, 0.03, 1.1, 5, C.iron); K.cyl(u1 - 0.3, Y2 + 1.1, v - 0.4, 0.07, 0.05, 0.6, 7, C.gold, { rz: -1.25 });      // a spyglass on a stand
  }

  // ------------------------------------------------------------------ the rooms
  const KW = kit(seed + 3);                                                // the inner faces of the walls (always there, seen from inside)
  const KF = [kit(seed + 4), kit(seed + 5), kit(seed + 6)];                // each storey: its floor, stairs, rails and furniture
  const KC = [kit(seed + 7), kit(seed + 8), kit(seed + 9)];                // the ceiling over each storey
  // what hangs on or stands against each wall (windows, lamps, shelves, the board): put away with its wall when the eye is behind it
  const KD = { E: kit(seed + 11), W: kit(seed + 12), N: kit(seed + 13), S: kit(seed + 14) };
  {
    // inner walls of the hall and the gallery
    innerWall(KW, 'u', IU - 0.02, -IV, IV, Y0, Y1, [-1, 0, 0], { holes: [[-DOOR, DOOR, 2.7]] });
    innerWall(KW, 'u', -IU + 0.02, -IV, IV, Y0, Y1, [1, 0, 0], { holes: [[BACK[0], BACK[1], 2.2]] });
    innerWall(KW, 'v', -IV + 0.02, -IU, IU, Y0, Y1, [0, 0, 1]); innerWall(KW, 'v', IV - 0.02, -IU, IU, Y0, Y1, [0, 0, -1]);
    const up = { low: C.wood, high: C.plaster, dado: 0.9 };
    innerWall(KW, 'u', IU - 0.02, -IV, IV, Y1, Y2, [-1, 0, 0], up); innerWall(KW, 'u', -IU + 0.02, -IV, IV, Y1, Y2, [1, 0, 0], up);
    innerWall(KW, 'v', -IV + 0.02, -IU, IU, Y1, Y2, [0, 0, 1], up); innerWall(KW, 'v', IV - 0.02, -IU, IU, Y1, Y2, [0, 0, -1], up);
    // the attic: low side walls, and the two gable ends up to the ridge
    const kneeTop = roofY(KNEE) - 0.2;
    for (const s of [-1, 1]) innerWall(KW, 'v', s * KNEE, -IU, IU, Y2, kneeTop, [0, 0, -s], { low: C.wood, high: C.plaster, dado: 0.8 });
    const end = (u, facing, door) => {
      const yr = v => roofY(v) - 0.2;
      if (door) {
        innerWall(KW, 'u', u, -KNEE, KNEE, Y2, kneeTop, facing, { holes: [[-BALC, BALC, BDOOR]], low: C.wood, high: C.plaster, dado: 0.8 });
      } else innerWall(KW, 'u', u, -KNEE, KNEE, Y2, kneeTop, facing, { low: C.wood, high: C.plaster, dado: 0.8 });
      face(KW, [[u, kneeTop, -KNEE], [u, kneeTop, KNEE], [u, yr(0), 0]], C.plaster, facing, 0.015);
    };
    end(IU - 0.02, [-1, 0, 0], true); end(-IU + 0.02, [1, 0, 0], false);
    // door leaves, swung open against the wall
    // windows seen from inside
    for (const v of [-3.5, 3.5]) windowIn(KD.E, IU - 0.02, v, Y0 + 1.15, [-1, 0], { h: 1.4 });
    windowIn(KD.W, -IU + 0.02, -0.6, Y0 + 1.25, [1, 0]); windowIn(KD.S, 3.4, IV - 0.02, Y0 + 1.25, [0, -1]);
    for (const v of [-3.95, 3.95]) windowIn(KD.E, IU - 0.02, v, Y1 + 0.95, [-1, 0]);
    for (const v of [-3.95, 0, 3.95]) windowIn(KD.W, -IU + 0.02, v, Y1 + 0.95, [1, 0]);
    for (const u of [-2.8, 0, 2.8]) windowIn(KD.N, u, -IV + 0.02, Y1 + 0.95, [0, 1]);
    windowIn(KD.W, -IU + 0.02, 0, Y2 + 0.7, [1, 0], { w: 1.1, h: 1.3 });
    KD.E.cyl(IU - 0.04, Y2 + RR * 0.62 - 0.07, 0, 0.42, 0.42, 0.04, 10, C.pane, { rz: Math.PI / 2 }); KD.W.cyl(-IU + 0.04, Y2 + RR * 0.62 - 0.07, 0, 0.42, 0.42, 0.04, 10, C.pane, { rz: Math.PI / 2 });
  }
  // walls she cannot walk through (the doorways are the gaps)
  {
    const E = W / 2 - 0.15, N = D / 2 - 0.15;
    wall(E, -D / 2, E, -DOOR, 0.15, OUT | S0); wall(E, DOOR, E, D / 2, 0.15, OUT | S0); wall(E, -D / 2, E, D / 2, 0.15, S1);
    wall(-E, -D / 2, -E, BACK[0], 0.15, OUT | S0); wall(-E, BACK[1], -E, D / 2, 0.15, OUT | S0); wall(-E, -D / 2, -E, D / 2, 0.15, S1);
    wall(-W / 2, -N, W / 2, -N, 0.15, OUT | S0 | S1); wall(-W / 2, N, W / 2, N, 0.15, OUT | S0 | S1);
    for (const s of [-1, 1]) wall(-W / 2, s * KNEE, W / 2, s * KNEE, 0.12, S2);
    wall(E, -KNEE, E, -BALC, 0.15, S2); wall(E, BALC, E, KNEE, 0.15, S2); wall(-E, -KNEE, -E, KNEE, 0.15, S2);
  }
  // ---- the hall (ground floor)
  {
    const K = KF[0], A = STAIR_A;
    boards(K, -IU, IU, -IV, IV, Y0);
    face(K, [[-1.9, Y0 + 0.012, -0.75], [IU - 0.3, Y0 + 0.012, -0.75], [IU - 0.3, Y0 + 0.012, 0.75], [-1.9, Y0 + 0.012, 0.75]], C.carpet, [0, 1, 0], 0.02);      // a runner from the door to the desk
    for (const s of [-1, 1]) face(K, [[-1.9, Y0 + 0.016, s * 0.75], [IU - 0.3, Y0 + 0.016, s * 0.75], [IU - 0.3, Y0 + 0.016, s * 0.62], [-1.9, Y0 + 0.016, s * 0.62]], C.gold, [0, 1, 0], 0.02);
    // the stair up to the gallery: solid steps, a rail on the open side
    const run = (A.u0 - A.u1) / A.n, rise = (Y1 - Y0) / A.n, vm = (A.v0 + A.v1) / 2;
    for (let i = 0; i < A.n; i++) K.box(A.u0 - (i + 0.5) * run, Y0, vm, run + 0.01, (i + 1) * rise, A.v1 - A.v0, i % 2 ? C.woodLight : C.floor, { vary: 0.04 });
    {
      const len = Math.hypot(A.u0 - A.u1, Y1 - Y0), um = (A.u0 + A.u1) / 2, rz = -Math.atan2(Y1 - Y0, A.u0 - A.u1);
      K.box(um, (Y0 + Y1) / 2 + 0.95, A.v1, len, 0.09, 0.13, C.wood, { rz }); K.box(um, (Y0 + Y1) / 2 + 0.45, A.v1, len, 0.06, 0.06, C.wood, { rz });
      for (let i = 0; i <= 5; i++) { const f = i / 5; K.box(A.u0 - (A.u0 - A.u1) * f, Y0 + (Y1 - Y0) * f, A.v1, 0.1, 1.0, 0.1, C.woodDark); }
      K.box(um, Y0, A.v1 - 0.03, A.u0 - A.u1, 0.02, 0.04, C.woodDark);
      wall(A.u1, A.v1, A.u0, A.v1, 0.06, S0 | S1);                         // the rail
      wall(A.u1, A.v0, A.u1, A.v1, 0.06, S0);                              // no way in under the top of the stair
    }
    // posts under the gallery, at the corners of the opening
    for (const u of [ATRIUM.u0, ATRIUM.u1]) for (const v of [ATRIUM.v0, ATRIUM.v1]) { K.box(u, Y0, v, 0.26, Y1 - Y0 - 0.25, 0.26, C.timber); K.box(u, Y0, v, 0.4, 0.3, 0.4, C.stoneDark); round(u, v, 0.18, S0); }
    // the reception desk, across the west end: a long counter, ledgers and a bell on it, pigeonholes behind
    K.box(-2.5, Y0, -0.95, 0.62, 1.0, 3.7, C.wood, { vary: 0.03 }); K.box(-2.5, Y0 + 1.0, -0.95, 0.78, 0.08, 3.86, C.woodLight);
    K.box(-3.35, Y0, 0.9, 1.7, 1.0, 0.56, C.wood, { vary: 0.03 }); K.box(-3.35, Y0 + 1.0, 0.9, 1.78, 0.08, 0.7, C.woodLight);
    K.box(-2.2, Y0 + 0.02, -0.95, 0.06, 0.82, 3.5, C.woodDark);
    K.cyl(-2.5, Y0 + 1.08, 0.2, 0.09, 0.03, 0.09, 8, C.gold); K.box(-2.5, Y0 + 1.08, -1.0, 0.36, 0.05, 0.5, C.paper, { ry: 0.2 }); K.box(-2.52, Y0 + 1.08, -2.1, 0.4, 0.09, 0.3, C.books[1], { ry: -0.3 });
    K.box(-2.45, Y0 + 1.08, -1.6, 0.3, 0.03, 0.4, C.paperOld, { ry: -0.1 });
    wall(-2.5, -2.8, -2.5, 0.9, 0.34, S0); wall(-2.5, 0.9, -IU, 0.9, 0.3, S0);
    shelves(KD.W, 'v', -3.0, -1.2, -IU + 0.02, 1, Y0, { h: 2.2, goods: [C.paper, C.paperOld, C.books[5], C.books[1]] });
    shelves(KD.W, 'v', -0.1, 0.6, -IU + 0.02, 1, Y0, { h: 1.2, goods: [C.paper, C.paperOld] });
    // the shop, in the corner behind the stair: a counter, shelves of goods
    K.box(-2.8, Y0, -3.3, 2.8, 0.95, 0.6, C.woodLight, { vary: 0.03 }); K.box(-2.8, Y0 + 0.95, -3.3, 2.9, 0.08, 0.74, C.wood);
    for (let i = 0; i < 5; i++) K.cyl(-3.8 + i * 0.42, Y0 + 1.03, -3.25 + (i % 2) * 0.12, 0.07, 0.09, 0.2 + (i % 3) * 0.05, 6, C.potions[i]);
    K.box(-1.9, Y0 + 1.03, -3.3, 0.34, 0.2, 0.3, C.gold, { ry: 0.3 });
    wall(-IU, -3.3, -1.4, -3.3, 0.32, S0);
    shelves(KD.N, 'u', -IU + 0.05, -1.55, -IV + 0.02, 1, Y0, { h: 2.3, goods: [...C.potions, C.goods[0], C.goods[3]] });
    K.box(-1.52, Y0 + 2.3, -3.3, 0.06, 0.5, 0.5, C.gold, { rx: Math.PI / 4 });      // the shop's sign over its counter: a coin
    K.box(-1.52, Y0 + 2.8, -3.3, 0.04, Y1 - Y0 - 3.05, 0.04, C.iron);
    // the quest board on the south wall
    {
      const b0 = -1.0, b1 = 2.7, yb = Y0 + 0.85, yt = Y0 + 2.85, v = IV - 0.06, K = KD.S;
      K.box((b0 + b1) / 2, yb, v, b1 - b0, yt - yb, 0.07, C.cork);
      K.box((b0 + b1) / 2, yt, v - 0.02, b1 - b0 + 0.3, 0.16, 0.14, C.woodDark); K.box((b0 + b1) / 2, yb - 0.14, v - 0.02, b1 - b0 + 0.3, 0.14, 0.14, C.woodDark);
      for (const u of [b0 - 0.08, b1 + 0.08]) K.box(u, Y0, v - 0.02, 0.16, yt - Y0 + 0.16, 0.14, C.woodDark);
      K.box((b0 + b1) / 2, yt + 0.2, v - 0.03, 1.5, 0.34, 0.06, C.banner); K.box((b0 + b1) / 2, yt + 0.3, v - 0.05, 1.2, 0.08, 0.05, C.gold);
      for (let row = 0; row < 3; row++) for (let u = b0 + 0.3; u < b1 - 0.25;) {
        const w = 0.3 + rng() * 0.18, h = 0.36 + rng() * 0.16, y = yb + 0.1 + row * 0.63 + rng() * 0.08;
        if (rng() < 0.85) {
          K.box(u + w / 2 - 0.15, y, v - 0.045, w, h, 0.02, rng() < 0.3 ? C.paperOld : C.paper, { rz: (rng() - 0.5) * 0.16, vary: 0.03 });
          if (rng() < 0.45) K.box(u + w / 2 - 0.15, y + 0.03, v - 0.06, 0.09, 0.09, 0.02, C.carpet);
          else K.box(u + w / 2 - 0.15, y + h - 0.07, v - 0.06, 0.04, 0.04, 0.03, C.iron);
        }
        u += w + 0.07;
      }
    }
    // the hearth in the south-west corner
    KD.S.box(-3.1, Y0, IV - 0.3, 1.9, 1.7, 0.6, C.stone, { vary: 0.03 }); KD.S.box(-3.1, Y0 + 1.7, IV - 0.34, 2.2, 0.16, 0.74, C.stoneDark); KD.S.box(-3.1, Y0 + 1.86, IV - 0.22, 1.5, Y1 - Y0 - 2.1, 0.44, C.stone);
    KD.S.box(-3.1, Y0 + 0.02, IV - 0.56, 1.1, 1.05, 0.12, C.soot); KD.S.box(-3.1, Y0 + 0.02, IV - 0.6, 0.7, 0.34, 0.1, C.fire); KD.S.box(-3.05, Y0 + 0.02, IV - 0.63, 0.34, 0.5, 0.08, C.fireHot);
    KD.S.box(-3.1, Y0, IV - 0.85, 1.6, 0.08, 0.5, C.stoneDark);
    wall(-4.0, IV - 0.4, -2.2, IV - 0.4, 0.4, S0);
    // tables, a long one under the north gallery with benches
    table(K, 0.5, 2.2, Y0, { on: S0 }); table(K, 3.25, 3.2, Y0, { r: 0.52, on: S0 });
    K.box(0.3, Y0 + 0.7, -2.0, 2.4, 0.08, 0.85, C.woodLight); for (const e of [-1, 1]) { K.box(0.3 + e * 0.95, Y0, -2.0, 0.12, 0.7, 0.7, C.woodDark); K.box(0.3, Y0, -2.0 + e * 0.72, 2.2, 0.42, 0.3, C.wood); }
    K.cyl(0.0, Y0 + 0.78, -2.05, 0.07, 0.06, 0.14, 6, C.gold); K.cyl(0.8, Y0 + 0.78, -1.9, 0.16, 0.16, 0.02, 8, C.paper); K.box(-0.5, Y0 + 0.78, -2.0, 0.34, 0.03, 0.26, C.paperOld, { ry: 0.4 });
    wall(-0.75, -2.0, 1.35, -2.0, 0.8, S0);
    barrel(K, 3.75, 4.85, Y0); barrel(K, 3.2, 4.95, Y0, 0.85); crate(K, 3.75, 4.2, Y0, 0.55, 0.2); round(3.6, 4.75, 0.62, S0);
    for (const v of [-2.3, 2.3]) lantern(KD.E, IU - 0.12, Y0 + 2.1, v);
    lantern(KD.N, -0.2, Y0 + 2.3, -IV + 0.12); for (const u of [-1.9, 3.3]) lantern(KD.S, u, Y0 + 2.3, IV - 0.12);
    // the ceiling: the underside of the gallery
    const Kc = KC[0], yc = Y1 - 0.25;
    ceiling(Kc, -IU, A.u1, -IV, A.v1, yc); ceiling(Kc, -IU, IU, A.v1, ATRIUM.v0, yc); ceiling(Kc, -IU, ATRIUM.u0, ATRIUM.v0, ATRIUM.v1, yc);
    ceiling(Kc, ATRIUM.u1, IU, ATRIUM.v0, ATRIUM.v1, yc); ceiling(Kc, -IU, IU, ATRIUM.v1, IV, yc);
  }
  // ---- the gallery (first floor): a walk round the opening, books along the south wall, the stair on to the attic
  {
    const K = KF[1], A = STAIR_A, B = STAIR_B, O = ATRIUM;
    boards(K, -IU, A.u1, -IV, A.v1, Y1); boards(K, -IU, IU, A.v1, O.v0, Y1); boards(K, -IU, O.u0, O.v0, O.v1, Y1); boards(K, O.u1, IU, O.v0, O.v1, Y1); boards(K, -IU, IU, O.v1, IV, Y1);
    // the edge of the floor round the opening and the stairwell
    const edge = (u1, v1, u2, v2) => K.box((u1 + u2) / 2, Y1 - 0.25, (v1 + v2) / 2, Math.abs(u2 - u1) + 0.1, 0.25, Math.abs(v2 - v1) + 0.1, C.timber);
    edge(O.u0, O.v0, O.u1, O.v0); edge(O.u0, O.v1, O.u1, O.v1); edge(O.u0, O.v0, O.u0, O.v1); edge(O.u1, O.v0, O.u1, O.v1); edge(A.u1, A.v1, IU, A.v1); edge(A.u1, A.v0, A.u1, A.v1);
    rail(K, O.u0, O.v0, O.u1, O.v0, Y1, S1); rail(K, O.u0, O.v1, O.u1, O.v1, Y1, S1); rail(K, O.u0, O.v0, O.u0, O.v1, Y1, S1); rail(K, O.u1, O.v0, O.u1, O.v1, Y1, S1);
    rail(K, A.u0, A.v1, IU, A.v1, Y1, S1);                                 // the last of the stairwell, by the east wall
    for (const u of [O.u0, O.u1]) for (const v of [O.v0, O.v1]) K.box(u, Y1, v, 0.22, Y2 - Y1 - 0.25, 0.22, C.timber);
    // the stair up to the attic
    const run = (B.v1 - B.v0) / B.n, rise = (Y2 - Y1) / B.n, um = (B.u0 + B.u1) / 2;
    for (let i = 0; i < B.n; i++) K.box(um, Y1, B.v0 + (i + 0.5) * run, B.u1 - B.u0, (i + 1) * rise, run + 0.01, i % 2 ? C.woodLight : C.floor, { vary: 0.04 });
    {
      const len = Math.hypot(B.v1 - B.v0, Y2 - Y1), vm = (B.v0 + B.v1) / 2, rx = -Math.atan2(Y2 - Y1, B.v1 - B.v0);
      K.box(B.u1, (Y1 + Y2) / 2 + 0.95, vm, 0.13, 0.09, len, C.wood, { rx }); K.box(B.u1, (Y1 + Y2) / 2 + 0.45, vm, 0.06, 0.06, len, C.wood, { rx });
      for (let i = 0; i <= 4; i++) { const f = i / 4; K.box(B.u1, Y1 + (Y2 - Y1) * f, B.v0 + (B.v1 - B.v0) * f, 0.1, 1.0, 0.1, C.woodDark); }
      wall(B.u1, B.v0, B.u1, B.v1, 0.06, S1 | S2);
      wall(B.u0, B.v1, B.u1, B.v1, 0.06, S1);                              // no way in under its top
    }
    // books along the south wall, a desk in the corner, a bench under the east windows, a suit of armour
    shelves(KD.S, 'u', -3.2, 3.0, IV - 0.02, -1, Y1, { h: 2.1 }); wall(-3.2, IV - 0.2, 3.0, IV - 0.2, 0.22, S1);
    K.box(3.6, Y1 + 0.72, 4.6, 0.9, 0.07, 1.2, C.woodLight); for (const e of [-1, 1]) K.box(3.6, Y1, 4.6 + e * 0.5, 0.8, 0.72, 0.08, C.woodDark);
    K.box(3.55, Y1 + 0.79, 4.5, 0.5, 0.03, 0.7, C.paperOld, { ry: 0.15 }); K.cyl(3.8, Y1 + 0.79, 5.0, 0.05, 0.05, 0.22, 6, C.lantern); round(3.6, 4.6, 0.6, S1);
    K.box(IU - 0.3, Y1 + 0.42, 0, 0.45, 0.07, 2.6, C.wood); for (const e of [-1, 1]) K.box(IU - 0.3, Y1, e * 1.1, 0.4, 0.42, 0.1, C.woodDark); wall(IU - 0.3, -1.3, IU - 0.3, 1.3, 0.22, S1);
    {                                                                      // armour on a stand
      const u = -3.6, v = 4.3;
      K.cyl(u, Y1, v, 0.3, 0.3, 0.06, 8, C.woodDark); K.cyl(u, Y1, v, 0.04, 0.04, 1.5, 5, C.woodDark);
      K.cyl(u, Y1 + 0.85, v, 0.2, 0.26, 0.55, 8, C.iron, { vary: 0.03 }); K.cyl(u, Y1 + 1.45, v, 0.14, 0.15, 0.24, 8, C.iron); K.box(u, Y1 + 1.3, v, 0.72, 0.12, 0.2, C.iron);
      K.cyl(u, Y1 + 1.69, v, 0.02, 0.06, 0.2, 5, C.carpet); round(u, v, 0.38, S1);
    }
    for (const [u, v] of [[-2.2, -IV + 0.06], [1.6, -IV + 0.06]]) {         // shields hung on the north wall
      KD.N.cyl(u, Y1 + 1.5, v, 0.36, 0.36, 0.06, 10, pick([C.banner, C.carpet]), { rx: Math.PI / 2 }); KD.N.cyl(u, Y1 + 1.5, v + 0.02, 0.12, 0.12, 0.08, 8, C.gold, { rx: Math.PI / 2 });
    }
    for (const v of [-2.6, 2.6]) lantern(KD.E, IU - 0.12, Y1 + 1.9, v);
    lantern(KD.W, -IU + 0.12, Y1 + 1.9, -4.3);
    // the ceiling: the underside of the attic floor (all of the storey; the stair comes up through it)
    const Kc = KC[1], yc = Y2 - 0.25;
    ceiling(Kc, -IU, IU, -IV, B.v0, yc); ceiling(Kc, B.u1, IU, B.v0, B.v1, yc); ceiling(Kc, -IU, IU, B.v1, IV, yc);
  }
  // ---- the attic (second floor): the guild master's room, and the door out to the balcony
  {
    const K = KF[2], B = STAIR_B;
    boards(K, -IU, IU, -KNEE, B.v0, Y2); boards(K, B.u1, IU, B.v0, B.v1, Y2); boards(K, -IU, IU, B.v1, KNEE, Y2);
    boards(K, IU, BALCONY.u0, -BALC, BALC, Y2);                            // the sill of the balcony door
    K.box((B.u0 + B.u1) / 2, Y2 - 0.25, B.v0, B.u1 - B.u0, 0.25, 0.1, C.timber); K.box(B.u1, Y2 - 0.25, (B.v0 + B.v1) / 2, 0.1, 0.25, B.v1 - B.v0, C.timber);
    rail(K, B.u0, B.v0, B.u1, B.v0, Y2, S2);                               // round the stairwell
    K.cyl(1.2, Y2 + 0.012, 0.3, 1.7, 1.7, 0.02, 20, C.carpet); K.cyl(1.2, Y2 + 0.016, 0.3, 1.35, 1.35, 0.02, 20, C.bannerDark);
    // the master's desk and chair by the north wall, books behind
    K.box(1.4, Y2 + 0.74, -2.1, 1.9, 0.08, 0.85, C.woodDark); for (const e of [-1, 1]) K.box(1.4 + e * 0.8, Y2, -2.1, 0.1, 0.74, 0.75, C.wood); K.box(1.4, Y2 + 0.1, -1.72, 1.6, 0.6, 0.05, C.wood);
    K.box(1.1, Y2 + 0.82, -2.05, 0.5, 0.03, 0.36, C.paper, { ry: 0.2 }); K.box(1.9, Y2 + 0.82, -2.2, 0.3, 0.1, 0.24, C.books[0], { ry: -0.3 }); K.cyl(0.7, Y2 + 0.82, -2.3, 0.05, 0.05, 0.24, 6, C.lantern);
    K.box(1.4, Y2, -2.85, 0.6, 0.5, 0.55, C.wood); K.box(1.4, Y2 + 0.5, -3.08, 0.6, 0.75, 0.08, C.carpet);
    wall(0.5, -2.2, 2.3, -2.2, 0.45, S2); round(1.4, -2.85, 0.4, S2);
    shelves(KD.N, 'u', -2.6, -0.2, -KNEE + 0.02, 1, Y2, { h: 1.7 }); wall(-2.6, -KNEE + 0.2, -0.2, -KNEE + 0.2, 0.22, S2);
    // a chest, a globe, a map on the wall, a trophy over the west window
    K.box(3.3, Y2, 2.55, 1.1, 0.5, 0.7, C.wood, { vary: 0.03 }); K.box(3.3, Y2 + 0.5, 2.55, 1.14, 0.22, 0.74, C.woodDark); K.box(3.3, Y2 + 0.36, 2.19, 0.16, 0.2, 0.04, C.gold);
    for (const e of [-1, 1]) K.box(3.3 + e * 0.4, Y2, 2.55, 0.08, 0.74, 0.76, C.iron); round(3.3, 2.55, 0.62, S2);
    K.cyl(3.5, Y2, -2.6, 0.22, 0.26, 0.5, 7, C.woodDark); K.cyl(3.5, Y2 + 0.52, -2.6, 0.26, 0.26, 0.5, 9, C.banner, { vary: 0.03 }); K.cyl(3.5, Y2 + 0.52, -2.6, 0.02, 0.02, 0.62, 4, C.gold, { rz: 0.4 }); round(3.5, -2.6, 0.36, S2);
    KD.S.box(0.4, Y2 + 0.95, KNEE - 0.05, 1.7, 1.0, 0.04, C.paperOld); KD.S.box(0.4, Y2 + 0.9, KNEE - 0.07, 1.82, 0.06, 0.05, C.woodDark); KD.S.box(0.4, Y2 + 1.95, KNEE - 0.07, 1.82, 0.06, 0.05, C.woodDark);
    KD.S.box(0.1, Y2 + 1.3, KNEE - 0.08, 0.5, 0.3, 0.02, C.shutters[0], { rz: 0.3 }); KD.S.box(0.9, Y2 + 1.5, KNEE - 0.08, 0.36, 0.22, 0.02, C.water, { rz: -0.2 });
    for (const e of [-1, 1]) lantern(KD.E, IU - 0.14, Y2 + 1.75, e * 1.35);
    // the ceiling: the roof's underside between the side walls, and the rafters
    const Kc = KC[2];
    for (const s of [-1, 1]) {
      face(Kc, [[-IU, roofY(KNEE) - 0.2, s * KNEE], [IU, roofY(KNEE) - 0.2, s * KNEE], [IU, roofY(0) - 0.2, 0], [-IU, roofY(0) - 0.2, 0]], C.woodLight, [0, -1, s * 0.5], 0.03);
      const a = Math.atan2(RR, D2 / 2), len = KNEE / Math.cos(a);
      for (let u = -3.4; u <= 3.5; u += 1.7) Kc.box(u, (roofY(KNEE) + roofY(0)) / 2 - 0.36, s * KNEE / 2, 0.14, 0.16, len, C.wood, { rx: s * a });
    }
    Kc.box(0, roofY(0) - 0.42, 0, IU * 2, 0.2, 0.2, C.woodDark);
  }

  // ------------------------------------------------------------------ out of doors: the steps, the ring, the training yard
  const KY = kit(seed + 10);
  const steps = (() => {                                                   // the stone steps up from the terrace (the land under them is a steep ramp)
    const S = GUILD_SITE.steps, u0 = S.x0 - HX, u1 = S.x1 - HX, yb = heightAt(S.x1, S.z) - padY, n = Math.max(3, Math.round(-yb / 0.19)), rise = -yb / n, run = (u1 - u0) / n;
    return { u0, u1, yb, n, rise, run, half: S.half };
  })();
  {
    const K = KY, S = steps;
    for (let i = 0; i < S.n; i++) K.box(S.u0 + (i + 0.5) * S.run, -i * S.rise - 1.6, 0, S.run + 0.01, 1.6, S.half * 2, i % 2 ? C.stone : C.stoneDark, { vary: 0.03 });
    for (const e of [-1, 1]) {                                             // low walls either side, stepping down with the stair
      for (let i = 0; i < S.n; i += 3) { const m = Math.min(3, S.n - i); K.box(S.u0 + (i + m / 2) * S.run, -(i + m - 1) * S.rise - 1.8, e * (S.half + 0.22), m * S.run + 0.02, 1.8 + 0.55 + (m - 1) * S.rise, 0.44, C.stone, { vary: 0.03 }); K.box(S.u0 + (i + m / 2) * S.run, 0.55 - i * S.rise, e * (S.half + 0.22), m * S.run + 0.08, 0.1, 0.54, C.stoneDark); }
      // a lamp post at the top, either side
      const u = S.u0 - 0.55, v = e * (S.half + 0.35);
      K.box(u, -0.3, v, 0.5, 0.95, 0.5, C.stone); K.cyl(u, 0.65, v, 0.07, 0.06, 2.0, 6, C.timberDark); K.box(u - 0.28, 2.5, v, 0.6, 0.07, 0.07, C.timberDark); lantern(K, u - 0.5, 2.14, v);
      solidOut(u, v, 0.38);
      banner(K, u + 0.04, v, 2.5, 1.5, 0.5);
    }
    // by the door: benches under the windows, a stack of crates and barrels, the guild's sign on a post
    for (const v of [-3.5, 3.5]) { K.box(W / 2 + 0.75, 0.42, v, 0.5, 0.08, 1.7, C.wood); for (const e of [-1, 1]) K.box(W / 2 + 0.75, 0, v + e * 0.7, 0.44, 0.42, 0.1, C.woodDark); solidOut(W / 2 + 0.75, v - 0.45, 0.4); solidOut(W / 2 + 0.75, v + 0.45, 0.4); }
    barrel(K, W / 2 + 0.6, 5.15, 0); barrel(K, W / 2 + 1.25, 5.3, 0, 0.9); crate(K, W / 2 + 0.7, 5.15, 0.8, 0.5, 0.3); solidOut(W / 2 + 0.9, 5.2, 0.7);
    {
      const u = 7.1, v = -3.0;
      K.box(u, 0, v, 0.2, 3.1, 0.2, C.timberDark); K.box(u, 2.75, v + 0.55, 0.1, 0.1, 1.2, C.timberDark); K.box(u, 2.3, v + 0.3, 0.08, 0.08, 0.7, C.timberDark, { rx: 0.8 });
      K.box(u, 1.55, v + 0.7, 0.08, 1.1, 0.95, C.woodLight); badge(K, u + 0.06, 2.1, v + 0.7, 0.62); solidOut(u, v, 0.25);
    }
    // ---- the duelling ring: sand inside a low kerb of stones, two gates with posts and pennants
    const R = GUILD_SITE.arena, cu = R.x - HX, cv = R.z - HZ, gates = [Math.PI / 2, -Math.PI / 4];
    const fan = (r, y, col, vary) => { for (let i = 0; i < 40; i++) { const a0 = i / 40 * 6.2832, a1 = (i + 1) / 40 * 6.2832; face(K, [[cu, y, cv], [cu + Math.cos(a0) * r, y, cv + Math.sin(a0) * r], [cu + Math.cos(a1) * r, y, cv + Math.sin(a1) * r]], col, [0, 1, 0], vary); } };
    const ring = (r0, r1, y, col) => { for (let i = 0; i < 40; i++) { const a0 = i / 40 * 6.2832, a1 = (i + 1) / 40 * 6.2832; face(K, [[cu + Math.cos(a0) * r0, y, cv + Math.sin(a0) * r0], [cu + Math.cos(a0) * r1, y, cv + Math.sin(a0) * r1], [cu + Math.cos(a1) * r1, y, cv + Math.sin(a1) * r1], [cu + Math.cos(a1) * r0, y, cv + Math.sin(a1) * r0]], col, [0, 1, 0], 0); } };
    fan(R.r - 0.3, 0.03, C.sand, 0.012); ring(2.1, 2.22, 0.04, C.sandMark); ring(R.r - 0.75, R.r - 0.66, 0.04, C.sandMark);
    for (const e of [-1, 1]) face(K, [[cu + e * 0.55 - 0.06, 0.04, cv - 0.5], [cu + e * 0.55 + 0.06, 0.04, cv - 0.5], [cu + e * 0.55 + 0.06, 0.04, cv + 0.5], [cu + e * 0.55 - 0.06, 0.04, cv + 0.5]], C.sandMark, [0, 1, 0], 0);
    const NK = 34;
    for (let i = 0; i < NK; i++) {
      const a = i / NK * 6.2832, gate = gates.some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.25);
      if (gate) continue;
      const u = cu + Math.cos(a) * R.r, v = cv + Math.sin(a) * R.r;
      K.box(u, -0.5, v, 0.93, 1.15 + (i % 3 === 0 ? 0.12 : 0), 0.46, i % 2 ? C.stone : C.stoneDark, { ry: -a + Math.PI / 2, vary: 0.04 });
      solidOut(u, v, 0.4);
    }
    for (const g of gates) for (const e of [-1, 1]) {
      const a = g + e * 0.25, u = cu + Math.cos(a) * R.r, v = cv + Math.sin(a) * R.r;
      K.box(u, -0.5, v, 0.56, 2.2, 0.56, C.stoneDark, { ry: -a }); K.box(u, 1.7, v, 0.7, 0.14, 0.7, C.stone, { ry: -a });
      K.cyl(u, 1.84, v, 0.045, 0.045, 1.9, 5, C.timberDark); K.box(u + 0.38, 3.2, v, 0.7, 0.46, 0.04, e > 0 ? C.flag : C.banner);
      solidOut(u, v, 0.42);
    }
    // a rack of practice weapons by the ring's south gate
    const rack = (u, v, ry = 0) => {
      const c = Math.cos(ry), s = Math.sin(ry), P = (a, b) => [u + a * c + b * s, v - a * s + b * c];
      for (const e of [-1, 1]) { const [x, z] = P(e * 0.8, 0); K.box(x, 0, z, 0.1, 1.35, 0.34, C.woodDark, { ry }); }
      for (const y of [0.35, 1.15]) K.box(u, y, v, 1.7, 0.08, 0.1, C.wood, { ry });
      for (let i = 0; i < 5; i++) { const [x, z] = P(-0.6 + i * 0.3, 0.06); if (i % 2) { K.box(x, 0.1, z, 0.06, 1.75, 0.06, C.woodLight, { ry }); K.box(x, 1.85, z, 0.09, 0.26, 0.03, C.iron, { ry }); } else { K.box(x, 0.3, z, 0.09, 1.05, 0.03, C.stone, { ry }); K.box(x, 1.2, z, 0.3, 0.06, 0.06, C.timberDark, { ry }); K.box(x, 1.26, z, 0.06, 0.24, 0.06, C.timberDark, { ry }); } }
      solidOut(u - 0.45 * c, v + 0.45 * s, 0.42); solidOut(u + 0.45 * c, v - 0.45 * s, 0.42);
    };
    rack(cu + 2.6, cv + R.r + 0.75, 0);
    // ---- the training yard: straw dummies, archery butts at the far end, a fence along the brink
    const Yd = GUILD_SITE.yard, y0u = Yd.x0 - HX, y1u = Yd.x1 - HX, y0v = Yd.z0 - HZ, y1v = Yd.z1 - HZ;
    const dummy = (u, v, ry) => {
      K.cyl(u, -0.4, v, 0.08, 0.07, 2.1, 6, C.woodDark); K.cyl(u, 0.68, v, 0.24, 0.3, 0.72, 8, C.straw, { vary: 0.05 }); K.cyl(u, 1.42, v, 0.17, 0.2, 0.3, 8, C.straw, { vary: 0.05 });
      K.box(u, 1.16, v, 1.2, 0.1, 0.1, C.woodDark, { ry }); K.cyl(u, 0.9, v, 0.31, 0.31, 0.06, 8, C.timberDark); K.cyl(u, 1.72, v, 0.2, 0.14, 0.14, 7, C.iron);
      K.cyl(u + Math.cos(ry) * 0.55 + Math.sin(ry) * 0.1, 0.95, v - Math.sin(ry) * 0.55 + Math.cos(ry) * 0.1, 0.26, 0.26, 0.05, 9, C.banner, { rx: Math.PI / 2, ry });
      K.box(u, 0, v, 0.6, 0.08, 0.6, C.woodDark, { ry: 0.6 }); solidOut(u, v, 0.4);
    };
    dummy(y1u - 2.4, y0v + 2.9, 0.3); dummy(y1u - 4.6, y0v + 1.5, -0.4); dummy(y1u - 6.5, y0v + 3.0, 0.1);
    const butt = (u, v) => {                                               // an archery target facing east
      K.cyl(u, 0.55, v, 0.62, 0.62, 0.2, 14, C.straw, { rz: Math.PI / 2 }); K.cyl(u + 0.11, 0.69, v, 0.48, 0.48, 0.02, 14, C.paper, { rz: Math.PI / 2 });
      K.cyl(u + 0.12, 0.85, v, 0.32, 0.32, 0.02, 12, C.banner, { rz: Math.PI / 2 }); K.cyl(u + 0.13, 1.03, v, 0.14, 0.14, 0.02, 10, C.flag, { rz: Math.PI / 2 });
      for (const e of [-1, 1]) K.box(u - 0.12, 0, v + e * 0.42, 0.09, 1.5, 0.09, C.woodDark, { rz: -0.14 }); K.box(u - 0.5, 0, v, 0.09, 1.3, 0.09, C.woodDark, { rz: 0.42 });
      K.box(u + 0.2, 1.22, v + 0.1, 0.5, 0.03, 0.03, C.woodLight, { rz: 0.1 }); solidOut(u - 0.1, v, 0.6);
    };
    butt(y0u + 0.9, y0v + 1.2); butt(y0u + 0.9, y0v + 3.2);
    for (const [u, v, s] of [[y1u - 0.9, y1v - 0.7, 1], [y1u - 1.75, y1v - 0.6, 0.85]]) { K.box(u, 0, v, 0.95 * s, 0.6 * s, 0.7 * s, C.hay, { ry: 0.2 * s, vary: 0.04 }); K.box(u, 0.25 * s, v, 0.97 * s, 0.06, 0.72 * s, C.timberDark, { ry: 0.2 * s }); solidOut(u, v, 0.5 * s); }
    rack(y1u - 4.2, y1v - 0.35, 0);
    const fence = pts => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [u1, v1] = pts[i], [u2, v2] = pts[i + 1], len = Math.hypot(u2 - u1, v2 - v1), n = Math.max(1, Math.round(len / 1.7)), ry = Math.atan2(-(v2 - v1), u2 - u1);
        for (let k = 0; k <= n; k++) { const u = u1 + (u2 - u1) * k / n, v = v1 + (v2 - v1) * k / n; K.box(u, -0.4, v, 0.14, 1.5, 0.14, C.timberDark, { vary: 0.05 }); solidOut(u, v, 0.2); }
        for (const y of [0.45, 0.9]) K.box((u1 + u2) / 2, y, (v1 + v2) / 2, len, 0.09, 0.07, C.timber, { ry });
      }
    };
    const P = GUILD_SITE.pad, pw = P.x - P.hx - HX + 0.45, ps = P.z + P.hz - HZ - 0.4, pe = P.x + P.hx - HX - 0.45, pn = P.z - P.hz - HZ + 0.45;
    fence([[pw, cv + 3.4], [pw, ps], [-W / 2 - 0.3, ps]]);                 // round the training yard's corner
    fence([[W / 2 + 0.6, ps], [pe, ps], [pe, S.half + 1.1]]); fence([[pe, -S.half - 1.1], [pe, pn + 2.2]]);      // along the front, either side of the steps
  }

  // ------------------------------------------------------------------ meshes
  const base = propMaterial();
  const inMat = new THREE.ShaderMaterial({                                 // the rooms: the same paint, seen from the front only, in a warmer, evener light
    uniforms: { ...base.uniforms, uLit: { value: new THREE.Vector3(1.06, 1.0, 0.9) }, uMid: { value: new THREE.Vector3(0.95, 0.89, 0.82) }, uShade: { value: new THREE.Vector3(0.8, 0.74, 0.76) } },
    vertexColors: true, vertexShader: base.vertexShader, fragmentShader: base.fragmentShader, side: THREE.FrontSide,
  });
  const see = { value: 1 };                                                // 1 = the outside of the hall is drawn, 0 = it is away
  const outMat = new THREE.ShaderMaterial({                                // the outside: the same paint, thinned away dot by dot as she walks in
    uniforms: { ...base.uniforms, uSee: see },
    vertexColors: true, vertexShader: base.vertexShader, side: THREE.DoubleSide,
    fragmentShader: base.fragmentShader.replace('void main() {', 'uniform float uSee;\nvoid main() {\n  if (uSee < 0.999 && fract(dot(floor(gl_FragCoord.xy), vec2(0.7548777, 0.5698403))) >= uSee) discard;'),
  });
  const mesh = (K, mat, name) => { const m = new THREE.Mesh(K.done(), mat); m.name = name; m.userData.dispose = () => m.geometry.dispose(); group.add(m); return m; };
  const outside = mesh(KE, outMat, 'guildOutside'), balcony = mesh(KB, outMat, 'guildBalcony'), walls = mesh(KW, inMat, 'guildWalls');
  const floors = KF.map((K, i) => mesh(K, inMat, 'guildFloor' + i)), ceils = KC.map((K, i) => mesh(K, inMat, 'guildCeiling' + i));
  const deco = { E: mesh(KD.E, inMat, 'guildWallE'), W: mesh(KD.W, inMat, 'guildWallW'), N: mesh(KD.N, inMat, 'guildWallN'), S: mesh(KD.S, inMat, 'guildWallS') };
  mesh(KY, base, 'guildYard');
  group.userData.dispose = () => { inMat.dispose(); outMat.dispose(); };

  // ------------------------------------------------------------------ walking
  let storey = -1;
  const FLOOR = [Y0, Y1, Y2], CEIL = [Y1 - 0.25, Y2 - 0.25, roofY(0)];
  const inA = (u, v) => u > STAIR_A.u1 && u < STAIR_A.u0 && v > STAIR_A.v0 - T && v < STAIR_A.v1, tA = u => (STAIR_A.u0 - u) / (STAIR_A.u0 - STAIR_A.u1);
  const inB = (u, v) => v > STAIR_B.v0 && v < STAIR_B.v1 && u > STAIR_B.u0 - T && u < STAIR_B.u1, tB = v => (v - STAIR_B.v0) / (STAIR_B.v1 - STAIR_B.v0);
  const inHall = (u, v, pad = 0) => Math.abs(u) < W / 2 + pad && Math.abs(v) < D / 2 + pad;
  const onBalcony = (u, v) => u >= W / 2 - 0.1 && u < BALCONY.u1 + 0.1 && Math.abs(v) < BALCONY.v + 0.1;
  const climb = (lo, hi, t, n) => lo + Math.min(hi - lo, Math.max(0, t * (hi - lo) + (hi - lo) / n * 0.5));      // on the treads, not through them
  const floorAt = (u, v) => {                                              // the height of the floor of the storey she is on, here
    if (storey <= 1 && inA(u, v)) return climb(Y0, Y1, tA(u), STAIR_A.n);
    if (storey >= 1 && inB(u, v)) return climb(Y1, Y2, tB(v), STAIR_B.n);
    return FLOOR[storey];
  };
  const guild = {
    group, colliders, site: GUILD_SITE,
    get storey() { return storey; },
    set storey(s) { storey = s; },
    cleared(x, z, pad = 0.3) { const P = GUILD_SITE.pad; return Math.abs(x - P.x) < P.hx + pad && Math.abs(z - P.z) < P.hz + pad; },
    onPad(x, z) { const P = GUILD_SITE.pad; return Math.abs(x - P.x) < P.hx && Math.abs(z - P.z) < P.hz; },
    // trodden and paved ground: d = 0 well inside, 0.7 at the edge (as the level measures its ways); paved 0..1
    ground(x, z) {
      const u = x - HX, v = z - HZ, P = GUILD_SITE.pad;
      if (Math.abs(x - P.x) > P.hx + 6 || Math.abs(z - P.z) > P.hz + 4) return null;
      const box = (u0, u1, v0, v1) => { const du = Math.max(u0 - u, u - u1), dv = Math.max(v0 - v, v - v1); return Math.min(0, Math.max(du, dv)) + Math.hypot(Math.max(0, du), Math.max(0, dv)); };
      const R = GUILD_SITE.arena, Yd = GUILD_SITE.yard, pe = P.x + P.hx - HX, pn = P.z - P.hz - HZ, ps = P.z + P.hz - HZ;
      const court = Math.min(box(W / 2 - 0.5, pe - 0.5, pn + 0.9, ps - 0.6), box(steps.u0 - 0.6, steps.u1 + 0.3, -steps.half, steps.half));      // the paved court before the door, and the steps
      const earth = Math.min(
        box(-W / 2, W / 2, -D / 2, D / 2),                                 // under the hall
        Math.hypot(x - R.x, z - R.z) - (R.r + 0.75),                       // the ring and a trodden rim round it
        box(Yd.x0 - HX + 0.3, Yd.x1 - HX, Yd.z0 - HZ + 0.2, Yd.z1 - HZ - 0.5),      // the training yard
        box(-W / 2 - 2.6, W / 2, pn + 1.4, -D / 2),                        // the way round the north side to the ring
        box(-W / 2 - 1.6, -W / 2, -D / 2, D / 2));                         // behind the hall, past the back door
      const s = Math.min(court, earth);
      if (s > 3.4) return null;
      return { d: Math.max(0, s + 0.7), paved: 1 - Math.min(1, Math.max(0, (court + 0.5) / 0.7)) };
    },
    bare: [], casts: [[HX, HZ, 12.5, 6.4], [GUILD_SITE.arena.x, GUILD_SITE.arena.z, 0.9, 5.2]],
    heightAt(x, z, land) {
      const u = x - HX, v = z - HZ;
      if (storey >= 0 && (inHall(u, v, 0.05) || (storey === 2 && onBalcony(u, v)))) return padY + floorAt(u, v);
      if (u > steps.u0 && u < steps.u1 && Math.abs(v) < steps.half + 0.2) return padY + Math.min(0, steps.yb * (u - steps.u0) / (steps.u1 - steps.u0) + steps.rise * 0.5);
      return land;
    },
    collide(p) {
      const bit = 1 << (storey + 1), R = 0.28;
      let u = p.x - HX, v = p.z - HZ;
      if (Math.abs(u) > 7.5 || Math.abs(v) > 7.5) return;
      for (let pass = 0; pass < 2; pass++) {
        for (const [u1, v1, u2, v2, half, on] of segs) {
          if (!(on & bit)) continue;
          const du = u2 - u1, dv = v2 - v1, t = Math.max(0, Math.min(1, ((u - u1) * du + (v - v1) * dv) / (du * du + dv * dv))), qu = u1 + du * t, qv = v1 + dv * t;
          let ou = u - qu, ov = v - qv, d = Math.hypot(ou, ov);
          if (d >= R + half) continue;
          if (d < 1e-5) { const l = Math.hypot(du, dv); ou = -dv / l; ov = du / l; d = 1; }
          u = qu + ou / d * (R + half); v = qv + ov / d * (R + half);
        }
        for (const [cu, cv, r, on] of rounds) {
          if (!(on & bit)) continue;
          const ou = u - cu, ov = v - cv, d = Math.hypot(ou, ov);
          if (d < r + R && d > 1e-5) { u = cu + ou / d * (r + R); v = cv + ov / d * (r + R); }
        }
      }
      p.x = HX + u; p.z = HZ + v;
    },
    follow(pos) {
      const u = pos.x - HX, v = pos.z - HZ;
      if (storey < 0) { if (inHall(u, v, -0.05)) storey = 0; return; }
      if (!inHall(u, v, 0.05) && !(storey === 2 && onBalcony(u, v))) { storey = -1; return; }
      if (storey <= 1 && inA(u, v)) storey = tA(u) < 0.5 ? 0 : 1;
      else if (storey >= 1 && inB(u, v)) storey = tB(v) < 0.5 ? 1 : 2;
    },
    update(dt, camera) {
      const inside = storey >= 0, cy = camera ? camera.position.y - padY : 0, cu = camera ? camera.position.x - HX : 99, cv = camera ? camera.position.z - HZ : 99;
      // the camera itself can be in the hall while she stands outside it (her back to a wall, or just out of a door): then too
      // the outside is drawn away, so the hall is never between her and the eye
      const eyeIn = Math.abs(cu) < W2 / 2 + 0.3 && Math.abs(cv) < D2 / 2 + 0.3 && cy > -0.5 && cy < roofY(cv) + 0.3, open = inside || eyeIn;
      see.value += ((open ? 0 : 1) - see.value) * Math.min(1, dt * 9 + (dt <= 0 ? 1 : 0));
      if (Math.abs(see.value - (open ? 0 : 1)) < 0.01) see.value = open ? 0 : 1;
      outside.visible = see.value > 0.001;
      balcony.visible = outside.visible || storey === 2;
      // from outside everything is there (seen through the doorway); once the hall is open, a floor above her is drawn only
      // while the eye is below it, and a ceiling only from underneath: nothing is ever between her and the eye
      floors.forEach((m, k) => { m.visible = !open || k <= Math.max(0, storey) || cy < CEIL[k - 1] - 0.05; });
      ceils.forEach((m, k) => { m.visible = !open || cy < CEIL[k] - 0.05; });
      // the eye in the hall and she outside it: the inner walls go too. Otherwise each wall's own things show while the eye is on its inner side
      const peek = open && !inside;
      walls.visible = !peek;
      deco.E.visible = !open || (!peek && cu < IU); deco.W.visible = !open || (!peek && cu > -IU); deco.N.visible = !open || (!peek && cv > -IV); deco.S.visible = !open || (!peek && cv < IV);
    },
    // places for people, and for things to do, later (x, z, storey)
    spots: {
      door: [HX + W / 2 + 1.2, HZ, -1], reception: [HX - 3.3, HZ - 1.0, 0], board: [HX + 0.85, HZ + 4.5, 0], shop: [HX - 2.8, HZ - 4.3, 0], hearth: [HX - 3.1, HZ + 4.2, 0],
      tables: [[HX + 0.5, HZ + 2.2, 0], [HX + 3.25, HZ + 3.2, 0], [HX + 0.3, HZ - 2.0, 0]], library: [HX, HZ + 4.3, 1], master: [HX + 1.4, HZ - 2.85, 2], balcony: [HX + W / 2 + 0.9, HZ, 2],
      arena: [GUILD_SITE.arena.x, GUILD_SITE.arena.z, -1], yard: [(GUILD_SITE.yard.x0 + GUILD_SITE.yard.x1) / 2, (GUILD_SITE.yard.z0 + GUILD_SITE.yard.z1) / 2, -1],
    },
    _plan: { segs, rounds, steps, FLOOR },
  };
  for (let u = -W / 2 + 0.5; u <= W / 2 - 0.4; u += 1) for (let v = -D / 2 + 0.5; v <= D / 2 - 0.4; v += 1) guild.bare.push([HX + u, HZ + v, 1.0]);
  for (let i = 0; i < 14; i++) { const a = i / 14 * 6.2832, R = GUILD_SITE.arena; guild.bare.push([R.x + Math.cos(a) * 2.6, R.z + Math.sin(a) * 2.6, 1.6]); }
  guild.bare.push([GUILD_SITE.arena.x, GUILD_SITE.arena.z, 2.2]);
  return guild;
}
