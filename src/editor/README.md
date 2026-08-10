# Home Island Builder

The Builder is a first-class game tool, not a one-off debug panel. Keep it isolated from normal gameplay so the game can grow without turning `main.js` into a monolith.

## Responsibilities

- `asset-catalog.js` — metadata for everything the player can place.
- `builder-state.js` — current mode, selection, preview and undo history.
- `layout-store.js` — versioned persistence for saved island layouts.
- Future `builder-controller.js` — placement, move, rotate, scale, duplicate and delete rules.
- Future `ui/` — mobile builder panel, gestures, colored state rings and contextual Build/Edit/Delete controls.

## Rules

1. A new placeable object is added to the asset catalog; do not hard-code special cases in UI code.
2. Saved layouts contain only data (`assetId`, transform, stable object id), never Three.js objects.
3. Terrain snapping belongs in placement logic, not in individual assets.
4. Collision/placement footprints are metadata in the catalog.
5. Builder UI may change freely without changing gameplay movement/camera systems.
6. Builder saves use a schema version so future migrations are possible.
7. Experimental assets should not become production catalog entries until their scale and performance are approved.

## Planned production layout

```text
src/editor/
├── asset-catalog.js
├── builder-state.js
├── layout-store.js
├── builder-controller.js
└── ui/
    ├── builder-panel.js
    └── builder-panel.css
```

The current standalone Builder prototypes are UX references. Production integration should move behavior into these modules instead of copying the standalone HTML into `main.js`.
