#!/usr/bin/env python3
"""Make the magic jump's flow (magic-jump.js, step: 'flow'; tried on magic-jump.html) into magic-jump-flow-anim.js: the
user's own set of four jumps, each a move of its own, from Quaternius' Universal Animation Library 2 (CC0). The user
chose the moves (five clips, put on KinemIQ's UAL mannequin and exported through Verge3D; made .vrma for the library by
tools/ual_to_vrma.py --bind, which takes their T-pose from the skin's bind pose) and what each jump should be:

  "Step 1: กระโดดถีบขึ้นตรง          a jump kicked straight up
   Step 2: บิดตัวถีบเฉียง             a twist, and a kick out on the slant
   Step 3: บิดสะโพกกลางอากาศแล้วดีดตัว   a twist of the hips in the air, and a spring
   Step 4: กระโดดพลิกตัวอย่างสง่างาม     a graceful flip, to end the set
   ไม่มีการโจมตี เน้นความพลิ้วไหว การเคลื่อนไหว และความสวยงามของท่ากระโดด"   (no attacks: flowing, moving, beautiful)

  (Step 1 is the game's own jump off the ground, as it is: the user found it prettier than the library's double jump,
  Jump_Double, which followed the take-off at first, from its kick: its legs driven down, both knees snatched up)
  mjf_2    <- Jump_Spin          Step 2: the double jump turned once round in the air, her arms drawn in for the turn
                                 and opened out as it ends (made from Jump_Double by tools/make-jump-spin-anim.py). The
                                 user's own Step 2 was a twist and a kick out on the slant, Jump_OffWall_R (a jump off a
                                 wall on her right, from where she is gathered); tried, and the user found the kick out
                                 to the side not pretty and asked for another move, not a kick ("ท่าถีบข้างไม่สวย หาท่าใหม่
                                 ค่ะ ไม่ต้องถีบข้างก็ได้"). Jump_OffWall_R stays in the library
  mjf_3    <- NinjaJump_Double   Step 3: out of a tuck her legs driven down, then the knees drawn up again with her hips
                                 turned (15 degrees) under her: the ninja's double jump
  mjf_3b   <- Mixamo "Jump"     Step 3, a trial (the user's "Jump_1.fbx": "ลองอันนี้หน่อยเป็น step 3 ตัดเอาท่อนที่ต่อกันสวยๆ", try
              (Jump_1)           it as Step 3, cut where it joins on prettily): only its time in the air, from the arms
                                 swung through and the legs nearly long (the crouch before left out) to the right leg
                                 driven down long (the kick), the right knee up, then the legs changing over, the left
                                 long and the right knee up, the arms opening out (the landing after left out). Mixamo's
                                 (Adobe's: free to use in a game, not CC0): made .vrma by tools/mixamo-to-vrma.mjs into
                                 assets/animations/mixamo/, which is not in the repo; this tool reads it from there
  mjf_4    <- Jog_Into_Flip      Step 4: the front flip off a run: from the push (the jog's strides left out), long and
                                 stretched out ahead, over head first, round, and upright with her legs reaching down
                                 (the run's landing left out: in the game she has further to fall)
  mjf_land <- NinjaJump_Land     the landing out of them (the library's own, which the user's "Jump - ninja landing" is):
                                 from where her feet are down, a crouch and up into standing
  mjf_dash <- Mixamo "Jump      the dash in the air (magic-jump.js, air.dash; a trial), joined from two of the user's
              Over" + "Flying"   Mixamo moves (JOINS): "Jump Over"'s dive off its feet ("Jump เป็นท่าพุ่งถีบกำแพงก่อนท่า
                                 บิน", the kick off before the flying), from gathered (its run before left out), pushing
                                 (KICK: her legs long under her), stretched out ahead, flat; then its arms swept out round
                                 her sides (through her T-pose: not through her body) into "Flying"'s ("ทำเป็นท่าพุ่งตอน
                                 กระโดดได้ไหม"): flat out, head first, her arms back along her sides, her legs long behind
                                 her (Flying is that pose held, swaying a little; Jump Over's roll after the dive left out)
  mjf_fall2 <- MJ_Fall2,        the landing out of the dash, from the user's Mixamo "Falling To Landing" (its 2nd: "แลนดิ้ง
  mjf_land2 <- MJ_Land2          สวยๆ ตามที่ส่งไป"), posed again by tools/make-magic-jump-mocap.py (land2): its time in the
                                 air (arms out wide, a knee up, then both legs reaching down), in place, and on the ground
                                 (a deep crouch, her shoulders turned far round and back, and up into her standing pose)

Each is cut (FROM..TO frames, at 30 a second) and, but for the landing, played in place: the game moves her up and over
the ground (magic-jump.js), so her hips are held where they stand (the library's hips, one hips height up) and only her
body turns about them; the landing keeps its own hips, her feet on the ground. KICK is the frame her legs are straightest
under her: magic-jump.js keeps her on the circle until then (the clip's time into the cut: KICK - FROM frames). Printed.

Usage (from the repo folder; needs numpy; mjf_3b, mjf_dash, mjf_fall2 and mjf_land2 need the user's Mixamo moves
first: node tools/mixamo-to-vrma.mjs assets/animations/mixamo Jump_1.fbx Flying.fbx Jump_Over.fbx
Falling_To_Landing_2.fbx, then python3 tools/make-magic-jump-mocap.py land2):
  python3 -I tools/make-magic-jump-flow.py
writes magic-jump-flow-anim.js next to index.html (by tools/bake-character-anim.py).
"""
import importlib.util
import os
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import vrma_pose  # noqa: E402
from vrma_pose import write_vrma  # noqa: E402

