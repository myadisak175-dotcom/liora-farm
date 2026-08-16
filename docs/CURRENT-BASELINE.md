# Liora Farm — Current Baseline

Updated: 2026-08-17 (Thailand)

## Active runtime baseline

- Branch: `main`
- Runtime commit: `33c97bdc7909eb0e7fd1e7d04d3bb2ee659944e0`
- Commit title: `Blend seam and harden invisible play boundary`
- GitHub Page: `https://myadisak175-dotcom.github.io/liora-farm/`
- Build marker remains: `worlds-2-detail`

## What is included

- World Blend
- Scene Depth
- Ground Micro Detail Normal
- World Authoring / multi-world map schema v2
- Per-map save scoping
- Map registry / map picker
- Landscape presets
- Ground paint continuation from the playable terrain onto the outer world
- Seam refinement at the gameplay edge
- Invisible play boundary around the authored `worldLimit = 38`

## Latest edge work

The playable terrain is 80 m wide. The outer world remains visual scenery and the player is clamped inside the playable area.

Latest seam refinement:

- outer-world overlap reduced to about `0.35 m`
- outer-world vertical drop reduced to about `0.015 m`
- no visible gameplay wall or physical gap was added
- no far-ground colour tuning was included
- no player/object shadow tuning was included

## Validation state

- JavaScript syntax checks pass.
- Ground shader tests: `14/14`
- Open-world seam tests: `5/5`
- Full browser regression: `270/276`
- The remaining 6 failures are pre-existing test scaffold/HUD expectation issues, not new runtime failures from the latest edge work.

## Deliberately NOT included yet

### Floating island GLB experiment

The Meshy floating-island model was prepared separately as a background experiment, but it is **not deployed and not part of this baseline**.

Do not treat `worlds-2-floating-island` as the active project baseline unless it is explicitly reviewed and merged later.

## Resume rule

When continuing Liora Farm, start from `main` / runtime commit `33c97bdc7909eb0e7fd1e7d04d3bb2ee659944e0` (plus this documentation-only checkpoint commit), unless a newer accepted runtime has been deployed after this file was written.
