# Liora's Farm — architecture

One page, one scene, one renderer. `index.html` is the only entry point.
There are no separate builder / test pages any more.

## Layout

```text
index.html              single entry: canvas + play HUD + build panel
styles/main.css         all UI styling
maps/home-island.json   default island layout (data only)
assets/textures/        ground surfaces: grass, dirt, sand, rock
assets/models/player/   Liora (7 animations)
builder/assets/models/  placeable GLBs — path lives in config.js ASSETS.modelDir
src/
  config.js             every tunable number and asset path
  main.js               bootstrap, mode switching, render loop
  entities/player.js    model load + animation state
  zones/home-island.js  builds the world: island + terrain + paint + farm plot
  systems/              gameplay + rendering, one concern per file
  editor/               the build mode
```

## Modes

`document.body.dataset.mode` is either `play` or `build`. `main.js` owns the
switch and nothing else reads it directly.

- **play** — joystick, action buttons, one-finger drag orbits the camera.
- **build** — build panel visible, one-finger drag belongs to the builder.
  Two-finger pinch still controls the camera in both modes.

`cameraController.setOrbitEnabled(false)` is the single line that hands the
one-finger gesture over. There is no event-priority fight between the two.

## Ground

The ground is one flat `PlaneGeometry`. `terrain.getHeight()` always returns 0 —
it stays in the API so movement and placement never need to know that.

Surface variety comes from `systems/ground-paint.js`: a canvas splat map
(R = dirt, G = sand, B = rock, black = grass) blended inside the *single*
ground material via `onBeforeCompile`. No overlay tiles, so edges stay soft.
Strokes are stored as data and replayed, which is why undo works and why the
paint survives a reload.

## Build mode

Four files, strictly separated:

- `asset-catalog.js` — what can be placed. Adding an asset = one entry here.
- `asset-loader.js` — lazy GLB load + cache.
- `builder-state.js` / `builder-controller.js` — the rules. No DOM, no Three.js.
- `builder-view.js` — the Three.js side: spawn, ghost preview, selection tint.
- `builder-ui.js` — the only file that touches builder DOM and touch events.

Saved layouts contain data only: `id`, `assetId`, `x`, `z`, `rotation`, `scale`.
Never a mesh, never a material.

## Persistence

- Layout → `localStorage` (`liora.island-layout.v1`), seeded from
  `maps/home-island.json` on first run.
- Ground paint → `localStorage` (`liora.ground-paint.v1`).
- **บันทึกแผนที่** downloads `home-island.json` so a layout can be committed
  to the repo as the new default.

## Rules

1. New placeable content goes in the catalog, never hard-coded into the UI.
2. Numbers live in `config.js`, not scattered through systems.
3. `builder-controller` must stay free of DOM and Three.js.
4. A system file does one thing. If it grows a second job, split it.
5. No second HTML page. New features become a mode or a system, not a page.
