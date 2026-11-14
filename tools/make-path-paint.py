# make-path-paint.py  —  the soft paths' painted look: trodden sandy earth laid in with a brush, smooth and warm; and, with
# the same brush, the sand of the water's banks
#
# Writes assets/ground/path-paint.webp: 768 x 768, seamless both ways, to be laid on the ways about 4 m to a repeat
# (ground-paths.js, style 'soft': hill-village-level.js asks for it). It is the earth's own colour only; what makes a path
# of it is painted in the game, where the path is known: lighter down the worn middle, broad soft patches of deeper tone,
# the edge going to dry grass and fading into the meadow. So this picture is kept quiet:
#   1. broad drifts of tone, as a wash dries unevenly;
#   2. dabs of the brush over them, a shade lighter or darker, soft-edged, lying every which way;
#   3. a few soft damp patches;
#   4. a scatter of small pebbles (a dark dot with a light side) and pale grains, few enough to read as a painted path and
#      not as gravel;
#   5. a little grain of the paper.
#
# `sand` writes assets/ground/sand-paint.webp instead: the banks' sand (stylized-terrain.js lays it on them, at the ways' own
# size, when hill-village-level.js hands it over). The same brush and the same colours a step paler, quieter dabs, few
# pebbles and many fine grains, light and dark: so the beach and the ways read as one ground. Wet sand is not painted here:
# the game darkens the sand toward the water, wherever the water is.
#
#   python3 tools/make-path-paint.py            (Termux: pip install numpy scipy pillow)
#   python3 tools/make-path-paint.py sand
#
# To change the colours: PALETTE, dark to light. To change how it is laid on: DABS, DAMP, PEBBLES, GRAINS (each look's own, in LOOKS).
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

N = 768
LOOKS = {
    'path': dict(                                                     # the ways' earth
        out='path-paint.webp', seed=23,
        PALETTE=['#a5874f', '#c4a360', '#dcc07c', '#ead292', '#f4e2ac'],      # a pebble's shadow, damp earth, the earth itself, dry and trodden, the palest grains
        DABS=(260, (36, 150), (16, 46), (0.08, 0.20)),                       # how many dabs, how long, how wide (px), how much lighter or darker (of the palette's whole range)
        DAMP=(9, (110, 220), 0.09),                                          # how many damp patches, how big (px), how much darker
        PEBBLES=(30, (4.0, 9.5)),                                            # how many pebbles, how big (px across: 192 px is a metre)
        GRAINS=[(110, (1.2, 2.4), 0.2)]),                                    # how many grains, how big, how much lighter (under 0: darker)
    'sand': dict(                                                     # the banks' sand
        out='sand-paint.webp', seed=41,
        PALETTE=['#b89a64', '#d4b97c', '#e4cc90', '#eedba6', '#f7ebc6'],      # a pebble's shadow, damp sand, the sand itself, dry and pale, the palest grains
        DABS=(250, (40, 160), (16, 46), (0.09, 0.20)),
        DAMP=(5, (120, 240), 0.06),
        PEBBLES=(10, (3.5, 7.5)),
        GRAINS=[(280, (1.2, 2.2), 0.18), (150, (1.0, 1.8), -0.2)]),
}
look = LOOKS[sys.argv[1] if len(sys.argv) > 1 else 'path']
OUT = Path(__file__).resolve().parent.parent / 'assets/ground' / look['out']
rng = np.random.default_rng(look['seed'])
PALETTE, DABS, DAMP, PEBBLES, GRAINS = (look[k] for k in ('PALETTE', 'DABS', 'DAMP', 'PEBBLES', 'GRAINS'))
pal = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in PALETTE], float) / 255
sm = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))


def periodic(cells, octaves=3):
    """smooth noise 0..1 that repeats at the picture's edges"""
    out = np.zeros((N, N)); amp = 1.0; tot = 0.0
    for o in range(octaves):
        g = rng.random((cells * 2 ** o, cells * 2 ** o))
        out += amp * ndi.zoom(g, N / g.shape[0], order=3, mode='grid-wrap', grid_mode=True); tot += amp; amp *= 0.5
    out /= tot
    return (out - out.min()) / (out.max() - out.min())


