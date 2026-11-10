/* ==========================================================================
   stylized-waterfall.js  —  a waterfall that matches the clear water of stylized-water.js

   One job: draw a falling sheet of water, the churn where it lands, and the mist above the pool.
   Same palette and soft gradients as the river (turquoise shallows -> blue body -> soft white), no hard
   poster bands and no paper-cut foam clumps.

     const fall = createWaterfall({ x, z, top, bottom, width });
     scene.add(fall.group);
     every frame: fall.update(dt)

   The sheet leaves the lip at (x, top, z) and curves forward (+z) as it falls, landing near z + 2.9.
   Mobile-safe shaders: no uniform arrays, no loops.
   ========================================================================== */
import * as THREE from 'three';
import { _internal } from './stylized-nature.js';
import { WATER_LOOK } from './stylized-water.js';

const { NOISE, rgb, shared } = _internal;

// the falling sheet: clear turquoise at the lip, streaked and whitening as it speeds up and breaks apart
function sheetMaterial({ layer = 0, speed = 1, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uTop: { value: rgb(WATER_LOOK.shallow) }, uBody: { value: rgb('#4fbfd8') }, uDeep: { value: rgb(WATER_LOOK.mid) }, uWhite: { value: rgb('#f4fcff') },
      uLayer: { value: layer }, uSpeedF: { value: speed }, uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform float uTime, uLayer, uSpeedF, uOpacity;
      uniform vec3 uTop, uBody, uDeep, uWhite;
      varying vec2 vUv;          // x: across 0..1, y: 0 at the lip .. 1 at the foot
      void main() {
        float x = vUv.x, y = vUv.y, t = uTime * uSpeedF;
        float edge = abs(x - 0.5) * 2.0;
        // water speeds up as it falls: the pattern is stretched more and more towards the foot
        float fallP = y * 1.4 + y * y * 1.6;
        float s1 = noise2(vec2(x * 8.0 + uLayer * 3.1, fallP * 2.0 - t * 2.2));
        float s2 = noise2(vec2(x * 19.0 + 7.0 + uLayer, fallP * 4.2 - t * 3.4));
        float streak = s1 * 0.65 + s2 * 0.35;
        // soft, uneven sides that wander as the water falls
        float wob = (noise2(vec2(y * 5.0 - t * 1.8, uLayer * 5.0 + 1.0)) - 0.5) * 0.2;
        float side = 1.0 - smoothstep(0.72 + wob, 0.98 + wob, edge);
        if (side < 0.01) discard;
        // colour: smooth gradients only (like the river), no bands
        vec3 col = mix(uTop, uBody, smoothstep(0.0, 0.4, y));
        col = mix(col, uDeep, (1.0 - streak) * 0.35 * (1.0 - smoothstep(0.2, 0.8, y)));
        float white = smoothstep(0.45, 1.0, y) * 0.45 + smoothstep(0.62, 0.9, streak) * 0.4;
        col = mix(col, uWhite, clamp(white, 0.0, 0.92));
        col = mix(col, uWhite, (1.0 - smoothstep(0.0, 0.07, y)) * 0.45);           // the bright roll over the lip
        col += uWhite * smoothstep(0.6, 1.0, edge) * 0.18;                          // lighter thin rims
        col *= 0.94 + 0.08 * (1.0 - x);                                             // a touch of light from one side
        // thin at the top (you see the rock through it), thick white water lower down, dissolving into the churn
        float alpha = mix(0.82, 0.97, smoothstep(0.0, 0.45, y)) * mix(0.8, 1.0, streak);
        alpha *= side * (1.0 - smoothstep(0.9, 1.0, y)) * uOpacity;
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

function sheetGeometry({ x, z, top, bottom, width, forward = 2.9, inset = 0 }) {
  const g = new THREE.PlaneGeometry(1, 1, 14, 40);
  const a = g.attributes.position, uv = g.attributes.uv, H = top - bottom;
  for (let i = 0; i < a.count; i++) {
    const u = a.getX(i) * 2;                 // -1..1
    const t = 0.5 - a.getY(i);               // 0 top .. 1 bottom
    a.setXYZ(i, x + u * width * 0.5 * (1.0 + 0.3 * t), top - t * H, z + inset + forward * Math.sqrt(t));
    uv.setXY(i, u * 0.5 + 0.5, t);
  }
  g.computeVertexNormals();
  return g;
}

// white water where the fall lands: soft bubbling foam that drifts outwards and thins at its rim
function churnMaterial(radius) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uR: { value: radius }, uWhite: { value: rgb('#f4fcff') }, uTint: { value: rgb('#bfeef0') } },
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform float uTime, uR;
      uniform vec3 uWhite, uTint;
      varying vec2 vP;
      void main() {
        float r = length(vP) / uR;
        if (r > 1.0) discard;
        float a = atan(vP.y, vP.x);
        vec2 q = vec2(cos(a), sin(a)) * (r * 3.0 - uTime * 0.45);
        float n = noise2(q * 1.3 + 2.0) * 0.6 + noise2(q * 3.1 + vec2(5.0, uTime * 0.2)) * 0.4;
        float body = 1.0 - smoothstep(0.15, 0.95, r);
        float foam = smoothstep(0.25, 0.85, n * 0.7 + body * 0.6);
        float alpha = foam * (1.0 - smoothstep(0.6, 1.0, r)) * 0.85;
        gl_FragColor = vec4(mix(uTint, uWhite, foam), alpha);
      }`,
    transparent: true, depthWrite: false,
  });
}

function mistTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWaterfall({ x = 0, z = 0, top = 10, bottom = 0, width = 4.6, forward = 2.9 } = {}) {
  const group = new THREE.Group();
  group.name = 'waterfall';
  const disposables = [];
  // back sheet (the body of the fall) and a narrower, faster, fainter sheet in front of it for depth
  const back = new THREE.Mesh(sheetGeometry({ x, z, top, bottom, width, forward }), sheetMaterial({ layer: 0, speed: 1 }));
  const front = new THREE.Mesh(sheetGeometry({ x, z, top, bottom, width: width * 0.72, forward, inset: 0.18 }), sheetMaterial({ layer: 1, speed: 1.35, opacity: 0.55 }));
  back.renderOrder = 2; front.renderOrder = 3;
  group.add(back, front);
  disposables.push(back, front);
  // churn on the pool where the sheet lands
  const footZ = z + forward + 0.1, R = width * 0.85;
  const churnGeo = new THREE.CircleGeometry(R, 48);
  churnGeo.rotateX(-Math.PI / 2);
  churnGeo.scale(1, 1, 0.7);
  const churn = new THREE.Mesh(churnGeo, churnMaterial(R));
  churn.position.set(x, bottom + 0.27, footZ);
  churn.renderOrder = 4;
  group.add(churn);
  disposables.push(churn);
  // a few slow puffs of mist rising from the pool
  const tex = mistTexture();
  const mists = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    m.renderOrder = 5;
    m.userData = { phase: i / 7, ox: (Math.random() - 0.5) * width * 1.2, oz: (Math.random() - 0.3) * 1.6, s: 2.6 + Math.random() * 2.4 };
    group.add(m);
    mists.push(m);
  }
  const LIFE = 6.0;
  return {
    group,
    update(dt) {
      const now = shared.uTime.value;
      for (const m of mists) {
        const k = (now / LIFE + m.userData.phase) % 1;             // 0 born .. 1 gone
        m.position.set(x + m.userData.ox * (0.6 + k * 0.6), bottom + 0.4 + k * 3.2, footZ + m.userData.oz + k * 0.8);
        m.scale.setScalar(m.userData.s * (0.6 + k * 0.9));
        m.material.opacity = Math.sin(k * Math.PI) * 0.32;
      }
    },
    dispose() {
      for (const o of disposables) { o.geometry.dispose(); o.material.dispose(); }
      for (const m of mists) m.material.dispose();
      tex.dispose();
    },
  };
}
