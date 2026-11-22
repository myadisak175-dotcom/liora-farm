// ambience-places.js
// The air about her, in the game: what of it is heard from where she stands. ambience.js plays the layers; this file says
// how loud each is now: the air all round by the hour (or the curse), and the land's places as she comes to them.
//
//   const air = createAmbiencePlaces({ context: () => sounds.context, volume, level, camera });
//   every frame: air.update(dt, player.position, { daylight, speed, mode });      // daylight: 1 by day .. 0 at night (time-of-day.js);
//                                                                                  // her speed (m/s) and mode (player-moves.js)
//   air.volume = 0.8      air.stats (for a test, or the console: what each layer is asked for, and whether it plays)
//
// THE LAND SAYS WHERE (level.heard and level.crowns: hill-village-level.js): the water's ways, every fall, the pit's shaft,
// the trees' crowns. A map that says none of it has the air all round and nothing else.
//
// THE AIR ALL ROUND goes by the daylight: wind in the grass (less of it by night), birds by day, crickets by night; at dusk
// the birds have stopped before the crickets are many. Under the curse (level.heard.cursed): a dry wind, and crows, fewer
// by night; no bird, no cricket.
//
// A PLACE IS HEARD AS A PLACE, as on the trial page: louder as she comes to it (from where it is at its loudest out to
// where it is gone, falling off as the square of the way there), to her left or right as the camera sees it (in the
// middle when she stands at it), duller from far off. How far she is from it counts height too: a brook at a cliff's foot
// is far from its top. Where there are many of a kind (falls one under another, a wood's crowns) they are one layer: as
// loud as all of them together (never more than one beside her), and from where the loudest of them are.
//   brook    the nearest of the brooks and streams: a stream over pebbles along its bank, heard as she walks along it
//   river    the nearest stretch of the river, heard further than a brook, as its water runs along the bank ("ริมแม่น้ำ
//            หนัก เสียงน้ำไหลตามตลิ่ง"): where that stretch is near a fall, rushing and heavy (rapids); away from the falls,
//            slow (river: "เสียงน้ำไหลช้าๆ เวลาห่างจากน้ำตก แต่ยังอยู่ริมแม่น้ำ"), the one going over into the other
//   fall     every fall near enough: a tall one is heard further and louder than a low step of one. Near one the rest of
//            the air (the wind, the birds, the night, the leaves) is less heard, as it would be: it is drowned, and the fall
//            stands out clearly ("ตอนใกล้น้ำตก อยากได้ยินเสียงน้ำตกชัดๆ")
//   leaves   the crowns near her, as the wind is (less by night); none under the curse (its trees are bare)
//   abyss    the pit's shaft: the wind out of it
//   frogs    by the water at night; fewer where a fall drowns them
//   windmill the windmill's sails, creaking round, from their hub (high up: under them she is some metres from it)
//   wheel    the water wheel at the mill, its paddles pouring; not under the curse (the stream does not run)
//   creak    their wood, once each time one of the windmill's sails goes by (most times: not every one, nor all as loud),
//   wheelcreak  and each time a quarter of the wheel goes round: heard in time with what is seen turning. The wood in the
//            loops was not heard ("เอาเสียงไม้ค่ะ มันไม่ได้ยินเลย"). Under the curse the wheel's wood, slowly, and no water
//
// THE GRASS SHE GOES THROUGH (brush): wherever she is on her feet in grass and moving, the blades parted round her legs, a
// soft rustle ("เสียงใบหญ้าตอนโดนแหวก เบาๆ"), louder the faster she goes (throughGrass, below: the trial page asks it too).
// It is no step: it is there all the while she moves and fades as she stops, under her steps, which say where her feet
// come down. Under the curse as well (its grass is dry, not gone).

import { createAmbience } from './ambience.js';

