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
│   │   ├── animation-controller.js
│   │   └── character-state-machine.js
│   ├── core/
│   │   └── README.md           # runtime/editor dependency boundary
│   ├── entities/
│   │   ├── character.js        # shared Meshy/GLB character runtime
│   │   ├── player.js           # Liora adapter + compatibility API
│   │   ├── npc.js
│   │   └── creature.js
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
    └── CHARACTER_SYSTEM.md
```

## Architecture rules

1. `main.js` coordinates runtime systems; feature implementations belong in their own modules.
2. Stable tuning and core asset paths live in `src/config.js`.
3. All animated actors use `src/entities/character.js`; Player/NPC/Creature are thin role adapters rather than separate GLB pipelines.
4. Gameplay talks to semantic character states (`idle`, `walk`, `run`, `interact`, `action`) rather than Three.js `AnimationAction` objects.
5. Reusable gameplay/rendering behavior belongs under `src/systems/`; NPC AI, creature AI and dialogue must not be embedded in entity loaders.
6. Zone-specific composition belongs under `src/zones/`.
7. Builder/editor code stays under `src/editor/`; runtime modules must not depend on Editor UI internals.
8. Production Builder models live under `assets/models/builder/` and are registered through `assets/catalog.json`.
9. Saved maps contain stable IDs/transforms, never Three.js object references.
10. Production GLB/textures are referenced by path; do not embed growing Base64 assets into production HTML.
11. Change one subsystem at a time and test on mobile before accepting a new baseline.

## Character + animation boundary

`src/entities/character.js` owns the shared GLB character setup: model loading, scaling, grounding, material/shadow setup, AnimationController creation and Character State Machine creation.

`src/animation/character-state-machine.js` exposes semantic APIs such as `setLocomotion()`, `playAction()` and `interact()`. Clip names from Meshy remain data supplied by each character definition.

`src/entities/player.js` keeps the stable API used by the current game (`fadeTo`, `playSpecial`, `isSpecial`, `mixer`) but those calls now pass through the Character State Machine. This keeps the approved Best-of build compatible while new gameplay systems can use the semantic API directly.

NPCs and creatures use the same runtime through `createNPC()` and `createCreature()`. Their AI, schedules, dialogue and procedural motion should be separate systems layered on top of the character contract.

See `docs/CHARACTER_SYSTEM.md` for the integration contract.

## Asset policy

- Player: `assets/models/player/`
- Placeable Builder models: `assets/models/builder/`
- Ground textures: `assets/textures/`
- Catalog: `assets/catalog.json`
- `builder/assets/` is legacy compatibility storage only; do not add new production assets there.
