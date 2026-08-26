# Liora Farm — Current Baseline

Updated: 2026-08-18 (Thailand)

## Active runtime baseline

- Branch: `main`
- Runtime commit: `05bc91d4db67c0bd20889271c69a3df8816bf897`
- Commit title: `Merge pull request #49: mountain horizon, connected world, calmer butterflies`
- Build marker: `worlds-4-mountain-horizon`
- App revision: `world17`
- GitHub Page: `https://myadisak175-dotcom.github.io/liora-farm/`

The runtime commit above is the accepted code baseline. A later documentation-only
commit does not replace it unless runtime code also changes.

## What is included

### World and authoring

- World Blend and Scene Depth
- ground micro-detail normal
- multi-world map schema v2, map registry and map picker
- per-map save scoping and landscape presets
- ground paint continuation from playable terrain onto the outer world
- a visually blended gameplay edge with an invisible `worldLimit = 38`
- seeded middle-ground tree line
- greener outer-world colours and a later sky blend, so the valley floor reaches the foothills
- pointed near/far ridge bands plus two instanced rings of built, snow-capped summits
- the authored 1+3 floating-island GLB backdrop

The editable terrain is 80 x 80 m. The outer world is visual scenery; the
player remains inside the authored play area without a visible wall.

### Living environment

- saturated summer-blue sky with a narrow pale horizon band
- a sun drawn into the sky dome without another draw call
- wind-driven clouds, cloud shadows and layered moving outer mist
- gentle player interaction with grass, bushes and flowers
- a six-butterfly budget (quality tiers 2/4/6) with catalog-derived flower patches,
  bloom-height landings and periodic patch refresh
- falling leaves deliberately disabled in `CONFIG.environmentLife.leaves`

### Mobile audio and display

- Audio Foundation v8 with terrain-aware footsteps and day/night ambience
- element-volume probing with a Web Audio gain fallback for iOS
- mute choice and music position preserved across full-page world switches
- automatic recovery for refused, paused and stalled streams
- `audio-test.html` device report for real-phone failures
- Fullscreen toggle using the standard API and legacy WebKit prefix
- Add to Home Screen guidance where iPhone Safari exposes no element fullscreen API

## Validation state

- Foundation tests for PR #49 completed successfully (run 150, 422/422 reported checks).
- Audio mix, audio asset, environment-life and fullscreen regression pages are
  registered in `tools/test/run.mjs`.
- The current environment-life tests cover pure patch/flight rules but do not
  execute the first real `createEnvironmentLife().update()` insect respawn path.
- Hands-on testing on the target phone is still required for sound level,
  stream recovery, touch feel, fullscreen, butterfly behavior and visual colour judgement.

## Known regression on current main

`respawnInsect()` calls `movePatch(insect, findFlowerPatch(...))`, then still
reads `patch.x` and `patch.z` even though no local `patch` variable exists. The
first active butterfly therefore throws `ReferenceError: patch is not defined`.

`systems/registry.js` isolates the failing environment-life update, so walking,
saving and rendering continue. However, butterflies do not update and the same
error is logged every frame. A hotfix must retain the result of
`findFlowerPatch()`, use it for both `movePatch()` and the spawn position, and
add a regression test that constructs the system and runs its first update.

## Current boundary and scenery decisions

- `CONFIG.worldBoundary` is disabled with `type: "none"`.
- `worldLimit = 38` is the invisible gameplay safety boundary.
- fog starts at 150 m and reaches full blend at 552 m, inside the nearest 562 m world rim.
- the near/far mountain bands remain at 166–196 m and 252–298 m; distant
  snow-capped summits occupy 330–462 m.
- `CONFIG.distantRange.floatingIslandBackdrop.enabled` is `true`.
- `assets/models/background/floating_island_hero.glb` is deployed and loaded
  asynchronously; failure remains non-blocking because it is scenery only.
- the older procedural `floatingIslands` system remains disabled.

## Deliberately not production gameplay yet

- NPC Life remains an optional `?npc=1` test baseline, not the main game loop.
- daily schedules, needs, relationships, quests, dialogue choices, navigation
  and crowd simulation are future work.
- falling-leaf particles remain off by design.

## Resume rule

Start from the current `main`, then verify `BUILD` in `src/config.js` and
`APP_REVISION` in `src/main.js` against this file. If either changes in an
accepted runtime release, update this document in the same PR.
