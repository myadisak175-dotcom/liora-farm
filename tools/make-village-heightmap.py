# make-village-heightmap.py  —  the terraced village island (?map=village): plateaus in hard-edged steps, a ravine across it,
# a river coming down the terraces in falls, and a stream from the keep's knoll. Writes, into assets/heightmaps/:
#   village-terrace.png         1025 x 1025, 16-bit grey (white high), the picture to look at or paint over
#   village-terrace.bin         the same, 513 x 513 raw 16-bit little-endian (what the game reads: a browser reads PNGs to 8 bits)
#   village-terrace-brooks.json the water: { reaches: [[[x, z, level, half], ...], ...], falls: [{ x, z, top, bottom, width, dir }] }
# Heights in the picture are terrace levels / LEVELS; village-level.js turns them into metres (VILLAGE_MAP.step a level).
# Run from the repo's root:  python3 tools/make-village-heightmap.py      (needs numpy, scipy, pillow)
import json
import numpy as np
from scipy import ndimage
from PIL import Image

OUT = "assets/heightmaps/village-terrace"
N = 1025
SIZE = 165.0          # metres the picture covers (the island itself is about 150 m across)
LEVELS = 9            # terrace levels; the picture's white is level 9
STEP = 3.5            # metres a level (must match VILLAGE_MAP.step)
BASE = 3              # level standing at y = 0 (the island's floor is level 3.5)
VOID = -60.0          # metres: off the island's edge
rng = np.random.default_rng(41314)
y, x = np.mgrid[0:N, 0:N] / (N - 1)            # x: west -> east, y: north -> south (image rows)
PX = SIZE / (N - 1)                            # metres a pixel
metres = lambda lv: (lv * LEVELS - BASE) * STEP
to_world = lambda u, v: (round((u - 0.5) * SIZE, 2), round((v - 0.5) * SIZE, 2))


def noise(res):
    g = rng.random((res, res))
    n = ndimage.map_coordinates(g, [y * res, x * res], order=3, mode="grid-wrap")
    return (n - n.min()) / (n.max() - n.min())


def fbm(octaves, base, pers=0.5):
    out = np.zeros((N, N)); a = 1.0; t = 0.0
    for o in range(octaves):
        out += noise(base * 2 ** o) * a; t += a; a *= pers
    return out / t


def polyline(pts, step_m=0.5, smooth_m=6.0):
    """Smooth line through pts (image units), sampled every step_m metres."""
    pts = np.array(pts, float)
    seg = np.hypot(*np.diff(pts, axis=0).T)
    t = np.concatenate([[0], np.cumsum(seg)])
    n = max(2, int(t[-1] * SIZE / step_m))
    tt = np.linspace(0, t[-1], n)
    px = np.interp(tt, t, pts[:, 0]); py = np.interp(tt, t, pts[:, 1])
    s = smooth_m / step_m
    return ndimage.gaussian_filter1d(px, s, mode="nearest"), ndimage.gaussian_filter1d(py, s, mode="nearest")


def nearest(px, py):
    """Distance in metres to the line, and the index of its nearest sample, for every pixel."""
    mask = np.zeros((N, N), bool); idx = np.full((N, N), -1)
    ix = np.clip((px * (N - 1)).round().astype(int), 0, N - 1)
    iy = np.clip((py * (N - 1)).round().astype(int), 0, N - 1)
    mask[iy, ix] = True; idx[iy, ix] = np.arange(len(px))
    d, (ny, nx) = ndimage.distance_transform_edt(~mask, return_indices=True)
    return d * PX, idx[ny, nx]


def sample(img, px, py):
    return ndimage.map_coordinates(img, [py * (N - 1), px * (N - 1)], order=1, mode="nearest")


