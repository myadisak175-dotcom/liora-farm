// stylized-character.js
// A playable anime character (skinned GLB) with a two-tone cel shader, plus clips built from baked keyframes.
//
//   const vivi = await loadCharacter(VIVI_GLB, VIVI_ANIM);      // base64 string or ArrayBuffer of a .glb
//   scene.add(vivi.object);            // feet at y = 0, facing +Z
//   vivi.play('walk');                 // 'idle' | 'walk' | 'run'
//   every frame: vivi.update(dt)
//
// In water (player.js tells her: vivi.water.level, vivi.water.wet): what is under the surface says how deep it is in the
// picture's alpha, for the water drawn over it (stylized-water.js), and what has been under stays darker until it dries.
//
// Materials come from the GLB: alphaMode (OPAQUE / MASK / BLEND), doubleSided and
// extras { color: [r,g,b,a], shade: [r,g,b], face: bool, queue } written by tools/prep_vivi.py.
// Phone-safe shader: no uniform arrays, no loops.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SUN = new THREE.Vector3(-0.4, 0.9, 0.5).normalize();   // same sun as the trees and rocks

function celMaterial(src, water) {
  const ex = src.userData || {};
  const map = src.map || null;
  if (map) { map.colorSpace = THREE.NoColorSpace; map.needsUpdate = true; }   // raw sRGB, like the rest of the kit
  const c = ex.color || [1, 1, 1, 1], sh = ex.shade || [0.8, 0.75, 0.8];
  const mask = src.alphaTest > 0, blend = src.transparent && !mask;
  const hair = /HAIR/.test(src.name);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uColor: { value: new THREE.Vector4(c[0], c[1], c[2], c[3] ?? 1) },
      uShade: { value: new THREE.Vector3(sh[0], sh[1], sh[2]) },
      uLight: { value: SUN },
      uFlat: { value: ex.face ? 0.82 : 0.0 },          // faces stay almost unshaded, like hand-drawn anime
      uCut: { value: mask ? src.alphaTest : (hair ? 0.5 : 0.0) },
      uWaterY: water.level, uWet: water.wet,
      uSolid: { value: blend && !hair ? 0 : 1 },         // (a blended overlay keeps its own alpha)
    },
    vertexShader: /* glsl */`
      #include <common>
      #include <skinning_pars_vertex>
      varying vec2 vUv;
      varying vec3 vWN;
      varying float vWY;
      void main() {
        vUv = uv;
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vWN = normalize(mat3(modelMatrix) * objectNormal);
        vWY = (modelMatrix * vec4(transformed, 1.0)).y;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec4 uColor;
      uniform vec3 uShade, uLight;
      uniform float uFlat, uCut, uWaterY, uSolid;
      uniform vec2 uWet;             // the height (in the world) she is wet up to, and how wet still (1 just out of the water .. 0 dry)
      varying vec2 vUv;
      varying vec3 vWN;
      varying float vWY;
      void main() {
        vec4 t = texture2D(uMap, vUv) * uColor;
        if (t.a < uCut) discard;
        vec3 n = normalize(vWN);
        if (!gl_FrontFacing) n = -n;
        float d = dot(n, uLight) * 0.5 + 0.5;
        float lit = max(smoothstep(0.43, 0.47, d), uFlat);                 // one crisp edge between light and shadow
        vec3 col = t.rgb * mix(uShade * vec3(0.9, 0.9, 0.98), vec3(1.03, 1.01, 0.97), lit);
        // wet: what has been under water is darker and a touch bluer until it dries; the line it reached is not ruler-straight
        float wet = uWet.y * (1.0 - smoothstep(-0.04, 0.03, vWY - uWet.x + 0.02 * sin(vUv.x * 55.0 + vUv.y * 31.0)));
        col *= mix(vec3(1.0), vec3(0.76, 0.81, 0.88), wet);
        // under the water: how far under (0 at the surface .. 0.5 a metre down) goes out as alpha. Nothing on screen reads it;
        // the water does, in the picture of what lies under it, and shows her through as much water as really covers her.
        float a = mix(t.a, vWY < uWaterY ? clamp(uWaterY - vWY, 0.0, 1.0) * 0.5 : 1.0, uSolid);
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);
      }`,
    side: src.side,
    transparent: blend && !hair,
    depthWrite: !(blend && !hair),
  });
  m.name = src.name;
  return m;
}

const b64ToBuffer = b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

function buildClips(anim) {
  const clips = {};
  for (const [name, c] of Object.entries(anim.clips)) {
    const times = new Float32Array(c.frames);
    for (let i = 0; i < c.frames; i++) times[i] = i / (c.frames - 1) * c.duration;
    const tracks = Object.entries(c.tracks).map(([bone, v]) => new THREE.QuaternionKeyframeTrack(bone + '.quaternion', times, new Float32Array(v)));
    tracks.push(new THREE.VectorKeyframeTrack(anim.hipsBone + '.position', times, new Float32Array(c.hips)));
    clips[name] = new THREE.AnimationClip(name, c.duration, tracks);
    clips[name].userData = { speed: c.speed };
  }
  return clips;
}

export async function loadCharacter(source, anim) {
  const gltf = await new GLTFLoader().parseAsync(typeof source === 'string' ? b64ToBuffer(source) : source, './');
  const model = gltf.scene;
  const made = new Map();
  const water = { level: { value: -1e5 }, wet: { value: new THREE.Vector2(-1e5, 0) } };      // shared by all her materials; on land: no water, dry
  model.traverse(o => {
    if (!o.isMesh) return;
    if (!made.has(o.material)) made.set(o.material, celMaterial(o.material, water));
    const queue = (o.material.userData && o.material.userData.queue) || 2000;
    o.material = made.get(o.material);
    o.renderOrder = queue > 2500 ? 10 + (queue - 2500) / 1000 : 0;      // face overlays (brows, lashes, highlights) after the skin
    o.frustumCulled = false;
  });
  model.rotation.y = -anim.forwardYaw;         // face +Z
  const object = new THREE.Group();
  object.name = 'character';
  object.add(model);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object, true);
  const mixer = new THREE.AnimationMixer(model);
  const clips = buildClips(anim), actions = {};
  for (const [k, c] of Object.entries(clips)) actions[k] = mixer.clipAction(c);
  let current = null;
  const ch = {
    object, mixer, actions, height: box.max.y - box.min.y, water,
    speeds: Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, c.userData.speed])),
    play(name, fade = 0.22) {
      const next = actions[name];
      if (!next || next === current) return;
      next.reset().setEffectiveWeight(1).play();
      if (current && fade > 0) current.crossFadeTo(next, fade, true); else if (current) current.stop();
      current = next;
      ch.state = name;
    },
    setRate(r) { if (current) current.timeScale = r; },
    update(dt) { mixer.update(Math.min(dt, 0.05)); },
    dispose() { mixer.stopAllAction(); made.forEach(m => { if (m.uniforms.uMap.value) m.uniforms.uMap.value.dispose(); m.dispose(); }); },
  };
  ch.play('idle', 0);
  object.userData = { kind: 'character', dispose: () => ch.dispose() };
  return ch;
}
