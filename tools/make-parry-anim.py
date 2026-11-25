#!/usr/bin/env python3
"""Make her parry's moves: assets/animations/vrma/Parry.vrma, Parry_Hit.vrma and Parry_Hurt.vrma.

Asked for on 26 Nov 2026 in the barrier's place: "จะเอา บาเรีย ออก แต่ ทำ เป็น pary แบบ doctor strang แทน", a parry of
blows thrown at her from afar, pressed in time ("ปัด สกิล ระยะไกล กดให้ตรงจังหวะ"). A circle of her magic stands at her
palm (parry-fx.js draws it); this is her body. The library has nothing like it (Spell_Simple_Shoot holds a hand out
and nothing more), so all three are made here, in code, on the library's bones, as turns away from T-pose like every
other clip there, from her standing pose (Idle_Loop's first frame) and back into it:

  Parry       0.62 s  pressed: her left hand thrust out at what comes, its palm to it, fingers up, her body turned
                      side on behind it (her left shoulder forward, as her left foot is), her right hand drawn back low
                      by her hip; held while the circle is hot; then let down into her standing pose (nothing came)
  Parry_Hit   0.50 s  what came met the circle: begins in Parry's held pose. The blow knocks her hand and chest back a
                      hand's width, her knees giving; she drives her palm out again after it (it goes back where it came
                      from); then let down into her standing pose
  Parry_Hurt  0.46 s  a blow got through: thrown back from her chest, her head after it, her arms flung out, her hips
                      back and her knees giving; then back into her standing pose, a little past it first

Her left hand leads because her left foot does: her standing pose has it ahead (README, The animation standard). The
thrust is fast (an action game's: the palm is out 0.085 s after the press), arrives a little past where it is going and
settles; nothing moves all at once (her back, then her arm, then her hand; her head keeps on what comes). Her feet do
not move: her legs reach from wherever her hips are to where her toes stand, by two-bone IK on the playable
characters' own proportions (tools/vrma_pose.py), knees ahead.

Lengths and turns are the library's (T-pose, +Z forward, her left +X, up +Y). Every length below is in hips heights
(0.96 m on a 1.75 m character).

Usage (from the repo folder; needs numpy):
  python3 tools/make-parry-anim.py
writes the three into assets/animations/vrma (and its index.json), prints how her hips and feet go through each, and
then bakes them for the parry's pages into a file of their own (the game's character-anim.js is not made bigger):
  python3 tools/bake-character-anim.py assets/animations/vrma parry-anim.js parry:Parry parry_hit:Parry_Hit hurt:Parry_Hurt
"""
import math
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vrma_pose import fitted_skeleton, frame, mat_of, quat_of, read_clip, rx, ry, rz, slerp_m, two_bone, unit, write_clip  # noqa: E402

IDLE = "Idle_Loop"
FPS = 60                 # a fast move: 60 frames a second, so the thrust's few hundredths of a second are drawn
rad = math.radians
FINGERS = ("Thumb", "Index", "Middle", "Ring", "Little")
TORSO = ("hips", "spine", "chest", "upperChest", "leftShoulder", "rightShoulder")
HEAD = ("neck", "head")
ARM = {s: tuple(f"{s}{b}" for b in ("UpperArm", "LowerArm", "Hand")) for s in ("left", "right")}
LEG = {s: tuple(f"{s}{b}" for b in ("UpperLeg", "LowerLeg", "Foot", "Toes")) for s in ("left", "right")}
PARTS = {"head": HEAD, "torso": TORSO, "left": ARM["left"], "right": ARM["right"]}


# ---------------------------------------------------------------- how things move: never all at once, never to a dead stop

def clamp01(u):
    return min(1.0, max(0.0, u))


def ease(t, a, b):
    """0 .. 1 from a to b, leaving and arriving gently."""
    u = clamp01((t - a) / (b - a))
    return u * u * u * (u * (6 * u - 15) + 10)


def snap(t, a, b):
    """0 .. 1 from a to b: off at once, arriving gently (a thrust, a blow taken)."""
    u = clamp01((t - a) / (b - a))
    return 1 - (1 - u) ** 3


