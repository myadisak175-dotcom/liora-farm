# make-ambience.py  —  the air about her: the loops of wind, birds, water and night, levelled and made small
#
# Writes assets/audio/ambience/<name>.mp3 and assets/audio/ambience.json: every loop ambience.js plays, and which loops
# make up each layer. Run from the repository's root:
#
#   python3 tools/make-ambience.py  SOURCE_DIR
#
#   SOURCE_DIR  the loops as they were made, one .mp3 each, named for what they are: wind-1.mp3, wind-2.mp3, birds-1.mp3 ...
#               (the names in LAYERS, below). Each is 20 s (the grass she goes through, 15), made to loop without a seam (ElevenLabs' sound effects, v3, with
#               "loop" on: see the README for the words each was asked for with). They are not kept in the repository.
# (needs ffmpeg with libmp3lame, and numpy.)
#
# WHAT IS DONE TO EACH LOOP
#   1. Levelled. As they came they are 40 dB apart (the waterfall at -17 dB, the meadow's wind at -55), so each is brought
#      to one loudness: LEVEL dB, A-weighted (as the ear weighs it), measured where it is loud, not over its silences (the
#      95th hundredth of its level over 0.4 s windows: a loop that is mostly quiet with a crow now and then is as loud, when
#      the crow calls, as one that never stops). A loop that would clip there is turned down until it does not; one that is
#      nearly all bass (the abyss's wind) the ear's weighting would turn up beyond reason, so no loop's plain level goes
#      over PLAIN dB. Only its loudness is changed: nothing is cut or filtered, so its end still meets its start.
#   2. A layer that has a place (a brook, a fall, a tree: PLACED) is made mono: ambience.js puts it left or right by where
#      it is. The rest (the air all round) stay stereo.
#   2b. A layer in STEADY has its swells smoothed: the grass she goes through came with a swish of its own every 0.75 s or
#      so (15 dB from its quietest to its loudest), a pace of its own, which would beat against her steps at any pace but
#      that one. Its level over each 50 ms is brought most of the way (STEADY[layer]) to its level over 1.5 s round it, by
#      no more than STEADY_MOST dB, all of it worked out round the loop so that its end still meets its start.
#   3. Made small: MP3, STEREO_RATE for the stereo ones, MONO_RATE for the mono ones.
# How loud each layer then plays, and when, is ambience.js's and the page's to say.

import sys, os, json, subprocess
import numpy as np

SR = 44100
LEVEL = -30.0             # dB, A-weighted: every loop's loudness where it is loud
PLAIN = -20.0             # dB: no loop's plain (unweighted) level where it is loud over this
CEILING = -2.0            # dB: no loop's peak over this
STEREO_RATE, MONO_RATE = '96k', '64k'
STEADY = {'brush': 0.75}  # how much of a layer's swells is smoothed away (see 2b)
STEADY_MOST = 9.0         # dB: no more than this up or down

LAYERS = {      # layer: (its loops, has a place?)
    'wind':   (['wind-1', 'wind-2'], False),        # a breeze in the meadow's grass
    'birds':  (['birds-1', 'birds-2'], False),      # songbirds, by day
    'night':  (['night-1', 'night-2'], False),      # crickets
    'dry':    (['dry-1'], False),                   # the cursed land's hollow wind
    'crows':  (['crows-1'], False),                 # crows and dry wood creaking, far off (the cursed land)
    'brook':  (['stream-1', 'stream-2', 'stream-3', 'stream-4'], True),  # a stream over pebbles along its bank (a brook's babbling
                                                    # over stones, one loop, at first: "อยากได้เสียง water stream เวลาเดินริมน้ำ")
    'river':  (['river-1', 'river-2', 'river-3', 'river-4'], True),      # the river away from the falls: slow, lapping along its bank
    'rapids': (['rapids-1', 'rapids-2', 'rapids-3', 'rapids-4'], True),  # ... near a fall: rushing, heavy
    'fall':   (['fall-1', 'fall-2'], True),         # a waterfall into its pool
    'leaves': (['leaves-1'], True),                 # wind in a tree's crown
    'abyss':  (['abyss-1', 'abyss-2'], True),       # the wind out of the pit
    'frogs':  (['frogs-1', 'frogs-2'], True),       # frogs by a pond at dusk
    'windmill': (['windmill-1', 'windmill-2', 'windmill-3'], True),      # the windmill's sails going round: its wood creaking, the sails passing
    'wheel':  (['wheel-1', 'wheel-2', 'wheel-3', 'wheel-4'], True),      # the water wheel: water pouring off its paddles, its axle
    'brush':  (['brush-1', 'brush-2', 'brush-3', 'brush-4'], True),      # grass parted as she goes through it (hers: in the middle, so mono). 15 s each
}

db = lambda v: 20 * np.log10(max(float(v), 1e-12))
amp = lambda d: 10 ** (d / 20)


