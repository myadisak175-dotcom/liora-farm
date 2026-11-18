#!/usr/bin/env python3
"""Make the climbing loop the animation library lacks: assets/animations/vrma/Climb_Loop.vrma.

Quaternius' libraries have no climbing loop (only ClimbUp_1m, a running vault onto a 1 m ledge), so this one is made in
code, on the library's own skeleton (the bones and T-pose of its clips: Idle_Loop.vrma is the template), and written as
one more .vrma in the library: every character gets it the same way as every other clip (tools/bake-character-anim.py).

How it is made: she faces a wall (+Z; the library's left is +X), and her four limbs climb it. Each hand and foot is a
point on the wall that, while it holds, slides down at the climbing pace (the body goes up past it: the clip is in place,
the game moves her), and while it swings, comes off the wall a little and reaches back up. Hands and feet go in diagonal
pairs, half a cycle apart (right hand with left foot, left hand with right foot). Arms and legs reach their points by
two-bone IK, elbows out and down, knees out (a climber's frog legs, so the knees stay off the wall); the hands lie flat
on the wall, fingers up, and the feet stand on their toes. The body leans into the wall, its shoulders tip toward the
reaching hand, and she looks up after it. Fingers keep the relaxed curl of Idle_Loop.

Usage (from the repo folder; needs numpy):
  python3 tools/make-climb-anim.py
writes assets/animations/vrma/Climb_Loop.vrma and adds it to assets/animations/vrma/index.json, then prints how
well the limbs reach their points and how close the knees and elbows come to the wall.
"""
import json
import math
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(os.path.dirname(HERE), "assets", "animations", "vrma")
TEMPLATE = os.path.join(LIB, "Idle_Loop.vrma")
OUT_NAME = "Climb_Loop"

FPS = 30
PERIOD = 0.84            # s: one cycle, both pairs of limbs
STANCE = 0.55            # the part of the cycle a limb holds the wall
TRAVEL = 0.56            # m a held hand or foot slides down the wall (library scale: hips 0.917 m up)
WALL = 0.30              # m: the wall's plane, in front of her (z)
HIPS = (0.0, 0.92, 0.0)
HAND_X, HAND_Z, HAND_TOP = 0.27, WALL - 0.05, 1.00       # hands: apart, off the wall (the wrist), the highest they reach above the hips
FOOT_X, FOOT_Z, FOOT_LOW = 0.16, WALL - 0.15, -0.76      # feet (the ankle; the toes touch the wall), the lowest below the hips
SWING_OFF_HAND, SWING_OFF_FOOT = 0.08, 0.10              # m off the wall halfway through a swing
PHASE = {"rightHand": 0.0, "leftFoot": 0.03, "leftHand": 0.5, "rightFoot": 0.53}
SPEED = TRAVEL / (STANCE * PERIOD)                      # m/s the body climbs past a held hand (0.91)


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


# ---------------------------------------------------------------- one frame of the climb

def contact(limb, ph):
    """Where a hand or foot is at phase ph of the cycle: (target point, how far through its swing 0..1 or None held)."""
    hand = limb.endswith("Hand")
    side = 1 if limb.startswith("left") else -1
    u = (ph - PHASE[limb]) % 1.0
    swing = 1.0 - STANCE
    if hand:
        top, x, z, off = HIPS[1] + HAND_TOP, side * HAND_X, HAND_Z, SWING_OFF_HAND
    else:
        top, x, z, off = HIPS[1] + FOOT_LOW + TRAVEL, side * FOOT_X, FOOT_Z, SWING_OFF_FOOT
    low = top - TRAVEL
    if u < swing:                                            # coming off the wall, up, back onto it
        s = u / swing
        e = smooth(s)
        return np.array([x + side * 0.025 * math.sin(math.pi * s), low + (top - low) * e, z - off * math.sin(math.pi * s)]), s
    s = (u - swing) / STANCE                                 # held: sliding down the wall as she climbs past it
    return np.array([x, top - (top - low) * s, z]), None


def two_bone(root, target, a, b, pole):
    """Joint between root and target, a and b the two bones' lengths, bending toward pole (a direction)."""
    d_vec = target - root
    d = float(np.linalg.norm(d_vec))
    d = min(max(d, abs(a - b) + 1e-4), a + b - 1e-4)
    u = unit(d_vec)
    cos_a = (a * a + d * d - b * b) / (2 * a * d)
    sin_a = math.sqrt(max(0.0, 1 - cos_a * cos_a))
    v = unit(pole - u * np.dot(pole, u))
    return root + u * a * cos_a + v * a * sin_a


