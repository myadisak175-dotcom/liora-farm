# Painted village wood

The original crate and barrel meshes and UVs are unchanged. New albedo atlases replace the original noisy, weathered texture with broad honey-brown wood strokes and matte blue-grey iron, matching the cozy village's simpler materials. Each atlas is packaged at 512 × 512 pixels, the original resolution, and embedded in the corresponding `*-stylized.glb`. The original GLBs are retained.

Source creation: built-in image generation, one atlas edit per prop, using each original atlas as the edit target. The generated atlas was resampled to the original texture resolution and PNG-encoded for the game. No mesh, UV or placement changes were made.

Prompt recipe for both atlases: preserve every UV island's relative position, silhouette, rotation and material boundaries; repaint noisy grain as broad smooth honey wood shapes in approximately #a77549 / #c29159 / #805537, sparse wide grain strokes along the planks, and matte #505a5b metal. Preserve unused black spaces, holes, braces, nail positions, hoops and barrel-end boundaries. Render only the flat unlit albedo atlas, without text, margins, scene lighting or a model illustration.

Validation: the geometry, normals, indices, UV buffer bytes, accessors and nodes match the original files; both GLBs load through Three.js with their sRGB maps and unchanged batching/terrain placement. `docs/previews/stylized-wood-props.png` is a Blender render of these actual packaged models, not an in-game screenshot. The live game's shader adds its own light bands and atmospheric haze.
