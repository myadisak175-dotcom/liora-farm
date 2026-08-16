# Liora's Farm — architecture

One page, one scene, one renderer. `index.html` is the only entry point.
There are no separate builder / test pages any more.

## Layout

```text
index.html              single entry: canvas + play HUD + build panel
styles/main.css         all UI styling
maps/home-island.json   default island layout (data only)
assets/textures/        ground surfaces — the list lives in config.js groundPaint.layers
assets/models/player/   Liora (7 animations)
assets/models/builder/  placeable GLBs — path lives in config.js ASSETS.modelDir
src/
  config.js             every tunable number and asset path
  main.js               bootstrap, mode switching, render loop
  entities/player.js    model load + animation state
  zones/home-island.js  builds the world: island + terrain + paint + farm plot
  systems/              gameplay + rendering, one concern per file
  tools/test/           headless checks — node tools/test/run.mjs
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

The Home Island is **56 x 56 m**. `systems/terrain-height.js` owns a 113x113
`Float32Array` over that island at 0.5 m spacing and one bilinear `sample()`.
That single array is both the shape of the mesh and the answer to `getHeight()`.

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
on a faster phone. Undo keeps whole-grid snapshots (about 50 KB each), bounded by `sculpt.undoLimit` in
`config.js` — far simpler than replaying strokes, and instant. The save is Int16 centimetres in
base64, about 34 KB.

`movement.js` refuses ground steeper than `maxWalkSlope` and tries each axis
alone first, which reads as sliding along the contour. The rule is symmetric so
a sculpted pit cannot become a trap.

Surface variety comes from `systems/ground-paint.js`: canvas splat maps
blended inside the *single* ground material via `onBeforeCompile`. No overlay
tiles, so edges stay soft. Strokes are stored as data and replayed, which is
why undo works and why the paint survives a reload.

Layers are declared once in `CONFIG.groundPaint.layers` — adding a surface is
one row there and an image file, nothing else. Three painted layers share one
RGB splat page and pages are allocated only when painted on; the base layer
(grass) has no channel of its own, which is what makes its brush the eraser.
All surfaces ship to the GPU as one `sampler2DArray` so the layer count does
not eat texture units. See `docs/GROUND-LAYERS.md`.

## Build mode

Four files, strictly separated:

- `asset-catalog.js` — what can be placed. Adding an asset = one entry here.
- `asset-loader.js` — lazy GLB load + cache.
- `builder-state.js` / `builder-controller.js` — the rules. No DOM, no Three.js.
- `builder-view.js` — the Three.js side: spawn, ghost preview, selection tint.
- `builder-ui.js` — the only file that touches builder DOM and touch events.
  It also owns the HUD height budget: the collapse chevron, the "เพิ่มเติม"
  drawer and the rule that the action row never scrolls.
- `sculpt-controls.js` — sculpt presets and fine sliders. Renders into
  `#sculpt-extra` (the drawer) only — never into the four-tool row.

Saved layouts contain data only: `id`, `assetId`, `x`, `z`, `rotation`, `scale`.
Never a mesh, never a material.

## Cost per placed object

Two rules keep a decorated island from falling off a phone. Both are per
*asset*, never per placed copy — that distinction is the whole point.

**One material per asset, not per object.** Wind uniforms (height frame, bend
axis, profile weights) describe an asset, so every copy of a pine tree can and
must share one material instance. Three.js only skips a full uniform upload
while consecutive draws share a material, so cloning per object cost a full
upload per object per frame and bought nothing. `wind-system.js` caches by
asset id; those materials outlive the objects using them and are therefore
never flagged `disposeWithBuilderView` — deleting one tree must not blank every
other tree of the same kind.

**Only what reads casts a shadow.** `CONFIG.shadows.minCasterHeight` (0.9 m).
The sun's shadow camera already covers just 24 x 24 m around the player, but
everything inside that box is drawn again into the depth pass, and ground cover
is exactly what gets placed in the hundreds. Grass, flowers and low bushes set
`castShadow: false` in the catalog; `asset-loader.js` reads it. Receiving is
never disabled — ground cover still has to darken under a tree.

Measure before changing either: `?perf=1` turns on the frame readout
(`ui/perf-hud.js`) and it stays on across reloads until `?perf=0`. It shows
average FPS, the **worst frame** in the sample window, draw calls, triangles and
program/geometry/texture counts. Worst-frame is the number that matters: a
60 fps average with one 90 ms frame per second reads as a stutter and an average
alone hides it completely.

## Persistence

- Layout → `localStorage` (`liora.island-layout.v1`), seeded from
  `maps/home-island.json` on first run.
- Ground paint → `localStorage` (`liora.ground-paint.v1`).
- Sculpted terrain → `localStorage` (`liora.terrain-height.v1`).
- Farm → `localStorage` (`liora.farm.v1`).
- **บันทึกแผนที่** downloads `home-island.json` so a layout can be committed
  to the repo as the new default.

All four go through `systems/local-store.js`, which owns one rule: **a payload
we cannot read is copied to `<key>.backup`, never dropped.** Only the layout
store used to do this — a save from another schema version was discarded and
the next autosave then overwrote it, taking an island with it. Paint, terrain
and the farm had the identical hole, because the lesson lived inside one file
instead of in a shared policy. `main.js` reports any rescued store on boot;
saying nothing is how the loss went unnoticed the first time.

`local-store.js` owns bytes, not meaning: it checks `version` and nothing else.
A caller that parses a correctly versioned payload and then finds the body
unusable calls `rejectLoaded()` to get the same protection. Save schemas are
byte-for-byte unchanged.

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
