// player-camera.js
// The camera of the player with the moves (player-moves.js). It is the walker's camera (player.js), line for line: it
// orbits a point above her shoulders at the angle and distance the player chose, comes in close under a tree's crown, in
// front of a cliff at her back and of a trunk, and never dips under the ground. It does nothing of its own accord: it does
// not come round behind her, does not tilt with the hills and does not pull back at speed. (A camera that did was tried in
// the first trial of the moves; the walker's was liked better.)
//
//   const cam = createFollowCamera({ camera, level });
//   cam.turn(yaw, pitch)             the look was dragged (radians)          cam.zoom(d): nearer / further
//   cam.setView(yaw, pitch, dist)    look from here, at once
//   every frame, after she has moved: cam.update(dt, { pos, aimY, height, k, steady })
//   cam.yaw, cam.pitch, cam.dist, cam.lookDir
//
// The one thing the moves add: aimY, the height the view stands on. The walker's camera took her own height, less most of
// a jump's hop; her height followed the ground softly, and so did the view. The moves put her feet exactly on the ground
// and take her off cliffs, up faces and into the water, so player-moves.js says what height the view should stand on
// (her feet; in a jump, the ground she left and a little of the hop; swimming, a little under the water's surface), and
// the camera follows it as softly as the walker's ground did (steady: on the ground or a face), or at once (in the air).

import * as THREE from 'three';
import { cameraTrunkFraction } from './player.js';      // (a trunk between her and the camera: the same clip)

const PITCH_MIN = -0.22, PITCH_MAX = 1.05;

export function createFollowCamera({ camera, level }) {
  let yaw = 0, pitch = 0.17, dist = 4.3;      // what the player has chosen
  let ready = false, reach = dist, base = 0;
  const look = new THREE.Vector3(), target = new THREE.Vector3(), camPos = new THREE.Vector3(), lookDir = new THREE.Vector3(0, 0, -1);
  return {
    get yaw() { return yaw; }, get pitch() { return pitch; }, get dist() { return dist; }, lookDir,
    turn(dYaw, dPitch) { yaw += dYaw; pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch + dPitch)); },
    zoom(d) { dist = Math.min(9, Math.max(2.6, dist + d)); },
    setView(y, p, d) { yaw = y; if (p !== undefined) pitch = p; if (d !== undefined) dist = d; ready = false; },
    update(dt, { pos, aimY, height, k, steady }) {
      const camD = dist * k;
      if (!ready) base = aimY;
      base += (aimY - base) * Math.min(1, dt * (steady ? 18 : 60));
      // ---- from here on, the walker's camera
      look.set(pos.x, base + height * 0.82, pos.z);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      // tree crowns: if the line from her shoulders to the camera runs into a leaf mass, the camera comes closer and stays
      // under the canopy instead of diving into the leaves
      const dx = Math.sin(yaw) * cp, dy = sp, dz = Math.cos(yaw) * cp;
      let far = camD;
      for (const [cx, cy, cz, cr] of level.crowns || []) {
        const ox = look.x - cx, oy = look.y - cy, oz = look.z - cz, r = cr + 0.5;
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
        if (level.heightAt(look.x + dx * r, look.z + dz * r) + 0.45 - (look.y + dy * r + 0.25) > 2.5) { far = Math.max(0.7, r - 0.4); walled = true; break; }
      }
      reach += (Math.max(walled ? 0.7 : 1.3, far - (walled ? 0 : 0.25)) - reach) * Math.min(1, dt * (far < reach ? 16 : 3.5));   // in fast, out slowly
      camPos.set(look.x + dx * reach, look.y + dy * reach + 0.25, look.z + dz * reach);
      const floor = level.heightAt(camPos.x, camPos.z) + 0.45;
      if (camPos.y < floor) camPos.y = Math.min(floor, camPos.y + 2.5);      // over a rise in the ground, never up a cliff
      camPos.lerpVectors(look, camPos, cameraTrunkFraction(look, camPos, level.cameraTrunks));
      if (!ready) { camera.position.copy(camPos); target.copy(look); ready = true; }
      camera.position.lerp(camPos, Math.min(1, dt * 14));
      camera.position.lerpVectors(look, camera.position, cameraTrunkFraction(look, camera.position, level.cameraTrunks));
      target.lerp(look, Math.min(1, dt * 16));
      camera.lookAt(target);
      lookDir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    },
  };
}
