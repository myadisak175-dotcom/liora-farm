import { createCharacter } from "./character.js";

/**
 * Creature adapter. Creature AI/procedural motion can sit above the same
 * character runtime used by Liora and NPCs. A Meshy creature may omit clips;
 * in that case gameplay can animate its root/model procedurally.
 */
export function createCreature(options = {}) {
  return createCharacter({
    ...options,
    role: "creature",
  });
}
