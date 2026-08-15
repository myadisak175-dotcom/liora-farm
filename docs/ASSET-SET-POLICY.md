# Liora Farm — Asset Set Policy

## Current primary set

Nature uses **World V2** as the production Builder palette.

- Source folder: `assets/models/world-v2/nature/`
- Runtime IDs: `v2-*`
- Catalog: `src/editor/nature-catalog-v2.js`
- Status: **primary**

The old Nature models in `assets/models/builder/` are now **fallback-only**. They stay registered so existing maps and local saves that still reference `tree`, `pine`, `palm`, or `grass` continue to load, but they must not appear in the Builder placement palette.

Buildings and decor remain on their current assets until replacement sets are prepared and promoted separately.

## Promotion gate for a primary Nature asset

A Nature asset is eligible for the primary Builder palette only when all of these are true:

1. It belongs to the World V2 set and has a stable `v2-` asset ID.
2. Its GLB exists under `assets/models/world-v2/nature/` and has a valid binary glTF header.
3. The catalog points to a named node inside the shared GLB (`nodeName`).
4. Source height, footprint width, and triangle count are recorded and positive.
5. The model has a base pivot suitable for terrain placement and uses `terrainSnap: true`.
6. It loads through the shared-file Builder loader and can be cloned without re-fetching the GLB for sibling variants.
7. It has been visually checked in Builder for correct orientation, ground contact, scale, textures, foliage transparency, and shadows.
8. It fits the mobile budget of the set. Dense repeated trees should move to `InstancedMesh` instead of unlimited individual clones.

These rules are encoded by `PRIMARY_ASSET_POLICY` / `isPrimaryBuilderAsset()` and covered by `tools/test/nature-v2.test.html`.

## Retirement rule

Do **not** delete a fallback asset only because it is hidden from the Builder UI.

A legacy asset may be physically removed only after:

- committed/default maps no longer reference its old ID;
- migration of existing saved layouts is either implemented or explicitly abandoned;
- regression tests confirm the old ID is no longer required for compatibility.

Until then, hidden means **not offered for new placement**, not **unloadable**.

## Pack-specific notes

The current Nature Pack contains 12 GLB files and 55 named objects. Files are intentionally shared by multiple variants, so the loader caches by GLB path and selects nodes by name. The pack was prepared with base pivots at `y = 0`, foliage using alpha masking rather than blending, reduced mobile-friendly textures, and kebab-case filenames.

The practical performance limit is more likely to be draw calls and foliage overdraw than raw triangle count. Trees cloned individually cost repeated draw calls; use instancing when building dense forests.
