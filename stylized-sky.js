/* ==========================================================================
   stylized-sky.js  —  skies and far scenery for the stylized nature kit

     scene.add(createPaintedSky({ seed: 3 }));        // deep blue, big white cumulus (anime look)
     scene.add(createWatercolorSky({ seed: 3 }));     // soft watercolour wash + painted clouds
     scene.add(createDistantMountains({ center }));   // layered ridges fading into blue haze
   set camera.far >= 1300. Pair with setHaze() from stylized-nature.js so the map
   fades into the same haze colour as the mountain feet and the horizon.
   Mobile-safe shaders: no uniform arrays, no loops.
   ========================================================================== */
import * as THREE from 'three';
import { _internal } from './stylized-nature.js';

const { NOISE, rgb, mulberry32, shared, fbm3 } = _internal;

// --------------------------------------------------------------------------
// the wash: a big dome around the world
// --------------------------------------------------------------------------
function skyDome({ top, mid, horizon, paper, pigment, radius }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uTop: { value: rgb(top) }, uMid: { value: rgb(mid) }, uHor: { value: rgb(horizon) },
      uPaper: { value: rgb(paper) }, uPig: { value: rgb(pigment) },
    },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform float uTime;
      uniform vec3 uTop, uMid, uHor, uPaper, uPig;
      varying vec3 vW;
      float fbm(vec2 p) {
        float s = 0.5 * noise2(p); p = p * 2.03 + 1.7;
        s += 0.25 * noise2(p);     p = p * 2.01 + 3.1;
        s += 0.125 * noise2(p);    p = p * 2.02 + 5.3;
        s += 0.0625 * noise2(p);
        return s / 0.9375;
      }
      void main() {
        vec3 d = normalize(vW - cameraPosition);
        float e = d.y;
        vec2 sp = d.xz / (max(e, 0.0) + 0.25);                         // sky-plane coordinates
        // the wash: an uneven gradient, never laid perfectly flat
        float wob = fbm(sp * 0.35 + 3.0) - 0.5;
        float ee = e + wob * 0.12;                                        // wet-in-wet: the edge of the wash wanders
        vec3 col = mix(uHor, uMid, smoothstep(-0.01, 0.13, ee));         // pale band at the horizon, softly graded
        col = mix(col, uTop, smoothstep(0.1, 0.5, ee));
        // pigment blooms (soft darker / lighter pools in the wash)
        float bloom = fbm(sp * 0.7 + 11.0);
        col *= 1.0 - (bloom - 0.5) * 0.22 * smoothstep(0.03, 0.25, e);
        // high wispy clouds: pigment lifted so the paper shows, darker pigment pooled around them
        vec2 cp = vec2(sp.x * 0.45, sp.y) * 0.55 + vec2(uTime * 0.004, 0.0);
        float c = fbm(cp);
        float hi = smoothstep(0.06, 0.3, e);
        float lifted = smoothstep(0.6, 0.68, c) * hi;
        float pooled = smoothstep(0.53, 0.6, c) * (1.0 - smoothstep(0.6, 0.66, c)) * hi;
        col = mix(col, col * 0.88 + uPig * 0.08, pooled * 0.85);
        col = mix(col, uPaper, lifted * 0.8);
        // granulation + paper grain (on the "paper", so in screen space)
        float gr = noise2(sp * 9.0) * 0.5 + hash2(floor(gl_FragCoord.xy * 0.5)) * 0.5;
        col *= 0.965 + gr * 0.05;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  dome.renderOrder = -1000;              // paint the paper first
  dome.frustumCulled = false;
  dome.name = 'skyDome';
  return dome;
}

// --------------------------------------------------------------------------
// one cumulus painted on a canvas like watercolour
// --------------------------------------------------------------------------
function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), k = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / k;
      acc += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / k;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}

