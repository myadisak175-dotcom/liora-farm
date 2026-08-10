# Liora's Farm — Project Architecture

The production code is organized so new features can be added without retuning the locked movement/camera feel. The Home Island Builder is now treated as a first-class subsystem so future content can be added through data instead of hard-coded placement logic.

## Production structure

```text
src/
├── main.js                  # composition + game loop only
├── config.js                # approved tuning and core asset paths
├── entities/
│   └── player.js            # Liora model loading + animations
├── zones/
│   └── home-island.js       # Home Island environment/ground
├── systems/
│   ├── input.js             # joystick/input
│   ├── movement.js          # camera-relative movement + world bounds
│   ├── camera.js            # orbit/pinch/smooth follow
│   ├── lighting.js          # sun, shadows, environment lighting
│   ├── sky.js               # 360° procedural sky
│   ├── day-night.js         # global game time
│   ├── terrain.js           # reusable terrain height/mesh logic
│   ├── run-fx.js            # running particles
│   ├── contact-shadow.js    # grounded body + foot contact shadows
│   └── farming/
│       └── plot.js          # reusable farming plot geometry
├── editor/
│   ├── asset-catalog.js     # placeable-object metadata
│   ├── builder-state.js     # Build/Edit/Delete state + undo history
│   ├── layout-store.js      # versioned layout persistence
│   ├── README.md            # Builder boundaries and maintenance rules
│   ├── builder-controller.js # future placement/controller module
│   └── ui/                  # future mobile Builder UI/gesture modules
└── experiments/
    └── pond-v1.js           # unfinished pond prototype, not production
```

## Architecture rules

1. `main.js` coordinates systems only; it must not accumulate feature implementation details.
2. Locked gameplay values live in `config.js`; avoid hard-coded movement/camera tuning elsewhere.
3. Zone-specific environment content belongs under `src/zones/`.
4. Reusable gameplay/rendering behavior belongs under `src/systems/`.
5. Player/model behavior belongs under `src/entities/`.
6. Home Island creation/editing belongs under `src/editor/`; normal gameplay should not depend on editor UI internals.
7. New placeable content is registered through `editor/asset-catalog.js` instead of adding special-case buttons or placement code.
8. Saved layouts contain stable data only (`id`, `assetId`, `x`, `z`, `rotation`, `scale`) and never Three.js object references.
9. Persisted layout data is schema-versioned so future game versions can migrate saves safely.
10. Binary assets stay under `assets/`; source code should refer to them by catalog/config identifiers.
11. Unapproved prototypes belong under `src/experiments/` and must not be imported by production `main.js`.
12. Test one subsystem at a time before promoting it from experiments to production.

## Builder design

The Builder is the intended workflow for composing Home Island. Production code should support:

- Build / Edit / Delete modes
- ghost preview before placement
- terrain snapping
- placement validity feedback
- move / rotate / scale / duplicate / delete
- undo
- autosave
- versioned layout persistence
- mobile contextual controls
- draggable/resizable control panel
- data-driven asset categories so future buildings, rocks, fences, flowers, farming objects and decorations do not require rewriting the editor

The current standalone Builder prototypes are UX references. Their behavior should be migrated into `src/editor/` modules rather than copied into `main.js`.

## Locked production baseline

- Home Island grass base
- Camera-relative movement
- Walk speed 2.4
- Run speed 5.2
- Walk animation 0.9x
- Orbit camera + pinch zoom + smooth follow
- 360° sky + day/night
- Running FX
- Dynamic shadows
- Approved grounded Liora offset and compact foot contact shadows
- Builder composition workflow: the island starts clean and placeable content is created by the Builder

The pond remains experimental until the terrain supports a proper cutout/basin instead of placing water beneath an uncut grass plane.