# ---------------------------------------------------------------- the land: mesas, quantised into terraces
w1, w2 = fbm(4, 3, 0.55) - 0.5, fbm(4, 3, 0.55) - 0.5
w3, w4 = fbm(3, 10, 0.5) - 0.5, fbm(3, 10, 0.5) - 0.5
wx = x + 0.08 * w1 + 0.03 * w3                 # warped: the terraces' outlines come out scalloped, like clouds
wy = y + 0.08 * w2 + 0.03 * w4
small = fbm(3, 20, 0.55) - 0.5                 # lobes along the cliff edges

r = np.hypot(wx - 0.5, (wy - 0.5) * 1.05)
island = np.clip((0.46 - r) / 0.08, 0, 1)

L = float(LEVELS)                              # each plateau's height: a level + .5, so the noise never splits its top
MESAS = [   # u, v, radius u, radius v, level    (what stands on each: see VILLAGE in village-level.js)
    (0.60, 0.22, 0.300, 0.150, 8.5),   # the high plateau: the manor, the great tree, the pasture
    (0.25, 0.26, 0.110, 0.100, 7.5),   # the knoll: the keep
    (0.42, 0.43, 0.190, 0.105, 6.5),   # the middle shelf: the market
    (0.79, 0.50, 0.135, 0.120, 6.5),   # the east shelf: the windmill
    (0.16, 0.57, 0.120, 0.140, 5.5),   # the west shelf: houses
    (0.39, 0.76, 0.215, 0.120, 5.5),   # the lower village: houses round the well
    (0.84, 0.75, 0.090, 0.085, 4.5),   # a knob in the south-east
    (0.60, 0.91, 0.110, 0.055, 4.5),   # the south foot
]
base = np.zeros((N, N))
for cx, cy, rx, ry, lv in MESAS:
    d = np.hypot((wx - cx) / rx, (wy - cy) / ry)
    base = np.maximum(base, lv / L * np.exp(-d ** 14))     # broad flat top, a steep flank: the levels crowd into tall cliffs
floor = (3.5 / L) * np.clip((0.46 - r) / 0.12, 0, 1) ** 0.5
base = np.maximum(base, floor) + 0.035 * (fbm(4, 4, 0.5) - 0.5)
cap = np.clip((0.46 - r) / 0.09, 0, 1) ** 0.5               # the plateaus step down before the island's edge
base = np.minimum(base, cap) * (island > 0)

# the ravine: a deep crack from the west across to the south-east edge, where it pours off the island
RAVINE = [(0.20, 0.42), (0.30, 0.50), (0.42, 0.57), (0.55, 0.62), (0.66, 0.70), (0.72, 0.80), (0.76, 0.96)]
rvx, rvy = polyline(RAVINE, smooth_m=8)
rd, _ = nearest(rvx, rvy)
rv_w = (26 + 12 * (fbm(2, 6) - 0.5)) * PX                 # its half-width, metres
ravine = np.clip(1 - (rd - rv_w) / (14 * PX), 0, 1)
base = base * (1 - ravine) + (1.5 / L) * ravine * (island > 0)

f = np.clip(base, 0, 1) * LEVELS + 0.6 * small
k = np.floor(f); frac = f - k
edge = np.clip((frac - 0.86) / 0.14, 0, 1)
edge = edge * edge * (3 - 2 * edge)
h = (k + edge) / LEVELS
h += 0.004 * (fbm(3, 8, 0.5) - 0.5) * (h > 0)
h = ndimage.gaussian_filter(h, 0.8)
h[island <= 0] = 0
land = h.copy()                                             # before the water cuts into it

# ---------------------------------------------------------------- the water
reaches, falls = [], []


def carve(px, py, lvl, half, depth=0.8):
    """Cut a channel under the water: bed `depth` below the water level, banks blending out over a metre."""
    global h
    d, near = nearest(px, py)
    near = np.clip(near, 0, None)
    bed_lv = (lvl[near] - depth) / STEP + BASE              # in levels
    bed = bed_lv / LEVELS
    kk = np.clip((d - half * 0.55) / half, 0, 1); kk = kk * kk * (3 - 2 * kk)
    cut = bed + (h - bed) * kk
    h = np.where((d < half * 1.6) & (island > 0), np.minimum(h, cut), h)


