/* ==========================================================================
   stylized-props.js  —  placed buildings and props (GLB with flat colour patches) in the kit's cartoon light
   For models already restyled into flat colour patches (vertex colours, no textures): each part one flat colour,
   lit by three hard bands like the trees and rocks, fading into the haze with distance. Animations in the file play
   on their own (a windmill's sails).

     const mill = await loadProp('./assets/models/windmill.glb', { height: 11, spin: { part: /sails/, speed: 0.5 } });
     mill.object.position.set(x, y, z); scene.add(mill.object);
     every frame: mill.update(dt)
     mill.footprint(cell)   [[x, z], ...] world-space cells the base stands on (for colliders, bare ground under it)
     spin: { part, speed }  turns the part whose name matches part (a RegExp) round the axis through its middle, square
                            to its flattest side (a windmill's sails, a water wheel), at speed turns a second

   Mobile-safe shader: no uniform arrays, no indexed loops.
   ========================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { _internal } from './stylized-nature.js';

const { shared } = _internal;
const SUN = new THREE.Vector3(-0.4, 0.9, 0.5).normalize();   // same sun as the trees and rocks

let material = null;
// one material for every prop: the colours ride on the vertices
export function propMaterial() {
  if (material) return material;
  material = new THREE.ShaderMaterial({
    uniforms: {
      uLight: { value: SUN },
      uLit: { value: new THREE.Vector3(1.08, 1.03, 0.93) },      // warm sunlit band
      uMid: { value: new THREE.Vector3(0.9, 0.85, 0.82) },
      uShade: { value: new THREE.Vector3(0.66, 0.63, 0.75) },    // cool shadow band
      uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
    },
    vertexColors: true,
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      varying vec3 vCol;
      varying vec3 vWN;
      varying float vHaze;
      void main() {
        vCol = color;
        vWN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight, uLit, uMid, uShade, uHaze;
      varying vec3 vCol;
      varying vec3 vWN;
      varying float vHaze;
      void main() {
        vec3 n = normalize(vWN) * (gl_FrontFacing ? 1.0 : -1.0);      // thin parts (sails, boards) are seen from both sides
        float d = dot(n, uLight) * 0.5 + 0.5;
        vec3 light = d > 0.66 ? uLit : (d > 0.42 ? uMid : uShade);
        gl_FragColor = vec4(mix(clamp(vCol * light, 0.0, 1.0), uHaze, vHaze), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  return material;
}

// source: a URL or an ArrayBuffer of a .glb.  height: metres from the ground to the highest point.  yaw: turn about the vertical
export async function loadProp(source, { height = 10, yaw = 0, spin = null } = {}) {
  const loader = new GLTFLoader();
  const gltf = typeof source === 'string' ? await loader.loadAsync(source) : await loader.parseAsync(source, './');
  const model = gltf.scene;
  model.rotation.y = yaw;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const s = height / size.y;
  model.scale.multiplyScalar(s);
  model.position.set(-center.x * s, -box.min.y * s, -center.z * s);      // base on y = 0, centred
  const holder = new THREE.Group();
  holder.name = 'prop';
  holder.add(model);
  const mat = propMaterial();
  model.traverse(o => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; } });     // animated parts move outside their boxes
  // the spinning part: its pivot moved to its middle, its axis the direction it is thinnest along
  let spinner = null, axis = null;
  if (spin) model.traverse(o => {
    if (spinner || !o.isMesh || !spin.part.test(o.name)) return;
    const g = o.geometry, p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) c.add(v.fromBufferAttribute(p, i));
    c.multiplyScalar(1 / p.count);
    const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];                                 // spread of the points about the middle
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).sub(c); const d = [v.x, v.y, v.z]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) m[a * 3 + b] += d[a] * d[b]; }
    const tr = m[0] + m[4] + m[8], n = new THREE.Vector3(0.31, 0.27, 0.91);
    for (let k = 0; k < 80; k++) n.set(tr * n.x - (m[0] * n.x + m[1] * n.y + m[2] * n.z), tr * n.y - (m[3] * n.x + m[4] * n.y + m[5] * n.z), tr * n.z - (m[6] * n.x + m[7] * n.y + m[8] * n.z)).normalize();
    g.translate(-c.x, -c.y, -c.z);
    o.position.add(c);
    spinner = o; axis = n;
  });
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
  if (mixer) for (const clip of gltf.animations) mixer.clipAction(clip).play();
  holder.updateMatrixWorld(true);
  return {
    object: holder,
    size: new THREE.Vector3(size.x * s, height, size.z * s),
    update(dt) { if (mixer) mixer.update(dt); if (spinner) spinner.rotateOnAxis(axis, spin.speed * Math.PI * 2 * dt); },
    // which ground cells the lowest part of the model covers: cell centres in world space (call after placing it)
    footprint(cell = 1, below = 2.5) {
      holder.updateMatrixWorld(true);
      const base = holder.getWorldPosition(new THREE.Vector3()).y, cells = new Map(), v = new THREE.Vector3();
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      const mark = q => { if (q.y - base > below) return; const ix = Math.round(q.x / cell), iz = Math.round(q.z / cell); cells.set(ix + ',' + iz, [ix * cell, iz * cell]); };
      model.traverse(o => {
        if (!o.isMesh) return;
        const p = o.geometry.attributes.position, idx = o.geometry.index;
        const n = idx ? idx.count : p.count, at = k => (idx ? idx.getX(k) : k);
        // walk every triangle edge in short steps, so long walls with few corners still mark every cell they cross
        for (let t = 0; t < n; t += 3) for (let e = 0; e < 3; e++) {
          a.fromBufferAttribute(p, at(t + e)).applyMatrix4(o.matrixWorld);
          b.fromBufferAttribute(p, at(t + (e + 1) % 3)).applyMatrix4(o.matrixWorld);
          const steps = Math.max(1, Math.ceil(a.distanceTo(b) / (cell * 0.5)));
          for (let k = 0; k <= steps; k++) mark(v.lerpVectors(a, b, k / steps));
        }
      });
      return [...cells.values()];
    },
    dispose() { model.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); },
  };
}
