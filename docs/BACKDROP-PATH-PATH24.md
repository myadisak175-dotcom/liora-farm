# Distant path backdrop — path24

- Authored source: `assets/textures/_src/backdrop-path.png` — 4096 × 512.
- Runtime asset: `assets/textures/backdrop-path.webp` — 1024 × 34, about 15 KB.
- The magenta source background is keyed to alpha; the runtime strip is cropped to the painted content and downscaled because it is only viewed at long distance on mobile.
- `PaintedPath` is injected before game boot at radius 424 m, height 20 m, y 0, repeat 2.
- It sits between the opaque outer ground at 418 m and `PaintedMeadow` at 430 m, replacing the pale horizon rim with the painted dirt road, low fences, shrubs and flowers.
- Existing meadow, treeline, peaks, terrain, camera, gameplay and audio21 are unchanged.
