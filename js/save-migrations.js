import { CROP_IDS } from "./crop-catalog.js";
import { SOIL_STATES } from "./farm-plot.js";
import { ITEM_IDS } from "./item-catalog.js";
import { TOOL_IDS, toolCatalog } from "./tool-catalog.js";
import {
  CURRENT_SAVE_VERSION,
  DEFAULT_SCENE_ID,
  createDefaultSave,
  normalizeSaveV7,
} from "./save-schema.js";

export class UnsupportedSaveVersionError extends Error {
  constructor(version) {
    super(`Save version ${version} is newer than supported version ${CURRENT_SAVE_VERSION}.`);
    this.name = "UnsupportedSaveVersionError";
    this.version = version;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validCount(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function migrateV1ToV2(save) {
  return {
    ...save,
    version: 2,
  };
}

function migrateV2ToV3(save) {
  return {
    version: 3,
    global: {
      time: save.time,
      economy: save.economy,
    },
    currentScene: DEFAULT_SCENE_ID,
    scenes: {
      [DEFAULT_SCENE_ID]: {
        farm: save.farm,
        player: save.player,
      },
    },
  };
}

function migrateV3ToV4(save) {
  const globalState = isRecord(save.global) ? save.global : {};
  const oldEconomy = isRecord(globalState.economy) ? globalState.economy : {};

  return {
    ...save,
    version: 4,
    global: {
      ...globalState,
      economy: {
        coins: validCount(oldEconomy.coins, 50),
      },
      inventory: {
        items: {
          [ITEM_IDS.STARTER_SEED]: validCount(oldEconomy.seeds, 3),
          [ITEM_IDS.STARTER_CROP]: validCount(oldEconomy.crops, 0),
        },
      },
    },
  };
}

function migrateFarmPlotsV4ToV5(value) {
  if (!Array.isArray(value)) return value;
  return value.map((plot) => {
    if (!Number.isSafeInteger(plot?.plantedDay) || plot.plantedDay < 1) {
      return { cropId: null, plantedDay: null };
    }
    return {
      cropId: typeof plot?.cropId === "string" && plot.cropId.trim()
        ? plot.cropId
        : CROP_IDS.STARTER,
      plantedDay: plot.plantedDay,
    };
  });
}

function migrateV4ToV5(save) {
  const scenes = isRecord(save.scenes) ? save.scenes : {};
  const farmScene = isRecord(scenes[DEFAULT_SCENE_ID])
    ? scenes[DEFAULT_SCENE_ID]
    : {};

  return {
    ...save,
    version: 5,
    scenes: {
      ...scenes,
      [DEFAULT_SCENE_ID]: {
        ...farmScene,
        farm: migrateFarmPlotsV4ToV5(farmScene.farm),
      },
    },
  };
}

function migrateV5ToV6(save) {
  const globalState = isRecord(save.global) ? save.global : {};
  return {
    ...save,
    version: 6,
    global: {
      ...globalState,
      tools: {
        selectedToolId: TOOL_IDS.HAND,
        unlockedToolIds: [
          TOOL_IDS.HAND,
          TOOL_IDS.HOE,
          TOOL_IDS.WATERING_CAN,
          TOOL_IDS.AXE,
        ],
      },
    },
  };
}

function migrateFarmPlotsV6ToV7(value) {
  if (!Array.isArray(value)) return value;
  return value.map((plot) => ({
    soilState: SOIL_STATES.TILLED,
    cropId: typeof plot?.cropId === "string" ? plot.cropId : null,
    plantedDay: Number.isSafeInteger(plot?.plantedDay) && plot.plantedDay >= 1
      ? plot.plantedDay
      : null,
    wateredDay: null,
  }));
}

function migrateV6ToV7(save) {
  const globalState = isRecord(save.global) ? save.global : {};
  const tools = isRecord(globalState.tools) ? globalState.tools : {};
  const scenes = isRecord(save.scenes) ? save.scenes : {};
  const farmScene = isRecord(scenes[DEFAULT_SCENE_ID])
    ? scenes[DEFAULT_SCENE_ID]
    : {};
  const wateringCan = toolCatalog.get(TOOL_IDS.WATERING_CAN);

  return {
    ...save,
    version: 7,
    global: {
      ...globalState,
      tools: {
        ...tools,
        resources: {
          ...(isRecord(tools.resources) ? tools.resources : {}),
          [TOOL_IDS.WATERING_CAN]: {
            amount: wateringCan?.resource?.capacity ?? 5,
          },
        },
      },
    },
    scenes: {
      ...scenes,
      [DEFAULT_SCENE_ID]: {
        ...farmScene,
        farm: migrateFarmPlotsV6ToV7(farmScene.farm),
      },
    },
  };
}

const MIGRATIONS = new Map([
  [1, migrateV1ToV2],
  [2, migrateV2ToV3],
  [3, migrateV3ToV4],
  [4, migrateV4ToV5],
  [5, migrateV5ToV6],
  [6, migrateV6ToV7],
]);

export function migrateSave(rawSave) {
  if (!isRecord(rawSave)) {
    return { save: createDefaultSave(), sourceVersion: null };
  }

  const sourceVersion = Number.isInteger(rawSave.version) && rawSave.version >= 1
    ? rawSave.version
    : 1;
  if (sourceVersion > CURRENT_SAVE_VERSION) {
    throw new UnsupportedSaveVersionError(sourceVersion);
  }

  let migrated = { ...rawSave, version: sourceVersion };
  while (migrated.version < CURRENT_SAVE_VERSION) {
    const migration = MIGRATIONS.get(migrated.version);
    if (!migration) throw new Error(`Missing migration for save version ${migrated.version}.`);
    migrated = migration(migrated);
  }

  return {
    save: normalizeSaveV7(migrated),
    sourceVersion,
  };
}
