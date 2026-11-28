#!/usr/bin/env python3
# make-fang-hall.py  —  room ① of the dungeon under the waterfall cliff: the fang hall, and the way in to it from behind the
# big fall, baked for dungeon.html (fang-hall.js draws it)
#
# Asked for on 28 Nov 2026 ("แล้วถ้ำเรา ทำอะไรต่อดี"; chosen: "ทางเข้าหลังน้ำตก + ห้องแรก"): the dungeon's mouth behind the
# big fall where the village's water drops into the valley, and its first room, the fang hall of the plan (README: natural
# rock, fang stalactites, glowing crystals and mushrooms), as the start of the one underground map.
#
# One job, as tools/make-cave-hall.py's for the forest hall (the same field of distance to rock, marching cubes, the light
# baked into the mesh, the floor and the roof over every spot, a coarse picture of the light in the air): shape the room
# and its way in, and bake what it will be seen in. Writes
#   assets/caves/fang-hall.bin    the mesh (the rock, and the fangs in it: one mesh), the floor and the roof she walks
#                                 between, the light in the air (cave-light.js), the glowworms on the roof
#   assets/caves/fang-hall.json   where things are: the curtain of the fall, the pool, crystals, mushrooms, fangs, drips,
#                                 ferns, the places she can be put at; and where in the .bin each part is
#
# In the hill village's own frame (metres; x east, z south, y up; the village's heights): the dungeon lies under the
# village, its mouth at the foot of the cliff behind the big fall (falls[2] of hill-village.json: its lip at 6.9 m, the
# water landing ~3.4 m out in the lake at -11.4 m). The land parts that fall into three strands (land-water.js: one from
# each run of its lip; seen in the game: their lips' middles at 38.44, 42.24 / 35.85, 44.46 / 32.99, 47.53); the mouth is
# behind the middle one, so the way in and out of it is the same spot in both, and the cave's mouth seen from outside is
# the dark behind the middle strand, its edges showing either side of it.
# The room is laid out along the way in: s metres in from the mouth (into the mountain, north-west), w metres to her right.
#   the ledge   behind the curtain of the fall, 0.8 m over the lake; the daylight comes in through the falling water
#   the tunnel  ~21 m, 4.7 m wide, 5.3 m tall, bending a little right and climbing 3.6 m; its end opened wide: the jaw,
#               big fangs hanging over it and rising beside it (a giant's mouth she walks into)
#   the hall    ~33 x 29 m, its floor at -11 (the lake's own level in its pool), walls ~6.5 m, 15 m at its crown, the roof
#               bristling with fangs (pale calcite, sharp), glowworms between them; she comes in on the balcony (-7: the
#               tunnel's end, a 4 m face over the hall) and goes down a ramp along the left wall; a still pool in the
#               middle (waded, 0.6 m) mirroring the glowworms, broken fangs standing in it as stepping stones up to the
#               shelf (-7.5) at the far end, where the way on is (closed for now by crystals: room ② is not made); a
#               column where a fang met the floor; stalagmites; crystals and mushrooms glowing along the walls.
#
# Run: python3 tools/make-fang-hall.py            (needs numpy, scipy, scikit-image, matplotlib; ~2 minutes)
#      then python3 tools/make-cave-map.py fang-hall (its map)
import json, math, os, time
import numpy as np
from scipy import ndimage as ndi
from skimage import measure
from matplotlib.path import Path as MPath

T0 = time.time()
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets', 'caves')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(41)


def log(*a):
    print(f'[{time.time() - T0:5.1f}s]', *a, flush=True)


# ---------------------------------------------------------------- noise (as tools/make-cave-hall.py's: the same value for the same spot)
def hash3(ix, iy, iz, s):
    v = np.sin(ix * 127.1 + iy * 311.7 + iz * 74.7 + s * 53.3) * 43758.5453
    return v - np.floor(v)


def vnoise3(x, y, z, s):
    ix, iy, iz = np.floor(x), np.floor(y), np.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    fx, fy, fz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    c = lambda a, b, d: hash3(ix + a, iy + b, iz + d, s)
    x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * fx
    x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * fx
    x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * fx
    x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * fx
    return (x00 + (x10 - x00) * fy) + ((x01 + (x11 - x01) * fy) - (x00 + (x10 - x00) * fy)) * fz


def fbm3(x, y, z, s, oct=3):
    t, a, n = 0.0, 0.5, 0.0
    for o in range(oct):
        f = 2.03 ** o
        t = t + a * vnoise3(x * f, y * f, z * f, s + o * 17)
        n += a
        a *= 0.5
    return t / n


def worley3(x, y, z, s):
    ix, iy, iz = np.floor(x), np.floor(y), np.floor(z)
    best = np.full(np.shape(x), 9.0)
    for a in (-1, 0, 1):
        for b in (-1, 0, 1):
            for c in (-1, 0, 1):
                cx, cy, cz = ix + a, iy + b, iz + c
                px = cx + hash3(cx, cy, cz, s)
                py = cy + hash3(cx, cy, cz, s + 7)
                pz = cz + hash3(cx, cy, cz, s + 13)
                best = np.minimum(best, (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2)
    return np.sqrt(best)


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def seg2(px, pz, ax, az, bx, bz):
    pax, paz, bax, baz = px - ax, pz - az, bx - ax, bz - az
    h = np.clip((pax * bax + paz * baz) / (bax * bax + baz * baz), 0, 1)
    return np.hypot(pax - bax * h, paz - baz * h), h


def poly2(px, pz, pts):
    """distance to a polyline, and how far along it (0..1) the nearest point is"""
    lens = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts[:-1], pts[1:])]
    tot = sum(lens)
    best, along, acc = np.full(np.shape(px), 1e9), np.zeros(np.shape(px)), 0.0
    for (a, b), L in zip(zip(pts[:-1], pts[1:]), lens):
        d, h = seg2(px, pz, a[0], a[1], b[0], b[1])
        m = d < best
        best, along = np.where(m, d, best), np.where(m, (acc + h * L) / tot, along)
        acc += L
    return best, along


def poly_sd(px, pz, pts):
    """signed distance to a closed outline (m): > 0 inside"""
    best = np.full(np.shape(px), 1e9)
    for a, b in zip(pts, pts[1:] + pts[:1]):
        best = np.minimum(best, seg2(px, pz, a[0], a[1], b[0], b[1])[0])
    inside = MPath(pts).contains_points(np.stack([np.ravel(px), np.ravel(pz)], 1)).reshape(np.shape(px))
    return np.where(inside, best, -best)


def wob2(ps, pw, f, s, amp):
    return amp * (fbm3(ps * f, pw * f, 0.0 * ps + 3.7, s) - 0.5) * 2


# ---------------------------------------------------------------- the frame: the hill village's, the room laid out from its mouth
MOUTH = (36.745, 45.355)                  # x, z: the foot of the cliff behind the big fall's middle strand
D = (-0.70711, -0.70711)                  # into the mountain (north-west)
R = (0.70711, -0.70711)                   # to her right as she walks in
YAW_IN = math.atan2(D[0], D[1])           # (the game's yaw: atan2 of the way she faces, x then z)


def world(s, w):
    return MOUTH[0] + s * D[0] + w * R[0], MOUTH[1] + s * D[1] + w * R[1]


def yaw_to(s0, w0, s1, w1):
    x0, z0 = world(s0, w0)
    x1, z1 = world(s1, w1)
    return math.atan2(x1 - x0, z1 - z0)


LEDGE = -10.6                             # the ledge behind the curtain
LAKE = -11.4                              # the lake the fall drops into, and the pool in the hall: one water
FALL = dict(lip=0.9, top=6.9, out=3.4, half=5.3)      # the fall's line: leaves the lip (s 0.9, 6.9 m), lands `out` m further out
STRANDS = [dict(w=0.0, lip=1.27, half=1.2), dict(w=3.4, lip=1.0, half=1.15), dict(w=-4.19, lip=1.12, half=1.2)]   # (the game's three)
# the ribs of rock between the strands' channels (the village's land: they stand out from the cliff ~2.5 m at their foot,
# rising steeply to it): the ledge behind the middle strand lies between two of them, so the way out is a cleft
FINS = [dict(w=-2.05, half=0.55, foot=-2.5), dict(w=1.65, half=0.9, foot=-2.8)]
LEDGE_W = (-1.45, 0.65)                   # the ledge between them (and so in the village too: cave-mouth.js)


def curtain_s(y):
    return FALL['lip'] - FALL['out'] * np.sqrt(np.clip((FALL['top'] - y) / (FALL['top'] - LAKE), 0, 1))


def face_s(y):
    """the cliff behind the curtain: it leans out a little toward its foot (as the village's land has it)"""
    return 0.9 * np.clip((y - LEDGE) / (FALL['top'] - LEDGE), 0, 1)


