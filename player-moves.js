// player-moves.js
// The player with the moves: the game's player (index.html; with ?move=0 it uses the old walker, player.js, instead: the same
// createPlayer, the same player object, less player.dash() and player.mode). Her hands are read in player-input.js, her camera is player-camera.js
// (the walker's camera), a cliff's face is measured in player-climb.js, her feet in the water are player-footsteps.js; this
// file is her body in the world.
//
//   const player = createPlayer({ character, level, camera, dom: renderer.domElement, ui: document.getElementById('stick'), onTap });
//   every frame: player.update(dt)          player.jump(), player.dash(): the buttons (Space, Shift on a keyboard)
//
// The point of the moves: she gets about the land without going round. What she can do that the walker cannot:
//   - jump: the magic jump (magic-jump.js). The jump button is the first jump, off a magic circle that opens on the ground;
//     pressed again in the air, up to three more, each off a circle under her feet (4.4 m up in all, at 1.75 m). Her body
//     in the air, and how she comes down, are its too: whenever she is in the air (off an edge, over a parapet) she is in a
//     flight, three jumps left if it was not the button that sent her. A long fall is caught by a circle on the ground.
//   - leave a cliff's top. Walking square at an edge she hops off it (a tall one holds her at the brink for a moment first, so
//     she is not thrown off a height by brushing its edge; a jump or a dash goes at once), falls, and lands at its foot, on
//     the ground or in the water. Where she comes down on the cliff's face she slides down it.
//   - climb. Pushing at a face for a moment she takes hold of it and climbs: the stick towards the rock is up, away from it
//     down, across it along. The jump button is a leap over the rock, the dash button lets go (she slides down). When her
//     hands reach the top she climbs over it (player-climb-top.js: Mixamo's Climbing To Top, fitted to the rock); a ledge
//     lower than her reach is taken straight from the ground, the same move begun part way in. Sliding or
//     falling down a face, pushing at it takes hold again. In the air (a jump, a flight), pushed at a face that stands
//     above her feet she takes hold of it at once, where she is (not while she is upside down in the flip). No stamina: any
//     face can be climbed.
//   - swim. Water too deep to wade carries her: she swims where the stick points and treads water when it is let go, wades
//     out where it shallows, and climbs out up a rock bank. Not over a waterfall, nor up one.
//   - go over low things: running (or walking, for a moment) at a fence, a bridge's parapet, a barrel, she vaults it: her
//     left hand planted on the top, her right foot on it, a leap off it onto her front foot and on into her run (player-
//     hurdle.js finds it; player-vault.js fits the vault, a motion capture, to it). The stick let go as she lands, she comes
//     down into a landing and stops; over a bridge's parapet she falls into the river. The jump button by one is the magic jump, not the vault.
//   - dash: a burst of speed the way the stick points, then a sprint for as long as she keeps running.
//   - go at the land's pace: a little slower up a slope and faster down it, leaning into the hill, her turns and a dash; her
//     feet stay on a slope she walks.
// Her walk and run are the walker's (a run is 4.2 m/s at 1.75 m; the first trial ran at 5.0 and that was too fast).
//
// Her weight (a trial since 20 Nov 2026: createPlayer({ weight: true }), player.setWeight(on); in the game with ?weight=1 and
// its ⚖️ button, to compare. Asked for as "รู้สึกตัวละครมันเบาๆ ภาพรวม": she felt light. Without it she was most of the way
// to her pace in a tenth of a second, stopped as fast, turned back at a full run in the same stride, and came down from
// any height the same). With it:
//   - on the ground she gathers speed and loses it at so many m/s² (W_ACC0, W_DEC0: her run in 0.4 s from standing, and
//     stopped from it in a quarter of a second, half a metre on), not most of the way in a tenth of a second
//   - the faster she goes the slower she turns (W_TURN: from her walk to her sprint); turned back at a run (more than
//     W_BACK), she brakes first, hardly turning, and turns once she is down to a walk: not round in a stride at full pace
//   - her body leans with it: forward as she gathers speed, back as she brakes (W_LEAN)
//   - she comes down as hard as she fell (her speed down as she lands, between W_SOFT0 and W_HARD0: a hop or one jump
//     light, a drop of two metres hard; the circle that catches a long fall is soft): the harder, the slower her landing
//     plays, the longer before she runs on and the more of her speed she loses; a hard one stops her a moment as her feet
//     hit (W_STOP s)
// Her legs go at the pace she really goes, as ever, so her feet do not slide as she speeds up and slows down.
//
// It needs the level to say what the ground is like: level.footing(x, z, y) -> 'ground' | 'cliff' | 'water' | 'wall' | 'out'
// (the hill village). On a map that cannot say, cliffs and deep water stay walls (level.confine, as in player.js) and there
// is no climbing or swimming; the rest works the same. standAt, footing and waterDepthAt are asked with her height (y), which
// tells a bridge's deck from the bed under it.
//
// Her height (character.height, against Vivi's 1.412 m as modelled, the height every number here is given at) scales what
// goes with her body, whoever is playing, as in player.js.

import * as THREE from 'three';
import { createPlayerInput } from './player-input.js';
import { createFollowCamera } from './player-camera.js';
import { createFootsteps } from './player-footsteps.js';
import { createFace } from './player-climb.js';
import { findHurdle } from './player-hurdle.js';
import { VAULT_CLIP, VAULT_TIMES, vaultLead, planVault, vaultAt, createVaultIK } from './player-vault.js';
import { createMagicJump } from './magic-jump.js';
import { CLIMB_TOP_CLIP, CLIMB_TOP_MIRROR, planClimbTop, climbTopAt, createClimbTopIK } from './player-climb-top.js';

const TUNED_HEIGHT = 1.412;                   // Vivi as modelled: the numbers below are for her at this height (x 1.24 at 1.75 m)
const WALK0 = 1.2, RUN0 = 3.39, SPRINT0 = 4.7, DASH0 = 8.0;      // m/s (at 1.75 m: 1.5, 4.2, 5.8, 9.9; the walker runs at 4.1)
const DEEP0 = 0.5;                            // water she will not wade into, on a map that cannot say what its ground is like (m)
const GRAV0 = 20;                             // gravity (m/s²), down a cliff's face (in the air: the magic jump's, magic-jump.js)
const JUMP_BUFFER = 0.15;                     // a press just before she lands (or can dash) still counts
const START_RATE = 1.8;                       // jump_start squeezed into the short flight (onto a face straight from a jump)
const LAND_RATE = 1.4, LAND_HOLD = 0.14;      // landing standing still plays out; moving, she is off again after LAND_HOLD s
const HOP0 = 2.2, HOP_OUT0 = 2.4;             // off an edge: a small hop up (m/s) and at least this pace outwards, to clear the lip
const TALL0 = 2.4, EDGE_WAIT = 0.3;           // a drop taller than this (m) holds her at the brink this long (s) before she goes
const FAR0 = 16;                              // a drop taller than this (m; 20 m at 1.75 m) she does not take at all: its edge is a wall
const STEP0 = 0.45;                           // the ground falling away under her by more than this (m): she falls, not steps
const SLIDE0 = 5, SLIDE_FALL0 = 11;           // down a cliff's face: no faster than this over the ground, nor than this downwards (m/s)
const DASH_T = 0.2, DASH_COOL = 0.8;          // the burst (s), and how soon she can dash again (s)
// her weight (see above; at Vivi's 1.412 m: x 1.24 at 1.75 m)
const W_ACC0 = 8.5, W_DEC0 = 12.9;            // m/s² gathering speed, losing it (10.5, 16 at 1.75 m: her run in 0.4 s, stopped from it in 0.26 s)
const W_TURN = [12, 5];                       // 1/s she turns at, walking .. sprinting (11 at any pace without)
const W_BACK = 1.9, W_BRAKE = 0.5, W_PIVOT = 2.5;      // turned back more than this (radians) at a run, she brakes (to this of her walk), hardly
                                              // turning (1/s), until she is down to a walk, and turns then
const W_LEAN = [0.08, 0.12];                  // radians her body leans at the most: forward gathering speed, back braking
const W_SOFT0 = 5.25, W_HARD0 = 10.5;         // m/s down as she lands: a light landing, a hard one (6.5, 13 at 1.75 m)
const W_STOP = [0.03, 0.07];                  // s a landing over half hard stops her, at half and at its hardest
const CLIMB0 = 1.4;                           // m/s over the rock (1.7 at 1.75 m)
const GRAB_WAIT = 0.12, GRAB_SHY = 0.5;       // s she pushes at a face before she takes hold; s after letting go before she will again
const LEAP = 2.5, LEAP_T = 0.3, LEAP_COOL = 0.55;      // a jump on the rock: this many times her climbing pace for LEAP_T s; again after LEAP_COOL s
const REACH0 = 1.6;                           // m over the rock from her feet to her hands (2.0 at 1.75 m): a top that near, she vaults over
const VAULT_T = 0.62, VAULT_FROM = 0.08;      // over a top where her clips lack climb_top (the library's ClimbUp_1m): how long it takes (s), and how far into the clip it starts (s)
const WALL_HH = 0.44, SPAN_HH = 1.80;         // the climbing clip's wall, in front of her root, and how far up it her hands reach from her root, in hips heights (tools/make-climb-anim.py)
const HURDLE_WAIT = 0.1;                      // s she walks at a low thing before she goes over it (running: at once)
const NOWHERE = { from: 0, to: 0 };            // (a thing right at her: how far ahead the vault's run-up looks)
const VAULT_TAIL = 0.16;                       // s her hand and feet are let go of by the vault's IK once she is down (not in a frame)
const CT_MOST_OFF = 0.12;                     // m (at Vivi's size) a sheer face's corner holds her off it at most, going over its top
const SWIM0 = 2.1;                            // m/s swimming (2.6 at 1.75 m)
const SWIM_IN0 = 0.847, SWIM_OUT0 = 0.77;     // water this deep carries her (1.05 m at 1.75 m: where footing says 'water'); shallower than this she stands again (0.95)
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const smooth = u => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };

