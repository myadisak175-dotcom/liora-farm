#!/usr/bin/env python3
"""Make the vault she goes over a fence with: vault-anim.js, from Mixamo's "Vault Over Box" and the library's sprint.

Mixamo's "Vault Over Box" is a vault to cover: she runs, plants her left hand, springs up with her right foot on the top
and her left knee drawn up, and then turns right round and lowers herself down the far side, facing the box. Its first
half is the vault wanted; the second is not (she would land with her back to where she was running). Off the top she
leaps on instead, onto her front foot, and runs on, as Genshin's or Assassin's Creed's vaults do:

  A  the vault, from its first frame (running, her right foot down) to A_END: her left hand on the top, her right foot on
     it, her left knee up, her hips at the top of their rise;
  B  the leap off it: the library's sprint (Sprint_Loop, CC0) through its stride in the air, from SPRINT_FROM (her right
     foot just off the ground, her left knee coming through) to SPRINT_TOUCH (her left foot down ahead of her), played
     slower: in the time a fall from the vault's top takes under real gravity (G). Out of the vault her left leg is
     already ahead and her right behind on the top, as in that stride. Her trailing (right) leg is taken from later in
     the sprint (from TRAIL_FROM), its heel kicked up behind her, so it comes up off the top and over it, not down
     through it, as a hurdler's trailing leg does. A's last poses go over into it in BLEND seconds
     (her arms more slowly, in ARMS); while her right foot is still on the top she is driven forward, from the vault's
     pace to the sprint's (PUSH seconds), and then flies at that pace;
  C  her stride on: the sprint from that touch, RUN_ON seconds of it, so the game goes over into her run (the same
     sprint) without a seam: VAULT.runPhase is where in the sprint it is as she lands.

The clip is in place: her way over the ground (her hips' travel forward) is taken out of it and written beside it
(VAULT.along), for the game to move her by. Her hips' height is left in: it is over a flat ground with a top at
VAULT.top, the height the capture's top was (measured on the playable characters' proportions); the game raises her by
how much higher a real top is (player-vault.js), and puts her hand and her right foot on it.

Usage (from the repo folder; needs numpy; the capture made into a .vrma first with tools/mixamo-to-vrma.mjs, kept out
of this repo: Mixamo's clips are not to be handed on as files of their own):
  python3 tools/make-vault-anim.py path/to/Vault_Over_Box.vrma
writes vault-anim.js next to index.html and prints when her hand and feet are on the top or the ground.
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
from vrma_pose import LIB, Skeleton, fitted_skeleton, mat_of, read_floats  # noqa: E402

_spec = importlib.util.spec_from_file_location("bake", os.path.join(HERE, "bake-character-anim.py"))
bake_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bake_mod)

FPS = 30
A_END = 0.80          # s into Vault Over Box: the end of the vault proper
SPRINT = "Sprint_Loop"
SPRINT_FROM = 0.52    # s into the sprint: her right foot just off the ground, her left knee coming through
SPRINT_TOUCH = 0.70   # s into the sprint (past its end: it loops): her left foot down
RUN_ON = 0.40         # s of her stride after she lands
BLEND = 0.16          # s for A's poses to go over into the leap's
ARMS = 0.26           # s for her arms to
PUSH = 0.12           # s her right foot drives her forward off the top
G = 9.8               # m/s² on the library's skeleton (hips at 0.917 m)
TRAIL_FROM = 0.62     # s into the sprint: her trailing (right) leg through the leap, heel kicked up behind, to SPRINT_TOUCH
TRAIL_BONES = ("rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes")
ARM_BONES = ("Shoulder", "UpperArm", "LowerArm", "Hand", "Thumb", "Index", "Middle", "Ring", "Little")


def read(path):
    sk = Skeleton(path)
    anim = sk.js["animations"][0]
    rot, hips, times = {}, None, None
    for ch in anim["channels"]:
        smp = anim["samplers"][ch["sampler"]]
        b = sk.bone.get(ch["target"]["node"])
        if b is None:
            continue
        if times is None:
            times = np.array(read_floats(sk.js, sk.bin, smp["input"])[:, 0], dtype=float)
        v = np.array(read_floats(sk.js, sk.bin, smp["output"]), dtype=float)
        if ch["target"]["path"] == "rotation":
            rot[b] = v
        else:
            hips = v
    for b in sk.node:
        rot.setdefault(b, np.tile([0.0, 0.0, 0.0, 1.0], (len(times), 1)))
    return sk, times, rot, hips


def qnorm(q):
    return q / np.linalg.norm(q)


def slerp(a, b, t):
    if np.dot(a, b) < 0:
        b = -b
    d = min(1.0, float(np.dot(a, b)))
    if d > 0.9995:
        return qnorm(a + (b - a) * t)
    th = math.acos(d)
    return qnorm((math.sin((1 - t) * th) * a + math.sin(t * th) * b) / math.sin(th))


def sample(times, track, t, loop=False):
    """A track (frames x n) at time t, linearly (quaternions: slerp); a loop wraps round."""
    if loop:
        t = t % times[-1]
    t = min(max(t, times[0]), times[-1])
    i = min(int(np.searchsorted(times, t, side="right")) - 1, len(times) - 2)
    u = (t - times[i]) / (times[i + 1] - times[i])
    a, b = track[i], track[i + 1]
    return slerp(a, b, u) if track.shape[1] == 4 else a + (b - a) * u


def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def fk(sk, pose, hips):
    """World places of every bone for one frame's turns (dict bone -> quaternion) and hips place."""
    W, P = {}, {}

    def visit(b):
        if b in W:
            return
        p = sk.parent.get(b)
        if p:
            visit(p)
        m = mat_of(pose[b])
        if p is None:
            W[b], P[b] = m, np.array(hips, dtype=float)
        else:
            W[b], P[b] = W[p] @ m, P[p] + W[p] @ sk.offset[b]
    for b in sk.node:
        visit(b)
    return W, P


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    skA, tA, rotA, hipsA = read(argv[1])
    _, tS, rotS, hipsS = read(os.path.join(LIB, f"{SPRINT}.vrma"))
    bones = list(skA.node)
    fit, hh, count = fitted_skeleton()                                   # the playable characters' proportions

    def poseA(t):
        return {b: sample(tA, rotA[b], t) for b in bones}

    def poseS(t):
        return {b: sample(tS, rotS[b], t, loop=True) for b in bones}

    # the sprint's own pace over the ground (as the game plays it: hips heights a second) and its hips at the touch
    v_run = bake_mod.CLIPS[[c[0] for c in bake_mod.CLIPS].index("run")][3] * hh     # m/s on the library's skeleton
    yT = sample(tS, hipsS, SPRINT_TOUCH, loop=True)[1]
    # where A leaves off: hips' place and pace
    hA = sample(tA, hipsA, A_END)
    yA, zA, xA = hA[1], hA[2], hA[0]
    vyA = (sample(tA, hipsA, A_END + 0.02)[1] - sample(tA, hipsA, A_END - 0.02)[1]) / 0.04
    vzA = (sample(tA, hipsA, A_END + 0.02)[2] - sample(tA, hipsA, A_END - 0.02)[2]) / 0.04
    # the leap: falling from A's hips to the sprint's at its touch, under G
    T = (vyA + math.sqrt(vyA * vyA + 2 * G * (yA - yT))) / G

    def forward(s):
        """Her hips' travel s seconds after A_END: driven from A's pace to the sprint's while her foot is on the top, then on at it."""
        n, z = 40, 0.0
        ds = s / n
        for i in range(n):
            z += (vzA + (v_run - vzA) * smooth((i + 0.5) * ds / PUSH)) * ds
        return z

    frames = int(round((A_END + T + RUN_ON) * FPS)) + 1
    times = np.arange(frames) / FPS
    out = {b: [] for b in bones}
    hips = []
    held = poseA(A_END + BLEND)                                          # her arms as the vault leaves them
    zT = zA + forward(T)
    for t in times:
        if t <= A_END + 1e-9:
            pose, hp = poseA(t), sample(tA, hipsA, t)
        elif t <= A_END + T + 1e-9:
            s = t - A_END
            u = s / T
            pb = poseS(SPRINT_FROM + (SPRINT_TOUCH - SPRINT_FROM) * u)
            trail = poseS(TRAIL_FROM + (SPRINT_TOUCH - TRAIL_FROM) * u)
            for b in TRAIL_BONES:
                pb[b] = trail[b]
            pa = poseA(t)
            w, wa = smooth(s / BLEND), smooth(s / ARMS)
            pose = {}
            for b in bones:
                arm = any(k in b for k in ARM_BONES)
                pose[b] = slerp(slerp(pa[b], held[b], w) if arm else pa[b], pb[b], wa if arm else w)
            sx = sample(tS, hipsS, SPRINT_FROM + (SPRINT_TOUCH - SPRINT_FROM) * u, loop=True)[0]
            hp = np.array([xA + (sx - xA) * smooth(u), yA + vyA * s - 0.5 * G * s * s, zA + forward(s)])
        else:
            r = t - A_END - T
            st = SPRINT_TOUCH + r
            pose = poseS(st)
            hs = sample(tS, hipsS, st, loop=True)
            hp = np.array([hs[0], hs[1], zT + v_run * r])
        for b in bones:
            q = pose[b]
            if out[b] and np.dot(out[b][-1], q) < 0:
                q = -q
            out[b].append(q)
        hips.append(hp)
    hips = np.array(hips)
    along = hips[:, 2] - hips[0, 2]
    hips[:, 2] = 0.0                                                         # in place: the game moves her along

    # ---- where her hand and feet are, on the playable characters: what the game puts on the top
    P = []
    for f in range(frames):
        _, p = fk(fit, {b: out[b][f] for b in bones}, hips[f] + np.array([0, 0, along[f]]))
        P.append(p)
    palm = np.array([p["leftMiddleProximal"] for p in P])
    toeR = np.array([p["rightToes"] for p in P])
    toeL = np.array([p["leftToes"] for p in P])
    ground = float(min(toeL[:, 1].min(), toeR[:, 1].min()))
    sole = 0.025                                                             # toe joint over the sole, palm joint over the hand's underside (m, library)
    hand_at = int(round(0.45 * FPS))
    foot_at = int(round(0.76 * FPS))
    top = float(toeR[foot_at][1] - sole)                                     # the top she steps on
    off_ground = next(f for f in range(int(0.3 * FPS), frames) if toeL[f][1] > ground + 0.06) / FPS
    touch = A_END + T
    tf = int(round(touch * FPS))
    unit = 1.0 / hh                                                          # metres -> hips heights

    print(f"A 0-{A_END:.2f} s of Vault Over Box; B the sprint {SPRINT_FROM:.2f}-{SPRINT_TOUCH:.2f} s in {T:.2f} s "
          f"(x{(SPRINT_TOUCH - SPRINT_FROM) / T:.2f}); C {RUN_ON:.2f} s of the sprint. {frames} frames, {times[-1]:.2f} s")
    print(f"her hips at A's end {yA:.2f} m, rising {vyA:+.2f} m/s, forward {vzA:.2f} m/s; at the touch {yT:.2f} m, forward {v_run:.2f} m/s")
    print(f"fitted on {count} characters: top {top:.3f} m ({top * unit:.3f} hips heights); palm at {palm[hand_at][1]:.3f} m; "
          f"left foot off the ground at {off_ground:.2f} s; down at {touch:.2f} s, left toes at {toeL[tf][1]:.3f} m (ground {ground:.3f})")
    print("   t    along   hips y   palm (y, along)   right toes (y, along)   left toes (y, along)")
    for f in range(0, frames, 2):
        print(f"  {times[f]:.2f}  {along[f]:5.2f}   {hips[f][1]:5.2f}    {palm[f][1]:5.2f} {palm[f][2]:5.2f}       {toeR[f][1]:5.2f} {toeR[f][2]:5.2f}            {toeL[f][1]:5.2f} {toeL[f][2]:5.2f}")

    clip = {"times": list(times), "rot": {b: [tuple(q) for q in out[b]] for b in bones}, "hips": [tuple(h) for h in hips],
            "rest_hips": [0.0, hh, 0.0]}
    tracks, hips_flat, n = bake_mod.bake(clip)
    anim = {"fps": FPS, "forwardYaw": 3.1416, "hipsBone": "J_Bip_C_Hips", "hipsUnit": "hipsHeight",
            "clips": {"vault": {"duration": round(float(times[-1]), 4), "frames": n, "loop": False, "speed": 0.0,
                                "tracks": tracks, "hips": hips_flat}}}
    r = lambda v: round(float(v), 4)
    data = {
        "along": [r(a * unit) for a in along],                                # hips heights forward, per frame (30 a second)
        "top": r(top * unit),                                                 # the top in the clip, over its ground
        "hand": {"from": 0.42, "to": r(A_END + BLEND * 0.5), "at": r(hand_at / FPS),
                 "along": r(palm[hand_at][2] * unit), "y": r(palm[hand_at][1] * unit)},
        "foot": {"from": 0.70, "to": r(A_END + PUSH), "at": r(foot_at / FPS),
                 "along": r(toeR[foot_at][2] * unit), "y": r(toeR[foot_at][1] * unit)},
        "offGround": r(off_ground), "push": A_END, "touch": r(touch),
        "landAlong": r(toeL[tf][2] * unit),                                   # her left toes as she lands
        "sole": r(sole * unit),
        "runPhase": r(SPRINT_TOUCH % tS[-1]),                                 # where in the sprint (the game's run) she is as she lands
        "runPace": r(v_run * unit),                                           # its pace, hips heights a second
    }
    head = ("// vault-anim.js: written by tools/make-vault-anim.py; do not edit by hand.\n"
            "// Her vault over a fence (player-vault.js): Mixamo's \"Vault Over Box\" to the top, then a leap off it onto her\n"
            "// front foot and her stride on (the library's sprint), made for VRoid bones. In place: VAULT.along is how far she goes, per frame.\n"
            f"//   vault  {times[-1]:.2f} s: hand on the top {data['hand']['from']}-{data['hand']['to']} s, right foot on it {data['foot']['from']}-{data['foot']['to']} s, "
            f"off it at {A_END} s, down at {data['touch']} s\n")
    path = os.path.join(REPO, "vault-anim.js")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(head + "export const VAULT_ANIM = " + json.dumps(anim, separators=(",", ":")) + ";\n"
                 + "export const VAULT = " + json.dumps(data, separators=(",", ":")) + ";\n")
    print(f"wrote {os.path.relpath(path)} ({os.path.getsize(path) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
