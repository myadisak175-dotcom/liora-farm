import { WORLD_ACTIONS } from "./world-actions.js";
import { WORLD_EVENTS } from "./world-events.js";

function actionsFor(event) {
  const phase = String(event?.type ?? "");
  const table = event?.node?.data?.actions;
  if (!table || typeof table !== "object" || Array.isArray(table)) return [];
  return Array.isArray(table[phase]) ? table[phase] : [];
}

/**
 * Bridges spatial/world events to the data-driven action registry.
 *
 * The event producer never knows which action types exist. Likewise action
 * handlers never need to know how a Zone detected entry. This is the seam that
 * lets features such as dialogue, inventory, quests and portals arrive later
 * without editing the core proximity system.
 */
export function createWorldActionRuntime({
  events = WORLD_EVENTS,
  actions = WORLD_ACTIONS,
} = {}) {
  const unsubscribe = events.subscribe((event) => {
    const list = actionsFor(event);
    if (!list.length) return;
    actions.executeMany(list, {
      event,
      node: event.node,
      position: event.position,
      phase: event.type,
    });
  });

  return {
    dispose() {
      unsubscribe();
    },
  };
}

/**
 * The page currently owns one active world at a time, so one action bridge is
 * enough. The factory above already exposes teardown for future in-place world
 * switching, where this instance can move under the system registry.
 */
export const WORLD_ACTION_RUNTIME = createWorldActionRuntime();
