# Builder Model Assets

Production Builder GLB files belong in this folder.

Current legacy Builder assets include:

- `tree.glb` — Tree
- `palm.glb` — Palm
- `pine.glb` — Pine
- `house.glb` — House
- `house2.glb` — House 2
- `crate.glb` — Crate
- `wine_barrel.glb` — Wine barrel
- `path_tile.glb` — Path tile

These files are already split binary assets and are loaded through
`src/editor/asset-catalog.js`. `defineAsset()` derives each `modelPath` from
`ASSETS.modelDir`; the production page does not embed GLBs.

World V2 trees, rocks and plants live under
`assets/models/world-v2/nature/` and follow `docs/ASSET-SET-POLICY.md`. The
older `tree`, `pine` and `palm` files here remain loadable for saved-map
compatibility but are hidden from new placement. Legacy `grass` remains a
deliberate reusable exception.

Do not add a catalog entry until its GLB exists at the exact path. Keep stable
asset IDs when replacing content so existing maps and local saves still load.
