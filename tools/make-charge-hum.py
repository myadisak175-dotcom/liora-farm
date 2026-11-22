#!/usr/bin/env python3
# make-charge-hum.py  —  her held cast heard for as long as it is held (charge-hum.js): a low hum of the lance's circle
# turning, made from a ringing the user sent, that goes round and round with no seam
#
# Writes assets/audio/charge-hum-1.mp3. Run from the repository's root:
#
#   python3 tools/make-charge-hum.py  RINGING
#
#   RINGING   "freesound_community-magic-circle-long-ringing-sfx-45483.mp3", sent by the user on 23 Nov 2026 with:
#             "อันนี้เอามาปรับเป็นเสียงทุ้มต่ำเวลาชาตเวทค้างนานๆ อยากให้ได้ยินเสียงวนเวทหมุน loop เรื่อยๆ จนกว่าจะปล่อย"
#             (make this a low, deep sound for when the cast is held long: the circle heard turning, round and round,
#             until it is let go). The file is not kept in the repository: only what is made from it. Its name is that
#             of a sound of Pixabay's "freesound_community" (id 45483); its page was not found to read its terms from.
#
# What is in it (24 kHz, both ears the same): a second of nothing, then seven seconds of a thin ringing that wavers,
# two notes above the rest (840 and 1034 Hz; under them 484 and 592 Hz), nearly all of it between 400 Hz and 3 kHz;
# it fades in its last second. What is made of it:
#   LOW      it is played DOWN semitones lower, as a tape slowed is: its two notes come to 315 and 387 Hz, the two
#            under them to 181 and 222 Hz, and its wavering is as much slower (2.67 times). Under CUT Hz is cut (a
#            phone does not play it, and it takes room). A phone's speaker plays little under 400 Hz, so what it can
#            play of a low note is given it: the same again an octave higher, OCTAVE dB under it (the circle read twice
#            as fast: it stays a circle), and a little of its overtones (WARM: it is bent as a valve bends it). By ear
#            they fall in with the low note; on a small speaker they are what is left of it
#   EVEN     its wavering is evened out (to a fifth of what it was, in dB: EVEN), so that the turning below is what
#            is heard to move, not the ringing's own swells
#   ROUND    LONG s of it, the X s after them faded into its beginning (equal power), so that its end goes over into
#            its beginning with nothing to hear. Everything else is done round that circle (its spectrum's, or by
#            the clock of the turning), and so keeps it whole
#   TURNING  the circle is heard to turn, TURNS times in those LONG s (1.5 times a second): as a thing going round
#            before the ear does, it is louder and brighter as it comes by (SWING dB quieter, and dulled over DULL Hz,
#            on its far side), and a little higher as it comes and lower as it goes (BEND: of its pitch)
#   LEVEL    by ear as tools/make-step-sounds.py levels its own (the loudest tenth of a second of it, A-weighted), to
#            LEVEL dB: about as loud as the shimmer the circle opens with (gate, -27; through a phone's speaker,
#            which takes half of the hum, a little under it), a long way under the lance's blast (throw, -20). Its
#            peak no higher than -1 dB
#   WRITTEN  with PAD s of itself before its beginning and after its end, so that whatever an MP3's reader adds or
#            takes at a file's ends, any LONG s inside it are the whole circle: charge-hum.js plays it from half of
#            PAD in, and round from there. 44.1 kHz, one ear, 96 kb/s
# It prints what charge-hum.js needs (HUM: pad, long) and how well the circle closes once it is an MP3.
#
# (needs ffmpeg and ffprobe with libmp3lame, and numpy.)
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
BITRATE = '96k'
CEILING = -1.0            # dB: its peak no higher
DOWN = 17                 # semitones lower
CUT = 70                  # Hz: under this is cut
OCTAVE = -10.0            # dB: the same an octave higher, so far under it (None: not at all)
WARM = 0.8                # how hard it is bent (0: not at all)
EVEN = 0.8                # of its wavering (dB) taken out
FROM, UNTIL = 2.5, 6.9    # s of the ringing that are used (its steady middle)
LONG, X = 6.0, 2.0        # s the circle is long; s after them that fade into its beginning
TURNS = 9                 # times it turns in LONG s
SWING = 5.0               # dB quieter on its far side
DULL = 500                # Hz: over this its far side is dulled ...
DULLED = 9.0              # ... by so many dB
BEND = 0.005              # of its pitch, up as it comes and down as it goes
LEVEL = -26.0             # dB by ear
PAD = 0.3                 # s of itself written before and after

db = lambda v: 20 * np.log10(max(float(v), 1e-12))
amp = lambda d: 10 ** (d / 20)


def read(path):
    """the ringing as one ear, DOWN semitones lower (slowed, as a tape is)"""
    rate = int(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', path],
                              capture_output=True, check=True, text=True).stdout.strip())
    slow = 2 ** (DOWN / 12)
    cmd = ['ffmpeg', '-v', 'error', '-ss', '%.3f' % FROM, '-t', '%.3f' % (UNTIL - FROM), '-i', path, '-vn',
           '-af', 'asetrate=%d,aresample=%d:resampler=soxr' % (round(rate / slow), SR), '-f', 'f32le', '-ac', '1', '-']
    done = subprocess.run(cmd, capture_output=True)
    if done.returncode:      # (an ffmpeg without soxr: its own resampler)
        cmd[cmd.index('-af') + 1] = 'asetrate=%d,aresample=%d' % (round(rate / slow), SR)
        done = subprocess.run(cmd, capture_output=True, check=True)
    return np.frombuffer(done.stdout, dtype=np.float32).astype(np.float64)


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


