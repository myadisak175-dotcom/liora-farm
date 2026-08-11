# Asset Guide

## Textures
- Ground textures: WebP, power-of-two dimensions where practical.
- Keep grass and dirt color space as sRGB.
- Avoid baking strong directional shadows into ground textures.
- Reuse textures instead of duplicating near-identical files.

## Models
- Store production models under `assets/models/`.
- Player/rigged characters belong under `assets/models/player/` (future characters can use their own subfolders).
- Builder/placeable environment models belong under `assets/models/builder/`.
- Register placeable assets in `assets/catalog.json`; gameplay/editor code should use stable asset IDs instead of hard-coded GLB paths.
- `builder/assets/` contains legacy standalone-test copies only. Do not add new production assets there.
- Use `.glb`.
- Do not embed production models as Base64.
- Optimize geometry and textures before adding many instances.

## Meshy import rule
A Meshy export is not production-ready until it has a stable filename, sensible scale, mobile-tested texture resolution, and a catalog/config entry. Changing a Meshy model should not require changes to movement, camera, world, or UI systems.

## Sprites
- Store player/NPC sprite atlases under `assets/sprites/`.
- Keep animation metadata in code or a small JSON file next to the atlas.

## Naming
Use lowercase descriptive names with underscores only when needed, for example:
- `crimson_cottage.glb`
- `grass.webp`
- `dirt_path_refined.webp`

## Baseline policy
A file is only considered baseline after it has been tested on mobile and explicitly approved.
