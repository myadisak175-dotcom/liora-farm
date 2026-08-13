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

Wire the mode buttons with `#mode-bar [data-mode]`, never a bare
`[data-mode]` — that selector also matches `<body data-mode="play">`, so every
tap anywhere on the screen re-ran `setMode()`, which re-entered build mode and
cancelled whatever was being placed. `setMode` also returns early when the mode
has not actually changed.

Play mode is read-only, not "build mode with the panel hidden": `builderUI`
ignores canvas pointer events unless its panel is showing, so a tap in Play
mode cannot select, move or paint.

- **play** — joystick, action buttons, one-finger drag orbits the camera.
- **build** — build panel visible, one-finger drag belongs to the builder.
  Two-finger pinch still controls the camera in both modes.

`cameraController.setOrbitEnabled(false)` is the single line that hands the
one-finger gesture over. There is no event-priority fight between the two.

## Ground

`systems/terrain-height.js` owns an 85x85 `Float32Array` over the island (0.5 m
spacing) and one bilinear `sample()`. That single array is both the shape of the
mesh and the answer to `getHeight()`.

Heights are written into the plane's **position attribute**, never a vertex
shader. A shader-displaced ground looks right and breaks everything else: the
raycast still hits the flat original, so tapping the ground returns the wrong
point, and objects and the player float or sink. Moving real vertices keeps
picking, shadows, normals and placement correct for free.

The mesh is the usual `PlaneGeometry` rotated -90° about X, so local (x, y, z)
appears in the world as (x, z, -y) — local Z is world height. `applyTo()` reads
each vertex's own coordinates rather than trusting the generator's vertex order.

Constraints applied on every brush stroke:

- an edge mask eases heights to 0 near the rim, so the island silhouette stays
  glued to the fixed cliff geometry underneath;
- reserved areas (the farm beds) stay dead flat with a soft ramp around them;
- heights clamp to `sculpt.minHeight`/`maxHeight`.

Sculpting is rate-based: `beginStroke` / `moveTo` / `tick(dt)` / `endStroke`.
Per-event brushes feel dead when the finger holds still and bite twice as hard
on a faster phone. Undo keeps whole-grid snapshots (29 KB each, 12 deep) — far
simpler than replaying strokes, and instant. The save is Int16 centimetres in
base64, about 19 KB.

`movement.js` refuses ground steeper than `maxWalkSlope` and tries each axis
alone first, which reads as sliding along the contour. The rule is symmetric so
a sculpted pit cannot become a trap.

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

## Self test

`selftest.html` boots the real `index.html` in a hidden iframe and drives it
with synthetic pointer events: place an object, drag it, paint, switch modes.
It asserts what only shows up under a finger — buttons inside the viewport,
44px touch targets, no overlapping HUD, an action that actually persists.

Run it on the phone after touching `main.js`, `builder-ui.js` or `main.css`.
Unit tests cannot see any of this: the two bugs that made build mode unusable
(the place button sitting off-screen, and every tap cancelling the placement)
both passed every unit test that existed.

## Rules

1. New placeable content goes in the catalog, never hard-coded into the UI.
2. Numbers live in `config.js`, not scattered through systems.
3. `builder-controller` must stay free of DOM and Three.js.
4. A system file does one thing. If it grows a second job, split it.
5. No second HTML page. New features become a mode or a system, not a page.
