/* ==========================================================================
   sprite-trial.js  —  ?sprite=1 (a trial): three forest sprites (สไปรต์ป่า, the "Loria Sprite" of the user's design
   sheet) on the way she starts on in the hill village, ahead of her, to see how the model and its four moves look
   in the game: its size beside her, in the land's light and the hour's. The way is found on the land itself
   (level.surfaceAt: 'earth' is a way), a metre at a time from where she starts, so it is the road as it is painted
   now (the ways are repainted by hand, path-brush.js) and not as the plan first had it.

   The model is assets/models/loria-sprite.glb: 6,000 triangles, one 1024 px picture, ten bones (root, body, two to
   an ear, one to each side's petals, two down the skirt of leaves) and four clips: `idle` (it floats in place),
   `walk` (it floats along, leaning into it, ears and skirt trailing), `jump` (once: 1.2 s) and `happy` (two hops,
   rocking). It is drawn by stylized-animals.js as the deer is: its own colours in the kit's three bands of light.
   No bone is called "head": that loader takes a head bone for the way an animal faces, and this one faces +Z as it is.

   What each of the three does, so that all four clips are seen:
     the walker    floats to and fro along the road (stylized-animals.js, walkAlong: `walk`, and `idle` at each end)
     the greeter   waits beside the road; when she comes within GREET metres it turns to her and is `happy` until she goes
     the hopper    waits further on, and every few seconds jumps (`jump`, then back to `idle`)
   They float FLOAT metres over the ground (the clips add the bobbing) with a soft round shadow under each. They are
   not solid, are not afraid of her and do nothing else yet.

     const trial = await createSpriteTrial({ level, scene, feet })   feet: () => where she stands ({ x, z })
     trial.sprites   [{ role, animal }]      trial.road   the way as it was found      trial.spot   { x, z, yaw }: where she starts, turned to them
   Their moves are stepped with every other animal's (updateAnimals). Made before the cloud shadows and the curse
   are laid on the scene (index.html), so the hour's light reaches them as it reaches everything else.
   ========================================================================== */
import * as THREE from 'three';
import { loadAnimal, createAnimal, walkAlong } from './stylized-animals.js';

export const SPRITE_MODEL = './assets/models/loria-sprite.glb';
const HEIGHT = 0.7;                     // metres from the tip of its skirt to the tips of its ears (she is 1.75)
const FLOAT = 0.8;                      // metres of air under it: over the grass, about at her chest
const GREET = 3.2, GREET_OFF = 4.2;     // she comes this close: happy; she is this far again: idle
const HOP_EVERY = [3.5, 6];             // seconds between the hopper's jumps
const JUMP_LASTS = 1.17;                // the jump clip is 1.2 s: back to idle just before it would begin again
const ROAD_FROM = 3, ROAD_FAR = 20;     // the walker's stretch of the way: from this many metres ahead of her to this many
const BESIDE = 1.5;                     // the two that wait: this far off the way's edge

// the way she starts on, a metre at a time: [[x, z, half its width], ...], or null where there is no way to follow
function traceRoad(level, start, far) {
  const earth = (x, z) => level.surfaceAt(x, z) === 'earth';
  let x = start.x, z = start.z, yaw = start.yaw;
  if (!earth(x, z)) {                                           // she starts beside it: onto it first
    let on = null;
    for (let r = 0.5; r <= 4 && !on; r += 0.5) for (let a = 0; a < Math.PI * 2 && !on; a += Math.PI / 8) if (earth(x + Math.sin(a) * r, z + Math.cos(a) * r)) on = [x + Math.sin(a) * r, z + Math.cos(a) * r];
    if (!on) return null;
    [x, z] = on;
  }
  const pts = [[x, z, 1]];
  for (let gone = 0; gone < far; gone++) {
    let best = null, score = 0;
    for (let d = -1.05; d <= 1.06; d += 0.175) {                // the heading with the most earth ahead of it, turning as little as may be
      const sx = Math.sin(yaw + d), sz = Math.cos(yaw + d);
      let n = -Math.abs(d) * 1.2;
      for (const r of [1, 1.8, 2.6]) for (const o of [-0.5, 0, 0.5]) if (earth(x + sx * r + sz * o, z + sz * r - sx * o)) n++;
      if (n > score) { score = n; best = yaw + d; }
    }
    if (best === null || score < 2) break;
    yaw = best; x += Math.sin(yaw); z += Math.cos(yaw);
    const cx = Math.cos(yaw), cz = -Math.sin(yaw);              // and toward the middle of the way
    let lo = 0, hi = 0;
    while (lo > -3 && earth(x + cx * (lo - 0.25), z + cz * (lo - 0.25))) lo -= 0.25;
    while (hi < 3 && earth(x + cx * (hi + 0.25), z + cz * (hi + 0.25))) hi += 0.25;
    x += cx * (lo + hi) * 0.3; z += cz * (lo + hi) * 0.3;
    pts.push([x, z, Math.max(0.5, (hi - lo) / 2)]);
  }
  if (pts.length < ROAD_FROM + 6) return null;
  for (let pass = 0; pass < 2; pass++) for (let k = 1; k < pts.length - 1; k++) { pts[k][0] = (pts[k - 1][0] + 2 * pts[k][0] + pts[k + 1][0]) / 4; pts[k][1] = (pts[k - 1][1] + 2 * pts[k][1] + pts[k + 1][1]) / 4; }
  return pts;
}

