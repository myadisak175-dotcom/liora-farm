# World Portals + Markers

Portals are a plugin over the World Logic -> World Event -> Action pipeline. They are not a special case in movement or the renderer.

## Data contract

A destination is always identified by two stable ids:

```json
{
  "targetMap": "meadow-demo",
  "targetMarker": "meadow-arrival"
}
```

A Portal node carries an authored action:

```json
{
  "id": "meadow-gate",
  "kind": "portal",
  "x": 4,
  "z": 5,
  "radius": 1.25,
  "enabled": true,
  "data": {
    "targetMap": "meadow-demo",
    "targetMarker": "meadow-arrival",
    "actions": {
      "enter": [
        {
          "type": "portal",
          "mapId": "meadow-demo",
          "markerId": "meadow-arrival"
        }
      ]
    }
  }
}
```

A Marker is a disabled, non-interactive anchor:

```json
{
  "id": "meadow-arrival",
  "kind": "marker",
  "x": 0,
  "z": 5,
  "radius": 0.5,
  "enabled": false,
  "data": { "role": "world-marker" }
}
```

Markers stay in World Logic so the same primitive can later anchor NPC schedules, cutscenes, fast travel and scripted movement.

## Navigation lifecycle

```text
player enters Portal
-> World Logic Runtime emits enter
-> World Action Runtime reads node.data.actions.enter
-> portal action plugin validates target map
-> one-shot arrival token is written to sessionStorage
-> browser loads target map URL
-> target World Logic loads authored + local data
-> player consumes arrival token
-> marker id resolves against target map's live Logic document
-> player spawns at marker
```

The arrival token is consumed once. Reloading the destination afterwards uses its normal Player Spawn.

Wrong-map, invalid and stale arrival tokens are discarded so they cannot unexpectedly teleport the player later.

## Map registry rule

Portals never guess `./maps/<id>.json`. `maps/index.json` is the source of truth for map id -> file path.

This allows map files to move or be grouped without rewriting every Portal that references them.

## Local authoring rule

The destination resolves the Marker after its live World Logic document has loaded. Therefore a Marker authored locally on mobile can be used before that map JSON is exported back to the repository.

## Builder plugin

`world-builder-portal-plugin.js` extends the existing four-mode shell instead of adding another top-level editor mode.

In **Logic** it adds:
- World Markers
- Portals
- target Map selector
- target Marker selector
- Portal radius controls

In **Manage** it adds Map switching.

The plugin waits for the shell to create its overlay, so parallel module loading cannot hide the tools.

## Prototype worlds

The feature branch registers:
- `home-island`
- `meadow-demo`

Each has a Marker and a Portal back to the other map. Portals are placed away from spawn/arrival points to prevent immediate bounce loops.

## Extension rule

Future transition features should reuse this navigation contract:
- house exterior -> interior
- town gate -> countryside
- dungeon floors
- fast travel
- cutscene relocation

Do not add raw destination coordinates to doors. Keep destination positions behind stable Marker ids.
