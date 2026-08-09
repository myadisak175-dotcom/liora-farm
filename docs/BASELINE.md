# Locked Baseline — Liora Isometric Depth Fixed

Approved mobile baseline. Change only one subsystem at a time.

## Locked behavior
- Perspective 3/4 isometric camera
- Original joystick/world-axis movement
- Grass renderOrder 0
- Dirt path renderOrder 1, y=0.003, alphaTest=0.28, depthWrite=true
- Liora renderOrder 10, depthTest/depthWrite=true
- 7 animations: Idle, Walking, Running, Pick Up, Pull Radish, Hammer Swing, Mirror Viewing

## Safe workflow
1. Branch before changing camera, movement, or depth.
2. Test on mobile before merging.
3. Keep binary assets under `assets/` and logic under `src/`.
4. Do not change grass/path baselines unless intentionally revisiting art direction.
