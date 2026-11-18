// player-hurdle.js
// Low solid things she hops over, for the player with the moves (player-moves.js): a fence, a bridge's parapet, a barrel,
// a stack of crates. Which one is before her, and the hop that takes her over it: how near to it she leaves the ground,
// how high and how far she goes, and where she is at each moment of it.
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
//   hopLead(h, speed, k, hh) -> metres
//      How near to it (as h.from) she leaves the ground at this pace (m/s), for the hop to be as low as it can be: its
//      height over the middle of the thing. hh: her hips' height (m).
//   planHop(h, speed, k, hh, out) -> out, or null (no room to come down past it)
//      The hop from where she is now. out.wait (s on the ground first: the push-off, from a walk or a stand; none from a
//      run), out.time (s in the air), out.far (metres along her way to where she comes down), out.apex (metres her root
//      rises), out.start (s into the clip it begins), out.untuck (s into the hop when her feet are past the thing and her
//      legs come down for the landing), out.over (how far through the flight, 0..1, her feet are past it).
//   hopAt(plan, t, out) -> out
//      t seconds into it: out.along (metres along her way from where she began), out.lift (metres her root is raised),
//      out.up (m/s her root is rising), out.pace (m/s over the ground), out.u (how far through the flight, 0..1).
//
// The hop is a jump's arc: up and down under one gravity (GRAV0, the real world's: gentler than her jump's, which is a
// game's), on over the ground at one pace. Her body in it is the library's tucked jump (NinjaJump_Start, played as 'hop':
// a clip made by hand, in place): her knees come up under her as she rises. SOLE says how high her soles are through
// that clip, and the arc is made just high enough for them to clear the top by CLEAR0 all the way across it. So a hop
// from a run, begun hopLead before the thing, is long and low. Begun nearer than that, she would have to shoot up to be
// over it in time: where it makes the hop lower, she rises first and goes over after (her pace over the ground eased in,
// and out again), as one does from a stand.

const HIGH0 = 1.0, LOW0 = 0.45;   // a top no higher than this over her feet, nor lower (m at Vivi's size; 1.24 m and 0.56 m at 1.75 m)
const DEEP0 = 1.33;               // she goes over no more than this along her way (1.65 m at 1.75 m: a table with its benches, not a cart)
const BODY0 = 0.28;               // her own half-width, as player-moves.js keeps her off solid things
const SQUARE = 0.5;               // she comes at it within 60 degrees of square
const GRAV0 = 8.0;                // m/s² (9.9 at 1.75 m)
const CLEAR0 = 0.1;               // her soles go this far over the top (m)
const FEET0 = [0.05, 0.15];       // her feet, drawn up under her, reach this far before her root, and behind it (m)
const APEX0 = [0.3, 1.0];         // her root rises no less than this, and no more (m)
const PACE0 = [1.9, 3.6];         // her pace over the ground in the air: no slower, no faster (m/s; 2.4 and 4.5 at 1.75 m)
const RUNNING0 = 2.0;             // from this pace on it is a running take-off (m/s): no push-off first
const WAIT = 0.08, START = 0.05;  // the push-off from a stand (s on the ground: the clip's crouch); where in the clip a running take-off begins (s)
const TUCK = 0.2;                 // s from leaving the ground until her knees are up
const AFTER = 0.2;                // her feet are past the thing at least this long before she is down (s): her legs come down
const UNTUCK = 0.24;              // her legs start down this long before she lands (s), if her feet are past the thing by then

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
// how high her soles are over her root's ground, c seconds into the clip (hips heights: measured on Vivi, a little under)
const SOLE = c => 0.455 * smooth((c - 0.07) / 0.15) + 0.09 * smooth((c - 0.22) / 0.4);
const SOLE_UP = 0.5;              // (and with her knees up)

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

// how much of a running take-off it is at this pace (0: from a stand .. 1), and her pace in the air
const running = (speed, k) => clamp(speed / (RUNNING0 * k), 0, 1);
const paceOf = (speed, k) => clamp(speed, PACE0[0] * k, PACE0[1] * k);

export function hopLead(h, speed, k, hh) {
  const g = GRAV0 * k, body = BODY0 * k, v = paceOf(speed, k);
  const wide = Math.max(0.1, h.to - h.from - 2 * body + (FEET0[0] + FEET0[1]) * k), need = Math.max(0.05, h.rise + CLEAR0 * k - SOLE_UP * hh);
  // an arc with its top over the middle of the thing, just high enough at its near and far edges
  const before = Math.max((-wide + Math.sqrt(wide * wide + 8 * need * v * v / g)) / 2, v * TUCK);
  return before - body + FEET0[0] * k + speed * WAIT * (1 - running(speed, k));
}

export function planHop(h, speed, k, hh, out) {
  const g = GRAV0 * k, body = BODY0 * k, v = paceOf(speed, k), run = running(speed, k);
  const wait = WAIT * (1 - run), start = START * run, walked = speed * wait;
  // from where she leaves the ground: where her feet must be over the top, and where her root may come down
  const e0 = Math.max(0.02, h.from + body - FEET0[0] * k - walked), e1 = Math.max(e0 + 0.05, h.to - body + FEET0[1] * k - walked);
  const least = h.to + 0.04 - walked, most = h.to + h.room - 0.04 - walked;
  if (most < least) return null;
  const need = h.rise + CLEAR0 * k;
  // the lowest arc that clears it, her pace over the ground eased in and out by `slow` (0: one pace all the way)
  const lowest = (slow, o) => {
    for (o.apex = APEX0[0] * k; ; o.apex += 0.03 * k) {
      o.time = 2 * Math.sqrt(2 * o.apex / g);
      o.reach = clamp(Math.max(v * o.time, e1 + Math.max(v * AFTER, body)), least, most);
      let ok = true; o.over = 1;
      for (let i = 48; i >= 1; i--) {
        const u = i / 48, x = o.reach * ((1 - slow) * u + slow * u * u * (3 - 2 * u));
        if (x > e1) { o.over = u; continue; }
        if (x < e0) break;
        if (4 * o.apex * u * (1 - u) + SOLE(start + wait + u * o.time) * hh < need) { ok = false; break; }
      }
      if (ok || o.apex >= APEX0[1] * k) { o.slow = slow; return o; }
    }
  };
  // one pace all the way, unless rising first makes the hop a good deal lower
  let best = lowest(0, {});
  for (const slow of [0.5, 1]) { const o = lowest(slow, {}); if (o.apex < best.apex - 0.08 * k) best = o; }
  out.wait = wait; out.start = start; out.time = best.time; out.apex = best.apex; out.over = best.over; out.slow = best.slow;
  out.reach = best.reach; out.far = walked + best.reach; out.walked = walked; out.speed = speed;
  out.untuck = wait + Math.max(best.over * best.time, best.time - UNTUCK);
  return out;
}

export function hopAt(p, t, out) {
  if (t < p.wait) { out.u = 0; out.along = p.speed * t; out.lift = 0; out.up = 0; out.pace = p.speed; return out; }
  const u = Math.min(1, (t - p.wait) / p.time);
  out.u = u;
  out.along = p.walked + p.reach * ((1 - p.slow) * u + p.slow * u * u * (3 - 2 * u));
  out.lift = 4 * p.apex * u * (1 - u);
  out.up = 4 * p.apex * (1 - 2 * u) / p.time;
  out.pace = p.reach * (1 - p.slow + p.slow * 6 * u * (1 - u)) / p.time;
  return out;
}
