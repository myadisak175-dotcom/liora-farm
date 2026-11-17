// player-moves.js
// The player with the moves (a trial: index.html uses it with ?move=1, in place of player.js; the same createPlayer, the same
// player object, plus player.dash()). Her hands are read in player-input.js, the camera that goes with her is
// player-camera.js, her feet in the water are player-footsteps.js; this file is her body in the world.
//
//   const player = createPlayer({ character, level, camera, dom: renderer.domElement, ui: document.getElementById('stick'), onTap });
//   every frame: player.update(dt)          player.jump(), player.dash(): the buttons (Space, Shift on a keyboard)
//
// What she can do that player.js's walker cannot:
//   - leave a cliff's top. Walking square at an edge she hops off it (a tall one holds her at the brink for a moment first, so
//     she is not thrown off a height by brushing its edge; a jump or a dash goes at once), falls, and lands on the ground at
//     its foot. Where she comes down on the cliff's face she slides down it to the ground. She only leaves where there is
//     ground to land on: an edge over deep water or over the map's end is a wall, as before. (No way back up yet: cliffs
//     are still walls from below. Climbing is the next stage.) A long fall ends in a forward roll (the library's Roll) that
//     carries her on, the way the stick points or the way she was going.
//   - dash: a burst of speed the way the joystick points (the way she faces if it is let go), then a sprint for as long as
//     she keeps running. No stamina yet.
//   - go at the land's pace: slower up a slope and a little faster down it, leaning into the hill, into her turns and into
//     a dash. Her feet stay on a slope she walks (they used to trail the ground, floating down a hill and sinking up one),
//     and her legs go at the pace she really goes.
//   - run faster: the run clip is the library's sprint, and its stride suits a faster pace than the walker ran at.
//
// It needs the level to say what the ground is like: level.footing(x, z) -> 'ground' | 'cliff' | 'water' | 'out' (the hill
// village). On a map that cannot say, cliffs stay walls (level.confine, as in player.js); the rest works the same.
//
// Her height (character.height, against Vivi's 1.412 m as modelled, the height every number here is given at) scales what
// goes with her body, whoever is playing, as in player.js.

import * as THREE from 'three';
import { createPlayerInput } from './player-input.js';
import { createFollowCamera } from './player-camera.js';
import { createFootsteps } from './player-footsteps.js';

const TUNED_HEIGHT = 1.412;                   // Vivi as modelled: the numbers below are for her at this height (x 1.24 at 1.75 m)
const WALK0 = 1.2, RUN0 = 4.0, SPRINT0 = 5.6, DASH0 = 9.0;      // m/s (at 1.75 m: 1.5, 5.0, 6.9, 11.2; the walker ran at 4.1)
const DEEP0 = 0.5;                            // water she will not wade into (m)
const JUMP0 = 0.6, GRAV0 = 20, FALL0 = 26;    // a jump's apex (m), gravity (m/s²), the fastest she falls (m/s)
const JUMP_BUFFER = 0.15;                     // a press just before she lands (or can dash) still counts
const START_RATE = 1.8, START_AT = 0.06;      // jump_start squeezed into the short flight
const LAND_RATE = 1.4, LAND_HOLD = 0.14;      // landing standing still plays out; moving, she is off again after LAND_HOLD s
const HOP0 = 2.2, HOP_OUT0 = 2.4;             // off an edge: a small hop up (m/s) and at least this pace outwards, to clear the lip
const TALL0 = 2.4, EDGE_WAIT = 0.3;           // a drop taller than this (m) holds her at the brink this long (s) before she goes
const FAR0 = 16;                              // a drop taller than this (m; 20 m at 1.75 m) she does not take at all: its edge is a wall (the abyss's shaft)
const STEP0 = 0.45;                           // the ground falling away under her by more than this (m): she falls, not steps
const HARD0 = 2.2, HARD_HOLD = 0.38;          // a fall longer than this (m) is a hard landing: she rolls (without a roll clip, or deep in water: she stops this long, s)
const ROLL_RATE = 1.5, ROLL_FROM = 0.25;      // the roll clip (1.47 s) played this much faster, from this far in (s: past its crouch, already diving)
const ROLL_FAST0 = 3.6, ROLL_SLOW0 = 1.6;     // her pace over the ground through the roll (m/s): from this (or faster, if she came down faster) to this
const SLIDE0 = 5, SLIDE_FALL0 = 11;           // down a cliff's face: no faster than this over the ground, nor than this downwards (m/s)
const DASH_T = 0.2, DASH_COOL = 0.8;          // the burst (s), and how soon she can dash again (s)
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

