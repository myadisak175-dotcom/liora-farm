# Liora's Farm

Mobile-first 2.5D farming RPG prototype built with Three.js.

## Current baseline

This repository is intentionally kept small and modular.

Locked environment assets:
- `assets/textures/grass.webp` — approved main grass texture
- `assets/textures/dirt.webp` — approved dirt source texture
- `assets/textures/dirt_path_refined.webp` — approved refined path overlay

Current gameplay baseline:
- elevated 3/4 camera
- mobile joystick
- keyboard movement
- zoom buttons and pinch-to-zoom
- temporary capsule player

## Project structure

```text
liora-farm/
├── index.html
├── README.md
├── ASSET_GUIDE.md
├── src/
│   └── main.js
├── styles/
│   └── main.css
└── assets/
    ├── models/
    ├── sprites/
    └── textures/
        ├── grass.webp
        ├── dirt.webp
        └── dirt_path_refined.webp
```

## Maintenance rules

1. Keep `index.html` small; game logic belongs in `src/`.
2. Never embed GLB, images, or textures as Base64 in HTML/JS.
3. Approved assets go in `assets/` and use stable names.
4. Test one new asset at a time before adding it to the baseline.
5. Preserve the approved grass texture and scale unless intentionally revisiting the art direction.
6. Prefer WebP/KTX2 textures and optimized GLB assets for mobile web performance.
