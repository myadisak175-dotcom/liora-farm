# Ground Layers

How the painted ground works, and how to add a surface.

## Adding a surface

1. Put a square, seamlessly tiling image in `assets/textures/`. `.webp` — runtime layers are resampled to `CONFIG.groundPaint.tileSize`
   (currently 512²), so larger shipping textures add bytes without adding runtime detail.
2. Add one row to `CONFIG.groundPaint.layers` in `src/config.js`:

```js
{ id: 8, key: "snow", label: "หิมะ", icon: "❄️", texture: "snow.webp", feather: "medium" },
```

That is the whole change. The brush button, the splat channel, the texture
array slot and the fragment shader are all generated from that row.

**Never reuse or renumber an `id`.** It is what every stroke is saved as, so
changing one repaints existing worlds with the wrong surface. The next free id
is currently `8`; keep increasing from there as new surfaces are added.

`feather` picks how softly the brush melts into the surrounding ground:
`"long"` for paths and soil, `"medium"` for shorelines, `"short"` for hard
edges like rock. An explicit `[[stop, mix], ...]` curve works too.

## How the weights are stored

One splat **page** is an RGB canvas: three layers, one per channel. Pages are
created the first time something is actually painted on them, so a world that
only uses dirt and sand costs exactly one page no matter how many layers the
config declares.

The **base layer** (`base: true`, currently grass) owns no channel. Its weight
is `1 - (everything painted)`, which is what makes its brush the eraser and
what shows through everywhere untouched. Exactly one layer may be the base.

```
layers declared    16   (CONFIG.groundPaint.maxLayers)
paintable          15   (16 minus the base)
splat pages         5   (ceil(15 / 3))
```

A layer's `id` is stable and saved to disk. Its `channel` — which page and
which colour byte — is derived from the order of the paintable layers, so it
can be recomputed freely. `src/systems/ground-layers.js` owns that derivation
and refuses to build a registry with a duplicate id, no base, or two bases.

## How it reaches the GPU

Every surface is packed into one `DataArrayTexture` (`sampler2DArray`), each
slice resampled to `CONFIG.groundPaint.tileSize`. One sampler for all 16
layers: separate samplers plus the splat pages plus what
`MeshStandardMaterial` binds would blow past the fragment texture units that
weaker mobile GPUs actually ship.

`ground-paint.js` generates the fragment chunk from the registry and splices it
into `#include <map_fragment>`. A layer contributing less than 0.0025 is
skipped entirely, so a pixel with one surface on it costs two texture fetches,
not sixteen. The gradients for those lookups are taken once outside the
branches — derivatives are undefined in non-uniform control flow, which is why
the sampling uses `textureGrad` rather than a plain lookup.

Allocating a new page changes the generated source, so `customProgramCacheKey`
includes the live page list. Without that three.js hands back the cached
program and the new layer silently never appears.

## Costs

| | |
| --- | --- |
| Splat page | 1024² RGBA canvas + a snapshot canvas allocated on demand |
| Texture array | `tileSize² × 4 × layers` — 16 MB at 512² for 16 layers |
| Fragment fetches | 1 array lookup per layer with weight, plus 1 per live page |

Declaring layers is free. Painting on them is what allocates.

## Save format

Unchanged, and still `version: 1`. A stroke is
`[x, z, radius, layerId, strength]`; `groups` records how many stamps each
finger-drag produced so undo pops a whole drag. Saves written by the old
four-layer build load as-is, because dirt/sand/rock kept ids 0/1/2 and
therefore the same channels they had when the shader hardcoded them.

A stroke whose `layerId` is no longer in the config is dropped on load rather
than drawn — removing a layer degrades an old save instead of corrupting it.

## Tests

```
node tools/test/run.mjs
```

Drives Chromium over the DevTools protocol against `tools/test/*.test.html`:

- `ground-layers.test.html` — registry rules, page allocation, undo fidelity
  (pixel hashes, not bookkeeping), eraser across pages, save round-trips,
  legacy and degraded saves.
- `ground-shader.test.html` — compiles the *generated* GLSL on a real WebGL2
  context at the 16-layer / 5-page worst case, then renders and reads back
  pixels to confirm the blend maths.
- `paint-panel.test.html` — the brush grid at real phone viewports, so 16
  buttons cannot push the action row off the bottom.

These run with a stub `three` module (`tools/test/three-stub.js`) so they work
without network access. `selftest.html` still covers the real game end to end.
