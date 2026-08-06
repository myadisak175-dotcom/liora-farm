import { inventory } from "./inventory.js";
import { ITEM_IDS } from "./item-catalog.js";

export const JOURNEY_TOOL_IDS = Object.freeze([
  ITEM_IDS.HEALING_BALM,
  ITEM_IDS.ANIMAL_TREAT,
  ITEM_IDS.REPAIR_KIT,
  ITEM_IDS.GLOW_LANTERN,
]);

const MAX_LOADOUT = 2;

function createDefaultState() {
  return {
    loadout: [],
    mistCleared: false,
    bridgeRepaired: false,
    rabbitRescued: false,
    questCompleted: false,
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLoadout(value) {
  if (!Array.isArray(value)) return [];
  const unique = [];
  value.forEach((itemId) => {
    if (
      JOURNEY_TOOL_IDS.includes(itemId) &&
      inventory.has(itemId) &&
      !unique.includes(itemId) &&
      unique.length < MAX_LOADOUT
    ) {
      unique.push(itemId);
    }
  });
  return unique;
}

export const journeyProgress = (() => {
  let state = createDefaultState();

  function setState(value) {
    if (!isRecord(value)) {
      state = createDefaultState();
      return;
    }
    state = {
      loadout: normalizeLoadout(value.loadout),
      mistCleared: Boolean(value.mistCleared),
      bridgeRepaired: Boolean(value.bridgeRepaired),
      rabbitRescued: Boolean(value.rabbitRescued),
      questCompleted: Boolean(value.questCompleted || value.rabbitRescued),
    };
  }

  function getState() {
    return {
      loadout: [...state.loadout],
      mistCleared: state.mistCleared,
      bridgeRepaired: state.bridgeRepaired,
      rabbitRescued: state.rabbitRescued,
      questCompleted: state.questCompleted,
    };
  }

  function getLoadout() {
    return [...state.loadout];
  }

  function hasPrepared(itemId) {
    return state.loadout.includes(itemId);
  }

  function toggleLoadout(itemId) {
    if (!JOURNEY_TOOL_IDS.includes(itemId) || !inventory.has(itemId)) {
      return { changed: false, reason: "ยังไม่ได้คราฟอุปกรณ์ชิ้นนี้" };
    }
    const index = state.loadout.indexOf(itemId);
    if (index >= 0) {
      state.loadout.splice(index, 1);
      return { changed: true, selected: false };
    }
    if (state.loadout.length >= MAX_LOADOUT) {
      return { changed: false, reason: `กระเป๋าเตรียมของใส่ได้ ${MAX_LOADOUT} ชิ้น` };
    }
    state.loadout.push(itemId);
    return { changed: true, selected: true };
  }

  function markMistCleared() {
    if (state.mistCleared) return false;
    state.mistCleared = true;
    return true;
  }

  function markBridgeRepaired() {
    if (state.bridgeRepaired) return false;
    state.bridgeRepaired = true;
    return true;
  }

  function markRabbitRescued() {
    if (state.rabbitRescued) return false;
    state.rabbitRescued = true;
    state.questCompleted = true;
    return true;
  }

  return {
    setState,
    getState,
    getLoadout,
    hasPrepared,
    toggleLoadout,
    markMistCleared,
    markBridgeRepaired,
    markRabbitRescued,
    isMistCleared: () => state.mistCleared,
    isBridgeRepaired: () => state.bridgeRepaired,
    isRabbitRescued: () => state.rabbitRescued,
    isQuestCompleted: () => state.questCompleted,
    getMaxLoadout: () => MAX_LOADOUT,
  };
})();