TUNNEL = [(-1.4, 0.0, LEDGE), (4.5, 0.3, -10.45), (9.5, 1.5, -9.55), (14.0, 2.8, -8.35), (18.0, 3.4, -7.4), (21.4, 3.6, -7.0)]
T_HALF, T_TALL = 2.35, 5.3                 # the tunnel: half its width, its height over the floor
HALL = dict(c=(36.0, 5.0), r=(16.5, 14.5), floor=-11.0, wall=6.5, apex=15.0)
JAW = dict(c=(21.9, 3.6), y=-3.6, r=(2.7, 5.4, 4.7))  # the tunnel's end opened wide: (s, w), its middle's height, radii s, w, y
BALCONY = dict(h=-7.0, pts=[(18.6, -1.5), (18.6, 8.8), (23.8, 10.3), (26.0, 7.6), (25.2, 3.2), (25.9, -0.4), (24.2, -2.6)])
RAMP = [(23.4, -1.9), (26.6, -4.7), (30.4, -6.3), (34.6, -6.7)]       # the balcony (-7) down to the floor (-11), along the left wall
RAMP_HALF = 1.75
POOL = dict(c=(37.5, 7.0), r=(6.6, 4.6), bed=-12.0)
STUMPS = [(33.6, 6.0, -10.4, 1.0), (35.9, 7.3, -9.75, 0.95), (38.3, 6.4, -9.1, 0.95), (40.6, 7.6, -8.45, 0.95),
          (42.8, 8.7, -7.95, 0.9)]                 # s, w, top, radius: a hop apart (~2.6 m, 0.65 m up), up to the shelf
SHELF = dict(h=-7.5, pts=[(44.6, 1.2), (44.0, 8.4), (45.3, 15.6), (50.6, 18.8), (55.0, 12.0), (55.0, 3.0), (49.0, -0.8)])
WAYON = [(49.4, 10.0, -7.5), (53.6, 10.9, -7.45), (57.8, 12.3, -7.4)]  # the way on (to room ②): s, w, floor
COLUMN = (40.6, -2.6, 1.75)                # s, w, radius at its foot and its top: a fang that met the floor
WAYS = [[(-1.0, 0.0), (4.5, 0.3), (9.5, 1.5), (14.0, 2.8), (18.0, 3.4), (22.6, 3.4)],            # in along the tunnel
        [(22.6, 3.4), (23.6, 0.4), (24.2, -1.6)],                                               # across the balcony to the ramp
        [(34.6, -6.7), (33.0, -2.6), (31.5, 1.2), (32.3, 4.6)],                                 # the ramp's foot to the pool's shore
        [(33.0, -2.6), (38.0, -6.0), (43.5, -4.5), (46.5, -1.0)],                               # round the pool's west side
        [(46.0, 3.0), (48.4, 7.6), (50.4, 10.0)]]                                               # on the shelf, to the way on
log('frame: mouth', MOUTH, 'in toward', D)

# ---------------------------------------------------------------- the grid (world x, z; the room's s, w worked out for every column)
H = 0.4
corners = [world(s, w) for s in (-5.2, 59.0) for w in (-12.0, 22.0)]
X0 = math.floor(min(c[0] for c in corners)); X1 = math.ceil(max(c[0] for c in corners))
Z0 = math.floor(min(c[1] for c in corners)); Z1 = math.ceil(max(c[1] for c in corners))
Y0, Y1 = -15.0, 9.0
xs = np.arange(X0, X1 + 1e-6, H)
ys = np.arange(Y0, Y1 + 1e-6, H)
zs = np.arange(Z0, Z1 + 1e-6, H)
NX, NY, NZ = len(xs), len(ys), len(zs)
log('grid', NX, NY, NZ, NX * NY * NZ, 'x', X0, X1, 'z', Z0, Z1)
GX, GZ = np.meshgrid(xs, zs, indexing='ij')                                     # (NX, NZ)
GS = (GX - MOUTH[0]) * D[0] + (GZ - MOUTH[1]) * D[1]
GW = (GX - MOUTH[0]) * R[0] + (GZ - MOUTH[1]) * R[1]


def tunnel_floor(t, pts):
    """the floor along a chain of (s, w, floor) at a share t of its length"""
    lens = np.array([math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts[:-1], pts[1:])])
    acc = np.concatenate([[0], np.cumsum(lens)]) / lens.sum()
    return np.interp(t, acc, [p[2] for p in pts])


# ---------------------------------------------------------------- the floor, as a height for every column
def floor_at(s, w):
    F = HALL['floor'] + 0.28 * (fbm3(s * 0.08, w * 0.08, 1.3 + 0 * s, 5) - 0.5) * 2 + 0.2 * (fbm3(s * 0.35, w * 0.35, 2.1 + 0 * s, 6) - 0.5)
    # the tunnel: its own floor along its line, climbing
    d, t = poly2(s, w, [(p[0], p[1]) for p in TUNNEL])
    ft = tunnel_floor(t, TUNNEL) + 0.12 * (fbm3(s * 0.5, w * 0.5, 0.7 + 0 * s, 7) - 0.5) * 2
    F = F + (ft - F) * sstep(T_HALF + 2.2, T_HALF + 0.9, d)
    # the ledge behind the curtain, tilted a little toward the lake; past its edge, the lake's bed
    led = LEDGE + 0.05 * np.minimum(s, 0.8) + 0.06 * (fbm3(s * 0.8, w * 0.8, 4.1 + 0 * s, 8) - 0.5)
    F = F + (led - F) * sstep(1.6, 0.4, s)
    F = F + (-12.8 - F) * sstep(-2.15, -2.45, s)
    # the balcony (the tunnel's end), its edge a face over the hall
    e = poly_sd(s, w, BALCONY['pts']) + wob2(s, w, 0.3, 9, 0.45)
    F = np.maximum(F, F + (BALCONY['h'] + wob2(s, w, 0.6, 10, 0.08) - F) * sstep(-0.3, 0.3, e))
    # the ramp down from it, along the left wall
    d, t = poly2(s, w, RAMP)
    hr = BALCONY['h'] + (HALL['floor'] - BALCONY['h']) * t
    F = np.maximum(F, F + (hr - F) * sstep(RAMP_HALF + 0.4, RAMP_HALF - 0.2, d))
    # the pool: a shallow bowl, gentle all round (she wades in)
    pr = np.hypot((s - POOL['c'][0]) / POOL['r'][0], (w - POOL['c'][1]) / POOL['r'][1]) + wob2(s, w, 0.25, 11, 0.09)
    F = F + (POOL['bed'] + 0.1 * (fbm3(s * 0.6, w * 0.6, 5.5 + 0 * s, 12) - 0.5) - F) * sstep(1.3, 0.75, pr)
    # the shelf at the far end, the way on at its back
    e = poly_sd(s, w, SHELF['pts']) + wob2(s, w, 0.25, 13, 0.6)
    F = np.maximum(F, F + (SHELF['h'] + wob2(s, w, 0.5, 14, 0.1) - F) * sstep(-0.3, 0.3, e))
    d, t = poly2(s, w, [(p[0], p[1]) for p in WAYON])
    F = np.where(d < 3.0, np.maximum(F, tunnel_floor(t, WAYON) * sstep(3.0, 2.2, d) + F * (1 - sstep(3.0, 2.2, d))), F)
    # the broken fangs standing in the pool, a hop apart up to the shelf: rough, their tops tilted a little
    for (ss, sw, top, r), k in zip(STUMPS, range(20, 40)):
        e = r - np.hypot(s - ss, w - sw) + wob2(s, w, 0.9, k, 0.22) + wob2(s, w, 2.4, k + 40, 0.06)
        tp = top + wob2(s, w, 0.8, k + 60, 0.08) + ((s - ss) * math.cos(k) + (w - sw) * math.sin(k)) * 0.07
        F = np.maximum(F, F + (tp - F) * sstep(-0.12, 0.12, e))
    return F


F2 = ndi.gaussian_filter(floor_at(GS, GW), 0.55)          # (a little soft: a face's edge would follow the grid's steps)
log('floor')
_gx, _gz = np.gradient(F2, H)
FACE = np.hypot(_gx, _gz) >= 0.9                                      # the faces she climbs (the game's slope of 0.9)
FACE_D = ndi.distance_transform_edt(~FACE) * H
FOOT = (ndi.maximum_filter(F2, size=int(2 * 1.6 / H) + 1) - F2) > 1.2
WAY_D = np.min([poly2(GS, GW, w)[0] for w in WAYS], axis=0)
POOL_RHO = np.hypot((GS - POOL['c'][0]) / POOL['r'][0], (GW - POOL['c'][1]) / POOL['r'][1])


def grid_at(A, x, z):
    i, k = int(round((x - X0) / H)), int(round((z - Z0) / H))
    return A[min(max(i, 0), NX - 1), min(max(k, 0), NZ - 1)]


def floor_here(x, z):
    return float(grid_at(F2, x, z))


