// water-droplets.js
// Drops of water thrown up where something hits the water. One pooled Points draw; each drop flies a ballistic arc worked out in
// the vertex shader and disappears when it falls back to the surface. The level decides WHERE and HOW HARD (from the same touch
// that pokes the wave simulation); this file only draws the drops.
//
//   const drops = createWaterDroplets({ time: shared.uTime });     // time: a { value } uniform that counts seconds
//   group.add(drops.points);
//   drops.emit(x, waterLevel, z, power, count);                    // power 1 = a full splash, 0.15 = a footstep
//   drops.update(renderer);                                        // once a frame
import * as THREE from 'three';

const GRAVITY = 7;        // m/s2: a little floatier than real water, so the arc can be read

export function createWaterDroplets({ time, capacity = 120, light = '#f6fcff', body = '#8fe0ea' } = {}) {
  const start = new Float32Array(capacity * 3), vel = new Float32Array(capacity * 3), par = new Float32Array(capacity * 2);
  for (let i = 0; i < capacity; i++) par[i * 2] = -100;                 // born long ago: not drawn
  const geo = new THREE.BufferGeometry();
  const aStart = new THREE.BufferAttribute(start, 3), aVel = new THREE.BufferAttribute(vel, 3), aPar = new THREE.BufferAttribute(par, 2);
  for (const a of [aStart, aVel, aPar]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aStart);
  geo.setAttribute('aVel', aVel);
  geo.setAttribute('aPar', aPar);                                       // x: time of birth, y: size in metres
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uH: { value: 500 }, uLight: { value: new THREE.Color(light) }, uBody: { value: new THREE.Color(body) } },
    vertexShader: /* glsl */`
      attribute vec3 aVel;
      attribute vec2 aPar;
      uniform float uTime, uH;
      varying float vFade;
      void main() {
        float t = uTime - aPar.x;
        vec3 p = position + aVel * t;
        p.y -= ${(GRAVITY / 2).toFixed(2)} * t * t;
        float flight = 2.0 * aVel.y / ${GRAVITY.toFixed(1)};               // seconds until it is back at the surface
        float k = clamp(t / max(flight, 0.01), 0.0, 1.0);
        vFade = 1.0 - smoothstep(0.75, 1.0, k);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aPar.y * (1.0 - 0.45 * k) * projectionMatrix[1][1] * uH * 0.5 / max(-mv.z, 0.1);
        if (t < 0.0 || t > flight) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight, uBody;
      varying float vFade;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c) * 4.0;
        if (d > 1.0) discard;
        // a bead of the river's own water: aqua body, a pale lit top
        vec3 col = mix(uBody, uLight, smoothstep(0.15, -0.3, c.y) * 0.85 + 0.15);
        gl_FragColor = vec4(col, smoothstep(1.0, 0.55, d) * vFade * 0.9);
      }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'waterDroplets';
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.visible = false;
  let cursor = 0, last = -100;
  return {
    points,
    emit(x, y, z, power = 1, count = 8) {
      const now = time.value, s = Math.sqrt(Math.max(0.02, power));
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, out = (0.25 + 0.75 * Math.random()) * 0.9 * s, o = cursor * 3;
        start[o] = x + Math.cos(a) * 0.07; start[o + 1] = y + 0.02; start[o + 2] = z + Math.sin(a) * 0.07;
        vel[o] = Math.cos(a) * out; vel[o + 1] = (1.9 + 1.6 * Math.random()) * s; vel[o + 2] = Math.sin(a) * out;
        par[cursor * 2] = now; par[cursor * 2 + 1] = (0.06 + 0.06 * Math.random()) * (0.6 + 0.4 * s);
        cursor = (cursor + 1) % capacity;
      }
      aStart.needsUpdate = aVel.needsUpdate = aPar.needsUpdate = true;
      last = now;
      points.visible = true;
    },
    update(renderer) {
      if (renderer) mat.uniforms.uH.value = renderer.domElement.height;
      if (points.visible && time.value - last > 1.5) points.visible = false;        // nothing in the air: no draw at all
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
