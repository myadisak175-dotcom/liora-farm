// player-hurdle.js
// Low solid things she goes over, for the player with the moves (player-moves.js): a fence, a bridge's parapet, a barrel,
// a stack of crates. Which one is before her and where she comes clear of it on the far side, and where her root is at
// each moment of the vault.
//
// A level says a solid thing can be gone over by giving its collider a top: [x, z, r, lo, hi, top] (top: the world height
// of its top, where her hand goes down; lo, hi as ever: the heights it is there at, or undefined). A collider with no top
// she never goes over (a house, a tree, a lamp post, a sheep).
//
//   findHurdle(colliders, x, z, y, dx, dz, k, near, out) -> out, or null
//      From her feet (x, y, z), going the way (dx, dz) (a unit step over the ground; k: her size, as in player-moves.js):
//      the solid things in her way, if the nearest is within `near` metres and she can go over them: none of them without
//      a top, none higher than HIGH0 * k over her feet nor lower than LOW0 * k, all of them together no deeper along her
//      way than DEEP0 * k, and come at no more than 60 degrees off square. Writes out.cross (metres along her way to the
//      line her hand goes down on: the middle of what she goes over), out.clear (metres along to where she is clear of it
//      on the far side), out.top (the highest top), out.rise (how far that is over her feet), out.depth (metres along her
//      way that she is over it).
//   hurdlePath(h, u, hh, out) -> out
//      h: what findHurdle found; u: how far through the vault (0..1, as the clip); hh: her hips' height (m). Where her root
//      is: out.along (metres along her way from where she began), out.lift (metres her root is raised over the ground's
//      line from where she began to where she comes down: by as much as h's top is higher than the clip's).
//
// The clip (Vault.vrma, played as 'hurdle': tools/make-vault-anim.py) is in place and made over a canonical thing, its top
// CLIP.top hips heights high, its line crossed by her root at CLIP.cross of the clip. Its numbers are here as CLIP (keep
// them the same as the tool's). From the moment her hand goes down until it comes off, her root is where the clip has it
// against the line, and raised by as much as the real top is higher than the clip's: so her hand is on the real top.
// Before that, she covers what lies between her and the clip's start; after it, what lies between it and the far side.

export const CLIP = { length: 0.6, top: 0.92, cross: 0.36, plant: 0.18, release: 0.5, land: 0.64, rootIn: 0.78, rootOut: 1.2 };
const HIGH0 = 1.0, LOW0 = 0.45;   // a top no higher than this over her feet, nor lower (m at Vivi's size; 1.24 m and 0.56 m at 1.75 m)
const DEEP0 = 1.33;               // she goes over no more than this along her way (1.65 m at 1.75 m: a table with its benches, not a cart)
const BODY0 = 0.28;               // her own half-width, as player-moves.js keeps her off solid things
const SQUARE = 0.5;               // she comes at it within 60 degrees of square
const DEPTH_CLIP = 0.5;           // (hips heights) how deep a thing the clip is made over: a deeper one, her root goes on further while her hand is down

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const rootAt = u => (u < CLIP.cross ? -CLIP.rootIn * (1 - u / CLIP.cross) : CLIP.rootOut * (u - CLIP.cross) / (1 - CLIP.cross));      // (hips heights from the line)

export function findHurdle(colliders, x, z, y, dx, dz, k, near, out) {
  const body = BODY0 * k, spans = [];
  for (const c of colliders) {
    const [cx, cz, cr, lo, hi, top] = c;
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
  // the run of things her way goes through without coming clear between them
  let from = spans[0][0], to = spans[0][1], topY = -Infinity;
  const first = spans[0][2];
  for (const [t1, t2, c] of spans) {
    if (t1 > to + 0.05) break;
    if (c[5] === undefined) return null;                                             // something she cannot go over
    to = Math.max(to, t2); topY = Math.max(topY, c[5]);
  }
  const rise = topY - y, depth = to - Math.max(from, 0);
  if (rise > HIGH0 * k || rise < LOW0 * k || depth - 2 * body > DEEP0 * k) return null;
  // come at square enough: the first thing's face where she meets it
  const px = x + dx * Math.max(from, 0), pz = z + dz * Math.max(from, 0), nx = px - first[0], nz = pz - first[1], nl = Math.hypot(nx, nz);
  if (nl > 1e-6 && -(nx * dx + nz * dz) / nl < SQUARE) return null;
  out.cross = (Math.max(from, 0) + to) / 2; out.clear = to + 0.04; out.top = topY; out.rise = rise; out.depth = depth - 2 * body;
  return out;
}

export function hurdlePath(h, u, hh, out) {
  const C = CLIP, at = v => rootAt(v) * hh;
  const extra = Math.max(0, h.depth - DEPTH_CLIP * hh);                              // a deep thing: further while her hand is down
  const inPlant = at(C.plant) - extra / 2, inRelease = at(C.release) + extra / 2;
  const landAt = Math.max(at(C.land), h.clear - h.cross);                            // she comes down clear of it
  let rel;
  if (u < C.plant) rel = -h.cross + (inPlant + h.cross) * (u / C.plant);
  else if (u < C.release) rel = inPlant + (inRelease - inPlant) * ((u - C.plant) / (C.release - C.plant));
  else if (u < C.land) rel = inRelease + (landAt - inRelease) * ((u - C.release) / (C.land - C.release));
  else rel = landAt + at(u) - at(C.land);
  out.along = h.cross + rel;
  // raised (or lowered) by as much as the top is higher than the clip's: fully while her hand is down, eased in as she
  // takes off and out as she comes down
  const w = u < C.plant ? smooth((u - 0.06) / (C.plant - 0.06)) : u < C.release ? 1 : 1 - smooth((u - C.release) / (C.land - C.release));
  out.lift = (h.rise - C.top * hh) * w;
  return out;
}
