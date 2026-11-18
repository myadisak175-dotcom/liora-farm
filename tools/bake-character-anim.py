#!/usr/bin/env python3
"""Bake the characters' moves from the shared animation library into character-anim.js.

The animation library (.vrma files: Quaternius Universal Animation Library 1+2, CC0) is the one source of every
character's moves. This game plays them in its own compact format (see stylized-character.js): for each J_Bip bone,
its local rotation at 30 frames a second, plus the hips' path. Every VRoid model has the same J_Bip bones and stands in
the same T-pose with no rest rotations, so one bake serves every playable character:

  - a library clip's skeleton stands in T-pose with no rest rotations, so each keyframe is the bone's turn away from T-pose;
  - VRoid models are VRM 0.x, which face -Z: every turn is mirrored through the Y axis (x and z negated);
  - the hips' path is written in hips heights (the library skeleton's hips stand at 1), and ground speeds in hips heights
    a second: stylized-character.js multiplies both by the loaded model's own hips height, so a long-legged character
    covers more ground per step. (The same steps three-vrm's createVRMAnimationClip takes; checked against it.)

Usage (from the repo folder):
  python3 tools/bake-character-anim.py assets/animations/vrma      (or any folder holding the library's .vrma files)
writes character-anim.js next to index.html. No packages needed beyond Python 3.
"""
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# game clip name, library clip, loops?, ground speed in hips heights a second (None: measured from the planted foot)
CLIPS = [
    ("idle", "Idle_Loop", True, 0.0),
    ("walk", "Walk_Loop", True, None),
    # The library's sprint covers ~9.7 hips heights a second, far more than the run pace. It is played at its own rhythm
    # at a full run (about three steps a second; 4.25 hips heights a second, Vivi's 3.3 m/s as modelled) rather than
    # slowed to match the ground; its feet are down for under a tenth of the cycle, so the slide does not show.
    ("run", "Sprint_Loop", True, 4.25),
    ("jump_start", "Jump_Start", False, 0.0),
    ("jump_air", "Jump_Loop", True, 0.0),
    ("jump_land", "Jump_Land", False, 0.0),
    # the moves (player-moves.js, ?move=1): a long fall ends in a forward roll; climbing a face (Climb_Loop: made for this
    # game by tools/make-climb-anim.py, the library has no climbing loop; its pace, 1.21 m a second on the library's
    # skeleton, is written in hips heights); the vault that takes her over a cliff's top; swimming and treading water
    # (both clips have the water's surface at her root)
    ("roll", "Roll", False, 0.0),
    ("climb", "Climb_Loop", True, 1.322),
    ("climb_up", "ClimbUp_1m", False, 0.0),
    ("swim", "Swim_Fwd_Loop", True, 0.0),
    ("swim_idle", "Swim_Idle_Loop", True, 0.0),
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


# ---------------------------------------------------------------- reading a library clip

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


def bake(clip):
    tracks = {}
    for bone, values in clip["rot"].items():
        name = VROID_BONES.get(bone)
        if name is None:
            continue
        flat = []
        for x, y, z, w in values:
            flat += [round(-x, 4), round(y, 4), round(-z, 4), round(w, 4)]      # mirrored for a VRM 0.x model (faces -Z)
        if all(flat[i] == flat[i % 4] for i in range(len(flat))):
            flat = flat[:4]                                                     # never moves: one key is enough
        tracks[name] = flat
    unit = 1.0 / clip["rest_hips"][1]                                           # metres -> hips heights
    hips = []
    for x, y, z in clip["hips"]:
        hips += [round(-x * unit, 5), round(y * unit, 5), round(-z * unit, 5)]
    return tracks, hips, len(clip["times"])


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    lib = argv[1]
    out_path = argv[2] if len(argv) > 2 else os.path.join(REPO, "character-anim.js")
    anim = {"fps": 30, "forwardYaw": 3.1416, "hipsBone": "J_Bip_C_Hips", "hipsUnit": "hipsHeight", "clips": {}}
    lines = []
    for game_name, lib_name, loop, speed in CLIPS:
        clip = read_vrma(os.path.join(lib, f"{lib_name}.vrma"))
        measured = planted_foot_speed(clip) / clip["rest_hips"][1]
        tracks, hips, frames = bake(clip)
        anim["clips"][game_name] = {
            "duration": round(clip["times"][-1], 4), "frames": frames, "loop": loop,
            "speed": round(measured if speed is None else speed, 4),
            "tracks": tracks, "hips": hips,
        }
        lines.append(f"//   {game_name:<10} <- {lib_name:<14} {clip['times'][-1]:.2f} s, {len(tracks)} bones"
                     f"{'' if loop else ', once'}"
                     + (f", ground speed {measured:.2f} hips heights/s" if speed is None or speed > 0 else "")
                     + (f" (played as {speed:.2f})" if speed else ""))
        print(lines[-1][4:])
    head = ("// character-anim.js: written by tools/bake-character-anim.py from the shared animation library; do not edit by hand.\n"
            "// Every playable character's moves: Quaternius' Universal Animation Library 1+2 (CC0), for VRoid bones.\n"
            "// Hips path and ground speeds are in hips heights: stylized-character.js scales them to each model.\n"
            + "\n".join(lines) + "\n")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(head + "export const CHARACTER_ANIM = " + json.dumps(anim, separators=(",", ":")) + ";\n")
    print(f"wrote {out_path} ({os.path.getsize(out_path) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
