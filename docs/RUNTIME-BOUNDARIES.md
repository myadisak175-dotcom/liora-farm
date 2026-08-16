# Liora Farm — Runtime Boundaries

`src/main.js` is the composition root. Its job is to create the scene/runtime objects, connect dependencies, switch Play/Build mode, own page lifecycle hooks, and run the frame loop. Feature logic should not accumulate there.

## Extracted runtime modules

- `src/editor/layout-runtime.js`
  - fetches the committed default map
  - restores/spawns Builder objects
  - refreshes inactive-object/collider state after loading
  - resets the object layout while preserving paint/terrain
  - exports the current map JSON
  - surfaces layout load/version warnings through injected UI callbacks

- `src/systems/player-runtime.js`
  - runs movement
  - chooses normal locomotion animation when no special action is active
  - updates the animation mixer
  - updates run/water FX, contact shadow, camera target, and player-follow lighting
  - exposes special-animation playback without owning DOM

- `src/ui/farm-ui.js`
  - polls the nearest crop target at the existing 0.2 s cadence while Play mode is active
  - renders the farm action label/readiness and pouch count
  - bridges the farm button to plant/harvest special animations and crop actions

- `src/ui/player-actions.js`
  - binds non-farm action buttons to special animations and their active class

- `src/ui/notifications.js`
  - owns status/toast text, classes, and timers

## What stays in `main.js`

- Three.js renderer/scene/camera creation
- zone/system construction and dependency injection
- boot/degraded diagnostics
- Builder setup and the Build/Play mode switch
- pagehide/visibility persistence flush
- resize handling
- the frame orchestration order:
  1. day/night
  2. world refresh
  3. player runtime
  4. crop growth
  5. farm target/HUD
  6. camera
  7. sky
  8. render

## Refactor rule

When a new feature needs more than wiring in `main.js`, create or extend a focused module and inject the dependencies it needs. Do not move existing save schemas, gameplay timings, labels, animation names, or update ordering during a structural refactor. Structural work and behavior work should be separate PRs.

`tools/test/runtime-modules.test.html` guards these boundaries and checks that the extracted subsystem function bodies do not drift back into `main.js`.
