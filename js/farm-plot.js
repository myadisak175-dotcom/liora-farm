import { CROP_IDS, cropCatalog } from "./crop-catalog.js";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDay(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

export function createEmptyFarmPlot() {
  return { cropId: null, plantedDay: null };
}

export function createEmptyFarmPlots(count) {
  const safeCount = Number.isSafeInteger(count) && count > 0 ? count : 0;
  return Array.from({ length: safeCount }, createEmptyFarmPlot);
}

export function createPlantedFarmPlot(cropId, plantedDay) {
  if (!cropCatalog.has(cropId) || !validDay(plantedDay)) return null;
  return { cropId, plantedDay };
}

export function normalizeFarmPlot(value) {
  if (!isRecord(value) || !validDay(value.plantedDay)) {
    return createEmptyFarmPlot();
  }

  const cropId = cropCatalog.has(value.cropId)
    ? value.cropId
    : CROP_IDS.STARTER;
  return { cropId, plantedDay: value.plantedDay };
}

export function normalizeFarmPlots(value, count) {
  if (!Array.isArray(value) || value.length !== count) {
    return createEmptyFarmPlots(count);
  }
  return value.map(normalizeFarmPlot);
}

export function serializeFarmPlots(plots, count) {
  return normalizeFarmPlots(plots, count).map(({ cropId, plantedDay }) => ({
    cropId,
    plantedDay,
  }));
}

export function isFarmPlotEmpty(plot) {
  return !cropCatalog.has(plot?.cropId) || !validDay(plot?.plantedDay);
}

export function getFarmPlotGrowth(plot, currentDay) {
  if (isFarmPlotEmpty(plot)) return null;
  return cropCatalog.getGrowth(plot.cropId, plot.plantedDay, currentDay);
}
