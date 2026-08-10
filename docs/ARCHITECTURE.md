# Liora's Farm — Project Architecture

The production code is organized so new features can be added without retuning the locked movement/camera feel. The Home Island Builder is a first-class subsystem, map data is kept independent from Builder code, and placeable content is data-driven through the asset catalog.

## Production structure

```text
src/
├── main.js                    # composition + game loop only
├── config.js                  # approved tuning and core asset paths
├── entities/
│   └── player.js              # Liora model loading + animations
├── zones/
│   └── home-island.js         # Home Island environment/ground
├── systems/
│   ├── input.js               # joystick/input
│   ├── movement.js            # camera-relative movement + world bounds
│   ├── camera.js              # orbit/pinch/smooth follow
│   ├── lighting.js            # sun, shadows, environment lighting
│   ├── sky.js                 # 360° procedural sky
│   ├── day-night.js           # global game time
│   ├── terrain.js             # reusable terrain height/mesh logic
│   ├── run-fx.js              # running particles
│   ├── contact-shadow.js      # grounded body + foot contact shadows
│   └── farming/
│       └── plot.js            # reusable farming plot geometry
├── editor/
│   ├── asset-catalog.js       # placeable-object metadata/model paths
│   ├── asset-loader.js        # lazy GLB loading + source-scene cache
│   ├── builder-state.js       # contextual idle/place/edit state + undo
│   ├── builder-controller.js  # placement/edit/save transitions
│   ├── layout-store.js        # versioned layout persistence
│   ├── README.md              # Builder boundaries + maintenance rules
│   └── ui/
│       ├── builder-panel.js    # contextual mobile drawer
│       ├── builder-gestures.js # drag/twist/pinch controls
│       └── builder-panel.css
└── experiments/
    └── pond-v1.js             # unfinished pond prototype, not production

maps/
└── home-island.json           # canonical Home Island composition data

assets/
├── models/
│   └── builder/               # GLB files for placeable Builder assets
└── ui/
    └── builder-thumbnails/    # optional asset preview images
```

## Architecture rules

1. `main.js` coordinates systems only; it must not accumulate feature implementation details.
2. Locked gameplay values live in `config.js`; avoid hard-coded movement/camera tuning elsewhere.
3. Zone-specific environment content belongs under `src/zones/`.
4. Reusable gameplay/rendering behavior belongs under `src/systems/`.
5. Player/model behavior belongs under `src/entities/`.
6. Home Island creation/editing belongs under `src/editor/`; normal gameplay must not depend on editor UI internals.
7. New placeable content is registered through `editor/asset-catalog.js`; production UI must not add one-off asset buttons or loader blocks.
8. `asset-loader.js` owns GLB loading and caching. Production assets should be lazy-loaded from paths in the catalog.
9. Saved layouts contain stable data only (`id`, `assetId`, `x`, `z`, `rotation`, `scale`) and never Three.js object references.
10. Persisted layout data is schema-versioned so future game versions can migrate saves safely.
11. `maps/home-island.json` is canonical map data and must remain independent from Builder code/version changes.
12. Binary assets stay under `assets/`; source code refers to them through catalog/config identifiers.
13. Unapproved prototypes belong under `src/experiments/` and must not be imported by production `main.js`.
14. Test one subsystem at a time before promoting it from experiments to production.
15. Legacy fixed-position invisible collision helpers from old scene prototypes must not be reintroduced.
16. Collision for newly placed Builder objects is a separate subsystem and remains deferred until explicitly approved.

## Builder design — accepted baseline v6.12 Safe Edit

The Builder uses contextual UI rather than separate Build/Edit/Delete mode screens.

### Idle

- Opening `Edit Island` shows the asset drawer, Undo and Done.
- Placeable content is rendered from the asset catalog.
- The drawer remains draggable/resizable for mobile ergonomics.

### Place

- Tapping an asset immediately creates a ghost preview.
- One-finger drag moves the preview.
- Two-finger twist rotates continuously.
- Two-finger pinch scales the preview.
- Valid/invalid placement feedback must be clear.
- While placing, only contextual placement controls are shown.
- Confirm places the object; Cancel abandons the preview.

### Edit

- Tapping an already placed object selects it directly; the player does not enter a separate Edit mode first.
- The selected object receives temporary visual feedback/tint.
- Selected objects can be moved, rotated, scaled, duplicated or deleted.
- Selection stores an edit snapshot of the original position, rotation and scale.
- `Cancel Edit` restores that snapshot exactly if the player moved or transformed an object accidentally.
- Tapping empty ground clears selection and restores the object's original material.
- Selecting another object or pressing Done commits the current edit.

### Save and map safety

- Layout changes autosave during editing.
- `Done` is the single authoritative Save + Exit action and returns to gameplay.
- Export Map writes portable `home-island.json` composition data.
- Import Map restores portable map data into the Builder.
- `maps/home-island.json` in GitHub is the canonical project map and is not tied to a standalone HTML version.
- Builder code may change without requiring the map to be rebuilt from scratch.

## Asset plug-in workflow

New buildings, vegetation and decoration are data-driven.

1. Put the `.glb` under `assets/models/builder/`.
2. Put an optional preview image under `assets/ui/builder-thumbnails/`.
3. Add one entry to `asset-catalog.js` with a stable `id`, label, category, `modelPath`, optional `thumbnailPath`, scale limits and placement metadata.
4. The asset drawer renders from the catalog and falls back to an icon if no thumbnail exists.
5. `asset-loader.js` lazy-loads the model on demand and caches the source scene for repeated placement.
6. Saved maps store only `assetId` and transforms, never the binary model.
7. Adding a new production asset must not require changes to movement, camera, map schema or normal gameplay systems.

Standalone prototypes may embed models temporarily for direct phone testing, but that is a testing convenience only. Production must use catalog paths and lazy loading instead of allowing the standalone HTML to grow indefinitely.

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
- Builder v6.12 contextual composition workflow
- MapSafe Export/Import workflow
- Safe Edit Cancel snapshot behavior
- Clean-island workflow: permanent composition comes from Builder/map data, not fixed hard-coded object placements

Current Builder test assets include Tree, Palm, Pine, House, House 2, Grass, Crate, Barrel and Path. Their production versions should ultimately be catalog-driven GLB assets.

The pond remains experimental until terrain supports a proper cutout/basin instead of placing water beneath an uncut grass plane.
