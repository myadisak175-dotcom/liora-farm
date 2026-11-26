# make-cliff-paint.py  —  the cliffs' painted look: a picture of rock laid in with a brush, as in a watercolour background
#
# Writes a picture 2048 x 1024, seamless both ways, to be laid on the cliffs 20 m along by 10 m up (hill-village-level.js hands
# it to the land's paint; the map's loose rocks wear it too, 8 m by 4 m). Two looks:
#   soft   assets/ground/cliff-paint.webp (the first, the game's): pale cream rock in three tiers, soft planes.
#   crisp  assets/ground/cliff-crisp-paint.webp (26 Nov 2026, a trial: ?cliff=crisp): the same rock, the same planes where they
#          were (the same draws of the dice), a little more stylized, as the user asked ("เราชอบสีแบบนี้แล้ว ปรับได้ไม่ต้องเยอะ
#          ให้ดูเป็น stylize เข้ากับโลกเรา"): the planes' edges crisper and a fine line where two of them meet, the darkest
#          tones a touch cooler, each ledge drawn (a soft shadow under the tier above, a lit lip on the tier's top), and a few
#          faint joints down the faces. The land lights it in steps, as the rocks are lit (stylized-terrain.js, CLIFF_STEPS).
# It is painted the way the reference was:
#   1. three tiers of rock one above the other, each lit along its top and falling into a brown shadow under the tier above;
#   2. the rock broken into chunky flat planes, longer than they are tall, each one a single tone of the palette (a plane high on
#      a tier is light, one under the next tier is dark). Neighbours of one tone run together into bigger shapes, as dabs of
#      one mix of paint do, and their outlines waver like a brush's;
#   3. a few broad, thin washes of the brush over that, their edges soft and wet;
#   (crisp: the ledges and the joints)
#   4. the grain of the paper over everything.
#
#   python3 tools/make-cliff-paint.py [soft | crisp]      (Termux: pip install numpy scipy pillow)
#
# To change the colours: PALETTE, dark to light. To change how it is laid on: TIERS, PLANES, WASHES (crisp: SOFTEN, OUTLINE,
# LEDGE, JOINTS).
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

LOOKS = {
    'soft': dict(out='cliff-paint.webp',
                 PALETTE=['#75675a', '#8f806f', '#a9947c', '#c2ac8d', '#d9c5a3'],      # deep shadow, shadow, the rock itself, lit, the brightest planes
                 SOFTEN=2.6, OUTLINE=(0.035, 5.0, False)),                            # how soft every edge is (px); the line where two planes meet (how dark, how wide)
    'crisp': dict(out='cliff-crisp-paint.webp',
                  PALETTE=['#716660', '#8c8077', '#a9947c', '#c2ac8d', '#d9c5a3'],     # (the two shadows a touch cooler; the rest as it was)
                  SOFTEN=1.4, OUTLINE=(0.075, 4.0, True),                              # (True: only where the tone changes, so planes of one tone still run together)
                  LEDGE=((4.0, 4.5, 0.15), (3.0, 3.0, 0.08)),                          # the shadow under a tier (px above the line, how wide, how dark), its lit lip (below, wide, how light)
                  JOINTS=(16, (3, 5), (0.4, 0.8), 0.11)),                              # how many, how wide at their widest (px), how long (of a tier), how dark
}
look = sys.argv[1] if len(sys.argv) > 1 else 'soft'
if look not in LOOKS: sys.exit(f'make-cliff-paint.py: no look "{look}" ({" | ".join(LOOKS)})')
L = LOOKS[look]
W, H = 2048, 1024
OUT = Path(__file__).resolve().parent.parent / 'assets/ground' / L['out']
rng = np.random.default_rng(11)                                       # (both looks: the same rock, the same planes)
PALETTE = L['PALETTE']
TIERS = 3                                                             # tiers of rock up the picture
PLANES = (260, 3.4)                                                   # how many planes of rock, and how much longer than tall
WASHES = (70, (180, 460), (40, 100), (0.14, 0.28))                    # how many washes, how long, how tall (px), how thin (alpha)
pal = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in PALETTE], float) / 255


