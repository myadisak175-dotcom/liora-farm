import { WORLD_LOGIC, WORLD_LOGIC_KINDS } from "../systems/world-logic.js";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

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
    #build-panel[data-wb-mode="manage"] #wb-overlay { display: grid; gap: 8px; }
    #build-panel[data-wb-mode="logic"] #build-actions,
    #build-panel[data-wb-mode="manage"] #build-actions { display: none !important; }
    #wb-overlay .wb-card {
      display: grid;
      gap: 8px;
      padding: 10px;
      border-radius: 14px;
      background: rgba(255,255,255,.9);
    }
    #wb-overlay .wb-title { font-weight: 800; }
    #wb-overlay .wb-note { font-size: 12px; opacity: .8; line-height: 1.45; }
    #wb-overlay .wb-row { display: flex; gap: 8px; flex-wrap: wrap; }
    #wb-overlay .wb-row button { flex: 1 1 120px; padding: 8px 10px; }
    #wb-overlay .primary { font-weight: 800; }
    #wb-overlay .danger { opacity: .9; }
    #wb-overlay .wb-coord { font-variant-numeric: tabular-nums; font-weight: 700; }
    #wb-overlay .wb-list { display: grid; gap: 6px; max-height: 132px; overflow: auto; }
    #wb-overlay .wb-node {
      display: grid;
      grid-template-columns: minmax(0,1fr) auto;
      gap: 6px;
      align-items: center;
      padding: 7px 8px;
      border-radius: 10px;
      background: rgba(0,0,0,.055);
    }
    #wb-overlay .wb-node small { display: block; opacity: .7; margin-top: 2px; }
    #wb-overlay .wb-mini { display: flex; gap: 4px; }
    #wb-overlay .wb-mini button { min-width: 38px; min-height: 38px; padding: 4px 7px; }
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

  const clickHiddenTab = (button) => button?.click();

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

  function spawnCard() {
    const spawn = WORLD_LOGIC.spawn;
    const card = document.createElement("div");
    card.className = "wb-card";

    const title = document.createElement("div");
    title.className = "wb-title";
    title.textContent = "📍 Player Spawn";

    const coord = document.createElement("div");
    coord.className = "wb-coord";
    coord.textContent = `X ${finite(spawn.x).toFixed(1)} · Z ${finite(spawn.z).toFixed(1)}`;

    const note = document.createElement("div");
    note.className = "wb-note";
    note.textContent = "จุดเริ่มเกมของผู้เล่นเป็นข้อมูลของโลก ไม่ได้ฝังอยู่ในโมเดลหรือฉาก";

    const row = document.createElement("div");
    row.className = "wb-row";
    row.append(
      makeButton("▶ ไปยืนเลือกจุด", () => {
        document.querySelector('#mode-bar [data-mode="play"]')?.click();
      }),
      makeButton("📍 ตั้งตรง Liora", () => {
        const position = playerPosition();
        if (!position) {
          setNotice("ยังอ่านตำแหน่ง Liora ไม่ได้ — เข้าโหมดเล่นก่อนหนึ่งครั้ง");
          return;
        }
        WORLD_LOGIC.setSpawn(position);
        notice = `ตั้งจุดเกิดแล้ว X ${position.x.toFixed(1)} · Z ${position.z.toFixed(1)}`;
        renderOverlay();
      }, "primary")
    );
    card.append(title, coord, note, row);
    return card;
  }

  function zoneRow(node) {
    const row = document.createElement("div");
    row.className = "wb-node";
    const info = document.createElement("div");
    const name = document.createElement("b");
    name.textContent = node.label;
    const detail = document.createElement("small");
    detail.textContent = `X ${node.x.toFixed(1)} · Z ${node.z.toFixed(1)} · รัศมี ${node.radius.toFixed(1)} ม.`;
    info.append(name, detail);

    const tools = document.createElement("div");
    tools.className = "wb-mini";
    tools.append(
      makeButton("−", () => WORLD_LOGIC.updateNode(node.id, { radius: Math.max(0.5, node.radius - 0.5) })),
      makeButton("＋", () => WORLD_LOGIC.updateNode(node.id, { radius: Math.min(20, node.radius + 0.5) })),
      makeButton("✕", () => WORLD_LOGIC.removeNode(node.id), "danger")
    );
    row.append(info, tools);
    return row;
  }

  function zonesCard() {
    const zones = WORLD_LOGIC.listNodes(WORLD_LOGIC_KINDS.ZONE);
    const card = document.createElement("div");
    card.className = "wb-card";

    const title = document.createElement("div");
    title.className = "wb-title";
    title.textContent = `⭕ Gameplay Zones · ${zones.length}`;

    const note = document.createElement("div");
    note.className = "wb-note";
    note.textContent = "Zone เป็น primitive กลาง: รอบต่อไป node เดียวกันสามารถกำหนดเป็นเขตฟาร์ม, Trigger, เขต NPC, ประตู หรือ Quest ได้";

    const add = makeButton("＋ เพิ่ม Zone ตรง Liora", () => {
      const position = playerPosition();
      if (!position) {
        setNotice("เข้าโหมดเล่นและพา Liora ไปยืนตรงกลางพื้นที่ก่อน");
        return;
      }
      const index = zones.length + 1;
      WORLD_LOGIC.addNode(WORLD_LOGIC_KINDS.ZONE, {
        x: position.x,
        z: position.z,
        radius: 2.5,
        label: `Zone ${index}`,
        data: { role: "generic" },
      });
      notice = `เพิ่ม Zone ${index} แล้ว — ปรับรัศมีด้วย − / ＋`;
      renderOverlay();
    }, "primary");

    const list = document.createElement("div");
    list.className = "wb-list";
    if (zones.length) list.append(...zones.map(zoneRow));
    else {
      const empty = document.createElement("div");
      empty.className = "wb-note";
      empty.textContent = "ยังไม่มี Zone ในโลกนี้";
      list.append(empty);
    }

    card.append(title, note, add, list);
    return card;
  }

  function renderLogic() {
    overlay.replaceChildren(spawnCard(), zonesCard());
    if (notice) {
      const message = document.createElement("div");
      message.className = "wb-card wb-note";
      message.textContent = notice;
      overlay.append(message);
    }
  }

  function renderManage() {
    const card = document.createElement("div");
    card.className = "wb-card";
    const title = document.createElement("div");
    title.className = "wb-title";
    title.textContent = "💾 Manage World";
    const note = document.createElement("div");
    note.className = "wb-note";
    note.textContent = notice || `โลกนี้มี Logic ${WORLD_LOGIC.nodeCount} node · บันทึกโลกจะรวม Terrain + Ground + Objects + Horizon + Logic ในไฟล์เดียว`;
    const row = document.createElement("div");
    row.className = "wb-row";
    row.append(
      makeButton("💾 บันทึกโลก .json", () => builderAction("บันทึก"), "primary"),
      makeButton("↺ คืนค่า Logic", () => {
        WORLD_LOGIC.resetToAuthored();
        notice = "คืนค่า Logic ตามไฟล์โลกแล้ว";
        renderOverlay();
      }),
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

  const unsubscribe = WORLD_LOGIC.subscribe(() => {
    if (mode === "logic" || mode === "manage") renderOverlay();
  });
  window.addEventListener("pagehide", unsubscribe, { once: true });
  activate("objects");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupWorldBuilderUI, { once: true });
} else {
  setupWorldBuilderUI();
}
