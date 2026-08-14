/**
 * The one place a paintable ground layer is described.
 *
 * Adding a surface used to mean editing five files that each hardcoded the
 * same four names — the layer enum, the ink map, the feather table, the save
 * validator and the fragment shader. Now a layer is a row in CONFIG.groundPaint
 * .layers and everything else is derived from it.
 *
 * Two numbers matter and they are NOT the same number:
 *
 *   id       Stable, saved to disk. Never renumber an existing layer or every
 *            stroke ever painted moves to a different surface. New layers take
 *            the next free id.
 *   channel  Where the weight lives in the splat pages. Derived from the order
 *            of the paintable layers, so it can be recomputed freely.
 *
 * The base layer (grass) has no channel at all: its weight is whatever the
 * painted layers leave over, which is also what makes it the eraser.
 */

export const CHANNELS_PER_PAGE = 3; // r, g, b — alpha stays 1 so pages stay opaque

const FEATHER_PROFILES = Object.freeze({
  // Longest feather: dirt should melt into grass the most.
  long: [
    [0.0, 0.0],
    [0.08, 0.0],
    [0.2, 0.08],
    [0.34, 0.18],
    [0.5, 0.34],
    [0.66, 0.54],
    [0.8, 0.72],
    [0.9, 0.86],
    [0.97, 0.96],
    [1.0, 1.0],
  ],
  // Medium soft: still fluffy, but keep shoreline/path shape a bit clearer.
  medium: [
    [0.0, 0.0],
    [0.12, 0.0],
    [0.26, 0.1],
    [0.42, 0.24],
    [0.58, 0.42],
    [0.74, 0.62],
    [0.86, 0.8],
    [0.94, 0.92],
    [1.0, 1.0],
  ],
  // Shorter feather: reduce the grey halo around hard-edged surfaces like rock.
  short: [
    [0.0, 0.0],
    [0.18, 0.0],
    [0.34, 0.1],
    [0.52, 0.26],
    [0.68, 0.46],
    [0.82, 0.68],
    [0.92, 0.86],
    [0.98, 0.96],
    [1.0, 1.0],
  ],
});

function resolveFeather(feather) {
  if (Array.isArray(feather)) return feather;
  return FEATHER_PROFILES[feather] ?? FEATHER_PROFILES.long;
}

/**
 * @param {Array} list  rows from CONFIG.groundPaint.layers
 * @param {{ maxLayers?: number }} options
 */
export function createGroundLayers(list, { maxLayers = 16 } = {}) {
  if (!Array.isArray(list) || !list.length) {
    throw new Error("Ground layers: at least one layer is required");
  }
  if (list.length > maxLayers) {
    throw new Error(
      `Ground layers: ${list.length} layers exceeds the cap of ${maxLayers}`
    );
  }

  const layers = [];
  const byId = new Map();
  const byKey = new Map();

  for (const raw of list) {
    const id = Math.floor(Number(raw?.id));
    if (!Number.isFinite(id) || id < 0) {
      throw new Error(`Ground layers: bad id on "${raw?.key}"`);
    }
    if (byId.has(id)) {
      // Silently reusing an id would repaint half the island the wrong colour
      // the next time a save is loaded, so this is fatal rather than a warning.
      throw new Error(`Ground layers: duplicate id ${id}`);
    }
    if (!raw.key || byKey.has(raw.key)) {
      throw new Error(`Ground layers: missing or duplicate key "${raw?.key}"`);
    }
    if (!raw.texture) {
      throw new Error(`Ground layers: layer "${raw.key}" has no texture`);
    }
    const layer = Object.freeze({
      id,
      key: String(raw.key),
      label: String(raw.label ?? raw.key),
      icon: String(raw.icon ?? ""),
      texture: String(raw.texture),
      base: Boolean(raw.base),
      feather: Object.freeze(resolveFeather(raw.feather)),
      // Filled in below; declared here so the shape is obvious.
      slot: -1,
      channel: -1,
    });
    layers.push(layer);
    byId.set(id, layer);
    byKey.set(layer.key, layer);
  }

  const bases = layers.filter((layer) => layer.base);
  if (bases.length !== 1) {
    throw new Error(
      `Ground layers: expected exactly one base layer, found ${bases.length}`
    );
  }

  // Order the array texture by id so a saved stroke and a shader slot agree
  // even if someone reorders the config rows.
  const ordered = [...layers].sort((a, b) => a.id - b.id);
  const paintable = ordered.filter((layer) => !layer.base);

  const resolved = ordered.map((layer, slot) =>
    Object.freeze({
      ...layer,
      /** Index into the ground DataArrayTexture. */
      slot,
      /** Index into the splat pages; -1 for the base layer. */
      channel: layer.base ? -1 : paintable.indexOf(layer),
    })
  );

  const bySlotId = new Map(resolved.map((layer) => [layer.id, layer]));
  const bySlotKey = new Map(resolved.map((layer) => [layer.key, layer]));
  const base = resolved.find((layer) => layer.base);
  const paintableResolved = resolved.filter((layer) => !layer.base);
  const pageCount = Math.max(
    1,
    Math.ceil(paintableResolved.length / CHANNELS_PER_PAGE)
  );

  return Object.freeze({
    /** Every layer, ordered by id — this order IS the texture array order. */
    all: Object.freeze(resolved),
    /** Everything except the base, in channel order. */
    paintable: Object.freeze(paintableResolved),
    base,
    maxLayers,
    /** How many splat pages a fully painted world needs. */
    pageCount,
    get(id) {
      return bySlotId.get(Number(id)) ?? null;
    },
    byKey(key) {
      return bySlotKey.get(key) ?? null;
    },
    /** True for any id the save format may legally contain. */
    isValidId(id) {
      return bySlotId.has(Number(id));
    },
    /** Which splat page a layer's weight lives on. Base layer touches all. */
    pageOf(id) {
      const layer = bySlotId.get(Number(id));
      if (!layer || layer.channel < 0) return -1;
      return Math.floor(layer.channel / CHANNELS_PER_PAGE);
    },
    /** 0 = red, 1 = green, 2 = blue within that page. */
    componentOf(id) {
      const layer = bySlotId.get(Number(id));
      if (!layer || layer.channel < 0) return -1;
      return layer.channel % CHANNELS_PER_PAGE;
    },
  });
}
