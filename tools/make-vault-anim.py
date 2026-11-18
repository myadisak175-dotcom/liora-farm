#!/usr/bin/env python3
"""Make the vault the animation library lacks: assets/animations/vrma/Vault.vrma, a speed vault over something low.

Quaternius' libraries have nothing to go over a fence with, so this one is made in code, like the climbing loop
(tools/make-climb-anim.py; the pieces they share are in tools/vrma_pose.py) and written as one more .vrma in the library:
every character gets it the same way as every other clip (tools/bake-character-anim.py, as 'hurdle').

The vault (after the way it is done in Genshin Impact): running at a fence, she reaches for its top with her left hand,
takes off from her left foot as her right knee comes up, and plants the hand on the top. On that straight arm she leans
over to her left, her hips rise and her legs, tucked together, swing over the top out to her right side; she pushes off
the hand as her legs come down on the far side, lands on her right foot, the left one already going forward, and runs
on. Her right arm is thrown up and out for balance while she is over.

The clip is in place (the game moves her root, player-moves.js) and is made over a canonical thing: its top TOP hips
heights high, along a line square to her way, which her root crosses at UC of the clip. The game puts her root where
this clip expects it from the moment the hand goes down (U_PLANT) to the moment it comes off (U_RELEASE), and lifts or
lowers it by as much as the real thing's top is higher or lower than TOP: so whatever she goes over, her hand is on its
top. ROOT_IN, ROOT_OUT are where her root is before the line and after it as the clip begins and ends (hips heights);
the game reads all of these from player-hurdle.js (keep the two the same).

Everything here is made on the playable characters' own proportions (vrma_pose.fitted_skeleton). Lengths are in hips
heights (how high her hips stand in T-pose: 0.96 m on a 1.75 m character), +Z forward, her left +X, up +Y.

Usage (from the repo folder; needs numpy):
  python3 tools/make-vault-anim.py
writes assets/animations/vrma/Vault.vrma and adds it to assets/animations/vrma/index.json, then prints how far over the
top her hips, knees and feet go as she crosses it, and how well the hand and feet hold. Then bake it:
  python3 tools/bake-character-anim.py assets/animations/vrma
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vrma_pose import add_frame, fitted_skeleton, frame, rx, ry, rz, slerp_m, two_bone, unit, write_clip  # noqa: E402

OUT_NAME = "Vault"
FPS = 30
LENGTH = 0.6             # s
TOP = 0.92               # how high the canonical thing's top is (its rail's top, where her hand goes down)
UC = 0.36                # when her root crosses its line
U_PLANT, U_RELEASE = 0.18, 0.5      # her left hand on its top
U_LAND = 0.64            # her right foot down on the far side
ROOT_IN, ROOT_OUT = 0.78, 1.2       # her root this far before the line as the clip begins, this far past it as it ends
ANKLE = 0.12             # her ankle over the ground with her foot flat


def root_at(u):
    """Where her root is along her way, from the thing's line (hips heights): it comes in, crosses at UC, goes on."""
    return -ROOT_IN * (1 - u / UC) if u < UC else ROOT_OUT * (u - UC) / (1 - UC)


# ---------------------------------------------------------------- tracks: keys over the clip, smoothly between them

class Track:
    """Values at keys of the clip (u, value); between them a curve through them (Catmull-Rom tangents, none at a key
    next to one with the same value, so a hand or foot that holds stays exactly put)."""

    def __init__(self, keys):
        self.u = [k[0] for k in keys]
        self.v = [np.array(k[1], dtype=float) for k in keys]

    def tangent(self, i):
        u, v, n = self.u, self.v, len(self.u)
        if (i > 0 and np.allclose(v[i], v[i - 1])) or (i < n - 1 and np.allclose(v[i], v[i + 1])):
            return v[i] * 0.0
        if i == 0:
            return (v[1] - v[0]) / (u[1] - u[0])
        if i == n - 1:
            return (v[-1] - v[-2]) / (u[-1] - u[-2])
        return (v[i + 1] - v[i - 1]) / (u[i + 1] - u[i - 1])

    def at(self, u):
        if u <= self.u[0]:
            return self.v[0].copy()
        if u >= self.u[-1]:
            return self.v[-1].copy()
        i = max(j for j in range(len(self.u) - 1) if self.u[j] <= u)
        h = self.u[i + 1] - self.u[i]
        s = (u - self.u[i]) / h
        h00, h10, h01, h11 = 2 * s ** 3 - 3 * s * s + 1, s ** 3 - 2 * s * s + s, -2 * s ** 3 + 3 * s * s, s ** 3 - s * s
        return h00 * self.v[i] + h10 * h * self.tangent(i) + h01 * self.v[i + 1] + h11 * h * self.tangent(i + 1)


