# Character System v1

Character System v1 gives Player, NPCs and creatures one shared runtime contract while keeping gameplay systems independent from Meshy clip names.

## Layering

```text
Meshy / GLB
   ↓
createCharacter()
   ↓
AnimationController
   ↓
CharacterStateMachine
   ↓
Player / NPC / Creature adapter
   ↓
Movement / AI / Interaction / Dialogue systems
```

## Shared character contract

Every character returned by `createCharacter()` exposes:

- `root` — world transform used by movement/AI systems
- `model` — loaded GLTF scene
- `animation` — low-level AnimationController
- `state` — semantic Character State Machine
- `setLocomotion({ moving, running })`
- `playAction(clipName, options)`
- `interact(clipName, options)`
- `updateAnimation(delta)`
- `isBusy()`
- `getState()` / `getAction()`
- `dispose()`

The state machine owns semantic states:

- `idle`
- `walk`
- `run`
- `interact`
- `action`

Gameplay systems should prefer those semantic APIs. They should not manipulate `THREE.AnimationAction` directly.

## Meshy animation mapping

Meshy clip names remain configuration/data. A character can supply a map like:

```js
const animations = {
  idle: "Idle",
  walk: "Walking",
  run: "Running",
  pickUp: "PickUp",
  hammer: "Hammer_Swing",
};
```

The runtime does not require every model to use the same raw clip names. NPCs or creatures may map different clip names to the same semantic state.

## Liora compatibility

`createPlayer()` is now a thin adapter over `createCharacter()`. The existing Best-of build can continue using:

- `player.fadeTo(...)`
- `player.playSpecial(...)`
- `player.isSpecial()`
- `player.mixer.update(delta)`

Those compatibility calls are routed through Character State Machine / AnimationController internally.

New code should gradually use:

```js
player.setLocomotion({ moving, running });
player.playAction(ANIMATIONS.hammer);
player.updateAnimation(delta);
```

No camera, movement-speed or world tuning needs to know which Meshy model is loaded.

## NPCs

Create NPCs through `createNPC()` and keep these responsibilities outside the entity loader:

- schedule/path decisions
- dialogue
- relationship state
- quest logic
- interaction prompts

An NPC AI system should decide where an NPC wants to move, then update its `root` and call `setLocomotion()`.

## Creatures

Create animated creatures through `createCreature()`. If a Meshy creature has no useful skeletal clips, it can still use the shared character root/model contract and receive procedural motion from a creature system.

Examples of procedural motion that do not need skeletal animation:

- bobbing/floating
- squash and stretch
- look-at rotation
- hopping the whole root
- wing/ear/tail transforms when exposed as separate nodes

## Rules

1. Do not create a second GLTF loading pipeline for NPCs or monsters.
2. Do not hard-code Meshy clip names into movement, AI or interaction systems.
3. One-shot actions lock locomotion until their animation finishes.
4. Character state must be queryable without reading Three.js animation internals.
5. Character assets may change without requiring camera/world/Builder changes.
6. Keep gameplay AI and dialogue outside `src/entities/`.
