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
- **สร้าง → ระบายพื้น** — free-brush dirt / sand / rock over grass, with undo.
- **สร้าง → ปั้นพื้น** — raise, lower, smooth and flatten terrain. Terrain follows real mesh vertices, saves locally and exports with the map.
- **บันทึกแผนที่** — exports objects, ground paint and sculpted terrain in `home-island.json`.

## Smoke test

Open:

```text
http://localhost:8000/selftest.html
```

The smoke test boots the real game in an iframe and checks the key mobile UI contract: the game boots, Build mode opens, the Sculpt tab exists, all four sculpt tools are present, primary controls fit inside the viewport, and switching back to Play hides the builder again. It does not replace hands-on mobile testing for drag, pinch or sculpt feel.

## Adding a placeable asset

1. Upload the `.glb` to `builder/assets/models/builder/`.
2. Add one entry to `src/editor/asset-catalog.js`.

That is the whole process. No UI code changes.

## Notes

- Binary files (`.glb`, `.webp`) must stay binary; do not paste them through text-only tooling.
- `stable-liora-2026-08-14` is the rollback baseline from before terrain sculpting.
- See `docs/ARCHITECTURE.md` and `docs/TERRAIN-PLAN.md` before changing the terrain system.
