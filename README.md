# Liora Farm — Clean Rebuild

This branch is a controlled rebuild of Liora Farm.

## Rule

`main` is the archive/reference. This branch only receives systems after they are proven useful.

## Milestone 1 — Foundation

Included now:

- Three.js renderer + simple lighting
- Liora production GLB + animation blending
- Mobile joystick / keyboard input
- Camera-relative walk + run
- Existing slope/collision/water-ready movement core
- Existing mobile orbit/pinch/follow camera
- System registry with deterministic teardown
- Minimal performance HUD
- One simple grass ground

Not booted yet:

- Terrain sculpting
- Ground paint/layers
- Water rendering/interactions
- World Editor
- Farming
- NPC life
- Audio runtimes
- Day/night, wind, cloud shadows, environment life
- Backdrops / floating islands

Those systems remain preserved on `main` and will return one layer at a time.

## Run

Serve the repository over HTTP and open `index.html`.

GitHub Pages preview can be tested by temporarily publishing this branch or merging when a milestone is approved.
