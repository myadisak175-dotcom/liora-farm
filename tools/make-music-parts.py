# make-music-parts.py  —  each piece of music cut into parts, for music.js to play from the AudioContext
#
# Writes assets/audio/music/<name>/NN.mp3 for every piece in assets/audio/music.json (made by tools/make-music.py), and
# adds to each piece there: parts (the files, in order), hop (s from the start of one part to the start of the next) and
# over (s each part runs on into the next: where the one fades into the other). Run from the repository's root, after
# make-music.py (it reads the pieces that tool made, not their sources):
#
#   python3 tools/make-music-parts.py
#
# (needs ffmpeg with libmp3lame, and numpy.)
#
# WHY PARTS (27 Nov 2026). music.js played a piece from an <audio> element through the AudioContext. On an iPhone that is
# known to come out warped now and then (the pieces are 44.1 kHz, the phone 48: Safari resamples an element's sound badly,
# WebKit bugs 215314, 221553, 239696), and an element needs a touch of its own before it may be heard ("เพลงเพี้ยน",
# "เพลงก็ไม่เล่นเองอัตโนมัติ"). Decoded whole into the AudioContext a piece is some 80 MB. In parts of HOP seconds, two of
# them at most are held (some 24 MB), each decoded while the one before plays.
#
# A PART runs OVER seconds past where the next begins: music.js fades one into the next over that second (the two the
# same music there, so a plain crossfade: no dip, no swell). Each is made from the same decoded piece and encoded alike
# (LAME, its gapless header), so a decoder that gives back a part a few milliseconds late gives back every part as late,
# and they still meet. Checked here: each part decoded again lines up with the next over the second they share.

import json, os, subprocess, sys
import numpy as np

SR = 44100
HOP = 30.0                 # s from one part's start to the next's
OVER = 1.0                 # s each part runs on into the next
RATE = '160k'              # (the pieces are 112 kbit/s already: a little more, so encoding them again takes nothing audible)
AUDIO = os.path.join('assets', 'audio')


def read(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-map', '0:a:0', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)


def write(x, path):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', RATE, '-map_metadata', '-1', path],
                   input=np.ascontiguousarray(x, dtype='<f4').tobytes(), check=True)


def lag(a, b, most=2048):
    """how many samples b lies later than a (the best match of b's start within a's, over +-most)"""
    a = a.mean(axis=1); b = b.mean(axis=1)
    n = min(len(a), len(b)) - 2 * most
    best, at = -1e9, 0
    w = b[most:most + n]
    for d in range(-most, most + 1, 8):
        c = float(np.dot(a[most + d:most + d + n], w))
        if c > best: best, at = c, d
    for d in range(at - 8, at + 9):
        c = float(np.dot(a[most + d:most + d + n], w))
        if c > best: best, at = c, d
    return at


def main():
    meta_path = os.path.join(AUDIO, 'music.json')
    meta = json.load(open(meta_path))
    hop, over = int(HOP * SR), int(OVER * SR)
    for t in meta['tracks']:
        name = os.path.splitext(os.path.basename(t['file']))[0]
        x = read(os.path.join(AUDIO, t['file']))
        out = os.path.join(AUDIO, 'music', name)
        os.makedirs(out, exist_ok=True)
        for old in os.listdir(out):
            if old.endswith('.mp3'): os.remove(os.path.join(out, old))
        parts, k = [], 0
        while k * hop < len(x) - SR // 10:
            a, b = k * hop, min(len(x), (k + 1) * hop + over)
            path = os.path.join(out, '%02d.mp3' % k)
            write(x[a:b], path)
            back = read(path)
            if abs(len(back) - (b - a)) > 1152 * 2: sys.exit('CHECK FAILED %s: %d samples back, %d written' % (path, len(back), b - a))
            parts.append((path, back, a))
            k += 1
        # each part against the next, over the second they share
        for (pa, ba, a0), (pb, bb, b0) in zip(parts, parts[1:]):
            tail = ba[b0 - a0:b0 - a0 + over]
            d = lag(tail, bb[:over])
            if abs(d) > 8: sys.exit('CHECK FAILED %s then %s: %d samples apart where they meet' % (pa, pb, d))
        t['parts'] = ['music/%s/%02d.mp3' % (name, i) for i in range(len(parts))]
        t['hop'] = HOP
        t['over'] = OVER
        print('%-24s %2d parts of %ds (+%ds), %6.0f kB in all' % (name, len(parts), HOP, OVER, sum(os.path.getsize(p) for p, _, _ in parts) / 1000))
    with open(meta_path, 'w') as f:
        json.dump(meta, f, separators=(',', ':'), ensure_ascii=False)
        f.write('\n')


if __name__ == '__main__':
    main()