def pose(sk, ph):
    """World turns (3x3, away from T-pose) of every bone at phase ph, the hips' place, and some measures for the report."""
    D, P = {}, {}
    two = 2 * math.pi * ph
    reach = {}                                               # how high each hand is, 0 (lowest) .. 1 (highest)
    for side in ("left", "right"):
        point, _ = contact(f"{side}Hand", ph)
        reach[side] = (point[1] - (HIPS[1] + HAND_TOP - TRAVEL)) / TRAVEL
    # ---- the body: leaning into the wall, the shoulders tipping toward the reaching hand, looking up after it
    P["hips"] = np.array([HIPS[0] - 0.035 * math.sin(two), HIPS[1] - 0.025 * math.cos(2 * two), HIPS[2]])
    D["hips"] = ry(math.radians(5) * math.sin(two)) @ rx(math.radians(13)) @ rz(math.radians(-4) * math.sin(two))
    local = {
        "spine": rx(math.radians(2)) @ rz(math.radians(-3) * math.sin(two)),
        "chest": rx(math.radians(2)) @ rz(math.radians(-3) * math.sin(two)),
        "upperChest": rx(math.radians(1)) @ rz(math.radians(-3) * math.sin(two)) @ ry(math.radians(-3) * math.sin(two)),
        "neck": rx(math.radians(-10)),
        "head": ry(math.radians(-10) * math.sin(two - 0.6)) @ rx(math.radians(-16)),
        "leftShoulder": ry(math.radians(-8)) @ rz(math.radians(16) * reach["left"]),
        "rightShoulder": ry(math.radians(8)) @ rz(math.radians(-16) * reach["right"]),
    }
    for b in ("spine", "chest", "upperChest", "neck", "head", "leftShoulder", "rightShoulder"):
        p = sk.parent[b]
        D[b] = D[p] @ local[b]
        P[b] = P[p] + D[p] @ sk.offset[b]
    report = {}
    # ---- arms: the hand on its point of the wall, the elbow out and down
    for side, s in (("left", 1), ("right", -1)):
        sh, up, lo, hd = f"{side}Shoulder", f"{side}UpperArm", f"{side}LowerArm", f"{side}Hand"
        S = P[sh] + D[sh] @ sk.offset[up]
        W, swing = contact(hd, ph)
        a, b = sk.length(lo), sk.length(hd)
        E = two_bone(S, W, a, b, np.array([s * 1.0, -0.8, -0.6]))
        d0, n0 = np.array([s, 0.0, 0.0]), np.array([0.0, -s, 0.0])       # T-pose: the arm out sideways; the elbow bends it forward
        n1 = unit(np.cross(E - S, W - E))
        D[up] = frame(unit(E - S), n1) @ frame(d0, n0).T
        D[lo] = frame(unit(W - E), n1) @ frame(d0, n0).T
        flat = np.column_stack([[0, 1, 0], [0, 0, -1], [-1, 0, 0]]) if s > 0 else np.column_stack([[0, -1, 0], [0, 0, -1], [1, 0, 0]])
        D[hd] = slerp_m(flat, D[lo], 0.55 * math.sin(math.pi * swing)) if swing is not None else flat
        P[up], P[lo], P[hd] = S, E, W
        report[f"{side} elbow from the wall"] = WALL - E[2]
        report[f"{side} hand off its point"] = float(np.linalg.norm(E + D[lo] @ sk.offset[hd] - W))
    # ---- legs: the foot on its point of the wall, the knee out
    for side, s in (("left", 1), ("right", -1)):
        ul, ll, ft, to = f"{side}UpperLeg", f"{side}LowerLeg", f"{side}Foot", f"{side}Toes"
        H = P["hips"] + D["hips"] @ sk.offset[ul]
        A, swing = contact(ft, ph)
        a, b = sk.length(ll), sk.length(ft)
        K = two_bone(H, A, a, b, np.array([s * 1.0, -0.3, 0.5]))
        d0, n0 = np.array([0.0, -1.0, 0.0]), np.array([1.0, 0.0, 0.0])   # T-pose: the leg straight down; the knee bends it back
        n1 = unit(np.cross(K - H, A - K))
        D[ul] = frame(unit(K - H), n1) @ frame(d0, n0).T
        D[ll] = frame(unit(A - K), n1) @ frame(d0, n0).T
        on_toes = ry(math.radians(12 * s)) @ rx(math.radians(-8))       # toes a little out, pressed up against the wall
        D[ft] = slerp_m(on_toes, ry(math.radians(12 * s)) @ rx(math.radians(25)), math.sin(math.pi * swing)) if swing is not None else on_toes
        D[to] = D[ft]
        report[f"{side} knee from the wall"] = WALL - K[2]
        report[f"{side} foot off its point"] = float(np.linalg.norm(K + D[ll] @ sk.offset[ft] - A))
        report[f"{side} toes from the wall"] = WALL - (A + D[ft] @ sk.offset[to])[2]
    return D, P["hips"], report


