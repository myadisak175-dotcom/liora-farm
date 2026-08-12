# Liora's Farm

Top-down 3D farming game for mobile browsers. Three.js ES modules, no build step.

Live: https://myadisak175-dotcom.github.io/liora-farm/

## Run locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` on the phone. A server is required — ES modules
and `fetch` do not work from `file://`.

## What works

- **เล่น** — walk, run, 4 action animations, orbit camera, day/night clock.
- **สร้าง → วางสิ่งของ** — place 9 assets, drag to move, rotate, scale,
  duplicate, delete. Autosaves.
- **สร้าง → ระบายพื้น** — free-brush dirt / sand / rock over grass, with undo.
- **บันทึกแผนที่** — exports `home-island.json` to commit as the new default.

## Adding a placeable asset

1. Upload the `.glb` to `builder/assets/models/builder/`.
2. Add one entry to `src/editor/asset-catalog.js`.

That is the whole process. No UI code changes.

## Notes

- Binary files (`.glb`, `.webp`) must be uploaded through the GitHub web UI.
  Text-based tooling corrupts them — a ~15 KB `.glb` or `.webp` is a corrupt file.
- See `docs/ARCHITECTURE.md` before adding systems.
