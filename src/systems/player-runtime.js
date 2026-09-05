import { createPlayerWaterInteraction } from "./player-water.js";
import { createWorldLogicRuntime } from "./world-logic-runtime.js";

export function createPlayerRuntime({
  player,
  movement,
  input,
  animations,
  config,
  runFx,
  contactShadow,
  waterInteraction = null,
  worldLogicRuntime = null,
  dayNight,
  lighting,
  surfaceAt = null,
}) {
  const playerWater = waterInteraction ?? createPlayerWaterInteraction({
    scene: player?.root?.parent ?? null,
    player,
    config: config.water,
  });

  // Player movement is the authoritative resolved position, so proximity logic
  // runs here after collision/slope/water resolution rather than following raw
  // joystick input. The runtime publishes plain events through WORLD_EVENTS;
  // presentation and gameplay systems subscribe independently.
  const logicRuntime = worldLogicRuntime ?? createWorldLogicRuntime();

  let lastState = {
    moving: false,
    running: false,
    waterDepth: 0,
    direction: { x: 0, z: 0 },
  };

  function playSpecial(animationName, onDone) {
    if (!player) return false;
    return player.playSpecial(animationName, onDone);
  }

  function snapshotState(state) {
    const p = player?.root?.position;
    lastState = {
      moving: Boolean(state?.moving),
      running: Boolean(state?.running),
      waterDepth: Number(state?.waterDepth) || 0,
      direction: {
        x: Number(state?.direction?.x) || 0,
        z: Number(state?.direction?.z) || 0,
      },
      position: p ? { x: p.x, y: p.y, z: p.z } : null,
      special: Boolean(player?.isSpecial?.()),
    };
  }

  function update(delta, { active = true, cameraTarget } = {}) {
    if (!player) return;

    const state = movement.update({
      player,
      input: active ? input.get() : { x: 0, z: 0, m: 0 },
      delta,
    });
    snapshotState(state);

    if (active) logicRuntime.update(player.root.position);

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

  const api = {
    update,
    playSpecial,
    facePoint(position) {
      if (!player || !position) return;
      const dx = Number(position.x) - player.root.position.x;
      const dz = Number(position.z) - player.root.position.z;
      if (Number.isFinite(dx) && Number.isFinite(dz) && Math.hypot(dx, dz) > 0.01) {
        player.root.rotation.y = Math.atan2(dx, dz);
      }
    },
    get state() {
      return lastState;
    },
    get water() {
      return playerWater;
    },
    get worldLogic() {
      return logicRuntime;
    },
    get position() {
      return player?.root?.position ?? null;
    },
  };

  const audioBridge = {
    get state() {
      return api.state;
    },
    get hour() {
      return Number(dayNight?.getHour?.()) || 0;
    },
    get surface() {
      const position = player?.root?.position;
      if (!position || typeof surfaceAt !== "function") return "grass";
      return String(surfaceAt(position.x, position.z) || "grass");
    },
  };
  window.__lioraAudioRuntime = audioBridge;

  return api;
}
