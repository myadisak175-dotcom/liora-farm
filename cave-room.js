/* ==========================================================================
   cave-room.js  —  ANY room of the caves' kit, built from what tools/make-cave-room.py baked (since 28 Nov 2026)

     const room = await createCaveRoom({ name: 'test' })        // assets/caves/test.bin + .json
     scene.add(room.group); ...; room.light.apply(scene)        // the cave's light on her and on plants (cave-light.js)
     const level = createCaveLevel(room)                        // her level in it (cave-level.js): floors over one another too
     every frame: room.update(dt, camera)
     room.floorMap, room.layout (spawn, places, lamps, mouths, falls), room.colliders, room.crowns, room.trunks, room.look
     room.water (null in a dry room), room.ripple (the level hands her steps in the water to it)

   As the hill village is laid out by one file from one description, so is every room of the caves from here on (the
   user: "ตอนนี้ต้องวางระบบไว้ก่อน เหมือนที่เราวางระบบ heightmap hill village"): a room is its description
   (tools/cave-rooms/NAME.json), baked by the one tool, and built here by the kit's parts, each with one job:
     cave-ground.js   its rock, its laid stone, what lies on its floors (floors over one another too)
     cave-water.js    its water: pools, streams, falls
     cave-light.js    its light on her and on plants (a picture of the air)
     cave-level.js    where she may stand, climb, wade, swim; her camera
     (to come, the kit's next pieces: its air and things — mist by storey, lamps that wake, crystals, mushrooms, fangs,
     ruins' pieces; its map with a picture a storey)
   This file itself: reads the bake, makes the rock's mesh, and shows where each lamp hangs (a soft light in the air:
   the lamps' light on the rock is baked). The three rooms made before the kit (fang-hall.js, cave-hall.js, boss-hall.js)
   are as they were, each with its own code: to be made anew on the kit.
   ========================================================================== */
import * as THREE from 'three';
import { createCaveLight } from './cave-light.js';
import { createCaveGround, GROUND_LOOK } from './cave-ground.js';
import { createCaveWater } from './cave-water.js';

export const ROOM_LOOK = { ...GROUND_LOOK };

// a room's two files, fetched (ahead, if the page likes: hand them back as `files`)
export function fetchCaveRoom({ name, base = './assets/caves/' }) {
  return [fetch(base + name + '.json').then((r) => r.json()), fetch(base + name + '.bin').then((r) => r.arrayBuffer())];
}

export async function createCaveRoom({ name = 'test', base = './assets/caves/', ground = './assets/ground/', files = null, look = null, onStep = async () => {} } = {}) {
  await onStep('โหลดห้อง');
  const [L, bin] = await Promise.all(files || fetchCaveRoom({ name, base }));
  look = { ...ROOM_LOOK, ...(L.look || {}), ...(look || {}) };
  const B = L.bin, M = B.mesh, F = B.floor, V = B.volume, spans = (F.layers || 1) * F.nx * F.nz;
  const group = new THREE.Group();
  group.name = 'cave-room-' + L.name;

  // ---- what cave-level.js reads: the floor map (spans; the water over them), and the light in the air
  const floorMap = {
    nx: F.nx, nz: F.nz, x0: F.x0, z0: F.z0, cell: F.cell, layers: F.layers || 1, bare: 'stone',     // (her steps where no paint lies)
    fl: new Int16Array(bin, F.floor, spans), ce: new Int16Array(bin, F.ceil, spans), paint: new Uint8Array(bin, F.paint, spans * 4),
    ...(F.water !== undefined ? { water: new Int16Array(bin, F.water, spans) } : {}),
  };
  const light = createCaveLight({ volume: { data: new Uint8Array(bin, V.data, V.nx * V.ny * V.nz * 4), nx: V.nx, ny: V.ny, nz: V.nz, x0: V.x0, y0: V.y0, z0: V.z0, cell: V.cell }, scale: B.lightScale });

  // ---- the rock: one mesh, the kit's ground on it
  await onStep('ปูพื้นและหิน');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, M.pos, M.vertices * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bin, M.nrm, M.vertices * 4), 4, true));
  g.setAttribute('aLight', new THREE.BufferAttribute(new Uint8Array(bin, M.light, M.vertices * 4), 4, true));
  g.setAttribute('aInfo', new THREE.BufferAttribute(new Uint8Array(bin, M.info, M.vertices * 4), 4, true));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, M.idx, M.indices), 1));
  g.computeBoundingSphere();
  const floorPaint = await createCaveGround({ ground, floor: floorMap, scale: B.lightScale, sprite: light.uniforms, look });
  const rock = new THREE.Mesh(g, floorPaint.material);
  rock.name = 'cave-rock';
  group.add(rock);

  // ---- the water: whatever the bake laid
  let water = null;
  if (B.water) {
    await onStep('เติมน้ำ');
    water = await createCaveWater({ bin, mesh: B.water, scale: B.lightScale, sprite: light.uniforms, kind: L.water || 'clear', fog: floorPaint.fogColor, fogDensity: look.fogDensity });
    group.add(water.object);
  }

  // ---- the lamps: a soft light in the air where each hangs (what they throw on the rock is baked)
  await onStep('จุดโคม');
  const lamps = L.lamps || [];
  let glow = null;
  if (lamps.length) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const cx = c.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace;
    const pos = new Float32Array(lamps.length * 3), col = new Float32Array(lamps.length * 3);
    lamps.forEach((l, i) => { pos.set(l.at, i * 3); col.set(l.colour.map((v) => v * 0.9 + 0.1), i * 3); });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    glow = new THREE.Points(lg, new THREE.PointsMaterial({ map: tex, size: 1.5, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.name = 'cave-lamps'; glow.frustumCulled = false; glow.renderOrder = 5;
    group.add(glow);
  }

  let clock = 0;
  return {
    group, light, layout: L, rock, glow, water, floorMap, colliders: (L.colliders || []).map((c) => c.slice()), crowns: [], trunks: [],
    look, fogColor: floorPaint.fogColor, name: L.name,
    stats: { vertices: M.vertices, triangles: M.indices / 3, layers: floorMap.layers, lamps: lamps.length, water: B.water ? B.water.indices / 3 : 0 },
    ...(water ? { ripple: (x, y, z, strength, radius, mode) => water.ripple(x, y, z, strength, radius, mode) } : {}),
    update(dt) { clock += dt; if (glow) glow.material.size = 1.5 + 0.08 * Math.sin(clock * 1.7); if (water) water.update(dt); },
    dispose() { g.dispose(); floorPaint.dispose(); light.dispose(); if (water) water.dispose(); if (glow) { glow.geometry.dispose(); glow.material.map.dispose(); glow.material.dispose(); } },
  };
}
