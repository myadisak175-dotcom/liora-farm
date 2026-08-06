import { ITEM_IDS } from "./item-catalog.js";
import {
  CURRENT_SAVE_VERSION,
  DEFAULT_SCENE_ID,
  createDefaultSave,
  normalizeSaveV4,
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

const MIGRATIONS = new Map([
  [1, migrateV1ToV2],
  [2, migrateV2ToV3],
  [3, migrateV3ToV4],
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
    save: normalizeSaveV4(migrated),
    sourceVersion,
  };
}