// circles: the magic jump's circles (magic-circle-fx.js), in the scene: the page draws them, the jump says where they open
const NO_CIRCLES = { open() {} };
export function createPlayer({ character: firstCharacter, level, camera, dom, ui = null, onTap = null, circles = NO_CIRCLES, weight: weighs = false }) {
  let character = firstCharacter;             // who is playing: player.setCharacter swaps her for another
  // the level, asked at her height (see above): where her feet are, how deep the water is, where its surface is, and what
  // the ground is like (null: this map cannot say). A steep bank under the water is ground to her: she wades down it
  const pos = new THREE.Vector3(level.spawn.x, 0, level.spawn.z);
  const standOn = level.standAt || level.heightAt;
  const standAt = (x, z) => standOn(x, z, pos.y);
  const depthAt = (x, z) => level.waterDepthAt(x, z, pos.y);
  const surfaceAt = (x, z) => level.heightAt(x, z) + depthAt(x, z);
  const footing = level.footing ? (x, z) => { const f = level.footing(x, z, pos.y); return f === 'cliff' && depthAt(x, z) > 0.28 * size() ? 'ground' : f; } : null;
  const size = () => (character.height || TUNED_HEIGHT) / TUNED_HEIGHT;
  const face = createFace(standAt, footing || (() => 'ground'));
  pos.y = standOn(pos.x, pos.z);
  let heading = level.spawn.yaw;              // where she faces (0 = +Z)
  // 'ground' | 'air' (a jump, a hop, a fall) | 'slide' (down a cliff's face) | 'climb' | 'vault' (over a top) | 'hurdle' (over a low thing) | 'swim'
  let mode = 'ground';
  let speed = 0, went = 0, paceWas = 0, pace = 0;      // how fast she means to go, how fast she really went (last frame), the pace before, the pace her legs go at
  let vy = 0, peakY = pos.y, airBase = pos.y, slideV = 0, slideT = 0, stuckT = 0;
  let landT = -1, landHold = LAND_HOLD, jumpWanted = 0;
  let landClip = 'jump_land', landRate = LAND_RATE;       // the landing she is in: its clip, how fast it plays
  let dashWanted = 0, dashT = 0, dashCool = 0, sprint = false, easedOff = 0;
  let edgeT = 0, edgeGrace = 0;               // how long she has pushed at a tall cliff's brink
  let shy = 0;                                // s after a slide that got her nowhere: edges are walls for a moment
  let grabPush = false, faceAhead = false, grabT = 0, grabShy = 0, lipT = 0;      // pushing at a face this frame; for how long; s before she will take hold again
  let onRock = false, climbT = 0, leapT = 0, leapCool = 0, climbRate = 0;      // climbing: her feet have left the ground; for how long; a leap; the clip's rate
  const reachFrom = new THREE.Vector3();        // taking hold in the air: where she was, from where she is put on the rock (shown easing over)
  let climbW = 0, tilt = 0, nX = 0, nY = 1, nZ = 0, standOff = 0;      // how far she is laid against the rock (0..1), by what angle, the way out of the face, and how far the rock's bulges hold her off it (m)
  const lie = { angle: 0, off: 0 };
  let hurdleT = 0, overC = 0, hopLift = 0, ikTail = 0;      // going over a low thing: how long she has walked at it; s into the vault's clip; how much it raises her; s left of letting go of her hand and feet
  const ahead = {}, crossing = {};              // the one before her (player-hurdle.js), and where the vault began
  const plan = {}, path = {};                   // the vault fitted to it (planVault), and where she is in it (vaultAt)
  let vaultIK = createVaultIK(character);       // her hand and foot put on its top
  let vaultT = 0;                             // s into a vault
  const vault0 = new THREE.Vector3(), vault1 = new THREE.Vector3();
  // over a cliff's top: Mixamo's Climbing To Top fitted to it (player-climb-top.js): the plan, where she is in it, where she
  // was shown as it began (eased away), her lean to the rock then, her hands and feet put on the rock, and a moment after
  const ctPlan = { ok: false }, ctAt = { x: 0, y: 0, z: 0, tilt: 0 }, shown = new THREE.Vector3(), away = new THREE.Vector3();
  let ctIK = createClimbTopIK(character), ctTail = 0, tiltFrom = 0, ctOff = 0;      // (ctOff: m she is held off a sheer face, her knees and elbows out of its corner)
  let wake = 0;                               // s to the next ring she leaves swimming
  let lean = 0, roll = 0, grade = 0, turned = 0;      // her body's tilt forward / back and into a turn; the slope along her way; how far she turned this frame
  let weight = !!weighs, gain = 0, landW = 0, stopT = 0;      // her weight (see above): on; m/s² she gathered speed at this frame; how hard she landed (0..1); s her landing is stopped
  let wade = 0, stepSide = 1, wasDepth = 0, wetH = 0, wetAmt = 0, depthHere = 0;      // (water: as in player.js)
  const lastSafe = pos.clone();               // the last ground she stood on: where she is put back if a slide gets her nowhere
  const tmp = new THREE.Vector3(), spot = { x: 0, z: 0 }, stickV = new THREE.Vector2();

  // ---- blob shadow under the feet
  const shadow = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.4)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');      // black: it can only darken, never glow on dark ground
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    return m;
  })();
  const root = new THREE.Group();
  root.name = 'player';
  root.add(character.object, shadow);
  shadow.position.y = 0.06;

  const cam = createFollowCamera({ camera, level });
  cam.setView(level.spawn.yaw - Math.PI);     // the camera starts behind her
  const input = createPlayerInput({
    dom, ui, onTap,
    onJump: () => { jumpWanted = JUMP_BUFFER; }, onDash: () => { dashWanted = JUMP_BUFFER; },
    onLook: (yaw, pitch) => cam.turn(yaw, pitch), onZoom: d => cam.zoom(d),
  });
  const steps = createFootsteps(level);
  steps.find(character);
  // ---- the magic jump: her flight, and her body in it. It moves what it is given (her feet's height, her way across
  // in the air, her heading), and reads the stick as a way over the ground
  // (mocap: the first jump off the ground and a landing from high are the Mixamo captures', where her clips have them:
  // magic-jump-mocap-anim.js, merged into them by index.html. step 'flow': the user's set of four, in the game since
  // 20 Nov 2026 ("เอาเข้าเกมส์จริงเลยค่ะ"): the jump off the ground as it was, then once round in the air, the hips' twist
  // and a spring, a flip, and the ninja's landing, each off a circle that flashes open under her (magic-jump-flow-anim.js,
  // merged by index.html; where her clips lack them, the jump as it was). momentum: a kick in the air turns the way she
  // goes part of the way to the stick's, not at once. The camera is the game's own, as it was: the user kept it. step3
  // 'jump': Step 3 is the user's Mixamo "Jump", its time in the air (the legs changing over), in the game since 20 Nov
  // 2026 ("ขึ้นเมนหลักเลยค่ะ"), not the ninja's)
  const air = createMagicJump({ character, circles, mocap: true, step: 'flow', momentum: true, step3: 'jump' });
  const me = { pos, vel: new THREE.Vector3(), heading: 0 }, airStick = { x: 0, z: 1, amount: 0 };

  // ---- solid things: tree trunks, rocks, houses, the edge of the map (she slides along them, in the air too)
  function solids(p, k) {
    for (const [cx, cz, cr, lo, hi, top] of level.colliders) {
      if (lo !== undefined && (pos.y < lo || (hi !== undefined && pos.y > hi))) continue;      // (one only at some heights: a bridge's parapets are not there for her under it)
      // a low thing she can go over (one with a top: a parapet, a fence, a barrel): in the air with her feet over its top,
      // she flies over it (it stood up to the sky before, and four jumps could not get her over a bridge's side)
      if (top !== undefined && mode === 'air' && pos.y >= top) continue;
      const dx = p.x - cx, dz = p.z - cz, r = cr + 0.28 * k, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        // (already well inside it, having come down a face onto it: she is eased out, 7 cm a frame, not thrown out)
        const d = Math.sqrt(d2), push = Math.hypot(pos.x - cx, pos.z - cz) < r - 0.1 ? Math.min(r - d, 0.07) : r - d;
        p.x += dx / d * push; p.z += dz / d * push;
      }
    }
    const rr = Math.hypot(p.x, p.z);
    if (rr > level.radius) { p.x *= level.radius / rr; p.z *= level.radius / rr; }
  }

  // ---- a cliff's edge
  // Down a face from (x, z), the way a slide goes (the way the rock falls): the height of the ground or the water it comes
  // out on. NaN: it runs off the map or into a wall, or does not come out within 30 m
  function slideEnd(x, z) {
    for (let i = 0; i < 120; i++) {
      const f = footing(x, z);
      if (f === 'ground') return standAt(x, z);
      if (f === 'water') return surfaceAt(x, z);
      if (f !== 'cliff') return NaN;
      const at = face.at(x, z);
      if (at.slope < 1e-5) return NaN;
      x -= at.ux * 0.25; z -= at.uz * 0.25;
    }
    return NaN;
  }
  // From ground by a cliff (x, z), along her way (dx, dz) across its face: how far below her the ground or the water she
  // would land on lies (m; negative: it is higher, the cliff is a wall from here). NaN: nothing to land on (the map's end, or
  // a face more than 18 m across). Two ways down are looked along, and both must end well: straight on, as she flies (the
  // first steps short), and down the face from where she would first touch it, as she slides
  function beyond(x, z, dx, dz, first, y0 = standAt(x, z)) {
    for (let t = first; t <= 18; t += t < 2 ? 0.1 : 0.25) {
      const qx = x + dx * t, qz = z + dz * t, f = footing(qx, qz);
      if (f === 'cliff') continue;
      if (f !== 'ground' && f !== 'water') return NaN;
      const wet = depthAt(qx, qz) > 0.28 * size();        // (water beyond a bank is a way down however little lower it lies)
      const drop = wet ? Math.max(0.16, y0 - surfaceAt(qx, qz)) : y0 - standAt(qx, qz);
      if (drop <= 0.15) return drop;                                          // (not a way down)
      const end = slideEnd(x + dx * first, z + dz * first);
      return Number.isNaN(end) ? NaN : Math.max(drop, y0 - end);
    }
    return NaN;
  }
  // Is she going square at the edge she stands by (within 60 degrees of straight off it), not along it? The edge faces the
  // ground round her that she may not stand on
  function squareOn(dx, dz) {
    let nx = 0, nz = 0;
    for (let i = 0; i < 16; i++) { const a = i / 8 * Math.PI, sx = Math.sin(a), sz = Math.cos(a); if (footing(pos.x + sx * 0.4, pos.z + sz * 0.4) !== 'ground') { nx += sx; nz += sz; } }
    const nl = Math.hypot(nx, nz);
    return nl > 1e-6 && (dx * nx + dz * nz) / nl >= 0.5;
  }
  // In the air: may she be over (x, z)? Over ground, yes; over water, unless it stands far above her. Over a cliff's face,
  // if she is above it (not into a wall from below), and, leaving the ground for it, only where there is something beyond
  // it to come down on. Not into a wall, nor off the map
  function mayFly(x, z, k) {
    const f = footing(x, z);
    if (f === 'ground') return true;
    if (f === 'water') return pos.y > surfaceAt(x, z) - k;
    if (f !== 'cliff' || pos.y < standAt(x, z)) return false;
    if (footing(pos.x, pos.z) !== 'ground') return true;                      // (already out over the face)
    const dx = x - pos.x, dz = z - pos.z, len = Math.hypot(dx, dz);
    return len > 1e-6 && shy <= 0 && beyond(pos.x, pos.z, dx / len, dz / len, len) <= FAR0 * k;      // (NaN, nothing beyond: no)
  }
  // The land's say on a step from where she is to p (x, z): p is left, moved, or put back
  function land(p, k) {
    if (!footing) { if (level.confine) level.confine(p, pos); return; }      // a map that cannot say what its ground is like: walls, as ever
    if (mode === 'ground') {
      const f = footing(p.x, p.z);
      if (f === 'ground') return;
      const dx = p.x - pos.x, dz = p.z - pos.z, len = Math.hypot(dx, dz);
      if (f === 'water') {
        const drop = pos.y - surfaceAt(p.x, p.z);
        if (drop < 0.5 * k) return;                                           // the water is at her feet: in she wades
        if (drop <= FAR0 * k && shy <= 0) { leave(HOP0 * k, k, false, HOP_OUT0 * k); return; }      // far below her: in she jumps
      } else if (f === 'cliff' && len > 1e-6) {
        // a cliff's top edge with a way down (not a wall with a lower land behind it: the land a step on stands no higher than
        // her knees): going square at it, off she hops
        const ex = dx / len, ez = dz / len, wall = standAt(pos.x + ex * 0.9, pos.z + ez * 0.9) > pos.y + 0.45 * k;
        const drop = wall ? NaN : beyond(pos.x, pos.z, ex, ez, len);
        if (drop > 0.15 && drop <= FAR0 * k && shy <= 0) {
          if (squareOn(ex, ez)) {
            if (drop <= TALL0 * k || dashT > 0 || edgeT >= EDGE_WAIT) { leave(HOP0 * k, k, false, HOP_OUT0 * k); return; }
            edgeGrace = 0.15;                                                 // a tall one: she is held at the brink first
          }
        } else if (grabShy <= 0) {
          // any other face: one that rises before her, or a brink with nothing below to hop down to (a gully's side). Pushing
          // at it she takes hold, and climbs: up it, or down
          const at = face.at(p.x, p.z), into = ex * at.ux + ez * at.uz;
          if (into >= 0.3 || (into <= -0.5 && squareOn(ex, ez))) grabPush = true;
          faceAhead = true;
        }
      }
      level.confine(p, pos);                                                  // a wall, the map's end: along it or stopped, as ever
      return;
    }
    if (mayFly(p.x, p.z, k)) return;
    if (mayFly(p.x, pos.z, k)) p.z = pos.z; else if (mayFly(pos.x, p.z, k)) p.x = pos.x; else { p.x = pos.x; p.z = pos.z; }      // along what stops her, or straight down
  }
  // off the ground, into a flight (magic-jump.js): jump, the button's first jump; or not (off an edge, over a parapet), up
  // m/s (0: the ground fell away), out at least this pace
  function leave(up, k, jump, out = 0) {
    mode = 'air'; peakY = airBase = pos.y; landT = -1; edgeT = 0; edgeGrace = 0;
    speed = Math.max(Math.min(speed, SPRINT0 * k * 1.15), out);              // (a dash off an edge is a long leap, not a flight)
    me.heading = heading; me.vel.set(Math.sin(heading) * speed, 0, Math.cos(heading) * speed);
    if (jump) air.takeOff(me); else air.drop(me, up);
    vy = air.vy;
  }
  // down on her feet: from a flight (the harder she came down, the more of her pace her legs take up and the longer before
  // she is off again: a long fall was caught by a circle), or at the foot of a face she slid down
  function touchDown(k, depth, slid) {
    const down = Math.max(0, -vy);                                            // (m/s: how fast she came down)
    mode = 'ground'; vy = 0;
    const hit = slid ? 0.25 : air.impact;
    if (depth > 0.06 && level.ripple) level.ripple(pos.x, pos.z, 1 + 0.4 * hit, 0.32, 'splash');
    landT = 0;
    landW = weight && !slid ? Math.min(1, Math.max(0, (down / k - W_SOFT0) / (W_HARD0 - W_SOFT0))) : 0;
    speed *= weight && !slid ? 1 - (0.25 + 0.5 * landW) : 1 - 0.4 * hit;
    if (slid) lightLanding(LAND_HOLD + 0.1 * hit);
    else ({ clip: landClip, rate: landRate, hold: landHold } = air.landing);      // (the flight's: the mocap's touch-down)
    // (with her weight: the harder she came down, the slower her landing plays and the longer before she runs on; a hard
    // one stops her a moment as her feet hit)
    stopT = 0;
    if (landW > 0) {
      landRate *= 1 - 0.3 * landW; landHold += 0.25 * landW;
      if (landW > 0.5) stopT = W_STOP[0] + (W_STOP[1] - W_STOP[0]) * (landW - 0.5) / 0.5;
    }
    character.play(landClip, 0.06, false);
  }
  // a landing not out of a flight (at the foot of a slide, off a vault with the stick let go): the mocap's touch-down where
  // her clips have it (magic-jump-mocap-anim.js), else the library's landing
  function lightLanding(hold) {
    if (character.actions.mj_land) { landClip = 'mj_land'; landRate = 1; landHold = 0.12; }
    else { landClip = 'jump_land'; landRate = LAND_RATE; landHold = hold; }
  }
  function startSlide(k) {
    if (mode !== 'air') peakY = pos.y;                                        // (not from a fall: how far she comes down is counted from here)
    mode = 'slide'; slideT = 0; stuckT = 0; slideV = Math.min(Math.max(2 * k, -vy), SLIDE_FALL0 * k); vy = 0;      // (as fast down as she came onto it)
    if (character.state !== 'jump_air' && character.state !== 'jump_start') character.play('jump_air', 0.18, false);
  }
  // a slide that got her nowhere: back onto the nearest ground, or where she last stood. home: straight back to where she
  // last stood (a fall that went on past any drop she takes)
  function rescue(home = false) {
    tmp.set(pos.x, pos.y, pos.z);
    if (!home && level.confine) level.confine(tmp, pos);
    if (home || footing(tmp.x, tmp.z) !== 'ground') tmp.copy(lastSafe);
    pos.set(tmp.x, standOn(tmp.x, tmp.z, tmp.y), tmp.z);
    air.end(); mode = 'ground'; vy = 0; speed = 0; landT = -1; shy = 2;
    character.play('idle', 0.2);
  }
  // Is the stick (the way `want`) pushed at the rock here?
  const pushedAt = (want, x, z, square = 0.5) => { const at = face.at(x, z); return at.slope > 0.5 && Math.sin(want) * at.ux + Math.cos(want) * at.uz >= square; };

  // ---- climbing
  // In the air: pushed at a face that stands above her feet just ahead, she takes hold of it there: put on the rock where
  // it is at her height, between her and there (her body is shown easing over, reachFrom)
  function grabInAir(k, want, dt) {
    const dx = Math.sin(want), dz = Math.cos(want), r = 0.3 * k, qx = pos.x + dx * r, qz = pos.z + dz * r;
    if (footing(qx, qz) !== 'cliff' || standAt(qx, qz) <= pos.y + 0.05 * k || !pushedAt(want, qx, qz)) return false;
    let a = 0, b = r;
    for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (standAt(pos.x + dx * m, pos.z + dz * m) < pos.y) a = m; else b = m; }
    const x = pos.x + dx * a, z = pos.z + dz * a;
    reachFrom.set(pos.x - x, 0, pos.z - z);
    pos.x = x; pos.z = z;
    grab(k, dt);
    return true;
  }
  // she takes hold of the rock. Pushing at it (k given) with its top already in her reach (a ledge taken from the ground,
  // a face caught near its top from the air), she goes straight over it, without a frame of her climbing between
  function grab(k = 0, dt = 0) {
    mode = 'climb'; onRock = footing(pos.x, pos.z) === 'cliff'; climbT = 0; leapT = 0; climbRate = 0;
    air.end(); speed = 0; vy = 0; landT = -1; dashT = 0; sprint = false; grabT = 0; edgeT = 0; edgeGrace = 0;
    if (k && character.actions[CLIMB_TOP_CLIP] && face.top(pos.x, pos.z, REACH0 * k, spot) >= 0) { startVault(k, dt); return; }
    character.play('climb', 0.18);
  }
  function startVault(k, dt) {
    if (character.actions[CLIMB_TOP_CLIP]) { startClimbTop(k, dt); return; }
    ctPlan.ok = false;
    const at = face.at(spot.x, spot.z);
    vault0.copy(pos);
    tmp.set(spot.x + at.ux * 0.4, 0, spot.z + at.uz * 0.4);                   // a step in from the edge, if there is ground there
    if (footing(tmp.x, tmp.z) !== 'ground') tmp.set(spot.x, 0, spot.z);
    solids(tmp, k);
    if (footing(tmp.x, tmp.z) !== 'ground') tmp.set(spot.x, 0, spot.z);
    vault1.set(tmp.x, standAt(tmp.x, tmp.z), tmp.z);
    heading = Math.atan2(vault1.x - pos.x, vault1.z - pos.z);
    mode = 'vault'; vaultT = 0; speed = 0;
    const clip = character.actions.climb_up;
    if (clip) { character.play('climb_up', 0.12, false); clip.time = VAULT_FROM; character.setRate((clip.getClip().duration - VAULT_FROM) / VAULT_T); }
  }
  // Her hands at the top (spot: its edge): she climbs over it, Mixamo's Climbing To Top fitted to the rock
  // (player-climb-top.js). Her root is put where it is climbing (out of the rock as far as the climbing clip's wall,
  // on the flat she is laid on), and the clip's way goes from there up and over; where she was shown, and her lean to
  // the rock, ease away from what they were (a grab from the air or from the ground: not laid on the rock yet)
  function startClimbTop(k, dt) {
    const at = face.at(pos.x, pos.z), ux = at.ux, uz = at.uz, hh = (character.hipsHeight || 1) * (character.size || 1);
    face.lie(pos.x, pos.z, ux, uz, SPAN_HH * hh, 0.26 * hh, lie);
    const t = Math.PI / 2 - lie.angle, out = WALL_HH * hh + lie.off;
    tmp.set(pos.x - ux * Math.cos(t) * out, pos.y + Math.sin(t) * out, pos.z - uz * Math.cos(t) * out);
    shown.copy(root.position).add(character.object.position).sub(tmp);
    tiltFrom = character.object.rotation.x;
    // on with the hand that is up: her left, the clip's mirror
    const lh = character.model.getObjectByName('J_Bip_L_Hand'), rh = character.model.getObjectByName('J_Bip_R_Hand');
    const mirror = !!(lh && rh && character.actions[CLIMB_TOP_MIRROR]) && lh.getWorldPosition(new THREE.Vector3()).y > rh.getWorldPosition(new THREE.Vector3()).y;
    planClimbTop({ root: tmp, dx: ux, dz: uz, edge: spot, hh, standAt, footing, mirror }, ctPlan);
    pos.copy(tmp);
    heading = Math.atan2(ux, uz);
    mode = 'vault'; vaultT = ctPlan.c0; speed = 0; climbW = 0; standOff = 0; reachFrom.set(0, 0, 0); ctTail = 0; ctOff = 0;
    character.play(ctPlan.clip, 0.15, false);
    character.actions[ctPlan.clip].time = ctPlan.c0;
    character.setRate(1);
    vaultT += dt;                                                             // (on at once: this frame is hers in it, no pause)
    climbTopAt(ctPlan, vaultT, ctAt);
    pos.set(ctAt.x, ctAt.y, ctAt.z);
  }
  // climbing, she kicks off the rock (ux, uz: into it, over the ground) into a flight. false: her clips have no kick
  function kickOff(k, ux, uz) {
    me.heading = heading;
    if (!air.kickOff(me, -ux, -uz)) return false;
    pos.x -= ux * 0.1 * k; pos.z -= uz * 0.1 * k;                              // (a hand's breadth off the rock)
    mode = 'air'; peakY = airBase = pos.y; landT = -1; edgeT = 0; edgeGrace = 0; grabShy = GRAB_SHY; leapT = 0;
    speed = Math.hypot(me.vel.x, me.vel.z); vy = air.vy;
    return true;
  }
  function climbStep(dt, k, amount, pushing, want) {
    const CLIMB = CLIMB0 * k;
    climbT += dt; leapT = Math.max(0, leapT - dt); leapCool = Math.max(0, leapCool - dt);
    if (dashWanted > 0) { dashWanted = 0; grabShy = GRAB_SHY; vy = 0; startSlide(k); return; }      // the dash button lets go
    const at = face.at(pos.x, pos.z), ux = at.ux, uz = at.uz;
    // the stick, read against the rock: towards it is up, away from it down, across it along (whatever the camera's angle)
    let up = 0, side = 0;
    if (pushing) {
      const wx = Math.sin(want) * amount, wz = Math.cos(want) * amount;
      up = wx * ux + wz * uz; side = -wx * uz + wz * ux;
      if (Math.abs(up) > 0.2) up = Math.sign(up) * Math.min(1, Math.abs(up) * 1.6);      // (a stick that leans at the rock means up it)
      const l = Math.hypot(up, side); if (l > 1) { up /= l; side /= l; }
    }
    // the jump button with the stick pulled away from the rock: she kicks off it, backwards, and turns round in the air
    // (a flight with three jumps left: magic-jump.js, the mocap's kick off a wall). Else it is a leap up the rock
    if (jumpWanted > 0 && up < -0.3 && kickOff(k, ux, uz)) { jumpWanted = 0; return; }
    if (jumpWanted > 0 && leapCool === 0) { jumpWanted = 0; leapT = LEAP_T; leapCool = LEAP_COOL; }
    if (leapT > 0 && !pushing) up = 1;
    // her hands at the top: over it
    if (up > 0.3 && face.top(pos.x, pos.z, REACH0 * k, spot) >= 0) { startVault(k, dt); return; }
    const v = CLIMB * (leapT > 0 ? LEAP : 1);
    let moved = 0;
    if (up !== 0 || side !== 0) {
      face.step(pos.x, pos.z, up, side, v * dt, tmp);
      solids(tmp, k);
      const f = footing(tmp.x, tmp.z);
      if (f === 'cliff' || f === 'ground' || f === 'water') {
        moved = Math.hypot(tmp.x - pos.x, tmp.z - pos.z);
        pos.x = tmp.x; pos.z = tmp.z;
        if (f === 'cliff') onRock = true;
        else if (f === 'water') { swimIn(k, false); return; }
        else if (onRock) { mode = 'ground'; speed = 0; return; }             // her feet on ground again: at the foot, or over the top
      }
    }
    if (!onRock && climbT > 0.6) { mode = 'ground'; return; }                 // (she never got onto the rock)
    pos.y += (standAt(pos.x, pos.z) - pos.y) * Math.min(1, dt * 16);
    went = moved / dt; speed = 0;
    climbRate = moved > 1e-5 ? (up < -0.3 ? -1 : 1) * Math.min(1.7, Math.max(0.5, v * Math.hypot(up, side) / (character.speeds.climb || 1))) : 0;
    heading += wrap(Math.atan2(ux, uz) - heading) * Math.min(1, dt * 9);
  }
  // ---- going over a low thing (player-hurdle.js found it: ahead): her vault, fitted to it (player-vault.js). Where she
  // comes down must be somewhere to be: ground no higher than its top, or a drop (water, ground far below, a face) that she
  // falls to once she is off the top
  function startHurdle(k) {
    const hh = (character.hipsHeight || 1) * (character.size || 1), dx = Math.sin(heading), dz = Math.cos(heading);
    if (!character.actions[VAULT_CLIP] || !planVault(ahead, { speed, hh, k, y0: pos.y }, plan)) return false;
    const along = vaultAt(plan, VAULT_TIMES.touch, path).along;
    const lx = pos.x + dx * along, lz = pos.z + dz * along, f = footing(lx, lz), ground = standAt(lx, lz);
    let drop = false;
    if (f === 'ground' && ground <= ahead.top - 0.1) drop = ground < pos.y - 0.6 * k;
    else if (f === 'water' || (f === 'cliff' && ground < pos.y)) drop = true;
    else return false;
    planVault(ahead, { speed, hh, k, y0: pos.y, y1: drop ? pos.y : ground }, plan);
    Object.assign(crossing, { x: pos.x, y: pos.y, z: pos.z, dx, dz, drop });
    mode = 'hurdle'; overC = plan.c0; hopLift = 0; ikTail = 0; hurdleT = 0; landT = -1; dashT = 0; edgeT = 0; edgeGrace = 0; grabT = 0;
    character.play(VAULT_CLIP, plan.c0 > 0.05 ? 0.2 : 0.14, false); character.setRate(0);
    character.actions[VAULT_CLIP].time = overC;
    return true;
  }
  function hurdleStep(dt, k, pushing) {
    const was = vaultAt(plan, overC, path).along;
    overC += dt * path.rate;
    vaultAt(plan, overC, path);
    went = (path.along - was) / Math.max(dt, 1e-4);
    pos.set(crossing.x + crossing.dx * path.along, path.y, crossing.z + crossing.dz * path.along);
    hopLift = Math.max(0, path.y - crossing.y);
    const clip = character.actions[VAULT_CLIP];
    clip.time = Math.min(overC, clip.getClip().duration);
    // over a parapet with the river below: off the top, she falls (a flight: magic-jump.js)
    if (crossing.drop && overC >= VAULT_TIMES.push + 0.06) {
      speed = Math.min(went, RUN0 * k); hopLift = 0; ikTail = VAULT_TAIL;
      leave(0, k, false); airBase = crossing.y;                               // (airBase: the camera stays where it was)
      return;
    }
    if (!path.down) return;
    // down on her front foot
    pos.y = standAt(pos.x, pos.z); peakY = pos.y; hopLift = 0; ikTail = VAULT_TAIL;
    mode = 'ground'; vy = 0;
    const depth = depthAt(pos.x, pos.z);
    if (depth > 0.06 && level.ripple) level.ripple(pos.x, pos.z, 1.0, 0.32, 'splash');
    if (pushing) {
      // going on: the clip's last stride is her run's own (the sprint), so her run takes over at the same moment of its stride
      speed = Math.min(Math.max(went, WALK0 * k), RUN0 * k); landT = -1; pace = paceWas = speed;
      character.play('run', 0.2, false);
      const run = character.actions.run;
      if (run) run.time = (VAULT_TIMES.runPhase + (overC - VAULT_TIMES.touch)) % run.getClip().duration;
    } else {
      // the stick let go: down into the jump's landing, and she stops
      speed = Math.min(went, RUN0 * k) * 0.5; landT = 0;
      lightLanding(LAND_HOLD);
      character.play(landClip, 0.22, false);
      if (landClip === 'jump_land' && character.actions.jump_land) character.actions.jump_land.time = 0.1;
    }
    lastSafe.copy(pos);
  }
  function vaultStep(dt, k, pushing) {
    vaultT += dt;
    if (ctPlan.ok) {
      climbTopAt(ctPlan, Math.min(vaultT, ctPlan.end), ctAt);
      pos.set(ctAt.x, ctAt.y, ctAt.z);
      went = 0;
      // off: the stick held, on into her run once both feet are down on the top; let go, once she stands
      if ((pushing && vaultT >= ctPlan.down) || vaultT >= ctPlan.end) {
        pos.x -= ctPlan.dx * ctOff; pos.z -= ctPlan.dz * ctOff; ctOff = 0;     // (where she was held off the face: hers now)
        pos.y = standAt(pos.x, pos.z);
        mode = 'ground'; speed = pushing ? WALK0 * k : 0; landT = -1; ctTail = ctIK.TAIL;
        went = paceWas = pace = speed;                                        // (on into her stride, not through her standing pose)
      }
      return;
    }
    const u = vaultT / VAULT_T, rise = smooth(u / 0.7), over = smooth((u - 0.25) / 0.75);
    pos.set(vault0.x + (vault1.x - vault0.x) * over, vault0.y + (vault1.y - vault0.y) * rise, vault0.z + (vault1.z - vault0.z) * over);
    went = 0;
    if (u >= 1) { pos.copy(vault1); mode = 'ground'; speed = 0; landT = -1; }
  }

  // ---- swimming
  function swimIn(k, splash) {
    air.end(); mode = 'swim'; vy = 0; speed = Math.min(speed, SWIM0 * k); landT = -1; dashT = 0; sprint = false; wake = 0.2;
    if (splash && level.ripple) level.ripple(pos.x, pos.z, 1.5, 0.34, 'splash');
    character.play(speed > 0.5 ? 'swim' : 'swim_idle', 0.3);
  }
  // May she swim (or wade out) from water whose surface is at `here` to (x, z)? Not over a fall or up one, not onto a bank
  // that stands out of the water, not into a wall
  function maySwim(x, z, here, k) {
    const f = footing(x, z);
    if (f !== 'water' && f !== 'ground') return false;
    const d = depthAt(x, z);
    return d >= SWIM_OUT0 * k ? Math.abs(level.heightAt(x, z) + d - here) < 0.4 : standAt(x, z) - here < 0.3 * k;
  }
  function swimStep(dt, k, pushing, running, want) {
    const SWIM = SWIM0 * k, here = surfaceAt(pos.x, pos.z);
    dashWanted = 0; jumpWanted = 0;
    speed += ((pushing ? SWIM * (running ? 1 : 0.55) : 0) - speed) * Math.min(1, dt * 3);
    turned = pushing ? wrap(want - heading) * Math.min(1, dt * 5) : 0;
    heading += turned;
    went = 0;
    if (speed > 0.02) {
      tmp.set(pos.x + Math.sin(heading) * speed * dt, 0, pos.z + Math.cos(heading) * speed * dt);
      solids(tmp, k);
      if (footing(tmp.x, tmp.z) === 'cliff' && pushing && grabShy <= 0 && pushedAt(want, tmp.x, tmp.z, 0.25)) { pos.x = tmp.x; pos.z = tmp.z; grab(k, dt); return; }      // out of the water, up a rock bank
      let lip = false;
      if (!maySwim(tmp.x, tmp.z, here, k)) {
        // a lip the water goes over, with ground or water below to land on: pushing at it for a moment, over she goes
        const dx = tmp.x - pos.x, dz = tmp.z - pos.z, len = Math.hypot(dx, dz);
        if (len > 1e-6 && shy <= 0 && standAt(tmp.x, tmp.z) < here - 0.4) {
          const drop = beyond(pos.x, pos.z, dx / len, dz / len, len, here);
          if (drop > 0.4 && drop <= FAR0 * k) {
            lip = true; lipT += dt;
            if (lipT >= EDGE_WAIT) { lipT = 0; pos.y = here; leave(HOP0 * k, k, false, HOP_OUT0 * k); return; }
          }
        }
        if (maySwim(tmp.x, pos.z, here, k)) tmp.z = pos.z; else if (maySwim(pos.x, tmp.z, here, k)) tmp.x = pos.x; else { tmp.x = pos.x; tmp.z = pos.z; }
      }
      if (!lip) lipT = 0;
      went = Math.hypot(tmp.x - pos.x, tmp.z - pos.z) / dt;
      pos.x = tmp.x; pos.z = tmp.z;
      if (went < speed * 0.3) speed = Math.min(speed, went * 1.15 + 0.05);
    }
    const d = depthAt(pos.x, pos.z);
    if (d < SWIM_OUT0 * k) { mode = 'ground'; return; }                       // it shallows: she stands
    pos.y += (level.heightAt(pos.x, pos.z) + d - pos.y) * Math.min(1, dt * 8);      // the clips have the water's surface at her root
    wake -= dt;
    if (wake <= 0 && level.ripple) { level.ripple(pos.x, pos.z, went > 0.5 ? 0.8 : 0.45, went > 0.5 ? 0.34 : 0.42, went > 0.5 ? 'step' : 'plain'); wake = went > 0.5 ? 0.3 + Math.random() * 0.1 : 1.1 + Math.random() * 0.7; }
  }

  // ---- on her feet, in the air, down a face: walking, running, dashing, jumping, falling, sliding
  function walkStep(dt, k, amount, pushing, running, want) {
    const WALK = WALK0 * k, RUN = RUN0 * k, SPRINT = SPRINT0 * k, DASH = DASH0 * k, DEEP = DEEP0 * k, grav = GRAV0 * k;
    airStick.amount = pushing ? Math.min(1, amount) : 0; airStick.x = Math.sin(want); airStick.z = Math.cos(want);      // (the stick, as the magic jump reads it)
    const shallow = depthHere < 0.32 * k;      // (deeper than her knees: no jump, no dash)
    // ---- dash: a burst the way the stick points, then a sprint while she keeps running
    if (dashWanted > 0 && dashCool === 0 && mode === 'ground' && shallow) {
      dashWanted = 0; dashT = DASH_T; dashCool = DASH_COOL; sprint = true; landT = -1;
      if (pushing) heading = want;
    }
    easedOff = running ? 0 : easedOff + dt;
    if (sprint && dashT <= 0 && (easedOff > 0.25 || !shallow)) sprint = false;
    if (edgeGrace > 0 && pushing) { edgeGrace -= dt; edgeT += dt; } else { edgeGrace = 0; edgeT = 0; }
    // ---- how fast, and which way she turns
    let target = 0;
    turned = 0;
    if (pushing) {
      target = running ? (sprint ? SPRINT : RUN) : WALK * Math.max(0.6, amount / 0.72);
      // (with her weight: the faster she goes the slower she turns, and turned back at a run she brakes first)
      const back = weight && mode === 'ground' && speed > WALK * 1.3 && Math.abs(wrap(want - heading)) > W_BACK;
      const turnRate = back ? W_PIVOT : weight && mode === 'ground' ? W_TURN[0] + (W_TURN[1] - W_TURN[0]) * Math.min(1, Math.max(0, (speed - WALK) / (SPRINT - WALK))) : 11;
      if (back) target = Math.min(target, WALK * W_BRAKE);
      turned = wrap(want - heading) * Math.min(1, dt * turnRate);
      if (mode === 'ground') heading += turned;                               // (sliding, she goes where the rock sends her; in the air, where the jump does)
    }
    // the slope under her, along her way (the rise in a metre): up it she slows a little, down it she goes a little faster
    grade = 0;
    if (mode === 'ground') {
      const sx = Math.sin(heading) * 0.5, sz = Math.cos(heading) * 0.5;
      grade = Math.min(1, Math.max(-1, standAt(pos.x + sx, pos.z + sz) - standAt(pos.x - sx, pos.z - sz)));
      target *= grade > 0 ? 1 - 0.2 * Math.min(1, grade / 0.6) : 1 + 0.1 * Math.min(1, -grade / 0.5);
    }
    // wading slows her down, the more the deeper it is (ankle-deep hardly at all, knee-deep she cannot run)
    const heavy = Math.min(1, Math.max(0, (depthHere - 0.1 * k) / (0.4 * k))), drag = heavy * heavy * (3 - 2 * heavy);
    target *= 1 - 0.52 * drag;
    // running into the water: one splash where she breaks the surface
    if (mode === 'ground' && depthHere > 0.06 && wasDepth <= 0.06 && speed > 2.2 * k && level.ripple) level.ripple(pos.x + Math.sin(heading) * 0.25, pos.z + Math.cos(heading) * 0.25, 0.9, 0.3, 'splash');
    // standing in water: a slow ring now and then (walking, each foot's own landing makes the ring: player-footsteps.js)
    if (depthHere > 0.04 && level.ripple && mode === 'ground') {
      wade -= dt;
      const moving = speed > 0.3;
      if (wade <= 0 && (!moving || !steps.count)) {
        stepSide = -stepSide;
        const px = pos.x + Math.cos(heading) * stepSide * 0.12, pz = pos.z - Math.sin(heading) * stepSide * 0.12;
        const body = (0.7 + 0.6 * Math.min(1, depthHere / 0.4)) * 0.55;
        level.ripple(px, pz, moving ? body : body * 0.8, moving ? 0.34 : 0.42, moving ? 'step' : 'plain');
        wade = moving ? 0.17 + Math.random() * 0.09 : 1.2 + Math.random() * 0.8;      // never quite in time, like real steps
      }
    } else wade = 0;
    // the burst holds her at the dash's pace; otherwise water is slow to get going in and quick to stop her. In the air the
    // jump says how fast she goes across, and which way (magic-jump.js)
    // (with her weight: on the ground she gathers and loses speed at so many m/s², and a landing holds her back until it is
    // over, the more the harder it was)
    if (landT < 0) landW = 0;
    if (weight && landT >= 0 && landT < landHold) target = Math.min(target, RUN * (1 - landW));
    gain = 0;
    if (dashT > 0) { dashT -= dt; if (mode === 'ground') speed = Math.max(speed, DASH * (1 - 0.5 * drag)); }
    else if (weight && mode === 'ground' && dt > 0) {
      const most = (target > speed ? W_ACC0 * (1 - 0.5 * drag) : W_DEC0 * (1 + 0.5 * drag)) * k * dt, was = speed;
      speed += Math.max(-most, Math.min(most, target - speed));
      gain = (speed - was) / dt;
    } else speed += (target - speed) * Math.min(1, dt * (mode !== 'ground' ? 1.5 : target > speed ? 7 - 4 * drag : 10 + 5 * drag));
    if (mode === 'air') speed = Math.hypot(me.vel.x, me.vel.z);
    // ---- she moves
    const wasRunning = mode === 'ground' && speed > WALK * 1.5;                // (before a face stops her)
    grabPush = false; faceAhead = false;
    if (mode === 'slide') {
      // down a cliff's face: the way it falls, her feet on the rock, until there is ground or water under her. She gathers
      // speed downwards as in a fall held back by the rock. Pushing at the rock, she takes hold of it
      if (pushing && grabShy <= 0 && pushedAt(want, pos.x, pos.z)) { grab(k, dt); return; }
      const at = face.at(pos.x, pos.z), gl = at.slope;
      let moved = 0, over = 0;
      slideT += dt;
      if (gl > 1e-4) {
        const dx = -at.ux, dz = -at.uz;
        slideV = Math.min(slideV + 0.7 * grav * dt, SLIDE_FALL0 * k);         // (downwards)
        over = Math.min(SLIDE0 * k, slideV / Math.max(gl, 0.3));              // (over the ground: the steeper, the less)
        tmp.set(pos.x + dx * over * dt, 0, pos.z + dz * over * dt);
        solids(tmp, k);
        const f = footing(tmp.x, tmp.z);
        if (f !== 'ground' && f !== 'cliff' && f !== 'water') tmp.set(pos.x, 0, pos.z);      // (nowhere to go on that way: a wall, the map's end)
        moved = Math.hypot(tmp.x - pos.x, tmp.z - pos.z);
        pos.x = tmp.x; pos.z = tmp.z;
        const d = wrap(Math.atan2(dx, dz) - heading);
        if (Math.abs(d) < 1.75) heading += d * Math.min(1, dt * 6);            // she faces the way she slides, unless that is behind her
      }
      went = moved / dt; speed = Math.min(went, RUN);
      stuckT = moved < over * dt * 0.2 ? stuckT + dt : 0;
    } else if (speed > 0.02) {
      const vx = mode === 'air' ? me.vel.x : Math.sin(heading) * speed, vz = mode === 'air' ? me.vel.z : Math.cos(heading) * speed;
      tmp.set(pos.x + vx * dt, 0, pos.z + vz * dt);
      if (!footing && depthAt(tmp.x, tmp.z) > DEEP && depthAt(tmp.x, tmp.z) > depthHere) {
        // (a map that cannot say what its ground is like) too deep ahead: try sliding along the shore instead of walking in
        const ax = pos.x + Math.sin(heading + 1.1) * speed * dt, az = pos.z + Math.cos(heading + 1.1) * speed * dt;
        const bx = pos.x + Math.sin(heading - 1.1) * speed * dt, bz = pos.z + Math.cos(heading - 1.1) * speed * dt;
        const da = depthAt(ax, az), db = depthAt(bx, bz);
        if (Math.min(da, db) > DEEP) tmp.set(pos.x, 0, pos.z); else if (da < db) tmp.set(ax, 0, az); else tmp.set(bx, 0, bz);
      }
      solids(tmp, k);
      land(tmp, k);
      went = Math.hypot(tmp.x - pos.x, tmp.z - pos.z) / dt;
      pos.x = tmp.x; pos.z = tmp.z;
      if (mode === 'air' && went < speed * 0.9) me.vel.multiplyScalar(went / speed);      // stopped by something in the air: her flight across is too
      if (went < speed * 0.3) speed = Math.min(speed, went * 1.15 + 0.05);    // pushing against something: stop walking on the spot
    } else went = 0;
    // ---- a low thing in her way (a fence, a parapet, a barrel): running at it, she vaults it from as far before it as the
    // vault's run-up wants (vaultLead: her hand comes down on its near side); walking, once she is at it and has pushed at
    // it a moment (not every brush of a fence's rail as she walks by)
    const hh = (character.hipsHeight || 1) * (character.size || 1), runAt = speed > WALK * 1.5;
    if (footing && mode === 'ground' && pushing && shallow && Math.abs(wrap(want - heading)) < 0.5
        && findHurdle(level.colliders, pos.x, pos.z, pos.y, Math.sin(heading), Math.cos(heading), k, vaultLead(NOWHERE, hh, k) + 0.2, ahead)
        && ahead.from <= (runAt ? vaultLead(ahead, hh, k) : 0.45 * k)) {
      hurdleT += dt;
      if ((runAt || hurdleT >= HURDLE_WAIT) && jumpWanted <= 0 && startHurdle(k)) return;      // (the jump button: the magic jump, below)
    } else hurdleT = 0;
    // running square at a ledge (a face whose top is in her reach): over it at once, not stood a moment at its foot
    if (grabPush && wasRunning && grabShy <= 0 && character.actions[CLIMB_TOP_CLIP] && face.top(pos.x, pos.z, REACH0 * k, spot) >= 0) { grab(k, dt); return; }
    // pushing at a face (or stopped by one, at whatever angle): after a moment she takes hold of it
    if (faceAhead && pushing && went < 0.35 * WALK) grabPush = true;
    grabT = grabPush && mode === 'ground' ? grabT + dt : 0;
    if (grabT >= GRAB_WAIT) { grab(k, dt); return; }
    if (mode === 'air' && footing && pushing && grabShy <= 0 && air.upside < 0.3 && grabInAir(k, want, dt)) return;      // in the air, at once
    // her legs go at the pace she really goes: along a cliff's edge or round a trunk she goes slower than she means to
    const paceNow = Math.min(speed, went * 1.1 + 0.05);
    pace = Math.min(paceNow, paceWas);                                        // (a pace held for one frame only does not change her gait)
    paceWas = paceNow;
    const ground = standAt(pos.x, pos.z), depth = depthAt(pos.x, pos.z), deep = footing && depth >= SWIM_IN0 * k;
    // ---- jumping: off the ground at once, unless she is deeper in the water than her knees; in the air, the next jump
    // of the flight (a press it cannot take yet is kept a moment, JUMP_BUFFER)
    if (mode === 'ground' && jumpWanted > 0 && shallow) {
      // (by a low thing too: the magic jump, not the vault, so four jumps can go up over it. Until 19 Nov 2026 the button by
      // a fence vaulted it, and the presses after were lost: "รั้วด้วย โดด 4 ชั้นไม่ได้")
      jumpWanted = 0;
      leave(0, k, true);
      if (depthHere > 0.04 && level.ripple) level.ripple(pos.x, pos.z, 0.8, 0.3, 'splash');      // pushing off from the water
    } else if (mode === 'air' && jumpWanted > 0 && air.press(me, airStick)) jumpWanted = 0;
    // ---- her height: on the ground, in the air, down a face
    if (mode === 'air') {
      // up and down: the flight's (magic-jump.js). Deep water is met a little under its surface, and no circle catches her
      // over it
      const floor = deep ? ground + depth - 0.2 * k : ground, was = air.vy;
      me.heading = heading;
      const down = air.step(dt, me, airStick, floor, !deep);
      heading = me.heading; vy = down === 'landed' ? was : air.vy;
      if (pos.y > peakY) peakY = pos.y;
      if (deep && pos.y <= floor) swimIn(k, true);                             // into deep water: she comes up swimming
      else if (pos.y <= ground) {
        // on a cliff's face (coming down on it, or jumping up at it): pushing at it she takes hold, or else she slides on
        // down. (Rising past ground she may stand on, a rock's top: carried up with it)
        pos.y = ground;
        if (footing && footing(pos.x, pos.z) === 'cliff') { air.end(); if (pushing && grabShy <= 0 && pushedAt(want, pos.x, pos.z)) grab(k, dt); else startSlide(k); }
        else if (down === 'landed') touchDown(k, depth, false);
      } else if (footing && peakY - pos.y > (FAR0 + 6) * k) rescue(true);      // (it does not happen: the edges of such drops are walls)
    } else if (mode === 'slide') {
      pos.y = ground;
      const f = footing(pos.x, pos.z);
      if (deep) swimIn(k, true);
      else if (f === 'ground') touchDown(k, depth, true);
      else if (peakY - pos.y > (FAR0 + 6) * k) rescue(true);                  // a face that ran on into a far deeper one: not down there
      else if (stuckT > 0.2 && f === 'cliff') grab();                         // nowhere to slide on to (the map's end below her): she holds on to the rock
      else if (stuckT > 0.35 || slideT > 8) rescue();
    } else {
      const dy = ground - pos.y;
      if (deep) swimIn(k, false);                                             // too deep to stand: she swims
      else if (footing && footing(pos.x, pos.z) === 'cliff') startSlide(k);     // put on a face (it does not happen walking): down she goes
      else if (dy < -(STEP0 * k + went * dt * 1.2) && depth < 0.3 * k) leave(0, k, false);      // the ground fell away under her (a rock's top, a deck's end)
      else if (Math.abs(dy) <= went * dt * 1.5 + 0.004) pos.y = ground;       // the slope she walks on: her feet on it
      else pos.y += dy * Math.min(1, dt * 18);                                // a step up or down (or, out of a swim, down to the bed): taken smoothly
    }
    if (mode === 'ground') lastSafe.copy(pos);
  }

  // ---- what she looks like doing it: the clip, her body's lean, her place
  function pose(dt, k, WALK, RUN) {
    const st = pace < 0.25 ? 'idle' : pace < (WALK + RUN) * 0.5 ? 'walk' : 'run';
    if (mode === 'climb') {
      if (character.state !== 'climb') character.play('climb', 0.18);
      character.setRate(climbRate);
    } else if (mode === 'vault' && ctPlan.ok) {
      const a = character.actions[ctPlan.clip];                              // (the clip's moment is hers in it: the same as her root's way)
      if (a && character.state === ctPlan.clip) a.time = Math.max(0, vaultT - dt);
    } else if (mode === 'vault' || mode === 'hurdle') {
      /* (the clip's rate was set as it began; a low thing's vault sets the clip's moment as it goes) */
    } else if (mode === 'swim') {
      const sw = speed > 0.5 * k ? 'swim' : 'swim_idle';
      if (character.state !== sw) character.play(sw, 0.35);
      character.setRate(sw === 'swim' ? Math.min(1.3, Math.max(0.7, speed / (SWIM0 * k))) : 1);
    } else if (mode === 'air') {
      /* (the flight plays her clips: magic-jump.js) */
    } else if (mode === 'slide') {
      const rise = character.actions.jump_start;
      if (character.state === 'jump_start' && rise && rise.time >= rise.getClip().duration - 0.02) character.play('jump_air', 0.2, false);
      if (character.state !== 'jump_start' && character.state !== 'jump_air') character.play('jump_air', 0.18, false);
      character.setRate(character.state === 'jump_start' ? START_RATE : 1);
    } else if (landT >= 0) {
      landT += dt;
      const landing = character.actions[landClip];
      if ((pace >= 0.25 && landT > landHold) || character.state !== landClip || (landing && landing.time >= landing.getClip().duration - 0.02)) landT = -1;
      else character.setRate(landRate);
      if (stopT > 0) { stopT -= dt; character.setRate(0); }                  // (a hard landing: her feet hit, and she is stopped a moment)
    }
    if (mode === 'ground' && landT < 0) {
      if (character.state !== st) character.play(st, st === 'idle' ? 0.3 : /land/.test(character.state) ? 0.28 : 0.2);      // (up out of a landing: a longer blend)
      character.setRate(st === 'idle' ? 1 : Math.min(1.9, Math.max(0.7, pace / (character.speeds[st] || 1))));      // (her legs at the pace she goes, as the walker's)
    }
    character.update(dt);
    // ---- her body leans: forward up a hill and back down one (walking it, not standing on it), forward in a dash and a
    // sprint, and into her turns. Climbing, she is laid against the rock: tilted to it about her feet, as far out of it as the clip's wall is
    const going = Math.min(1, pace / WALK), walking = mode === 'ground';
    const wantLean = !walking ? 0 : grade * (grade > 0 ? 0.2 : 0.14) * going + (dashT > 0 ? 0.2 : sprint && pace > RUN ? 0.06 : 0)
      + (weight && gain > 0 ? W_LEAN[0] * Math.min(1, gain / (W_ACC0 * k)) : weight && gain < 0 ? -W_LEAN[1] * Math.min(1, -gain / (W_DEC0 * k)) : 0);      // (her weight: with how she gathers or loses speed)
    const wantRoll = !walking || dt <= 0 ? 0 : Math.min(0.14, Math.max(-0.14, -turned / dt * 0.03 * Math.min(1, pace / RUN)));
    lean += (wantLean - lean) * ease(8, dt); roll += (wantRoll - roll) * ease(6, dt);
    // The flat she is laid on is taken from the rock under her whole body, from her feet to her hands (player-climb.js),
    // the way she faces: the rock's angle under her feet alone put her chest and head inside it wherever the face curved
    const hh = (character.hipsHeight || 1) * (character.size || 1);
    if (mode === 'climb') {
      const hx = Math.sin(heading), hz = Math.cos(heading);
      face.lie(pos.x, pos.z, hx, hz, SPAN_HH * hh, 0.26 * hh, lie);
      const first = climbW < 0.05;
      tilt += (Math.PI / 2 - lie.angle - tilt) * ease(first ? 60 : 8, dt);
      standOff += (lie.off - standOff) * ease(first ? 60 : lie.off > standOff ? 30 : 6, dt);      // (out of a bulge's way at once; back onto the rock gently)
      nX = -hx * Math.cos(tilt); nY = Math.sin(tilt); nZ = -hz * Math.cos(tilt);                  // (out of the flat, square to her body as it now lies)
    }
    climbW += ((mode === 'climb' ? 1 : 0) - climbW) * ease(mode === 'climb' ? 9 : 12, dt);
    if (climbW < 0.002) { climbW = 0; standOff = 0; }
    const out = (WALL_HH * hh + standOff) * climbW;
    root.position.copy(pos);
    reachFrom.multiplyScalar(1 - ease(12, dt));
    if (mode === 'vault' && ctPlan.ok) {
      // over a cliff's top: her root is where the clip's way has it; where she was shown as it began eases away, and her
      // lean to the rock goes as she comes up over the top
      shown.multiplyScalar(1 - ease(14, dt));
      character.object.position.copy(shown).addScaledVector(away.set(-ctPlan.dx, 0, -ctPlan.dz), ctOff);
      character.object.rotation.set(tiltFrom * ctAt.tilt, heading, 0, 'YXZ');
    } else {
      character.object.position.set(nX * out + reachFrom.x, nY * out, nZ * out + reachFrom.z);
      character.object.rotation.set(lean + tilt * climbW, heading, roll, 'YXZ');
    }
    air.pose(dt, me);                                              // her body in a flight (and easing out of one), over her clip
    // over a cliff's top: her hands and feet on the real rock (player-climb-top.js); let go of gently once she is off
    if (mode === 'air' || mode === 'swim') ctTail = 0;                            // (off again at once: nothing to hold)
    if ((mode === 'vault' && ctPlan.ok) || ctTail > 0) {
      if (mode !== 'vault') { ctTail = Math.max(0, ctTail - dt); vaultT += dt; }
      root.updateMatrixWorld(true);
      // held off a sheer face by as much as her knees or elbows are in it (out at once, back onto it gently; her hands and
      // feet stay where they hold: the IK)
      const inside = ctIK.apply(ctPlan, vaultT, mode === 'vault' ? 1 : ctTail / ctIK.TAIL);
      if (mode === 'vault') {
        const want = Math.min(CT_MOST_OFF * k, ctOff + inside);
        ctOff += (want - ctOff) * ease(want > ctOff ? 30 : 4, dt);
      }
    }
    // vaulting a low thing: her hand and foot on its top and her feet over it (player-vault.js); let go of gently once she is down
    if (mode === 'hurdle' || ikTail > 0) {
      if (mode !== 'hurdle') { ikTail = Math.max(0, ikTail - dt); overC += dt; }
      root.updateMatrixWorld(true);
      vaultIK.apply(plan, overC, crossing, crossing.dx, crossing.dz, mode === 'hurdle' ? 1 : ikTail / VAULT_TAIL);
    }
    if (character.holdSprings) character.holdSprings(1 + 4 * air.held, 1 - air.upside);      // her hair and skirt held harder in the air
    if (character.updateSprings) character.updateSprings(dt);      // hair and cloth follow where she now is
  }

  const player = {
    object: root, position: pos, blob: shadow, lookDir: cam.lookDir,
    get character() { return character; },
    get heading() { return heading; }, get camYaw() { return cam.yaw; }, get camPitch() { return cam.pitch; }, get camDist() { return cam.dist; }, get speed() { return speed; },
    get airborne() { return mode !== 'ground'; }, get mode() { return mode; }, get sprinting() { return sprint; },
    get flight() { return air; },                                  // (for a test, or the console: the magic jump)
    get weight() { return weight; }, setWeight(on) { weight = !!on; if (!weight) { landW = 0; stopT = 0; gain = 0; } },      // her weight (see above)
    jump() { jumpWanted = JUMP_BUFFER; },
    dash() { dashWanted = JUMP_BUFFER; },
    // another character takes her place, mid-stride or mid-air: same spot, same heading, same speed
    setCharacter(next) {
      if (next === character) return;
      root.remove(character.object);
      character.object.position.set(0, 0, 0);
      character = next;
      root.add(character.object);
      steps.find(character);
      air.setCharacter(character);
      vaultIK = createVaultIK(character);
      ctIK = createClimbTopIK(character); ctTail = 0;
      landT = -1;
      if (mode === 'vault') { if (ctPlan.ok) pos.set(ctPlan.x1, ctPlan.y1, ctPlan.z1); else pos.copy(vault1); mode = 'ground'; }
      if (mode === 'hurdle') { character.play(VAULT_CLIP, 0); character.setRate(0); character.actions[VAULT_CLIP].time = overC; }
      else character.play(mode === 'ground' ? 'idle' : mode === 'climb' ? 'climb' : mode === 'swim' ? 'swim_idle' : 'jump_air', 0);
      if (character.resetSprings) character.resetSprings();
    },
    // (y: about how high she stands, where that tells two grounds apart: on a bridge's deck, or on the bed under it. None: the top)
    teleport(x, z, yaw = heading, y) {
      pos.set(x, standOn(x, z, y), z); heading = yaw; cam.setView(yaw - Math.PI);
      air.end(); mode = 'ground'; vy = 0; speed = 0; landT = -1; dashT = 0; edgeT = 0; edgeGrace = 0; grabT = 0; climbW = 0; ikTail = 0; ctTail = 0; reachFrom.set(0, 0, 0); shown.set(0, 0, 0); lastSafe.copy(pos);
      if (character.resetSprings) character.resetSprings();
    },
    setView(yaw, pitch, dist) { cam.setView(yaw, pitch, dist); },
    update(dt) {
      dt = Math.min(dt, 0.05);
      const k = size(), WALK = WALK0 * k, RUN = RUN0 * k;
      // ---- her hands -> the way she wants to go, relative to the camera ("forward" on the stick goes away from it)
      const amount = input.stick(stickV), pushing = amount > 0.12, running = amount > 0.72;
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = -fz, rz = fx;      // away from the camera; to its right
      const want = pushing ? Math.atan2(rx * stickV.x - fx * stickV.y, rz * stickV.x - fz * stickV.y) : heading;
      depthHere = depthAt(pos.x, pos.z);
      jumpWanted = Math.max(0, jumpWanted - dt); dashWanted = Math.max(0, dashWanted - dt); dashCool = Math.max(0, dashCool - dt);
      shy = Math.max(0, shy - dt); grabShy = Math.max(0, grabShy - dt);
      // ---- she moves, as what she is doing has it
      if (mode === 'climb') climbStep(dt, k, amount, pushing, want);
      else if (mode === 'vault') vaultStep(dt, k, pushing);
      else if (mode === 'hurdle') hurdleStep(dt, k, pushing);
      else if (mode === 'swim') swimStep(dt, k, pushing, running, want);
      else walkStep(dt, k, amount, pushing, running, want);
      if (mode === 'climb' || mode === 'vault' || mode === 'hurdle' || mode === 'swim') { pace = 0; paceWas = 0; grade = 0; if (mode !== 'swim') turned = 0; }
      wasDepth = depthHere;
      // what has been in the water is wet (a run splashes her higher; a swim, all over), and dries in a quarter of a minute once she is out
      if (mode === 'swim') { wetH = Math.max(wetH, 2 * k); wetAmt = 1; }
      else if (depthHere > 0.03) { wetH = Math.max(wetH, depthHere + 0.05 + 0.12 * Math.min(1, speed / RUN)); wetAmt = 1; }
      else { wetAmt = Math.max(0, wetAmt - dt / 15); if (wetAmt === 0) wetH = 0; }
      pose(dt, k, WALK, RUN);
      // the blob stays on the ground under her, smaller the higher she is; none on a face or in the water
      const lift = mode === 'air' ? Math.max(0, pos.y - standAt(pos.x, pos.z)) : mode === 'hurdle' ? hopLift : 0, onFeet = mode === 'ground' || mode === 'air' || mode === 'slide' || mode === 'hurdle';
      shadow.position.y = 0.06 - lift;
      shadow.scale.setScalar(onFeet ? k * (1 - 0.35 * Math.min(1, lift / (1.2 * k))) : 1e-4);
      // tell her materials where the water's surface is (far below when she is on land) and how high she is wet
      if (character.water) {
        const depth = depthAt(pos.x, pos.z);
        character.water.level.value = depth > 0.02 ? level.heightAt(pos.x, pos.z) + depth : -1e5;
        character.water.wet.value.set((mode === 'swim' ? pos.y - k : pos.y) + wetH, wetAmt);
      }
      steps.update(dt, { root, pos, speed, walk: WALK, run: RUN, still: mode !== 'ground' || landT >= 0 });
      // ---- the camera: the walker's, standing on her feet's height (in a flight, the ground she left and most of the way
      // up: four jumps go 4.4 m up; over a low thing, the ground and a little of how far the vault raises her; swimming, a little under the
      // surface, so it looks at her head)
      const aimY = mode === 'air' ? pos.y - 0.3 * Math.max(0, pos.y - Math.max(airBase, standAt(pos.x, pos.z)))
        : mode === 'hurdle' ? pos.y - 0.6 * hopLift
        : mode === 'swim' ? pos.y - character.height * 0.82 + 0.55 * k : pos.y;
      cam.update(dt, { pos, aimY, height: character.height, k, steady: mode !== 'air' });
    },
  };
  return player;
}
