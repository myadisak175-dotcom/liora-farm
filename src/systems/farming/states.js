// Shared save-state vocabulary. UI and progression can read the farm without
// importing the renderer or maintaining another copy of its saved state.
export const SOIL_STATES = Object.freeze({
  PLAIN: "plain",
  TILLED: "tilled",
  WATERED: "watered",
});

export const CROP_STATES = Object.freeze({
  EMPTY: "empty",
  GROWING: "growing",
  RIPE: "ripe",
});
