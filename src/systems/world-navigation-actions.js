import { WORLD_ACTIONS } from "./world-actions.js";
import { WORLD_NAVIGATION } from "./world-navigation.js";

/**
 * Browser/world navigation is an action plugin, not a special case in the
 * proximity runtime. A portal node therefore uses the same authored action
 * pipeline as dialogue, quests or inventory will use later.
 */
const unregisterPortal = WORLD_ACTIONS.register("portal", async (action, context) => {
  const nodeData = context?.node?.data ?? {};
  const mapId = String(action.mapId ?? nodeData.targetMap ?? "").trim();
  const markerId = String(action.markerId ?? nodeData.targetMarker ?? "").trim();
  const result = await WORLD_NAVIGATION.navigate({ mapId, markerId });
  if (!result.ok) {
    throw new Error(`Portal target failed: ${result.code}`);
  }
  return result;
});

export function disposeWorldNavigationActions() {
  unregisterPortal();
}
