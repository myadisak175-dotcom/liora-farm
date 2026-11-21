# make-step-sounds.py  —  her steps heard: the sounds of her feet, cut, levelled and packed into one file
#
# Writes assets/audio/steps.mp3 and assets/audio/steps.json: every sound step-sounds.js plays, one after another in one
# file (one request, one thing to decode), and where each one lies in it. Run from the repository's root:
#
#   python3 tools/make-step-sounds.py  SOURCE_DIR
#
#   SOURCE_DIR   the recordings the user chose on 21 Nov 2026, all made with ElevenLabs' Sound Effects v3, under these
#                names (as they came some had Thai names, lost on the way here, and the rest were all content_N.mp3:
#                which is which was told by what is in them):
#                  walk-*.mp3 (walk-1 .. walk-4)   8 s each: four takes of a slow walk on grass, a crisp brush of grass at
#                              each step and silence between ("เอานี้ไปเบลนให้เข้ากันเลยค่ะ": take these and blend them so
#                              they go together). Asked for with: "Light footsteps walking slowly on soft short grass,
#                              gentle crisp grass crunch on each step, clear silence between steps, close-mic, clean
#                              quiet background" (prompt influence 0.5)
#                  tread.mp3   10 s: the walk on grass sent first (it came as walkeongrass.mp3): low footfalls, quiet
#                              and hissy. No longer her walk in grass; its footfalls are her steps where there is none
#                  run-*.mp3   a run on grass: takes like the walk's, asked for after the first run (3 s of quick steps in
#                              one unbroken rustle) was found to sound like running on earth ("วิ่งบนหญ้าเสียงเหมือนวิ่งบน
#                              ดินเลย"): "Light quick footsteps running on soft short grass, short crisp grass crunch on
#                              each step, clear silence between steps, close-mic, clean quiet background". Until they are
#                              there the set is empty, and step-sounds.js runs her on the walk's steps
#                  land.mp3     2 s: a brush of grass, then one soft thud
#                  gust.mp3     5 s: one gust of wind, rising and dying away
#                  swish-*.mp3, flutter-*.mp3, settle-*.mp3   about 1 to 1.5 s each, up to four takes of each,
#                              asked for to give her jumps more than one layer ("ต้องเบลนไม่ให้เสียงแบน": blended so they are not
#                              flat): her skirt swished ("Quick soft swish of a light cotton skirt, single short cloth whoosh"),
#                              her dress fluttering in the air ("Light cotton dress fluttering briefly in the air, soft fabric
#                              flapping"), cloth settling as she lands ("Soft cloth rustle settling down, light fabric dropping
#                              into place"), each with ", close-mic, clean quiet background".
#                              Whichever are there are used; a set with none is left empty (nothing is heard for it)
#                  wade-*.mp3, splash-*.mp3, stroke-*.mp3   the water ("เสียงน้ำค่ะ"), up to four takes of each: "Single
#                              footstep wading through shallow water, soft splash and swish around the ankle"; "Small light
#                              body splashing down into water, bright short splash with falling droplets"; "Single gentle
#                              swimming stroke, arm pulling through calm water, soft swirl and trickle"; each with ", close-mic,
#                              clean quiet background"
#                  glint-*.mp3   a magic circle opening under her. A chime was made first and not liked ("ไม่ชอบเสียง
#                              วิ้งของเวทอะ"); wanted instead: clear, light, short ("เสียงแบบใสๆ เบาๆ สั้นๆ"). Of the three kinds
#                              then made, the sparkles are the one kept (see 'glint', below):
#                                glint-1..4   "Tiny delicate magical sparkle, soft glassy twinkle, very short and light, gentle
#                                             and airy, no ringing tail": nearly all of it over 6 kHz
#                                glint-5..8   "Soft airy magical shimmer, light breathy sparkle rising briefly, delicate and
#                                             clear, very gentle": the same, a little longer and airier
# (needs ffmpeg with libmp3lame, and numpy. The recordings are not kept in the repository: only what is made from them.
#  The set before these, Kenney's Impact Sounds and Fantozzi's Footsteps, is gone from here and from the game.)
#
# WHAT IS IN IT (SETS, below). A set is a few takes of one sound, so no two steps running are the same take:
#   step    a foot coming down in grass, at a walk: the four takes' steps, blended into one set. Every sound of the four
#           is found (it stands clear of the hiss, with silence either side) and those that go together are kept (EACH,
#           below): well over the hiss, neither a scrap nor two sounds run into one, not too slow to rise, and of about
#           the others' brightness. All are then as loud as one another to the ear.
#           As they came they were much brighter than everything else she is heard by (two thirds of them over 2 kHz, a
#           third over 6 kHz; the run a fifth over 2 kHz, her dress a twentieth) and stood out of it ("เสียงเดินดังมาก
#           ชัดไป ไม่เบลนกับเสียงอื่นๆ เลย": the walk is very loud, too sharp, it does not blend with the other sounds at
#           all). So they are softened (the 6th thing in the set's line: a low-pass, its Hz and its poles), which brings
#           them to about the run's brightness, and are 6 dB under the run's steps (half as loud as they were)
#   tread   a foot coming down where there is no grass (earth, sand, stone, boards), and her hand and foot on a thing she
#           vaults: the first walk's footfalls, each by itself. Only the ones that stand well over that recording's hiss
#           to the ear (10 dB and more: twelve of some twenty-five sounds; its first three footfalls are clean but nearly
#           all low thump, and brought up to the others' loudness would be half hiss)
#   run     a foot coming down in grass at a run: every step of the run's four takes that fits, as for the walk, by a
#           rule of its own (the last thing in its line): a run's steps are shorter (0.08 to 0.3 s), and only those
#           with grass in them are kept (two fifths and more over 2 kHz): the takes have low thumps among them, a
#           foot on earth, which is what the first run was faulted for. Their loud middles, where the steps run
#           into one another, are left out as too long. Softened as the walk's are, and at the walk's level: a run
#           is louder than a walk by what step-sounds.js makes of her pace, not by its takes
#   land    her weight coming down: the thud (one take; the brush of grass before it is left out, a landing is heard as
#           her feet touch)
#   gust    the air taking her up as she leaves the ground: the gust from a quarter of a second before its top (as it
#           came it rises for a second and a half: she would be down again before it was there), a little past it, and
#           faded out over the rest: under a second in all, so it is the air of her jump and not a wind blowing (one)
#   swish, flutter, settle   her dress: as she kicks off a circle in the air or dashes (swish), as she flips (flutter),
#           as she lands (settle). Each take is all of its recording that stands over the hiss, at most so long (a 'take')
#           They came low (a third to three quarters of each under 300 Hz: a whump more than a rustle) and were too
#           quiet in the game ("เสียงผ้าพริ้วๆ มันเบาไปอะ": the fluttering cloth is too quiet, heard on a phone, whose
#           speaker gives little under 400 Hz). So they lose what lies under TAKE_HIGHPASS Hz, which leaves the light,
#           airy part of them, and that is brought up to a step's loudness (it was 4 to 6 dB under one)
#   plunge  into deep water from high ("อยากได้เสียงตอนลงน้ำแรงๆ กับลงจากสูง"). First "Heavy splash of a body plunging into
#           deep water from a height, big burst of water then soft bubbling": not what was meant, which was the sound
#           of a thing thrown into water ("เสียงแบบเราโยนของลงน้ำ เวลาคนตกน้ำอะ อยากได้เสียงแบบนั้น"). So: "Large heavy rock
#           dropped into deep water, deep hollow kerplunk with a low gulp and a short splash"; four takes, plunge-*.mp3
#   plop    into deep water from low: the same thing smaller. "Stone tossed into a calm pond, single plop with a soft
#           hollow gulp"; four takes, plop-*.mp3
#   thump   a landing from high: "Hard landing on soft grass after a high fall, solid deep thump with a short grass
#           rustle"; up to four, thump-*.mp3. These two keep more of their lows than the rest (TAKE_LOWS)
#   wetrun  a step in water at a run: a short splash (wade's takes are 0.6 s of wading, too long and slow for a run:
#           "เสียงวิ่งในน้ำก็ยังไม่ค่อยดี"). "Single quick light footstep running through shallow water, short crisp splash"
#   wade, splash, stroke   the water: a step in it, a splash (she lands in it, jumps out of it, goes in deep), a
#           swimming stroke. Each take all of its recording that stands over the hiss, at most so long (a 'take')
#   glint   a magic circle opening under her: the sparkle, the glassy takes and the airy ones (eight). step-sounds.js
#           plays one take for every circle of a flight, a little higher each time.
#           How it came to this: the droplet was the circle's note at first, with the sparkle over it; one of the two
#           was "like a bird" and did not go with the rest ("เอาอันใสๆ ออก เหมือนเสียงนก ยังไม่เข้ากัน"), and the sparkle was
#           taken for it and taken out, wrongly: it was the droplet ("เอาเสียงประกายกลับมา เอาเสียงหยดน้ำออก"). The droplet's
#           takes are not used any more
#
# WHAT IS DONE TO EACH TAKE
#   1. Read as mono, 44.1 kHz, less what lies under HIGHPASS Hz: a phone cannot play it, and it only takes room a louder
#      step could use.
#   2. Cut. A 'hit' (a footfall, the thud) is looked for near the moment given: it begins LEAD_IN before it first comes
#      within ONSET dB of its top (a take that begins late would be heard late against her foot) and ends where it has
#      died away (END dB under its top, or down in the recording's own hiss; LONGEST at most). A 'piece' is taken from
#      one moment to another as given. A 'burst' is a piece that begins no more than BURST_LEAD before its sound is
#      there (not used now: it was for the first run's footfalls). A 'take'
#      is all of a recording that stands over its hiss (EACH['out'] dB over its quietest twentieth), from EACH_LEAD
#      before its sound is there, at most so long (it fades out by then). 'each'
#      is every sound of the recording that fits (EACH), from where it rises out of the hiss (EACH_LEAD before its sound
#      is there, at most) to where it sinks back into it. Each has a fade at both ends.
#   3. Levelled by ear: its A-weighted level (the ear's own weighting: low thumps count for little), over its loudest
#      tenth of a second, is brought to the set's own level (the recordings came very quiet and not alike); a take that
#      would clip there is turned down until it does not. How loud each set then plays is step-sounds.js's to say.
#   4. Laid one after another with GAP of silence between.
# Each take's place is written with its length and its 'attack': how far in it the sound is really there (within 6 dB of
# its top). step-sounds.js begins a take that much early, so a sound that takes a moment to rise is heard as her foot
# lands and not after.
# Before them all comes a click at CLICK_AT seconds. An MP3 comes back from a decoder a little later than it went in, and
# not by the same amount in every browser; step-sounds.js finds the click and knows by how much, so each take is played
# from where it really begins.
# The file is checked as it is written: read back, the click found, every take's sound inside its place and silence between.
#
# NOT HEARD as this was made, only measured: where each sound begins, how sharply, how far over the hiss, how bright (the
# table this prints says, take by take, and which sounds of the walk were left out and why). To change what is used,
# change EACH or the moments in SETS (seconds into the recording) and run it again. Another take of the walk: put it
# beside the others as walk-5.mp3 and add its name to SOURCES and to the step set.