def river(pts, half, end_level=None, off_edge=False):
    """Water down a line: flat reaches on each terrace, a fall at every step down."""
    px, py = polyline(pts)
    g = metres(sample(ndimage.minimum_filter(land, 9), px, py))
    lvl = np.minimum.accumulate(ndimage.minimum_filter1d(g, 7) - 0.5)
    if end_level is not None:
        lvl = np.maximum(lvl, end_level)
    if off_edge:                                            # past the island's edge: off into the void
        lvl = np.where(sample(land, px, py) < 0.5 / LEVELS, VOID, lvl)
    carve(px, py, lvl, half)
    # split into reaches at each drop
    drop = np.concatenate([[False], np.diff(lvl) < -0.25])
    i, cur = 0, []
    while i < len(px):
        if not drop[i]:
            cur.append(i); i += 1; continue
        j = i
        while j < len(px) and drop[j]:
            j += 1
        top, bottom = lvl[i - 1], lvl[min(j, len(px) - 1)]
        a, b = i - 1, min(j + 2, len(px) - 1)
        dx, dz = (px[b] - px[a]) * SIZE, (py[b] - py[a]) * SIZE
        fx, fz = to_world(px[i - 1], py[i - 1])
        falls.append({"x": fx, "z": fz, "top": round(float(top), 2), "bottom": round(float(bottom), 2),
                      "width": round(2 * half + 0.4, 2), "dir": [round(float(dx / np.hypot(dx, dz)), 3), round(float(dz / np.hypot(dx, dz)), 3)]})
        if len(cur) > 2:
            reaches.append([[*to_world(px[q], py[q]), round(float(lvl[q]), 2), half] for q in cur[:-1]])
        cur = []
        if bottom <= VOID + 1:
            break
        i = j + 1                                           # (the foot of the fall: the next reach starts a little past it)
    if len(cur) > 2:
        reaches.append([[*to_world(px[q], py[q]), round(float(lvl[q]), 2), half] for q in cur])
    return lvl


# the ravine's stream first: still water along its floor, pouring off the island at the south-east
rv_level = metres(1.5 / LEVELS) + 0.2
river(RAVINE[1:-1] + [(0.74, 0.88), (0.77, 0.99)], 2.6, end_level=rv_level, off_edge=True)
# the river: from a spring by the great tree, over the high plateau's edge, down the low ground between the middle and east
# shelves (under the stone bridge) and into the ravine
river([(0.60, 0.21), (0.605, 0.27), (0.615, 0.33), (0.625, 0.40), (0.635, 0.47), (0.625, 0.55), (0.605, 0.61), (0.585, 0.64)], 1.9, end_level=rv_level)
# the mill stream: off the keep's knoll, down past the water mill into the ravine's head
river([(0.30, 0.26), (0.30, 0.32), (0.275, 0.37), (0.24, 0.41), (0.21, 0.44)], 1.4, end_level=rv_level)

h = ndimage.gaussian_filter(h, 0.6)
h[island <= 0] = 0
h = np.clip(h, 0, 1)

# ---------------------------------------------------------------- write
Image.fromarray((h * 65535).round().astype(np.uint16)).save(OUT + ".png")
small_img = Image.fromarray(h.astype("f4"), "F").resize((513, 513), Image.BILINEAR)
np.clip(np.array(small_img) * 65535, 0, 65535).round().astype("<u2").tofile(OUT + ".bin")
json.dump({"reaches": reaches, "falls": falls}, open(OUT + "-brooks.json", "w"))
print(len(reaches), "reaches,", len(falls), "falls:", [(f["x"], f["z"], f["top"], f["bottom"]) for f in falls])
print("plateaus (metres):", sorted({round(metres(m[4] / LEVELS), 1) for m in MESAS}), "floor", metres(3.5 / LEVELS), "ravine water", rv_level)
