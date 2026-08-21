import { createLocalStore } from "../systems/local-store.js";
import {
  DEFAULT_MAP_ID,
  readMapIdFromLocation,
  scopeStorageKey,
} from "../systems/map-scope.js";

const LOGIC_STORAGE_KEY = "liora.world-logic.v1";
const LOGIC_VERSION = 1;
const DEFAULT_SPAWN = Object.freeze({ x: 0, z: 5 });

const mapId = readMapIdFromLocation() ?? DEFAULT_MAP_ID;
const store = createLocalStore({
  key: scopeStorageKey(LOGIC_STORAGE_KEY, mapId, DEFAULT_MAP_ID),
  version: LOGIC_VERSION,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeLogic(value) {
  if (!value || typeof value !== "object") return null;
  const source = value.spawn;
  if (!source || typeof source !== "object") return null;
  const x = Number(source.x);
  const z = Number(source.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return {
    version: LOGIC_VERSION,
    spawn: { x, z },
  };
}

function cloneLogic(value) {
  const source = sanitizeLogic(value) ?? {
    version: LOGIC_VERSION,
    spawn: DEFAULT_SPAWN,
  };
  return {
    version: LOGIC_VERSION,
    spawn: { x: source.spawn.x, z: source.spawn.z },
  };
}

const stored = sanitizeLogic(store.load());
let authored = null;
let touched = Boolean(stored);
let logic = cloneLogic(stored);
let rerender = () => {};

function save() {
  touched = true;
  store.save(cloneLogic(logic));
  rerender();
}

function setSpawn(position) {
  const x = Number(position?.x);
  const z = Number(position?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  logic.spawn = { x, z };
  save();
  return true;
}

function resetToAuthored() {
  store.clear();
  touched = false;
  logic = cloneLogic(authored);
  rerender();
}

function importData(next) {
  authored = sanitizeLogic(next);
  if (touched) return false;
  logic = cloneLogic(authored);
  rerender();
  return true;
}

function exportData() {
  return cloneLogic(logic);
}

window.__lioraWorldLogic = {
  importData,
  exportData,
  setSpawn,
  resetToAuthored,
  get mapId() { return mapId; },
  get spawn() { return { ...logic.spawn }; },
  get storeIssue() { return store.lastIssue; },
};

function setupWorldBuilderUI() {
  const root = document.querySelector("#build-panel");
  const buildTabs = document.querySelector("#build-tabs");
  const buildBody = document.querySelector("#build-body");
  const tabPlace = document.querySelector("#tab-place");
  const tabPaint = document.querySelector("#tab-paint");
  const tabSculpt = document.querySelector("#tab-sculpt");
  const tabHorizon = document.querySelector("#tab-horizon");
  if (!root || !buildTabs || !buildBody || !tabPlace || !tabPaint || !tabSculpt || !tabHorizon) {
    return;
  }
  if (root.classList.contains("wb-shell-ready")) return;

  const style = document.createElement("style");
  style.textContent = `
    #build-panel.wb-shell-ready { --wb-gap: 6px; }
    #build-panel.wb-shell-ready > #wb-primary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--wb-gap);
      padding: 8px 8px 4px;
    }
    #build-panel.wb-shell-ready > #wb-primary button,
    #build-panel.wb-shell-ready > #wb-subnav button,
    #wb-overlay button {
      min-height: 42px;
      border: 0;
      border-radius: 12px;
      font: inherit;
      touch-action: manipulation;
    }
    #build-panel.wb-shell-ready > #wb-primary button.active,
    #build-panel.wb-shell-ready > #wb-subnav button.active {
      box-shadow: inset 0 0 0 2px currentColor;
      font-weight: 700;
    }
    #build-panel.wb-shell-ready > #wb-subnav {
      display: flex;
      gap: var(--wb-gap);
      padding: 0 8px 4px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    #build-panel.wb-shell-ready > #wb-subnav[hidden] { display: none; }
    #build-panel.wb-shell-ready > #wb-subnav button { min-width: 92px; padding: 0 12px; }
    #build-panel.wb-shell-ready #tab-place,
    #build-panel.wb-shell-ready #tab-paint,
    #build-panel.wb-shell-ready #tab-sculpt,
    #build-panel.wb-shell-ready #tab-horizon { display: none !important; }
    #build-panel.wb-shell-ready #build-tabs { justify-content: flex-end; }
    #wb-overlay { display: none; padding: 4px 8px 8px; }
    #build-panel[data-wb-mode="logic"] #build-body > :not(#wb-overlay),
    #build-panel[data-wb-mode="manage"] #build-body > :not(#wb-overlay) { display: none !important; }
    #build-panel[data-wb-mode="logic"] #wb-overlay,
    #build-panel[data-wb-mode="manage"] #wb-overlay { display: block; }
    #build-panel[data-wb-mode="logic"] #build-actions,
    #build-panel[data-wb-mode="manage"] #build-actions { display: none !important; }
    #wb-overlay .wb-card {
      display: grid;
      gap: 8px;
      padding: 10px;
      border-radius: 14px;
      background: color-mix(in srgb, Canvas 90%, transparent);
    }
    #wb-overlay .wb-title { font-weight: 800; }
    #wb-overlay .wb-note { font-size: 12px; opacity: .8; line-height: 1.45; }
    #wb-overlay .wb-row { display: flex; gap: 8px; flex-wrap: wrap; }
    #wb-overlay .wb-row button { flex: 1 1 130px; padding: 8px 10px; }
    #wb-overlay .primary { font-weight: 800; }
    #wb-overlay .danger { opacity: .9; }
    #wb-overlay .wb-coord { font-variant-numeric: tabular-nums; font-weight: 700; }
  `;
  document.head.append(style);

  const primary = document.createElement("div");
  primary.id = "wb-primary";
  const primaryModes = [
    ["objects", "🌳 ของ"],
    ["terrain", "🌿 พื้น"],
    ["logic", "⚙ Logic"],
    ["manage", "💾 จัดการ"],
  ];
  const primaryButtons = new Map();
  for (const [id, label] of primaryModes) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.wbMode = id;
    button.textContent = label;
    primary.append(button);
    primaryButtons.set(id, button);
  }

  const subnav = document.createElement("div");
  subnav.id = "wb-subnav";
  const terrainTools = [
    ["paint", "🎨 ระบาย"],
    ["sculpt", "⛰️ ปั้น"],
    ["horizon", "🌄 ขอบฟ้า"],
  ];
  const subButtons = new Map();
  for (const [id, label] of terrainTools) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.wbTerrain = id;
    button.textContent = label;
    subnav.append(button);
    subButtons.set(id, button);
  }

  const overlay = document.createElement("div");
  overlay.id = "wb-overlay";
  buildBody.prepend(overlay);
  root.insertBefore(primary, buildTabs);
  root.insertBefore(subnav, buildTabs);
  root.classList.add("wb-shell-ready");

  let mode = "objects";
  let terrainTool = "paint";
  let notice = "";

  function clickHiddenTab(button) {
    button?.click();
  }

  function playerPosition() {
    const position = window.__lioraAudioRuntime?.state?.position;
    if (!position) return null;
    const x = Number(position.x);
    const z = Number(position.z);
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
  }

  function setNotice(message) {
    notice = String(message ?? "");
    renderOverlay();
  }

  function makeButton(label, handler, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (className) button.className = className;
    button.onclick = handler;
    return button;
  }

  function builderAction(label) {
    clickHiddenTab(tabPlace);
    queueMicrotask(() => {
      const button = [...document.querySelectorAll("#build-actions button")]
        .find((candidate) => candidate.textContent?.trim() === label);
      if (!button) {
        setNotice(`ยังใช้คำสั่ง “${label}” ไม่ได้`);
        return;
      }
      button.click();
    });
  }

  function renderLogic() {
    const card = document.createElement("div");
    card.className = "wb-card";
    const title = document.createElement("div");
    title.className = "wb-title";
    title.textContent = "Logic · จุดเกิดผู้เล่น";
    const coord = document.createElement("div");
    coord.className = "wb-coord";
    coord.textContent = `Spawn  X ${finite(logic.spawn.x).toFixed(1)} · Z ${finite(logic.spawn.z).toFixed(1)}`;
    const note = document.createElement("div");
    note.className = "wb-note";
    note.textContent = notice || "ไปโหมดเล่น เดิน Liora ไปยืนตรงที่ต้องการ แล้วกลับมาที่ Logic เพื่อบันทึกจุดเกิด โลกที่ export จะจำตำแหน่งนี้ไปด้วย";
    const row = document.createElement("div");
    row.className = "wb-row";
    row.append(
      makeButton("▶ ไปยืนเลือกจุด", () => {
        document.querySelector('#mode-bar [data-mode="play"]')?.click();
      }),
      makeButton("📍 ใช้ตำแหน่ง Liora ตอนนี้", () => {
        const position = playerPosition();
        if (!position) {
          setNotice("ยังอ่านตำแหน่ง Liora ไม่ได้ — เข้าโหมดเล่นก่อนหนึ่งครั้ง");
          return;
        }
        setSpawn(position);
        notice = `ตั้งจุดเกิดแล้ว X ${position.x.toFixed(1)} · Z ${position.z.toFixed(1)}`;
        renderOverlay();
      }, "primary"),
      makeButton("↺ คืนค่าของแผนที่", () => {
        resetToAuthored();
        notice = "คืนค่าจุดเกิดตามไฟล์แผนที่แล้ว";
        renderOverlay();
      }, "danger")
    );
    card.append(title, coord, note, row);
    overlay.replaceChildren(card);
  }

  function renderManage() {
    const card = document.createElement("div");
    card.className = "wb-card";
    const title = document.createElement("div");
    title.className = "wb-title";
    title.textContent = "Manage · โลกนี้";
    const note = document.createElement("div");
    note.className = "wb-note";
    note.textContent = notice || "บันทึกโลกจะรวม Objects + พื้นที่ระบาย + Terrain + ขอบฟ้า + Logic ลงในไฟล์แผนที่เดียว";
    const row = document.createElement("div");
    row.className = "wb-row";
    row.append(
      makeButton("💾 บันทึกโลก .json", () => builderAction("บันทึก"), "primary"),
      makeButton("↺ รีเซ็ตสิ่งของ", () => builderAction("รีเซ็ต"), "danger"),
      makeButton("🔄 โหลดโลกใหม่", () => location.reload())
    );
    card.append(title, note, row);
    overlay.replaceChildren(card);
  }

  function renderOverlay() {
    if (mode === "logic") renderLogic();
    else if (mode === "manage") renderManage();
    else overlay.replaceChildren();
  }

  function renderNav() {
    root.dataset.wbMode = mode;
    for (const [id, button] of primaryButtons) button.classList.toggle("active", id === mode);
    subnav.hidden = mode !== "terrain";
    for (const [id, button] of subButtons) button.classList.toggle("active", id === terrainTool);
    renderOverlay();
  }

  function activateTerrainTool(next) {
    terrainTool = next;
    if (next === "paint") clickHiddenTab(tabPaint);
    if (next === "sculpt") clickHiddenTab(tabSculpt);
    if (next === "horizon") clickHiddenTab(tabHorizon);
    renderNav();
  }

  function activate(next) {
    mode = next;
    notice = "";
    if (next === "objects") clickHiddenTab(tabPlace);
    if (next === "terrain") activateTerrainTool(terrainTool);
    if (next === "logic" || next === "manage") clickHiddenTab(tabPlace);
    renderNav();
  }

  for (const [id, button] of primaryButtons) button.onclick = () => activate(id);
  for (const [id, button] of subButtons) button.onclick = () => activateTerrainTool(id);

  rerender = () => renderOverlay();
  activate("objects");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupWorldBuilderUI, { once: true });
} else {
  setupWorldBuilderUI();
}
