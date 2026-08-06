export const CURRENT_SAVE_VERSION = 8;
export const DEFAULT_SCENE_ID = "farm-exterior";

const DEFAULT_TIME = Object.freeze({ day: 1, minutes: 6 * 60 });

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value, fallback = null) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeTime(value) {
  if (
    Number.isInteger(value?.day) &&
    value.day >= 1 &&
    Number.isInteger(value?.minutes) &&
    value.minutes >= 6 * 60 &&
    value.minutes < 26 * 60
  ) {
    return { day: value.day, minutes: value.minutes };
  }
  return { ...DEFAULT_TIME };
}

function normalizeScenes(value) {
  const scenes = {};
  if (isRecord(value)) {
    Object.entries(value).forEach(([sceneId, sceneState]) => {
      if (!sceneId.trim() || !isRecord(sceneState)) return;
      scenes[sceneId] = cloneJson(sceneState, {});
    });
  }

  if (!isRecord(scenes[DEFAULT_SCENE_ID])) {
    scenes[DEFAULT_SCENE_ID] = { farm: null, player: null };
  }
  return scenes;
}

export function createDefaultSave() {
  return {
    version: CURRENT_SAVE_VERSION,
    global: {
      time: { ...DEFAULT_TIME },
      economy: null,
      inventory: null,
      tools: null,
    },
    currentScene: DEFAULT_SCENE_ID,
    scenes: {
      [DEFAULT_SCENE_ID]: {
        farm: null,
        player: null,
      },
    },
  };
}

export function normalizeSaveV8(value) {
  const fallback = createDefaultSave();
  const globalState = isRecord(value?.global) ? value.global : {};
  const currentScene = typeof value?.currentScene === "string" && value.currentScene.trim()
    ? value.currentScene.trim()
    : DEFAULT_SCENE_ID;
  const scenes = normalizeScenes(value?.scenes);

  if (!isRecord(scenes[currentScene])) scenes[currentScene] = {};

  return {
    version: CURRENT_SAVE_VERSION,
    global: {
      time: normalizeTime(globalState.time),
      economy: cloneJson(globalState.economy, fallback.global.economy),
      inventory: cloneJson(globalState.inventory, fallback.global.inventory),
      tools: cloneJson(globalState.tools, fallback.global.tools),
    },
    currentScene,
    scenes,
  };
}

export function createSaveSnapshot({ time, economy, inventory, tools, currentScene, scenes }) {
  return normalizeSaveV8({
    version: CURRENT_SAVE_VERSION,
    global: { time, economy, inventory, tools },
    currentScene,
    scenes,
  });
}
