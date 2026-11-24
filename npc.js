/* ==========================================================================
   npc.js  —  the people of the world (a trial for now: ?npc=1, the hill village). An NPC stands where she is put,
   breathing (the library's idle), her hair and skirt swinging (her springs). When Vivi comes up she turns to her and
   talks (a speech bubble over her head, speech-bubbles.js; the library's talking idle); while Vivi is about, her eyes
   and then her head follow her; when Vivi goes she says goodbye and turns back the way she stood.

   Each NPC is two files in assets/npcs/: <id>.glb, her model (made from the .vrm the user sent by tools/prep-vrm1.py,
   then given fewer triangles by tools/simplify-character.mjs: see the README) and <id>.springs.json, her hair and cloth
   that swing. She is drawn and moved as the playable characters are (stylized-character.js, character-springs.js), with
   the same clips: the library's idle (character-anim.js, the game's own) and its talking idle (npc-anim.js).

     NPCS          { id: { name, height, lines: { hello, again, bye } } }   who there is, and what she says
     NPC_PLACES    { map: [{ id, x, z, yaw }] }                            where each stands on each map, facing yaw
     const npcs = await createNpcs({ map, level, scene, camera, player })  a model that will not load is left out
     every frame, after the player has moved: npcs.update(dt)
     npcs.list    [{ id, ch, object, home }]      npcs.spot   { x, z, yaw }: where Vivi starts on the trial, looking at her

   She is solid (one round collider, in level.colliders: Vivi walks round her and does not vault her). Past FAR_OFF
   metres from the camera she is neither drawn nor moved.
   ========================================================================== */
import * as THREE from 'three';
import { loadCharacter } from './stylized-character.js';
import { createSprings } from './character-springs.js';
import { createSpeechBubbles } from './speech-bubbles.js';
import { CHARACTER_ANIM } from './character-anim.js';
import { CHARACTER_ANIM as NPC_ANIM } from './npc-anim.js';

const DIR = 'assets/npcs/';
const VERSION = '1';                    // bump when the files in assets/npcs/ are remade

export const NPCS = {
  // the first: a model the user sent (fantasy_girl_01.vrm, 24 Nov 2026). Her lines are stand-ins, for the user to write
  'fantasy-girl': {
    name: 'Fantasy Girl',
    height: 1.68,                       // metres (Vivi is 1.75)
    lines: {
      hello: ['สวัสดีค่ะ!', 'ยินดีต้อนรับสู่หมู่บ้านนะคะ'],
      again: ['แวะมาอีกแล้วเหรอคะ'],
      bye: ['เดินทางปลอดภัยนะคะ'],
    },
  },
};

export const NPC_PLACES = {
  // on the edge of the way she starts on, seven metres along it (on the earth: the grass beside it is knee-high), turned
  // down the way to meet her
  hillvillage: [{ id: 'fantasy-girl', x: -66.66, z: 60.58, yaw: -2.2 }],
};

const NEAR = 3.2, FAR = 5.0;            // metres: Vivi this close, she is greeted; this far again, goodbye
const SEE = 10;                         // metres: within this her eyes and head follow Vivi (her body turns only to talk)
const AGAIN = 60;                       // seconds: back within this after a goodbye, a shorter hello
const TURN = 3.2;                       // how quickly she turns her body (a share of the way each second, about)
const HEAD_YAW = 1.1, HEAD_UP = 0.4, HEAD_DOWN = 0.35;      // radians her neck and head may turn together
const EYE_YAW = 0.2, EYE_PITCH = 0.16;  // and her eyes, past where her head points (her VRM's own look ranges: 12° and 10°)
const FAR_OFF = 70;                     // metres from the camera: past this, not drawn nor moved
const RADIUS = 0.32;                    // metres: how much room she takes (her collider)

const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