def locals_of(sk, D):
    out = {}
    for b in sk.node:
        if b in D:
            p = sk.parent.get(b)
            out[b] = quat_of((D[p].T @ D[b]) if p else D[b])
        else:
            out[b] = quat_of(sk.first.get(b, np.eye(3)))       # fingers and thumbs: the template's relaxed curl
    return out


# ---------------------------------------------------------------- writing the .vrma

def write_vrma(path, sk, times, rot, hips):
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
        "asset": {"version": "2.0", "generator": "make-climb-anim.py (liora-farm; on the skeleton of Quaternius' UAL, CC0)"},
        "extensionsUsed": ["VRMC_vrm_animation"],
        "extensions": sk.js["extensions"],
        "scene": 0, "scenes": sk.js["scenes"], "nodes": sk.js["nodes"],
        "animations": [{"name": OUT_NAME, "samplers": samplers, "channels": channels}],
        "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(binary)}],
    }
    jb = json.dumps(js, separators=(",", ":")).encode()
    jb += b" " * ((4 - len(jb) % 4) % 4)
    binary += b"\x00" * ((4 - len(binary) % 4) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(jb) + 8 + len(binary)))
        f.write(struct.pack("<I4s", len(jb), b"JSON")); f.write(jb)
        f.write(struct.pack("<I4s", len(binary), b"BIN\x00")); f.write(binary)


def main():
    sk = Skeleton(TEMPLATE)
    n = int(round(PERIOD * FPS)) + 1
    times = np.linspace(0.0, PERIOD, n)
    rot = {b: [] for b in sk.node}
    hips, worst = [], {}
    for t in times:
        D, hp, report = pose(sk, (t / PERIOD) % 1.0)
        for b, q in locals_of(sk, D).items():
            if rot[b] and np.dot(rot[b][-1], q) < 0:
                q = -q                                       # (no sign flips between frames: the turn between them stays short)
            rot[b].append(q)
        hips.append(hp)
        for k, v in report.items():
            worst[k] = (min if "from the wall" in k else max)(worst.get(k, v), v)
    rot = {b: np.array(v) for b, v in rot.items()}
    for b in rot:                                            # the last frame is the first again: a seamless loop
        if np.dot(rot[b][-1], rot[b][0]) < 0:
            rot[b][-1] = -rot[b][-1]
    out = os.path.join(LIB, f"{OUT_NAME}.vrma")
    write_vrma(out, sk, times, rot, np.array(hips))
    idx_path = os.path.join(LIB, "index.json")
    idx = json.load(open(idx_path, encoding="utf-8"))
    idx["clips"] = [c for c in idx["clips"] if c["name"] != OUT_NAME]
    idx["clips"].append({"name": OUT_NAME, "file": f"{OUT_NAME}.vrma", "source": "liora-farm", "duration": round(PERIOD, 4),
                         "frames": n, "loop": True})
    idx["clips"].sort(key=lambda c: c["name"])
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(idx, f, indent=2)
    print(f"wrote {out} ({os.path.getsize(out) // 1024} KB, {n} frames, climbs {SPEED:.2f} m/s at library scale)")
    for k, v in sorted(worst.items()):
        print(f"  worst {k:<28} {v * 100:6.1f} cm")
    return 0


if __name__ == "__main__":
    sys.exit(main())
