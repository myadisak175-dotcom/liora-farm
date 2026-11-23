#!/usr/bin/env python3
"""Make her stop after a blink (blink.js: she is there again, and comes to a stop) from Mixamo's "Run To Stop", which the
user sent on 24 Nov 2026 for it ("หลังวาร์ปเสร็จขออนิเมชั่นนี้นะ"), posed again for her:

  Blink_Stop <- Mixamo "Run To Stop"   out of the blink at a run: her left foot comes through and down a long stride
                                      ahead, her right skids up after it, she bends low over her left knee and rises into
                                      her standing pose

It is made .vrma first by tools/mixamo-to-vrma.mjs into assets/animations/mixamo/, which is not in the repo (Mixamo's
moves are Adobe's: free to use in the game, not to hand on as files). What the mocap keeps: its timing (0.9 s), its
arms, back, head and hips' turns, her weight going down into the stop and up out of it, the right foot's skid. What is
posed again, every frame (README, "The animation standard"):

  - Its turn. Stopping, it turns 46 degrees to its right (its hips from 3 to -43 degrees) and ends in a stance that, in
    its own hips' frame, is her standing pose's to two centimetres (her left foot ahead, her right behind and turned
    out), only turned TURN degrees further to her right than she stands. So all of it is turned back to her left by
    TURN, coming in over its first TURN_BY s (her left foot in the air, then her right skidding), about the spot her left
    foot comes down on: that foot does not move once it is down. She ends facing the way she blinked, as she stands.
  - Her feet: each laid by two-bone IK on the playable characters' proportions (tools/vrma_pose.py' fitted skeleton),
    its knee facing the way she faces (knee_pole). Where the mocap has a foot on the ground it is on the ground (her
    standing toes' height), the left held where it came down; the right skids where the mocap's skids and stands
    where it stands. In the air, the mocap's.
  - Its end: over SETTLE s into the idle's first frame (her standing pose). Its stance is hers to a few centimetres (4
    from heel to heel): where she ends standing is put where both her feet are nearest the mocap's, and each goes the
    rest of the way to hers (about 2 cm) as she settles.
  - In place. Her hips stand over her root as the run's do (the library's Sprint_Loop) as it begins and as the idle's
    as it ends, eased between; where her root goes is written beside the clip (BLINK_STOP.path: x to her left and z
    ahead, hips heights, a pair a frame at BLINK_STOP.fps), and the game moves her along it (player-moves.js), so that
    a foot on the ground stays where it is. BLINK_STOP.brake: s into it that she begins to stop (before it, she is
    still running: the stick pushed then, she runs on).

Usage (from the repo folder; needs numpy):
  npm install --no-save three@0.170.0               (once, here or in a folder above it)
  node tools/mixamo-to-vrma.mjs assets/animations/mixamo Run_To_Stop.fbx
  python3 tools/make-blink-stop-anim.py
writes assets/animations/mixamo/Blink_Stop.vrma and bakes blink-stop-anim.js (tools/bake-character-anim.py), the clip
`blink_stop` and BLINK_STOP.
"""
import importlib.util
import json
import math
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_spec = importlib.util.spec_from_file_location("mj", os.path.join(HERE, "make-magic-jump-mocap.py"))
mj = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mj)                       # (its clips are made only when it is run; here: its helpers)
from vrma_pose import LIB, REPO, quat_of, ry, slerp_m, write_vrma  # noqa: E402

SRC = os.path.join(mj.MOCAP, "Run_To_Stop.vrma")
NAME = "Blink_Stop"
OUT_JS = os.path.join(REPO, "blink-stop-anim.js")
FPS = 30                 # frames a second (as the game's clips are baked)
TURN = 30.0              # degrees it is turned back to her left by its end (it ends turned 30 degrees past her standing pose)
TURN_BY = 0.32           # s over which that turn comes in (eased)
PLANT = 0.2              # the mocap's time her left foot is down (and stays: it moves 0.25 mm a frame from here on)
BRAKE = 0.12             # s in that she begins to stop: her hips go down, her left foot reaching for the ground
DOWN = 0.03              # a toe of the mocap's lower than this over its lowest is on the ground (higher, its left foot
                         # is still coming down onto its spot: on the ground any sooner, it slid 9 cm into it)
