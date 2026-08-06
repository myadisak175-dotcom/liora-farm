import { ITEM_IDS, itemCatalog } from "./item-catalog.js";

export const CROP_IDS = Object.freeze({
  STARTER: "starter-plant",
});

export const CROP_STAGE_IDS = Object.freeze({
  SEED: "seed",
  GROWING: "growing",
  READY: "ready",
});

function freezeCrop(definition) {
  const stages = Object.freeze(
    definition.stages.map((stage) => Object.freeze({ ...stage })),
  );
  return Object.freeze({ ...definition, stages });
}

const CROPS = Object.freeze({
  [CROP_IDS.STARTER]: freezeCrop({
    id: CROP_IDS.STARTER,
    name: "พืชเริ่มต้น",
    seedItemId: ITEM_IDS.STARTER_SEED,
    harvestItemId: ITEM_IDS.STARTER_CROP,
    harvestQuantity: 1,
    growthDays: 3,
    stages: [
      { id: CROP_STAGE_IDS.SEED, minDays: 0 },
      { id: CROP_STAGE_IDS.GROWING, minDays: 1 },
      { id: CROP_STAGE_IDS.READY, minDays: 3 },
    ],
  }),
});

function hasCrop(cropId) {
  return typeof cropId === "string" && Object.hasOwn(CROPS, cropId);
}

function validateCrop(crop) {
  if (!itemCatalog.has(crop.seedItemId) || !itemCatalog.has(crop.harvestItemId)) {
    throw new Error(`Crop ${crop.id} references an unknown item.`);
  }
  if (!Number.isSafeInteger(crop.growthDays) || crop.growthDays < 1) {
    throw new Error(`Crop ${crop.id} must have a positive growthDays value.`);
  }
  if (!Number.isSafeInteger(crop.harvestQuantity) || crop.harvestQuantity < 1) {
    throw new Error(`Crop ${crop.id} must have a positive harvestQuantity value.`);
  }
  if (!Array.isArray(crop.stages) || crop.stages.length < 2) {
    throw new Error(`Crop ${crop.id} must define growth stages.`);
  }

  let previousMinDays = -1;
  crop.stages.forEach((stage) => {
    if (typeof stage.id !== "string" || !Number.isSafeInteger(stage.minDays)) {
      throw new Error(`Crop ${crop.id} contains an invalid stage.`);
    }
    if (stage.minDays <= previousMinDays) {
      throw new Error(`Crop ${crop.id} stages must be ordered by minDays.`);
    }
    previousMinDays = stage.minDays;
  });

  const firstStage = crop.stages[0];
  const lastStage = crop.stages[crop.stages.length - 1];
  if (firstStage.minDays !== 0 || lastStage.id !== CROP_STAGE_IDS.READY || lastStage.minDays !== crop.growthDays) {
    throw new Error(`Crop ${crop.id} stages must start at day 0 and end ready on growthDays.`);
  }
}

Object.values(CROPS).forEach(validateCrop);

function getGrowth(cropId, plantedDay, currentDay) {
  const crop = hasCrop(cropId) ? CROPS[cropId] : null;
  if (
    !crop ||
    !Number.isSafeInteger(plantedDay) || plantedDay < 1 ||
    !Number.isSafeInteger(currentDay) || currentDay < 1
  ) {
    return null;
  }

  const daysPassed = Math.max(0, currentDay - plantedDay);
  let stage = crop.stages[0];
  crop.stages.forEach((candidate) => {
    if (candidate.minDays <= daysPassed) stage = candidate;
  });

  return {
    crop,
    stage,
    daysPassed,
    daysRemaining: Math.max(0, crop.growthDays - daysPassed),
    ready: daysPassed >= crop.growthDays,
  };
}

export const cropCatalog = Object.freeze({
  has: hasCrop,

  get(cropId) {
    return hasCrop(cropId) ? CROPS[cropId] : null;
  },

  list() {
    return Object.values(CROPS);
  },

  getGrowth,
});
