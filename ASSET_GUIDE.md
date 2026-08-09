# Asset Guide

## Textures
- Ground textures: WebP, power-of-two dimensions where practical.
- Keep grass and dirt color space as sRGB.
- Avoid baking strong directional shadows into ground textures.
- Reuse textures instead of duplicating near-identical files.

## Models
- Store models under `assets/models/`.
- Use `.glb`.
- Do not embed models as Base64.
- Optimize geometry and textures before adding many instances.

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
