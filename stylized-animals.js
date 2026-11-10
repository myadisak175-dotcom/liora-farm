/* ==========================================================================
   stylized-animals.js  —  rigged animals (GLB) with the kit's cartoon light
   Keeps the model's own texture, replaces realistic lighting with 3 hard bands.

     const deer = await loadAnimal('./deer.glb', { height: 1.9 });
     const a = createAnimal(deer, { action: 'idle' });   scene.add(a.object);
     walkAlong(a, { points: [[x, z], ...], groundAt: (x, z) => y, speed: 1.6 });
     every frame: updateAnimals(dt)
     stylizeModel(anyGltfScene, { sat: 1.3 })   // same cartoon light for other models (sat > 1 for realistic textures)

   Mobile-safe shader: no uniform arrays, no indexed loops.
   ========================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const SUN = new THREE.Vector3(-0.4, 0.9, 0.5).normalize();   // same sun as the trees and rocks
const live = new Set();

export function updateAnimals(dt) {
  dt = Math.min(dt, 0.05);
  for (const a of live) a.update(dt);
}

// cartoon light over the model's own colours (works for skinned and static meshes)
export function toonMaterial(map = null, color = '#b98a5e', { sat = 1.0 } = {}) {
  if (map) { map.colorSpace = THREE.NoColorSpace; map.needsUpdate = true; }   // raw sRGB, like the rest of the kit
  const c = new THREE.Color(color);
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uHasMap: { value: map ? 1 : 0 },
      uColor: { value: new THREE.Vector3(...c.convertLinearToSRGB().toArray()) },
      uLight: { value: SUN },
      uLit: { value: new THREE.Vector3(1.12, 1.05, 0.92) },     // warm sunlit band
      uMid: { value: new THREE.Vector3(0.9, 0.84, 0.8) },
      uShade: { value: new THREE.Vector3(0.64, 0.6, 0.72) },    // cool shadow band
      uSat: { value: sat },                                    // >1 to push a realistic texture toward the kit
    },
    vertexShader: /* glsl */`
      #include <common>
      #include <skinning_pars_vertex>
      varying vec2 vUv;
      varying vec3 vWN;
      void main() {
        vUv = uv;
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vWN = normalize(mat3(modelMatrix) * objectNormal);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform float uHasMap, uSat;
      uniform vec3 uColor, uLight, uLit, uMid, uShade;
      varying vec2 vUv;
      varying vec3 vWN;
      void main() {
        vec3 base = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : uColor;
        float l = dot(base, vec3(0.299, 0.587, 0.114));
        base = clamp(mix(vec3(l), base, uSat), 0.0, 1.0);
        float d = dot(normalize(vWN), uLight) * 0.5 + 0.5;
        vec3 light = d > 0.66 ? uLit : (d > 0.42 ? uMid : uShade);
        gl_FragColor = vec4(clamp(base * light, 0.0, 1.0), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

export function stylizeModel(root, { sat = 1.0 } = {}) {
  const made = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const old = o.material;
    if (!made.has(old)) made.set(old, toonMaterial(old.map || null, old.color ? '#' + old.color.getHexString() : undefined, { sat }));
    o.material = made.get(old);
    o.frustumCulled = false;
  });
  return root;
}

// load once, then createAnimal() as many times as you like.
// source: a URL ('./deer.glb') or an ArrayBuffer of a .glb file
export async function loadAnimal(source, { height = 1.9, sat = 1.0 } = {}) {
  const loader = new GLTFLoader();
  const gltf = typeof source === 'string' ? await loader.loadAsync(source) : await loader.parseAsync(source, './');
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const s = height / size.y;
  model.scale.multiplyScalar(s);
  model.position.set(-center.x * s, -box.min.y * s, -center.z * s);    // feet on y = 0, centred
  const holder = new THREE.Group();
  holder.add(model);
  stylizeModel(holder, { sat });
  holder.updateMatrixWorld(true);
  // which way the animal faces: body centre -> head bone
  let head = null;
  model.traverse(o => { if (!head && o.isBone && /head/i.test(o.name)) head = o; });
  let forwardYaw = 0;
  if (head) { const hp = head.getWorldPosition(new THREE.Vector3()); forwardYaw = Math.atan2(hp.x, hp.z); }
  const clips = {};
  for (const c of gltf.animations) {
    const n = c.name.toLowerCase();
    if (n.includes('idle') && !clips.idle) clips.idle = c;
    else if (n.includes('walk') && !clips.walk) clips.walk = c;
    else clips[c.name] = c;
  }
  return { template: holder, clips, forwardYaw, height };
}

export function createAnimal(asset, { action = 'idle', offset = Math.random(), timeScale = 1 } = {}) {
  const object = SkeletonUtils.clone(asset.template);
  const mixer = new THREE.AnimationMixer(object);
  mixer.timeScale = timeScale;
  const actions = {};
  for (const [k, c] of Object.entries(asset.clips)) actions[k] = mixer.clipAction(c);
  let current = null;
  const play = (name, fade = 0.35) => {
    const next = actions[name];
    if (!next || next === current) return;
    next.reset().setEffectiveWeight(1).play();
    if (current && fade > 0) current.crossFadeTo(next, fade, true); else if (current) current.stop();
    current = next;
  };
  play(action, 0);
  if (current) current.time = offset * current.getClip().duration;
  const a = {
    object, mixer, actions, play, asset, onUpdate: null,
    update(dt) { mixer.update(dt); if (a.onUpdate) a.onUpdate(dt); },
    dispose() { live.delete(a); mixer.stopAllAction(); },
  };
  object.userData = { kind: 'animal', dispose: () => a.dispose() };
  live.add(a);
  return a;
}

// walk back and forth along a route, pausing (idle) at both ends
export function walkAlong(a, { points, groundAt, speed = 1.6, pause = [2.5, 5], start = Math.random() } = {}) {
  const P = points.map(([x, z]) => new THREE.Vector2(x, z));
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
  const L = cum[cum.length - 1];
  let s = start * L, dir = 1, wait = 0, i = 1;
  let yaw = null;
  const pos = new THREE.Vector2(), tan = new THREE.Vector2();
  const sample = () => {
    while (i < P.length - 1 && cum[i] < s) i++;
    while (i > 1 && cum[i - 1] > s) i--;
    const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    pos.lerpVectors(P[i - 1], P[i], Math.min(1, Math.max(0, t)));
    tan.subVectors(P[i], P[i - 1]).normalize();
  };
  a.play('walk', 0);
  a.onUpdate = dt => {
    if (wait > 0) {
      wait -= dt;
      if (wait <= 0) a.play('walk');
    } else {
      s += dir * speed * dt;
      if (s <= 0 || s >= L) {
        s = Math.min(L, Math.max(0, s));
        dir = -dir;                                   // turn around during the pause
        wait = pause[0] + Math.random() * (pause[1] - pause[0]);
        a.play('idle');
      }
    }
    sample();
    const target = Math.atan2(tan.x * dir, tan.y * dir) - a.asset.forwardYaw;
    if (yaw === null) yaw = target;
    let d = target - yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    yaw += d * Math.min(1, dt * (wait > 0 ? 1.5 : 4));
    a.object.position.set(pos.x, groundAt(pos.x, pos.y), pos.y);
    a.object.rotation.y = yaw;
  };
  return a;
}
