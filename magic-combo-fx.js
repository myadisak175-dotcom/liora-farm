/* ==========================================================================
   magic-combo-fx.js  —  the light of Vivi's magic combo (magic-combo.js): an orb of light gathered in her hand and
   thrown, the ribbon it leaves, the wave a cut sends out, the burst where one lands, a few gold sparks. Sky blue with
   gold; made for this, not taken from her other spells. One job: draw them. It decides nothing: the combo says where.

     const fx = createMagicComboFx()
     scene.add(fx.object)             (a page that dims its land by night draws this after the dimming, as the circles)
     fx.glow(key, at, size)           light gathered at a hand: call it every frame it is there (key: any name, one glow
                                      each); a frame it is not called, it goes out
     fx.trail(key, at)                a ribbon through where a hand has been: call it every frame of a swing; it fades
                                      away behind by itself
     const shot = fx.shot(kind)       something thrown. kind 'orb' | 'big': an orb with a ribbon behind it, shedding a
                                      gold spark now and then; 'wave' | 'rise': the wave of a cut, a curved band of
                                      light seen from behind as a crescent (wave: leaning, as her cut came down; rise:
                                      standing, off an upward sweep); 'lance': a spear of light, held in her hand
                                      while it grows and then thrown (the same one: far 0 while she holds it)
       shot.place(at, dir, far)       every frame: where it is (a lance: its point), the way it goes (unit), how far
                                      it has come (m)
       shot.size(level)               a lance: how grown it is (0..3); shot.long: its length now (m)
       shot.end(hit)                  it is over: it landed (the combo then asks for a burst) or ran out (it fades)
     fx.burst(at, size)               where one lands: a flash, a ring going out, gold sparks
     fx.ring(at, radius)              a ring of light going out over the ground from `at` to `radius` (she lands a leap)
     fx.motes(at, n, from)            n gold sparks drawn in to `at` from `from` m away (light being gathered)
     fx.update(dt, camera)            every frame
     fx.setNight(on)                  by night its light is let shine more
     fx.dispose()

   How it is drawn: light laid over the picture with one blend (what a thing covers hides what is behind it, its glow
   only adds), every material marked userData.noGrade (the light of the hour and the curse leave it alone). An orb, a
   glow, a burst: one square turned to the camera, all of it worked out by its shader. A ribbon: a strip through up to
   20 places, turned to the camera on the way (a lance: the same, pointed at both ends). Sparks: one instanced square, moved by its shader. Few of anything: 8
   orbs, 4 waves, 3 lances, 3 rings, 6 bursts, 10 ribbons, 64 sparks at most. Phone-safe shaders: no arrays, no loops.
   ========================================================================== */
import * as THREE from 'three';

const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// the light: an orb's heart (near white), its body, the glow round it; the sparks
export const COMBO_LOOK = { core: '#f6fdff', main: '#74cfff', deep: '#2f8fe6', gold: '#ffd66e' };

const SHOTS = {
  orb: { size: 0.34, ribbon: 0.13, shed: 1.1 },          // the orb's own radius is about a third of its square's (m)
  big: { size: 0.95, ribbon: 0.3, shed: 0.7 },
  wave: { wide: 0.95, tall: 0.26, lean: -0.6 },         // half its width, half its height in the middle (m); radians it leans
  rise: { wide: 0.85, tall: 0.2, lean: Math.PI / 2 },
  lance: { long: [0.75, 1.05, 1.4, 1.8], thick: [0.05, 0.065, 0.085, 0.11], tip: [0.16, 0.2, 0.26, 0.34], ribbon: 0.1 },      // by how grown it is
};
const LANCE = 10;                                       // places along a lance
const RIBBON = 20, SPARKS = 64;
const BLEND = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation };

const FACING = /* glsl */`
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }`;

