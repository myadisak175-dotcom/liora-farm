/* ==========================================================================
   cave-water.js  —  the water of a room of the caves' kit: its pools, its streams, its falls

     const water = await createCaveWater({ bin, mesh, scale, sprite, kind, fog, fogDensity })
       bin, mesh   the room's baked file and where its water lies in it (bin.water of the room's json: tools/make-cave-room.py)
       scale       what the baked light was divided by (bin.lightScale)
       sprite      { uSprPos, uSprCol }: the one light that moves (cave-light.js' uniforms, shared)
       kind        the water's kind by a word (WATERS, below), or its own colours
     group.add(water.object);      every frame: water.update(dt)
     water.ripple(x, y, z, strength, radius, mode)      something touches the water at that height (her step, a splash)

   One job: to draw whatever water the bake laid (it decides where water lies: a pool fills its hollow, a stream runs in
   its bed, a fall hangs from a lip to a foot). The game's own water (stylized-water.js) reads its depth from the open
   land's one picture of heights and takes its light from the sky, so it cannot be a cave's; this one borrows its colours
   (clear at the shore, turquoise, then deep) and its painted foam, and takes its light from the cave. What it draws:
     the surface   one sheet for every water that meets at one height, cut to its shore per pixel by the depth under it
                   (the bake's); clear where it is shallow (the bed and her legs show), deeper and darker further in; a
                   foam line along the shore; pale cells over the shallows; long strokes sliding down a stream, faster
                   where it is steeper (two takes of the flow faded over one another, so nothing stretches as time goes);
                   a sheen where it is seen at a low angle; rings where something touches it (four at a time)
     a fall        a sheet through the air, pale streaks running down it, thin at its lip and soft at its sides
     its foot      foam churning out from where it lands
   Lit by the light baked on it (the lamps, with their shadows) and the sprite's; "glow" water gives a little of its own.
   No mirror, no waves that travel, no spray or mist (the air and the things of a room are another piece).
   Mobile-safe: no uniform arrays, no loops; one picture (the game's painted foam).
   ========================================================================== */
import * as THREE from 'three';

export const WATERS = {       // a room's water by a word (a room's description: "water"); add a kind here and every room may ask for it
  clear: { shallow: '#60d7c9', mid: '#26abc7', deep: '#1b6fa8', foam: '#f6fcff', clear: 1.0, glow: 0.0 },      // the game's own colours
  dark: { shallow: '#2f7480', mid: '#15465c', deep: '#081d2e', foam: '#d2e8ee', clear: 0.5, glow: 0.0 },       // still and deep: little of the bed shows
  glow: { shallow: '#86f2e2', mid: '#3ccadb', deep: '#1d83b4', foam: '#f6fffb', clear: 1.0, glow: 0.2 },       // faintly its own light
};

const loadFoam = () => new Promise((res) => {
  new THREE.TextureLoader().load(new URL('./assets/water/foam-brush-v1.png', import.meta.url).href, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; res(t);
  }, undefined, () => res(null));
});
const hex3 = (h) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };

const VS = /* glsl */`
attribute vec4 aInfo;
attribute vec4 aLight;
uniform float uScale;
varying vec3 vW, vL;
varying vec4 vI;
varying vec2 vUv;
varying float vD;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vI = aInfo; vUv = uv; vL = aLight.rgb * uScale;
  vec4 mv = viewMatrix * w;
  vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */`
