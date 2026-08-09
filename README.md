# Liora's Farm

Mobile-first 2.5D farming RPG prototype built with Three.js.

## Current baseline

Locked environment assets:
- `assets/textures/grass.webp` — approved main grass texture
- `assets/textures/dirt.webp` — approved dirt source texture
- `assets/textures/dirt_path_refined.webp` — approved refined path overlay

Current gameplay:
- elevated 3/4 camera
- mobile joystick + keyboard movement
- zoom buttons + pinch-to-zoom
- animated 3D-player loader with safe placeholder fallback

## Player model

The player loader expects:

`assets/models/player/meadow_maiden_walk.glb`

The original Meshy walk GLB is about 55 MB because it contains an 8192×8192 embedded texture. For mobile web, use the optimized build with the embedded texture reduced to 1024×1024. The geometry, rig and Casual Walk animation are preserved.

Current test model stats:
- about 31,125 triangles
- one skinned mesh
- one animation: `Armature|Casual_Walk|baselayer`
- target player height normalized at runtime to 1.7 world units

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
    │   └── player/
    │       └── meadow_maiden_walk.glb
    ├── sprites/
    └── textures/
        ├── grass.webp
        ├── dirt.webp
        └── dirt_path_refined.webp
```

## Maintenance rules

1. Keep `index.html` small; game logic belongs in `src/`.
2. Never embed production GLB/images as Base64 in HTML/JS.
3. Approved assets use stable paths under `assets/`.
4. Test one asset at a time before expanding the map.
5. Preserve the approved grass texture and scale unless intentionally revisiting the art direction.
6. Optimize Meshy textures before committing large GLBs.
7. Keep player loading isolated so the environment still runs if a model is missing.
