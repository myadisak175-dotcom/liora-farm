import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

/**
 * Lightweight NPC life-loop test.
 *
 * This deliberately reuses the already-loaded player model, geometry,
 * materials and AnimationClips. Each NPC gets only its own cloned skeleton,
 * AnimationMixer and tiny state machine. It is gated by ?npc=1 in main.js so
 * the normal game remains unchanged while we measure the real runtime cost.
 */
export function createNpcLifeSystem({
  scene,
  sourceModel,
  clips,
  animations,
  getGroundHeight,
}) {
  if (!sourceModel || !Array.isArray(clips) || !clips.length) return null;

  const clipByName = new Map(clips.map((clip) => [clip.name, clip]));
  const sharedSpecials = [animations.pickUp, animations.hammer, animations.mirror]
    .filter((name) => clipByName.has(name));

  const definitions = [
    {
      id: "npc-a",
      seed: 1207,
      scale: 0.97,
      points: [
        [-4.6, 5.8], [-2.5, 9.2], [-5.3, 11.0], [-6.1, 7.6], [-2.8, 4.1],
      ],
    },
    {
      id: "npc-b",
      seed: 2819,
      scale: 1.03,
      points: [
        [4.4, 5.4], [6.1, 8.2], [3.4, 11.4], [6.4, 12.2], [2.7, 7.3],
      ],
    },
  ];

  const tmpDirection = new THREE.Vector3();
  const npcs = definitions.map(createNpc);

  function createRng(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createNpc(definition) {
    const root = new THREE.Group();
    root.name = definition.id;
    root.scale.setScalar(definition.scale);

    // SkeletonUtils clones bones correctly while keeping geometry/materials
    // shared with the player, so two NPCs do not duplicate the heavy buffers.
    const model = cloneSkeleton(sourceModel);
    root.add(model);
    scene.add(root);

    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map();
    for (const clip of clips) actions.set(clip.name, mixer.clipAction(clip));

    const rng = createRng(definition.seed);
    const points = definition.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const npc = {
      root,
      model,
      mixer,
      actions,
      rng,
      points,
      pointIndex: 0,
      target: points[0].clone(),
      state: "idle",
      timer: 0.7 + rng() * 1.1,
      next: "move",
      speed: 0,
      currentAction: null,
    };

    root.position.copy(points[0]);
    root.position.y = getGroundHeight(root.position.x, root.position.z);
    fadeTo(npc, animations.idle, 0, true);
    return npc;
  }

  function fadeTo(npc, name, duration = 0.22, loop = true, timeScale = 1) {
    const next = npc.actions.get(name);
    if (!next) return null;
    if (npc.currentAction === next && loop) return next;

    next.enabled = true;
    next.reset();
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(timeScale);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.play();

    if (npc.currentAction && npc.currentAction !== next) {
      npc.currentAction.crossFadeTo(next, duration, false);
    } else if (duration > 0) {
      next.fadeIn(duration);
    }
    npc.currentAction = next;
    return next;
  }

  function chooseDifferentPoint(npc) {
    let next = Math.floor(npc.rng() * npc.points.length);
    if (next === npc.pointIndex) next = (next + 1) % npc.points.length;
    npc.pointIndex = next;
    npc.target.copy(npc.points[next]);
  }

  function startMove(npc) {
    chooseDifferentPoint(npc);
    const distance = npc.root.position.distanceTo(npc.target);
    const running = distance > 4 && npc.rng() < 0.22 && clipByName.has(animations.run);
    npc.speed = running ? 2.45 : 1.25;
    fadeTo(npc, running ? animations.run : animations.walk, 0.24, true, running ? 0.92 : 0.88);
    npc.state = "move";
  }

  function startRest(npc) {
    fadeTo(npc, animations.idle, 0.26, true, 0.96 + npc.rng() * 0.08);
    npc.state = "idle";
    npc.timer = 0.7 + npc.rng() * 1.5;
    npc.next = sharedSpecials.length && npc.rng() < 0.72 ? "special" : "move";
  }

  function startSpecial(npc) {
    if (!sharedSpecials.length) {
      startRest(npc);
      npc.next = "move";
      return;
    }
    const name = sharedSpecials[Math.floor(npc.rng() * sharedSpecials.length)];
    const action = fadeTo(npc, name, 0.25, false, 0.92 + npc.rng() * 0.12);
    npc.state = "special";
    npc.timer = Math.max(0.6, action?.getClip()?.duration ?? 1.2) + 0.08;
    npc.next = "move";
  }

  function updateMove(npc, delta) {
    tmpDirection.subVectors(npc.target, npc.root.position);
    tmpDirection.y = 0;
    const distance = tmpDirection.length();
    if (distance < 0.08) {
      npc.root.position.x = npc.target.x;
      npc.root.position.z = npc.target.z;
      startRest(npc);
      return;
    }

    tmpDirection.multiplyScalar(1 / Math.max(distance, 0.0001));
    const step = Math.min(distance, npc.speed * delta);
    npc.root.position.addScaledVector(tmpDirection, step);

    const wantedYaw = Math.atan2(tmpDirection.x, tmpDirection.z);
    const yawDelta = Math.atan2(
      Math.sin(wantedYaw - npc.root.rotation.y),
      Math.cos(wantedYaw - npc.root.rotation.y),
    );
    npc.root.rotation.y += yawDelta * Math.min(1, delta * 7);
  }

  function updateNpc(npc, delta) {
    npc.mixer.update(delta);
    npc.root.position.y = getGroundHeight(npc.root.position.x, npc.root.position.z);

    if (npc.state === "move") {
      updateMove(npc, delta);
      return;
    }

    npc.timer -= delta;
    if (npc.timer > 0) return;

    if (npc.state === "special") {
      startRest(npc);
      npc.next = "move";
      return;
    }

    if (npc.next === "special") startSpecial(npc);
    else startMove(npc);
  }

  return {
    update(delta) {
      for (const npc of npcs) updateNpc(npc, delta);
    },

    get stats() {
      return {
        count: npcs.length,
        states: npcs.map((npc) => npc.state),
      };
    },

    dispose() {
      for (const npc of npcs) {
        npc.mixer.stopAllAction();
        scene.remove(npc.root);
        // Geometry/materials are shared with the player; do not dispose them.
      }
      npcs.length = 0;
    },
  };
}
