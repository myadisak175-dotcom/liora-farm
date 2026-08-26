# Termux HTTP Server Workflow

This is the mobile development workflow for the current repository. The
Builder is part of the single production `index.html`; it is not a separate
embedded-asset build.

## Why this exists

ES modules, `fetch`, GLB files and the import map require HTTP. Opening
`index.html` with `file://` will not boot the production game correctly.

## Package layout

```text
index.html
assets/
└── models/
    ├── builder/
    │   ├── house.glb
    │   ├── house2.glb
    │   ├── tree.glb
    │   ├── palm.glb
    │   ├── pine.glb
    │   ├── grass.glb
    │   ├── crate.glb
    │   ├── wine_barrel.glb
    │   └── path_tile.glb
    └── player/
        └── liora_all_animations_web.glb
```

## Termux

Run the repository through HTTP, not `file://`:

```bash
cd <liora-farm-folder>
python3 -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000
```

Builder mode is available from the **สร้าง** button in the game.

Useful checks:

```text
http://127.0.0.1:8000/selftest.html
http://127.0.0.1:8000/audio-test.html
http://127.0.0.1:8000/?perf=1
```

## Legacy conversion tool

`tools/split_builder.py` is retained for converting an old embedded Builder
prototype into a split folder. It is not part of the current production boot:

```bash
python3 tools/split_builder.py input.html outdir/
cd outdir
python3 -m http.server 8000
```

## Rules

- `maps/home-island.json` remains canonical map data and must not be tied to one HTML build.
- New production Builder assets belong under `assets/models/builder/` and should be catalog-driven.
- Do not re-embed production GLBs into `index.html` just to make `file://` work; use the Termux HTTP server instead.
- Do not reintroduce a second production Builder HTML page.
- Run `selftest.html` after changing Builder touch controls, mode switching or HUD layout.
