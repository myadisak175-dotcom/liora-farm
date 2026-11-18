"""Shared by the tools that make clips for the animation library in code (tools/make-climb-anim.py, tools/make-vault-anim.py):
small maths, the library's skeleton, the playable characters' proportions, two-bone IK, and writing a .vrma into the
library. A clip made with these is turns of the library's bones away from T-pose, like every other clip there, and is
baked for the game like every other (tools/bake-character-anim.py).

  sk, hh, count = fitted_skeleton()     the library's skeleton (Idle_Loop.vrma), its bones' lengths and places those of the
                                        playable characters (the mean of assets/characters/, in hips heights times hh, the
                                        library's own hips height in metres): limbs solved on it reach where they are put
                                        on the characters that play the clip. count: how many characters
  two_bone(root, target, a, b, pole)    the joint between root and target, bent toward pole; and the axis it bends about
  locals_of(sk, D, loose)               each bone's turn from its parent, from world turns D (bones not in D: the template's;
                                        loose: how far each hand's fingers curl, 0 flat .. 1 as they hang at rest)
  write_clip(name, sk, times, rot, hips, loop, generator)   the .vrma into the library, and into its index.json
"""
import glob
import json
import math
import os
import struct

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
LIB = os.path.join(REPO, "assets", "animations", "vrma")
CHARACTERS = os.path.join(REPO, "assets", "characters")
TEMPLATE = os.path.join(LIB, "Idle_Loop.vrma")


# ---------------------------------------------------------------- small maths (quaternions x, y, z, w; 3x3 matrices)

def rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def unit(v):
    return v / np.linalg.norm(v)


def frame(d, n):
    """Rotation whose columns are d, n, d x n (d, n unit and square to each other)."""
    n = unit(n - d * np.dot(n, d))
    return np.column_stack([d, n, np.cross(d, n)])


def quat_of(m):
    t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s]
    q = np.array(q)
    return q / np.linalg.norm(q)


