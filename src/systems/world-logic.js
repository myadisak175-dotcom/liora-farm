import { createLocalStore } from "./local-store.js";
import {
  DEFAULT_MAP_ID,
  readMapIdFromLocation,
  scopeStorageKey,
} from "./map-scope.js";

export const WORLD_LOGIC_VERSION = 2;
export const WORLD_LOGIC_STORAGE_KEY = "liora.world-logic.v2";
export const LEGACY_WORLD_LOGIC_STORAGE_KEY = "liora.world-logic.v1";
export const DEFAULT_PLAYER_SPAWN = Object.freeze({ x: 0, z: 5 });

/**
 * Logic kinds are deliberately data, not classes. The builder, runtime and
 * future game systems can register behaviour for a kind without changing the
 * map schema or teaching persistence about Three.js objects.
 */
export const WORLD_LOGIC_KINDS = Object.freeze({
  ZONE: "zone",
  TRIGGER: "trigger",
  PORTAL: "portal",
  NPC: "npc",
  INTERACTABLE: "interactable",
});

const KIND_RE = /^[a-z][a-z0-9-]{0,31}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(value, fallback = DEFAULT_PLAYER_SPAWN) {
  return {
    x: finite(value?.x, fallback.x),
    z: finite(value?.z, fallback.z),
  };
}

function cleanText(value, fallback = "", max = 80) {
  return String(value ?? fallback).trim().slice(0, max);
}

function cleanKind(value) {
  const kind = cleanText(value, "zone", 32).toLowerCase();
  return KIND_RE.test(kind) ? kind : WORLD_LOGIC_KINDS.ZONE;
}

function cleanId(value) {
  const id = cleanText(value, "", 64).toLowerCase();
  return ID_RE.test(id) ? id : null;
}

function cloneData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    const copy = JSON.parse(JSON.stringify(value));
    return copy && typeof copy === "object" && !Array.isArray(copy) ? copy : {};
  } catch {
    return {};
  }
}

function sanitizeNode(value, fallbackId = null) {
  if (!value || typeof value !== "object") return null;
  const id = cleanId(value.id) ?? cleanId(fallbackId);
  if (!id) return null;
  const kind = cleanKind(value.kind);
  return {
    id,
    kind,
    label: cleanText(value.label, kind === WORLD_LOGIC_KINDS.ZONE ? "Zone" : kind),
    x: finite(value.x),
    z: finite(value.z),
    radius: Math.max(0.25, Math.min(50, finite(value.radius, 2.5))),
    enabled: value.enabled !== false,
    data: cloneData(value.data),
  };
}

/**
 * Accepts both the original v1 `{ spawn }` payload and the extensible v2
 * `{ spawn, nodes[] }` payload. Unknown future fields are ignored instead of
 * leaking into the runtime; unknown node kinds are preserved when syntactically
 * safe so plugins can add gameplay without a schema migration.
 */
export function sanitizeWorldLogic(value, { defaultSpawn = DEFAULT_PLAYER_SPAWN } = {}) {
  const source = value && typeof value === "object" ? value : {};
  const spawn = point(source.spawn, defaultSpawn);
  const nodes = [];
  const seen = new Set();
  for (const candidate of Array.isArray(source.nodes) ? source.nodes : []) {
    const node = sanitizeNode(candidate);
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    nodes.push(node);
  }
  return {
    version: WORLD_LOGIC_VERSION,
    spawn,
    nodes,
  };
}

function cloneLogic(value, options) {
  return sanitizeWorldLogic(value, options);
}

function loadLegacy(mapId, defaultId = DEFAULT_MAP_ID) {
  if (typeof localStorage === "undefined") return null;
  const key = scopeStorageKey(LEGACY_WORLD_LOGIC_STORAGE_KEY, mapId, defaultId);
  try {
    const payload = JSON.parse(localStorage.getItem(key) ?? "null");
    if (payload?.version !== 1) return null;
    return sanitizeWorldLogic(payload);
  } catch {
    return null;
  }
}

