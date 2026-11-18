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
//     in the air, and how she comes down, are its too: whenever she is in the air (off an edge, out of a hop) she is in a
//     flight, three jumps left if it was not the button that sent her. A long fall is caught by a circle on the ground.
//   - leave a cliff's top. Walking square at an edge she hops off it (a tall one holds her at the brink for a moment first, so
//     she is not thrown off a height by brushing its edge; a jump or a dash goes at once), falls, and lands at its foot, on
//     the ground or in the water. Where she comes down on the cliff's face she slides down it.
//   - climb. Pushing at a face for a moment she takes hold of it and climbs: the stick towards the rock is up, away from it
//     down, across it along. The jump button is a leap over the rock, the dash button lets go (she slides down). When her
//     hands reach the top she vaults over it; a ledge lower than her reach is vaulted straight from the ground. Sliding or
//     falling down a face, pushing at it takes hold again. No stamina: any face can be climbed.
//   - swim. Water too deep to wade carries her: she swims where the stick points and treads water when it is let go, wades
//     out where it shallows, and climbs out up a rock bank. Not over a waterfall, nor up one.
//   - go over low things: running (or walking, for a moment) at a fence, a bridge's parapet, a barrel, she hops over it, her
//     knees drawn up (player-hurdle.js finds it and makes the hop's arc; the clip is the library's tucked jump), lands as
//     from a jump and runs on; over a bridge's parapet she falls into the river. The jump button by one hops it too.
//   - dash: a burst of speed the way the stick points, then a sprint for as long as she keeps running.
//   - go at the land's pace: a little slower up a slope and faster down it, leaning into the hill, her turns and a dash; her
//     feet stay on a slope she walks.
// Her walk and run are the walker's (a run is 4.2 m/s at 1.75 m; the first trial ran at 5.0 and that was too fast).
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
import { findHurdle, hopLead, planHop, hopAt } from './player-hurdle.js';
import { createMagicJump } from './magic-jump.js';

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
const CLIMB0 = 1.4;                           // m/s over the rock (1.7 at 1.75 m)
const GRAB_WAIT = 0.12, GRAB_SHY = 0.5;       // s she pushes at a face before she takes hold; s after letting go before she will again
const LEAP = 2.5, LEAP_T = 0.3, LEAP_COOL = 0.55;      // a jump on the rock: this many times her climbing pace for LEAP_T s; again after LEAP_COOL s
const REACH0 = 1.6;                           // m over the rock from her feet to her hands (2.0 at 1.75 m): a top that near, she vaults over
const VAULT_T = 0.62, VAULT_FROM = 0.08;      // the vault over a top: how long it takes (s), and how far into the clip it starts (s)
const WALL_HH = 0.44, SPAN_HH = 1.80;         // the climbing clip's wall, in front of her root, and how far up it her hands reach from her root, in hips heights (tools/make-climb-anim.py)
const HURDLE_WAIT = 0.1;                      // s she walks at a low thing before she goes over it (running: at once)
const HOP_FADE = 0.12, HOP_UNTUCK = 0.22;     // the hop over it: s to blend into its clip, and from her knees up to her legs down for the landing
const HOP_LAND = 0.24, HOP_LAND_RATE = 0.6;   // landing from it on the move: s to blend from the landing into her stride, the landing clip going on this much slower (a light dip, not a jump's crouch)
const SWIM0 = 2.1;                            // m/s swimming (2.6 at 1.75 m)
const SWIM_IN0 = 0.847, SWIM_OUT0 = 0.77;     // water this deep carries her (1.05 m at 1.75 m: where footing says 'water'); shallower than this she stands again (0.95)
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const smooth = u => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };

