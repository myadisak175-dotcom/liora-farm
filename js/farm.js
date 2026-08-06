import { CROP_IDS, CROP_STAGE_IDS, cropCatalog } from "./crop-catalog.js";
import {
  createEmptyFarmPlot,
  createEmptyFarmPlots,
  createPlantedFarmPlot,
  getFarmPlotGrowth,
  isFarmPlotEmpty,
  normalizeFarmPlots,
  serializeFarmPlots,
} from "./farm-plot.js";
import { inventory } from "./inventory.js";
import { interactions } from "./interactions.js";
import { time } from "./time.js";
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
    return false;
  }

  function plantPlot(index, crop) {
    if (!inventory.has(crop.seedItemId, 1)) {
      interactions.notify("ไม่มีเมล็ด ไปซื้อที่ร้าน");
      return false;
    }

    const plantedPlot = createPlantedFarmPlot(crop.id, time.getDay());
    if (!plantedPlot || !inventory.remove(crop.seedItemId, 1)) return false;
    plots[index] = plantedPlot;
    interactions.notify("ปลูกเมล็ดแล้ว!");
    return true;
  }

  function harvestPlot(index, growth) {
    const { crop } = growth;
    if (!inventory.canAdd(crop.harvestItemId, crop.harvestQuantity)) {
      interactions.notify("กระเป๋าผลผลิตเต็มแล้ว");
      return false;
    }

    if (!inventory.add(crop.harvestItemId, crop.harvestQuantity)) return false;
    plots[index] = createEmptyFarmPlot();
    interactions.notify(`เก็บเกี่ยวแล้ว! ได้ผลผลิต ${crop.harvestQuantity} ชิ้น`);
    return true;
  }

  function interactPlot(index) {
    const plot = plots[index];
    if (isFarmPlotEmpty(plot)) {
      const crop = cropCatalog.get(DEFAULT_CROP_ID);
      return crop ? plantPlot(index, crop) : false;
    }

    const growth = getFarmPlotGrowth(plot, time.getDay());
    if (!growth) return false;
    if (growth.ready) return harvestPlot(index, growth);

    interactions.notify(`พืชจะโตในอีก ${Math.max(1, growth.daysRemaining)} วัน`);
    return false;
  }

  function getPlotLabel(index) {
    const plot = plots[index];
    if (isFarmPlotEmpty(plot)) {
      const crop = cropCatalog.get(DEFAULT_CROP_ID);
      return crop && inventory.has(crop.seedItemId, 1) ? "ปลูก" : "ไม่มีเมล็ด";
    }

    const growth = getFarmPlotGrowth(plot, time.getDay());
    return growth?.ready ? "เก็บเกี่ยว" : "ตรวจดู";
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
        label: () => getPlotLabel(index),
        action: () => interactPlot(index),
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

  function draw(ctx) {
    const currentDay = time.getDay();
    plots.forEach((plot, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const cellX = WORLD_X + column * (CELL_SIZE + GAP);
      const cellY = WORLD_Y + row * (CELL_SIZE + GAP);
      const growth = getFarmPlotGrowth(plot, currentDay);
      const ready = growth?.stage.id === CROP_STAGE_IDS.READY;

      ctx.fillStyle = "#704425";
      ctx.fillRect(cellX, cellY, CELL_SIZE, CELL_SIZE);
      ctx.strokeStyle = ready ? "#ffe36c" : "#9a6338";
      ctx.lineWidth = ready ? 4 : 2;
      ctx.strokeRect(cellX + 1, cellY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      drawPlant(ctx, growth, cellX + CELL_SIZE / 2, cellY + CELL_SIZE / 2);
    });
  }

  return { setState, getState, getLayout, getInteractions, update, draw };
})();
