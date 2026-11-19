#!/usr/bin/env python3
"""Make the vault she goes over a fence with, from two Mixamo motion captures: vault-anim.js.

Mixamo's "Vault Over Box" is a vault to cover: she runs, plants her left hand, springs up with her right foot on the top
and her left knee drawn up, and then turns right round and lowers herself down the far side, facing the box. The first
half is the vault wanted; the second is not (she would land with her back to where she was running). Mixamo's "Jumping
Down" is a jump forward off a ledge a metre high, and a landing. The vault is made of the two:

  A  the vault, from its first frame (running, her right foot down) to A_END: her left hand on the top, her right foot on
     it, her left knee up, her hips at the top of their rise;
  B  the flight down off it: Jumping Down from B_FROM (just off the ledge, at the top of the jump) to the frame its feet
     touch the ground, turned over left for right (it leads with its right leg; out of the vault her left leg is ahead),
     and played faster, in the time a fall from the vault's top takes under real gravity (G): the capture fell from a
     ledge higher than a fence and jumped up first. A's last poses go over into B's in BLEND seconds. Her pace forward
     grows from the vault's to V_LAND as she pushes off the top (Jumping Down drops almost straight down). Her arms are
     not Jumping Down's (it flings its arms up and wide as it falls): they stay as the vault left them, forward and low,
     through the flight, and go over to the landing's in the first ARMS_DOWN seconds she is down;
  C  the landing: Jumping Down from that touch on, at its own pace, to C_END (her knees taking it, then rising).

Her body turns as Jumping Down's did as it fell (to her right, after the turn over): no more than YAW_LEFT of it is kept
by the time she lands, the rest turned back through the flight, so she lands facing nearly the way she ran.

The clip is in place: her way over the ground (her hips' travel forward) is taken out of it and written beside it
(VAULT.along), for the game to move her by. Her hips' height is left in: it is over a flat ground with a top at
VAULT.top, the height the capture's top was (measured on the playable characters' proportions); the game raises her by
how much higher a real top is (player-vault.js), and puts her hand and her right foot on it.

Usage (from the repo folder; needs numpy; the two captures made into .vrma first with tools/mixamo-to-vrma.mjs, kept
out of this repo: Mixamo's clips are not to be handed on as files of their own):
  python3 tools/make-vault-anim.py path/to/Vault_Over_Box.vrma path/to/Jumping_Down.vrma
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
from vrma_pose import Skeleton, fitted_skeleton, mat_of, quat_of, read_floats, ry  # noqa: E402

_spec = importlib.util.spec_from_file_location("bake", os.path.join(HERE, "bake-character-anim.py"))
bake_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bake_mod)

FPS = 30
A_END = 0.80          # s into Vault Over Box: the end of the vault proper
B_FROM = 0.97         # s into Jumping Down: off the ledge, at the top of its jump
C_END = 2.30          # s into Jumping Down: risen from the landing
BLEND = 0.14          # s for A's poses to go over into B's
G = 9.8               # m/s² on the library's skeleton (hips at 0.917 m)
YAW_LEFT = 12.0       # degrees of Jumping Down's turn kept by the landing
ARMS_DOWN = 0.35      # s after she lands for her arms to go over from the vault's to the landing's
ARM_BONES = ("Shoulder", "UpperArm", "LowerArm", "Hand", "Thumb", "Index", "Middle", "Ring", "Little")
V_LAND = 2.6          # m/s forward as she lands: she pushes off the top forward and runs on (Jumping Down lands almost still)


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


def sample(times, track, t):
    """A track (frames x n) at time t, linearly (quaternions: slerp)."""
    t = min(max(t, times[0]), times[-1])
    i = min(int(np.searchsorted(times, t, side="right")) - 1, len(times) - 2)
    u = (t - times[i]) / (times[i + 1] - times[i])
    a, b = track[i], track[i + 1]
    return slerp(a, b, u) if track.shape[1] == 4 else a + (b - a) * u


def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def swap(b):
    return "right" + b[4:] if b.startswith("left") else "left" + b[5:] if b.startswith("right") else b


def mirrored(rot, hips):
    """Left for right: each bone takes its other side's turns, reflected through her middle (x -> -x)."""
    out = {}
    for b in rot:
        q = rot[swap(b)].copy()
        q[:, 1] *= -1
        q[:, 2] *= -1
        out[b] = q
    h = hips.copy()
    h[:, 0] *= -1
    return out, h


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


