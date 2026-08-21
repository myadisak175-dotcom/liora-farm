# Liora World Builder — foundation

The World Builder is not a separate editor game. It is the authoring surface for the same world data the runtime plays.

## Core rule

```text
World Data -> Runtime Systems -> Gameplay
     ^
     |
Builder UI
```

The Builder edits data. It never owns gameplay truth, meshes, materials, animation mixers or runtime listeners.

A saved map is therefore portable data, not a serialized Three.js scene.

## One world file

A map can grow without changing this boundary:

```json
{
  "version": 2,
  "mapId": "home-island",
  "horizon": {},
  "logic": {
    "version": 2,
    "spawn": { "x": 0, "z": 5 },
    "nodes": []
  },
  "objects": [],
  "groundPaint": {},
  "terrainHeight": {}
}
```

- `terrainHeight` — physical ground shape.
- `groundPaint` — surface appearance/gameplay surface type.
- `objects` — placed visual/collision assets.
- `horizon` — world presentation outside the playable terrain.
- `logic` — gameplay authoring data.

## Builder surface

The mobile UI exposes four top-level concepts only:

1. **Objects** — place/edit world assets.
2. **Terrain** — paint, sculpt and horizon authoring.
3. **Logic** — spawn points and gameplay nodes.
4. **Manage** — export/reset/reload world data.

Existing specialized tools stay underneath those concepts; the top level should not grow into a wall of buttons.

## Logic schema v2

`src/systems/world-logic.js` owns persistence, validation, migration and editing of logic data.

```json
{
  "version": 2,
  "spawn": { "x": 0, "z": 5 },
  "nodes": [
    {
      "id": "zone-1",
      "kind": "zone",
      "label": "Village entrance",
      "x": 10,
      "z": -4,
      "radius": 2.5,
      "enabled": true,
      "data": {}
    }
  ]
}
```

The schema deliberately keeps node `kind` extensible. New systems may register behaviour for a safe kind without changing persistence.

Current reserved/common kinds:

- `zone`
- `trigger`
- `portal`
- `npc`
- `interactable`

Unknown syntactically valid kinds survive save/load so future plugins can own them.

## Runtime boundary

`src/systems/world-logic-runtime.js` knows only spatial lifecycle. It turns authored node geometry into plain events:

```text
player position -> enter node
                -> stay inside (no repeated enter)
                -> exit node
```

It does not know what a farm, quest, shop, portal or cutscene is.

`src/systems/world-events.js` is the shared event bus. Gameplay systems subscribe independently.

Examples:

```text
zone enter -> FarmSystem enables farming controls
zone enter -> AudioSystem crossfades ambience
portal enter -> MapSystem changes world
trigger enter -> QuestSystem advances a quest
npc proximity -> InteractionSystem exposes Talk
```

None of those systems need to import each other.

## Player spawn

Player spawn is world data, not a constant in the character model.

The current authoring loop is intentionally mobile-first:

1. Switch to Play.
2. Walk Liora to the desired point.
3. Open Build -> Logic.
4. Set Player Spawn from Liora's current resolved position.
5. Export the world.

Local per-map edits outrank authored defaults until reset. Logic v1 data is migrated to v2 rather than discarded.

## Gameplay Zone prototype

A Zone can already be authored from Liora's current position and its radius edited on mobile.

The player runtime evaluates zones after movement collision/slope/water resolution. This matters: events follow where the character actually ended up, not raw joystick input.

Entering a Zone publishes one `enter` event. Leaving publishes one `exit` event. Staying inside does not spam events.

The temporary UI feedback subscriber shows an entry toast. It is presentation only; future gameplay rules attach to the same event bus.

## Extension contract

When adding a gameplay feature, prefer this order:

1. Define the smallest data the feature needs in a logic node's `data`.
2. Keep validation/sanitization in the owning data/system module.
3. Read nodes or subscribe to `WORLD_EVENTS` from the runtime system.
4. Add Builder controls only after the data/runtime contract is stable.
5. Keep the Builder free of Three.js gameplay state.
6. Add a focused test before adding a second node kind with the same behaviour.

Do not create a new HTML page or separate editor scene for a feature that can be expressed as world data.

## Recommended next layers

### 1. Action registry

Turn node events into composable data-driven actions:

```text
enter -> toast
enter -> setFlag
enter -> teleport
interact -> dialogue
interact -> giveItem
```

The action executor should be a registry, not a switch statement that grows forever.

### 2. Portal + map marker

Portals should target a stable marker id, not raw coordinates. That lets a destination move without editing every doorway that points to it.

### 3. Farm Zone

Move farming availability from one hard-coded farm plot to authored `zone` nodes whose data declares `role: "farm"`.

### 4. NPC spawn + schedule

NPC nodes define identity/home/work anchors. AI/schedules remain runtime systems.

### 5. Interaction nodes

A shared interaction system should choose the best nearby interactable and expose one contextual mobile action button.

### 6. Event graph

Only after several real gameplay systems exist, add visual event linking (`on enter -> action -> condition -> action`). Do not build a node graph before its runtime vocabulary is proven.

### 7. Prefabs

Reusable authored groups should contain object placements plus optional logic nodes. Prefabs should expand into ordinary map data, not introduce a second runtime format.

## Performance rules

World Logic must remain cheap enough to scale beyond the home island.

- No Three.js objects in saved logic.
- No per-node DOM.
- Do not raycast every logic node every frame.
- Start with simple squared-distance checks; add spatial hashing/chunks only when node counts justify it.
- Keep gameplay events edge-triggered (`enter` / `exit`), not emitted every frame.
- Lazy-load expensive assets/systems behind zones where appropriate.

## Definition of a strong prototype

The prototype is successful when the loop below is stable:

```text
author on phone
-> save one map file
-> reload
-> runtime reproduces authored behaviour
-> edit again without code changes
```

Player Spawn + Gameplay Zone is the first proof of that loop. Farm Zones, Portals and NPC anchors should reuse it rather than introduce new authoring architectures.
