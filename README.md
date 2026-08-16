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
