/* ==========================================================================
   blink.js  —  Vivi's blink (วาร์ป): she is gone from where she stands and there again a few metres on, in a burst of
   cyan light, afterimages of herself left along the way. Asked for on 24 Nov 2026 with ten seconds of a clip made with
   Gemini (a girl at night: sparks gather at her feet, a magic circle opens, a dome of light bursts round her and she
   runs off trailing cyan afterimages of herself and ribbons of light, and lands crouched on another circle in a splash
   of sparks): "ในวีดีโอมันวิ่ง แต่เราจะทำเป็น Blink แทน ให้เหมือนตัวละครวาร์ปได้ แต่ทำ effect คล้ายๆ ในวีดีโอ เอาเสียงใน
   วีดีโอมาใช้กับ effect Blink ได้ทำให้เข้ากัน" (in the clip she runs; here she blinks instead, warps, with an effect like
   the clip's, and the clip's own sound made to go with it). A trial, kept apart from the game: blink.html.
   One job: the move's rules. Where a blink takes her, and when she is gone and there again. What is seen is
   blink-fx.js, what is heard blink-sounds.js; the player (player-moves.js, createPlayer({ blink })) moves her.

     const blink = createBlink({ fx, heard })     fx: blink-fx.js's (or none), heard: blink-sounds.js's (or none)
     blink.plan(q)          where a blink would take her: q = { x, y, z (her feet), dir (the way: radians, 0 = +z),
                            size (her height / 1.75 m), standAt(x, z), footing(x, z) ('ground' | 'cliff' | 'water' |
                            'wall' | 'out', or none: all ground), depthAt(x, z), colliders, radius (the map's), confine
                            (a map that cannot say what its ground is like: its walls) }
                            -> { x, y, z, d } (where she comes down, and how far that is), or null: nowhere to go
     blink.ready            not cooling down from the last one
     blink.begin(from, to, size, character)   she blinks (from, to: her feet, now and there)
     blink.pace = 1         how fast the page runs (a page slowed to a half: 0.5): the sound is set by it
     blink.step(dt)         every frame (it cools down between blinks): -> where she is, { gone, u, done }: gone, she
                            is not to be seen; u, how far along her way she is (0..1, for the camera); done, she is
                            there (this frame)
     blink.stop()           it is broken off (another character, a teleport): she is wherever the player puts her
     blink.active, blink.time (s since the press), blink.count (blinks begun), blink.tries (ways looked along),
     blink.last (where the last look found to go: { x, y, z, d }, or null)  (for a page's label, or a test)

   THE RULES (BLINK, at 1.75 m; a smaller or bigger character goes as far for her size):
     - On the ground only (or wading no deeper than her knees), as the dash. Not in the air, on a face, swimming, nor
       while a spell has her.
     - The way the stick points, or with it let go the way she faces. She faces it as she goes.
     - As far as `reach` (6 m) along it, or as far as she can go that way: she is put down where she would last have
       stood. Looked along every `step` m:
         * a wall, a rock, a tree, a house (a thing with no top), the map's end: she stops short of it, her own breadth
           away (as she would walking into it);
         * a fence, a parapet, a barrel (a thing with a top: player-hurdle.js'): she goes over it, as the magic jump
           does in the air (not down on it);
         * the ground rising like a step more than `rise` (0.55 m) from one place to the next, or a cliff's face rising
           before her: she stops at its foot (she does not blink up a cliff: the climb is for that);
         * deep water, or a cliff's face falling away: she does not come down in it, but may go over it to ground on its
           far side as high as where she left the ground (within `gap` m up or down: over a brook, across a gully);
           no ground like that within reach, she stops at the edge.
       Nearer than `least` (0.8 m) there is nowhere to go: the press does nothing (as the dash into a wall).
     - Her body flashes cyan and she is gone at `vanish` (0.06 s), and there again `travel` later (0.075 s for a blink of
       `least`, 0.125 s for one of `reach`: she goes some 50 m/s): 0.19 s from the press to there, at the most. She is
       not seen between; the camera comes after her as it does after a run (player-camera.js: about 0.2 s).
     - What she was doing goes on: running, she runs on from there (a sprint, as after the dash); standing, she stands.
     - Not again until `cool` (0.55 s) after the press.
   ========================================================================== */

