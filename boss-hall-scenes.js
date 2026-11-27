/* ==========================================================================
   boss-hall-scenes.js  —  the boss hall's two scenes: the door opening, and the statues waking

     const scenes = createBossScenes({ hall, player, level, camera, heard, onScene })
     every frame, after player.update(dt):  const held = scenes.update(dt)   // true: a scene has the camera this frame
     scenes.reset('closed' | 'open' | 'awake')   // the hall as it is before the door, with the door open, or awake
     scenes.state                                // 'closed', 'opening', 'open', 'waking', 'awake'

   The door (she walks up to it, within 7 m, from the vestibule): she is held where she stands; the camera comes down low
   beside her and looks up at the door; its runes wake, its bar gives, the two leaves grind open; then the fires catch, pair by
   pair, from the door to the throne (hall.fx.front runs north), the runes down the way and round the pillars with them, while
   the camera rises behind her and looks down the nave; then it is hers again. About 7.5 s.
   The statues (the door open, she steps into the rune circle): she is held; a boom, the circle flares; the fires flare and
   turn red; the camera goes low behind her toward the throne, then round the circle and up, as the statues' eyes light one
   after another from the throne's side; the throne's runes burn. Then a drone and a heart beating under it. About 6 s.
   The boss is not made yet: once awake, the hall stays awake (a button puts it back).
   onScene(name or null): when a scene begins and ends (the page dims its buttons, draws the bars).
   ========================================================================== */
import * as THREE from 'three';

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeIO = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const span = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

