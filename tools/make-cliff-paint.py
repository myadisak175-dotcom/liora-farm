# make-cliff-paint.py  —  the cliffs' painted look: a picture of rock laid in with a brush, as in a watercolour background
#
# Writes assets/ground/cliff-paint.webp: 2048 x 1024, seamless both ways, to be laid on the cliffs 20 m along by 10 m up
# (hill-village-level.js hands it to the land's paint). It is painted here the way the reference was:
#   1. three tiers of rock one above the other, each lit along its top and falling into a brown shadow under the tier above;
#   2. the rock broken into chunky flat planes, longer than they are tall, each one a single tone of the palette (a plane high on
#      a tier is light, one under the next tier is dark). Neighbours of one tone run together into bigger shapes, as dabs of
#      one mix of paint do, and their outlines waver like a brush's;
#   3. a few broad, thin washes of the brush over that, their edges soft and wet;
#   4. the grain of the paper over everything.
#
#   python3 tools/make-cliff-paint.py            (Termux: pip install numpy scipy pillow)
#
# To change the colours: PALETTE, dark to light. To change how it is laid on: TIERS, PLANES, WASHES.
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

W, H = 2048, 1024
OUT = Path(__file__).resolve().parent.parent / 'assets/ground/cliff-paint.webp'
rng = np.random.default_rng(11)
PALETTE = ['#75675a', '#8f806f', '#a9947c', '#c2ac8d', '#d9c5a3']      # deep shadow, shadow, the rock itself, lit, the brightest planes
TIERS = 3                                                             # tiers of rock up the picture
PLANES = (260, 3.4)                                                   # how many planes of rock, and how much longer than tall
WASHES = (70, (180, 460), (40, 100), (0.14, 0.28))                    # how many washes, how long, how tall (px), how thin (alpha)
pal = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in PALETTE], float) / 255


def periodic(gw, gh, octaves=3):
    """smooth noise 0..1 that repeats at the picture's edges"""
    out = np.zeros((H, W)); amp = 1.0; tot = 0.0
    for o in range(octaves):
        g = rng.random((gh * 2 ** o, gw * 2 ** o))
        out += amp * ndi.zoom(g, (H / g.shape[0], W / g.shape[1]), order=3, mode='grid-wrap', grid_mode=True); tot += amp; amp *= 0.5
    out /= tot
    return (out - out.min()) / (out.max() - out.min())


def colour(t):
    """a tone 0 (deep shadow) .. 1 (brightest) -> a colour of the palette"""
    t = np.clip(t, 0, 1) * (len(pal) - 1); i = np.minimum(t.astype(int), len(pal) - 2); f = (t - i)[..., None]
    return pal[i] * (1 - f) + pal[i + 1] * f


yy, xx = np.mgrid[0:H, 0:W].astype(float)
# ---- 1. the tiers: how light the rock is at each height
wob = (periodic(6, 3, 3) - .5) * 130 + (periodic(20, 10, 2) - .5) * 36            # the tiers' lines wander
ph = ((yy + wob) / (H / TIERS)) % 1.0                                             # 0 at a tier's top .. 1 at its foot
tier = np.interp(ph, [0.0, 0.03, 0.2, 0.5, 0.78, 0.9, 0.96, 1.0], [0.4, 0.92, 0.86, 0.62, 0.5, 0.3, 0.02, 0.4])      # (the deep shadow is a thin line under the tier above, not a band)

# ---- 2. planes of rock: the nearest of a scatter of points owns each spot (measured as if the picture were squeezed
# sideways, so the planes come out long), and takes the tone of the tier where its own point lies
n, stretch = PLANES
wx = (periodic(28, 14, 2) - .5) * 46; wy = (periodic(28, 14, 2) - .5) * 26         # the outlines waver
pts = np.stack([rng.random(n) * W, rng.random(n) * H], 1)
big = np.stack([rng.random(36) * W, rng.random(36) * H], 1)                        # (and broader patches, so light planes keep company)


def owners(p, k):
    tiles = np.concatenate([p + [dx * W, dy * H] for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
    q = np.stack([(xx + wx).ravel() / stretch, (yy + wy).ravel()], 1)
    d, i = cKDTree(tiles * [1 / stretch, 1]).query(q, k=k)
    return d.reshape(H, W, -1) if k > 1 else d.reshape(H, W), (i % len(p)).reshape(H, W, -1) if k > 1 else (i % len(p)).reshape(H, W)


d2, i2 = owners(pts, 2); cell = i2[..., 0]; rim = d2[..., 1] - d2[..., 0]            # rim: how near the plane's edge
_, patch = owners(big, 1)
at = lambda p: tier[np.clip(p[:, 1].astype(int), 0, H - 1), np.clip(p[:, 0].astype(int), 0, W - 1)]
tone = (at(pts) + rng.normal(0, 0.09, n))[cell] + rng.normal(0, 0.04, len(big))[patch]
tone = np.round(np.clip(tone, 0, 1) * (len(pal) - 1)) / (len(pal) - 1)             # one of the palette's tones, nothing between
canvas = colour(tone)
canvas *= (1 - 0.035 * np.clip(1 - rim / 5.0, 0, 1))[..., None]                   # the faintest line where two dabs meet
canvas = np.stack([ndi.gaussian_filter(canvas[..., k], 2.6, mode='wrap') for k in range(3)], -1)      # every edge soft and wet

# ---- 3. broad thin washes over it, mostly level
edge = periodic(40, 20, 3)
bristle = ndi.zoom(rng.random((256, 24)), (H / 256, W / 24), order=1, mode='grid-wrap', grid_mode=True)
count, (l0, l1), (h0, h1), (a0, a1) = WASHES
for _ in range(count):
    cx, cy = rng.random() * W, rng.random() * H
    a, b = rng.uniform(l0, l1) / 2, rng.uniform(h0, h1) / 2
    th = rng.normal(0, 0.12)
    R = int(max(a, b) * 1.25) + 6
    ys = np.arange(int(cy) - R, int(cy) + R + 1); xs = np.arange(int(cx) - R, int(cx) + R + 1)
    iy, ix = np.ix_(ys % H, xs % W)
    dy, dx = np.meshgrid(ys - cy, xs - cx, indexing='ij')
    u = (dx * np.cos(th) + dy * np.sin(th)) / a; v = (-dx * np.sin(th) + dy * np.cos(th)) / b
    d = (np.abs(u) ** 3 + np.abs(v) ** 3) ** (1 / 3) + (edge[iy, ix] - .5) * 0.5
    wet = np.clip((1.0 - d) / 0.2, 0, 1); wet = wet * wet * (3 - 2 * wet)
    alpha = wet * rng.uniform(a0, a1) * (0.75 + 0.25 * bristle[iy, ix])
    col = colour(np.array(tier[int(cy) % H, int(cx) % W] + rng.normal(0, 0.14)))
    pool = 1 - 0.08 * np.clip((d - 0.6) / 0.3, 0, 1)
    canvas[iy, ix] = canvas[iy, ix] * (1 - alpha[..., None]) + (col * pool[..., None]) * alpha[..., None]

# ---- 4. the paper's grain
grain = ndi.zoom(rng.random((H // 2, W // 2)), 2, order=1, mode='grid-wrap', grid_mode=True)
canvas *= (0.975 + 0.05 * grain)[..., None]
OUT.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray((np.clip(canvas, 0, 1) * 255).round().astype(np.uint8)).save(OUT, 'WEBP', quality=88, method=6)
print(f'{OUT.name}: {W} x {H}, {OUT.stat().st_size / 1e3:.0f} kB')
