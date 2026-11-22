/* ==========================================================================
   spear-rain-anim.js  —  how she throws the lance up for the spear rain (spear-rain.js): hurled, not tossed
   ("อนิเมชั่นหลังชาจ มันเป็นท่าโยน อยากให้ animation เป็นขว้างขึ้นฟ้า ไม่ใช่โยน", 23 Nov 2026). The move was first played
   on the rising cast's clip (mc_rise: a crouch and her hand swept up from the ground, underhand: a toss). This makes
   a clip of its own, mc_sky, out of the game's lance throw (mc_throw: Kevin Iglesias' spear throw as
   tools/make-magic-combo-anim.py posed it for her; the same overhand throw she lets the lance go straight with), turned
   up at the sky. Nothing of the game's is changed: the clip is made from the game's clip's numbers as the page loads.

     import { withSkyThrow, SKY_THROW } from './spear-rain-anim.js'
     hero = await loadCharacter(VIVI_GLB, withSkyThrow({ ...CHARACTER_ANIM, clips: { ... } }))      mc_sky is among its clips
     SKY_THROW { clip, dur, let, again }      its name, how long it is, when the lance leaves her hand, when she may act (s)

   What is made of the throw (all of it about the line across her, so in the plane she throws in):
     - WOUND UP. It begins where the throw does, in the pose she holds the lance in (so held, then flicked, no pose is
       jumped to), and for `wind` s hardly goes on: instead her back goes further over (to `back` degrees behind upright)
       and her throwing arm is let down behind her (`arm` degrees): she is drawn like a bow, her other hand up at the sky.
     - THROWN UP. Then the throw's own whip, as fast as it was made: her arm comes up and over out of that depth, and
       because all of her above the hips is still turned back, it comes through pointing up, not ahead. The lance
       leaves her hand `let` s in, her arm up behind her head and going up.
     - REACHING. The throw's own end is a deep bow forward after a thing thrown ahead. Here her arm is slowed as it
       comes over (it stays up: she reaches after the lance) and her back is kept from the bow (to `reach` degrees
       behind upright while she reaches), her head back, looking after it; then the throw's own way back to standing,
       her feet stepping as its do (they are the throw's own all through: both on the ground).
   It ends in the pose the throw ends in, her standing pose.
   ========================================================================== */

// from: the clip it is made of; when (s): wind, let, hang (to when she has reached), dur; again: when she may act
// where in `from` (s) those moments lie: its first moments, its let go, a little after for her body and less for her arm
export const SKY_THROW = { clip: 'mc_sky', from: 'mc_throw', dur: 1.0, wind: 0.19, let: 0.3, hang: 0.5, again: 0.5,
  at: { wind: 0.02, let: 0.11, body: 0.17, arm: 0.128 },
  back: 40, thrown: 26, reach: 12,      // degrees her chest is behind upright: wound up, as it leaves her hand, as she reaches
  arm: [34, 46, 10],                    // degrees more her throwing arm is turned back about her shoulder: at those three moments
  head: [0, 6, 14],                     // degrees more her head is back
  share: [0.4, 0.35, 0.25] };           // of the turning of her back: spine, chest, upper chest

const SPINE = ['J_Bip_C_Spine', 'J_Bip_C_Chest', 'J_Bip_C_UpperChest'];
const HIPS = 'J_Bip_C_Hips', NECK = 'J_Bip_C_Neck', HEAD = 'J_Bip_C_Head', SHOULDER = 'J_Bip_R_Shoulder', UPPER = 'J_Bip_R_UpperArm';

// ---- quaternions as [x, y, z, w]
const mul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const conj = q => [-q[0], -q[1], -q[2], q[3]];
const unit = q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
// about the line across her (the clip's x): by so many degrees, her top going back (she faces the clip's -z)
const over = deg => { const h = deg * Math.PI / 360; return [Math.sin(h), 0, 0, Math.cos(h)]; };
const upOf = q => { const [x, y, z, w] = q; return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)]; };      // where q turns straight up to
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
  if (d > 0.9995) return unit([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
  const th = Math.acos(d), s = Math.sin(th), p = Math.sin((1 - t) * th) / s, r = Math.sin(t * th) / s;
  return [a[0] * p + b[0] * r, a[1] * p + b[1] * r, a[2] * p + b[2] * r, a[3] * p + b[3] * r];
}
// a curve through points [[t, v] ...] that never goes past them (no swing beyond a point: a monotone cubic)
function curve(pts) {
  const n = pts.length, h = [], d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h.push(pts[i + 1][0] - pts[i][0]); d.push((pts[i + 1][1] - pts[i][1]) / h[i]); }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 3 * (h[i - 1] + h[i]) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]);
  return t => {
    if (t <= pts[0][0]) return pts[0][1];
    if (t >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0; while (t > pts[i + 1][0]) i++;
    const u = (t - pts[i][0]) / h[i], u2 = u * u, u3 = u2 * u;
    return pts[i][1] * (2 * u3 - 3 * u2 + 1) + h[i] * m[i] * (u3 - 2 * u2 + u) + pts[i + 1][1] * (-2 * u3 + 3 * u2) + h[i] * m[i + 1] * (u3 - u2);
  };
}

