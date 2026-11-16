#!/usr/bin/env python3
"""Bake Vivi's moves from the shared animation library into vivi-anim.js.

The animation library (.vrma files: Quaternius Universal Animation Library 1+2, CC0) is the one source of every
character's moves. This game plays them in its own compact format (see stylized-character.js): for each J_Bip bone,
its local rotation at 30 frames a second, plus the hips' position. Every VRoid model has the same J_Bip bones, so the
same bake works for any of them.

How a library clip becomes hers (the same steps three-vrm's createVRMAnimationClip takes, checked against it):
  - a library clip's skeleton stands in T-pose with no rest rotations, so each keyframe is the bone's turn away from T-pose;
  - VRoid models are VRM 0.x, which face -Z: every turn is mirrored through the Y axis (x and z negated);
  - the hips' path is scaled by her hips height over the library skeleton's.

Usage (from the repo folder):
  python3 tools/bake-vivi-anim.py LIBRARY_DIR            (LIBRARY_DIR: the folder holding the .vrma files)
writes vivi-anim.js next to index.html. No packages needed beyond Python 3.
"""
import base64
import json
import math
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# game clip name, library clip, loops?, ground speed in m/s at her modelled size (None: measured from the planted foot)
CLIPS = [
    ("idle", "Idle_Loop", True, 0.0),
    ("walk", "Walk_Loop", True, None),
    # The library's jog is a long bounding run (measured ~5 m/s on her). At her run pace it is played a little faster than
    # its own ground speed would allow, so the steps keep a running rhythm; its feet are down only ~13% of the cycle, so
    # the small slide does not show.
    ("run", "Jog_Fwd_Loop", True, 3.0),
    ("jump_start", "Jump_Start", False, 0.0),
    ("jump_air", "Jump_Loop", True, 0.0),
    ("jump_land", "Jump_Land", False, 0.0),
]

# VRM 1.0 humanoid bone (the library's names) -> VRoid bone. VRM 0.x thumbs are one joint further out than VRM 1.0's:
# VRM 1.0 thumbMetacarpal is VRoid's Thumb1.
VROID_BONES = {
    "hips": "J_Bip_C_Hips", "spine": "J_Bip_C_Spine", "chest": "J_Bip_C_Chest", "upperChest": "J_Bip_C_UpperChest",
    "neck": "J_Bip_C_Neck", "head": "J_Bip_C_Head",
}
for side, s in (("left", "L"), ("right", "R")):
    VROID_BONES.update({
        f"{side}Shoulder": f"J_Bip_{s}_Shoulder", f"{side}UpperArm": f"J_Bip_{s}_UpperArm",
        f"{side}LowerArm": f"J_Bip_{s}_LowerArm", f"{side}Hand": f"J_Bip_{s}_Hand",
        f"{side}UpperLeg": f"J_Bip_{s}_UpperLeg", f"{side}LowerLeg": f"J_Bip_{s}_LowerLeg",
        f"{side}Foot": f"J_Bip_{s}_Foot", f"{side}Toes": f"J_Bip_{s}_ToeBase",
        f"{side}ThumbMetacarpal": f"J_Bip_{s}_Thumb1", f"{side}ThumbProximal": f"J_Bip_{s}_Thumb2",
        f"{side}ThumbDistal": f"J_Bip_{s}_Thumb3",
    })
    for finger in ("Index", "Middle", "Ring", "Little"):
        for k, joint in enumerate(("Proximal", "Intermediate", "Distal"), start=1):
            VROID_BONES[f"{side}{finger}{joint}"] = f"J_Bip_{s}_{finger}{k}"


# ---------------------------------------------------------------- small maths (quaternions x, y, z, w)

def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz)


def qrot(q, v):
    x, y, z, w = q
    tx, ty, tz = 2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])
    return (v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx))


# ---------------------------------------------------------------- GLB reading

def parse_glb(data):
    if data[:4] != b"glTF":
        raise ValueError("not a GLB")
    clen = struct.unpack_from("<I", data, 12)[0]
    js = json.loads(data[20:20 + clen])
    off = 20 + clen
    binary = b""
    if off < len(data):
        blen = struct.unpack_from("<I", data, off)[0]
        binary = data[off + 8:off + 8 + blen]
    return js, binary


def read_floats(js, binary, index):
    acc = js["accessors"][index]
    if acc["componentType"] != 5126:
        raise ValueError("only float accessors are supported")
    n = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[acc["type"]]
    view = js["bufferViews"][acc["bufferView"]]
    off = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride", 0) or 4 * n
    return [struct.unpack_from(f"<{n}f", binary, off + i * stride) for i in range(acc["count"])]


def her_skeleton():
    """Her bones as the game loads them (from vivi-data.js): hips height above her feet, and every bone name."""
    src = open(os.path.join(REPO, "vivi-data.js"), encoding="utf-8").read()
    m = re.search(r"export const VIVI_GLB = ['\"`]([A-Za-z0-9+/=]+)", src)
    if not m:
        raise ValueError("VIVI_GLB not found in vivi-data.js")
    js, _ = parse_glb(base64.b64decode(m.group(1)))
    nodes = js["nodes"]
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
    names = {n.get("name"): i for i, n in enumerate(nodes)}
    y, i = 0.0, names["J_Bip_C_Hips"]
    while i is not None:
        if nodes[i].get("rotation", [0, 0, 0, 1]) != [0, 0, 0, 1]:
            raise ValueError(f"{nodes[i].get('name')}: expected no rest rotation above the hips")
        y += nodes[i].get("translation", [0, 0, 0])[1]
        i = parent.get(i)
    return y, set(names)


