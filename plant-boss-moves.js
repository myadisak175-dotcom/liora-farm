/* ==========================================================================
   plant-boss-moves.js  —  how the plant boss fights. Each head has its own job and its own blow: the right head
   (toward +x) lashes with the thorned vines, the middle head spits pollen, the left head (toward -x) calls thorn
   roots up out of the ground. They take turns: one blow at a time, and the head whose blow it is roars first. Each
   head can be struck and beaten on its own: a beaten head falls and stays down, its blow is gone, and the heads
   still up grieve it, then fight harder. When all three are down, it dies. And one great blow of all of it
   together: the bramble. One job: act all that. It builds nothing, draws nothing and keeps no score: it only sets
   the numbers plant-boss.js gives its heads, vines and body (boss.userData) and calls boss.userData.pose(). (How
   much a head can take before it is beaten is the game's to say; so is everything that flies: see the events.)

     const moves = createBossMoves(boss, { snaps })   snaps: standing, its heads now and then dart at her and bite the
                                                     air (true, as it starts); false: they only watch her
     every frame: moves.update(dt, player)     player: where she stands (her feet, world, a Vector3)
     moves.play('whip' | 'spit' | 'roots')     a head's blow (BOSS_OWNERS says whose). false if that head is down,
                                               or another blow is under way, or it is dying, dead or coming up
     moves.play('bramble')                     the great blow (below)
     moves.play('hit', head)                   that head (0: middle, 1: right, 2: left) is struck: it flinches, over
                                               whatever it is doing (a blow it is striking goes on). false if it is down,
                                               or shut away in the bud
     moves.play('down', head)                  that head is beaten: a cry, and it falls and stays down. If it was
                                               striking, its blow stops. The last head down: the whole of it dies
     moves.play('die')                         the heads still up go down, one after another, and it dies
     moves.play('rise')                        (it goes under first, if it is up.) It comes up out of the ground, whole
     moves.state        'idle' (it stands and watches her), a blow's name, 'die', 'dead' or 'rise'
     moves.isDown(head)
     moves.shut         true while the heads are shut away in the bud: they cannot be struck
     moves.open         true while they pant after the bramble: worn out, wide open (how much more a blow then takes is
                        the game's to say)
     moves.onEvent = e => ...                  what the game needs to know, as it happens:
         { type: 'roar', move, head }                       a head roars: its blow is coming (no head: all of them)
         { type: 'warn', move, head, shape, lead, lasts }   where the blow will land (a ground-warning.js shape,
                                                            world), in how many seconds, and how long it lasts.
                                                            (The bramble: one for each patch of thorns, with wave
                                                            0, 1, 2, and no head: it is all of them)
         { type: 'hit', move, head, shape }                 it lands now: whoever stands in the shape is struck
         { type: 'cancel', move, head }                     its head went down before it was over: the warning goes
         { type: 'down', head }                             a head is beaten
         { type: 'shut' | 'bloom', move: 'bramble' }        the bud is shut over the heads; it bursts open
         { type: 'burst' | 'roar', move: 'rise' }           it breaks out of the ground; it roars
         { type: 'end', move }                              a blow, its dying, or its coming up, is over
     moves.rest()                              as built at once (all heads up, vines away): for when something else acts it

   Every blow has the same four beats, so it can be read, dodged in a real-time fight or simply watched in a
   turn-based one: its head roars (the tell), the warning shows on the ground and fills while the head makes ready,
   it strikes (the 'hit'), it comes back. BOSS_MOVES holds the times.

   The heads (their ways, as in the talking scene)
     middle  the leader: a steady glare, seldom snaps. It roars drawn up tall, slow and deep. Its blow, spit: it draws
             back and up breathing in, then thrusts out at her and holds, its mouth wide (the pollen is the game's to
             draw); the other two lean out of its way
     right   hot-headed, never still, snaps at her often. It roars lunging at her, shaking with rage. Its blow, whip: a
             thorned vine comes up out of the ground on her side, rears back and sweeps low across where she stands;
             the head draws back, then shouts it on
     left    a trickster: grins, sways, now and then glances at the others and snickers. It roars with its head thrown
             back at the sky, for show. Its blow, roots: it stoops and follows the root with its eyes as it burrows
             out to her (the game's to draw), grinning, the ground shaking; then it flings its head up as the thorns
             break out under where she stood, and cackles
   Struck: that head flashes and flinches back, eyes screwed up. Beaten: a cry; its neck gives way and it comes down to
   the ground, its eyes go out, it dries. The others look at it, aghast, then sorrowful, then turn on her and roar;
   from then on they glare harder and snap more often. All three down: its skirt wilts and all its colours dry.
   The bramble: the heads still up rear up and roar at the sky together; then they draw down, growing small, as the
   skirt's leaves curl up one after another round the ring and wind shut into a bud over them. The bud glows from
   within and beats like a heart. Three waves of thorn patches break out round her (each wave has one patch where
   she stands and more round it, with a way out left open; each comes sooner after its warning than the last): the
   bud's light swells as a wave's warning fills, and it clenches and flares as the thorns break out. Then it bursts
   open, the heads spring out, and hang there worn out, panting, eyes half shut: the moment to strike them. (The
   thorns are thorn-spikes.js's, the roots that run to each patch root-trails.js's.)
   Coming up: three small harmless heads look out of the ground, wide-eyed, bobbing; then a sly look, a rumble, and it
   bursts up as a bud that springs open, and roars at her.
   Nothing snaps: reaches and turns go through springs (a soft heavy limb overshoots and settles), faces ease.
   ========================================================================== */
import * as THREE from 'three';
import { BOSS_HEAD_REST, aimHead } from './plant-boss.js';

