#!/usr/bin/env python3
"""Make her way over a cliff's top: climb-top-anim.js, from Mixamo's "Climbing To Top" (mocap), posed again for her.

Climbing, when her hands reach the top she goes over it (player-moves.js, player-climb-top.js). It was the library's
ClimbUp_1m (a running vault onto a 1 m ledge, 0.62 s); the user sent Mixamo's "Climbing To Top" for it ("ตอนปีนถึงยอด
แล้ว ขอเป็นท่านี้"), and chose it about 1.2 s long (the capture's part of it is 2.65 s: played 2.2 times as fast, so
it has weight and is not slow).

The capture (4 s) begins standing at a wall's foot: her right hand reaches up and takes the edge, she walks her feet up
the wall, her left hand goes up onto the top, she steps her left foot high on the wall and pushes, her right knee comes
up onto the top, she steps onto her right foot and stands up on it, and her left foot comes up beside it. Used here:
from SRC_FROM (her right hand on its way up to the edge, her feet on the wall: the climbing pose she is in) to
SRC_STAND (standing on the top), then SETTLE s into her standing pose (the library idle's first frame).

The capture's top is not where its feet end: up to the knee coming up, its hands, feet and knee say the top is at the
edge its right hand holds (TOP, a little over two hips heights over the wall's foot); after it, its feet stand on a top
half a hips height lower. Mixamo's hips go up too little at the end. So from SRC_LIFT on (her right foot coming onto
the top) her body is raised by the difference, as she stands up on that foot: her right leg straightens under her.

Then, every frame, on the playable characters' proportions (tools/vrma_pose.py: a VRoid model's arms are three
quarters of the capture's, its hands do not reach the edge on their own):
  - her right hand is put on the edge (from RH: as it arrives until it lets go), her left on the top (LH);
  - each foot that holds the wall stays where it took hold (on the wall's face: the capture's feet press into it);
  - her feet do not go through the top: a foot over the top and under it is drawn up (her knee bending more), and the
    feet come down on the top where she stands in her standing pose (her left ahead, her right behind and turned out),
    the right first (RF_DOWN), then the left (LF_DOWN), each drawn there over its step: no foot moves once down;
  - at the end (SETTLE) her back, arms and head go over into the idle's first frame, her legs laid on her feet.

The clip is in place: her way up and over (her root: the point under her hips at the wall's foot, then on the top)
is taken out and written beside it, per frame (CLIMB_TOP.up, .along: hips heights from where it begins), for the game
to move her by, warped to the real cliff (player-climb-top.js). Her root goes up as her hips do (never down) until her
right foot is down on the top, and in as they do until her left is: it is on the top where she stands. Her hips stay
about a hips height over it until then, so a move begun part way (a low ledge) has her body where her root is. Where it begins her root is WALL
hips heights from the wall (as climbing: player-moves.js' WALL_HH) and her hips HIPS_Y over it.

Usage (from the repo folder; needs numpy; the capture made a .vrma first, kept out of the repo: Mixamo's moves are
Adobe's, free to use in the game, not to hand on as files):
  npm install --no-save three@0.170.0                (once)
  node tools/mixamo-to-vrma.mjs assets/animations/mixamo path/to/Climbing_To_Top.fbx
  python3 tools/make-climb-top-anim.py assets/animations/mixamo/Climbing_To_Top.vrma
writes climb-top-anim.js next to index.html and prints where her hands and feet are against the wall and the top.
"""
import importlib.util
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from vrma_pose import LIB, Skeleton, fitted_skeleton, mat_of, quat_of, read_floats, slerp_m, two_bone, unit  # noqa: E402

_spec = importlib.util.spec_from_file_location("bake", os.path.join(HERE, "bake-character-anim.py"))
bake_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bake_mod)

FPS = 60
SRC_FROM = 0.45          # s into the capture: her right hand on its way up to the edge, her feet on the wall
SRC_STAND = 3.12         # standing on the top
MOVE = 1.2               # s it takes her (the user's choice: "~1.2 วิ"), from SRC_FROM to SRC_STAND
RATES = (2.65, 1.8)      # how much faster than the capture it goes as it begins and as she stands (going from one to the
                         # other evenly: the climb quick, standing up on the top with her weight in it)
