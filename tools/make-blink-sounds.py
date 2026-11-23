#!/usr/bin/env python3
# make-blink-sounds.py  —  the blink heard (blink-sounds.js): the sound of the clip it was made after, cut to the move
#
# Writes assets/audio/blink-out-1.mp3, blink-in-1.mp3, blink-out-2.mp3 and blink-in-2.mp3. Run from the repository's
# root:
#
#   python3 tools/make-blink-sounds.py  CLIP
#
#   CLIP   the ten seconds the user sent on 24 Nov 2026 for the blink (a girl at night: cyan sparks gather at her feet, a
#          magic circle opens, a dome of light bursts round her and she runs off trailing cyan afterimages of herself and
#          ribbons of light, lands crouched on another circle in a splash of sparks; then once more, the other way), with
#          "ในวีดีโอมันวิ่ง แต่เราจะทำเป็น Blink แทน ให้เหมือนตัวละครวาร์ปได้ แต่ทำ effect คล้ายๆ ในวีดีโอ เอาเสียงในวีดีโอมาใช้กับ
#          effect Blink ได้ทำให้เข้ากัน". The clip is not kept in the repository: only what is made from it.
#
# What is in the clip's sound (48 kHz; its two ears nearly the same, read as one), and what is made of it. The clip
# takes two and a half seconds over a run that the blink does in a fifth of one, so nothing is slowed or sped up (that
# is heard): each piece is one of the clip's own sounds, cut where it begins and ends. Its two halves each do the
# same thing once, each with sounds of its own, so there are two sets (blink-sounds.js: SETS), to be chosen by ear.
#   0.1 - 0.95 s  a soft shimmer as the sparks gather (not used: the blink does not wait for anything to gather)
#   0.95 - 1.5 s  a low whoosh swelling as the circle forms (not used, for the same reason)
#   1.84 - 2.5 s  the burst: a low thump at 1.86 s as the dome bursts round her, then a rush of sparkle over it, all of
#                 it loudest 2.08 to 2.28 s, gone by 2.5 (after it, her first steps)
#                 -> out (set 1): 1.84 to 2.50 s. Its moment, the thump, 0.02 s into it: as she goes
#   2.5 - 4.6 s   the run: whooshes and her steps (not used: the blink has no run)
#   4.72 - 5.45 s the landing: a whump with sparkle in it as she comes down on the second circle (rising from 4.74 s,
#                 loudest 4.82 to 5.04), its low end ringing on to 5.14, then quiet
#                 -> in (set 1): 4.72 to 5.45 s. Its moment 0.12 s into it (the clip's 4.84): as she is there again
#   5.5 - 7.8 s   faint tinkling as the sparks hang in the air (not used: too quiet to be heard over a game)
#   7.85 - 8.46 s the second time: a low whoosh with a glitter over it as the ribbons wind up round her (it comes in
#                 slowly: half its loudness by 7.93 s, loudest 8.11 to 8.21)
#                 -> out (set 2): 7.97 to 8.46 s, so that it is there at once (half its loudness already). Its moment
#                 0.06 s into it (the clip's 8.03): as she goes, as the first set's
#   9.0 - 9.95 s  the second run's end: a whoosh, mostly in the middle (200 to 2000 Hz), loudest at 9.10 s and held to
#                 9.4, then a high glitter dying away to the clip's end
#                 -> in (set 2): 8.98 to 9.95 s. Its moment 0.10 s into it (the clip's 9.08)
# Each is read as one ear, cut under 40 Hz, faded in and out, and levelled by ear as tools/make-step-sounds.py levels
# its own (the loudest tenth of a second, A-weighted, to so many dB; its peak no higher than -1 dB): `out` as loud as
# her finisher and the magic jump's launch (-23), `in` as a jump off a circle (-25). (Levelled together, as the clip has
# them, the first set's landing came out 6 dB under its burst, nearly all of it under 200 Hz, which a phone does not
# play, and the two are heard a tenth of a second apart: it would have been lost under the burst.) As that tool writes
# them: 44.1 kHz, one ear, 96 kb/s.
# It prints where each piece's moment lies: blink-sounds.js (SETS) has the same numbers.
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
# set: { name: ((from, to) in the clip (s), its moment in the clip (s), fades in and out (s), its level by ear (dB)) }
SETS = {
    1: {'out': ((1.84, 2.50), 1.86, (0.003, 0.12), -23.0),
        'in':  ((4.72, 5.45), 4.84, (0.005, 0.25), -25.0)},
    2: {'out': ((7.97, 8.46), 8.03, (0.006, 0.12), -23.0),
        'in':  ((8.98, 9.95), 9.08, (0.005, 0.3), -25.0)},
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
        sys.exit('usage: python3 tools/make-blink-sounds.py CLIP')
    x = read(sys.argv[1])
    out_dir = os.path.join('assets', 'audio')
    for n, pieces in SETS.items():
        for name, ((a, b), moment, fades, want) in pieces.items():
            y = faded(x[int(a * SR):int(b * SR)], *fades)
            g = min(amp(want) / loudest(a_weighted(y)), amp(CEILING) / np.abs(y).max())
            y = y * g
            top = moment - a
            assert 0 <= top <= b - a
            mp3 = os.path.join(out_dir, 'blink-%s-%d.mp3' % (name, n))
            write_mp3(y, mp3)
            print('set %d %-3s %s: %.2f s, its moment %.3f s in, %+.1f dB, by ear %.1f dB, peak %.1f dB, %.0f kB'
                  % (n, name, os.path.basename(mp3), len(y) / SR, top, db(g), db(loudest(a_weighted(y))), db(np.abs(y).max()), os.path.getsize(mp3) / 1000))


if __name__ == '__main__':
    main()
