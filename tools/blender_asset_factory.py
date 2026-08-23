from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser(description="Liora Farm Blender Asset Factory")
    parser.add_argument("--input", required=True, help="Input .glb/.gltf path")
    parser.add_argument("--output", required=True, help="Output .glb path")
    parser.add_argument("--target-tris", type=int, required=True, help="Target total triangle count")
    parser.add_argument(
        "--allow-rigged",
        action="store_true",
        help="Allow decimation of rigged/skinned meshes. Disabled by default.",
    )
    parser.add_argument(
        "--min-object-tris",
        type=int,
        default=250,
        help="Do not decimate mesh objects smaller than this triangle count.",
    )
    return parser.parse_args(argv)


def require_repo_path(path: Path, repo_root: Path, label: str) -> Path:
    resolved = path.resolve()
    if resolved != repo_root and repo_root not in resolved.parents:
        raise ValueError(f"{label} must stay inside the repository: {path}")
    return resolved


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def import_asset(path: Path) -> None:
    ext = path.suffix.lower()
    if ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
        return
    raise ValueError(f"Unsupported input format: {ext}. Use .glb or .gltf.")


def mesh_triangles(obj: bpy.types.Object) -> int:
    if obj.type != "MESH" or obj.data is None:
        return 0
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def is_rigged(obj: bpy.types.Object) -> bool:
    if obj.type != "MESH":
        return False
    if obj.find_armature() is not None:
        return True
    return any(mod.type == "ARMATURE" for mod in obj.modifiers)


def has_shape_keys(obj: bpy.types.Object) -> bool:
    shape_keys = getattr(obj.data, "shape_keys", None) if obj.type == "MESH" else None
    return bool(shape_keys and getattr(shape_keys, "key_blocks", None))


def scene_stats() -> dict:
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    per_object = []
    total = 0
    rigged = 0

    for obj in objects:
        tris = mesh_triangles(obj)
        total += tris
        rigged_flag = is_rigged(obj)
        if rigged_flag:
            rigged += 1
        per_object.append(
            {
                "name": obj.name,
                "triangles": tris,
                "rigged": rigged_flag,
                "shape_keys": has_shape_keys(obj),
                "materials": len(obj.material_slots),
            }
        )

    return {
        "mesh_objects": len(objects),
        "rigged_mesh_objects": rigged,
        "triangles": total,
        "objects": per_object,
    }


