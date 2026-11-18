// player-camera.js
// The camera that goes with the player (player-moves.js): it orbits a point above her shoulders, and that point follows her
// softly, so the picture glides instead of copying every bump of the ground and every hop.
//
//   const cam = createFollowCamera({ camera, level });
//   cam.turn(yaw, pitch)             the look was dragged (radians)          cam.zoom(d): nearer / further
//   cam.setView(yaw, pitch, dist)    look from here, at once                 cam.snap(): the next frame starts on her, no glide
//   every frame, after she has moved: cam.update(dt, { pos, height, k, heading, speed, run, sprint, mode, looking })
//   cam.yaw, cam.pitch, cam.dist, cam.lookDir
//
// What it does that player.js's camera did not:
//   - one followed point (the focus), and the camera placed from it: sideways it keeps up closely, in height it is slower, so
//     rough ground and a jump's hop do not shake the view. A fall is followed the faster the further she gets ahead of it.
//     (It used to aim at her exact spot, lowered by part of her height above the ground: stepping off a cliff, where the
//     ground under her is suddenly far below, would have thrown the view down in a blink.)
//   - left alone, it comes round behind her as she goes, slowly, and only as far as she moves across the view: running
//     straight at the camera does not swing it. A finger on the look takes it back at once.
//   - on a slope it looks a little down the hill ahead or up the hill, and down after her in a fall; at a sprint it sits
//     a little further back.
//   - a tree trunk passing between her and the camera no longer throws it forward. (The walker's camera jumped to the near
//     side of every trunk that crossed its line, metres in one frame, then crept back out: running through trees it pumped
//     in and out.) A trunk going by just goes by; only when she has stood behind one for a moment does the camera come
//     round in front of it, gliding.
// As before: it comes in close under a tree's crown and in front of a cliff at her back, and never dips under the ground.

import * as THREE from 'three';
import { cameraTrunkFraction } from './player.js';      // (a trunk between her and the camera: the same clip. When the moves are the game, it moves here)

const PITCH_MIN = -0.22, PITCH_MAX = 1.05;
const FOLLOW_AFTER = 0.9, FOLLOW_EASE = 0.8, FOLLOW_RATE = 0.8;      // s after the last touch; s to come in; rad/s at most
const TRUNK_AFTER = 0.35;                                             // s a trunk has to hide her before the camera comes in front of it
const RISE = 0.25 / 4.3;                                              // the camera sits a little above the line it looks along: 0.25 m at its usual distance
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);                  // the same glide at any frame rate

