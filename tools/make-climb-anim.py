#!/usr/bin/env python3
"""Make the climbing loop the animation library lacks: assets/animations/vrma/Climb_Loop.vrma.

Quaternius' libraries have no climbing loop (only ClimbUp_1m, a running vault onto a 1 m ledge), so this one is made in
code and written as one more .vrma in the library: every character gets it the same way as every other clip
(tools/bake-character-anim.py).

It is made for the bodies that play it. The library's skeleton is a grown man's (arms 0.60 of his hips' height, shoulders
at 1.57); the playable characters are VRoid models (arms 0.46, shoulders at 1.39, a big head), and a clip is turns of
the bones only, so hands put on a wall with his arms float off it with theirs (the first climbing clip did: its hands
never came above her head). So the limbs are solved here on the playable characters' own proportions: the mean of the
models in assets/characters/, in hips heights. The clip is still written on the library's bones, as turns away from
T-pose, like every other clip.

The climb (after the way it is done in Genshin Impact): she crawls up the wall. Her hips stand off it and her body
leans in to it, her head up. One hand reaches high, as far as the arm goes, while the knee of the other side comes up
toward the wall, as a knee does in a crawl (not out to the side: a frog's legs, tried first, were wrong), and its foot
takes the wall on its toes; then she pulls on that hand and stands up on that foot, and the hand is pushed down past her
chest to her hip as she goes up past it, while the other hand reaches. Her body does not go up evenly: it heaves up
after each hold is taken and hangs back while the next is reached for (the game moves her root evenly: the heave is her
hips against her root), and it sways a little over the foot that pushes, hips and shoulders tipping against each other.

A hand or foot that holds is a point of the wall: in the clip it slides down at the climbing pace (the clip is in place,
the game moves her up), so in the world it stays where it was put. Off the wall it travels to its next hold starting
from rest in the world and landing as high against her body as it will be. Arms and legs reach their points by
two-bone IK. The hands lie flat on the wall, open, fingers up while they are high and turned out as they are pushed
down; the feet stand on their toes, pointing at the wall. A knee goes up no higher than her belly, so a foot holds for
a shorter way than a hand does (her legs are bent as in a crawl, they do not reach as her arms do).

Usage (from the repo folder; needs numpy):
  python3 tools/make-climb-anim.py
writes assets/animations/vrma/Climb_Loop.vrma and adds it to assets/animations/vrma/index.json, then prints how
well the limbs reach their points and how near her knees, elbows, chest and head come to the wall. Then bake it:
  python3 tools/bake-character-anim.py assets/animations/vrma
(its pace there, CLIPS' "climb", is SPEED below; the wall's distance, WALL, is player-moves.js's WALL_HH).
"""
import glob
import json
import math
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
LIB = os.path.join(REPO, "assets", "animations", "vrma")
CHARACTERS = os.path.join(REPO, "assets", "characters")
TEMPLATE = os.path.join(LIB, "Idle_Loop.vrma")
OUT_NAME = "Climb_Loop"

FPS = 30
# Every length below is in hips heights (how high her hips stand in T-pose: 0.96 m on a 1.75 m character).
PERIOD = 0.81            # s: one cycle, a reach with each hand
SPEED = 1.75             # hips heights a second she climbs when the clip plays at its own rate (1.68 m/s at 1.75 m)
STRIDE = SPEED * PERIOD  # how far up the wall one cycle takes her: a hold is this far above the same limb's last
WALL = 0.44              # the wall's plane, in front of her root: her hips stand this far off it (room for a knee to come up between)
HIPS_Y = 0.99            # her hips above her root (her root is the point of the rock the game holds her to)
HAND_STANCE, FOOT_STANCE = 0.49, 0.30         # the part of the cycle a hand, a foot, holds the wall
HAND_TOP, HAND_X, HAND_OFF = 1.69, 0.215, 0.035   # a hand as it takes hold: how high, how far from her middle, the wrist off the wall
FOOT_TOP, FOOT_X, FOOT_OFF = 0.665, 0.115, 0.135    # a foot (its ankle; its toes are on the wall) as it takes hold
SWING_HAND, SWING_FOOT = 0.085, 0.10          # how far off the wall a hand, a foot, comes halfway to its next hold
SWING_WIDE = 0.035                            # and how far out to its side
PLANT = {"rightHand": 0.0, "leftFoot": 0.95, "leftHand": 0.5, "rightFoot": 0.45}      # when each takes hold (the foot of the other side just before the hand)
BOB, RISE = 0.045, 0.6   # the heave: her hips this far above and below their mean, rising for this part of each half cycle
SWAY = 0.03              # her hips over the foot that pushes
LEAN = 24.0              # degrees her body leans in to the wall from her hips


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
        raise SystemExit(f"no playable characters in {CHARACTERS}: the climb is fitted to their proportions")
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


HH = 1.0                 # the library skeleton's hips height (m): what a hips height is in the clip's own lengths (set in main)


# ---------------------------------------------------------------- one frame of the climb

def hermite(p0, p1, m0, m1, s):
    return (2 * s ** 3 - 3 * s * s + 1) * p0 + (s ** 3 - 2 * s * s + s) * m0 + (-2 * s ** 3 + 3 * s * s) * p1 + (s ** 3 - s * s) * m1


