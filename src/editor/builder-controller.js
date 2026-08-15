import {
  BUILDER_CONTEXTS,
  enterEditContext,
  enterIdleContext,
  enterPlaceContext,
  popBuilderHistory,
  pushBuilderHistory,
} from "./builder-state.js";

/**
 * The rules of build mode. No DOM, no Three.js — everything here is numbers
 * and plain objects, which is why it can be unit tested on its own.
 */
export function createBuilderController({
  state,
  catalog,
  layoutStore,
  worldHalfSize = Infinity,
  // Fixed world features nothing may be built on — the vegetable plot, for a
  // start. Without this a house could be dropped straight on top of the farm.
  reservedAreas = [],
  // Numeric terrain sampler only; keeps this controller independent of Three.js.
  getGroundHeight = null,
  edgePadding = 0.25,
  collisionGap = 0.08,
  gridSize = 0.5,
  saveDebounceMs = 250,
  onContextChange = () => {},
  onSelectionChange = () => {},
  onPreviewChange = () => {},
  onLayoutChange = () => {},
  onItemsRestored = () => {},
} = {}) {
  if (!state) throw new Error("Builder state is required");
  if (!catalog) throw new Error("Builder catalog is required");
  if (!layoutStore) throw new Error("Builder layout store is required");

  const items = [];
  const inactiveItemIds = new Set();
  let saveTimer = null;
  let savePending = false;
  let loadReport = null;

  function emitContext() {
    onContextChange(state.context, state);
  }

  // Dragging an object used to write the whole layout to localStorage on every
  // pointermove — roughly 60 synchronous writes a second. Now the writes are
  // coalesced and flushed on anything that matters (place, delete, undo, mode
  // switch, page hide).
  function save({ immediate = false } = {}) {
    savePending = true;
    if (saveTimer) clearTimeout(saveTimer);

    if (immediate || saveDebounceMs <= 0) return flushSave();

    saveTimer = setTimeout(flushSave, saveDebounceMs);
    return null;
  }

  function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!savePending) return null;
    savePending = false;
    const payload = layoutStore.save(items);
    onLayoutChange(items, payload);
    return payload;
  }

  function snapValue(value) {
    return Math.round(value / gridSize) * gridSize;
  }

  function snapTransform(transform, enabled) {
    if (!enabled || !transform) return transform;
    const next = { ...transform };
    if (Number.isFinite(next.x)) next.x = snapValue(next.x);
    if (Number.isFinite(next.z)) next.z = snapValue(next.z);
    return next;
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

  function scaleRatio(asset, scale) {
    const authored = Number(asset?.defaultScale ?? 1);
    return authored > 0 ? scale / authored : 1;
  }

  function radiusOf(asset, scale, key) {
    return Math.max(0, Number(asset?.[key] ?? 0) * scaleRatio(asset, scale));
  }

  function edgeLimit() {
    return Number.isFinite(worldHalfSize)
      ? Math.max(0, worldHalfSize - edgePadding)
      : Infinity;
  }

  /** Reserved ground blocks everything, decor included. */
  function reservedConflict(assetId, x, z, scale) {
    const asset = catalog[assetId];
    const radius = radiusOf(asset, scale, "footprintRadius");
    for (const area of reservedAreas) {
      const minDistance = radius + Number(area.radius ?? 0);
      if (Math.hypot(x - area.x, z - area.z) < minDistance) {
        return { other: { x: area.x, z: area.z, label: area.label }, minDistance };
      }
    }
    return null;
  }

  /**
   * Buildings opt into a slope limit in the catalog. Sample the centre plus a
   * ring beneath the base; nature/decor with `maxGroundSlope: null` deliberately
   * skip this rule so the world can still be decorated on natural hillsides.
   */
  function groundConflict(assetId, x, z, scale) {
    const asset = catalog[assetId];
    if (asset?.maxGroundSlope == null || typeof getGroundHeight !== "function") {
      return null;
    }

    const maxSlope = Number(asset.maxGroundSlope);
    if (!Number.isFinite(maxSlope) || maxSlope < 0) return null;

    const authoredProbe = Number(
      asset.groundProbeRadius ?? asset.footprintRadius ?? 0
    );
    const radius = Math.max(0, authoredProbe * scaleRatio(asset, scale));
    if (radius <= 0.05) return null;

    const center = Number(getGroundHeight(x, z));
    if (!Number.isFinite(center)) return { slope: Infinity, maxSlope };

    const diagonal = radius * Math.SQRT1_2;
    const offsets = [
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
      [diagonal, diagonal],
      [-diagonal, diagonal],
      [diagonal, -diagonal],
      [-diagonal, -diagonal],
    ];

    let worstSlope = 0;
    for (const [ox, oz] of offsets) {
      const ground = Number(getGroundHeight(x + ox, z + oz));
      if (!Number.isFinite(ground)) return { slope: Infinity, maxSlope };
      worstSlope = Math.max(worstSlope, Math.abs(ground - center) / radius);
    }

    return worstSlope > maxSlope ? { slope: worstSlope, maxSlope } : null;
  }

  /**
   * Two copies of the same model sitting on nearly the same spot is never
   * intentional — for a flat thing like a path tile it also z-fights. They may
   * still overlap generously, just not occupy almost the same footprint.
   */
  function stackConflict(assetId, x, z, scale, ignoreId) {
    const asset = catalog[assetId];
    const minDistance = Math.max(
      0.2,
      radiusOf(asset, scale, "footprintRadius") * 0.9
    );
    for (const other of items) {
      if (
        other.id === ignoreId ||
        inactiveItemIds.has(other.id) ||
        other.assetId !== assetId
      ) continue;
      if (Math.hypot(x - other.x, z - other.z) < minDistance) {
        return { other, minDistance };
      }
    }
    return null;
  }

  function blockingConflict(assetId, x, z, scale, ignoreId) {
    const asset = catalog[assetId];
    const radius = radiusOf(asset, scale, "blockRadius");
    if (radius <= 0) return null; // decor and nature never fight for space

    for (const other of items) {
      if (other.id === ignoreId || inactiveItemIds.has(other.id)) continue;
      const otherAsset = catalog[other.assetId];
      if (!otherAsset) continue;
      const otherRadius = radiusOf(otherAsset, other.scale, "blockRadius");
      if (otherRadius <= 0) continue;
      const minDistance = radius + otherRadius + collisionGap;
      if (Math.hypot(x - other.x, z - other.z) < minDistance) {
        return { other, minDistance };
      }
    }
    return null;
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

    const footprint = radiusOf(asset, scale, "footprintRadius");
    const limit = edgeLimit();
    if (Math.abs(x) + footprint > limit || Math.abs(z) + footprint > limit) {
      return { ok: false, code: "edge", radius: footprint };
    }

    const reserved = reservedConflict(assetId, x, z, scale);
    if (reserved) {
      return { ok: false, code: "reserved", label: reserved.other.label };
    }

    const ground = groundConflict(assetId, x, z, scale);
    if (ground) {
      return {
        ok: false,
        code: "slope",
        slope: ground.slope,
        maxSlope: ground.maxSlope,
      };
    }

    // Buildings first: "ทับอาคารหลังอื่น" is more useful than "ซ้อนชิ้นเดิม"
    // when the thing in the way is a building that genuinely blocks.
    const conflict = blockingConflict(assetId, x, z, scale, ignoreId);
    if (conflict) {
      return {
        ok: false,
        code: "collision",
        conflictId: conflict.other.id,
        conflictAssetId: conflict.other.assetId,
      };
    }

    const stacked = stackConflict(assetId, x, z, scale, ignoreId);
    if (stacked) {
      return { ok: false, code: "stacked", conflictId: stacked.other.id };
    }

    return { ok: true, radius: footprint };
  }

  /**
   * Dragging used to stop dead the moment a position failed validation, which
   * felt like the object had snagged on nothing. The requested position is
   * pushed out of overlaps and clamped on every pass, so an obstacle beside the
   * island rim cannot push the object out and then have the final clamp shove it
   * straight back into the obstacle.
   */
  function resolvePlacement(assetId, transform, ignoreId = null) {
    const asset = catalog[assetId];
    if (!asset) return null;

    const scale = Number(transform?.scale ?? asset.defaultScale ?? 1);
    let x = Number(transform?.x);
    let z = Number(transform?.z);
    if (![x, z, scale].every(Number.isFinite)) return null;

    const footprint = radiusOf(asset, scale, "footprintRadius");
    const limit = Math.max(0, edgeLimit() - footprint);
    const clampToEdge = () => {
      x = Math.min(limit, Math.max(-limit, x));
      z = Math.min(limit, Math.max(-limit, z));
    };
    clampToEdge();

    for (let pass = 0; pass < 8; pass += 1) {
      const conflict =
        blockingConflict(assetId, x, z, scale, ignoreId) ??
        reservedConflict(assetId, x, z, scale) ??
        stackConflict(assetId, x, z, scale, ignoreId);
      if (!conflict) break;
      const { other, minDistance } = conflict;
      let dx = x - other.x;
      let dz = z - other.z;
      let length = Math.hypot(dx, dz);
      if (length < 1e-4) {
        dx = 1;
        dz = 0;
        length = 1;
      }
      // Push a hair past the limit. Landing exactly on it means the distance
      // can round back under when validatePlacement recomputes it.
      const clearance = minDistance + 1e-3;
      x = other.x + (dx / length) * clearance;
      z = other.z + (dz / length) * clearance;
      clampToEdge();
    }

    const resolved = { ...transform, x, z, scale };
    return validatePlacement(assetId, resolved, ignoreId).ok ? resolved : null;
  }

  /**
   * Models that failed to spawn remain in the saved layout so a temporary load
   * error never destroys the user's map. Mark them inactive instead: they do
   * not block placement or player movement until a later load succeeds.
   */
  function setInactiveItems(ids = []) {
    inactiveItemIds.clear();
    for (const id of ids) {
      if (items.some((item) => item.id === id)) inactiveItemIds.add(id);
    }
    return inactiveItemIds.size;
  }

  /** Circles the player cannot walk through, in world units. */
  function getColliders({ excludeIds = null } = {}) {
    const excluded = excludeIds instanceof Set ? excludeIds : new Set(excludeIds ?? []);
    const colliders = [];
    for (const item of items) {
      if (inactiveItemIds.has(item.id) || excluded.has(item.id)) continue;
      const asset = catalog[item.assetId];
      if (!asset) continue;
      const radius = radiusOf(asset, item.scale, "walkRadius");
      if (radius > 0) colliders.push({ x: item.x, z: item.z, radius });
    }
    return colliders;
  }

  function enable() {
    state.enabled = true;
    enterIdleContext(state);
    emitContext();
  }

  function disable({ saveLayout = true } = {}) {
    if (saveLayout) flushSave();
    state.enabled = false;
    enterIdleContext(state);
    onSelectionChange(null);
    onPreviewChange(null);
    emitContext();
  }

  /**
   * `transform` re-arms the ghost with the rotation/scale/position of the last
   * thing placed, so laying a row of path tiles is tap-drag-tap rather than
   * re-picking the asset from the strip every single time.
   */
  function beginPlacement(assetId, { transform = null } = {}) {
    const asset = catalog[assetId];
    if (!asset) throw new Error(`Unknown buildable asset: ${assetId}`);
    enterPlaceContext(state, assetId);
    onPreviewChange({ assetId, asset, transform });
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

    inactiveItemIds.delete(normalized.id);
    items.push(normalized);
    if (recordHistory) {
      pushBuilderHistory(state, { type: "add", item: { ...normalized } });
    }
    if (saveLayout) save({ immediate: true });
    // Context is the UI's business: adding an item no longer forces you out of
    // place mode, so the caller can keep placing.
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
    flushSave();
    enterIdleContext(state);
    onSelectionChange(null);
    emitContext();
  }

  function updateSelected(transform, { recordHistory = false } = {}) {
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

    if (recordHistory) {
      pushBuilderHistory(state, { type: "transform", item: { ...item } });
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
    const radius = radiusOf(asset, item.scale, "footprintRadius");
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
    inactiveItemIds.delete(removed.id);
    pushBuilderHistory(state, { type: "delete", item: { ...removed } });
    enterIdleContext(state);
    onSelectionChange(null);
    save({ immediate: true });
    emitContext();
    return removed;
  }

  /**
   * History was being recorded from day one but never read, so "ลบ" was
   * permanent. Returns what changed so the view can add/remove the model.
   */
  function undo() {
    const action = popBuilderHistory(state);
    if (!action) return null;

    if (action.type === "add") {
      const index = items.findIndex((entry) => entry.id === action.item.id);
      if (index < 0) return null;
      items.splice(index, 1);
      inactiveItemIds.delete(action.item.id);
      enterIdleContext(state);
      onSelectionChange(null);
      save({ immediate: true });
      emitContext();
      return { type: "removed", item: action.item };
    }

    if (action.type === "delete") {
      inactiveItemIds.delete(action.item.id);
      items.push({ ...action.item });
      enterIdleContext(state);
      onSelectionChange(null);
      save({ immediate: true });
      emitContext();
      return { type: "restored", item: action.item };
    }

    if (action.type === "transform") {
      const item = items.find((entry) => entry.id === action.item.id);
      if (!item) return null;
      Object.assign(item, action.item);
      save({ immediate: true });
      emitContext();
      return { type: "moved", item };
    }

    return null;
  }

  function load() {
    const raw = layoutStore.load();
    const usable = [];
    const unknownAssetIds = new Set();

    // An asset id that no longer exists in the catalog used to stay in the
    // layout forever: invisible, unselectable, unremovable, and re-saved every
    // time. Drop it from the live list and report it instead.
    for (const entry of raw) {
      const normalized = normalizeItem(entry);
      if (normalized) usable.push(normalized);
      else if (entry?.assetId) unknownAssetIds.add(entry.assetId);
    }

    loadReport = {
      total: raw.length,
      dropped: raw.length - usable.length,
      unknownAssetIds: [...unknownAssetIds],
      storeIssue: layoutStore.lastIssue ?? null,
    };

    inactiveItemIds.clear();
    items.splice(0, items.length, ...usable);
    state.history.length = 0;
    enterIdleContext(state);
    onSelectionChange(null);
    onPreviewChange(null);
    onLayoutChange(items, null);
    emitContext();
    return items;
  }

  /** Throws away the local layout and rebuilds from the given map objects. */
  function resetTo(objects = []) {
    inactiveItemIds.clear();
    items.splice(0, items.length);
    for (const object of objects) {
      const normalized = normalizeItem(object);
      if (normalized) items.push(normalized);
    }
    state.history.length = 0;
    enterIdleContext(state);
    onSelectionChange(null);
    onPreviewChange(null);
    save({ immediate: true });
    onItemsRestored(items);
    emitContext();
    return items;
  }

  return {
    items,
    enable,
    disable,
    save,
    flushSave,
    load,
    resetTo,
    undo,
    snapTransform,
    validatePlacement,
    resolvePlacement,
    setInactiveItems,
    getColliders,
    beginPlacement,
    cancelPlacement,
    addItem,
    selectItem,
    clearSelection,
    updateSelected,
    duplicateSelected,
    deleteSelected,
    /** What the last load() had to throw away, or null. */
    get loadReport() {
      return loadReport;
    },
    get canUndo() {
      return state.history.length > 0;
    },
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
