# Termux Builder Server Workflow

This is the accepted mobile development workflow for the split Builder package.

## Why this exists

The standalone Builder was useful for direct `file://` testing, but embedded GLB models made the HTML file very large. The split workflow keeps `index.html` small and stores GLB files under `assets/` so future models can be added without growing the HTML indefinitely.

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
        └── liora_all_animations_web_1k.glb
```

## Termux

Run the Builder through HTTP, not `file://`:

```bash
cd <builder-folder>
python3 -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000
```

## Conversion tool

`tools/split_builder.py` converts the optimized embedded Builder HTML into the split server layout:

```bash
python3 tools/split_builder.py input.html outdir/
cd outdir
python3 -m http.server 8000
```

## Rules

- `maps/home-island.json` remains canonical map data and must not be tied to one HTML build.
- New production Builder assets belong under `assets/models/builder/` and should be catalog-driven.
- Do not re-embed production GLBs into `index.html` just to make `file://` work; use the Termux HTTP server instead.
- Keep v6.12 Safe Edit behavior, MapSafe Export/Import, Safe Edit Cancel, and the approved optimized texture policy.
- The split package is the preferred direction for ongoing mobile development because it is closer to production architecture.
