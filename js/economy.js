// ตัวเลขที่ใช้ปรับสมดุลเกมรวมอยู่ที่เดียว
const GAME_BALANCE = Object.freeze({
  startingCoins: 50,
  startingSeeds: 3,
  seedPrice: 10,
  cropSellPrice: 20,
  cropGrowthDays: 3,
});

const economy = (() => {
  let coins = GAME_BALANCE.startingCoins;
  let seeds = GAME_BALANCE.startingSeeds;
  let crops = 0;
  let shopOpen = false;
  let shopMessage = "ซื้อเมล็ด หรือขายผลผลิตได้ที่นี่";

  function validCount(value, fallback) {
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
  }

  function setState(state) {
    coins = validCount(state?.coins, GAME_BALANCE.startingCoins);
    seeds = validCount(state?.seeds, GAME_BALANCE.startingSeeds);
    crops = validCount(state?.crops, 0);
    shopOpen = false;
  }

  function getState() {
    return { coins, seeds, crops };
  }

  function hasSeed() {
    return seeds > 0;
  }

  function useSeed() {
    if (!hasSeed()) return false;
    seeds -= 1;
    return true;
  }

  function addCrop() {
    crops += 1;
  }

  function buySeed() {
    if (coins < GAME_BALANCE.seedPrice) {
      shopMessage = "เงินไม่พอซื้อเมล็ด";
      return false;
    }
    coins -= GAME_BALANCE.seedPrice;
    seeds += 1;
    shopMessage = "ซื้อเมล็ด 1 เมล็ดแล้ว!";
    return true;
  }

  function sellCrop() {
    if (crops < 1) {
      shopMessage = "ไม่มีผลผลิตให้ขาย";
      return false;
    }
    crops -= 1;
    coins += GAME_BALANCE.cropSellPrice;
    shopMessage = "ขายผลผลิต 1 ชิ้นแล้ว!";
    return true;
  }

  function getShopButton() {
    return { x: window.innerWidth - 122, y: 16, width: 106, height: 48 };
  }

  function getShopLayout() {
    const width = Math.min(390, window.innerWidth - 32);
    const height = 310;
    const x = (window.innerWidth - width) / 2;
    const y = Math.max(82, (window.innerHeight - height) / 2);
    return {
      x, y, width, height,
      sell: { x: x + 24, y: y + 158, width: width - 48, height: 48 },
      buy: { x: x + 24, y: y + 218, width: width - 48, height: 48 },
      close: { x: x + width - 48, y: y + 12, width: 36, height: 36 },
    };
  }

  function contains(button, x, y) {
    return x >= button.x && x <= button.x + button.width &&
      y >= button.y && y <= button.y + button.height;
  }

  // คืนค่า true เฉพาะเมื่อเงินหรือของในกระเป๋าเปลี่ยน เพื่อให้ main บันทึกเกม
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
    ctx.font = "600 17px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, button.x + button.width / 2, button.y + button.height / 2);
  }

  function drawHUD(ctx) {
    const label = `🪙 ${coins}   เมล็ด ${seeds}   ผลผลิต ${crops}`;
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const width = ctx.measureText(label).width + 24;
    ctx.fillStyle = "rgba(10, 24, 25, 0.76)";
    ctx.fillRect(16, 70, width, 40);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, 28, 81);
    drawButton(ctx, getShopButton(), "ร้านค้า", "#b46b2c");
  }

  function drawShop(ctx) {
    if (!shopOpen) return;
    const layout = getShopLayout();
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

    drawButton(ctx, layout.sell, `ขายผลผลิต 1 ชิ้น (+${GAME_BALANCE.cropSellPrice} เหรียญ)`, "#4f8d46");
    drawButton(ctx, layout.buy, `ซื้อเมล็ด 1 เมล็ด (-${GAME_BALANCE.seedPrice} เหรียญ)`, "#b46b2c");
    drawButton(ctx, layout.close, "×", "#8c493e");
  }

  return {
    setState, getState, hasSeed, useSeed, addCrop, buySeed, sellCrop,
    handleTap, drawHUD, drawShop, isShopOpen: () => shopOpen,
  };
})();