import sys, os, glob, json, subprocess, tempfile, wave
import numpy as np

SR = 44100
HIGHPASS = 160            # Hz: under this is cut
TAKE_HIGHPASS = 350       # Hz: ... and under this, of every 'take' (her dress: see 'swish', above)
ONSET, END = -12, -24     # dB under a hit's top: where it begins, where it has died away
OVER = 5                  # dB over the recording's own hiss: a hit is over there too, if that comes first
LEAD_IN, LONGEST, TAIL = 0.004, 0.2, 0.03       # s: before a hit's onset; a hit's most; after it has died away
ATTACK = -6               # dB under a take's top: from here the sound is there
BURST_LEAD = 0.02         # s: a burst begins this long before that, at most
EACH_LEAD = 0.06          # s: and one of 'each'
EACH = {                  # which sounds of a recording 'each' keeps
    'out': 8, 'join': 0.05,      # a sound: where the recording is this many dB over its hiss; a gap shorter than this (s) does not part it
    'clear': 20,                 # dB over the hiss, by ear, at least
    'length': (0.2, 0.5),        # s: shorter is a scrap, longer is two sounds or a drag
    'rise': 0.12,                # s to come within 6 dB of its top, at most
    'bright': (50, 80),          # % of it over 2 kHz: about the others' brightness
    'lead': EACH_LEAD,           # s: it begins this long before its sound is there, at most
}
CEILING = -1.0            # dB: no take's peak over this
GAP, CLICK_AT, FIRST = 0.12, 0.05, 0.25      # s: silence between takes; where the click is; where the first take begins
BITRATE = '96k'

