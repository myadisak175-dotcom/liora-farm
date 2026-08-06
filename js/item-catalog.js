export const ITEM_IDS = Object.freeze({
  STARTER_SEED: "starter-seed",
  STARTER_CROP: "starter-crop",
  DEWLEAF: "dewleaf",
  SWEET_ROOT: "sweet-root",
  TWIG_BUNDLE: "twig-bundle",
  GLOW_PETAL: "glow-petal",
  HEALING_BALM: "healing-balm",
  ANIMAL_TREAT: "animal-treat",
  REPAIR_KIT: "repair-kit",
  GLOW_LANTERN: "glow-lantern",
});

function freezeItem(item) {
  return Object.freeze({ ...item });
}

const ITEMS = Object.freeze({
  [ITEM_IDS.STARTER_SEED]: freezeItem({
    id: ITEM_IDS.STARTER_SEED,
    name: "เมล็ดเดวลีฟ",
    icon: "🌱",
    category: "seed",
    stackLimit: 999,
    buyPrice: 10,
    sellPrice: 0,
  }),
  [ITEM_IDS.STARTER_CROP]: freezeItem({
    id: ITEM_IDS.STARTER_CROP,
    name: "เดวลีฟที่เก็บเกี่ยว",
    icon: "🌿",
    category: "crop",
    stackLimit: 999,
    buyPrice: 0,
    sellPrice: 20,
  }),
  [ITEM_IDS.DEWLEAF]: freezeItem({
    id: ITEM_IDS.DEWLEAF,
    name: "สมุนไพรเดวลีฟ",
    icon: "🍃",
    category: "material",
    stackLimit: 99,
    buyPrice: 0,
    sellPrice: 0,
  }),
  [ITEM_IDS.SWEET_ROOT]: freezeItem({
    id: ITEM_IDS.SWEET_ROOT,
    name: "หัวรากหวาน",
    icon: "🥕",
    category: "material",
    stackLimit: 99,
    buyPrice: 0,
    sellPrice: 0,
  }),
  [ITEM_IDS.TWIG_BUNDLE]: freezeItem({
    id: ITEM_IDS.TWIG_BUNDLE,
    name: "กิ่งไม้เนื้ออ่อน",
    icon: "🪵",
    category: "material",
    stackLimit: 99,
    buyPrice: 0,
    sellPrice: 0,
  }),
  [ITEM_IDS.GLOW_PETAL]: freezeItem({
    id: ITEM_IDS.GLOW_PETAL,
    name: "กลีบแสง",
    icon: "✨",
    category: "material",
    stackLimit: 99,
    buyPrice: 0,
    sellPrice: 0,
  }),
  [ITEM_IDS.HEALING_BALM]: freezeItem({
    id: ITEM_IDS.HEALING_BALM,
    name: "ขี้ผึ้งรักษา",
    icon: "🧴",
    category: "journey-tool",
    stackLimit: 1,
    buyPrice: 0,
    sellPrice: 0,
  }),
  [ITEM_IDS.ANIMAL_TREAT]: freezeItem({
    id: ITEM_IDS.ANIMAL_TREAT,
    name: "ขนมสัตว์",
    icon: "🥕",
    category: "journey-tool",
    stackLimit: 1,
    buyPrice: 0,
    sellPrice: 0,
  }),
  [ITEM_IDS.REPAIR_KIT]: freezeItem({
    id: ITEM_IDS.REPAIR_KIT,
    name: "ชุดซ่อมพกพา",
    icon: "🧰",
    category: "journey-tool",
    stackLimit: 1,
    buyPrice: 0,
    sellPrice: 0,
  }),
  [ITEM_IDS.GLOW_LANTERN]: freezeItem({
    id: ITEM_IDS.GLOW_LANTERN,
    name: "โคมกลีบแสง",
    icon: "🏮",
    category: "journey-tool",
    stackLimit: 1,
    buyPrice: 0,
    sellPrice: 0,
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
