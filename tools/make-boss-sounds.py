# make-boss-sounds.py  —  the boss hall's sounds, made from the user's earshot renders: lowered, darkened, cut and levelled
#
# Writes assets/audio/boss/<name>.mp3, every file boss-hall-sounds.js plays. Run from the repository's root:
#
#   python3 tools/make-boss-sounds.py  SOURCE_DIR
#
#   SOURCE_DIR  the renders as the listening page "เสียงทดลอง Liora Farm" has them (made with earshot,
#               github.com/Leonxlnx/earshot, the tool the user sent; 48 kHz stereo mp3s named for what they are:
#               stone_door.mp3, fire_whoosh.mp3 ...: the names in SOUNDS, below). They are not kept in the repository.
# (needs ffmpeg with libmp3lame, and numpy.)
#
# WHAT IS DONE
#   Each sound of the hall is a part of one or more renders (from, seconds long), each part:
#   1. played slower (rate under 1: lower and longer together, as a tape played slow; the hall is huge and its door
#      9 m tall, so its stone, its iron and its fire are heavy), less what lies under hp and over lp (Hz; four poles
#      each). Nothing much is kept under ~60 Hz: a phone's speaker gives nothing there, and a deep sound is heard on one
#      by what it has between 150 and 600 Hz.
#   2. faded in and out (fade: s at its start, s at its end), laid where it starts in the sound (at, s) at its gain
#      (dB), mixed.
#   3. A loop (LOOPS) has its last XFADE seconds laid over its first, so its end meets its start; boss-hall-sounds.js
#      plays it from the first sound in it to the last (it skips the silence an mp3 has at its ends).
#   4. Levelled: its loud part (a single sound: its loudest 0.1 s; a loop: the 95th hundredth of its 0.4 s windows)
#      brought to LOUD dB (plain, not weighted), then turned down if its peak would be over CEILING dB (a loop in SOFT
#      has its peaks rounded off instead). The mp3 is decoded again and, if its peak came out over CEILING, made again
#      that much quieter.
#   5. Made small: MP3, mono (STEREO keeps both sides) at MONO_RATE, stereo at STEREO_RATE.
#   How loud each plays, from where in the hall, and how far into its echo is boss-hall-sounds.js's.

import sys, os, subprocess
import numpy as np

SR = 48000
CEILING = -1.5            # dB: no file's peak over this (an mp3 decoder overshoots a little)
MONO_RATE, STEREO_RATE = '64k', '96k'
XFADE = 1.5               # s: a loop's end laid over its start

