# Interaction System v1

The interaction layer connects runtime characters to world objects without coupling gameplay to Meshy model names, mesh hierarchies or Builder internals.

## Flow

```text
Player / Character
      ↓
InteractionSystem
      ↓
closest valid target
      ↓
Interaction definition
      ↓
semantic action
      ↓
Character interaction bridge
      ↓
Animation (optional)
      ↓
domain callback
      ↓
VFX / Audio / Inventory / Scene transition / World state
```

## Files

```text
src/
├── data/
│   └── interactions.js       # assetId -> semantic interaction metadata
└── systems/
    ├── interaction.js        # proximity focus + action dispatch
    └── interaction-actions.js# Character animation -> domain callback bridge
```

## Responsibilities

### `data/interactions.js`

Defines what an asset means to gameplay. Example:

```js
{
  type: "chop",
  label: "ตัดต้นไม้",
  range: 2.6,
  animationKey: "hammer"
}
```

The entry is keyed by a stable asset ID such as `tree`, not a GLB filename or Three.js mesh name.

### `systems/interaction.js`

- finds nearby targets
- chooses one focus target
- respects per-action range
- dispatches a semantic action to a registered handler
- never edits inventory, destroys trees, opens doors or changes scenes itself

### `systems/interaction-actions.js`

Optional bridge for animated characters. If a definition contains `animationKey`, the matching Character action is played first. The domain callback runs when the one-shot animation finishes.

This gives actions consistent timing without making InteractionSystem depend on AnimationController.

## Runtime target contract

A Builder-placed object already exposes stable metadata on its root:

```js
object.userData.builderAssetId
object.userData.builderItemId
```

`getSceneInteractableRoots(scene)` uses that contract and ignores Builder preview objects.

Future runtime entities may use a custom `resolve(target)` adapter rather than Builder metadata. This allows NPCs, creatures, dropped items and doors to share the same detector.

## Example integration

```js
const interactions = createInteractionSystem({
  actor: () => player?.root,
  getTargets: () => getSceneInteractableRoots(scene),
  canInteract: () => Boolean(player) && !player.isBusy(),
  onFocusChanged: (focus) => {
    actionButton.textContent = focus?.definition.label ?? "";
    actionButton.hidden = !focus;
  },
});

const bindings = bindCharacterInteractions({
  interaction: interactions,
  character: player,
  animations: ANIMATIONS,
  actions: {
    chop: ({ target }) => treeSystem.hit(target),
    enter: ({ assetId }) => doorSystem.enter(assetId),
    inspect: ({ assetId }) => inspectSystem.open(assetId),
  },
});

interactionButton.onclick = () => interactions.perform({ player });
```

For a tree, the `hammer` animation can finish before `treeSystem.hit()` applies damage, drops resources and triggers impact feedback. The detector still knows nothing about tree HP or inventory.

## Current definitions

- Tree / Pine / Palm -> `chop` using the existing `hammer` animation key
- House / House 2 / Blue Cottage -> `enter`
- Bench -> `sit` using the existing `walkToSit` animation key
- Crate / Crate Set / Barrel -> `inspect`

The system also reserves semantic types for `pick-up` and `talk` so dropped items and NPCs can plug into the same API later.

## Rules

1. Interaction definitions use stable gameplay IDs, not model filenames.
2. Detection and action execution remain separate.
3. InteractionSystem must not own Inventory, Quest, VFX or Audio logic.
4. A character that is already busy with a one-shot action should not start another action.
5. Animation timing is optional presentation; domain state changes are callbacks owned by their systems.
6. New world objects should normally add data + a handler instead of adding `if (assetId === ...)` branches to the game loop.
7. Builder remains an authoring tool; normal runtime interaction must not depend on Builder UI state.
