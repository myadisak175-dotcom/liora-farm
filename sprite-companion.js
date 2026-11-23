/* ==========================================================================
   sprite-companion.js  —  the forest sprite (สไปรต์ป่า, "Loria Sprite") that goes everywhere with her, in the game itself
   (index.html makes it on every map; ?sprite=0 leaves it out).

   It floats at her shoulder: to her left and a little behind while she goes, a little ahead of her and to the side when she
   stands, turned to her. It is drawn by stylized-animals.js from assets/models/loria-sprite.glb (the same model and four
   clips as the trial, sprite-trial.js) and moved here, every frame, on a soft spring, so it trails her a little and
   catches up:
     `walk`   while it goes faster than a stroll; `idle` while it hangs in the air beside her
     `jump`   when she jumps from where she stands, it jumps with her
     `happy`  now and then while she stands still a while, and when she arrives somewhere by a warp (it is there with her)
   Its height follows hers (her feet + RISE), never lower than CLEAR over the ground or the water under it, so it keeps at
   her chest up hills, down the abyss and over the river. It goes round the round colliders (houses, trees, rocks) rather
   than through them, and when she is suddenly far (a warp, a teleport, the map's places) it is simply beside her again.

     const sprite = await createSpriteCompanion({ level, scene, player })
     sprite.animal   the stylized-animals animal (object, play, ...)     sprite.state()   { action, x, y, z, far }
   Stepped with every other animal (updateAnimals). Made before the cloud shadows and the curse are laid on the scene.
   ========================================================================== */
import * as THREE from 'three';
import { loadAnimal, createAnimal } from './stylized-animals.js';

export const SPRITE_MODEL = './assets/models/loria-sprite.glb';
const HEIGHT = 0.7;                     // metres, skirt to ear tips (she is 1.75)
const RISE = 0.8;                       // its feet this far over hers: at about her chest
const CLEAR = 0.45;                     // and never less than this over the ground or the water
const SIDE = 1.0, BACK = 0.3;          // where it keeps while she goes: to her left, a little behind her (so it is seen)
const AHEAD = 0.55, SIDE_STILL = 1.05;  // and while she stands: to her left, a little ahead, so she sees it
const PULL = 9;                         // the spring's stiffness (critically damped, and carried along at her pace): higher keeps closer
const TOP = 11;                         // m/s at most (she runs at less)
const SNAP = 14;                        // further than this from where it should be: it is beside her at once
const WALK_ON = 0.75, WALK_OFF = 0.35;  // m/s: from here it floats along, below here it hangs idle
const FUN_EVERY = [7, 13];              // seconds, while she stands still, between its little turns of joy
const LASTS = { happy: 3.2, jump: 1.17 };      // a one-off move lasts this long (happy: twice its 1.6 s clip), then back to idle