# name: (its parts [(render, from s, seconds, rate, hp Hz, lp Hz, fade in s, fade out s, at s, gain dB)], LOUD dB)
SOUNDS = {
    # the door's runes waking: a magic portal opening, slow and low (its swell, the first of its pulses)
    'hum':    ([('magic_portal', 0.0, 2.4, 0.70, 90, 3000, 0.25, 0.9, 0.0, 0)], -20),
    # its bar giving way: the iron latch of a dungeon door, two clanks, slow and heavy
    'clunk':  ([('dungeon_door', 0.0, 0.42, 0.70, 70, 5000, 0.0, 0.15, 0.0, 0)], -13),
    # the leaves grinding open: a giant stone door grinding, slower (3.2 s: the scene's swing is 3.1 s)
    'grind':  ([('stone_door', 0.0, 2.15, 0.68, 60, 4000, 0.15, 0.6, 0.0, 0)], -16),
    # ... and meeting the walls: the same door's thud as it lands
    'thud':   ([('stone_door', 2.56, 1.24, 0.80, 55, 3500, 0.005, 0.45, 0.0, 0)], -11),
    # a fire catching: a burst of flame, a little larger
    'fire':   ([('fire_whoosh', 0.0, 1.7, 0.85, 80, 7000, 0.01, 0.5, 0.0, 0)], -16),
    # the circle waking under her feet, the fires turning red: low, echoing, awful, of stone (the user: "อยากให้เป็น ก้อง
    # ต่ำ น่าเกรงขาม มีเสียงหินด้วยยิ่งดี"): air drawn in to a heavy hit and a giant's footfall under it; then the hall's
    # stone groaning (the stone door, very slow), the mountain rumbling (an avalanche, slow and dull), stones and dust
    # falling from the dome, the fires' roar low under it, and a moan swelling out of the deep (a whale's call, very slow)
    'boom':   ([('impact_suck', 0.35, 0.65, 0.60, 35, 4000, 0.02, 0.35, 0.0, 0),
                ('giant_footsteps', 0.0, 0.6, 0.45, 30, 600, 0.002, 0.4, 0.18, 0),
                ('stone_door', 0.2, 1.8, 0.42, 40, 1500, 0.4, 1.6, 0.3, -3),
                ('avalanche', 0.8, 3.8, 0.60, 30, 450, 0.2, 2.5, 0.22, -4),
                ('rocks_tumbling', 0.0, 3.3, 0.80, 150, 3000, 0.3, 1.5, 0.5, -11),
                ('dragon_fire', 0.3, 2.5, 0.65, 60, 1600, 0.3, 1.4, 0.35, -12),
                ('whale_call', 1.3, 3.7, 0.55, 40, 1200, 1.5, 2.0, 0.6, -6)], -10),
    # a statue's eyes lighting: a sword's ring on a shield, from the strike on, lower (each a little lower again, in
    # boss-hall-sounds.js)
    'eye':    ([('sword_on_shield', 0.17, 0.93, 0.80, 150, 6000, 0.002, 0.35, 0.0, 0)], -18),
    # a heart beating under it all, once the statues are awake: a giant's step (heel and toe: lub, dub), very slow
    'heart':  ([('giant_footsteps', 0.0, 0.55, 0.55, 40, 400, 0.002, 0.25, 0.0, 0)], -14),
    # water dripping somewhere in the dark (the hall's air, now and then, each from a place of its own)
    'drip1':  ([('drip_plink', 0.0, 0.3, 0.85, 200, 8000, 0.0, 0.08, 0.0, 0)], -22),
    'drip2':  ([('drip_bloop', 0.0, 0.4, 0.85, 200, 8000, 0.0, 0.1, 0.0, 0)], -22),
    # far off in the dark, now and then: small stones falling (a rockfall's patter), a stone knocking on the floor and
    # ringing (a wizard's staff on stone, slow), the stone itself groaning somewhere (the door's grind, very slow), and the
    # air sighing through the hall (a ghost passing, slow), which boss-hall-sounds.js moves from one side to the other
    'pebbles1': ([('rocks_tumbling', 0.15, 1.25, 0.85, 200, 4000, 0.02, 0.4, 0.0, 0)], -18),
    'pebbles2': ([('rocks_tumbling', 1.75, 1.15, 0.75, 200, 4000, 0.02, 0.4, 0.0, 0)], -18),
    'knock':  ([('wizard_staff', 0.44, 1.06, 0.60, 120, 3500, 0.002, 0.5, 0.0, 0)], -16),
    'groan':  ([('stone_door', 0.4, 1.5, 0.38, 40, 1000, 0.6, 1.4, 0.0, 0)], -20),
    'sigh':   ([('ghost_passing', 0.2, 3.8, 0.70, 120, 2200, 1.0, 1.8, 0.0, 0)], -24),
}
LOOPS = {
    # the hall's draft: a mountain's high wind, slower, from the oculus above and from the fallen tunnel behind the door
    # (boss-hall-sounds.js puts it in both places)
    'air':     ([('wind_mountain', 0.0, 12.0, 0.75, 150, 3000, 0.0, 0.0, 0.0, 0)], -28),
    # the hall's own mass, all round: deep water's rush, very slow and dull, a pressure more than a sound
    'room':    ([('underwater_deep', 0.0, 12.0, 0.55, 35, 300, 0.0, 0.0, 0.0, 0)], -30),
    # a fire burning: a campfire's crackle, darker (each lit fire near her has one of its own, from where it is)
    'crackle': ([('fire_camp', 0.0, 12.0, 0.92, 70, 3500, 0.0, 0.0, 0.0, 0)], -26),
    # the dread once the statues are awake: a whale's call far under water, very slow and low, a living drone
    'drone':   ([('whale_call', 1.3, 5.7, 0.55, 40, 1200, 0.0, 0.0, 0.0, 0)], -24),
}
STEREO = {'room', 'drone', 'boom', 'grind', 'hum', 'crackle'}
SOFT = {'crackle': -6.0}  # brought to its level and its peaks then rounded off toward this (dB; the fire's pops stood 30 dB
                          # over its roar)


