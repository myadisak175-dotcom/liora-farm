import { ITEM_IDS, itemCatalog } from "./item-catalog.js";

const DEFAULT_COUNTS = Object.freeze({
  [ITEM_IDS.STARTER_SEED]: 3,
  [ITEM_IDS.STARTER_CROP]: 0,
  [ITEM_IDS.DEWLEAF]: 1,
  [ITEM_IDS.SWEET_ROOT]: 1,
  [ITEM_IDS.TWIG_BUNDLE]: 1,
  [ITEM_IDS.GLOW_PETAL]: 1,
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validCount(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export const inventory = (() => {
  const counts = new Map();

  function resetToDefaults() {
    counts.clear();
    itemCatalog.list().forEach((item) => {
      counts.set(item.id, validCount(DEFAULT_COUNTS[item.id], 0));
    });
  }

  function setState(state) {
    const items = isRecord(state?.items) ? state.items : null;
    counts.clear();

    itemCatalog.list().forEach((item) => {
      const fallback = validCount(DEFAULT_COUNTS[item.id], 0);
      counts.set(item.id, validCount(items?.[item.id], fallback));
    });
  }

  function getState() {
    return {
      items: Object.fromEntries(
        itemCatalog.list().map((item) => [item.id, getCount(item.id)]),
      ),
    };
  }

  function getCount(itemId) {
    return itemCatalog.has(itemId) ? counts.get(itemId) ?? 0 : 0;
  }

  function has(itemId, amount = 1) {
    return itemCatalog.has(itemId) && Number.isSafeInteger(amount) && amount > 0 && getCount(itemId) >= amount;
  }

  function canAdd(itemId, amount = 1) {
    const item = itemCatalog.get(itemId);
    if (!item || !Number.isSafeInteger(amount) || amount <= 0) return false;
    return getCount(itemId) + amount <= item.stackLimit;
  }

  function add(itemId, amount = 1) {
    if (!canAdd(itemId, amount)) return false;
    counts.set(itemId, getCount(itemId) + amount);
    return true;
  }

  function remove(itemId, amount = 1) {
    if (!has(itemId, amount)) return false;
    counts.set(itemId, getCount(itemId) - amount);
    return true;
  }

  function getEntries() {
    return itemCatalog.list().map((item) => ({
      item,
      count: getCount(item.id),
    }));
  }

  resetToDefaults();

  return {
    setState,
    getState,
    getCount,
    getEntries,
    has,
    canAdd,
    add,
    remove,
  };
})();