export function createBossScenes({ hall, player, level, camera, heard = null, onScene = () => {} }) {
  const L = hall.layout, fx = hall.fx, D = L.door;
  const C = new THREE.Vector2(L.circle.c[0], L.circle.c[1]);
  const throne = new THREE.Vector3(L.throne.x, L.throne.y + 4.5, L.throne.z);
  let state = 'closed', scene = null;
  const hold = { x: 0, z: 0, h: 0 };
  // camera poses: where it is and which way it looks (a quaternion), blended between
  const dummy = new THREE.PerspectiveCamera();               // (a camera: its lookAt turns its -z to the mark, as the real one's)
  const pose = (p, look) => { dummy.position.copy(p); dummy.lookAt(look); return { p: p.clone(), q: dummy.quaternion.clone() }; };
  const mix = (a, b, t, outP, outQ) => { outP.lerpVectors(a.p, b.p, t); outQ.copy(a.q).slerp(b.q, t); };
  const fromPlayer = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  const livePlayer = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  const outP = new THREE.Vector3(), outQ = new THREE.Quaternion();

  function setDoorShut(shut) {
    const cs = level.colliders;
    for (const c of hall.doorColliders) {
      const i = cs.indexOf(c);
      if (shut && i < 0) cs.push(c);
      if (!shut && i >= 0) cs.splice(i, 1);
    }
  }
  function reset(mode) {
    scene = null;
    const awake = mode === 'awake', open = mode !== 'closed';
    Object.assign(fx, { front: open ? -999 : 999, door: open ? 1 : 0, doorGlow: open ? 0.6 : 0.35, wake: awake ? 1 : 0, eyes: awake ? 1 : 0,
      circle: awake ? 1.1 : 0.3, throne: awake ? 1 : 0, flare: 0 });
    setDoorShut(!open);
    if (heard) heard.dread(awake);
    state = awake ? 'awake' : open ? 'open' : 'closed';
    onScene(null);
  }
  reset('closed');

  function begin(kind) {
    scene = { kind, t: 0, fired: new Set() };
    dispatchEvent(new Event('blur'));                       // (player-input.js lets go of the stick and the keys)
    hold.x = player.position.x; hold.z = player.position.z; hold.h = player.heading;
    fromPlayer.p.copy(camera.position); fromPlayer.q.copy(camera.quaternion);
    state = kind === 'door' ? 'opening' : 'waking';
    // the shots, from where she stands
    const her = new THREE.Vector3(hold.x, player.position.y, hold.z);
    if (kind === 'door') {
      const doorTop = new THREE.Vector3(0, 6.2, D.wall[1]);
      const inside = (x) => Math.max(-4.6, Math.min(4.6, x));          // (the vestibule is 12 m wide: the camera stays in it)
      scene.shots = {
        low: pose(new THREE.Vector3(inside(her.x + 1.5), her.y + 0.45, her.z + 2.4), doorTop),
        push: pose(new THREE.Vector3(inside(her.x + 0.9), her.y + 0.85, her.z + 1.3), new THREE.Vector3(0, 5.2, D.wall[0] - 1)),
        nave: pose(new THREE.Vector3(her.x * 0.3, her.y + 3.2, her.z + 5.5), new THREE.Vector3(0, 1.4, her.z - 16)),
      };
    } else {
      const dir = new THREE.Vector3(throne.x - her.x, 0, throne.z - her.z).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      scene.dir = dir; scene.side = side; scene.her = her;
      scene.shots = { low: pose(her.clone().addScaledVector(dir, -3.2).addScaledVector(side, 0.9).add(new THREE.Vector3(0, 0.7, 0)), throne) };
    }
    onScene(kind);
  }

  function holdHer() {
    if (Math.hypot(player.position.x - hold.x, player.position.z - hold.z) > 0.03) player.teleport(hold.x, hold.z, hold.h);
  }
  function fireCaught(prev, next) {                        // the fires the front passed this frame: each heard as it catches
    if (!heard) return;
    for (const f of L.fires) {
      if (f.kind === 'door') continue;
      const at = f.z + 2.0;
      if (prev > at && next <= at) {
        const d = Math.hypot(f.x - hold.x, f.z - hold.z);
        heard.whoosh(Math.max(-1, Math.min(1, f.x / 6)), 1.4 / (1 + d * 0.08), f);
      }
    }
  }

  function doorScene(dt) {
    const s = scene, t = (s.t += dt), once = (k, at, fn) => { if (t >= at && !s.fired.has(k)) { s.fired.add(k); fn(); } };
    once('hum', 0.0, () => heard && heard.hum());
    once('clunk', 0.85, () => heard && heard.clunk());
    once('rumble', 1.0, () => heard && heard.rumble(3.1));
    once('thud', 4.05, () => heard && heard.thud());
    once('free', 2.6, () => setDoorShut(false));
    fx.doorGlow = 0.35 + 1.4 * ease(span(t, 0, 1.0)) - 0.9 * ease(span(t, 4.2, 6.0));
    // the leaves: a jolt as the bar gives, then the long slow swing
    const o = span(t, 1.0, 4.0);
    fx.door = 0.04 * ease(span(t, 0.85, 1.05)) + 0.96 * easeIO(o);
    const prev = fx.front;
    fx.front = t < 2.4 ? 999 : (D.wall[1] + 1.5) - (t - 2.4) * 18;
    fireCaught(prev === 999 ? D.wall[1] + 2 : prev, fx.front);
    // the camera: low beside her looking up at the door; in a little; then up behind her, down the nave; then hers
    const S = s.shots;
    if (t < 0.9) mix(fromPlayer, S.low, easeIO(span(t, 0, 0.9)), outP, outQ);
    else if (t < 3.7) mix(S.low, S.push, ease(span(t, 0.9, 3.7)), outP, outQ);
    else if (t < 6.4) mix(S.push, S.nave, easeIO(span(t, 3.7, 6.4)), outP, outQ);
    else mix(S.nave, livePlayer, easeIO(span(t, 6.4, 7.5)), outP, outQ);
    if (t >= 7.5) { state = 'open'; scene = null; fx.front = -999; onScene(null); return false; }
    return true;
  }

  function wakeScene(dt) {
    const s = scene, t = (s.t += dt), once = (k, at, fn) => { if (t >= at && !s.fired.has(k)) { s.fired.add(k); fn(); } };
    once('boom', 0.0, () => heard && heard.boom());
    once('dread', 2.0, () => heard && heard.dread(true));
    fx.circle = 0.3 + 2.4 * ease(span(t, 0, 0.25)) - 1.6 * ease(span(t, 0.25, 1.6));
    fx.flare = ease(span(t, 0.3, 0.9)) * (1 - 0.8 * ease(span(t, 1.4, 3.0)));
    fx.wake = ease(span(t, 0.35, 2.2));
    const e0 = fx.eyes;
    fx.eyes = 0.85 * span(t, 0.9, 4.4);
    for (let k = 0; k < 8; k++) {                         // each statue's eyes heard as they light
      const at = k * 0.1 + 0.05;
      if (e0 < at && fx.eyes >= at && heard) heard.shing(k);
    }
    fx.throne = ease(span(t, 1.2, 2.4));
    // the camera: low behind her toward the throne; then round the circle and up, so the statues are seen as they wake
    const her = s.her, look = new THREE.Vector3(her.x, her.y + 2.4, her.z);
    if (t < 0.8) mix(fromPlayer, s.shots.low, easeIO(span(t, 0, 0.8)), outP, outQ);
    else if (t < 5.0) {
      const u = easeIO(span(t, 0.8, 5.0));
      const a0 = Math.atan2(-s.dir.x, -s.dir.z), a = a0 + u * 2.6;            // from behind her, round
      const r = 3.4 + u * 6.0, y = her.y + 0.8 + u * 3.2;
      const p = new THREE.Vector3(her.x + Math.sin(a) * r, y, her.z + Math.cos(a) * r);
      const lk = look.clone().lerp(new THREE.Vector3(C.x, 5.0, C.y), u * 0.6);
      const P = pose(p, lk);
      if (t < 1.4) mix(s.shots.low, P, ease(span(t, 0.8, 1.4)), outP, outQ); else { outP.copy(P.p); outQ.copy(P.q); }
      s.last = P;
    } else mix(s.last, livePlayer, easeIO(span(t, 5.0, 6.1)), outP, outQ);
    if (t >= 6.1) { state = 'awake'; scene = null; fx.flare = 0; fx.eyes = 1; onScene(null); return false; }
    return true;
  }

  return {
    get state() { return state; },
    get active() { return !!scene; },
    reset,
    update(dt) {
      // the player's own camera this frame (what it would show): where a scene hands the camera back to
      livePlayer.p.copy(camera.position); livePlayer.q.copy(camera.quaternion);
      if (!scene) {
        const p = player.position;
        if (state === 'closed' && p.z > D.wall[1] && Math.hypot(p.x, p.z - D.wall[1]) < 7.0) begin('door');
        else if (state === 'open' && Math.hypot(p.x - C.x, p.z - C.y) < 6.2 && player.grounded !== false) begin('wake');
        if (!scene) return false;
      }
      holdHer();
      const held = scene.kind === 'door' ? doorScene(dt) : wakeScene(dt);
      camera.position.copy(outP); camera.quaternion.copy(outQ);
      return held || true;
    },
  };
}
