#!/usr/bin/env python3
# make-spear-rain-sounds.py  —  the spear rain heard (spear-rain-sounds.js): the sound of the clip it was made after,
# cut to the move
#
# Writes assets/audio/rain-twirl-1.mp3, rain-seal-1.mp3, rain-fall-1.mp3 and rain-great-1.mp3. Run from the
# repository's root:
#
#   python3 tools/make-spear-rain-sounds.py  CLIP
#
#   CLIP   the ten seconds the user sent on 23 Nov 2026 as what the spear rain is to look like (a girl twirls a spear,
#          throws it up, a seal opens in the sky, spears rain down, a great one last), and then asked for its sound:
#          "ขอเสียงจากวีดีโอเอามาดัดแปลงใส่ให้เข้ากันได้ไหมคะ". The clip is not kept in the repository: only what is made
#          from it.
#
# What is in the clip's sound (48 kHz, both ears nearly the same: read as one), and what is made of it. The clip takes
# ten seconds over what the move does in three and a half, so nothing is slowed or sped up (that is heard): each piece
# is cut where the clip's own sound begins and ends, and the two long ones have their middle taken out.
#   0.1 - 2.0 s   a whoosh swelling as she twirls the spear, its top 1.3 to 1.46 s, gone by 2.0
#                 -> twirl: 1.06 to 2.06 s. She lets the lance go 0.30 s into it (the clip's 1.36): spear-rain.js' SKY.let
#   2.2 - 6.0 s   the spear goes up (a rise, 2.2 to 2.56 s) into a deep roar as the seal opens, four fifths of it under
#                 200 Hz, a crack in it at 3.48 s; at 4.5 s it drops away to a thin ringing that is gone by 6 s
#                 -> seal: 2.14 to 3.60 s, then 4.45 to 6.05 s (0.2 s of the one fading into the other): 2.86 s where the
#                 clip has 3.9. The seal opens 0.46 s into it (the clip's 2.60), as long after the lance leaves her
#                 hand as it is on its way up (spear-rain-fx.js' SPEAR_RAIN.rise); the roar is down again about a
#                 second later, as the first spears land
#   6.4 - 9.0 s   the rain: a hiss rising as the spears come down, their landing at 7.0 s (splashes one over another,
#                 loudest to 8.2 s), gone by 8.9
#                 -> fall: 6.58 to 7.60 s, then 8.05 to 9.00 s (0.12 s of the one into the other): 1.85 s where the clip
#                 has 2.4. The first spear lands 0.42 s into it. A full rain's last spear lands 0.77 s after its first,
#                 a small one's 0.32 s: spear-rain-sounds.js lets the piece die away early under a small rain
#   9.0 - 10.0 s  the great spear: quiet, a rise from 9.2 s, the blow at 9.446 s, and the clip ends in the middle of
#                 it (as loud at 10.0 s as at the blow)
#                 -> great: 9.02 s to the clip's end; the blow 0.426 s into it. Its end is made: 1.6 s of noise with
#                 the colour of the blow's last 0.4 s, dying away as a blow in the open does (40 dB down by the end,
#                 its top nearly twice as fast, and faded out), the clip's own sound going over into it through its
#                 last 0.3 s
# Each is read as one ear, cut under 35 Hz, faded in and out, and levelled by ear as tools/make-step-sounds.py levels
# its own (the loudest tenth of a second of it, A-weighted, to so many dB; its peak no higher than -1 dB), so that
# they stand among her other sounds as its `throw` and `finish` do. As that tool writes them: 44.1 kHz, one ear, 96 kb/s.
# It prints where each piece's moment lies: spear-rain-sounds.js (PIECES) has the same numbers.
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
LOW = 35                  # Hz: under this is cut
# name: (its cuts in the clip (s, s) ..., how much of one fades into the next (s), its moment in the clip (s),
#        its level by ear (dB), fades in and out (s))
PIECES = {
    'twirl': ([(1.06, 2.06)], 0, 1.36, -26.0, (0.05, 0.3)),
    'seal':  ([(2.14, 3.60), (4.45, 6.05)], 0.2, 2.60, -22.0, (0.06, 0.5)),
    'fall':  ([(6.58, 7.60), (8.05, 9.00)], 0.12, 7.00, -22.0, (0.08, 0.3)),
    'great': ([(9.02, None)], 0, 9.446, -20.0, (0.03, 0.0)),      # (to the clip's end; its end is made, below)
}
TAIL = {'of': 0.4, 'long': 1.6, 'over': 0.3, 'down': 40.0, 'dull': 1.8}      # the great spear's end: see above. dull: its top dies so many times as fast

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