def over(t, a, b, much=1.4):
    """0 .. 1 from a to b, off at once, going a little past and coming back (a thrown hand)."""
    u = clamp01((t - a) / (b - a)) - 1
    return 1 + (much + 1) * u ** 3 + much * u * u


def ordered(sk):
    order = []

    def visit(b):
        if b in order:
            return
        if b in sk.parent:
            visit(sk.parent[b])
        order.append(b)
    for b in sk.node:
        visit(b)
    return order


def stand(sk, order, local, hips):
    """Turns from the parent bone (and the hips' place) -> world turns and places."""
    D, P = {}, {}
    for b in order:
        if b in sk.parent:
            p = sk.parent[b]
            D[b], P[b] = D[p] @ local[b], P[p] + D[p] @ sk.offset[b]
        else:
            D[b], P[b] = local[b], np.array(hips, dtype=float)
    return D, P


# ---------------------------------------------------------------- the poses she passes through (her body and arms)

def posed(sk, spec, standing):
    """One pose of her body and arms, as turns from the parent bone (tools/make-barrier-anim.py's way). spec: 'hips' and
    the spine's bones as turns ADDED to her standing pose's; for each arm where its wrist is from its shoulder (a
    direction, and how far of the arm's length), which way its elbow points, and its hand: (which way the fingers
    point, which way the back of the hand faces), or None for a hand that lies along the forearm."""
    D = {"hips": standing["hips"] @ spec.get("hips", np.eye(3))}
    P = {"hips": np.zeros(3)}
    for b in ("spine", "chest", "upperChest", "neck", "head", "leftShoulder", "rightShoulder"):
        p = sk.parent[b]
        D[b] = D[p] @ standing[b] @ spec.get(b, np.eye(3))
        P[b] = P[p] + D[p] @ sk.offset[b]
    for side, s in (("left", 1.0), ("right", -1.0)):
        sh, (up, lo, hd) = f"{side}Shoulder", ARM[side]
        to, far, pole, hand = spec[side]
        S = P[sh] + D[sh] @ sk.offset[up]
        reach = sk.length(lo) + sk.length(hd)
        W = S + unit(np.array(to, dtype=float)) * reach * far
        E, axis = two_bone(S, W, sk.length(lo), sk.length(hd), np.array(pole, dtype=float))
        hinge = np.array([0.0, -s, 0.0])                         # T-pose: the arm out sideways; the elbow bends it forward
        D[up] = frame(unit(E - S), axis) @ frame(unit(sk.offset[lo]), hinge).T
        D[lo] = frame(unit(W - E), axis) @ frame(unit(sk.offset[hd]), hinge).T
        if hand is None:
            D[hd] = D[lo]
        else:
            f, back = unit(np.array(hand[0], dtype=float)), np.array(hand[1], dtype=float)
            D[hd] = frame(s * f, unit(back - f * np.dot(back, f)))      # T-pose: fingers out sideways, the back of the hand up
    return {b: (D[sk.parent[b]].T @ D[b] if b in sk.parent else D[b]) for b in D}