// when each move's beats fall (seconds from its start): roar: how long its head roars first; warn: the warning shows;
// hit: the blow lands; lasts: for how long
export const BOSS_MOVES = {
  whip:  { length: 4.1, roar: 0.6, warn: 0.9, hit: 2.4, lasts: 0.3 },
  spit:  { length: 4.05, roar: 0.65, warn: 0.7, hit: 1.8, lasts: 1.35 },
  roots: { length: 3.9, roar: 0.7, warn: 0.75, hit: 2.1, lasts: 0.55 },
  // the great blow: when the bud is shut, bursts open, the heads are worn out (open), and recover; each wave's warning
  // and the moment its thorns break out; how many patches each wave has, how wide one is (metres), how long it stands
  bramble: { length: 11.7, shut: 2.1, burst: 7.3, open: 7.75, tired: 10.7, waves: [[2.4, 3.7], [4.1, 5.2], [5.6, 6.5]], patches: [5, 7, 9], radius: 1.6, lasts: 0.55 },
  hit:   { length: 0.65 },                                                  // a head's flinch (over whatever it does)
  down:  { length: 2.8 },                                                   // a head going down (then it stays down)
  rise:  { length: 8.0, down: 0.6, sly: 4.2, burst: 4.8, roar: 6.05 },      // (its beats are counted from when it is under the ground)
};
export const BOSS_OWNERS = { whip: 1, spit: 0, roots: 2 };                 // whose blow each is
const DEEP = 3.6;                               // metres down, only its heads look out of the ground
export const BOSS_DEEP = DEEP;
const C = 0, R = 1, L = 2;                      // the heads: middle, toward +x, toward -x
const FACE = ['jaw', 'lid', 'slant', 'smile', 'size', 'flare', 'brow', 'curve', 'glow'];
// how each head stands to fight: its face, how far it leans at her, how much its neck waves, how often it snaps at her
// (seconds; more often the more of them are down), a habit of its own; and how it roars: how far it rears up and
// reaches at her (metres), how hard and fast it shakes, how its face is tipped, its eyes and mouth
const PERSONA = [
  { face: { lid: 0.85, slant: 0.45, flare: 0.2, curve: -0.5 }, lean: 0.2, wave: 0.8, snap: 8.5,                   // middle: the leader, a steady glare
    roar: { up: 0.75, at: 0.15, shake: 0.03, hz: 34, nod: -0.34, slant: 0.9, curve: -1 } },                       //   drawn up tall, slow and deep
  { face: { lid: 0.95, slant: 0.85, flare: 0.6, curve: -0.9 }, lean: 0.32, wave: 1.0, snap: 4.6, fidget: true,    // right: hot-headed, never still
    roar: { up: 0.15, at: 0.95, shake: 0.075, hz: 57, nod: -0.08, slant: 1, curve: -1 } },                        //   lunging at her, shaking with rage
  { face: { lid: 0.7, slant: 0.3, flare: 0.25, curve: 0.75 }, lean: 0.15, wave: 1.1, snap: 7.5, sly: true,        // left: a trickster, grinning
    roar: { up: 0.7, at: -0.3, shake: 0.045, hz: 44, nod: -0.5, slant: 0.5, curve: 0.9, sky: true } },            //   head thrown back at the sky, for show
];
// a beaten head: the way it falls (x, z) and how far out it lies. Dying with heads still up, the order they go in
const FALLS = [[0.25, 1, 3.3], [0.85, 0.52, 2.7], [-0.85, 0.52, 2.7]];
const DIE_ORDER = [R, L, C];
const FRONT = new THREE.Vector3(0, 0, 2.6);    // (a head looks a little in front of another, not at the back of its head)

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sstep = (a, b, t) => { const x = seg(t, a, b); return x * x * (3 - 2 * x); };
const pulse = (t, a, b, c, d) => sstep(a, b, t) * (1 - sstep(c, d, t));            // up from a to b, held, down from c to d
const outBack = x => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);      // arrives, goes a little past, settles
const dirAt = a => new THREE.Vector3(Math.sin(a), 0, Math.cos(a));                 // a way along the ground: radians from +z toward +x
// a soft heavy thing going to where it is sent (w: how quick, z: how damped)
function spring(s, to, dt, w, z) { s.v += (w * w * (to - s.x) - 2 * z * w * s.v) * dt; s.x += s.v * dt; return s.x; }