BLEND = 0.03             # ... and between that and this much more, it is going up or coming down: eased between
SETTLE = 0.25            # s from the mocap's end into her standing pose

LEFT, RIGHT = "left", "right"


def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def main():
    if not os.path.exists(SRC):
        raise SystemExit(f"no Run_To_Stop.vrma in {mj.MOCAP}: make it first with tools/mixamo-to-vrma.mjs (see above)")
    src = mj.Clip(SRC)
    run = mj.Clip(os.path.join(LIB, "Sprint_Loop.vrma"))
    end = float(src.times[-1])
    sk, HH = mj.sk, mj.HH
    ground = {s: float(mj.IDLE_P[f"{s}Toes"][1]) for s in (LEFT, RIGHT)}       # her toes' height as she stands
    # her hips over her root: the run's as it begins, the idle's as it ends
    h_run = np.array([float(np.mean(run.hips[:, 0])), 0.0, float(np.mean(run.hips[:, 2]))])
    h_idle = np.array([mj.IDLE_HIPS[0], 0.0, mj.IDLE_HIPS[2]])
    # the mocap's toes over its whole length: how low each goes (on the ground)
    lows = {}
    for s in (LEFT, RIGHT):
        ys = [mj.fk(*src.at(float(t)))[1][f"{s}Toes"][1] for t in src.times]
        lows[s] = min(ys)
    # the spot her left foot comes down on: the turn is about it
    _, P_plant = mj.fk(*src.at(PLANT))
    pivot = np.array([P_plant["leftToes"][0], 0.0, P_plant["leftToes"][2]])
    n_src = int(round(end * FPS))
    n = n_src + int(round(SETTLE * FPS)) + 1
    total = n_src / FPS
    frames, path, report = [], [], {"short": 0.0, "slide": {LEFT: 0.0, RIGHT: 0.0}, "lowest": 9.0}
    last, prev_toes, root0 = None, None, None
    for i in range(n):
        t = i / FPS
        if i <= n_src:
            L, h = src.at(min(t, end))
            R, P = mj.fk(L, h)
            # turned back to her left about where her left foot comes down
            c = math.radians(TURN) * smooth(t / TURN_BY)
            Rc = ry(c)
            R = {b: Rc @ R[b] for b in R}
            P = {b: pivot + Rc @ (P[b] - pivot) for b in P}
            # where her feet go: on the ground where the mocap's are (the left held where it came down), else the mocap's
            targets = {}
            for s in (LEFT, RIGHT):
                toe = P[f"{s}Toes"].copy()
                y0 = toe[1] - lows[s]                                    # (over the mocap's lowest: the turn keeps heights)
                down = 1.0 - smooth((y0 - DOWN) / BLEND)
                toe[1] = ground[s] * down + max(ground[s], ground[s] + y0) * (1 - down)
                if s == LEFT and t >= PLANT:
                    toe[0], toe[2] = pivot[0], pivot[2]
                targets[s] = (toe, R[f"{s}Foot"])
            # in place: her hips over her root, eased from the run's to the idle's; her root goes where her hips go, less that
            hw = P["hips"].copy()
            rel = h_run + (h_idle - h_run) * smooth(t / total)
            root = np.array([hw[0] - rel[0], 0.0, hw[2] - rel[2]])
            if root0 is None:
                root0 = root.copy()
            hp = np.array([rel[0], hw[1], rel[2]])
            shift = hp - hw                                           # (all of her moved by as much: her root to 0)
            R2, P2 = mj.fk(mj.locals_from(R), hp)
            for s in (LEFT, RIGHT):
                toe, Rf = targets[s]
                report["short"] = max(report["short"], mj.lay_leg(R2, P2, s, Rf, toe + shift, mj.knee_pole(R2, s, Rf)))
            last = (mj.locals_from(R2), hp, {s: targets[s][0] + shift for s in (LEFT, RIGHT)}, {s: targets[s][1] for s in (LEFT, RIGHT)})
            frames.append((last[0], hp))
            path.append(((root - root0)[0], (root - root0)[2]))
            world_toes = {s: P2[f"{s}Toes"] - shift for s in (LEFT, RIGHT)}
        else:
            # into her standing pose. Where she ends standing (her root): where both her feet are nearest the mocap's
            # (their mean); each foot goes the rest of the way to where her standing pose has it as she settles
            Le, he, te, fe = last
            if i == n_src + 1:
                root_end = root0 + np.array([path[-1][0], 0.0, path[-1][1]])
                feet_w = {s: te[s] + root_end for s in (LEFT, RIGHT)}
                root_fin = sum(feet_w[s] - mj.IDLE_P[f"{s}Toes"] for s in (LEFT, RIGHT)) / 2
                root_fin[1] = 0.0
            u = smooth((t - total) / SETTLE)
            L = {b: slerp_m(Le[b], mj.IDLE_L[b], u) for b in sk.node}
            hp = he + (mj.IDLE_HIPS - he) * u
            root = root_end + (root_fin - root_end) * u
            R2, P2 = mj.fk(L, hp)
            for s in (LEFT, RIGHT):
                toe_w = feet_w[s] + (root_fin + mj.IDLE_P[f"{s}Toes"] - feet_w[s]) * u
                Rf = slerp_m(fe[s], mj.IDLE_R[f"{s}Foot"], u)
                report["short"] = max(report["short"], mj.lay_leg(R2, P2, s, Rf, toe_w - root, mj.knee_pole(R2, s, Rf)))
            frames.append((mj.locals_from(R2), hp))
            path.append(((root - root0)[0], (root - root0)[2]))
            world_toes = {s: P2[f"{s}Toes"] + root for s in (LEFT, RIGHT)}
        # how far a foot on the ground moves in a frame (in the world: her root moved along its path)
        if prev_toes is not None:
            for s in (LEFT, RIGHT):
                if world_toes[s][1] < ground[s] + 0.01 and prev_toes[s][1] < ground[s] + 0.01:
                    d = float(np.hypot(*(world_toes[s] - prev_toes[s])[[0, 2]]))
                    if not (s == RIGHT and t < 0.4):                       # (the right foot's skid is the mocap's own)
                        report["slide"][s] = max(report["slide"][s], d)
        prev_toes = world_toes
        report["lowest"] = min(report["lowest"], float(hp[1]))
    # write it, and bake it
    times = np.arange(len(frames)) / FPS
    rot = {b: [] for b in sk.node}
    hips = []
    for L, h in frames:
        for b in sk.node:
            q = quat_of(L[b])
            if rot[b] and np.dot(rot[b][-1], q) < 0:
                q = -q
            rot[b].append(q)
        hips.append(h)
    out = os.path.join(mj.MOCAP, f"{NAME}.vrma")
    write_vrma(out, sk, times, {b: np.array(v) for b, v in rot.items()}, np.array(hips), NAME, "liora-farm tools/make-blink-stop-anim.py")
    subprocess.run([sys.executable, os.path.join(HERE, "bake-character-anim.py"), mj.MOCAP, OUT_JS, f"blink_stop:{NAME}"], check=True)
    with open(OUT_JS, encoding="utf-8") as f:
        text = f.read().replace("posed again by tools/make-magic-jump-mocap.py", "posed again by tools/make-blink-stop-anim.py")
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write(text)
    flat = [round(float(v) / HH, 4) for xz in path for v in xz]
    stop = {"fps": FPS, "duration": round(float(times[-1]), 4), "brake": BRAKE, "path": flat}
    with open(OUT_JS, "a", encoding="utf-8") as f:
        f.write("// her stop's root: where she goes as it plays (x to her left, z ahead, hips heights, a pair a frame at fps); brake: s in\n"
                "// that she begins to stop (tools/make-blink-stop-anim.py)\n"
                "export const BLINK_STOP = " + json.dumps(stop, separators=(",", ":")) + ";\n")
    far = path[-1]
    print(f"{out}: {times[-1]:.3f} s ({end:.2f} s of the mocap, {SETTLE} s settling); she goes {far[1] / HH:.3f} hips heights on "
          f"({far[1]:.3f} m of the library's) and {far[0] / HH:+.3f} to her left; hips from {hips[0][1]:.3f} down to "
          f"{report['lowest']:.3f} and up to {hips[-1][1]:.3f} (standing {mj.IDLE_HIPS[1]:.3f}); a foot short of where it is laid "
          f"by {report['short'] * 1000:.0f} mm at most; a foot on the ground moves {report['slide'][LEFT] * 1000:.1f} mm (left) and "
          f"{report['slide'][RIGHT] * 1000:.1f} mm (right, after its skid) in a frame at most")


if __name__ == "__main__":
    main()
