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
│   ├── data/
│   │   └── interactions.js     # assetId -> semantic world action
│   ├── entities/
│   │   ├── character.js        # shared Meshy/GLB character runtime
│   │   ├── player.js           # Liora adapter + compatibility API
│   │   ├── npc.js
│   │   └── creature.js
│   ├── zones/
│   │   └── home-island.js
│   ├── systems/
│   │   ├── movement.js
│   │   ├── interaction.js      # proximity focus + action dispatch
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
    ├── CHARACTER_SYSTEM.md
    └── INTERACTION_SYSTEM.md
```

## Architecture rules

1. `main.js` coordinates runtime systems; feature implementations belong in their own modules.
2. Stable tuning and core asset paths live in `src/config.js`.
3. All animated actors use `src/entities/character.js`; Player/NPC/Creature are thin role adapters rather than separate GLB pipelines.
4. Gameplay talks to semantic character states (`idle`, `walk`, `run`, `interact`, `action`) rather than Three.js `AnimationAction` objects.
5. World interaction uses stable semantic actions (`chop`, `enter`, `sit`, `inspect`, `pick-up`, `talk`) rather than model filenames or mesh names.
6. Interaction detection only selects/dispatches targets. Inventory, VFX, Audio, dialogue, tree HP and scene transitions belong to their own gameplay handlers/systems.
7. Reusable gameplay/rendering behavior belongs under `src/systems/`; NPC AI, creature AI and dialogue must not be embedded in entity loaders.
8. Zone-specific composition belongs under `src/zones/`.
9. Builder/editor code stays under `src/editor/`; runtime modules must not depend on Editor UI internals.
10. Production Builder models live under `assets/models/builder/` and are registered through `assets/catalog.json`.
11. Saved maps contain stable IDs/transforms, never Three.js object references.
12. Production GLB/textures are referenced by path; do not embed growing Base64 assets into production HTML.
13. Change one subsystem at a time and test on mobile before accepting a new baseline.

## Character + animation boundary

`src/entities/character.js` owns the shared GLB character setup: model loading, scaling, grounding, material/shadow setup, AnimationController creation and Character State Machine creation.

`src/animation/character-state-machine.js` exposes semantic APIs such as `setLocomotion()`, `playAction()` and `interact()`. Clip names from Meshy remain data supplied by each character definition.

`src/entities/player.js` keeps the stable API used by the current game (`fadeTo`, `playSpecial`, `isSpecial`, `mixer`) but those calls now pass through the Character State Machine. This keeps the approved Best-of build compatible while new gameplay systems can use the semantic API directly.

NPCs and creatures use the same runtime through `createNPC()` and `createCreature()`. Their AI, schedules, dialogue and procedural motion should be separate systems layered on top of the character contract.

See `docs/CHARACTER_SYSTEM.md` for the integration contract.

## Interaction boundary

`src/data/interactions.js` maps stable world asset IDs to semantic actions and presentation metadata such as interaction label, range and preferred animation key.

`src/systems/interaction.js` selects the best nearby target and dispatches its semantic action to a registered gameplay handler. It can discover current Builder-placed roots through `getSceneInteractableRoots(scene)` without importing Builder UI modules.

This means a Meshy tree remains a `chop` target even if the GLB file, mesh hierarchy or visual model is replaced later. The same detector can also serve NPC `talk`, dropped-item `pick-up`, door `enter` and bench `sit` interactions.

See `docs/INTERACTION_SYSTEM.md` for the runtime contract.

## Asset policy

- Player: `assets/models/player/`
- Placeable Builder models: `assets/models/builder/`
- Ground textures: `assets/textures/`
- Catalog: `assets/catalog.json`
- `builder/assets/` is legacy compatibility storage only; do not add new production assets there.
