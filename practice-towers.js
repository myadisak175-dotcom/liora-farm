/* ==========================================================================
   practice-towers.js  —  practice towers for the barrier that throws a blow back (barrier-reflect.js): a crystal over a
   stone post (or floating by itself) that throws the clip's bolt at her when asked. A bolt that meets the barrier is
   taken there; the barrier bursts and throws it back, and the tower it comes back to is struck and reels a moment. A bolt
   that meets her strikes her. Kept so the barrier can be tried where nothing else throws anything at her yet: its trial
   page (barrier-reflect.html) and the game (?towers=1, index.html). One job: the towers and their bolts. What the bolts
   look like, and the flashes, are barrier-reflect-fx.js' (fx.bolts, fx.impact); heard, barrier-reflect-sounds.js'.

     const towers = createPracticeTowers({ heightAt, fx, barrier, heard, her, spots, post })
       heightAt(x, z): the ground. her(): { feet, size }: where her feet are now (a Vector3), how big she is (1 at 1.75 m).
       spots: [[x, z], ...] where they stand (none: placeAround, later). post: a stone post under each (true), or the
       crystal floats by itself (false: nothing to walk into where nothing keeps her out of it)
     scene.add(towers.object)
     every frame: towers.update(dt, time)       time: the game's own clock (s), for their bobbing
     towers.fire(i or a tower, wait)            the tower gathers its bolt and throws it at her chest (true if it can)
     towers.fireOne(camera)                     the one most in view;   towers.fireAll(): all of them, a beat apart
     towers.placeAround(feet, yaw)              stand them round her as on the trial page (yaw: the way that is ahead)
     towers.thrownBack({ at, blows })           the barrier burst (barrier.onReflect): each blow back at its tower
     towers.onTaken(), towers.onHit(at, from), towers.onStun(tower), towers.onBusy()     for the page to show and shake
     towers.list, towers.shots, towers.colliders ([x, z, r] each, with posts), towers.near(feet) (m to the nearest)

   The bolts (SHOT): gathered SHOT.charge s at the crystal, then at 24 m/s (the clip's) for at most 34 m; thrown back,
   44 m/s, finding their tower. Her: a rod from her shins to her head, 0.32 m round it.
   ========================================================================== */
import * as THREE from 'three';

export const SHOT = { charge: 0.32, speed: 24, len: 2.4, wide: 0.3, range: 34, backSpeed: 44, backLen: 3.2, backWide: 0.22 };
// where they stand round her on the trial page (she at 0, 0, facing +z): [angle from ahead (rad), m off]
const ROUND = [[-0.654, 10.83], [0.864, 10.78], [2.003, 11.45]];
export const TOWER_SPOTS = ROUND.map(([a, d]) => [Math.sin(a) * d, Math.cos(a) * d]);

