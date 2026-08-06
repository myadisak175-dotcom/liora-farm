import { inventory } from "./inventory.js";
import { ITEM_IDS, itemCatalog } from "./item-catalog.js";
import { journeyProgress } from "./journey-progress.js";

const RECIPES = Object.freeze([
  { result: ITEM_IDS.HEALING_BALM, ingredient: ITEM_IDS.DEWLEAF, note: "ใช้ช่วยคนหรือสัตว์บาดเจ็บ" },
  { result: ITEM_IDS.ANIMAL_TREAT, ingredient: ITEM_IDS.SWEET_ROOT, note: "ใช้ทำให้สัตว์ที่กลัวสงบลง" },
  { result: ITEM_IDS.REPAIR_KIT, ingredient: ITEM_IDS.TWIG_BUNDLE, note: "ใช้ซ่อมสะพานและทางเดิน" },
  { result: ITEM_IDS.GLOW_LANTERN, ingredient: ITEM_IDS.GLOW_PETAL, note: "ใช้เปิดทางในหมอกและหาของลับ" },
]);

function contains(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function getLayout() {
  const margin = 14;
  const width = Math.min(620, window.innerWidth - margin * 2);
  const height = Math.min(650, window.innerHeight - margin * 2);
  const x = (window.innerWidth - width) / 2;
  const y = (window.innerHeight - height) / 2;
  const gap = 10;
  const columns = window.innerWidth < 430 ? 1 : 2;
  const cardWidth = columns === 1 ? width - 28 : (width - 38) / 2;
  const cardHeight = columns === 1 ? 82 : 116;
  const cardsTop = y + 112;
  const cards = RECIPES.map((recipe, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      recipe,
      x: x + 14 + column * (cardWidth + gap),
      y: cardsTop + row * (cardHeight + gap),
      width: cardWidth,
      height: cardHeight,
    };
  });
  const cardRows = Math.ceil(RECIPES.length / columns);
  const cardsBottom = cardsTop + cardRows * cardHeight + (cardRows - 1) * gap;
  return {
    x,
    y,
    width,
    height,
    cards,
    close: { x: x + width - 50, y: y + 12, width: 38, height: 38 },
    start: { x: x + 18, y: Math.min(y + height - 66, cardsBottom + 68), width: width - 36, height: 48 },
    statusY: Math.min(y + height - 104, cardsBottom + 24),
  };
}