MIXAMO = os.path.join(REPO, "assets", "animations", "mixamo")


def read_clip(name):
    """A clip of the library's, or of the Mixamo folder's ("mixamo:Name", not in the repo)."""
    folder, _, clip = name.rpartition(":")
    if folder != "mixamo":
        return vrma_pose.read_clip(name)
    lib, vrma_pose.LIB = vrma_pose.LIB, MIXAMO
    try:
        return vrma_pose.read_clip(clip)
    finally:
        vrma_pose.LIB = lib

FPS = 30
# game name, library clip, FROM, KICK, TO (frames), in place
CUTS = [
    ("mjf_2", "Jump_Spin", 2, 3, 25, True),
    ("mjf_3", "NinjaJump_Double", 1, 4, 26, True),
    ("mjf_3b", "mixamo:Jump_1", 16, 19, 31, True),
    ("mjf_4", "Jog_Into_Flip", 4, 6, 24, True),
    ("mjf_land", "NinjaJump_Land", 2, 2, 38, False),
    ("mjf_fall2", "mixamo:MJ_Fall2", 0, 0, 8, False),
    ("mjf_land2", "mixamo:MJ_Land2", 0, 0, 28, False),
]
# moves joined from more than one clip: game name, its parts (clip, FROM, TO frames), how many of each later part's first
# frames it is blended in over (from the part before's last), KICK (a frame of the whole); in place
JOINS = [
    ("mjf_dash", [("mixamo:Jump_Over", 12, 24), ("mixamo:Flying", 0, 12)], 6, 4),
]
# (blended through her T-pose: an arm going from ahead of her to back at her side goes round out to her side, not
# through her body)
ARMS = ("leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm")