# ---------------------------------------------------------------- the rock, everywhere (> 0 in rock)
Xg, Yg, Zg = np.meshgrid(xs, ys, zs, indexing='ij')
Sg = (Xg - MOUTH[0]) * D[0] + (Zg - MOUTH[1]) * D[1]
Wg = (Xg - MOUTH[0]) * R[0] + (Zg - MOUTH[1]) * R[1]
w1 = fbm3(Xg * 0.04 + 11, Yg * 0.04, Zg * 0.04, 21) - 0.5
w2 = fbm3(Xg * 0.04, Yg * 0.04 + 47, Zg * 0.04, 22) - 0.5
w3 = fbm3(Xg * 0.04, Yg * 0.04, Zg * 0.04 + 83, 23) - 0.5
Qs, Qy, Qw = Sg + w1 * 7, Yg + w2 * 3, Wg + w3 * 7
log('warp')
# the hall: a dome on walls
hs, hw = HALL['c']; rs, rw = HALL['r']
ang = np.arctan2((Wg[:, 0, :] - hw) / rw, (Sg[:, 0, :] - hs) / rs)
rho = np.hypot((Qs - hs) / rs, (Qw - hw) / rw) * (1 + 0.06 * (fbm3(np.cos(ang) * 1.7, np.sin(ang) * 1.7, 0.5 + 0 * ang, 31) - 0.5) * 2)[:, None, :]
HWALL = HALL['floor'] + HALL['wall'] + 1.8 * (fbm3(Xg[:, :1, :] * 0.06, Zg[:, :1, :] * 0.06, 4.4 + 0 * Xg[:, :1, :], 32) - 0.5) * 2
HAPEX = HALL['floor'] + HALL['apex']
tt = np.maximum(Yg - HWALL, 0) / (HAPEX - HWALL)
S = (np.sqrt(rho * rho + tt * tt) - 1.0) * 15.0


def chain_sd(pts, half, tall, s_, w_, y_, seed):
    """a tunnel along a chain of (s, w, floor): an arched section, its floor cut by the floor's own height"""
    d, t = poly2(s_[:, 0, :], w_[:, 0, :], [(p[0], p[1]) for p in pts])
    fl = tunnel_floor(t, pts)[:, None, :]
    a = half + 0.35 * (fbm3(s_ * 0.3, y_ * 0.3, w_ * 0.3, seed, 2) - 0.5) * 2
    b = tall * 0.62
    yc = fl + tall - b
    q = np.sqrt((d[:, None, :] / a) ** 2 + (np.maximum(y_ - yc, 0) / b) ** 2 + (np.minimum(y_ - yc, 0) / (tall * 1.4)) ** 2)
    return (q - 1.0) * np.minimum(a, b)


S = smin(S, chain_sd(TUNNEL, T_HALF, T_TALL, Sg, Wg, Yg, 61), 1.3)
S = smin(S, chain_sd(WAYON, 2.1, 4.4, Sg, Wg, Yg, 62), 1.2)
# the jaw: the tunnel's end opened wide onto the hall
js, jw = JAW['c']; ra, rb, rc = JAW['r']
Sj = (np.sqrt(((Qs - js) / ra) ** 2 + ((Qw - jw) / rb) ** 2 + ((Yg - JAW['y']) / rc) ** 2) - 1.0) * min(ra, rb, rc)
S = smin(S, Sj, 1.4)
# the ledge behind the curtain: open up to the lip (only the curtain is beyond it)
alc = np.maximum(np.maximum(-4.8 - Sg, Sg - face_s(Yg)), np.abs(Wg) - 5.7 - 0.5 * (fbm3(Yg * 0.2, Wg * 0.2, 2.2 + 0 * Yg, 63) - 0.5))
S = smin(S, alc, 0.6)
for fn in FINS:                            # the ribs, rock out to their foot (only outside the cliff: the tunnel's air is behind it)
    rise = LEDGE - 0.4 + (Sg - fn['foot']) * 4.2
    fsd = np.maximum(np.abs(Wg - fn['w']) - fn['half'] - 0.25 * (fbm3(Yg * 0.4, Sg * 0.4, 5.5 + 0 * Yg, 64) - 0.5), (Yg - rise) * 0.24)
    fsd = np.maximum(fsd, Sg - 0.15)
    S = smax(S, -fsd, 0.45)
log('hall, tunnels, jaw, ledge, ribs')
# rock lumps and strata on the walls and the roof (none on the floor: that stays as laid out); the cliff behind the curtain
# gets its own ledges (the village's cliffs are strata too)
lump = (0.5 - worley3(Qs * 0.17, Qy * 0.17, Qw * 0.17, 41)) * 2.0 + (fbm3(Xg * 0.34, Yg * 0.34, Zg * 0.34, 42, 2) - 0.5) * 1.1 \
    + (0.5 - worley3(Xg * 0.5, Yg * 0.62, Zg * 0.5, 43)) * 0.75                    # smaller blocks: facets the light catches up close
strata = (np.abs(np.mod(Yg / 2.7 + 0.5 * w2 * 2 + 0.3 * w1, 1.0) - 0.5) - 0.25) * 1.4
S = S + lump * (1 - 0.6 * sstep(0.5, -1.5, Sg)) + strata
# the floor
S = smax(S, F2[:, None, :] - Yg, 0.8)
# the column: a fang that met the floor, narrow in the middle
cx, cz = world(COLUMN[0], COLUMN[1])
dxz = np.hypot(Xg - cx, Zg - cz)
cr = COLUMN[2] * (1.0 - 0.45 * np.exp(-((Yg - (HALL['floor'] + 5.5)) / 3.2) ** 2)) + (0.5 - worley3(Xg * 0.6, Yg * 0.6, Zg * 0.6, 71)) * 0.5 \
    + 0.12 * np.cos(np.arctan2(Zg - cz, Xg - cx) * 7 + Yg * 0.3)
S = smax(S, -(dxz - cr), 1.2)
log('lumps, floor, column')
# the outside of the grid is rock
S[0, :, :] = np.maximum(S[0, :, :], 1.0); S[-1, :, :] = np.maximum(S[-1, :, :], 1.0)
S[:, :, 0] = np.maximum(S[:, :, 0], 1.0); S[:, :, -1] = np.maximum(S[:, :, -1], 1.0)
S[:, 0, :] = np.maximum(S[:, 0, :], 1.0); S[:, -1, :] = np.maximum(S[:, -1, :], 1.0)
rock = S > 0
lab, n = ndi.label(rock)
if n > 1:
    sizes = ndi.sum(rock, lab, range(1, n + 1))
    keep = 1 + int(np.argmax(sizes))
    S = np.where(rock & (lab != keep), -0.05, S)
    log('specks taken away:', n - 1)
air = S < 0
lab, n = ndi.label(air)
if n > 1:
    hall_lab = np.bincount(lab[air]).argmax()
    S = np.where(air & (lab != hall_lab), 0.05, S)
    log('sealed pockets filled:', n - 1)
S = S.astype(np.float32)
del Qs, Qy, Qw, w1, w2, w3, lump, strata, tt, rho, Sj, alc


def sample(F, px, py, pz):
    c = np.stack([(px - X0) / H, (py - Y0) / H, (pz - Z0) / H])
    return ndi.map_coordinates(F, c, order=1, mode='nearest')


def roof_over(x, z, f, top=Y1):
    """the rock's underside over a spot of floor f (first rock up from 1 m over it), or None"""
    yy = np.arange(f + 1.0, top, 0.1)
    sv = sample(S, np.full_like(yy, x), yy, np.full_like(yy, z))
    hit = np.where(sv > 0)[0]
    return float(yy[hit[0]]) if len(hit) else None


# ---------------------------------------------------------------- the fangs: where (sharp things: meshes of their own, in the field too)
def in_way(x, z, face=1.4):
    if grid_at(WAY_D, x, z) < 1.9 or grid_at(FACE_D, x, z) < face:
        return True
    s, w = (x - MOUTH[0]) * D[0] + (z - MOUTH[1]) * D[1], (x - MOUTH[0]) * R[0] + (z - MOUTH[1]) * R[1]
    if math.hypot(s - COLUMN[0], w - COLUMN[1]) < COLUMN[2] + 1.6:
        return True
    if any(math.hypot(s - a, w - b) < r + 1.0 for a, b, _, r in STUMPS):
        return True
    d, _ = poly2(np.array([s]), np.array([w]), RAMP)
    if d[0] < RAMP_HALF + 0.9:
        return True
    return False


def sw_of(x, z):
    return (x - MOUTH[0]) * D[0] + (z - MOUTH[1]) * D[1], (x - MOUTH[0]) * R[0] + (z - MOUTH[1]) * R[1]


fangs = []          # dict(x, z, root, tip, R, bx, bz, seed, up)  up: True for one rising from the floor


def room_for(x, z, R_, lst=None, k=1.2, extra=0.35):
    for f in (fangs if lst is None else lst):
        if math.hypot(x - f['x'], z - f['z']) < (R_ + f['R']) * k + extra:
            return False
    return True


def add_roof_fang(x, z, L, R_, seed, bend=None):
    f = floor_here(x, z)
    roof = roof_over(x, z, f)
    if roof is None:
        return None
    b = rng.uniform(0, 6.283) if bend is None else bend
    bl = rng.uniform(0.03, 0.2) * L
    fd = dict(x=float(x), z=float(z), root=float(roof + 0.55 * R_ + 0.25), tip=float(roof - L), R=float(R_), bx=float(math.cos(b) * bl),
              bz=float(math.sin(b) * bl), seed=int(seed), up=False, floor=float(f))
    fangs.append(fd)
    return fd


# the jaw: big fangs hanging over the tunnel's end, and rising beside it (she walks into a giant's mouth)
for i, (w, L) in enumerate(((-0.9, 4.4), (1.1, 2.9), (3.3, 2.2), (5.5, 3.1), (7.8, 4.7))):
    x, z = world(22.5 + 0.25 * math.sin(i * 2.1), w)
    add_roof_fang(x, z, L, 0.42 + 0.13 * L, 500 + i, bend=math.atan2(D[1], D[0]))     # (their tips lean in, over the hall)
