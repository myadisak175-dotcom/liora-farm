#!/usr/bin/env python3
# make-cave-hall.py  —  the forest hall of the dungeon under the waterfall cliff (room ③ of the plan), baked for cave-hall.html
#
# One job: shape the hall as a field of distance to rock (a "density" field, the way abyssal-garden builds its seabed: rock is
# where the value is > 0), turn it into one mesh (marching cubes), and bake the light it will be seen in, so the phone does no
# lighting work for it but the sprite's (the one light that moves). Writes
#   assets/caves/cave-hall.bin   the mesh (positions, normals, baked light), the floor and ceiling she walks between, and a
#                                coarse 3D picture of the light in the air (for the plants and for her: cave-light.js)
#   assets/caves/cave-hall.json  where things are: crystals, mushrooms, trees, the trees hanging from the roof, the pool, the
#                                shaft of light, the views; and where in the .bin each part is
#
# The hall (metres; x east, z south, y up; 0 = the forest floor):
#   a dome ~64 x 48 m, walls ~11 m, ~24 m at its crown, a crack through the roof the sun comes in at (a shaft onto a great tree);
#   west: a balcony 6 m up (the way in from the crystal passage, a tunnel stub), a ramp down along the south wall;
#   east: a terrace 8 m up (the way on, a tunnel stub), a ramp up along the north wall;
#   north-west: a rock shelf 3.5 m up on stepping stones; south-east: a shelf 5 m up (only the magic jump will reach it);
#   a pool under the crack's east end, fed by a thin fall of water from the crack; two columns floor to roof; fang stalactites;
#   stalagmites and boulders on the floor.
#
# Run: python3 tools/make-cave-hall.py            (needs numpy, scipy, scikit-image; ~1 minute)
import json, math, os, struct, sys, time
import numpy as np
from scipy import ndimage as ndi
from skimage import measure

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
BALCONY = dict(x=-21.5, h=6.0, z=(-13.0, 13.0))
TERRACE = dict(x=21.5, h=8.0, z=(-15.0, 9.0))
RAMP_W = [(-24.5, 12.0), (-19.0, 16.4), (-13.0, 19.2), (-8.5, 20.0)]     # balcony (6 m) down to the floor
RAMP_E = [(2.0, -18.6), (9.0, -18.6), (15.8, -16.9), (22.4, -12.6)]       # the floor up to the terrace (8 m), clear of the wall's bulges
SHELF_NW = dict(c=(-13.5, -17.5), r=(6.0, 3.6), h=3.5)                    # the shelf on stepping stones
STEPS_NW = [(-4.2, -9.6), (-5.4, -11.2), (-6.9, -12.6), (-8.4, -13.8), (-9.8, -15.2), (-10.8, -16.4)]
SHELF_SE = dict(c=(16.5, 15.5), r=(5.2, 3.0), h=5.0)
COLUMNS = [(-15.0, 7.0, 2.5), (18.0, 6.5, 2.1)]                          # x, z, radius at floor and roof
GREAT_TREE = (SHAFT_FOOT[0] - 0.4, SHAFT_FOOT[1] + 0.6)


def wob2(px, pz, f, s, amp):
    return amp * (fbm3(px * f, pz * f, 0.0 * px + 3.7, s) - 0.5) * 2


