# Liora's Farm

Mobile-first 2.5D/isometric farming RPG prototype built with Three.js.

## Locked baseline

The current approved checkpoint is **Liora Isometric Depth Fixed**.

Locked behavior:
- Perspective 3/4 isometric camera
- original joystick/world-axis movement
- Grass `renderOrder = 0`
- Dirt Path `renderOrder = 1`, `y = 0.003`, `alphaTest = 0.28`, `depthWrite = true`
- Liora `renderOrder = 10`, `depthTest = true`, `depthWrite = true`
- Idle / Walk / Run switch automatically
- Pick Up / Pull Radish / Hammer / Mirror are action buttons

See `docs/BASELINE.md` before changing camera, movement, or depth.

## Project structure

```text
liora-farm/
├── index.html
├── README.md
├── ASSET_GUIDE.md
├── docs/
│   └── BASELINE.md
├── src/
│   ├── main.js
│   ├── config.js
│   ├── entities/
│   │   └── player.js
│   └── systems/
│       ├── camera.js
│       └── input.js
├── styles/
│   └── main.css
└── assets/
    ├── models/
    │   └── player/
    │       └── liora_all_animations_1k.glb
    ├── sprites/
    └── textures/
        ├── grass.webp
        ├── dirt.webp
        └── dirt_path_refined.webp
```

## Asset baseline

- `assets/textures/grass.webp` — approved grass
- `assets/textures/dirt.webp` — approved dirt source
- `assets/textures/dirt_path_refined.webp` — approved path overlay
- `assets/models/player/liora_all_animations_1k.glb` — Liora rig + 7 animations

## Maintenance rules

1. Keep configuration and stable paths in `src/config.js`.
2. Keep input/camera logic under `src/systems/`.
3. Keep character loading/animation logic under `src/entities/`.
4. Never embed production GLB or textures as Base64 in HTML/JS.
5. Change one subsystem at a time and test on mobile before merging.
6. Preserve the locked grass, path, camera, movement, and depth setup unless intentionally starting a new baseline.
