import { createWorldLogic, WORLD_LOGIC } from "../systems/world-logic.js";
import { WORLD_MARKER_KIND, WORLD_NAVIGATION } from "../systems/world-navigation.js";

const PORTAL_KIND = "portal";

function playerPosition() {
  const position = window.__lioraAudioRuntime?.state?.position;
  const x = Number(position?.x);
  const z = Number(position?.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function makeButton(label, handler, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) button.className = className;
  button.onclick = handler;
  return button;
}

function note(text) {
  const element = document.createElement("div");
  element.className = "wb-note";
  element.textContent = text;
  return element;
}

function nodeRow(node, detailText) {
  const row = document.createElement("div");
  row.className = "wb-node";
  const info = document.createElement("div");
  const name = document.createElement("b");
  name.textContent = node.label || node.id;
  const detail = document.createElement("small");
  detail.textContent = detailText;
  info.append(name, detail);
  row.append(info);
  return { row, info };
}

async function markersFor(mapId) {
  if (mapId === WORLD_LOGIC.mapId) {
    return WORLD_LOGIC.listNodes(WORLD_MARKER_KIND);
  }
  const logic = createWorldLogic({ mapId });
  await logic.importCurrentMap();
  return logic.listNodes(WORLD_MARKER_KIND);
}

function markerCard() {
  const markers = WORLD_LOGIC.listNodes(WORLD_MARKER_KIND);
  const card = document.createElement("div");
  card.className = "wb-card";
  card.id = "wb-marker-card";

  const title = document.createElement("div");
  title.className = "wb-title";
  title.textContent = `📌 World Markers · ${markers.length}`;
  card.append(
    title,
    note("Marker คือจุดอ้างอิงที่ไม่มี collision และไม่ยิง event ใช้เป็นปลายทาง Portal, จุด NPC, cutscene anchor หรือ fast travel ได้")
  );

  card.append(makeButton("＋ เพิ่ม Marker ตรง Liora", () => {
    const position = playerPosition();
    if (!position) return;
    const index = markers.length + 1;
    WORLD_LOGIC.addNode(WORLD_MARKER_KIND, {
      x: position.x,
      z: position.z,
      radius: 0.5,
      label: `Marker ${index}`,
      enabled: false,
      data: { role: "world-marker" },
    });
  }, "primary"));

  const list = document.createElement("div");
  list.className = "wb-list";
  if (!markers.length) list.append(note("ยังไม่มี Marker ใน Map นี้"));
  for (const marker of markers) {
    const { row } = nodeRow(marker, `ID ${marker.id} · X ${marker.x.toFixed(1)} · Z ${marker.z.toFixed(1)}`);
    const tools = document.createElement("div");
    tools.className = "wb-mini";
    tools.append(makeButton("✕", () => WORLD_LOGIC.removeNode(marker.id), "danger"));
    row.append(tools);
    list.append(row);
  }
  card.append(list);
  return card;
}

async function portalCard(maps) {
  const portals = WORLD_LOGIC.listNodes(PORTAL_KIND);
  const card = document.createElement("div");
  card.className = "wb-card";
  card.id = "wb-portal-card";

  const title = document.createElement("div");
  title.className = "wb-title";
  title.textContent = `🌀 Portals · ${portals.length}`;
  card.append(
    title,
    note("Portal อ้างปลายทางด้วย mapId + markerId เท่านั้น จึงย้ายไฟล์ Map หรือเปลี่ยนฉากภายในได้โดยไม่แก้ Portal")
  );

  const targetMap = document.createElement("select");
  targetMap.className = "wb-select";
  for (const map of maps) {
    const option = document.createElement("option");
    option.value = map.id;
    option.textContent = `${map.id === WORLD_LOGIC.mapId ? "• " : ""}${map.name}`;
    targetMap.append(option);
  }
  const preferred = maps.find((map) => map.id !== WORLD_LOGIC.mapId) ?? maps[0];
  if (preferred) targetMap.value = preferred.id;

  const targetMarker = document.createElement("select");
  targetMarker.className = "wb-select";
  const addPortal = makeButton("＋ เพิ่ม Portal ตรง Liora", () => {}, "primary");
  addPortal.disabled = true;

  async function refreshMarkers() {
    targetMarker.replaceChildren();
    addPortal.disabled = true;
    const mapId = targetMap.value;
    const markers = mapId ? await markersFor(mapId) : [];
    for (const marker of markers) {
      const option = document.createElement("option");
      option.value = marker.id;
      option.textContent = `${marker.label || marker.id} (${marker.id})`;
      targetMarker.append(option);
    }
    if (!markers.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "ยังไม่มี Marker ใน Map นี้";
      targetMarker.append(option);
    }
    addPortal.disabled = !markers.length;
  }

  targetMap.onchange = refreshMarkers;
  addPortal.onclick = () => {
    const position = playerPosition();
    const mapId = targetMap.value;
    const markerId = targetMarker.value;
    if (!position || !mapId || !markerId) return;
    const index = portals.length + 1;
    WORLD_LOGIC.addNode(PORTAL_KIND, {
      x: position.x,
      z: position.z,
      radius: 1.25,
      label: `Portal ${index}`,
      enabled: true,
      data: {
        role: "portal",
        targetMap: mapId,
        targetMarker: markerId,
        actions: {
          enter: [{ type: "portal", mapId, markerId }],
        },
      },
    });
  };

  const fields = document.createElement("div");
  fields.className = "wb-fields";
  fields.append(targetMap, targetMarker, addPortal);
  card.append(fields);
  refreshMarkers();

  const list = document.createElement("div");
  list.className = "wb-list";
  if (!portals.length) list.append(note("ยังไม่มี Portal ใน Map นี้"));
  for (const portal of portals) {
    const mapId = String(portal.data?.targetMap ?? "?");
    const markerId = String(portal.data?.targetMarker ?? "?");
    const { row } = nodeRow(
      portal,
      `→ ${mapId} / ${markerId} · รัศมี ${portal.radius.toFixed(1)} ม.`
    );
    const tools = document.createElement("div");
    tools.className = "wb-mini";
    tools.append(
      makeButton("−", () => WORLD_LOGIC.updateNode(portal.id, { radius: Math.max(0.5, portal.radius - 0.25) })),
      makeButton("＋", () => WORLD_LOGIC.updateNode(portal.id, { radius: Math.min(8, portal.radius + 0.25) })),
      makeButton("✕", () => WORLD_LOGIC.removeNode(portal.id), "danger")
    );
    row.append(tools);
    list.append(row);
  }
  card.append(list);
  return card;
}

function mapCard(maps) {
  const card = document.createElement("div");
  card.className = "wb-card";
  card.id = "wb-map-card";
  const title = document.createElement("div");
  title.className = "wb-title";
  title.textContent = "🗺 Maps";
  const select = document.createElement("select");
  select.className = "wb-select";
  for (const map of maps) {
    const option = document.createElement("option");
    option.value = map.id;
    option.textContent = map.name;
    select.append(option);
  }
  select.value = WORLD_LOGIC.mapId;
  const open = makeButton("เปิด Map", () => {
    const url = WORLD_NAVIGATION.urlFor(select.value);
    if (url) location.assign(url);
  }, "primary");
  card.append(title, note(`กำลังแก้ไข: ${WORLD_LOGIC.mapId}`), select, open);
  return card;
}

function installStyles() {
  if (document.querySelector("#wb-portal-plugin-style")) return;
  const style = document.createElement("style");
  style.id = "wb-portal-plugin-style";
  style.textContent = `
    #wb-overlay .wb-fields { display: grid; gap: 7px; }
    #wb-overlay .wb-select {
      width: 100%; min-height: 42px; padding: 7px 10px;
      border: 0; border-radius: 10px; font: inherit;
      background: rgba(0,0,0,.055); color: inherit;
    }
    #wb-overlay button:disabled { opacity: .45; }
  `;
  document.head.append(style);
}

async function setup() {
  const root = document.querySelector("#build-panel");
  const overlay = document.querySelector("#wb-overlay");
  if (!root || !overlay) return;
  installStyles();
  const maps = await WORLD_NAVIGATION.listMaps();

  let scheduled = false;
  async function enhance() {
    scheduled = false;
    const mode = root.dataset.wbMode;
    if (mode === "logic" && !overlay.querySelector("#wb-portal-plugin")) {
      const wrapper = document.createElement("div");
      wrapper.id = "wb-portal-plugin";
      wrapper.style.display = "contents";
      wrapper.append(markerCard(), await portalCard(maps));
      if (root.dataset.wbMode === "logic") overlay.append(wrapper);
    }
    if (mode === "manage" && !overlay.querySelector("#wb-map-card")) {
      overlay.append(mapCard(maps));
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(enhance);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-wb-mode"] });
  WORLD_LOGIC.subscribe(schedule);
  schedule();
  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setup, { once: true });
} else {
  setup();
}
