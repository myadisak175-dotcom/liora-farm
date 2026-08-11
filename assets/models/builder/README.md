# Builder Model Assets

Production Builder GLB files live in this folder.

Current promoted assets include Tree, Palm, Pine, House variants, Grass, Bench, Crates, Barrel, Path Lamp, Fence, Path Tile and Wood Bridge.

## Rules

- Add new production Meshy/environment GLBs here.
- Register them in `assets/catalog.json` with a stable `id` and `modelPath`.
- Keep gameplay code independent from individual file names; systems should consume catalog IDs/metadata.
- Test scale and texture resolution on mobile before treating a new asset as baseline.
- Do not add new production models under `builder/assets/`; that tree remains only for legacy standalone-test compatibility.
