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

  mjf_1    <- Jump_Double        Step 1: the double jump: her legs driven straight down, then both knees snatched up,
                                 and let down again. Off the ground it follows the game's own take-off (the mocap's
                                 crouch and push: magic-jump.js), from its kick
  mjf_2    <- Jump_OffWall_R     Step 2: a jump off a wall on her right: from where she is gathered, turned 30 degrees
                                 to her right, she twists back round and kicks out long, on the slant (it goes to her
                                 left), her right knee coming up after. (Its first frames, flat out against the wall,
                                 are left out)
  mjf_3    <- NinjaJump_Double   Step 3: out of a tuck her legs driven down, then the knees drawn up again with her hips
                                 turned (15 degrees) under her: the ninja's double jump
  mjf_4    <- Jog_Into_Flip      Step 4: the front flip off a run: from the push (the jog's strides left out), long and
                                 stretched out ahead, over head first, round, and upright with her legs reaching down
                                 (the run's landing left out: in the game she has further to fall)
  mjf_land <- NinjaJump_Land     the landing out of them (the library's own, which the user's "Jump - ninja landing" is):
                                 from where her feet are down, a crouch and up into standing

Each is cut (FROM..TO frames, at 30 a second) and, but for the landing, played in place: the game moves her up and over
the ground (magic-jump.js), so her hips are held where they stand (the library's hips, one hips height up) and only her
body turns about them; the landing keeps its own hips, her feet on the ground. KICK is the frame her legs are straightest
under her: magic-jump.js keeps her on the circle until then (the clip's time into the cut: KICK - FROM frames). Printed.

Usage (from the repo folder; needs numpy):
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
from vrma_pose import read_clip, write_vrma  # noqa: E402

FPS = 30
# game name, library clip, FROM, KICK, TO (frames), in place
CUTS = [
    ("mjf_1", "Jump_Double", 2, 3, 25, True),
    ("mjf_2", "Jump_OffWall_R", 3, 7, 22, True),
    ("mjf_3", "NinjaJump_Double", 1, 4, 26, True),
    ("mjf_4", "Jog_Into_Flip", 4, 6, 24, True),
    ("mjf_land", "NinjaJump_Land", 2, 2, 38, False),
]


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
        out = os.path.join(REPO, "magic-jump-flow-anim.js")
        done = bake.main(["bake", lib, out] + pairs)
    with open(out, encoding="utf-8") as f:
        text = f.read()
    first, rest = text.split("\n", 1)
    with open(out, "w", encoding="utf-8") as f:
        f.write("// magic-jump-flow-anim.js: written by tools/make-magic-jump-flow.py (through tools/bake-character-anim.py); do not\n"
                "// edit by hand. The magic jump's flow (magic-jump.js, step: 'flow'): Quaternius' Universal Animation Library 2\n"
                "// (CC0), cut and played in place; the moves the user chose (the tool says which).\n"
                + rest.split("\n", 1)[1])
    return done


if __name__ == "__main__":
    sys.exit(main())