export function createWorldLogic({
  mapId = readMapIdFromLocation() ?? DEFAULT_MAP_ID,
  defaultId = DEFAULT_MAP_ID,
  storageKey = WORLD_LOGIC_STORAGE_KEY,
  defaultSpawn = DEFAULT_PLAYER_SPAWN,
} = {}) {
  const store = createLocalStore({
    key: scopeStorageKey(storageKey, mapId, defaultId),
    version: WORLD_LOGIC_VERSION,
  });
  const options = { defaultSpawn };
  const stored = store.load();
  const legacy = stored ? null : loadLegacy(mapId, defaultId);

  let authored = cloneLogic(null, options);
  let state = cloneLogic(stored ?? legacy, options);
  let touched = Boolean(stored ?? legacy);
  let sequence = state.nodes.length;
  const listeners = new Set();

  // A v1 save came from the first prototype branch. Preserve it under v2 on
  // first load so the next save/export has one canonical schema.
  if (!stored && legacy) store.save(state);

  function emit(reason = "change") {
    const snapshot = exportData();
    for (const listener of listeners) {
      try { listener(snapshot, reason); }
      catch (error) { console.error("World logic listener failed", error); }
    }
  }

  function persist(reason) {
    touched = true;
    store.save(state);
    emit(reason);
  }

  function nextId(kind) {
    const prefix = cleanKind(kind);
    const used = new Set(state.nodes.map((node) => node.id));
    let id = "";
    do {
      sequence += 1;
      id = `${prefix}-${sequence}`;
    } while (used.has(id));
    return id;
  }

  function setSpawn(value) {
    const next = point(value, state.spawn);
    if (!Number.isFinite(next.x) || !Number.isFinite(next.z)) return false;
    state.spawn = next;
    persist("spawn");
    return true;
  }

  function addNode(kind, value = {}) {
    const node = sanitizeNode({
      ...value,
      id: cleanId(value.id) ?? nextId(kind),
      kind,
    });
    if (!node) return null;
    if (state.nodes.some((entry) => entry.id === node.id)) node.id = nextId(kind);
    state.nodes.push(node);
    persist("node-add");
    return { ...node, data: cloneData(node.data) };
  }

  function updateNode(id, patch = {}) {
    const at = state.nodes.findIndex((node) => node.id === id);
    if (at === -1) return null;
    const current = state.nodes[at];
    const next = sanitizeNode({
      ...current,
      ...patch,
      id: current.id,
      data: patch.data === undefined ? current.data : patch.data,
    });
    if (!next) return null;
    state.nodes[at] = next;
    persist("node-update");
    return { ...next, data: cloneData(next.data) };
  }

  function removeNode(id) {
    const at = state.nodes.findIndex((node) => node.id === id);
    if (at === -1) return false;
    state.nodes.splice(at, 1);
    persist("node-remove");
    return true;
  }

  function clearNodes(kind = null) {
    const before = state.nodes.length;
    state.nodes = kind
      ? state.nodes.filter((node) => node.kind !== kind)
      : [];
    if (state.nodes.length === before) return false;
    persist("nodes-clear");
    return true;
  }

  function listNodes(kind = null) {
    return state.nodes
      .filter((node) => !kind || node.kind === kind)
      .map((node) => ({ ...node, data: cloneData(node.data) }));
  }

  function getNode(id) {
    const node = state.nodes.find((entry) => entry.id === id);
    return node ? { ...node, data: cloneData(node.data) } : null;
  }

  function importData(next) {
    authored = cloneLogic(next, options);
    if (touched) {
      emit("authored-loaded");
      return false;
    }
    state = cloneLogic(authored, options);
    sequence = Math.max(sequence, state.nodes.length);
    emit("authored-applied");
    return true;
  }

  function resetToAuthored() {
    store.clear();
    touched = false;
    state = cloneLogic(authored, options);
    sequence = state.nodes.length;
    emit("reset");
    return true;
  }

  function exportData() {
    return cloneLogic(state, options);
  }

  async function importMap(url) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`World logic map request failed: ${response.status}`);
      const map = await response.json();
      importData(map?.logic ?? null);
      return true;
    } catch (error) {
      console.warn("World logic defaults could not be loaded", error);
      importData(null);
      return false;
    }
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    mapId,
    storageKey: store.key,
    setSpawn,
    addNode,
    updateNode,
    removeNode,
    clearNodes,
    listNodes,
    getNode,
    importData,
    importMap,
    resetToAuthored,
    exportData,
    subscribe,
    get spawn() { return { ...state.spawn }; },
    get nodeCount() { return state.nodes.length; },
    get touched() { return touched; },
    get storeIssue() { return store.lastIssue; },
  };
}

/**
 * One live logic document per page. It owns bytes and gameplay authoring state;
 * UI code merely edits it, and runtime systems merely read/subscribe to it.
 */
export const WORLD_LOGIC = createWorldLogic();
