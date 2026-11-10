/* ==========================================================================
   volumetric-sky.js  —  an engine-style sky: atmosphere, sun and volumetric cumulus

     const sky = createVolumetricSky({ horizon: HAZE });
     scene.add(sky);
     await sky.userData.prewarm(renderer);          // first full picture of the clouds (while loading)
     sky.userData.update(renderer, dt);             // every frame: redraws a few rows of the cloud picture

   How it stays cheap: the clouds are far away, so what they look like does not depend on where the player
   stands. They are ray-marched (96 steps, 4 light samples, 3D noise) into a PANORAMA of the whole sky, a few
   rows per frame, and the dome just looks that picture up: two texture reads per pixel. A new panorama is
   finished every `cycle` seconds and cross-faded in, so the clouds drift and churn smoothly.

   Panorama channels: R = sunlight reaching the cloud, G = sky light (high in the cloud), B = haze (distance),
   A = how much of the sky the cloud covers. All premultiplied, so blending between pictures stays correct.
   Mobile-safe: no uniform arrays; the one loop is a plain constant-count march that indexes nothing.
   ========================================================================== */
import * as THREE from 'three';
import { _internal } from './stylized-nature.js';

const { rgb, mulberry32 } = _internal;

// live look controls (uniform objects, shared by the bake and the dome)
export const SKY_TUNE = {
  cover: { value: 0.5 },      // 0 clear .. 1 overcast
  density: { value: 1 },      // how solid the clouds are
  tall: { value: 1 },         // how high the towers grow
  speed: { value: 1 },        // drift
  haze: { value: 1 },         // how fast far clouds melt into the horizon
  cirrus: { value: 0.55 },    // thin high streaks
  shade: { value: 1 },        // how dark the shadowed side of a cloud is (0 = all white)
  blue: { value: 1 },         // depth of the sky's blue (the horizon colour never changes: the land fades into it)
  glow: { value: 1 },         // light scattered round the sun
  shadow: { value: 0.6 },     // cloud shadows on the land: how dark (used by cloud-shadows.js)
  shadowSize: { value: 380 }, // ... and how wide the pattern is, in metres
};

// --------------------------------------------------------------------------
// tiling 3D noise, made once on the CPU:  R = billowy Perlin-Worley (cloud bodies), G = Worley, coarse (puffs),
// B = Worley, fine (crumbs that eat the edges), A = smooth Perlin (where clouds are, cirrus)
// --------------------------------------------------------------------------
function buildNoise(S, seed) {
  const rng = mulberry32(seed * 977 + 3);
  const perm = new Uint8Array(512);
  {
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  }
  const GX = [1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0], GY = [1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1], GZ = [0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const perlin = (x, y, z, P) => {                       // lattice units, repeats every P
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
    const x0 = ix % P, x1 = (ix + 1) % P, y0 = iy % P, y1 = (iy + 1) % P, z0 = iz % P, z1 = (iz + 1) % P;
    const g = (a, b, c, dx, dy, dz) => { const h = perm[perm[perm[a] + b] + c] % 12; return GX[h] * dx + GY[h] * dy + GZ[h] * dz; };
    const u = fade(fx), v = fade(fy), w = fade(fz);
    const a = g(x0, y0, z0, fx, fy, fz), b = g(x1, y0, z0, fx - 1, fy, fz), c = g(x0, y1, z0, fx, fy - 1, fz), d = g(x1, y1, z0, fx - 1, fy - 1, fz);
    const e = g(x0, y0, z1, fx, fy, fz - 1), f = g(x1, y0, z1, fx - 1, fy, fz - 1), h = g(x0, y1, z1, fx, fy - 1, fz - 1), k = g(x1, y1, z1, fx - 1, fy - 1, fz - 1);
    const m0 = a + (b - a) * u, m1 = c + (d - c) * u, m2 = e + (f - e) * u, m3 = h + (k - h) * u;
    const n0 = m0 + (m1 - m0) * v, n1 = m2 + (m3 - m2) * v;
    return n0 + (n1 - n0) * w;
  };
  const worley = F => {                                    // 1 at a cell's seed point, falling to 0 between seeds
    const pts = new Float32Array(F * F * F * 3);
    for (let i = 0; i < pts.length; i++) pts[i] = rng();
    const out = new Float32Array(S * S * S), k = F / S;
    for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const px = (x + 0.5) * k, py = (y + 0.5) * k, pz = (z + 0.5) * k, cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
      let best = 9;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy, nz = cz + dz;
        const i = ((((nz % F) + F) % F) * F + (((ny % F) + F) % F)) * F + (((nx % F) + F) % F);
        const ex = nx + pts[i * 3] - px, ey = ny + pts[i * 3 + 1] - py, ez = nz + pts[i * 3 + 2] - pz, d = ex * ex + ey * ey + ez * ez;
        if (d < best) best = d;
      }
      out[(z * S + y) * S + x] = 1 - Math.min(1, Math.sqrt(best));
    }
    return out;
  };
  const w4 = worley(4), w8 = worley(8), w16 = worley(16);
  const data = new Uint8Array(S * S * S * 4);
  const fbm = (x, y, z, P) => (perlin(x * P, y * P, z * P, P) + 0.5 * perlin(x * P * 2, y * P * 2, z * P * 2, P * 2) + 0.25 * perlin(x * P * 4, y * P * 4, z * P * 4, P * 4)) / 1.75;
  const sat = v => Math.min(1, Math.max(0, v));
  for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (z * S + y) * S + x, u = (x + 0.5) / S, v = (y + 0.5) / S, w = (z + 0.5) / S;
    const coarse = w4[i] * 0.625 + w8[i] * 0.25 + w16[i] * 0.125, fine = w8[i] * 0.65 + w16[i] * 0.35;
    const billow = sat(Math.abs(fbm(u, v, w, 4)) * 2.4);
    data[i * 4] = 255 * sat(coarse + billow * (1 - coarse));
    data[i * 4 + 1] = 255 * coarse;
    data[i * 4 + 2] = 255 * fine;
    data[i * 4 + 3] = 255 * sat(0.5 + fbm(u + 0.31, v + 0.17, w + 0.53, 3) * 1.25);
  }
  const tex = new THREE.Data3DTexture(data, S, S, S);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  return tex;
}

