#!/usr/bin/env python3
"""Make the hop she goes over a fence with: assets/animations/vrma/Hop.vrma, the library's tucked jump posed again.

The library's own tucked jump (NinjaJump_Start: Quaternius, made by hand) has the timing and the arcs: a crouch, a
push, her knees coming up under her as she rises. Its pose is a ninja's, though: knees wide apart and arms spread like
wings, and from behind (where the game's camera is) that reads as a frog. This tool keeps every frame's timing and
turns, and only poses three things again, the same way in every frame, so nothing new moves:

  - her thighs: their spread to the sides is brought in (KNEES of it taken away), each thigh turned the shortest way
    to where it then points. Her shins, feet and toes follow as they were;
  - her upper arms: lowered by ARMS degrees about her forward axis (less, the lower they already hang: in the crouch
    they are behind her hips and stay there);
  - her forearms: the elbows bent ELBOW degrees more, forward, by the same measure.

Her hips' path is the library's. The clip is in place, like the library's: the game moves her (player-hurdle.js, which
also has how high her soles are through this clip: measure them again if KNEES is changed much).

Lengths and turns are the library's (T-pose, +Z forward, her left +X, up +Y). The pieces shared with the other clip
made in code (tools/make-climb-anim.py) are in tools/vrma_pose.py.

Usage (from the repo folder; needs numpy):
  python3 tools/make-hop-anim.py
writes assets/animations/vrma/Hop.vrma and lists it in assets/animations/vrma/index.json, then prints how far apart
her knees are and how high her hands, before and after. Then bake it:
  python3 tools/bake-character-anim.py assets/animations/vrma
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vrma_pose import mat_of, quat_of, read_clip, ry, rz, unit, write_clip  # noqa: E402

SOURCE = "NinjaJump_Start"
OUT_NAME = "Hop"
KNEES = 0.8              # how much of her thighs' sideways spread is taken away
ARMS = 35.0              # degrees her upper arms are lowered
ELBOW = 10.0             # degrees more her elbows bend


def smooth01(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def shortest(a, b):
    """The turn that takes direction a to direction b the shortest way (both unit)."""
    axis = np.cross(a, b)
    s, c = float(np.linalg.norm(axis)), float(np.dot(a, b))
    if s < 1e-9:
        return np.eye(3)
    x, y, z = axis / s
    k = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
    return np.eye(3) + s * k + (1 - c) * (k @ k)


def main():
    sk, times, rot, hips = read_clip(SOURCE)
    order = []                                               # parents before their children

    def visit(b):
        if b in order:
            return
        if b in sk.parent:
            visit(sk.parent[b])
        order.append(b)
    for b in sk.node:
        visit(b)

    out = {b: np.array(rot[b], dtype=float) for b in sk.node}
    told = []
    for f in range(len(times)):
        local = {b: mat_of(rot[b][f]) for b in sk.node}
        world = {}
        for b in order:
            world[b] = world[sk.parent[b]] @ local[b] if b in sk.parent else local[b]
        new = {}
        knees, hands = [], []
        for side, s in (("left", 1.0), ("right", -1.0)):
            # the thigh: its sideways spread brought in
            leg = f"{side}UpperLeg"
            d = world[leg] @ np.array([0.0, -1.0, 0.0])
            to = unit(np.array([d[0] * (1 - KNEES), d[1], d[2]]))
            new[leg] = sk.parent[leg], shortest(d, to) @ world[leg]
            knees.append((d[0], to[0]))
            # the upper arm lowered, the elbow bent a little more: by how far the arm is raised
            arm, fore = f"{side}UpperArm", f"{side}LowerArm"
            a = world[arm] @ np.array([s, 0.0, 0.0])
            w = smooth01((a[1] + 0.75) / 0.6)
            upper = rz(-s * math.radians(ARMS) * w) @ world[arm]
            lower = ry(-s * math.radians(ELBOW) * w) @ (upper @ local[fore])
            new[arm] = sk.parent[arm], upper
            new[fore] = None, upper.T @ lower                # (already a turn from its parent)
            hands.append((a[1], (upper @ np.array([s, 0.0, 0.0]))[1]))
        for b, (parent, m) in new.items():
            q = quat_of(world[parent].T @ m if parent else m)
            if f and np.dot(out[b][f - 1], q) < 0:
                q = -q
            out[b][f] = q
        told.append((times[f], knees, hands))

    path = write_clip(OUT_NAME, sk, times, out, hips, False, "liora-farm tools/make-hop-anim.py")
    print(f"wrote {os.path.relpath(path)}: {len(times)} frames, {times[-1]:.2f} s, from {SOURCE}")
    print("   t     thighs' spread (sideways part of their direction): before -> after     arms' height (up part): before -> after")
    for t, knees, hands in told[::3]:
        print(f"  {t:.2f}   L {knees[0][0]:+.2f} -> {knees[0][1]:+.2f}   R {knees[1][0]:+.2f} -> {knees[1][1]:+.2f}"
              f"        L {hands[0][0]:+.2f} -> {hands[0][1]:+.2f}   R {hands[1][0]:+.2f} -> {hands[1][1]:+.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