export function createPlayer({ character: firstCharacter, level, camera, dom, ui = null, onTap = null }) {
  let character = firstCharacter;             // who is playing: player.setCharacter swaps her for another
  const standAt = level.standAt || level.heightAt;   // where her feet are: the land, or (on maps that know them) the tops of rocks, the decks of bridges
  const footing = level.footing || null;      // what the ground is like (see above); null: this map cannot say
  const pos = new THREE.Vector3(level.spawn.x, 0, level.spawn.z);
  pos.y = standAt(pos.x, pos.z);
  let heading = level.spawn.yaw;              // where she faces (0 = +Z)
  let mode = 'ground';                        // 'ground' | 'air' (a jump, a hop, a fall) | 'slide' (down a cliff's face)
  let speed = 0, went = 0, paceWas = 0;       // how fast she means to go, how fast she really went (last frame), and the pace before
  let vy = 0, peakY = pos.y, slideV = 0, slideT = 0, stuckT = 0;
  let landT = -1, landHold = LAND_HOLD, hardT = 0, jumpWanted = 0;
  let rollT = 0, rollLen = 1, rollV = 0;      // s left of a landing roll, how long it is, the pace she rolls out at
  let dashWanted = 0, dashT = 0, dashCool = 0, sprint = false, easedOff = 0;
  let edgeT = 0, edgeGrace = 0;               // how long she has pushed at a tall cliff's brink
  let shy = 0;                                // s after a slide that got her nowhere: edges are walls for a moment (not straight off the same one again)
  let lean = 0, roll = 0;                     // her body's tilt: forward / back, and into a turn
  let wade = 0, stepSide = 1, wasDepth = 0, wetH = 0, wetAmt = 0;      // (water: as in player.js)
  const lastSafe = pos.clone();               // the last ground she stood on: where she is put back if a slide gets her nowhere
  const tmp = new THREE.Vector3(), stickV = new THREE.Vector2();

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

  // ---- solid things: tree trunks, rocks, houses, the edge of the map (she slides along them, in the air too)
  function solids(p, k) {
    for (const [cx, cz, cr] of level.colliders) {
      const dx = p.x - cx, dz = p.z - cz, r = cr + 0.28 * k, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
    }
    const rr = Math.hypot(p.x, p.z);
    if (rr > level.radius) { p.x *= level.radius / rr; p.z *= level.radius / rr; }
  }

  // ---- a cliff's edge
  // Down a face from (x, z), the way a slide goes (the way the rock falls): the height of the ground it comes out on. NaN:
  // it runs into deep water or off the map, or does not come out within 30 m
  function slideEnd(x, z) {
    const e = 0.3;
    for (let i = 0; i < 120; i++) {
      const f = footing(x, z);
      if (f === 'ground') return standAt(x, z);
      if (f !== 'cliff') return NaN;
      const gx = standAt(x + e, z) - standAt(x - e, z), gz = standAt(x, z + e) - standAt(x, z - e), gl = Math.hypot(gx, gz);
      if (gl < 1e-5) return NaN;
      x -= gx / gl * 0.25; z -= gz / gl * 0.25;
    }
    return NaN;
  }
  // From ground by a cliff (x, z), along her way (dx, dz) across its face: how far below her the ground she would land on
  // lies (m; negative: the ground beyond is higher, the cliff is a wall from here). NaN: no ground to land on (deep water,
  // the map's end, or a face more than 18 m across). Two ways down are looked along, and both must end on ground: straight
  // on, as she flies (the first steps short: where a brook goes over an edge, the deep water at the fall's lip is a strip a
  // hand wide), and down the face from where she would first touch it, as she slides (a face beside a brook leans to it)
  function beyond(x, z, dx, dz, first) {
    for (let t = first; t <= 18; t += t < 2 ? 0.1 : 0.25) {
      const qx = x + dx * t, qz = z + dz * t, f = footing(qx, qz);
      if (f === 'cliff') continue;
      if (f !== 'ground') return NaN;
      const y0 = standAt(x, z), drop = y0 - standAt(qx, qz);
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
  // In the air: may she be over (x, z)? Over ground, yes. Over a cliff's face, if she is above it (not into a wall from
  // below), and, leaving the ground for it, only where there is ground beyond it to come down on. Not over deep water,
  // nor off the map
  function mayFly(x, z, k) {
    const f = footing(x, z);
    if (f === 'ground') return true;
    if (f !== 'cliff' || pos.y < standAt(x, z)) return false;
    if (footing(pos.x, pos.z) !== 'ground') return true;                      // (already out over the face)
    const dx = x - pos.x, dz = z - pos.z, len = Math.hypot(dx, dz);
    return len > 1e-6 && shy <= 0 && beyond(pos.x, pos.z, dx / len, dz / len, len) <= FAR0 * k;      // (NaN, no ground beyond: no)
  }
  // The land's say on a step from where she is to p (x, z): p is left, moved, or put back
  function land(p, k) {
    if (!footing) { if (level.confine) level.confine(p, pos); return; }      // a map that cannot say what its ground is like: walls, as ever
    if (mode === 'ground') {
      const f = footing(p.x, p.z);
      if (f === 'ground') return;
      if (f === 'cliff') {                                                    // a cliff's top edge, if the ground beyond is lower
        const dx = p.x - pos.x, dz = p.z - pos.z, len = Math.hypot(dx, dz);
        if (len > 1e-6) {
          const drop = beyond(pos.x, pos.z, dx / len, dz / len, len);
          if (drop > 0.15 && drop <= FAR0 * k && shy <= 0 && squareOn(dx / len, dz / len)) {
            if (drop <= TALL0 * k || dashT > 0 || edgeT >= EDGE_WAIT) { leave(HOP0 * k, k, true); speed = Math.max(speed, HOP_OUT0 * k); return; }
            edgeGrace = 0.15;                                                 // a tall one: she is held at the brink first
          }
        }
      }
      level.confine(p, pos);                                                  // a wall, deep water, the map's end: along it or stopped, as ever
      return;
    }
    if (mayFly(p.x, p.z, k)) return;
    if (mayFly(p.x, pos.z, k)) p.z = pos.z; else if (mayFly(pos.x, p.z, k)) p.x = pos.x; else { p.x = pos.x; p.z = pos.z; }      // along what stops her, or straight down
  }
  // off the ground: up (m/s; 0: the ground fell away), with the jump's take-off or straight into the fall
  function leave(up, k, takeOff) {
    mode = 'air'; vy = up; peakY = pos.y; landT = -1; hardT = 0; rollT = 0; edgeT = 0; edgeGrace = 0;
    speed = Math.min(speed, SPRINT0 * k * 1.15);                              // (a dash off an edge is a long leap, not a flight)
    if (takeOff) {
      character.play('jump_start', 0.08, false);
      if (character.actions.jump_start) character.actions.jump_start.time = START_AT;
    } else character.play('jump_air', 0.18, false);
  }
  function touchDown(k, depth, slid, want = null) {
    const hard = !slid && peakY - pos.y > HARD0 * k;
    mode = 'ground'; vy = 0;
    if (depth > 0.06 && level.ripple) level.ripple(pos.x, pos.z, hard ? 1.4 : 1.0, 0.32, 'splash');
    if (hard && character.actions.roll && depth < 0.32 * k) {                // a long fall: she rolls out of it, on along the stick (or the way she was going)
      if (want !== null) heading = want;
      rollLen = (character.actions.roll.getClip().duration - ROLL_FROM) / ROLL_RATE; rollT = rollLen; rollV = Math.max(ROLL_FAST0 * k, speed);
      landT = -1; hardT = 0;
      character.play('roll', 0.06, false); character.actions.roll.time = ROLL_FROM; character.setRate(ROLL_RATE);
      return;
    }
    landT = 0; landHold = hard ? HARD_HOLD : LAND_HOLD; hardT = hard ? HARD_HOLD : 0;
    if (hard) speed *= 0.2;
    character.play('jump_land', 0.06, false);
  }
  function startSlide(k) {
    mode = 'slide'; slideT = 0; stuckT = 0; slideV = Math.min(Math.max(2 * k, -vy), SLIDE_FALL0 * k); vy = 0;      // (as fast down as she came onto it)
    if (character.state !== 'jump_air' && character.state !== 'jump_start') character.play('jump_air', 0.18, false);
  }
  // a slide that got her nowhere (a face that ends in deep water): back onto the nearest ground, or where she last stood.
  // home: straight back to where she last stood (a fall that went on past any drop she takes: down the abyss's shaft)
  function rescue(home = false) {
    tmp.set(pos.x, 0, pos.z);
    if (!home && level.confine) level.confine(tmp);
    if (home || footing(tmp.x, tmp.z) !== 'ground') tmp.copy(lastSafe);
    pos.set(tmp.x, standAt(tmp.x, tmp.z), tmp.z);
    mode = 'ground'; vy = 0; speed = 0; landT = -1; hardT = 0; rollT = 0; shy = 2;
    character.play('idle', 0.2);
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
      character = next;
      root.add(character.object);
      steps.find(character);
      landT = -1;
      character.play(mode === 'ground' ? 'idle' : 'jump_air', 0);
      if (character.resetSprings) character.resetSprings();
    },
    teleport(x, z, yaw = heading) {
      pos.set(x, standAt(x, z), z); heading = yaw; cam.setView(yaw - Math.PI);
      mode = 'ground'; vy = 0; landT = -1; hardT = 0; rollT = 0; dashT = 0; edgeT = 0; edgeGrace = 0; lastSafe.copy(pos);
      if (character.resetSprings) character.resetSprings();
    },
    setView(yaw, pitch, dist) { cam.setView(yaw, pitch, dist); },
    update(dt) {
      dt = Math.min(dt, 0.05);
      const k = (character.height || TUNED_HEIGHT) / TUNED_HEIGHT;
      const WALK = WALK0 * k, RUN = RUN0 * k, SPRINT = SPRINT0 * k, DASH = DASH0 * k, DEEP = DEEP0 * k, grav = GRAV0 * k;
      shadow.scale.setScalar(k);
      // ---- her hands -> the way she wants to go, relative to the camera ("forward" on the stick goes away from it)
      const amount = input.stick(stickV), pushing = amount > 0.12, running = amount > 0.72;
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = -fz, rz = fx;      // away from the camera; to its right
      const want = pushing ? Math.atan2(rx * stickV.x - fx * stickV.y, rz * stickV.x - fz * stickV.y) : heading;
      const depthHere = level.waterDepthAt(pos.x, pos.z), shallow = depthHere < 0.32 * k;      // (deeper than her knees: no jump, no dash)
      jumpWanted = Math.max(0, jumpWanted - dt); dashWanted = Math.max(0, dashWanted - dt); dashCool = Math.max(0, dashCool - dt); shy = Math.max(0, shy - dt);
      // ---- dash: a burst the way the stick points, then a sprint while she keeps running
      if (dashWanted > 0 && dashCool === 0 && mode === 'ground' && rollT <= 0 && shallow) {
        dashWanted = 0; dashT = DASH_T; dashCool = DASH_COOL; sprint = true; landT = -1; hardT = 0;
        if (pushing) heading = want;
      }
      easedOff = running ? 0 : easedOff + dt;
      if (sprint && dashT <= 0 && (easedOff > 0.25 || !shallow)) sprint = false;
      if (edgeGrace > 0 && pushing) { edgeGrace -= dt; edgeT += dt; } else { edgeGrace = 0; edgeT = 0; }
      // ---- how fast, and which way she turns
      let target = 0, turned = 0;
      if (pushing) {
        target = running ? (sprint ? SPRINT : RUN) : WALK * Math.max(0.6, amount / 0.72);
        turned = wrap(want - heading) * Math.min(1, dt * (mode !== 'ground' || rollT > 0 ? 4 : 11));      // in the air (and rolling) she can only lean into a turn
        if (mode !== 'slide') heading += turned;                              // (sliding, she goes where the rock sends her)
      }
      // the slope under her, along her way (the rise in a metre): up it she slows, down it she goes a little faster
      let grade = 0;
      if (mode === 'ground') {
        const sx = Math.sin(heading) * 0.5, sz = Math.cos(heading) * 0.5;
        grade = Math.min(1, Math.max(-1, standAt(pos.x + sx, pos.z + sz) - standAt(pos.x - sx, pos.z - sz)));
        target *= grade > 0 ? 1 - 0.3 * Math.min(1, grade / 0.6) : 1 + 0.1 * Math.min(1, -grade / 0.5);
      }
      // wading slows her down, the more the deeper it is (ankle-deep hardly at all, knee-deep she cannot run); deep water stops her
      const heavy = Math.min(1, Math.max(0, (depthHere - 0.1 * k) / (0.4 * k))), drag = heavy * heavy * (3 - 2 * heavy);
      target *= 1 - 0.52 * drag;
      if (hardT > 0) { hardT -= dt; target = 0; }                             // a hard landing: a moment to gather herself
      if (rollT > 0) {                                                        // rolling: on at the roll's own pace, easing to her own as she comes up out of it
        rollT -= dt;
        const p = 1 - Math.max(0, rollT) / rollLen;
        target = rollV + (Math.max(ROLL_SLOW0 * k, pushing ? Math.min(target, RUN) : 0) - rollV) * p * p;
      }
      // running into the water: one splash where she breaks the surface
      if (mode === 'ground' && depthHere > 0.06 && wasDepth <= 0.06 && speed > 2.2 * k && level.ripple) level.ripple(pos.x + Math.sin(heading) * 0.25, pos.z + Math.cos(heading) * 0.25, 0.9, 0.3, 'splash');
      wasDepth = depthHere;
      // what has been in the water is wet (a run splashes her higher), and dries in a quarter of a minute once she is out
      if (depthHere > 0.03) { wetH = Math.max(wetH, depthHere + 0.05 + 0.12 * Math.min(1, speed / RUN)); wetAmt = 1; }
      else { wetAmt = Math.max(0, wetAmt - dt / 15); if (wetAmt === 0) wetH = 0; }
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
      // the burst holds her at the dash's pace; otherwise water is slow to get going in and quick to stop her, and in the air
      // she keeps the speed she left the ground with
      if (dashT > 0) { dashT -= dt; if (mode === 'ground') speed = Math.max(speed, DASH * (1 - 0.5 * drag)); }
      else if (rollT > 0 && mode === 'ground') speed = target;
      else speed += (target - speed) * Math.min(1, dt * (mode !== 'ground' ? 1.5 : target > speed ? 7 - 4 * drag : 10 + 5 * drag));
      // ---- she moves
      if (mode === 'slide') {
        // down a cliff's face: the way it falls, her feet on the rock, until there is ground under her. She gathers speed
        // downwards as in a fall held back by the rock, so a sheer face takes her as long as a fall would and a gentler one
        // carries her out over the ground
        const e = 0.3, gx = (standAt(pos.x + e, pos.z) - standAt(pos.x - e, pos.z)) / (2 * e), gz = (standAt(pos.x, pos.z + e) - standAt(pos.x, pos.z - e)) / (2 * e), gl = Math.hypot(gx, gz);
        let moved = 0, pace = 0;
        slideT += dt;
        if (gl > 1e-4) {
          const dx = -gx / gl, dz = -gz / gl;
          slideV = Math.min(slideV + 0.7 * grav * dt, SLIDE_FALL0 * k);       // (downwards)
          pace = Math.min(SLIDE0 * k, slideV / Math.max(gl, 0.3));            // (over the ground: the steeper, the less)
          tmp.set(pos.x + dx * pace * dt, 0, pos.z + dz * pace * dt);
          solids(tmp, k);
          const f = footing(tmp.x, tmp.z);
          if (f === 'water' || f === 'out') tmp.set(pos.x, 0, pos.z);         // (nowhere to go on that way)
          moved = Math.hypot(tmp.x - pos.x, tmp.z - pos.z);
          pos.x = tmp.x; pos.z = tmp.z;
          const d = wrap(Math.atan2(dx, dz) - heading);
          if (Math.abs(d) < 1.75) heading += d * Math.min(1, dt * 6);          // she faces the way she slides, unless that is behind her (slipping back down a face she jumped at)
        }
        went = moved / dt; speed = Math.min(went, RUN);
        stuckT = moved < pace * dt * 0.2 ? stuckT + dt : 0;
      } else if (speed > 0.02) {
        tmp.set(pos.x + Math.sin(heading) * speed * dt, 0, pos.z + Math.cos(heading) * speed * dt);
        if (level.waterDepthAt(tmp.x, tmp.z) > DEEP && level.waterDepthAt(tmp.x, tmp.z) > depthHere) {
          // too deep ahead: try sliding along the shore instead of walking in
          const ax = pos.x + Math.sin(heading + 1.1) * speed * dt, az = pos.z + Math.cos(heading + 1.1) * speed * dt;
          const bx = pos.x + Math.sin(heading - 1.1) * speed * dt, bz = pos.z + Math.cos(heading - 1.1) * speed * dt;
          const da = level.waterDepthAt(ax, az), db = level.waterDepthAt(bx, bz);
          if (Math.min(da, db) > DEEP) tmp.set(pos.x, 0, pos.z); else if (da < db) tmp.set(ax, 0, az); else tmp.set(bx, 0, bz);
        }
        solids(tmp, k);
        land(tmp, k);
        went = Math.hypot(tmp.x - pos.x, tmp.z - pos.z) / dt;
        pos.x = tmp.x; pos.z = tmp.z;
        if (went < speed * 0.3) speed = Math.min(speed, went * 1.15 + 0.05);      // pushing against something: stop walking on the spot
      } else went = 0;
      // her legs go at the pace she really goes: along a cliff's edge or round a trunk she goes slower than she means to
      const paceNow = Math.min(speed, went * 1.1 + 0.05), pace = Math.min(paceNow, paceWas);      // (a pace held for one frame only does not change her gait)
      paceWas = paceNow;
      const ground = standAt(pos.x, pos.z);
      // ---- jumping: off the ground at once, unless she is deeper in the water than her knees
      if (mode === 'ground' && jumpWanted > 0 && rollT <= 0 && shallow) {
        jumpWanted = 0;
        leave(Math.sqrt(2 * GRAV0 * JUMP0) * k, k, true);
        if (depthHere > 0.04 && level.ripple) level.ripple(pos.x, pos.z, 0.8, 0.3, 'splash');      // pushing off from the water
      }
      // ---- her height: on the ground, in the air, down a face
      if (mode === 'air') {
        pos.y += vy * dt - 0.5 * grav * dt * dt;           // exact for a steady pull: the same arc at any frame rate
        vy = Math.max(vy - grav * dt, -FALL0 * k);
        if (pos.y > peakY) peakY = pos.y;
        if (pos.y <= ground) {
          // on a cliff's face (coming down on it, or jumping up at it: a jump gets her no higher up a face than it lifts her):
          // she slides on down. (Rising past ground she may stand on, a rock's top: carried up with it)
          pos.y = ground;
          if (footing && footing(pos.x, pos.z) === 'cliff') startSlide(k); else if (vy <= 0) touchDown(k, depthHere, false, pushing ? want : null);
        } else if (footing && peakY - pos.y > (FAR0 + 6) * k) rescue(true);    // (it does not happen: the edges of such drops are walls)
      } else if (mode === 'slide') {
        pos.y = ground;
        if (footing(pos.x, pos.z) === 'ground') touchDown(k, depthHere, true);
        else if (peakY - pos.y > (FAR0 + 6) * k) rescue(true);                  // a face that ran on into a far deeper one: not down there
        else if (stuckT > 0.35 || slideT > 8) rescue();
      } else {
        const dy = ground - pos.y;
        if (footing && footing(pos.x, pos.z) === 'cliff') startSlide(k);           // put on a face (it does not happen walking): down she goes
        else if (dy < -(STEP0 * k + went * dt * 1.2)) leave(0, k, false);           // the ground fell away under her (a rock's top, a deck's end)
        else if (Math.abs(dy) <= went * dt * 1.5 + 0.004) pos.y = ground;           // the slope she walks on: her feet on it
        else pos.y += dy * Math.min(1, dt * 18);                                  // a step up or down: taken smoothly
      }
      if (mode === 'ground') lastSafe.copy(pos);
      const lift = Math.max(0, pos.y - standAt(pos.x, pos.z));      // how high above the ground she is (only in the air)
      // ---- animation follows the real speed, so feet do not slide
      const st = pace < 0.25 ? 'idle' : pace < (WALK + RUN) * 0.5 ? 'walk' : 'run';
      if (mode !== 'ground') {
        const rise = character.actions.jump_start;
        if (character.state === 'jump_start' && rise && rise.time >= rise.getClip().duration - 0.02) character.play('jump_air', 0.2, false);
        character.setRate(character.state === 'jump_start' ? START_RATE : 1);
      } else if (rollT > 0 && character.state === 'roll') {
        character.setRate(ROLL_RATE);                                         // (the roll plays out: no walk or run till she is up)
      } else if (landT >= 0) {
        landT += dt;
        const landing = character.actions.jump_land;
        if ((pace >= 0.25 && landT > landHold) || character.state !== 'jump_land' || (landing && landing.time >= landing.getClip().duration - 0.02)) landT = -1;
        else character.setRate(LAND_RATE);
      }
      if (mode === 'ground' && landT < 0 && !(rollT > 0 && character.state === 'roll')) {
        if (character.state !== st) character.play(st, st === 'idle' ? 0.3 : 0.2);
        // the walk at its own stride; the run clip (the library's sprint) at its own rhythm at a full run, quicker at a sprint
        character.setRate(st === 'idle' ? 1 : st === 'walk' ? Math.min(1.9, Math.max(0.7, pace / (character.speeds.walk || 1))) : Math.min(1.45, Math.max(0.7, pace / RUN)));
      }
      character.update(dt);
      // ---- her body leans: forward up a hill and back down one (walking it, not standing on it), forward in a dash and a
      // sprint, and into her turns
      const going = Math.min(1, pace / WALK);
      const wantLean = mode !== 'ground' || rollT > 0 ? 0 : grade * (grade > 0 ? 0.2 : 0.14) * going + (dashT > 0 ? 0.2 : sprint && pace > RUN ? 0.06 : 0);
      const wantRoll = mode !== 'ground' || rollT > 0 || dt <= 0 ? 0 : Math.min(0.14, Math.max(-0.14, -turned / dt * 0.03 * Math.min(1, pace / RUN)));
      lean += (wantLean - lean) * ease(8, dt); roll += (wantRoll - roll) * ease(6, dt);
      root.position.copy(pos);
      character.object.rotation.set(lean, heading, roll, 'YXZ');
      if (character.updateSprings) character.updateSprings(dt);      // hair and cloth follow where she now is
      // the blob stays on the ground under her, smaller the higher she is
      shadow.position.y = 0.06 - lift;
      shadow.scale.setScalar(k * (1 - 0.35 * Math.min(1, lift / (1.2 * k))));
      // tell her materials where the water's surface is (far below when she is on land) and how high she is wet
      if (character.water) {
        character.water.level.value = depthHere > 0.02 ? level.heightAt(pos.x, pos.z) + depthHere : -1e5;
        character.water.wet.value.set(pos.y + wetH, wetAmt);
      }
      steps.update(dt, { root, pos, speed, walk: WALK, run: RUN, still: mode !== 'ground' || landT >= 0 || rollT > 0 });
      cam.update(dt, { pos, height: character.height, k, heading, speed: went, run: RUN, sprint: sprint && pace > RUN, mode, looking: input.looking });
    },
  };
  return player;
}
