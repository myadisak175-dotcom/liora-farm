import * as THREE from "three";

/**
 * Small animation facade around THREE.AnimationMixer.
 * Gameplay code talks to semantic states (idle/walk/run/special) through this
 * controller instead of manipulating AnimationAction objects directly.
 */
export function createAnimationController({ model, clips = [] }) {
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map();

  for (const clip of clips) {
    actions.set(clip.name, mixer.clipAction(clip));
  }

  let currentAction = null;
  let currentName = null;
  let special = false;
  let finishedListener = null;

  function has(name) {
    return Boolean(name && actions.has(name));
  }

  function stopFinishedListener() {
    if (!finishedListener) return;
    mixer.removeEventListener("finished", finishedListener);
    finishedListener = null;
  }

  function play(name, {
    fade = 0.18,
    loop = true,
    timeScale = 1,
    reset = true,
  } = {}) {
    const next = actions.get(name);
    if (!next) return false;

    next.setEffectiveTimeScale(timeScale);

    if (currentAction === next) {
      currentName = name;
      return true;
    }

    if (currentAction) currentAction.fadeOut(fade);

    if (reset) next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(timeScale);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.fadeIn(fade).play();

    currentAction = next;
    currentName = name;
    return true;
  }

  function playOnce(name, {
    fade = 0.15,
    timeScale = 1,
    returnTo = null,
    returnFade = 0.18,
    returnTimeScale = 1,
    onDone,
  } = {}) {
    if (special || !has(name)) return false;

    special = true;
    stopFinishedListener();
    play(name, { fade, loop: false, timeScale });

    finishedListener = (event) => {
      if (event.action !== actions.get(name)) return;
      stopFinishedListener();
      special = false;
      if (returnTo) {
        play(returnTo, {
          fade: returnFade,
          loop: true,
          timeScale: returnTimeScale,
        });
      }
      onDone?.();
    };

    mixer.addEventListener("finished", finishedListener);
    return true;
  }

  function update(delta) {
    mixer.update(delta);
  }

  function dispose() {
    stopFinishedListener();
    mixer.stopAllAction();
    actions.clear();
  }

  return {
    mixer,
    has,
    play,
    playOnce,
    update,
    dispose,
    isSpecial: () => special,
    getCurrentName: () => currentName,
  };
}
