import { CROP_IDS, CROP_STAGE_IDS, cropCatalog } from "./crop-catalog.js";
import {
  advanceFarmPlotGrowth,
  clearFarmPlotCrop,
  createEmptyFarmPlots,
  createPlantedFarmPlot,
  getFarmPlotGrowth,
  isFarmPlotEmpty,
  isFarmPlotTilled,
  isFarmPlotWatered,
  normalizeFarmPlots,
  prepareFarmPlot,
  serializeFarmPlots,
  waterFarmPlot,
} from "./farm-plot.js";
import { inventory } from "./inventory.js";
import { interactions } from "./interactions.js";
import { time } from "./time.js";
import { TOOL_IDS } from "./tool-catalog.js";
import { toolSystem } from "./tool-system.js";
import { world } from "./world.js";

export const farm = (() => {
  const ROWS = 4;
  const COLUMNS = 4;
  const PLOT_COUNT = ROWS * COLUMNS;
  const DEFAULT_CROP_ID = CROP_IDS.STARTER;
  const GAP = 6;
  const GRID_SIZE = 300;
  const CELL_SIZE = (GRID_SIZE - GAP * (COLUMNS - 1)) / COLUMNS;
  const WORLD_X = world.WIDTH / 2 - GRID_SIZE / 2;
  const WORLD_Y = 340;

  let plots = createEmptyFarmPlots(PLOT_COUNT);

  function setState(savedPlots) {
    plots = normalizeFarmPlots(savedPlots, PLOT_COUNT);
  }

  function getState() {
    return serializeFarmPlots(plots, PLOT_COUNT);
  }

  function getLayout() {
    return {
      x: WORLD_X,
      y: WORLD_Y,
      gridSize: GRID_SIZE,
      cellSize: CELL_SIZE,
    };
  }

  function update() {
    const currentDay = time.getDay();
    let changed = false;

    plots = plots.map((plot) => {
      const result = advanceFarmPlotGrowth(plot, currentDay);
      if (result.processed) changed = true;
      return result.plot;
    });

    return changed;
  }

  function prepareSoil(index) {
    const prepared = prepareFarmPlot(plots[index]);
    if (!prepared) {
      interactions.notify("แปลงนี้ไม่ต้องพรวนเพิ่มแล้ว");
      return false;
    }
    plots[index] = prepared;
    interactions.notify("พรวนดินเรียบร้อย พร้อมปลูกแล้ว!");
    return true;
  }

  function plantPlot(index, crop) {
    const plot = plots[index];
    if (!isFarmPlotTilled(plot)) {
      interactions.notify("ต้องใช้จอบพรวนดินก่อนปลูก");
      return false;
    }
    if (!inventory.has(crop.seedItemId, 1)) {
      interactions.notify("ไม่มีเมล็ด ไปซื้อที่ร้าน");
      return false;
    }

    const plantedPlot = createPlantedFarmPlot(crop.id, time.getDay(), plot);
    if (!plantedPlot || !inventory.remove(crop.seedItemId, 1)) return false;
    plots[index] = plantedPlot;
    interactions.notify("ปลูกเมล็ดแล้ว!");
    return true;
  }

  function waterPlot(index) {
    const currentDay = time.getDay();
    const plot = plots[index];
    if (!isFarmPlotTilled(plot)) {
      interactions.notify("ต้องพรวนดินก่อนจึงจะรดน้ำได้");
      return false;
    }
    if (isFarmPlotWatered(plot, currentDay)) {
      interactions.notify("แปลงนี้รดน้ำแล้วสำหรับวันนี้");
      return false;
    }
    if (!toolSystem.hasResource(TOOL_IDS.WATERING_CAN, 1)) {
      interactions.notify("น้ำในบัวหมดแล้ว ไปเติมที่บ่อน้ำ");
      return false;
    }

    const watered = waterFarmPlot(plot, currentDay);
    if (!watered || !toolSystem.consumeResource(TOOL_IDS.WATERING_CAN, 1)) return false;
    plots[index] = watered;
    const remaining = toolSystem.getResourceAmount(TOOL_IDS.WATERING_CAN);
    interactions.notify(`รดน้ำแล้ว! เหลือน้ำ ${remaining} หน่วย`);
    return true;
  }

  function harvestPlot(index, growth) {
    const { crop } = growth;
    if (!inventory.canAdd(crop.harvestItemId, crop.harvestQuantity)) {
      interactions.notify("กระเป๋าผลผลิตเต็มแล้ว");
      return false;
    }

    if (!inventory.add(crop.harvestItemId, crop.harvestQuantity)) return false;
    plots[index] = clearFarmPlotCrop(plots[index]);
    interactions.notify(`เก็บเกี่ยวแล้ว! ได้ผลผลิต ${crop.harvestQuantity} ชิ้น`);
    return true;
  }

  function inspectPlot(index) {
    const plot = plots[index];
    if (isFarmPlotEmpty(plot)) {
      interactions.notify(isFarmPlotTilled(plot)
        ? "ดินพร้อมปลูกแล้ว"
        : "แปลงนี้ยังไม่ได้พรวนดิน");
      return false;
    }

    const growth = getFarmPlotGrowth(plot);
    if (!growth) return false;
    if (growth.ready) {
      interactions.notify("พืชโตเต็มที่แล้ว พร้อมเก็บเกี่ยว");
      return false;
    }

    const moisture = isFarmPlotWatered(plot, time.getDay()) ? " ดินชุ่มน้ำแล้ว" : " ดินยังแห้งอยู่";
    interactions.notify(`ต้องรดน้ำอีก ${Math.max(1, growth.daysRemaining)} วันเพื่อให้โต ·${moisture}`);
    return false;
  }

  function getPlotActions(index) {
    const plot = plots[index];
    const currentDay = time.getDay();
    const empty = isFarmPlotEmpty(plot);
    const tilled = isFarmPlotTilled(plot);
    const watered = isFarmPlotWatered(plot, currentDay);
    const crop = cropCatalog.get(DEFAULT_CROP_ID);
    const growth = empty ? null : getFarmPlotGrowth(plot);
    const waterAmount = toolSystem.getResourceAmount(TOOL_IDS.WATERING_CAN);

    return [
      {
        id: "plant-crop",
        toolIds: [TOOL_IDS.HAND],
        priority: 100,
        when: () => empty && tilled && Boolean(crop),
        label: () => crop && inventory.has(crop.seedItemId, 1) ? "ปลูก" : "ไม่มีเมล็ด",
        execute: () => crop ? plantPlot(index, crop) : false,
      },
      {
        id: "soil-needs-preparation",
        toolIds: [TOOL_IDS.HAND],
        priority: 100,
        when: () => empty && !tilled,
        label: "ต้องพรวนดิน",
        execute: () => {
          interactions.notify("เลือกจอบเพื่อพรวนดินก่อนปลูก");
          return false;
        },
      },
      {
        id: "inspect-growing-crop",
        toolIds: [TOOL_IDS.HAND],
        priority: 90,
        when: () => Boolean(growth) && !growth.ready,
        label: "ตรวจดู",
        execute: () => inspectPlot(index),
      },
      {
        id: "prepare-soil",
        toolIds: [TOOL_IDS.HOE],
        priority: 100,
        when: () => empty && !tilled,
        label: "พรวนดิน",
        execute: () => prepareSoil(index),
      },
      {
        id: "soil-ready",
        toolIds: [TOOL_IDS.HOE],
        priority: 90,
        when: () => empty && tilled,
        label: "ดินพร้อมแล้ว",
        execute: () => {
          interactions.notify("ดินแปลงนี้พรวนเรียบร้อยแล้ว");
          return false;
        },
      },
      {
        id: "water-plot",
        toolIds: [TOOL_IDS.WATERING_CAN],
        priority: 100,
        when: () => tilled && !watered && !growth?.ready,
        label: () => waterAmount > 0 ? "รดน้ำ" : "น้ำหมด",
        execute: () => waterPlot(index),
      },
      {
        id: "plot-already-watered",
        toolIds: [TOOL_IDS.WATERING_CAN],
        priority: 95,
        when: () => tilled && watered && !growth?.ready,
        label: "รดน้ำแล้ว",
        execute: () => {
          interactions.notify("แปลงนี้ชุ่มน้ำแล้วสำหรับวันนี้");
          return false;
        },
      },
      {
        id: "water-unprepared-soil",
        toolIds: [TOOL_IDS.WATERING_CAN],
        priority: 90,
        when: () => !tilled,
        label: "ต้องพรวนดินก่อน",
        execute: () => {
          interactions.notify("เลือกจอบพรวนดินก่อนรดน้ำ");
          return false;
        },
      },
      {
        id: "harvest-crop",
        priority: 100,
        when: () => Boolean(growth?.ready),
        label: "เก็บเกี่ยว",
        execute: () => {
          const latestGrowth = getFarmPlotGrowth(plots[index]);
          return latestGrowth?.ready ? harvestPlot(index, latestGrowth) : false;
        },
      },
      {
        id: "inspect-plot",
        priority: -100,
        label: () => empty ? "ตรวจแปลง" : "ตรวจดู",
        execute: () => inspectPlot(index),
      },
    ];
  }

  function getInteractions() {
    return plots.map((_, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      return {
        id: `farm-plot-${index}`,
        x: WORLD_X + column * (CELL_SIZE + GAP) + CELL_SIZE / 2,
        y: WORLD_Y + row * (CELL_SIZE + GAP) + CELL_SIZE / 2,
        radius: 78,
        priority: 10,
        highlightRadius: CELL_SIZE * 0.43,
        getActions: () => getPlotActions(index),
      };
    });
  }

  function drawPlant(ctx, growth, centerX, centerY) {
    if (!growth) return;

    if (growth.stage.id === CROP_STAGE_IDS.SEED) {
      ctx.fillStyle = "#362014";
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.max(4, CELL_SIZE * 0.07), 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const ready = growth.stage.id === CROP_STAGE_IDS.READY;
    ctx.fillStyle = ready ? "#4fc34a" : "#69a943";
    const stemHeight = ready ? CELL_SIZE * 0.5 : CELL_SIZE * 0.28;
    ctx.fillRect(centerX - 4, centerY - stemHeight / 2, 8, stemHeight);
    ctx.beginPath();
    ctx.ellipse(centerX - CELL_SIZE * 0.13, centerY - stemHeight * 0.15, CELL_SIZE * 0.16, CELL_SIZE * 0.1, -0.5, 0, Math.PI * 2);
    ctx.ellipse(centerX + CELL_SIZE * 0.13, centerY - stemHeight * 0.35, CELL_SIZE * 0.16, CELL_SIZE * 0.1, 0.5, 0, Math.PI * 2);
    ctx.fill();

    if (ready) {
      ctx.fillStyle = "#ffe36c";
      ctx.beginPath();
      ctx.arc(centerX, centerY - stemHeight * 0.55, CELL_SIZE * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSoil(ctx, plot, cellX, cellY, currentDay) {
    const tilled = isFarmPlotTilled(plot);
    const watered = isFarmPlotWatered(plot, currentDay);
    ctx.fillStyle = !tilled ? "#90633d" : watered ? "#4b392d" : "#704425";
    ctx.fillRect(cellX, cellY, CELL_SIZE, CELL_SIZE);

    if (!tilled) return;
    ctx.strokeStyle = watered ? "rgba(116, 174, 197, 0.38)" : "rgba(188, 130, 78, 0.46)";
    ctx.lineWidth = 2;
    for (let offset = CELL_SIZE * 0.22; offset < CELL_SIZE; offset += CELL_SIZE * 0.23) {
      ctx.beginPath();
      ctx.moveTo(cellX + 7, cellY + offset);
      ctx.lineTo(cellX + CELL_SIZE - 7, cellY + offset);
      ctx.stroke();
    }
  }

  function draw(ctx) {
    const currentDay = time.getDay();
    plots.forEach((plot, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const cellX = WORLD_X + column * (CELL_SIZE + GAP);
      const cellY = WORLD_Y + row * (CELL_SIZE + GAP);
      const growth = getFarmPlotGrowth(plot);
      const ready = growth?.stage.id === CROP_STAGE_IDS.READY;

      drawSoil(ctx, plot, cellX, cellY, currentDay);
      ctx.strokeStyle = ready ? "#ffe36c" : "#9a6338";
      ctx.lineWidth = ready ? 4 : 2;
      ctx.strokeRect(cellX + 1, cellY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      drawPlant(ctx, growth, cellX + CELL_SIZE / 2, cellY + CELL_SIZE / 2);
    });
  }

  return { setState, getState, getLayout, getInteractions, update, draw };
})();
