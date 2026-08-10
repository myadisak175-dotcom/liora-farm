# Home Island Builder

The Builder is a first-class game tool. Keep it isolated from normal gameplay so the game can grow without turning `main.js` into a monolith.

## Accepted UX baseline — Builder v6

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

Collision behavior is intentionally not part of the locked Builder UX yet. It can be designed independently later without changing this interaction model.

## Responsibilities

- `asset-catalog.js` — metadata for every placeable asset.
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

## Production layout

```text
src/editor/
├── asset-catalog.js
├── builder-state.js
├── builder-controller.js
├── layout-store.js
└── ui/
    ├── builder-panel.js
    ├── builder-gestures.js
    └── builder-panel.css
```

The standalone Builder prototypes are UX references only. Production code should use these modules rather than copying the standalone HTML into `main.js`.
