/* ==========================================================================
   npc.js  —  the people of the world (the hill village; ?npc=0: none). An NPC has a day of her own: she walks from one
   place to the next and does what there is to do there (the library's moves: at the guild's reception, writing at the
   counter, leaning on it, filing papers in the pigeonholes, reaching under it, resting on her stool; in the fields,
   pulling a carrot, kneeling to plant, crouching to look the crops over; standing a while looking about), round and
   round. Her hair and skirt swing as she goes (her springs). When Vivi comes up she finishes what she has in hand (or
   stands up, off her stool), turns to her and talks (a speech bubble over her head, speech-bubbles.js; the library's
   talking idle), with a wave first where her place gives her one; while Vivi is near, her eyes and then her head follow
   her. When Vivi goes she says goodbye (a thumbs-up, where her place gives her one) and goes back to what she was doing.
   Where her place gives her one, she waves to Vivi from further off as she comes in (hail).

   Each NPC is two files in assets/npcs/: <id>.glb, her model (made from the .vrm the user sent by tools/prep-vrm1.py,
   then given fewer triangles by tools/simplify-character.mjs: see the README) and <id>.springs.json, her hair and cloth
   that swing. She is drawn and moved as the playable characters are (stylized-character.js, character-springs.js), with
   the same clips: the library's idle and walk (character-anim.js, the game's own) and its talking idle and farm work
   (npc-anim.js). She walks at the pace of the walk clip's feet, so they do not slide.

     NPCS          { id: { name, height, lines: { hello, again, bye } } }   who there is, and what she says
     DAYS          { name: [stop, ...] }                                   the days there are to have (below)
     NPC_PLACES    { map: [{ id, day, lines, greet, farewell, hail, start }] }   who has which day on each map; what she
                                                                           says there (in place of her own lines); the
                                                                           move she greets with and says goodbye with;
                                                                           her wave from afar; where Vivi starts on
                                                                           the trial (?npc=1) to watch her
     const npcs = await createNpcs({ map, level, scene, camera, player })  a model that will not load is left out
     every frame, after the player has moved: npcs.update(dt)
     npcs.list    [{ id, ch, object, x, z, mode }]      npcs.spot   { x, z, yaw }: where Vivi starts on the trial

   A day is a list of stops: { to: [x, z], face: yaw, do: [[clip], [clip, seconds, 'look'], ...] }, or { spot: name, do }
   for a place the guild names (level.guild.spots: its place, its storey and the way to face there). She walks straight
   to each (so the way between two stops must be clear: she does not find her way round things), turns to face, and
   does each thing in turn: a clip that plays once is played to its end; one that loops, for the seconds given; 'look':
   meanwhile she looks about. Then on to the next stop; after the last, the first again. Sitting (SIT: sit_in, then sit,
   then sit_out) she is seated: met so, she stands up first, and what is left of her sitting is let go.

   Indoors (a stop on a storey of the guild: 0 its hall, 1 its gallery) she stands on that storey's floor whatever Vivi
   stands on (level.floorAt), and Vivi is met or hailed only in there with her, on her floor. She is solid (one round
   collider that goes with her, in level.colliders, indoors only as high as she is: Vivi stops against her, and does not
   vault her). Past FAR_OFF metres from the camera she is neither drawn nor moved (her day waits for her).
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
      hello: ['สวัสดีค่ะ!', 'แครอทปีนี้หวานมากเลยนะคะ'],
      again: ['แวะมาอีกแล้วเหรอคะ'],
      bye: ['เดินทางปลอดภัยนะคะ'],
    },
  },
};

const S = Math.PI, E = Math.PI / 2;    // facing: 0 is +Z (south on the map), S is -Z (north), E is +X (east)
export const DAYS = {
  // the guild's reception (25 Nov 2026: "ใส่ NPC ที่ทำค่ะ ใส่กระดูก ใส่อนิเมชั่นให้เข้ากันด้วยนะคะ"): at the counter's middle
  // place, between its bells, looking out over the hall, writing, leaning on the counter; filing papers in the pigeonholes
  // behind her; reaching under the counter; resting on her stool at the east place (guild-hall.js: spots.desk, pigeonholes,
  // deskSeat)
  reception: [
    { spot: 'desk', do: [['idle', 3.0, 'look'], ['interact'], ['idle', 2.2, 'look'], ['lean', 7.0, 'look']] },
    { spot: 'pigeonholes', do: [['interact'], ['idle', 1.0], ['interact']] },
    { spot: 'desk', do: [['idle', 2.5, 'look'], ['chest'], ['idle', 2.4, 'look'], ['lean', 5.0, 'look']] },
    { spot: 'deskSeat', do: [['sit_in'], ['sit', 11.0, 'look'], ['sit_out']] },
  ],
  // the west fields (24 Nov 2026): up and down the lane between the carrots (south of it) and the cabbages (north of it),
  // inside their fence; its gate opens onto the lane's east end, and a trodden way from it to the road
  fields: [
    { to: [-61.7, 38.45], face: 0, do: [['harvest'], ['idle', 1.4, 'look'], ['harvest']] },     // pulling carrots
    { to: [-66.4, 38.3], face: S, do: [['plant'], ['idle', 2.2, 'look']] },                     // kneeling by the cabbages
    { to: [-71.8, 38.45], face: 0, do: [['crouch', 4.5], ['idle', 1.6]] },                      // looking the carrots over
    { to: [-60.4, 39.1], face: E, do: [['idle', 3.5, 'look']] },                                // at the gate, looking out to the road
  ],
};
const SIT = { sit_in: 'stand', sit: 'seated', sit_out: 'seated' };     // what a clip of sitting wants her to be first
export const NPC_PLACES = {
  // she is the guild's receptionist (until 25 Nov 2026 she tended the west fields: DAYS.fields, Vivi starting by their gate
  // at -56.2, 39.3). Her lines there are stand-ins, for the user to write
  hillvillage: [{
    id: 'fantasy-girl', day: 'reception',
    lines: {
      hello: ['ยินดีต้อนรับสู่กิลด์นักผจญภัยค่ะ!', 'วันนี้มารับภารกิจ หรือมาลงทะเบียนคะ?'],
      again: ['กลับมาแล้วเหรอคะ', 'ภารกิจใหม่ติดอยู่ที่กระดานนะคะ'],
      bye: ['ขอให้โชคดีนะคะ!'],
    },
    greet: 'call', farewell: 'yes',                                                              // a wave from over the counter; a thumbs-up
    hail: { range: 9, line: 'ยินดีต้อนรับค่ะ!' },                                                // as Vivi comes into the hall
    start: { spot: 'counter' },                                                                  // the trial: Vivi before the counter
  }],
};

const NEAR = 3.2, FAR = 5.0;            // metres: Vivi this close, she is greeted; this far again, goodbye
const SEE = 10;                         // metres: within this, while she talks or stands with Vivi, her eyes and head follow Vivi
const BUSY_SEE = 4.5;                   // ... and while she works, only this close (a glance up at whoever comes by)
const AGAIN = 60;                       // seconds: back within this after a goodbye, a shorter hello
const WAVE_AGAIN = 8;                   // seconds: she waved to Vivi this lately (from afar, as she came in): no wave with her hello
const TURN = 3.2;                       // how quickly she turns her body to Vivi (a share of the way each second, about)
const STEER = 2.4, FACE_TURN = 2.0;     // radians a second: turning as she walks; turning where she stands, to her work
const ACCEL = 1.4, DECEL = 1.8;         // m/s²: getting into her stride, and out of it
const HEAD_YAW = 1.1, HEAD_UP = 0.4, HEAD_DOWN = 0.35;      // radians her neck and head may turn together
const EYE_YAW = 0.2, EYE_PITCH = 0.16;  // and her eyes, past where her head points (her VRM's own look ranges: 12° and 10°)
const FAR_OFF = 70;                     // metres from the camera: past this, not drawn nor moved
const RADIUS = 0.32;                    // metres: how much room she takes (her collider)

const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
  const anim = { ...CHARACTER_ANIM, clips: { idle: CHARACTER_ANIM.clips.idle, walk: CHARACTER_ANIM.clips.walk, ...NPC_ANIM.clips } };
  const ch = await loadCharacter(model, anim);
  if (springs) ch.attachSprings(createSprings(ch.model, springs));
  ch.setSize(def.height / ch.baseHeight);
  return ch;
}

export async function createNpcs({ map, level, scene, camera, player }) {
  const H = level.heightAt, bubbles = createSpeechBubbles({ camera });
  // a stop at a place the guild names: its place, its storey and the way to face there (none without the guild: she is
  // left out)
  const spotOf = name => { const sp = level.guild && level.guild.spots && level.guild.spots[name]; return sp ? { to: [sp[0], sp[1]], face: sp[3], storey: sp[2] } : null; };
  const resolve = st => (st.spot ? (spotOf(st.spot) ? { ...spotOf(st.spot), do: st.do } : null) : { storey: -1, ...st });
  const places = (NPC_PLACES[map] || []).map(p => {
    const day = (typeof p.day === 'string' ? DAYS[p.day] : p.day).map(resolve), sp = p.start && p.start.spot ? spotOf(p.start.spot) : null;
    if (day.some(st => !st)) { console.warn('[npc]', p.id, 'has a day at a place this map has not got'); return null; }
    return { ...p, day, start: sp ? { x: sp.to[0], z: sp.to[1], yaw: sp.face } : p.start };
  }).filter(Boolean);
  // the floor she stands on: her storey's, indoors, whatever Vivi stands on; out of doors the land
  const floor = (npc, x, z) => (npc.storey >= 0 && level.floorAt ? level.floorAt(x, z, npc.storey) : H(x, z));
  const blobTex = blobTexture(), blobGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  const list = [];

  // ---- her clips: a one-shot keeps its own timing (no warp)
  function play(npc, name, fade = 0.35) { npc.ch.play(name, fade, name === 'walk' || name === 'idle'); }
  // ---- the next thing to do at this stop; after the last, on to the next stop
  function nextStep(npc) {
    const st = npc.day[npc.k];
    npc.j++;
    // a clip of sitting she is not in the posture for is let go (she stood up off her stool to meet Vivi; or sits already)
    while (npc.j < st.do.length && SIT[st.do[npc.j][0]] && (SIT[st.do[npc.j][0]] === 'seated') !== npc.seated) npc.j++;
    if (npc.j >= st.do.length) { npc.k = (npc.k + 1) % npc.day.length; npc.j = -1; npc.mode = 'go'; npc.glance = false; npc.storey = npc.day[npc.k].storey; return; }
    const [name, secs, how] = st.do[npc.j], clip = npc.ch.actions[name] && npc.ch.actions[name].getClip();
    if (name === 'sit_in') npc.seated = true; else if (name === 'sit_out') npc.seated = false;
    npc.mode = 'act';
    npc.glance = how === 'look'; npc.glanceT = 0.6;
    if (!clip) { npc.stepT = secs || 1; return; }
    play(npc, name, 0.4);
    if (clip.userData.loop) { npc.stepT = secs || clip.duration; npc.once = 0; }
    else { npc.stepT = npc.once = clip.duration - 0.05; }            // (held at its end until the next thing fades in)
  }
  // ---- she walks to her next stop: turning as she goes, into her stride and out of it, her feet at the clip's pace
  function walk(npc, dt) {
    const [tx, tz] = npc.day[npc.k].to, dx = tx - npc.x, dz = tz - npc.z, dist = Math.hypot(dx, dz);
    const diff = wrap(Math.atan2(dx, dz) - npc.yaw);
    npc.yaw = wrap(npc.yaw + clamp(diff, -STEER * dt, STEER * dt));
    const vmax = npc.ch.speeds.walk, align = Math.max(0, Math.cos(diff));
    const want = npc.meetDue ? 0 : Math.min(vmax, Math.sqrt(2 * DECEL * Math.max(0, dist - 0.03))) * align * align;
    npc.speed = clamp(want, npc.speed - DECEL * dt, npc.speed + ACCEL * dt);
    npc.x += Math.sin(npc.yaw) * npc.speed * dt; npc.z += Math.cos(npc.yaw) * npc.speed * dt;
    if (npc.speed > 0.12) { play(npc, 'walk', 0.3); npc.ch.setRate(Math.max(0.45, npc.speed / vmax)); }
    else if (npc.speed < 0.06) play(npc, 'idle', 0.3);
    if (!npc.meetDue && (dist < 0.08 || (dist < 0.35 && Math.abs(diff) > 1.3))) { npc.speed = 0; play(npc, 'idle', 0.3); npc.mode = 'face'; }
  }
  // her lines, one after another; with a move first (her greeting, her goodbye), played to its end before she talks on
  const speak = (npc, lines, gesture = null) => { npc.said.length = 0; for (const t of lines) npc.said.push(t); npc.sayT = 0; npc.gesture = gesture; npc.hushed = false; };
  const durationOf = (npc, name) => { const a = npc.ch.actions[name]; return a ? a.getClip().duration : 0; };
  // ---- Vivi has come up: she stands (off her stool first), turns to her and talks
  function meet(npc) {
    if (npc.mode !== 'leave' && npc.mode !== 'rise') npc.resume = npc.mode === 'hail' ? 'act' : npc.mode;      // (to come back to: walking on, turning to her work, or the next thing)
    if (npc.seated) {
      npc.seated = false; npc.mode = 'rise'; npc.glance = false;
      play(npc, 'sit_out', 0.3); npc.once = durationOf(npc, 'sit_out') - 0.05;                 // (then she meets her: meetDue still)
      return;
    }
    npc.mode = 'meet'; npc.meetDue = false; npc.speed = 0; npc.glance = false;
    if (npc.ch.state !== 'idle' && npc.ch.state !== 'talk') play(npc, 'idle', 0.5);     // (out of a crouch, or her stride, first)
    const waved = npc.clock - npc.wavedAt < WAVE_AGAIN;              // (she has just waved to her from afar: not again at once)
    speak(npc, npc.greeted && npc.goneFor < AGAIN ? npc.lines.again : npc.lines.hello, waved ? null : npc.greet);
    if (!waved && npc.greet) npc.wavedAt = npc.clock;
    npc.greeted = true; npc.hailed = true;
  }
  function backToWork(npc) {
    if (npc.resume === 'act') { npc.mode = 'act'; nextStep(npc); }
    else npc.mode = npc.resume;                                   // ('go' or 'face')
  }

  const loaded = await Promise.all(places.map(p => loadNpc(p.id).catch(err => { console.warn('[npc]', p.id, err); return null; })));
  places.forEach((p, k) => {
    const ch = loaded[k];
    if (!ch) return;
    const first = p.day[0], def = NPCS[p.id];
    scene.add(ch.object);
    const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#14260f', alphaMap: blobTex, transparent: true, opacity: 0.32, depthWrite: false }));
    blob.renderOrder = 1; blob.scale.setScalar(0.42);
    scene.add(blob);
    const col = [first.to[0], first.to[1], RADIUS];                // (indoors: only as high as she is, so she does not stop Vivi on the floor over her)
    level.colliders.push(col);
    const bone = name => ch.model.getObjectByName(name);
    const neck = bone('J_Bip_C_Neck'), head = bone('J_Bip_C_Head');
    const eyes = [bone('J_Adj_L_FaceEye'), bone('J_Adj_R_FaceEye')].filter(Boolean);
    const held = new Map();             // each bone her looking turns: its pose as its clip had it
    for (const b of [neck, head, ...eyes]) if (b) held.set(b, b.quaternion.clone());
    const npc = {
      id: p.id, def, ch, object: ch.object, blob, col, day: p.day, start: p.start, storey: first.storey,
      lines: { ...def.lines, ...(p.lines || {}) }, greet: p.greet || null, farewell: p.farewell || null, hail: p.hail || null,
      x: first.to[0], z: first.to[1], yaw: first.face, speed: 0, seated: false,
      mode: 'act', k: 0, j: -1, stepT: 0, once: 0, glance: false, glanceT: 0, glanceAt: [0, 0], resume: 'act',
      near: false, meetDue: false, greeted: false, hailed: false, goneFor: 0, clock: 0, wavedAt: -1e9,
      said: [], sayT: 0, talking: false, gesture: null, gestureT: 0, speaking: false, hushed: true,
      neck, head, eyes, held, look: { yaw: 0, pitch: 0, eyeYaw: 0, eyePitch: 0 },
    };
    nextStep(npc);                      // she is at her first stop, at work, when the map opens
    ch.object.position.set(npc.x, floor(npc, npc.x, npc.z), npc.z); ch.object.rotation.y = npc.yaw;      // (there already: how far off she is is told from where she stands)
    list.push(npc);
  });

  const tq = new THREE.Quaternion(), pq = new THREE.Quaternion(), oq = new THREE.Quaternion(), wq = new THREE.Quaternion();
  const at = new THREE.Vector3(), to = new THREE.Vector3(), feet = new THREE.Vector3(), n = new THREE.Vector3();
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

  function update(dt) {
    dt = Math.min(dt, 0.05);
    const p = player.position;
    feet.set(p.x, p.y ?? H(p.x, p.z), p.z);
    for (const npc of list) {
      const o = npc.object;
      const far = camera.position.distanceTo(o.position) > FAR_OFF;
      if (o.visible === far) { o.visible = !far; npc.blob.visible = !far; if (!far) npc.ch.resetSprings(); }      // (back in sight: her hair starts at rest)
      if (far) continue;
      npc.clock += dt;
      const dx = feet.x - npc.x, dz = feet.z - npc.z, d = Math.hypot(dx, dz), toVivi = Math.atan2(dx, dz);
      // indoors she sees Vivi only in there with her, on her floor (not out past the wall, nor up on the gallery over her)
      const seen = npc.storey < 0 || !level.guild || level.guild.storey === npc.storey;
      // Vivi comes up: she will meet her as soon as her hands are free (a one-shot finished, her stride run out, off her
      // stool); Vivi goes: goodbye, and back to work
      if (!npc.near && d < NEAR && seen) { npc.near = true; npc.meetDue = true; }
      else if (npc.near && (d > FAR || !seen)) {
        npc.near = false; npc.meetDue = false; npc.goneFor = 0;
        if (npc.mode === 'meet') { npc.mode = 'leave'; speak(npc, npc.lines.bye, npc.farewell); }
      }
      if (!npc.near) npc.goneFor += dt;
      if (npc.once > 0) npc.once -= dt;
      // as Vivi comes in, from further off: a wave and a word, once a visit (she must be standing, her hands free)
      if (npc.hail && !npc.hailed && seen && d < npc.hail.range && !npc.near && npc.mode === 'act' && !npc.seated && npc.once <= 0) {
        npc.hailed = true; npc.mode = 'hail'; npc.glance = false; npc.wavedAt = npc.clock;
        play(npc, npc.greet || 'idle', 0.3); npc.once = Math.max(1.2, durationOf(npc, npc.greet) - 0.15);
        bubbles.say(npc.id, npc.hail.line, { lasts: 2.2 });
      }
      if (npc.hailed && npc.mode !== 'hail' && (!seen || d > npc.hail.range + 6)) npc.hailed = false;      // (gone out again: next time, again)
      if (npc.meetDue && npc.mode !== 'meet' && npc.once <= 0 && npc.speed < 0.05) meet(npc);
      // what she is doing
      if (npc.mode === 'go') walk(npc, dt);
      else if (npc.mode === 'face') {
        const diff = wrap(npc.day[npc.k].face - npc.yaw);
        npc.yaw = wrap(npc.yaw + clamp(diff, -FACE_TURN * dt, FACE_TURN * dt));
        if (Math.abs(diff) < 0.04) { npc.mode = 'act'; npc.j = -1; nextStep(npc); }
      } else if (npc.mode === 'act') {
        if ((npc.stepT -= dt) <= 0) nextStep(npc);
      } else if (npc.mode === 'rise') {                           // off her stool, to meet her (meet, again, when it is played)
        if (!npc.meetDue && npc.once <= 0) backToWork(npc);      // (stood up for her, and she has gone: on with the day, standing)
      } else if (npc.mode === 'hail') {                           // waving to her as she comes in; then on with what she was doing
        npc.yaw = wrap(npc.yaw + clamp(wrap(toVivi - npc.yaw), -FACE_TURN * dt, FACE_TURN * dt));
        if (npc.once <= 0) { npc.mode = 'act'; nextStep(npc); }        // (come up meanwhile, she is met first: above, once the wave is over)
      } else {                                                    // 'meet', 'leave': turned to Vivi while she talks to her
        if (npc.mode === 'meet' || d < FAR + 3) npc.yaw = wrap(npc.yaw + wrap(toVivi - npc.yaw) * Math.min(1, dt * TURN));
        if (npc.gestureT > 0) npc.gestureT -= dt;
        if ((npc.sayT -= dt) <= 0) {
          if (npc.said.length) {                                  // her next line; with it, the move it comes with
            const text = npc.said.shift(), lasts = Math.max(1.8, 0.9 + text.length * 0.07);
            bubbles.say(npc.id, text, { lasts });
            npc.sayT = lasts + 0.25; npc.speaking = true;
            if (npc.gesture && npc.ch.actions[npc.gesture]) { play(npc, npc.gesture, 0.3); npc.gestureT = durationOf(npc, npc.gesture) - 0.2; npc.talking = false; }
            npc.gesture = null;
          } else npc.speaking = false;
        }
        if (npc.gestureT <= 0) {
          if (npc.speaking) { if (!npc.talking) { npc.talking = true; play(npc, 'talk', 0.35); } }
          else if (!npc.hushed) {                                 // all said: her idle; after a goodbye, back to work
            npc.hushed = true; npc.talking = false; play(npc, 'idle', 0.5);
            if (npc.mode === 'leave') backToWork(npc);
          }
        }
      }
      // where she is
      const fy = floor(npc, npc.x, npc.z);
      o.position.set(npc.x, fy, npc.z);
      o.rotation.y = npc.yaw;
      npc.col[0] = npc.x; npc.col[1] = npc.z;
      if (npc.storey >= 0) { npc.col[3] = fy - 0.6; npc.col[4] = fy + 1.9; }
      n.set(floor(npc, npc.x - 0.3, npc.z) - floor(npc, npc.x + 0.3, npc.z), 0.6, floor(npc, npc.x, npc.z - 0.3) - floor(npc, npc.x, npc.z + 0.3)).normalize();
      npc.blob.position.set(npc.x, o.position.y + 0.03, npc.z); npc.blob.quaternion.setFromUnitVectors(Y, n);
      // her pose: each turned bone back as its clip has it first (a clip only writes a bone whose value changes), then the clip
      for (const [b, q] of npc.held) b.quaternion.copy(q);
      npc.ch.update(dt);
      for (const [b, q] of npc.held) q.copy(b.quaternion);
      o.updateMatrixWorld(true);
      // where she looks (in her body's frame: yaw about up, pitch up from level): at Vivi's face while they talk, or
      // when Vivi comes close while she works; about her, now and then, while she stands; else where her clip looks
      let yaw = 0, pitch = 0;
      const talking = npc.mode === 'meet' || npc.mode === 'leave' || npc.mode === 'hail';
      if (npc.head && seen && d < (talking ? SEE + (npc.mode === 'hail' ? npc.hail.range : 0) : BUSY_SEE)) {
        npc.head.getWorldPosition(at);
        to.set(feet.x, feet.y + 1.55, feet.z).sub(at).applyAxisAngle(Y, -o.rotation.y);      // (her eyes: Vivi is 1.75 m)
        const ly = Math.atan2(to.x, to.z), lp = Math.atan2(to.y, Math.hypot(to.x, to.z));
        if (Math.abs(ly) < 2.2) { yaw = ly; pitch = lp; }                          // (not one behind her)
      } else if (npc.glance) {
        if ((npc.glanceT -= dt) <= 0) { npc.glanceT = 1.1 + Math.random() * 1.5; npc.glanceAt = Math.random() < 0.25 ? [0, 0] : [(Math.random() * 2 - 1) * 0.95, -0.1 + Math.random() * 0.28]; }
        [yaw, pitch] = npc.glanceAt;
      }
      const L = npc.look, hy = clamp(yaw, -HEAD_YAW, HEAD_YAW), hp = clamp(pitch, -HEAD_DOWN, HEAD_UP);
      L.yaw += (hy - L.yaw) * Math.min(1, dt * 3.5);
      L.pitch += (hp - L.pitch) * Math.min(1, dt * 3.5);
      L.eyeYaw += (clamp(yaw - L.yaw, -EYE_YAW, EYE_YAW) - L.eyeYaw) * Math.min(1, dt * 14);
      L.eyePitch += (clamp(pitch - L.pitch, -EYE_PITCH, EYE_PITCH) - L.eyePitch) * Math.min(1, dt * 14);
      turn(o, npc.neck, L.yaw * 0.4, L.pitch * 0.4);
      turn(o, npc.head, L.yaw * 0.6, L.pitch * 0.6);
      for (const e of npc.eyes) turn(o, e, L.eyeYaw, L.eyePitch);
      npc.ch.updateSprings(dt);
      // indoors she is lit by the room (the guild's hall: by night its lamps), not by the hour (cloud-shadows.js, uIndoor)
      const lit = npc.ch.indoor, room = npc.storey >= 0 && level.guild && level.guild.roomLight;
      if (lit) { lit.w += ((room ? 1 : 0) - lit.w) * Math.min(1, dt * 4); if (room) lit.set(room.x, room.y, room.z, lit.w); }
    }
    bubbles.update(dt, (id, out) => {
      const npc = list.find(m => m.id === id);
      if (!npc || !npc.object.visible || !npc.head) return false;
      npc.head.getWorldPosition(out); out.y += 0.16;
      return true;
    });
  }

  const first = list[0];
  return {
    list, update,
    // on the trial Vivi starts where she can watch the first of them at her work
    spot: first && first.start ? { ...first.start } : null,
    dispose() {
      bubbles.clear();
      for (const npc of list) {
        scene.remove(npc.object, npc.blob); npc.blob.material.dispose(); npc.ch.dispose();
        const k = level.colliders.indexOf(npc.col);
        if (k >= 0) level.colliders.splice(k, 1);
      }
      blobGeo.dispose(); blobTex.dispose();
    },
  };
}