def colour(t):
    """a tone 0 (darkest) .. 1 (palest) -> a colour of the palette"""
    t = np.clip(t, 0, 1) * (len(pal) - 1); i = np.minimum(t.astype(int), len(pal) - 2); f = (t - i)[..., None]
    return pal[i] * (1 - f) + pal[i + 1] * f


yy, xx = np.mgrid[0:N, 0:N].astype(float)
wrap = lambda d: (d + N / 2) % N - N / 2                               # a distance across the picture's edge


def blob(cx, cy, a, b, ang, wob=0.0):
    """how far inside an ellipse each point is: 0 at its middle .. 1 at its outline (the outline wavers by wob)"""
    dx, dy = wrap(xx - cx), wrap(yy - cy); c, s = np.cos(ang), np.sin(ang)
    return np.hypot((dx * c + dy * s) / a, (-dx * s + dy * c) / b) + wob


# ---- 1. broad drifts: the earth itself, a little lighter here, a little damper there
t = 0.5 + (periodic(3, 3) - .5) * 0.16
# ---- 2. dabs of the brush
waver = (periodic(24, 2) - .5) * 0.5                                  # (the same wavering for every dab's outline: a brush's ragged edge)
n, length, width, tone = DABS
for _ in range(n):
    a, b = rng.uniform(*length) / 2, rng.uniform(*width) / 2
    r = blob(rng.uniform(0, N), rng.uniform(0, N), a, b, rng.uniform(0, np.pi), waver)
    t += rng.choice([-1, 1]) * rng.uniform(*tone) * (1 - sm(0.45, 1.0, r))
t = ndi.gaussian_filter(t, 1.7, mode='wrap')                          # wet into wet: no dab has a hard edge
# ---- 3. damp patches
n, size, dark = DAMP
for _ in range(n):
    a = rng.uniform(*size) / 2; r = blob(rng.uniform(0, N), rng.uniform(0, N), a, a * rng.uniform(0.5, 0.9), rng.uniform(0, np.pi), waver * 1.6)
    t -= dark * (1 - sm(0.3, 1.0, r))
t = np.clip(t, 0.30, 0.78)                                            # (kept between damp earth and dry: the pebbles and grains go beyond)
# ---- 4. pebbles and grains
n, size = PEBBLES
for _ in range(n):
    cx, cy, a = rng.uniform(0, N), rng.uniform(0, N), rng.uniform(*size) / 2; ang = rng.uniform(0, np.pi)
    body = 1 - sm(0.7, 1.05, blob(cx, cy, a * rng.uniform(1.0, 1.5), a, ang))
    lit = 1 - sm(0.5, 1.0, blob(cx - a * 0.45, cy - a * 0.45, a * 0.75, a * 0.6, ang))      # light from the upper left
    t = t * (1 - body) + body * (0.12 + 0.5 * lit)
    shadow = (1 - sm(0.6, 1.3, blob(cx + a * 0.7, cy + a * 0.8, a * 1.3, a * 1.0, ang))) * (1 - body)
    t -= 0.10 * shadow
for n, size, tone in GRAINS:
    for _ in range(n):
        a = rng.uniform(*size)
        t += tone * (1 - sm(0.4, 1.0, blob(rng.uniform(0, N), rng.uniform(0, N), a, a, 0)))
# ---- 5. the paper's grain
t += (rng.random((N, N)) - .5) * 0.02
img = colour(t)
img = ndi.gaussian_filter(img, (0.5, 0.5, 0), mode='wrap')
Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(OUT, quality=90, method=6)
print(f'{OUT.name}: {N} x {N}, tones {t.min():.2f} .. {t.max():.2f}, {OUT.stat().st_size // 1024} kB')
