export const BUILDER_CONTEXTS = Object.freeze({
  IDLE: "idle",
  PLACE: "place",
  EDIT: "edit",
});

export function createBuilderState({ historyLimit = 50 } = {}) {
  return {
    enabled: false,
    context: BUILDER_CONTEXTS.IDLE,
    selectedAssetId: null,
    selectedObjectId: null,
    previewObjectId: null,
    history: [],
    maxHistory: historyLimit,
  };
}

export function pushBuilderHistory(state, action) {
  state.history.push(action);
  if (state.history.length > state.maxHistory) state.history.shift();
}

export function popBuilderHistory(state) {
  return state.history.pop() ?? null;
}

export function enterIdleContext(state) {
  state.context = BUILDER_CONTEXTS.IDLE;
  state.selectedAssetId = null;
  state.selectedObjectId = null;
  state.previewObjectId = null;
}

export function enterPlaceContext(state, assetId) {
  state.context = BUILDER_CONTEXTS.PLACE;
  state.selectedAssetId = assetId;
  state.selectedObjectId = null;
  state.previewObjectId = null;
}

export function enterEditContext(state, objectId) {
  state.context = BUILDER_CONTEXTS.EDIT;
  state.selectedObjectId = objectId;
  state.selectedAssetId = null;
  state.previewObjectId = null;
}

export function resetBuilderSelection(state) {
  enterIdleContext(state);
}