def decimate_scene(target_tris: int, allow_rigged: bool, min_object_tris: int) -> dict:
    before = scene_stats()
    total_before = before["triangles"]

    if total_before <= 0:
        raise RuntimeError("No mesh triangles found in the imported asset.")
    if target_tris <= 0:
        raise ValueError("--target-tris must be greater than zero.")

    if total_before <= target_tris:
        return {
            "requested_ratio": 1.0,
            "eligible_triangles": 0,
            "protected_triangles": total_before,
            "decimated_objects": [],
            "skipped_objects": [],
            "note": "Input is already at or below the target triangle count.",
        }

    eligible = []
    skipped = []

    for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        tris = mesh_triangles(obj)
        reason = None

        if tris < min_object_tris:
            reason = f"below min-object-tris ({min_object_tris})"
        elif is_rigged(obj) and not allow_rigged:
            reason = "rigged mesh protected"
        elif has_shape_keys(obj) and not allow_rigged:
            reason = "shape keys protected"

        if reason:
            skipped.append({"name": obj.name, "triangles": tris, "reason": reason})
        else:
            eligible.append((obj, tris))

    eligible_tris = sum(tris for _, tris in eligible)
    protected_tris = total_before - eligible_tris
    desired_eligible = max(target_tris - protected_tris, 0)

    if eligible_tris <= 0:
        return {
            "requested_ratio": 1.0,
            "eligible_triangles": 0,
            "protected_triangles": protected_tris,
            "decimated_objects": [],
            "skipped_objects": skipped,
            "note": "No eligible meshes could be safely decimated.",
        }

    ratio = min(1.0, max(0.02, desired_eligible / eligible_tris))
    decimated = []

    for obj, before_tris in eligible:
        if ratio >= 0.999:
            continue

        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)

        modifier = obj.modifiers.new(name="LioraSafeDecimate", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        if hasattr(modifier, "use_collapse_triangulate"):
            modifier.use_collapse_triangulate = True

        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except Exception as exc:
            if modifier.name in obj.modifiers:
                obj.modifiers.remove(modifier)
            skipped.append(
                {
                    "name": obj.name,
                    "triangles": before_tris,
                    "reason": f"decimate failed: {type(exc).__name__}: {exc}",
                }
            )
            obj.select_set(False)
            continue

        after_tris = mesh_triangles(obj)
        decimated.append(
            {
                "name": obj.name,
                "before_triangles": before_tris,
                "after_triangles": after_tris,
            }
        )
        obj.select_set(False)

    return {
        "requested_ratio": ratio,
        "eligible_triangles": eligible_tris,
        "protected_triangles": protected_tris,
        "decimated_objects": decimated,
        "skipped_objects": skipped,
    }


def export_glb(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB")


def main() -> None:
    args = parse_args()
    repo_root = Path.cwd().resolve()
    input_path = require_repo_path(Path(args.input), repo_root, "Input path")
    output_path = require_repo_path(Path(args.output), repo_root, "Output path")

    if not input_path.exists():
        raise FileNotFoundError(f"Input asset not found: {input_path}")
    if input_path.suffix.lower() not in {".glb", ".gltf"}:
        raise ValueError("Input must be .glb or .gltf")
    if output_path.suffix.lower() != ".glb":
        raise ValueError("Output must use the .glb extension.")

    clear_scene()
    import_asset(input_path)

    before = scene_stats()
    operation = decimate_scene(
        target_tris=args.target_tris,
        allow_rigged=args.allow_rigged,
        min_object_tris=args.min_object_tris,
    )
    after = scene_stats()

    export_glb(output_path)

    input_bytes = input_path.stat().st_size
    output_bytes = output_path.stat().st_size
    warnings = []

    if after["triangles"] > int(args.target_tris * 1.15):
        warnings.append(
            "Output remains more than 15% above target. Protected rigged/shape-key/small meshes may be the reason."
        )
    if output_bytes > input_bytes:
        warnings.append(
            "Output GLB is larger than the input. Triangle reduction does not reduce embedded texture size."
        )
    if before["rigged_mesh_objects"] and not args.allow_rigged:
        warnings.append("Rigged meshes were protected from decimation by default.")

    report = {
        "asset_factory": "liora-blender-v1",
        "blender_version": bpy.app.version_string,
        "input": str(input_path.relative_to(repo_root)),
        "output": str(output_path.relative_to(repo_root)),
        "target_triangles": args.target_tris,
        "before": before,
        "after": after,
        "operation": operation,
        "input_bytes": input_bytes,
        "output_bytes": output_bytes,
        "size_reduction_percent": round((1 - output_bytes / input_bytes) * 100, 2)
        if input_bytes
        else 0,
        "triangle_reduction_percent": round(
            (1 - after["triangles"] / before["triangles"]) * 100, 2
        )
        if before["triangles"]
        else 0,
        "warnings": warnings,
    }

    report_path = output_path.with_suffix(".report.json")
    report_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print("\n=== LIORA BLENDER ASSET FACTORY ===")
    print(f"Input triangles : {before['triangles']:,}")
    print(f"Output triangles: {after['triangles']:,}")
    print(f"Target triangles: {args.target_tris:,}")
    print(f"Output           : {output_path.relative_to(repo_root)}")
    print(f"Report           : {report_path.relative_to(repo_root)}")
    if warnings:
        print("Warnings:")
        for warning in warnings:
            print(f"- {warning}")


if __name__ == "__main__":
    main()