def floor_at(px, pz):
    """the floor's height (before the walls, columns and rocks are laid over it)"""
    F = 0.32 * (fbm3(px * 0.07, pz * 0.07, 1.3 + 0 * px, 5) - 0.5) * 2 + 0.25 * (fbm3(px * 0.3, pz * 0.3, 2.1 + 0 * px, 6) - 0.5)
    # the pool: a bowl under the crack's east end
    r = np.hypot(px - POOL['c'][0], pz - POOL['c'][1]) + wob2(px, pz, 0.35, 8, 0.6)
    F = F + (POOL['floor'] - F) * sstep(POOL['r'] + 1.2, POOL['r'] - 0.8, r)
    # the balcony (west) and the terrace (east): plateaus with steep faces
    eb = (BALCONY['x'] + wob2(px, pz, 0.12, 9, 1.4)) - px                   # > 0 on the balcony
    eb = np.minimum(eb, np.minimum(pz - BALCONY['z'][0], BALCONY['z'][1] - pz) + 6.0)
    F = F + (BALCONY['h'] - F) * sstep(-0.35, 0.35, eb)
    et = px - (TERRACE['x'] + wob2(px, pz, 0.12, 10, 1.4))
    et = np.minimum(et, np.minimum(pz - TERRACE['z'][0], TERRACE['z'][1] - pz) + 6.0)
    F = F + (TERRACE['h'] - F) * sstep(-0.35, 0.35, et)
    # the ramps: raised ways along the walls
    for pts, h0, h1 in ((RAMP_W, BALCONY['h'], 0.0), (RAMP_E, 0.0, TERRACE['h'])):
        d, t = poly2(px, pz, pts)
        hr = h0 + (h1 - h0) * sstep(0.0, 1.0, t) * 0.25 + (h1 - h0) * t * 0.75
        m = sstep(2.2, 1.6, d)
        F = np.maximum(F, F + (hr - F) * m)
    # the shelves
    for sh in (SHELF_NW, SHELF_SE):
        e = 1.0 - np.hypot((px - sh['c'][0]) / sh['r'][0], (pz - sh['c'][1]) / sh['r'][1]) + wob2(px, pz, 0.3, 11, 0.12)
        F = np.maximum(F, F + (sh['h'] - F) * sstep(-0.04, 0.06, e))
    # stepping stones up to the NW shelf (0.55 m apiece: she can walk up them)
    for i, (sx, sz) in enumerate(STEPS_NW):
        e = 1.25 - np.hypot(px - sx, pz - sz)
        F = np.maximum(F, F + ((i + 1) * 0.55 - F) * sstep(-0.12, 0.12, e))
    return F


# ---------------------------------------------------------------- the rock, everywhere
Xg, Yg, Zg = np.meshgrid(xs, ys, zs, indexing='ij')
Xg, Yg, Zg = Xg.astype(np.float64), Yg.astype(np.float64), Zg.astype(np.float64)
F2 = floor_at(Xg[:, 0, :], Zg[:, 0, :])                      # (NX, NZ)
log('floor')
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
# tunnel stubs: the way in (west, from the balcony) and the way on (east, from the terrace)
TUNNELS = [dict(pts=[(-27.5, 8.8, 1.0), (-32.0, 9.0, 0.2), (-35.5, 9.2, 3.4)], floor=6.0, r=3.0),
           dict(pts=[(26.5, 10.8, -4.0), (31.0, 11.0, -5.0), (34.5, 11.2, -1.8)], floor=8.0, r=3.0)]
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
MITES = [(-24.0, -15.0, 3.6, 1.3), (-27.0, -7.5, 2.4, 1.0), (13.5, 17.5, 2.6, 1.0), (25.5, 13.0, 3.2, 1.2), (-9.0, 13.5, 2.2, 1.0),
         (5.0, 17.0, 1.6, 0.8), (27.5, -11.0, 2.0, 0.9), (-18.0, -4.0, 1.4, 0.7)]
for i, (x, z, Hm, R) in enumerate(MITES):
    fl = floor_here(x, z)
    add_cone(S, x, z, fl - 1.0, fl + Hm, R, 120 + i)
BOULDERS = [(-11.0, 16.0, 1.6), (21.0, -17.5, 1.3), (14.0, 1.5, 1.2), (-19.5, 9.5, 1.4), (6.0, -15.0, 1.1), (-6.0, -18.5, 1.2)]
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


def in_way(x, z):
    """on a way she walks: the ramps, the stones, round the great tree's foot, the balcony's and the terrace's edges"""
    for pts in (RAMP_W, RAMP_E):
        d, _ = poly2(np.array([x]), np.array([z]), pts)
        if d[0] < 2.3:
            return True
    if any(math.hypot(x - sx, z - sz) < 1.6 for sx, sz in STEPS_NW):
        return True
    if math.hypot(x - GREAT_TREE[0], z - GREAT_TREE[1]) < 5.5:
        return True
    return False