def periodic(gw, gh, octaves=3, r=None):
    """smooth noise 0..1 that repeats at the picture's edges"""
    r = r or rng
    out = np.zeros((H, W)); amp = 1.0; tot = 0.0
    for o in range(octaves):
        g = r.random((gh * 2 ** o, gw * 2 ** o))
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
nz_n = rng.normal(0, 0.09, n); nz_b = rng.normal(0, 0.04, len(big))
quant = lambda t: np.round(np.clip(t, 0, 1) * (len(pal) - 1)) / (len(pal) - 1)      # one of the palette's tones, nothing between
tone = quant((at(pts) + nz_n)[cell] + nz_b[patch])
canvas = colour(tone)
line, lw, changes = L['OUTLINE']
edge_on = np.clip(1 - rim / lw, 0, 1)
if changes: edge_on *= quant((at(pts) + nz_n)[i2[..., 1]] + nz_b[patch]) != tone    # (only between planes of two tones)
canvas *= (1 - line * edge_on)[..., None]                                          # the line where two dabs meet (soft: the faintest)
canvas = np.stack([ndi.gaussian_filter(canvas[..., k], L['SOFTEN'], mode='wrap') for k in range(3)], -1)      # every edge soft and wet

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

if look == 'crisp':
    r2 = np.random.default_rng(1011)                                  # (its own dice: the rock and the paper's grain stay as they were)
    TH = H / TIERS
    ss = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))
    # ---- the ledges: a soft shadow under the tier above, a lit lip on the tier's top, broken here and there
    (s_at, s_w, s_dark), (l_at, l_w, l_lit) = L['LEDGE']
    brk = ss(0.25, 0.45, periodic(40, 20, 2, r2))
    pin, pab = ph * TH, (1 - ph) * TH                                 # px below a tier's top, px above the next one's
    shade = np.exp(-((pab - s_at) / s_w) ** 2) * brk
    lip = np.exp(-((pin - l_at) / l_w) ** 2) * brk
    canvas *= (1 - s_dark * shade)[..., None]
    canvas *= (1 + l_lit * lip)[..., None]
    # ---- a few faint joints down the faces: closing at both ends, a jag now and then, a lit lip beside them
    nj, (j0, j1), (c0, c1), j_dark = L['JOINTS']
    joint = np.zeros((H, W)); jlit = np.zeros((H, W))

    def stamp(m, x, y, r):
        R = int(r + 2); ys = np.arange(int(y) - R, int(y) + R + 1); xs = np.arange(int(x) - R, int(x) + R + 1)
        iy, ix = np.ix_(ys % H, xs % W)
        m[iy, ix] = np.maximum(m[iy, ix], np.clip(r + 0.5 - np.hypot(*np.meshgrid(ys - y, xs - x, indexing='ij')), 0, 1))
    for _ in range(nj):
        t_i = r2.integers(TIERS); x = r2.random() * W
        y = (t_i * TH - wob[int(t_i * TH) % H, int(x) % W]) % H + r2.uniform(0.1, 0.35) * TH
        w, length, lean, jag = r2.uniform(j0, j1), r2.uniform(c0, c1) * TH, r2.normal(0, 0.5), 0
        steps = int(length / 1.5)
        for k in range(steps):
            r = max(0.5, w * 0.5 * np.sin(np.pi * (0.08 + 0.84 * k / steps)) ** 0.8)
            stamp(joint, x, y, r); stamp(jlit, x - r - 1.5, y - 0.6, r * 0.5)
            if jag <= 0: lean = 0.5 * lean + r2.normal(0, 0.7); jag = r2.integers(8, 22)
            jag -= 1; x += lean * 0.375; y += 1.5
    joint = ndi.gaussian_filter(joint, 1.0, mode='wrap'); jlit = ndi.gaussian_filter(jlit, 1.0, mode='wrap') * (1 - joint)
    canvas *= (1 - j_dark * joint)[..., None]
    canvas *= (1 + 0.04 * jlit)[..., None]

# ---- 4. the paper's grain
grain = ndi.zoom(rng.random((H // 2, W // 2)), 2, order=1, mode='grid-wrap', grid_mode=True)
canvas *= (0.975 + 0.05 * grain)[..., None]
OUT.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray((np.clip(canvas, 0, 1) * 255).round().astype(np.uint8)).save(OUT, 'WEBP', quality=88, method=6)
print(f'{OUT.name}: {W} x {H}, {OUT.stat().st_size / 1e3:.0f} kB')
