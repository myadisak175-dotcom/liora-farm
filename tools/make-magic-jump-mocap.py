#!/usr/bin/env python3
"""Make the magic jump's take-off, its landing and her kick off a cliff's face from Mixamo moves (mocap), posed again
for her:

  MJ_Up   <- Mixamo "Jumping Up"      the first jump off the ground: a crouch, a push, her knees coming up under her
  MJ_Land <- Mixamo "Falling To Landing"  every landing (from a jump, from high, off a slide or a vault): down into a
                                      crouch, and up into her standing pose
  MJ_Wall <- Mixamo "Jump From Wall"  climbing, the jump button with the stick pulled away from the rock: she kicks off
                                      it backwards and turns round in the air to face away from it

They are first made .vrma by tools/mixamo-to-vrma.mjs (the vault's too: three-vrm's Mixamo retarget onto the library's
skeleton), into assets/animations/mixamo/, which is not in the repo: Mixamo's moves are Adobe's, free to use in the
game, not to hand on as files. What the mocap keeps: its timing within each part, its arms, back, head and hips'
turns, the way its weight goes. What is posed again, every frame:

  - Her standing pose is the base (README, "The animation standard"). Every foot on the ground is where the library's
    idle has it (her left ahead, her right 0.3 m behind and turned out), and the clip begins (MJ_Up) or ends (MJ_Land)
    in the idle's first frame: no foot moves on the ground, from the moment she is pressed to jump until she stands
    again. A foot that rises onto its toes turns about the ball of its foot, which stays put. Her legs are laid on that
    by two-bone IK, each knee facing the way she faces and a little the way its foot points (as magic-jump.js lays them).
  - MJ_Up is quick. The mocap crouches for half a second before its feet leave the ground; here the crouch is UP_DEPTH
    as deep and over in UP_DOWN s, the push in UP_PUSH s, so she is off the ground UP_DOWN + UP_PUSH s after the press
    (her hips leave as fast as the game's first jump does: printed). From then on the clip is in place: the game moves
    her up (magic-jump.js), so her hips stay where they were as she left the ground and only her body moves about them,
    up to the top of the first jump (UP_AIR s, the game's own time to the top). Off the ground her legs are the mocap's.
  - MJ_Land begins as her feet touch (the mocap's LAND_TOUCH s): down into its crouch (its hips to two thirds of
    their height, its back leaning in) and up again; the mocap ends standing, and then in LAND_SETTLE s she is in her
    standing pose. It stands turned LAND_TURN degrees too far to its right and leans out to its right as it crouches:
    turned to face ahead and stood upright from behind (UP_UPRIGHT), and its arms, out level as it lands, lowered
    (LAND_ARMS). (Made before from Jumping Down: a deep crouch with both hands on the ground, then only its crouch;
    then from Jumping Down 3: no crouch at all. The user chose this one for every landing.)
  - MJ_Wall begins as its hands are about to leave the rock (WALL_FROM) and is played WALL_RATE times as fast. It is in
    place: the game kicks her away from the rock and up (magic-jump.js), and turns her round, the way she faces going
    from the rock to away from it as wall_turn() goes (the same curve as magic-jump.js' WALL_TURN): here her hips are
    turned back by as much, so her body goes round as the mocap's does. Her hips stay as high over her feet as they are
    climbing (the library's Climb_Loop). Its arms, flung out level as it turns, are lowered (UP_ARMS) and its knees
    brought in (UP_KNEES).

Lengths and turns are the library's (T-pose, +Z forward, her left +X, up +Y), on the playable characters' proportions
(tools/vrma_pose.py: fitted_skeleton). The game merges the baked clips into every character's (index.html). Usage (from
the repo folder; needs numpy):

  npm install --no-save three@0.170.0                (once)
  node tools/mixamo-to-vrma.mjs assets/animations/mixamo Jumping_Up.fbx Falling_To_Landing.fbx Jump_From_Wall.fbx
  python3 tools/make-magic-jump-mocap.py
  python3 tools/bake-character-anim.py assets/animations/mixamo magic-jump-mocap-anim.js mj_up:MJ_Up mj_land:MJ_Land mj_wall:MJ_Wall
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vrma_pose import (LIB, REPO, Skeleton, fitted_skeleton, mat_of, quat_of, read_floats, ry, rz, slerp_m,  # noqa: E402
                       two_bone, unit, write_vrma)

MOCAP = os.path.join(REPO, "assets", "animations", "mixamo")
FPS = 60

UP_DEPTH = 0.6           # of the mocap's crouch (its hips go down 0.39 of their height)
UP_DOWN = 0.07           # s down into it
UP_PUSH = 0.085          # s pushing up out of it, to her toes leaving the ground
UP_LEAVE = 6.9           # how fast her hips leave the ground (hips heights of the library's a second: the game's first jump's 7.0 m/s)
UP_TOES = 0.02           # how much higher than as she stands her hips are as her toes leave the ground
UP_ARMS = 40.0           # degrees its arms are lowered in the air (it flings them out level: never both out to her sides)
UP_KNEES = 0.5           # of its thighs' spread out to her sides taken away in the air (her knees point the way she faces)
UP_UPRIGHT = 0.85        # of its lean out to her side taken away (from behind she goes straight up, not tipped over)
UP_TURN = 45.0           # degrees the mocap is turned to her left: it stands turned 43 degrees to its right (its head looking ahead)
UP_AIR = 0.3             # s from leaving the ground to the top of the first jump (the game's: magic-jump.js)
UP_SRC = (0.04, 0.335, 0.51, 0.8333)     # the mocap's own times: beginning to go down, the bottom, toes off, its end
LAND_TOUCH = 0.28        # the mocap's time when its feet are on the ground (Falling To Landing: 1.07 s in all)
LAND_TURN = 30.0         # degrees it is turned to her left (it lands turned 12 to 43 degrees to its right)
LAND_ARMS = 40.0         # degrees its arms, out level as it lands, are lowered
LAND_SETTLE = 0.15       # s from the mocap's end into her standing pose
WALL_FROM = 0.35         # the mocap's time to begin at: its hands are about to leave the rock (Jump From Wall: 1.27 s)
WALL_RATE = 1.6          # how much faster than the mocap it is played (the game's pull is harder than the world's)
WALL_TURN = (0.42, 1.27)  # the mocap's times her turn round (180 degrees, to her right) begins and ends (wall_turn)

sk, HH, _ = fitted_skeleton()
ORDER = []


def _visit(b):
    if b in ORDER:
        return
    if sk.parent.get(b):
        _visit(sk.parent[b])
    ORDER.append(b)


for _b in sk.node:
    _visit(_b)
LEG_BONES = [f"{s}{b}" for s in ("left", "right") for b in ("UpperLeg", "LowerLeg", "Foot", "Toes")]


# ---------------------------------------------------------------- clips

class Clip:
    def __init__(self, path):
        s = Skeleton(path)
        anim = s.js["animations"][0]
        self.rot, self.hips, self.times = {}, None, None
        for ch in anim["channels"]:
            smp = anim["samplers"][ch["sampler"]]
            b = s.bone.get(ch["target"]["node"])
            if self.times is None:
                self.times = np.array(read_floats(s.js, s.bin, smp["input"])[:, 0], dtype=float)
            v = np.array(read_floats(s.js, s.bin, smp["output"]), dtype=float)
            if ch["target"]["path"] == "rotation":
                self.rot[b] = v
            elif b == "hips":
                self.hips = v
        n = len(self.times)
        for b in sk.node:
            self.rot.setdefault(b, np.tile([0.0, 0.0, 0.0, 1.0], (n, 1)))

    def at(self, t):
        """{bone: local turn (3x3)}, hips' place, at time t (between frames: the shorter way)."""
        t = min(max(t, self.times[0]), self.times[-1])
        i = int(np.searchsorted(self.times, t, side="right")) - 1
        i = min(max(i, 0), len(self.times) - 2)
        u = (t - self.times[i]) / (self.times[i + 1] - self.times[i])
        L = {b: slerp_m(mat_of(v[i]), mat_of(v[i + 1]), u) for b, v in self.rot.items()}
        return L, self.hips[i] * (1 - u) + self.hips[i + 1] * u


