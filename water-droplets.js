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
  // ---- the crown and the cone of water. Where something lands, a thin sheet of water is thrown up and outwards as a bowl (the
  // crown): it shoots up fast, leans out, breaks into pointed fingers along its lip, thins into holes and sinks back while still
  // widening. Out of the middle of a full splash a cone of water then rises and drops again. Two instanced draws, children of the
  // drops so they show and hide with them.
  const CONES = 12;
  const cone = new Float32Array(CONES * 4), coneSize = new Float32Array(CONES);
  for (let i = 0; i < CONES; i++) cone[i * 4 + 3] = -100;
  const aCone = new THREE.InstancedBufferAttribute(cone, 4), aConeSize = new THREE.InstancedBufferAttribute(coneSize, 1);
  aCone.setUsage(THREE.DynamicDrawUsage); aConeSize.setUsage(THREE.DynamicDrawUsage);
  const instanced = src => {
    const g = new THREE.InstancedBufferGeometry();
    g.index = src.index;
    g.setAttribute('position', src.attributes.position);
    g.setAttribute('uv', src.attributes.uv);
    g.setAttribute('aCone', aCone);                                     // x, y, z, time of birth
    g.setAttribute('aSize', aConeSize);                                 // metres
    g.instanceCount = CONES;
    return g;
  };
  const tube = new THREE.CylinderGeometry(1, 1, 1, 48, 10, true), tube2 = new THREE.CylinderGeometry(1, 1, 1, 16, 8, true);
  const cgeo = instanced(tube), jgeo = instanced(tube2);
  const LIFE = 'float life = 0.55 + 0.4 * aSize, k = (uTime - aCone.w) / life;';
  const coneUniforms = () => ({ uTime: time, uToon: WATER_TUNE.anime, uLight: { value: new THREE.Color(light) }, uBody: { value: new THREE.Color(body) } });
  const cmat = new THREE.ShaderMaterial({
    uniforms: coneUniforms(),
    vertexShader: /* glsl */`
      attribute vec4 aCone;
      attribute float aSize;
      uniform float uTime;
      varying float vV, vA, vK, vSeed;
      void main() {
        ${LIFE}
        float v = position.y + 0.5;                                       // 0 at the water, 1 at the lip
        float kc = clamp(k, 0.0, 1.0);
        float seed = fract(aCone.x * 0.37 + aCone.z * 0.71) * 6.2831853;
        float angle = uv.x * 6.2831853;
        // The root moves first; a small delay carries the lift up to the lip.
        float phase = clamp((kc - v * 0.055) / (1.0 - v * 0.055), 0.0, 1.0);
        float up = 1.0 - pow(1.0 - min(phase / 0.3, 1.0), 2.0);
        float down = pow(max(phase - 0.3, 0.0) / 0.7, 2.0);
        float h = aSize * 0.8 * (up - 0.9 * down);
        float base = aSize * (0.22 + 0.5 * (1.0 - (1.0 - kc) * (1.0 - kc)));       // the foot of the bowl keeps spreading
        float r = base + aSize * (0.2 + 0.5 * kc) * pow(v, 0.75) + aSize * 0.1 * v * v * v * v;      // the wall leans out, the lip curls over
        float lift = max(0.0, sin(pow(phase, 0.72) * 3.14159265));
        float flutter = sin(angle * 3.0 + seed - phase * 5.2 - v * 3.4) * 0.6
                      + sin(angle * 5.0 - seed + phase * 3.6 - v * 4.2) * 0.4;
        // Integer angular frequencies meet at the seam. Flex dies away at the root.
        r *= 1.0 + v * v * flutter * 0.055 * lift;
        vec3 p = aCone.xyz + vec3(position.x * r, v * h + v * v * flutter * lift * aSize * 0.055, position.z * r);
        p.xz += vec2(cos(seed), sin(seed)) * aSize * v * v * lift * 0.065;
        vV = v; vA = uv.x; vK = kc; vSeed = seed;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        if (k < 0.0 || k > 1.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight, uBody;
      uniform float uToon;
      varying float vV, vA, vK, vSeed;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      // value noise that joins up round the bowl (period px along x)
      float wnoise(vec2 p, float px) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float x0 = mod(i.x, px), x1 = mod(i.x + 1.0, px);
        return mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), f.x), mix(hash(vec2(x0, i.y + 1.0)), hash(vec2(x1, i.y + 1.0)), f.x), f.y);
      }
      void main() {
        float a = vA * 6.2831853;
        // the lip: a sheet with pointed fingers of uneven height and spacing; the sheet between them draws back as it thins
        float tall = 0.45 + 0.3 * sin(a * 3.0 + vSeed) + 0.25 * sin(a * 5.0 - vSeed * 2.0);
        float finger = pow(0.5 + 0.5 * sin(a * 9.0 + 1.8 * sin(a * 2.0 + vSeed)), 4.0) * clamp(tall + 0.45, 0.25, 1.0);
        float sheet = 0.68 - 0.3 * vK + 0.08 * sin(a * 4.0 + vSeed * 3.0);
        float edge = sheet + (1.0 - sheet) * finger;
        if (vV > edge) discard;
        // holes open in the sheet from the top down as it sinks
        float holes = wnoise(vec2(vA * 14.0, vV * 3.5 - vK * 1.5) + vSeed, 14.0);
        if (holes < (vK - 0.5) * 1.5 * smoothstep(0.1, 0.7, vV)) discard;
        float rim = smoothstep(edge - 0.1, edge - 0.02, vV);
        float streak = smoothstep(0.55, 0.75, wnoise(vec2(vA * 24.0 + vSeed, vV * 1.2 - vK), 24.0)) * smoothstep(0.1, 0.5, vV);
        float foot = 1.0 - smoothstep(0.0, 0.1, vV);
        vec3 col = mix(uBody, mix(uBody, uLight, 0.45), smoothstep(0.0, 0.8, vV));
        if (!gl_FrontFacing) col *= vec3(0.78, 0.86, 0.94);               // the far wall, seen from inside: in shade
        float white = max(max(rim, foot * 0.8), streak * 0.6);
        col = mix(col, uLight, white);
        float alpha = mix(0.68, 0.95, white) * (1.0 - smoothstep(0.78, 1.0, vK));
        // anime water: flat colours, a white lip, no see-through
        if (uToon > 0.5) { col = mix(mix(uBody, uLight, gl_FrontFacing ? 0.4 : 0.15), uLight, step(0.5, white)); alpha = 1.0 - smoothstep(0.86, 1.0, vK); }
        alpha *= smoothstep(0.0, 0.035, vK);
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const jmat = new THREE.ShaderMaterial({
    uniforms: coneUniforms(),
    vertexShader: /* glsl */`
      attribute vec4 aCone;
      attribute float aSize;
      uniform float uTime;
      varying float vV, vK;
      void main() {
        ${LIFE}
        float v = position.y + 0.5;
        float kj = clamp((k - 0.22) / 0.78, 0.0, 1.0), rise = max(0.0, sin(kj * 3.14159265));
        float h = aSize * 1.25 * pow(rise, 0.85);
        // a cone: broad where it leaves the water, drawn out to a rounded tip that pinches as it falls back
        float r = aSize * (0.2 * pow(1.0 - v, 1.6) + 0.035 * sqrt(max(1.0 - v * v, 0.0))) * (0.55 + 0.45 * rise);
        vec3 p = aCone.xyz + vec3(position.x * r, v * h, position.z * r);
        float seed = fract(aCone.x * 0.37 + aCone.z * 0.71) * 6.2831853;
        float bend = v * v * aSize * rise;
        // A travelling bend follows the rising jet; its foot stays planted.
        p.x += bend * (sin(v * 4.0 - kj * 5.4 + seed) * 0.075 + cos(seed) * kj * 0.14);
        p.z += bend * (cos(v * 3.2 - kj * 4.2 + seed) * 0.055 + sin(seed) * kj * 0.14);
        vV = v; vK = kj;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        if (k < 0.22 || k > 1.0 || aSize < 0.4) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);      // footsteps throw no cone
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight, uBody;
      uniform float uToon;
      varying float vV, vK;
      void main() {
        float white = max(smoothstep(0.55, 1.0, vV), 1.0 - smoothstep(0.0, 0.08, vV));
        vec3 col = mix(mix(uBody, uLight, 0.3), uLight, white * 0.9);
        float alpha = mix(0.75, 0.95, white) * (1.0 - smoothstep(0.85, 1.0, vK));
        if (uToon > 0.5) { col = mix(mix(uBody, uLight, 0.4), uLight, step(0.6, vV)); alpha = 1.0 - smoothstep(0.88, 1.0, vK); }
        alpha *= smoothstep(0.0, 0.035, vK);
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true, depthWrite: false,
  });
  const cones = new THREE.Mesh(cgeo, cmat), jets = new THREE.Mesh(jgeo, jmat);
  cones.name = 'waterCrowns'; jets.name = 'waterCones';
  cones.frustumCulled = jets.frustumCulled = false;
  cones.renderOrder = 3; jets.renderOrder = 3;
  points.add(cones, jets);
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
    dispose() { geo.dispose(); mat.dispose(); cgeo.dispose(); jgeo.dispose(); tube.dispose(); tube2.dispose(); cmat.dispose(); jmat.dispose(); },
  };
}

