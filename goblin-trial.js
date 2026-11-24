/* ==========================================================================
   goblin-trial.js  —  ?goblin=1 (a trial): the goblin (ก็อบลิน) the user sent, standing a little ahead of where she starts
   in the hill village, to her right, to see it in the game: its size beside her, its colours in the land's light
   and the hour's. It does not walk yet ("ยืนให้ดูก่อน", the user, 25 Nov 2026). It stands as it was sculpted (feet
   apart, arms out from its sides), breathing as the library's idle breathes; it looks about now and then, its ears
   twitch, and when she comes by it looks at her: it starts at her the first time she comes close, its ears up.

   The model is assets/models/goblin.glb (tools/make-goblin.py, from the user's .fbx and three drawings): 8,000
   triangles, one 1024 px picture painted in flat colours after the front drawing, 24 bones with VRoid's names (the
   spine, arms and legs as a playable character has them, no fingers, and an ear each). It is drawn and moved as the
   playable characters are (stylized-character.js), its idle from goblin-anim.js: the library's Idle_Loop laid on the
   goblin's own stance as its motion about its own average.

     const goblin = await createGoblinTrial({ level, scene, camera, player })
     every frame, after the player has moved: goblin.update(dt)
   She starts where she always does: it stands ahead of her and to one side of her way, in view as the map opens (straight
   ahead it would be hidden behind her).

   Its looking is laid over its clip each frame: the bones it turns are put back first as the clip had them (a clip only
   writes a bone whose value changes, and the turn would pile up frame on frame), the ears (which no clip moves) back to
   rest. Every turn is a spring, so it runs a little past and settles. It is solid (a round collider: she stops against
   it). Past FAR_OFF metres from the camera it is neither drawn nor moved. Made before the cloud shadows, the hour's light
   and the curse are laid on the scene (index.html), so they reach it as they reach her.
   ========================================================================== */
import * as THREE from 'three';
import { loadCharacter } from './stylized-character.js';
import { GOBLIN_ANIM } from './goblin-anim.js';

export const GOBLIN_MODEL = './assets/models/goblin.glb';
const VERSION = '1';                    // bump when the model is made again
const HEIGHT = 1.1;                     // metres from its soles to the top of its hair (she is 1.75)
const AHEAD = [5.5, 6.5, 4.5, 7.5];     // where it stands: this far ahead of where she starts...
const ASIDE = [1.8, 2.4, 1.3, 3.0];     // ... and this far to one side of her way
const RADIUS = 0.3;                     // metres: how much room it takes (its collider)
const SEE = 9;                          // metres: within this (and not behind it) it looks at her
const NOTICE = 6;                       // the first time she comes this close, it starts at her
const FAR_OFF = 70;                     // metres from the camera: past this, not drawn nor moved
// how far it may look (radians, from its body's front): its neck is short and its head big, so the head does most of it
const LOOK_YAW = 1.05, LOOK_UP = 0.45, LOOK_DOWN = 0.28;
const SHARE = [['J_Bip_C_UpperChest', 0.12], ['J_Bip_C_Neck', 0.33], ['J_Bip_C_Head', 0.55]];
const GLANCE = [1.6, 3.8];              // seconds between its glances about, while she is not near

const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

// a damped spring: it runs a little past where it is sent (zeta < 1) and settles; stepped finely, so the same on a slow phone
function spring(omega, zeta) {
  const s = { x: 0, v: 0, to: 0, omega, zeta };
  s.step = dt => {
    for (let n = Math.ceil(dt / (1 / 120)), h = dt / n; n > 0; n--) {
      s.v += (s.omega * s.omega * (s.to - s.x) - 2 * s.zeta * s.omega * s.v) * h;
      s.x += s.v * h;
    }
    return s.x;
  };
  return s;
}