H = TOP + 0.035          # her left wrist on the top: the hand's thickness over it
L_PLANT = (0.15, H, 0.0)
L_TAKEOFF = (0.09, ANKLE, -0.62)    # her left foot's last stride before the thing: she takes off from it
R_LAND = (-0.1, ANKLE, 0.8)         # her right foot's first after it
L_STEP = (0.09, ANKLE, 1.27)        # and her left one's

# her hips, from her root (x, y, z): she comes in leaning, crouches to take off, rises over the top beside her hand and
# comes down on the far side
HIPS = Track([(0.0, (0.0, 0.96, 0.05)), (0.12, (0.0, 0.94, 0.08)), (U_PLANT, (-0.02, 1.0, 0.08)), (0.24, (-0.05, 1.07, 0.06)),
              (0.30, (-0.09, 1.12, 0.03)), (UC, (-0.12, 1.16, 0.0)), (0.44, (-0.11, 1.14, 0.0)), (U_RELEASE, (-0.09, 1.02, 0.02)),
              (U_LAND, (-0.04, 0.9, 0.06)), (0.76, (-0.02, 0.92, 0.05)), (0.88, (0.0, 0.96, 0.04)), (1.0, (0.0, 0.97, 0.04))])
# how her body is turned (degrees): yaw (toward her left), pitch (leaning forward), roll (leaning over to her left)
TURN = Track([(0.0, (0, 14, 0)), (0.12, (2, 22, -4)), (U_PLANT, (6, 24, -14)), (0.24, (10, 16, -28)), (0.30, (13, 10, -40)),
              (UC, (14, 6, -46)), (0.44, (10, 4, -32)), (U_RELEASE, (6, 6, -15)), (U_LAND, (2, 14, -4)), (0.76, (0, 14, 0)),
              (1.0, (0, 12, 0))])
# her feet's ankles, from the thing's line: a foot that is down holds still; in the air they are drawn up beside her (not
# ahead of her: a knee led into the top) and swung over it together, out to her right, then down on the far side
FOOT_L = Track([(0.0, L_TAKEOFF), (0.12, L_TAKEOFF), (U_PLANT, (0.0, 0.42, -0.5)), (0.24, (-0.25, 0.8, -0.35)),
                (0.30, (-0.45, 1.02, -0.16)), (UC, (-0.58, 1.1, 0.02)), (0.44, (-0.46, 0.98, 0.3)), (U_RELEASE, (-0.32, 0.68, 0.46)),
                (U_LAND, (-0.12, 0.42, 0.6)), (0.76, (0.06, 0.3, 0.9)), (0.88, L_STEP), (1.0, L_STEP)])
FOOT_R = Track([(0.0, (-0.09, 0.3, -1.0)), (0.12, (-0.14, 0.5, -0.58)), (U_PLANT, (-0.3, 0.78, -0.42)), (0.24, (-0.5, 0.98, -0.25)),
                (0.30, (-0.66, 1.1, -0.06)), (UC, (-0.74, 1.14, 0.16)), (0.44, (-0.58, 0.85, 0.45)), (U_RELEASE, (-0.34, 0.5, 0.62)),
                (0.58, (-0.15, 0.2, 0.76)), (U_LAND, R_LAND), (0.76, R_LAND), (0.88, (-0.09, 0.24, 0.75)), (1.0, (-0.09, 0.34, 0.88))])
FOOT_DOWN_L = Track([(0.0, 1), (0.12, 1), (0.17, 0), (0.80, 0), (0.88, 1), (1.0, 1)])      # how flat on the ground each foot is (0: pointed, in the air)
FOOT_DOWN_R = Track([(0.0, 0), (0.58, 0), (U_LAND, 1), (0.78, 1), (0.88, 0), (1.0, 0)])
# which way her knees bend: forward as she runs; up and out to her right while her legs are drawn up and swung over
KNEE_L = Track([(0.0, (0.1, 0.0, 1.0)), (0.12, (0.1, 0.1, 1.0)), (U_PLANT, (-0.5, 0.6, 0.6)), (0.24, (-0.9, 0.7, 0.3)), (UC, (-0.9, 0.7, 0.3)),
                (0.44, (-0.5, 0.5, 0.8)), (U_LAND, (0.1, 0.05, 1.0)), (1.0, (0.1, 0.0, 1.0))])
