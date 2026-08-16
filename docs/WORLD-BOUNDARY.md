# World Boundary

Home Island uses a procedural terrain ridge as its visible world boundary. The player is stopped by the same `maxWalkSlope` rule used for ordinary sculpted terrain; `worldLimit` remains a hidden safety clamp behind the ridge.

## Home Island Ridge V1

`CONFIG.worldBoundary` owns the tuning values:

- `type: "ridge"` selects the ridge implementation.
- `radius` is the approximate distance from world centre where the rise begins.
- `noiseAmplitude`, `noiseScale`, and `noiseSeed` offset that start distance so the ridge does not read as a perfect ring.
- `feather` is the horizontal rise distance.
- `height` is the final outer-rim elevation.

The ridge must finish before `CONFIG.terrain.size / 2` so its outer edge can meet the floating-island skirt.

## Runtime architecture

The ridge is intentionally **not** written into the editable terrain `Float32Array`.

`world-boundary.js` builds a composite height view:

`max(editable terrain height, generated boundary floor)`

Gameplay ground sampling, slope checks, object seating, terrain-field shading, and editor ground picking see that composite view. The normal sculpt/save system continues to own only authored terrain. A lightweight ridge mesh shares the existing terrain material, so it receives the same Ground Layers/auto-surface shader without adding another texture set.

This separation has three useful properties:

1. The ridge cannot be dug through because gameplay/rendering never go below its generated floor.
2. A terrain save does not bake generated ridge height, so later radius/height tuning takes effect after reload.
3. The core terrain-height persistence and DDA implementation remain unchanged.

The ridge adds one static draw call and only the triangles in the outer boundary band. No collider wall or extra render pass is created.

## Future boundary types

The top-level name is `worldBoundary`, not `mountainBorder`, on purpose. Other maps can later route the same world-boundary contract to deep water, cliffs, dense forest, walls, portals, or no boundary at all without changing Home Island movement rules.
