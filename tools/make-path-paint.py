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
# `dry` writes assets/ground/dry-paint.webp: the dry earth of land under the curse (the west fringe: stylized-terrain.js lays
# it where the land is dry and no grass stands). The same brush once more, in a dull grey-brown with no warmth left in
# it, pale dusty patches in place of damp ones, more grit. And cracks, as earth that has dried out breaks into plates:
# they are not in the colour but in the picture's alpha (255: none .. 0: the middle of a crack), so the game can leave
# them out, and has them only in stretches. A crack is the line between two of a scatter of points (the plates'
# middles), wavering, wider here and thinner there, and broken off in places as a brush would leave it. With it, the
# plates' own outlines (assets/ground/dry-plates.json: each plate's edge in the picture's pixels, x across and y down
# from its top, wavering as its cracks do; a plate by the picture's edge runs past it, as the picture repeats): for
# whatever breaks this earth into pieces, so it breaks along the cracks that are drawn (broken-earth.js, the plant
# boss's thicket).
#
#   python3 tools/make-path-paint.py            (Termux: pip install numpy scipy pillow)
#   python3 tools/make-path-paint.py sand
#   python3 tools/make-path-paint.py dry
#
# To change the colours: PALETTE, dark to light. To change how it is laid on: DABS, DAMP, PEBBLES, GRAINS, CRACKS (each look's own, in LOOKS).
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
    'dry': dict(                                                      # dry earth under the curse
        out='dry-paint.webp', seed=67,
        PALETTE=['#665c50', '#857a68', '#9d917b', '#b2a790', '#c9bea8'],      # a stone's shadow, the earth in a hollow, the earth itself, dry and dusty, the palest dust
        DABS=(270, (36, 150), (16, 46), (0.08, 0.19)),
        DAMP=(8, (110, 230), -0.06),                                         # (under 0: paler. Dust lying in drifts, where the ways have damp)
        PEBBLES=(46, (3.0, 8.5)),
        GRAINS=[(170, (1.2, 2.4), 0.2), (190, (1.0, 2.0), -0.22)],
        CRACKS=(150, (2.4, 4.6), 0.3)),                                      # how many plates, how wide a crack (px), the share of each crack's length left out
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
img = (np.clip(img, 0, 1) * 255).astype(np.uint8)
if look.get('CRACKS'):
    # ---- 6. cracks, into the alpha: the lines between the plates of a scatter of points, as far from two of them alike
    from scipy.spatial import cKDTree
    n, width, gaps = look['CRACKS']
    pts = np.empty((0, 2))
    while len(pts) < n:                                                                     # (no two plates' middles close together: a sliver between them would fill with crack)
        q = rng.uniform(0, N, 2)
        if not len(pts) or np.hypot(wrap(pts[:, 0] - q[0]), wrap(pts[:, 1] - q[1])).min() > 0.62 * N / np.sqrt(n): pts = np.vstack([pts, q])
    tiled = np.concatenate([pts + (dx, dy) for dx in (-N, 0, N) for dy in (-N, 0, N)])      # (and round the edges: the cracks repeat as the picture does)
    wx, wy = (periodic(14, 2) - .5) * 26, (periodic(14, 2) - .5) * 26                       # the lines waver: read a little to the side
    d, _ = cKDTree(tiled).query(np.stack([xx + wx, yy + wy], -1).reshape(-1, 2), k=2)
    edge = (d[:, 1] - d[:, 0]).reshape(N, N)                                                # 0 on a line, growing into the plate
    w = width[0] + (width[1] - width[0]) * periodic(9, 2)                                   # wider here, thinner there
    w = w * sm(gaps - 0.08, gaps + 0.14, periodic(7, 3))                                    # and left out in places
    crack = (1 - sm(0.55, 1.0, edge / np.maximum(w, 1e-3))) * (w > 0.2)
    crack = ndi.gaussian_filter(crack, 0.6, mode='wrap')
    img = np.dstack([img, (255 * (1 - np.clip(crack, 0, 1))).astype(np.uint8)])
    Image.fromarray(img, 'RGBA').save(OUT, quality=90, method=6, exact=True)                # (exact: the colour is kept under a crack too)
    print(f'{OUT.name}: cracks over {100 * (crack > 0.5).mean():.1f} % of it')
    # ---- 7. the plates' outlines: a crack lies where a point, read a little to the side (wx, wy), is as far from two
    # plates' middles. So a plate's edge is its cell's edge carried back by that sideways reading: a point v of the cell's
    # edge is drawn at p where p + (wx, wy)(p) = v, found by going back and reading again a few times
    import json
    from scipy.spatial import Voronoi
    vor = Voronoi(tiled)
    def warp(p):                                                                            # (wx, wy) at points p, read between pixels, round the edges
        x, y = p[:, 0] % N, p[:, 1] % N
        x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int); fx, fy = x - x0, y - y0
        x1, y1 = (x0 + 1) % N, (y0 + 1) % N
        at = lambda g: (g[y0, x0] * (1 - fx) + g[y0, x1] * fx) * (1 - fy) + (g[y1, x0] * (1 - fx) + g[y1, x1] * fx) * fy
        return np.stack([at(wx), at(wy)], -1)
    plates, STEP = [], 12.0                                                                 # (a point every STEP px along an edge)
    for i in range(4 * n, 5 * n):                                                           # the points of the middle copy: (dx, dy) = (0, 0), the fifth of the nine
        cell = vor.vertices[vor.regions[vor.point_region[i]]]
        cell = cell[np.argsort(np.arctan2(cell[:, 1] - tiled[i, 1], cell[:, 0] - tiled[i, 0]))]      # (round it in order)
        edge = []
        for a, b in zip(cell, np.roll(cell, -1, 0)):
            k = max(1, int(np.ceil(np.hypot(*(b - a)) / STEP)))
            edge += [a + (b - a) * s / k for s in range(k)]
        v = np.array(edge); q = v.copy()
        for _ in range(6): q = v - warp(q)
        plates.append([[round(float(x), 1), round(float(y), 1)] for x, y in q])
    PLATES = OUT.with_name('dry-plates.json')
    PLATES.write_text(json.dumps({'size': N, 'plates': plates}, separators=(',', ':')))
    # how well they keep to the cracks drawn: of the points along their edges, how many lie on a crack (the rest are
    # where a crack is left out); and of their middles, how many lie on none
    a = np.concatenate([np.array(pl) for pl in plates]) % N
    on = crack[a[:, 1].astype(int), a[:, 0].astype(int)] > 0.3
    mid = np.array([np.mean(pl, 0) for pl in plates]) % N
    clear = crack[mid[:, 1].astype(int), mid[:, 0].astype(int)] < 0.1
    print(f'{PLATES.name}: {len(plates)} plates, {len(a)} points on their edges; {100 * on.mean():.0f} % of them on a drawn crack, '
          f'{100 * clear.mean():.0f} % of their middles clear of one')
else: Image.fromarray(img).save(OUT, quality=90, method=6)
print(f'{OUT.name}: {N} x {N}, tones {t.min():.2f} .. {t.max():.2f}, {OUT.stat().st_size // 1024} kB')
