# Blender Asset Factory

A mobile-friendly, cloud Blender pipeline for Liora Farm.

## What it does

1. Upload a `.glb` or `.gltf` file to this GitHub repository.
2. From GitHub on a phone, run the **Blender Asset Factory** workflow.
3. GitHub starts an Ubuntu runner and installs Blender.
4. Blender opens the asset headlessly, measures triangle counts, performs conservative decimation, and exports a new `.glb`.
5. The workflow uploads the optimized model as a GitHub Actions artifact and can commit it back to the repository.
6. A `.report.json` file is generated beside the output with before/after triangle counts, file sizes, protected meshes, and warnings.

## Mobile workflow

### 1. Upload an asset

Upload a model into:

`assets/inbox/`

Example:

`assets/inbox/house_source.glb`

### 2. Run the cloud Blender worker

In GitHub:

**Actions → Blender Asset Factory → Run workflow**

Recommended first run:

- `input_path`: `assets/inbox/house_source.glb`
- `output_path`: `assets/optimized/house_100k.glb`
- `target_tris`: `100000`
- `allow_rigged`: `false`
- `commit_output`: `true`

### 3. Get the result

When the run succeeds:

- the optimized GLB is available as a workflow artifact for 14 days;
- when `commit_output` is enabled, the optimized GLB is also committed to the selected branch;
- the JSON report sits beside the optimized model.

## Safety defaults

The first version is deliberately conservative:

- rigged/skinned meshes are protected by default;
- meshes with shape keys are protected by default;
- tiny mesh objects are not decimated;
- UVs, materials, normals, animations, and embedded GLB data are exported through Blender's glTF exporter;
- the worker never writes outside the checked-out repository.

Decimation changes topology, so visually inspect important hero assets after aggressive reductions. For Liora Farm hero buildings, treat the high-quality optimized model as the baseline and use smaller targets as LODs rather than replacing the master.

## Suggested targets

These are starting points, not hard rules:

| Use | Starting target |
| --- | ---: |
| Hero building / close-up prop | 100,000 tris |
| Standard world building | 50,000 tris |
| Background / distant LOD | 20,000 tris |
| Small prop | 5,000–15,000 tris |

## Future v2

Planned extensions can include:

- one-click LOD generation;
- texture resize and texture-budget reports;
- KTX2/Basis compression;
- batch processing;
- non-manifold and degenerate-geometry validation;
- thumbnail renders;
- asset manifest generation for Three.js;
- automatic PRs instead of direct result commits.