# the walls: clusters, more toward the north and west and by the two ways out
for i in cand_wall:
    if len([c for c in crystals if c['kind'] == 'wall']) >= 30:
        break
    p, n = verts[i], N[i]
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
    p = [x, y, z]
    if not far_from(p, crystals, 7.0):
        continue
    crystals.append(dict(kind='float', p=[float(v) for v in p], n=[0.0, 1.0, 0.0], size=float(rng.uniform(0.45, 0.8)),
                         col=str(rng.choice(['cyan', 'white', 'teal'])), count=1, seed=int(rng.integers(1, 9999))))
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

# ---------------------------------------------------------------- the forest: trees on the floor, trees hanging from the roof, ferns and tufts
FG = lambda x, z: floor_here(x, z)


def free_floor(x, z, need=1.0):
    """a spot on the hall's floor (not a ramp, shelf, step or the pool), clear of walls by `need` m"""
    i, k = int(round((x - X0) / H)), int(round((z - Z0) / H))
    if not (0 <= i < NX and 0 <= k < NZ) or np.isnan(floorY[i, k]):
        return False
    f = floorY[i, k]
    if f > 1.2 or f < -0.4:
        return False
    ii0, ii1, kk0, kk1 = max(i - 3, 0), min(i + 4, NX), max(k - 3, 0), min(k + 4, NZ)
    patch = floorY[ii0:ii1, kk0:kk1]
    if np.isnan(patch).any() or np.nanmax(patch) - np.nanmin(patch) > 0.9:
        return False
    d = -sample(np.array([x]), np.array([f + 3.6]), np.array([z]))[0]      # (high enough that the floor itself is not the nearest rock)
    if d < need:
        return False
    if math.hypot(x - POOL['c'][0], z - POOL['c'][1]) < POOL['r'] + 1.2:
        return False
    return True


trees = [dict(kind='tree', type='broadleaf', seed=7, x=GREAT_TREE[0], z=GREAT_TREE[1], scale=1.55, great=True)]
# views kept open: no tree or bush on the line from where a view stands to what it looks at (the great tree, the pool)
VIEW_UNDER = (GREAT_TREE[0] + 6.0, GREAT_TREE[1] + 7.0)
VIEW_POOL = (POOL['c'][0] - 3.5, POOL['c'][1] + 6.6)
CLEAR_LINES = [[VIEW_UNDER, GREAT_TREE], [VIEW_POOL, POOL['c']]]


def in_view(x, z, r=3.6):
    return any(poly2(np.array([x]), np.array([z]), line)[0][0] < r for line in CLEAR_LINES)


def by_pool(x, z, r):
    return math.hypot(x - POOL['c'][0], z - POOL['c'][1]) < r
TYPES = ['broadleaf', 'oak', 'birch', 'sapling', 'broadleaf', 'oak']
tries = 0
while len(trees) < 12 and tries < 6000:
    tries += 1
    r, a = rng.uniform(6.5, 19), rng.uniform(0, 6.283)
    x, z = GREAT_TREE[0] + r * math.cos(a) * 1.25, GREAT_TREE[1] + r * math.sin(a)
    if not free_floor(x, z, 3.0) or in_way(x, z):
        continue
    if math.hypot(x - GREAT_TREE[0], z - GREAT_TREE[1]) < 7.5 or in_view(x, z) or by_pool(x, z, 8.5):
        continue
    if any(math.hypot(x - t['x'], z - t['z']) < 6.0 for t in trees):
        continue
    if any(math.hypot(x - cx, z - cz) < r0 + 3.5 for cx, cz, r0 in COLUMNS):
        continue
    typ = TYPES[len(trees) % len(TYPES)]
    trees.append(dict(kind='tree', type=typ, seed=int(rng.integers(1, 999)), x=float(x), z=float(z),
                      scale=float(rng.uniform(0.75, 1.05) if typ != 'sapling' else rng.uniform(0.9, 1.2))))
