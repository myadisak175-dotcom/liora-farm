import { INTERACTION_TYPES } from "../data/interactions.js";

/**
 * Connects semantic world interactions to a Character without putting domain
 * rules inside InteractionSystem or Character.
 *
 * `actions` contains domain callbacks such as chop/enter/sit/inspect. If an
 * interaction definition declares `animationKey`, the character plays that
 * one-shot first and the domain callback runs after the animation finishes.
 */
export function bindCharacterInteractions({
  interaction,
  character,
  animations = {},
  actions = {},
} = {}) {
  if (!interaction?.register) {
    throw new Error("bindCharacterInteractions requires an interaction system");
  }
  if (!character) {
    throw new Error("bindCharacterInteractions requires a character");
  }

  const unregister = [];

  function runDomainAction(type, payload) {
    const callback = actions[type];
    if (typeof callback !== "function") return false;
    return callback(payload);
  }

  function run(type, payload) {
    const definition = payload.definition ?? {};
    const animationKey = definition.animationKey;
    const clip = animationKey ? animations[animationKey] : null;

    if (clip && character.playAction) {
      const started = character.playAction(clip, {
        onDone: () => runDomainAction(type, payload),
      });
      if (started) return true;
    }

    return runDomainAction(type, payload);
  }

  for (const type of Object.values(INTERACTION_TYPES)) {
    unregister.push(
      interaction.register(type, (payload) => run(type, payload))
    );
  }

  return {
    dispose() {
      for (const remove of unregister.splice(0)) remove?.();
    },
  };
}