def poses(sk, standing):
    """The keys. Her standing pose is 'stand' (the library's idle as it begins); the rest are made here."""
    # GUARD: side on behind her left palm. Her hips and back turned 26 degrees to her right altogether (her left
    # shoulder forward, over her left foot), leaning into it a little; her head turned back to look straight ahead,
    # over her hand, at what comes. Her left hand out at the height of her collarbone, a little in toward her middle,
    # the elbow soft and pointing down, the palm square to what comes, the fingers up and spread a little. Her right
    # hand drawn back low by her hip, the elbow back, the palm down: one line from it through her to her left palm
    guard = posed(sk, {
        "hips": ry(rad(-8)),
        "spine": ry(rad(-4)) @ rx(rad(3)), "chest": ry(rad(-4)) @ rx(rad(3)), "upperChest": ry(rad(-5)) @ rx(rad(2)) @ rz(rad(-2)),
        "neck": ry(rad(7)), "head": ry(rad(12)) @ rx(rad(3)) @ rz(rad(2)),
        "leftShoulder": ry(rad(-12)) @ rz(rad(6)), "rightShoulder": ry(rad(-9)) @ rz(rad(-3)),
        "left": ((0.1, 0.12, 1.0), 0.92, (0.55, -1.0, -0.25), ((0.2, 1.0, 0.22), (0.3, 0.05, -1.0))),
        "right": ((-0.3, -0.86, -0.3), 0.8, (-0.45, -0.05, -1.0), ((0.05, -0.45, 1.0), (-0.25, 1.0, 0.0))),
    }, standing)
    # TAKEN: the blow knocks her palm and chest back a hand's width, her head back after them, her shoulders up
    taken = posed(sk, {
        "hips": ry(rad(-8)),
        "spine": ry(rad(-4)) @ rx(rad(-2)), "chest": ry(rad(-4)) @ rx(rad(-4)), "upperChest": ry(rad(-5)) @ rx(rad(-5)) @ rz(rad(-2)),
        "neck": ry(rad(8)) @ rx(rad(-3)), "head": ry(rad(13)) @ rx(rad(-6)) @ rz(rad(2)),
        "leftShoulder": ry(rad(-6)) @ rz(rad(9)), "rightShoulder": ry(rad(-6)) @ rz(rad(-6)),
        "left": ((0.13, 0.26, 1.0), 0.77, (0.6, -1.0, -0.4), ((0.12, 1.0, -0.12), (0.22, -0.25, -1.0))),
        "right": ((-0.34, -0.8, -0.22), 0.76, (-0.5, -0.1, -1.0), ((0.05, -0.5, 1.0), (-0.25, 1.0, 0.0))),
    }, standing)
    # DRIVEN: she drives the palm out again after it, further than she held it, her weight forward over her left foot
    # and her right hand thrown further back for it
    driven = posed(sk, {
        "hips": ry(rad(-11)),
        "spine": ry(rad(-5)) @ rx(rad(5)), "chest": ry(rad(-5)) @ rx(rad(5)), "upperChest": ry(rad(-6)) @ rx(rad(4)) @ rz(rad(-3)),
        "neck": ry(rad(8)) @ rx(rad(1)), "head": ry(rad(14)) @ rx(rad(3)) @ rz(rad(3)),
        "leftShoulder": ry(rad(-17)) @ rz(rad(2)), "rightShoulder": ry(rad(-12)) @ rz(rad(-2)),
        "left": ((0.1, 0.15, 1.0), 0.965, (0.5, -1.0, -0.15), ((0.25, 1.0, 0.35), (0.32, 0.1, -1.0))),
        "right": ((-0.3, -0.78, -0.5), 0.86, (-0.4, -0.05, -1.0), ((0.05, -0.6, 1.0), (-0.3, 1.0, 0.0))),
    }, standing)
    # HURT: thrown back from her chest and turned a little away, her head back after it, her arms flung out low and
    # forward, elbows bent, hands open
    hurt = posed(sk, {
        "hips": ry(rad(6)) @ rx(rad(-3)),
        "spine": rx(rad(-5)) @ ry(rad(3)), "chest": rx(rad(-7)) @ ry(rad(3)), "upperChest": rx(rad(-8)) @ ry(rad(4)) @ rz(rad(3)),
        "neck": rx(rad(-7)), "head": rx(rad(-12)) @ ry(rad(-6)) @ rz(rad(-4)),
        "leftShoulder": rz(rad(12)), "rightShoulder": rz(rad(-10)),
        "left": ((0.62, -0.5, 0.55), 0.74, (0.3, -0.6, -1.0), ((0.55, -0.2, 0.8), (0.1, 1.0, -0.2))),
        "right": ((-0.58, -0.55, 0.5), 0.76, (-0.3, -0.6, -1.0), ((-0.5, -0.25, 0.8), (-0.1, 1.0, -0.2))),
    }, standing)
    return {"guard": guard, "taken": taken, "driven": driven, "hurt": hurt}


