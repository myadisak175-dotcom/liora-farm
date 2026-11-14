// player.js
// Third-person walking for touch screens (landscape first) and keyboard + mouse.
//
//   left side of the screen  : floating joystick (push far = run)        keyboard: WASD / arrows, Shift = walk
//   right side of the screen : drag to look around                       mouse: drag
//
//   const player = createPlayer({ character, level, camera, dom: renderer.domElement, ui: document.getElementById('stick') });
//   every frame: player.update(dt)

import * as THREE from 'three';

// Clip the shoulder-to-camera segment against padded, finite trunk cylinders.
// Used again after camera smoothing, whose chord can otherwise enter a trunk.
export function cameraTrunkFraction(from, to, trunks, padding = 0.3) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const a = dx * dx + dz * dz;
  let fraction = 1;
  for (const [cx, cz, radius, bottom, top] of trunks || []) {
    const ox = from.x - cx, oz = from.z - cz, r = radius + padding;
    const b = ox * dx + oz * dz, c = ox * ox + oz * oz - r * r;
    let enter = 0, exit = fraction;
    if (a < 1e-10) { if (c > 0) continue; }
    else {
      const disc = b * b - a * c;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      enter = Math.max(enter, (-b - root) / a);
      exit = Math.min(exit, (-b + root) / a);
    }
    if (Math.abs(dy) < 1e-10) { if (from.y < bottom - padding || from.y > top + padding) continue; }
    else {
      const lo = (bottom - padding - from.y) / dy, hi = (top + padding - from.y) / dy;
      enter = Math.max(enter, Math.min(lo, hi));
      exit = Math.min(exit, Math.max(lo, hi));
    }
    if (enter <= exit && exit >= 0 && enter <= fraction) fraction = Math.max(0, enter - 0.001);
  }
  return fraction;
}