export async function createSpriteTrial({ level, scene, feet = () => null }) {
  const H = level.heightAt, asset = await loadAnimal(SPRITE_MODEL, { height: HEIGHT });
  const group = new THREE.Group(); group.name = 'sprite-trial'; scene.add(group);
  // a soft round shadow on the ground under each: it lies along the slope, and is smaller and paler the higher the sprite is
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.55, 'rgba(255,255,255,0.75)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const blobMat = new THREE.MeshBasicMaterial({ color: '#14260f', alphaMap: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.3, depthWrite: false });
  const blobGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), UP = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  // the way ahead of her; where there is none to follow (another start, the ways painted out), straight ahead of her instead
  const sp = level.spawn;
  const road = traceRoad(level, sp, ROAD_FAR) || Array.from({ length: 16 }, (_, k) => [sp.x + Math.sin(sp.yaw) * k, sp.z + Math.cos(sp.yaw) * k, 1]);
  const ROAD = road.slice(ROAD_FROM).reverse().map(([x, z]) => [x, z]);        // far end first, so the walker comes to meet her
  const clear = (x, z) => level.waterDepthAt(x, z) < 0.02 && level.surfaceAt(x, z) !== 'earth' && !level.colliders.some(([cx, cz, r]) => Math.hypot(cx - x, cz - z) < r + 0.5);
  // a place beside the way at its k-th metre: on the side asked for if that is clear, else on the other
  const beside = (k, side) => {
    const i = Math.min(road.length - 2, k), [x, z, half] = road[i], dx = road[i + 1][0] - x, dz = road[i + 1][1] - z, l = Math.hypot(dx, dz) || 1;
    const at = s => [x + dz / l * s * (half + BESIDE), z - dx / l * s * (half + BESIDE)];
    return { spot: clear(...at(side)) ? at(side) : at(-side), road: [x, z] };
  };
  const sprites = [];
  const add = (role, action) => {
    const animal = createAnimal(asset, { action, offset: Math.random() });
    const blob = new THREE.Mesh(blobGeo, blobMat.clone()); blob.renderOrder = 1;
    const body = animal.object.getObjectByName('body'), at = new THREE.Vector3();
    group.add(animal.object, blob); animal.object.updateMatrixWorld(true);
    const rest = body.getWorldPosition(at).y - animal.object.position.y;
    const shade = () => {
      body.getWorldPosition(at);
      const x = at.x, z = at.z, y = H(x, z), up = Math.max(0, at.y - rest - y);
      n.set(H(x - 0.3, z) - H(x + 0.3, z), 0.6, H(x, z - 0.3) - H(x, z + 0.3)).normalize();
      const k = 1 / (1 + up * 0.9);
      blob.position.set(x, y + 0.04, z); blob.quaternion.setFromUnitVectors(UP, n); blob.scale.setScalar(HEIGHT * 0.52 * k); blob.material.opacity = 0.3 * k;
    };
    const s = { role, animal, blob, shade };
    sprites.push(s);
    return s;
  };
  const stand = (s, [x, z], faceTo) => { s.animal.object.position.set(x, H(x, z) + FLOAT, z); s.animal.object.rotation.y = Math.atan2(faceTo[0] - x, faceTo[1] - z) - asset.forwardYaw; };
  const turnTo = (o, yaw, dt, pace) => { const d = Math.atan2(Math.sin(yaw - o.rotation.y), Math.cos(yaw - o.rotation.y)); o.rotation.y += d * Math.min(1, dt * pace); };

  // the walker
  const walker = add('walker', 'walk');
  walkAlong(walker.animal, { points: ROAD, groundAt: (x, z) => H(x, z) + FLOAT, speed: 1.15, pause: [2, 3.5], start: 0.05 });
  const stroll = walker.animal.onUpdate;
  walker.animal.onUpdate = dt => { stroll(dt); walker.shade(); };

  // the greeter: happy while she is near, turned to her
  const greeter = add('greeter', 'idle'), gAt = beside(5, 1), gHome = Math.atan2(gAt.road[0] - gAt.spot[0], gAt.road[1] - gAt.spot[1]) - asset.forwardYaw;
  stand(greeter, gAt.spot, gAt.road);
  let glad = false;
  greeter.animal.onUpdate = dt => {
    const f = feet(), o = greeter.animal.object, d = f ? Math.hypot(f.x - o.position.x, f.z - o.position.z) : Infinity;
    if (!glad && d < GREET) { glad = true; greeter.animal.play('happy', 0.2); }
    else if (glad && d > GREET_OFF) { glad = false; greeter.animal.play('idle', 0.4); }
    turnTo(o, glad ? Math.atan2(f.x - o.position.x, f.z - o.position.z) - asset.forwardYaw : gHome, dt, glad ? 5 : 1.5);
    greeter.shade();
  };

  // the hopper: a jump every few seconds
  const hopper = add('hopper', 'idle');
  const hAt = beside(9, -1);
  stand(hopper, hAt.spot, hAt.road);
  let wait = 2, up = 0;
  hopper.animal.onUpdate = dt => {
    if (up > 0) { up -= dt; if (up <= 0) hopper.animal.play('idle', 0.25); }
    else if ((wait -= dt) <= 0) { wait = HOP_EVERY[0] + Math.random() * (HOP_EVERY[1] - HOP_EVERY[0]); up = JUMP_LASTS; hopper.animal.play('jump', 0.12); }
    hopper.shade();
  };
  for (const s of sprites) s.shade();
  const toward = road[Math.min(road.length - 1, 7)];           // she starts where she always does, turned to look down the way at them
  return { group, asset, sprites, road, spot: { x: sp.x, z: sp.z, yaw: Math.atan2(toward[0] - sp.x, toward[1] - sp.z) }, height: HEIGHT, float: FLOAT,
    dispose() { for (const s of sprites) s.animal.dispose(); scene.remove(group); blobGeo.dispose(); blobMat.alphaMap.dispose(); } };
}