# ---------------------------------------------------------------- the three clips: when each part goes from key to key
# For each part: [(time, key, how it arrives there)], the first at 0. Her back leads, her arms come a little after it,
# her head keeps on what comes. 'hips': [(time, (x, y, z) from where she stands, hips heights, how)]. 'open': how open
# each hand is at each moment (0 flat .. 1 as it hangs). 'alive': a hold that is not quite still.
CLIPS = {
    "Parry": {
        "length": 0.62,
        "torso": [(0.0, "stand", None), (0.075, "guard", over), (0.31, "guard", None), (0.6, "stand", ease)],
        "left": [(0.0, "stand", None), (0.012, "stand", None), (0.085, "guard", over), (0.30, "guard", None), (0.58, "stand", ease)],
        "right": [(0.0, "stand", None), (0.09, "guard", snap), (0.33, "guard", None), (0.62, "stand", ease)],
        "head": [(0.0, "stand", None), (0.06, "guard", snap), (0.34, "guard", None), (0.6, "stand", ease)],
        "hips": [(0.0, (0, 0, 0), None), (0.08, (-0.01, -0.03, 0.004), snap), (0.31, (-0.01, -0.03, 0.004), None), (0.6, (0, 0, 0), ease)],
        "open": {"left": [(0.0, 1.0), (0.07, 0.12), (0.32, 0.12), (0.56, 1.0)], "right": [(0.0, 1.0), (0.09, 0.55), (0.33, 0.55), (0.6, 1.0)]},
        "alive": (0.085, 0.31),
    },
    "Parry_Hit": {
        "length": 0.5,
        "torso": [(0.0, "guard", None), (0.045, "taken", snap), (0.15, "driven", over), (0.24, "driven", None), (0.49, "stand", ease)],
        "left": [(0.0, "guard", None), (0.04, "taken", snap), (0.14, "driven", over), (0.23, "driven", None), (0.47, "stand", ease)],
        "right": [(0.0, "guard", None), (0.06, "taken", snap), (0.16, "driven", over), (0.25, "driven", None), (0.5, "stand", ease)],
        "head": [(0.0, "guard", None), (0.055, "taken", snap), (0.16, "driven", ease), (0.26, "driven", None), (0.49, "stand", ease)],
        "hips": [(0.0, (-0.01, -0.03, 0.004), None), (0.05, (-0.008, -0.045, -0.03), snap), (0.15, (-0.012, -0.04, 0.03), over),
                 (0.24, (-0.012, -0.038, 0.028), None), (0.49, (0, 0, 0), ease)],
        "open": {"left": [(0.0, 0.12), (0.04, 0.25), (0.14, 0.05), (0.25, 0.08), (0.46, 1.0)], "right": [(0.0, 0.55), (0.15, 0.45), (0.25, 0.45), (0.5, 1.0)]},
        "alive": None,
    },
    "Parry_Hurt": {
        "length": 0.46,
        "torso": [(0.0, "stand", None), (0.065, "hurt", snap), (0.13, "hurt", None), (0.45, "stand", over)],
        "left": [(0.0, "stand", None), (0.08, "hurt", over), (0.14, "hurt", None), (0.44, "stand", ease)],
        "right": [(0.0, "stand", None), (0.085, "hurt", over), (0.15, "hurt", None), (0.46, "stand", ease)],
        "head": [(0.0, "stand", None), (0.02, "stand", None), (0.09, "hurt", over), (0.16, "hurt", None), (0.45, "stand", ease)],
        "hips": [(0.0, (0, 0, 0), None), (0.07, (0.004, -0.05, -0.05), snap), (0.14, (0.004, -0.052, -0.046), None), (0.45, (0, 0, 0), over)],
        "open": {"left": [(0.0, 1.0), (0.08, 0.15), (0.2, 0.3), (0.44, 1.0)], "right": [(0.0, 1.0), (0.085, 0.15), (0.2, 0.3), (0.46, 1.0)]},
        "alive": None,
    },
}