for i, (s, w, h) in enumerate(((22.9, -1.5, 2.7), (23.3, 8.9, 3.2), (24.6, 10.0, 1.6))):
    x, z = world(s, w)
    f = floor_here(x, z)
    fangs.append(dict(x=float(x), z=float(z), root=float(f - 0.6), tip=float(f + h), R=float(0.4 + 0.2 * h), bx=0.0, bz=0.0, seed=520 + i, up=True, floor=float(f)))
# the hall's roof: many, of every size; the big ones over the pool (mirrored in it); none too low over where she walks or hops
tries = 0
while len(fangs) < 150 and tries < 30000:
    tries += 1
    s, w = rng.uniform(HALL['c'][0] - HALL['r'][0], HALL['c'][0] + HALL['r'][0]), rng.uniform(HALL['c'][1] - HALL['r'][1], HALL['c'][1] + HALL['r'][1])
    if math.hypot((s - HALL['c'][0]) / HALL['r'][0], (w - HALL['c'][1]) / HALL['r'][1]) > 0.97 or s < 23.0:
        continue
    x, z = world(s, w)
    f = floor_here(x, z)
    roof = roof_over(x, z, f)
    if roof is None or roof - f < 6.0:
        continue
    over_pool = grid_at(POOL_RHO, x, z) < 0.95
    over_hop = any(math.hypot(s - a, w - b) < r + 2.2 for a, b, _, r in STUMPS)
    low = max(f, max((t for a, b, t, r in STUMPS if math.hypot(s - a, w - b) < r + 2.2), default=f))
    margin = 4.6 if over_hop else (3.0 if over_pool else 3.3)
    u = rng.random()
    L = 1.0 + 7.5 * u ** (1.6 if over_pool else 2.3)
    L = min(L, roof - low - margin)
    if L < 0.8:
        continue
    R_ = (0.22 + 0.16 * L) * rng.uniform(0.8, 1.2)
    if not room_for(x, z, R_):
        continue
    add_roof_fang(x, z, L, R_, 600 + len(fangs))
# the tunnel's roof, its inner half: a few small ones
tries = 0
while len([f for f in fangs if sw_of(f['x'], f['z'])[0] < 21]) < 18 and tries < 4000:
    tries += 1
    s = rng.uniform(9.0, 20.5)
    _, t = poly2(np.array([s]), np.array([0.0]), [(p[0], p[1]) for p in TUNNEL])
    wl = np.interp(s, [p[0] for p in TUNNEL], [p[1] for p in TUNNEL])
    w = wl + rng.uniform(-1.6, 1.6)
    x, z = world(s, w)
    f = floor_here(x, z)
    roof = roof_over(x, z, f)
    if roof is None or roof - f < 4.4:
        continue
    L = min(rng.uniform(0.5, 1.6), roof - f - 3.3)
    if L < 0.4:
        continue
    R_ = 0.18 + 0.17 * L
    if room_for(x, z, R_):
        add_roof_fang(x, z, L, R_, 700 + len(fangs))
# stalagmites: under some of the big ones (where their drops fall), along the walls, a few standing free; off the ways,
# the faces, the pool and the hops
n_roof = len(fangs)
ups = []
for f in sorted(fangs[:n_roof], key=lambda f: -(f['root'] - f['tip'])):
    if len(ups) >= 9:
        break
    x, z = f['x'] + f['bx'], f['z'] + f['bz']
    if in_way(x, z, 2.0) or grid_at(POOL_RHO, x, z) < 1.25 or sw_of(x, z)[0] < 24.5:
        continue
    fl = floor_here(x, z)
    gap = f['tip'] - fl
    h = min(rng.uniform(1.0, 3.4), gap - 2.6)
    if h < 0.7 or grid_at(FACE_D, x, z) < 2.0:
        continue
    R_ = 0.3 + 0.2 * h
    if not room_for(x, z, R_, ups, 1.1, 0.5):
        continue
    ups.append(dict(x=float(x), z=float(z), root=float(fl - 0.6), tip=float(fl + h), R=float(R_), bx=0.0, bz=0.0, seed=800 + len(ups), up=True, floor=float(fl)))
tries = 0
while len(ups) < 24 and tries < 9000:
    tries += 1
    s, w = rng.uniform(23, 52), rng.uniform(-9, 19)
    x, z = world(s, w)
    fl = floor_here(x, z)
    if fl > HALL['floor'] + 0.8 or in_way(x, z, 2.2) or grid_at(POOL_RHO, x, z) < 1.3:
        continue
    near_wall = -sample(S, np.array([x]), np.array([fl + 3.0]), np.array([z]))[0]
    if near_wall > 3.5 and rng.random() < 0.8:
        continue
    roof = roof_over(x, z, fl)
    if roof is None:
        continue
    h = min(1.0 + 4.6 * rng.random() ** 1.8, roof - fl - 3.0)
    if h < 0.8:
        continue
    R_ = (0.3 + 0.2 * h) * rng.uniform(0.85, 1.15)
    if not room_for(x, z, R_, ups, 1.1, 0.5) or not room_for(x, z, R_, [f for f in fangs if f['tip'] - fl < h + 1.5], 1.0, 0.3):
        continue
    ups.append(dict(x=float(x), z=float(z), root=float(fl - 0.6), tip=float(fl + h), R=float(R_), bx=0.0, bz=0.0, seed=850 + len(ups), up=True, floor=float(fl)))
fangs += ups
log('fangs', len(fangs), '(hanging', sum(1 for f in fangs if not f['up']), ', rising', sum(1 for f in fangs if f['up']), ')')


def fang_axis(f, t):
    """the fang's middle at a share t of its length from the root (0) to the tip (1): it bends a little as it goes"""
    y = f['root'] + (f['tip'] - f['root']) * t
    return f['x'] + f['bx'] * t * t, y, f['z'] + f['bz'] * t * t


def fang_radius(f, t):
    # sharp at the tip, flaring into the rock at the root; one rising from the floor rounder at its top
    return f['R'] * (1.0 - t) ** (0.62 if f['up'] else 0.78) * (1.0 + 0.55 * np.exp(-t / 0.09))


# the field she and the light meet: the rock with the fangs in it (the mesh is drawn from the rock without them)
SL = S.copy()
for f in fangs:
    lo, hi = min(f['root'], f['tip']) - 0.6, max(f['root'], f['tip']) + 0.6
    reach = f['R'] * 1.6 + abs(f['bx']) + abs(f['bz']) + 0.8
    i0, i1 = np.searchsorted(xs, f['x'] - reach), np.searchsorted(xs, f['x'] + reach)
    k0, k1 = np.searchsorted(zs, f['z'] - reach), np.searchsorted(zs, f['z'] + reach)
    j0, j1 = np.searchsorted(ys, lo), np.searchsorted(ys, hi)
    sx, sy, sz = Xg[i0:i1, j0:j1, k0:k1], Yg[i0:i1, j0:j1, k0:k1], Zg[i0:i1, j0:j1, k0:k1]
    t = np.clip((sy - f['root']) / (f['tip'] - f['root']), 0, 1)
    ax, _, az = fang_axis(f, t)
    d = np.hypot(sx - ax, sz - az) - fang_radius(f, t)
    beyond = (f['tip'] - sy) if not f['up'] else (sy - f['tip'])
    d = np.maximum(d, beyond)
    SL[i0:i1, j0:j1, k0:k1] = smax(SL[i0:i1, j0:j1, k0:k1], -d.astype(np.float32), 0.35)
log('fangs in the field')

# ---------------------------------------------------------------- the meshes: the rock (marching cubes), the fangs (each its own)
verts, faces, normals, _ = measure.marching_cubes(S, level=0.0, spacing=(H, H, H), gradient_direction='ascent')
verts = verts + np.array([X0, Y0, Z0])
log('rock mesh', len(verts), 'vertices', len(faces), 'triangles')
e = 0.4
gx = sample(S, verts[:, 0] + e, verts[:, 1], verts[:, 2]) - sample(S, verts[:, 0] - e, verts[:, 1], verts[:, 2])
gy = sample(S, verts[:, 0], verts[:, 1] + e, verts[:, 2]) - sample(S, verts[:, 0], verts[:, 1] - e, verts[:, 2])
gz = sample(S, verts[:, 0], verts[:, 1], verts[:, 2] + e) - sample(S, verts[:, 0], verts[:, 1], verts[:, 2] - e)
NR = -np.stack([gx, gy, gz], 1)
NR /= np.linalg.norm(NR, axis=1, keepdims=True) + 1e-9
tri = verts[faces]
fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
if np.mean(np.sum(fn * NR[faces].mean(1), 1)) < 0:
    faces = faces[:, ::-1]
# take away the rock's triangles that lie wholly inside a fang's root (the fang's own surface is drawn there)
inside_fang = sample(SL, verts[:, 0], verts[:, 1], verts[:, 2]) > 0.25
keep = ~inside_fang[faces].all(1)
faces = faces[keep]
log('rock triangles hidden in fang roots taken away:', int((~keep).sum()))
# out past the ledge is the day (the lake, the far bank, the sky: the page draws it): the rock the grid closes there with,
# and the lake's bed far out, taken away
vs_ = (verts[:, 0] - MOUTH[0]) * D[0] + (verts[:, 2] - MOUTH[1]) * D[1]
out_ = vs_ < -3.3
keep = ~out_[faces].all(1)
faces = faces[keep]
log('rock beyond the ledge taken away:', int((~keep).sum()), 'triangles')