def mat_of(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def slerp_m(a, b, t):
    qa, qb = quat_of(a), quat_of(b)
    if np.dot(qa, qb) < 0:
        qb = -qb
    d = min(1.0, float(np.dot(qa, qb)))
    if d > 0.9995:
        q = qa + (qb - qa) * t
    else:
        th = math.acos(d)
        q = (math.sin((1 - t) * th) * qa + math.sin(t * th) * qb) / math.sin(th)
    return mat_of(q / np.linalg.norm(q))


def smooth(u):
    return u * u * (3 - 2 * u)


def hermite(p0, p1, m0, m1, s):
    return (2 * s ** 3 - 3 * s * s + 1) * p0 + (s ** 3 - 2 * s * s + s) * m0 + (-2 * s ** 3 + 3 * s * s) * p1 + (s ** 3 - s * s) * m1


# ---------------------------------------------------------------- the template skeleton

def read_glb(path):
    data = open(path, "rb").read()
    if data[:4] != b"glTF":
        raise ValueError(f"{path}: not a GLB")
    off, js, binary = 12, None, b""
    while off < len(data):
        n, kind = struct.unpack_from("<I4s", data, off)
        chunk = data[off + 8: off + 8 + n]
        if kind == b"JSON":
            js = json.loads(chunk)
        elif kind == b"BIN\x00":
            binary = chunk
        off += 8 + n
    return js, binary


def read_floats(js, binary, index):
    acc = js["accessors"][index]
    view = js["bufferViews"][acc["bufferView"]]
    n = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[acc["type"]]
    off = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    return np.frombuffer(binary, dtype="<f4", count=acc["count"] * n, offset=off).reshape(acc["count"], n)


class Skeleton:
    def __init__(self, path):
        self.js, self.bin = read_glb(path)
        ext = self.js["extensions"]["VRMC_vrm_animation"]["humanoid"]["humanBones"]
        self.node = {b: v["node"] for b, v in ext.items()}
        self.bone = {i: b for b, i in self.node.items()}
        nodes = self.js["nodes"]
        self.parent = {}
        for i, n in enumerate(nodes):
            for c in n.get("children", []):
                self.parent[self.bone[c]] = self.bone[i]
        self.offset = {b: np.array(nodes[i].get("translation", [0, 0, 0]), dtype=float) for b, i in self.node.items()}
        # the template's first frame of every bone (the fingers' relaxed curl is kept from it)
        anim = self.js["animations"][0]
        self.first = {}
        for ch in anim["channels"]:
            if ch["target"]["path"] == "rotation":
                vals = read_floats(self.js, self.bin, anim["samplers"][ch["sampler"]]["output"])
                self.first[self.bone[ch["target"]["node"]]] = mat_of(vals[0])

    def length(self, b):
        return float(np.linalg.norm(self.offset[b]))


# ---------------------------------------------------------------- the bodies that play it

VROID = {"hips": "J_Bip_C_Hips", "spine": "J_Bip_C_Spine", "chest": "J_Bip_C_Chest", "upperChest": "J_Bip_C_UpperChest",
         "neck": "J_Bip_C_Neck", "head": "J_Bip_C_Head"}
for _side, _s in (("left", "L"), ("right", "R")):
    for _bone, _name in (("Shoulder", "Shoulder"), ("UpperArm", "UpperArm"), ("LowerArm", "LowerArm"), ("Hand", "Hand"),
                         ("UpperLeg", "UpperLeg"), ("LowerLeg", "LowerLeg"), ("Foot", "Foot"), ("Toes", "ToeBase")):
        VROID[f"{_side}{_bone}"] = f"J_Bip_{_s}_{_name}"


def playable_proportions(sk):
    """Each bone's place from its parent bone, in hips heights: the mean of the playable characters, the same on both
    sides, in the library's directions (+Z forward, her left +X; a VRoid model is VRM 0.x and faces -Z, so x and z are
    turned over). -> ({bone: offset}, how many characters)"""
    files = sorted(glob.glob(os.path.join(CHARACTERS, "*.glb")))
    if not files:
        raise SystemExit(f"no playable characters in {CHARACTERS}: a clip is fitted to their proportions")
    total = {b: np.zeros(3) for b in VROID}
    for path in files:
        js, _ = read_glb(path)
        nodes = js["nodes"]
        index = {n.get("name"): i for i, n in enumerate(nodes)}
        parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}

        def world(i):
            p = np.zeros(3)
            while i is not None:
                p = p + np.array(nodes[i].get("translation", [0, 0, 0]), dtype=float)
                i = parent.get(i)
            return p

        at = {b: world(index[name]) for b, name in VROID.items()}
        hips_height = at["hips"][1]
        for b in VROID:
            p = sk.parent.get(b)
            if p:
                total[b] += (at[b] - at[p]) / hips_height * np.array([-1.0, 1.0, -1.0])
    mean = {b: v / len(files) for b, v in total.items()}
    out = {}
    for b, v in mean.items():
        if b.startswith("left"):
            v = (v + mean["right" + b[4:]] * np.array([-1.0, 1.0, 1.0])) / 2
            out[b], out["right" + b[4:]] = v, v * np.array([-1.0, 1.0, 1.0])
        elif not b.startswith("right") and b != "hips":
            out[b] = v * np.array([0.0, 1.0, 1.0])
    return out, len(files)


def fitted_skeleton():
    """The library's skeleton with its bones' lengths and places those of the playable characters. -> (sk, hh, count)"""
    sk = Skeleton(TEMPLATE)
    hh = float(sk.offset["hips"][1])
    props, count = playable_proportions(sk)
    for b, v in props.items():
        sk.offset[b] = v * hh
    return sk, hh, count


# ---------------------------------------------------------------- posing

def two_bone(root, target, a, b, pole):
    """The joint between root and target (a and b the two bones' lengths), bent toward pole (a direction), and the
    axis it bends about."""
    d_vec = target - root
    d = float(np.linalg.norm(d_vec))
    d = min(max(d, abs(a - b) + 1e-4), a + b - 1e-4)
    u = unit(d_vec)
    cos_a = (a * a + d * d - b * b) / (2 * a * d)
    sin_a = math.sqrt(max(0.0, 1 - cos_a * cos_a))
    v = unit(pole - u * np.dot(pole, u))
    return root + u * a * cos_a + v * a * sin_a, unit(np.cross(v, u))