def joined(parts, over):
    """the parts one after another, each fading into the next over so long (equal power: no dip, no bump)"""
    y = parts[0]
    n = int(over * SR)
    for p in parts[1:]:
        if n:
            t = np.linspace(0, np.pi / 2, n)
            y = np.concatenate((y[:-n], y[-n:] * np.cos(t) + p[:n] * np.sin(t), p[n:]))
        else:
            y = np.concatenate((y, p))
    return y


def rung_out(y, seed=7):
    """y with an end made for it: noise coloured as its last TAIL.of s, dying away, y going over into it"""
    rng = np.random.default_rng(seed)
    n, win = int(TAIL['long'] * SR), 4096
    last = y[-int(TAIL['of'] * SR):]
    # the colour: the mean of its spectrum over those last moments
    frames = [last[i:i + win] * np.hanning(win) for i in range(0, len(last) - win, win // 4)]
    colour = np.sqrt(np.mean([np.abs(np.fft.rfft(f)) ** 2 for f in frames], axis=0))
    f = np.fft.rfftfreq(win, 1 / SR)
    out = np.zeros(n + win)
    hop = win // 4
    for i in range(0, n, hop):
        t = i / SR
        # (what is high dies first: a blow in the open loses its top before its body)
        dying = amp(-TAIL['down'] * t / TAIL['long'] * (1 + (TAIL['dull'] - 1) * np.minimum(1, f / 4000)))
        spec = colour * dying * np.exp(1j * rng.uniform(0, 2 * np.pi, len(colour)))
        out[i:i + win] += np.fft.irfft(spec, win) * np.hanning(win)
    out = out[:n]
    # as loud where it begins as the clip is where it ends
    m = int(TAIL['over'] * SR)
    out *= np.sqrt((y[-m:] ** 2).mean()) / max(np.sqrt((out[:m] ** 2).mean()), 1e-9)
    t = np.linspace(0, np.pi / 2, m)
    return np.concatenate((y[:-m], y[-m:] * np.cos(t) + out[:m] * np.sin(t), faded(out[m:], 0, 0.6)))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__ or 'usage: python3 tools/make-spear-rain-sounds.py CLIP')
    x = read(sys.argv[1])
    out_dir = os.path.join('assets', 'audio')
    for name, (cuts, over, moment, want, fades) in PIECES.items():
        parts = [x[int(a * SR):(int(b * SR) if b else len(x))] for a, b in cuts]
        y = joined(parts, over)
        if name == 'great': y = rung_out(y)
        y = faded(y, *fades)
        g = min(amp(want) / loudest(a_weighted(y)), amp(CEILING) / np.abs(y).max())
        y = y * g
        # where its moment lies in the piece: in its first cut, so the joins after it do not move it
        top = moment - cuts[0][0]
        assert 0 <= top <= (cuts[0][1] or 1e9) - cuts[0][0]
        mp3 = os.path.join(out_dir, 'rain-%s-1.mp3' % name)
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, 'piece.wav')
            with wave.open(wav, 'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
                w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', BITRATE, '-map_metadata', '-1', mp3], check=True)
        print('%-6s %s: %.2f s, its moment %.3f s in, %+.1f dB, by ear %.1f dB, peak %.1f dB, %.0f kB'
              % (name, os.path.basename(mp3), len(y) / SR, top, db(g), db(loudest(a_weighted(y))), db(np.abs(y).max()), os.path.getsize(mp3) / 1000))


if __name__ == '__main__':
    main()