// the clip (as stylized-character.js reads one: { duration, frames, loop, speed, tracks, hips }), made of anim's throw
export function skyThrowClip(anim, S = SKY_THROW) {
  const src = anim.clips[S.from];
  if (!src) return null;
  const rate = (src.frames - 1) / src.duration, last = src.frames - 1;
  // the throw's own pose a moment into it: a bone's turning, her hips' place
  const turn = (bone, s) => {
    const v = src.tracks[bone];
    if (v.length === 4) return [v[0], v[1], v[2], v[3]];
    const f = Math.min(last, Math.max(0, s * rate)), i = Math.min(last - 1, Math.floor(f)), a = i * 4, b = a + 4;
    return slerp([v[a], v[a + 1], v[a + 2], v[a + 3]], [v[b], v[b + 1], v[b + 2], v[b + 3]], f - i);
  };
  const place = s => {
    const f = Math.min(last, Math.max(0, s * rate)), i = Math.min(last - 1, Math.floor(f)), u = f - i, a = i * 3, b = a + 3;
    return [0, 1, 2].map(j => src.hips[a + j] + (src.hips[b + j] - src.hips[a + j]) * u);
  };
  // how far forward of upright her chest is in the throw (degrees; behind it: less than 0)
  const chest = s => { let w = turn(HIPS, s); for (const b of SPINE) w = mul(w, turn(b, s)); const up = upOf(w); return Math.atan2(-up[2], up[1]) * 180 / Math.PI; };
  // when in the throw each moment of this clip is: her body, and her throwing arm (slower over the top)
  const body = curve([[0, 0], [S.wind, S.at.wind], [S.let, S.at.let], [S.hang, S.at.body], [S.dur, src.duration]]);
  const armAt = curve([[0, 0], [S.wind, S.at.wind], [S.let, S.at.let], [S.hang, S.at.arm], [S.dur, src.duration]]);
  // where her chest is to be, and how much of that is asked (all of it until she has reached; then the throw's own way back)
  const want = curve([[0, chest(0)], [S.wind, -S.back], [S.let, -S.thrown], [S.hang, -S.reach], [S.dur, -S.reach]]);
  const asked = curve([[0, 1], [S.hang, 1], [S.hang + 0.35, 0], [S.dur, 0]]);
  const armBack = curve([[0, 0], [S.wind, S.arm[0]], [S.let, S.arm[1]], [S.hang, S.arm[2]], [S.hang + 0.25, 0], [S.dur, 0]]);
  const headBack = curve([[0, 0], [S.wind, S.head[0]], [S.let, S.head[1]], [S.hang, S.head[2]], [S.hang + 0.3, 0], [S.dur, 0]]);

  const frames = Math.round(S.dur * anim.fps) + 1, tracks = {}, hips = [];
  const ARM = bone => bone.startsWith('J_Bip_R_') && !/Leg|Foot|Toe/.test(bone);
  for (const bone of Object.keys(src.tracks)) tracks[bone] = [];
  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1) * S.dur, sb = body(t), sa = armAt(t);
    const lean = (chest(sb) - want(t)) * asked(t);
    const q = {};
    for (const bone of Object.keys(src.tracks)) q[bone] = turn(bone, ARM(bone) ? sa : sb);
    // her back: each part of it turned back about the line across her, by its share
    let w = q[HIPS];
    SPINE.forEach((bone, i) => {
      const to = mul(over(lean * S.share[i]), mul(w, q[bone]));
      q[bone] = unit(mul(conj(w), to)); w = to;
    });
    // her throwing arm, about her shoulder; her head
    const sh = mul(w, q[SHOULDER]);
    q[UPPER] = unit(mul(conj(sh), mul(over(armBack(t)), mul(sh, q[UPPER]))));
    const nk = mul(w, q[NECK]);
    q[HEAD] = unit(mul(conj(nk), mul(over(headBack(t)), mul(nk, q[HEAD]))));
    for (const bone of Object.keys(src.tracks)) tracks[bone].push(...q[bone].map(v => +v.toFixed(4)));
    hips.push(...place(sb).map(v => +v.toFixed(4)));
  }
  return { duration: S.dur, frames, loop: false, speed: 0, tracks, hips };
}

// anim with mc_sky among its clips (anim itself is not changed)
export function withSkyThrow(anim, S = SKY_THROW) {
  const clip = skyThrowClip(anim, S);
  return clip ? { ...anim, clips: { ...anim.clips, [S.clip]: clip } } : anim;
}