def fang_mesh(f):
    L = abs(f['tip'] - f['root'])
    segs = 12 if f['R'] > 0.7 else (10 if f['R'] > 0.4 else 8)
    rings = int(np.clip(L / 0.22, 9, 30))
    u = np.linspace(0, 1, rings)
    t = 1 - (1 - u) ** 1.5                                               # rings closer toward the tip
    th = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    r0 = np.random.default_rng(f['seed'])
    nf = int(r0.integers(5, 9)); ph = r0.uniform(0, 6.283); ph2 = r0.uniform(0, 6.283)
    P = []
    for ti in t[:-1]:
        ax, ay, az = fang_axis(f, ti)
        base = fang_radius(f, ti)
        flute = 1 + 0.15 * np.cos(nf * th + ph + ti * 3.0) * (1 - ti) ** 0.4              # ridges down it, turning a little
        ring = 1 + 0.08 * np.sin(ti * L / 0.5 * 6.283 + ph2) + 0.07 * np.exp(-((ti - 0.55) / 0.06) ** 2)   # ring on ring, one knob
        bump = 1 + 0.16 * (vnoise3(np.cos(th) * 1.3 + f['seed'], np.sin(th) * 1.3, np.full_like(th, ti * L * 0.9), 91) - 0.5)
        rr = base * flute * ring * bump
        P.append(np.stack([ax + np.cos(th) * rr, np.full_like(th, ay), az + np.sin(th) * rr], 1))
    P = np.concatenate(P, 0)
    tip = np.array([fang_axis(f, 1.0)])
    P = np.concatenate([P, tip], 0)
    n_r = rings - 1
    F_ = []
    for i in range(n_r - 1):
        for j in range(segs):
            a, b = i * segs + j, i * segs + (j + 1) % segs
            c, d = (i + 1) * segs + j, (i + 1) * segs + (j + 1) % segs
            F_ += [(a, c, b), (b, c, d)]
    last = (n_r - 1) * segs
    for j in range(segs):
        F_.append((last + j, len(P) - 1, last + (j + 1) % segs))
    F_ = np.array(F_, np.int64)
    # wound to face out (away from its middle): flip if not
    trp = P[F_]
    nrm = np.cross(trp[:, 1] - trp[:, 0], trp[:, 2] - trp[:, 0])
    mx_, _, mz_ = fang_axis(f, 0.5)
    out = trp.mean(1) - np.array([mx_, 0.0, mz_])
    out[:, 1] = 0
    if np.mean(np.sum(nrm * out, 1)) < 0:
        F_ = F_[:, ::-1]
    tvals = np.concatenate([np.repeat(t[:-1], segs), [1.0]])
    return P, F_, tvals


fv, ff, ft, fid = [], [], [], []
base = 0
for k, f in enumerate(fangs):
    P, F_, tv = fang_mesh(f)
    fv.append(P); ff.append(F_ + base); ft.append(tv); fid.append(np.full(len(P), k))
    base += len(P)
FV = np.concatenate(fv, 0); FF = np.concatenate(ff, 0); FT = np.concatenate(ft); FID = np.concatenate(fid)
# smooth normals from the faces round each vertex
FN = np.zeros_like(FV)
tri = FV[FF]
fnrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
for c in range(3):
    np.add.at(FN, FF[:, c], fnrm)
FN /= np.linalg.norm(FN, axis=1, keepdims=True) + 1e-9
log('fang meshes', len(FV), 'vertices', len(FF), 'triangles')

# ---------------------------------------------------------------- crystals, mushrooms, glowworms, ferns: where
up = NR[:, 1]
heights = verts[:, 1] - np.array([floor_here(x, z) for x, z in zip(verts[:, 0], verts[:, 2])])
VS, VW = sw_of(verts[:, 0], verts[:, 2])
cand_wall = np.where((np.abs(up) < 0.55) & (heights > 0.2) & (heights < 7.0) & (VS > 11.0))[0]
cand_floor = np.where(up > 0.82)[0]
rng.shuffle(cand_wall); rng.shuffle(cand_floor)


def far_from(p, lst, d):
    return all((p[0] - q['p'][0]) ** 2 + (p[1] - q['p'][1]) ** 2 + (p[2] - q['p'][2]) ** 2 > d * d for q in lst)


crystals = []
for i in cand_wall:
    if len([c for c in crystals if c['kind'] == 'wall']) >= 26:
        break
    p, n = verts[i], NR[i]
    s = VS[i]
    if grid_at(FACE_D, p[0], p[2]) < 1.6 or (s < 25.0 and heights[i] > 2.2):      # (in the tunnel and the jaw: low, under her camera)
        continue
    bias = 0.25 + 0.5 * (s > 43) + 0.3 * (20 < s < 27) + 0.25 * (grid_at(POOL_RHO, p[0], p[2]) < 1.7) - 0.15 * (s < 18)
    if rng.random() > bias or not far_from(p, crystals, 4.4):
        continue
    if not room_for(p[0], p[2], 0.5, [f for f in fangs if f['up']], 1.0, 0.6):
        continue
    crystals.append(dict(kind='wall', p=[float(v) for v in p], n=[float(v) for v in n], size=float(rng.uniform(0.7, 1.5)),
                         col=str(rng.choice(['teal', 'teal', 'cyan', 'white'])), count=int(rng.integers(3, 8)), seed=int(rng.integers(1, 9999))))
for i in cand_floor:
    if len([c for c in crystals if c['kind'] == 'floor']) >= 11:
        break
    p = verts[i]
    if VS[i] < 22 or in_way(p[0], p[2]) or not far_from(p, crystals, 5.0) or grid_at(POOL_RHO, p[0], p[2]) < 1.25:
        continue
    if abs(p[1] - floor_here(p[0], p[2])) > 0.4:
        continue
    d_wall = -sample(S, np.array([p[0]]), np.array([p[1] + 3.0]), np.array([p[2]]))[0]
    if d_wall > 3.0 and rng.random() < 0.85:
        continue
    if not room_for(p[0], p[2], 0.6, [f for f in fangs if f['up']], 1.0, 0.5):
        continue
    crystals.append(dict(kind='floor', p=[float(v) for v in p], n=[0.0, 1.0, 0.0], size=float(rng.uniform(0.9, 1.7)),
                         col=str(rng.choice(['teal', 'cyan', 'teal'])), count=int(rng.integers(4, 9)), seed=int(rng.integers(1, 9999))))
# the way on, closed for now: big white crystals across it, a little way in
GATES = []
(a_s, a_w, a_f), (b_s, b_w, b_f) = WAYON[0], WAYON[1]
gs_, gw_ = a_s + (b_s - a_s) * 0.75, a_w + (b_w - a_w) * 0.75
gx_, gz_ = world(gs_, gw_)
crystals.append(dict(kind='floor', p=[float(gx_), float(a_f), float(gz_)], n=[0.0, 1.0, 0.0], size=2.0, col='white', count=11, seed=int(rng.integers(1, 9999))))
GATES.append([round(float(gx_), 2), round(float(gz_), 2), 1.8])
log('crystals', len(crystals))

shrooms = []
for i in cand_floor:
    if len(shrooms) >= 28:
        break
    p = verts[i]
    if VS[i] < 20 or in_way(p[0], p[2], 1.2) or grid_at(POOL_RHO, p[0], p[2]) < 1.2:
        continue
    if abs(p[1] - floor_here(p[0], p[2])) > 0.4:
        continue
    d_wall = -sample(S, np.array([p[0]]), np.array([p[1] + 3.0]), np.array([p[2]]))[0]
    near_up = min((math.hypot(p[0] - f['x'], p[2] - f['z']) - f['R'] for f in fangs if f['up']), default=9)
    s_, w_ = sw_of(p[0], p[2])
    near_col = math.hypot(s_ - COLUMN[0], w_ - COLUMN[1]) - COLUMN[2]
    if d_wall > 2.2 and near_up > 1.4 and near_col > 2.4 and rng.random() < 0.88:
        continue
    if near_up < 0.3 or any((p[0] - q['p'][0]) ** 2 + (p[2] - q['p'][2]) ** 2 < 2.5 ** 2 for q in shrooms):
        continue
    shrooms.append(dict(p=[float(v) for v in p], count=int(rng.integers(3, 8)), seed=int(rng.integers(1, 9999)), size=float(rng.uniform(0.7, 1.3))))
log('mushrooms', len(shrooms))

# glowworms: on the roof's underside between the fangs, high up, in clusters (deeper in than the daylight reaches)
cand = np.where((NR[:, 1] < -0.5) & (heights > np.where(VS < 21.0, 4.3, 6.0)) & (VS > 12.0))[0]
clus = fbm3(verts[cand, 0] * 0.22, verts[cand, 1] * 0.22, verts[cand, 2] * 0.22, 95)
pick = cand[(rng.random(len(cand)) < sstep(0.36, 0.6, clus) * 0.9 + 0.06) & (rng.random(len(cand)) < 0.9)]
if len(pick) > 3600:
    pick = rng.choice(pick, 3600, replace=False)
