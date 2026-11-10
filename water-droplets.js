// water-droplets.js
// Drops of water thrown up where something hits the water. One pooled Points draw; each drop flies a ballistic arc worked out in
// the vertex shader and disappears when it falls back to the surface. The level decides WHERE and HOW HARD (from the same touch
// that pokes the wave simulation); this file only draws the drops.
//
// What keeps it from looking mechanical: the drops of one splash do not all leave at the same instant or from the same point
// (they come off a loose ring over about a tenth of a second), they are of mixed sizes (mostly fine spray, a few fat drops),
// and each one is drawn stretched along the way it is flying, so a fast drop is a streak and a drop at the top of its arc is round.
//
//   const drops = createWaterDroplets({ time: shared.uTime });     // time: a { value } uniform that counts seconds
//   group.add(drops.points);
//   drops.emit(x, waterLevel, z, power, count);                    // power 1 = a full splash, 0.15 = a footstep
//   drops.update(renderer);                                        // once a frame
import * as THREE from 'three';
import { WATER_TUNE } from './stylized-water.js';

const GRAVITY = 7;        // m/s2: a little floatier than real water, so the arc can be read

export function createWaterDroplets({ time, capacity = 160, light = '#f6fcff', body = '#8fe0ea' } = {}) {
  const start = new Float32Array(capacity * 3), vel = new Float32Array(capacity * 3), par = new Float32Array(capacity * 2);
  for (let i = 0; i < capacity; i++) par[i * 2] = -100;                 // born long ago: not drawn
  const geo = new THREE.BufferGeometry();
  const aStart = new THREE.BufferAttribute(start, 3), aVel = new THREE.BufferAttribute(vel, 3), aPar = new THREE.BufferAttribute(par, 2);
  for (const a of [aStart, aVel, aPar]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aStart);
  geo.setAttribute('aVel', aVel);
  geo.setAttribute('aPar', aPar);                                       // x: time of birth, y: size in metres
  const mat = new THREE.ShaderMaterial({
    uniforms: { uToon: WATER_TUNE.anime, uTime: time, uH: { value: 500 }, uAspect: { value: 1 }, uLight: { value: new THREE.Color(light) }, uBody: { value: new THREE.Color(body) } },
    vertexShader: /* glsl */`
      attribute vec3 aVel;
      attribute vec2 aPar;
      uniform float uTime, uH, uAspect;
      varying float vFade, vStretch;
      varying vec2 vDir;
      void main() {
        float t = uTime - aPar.x;
        vec3 p = position + aVel * t;
        p.y -= ${(GRAVITY / 2).toFixed(2)} * t * t;
        vec3 v = aVel; v.y -= ${GRAVITY.toFixed(1)} * t;                     // how it is flying right now
        float flight = 2.0 * aVel.y / ${GRAVITY.toFixed(1)};               // seconds until it is back at the surface
        float k = clamp(t / max(flight, 0.01), 0.0, 1.0);
        vFade = smoothstep(0.0, 0.06, k) * (1.0 - smoothstep(0.8, 1.0, k));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // the same drop a moment later, on screen: the direction to stretch it in
        vec4 ahead = projectionMatrix * modelViewMatrix * vec4(p + v * 0.02, 1.0);
        vec2 dir = (ahead.xy / ahead.w - gl_Position.xy / gl_Position.w) * vec2(uAspect, 1.0);
        float len = length(dir);
        vDir = len > 1e-5 ? dir / len : vec2(0.0, 1.0);
        vStretch = clamp(length(v) * 0.42, 0.0, 1.5);                       // fast = a streak, slow = a bead
        float size = aPar.y * (1.0 - 0.35 * k) * (1.0 + vStretch);
        gl_PointSize = size * projectionMatrix[1][1] * uH * 0.5 / max(-mv.z, 0.1);
        if (t < 0.0 || t > flight) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight, uBody;
      uniform float uToon;
      varying float vFade, vStretch;
      varying vec2 vDir;
      void main() {
        vec2 c = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y) * 2.0;
        float along = dot(c, vDir), across = dot(c, vec2(-vDir.y, vDir.x)) * (1.0 + vStretch);
        // a little fatter at the front than at the tail
        across *= 1.0 + 0.35 * vStretch * smoothstep(0.2, -1.0, along);
        float d = along * along + across * across;
        if (d > 1.0) discard;
        // a bead of the river's own water: aqua body, a pale lit top
        vec3 col = mix(uBody, uLight, smoothstep(-0.3, 0.6, c.y) * 0.8 + 0.2);
        float a = smoothstep(1.0, 0.35, d) * vFade * 0.8;
        // anime water: a flat white drop with a drawn edge
        if (uToon > 0.5) { col = uLight; a = step(d, 0.8) * step(0.3, vFade); }
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'waterDroplets';
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.visible = false;
  // ---- the cone of water: where something lands, a thin sheet of water is thrown up and outwards in a cone (a crown), opens as it
  // rises, tears into strands along its ragged lip and falls back. One instanced draw, a child of the drops so it shows and hides with them.
  const CONES = 12;
  const tube = new THREE.CylinderGeometry(1, 1, 1, 28, 6, true);
  const cgeo = new THREE.InstancedBufferGeometry();
  cgeo.index = tube.index;
  cgeo.setAttribute('position', tube.attributes.position);
  cgeo.setAttribute('uv', tube.attributes.uv);
  const cone = new Float32Array(CONES * 4), coneSize = new Float32Array(CONES);
  for (let i = 0; i < CONES; i++) cone[i * 4 + 3] = -100;
  const aCone = new THREE.InstancedBufferAttribute(cone, 4), aConeSize = new THREE.InstancedBufferAttribute(coneSize, 1);
  aCone.setUsage(THREE.DynamicDrawUsage); aConeSize.setUsage(THREE.DynamicDrawUsage);
  cgeo.setAttribute('aCone', aCone);                                    // x, y, z, time of birth
  cgeo.setAttribute('aSize', aConeSize);                                // metres
  cgeo.instanceCount = CONES;
  const cmat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uToon: WATER_TUNE.anime, uLight: { value: new THREE.Color(light) }, uBody: { value: new THREE.Color(body) } },
    vertexShader: /* glsl */`
      attribute vec4 aCone;
      attribute float aSize;
      uniform float uTime;
      varying float vV, vA, vK, vSeed;
      void main() {
        float life = 0.5 + 0.35 * aSize, k = (uTime - aCone.w) / life;
        float v = position.y + 0.5;                                       // 0 at the water, 1 at the lip
        float rise = sin(clamp(k, 0.0, 1.0) * 3.14159);
        float h = aSize * 1.15 * pow(rise, 0.8);                          // up, then back down
        float r = aSize * (0.2 + 0.6 * k) * (1.0 + 0.8 * v * v * (0.4 + k));     // widening all the time, the lip leaning out
        vec3 p = aCone.xyz + vec3(position.x * r, v * h, position.z * r);
        vV = v; vA = uv.x; vK = k; vSeed = fract(aCone.x * 0.37 + aCone.z * 0.71);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        if (k < 0.0 || k > 1.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight, uBody;
      uniform float uToon;
      varying float vV, vA, vK, vSeed;
      void main() {
        float a = vA * 6.2831853;
        // a ragged lip: tongues of different heights round the rim, longer as the sheet thins
        float top = 1.0 - (0.18 + 0.32 * vK) * (0.5 + 0.5 * sin(a * 7.0 + vSeed * 20.0)) * (0.6 + 0.4 * sin(a * 3.0 + vSeed * 9.0));
        if (vV > top) discard;
        // late on, the sheet splits from the lip down into strands
        float tear = 0.5 + 0.5 * sin(a * 11.0 + vSeed * 31.0);
        if (vV > 0.3 && tear * (1.0 - vV * 0.45) < (vK - 0.45) * 1.5) discard;
        float lip = smoothstep(top - 0.14, top, vV);
        vec3 col = mix(uBody, uLight, max(smoothstep(0.1, 0.8, vV) * 0.75, lip));
        float alpha = mix(0.5, 0.9, max(vV, lip)) * (1.0 - smoothstep(0.8, 1.0, vK)) * smoothstep(0.0, 0.06, vV);
        // anime water: flat colours, a white lip, no see-through
        if (uToon > 0.5) { col = mix(mix(uBody, uLight, 0.45), uLight, step(top - 0.16, vV)); alpha = step(vK, 0.92); }
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const cones = new THREE.Mesh(cgeo, cmat);
  cones.name = 'waterCones';
  cones.frustumCulled = false;
  cones.renderOrder = 3;
  points.add(cones);
  let cursor = 0, last = -100, coneCursor = 0;
  return {
    points,
    emit(x, y, z, power = 1, count = 8) {
      const now = time.value, s = Math.sqrt(Math.max(0.02, power)), big = power > 0.4;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, o = cursor * 3;
        const centre = big && i < 2;                                      // a couple go straight up out of the middle, the rest off a ring
        const ring = centre ? 0.03 : (0.06 + 0.2 * Math.random()) * s;
        const out = centre ? 0.15 * Math.random() : (0.35 + 0.9 * Math.random()) * s;
        const up = (centre ? 2.6 + 1.2 * Math.random() : 1.3 + 2.0 * Math.random() * Math.random()) * s;
        start[o] = x + Math.cos(a) * ring; start[o + 1] = y + 0.02; start[o + 2] = z + Math.sin(a) * ring;
        vel[o] = Math.cos(a) * out; vel[o + 1] = up; vel[o + 2] = Math.sin(a) * out;
        par[cursor * 2] = now + Math.random() * (big ? 0.11 : 0.05);      // they do not all leave at once
        par[cursor * 2 + 1] = (Math.random() < 0.25 ? 0.07 + 0.035 * Math.random() : 0.028 + 0.03 * Math.random()) * (0.6 + 0.4 * s);
        cursor = (cursor + 1) % capacity;
      }
      aStart.needsUpdate = aVel.needsUpdate = aPar.needsUpdate = true;
      // and the cone of water under them: knee-high for a full splash, ankle-high for a footstep
      cone.set([x, y, z, now], coneCursor * 4);
      coneSize[coneCursor] = (big ? 0.8 : 0.55) * s;
      coneCursor = (coneCursor + 1) % CONES;
      aCone.needsUpdate = aConeSize.needsUpdate = true;
      last = now;
      points.visible = true;
    },
    update(renderer) {
      if (renderer) {
        const el = renderer.domElement;
        mat.uniforms.uH.value = el.height;
        mat.uniforms.uAspect.value = el.width / Math.max(1, el.height);
      }
      if (points.visible && time.value - last > 1.8) points.visible = false;        // nothing in the air: no draw at all
    },
    dispose() { geo.dispose(); mat.dispose(); cgeo.dispose(); tube.dispose(); cmat.dispose(); },
  };
}