def fk(L, hips):
    R, P = {}, {}
    for b in ORDER:
        p = sk.parent.get(b)
        if p is None:
            R[b], P[b] = L[b], np.array(hips, dtype=float)
        else:
            R[b] = R[p] @ L[b]
            P[b] = P[p] + R[p] @ sk.offset[b]
    return R, P


def locals_from(R):
    return {b: (R[sk.parent[b]].T @ R[b]) if sk.parent.get(b) else R[b] for b in R}


def ease(u):
    u = min(1.0, max(0.0, u))
    return u * u * u * (u * (6 * u - 15) + 10)


def hermite_curve(xs, ys, ms):
    """A smooth curve through the points, going at the given rates there."""
    xs, ys, ms = (np.array(v, float) for v in (xs, ys, ms))

    def f(x):
        k = int(min(max(np.searchsorted(xs, x, side="right") - 1, 0), len(xs) - 2))
        h = xs[k + 1] - xs[k]
        s = (x - xs[k]) / h
        return ((2 * s ** 3 - 3 * s ** 2 + 1) * ys[k] + (s ** 3 - 2 * s ** 2 + s) * h * ms[k]
                + (-2 * s ** 3 + 3 * s ** 2) * ys[k + 1] + (s ** 3 - s ** 2) * h * ms[k + 1])
    return f


