# Liora's Farm

Top-down 3D farming game for mobile browsers. Three.js ES modules, no build step.

Live: https://myadisak175-dotcom.github.io/liora-farm/

## Run locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` on the phone. A server is required — ES modules and `fetch` do not work from `file://`.

## What works

- **เล่น** — walk, run, action animations, orbit camera, day/night clock.
- **สร้าง → วางของ** — place assets, drag to move, rotate, scale, duplicate, delete. Autosaves.
- **สร้าง → ระบายพื้น** — free-brush multiple ground surfaces over grass, with undo.
- **สร้าง → ปั้นพื้น** — raise, lower, smooth and flatten terrain. Terrain follows real mesh vertices, saves locally and exports with the map.
- **บันทึกแผนที่** — exports objects, ground paint and sculpted terrain in `home-island.json`.

## Frame cost readout

```text
http://localhost:8000/?perf=1
```

Shows average FPS, the worst frame in the last quarter second, draw calls,
triangles and program/geometry/texture counts. It sticks across reloads (a
phone has no dev tools worth using) — `?perf=0` turns it off again. Worst-frame
is the number to watch: an average hides a once-a-second stutter completely.

## Smoke test

Open:

```text
http://localhost:8000/selftest.html
```

The smoke test boots the real game in an iframe and checks the mobile UI contract: the game boots, Build mode opens, all four sculpt tools are present (and only those four — presets belong in the drawer), no tab lets the panel exceed 40% of the screen, collapsing drops it under 15%, primary controls fit inside the viewport at 44px, the ground picker hits and is fast enough to drag against, `tick()` reports terrain changes, and switching back to Play hides the builder again. It does not replace hands-on mobile testing for drag, pinch or sculpt feel.

## Adding a placeable asset

1. Upload the `.glb` to `assets/models/builder/`.
2. Add one entry to `src/editor/asset-catalog.js`.

That is the whole process. No UI code changes.

## Offline / flaky networks

`index.html` prefers a local copy of Three.js and falls back to the CDN. To
make the game work with no network at all, drop the r180 build in:

```text
vendor/three/three.module.js
vendor/three/addons/loaders/GLTFLoader.js
```

Nothing else changes — the import map is built at boot from whichever is there.

## Middle-ground trees

`src/systems/background/tree-line.js` scatters a seeded ring of trees between
the farm edge and the first mountain band, which was 128 m of empty ground.
Add a kind of tree with one line in `CONFIG.treeLine.items` — a catalog id from
`editor/nature-catalog-v2.js` and a weight. `count` is a total across the whole
ring; only ~5% is on screen, so per-frame cost is roughly `count * 0.05 * tris`.

See `docs/MIDDLE-GROUND.md` before changing the sector count — the chunking is
what makes frustum culling work at all.

## Module rules

No build step means no bundler, so two mistakes fail silently in the browser
and `tools/test/module-graph.mjs` fails the build on them instead:

- **Never put `?v=` on a module specifier.** Cache-busting belongs on assets
  fetched by URL. On an `import`, it forks module identity and defeats the
  import map. A config aliased this way was tuned twice while the game kept
  loading the untuned file, with no error in the console.
- **Never alias a local module in the import map.** The import map resolves
  three.js and nothing else. Tuned values go back into `src/config.js`, where
  the tests can see them — every test imports `src/config.js` directly, so
  anything swapped in over it is invisible to the whole suite.

## Taking the game apart

`src/systems/registry.js` owns the frame loop, the listeners and teardown.
Systems register with `systems.add(name, system)`, where a system is anything
with an optional `update(delta)` and an optional `dispose()`; the registration
order *is* the frame order and is load-bearing.

Nothing calls `window.__liora.dispose()` yet. It exists so that loading a
second map without a page reload is a change to `main.js` rather than a hunt
through every `addEventListener` in the repo. Attach listeners through
`systems.listen()` or a local `bind` helper — never bare `addEventListener`.

## Notes

- Binary files (`.glb`, `.webp`) must stay binary; do not paste them through text-only tooling.
- `stable-liora-2026-08-14` is the rollback baseline from before terrain sculpting.
- See `docs/ARCHITECTURE.md` and `docs/TERRAIN-PLAN.md` before changing the terrain system.

## HUD budget test

```text
http://localhost:8000/tools/test/builder-hud.test.html
```

Runs the real `builder-ui.js` and `sculpt-controls.js` against the real CSS
with a stubbed three.js, and asserts the mobile height contract at 375x667: no
tab may take more than 40% of the screen, collapsing drops it under 15%, the
sculpt tool row holds exactly four buttons (presets belong in the drawer), and
every button stays at least 40px tall. Fast, no CDN, no GPU.
