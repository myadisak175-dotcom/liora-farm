import { CROP_IDS, cropCatalog } from "./crop-catalog.js";
import {
  createCropGrowthState,
  getCropGrowth,
  normalizeCropGrowthState,
  processDailyCropGrowth,
} from "./crop-growth.js";

export const SOIL_STATES = Object.freeze({
  UNTILLED: "untilled",
  TILLED: "tilled",
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDay(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function validSoilState(value) {
  return value === SOIL_STATES.UNTILLED || value === SOIL_STATES.TILLED;
}

export function createEmptyFarmPlot() {
  return {
    soilState: SOIL_STATES.UNTILLED,
    cropId: null,
    plantedDay: null,
    wateredDay: null,
    growthProgress: 0,
    lastGrowthProcessedDay: null,
  };
}

export function createEmptyFarmPlots(count) {
  const safeCount = Number.isSafeInteger(count) && count > 0 ? count : 0;
  return Array.from({ length: safeCount }, createEmptyFarmPlot);
}

export function createPlantedFarmPlot(cropId, plantedDay, source = null) {
  if (!cropCatalog.has(cropId) || !validDay(plantedDay)) return null;
  const normalizedSource = normalizeFarmPlot(source);
  const growthState = createCropGrowthState(cropId, plantedDay);
  return {
    soilState: SOIL_STATES.TILLED,
    cropId,
    plantedDay,
    wateredDay: normalizedSource.wateredDay,
    ...growthState,
  };
}

export function normalizeFarmPlot(value) {
  if (!isRecord(value)) return createEmptyFarmPlot();

  const hasPlantedDay = validDay(value.plantedDay);
  const cropId = cropCatalog.has(value.cropId)
    ? value.cropId
    : hasPlantedDay ? CROP_IDS.STARTER : null;
  const hasCrop = cropCatalog.has(cropId) && hasPlantedDay;
  const soilState = validSoilState(value.soilState)
    ? value.soilState
    : hasCrop ? SOIL_STATES.TILLED : SOIL_STATES.UNTILLED;
  const growthState = normalizeCropGrowthState(
    hasCrop ? cropId : null,
    hasCrop ? value.plantedDay : null,
    value,
  );

  return {
    soilState: hasCrop ? SOIL_STATES.TILLED : soilState,
    cropId: hasCrop ? cropId : null,
    plantedDay: hasCrop ? value.plantedDay : null,
    wateredDay: soilState === SOIL_STATES.TILLED && validDay(value.wateredDay)
      ? value.wateredDay
      : null,
    ...growthState,
  };
}

export function normalizeFarmPlots(value, count) {
  if (!Array.isArray(value) || value.length !== count) {
    return createEmptyFarmPlots(count);
  }
  return value.map(normalizeFarmPlot);
}

export function serializeFarmPlots(plots, count) {
  return normalizeFarmPlots(plots, count).map(({
    soilState,
    cropId,
    plantedDay,
    wateredDay,
    growthProgress,
    lastGrowthProcessedDay,
  }) => ({
    soilState,
    cropId,
    plantedDay,
    wateredDay,
    growthProgress,
    lastGrowthProcessedDay,
  }));
}

export function isFarmPlotEmpty(plot) {
  return !cropCatalog.has(plot?.cropId) || !validDay(plot?.plantedDay);
}

export function isFarmPlotTilled(plot) {
  return plot?.soilState === SOIL_STATES.TILLED;
}

export function isFarmPlotWatered(plot, currentDay) {
  return validDay(currentDay) && plot?.wateredDay === currentDay;
}

export function prepareFarmPlot(plot) {
  const normalized = normalizeFarmPlot(plot);
  if (!isFarmPlotEmpty(normalized) || isFarmPlotTilled(normalized)) return null;
  return { ...normalized, soilState: SOIL_STATES.TILLED };
}

export function waterFarmPlot(plot, currentDay) {
  const normalized = normalizeFarmPlot(plot);
  if (!validDay(currentDay) || !isFarmPlotTilled(normalized) || isFarmPlotWatered(normalized, currentDay)) {
    return null;
  }
  return { ...normalized, wateredDay: currentDay };
}

export function clearFarmPlotCrop(plot) {
  const normalized = normalizeFarmPlot(plot);
  return {
    ...normalized,
    cropId: null,
    plantedDay: null,
    growthProgress: 0,
    lastGrowthProcessedDay: null,
  };
}

export function advanceFarmPlotGrowth(plot, currentDay) {
  const normalized = normalizeFarmPlot(plot);
  if (isFarmPlotEmpty(normalized)) {
    return { plot: normalized, processed: false, advanced: false };
  }

  const result = processDailyCropGrowth(normalized, currentDay);
  return {
    plot: {
      ...normalized,
      growthProgress: result.growthProgress,
      lastGrowthProcessedDay: result.lastGrowthProcessedDay,
    },
    processed: result.processed,
    advanced: result.advanced,
  };
}

export function getFarmPlotGrowth(plot) {
  const normalized = normalizeFarmPlot(plot);
  if (isFarmPlotEmpty(normalized)) return null;
  return getCropGrowth(normalized.cropId, normalized.growthProgress);
}