# ---------------------------------------------------------------- her standing pose, and laying a leg or an arm

IDLE = Clip(os.path.join(LIB, "Idle_Loop.vrma"))
IDLE_L, IDLE_HIPS = IDLE.at(0.0)
IDLE_R, IDLE_P = fk(IDLE_L, IDLE_HIPS)
X = np.array([1.0, 0.0, 0.0])


def frame(d, n):
    n = unit(n - d * np.dot(n, d))
    return np.column_stack([d, n, np.cross(d, n)])


def hinge(bone, child, d, axis):
    """The world turn of a thigh or a shin: pointing along d, its knee bending about axis (in T-pose: along its own
    length, bending about X)."""
    return frame(d, axis) @ frame(unit(sk.offset[child]), X).T


def lay_leg(R, P, side, foot_R, toe_at, pole):
    """Her leg laid so that the ball of her foot is at toe_at and her foot turned foot_R, her knee bent toward pole.
    R, P are changed (her leg's bones). -> how far the ankle is short of where it should be (0: reached)."""
    ul, ll, ft, to = (f"{side}{b}" for b in ("UpperLeg", "LowerLeg", "Foot", "Toes"))
    ankle = toe_at - foot_R @ sk.offset[to]
    a, b = np.linalg.norm(sk.offset[ll]), np.linalg.norm(sk.offset[ft])
    hip = P[ul]
    knee, axis = two_bone(hip, ankle, a, b, pole)
    R[ul] = hinge(ul, ll, unit(knee - hip), axis)
    P[ll] = hip + R[ul] @ sk.offset[ll]
    shin_to = ankle if np.linalg.norm(ankle - hip) < a + b else P[ll] + unit(ankle - hip) * b
    R[ll] = hinge(ll, ft, unit(shin_to - P[ll]), axis)
    P[ft] = P[ll] + R[ll] @ sk.offset[ft]
    R[ft] = foot_R
    P[to] = P[ft] + R[ft] @ sk.offset[to]
    R[to] = R[ft] @ (IDLE_R[ft].T @ IDLE_R[to])           # her toes as they lie when she stands
    return float(np.linalg.norm(P[ft] - ankle))


def knee_pole(R, side, foot_R):
    """Ahead of her (her hips' ahead), and a little the way her foot points (magic-jump.js' kneeAhead)."""
    ahead = R["hips"] @ np.array([0.0, 0.25, 1.0])
    toes = foot_R @ IDLE_R[f"{side}Foot"].T @ (IDLE_P[f"{side}Toes"] - IDLE_P[f"{side}Foot"])
    toes[1] = 0
    return unit(ahead) + 0.5 * unit(toes)


def shortest(a, b):
    axis = np.cross(a, b)
    s, c = float(np.linalg.norm(axis)), float(np.dot(a, b))
    if s < 1e-9:
        return np.eye(3)
    x, y, z = axis / s
    k = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
    return np.eye(3) + s * k + (1 - c) * (k @ k)


def pitch_of(Rf, side):
    """How far a foot is tipped up onto its toes (radians; 0: flat as she stands)."""
    d = Rf @ IDLE_R[f"{side}Foot"].T @ (IDLE_P[f"{side}Toes"] - IDLE_P[f"{side}Foot"])
    d0 = IDLE_P[f"{side}Toes"] - IDLE_P[f"{side}Foot"]
    return math.atan2(-d[1], math.hypot(d[0], d[2])) - math.atan2(-d0[1], math.hypot(d0[0], d0[2]))


def tipped(side, angle):
    """Her standing foot tipped up onto its ball by angle (about its own side-to-side line)."""
    Rf = IDLE_R[f"{side}Foot"]
    toes = IDLE_P[f"{side}Toes"] - IDLE_P[f"{side}Foot"]
    across = unit(np.cross(np.array([0.0, 1.0, 0.0]), toes))      # (her foot's left, flat)
    c, s = math.cos(angle), math.sin(angle)
    x, y, z = across
    k = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
    turn = np.eye(3) + s * k + (1 - c) * (k @ k)
    return turn @ Rf


