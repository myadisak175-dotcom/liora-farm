import { TOOL_IDS, toolCatalog } from "./tool-catalog.js";

const DEFAULT_UNLOCKED_TOOL_IDS = Object.freeze(
  toolCatalog.list().map((tool) => tool.id),
);

function normalizeUnlockedToolIds(value) {
  const requested = Array.isArray(value) ? value : DEFAULT_UNLOCKED_TOOL_IDS;
  const unique = new Set([TOOL_IDS.HAND]);
  requested.forEach((toolId) => {
    if (toolCatalog.has(toolId)) unique.add(toolId);
  });
  return toolCatalog.list()
    .map((tool) => tool.id)
    .filter((toolId) => unique.has(toolId));
}

export const toolSystem = (() => {
  let unlockedToolIds = [...DEFAULT_UNLOCKED_TOOL_IDS];
  let selectedToolId = TOOL_IDS.HAND;

  function setState(state) {
    unlockedToolIds = normalizeUnlockedToolIds(state?.unlockedToolIds);
    selectedToolId = unlockedToolIds.includes(state?.selectedToolId)
      ? state.selectedToolId
      : TOOL_IDS.HAND;
  }

  function getState() {
    return {
      selectedToolId,
      unlockedToolIds: [...unlockedToolIds],
    };
  }

  function isUnlocked(toolId) {
    return toolCatalog.has(toolId) && unlockedToolIds.includes(toolId);
  }

  function select(toolId) {
    if (!isUnlocked(toolId) || toolId === selectedToolId) return false;
    selectedToolId = toolId;
    return true;
  }

  function cycle(direction = 1) {
    if (unlockedToolIds.length < 2) return false;
    const step = direction < 0 ? -1 : 1;
    const currentIndex = Math.max(0, unlockedToolIds.indexOf(selectedToolId));
    const nextIndex = (currentIndex + step + unlockedToolIds.length) % unlockedToolIds.length;
    return select(unlockedToolIds[nextIndex]);
  }

  function unlock(toolId) {
    if (!toolCatalog.has(toolId) || unlockedToolIds.includes(toolId)) return false;
    unlockedToolIds = toolCatalog.list()
      .map((tool) => tool.id)
      .filter((id) => id === toolId || unlockedToolIds.includes(id));
    return true;
  }

  function getSelectedId() {
    return selectedToolId;
  }

  function getSelected() {
    return toolCatalog.get(selectedToolId);
  }

  function getUnlocked() {
    return unlockedToolIds.map((toolId) => toolCatalog.get(toolId));
  }

  return {
    setState,
    getState,
    isUnlocked,
    select,
    cycle,
    unlock,
    getSelectedId,
    getSelected,
    getUnlocked,
  };
})();
