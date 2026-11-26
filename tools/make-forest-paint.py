# make-forest-paint.py  —  the forest floor's painted look: the ground under a grove, as the ways' brush would lay it in
#
# Writes assets/ground/forest-paint.webp: 768 x 768, seamless both ways, to be laid about 3.6 m to a repeat (213 px a metre)
# wherever trees stand close together (stylized-terrain.js, floor: hill-village-level.js asks for it with ?forest=1).
# Chosen on 26 Nov 2026: dark earth, dry leaves, moss in patches ("ดินเข้ม ใบไม้แห้ง มอสเป็นหย่อม"). It is the floor in full
# light; the game lays the trees' shadows over it, and its edge to the meadow:
#   1. dark earth: broad drifts of tone and the brush's dabs over them, as the ways' earth is painted (make-path-paint.py),
#      in deeper, browner colours;
#   2. moss in patches, a rich green a step deeper than the meadow's, its edge furred, lighter where it is lit, with pale
#      specks in it;
#   3. dry leaves lying every which way, thick in drifts and thin elsewhere (few on the moss), larger than life (12 to 20
#      cm: so they read as leaves from where the camera is, as the world's own things are drawn): brown, rust and ochre with a
#      few still green; each a pointed oval folded along its middle, the half that faces the light (the upper left, as the
#      ways' pebbles are lit) a tone lighter, its midrib darker, a soft shadow under it where it lies on what is beneath;
#   4. a few twigs, dark with a lighter top;
#   5. a little grain of the paper.
#
#   python3 tools/make-forest-paint.py            (Termux: pip install numpy scipy pillow)
#
# To change the colours: EARTH, LEAVES, MOSS, TWIG. To change how much of each: MOSS_SHARE, LEAF_COUNT, TWIG_COUNT.
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

N = 768
OUT = Path(__file__).resolve().parent.parent / 'assets/ground/forest-paint.webp'
rng = np.random.default_rng(83)
hexrgb = lambda c: np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float) / 255
EARTH = [hexrgb(c) for c in ('#3f2e22', '#4e3a2a', '#5d4632', '#6e5439', '#836545')]       # a hollow's dark, damp earth, the earth itself, drier, the palest
LEAVES = [(hexrgb(c), w) for c, w in (                                                       # a leaf's colour, and how many of them are it
    ('#7a5232', 0.22), ('#94592f', 0.18), ('#ad7a41', 0.2), ('#c79a5c', 0.14),            # brown, rust, ochre, tan
    ('#8a6a3a', 0.12), ('#6d4a30', 0.07), ('#86904a', 0.05), ('#9aa457', 0.02))]          # dull gold-brown, dark brown, olive, still green
MOSS = [hexrgb(c) for c in ('#36502a', '#435f2e', '#517034', '#62833c', '#789a48')]          # deep in a hollow .. lit: deeper and duller than the meadow's (it lies in the shade)
TWIG = (hexrgb('#4a3726'), hexrgb('#7d624a'))                                                # a twig, and its lit top
MOSS_SHARE, LEAF_COUNT, TWIG_COUNT = 0.2, 640, 18
sm = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))
LIGHT = np.array([-1.0, -1.0]) / np.sqrt(2)                                                 # light from the upper left


def periodic(cells, octaves=3):
    """smooth noise 0..1 that repeats at the picture's edges"""
    out = np.zeros((N, N)); amp = 1.0; tot = 0.0
    for o in range(octaves):
        g = rng.random((cells * 2 ** o, cells * 2 ** o))
        out += amp * ndi.zoom(g, N / g.shape[0], order=3, mode='grid-wrap', grid_mode=True); tot += amp; amp *= 0.5
    out /= tot
    return (out - out.min()) / (out.max() - out.min())


def ramp(cols, t):
    """a tone 0 (darkest) .. 1 (palest) -> a colour of the ramp"""
    t = np.clip(t, 0, 1) * (len(cols) - 1); i = np.minimum(t.astype(int), len(cols) - 2); f = (t - i)[..., None]
    c = np.array(cols)
    return c[i] * (1 - f) + c[i + 1] * f


