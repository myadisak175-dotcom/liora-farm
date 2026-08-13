# Terrain Sculpt Plan

## Goal

Let Liora Farm reshape the island directly on mobile without breaking picking, movement, placed objects, farm beds, or map persistence.

## Architecture

`src/systems/terrain-height.js` owns the height field. The terrain mesh and gameplay both sample the same height data. The geometry vertices are moved for real rather than displaced only in a shader, so raycasting, normals, shadows and object placement stay aligned with what the player sees.

`src/systems/terrain.js` builds the subdivided ground mesh. `src/systems/brush-cursor.js` draws the brush footprint. `src/editor/builder-ui.js` owns touch gestures and ensures an active paint/sculpt drag is finished before multi-touch camera controls take over.

## Tools

- Raise
- Lower
- Smooth
- Flatten

The island rim eases back to zero height so it remains attached to the fixed cliff geometry. Reserved areas such as the farm plot remain flat.

## Persistence

Terrain height is quantized to Int16 centimetres and saved in `localStorage` under `liora.terrain-height.v1`. `home-island.json` may include `terrainHeight`; if that field is absent the default terrain is flat. Exported maps include the current terrain height, ground paint and placed objects.

Pending saves are flushed on `pagehide` so a quick app/page switch does not lose the last sculpt stroke.

## Mobile gesture rule

One finger edits the active builder tool. Two fingers belong to the camera. When a second pointer appears, the current builder drag is finished first: paint stroke ends, sculpt RAF stops and terrain stroke ends, or a moved object flushes its save.

## Validation

Before treating a terrain version as stable:

1. Parse every JavaScript module.
2. Parse the default map JSON.
3. Verify terrain export/import round-trip within 1 cm.
4. Verify reserved farm ground cannot be sculpted.
5. Run `selftest.html` in a browser.
6. Do a hands-on phone pass for drag, pinch, brush feel, placing on slopes and Play-mode lockout.
