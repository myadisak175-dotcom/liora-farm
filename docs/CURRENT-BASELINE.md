# Liora Farm — Current Baseline

Updated: 2026-08-18 (Thailand)

## Active runtime baseline

- Branch: `main`
- Runtime commit: `ca79580d70bad1f7d71fbbc17e42ad8472866d7a`
- Commit title: `Merge pull request #48: mobile audio fixes, summer sky, butterflies, fullscreen`
- Build marker: `worlds-3-gentle-living-environment`
- App revision: `audio16`
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
- the authored 1+3 floating-island GLB backdrop

The editable terrain is 80 x 80 m. The outer world is visual scenery; the
player remains inside the authored play area without a visible wall.

### Living environment

- saturated summer-blue sky with a narrow pale horizon band
- a sun drawn into the sky dome without another draw call
- wind-driven clouds, cloud shadows and layered moving outer mist
- gentle player interaction with grass, bushes and flowers
- colourful butterflies that wander, rest on land and avoid landing on water
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

- Foundation tests for PR #48 completed successfully (run 146).
- Audio mix, audio asset, environment-life and fullscreen regression pages are
  registered in `tools/test/run.mjs`.
- `node tools/test/run.mjs` is the current automated source of truth.
- Hands-on testing on the target phone is still required for sound level,
  stream recovery, touch feel, fullscreen and visual colour judgement.

## Current boundary and scenery decisions

- `CONFIG.worldBoundary` is disabled with `type: "none"`.
- `worldLimit = 38` is the invisible gameplay safety boundary.
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