export function createMagicComboFx({ seed = 7 } = {}) {
  const object = new THREE.Group();
  object.name = 'magicComboFx';
  let s0 = seed >>> 0;
  const rand = () => { s0 = (s0 + 0x6d2b79f5) >>> 0; let t = s0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const colours = { uCore: { value: rgb(COMBO_LOOK.core) }, uMain: { value: rgb(COMBO_LOOK.main) }, uDeep: { value: rgb(COMBO_LOOK.deep) },
    uGold: { value: rgb(COMBO_LOOK.gold) }, uShine: { value: 1 } };          // shared by every material
  const square = new THREE.PlaneGeometry(2, 2);
  const made = [];
  const material = o => { const m = new THREE.ShaderMaterial({ depthWrite: false, ...BLEND, ...o }); m.userData.noGrade = true; made.push(m); return m; };
  const put = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.visible = false; object.add(m); return m; };

  // ---- an orb (thrown, or gathering at her hand): its heart covers what is behind it, its glow only adds
  const orbMat = () => material({
    uniforms: { ...colours, uSize: { value: 1 }, uK: { value: 1 }, uBeat: { value: 0 } },
    vertexShader: FACING,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uK, uShine, uBeat;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float body = 1.0 - smoothstep(0.24, 0.34, r);                      // the orb itself
        float rim = smoothstep(0.08, 0.32, r);                             // bluer toward its edge
        float glow = pow(max(0.0, 1.0 - r), 2.4) * (0.85 + 0.15 * uBeat);
        // four soft rays, the way a bright light looks
        float rays = pow(max(0.0, 1.0 - r), 3.0) * (pow(max(0.0, 1.0 - abs(vP.x) * 9.0), 2.0) + pow(max(0.0, 1.0 - abs(vP.y) * 9.0), 2.0)) * 0.5;
        // (its glow covers a little too: over bright grass it stays blue, not the grass's green lit up)
        vec3 col = mix(uCore, uMain, rim * 0.8) * body + (uMain * 0.8 + uDeep * 0.35) * (glow + rays) * (1.0 - body) * uShine;
        gl_FragColor = vec4(col * uK, (body * 0.95 + (1.0 - body) * min(1.0, glow * 1.6) * 0.5) * uK);
      }`,
  });
  const orbs = Array.from({ length: 8 }, () => ({ mesh: put(square, orbMat()), live: false, k: 0, kind: null, shed: 0, ribbon: null }));
  const glows = new Map();                                                 // key -> { mesh, seen, k, size }

  // ---- a ribbon: where something has been, newest first
  function makeRibbon() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(RIBBON * 2 * 3), uv = new Float32Array(RIBBON * 2 * 2), idx = [];
    for (let i = 0; i < RIBBON; i++) { uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < RIBBON - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const mat = material({
      uniforms: { ...colours, uK: { value: 1 } },
      side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uCore, uMain;
        uniform float uK, uShine;
        varying vec2 vUv;
        void main() {
          float along = 1.0 - vUv.x;                                       // 1 at its head, 0 where it ends
          float across = 1.0 - vUv.y * vUv.y;
          float a = along * along * across;
          vec3 col = mix(uMain, uCore, across * across * along);
          gl_FragColor = vec4(col * a * uK * (0.7 + 0.3 * uShine), a * 0.6 * uK);
        }`,
    });
    return { mesh: put(geo, mat), pts: [], width: 0.1, life: 0.14, used: false, key: null };
  }
  const ribbons = Array.from({ length: 10 }, makeRibbon);
  function takeRibbon(width, life, key = null) {
    const r = ribbons.find(o => !o.used && !o.pts.length) || ribbons.find(o => !o.used) || ribbons[0];
    r.pts.length = 0; r.width = width; r.life = life; r.used = true; r.key = key; r.seen = true;
    return r;
  }
  function feed(r, at) {
    const p = r.pts[0];
    if (p && p.age < 0.012 && p.at.distanceToSquared(at) < 0.0009) { p.at.copy(at); return; }
    r.pts.unshift({ at: at.clone(), age: 0 });
    if (r.pts.length > RIBBON) r.pts.length = RIBBON;
  }

  // ---- the wave of a cut: a piece of a round wall, bowed forward, tallest in the middle and gone to nothing at its ends
  const waveGeo = (() => {
    const N = 24, A = 1.05, pos = [], uv = [], idx = [];                   // (half its angle: 60 degrees)
    for (let i = 0; i <= N; i++) {
      const u = i / N * 2 - 1, th = u * A, h = Math.pow(Math.cos(u * Math.PI / 2), 0.7);
      for (const v of [-1, 1]) { pos.push(Math.sin(th) / Math.sin(A), v * h, (Math.cos(th) - 1) / Math.sin(A)); uv.push(u, v); }
    }
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  })();
  const waveMat = () => material({
    uniforms: { ...colours, uK: { value: 1 }, uAge: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uK, uShine, uAge;
      varying vec2 vUv;
      void main() {
        float ends = 1.0 - pow(abs(vUv.x), 2.5);
        float v = abs(vUv.y);
        float heart = 1.0 - smoothstep(0.0, 0.42, v);                      // the bright line along its middle
        float body = 1.0 - smoothstep(0.35, 1.0, v);
        // light running along it, so that it is not a still shape
        float run = 0.82 + 0.18 * sin(vUv.x * 9.0 - uAge * 30.0);
        vec3 col = mix(uMain, uCore, heart) * body + uDeep * (1.0 - body) * 0.3;
        float a = body * ends * run;
        gl_FragColor = vec4(col * a * uK * (0.75 + 0.35 * uShine), a * (0.45 + 0.5 * heart) * uK);
      }`,
  });
  const waves = Array.from({ length: 4 }, () => ({ mesh: put(waveGeo, waveMat()), live: false, k: 0, kind: null, age: 0 }));

  // ---- a burst: a flash, and a ring going out
  const burstMat = () => material({
    uniforms: { ...colours, uSize: { value: 1 }, uT: { value: 0 } },
    depthTest: false,
    vertexShader: FACING,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uT, uShine;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float out_ = 1.0 - pow(1.0 - uT, 3.0);                             // fast at first
        float R = 0.18 + 0.72 * out_;
        float w = 0.05 + 0.07 * (1.0 - uT);
        float ring = (1.0 - smoothstep(0.0, w, abs(r - R))) * (1.0 - uT) * (1.0 - uT);
        float flash = pow(max(0.0, 1.0 - r / (0.3 + 0.5 * out_)), 1.6) * pow(1.0 - uT, 3.0);
        // eight short rays out of the middle, gone at once
        float ang = atan(vP.y, vP.x);
        float rays = pow(abs(cos(ang * 4.0)), 24.0) * (1.0 - smoothstep(0.1, 0.25 + 0.7 * out_, r)) * pow(1.0 - uT, 2.0);
        vec3 col = uCore * (flash * 1.2 + rays * 0.8) + mix(uMain, uCore, 0.35) * ring + uDeep * flash * 0.4;
        gl_FragColor = vec4(col * (0.75 + 0.45 * uShine), clamp(flash * 0.7 + ring * 0.4, 0.0, 1.0));
      }`,
  });
  const bursts = Array.from({ length: 6 }, () => ({ mesh: put(square, burstMat()), t: 1, life: 0.3 }));

  // ---- a lance: a strip from its tail to its point, widest two thirds of the way along, turned to the camera
  function makeLance() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(LANCE * 2 * 3), uv = new Float32Array(LANCE * 2 * 2), idx = [];
    for (let i = 0; i < LANCE; i++) { uv[i * 4] = uv[i * 4 + 2] = i / (LANCE - 1); uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < LANCE - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = material({
      uniforms: { ...colours, uK: { value: 1 } },
      side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uCore, uMain, uDeep;
        uniform float uK, uShine;
        varying vec2 vUv;
        void main() {
          float across = 1.0 - vUv.y * vUv.y;
          float heart = smoothstep(0.45, 0.95, across);                     // the white line down its middle
          float a = pow(across, 0.6) * (0.4 + 0.6 * vUv.x);                 // brighter toward its point
          vec3 col = mix(mix(uDeep, uMain, across), uCore, heart);
          gl_FragColor = vec4(col * a * uK * (0.8 + 0.3 * uShine), a * (0.4 + 0.55 * heart) * uK);
        }`,
    });
    return { mesh: put(geo, mat), live: false, k: 0, level: 0, long: 0, grown: 0, tip: null, ribbon: null, head: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1) };
  }
  const lances = Array.from({ length: 3 }, makeLance);

  // ---- a ring over the ground: going out from the middle, thinning as it goes
  const flat = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const ringMat = () => material({
    uniforms: { ...colours, uT: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uT, uShine;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float out_ = 1.0 - pow(1.0 - uT, 2.5);
        float R = 0.12 + 0.84 * out_;
        float w = 0.035 + 0.1 * (1.0 - uT);
        float edge = 1.0 - smoothstep(0.0, w, abs(r - R));
        float wash = (1.0 - smoothstep(0.0, R, r)) * 0.22 * (1.0 - uT);      // a little light inside it, at first
        float a = (edge + wash) * (1.0 - uT * uT);
        vec3 col = mix(uMain, uCore, edge * 0.7) + uDeep * wash;
        gl_FragColor = vec4(col * a * (0.75 + 0.4 * uShine), a * 0.5);
      }`,
  });
  const rings = Array.from({ length: 3 }, () => ({ mesh: put(flat, ringMat()), t: 1, life: 0.4 }));

  // ---- sparks: gold, four-pointed; thrown out, slowing, falling a little, going out (all in the shader)
  const sGeo = new THREE.InstancedBufferGeometry();
  sGeo.index = square.index;
  sGeo.setAttribute('position', square.attributes.position);
  const sAt = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sVel = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sData = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 4), 4).setUsage(THREE.DynamicDrawUsage);      // born, life, size, turn
  for (let j = 0; j < SPARKS; j++) sData.setXYZW(j, -1000, 1, 0, 0);                                                      // (none yet)
  sGeo.setAttribute('aAt', sAt); sGeo.setAttribute('aVel', sVel); sGeo.setAttribute('aData', sData);
  sGeo.instanceCount = SPARKS;
  const sMat = material({
    uniforms: { ...colours, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 aAt, aVel;
      attribute vec4 aData;
      uniform float uTime;
      varying vec2 vP;
      varying float vU;
      void main() {
        float age = uTime - aData.x, u = age / aData.y;
        float on = step(0.0, age) * step(u, 1.0);
        float slow = (1.0 - exp(-3.0 * age)) / 3.0;                        // (how far it has come, slowing as it goes)
        vec3 p = aAt + aVel * slow - vec3(0.0, 0.7 * age * age, 0.0);
        float twinkle = 0.7 + 0.3 * sin(uTime * 26.0 + aData.w * 50.0);
        float s = aData.z * on * smoothstep(0.0, 0.12, u) * pow(max(0.0, 1.0 - u), 0.6) * twinkle;
        float c = cos(aData.w), sn = sin(aData.w);
        vP = position.xy; vU = u;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        mv.xy += mat2(c, -sn, sn, c) * position.xy * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uGold;
      uniform float uShine;
      varying vec2 vP;
      varying float vU;
      void main() {
        vec2 q = abs(vP);
        float star = max(0.0, 1.0 - (q.x * q.y * 30.0 + (q.x + q.y) * 0.95));
        float heart = 1.0 - smoothstep(0.0, 0.2, length(vP));
        float a = clamp(star + heart, 0.0, 1.0);
        vec3 col = mix(uGold, uCore, heart * 0.8);
        gl_FragColor = vec4(col * a * (0.8 + 0.4 * uShine), a * 0.55);
      }`,
  });
  const sparks = put(sGeo, sMat);
  sparks.visible = true;
  let sNext = 0, time = 0;
  function spark(at, vx, vy, vz, life, size) {
    const j = sNext; sNext = (sNext + 1) % SPARKS;
    sAt.setXYZ(j, at.x, at.y, at.z); sVel.setXYZ(j, vx, vy, vz); sData.setXYZW(j, time, life, size, rand() * 6.283);
    sAt.needsUpdate = sVel.needsUpdate = sData.needsUpdate = true;
  }
  // n sparks thrown out from a place, every way (up a little more than down)
  function scatter(at, n, speed, size) {
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.283, z = rand() * 1.6 - 0.6, r = Math.sqrt(Math.max(0, 1 - Math.min(1, z * z))), v = speed * (0.55 + 0.6 * rand());
      spark(at, Math.cos(a) * r * v, z * v + 0.6, Math.sin(a) * r * v, 0.35 + 0.3 * rand(), size * (0.7 + 0.6 * rand()));
    }
  }

  const tmp = new THREE.Vector3(), side = new THREE.Vector3(), tan = new THREE.Vector3(), toCam = new THREE.Vector3();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), basis = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);

  const fx = {
    object,
    glow(key, at, size) {
      let g = glows.get(key);
      if (!g) { g = { mesh: put(square, orbMat()), seen: false, k: 0, size: 0 }; glows.set(key, g); }
      g.mesh.position.copy(at); g.seen = true; g.size = size;
    },
    trail(key, at) {
      let r = ribbons.find(o => o.used && o.key === key);
      if (!r) r = takeRibbon(0.07, 0.16, key);
      r.seen = true;
      feed(r, at);
    },
    shot(kind) {
      const def = SHOTS[kind] || SHOTS.orb;
      if (def.long) {
        const l = lances.find(o => !o.mesh.visible) || lances[0];
        l.live = true; l.k = 1; l.level = 0; l.grown = 0; l.long = def.long[0]; l.mesh.visible = true;
        l.tip = orbs.find(v => !v.mesh.visible) || orbs[0];
        l.tip.live = true; l.tip.k = 1; l.tip.kind = { size: def.tip[0] }; l.tip.mesh.visible = true; l.tip.ribbon = null;
        l.ribbon = null;
        return {
          get long() { return l.long; },
          size(level) { l.level = Math.max(0, Math.min(3, level)); },
          place(at, dir, far = 0) {
            l.head.copy(at); l.dir.copy(dir).normalize();
            l.tip.mesh.position.copy(at);
            if (far > 0) { if (!l.ribbon) l.ribbon = takeRibbon(def.ribbon + 0.04 * l.level, 0.1); feed(l.ribbon, at); }
          },
          end() { l.live = false; l.tip.live = false; if (l.ribbon) l.ribbon.used = false; },
        };
      }
      if (def.wide) {
        const w = waves.find(o => !o.mesh.visible) || waves[0];
        w.live = true; w.k = 1; w.kind = def; w.age = 0; w.mesh.visible = true;
        return {
          place(at, dir, far = 0) {
            // ahead: the way it goes; across: level, leaning as her cut did; it widens a little as it flies
            Z.copy(dir).normalize();
            X.crossVectors(UP, Z).normalize();
            Y.crossVectors(Z, X);
            const c = Math.cos(def.lean), s = Math.sin(def.lean);
            tmp.copy(X).multiplyScalar(c).addScaledVector(Y, s);
            side.copy(Y).multiplyScalar(c).addScaledVector(X, -s);
            basis.makeBasis(tmp, side, Z);
            w.mesh.quaternion.setFromRotationMatrix(basis);
            w.mesh.position.copy(at);
            const grow = 0.55 + 0.45 * Math.min(1, far / 1.2) + 0.03 * far;
            w.mesh.scale.set(def.wide * grow, def.tall * (0.8 + 0.2 * grow), def.wide * grow);
          },
          end(hit) { w.live = false; if (hit) w.k = Math.min(w.k, 0.5); },
        };
      }
      const o = orbs.find(v => !v.mesh.visible) || orbs[0];
      o.live = true; o.k = 1; o.kind = def; o.shed = def.shed * 0.5; o.mesh.visible = true;
      o.mesh.material.uniforms.uSize.value = def.size;
      o.ribbon = takeRibbon(def.ribbon, 0.13);
      let last = -1;
      return {
        place(at, dir, far = 0) {
          o.mesh.position.copy(at);
          feed(o.ribbon, at);
          if (last >= 0) {
            o.shed -= far - last;
            if (o.shed <= 0) { o.shed = def.shed; spark(at, (rand() - 0.5) * 1.6, 0.4 + rand() * 0.8, (rand() - 0.5) * 1.6, 0.4 + 0.2 * rand(), def.size * 0.3); }
          }
          last = far;
        },
        end(hit) { o.live = false; o.ribbon.used = false; if (hit) { o.k = 0; o.mesh.visible = false; } },
      };
    },
    burst(at, size = 0.7) {
      const b = bursts.find(o => o.t >= 1) || bursts.reduce((m, o) => (o.t > m.t ? o : m));
      b.t = 0; b.life = 0.24 + 0.1 * Math.min(1.5, size);
      b.mesh.position.copy(at); b.mesh.visible = true;
      b.mesh.material.uniforms.uSize.value = size;
      scatter(at, Math.round(5 + 5 * Math.min(2, size)), 2.2 + 1.6 * size, 0.07 + 0.05 * Math.min(2, size));
    },
    ring(at, radius = 2) {
      const r = rings.find(o => o.t >= 1) || rings[0];
      r.t = 0; r.life = 0.32 + 0.05 * radius;
      r.mesh.position.copy(at); r.mesh.scale.setScalar(radius); r.mesh.visible = true;
      scatter(at, 8, 3.2, 0.09);
    },
    motes(at, n = 1, from = 0.6) {
      for (let i = 0; i < n; i++) {
        const a = rand() * 6.283, z = rand() * 1.4 - 0.4, r = Math.sqrt(Math.max(0, 1 - Math.min(1, z * z)));
        tmp.set(at.x + Math.cos(a) * r * from, at.y + z * from, at.z + Math.sin(a) * r * from);
        // (a spark slows to a third of its first pace's reach: sent three times as fast as the way is long, it ends at `at`)
        spark(tmp, (at.x - tmp.x) * 3, (at.y - tmp.y) * 3 + 0.5, (at.z - tmp.z) * 3, 0.42, 0.06 + 0.03 * rand());
      }
    },
    setNight(on) { colours.uShine.value = on ? 1.35 : 0.8; },
    update(dt, camera) {
      time += dt;
      sMat.uniforms.uTime.value = time;
      const beat = 0.5 + 0.5 * Math.sin(time * 34);
      // orbs: one that ran out goes out quickly
      for (const o of orbs) {
        if (!o.mesh.visible) continue;
        if (!o.live) { o.k -= dt / 0.1; if (o.k <= 0) { o.mesh.visible = false; continue; } }
        const u = o.mesh.material.uniforms;
        u.uK.value = Math.max(0, o.k); u.uBeat.value = beat;
        u.uSize.value = o.kind.size * (0.94 + 0.06 * beat) * (o.live ? 1 : 0.6 + 0.4 * o.k);
      }
      // the light at her hand: there while it is asked for
      for (const g of glows.values()) {
        g.k = clamp(g.k + (g.seen ? dt / 0.05 : -dt / 0.07), 0, 1);
        g.seen = false;
        g.mesh.visible = g.k > 0;
        if (!g.mesh.visible) continue;
        const u = g.mesh.material.uniforms;
        u.uK.value = g.k; u.uBeat.value = beat; u.uSize.value = g.size * (0.9 + 0.1 * beat);
      }
      // waves
      for (const w of waves) {
        if (!w.mesh.visible) continue;
        w.age += dt;
        if (!w.live) { w.k -= dt / 0.12; if (w.k <= 0) { w.mesh.visible = false; continue; } }
        const u = w.mesh.material.uniforms;
        u.uK.value = Math.max(0, w.k) * Math.min(1, w.age / 0.04); u.uAge.value = w.age;
      }
      // bursts
      for (const b of bursts) {
        if (b.t >= 1) continue;
        b.t = Math.min(1, b.t + dt / b.life);
        b.mesh.visible = b.t < 1;
        b.mesh.material.uniforms.uT.value = b.t;
      }
      // rings over the ground
      for (const r of rings) {
        if (r.t >= 1) continue;
        r.t = Math.min(1, r.t + dt / r.life);
        r.mesh.visible = r.t < 1;
        r.mesh.material.uniforms.uT.value = r.t;
      }
      // lances: each grows toward how grown it should be; its strip is laid from its tail to its point, facing the camera
      for (const l of lances) {
        if (!l.mesh.visible) continue;
        if (!l.live) { l.k -= dt / 0.1; if (l.k <= 0) { l.mesh.visible = false; continue; } }
        l.grown += (l.level - l.grown) * Math.min(1, dt * 14);
        const def = SHOTS.lance, i0 = Math.min(2, Math.floor(l.grown)), f = l.grown - i0;
        const mix = a => a[i0] + (a[i0 + 1] - a[i0]) * f;
        l.long = mix(def.long);
        const thick = mix(def.thick) * (0.94 + 0.06 * beat);
        l.tip.kind.size = mix(def.tip);
        const pos = l.mesh.geometry.attributes.position;
        for (let i = 0; i < LANCE; i++) {
          const u = i / (LANCE - 1);
          tan.copy(l.head).addScaledVector(l.dir, -l.long * (1 - u));
          toCam.subVectors(camera.position, tan);
          side.crossVectors(l.dir, toCam).normalize();
          const w = thick * Math.sin(Math.PI * Math.pow(u, 1.7));
          pos.setXYZ(i * 2, tan.x - side.x * w, tan.y - side.y * w, tan.z - side.z * w);
          pos.setXYZ(i * 2 + 1, tan.x + side.x * w, tan.y + side.y * w, tan.z + side.z * w);
        }
        pos.needsUpdate = true;
        l.mesh.material.uniforms.uK.value = Math.max(0, l.k);
      }
      // ribbons: every place on one grows older and is dropped; the strip is laid through what is left, facing the camera
      for (const r of ribbons) {
        if (r.key !== null && r.used && !r.seen) r.used = false;          // (a hand's ribbon nobody fed this frame: let go)
        r.seen = false;
        for (const p of r.pts) p.age += dt;
        while (r.pts.length && r.pts[r.pts.length - 1].age > r.life) r.pts.pop();
        const n = r.pts.length;
        r.mesh.visible = n > 1;
        if (n < 2) { if (!r.used) r.key = null; continue; }
        const pos = r.mesh.geometry.attributes.position, uv = r.mesh.geometry.attributes.uv;
        for (let i = 0; i < RIBBON; i++) {
          const j = Math.min(i, n - 1), p = r.pts[j].at;
          tan.subVectors(r.pts[Math.max(0, j - 1)].at, r.pts[Math.min(n - 1, j + 1)].at);
          toCam.subVectors(camera.position, p);
          side.crossVectors(tan, toCam);
          const l = side.length();
          const u = Math.min(1, r.pts[j].age / r.life);
          const w = l > 1e-6 && i < n ? r.width * (1 - 0.7 * u) / l : 0;
          pos.setXYZ(i * 2, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
          pos.setXYZ(i * 2 + 1, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
          uv.setX(i * 2, u); uv.setX(i * 2 + 1, u);
        }
        pos.needsUpdate = true; uv.needsUpdate = true;
      }
    },
    dispose() {
      square.dispose(); waveGeo.dispose(); sGeo.dispose(); flat.dispose();
      for (const r of ribbons) r.mesh.geometry.dispose();
      for (const l of lances) l.mesh.geometry.dispose();
      for (const m of made) m.dispose();
    },
  };
  fx.setNight(false);
  return fx;
}