def read_vrma(path):
    js, binary = parse_glb(open(path, "rb").read())
    ext = js["extensions"]["VRMC_vrm_animation"]
    bone_node = {b: v["node"] for b, v in ext["humanoid"]["humanBones"].items()}
    nodes = js["nodes"]
    for b, i in bone_node.items():
        if nodes[i].get("rotation", [0, 0, 0, 1]) != [0, 0, 0, 1]:
            raise ValueError(f"{path}: {b} has a rest rotation; this baker expects T-pose library clips")
    anim = js["animations"][0]
    times, rot, hips = None, {}, None
    node_bone = {i: b for b, i in bone_node.items()}
    for ch in anim["channels"]:
        smp = anim["samplers"][ch["sampler"]]
        t = [v[0] for v in read_floats(js, binary, smp["input"])]
        if times is None:
            times = t
        elif len(t) != len(times):
            raise ValueError(f"{path}: channels must share one time line")
        values = read_floats(js, binary, smp["output"])
        bone = node_bone.get(ch["target"]["node"])
        if bone is None:
            continue
        if ch["target"]["path"] == "rotation":
            rot[bone] = values
        elif ch["target"]["path"] == "translation" and bone == "hips":
            hips = values
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
    return {"times": times, "rot": rot, "hips": hips, "nodes": nodes, "parent": parent, "bone_node": bone_node,
            "rest_hips": nodes[bone_node["hips"]].get("translation", [0, 0, 0])}


def planted_foot_speed(clip):
    """Ground speed (m/s, library scale) from how fast a planted toe slides back under the body."""
    nodes, parent, bone_node, times = clip["nodes"], clip["parent"], clip["bone_node"], clip["times"]
    node_bone = {i: b for b, i in bone_node.items()}

    def world(i, f):
        chain = []
        while i is not None:
            chain.append(i)
            i = parent.get(i)
        q, p = (0.0, 0.0, 0.0, 1.0), (0.0, 0.0, 0.0)
        for j in reversed(chain):
            b = node_bone.get(j)
            t = clip["hips"][f] if b == "hips" else nodes[j].get("translation", [0, 0, 0])
            off = qrot(q, t)
            p = (p[0] + off[0], p[1] + off[1], p[2] + off[2])
            if b in clip["rot"]:
                q = qmul(q, clip["rot"][b][f])
        return p

    speeds = []
    for toe in ("leftToes", "rightToes"):
        track = [world(bone_node[toe], f) for f in range(len(times))]
        low = min(p[1] for p in track)
        for f in range(1, len(times)):
            if track[f][1] < low + 0.02 and track[f - 1][1] < low + 0.02:
                speeds.append(-(track[f][2] - track[f - 1][2]) / (times[f] - times[f - 1]))
    speeds.sort()
    return speeds[len(speeds) // 2] if speeds else 0.0


def bake(clip, scale, her_bones):
    frames = len(clip["times"])
    tracks = {}
    for bone, values in clip["rot"].items():
        name = VROID_BONES.get(bone)
        if name is None or name not in her_bones:
            continue
        flat = []
        for x, y, z, w in values:
            flat += [round(-x, 4), round(y, 4), round(-z, 4), round(w, 4)]      # mirrored for a VRM 0.x model (faces -Z)
        if all(flat[i] == flat[i % 4] for i in range(len(flat))):
            flat = flat[:4]                                                     # never moves: one key is enough
        tracks[name] = flat
    hips = []
    for x, y, z in clip["hips"]:
        hips += [round(-x * scale, 4), round(y * scale, 4), round(-z * scale, 4)]
    return tracks, hips, frames


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    lib = argv[1]
    out_path = argv[2] if len(argv) > 2 else os.path.join(REPO, "vivi-anim.js")
    hips_y, her_bones = her_skeleton()
    anim = {"fps": 30, "forwardYaw": 3.1416, "hipsBone": "J_Bip_C_Hips", "clips": {}}
    lines = []
    for game_name, lib_name, loop, speed in CLIPS:
        clip = read_vrma(os.path.join(lib, f"{lib_name}.vrma"))
        scale = hips_y / clip["rest_hips"][1]
        measured = planted_foot_speed(clip) * scale
        tracks, hips, frames = bake(clip, scale, her_bones)
        anim["clips"][game_name] = {
            "duration": round(clip["times"][-1], 4), "frames": frames, "loop": loop,
            "speed": round(measured if speed is None else speed, 4),
            "tracks": tracks, "hips": hips,
        }
        lines.append(f"//   {game_name:<10} <- {lib_name:<14} {clip['times'][-1]:.2f} s, {len(tracks)} bones"
                     f"{'' if loop else ', once'}, ground speed {measured:.2f} m/s"
                     f"{'' if speed is None else f' (played as {speed:.2f})'}")
        print(lines[-1][4:])
    head = ("// vivi-anim.js: written by tools/bake-vivi-anim.py from the shared animation library; do not edit by hand.\n"
            "// Her moves come from Quaternius' Universal Animation Library 1+2 (CC0), retargeted onto her VRoid bones.\n"
            + "\n".join(lines) + "\n")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(head + "export const VIVI_ANIM = " + json.dumps(anim, separators=(",", ":")) + ";\n")
    print(f"wrote {out_path} ({os.path.getsize(out_path) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