function blobTexture() {                // a soft round shadow, as the NPC has
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.55, 'rgba(255,255,255,0.7)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

// where it stands: ahead of where she starts, at the edge of her way (on the trodden earth, where the long grass does not
// hide its feet), out of the water, on gently sloping ground; failing that, in the grass beside the way
function findSpot(level) {
  const sp = level.spawn, H = level.heightAt, fx = Math.sin(sp.yaw), fz = Math.cos(sp.yaw);
  const earth = (x, z) => !!level.surfaceAt && level.surfaceAt(x, z) === 'earth';
  const clear = (x, z) => level.waterDepthAt(x, z) < 0.02
    && !level.colliders.some(([cx, cz, r]) => Math.hypot(cx - x, cz - z) < r + RADIUS + 0.5)
    && Math.abs(H(x + 0.5, z) - H(x - 0.5, z)) < 0.35 && Math.abs(H(x, z + 0.5) - H(x, z - 0.5)) < 0.35;
  const at = (a, s, side) => [sp.x + fx * a + fz * s * side, sp.z + fz * a - fx * s * side];
  // on the earth near its edge (grass within a step of it), ahead of her and in view, on her right (straight ahead she would
  // hide it from the camera behind her, and on her left the forest sprite that goes with her would): as near as may be to
  // AHEAD[0] ahead and a third of a radian off (a turn t off her heading is to her right on the screen when t < 0)
  let best = null, score = Infinity;
  for (let r = 4.5; r <= 8.01; r += 0.25) for (let t = -0.6; t <= -0.21; t += 0.05) {
    const x = sp.x + Math.sin(sp.yaw + t) * r, z = sp.z + Math.cos(sp.yaw + t) * r;
    if (!earth(x, z) || !clear(x, z)) continue;
    let grass = 0;
    for (let k = 0; k < 8; k++) if (!earth(x + Math.sin(k * Math.PI / 4) * 0.7, z + Math.cos(k * Math.PI / 4) * 0.7)) grass++;
    if (grass < 1 || grass > 4) continue;                       // (at the edge, not out on a patch of earth by itself)
    const sc = Math.abs(r - AHEAD[0]) + Math.abs(Math.abs(t) - 0.35) * 6;
    if (sc < score) { score = sc; best = { x, z }; }
  }
  if (best) return best;
  for (const a of AHEAD) for (const s of ASIDE) for (const side of [-1, 1]) {
    const [x, z] = at(a, s, side);
    if (clear(x, z)) return { x, z };
  }
  return { x: sp.x + fx * AHEAD[0], z: sp.z + fz * AHEAD[0] };
}

export async function createGoblinTrial({ level, scene, camera, player }) {
  const res = await fetch(`${GOBLIN_MODEL}?v=${VERSION}`);
  if (!res.ok) throw new Error(`goblin.glb: ${res.status}`);
  const ch = await loadCharacter(await res.arrayBuffer(), GOBLIN_ANIM);
  ch.setSize(HEIGHT / ch.baseHeight);
  const H = level.heightAt, sp = level.spawn;
  const at = findSpot(level);
  const o = ch.object;
  o.position.set(at.x, H(at.x, at.z), at.z);
  const home = Math.atan2(sp.x - at.x, sp.z - at.z);                 // it faces where she starts
  o.rotation.y = home;
  scene.add(o);
  const blobTex = blobTexture();
  const blob = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#14260f', alphaMap: blobTex, transparent: true, opacity: 0.32, depthWrite: false }));
  blob.renderOrder = 1; blob.scale.setScalar(0.36);
  const n = new THREE.Vector3(H(at.x - 0.3, at.z) - H(at.x + 0.3, at.z), 0.6, H(at.x, at.z - 0.3) - H(at.x, at.z + 0.3)).normalize();
  blob.position.set(at.x, o.position.y + 0.03, at.z); blob.quaternion.setFromUnitVectors(Y, n);
  scene.add(blob);
  const col = [at.x, at.z, RADIUS];
  level.colliders.push(col);
  o.updateMatrixWorld(true);

  // the bones its looking turns, and its ears: each kept as its clip had it (the ears: as they rest)
  const bone = name => ch.model.getObjectByName(name);
  const looks = SHARE.map(([name, k]) => [bone(name), k]).filter(([b]) => b);
  const ears = [['Goblin_L_Ear', -1], ['Goblin_R_Ear', 1]].map(([name, s]) => ({ b: bone(name), s, up: spring(16, 0.32), back: spring(12, 0.5), wait: rand(1.5, 5) })).filter(e => e.b);
  const held = new Map();
  for (const [b] of looks) held.set(b, b.quaternion.clone());
  for (const e of ears) held.set(e.b, e.b.quaternion.clone());
  const earRest = new Map(ears.map(e => [e.b, e.b.quaternion.clone()]));

  const look = { yaw: spring(9, 0.62), pitch: spring(9, 0.62) };
  let near = false, noticed = false, glanceT = rand(...GLANCE), glance = [0, 0], startT = 0;
  const tq = new THREE.Quaternion(), pq = new THREE.Quaternion(), oq = new THREE.Quaternion(), wq = new THREE.Quaternion(), eq = new THREE.Quaternion();
  const head = bone('J_Bip_C_Head'), hp = new THREE.Vector3(), to = new THREE.Vector3();
  // turn a bone by a rotation given in its body's own frame (its body faces +Z), about the bone's own place (as npc.js)
  function turn(b, yaw, pitch) {
    if (!yaw && !pitch) return;
    tq.setFromAxisAngle(Y, yaw).multiply(wq.setFromAxisAngle(X, -pitch));       // (a pitch up turns +Z toward +Y)
    oq.copy(o.quaternion);
    wq.copy(oq).multiply(tq).multiply(oq.invert());                               // ... in the world
    b.parent.getWorldQuaternion(pq);
    tq.copy(pq).invert().multiply(wq).multiply(pq);                               // ... in the bone's parent's frame
    b.quaternion.premultiply(tq);
    b.updateMatrixWorld(true);
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    const far = camera.position.distanceTo(o.position) > FAR_OFF;
    if (o.visible === far) { o.visible = !far; blob.visible = !far; }
    if (far) return;
    // its pose: each turned bone back as its clip has it first, then the clip
    for (const [b, q] of held) b.quaternion.copy(q);
    ch.update(dt);
    for (const [b, q] of held) q.copy(b.quaternion);
    for (const e of ears) { e.b.quaternion.copy(earRest.get(e.b)); held.get(e.b).copy(e.b.quaternion); }
    o.updateMatrixWorld(true);
    // where it looks, in its body's frame (yaw about up, pitch up from level): at her face while she is near and before it;
    // else about it, now and then
    const p = player.position, fy = p.y ?? H(p.x, p.z);
    const d = Math.hypot(p.x - o.position.x, p.z - o.position.z);
    let yaw = 0, pitch = 0, seeing = false;
    if (head && d < SEE) {
      head.getWorldPosition(hp);
      to.set(p.x, fy + 1.55, p.z).sub(hp).applyAxisAngle(Y, -o.rotation.y);     // (her eyes: she is 1.75 m)
      const ly = Math.atan2(to.x, to.z), lp = Math.atan2(to.y, Math.hypot(to.x, to.z));
      if (Math.abs(ly) < 2.3) { yaw = ly; pitch = lp; seeing = true; }           // (not one right behind it)
    }
    if (seeing && !near) {
      near = true;
      if (!noticed && d < NOTICE) {                                               // the first time she comes close: it starts at her
        noticed = true; startT = 0.6;
        for (const e of ears) e.up.v += 9;
      }
    } else if (!seeing && near && d > SEE + 1) near = false;
    if (!seeing) {
      if ((glanceT -= dt) <= 0) {
        glanceT = rand(...GLANCE);
        glance = Math.random() < 0.3 ? [0, 0] : [rand(-0.85, 0.85), rand(-0.12, 0.2)];
      }
      [yaw, pitch] = glance;
    }
    if (startT > 0) startT -= dt;
    look.yaw.omega = look.pitch.omega = startT > 0 ? 17 : seeing ? 10 : 7;          // (a start is quick; a glance about is slow)
    look.yaw.to = clamp(yaw, -LOOK_YAW, LOOK_YAW);
    look.pitch.to = clamp(pitch, -LOOK_DOWN, LOOK_UP);
    const ly = look.yaw.step(dt), lp = look.pitch.step(dt);
    for (const [b, k] of looks) turn(b, ly * k, lp * k);
    // its ears: up a little while she is near (it listens), a twitch now and then, each ear in its own time
    for (const e of ears) {
      e.up.to = near ? 0.16 : 0; e.back.to = near ? -0.08 : 0.04;
      if ((e.wait -= dt) <= 0) { e.wait = rand(2.2, 6.5); e.up.v += rand(5, 8); e.back.v -= rand(1, 3); }
      const u = e.up.step(dt), bk = e.back.step(dt);
      // the left ear points to -X in the model, the right to +X: up is a turn about Z (opposite ways), back a turn about Y
      eq.setFromAxisAngle(Y, -bk * e.s).multiply(tq.setFromAxisAngle(Z, u * e.s));
      e.b.quaternion.multiply(eq);
    }
    o.updateMatrixWorld(true);
  }

  return {
    object: o, ch, update,
    dispose() {
      scene.remove(o, blob); blob.geometry.dispose(); blob.material.dispose(); blobTex.dispose(); ch.dispose();
      const k = level.colliders.indexOf(col);
      if (k >= 0) level.colliders.splice(k, 1);
    },
  };
}