export async function createSpriteCompanion({ level, scene, player }) {
  const H = level.heightAt, asset = await loadAnimal(SPRITE_MODEL, { height: HEIGHT });
  const animal = createAnimal(asset, { action: 'idle' });
  const o = animal.object; o.name = 'sprite-companion';
  const body = o.getObjectByName('body');
  // a soft round shadow under it, along the slope, smaller and paler the higher it floats
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.55, 'rgba(255,255,255,0.75)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#14260f', alphaMap: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.3, depthWrite: false }));
  blob.renderOrder = 1; blob.name = 'sprite-companion-shadow';
  scene.add(o, blob);
  if (level.addUnderwater) level.addUnderwater(blob);

  const floor = (x, z) => H(x, z) + Math.max(0, level.waterDepthAt ? level.waterDepthAt(x, z) : 0);   // the ground, or the water over it
  const p = new THREE.Vector3(), v = new THREE.Vector3(), at = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  const last = new THREE.Vector3(), hv = new THREE.Vector3();      // hv: her pace on the ground (smoothed)
  let ready = false, herV = 0, herVy = 0, still = 0, fun = FUN_EVERY[0], oneOff = null, oneOffT = 0, action = 'idle', t = 0, rest = 0;

  const play = (name, fade) => { if (name !== action) { action = name; animal.play(name, fade); } };
  const once = (name) => { oneOff = name; oneOffT = LASTS[name]; action = null; play(name, 0.15); };
  // where it should be now: blended from beside-and-behind (she goes) to beside-and-ahead (she stands)
  const spot = (out) => {
    const h = player.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);     // ahead of her; her left
    const go = Math.min(1, herV / 2.5);
    const side = SIDE_STILL + (SIDE - SIDE_STILL) * go, fwd = AHEAD + (-BACK - AHEAD) * go;
    const sway = Math.sin(t * 0.7) * 0.12, bob = Math.sin(t * 0.43 + 1) * 0.1;     // it never hangs quite still
    out.set(player.position.x + lx * (side + sway) + fx * (fwd + bob), 0, player.position.z + lz * (side + sway) + fz * (fwd + bob));
    return out;
  };
  const target = new THREE.Vector3();
  const heightFor = (x, z) => Math.max(player.position.y + RISE, floor(x, z) + CLEAR);
  const besideHer = () => {
    spot(target); p.set(target.x, heightFor(target.x, target.z), target.z); v.set(0, 0, 0);
    o.rotation.y = Math.atan2(player.position.x - p.x, player.position.z - p.z) - asset.forwardYaw;
  };
  // round things it goes round: houses, trees, rocks (as she does)
  const clearOf = () => {
    const cs = level.colliders; if (!cs) return;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], dx = p.x - c[0], dz = p.z - c[1], r = c[2] + 0.3, d2 = dx * dx + dz * dz;
      if (d2 < r * r) { const d = Math.sqrt(d2) || 1e-3; p.x = c[0] + dx / d * r; p.z = c[1] + dz / d * r; }
    }
  };
  const turnTo = (yaw, dt, pace) => { const d = Math.atan2(Math.sin(yaw - o.rotation.y), Math.cos(yaw - o.rotation.y)); o.rotation.y += d * Math.min(1, dt * pace); };

  animal.onUpdate = dt => {
    if (!dt) return;
    t += dt;
    const her = player.position;
    if (!ready) { last.copy(her); besideHer(); ready = true; }
    // how she moves (from where she was last frame): a sudden far step is a warp
    const step = Math.hypot(her.x - last.x, her.z - last.z);
    const warped = step > 4;
    const ease = Math.min(1, dt * 6);
    if (warped) hv.set(0, 0, 0); else { hv.x += ((her.x - last.x) / dt - hv.x) * ease; hv.z += ((her.z - last.z) / dt - hv.z) * ease; }
    herV = Math.hypot(hv.x, hv.z);
    herVy = (her.y - last.y) / dt;
    last.copy(her);
    spot(target);
    if (warped || Math.hypot(target.x - p.x, target.z - p.z) > SNAP) { besideHer(); if (warped) once('happy'); }
    else {
      // the spring, carried along at her pace (so it does not trail further behind the faster she goes)
      const c = 2 * Math.sqrt(PULL), ax = PULL * (target.x - p.x) + c * (hv.x - v.x), az = PULL * (target.z - p.z) + c * (hv.z - v.z);
      v.x += ax * dt; v.z += az * dt;
      const s = Math.hypot(v.x, v.z); if (s > TOP) { v.x *= TOP / s; v.z *= TOP / s; }
      p.x += v.x * dt; p.z += v.z * dt;
      clearOf();
      p.y += (heightFor(p.x, p.z) - p.y) * Math.min(1, dt * 6);
      p.y = Math.max(p.y, floor(p.x, p.z) + CLEAR * 0.6);
    }
    o.position.copy(p);
    const speed = Math.hypot(v.x, v.z);

    // what it does
    still = herV < 0.3 ? still + dt : 0;
    if (oneOff) {
      oneOffT -= dt;
      if (oneOffT <= 0 || (speed > WALK_ON * 2 && oneOff === 'happy')) { oneOff = null; action = null; play(speed > WALK_ON ? 'walk' : 'idle', 0.3); }
    } else {
      if (herVy > 2.6 && herV < 2.5) once('jump');                                           // she jumps: so does it
      else if (action === 'walk' ? speed < WALK_OFF : speed > WALK_ON) play(speed > WALK_ON ? 'walk' : 'idle', 0.3);
      else if (action === null) play('idle', 0.3);
      if (!oneOff && still > 2 && speed < WALK_OFF && (fun -= dt) <= 0) {
        fun = FUN_EVERY[0] + Math.random() * (FUN_EVERY[1] - FUN_EVERY[0]);
        once(Math.random() < 0.6 ? 'happy' : 'jump');
      }
    }
    // which way it faces: where it goes while it goes, else to her
    if (speed > WALK_OFF) turnTo(Math.atan2(v.x, v.z) - asset.forwardYaw, dt, 6);
    else turnTo(Math.atan2(her.x - p.x, her.z - p.z) - asset.forwardYaw, dt, 3);

    // its shadow
    o.updateMatrixWorld(true);
    body.getWorldPosition(at);
    const gy = floor(at.x, at.z), up = Math.max(0, at.y - gy - 0.3);
    n.set(H(at.x - 0.3, at.z) - H(at.x + 0.3, at.z), 0.6, H(at.x, at.z - 0.3) - H(at.x, at.z + 0.3)).normalize();
    const k = 1 / (1 + up * 0.9);
    blob.position.set(at.x, gy + 0.04, at.z); blob.quaternion.setFromUnitVectors(UP, n); blob.scale.setScalar(HEIGHT * 0.52 * k); blob.material.opacity = 0.3 * k;
  };

  return {
    animal, asset, object: o, shadow: blob, height: HEIGHT,
    state: () => ({ action: oneOff || action, x: p.x, y: p.y, z: p.z, far: Math.hypot(p.x - player.position.x, p.z - player.position.z) }),
    dispose() { animal.dispose(); scene.remove(o, blob); blob.geometry.dispose(); blob.material.alphaMap.dispose(); blob.material.dispose(); },
  };
}