// how a sky direction maps onto the panorama (shared by the bake and the dome): u goes round the horizon,
// v climbs from just under the horizon to straight up, with more rows spent low down where the player looks
const PANO = /* glsl */`
const float EL0 = -0.035, EL_SPAN = 1.6057963, TWO_PI = 6.2831853;
vec3 panoDir(vec2 uv) {
  float el = EL0 + EL_SPAN * (0.5 * uv.y + 0.5 * uv.y * uv.y), az = (uv.x - 0.5) * TWO_PI;
  return vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
}
vec2 panoUV(vec3 d) {
  float x = clamp((asin(clamp(d.y, -1.0, 1.0)) - EL0) / EL_SPAN, 0.0, 1.0);
  return vec2(atan(d.z, d.x) / TWO_PI + 0.5, -0.5 + sqrt(0.25 + 2.0 * x));
}`;

function bakeMaterial(noise, sun, tune) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uNoise: { value: noise }, uSize: { value: new THREE.Vector2(1, 1) }, uSun: { value: sun },
      uWind: { value: new THREE.Vector2() }, uChurn: { value: 0 },
      uCover: tune.cover, uDensity: tune.density, uTall: tune.tall, uHaze: tune.haze, uCirrus: tune.cirrus,
    },
    vertexShader: /* glsl */`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      ${PANO}
      uniform sampler3D uNoise;
      uniform vec2 uSize, uWind;
      uniform vec3 uSun;
      uniform float uChurn, uCover, uDensity, uTall, uHaze, uCirrus;
      // the cloud layer: flat bases at H0, towers up to H0 + TH; the world curves away faster than the real one,
      // so far clouds sink toward the horizon instead of piling up on it
      const float H0 = 1050.0, TH = 2700.0, CURV = 1.0 / 520000.0;
      vec3 gDir;
      float gT, gDt, gEnd, gFine, gTrans, gPhase, gHf;
      vec3 gAcc;

      float hash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }      // evenly spread dither
      // distance along the ray to a given height above the curved ground
      float reach(float h, float dy, float k) { return 2.0 * h / (dy + sqrt(dy * dy + 4.0 * k * h)); }

      // 0..1: how much cloud there is at p. fine = also add the small lumps (skipped for the far light samples)
      float cloud(vec3 p, float fine) {
        float alt = p.y + dot(p.xz, p.xz) * CURV;
        float hf = (alt - H0) / TH;
        gHf = hf;
        if (hf < 0.0 || hf > 1.0) return 0.0;
        vec2 w = p.xz + uWind;
        // where the clouds are: big patches, broken up by smaller ones
        float big = texture(uNoise, vec3(w / 21000.0, 0.21)).a;
        float cv = big * 0.6 + texture(uNoise, vec3(w.yx / 8300.0 + 0.37, 0.67)).a * 0.4;
        float th = mix(0.7, 0.3, uCover);
        float cov = smoothstep(th, th + 0.24, cv);
        // tall towers only in the heart of the big patches, low puffs elsewhere; flat base, rounded top
        float top = mix(0.2, 1.0, smoothstep(0.32, 0.64, big) * cov) * uTall;
        float env = cov * smoothstep(0.0, 0.06, hf) * (1.0 - smoothstep(top * 0.3, top, hf));
        if (env < 0.05) return 0.0;
        // the envelope is pushed in and out by billows of two sizes: that is what makes the cauliflower outline
        vec3 q = vec3(w.x, alt, w.y);
        float v = env + (texture(uNoise, q / 4600.0 + vec3(0.0, uChurn, 0.0)).r - 0.62) * 0.75;
        if (fine > 0.5) {
          vec4 m = texture(uNoise, q / 1500.0 + vec3(uChurn * 3.0, -uChurn * 5.0, 0.0));
          v += (m.g * 0.5 + m.b * 0.5 - 0.47) * 0.46;
        }
        return smoothstep(0.43, 0.53, v);
      }

      // long strides through clear air; on meeting cloud, step back and walk in with short steps, so the lit surface
      // is found at the same depth whatever the stride happened to be (no dither pattern on the cloud)
      void marchStep() {
        if (gTrans < 0.012 || gT > gEnd) return;
        vec3 p = gDir * gT;
        float d = cloud(p, 1.0);
        if (gFine < 0.5) {
          if (d > 0.002) { gT -= gDt * 0.75; gFine = 5.0; } else gT += gDt;
          return;
        }
        float st = gDt * 0.25;
        if (d > 0.002) {
          float hf = gHf;
          // how much cloud lies between here and the sun (the two near samples see the small lumps too)
          float od = d * 40.0 + cloud(p + uSun * 80.0, 1.0) * 110.0 + cloud(p + uSun * 220.0, 1.0) * 190.0
                   + cloud(p + uSun * 480.0, 0.0) * 340.0 + cloud(p + uSun * 950.0, 0.0) * 600.0;
          float tau = od * 0.0046 * uDensity;
          float lit = 0.68 * exp(-tau) + 0.32 * exp(-tau * 0.2);             // second term: light that scattered its way through
          float a = 1.0 - exp(-d * 0.024 * uDensity * st);
          float w = gTrans * a;
          gAcc.r += w * lit * gPhase;
          gAcc.g += w * clamp(0.15 + hf * 2.2, 0.0, 1.0);
          gAcc.b += w * (1.0 - exp(-gT * uHaze / 21000.0));
          gTrans *= 1.0 - a;
          gFine = 5.0;
        } else gFine -= 1.0;
        gT += st;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / uSize;
        gDir = panoDir(uv);
        float dy = gDir.y, k = max(1.0 - dy * dy, 1e-5) * CURV;
        float t0 = reach(H0, dy, k), t1 = min(reach(H0 + TH * min(uTall, 1.0), dy, k), 70000.0);
        gDt = max(t1 - t0, 0.0) / 64.0;
        gT = t0 + gDt * hash(gl_FragCoord.xy);
        gEnd = t1; gFine = 0.0; gTrans = 1.0; gAcc = vec3(0.0);
        // looking toward the sun the cloud edges glow; away from it they are a little flatter
        float mu = dot(gDir, uSun);
        float fwd = 0.19 / pow(1.36 - 1.2 * mu, 1.5);            // forward lobe: strong toward the sun, faint elsewhere
        gPhase = 0.78 + 0.3 * fwd + 0.06 * (1.0 - mu);
        for (int i = 0; i < 96; i++) marchStep();
        // thin high streaks, behind the cumulus
        float tc = reach(7400.0, dy, k);
        vec2 cw = gDir.xz * tc + uWind * 1.6;
        vec2 cr = vec2(cw.x * 0.8 + cw.y * 0.6, cw.y * 0.8 - cw.x * 0.6);
        float ci = texture(uNoise, vec3(cr.x / 52000.0, cr.y / 15000.0, 0.43)).a * 0.65 + texture(uNoise, vec3(cr.x / 17000.0, cr.y / 5200.0, 0.81)).a * 0.35;
        float ca = smoothstep(0.52, 0.8, ci) * uCirrus * 0.6 * smoothstep(0.0, 0.12, dy);
        float cwt = gTrans * ca;
        gAcc.r += cwt * 0.9; gAcc.g += cwt; gAcc.b += cwt * (1.0 - exp(-tc * uHaze / 30000.0));
        gTrans *= 1.0 - ca;
        float keep = smoothstep(-0.03, 0.0, dy);                 // nothing below the horizon
        gl_FragColor = vec4(gAcc.r * 0.8, gAcc.g, gAcc.b, 1.0 - gTrans) * keep;
      }`,
    depthTest: false, depthWrite: false,
  });
}