def evened(x, win=0.35):
    """x with EVEN of its wavering taken out (how loud it is over `win` s, against how loud it is over all)"""
    n = int(win * SR) | 1
    k = np.hanning(n)
    e = np.sqrt(np.convolve(np.pad(x * x, n // 2, mode='reflect'), k / k.sum(), mode='valid'))
    return x * (np.sqrt((x * x).mean()) / np.maximum(e, 1e-6)) ** EVEN


def rounded(x):
    """LONG s of x whose end goes over into its beginning: the X s after them fade into its first X s"""
    n, m = int(LONG * SR), int(X * SR)
    if len(x) < n + m:
        sys.exit('the ringing gives %.2f s so low; %.2f are needed (LONG + X)' % (len(x) / SR, LONG + X))
    y = x[:n].copy()
    t = np.linspace(0, np.pi / 2, m)
    y[:m] = x[:m] * np.sin(t) + x[n:n + m] * np.cos(t)
    return y


def shaped(y, gain):
    """y, a circle, with its spectrum laid under `gain` (of Hz): still a circle"""
    return np.fft.irfft(np.fft.rfft(y) * gain(np.fft.rfftfreq(len(y), 1 / SR)), len(y))


def turning(y):
    """y, a circle, heard to go round TURNS times: nearer and further, brighter and duller, coming and going"""
    n = len(y)
    t = np.arange(n) / SR
    w = 2 * np.pi * TURNS / LONG
    # coming and going: read a little ahead and behind, by the turning's clock (round the circle: np.interp's period)
    ahead = BEND / w * np.sin(w * t)                    # s; its rate of change is its pitch's: +-BEND, highest as it comes by
    y = np.interp(t + ahead, t, y, period=LONG)
    # nearer and further (0 on its far side, 1 as it comes by), a little after it is highest
    near = 0.5 - 0.5 * np.cos(w * t + np.pi / 3)
    near = near ** 1.5                                  # (it is by for a shorter while than it is away)
    dull = shaped(y, lambda f: amp(-DULLED * np.clip(np.log2(np.maximum(f, 1) / DULL), 0, 1)))
    return (dull + (y - dull) * near) * amp(-SWING * (1 - near))


def write_mp3(y, path):
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        wav = tmp.name
    try:
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', BITRATE, '-ac', '1', '-ar', str(SR), path], check=True)
    finally:
        os.unlink(wav)


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: python3 tools/make-charge-hum.py RINGING')
    x = read(sys.argv[1])
    x = evened(x)
    y = rounded(x)
    if OCTAVE is not None:
        t = np.arange(len(y)) / SR
        y = y + amp(OCTAVE) * np.interp(2 * t, t, y, period=LONG)
    if WARM:
        peak = np.abs(y).max()
        y = np.tanh(y / peak * (1 + 2 * WARM)) + WARM * 0.25 * (y / peak) ** 2          # (odd overtones, and a little of the even)
    y = shaped(y, lambda f: (f / CUT) ** 2 / np.sqrt(1 + (f / CUT) ** 4))            # (under CUT: 12 dB an octave)
    y = turning(y)
    y *= amp(LEVEL) / loudest(a_weighted(np.tile(y, 2)))                              # (twice over: its loudest tenth may lie across its seam)
    y *= min(1.0, amp(CEILING) / np.abs(y).max())
    n, p = len(y), int(PAD * SR)
    path = os.path.join('assets', 'audio', 'charge-hum-1.mp3')
    write_mp3(np.concatenate((y[-p:], y, y[:p])), path)
    # how it came out: read it back as a browser does, and lay any LONG s of it against the LONG s after
    back = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout, dtype=np.float32).astype(np.float64)
    a, b = back[:len(back) - n], back[n:]
    seam = int(PAD / 2 * SR)
    print('%s  %.2f s, %d kB' % (path, len(back) / SR, os.path.getsize(path) // 1000))
    print('  HUM: pad %.3f, long %.3f      (charge-hum.js)' % (PAD, LONG))
    print('  by ear %.1f dB, peak %.1f dB, RMS %.1f dB' % (db(loudest(a_weighted(np.tile(y, 2)))), db(np.abs(back).max()), db(np.sqrt((y * y).mean()))))
    print('  the circle closes: what differs LONG s on is %.1f dB under it; the step where it is joined %.1f dB (its steps elsewhere: %.1f dB at most)'
          % (db(np.sqrt((a * a).mean())) - db(np.sqrt(((a - b) ** 2).mean())), db(abs(back[seam + n] - back[seam + n - 1])), db(np.abs(np.diff(back[seam:seam + n])).max())))


if __name__ == '__main__':
    main()