def contact(limb, ph):
    """Where a hand (its wrist) or a foot (its ankle) is at phase ph of the cycle, in hips heights from her root:
    (point, how far through its way to the next hold 0..1, or None while it holds)."""
    hand = limb.endswith("Hand")
    side = 1 if limb.startswith("left") else -1
    stance = HAND_STANCE if hand else FOOT_STANCE
    top, x, off, lift = (HAND_TOP, HAND_X, HAND_OFF, SWING_HAND) if hand else (FOOT_TOP, FOOT_X, FOOT_OFF, SWING_FOOT)
    u = (ph - PLANT[limb]) % 1.0                                  # 0: it has just taken hold
    if u < stance:                                               # held: a point of the wall, she goes up past it
        return np.array([side * x, top - STRIDE * u, WALL - off]), None
    s = (u - stance) / (1 - stance)
    # to its next hold, one stride up the wall. A hand leaves its old hold all but from rest in the world (in the clip's
    # own frame, which goes up at the climbing pace, it is still going down as it was while it held); a foot is picked up
    # off its hold at once (its leg is at its longest there: it cannot follow the wall down). Both come to the new hold
    # as high against her body as they will be: the limb at its longest reach as it lands, never past it on the way
    y = hermite(top - STRIDE * stance, top, -STRIDE * (1 - stance) * (0.8 if hand else 0.2), 0.0, s)
    out = math.sin(math.pi * s)
    return np.array([side * (x + SWING_WIDE * out), y, WALL - off - lift * out ** 1.2]), s


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


def pose(sk, ph):
    """World turns (3x3, away from T-pose) of every bone at phase ph, the hips' place (the clip's own lengths), and
    some measures for the report (hips heights)."""
    rad = math.radians
    D, P = {}, {}
    two = 2 * math.pi * ph
    v = (2 * ph) % 1.0
    w = v / (2 * RISE) if v < RISE else 0.5 + (v - RISE) / (2 * (1 - RISE))
    heave = -math.cos(2 * math.pi * w)                    # -1 as a hand takes hold .. 1 at the top of the heave after it
    over = math.sin(two + 0.2 * math.pi)                  # 1: over her left foot (it has stepped up and pushes) .. -1: her right
    turn = math.cos(two)                                  # 1: her right hand is at its highest .. -1: her left
    reach = {}                                            # how high each hand is, 0 (lowest) .. 1 (highest)
    for side in ("left", "right"):
        point, _ = contact(f"{side}Hand", ph)
        reach[side] = min(1.0, max(0.0, (point[1] - (HAND_TOP - STRIDE * HAND_STANCE)) / (STRIDE * HAND_STANCE)))
    # ---- the body: leaning in to the wall from her hips, her back all but straight, hips and shoulders tipping against
    # each other (the hip of the foot that pushes up, the shoulder of the hand that reaches up), her head held up,
    # looking after that hand
    P["hips"] = HH * np.array([SWAY * over, HIPS_Y + BOB * heave, 0.012 * heave])
    D["hips"] = ry(rad(4) * turn) @ rx(rad(LEAN)) @ rz(rad(4) * over)
    roll, yaw = rad(-7 * turn - 4 * over) / 3, rad(8 * turn) / 3
    local = {
        "spine": ry(yaw) @ rx(rad(-2)) @ rz(roll),
        "chest": ry(yaw) @ rx(rad(-2)) @ rz(roll),
        "upperChest": ry(yaw) @ rx(rad(-2)) @ rz(roll),
        "neck": rx(rad(-16)),
        "head": ry(rad(-12) * math.cos(two + 0.9)) @ rx(rad(-20)),
        "leftShoulder": ry(rad(-7)) @ rz(rad(22) * reach["left"]),
        "rightShoulder": ry(rad(7)) @ rz(rad(-22) * reach["right"]),
    }
    for b in ("spine", "chest", "upperChest", "neck", "head", "leftShoulder", "rightShoulder"):
        p = sk.parent[b]
        D[b] = D[p] @ local[b]
        P[b] = P[p] + D[p] @ sk.offset[b]
    report, loose = {}, {}                                # loose: how far each hand's fingers are curled (0: flat .. 1: as they hang at rest)
    # ---- arms: the wrist on its point, the elbow out and back off the wall
    for side, s in (("left", 1), ("right", -1)):
        sh, up, lo, hd = f"{side}Shoulder", f"{side}UpperArm", f"{side}LowerArm", f"{side}Hand"
        S = P[sh] + D[sh] @ sk.offset[up]
        point, swing = contact(hd, ph)
        W = HH * point
        E, axis = two_bone(S, W, sk.length(lo), sk.length(hd), np.array([s * 1.0, -0.2, -0.8]))
        hinge = np.array([0.0, -s, 0.0])                                 # T-pose: the arm out sideways; the elbow bends it forward
        D[up] = frame(unit(E - S), axis) @ frame(unit(sk.offset[lo]), hinge).T
        D[lo] = frame(unit(W - E), axis) @ frame(unit(sk.offset[hd]), hinge).T
        flat = np.column_stack([[0, 1, 0], [0, 0, -1], [-1, 0, 0]]) if s > 0 else np.column_stack([[0, -1, 0], [0, 0, -1], [1, 0, 0]])
        # flat on the wall: its fingers up and a little out while it is high, turned further out the lower it is (pushing
        # down by her hip, fingers up would break the wrist); off the wall it hangs loose from the forearm
        flat = rz(rad(-(14 + 70 * (1 - reach[side]) ** 1.5) * s)) @ flat
        D[hd] = slerp_m(flat, D[lo], 0.6 * math.sin(math.pi * swing)) if swing is not None else flat
        loose[side] = 0.12 if swing is None else 0.12 + 0.6 * math.sin(math.pi * swing)
        P[up], P[lo], P[hd] = S, E, W
        report[f"{side} elbow from the wall"] = WALL - E[2] / HH
        report[f"{side} hand off its point"] = float(np.linalg.norm(E + D[lo] @ sk.offset[hd] - W)) / HH
    # ---- legs: the ankle on its point, the knee toward the wall (as in a crawl), a little up and hardly out
    for side, s in (("left", 1), ("right", -1)):
        ul, ll, ft, to = f"{side}UpperLeg", f"{side}LowerLeg", f"{side}Foot", f"{side}Toes"
        H = P["hips"] + D["hips"] @ sk.offset[ul]
        point, swing = contact(ft, ph)
        A = HH * point
        K, axis = two_bone(H, A, sk.length(ll), sk.length(ft), np.array([s * 0.28, 0.6, 1.0]))
        hinge = np.array([1.0, 0.0, 0.0])                                # T-pose: the leg straight down; the knee bends it back
        D[ul] = frame(unit(K - H), axis) @ frame(unit(sk.offset[ll]), hinge).T
        D[ll] = frame(unit(A - K), axis) @ frame(unit(sk.offset[ft]), hinge).T
        hold = ry(rad(8 * s)) @ rx(rad(-10))                             # on its toes, pointing at the wall
        free = ry(rad(6 * s)) @ rx(rad(24))                              # hanging loose on its way up, toes down
        D[ft] = slerp_m(hold, free, math.sin(math.pi * swing)) if swing is not None else hold
        D[to] = D[ft]
        P[ul], P[ll], P[ft] = H, K, A
        report[f"{side} knee from the wall"] = WALL - K[2] / HH
        report[f"{side} foot off its point"] = float(np.linalg.norm(K + D[ll] @ sk.offset[ft] - A)) / HH
        if swing is None:
            report[f"{side} toes from the wall (held)"] = WALL - (A + D[ft] @ sk.offset[to])[2] / HH
    report["chest from the wall"] = WALL - (P["upperChest"] + D["upperChest"] @ np.array([0, 0.03, 0.095]) * HH)[2] / HH
    report["face from the wall"] = WALL - (P["head"] + D["head"] @ np.array([0, 0.10, 0.125]) * HH)[2] / HH
    return D, P["hips"], report, loose


