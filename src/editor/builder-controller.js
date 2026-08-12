import {
  BUILDER_CONTEXTS,
  enterEditContext,
  enterIdleContext,
  enterPlaceContext,
  pushBuilderHistory,
} from "./builder-state.js";

export function createBuilderController({
  state,
  catalog,
  layoutStore,
  worldHalfSize = Infinity,
  edgePadding = 0.25,
  collisionGap = 0.08,
  onContextChange = () => {},
  onSelectionChange = () => {},
  onPreviewChange = () => {},
  onLayoutChange = () => {},
} = {}) {
  if (!state) throw new Error("Builder state is required");
  if (!catalog) throw new Error("Builder catalog is required");
  if (!layoutStore) throw new Error("Builder layout store is required");

  const items = [];

  function emitContext() {
    onContextChange(state.context, state);
  }

  function save() {
    const payload = layoutStore.save(items);
    onLayoutChange(items, payload);
    return payload;
  }

  function normalizeItem(item) {
    if (!item || typeof item !== "object") return null;
    const asset = catalog[item.assetId];
    if (!asset) return null;

    const normalized = {
      id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
      assetId: item.assetId,
      x: Number(item.x),
      z: Number(item.z),
      rotation: Number(item.rotation ?? 0),
      scale: Number(item.scale ?? asset.defaultScale ?? 1),
    };

    if (![normalized.x, normalized.z, normalized.rotation, normalized.scale].every(Number.isFinite)) {
      return null;
    }
    return normalized;
  }

  function effectiveRadius(asset, scale) {
    const base = Number(asset?.placementRadius ?? 0);
    const authoredScale = Number(asset?.defaultScale ?? 1);
    const ratio = authoredScale > 0 ? scale / authoredScale : 1;
    return Math.max(0, base * ratio);
  }

  function validatePlacement(assetId, transform, ignoreId = null) {
    const asset = catalog[assetId];
    if (!asset) return { ok: false, code: "unknown-asset" };

    const x = Number(transform?.x);
    const z = Number(transform?.z);
    const scale = Number(transform?.scale ?? asset.defaultScale ?? 1);
    if (![x, z, scale].every(Number.isFinite)) {
      return { ok: false, code: "invalid-transform" };
    }

    if (scale < asset.minScale - 1e-6 || scale > asset.maxScale + 1e-6) {
      return { ok: false, code: "scale" };
    }

    const radius = effectiveRadius(asset, scale);
    const limit = Number.isFinite(worldHalfSize)
      ? Math.max(0, worldHalfSize - edgePadding)
      : Infinity;

    if (Math.abs(x) + radius > limit || Math.abs(z) + radius > limit) {
      return { ok: false, code: "edge", radius };
    }

    for (const other of items) {
      if (other.id === ignoreId) continue;
      const otherAsset = catalog[other.assetId];
      if (!otherAsset) continue;
      const otherRadius = effectiveRadius(otherAsset, other.scale);
      const minDistance = radius + otherRadius + collisionGap;
      if (Math.hypot(x - other.x, z - other.z) < minDistance) {
        return {
          ok: false,
          code: "collision",
          conflictId: other.id,
          conflictAssetId: other.assetId,
        };
      }
    }

    return { ok: true, radius };
  }

  function enable() {
    state.enabled = true;
    enterIdleContext(state);
    emitContext();
  }

  function disable({ saveLayout = true } = {}) {
    if (saveLayout) save();
    state.enabled = false;
    enterIdleContext(state);
    onSelectionChange(null);
    onPreviewChange(null);
    emitContext();
  }

  function beginPlacement(assetId) {
    const asset = catalog[assetId];
    if (!asset) throw new Error(`Unknown buildable asset: ${assetId}`);
    enterPlaceContext(state, assetId);
    onPreviewChange({ assetId, asset });
    emitContext();
  }

  function cancelPlacement() {
    enterIdleContext(state);
    onPreviewChange(null);
    emitContext();
  }

  function addItem(
    item,
    { validate = true, saveLayout = true, recordHistory = true } = {}
  ) {
    const normalized = normalizeItem(item);
    if (!normalized) return null;

    if (validate && !validatePlacement(normalized.assetId, normalized).ok) {
      return null;
    }

    items.push(normalized);
    if (recordHistory) {
      pushBuilderHistory(state, { type: "add", item: { ...normalized } });
    }
    if (saveLayout) save();
    enterIdleContext(state);
    onPreviewChange(null);
    emitContext();
    return normalized;
  }

  function selectItem(id) {
    const item = items.find((entry) => entry.id === id) ?? null;
    if (!item) {
      enterIdleContext(state);
      onSelectionChange(null);
      emitContext();
      return null;
    }
    enterEditContext(state, id);
    onSelectionChange(item);
    emitContext();
    return item;
  }

  function clearSelection() {
    enterIdleContext(state);
    onSelectionChange(null);
    emitContext();
  }

  function updateSelected(transform) {
    const item = items.find((entry) => entry.id === state.selectedObjectId);
    if (!item) return null;

    const next = { ...item, ...transform };
    const needsPlacementCheck =
      Object.prototype.hasOwnProperty.call(transform, "x") ||
      Object.prototype.hasOwnProperty.call(transform, "z") ||
      Object.prototype.hasOwnProperty.call(transform, "scale");

    if (
      needsPlacementCheck &&
      !validatePlacement(item.assetId, next, item.id).ok
    ) {
      return null;
    }

    Object.assign(item, transform);
    save();
    onSelectionChange(item);
    return item;
  }

  function duplicateSelected() {
    const item = items.find((entry) => entry.id === state.selectedObjectId);
    if (!item) return null;

    const asset = catalog[item.assetId];
    if (!asset) return null;
    const radius = effectiveRadius(asset, item.scale);
    const baseDistance = Math.max(0.8, radius * 2 + collisionGap + 0.25);
    const directions = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];

    for (const ring of [1, 1.35, 1.7]) {
      for (const [dx, dz] of directions) {
        const length = Math.hypot(dx, dz) || 1;
        const candidate = {
          ...item,
          id: crypto.randomUUID(),
          x: item.x + (dx / length) * baseDistance * ring,
          z: item.z + (dz / length) * baseDistance * ring,
        };
        if (validatePlacement(candidate.assetId, candidate).ok) {
          return addItem(candidate);
        }
      }
    }
    return null;
  }

  function deleteSelected() {
    const index = items.findIndex((entry) => entry.id === state.selectedObjectId);
    if (index < 0) return null;
    const [removed] = items.splice(index, 1);
    pushBuilderHistory(state, { type: "delete", item: { ...removed } });
    enterIdleContext(state);
    onSelectionChange(null);
    save();
    emitContext();
    return removed;
  }

  function load() {
    items.splice(0, items.length, ...layoutStore.load());
    enterIdleContext(state);
    onSelectionChange(null);
    onPreviewChange(null);
    onLayoutChange(items, null);
    emitContext();
    return items;
  }

  return {
    items,
    enable,
    disable,
    save,
    load,
    validatePlacement,
    beginPlacement,
    cancelPlacement,
    addItem,
    selectItem,
    clearSelection,
    updateSelected,
    duplicateSelected,
    deleteSelected,
    get context() {
      return state.context;
    },
    get isPlacing() {
      return state.context === BUILDER_CONTEXTS.PLACE;
    },
    get isEditing() {
      return state.context === BUILDER_CONTEXTS.EDIT;
    },
  };
}
