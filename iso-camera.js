/* ==========================================================================
   iso-camera.js  —  a trial: the game seen from high up at a slant, like an isometric game

     const iso = createIsoCamera({ camera, player, character, restore: fit });
     every frame, after player.update():  iso.apply(dt)       // does nothing while the view is the normal one
     iso.cycle()                                              // normal → high (near) → high (far) → normal

   Not a true orthographic camera: a long lens far back (a narrow field of view), which looks almost the same and keeps
   everything that is drawn by its distance from the camera (water ripples, the water's mirror, haze, grass) working.
   Dragging on the right still turns the view; let go and it settles on the nearest diagonal, the way isometric games sit.
   Whatever stands close to the lens (a tree crown, a roof between the camera and her) is cut away by pushing the camera's
   near plane out to a few metres in front of her; anything still in the way shows her outline through it.
   ========================================================================== */
import * as THREE from 'three';
import { _internal } from './stylized-nature.js';

const { shared } = _internal;

// the views: how far back the camera stands, how steeply it looks down, how narrow the lens (landscape / portrait)
const VIEWS = [
  null,                                                                  // the normal, over-the-shoulder camera
  { name: 'มุมสูง', dist: 21, pitch: 0.62, fov: 27, fovTall: 40 },
  { name: 'มุมสูง (ไกล)', dist: 34, pitch: 0.70, fov: 27, fovTall: 40 },
];
const CUT = 0.4;                                                         // the share of the way to the lens kept in front of her (the ground at the bottom of the screen stays)
const DIAG = Math.PI / 4, QUARTER = Math.PI / 2;
const snapYaw = y => Math.round((y - DIAG) / QUARTER) * QUARTER + DIAG;   // the nearest of the four diagonals
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function createIsoCamera({ camera, player, character, restore = () => {} }) {
  let view = 0, dist = 0, yaw = 0, ready = false, hazeBase = null, nearBase = camera.near;
  const target = new THREE.Vector3(), want = new THREE.Vector3(), pos = new THREE.Vector3();

  // ---- her outline where something hides her: drawn only where it is behind what is already on screen
  const ghostMat = new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0.42, depthWrite: false, depthFunc: THREE.GreaterDepth });
  // drawn a little toward the lens, so her own hair, arms and the grass at her feet never count as something hiding her
  ghostMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  mvPosition.z += 0.9; gl_Position = projectionMatrix * mvPosition;');
  };
  const ghosts = [];
  character.object.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const g = new THREE.SkinnedMesh(o.geometry, ghostMat);
    g.bind(o.skeleton, o.bindMatrix);
    g.renderOrder = 20; g.frustumCulled = false; g.visible = false;
    ghosts.push([o, g]);
  });
  for (const [o, g] of ghosts) o.parent.add(g);

  // let go of the screen: the view turns on to the nearest diagonal (and her stick turns with it)
  addEventListener('pointerup', () => { if (view) player.setView(snapYaw(player.camYaw)); });

  // the mouse wheel zooms on a computer
  addEventListener('wheel', e => { if (view) dist = Math.min(60, Math.max(10, dist + e.deltaY * 0.02)); }, { passive: true });

  function enter() {
    if (!hazeBase) hazeBase = { near: shared.uHazeNear.value, far: shared.uHazeFar.value };
    shared.uHazeNear.value = hazeBase.near + dist;          // the haze starts as far from her as it did, not from the far-off lens
    shared.uHazeFar.value = hazeBase.far + dist;
  }
  function leave() {
    if (hazeBase) { shared.uHazeNear.value = hazeBase.near; shared.uHazeFar.value = hazeBase.far; hazeBase = null; }
    camera.near = nearBase;
    restore();                                              // the normal lens back
    player.setView(player.camYaw, 0.17, 4.3);
  }

  const iso = {
    get active() { return view > 0; },
    get name() { return VIEWS[view] ? VIEWS[view].name : 'มุมปกติ'; },
    cycle() {
      const was = view;
      view = (view + 1) % VIEWS.length;
      if (view) {
        dist = VIEWS[view].dist;
        if (!was) { yaw = snapYaw(player.camYaw); player.setView(yaw); ready = false; }
        enter();
      } else leave();
      for (const [, g] of ghosts) g.visible = view > 0;
    },
    apply(dt) {
      if (!view) return;
      const v = VIEWS[view];
      shared.uHazeNear.value = hazeBase.near + dist; shared.uHazeFar.value = hazeBase.far + dist;
      const fov = camera.aspect < 1 ? v.fovTall : v.fov;
      const near = Math.max(0.5, dist * (1 - CUT));          // nothing nearer the lens than that is drawn
      if (camera.fov !== fov || camera.near !== near) { camera.fov = fov; camera.near = near; camera.updateProjectionMatrix(); }
      yaw += wrap(player.camYaw - yaw) * Math.min(1, dt * 9);
      const p = player.position, cp = Math.cos(v.pitch);
      want.set(p.x, p.y + 0.9, p.z);
      if (!ready) { target.copy(want); ready = true; } else target.lerp(want, Math.min(1, dt * 7));
      pos.set(target.x + Math.sin(yaw) * cp * dist, target.y + Math.sin(v.pitch) * dist, target.z + Math.cos(yaw) * cp * dist);
      camera.position.copy(pos);
      camera.lookAt(target);
    },
  };
  return iso;
}