GLOW = verts[pick] + NR[pick] * 0.06 + rng.normal(0, 0.04, (len(pick), 3))
log('glowworms', len(GLOW))

# ferns where the daylight reaches (the ledge's sides, the tunnel's first metres along its walls): filled in after the light
cover = []

# ---------------------------------------------------------------- light
def soft_shadow(F, P, Dv, tmax, k=5.0, step0=0.25, steps=90):
    res = np.ones(len(P))
    t = np.full(len(P), step0)
    alive = np.ones(len(P), bool)
    for _ in range(steps):
        q = P + Dv * t[:, None] if Dv.ndim == 2 else P + Dv[None, :] * t[:, None]
        d = -sample(F, q[:, 0], q[:, 1], q[:, 2])
        res = np.where(alive, np.minimum(res, np.clip(k * d / t, 0, 1)), res)
        alive &= (d > 0.02) & (t < tmax)
        t = t + np.clip(d, 0.22, 1.5)
        if not alive.any():
            break
    return np.where(t >= tmax, res, np.where(res > 0.02, res * 0.0, 0.0))


def ao_at(F, P, Nn):
    occ = np.zeros(len(P))
    for hstep, w in ((0.35, 0.5), (0.8, 0.3), (1.7, 0.2), (3.4, 0.12)):
        q = P + Nn * hstep
        d = -sample(F, q[:, 0], q[:, 1], q[:, 2])
        occ += w * np.clip((hstep - d) / hstep, 0, 1)
    return np.clip(1.0 - occ * 1.15, 0.12, 1.0)


AMB = np.array([0.12, 0.15, 0.23])                 # the cave's own dark: blue, so its shapes still read
GW_COL = np.array([0.40, 0.76, 0.86])              # the glowworms' light from the roof
DAY_COL = np.array([0.86, 0.95, 1.0])              # the daylight through the falling water
CRY_COL = {'teal': np.array([0.30, 0.96, 0.88]), 'cyan': np.array([0.42, 0.86, 1.0]), 'white': np.array([0.80, 0.95, 1.0])}
SHROOM_COL = np.array([0.72, 0.55, 1.0])
DAY_MAX = 3.2                                      # the daylight's strength kept on its own (the shader makes it shimmer)

# the curtain as a light: points over it (it shines in, toward the cliff, the mouth and the tunnel)
DAY_PTS = []
for w in (-3.9, -1.3, 1.3, 3.9):
    for y in (-10.2, -7.9, -5.6, -3.2):
        s = float(curtain_s(np.array(y))) + 0.15
        x, z = world(s, w)
        DAY_PTS.append(np.array([x, y, z]))
DIN = np.array([D[0], 0.0, D[1]])
# glowworm points as lights: a few under the hall's roof
GW_PTS = []
for s, w in ((27, -3), (27, 10), (33, 3), (33, 15), (38, -5), (39, 8), (44, 1), (45, 13), (50, 6), (31, -8), (36, 18)):
    x, z = world(s, w)
    f = floor_here(x, z)
    rf = roof_over(x, z, f)
    if rf is not None:
        p = np.array([x, rf - 1.2, z])
        while sample(SL, p[:1], p[1:2], p[2:]) [0] > -0.3 and p[1] > f + 3:
            p[1] -= 0.3
        GW_PTS.append(p)
log('lights: daylight', len(DAY_PTS), 'glowworm', len(GW_PTS))


def point_lights(P, Nn, lights):
    out = np.zeros((len(P), 3))
    for (lp, col, inten, rad) in lights:
        Dv = np.array(lp)[None, :] - P
        d = np.linalg.norm(Dv, axis=1) + 1e-6
        lam = np.clip((np.sum(Nn * Dv, 1) / d) * 0.5 + 0.5, 0, 1) ** 2 if Nn is not None else 1.0
        fall = inten / (1.0 + (d / (rad * 0.35)) ** 2) * sstep(rad, rad * 0.4, d)
        out += (lam * fall)[:, None] * np.array(col)[None, :]
    return out


LIGHTS = []
for c in crystals:
    k = {'wall': 0.36, 'floor': 0.48}[c['kind']] * c['size']
    n = np.array(c['n'])
    LIGHTS.append((np.array(c['p']) + n * 0.6, CRY_COL[c['col']], k, 6.8))
for s in shrooms:
    LIGHTS.append((np.array(s['p']) + np.array([0, 0.35, 0]), SHROOM_COL, 0.2 * s['size'], 3.2))


def bake(P, Nn, field_sh, field_ao, ao_extra=None):
    """the light at points on a surface: (rgb without the daylight, the daylight's share, ao)"""
    ao = ao_at(field_ao, P, Nn)
    if ao_extra is not None:
        ao = ao * ao_extra
    day = np.zeros(len(P))
    for lp in DAY_PTS:
        Dv = lp[None, :] - P
        dist = np.linalg.norm(Dv, axis=1) + 1e-6
        Dn = Dv / dist[:, None]
        lam = np.clip(np.sum(Nn * Dn, 1) * 0.8 + 0.2, 0, 1)                         # (a little wrapped: light through water is soft)
        emit = np.clip(-np.sum(Dn * DIN[None, :], 1), 0, 1) ** 0.7                   # the curtain shines in, not out
        vis = soft_shadow(field_sh, P + Nn * 0.08, Dn, tmax=dist - 0.4, k=6.0, steps=80)
        day += lam * emit * vis * 9.0 / (dist * dist + 5.0) / len(DAY_PTS) * 6.0
    # what the lit ledge and the tunnel's first walls throw back in (no shadow: it is soft)
    mx, mz = world(1.2, 0.1)
    Db = np.stack([mx - P[:, 0], LEDGE + 1.6 - P[:, 1], mz - P[:, 2]], 1)
    db = np.linalg.norm(Db, axis=1) + 1e-6
    day += np.exp(-(db / 9.0) ** 2) * (0.35 + 0.65 * np.clip(np.sum(Nn * Db, 1) / db, 0, 1)) * 0.55
    gw = np.zeros((len(P), 3))
    for lp in GW_PTS:
        Dv = lp[None, :] - P
        dist = np.linalg.norm(Dv, axis=1) + 1e-6
        Dn = Dv / dist[:, None]
        lam = np.clip(np.sum(Nn * Dn, 1) * 0.5 + 0.5, 0, 1) ** 2
        vis = soft_shadow(field_sh, P + Nn * 0.08, Dn, tmax=dist - 0.3, k=4.0, steps=70)
        gw += (lam * vis * 40.0 / (dist * dist + 60.0))[:, None] * GW_COL[None, :] / len(GW_PTS) * 1.7
    glow = point_lights(P, Nn, LIGHTS)
    rgb = (AMB[None, :] + gw) * ao[:, None] + glow * (0.35 + 0.65 * ao[:, None])
    return rgb, np.clip(day * (0.3 + 0.7 * ao), 0, DAY_MAX) / DAY_MAX, ao


V = verts.astype(np.float64)
rock_rgb, rock_day, rock_ao = bake(V, NR, SL, SL)
log('rock lit')
# a fang: no shadow of its own (the field's fang is rougher than the mesh), darker toward its root where it meets the rock
F_root = np.clip(0.55 + 0.45 * sstep(0.0, 0.35, FT), 0, 1)
fang_rgb, fang_day, fang_ao = bake(FV.astype(np.float64), FN, S, S, F_root)
log('fangs lit')
LSCALE = 4.0


def light8(rgb, day):
    return np.concatenate([np.clip(rgb / LSCALE * 255.0 + 0.5, 0, 255), np.full((len(rgb), 1), 255.0)], 1).astype(np.uint8)


# ---------------------------------------------------------------- the floor and the roof she walks between (from the rock with the fangs)
s_col = SL.transpose(0, 2, 1)
floorY = np.full((NX, NZ), np.nan, np.float32)
ceilY = np.full((NX, NZ), np.nan, np.float32)
for i in range(NX):
    col = s_col[i]
    for k in range(NZ):
        c = col[k]
        a = np.where((c[:-1] > 0) & (c[1:] <= 0))[0]
        if len(a) == 0:
            continue
        j = a[0]
        f = ys[j] + H * c[j] / (c[j] - c[j + 1])
        b = np.where((c[j + 1:-1] <= 0) & (c[j + 2:] > 0))[0]
        if len(b):
            jj = j + 1 + b[0]
            ce = ys[jj] + H * c[jj] / (c[jj] - c[jj + 1])
        else:
            ce = Y1 + 20
        floorY[i, k], ceilY[i, k] = f, ce
log('floor map')

