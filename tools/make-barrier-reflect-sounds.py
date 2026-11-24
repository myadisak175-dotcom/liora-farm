#!/usr/bin/env python3
# make-barrier-reflect-sounds.py  —  the barrier that throws a blow back, heard (barrier-reflect-sounds.js): the sound of
# the clip it was made after, cut to its beats
#
# Writes assets/audio/reflect-shot-1.mp3, reflect-hit-1.mp3, reflect-charge-1.mp3, reflect-burst-1.mp3 and
# reflect-raise-1.mp3. Run from the repository's root:
#
#   python3 tools/make-barrier-reflect-sounds.py  CLIP
#
#   CLIP   the ten seconds the user sent on 24 Nov 2026 for the barrier (a girl in a meadow under a dome of light; a bolt
#          strikes it, it turns deep blue with lightning all through it, bursts, throwing the blow back, its glass flying
#          off over a disc of light on the ground; it stands up again), with "สกิลบาเรียอยากได้เอฟเฟคประมาณนี้ค่ะ ...
#          เอฟเฟคขอแบบในวีดีโอเลยนะคะ". The clip is not kept in the repository: only what is made from it.
#
# What is in the clip's sound (48 kHz; its two ears nearly the same, read as one), and what is made of it. Under all
# of it a meadow: birds now and then (at 0.3 - 1.1 s, 2.0 - 2.1, 8.3 - 9.9), which every piece is cut clear of. The
# barrier's beats are the clip's own, one after another, so each piece is the clip's sound of that beat as it is, cut
# where it begins and ends; played on the same beats they are heard as the clip has them.
#   2.1 - 2.46 s  the bolt coming: a rush of crackle rising, a hum at 1.5 kHz under it
#                 -> shot: 2.11 to 2.44 s (played as a bolt is thrown)
#   2.46 s        the blow: cracks over everything from 2.436 s (loudest 2.50 to 2.62), the crackle dying away
#                 -> hit: 2.43 to 3.22 s, played from its start as the blow lands (a blow is not known before it lands:
#                    its first crack 0.006 s in)
#   3.2 - 4.4 s   the charge: the crackle swelling again (3.3 to 3.55) and held, the hum in it
#                 -> charge: 3.18 to 4.40 s, played 0.74 s after the blow (the clip's 3.20)
#   4.434 s       the burst: a crack and a rush, loud to 5.8, glass ringing and dying away to 6.8
#                 -> burst: 4.425 to 6.80 s. Its moment, the crack, 0.009 s into it: 0.15 s after the dome is gone (the
#                    clip's dome goes at 4.27, its burst swells at 4.42)
#   7.35 - 8.2 s  the dome standing up again: a chime, many bright partials (3 to 15 kHz), coming in at 7.35, loudest
#                 7.6 - 7.75, dying away
#                 -> raise: 7.28 to 8.24 s, played as the button is pressed (its chime then comes as the dome does)
# Each is read as one ear, cut under 40 Hz, faded in and out, and levelled by ear as tools/make-step-sounds.py levels
# its own (the loudest tenth of a second, A-weighted, to so many dB; its peak no higher than -1 dB): the burst as loud as
# her finisher (-21), the blow a little under it (-22), the chime as a jump off a circle (-25), the charge and the
# bolt coming, under the rest (-27, -29). As that tool writes them: 44.1 kHz, one ear, 96 kb/s.
# It prints where each piece's moment lies: barrier-reflect-sounds.js (PIECES) has the same numbers.
#
# (needs ffmpeg with libmp3lame, and numpy.)
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
BITRATE = '96k'
CEILING = -1.0            # dB: no piece's peak over this
LOW = 40                  # Hz: under this is cut
# name: ((from, to) in the clip (s), its moment in the clip (s), fades in and out (s), its level by ear (dB))
PIECES = {
    'shot':   ((2.11, 2.44), 2.11, (0.02, 0.05), -29.0),
    'hit':    ((2.43, 3.22), 2.43, (0.003, 0.3), -22.0),
    'charge': ((3.18, 4.40), 3.20, (0.05, 0.12), -27.0),
    'burst':  ((4.425, 6.80), 4.434, (0.003, 0.7), -21.0),
    'raise':  ((7.28, 8.24), 7.28, (0.02, 0.25), -25.0),
}

db = lambda v: 20 * np.log10(max(float(v), 1e-12))
amp = lambda d: 10 ** (d / 20)


def read(path):
    """the clip's sound as one ear, less what lies under LOW"""
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-vn', '-af', 'highpass=f=%d:poles=2' % LOW, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).astype(np.float64)


def a_weighted(x):
    """x as the ear weighs it (IEC 61672's A curve, laid on its spectrum)"""
    f = np.fft.rfftfreq(len(x), 1 / SR)
    f2 = f * f
    a = (12194.0 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194.0 ** 2) + 1e-30)
    return np.fft.irfft(np.fft.rfft(x) * a * amp(2.0), len(x))


def loudest(x, secs=0.1):
    """the RMS of x's loudest stretch of that length"""
    n = min(len(x), int(secs * SR))
    c = np.concatenate(([0.0], np.cumsum(x * x)))
    return float(np.sqrt(((c[n:] - c[:-n]) / n).max()))


def faded(y, fade_in, fade_out):
    y = y.copy()
    n_in, n_out = min(len(y) // 4, int(fade_in * SR)), min(len(y) // 2, int(fade_out * SR))
    if n_in: y[:n_in] *= np.linspace(0, 1, n_in)
    if n_out: y[-n_out:] *= np.linspace(1, 0, n_out) ** 2
    return y


def write_mp3(y, path):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'piece.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', BITRATE, '-map_metadata', '-1', path], check=True)


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: python3 tools/make-barrier-reflect-sounds.py CLIP')
    x = read(sys.argv[1])
    out_dir = os.path.join('assets', 'audio')
    for name, ((a, b), moment, fades, want) in PIECES.items():
        y = faded(x[int(a * SR):int(b * SR)], *fades)
        g = min(amp(want) / loudest(a_weighted(y)), amp(CEILING) / np.abs(y).max())
        y = y * g
        top = moment - a
        assert 0 <= top <= b - a
        mp3 = os.path.join(out_dir, 'reflect-%s-1.mp3' % name)
        write_mp3(y, mp3)
        print('%-6s %s: %.2f s, its moment %.3f s in, %+.1f dB, by ear %.1f dB, peak %.1f dB, %.0f kB'
              % (name, os.path.basename(mp3), len(y) / SR, top, db(g), db(loudest(a_weighted(y))), db(np.abs(y).max()), os.path.getsize(mp3) / 1000))


if __name__ == '__main__':
    main()
