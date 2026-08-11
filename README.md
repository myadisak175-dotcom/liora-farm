# Liora's Farm

Mobile-first 2.5D/isometric farming RPG prototype built with Three.js.

## Locked gameplay baseline

The approved movement/camera feel remains unchanged:

- Perspective 3/4 isometric camera
- 1-finger orbit camera
- 2-finger pinch zoom
- Camera-relative joystick movement
- Camera dead zone + smooth follow
- Walk speed `2.4` world units/sec
- Run speed `5.2` world units/sec
- Walk animation playback `0.9x`
- Dynamic shadow follows Liora
- Idle / Walk / Run switch automatically
- Pick Up / Pull Radish / Hammer / Mirror action animations

See `docs/BASELINE.md` before changing camera, movement, animation speed, depth, or shadows.

## Canonical page

The root page opens `builder/best-of.html`, which combines the playable Home Island and Builder. `builder/2d.html` remains a lightweight fallback/prototype and is not the canonical game build.

## Liora Engine v1 structure

```text
liora-farm/
├── index.html
├── assets/
│   ├── catalog.json
│   ├── models/
│   │   ├── player/
│   │   │   └── liora_all_animations_web.glb
│   │   └── builder/            # canonical placeable GLB assets
│   └── textures/
├── maps/
│   └── home-island.json
├── src/
│   ├── main.js                 # production runtime composition + loop
│   ├── config.js               # approved tuning + stable asset paths
│   ├── animation/
│   │   └── animation-controller.js
│   ├── core/
│   │   └── README.md           # runtime/editor dependency boundary
│   ├── entities/
│   │   └── player.js
│   ├── zones/
│   │   └── home-island.js
│   ├── systems/
│   │   ├── movement.js
│   │   ├── camera.js
│   │   ├── input.js
│   │   ├── lighting.js
│   │   ├── sky.js
│   │   ├── day-night.js
│   │   ├── run-fx.js
│   │   ├── contact-shadow.js
│   │   └── ground/
│   └── editor/                 # Builder only
├── builder/
│   ├── best-of.html            # integrated mobile test/build page
│   └── assets/                 # legacy standalone-test copies only
└── docs/
```

## Architecture rules

1. `main.js` coordinates runtime systems; feature implementations belong in their own modules.
2. Stable tuning and core asset paths live in `src/config.js`.
3. Character/model loading belongs in `src/entities/`; animation playback mechanics belong in `src/animation/`.
4. Reusable gameplay/rendering behavior belongs under `src/systems/`.
5. Zone-specific composition belongs under `src/zones/`.
6. Builder/editor code stays under `src/editor/`; runtime modules must not depend on Editor UI internals.
7. Production Builder models live under `assets/models/builder/` and are registered through `assets/catalog.json`.
8. Saved maps contain stable IDs/transforms, never Three.js object references.
9. Production GLB/textures are referenced by path; do not embed growing Base64 assets into production HTML.
10. Change one subsystem at a time and test on mobile before accepting a new baseline.

## Animation boundary

`src/entities/player.js` keeps the stable Player API used by the current game (`fadeTo`, `playSpecial`, `isSpecial`, `mixer`) but delegates Three.js `AnimationAction` management to `src/animation/animation-controller.js`.

This means future Meshy characters can change rigs/clip sets without coupling animation implementation to movement, camera, Builder, or world code.

## Asset policy

- Player: `assets/models/player/`
- Placeable Builder models: `assets/models/builder/`
- Ground textures: `assets/textures/`
- Catalog: `assets/catalog.json`
- `builder/assets/` is legacy compatibility storage only; do not add new production assets there.
