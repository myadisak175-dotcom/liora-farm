// player-hurdle.js
// Low solid things she goes over, for the player with the moves (player-moves.js): a fence, a bridge's parapet, a barrel,
// a stack of crates. Which one is before her: how near it is, how deep along her way, how high its top, how much room
// past it. How she goes over it is player-vault.js (her vault: a hand on the top, a foot on it, a leap off it).
//
// A level says a solid thing can be gone over by giving its collider a top: [x, z, r, lo, hi, top] (top: the world height
// of its top; lo, hi as ever: the heights it is there at, or undefined). A collider with no top she never goes over (a
// house, a tree, a lamp post, a sheep).
//
//   findHurdle(colliders, x, z, y, dx, dz, k, near, out) -> out, or null
//      From her feet (x, y, z), going the way (dx, dz) (a unit step over the ground; k: her size, as in player-moves.js):
//      the solid things in her way, if the nearest is within `near` metres and she can go over them: none of them without
//      a top, none higher than HIGH0 * k over her feet nor lower than LOW0 * k, all of them together no deeper along her
//      way than DEEP0 * k, and come at no more than 60 degrees off square. Writes out.from (metres along her way until
//      she touches it), out.to (metres along to where she is past it), out.room (metres past that with no solid thing in
//      them: where she may come down), out.top (the highest top), out.rise (how far that is over her feet).
//
// (Until 19 Nov 2026 this file also made the hop she went over them with, her knees tucked: the library's NinjaJump_Start
// posed again, tools/make-hop-anim.py. Not pretty; the vault took its place.)

const HIGH0 = 1.0, LOW0 = 0.45;   // a top no higher than this over her feet, nor lower (m at Vivi's size; 1.24 m and 0.56 m at 1.75 m)
const DEEP0 = 1.33;               // she goes over no more than this along her way (1.65 m at 1.75 m: a table with its benches, not a cart)
const BODY0 = 0.28;               // her own half-width, as player-moves.js keeps her off solid things
const SQUARE = 0.5;               // she comes at it within 60 degrees of square

export function findHurdle(colliders, x, z, y, dx, dz, k, near, out) {
  const body = BODY0 * k, spans = [];
  for (const c of colliders) {
    const [cx, cz, cr, lo, hi] = c;
    if (lo !== undefined && (y < lo || (hi !== undefined && y > hi))) continue;      // (not there at her height)
    const R = cr + body, ox = x - cx, oz = z - cz;
    const b = ox * dx + oz * dz, q = ox * ox + oz * oz - R * R, disc = b * b - q;
    if (disc <= 0) continue;
    const s = Math.sqrt(disc), t1 = -b - s, t2 = -b + s;
    if (t2 <= 0) continue;                                                           // (behind her)
    spans.push([t1, t2, c]);
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a[0] - b[0]);
  if (spans[0][0] > near) return null;                                               // nothing in her way yet
  // the run of things her way goes through without coming clear between them, and how far it is clear after them
  let to = spans[0][1], topY = -Infinity, room = Infinity;
  const from = Math.max(spans[0][0], 0), first = spans[0][2];
  for (const [t1, t2, c] of spans) {
    if (t1 > to + 0.05) { room = t1 - to; break; }
    if (c[5] === undefined) return null;                                             // something she cannot go over
    to = Math.max(to, t2); topY = Math.max(topY, c[5]);
  }
  const rise = topY - y;
  if (rise > HIGH0 * k || rise < LOW0 * k || to - from - 2 * body > DEEP0 * k) return null;
  // come at square enough: the first thing's face where she meets it
  const px = x + dx * from, pz = z + dz * from, nx = px - first[0], nz = pz - first[1], nl = Math.hypot(nx, nz);
  if (nl > 1e-6 && -(nx * dx + nz * dz) / nl < SQUARE) return null;
  out.from = from; out.to = to; out.room = room; out.top = topY; out.rise = rise;
  return out;
}