# ---------------------------------------------------------------- the light in the air (for the plants and for her): 1 m cells
VC = 1.0
VX0, VY0, VZ0 = float(X0 + 1), -14.0, float(Z0 + 1)
vxs, vys, vzs = np.arange(VX0, X1 - 0.99, VC), np.arange(VY0, 8.01, VC), np.arange(VZ0, Z1 - 0.99, VC)
VNX, VNY, VNZ = len(vxs), len(vys), len(vzs)
P = np.stack(np.meshgrid(vxs, vys, vzs, indexing='ij'), -1).reshape(-1, 3)
inair = sample(SL, P[:, 0], P[:, 1], P[:, 2]) < 0.3
Pa = P[inair]
log('volume', VNX, VNY, VNZ, 'cells in the air:', len(Pa))
Nup = np.tile(np.array([[0.0, 1.0, 0.0]]), (len(Pa), 1))
v_day = np.zeros(len(Pa))
for lp in DAY_PTS:
    Dv = lp[None, :] - Pa
    dist = np.linalg.norm(Dv, axis=1) + 1e-6
    Dn = Dv / dist[:, None]
    emit = np.clip(-np.sum(Dn * DIN[None, :], 1), 0, 1) ** 0.7
    vis = soft_shadow(SL, Pa, Dn, tmax=dist - 0.4, k=6.0, steps=80)
    v_day += emit * vis * 9.0 / (dist * dist + 5.0) / len(DAY_PTS) * 6.0 * 0.6
mx, mz = world(1.2, 0.1)
v_day += np.exp(-(np.linalg.norm(Pa - np.array([mx, LEDGE + 1.6, mz]), axis=1) / 9.0) ** 2) * 0.45
v_gw = np.zeros((len(Pa), 3))
for lp in GW_PTS:
    Dv = lp[None, :] - Pa
    dist = np.linalg.norm(Dv, axis=1) + 1e-6
    vis = soft_shadow(SL, Pa, Dv / dist[:, None], tmax=dist - 0.3, k=4.0, steps=70)
    v_gw += (vis * 40.0 / (dist * dist + 60.0))[:, None] * GW_COL[None, :] / len(GW_PTS) * 1.6
openness = np.clip(-sample(SL, Pa[:, 0], Pa[:, 1], Pa[:, 2]) / 2.5, 0.35, 1.0)
v_glow = point_lights(Pa, None, LIGHTS)
VL = (AMB[None, :] * 1.15 + v_gw) * openness[:, None] + v_glow * 0.6 + np.clip(v_day, 0, DAY_MAX)[:, None] * DAY_COL[None, :]
vol = np.zeros((len(P), 4), np.float32)
vol[inair, :3] = VL
vol[inair, 3] = np.clip(v_day / DAY_MAX, 0, 1)
vol = vol.reshape(VNX, VNY, VNZ, 4)
mask = inair.reshape(VNX, VNY, VNZ)
idx = ndi.distance_transform_edt(~mask, return_distances=False, return_indices=True)
vol = vol[idx[0], idx[1], idx[2]]
vol8 = np.zeros((VNZ, VNY, VNX, 4), np.uint8)
vt = vol.transpose(2, 1, 0, 3)
vol8[..., :3] = np.clip(vt[..., :3] / LSCALE * 255 + 0.5, 0, 255)
vol8[..., 3] = np.clip(vt[..., 3] * 255 + 0.5, 0, 255)
log('volume baked')
del P, Pa

# ferns where the daylight reaches: along the ledge's back and the tunnel's walls, on the floor at their feet
DAYF = np.zeros((NX, NZ), np.float32)
ok = ~np.isnan(floorY)
ii, kk = np.where(ok & (GS < 16))
Pf = np.stack([xs[ii], floorY[ii, kk] + 0.3, zs[kk]], 1)
dd = np.zeros(len(Pf))
for lp in DAY_PTS[::2]:
    Dv = lp[None, :] - Pf
    dist = np.linalg.norm(Dv, axis=1) + 1e-6
    Dn = Dv / dist[:, None]
    vis = soft_shadow(SL, Pf, Dn, tmax=dist - 0.4, k=4.0, steps=60)
    dd += np.clip(-np.sum(Dn * DIN[None, :], 1), 0, 1) * vis * 9.0 / (dist * dist + 5.0)
DAYF[ii, kk] = dd
tries = 0
while len(cover) < 46 and tries < 6000:
    tries += 1
    s, w = rng.uniform(-1.8, 13.0), rng.uniform(-5.4, 5.4)
    x, z = world(s, w)
    i, k = int(round((x - X0) / H)), int(round((z - Z0) / H))
    if not (0 <= i < NX and 0 <= k < NZ) or not ok[i, k] or s < -1.7:
        continue
    f = float(floorY[i, k])
    if ceilY[i, k] - f < 2.5 or abs(f - F2[i, k]) > 0.3 or DAYF[i, k] < 0.12:
        continue
    gap = -sample(SL, np.array([x]), np.array([f + 1.3]), np.array([z]))[0]
    if gap > 1.4 or gap < 0.25 or grid_at(WAY_D, x, z) < 1.3:
        continue
    if any(math.hypot(x - c['x'], z - c['z']) < 0.95 for c in cover):
        continue
    cover.append(dict(kind='fern', x=float(x), z=float(z), y=f, seed=int(rng.integers(1, 9999)), scale=float(rng.uniform(0.7, 1.15))))
log('ferns', len(cover))

# ---------------------------------------------------------------- the floor's paint: earth on the ways, sand round the pool, moss where it is damp and lit
noise2 = lambda f, s: fbm3(GX * f, GZ * f, 0 * GX + 7.7, s)
rough = 0.75 + 0.5 * noise2(0.6, 91)
earth = sstep(1.7, 0.9, WAY_D) * (0.75 + 0.25 * noise2(1.3, 92)) * sstep(-1.5, 0.5, GS)
earth = np.maximum(earth, (FOOT & (FACE_D < 1.6)) * sstep(1.6, 0.5, FACE_D) * 0.65 * rough)
sand = sstep(1.42, 1.08, POOL_RHO + 0.06 * (noise2(0.5, 93) - 0.5))
moss = np.clip(DAYF / 1.2, 0, 1) * sstep(0.3, 0.7, noise2(0.35, 94) + 0.25)
moss = np.maximum(moss, sstep(0.55, 0.85, noise2(0.18, 95)) * sstep(1.2, 2.8, FACE_D) * 0.85 * (GS > 22))       # patches in the hall
for c in crystals + [dict(p=s['p']) for s in shrooms]:
    d = np.hypot(GX - c['p'][0], GZ - c['p'][2]) + 0.6 * (noise2(0.8, 96) - 0.5)
    moss = np.maximum(moss, sstep(3.0, 1.2, d) * 0.8)
sand = np.clip(sand, 0, 1)
earth = np.clip(earth, 0, 1) * (1 - sand)
moss = np.clip(moss * rough, 0, 1) * (1 - sand) * (1 - earth * 0.8)
bare = sstep(0.7, 0.2, FACE_D)
PAINT = np.stack([earth, sand, moss * (1 - bare), bare], -1).astype(np.float32)
# what is no floor of hers: rock standing over the floor as laid out (the walls' feet, the stalagmites, the column), past
# the ledge's edge (the lake: the curtain), past the crystals across the way on
WALL = np.isnan(floorY) | (np.nan_to_num(floorY, nan=99.0) - F2 > 0.5)
WALL |= GS < -1.9
for (a_s, a_w, _), (b_s, b_w, _) in [(WAYON[0], WAYON[1])]:
    ux, uw = b_s - a_s, b_w - a_w; ul = math.hypot(ux, uw); ux, uw = ux / ul, uw / ul
    along = (GS - gs_) * ux + (GW - gw_) * uw
    across = np.abs(-(GS - gs_) * uw + (GW - gw_) * ux)
    WALL |= (along > -0.2) & (across < 2.1 + 2.0)
# at the mesh: the floor's paint where it faces up at the column's floor; the fangs marked
pi_, pk_ = (V[:, 0] - X0) / H, (V[:, 2] - Z0) / H
pv = np.stack([ndi.map_coordinates(PAINT[..., c], [pi_, pk_], order=1, mode='nearest') for c in range(3)], 1)
fv_ = ndi.map_coordinates(np.nan_to_num(floorY, nan=-99.0), [pi_, pk_], order=0, mode='nearest')
onfloor = (np.abs(V[:, 1] - fv_) < 0.7) & (NR[:, 1] > 0.5)
pv[~onfloor] = 0
paint8 = np.concatenate([np.clip(pv * 255 + 0.5, 0, 255), np.zeros((len(pv), 1))], 1).astype(np.uint8)    # (last: 0 rock, 128 calcite)
paintG = np.clip(PAINT * 255 + 0.5, 0, 255).astype(np.uint8)
soft = (np.maximum(np.maximum(earth, sand), moss) > 0.5) & (bare < 0.5)
paintG[..., 3] = np.where(WALL, 255, np.where(soft, 0, 128))                            # (0 soil or moss / 128 bare rock / 255 no floor of hers)
# what the rock is like at each vertex: AO; moss on ledges the daylight reaches; wet (the spray, the pool, under drips); the daylight
VSv, VWv = sw_of(V[:, 0], V[:, 2])
wet_r = np.clip(1.0 - (VSv - 1.0) / 7.0, 0, 1) * 0.9 + np.clip(1.0 - (ndi.map_coordinates(POOL_RHO, [pi_, pk_], order=1, mode='nearest') - 1.0) / 0.5, 0, 1) * 0.6
moss_r = np.clip((NR[:, 1] - 0.5) / 0.35, 0, 1) * np.clip(rock_day * 2.4, 0, 1) * (1 - onfloor)
info_rock = np.stack([rock_ao, moss_r, np.clip(wet_r, 0, 1), rock_day], 1)
calc = np.zeros(len(V), bool)
calc_t = np.zeros(len(V))
for a_, b_, top, r_ in STUMPS:
    dd = np.hypot(VSv - a_, VWv - b_)
    m = (dd < r_ + 0.45) & (V[:, 1] > POOL['bed'] - 0.3) & (V[:, 1] < top + 0.3)
    calc |= m
    calc_t = np.where(m, 0.25 + 0.5 * np.clip((top - V[:, 1]) / 2.0, 0, 1), calc_t)