SETTLE = 0.25            # s from standing into her standing pose (the idle's first frame): her arms come down from out in front
# Lengths in hips heights (the library skeleton's hips at 1), on the capture's own ground (the wall's foot)
WALL_Z = 0.56            # the wall's face, ahead of where her hips begin (the capture's toes press into it at 0.48)
TOP = 2.0                # the top: the edge her right hand holds (its palm 2.04 over the ground)
SRC_LIFT = (2.55, 3.05)  # her body raised to stand on TOP from here to here (s into the capture)
WALL = 0.44              # her root, where it begins, this far off the wall (as climbing: player-moves.js' WALL_HH)
HIPS_Y = 0.99            # and her hips this high over it (tools/make-climb-anim.py)
PALM = 0.03              # her palm's joint over what it lies on; the hand on the edge this far in from it
SOLE = 0.03              # her toes' joint over the ground
TOE_TIP = 0.08           # from her toes' joint to their tips: a foot on the wall has its joint this far off it
CLEAR = 0.05             # a foot over the top is kept this far over it (its toes' joint, its ankle a little more)
# when each holds (s into the capture): her hands on the edge and the top; her feet on the wall; down on the top
RH = (0.74, 2.2)         # (comes to the edge at 0.70, lets go as it is lifted at 2.2)
LH = (1.80, 2.25)
RF_WALL = [(0.45, 0.95), (1.25, 2.02)]
LF_WALL = [(0.45, 0.55), (0.82, 1.42), (1.92, 2.56)]
RF_DOWN = (2.38, 2.74)   # her right foot's step onto the top: from leaving where it was to down
LF_DOWN = (2.62, 3.06)
LF_STEP = (2.48, 3.06)   # her left foot's step off its high hold onto the top, designed: STEP_BACK off the rock, STEP_ARC over where it comes down
STEP_BACK, STEP_ARC = 0.12, 0.1
NEAR, NEAR_UNTIL = 0.25, 2.2
ARMS_DOWN, ARMS_FROM = 35.0, (2.6, 2.9)   # degrees her upper arms are lowered from 2.6-2.9 s of the capture on (it stands up with
                                          # them out wide)   # climbing (to 2.2 s of the capture), a foot off the wall stays within NEAR of it
FADE = 0.15              # s (of the capture) a hold is taken or let go of over
LIFT_EASE = 0.1          # s (of the clip) a foot's lift over the top eases in before it is needed and out after

sk, HH, COUNT = fitted_skeleton()
# (the skeleton's lengths are metres, its hips HH high: the lengths above in metres)
WALL_Z, TOP, WALL, HIPS_Y, PALM, SOLE, TOE_TIP, CLEAR, NEAR = (v * HH for v in (WALL_Z, TOP, WALL, HIPS_Y, PALM, SOLE, TOE_TIP, CLEAR, NEAR))
ORDER = []


def _visit(b):
    if b in ORDER:
        return
    if sk.parent.get(b):
        _visit(sk.parent[b])
    ORDER.append(b)


for _b in sk.node:
    _visit(_b)
ARM = {s: (f"{s}UpperArm", f"{s}LowerArm", f"{s}Hand", f"{s}MiddleProximal") for s in ("left", "right")}
LEG = {s: (f"{s}UpperLeg", f"{s}LowerLeg", f"{s}Foot", f"{s}Toes") for s in ("left", "right")}
LEG_BONES = {b for s in LEG for b in LEG[s]}
LEG_UPPER = {LEG[s][0] for s in LEG}
KNEE_AHEAD = 0.5 * HH    # how much the way her hips face counts in which way a knee bends (against how bent it is)


def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def window(s, w, fade=FADE):
    """1 inside a hold, eased in and out over fade at its ends."""
    return smooth((s - w[0]) / fade + 1) * (1 - smooth((s - w[1]) / fade))


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
        for b in sk.node:
            self.rot.setdefault(b, np.tile([0.0, 0.0, 0.0, 1.0], (len(self.times), 1)))

    def at(self, t):
        t = min(max(t, self.times[0]), self.times[-1])
        i = min(max(int(np.searchsorted(self.times, t, side="right")) - 1, 0), len(self.times) - 2)
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


