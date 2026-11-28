/* ==========================================================================
   cave-mouth.js  —  the dungeon's mouth behind the big fall's middle strand, in the hill village (a trial: index.html ?cave=1)

     const mouth = await createCaveMouth({ level })      // before the player is made: the ledge is the level's ground there
     scene.add(mouth.group)                              // before shadows.apply and the warm-up (it takes the hour's light)
     every frame: mouth.update(dt, player)               // as she comes near the fall: mouth.onNear(); walking into the dark
                                                         // behind it: mouth.onEnter() (the game's dungeon: dungeon-in-game.js)
     mouth.use(cave)        she is in the dungeon: the level she plays on is the cave's (cave-level.js); use(null): the
                            village's again
     mouth.floating         the level as what floats beside her sees it (the sprite: createSpriteCompanion): the floor under
                            it, in the cave too (where the level's own heightAt counts the rock as far up, for her camera)
     mouth.spot             on the ledge, facing out: where she is as she comes back out
     level.views.cavemouth  the same (?view=cavemouth)

   The land parts the big fall into three strands, with ribs of rock between them (land-water.js); behind the middle one,
   between two ribs, there is now a ledge of rock a little over the plunge pool, and in the cliff behind it the dark of a
   cave. She gets there through the falling water: swimming into the ledge's edge she climbs out onto it (the game's own
   climb out of the water, as up any bank). Walking into the dark, the dungeon is entered: in the game itself, its room
   loaded into the page beside the village (dungeon-in-game.js; it begins to load as she comes near the fall, NEAR), so
   going in is a moment's dark and coming out is at once, the village never left. (Until 28 Nov 2026 the dungeon was a page
   of its own, dungeon.html, and the village was loaded again as she came out: some 20 s, "นานมาก ... โหลดข้อมูลที่จำเป็น
   ก็พอ". That page is still there, the room by itself.)
   While she is in there every question the player, her steps, her camera and the sprite ask of the level is the cave's:
   the functions this file put in the level's place answer from it (the player keeps them from when it was made), and the
   rest it is asked as it goes (her walls, the roof over her, the edge of the map, the water's rings) is swapped for the
   cave's, and back.
   The ledge and the cave are where the dungeon's own bake has them (assets/caves/fang-hall.json: its frame, the ledge
   between the ribs, its height): the way in and out is the same spot in both.
   ========================================================================== */
import * as THREE from 'three';
import { propRockMaterial } from './rocks.js';

const IN_AT = -0.45;         // m in from the mouth's foot: she is in the dark there (the dungeon is entered)
const OUT_AT = -1.05;        // where she stands coming out, facing out
const S0 = -1.95, S1 = 0.3;  // the ledge, out from the cliff (its outer edge) and in under it
const BAND = 0.4;            // m past its outer edge: a face from the water up to it (she climbs out by it)
const NEAR = 60;             // m from the mouth: the dungeon begins to load (onNear)
// what the player asks of the level as it goes (player-moves.js), swapped for the cave's while she is in it (the water's
// rings: none, the cave's pool keeps its own)
const SWAP = ['confine', 'ceilAt', 'ripple', 'colliders', 'cameraTrunks', 'crowns', 'radius'];

const MOUTH_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const MOUTH_FS = /* glsl */`
varying vec2 vUv;
void main() {
  // an arch: its sides soft into the rock, its top rounded; a faint teal far in, low in the middle (the hall's glow)
  vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);
  float top = 0.72 + 0.28 * sqrt(max(0.0, 1.0 - p.x * p.x));
  float inside = (1.0 - smoothstep(0.6, 0.95, abs(p.x))) * (1.0 - smoothstep(top - 0.2, top, p.y));
  vec3 col = mix(vec3(0.015, 0.025, 0.035), vec3(0.06, 0.3, 0.3), (1.0 - smoothstep(0.0, 0.6, length(vec2(p.x * 1.4, p.y - 0.14)))) * 0.75);
  gl_FragColor = vec4(col, inside);
}`;

