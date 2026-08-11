# Liora's Farm

Mobile-first 2.5D/isometric farming RPG prototype built with Three.js.

## Locked baseline

The current approved checkpoint is **Liora Orbit Movement Perfect**.

Locked behavior:
- Perspective 3/4 isometric default/reset camera
- 1-finger orbit camera
- 2-finger pinch zoom
- Camera-relative joystick movement after camera rotation
- Camera dead zone + smooth follow
- Walk speed `2.4` world units/sec
- Run speed `5.2` world units/sec
- Walk animation playback `0.9x`
- Dynamic shadow follows Liora
- Grass and dirt path both receive shadows
- Grass `renderOrder = 0`
- Dirt Path `renderOrder = 1`, `y = 0.003`, `alphaTest = 0.28`, `depthWrite = true`
- Liora `renderOrder = 10`, `depthTest = true`, `depthWrite = true`
- Idle / Walk / Run switch automatically
- Pick Up / Pull Radish / Hammer / Mirror are action buttons

Runtime checkpoint for this approved feel: `a59c1c2a14b61da6df7ef8d47db13dde6521945b`.

See `docs/BASELINE.md` before changing camera, movement, animation speed, depth, or shadows.

## Current canonical page

The root page now opens the combined best-of build at `builder/best-of.html`. It contains the same playable Home Island and Builder, so placed objects, river, bridge and gameplay are no longer split between separate pages. See `docs/BEST_OF.md` for the merge boundary.

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
│       ├── input.js
│       └── lighting.js
├── styles/
│   └── main.css
└── assets/
    ├── models/
    │   └── player/
    │       └── liora_all_animations_web.glb
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
- `assets/models/player/liora_all_animations_web.glb` — optimized Liora rig + 7 animations for mobile web

## Maintenance rules

1. Keep configuration and stable paths in `src/config.js`.
2. Keep input/camera/lighting logic under `src/systems/`.
3. Keep character loading/animation logic under `src/entities/`.
4. Never embed production GLB or textures as Base64 in HTML/JS.
5. Change one subsystem at a time and test on mobile before accepting it.
6. Preserve the locked camera, movement, walk speed, animation speed, shadow, grass, path, and depth setup unless intentionally starting a new baseline.