def places(R, hips):
    P = {}
    for b in ORDER:
        p = sk.parent.get(b)
        P[b] = np.array(hips, dtype=float) if p is None else P[p] + R[p] @ sk.offset[b]
    return P


def locals_from(R):
    return {b: (R[sk.parent[b]].T @ R[b]) if sk.parent.get(b) else R[b] for b in R}


def turn_between(a, b):
    a, b = unit(a), unit(b)
    axis = np.cross(a, b)
    s, c = float(np.linalg.norm(axis)), float(np.dot(a, b))
    if s < 1e-9:
        return np.eye(3)
    x, y, z = axis / s
    k = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
    return np.eye(3) + s * k + (1 - c) * (k @ k)


def reach(R, P, chain, target, w, end_R=None):
    """upper -> lower -> end: the tip (a joint under end: the palm, the toes) brought to target by w (0..1), the end turned
    end_R in the world (None: as it is), bent the way it already bends. R changed; -> the new places."""
    if w <= 1e-4:
        return P
    up, lo, en, tip = chain
    Re = R[en] if end_R is None else end_R
    want = P[tip] + (np.asarray(target) - P[tip]) * w
    ankle = want - Re @ sk.offset[tip]                       # where the end joint must be for the tip to be there
    a, b = np.linalg.norm(sk.offset[lo]), np.linalg.norm(sk.offset[en])
    pole = P[lo] - P[up]
    d = unit(ankle - P[up])
    pole = pole - d * np.dot(pole, d)
    if up in LEG_UPPER:
        # (a knee: the way it bends, and the way her hips face, so a leg near straight does not swing its knee about)
        ahead = R["hips"] @ np.array([0.0, 0.3, 1.0])
        ahead = ahead - d * np.dot(ahead, d)
        if np.linalg.norm(ahead) > 1e-6:
            pole = pole + unit(ahead) * KNEE_AHEAD
    if np.linalg.norm(pole) < 1e-6:
        return P
    mid, _ = two_bone(P[up], ankle, a, b, unit(pole))
    R[up] = turn_between(P[lo] - P[up], mid - P[up]) @ R[up]
    P = places(R, P["hips"])
    R[lo] = turn_between(P[en] - P[lo], ankle - P[lo]) @ R[lo]
    keep = {c: R[en].T @ R[c] for c in ORDER if c != en and _under(c, en)}
    R[en] = Re
    for c, k in keep.items():                                # (her fingers, her toes: as they were on the hand, the foot)
        R[c] = Re @ k
    return places(R, P["hips"])


def slerp_dir(a, b, u):
    """The direction u of the way from a to b (unit vectors), along the great circle."""
    a, b = unit(a), unit(b)
    om = math.acos(min(1.0, max(-1.0, float(np.dot(a, b)))))
    if om < 1e-6:
        return a
    return unit((math.sin((1 - u) * om) * a + math.sin(u * om) * b) / math.sin(om))


def _under(c, b):
    p = sk.parent.get(c)
    while p:
        if p == b:
            return True
        p = sk.parent.get(p)
    return False


