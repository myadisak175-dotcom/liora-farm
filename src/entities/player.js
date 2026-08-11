import { createCharacter } from "./character.js";

export async function createPlayer({
  url,
  height,
  groundOffset = 0,
  renderOrder,
  animations,
  animationSpeeds = {},
  spawn = null,
}) {
  const isBuilder = typeof location !== "undefined" && /\/builder\//.test(location.pathname);
  const start = spawn ?? (isBuilder ? { x: -5.2, y: 0, z: -4.6 } : { x: 0, y: 0, z: 5 });

  const character = await createCharacter({
    url,
    height,
    groundOffset,
    renderOrder,
    animations,
    animationSpeeds,
    spawn: start,
    role: "player",
  });

  // Compatibility API for current gameplay pages. Both methods now route
  // through the semantic Character State Machine, so older pages keep working
  // while new gameplay code can use setLocomotion/playAction directly.
  function fadeTo(name, duration = 0.18, loop = true, timeScale = 1) {
    return character.state.playClip(name, {
      fade: duration,
      loop,
      timeScale,
    });
  }

  function playSpecial(name, onDone) {
    return character.state.playAction(name, {
      fade: 0.15,
      timeScale: 1,
      returnState: "idle",
      returnFade: 0.18,
      onDone,
    });
  }

  return {
    ...character,
    fadeTo,
    playSpecial,
    isSpecial: character.state.isBusy,
  };
}