def stand_still_feet(R, P, tip=(0.0, 0.0)):
    """Both feet on the ground where she stands (tip: each tipped up onto its toes, radians)."""
    short = 0.0
    for side, a in zip(("left", "right"), tip):
        Rf = tipped(side, max(0.0, a))
        short = max(short, lay_leg(R, P, side, Rf, IDLE_P[f"{side}Toes"], knee_pole(R, side, Rf)))
    return short


def in_the_air(L, hp, w):
    """MJ_Up off the ground, posed again (w of the way): its arms, flung out level, lowered (less the higher they are
    already, none once above her shoulders by 50 degrees, never below 45 degrees down), and its knees brought in toward
    the way she faces (each thigh turned the shortest way; her shins and feet go with it)."""
    if w <= 1e-4:
        return L
    R, P = fk(L, hp)
    up = np.array([0.0, 1.0, 0.0])
    side = R["hips"] @ np.array([1.0, 0.0, 0.0])
    for s_ in ("left", "right"):
        ua, la = f"{s_}UpperArm", f"{s_}LowerArm"
        d = unit(R[ua] @ sk.offset[la])
        elev = math.degrees(math.asin(max(-1.0, min(1.0, float(d[1])))))
        drop = min(UP_ARMS, max(0.0, elev + 45.0)) * (1 - ease((elev - 20.0) / 30.0)) * w
        axis = np.cross(d, up)
        if np.linalg.norm(axis) > 1e-6 and drop > 0:
            x, y, z = unit(axis)
            k = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
            a = -math.radians(drop)
            turn = np.eye(3) + math.sin(a) * k + (1 - math.cos(a)) * (k @ k)
            for b in sk.node:                                 # the arm and all below it, turned about the shoulder
                bb = b
                while bb is not None and bb != ua:
                    bb = sk.parent.get(bb)
                if bb == ua:
                    R[b] = turn @ R[b]
        ul, ll = f"{s_}UpperLeg", f"{s_}LowerLeg"
        d = unit(R[ul] @ sk.offset[ll])
        d2 = unit(d - UP_KNEES * w * float(np.dot(d, side)) * side)
        turn = shortest(d, d2)
        for b in (ul, ll, f"{s_}Foot", f"{s_}Toes"):
            R[b] = turn @ R[b]
    return locals_from(R)


def write(name, frames, fps):
    times = np.arange(len(frames)) / fps
    rot = {b: [] for b in sk.node}
    hips = []
    for L, h in frames:
        for b in sk.node:
            q = quat_of(L[b])
            if rot[b] and np.dot(rot[b][-1], q) < 0:
                q = -q
            rot[b].append(q)
        hips.append(h)
    rot = {b: np.array(v) for b, v in rot.items()}
    out = os.path.join(MOCAP, f"{name}.vrma")
    write_vrma(out, sk, times, rot, np.array(hips), name, "liora-farm tools/make-magic-jump-mocap.py")
    return out, times


# ---------------------------------------------------------------- MJ_Up

