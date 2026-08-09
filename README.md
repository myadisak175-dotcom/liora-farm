# Liora's Farm

Three.js 2.5D web-game baseline, built mobile-first.

## Current step

- Elevated 3/4 camera
- Mobile joystick + keyboard movement
- Seamless stylized grass texture (`assets/textures/grass.webp`)
- Texture tiled across the ground with `RepeatWrapping`
- Temporary placeholder player
- No GLB models yet

## Project structure

```text
index.html
src/main.js
styles/main.css
assets/textures/grass.webp
assets/models/
assets/sprites/
```

Add assets gradually and keep binary assets outside the HTML so the build stays lightweight.
