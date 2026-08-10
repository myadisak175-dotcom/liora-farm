# Home Island Builder

The Builder is a first-class game tool. Keep it isolated from normal gameplay so the game can grow without turning `main.js` into a monolith.

## Accepted UX baseline — Builder v6.5

This is the current approved interaction model.

- Opening `Edit Island` starts with a clean asset drawer.
- Idle UI shows only buildable assets, Undo and Done.
- Tapping an asset creates a ghost preview immediately.
- One-finger drag moves the preview.
- Two-finger twist rotates the preview continuously.
- Two-finger pinch scales the preview.
- Placement preview uses clear valid/invalid feedback.
- While placing, only placement controls are visible.
- Tapping an already placed object selects that object directly; there is no separate Edit mode the player must choose first.
- The selected object receives a temporary visual tint so it is obvious which object is being edited.
- Selected objects can be moved, rotated, scaled, copied or deleted.
- Tapping empty ground clears selection and restores the object's normal material.
- `Done` means Save + Exit Builder + resume gameplay.
- Layout changes autosave while editing; Done performs an explicit final save.
- The builder tray remains draggable and resizable for mobile ergonomics.
- Object creation must remain functional for Tree, Palm, Pine and House catalog entries.
- Legacy fixed collision helpers/walls from old house, farm, pond or mountain prototypes must stay disabled and must not affect the clean island.

Collision behavior for newly placed Builder objects is intentionally not part of the locked Builder UX yet. It can be designed independently later without changing this interaction model.

## Asset plug-in workflow

New buildings and decorations should be data-driven. Adding a new object should not require editing Builder UI logic.

1. Put the `.glb` model under `assets/models/builder/`.
2. Put an optional preview image under `assets/ui/builder-thumbnails/`.
3. Add one entry to `asset-catalog.js` with `id`, label, category, `modelPath`, `thumbnailPath`, scale limits and placement metadata.
4. The asset drawer should render from the catalog. Use `thumbnailPath` when present and fall back to `icon` when no thumbnail is available.
5. `asset-loader.js` lazy-loads the GLB only when needed and caches the source scene so repeated placement does not download/load the same asset again.
6. Saved island layouts continue to store only the stable `assetId` and transform. They never store the model itself.

The current Tree, Palm, Pine and House entries use `modelPath: null` because their standalone prototypes embed models directly. When those GLBs are promoted into repository assets, assign their real paths in the catalog; no Builder interaction code should need to change.

## Responsibilities

- `asset-catalog.js` — metadata, model paths and thumbnail paths for every placeable asset.
- `asset-loader.js` — lazy GLB loading and source-scene caching.
- `builder-state.js` — contextual state (`idle`, `place`, `edit`), current asset/object and undo history.
- `builder-controller.js` — add/select/update/duplicate/delete/save transitions without UI or Three.js rendering details.
- `layout-store.js` — versioned persistence for island layouts.
- `ui/` — mobile drawer, gesture handling, selection feedback and contextual controls.

## Rules

1. New placeable content is added through the asset catalog. Do not hard-code new asset types into the panel.
2. Saved layouts contain data only: stable id, `assetId`, position, rotation and scale.
3. Three.js models, materials and meshes must never be serialized into the layout.
4. Terrain snapping belongs in placement/render integration, not in individual asset definitions.
5. Builder UI may evolve without changing player movement, camera, day/night or other gameplay systems.
6. Layout persistence uses a schema version so future migrations are possible.
7. Selection tint must always restore the original material on deselect, asset switch and Builder exit.
8. Experimental collision and placement rules must remain separate until approved.
9. `Done` is the single authoritative Save + Exit action.
10. Never reintroduce fixed-position collision calls from obsolete scene prototypes into the Builder baseline.
11. A new GLB must be loadable through `asset-loader.js`; do not add one-off `GLTFLoader.load(...)` blocks to Builder UI code.
12. Asset thumbnails are optional; the icon fallback must keep the catalog usable before art thumbnails are ready.

## Production layout

```text
src/editor/
├── asset-catalog.js
├── asset-loader.js
├── builder-state.js
├── builder-controller.js
├── layout-store.js
└── ui/
    ├── builder-panel.js
    ├── builder-gestures.js
    └── builder-panel.css
```

The standalone Builder prototypes are UX references only. Production code should use these modules rather than copying the standalone HTML into `main.js`.
