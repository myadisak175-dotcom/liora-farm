# Clean Runtime Modules

The clean runtime is intentionally empty at the start of migration. Code is copied into this tree only after its behavior is verified against Golden v6.25.

## Planned modules

- `game/` — scene lifecycle, update loop, play/build mode coordination.
- `camera/` — orbit camera, pinch zoom, reset, follow target.
- `player/` — Liora model, animations, movement and facing.
- `builder/` — selection, placement, transforms, undo/delete.
- `ground/` — ground surface and paint API.
- `assets/` — asset catalog, GLB loading, Liora-relative scale and grounding metadata.
- `collision/` — collision shapes and interaction markers.
- `storage/` — versioned serializable map/layout state.
- `ui/` — mobile controls and panels only.

## API rule

UI can call runtime APIs, but runtime systems must never query UI DOM to decide gameplay behavior.

No clean module may fetch historical HTML, patch source strings, or use `document.write()`.

## First extraction

Phase 1 is `camera/` + input behavior from the approved v6.25 Play experience. Nothing else is migrated until that camera matches Golden on mobile.
