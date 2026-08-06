import { interactions } from "./interactions.js";
import { TOOL_IDS } from "./tool-catalog.js";

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
        actions: [
          {
            id: "fill-watering-can",
            toolIds: [TOOL_IDS.WATERING_CAN],
            priority: 10,
            label: "เติมบัวรดน้ำ",
            execute: () => {
              interactions.notify("บัวรดน้ำพร้อมใช้งาน ระบบความจุน้ำจะมาในขั้นถัดไป");
              return false;
            },
          },
          {
            id: "inspect-well",
            label: "ตักน้ำ",
            execute: () => {
              interactions.notify("เลือกบัวรดน้ำเพื่อเตรียมเติมน้ำ");
              return false;
            },
          },
        ],
      },
    ];
  }

  return { getEntries };
})();
