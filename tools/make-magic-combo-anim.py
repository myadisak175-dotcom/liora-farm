#!/usr/bin/env python3
"""Make the moves of her magic combo (magic-combo.js; tried on magic-combo.html) into magic-combo-anim.js: four casts
that chain one into the next, and the cast she rises with out of a roll. Each is a move somebody else made, posed again
for her and cut to the pace of a fight:

  mc_1     <- Mixamo "Standing 1H Magic Attack 02"   a swipe of her right hand across her, right to left: a quick opener
  mc_2     <- the library's Sword_Regular_B          the swipe back, left to right: coiled low, her arm flung out wide
  mc_3     <- the library's Sword_Regular_C          a step in, a whole turn round on her right foot, and a cut down out
                                                     of it into a low lunge; she goes forward as she turns (its path)
  mc_4     <- Mixamo "Standing 2H Magic Attack 05"   the finisher: down low gathering, up, and both hands thrust out;
              then "Standing Block End"              her hands lowered
  mc_rise  <- Mixamo "Standing 1H Magic Attack 03"   out of the crouch a roll ends in: her right hand swept up from the ground
  (the roll itself is the game's own clip, the library's Roll, played faster: here only how far it takes her)
  mc_charge_in, mc_charge, mc_throw  <- Kevin Iglesias' "ThrowSpear01_R" (feminine) and its "Hold"   the held cast:
                                                     out of the swipe she turns side on, her right arm cocked back
                                                     high, her left pointing at what she throws at; held there (the
                                                     pack's own hold, a loop); let go, the throw. Both feet stay on the
                                                     ground ("ไม่เอายกขา"): the throw's step through is left out, her
                                                     back foot turning on its toes and drawn on after her. (Made first
                                                     from the library's OverhandThrow, then from Mixamo's Baseball
                                                     Pitching: its wind-up was not pretty.)
  mc_plunge, mc_slam  <- the library's Sword_Heavy_Combo (its third strike, a leap and a blow down)   the cast in the
                                                     air: her hand up over her head as she drops (her legs the library's
                                                     jump's), and the blow down as she lands, up into her standing pose
  mc_air_l, mc_air_r  <- no capture: made here      casting in the air, as Devil May Cry's gunfire in the air: the library's
                                                     jump's body; one hand thrust out at what she casts at, its palm to
                                                     it, as the other is drawn back to her side, her shoulders turning
                                                     with it, and the cast throwing the hand up; each begins as the
                                                     other ends
  mc_rain_in, mc_rain, mc_rain_out  <- no capture   the rain: over forward till her head is down, her arms out past it at
                                                     the ground, casting from each in turn (a loop; the page spins her),
                                                     and on over, upright again
  mc_dash  <- the library's Sword_Heavy_Combo (its second strike)   the running cast: a leap off her run, turning once
                                                     round in the air, down into a low cut; she goes forward (its path)

The library's moves are Quaternius' (CC0), in the repo. Mixamo's and Kevin Iglesias' are first made .vrma by
tools/mixamo-to-vrma.mjs into assets/animations/mixamo/, which is not in the repo (Adobe's; Kevin Iglesias' under the
Asset Store's standard licence: to use in a game, not to hand on as files): only what this tool makes of them is. (Tried for mc_2 and left out: RapaMotion's "Fire Volley" left-hand throw. From behind her, where
the game's camera is, her own body hides the arm that throws.)

What is kept of each move: its arms, back, head, the turn and sway of its hips, the timing within each part. What is
made again:

  - Her standing pose is the base (README, "The animation standard"): mc_1 begins in the idle's first frame, every move
    ends in it, and a move that follows another begins in the pose the one before has at the moment it may be cut short
    (its `cancel`), so pressed in time the four are one move with no pose jumped to.
  - Feet. A move made standing on the spot (Mixamo's; and mc_2, whose own legs are crossed for a sword) is laid on her
    own feet: the balls of her feet stay where they are on the ground (they turn as the mocap's do, on the spot), her
    hips sway about the middle of her stance as the mocap's do about its own, and her legs are laid on them by two-bone
    IK. Between two poses with feet in different places a foot steps: lifted a little on its way, never slid along the
    ground.
  - Pace. Each part is played faster than it was made (the warp of each move, below): a cast leaves her hand 0.15 to
    0.5 s after the button, and the next may begin 0.08 to 0.1 s later.
  - Her head stays on what she casts at (the mocap looks where its hand goes, or at the ground); her hands are open as
    she casts (the library's hold a sword).

Besides the clips, MAGIC_COMBO says when each cast leaves her hand (`hit`), when the next move may begin (`cancel`; for
a move with none after it, `again`: when the first may begin again, her feet nearly back where she stands), how long it
is (`dur`), which hand (`hand`), and, for a move that takes her over the ground, her way (`path`: x to her left and z
ahead, hips heights, per frame). Times are seconds at the pace the clip is made. Usage (from the repo folder; needs
numpy):

  npm install --no-save three@0.170.0                (once)
  node tools/mixamo-to-vrma.mjs assets/animations/mixamo Standing_1H_Magic_Attack_02.fbx Standing_1H_Magic_Attack_03.fbx \\
       Standing_2H_Magic_Attack_05.fbx Standing_Block_End.fbx \\
       "HumanF@ThrowSpear01_R.fbx" "HumanF@ThrowSpear01_R - Hold.fbx"      (Kevin Iglesias' Human Throwing Animations FREE)
  python3 tools/make-magic-combo-anim.py
"""
import importlib.util
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from vrma_pose import LIB, REPO, quat_of, rx, ry, rz, slerp_m, unit  # noqa: E402


