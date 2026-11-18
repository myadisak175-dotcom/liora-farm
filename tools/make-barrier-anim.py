#!/usr/bin/env python3
"""Make the move she casts her water barrier with: assets/animations/vrma/Barrier_Cast.vrma.

The library (Quaternius' UAL) has one way of casting: Spell_Simple, a hand held out in front of her. The barrier
(barrier-fx.js) wants more of her: the water gathered in her hand, the hand thrown up over her head, then her arms flung
wide as the water closes over her and she is lifted off the ground inside it, and set down again as it goes. So this
clip begins as the library's (Spell_Simple_Enter, frame for frame: her left hand brought up in front of her) and goes on
in code, on the library's bones, as turns away from T-pose like every other clip there:

  gather   0.00 .. 0.53   the library's Spell_Simple_Enter as it is
  raise    0.53 .. 1.05   a small dip at the knees, then up on her toes, the hand thrown up over her head, her head
                          going up first to look after it, her other arm let down behind her, her back arched
  open     1.05 .. 1.45   a moment's gathering, then off the ground: her arms flung wide, chest open, feet let go
  float    1.45 .. 2.65   she hangs there, a hand's width of bobbing, her arms breathing, one knee a little forward,
                          toes down
  down     2.65 .. 3.30   let down on her toes, her heels after, her knees giving a little; her arms come down last;
                          she ends as the library's Idle_Loop begins

The times are barrier-fx.js's BARRIER (its beats are drawn to this clip): change one, change the other.

Nothing in it moves all at once: her head leads, her body follows, her arms come after and her hands last, and what
arrives overshoots a little and settles. Her legs reach their places by two-bone IK on the playable characters' own
proportions (tools/vrma_pose.py), so her toes stay where they stand while her hips dip and rise, and come down on the
ground and not into it. She is lifted inside the clip (her hips' path): the game only has to play it where she stands.

Lengths and turns are the library's (T-pose, +Z forward, her left +X, up +Y).

Usage (from the repo folder; needs numpy):
  python3 tools/make-barrier-anim.py
writes assets/animations/vrma/Barrier_Cast.vrma and lists it in assets/animations/vrma/index.json, then prints how
high her hips and her toes are through it and how well her feet reach their places. Then bake it for the page that
plays it (barrier.html), into a file of its own (the game's character-anim.js does not carry it yet):
  python3 tools/bake-character-anim.py assets/animations/vrma barrier-anim.js idle:Idle_Loop barrier:Barrier_Cast
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vrma_pose import fitted_skeleton, frame, mat_of, quat_of, read_clip, rx, ry, rz, slerp_m, two_bone, unit, write_clip  # noqa: E402

OUT_NAME = "Barrier_Cast"
ENTER, IDLE = "Spell_Simple_Enter", "Idle_Loop"

FPS = 30
T_RAISE, T_BURST, T_FLOAT, T_DOWN, T_END = 16 / 30, 1.05, 1.45, 2.65, 3.30
# Every length below is in hips heights (how high her hips stand in T-pose: 0.96 m on a 1.75 m character).
RISE = 0.30              # how far off the ground she is lifted
DIP = 0.035              # how far her hips dip before the hand is thrown up
TIPTOE = 22.0            # degrees her heels come up as it is
BOB, BOB_HZ = 0.012, 0.55    # hanging in the water: her hips this far up and down, this often
TOES_DOWN = 52.0         # degrees her feet point down while she hangs
JOIN = 0.2               # seconds the library's last frame is eased into what is made here (fingers, legs)

rad = math.radians
FINGERS = ("Thumb", "Index", "Middle", "Ring", "Little")
TORSO = ("hips", "spine", "chest", "upperChest", "leftShoulder", "rightShoulder")
HEAD = ("neck", "head")
ARM = {s: tuple(f"{s}{b}" for b in ("UpperArm", "LowerArm", "Hand")) for s in ("left", "right")}
LEG = {s: tuple(f"{s}{b}" for b in ("UpperLeg", "LowerLeg", "Foot", "Toes")) for s in ("left", "right")}


# ---------------------------------------------------------------- how things move: never all at once, never to a dead stop

def clamp01(u):
    return min(1.0, max(0.0, u))


def ease(t, a, b):
    """0 .. 1 from a to b, leaving and arriving gently."""
    u = clamp01((t - a) / (b - a))
    return u * u * u * (u * (6 * u - 15) + 10)


def ease_out(t, a, b):
    """0 .. 1 from a to b: off at once, arriving gently."""
    u = clamp01((t - a) / (b - a))
    return 1 - (1 - u) ** 3


def over(t, a, b, much=1.25):
    """0 .. 1 from a to b, going a little past and coming back (a thrown hand, an opened chest)."""
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

def posed(sk, spec):
    """One pose of her body and arms, as turns from the parent bone. spec: 'hips' and the spine's bones as turns; for
    each arm where its wrist is from its shoulder (a direction, and how far of the arm's length), which way its elbow
    points, and its hand: (which way the fingers point, which way the back of the hand faces), or None for a hand that
    lies along the forearm."""
    D = {"hips": spec["hips"]}
    P = {"hips": np.zeros(3)}
    for b in ("spine", "chest", "upperChest", "neck", "head", "leftShoulder", "rightShoulder"):
        p = sk.parent[b]
        D[b] = D[p] @ spec.get(b, np.eye(3))
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


def poses(sk):
    # the hand thrown up: her left hand over her head, a little in front and to its own side, the palm turned up to the
    # sky under the water it holds; her back arched and her left shoulder up, her head back to look at it; her right
    # arm let down behind her, away from her side
    raised = posed(sk, {
        "hips": ry(rad(-5)) @ rx(rad(-2)),
        "spine": rx(rad(-3)) @ rz(rad(2.5)), "chest": rx(rad(-4)) @ rz(rad(3)), "upperChest": ry(rad(-4)) @ rx(rad(-4)) @ rz(rad(3.5)),
        "neck": rx(rad(-12)), "head": ry(rad(7)) @ rx(rad(-20)),
        "leftShoulder": rz(rad(20)), "rightShoulder": ry(rad(-6)) @ rz(rad(4)),
        "left": ((0.13, 1.0, 0.3), 0.985, (0.75, 0.0, 0.65), ((0.05, 0.85, -0.5), (-0.1, -0.5, -0.85))),
        "right": ((-0.5, -0.78, -0.37), 0.95, (-0.5, 0.2, -0.85), None),
    })
    # hanging in the water: her arms wide, a little under her shoulders and a little behind them, elbows soft, palms
    # turned forward and up; her chest lifted, her shoulders back, her head back a little and to one side
    floating = posed(sk, {
        "hips": rx(rad(-2)),
        "spine": rx(rad(-2)), "chest": rx(rad(-3)), "upperChest": rx(rad(-4)),
        "neck": rx(rad(1)), "head": rx(rad(2)) @ rz(rad(4)),
        "leftShoulder": ry(rad(9)) @ rz(rad(3)), "rightShoulder": ry(rad(-9)) @ rz(rad(-3)),
        "left": ((0.9, -0.32, -0.1), 0.955, (0.0, -0.75, -0.65), ((0.93, -0.16, 0.12), (0.05, -0.5, -0.87))),
        "right": ((-0.92, -0.26, -0.06), 0.945, (0.0, -0.75, -0.65), ((-0.94, -0.1, 0.1), (-0.05, -0.5, -0.87))),
    })
    return raised, floating


# ---------------------------------------------------------------- one frame after the library's part

def main():
    sk, HH, count = fitted_skeleton()                        # her legs are solved on the playable characters' proportions
    order = ordered(sk)
    _, e_times, e_rot, e_hips = read_clip(ENTER)
    _, _, i_rot, i_hips = read_clip(IDLE)
    if abs(e_times[-1] - T_RAISE) > 1e-3:
        raise SystemExit(f"{ENTER} is {e_times[-1]:.3f} s long, T_RAISE says {T_RAISE:.3f}: set them alike")
    start = {b: mat_of(e_rot[b][-1]) for b in sk.node}       # where the library leaves her
    end = {b: mat_of(i_rot[b][0]) for b in sk.node}          # where the library's idle takes her up
    raised, floating = poses(sk)
    keys = []                                                # the four poses her body and arms pass through
    for pose in (start, raised, floating, end):
        keys.append({b: pose[b] for b in (*TORSO, *HEAD, *ARM["left"], *ARM["right"])})
    D0, P0 = stand(sk, order, start, e_hips[-1])
    D3, P3 = stand(sk, order, end, i_hips[0])
    yaw = {s: math.atan2(*(D3[f"{s}Foot"] @ np.array([0.0, 0.0, 1.0]))[[0, 2]]) for s in ("left", "right")}
    toes0 = {s: P0[f"{s}Toes"] for s in ("left", "right")}   # where her toes stand as the library leaves her,
    toes3 = {s: P3[f"{s}Toes"] for s in ("left", "right")}   # and where the idle has them
    y0, y3 = e_hips[-1][1] / HH, i_hips[0][1] / HH
    reach_leg = sk.length("leftLowerLeg") + sk.length("leftFoot")

    # when each part of her goes from one pose to the next (seconds; how): raise, open, down
    when = {
        "head": ((T_RAISE + 0.00, 0.86, ease), (T_BURST + 0.06, 1.50, ease), (T_DOWN + 0.02, 3.08, ease)),
        "torso": ((T_RAISE + 0.04, 0.96, ease), (T_BURST + 0.02, 1.40, over), (T_DOWN + 0.06, 3.18, ease)),
        "left": ((T_RAISE + 0.10, 1.00, over), (T_BURST + 0.02, 1.44, over), (T_DOWN + 0.08, 3.28, ease)),
        "right": ((T_RAISE + 0.06, 1.02, ease), (T_BURST + 0.06, 1.48, over), (T_DOWN + 0.12, 3.30, ease)),
    }
    parts = {"head": HEAD, "torso": TORSO, "left": ARM["left"], "right": ARM["right"]}
    curl = {"left": (None, 0.1, 0.16, 1.0), "right": (None, 0.7, 0.16, 1.0)}      # her fingers at each pose: 0 flat .. 1 as they hang

    def between(part, t):
        (a0, b0, f0), (a1, b1, f1), (a2, b2, f2) = when[part]
        if t < a1:
            return 0, f0(t, a0, b0)
        if t < a2:
            return 1, f1(t, a1, b1)
        return 2, f2(t, a2, b2)

    def hips_at(t):
        """Her hips' place (hips heights) and how far she has let go of the ground (0 standing .. 1 hanging)."""
        tip = y0 + 0.028                                     # as high as she stands on her toes
        y = y0 - DIP * (ease(t, T_RAISE, T_RAISE + 0.14) - ease(t, T_RAISE + 0.14, 0.9))
        y += (tip - y0) * ease(t, T_RAISE + 0.16, 0.95)
        y -= 0.02 * (ease(t, T_BURST - 0.07, T_BURST + 0.02) - ease(t, T_BURST + 0.02, T_BURST + 0.14))      # gathering herself
        up = over(t, T_BURST + 0.05, T_FLOAT + 0.07, 0.9) * ease(t, T_BURST + 0.03, T_BURST + 0.17)      # taken up, not shot up
        hang = ease(t, T_BURST + 0.1, T_FLOAT) * (1 - ease(t, T_DOWN - 0.1, T_DOWN + 0.2))
        y += (y0 + RISE - tip) * up + BOB * math.sin(2 * math.pi * BOB_HZ * (t - T_FLOAT)) * hang
        # let down: quickly at first, slower as her toes find the ground, her knees giving under her, then up to the idle
        down = ease(t, T_DOWN - 0.05, 3.06)
        y += (y3 - 0.022 - y0 - RISE) * down + 0.022 * ease(t, 3.06, T_END - 0.02)
        let_go = ease(t, T_BURST + 0.05, T_FLOAT - 0.03) * (1 - ease(t, T_DOWN + 0.05, 3.04))
        x0, z0, x3, z3 = e_hips[-1][0] / HH, e_hips[-1][2] / HH, i_hips[0][0] / HH, i_hips[0][2] / HH
        a, b = ease(t, T_BURST, T_FLOAT), ease(t, T_DOWN, 3.1)
        x = x0 + (0.0 - x0) * a + (x3 - 0.0) * b
        z = z0 + (-0.07 - z0) * a + (z3 + 0.07) * b
        return np.array([x, y, z]) * HH, let_go

    def frame_at(t):
        local, loose = {}, {}
        for part, bones in parts.items():
            i, w = between(part, t)
            for b in bones:
                local[b] = slerp_m(keys[i][b], keys[i + 1][b], w)
            if part in curl:
                c0 = curl[part][i] if curl[part][i] is not None else 1.0
                loose[part] = c0 + (curl[part][i + 1] - c0) * clamp01(w)
        hips, let_go = hips_at(t)
        # hanging: nothing of her is quite still. Her arms breathe, her chest with them, her head drifts
        hang = ease(t, T_FLOAT - 0.1, T_FLOAT + 0.2) * (1 - ease(t, T_DOWN - 0.05, T_DOWN + 0.25))
        s1 = math.sin(2 * math.pi * BOB_HZ * (t - T_FLOAT) - 0.9)
        s2 = math.sin(2 * math.pi * BOB_HZ * (t - T_FLOAT) - 1.7)
        local["leftShoulder"] = local["leftShoulder"] @ rz(rad(3.0 * s1) * hang)
        local["rightShoulder"] = local["rightShoulder"] @ rz(rad(-3.0 * s1) * hang)
        local["leftLowerArm"] = local["leftLowerArm"] @ ry(rad(-4.0 * s2) * hang)
        local["rightLowerArm"] = local["rightLowerArm"] @ ry(rad(4.0 * s2) * hang)
        local["upperChest"] = local["upperChest"] @ rx(rad(-1.2 * s1) * hang)
        local["head"] = local["head"] @ rx(rad(1.5 * s2) * hang)
        # ---- fingers: the template's relaxed curl, opened as far as each hand is open
        for b in sk.node:
            side = "left" if b.startswith("left") else "right" if b.startswith("right") else None
            if side and any(f in b for f in FINGERS):
                rest = sk.first.get(b, np.eye(3))
                c = loose[side]
                local[b] = slerp_m(np.eye(3), rest, 0.5 if "Thumb" in b and c < 1.0 else c) if c < 1.0 else rest
        # ---- her body, standing where her hips are: then her legs reach from it to where her feet belong
        body = {b: local.get(b, np.eye(3)) for b in order}
        D, P = stand(sk, order, body, hips)
        landing = t > (T_FLOAT + T_DOWN) / 2
        heel = TIPTOE * ease(t, T_RAISE + 0.16, 0.95) if not landing else 26.0 * (1 - ease(t, 3.04, 3.22))
        told = {}
        for side, s in (("left", 1.0), ("right", -1.0)):
            ul, ll, ft, to = LEG[side]
            H = P["hips"] + D["hips"] @ sk.offset[ul]
            # on the ground: her toes stay where they stand, her heel up as far as she is on them
            ground = ry(yaw[side]) @ rx(rad(heel))
            toes = toes3[side] if landing else toes0[side]
            A_ground = toes - ground @ sk.offset[to]
            # hanging: the left leg all but straight under her, a little back; the right knee a little forward and
            # across; both feet pointing down
            rel = np.array([-0.03, -0.812, -0.015]) if side == "left" else np.array([0.035, -0.75, 0.06])
            sway = 0.012 * math.sin(2 * math.pi * BOB_HZ * (t - T_FLOAT) - (2.3 if side == "left" else 2.9))
            A_air = H + D["hips"] @ ((rel + np.array([0.0, 0.0, sway])) * HH)
            air = ry(rad(6 * s)) @ rx(rad(TOES_DOWN if side == "left" else TOES_DOWN - 8))
            # between the two: her feet are the last of her to leave the ground and the first to find it again; a leg
            # at its full length lets go (it is never stretched past it)
            k = let_go
            A = A_ground + (A_air - A_ground) * k
            for _ in range(24):
                if np.linalg.norm(A - H) <= 0.985 * reach_leg or k >= 1.0:
                    break
                k = min(1.0, k + 0.04)
                A = A_ground + (A_air - A_ground) * k
            foot = slerp_m(ground, D["hips"] @ air, k)
            pole = ry(yaw[side] * (1 - k) + rad(4 * s) * k) @ np.array([0.0, 0.12, 1.0])
            K, axis = two_bone(H, A, sk.length(ll), sk.length(ft), pole)
            hinge = np.array([1.0, 0.0, 0.0])                    # T-pose: the leg straight down; the knee bends it back
            D[ul] = frame(unit(K - H), axis) @ frame(unit(sk.offset[ll]), hinge).T
            D[ll] = frame(unit(A - K), axis) @ frame(unit(sk.offset[ft]), hinge).T
            D[ft] = foot
            D[to] = slerp_m(ry(yaw[side]), foot @ rx(rad(12)), k)       # on the ground her toes lie flat; hanging they point with the foot
            for b in (ul, ll, ft, to):
                local[b] = D[sk.parent[b]].T @ D[b]
            ankle = K + D[ll] @ sk.offset[ft]
            told[side] = (float(np.linalg.norm(ankle - A)) / HH, float((ankle + D[ft] @ sk.offset[to])[1]) / HH,
                          float(np.linalg.norm(A - H)) / reach_leg)
        # ---- joined to the library at both ends: what is not posed above (her fingers, her legs) eased from where the
        # library's cast leaves it, and into where its idle begins
        j0, j1 = ease(t, T_RAISE, T_RAISE + JOIN), ease(t, T_END - JOIN, T_END)
        for b in sk.node:
            m = local.get(b, np.eye(3))
            if j0 < 1.0:
                m = slerp_m(start[b], m, j0)
            if j1 > 0.0:
                m = slerp_m(m, end[b], j1)
            local[b] = m
        if j1 > 0.0:
            hips = hips + (np.array(i_hips[0]) - hips) * j1
        return local, hips, told

    n = int(round(T_END * FPS)) + 1
    times = np.arange(n) / FPS
    rot = {b: [] for b in sk.node}
    hips, report = [], []
    for f, t in enumerate(times):
        if f < len(e_times):                                 # the library's cast, as it is
            q = {b: np.array(e_rot[b][f], dtype=float) for b in sk.node}
            hp, told = np.array(e_hips[f], dtype=float), None
        else:
            local, hp, told = frame_at(float(t))
            q = {b: quat_of(local[b]) for b in sk.node}
        for b in sk.node:
            if rot[b] and np.dot(rot[b][-1], q[b]) < 0:
                q[b] = -q[b]
            rot[b].append(q[b])
        hips.append(hp)
        report.append((t, hp[1] / HH, told))
    out = write_clip(OUT_NAME, sk, times, rot, hips, False, "make-barrier-anim.py (liora-farm; on the skeleton of Quaternius' UAL, CC0)")
    cm = 96.2                                                # a hips height on a 1.75 m character, cm
    print(f"wrote {os.path.relpath(out)} ({os.path.getsize(out) // 1024} KB, {n} frames, {times[-1]:.2f} s), from {ENTER} "
          f"({len(e_times)} frames), fitted to the mean of {count} playable characters")
    print("   t     hips (cm)   toes off the ground L / R (cm)   feet off their places L / R (cm)   legs' stretch L / R")
    for t, y, told in report[::3]:
        if told is None:
            print(f"  {t:.2f}   {y * cm:6.1f}     (the library's)")
        else:
            (el, tl, sl), (er, tr, sr) = told["left"], told["right"]
            print(f"  {t:.2f}   {y * cm:6.1f}     {tl * cm - 4.2:5.1f} / {tr * cm - 4.2:5.1f}                  {el * cm:4.1f} / {er * cm:4.1f}"
                  f"                      {sl:.3f} / {sr:.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