function domeMaterial(u) {
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      ${PANO}
      uniform sampler2D uPrev, uCur;
      uniform float uFade, uShadeK, uBlue, uGlow;
      uniform vec3 uTop, uMid, uHor, uSun, uSunCol, uLight, uAmbTop, uAmbBot;
      varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vW - cameraPosition);
        // the air: deep blue overhead, paling through the thick air near the horizon
        float h = 1.0 - max(d.y, 0.0), h2 = h * h, h4 = h2 * h2;
        vec3 air = mix(uTop, uMid, h2 * h);
        air = mix(air, uHor, h4 * h4 * h2);
        air = max(mix(uHor, air, uBlue), 0.0);
        float s = max(dot(d, uSun), 0.0), s2 = s * s, s8 = s2 * s2 * s2 * s2, s64 = s8 * s8 * s8 * s8 * s8 * s8 * s8 * s8;
        vec3 sky = mix(air, uSunCol, min((0.12 * s8 + 0.45 * s64) * uGlow, 1.0) * (1.0 - h4 * h4));             // light scattered round the sun: the blue whitens
        // the clouds
        vec2 uv = panoUV(d);
        vec4 c = mix(texture2D(uPrev, uv), texture2D(uCur, uv), uFade);
        float A = c.a;
        float inv = 1.0 / max(A, 0.004);
        vec3 shade = mix(uAmbBot, uAmbTop, clamp(c.g * inv, 0.0, 1.0));                        // in shadow: bluer and darker low in the cloud
        shade = max(mix(uLight, shade, uShadeK), 0.0);
        vec3 cl = mix(shade, uLight, smoothstep(0.22, 0.98, c.r * 1.25 * inv));
        vec3 far = mix(uHor, air, 0.55) * 1.02;                                               // what distance turns a cloud into
        cl = mix(cl, far, clamp(c.b * inv, 0.0, 1.0)) * A;
        float open = 1.0 - A;
        // the sun itself: a small hot disc and its bloom, dimmed by any cloud in front
        float disc = smoothstep(0.99935, 0.99962, s) + 0.5 * uGlow * s64 * s64 * s64 * s64;
        vec3 col = sky * open + cl + uSunCol * disc * open * open;
        col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;                                         // no banding in the gradient
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
}