export const BLINK = {
  reach: 6.0,             // m she goes at most
  least: 0.8,             // m: nearer than this there is nowhere to go
  step: 0.1,              // m between the places looked at along her way
  body: 0.35,             // m: her breadth from her middle (player-moves.js' 0.28 at Vivi's 1.412: 0.35 at 1.75)
  rise: 0.55,             // m the ground may rise from one place to the next (a step up she could take)
  gap: 0.7,               // m up or down the ground beyond deep water or a gully may lie from where she left the ground
  wade: 0.4,              // m of water she may come down in (her knees: player-moves.js' 0.32 at 1.412)
  vanish: 0.06,           // s from the press that she is gone
  travel: [0.075, 0.125], // s from gone to there: a blink of `least`, of `reach`
  cool: 0.55,             // s from the press before another
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createBlink({ fx = null, heard = null } = {}) {
  let active = false, t = 0, cool = 0, count = 0, pace = 1, tries = 0, last = null;
  let gone = false, travel = BLINK.travel[1], character = null;
  const from = { x: 0, y: 0, z: 0 }, to = { x: 0, y: 0, z: 0 };

  // ---- where a blink would take her (THE RULES, above)
  function plan({ x, y, z, dir, size = 1, standAt, footing = null, depthAt = () => 0, colliders = [], radius = Infinity, confine = null }) {
    const dx = Math.sin(dir), dz = Math.cos(dir);
    const reach = BLINK.reach * size, step = BLINK.step * size, body = BLINK.body * size;
    const rise = BLINK.rise * size, gap = BLINK.gap * size, wade = BLINK.wade * size;
    let best = null, lastY = y, over = false, overFrom = y;
    const probe = { x: 0, z: 0 }, wall = { x: 0, y: 0, z: 0 };
    // a thing at (qx, qz) at the height hy: 'solid' (no top: it stops her), 'low' (a top: she goes over it), or none
    const thing = (qx, qz, hy) => {
      let low = false;
      for (const c of colliders) {
        const [cx, cz, cr, lo, hi, top] = c;
        if (lo !== undefined && (hy < lo || (hi !== undefined && hy > hi))) continue;
        const ex = qx - cx, ez = qz - cz, r = cr + body;
        if (ex * ex + ez * ez >= r * r) continue;
        if (top === undefined) return 'solid';
        low = true;
      }
      return low ? 'low' : null;
    };
    for (let d = step; d <= reach + 1e-6; d += step) {
      const qx = x + dx * d, qz = z + dz * d;
      if (Math.hypot(qx, qz) > radius) break;                                            // the map's end (where she may stand: player-moves.js' solids)
      if (confine) {                                                                     // (a map that cannot say: its walls)
        wall.x = qx; wall.y = lastY; wall.z = qz; probe.x = qx - dx * step; probe.z = qz - dz * step;
        confine(wall, { x: probe.x, y: lastY, z: probe.z });
        if (Math.hypot(wall.x - qx, wall.z - qz) > 0.02) break;
      }
      const f = footing ? footing(qx, qz) : 'ground';
      if (f === 'wall' || f === 'out') break;
      const hy = over ? overFrom : lastY;
      const what = thing(qx, qz, hy);
      if (what === 'solid') break;
      if (f === 'ground') {
        const gy = standAt(qx, qz);
        if (!over && gy - lastY > rise) break;                                           // a step up too tall: its foot
        if (over && Math.abs(gy - overFrom) > gap) continue;                             // beyond a gap, but not at her height: on
        over = false; lastY = gy;
        if (what === null && depthAt(qx, qz) <= wade) best = { x: qx, y: gy, z: qz, d };
        continue;
      }
      // a cliff's face, or deep water: rising before her, it is a wall; falling away (or water), she may go over it
      const fy = f === 'water' ? -Infinity : standAt(qx, qz);
      if (!over && fy > lastY + rise) break;
      if (!over) { over = true; overFrom = lastY; }
    }
    tries++;
    last = best && best.d >= BLINK.least * size ? best : null;
    return last;
  }

  return {
    plan,
    get ready() { return cool <= 0 && !active; },
    get active() { return active; },
    get time() { return t; },
    get count() { return count; },
    get tries() { return tries; },
    get last() { return last; },
    get pace() { return pace; },
    set pace(v) { pace = Math.max(0.05, +v || 1); },
    begin(a, b, size = 1, who = null) {
      Object.assign(from, a); Object.assign(to, b);
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      travel = BLINK.travel[0] + (BLINK.travel[1] - BLINK.travel[0]) * clamp((d / size - BLINK.least) / (BLINK.reach - BLINK.least), 0, 1);
      active = true; gone = false; t = 0; cool = BLINK.cool; count++;
      character = who;
      if (fx) fx.begin(from, to, size, character);
      if (heard) heard.blink(BLINK.vanish, BLINK.vanish + travel, pace);
    },
    step(dt) {
      cool = Math.max(0, cool - dt);
      if (!active) return { gone: false, u: 1, done: false };
      t += dt;
      if (!gone && t >= BLINK.vanish) { gone = true; if (fx) fx.vanish(from, to, travel, character); }
      const u = clamp((t - BLINK.vanish) / travel, 0, 1);
      if (u >= 1) { active = false; if (fx) fx.arrive(to, character); return { gone: false, u: 1, done: true }; }
      // (along her way out fast and slowing as she comes: where the camera is drawn after, and the ghosts are left)
      return { gone, u: gone ? 1 - (1 - u) * (1 - u) : 0, done: false };
    },
    stop() { if (active) { active = false; if (fx) fx.stop(character); } },
  };
}