def read(path):
    """the loop as two channels of floats (samples x 2)"""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64).reshape(-1, 2)


def a_weighted(x):
    f = np.fft.rfftfreq(len(x), 1 / SR)
    f2 = f * f
    a = (12194.0 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194.0 ** 2) + 1e-30)
    return np.fft.irfft(np.fft.rfft(x) * a * amp(2.0), len(x))


def steady(x, much):
    """x (samples x channels, a loop) with its swells smoothed: its level over 50 ms brought much of the way to its level over
    1.5 s round it, by STEADY_MOST dB at most; worked out round the loop, so its end still meets its start"""
    hop = int(0.05 * SR); n = len(x) // hop
    m = x.mean(axis=1)[:n * hop].reshape(n, hop)
    now = 10 * np.log10(np.mean(m * m, axis=1) + 1e-20)                              # dB, each 50 ms
    k = int(1.5 / 0.05) | 1
    wide = np.concatenate([now[-k:], now, now[:k]])                                   # (round the loop)
    around = np.convolve(wide, np.ones(k) / k, mode='same')[k:k + n]
    g = np.clip(much * (around - now), -STEADY_MOST, STEADY_MOST)
    g = np.convolve(np.concatenate([g[-3:], g, g[:3]]), np.ones(3) / 3, mode='same')[3:3 + n]      # (no step from one 50 ms to the next)
    at = (np.arange(n) + 0.5) * hop
    gs = np.interp(np.arange(len(x)), np.concatenate([[at[-1] - len(x)], at, [at[0] + len(x)]]), np.concatenate([[g[-1]], g, [g[0]]]))
    return x * amp(gs)[:, None]


def where_loud(x, secs=0.4, q=95):
    """x's level where it is loud: the q-th hundredth of its RMS over windows of that length"""
    n = int(secs * SR)
    c = np.concatenate(([0.0], np.cumsum(x * x)))
    rms = np.sqrt(np.maximum(0, (c[n::n // 4] - c[:-n:n // 4]) / n))
    return float(np.percentile(rms, q))


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: python3 tools/make-ambience.py SOURCE_DIR')
    src = sys.argv[1]
    out_dir = os.path.join('assets', 'audio', 'ambience')
    os.makedirs(out_dir, exist_ok=True)
    meta = {'layers': {}, 'from': 'ElevenLabs Sound Effects v3 (elevenlabs.io)'}
    total = 0
    print('%-9s %-9s %6s %8s %8s %7s %6s %6s' % ('layer', 'loop', 'secs', 'was', 'gain', 'loud', 'peak', 'kB'))
    for layer, (names, placed) in LAYERS.items():
        meta['layers'][layer] = []
        for name in names:
            path = os.path.join(src, name + '.mp3')
            if not os.path.isfile(path): sys.exit('not found: ' + path)
            x = read(path)
            if layer in STEADY: x = steady(x, STEADY[layer])
            mono = x.mean(axis=1)
            was = where_loud(a_weighted(mono))
            g = amp(LEVEL) / was
            g = min(g, amp(PLAIN) / where_loud(mono), amp(CEILING) / np.abs(x).max())
            y = (mono[:, None] if placed else x) * g
            mp3 = os.path.join(out_dir, name + '.mp3')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(y.shape[1]), '-i', '-',
                            '-codec:a', 'libmp3lame', '-b:a', MONO_RATE if placed else STEREO_RATE, '-map_metadata', '-1', mp3],
                           input=np.clip(y, -1, 1).astype('<f4').tobytes(), check=True)
            # ---- read back and checked: as long as it was, as loud as meant, its end meeting its start
            back = read(mp3)
            bm = back.mean(axis=1)
            if abs(len(back) - len(x)) > 64: sys.exit('CHECK FAILED %s: %d samples, was %d' % (name, len(back), len(x)))
            step = np.sqrt(np.mean(np.diff(bm) ** 2)); jump = abs(bm[0] - bm[-1]) / (step + 1e-12)
            if jump > 8: sys.exit('CHECK FAILED %s: a jump of %.1f steps where its end meets its start' % (name, jump))
            size = os.path.getsize(mp3); total += size
            meta['layers'][layer].append({'file': 'ambience/%s.mp3' % name, 'secs': round(len(x) / SR, 3)})
            print('%-9s %-9s %6.2f %7.1fdB %+7.1fdB %6.1fdB %5.1fdB %5.0f%s' % (layer, name, len(x) / SR, db(was), db(g), db(where_loud(a_weighted(bm))), db(np.abs(back).max()), size / 1000, '  mono' if placed else ''))
    with open(os.path.join('assets', 'audio', 'ambience.json'), 'w') as f:
        json.dump(meta, f, separators=(',', ':'))
        f.write('\n')
    print('\n%d loops, %.1f MB in all (each is fetched only when its layer is first heard)' % (sum(len(v) for v in meta['layers'].values()), total / 1e6))


if __name__ == '__main__':
    main()