export async function createCaveMouth({ level, base = './assets/caves/fang-hall', ground = './assets/ground/' } = {}) {
  const L = await fetch(base + '.json').then((r) => r.json());
  const F = L.frame, M = F.mouth, D = F.in, R = F.right, TOP = M[1], LAKE = L.curtain.lake;
  const [W0, W1] = L.curtain.ledge, WM = (W0 + W1) / 2;
  const sw = (x, z) => [(x - M[0]) * D[0] + (z - M[2]) * D[1], (x - M[0]) * R[0] + (z - M[2]) * R[1]];
  const xz = (s, w) => [M[0] + D[0] * s + R[0] * w, M[2] + D[1] * s + R[1] * w];
  const onLedge = (s, w) => s > S0 && s < S1 && w > W0 && w < W1;
  // the face from the water up to the ledge's outer edge: its height falling from the ledge's to just under the water's
  const faceAt = (s, w) => (s > S0 - BAND && s <= S0 && w > W0 && w < W1 ? TOP - (S0 - s) / BAND * (TOP - LAKE + 0.12) : null);

  // ---- the level: the ledge is ground (stone underfoot), out of the water; its edge a face, as a bank's. And while she is
  // in the dungeon (inside: the cave's level), all of it the cave's
  let inside = null, held = null;
  const was = { standAt: level.standAt || level.heightAt, heightAt: level.heightAt, footing: level.footing, waterDepthAt: level.waterDepthAt, surfaceAt: level.surfaceAt };
  const here = (x, z) => { const [s, w] = sw(x, z); return onLedge(s, w) ? TOP : faceAt(s, w); };
  level.standAt = (x, z, y) => { if (inside) return inside.standAt(x, z, y); const h = here(x, z); return h === null ? was.standAt(x, z, y) : h; };
  level.heightAt = (x, z) => { if (inside) return inside.heightAt(x, z); const h = here(x, z); return h === null ? was.heightAt(x, z) : h; };
  level.waterDepthAt = (x, z, y) => { if (inside) return inside.waterDepthAt(x, z, y); const h = here(x, z); return h === null ? was.waterDepthAt(x, z, y) : Math.max(0, LAKE - h); };
  if (was.footing) level.footing = (x, z, y) => {
    if (inside) return inside.footing(x, z, y);
    const [s, w] = sw(x, z);
    if (onLedge(s, w)) return 'ground';
    if (faceAt(s, w) !== null) return 'cliff';
    return was.footing(x, z, y);
  };
  if (was.surfaceAt) level.surfaceAt = (x, z, y) => (inside ? inside.surfaceAt(x, z, y) : here(x, z) === null ? was.surfaceAt(x, z, y) : 'stone');
  // what floats beside her (the sprite) keeps over the floor: in the cave the floor's own height, never the rock's (which
  // the cave's heightAt counts as far up, so her camera comes in before a wall)
  const floating = {
    heightAt: (x, z) => (inside ? inside.standAt(x, z) : level.heightAt(x, z)),
    waterDepthAt: (x, z, y) => level.waterDepthAt(x, z, y),
    get colliders() { return level.colliders; },
    addUnderwater: (o) => { if (level.addUnderwater) level.addUnderwater(o); },
  };
  const yawOut = Math.atan2(-D[0], -D[1]);
  const [sx, sz] = xz(OUT_AT, WM);
  const spot = { x: sx, z: sz, yaw: yawOut };
  if (level.views) level.views.cavemouth = { x: sx, z: sz, yaw: yawOut };

  // ---- what is seen: the ledge (a rock of the village's own stone), and the dark behind it
  const group = new THREE.Group();
  group.name = 'cave-mouth';
  const paint = await new Promise((res) => new THREE.TextureLoader().load(ground + 'cliff-paint.webp', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; res(t);
  }, undefined, () => res(null)));
  // the ledge: a slab from the pool's bed up to the ledge, its sides rough, its outer edge rounded off, tucked in under the cliff
  // (the rock's own paint wants, at each point: how high up the rock it is, how it bends (an edge, < 0), and which face)
  const NS = 14, NW = 12, NY = 8, pos = [], idx = [], hgt = [], curv = [], facet = [];
  const bed = LAKE - 2.4, sa = S0 - 0.08, sb = S1 + 0.35, wa = W0 - 0.3, wb = W1 + 0.3;
  const noise = (a, b, c) => Math.sin(a * 2.7 + b * 1.3) * Math.cos(b * 2.1 - c * 1.7) * 0.5 + Math.sin(a * 5.3 - c * 4.1) * 0.25;
  const put = (s, w, y, fc) => {
    const [x, z] = xz(s, w); pos.push(x, y, z);
    hgt.push(Math.min(1, Math.max(0, (y - bed) / (TOP - bed)))); curv.push(s < S0 + 0.3 && y > TOP - 0.6 ? -0.22 : 0); facet.push(fc);
    return pos.length / 3 - 1;
  };
  const grid = (n1, n2, at, fc) => {                 // a sheet of (n1 + 1) x (n2 + 1) points, two triangles a cell
    const first = pos.length / 3;
    for (let i = 0; i <= n1; i++) for (let j = 0; j <= n2; j++) put(...at(i / n1, j / n2), fc);
    for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) {
      const a = first + i * (n2 + 1) + j, b = a + 1, c = a + n2 + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  };
  // its top: flat where she walks, rounding down at the outer edge
  grid(NS, NW, (u, v) => {
    const s = sa + (sb - sa) * u, w = wa + (wb - wa) * v, edge = Math.max(0, (S0 + 0.25 - s) / 0.33);
    return [s, w, TOP - 0.03 - 0.35 * edge * edge + 0.02 * noise(s * 3, w * 3, 0)];
  }, 0.45);
  // its front (out over the water), down to the bed, rough
  grid(NY, NW, (u, v) => {
    const y = TOP - 0.38 - (TOP - 0.38 - bed) * u, w = wa + (wb - wa) * v;
    return [sa - 0.06 * noise(y * 2, w * 2, 1) - 0.1 * u, w, y];
  }, 0.62);
  // its two sides (against the ribs)
  for (const [wv, flip] of [[wa, 1], [wb, -1]]) grid(NY, NS, (u, v) => {
    const y = TOP - 0.03 - (TOP - bed) * (flip > 0 ? u : 1 - u), s = sa + (sb - sa) * v;
    return [s, wv - flip * 0.08 * noise(y * 2, s * 2, 2), y];
  }, flip > 0 ? 0.3 : 0.72);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lg.setAttribute('aHgt', new THREE.Float32BufferAttribute(hgt, 1));
  lg.setAttribute('aCurv', new THREE.Float32BufferAttribute(curv, 1));
  lg.setAttribute('aFacet', new THREE.Float32BufferAttribute(facet, 1));
  lg.setIndex(idx);
  lg.computeVertexNormals();
  // (wound to face out: the top must face up)
  const n = lg.attributes.normal;
  if (n.getY(Math.floor((NS / 2) * (NW + 1) + NW / 2)) < 0) { lg.index.array.reverse(); lg.computeVertexNormals(); }
  const ledge = new THREE.Mesh(lg, propRockMaterial({ moss: 0.55, world: false, tone: 'pale', paint: paint ? { texture: paint, tile: [8, 4] } : null }));
  ledge.name = 'cave-ledge';
  group.add(ledge);
  // the dark: an arch on the cliff between the ribs, behind the ledge (soft into the rock at its edges)
  const mouthMat = new THREE.ShaderMaterial({ vertexShader: MOUTH_VS, fragmentShader: MOUTH_FS, transparent: true, depthWrite: false });
  const mw = (W1 - W0) + 1.7, mh = 4.6;                         // (wider than between the ribs: they hide its sides)
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), mouthMat);
  const [mx, mz] = xz(-0.02, WM);
  mouth.position.set(mx, TOP - 0.1 + mh / 2, mz);
  mouth.rotation.y = Math.atan2(-D[0], -D[1]);                   // facing out
  mouth.renderOrder = 1; mouth.name = 'cave-dark';
  group.add(mouth);
  // seen through the falling water and the pool too: the water draws what is behind it from the things on the level's
  // underwater layer (the land, the rocks, her)
  if (level.addUnderwater) level.addUnderwater(group);

  // ---- near the fall, and into the dark (armed again once she has stepped out of it: coming back out she is put out of it)
  let near = false, armed = true;
  const api = {
    group, spot, ledge, mouth, floating,
    onNear: null, onEnter: null,
    get inside() { return !!inside; },
    use(cave) {
      cave = cave || null;
      if (cave === inside) return;
      if (inside) { for (const k of SWAP) { if (held[k] === undefined) delete level[k]; else level[k] = held[k]; } held = null; }
      inside = cave;
      if (inside) { held = {}; for (const k of SWAP) { held[k] = level[k]; level[k] = k === 'ripple' ? null : inside[k]; } }
      armed = false;
    },
    update(dt, player) {
      if (inside) return;
      const p = player.position, [s, w] = sw(p.x, p.z);
      if (!near && Math.hypot(s, w) < NEAR) { near = true; if (api.onNear) api.onNear(); }
      if (!(onLedge(s, w) && s > IN_AT)) { armed = true; return; }
      if (armed && (player.mode === 'ground' || player.mode === undefined)) { armed = false; if (api.onEnter) api.onEnter(); }
    },
    dispose() { lg.dispose(); mouth.geometry.dispose(); mouthMat.dispose(); },
  };
  return api;
}
