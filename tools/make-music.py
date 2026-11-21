# make-music.py  —  the music: each piece levelled to the air about her and made small
#
# Writes assets/audio/music/<name>.mp3 and assets/audio/music.json: every piece music.js plays, how long it is and when
# it fits (by day, by night, or at any hour). Run from the repository's root:
#
#   python3 tools/make-music.py  SOURCE_DIR
#
#   SOURCE_DIR  the pieces as they came, one .mp3 each, under the names in TRACKS (below). They are not kept here.
# (needs ffmpeg with libmp3lame, and numpy.)
#
# WHAT IS DONE TO EACH PIECE
#   1. Levelled as the air's loops are (tools/make-ambience.py): its loudness where it is loud (A-weighted, the 95th
#      hundredth of its level over 0.4 s windows) brought to LEVEL dB; turned down further if its peaks would pass CEILING.
#      How loud it then plays against the air is music.js's LEVEL.
#   2. Made small: MP3 at RATE, 44.1 kHz, stereo; nothing else of the file kept (its title, its picture).
# Nothing is cut: music.js fades a piece in and out as it plays it.

import sys, os, json, subprocess
import numpy as np

SR = 44100
LEVEL = -30.0             # dB, A-weighted, where it is loud: the air's loops' level
CEILING = -1.0            # dB: no peak over this
RATE = '112k'

TRACKS = {      # name: (when it fits: 'day', 'night' or 'any'; where it is from)
    'wandering-grassy-hills': ('day', 'made by the user with Suno (suno.com), 21 Nov 2026, as "Wandering Grassy Hills"'),
}

db = lambda v: 20 * np.log10(max(float(v), 1e-12))
amp = lambda d: 10 ** (d / 20)


def read(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-map', '0:a:0', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64).reshape(-1, 2)


def a_weighted(x):
    f = np.fft.rfftfreq(len(x), 1 / SR)
    f2 = f * f
    a = (12194.0 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194.0 ** 2) + 1e-30)
    return np.fft.irfft(np.fft.rfft(x) * a * amp(2.0), len(x))


def where_loud(x, secs=0.4, q=95):
    n = int(secs * SR)
    c = np.concatenate(([0.0], np.cumsum(x * x)))
    rms = np.sqrt(np.maximum(0, (c[n::n // 4] - c[:-n:n // 4]) / n))
    return float(np.percentile(rms, q))


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: python3 tools/make-music.py SOURCE_DIR')
    out_dir = os.path.join('assets', 'audio', 'music')
    os.makedirs(out_dir, exist_ok=True)
    meta = {'tracks': []}
    print('%-24s %5s %7s %8s %7s %6s %6s' % ('piece', 'when', 'secs', 'was', 'gain', 'peak', 'kB'))
    for name, (when, source) in TRACKS.items():
        path = os.path.join(sys.argv[1], name + '.mp3')
        if not os.path.isfile(path): sys.exit('not found: ' + path)
        x = read(path)
        was = where_loud(a_weighted(x.mean(axis=1)))
        g = min(amp(LEVEL) / was, amp(CEILING) / np.abs(x).max())
        mp3 = os.path.join(out_dir, name + '.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                        '-codec:a', 'libmp3lame', '-b:a', RATE, '-map_metadata', '-1', mp3],
                       input=np.clip(x * g, -1, 1).astype('<f4').tobytes(), check=True)
        back = read(mp3)
        if abs(len(back) - len(x)) > SR // 10: sys.exit('CHECK FAILED %s: %d samples, was %d' % (name, len(back), len(x)))
        meta['tracks'].append({'file': 'music/%s.mp3' % name, 'secs': round(len(x) / SR, 2), 'when': when, 'from': source})
        print('%-24s %5s %7.1f %7.1fdB %+6.1fdB %5.1fdB %6.0f' % (name, when, len(x) / SR, db(was), db(g), db(np.abs(back).max()), os.path.getsize(mp3) / 1000))
    with open(os.path.join('assets', 'audio', 'music.json'), 'w') as f:
        json.dump(meta, f, separators=(',', ':'), ensure_ascii=False)
        f.write('\n')


if __name__ == '__main__':
    main()
