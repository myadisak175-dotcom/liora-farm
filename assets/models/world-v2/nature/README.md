# Nature Pack — prepped for liora-farm

Source: Quaternius "Ultimate Stylized Nature Pack" (CC0 — free for commercial use).
12 GLB files, 55 objects. Same art family as the birch trees already in the project.

25.1 MB → 6.5 MB. VRAM if every file is loaded: ~151 MB → ~27 MB.

## What was changed

| | |
|---|---|
| Pivots | Every object now stands exactly on `y = 0` at the origin. The original files had objects strung along X (up to 221 units away) — placing them raw made them appear far off-screen. |
| Rotation | Left as authored. The bushes and flower bushes are deliberately tilted; forcing them upright would flatten that. |
| Foliage materials | `BLEND` → `MASK`, `alphaCutoff 0.45`, `doubleSided: true` — matches the birch file already working in the project. BLEND causes transparency sorting artifacts on mobile. |
| Colour textures | 1024 (rocks 2048) → 512. JPEG q88 where opaque, PNG where alpha is needed. |
| Normal maps | → 256, JPEG. Bark normals are low-frequency; 256 is indistinguishable at gameplay distance. |
| Filenames | kebab-case, no spaces (spaces need URL-encoding on GitHub Pages). `Dead Trees-F5I0Q7TwO5` → `dead-trees-2`. |

Geometry, UVs and vertex counts are untouched.

## Using it

Each file holds several objects as named nodes. Load once, pick by name, clone:

```js
const gltf = await loader.loadAsync('assets/models/world-v2/nature/pine-trees.glb');
const tree = gltf.scene.getObjectByName('PineTree_2').clone();
tree.position.copy(placementPoint);   // pivot is at the base — no y offset needed
```

`nature-manifest.json` lists every object with its height, footprint width and
triangle count — use it to populate the asset catalog.

## Object counts

| File | Objects | Tris | Size |
|---|---|---|---|
| birch-trees | 5 | 27,158 | 1.56 MB |
| trees | 5 | 32,220 | 1.47 MB |
| maple-trees | 5 | 21,086 | 0.96 MB |
| dead-trees-1 | 5 | 19,952 | 0.55 MB |
| pine-trees | 5 | 10,366 | 0.53 MB |
| dead-trees-2 | 5 | 15,464 | 0.45 MB |
| bushes | 3 | 1,298 | 0.27 MB |
| flowers | 7 | 1,360 | 0.19 MB |
| palm-trees | 5 | 1,920 | 0.18 MB |
| rocks | 5 | 2,230 | 0.16 MB |
| flower-bushes | 3 | 580 | 0.16 MB |
| grass | 2 | 574 | 0.04 MB |

## Watch out

- **Draw calls, not triangles, are the limit.** Trees cost 2 calls each (bark + leaves)
  when cloned individually. Past ~30 trees, switch to `InstancedMesh`.
- **Leaf overdraw.** `doubleSided` alpha-masked leaves defeat early-Z on mobile GPUs.
  Walking inside a dense grove costs more than the triangle count suggests.
- **Grass and rocks are real geometry**, not alpha cards — they're cheap to scatter.
