import { camera } from "../camera.js";
import { interactions } from "../interactions.js";
import { inventory } from "../inventory.js";
import { ITEM_IDS, itemCatalog } from "../item-catalog.js";
import { journeyProgress } from "../journey-progress.js";
import { player } from "../player.js";
import { createSpawnAnchors } from "../spawn-anchors.js";

const WIDTH = 1400;
const HEIGHT = 1000;
const SPAWNS = createSpawnAnchors({
  default: { x: 170, y: 865, facingX: 1, facingY: 0 },
  "forest-entry": { x: 170, y: 865, facingX: 1, facingY: 0 },
});

const RIVER_X = 680;
const RIVER_WIDTH = 110;
const BRIDGE_TOP = 455;
const BRIDGE_HEIGHT = 120;

function getColliders() {
  const colliders = [
    { x: RIVER_X, y: 0, width: RIVER_WIDTH, height: BRIDGE_TOP },
    { x: RIVER_X, y: BRIDGE_TOP + BRIDGE_HEIGHT, width: RIVER_WIDTH, height: 190 },
  ];
  if (!journeyProgress.isBridgeRepaired()) {
    colliders.push({ x: RIVER_X, y: BRIDGE_TOP, width: RIVER_WIDTH, height: BRIDGE_HEIGHT });
  }
  return colliders;
}