def make_up():
    src = Clip(os.path.join(MOCAP, "Jumping_Up.vrma"))
    s0, s_bot, s_off, s_end = UP_SRC
    t_off = UP_DOWN + UP_PUSH
    # how fast the mocap is played at each moment: down quickly, the push a little slower, the rise in the air at about
    # its own pace (its rise is the game's now; only her body moves)
    warp = hermite_curve([0, UP_DOWN, t_off, t_off + UP_AIR], [s0, s_bot, s_off, s_end], [3.0, 2.6, 2.0, 0.45])
    L0, h0 = src.at(0.0)
    scale = IDLE_HIPS[1] / h0[1]                              # the mocap's lengths -> hers (its standing hips: hers)
    turn = ry(math.radians(UP_TURN))
    _, hb = src.at(s_bot)
    bottom = (hb[1] - h0[1]) * scale * UP_DEPTH
    # her hips' height on the ground: the mocap's down into the crouch (UP_DEPTH as deep), then up out of it faster and
    # faster, leaving the ground as fast as the game then lifts her
    rise = hermite_curve([UP_DOWN, t_off], [bottom, UP_TOES], [0.0, UP_LEAVE])
    R0, _ = fk(dict(L0, hips=turn @ L0["hips"]), h0)
    tip0 = [pitch_of(R0[f"{s}Foot"], s) for s in ("left", "right")]
    frames, hips_y, short = [], [], 0.0
    legs_off = hips_off = None
    n = int(round((t_off + UP_AIR) * FPS)) + 1
    for i in range(n):
        tau = i / FPS
        L, h = src.at(warp(tau))
        # turned to face as she does (its head kept looking ahead: its chest and neck turned back half each)
        L["hips"] = turn @ L["hips"]
        rel = turn @ ((h - h0) * scale)
        for bone in ("chest", "neck"):
            R, _ = fk(L, h)
            Rp = R[sk.parent[bone]]
            L[bone] = Rp.T @ ry(math.radians(-UP_TURN / 2)) @ Rp @ L[bone]
        # upright from behind: her hips' tilt to a side (in the air) and her back's lean out to a side taken away
        hu = L["hips"] @ np.array([0.0, 1.0, 0.0])
        L["hips"] = rz(-math.asin(-hu[0]) * UP_UPRIGHT * 0.7) @ L["hips"]
        R, _ = fk(L, h)
        up = R["upperChest"] @ np.array([0.0, 1.0, 0.0])
        Rp = R["hips"]
        L["spine"] = Rp.T @ rz(-math.asin(-up[0]) * UP_UPRIGHT) @ Rp @ L["spine"]
        if tau <= t_off + 1e-6:
            # on the ground: her hips from where she stands (the mocap's sway UP_DEPTH as far); her hips' turn and all
            # of her above them the mocap's; her legs laid on her feet, which rise onto their toes as its do
            rel[0] *= UP_DEPTH
            rel[2] *= UP_DEPTH
            rel[1] = rel[1] * UP_DEPTH if tau <= UP_DOWN else rise(tau)
            hp = IDLE_HIPS + rel
            R, P = fk(L, hp)
            tip = [pitch_of(R[f"{s}Foot"], s) - t for s, t in zip(("left", "right"), tip0)]
            gone = stand_still_feet(R, P, tip)
            if tau < t_off - 0.02:
                short = max(short, gone)
            Lnew = locals_from(R)
            legs_off, hips_off = {b: Lnew[b] for b in LEG_BONES}, hp
        else:
            # off the ground: in place (the game lifts her), her legs going over to the mocap's in a few frames
            w = ease((tau - t_off) / 0.06)
            hp = hips_off
            Lnew = in_the_air(dict(L), hp, ease((tau - t_off) / 0.12))
            for b in LEG_BONES:
                Lnew[b] = slerp_m(legs_off[b], Lnew[b], w)
        frames.append((Lnew, hp))
        hips_y.append(hp[1])
    v_off = (rise(t_off) - rise(t_off - 1e-4)) / 1e-4
    out, times = write("MJ_Up", frames, FPS)
    print(f"{out}: {times[-1]:.3f} s, off the ground at {t_off:.3f} s; her hips leave at {v_off:.2f} hips-units/s "
          f"(wanted {UP_LEAVE}); lowest {min(hips_y):.3f} "
          f"(standing {IDLE_HIPS[1]:.3f}); feet short of the ground by {short * 1000:.0f} mm at most")
    return frames


# ---------------------------------------------------------------- MJ_Land

def turned_ahead(L, h, turn):
    """The mocap turned `turn` degrees to her left (its hips), its chest and neck turned back half each (its head keeps
    looking where it looked), and stood upright from behind (its lean out to a side taken away, UP_UPRIGHT)."""
    L = dict(L)
    L["hips"] = ry(math.radians(turn)) @ L["hips"]
    for bone in ("chest", "neck"):
        R, _ = fk(L, h)
        Rp = R[sk.parent[bone]]
        L[bone] = Rp.T @ ry(math.radians(-turn / 2)) @ Rp @ L[bone]
    R, _ = fk(L, h)
    up = R["upperChest"] @ np.array([0.0, 1.0, 0.0])
    Rp = R["hips"]
    L["spine"] = Rp.T @ rz(-math.asin(-up[0]) * UP_UPRIGHT) @ Rp @ L["spine"]
    return L


def lower_arms(L, hp, degrees, w):
    """Its arms lowered (less the higher they already are: in_the_air's), w of the way."""
    keep = globals()["UP_ARMS"], globals()["UP_KNEES"]
    globals()["UP_ARMS"], globals()["UP_KNEES"] = degrees, 0.0
    try:
        return in_the_air(L, hp, w)
    finally:
        globals()["UP_ARMS"], globals()["UP_KNEES"] = keep