KNEE_R = Track([(0.0, (-0.1, 0.0, 1.0)), (0.12, (-0.2, 0.3, 1.0)), (U_PLANT, (-0.9, 0.7, 0.3)), (UC, (-0.9, 0.7, 0.3)),
                (0.44, (-0.5, 0.5, 0.8)), (U_LAND, (-0.1, 0.05, 1.0)), (1.0, (-0.1, 0.0, 1.0))])
# her wrists: the left one reaches for the top, holds it, and comes up off it; the right one swings, and is thrown up and
# out over her right side as she goes over
HAND_L = Track([(0.0, (0.2, 1.08, -0.45)), (0.10, (0.17, 1.02, -0.18)), (U_PLANT, L_PLANT), (U_RELEASE - 0.02, L_PLANT),
                (U_LAND, (0.32, 1.02, 0.42)), (0.8, (0.24, 0.98, 0.86)), (1.0, (0.2, 0.9, 0.98))])
HAND_R = Track([(0.0, (-0.22, 0.86, -0.95)), (0.10, (-0.28, 1.0, -0.62)), (U_PLANT, (-0.44, 1.2, -0.42)), (0.24, (-0.6, 1.34, -0.24)),
                (UC, (-0.7, 1.44, 0.05)), (U_RELEASE, (-0.56, 1.22, 0.36)), (U_LAND, (-0.32, 0.98, 0.76)), (0.8, (-0.24, 0.88, 0.62)),
                (1.0, (-0.18, 1.0, 1.42))])
HOLD = Track([(0.0, 0), (U_PLANT - 0.03, 0), (U_PLANT, 1), (U_RELEASE - 0.02, 1), (U_RELEASE + 0.03, 0), (1.0, 0)])      # her left hand open on the top
# her head: down at the top as she reaches for it, then up, looking where she goes
LOOK = Track([(0.0, (0, 8)), (0.12, (0, 22)), (U_PLANT, (0, 14)), (UC, (-6, 0)), (U_LAND, (0, 2)), (1.0, (0, 6))])


def pose(sk, u, hh):
    """World turns (3x3, away from T-pose) of every bone at u (0..1), the hips' place (from her root, the clip's own
    lengths), how far each hand's fingers curl, and where the joints are (from the thing's line, hips heights)."""
    rad = math.radians
    D, P = {}, {}
    zr = root_at(u)
    lift = lambda p: hh * (np.array(p) - np.array([0.0, 0.0, zr]))          # a point from the thing's line -> from her root
    yaw, pitch, roll = TURN.at(u)
    P["hips"] = hh * HIPS.at(u)
    D["hips"] = ry(rad(yaw)) @ rx(rad(pitch)) @ rz(rad(roll))
    look_yaw, look_pitch = LOOK.at(u)
    hold = float(HOLD.at(u))
    # the back a little arched against her lean; the neck and head keep her face more upright than her body
    local = {
        "spine": rx(rad(-3)) @ rz(rad(-0.08 * roll)),
        "chest": rx(rad(-3)) @ rz(rad(-0.08 * roll)),
        "upperChest": rx(rad(-2)) @ ry(rad(-0.2 * yaw)),
        "neck": rx(rad(look_pitch * 0.4 - pitch * 0.35)) @ rz(rad(-0.25 * roll)),
        "head": ry(rad(look_yaw - 0.5 * yaw)) @ rx(rad(look_pitch * 0.6 - pitch * 0.35)) @ rz(rad(-0.3 * roll)),
        "leftShoulder": rz(rad(10 * hold)),                             # (shrugged up a little as she bears on that hand)
        "rightShoulder": rz(rad(-14)),
    }
    for b in ("spine", "chest", "upperChest", "neck", "head", "leftShoulder", "rightShoulder"):
        p = sk.parent[b]
        D[b] = D[p] @ local[b]
        P[b] = P[p] + D[p] @ sk.offset[b]
    joints = {}
    # ---- arms: the left wrist on the top while it holds, the elbow out and back; the right one out for balance
    loose = {"left": 0.75 * (1 - hold), "right": 0.7}
    for side, s, track, pole in (("left", 1, HAND_L, np.array([1.0, -0.2, -0.8])), ("right", -1, HAND_R, np.array([-0.6, -1.0, -0.4]))):
        sh, up, lo, hd = f"{side}Shoulder", f"{side}UpperArm", f"{side}LowerArm", f"{side}Hand"
        S = P[sh] + D[sh] @ sk.offset[up]
        W = lift(track.at(u))
        E, axis = two_bone(S, W, sk.length(lo), sk.length(hd), pole)
        hinge = np.array([0.0, -s, 0.0])
        D[up] = frame(unit(E - S), axis) @ frame(unit(sk.offset[lo]), hinge).T
        D[lo] = frame(unit(W - E), axis) @ frame(unit(sk.offset[hd]), hinge).T
        flat = ry(rad(-70 * s))                                          # palm down on the top, fingers forward and a little out
        D[hd] = slerp_m(D[lo], flat, hold) if side == "left" else D[lo]
        P[up], P[lo], P[hd] = S, E, W
        joints[f"{side} hand"] = (E + D[lo] @ sk.offset[hd]) / hh + np.array([0.0, 0.0, zr])
        joints[f"{side} elbow"] = E / hh + np.array([0.0, 0.0, zr])
    # ---- legs: the ankle on its point, the knee toward KNEE
    for side, s, track, down, knee in (("left", 1, FOOT_L, FOOT_DOWN_L, KNEE_L), ("right", -1, FOOT_R, FOOT_DOWN_R, KNEE_R)):
        ul, ll, ft, to = f"{side}UpperLeg", f"{side}LowerLeg", f"{side}Foot", f"{side}Toes"
        Hj = P["hips"] + D["hips"] @ sk.offset[ul]
        A = lift(track.at(u))
        K, axis = two_bone(Hj, A, sk.length(ll), sk.length(ft), knee.at(u))
        hinge = np.array([1.0, 0.0, 0.0])
        D[ul] = frame(unit(K - Hj), axis) @ frame(unit(sk.offset[ll]), hinge).T
        D[ll] = frame(unit(A - K), axis) @ frame(unit(sk.offset[ft]), hinge).T
        flat_foot = ry(rad(4 * s))
        pointed = D[ll] @ rx(rad(30))
        D[ft] = slerp_m(pointed, flat_foot, float(down.at(u)))
        D[to] = D[ft]
        P[ul], P[ll], P[ft] = Hj, K, A
        joints[f"{side} knee"] = K / hh + np.array([0.0, 0.0, zr])
        joints[f"{side} foot"] = A / hh + np.array([0.0, 0.0, zr])
        joints[f"{side} toes"] = (A + D[ft] @ sk.offset[to]) / hh + np.array([0.0, 0.0, zr])
        joints[f"{side} hip"] = Hj / hh + np.array([0.0, 0.0, zr])
        joints[f"{side} foot reach"] = float(np.linalg.norm(K + D[ll] @ sk.offset[ft] - A)) / hh
    joints["hips"] = P["hips"] / hh + np.array([0.0, 0.0, zr])
    joints["left hand reach"] = float(np.linalg.norm(joints["left hand"] - HAND_L.at(u)))
    return D, P["hips"], loose, joints


