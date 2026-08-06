import { cropCatalog } from "./crop-catalog.js";

function validDay(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function clampProgress(cropId, value) {
  const crop = cropCatalog.get(cropId);
  if (!crop) return 0;
  const progress = Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return Math.min(crop.growthDays, progress);
}

export function createCropGrowthState(cropId, plantedDay) {
  if (!cropCatalog.has(cropId) || !validDay(plantedDay)) return null;
  return {
    growthProgress: 0,
    lastGrowthProcessedDay: plantedDay,
  };
}

export function normalizeCropGrowthState(cropId, plantedDay, value = null) {
  if (!cropCatalog.has(cropId) || !validDay(plantedDay)) {
    return {
      growthProgress: 0,
      lastGrowthProcessedDay: null,
    };
  }

  const lastGrowthProcessedDay = validDay(value?.lastGrowthProcessedDay) &&
    value.lastGrowthProcessedDay >= plantedDay
    ? value.lastGrowthProcessedDay
    : plantedDay;

  return {
    growthProgress: clampProgress(cropId, value?.growthProgress),
    lastGrowthProcessedDay,
  };
}

export function getCropGrowth(cropId, growthProgress) {
  return cropCatalog.getGrowthByProgress(cropId, clampProgress(cropId, growthProgress));
}

export function processDailyCropGrowth(state, currentDay) {
  const cropId = state?.cropId;
  const plantedDay = state?.plantedDay;
  const normalized = normalizeCropGrowthState(cropId, plantedDay, state);

  if (!cropCatalog.has(cropId) || !validDay(plantedDay) || !validDay(currentDay)) {
    return {
      ...normalized,
      processed: false,
      advanced: false,
    };
  }

  if (currentDay <= normalized.lastGrowthProcessedDay) {
    return {
      ...normalized,
      processed: false,
      advanced: false,
    };
  }

  const crop = cropCatalog.get(cropId);
  const wateredDay = validDay(state?.wateredDay) ? state.wateredDay : null;
  const hasUnprocessedWatering = wateredDay !== null &&
    wateredDay >= normalized.lastGrowthProcessedDay &&
    wateredDay < currentDay;
  const nextProgress = hasUnprocessedWatering
    ? Math.min(crop.growthDays, normalized.growthProgress + 1)
    : normalized.growthProgress;

  return {
    growthProgress: nextProgress,
    lastGrowthProcessedDay: currentDay,
    processed: true,
    advanced: nextProgress > normalized.growthProgress,
  };
}