def main(argv, mirror_idle=False):
    """Writes climb-top-anim.js. (mirror_idle: only the frames and hips for the mirror: made ending in the idle's mirror,
    so that mirrored they end in the idle itself, her left foot ahead as always)"""
    if len(argv) < 2:
        print(__doc__)
        return 1
    clip = Clip(argv[1])
    idle = Clip(os.path.join(LIB, "Idle_Loop.vrma"))
    IL, Ih = idle.at(0.0)
    if mirror_idle:
        M_ = np.diag([-1.0, 1.0, 1.0])
        sw = lambda b: "right" + b[4:] if b.startswith("left") else "left" + b[5:] if b.startswith("right") else b
        IL, Ih = {b: M_ @ IL[sw(b)] @ M_ for b in IL}, Ih * np.array([-1.0, 1.0, 1.0])
    IR, IP = fk(IL, Ih)
    r0, r1 = RATES
    assert abs(MOVE * (r0 + r1) / 2 - (SRC_STAND - SRC_FROM)) < 0.02, "RATES must take the capture's part in MOVE"
    rate = (SRC_STAND - SRC_FROM) / MOVE
    n = int(round((MOVE + SETTLE) * FPS)) + 1
    times = np.arange(n) / FPS

    def src(c):
        c = min(c, MOVE)
        return min(SRC_STAND, SRC_FROM + r0 * c + (r1 - r0) * c * c / (2 * MOVE))

    def clip_time(s_):                                                # a time of the capture -> of the clip
        a, b = 0.0, MOVE
        for _ in range(40):
            m = (a + b) / 2
            a, b = (m, b) if src(m) < s_ else (a, m)
        return (a + b) / 2

    # the top's own lengths: where its feet end (the capture's) and so how much she is raised to stand on TOP
    Lz, hz = clip.at(SRC_STAND)
    _, Pz = fk(Lz, hz)
    end_ground = min(Pz["leftToes"][1], Pz["rightToes"][1]) - SOLE
    lift = TOP - end_ground

    def raised(s):
        return lift * smooth((s - SRC_LIFT[0]) / (SRC_LIFT[1] - SRC_LIFT[0]))

    # where her feet come down on the top: where they are as she stands (the idle's: her left ahead, her right behind and
    # turned out), under her hips as the capture has them standing
    Ls, hs = clip.at(SRC_STAND)
    root_end = np.array([hs[0] - Ih[0], TOP, hs[2] - Ih[2]])
    ground = min(IP["leftToes"][1], IP["rightToes"][1]) - SOLE      # (the idle's ground, under its toes)
    feet_down = {s: root_end + IP[f"{s}Toes"] - np.array([0.0, ground, 0.0]) for s in ("left", "right")}

    held = {}              # where each hold was taken (by name)
    step_from = {}         # (and kept, for the step off it)
    frames, hips_out, report = [], [], []
    hand_on = {}
    # how far each foot must be lifted to be over the top, every frame (its toes' joint, its ankle: the capture's feet go
    # through the top where it is not its own); eased over LIFT_EASE s of the clip either side, so it is never sudden
    def need(side, s):
        if s >= (RF_DOWN if side == "right" else LF_DOWN)[1] or any(window(s, w_) > 0 for w_ in (RF_WALL if side == "right" else LF_WALL)):
            return 0.0
        if side == "left" and s > LF_STEP[0]:
            return 0.0
        L, h = clip.at(s)
        _, P = fk(L, h + np.array([0.0, raised(s), 0.0]))
        short = 0.0
        for joint, clear in ((LEG[side][3], SOLE + CLEAR), (LEG[side][2], SOLE + CLEAR + 0.05 * HH)):
            over = smooth((P[joint][2] - (WALL_Z - TOE_TIP + 0.01 * HH)) / (0.06 * HH))
            short = max(short, (TOP + clear - P[joint][1]) * over)
        return short
    K = int(round(LIFT_EASE * FPS))
    bump = np.cos(np.linspace(-1, 1, 2 * K + 1) * math.pi / 2) ** 2
    lifts = {}
    for side in ("left", "right"):
        req = np.array([need(side, src(c)) for c in times])
        pad = np.concatenate([np.zeros(K), req, np.zeros(K)])
        lifts[side] = np.array([np.max(pad[f:f + 2 * K + 1] * bump) for f in range(n)])
    toes_down = {}
    for side, down in (("right", RF_DOWN), ("left", LF_DOWN)):
        Ls_, hs_ = clip.at(down[1])
        toes_down[side] = fk(Ls_, hs_ + np.array([0, raised(down[1]), 0]))[1][LEG[side][3]]

    for fi, c in enumerate(times):
        s = src(c)
        L, h = clip.at(s)
        h = h + np.array([0.0, raised(s), 0.0])
        R, P = fk(L, h)
        raw_toes = {sd: P[LEG[sd][3]].copy() for sd in ("left", "right")}
        # ---- her hands: the right on the edge, the left on the top
        for side, w_, onto in (("right", RH, "edge"), ("left", LH, "top")):
            w = window(s, w_)
            key = f"{side}Hand"
            if w <= 0:
                held.pop(key, None)
                continue
            if key not in held:
                t0 = max(w_[0] + FADE, SRC_FROM)             # where the capture's hand is as it takes hold
                Lh, hh_ = clip.at(t0)
                _, Ph = fk(Lh, hh_ + np.array([0, raised(t0), 0]))
                p = Ph[ARM[side][3]].copy()
                p[1] = TOP + PALM
                p[2] = max(p[2], WALL_Z + PALM) if onto == "edge" else max(p[2], WALL_Z + 0.15 * HH)
                if onto == "edge":
                    p[2] = WALL_Z + PALM
                held[key] = p
            # the palm flat on the top, fingers ahead (her hand turned so its middle finger points along it)
            Rh = R[ARM[side][2]]
            fwd = Rh @ unit(sk.offset[ARM[side][3]])
            flat = unit(np.array([fwd[0], 0.0, max(fwd[2], 0.35)]))
            Rh = slerp_m(Rh, turn_between(fwd, flat - np.array([0, 0.25, 0])) @ Rh, 0.8)
            P = reach(R, P, ARM[side], held[key], w, slerp_m(R[ARM[side][2]], Rh, w))
            hand_on[side] = max(hand_on.get(side, 0.0), w)
        # ---- her feet: on the wall where they took hold; down on the top where she stands; otherwise not through it
        for side, walls, down in (("right", RF_WALL, RF_DOWN), ("left", LF_WALL, LF_DOWN)):
            toe = LEG[side][3]
            wall_w = 0.0
            for i, w_ in enumerate(walls):
                w = window(s, w_)
                key = f"{side}Wall{i}"
                if w <= 0:
                    held.pop(key, None)
                    continue
                if key not in held:
                    t0 = max(w_[0] + FADE, SRC_FROM)
                    Lf, hf = clip.at(t0)
                    _, Pf = fk(Lf, hf + np.array([0, raised(t0), 0]))
                    p = Pf[toe].copy()
                    p[2] = min(p[2], WALL_Z - TOE_TIP)       # on the wall's face, not in it
                    held[key] = p
                    step_from[key] = p
                P = reach(R, P, LEG[side], held[key], w)
                wall_w = max(wall_w, w)
            # stepping onto the top: drawn over the step to where it comes down, and turned as she stands; and over the
            # top, never under it: lifted (LIFTS: worked out for the whole swing, eased in before it is needed)
            u = smooth((s - down[0]) / (down[1] - down[0]))
            raw = raw_toes[side]
            aim = None
            if s < NEAR_UNTIL and wall_w < 1:
                # (climbing, a foot off the wall stays near it: the capture swings its foot far back for the high step)
                limit, k_ = WALL_Z - TOE_TIP - NEAR, 0.04 * HH
                z = limit + k_ * math.log1p(math.exp((raw[2] - limit) / k_))
                if z - raw[2] > 1e-4:
                    aim = raw.copy()
                    aim[2] = z
            if u > 0:
                aim = raw + (feet_down[side] - toes_down[side]) * u
            if lifts[side][fi] > 1e-4:
                aim = (raw if aim is None else aim).copy()
                aim[1] = max(aim[1], raw[1] + lifts[side][fi])
            if side == "left" and LF_STEP[0] < s < down[1] and "leftWall2" in step_from:
                # off its high hold on the wall and up onto the top: back off the rock, up, then in and down where she
                # stands (the capture's foot goes in through the top, which is higher than its own)
                H0, D = step_from["leftWall2"], feet_down["left"]
                v_ = (s - LF_STEP[0]) / (down[1] - LF_STEP[0])
                y = H0[1] + (D[1] + STEP_ARC - H0[1]) * smooth(v_ / 0.55) - STEP_ARC * smooth((v_ - 0.55) / 0.45)
                z = H0[2] - STEP_BACK * math.sin(math.pi * min(1.0, v_ / 0.55)) + (D[2] - H0[2]) * smooth((v_ - 0.3) / 0.7)
                x = H0[0] + (D[0] - H0[0]) * smooth(v_)
                aim = np.array([x, max(y, TOP + SOLE + CLEAR if z > WALL_Z - TOE_TIP + 0.01 * HH else -9.0), z])
            if s >= down[1]:
                aim = feet_down[side]
            if aim is not None:
                Rf = slerp_m(R[LEG[side][2]], IR[LEG[side][2]], smooth((s - down[0]) / (down[1] - down[0]) * 1.2)) if u > 0 else None
                P = reach(R, P, LEG[side], aim, 1.0 - wall_w, Rf)
        # ---- her arms, out wide as she stands up (the capture's balance): lowered toward her sides (never both out)
        wa = ARMS_DOWN * smooth((s - ARMS_FROM[0]) / (ARMS_FROM[1] - ARMS_FROM[0]))
        if wa > 0 and window(s, RH) <= 0 and window(s, LH) <= 0:
            down = np.array([0.0, -1.0, 0.0])
            for side in ("left", "right"):
                ua = ARM[side][0]
                d = unit(P[ARM[side][1]] - P[ua])
                ang = math.acos(min(1.0, max(-1.0, float(np.dot(d, down)))))
                if ang > 1e-3:
                    turn = turn_between(d, slerp_dir(d, down, min(1.0, math.radians(wa) / ang)))
                    for b in ORDER:
                        if b == ua or _under(b, ua):
                            R[b] = turn @ R[b]
            P = places(R, P["hips"])
        # ---- standing: into her standing pose (the idle's first frame), her feet where they are
        v = smooth((c - MOVE) / SETTLE) if c > MOVE else 0.0
        if v > 0:
            Lc = locals_from(R)
            for b in ORDER:
                if b not in LEG_BONES:
                    Lc[b] = slerp_m(Lc[b], IL[b], v)
            h2 = P["hips"] + ((root_end + Ih) - P["hips"]) * v
            R, P = fk(Lc, h2)
            for side in ("left", "right"):
                P = reach(R, P, LEG[side], feet_down[side], 1.0, slerp_m(R[LEG[side][2]], IR[LEG[side][2]], 1.0))
        frames.append(locals_from(R))
        hips_out.append(P["hips"].copy())
        report.append((c, s, P))

    # ---- in place: her root's way taken out (up: with her hips' height; along: with their way forward)
    H = np.array(hips_out)
    root0 = np.array([0.0, H[0][1] - HIPS_Y, WALL_Z - WALL])
    root1 = np.array([0.0, TOP, root_end[2]])
    shift_x = root_end[0]                                     # (across: her root ends under her, as in the idle)
    # (her root is on the top once her right foot is down on it, and where she stands once her left is: from then on
    # it is her hips that rise, standing up, and come over her feet)
    fy, fz = int(round(clip_time(RF_DOWN[1]) * FPS)), int(round(clip_time(LF_DOWN[1]) * FPS))
    EASE_F = 8
    py = np.minimum(1.0, np.maximum.accumulate((H[:, 1] - H[0][1]) / (H[fy][1] - H[0][1])))
    pz = np.clip((H[:, 2] - H[0][2]) / (H[fz][2] - H[0][2]), None, 1.0)
    ease_to = lambda a, f1: a + (1.0 - a) * np.array([smooth((f - f1 + EASE_F) / EASE_F) for f in range(n)])
    py, pz = ease_to(py, fy), ease_to(pz, fz)          # (coming to rest over EASE_F frames, not stopped in one)
    up = (root1[1] - root0[1]) * py
    along = (root1[2] - root0[2]) * pz
    rel = H - np.column_stack([np.full(n, shift_x), root0[1] + up, root0[2] + along])
    if mirror_idle:
        return frames, rel

    # ---- what it did: her hands and feet against the wall and the top (the capture's own ground and wall)
    print(f"Climbing To Top {SRC_FROM}-{SRC_STAND} s in {MOVE} s (x{r0}..x{r1}), then {SETTLE} s into her standing pose: "
          f"{n} frames at {FPS}; fitted on {COUNT} characters")
    print("feet down on the top at", {k: np.round(v / HH, 3).tolist() for k, v in feet_down.items()}, "idle ground", round(ground / HH, 3))
    print(f"the capture's feet end {end_ground / HH:.2f} over its ground, the edge its hand holds at {TOP / HH:.2f}: raised {lift / HH:.2f} "
          f"from {SRC_LIFT[0]} to {SRC_LIFT[1]} s")
    print(f"her root: from {root0[1] / HH:.2f} up, {WALL / HH:.2f} off the wall; to the top, {(root1[2] - WALL_Z) / HH:.2f} in from its edge "
          f"(up {(root1[1] - root0[1]) / HH:.2f}, along {(root1[2] - root0[2]) / HH:.2f}); hips over it {rel[0][1] / HH:.2f} -> {rel[-1][1] / HH:.2f}, "
          f"behind it {rel[0][2] / HH:.2f} -> {rel[-1][2] / HH:.2f} (hips heights)")
    worst = []
    print("   c     src   hips(y,z)   r.palm(y,z)   l.palm(y,z)   r.toes(y,z)   l.toes(y,z)")
    for i, (c, s, P) in enumerate(report):
        for side in ("left", "right"):
            for j in (LEG[side][3], LEG[side][2], LEG[side][1]):
                p = P[j]
                if p[2] > WALL_Z and p[1] < TOP:                # inside the rock
                    worst.append((min(p[2] - WALL_Z, TOP - p[1]) / HH, j, c))
        if i % 6 == 0:
            g = lambda b: f"{P[b][1] / HH:5.2f} {P[b][2] / HH:5.2f}"
            print(f"  {c:.2f}  {s:.2f}  {g('hips')}   {g('rightMiddleProximal')}    {g('leftMiddleProximal')}    "
                  f"{g('rightToes')}    {g('leftToes')}")
    if worst:
        worst.sort(reverse=True)
        print(f"inside the rock: {len(worst)} joint-frames, deepest {worst[0][0]:.3f} hips heights ({worst[0][1]} at {worst[0][2]:.2f} s)")
    else:
        print("no foot, ankle or knee inside the rock")
    # how fast her hands and feet go against her hips (m/s, on a 1.75 m character: hips 0.96 m high)
    to175 = 0.96 / HH
    ends = [ARM["left"][3], ARM["right"][3], LEG["left"][3], LEG["right"][3], LEG["left"][1], LEG["right"][1]]
    rel_p = np.array([[P[b] - P["hips"] for b in ends] for _, _, P in report])
    sp = np.linalg.norm(np.diff(rel_p, axis=0), axis=2) * FPS * to175
    top = np.argsort(sp.ravel())[-4:][::-1]
    print("fastest against her hips (m/s at 1.75 m):", ", ".join(f"{ends[i % len(ends)]} {sp.ravel()[i]:.1f} at {(i // len(ends)) / FPS:.2f} s" for i in top))
    steps = []
    for side in ("left", "right"):
        tp = np.array([P[LEG[side][3]] for _, _, P in report])
        steps.append(float(np.max(np.linalg.norm(np.diff(tp[-int(SETTLE * FPS) - 2:], axis=0), axis=1))))
    print(f"her feet once down, the most either moves in a frame: {max(steps) * 100:.2f} cm (library scale)")

    # ---- the game's clip and what goes with it
    # and its mirror (her left hand to the edge): she goes on with whichever hand was up as she climbed
    M = np.diag([-1.0, 1.0, 1.0])
    swap = lambda b: "right" + b[4:] if b.startswith("left") else "left" + b[5:] if b.startswith("right") else b
    anim = {"fps": FPS, "forwardYaw": 3.1416, "hipsBone": "J_Bip_C_Hips", "hipsUnit": "hipsHeight", "clips": {}}
    mframes, mrel = main(argv, True)
    for name, mirror in (("climb_top", False), ("climb_top_m", True)):
        clip_d = {"times": list(times), "rot": {}, "rest_hips": [0.0, HH, 0.0],
                  "hips": [tuple(r_ * np.array([-1.0, 1.0, 1.0])) if mirror else tuple(r_) for r_ in (mrel if mirror else rel)]}
        for b in sk.node:
            qs = []
            for L in (mframes if mirror else frames):
                q = quat_of(M @ L[swap(b)] @ M) if mirror else quat_of(L[b])
                if qs and np.dot(qs[-1], q) < 0:
                    q = -q
                qs.append(tuple(q))
            clip_d["rot"][b] = qs
        tracks, hips_flat, frames_n = bake_mod.bake(clip_d)
        anim["clips"][name] = {"duration": round(float(times[-1]), 4), "frames": frames_n, "loop": False,
                               "speed": 0.0, "tracks": tracks, "hips": hips_flat}
    r = lambda v: round(float(v), 4)
    ct = lambda s_: r(clip_time(s_))
    data = {
        "fps": FPS, "duration": r(times[-1]),
        "up": [r(v / HH) for v in up], "along": [r(v / HH) for v in along],       # her root, from where it begins (hips heights)
        "rise": r((root1[1] - root0[1]) / HH), "ahead": r((root1[2] - root0[2]) / HH),   # all of it
        "edge": {"up": r((TOP - root0[1]) / HH), "out": r(WALL / HH), "in": r((root1[2] - WALL_Z) / HH)},   # the top over her root as it begins; how far in she ends
        "hand": {"right": [ct(RH[0]), ct(RH[1])], "left": [ct(LH[0]), ct(LH[1])]},
        "wall": {"right": [[ct(a), ct(b)] for a, b in RF_WALL], "left": [[ct(a), ct(b)] for a, b in LF_WALL]},
        "down": {"right": [ct(RF_DOWN[0]), ct(RF_DOWN[1])], "left": [ct(LF_DOWN[0]), ct(LF_DOWN[1])]},
        "kneeUp": ct(2.2), "overTop": ct(2.45),                          # her right knee coming up onto the top; her hips over it
        "edgeHand": "right", "stand": r(MOVE), "fade": r(FADE / rate), "palm": r(PALM / HH), "sole": r(SOLE / HH), "toeTip": r(TOE_TIP / HH), "clear": r(CLEAR / HH),
    }
    head = ("// climb-top-anim.js: written by tools/make-climb-top-anim.py; do not edit by hand.\n"
            "// Her way over a cliff's top (player-climb-top.js): Mixamo's \"Climbing To Top\" (Adobe: free to use in this game,\n"
            "// not CC0) posed again for VRoid bones, and its mirror (climb_top_m: her left hand to the edge). In place: CLIMB_TOP.up\n"
            "// and .along are her root's way, per frame; its hands and feet are said for climb_top (the mirror's: left for right).\n"
            f"//   climb_top  {times[-1]:.2f} s: right hand on the edge {data['hand']['right']}, left on the top {data['hand']['left']}, "
            f"right foot down {data['down']['right'][1]}, left {data['down']['left'][1]}, standing {MOVE}\n")
    path = os.path.join(REPO, "climb-top-anim.js")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(head + "export const CLIMB_TOP_ANIM = " + json.dumps(anim, separators=(",", ":")) + ";\n"
                 + "export const CLIMB_TOP = " + json.dumps(data, separators=(",", ":")) + ";\n")
    print(f"wrote {os.path.relpath(path)} ({os.path.getsize(path) // 1024} KB)")
    # (for looking at: every frame's places, in hips heights, the capture's ground and wall)
    if os.environ.get("CLIMB_TOP_DUMP"):
        np.save(os.environ["CLIMB_TOP_DUMP"], np.array([[P[b] for b in ORDER] for _, _, P in report]))
        with open(os.environ["CLIMB_TOP_DUMP"] + ".bones.json", "w") as f:
            json.dump({"order": ORDER, "parent": {b: sk.parent.get(b) for b in ORDER}, "hh": HH, "wall": WALL_Z, "top": TOP}, f)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
