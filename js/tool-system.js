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

function normalizeResourceAmount(tool, value) {
  if (!tool?.resource) return null;
  const amount = value?.amount;
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= tool.resource.capacity
    ? amount
    : tool.resource.capacity;
}

export const toolSystem = (() => {
  let unlockedToolIds = [...DEFAULT_UNLOCKED_TOOL_IDS];
  let selectedToolId = TOOL_IDS.HAND;
  const resourceAmounts = new Map();

  function resetResources(state) {
    resourceAmounts.clear();
    toolCatalog.list().forEach((tool) => {
      if (!tool.resource) return;
      resourceAmounts.set(tool.id, normalizeResourceAmount(tool, state?.resources?.[tool.id]));
    });
  }

  function setState(state) {
    unlockedToolIds = normalizeUnlockedToolIds(state?.unlockedToolIds);
    selectedToolId = unlockedToolIds.includes(state?.selectedToolId)
      ? state.selectedToolId
      : TOOL_IDS.HAND;
    resetResources(state);
  }

  function getState() {
    const resources = {};
    toolCatalog.list().forEach((tool) => {
      if (!tool.resource) return;
      resources[tool.id] = { amount: getResourceAmount(tool.id) };
    });

    return {
      selectedToolId,
      unlockedToolIds: [...unlockedToolIds],
      resources,
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

  function getResource(toolId) {
    const tool = toolCatalog.get(toolId);
    if (!tool?.resource) return null;
    return {
      ...tool.resource,
      amount: getResourceAmount(toolId),
    };
  }

  function getResourceAmount(toolId) {
    const tool = toolCatalog.get(toolId);
    if (!tool?.resource) return 0;
    return resourceAmounts.get(toolId) ?? tool.resource.capacity;
  }

  function hasResource(toolId, amount = 1) {
    return Number.isSafeInteger(amount) && amount > 0 && getResourceAmount(toolId) >= amount;
  }

  function consumeResource(toolId, amount = 1) {
    if (!hasResource(toolId, amount)) return false;
    resourceAmounts.set(toolId, getResourceAmount(toolId) - amount);
    return true;
  }

  function refillResource(toolId) {
    const tool = toolCatalog.get(toolId);
    if (!tool?.resource || getResourceAmount(toolId) >= tool.resource.capacity) return false;
    resourceAmounts.set(toolId, tool.resource.capacity);
    return true;
  }

  resetResources(null);

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
    getResource,
    getResourceAmount,
    hasResource,
    consumeResource,
    refillResource,
  };
})();