function drawTree(ctx, x, y, scale = 1) {
  ctx.fillStyle = "#5a3d28";
  ctx.fillRect(x - 8 * scale, y, 16 * scale, 42 * scale);
  ctx.fillStyle = "#305d45";
  ctx.beginPath();
  ctx.arc(x, y - 8 * scale, 34 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3f7351";
  ctx.beginPath();
  ctx.arc(x - 18 * scale, y + 4 * scale, 24 * scale, 0, Math.PI * 2);
  ctx.arc(x + 18 * scale, y + 4 * scale, 24 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawForest(ctx) {
  ctx.fillStyle = "#365f49";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#416d4f";
  for (let y = 0; y < HEIGHT; y += 80) {
    for (let x = 0; x < WIDTH; x += 80) {
      if ((x / 80 + y / 80) % 2 === 0) ctx.fillRect(x, y, 80, 80);
    }
  }

  ctx.strokeStyle = "rgba(224, 215, 160, 0.38)";
  ctx.lineWidth = 72;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(150, 865);
  ctx.quadraticCurveTo(430, 760, 620, 670);
  ctx.moveTo(810, 690);
  ctx.quadraticCurveTo(1030, 610, 1120, 330);
  ctx.stroke();

  ctx.fillStyle = "#3f86a3";
  ctx.fillRect(RIVER_X, 0, RIVER_WIDTH, 765);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  for (let y = 18; y < 750; y += 50) {
    ctx.fillRect(RIVER_X + 12, y, RIVER_WIDTH - 24, 6);
  }

  ctx.fillStyle = journeyProgress.isBridgeRepaired() ? "#9b6b3f" : "#5e4939";
  ctx.fillRect(RIVER_X - 20, BRIDGE_TOP, RIVER_WIDTH + 40, BRIDGE_HEIGHT);
  ctx.strokeStyle = "#3d2b22";
  ctx.lineWidth = 5;
  for (let y = BRIDGE_TOP + 12; y < BRIDGE_TOP + BRIDGE_HEIGHT; y += 22) {
    ctx.beginPath();
    ctx.moveTo(RIVER_X - 18, y);
    ctx.lineTo(RIVER_X + RIVER_WIDTH + 18, y);
    ctx.stroke();
  }
  if (!journeyProgress.isBridgeRepaired()) {
    ctx.fillStyle = "#3f86a3";
    ctx.beginPath();
    ctx.moveTo(RIVER_X + 34, BRIDGE_TOP + 32);
    ctx.lineTo(RIVER_X + 82, BRIDGE_TOP + 46);
    ctx.lineTo(RIVER_X + 58, BRIDGE_TOP + 89);
    ctx.lineTo(RIVER_X + 20, BRIDGE_TOP + 68);
    ctx.closePath();
    ctx.fill();
  }

  const trees = [
    [90, 130, 1.1], [230, 170, 0.9], [390, 120, 1], [560, 180, 1.1],
    [90, 430, 1], [280, 410, 1.1], [500, 390, 0.9], [120, 690, 1.1],
    [350, 650, 0.9], [560, 820, 1], [900, 120, 1], [1090, 120, 1.1],
    [1290, 200, 0.9], [930, 450, 1.1], [1260, 520, 1], [930, 820, 1],
    [1180, 800, 1.1], [1330, 870, 0.9],
  ];
  trees.forEach(([x, y, scale]) => drawTree(ctx, x, y, scale));

  if (!journeyProgress.isMistCleared()) {
    const gradient = ctx.createRadialGradient(500, 505, 20, 500, 505, 170);
    gradient.addColorStop(0, "rgba(205, 220, 225, 0.72)");
    gradient.addColorStop(1, "rgba(205, 220, 225, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(500, 505, 180, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!journeyProgress.isRabbitRescued()) {
    ctx.save();
    ctx.translate(1115, 300);
    ctx.fillStyle = "#cbc4b8";
    ctx.beginPath();
    ctx.ellipse(0, 8, 24, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-10, -18, 8, 24, -0.25, 0, Math.PI * 2);
    ctx.ellipse(10, -18, 8, 24, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6a3b70";
    ctx.beginPath();
    ctx.arc(8, 3, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(99, 46, 104, 0.7)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 10, 30, 0.2, 2.8);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = "#7a4c2c";
  ctx.fillRect(115, 830, 72, 52);
  ctx.fillStyle = "#f2d392";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ฟาร์ม", 151, 856);
}

function drawObjectivePanel(ctx) {
  const loadout = journeyProgress.getLoadout()
    .map((itemId) => itemCatalog.get(itemId)?.icon)
    .filter(Boolean)
    .join(" ") || "—";
  const objective = journeyProgress.isRabbitRescued()
    ? "ช่วยกระต่ายสำเร็จ · กลับฟาร์ม"
    : "สำรวจข้ามลำธารและช่วยกระต่าย";

  ctx.fillStyle = "rgba(9, 25, 24, 0.78)";
  ctx.beginPath();
  ctx.roundRect(12, 140, Math.min(340, window.innerWidth - 24), 78, 14);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "700 14px system-ui, sans-serif";
  ctx.fillText("ภารกิจ: เสียงร้องในป่าหมอก", 24, 152);
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(objective, 24, 176, Math.min(310, window.innerWidth - 48));
  ctx.fillStyle = "#ffe9a8";
  ctx.fillText(`ของที่เตรียม: ${loadout}`, 24, 198);
}

export function createMistwoodForestScene({ requestSceneChange } = {}) {
  function returnHome() {
    requestSceneChange?.("farm-exterior", { spawnId: "forest-return" });
    return true;
  }

  function enter({ state, spawnId, from } = {}) {
    if (from === null) journeyProgress.setState(state?.journey);

    player.configure({
      space: "mistwood-forest",
      bounds: { width: WIDTH, height: HEIGHT },
      defaultPosition: SPAWNS.resolve(),
      getColliders,
    });
    player.setState(state?.player, spawnId ? SPAWNS.resolve(spawnId) : null);

    camera.setBounds(WIDTH, HEIGHT);
    interactions.clear();
    interactions.registerMany([
      {
        id: "forest-return-home",
        x: 150,
        y: 855,
        radius: 82,
        priority: 4,
        label: "กลับฟาร์ม",
        action: returnHome,
      },
      {
        id: "mistwood-fog",
        x: 500,
        y: 505,
        radius: 105,
        label: () => journeyProgress.isMistCleared() ? "สำรวจลานหมอก" : "ตรวจหมอก",
        action() {
          if (journeyProgress.isMistCleared()) {
            interactions.notify("แสงจากโคมทำให้เห็นเส้นทางและเมล็ดที่ซ่อนอยู่");
            return false;
          }
          if (!journeyProgress.hasPrepared(ITEM_IDS.GLOW_LANTERN)) {
            interactions.notify("หมอกหนาเกินไป แต่ยังเดินอ้อมริมลำธารได้");
            return false;
          }
          journeyProgress.markMistCleared();
          inventory.add(ITEM_IDS.STARTER_SEED, 1);
          interactions.notify("โคมกลีบแสงเผยทางลับ ได้เมล็ดเดวลีฟ +1", 2800);
          return true;
        },
      },
      {
        id: "mistwood-bridge",
        x: RIVER_X + RIVER_WIDTH / 2,
        y: BRIDGE_TOP + BRIDGE_HEIGHT / 2,
        radius: 120,
        label: () => journeyProgress.isBridgeRepaired() ? "ตรวจสะพาน" : "ตรวจสะพานพัง",
        action() {
          if (journeyProgress.isBridgeRepaired()) {
            interactions.notify("สะพานแข็งแรงพอให้ข้ามได้แล้ว");
            return false;
          }
          if (!journeyProgress.hasPrepared(ITEM_IDS.REPAIR_KIT)) {
            interactions.notify("ต้องใช้ชุดซ่อม หรือเดินอ้อมลงใต้ลำธาร");
            return false;
          }
          journeyProgress.markBridgeRepaired();
          interactions.notify("ซ่อมสะพานสำเร็จ เปิดทางลัดข้ามลำธารแล้ว!", 2600);
          return true;
        },
      },
      {
        id: "mistwood-rabbit",
        x: 1115,
        y: 300,
        radius: 100,
        isEnabled: () => !journeyProgress.isRabbitRescued(),
        label: "ช่วยกระต่าย",
        action() {
          const hasMedicine = journeyProgress.hasPrepared(ITEM_IDS.HEALING_BALM);
          const hasTreat = journeyProgress.hasPrepared(ITEM_IDS.ANIMAL_TREAT);
          if (!hasMedicine && !hasTreat) {
            interactions.notify("มันทั้งบาดเจ็บและหวาดกลัว ควรเตรียมยาหรือขนมสัตว์มา", 2800);
            return false;
          }
          journeyProgress.markRabbitRescued();
          inventory.add(ITEM_IDS.STARTER_SEED, 2);
          inventory.add(ITEM_IDS.STARTER_CROP, 1);
          interactions.notify(
            hasMedicine
              ? "รักษาบาดแผลสำเร็จ กระต่ายจะตามกลับไปพักที่ฟาร์ม"
              : "ขนมทำให้มันยอมเข้าใกล้ Liora และตามกลับฟาร์ม",
            3200,
          );
          return true;
        },
      },
    ]);

    const position = player.getPosition();
    interactions.update(position.x, position.y);
    camera.snapTo(position.x, position.y);
    interactions.notify(
      journeyProgress.isRabbitRescued()
        ? "ภารกิจเสร็จแล้ว กลับฟาร์มได้เลย"
        : "ของที่เตรียมจะเปิดทางเลือก แต่ทุกจุดมีทางอ้อมเสมอ",
      2600,
    );
  }

  function exit() {
    interactions.clear();
  }

  function update(deltaTime, { movementEnabled = true } = {}) {
    const moved = player.update(deltaTime, movementEnabled);
    const position = player.getPosition();
    interactions.update(position.x, position.y);
    camera.update(position.x, position.y, deltaTime);
    return moved;
  }

  function draw(ctx) {
    ctx.save();
    camera.apply(ctx);
    drawForest(ctx);
    interactions.drawWorld(ctx);
    player.draw(ctx);
    ctx.restore();
  }

  function drawUI(ctx) {
    drawObjectivePanel(ctx);
    interactions.drawMessage(ctx);
  }

  function handleAction() {
    return interactions.activateCurrent();
  }

  function getActionLabel() {
    return interactions.getPromptLabel();
  }

  function getSaveState() {
    return {
      player: player.getState(),
      journey: journeyProgress.getState(),
    };
  }

  return {
    id: "mistwood-forest",
    title: "ป่าหมอกคราม",
    enter,
    exit,
    update,
    draw,
    drawUI,
    handleAction,
    getActionLabel,
    getSaveState,
  };
}
