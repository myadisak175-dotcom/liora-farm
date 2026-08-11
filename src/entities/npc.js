import { createCharacter } from "./character.js";

/**
 * NPC adapter. Dialogue, schedules and AI belong in systems; this entity only
 * establishes the shared character runtime contract.
 */
export function createNPC(options = {}) {
  return createCharacter({
    ...options,
    role: "npc",
  });
}