// circles: the magic jump's circles (magic-circle-fx.js), in the scene: the page draws them, the jump says where they open
const NO_CIRCLES = { open() {} };
export function createPlayer({ character: firstCharacter, level, camera, dom, ui = null, onTap = null, circles = NO_CIRCLES }) {
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
  let dashWanted = 0, dashT = 0, dashCool = 0, sprint = false, easedOff = 0;
  let edgeT = 0, edgeGrace = 0;               // how long she has pushed at a tall cliff's brink
  let shy = 0;                                // s after a slide that got her nowhere: edges are walls for a moment
  let grabPush = false, faceAhead = false, grabT = 0, grabShy = 0, lipT = 0;      // pushing at a face this frame; for how long; s before she will take hold again
  let onRock = false, climbT = 0, leapT = 0, leapCool = 0, climbRate = 0;      // climbing: her feet have left the ground; for how long; a leap; the clip's rate
  let climbW = 0, tilt = 0, nX = 0, nY = 1, nZ = 0, standOff = 0;      // how far she is laid against the rock (0..1), by what angle, the way out of the face, and how far the rock's bulges hold her off it (m)
  const lie = { angle: 0, off: 0 };
  let hurdleT = 0, hopT = 0, hopLift = 0, untucked = false;      // going over a low thing: how long she has walked at it; s into the hop; how high it has her; her legs are coming down
  const ahead = {}, crossing = {};              // the one before her (player-hurdle.js), and where the hop began and comes down
  const hop = {}, path = {};                    // the hop (planHop), and where she is in it (hopAt)
  let vaultT = 0;                             // s into a vault
  const vault0 = new THREE.Vector3(), vault1 = new THREE.Vector3();
  let wake = 0;                               // s to the next ring she leaves swimming
  let lean = 0, roll = 0, grade = 0, turned = 0;      // her body's tilt forward / back and into a turn; the slope along her way; how far she turned this frame
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
  const air = createMagicJump({ character, circles });
  const me = { pos, vel: new THREE.Vector3(), heading: 0 }, airStick = { x: 0, z: 1, amount: 0 };

  // ---- solid things: tree trunks, rocks, houses, the edge of the map (she slides along them, in the air too)
  function solids(p, k) {
    for (const [cx, cz, cr, lo, hi] of level.colliders) {
      if (lo !== undefined && (pos.y < lo || (hi !== undefined && pos.y > hi))) continue;      // (one only at some heights: a bridge's parapets are not there for her under it)
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
  // off the ground, into a flight (magic-jump.js): jump, the button's first jump; or not (off an edge, out of a hop), up
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
    mode = 'ground'; vy = 0;
    const hit = slid ? 0.25 : air.impact;
    if (depth > 0.06 && level.ripple) level.ripple(pos.x, pos.z, 1 + 0.4 * hit, 0.32, 'splash');
    landT = 0; landHold = LAND_HOLD + 0.1 * hit; speed *= 1 - 0.4 * hit;
    character.play('jump_land', 0.06, false);
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
  function grab() {
    mode = 'climb'; onRock = footing(pos.x, pos.z) === 'cliff'; climbT = 0; leapT = 0; climbRate = 0;
    air.end(); speed = 0; vy = 0; landT = -1; dashT = 0; sprint = false; grabT = 0; edgeT = 0; edgeGrace = 0;
    character.play('climb', 0.18);
  }
  function startVault(k) {
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
  function climbStep(dt, k, amount, pushing, want) {
    const CLIMB = CLIMB0 * k;
    climbT += dt; leapT = Math.max(0, leapT - dt); leapCool = Math.max(0, leapCool - dt);
    if (dashWanted > 0) { dashWanted = 0; grabShy = GRAB_SHY; vy = 0; startSlide(k); return; }      // the dash button lets go
    if (jumpWanted > 0 && leapCool === 0) { jumpWanted = 0; leapT = LEAP_T; leapCool = LEAP_COOL; }
    const at = face.at(pos.x, pos.z), ux = at.ux, uz = at.uz;
    // the stick, read against the rock: towards it is up, away from it down, across it along (whatever the camera's angle)
    let up = 0, side = 0;
    if (pushing) {
      const wx = Math.sin(want) * amount, wz = Math.cos(want) * amount;
      up = wx * ux + wz * uz; side = -wx * uz + wz * ux;
      if (Math.abs(up) > 0.2) up = Math.sign(up) * Math.min(1, Math.abs(up) * 1.6);      // (a stick that leans at the rock means up it)
      const l = Math.hypot(up, side); if (l > 1) { up /= l; side /= l; }
    }
    if (leapT > 0 && !pushing) up = 1;
    // her hands at the top: over it
    if (up > 0.3 && face.top(pos.x, pos.z, REACH0 * k, spot) >= 0) { startVault(k); return; }
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
  // ---- going over a low thing (player-hurdle.js found it: ahead): a hop along the arc planHop makes, her knees drawn up.
  // Where she comes down must be somewhere to be: ground no higher than its top, or a drop (water, ground far below, a
  // face) that she falls to once she is over
  function startHurdle(k) {
    const hh = (character.hipsHeight || 1) * (character.size || 1), dx = Math.sin(heading), dz = Math.cos(heading);
    let drop = false, ground = pos.y;
    for (let again = 0; ; again++) {
      if (!planHop(ahead, speed, k, hh, hop)) return false;
      const lx = pos.x + dx * hop.far, lz = pos.z + dz * hop.far, f = footing(lx, lz);
      ground = standAt(lx, lz);
      if (f === 'ground' && ground <= ahead.top - 0.1) { drop = ground < pos.y - 0.6 * k; break; }
      if (f === 'water' || (f === 'cliff' && ground < pos.y)) { drop = true; break; }
      if (again || ahead.room < 0.2) return false;
      ahead.room = 0.1;                                                       // (nowhere to be that far on: just past it, then)
    }
    Object.assign(crossing, { x: pos.x, y: pos.y, z: pos.z, dx, dz, land: drop ? pos.y : ground, drop, speed: Math.max(speed, WALK0 * k) });
    mode = 'hurdle'; hopT = 0; hopLift = 0; untucked = false; hurdleT = 0; landT = -1; dashT = 0; edgeT = 0; edgeGrace = 0; grabT = 0;
    character.play('hop', HOP_FADE, false); character.setRate(1);
    if (character.actions.hop) character.actions.hop.time = hop.start;
    return true;
  }
  function hurdleStep(dt, k, pushing) {
    hopT += dt;
    const p = hopAt(hop, hopT, path);
    pos.set(crossing.x + crossing.dx * p.along, crossing.y + (crossing.land - crossing.y) * smooth(p.u) + p.lift, crossing.z + crossing.dz * p.along);
    hopLift = p.lift; went = p.pace;
    // past it, her legs come down to land: the landing clip's first moment (her legs long, her toes down), held till she is down
    if (!untucked && hopT >= hop.untuck) { untucked = true; character.play('jump_land', HOP_UNTUCK, false); character.setRate(0); }
    // over a parapet with the river below: once she is past it and on her way down, she falls
    if (crossing.drop) {
      if (p.u >= Math.max(0.5, hop.over)) { speed = Math.min(p.pace, RUN0 * k); hopLift = 0; leave(p.up, k, false); airBase = crossing.y; }      // (airBase: the camera stays where it was)
      return;
    }
    if (hopT >= hop.wait + hop.time) {
      speed = Math.min(Math.max(crossing.speed, WALK0 * k), RUN0 * k);
      const on = (hopT - hop.wait - hop.time) * speed;                        // (what is left of this frame, she is on her way already)
      pos.x += crossing.dx * on; pos.z += crossing.dz * on;
      pos.y = standAt(pos.x, pos.z); peakY = pos.y; hopLift = 0;
      const depth = depthAt(pos.x, pos.z);
      if (!pushing) touchDown(k, depth, false);                               // the stick let go: the jump's own landing, played out
      else {
        // going on: straight into her stride, the landing clip running on gently under it as it fades (a light dip)
        mode = 'ground'; vy = 0; landT = -1; pace = paceWas = speed;
        if (depth > 0.06 && level.ripple) level.ripple(pos.x, pos.z, 1.0, 0.32, 'splash');
        character.setRate(HOP_LAND_RATE);
        character.play(speed < (WALK0 + RUN0) * 0.5 * k ? 'walk' : 'run', HOP_LAND, false);
      }
      lastSafe.copy(pos);
    }
  }
  function vaultStep(dt, k) {
    vaultT += dt;
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
      if (footing(tmp.x, tmp.z) === 'cliff' && pushing && grabShy <= 0 && pushedAt(want, tmp.x, tmp.z, 0.25)) { pos.x = tmp.x; pos.z = tmp.z; grab(); return; }      // out of the water, up a rock bank
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
      turned = wrap(want - heading) * Math.min(1, dt * 11);
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
    if (dashT > 0) { dashT -= dt; if (mode === 'ground') speed = Math.max(speed, DASH * (1 - 0.5 * drag)); }
    else speed += (target - speed) * Math.min(1, dt * (mode !== 'ground' ? 1.5 : target > speed ? 7 - 4 * drag : 10 + 5 * drag));
    if (mode === 'air') speed = Math.hypot(me.vel.x, me.vel.z);
    // ---- she moves
    grabPush = false; faceAhead = false;
    if (mode === 'slide') {
      // down a cliff's face: the way it falls, her feet on the rock, until there is ground or water under her. She gathers
      // speed downwards as in a fall held back by the rock. Pushing at the rock, she takes hold of it
      if (pushing && grabShy <= 0 && pushedAt(want, pos.x, pos.z)) { grab(); return; }
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
    // ---- a low thing in her way (a fence, a parapet, a barrel): going at it, she hops over it, from as far before it as
    // the hop at her pace wants (hopLead). Running, at once; walking, after a moment (not every brush of a fence's rail as
    // she walks by)
    if (footing && mode === 'ground' && pushing && shallow && Math.abs(wrap(want - heading)) < 0.5
        && findHurdle(level.colliders, pos.x, pos.z, pos.y, Math.sin(heading), Math.cos(heading), k, 0.5 * k + speed * 0.4, ahead)
        && ahead.from <= hopLead(ahead, speed, k, (character.hipsHeight || 1) * (character.size || 1)) + (speed > WALK * 1.5 ? 0 : speed * HURDLE_WAIT)) {
      hurdleT += dt;
      if ((hurdleT >= HURDLE_WAIT || speed > WALK * 1.5 || jumpWanted > 0) && startHurdle(k)) { jumpWanted = 0; return; }
    } else hurdleT = 0;
    // pushing at a face (or stopped by one, at whatever angle): after a moment she takes hold of it
    if (faceAhead && pushing && went < 0.35 * WALK) grabPush = true;
    grabT = grabPush && mode === 'ground' ? grabT + dt : 0;
    if (grabT >= GRAB_WAIT) { grab(); return; }
    // her legs go at the pace she really goes: along a cliff's edge or round a trunk she goes slower than she means to
    const paceNow = Math.min(speed, went * 1.1 + 0.05);
    pace = Math.min(paceNow, paceWas);                                        // (a pace held for one frame only does not change her gait)
    paceWas = paceNow;
    const ground = standAt(pos.x, pos.z), depth = depthAt(pos.x, pos.z), deep = footing && depth >= SWIM_IN0 * k;
    // ---- jumping: off the ground at once, unless she is deeper in the water than her knees; in the air, the next jump
    // of the flight (a press it cannot take yet is kept a moment, JUMP_BUFFER)
    if (mode === 'ground' && jumpWanted > 0 && shallow) {
      jumpWanted = 0;
      // (by a low thing she faces: over it)
      if (footing && findHurdle(level.colliders, pos.x, pos.z, pos.y, Math.sin(heading), Math.cos(heading), k, 0.8 * k, ahead) && startHurdle(k)) return;
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
        if (footing && footing(pos.x, pos.z) === 'cliff') { air.end(); if (pushing && grabShy <= 0 && pushedAt(want, pos.x, pos.z)) grab(); else startSlide(k); }
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
    } else if (mode === 'vault' || mode === 'hurdle') {
      /* (the vault's clip and rate were set as it began; the hop's are set as it goes) */
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
      const landing = character.actions.jump_land;
      if ((pace >= 0.25 && landT > landHold) || character.state !== 'jump_land' || (landing && landing.time >= landing.getClip().duration - 0.02)) landT = -1;
      else character.setRate(LAND_RATE);
    }
    if (mode === 'ground' && landT < 0) {
      if (character.state !== st) character.play(st, st === 'idle' ? 0.3 : character.state === 'jump_land' ? 0.28 : 0.2);      // (up out of a landing: a longer blend)
      character.setRate(st === 'idle' ? 1 : Math.min(1.9, Math.max(0.7, pace / (character.speeds[st] || 1))));      // (her legs at the pace she goes, as the walker's)
    }
    character.update(dt);
    // ---- her body leans: forward up a hill and back down one (walking it, not standing on it), forward in a dash and a
    // sprint, and into her turns. Climbing, she is laid against the rock: tilted to it about her feet, as far out of it as the clip's wall is
    const going = Math.min(1, pace / WALK), walking = mode === 'ground';
    const wantLean = !walking ? 0 : grade * (grade > 0 ? 0.2 : 0.14) * going + (dashT > 0 ? 0.2 : sprint && pace > RUN ? 0.06 : 0);
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
    character.object.position.set(nX * out, nY * out, nZ * out);
    character.object.rotation.set(lean + tilt * climbW, heading, roll, 'YXZ');
    air.pose(dt, me);                                              // her body in a flight (and easing out of one), over her clip
    if (character.holdSprings) character.holdSprings(1 + 4 * air.held, 1 - air.upside);      // her hair and skirt held harder in the air
    if (character.updateSprings) character.updateSprings(dt);      // hair and cloth follow where she now is
  }

  const player = {
    object: root, position: pos, blob: shadow, lookDir: cam.lookDir,
    get character() { return character; },
    get heading() { return heading; }, get camYaw() { return cam.yaw; }, get camPitch() { return cam.pitch; }, get camDist() { return cam.dist; }, get speed() { return speed; },
    get airborne() { return mode !== 'ground'; }, get mode() { return mode; }, get sprinting() { return sprint; },
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
      landT = -1;
      if (mode === 'vault') { pos.copy(vault1); mode = 'ground'; }
      character.play(mode === 'ground' ? 'idle' : mode === 'climb' ? 'climb' : mode === 'swim' ? 'swim_idle' : 'jump_air', 0);
      if (character.resetSprings) character.resetSprings();
    },
    // (y: about how high she stands, where that tells two grounds apart: on a bridge's deck, or on the bed under it. None: the top)
    teleport(x, z, yaw = heading, y) {
      pos.set(x, standOn(x, z, y), z); heading = yaw; cam.setView(yaw - Math.PI);
      air.end(); mode = 'ground'; vy = 0; speed = 0; landT = -1; dashT = 0; edgeT = 0; edgeGrace = 0; grabT = 0; climbW = 0; lastSafe.copy(pos);
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
      else if (mode === 'vault') vaultStep(dt, k);
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
      // up: four jumps go 4.4 m up; over a low thing, the ground and a little of the hop; swimming, a little under the
      // surface, so it looks at her head)
      const aimY = mode === 'air' ? pos.y - 0.3 * Math.max(0, pos.y - Math.max(airBase, standAt(pos.x, pos.z)))
        : mode === 'hurdle' ? pos.y - 0.6 * hopLift
        : mode === 'swim' ? pos.y - character.height * 0.82 + 0.55 * k : pos.y;
      cam.update(dt, { pos, aimY, height: character.height, k, steady: mode !== 'air' });
    },
  };
  return player;
}
