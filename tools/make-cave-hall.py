#!/usr/bin/env python3
# make-cave-hall.py  —  the forest hall of the dungeon under the waterfall cliff (room ③ of the plan), baked for cave-hall.html
#
# One job: shape the hall as a field of distance to rock (a "density" field, the way abyssal-garden builds its seabed: rock is
# where the value is > 0), turn it into one mesh (marching cubes), and bake the light it will be seen in, so the phone does no
# lighting work for it but the sprite's (the one light that moves). Writes
#   assets/caves/cave-hall.bin   the mesh (positions, normals, baked light), the floor and ceiling she walks between, and a
#                                coarse 3D picture of the light in the air (for the plants and for her: cave-light.js)
#   assets/caves/cave-hall.json  where things are: crystals, mushrooms, trees, the trees hanging from the roof, the pool, the
#                                shaft of light, the places she can be put at; and where in the .bin each part is
#
# The hall (metres; x east, z south, y up; 0 = the forest floor):
#   a dome ~64 x 48 m, walls ~11 m, ~24 m at its crown, a crack through the roof the sun comes in at (a shaft onto a great tree);
#   west: a balcony 6 m up (the way in from the crystal passage, a tunnel stub), a ramp down along the south wall;
#   a pool under the crack's east end, fed by a thin fall of water from the crack; two columns floor to roof; fang stalactites;
#   stalagmites and boulders on the floor; a shelf 5 m up in the south-east.
# Made to be played (28 Nov 2026: "แต่จะเล่นยังไง ... ไม่มีให้ไต่ กระโดดสี่ชั้น วิ่ง"; chosen: "ไต่ขึ้นสู่แสง"): four levels
# going up along the north and east walls, the way on at the top. Each level's face is one she climbs (the game's climbing: a
# face is a steep step in the floor, never an overhang), and some are taken by the magic jump (4.4 m up in all):
#   0     the forest floor (the run: 40 m of it);
#   3.5   the rock tier along the north wall, up three stones (a jump each) or by its face;
#   7     the balcony in the north-east, from the tier up two pillars standing on it, or by the face between them;
#   11    the arm: a ridge of rock from the east wall reaching toward the shaft of light, its top a way west to its tip beside
#         the light (a notch across it near the tip, to be jumped); up its 4 m face from the balcony, or straight up its 11 m
#         face from the pool's shore; at its root, in the east wall, the way on (a tunnel stub, crystals across it).
# The floor's paint (moss, earth, sand, fallen leaves) and the plants go by the land's own rules, as the world above's do:
# moss where nothing else is; earth on the ways she walks and at the feet of the faces; sand round the pool; leaves under
# the trees; trees on the forest floor, more of them toward the light, off the ways, the faces and the shore; bushes at the
# feet of the walls and faces; ferns in the shade, at the trees' feet and along the walls; grass tufts only where the sun falls.
#
# Run: python3 tools/make-cave-hall.py            (needs numpy, scipy, scikit-image, matplotlib; ~1 minute)
import json, math, os, struct, sys, time
import numpy as np
from scipy import ndimage as ndi
from skimage import measure
from matplotlib.path import Path as MPath

T0 = time.time()
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets', 'caves')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(23)


def log(*a):
    print(f'[{time.time() - T0:5.1f}s]', *a, flush=True)


# ---------------------------------------------------------------- noise (hash-based: the same value for the same spot, any call)
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
    """distance to the nearest of one random point per unit cell (rock lumps: chunky, not blobby)"""
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


# ---------------------------------------------------------------- the grid
H = 0.45
X0, X1, Y0, Y1, Z0, Z1 = -40.0, 40.0, -4.0, 34.0, -32.0, 32.0
xs = np.arange(X0, X1 + 1e-6, H)
ys = np.arange(Y0, Y1 + 1e-6, H)
zs = np.arange(Z0, Z1 + 1e-6, H)
NX, NY, NZ = len(xs), len(ys), len(zs)
log('grid', NX, NY, NZ, NX * NY * NZ)

# ---------------------------------------------------------------- the floor, as a height for every x, z (plateaus, ramps, steps, the pool)
RX, RZ = 32.0, 24.0
SUN = np.array([0.22, 1.0, 0.08]); SUN /= np.linalg.norm(SUN)            # toward the sun, through the crack
CRACK = dict(c=(4.0, -3.0), a=4.4, b=1.8, ang=math.radians(25), y=17.0)   # the slot through the roof
CRACK_TOP = 34.0
SHAFT_FOOT = (CRACK['c'][0] - SUN[0] / SUN[1] * 24.0, CRACK['c'][1] - SUN[2] / SUN[1] * 24.0)   # where the shaft reaches the floor
POOL = dict(c=(9.6, -1.2), r=4.6, level=-0.35, floor=-1.15)
BALCONY = dict(x=-21.5, h=6.0, z=(-12.0, 13.0), more=1.5)                # the way in: its ends run `more` m on into the walls
RAMP_W = [(-24.5, 12.0), (-19.0, 16.4), (-13.0, 19.2), (-8.5, 20.0)]     # balcony (6 m) down to the floor
SHELF_SE = dict(c=(16.5, 15.5), r=(5.2, 3.0), h=5.0)
# the four levels (see the top): each a plateau inside its outline, its edge wandering a little, its face steep
TIER1 = dict(h=3.5, pts=[(-19.5, -30), (-19.5, -15.2), (-15.5, -15.9), (-9.5, -15.2), (-3.5, -16.3), (1.5, -15.7), (5.4, -16.6), (6.8, -30)])
TIER2 = dict(h=7.0, pts=[(6.8, -30), (6.8, -16.9), (9.0, -15.4), (12.5, -14.6), (18.0, -14.4), (24.5, -14.6), (34, -15.0), (34, -30)])
ARM = dict(h=11.0, pts=[(34, -15.0), (24.5, -14.6), (18.0, -14.4), (14.6, -13.4), (11.6, -12.2), (8.6, -10.9), (6.2, -9.5), (5.4, -7.9),
                        (6.6, -6.6), (9.4, -7.2), (13.2, -8.4), (18.0, -8.2), (23.5, -6.9), (34, -5.6)])
NOTCH = dict(c=(10.9, -9.6), axis=(-0.94, 0.33), w=1.15, depth=3.4)       # cut across the arm near its tip: half as wide as w at its foot
STONES = [(-12.6, -10.8, 1.0, 1.15), (-14.9, -12.1, 1.95, 1.05), (-17.0, -13.4, 2.8, 1.0)]     # x, z, top, radius: up to the tier
PILLARS = [(2.6, -18.6, 4.6, 0.95), (4.4, -20.3, 5.8, 0.9)]                                    # standing on the tier, up to the balcony
# the ways she walks: earth underfoot (on the levels' tops only worn, WAY_TOP of it), and kept clear of plants
WAYS = [[(-8.5, 20.0), (-7.0, 13.0), (-9.5, 5.0), (-11.5, -3.0), (-12.6, -9.6)],              # the ramp's foot to the stones
        [(-9.5, 5.0), (-3.0, 2.5), (2.6, 2.8), (4.8, 2.2)],                                    # a branch to the pool's west shore
        [(-6.5, -8.5), (0.0, -9.6), (5.6, -9.4), (8.0, -6.2)]]                                 # along the arm's foot to the shore
WAYS_TOP = [[(-16.8, -17.2), (-8.0, -18.4), (0.0, -18.6), (2.6, -18.6)],                       # the tier
            [(8.2, -18.6), (14.0, -17.6), (20.0, -16.4)],                                      # the balcony
            [(26.5, -10.3), (19.0, -11.0), (13.4, -10.5)], [(9.4, -9.0), (6.8, -8.1)]]         # the arm's top (the notch between)
WAY_TOP = 0.45
COLUMNS = [(-15.0, 7.0, 2.5), (18.0, 6.5, 2.1)]                          # x, z, radius at floor and roof
GREAT_TREE = (SHAFT_FOOT[0] - 0.4, SHAFT_FOOT[1] + 0.6)


