export function createPlayerRuntime({
  player,
  movement,
  input,
  animations,
  config,
  runFx,
  contactShadow,
  dayNight,
  lighting,
}) {
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
    contactShadow.update(player.root.position, player.root.rotation.y, dayNight.getHour());
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
    get position() {
      return player?.root?.position ?? null;
    },
  };
}