// lit as the game lights (one edge between light and shade)
const LIT_VERT = /* glsl */`
  attribute vec3 color;
  varying vec3 vC, vN;
  void main() { vC = color; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LIT_FRAG = /* glsl */`
  varying vec3 vC, vN;
  void main() {
    float d = dot(normalize(vN), normalize(vec3(-0.4, 0.9, 0.5))) * 0.5 + 0.5;
    gl_FragColor = vec4(vC * mix(vec3(0.66, 0.66, 0.8), vec3(1.03, 1.01, 0.97), smoothstep(0.43, 0.47, d)), 1.0);
  }`;
const CRYSTAL_VERT = 'varying vec3 vN, vW; void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const CRYSTAL_FRAG = /* glsl */`
  uniform float uGlow, uDark;
  varying vec3 vN, vW;
  void main() {
    vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
    float d = dot(n, normalize(vec3(-0.4, 0.9, 0.5))) * 0.5 + 0.5;
    vec3 col = mix(vec3(0.24, 0.5, 0.72), vec3(0.62, 0.9, 1.0), smoothstep(0.4, 0.62, d));
    col += vec3(0.5, 0.9, 1.0) * pow(1.0 - abs(dot(n, v)), 2.0) * 0.55;
    col = mix(col, vec3(1.0), uGlow * 0.75);
    col = mix(col, vec3(0.15, 0.17, 0.23) + 0.12 * pow(1.0 - abs(dot(n, v)), 2.0), uDark);
    gl_FragColor = vec4(col, 1.0);
  }`;
const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const tint = (g, h) => { const c = hex(h), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };

export function createPracticeTowers({ heightAt, fx, barrier, heard = null, her, spots = TOWER_SPOTS, post = true }) {
  const object = new THREE.Group();
  object.name = 'practiceTowers';
  const lit = new THREE.ShaderMaterial({ vertexShader: LIT_VERT, fragmentShader: LIT_FRAG });
  const made = [lit];
  const list = spots.map(([x, z], i) => {
    const g = new THREE.Group();
    if (post) {
      g.add(new THREE.Mesh(tint(new THREE.CylinderGeometry(0.42, 0.52, 0.62, 6).translate(0, 0.31, 0), '#8f95a3'), lit));
      g.add(new THREE.Mesh(tint(new THREE.CylinderGeometry(0.33, 0.4, 0.13, 6).translate(0, 0.68, 0), '#a8aebb'), lit));
    }
    const mat = new THREE.ShaderMaterial({ uniforms: { uGlow: { value: 0 }, uDark: { value: 0 } }, vertexShader: CRYSTAL_VERT, fragmentShader: CRYSTAL_FRAG });
    made.push(mat);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0).scale(1, 1.65, 1), mat);
    crystal.position.y = 1.32;
    g.add(crystal);
    g.position.set(x, heightAt(x, z) - 0.05, z);
    object.add(g);
    return { i, group: g, crystal, u: mat.uniforms, position: new THREE.Vector3(x, heightAt(x, z) + 1.32, z), charging: false, charge: 0, stun: -1, spin: i * 2.1 };
  });
  const colliders = post ? list.map(t => [t.group.position.x, t.group.position.z, 0.62]) : [];

  const shots = [];
  let seedTurn = 1;
  const chest = (out = new THREE.Vector3()) => { const h = her(); return out.copy(h.feet).add(new THREE.Vector3(0, 1.02 * h.size, 0)); };
  function fire(t, wait = 0) {
    if (typeof t === 'number') t = list[t];
    if (!t || t.stun >= 0 || t.charging) return false;
    t.charging = true; t.charge = -wait;   // (counts up: it gathers from 0, throws at SHOT.charge)
    return true;
  }
  function throwFrom(t) {
    const from = t.position.clone();
    const way = chest().sub(from).normalize();
    shots.push({ kind: 0, pos: from.clone(), way, speed: SHOT.speed, went: 0, tower: t, from, seed: seedTurn++ * 0.37 });
    if (heard) heard.shot(Math.min(1, 9 / Math.max(4, from.distanceTo(her().feet))));
  }
  function thrownBack({ at, blows }) {
    for (const b of blows) {
      const t = b.source;
      if (!t || !list.includes(t)) continue;
      shots.push({ kind: 1, pos: at.clone(), way: t.position.clone().sub(at).normalize(), speed: SHOT.backSpeed, went: 0, tower: t, from: at.clone(), seed: seedTurn++ * 0.37 });
    }
  }
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), q = new THREE.Vector3(), axisA = new THREE.Vector3(), axisB = new THREE.Vector3(), ab = new THREE.Vector3(), on = new THREE.Vector3();
  function stepShots(dt) {
    const out = [], h = her();
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (s.kind === 1) s.way.copy(s.tower.position).sub(s.pos).normalize();      // (thrown back: it finds its tower)
      p0.copy(s.pos); p1.copy(s.pos).addScaledVector(s.way, s.speed * dt);
      let gone = false;
      if (s.kind === 0) {
        const at = barrier.meet(p0, p1);
        if (at && barrier.strike(at, s.from, s.tower)) { gone = true; if (api.onTaken) api.onTaken(); }
        else {
          // her: a rod from her shins to her head, 0.32 m round it
          axisA.copy(h.feet).y += 0.3 * h.size; axisB.copy(h.feet).y += 1.5 * h.size; ab.subVectors(axisB, axisA);
          for (let k = 1; k <= 4 && !gone; k++) {
            q.lerpVectors(p0, p1, k / 4);
            const t = THREE.MathUtils.clamp(on.subVectors(q, axisA).dot(ab) / ab.lengthSq(), 0, 1);
            if (q.distanceTo(on.copy(axisA).addScaledVector(ab, t)) < 0.32 * h.size) {
              fx.impact(q.clone(), s.from, 0.8 * h.size);
              if (heard) heard.thud(1);
              if (api.onHit) api.onHit(q.clone(), s.from);
              gone = true;
            }
          }
        }
        if (!gone && (s.went > SHOT.range || p1.y < heightAt(p1.x, p1.z))) { fx.impact(p1.clone(), s.from, 0.5); gone = true; }
      } else if (p1.distanceTo(s.tower.position) < 0.35 || s.pos.distanceTo(s.tower.position) < s.speed * dt) {
        fx.impact(s.tower.position.clone(), s.from, 1.0);
        s.tower.stun = 0; s.tower.charging = false;
        if (heard) heard.thud(Math.min(1, 9 / Math.max(4, s.tower.position.distanceTo(h.feet))));
        if (api.onStun) api.onStun(s.tower);
        gone = true;
      }
      if (gone) { shots.splice(i, 1); continue; }
      s.pos.copy(p1); s.went += s.speed * dt;
      const L = s.kind ? SHOT.backLen : SHOT.len;
      out.push({ head: s.pos, way: s.way, kind: s.kind, len: Math.min(L, s.went + 0.05), wide: s.kind ? SHOT.backWide : SHOT.wide, seed: s.seed });
    }
    // a tower gathering its bolt: a ball of light growing at its crystal
    for (const t of list) if (t.charging && t.charge >= 0) {
      const way = chest().sub(t.position).normalize();
      out.push({ head: t.position.clone().addScaledVector(way, 0.32), way, kind: 0, len: 0.02, wide: 0.05 + 0.15 * Math.min(1, t.charge / SHOT.charge), seed: t.i });
    }
    fx.bolts(out);
  }
  function stepTowers(dt, time) {
    for (const t of list) {
      let y = 1.32 + 0.05 * Math.sin(time * 1.6 + t.i * 2), glow = 0, dark = 0, spin = 0.6;
      if (t.charging) {
        t.charge += dt;
        if (t.charge >= 0) glow = 0.25 + 0.6 * Math.min(1, t.charge / SHOT.charge) + 0.15 * Math.sin(time * 40);
        if (t.charge >= SHOT.charge) { throwFrom(t); t.charging = false; }
      }
      if (t.stun >= 0) {
        // struck: a flash, it goes dark and sinks, spinning hard, and comes up again
        t.stun += dt;
        const s = t.stun;
        glow = Math.max(0, 1 - s / 0.12);
        dark = THREE.MathUtils.smoothstep(s, 0.06, 0.2) * (1 - THREE.MathUtils.smoothstep(s, 1.2, 1.6));
        const fall = THREE.MathUtils.smoothstep(s, 0.04, 0.3) * (1 - THREE.MathUtils.smoothstep(s, 1.1, 1.5));
        y = THREE.MathUtils.lerp(y, 0.98, fall) + Math.abs(Math.sin(s * 9)) * 0.08 * Math.max(0, 1 - s * 2);
        spin = 14 * Math.exp(-s * 2.2) + 0.6;
        t.crystal.rotation.z = 0.5 * fall;
        if (s > 1.6) { t.stun = -1; t.crystal.rotation.z = 0; }
      }
      t.spin += spin * dt;
      t.crystal.position.y = y; t.crystal.rotation.y = t.spin;
      t.position.set(t.group.position.x, t.group.position.y + y, t.group.position.z);
      t.u.uGlow.value = glow; t.u.uDark.value = dark;
    }
  }
  // the tower most in view (and free): the camera's way over the ground against the way to each
  const f = new THREE.Vector3(), w = new THREE.Vector3();
  function inView(camera) {
    camera.getWorldDirection(f); f.y = 0; f.normalize();
    let best = null, bd = -2;
    for (const t of list) {
      if (t.stun >= 0 || t.charging) continue;
      w.subVectors(t.position, camera.position); w.y = 0; w.normalize();
      const k = w.dot(f);
      if (k > bd) { bd = k; best = t; }
    }
    return best;
  }
  function placeAround(feet, yaw = 0) {
    shots.length = 0;
    list.forEach((t, i) => {
      const [a, d] = ROUND[i % ROUND.length], x = feet.x + Math.sin(yaw + a) * d, z = feet.z + Math.cos(yaw + a) * d;
      t.group.position.set(x, heightAt(x, z) - 0.05, z);
      t.position.set(x, heightAt(x, z) + 1.32, z);
      t.charging = false; t.stun = -1; t.crystal.rotation.z = 0;
      if (post) colliders[i] = [x, z, 0.62];
    });
  }

  const api = {
    object, list, shots, colliders,
    fire,
    fireOne(camera) { const t = inView(camera); if (t) return fire(t); if (api.onBusy) api.onBusy(); return false; },
    fireAll() { let n = 0; for (const t of list) if (fire(t, n * 0.06)) n++; if (!n && api.onBusy) api.onBusy(); return n > 0; },
    placeAround, thrownBack,
    near(feet) { let d = Infinity; for (const t of list) d = Math.min(d, Math.hypot(t.position.x - feet.x, t.position.z - feet.z)); return d; },
    update(dt, time) { stepTowers(dt, time); stepShots(dt); },
    onTaken: null, onHit: null, onStun: null, onBusy: null,
    dispose() {
      object.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      for (const m of made) m.dispose();
      object.removeFromParent();
    },
  };
  return api;
}