tries = 0
while len([t for t in trees if t['kind'] == 'bush']) < 14 and tries < 6000:
    tries += 1
    x, z = rng.uniform(-22, 20), rng.uniform(-17, 19)
    if not free_floor(x, z, 1.2) or in_way(x, z) or in_view(x, z, 2.4) or by_pool(x, z, 6.0):
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
cover = []
tries = 0
while len(cover) < 150 and tries < 20000:
    tries += 1
    x, z = rng.uniform(-28, 28), rng.uniform(-21, 21)
    if not free_floor(x, z, 0.4) or in_way(x, z):
        continue
    if any(math.hypot(x - t['x'], z - t['z']) < (1.2 if t['kind'] == 'bush' else 1.0) for t in trees):
        continue
    if any(math.hypot(x - c['x'], z - c['z']) < 1.15 for c in cover):
        continue
    # tufts where the light falls, ferns in the shade
    i, k = int(round((x - X0) / H)), int(round((z - Z0) / H))
    lit = math.exp(-((x - SHAFT_FOOT[0]) ** 2 + (z - SHAFT_FOOT[1]) ** 2) / (2 * 9.0 ** 2))
    kind = 'tuft' if rng.random() < 0.15 + 0.75 * lit else 'fern'
    cover.append(dict(kind=kind, x=float(x), z=float(z), y=FG(x, z), seed=int(rng.integers(1, 9999)), scale=float(rng.uniform(0.85, 1.3))))
log('cover', len(cover))

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
    'mesh': {'vertices': int(len(V32)), 'indices': int(I32.size),
             'pos': put(V32), 'nrm': put(nrm8), 'light': put(light8), 'info': put(info8), 'idx': put(I32)},
    # floor[ix * nz + iz] (Int16 cm; -32768: no air there): x0 + ix * cell, z0 + iz * cell
    'floor': {'nx': int(NX), 'nz': int(NZ), 'x0': X0, 'z0': Z0, 'cell': H,
              'floor': put(np.ascontiguousarray(fl16)), 'ceil': put(np.ascontiguousarray(ce16))},
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
    'spawn': {'x': -25.6, 'z': 1.2, 'yaw': math.pi / 2},
    'views': [
        {'name': 'ระเบียงทางเข้า', 'x': -25.6, 'z': 1.2, 'yaw': -math.pi / 2, 'pitch': 0.12, 'dist': 4.6, 'heading': math.pi / 2},
        {'name': 'ใต้แสง', 'x': GREAT_TREE[0] + 6.0, 'z': GREAT_TREE[1] + 7.0, 'yaw': 0.71, 'pitch': 0.04, 'dist': 5.2, 'heading': -2.43,
         'free': [9.0, 2.0, 8.0, GREAT_TREE[0], 8.5, GREAT_TREE[1]]},
        {'name': 'ริมสระ', 'x': POOL['c'][0] - 3.5, 'z': POOL['c'][1] + 6.6, 'yaw': -0.49, 'pitch': 0.14, 'dist': 4.6, 'heading': 2.65},
        {'name': 'ลานฝั่งตะวันออก', 'x': 25.5, 'z': -3.0, 'yaw': math.pi / 2, 'pitch': 0.16, 'dist': 5.0, 'heading': -math.pi / 2},
        # looking up from the great tree's foot at the crack, the shaft and the trees that hang from the roof (a camera held still)
        {'name': 'มองขึ้นเพดาน', 'x': 9.6, 'z': 6.6, 'yaw': 0.6, 'pitch': 0.1, 'dist': 4.0, 'heading': -2.6,
         'free': [12.0, 1.4, 9.0, CRACK['c'][0] + 1.4, 21.0, CRACK['c'][1] + 0.5]},
    ],
    'bounds': [X0, Y0, Z0, X1, Y1, Z1],
}
json.dump(layout, open(os.path.join(OUT, 'cave-hall.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
log('wrote', os.path.getsize(os.path.join(OUT, 'cave-hall.bin')) // 1024, 'KB bin,', len(V32), 'vertices,', len(I32), 'triangles')
