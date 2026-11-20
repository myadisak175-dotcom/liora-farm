#!/usr/bin/env python3
"""Make a turn in the air: assets/animations/vrma/Jump_Spin.vrma, the library's double jump (Jump_Double, Quaternius'
Universal Animation Library 2, CC0) turned once round, for the magic jump's flow (Step 2: tools/make-magic-jump-flow.py).

Asked for: Step 2 was a kick out on the slant (Jump_OffWall_R) and the user found it not pretty ("ท่าถีบข้างไม่สวย หาท่าใหม่
ค่ะ ไม่ต้องถีบข้างก็ได้": find a new one, it need not be a kick). The library has no other move in the air that the set
does not use already, so this one is made from the double jump, kept for its timing and its kick and tuck (legs driven
down, knees snatched up, let down again), and posed again in every frame:

  - the turn: her whole body turned about the up through her hips, once round to her left (TURN_FROM..TURN_TO s of the
    clip), quick out of the kick and slowing as it ends (as a skater's: TURN_CURVE);
  - her arms drawn in for it (ARMS_IN..ARMS_HOLD s, and opened out again by ARMS_OPEN): her upper arms down by her sides
    and a little ahead, her forearms folded in front of her chest, her hands near meeting. As the turn ends they open
    back out to the clip's, out wide (a flower opening);
  - her knees brought together while she turns (KNEES of their spread to the sides taken away), her shins and feet as
    they were.

Her hips' path is the library's, turned with her. Lengths and turns are the library's (T-pose, +Z forward, her left +X,
up +Y). Shared pieces: tools/vrma_pose.py.

Usage (from the repo folder; needs numpy):
  python3 -I tools/make-jump-spin-anim.py
writes assets/animations/vrma/Jump_Spin.vrma and lists it in the library's index.json; then make the flow again:
  python3 -I tools/make-magic-jump-flow.py
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vrma_pose import mat_of, quat_of, read_clip, ry, slerp_m, unit, write_clip  # noqa: E402

SOURCE = "Jump_Double"
OUT_NAME = "Jump_Spin"
TURN_FROM, TURN_TO = 0.11, 0.45        # s of the clip: once round, from just after its kick
ARMS_IN, ARMS_HOLD, ARMS_OPEN = (0.06, 0.16), 0.38, 0.55     # s: drawn in over the first two, held, opened by the last
KNEES = 0.65                           # how much of her thighs' spread to the sides is taken away while she turns
# her arms drawn in, in her chest's own frame (her left side's; her right's x the other way): the upper arm down by her
# side and a little ahead, the forearm folded across in front of her chest, a little up
UPPER_IN = np.array([0.32, -0.72, 0.62])
FORE_IN = np.array([-0.72, 0.3, 0.62])


def smooth01(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def turn_curve(a, b, n=128):
    """How far round a turn is (0..1) at u (0..1) of its time: it speeds up as u^a and slows as (1-u)^b (as
    magic-jump.js' turnCurve)."""
    s = np.zeros(n + 1)
    for i in range(1, n + 1):
        u = (i - 0.5) / n
        s[i] = s[i - 1] + u ** a * (1 - u) ** b
    s /= s[-1]
    return lambda u: float(np.interp(min(1.0, max(0.0, u)) * n, np.arange(n + 1), s))


TURN_CURVE = turn_curve(0.7, 1.8)


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
    new_hips = np.array(hips, dtype=float)
    told = []
    for f, t in enumerate(times):
        local = {b: mat_of(rot[b][f]) for b in sk.node}

        def worlds():
            w = {}
            for b in order:
                w[b] = w[sk.parent[b]] @ local[b] if b in sk.parent else local[b]
            return w
        world = worlds()
        arms = smooth01((t - ARMS_IN[0]) / (ARMS_IN[1] - ARMS_IN[0])) * (1 - smooth01((t - ARMS_HOLD) / (ARMS_OPEN - ARMS_HOLD)))
        knees = KNEES * arms
        chest = world["upperChest"]
        for side, s in (("left", 1.0), ("right", -1.0)):
            mirror = np.array([s, 1.0, 1.0])
            # the thigh: its spread to the side brought in
            leg = f"{side}UpperLeg"
            d = world[leg] @ unit(sk.offset[f"{side}LowerLeg"])
            to = unit(np.array([d[0] * (1 - knees), d[1], d[2]]))
            local[leg] = world[sk.parent[leg]].T @ (shortest(d, to) @ world[leg])
            # the upper arm, then the forearm: drawn in (arms of the way)
            for bone, child, want in ((f"{side}UpperArm", f"{side}LowerArm", UPPER_IN), (f"{side}LowerArm", f"{side}Hand", FORE_IN)):
                world = worlds()
                cur = world[bone] @ unit(sk.offset[child])
                goal = chest @ unit(want * mirror)
                turned = slerp_m(np.eye(3), shortest(cur, goal), arms) @ world[bone]
                local[bone] = world[sk.parent[bone]].T @ turned
        # the turn: her whole body about the up through her hips (her hips' own turn, and their place)
        th = 2 * math.pi * TURN_CURVE((t - TURN_FROM) / (TURN_TO - TURN_FROM))
        local["hips"] = ry(th) @ local["hips"]
        new_hips[f] = ry(th) @ new_hips[f]
        for b in sk.node:
            q = quat_of(local[b])
            if f and np.dot(out[b][f - 1], q) < 0:
                q = -q
            out[b][f] = q
        told.append((t, math.degrees(th), arms))

    path = write_clip(OUT_NAME, sk, times, out, new_hips, False, "liora-farm tools/make-jump-spin-anim.py")
    print(f"wrote {os.path.relpath(path)}: {len(times)} frames, {times[-1]:.2f} s, from {SOURCE}")
    print("   t     turned (degrees)   arms drawn in")
    for t, th, a in told:
        print(f"  {t:.2f}   {th:6.0f}            {a:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