export function createFollowCamera({ camera, level }) {
  let yaw = 0, pitch = 0.17, dist = 4.3;      // what the player has chosen
  let ready = false, reach = dist, reachV = 0, sinceTouch = 1e9, tilt = 0, back = 0, raise = 0, raiseV = 0, hidden = 0, lastX = 0, lastZ = 0;
  const focus = new THREE.Vector3(), camPos = new THREE.Vector3(), lookDir = new THREE.Vector3(0, 0, -1);
  const groundAt = level.standAt || level.heightAt;

  const cam = {
    get yaw() { return yaw; }, get pitch() { return pitch; }, get dist() { return dist; }, lookDir,
    turn(dYaw, dPitch) { yaw += dYaw; pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch + dPitch)); sinceTouch = 0; },
    zoom(d) { dist = Math.min(9, Math.max(2.6, dist + d)); },
    setView(y, p, d) { yaw = y; if (p !== undefined) pitch = p; if (d !== undefined) dist = d; ready = false; },
    snap() { ready = false; },
    update(dt, { pos, height, k, heading, speed, run, sprint, mode, looking }) {
      sinceTouch = looking ? 0 : sinceTouch + dt;
      // ---- left alone, it comes round behind her as she goes
      if (sinceTouch > FOLLOW_AFTER && mode === 'ground' && speed > 0.5 * k) {
        const off = heading - Math.PI - yaw, w = Math.min(1, (sinceTouch - FOLLOW_AFTER) / FOLLOW_EASE) * Math.min(1, speed / run);
        yaw += Math.sin(off) * FOLLOW_RATE * w * dt;      // (sin: fastest when she goes straight across the view, nothing when she comes straight at it)
      }
      // ---- the point it orbits: above her shoulders, followed softly
      const tx = pos.x, ty = pos.y + height * 0.82, tz = pos.z;
      if (!ready) { focus.set(tx, ty, tz); tilt = 0; back = 0; raise = 0; hidden = 0; }
      const side = ease(11, dt);
      focus.x += (tx - focus.x) * side; focus.z += (tz - focus.z) * side;
      const gap = focus.y - ty;                         // (> 0: she is below where it looks)
      const up = mode === 'ground' ? 7 : gap > 0 ? 5 + 14 * Math.min(1, gap / 1.5) : 2.5;      // a hop barely lifts it; a fall pulls it after her
      focus.y += (ty - focus.y) * ease(up, dt);
      // ---- a little down the hill ahead, or up it; down after her in a fall
      let want = 0;
      if (sinceTouch > FOLLOW_AFTER) {
        if (mode === 'ground') {
          const fx = -Math.sin(yaw), fz = -Math.cos(yaw);      // the way the camera looks, on the ground
          const along = (groundAt(pos.x + fx * 2.5, pos.z + fz * 2.5, pos.y) - groundAt(pos.x - fx * 1.5, pos.z - fz * 1.5, pos.y)) / 4;      // (at her height: under a bridge, the bed, not its deck)
          want = Math.min(0.22, Math.max(-0.1, -along * 0.4));
        } else want = gap > 0.4 ? Math.min(0.4, 0.14 + gap * 0.15) : 0;      // (the further she falls ahead of it, the more it looks down after her)
      }
      tilt += (want - tilt) * ease(looking ? 6 : mode === 'ground' ? 1.6 : 4, dt);
      const p = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch + tilt));
      back += ((sprint ? 0.1 : 0) - back) * ease(3, dt);
      const camD = dist * k * (1 + back);
      // ---- how far out it may sit
      const cp = Math.cos(p), sp = Math.sin(p);
      const up1 = sp + RISE / k, len = Math.hypot(cp, up1);                 // (the rise goes with the distance: coming closer does not tip the view)
      const dx = Math.sin(yaw) * cp / len, dy = up1 / len, dz = Math.cos(yaw) * cp / len;
      // tree crowns: if the line from her shoulders to the camera runs into a leaf mass, the camera comes closer and stays
      // under the canopy instead of diving into the leaves
      let far = camD;
      for (const [cx, cy, cz, cr] of level.crowns || []) {
        const ox = focus.x - cx, oy = focus.y - cy, oz = focus.z - cz, r = cr + 0.5;
        if (Math.abs(ox) > r + camD || Math.abs(oz) > r + camD) continue;
        const b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - r * r;
        if (c <= 0) continue;                              // she is standing inside the sphere: ignore it
        const disc = b * b - c;
        if (disc <= 0) continue;
        const hit = -b - Math.sqrt(disc);
        if (hit > 0 && hit < far) far = hit;
      }
      // a wall of rock behind her (a cliff she has her back to): the camera comes in close too, instead of being lifted over it
      let walled = false;
      for (let r = 0.6; r < far; r += 0.4) {
        if (level.heightAt(focus.x + dx * r, focus.z + dz * r) + 0.45 - (focus.y + dy * r) > 2.5) { far = Math.max(0.7, r - 0.4); walled = true; break; }
      }
      let room = Math.max(walled ? 0.7 : 1.3, far - (walled ? 0 : 0.25));
      // a trunk between her and the camera: let it go by; once it has hidden her for a moment, in front of it
      camPos.set(focus.x + dx * room, focus.y + dy * room, focus.z + dz * room);
      const clear = cameraTrunkFraction(focus, camPos, level.cameraTrunks);
      hidden = clear < 1 ? hidden + dt : 0;
      if (hidden > TRUNK_AFTER || !ready) room *= clear;
      if (!ready) { reach = room; reachV = 0; }
      // in fast, out slowly, and without a jolt either way: a spring that never overshoots (it used to start at full speed,
      // a metre in the first frame under a tree's crown)
      const w = room < reach ? 14 : 4, off = reach - room, fade = Math.exp(-w * dt), push = (reachV + w * off) * dt;
      reachV = (reachV - w * push) * fade;
      reach = room + (off + push) * fade;
      camPos.set(focus.x + dx * reach, focus.y + dy * reach, focus.z + dz * reach);
      // over a rise in the ground, never up a cliff. It is lifted by a spring, not thrown up (a ledge behind her used to
      // jerk it up a metre in one frame), and so that the spring is in time it looks at the ground it is about to be over
      // as well as the ground it is over
      let ox = 0, oz = 0;
      if (ready && dt > 1e-4) { ox = (camPos.x - lastX) / dt * 0.12; oz = (camPos.z - lastZ) / dt * 0.12; const ol = Math.hypot(ox, oz); if (ol > 1) { ox /= ol; oz /= ol; } }
      lastX = camPos.x; lastZ = camPos.z;
      const floor = Math.max(level.heightAt(camPos.x, camPos.z), level.heightAt(camPos.x + ox, camPos.z + oz)) + 0.45;
      const need = camPos.y < floor ? Math.min(floor - camPos.y, 2.5) : 0;
      if (!ready) { raise = need; raiseV = 0; }
      const wr = need > raise ? 20 : 4, offR = raise - need, fadeR = Math.exp(-wr * dt), pushR = (raiseV + wr * offR) * dt;
      raiseV = (raiseV - wr * pushR) * fadeR;
      raise = need + (offR + pushR) * fadeR;
      camPos.y += raise;
      ready = true;
      camera.position.copy(camPos);
      camera.lookAt(focus);
      lookDir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    },
  };
  return cam;
}
