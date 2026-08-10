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

  function addItem(item) {
    const normalized = {
      id: item.id ?? crypto.randomUUID(),
      assetId: item.assetId,
      x: Number(item.x),
      z: Number(item.z),
      rotation: Number(item.rotation ?? 0),
      scale: Number(item.scale ?? 1),
    };
    items.push(normalized);
    pushBuilderHistory(state, { type: "add", item: { ...normalized } });
    save();
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
    Object.assign(item, transform);
    save();
    onSelectionChange(item);
    return item;
  }

  function duplicateSelected(offset = { x: 0.8, z: 0.8 }) {
    const item = items.find((entry) => entry.id === state.selectedObjectId);
    if (!item) return null;
    return addItem({
      ...item,
      id: crypto.randomUUID(),
      x: item.x + offset.x,
      z: item.z + offset.z,
    });
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
