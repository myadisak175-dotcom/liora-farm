/* ==========================================================================
   stylized-rockface.js  —  rock that reads as big broken blocks, not as layers of cake

   The land's own paint (stylized-terrain.js) draws a cliff as level bands of colour, one above the other. This paint draws
   the same land, but its rock as a wall of broken blocks:
     - the face is cut into blocks of different sizes (a cell pattern laid on the face), each block a flat facet turned a
       little its own way, so one is in the sun, the next in half shade, the next in shadow: the eye reads them as solid
     - dark cracks between the blocks; a light rim along the top edge of each ledge
     - grass and moss spill over the lip of every ledge and hang down the face in tongues, and grow in the cracks
     - at the foot of a wall the grass goes dark and damp, with stones and earth in it
   The grass, the sand at the water and the paths are drawn as by the land's own paint, so the two sit side by side.

     const mat = rockLandMaterial({ far });
     geometry attributes: aBank (height above the water: sand below 0.62), aPath (1 on a path), aTop (metres down from the
     highest ground within ~2 m: small just under a lip, large at the foot of a wall)
   ========================================================================== */
import * as THREE from 'three';
import { _internal } from './stylized-nature.js';
import { _strata } from './stylized-terrain.js';

const { NOISE, HAZEF, rgb, shared } = _internal;
const { HAZEV, colors: TC } = _strata;

export const ROCK_COLORS = {
  lit: '#e0d9c8', mid: '#b2ada1', shade: '#7d868c', deep: '#5d6973', crack: '#46515b',      // a cool grey stone, warm in the sun
  moss: '#6f9440', mossDark: '#4f7134', damp: '#5f7d36', earth: '#9b8462',
};

export function rockLandMaterial({ far = '#cde6f2' } = {}) {
  const C = TC, R = ROCK_COLORS;
  return new THREE.ShaderMaterial({
    uniforms: {
      uG0: { value: rgb(C.grass[0]) }, uG1: { value: rgb(C.grass[1]) }, uG2: { value: rgb(C.grass[2]) }, uG3: { value: rgb(C.grass[3]) },
      uB0: { value: rgb(C.sand[0]) }, uB1: { value: rgb(C.sand[1]) }, uB2: { value: rgb(C.sand[2]) },
      uP0: { value: rgb(C.path[0]) }, uP1: { value: rgb(C.path[1]) },
      uK0: { value: rgb(R.lit) }, uK1: { value: rgb(R.mid) }, uK2: { value: rgb(R.shade) }, uK3: { value: rgb(R.deep) }, uK4: { value: rgb(R.crack) },
      uM0: { value: rgb(R.moss) }, uM1: { value: rgb(R.mossDark) }, uDamp: { value: rgb(R.damp) }, uEarth: { value: rgb(R.earth) },
      uSun: { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() },
      uFar: { value: rgb(far) },
      uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
    },
    vertexShader: /* glsl */`
      ${HAZEV}
      attribute float aBank;
      attribute float aPath;
      attribute float aTop;
      varying vec3 vWP;
      varying vec3 vN;
      varying float vBank, vPath, vTop;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vBank = aBank; vPath = aPath; vTop = aTop;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${HAZEF}
      uniform vec3 uG0, uG1, uG2, uG3, uB0, uB1, uB2, uP0, uP1, uK0, uK1, uK2, uK3, uK4, uM0, uM1, uDamp, uEarth, uFar, uSun;
      varying vec3 vWP;
      varying vec3 vN;
      varying float vBank, vPath, vTop;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      // cells: x = distance to the nearest cell's heart, y = how far from the border between two cells, z = which cell
      vec3 cells(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        float f1 = 9.0, f2 = 9.0, id = 0.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y)), o = vec2(h1(i + g), h1(i + g + 17.3)) * 0.8 + 0.1;
          float d = length(g + o - f);
          if (d < f1) { f2 = f1; f1 = d; id = h1(i + g + 5.1); } else if (d < f2) f2 = d;
        }
        return vec3(f1, f2 - f1, id);
      }
      vec3 grassAt(vec3 n, float j) {
        float s = noise2(vWP.xz * 0.08) * 0.6 + noise2(vWP.xz * 0.3) * 0.3 + noise2(vWP.xz * 1.6) * 0.1;
        float lit = dot(n, normalize(vec3(-0.3, 1.0, 0.35)));
        float g = s * 0.6 + (lit - 0.9) * 2.6 + 0.2;
        return g > 0.6 ? uG3 : (g > 0.45 ? uG2 : (g > 0.3 ? uG1 : uG0));
      }
      void main() {
        vec3 n = normalize(vN);
        float j = noise2(vWP.xz * 0.9) * 0.5 + noise2(vWP.xz * 3.0) * 0.25;
        vec3 col;
        float steep = n.y + (j - 0.37) * 0.25;
        if (steep < 0.66) {
          // ---- the wall behind the blocks (rock-blocks.js): plain deep stone, so a gap between two blocks reads as a crack
          float v = noise2(vWP.xz * 0.2 + vWP.y * 0.1);
          col = v > 0.6 ? uK2 : (v > 0.3 ? uK3 : uK4);
          // grass and moss hanging over the lip of a ledge of the land itself
          float streak = noise2(vec2(dot(vWP.xz, vec2(0.71, 0.7)) * 0.75, vWP.y * 0.05));
          float hang = 0.3 + 2.4 * smoothstep(0.45, 0.85, streak);
          if (vTop < hang) col = vTop < hang * 0.5 ? uM0 : uM1;
          if (vTop < 0.22 + 0.4 * streak) col = grassAt(vec3(0.0, 1.0, 0.0), j);
        } else {
          col = grassAt(n, j);
          // the foot of a wall: dark damp grass, patches of earth and fallen stones
          float foot = smoothstep(2.0, 4.0, vTop) * smoothstep(0.85, 0.7, n.y + 0.2) + smoothstep(2.5, 5.0, vTop) * 0.6;
          if (foot > 0.35 + (noise2(vWP.xz * 0.7) - 0.5) * 0.5) {
            col = noise2(vWP.xz * 0.45 + 3.0) > 0.62 ? uEarth : uDamp;
            vec2 pc = vWP.xz * 2.2, pi = floor(pc);
            vec2 pd = fract(pc) - 0.5 - (vec2(h1(pi + 1.3), h1(pi + 7.1)) - 0.5) * 0.5;
            float pr = 0.12 + 0.18 * h1(pi + 3.7);
            if (h1(pi) < 0.32 && length(pd) < pr) col = dot(pd, vec2(0.6, -0.8)) > 0.3 * pr ? uK2 : uK1;
          }
          float b = vBank + (j - 0.37) * 0.5;
          if (b < 0.62) col = b < 0.16 ? uB2 : (noise2(vWP.xz * 0.35) > 0.55 ? uB0 : uB1);
          float p = vPath + (j - 0.37) * 0.45;
          if (p > 0.5) col = p > 0.72 ? uP0 : uP1;
        }
        col = mix(col, uHaze, vHaze);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
