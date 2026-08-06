export const TOOL_IDS = Object.freeze({
  HAND: "hand",
  HOE: "hoe",
  WATERING_CAN: "watering-can",
  AXE: "axe",
});

function freezeTool(tool) {
  return Object.freeze({ ...tool });
}

const TOOLS = Object.freeze({
  [TOOL_IDS.HAND]: freezeTool({
    id: TOOL_IDS.HAND,
    name: "มือเปล่า",
    icon: "✋",
    order: 0,
  }),
  [TOOL_IDS.HOE]: freezeTool({
    id: TOOL_IDS.HOE,
    name: "จอบ",
    icon: "⛏️",
    order: 1,
  }),
  [TOOL_IDS.WATERING_CAN]: freezeTool({
    id: TOOL_IDS.WATERING_CAN,
    name: "บัวรดน้ำ",
    icon: "🚿",
    order: 2,
  }),
  [TOOL_IDS.AXE]: freezeTool({
    id: TOOL_IDS.AXE,
    name: "ขวาน",
    icon: "🪓",
    order: 3,
  }),
});

function hasTool(toolId) {
  return typeof toolId === "string" && Object.hasOwn(TOOLS, toolId);
}

export const toolCatalog = Object.freeze({
  has: hasTool,

  get(toolId) {
    return hasTool(toolId) ? TOOLS[toolId] : null;
  },

  list() {
    return Object.values(TOOLS).sort((a, b) => a.order - b.order);
  },
});