// from near (m: at its loudest) out to far (gone)
const BROOK = { near: 1.5, far: 26 };                                    // (far: 20 at first; a stream is to be heard walking along it, "เวลาเดินริมน้ำ")
const RIVER = { near: 2, far: 35 };
const RAPIDS = { near: 12, far: 45 };                                   // m from a fall, of the river's stretch she hears: all rushing nearer, all slow further
const DROWNED = 0.6;                                                    // how much of the rest of the air a fall at its loudest takes away
const FALL = { near: 4, far: [22, 55], loud: [0.6, 1], tall: 18 };      // a low step of a fall .. a tall one (so many m and more): how far it is heard, how loud beside it
                                                                        // (far: [30, 80] at first, and a fall was louder than the wind on two fifths of the land, its rush
                                                                        // everywhere: "เสียงซ่าๆ ในเกมมันดัง". Beside one it is as loud as it was)
const LEAVES = { near: 2.5, far: 14, over: 4 };                         // (over: a crown this much higher or lower than her head is as near as one level with it)
const PIT = { near: 0.5, far: 45 };
const WINDMILL = { near: 3, far: 45 };                                  // (from the sails' reach)
const WHEEL = { near: 1.5, far: 25 };                                   // (from the wheel's rim)
const CREAK = { every: 1, often: 0.75, vary: 0.35 };                    // the windmill's wood: at every sail, three times in four, louder or softer by so much
const WHEEL_CREAK = { every: 3, often: 0.9, vary: 0.3 };                // the wheel's: every third paddle (a quarter of it round)
const FROGS = { near: 1, far: 24, drowned: 0.8 };                       // (drowned: how much of them a fall at its loudest takes away)
const NIGHT_WIND = 0.35;                                                // the wind by night, of the day's
const CURSE_CROWS = 0.3;                                                // the crows by night, of the day's
const SIDE = 0.85, SIDE_FROM = 4;                                       // how far to one side a place can be heard; within so many m of it, less and less to a side
const BRUSH_FULL = 4.2;                                                 // m/s: her run (at 1.75 m): the grass she goes through at its loudest

// how loud the grass she goes through is: 0 standing (or not on grass) .. 1 at her run and faster. A walk (1.5 m/s) is
// some three fifths of a run: the rustle grows quickly as she sets off, then more slowly
export const throughGrass = (speed, inGrass) => inGrass ? Math.sqrt(Math.min(1, Math.max(0, speed) / BRUSH_FULL)) : 0;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = ([a, b], k) => a + (b - a) * k;