export function createPlayer({ character, level, camera, dom, ui = null, onTap = null }) {
  const pos = new THREE.Vector3(level.spawn.x, 0, level.spawn.z);
  const standAt = level.standAt || level.heightAt;   // where her feet are: the land, or (on maps that know them) the tops of rocks she can stand on
  pos.y = standAt(pos.x, pos.z);
  let heading = level.spawn.yaw;              // where the character faces (0 = +Z)
  let camYaw = level.spawn.yaw - Math.PI, camPitch = 0.17, camDist = 4.3;   // the camera starts behind her
  let speed = 0;
  const move = new THREE.Vector2();           // joystick / keys, -1..1
  const keys = new Set();

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

  // ---- touch: one finger on each half of the screen
  let stickId = null, lookId = null;
  const stick0 = new THREE.Vector2(), look0 = new THREE.Vector2(), tap0 = new THREE.Vector2();
  let tapT = 0;
  const STICK_R = 56;
  const base = ui, knob = ui ? ui.firstElementChild : null;
  const showStick = (on, x = 0, y = 0) => { if (base) { base.style.opacity = on ? 1 : 0; if (on) { base.style.left = x + 'px'; base.style.top = y + 'px'; } } };
  const setKnob = (dx, dy) => { if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`; };
  dom.addEventListener('pointerdown', e => {
    dom.setPointerCapture(e.pointerId);
    const touch = e.pointerType !== 'mouse';
    if (touch && e.clientX < innerWidth * 0.45 && stickId === null) {
      stickId = e.pointerId; stick0.set(e.clientX, e.clientY); showStick(true, e.clientX, e.clientY); setKnob(0, 0);
    } else if (lookId === null) { lookId = e.pointerId; look0.set(e.clientX, e.clientY); tap0.set(e.clientX, e.clientY); tapT = performance.now(); }
  });
  dom.addEventListener('pointermove', e => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - stick0.x, dy = e.clientY - stick0.y;
      const l = Math.hypot(dx, dy);
      if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
      setKnob(dx, dy);
      move.set(dx / STICK_R, dy / STICK_R);
    } else if (e.pointerId === lookId) {
      const k = 0.0052 * Math.min(1.6, 900 / Math.max(innerWidth, innerHeight) + 0.55);
      camYaw -= (e.clientX - look0.x) * k;
      camPitch = Math.min(1.05, Math.max(-0.22, camPitch + (e.clientY - look0.y) * k * 0.8));
      look0.set(e.clientX, e.clientY);
    }
  });
  const up = e => {
    if (e.pointerId === stickId) { stickId = null; move.set(0, 0); showStick(false); }
    if (e.pointerId === lookId) {
      lookId = null;
      // a quick touch that did not drag is a tap on the world
      if (onTap && e.type === 'pointerup' && performance.now() - tapT < 320 && Math.hypot(e.clientX - tap0.x, e.clientY - tap0.y) < 10) onTap(e.clientX, e.clientY);
    }
  };
  dom.addEventListener('pointerup', up);
  dom.addEventListener('pointercancel', up);
  dom.addEventListener('wheel', e => { camDist = Math.min(9, Math.max(2.6, camDist + e.deltaY * 0.004)); }, { passive: true });
  addEventListener('keydown', e => keys.add(e.code));
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  const tmp = new THREE.Vector3(), look = new THREE.Vector3(), camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
  let camReady = false, camReach = camDist, wade = 0, stepSide = 1;
  let wasDepth = 0, wetH = 0, wetAmt = 0;      // the water she stood in a frame ago; how high up she is wet (m above her feet) and how wet still
  const WALK = 1.45, RUN = 3.3, DEEP = 0.5;      // DEEP: water she will not wade into
  // her two feet, followed bone by bone, so the water is touched exactly when and where a foot comes down
  const feet = [];
  character.object.traverse(o => { if (o.isBone && /_(L|R)_Foot$/.test(o.name)) feet.push({ bone: o, lo: 0, hi: 0, up: false, seen: false, since: 1 }); });
  const footPos = new THREE.Vector3();

  // slide along anything solid: tree trunks, rocks, deep water, the edge of the map
  function collide(p) {
    for (const [cx, cz, cr] of level.colliders) {
      const dx = p.x - cx, dz = p.z - cz, r = cr + 0.28, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
    }
    const rr = Math.hypot(p.x, p.z);
    if (rr > level.radius) { p.x *= level.radius / rr; p.z *= level.radius / rr; }
    if (level.confine) level.confine(p);            // maps with walls of their own (cliffs) say where a walker may be
  }

  const player = {
    object: root, position: pos, character, blob: shadow,
    get heading() { return heading; }, get camYaw() { return camYaw; }, get speed() { return speed; },
    lookDir: new THREE.Vector3(0, 0, -1),
    teleport(x, z, yaw = heading) { pos.set(x, standAt(x, z), z); heading = yaw; camYaw = yaw - Math.PI; camReady = false; },
    setView(yaw, pitch, dist) { camYaw = yaw; if (pitch !== undefined) camPitch = pitch; if (dist !== undefined) camDist = dist; camReady = false; },
    update(dt) {
      dt = Math.min(dt, 0.05);
      // ---- input -> wish direction in the world, relative to the camera
      let mx = move.x, mz = move.y;
      if (stickId === null) {
        mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
        mz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
        const l = Math.hypot(mx, mz);
        if (l > 0) { const k = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 0.5 : 1) / l; mx *= k; mz *= k; }
      }
      const amount = Math.min(1, Math.hypot(mx, mz));
      // the camera sits behind the character at camYaw: "forward" on the stick goes away from the camera
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);          // away from the camera
      const rx = -fz, rz = fx;                                        // to the camera's right
      const wx = rx * mx - fx * mz, wz = rz * mx - fz * mz;
      let target = 0;
      if (amount > 0.12) {
        target = amount > 0.72 ? RUN : WALK * Math.max(0.6, amount / 0.72);
        const want = Math.atan2(wx, wz);
        let d = want - heading; d = Math.atan2(Math.sin(d), Math.cos(d));
        heading += d * Math.min(1, dt * 11);
      }
      // wading slows you down, the more the deeper it is (ankle-deep hardly at all, knee-deep she cannot run); deep water stops you
      const depthHere = level.waterDepthAt(pos.x, pos.z);
      const heavy = Math.min(1, Math.max(0, (depthHere - 0.1) / 0.4)), drag = heavy * heavy * (3 - 2 * heavy);
      target *= 1 - 0.52 * drag;
      // running into the water: one splash where she breaks the surface
      if (depthHere > 0.06 && wasDepth <= 0.06 && speed > 2.2 && level.ripple) level.ripple(pos.x + Math.sin(heading) * 0.25, pos.z + Math.cos(heading) * 0.25, 0.9, 0.3, 'splash');
      wasDepth = depthHere;
      // what has been in the water is wet (a run splashes her higher), and dries in a quarter of a minute once she is out
      if (depthHere > 0.03) { wetH = Math.max(wetH, depthHere + 0.05 + 0.12 * Math.min(1, speed / RUN)); wetAmt = 1; }
      else { wetAmt = Math.max(0, wetAmt - dt / 15); if (wetAmt === 0) wetH = 0; }
      // standing in water: a slow ring now and then. Walking is handled further down, where each foot's own landing makes the ring
      if (depthHere > 0.04 && level.ripple) {
        wade -= dt;
        const moving = speed > 0.3;
        if (wade <= 0 && (!moving || !feet.length)) {
          // no foot bones to follow: fall back to a steady string of pushes from alternating sides
          stepSide = -stepSide;
          const px = pos.x + Math.cos(heading) * stepSide * 0.12, pz = pos.z - Math.sin(heading) * stepSide * 0.12;
          const body = (0.7 + 0.6 * Math.min(1, depthHere / 0.4)) * 0.55;
          level.ripple(px, pz, moving ? body : body * 0.8, moving ? 0.34 : 0.42, moving ? 'step' : 'plain');
          wade = moving ? 0.17 + Math.random() * 0.09 : 1.2 + Math.random() * 0.8;      // never quite in time, like real steps
        }
      } else wade = 0;
      speed += (target - speed) * Math.min(1, dt * (target > speed ? 7 - 4 * drag : 10 + 5 * drag));      // water is slow to get going in and quick to stop her
      if (speed > 0.02) {
        tmp.set(pos.x + Math.sin(heading) * speed * dt, 0, pos.z + Math.cos(heading) * speed * dt);
        if (level.waterDepthAt(tmp.x, tmp.z) > DEEP && level.waterDepthAt(tmp.x, tmp.z) > depthHere) {
          // too deep ahead: try sliding along the shore instead of walking in
          const ax = pos.x + Math.sin(heading + 1.1) * speed * dt, az = pos.z + Math.cos(heading + 1.1) * speed * dt;
          const bx = pos.x + Math.sin(heading - 1.1) * speed * dt, bz = pos.z + Math.cos(heading - 1.1) * speed * dt;
          const da = level.waterDepthAt(ax, az), db = level.waterDepthAt(bx, bz);
          if (Math.min(da, db) > DEEP) tmp.set(pos.x, 0, pos.z); else if (da < db) tmp.set(ax, 0, az); else tmp.set(bx, 0, bz);
        }
        collide(tmp);
        const went = Math.hypot(tmp.x - pos.x, tmp.z - pos.z) / dt;
        pos.x = tmp.x; pos.z = tmp.z;
        speed = Math.min(speed, went * 1.15 + 0.05);          // pushing against something: stop walking on the spot
      }
      const ground = standAt(pos.x, pos.z);
      pos.y += (ground - pos.y) * Math.min(1, dt * 18);
      // ---- animation follows the real speed, so feet do not slide
      const st = speed < 0.25 ? 'idle' : speed < (WALK + RUN) * 0.5 ? 'walk' : 'run';
      if (character.state !== st) character.play(st, st === 'idle' ? 0.3 : 0.2);
      character.setRate(st === 'idle' ? 1 : Math.min(1.9, Math.max(0.7, speed / (character.speeds[st] || 1))));
      character.update(dt);
      root.position.copy(pos);
      character.object.rotation.y = heading;
      // tell her materials where the water's surface is (far below when she is on land) and how high she is wet
      if (character.water) {
        character.water.level.value = depthHere > 0.02 ? level.heightAt(pos.x, pos.z) + depthHere : -1e5;
        character.water.wet.value.set(pos.y + wetH, wetAmt);
      }
      // ---- footsteps in water: each foot swings between a low and a high point of its own; the moment it comes back down to the
      // low point is the step. The range is learnt as she moves, so walk and run (and any other clip) need no numbers of their own.
      if (feet.length && level.ripple) {
        root.updateMatrixWorld(true);
        for (const f of feet) {
          f.bone.getWorldPosition(footPos);
          const y = footPos.y - pos.y;
          if (!f.seen) { f.lo = f.hi = y; f.seen = true; }
          f.lo = y < f.lo ? y : f.lo + (y - f.lo) * Math.min(1, dt * 0.25);
          f.hi = y > f.hi ? y : f.hi + (y - f.hi) * Math.min(1, dt * 0.25);
          f.since += dt;
          const range = f.hi - f.lo;
          if (range < 0.03 || speed < 0.3) { f.up = false; continue; }          // standing: feet stay planted
          if (y > f.lo + range * 0.55) f.up = true;
          else if (f.up && y < f.lo + range * 0.28) {
            f.up = false;
            const d = level.waterDepthAt(footPos.x, footPos.z);
            if (d > 0.04 && f.since > 0.18) {
              f.since = 0;
              // harder the faster she goes and the deeper the water; a run kicks up a wider ring than a walk
              const pace = Math.min(1, Math.max(0, (speed - WALK) / (RUN - WALK)));
              level.ripple(footPos.x, footPos.z, (0.75 + 0.35 * Math.min(1, d / 0.4)) * (1 + 0.45 * pace), 0.3 + 0.08 * pace, 'step');
            }
          }
        }
      }
      // ---- camera: orbits a point above the shoulders, never dips under the ground
      look.set(pos.x, pos.y + character.height * 0.82, pos.z);
      const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
      // tree crowns: if the line from her shoulders to the camera runs into a leaf mass, the camera comes closer and stays
      // under the canopy instead of diving into the leaves
      const dx = Math.sin(camYaw) * cp, dy = sp, dz = Math.cos(camYaw) * cp;
      let reach = camDist;
      for (const [cx, cy, cz, cr] of level.crowns || []) {
        const ox = look.x - cx, oy = look.y - cy, oz = look.z - cz, r = cr + 0.5;
        if (Math.abs(ox) > r + camDist || Math.abs(oz) > r + camDist) continue;
        const b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - r * r;
        if (c <= 0) continue;                              // she is standing inside the sphere: ignore it
        const disc = b * b - c;
        if (disc <= 0) continue;
        const hit = -b - Math.sqrt(disc);
        if (hit > 0 && hit < reach) reach = hit;
      }
      // a wall of rock behind her (a cliff she has her back to): the camera comes in close too, instead of being lifted over it
      let walled = false;
      for (let r = 0.6; r < reach; r += 0.4) {
        if (level.heightAt(look.x + dx * r, look.z + dz * r) + 0.45 - (look.y + dy * r + 0.25) > 2.5) { reach = Math.max(0.7, r - 0.4); walled = true; break; }
      }
      camReach += (Math.max(walled ? 0.7 : 1.3, reach - (walled ? 0 : 0.25)) - camReach) * Math.min(1, dt * (reach < camReach ? 16 : 3.5));   // in fast, out slowly
      camPos.set(look.x + dx * camReach, look.y + dy * camReach + 0.25, look.z + dz * camReach);
      const floor = level.heightAt(camPos.x, camPos.z) + 0.45;
      if (camPos.y < floor) camPos.y = Math.min(floor, camPos.y + 2.5);      // over a rise in the ground, never up a cliff
      camPos.lerpVectors(look, camPos, cameraTrunkFraction(look, camPos, level.cameraTrunks));
      if (!camReady) { camera.position.copy(camPos); camTarget.copy(look); camReady = true; }
      camera.position.lerp(camPos, Math.min(1, dt * 14));
      camera.position.lerpVectors(look, camera.position, cameraTrunkFraction(look, camera.position, level.cameraTrunks));
      camTarget.lerp(look, Math.min(1, dt * 16));
      camera.lookAt(camTarget);
      player.lookDir.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    },
  };
  return player;
}