function paintCloud(rng, { paper, shadow, rim }) {
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  // shape: a row of puffs, biggest in the middle, a second row on top, flat bottom
  g.fillStyle = '#fff';
  const base = H * 0.8;
  const n = 6 + Math.floor(rng() * 4);
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.3 + rng() * 0.4) / n;
    const r = H * (0.13 + 0.2 * Math.sin(Math.PI * u) + rng() * 0.06);
    puffs.push([W * (0.1 + 0.8 * u), base - r * (0.35 + rng() * 0.35), r]);
  }
  const m = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < m; i++) {
    const u = 0.3 + 0.4 * (i + rng()) / m;
    const r = H * (0.12 + rng() * 0.1);
    puffs.push([W * u, base - H * (0.32 + rng() * 0.14) - r * 0.4, r]);
  }
  for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  g.clearRect(0, base, W, H - base);
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const mask = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = d[i * 4 + 3] / 255;
  // soft painted arcs along the lower edge of each puff (where one puff sits over another)
  const arcsCv = document.createElement('canvas');
  arcsCv.width = W; arcsCv.height = H;
  const ag = arcsCv.getContext('2d', { willReadFrequently: true });
  ag.strokeStyle = '#fff'; ag.lineCap = 'round';
  for (const [x, y, r] of puffs) {
    ag.lineWidth = 3 + r * 0.06;
    ag.beginPath(); ag.arc(x, y, r * 0.92, Math.PI * (0.12 + rng() * 0.1), Math.PI * (0.78 + rng() * 0.12)); ag.stroke();
  }
  const arcsRaw = ag.getImageData(0, 0, W, H).data;
  const arcs0 = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) arcs0[i] = arcsRaw[i * 4 + 3] / 255;
  const arcs = boxBlur(arcs0, W, H, 3);
  // low-frequency blotches, like pigment settling unevenly while wet
  const G = 9, grid = [];
  for (let i = 0; i < (G + 1) * (G + 1); i++) grid.push(rng());
  const blotch = (x, y) => {
    const fx = x / W * G, fy = y / H * G, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const s = (t) => t * t * (3 - 2 * t), q = (a, b2) => grid[Math.min(G, b2) * (G + 1) + Math.min(G, a)];
    const top = q(ix, iy) + (q(ix + 1, iy) - q(ix, iy)) * s(tx), bot = q(ix, iy + 1) + (q(ix + 1, iy + 1) - q(ix, iy + 1)) * s(tx);
    return top + (bot - top) * s(ty);
  };
  const b = boxBlur(boxBlur(mask, W, H, 3), W, H, 3);          // wet edge: soft but still crisp
  const P = rgb(paper), S = rgb(shadow), Rm = rgb(rim);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const a = Math.min(1, Math.max(0, (b[i] - 0.3) / 0.3));
    if (a <= 0) { d[i * 4 + 3] = 0; continue; }
    const below = b[Math.min(H - 1, y + 14) * W + x];
    let sh = Math.min(1, Math.max(0, (b[i] - below) * 3.2));     // undersides of the puffs
    sh = Math.max(sh, Math.min(1, Math.max(0, (y - (base - H * 0.22)) / (H * 0.22))) * 0.9);   // the flat belly
    sh = Math.max(sh, arcs[i] * 0.55 * mask[i]);                                               // puff separations
    sh = Math.min(1, Math.max(0, sh + (blotch(x, y) - 0.5) * 0.35));                          // wet blotches
    const edge = Math.min(1, Math.max(0, (0.9 - b[i]) / 0.25)) * a * 0.7;                      // pigment pooled inside the wet edge
    const grain = 0.955 + Math.random() * 0.06;
    let r = P.x + (S.x - P.x) * sh * 0.85, gg = P.y + (S.y - P.y) * sh * 0.85, bb = P.z + (S.z - P.z) * sh * 0.85;
    r += (Rm.x - r) * edge; gg += (Rm.y - gg) * edge; bb += (Rm.z - bb) * edge;
    d[i * 4] = Math.min(255, r * grain * 255);
    d[i * 4 + 1] = Math.min(255, gg * grain * 255);
    d[i * 4 + 2] = Math.min(255, bb * grain * 255);
    d[i * 4 + 3] = a * 245;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --------------------------------------------------------------------------