dd = np.hypot(VSv - COLUMN[0], VWv - COLUMN[1])
m = (dd < COLUMN[2] + 0.9) & (V[:, 1] > HALL['floor'] + 0.15)
calc |= m
calc_t = np.where(m, 0.3 + 0.3 * np.clip(np.abs(V[:, 1] - (HALL['floor'] + 5.5)) / 5.0, 0, 1), calc_t)
info_rock[calc, 1] = calc_t[calc]
paint8[calc] = np.array([0, 0, 0, 128], np.uint8)
log('calcite (stumps, column):', int(calc.sum()), 'vertices')
log('paint: earth', int((earth > 0.5).sum() * H * H), 'm2, sand', int((sand > 0.5).sum() * H * H), 'm2, moss', int((moss > 0.5).sum() * H * H), 'm2')

# drips: from the tips of the big fangs over the pool (a drop now and then, rings where it lands)
DRIPS = []
over = [f for f in fangs if not f['up'] and grid_at(POOL_RHO, f['x'] + f['bx'], f['z'] + f['bz']) < 0.8]
for f in sorted(over, key=lambda f: f['tip'])[:5]:
    DRIPS.append(dict(x=round(f['x'] + f['bx'], 3), y=round(f['tip'] - 0.04, 3), z=round(f['z'] + f['bz'], 3),
                      period=round(float(rng.uniform(2.6, 5.2)), 2), phase=round(float(rng.uniform(0, 5)), 2)))
log('drips', len(DRIPS))

# ---------------------------------------------------------------- one mesh: the rock, then the fangs (marked in aPaint's last: 128)
FS_, FW_ = sw_of(FV[:, 0], FV[:, 2])
wet_f = np.clip(1.0 - (np.array([grid_at(POOL_RHO, x, z) for x, z in zip(FV[:, 0], FV[:, 2])]) - 0.9) / 0.6, 0, 1) * 0.7
info_fang = np.stack([fang_ao, FT, wet_f, fang_day], 1)                                   # (a fang's G: how far down it the vertex is)
POS = np.concatenate([V, FV], 0).astype(np.float32)
NRM = np.concatenate([NR, FN], 0)
LIG = np.concatenate([light8(rock_rgb, rock_day), light8(fang_rgb, fang_day)], 0)
INF = np.clip(np.concatenate([info_rock, info_fang], 0) * 255 + 0.5, 0, 255).astype(np.uint8)
PNT = np.concatenate([paint8, np.tile(np.array([[0, 0, 0, 128]], np.uint8), (len(FV), 1))], 0)
IDX = np.concatenate([faces, FF + len(V)], 0).astype(np.uint32)
nrm8 = np.concatenate([np.clip(np.round(NRM * 127), -127, 127), np.zeros((len(NRM), 1))], 1).astype(np.int8)

# ---------------------------------------------------------------- the places, and write
PLACES = [
    dict(name='ทางเข้า', s=2.4, w=0.2, to=(10.0, 1.4)),
    dict(name='ปากเขี้ยว', s=23.2, w=3.9, to=(36.0, 5.0)),
    dict(name='ริมสระ', s=31.2, w=1.6, to=(37.0, 8.0)),
    dict(name='หิ้งหิน', s=47.4, w=9.0, to=(53.0, 10.8)),
]
places = []
for p in PLACES:
    x, z = world(p['s'], p['w'])
    places.append(dict(name=p['name'], x=round(x, 2), z=round(z, 2), heading=round(yaw_to(p['s'], p['w'], *p['to']), 3), y=round(floor_here(x, z), 2)))
rows = []
for y in np.linspace(FALL['top'], LAKE - 0.2, 30):
    s = float(curtain_s(np.array(y)))
    x, z = world(s, 0.0)
    rows.append([round(x, 3), round(float(y), 3), round(z, 3)])
pc = world(*POOL['c'])


def strand_rows(st):
    out = []
    for y in np.linspace(FALL['top'], LAKE - 0.2, 30):
        x, z = world(float(curtain_s(np.array(y))) + (st['lip'] - FALL['lip']), st['w'])
        out.append([round(x, 3), round(float(y), 3), round(z, 3)])
    return out

fl16 = np.where(np.isnan(floorY), -32768, np.round(floorY * 100)).astype(np.int16)
ce16 = np.where(np.isnan(ceilY), -32768, np.round(np.minimum(ceilY, 300) * 100)).astype(np.int16)
parts, off = [], 0


def put(arr):
    global off
    b = arr.tobytes()
    pad = (-len(b)) % 4
    parts.append(b + b'\0' * pad)
    o = off
    off += len(b) + pad
    return o


header = {
    # light: RGB the baked light (/ lightScale), not the daylight; info: AO, moss on the rock's ledges (a fang: how far down
    # it), wet, the daylight's share (x dayMax); paint: earth, sand, moss underfoot (the shader reads them from the floor
    # map's paint instead: smooth), and the kind: 128 calcite (a fang, the broken ones in the pool, the column), 0 rock
    'mesh': {'vertices': int(len(POS)), 'indices': int(IDX.size), 'rockIndices': int(faces.size),
             'pos': put(POS), 'nrm': put(nrm8), 'light': put(LIG), 'info': put(INF), 'paint': put(PNT), 'idx': put(IDX)},
    # as the forest hall's (cave-level.js reads it): floor[ix * nz + iz] Int16 cm; paint[(ix * nz + iz) * 4 + c]: earth, sand,
    # moss, and 0 soft (moss, earth, sand) / 128 bare rock / 255 no floor of hers
    'floor': {'nx': int(NX), 'nz': int(NZ), 'x0': float(X0), 'z0': float(Z0), 'cell': H,
              'floor': put(np.ascontiguousarray(fl16)), 'ceil': put(np.ascontiguousarray(ce16)), 'paint': put(np.ascontiguousarray(paintG))},
    'volume': {'nx': int(VNX), 'ny': int(VNY), 'nz': int(VNZ), 'x0': VX0, 'y0': VY0, 'z0': VZ0, 'cell': VC, 'data': put(vol8)},
    'glowworms': {'count': int(len(GLOW)), 'pos': put(GLOW.astype(np.float32))},
    'lightScale': LSCALE, 'dayMax': DAY_MAX,
}
with open(os.path.join(OUT, 'fang-hall.bin'), 'wb') as f:
    f.write(b''.join(parts))
layout = {
    'about': 'the fang hall (room 1 of the dungeon plan) and the way in from behind the big fall: made by tools/make-fang-hall.py, read by fang-hall.js',
    'bin': header,
    # in the hill village's frame: the mouth (the foot of the cliff behind the fall), the way in, the way to her right
    'frame': {'mouth': [MOUTH[0], LEDGE, MOUTH[1]], 'in': [D[0], D[1]], 'right': [R[0], R[1]], 'yawIn': round(YAW_IN, 4)},
    # the curtain of the fall, seen from behind: its middle from the lip down to the lake (x, y, z), how wide either side
    'curtain': {'rows': rows, 'half': FALL['half'], 'across': [R[0], 0.0, R[1]], 'lake': LAKE, 'exit': -1.2, 'ledge': list(LEDGE_W)},
    # the big fall's three strands, as the game has them (seen from behind): each one's middle from its lip down (x, y, z),
    # how wide either side of it
    'strands': [dict(half=st['half'], rows=strand_rows(st)) for st in STRANDS],
    'pool': {'c': [round(pc[0], 3), round(pc[1], 3)], 'r': POOL['r'][0] + 0.2, 'level': LAKE,
             'ellipse': {'a': POOL['r'][0], 'b': POOL['r'][1], 'along': [D[0], D[1]]}},
    'crystals': crystals, 'shrooms': shrooms, 'cover': cover, 'drips': DRIPS,
    'fangs': [dict(x=round(f['x'], 2), z=round(f['z'], 2), tip=round(f['tip'], 2), r=round(f['R'], 2), up=f['up']) for f in fangs],
    'columns': [[round(world(COLUMN[0], COLUMN[1])[0], 2), round(world(COLUMN[0], COLUMN[1])[1], 2), COLUMN[2]]],
    'stumps': [[round(world(a, b)[0], 2), round(world(a, b)[1], 2), t, r] for a, b, t, r in STUMPS],
    'spawn': {'x': places[0]['x'], 'z': places[0]['z'], 'yaw': places[0]['heading']},
    'places': places,
    'gates': GATES,
    'trees': [], 'hanging': [],
    'bounds': [float(X0), Y0, float(Z0), float(X1), Y1, float(Z1)],
}
json.dump(layout, open(os.path.join(OUT, 'fang-hall.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
log('wrote', os.path.getsize(os.path.join(OUT, 'fang-hall.bin')) // 1024, 'KB bin,', len(POS), 'vertices,', IDX.size // 3, 'triangles')
