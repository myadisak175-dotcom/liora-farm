import {
  DEFAULT_MAP_ID,
  MAP_QUERY_PARAM,
  isValidMapId,
} from "./map-scope.js";

export const WORLD_ARRIVAL_STORAGE_KEY = "liora.world-arrival.v1";
export const WORLD_ARRIVAL_VERSION = 1;
export const WORLD_ARRIVAL_MAX_AGE_MS = 120000;
export const WORLD_MARKER_KIND = "marker";

const MARKER_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function validMarkerId(value) {
  return typeof value === "string" && MARKER_ID_RE.test(value);
}

function finitePoint(value) {
  const x = Number(value?.x);
  const z = Number(value?.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function safeStorage(storage) {
  return storage && typeof storage.getItem === "function" ? storage : null;
}

export function createWorldNavigation({
  fetcher = typeof fetch === "function" ? fetch.bind(globalThis) : null,
  storage = typeof sessionStorage === "undefined" ? null : sessionStorage,
  locationRef = typeof location === "undefined" ? null : location,
  now = () => Date.now(),
} = {}) {
  const session = safeStorage(storage);

  async function listMaps() {
    if (!fetcher) return [];
    try {
      const response = await fetcher("./maps/index.json", { cache: "no-store" });
      if (!response?.ok) return [];
      const index = await response.json();
      return (Array.isArray(index?.maps) ? index.maps : [])
        .filter((entry) => isValidMapId(entry?.id))
        .map((entry) => ({
          id: entry.id,
          name: String(entry.name ?? entry.id),
          file: String(entry.file ?? `./maps/${entry.id}.json`),
        }));
    } catch {
      return [];
    }
  }

  async function mapEntry(mapId) {
    if (!isValidMapId(mapId)) return null;
    const maps = await listMaps();
    return maps.find((entry) => entry.id === mapId) ?? null;
  }

  async function loadMap(mapId) {
    const entry = await mapEntry(mapId);
    if (!entry || !fetcher) return null;
    try {
      const response = await fetcher(entry.file, { cache: "no-store" });
      if (!response?.ok) return null;
      const map = await response.json();
      return map && typeof map === "object" ? map : null;
    } catch {
      return null;
    }
  }

  async function listMarkers(mapId) {
    const map = await loadMap(mapId);
    const nodes = Array.isArray(map?.logic?.nodes) ? map.logic.nodes : [];
    return nodes
      .filter((node) => node?.kind === WORLD_MARKER_KIND && validMarkerId(node?.id))
      .map((node) => {
        const point = finitePoint(node);
        return point ? {
          id: node.id,
          label: String(node.label ?? node.id),
          x: point.x,
          z: point.z,
        } : null;
      })
      .filter(Boolean);
  }

  function setArrival({ mapId, markerId }) {
    if (!session || !isValidMapId(mapId) || !validMarkerId(markerId)) return false;
    try {
      session.setItem(WORLD_ARRIVAL_STORAGE_KEY, JSON.stringify({
        version: WORLD_ARRIVAL_VERSION,
        mapId,
        markerId,
        createdAt: now(),
      }));
      return true;
    } catch {
      return false;
    }
  }

  function clearArrival() {
    if (!session) return;
    try { session.removeItem(WORLD_ARRIVAL_STORAGE_KEY); }
    catch {}
  }

  function consumeArrival(mapId) {
    if (!session || !isValidMapId(mapId)) return null;
    let parsed = null;
    try {
      parsed = JSON.parse(session.getItem(WORLD_ARRIVAL_STORAGE_KEY) ?? "null");
    } catch {}
    clearArrival();
    if (parsed?.version !== WORLD_ARRIVAL_VERSION) return null;
    if (parsed.mapId !== mapId || !validMarkerId(parsed.markerId)) return null;
    const age = Math.max(0, now() - Number(parsed.createdAt || 0));
    if (!Number.isFinite(age) || age > WORLD_ARRIVAL_MAX_AGE_MS) return null;
    return { mapId: parsed.mapId, markerId: parsed.markerId };
  }

  async function resolveArrivalSpawn(mapId) {
    const arrival = consumeArrival(mapId);
    if (!arrival) return null;
    const markers = await listMarkers(mapId);
    const marker = markers.find((entry) => entry.id === arrival.markerId);
    return marker ? { x: marker.x, z: marker.z, markerId: marker.id } : null;
  }

  function urlFor(mapId) {
    if (!isValidMapId(mapId)) return null;
    const revision = String(globalThis.window?.__lioraRevision ?? "").trim();
    if (!locationRef) {
      const query = new URLSearchParams();
      if (mapId !== DEFAULT_MAP_ID) query.set(MAP_QUERY_PARAM, mapId);
      if (revision) query.set("v", revision);
      const value = query.toString();
      return value ? `?${value}` : "?";
    }
    const url = new URL(locationRef.href);
    if (mapId === DEFAULT_MAP_ID) url.searchParams.delete(MAP_QUERY_PARAM);
    else url.searchParams.set(MAP_QUERY_PARAM, mapId);
    if (revision) url.searchParams.set("v", revision);
    return url.toString();
  }

  async function navigate({ mapId, markerId }) {
    if (!isValidMapId(mapId) || !validMarkerId(markerId)) {
      return { ok: false, code: "invalid-target" };
    }
    const markers = await listMarkers(mapId);
    if (!markers.some((marker) => marker.id === markerId)) {
      return { ok: false, code: "missing-marker" };
    }
    const url = urlFor(mapId);
    if (!url || !setArrival({ mapId, markerId })) {
      return { ok: false, code: "arrival-save-failed" };
    }
    if (!locationRef) return { ok: true, code: "prepared", url };
    locationRef.assign(url);
    return { ok: true, code: "navigating", url };
  }

  return {
    listMaps,
    mapEntry,
    loadMap,
    listMarkers,
    setArrival,
    clearArrival,
    consumeArrival,
    resolveArrivalSpawn,
    urlFor,
    navigate,
  };
}

export const WORLD_NAVIGATION = createWorldNavigation();