yy, xx = np.mgrid[0:N, 0:N].astype(float)
wrap = lambda d: (d + N / 2) % N - N / 2


def window(cx, cy, r):
    """the pixels within r of (cx, cy), round the picture's edges: (index, dx, dy) of each from the point"""
    x0, y0, n = int(np.floor(cx - r)), int(np.floor(cy - r)), int(np.ceil(2 * r)) + 2
    xs, ys = np.arange(x0, x0 + n), np.arange(y0, y0 + n)
    return np.ix_(ys % N, xs % N), xs[None, :] + 0.5 - cx, ys[:, None] + 0.5 - cy


def lay(img, idx, colour, a):
    """paint colour over the picture with coverage a (0..1) in a window"""
    a = np.clip(a, 0, 1)[..., None]
    img[idx] = img[idx] * (1 - a) + colour * a


# ---- 1. the dark earth: drifts of tone and the brush's dabs, wet into wet (as make-path-paint.py)
t = 0.5 + (periodic(3, 3) - .5) * 0.22
waver = (periodic(24, 2) - .5) * 0.5
for _ in range(240):
    a, b = rng.uniform(30, 120) / 2, rng.uniform(14, 40) / 2
    cx, cy, ang = rng.uniform(0, N), rng.uniform(0, N), rng.uniform(0, np.pi)
    dx, dy = wrap(xx - cx), wrap(yy - cy); c, s = np.cos(ang), np.sin(ang)
    r = np.hypot((dx * c + dy * s) / a, (-dx * s + dy * c) / b) + waver
    t += rng.choice([-1, 1]) * rng.uniform(0.08, 0.2) * (1 - sm(0.45, 1.0, r))
t = ndi.gaussian_filter(t, 1.7, mode='wrap')
img = ramp(EARTH, np.clip(t, 0.12, 0.86))

# ---- 2. moss in patches: furred at the edge, its own dabs of tone, lit toward the light, pale specks
mfield = periodic(5, 3) * 0.8 + periodic(56, 2) * 0.2                                       # (the fine part furs its edge)
cut = np.quantile(mfield, 1 - MOSS_SHARE)
moss = ndi.gaussian_filter(sm(cut - 0.02, cut + 0.03, mfield), 1.0, mode='wrap')
mt = 0.45 + (periodic(10, 3) - .5) * 0.4
gy, gx = np.gradient(ndi.gaussian_filter(mfield, 6, mode='wrap'))                           # (which way a patch's edge faces: a mound's lit side)
mt += np.clip(-(gx * LIGHT[0] + gy * LIGHT[1]) * 90, -0.2, 0.2)
for _ in range(900):                                                                         # specks: the moss's tiny heads catching the light
    cx, cy, r = rng.uniform(0, N), rng.uniform(0, N), rng.uniform(0.8, 1.8)
    idx, dx, dy = window(cx, cy, r + 1.5)
    mt[idx] += 0.28 * (1 - sm(0.4, 1.0, np.hypot(dx, dy) / r))
img = img * (1 - moss[..., None]) + ramp(MOSS, mt) * moss[..., None]

