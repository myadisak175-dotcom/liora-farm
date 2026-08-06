import { inventory } from "./inventory.js";
import { ITEM_IDS, itemCatalog } from "./item-catalog.js";

export const GAME_BALANCE = Object.freeze({
  startingCoins: 50,
  cropGrowthDays: 3,
});

export const economy = (() => {
  const seedItem = itemCatalog.get(ITEM_IDS.STARTER_SEED);
  const cropItem = itemCatalog.get(ITEM_IDS.STARTER_CROP);

  let coins = GAME_BALANCE.startingCoins;
  let shopOpen = false;
  let shopMessage = "ซื้อเมล็ด หรือขายผลผลิตได้ที่นี่";

  function validCount(value, fallback) {
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
  }

  function setState(state) {
    coins = validCount(state?.coins, GAME_BALANCE.startingCoins);
    shopOpen = false;
  }

  function getState() {
    return { coins };
  }

  function buySeed() {
    if (!inventory.canAdd(seedItem.id, 1)) {
      shopMessage = "กระเป๋าเมล็ดเต็มแล้ว";
      return false;
    }
    if (coins < seedItem.buyPrice) {
      shopMessage = "เงินไม่พอซื้อเมล็ด";
      return false;
    }

    coins -= seedItem.buyPrice;
    inventory.add(seedItem.id, 1);
    shopMessage = "ซื้อเมล็ด 1 เมล็ดแล้ว!";
    return true;
  }

  function sellCrop() {
    if (!inventory.remove(cropItem.id, 1)) {
      shopMessage = "ไม่มีผลผลิตให้ขาย";
      return false;
    }

    coins += cropItem.sellPrice;
    shopMessage = "ขายผลผลิต 1 ชิ้นแล้ว!";
    return true;
  }

  function getShopButton() {
    return { x: window.innerWidth - 94, y: 91, width: 82, height: 40 };
  }

  function getShopLayout() {
    const width = Math.min(390, window.innerWidth - 32);
    const height = 310;
    const x = (window.innerWidth - width) / 2;
    const y = Math.max(82, (window.innerHeight - height) / 2);
    return {
      x,
      y,
      width,
      height,
      sell: { x: x + 24, y: y + 158, width: width - 48, height: 48 },
      buy: { x: x + 24, y: y + 218, width: width - 48, height: 48 },
      close: { x: x + width - 48, y: y + 12, width: 36, height: 36 },
    };
  }

  function contains(button, x, y) {
    return x >= button.x && x <= button.x + button.width &&
      y >= button.y && y <= button.y + button.height;
  }

  function handleTap(x, y) {
    if (!shopOpen) {
      if (!contains(getShopButton(), x, y)) return false;
      shopOpen = true;
      shopMessage = "ซื้อเมล็ด หรือขายผลผลิตได้ที่นี่";
      return false;
    }

    const layout = getShopLayout();
    if (contains(layout.close, x, y)) {
      shopOpen = false;
      return false;
    }
    if (contains(layout.sell, x, y)) return sellCrop();
    if (contains(layout.buy, x, y)) return buySeed();
    return false;
  }

  function drawButton(ctx, button, label, color) {
    ctx.fillStyle = color;
    ctx.fillRect(button.x, button.y, button.width, button.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, button.x + button.width / 2, button.y + button.height / 2);
  }

  function drawHUD(ctx) {
    const button = getShopButton();
    const seeds = inventory.getCount(seedItem.id);
    const crops = inventory.getCount(cropItem.id);

    ctx.fillStyle = "rgba(10, 24, 25, 0.76)";
    ctx.fillRect(12, 91, window.innerWidth - 24, 40);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`🪙 ${coins} · ${seedItem.icon} ${seeds} · ${cropItem.icon} ${crops}`, 22, 111);
    drawButton(ctx, button, "ร้านค้า", "#b46b2c");
  }

  function drawShop(ctx) {
    if (!shopOpen) return;
    const layout = getShopLayout();
    const seeds = inventory.getCount(seedItem.id);
    const crops = inventory.getCount(cropItem.id);

    ctx.fillStyle = "rgba(5, 12, 12, 0.62)";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = "#fff3cf";
    ctx.fillRect(layout.x, layout.y, layout.width, layout.height);
    ctx.strokeStyle = "#6f4525";
    ctx.lineWidth = 4;
    ctx.strokeRect(layout.x, layout.y, layout.width, layout.height);

    ctx.fillStyle = "#432b1c";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "700 25px system-ui, sans-serif";
    ctx.fillText("ร้านค้า", window.innerWidth / 2, layout.y + 22);
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillText(`เงิน ${coins} · เมล็ด ${seeds} · ผลผลิต ${crops}`, window.innerWidth / 2, layout.y + 68);
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(shopMessage, window.innerWidth / 2, layout.y + 108);

    drawButton(ctx, layout.sell, `ขายผลผลิต 1 ชิ้น (+${cropItem.sellPrice})`, "#4f8d46");
    drawButton(ctx, layout.buy, `ซื้อเมล็ด 1 เมล็ด (-${seedItem.buyPrice})`, "#b46b2c");
    drawButton(ctx, layout.close, "×", "#8c493e");
  }

  return {
    setState,
    getState,
    buySeed,
    sellCrop,
    handleTap,
    drawHUD,
    drawShop,
    isShopOpen: () => shopOpen,
  };
})();
