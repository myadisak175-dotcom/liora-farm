/**
 * Which world am I in, and where does that world's data live.
 *
 * Every save in this project used a single fixed localStorage key —
 * `liora.island-layout.v1`, `liora.ground-paint.v1`, `liora.horizon.v1` and so
 * on. That is exactly right for a game with one island and exactly wrong for a
 * game with several: opening a second map would quietly overwrite the first
 * one's sculpting, painting and layout with no way back.
 *
 * The rule here has one hard constraint. **The default map must keep its
 * existing keys, byte for byte.** Anyone playing right now has hours of work
 * saved under the unscoped names, and a scheme that renames those keys is a
 * scheme that deletes their island the first time they load the new build.
 * So only non-default maps get a suffix.
 */

export const DEFAULT_MAP_ID = "home-island";
export const MAP_QUERY_PARAM = "map";

/** Ids appear in localStorage keys and URLs, so keep them boring. */
export function isValidMapId(id) {
  return typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,47}$/.test(id);
}

export function normalizeMapId(id, fallback = DEFAULT_MAP_ID) {
  if (isValidMapId(id)) return id;
  const slug = String(id ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return isValidMapId(slug) ? slug : fallback;
}

/**
 * @param {string} key       the historical, unscoped storage key
 * @param {string} mapId     the map being played
 * @param {string} defaultId the map whose keys must stay unscoped
 */
export function scopeStorageKey(key, mapId, defaultId = DEFAULT_MAP_ID) {
  if (!key) return key;
  if (!isValidMapId(mapId) || mapId === defaultId) return key;
  return `${key}::${mapId}`;
}

/** Reads `?map=` without throwing in environments that have no location. */
export function readMapIdFromLocation(search = typeof location === "undefined" ? "" : location.search) {
  try {
    const requested = new URLSearchParams(search).get(MAP_QUERY_PARAM);
    return isValidMapId(requested) ? requested : null;
  } catch {
    return null;
  }
}

/**
 * The active map plus a `key()` helper every store goes through.
 *
 * `entries` is the registry (see maps/index.json). An unknown or missing id
 * falls back to the default rather than booting into an empty world.
 */
export function createMapScope({
  entries = [],
  requestedId = null,
  defaultId = DEFAULT_MAP_ID,
} = {}) {
  const list = entries
    .map((entry) => ({
      id: normalizeMapId(entry?.id),
      name: String(entry?.name ?? entry?.id ?? "แผนที่"),
      file: String(entry?.file ?? `./maps/${normalizeMapId(entry?.id)}.json`),
      builtIn: entry?.builtIn !== false,
    }))
    .filter((entry) => isValidMapId(entry.id));

  const fallbackId = list.some((entry) => entry.id === defaultId)
    ? defaultId
    : (list[0]?.id ?? defaultId);

  const wanted = requestedId ?? readMapIdFromLocation();
  const id = list.some((entry) => entry.id === wanted) ? wanted : fallbackId;
  const entry = list.find((item) => item.id === id)
    ?? { id, name: id, file: `./maps/${id}.json`, builtIn: false };

  return {
    id,
    entry,
    defaultId,
    maps: list,
    isDefault: id === defaultId,
    key: (storageKey) => scopeStorageKey(storageKey, id, defaultId),
    /** The URL that opens another map. Switching is a reload — see docs. */
    urlFor(nextId) {
      const target = normalizeMapId(nextId, defaultId);
      if (typeof location === "undefined") return `?${MAP_QUERY_PARAM}=${target}`;
      const url = new URL(location.href);
      if (target === defaultId) url.searchParams.delete(MAP_QUERY_PARAM);
      else url.searchParams.set(MAP_QUERY_PARAM, target);
      return url.toString();
    },
  };
}