def main():
    sk, hh, count = fitted_skeleton()
    n = int(round(LENGTH * FPS)) + 1
    times = np.linspace(0.0, LENGTH, n)
    rot = {b: [] for b in sk.node}
    hips, frames = [], []
    for t in times:
        u = t / LENGTH
        D, hp, loose, joints = pose(sk, u, hh)
        add_frame(sk, rot, D, loose)
        hips.append(hp)
        frames.append((u, joints))
    out = write_clip(OUT_NAME, sk, times, rot, hips, False, "make-vault-anim.py (liora-farm; on the skeleton of Quaternius' UAL, CC0)")
    cm = 96.2
    print(f"wrote {out} ({os.path.getsize(out) // 1024} KB, {n} frames, {LENGTH} s), fitted to the mean of {count} playable characters")
    # over the top: for every frame, every joint within 0.15 of the thing's line, how far above its top
    print(f"  over the top ({TOP * cm:.0f} cm at 1.75 m): the least each joint clears it by while within 15 cm of its line:")
    clear = {}
    for u, j in frames:
        for k, v in j.items():
            if isinstance(v, float) or k.endswith("hand") or k.endswith("elbow"):
                continue
            pad = 0.12 if k in ("hips", "left hip", "right hip") else 0.05 if "knee" in k else 0.06
            if abs(v[2]) < 0.15:
                c = v[1] - pad - TOP
                clear[k] = min(clear.get(k, 9), c)
    for k, v in sorted(clear.items()):
        print(f"    {k:<12} {v * cm:6.1f} cm{'   <- INTO IT' if v < 0 else ''}")
    worst = max(j["left hand reach"] for u, j in frames if U_PLANT <= u <= U_RELEASE - 0.02)
    feet = max(max(j["left foot reach"], j["right foot reach"]) for u, j in frames)
    print(f"  left hand off its hold on the top: {worst * cm:.1f} cm at worst;  a foot off its point: {feet * cm:.1f} cm at worst")
    below = min(min(j["left toes"][1], j["right toes"][1]) for u, j in frames)
    print(f"  toes lowest: {below * cm:.1f} cm (under 0: into the ground)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