export function createAmbiencePlaces({ context, volume = 1, level, camera } = {}) {
  const air = createAmbience({ context, volume });
  const heard = (level && level.heard) || {};
  const cursed = !!heard.cursed;
  // each way of the water with the box it lies in, so a way far from her is not gone along point by point
  const ways = (heard.ways || []).map((points, k) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { points, x0, x1, z0, z1, river: !!(heard.rivers && heard.rivers[k]) };
  }).filter(w => w.points.length > 1);
  const falls = heard.falls || [], pit = heard.pit || null;
  const turning = [['windmill', heard.windmill, WINDMILL, 'creak', CREAK], ['wheel', heard.wheel, WHEEL, 'wheelcreak', WHEEL_CREAK]].map(([name, m, range, wood, often]) => ({ name, m, range, wood, often, round: 0, gone: 0 }));

  let rx = 1, rz = 0, drowned = 0;                                        // the camera's right, on the ground; (see the getter)
  const brookAt = { d: Infinity, dx: 0, dz: 0, d0: 0 }, riverAt = { d: Infinity, dx: 0, dz: 0, d0: 0 };
  // a place dx, dz from her (d0 on the ground, d in all): which side it is heard on
  const side = (dx, dz, d0, d) => d0 > 0.01 ? (dx * rx + dz * rz) / d0 * SIDE * clamp(d / SIDE_FROM, 0, 1) : 0;
  // ... how far along the way from near to far it is (0: at its loudest, 1: gone)
  const along = (d, near, far) => clamp((d - near) / (far - near), 0, 1);

  // the nearest point of the water's ways (the river's, or the rest's): how far (from its edge, in all), and where
  function nearestWater(x, y, z, reach, river, water) {
    water.d = Infinity;
    for (const w of ways) {
      if (w.river !== river) continue;
      if (x < w.x0 - reach || x > w.x1 + reach || z < w.z0 - reach || z > w.z1 + reach) continue;
      const P = w.points;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], len = ex * ex + ez * ez;
        const t = len > 1e-9 ? clamp(((x - a[0]) * ex + (z - a[1]) * ez) / len, 0, 1) : 0;
        const dx = a[0] + ex * t - x, dz = a[1] + ez * t - z, d0 = Math.hypot(dx, dz);
        const d = Math.hypot(Math.max(0, d0 - (a[3] + (b[3] - a[3]) * t) / 2), y - (a[2] + (b[2] - a[2]) * t));
        if (d < water.d) { water.d = d; water.dx = dx; water.dz = dz; water.d0 = d0; }
      }
    }
    return water;
  }

  // many of a kind as one layer: each one's loudness squared is its weight
  const many = { sum: 0, pan: 0, far: 0 };
  const begin = () => { many.sum = 0; many.pan = 0; many.far = 0; };
  const add = (loud, pan, t) => { const w = loud * loud; many.sum += w; many.pan += w * pan; many.far += w * t; };
  const put = (name, scale = 1) => {
    if (many.sum > 1e-8) air.set(name, Math.min(1, Math.sqrt(many.sum)) * scale, { pan: many.pan / many.sum, far: many.far / many.sum });
    else air.set(name, 0);
    return Math.min(1, Math.sqrt(many.sum));
  };

  return {
    get stats() { return air.stats; },
    get volume() { return air.volume; },
    set volume(v) { air.volume = v; },
    get under() { return air.under; },
    set under(v) { air.under = v; },      // (music.js: while a piece plays)
    get drowned() { return drowned; },     // how much of what is heard a fall or rushing water takes up, 0..1 (music.js goes down by it)

    update(dt, at, { daylight = 1, speed = 0, mode = 'ground' } = {}) {
      const x = at.x, y = at.y, z = at.z, day = clamp(daylight, 0, 1), dark = 1 - day;
      if (camera) { const e = camera.matrixWorld.elements, l = Math.hypot(e[0], e[2]); if (l > 1e-6) { rx = e[0] / l; rz = e[2] / l; } }

      // ---- the falls (first: near one, the rest of the air is drowned by it)
      begin();
      for (const f of falls) {
        const tall = clamp((f.top - f.bottom) / FALL.tall, 0, 1), far = mix(FALL.far, tall);
        const dx = f.x - x, dz = f.z - z, d0 = Math.hypot(dx, dz);
        if (d0 > far + f.width) continue;
        const d = Math.hypot(Math.max(0, d0 - f.width / 2), y > f.top ? y - f.top : y < f.bottom ? f.bottom - y : 0), t = along(d, FALL.near, far);
        if (t < 1) add(mix(FALL.loud, tall) * (1 - t) * (1 - t), side(dx, dz, d0, d), t);
      }
      const fall = put('fall'), heard = 1 - DROWNED * fall;
      drowned = fall;

      // ---- the air all round
      const wind = cursed ? 0 : NIGHT_WIND + (1 - NIGHT_WIND) * day;
      air.set('wind', wind * heard);
      air.set('birds', cursed ? 0 : day * day * heard);
      air.set('night', cursed ? 0 : dark * dark * heard);
      air.set('dry', cursed ? 1 : 0);
      air.set('crows', cursed ? CURSE_CROWS + (1 - CURSE_CROWS) * day : 0);

      // ---- the water's ways: the brooks, the river, and by night the frogs by either
      const b = nearestWater(x, y, z, Math.max(BROOK.far, FROGS.far), false, brookAt);
      if (b.d < BROOK.far) { const t = along(b.d, BROOK.near, BROOK.far); air.set('brook', (1 - t) * (1 - t), { pan: side(b.dx, b.dz, b.d0, b.d), far: t }); }
      else air.set('brook', 0);
      const r = nearestWater(x, y, z, Math.max(RIVER.far, FROGS.far), true, riverAt);
      if (r.d < RIVER.far) {
        const t = along(r.d, RIVER.near, RIVER.far), loud = (1 - t) * (1 - t), where = { pan: side(r.dx, r.dz, r.d0, r.d), far: t };
        let fd = Infinity;                                                // how far that stretch is from the nearest fall
        for (const f of falls) fd = Math.min(fd, Math.hypot(f.x - (x + r.dx), f.z - (z + r.dz)));
        const rush = 1 - along(fd, RAPIDS.near, RAPIDS.far);
        air.set('rapids', loud * Math.sqrt(rush), where);                 // (equal power: no dip between the two, no swell)
        drowned = Math.max(drowned, loud * Math.sqrt(rush));
        air.set('river', loud * Math.sqrt(1 - rush), where);
      } else { air.set('river', 0); air.set('rapids', 0); }
      const w = r.d < b.d ? r : b;
      if (w.d < FROGS.far && dark > 0.01) { const t = along(w.d, FROGS.near, FROGS.far); air.set('frogs', dark * dark * (1 - t) * (1 - t) * (1 - FROGS.drowned * fall), { pan: side(w.dx, w.dz, w.d0, w.d), far: t }); }
      else air.set('frogs', 0);

      // ---- the trees' crowns
      begin();
      const crowns = cursed ? null : level && level.crowns;
      if (crowns) for (const c of crowns) {
        const dx = c[0] - x, dz = c[2] - z, reach = LEAVES.far + c[3];
        if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
        const d0 = Math.hypot(dx, dz), d = Math.hypot(Math.max(0, d0 - c[3]), Math.max(0, Math.abs(c[1] - (y + 1.5)) - c[3] - LEAVES.over)), t = along(d, LEAVES.near, LEAVES.far);
        if (t < 1) add((1 - t) * (1 - t), side(dx, dz, d0, d), t);
      }
      put('leaves', wind * heard);

      // ---- the grass she goes through
      air.set('brush', throughGrass(speed, mode === 'ground' && !!level && !!level.surfaceAt && level.surfaceAt(x, z, y) === 'grass'));

      // ---- the windmill and the water wheel: how far from what turns (its reach counted, up and down too)
      for (const T of turning) {
        const m = T.m;
        if (!m) { air.set(T.name, 0); continue; }
        const dx = m.x - x, dz = m.z - z, d0 = Math.hypot(dx, dz), d = Math.hypot(Math.max(0, d0 - m.r), Math.max(0, Math.abs(m.y - (y + 1.5)) - m.r));
        const t = along(d, T.range.near, T.range.far), loud = (1 - t) * (1 - t), where = { pan: side(dx, dz, d0, d), far: t };
        air.set(T.name, m.water === false ? 0 : loud, where);
        // its wood, as a sail (or a few paddles) goes by: counted by the same turning as what is seen (and fetched as she comes
        // within hearing, before the first of it is due)
        if (loud > 0.003) air.ready(T.wood);
        T.round += dt * (m.turns || 0) * (m.blades || 1) / T.often.every;
        if (T.round >= 1) {
          T.round -= Math.floor(T.round);
          if (loud > 0.003 && Math.random() < T.often.often) air.hit(T.wood, loud * (1 - T.often.vary * Math.random()), where);
        }
      }

      // ---- the pit
      if (pit) {
        const dx = pit.x - x, dz = pit.z - z, d0 = Math.hypot(dx, dz), d = Math.max(0, d0 - pit.r), t = along(d, PIT.near, PIT.far);
        air.set('abyss', (1 - t) * (1 - t), { pan: side(dx, dz, d0, d), far: t });
      }
      air.update(dt);
    },
  };
}
