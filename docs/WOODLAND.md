# Walkable woodland

The home island now has a mixed birch/pine grove north of the farm. Follow the
dirt path from `(1, 1)` into the trees. The eastern route loops around a small
clearing at `(19, -22)`; the western fork winds deeper into the grove.

`CONFIG.woodland` owns the bounds, seed, paths, clearings, asset mix and budget.
`woodland-layout.js` generates deterministic placements inside the playable
terrain. `woodland.js` loads the existing World V2 assets through the same
shared-file loader as Builder. The far-away `treeLine` is still separate scenery.

At High quality the unoccupied default map has 78 trees, 18 rocks and 360 plants.
The four plant variants use four instanced draw calls; trees keep per-object
frustum culling. Lower quality thins only ground cover, leaving trunk collision
and navigation consistent. These are authored limits, not measured phone FPS.

The production wind and shadow materials remain shared. A small dithered window
through foreground trees keeps the character visible in Play mode. Each tree
variant owns its cutaway material, while shadows retain the full canopy.

## Saved worlds

The woodland is generated after the player's terrain and objects load. Existing
buildings mask nearby vegetation rather than being moved or removed. The forest
resamples sculpted terrain and omits plants on flooded or unwalkably steep ground.
Only successfully loaded, active trunks and rocks contribute movement colliders.

Dirt paths and ground beneath the trees use `groundPaint.setAuthoredStrokes()`.
This is an in-memory base layer in the existing terrain splat maps. Player paint
replays over it. Painting, undo, clear and imports retain that priority. Authored
strokes do not enter localStorage or the player's undo history.

Generated forest placements belong to this environment system, not the Builder
layout. Builder exports still contain the player's objects and strokes. The home
map's forest comes from its config when reopened; other map IDs are unaffected.

## Checks

- `node tools/test/woodland-layout.test.mjs`: deterministic layout, complete path
  corridors, farm/spawn clearance, world bounds, asset budget and wet/steep ground.
- `tools/test/ground-layers.test.html`: authored ground priority and save/undo
  regression cases, included in the existing browser regression suite.
- Real Three.js r180/GLB checks were run in Node for source bounds, ground contact,
  shared-file loads, pooling, cutaway/wind hooks, quality changes and teardown.

Final visual feel and sustained FPS still need a pass on the actual phone.