export function createWatercolorSky({
  seed = 3, radius = 450, clouds = 12,
  top = '#6fb2db', mid = '#a9d6ea', horizon = '#eef5e4', paper = '#fcfaf2', pigment = '#4f86b8',
  cloudShadow = '#c3bfd8', cloudRim = '#a9aecb',
} = {}) {
  const rng = mulberry32(seed * 7717 + 13);
  const group = new THREE.Group();
  group.name = 'watercolorSky';
  const dome = skyDome({ top, mid, horizon, paper, pigment, radius });
  group.add(dome);
  // a handful of painted cumulus, reused around the horizon
  const textures = [];
  for (let i = 0; i < 5; i++) textures.push(paintCloud(rng, { paper, shadow: cloudShadow, rim: cloudRim }));
  const ring = new THREE.Group();
  for (let i = 0; i < clouds; i++) {
    const mat = new THREE.SpriteMaterial({ map: textures[i % textures.length], transparent: true, depthWrite: false, fog: false });
    const sp = new THREE.Sprite(mat);
    const a = i / clouds * Math.PI * 2 + rng() * 0.4, dist = 230 + rng() * 80;
    const w = 90 + rng() * 70;
    sp.scale.set(w * (rng() < 0.5 ? 1 : -1), w * 0.5, 1);
    sp.position.set(Math.cos(a) * dist, 14 + rng() * 30, Math.sin(a) * dist);
    ring.add(sp);
  }
  group.add(ring);
  dome.onBeforeRender = () => { ring.rotation.y = shared.uTime.value * 0.004; };   // slow drift
  group.userData = {
    kind: 'sky',
    dispose() { dome.geometry.dispose(); dome.material.dispose(); textures.forEach(t => t.dispose()); ring.children.forEach(s => s.material.dispose()); },
  };
  return group;
}


// ==========================================================================
// PAINTED (anime) SKY: deep blue gradient + big bright cumulus
// ==========================================================================
function paintedDome({ top, mid, horizon, wisp, radius }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uTop: { value: rgb(top) }, uMid: { value: rgb(mid) }, uHor: { value: rgb(horizon) }, uWisp: { value: rgb(wisp) } },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform float uTime;
      uniform vec3 uTop, uMid, uHor, uWisp;
      varying vec3 vW;
      float fbm(vec2 p) {
        float s = 0.5 * noise2(p); p = p * 2.03 + 1.7;
        s += 0.25 * noise2(p);     p = p * 2.01 + 3.1;
        s += 0.125 * noise2(p);    p = p * 2.02 + 5.3;
        s += 0.0625 * noise2(p);
        return s / 0.9375;
      }
      void main() {
        vec3 d = normalize(vW - cameraPosition);
        float e = d.y;
        vec3 col = mix(uHor, uMid, smoothstep(-0.01, 0.16, e));        // hazy, bright near the horizon
        col = mix(col, uTop, smoothstep(0.12, 0.62, e));               // deep blue overhead
        // thin streaky high clouds
        vec2 sp = d.xz / (max(e, 0.0) + 0.3);
        float c = fbm(vec2(sp.x * 0.35, sp.y * 1.1) + vec2(uTime * 0.003, 0.0));
        float w = smoothstep(0.6, 0.78, c) * smoothstep(0.1, 0.35, e) * 0.65;
        col = mix(col, uWisp, w);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  dome.name = 'skyDome';
  return dome;
}

