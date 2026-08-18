# Floating islands — framing

Portrait-mobile framing for the authored 1+3 floating-island backdrop.

## Why the cluster was invisible

It was authored, tuned twice, and never once on screen. Two separate causes,
both silent:

**1. It sat above the top of the screen.** The camera looks straight at the
player from `baseOffset (8, 10, 10)`, so the top edge of the view sits at
`camera.minPitch - camera.fov/2` degrees. At the old `minPitch` of 14° that is
5° above the horizon. The islands were at `y` 72–96, which put them around 15°
up — roughly 10° past the top edge, at every pitch and every zoom.

**2. The `เกาะลอยฟ้า` toggle drove the wrong system.** It set
`distantRange.floatingIslands.enabled`, the procedural islands that shipped
disabled. The authored GLB cluster it appears to control is
`distantRange.floatingIslandBackdrop`, which it never touched. Both have since
collapsed into one top-level `floatingIslands` block — the procedural system was
deleted with the built horizon.

`y` is the number that decides whether any of this is visible. `radius` and
`scale` only decide how big it looks once it is.

## Current values

`camera.minPitch` is 7°, which opens 12° of sky when the player drags the
camera down. Everything below is inside that, measured at the worst case —
player standing at the near edge of the farm, island at the top of its bob.

| | angle | radius | y | scale | elevation on screen |
|---|---|---|---|---|---|
| hero | 3.97 | 280 | 45 | 11.8 | 8.3° (11.3° worst case) |
| support, ~6° left | 3.80 | 236 | 36 | 7.4 | 7.7° |
| support, ~6° right | 4.14 | 244 | 38 | 6.6 | 7.9° |
| support, behind hero | 3.97 | 320 | 54 | 5.6 | 8.8° |

The hero is centred on the default camera heading; the supports sit about six
degrees to either side so the whole cluster fits the narrow horizontal FOV.

`fog.far` is 552 rather than 460, or the hero arrives about 57% blended into
the sky colour. It still sits under the nearest world rim
(`outerWorld.outerRadius - worldLimit` = 562), so the fog rule still passes.

## The guardrail

`checkHorizonRules()` now has a `เกาะลอยฟ้าอยู่ในกรอบจอ` rule that measures
every backdrop item against the camera frustum and fails with the number of
degrees each one is off by. The pre-existing `view` rule was not enough: it
only asked whether *some* sky was visible, which passed happily while the
content in that sky was not.

Raising `camera.minPitch` — including through a world preset, which can set
`cameraMinPitchDeg` as high as 40 — pushes the islands back off the top edge.
The horizon panel will say so.

## The model

`assets/models/background/floating_island_hero.glb` is the authored asset run
through `tools/optimize_background_glb.py`: 103k triangles and four 1024px PBR
maps down to 26k triangles and two textures, 7.19 MB to 1.17 MB. It renders
about 60px tall on a phone, four times, behind fog — the normal and
metallic-roughness maps could never show there.

`tools/verify_background_glb.py` measures the silhouette rather than trusting
the triangle count: worst-case IoU is 99.75% at 4× the shipped size. It also
reports that the mesh has ~1.2k open edges, which is why backface culling is
*not* enabled on it.

Both scripts are re-runnable; the original asset is recoverable from git
history.

## Non-negotiables

- The GLB loads async and never blocks boot. A scenery asset must not be able
  to hold the playable game.
- Scenery only: no collision, no terrain sampling, no saving, no builder
  ownership.