SOURCES = {'tread': 'tread.mp3', 'land': 'land.mp3', 'gust': 'gust.mp3'}
EACHES = ('walk', 'run')      # recordings of an 'each' set: NAME-1.mp3, NAME-2.mp3 ... whichever are there
TAKES = ('swish', 'flutter', 'settle', 'glint', 'wade', 'wetrun', 'splash', 'stroke', 'plunge', 'plop', 'thump')
TAKE_LOWS = {'thump': 120, 'plunge': 160, 'plop': 160}      # Hz: what these keep under TAKE_HIGHPASS: a phone gives none of it, headphones its weight      # recordings of a 'take' set: NAME-1.mp3, NAME-2.mp3 ... whichever are there
SETS = {      # name: (recordings, 'each' | 'hit' | 'piece' | 'burst' | 'take', its level by ear (dB), fades in and out (s), where: a hit's moment, a piece's from and to, a take's most (s)
              #        and, if it is softened, the low-pass: (Hz, poles); and, of an 'each', what its rule says otherwise than EACH)
    'step':  (('walk',), 'each', -32.0, (0.015, 0.08), None, (2000, 1)),
    'run':   (('run',),  'each', -32.0, (0.01, 0.06),  None, (2000, 1), {'length': (0.08, 0.3), 'clear': 14, 'bright': (40, 80), 'join': 0.04, 'lead': 0.03}),
    'tread': (('tread',), 'hit',   -26.0, (0.001, 0.03), [4.12, 4.44, 4.72, 5.32, 5.66, 5.94, 6.26, 6.56, 7.18, 8.18, 8.54, 8.97], (4000, 2)),      # (softened: its hiss, brought up with it, was a third of it)
    'land':  (('land',),  'hit',   -23.0, (0.001, 0.04), [1.16]),
    'gust':  (('gust',),  'piece', -30.0, (0.12, 0.45),  [(1.6, 2.45)]),
    'swish':   (('swish',),   'take', -26.0, (0.005, 0.12), 0.7),
    'flutter': (('flutter',), 'take', -26.0, (0.01, 0.25),  1.1),
    'settle':  (('settle',),  'take', -28.0, (0.005, 0.15), 0.7),
    'glint':   (('glint',),   'take', -31.0, (0.003, 0.25), 0.8),
    'wade':    (('wade',),    'take', -29.0, (0.005, 0.12), 0.6),
    'wetrun':  (('wetrun',),  'take', -30.0, (0.003, 0.1),  0.4),
    'splash':  (('splash',),  'take', -23.0, (0.003, 0.3),  1.2),
    'stroke':  (('stroke',),  'take', -30.0, (0.01, 0.25),  0.9),
    'plunge':  (('plunge',),  'take', -22.0, (0.003, 0.3),  1.3),
    'plop':    (('plop',),    'take', -24.0, (0.003, 0.2),  0.9),
    'thump':   (('thump',),   'take', -27.0, (0.002, 0.15), 0.6),      # (four fifths of it under 300 Hz: louder by ear than this and its low thud would clip)
}