uniform sampler2D uFoam;
uniform float uTime, uGlow, uClear, uFogD;
uniform vec3 uShallow, uMid, uDeep, uFoamCol, uFogCol;
uniform vec4 uSprPos;
uniform vec3 uSprCol;
uniform vec4 uRingA0, uRingB0, uRingA1, uRingB1, uRingA2, uRingB2, uRingA3, uRingB3;      // A: where (x, y, z), born (s); B: how big, how long
varying vec3 vW, vL;
varying vec4 vI;
varying vec2 vUv;
varying float vD;
float ring(vec4 a, vec4 b) {
  float age = uTime - a.w;
  if (b.x <= 0.0 || age < 0.0 || age > b.y || abs(vW.y - a.y) > 0.35) return 0.0;
  float k = age / b.y, dd = length(vW.xz - a.xz) - b.x * (0.2 + 1.5 * k);
  return exp(-dd * dd / 0.005) * (1.0 - k) * (1.0 - k);
}
void main() {
  vec3 L = vL;
  vec3 sd = uSprPos.xyz - vW; float sk = length(sd) / max(uSprPos.w, 1e-3);
  L += uSprCol * (uSprPos.w > 0.0 ? (1.0 - smoothstep(0.0, 1.0, sk)) / (1.0 + 9.0 * sk * sk) : 0.0);
  vec3 col; float alpha;
#if PART == 0
  // ---- the surface
  float d = vI.x;
  if (d < -0.03) discard;
  float shore = smoothstep(-0.03, 0.03, d);
  vec2 flow = vI.yz, p = vW.xz;
  float speed = length(flow);
  // the flow, two takes of it faded over one another (each runs half a second's worth and begins again unseen)
  float ph0 = fract(uTime * 0.4), ph1 = fract(uTime * 0.4 + 0.5), w0 = 1.0 - abs(2.0 * ph0 - 1.0);
  vec2 drift = vec2(uTime * 0.014, uTime * 0.009);
  vec2 q0 = p - flow * (ph0 - 0.5) * 2.2, q1 = p - flow * (ph1 - 0.5) * 2.2 + 0.37;
  float broad = mix(texture2D(uFoam, q1 * 0.19 + drift).r, texture2D(uFoam, q0 * 0.19 + drift).r, w0);
  float fine = mix(texture2D(uFoam, q1 * 0.47 - drift * 1.7).r, texture2D(uFoam, q0 * 0.47 - drift * 1.7).r, w0);
  col = mix(uShallow, uMid, smoothstep(0.04, 0.45, d));
  col = mix(col, uDeep, smoothstep(0.45, 1.5, d));
  alpha = mix(1.0 - 0.7 * uClear, 0.94, smoothstep(0.0, 0.75, d));
  vec3 lit = L + uGlow;
  col *= lit;
  // pale cells over the shallows; strokes down a stream; a foam line along the shore; rings
  float shallow = 1.0 - smoothstep(0.08, 0.6, d);
  col += uFoamCol * lit * smoothstep(0.5, 0.8, fine) * shallow * 0.16;
  float strokes = smoothstep(0.38, 0.72, broad * 0.55 + fine * 0.6) * clamp(speed * 1.6, 0.0, 1.0);
  float foam = smoothstep(0.11, 0.025, d + (broad - 0.5) * 0.07) * shore;
  float rings = ring(uRingA0, uRingB0) + ring(uRingA1, uRingB1) + ring(uRingA2, uRingB2) + ring(uRingA3, uRingB3);
  float white = clamp(foam * 0.85 + strokes * 0.65 + rings * 0.7, 0.0, 1.0);
  col = mix(col, uFoamCol * (lit + 0.05), white);
  // seen low: it gives back the cave's light
  vec3 V = normalize(cameraPosition - vW);
  float low = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
  col = mix(col, lit * (0.7 + 0.6 * fine) + uFogCol * 0.5, low * 0.4);
  alpha = max(clamp(alpha + low * 0.25, 0.0, 0.96), white * 0.9) * shore;
#elif PART == 1
  // ---- a fall: streaks running down a sheet
  float u = vUv.x, v = vUv.y;
  float side = smoothstep(0.0, 0.18, u) * smoothstep(1.0, 0.82, u);
  float s1 = texture2D(uFoam, vec2(u * 0.8 + 0.13, v * 0.16 - uTime * 0.6)).r, s2 = texture2D(uFoam, vec2(u * 1.6, v * 0.33 - uTime * 0.95)).r;
  float white = smoothstep(0.25, 0.7, s1 * 0.6 + s2 * 0.6);
  col = mix(uShallow, uFoamCol, 0.45 + 0.55 * white) * (L * 1.3 + 0.2 + uGlow);      // (white water catches what light there is)
  alpha = side * (0.62 + 0.36 * white) * smoothstep(0.0, 0.25, v);
#else
  // ---- its foot: foam churning out from where it lands
  float r = vUv.y;
  float c1 = texture2D(uFoam, vec2(vUv.x * 3.0 + uTime * 0.02, r * 1.1 - uTime * 0.35)).r, c2 = texture2D(uFoam, vec2(vUv.x * 5.0 - uTime * 0.03, r * 1.9 - uTime * 0.55)).r;
  float froth = smoothstep(0.25, 0.7, c1 * 0.6 + c2 * 0.5 + (1.0 - r) * 0.45);
  col = uFoamCol * (L * 1.3 + 0.2 + uGlow);
  alpha = (1.0 - smoothstep(0.45, 1.0, r)) * (0.35 + 0.65 * froth);
#endif
  col = mix(col, uFogCol, clamp(1.0 - exp(-vD * uFogD), 0.0, 0.88));
  gl_FragColor = vec4(col, alpha);
}`;

export async function createCaveWater({ bin, mesh, scale = 4, sprite = null, kind = 'clear', fog = '#0a1420', fogDensity = 0.018 } = {}) {
  const look = typeof kind === 'string' ? (WATERS[kind] || WATERS.clear) : { ...WATERS.clear, ...kind };
  const foamTex = await loadFoam();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, mesh.pos, mesh.vertices * 3), 3));
  g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(bin, mesh.info, mesh.vertices * 4), 4));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, mesh.uv, mesh.vertices * 2), 2));
  g.setAttribute('aLight', new THREE.BufferAttribute(new Uint8Array(bin, mesh.light, mesh.vertices * 4), 4, true));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, mesh.idx, mesh.indices), 1));
  g.computeBoundingSphere();
  const none = () => ({ value: new THREE.Vector4(0, -999, 0, -99) });
  const uniforms = {
    uFoam: { value: foamTex }, uTime: { value: 0 }, uScale: { value: scale },
    uShallow: { value: hex3(look.shallow) }, uMid: { value: hex3(look.mid) }, uDeep: { value: hex3(look.deep) }, uFoamCol: { value: hex3(look.foam) },
    uClear: { value: look.clear }, uGlow: { value: look.glow }, uFogCol: { value: typeof fog === 'string' ? hex3(fog) : fog }, uFogD: { value: fogDensity },
    uSprPos: sprite ? sprite.uSprPos : { value: new THREE.Vector4(0, -999, 0, 0) }, uSprCol: sprite ? sprite.uSprCol : { value: new THREE.Vector3() },
    uRingA0: none(), uRingB0: { value: new THREE.Vector4() }, uRingA1: none(), uRingB1: { value: new THREE.Vector4() },
    uRingA2: none(), uRingB2: { value: new THREE.Vector4() }, uRingA3: none(), uRingB3: { value: new THREE.Vector4() },
  };
  const part = (n, side) => {
    const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms, defines: { PART: n }, transparent: true, depthWrite: false, side });
    m.userData.noCave = true;                              // (its light is its own: baked, and the sprite's read here)
    return m;
  };
  const materials = [part(0, THREE.FrontSide), part(1, THREE.DoubleSide), part(2, THREE.FrontSide)];
  ['surface', 'falls', 'feet'].forEach((name, i) => { const [start, count] = mesh.parts[name] || [0, 0]; if (count) g.addGroup(start, count, i); });
  const object = new THREE.Mesh(g, materials);
  object.name = 'cave-water'; object.renderOrder = 3;
  let next = 0;
  return {
    object, uniforms, look,
    update(dt) { uniforms.uTime.value += dt; },
    // something touches the water (player-moves.js' own call, through the level): a ring that widens and dies away
    ripple(x, y, z, strength = 1, radius = 0.3, mode = null) {
      const life = mode === 'splash' ? 1.5 : mode === 'step' ? 0.9 : 1.2;
      uniforms['uRingA' + next].value.set(x, y, z, uniforms.uTime.value);
      uniforms['uRingB' + next].value.set(0.35 + 0.45 * Math.min(strength, 2.5) + radius, life, 0, 0);
      next = (next + 1) % 4;
    },
    dispose() { g.dispose(); for (const m of materials) m.dispose(); if (foamTex) foamTex.dispose(); },
  };
}