def along(track, t):
    """Where a part is on its track at t: (key it comes from, key it goes to, how far, 0 .. 1 or a little past)."""
    for i in range(len(track) - 1):
        t0, k0, _ = track[i]
        t1, k1, how = track[i + 1]
        if t < t1 or i == len(track) - 2:
            if how is None or t1 <= t0:
                return k0, k1, 1.0 if t >= t1 else 0.0
            return k0, k1, how(t, t0, t1)
    return track[-1][1], track[-1][1], 1.0


def blend(a, b, w):
    """a to b by w, w allowed a little past 1 (going past and coming back): past 1, on along the same turn."""
    if w <= 1.0:
        return slerp_m(a, b, max(0.0, w))
    step = a.T @ b                                            # (the turn from a to b, taken (w - 1) times again)
    q = quat_of(step)
    ang = 2 * math.acos(max(-1.0, min(1.0, q[3])))
    if ang < 1e-6:
        return b
    axis = q[:3] / math.sin(ang / 2)
    extra = (w - 1.0) * ang
    c, s = math.cos(extra / 2), math.sin(extra / 2)
    return b @ mat_of(np.array([axis[0] * s, axis[1] * s, axis[2] * s, c]))


def mix(a, b, w):
    return np.array(a, dtype=float) + (np.array(b, dtype=float) - np.array(a, dtype=float)) * w


def make(name, spec, sk, order, keys, standing_local, i_hips, HH):
    """One clip: its frames' turns and hips, and what to report."""
    yaw = {}
    D_st, P_st = stand(sk, order, standing_local, i_hips[0])
    for s in ("left", "right"):
        yaw[s] = math.atan2(*(D_st[f"{s}Foot"] @ np.array([0.0, 0.0, 1.0]))[[0, 2]])
    toes = {s: P_st[f"{s}Toes"] for s in ("left", "right")}
    reach_leg = sk.length("leftLowerLeg") + sk.length("leftFoot")
    base = np.array(i_hips[0], dtype=float)

    def frame_at(t):
        local = {}
        for part, bones in PARTS.items():
            k0, k1, w = along(spec[part], t)
            for b in bones:
                a = standing_local[b] if k0 == "stand" else keys[k0][b]
                z = standing_local[b] if k1 == "stand" else keys[k1][b]
                local[b] = blend(a, z, w)
        # a hold is not quite still: her palm presses on a hair, her back breathes
        if spec["alive"]:
            a0, a1 = spec["alive"]
            k = ease(t, a0, a0 + 0.06) * (1 - ease(t, a1 - 0.05, a1))
            s1 = math.sin(2 * math.pi * 3.1 * (t - a0))
            local["leftLowerArm"] = local["leftLowerArm"] @ ry(rad(1.6 * s1) * k)
            local["upperChest"] = local["upperChest"] @ rx(rad(0.8 * s1) * k)
        # the hips: where her body stands (her legs reach from here to where her toes are)
        hp = None
        for i in range(len(spec["hips"]) - 1):
            t0, h0, _ = spec["hips"][i]
            t1, h1, how = spec["hips"][i + 1]
            if t < t1 or i == len(spec["hips"]) - 2:
                w = 1.0 if how is None and t >= t1 else 0.0 if how is None else how(t, t0, t1)
                hp = mix(h0, h1, w)
                break
        hips = base + hp * HH
        # her fingers: the template's relaxed curl, opened as far as each hand is open
        for side in ("left", "right"):
            pts = spec["open"][side]
            c = pts[-1][1]
            for i in range(len(pts) - 1):
                if t < pts[i + 1][0]:
                    c = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * ease(t, pts[i][0], pts[i + 1][0])
                    break
            for b in sk.node:
                if b.startswith(side) and any(f in b for f in FINGERS):
                    rest = sk.first.get(b, np.eye(3))
                    local[b] = slerp_m(np.eye(3), rest, max(c, 0.45) if "Thumb" in b else c) if c < 1.0 else rest
        # her legs: from where her hips are to where her toes stand, knees ahead
        body = {b: local.get(b, standing_local[b]) for b in order}
        D, P = stand(sk, order, body, hips)
        told = {}
        for side in ("left", "right"):
            ul, ll, ft, to = LEG[side]
            H = P["hips"] + D["hips"] @ sk.offset[ul]
            ground = ry(yaw[side])
            A = toes[side] - ground @ sk.offset[to]
            pole = ry(yaw[side]) @ np.array([0.0, 0.12, 1.0])
            K, axis = two_bone(H, A, sk.length(ll), sk.length(ft), pole)
            hinge = np.array([1.0, 0.0, 0.0])                    # T-pose: the leg straight down; the knee bends it back
            D[ul] = frame(unit(K - H), axis) @ frame(unit(sk.offset[ll]), hinge).T
            D[ll] = frame(unit(A - K), axis) @ frame(unit(sk.offset[ft]), hinge).T
            D[ft] = ground
            D[to] = ground
            for b in (ul, ll, ft, to):
                local[b] = D[sk.parent[b]].T @ D[b]
            ankle = K + D[ll] @ sk.offset[ft]
            told[side] = (float(np.linalg.norm(ankle - A)) / HH, float(np.linalg.norm(A - H)) / reach_leg)
        for b in sk.node:
            local.setdefault(b, standing_local[b])
        # where her left palm is (reported: parry-fx.js puts the circle before her hand), hips heights from her root
        D2, P2 = stand(sk, order, local, hips)
        palm = P2["leftHand"] + D2["leftHand"] @ np.array([0.09 * HH, 0.0, 0.0])
        return local, hips, told, palm / HH

    n = int(round(spec["length"] * FPS)) + 1
    times = np.arange(n) / FPS
    rot = {b: [] for b in sk.node}
    hips, report = [], []
    for t in times:
        local, hp, told, palm = frame_at(float(t))
        for b in sk.node:
            q = quat_of(local[b])
            if rot[b] and np.dot(rot[b][-1], q) < 0:
                q = -q
            rot[b].append(q)
        hips.append(hp)
        report.append((float(t), hp, told, palm))
    return times, rot, hips, report


