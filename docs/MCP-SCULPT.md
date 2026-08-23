# MCP Sculpt

This is the modeling layer on top of Blender Remote B.

The goal is conversational sculpting from a phone:

```text
User: make the cheeks rounder and keep the chin small
Assistant: inspect -> semantic sculpt command -> Blender -> viewport preview -> refine
```

## Why semantic sculpt commands

Interactive mouse/pen brush strokes depend on viewport pixels, tool state, and UI focus. That is fragile on a headless cloud Blender host. MCP Sculpt instead applies deterministic mesh deformation in object space and then captures a viewport preview.

Raw `execute_code` remains disabled by default. Sculpt commands are validated and compiled on the trusted Blender host into fixed Blender Python templates.

## Initial commands

### sculpt_create_sphere
Create a smooth UV sphere to use as a blockout.

### sculpt_inflate
Push vertices along their normals inside a 3D radius with smooth falloff.

Useful for cheeks, brow, skull volume, muscles, rounded props, and soft silhouettes.

### sculpt_grab
Move a local volume of vertices by a direction vector with falloff.

Useful for changing silhouette, pulling a chin, widening ears, extending a nose, or reshaping limbs.

### sculpt_smooth
Average neighboring vertices globally or inside a local radius.

Useful after stronger deformation passes.

### sculpt_flatten
Pull a local region toward a plane.

Useful for feet, soles, table surfaces, stylized face planes, bases, and hard/soft transition areas.

### sculpt_symmetrize_x
Copy one side of a mesh across the X axis.

Useful for character blockout and symmetrical props.

### sculpt_voxel_remesh
Rebuild topology at a requested voxel size.

Useful after large shape changes or before another sculpting pass. This changes topology and should be used before final UV/rigging work unless intentionally rebuilding them.

## Automatic preview

Every semantic sculpt command is followed automatically by `get_viewport_screenshot`. The result JSON and PNG are written to `tools/blender_remote/results/` so the assistant can inspect the shape before issuing the next pass.

## Coordinate convention

Semantic brush centers, radii, and movement deltas are currently expressed in object-local Blender coordinates. This makes operations deterministic and independent of the phone screen or camera resolution.

Future layer: named semantic regions (for example `left_cheek`, `chin`, `forehead`, `roof_corner`) resolved from landmarks/bounding boxes, so the user never needs to think about XYZ coordinates.

## First end-to-end test

The staged queue now performs:

1. BlenderMCP ping
2. scene info
3. viewport screenshot
4. create `MCP_Sculpt_Test` sphere
5. inflate the upper sphere region

The two sculpt commands automatically generate viewport previews. Once a real RunPod host completes this test successfully, the next milestone is character/prop blockout from natural-language shape descriptions.