def locals_of(sk, D, loose=None):
    out = {}
    for b in sk.node:
        if b in D:
            p = sk.parent.get(b)
            out[b] = quat_of((D[p].T @ D[b]) if p else D[b])
        else:
            rest = sk.first.get(b, np.eye(3))                # the template's relaxed curl
            side = "left" if b.startswith("left") else "right" if b.startswith("right") else None
            finger = side and any(f in b for f in ("Thumb", "Index", "Middle", "Ring", "Little"))
            # a hand that holds lies open (on a wall, on a rail); off it, its fingers curl as they hang (a thumb always half way)
            curl = 1.0 if loose is None else loose[side]
            out[b] = quat_of(slerp_m(np.eye(3), rest, 0.5 if "Thumb" in b else curl)) if finger and curl < 1.0 else quat_of(rest)
    return out


# ---------------------------------------------------------------- writing the .vrma

def write_vrma(path, sk, times, rot, hips, name, generator):
    blobs, views, accessors = [], [], []

    def add(arr, kind, minmax=False):
        data = np.ascontiguousarray(arr, dtype="<f4").tobytes()
        views.append({"buffer": 0, "byteOffset": sum(len(b) for b in blobs), "byteLength": len(data)})
        blobs.append(data)
        acc = {"bufferView": len(views) - 1, "componentType": 5126, "count": int(arr.shape[0]), "type": kind}
        if minmax:
            acc["min"] = [float(v) for v in arr.min(axis=0)]
            acc["max"] = [float(v) for v in arr.max(axis=0)]
        accessors.append(acc)
        return len(accessors) - 1

    t_acc = add(times[:, None], "SCALAR", True)
    samplers, channels = [], []
    for b, i in sk.node.items():
        samplers.append({"input": t_acc, "output": add(rot[b], "VEC4"), "interpolation": "LINEAR"})
        channels.append({"sampler": len(samplers) - 1, "target": {"node": i, "path": "rotation"}})
    samplers.append({"input": t_acc, "output": add(hips, "VEC3"), "interpolation": "LINEAR"})
    channels.append({"sampler": len(samplers) - 1, "target": {"node": sk.node["hips"], "path": "translation"}})
    binary = b"".join(blobs)
    js = {
        "asset": {"version": "2.0", "generator": generator},
        "extensionsUsed": ["VRMC_vrm_animation"],
        "extensions": sk.js["extensions"],
        "scene": 0, "scenes": sk.js["scenes"], "nodes": sk.js["nodes"],
        "animations": [{"name": name, "samplers": samplers, "channels": channels}],
        "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(binary)}],
    }
    jb = json.dumps(js, separators=(",", ":")).encode()
    jb += b" " * ((4 - len(jb) % 4) % 4)
    binary += b"\x00" * ((4 - len(binary) % 4) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(jb) + 8 + len(binary)))
        f.write(struct.pack("<I4s", len(jb), b"JSON")); f.write(jb)
        f.write(struct.pack("<I4s", len(binary), b"BIN\x00")); f.write(binary)


def write_clip(name, sk, times, rot, hips, loop, generator):
    """rot: {bone: [quaternion per frame]}; hips: [place per frame] (the clip's own lengths). Writes LIB/name.vrma (a loop:
    its last frame turned to agree with its first) and lists it in LIB/index.json. -> the file's path"""
    rot = {b: np.array(v) for b, v in rot.items()}
    for b in rot:
        if loop and np.dot(rot[b][-1], rot[b][0]) < 0:
            rot[b][-1] = -rot[b][-1]
    out = os.path.join(LIB, f"{name}.vrma")
    write_vrma(out, sk, times, rot, np.array(hips), name, generator)
    idx_path = os.path.join(LIB, "index.json")
    idx = json.load(open(idx_path, encoding="utf-8"))
    idx["clips"] = [c for c in idx["clips"] if c["name"] != name]
    idx["clips"].append({"name": name, "file": f"{name}.vrma", "source": "liora-farm", "duration": round(float(times[-1]), 4),
                         "frames": len(times), "loop": loop})
    idx["clips"].sort(key=lambda c: c["name"])
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(idx, f, indent=2)
    return out


def add_frame(sk, rot, D, loose=None):
    """One frame's world turns D into rot ({bone: [...]}), with no sign flips between frames (the turn between them stays short)."""
    for b, q in locals_of(sk, D, loose).items():
        if rot[b] and np.dot(rot[b][-1], q) < 0:
            q = -q
        rot[b].append(q)