db = lambda v: 20 * np.log10(max(float(v), 1e-12))
amp = lambda d: 10 ** (d / 20)


def read(path, highpass):
    cmd = ['ffmpeg', '-v', 'error', '-i', path]
    if highpass: cmd += ['-af', 'highpass=f=%d:poles=2' % (HIGHPASS if highpass is True else highpass)]
    cmd += ['-f', 'f32le', '-ac', '1', '-ar', str(SR), '-']
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


def level(x, secs):
    """x's RMS over a window of that length, about every sample"""
    n = max(1, int(secs * SR))
    c = np.concatenate(([0.0], np.cumsum(x * x)))
    e = np.sqrt(np.maximum(c[n:] - c[:-n], 0) / n)
    return np.concatenate((np.full(n // 2, e[0]), e, np.full(len(x) - len(e) - n // 2, e[-1])))


def hit(x, about):
    """where the sound near `about` begins and ends (samples)"""
    quick, slow = level(x, 0.003), level(x, 0.02)
    quiet = np.percentile(slow, 20) * amp(OVER)            # (the recording's own hiss, and a little: a sound is over when it is down in it)
    a, b = int((about - 0.05) * SR), int((about + 0.06) * SR)
    top_at = a + int(np.argmax(quick[a:b]))
    top = quick[top_at]
    i = top_at
    while i > 0 and quick[i] > top * amp(ONSET): i -= 1
    j = top_at
    while j < len(x) - 1 and j - i < LONGEST * SR and slow[j] > max(top * amp(END), quiet): j += 1
    return max(0, i - int(LEAD_IN * SR)), min(len(x), j + int(TAIL * SR))


def softened(y, hz, poles):
    """y less its brightness: a low-pass of so many poles at hz (no shift in time)"""
    f = np.fft.rfftfreq(len(y), 1 / SR)
    return np.fft.irfft(np.fft.rfft(y) / np.sqrt(1 + (f / hz) ** (2 * poles)), len(y))


def faded(y, fade_in, fade_out):
    y = y.copy()
    n_in, n_out = min(len(y) // 4, int(fade_in * SR)), min(len(y) // 2, int(fade_out * SR))
    if n_in: y[:n_in] *= np.linspace(0, 1, n_in)
    if n_out: y[-n_out:] *= np.linspace(1, 0, n_out) ** 2
    return y


def sounds(x, hiss, EACH):
    """every sound of a recording, by the set's rule (EACH, and what the set says otherwise): (from, to, why it is left out or None), samples"""
    slow, quick = level(x, 0.02), level(x, 0.003)
    up = slow > np.percentile(slow, 20) * amp(EACH['out'])
    edges = list(np.flatnonzero(np.diff(up.astype(int))))
    if up[0]: edges.insert(0, 0)
    if up[-1]: edges.append(len(x) - 1)
    spans = []
    for a, b in zip(edges[0::2], edges[1::2]):
        if spans and a - spans[-1][1] < EACH['join'] * SR: spans[-1][1] = b
        else: spans.append([a, b])
    out = []
    for a, b in spans:
        if b - a < 0.06 * SR: continue            # (a tick)
        y, q = x[a:b], quick[a:b]
        clear = db(loudest(a_weighted(y))) - hiss
        rise = int(np.argmax(q >= q.max() * amp(ATTACK))) / SR
        S = np.abs(np.fft.rfft(y)) ** 2
        bright = 100 * S[np.fft.rfftfreq(len(y), 1 / SR) >= 2000].sum() / S.sum()
        # two sounds run into one: after its top it falls 8 dB and comes up 6 again
        e = slow[a:b][::int(0.02 * SR)]
        top = int(np.argmax(e)); low, again = e[top], False
        for v in e[top:]:
            low = min(low, v)
            if v > low * amp(6) and low < e[top] * amp(-8): again = True
        why = ('a scrap (%.0f ms)' % (1000 * (b - a) / SR) if b - a < EACH['length'][0] * SR else
               'too long (%.0f ms)' % (1000 * (b - a) / SR) if b - a > EACH['length'][1] * SR else
               'two sounds in one' if again else
               'only %+.0f dB over the hiss' % clear if clear < EACH['clear'] else
               'slow to rise (%.0f ms)' % (1000 * rise) if rise > EACH['rise'] else
               'duller than the others (%.0f%% over 2 kHz)' % bright if bright < EACH['bright'][0] else
               'brighter than the others (%.0f%% over 2 kHz)' % bright if bright > EACH['bright'][1] else None)
        out.append((a, b, why))
    return out


def take(x, most):
    """all of a short recording that stands over its hiss: (from, to) in seconds (cut to its most once its beginning is settled, in main)"""
    slow = level(x, 0.02)
    over = np.flatnonzero(slow > max(np.percentile(slow, 5) * amp(EACH['out']), slow.max() * amp(-50)))      # (... and within 50 dB of its top: a take that came in dead silence ends where it has died away)
    if not len(over): return (0.0, min(len(x) / SR, most))
    return (over[0] / SR, over[-1] / SR)


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: python3 tools/make-step-sounds.py SOURCE_DIR     (walk-*.mp3, run-*.mp3, tread.mp3, land.mp3, gust.mp3, wetrun-*.mp3, swish-*.mp3, flutter-*.mp3, settle-*.mp3, drop-*.mp3, glint-*.mp3, wade-*.mp3, splash-*.mp3, stroke-*.mp3: see the top of this file)')
    heard, hiss = {}, {}
    for name, fn in SOURCES.items():
        path = os.path.join(sys.argv[1], fn)
        if not os.path.isfile(path): sys.exit('not found: %s' % path)
        heard[name] = read(path, True)
        hiss[name] = db(np.percentile(level(a_weighted(heard[name]), 0.1), 20))      # (the recording's own hiss, by ear)
    found = {}
    for name in EACHES:
        found[name] = []
        for path in sorted(glob.glob(os.path.join(sys.argv[1], name + '-*.mp3'))):
            key = os.path.basename(path)[:-4]
            heard[key] = read(path, True)
            hiss[key] = db(np.percentile(level(a_weighted(heard[key]), 0.1), 20))
            found[name].append(key)
        if not found[name]: print('(no %s-*.mp3: its set is left empty)' % name)
    for name in TAKES:
        found[name] = []
        for path in sorted(glob.glob(os.path.join(sys.argv[1], name + '-*.mp3'))):
            key = os.path.basename(path)[:-4]
            heard[key] = read(path, TAKE_LOWS.get(name, TAKE_HIGHPASS))
            hiss[key] = db(np.percentile(level(a_weighted(heard[key]), 0.1), 5))      # (its quietest: a short take is mostly sound)
            found[name].append(key)
        if not found[name]: print('(no %s-*.mp3: the %s set is left empty)' % (name, name))
    out_dir = os.path.join('assets', 'audio')
    os.makedirs(out_dir, exist_ok=True)

    # the click: 3 ms of 2 kHz under a Hann window, its middle at CLICK_AT
    n = int(0.003 * SR)
    click = 0.5 * np.hanning(n) * np.cos(2 * np.pi * 2000 * (np.arange(n) - n / 2) / SR)
    track = np.zeros(int(FIRST * SR))
    c0 = int(CLICK_AT * SR) - n // 2
    track[c0:c0 + n] += click

    sets, places = {}, []
    print('%-6s %-19s %6s %7s %7s %7s %6s  %s' % ('set', 'from', 'length', 'attack', 'loud', 'gain', 'peak', 'as it came, and over its recording\'s hiss'))
    left = []
    for name, (sources, kind, want, fades, where, *soft) in SETS.items():
      sets[name] = []
      for source in (found[sources[0]] if kind in ('take', 'each') else sources):
        x = heard[source]
        if kind == 'each':
            rule = {**EACH, **(soft[1] if len(soft) > 1 else {})}
            those = sounds(x, hiss[source], rule)
            left += ['%s %.2f s: %s' % (source, a / SR, why) for a, b, why in those if why]
            where = [(a / SR, b / SR) for a, b, why in those if not why]
        if kind == 'take':
            where = [take(x, SETS[name][4])]
        for w in where:
            a, b = hit(x, w) if kind == 'hit' else (int(w[0] * SR), int(w[1] * SR))
            if kind in ('burst', 'each', 'take'):
                quick = level(x[a:b], 0.003)
                a = max(a, a + int(np.argmax(quick >= quick.max() * amp(ATTACK))) - int((BURST_LEAD if kind == 'burst' else rule['lead'] if kind == 'each' else EACH_LEAD) * SR))
            if kind == 'take': b = min(b, a + int(SETS[name][4] * SR))            # (at most so long, from where it begins)
            y = faded(softened(x[a:b], *soft[0]) if soft and soft[0] else x[a:b], *fades)
            came = db(loudest(a_weighted(y)))
            g = amp(want) / loudest(a_weighted(y))
            held = g > amp(CEILING) / np.abs(y).max()
            if held: g = amp(CEILING) / np.abs(y).max()            # (never over the ceiling)
            y = y * g
            quick = level(y, 0.003)
            attack = int(np.argmax(quick >= quick.max() * amp(ATTACK))) / SR
            start = len(track) / SR
            track = np.concatenate((track, y, np.zeros(int(GAP * SR))))
            sets[name].append([round(start, 4), round(len(y) / SR, 4), round(attack, 4)])
            label = '%s %.3f-%.3f' % (source, a / SR, b / SR)
            places.append((name, label, start, len(y) / SR))
            print('%-6s %-19s %5.0fms %5.0fms %6.1fdB %+6.1fdB %5.1fdB  %.1f dB, %+.0f dB%s' % (name, label, 1000 * len(y) / SR, 1000 * attack, db(loudest(a_weighted(y))), db(g), db(np.abs(y).max()), came, came - hiss[source],
                                                                               '  (held under the ceiling: quieter than its set)' if held else ''))

    if left: print('\nleft out of the walk and the run:\n   ' + '\n   '.join(left))
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'steps.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(track, -1, 1) * 32767).astype('<i2').tobytes())
        mp3 = os.path.join(out_dir, 'steps.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', BITRATE, '-map_metadata', '-1', mp3], check=True)
    meta = {
        'file': 'steps.mp3', 'click': CLICK_AT, 'sets': sets,      # (a take: where it begins in the file, its length, its attack; seconds)
        'from': 'Recordings made with ElevenLabs Sound Effects v3 (elevenlabs.io), chosen by the user on 21 Nov 2026',
    }
    with open(os.path.join(out_dir, 'steps.json'), 'w') as f:
        json.dump(meta, f, separators=(',', ':'))
        f.write('\n')

    # ---- read back and checked
    back = read(mp3, False)
    k = int(np.argmax(np.abs(back[:int(FIRST * SR)])))
    shift = k / SR - CLICK_AT
    worst_in, worst_gap = 0.0, -200.0
    for name, label, start, length in places:
        a, b = int((start + shift) * SR), int((start + shift + length) * SR)
        inside = np.sqrt(np.mean(back[a:b] ** 2))
        before = np.sqrt(np.mean(back[a - int(0.05 * SR):a - int(0.01 * SR)] ** 2))
        worst_in = min(worst_in, db(inside)) if worst_in else db(inside)
        worst_gap = max(worst_gap, db(before))
        if db(before) > -50 or db(inside) < -50: sys.exit('CHECK FAILED at %s %s: %.1f dB inside, %.1f dB before it' % (name, label, db(inside), db(before)))
    size = os.path.getsize(mp3)
    print('\nassets/audio/steps.mp3: %.1f s, %d takes, %.0f kB; read back %.1f ms late (the click). Quietest take %.1f dB, loudest silence before a take %.1f dB: ok' % (
        len(track) / SR, len(places), size / 1000, 1000 * shift, worst_in, worst_gap))


if __name__ == '__main__':
    main()