// ---- cumulus clouds, lit by a shader -------------------------------------------------------------
// Each cloud is first sculpted as a HEIGHT MAP (bright = bulging toward the viewer): a heap of round masses with
// smaller bumps on top, like cauliflower. The shader then lights that relief from the sun's side in three painted
// tones (sunlit white, soft mid, blue-grey shadow), gives it a darker belly, lets its foot melt into the horizon
// haze and makes the outline billow slowly. So every cloud has form, and all of them agree on where the sun is.
function cumulusHeight(rng, tall = 1, K = 1) {
  const W = Math.round(512 * K), H = Math.round(384 * K);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const base = H * 0.86, cx = W * 0.5, halfW = W * (0.3 + rng() * 0.07), PAD = 8 * K;
  // outline: a low heap with a few broad towers rising out of it
  const towers = [];
  const nT = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < nT; i++) towers.push({ x: cx + (rng() - 0.55) * halfW * 0.95, h: H * (0.26 + rng() * 0.3) * tall, s: halfW * (0.26 + rng() * 0.2) });
  const env = x => {
    const u = (x - cx) / halfW;
    if (Math.abs(u) >= 1) return 0;
    const dome = Math.sqrt(1 - u * u);
    let h = H * 0.16 * dome;
    for (const t of towers) h = Math.max(h, t.h * Math.exp(-((x - t.x) ** 2) / (2 * t.s * t.s)) * Math.pow(dome, 0.6));
    return Math.min(h, base - H * 0.1);
  };
  // one rounded mass: a hemisphere of height v, kept where it is the highest thing there
  g.globalCompositeOperation = 'lighten';
  const blob = (x, y, r, v) => {
    r = Math.min(r, H * 0.19, x - PAD, W - PAD - x, y - PAD);       // shrink rather than touch the edge of the picture
    if (r < 3) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    for (const [t, k] of [[0, 1], [0.3, 0.954], [0.5, 0.866], [0.7, 0.714], [0.85, 0.527], [0.95, 0.312], [1, 0]]) {
      const c = Math.round(255 * v * k);
      gr.addColorStop(t, `rgb(${c},${c},${c})`);
    }
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  // the big masses that make the silhouette
  for (let x = cx - halfW; x < cx + halfW;) {
    const h = env(x);
    const r = Math.max(H * 0.05, h * (0.3 + rng() * 0.2));
    blob(x, base - Math.max(h - r * 0.85, r * 0.2), r, 0.4 + rng() * 0.3);
    if (h > H * 0.3) blob(x + (rng() - 0.5) * r, base - h * (0.25 + rng() * 0.3), r * (1.1 + rng() * 0.5), 0.4 + rng() * 0.25);   // body below a tower
    x += r * (0.55 + rng() * 0.45);
  }
  g.globalCompositeOperation = 'lighter';            // bumps ADD to the mass under them: relief on top of relief
  // medium bumps over the body, more of them near the top
  const nB = Math.round(26 + rng() * 14);
  for (let i = 0; i < nB; i++) {
    const x = cx + (rng() - 0.5) * halfW * 1.8, h = env(x);
    if (h < H * 0.07) continue;
    const r = Math.max(H * 0.035, h * (0.12 + rng() * 0.14));
    blob(x, base - h * (0.25 + Math.sqrt(rng()) * 0.62) + r * 0.6, r, 0.16 + rng() * 0.16);
  }
  // small bumps that break up the outline
  for (let x = cx - halfW; x < cx + halfW;) {
    const h = env(x), r = H * (0.018 + rng() * 0.03) + h * 0.03;
    blob(x, base - h + r * 0.9, r, 0.2 + rng() * 0.12);
    x += r * (1.1 + rng() * 1.4);
  }
  // a flat foot: the relief sinks to nothing at the base line
  g.globalCompositeOperation = 'multiply';
  const foot = g.createLinearGradient(0, base - H * 0.1, 0, base);
  foot.addColorStop(0, '#fff'); foot.addColorStop(1, '#000');
  g.fillStyle = foot; g.fillRect(0, base - H * 0.1, W, H * 0.1);
  g.fillStyle = '#000'; g.fillRect(0, base, W, H - base);
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;                 // it is data, not colour
  return t;
}