def locals_of(sk, D, loose):
    out = {}
    for b in sk.node:
        if b in D:
            p = sk.parent.get(b)
            out[b] = quat_of((D[p].T @ D[b]) if p else D[b])
        else:
            rest = sk.first.get(b, np.eye(3))                # the template's relaxed curl
            side = "left" if b.startswith("left") else "right" if b.startswith("right") else None
            finger = side and any(f in b for f in ("Thumb", "Index", "Middle", "Ring", "Little"))
            # a hand that holds lies open on the wall; off it, its fingers curl as they hang (a thumb always half way)
            out[b] = quat_of(slerp_m(np.eye(3), rest, 0.5 if "Thumb" in b else loose[side])) if finger else quat_of(rest)
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
    global HH
    sk = Skeleton(TEMPLATE)
    HH = float(sk.offset["hips"][1])
    props, count = playable_proportions(sk)
    for b, v in props.items():                               # the limbs are solved on the playable characters' proportions
        sk.offset[b] = v * HH
    n = int(round(PERIOD * FPS)) + 1
    times = np.linspace(0.0, PERIOD, n)
    rot = {b: [] for b in sk.node}
    hips, worst = [], {}
    for t in times:
        D, hp, report, loose = pose(sk, (t / PERIOD) % 1.0)
        for b, q in locals_of(sk, D, loose).items():
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
    cm = 96.2                                                # a hips height on a 1.75 m character, cm
    print(f"wrote {out} ({os.path.getsize(out) // 1024} KB, {n} frames), fitted to the mean of {count} playable characters")
    print(f"  climbs {SPEED:.2f} hips heights a second ({SPEED * cm / 100:.2f} m/s at 1.75 m): {STRIDE * cm:.0f} cm a cycle, "
          f"a hand holds for {STRIDE * HAND_STANCE * cm:.0f} cm of it, a foot for {STRIDE * FOOT_STANCE * cm:.0f} cm")
    for k, v in sorted(worst.items()):
        print(f"  worst {k:<34} {v * cm:6.1f} cm")
    return 0


if __name__ == "__main__":
    sys.exit(main())
