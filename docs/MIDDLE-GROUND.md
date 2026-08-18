# Middle ground

## The hole this fills

Mapping every scenery band against `config.js` gave this:

| distance | what is there |
|---|---|
| 0–38 m | playable farm |
| **38–166 m** | **nothing — flat ground, 128 m of it** |
| 166–196 m | near mountain band |
| 252–298 m | mid mountain band |
| 330–462 m | distant peaks |
| 236–320 m | floating islands (in the sky) |

That empty stretch is also the one that fills the most screen. A 12 m object
covers 30% of the screen height at 60 m, 18% at 100 m, and only 10% by the time
it reaches the first mountain band at 180 m. Every piece of scenery in the
project sat past 166 m, so the nearest and largest band was the emptiest one.

## Why not just decimate the tree models

That was the first plan, reusing `tools/optimize_background_glb.py`. It does not
work on trees, and the numbers are worth keeping so nobody tries again:

| model | original | best clustering | silhouette IoU |
|---|---|---|---|
| floating island | 103k | 26k (26%) | 99.75% |
| `NormalTree_1` | 8,520 | 4,849 (57%) | 99.3% |
| `NormalTree_1` | 8,520 | 3,187 (37%) | 86.2% — visibly broken |

Vertex clustering collapses vertices that share a grid cell. A rock is one
connected surface, so that works. A tree is dozens of separated leaf clusters
with air between them, and no grid size merges across the gaps — it stalls near
3,000 triangles and then destroys the canopy. Getting a tree to ~800 triangles
needs quadric edge collapse or a billboard, not this tool.

## The budget

A portrait phone has roughly 18 degrees of horizontal FOV, so about **5% of the
ring is on screen at once**. That is the number that makes the band affordable:

```
count 420, weighted average 2,068 tris  ->  868,680 across the whole ring
                                            ~43,000 visible per frame
```

`count` in `CONFIG.treeLine` is a total across the ring, not a visible count.
Multiply by 0.05 to get the per-frame cost.

## Three decisions in `tree-line.js`

**Sectors.** `editor/instanced-pool.js` already documents the trap: an
InstancedMesh's bounding sphere covers every instance, so one mesh holding the
whole ring can never leave the frustum and every tree is submitted every frame.
The ring is split into 16 wedges, each with its own meshes and its own tight
sphere. `tree-line.test.html` pins this — it is the whole reason the system is
shaped the way it is.

**Seeded, never saved.** Generated from `seed` like the painted backdrop bands,
not placed through the builder. A few hundred trees in the layout store would
bloat every autosave and let the player delete the horizon by accident.

**Nothing under `minHeight`.** A 0.69 m bush is about 8 px tall at 60 m. The
system reads `sourceHeight` from the nature catalog and refuses anything
shorter, with the reason in `stats.skipped`.

## Adding a kind of tree

One line in `CONFIG.treeLine.items` with a catalog id from
`editor/nature-catalog-v2.js` and a weight. No code.

## Standing on generated ground

The band sits outside the playable square, on the outer world — which is a
formula, not an authored mesh. `createOuterWorldHeightSampler` runs that vertex
loop backwards so scenery can be placed without a raycast.
`horizon-polish.test.html` asserts the sampler agrees with the real vertices to
within 2 cm across the band; if that ever drifts, trees float in one build and
sink in the next.

## Tuning on the phone

The horizon panel has a `กลางทุ่ง` group: count, inner and outer radius, plus a
toggle. Dragging them calls `treeLine.rebuild()`, which re-scatters from the
geometry already in memory and never re-downloads a GLB. Moving the ground
dials rebuilds the height sampler too, so the trees follow the new surface.

Watch **worst-frame** in `?perf=1`, not average FPS — a band that costs too much
shows up as a stutter when you orbit into a dense wedge, which an average hides.

## Not done

The outer tier, 90–150 m as cross-billboards baked from the same models, is not
built. It would cost about 4 triangles per tree instead of 2,000. Do it only if
the inner band alone does not fix the emptiness — measure first.
