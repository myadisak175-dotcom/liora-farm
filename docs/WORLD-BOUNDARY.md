# World Boundary

## Current production rule

Home Island currently uses an **invisible gameplay boundary**, not a visible
procedural ridge:

```js
worldLimit: 38,
worldBoundary: { enabled: false, type: "none" },
```

The editable terrain is 80 x 80 m, leaving a narrow margin between the 38 m
movement limit and the terrain edge. The player is clamped inside that authored
play area. No collider wall, visible ring or physical gap is rendered.

`CONFIG.outerWorld` begins just beyond the gameplay edge and continues as
visual scenery. It blends ground paint, colour, height variation and fog into
the distant world, but it does not expand the walkable area.

The current horizon release keeps that ground greener for longer: fog begins
at 150 m and reaches full blend at 552 m. The nearest possible outer-world rim
is 562 m away (`outerWorld.outerRadius - worldLimit`), so the geometry is still
fully swallowed before the player can see its edge.

## Why the old ridge is not the baseline

`src/systems/world-boundary.js` still contains the reusable generated-boundary
contract, but Home Island no longer enables it. Earlier Ridge V1 documentation
described an experiment where gameplay sampled:

`max(editable terrain height, generated boundary floor)`

That design remains available for a future map, but treating it as active on
Home Island would make documentation, tuning and tests disagree with the
runtime.

## Safety rules

- Keep `worldLimit` inside `CONFIG.terrain.size / 2`.
- Do not make the outer world walkable merely because it is visible.
- Do not add a visible wall to enforce the current limit.
- If a map enables a ridge, cliff, deep-water or portal boundary later, update
  its map/config contract and tests in the same change.
- Terrain sculpt saves continue to own authored height only; generated scenery
  must not silently bake itself into the terrain payload.

The top-level name remains `worldBoundary` so future maps can choose ridge,
deep water, cliffs, dense forest, walls, portals or no visible boundary without
changing the movement API.
