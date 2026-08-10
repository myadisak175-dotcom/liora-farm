export const BUILDER_MODES = Object.freeze({
  BUILD: "build",
  EDIT: "edit",
  DELETE: "delete",
});

export function createBuilderState() {
  return {
    enabled: false,
    mode: BUILDER_MODES.BUILD,
    selectedAssetId: null,
    selectedObjectId: null,
    previewObjectId: null,
    snapMode: "free",
    history: [],
    maxHistory: 50,
  };
}

export function pushBuilderHistory(state, action) {
  state.history.push(action);
  if (state.history.length > state.maxHistory) state.history.shift();
}

export function resetBuilderSelection(state) {
  state.selectedAssetId = null;
  state.selectedObjectId = null;
  state.previewObjectId = null;
}
