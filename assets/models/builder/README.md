# Builder Model Assets

Production Builder GLB files belong in this folder.

Expected promoted assets:

- `tree.glb` — Tree
- `palm.glb` — Palm
- `pine.glb` — Pine
- `house.glb` — House

The current standalone prototypes embed these models directly. The models have been extracted into a migration pack and should be promoted here as binary GLB files before changing the catalog `modelPath` values from `null`.

Do not point `asset-catalog.js` at a model path until the corresponding GLB exists in this folder. This keeps the production Builder from breaking during migration.
