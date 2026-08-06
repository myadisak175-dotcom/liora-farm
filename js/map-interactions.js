import { interactions } from "./interactions.js";
import { TOOL_IDS } from "./tool-catalog.js";
import { toolSystem } from "./tool-system.js";

export const mapInteractions = (() => {
  function getEntries({ requestSceneChange } = {}) {
    const requestTransition = typeof requestSceneChange === "function"
      ? requestSceneChange
      : () => false;

    return [
      {
        id: "farmhouse-door",
        x: 350,
        y: 418,
        radius: 84,
        priority: 4,
        highlightRadius: 27,
        actions: [
          {
            id: "enter-house",
            label: "เข้าบ้าน",
            execute: () => requestTransition("house-interior", { spawnId: "entry" }),
          },
        ],
      },
      {
        id: "well-use",
        x: 1135,
        y: 598,
        radius: 84,
        priority: 4,
        highlightRadius: 25,
        getActions: () => {
          const water = toolSystem.getResource(TOOL_IDS.WATERING_CAN);
          const full = Boolean(water) && water.amount >= water.capacity;
          return [
            {
              id: "fill-watering-can",
              toolIds: [TOOL_IDS.WATERING_CAN],
              priority: 10,
              label: full ? "น้ำเต็มแล้ว" : "เติมบัวรดน้ำ",
              execute: () => {
                if (!toolSystem.refillResource(TOOL_IDS.WATERING_CAN)) {
                  interactions.notify("บัวรดน้ำเต็มอยู่แล้ว");
                  return false;
                }
                interactions.notify(`เติมน้ำเต็ม ${water?.capacity ?? 0} หน่วยแล้ว!`);
                return true;
              },
            },
            {
              id: "inspect-well",
              label: "ตักน้ำ",
              execute: () => {
                interactions.notify("เลือกบัวรดน้ำเพื่อเติมน้ำ");
                return false;
              },
            },
          ];
        },
      },
    ];
  }

  return { getEntries };
})();
