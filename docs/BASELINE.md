# Locked Baseline — Liora Floating Island 360 Sky

Approved mobile gameplay + environment baseline. Latest approved environment checkpoint: `dbee7d5a3733fcbaa100eb819adb05f87da59247`.

## Locked gameplay behavior
- Perspective 3/4 isometric camera as the default/reset view
- 1-finger orbit camera around Liora
- 2-finger pinch zoom
- Reset-camera button returns to the approved isometric view
- Camera-relative movement: joystick direction always follows the screen after camera rotation
- Camera dead zone + smooth follow so the ground does not feel like it slides too quickly
- Walk speed = `2.4` world units/sec
- Run speed = `5.2` world units/sec
- Walk animation playback = `0.9x`
- Dynamic directional-light shadow follows Liora
- Grass receives shadows
- Dirt path receives shadows
- Grass `renderOrder = 0`
- Dirt path `renderOrder = 1`, `y = 0.003`, `alphaTest = 0.28`, `depthWrite = true`
- Liora `renderOrder = 10`, `depthTest = true`, `depthWrite = true`
- 7 animations: Idle, Walking, Running, Pick Up, Pull Radish, Hammer Swing, Mirror Viewing

## Locked camera tuning
- Orbit sensitivity = `0.006`
- Pitch sensitivity = `0.0045`
- Pitch range = `28°–55°`
- Follow dead zone = `0.55`
- Follow sharpness = `3.2`
- Camera position sharpness = `5.5`

## Locked environment behavior
- Floating-island world under the approved grass surface
- 3D cliff/island underside replaces the flat exposed world edge
- Procedural sky sphere surrounds the scene in full 360°
- Sky gradient remains stable while orbiting the camera
- Horizon haze is preserved for altitude/depth feeling
- Cloud rings surround the island so clouds remain visible around the full horizon
- Sky system lives in `src/systems/sky.js`
- Floating-island system lives in `src/systems/floating-island.js`

## Safe workflow
1. Treat this baseline as approved and do not casually retune camera, movement, animation speed, depth, shadows, floating-island structure, or 360° sky.
2. Add new gameplay/environment systems without changing the locked feel unless a deliberate new baseline is being tested.
3. Change one subsystem at a time.
4. Test every camera/movement/environment change on mobile before accepting it.
5. Keep binary assets under `assets/` and gameplay/environment logic under `src/`.
6. Preserve the approved grass/path art direction unless intentionally revisiting it.
