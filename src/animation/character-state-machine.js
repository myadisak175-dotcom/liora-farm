export const CHARACTER_STATES = Object.freeze({
  IDLE: "idle",
  WALK: "walk",
  RUN: "run",
  INTERACT: "interact",
  ACTION: "action",
});

/**
 * Semantic character state machine.
 *
 * Gameplay code should talk in states (idle/walk/run/action) rather than
 * Three.js clip names. The animation map is the adapter between a Meshy GLB
 * and the runtime character API.
 */
export function createCharacterStateMachine({
  animation,
  animations = {},
  animationSpeeds = {},
} = {}) {
  if (!animation) throw new Error("createCharacterStateMachine requires animation");

  const locomotionClips = Object.freeze({
    [CHARACTER_STATES.IDLE]: animations.idle ?? null,
    [CHARACTER_STATES.WALK]: animations.walk ?? null,
    [CHARACTER_STATES.RUN]: animations.run ?? null,
  });

  let currentState = null;
  let currentAction = null;

  function speedFor(state, fallback = 1) {
    const value = Number(animationSpeeds?.[state]);
    return Number.isFinite(value) ? value : fallback;
  }

  function stateForClip(name) {
    if (name === locomotionClips.idle) return CHARACTER_STATES.IDLE;
    if (name === locomotionClips.walk) return CHARACTER_STATES.WALK;
    if (name === locomotionClips.run) return CHARACTER_STATES.RUN;
    return null;
  }

  function playState(state, {
    fade = state === CHARACTER_STATES.IDLE ? 0.18 : 0.15,
    timeScale = speedFor(state),
    force = false,
  } = {}) {
    if (!force && animation.isSpecial()) return false;

    const clip = locomotionClips[state];
    if (!clip || !animation.has(clip)) return false;

    const played = animation.play(clip, {
      fade,
      loop: true,
      timeScale,
    });

    if (played) {
      currentState = state;
      currentAction = null;
    }
    return played;
  }

  function setLocomotion({ moving = false, running = false } = {}) {
    if (animation.isSpecial()) return currentState;

    const next = !moving
      ? CHARACTER_STATES.IDLE
      : running
        ? CHARACTER_STATES.RUN
        : CHARACTER_STATES.WALK;

    playState(next);
    return next;
  }

  function playAction(name, {
    state = CHARACTER_STATES.ACTION,
    fade = 0.15,
    timeScale = 1,
    returnState = CHARACTER_STATES.IDLE,
    returnFade = 0.18,
    onDone,
  } = {}) {
    if (!name || animation.isSpecial() || !animation.has(name)) return false;

    const returnTo = locomotionClips[returnState] ?? locomotionClips.idle;
    const returnTimeScale = speedFor(returnState, 1);

    const played = animation.playOnce(name, {
      fade,
      timeScale,
      returnTo,
      returnFade,
      returnTimeScale,
      onDone: () => {
        currentState = returnState;
        currentAction = null;
        onDone?.();
      },
    });

    if (played) {
      currentState = state;
      currentAction = name;
    }
    return played;
  }

  function interact(name, options = {}) {
    return playAction(name, {
      ...options,
      state: CHARACTER_STATES.INTERACT,
    });
  }

  // Compatibility bridge for older gameplay pages that still provide clip
  // names directly. New systems should prefer setLocomotion/playAction.
  function playClip(name, {
    fade = 0.18,
    loop = true,
    timeScale = 1,
    reset = true,
  } = {}) {
    if (!name) return false;

    const played = animation.play(name, {
      fade,
      loop,
      timeScale,
      reset,
    });

    if (played) {
      const semanticState = stateForClip(name);
      if (semanticState) {
        currentState = semanticState;
        currentAction = null;
      }
    }
    return played;
  }

  function update(delta) {
    animation.update(delta);
  }

  function dispose() {
    animation.dispose();
  }

  return {
    playState,
    setLocomotion,
    playAction,
    interact,
    playClip,
    update,
    dispose,
    isBusy: animation.isSpecial,
    getState: () => currentState,
    getAction: () => currentAction,
  };
}