def qslerp(a, b, t):
    """The shorter way from quaternion a to b, t of the way ([x, y, z, w])."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = float(np.dot(a, b))
    if d < 0:
        b, d = -b, -d
    if d > 0.9995:
        q = a + (b - a) * t
        return q / np.linalg.norm(q)
    th = np.arccos(min(1.0, d))
    return (np.sin((1 - t) * th) * a + np.sin(t * th) * b) / np.sin(th)


def joined(parts, blend):
    """The parts one after another, each blended in from the last frame of the one before (ARMS through T-pose)."""
    sk, rot = None, None
    ident = np.array([0.0, 0.0, 0.0, 1.0])
    for clip, a, b in parts:
        sk_, _, r, _ = read_clip(clip)
        sk = sk or sk_
        r = {bone: np.array(v, float)[a:b + 1] for bone, v in r.items()}
        if rot is None:
            rot = r
            continue
        n = b + 1 - a
        for bone in set(rot) | set(r):
            new = r.get(bone, np.tile(ident, (n, 1))).copy()
            old = rot.get(bone)
            last = old[-1] if old is not None else ident
            for i in range(min(blend, n)):
                w = (i + 1) / (blend + 1)
                w = w * w * (3 - 2 * w)
                if bone in ARMS:
                    new[i] = qslerp(ident, new[i], 2 * w - 1) if w > 0.5 else qslerp(last, ident, 2 * w)
                else:
                    new[i] = qslerp(last, new[i], w)
            for i in range(1, n):                              # (each frame the same way round as the one before)
                if np.dot(new[i], new[i - 1]) < 0:
                    new[i] = -new[i]
            if old is not None and np.dot(new[0], old[-1]) < 0:
                new = -new
            rot[bone] = np.concatenate([old if old is not None else np.tile(ident, (len(next(iter(rot.values()))), 1)), new])
    n = len(next(iter(rot.values())))
    return sk, np.arange(n) / FPS, rot


def main():
    spec = importlib.util.spec_from_file_location("bake", os.path.join(HERE, "bake-character-anim.py"))
    bake = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bake)
    with tempfile.TemporaryDirectory() as tmp:
        lib = os.path.join(tmp, "vrma")                    # (the baker names the library by its folder's name)
        os.makedirs(lib)
        pairs = []
        for game, clip, a, kick, b, in_place in CUTS:
            sk, times, rot, hips = read_clip(clip)
            frames = slice(a, b + 1)
            t = times[frames] - times[a]
            r = {bone: np.array(v)[frames] for bone, v in rot.items()}
            h = np.array(hips)[frames]
            if in_place:
                h = np.tile(sk.offset["hips"], (len(t), 1))     # her hips held where they stand
            write_vrma(os.path.join(lib, f"{game}.vrma"), sk, t, r, h, game, "tools/make-magic-jump-flow.py")
            pairs.append(f"{game}:{game}")
            print(f"{game:<9} <- {clip:<17} frames {a}..{b} ({t[-1]:.3f} s), kick {(kick - a) / FPS:.3f} s in"
                  + (", in place" if in_place else ""))
        for game, parts, blend, kick in JOINS:
            sk, t, r = joined(parts, blend)
            h = np.tile(sk.offset["hips"], (len(t), 1))
            write_vrma(os.path.join(lib, f"{game}.vrma"), sk, t, r, h, game, "tools/make-magic-jump-flow.py")
            pairs.append(f"{game}:{game}")
            print(f"{game:<9} <- " + " + ".join(f"{c} {a}..{b}" for c, a, b in parts)
                  + f" ({t[-1]:.3f} s, blended over {blend} frames), kick {kick / FPS:.3f} s in, in place")
        out = os.path.join(REPO, "magic-jump-flow-anim.js")
        done = bake.main(["bake", lib, out] + pairs)
    with open(out, encoding="utf-8") as f:
        text = f.read()
    first, rest = text.split("\n", 1)
    with open(out, "w", encoding="utf-8") as f:
        f.write("// magic-jump-flow-anim.js: written by tools/make-magic-jump-flow.py (through tools/bake-character-anim.py); do not\n"
                "// edit by hand. The magic jump's flow (magic-jump.js, step: 'flow'): Quaternius' Universal Animation Library 2\n"
                "// (CC0) and the user's Mixamo moves (mjf_3b, mjf_dash, mjf_fall2, mjf_land2: Adobe's, free to use in this game,\n"
                "// not CC0), cut and played in place; the moves the user chose (the tool says which).\n"
                + rest.split("\n", 1)[1])
    return done


if __name__ == "__main__":
    sys.exit(main())