def part(src, start, secs, rate, hp, lp):
    """a part of a render as two channels of floats: from start, secs long, played at rate, less under hp and over lp"""
    chain = f'asetrate={SR * rate:.0f},aresample={SR},' + f'highpass=f={hp},highpass=f={hp},lowpass=f={lp},lowpass=f={lp}'
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(start), '-t', str(secs), '-i', src, '-af', chain,
                          '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def faded(x, fin, fout):
    n = len(x)
    a, b = int(fin * SR), int(fout * SR)
    g = np.ones(n)
    if a > 0: g[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    if b > 0: g[n - b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return x * g[:, None]


def build(parts, src_dir):
    pieces = []
    for (name, start, secs, rate, hp, lp, fin, fout, at, db) in parts:
        x = faded(part(os.path.join(src_dir, name + '.mp3'), start, secs, rate, hp, lp), fin, fout) * 10 ** (db / 20)
        pieces.append((int(at * SR), x))
    n = max(o + len(x) for o, x in pieces)
    y = np.zeros((n, 2))
    for o, x in pieces: y[o:o + len(x)] += x
    return y


def looped(y):
    """its last XFADE seconds laid over its first (equal power), so its end meets its start"""
    c = int(XFADE * SR)
    t = np.linspace(0, np.pi / 2, c)[:, None]
    out = y[:len(y) - c].copy()
    out[:c] = y[:c] * np.sin(t) + y[len(y) - c:] * np.cos(t)
    return out


def rms_db(v): return 20 * np.log10(np.sqrt(np.mean(v ** 2)) + 1e-12)


def write(mp3, y, ch):
    data = (y if ch == 2 else y[:, :1]).astype(np.float32).tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', STEREO_RATE if ch == 2 else MONO_RATE, '-map_metadata', '-1', mp3],
                   input=data, check=True)


def decoded_peak(mp3):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', mp3, '-f', 'f32le', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return 20 * np.log10(np.abs(np.frombuffer(raw, np.float32)).max() + 1e-12)


def loud_db(y, loop):
    m = y.mean(axis=1)
    w = int((0.4 if loop else 0.1) * SR)
    hop = w // 4
    lv = [rms_db(m[i:i + w]) for i in range(0, max(1, len(m) - w), hop)]
    return float(np.percentile(lv, 95)) if loop else float(max(lv))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__ or 'usage: python3 tools/make-boss-sounds.py SOURCE_DIR')
    src_dir = sys.argv[1]
    out_dir = os.path.join('assets', 'audio', 'boss')
    os.makedirs(out_dir, exist_ok=True)
    print('%-8s %6s %7s %7s %6s %5s' % ('sound', 'secs', 'gain', 'loud', 'peak', 'kB'))
    for table, loop in ((SOUNDS, False), (LOOPS, True)):
        for name, (parts, target) in table.items():
            y = build(parts, src_dir)
            if loop: y = looped(y)
            if name not in STEREO: y = np.repeat(y.mean(axis=1, keepdims=True), 2, axis=1)
            g = target - loud_db(y, loop)
            peak = 20 * np.log10(np.abs(y).max() + 1e-12)
            if name in SOFT:
                y = y * 10 ** (g / 20)
                c = 10 ** (SOFT[name] / 20)
                y = np.sign(y) * np.where(np.abs(y) < c * 0.5, np.abs(y), c * 0.5 + c * 0.5 * np.tanh((np.abs(y) - c * 0.5) / (c * 0.5)))
            else:
                if peak + g > CEILING: g = CEILING - peak
                y = y * 10 ** (g / 20)
            ch = 2 if name in STEREO else 1
            mp3 = os.path.join(out_dir, name + '.mp3')
            for _ in range(3):                  # made, decoded again, made quieter if its peak came out over CEILING
                write(mp3, y, ch)
                over = decoded_peak(mp3) - CEILING
                if over <= 0.05: break
                y = y * 10 ** (-(over + 0.1) / 20)
            print('%-8s %6.2f %+7.1f %7.1f %6.1f %5d' % (name, len(y) / SR, g, loud_db(y, loop), decoded_peak(mp3),
                                                       os.path.getsize(mp3) // 1024))


if __name__ == '__main__':
    main()
