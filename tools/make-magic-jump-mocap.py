#!/usr/bin/env python3
"""Make the magic jump's take-off and landing from two Mixamo moves (mocap), posed again for her:

  MJ_Up   <- Mixamo "Jumping Up"    the first jump off the ground: a crouch, a push, her knees coming up under her
  MJ_Land <- Mixamo "Jumping Down"  the landing from high: down into a crouch and up again into her standing pose

Both are first made .vrma by tools/mixamo-to-vrma.mjs (the vault's too: three-vrm's Mixamo retarget onto the library's
skeleton), into assets/animations/mixamo/, which is not in the repo: Mixamo's moves are Adobe's, free to use in the
game, not to hand on as files. What the mocap keeps: its timing within each
part, its arms, back, head and hips' turns, the way its weight goes. What is posed again, every frame:

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
  - MJ_Land begins as her feet touch, and is only a crouch: her hips go down as the mocap's (LAND_IN times as fast:
    she comes down faster in the game) but LAND_DEPTH as deep, her back leaning in LAND_BEND as far as the mocap's,
    her arms as she stands (the mocap bends right over and puts both hands on the ground: not wanted, she runs on out
    of it). It holds the bottom LAND_HOLD times as fast as the mocap, then rises into her standing pose in LAND_RISE s.
    MJ_Land_Soft is the same less deep (SOFT_DEPTH, SOFT_BEND): for a lower fall, and for a landing she runs on out of
    (magic-jump.js). The game merges the baked clips into every character's (index.html).

Lengths and turns are the library's (T-pose, +Z forward, her left +X, up +Y), on the playable characters' proportions
(tools/vrma_pose.py: fitted_skeleton). Usage (from the repo folder; needs numpy):

  npm install --no-save three@0.170.0                (once)
  node tools/mixamo-to-vrma.mjs assets/animations/mixamo Jumping_Up.fbx Jumping_Down.fbx
  python3 tools/make-magic-jump-mocap.py
  python3 tools/bake-character-anim.py assets/animations/mixamo magic-jump-mocap-anim.js mj_up:MJ_Up mj_land:MJ_Land mj_land_soft:MJ_Land_Soft
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
LAND_SRC = (1.80, 2.03, 2.6667)          # the mocap's: a foot touching, the bottom, its end (still down)
LAND_IN = 1.2            # how much faster than the mocap she goes down
LAND_HOLD = 2.4          # how much faster than the mocap she stays down
LAND_RISE = 0.45         # s from the mocap's end up into her standing pose
LAND_DEPTH = 0.6         # of the mocap's crouch (its hips go down to half their height)
LAND_BEND = 0.3          # of how far over the mocap bends (its head goes down to its knees): she leans in a little
SOFT_DEPTH = 0.4
SOFT_BEND = 0.2

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
ARM_BONES = [b for b in sk.node if any(k in b for k in ("Shoulder", "UpperArm", "LowerArm", "Hand", "Thumb", "Index",
                                                         "Middle", "Ring", "Little"))]
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


def pchip(xs, ys):
    """A smooth, never-turning-back curve through the points (Fritsch-Carlson)."""
    xs, ys = np.array(xs, float), np.array(ys, float)
    h, d = np.diff(xs), np.diff(ys) / np.diff(xs)
    m = np.zeros(len(xs))
    m[0], m[-1] = d[0], d[-1]
    for k in range(1, len(xs) - 1):
        m[k] = 0 if d[k - 1] * d[k] <= 0 else (h[k - 1] + 2 * h[k] + 2 * h[k - 1] + h[k]) / ((2 * h[k] + h[k - 1]) / d[k - 1] + (h[k] + 2 * h[k - 1]) / d[k])

    def f(x):
        k = int(min(max(np.searchsorted(xs, x, side="right") - 1, 0), len(xs) - 2))
        s = (x - xs[k]) / h[k]
        return ((2 * s ** 3 - 3 * s ** 2 + 1) * ys[k] + (s ** 3 - 2 * s ** 2 + s) * h[k] * m[k]
                + (-2 * s ** 3 + 3 * s ** 2) * ys[k + 1] + (s ** 3 - s ** 2) * h[k] * m[k + 1])
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

def make_land(name, depth, bend):
    src = Clip(os.path.join(MOCAP, "Jumping_Down.vrma"))
    up = Clip(os.path.join(MOCAP, "Jumping_Up.vrma"))
    Lst, hst = up.at(0.0)
    Rst, _ = fk(Lst, hst)
    flat0 = [pitch_of(Rst[f"{s}Foot"], s) for s in ("left", "right")]   # the mocap's feet, flat
    scale = IDLE_HIPS[1] / hst[1]
    s_td, s_bot, s_end = LAND_SRC
    t_bot = (s_bot - s_td) / LAND_IN
    t_end = t_bot + (s_end - s_bot) / LAND_HOLD
    warp = pchip([0, t_bot, t_end], [s_td, s_bot, s_end])
    n_src = int(round(t_end * FPS))
    n = n_src + int(round(LAND_RISE * FPS)) + 1
    # the hips over the feet: the mocap's hips from the middle of its feet (its feet slide on after landing; hers don't)
    idle_mid = (IDLE_P["leftToes"] + IDLE_P["rightToes"]) / 2

    def body_at(s):
        L, h = src.at(s)
        R, P = fk(L, h)
        mid = (P["leftToes"] + P["rightToes"]) / 2
        rel = (h - mid) * scale
        y = IDLE_HIPS[1] + (h[1] * scale - IDLE_HIPS[1]) * depth
        hp = np.array([idle_mid[0] + rel[0], y, idle_mid[2] + rel[2]])
        # her hips not as low as the mocap's (depth) and a little more over her feet; her back and head not bent as far
        # over (bend: the rest of the way the idle's)
        hp[[0, 2]] = IDLE_HIPS[[0, 2]] + (hp[[0, 2]] - IDLE_HIPS[[0, 2]]) * depth
        for b in ("hips", "spine", "chest", "upperChest", "neck", "head"):
            L[b] = slerp_m(IDLE_L[b], L[b], bend)
        # her arms: as she stands (only her legs and hips are the mocap's: she just crouches)
        for b in ARM_BONES:
            L[b] = IDLE_L[b]
        tip = [max(0.0, pitch_of(R[f"{s}Foot"], s) - f) for s, f in zip(("left", "right"), flat0)]
        return L, hp, tip

    frames, hips_y, short, low_hand = [], [], 0.0, 9.0
    Lend, hend, tip_end = body_at(s_end)
    for i in range(n):
        tau = i / FPS
        if i <= n_src:
            L, hp, tip = body_at(warp(tau))
        else:
            u = (tau - t_end) / LAND_RISE
            uh, us, ua = ease((u - 0.05) / 0.95), ease(u / 0.8), ease(u / 0.8)
            L = {}
            for b in sk.node:
                k = ua if b in ARM_BONES else us if b in ("spine", "chest", "upperChest", "neck", "head") else uh
                L[b] = slerp_m(Lend[b], IDLE_L[b], k)
            hp = hend + (IDLE_HIPS - hend) * uh
            tip = [t * (1 - uh) for t in tip_end]
        R, P = fk(L, hp)
        short = max(short, stand_still_feet(R, P, tip))
        low_hand = min(low_hand, P["leftHand"][1], P["rightHand"][1])
        frames.append((locals_from(R), hp))
        hips_y.append(hp[1])
    out, times = write(name, frames, FPS)
    print(f"{out}: {times[-1]:.3f} s (down {t_bot:.2f} s, up from {t_end:.2f} s); lowest hips {min(hips_y):.3f} "
          f"(standing {IDLE_HIPS[1]:.3f}); lowest wrist {low_hand:.2f} over the ground; feet short of the ground by "
          f"{short * 1000:.0f} mm at most")
    return frames


if __name__ == "__main__":
    for f in ("Jumping_Up", "Jumping_Down"):
        if not os.path.exists(os.path.join(MOCAP, f"{f}.vrma")):
            raise SystemExit(f"no {f}.vrma in {MOCAP}: make it first with tools/mixamo-to-vrma.mjs (see above)")
    make_up()
    make_land("MJ_Land", LAND_DEPTH, LAND_BEND)
    make_land("MJ_Land_Soft", SOFT_DEPTH, SOFT_BEND)