def _tool(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bake_mod = _tool("bake", "bake-character-anim.py")
mj = _tool("mocap", "make-magic-jump-mocap.py")        # reading a clip, her standing pose, laying a leg on a foot

FPS = 60
sk, HH = mj.sk, mj.HH
SIDES = ("left", "right")
FINGERS = [b for b in sk.node if any(f in b for f in ("Thumb", "Index", "Middle", "Ring", "Little"))]
ease = mj.ease

# ---- the pace of each move: (its own time s, the mocap's time) points its warp goes through; and its marks (s)
M1 = dict(src="Standing_1H_Magic_Attack_02", warp=[(0, 0.24), (0.20, 0.63), (0.32, 0.86), (0.75, 1.25)],
          enter=0.10, leave=(0.36, 0.72), hit=0.18, cancel=0.31)
M2 = dict(src="Sword_Regular_B", warp=[(0, 0.04), (0.11, 0.15), (0.20, 0.25), (0.27, 0.36), (0.70, 0.50)],
          enter=0.11, leave=(0.33, 0.70), hit=0.20, cancel=0.28)
M3 = dict(src="Sword_Regular_C", warp=[(0, 0.03), (0.10, 0.17), (0.44, 0.66), (0.50, 0.74), (0.62, 0.95), (0.98, 1.05)],
          enter=0.10, leave=(0.60, 0.98), hit=0.44, cancel=0.52)
M4 = dict(src="Standing_2H_Magic_Attack_05", warp=[(0, 0.74), (0.14, 0.98), (0.44, 2.00), (0.56, 2.32), (0.72, 2.50), (1.10, 2.56)],
          enter=0.14, leave=(0.74, 1.10), hit=0.50, again=1.00, lower=(0.70, 0.95), end="Standing_Block_End")
MR = dict(src="Standing_1H_Magic_Attack_03", warp=[(0, 0.58), (0.15, 0.88), (0.27, 1.10), (0.70, 1.40)],
          enter=0.07, leave=(0.32, 0.70), hit=0.15, again=0.40)
# the held cast: into the hold out of the swipe's cancel pose; the hold (a loop: the throw's own time back and forth, her
# hips up and down, m); the throw
# (the throw: cocked by 0.7 s, held to 0.9, the spear gone at 1.08, its step through down at 1.2, standing at 2.3)
MC_SRC, MC_HOLD_SRC = "HumanF@ThrowSpear01_R", "HumanF@ThrowSpear01_R - Hold"
MCI = dict(warp=[(0, 0.10), (0.12, 0.30), (0.30, 0.70)], enter=0.12, dur=0.30)
MCL = dict(period=2.0)                                  # the pack's hold, as it is (it breathes)
MCT = dict(warp=[(0, 0.90), (0.08, 1.03), (0.14, 1.12), (0.24, 1.30), (0.50, 1.62), (0.85, 1.95)], leave=(0.45, 0.85), hit=0.11, again=0.5)
MC_STANCE = {"left": (0.21, 0.37), "right": (-0.23, -0.29)}      # the balls of her feet (m): the capture's own stance
MC_FEET = {"left": -1.0, "right": -26.0}                # degrees they point as it has them
MC_SWAY = 0.45           # of the capture's hips' way forward through the throw (it steps through; she stays on her feet)
MC_HIGH = 0.74           # her hips at their highest through the throw (the capture springs up off its back foot into its step)
MC_DIP = 0.12            # and how much lower once they go forward over her front foot
MC_DRAG = dict(back=-0.16, turn=55.0, tip=0.8, front=25.0)       # her back foot through the throw: m back (drawn on after her), degrees turned, radians onto its toes; her front foot's turn
# the running cast: off the ground from `air`[0] to `air`[1] (her hips up to `high` m higher, half way), `far` hips heights forward
MD = dict(src="Sword_Heavy_Combo", warp=[(0, 1.05), (0.07, 1.14), (0.44, 1.76), (0.50, 1.81), (0.95, 1.82)],
          leave=(0.56, 0.95), hit=0.47, again=0.64, air=(0.06, 0.46), far=3.4, high=0.28)
# the cast in the air: her hand going up (held at its end while she drops), and the blow down as she lands
MPL = dict(warp=[(0, 2.36), (0.16, 2.50)], dur=0.16)
MSL = dict(warp=[(0, 2.50), (0.09, 2.70), (0.30, 2.95), (0.75, 3.05)], leave=(0.34, 0.75), hit=0.08, again=0.5)
M4_DEPTH = 0.75          # of the finisher's crouch (the mocap's hips go down to 0.45 of a metre)
M4_STANCE = {"left": (0.10, 0.30), "right": (-0.22, -0.40)}      # the balls of her feet for the finisher (m; wide, her left ahead)
M4_HIGH = 0.76           # her hips at their highest in the finisher (the mocap stands up straight; her stance is wider)
M4_LEAN = 10.0           # degrees she leans into the thrust
M2_RISE = 0.10           # m her hips are higher than the library's in the swipe back (it is down at 0.5 of a metre)
M2_UP = 12.0             # degrees she is stood up out of the library's bow forward in it (it dives after its sword)
M2_TURN = (110.0, -22.0)  # the library's hips' yaw as the swipe back begins and ends (her feet turn as it unwinds)
M2_FEET = {"left": -5.0, "right": -35.0}      # degrees her feet point as it ends
LOOK_DOWN = 12.0         # degrees down her head may look; and how far it is lifted at most
LOOK_UP_MOST = 35.0
LOOK = 25.0              # degrees aside her head may look from what she casts at
LOOK_MOST = 45.0         # degrees her head is turned back at most (her neck is no owl's)
ROLL = dict(rate=1.63, far=3.8, land=0.90, counter=0.95, free=1.15)   # the game's roll: how much faster it is played, how
#                         far she goes (hips heights), and the library's own times: her feet under her again, the rising
#                         cast may begin, she may walk on


# ---------------------------------------------------------------- poses

class Pose:
    """All of her at one moment: her bones' turns (L), her hips' place, and for a foot that is put somewhere (feet[side]:
    where the ball of it is, how it is turned, the way its knee bends or None). A foot not in feet is as her bones have it."""

    def __init__(self, L, hips, feet=None):
        self.L, self.hips, self.feet = L, np.array(hips, dtype=float), feet or {}


def yaw_of(v):
    return math.degrees(math.atan2(v[0], v[2]))


IDLE = Pose(mj.IDLE_L, mj.IDLE_HIPS)
IDLE_TOE = {s: mj.IDLE_P[f"{s}Toes"].copy() for s in SIDES}
IDLE_AIM = {s: mj.IDLE_P[f"{s}Toes"] - mj.IDLE_P[f"{s}Foot"] for s in SIDES}      # ankle to the ball of her foot, standing
IDLE_YAW = {s: yaw_of(IDLE_AIM[s]) for s in SIDES}
GROUND = float(np.mean([IDLE_TOE[s][1] for s in SIDES]))


def foot_turned(side, yaw, tip=0.0):
    """Her foot flat on the ground pointing yaw degrees (0 ahead, + to her left), tipped up onto its ball by tip radians."""
    return ry(math.radians(yaw - IDLE_YAW[side])) @ mj.tipped(side, max(0.0, tip))


def foot_yaw(side, Rf):
    return yaw_of(Rf @ mj.IDLE_R[f"{side}Foot"].T @ IDLE_AIM[side])


def feet_of(p):
    """Each foot of a pose: where the ball of it is, how it is turned, the way its knee bends."""
    R, P = mj.fk(p.L, p.hips)
    out = {}
    for s in SIDES:
        if s in p.feet:
            toe, Rf, pole = p.feet[s]
            if pole is None:
                pole = mj.knee_pole(R, s, Rf)
        else:
            toe, Rf = P[f"{s}Toes"], R[f"{s}Foot"]
            hip, knee, ankle = P[f"{s}UpperLeg"], P[f"{s}LowerLeg"], P[f"{s}Foot"]
            d = unit(ankle - hip)
            v = (knee - hip) - d * float(np.dot(knee - hip, d))
            pole = v if np.linalg.norm(v) > 0.02 else mj.knee_pole(R, s, Rf)
        out[s] = (np.array(toe, dtype=float), Rf, unit(pole))
    return out


def settle(p):
    """Her bones' turns with her legs laid on the feet that are put somewhere."""
    if not p.feet:
        return dict(p.L), p.hips
    R, P = mj.fk(p.L, p.hips)
    short = 0.0
    for s in SIDES:
        if s in p.feet:
            toe, Rf, pole = p.feet[s]
            short = max(short, mj.lay_leg(R, P, s, Rf, toe, pole if pole is not None else mj.knee_pole(R, s, Rf)))
    settle.short = max(settle.short, short)
    return mj.locals_from(R), p.hips


settle.short = 0.0


def blend(a, b, w):
    """From pose a to pose b, w of the way: her bones the shorter way round, each foot from where it is to where it will
    be, lifted on its way if that is a step."""
    if w <= 0:
        return a
    if w >= 1:
        return b
    L = {k: slerp_m(a.L[k], b.L[k], w) for k in a.L}
    fa, fb = feet_of(a), feet_of(b)
    feet = {}
    for s in SIDES:
        (ta, Ra, pa), (tb, Rb, pb) = fa[s], fb[s]
        toe = ta * (1 - w) + tb * w
        far = math.hypot(tb[0] - ta[0], tb[2] - ta[2])
        if far > 0.05:
            toe[1] += min(0.07, 0.3 * far) * math.sin(math.pi * w)
        feet[s] = (toe, slerp_m(Ra, Rb, w), unit(pa * (1 - w) + pb * w))
    return Pose(L, a.hips * (1 - w) + b.hips * w, feet)


def about(axis, a):
    x, y, z = unit(axis)
    k = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
    return np.eye(3) + math.sin(a) * k + (1 - math.cos(a)) * (k @ k)


def look_ahead(p, most=LOOK):
    """Her head kept on what she casts at: looking more than `most` degrees aside it is turned back, looking down at the
    ground it is lifted (her neck and her head, half each). Looking up at her own hand it is left alone."""
    L = dict(p.L)
    R, _ = mj.fk(L, p.hips)
    f = R["head"] @ np.array([0.0, 0.0, 1.0])
    if math.hypot(f[0], f[2]) > 0.35:
        yaw = yaw_of(f)
        over = min(LOOK_MOST, max(-LOOK_MOST, yaw - min(most, max(-most, yaw))))
        if abs(over) > 0.5:
            for bone in ("neck", "head"):
                R, _ = mj.fk(L, p.hips)
                Rp = R[sk.parent[bone]]
                L[bone] = Rp.T @ ry(math.radians(-over / 2)) @ Rp @ L[bone]
    R, _ = mj.fk(L, p.hips)
    f = R["head"] @ np.array([0.0, 0.0, 1.0])
    down = min(LOOK_UP_MOST, math.degrees(math.asin(max(-1.0, min(1.0, -float(f[1]))))) - LOOK_DOWN)
    if down > 0.5:
        for bone in ("neck", "head"):
            R, _ = mj.fk(L, p.hips)
            Rp = R[sk.parent[bone]]
            L[bone] = Rp.T @ about(R["head"] @ np.array([1.0, 0.0, 0.0]), math.radians(-down / 2)) @ Rp @ L[bone]
    return Pose(L, p.hips, p.feet)


def lean(p, degrees):
    """All of her tipped forward from her hips (about the line across them; her feet stay)."""
    if abs(degrees) < 0.01:
        return p
    L = dict(p.L)
    across = L["hips"] @ np.array([1.0, 0.0, 0.0])
    across[1] = 0.0
    L["hips"] = about(across, math.radians(degrees)) @ L["hips"]
    return Pose(L, p.hips, p.feet)


def open_hands(p, left, right):
    """Her fingers: 0 as they hang when she stands, 1 flat and spread (the hand a cast leaves)."""
    L = dict(p.L)
    for b in FINGERS:
        L[b] = slerp_m(mj.IDLE_L[b], np.eye(3), left if b.startswith("left") else right)
    return Pose(L, p.hips, p.feet)


def bump(t, a, b, c, d):
    """0 before a, 1 from b to c, 0 after d."""
    return ease((t - a) / (b - a)) * (1 - ease((t - c) / (d - c)))


def mono(points):
    """A curve through the points that never turns back (time through a mocap)."""
    xs, ys = (np.array(v, float) for v in zip(*points))
    h, d = np.diff(xs), np.diff(ys) / np.diff(xs)
    m = np.zeros(len(xs))
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, len(xs) - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    f = mj.hermite_curve(xs, ys, m)
    return lambda x: float(f(min(xs[-1], max(xs[0], x))))


# ---------------------------------------------------------------- the moves she is given

class Stance:
    """A move made standing on the spot, laid on her feet. base: the balls of her feet (default: as she stands); turn:
    degrees each foot is turned from the mocap's; height: her hips' height from the mocap's; feet: a function that
    puts her feet itself (side, the mocap's hips' yaw, the mocap's time) -> (ball, turn)."""

    def __init__(self, name, ref=0.0, base=None, turn=(0.0, 0.0), height=None, sway=1.0, feet=None, folder=mj.MOCAP):
        path = os.path.join(folder, f"{name}.vrma")
        if not os.path.exists(path):
            raise SystemExit(f"no {name}.vrma in {folder}: make it first with tools/mixamo-to-vrma.mjs (see above)")
        self.clip = mj.Clip(path)
        L, h = self.clip.at(ref)
        R, P = mj.fk(L, h)
        self.tip0 = {s: mj.pitch_of(R[f"{s}Foot"], s) for s in SIDES}
        self.centre0 = np.mean([P[f"{s}Toes"] for s in SIDES], axis=0)
        self.base = {s: np.array([base[s][0], GROUND, base[s][1]]) if base else np.array([IDLE_TOE[s][0], GROUND, IDLE_TOE[s][2]])
                     for s in SIDES}
        self.toe0 = {s: P[f"{s}Toes"].copy() for s in SIDES}
        self.centre = np.mean([self.base[s] for s in SIDES], axis=0)
        self.turn, self.height, self.sway, self.feet = turn, height or (lambda y: y), sway, feet

    def at(self, s):
        L, h = self.clip.at(s)
        R, P = mj.fk(L, h)
        feet = {}
        for i, side in enumerate(SIDES):
            if self.feet:
                toe, Rf = self.feet(side, yaw_of(R["hips"] @ np.array([0.0, 0.0, 1.0])), s)
            else:
                # the ball of her foot goes over the ground as the mocap's does from where it stood (it turns on the spot)
                d = P[f"{side}Toes"] - self.toe0[side]
                toe = self.base[side] + np.array([d[0], 0.0, d[2]])
                yaw = yaw_of(P[f"{side}Toes"] - P[f"{side}Foot"]) + self.turn[i]
                Rf = foot_turned(side, yaw, mj.pitch_of(R[f"{side}Foot"], side) - self.tip0[side])
            feet[side] = (toe, Rf, None)
        hips = np.array([self.centre[0] + (h[0] - self.centre0[0]) * self.sway, self.height(float(h[1])),
                         self.centre[2] + (h[2] - self.centre0[2]) * self.sway])
        return Pose(dict(L), hips, feet)


class Library:
    """One of the library's own moves (made on this skeleton: its legs are kept as they are). drift: how far to her left
    her root has gone at the clip's time s (taken out of her hips' place: her root goes there instead, see spin_root)."""

    def __init__(self, name, drift=None):
        self.clip = mj.Clip(os.path.join(LIB, f"{name}.vrma"))
        self.drift = drift or (lambda s: 0.0)

    def at(self, s):
        L, h = self.clip.at(s)
        h = np.array(h, dtype=float)
        h[0] -= self.drift(s)
        return Pose(dict(L), h)


def spin_root(clip):
    """Sword_Regular_C is made in place: the foot she turns on slides back under her, and her hips end a hand's width to
    her right. Where her root goes instead, at the clip's time s -> (x(s), z(s)): ahead as far as the foot that is down
    slides back (her right until 0.5 s, her left from 0.6 s as it comes down ahead of her), and to her right as her hips
    drift, so that the foot stays where it is on the ground and she ends standing over her root."""
    ts = np.arange(0.0, float(clip.times[-1]) + 1e-9, 1 / 120)
    zR, zL, hx = [], [], []
    for t in ts:
        L, h = clip.at(t)
        _, P = mj.fk(L, h)
        zR.append(P["rightToes"][2])
        zL.append(P["leftToes"][2])
        hx.append(h[0])
    z = np.zeros(len(ts))
    for i in range(1, len(ts)):
        t = ts[i]
        dz = (zR[i - 1] - zR[i]) if t <= 0.50 else (zL[i - 1] - zL[i]) if 0.60 < t <= 0.82 else 0.0
        z[i] = z[i - 1] + max(0.0, dz)
    x = np.array(hx) - hx[0]
    hold = int(0.85 * 120)
    x[hold:] = x[hold]
    k = np.ones(9) / 9                                         # (0.07 s: the foot's own little jumps taken out)
    pad = lambda v: np.convolve(np.concatenate([np.full(4, v[0]), v, np.full(4, v[-1])]), k, mode="valid")
    xs, zs = pad(x), pad(z)
    return (lambda s: float(np.interp(s, ts, xs))), (lambda s: float(np.interp(s, ts, zs)))


def roll_path():
    """The game's roll (the library's Roll, in place), played ROLL.rate times as fast: how far along her way she is, per
    frame. Off at once (her feet push her off in the first tenth of the clip), then slower and slower until her feet are
    under her again (ROLL.land): from then on she is where she is."""
    land = ROLL["land"] / ROLL["rate"]
    dur = float(mj.Clip(os.path.join(LIB, "Roll.vrma")).times[-1]) / ROLL["rate"]
    n = int(round(dur * FPS)) + 1
    fine = 8
    v = [ease((i / (FPS * fine)) / 0.05) * max(0.0, 1 - (i / (FPS * fine)) / land) ** 0.8 for i in range(n * fine)]
    d = np.cumsum(v)
    d = d / d[-1] * ROLL["far"]
    return [float(d[i * fine]) for i in range(n)], dur


# ---------------------------------------------------------------- the five moves

def move(m, source, before=None, after=None):
    """A move's pose at its own time: the pose before it (if it has one: `enter`), into the mocap at the move's pace, and
    out into her standing pose (if it ends there: `leave`; `after`, a function of time, first)."""
    warp = mono(m["warp"])
    leave = m.get("leave")

    def pose(t):
        p = source(warp(t), t)
        if before is not None:
            p = blend(before, p, ease(t / m["enter"]))
        if after:
            p = after(p, t)
        return blend(p, IDLE, ease((t - leave[0]) / (leave[1] - leave[0]))) if leave else p
    return pose


def drift_of(clip, s0, s1):
    """How far to her left a library clip's hips have gone since its time s0 (held from s1 on; the foot's little jumps
    taken out): taken out of her hips' place, she stays over her root."""
    ts = np.arange(0.0, float(clip.times[-1]) + 1e-9, 1 / 120)
    x = np.array([clip.at(min(max(t, s0), s1))[1][0] for t in ts])
    x = x - clip.at(s0)[1][0]
    k = np.ones(9) / 9
    xs = np.convolve(np.concatenate([np.full(4, x[0]), x, np.full(4, x[-1])]), k, mode="valid")
    return lambda s_: float(np.interp(s_, ts, xs))


def leap_path(dur, land, far):
    """How far along her way a leap has taken her, per frame: off at once, slower and slower, down at `land`."""
    n = int(round(dur * FPS)) + 1
    fine = 8
    v = [ease((i / (FPS * fine)) / 0.05) * max(0.0, 1 - (i / (FPS * fine)) / land) ** 0.6 for i in range(n * fine)]
    d = np.cumsum(v)
    d = d / d[-1] * far
    return [float(d[i * fine]) for i in range(n)]


def frames_of(pose, dur):
    out = []
    for i in range(int(round(dur * FPS)) + 1):
        out.append(settle(pose(i / FPS)))
    return out


def build():
    clips, marks, notes = {}, {}, []

    def done(name, m, pose, hand=None, path=None, loop=False):
        settle.short = 0.0
        dur = m.get("dur") or m.get("period") or m["leave"][1]
        frames = frames_of(pose, dur)
        clips[name] = (frames, loop)
        marks[name] = {"dur": dur}
        if hand:
            marks[name]["hand"] = hand
        for k in ("hit", "cancel", "again", "air"):
            if k in m:
                marks[name][k] = m[k]
        if path:
            marks[name]["path"] = path
        low = min(h[1] for _, h in frames)
        notes.append(f"//   {name:<12} {dur:.2f} s"
                     + (f": the cast leaves her {dict(R='right hand', L='left hand', B='hands')[hand]} at {m['hit']:.2f} s" if "hit" in m and hand else "")
                     + (f", the next move from {m['cancel']:.2f} s" if "cancel" in m else f", the first move again from {m['again']:.2f} s" if "again" in m else "")
                     + (", a loop" if loop else "")
                     + (f"; she goes {path[-1] * HH:.2f} m forward (library)" if path else ""))
        print(f"{name}: {dur:.2f} s, {len(frames)} frames; hips lowest {low:.3f} (standing {mj.IDLE_HIPS[1]:.3f}); "
              f"feet short of where they are put by {settle.short * 1000:.0f} mm at most")

    # ---- 1: the swipe. From standing: the mocap's wind-up is blended in as it swings (a quick opener)
    s1 = Stance(M1["src"])
    hands1 = lambda t: bump(t, 0.06, 0.18, 0.30, 0.45)
    pose1 = move(M1, lambda s, t: open_hands(look_ahead(s1.at(s)), 0.3 * hands1(t), 0.85 * hands1(t)), IDLE)
    done("mc_1", M1, pose1, "R")
    cut1 = pose1(M1["cancel"])

    # ---- 2: the swipe back. The library's, on her own feet where the swipe left them (its own legs are crossed, its
    # right foot ahead); they turn on the spot as her hips unwind
    f1 = feet_of(cut1)
    yaw1 = {s: foot_yaw(s, f1[s][1]) for s in SIDES}

    def feet2(side, hips_yaw, at=None):
        u = ease((M2_TURN[0] - hips_yaw) / (M2_TURN[0] - M2_TURN[1]))
        return f1[side][0] * np.array([1.0, 0.0, 1.0]) + np.array([0.0, GROUND, 0.0]), \
            foot_turned(side, yaw1[side] + (M2_FEET[side] - yaw1[side]) * u, 0.3 * u if side == "right" else 0.0)
    s2 = Stance(M2["src"], base={s: (f1[s][0][0], f1[s][0][2]) for s in SIDES}, feet=feet2, folder=LIB,
                height=lambda y: y + M2_RISE, sway=0.7)
    hands2 = lambda t: bump(t, 0.06, 0.18, 0.33, 0.48)
    up2 = lambda t: -M2_UP * bump(t, 0.06, 0.18, 0.38, 0.53)
    pose2 = move(M2, lambda s, t: open_hands(look_ahead(lean(s2.at(s), up2(t))), 0.4 * hands2(t), 0.85 * hands2(t)), cut1)
    done("mc_2", M2, pose2, "R")
    cut2 = pose2(M2["cancel"])

    # ---- 3: the turn. The library's own move, its legs kept; her root goes where its planted foot says
    rx_, rz_ = spin_root(mj.Clip(os.path.join(LIB, f"{M3['src']}.vrma")))
    s3 = Library(M3["src"], drift=rx_)
    warp3 = mono(M3["warp"])
    hands3 = lambda t: bump(t, 0.05, 0.2, 0.6, 0.8)
    look3 = lambda p, t: look_ahead(p) if t > M3["hit"] - 0.04 else p            # (turning, her head goes round with her)
    pose3 = move(M3, lambda s, t: open_hands(look3(s3.at(s), t), 0.6 * hands3(t), 0.8 * hands3(t)), cut2)
    n3 = int(round(M3["leave"][1] * FPS)) + 1
    path3 = []
    for i in range(n3):
        s = warp3(i / FPS)
        path3 += [round((rx_(s) - rx_(warp3(0))) / HH, 4), round((rz_(s) - rz_(warp3(0))) / HH, 4)]
    done("mc_3", M3, pose3, "R", path3)
    cut3 = pose3(M3["cancel"])

    # ---- 4: the finisher. Wide and low; its hands lowered at the end as Block End lowers them
    crouch = lambda y: min(M4_HIGH, y if y > 0.81 else 0.81 - (0.81 - y) * M4_DEPTH)
    lean4 = lambda t: M4_LEAN * bump(t, 0.40, 0.50, 0.72, 0.92)
    s4 = Stance(M4["src"], base=M4_STANCE, turn=(35.0, 5.0), height=crouch, sway=1.1)
    hold = s4.at(2.45)
    f4 = feet_of(hold)
    s4e = Stance(M4["end"], base=M4_STANCE, feet=lambda side, hips_yaw, at: (f4[side][0], f4[side][1]))
    la, lb = M4["lower"]

    def lowered(p, t):
        if t <= la:
            return p
        e = s4e.at(0.05 + 0.4 * (t - la) / (lb - la))
        return blend(p, look_ahead(Pose(e.L, p.hips + (e.hips - hold.hips) * 0.5, e.feet)), ease((t - la) / 0.12))
    hands4 = lambda t: bump(t, 0.10, 0.40, 0.72, 0.95)
    pose4 = move(M4, lambda s, t: open_hands(look_ahead(lean(s4.at(s), lean4(t))), 0.85 * hands4(t), 0.85 * hands4(t)), cut3, lowered)
    done("mc_4", M4, pose4, "B")

    # ---- the rising cast: out of the roll's crouch (the library's Roll at ROLL.counter)
    crouched = Library("Roll").at(ROLL["counter"])
    sr = Stance(MR["src"])
    handsr = lambda t: bump(t, 0.03, 0.12, 0.28, 0.42)
    poser = move(MR, lambda s, t: open_hands(look_ahead(sr.at(s)), 0.3 * handsr(t), 0.85 * handsr(t)), crouched)
    done("mc_rise", MR, poser, "R")

    # ---- the held cast: Kevin Iglesias' spear throw, both feet kept down. Into its cocked pose out of the swipe's cancel
    # pose; held (its own hold loop); thrown, her back foot turning on its toes and drawn on after her
    def feetc(side, hips_yaw, at):
        toe = np.array([MC_STANCE[side][0], GROUND, MC_STANCE[side][1]])
        u = ease((at - 0.96) / 0.22) if at is not None else 0.0
        if side == "left":
            return toe, foot_turned(side, MC_FEET[side] + MC_DRAG["front"] * u)
        return toe - np.array([0.0, 0.0, MC_DRAG["back"] * u]), foot_turned(side, MC_FEET[side] + MC_DRAG["turn"] * u, MC_DRAG["tip"] * u)
    so = Stance(MC_SRC, ref=0.70, base=MC_STANCE, feet=feetc, sway=MC_SWAY, height=lambda y: min(y, MC_HIGH))
    sh = Stance(MC_HOLD_SRC, ref=0.0, base=MC_STANCE, feet=lambda side, hy, at: feetc(side, hy, None))
    posei = move(MCI, lambda s, t: look_ahead(so.at(s)), cut1)
    done("mc_charge_in", MCI, posei)
    done("mc_charge", MCL, lambda t: look_ahead(sh.at(t)), loop=True)
    def lunged(s):
        # (as her hips go forward over her front foot they go down too, or her back leg could not reach its foot)
        p = so.at(s)
        p.hips[1] = min(p.hips[1], MC_HIGH - MC_DIP * ease((s - 0.98) / 0.14))
        return look_ahead(p)
    poset = move(MCT, lambda s, t: lunged(s))
    done("mc_throw", MCT, poset, "R")

    # ---- the running cast: the library's heavy combo's second strike, a turn and more to her right, lifted off the
    # ground as a leap (its feet step round under it: in the air they need not), down into its low cut
    heavy = mj.Clip(os.path.join(LIB, f"{MD['src']}.vrma"))
    s0d, s1d = MD["warp"][0][1], MD["warp"][-1][1]
    sd = Library(MD["src"], drift=drift_of(heavy, s0d, s1d))
    up, down_ = MD["air"]

    def flown(s, t):
        p = sd.at(s)
        u = min(1.0, max(0.0, (t - up) / (down_ - up)))
        p.hips[1] += MD["high"] * 4 * u * (1 - u)
        p = look_ahead(p) if t > MD["hit"] - 0.05 else p                      # (turning, her head goes round with her)
        k = bump(t, 0.03, 0.12, 0.6, 0.8)
        return open_hands(p, 0.6 * k, 0.8 * k)
    posed = move(MD, flown)
    pathd = []
    for v in leap_path(MD["leave"][1], MD["hit"] + 0.03, MD["far"]):
        pathd += [0.0, round(v, 4)]
    done("mc_dash", MD, posed, "R", pathd)

    # ---- the cast in the air: the heavy combo's third strike. Dropping: its hand going up over her head, her legs the
    # library's jump's (its own are still pushing off the ground). Landing: its blow down, and up into her standing pose
    s3 = Library(MD["src"], drift=drift_of(heavy, MPL["warp"][0][1], MSL["warp"][-1][1]))
    tucked = Library("Jump_Loop").at(0.0)

    def raised(s, t):
        p = s3.at(s)
        for b in mj.LEG_BONES:
            p.L[b] = tucked.L[b]
        k = ease(t / 0.1)
        return open_hands(p, 0.5 * k, 0.85 * k)
    done("mc_plunge", MPL, move(MPL, raised))
    blow = lambda t: bump(t, -1.0, 0.0, 0.3, 0.5)
    done("mc_slam", MSL, move(MSL, lambda s, t: open_hands(look_ahead(s3.at(s)), 0.5 * blow(t), 0.85 * blow(t))), "R")

    # ---- casting in the air (no capture): the library's jump's body; her arms laid here, in the world, so that they
    # point where she casts however her body is turned
    def arm_to(L, hips, side, d, f, wrist):
        """Her arm: its upper arm along d, its forearm along f (the world's), its hand bent back `wrist` degrees."""
        sgn = 1.0 if side == "left" else -1.0
        d, f = unit(np.array(d, float)), unit(np.array(f, float))
        e = unit(f - (f @ d) * d)
        Ru = np.column_stack([d, np.cross(e, d), e]) if sgn > 0 else np.column_stack([-d, np.cross(d, e), e])
        L[f"{side}Shoulder"] = np.eye(3)
        R, _ = mj.fk(L, hips)
        L[f"{side}UpperArm"] = R[f"{side}Shoulder"].T @ Ru
        L[f"{side}LowerArm"] = ry(-math.acos(max(-1.0, min(1.0, float(f @ d)))) * sgn)
        L[f"{side}Hand"] = rz(math.radians(wrist) * sgn)

    ARMS = ("Shoulder", "UpperArm", "LowerArm", "Hand")

    def volley(out_l, out_r, twist, kick_l, kick_r, back):
        """Casting from each hand in turn: out: an arm 0 drawn back to her side, 1 thrust out at what she casts at, its
        palm to it; twist: degrees, her right shoulder forward; kick: the arm thrown up by its cast; back: degrees she
        leans back (her knees come up with it: one drawn up before her, the other trailing)"""
        L = dict(tucked.L)
        L["hips"] = rx(math.radians(-back)) @ L["hips"]
        L.update(leftUpperLeg=ry(math.radians(8)) @ rx(math.radians(-50 - 1.6 * back)), leftLowerLeg=rx(math.radians(96)), leftFoot=rx(math.radians(36)),
                 rightUpperLeg=rx(math.radians(14 - 1.2 * back)), rightLowerLeg=rx(math.radians(30 + 1.5 * back)), rightFoot=rx(math.radians(42)))
        for b_, part in (("spine", 0.3), ("chest", 0.4), ("upperChest", 0.3)):
            L[b_] = L[b_] @ ry(math.radians(twist * part))
        for b_ in ("neck", "head"):                                           # (her head stays on what she casts at)
            L[b_] = L[b_] @ ry(math.radians(-twist * 0.5))
        for side, sgn, out, kick in (("left", 1.0, out_l, kick_l), ("right", -1.0, out_r, kick_r)):
            near, far = dict(L), dict(L)
            arm_to(near, tucked.hips, side, (sgn * 0.3, -0.75, -0.55), (sgn * 0.14, 0.02, 1.0), 12.0)
            d = unit(np.array([sgn * 0.2, -0.2 + 0.2 * kick, 1.0]))
            arm_to(far, tucked.hips, side, d, d + np.array([-sgn * (0.16 + 0.3 * kick), 0.2 * kick, 0.0]), 58.0 - 20.0 * kick)
            for part in ARMS:
                L[side + part] = slerp_m(near[side + part], far[side + part], out)
        return open_hands(Pose(L, tucked.hips), 0.25 + 0.7 * out_l, 0.25 + 0.7 * out_r)

    MA = dict(dur=0.3, hit=0.05, again=0.11)
    for name, hand, sign in (("mc_air_l", "L", -1.0), ("mc_air_r", "R", 1.0)):
        def cast(t, hand=hand, sign=sign):
            out, draw = ease(t / 0.06), 1 - ease((t - 0.01) / 0.1)            # this hand thrust out; the other drawn back
            kick = bump(t, 0.045, 0.07, 0.075, 0.13)
            twist = sign * 14.0 * (2 * ease(t / 0.08) - 1)
            back = 7.0 + 5.0 * bump(t, 0.04, 0.08, 0.1, 0.22)
            return volley(out, draw, twist, kick, 0.0, back) if hand == "L" else volley(draw, out, twist, 0.0, kick, back)
        done(name, MA, cast, hand)

    # ---- the rain: over forward till her head is down (her hips the middle of it), her arms out past her head at the
    # ground, casting from each in turn (a loop: the page spins her); and on over, upright again
    RAIN_UP = 1.25
    LEGS = {"jump": {b_: tucked.L[b_] for b_ in mj.LEG_BONES}, "in": {}, "rain": {}}
    for side, sgn in (("left", 1.0), ("right", -1.0)):
        LEGS["in"].update({f"{side}UpperLeg": rx(math.radians(-105)), f"{side}LowerLeg": rx(math.radians(125)), f"{side}Foot": rx(math.radians(30))})
    LEGS["rain"].update(leftUpperLeg=rx(math.radians(-6)), leftLowerLeg=rx(math.radians(8)), leftFoot=rx(math.radians(48)),
                        rightUpperLeg=ry(math.radians(-22)) @ rx(math.radians(-62)), rightLowerLeg=rx(math.radians(112)), rightFoot=rx(math.radians(48)))
    for part in LEGS.values():
        for b_ in mj.LEG_BONES:
            part.setdefault(b_, np.eye(3))

    def tumbling(over, tuck, reach, kick_l, kick_r):
        """over: how far over forward she is (radians); tuck: her legs 0 as they are, 1 pulled in; reach: 0 the jump's
        body, 1 the rain's (her legs one straight, one bent; her arms out past her head); kick: an arm thrown by its cast"""
        L = dict(tucked.L)
        for b_ in mj.LEG_BONES:
            L[b_] = slerp_m(slerp_m(LEGS["jump"][b_], LEGS["rain"][b_], reach), LEGS["in"][b_], tuck)
        for b_ in ("spine", "chest", "upperChest", "neck"):
            L[b_] = slerp_m(tucked.L[b_], np.eye(3), reach)
        L["head"] = slerp_m(tucked.L["head"], rx(math.radians(-28)), reach)   # (looking where her hands point)
        turn = rx(over)
        L["hips"] = turn @ slerp_m(tucked.L["hips"], np.eye(3), reach)
        hips = np.array([0.0, tucked.hips[1] + (RAIN_UP - tucked.hips[1]) * reach, 0.0])
        for side, sgn, kick in (("left", 1.0, kick_l), ("right", -1.0, kick_r)):
            far = dict(L)
            d = unit(np.array([sgn * (0.5 + 0.1 * kick), 1.0, 0.12 + 0.3 * kick]))
            arm_to(far, hips, side, turn @ d, turn @ (d + np.array([-sgn * (0.14 + 0.5 * kick), 0.0, 0.1 * kick])), 50.0 - 25.0 * kick)
            for part in ARMS:
                L[side + part] = slerp_m(tucked.L[side + part], far[side + part], reach)
        return open_hands(Pose(L, hips), 0.25 + 0.7 * reach, 0.25 + 0.7 * reach)

    MRL = dict(period=0.18)
    beat = lambda t: max(0.0, math.cos(2 * math.pi * (t / MRL["period"] - 0.1))) ** 3   # (a kick every period, the same at both ends)
    raining = lambda t: tumbling(math.pi, 0.0, 1.0, beat(t), beat(t - MRL["period"] / 2))
    MRI, MRO = dict(dur=0.28), dict(dur=0.28)
    smooth = lambda u: (lambda w: w * w * (3 - 2 * w))(min(1.0, max(0.0, u)))  # (her turning over: no quicker in its middle than it need be)
    done("mc_rain_in", MRI, lambda t: blend(tumbling(math.pi * smooth(t / 0.26), bump(t, -0.02, 0.1, 0.13, 0.27), ease((t - 0.06) / 0.2), 0.0, 0.0),
                                            raining(0.0), ease((t - 0.22) / 0.06)))
    done("mc_rain", MRL, raining, loop=True)
    done("mc_rain_out", MRO, lambda t: tumbling(math.pi * (1 + smooth(t / 0.26)), bump(t, 0.0, 0.11, 0.14, 0.27), 1 - ease(t / 0.22), 0.0, 0.0))

    # ---- the roll's way
    path, dur = roll_path()
    r = ROLL["rate"]
    marks["roll"] = {"clip": "roll", "rate": r, "dur": round(dur, 4), "land": round(ROLL["land"] / r, 4),
                     "counter": round(ROLL["counter"] / r, 4), "free": round(ROLL["free"] / r, 4),
                     "path": [round(v, 4) for v in path]}
    notes.append(f"//   roll     the game's own clip at x{r}: {dur:.2f} s, {ROLL['far'] * HH:.2f} m (library); her feet under her at "
                 f"{ROLL['land'] / r:.2f} s, the rising cast from {ROLL['counter'] / r:.2f} s, walking on from {ROLL['free'] / r:.2f} s")
    return clips, marks, notes


def baked(frames, loop=False):
    rot = {b: [] for b in sk.node}
    hips = []
    for L, h in frames:
        for b in sk.node:
            q = quat_of(L[b])
            if rot[b] and np.dot(rot[b][-1], q) < 0:
                q = -q
            rot[b].append(q)
        hips.append(tuple(float(v) for v in h))
    clip = {"times": [i / FPS for i in range(len(frames))], "rot": {b: [tuple(q) for q in v] for b, v in rot.items()},
            "hips": hips, "rest_hips": [0.0, HH, 0.0]}
    tracks, hips_flat, n = bake_mod.bake(clip)
    return {"duration": round((len(frames) - 1) / FPS, 4), "frames": n, "loop": loop, "speed": 0.0, "tracks": tracks, "hips": hips_flat}


def main():
    clips, marks, notes = build()
    anim = {"fps": FPS, "forwardYaw": 3.1416, "hipsBone": "J_Bip_C_Hips", "hipsUnit": "hipsHeight",
            "clips": {name: baked(frames, loop) for name, (frames, loop) in clips.items()}}
    combo = {"fps": FPS, "clips": {k: v for k, v in marks.items() if k != "roll"}, "roll": marks["roll"]}
    head = ("// magic-combo-anim.js: written by tools/make-magic-combo-anim.py; do not edit by hand.\n"
            "// The moves of her magic combo (magic-combo.js), for VRoid bones: Mixamo's casts (Adobe: free to use in this game, not\n"
            "// CC0) and the library's swipe back and turn (Quaternius, CC0), posed again for her and cut to a fight's pace.\n"
            "// Hips path in hips heights.\n"
            "// MAGIC_COMBO: when each cast leaves her hand (hit), when the next move may begin (cancel; again: the first, after\n"
            "// the last), how long it is (dur), which hand, and her way over the ground where a move takes her (path: x to her\n"
            "// left, z ahead, hips heights, per frame).\n"
            + "\n".join(notes) + "\n")
    path = os.path.join(REPO, "magic-combo-anim.js")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(head + "export const CHARACTER_ANIM = " + json.dumps(anim, separators=(",", ":")) + ";\n"
                 + "export const MAGIC_COMBO = " + json.dumps(combo, separators=(",", ":")) + ";\n")
    print(f"wrote {path} ({os.path.getsize(path) // 1024} KB)")


if __name__ == "__main__":
    main()
