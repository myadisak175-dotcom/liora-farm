export const ITEM_IDS = Object.freeze({
  STARTER_SEED: "starter-seed",
  STARTER_CROP: "starter-crop",
});

function freezeItem(item) {
  return Object.freeze({ ...item });
}

const ITEMS = Object.freeze({
  [ITEM_IDS.STARTER_SEED]: freezeItem({
    id: ITEM_IDS.STARTER_SEED,
    name: "เมล็ด",
    icon: "🌱",
    category: "seed",
    stackLimit: 999,
    buyPrice: 10,
    sellPrice: 0,
  }),
  [ITEM_IDS.STARTER_CROP]: freezeItem({
    id: ITEM_IDS.STARTER_CROP,
    name: "ผลผลิต",
    icon: "📦",
    category: "crop",
    stackLimit: 999,
    buyPrice: 0,
    sellPrice: 20,
  }),
});

function hasItem(itemId) {
  return typeof itemId === "string" && Object.hasOwn(ITEMS, itemId);
}

export const itemCatalog = Object.freeze({
  has: hasItem,

  get(itemId) {
    return hasItem(itemId) ? ITEMS[itemId] : null;
  },

  list() {
    return Object.values(ITEMS);
  },
});