export function createBossMoves(boss, { snaps = true } = {}) {
  const { heads, vines, body, pose, size } = boss.userData;
  const sp = () => ({ x: 0, v: 0 });
  const S = heads.map(() => ({ yaw: sp(), nod: sp(), tilt: sp(), lx: sp(), ly: sp(), lz: sp(), bx: sp(), by: sp(), bz: sp(), sc: { x: 1, v: 0 } }));
  // what each head is told this frame, before the springs: where it looks, how it is carried, its face
  const P = heads.map(() => ({ at: null, share: 0.8, most: 0.75, lean: new THREE.Vector3(), bow: new THREE.Vector3(), yaw: 0, nod: 0, nodMax: 0.3, tilt: 0, wave: 0.95, quick: 1, scale: 1, face: {} }));
  const tgt = new THREE.Vector3(0, 0, 9), chest = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const dirs = heads.map(() => new THREE.Vector3(0, 0, 1));                       // from each head toward her, along the ground
  const ctx = {
    t: 0, vine: 0, aim: 0, reach: 6, spot: new THREE.Vector3(), from: 0, wasDead: false, fired: {},
    down: [null, null, null],         // each head: null while it is up; else seconds since it went down (less than 0: it will, as it dies)
    flinch: [9, 9, 9],                // seconds since each was struck
    mourn: null,                      // { head, t }: the others grieving a head that has just gone down
    wiltFrom: 1, dieLength: 4.4,
    patches: [],                      // the bramble's patches of each wave (in its own space): [{ x, z }]
  };
  const me = { state: 'idle', time: 0, onEvent: null, shut: false, open: false, play, update, rest, isDown };

  const toWorld = v => boss.localToWorld(tmp.copy(v).multiplyScalar(size)).clone();
  const turned = () => boss.rotation.y;
  function tell(type, extra = {}) { if (me.onEvent) me.onEvent({ type, move: me.state, ...extra }); }
  function once(key, when, fn) { if (me.time >= when && !ctx.fired[key]) { ctx.fired[key] = true; fn(); } }
  function isDown(i) { return ctx.down[i] !== null && ctx.down[i] >= 0; }
  const downCount = () => [C, R, L].filter(isDown).length;
  const striking = () => BOSS_OWNERS[me.state] ?? (me.state === 'bramble' && me.time < BOSS_MOVES.bramble.burst ? -1 : undefined);      // the head whose blow is under way (-1: all of them; undefined: none)

  function play(name, head) {
    const busy = me.state === 'die' || me.state === 'dead' || me.state === 'rise';
    if (name === 'hit' || name === 'down') {
      if (!(head >= 0 && head < 3) || ctx.down[head] !== null || busy || me.shut) return false;
      if (name === 'hit') ctx.flinch[head] = 0;
      else { ctx.down[head] = 0; wentDown(head); }
      return true;
    }
    if (name === 'die') {
      if (busy) return false;
      stopBlow();
      const up = DIE_ORDER.filter(i => ctx.down[i] === null);
      up.forEach((i, k) => { ctx.down[i] = -(k * 0.6) - 1e-4; });                // (they go one after another)
      startDying((up.length - 1) * 0.6 + 1.0);
      return true;
    }
    if (name === 'rise') {
      if (me.state === 'die' || me.state === 'rise') return false;
      stopBlow();
      ctx.wasDead = me.state === 'dead'; ctx.from = body.sink;
      me.state = 'rise'; me.time = 0; ctx.fired = {};
      return true;
    }
    if (name === 'bramble') {
      if (me.state !== 'idle') return false;
      me.state = name; me.time = 0; ctx.fired = {}; ctx.patches = [];
      return true;
    }
    // a head's blow
    const owner = BOSS_OWNERS[name];
    if (owner === undefined || me.state !== 'idle' || ctx.down[owner] !== null) return false;
    me.state = name; me.time = 0; ctx.fired = {};
    if (name === 'whip') {
      ctx.vine = tgt.x >= 0 ? 0 : 1;                                              // the vine on her side
      const f = vines[ctx.vine].foot;
      ctx.aim = Math.atan2(tgt.x - f.x, tgt.z - f.z);
      ctx.reach = clamp(Math.hypot(tgt.x - f.x, tgt.z - f.z) + 0.8, 4.2, vines[ctx.vine].length - 0.6);
    }
    return true;
  }
  // a blow stopped before it was over (its head went down, or it dies, or it goes under)
  function stopBlow() {
    const owner = striking();
    if (owner === undefined) return;
    tell('cancel', owner >= 0 ? { head: owner } : {});
    me.state = 'idle'; me.time = 0;                                              // (a vine left out draws back by itself)
  }
  function wentDown(i) {
    tell('down', { head: i });
    if (me.state === 'die') return;                                              // (it is dying: they all go)
    if (striking() === i) stopBlow();
    if (downCount() === 3) { startDying(1.0); return; }
    ctx.mourn = { head: i, t: 0 };
  }
  function startDying(wiltFrom) { me.state = 'die'; me.time = 0; ctx.fired = {}; ctx.wiltFrom = wiltFrom; ctx.dieLength = wiltFrom + 3.4; ctx.mourn = null; }
  function hide(v) { v.width = 0; v.footY = -1; v.p1.set(v.foot.x, -1, v.foot.z); v.p2.copy(v.p1); v.p3.copy(v.p1); }
  function rest() {
    me.state = 'idle'; me.time = 0;
    ctx.down = [null, null, null]; ctx.flinch = [9, 9, 9]; ctx.mourn = null; ctx.patches = []; me.shut = me.open = false;
    for (const v of vines) hide(v);
    body.skirt = 0; body.swirl = 0; body.glow = 0; body.wither = 0; body.flash = 0; body.sink = 0; body.shake.set(0, 0, 0);
    for (const l of [...body.leaves, body.ring]) l.lift = l.stir = 0;
    for (const h of heads) { Object.assign(h, BOSS_HEAD_REST); h.lean.set(0, 0, 0); h.bow.set(0, 0, 0); for (const k in S[h.index]) { S[h.index][k].x = k === 'sc' ? 1 : 0; S[h.index][k].v = 0; } }
    pose();
  }

  // ---- how it stands to fight: every head on her, each in its own way. snaps: now and then one darts at her and bites
  // the air twice. With heads down, the others glare harder, lean in further and snap more often
  function stance(snaps = true) {
    const rage = downCount();
    for (const h of heads) {
      const i = h.index, p = P[i], who = PERSONA[i], n = i * 2.1, d = dirs[i];
      p.at = chest;
      Object.assign(p.face, who.face);
      p.face.jaw = 0.3 + 0.06 * Math.sin(ctx.t * 1.7 + n);
      if (rage) Object.assign(p.face, { slant: Math.min(1, who.face.slant + 0.3 * rage), flare: Math.min(1, who.face.flare + 0.35 * rage), curve: -0.8, lid: 0.95 });
      const lean = who.lean + 0.12 * rage;
      p.lean.set(d.x * lean, 0.1 * Math.sin(ctx.t * 1.3 + n), d.z * lean);
      p.wave = who.wave + 0.2 * rage;
      if (who.fidget) p.yaw = 0.07 * Math.sin(ctx.t * 6.3) * (0.5 + 0.5 * Math.sin(ctx.t * 0.9));         // it cannot keep still
      if (who.sly) {
        p.tilt = 0.14 * Math.sin(ctx.t * 1.2 + n);                                                     // it sways, head on one side
        const u = (ctx.t + 3) % 7.3, k = rage ? 0 : pulse(u, 0, 0.2, 1.15, 1.45);                      // a glance at the others, and a snicker
        if (k > 0) {
          if (k > 0.3) p.at = tmp2.copy(heads[u < 0.7 ? C : R].centre).add(FRONT).clone();
          p.face.smile = k; p.face.curve = lerp(p.face.curve, 1, k);
          p.face.jaw = lerp(p.face.jaw, 0.45 + 0.35 * Math.abs(Math.sin(ctx.t * 11)), k);
          p.lean.y += 0.07 * Math.sin(ctx.t * 11) * k;
          p.quick = 2;
        }
      }
      const every = who.snap / (1 + 0.7 * rage), u = (ctx.t + n * 1.9) % every;
      if (snaps && u < 0.9) {
        p.lean.addScaledVector(tmp.set(d.x, -0.15, d.z), 0.75 * pulse(u, 0, 0.18, 0.55, 0.9));
        Object.assign(p.face, { jaw: u < 0.2 ? 0.95 : (u < 0.34 ? 0.02 : (u < 0.5 ? 0.9 : 0.05)), flare: 0.9, slant: 0.9, smile: 0, curve: -0.8 });
        p.quick = 3;
      }
    }
  }

  // ---- a head's roar, before its blow: a short pull back, then it rears and bellows, shaking, in its own way.
  // t: seconds into its move; len: how long it roars. (Called last by its move: it is laid over the move's own start)
  function roars(i, t, len) {
    if (t > len + 0.15) return;
    once('roar', 0.12, () => tell('roar', { head: i }));
    const p = P[i], d = dirs[i], r = PERSONA[i].roar, pull = pulse(t, 0, 0.07, 0.1, 0.2), k = pulse(t, 0.1, 0.24, len - 0.1, len + 0.15);
    p.lean.lerp(tmp.set(-d.x * 0.35, -0.12, -d.z * 0.35), pull);
    p.lean.lerp(tmp.set(d.x * r.at + Math.sin(t * r.hz) * r.shake, r.up + Math.sin(t * r.hz * 1.13 + 1) * r.shake, d.z * r.at + Math.cos(t * r.hz * 0.9) * r.shake), k);
    p.bow.multiplyScalar(1 - k);
    p.nod = lerp(p.nod, r.nod, k); p.yaw = lerp(p.yaw, 0, k); p.tilt = lerp(p.tilt, 0, k);
    if (r.sky && k > 0.5) p.at = null;
    for (const [key, v] of Object.entries({ jaw: 1, flare: 1, slant: r.slant, size: 1.15, curve: r.curve, smile: 0, lid: 1 })) p.face[key] = lerp(p.face[key], v, k);
    p.quick = Math.max(p.quick, 1 + 1.6 * k);
    body.shake.x += Math.sin(t * 61) * 0.02 * k; body.shake.z += Math.sin(t * 47) * 0.02 * k;
    body.skirt = Math.min(body.skirt, -0.12 * k);                                 // (its skirt spreads a little as it bellows)
  }

  // ---- the right head's whip: it roars; a vine out of the ground on her side, reared back, then swept low across where she stands
  function whip(tt) {
    const m = BOSS_MOVES.whip, v = vines[ctx.vine], s = ctx.vine === 0 ? 1 : -1, t = tt - m.roar;       // (t: seconds since the roar)
    const a0 = ctx.aim + s * 1.3, a1 = ctx.aim - s * 1.0;                         // drawn back out to its own side; the sweep ends past her
    once('warn', m.warn, () => { const f = toWorld(tmp.set(v.foot.x, 0, v.foot.z)); tell('warn', { head: R, shape: ctx.shape = { kind: 'fan', x: f.x, y: f.y, z: f.z, radius: (ctx.reach + 0.4) * size, from: Math.min(a0, a1) + turned(), to: Math.max(a0, a1) + turned() }, lead: m.hit - m.warn, lasts: m.lasts }); });
    once('hit', m.hit, () => tell('hit', { head: R, shape: ctx.shape }));
    const grow = sstep(0, 0.55, t) * (1 - sstep(2.85, 3.4, t));                   // out of the ground, and back into it
    const rear = sstep(0.2, 1.1, t) * (1 - sstep(1.45, 1.68, t)) + 0.75 * sstep(2.1, 2.7, t);      // reared up and back (1) or laid low (0)
    const sweep = x => { const q = seg(x, 1.45, 2.05); return a0 + (a1 - a0) * q * q * (3 - 2 * q); };
    const sway = Math.sin(t * 6.5) * 0.3 * rear;                                  // it weaves while it is up
    // the base of the vine leads the sweep and its end trails: a whip
    const d1 = dirAt(sweep(t) + sway * 0.3), d2 = dirAt(sweep(t - 0.06) + sway * 0.6), d3 = dirAt(sweep(t - 0.13) + sway);
    // (laid low: out along the ground to its reach. Reared: up, leaning out to its own side, its end hooked back over)
    const at = (dir, low, lowY, up, upY) => tmp.set(dir.x * lerp(low, up, rear), lerp(lowY, upY, rear), dir.z * lerp(low, up, rear)).multiplyScalar(grow);
    v.p1.copy(v.foot).add(at(d1, 0.9, 1.0, 1.7, 2.0));
    v.p2.copy(v.foot).add(at(d2, ctx.reach * 0.55, 0.9, 2.5, 5.4));
    v.p3.copy(v.foot).add(at(d3, ctx.reach, 0.45, 0.5, 6.2));
    v.width = sstep(0, 0.3, grow); v.footY = -0.4 * (1 - grow);
    // the right head sends the vine (draws back, then shouts it on); the others watch her, pleased
    stance(false);
    const back = pulse(t, 0.3, 1.0, 1.45, 1.6), go = pulse(t, 1.5, 1.68, 2.0, 2.6);
    for (const h of heads) {
      const p = P[h.index], d = dirs[h.index];
      if (h.index === R) {
        p.lean.set(d.x * (-0.65 * back + 0.95 * go), 0.3 * back - 0.2 * go, d.z * (-0.65 * back + 0.95 * go));
        p.bow.set(-d.x * 0.4 * back, 0, -d.z * 0.4 * back);
        p.nod = -0.16 * back + 0.06 * go; p.yaw = 0;
        Object.assign(p.face, { jaw: lerp(0.25, 1, go), slant: 0.9, flare: Math.max(0.8 * back, go), size: 1 + 0.12 * go });
        p.quick = 1 + 2 * go;
      } else {
        Object.assign(p.face, { lid: 0.75, slant: 0.6, curve: 0.7, smile: 0, jaw: 0.3 + 0.5 * go });
      }
    }
    roars(R, tt, m.roar);
  }

  // ---- the middle head's spit: it roars; it draws back breathing in, thrusts out at her and holds; the other two lean out of its way
  function spit(tt) {
    const m = BOSS_MOVES.spit, d = dirs[C], t = tt - m.roar;                      // (t: seconds since the roar)
    once('warn', m.warn, () => {
      const a = Math.atan2(d.x, d.z), o = toWorld(tmp.set(heads[C].centre.x + d.x * 1.6, 0, heads[C].centre.z + d.z * 1.6));
      const far = clamp(Math.hypot(tgt.x - heads[C].centre.x, tgt.z - heads[C].centre.z) + 2.5, 7, 11.5);
      tell('warn', { head: C, shape: ctx.shape = { kind: 'fan', x: o.x, y: o.y, z: o.z, radius: far * size, from: a - 0.4 + turned(), to: a + 0.4 + turned() }, lead: m.hit - m.warn, lasts: m.lasts });
    });
    once('hit', m.hit, () => tell('hit', { head: C, shape: ctx.shape }));
    stance(false);
    const breath = pulse(t, 0.0, 0.8, 0.95, 1.12), out = sstep(0.95, 1.15, t) * (1 - sstep(2.5, 3.1, t));
    const p = P[C], k = -1.0 * breath + 2.1 * out;
    p.lean.set(d.x * k + Math.sin(t * 47) * 0.04 * out, 0.5 * breath - 0.45 * out + Math.sin(t * 53) * 0.03 * out, d.z * k);
    p.bow.set(-d.x * 0.7 * breath, 0.6 * out, -d.z * 0.7 * breath);
    p.nod = -0.28 * breath - 0.24 * out;                                          // (its face kept up as it reaches down at her: its mouth is what she must see)
    Object.assign(p.face, { jaw: Math.max(lerp(0.3, 0.72, breath), out), lid: lerp(0.9, 0.7, breath), slant: lerp(0.7, 0.95, out), size: 1 + 0.12 * out, flare: Math.max(0.8 * breath, out) });
    p.quick = 1 + 2 * sstep(0.9, 1.0, t) * (1 - sstep(1.2, 1.4, t)); p.wave = 0.5;
    for (const i of [R, L]) {                                                     // out of its way, squinting while it sprays
      const q = P[i], side = i === R ? 1 : -1, away = 0.6 * breath + out;
      q.lean.set(side * 0.55 * away, -0.1 * away, -0.25 * away);
      q.yaw = 0;
      Object.assign(q.face, { lid: lerp(q.face.lid, 0.6, out), jaw: 0.2, smile: 0 });
    }
    roars(C, tt, m.roar);
  }

  // ---- the left head's roots: it throws its head back and roars; then it stoops and follows the root with its eyes as
  // it burrows out to her, grinning, the ground shaking; then it flings its head up ("up!") as the thorns break out
  // under where she stood, and cackles
  function roots(t) {
    const m = BOSS_MOVES.roots;
    once('warn', m.warn, () => { ctx.spot.copy(tgt); const o = toWorld(ctx.spot); tell('warn', { head: L, shape: ctx.shape = { kind: 'ring', x: o.x, y: o.y, z: o.z, radius: 2.4 * size }, lead: m.hit - m.warn, lasts: m.lasts }); });
    once('hit', m.hit, () => tell('hit', { head: L, shape: ctx.shape }));
    stance(false);
    const p = P[L], d = dirs[L];
    const run = Math.pow(seg(t, m.warn, m.hit), 1.25), stoop = pulse(t, m.roar, m.roar + 0.3, m.hit - 0.14, m.hit - 0.02);
    const fling = pulse(t, m.hit - 0.1, m.hit + 0.05, m.hit + 0.35, m.hit + 0.6), cackle = pulse(t, m.hit + 0.35, m.hit + 0.6, m.length - 0.75, m.length - 0.2), laugh = Math.sin(t * 11.5);
    // stooped: low and forward, head on one side, its eyes on the root as it runs out along the ground to where she stood
    if (stoop > 0.3) { p.at = tmp2.set(ctx.spot.x * run, 0.2, ctx.spot.z * run + 2.2 * (1 - run)).clone(); p.share = 0.95; p.most = 0.9; }
    p.lean.lerp(tmp.set(d.x * 0.75, -1.2 + 0.05 * Math.sin(t * 14), d.z * 0.75), stoop);
    p.bow.set(-d.x * 0.3, 0.35, -d.z * 0.3).multiplyScalar(stoop);
    p.nod = lerp(p.nod, 0.2, stoop); p.nodMax = 0.5; p.tilt = lerp(p.tilt, 0.24, stoop);
    for (const [k, v] of Object.entries({ curve: 1, slant: 0.65, lid: 0.6, jaw: 0.2 + 0.15 * run, smile: 0, flare: 0.25 + 0.6 * run, size: 1 })) p.face[k] = lerp(p.face[k], v, stoop);
    // "up!": flung up and back, mouth wide
    p.lean.lerp(tmp.set(-d.x * 0.4, 1.0, -d.z * 0.4), fling);
    p.nod = lerp(p.nod, -0.5, fling); p.tilt = lerp(p.tilt, 0, fling);
    for (const [k, v] of Object.entries({ jaw: 1, flare: 1, slant: 0.8, lid: 1, size: 1.2, curve: 0.5, smile: 0 })) p.face[k] = lerp(p.face[k], v, fling);
    // and cackles
    p.lean.lerp(tmp.set(d.x * 0.2, 0.3 + 0.12 * laugh, d.z * 0.2), cackle);
    p.nod = lerp(p.nod, -0.22 + 0.05 * laugh, cackle);
    for (const [k, v] of Object.entries({ smile: 1, jaw: 0.7 + 0.3 * Math.abs(laugh), curve: 1, flare: 0.5, size: 1.05, slant: 0 })) p.face[k] = lerp(p.face[k], v, cackle);
    p.quick = Math.max(p.quick, 1 + 2 * Math.max(fling, 0.5 * cackle));
    p.wave = lerp(p.wave, 0.4, Math.max(stoop, fling));
    // the others look where it will come up, pleased
    for (const i of [C, R]) { const q = P[i]; if (stoop > 0.5) q.at = tmp2.set(ctx.spot.x, 0.6, ctx.spot.z).clone(); q.face.curve = lerp(q.face.curve, 0.6, stoop); q.face.smile = 0; }
    // the ground: a rumble as the root runs, a jolt as the thorns break out
    const rumble = sstep(m.warn, m.warn + 0.3, t) * (1 - sstep(m.hit, m.hit + 0.15, t));
    body.shake.set(Math.sin(t * 61) * 0.03 * rumble, 0.1 * pulse(t, m.hit - 0.03, m.hit + 0.03, m.hit + 0.08, m.hit + 0.3), Math.sin(t * 47) * 0.03 * rumble);
    body.skirt = 0.3 * pulse(t, m.hit - 0.02, m.hit + 0.08, m.hit + 0.2, m.hit + 0.6);
    roars(L, t, m.roar);
  }

  // ---- the bramble: the heads still up roar at the sky; they draw down, growing small, as the skirt's leaves curl up
  // one after another and wind shut into a bud over them; the bud glows and beats, its light swelling as each wave's
  // warning fills, and clenches and flares as the thorns break out; then it bursts open, the heads spring out, and
  // hang there worn out, panting
  const HIDE = [[0, 3.05, 0], [0.5, 2.45, 0.15], [-0.5, 2.45, 0.15]];              // where each head is drawn down to, inside the bud
  function bramble(t) {
    const B = BOSS_MOVES.bramble;
    once('roar', 0.2, () => tell('roar'));
    once('shut', B.shut, () => tell('shut'));
    once('bloom', B.burst, () => tell('bloom'));
    B.waves.forEach(([warn, hit], k) => {
      once('warn' + k, warn, () => {
        // one patch where she stands; the rest round her, with a way out left open (no patch within 45° of it)
        const n = B.patches[k], gap = Math.random() * Math.PI * 2, list = [{ x: tgt.x, z: tgt.z }];
        for (let i = 1; i < n; i++) {
          const a = gap + Math.PI / 4 + ((i - 1 + Math.random() * 0.7) / (n - 1)) * (Math.PI * 2 - Math.PI / 2), d = 2.9 + Math.random() * 2.7;
          list.push({ x: tgt.x + Math.sin(a) * d, z: tgt.z + Math.cos(a) * d });
        }
        for (const q of list) { const far = Math.hypot(q.x, q.z), min = 3.6 + B.radius * 0.5; if (far < min) { const k2 = min / (far || 1); q.x *= k2; q.z *= k2; } }      // (not inside it)
        ctx.patches[k] = list.map(q => { const o = toWorld(tmp.set(q.x, 0, q.z)); return { kind: 'ring', x: o.x, y: o.y, z: o.z, radius: B.radius * size }; });
        for (const shape of ctx.patches[k]) tell('warn', { wave: k, shape, lead: hit - warn, lasts: B.lasts });
      });
      once('hit' + k, hit, () => { for (const shape of ctx.patches[k] || []) tell('hit', { wave: k, shape }); });
    });
    stance(false);
    const roar = pulse(t, 0.1, 0.35, 1.0, 1.25), hide = sstep(1.1, 1.8, t) * (1 - sstep(B.burst - 0.02, B.burst + 0.16, t));
    const sprung = pulse(t, B.burst, B.burst + 0.14, B.burst + 0.3, B.burst + 0.6), tired = pulse(t, B.burst + 0.3, B.open, B.tired, B.tired + 0.7), pant = Math.sin(t * 7.5);
    for (const h of heads) {
      const i = h.index, p = P[i], d = dirs[i], c = h.centre, n = i * 1.3;
      // up to the sky, roaring
      p.lean.lerp(tmp.set(-d.x * 0.35, 0.8 + Math.sin(t * 50 + n) * 0.05, -d.z * 0.35), roar);
      p.nod = lerp(p.nod, -0.55, roar); p.yaw = lerp(p.yaw, 0, Math.max(roar, hide, tired)); p.tilt = lerp(p.tilt, 0, Math.max(roar, hide));
      if (roar > 0.5) p.at = null;
      for (const [k, v] of Object.entries({ jaw: 1, flare: 1, slant: 1, size: 1.15, curve: -1, smile: 0, lid: 1 })) p.face[k] = lerp(p.face[k], v, roar);
      // down into the bud, growing small
      p.lean.lerp(tmp.set(HIDE[i][0] - c.x, HIDE[i][1] - c.y, HIDE[i][2] - c.z), hide);
      p.bow.lerp(tmp.set(-c.x * 0.25, -0.3, 0), hide);
      p.scale = lerp(1, 0.55, hide);
      if (hide > 0.5) { p.at = null; p.nod = 0; Object.assign(p.face, { lid: 0.3, jaw: 0.1, flare: -1, smile: 0 }); }
      p.wave = lerp(p.wave, 0.1, hide); p.quick = Math.max(p.quick, 1 + 1.4 * roar);
      // out again: sprung up high, gasping
      p.lean.lerp(tmp.set(d.x * 0.2, 0.85, d.z * 0.2), sprung);
      for (const [k, v] of Object.entries({ jaw: 1, lid: 1, size: 1.3, flare: 1, slant: -0.3, curve: -0.4, smile: 0 })) p.face[k] = lerp(p.face[k], v, sprung);
      p.quick = Math.max(p.quick, 1 + 2 * sprung);
      // worn out: hanging low, panting, eyes half shut
      p.lean.lerp(tmp.set(d.x * 0.35, -1.05 - 0.07 * pant, d.z * 0.35), tired);
      p.nod = lerp(p.nod, 0.12 + 0.04 * pant, tired);
      for (const [k, v] of Object.entries({ jaw: 0.55 + 0.35 * Math.abs(pant), lid: 0.42, slant: -0.55, flare: -0.75, curve: -0.6, size: 0.95, smile: 0 })) p.face[k] = lerp(p.face[k], v, tired);
      p.wave = lerp(p.wave, 0.35, tired);
    }
    // each wave: its light swells as its warning fills (charge), the bud clenches and flares as its thorns break out (jolt)
    let charge = 0, jolt = 0;
    for (const [warn, hit] of B.waves) { charge = Math.max(charge, Math.pow(seg(t, warn, hit), 1.6) * (t < hit ? 1 : 0)); jolt = Math.max(jolt, pulse(t, hit - 0.03, hit + 0.02, hit + 0.06, hit + 0.4)); }
    // the skirt: spread wide as they roar; its leaves curl shut one after another, winding (swirl); shut, it breathes;
    // it springs open (a little past) as they burst out
    const shutTo = sstep(1.2, B.shut, t), opened = outBack(seg(t, B.burst, B.burst + 0.5)), shut = shutTo * (1 - sstep(B.burst - 0.02, B.burst + 0.1, t));
    body.swirl = 1;
    body.skirt = -0.3 * roar + shutTo * (1 - opened) * (0.94 + 0.03 * Math.sin(t * 5) + 0.06 * jolt - 0.04 * charge);
    // its light: a heart's double beat, quicker with each wave; swelling; a flare at each breaking out, and as it bursts open
    const rate = 1.5 + 0.5 * B.waves.filter(w => t > w[0]).length, ph = (t * rate) % 1, beat = Math.exp(-ph * 9) + 0.6 * Math.exp(-Math.pow((ph - 0.28) * 9, 2));
    body.glow = Math.min(1, shut * (0.28 + 0.24 * beat + 0.5 * charge) + jolt + (1 - sstep(B.burst, B.burst + 0.9, t)) * (t >= B.burst ? 1 : 0));
    // the ground: a rumble as each wave comes, a jolt as it breaks out and as the bud bursts
    const rumble = Math.max(charge, 0.8 * roar);
    body.shake.set(Math.sin(t * 61) * 0.035 * rumble, 0.13 * jolt + 0.12 * pulse(t, B.burst - 0.02, B.burst + 0.03, B.burst + 0.08, B.burst + 0.3), Math.sin(t * 47) * 0.035 * rumble);
  }

  // ---- its dying (all three heads down, or going down): the skirt wilts and all its colours dry
  function wilt(t) {
    const w = -sstep(ctx.wiltFrom, ctx.wiltFrom + 2.2, t);
    body.skirt = body.skirt > 0.02 ? body.skirt + w : w;                          // (shut into a bud as it began to die: it opens first)
    body.wither = sstep(ctx.wiltFrom + 0.4, ctx.wiltFrom + 3.0, t);
    body.flash = 0; body.shake.set(0, 0, 0);
  }

  // ---- coming up: under the ground first; three harmless little heads look out; a sly look and a rumble; it bursts up and roars
  function rise(t) {
    const m = BOSS_MOVES.rise, wasUp = ctx.from < DEEP - 0.05, a = t - (wasUp ? m.down : 0);       // a: seconds since it was under the ground
    if (a < 0) {                                                                  // going under (as it stood, or as it lay)
      body.sink = lerp(ctx.from, DEEP, sstep(0, m.down, t));
      if (ctx.wasDead) wilt(ctx.dieLength);
      stance(false);
      return;
    }
    if (ctx.down.some(v => v !== null)) { ctx.down = [null, null, null]; ctx.mourn = null; }      // (it comes up whole)
    ctx.wasDead = false; body.wither = 0; body.flash = 0;
    once('burst', (wasUp ? m.down : 0) + m.burst, () => tell('burst'));
    once('roar', (wasUp ? m.down : 0) + m.roar, () => tell('roar'));
    const up = seg(a, m.burst, m.burst + 0.8), sly = sstep(m.sly, m.sly + 0.25, a), out = sstep(m.burst, m.burst + 0.3, a);
    body.sink = DEEP * (1 - outBack(up));
    // the skirt: as built while it hides (all of it under the ground), closed up as it comes through, then it springs open
    body.skirt = a < m.burst + 0.35 ? sstep(m.burst - 0.12, m.burst + 0.1, a) : 1 - outBack(seg(a, m.burst + 0.35, m.burst + 0.95));
    const rumble = sstep(m.sly, m.burst, a) * (1 - sstep(m.burst + 0.1, m.burst + 0.5, a));
    const rear = pulse(a, 5.7, 6.0, 6.05, 6.2), roar = sstep(m.roar, m.roar + 0.2, a) * (1 - sstep(7.0, 7.5, a));
    body.shake.set(Math.sin(a * 61) * (0.05 * rumble + 0.03 * roar), 0, Math.sin(a * 47) * (0.05 * rumble + 0.03 * roar));
    for (const h of heads) {
      const p = P[h.index], n = h.index * 2.2, d = dirs[h.index];
      p.at = chest; p.yaw = 0;
      // small and harmless: wide round eyes, a little smile, bobbing, head on one side; now and then a happy squint
      const hop = 0.09 * Math.abs(Math.sin(a * 2.6 + n)), glad = pulse(a, 2.0 + h.index * 0.5, 2.15 + h.index * 0.5, 2.6 + h.index * 0.5, 2.75 + h.index * 0.5);
      const cute = { size: 1.3, lid: 1, slant: 0, curve: 0.9, jaw: 0.05, flare: 0.4, smile: glad, glow: 1 };      // (its hood lifted a little: its eyes show under it)
      const slyFace = { size: 1.05, lid: 0.5, slant: 0.7, curve: 1, jaw: 0.1, flare: 0.3, smile: 0, glow: 1 };
      const wild = { size: 1.1 + 0.1 * roar, lid: 1, slant: 1, curve: -1, jaw: Math.max(0.85 * (1 - sstep(m.burst + 0.5, 5.7, a)), 0.4 * rear, roar), flare: 1, smile: 0, glow: 1 };
      for (const k of FACE) p.face[k] = lerp(lerp(cute[k] ?? BOSS_HEAD_REST[k], slyFace[k] ?? BOSS_HEAD_REST[k], sly), wild[k] ?? BOSS_HEAD_REST[k], out);
      const low = (h.index === C ? -0.95 : 0) + hop;                              // (the middle head is the tallest: it stoops, so all three look out together)
      const reach = -0.8 * rear + 1.15 * roar;
      p.lean.set(d.x * reach + Math.sin(a * 43 + n) * 0.07 * roar, lerp(low, 0.45 * rear - 0.15 * roar, out) + Math.sin(a * 51 + n) * 0.05 * roar, d.z * reach);
      p.nod = -0.3 * rear + 0.05 * roar - 0.16 * (1 - out);                       // (looking up at her, while it is small)
      p.tilt = 0.2 * Math.sin(a * 1.4 + n) * (1 - sly);
      p.wave = lerp(0.3, 1.5, out) - 0.7 * roar;
      p.quick = 1 + 2 * out;
    }
  }

  // ---- over whatever they are doing: the others grieving a head just gone down, then turning on her and roaring
  function grieve() {
    const m = ctx.mourn;
    if (!m) return;
    const fallenAt = tmp2.copy(heads[m.head].centre).add(heads[m.head].lean).clone();
    const look = pulse(m.t, 0, 0.12, 1.15, 1.3), roar = pulse(m.t, 1.25, 1.4, 1.95, 2.4), sad = sstep(0.3, 0.8, m.t);
    for (const h of heads) {
      const i = h.index;
      if (i === m.head || ctx.down[i] !== null || i === striking()) continue;      // (a head striking keeps at it)
      const p = P[i], d = dirs[i];
      if (look > 0.4) { p.at = fallenAt; p.share = 0.9; p.most = 0.9; }
      const grief = { size: lerp(1.35, 1.0, sad), lid: lerp(1, 0.8, sad), slant: lerp(0, -0.8, sad), jaw: lerp(0.95, 0.25, sad), flare: lerp(0.9, -0.3, sad), curve: -1, smile: 0, brow: 0 };
      const fury = { size: 1.15, lid: 1, slant: 1, jaw: 1, flare: 1, curve: -1, smile: 0, brow: 0 };
      for (const k in grief) p.face[k] = lerp(p.face[k], grief[k], look);
      for (const k in fury) p.face[k] = lerp(p.face[k], fury[k], roar);
      p.lean.lerp(tmp.set(d.x * 0.9, 0.25 + Math.sin(ctx.t * 49 + i) * 0.05 * roar, d.z * 0.9), roar);
      p.nod = lerp(p.nod, -0.12, roar); p.yaw = lerp(p.yaw, 0, Math.max(look, roar));
      p.quick = Math.max(p.quick, 1 + 2 * Math.max(look, roar));
    }
    if (me.state === 'idle') body.shake.set(Math.sin(ctx.t * 61) * 0.025 * roar, 0, Math.sin(ctx.t * 47) * 0.025 * roar);
  }
  // ---- over whatever it is doing: a head struck flashes and flinches back from her, eyes screwed up
  function flinches() {
    for (const h of heads) {
      const i = h.index, ft = ctx.flinch[i];
      if (ctx.down[i] !== null && ctx.down[i] >= 0) continue;
      h.flash = ft < 0.3 ? 1 - sstep(0, 0.25, ft) : 0; h.wither = 0;
      if (ft >= BOSS_MOVES.hit.length) continue;
      const p = P[i], d = dirs[i], k = 1 - sstep(0.15, 0.6, ft), f = p.face;
      p.lean.addScaledVector(tmp.set(-d.x * 0.7, 0.25, -d.z * 0.7), k);
      p.nod -= 0.22 * k;
      Object.assign(f, { lid: lerp(f.lid, 0.18, k), slant: lerp(f.slant, -0.75, k), jaw: lerp(f.jaw, 0.85, k), flare: Math.max(f.flare, k), smile: f.smile * (1 - k) });
      p.quick = Math.max(p.quick, 3);
    }
  }
  // ---- over everything: a beaten head. A cry; its neck gives way and it comes down to the ground; its eyes go out; it dries
  function beaten() {
    for (const h of heads) {
      const i = h.index, td = ctx.down[i];
      if (td === null || td < 0) continue;
      const p = P[i], [fx, fz, far] = FALLS[i], k = far / Math.hypot(fx, fz);
      const cry = pulse(td, 0, 0.08, 0.3, 0.45), fall = Math.pow(sstep(0.35, 1.45, td), 1.6), shut = sstep(0.6, 1.6, td);
      p.at = fall < 0.25 ? chest : null; p.yaw = 0;
      p.lean.set(fx * k * fall, lerp(0.45 * cry, -(h.centre.y - 0.9), fall), fz * k * fall);
      p.bow.set(0, 0.9 * Math.sin(Math.PI * fall), 0);                            // the neck arches as it goes over
      p.nod = lerp(-0.3 * cry, 0.2, fall); p.nodMax = 0.3;
      p.tilt = (i === L ? 0.6 : -0.6) * fall;
      p.wave = 0.9 * (1 - fall);
      p.quick = fall > 0 ? 0.5 : 2.5;                                            // (heavy, once it goes)
      p.face = { ...BOSS_HEAD_REST, lid: lerp(1, 0.1, shut), slant: lerp(0, -0.5, shut), jaw: lerp(1, 0.3, shut), size: lerp(1.4, 1, shut), flare: lerp(0.9, -1, shut), curve: -1, glow: 1 - sstep(0.9, 2.4, td) };
      h.wither = 0.7 * sstep(1.0, 2.8, td);
      h.flash = 0.8 * (1 - sstep(0, 0.3, td));
    }
  }
  // a vine left out (its blow was stopped) draws back into the ground
  function vinesBack(dt) {
    vines.forEach((v, i) => {
      if ((me.state === 'whip' && ctx.vine === i) || v.width <= 0) return;
      const k = Math.min(1, dt * 7);
      for (const q of [v.p1, v.p2, v.p3]) q.lerp(tmp.set(v.foot.x, -1, v.foot.z), k);
      v.width = Math.max(0, v.width - dt * 3.5); v.footY = Math.max(-1, v.footY - dt * 2);
      if (v.width <= 0) hide(v);
    });
  }

  function update(dt, player) {
    dt = Math.min(dt, 0.05);
    ctx.t += dt; me.time += dt;
    if (player) tgt.copy(boss.worldToLocal(tmp.copy(player))).divideScalar(size);
    chest.set(tgt.x, tgt.y + 1.2, tgt.z);
    for (const h of heads) { const d = dirs[h.index].set(tgt.x - h.centre.x, 0, tgt.z - h.centre.z); if (d.lengthSq() > 1e-6) d.normalize(); else d.set(0, 0, 1); }
    for (const p of P) { p.at = null; p.share = 0.8; p.most = 0.75; p.lean.set(0, 0, 0); p.bow.set(0, 0, 0); p.yaw = 0; p.nod = 0; p.nodMax = 0.3; p.tilt = 0; p.wave = 0.95; p.quick = 1; p.scale = 1; p.face = { ...BOSS_HEAD_REST }; }
    // as it stands unless a move says otherwise: its skirt eased back as built, still, unlit, not dried
    // (eased, not at once: a bud cut short opens, and its light dies down)
    body.skirt += (0 - body.skirt) * Math.min(1, dt * 6); body.swirl += (0 - body.swirl) * Math.min(1, dt * 6); body.glow += (0 - body.glow) * Math.min(1, dt * 8);
    body.shake.set(0, 0, 0); body.flash = 0; body.wither = 0;
    for (const l of [...body.leaves, body.ring]) { l.lift += (0 - l.lift) * Math.min(1, dt * 6); l.stir += (0 - l.stir) * Math.min(1, dt * 6); }      // (its leaves as the talking left them: let down)
    // heads going down (and those that will, as it dies); flinches and grief going on
    for (let i = 0; i < 3; i++) {
      ctx.flinch[i] += dt;
      if (ctx.down[i] !== null) { const was = ctx.down[i]; ctx.down[i] += dt; if (was < 0 && ctx.down[i] >= 0) wentDown(i); }
    }
    if (ctx.mourn && (ctx.mourn.t += dt) > 2.5) ctx.mourn = null;
    // a move that is over: back to standing (dying: dead, and it stays as it fell)
    const len = me.state === 'die' ? ctx.dieLength : (BOSS_MOVES[me.state] || {}).length;
    if (len && me.time >= len) {
      const was = me.state;
      if (was === 'whip') hide(vines[ctx.vine]);
      me.state = was === 'die' ? 'dead' : 'idle';
      if (me.onEvent) me.onEvent({ type: 'end', move: was });
    }
    const st = me.state, tt = me.time;
    if (st === 'idle') stance(snaps);
    else if (st === 'whip') whip(tt);
    else if (st === 'spit') spit(tt);
    else if (st === 'roots') roots(tt);
    else if (st === 'bramble') bramble(tt);
    else if (st === 'die') { stance(false); wilt(tt); }
    else if (st === 'dead') { stance(false); wilt(ctx.dieLength); }
    else if (st === 'rise') rise(tt);
    grieve(); flinches(); beaten();
    const B = BOSS_MOVES.bramble;
    me.shut = me.state === 'bramble' && me.time > 1.15 && me.time < B.burst + 0.12;
    me.open = me.state === 'bramble' && me.time >= B.open - 0.2 && me.time < B.tired + 0.3;
    vinesBack(dt);

    for (const h of heads) {
      const p = P[h.index], s = S[h.index], q = Math.sqrt(p.quick);
      let yaw = p.yaw, nod = p.nod, gx = 0, gy = 0;
      if (p.at) { const a = aimHead(h, p.at, p.share, p.most); yaw += a.yaw; nod += a.nod; gx = a.gazeX; gy = a.gazeY; }
      h.yaw = spring(s.yaw, yaw, dt, 8 * q, 0.65);
      h.nod = spring(s.nod, clamp(nod, -0.6, p.nodMax), dt, 9 * q, 0.62);
      h.tilt = spring(s.tilt, p.tilt, dt, 6 * q, 0.6);
      h.lean.set(spring(s.lx, p.lean.x, dt, 7 * q, 0.55), spring(s.ly, p.lean.y, dt, 7.5 * q, 0.55), spring(s.lz, p.lean.z, dt, 7 * q, 0.55));
      h.bow.set(spring(s.bx, p.bow.x, dt, 7 * q, 0.6), spring(s.by, p.bow.y, dt, 7 * q, 0.6), spring(s.bz, p.bow.z, dt, 7 * q, 0.6));
      h.gazeX += (gx - h.gazeX) * Math.min(1, dt * 14); h.gazeY += (gy - h.gazeY) * Math.min(1, dt * 14);
      h.scale = spring(s.sc, p.scale, dt, 11, 0.45);                              // (it springs back to its size, a little past)
      h.wave += (p.wave - h.wave) * Math.min(1, dt * 3);
      for (const k of FACE) h[k] += (p.face[k] - h[k]) * Math.min(1, dt * (k === 'jaw' ? 24 : 10 * q));
    }
    pose();
  }
  return me;
}
