# Best-of baseline

The canonical mobile page is `builder/best-of.html`. The root `index.html` opens that page so the game and the Home Island Builder share one world.

## Combined systems

- Locked orbit camera, pinch zoom, camera-relative joystick movement, smooth follow and Liora animation timing.
- Grass, dirt, farm plot, floating island, 360° sky, day/night, running FX and contact shadows.
- Calm animated river with a visible bridge and river collision; Liora can cross only at the bridge.
- Builder assets use the shared catalog and lazy GLB loader, including target-height calibration.
- Builder layout is shown in play mode and edited in build mode, using the same item list and storage key.
- Undo, JSON import/export, contextual placement controls and ground splat painting.

## House rule

Buildings are available as Builder pieces and are not forced into the starter scene. The starter layout keeps only the existing nature decoration; the player can assemble the house.

## Recovery

Older Builder pages and the previous gameplay modules remain in Git history. The old remote v6.25 bootloader is no longer the root entry point for the combined baseline.