function cumulusMaterial(tex, { light, mid, shade, belly, horizon, sun }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: tex }, uTime: shared.uTime, uSun: { value: sun },
      uLight: { value: rgb(light) }, uMid: { value: rgb(mid) }, uShade: { value: rgb(shade) }, uBelly: { value: rgb(belly) }, uHor: { value: rgb(horizon) },
    },
    vertexShader: /* glsl */`
      uniform vec3 uSun;
      varying vec2 vUv;
      varying vec3 vL;          // the sun, seen from this cloud's own frame (x right, y up, z toward the viewer)
      varying float vWY;
      void main() {
        vUv = uv;
        vec3 X = normalize(modelMatrix[0].xyz), Y = normalize(modelMatrix[1].xyz), Z = normalize(modelMatrix[2].xyz);
        vL = normalize(vec3(dot(uSun, X), dot(uSun, Y), max(dot(uSun, Z), 0.3)));     // never fully back-lit: these are fair-weather clouds
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWY = wp.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform sampler2D uTex;
      uniform float uTime;
      uniform vec3 uLight, uMid, uShade, uBelly, uHor;
      varying vec2 vUv;
      varying vec3 vL;
      varying float vWY;
      void main() {
        // billowing, brushy outline: the picture is pushed about a little by slow noise
        vec2 uv = vUv;
        uv += (vec2(noise2(vUv * 5.0 + vec2(uTime * 0.02, 3.0)), noise2(vUv * 5.0 + vec2(7.0, uTime * 0.017))) - 0.5) * 0.03;
        uv += (vec2(noise2(vUv * 19.0), noise2(vUv * 19.0 + 11.0)) - 0.5) * 0.008;
        float h = texture2D(uTex, uv).r;
        float a = smoothstep(0.06, 0.1, h);
        if (a < 0.004) discard;
        // slope of the relief -> which way this bit of cloud faces: each bump, and the cloud's broad masses (blurred look-up)
        vec2 sunDir = normalize(vL.xy + 1e-4);
        vec2 e = vec2(0.006, 0.008);
        float dx = texture2D(uTex, uv + vec2(e.x, 0.0)).r - texture2D(uTex, uv - vec2(e.x, 0.0)).r;
        float dy = texture2D(uTex, uv + vec2(0.0, e.y)).r - texture2D(uTex, uv - vec2(0.0, e.y)).r;
        vec2 E = vec2(0.03, 0.04);
        float bx = texture2D(uTex, uv + vec2(E.x, 0.0), 3.5).r - texture2D(uTex, uv - vec2(E.x, 0.0), 3.5).r;
        float by = texture2D(uTex, uv + vec2(0.0, E.y), 3.5).r - texture2D(uTex, uv - vec2(0.0, E.y), 3.5).r;
        float tilt = dot(vec2(-dx, -dy), sunDir) * 5.5 + dot(vec2(-bx, -by), sunDir) * 1.6;      // > 0: faces the sun
        // painted light: bulges facing the sun and the upper parts are white, undersides and far sides fall into shadow
        float l = 0.5 + tilt + (vUv.y - 0.42) * 0.5 - dot(vUv - 0.5, sunDir * vec2(1.0, 0.0)) * -0.25 + (noise2(vUv * 9.0 + 4.0) - 0.5) * 0.05;
        vec3 col = mix(uShade, uMid, smoothstep(0.3, 0.37, l));
        col = mix(col, uLight, smoothstep(0.45, 0.53, l));
        col = mix(col, uBelly, (1.0 - smoothstep(0.15, 0.3, vUv.y)) * 0.7);          // heavier, bluer belly
        col = mix(col, uHor, 0.5 * (1.0 - smoothstep(-5.0, 120.0, vWY)));            // the foot melts into the horizon haze
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false,
  });
}

export function createPaintedSky({
  seed = 3, radius = 620, clouds = 10, small = 9, far = 12, size = 1,
  top = '#2a78cc', mid = '#78b6e6', horizon = '#cde6f2', wisp = '#e9f4fb',
  light = '#ffffff', cloudMid = '#e9f0f8', cloudShade = '#b4c8e0', belly = '#9db5d3',
  sun = [-0.4, 0.9, 0.5],
} = {}) {
  const rng = mulberry32(seed * 911 + 5);
  const group = new THREE.Group();
  group.name = 'paintedSky';
  const dome = paintedDome({ top, mid, horizon, wisp, radius });
  group.add(dome);
  const pal = { light, mid: cloudMid, shade: cloudShade, belly, horizon, sun: new THREE.Vector3(...sun).normalize() };
  const big = [], little = [];
  for (let i = 0; i < 5; i++) big.push(cumulusMaterial(cumulusHeight(rng, 1.45, 1.5), pal));
  for (let i = 0; i < 3; i++) little.push(cumulusMaterial(cumulusHeight(rng, 0.8, 0.75), pal));
  const quad = new THREE.PlaneGeometry(1, 0.75);
  const ring = new THREE.Group();
  const put = (mat, a, dist, baseY, w, order) => {
    const m = new THREE.Mesh(quad, mat);
    m.scale.set(w, w, 1);
    m.position.set(Math.cos(a) * dist, baseY + w * 0.75 * 0.36, Math.sin(a) * dist);     // the cloud's flat foot sits at baseY
    m.lookAt(0, m.position.y, 0);
    m.renderOrder = -900 + order;                    // after the dome, far clouds first
    m.frustumCulled = false;
    ring.add(m);
  };
  // a far row low on the horizon, towering cumulus in front of it, small puffs high up
  for (let i = 0; i < far; i++) put(little[i % little.length], (i + rng()) / far * Math.PI * 2, 585 + rng() * 15, 4 + rng() * 34, (90 + rng() * 80) * size, 0);
  for (let i = 0; i < clouds; i++) put(big[i % big.length], (i + 0.2 + rng() * 0.6) / clouds * Math.PI * 2, 500 + rng() * 60, -6 + rng() * 40, (210 + rng() * 170) * size, 1);
  for (let i = 0; i < small; i++) put(little[i % little.length], (i + rng()) / small * Math.PI * 2, 480 + rng() * 70, 170 + rng() * 170, 80 + rng() * 80, 2);      // drawn last: a small puff may drift in front of a tower, never half-hidden behind one
  group.add(ring);
  dome.onBeforeRender = () => { ring.rotation.y = shared.uTime.value * 0.003; };
  group.userData = {
    kind: 'sky',
    dispose() { dome.geometry.dispose(); dome.material.dispose(); quad.dispose(); [...big, ...little].forEach(m => { m.uniforms.uTex.value.dispose(); m.dispose(); }); },
  };
  return group;
}

// ==========================================================================
// DISTANT MOUNTAINS: rings of ridge silhouettes, deep green near -> pale blue far
// ==========================================================================
const RIDGES = [   // near -> far: forested blue-green hills, then mountains melting into the haze
  { r: 170, h: [6, 22], top: '#4a8566', lit: '#67a07b', base: '#a9cfd4', trees: 1.6, seg: 900, f: 3.4 },
  { r: 240, h: [14, 40], top: '#6b9db0', lit: '#88b5c5', base: '#bcd9e5', trees: 1.0, seg: 640, f: 2.7 },
  { r: 320, h: [26, 66], top: '#8ab2cf', lit: '#a2c3dc', base: '#c9e1ee', trees: 0, seg: 460, f: 2.1 },
  { r: 400, h: [32, 82], top: '#a7c6df', lit: '#bad3e7', base: '#d3e8f2', trees: 0, seg: 380, f: 1.7 },
];

function ridgeMaterial(L) {
  return new THREE.ShaderMaterial({
    uniforms: { uTop: { value: rgb(L.top) }, uLit: { value: rgb(L.lit) }, uBase: { value: rgb(L.base) }, uTrees: { value: L.trees > 0 ? 1 : 0 } },
    vertexShader: /* glsl */`
      attribute float aT;      // 0 at the foot .. 1 on the ridge line
      attribute float aA;      // angle around the ring
      varying float vT;
      varying float vA;
      varying float vY;
      void main() { vT = aT; vA = aA; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform vec3 uTop, uLit, uBase;
      uniform float uTrees;
      varying float vT;
      varying float vA;
      varying float vY;
      void main() {
        // sunlit slopes: big soft planes picked out in a lighter tone
        float slope = noise2(vec2(vA * 9.0, vY * 0.05)) * 0.7 + noise2(vec2(vA * 31.0, vY * 0.12)) * 0.3;
        vec3 col = slope > 0.55 ? uLit : uTop;
        // forest texture on the near ridges: soft blobs of tree crowns
        if (uTrees > 0.5 && noise2(vec2(vA * 140.0, vY * 0.9)) > 0.6) col *= 0.9;
        // haze gathers low in the valleys
        col = mix(uBase, col, smoothstep(0.05, 0.75, vT));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

export function createDistantMountains({ center = [0, -20], seed = 2, foot = -35, layers = RIDGES } = {}) {
  const group = new THREE.Group();
  group.name = 'distantMountains';
  const mats = [];
  layers.forEach((L, li) => {
    const pos = [], tt = [], aa = [], idx = [];
    for (let i = 0; i <= L.seg; i++) {
      const a = i / L.seg * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      // periodic ridge profile: noise sampled on a circle so there is no seam
      let n = fbm3(c * L.f + li * 7.1, s * L.f, seed + li * 3.3, seed + li, 4);
      n = Math.pow(Math.min(1, Math.max(0, (n - 0.25) / 0.6)), 1.4);
      let y = L.h[0] + (L.h[1] - L.h[0]) * n;
      if (L.trees) y += (fbm3(c * 60, s * 60, li + 0.5, seed + 9, 2) - 0.5) * L.trees * 2 + Math.abs(Math.sin(a * L.r * 1.7)) * L.trees * 0.6;  // treeline bumps
      const x = center[0] + c * L.r, z = center[1] + s * L.r;
      pos.push(x, foot, z, x, y, z);
      tt.push(0, 1); aa.push(a, a);
    }
    for (let i = 0; i < L.seg; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(aa, 1));
    g.setIndex(idx);
    const m = ridgeMaterial(L);
    mats.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = -900 + li;
    group.add(mesh);
  });
  group.userData = { kind: 'mountains', dispose() { group.children.forEach(m => m.geometry.dispose()); mats.forEach(m => m.dispose()); } };
  return group;
}