export function createJourneyPrepUI({ onStartJourney } = {}) {
  let visible = false;
  let message = "คราฟอุปกรณ์ แล้วเลือกใส่กระเป๋าได้ 2 ชิ้น";

  function show(text) {
    message = String(text ?? "");
  }

  function craft(recipe) {
    if (inventory.has(recipe.result)) return false;
    if (!inventory.has(recipe.ingredient)) {
      show(`ยังขาด ${itemCatalog.get(recipe.ingredient)?.name ?? "วัตถุดิบ"}`);
      return false;
    }
    if (!inventory.canAdd(recipe.result, 1)) {
      show("อุปกรณ์ชิ้นนี้มีอยู่แล้ว");
      return false;
    }
    inventory.remove(recipe.ingredient, 1);
    inventory.add(recipe.result, 1);
    show(`คราฟ ${itemCatalog.get(recipe.result)?.name} สำเร็จ แตะอีกครั้งเพื่อใส่กระเป๋า`);
    return true;
  }

  function activateCard(recipe) {
    if (!inventory.has(recipe.result)) return craft(recipe);
    const result = journeyProgress.toggleLoadout(recipe.result);
    if (!result.changed) {
      show(result.reason);
      return false;
    }
    show(result.selected ? "ใส่อุปกรณ์ลงกระเป๋าแล้ว" : "นำอุปกรณ์ออกจากกระเป๋าแล้ว");
    return true;
  }

  function handleTap(x, y) {
    if (!visible) return false;
    const layout = getLayout();
    if (contains(layout.close, x, y)) {
      visible = false;
      return true;
    }
    const card = layout.cards.find((entry) => contains(entry, x, y));
    if (card) {
      activateCard(card.recipe);
      return true;
    }
    if (contains(layout.start, x, y)) {
      if (journeyProgress.getLoadout().length === 0) {
        show("เลือกอุปกรณ์อย่างน้อย 1 ชิ้นก่อนออกเดินทาง");
        return true;
      }
      visible = false;
      onStartJourney?.();
      return true;
    }
    return true;
  }

  function drawCard(ctx, card) {
    const resultItem = itemCatalog.get(card.recipe.result);
    const ingredientItem = itemCatalog.get(card.recipe.ingredient);
    const crafted = inventory.has(card.recipe.result);
    const selected = journeyProgress.hasPrepared(card.recipe.result);

    ctx.fillStyle = selected ? "#dff4d2" : crafted ? "#fff4cf" : "#f8f0dc";
    ctx.beginPath();
    ctx.roundRect(card.x, card.y, card.width, card.height, 14);
    ctx.fill();
    ctx.strokeStyle = selected ? "#4f8d46" : "#9a7448";
    ctx.lineWidth = selected ? 4 : 2;
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#3d2a1e";
    ctx.font = "700 17px system-ui, sans-serif";
    ctx.fillText(`${resultItem.icon} ${resultItem.name}`, card.x + 12, card.y + 11, card.width - 24);
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "#69503a";
    ctx.fillText(card.recipe.note, card.x + 12, card.y + 38, card.width - 24);

    const status = selected
      ? "✓ ใส่ในกระเป๋าแล้ว"
      : crafted
        ? "แตะเพื่อใส่กระเป๋า"
        : `${ingredientItem.icon} ${ingredientItem.name} ${inventory.getCount(ingredientItem.id)}/1 · แตะเพื่อคราฟ`;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillStyle = selected ? "#376f31" : "#7a4c23";
    ctx.fillText(status, card.x + 12, card.y + card.height - 25, card.width - 24);
  }

  function draw(ctx) {
    if (!visible) return;
    const layout = getLayout();
    const loadout = journeyProgress.getLoadout();

    ctx.save();
    ctx.fillStyle = "rgba(7, 18, 20, 0.72)";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = "#fffaf0";
    ctx.beginPath();
    ctx.roundRect(layout.x, layout.y, layout.width, layout.height, 22);
    ctx.fill();
    ctx.strokeStyle = "#6f4525";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#3f2c20";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "800 25px system-ui, sans-serif";
    ctx.fillText("โต๊ะเตรียมการเดินทาง", window.innerWidth / 2, layout.y + 22);
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillStyle = "#6c5845";
    ctx.fillText("คราฟครั้งเดียว ใช้ซ้ำได้ · เลือกพกเพียง 2 ชิ้น", window.innerWidth / 2, layout.y + 62);
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.fillStyle = "#4f7c45";
    ctx.fillText(`กระเป๋าเตรียมของ ${loadout.length}/${journeyProgress.getMaxLoadout()}`, window.innerWidth / 2, layout.y + 86);

    layout.cards.forEach((card) => drawCard(ctx, card));

    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "#6c5845";
    ctx.fillText(message, window.innerWidth / 2, layout.statusY, layout.width - 40);

    ctx.fillStyle = "#4f8d46";
    ctx.beginPath();
    ctx.roundRect(layout.start.x, layout.start.y, layout.start.width, layout.start.height, 14);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 17px system-ui, sans-serif";
    ctx.fillText("ออกสำรวจป่าหมอก", window.innerWidth / 2, layout.start.y + 14);

    ctx.fillStyle = "#8c493e";
    ctx.beginPath();
    ctx.roundRect(layout.close.x, layout.close.y, layout.close.width, layout.close.height, 10);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 24px system-ui, sans-serif";
    ctx.fillText("×", layout.close.x + layout.close.width / 2, layout.close.y + 4);
    ctx.restore();
  }

  return {
    open() {
      visible = true;
      message = "คราฟอุปกรณ์ แล้วเลือกใส่กระเป๋าได้ 2 ชิ้น";
    },
    close() {
      visible = false;
    },
    isOpen: () => visible,
    handleTap,
    draw,
  };
}
