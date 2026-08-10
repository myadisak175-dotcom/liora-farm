# Liora's Farm — Project Architecture

The production code is organized so new features can be added without retuning the locked movement/camera feel.

## Production structure

```text
src/
├── main.js                 # composition + game loop only
├── config.js               # approved tuning and asset paths
├── entities/
│   └── player.js           # model loading + animations
├── zones/
│   └── home-island.js      # Home Island environment/ground
├── systems/
│   ├── input.js            # joystick/input
│   ├── movement.js         # camera-relative movement + world bounds
│   ├── camera.js           # orbit/pinch/smooth follow
│   ├── lighting.js         # sun, shadows, environment lighting
│   ├── sky.js              # 360° procedural sky
│   ├── day-night.js        # global game time
│   ├── run-fx.js           # running particles
│   └── contact-shadow.js   # grounded body + foot contact shadows
└── experiments/
    └── pond-v1.js          # unfinished pond prototype, not production
```

## Rules

1. `main.js` coordinates systems; it should not contain feature implementation details.
2. Locked values live in `config.js`; avoid hard-coded gameplay tuning elsewhere.
3. Zone-specific environment content belongs under `src/zones/`.
4. Reusable gameplay/rendering behavior belongs under `src/systems/`.
5. Player/model behavior belongs under `src/entities/`.
6. Unapproved prototypes belong under `src/experiments/` and must not be imported by production `main.js`.
7. Binary assets stay under `assets/`.
8. Test one subsystem at a time before promoting it from `experiments/` to production.

## Locked production baseline

- Home Island grass-only base
- Camera-relative movement
- Walk speed 2.4
- Run speed 5.2
- Walk animation 0.9x
- Orbit camera + pinch zoom + smooth follow
- 360° sky + day/night
- Running FX
- Dynamic shadows
- Approved grounded Liora offset and compact foot contact shadows

The pond remains experimental until the terrain supports a proper cutout/basin instead of placing water beneath an uncut grass plane.
