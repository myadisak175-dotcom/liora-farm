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

The pieces it shares with the other clips made in code (the skeleton, the characters' proportions, IK, writing the .vrma)
are in tools/vrma_pose.py.

Usage (from the repo folder; needs numpy):
  python3 tools/make-climb-anim.py
writes assets/animations/vrma/Climb_Loop.vrma and adds it to assets/animations/vrma/index.json, then prints how
well the limbs reach their points and how near her knees, elbows, chest and head come to the wall. Then bake it:
  python3 tools/bake-character-anim.py assets/animations/vrma
(its pace there, CLIPS' "climb", is SPEED below; the wall's distance, WALL, is player-moves.js's WALL_HH).
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vrma_pose import add_frame, fitted_skeleton, frame, hermite, rx, ry, rz, slerp_m, two_bone, unit, write_clip  # noqa: E402

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


# ---------------------------------------------------------------- one frame of the climb

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


HH = 1.0                 # the library skeleton's hips height (m): what a hips height is in the clip's own lengths (set in main)


def main():
    global HH
    sk, HH, count = fitted_skeleton()                        # the limbs are solved on the playable characters' proportions
    n = int(round(PERIOD * FPS)) + 1
    times = np.linspace(0.0, PERIOD, n)
    rot = {b: [] for b in sk.node}
    hips, worst = [], {}
    for t in times:
        D, hp, report, loose = pose(sk, (t / PERIOD) % 1.0)
        add_frame(sk, rot, D, loose)
        hips.append(hp)
        for k, v in report.items():
            worst[k] = (min if "from the wall" in k else max)(worst.get(k, v), v)
    out = write_clip(OUT_NAME, sk, times, rot, hips, True, "make-climb-anim.py (liora-farm; on the skeleton of Quaternius' UAL, CC0)")
    cm = 96.2                                                # a hips height on a 1.75 m character, cm
    print(f"wrote {out} ({os.path.getsize(out) // 1024} KB, {n} frames), fitted to the mean of {count} playable characters")
    print(f"  climbs {SPEED:.2f} hips heights a second ({SPEED * cm / 100:.2f} m/s at 1.75 m): {STRIDE * cm:.0f} cm a cycle, "
          f"a hand holds for {STRIDE * HAND_STANCE * cm:.0f} cm of it, a foot for {STRIDE * FOOT_STANCE * cm:.0f} cm")
    for k, v in sorted(worst.items()):
        print(f"  worst {k:<34} {v * cm:6.1f} cm")
    return 0


if __name__ == "__main__":
    sys.exit(main())