def make_land():
    src = Clip(os.path.join(MOCAP, "Falling_To_Landing.vrma"))
    up = Clip(os.path.join(MOCAP, "Jumping_Up.vrma"))
    Lst, hst = up.at(0.0)
    Rst, _ = fk(dict(Lst, hips=ry(math.radians(UP_TURN)) @ Lst["hips"]), hst)
    flat0 = [pitch_of(Rst[f"{s}Foot"], s) for s in ("left", "right")]   # the mocap's feet, flat
    scale = IDLE_HIPS[1] / hst[1]
    s_end = float(src.times[-1])
    _, h_end = src.at(s_end)
    n_src = int(round((s_end - LAND_TOUCH) * FPS))
    n = n_src + int(round(LAND_SETTLE * FPS)) + 1
    frames, hips_y, short = [], [], 0.0
    last = None
    for i in range(n):
        tau = i / FPS
        if i <= n_src:
            s = LAND_TOUCH + tau
            L, h = src.at(s)
            L = turned_ahead(L, h, LAND_TURN)
            # her hips from where she stands, as the mocap's go from where they end (it ends standing)
            rel = ry(math.radians(LAND_TURN)) @ ((h - h_end) * scale)
            rel[[0, 2]] *= 0.5
            hp = IDLE_HIPS + rel
            L = lower_arms(L, hp, LAND_ARMS, 1.0)
            R, _ = fk(L, hp)
            tip = [max(0.0, pitch_of(R[f"{s_}Foot"], s_) - f) for s_, f in zip(("left", "right"), flat0)]
            last = (L, hp, tip)
        else:
            u = ease((tau - (s_end - LAND_TOUCH)) / LAND_SETTLE)
            Le, he, te = last
            L = {b: slerp_m(Le[b], IDLE_L[b], u) for b in sk.node}
            hp = he + (IDLE_HIPS - he) * u
            tip = [t * (1 - u) for t in te]
        R, P = fk(L, hp)
        short = max(short, stand_still_feet(R, P, tip))
        frames.append((locals_from(R), hp))
        hips_y.append(hp[1])
    out, times = write("MJ_Land", frames, FPS)
    print(f"{out}: {times[-1]:.3f} s; hips from {hips_y[0]:.3f} to {hips_y[-1]:.3f} (standing {IDLE_HIPS[1]:.3f}), lowest "
          f"{min(hips_y):.3f}; feet short of the ground by {short * 1000:.0f} mm at most")
    return frames


def wall_turn(c):
    """How far round she has turned (0..1 of 180 degrees, to her right) at the mocap's time c (magic-jump.js: WALL_TURN)."""
    a, b = WALL_TURN
    u = min(1.0, max(0.0, (c - a) / (b - a)))
    return u * u * (3 - 2 * u)


def make_wall():
    src = Clip(os.path.join(MOCAP, "Jump_From_Wall.vrma"))
    climb = Clip(os.path.join(LIB, "Climb_Loop.vrma"))
    hy = float(np.mean(climb.hips[:, 1]))                    # her hips over her feet, climbing
    end = float(src.times[-1])
    n = int(round((end - WALL_FROM) / WALL_RATE * FPS)) + 1
    frames = []
    for i in range(n):
        c = min(end, WALL_FROM + i / FPS * WALL_RATE)
        L, h = src.at(c)
        # the way she faces is turned round by the game: her hips turned back by as much (her body goes round as the
        # mocap's, the whole of her turned with the way she faces)
        L = dict(L)
        L["hips"] = ry(math.radians(180.0 * wall_turn(c))) @ L["hips"]
        hp = np.array([0.0, hy, 0.0])
        L = in_the_air(L, hp, 1.0)
        frames.append((L, hp))
    out, times = write("MJ_Wall", frames, FPS)
    print(f"{out}: {times[-1]:.3f} s (the mocap's {WALL_FROM}..{end:.2f} s at x{WALL_RATE}); her turn round from "
          f"{(WALL_TURN[0] - WALL_FROM) / WALL_RATE:.3f} to {(WALL_TURN[1] - WALL_FROM) / WALL_RATE:.3f} s")
    return frames


if __name__ == "__main__":
    for f in ("Jumping_Up", "Falling_To_Landing", "Jump_From_Wall"):
        if not os.path.exists(os.path.join(MOCAP, f"{f}.vrma")):
            raise SystemExit(f"no {f}.vrma in {MOCAP}: make it first with tools/mixamo-to-vrma.mjs (see above)")
    make_up()
    make_land()
    make_wall()