# ---- 3. dry leaves: thick in drifts, thin on the moss
drift = periodic(4, 3)
colours = np.array([c for c, w in LEAVES]); weights = np.array([w for c, w in LEAVES]); weights /= weights.sum()
laid = 0
while laid < LEAF_COUNT:
    cx, cy = rng.uniform(0, N), rng.uniform(0, N)
    here = drift[int(cy) % N, int(cx) % N] * (1 - 0.8 * moss[int(cy) % N, int(cx) % N])
    if rng.random() > 0.06 + 0.94 * sm(0.38, 0.78, here): continue                         # (in drifts: the dark earth shows between them)
    laid += 1
    L = rng.uniform(26, 44) * (1.3 if rng.random() < 0.12 else 1.0)                          # a leaf's length (px: 12 to 20 cm, a painted world's leaves), now and then a big one
    W = L * rng.uniform(0.5, 0.68); ang = rng.uniform(0, np.pi)
    col = colours[rng.choice(len(colours), p=weights)] * rng.uniform(0.9, 1.08)
    c, s = np.cos(ang), np.sin(ang)
    # its shadow first, where it lies on what is beneath (a little down and right of it, soft)
    idx, dx, dy = window(cx + 2.4, cy + 3.0, L / 2 + 4)
    u = (dx * c + dy * s) / (L / 2); v = (-dx * s + dy * c) / (W / 2)
    shape = np.abs(v) / np.maximum(np.clip(1 - u * u, 0, 1) ** 0.8, 1e-3)
    sh = (1 - sm(0.7, 1.6, shape)) * (1 - sm(0.9, 1.25, np.abs(u)))
    img[idx] *= (1 - 0.32 * sh)[..., None]
    # the leaf: a pointed oval folded along its middle, the half facing the light lighter, its midrib darker
    idx, dx, dy = window(cx, cy, L / 2 + 2)
    u = (dx * c + dy * s) / (L / 2); v = (-dx * s + dy * c) / (W / 2)
    lim = np.clip(1 - u * u, 0, 1) ** 0.8
    shape = np.abs(v) / np.maximum(lim, 1e-3)
    soft = 1.4 / (W / 2)                                                                    # (a pixel of soft edge)
    body = (1 - sm(1 - soft, 1 + soft * 0.4, shape)) * (1 - sm(1 - 1.2 / (L / 2), 1.0, np.abs(u)))
    lit = 1 if (-s * LIGHT[0] + c * LIGHT[1]) > 0 else -1                                    # which half faces the light
    tone = np.where(v * lit > 0, 1.1, 0.84)
    tone = np.where((np.abs(v) < 0.16) & (np.abs(u) < 0.86), 0.72, tone)                      # the midrib
    edge = sm(0.72, 0.98, shape) * 0.14                                                     # (its rim a touch darker: dry, curling)
    lay(img, idx, col[None, None, :] * (tone - edge)[..., None], body)
    if rng.random() < 0.35:                                                                  # a stalk
        idx, dx, dy = window(cx + c * L * 0.55, cy + s * L * 0.55, 4)
        su = dx * c + dy * s; sv = -dx * s + dy * c
        lay(img, idx, col * 0.6, (1 - sm(0.5, 1.1, np.abs(sv))) * (1 - sm(2.2, 3.4, np.abs(su))))

# ---- 4. twigs: thin, dark, a lighter top
for _ in range(TWIG_COUNT):
    cx, cy, L = rng.uniform(0, N), rng.uniform(0, N), rng.uniform(50, 120)
    ang, bend, wd = rng.uniform(0, np.pi), rng.uniform(-0.25, 0.25), rng.uniform(2.4, 3.8)
    idx, dx, dy = window(cx, cy, L / 2 + 4)
    c, s = np.cos(ang), np.sin(ang)
    u = dx * c + dy * s; v = -dx * s + dy * c - bend * (u * u) / (L / 2)                     # (bent a little)
    along = 1 - sm(L / 2 - 2, L / 2, np.abs(u))
    w = wd * (1 - 0.4 * (u / (L / 2) + 1) / 2)                                               # (thinner toward one end)
    body = (1 - sm(w * 0.6, w, np.abs(v))) * along
    lay(img, idx, TWIG[0], body)
    lay(img, idx, TWIG[1], (1 - sm(0.0, w * 0.5, np.abs(v + w * 0.35))) * along * 0.8)

# ---- 5. the paper's grain, and nothing sharper than the brush
img *= (1 + (rng.random((N, N)) - .5) * 0.04)[..., None]
img = ndi.gaussian_filter(img, (0.45, 0.45, 0), mode='wrap')
out = (np.clip(img, 0, 1) * 255).astype(np.uint8)
Image.fromarray(out).save(OUT, quality=90, method=6)
mean = out.reshape(-1, 3).mean(0)
print(f'{OUT.name}: {N} x {N}, moss over {100 * (moss > 0.5).mean():.0f} %, {LEAF_COUNT} leaves, mean colour #{int(mean[0]):02x}{int(mean[1]):02x}{int(mean[2]):02x}, {OUT.stat().st_size // 1024} kB')
