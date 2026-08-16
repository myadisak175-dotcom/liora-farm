import { createPlayerWaterInteraction } from "./player-water.js";

export function createPlayerRuntime({
  player,
  movement,
  input,
  animations,
  config,
  runFx,
  contactShadow,
  waterInteraction = null,
  dayNight,
  lighting,
}) {
  // The player is already parented to the world scene before this runtime is
  // created. Keeping the visual water helper here avoids adding more bootstrap
  // ownership to main.js while still making it easy to inject a test double.
  const playerWater = waterInteraction ?? createPlayerWaterInteraction({
    scene: player?.root?.parent ?? null,
    player,
    config: config.water,
  });

  function playSpecial(animationName, onDone) {
    if (!player) return false;
    return player.playSpecial(animationName, onDone);
  }

  function update(delta, { active = true, cameraTarget } = {}) {
    if (!player) return;

    const state = movement.update({
      player,
      input: active ? input.get() : { x: 0, z: 0, m: 0 },
      delta,
    });

    if (!player.isSpecial()) {
      player.fadeTo(
        state.moving ? (state.running ? animations.run : animations.walk) : animations.idle,
        state.moving ? 0.15 : 0.18,
        true,
        state.running
          ? config.animationSpeed.run
          : state.moving
            ? config.animationSpeed.walk
            : config.animationSpeed.idle
      );
    }

    player.mixer.update(delta);
    runFx.update(player.root.position, state.direction, state.running, delta, {
      moving: state.moving,
      depth: state.waterDepth,
      level: config.water.level,
    });
    playerWater.update({
      position: player.root.position,
      moving: state.moving,
      depth: state.waterDepth,
      delta,
    });
    contactShadow.update(
      player.root.position,
      player.root.rotation.y,
      dayNight.getHour(),
      {
        depth: state.waterDepth,
        interaction: config.water?.interaction,
      }
    );
    if (cameraTarget) {
      cameraTarget.set(
        player.root.position.x,
        player.root.position.y + 0.7,
        player.root.position.z
      );
    }
    lighting.update(player.root.position);
  }

  return {
    update,
    playSpecial,
    get water() {
      return playerWater;
    },
    get position() {
      return player?.root?.position ?? null;
    },
  };
}