def yaw_of(q):
    f = mat_of(q) @ np.array([0.0, 0.0, 1.0])
    return math.degrees(math.atan2(f[0], f[2]))


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    skA, tA, rotA, hipsA = read(argv[1])
    skJ, tJ, rotJ0, hipsJ0 = read(argv[2])
    rotJ, hipsJ = mirrored(rotJ0, hipsJ0)
    bones = list(skA.node)
    fit, hh, count = fitted_skeleton()                                   # the playable characters' proportions

    def poseA(t):
        return {b: sample(tA, rotA[b], t) for b in bones}

    def poseJ(t):
        return {b: sample(tJ, rotJ[b], t) for b in bones}

    # Jumping Down's touch: the first frame after the top of its jump with a foot at the ground (its lowest toes, standing after)
    toes = []
    for f, t in enumerate(tJ):
        _, P = fk(fit, {b: rotJ[b][f] for b in bones}, hipsJ[f])
        toes.append(min(P["leftToes"][1], P["rightToes"][1]))
    ground = min(toes[int(1.9 * FPS):int(2.3 * FPS)])
    touch = next(t for f, t in enumerate(tJ) if t > B_FROM + 0.2 and toes[f] < ground + 0.03)
    # where A leaves off: hips' place and pace
    yA, vyA = sample(tA, hipsA, A_END)[1], (sample(tA, hipsA, A_END + 0.02)[1] - sample(tA, hipsA, A_END - 0.02)[1]) / 0.04
    zA, vzA = sample(tA, hipsA, A_END)[2], (sample(tA, hipsA, A_END + 0.02)[2] - sample(tA, hipsA, A_END - 0.02)[2]) / 0.04
    xA = sample(tA, hipsA, A_END)[0]
    hJ = sample(tJ, hipsJ, touch)
    yT = hJ[1]
    vzT = max(V_LAND, vzA)
    # the fall: from A's hips to Jumping Down's at its touch, under G
    T = (vyA + math.sqrt(vyA * vyA + 2 * G * (yA - yT))) / G
    # her turn through the flight: Jumping Down's hips at its touch (turned over) less YAW_LEFT, turned back
    yawT = yaw_of(sample(tJ, rotJ["hips"], touch))
    turn = math.radians(-(yawT - math.copysign(min(abs(yawT), YAW_LEFT), yawT)))

    arms_end = poseA(A_END + BLEND)                                      # her arms as the vault leaves them
    frames = int(round((A_END + T + (C_END - touch)) * FPS)) + 1
    times = np.arange(frames) / FPS
    out = {b: [] for b in bones}
    hips = []
    xT = None
    for f, t in enumerate(times):
        if t <= A_END + 1e-9:
            pose, hp = poseA(t), sample(tA, hipsA, t)
        elif t <= A_END + T + 1e-9:
            s = t - A_END
            u = s / T
            pb = poseJ(B_FROM + (touch - B_FROM) * u)
            yaw = turn * smooth(u)
            pb["hips"] = quat_of(ry(yaw) @ mat_of(pb["hips"]))
            pa = poseA(t)
            w = smooth(s / BLEND)
            pose = {b: slerp(pa[b], pb[b], w) for b in bones}
            # her arms: Jumping Down flings one up over her head as it falls; out of a vault they stay forward and low as
            # the vault left them, going over into the landing's only as she comes down
            held = poseA(A_END + min(s, BLEND))
            for b in bones:
                if any(k in b for k in ARM_BONES):
                    pose[b] = held[b]
            z = zA + vzA * s + (vzT - vzA) * s * s / (2 * T)              # its pace forward eased from A's to the landing's
            hp = np.array([xA * (1 - smooth(u)), yA + vyA * s - 0.5 * G * s * s, z])
        else:
            tj = touch + (t - A_END - T)
            pose = poseJ(tj)
            pose["hips"] = quat_of(ry(turn) @ mat_of(pose["hips"]))
            wa = smooth((tj - touch) / ARMS_DOWN)
            for b in bones:
                if any(k in b for k in ARM_BONES):
                    pose[b] = slerp(arms_end[b], pose[b], wa)
            d = sample(tJ, hipsJ, tj) - hJ                                  # Jumping Down's own travel since its touch, turned with her
            d = ry(turn) @ d
            if xT is None:
                zT = zA + vzA * T + (vzT - vzA) * T / 2
                xT = 0.0
            hp = np.array([xT + d[0], sample(tJ, hipsJ, tj)[1], zT + d[2]])
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
    sole = 0.025                                                             # toe joint over the sole, palm joint over the hand's underside (m, library)
    hand_at = int(round(0.45 * FPS))
    foot_at = int(round(0.76 * FPS))
    top = float(toeR[foot_at][1] - sole)                                     # the top she steps on
    off_ground = next(f for f in range(int(0.3 * FPS), frames) if toeL[f][1] > ground + 0.06) / FPS
    touch_c = A_END + T
    unit = 1.0 / hh                                                          # metres -> hips heights

    print(f"A 0-{A_END:.2f} s of Vault Over Box; B Jumping Down {B_FROM:.2f}-{touch:.2f} s in {T:.2f} s (x{(touch - B_FROM) / T:.2f}); "
          f"C {touch:.2f}-{C_END:.2f} s. {frames} frames, {times[-1]:.2f} s")
    print(f"her hips at A's end {yA:.2f} m, rising {vyA:+.2f} m/s, forward {vzA:.2f} m/s; at the touch {yT:.2f} m, forward {vzT:.2f} m/s; turned back {math.degrees(turn):+.0f} deg")
    print(f"fitted on {count} characters: top {top:.3f} m ({top * unit:.3f} hips heights); palm at {palm[hand_at][1]:.3f} m; "
          f"left foot off the ground at {off_ground:.2f} s; touch at {touch_c:.2f} s")
    print("   t    along   hips y   palm (y, along)   right toes (y, along)   left toes (y, along)")
    for f in range(0, frames, 3):
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
        "hand": {"from": 0.42, "to": r(A_END + BLEND * 0.6), "at": r(hand_at / FPS),
                 "along": r(palm[hand_at][2] * unit), "y": r(palm[hand_at][1] * unit)},
        "foot": {"from": 0.70, "to": r(A_END + BLEND * 0.8), "at": r(foot_at / FPS),
                 "along": r(toeR[foot_at][2] * unit), "y": r(toeR[foot_at][1] * unit)},
        "offGround": r(off_ground), "push": A_END, "touch": r(touch_c),
        "landAlong": r(max(toeL[int(round(touch_c * FPS))][2], toeR[int(round(touch_c * FPS))][2]) * unit),
        "sole": r(sole * unit),
    }
    head = ("// vault-anim.js: written by tools/make-vault-anim.py; do not edit by hand.\n"
            "// Her vault over a fence (player-vault.js): Mixamo's \"Vault Over Box\" to the top, then \"Jumping Down\" (turned left\n"
            "// for right) down off it and landing, made for VRoid bones. In place: VAULT.along is how far she goes, per frame.\n"
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