def wob2(px, pz, f, s, amp):
    return amp * (fbm3(px * f, pz * f, 0.0 * px + 3.7, s) - 0.5) * 2


def poly_sd(px, pz, pts):
    """signed distance to a closed outline (m): > 0 inside"""
    best = np.full(np.shape(px), 1e9)
    for a, b in zip(pts, pts[1:] + pts[:1]):
        best = np.minimum(best, seg2(px, pz, a[0], a[1], b[0], b[1])[0])
    inside = MPath(pts).contains_points(np.stack([np.ravel(px), np.ravel(pz)], 1)).reshape(np.shape(px))
    return np.where(inside, best, -best)


def floor_at(px, pz):
    """the floor's height (before the walls, columns and rocks are laid over it)"""
    F = 0.32 * (fbm3(px * 0.07, pz * 0.07, 1.3 + 0 * px, 5) - 0.5) * 2 + 0.25 * (fbm3(px * 0.3, pz * 0.3, 2.1 + 0 * px, 6) - 0.5)
    # the pool: a bowl under the crack's east end
    r = np.hypot(px - POOL['c'][0], pz - POOL['c'][1]) + wob2(px, pz, 0.35, 8, 0.6)
    F = F + (POOL['floor'] - F) * sstep(POOL['r'] + 1.8, POOL['r'] - 1.2, r)        # (gentle: she wades in, it is no face)
    # the balcony (west): a plateau with steep faces
    eb = (BALCONY['x'] + wob2(px, pz, 0.12, 9, 1.4)) - px                   # > 0 on the balcony
    eb = np.minimum(eb, np.minimum(pz - BALCONY['z'][0], BALCONY['z'][1] - pz) + BALCONY['more'])
    F = F + (BALCONY['h'] - F) * sstep(-0.35, 0.35, eb)
    # the ramp down from it, along the south wall
    d, t = poly2(px, pz, RAMP_W)
    hr = BALCONY['h'] * (1 - sstep(0.0, 1.0, t) * 0.25 - t * 0.75)
    F = np.maximum(F, F + (hr - F) * sstep(2.2, 1.6, d))
    # the shelf in the south-east
    e = 1.0 - np.hypot((px - SHELF_SE['c'][0]) / SHELF_SE['r'][0], (pz - SHELF_SE['c'][1]) / SHELF_SE['r'][1]) + wob2(px, pz, 0.3, 11, 0.12)
    F = np.maximum(F, F + (SHELF_SE['h'] - F) * sstep(-0.04, 0.06, e))
    # the levels: the tier, the balcony, the arm (its notch near the tip)
    for T, s in ((TIER1, 12), (TIER2, 13)):
        e = poly_sd(px, pz, T['pts']) + wob2(px, pz, 0.22, s, 0.7)
        F = np.maximum(F, F + (T['h'] - F) * sstep(-0.3, 0.3, e))
    e = poly_sd(px, pz, ARM['pts']) + wob2(px, pz, 0.22, 14, 0.6)
    ax, az = NOTCH['axis']; n = math.hypot(ax, az)
    along = ((px - NOTCH['c'][0]) * ax + (pz - NOTCH['c'][1]) * az) / n
    ha = ARM['h'] - NOTCH['depth'] * sstep(NOTCH['w'], NOTCH['w'] * 0.45, np.abs(along))
    F = np.maximum(F, F + (ha - F) * sstep(-0.3, 0.3, e))
    # the stones up to the tier, the pillars on it up to the balcony: rocks, not drums (their outlines lumpy, their tops
    # tilted a little and uneven)
    for (sx, sz, h, r), s in zip(STONES + PILLARS, range(20, 40)):
        e = r - np.hypot(px - sx, pz - sz) + wob2(px, pz, 0.9, s, 0.32) + wob2(px, pz, 2.2, s + 40, 0.08)
        top = h + wob2(px, pz, 0.7, s + 60, 0.12) + ((px - sx) * math.cos(s) + (pz - sz) * math.sin(s)) * 0.06
        F = np.maximum(F, F + (top - F) * sstep(-0.14, 0.14, e))
    return F


# ---------------------------------------------------------------- the rock, everywhere
Xg, Yg, Zg = np.meshgrid(xs, ys, zs, indexing='ij')
Xg, Yg, Zg = Xg.astype(np.float64), Yg.astype(np.float64), Zg.astype(np.float64)
F2 = floor_at(Xg[:, 0, :], Zg[:, 0, :])                      # (NX, NZ)
log('floor')
# what the floor's own shape says about each spot (per column, as F2): the faces (steps steep enough that she climbs them,
# as the game's player-moves.js has it: a slope of 0.9), how far each spot is from one, and from the ways
GX, GZ = Xg[:, 0, :], Zg[:, 0, :]
_gx, _gz = np.gradient(F2, H)
FACE = np.hypot(_gx, _gz) >= 0.9
FACE_D = ndi.distance_transform_edt(~FACE) * H                          # m to the nearest face
FOOT = (ndi.maximum_filter(F2, size=int(2 * 1.6 / H) + 1) - F2) > 1.2  # below a face (its foot), not on its top
WAY_D = np.min([poly2(GX, GZ, w)[0] for w in WAYS], axis=0)
TOP_D = np.min([poly2(GX, GZ, w)[0] for w in WAYS_TOP], axis=0)


def grid_at(A, x, z):
    i, k = int(round((x - X0) / H)), int(round((z - Z0) / H))
    return A[min(max(i, 0), NX - 1), min(max(k, 0), NZ - 1)]


log('faces', int(FACE.sum()), 'columns')
# a warped copy of space: the walls wander
w1 = fbm3(Xg * 0.035 + 11, Yg * 0.035, Zg * 0.035, 21) - 0.5
w2 = fbm3(Xg * 0.035, Yg * 0.035 + 47, Zg * 0.035, 22) - 0.5
w3 = fbm3(Xg * 0.035, Yg * 0.035, Zg * 0.035 + 83, 23) - 0.5
Qx, Qy, Qz = Xg + w1 * 9, Yg + w2 * 4, Zg + w3 * 9
log('warp')
ang = np.arctan2(Zg[:, 0, :] / RZ, Xg[:, 0, :] / RX)
rho = np.hypot(Qx / RX, Qz / RZ) * (1 + 0.06 * (fbm3(np.cos(ang) * 1.6, np.sin(ang) * 1.6, 0.5 + 0 * ang, 31) - 0.5) * 2)[:, None, :]
HW = 11.0 + 2.2 * (fbm3(Xg[:, :1, :] * 0.05, Zg[:, :1, :] * 0.05, 4.4 + 0 * Xg[:, :1, :], 32) - 0.5) * 2
HA = 24.0
tt = np.maximum(Yg - HW, 0) / (HA - HW)
S = (np.sqrt(rho * rho + tt * tt) - 1.0) * 22.0                       # < 0: the hall's air
# rock lumps and strata on the walls and the roof (none on the floor: that stays as laid out)
lump = (0.5 - worley3(Qx * 0.16, Qy * 0.16, Qz * 0.16, 41)) * 2.2 + (fbm3(Xg * 0.33, Yg * 0.33, Zg * 0.33, 42, 2) - 0.5) * 1.2
strata = (np.abs(np.mod(Yg / 3.1 + 0.55 * w2 * 2 + 0.3 * w1, 1.0) - 0.5) - 0.25) * 1.5
S = S + lump + strata
log('walls')
# the floor
FL = F2[:, None, :]
S = smax(S, FL - Yg, 0.9)
# the crack through the roof, open to the sky
ca, cb, cg = CRACK['a'], CRACK['b'], CRACK['ang']
ux = (Xg - CRACK['c'][0]) * math.cos(cg) + (Zg - CRACK['c'][1]) * math.sin(cg)
uz = -(Xg - CRACK['c'][0]) * math.sin(cg) + (Zg - CRACK['c'][1]) * math.cos(cg)
lean = (Yg - CRACK['y'])                                              # it leans with the sun, so the shaft comes straight through
ux2 = ux - lean * (SUN[0] * math.cos(cg) + SUN[2] * math.sin(cg)) / SUN[1]
uz2 = uz - lean * (-SUN[0] * math.sin(cg) + SUN[2] * math.cos(cg)) / SUN[1]
grow = 1.0 + 0.012 * np.maximum(Yg - CRACK['y'], 0)
Sc = (np.hypot(ux2 / (ca * grow), uz2 / (cb * grow)) - 1.0) * cb + (fbm3(Xg * 0.5, Yg * 0.5, Zg * 0.5, 51, 2) - 0.5) * 1.1
Sc = np.where(Yg > CRACK['y'] - 3, Sc, 50.0)
S = smin(S, Sc, 2.4)
log('crack')
# tunnel stubs: the way in (west, from the balcony) and the way on (east, at the arm's root)
TUNNELS = [dict(pts=[(-27.5, 8.8, 1.0), (-32.0, 9.0, 0.2), (-35.5, 9.2, 3.4)], floor=6.0, r=3.0),
           dict(pts=[(27.5, 13.4, -10.2), (31.5, 13.6, -10.8), (35.0, 13.8, -8.6)], floor=11.0, r=2.7)]