export function createVolumetricSky({
  seed = 1, radius = 620, width = 2560, height = 640, cycle = 1, noiseSize = 64,
  top = '#1d68c9', mid = '#63a9e8', horizon = '#cde6f2', sunColor = '#fff6dc',
  light = '#ffffff', ambTop = '#c9d8ef', ambBot = '#8499bf',
  sun = [-0.4, 0.9, 0.5], wind = [12.5, 6],
} = {}) {
  const W = Math.round(width), H = Math.round(height);
  const sunDir = new THREE.Vector3(...sun).normalize();
  const noise = buildNoise(noiseSize, seed);
  const pool = [0, 1, 2].map(() => {
    const t = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    t.texture.wrapS = THREE.RepeatWrapping; t.texture.wrapT = THREE.ClampToEdgeWrapping; t.texture.colorSpace = THREE.NoColorSpace;
    t.scissorTest = true;
    return t;
  });
  let prev = pool[0], cur = pool[0], next = pool[1], row = 0, time = seed * 37.3, stamp = time, ready = false, rate = 1, hurryT = 0;

  const drift = new THREE.Vector2();
  const bake = bakeMaterial(noise, sunDir, SKY_TUNE);
  bake.uniforms.uSize.value.set(W, H);
  const bakeScene = new THREE.Scene(), bakeCam = new THREE.Camera();
  const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bake);
  bakeQuad.frustumCulled = false;
  bakeScene.add(bakeQuad);

  const u = {
    uPrev: { value: prev.texture }, uCur: { value: cur.texture }, uFade: { value: 1 },
    uShadeK: SKY_TUNE.shade, uBlue: SKY_TUNE.blue, uGlow: SKY_TUNE.glow,
    uTop: { value: rgb(top) }, uMid: { value: rgb(mid) }, uHor: { value: rgb(horizon) }, uSun: { value: sunDir }, uSunCol: { value: rgb(sunColor) },
    uLight: { value: rgb(light) }, uAmbTop: { value: rgb(ambTop) }, uAmbBot: { value: rgb(ambBot) },
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), domeMaterial(u));
  dome.renderOrder = -1000; dome.frustumCulled = false; dome.name = 'skyDome';
  const group = new THREE.Group();
  group.name = 'volumetricSky';
  group.add(dome);

  const rows = (renderer, target, y0, y1, at) => {
    bake.uniforms.uWind.value.set(wind[0] * at, wind[1] * at);
    bake.uniforms.uChurn.value = at * 0.0011;
    const saved = renderer.getRenderTarget(), auto = renderer.autoClear;
    renderer.autoClear = false;
    target.scissor.set(0, y0, W, y1 - y0);
    renderer.setRenderTarget(target);
    renderer.render(bakeScene, bakeCam);
    renderer.setRenderTarget(saved);
    renderer.autoClear = auto;
  };
  const show = () => { u.uPrev.value = prev.texture; u.uCur.value = cur.texture; };
  const compiled = renderer => {                     // false when the phone's driver refused the cloud shader
    const p = renderer.properties.get(bake).currentProgram;
    return !(p && p.diagnostics && p.diagnostics.runnable === false);
  };

  group.userData = {
    kind: 'sky', tune: SKY_TUNE, ok: true,
    get picture() { return cur; },                   // the panorama on show (for tests)
    // the first complete picture, in slices so no single draw is long enough to upset a phone's GPU watchdog
    async prewarm(renderer, slices = 16, pause = () => new Promise(r => setTimeout(r, 0))) {
      for (let i = 0; i < slices; i++) {
        rows(renderer, cur, Math.floor(H * i / slices), Math.floor(H * (i + 1) / slices), stamp);
        if (i === 0 && !compiled(renderer)) { group.userData.ok = false; return false; }
        if (i % 4 === 3) await pause();
      }
      ready = true; row = 0; stamp = time;
      return true;
    },
    bakeAll(renderer) {                              // tests: jump straight to the clouds of "now"
      rows(renderer, pool[0], 0, H, time);
      prev = cur = pool[0]; next = pool[1]; row = 0; stamp = time; ready = true; u.uFade.value = 1; show();
    },
    update(renderer, dt) {
      dt = Math.min(dt, 0.05);
      time += dt * SKY_TUNE.speed.value;
      if (!ready) return;
      let n = Math.min(Math.ceil(H / 14), Math.max(1, Math.round(H * dt * rate / cycle)));
      if (hurryT > 0) { hurryT -= dt; n = Math.ceil(H / 14); }
      const y1 = Math.min(H, row + n);
      rows(renderer, next, row, y1, stamp);
      row = y1;
      u.uFade.value = row / H;
      if (row >= H) {                                // the new picture is whole: it becomes the one we fade toward
        prev = cur; cur = next; next = pool.find(t => t !== prev && t !== cur);
        row = 0; stamp = time; u.uFade.value = 0; show();
      }
    },
    hurry(seconds = 2.5) { hurryT = seconds; },      // a slider moved: redraw the cloud picture as fast as allowed for a moment
    get drift() { return drift.set(wind[0] * time, wind[1] * time); },      // how far the wind has carried things, in metres (cloud shadows ride on it)
    get rate() { return rate; },
    setRate(r) { rate = Math.min(1, Math.max(0.125, r)); },      // 1 = a new cloud picture every `cycle` seconds; lower = cheaper, the drift just blends over longer
    dispose() { dome.geometry.dispose(); dome.material.dispose(); bake.dispose(); bakeQuad.geometry.dispose(); noise.dispose(); pool.forEach(t => t.dispose()); },
  };
  return group;
}