def main():
    sk, HH, count = fitted_skeleton()                        # her legs are solved on the playable characters' proportions
    order = ordered(sk)
    _, _, i_rot, i_hips = read_clip(IDLE)
    standing_local = {b: mat_of(i_rot[b][0]) for b in sk.node}
    keys = poses(sk, standing_local)
    cm = 96.2                                                # a hips height on a 1.75 m character, cm
    made = []
    for name, spec in CLIPS.items():
        times, rot, hips, report = make(name, spec, sk, order, keys, standing_local, i_hips, HH)
        out = write_clip(name, sk, times, rot, hips, False, "make-parry-anim.py (liora-farm; on the skeleton of Quaternius' UAL, CC0)")
        made.append(name)
        print(f"wrote {os.path.relpath(out)} ({os.path.getsize(out) // 1024} KB, {len(times)} frames, {times[-1]:.2f} s), fitted to the mean of {count} playable characters")
        print("   t     hips y (cm)  hips z (cm)   feet off their places L / R (cm)   legs' stretch L / R   palm (cm: x, y, z)")
        for t, hp, told, palm in report[::3]:
            (el, sl), (er, sr) = told["left"], told["right"]
            print(f"  {t:.3f}   {hp[1] / HH * cm:6.1f}     {(hp[2] - i_hips[0][2]) / HH * cm:5.1f}         {el * cm:4.2f} / {er * cm:4.2f}"
                  f"                     {sl:.3f} / {sr:.3f}        {palm[0] * cm:5.1f} {palm[1] * cm:5.1f} {palm[2] * cm:5.1f}")
    # baked for the pages that play them
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    subprocess.run([sys.executable, os.path.join(repo, "tools", "bake-character-anim.py"), os.path.join(repo, "assets", "animations", "vrma"),
                    "parry-anim.js", "parry:Parry", "parry_hit:Parry_Hit", "hurt:Parry_Hurt"], check=True, cwd=repo)
    return 0


if __name__ == "__main__":
    sys.exit(main())