for tn in TUNNELS:
    d = np.full(Xg.shape, 1e9)
    for a, b in zip(tn['pts'][:-1], tn['pts'][1:]):
        pa = np.stack([Xg - a[0], Yg - a[1], Zg - a[2]])
        ba = np.array(b) - np.array(a)
        h = np.clip((pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / ba.dot(ba), 0, 1)
        d = np.minimum(d, np.sqrt((pa[0] - ba[0] * h) ** 2 + (pa[1] - ba[1] * h) ** 2 + (pa[2] - ba[2] * h) ** 2))
    St = np.maximum(d - tn['r'] + (fbm3(Xg * 0.4, Yg * 0.4, Zg * 0.4, 61, 2) - 0.5) * 0.9, tn['floor'] - Yg)
    S = smin(S, St, 1.4)
log('tunnels')
# columns, floor to roof (narrower in the middle)
for (cx, cz, r0) in COLUMNS:
    dxz = np.hypot(Xg - cx, Zg - cz)
    r = r0 * (1.0 - 0.36 * np.exp(-((Yg - 11.0) / 6.5) ** 2)) + (0.5 - worley3(Xg * 0.45, Yg * 0.45, Zg * 0.45, 71)) * 0.9
    S = smax(S, -(dxz - r), 1.8)
log('columns')


def add_cone(S, x, z, y_base, y_tip, R, s):
    """a stalactite (tip below its base) or a stalagmite (tip above), with rough sides"""
    lo, hi = min(y_base, y_tip) - 1.5, max(y_base, y_tip) + 1.5
    i0, i1 = np.searchsorted(xs, x - R - 2), np.searchsorted(xs, x + R + 2)
    k0, k1 = np.searchsorted(zs, z - R - 2), np.searchsorted(zs, z + R + 2)
    j0, j1 = np.searchsorted(ys, lo), np.searchsorted(ys, hi)
    sx, sy, sz = Xg[i0:i1, j0:j1, k0:k1], Yg[i0:i1, j0:j1, k0:k1], Zg[i0:i1, j0:j1, k0:k1]
    L = abs(y_tip - y_base)
    h = np.clip((sy - y_tip) / (y_base - y_tip), 0, 1)            # 0 at the tip, 1 at the base
    rr = R * h ** 0.8 + (fbm3(sx * 0.9, sy * 0.9, sz * 0.9, s, 2) - 0.5) * 0.35 * R
    d = np.hypot(sx - x, sz - z) - rr
    beyond = np.where(y_tip < y_base, y_tip - sy, sy - y_tip)       # > 0 past the tip
    d = np.maximum(d, beyond)
    S[i0:i1, j0:j1, k0:k1] = smax(S[i0:i1, j0:j1, k0:k1], -d, 0.7)


def roof_at(x, z):
    """roughly where the roof is above a spot (from the dome's shape, before the noise)"""
    r = math.hypot(x / RX, z / RZ)
    if r >= 1:
        return None
    return 11.0 + (HA - 11.0) * math.sqrt(1 - r * r)


def floor_here(x, z):
    i, k = int(round((x - X0) / H)), int(round((z - Z0) / H))
    return float(F2[min(max(i, 0), NX - 1), min(max(k, 0), NZ - 1)])


# fang stalactites: many, hanging where the roof is high, none in the shaft or the crack
fangs = []
tries = 0
while len(fangs) < 46 and tries < 5000:
    tries += 1
    x, z = rng.uniform(-30, 30), rng.uniform(-22, 22)
    roof = roof_at(x, z)
    if roof is None or roof < 13:
        continue
    fl = floor_here(x, z)
    clear = roof - fl
    # away from the crack and the line of the shaft
    cx = CRACK['c'][0] - (CRACK['y'] - roof) * SUN[0] / SUN[1] * 0
    if math.hypot(x - CRACK['c'][0], z - CRACK['c'][1]) < 7.5 or math.hypot(x - SHAFT_FOOT[0], z - SHAFT_FOOT[1]) < 6:
        continue
    if any(math.hypot(x - a, z - b) < 3.4 for a, b, _, _ in fangs):
        continue
    L = min(rng.uniform(1.8, 5.8), clear - 8.5)
    if L < 1.4:
        continue
    fangs.append((x, z, L, rng.uniform(0.75, 1.35)))
for i, (x, z, L, R) in enumerate(fangs):
    roof = roof_at(x, z)
    add_cone(S, x, z, roof + 2.0, roof - L, R, 80 + i)
# stalagmites and boulders on the floor (out of the ways)
MITES = [(-24.0, -15.0, 3.6, 1.3), (-27.0, -7.5, 2.4, 1.0), (13.5, 17.5, 2.6, 1.0), (25.5, 13.0, 3.2, 1.2), (-12.5, 14.5, 2.2, 1.0),
         (5.0, 17.0, 1.6, 0.8), (27.0, 4.0, 2.0, 0.9), (-18.0, -4.0, 1.4, 0.7)]
for i, (x, z, Hm, R) in enumerate(MITES):
    fl = floor_here(x, z)
    add_cone(S, x, z, fl - 1.0, fl + Hm, R, 120 + i)
BOULDERS = [(-11.0, 16.0, 1.6), (22.5, -19.0, 1.3), (14.0, 1.5, 1.2), (-19.5, 9.5, 1.4), (6.0, -14.6, 1.1), (-6.0, -20.6, 1.2)]
for i, (x, z, r) in enumerate(BOULDERS):
    fl = floor_here(x, z)
    i0, i1 = np.searchsorted(xs, x - r - 2), np.searchsorted(xs, x + r + 2)
    k0, k1 = np.searchsorted(zs, z - r - 2), np.searchsorted(zs, z + r + 2)
    j0, j1 = np.searchsorted(ys, fl - r - 2), np.searchsorted(ys, fl + r + 2)
    sx, sy, sz = Xg[i0:i1, j0:j1, k0:k1], Yg[i0:i1, j0:j1, k0:k1], Zg[i0:i1, j0:j1, k0:k1]
    d = np.sqrt((sx - x) ** 2 + ((sy - fl - r * 0.25) * 1.25) ** 2 + (sz - z) ** 2) - r + (0.5 - worley3(sx * 0.8, sy * 0.8, sz * 0.8, 140 + i)) * 0.5
    S[i0:i1, j0:j1, k0:k1] = smax(S[i0:i1, j0:j1, k0:k1], -d, 0.6)
log('fangs, mites, boulders')
# the outside of the grid is rock (but the crack stays open at the top)
S[0, :, :] = np.maximum(S[0, :, :], 1.0); S[-1, :, :] = np.maximum(S[-1, :, :], 1.0)
S[:, :, 0] = np.maximum(S[:, :, 0], 1.0); S[:, :, -1] = np.maximum(S[:, :, -1], 1.0)
S[:, 0, :] = np.maximum(S[:, 0, :], 1.0)
# specks of rock floating in the air (the noise makes a few): taken away, so no little boxes hang in the hall
rock = S > 0
lab, n = ndi.label(rock)
if n > 1:
    sizes = ndi.sum(rock, lab, range(1, n + 1))
    keep = 1 + int(np.argmax(sizes))
    S = np.where(rock & (lab != keep), -0.05, S)
    log('specks taken away:', n - 1)
air = S < 0
lab, n = ndi.label(air)
if n > 1:     # pockets of air sealed in rock: filled
    top = lab[NX // 2, :, NZ // 2]
    hall = np.bincount(lab[air]).argmax()
    S = np.where(air & (lab != hall), 0.05, S)
    log('sealed pockets filled:', n - 1)
S = S.astype(np.float32)

# ---------------------------------------------------------------- the mesh
verts, faces, normals, _ = measure.marching_cubes(S, level=0.0, spacing=(H, H, H), gradient_direction='ascent')
verts = verts + np.array([X0, Y0, Z0])
log('mesh', len(verts), 'vertices', len(faces), 'triangles')


def sample(px, py, pz):
    """trilinear value of the field at world points"""
    c = np.stack([(px - X0) / H, (py - Y0) / H, (pz - Z0) / H])
    return ndi.map_coordinates(S, c, order=1, mode='nearest')


# normals from the field, smoothed (pointing into the air)
e = 0.5
gx = sample(verts[:, 0] + e, verts[:, 1], verts[:, 2]) - sample(verts[:, 0] - e, verts[:, 1], verts[:, 2])
gy = sample(verts[:, 0], verts[:, 1] + e, verts[:, 2]) - sample(verts[:, 0], verts[:, 1] - e, verts[:, 2])
gz = sample(verts[:, 0], verts[:, 1], verts[:, 2] + e) - sample(verts[:, 0], verts[:, 1], verts[:, 2] - e)
N = -np.stack([gx, gy, gz], 1)
N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9
# triangles wound to face the air
tri = verts[faces]
fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
if np.mean(np.sum(fn * N[faces].mean(1), 1)) < 0:
    faces = faces[:, ::-1]
log('normals')


# ---------------------------------------------------------------- light
def soft_shadow(P, D, tmax, k=5.0, step0=0.25, steps=90):
    """how much of a light along D reaches P (1 = all): marched through the field, soft at the edges"""
    res = np.ones(len(P))
    t = np.full(len(P), step0)
    alive = np.ones(len(P), bool)
    for _ in range(steps):
        q = P + D * t[:, None] if D.ndim == 2 else P + D[None, :] * t[:, None]
        d = -sample(q[:, 0], q[:, 1], q[:, 2])                      # distance into the air (> 0)
        res = np.where(alive, np.minimum(res, np.clip(k * d / t, 0, 1)), res)
        alive &= (d > 0.02) & (t < tmax)
        t = t + np.clip(d, 0.25, 1.6)
        if not alive.any():
            break
    return np.where(t >= tmax, res, np.where(res > 0.02, res * 0.0, 0.0))


def crack_open(P, D):
    """1 where a ray from P along D leaves through the crack's top (open sky), 0 where it ends in rock"""
    return None


SUN_COL = np.array([1.0, 0.92, 0.74]) * 1.75
SKY_COL = np.array([0.62, 0.80, 1.0]) * 0.75
BOUNCE_COL = np.array([0.78, 0.86, 0.48]) * 0.62
BOUNCE2_COL = np.array([0.20, 0.22, 0.17])
AMB = np.array([0.115, 0.165, 0.205])           # the cave's own dark: blue-green, so its shapes still read
CRY_COL = {'teal': np.array([0.30, 0.96, 0.88]), 'cyan': np.array([0.42, 0.86, 1.0]), 'white': np.array([0.80, 0.95, 1.0])}
SHROOM_COL = np.array([0.72, 0.55, 1.0])


def ao_at(P, Nn):
    """open sky over a point (1) or shut in (low): the field sampled out along its normal"""
    occ = np.zeros(len(P))
    for hstep, w in ((0.4, 0.5), (0.9, 0.3), (1.8, 0.2), (3.6, 0.12)):
        q = P + Nn * hstep
        d = -sample(q[:, 0], q[:, 1], q[:, 2])
        occ += w * np.clip((hstep - d) / hstep, 0, 1)
    return np.clip(1.0 - occ * 1.15, 0.12, 1.0)


# ---------------------------------------------------------------- crystals and mushrooms: where (from the mesh)
def nearest_floor(x, z):
    return floor_here(x, z)


crystals = []
up = N[:, 1]
heights = verts[:, 1] - np.array([nearest_floor(x, z) for x, z in zip(verts[::1, 0], verts[::1, 2])])
cand_wall = np.where((np.abs(up) < 0.55) & (heights > 0.2) & (heights < 7.5))[0]
cand_floor = np.where((up > 0.82))[0]
rng.shuffle(cand_wall)
rng.shuffle(cand_floor)


def far_from(p, lst, d):
    return all((p[0] - q['p'][0]) ** 2 + (p[1] - q['p'][1]) ** 2 + (p[2] - q['p'][2]) ** 2 > d * d for q in lst)


def in_way(x, z, face=1.4, tree=5.5):
    """where nothing may stand: a way she walks (the ramp, the ways, the stones and pillars), round the great tree's foot
    (within `tree` m), and a face she climbs, within `face` m of its foot or its top"""
    d, _ = poly2(np.array([x]), np.array([z]), RAMP_W)
    if d[0] < 2.3 or grid_at(WAY_D, x, z) < 1.9 or grid_at(TOP_D, x, z) < 1.4 or grid_at(FACE_D, x, z) < face:
        return True
    if any(math.hypot(x - sx, z - sz) < r + 0.8 for sx, sz, _, r in STONES + PILLARS):
        return True
    if any(math.hypot(x - tn['pts'][0][0], z - tn['pts'][0][2]) < 3.5 for tn in TUNNELS):       # (the ways in and on, at their mouths)
        return True
    if math.hypot(x - GREAT_TREE[0], z - GREAT_TREE[1]) < tree:
        return True
    return False


# the walls: clusters, more toward the north and west and by the two ways out
for i in cand_wall:
    if len([c for c in crystals if c['kind'] == 'wall']) >= 30:
        break
    p, n = verts[i], N[i]
    if grid_at(FACE_D, p[0], p[2]) < 1.6:          # (not on a face she climbs)
        continue
    bias = 0.55 + 0.25 * (p[2] < 0) + 0.25 * (p[0] < -10) + 0.35 * (abs(p[0]) > 24)
    if rng.random() > bias:
        continue
    if not far_from(p, crystals, 4.6):
        continue
    crystals.append(dict(kind='wall', p=[float(v) for v in p], n=[float(v) for v in n], size=float(rng.uniform(0.7, 1.5)),
                         col=str(rng.choice(['teal', 'teal', 'cyan', 'white'])), count=int(rng.integers(3, 8)), seed=int(rng.integers(1, 9999))))
for i in cand_floor:
    if len([c for c in crystals if c['kind'] == 'floor']) >= 12:
        break
    p, n = verts[i], N[i]
    if in_way(p[0], p[2]) or not far_from(p, crystals, 5.5):
        continue
    # near a wall, a column or a rock: not out in the open
    d_wall = -sample(np.array([p[0]]), np.array([p[1] + 3.6]), np.array([p[2]]))[0]
    if d_wall > 3.0 and rng.random() < 0.85:
        continue
    if math.hypot(p[0] - POOL['c'][0], p[2] - POOL['c'][1]) < POOL['r'] + 1.0:
        continue
    crystals.append(dict(kind='floor', p=[float(v) for v in p], n=[float(v) for v in n], size=float(rng.uniform(0.9, 1.8)),
                         col=str(rng.choice(['teal', 'cyan', 'teal'])), count=int(rng.integers(4, 9)), seed=int(rng.integers(1, 9999))))
# floating crystals (as the Chasm's lumenspar): in the air near the walls
tries = 0
while len([c for c in crystals if c['kind'] == 'float']) < 9 and tries < 4000:
    tries += 1
    x, z = rng.uniform(-28, 28), rng.uniform(-20, 20)
    fl = floor_here(x, z)
    y = fl + rng.uniform(3.0, 8.5)
    d = -sample(np.array([x]), np.array([y]), np.array([z]))[0]
    if d < 1.4 or d > 4.5:
        continue
    if math.hypot(x - SHAFT_FOOT[0], z - SHAFT_FOOT[1]) < 7:
        continue
    if grid_at(FACE_D, x, z) < 3.5 or y - floor_here(x, z) < 3.0:      # (not in her way up a face, nor over a level's edge)
        continue
    p = [x, y, z]
    if not far_from(p, crystals, 7.0):
        continue
    crystals.append(dict(kind='float', p=[float(v) for v in p], n=[0.0, 1.0, 0.0], size=float(rng.uniform(0.45, 0.8)),
                         col=str(rng.choice(['cyan', 'white', 'teal'])), count=1, seed=int(rng.integers(1, 9999))))
# the ways in and on, closed for now (the rooms beyond are not made yet): big crystals across each tunnel, a little way in
GATES = []
for tn in TUNNELS:
    (ax, ay, az), (bx, by, bz) = tn['pts'][0], tn['pts'][1]
    gx_, gz_ = ax + (bx - ax) * 0.8, az + (bz - az) * 0.8
    crystals.append(dict(kind='floor', p=[float(gx_), float(tn['floor']), float(gz_)], n=[0.0, 1.0, 0.0], size=2.0, col='white', count=10,
                         seed=int(rng.integers(1, 9999))))
    GATES.append([round(float(gx_), 2), round(float(gz_), 2), 1.8])
log('crystals', len(crystals))

shrooms = []
for i in cand_floor:
    if len(shrooms) >= 34:
        break
    p = verts[i]
    if in_way(p[0], p[2]) or math.hypot(p[0] - POOL['c'][0], p[2] - POOL['c'][1]) < POOL['r'] + 0.6:
        continue
    d_wall = -sample(np.array([p[0]]), np.array([p[1] + 3.6]), np.array([p[2]]))[0]
    near_col = min(math.hypot(p[0] - cx, p[2] - cz) - r for cx, cz, r in COLUMNS)
    if d_wall > 2.2 and near_col > 2.5 and rng.random() < 0.85:
        continue
    if any((p[0] - s['p'][0]) ** 2 + (p[2] - s['p'][2]) ** 2 < 2.6 ** 2 for s in shrooms):
        continue
    shrooms.append(dict(p=[float(v) for v in p], count=int(rng.integers(3, 8)), seed=int(rng.integers(1, 9999)),
                        size=float(rng.uniform(0.7, 1.3))))
log('mushrooms', len(shrooms))

# ---------------------------------------------------------------- light at the mesh
V = verts.astype(np.float64)
ao = ao_at(V, N)
log('ao')
sun_vis = soft_shadow(V + N * 0.08, SUN, tmax=(CRACK_TOP - V[:, 1]) / SUN[1] + 1.0, k=14.0, steps=130)
sun = np.clip(N @ SUN, 0, 1)[:, None] * sun_vis[:, None] * SUN_COL[None, :]
log('sun')
# the crack's sky: seen from here (a few points over the crack's mouth, each as a small light)
sky = np.zeros((len(V), 3))
cpts = []
for u in (-0.6, -0.2, 0.2, 0.6):
    for v in (-0.5, 0.5):
        lx = u * CRACK['a'] * 1.25
        lz = v * CRACK['b'] * 1.2
        cpts.append((CRACK['c'][0] + lx * math.cos(cg) - lz * math.sin(cg), 26.5, CRACK['c'][1] + lx * math.sin(cg) + lz * math.cos(cg)))
for (cx, cy, cz) in cpts:
    Dv = np.array([cx, cy, cz])[None, :] - V
    dist = np.linalg.norm(Dv, axis=1)
    Dn = Dv / dist[:, None]
    lam = np.clip(np.sum(N * Dn, 1), 0, 1) * np.clip(Dn[:, 1], 0, 1)
    vis = soft_shadow(V + N * 0.08, Dn, tmax=dist - 0.5, k=8.0, steps=90)
    sky += (lam * vis * 26.0 / (dist * dist + 40.0))[:, None] * SKY_COL[None, :] / len(cpts) * 14.0
log('sky')
# light thrown back off the sunlit floor and the great tree's crown: soft, warm green, round the shaft's foot
fx, fz = SHAFT_FOOT
fy = floor_here(fx, fz)
Db = np.stack([fx - V[:, 0], fy + 1.5 - V[:, 1], fz - V[:, 2]], 1)
db = np.linalg.norm(Db, axis=1)
bounce = (np.exp(-(db / 11.0) ** 2) * (0.45 + 0.55 * np.clip(np.sum(N * Db, 1) / (db + 1e-6), 0, 1)))[:, None] * BOUNCE_COL[None, :]
# and further, fainter: the sunlit floor lights the whole dome a little (the brightest light in a cave lit from one hole)
bounce += (np.exp(-(db / 26.0) ** 2) * (0.35 + 0.65 * np.clip(np.sum(N * Db, 1) / (db + 1e-6), 0, 1)))[:, None] * BOUNCE2_COL[None, :]
log('bounce')


def point_lights(P, Nn, lights, wrap=True):
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
    k = {'wall': 0.34, 'floor': 0.45, 'float': 0.55}[c['kind']] * c['size']
    n = np.array(c['n'])
    lp = np.array(c['p']) + n * (0.6 if c['kind'] != 'float' else 0.0)
    LIGHTS.append((lp, CRY_COL[c['col']], k, 6.5 if c['kind'] != 'float' else 7.5))
for s in shrooms:
    LIGHTS.append((np.array(s['p']) + np.array([0, 0.35, 0]), SHROOM_COL, 0.18 * s['size'], 3.0))
glow = point_lights(V, N, LIGHTS)
log('crystal light')
LIGHT = (AMB[None, :] + sun * 1.0 + sky + bounce) * ao[:, None] + glow * (0.35 + 0.65 * ao[:, None]) + sun * 0.0
LSCALE = 4.0
light8 = np.concatenate([np.clip(LIGHT / LSCALE * 255.0 + 0.5, 0, 255), np.full((len(LIGHT), 1), 255.0)], 1).astype(np.uint8)
# what the rock is like at each vertex: moss (on what faces up and gets the light), wet (near the pool and under the trickle)
moss = np.clip((up - 0.55) / 0.35, 0, 1) * np.clip(0.35 + (sun_vis * 0.6) + 0.4 * np.exp(-(db / 14.0) ** 2), 0, 1)
pw = np.hypot(V[:, 0] - POOL['c'][0], V[:, 2] - POOL['c'][1])
wet = np.clip(1.0 - (pw - POOL['r']) / 3.0, 0, 1)
info8 = np.stack([np.clip(ao * 255, 0, 255), np.clip(moss * 255, 0, 255), np.clip(wet * 255, 0, 255),
                  np.clip(sun_vis * 255, 0, 255)], 1).astype(np.uint8)
nrm8 = np.concatenate([np.clip(np.round(N * 127), -127, 127), np.zeros((len(N), 1))], 1).astype(np.int8)
log('light baked')

# ---------------------------------------------------------------- the floor and ceiling she walks between (per column of the field)
s_col = S.transpose(0, 2, 1)                         # (NX, NZ, NY)
floorY = np.full((NX, NZ), np.nan, np.float32)
ceilY = np.full((NX, NZ), np.nan, np.float32)
for i in range(NX):
    col = s_col[i]
    for k in range(NZ):
        c = col[k]
        a = np.where((c[:-1] > 0) & (c[1:] <= 0))[0]           # rock below, air above: a floor
        if len(a) == 0:
            continue
        j = a[0]
        f = ys[j] + H * c[j] / (c[j] - c[j + 1])
        b = np.where((c[j + 1:-1] <= 0) & (c[j + 2:] > 0))[0]
        if len(b):
            jj = j + 1 + b[0]
            ce = ys[jj] + H * c[jj] / (c[jj] - c[jj + 1])
        else:
            ce = CRACK_TOP + 20
        floorY[i, k], ceilY[i, k] = f, ce
log('floor map')

# ---------------------------------------------------------------- the light in the air (for the plants and for her): 1 m cells
VC = 1.0
VX0, VY0, VZ0 = -35.0, -3.0, -27.0
vxs, vys, vzs = np.arange(VX0, 35.01, VC), np.arange(VY0, 30.01, VC), np.arange(VZ0, 27.01, VC)
VNX, VNY, VNZ = len(vxs), len(vys), len(vzs)
P = np.stack(np.meshgrid(vxs, vys, vzs, indexing='ij'), -1).reshape(-1, 3)
inair = sample(P[:, 0], P[:, 1], P[:, 2]) < 0.3
Pa = P[inair]
log('volume', VNX, VNY, VNZ, 'cells in the air:', len(Pa))
v_sun = soft_shadow(Pa, SUN, tmax=(CRACK_TOP - Pa[:, 1]) / SUN[1] + 1.0, k=12.0, steps=130)[:, None] * SUN_COL[None, :] * 0.9
v_sky = np.zeros((len(Pa), 3))
for (cx, cy, cz) in cpts[::2]:
    Dv = np.array([cx, cy, cz])[None, :] - Pa
    dist = np.linalg.norm(Dv, axis=1)
    Dn = Dv / dist[:, None]
    vis = soft_shadow(Pa, Dn, tmax=dist - 0.5, k=8.0, steps=90)
    v_sky += (np.clip(Dn[:, 1], 0, 1) * vis * 26.0 / (dist * dist + 40.0))[:, None] * SKY_COL[None, :] / (len(cpts) // 2) * 8.0
Dbv = np.stack([fx - Pa[:, 0], fy + 1.5 - Pa[:, 1], fz - Pa[:, 2]], 1)
v_bounce = (np.exp(-(np.linalg.norm(Dbv, axis=1) / 11.0) ** 2) * 0.75)[:, None] * BOUNCE_COL[None, :] + (np.exp(-(np.linalg.norm(Dbv, axis=1) / 26.0) ** 2) * 0.5)[:, None] * BOUNCE2_COL[None, :]
openness = np.clip(-sample(Pa[:, 0], Pa[:, 1], Pa[:, 2]) / 2.5, 0.3, 1.0)
v_glow = point_lights(Pa, None, LIGHTS)
VL = (AMB[None, :] * 1.1 + v_sky + v_bounce) * openness[:, None] + v_sun + v_glow * 0.6
vol = np.zeros((len(P), 4), np.float32)
vol[inair, :3] = VL
vol[inair, 3] = v_sun[:, 0] / SUN_COL[0] / 0.9
vol = vol.reshape(VNX, VNY, VNZ, 4)
# cells in rock take their nearest air cell's light (so a plant's edge never reads the dark inside of the rock)
mask = inair.reshape(VNX, VNY, VNZ)
idx = ndi.distance_transform_edt(~mask, return_distances=False, return_indices=True)
vol = vol[idx[0], idx[1], idx[2]]
vol8 = np.zeros((VNZ, VNY, VNX, 4), np.uint8)           # three's Data3DTexture: x fastest, then y, then z
vt = vol.transpose(2, 1, 0, 3)
vol8[..., :3] = np.clip(vt[..., :3] / LSCALE * 255 + 0.5, 0, 255)
vol8[..., 3] = np.clip(vt[..., 3] * 255 + 0.5, 0, 255)
log('volume baked')

# ---------------------------------------------------------------- the forest, by the land's own rules (as the world above's)
FG = lambda x, z: floor_here(x, z)
fl_ok = ~np.isnan(floorY)


def rock_gap(x, f, z, lift):
    """how far the nearest rock is from a spot `lift` m over the floor there (a wall, a column, the rock of a face)"""
    return -sample(np.array([x]), np.array([f + lift]), np.array([z]))[0]


def flat_here(i, k, rad=3, most=0.9):
    patch = floorY[max(i - rad, 0):min(i + rad + 1, NX), max(k - rad, 0):min(k + rad + 1, NZ)]
    return not np.isnan(patch).any() and np.nanmax(patch) - np.nanmin(patch) <= most


def free_spot(x, z, need=1.0, low=None, high=None):
    """a spot of floor she could stand on (on any level, or one between low and high m), flat round it, clear of rock by
    `need` m (measured high enough over the floor that the floor itself is not the nearest rock), off the pool"""
    i, k = int(round((x - X0) / H)), int(round((z - Z0) / H))
    if not (0 <= i < NX and 0 <= k < NZ) or not fl_ok[i, k]:
        return False
    f = floorY[i, k]
    if (low is not None and f < low) or (high is not None and f > high):
        return False
    if ceilY[i, k] - f < 3.0 or not flat_here(i, k):
        return False
    if rock_gap(x, f, z, max(1.6, need + 0.6)) < need:
        return False
    return math.hypot(x - POOL['c'][0], z - POOL['c'][1]) >= POOL['r'] + 1.2


def free_floor(x, z, need=1.0):
    """a spot on the forest floor (not on a level, a stone or in the pool)"""
    return free_spot(x, z, need, -0.4, 1.2)


def by_wall(x, z, within):
    """a wall, a column or a face's rock within `within` m (measured 3.6 m up, where the floor is not the nearest rock)"""
    f = floor_here(x, z)
    return rock_gap(x, f, z, 3.6) < within


# where the sun falls on the floor (through the crack): what the trees lean toward, and the only place the grass grows
ii, kk = np.where(fl_ok)
Pf = np.stack([xs[ii], floorY[ii, kk] + 0.15, zs[kk]], 1)
SUNF = np.zeros((NX, NZ), np.float32)
SUNF[ii, kk] = soft_shadow(Pf, SUN, tmax=(CRACK_TOP - Pf[:, 1]) / SUN[1] + 1.0, k=3.0, steps=110)
SUNF = ndi.gaussian_filter(SUNF, 2.0)
SUNF /= max(float(SUNF.max()), 1e-6)                    # (the shaft's own soft edge, as a share of its middle's light)
log('sun on the floor:', int((SUNF > 0.3).sum() * H * H), 'm2')

# the places (the page's buttons; the first is where she begins): where she stands, the way she faces
PLACES = [
    dict(name='ทางเข้า', x=-25.6, z=1.2, heading=math.pi / 2),
    dict(name='พื้นป่า', x=-10.2, z=-5.8, heading=math.atan2(-4.7, -6.3)),
    dict(name='ชั้นหิน', x=-5.0, z=-18.9, heading=math.pi / 2),
    dict(name='ระเบียง', x=12.5, z=-18.4, heading=math.atan2(1.0, 1.1)),
    dict(name='หิ้งสูง', x=7.3, z=-8.5, heading=math.atan2(-6.2, 4.4)),
]
# views kept open: no tree or bush on the line from the balcony's edge to the great tree and to the arm's tip (the hall as she
# comes in), nor from the forest floor's place to the stones
CLEAR_LINES = [[(-21.0, 1.2), GREAT_TREE], [(-21.0, 1.2), (8.0, -8.0)], [(-10.2, -5.8), (-14.9, -12.1)]]


def in_view(x, z, r=3.6):
    return any(poly2(np.array([x]), np.array([z]), line)[0][0] < r for line in CLEAR_LINES)


def by_pool(x, z, r):
    return math.hypot(x - POOL['c'][0], z - POOL['c'][1]) < r


trees = [dict(kind='tree', type='broadleaf', seed=7, x=GREAT_TREE[0], z=GREAT_TREE[1], scale=1.55, great=True)]
TYPES = ['broadleaf', 'oak', 'birch', 'sapling', 'broadleaf', 'oak']
# trees: on the forest floor, flat, 3 m clear of the walls and 5.5 m of the faces (her camera, behind her as she climbs one,
# stays out of their crowns), off the ways and the shore; more toward the light
tries = 0
while len(trees) < 14 and tries < 20000:
    tries += 1
    r, a = rng.uniform(6.5, 23), rng.uniform(0, 6.283)
    x, z = GREAT_TREE[0] + r * math.cos(a) * 1.25, GREAT_TREE[1] + r * math.sin(a)
    if rng.random() > 0.4 + 0.6 * math.exp(-(r / 15.0) ** 2):
        continue
    if not free_floor(x, z, 3.0) or in_way(x, z, 5.5):
        continue
    if math.hypot(x - GREAT_TREE[0], z - GREAT_TREE[1]) < 7.5 or in_view(x, z) or by_pool(x, z, 8.5):
        continue
    if any(math.hypot(x - t['x'], z - t['z']) < 5.2 for t in trees):
        continue
    if any(math.hypot(x - cx, z - cz) < r0 + 3.5 for cx, cz, r0 in COLUMNS):
        continue
    typ = TYPES[len(trees) % len(TYPES)]
    trees.append(dict(kind='tree', type=typ, seed=int(rng.integers(1, 999)), x=float(x), z=float(z),
                      scale=float(rng.uniform(0.75, 1.05) if typ != 'sapling' else rng.uniform(0.9, 1.2))))
# a few saplings up on the levels, against the wall (two on the tier, one on the balcony)
for lo, hi, n in ((3.0, 4.2, 2), (6.5, 7.6, 1)):
    got = tries = 0
    while got < n and tries < 4000:
        tries += 1
        x, z = rng.uniform(-20, 26), rng.uniform(-23, -13)
        if not free_spot(x, z, 1.4, lo, hi) or in_way(x, z, 2.4) or not by_wall(x, z, 3.0):
            continue
        if any(math.hypot(x - t['x'], z - t['z']) < 6.0 for t in trees):
            continue
        trees.append(dict(kind='tree', type='sapling', seed=int(rng.integers(1, 999)), x=float(x), z=float(z), scale=float(rng.uniform(0.85, 1.05))))
        got += 1
# bushes: at the feet of the walls, the columns and the faces, on any level; off the ways, the views and the shore
tries = 0
while len([t for t in trees if t['kind'] == 'bush']) < 18 and tries < 9000:
    tries += 1
    x, z = rng.uniform(-26, 28), rng.uniform(-23, 21)
    if not free_spot(x, z, 0.9) or in_way(x, z, 1.6) or in_view(x, z, 2.4) or by_pool(x, z, 6.0):
        continue
    if not (by_wall(x, z, 3.0) or (grid_at(FOOT, x, z) and grid_at(FACE_D, x, z) < 3.4)):
        continue
    if any(math.hypot(x - t['x'], z - t['z']) < (3.2 if t['kind'] == 'bush' else 3.0) for t in trees):
        continue
    trees.append(dict(kind='bush', type='bush', seed=int(rng.integers(1, 999)), x=float(x), z=float(z), scale=float(rng.uniform(0.8, 1.3))))
for t in trees:
    t['y'] = FG(t['x'], t['z'])
# trees hanging from the roof, round the crack (not in the shaft)
hanging = []
tries = 0
while len(hanging) < 7 and tries < 6000:
    tries += 1
    a, r = rng.uniform(0, 6.283), rng.uniform(8.0, 17.0)
    x, z = CRACK['c'][0] + r * math.cos(a) * 1.2, CRACK['c'][1] + r * math.sin(a) * 0.95
    roof = roof_at(x, z)
    if roof is None or roof < 15:
        continue
    if math.hypot(x - SHAFT_FOOT[0], z - SHAFT_FOOT[1]) < 7.0:
        continue
    if any(math.hypot(x - f[0], z - f[1]) < 3.0 for f in fangs) or any(math.hypot(x - h['x'], z - h['z']) < 6.5 for h in hanging):
        continue
    # find the roof here, exactly: up from the floor until rock
    f = floor_here(x, z)
    yy = np.arange(f + 2, CRACK_TOP, 0.2)
    sv = sample(np.full_like(yy, x), yy, np.full_like(yy, z))
    hit = np.where(sv > 0)[0]
    if not len(hit):
        continue
    ry = float(yy[hit[0]])
    if ry - f < 15:
        continue
    hanging.append(dict(type=str(rng.choice(['broadleaf', 'birch', 'oak'])), seed=int(rng.integers(1, 999)), x=float(x), z=float(z),
                        roof=ry + 0.6, scale=float(rng.uniform(0.7, 0.95))))
# green hanging over the crack's edge (bushes upside down on the roof round the hole, where the sun falls on them)
rim = []
for i in range(9):
    th = i / 9 * 2 * math.pi + 0.3
    lx, lz = (CRACK['a'] + 1.3) * math.cos(th), (CRACK['b'] + 1.2) * math.sin(th)
    x = CRACK['c'][0] + lx * math.cos(cg) - lz * math.sin(cg)
    z = CRACK['c'][1] + lx * math.sin(cg) + lz * math.cos(cg)
    yy = np.arange(14.0, CRACK_TOP, 0.15)
    xs_ = x + (yy - CRACK['y']) * SUN[0] / SUN[1]
    zs_ = z + (yy - CRACK['y']) * SUN[2] / SUN[1]
    sv = sample(xs_, yy, zs_)
    hit = np.where(sv > 0)[0]
    if not len(hit):
        continue
    j = hit[0]
    rim.append(dict(x=float(xs_[j]), y=float(yy[j]) + 0.35, z=float(zs_[j]), seed=int(rng.integers(1, 999)), scale=float(rng.uniform(1.2, 1.7))))
log('trees', len(trees), 'hanging', len(hanging), 'rim', len(rim))
# ferns in the shade (at the trees' feet, along the walls), grass tufts only where the sun falls; none on the ways, the faces,
# the shore
cover = []


def cover_ok(x, z, kind):
    if not free_spot(x, z, 0.4) or in_way(x, z, 1.2, 1.8 if kind == 'tuft' else 5.5) or by_pool(x, z, POOL['r'] + 2.2):
        return False
    if any(math.hypot(x - t['x'], z - t['z']) < (1.2 if t['kind'] == 'bush' else 1.0) for t in trees):
        return False
    if any(math.hypot(x - c['x'], z - c['z']) < 1.1 for c in cover):
        return False
    s = grid_at(SUNF, x, z)
    return s > 0.14 if kind == 'tuft' else s < 0.08


def colony(kind, cx, cz, n, spread):
    for _ in range(n):
        x, z = cx + rng.normal(0, spread), cz + rng.normal(0, spread)
        if cover_ok(x, z, kind):
            cover.append(dict(kind=kind, x=float(x), z=float(z), y=FG(x, z), seed=int(rng.integers(1, 9999)), scale=float(rng.uniform(0.85, 1.3))))


for t in trees:
    if t['kind'] == 'tree' and not t.get('great') and rng.random() < 0.6:
        colony('fern', t['x'], t['z'], int(rng.integers(4, 9)), 1.9)
tries = 0
while len([c for c in cover if c['kind'] == 'fern']) < 105 and tries < 4000:
    tries += 1
    x, z = rng.uniform(-28, 28), rng.uniform(-23, 21)
    if free_spot(x, z, 0.4) and by_wall(x, z, 2.6) and grid_at(SUNF, x, z) < 0.06:
        colony('fern', x, z, int(rng.integers(3, 7)), 1.4)
tries = 0
while len([c for c in cover if c['kind'] == 'tuft']) < 42 and tries < 4000:
    tries += 1
    x, z = rng.uniform(-28, 28), rng.uniform(-23, 21)
    if grid_at(SUNF, x, z) > 0.3:
        colony('tuft', x, z, int(rng.integers(5, 10)), 1.6)
log('cover', len(cover), 'ferns', len([c for c in cover if c['kind'] == 'fern']), 'tufts', len([c for c in cover if c['kind'] == 'tuft']))

# ---------------------------------------------------------------- the floor's paint: earth, sand, fallen leaves (moss where none of them is)
noise2 = lambda f, s: fbm3(GX * f, GZ * f, 0 * GX + 7.7, s)
rough = 0.75 + 0.5 * noise2(0.6, 91)
dirt = sstep(1.9, 1.0, WAY_D) * (0.78 + 0.22 * noise2(1.3, 92))                      # the ways she walks
dirt = np.maximum(dirt, WAY_TOP * sstep(1.4, 0.7, TOP_D))                             # worn along the levels' tops
dirt = np.maximum(dirt, (FOOT & (FACE_D < 1.7)) * sstep(1.7, 0.6, FACE_D) * 0.7 * rough)      # what has fallen at a face's foot
pr = np.hypot(GX - POOL['c'][0], GZ - POOL['c'][1]) + wob2(GX, GZ, 0.5, 93, 0.7)
sand = sstep(POOL['r'] + 2.6, POOL['r'] + 1.2, pr)                                     # the pool's shore and its bed
sand = np.maximum(sand, sstep(-0.05, -0.35, F2) * sstep(14.0, 9.0, pr) * 0.8)          # low hollows near the water
litter = np.zeros_like(GX)
for t in trees:
    R = (3.4 if t['kind'] == 'tree' else 1.3) * t['scale'] * (1.25 if t.get('great') else 1.0)
    d = np.hypot(GX - t['x'], GZ - t['z']) + wob2(GX, GZ, 0.7, 94, 0.6)
    litter = np.maximum(litter, sstep(R, R * 0.45, d) * (0.9 if t['kind'] == 'tree' else 0.5))
sand = np.clip(sand, 0, 1)
dirt = np.clip(dirt, 0, 1) * (1 - sand)
litter = np.clip(litter * rough, 0, 1) * (1 - sand) * (1 - dirt)
bare = sstep(0.7, 0.2, FACE_D)                                                        # the faces and their edges: rock
PAINT = np.stack([dirt, sand, litter, bare], -1).astype(np.float32)                    # (NX, NZ, 4)
# what is no floor of hers (for her level, cave-level.js): where rock stands over the floor as it was laid out (the walls'
# feet, which lean in over the hall: climbed, they would take her into the roof; the columns, the boulders, the
# stalagmites), and the ways in and on past their crystals
WALL = np.isnan(floorY) | (np.nan_to_num(floorY, nan=99.0) - F2 > 0.5)
for tn, (gx_, gz_, _) in zip(TUNNELS, GATES):
    (ax, ay, az), (bx, by, bz) = tn['pts'][0], tn['pts'][1]
    ux, uz = bx - ax, bz - az; ul = math.hypot(ux, uz); ux, uz = ux / ul, uz / ul
    along = (GX - gx_) * ux + (GZ - gz_) * uz
    across = np.abs(-(GX - gx_) * uz + (GZ - gz_) * ux)
    WALL |= (along > -0.2) & (across < tn['r'] + 2.0)
# at the mesh: on the floor (what faces up, at the column's floor), the paint of the spot; nothing elsewhere
pi_, pk_ = (V[:, 0] - X0) / H, (V[:, 2] - Z0) / H
pv = np.stack([ndi.map_coordinates(PAINT[..., c], [pi_, pk_], order=1, mode='nearest') for c in range(3)], 1)
fv = ndi.map_coordinates(np.nan_to_num(floorY, nan=-99.0), [pi_, pk_], order=0, mode='nearest')
onfloor = (np.abs(V[:, 1] - fv) < 0.7) & (N[:, 1] > 0.5)
pv[~onfloor] = 0
paint8 = np.concatenate([np.clip(pv * 255 + 0.5, 0, 255), (onfloor * 255.0)[:, None]], 1).astype(np.uint8)
paintG = np.clip(PAINT * 255 + 0.5, 0, 255).astype(np.uint8)                          # per column: what is underfoot (her steps' sounds)
paintG[..., 3] = np.where(WALL, 255, np.where(bare > 0.5, 128, 0))                     # (and in the last: 0 soil, 128 bare rock, 255 no floor of hers)
log('paint: earth', int((dirt > 0.5).sum() * H * H), 'm2, sand', int((sand > 0.5).sum() * H * H), 'm2, leaves', int((litter > 0.5).sum() * H * H), 'm2')

# ---------------------------------------------------------------- write
V32 = verts.astype(np.float32)
I32 = faces.astype(np.uint32)
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
    # paint: per vertex, Uint8 x 4: earth, sand, fallen leaves (moss where none of them is), and 255 on the floor (0 elsewhere)
    'mesh': {'vertices': int(len(V32)), 'indices': int(I32.size),
             'pos': put(V32), 'nrm': put(nrm8), 'light': put(light8), 'info': put(info8), 'paint': put(paint8), 'idx': put(I32)},
    # floor[ix * nz + iz] (Int16 cm; -32768: no air there): x0 + ix * cell, z0 + iz * cell; paint[(ix * nz + iz) * 4 + c]
    # (Uint8: earth, sand, fallen leaves, and 0 soil / 128 bare rock / 255 no floor of hers: a wall's foot, a rock, a way closed)
    'floor': {'nx': int(NX), 'nz': int(NZ), 'x0': X0, 'z0': Z0, 'cell': H,
              'floor': put(np.ascontiguousarray(fl16)), 'ceil': put(np.ascontiguousarray(ce16)), 'paint': put(np.ascontiguousarray(paintG))},
    'volume': {'nx': int(VNX), 'ny': int(VNY), 'nz': int(VNZ), 'x0': VX0, 'y0': VY0, 'z0': VZ0, 'cell': VC, 'data': put(vol8)},
    'lightScale': LSCALE,
}
with open(os.path.join(OUT, 'cave-hall.bin'), 'wb') as f:
    f.write(b''.join(parts))
fang_tips = [dict(x=float(x), z=float(z), tip=float(roof_at(x, z) - L)) for x, z, L, R in fangs]
layout = {
    'about': 'the forest hall (room 3 of the dungeon plan): made by tools/make-cave-hall.py, read by cave-hall.js',
    'bin': header,
    'sun': [float(v) for v in SUN], 'crack': {'c': list(CRACK['c']), 'a': CRACK['a'], 'b': CRACK['b'], 'ang': CRACK['ang'], 'y': CRACK['y'], 'top': CRACK_TOP},
    'shaftFoot': [float(SHAFT_FOOT[0]), float(fy), float(SHAFT_FOOT[1])],
    'pool': {'c': list(POOL['c']), 'r': POOL['r'], 'level': POOL['level']},
    'trickle': {'top': [8.3, 22.0, -1.0], 'bottom': [POOL['c'][0] - 0.4, POOL['level'], POOL['c'][1] + 0.1]},
    'crystals': crystals, 'shrooms': shrooms, 'trees': trees, 'hanging': hanging, 'rim': rim, 'cover': cover, 'fangs': fang_tips,
    'columns': [list(c) for c in COLUMNS],
    'spawn': {'x': PLACES[0]['x'], 'z': PLACES[0]['z'], 'yaw': PLACES[0]['heading']},
    # the places she can be put at (the page's buttons): where she stands, the way she faces, how high that level is
    'places': [dict(p, y=round(floor_here(p['x'], p['z']), 2)) for p in PLACES],
    'levels': {'tier': TIER1['h'], 'balcony': TIER2['h'], 'arm': ARM['h']},
    'gates': GATES,                                       # x, z, radius: the crystals across the ways in and on (she stops at them)
    'bounds': [X0, Y0, Z0, X1, Y1, Z1],
}
json.dump(layout, open(os.path.join(OUT, 'cave-hall.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
log('wrote', os.path.getsize(os.path.join(OUT, 'cave-hall.bin')) // 1024, 'KB bin,', len(V32), 'vertices,', len(I32), 'triangles')
