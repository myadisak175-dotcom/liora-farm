#!/usr/bin/env python3
"""Compile safe semantic sculpt requests into fixed Blender Python templates.

The remote queue never accepts arbitrary Python for these operations. Parameters
are validated here, embedded as JSON data, and executed by BlenderMCP through its
existing execute_code command.
"""
from __future__ import annotations

import json
import math

SCULPT_TYPES = {
    "sculpt_create_sphere",
    "sculpt_inflate",
    "sculpt_grab",
    "sculpt_smooth",
    "sculpt_flatten",
    "sculpt_symmetrize_x",
    "sculpt_voxel_remesh",
}


def _number(value, name: str, low=None, high=None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number")
    value = float(value)
    if not math.isfinite(value):
        raise ValueError(f"{name} must be finite")
    if low is not None and value < low:
        raise ValueError(f"{name} must be >= {low}")
    if high is not None and value > high:
        raise ValueError(f"{name} must be <= {high}")
    return value


def _vec3(value, name: str) -> list[float]:
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError(f"{name} must be [x, y, z]")
    return [_number(v, f"{name}[{i}]", -100000.0, 100000.0) for i, v in enumerate(value)]


def _object_name(params: dict) -> str:
    value = params.get("object")
    if not isinstance(value, str) or not value.strip() or len(value) > 128:
        raise ValueError("object must be a non-empty string <= 128 chars")
    return value.strip()


def validate_sculpt_request(command_type: str, params: dict) -> dict:
    if command_type not in SCULPT_TYPES:
        raise ValueError(f"Unsupported sculpt command: {command_type}")
    if not isinstance(params, dict):
        raise ValueError("params must be an object")

    clean: dict = {}
    if command_type == "sculpt_create_sphere":
        name = params.get("name", "SculptBase")
        if not isinstance(name, str) or not name.strip() or len(name) > 128:
            raise ValueError("name must be a non-empty string <= 128 chars")
        clean.update({
            "name": name.strip(),
            "location": _vec3(params.get("location", [0, 0, 0]), "location"),
            "radius": _number(params.get("radius", 1.0), "radius", 0.001, 10000.0),
            "segments": int(_number(params.get("segments", 64), "segments", 8, 256)),
            "rings": int(_number(params.get("rings", 32), "rings", 4, 128)),
        })
        return clean

    clean["object"] = _object_name(params)

    if command_type in {"sculpt_inflate", "sculpt_grab", "sculpt_flatten"}:
        clean["center"] = _vec3(params.get("center", [0, 0, 0]), "center")
        clean["radius"] = _number(params.get("radius", 0.5), "radius", 0.0001, 10000.0)
        clean["strength"] = _number(params.get("strength", 0.1), "strength", -1000.0, 1000.0)

    if command_type == "sculpt_grab":
        clean["delta"] = _vec3(params.get("delta", [0, 0, 0]), "delta")
    elif command_type == "sculpt_flatten":
        normal = _vec3(params.get("normal", [0, 0, 1]), "normal")
        if sum(v * v for v in normal) < 1e-12:
            raise ValueError("normal cannot be zero")
        clean["normal"] = normal
    elif command_type == "sculpt_smooth":
        center = params.get("center")
        clean["center"] = None if center is None else _vec3(center, "center")
        clean["radius"] = _number(params.get("radius", 1.0), "radius", 0.0001, 10000.0)
        clean["factor"] = _number(params.get("factor", 0.35), "factor", 0.0, 1.0)
        clean["iterations"] = int(_number(params.get("iterations", 2), "iterations", 1, 20))
    elif command_type == "sculpt_symmetrize_x":
        direction = params.get("direction", "-X_TO_+X")
        if direction not in {"-X_TO_+X", "+X_TO_-X"}:
            raise ValueError("direction must be -X_TO_+X or +X_TO_-X")
        clean["direction"] = direction
        clean["merge_distance"] = _number(params.get("merge_distance", 0.001), "merge_distance", 0.0, 1.0)
    elif command_type == "sculpt_voxel_remesh":
        clean["voxel_size"] = _number(params.get("voxel_size", 0.05), "voxel_size", 0.0001, 1000.0)
        clean["smooth"] = _number(params.get("smooth", 0.0), "smooth", 0.0, 1.0)

    return clean


def compile_sculpt_command(command_type: str, params: dict) -> dict:
    cfg = {"op": command_type, "params": validate_sculpt_request(command_type, params)}
    cfg_literal = repr(json.dumps(cfg, ensure_ascii=True))

    code = f'''import bpy, bmesh, json, math\nfrom mathutils import Vector\ncfg = json.loads({cfg_literal})\nop = cfg["op"]\np = cfg["params"]\n\ndef active_mesh(name):\n    obj = bpy.data.objects.get(name)\n    if obj is None or obj.type != "MESH":\n        raise RuntimeError(f"Mesh object not found: {{name}}")\n    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None\n    bpy.ops.object.select_all(action="DESELECT")\n    obj.select_set(True)\n    bpy.context.view_layer.objects.active = obj\n    return obj\n\ndef falloff(distance, radius):\n    if distance >= radius:\n        return 0.0\n    t = 1.0 - (distance / radius)\n    return t * t * (3.0 - 2.0 * t)\n\nif op == "sculpt_create_sphere":\n    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None\n    bpy.ops.mesh.primitive_uv_sphere_add(segments=p["segments"], ring_count=p["rings"], radius=p["radius"], location=p["location"])\n    obj = bpy.context.object\n    obj.name = p["name"]\n    bpy.ops.object.shade_smooth()\n    result = {{"object": obj.name, "vertices": len(obj.data.vertices), "polygons": len(obj.data.polygons)}}\nelse:\n    obj = active_mesh(p["object"])\n    mesh = obj.data\n    mesh.update()\n\n    if op == "sculpt_inflate":\n        c = Vector(p["center"]); r = p["radius"]; s = p["strength"]\n        mesh.calc_normals() if hasattr(mesh, "calc_normals") else None\n        changed = 0\n        for v in mesh.vertices:\n            w = falloff((v.co - c).length, r)\n            if w > 0.0:\n                n = v.normal.normalized() if v.normal.length > 1e-12 else Vector((0,0,1))\n                v.co += n * (s * w)\n                changed += 1\n        mesh.update()\n        result = {{"object": obj.name, "changed_vertices": changed}}\n\n    elif op == "sculpt_grab":\n        c = Vector(p["center"]); r = p["radius"]; d = Vector(p["delta"]); s = p["strength"]\n        changed = 0\n        for v in mesh.vertices:\n            w = falloff((v.co - c).length, r)\n            if w > 0.0:\n                v.co += d * (s * w)\n                changed += 1\n        mesh.update()\n        result = {{"object": obj.name, "changed_vertices": changed}}\n\n    elif op == "sculpt_flatten":\n        c = Vector(p["center"]); r = p["radius"]; n = Vector(p["normal"]).normalized(); s = p["strength"]\n        changed = 0\n        for v in mesh.vertices:\n            w = falloff((v.co - c).length, r)\n            if w > 0.0:\n                signed = (v.co - c).dot(n)\n                v.co -= n * (signed * s * w)\n                changed += 1\n        mesh.update()\n        result = {{"object": obj.name, "changed_vertices": changed}}\n\n    elif op == "sculpt_smooth":\n        center = Vector(p["center"]) if p["center"] is not None else None\n        radius = p["radius"]; factor = p["factor"]\n        neighbors = [set() for _ in mesh.vertices]\n        for e in mesh.edges:\n            a, b = e.vertices\n            neighbors[a].add(b); neighbors[b].add(a)\n        changed = 0\n        for _ in range(p["iterations"]):\n            old = [v.co.copy() for v in mesh.vertices]\n            new = [co.copy() for co in old]\n            for i, v in enumerate(mesh.vertices):\n                if not neighbors[i]:\n                    continue\n                w = 1.0 if center is None else falloff((old[i] - center).length, radius)\n                if w <= 0.0:\n                    continue\n                avg = Vector((0,0,0))\n                for j in neighbors[i]:\n                    avg += old[j]\n                avg /= len(neighbors[i])\n                new[i] = old[i].lerp(avg, factor * w)\n                changed += 1\n            for i, co in enumerate(new):\n                mesh.vertices[i].co = co\n        mesh.update()\n        result = {{"object": obj.name, "changed_vertices": changed, "iterations": p["iterations"]}}\n\n    elif op == "sculpt_symmetrize_x":\n        bm = bmesh.new(); bm.from_mesh(mesh)\n        bmesh.ops.symmetrize(bm, input=list(bm.verts) + list(bm.edges) + list(bm.faces), direction=p["direction"], dist=p["merge_distance"])\n        bm.to_mesh(mesh); bm.free(); mesh.update()\n        result = {{"object": obj.name, "direction": p["direction"], "vertices": len(mesh.vertices)}}\n\n    elif op == "sculpt_voxel_remesh":\n        mesh.remesh_voxel_size = p["voxel_size"]\n        if hasattr(mesh, "remesh_voxel_adaptivity"):\n            mesh.remesh_voxel_adaptivity = 0.0\n        bpy.ops.object.voxel_remesh()\n        if p["smooth"] > 0.0:\n            bpy.ops.object.mode_set(mode="EDIT")\n            bpy.ops.mesh.select_all(action="SELECT")\n            bpy.ops.mesh.vertices_smooth(factor=p["smooth"], repeat=1)\n            bpy.ops.object.mode_set(mode="OBJECT")\n        result = {{"object": obj.name, "vertices": len(obj.data.vertices), "polygons": len(obj.data.polygons), "voxel_size": p["voxel_size"]}}\n\nprint(json.dumps({{"sculpt_result": result}}))\n'''
    return {"type": "execute_code", "params": {"code": code}}
