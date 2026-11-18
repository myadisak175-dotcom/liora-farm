/* ==========================================================================
   boss-trial.js  —  ?boss=1 (a trial): the three-headed plant boss (plant-boss.js) standing in the west fringe's sag field,
   to see how it looks in the game: its size beside her, in the land's light and the hour's, with its real shadow on
   the ground. It does not fight yet: it sways, and its heads turn to watch her when she comes near
   (plant-boss-moves.js, standing, without darting at her).

     const trial = createBossTrial({ level, scene, shade })   shade: the level's picture of the shadows already on the
                                                              ground, as her own shadow takes it (character-shadow.js)
     every frame: trial.update(dt, renderer, feet, sun, k)    feet: where she stands; sun, k: the sun the shadows are
                                                              cast by, and how strongly (as her own shadow is given them)
     trial.spot      { x, z, yaw }: where to stand before it, facing it. The same place is level.views['wf-boss']: the
                     map's pin, and the 📍 menu (teleport-menu.js)

   Made before the cloud shadows and the curse are laid on the scene (index.html), so they reach it as they reach
   everything else. Solid: it is one of the level's colliders, its bud one of the crowns the camera keeps out of.
   ========================================================================== */
import * as THREE from 'three';
import { createPlantBoss, setPlantBossSun, BOSS_HEIGHT } from './plant-boss.js';
import { createBossMoves } from './plant-boss-moves.js';
import { createCharacterShadow } from './character-shadow.js';

// the middle of the sag field (west-fringe.json: sunken.sag_field), facing east: the way she comes from the village
export const BOSS_SPOT = { x: -133, z: 116, faces: Math.PI / 2 };
const NOTICE = 26;                      // metres: nearer than this, its heads watch her
const STAND = 13;                       // metres before it: where the pin puts her

export function createBossTrial({ level, scene, shade = null }) {
  const { x, z, faces } = BOSS_SPOT, H = level.heightAt;
  const boss = createPlantBoss({ seed: 1 });
  // its foot on the lowest of the ground round it, so no root hangs in the air on a slope
  let y = Infinity;
  for (const r of [0, 1.5, 3]) for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) y = Math.min(y, H(x + Math.sin(a) * r, z + Math.cos(a) * r));
  boss.position.set(x, y - 0.05, z);
  boss.rotation.y = faces;
  scene.add(boss);
  const moves = createBossMoves(boss, { snaps: false });

  // its real shadow on the ground: hers, made for it (a wider picture, a coarser patch: it is four times her height)
  const shadow = createCharacterShadow({ character: { object: boss, height: BOSS_HEIGHT }, heightAt: H, shade, size: 512, cell: 0.5 });
  scene.add(shadow.object);

  // solid: she walks round it, and the camera keeps out of its bush and its necks
  level.colliders.push([x, z, 2.9]);
  if (level.crowns) level.crowns.push([x, y + 1.6, z, 2.7]);
  if (level.cameraTrunks) level.cameraTrunks.push([x, z, 1.1, y, y + 6]);

  // where to stand before it, facing it
  const fx = Math.sin(faces), fz = Math.cos(faces);
  const spot = { x: x + fx * STAND, z: z + fz * STAND, yaw: Math.atan2(-fx, -fz) };
  if (level.views) level.views['wf-boss'] = spot;

  const feet = new THREE.Vector3(x, y, z), ahead = boss.localToWorld(new THREE.Vector3(0, 0, 12));
  return {
    boss, spot,
    update(dt, renderer, her, sun, k = 1) {
      setPlantBossSun(sun);
      moves.update(dt, Math.hypot(her.x - x, her.z - z) < NOTICE ? her : ahead);     // (far off: they look out ahead of it)
      shadow.update(renderer, feet, sun, k);
    },
  };
}