function blobTexture() {                // a soft round shadow, as the sprites have
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.55, 'rgba(255,255,255,0.7)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

async function loadNpc(id) {
  const def = NPCS[id];
  if (!def) throw new Error(`no NPC "${id}"`);
  const [model, springs] = await Promise.all([
    fetch(`${DIR}${id}.glb?v=${VERSION}`).then(r => { if (!r.ok) throw new Error(`${id}.glb: ${r.status}`); return r.arrayBuffer(); }),
    fetch(`${DIR}${id}.springs.json?v=${VERSION}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const anim = { ...CHARACTER_ANIM, clips: { idle: CHARACTER_ANIM.clips.idle, talk: NPC_ANIM.clips.talk } };
  const ch = await loadCharacter(model, anim);
  if (springs) ch.attachSprings(createSprings(ch.model, springs));
  ch.setSize(def.height / ch.baseHeight);
  return ch;
}

export async function createNpcs({ map, level, scene, camera, player }) {
  const places = NPC_PLACES[map] || [];
  const H = level.heightAt, bubbles = createSpeechBubbles({ camera });
  const blobTex = blobTexture(), blobGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  const list = [];
  const loaded = await Promise.all(places.map(p => loadNpc(p.id).catch(err => { console.warn('[npc]', p.id, err); return null; })));
  places.forEach((p, k) => {
    const ch = loaded[k];
    if (!ch) return;
    const o = ch.object;
    o.position.set(p.x, H(p.x, p.z), p.z);
    o.rotation.y = p.yaw;
    scene.add(o);
    const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#14260f', alphaMap: blobTex, transparent: true, opacity: 0.32, depthWrite: false }));
    blob.renderOrder = 1;
    const n = new THREE.Vector3(H(p.x - 0.3, p.z) - H(p.x + 0.3, p.z), 0.6, H(p.x, p.z - 0.3) - H(p.x, p.z + 0.3)).normalize();
    blob.position.set(p.x, H(p.x, p.z) + 0.03, p.z); blob.quaternion.setFromUnitVectors(Y, n); blob.scale.setScalar(0.42);
    scene.add(blob);
    level.colliders.push([p.x, p.z, RADIUS]);
    const bone = name => ch.model.getObjectByName(name);
    const neck = bone('J_Bip_C_Neck'), head = bone('J_Bip_C_Head');
    const eyes = [bone('J_Adj_L_FaceEye'), bone('J_Adj_R_FaceEye')].filter(Boolean);
    const said = [], held = new Map();     // what she has still to say [text, seconds]; each turned bone's pose as its clip had it
    for (const b of [neck, head, ...eyes]) if (b) held.set(b, b.quaternion.clone());
    list.push({
      id: p.id, def: NPCS[p.id], ch, object: o, blob, home: { x: p.x, z: p.z, yaw: p.yaw }, yaw: p.yaw,
      neck, head, eyes, said, held, near: false, greeted: false, goneFor: 0, sayT: 0, talking: false,
      look: { yaw: 0, pitch: 0, eyeYaw: 0, eyePitch: 0 },
    });
  });

  const tq = new THREE.Quaternion(), pq = new THREE.Quaternion(), oq = new THREE.Quaternion(), wq = new THREE.Quaternion();
  const at = new THREE.Vector3(), to = new THREE.Vector3(), feet = new THREE.Vector3();
  // turn a bone by a rotation given in her body's own frame (her body faces +Z), about the bone's own place
  function turn(o, b, yaw, pitch) {
    if (!b || (!yaw && !pitch)) return;
    tq.setFromAxisAngle(Y, yaw).multiply(wq.setFromAxisAngle(X, -pitch));       // (a pitch up turns +Z toward +Y)
    oq.copy(o.quaternion);
    wq.copy(oq).multiply(tq).multiply(oq.invert());                               // ... in the world
    b.parent.getWorldQuaternion(pq);
    tq.copy(pq).invert().multiply(wq).multiply(pq);                               // ... in the bone's parent's frame
    b.quaternion.premultiply(tq);
    b.updateMatrixWorld(true);
  }
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const speak = (npc, lines) => { npc.said.length = 0; for (const t of lines) npc.said.push(t); npc.sayT = 0; };

  function update(dt) {
    dt = Math.min(dt, 0.05);
    const p = player.position;
    feet.set(p.x, p.y ?? H(p.x, p.z), p.z);
    for (const npc of list) {
      const o = npc.object;
      const far = camera.position.distanceTo(o.position) > FAR_OFF;
      if (o.visible === far) { o.visible = !far; npc.blob.visible = !far; if (!far) npc.ch.resetSprings(); }      // (back in sight: her hair starts at rest)
      if (far) continue;
      const dx = feet.x - o.position.x, dz = feet.z - o.position.z, d = Math.hypot(dx, dz);
      // she comes up: a hello (a short one if she was here a little while ago); she goes: goodbye
      if (!npc.near && d < NEAR) {
        npc.near = true;
        speak(npc, npc.greeted && npc.goneFor < AGAIN ? npc.def.lines.again : npc.def.lines.hello);
        npc.greeted = true;
      } else if (npc.near && d > FAR) {
        npc.near = false; npc.goneFor = 0;
        speak(npc, npc.def.lines.bye);
      }
      if (!npc.near) npc.goneFor += dt;
      // the lines, one after another, while she talks (the talking idle); then the idle again
      if (npc.said.length) {
        if ((npc.sayT -= dt) <= 0) {
          const text = npc.said.shift(), lasts = Math.max(1.8, 0.9 + text.length * 0.07);
          bubbles.say(npc.id, text, { lasts });
          npc.sayT = lasts + 0.25;
          if (!npc.talking) { npc.talking = true; npc.ch.play('talk', 0.35); }
        }
      } else if (npc.talking && (npc.sayT -= dt) <= 0) {
        npc.talking = false; npc.ch.play('idle', 0.5);
      }
      // her body: turned to Vivi while Vivi is near (or while she is still saying goodbye), else the way she stood
      const want = npc.near || (npc.talking && d < FAR + 2) ? Math.atan2(dx, dz) : npc.home.yaw;
      npc.yaw = wrap(npc.yaw + wrap(want - npc.yaw) * Math.min(1, dt * TURN));
      o.rotation.y = npc.yaw;
      // her pose: each turned bone back as its clip has it first (a clip only writes a bone whose value changes), then the clip
      for (const [b, q] of npc.held) b.quaternion.copy(q);
      npc.ch.update(dt);
      for (const [b, q] of npc.held) q.copy(b.quaternion);
      o.updateMatrixWorld(true);
      // her eyes, then her head, after Vivi's face (in her body's frame: yaw about up, pitch up from level)
      let yaw = 0, pitch = 0;
      if (d < SEE && npc.head) {
        npc.head.getWorldPosition(at);
        to.set(feet.x, feet.y + 1.55, feet.z).sub(at).applyAxisAngle(Y, -o.rotation.y);      // (her eyes: Vivi is 1.75 m)
        const ly = Math.atan2(to.x, to.z), lp = Math.atan2(to.y, Math.hypot(to.x, to.z));
        if (Math.abs(ly) < 2.2) { yaw = ly; pitch = lp; }                          // (not one behind her)
      }
      const L = npc.look, hy = Math.max(-HEAD_YAW, Math.min(HEAD_YAW, yaw)), hp = Math.max(-HEAD_DOWN, Math.min(HEAD_UP, pitch));
      L.yaw += (hy - L.yaw) * Math.min(1, dt * 3.5);
      L.pitch += (hp - L.pitch) * Math.min(1, dt * 3.5);
      L.eyeYaw += (Math.max(-EYE_YAW, Math.min(EYE_YAW, yaw - L.yaw)) - L.eyeYaw) * Math.min(1, dt * 14);
      L.eyePitch += (Math.max(-EYE_PITCH, Math.min(EYE_PITCH, pitch - L.pitch)) - L.eyePitch) * Math.min(1, dt * 14);
      turn(o, npc.neck, L.yaw * 0.4, L.pitch * 0.4);
      turn(o, npc.head, L.yaw * 0.6, L.pitch * 0.6);
      for (const e of npc.eyes) turn(o, e, L.eyeYaw, L.eyePitch);
      npc.ch.updateSprings(dt);
    }
    bubbles.update(dt, (id, out) => {
      const npc = list.find(n => n.id === id);
      if (!npc || !npc.object.visible || !npc.head) return false;
      npc.head.getWorldPosition(out); out.y += 0.16;
      return true;
    });
  }

  const first = list[0];
  return {
    list, update,
    // on the trial she starts where she always does, turned to look at the first of them
    spot: first ? { x: level.spawn.x, z: level.spawn.z, yaw: Math.atan2(first.home.x - level.spawn.x, first.home.z - level.spawn.z) } : null,
    dispose() {
      bubbles.clear();
      for (const npc of list) {
        scene.remove(npc.object, npc.blob); npc.blob.material.dispose(); npc.ch.dispose();
        const k = level.colliders.findIndex(c => c[0] === npc.home.x && c[1] === npc.home.z && c[2] === RADIUS);
        if (k >= 0) level.colliders.splice(k, 1);
      }
      blobGeo.dispose(); blobTex.dispose();
    },
  };
}
