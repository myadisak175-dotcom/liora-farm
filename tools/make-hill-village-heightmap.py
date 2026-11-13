# make-hill-village-heightmap.py  —  the hill village's land and plan (?map=hillvillage), written from one description
#
# The land was read off a painting of a village on stepped cliffs (a keep on a crag, a manor, a great tree, a water mill, a
# windmill, a river coming down in falls under a stone bridge) and is laid out here by hand: plateaus as
# polygons with a height, their edges made to wander, ramps where the ways climb, level ground under every building, and the
# water's beds. Nothing is cut through the land for the falls: each stretch of water lies on its own terrace, in a shallow
# bed, and goes over the terrace's edge as a fall. (The plan only says where each stretch runs and how high it stands: where
# its surface lies, where its lip is and where the fall lands are worked out in the game from the land itself, land-water.js.)
#
# South of the village the land goes on, and the valley of the first map lies in it, made again here to its measure, its head
# right under the village's terrace: the river goes over the terrace's edge in one great fall to the valley's floor (no pool
# between: that was one step of falls too many), and winds down a floor some forty metres wide between stepped cliffs. A way
# cut along the west cliff goes down to it; a plank bridge crosses the river. (No abyss at its end yet: the valley runs on out
# of the map.)
#
#   python3 tools/make-hill-village-heightmap.py       (Termux: pip install numpy scipy pillow)
#
# writes, in assets/heightmaps/:
#   hill-village.png    the land to look at, 16-bit grey: white high, black low
#   hill-village.bin    the land as raw 16-bit numbers, little-endian, land.nx across by land.nz down, one every land.cell
#                       metres from (land.x0, land.z0)  (what the game reads)
#   hill-village.json   the plan: where the land lies and the part she walks on, the water (brooks and falls, as for ?map=pit),
#                       the buildings, the two bridges, the ways, yards, fences, fields, small things, plants, rocks, and the
#                       places to start from
# Places are metres from the middle of the village: x east, z south. A yaw is the way a thing faces: 0 south (+z), pi/2 east.
import json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

SIZE = 160.0                      # metres across the village's part she walks on (the plan's u, v run over this)
MARGIN = 30.0                     # and round it, land she only sees: wooded hills rising to the map's edge
VLAND = SIZE + 2 * MARGIN         # the village's own square of land, as it was first drawn
S = SIZE / 200.0                  # (the plan was drawn on a 200 m square: heights and widths drawn there are scaled by this)
N = 1024; MPP = VLAND / N
BASE, RANGE = -16.0, 66.0         # black is BASE metres, white BASE + RANGE
OUT = Path(__file__).resolve().parent.parent / 'assets/heightmaps'
rng = np.random.default_rng(7)
M = lambda u, v: ((u - .5) * SIZE, (v - .5) * SIZE)                 # the plan's (u, v) in 0..1 -> metres
uvm = lambda x, z: (x / SIZE + .5, z / SIZE + .5)                   # and back (the valley is given in metres)
PXU = lambda u: ((u - .5) * SIZE + VLAND / 2) / MPP                 # the plan's u (or v) -> a pixel of the village's picture
face = lambda a, b: math.atan2(b[0] - a[0], b[1] - a[1])            # the yaw that looks from a toward b
R2 = lambda p: [round(float(p[0]), 2), round(float(p[1]), 2)]
sm = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))      # 0 at a, 1 at b, smooth between


def fbm(cells, octaves=4, gain=0.5):
    out = np.zeros((N, N)); amp = 1.0; tot = 0.0
    for o in range(octaves):
        c = cells * 2 ** o
        z = ndi.zoom(rng.random((c + 3, c + 3)), N / c, order=3)[:N, :N]
        out += amp * z; tot += amp; amp *= gain
    out /= tot
    return (out - out.min()) / (out.max() - out.min())


# ------------------------------------------------------------------ 1. the plateaus (painted low -> high; heights as drawn, x S)
LEVELS = [
    (3,  [(0, 0), (1, 0), (1, 1), (0, 1)]),                                                    # the low ground below the village
    (10, [(0, .50), (.36, .50), (.62, .52), (.80, .60), (.81, .72), (.73, .79), (.63, .80), (.56, .86), (.44, .90), (.22, .90), (.10, .94), (0, .96)]),  # the village's terrace
    (12, [(.75, .40), (1, .40), (1, .68), (.87, .70), (.80, .63)]),                             # the east wood's ledge
    (14, [(.12, .46), (.27, .46), (.34, .60), (.25, .65), (.13, .635)]),                        # the ledge house
    (15, [(.43, .47), (.61, .46), (.61, .60), (.54, .60), (.49, .575), (.44, .56)]),            # the slope above the bridge
    (16, [(.59, .44), (.77, .40), (.81, .56), (.77, .66), (.62, .655), (.58, .57)]),            # the windmill's ledge
    (18, [(.21, .41), (.40, .39), (.46, .48), (.44, .56), (.36, .58), (.26, .54), (.19, .48)]), # the water mill's terrace
    (25, [(.23, .22), (.45, .22), (.42, .415), (.21, .42)]),                                    # the rocky slope behind the mill
    (22, [(.40, .20), (.67, .16), (.69, .42), (.61, .48), (.46, .485), (.40, .40)]),            # the great tree's plateau
    (26, [(.64, .15), (.92, .13), (1, .19), (1, .44), (.80, .46), (.68, .425), (.64, .30)]),    # the pasture
    (27, [(0, 0), (.25, 0), (.27, .26), (.225, .38), (.205, .46), (.12, .54), (0, .56)]),       # the west plateau
    (28, [(.42, 0), (1, 0), (1, .20), (.90, .16), (.65, .18), (.51, .225), (.43, .21)]),        # the manor and the north wood
    (35, [(.24, 0), (.44, 0), (.465, .14), (.42, .255), (.32, .30), (.25, .245)]),              # the keep's crag
]
NI = int(round(SIZE / MPP)); PADPX = (N - NI) // 2
img = Image.new('F', (NI, NI), 0.0); d = ImageDraw.Draw(img)
for h, poly in LEVELS:
    d.polygon([(u * NI, v * NI) for u, v in poly], fill=float(h * S))
H = np.array(img, dtype=np.float64)
assert not (H[:NI // 2] < 5 * S).any(), 'a gap between the plateaus'
H = np.pad(H, ((PADPX, N - NI - PADPX), (PADPX, N - NI - PADPX)), mode='edge')      # the margin: each plateau runs on outward
yy, xx = np.mgrid[0:N, 0:N].astype(np.float64)
wx = (fbm(5, 3) - .5) * 30 + (fbm(22, 2) - .5) * 9                  # the edges wander
wy = (fbm(5, 3) - .5) * 30 + (fbm(22, 2) - .5) * 9
H = ndi.map_coordinates(H, [yy + wy, xx + wx], order=1, mode='nearest')
H = ndi.gaussian_filter(H, 3.0)                                      # cliffs stay steep: a metre or two of run
H += ((fbm(4, 3) - .5) * 4.5 + (fbm(9, 2) - .5) * 1.6) * S           # the plateaus roll a little, and lean toward the river
H += (0.5 - (yy - PADPX) / NI) * 3.0 * S
for (u, v, amp, r) in [(.265, .275, 6.0, 5), (.30, .31, 3.0, 4), (.93, .40, 3.0, 6), (.08, .50, 2.5, 7), (.86, .08, 2.0, 12)]:   # crags
    x0, z0 = PXU(u), PXU(v)
    H += amp * S * np.exp(-(((xx - x0) * MPP) ** 2 + ((yy - z0) * MPP) ** 2) / (2 * (r * S) ** 2))
gy, gx = np.gradient(H, MPP)
rock = ndi.gaussian_filter(np.clip((np.hypot(gx, gy) - .45) / 1.3, 0, 1), 3.5)
H += (fbm(10, 3) - .5) * 0.9 * S * (1 - rock)                        # soft on the grass
H += (np.abs(fbm(26, 4) - .5) * 2 - .5) * 3.2 * S * rock             # craggy on the cliffs
WX = (xx / N - .5) * VLAND; WZ = (yy / N - .5) * VLAND
OUTSIDE = np.maximum(np.abs(WX) - SIZE / 2, -SIZE / 2 - WZ)         # metres out into the margin: west, east and north (to the south the land goes on)
H += np.clip(OUTSIDE / MARGIN, 0, 1) ** 1.5 * (5 + 9 * fbm(6, 3)) * (1 - 0.75 * (H < 6 * S))      # the margin rises into hills (hardly at all on the low ground)

# ------------------------------------------------------------------ 1b. the land goes on to the south, and the valley lies in it
# The valley's head lies where the river leaves the village's terrace: LIP, the spot on the river's own line (RIVER_END, going
# RIVER_DIR) where the ground drops away; the valley's middle a little east of it, and the valley 100 m long from there.
RIVER_END = np.array(M(.68, .74)); RIVER_DIR = RIVER_END - np.array(M(.645, .705)); RIVER_DIR /= np.linalg.norm(RIVER_DIR)
_t = np.arange(0, 25, 0.2); _g = ndi.map_coordinates(H, [(RIVER_END[1] + RIVER_DIR[1] * _t + VLAND / 2) / MPP, (RIVER_END[0] + RIVER_DIR[0] * _t + VLAND / 2) / MPP], order=1)
assert (_g < 10 * S - 2.0).any(), 'the river never leaves its terrace'
LIP = RIVER_END + RIVER_DIR * _t[(_g < 10 * S - 2.0).argmax()]             # (where the ground is 0.9 m under the river's level)
ZH, XV, HEAD, DROP = round(float(LIP[1]) + 4.0, 1), round(float(LIP[0]) + 5.0, 1), 20.0, 13.0
BASIN = LIP + RIVER_DIR * 11.0; BASIN_R = 9.0                         # the round floor under the fall, where the plunge pool lies
# The village's picture is set into a longer one (the same metres to a pixel, so the village is as it was): a little more
# margin to the north, and more land to the south: the valley and a margin past its end.
PAD_N = 65; NX = N; XH = VLAND / 2; Z0 = -XH - PAD_N * MPP
PLAY = (-SIZE / 2, SIZE / 2, -SIZE / 2, float(round(ZH + 100)))      # the part she walks on: x0, x1, z0, z1
NZ = int(round((PLAY[3] + 36 - Z0) / MPP)); Z1 = Z0 + NZ * MPP       # the land: x -XH..XH, z Z0..Z1
H = np.pad(H, ((PAD_N, NZ - N - PAD_N), (0, 0)), mode='edge')
yy, xx = np.mgrid[0:NZ, 0:NX].astype(np.float64)
WX = (xx / NX - .5) * VLAND; WZ = Z0 + yy * MPP                      # world metres of every pixel
OUTSIDE = np.maximum.reduce([np.abs(WX) - PLAY[1], PLAY[2] - WZ, WZ - PLAY[3]])
rs = np.random.default_rng(31)                                       # (dice of its own: the village's are thrown as before)


def fbm_big(cell, octaves=3, gain=0.5):
    """noise over the whole land; cell: metres across its broadest lumps"""
    out = np.zeros((NZ, NX)); amp = 1.0; tot = 0.0
    for o in range(octaves):
        k = cell / 2 ** o / MPP
        z = ndi.zoom(rs.random((int(NZ / k) + 4, int(NX / k) + 4)), k, order=3)[:NZ, :NX]
        out += amp * z; tot += amp; amp *= gain
    out /= tot
    return (out - out.min()) / (out.max() - out.min())


def sample(Hm, P):
    P = np.atleast_2d(P)
    return ndi.map_coordinates(Hm, [(P[:, 1] - Z0) / MPP, (P[:, 0] + XH) / MPP], order=1, mode='nearest')


# the low ground runs on south as a rolling meadow, with hills round it as round the village
P_S = 2.9 + (fbm_big(45, 3) - .5) * 1.3 + (fbm_big(12, 2) - .5) * 0.4
hills = np.clip(np.maximum(np.abs(WX) - PLAY[1], WZ - PLAY[3]) / MARGIN, 0, 1) ** 1.5 * (5 + 9 * fbm_big(40, 3))
H = H + (P_S - H) * (1 - sm(4.0, 5.6, H)) * sm(58, 76, WZ)           # (only the low ground: the village's terrace keeps its cliff)
H = H + (P_S + hills - H) * sm(96, 110, WZ)

# the valley: its floor DROP metres below the meadow's own water level (so some 18 m under the river on its terrace). Xc: the
# middle of its floor s metres down from the head; HWf: half the floor's width there; RIV: the river's middle
RL = 3 * S - 0.8 - DROP; FLOOR = RL + 1.2                            # the valley river's level, and the floor
Xc = lambda s: XV + 6 * np.sin(s / 38 + 0.6) - 6 * math.sin(0.6)
HWf = lambda s: 21 + 3.5 * np.sin(s / 27 + 1) + 2 * np.sin(s / 11 + 2)
RIV = lambda s: Xc(s) + 3.5 * np.sin(s / 13 + 0.5) * np.clip((s - 20) / 20, 0, 1)
sx = WX + (fbm_big(28, 2) - .5) * 7; sz = WZ + (fbm_big(28, 2) - .5) * 7      # its outline wanders
s_ = sz - ZH
cap = np.where(s_ >= HEAD, 1.0, np.sqrt(np.clip(1 - ((HEAD - s_) / HEAD) ** 2, 0, 1)))      # the head is round
d_basin = np.hypot(WX - BASIN[0], WZ - BASIN[1])                     # metres from the middle of the floor under the fall
floor = ndi.binary_fill_holes(((s_ > 0) & (np.abs(sx - Xc(s_)) < HWf(s_) * cap)) | (d_basin < BASIN_R))
d_out = ndi.distance_transform_edt(~floor) * MPP                     # metres out from the floor's edge (into the cliff)
d_in = ndi.distance_transform_edt(floor) * MPP                       # metres in from it
# the cliffs are stepped: a lower face, a ledge of grass (some metres wide in places, none in others), an upper face. No ledge
# under the fall, nor on the stretch of the west cliff the way down is cut along
west = WX < Xc(WZ - ZH)
no_ledge = np.maximum(west * sm(ZH + 12, ZH + 18, WZ) * (1 - sm(ZH + 82, ZH + 90, WZ)), 1 - sm(BASIN_R + 5, BASIN_R + 11, d_basin))
LW = np.clip((fbm_big(22, 2) - 0.42) * 14, 0, 5.0) * (1 - no_ledge)
T1, H1, T2, H2 = 1.8, 6.4, 2.0, 8.0                                  # the lower face's run and height, the upper face's
e_ = d_out - T1 - LW
rise = H1 * sm(0, T1, d_out) + 0.5 * np.clip((d_out - T1) / np.maximum(LW, 0.01), 0, 1) * (LW > 0.05) + np.where(e_ > 0, H2 * sm(0, T2, e_) + 4.0 * np.clip(e_ - T2, 0, None), 0)
talus = sm(BASIN_R + 3, BASIN_R + 11, d_basin); fnoise = (fbm_big(14, 2) - .5) * 0.4     # the floor: nearly level, a little higher at the cliffs' feet
H_before = H.copy()
H = np.minimum(H, np.where(floor, FLOOR + 0.9 * talus * sm(6, 0.5, d_in) + fnoise, FLOOR + 0.9 * talus + fnoise + rise))
gy, gx = np.gradient(H, MPP)
rock = ndi.gaussian_filter(np.clip((np.hypot(gx, gy) - .45) / 1.3, 0, 1), 3.5) * sm(78, 88, WZ)
H += (np.abs(fbm_big(8.5, 4) - .5) * 2 - .5) * 2.4 * rock            # craggy on its cliffs, as on the village's
_rows = np.nonzero(floor.any(1))[0]; _xw = WX[0, floor[_rows].argmax(1)]; _sd = d_out - d_in


def west_cliff(z, out):
    """the spot at z on the valley's west side that lies `out` metres out from the floor's edge (less than 0: on the floor)"""
    xs = np.arange(-14.0, 8.0, 0.1) + float(np.interp(z, Z0 + _rows * MPP, _xw))
    return float(xs[np.abs(sample(_sd, np.c_[xs, np.full(len(xs), z)]) - out).argmin()])


def level_ground(x, z, r, feather=0.6):
    """the ground made even in a circle (what stands there needs a floor)"""
    global H
    dist = np.hypot(WX - x, WZ - z)
    target = np.median(H[dist < r])
    w = np.clip(1 - (dist - r) / (r * feather), 0, 1); w = w * w * (3 - 2 * w)
    H = H * (1 - w) + target * w
    return float(target)


def even_ends(a, b, r=2.4, feather=2.0):
    """both ends of a bridge brought to one height"""
    global H
    hb_ = float(np.mean(sample(H, np.array([a, b]))))
    for p_ in (a, b):
        dist = np.hypot(WX - p_[0], WZ - p_[1]); w = np.clip(1 - (dist - r) / feather, 0, 1); w = w * w * (3 - 2 * w)
        H = H * (1 - w) + hb_ * w
    return hb_


def nearest(P, reach):
    """every pixel within reach of the line P: (which pixels, how far, which point of P is nearest)"""
    j0 = max(0, int((P[:, 1].min() - reach - Z0) / MPP)); j1 = min(NZ, int((P[:, 1].max() + reach - Z0) / MPP) + 2)
    i0 = max(0, int((P[:, 0].min() - reach + XH) / MPP)); i1 = min(NX, int((P[:, 0].max() + reach + XH) / MPP) + 2)
    if j1 <= j0 or i1 <= i0: return np.zeros(0, int), np.zeros(0), np.zeros(0, int)
    dd, idx = cKDTree(P).query(np.stack([WX[j0:j1, i0:i1].ravel(), WZ[j0:j1, i0:i1].ravel()], 1), distance_upper_bound=reach)
    ok = np.isfinite(dd)
    return (np.arange(j0, j1)[:, None] * NX + np.arange(i0, i1)[None, :]).ravel()[ok], dd[ok], idx[ok]


# ------------------------------------------------------------------ 2. the buildings (houses are put together from the kit: village-kit.js)
PLAZA = M(.34, .70); TREE_YARD = M(.54, .375)
B = []          # the plan's buildings


def house(id, uv, spec, yaw, pad=None):
    x, z = M(*uv) if isinstance(uv[0], float) and abs(uv[0]) <= 1 and abs(uv[1]) <= 1 else uv
    r = pad or math.hypot(spec['w'], spec['l']) / 2 + 1.6
    B.append({'id': id, 'kind': 'house', 'x': round(x, 2), 'z': round(z, 2), 'yaw': round(yaw, 3), 'spec': spec, 'pad': round(r, 2)})


h1 = M(.23, .745); h3 = M(.405, .805); cu2 = M(.465, .30); cu3 = M(.615, .43)
house('village_house_1', (.23, .745), dict(w=4, l=6, floors=2, wall='brick', seed=11), face(h1, PLAZA))
house('village_house_2', (.305, .80), dict(w=6, l=8, floors=1, wall='plaster', door='right', seed=12, dormer=True), math.pi / 2)
house('village_house_3', (.405, .805), dict(w=4, l=8, floors=2, wall='plaster', seed=13), face(h3, PLAZA))
house('village_house_4', (.165, .685), dict(w=4, l=6, floors=1, wall='plaster', seed=14), math.pi / 2)
house('ledge_house', (.21, .595), dict(w=4, l=6, floors=1, wall='brick', seed=15), 0.0)
house('cottage_upper_1', (.49, .155), dict(w=4, l=6, floors=1, wall='plaster', seed=16), 0.6)
house('cottage_upper_2', (.465, .30), dict(w=4, l=6, floors=2, wall='plaster', seed=17), face(cu2, TREE_YARD))
house('cottage_upper_3', (.615, .43), dict(w=4, l=4, floors=1, wall='brick', seed=18), face(cu3, TREE_YARD))
house('manor', (.58, .105), dict(w=8, l=14, floors=2, wall='brick', door='left', seed=19, dormer=True, windows=0.8), math.pi / 2, pad=10.5)
house('barn', (.73, .245), dict(w=6, l=10, floors=1, wall='brick', seed=20, chimney=False, windows=0.25, shutters=False), 0.0)
house('stable_shed', (.85, .285), dict(w=4, l=4, floors=1, wall='plaster', seed=21, chimney=False, windows=0.3), 0.0)
# the keep on its crag: a tall tower with a hall against its east wall
KEEP = M(.345, .125)
house('castle_keep', KEEP, dict(w=4, l=4, floors=4, wall='brick', upper='brick', tower=True, door='back', seed=22, windows=0.35, shutters=False), 0.0, pad=9.5)
house('castle_hall', (KEEP[0] + 6, KEEP[1]), dict(w=4, l=8, floors=2, wall='brick', upper='plaster', door='left', doorAt=1, seed=23), math.pi / 2, pad=1)
B.append({'id': 'windmill', 'kind': 'windmill', 'x': M(.70, .56)[0], 'z': M(.70, .56)[1], 'yaw': -2.2, 'height': 11.5, 'pad': 6.0})
B.append({'id': 'fountain', 'kind': 'well', 'x': PLAZA[0] - 0.8, 'z': PLAZA[1] - 3.0, 'yaw': 0.4, 'pad': 3.2})      # (beside the road through the market, not on it)
B.append({'id': 'great_tree', 'kind': 'tree', 'x': M(.55, .345)[0], 'z': M(.55, .345)[1], 'type': 'oak', 'scale': 2.3, 'pad': 4.5})

# ------------------------------------------------------------------ 3. the water, as planned: four stretches, each on its own level
# (name, the terrace it lies on, how far under that terrace the water stands, how deep its bed is pressed, the line: (u, v,
# half-width in metres as drawn)). The two streams are shallow enough to wade (she will not walk into water deeper than half a
# metre); the river and the valley's river are not: the river is crossed by the stone bridge, the valley's by planks.
mv = lambda x, z, half: (*uvm(x, z), half / S)                        # a point of a line given in metres
WATER = [
    ('upper_stream', 27, 0.35, 0.3, [(.085, .365, 4.2), (.13, .385, 3.0), (.165, .40, 2.0), (.19, .41, 2.1)]),
    ('mill_stream', 18, 0.35, 0.3, [(.235, .445, 2.6), (.265, .455, 2.2), (.30, .485, 2.2), (.34, .50, 2.2), (.37, .53, 2.5)]),
    ('river', 10, 1.1, 1.0, [(.40, .585, 4.2), (.425, .615, 3.8), (.4625, .6375, 3.8), (.50, .665, 4.6), (.55, .675, 5.4), (.60, .695, 6.4), (.645, .705, 6.4), (.68, .74, 6.0)]),
    # the valley's river: a plunge pool under the great fall, then winding down the floor and out of the map
    ('valley_river', 3, 0.8 + DROP, 1.2, [mv(*(LIP + RIVER_DIR * 9.0), 6.5), mv(*BASIN, 8.2), mv(float(Xc(19)), ZH + 19, 7.2), mv(float(Xc(26)), ZH + 26, 5.2)]
     + [mv(float(RIV(s)), ZH + s, 3.9 + 0.3 * math.sin(s / 9)) for s in range(33, int(Z1 - ZH), 6)]),
]
_rl = WATER[3][4]; _rz = [M(u, v)[1] for u, v, _ in _rl]
riv_x = lambda z: float(np.interp(z, _rz, [M(u, v)[0] for u, v, _ in _rl]))      # the valley river's middle at z, and half its width
riv_h = lambda z: float(np.interp(z, _rz, [hw * S for _, _, hw in _rl]))
# the water mill stands on the mill stream's north bank, its wheel in the water
ms = WATER[1][4]; a, b = np.array(M(*ms[2][:2])), np.array(M(*ms[3][:2])); t = (b - a) / np.linalg.norm(b - a); nrm = np.array([t[1], -t[0]])
if nrm[1] > 0: nrm = -nrm                                             # the bank toward the north
s0 = a + (b - a) * 0.35; mill_yaw = math.atan2(t[0], t[1])            # ridge along the stream
WHEEL = s0 + nrm * (ms[2][2] - 0.2); MILL = s0 + nrm * (ms[2][2] + 1.3 + 2.0)
house('watermill', (float(MILL[0]), float(MILL[1])), dict(w=4, l=6, floors=2, wall='brick', door='front', seed=24, windows=0.5), mill_yaw)

for b_ in B:
    if b_['pad'] > 1.5: b_['y'] = round(level_ground(b_['x'], b_['z'], b_['pad']), 2)
by_id = {b_['id']: b_ for b_ in B}
by_id['castle_hall']['y'] = by_id['castle_keep']['y']

# ------------------------------------------------------------------ 4. fields (fenced) and the pasture
FIELDS = [   # centre, size across x and z, yaw, what grows
    {'id': 'west_field_1', 'at': M(.076, .705), 'w': 15, 'd': 9.5, 'yaw': 0.0, 'crop': 'cabbage'},
    {'id': 'west_field_2', 'at': M(.076, .775), 'w': 15, 'd': 9.5, 'yaw': 0.0, 'crop': 'carrot'},
    {'id': 'mill_field', 'at': M(.685, .465), 'w': 17, 'd': 8.5, 'yaw': 0.12, 'crop': 'wheat'},
]
for f in FIELDS:                                                       # (the land is left as it lies: the rows follow it)
    f['x'], f['z'] = round(f['at'][0], 2), round(f['at'][1], 2); del f['at']


def rect(x, z, w, d_, yaw=0.0):
    c, s = math.cos(yaw), math.sin(yaw)
    return [R2((x + lx * c + lz * s, z - lx * s + lz * c)) for lx, lz in [(-w / 2, -d_ / 2), (w / 2, -d_ / 2), (w / 2, d_ / 2), (-w / 2, d_ / 2)]]


wf = (FIELDS[0]['x'], (FIELDS[0]['z'] + FIELDS[1]['z']) / 2)
FENCES = [
    {'id': 'pasture', 'points': [R2(M(.755, .315)), R2(M(.91, .31)), R2(M(.915, .41)), R2(M(.76, .41))], 'gate': 3},       # (gate: in the middle of which side)
    {'id': 'west_fields', 'points': rect(wf[0], wf[1], 18, 24), 'gate': 1},
    {'id': 'mill_field', 'points': rect(FIELDS[2]['x'], FIELDS[2]['z'], 19.5, 11, FIELDS[2]['yaw']), 'gate': 3},
]

# ------------------------------------------------------------------ 5. the two bridges and the ways (ramps where they climb)
BRIDGE_C = np.array(M(.4625, .6375)); BRIDGE_DIR = np.array([1.0, -1.0]) / math.sqrt(2); BRIDGE_LEN = 13.0
BS, BN = BRIDGE_C - BRIDGE_DIR * BRIDGE_LEN / 2, BRIDGE_C + BRIDGE_DIR * BRIDGE_LEN / 2
even_ends(BS, BN)                                                     # the stone bridge: both its ends stand at one height
# the plank bridge over the valley's river (it lies east-west), a little below where the way down reaches the floor
PLANK_Z = ZH + 86.0; PLANK_X = riv_x(PLANK_Z); PLANK_LEN = round(2 * riv_h(PLANK_Z) + 4.6, 1)
PW, PE = np.array([PLANK_X - PLANK_LEN / 2, PLANK_Z]), np.array([PLANK_X + PLANK_LEN / 2, PLANK_Z])
even_ends(PW, PE, 1.6, 1.6)
uv = lambda p: (p[0] / SIZE + .5, p[1] / SIZE + .5)
door_of = lambda id, out=1.2: (lambda b_: (b_['x'] + math.sin(b_['yaw']) * (b_['spec']['l'] / 2 + out), b_['z'] + math.cos(b_['yaw']) * (b_['spec']['l'] / 2 + out)))(by_id[id])
# the way down into the valley, cut along its west cliff: from the brink on the meadow to the floor by the plank bridge,
# keeping to the cliff's face all the way (at its top on the brink, at its foot on the floor)
RAMP_A, RAMP_B = 24.0, 80.0
RAMP = [(west_cliff(ZH + RAMP_A + (RAMP_B - RAMP_A) * k / 14, (T1 + T2 + 1.4) * (1 - k / 14) - 1.8 * k / 14), ZH + RAMP_A + (RAMP_B - RAMP_A) * k / 14) for k in range(15)]
RAMP = [RAMP[0]] + [((a_[0] + 2 * b_[0] + c_[0]) / 4, b_[1]) for a_, b_, c_ in zip(RAMP, RAMP[1:], RAMP[2:])] + [RAMP[-1]]      # (its line eased)
RAMP_TOP, RAMP_FOOT = RAMP[0], RAMP[-1]
# the lookout on the valley's east brink, a little way down from the head (the great fall is seen from across the valley
# there): 2.4 m back from where the land breaks off
_lx = np.arange(XV + 8.0, XV + 44.0, 0.2); _lzz = np.full(len(_lx), ZH + 16.0)
_cut = sample(H_before, np.c_[_lx, _lzz]) - sample(H, np.c_[_lx, _lzz]) > 0.3
LOOKOUT = (float(_lx[len(_cut) - 1 - _cut[::-1].argmax()]) + 2.4, ZH + 16.0)
east_bank = lambda s, out=4.0: (riv_x(ZH + s) + riv_h(ZH + s) + out, ZH + s)
west_bank = lambda s, out=4.0: (riv_x(ZH + s) - riv_h(ZH + s) - out, ZH + s)
FALL_FOOT = (float(BASIN[0]) + 8.2 + 3.6, float(BASIN[1]) + 5.0)        # on the plunge pool's east shore
PATHS = {   # name: (half-width, points in the plan's u, v)
    'road_in': (1.5, [(-.13, .815), (-.05, .83), (0, .845), (.06, .875), (.12, .895), (.18, .845), (.26, .76), (.34, .70), (.39, .685), uv(BS)]),
    'bridge_up': (1.4, [uv(BN), (.515, .56), (.525, .49), (.53, .43), (.54, .385)]),
    'to_castle': (1.2, [(.54, .385), (.50, .31), (.475, .245), (.44, .19), (.405, .162), (.385, .158)]),
    'to_manor': (1.2, [(.475, .245), (.52, .185), (.565, .158)]),
    'to_pasture': (1.2, [(.54, .385), (.62, .355), (.69, .32), (.725, .33), (.755, .36)]),
    'to_barn': (0.9, [(.725, .33), (.73, .295)]),
    'to_windmill': (1.2, [(.525, .51), (.60, .535), (.672, .558)]),
    'to_watermill': (1.1, [(.52, .53), (.455, .515), (.39, .475), uv(door_of('watermill'))]),
    'to_ledge_house': (0.9, [(.26, .76), (.225, .69), uv(door_of('ledge_house'))]),
    'to_fields': (0.9, [(.215, .808), (.17, .77), (.135, .745)]),
    'to_house_1': (0.8, [(.285, .735), uv(door_of('village_house_1'))]),
    'to_house_3': (0.8, [(.36, .725), uv(door_of('village_house_3'))]),
    'to_cottage_2': (0.8, [(.52, .355), uv(door_of('cottage_upper_2'))]),
    'to_mill_field': (0.8, [(.60, .535), (.615, .50), (.622, .47)]),
    # ways to the parts of the map no door stands on, so all of it can be walked: the west wood and its spring; down the cliff
    # below the village to the meadow and along the valley's brink to the top of the way down; and from the windmill's ledge
    # through the east wood to a lookout on the valley's east brink
    'to_west_wood': (1.0, [(.54, .375), (.48, .385), (.43, .385), (.38, .375), (.32, .36), (.26, .35), (.20, .335), (.14, .345), (.125, .345)]),
    'to_valley': (1.0, [(.39, .685), (.45, .73), (.50, .765), (.545, .79), uvm(6.5, 55.0), uvm(5.5, 64.0), uvm(RAMP_TOP[0] - 3.5, RAMP_TOP[1] - 6.0), uvm(*RAMP_TOP)]),
    'to_lookout': (1.0, [(.74, .56), (.77, .555), (.83, .57), (.88, .60), (.92, .66), (.915, .72), uvm(LOOKOUT[0] - 1.0, LOOKOUT[1] - 15.0), uvm(LOOKOUT[0] + 1.0, LOOKOUT[1] - 7.0), uvm(*LOOKOUT)]),
    # and in the valley: down the cliff, over the floor to the plank bridge; up the east bank to the foot of the great fall, and
    # down the west bank to the map's end
    'valley_ramp': (1.1, [uvm(*p) for p in RAMP]),
    'valley_floor': (1.0, [uvm(*RAMP_FOOT), uvm((RAMP_FOOT[0] + PW[0]) / 2 - 1.0, (RAMP_FOOT[1] + PW[1]) / 2 + 0.5), uvm(*PW)]),
    'valley_east': (0.9, [uvm(*PE), uvm(*east_bank(78)), uvm(*east_bank(68)), uvm(*east_bank(58)), uvm(*east_bank(48)), uvm(*east_bank(38)), uvm(*east_bank(29, 3.5)), uvm(*east_bank(22, 3.5)), uvm(*FALL_FOOT)]),
    'valley_south': (0.9, [uvm(*PW), uvm(*west_bank(92)), uvm(*west_bank(97))]),
}
YARDS = [[*R2(PLAZA), 6.5, 1], [*R2(TREE_YARD), 5.0, 0], [*R2(M(.385, .158)), 3.0, 1], [*R2(M(.565, .158)), 2.6, 1], [*R2(door_of('barn', 2.0)), 2.6, 0],
         [*R2(LOOKOUT), 2.2, 0]]     # x, z, radius, paved?
STEP = 0.15


def densify(pts, attrs=None, step=STEP):
    P, A = [], []
    for i in range(len(pts) - 1):
        a_, b_ = np.array(pts[i], float), np.array(pts[i + 1], float)
        n = max(2, int(np.hypot(*(b_ - a_)) / step)); t_ = np.linspace(0, 1, n, endpoint=False)[:, None]
        P.append(a_ + (b_ - a_) * t_)
        if attrs is not None: A.append(np.array(attrs[i], float) + (np.array(attrs[i + 1], float) - np.array(attrs[i], float)) * t_)
    P.append(np.array(pts[-1], float)[None])
    if attrs is not None:
        A.append(np.array(attrs[-1], float)[None]); return np.vstack(P), np.vstack(A)
    return np.vstack(P)


path_d = np.full(NZ * NX, 1e9); plan_paths = []
for name, (half, pts_uv) in PATHS.items():
    pts = [M(*p) for p in pts_uv]
    P = densify(pts); hp = sample(H, P); arc = np.arange(len(P)) * STEP
    line = hp[0] + (hp[-1] - hp[0]) * arc / arc[-1]                  # a straight ramp end to end ...
    taper = np.clip(np.minimum(arc, arc[-1] - arc) / 6.0, 0, 1)
    for sig in (4, 6, 9, 13, 18, 25, 35, 50):                        # ... and the land's own shape laid on it, smoothed until it can be walked
        hs = line + taper * ndi.gaussian_filter1d(hp - line, sig / STEP, mode='constant')
        if np.abs(np.diff(hs)).max() / STEP <= 0.30: break
    k = 1.0
    while np.abs(np.diff(hs)).max() / STEP > 0.30 and k > 0:
        k -= 0.1; hs = line + max(k, 0) * (hs - line)
    print(f'  way {name}: {hs[0]:.1f} -> {hs[-1]:.1f} m, steepest {np.abs(np.diff(hs)).max() / STEP * 100:.0f}%')
    at, dd, idx = nearest(P, half + 3.2)
    w = np.clip(1 - (dd - half) / 3.0, 0, 1); w = w * w * (3 - 2 * w)
    flat = H.ravel(); flat[at] = flat[at] * (1 - w) + hs[idx] * w; H = flat.reshape(NZ, NX)
    path_d[at] = np.minimum(path_d[at], dd - half)
    plan_paths.append({'id': name, 'half': half, 'points': [R2(p) for p in pts]})
path_d = path_d.reshape(NZ, NX)
for x, z, r, _ in YARDS: path_d = np.minimum(path_d, np.hypot(WX - x, WZ - z) - r)

# ------------------------------------------------------------------ 6. the water laid on the land: beds, and falls where a terrace ends
H0 = H.copy()
tiers = []
for name, terrace, under, deep, line in WATER:
    tiers.append({'name': name, 'level': terrace * S - under, 'deep': deep, 'pts': [M(u, v) for u, v, _ in line], 'half': [hw * S for _, _, hw in line]})
falls = []
for up, low in zip(tiers[:-1], tiers[1:]):
    a_, b_ = np.array(up['pts'][-1]), np.array(low['pts'][0]); L = np.linalg.norm(b_ - a_); dirn = (b_ - a_) / L
    ext = np.array([a_ + dirn * s_ for s_ in np.arange(-2, L + 6, 0.2)]); g = sample(H0, ext)
    on_top = np.nonzero(g >= up['level'] - 0.9)[0]; lip_i = on_top[-1] if len(on_top) else 0
    foot = np.nonzero((np.arange(len(g)) > lip_i) & (g <= low['level'] + 1.6))[0]; foot_i = foot[0] if len(foot) else len(g) - 1
    lip, ft = ext[lip_i] + dirn * 0.8, ext[foot_i]                   # (the bed runs a step out past the brink, so the fall clears the cliff's foot)
    up['pts'][-1] = tuple(lip); low['pts'][0] = tuple(ft + dirn * 0.5); low['half'][0] = low['half'][0] * 1.15
    falls.append({'x': round(float(lip[0]), 2), 'z': round(float(lip[1]), 2), 'top': round(up['level'], 2), 'bottom': round(low['level'], 2),
                  'width': round(2 * up['half'][-1] + 0.4, 2), 'yaw': round(float(math.atan2(dirn[0], dirn[1])), 3), 'deep': 0})
    print(f"  fall {up['name']} -> {low['name']}: {up['level']:.1f} -> {low['level']:.1f} m, {np.linalg.norm(ft - lip):.1f} m out from the lip")
for f_, low in zip(falls, tiers[1:]):                                # under each fall the cliff is sheer (water wears it back), so the sheet falls free
    dx_, dz_ = math.sin(f_['yaw']), math.cos(f_['yaw']); rx, rz = WX - f_['x'], WZ - f_['z']
    along = rx * dx_ + rz * dz_; across = np.abs(rx * dz_ - rz * dx_)
    w = np.clip((along - 0.25) / 0.5, 0, 1) * np.clip((6.0 - along) / 1.5, 0, 1) * np.clip((f_['width'] / 2 + 1.2 - across) / 1.0, 0, 1)
    H = np.where(w > 0, np.minimum(H, H * (1 - w) + (low['level'] - 0.4) * w), H)
brooks = []; water_d = np.full(NZ * NX, 1e9)
flat = H.ravel().copy(); g0 = H0.ravel()
unit = lambda v_: v_ / np.linalg.norm(v_)
for k_, tr in enumerate(tiers):
    P, A = densify(tr['pts'], [[hw] for hw in tr['half']], step=0.25)
    at, dd, idx = nearest(P, max(tr['half']) * 1.35 + 2.2 + 3.0); half = A[idx, 0]; lvl = tr['level']; bank = 2.2 + half * 0.35
    # its own terrace only: the cliff above is never cut into, and past the brink (or behind the foot of the fall that feeds it)
    # the land is left as it is; up to the brink its bed is laid even where the ground has begun to drop
    px_at = np.stack([WX.ravel()[at], WZ.ravel()[at]], 1); past = np.zeros(len(at), bool)
    if k_ < len(tiers) - 1: past |= (idx == len(P) - 1) & (((px_at - P[-1]) @ unit(P[-1] - P[-9])) > 0.1)
    if k_ > 0: past |= (idx == 0) & (((px_at - P[0]) @ unit(P[0] - P[8])) > 0.1)
    # where it ends in a fall, its last 3 m are made a lip: the bed comes up to a shallow sill, and a shoulder of rock stands
    # each side of the water right to the lip's line, even where the cliff's edge had already curved away there. The water
    # then leaves over a straight edge, with a bank on both sides to the very end
    up_lip = (len(P) - 1 - idx) * 0.25 if k_ < len(tiers) - 1 else np.full(len(at), 99.0)      # metres up from the lip
    at_lip = (up_lip < 3.0) & ~past
    own = (g0[at] < lvl + 3.2) & ((g0[at] > lvl - 3.2) | (dd < half) | at_lip) & ~past
    inside = dd < half
    deep_ = np.minimum(tr['deep'], 0.3 + (tr['deep'] - 0.3) * sm(0.5, 3.0, up_lip))
    bed = lvl - deep_ * (1 - (dd / np.maximum(half, 1e-6)) ** 2) - 0.12
    s_ = np.clip((dd - half) / bank, 0, 1); s_ = s_ * s_ * (3 - 2 * s_)
    shore = (lvl + 0.22) * (1 - s_) + flat[at] * s_                   # the banks come up (or down) to the water's edge
    shoulder = (lvl + 0.3) + (flat[at] - (lvl + 0.3)) * sm(0, 1.0, dd - half - 1.2)
    shore = shore + (np.maximum(shore, shoulder) - shore) * (1 - sm(2.0, 3.0, up_lip))
    new = np.where(inside, bed, shore)
    flat[at] = np.where(own & (dd < half + bank), new, flat[at])
    water_d[at] = np.minimum(water_d[at], dd - half)
    rows = np.vstack([P[:-1:4], P[-1:]]); hw = np.concatenate([A[:-1:4, 0], A[-1:, 0]])
    brooks.append([[round(float(p[0]), 2), round(float(p[1]), 2), round(lvl, 2), round(float(h_), 2)] for p, h_ in zip(rows, hw)])
H = flat.reshape(NZ, NX); water_d = water_d.reshape(NZ, NX)
H = ndi.gaussian_filter(H, 0.6)

# ------------------------------------------------------------------ 7. plants: woods where the painting has them, bushes at the cliffs' feet, flowers by the houses
gy, gx = np.gradient(H, MPP); slope = np.hypot(gx, gy)
px_m = lambda m: max(1, int(round(m / MPP)))
blocked = (water_d < 2.0) | (path_d < 1.3) | ndi.binary_dilation(slope > 0.55, iterations=px_m(1.2))
for b_ in B:
    blocked |= np.hypot(WX - b_['x'], WZ - b_['z']) < (b_['pad'] + 0.8 if b_['kind'] != 'tree' else 3.0)
mk = Image.new('L', (NX, NZ), 0); md = ImageDraw.Draw(mk)
P2 = lambda p: ((p[0] + XH) / MPP, (p[1] - Z0) / MPP)
PXX = lambda u: ((u - .5) * SIZE + XH) / MPP; PXZ = lambda v: ((v - .5) * SIZE - Z0) / MPP
md.line([P2(BS), P2(BN)], fill=255, width=px_m(6)); md.line([P2(PW), P2(PE)], fill=255, width=px_m(5))
for f in FENCES: md.polygon([P2(p) for p in f['points']], fill=255); md.line([P2(p) for p in f['points'] + f['points'][:1]], fill=255, width=px_m(3))
blocked |= np.array(mk) > 0
e = px_m(2.5); blocked[:e] = blocked[-e:] = True; blocked[:, :e] = blocked[:, -e:] = True
blocked |= (np.abs(OUTSIDE) < 1.2)                                    # (nothing on the line she cannot cross: a trunk there would look like a wall)
near_cliff = ndi.gaussian_filter((slope > 0.8).astype(float), px_m(3.5)) > 0.06
seen = np.maximum(np.abs(WX) / XH, np.abs(WZ - (Z0 + Z1) / 2) / ((Z1 - Z0) / 2)) < 0.94      # (past this the land is lost in the haze)
south = WZ > PLAY[1] + 4


def zone(poly):
    m = Image.new('L', (NX, NZ), 0); ImageDraw.Draw(m).polygon([(PXX(u), PXZ(v)) for u, v in poly], fill=255); return np.array(m) > 0


WOODS = [   # where the trees stand thick: polygon (u, v), metres between trees, share of pines
    ([(0, .01), (.22, .01), (.235, .24), (.19, .34), (0, .345)], 6.5, 0.10), ([(0, .41), (.17, .44), (.11, .525), (0, .545)], 6.5, 0.10),
    ([(.44, 0), (.66, 0), (.66, .05), (.44, .05)], 6.0, 0.6), ([(.66, 0), (1, 0), (1, .15), (.90, .115), (.68, .135)], 5.6, 0.75),
    ([(.935, .19), (1, .19), (1, .43), (.935, .43)], 6.0, 0.6), ([(.80, .45), (1, .45), (1, .675), (.87, .685)], 5.6, 0.85),
    ([(.93, .70), (1, .70), (1, .97), (.95, .97)], 6.0, 0.7),
    ([(.30, .915), (.57, .875), (.57, 1), (.30, 1)], 5.6, 0.6), ([(0, .965), (.30, .93), (.30, 1), (0, 1)], 6.5, 0.2),
    ([(.41, .33), (.455, .33), (.455, .45), (.41, .45)], 7.5, 0.0), ([(.615, .385), (.675, .37), (.675, .44), (.615, .465)], 7.5, 0.0),
    ([(.235, .30), (.40, .30), (.40, .385), (.235, .40)], 7.0, 0.3),
    # the meadow above the valley: a wood along its west side, a copse nearer the brink, and trees along the east brink
    ([uvm(-80, 84), uvm(-42, 84), uvm(-36, 115), uvm(-44, PLAY[3]), uvm(-80, PLAY[3])], 8.5, 0.35),
    ([uvm(-24, 104), uvm(-7, 99), uvm(1, 116), (uvm(-9, 134)), uvm(-26, 127)], 7.0, 0.1),
    ([uvm(71, ZH + 24), uvm(80, ZH + 24), uvm(80, PLAY[3]), uvm(72, PLAY[3])], 7.0, 0.6),
]
vr = np.random.default_rng(21); plants = []


def scatter(mask, spacing, pick, tries=0.25, keep=1.0):
    ys, xs = np.nonzero(mask & ~blocked)
    for i in vr.integers(0, max(1, len(ys)), int(len(ys) * MPP * MPP * tries)):
        x, z = (xs[i] + vr.random()) * MPP - XH, (ys[i] + vr.random()) * MPP + Z0
        if vr.random() > keep: continue
        if plants and min(math.hypot(p[1] - x, p[2] - z) - (spacing if p[0] != 'flower' else 1.5) for p in plants) < 0: continue
        plants.append(pick() + (x, z))


def tree(pine):
    def pick():
        if vr.random() < pine: return ('pine',)
        r_ = vr.random(); return ('oak',) if r_ < 0.4 else ('broadleaf',) if r_ < 0.78 else ('birch',)
    return pick


wood_area = np.zeros((NZ, NX), bool)
for poly, spacing, pine in WOODS:
    m = zone(poly) & (OUTSIDE < 0); wood_area |= m; scatter(m, spacing, tree(pine))
# the valley's floor: trees in clumps at the cliffs' feet, a few out on the grass
clumps = floor & (d_in > 1.5) & (d_in < 8.5) & (d_basin > BASIN_R + 8) & (OUTSIDE < 0) & (fbm_big(16, 2) > 0.5)
wood_area |= clumps; scatter(clumps, 5.5, tree(0.15), keep=0.8)
scatter(floor & (d_in >= 8.5) & (OUTSIDE < 0), 13.0, lambda: ('broadleaf',) if vr.random() < 0.6 else ('birch',), tries=0.05, keep=0.5)
wood_area |= floor
ring = OUTSIDE > 0; wood_area |= ring                                # the margin: woods all round, thickest just past the line
scatter(ring & (OUTSIDE < 10), 7.0, tree(0.45)); scatter(ring & (OUTSIDE >= 10) & seen, 10.0, tree(0.6))
scatter(~wood_area, 15.0, lambda: ('broadleaf',) if vr.random() < 0.6 else ('birch',), tries=0.02, keep=0.5)       # lone trees in the open
scatter(near_cliff & (OUTSIDE < 0) & ~south, 4.0, lambda: ('bush',), tries=0.08, keep=0.6)
scatter(near_cliff & (OUTSIDE < 0) & south, 4.5, lambda: ('bush',), tries=0.08, keep=0.35)
scatter(~near_cliff & (OUTSIDE < 4), 8.0, lambda: ('bush',), tries=0.02, keep=0.4)
flower_at = zone([(.14, .64), (.40, .64), (.52, .76), (.50, .86), (.22, .87), (.14, .80)]) | zone([(.46, .28), (.66, .26), (.67, .42), (.47, .46)])
scatter(flower_at, 5.0, lambda: ('flower',), tries=0.05, keep=0.5)
scatter(floor & (d_in > 4) & (d_basin > BASIN_R + 6) & (OUTSIDE < 0), 6.5, lambda: ('flower',), tries=0.04, keep=0.5)      # and on the valley's floor
out_plants = []
for kind, x, z in plants:
    sc = {'pine': (0.9, 1.4), 'oak': (0.9, 1.35), 'broadleaf': (0.85, 1.3), 'birch': (0.9, 1.2), 'bush': (0.7, 1.15), 'flower': (1.1, 1.8)}[kind]
    row = [kind, round(x, 2), round(z, 2), round(float(vr.uniform(*sc)), 2)]
    if kind not in ('bush', 'flower') and sample(OUTSIDE, (x, z))[0] > 6: row.append(0.5)      # (trees she never comes near: drawn with half the leaves)
    out_plants.append(row)

# rocks in the valley: water-worn stones and pebbles along the river's banks, boulders round the plunge pool and at the cliffs' feet
rocks = []
clear = lambda x, z, r: sample(path_d, (x, z))[0] > r and math.hypot(x - PLANK_X, z - PLANK_Z) > PLANK_LEN / 2 + 2 and all(math.hypot(x - q[1], z - q[2]) > r + q[3] * 0.8 for q in rocks)
z_ = ZH + 24.0
while z_ < PLAY[3] + 24:
    for side in (-1, 1):
        if vr.random() < 0.35: continue
        x_ = riv_x(z_) + side * (riv_h(z_) + vr.uniform(-0.4, 1.4)); sc_ = float(vr.uniform(0.7, 1.35))
        if clear(x_, z_, 0.7 * sc_ + 0.5): rocks.append(['river', x_, z_, sc_, float(vr.uniform(0, 6.28))])
        if vr.random() < 0.5:
            x_, zz_ = riv_x(z_) + side * (riv_h(z_) + vr.uniform(1.5, 3.0)), z_ + vr.uniform(-2, 2)
            if clear(x_, zz_, 1.0): rocks.append(['pebbles', x_, zz_, float(vr.uniform(0.9, 1.3)), float(vr.uniform(0, 6.28))])
    z_ += vr.uniform(5, 9)
for ang in (0.2, 1.0, 1.9, 2.8, 5.6):                                 # round the plunge pool (0: east of it; the fall comes in from the north-west)
    c_ = (float(BASIN[0]), float(BASIN[1])); rr_ = 8.2 + vr.uniform(0.2, 1.2); x_, zz_ = c_[0] + math.cos(ang) * rr_, c_[1] + math.sin(ang) * rr_ * 0.85
    if clear(x_, zz_, 1.2): rocks.append(['boulder' if vr.random() < 0.6 else 'river', x_, zz_, float(vr.uniform(0.9, 1.5)), float(vr.uniform(0, 6.28))])
ys_, xs_ = np.nonzero(floor & (d_in > 1.0) & (d_in < 2.6) & (d_basin > BASIN_R + 8) & (WZ < PLAY[3] + 20) & (water_d > 3))
for i in vr.integers(0, len(ys_), 60):
    x_, zz_ = xs_[i] * MPP - XH, ys_[i] * MPP + Z0
    if len([q for q in rocks if q[0] in ('boulder', 'stones')]) < 20 and clear(x_, zz_, 4.0) and all(math.hypot(x_ - p[1], zz_ - p[2]) > 2.2 for p in plants if p[0] != 'flower'):
        rocks.append(['boulder' if vr.random() < 0.55 else 'stones', x_, zz_, float(vr.uniform(0.8, 1.5)), float(vr.uniform(0, 6.28))])
rocks = [[k, round(x, 2), round(z, 2), round(sc_, 2), round(rot, 2)] for k, x, z, sc_, rot in rocks]

# ------------------------------------------------------------------ 8. the small things: a market round the fountain, and what a farm leaves lying about
px_, pz_ = PLAZA; ty = TREE_YARD; barn = by_id['barn']; wmill = by_id['windmill']; fr = M(.835, .36)
PROPS = [   # kind (stylized-buildings.js propGeometry, or kit:<piece>), x, z, yaw
    ['stall', px_ - 7.5, pz_ - 5.0, 0.9], ['stall', px_ + 2.5, pz_ - 8.0, -0.2], ['stall', px_ + 8.0, pz_ + 3.5, -1.9], ['stall', px_ - 3.0, pz_ + 8.5, 2.9],
    ['barrels', px_ - 9.4, pz_ - 2.4, 0.3], ['crates', px_ + 5.6, pz_ - 7.4, 1.0], ['crates', px_ + 10.2, pz_ + 4.6, 2.0], ['kit:Prop_Wagon', px_ + 13.0, pz_ + 8.0, 2.4], ['bench', px_ - 2.6, pz_ - 3.6, 0.6], ['bench', px_ + 3.4, pz_ + 2.6, -2.4], ['lamp', px_ - 4.4, pz_ + 3.4, 0], ['lamp', px_ + 4.6, pz_ - 3.2, 0],
    ['table', *M(.47, .775), 0.3], ['bench', M(.47, .775)[0], M(.47, .775)[1] + 1.6, 0.3], ['table', M(.47, .775)[0] + 4, M(.47, .775)[1] + 0.8, 0.2], ['signpost', *M(.19, .835), 0.8],
    ['stall', ty[0] + 8.0, ty[1] - 6.5, -2.3], ['barrels', ty[0] + 10.5, ty[1] - 4.6, 0.4], ['bench', ty[0] - 3.4, ty[1] + 4.6, 2.4], ['lamp', ty[0] + 4.6, ty[1] + 2.6, 0],
    ['hay', barn['x'] + 5.0, barn['z'] + 4.0, 0.4], ['hay', barn['x'] + 5.6, barn['z'] + 6.2, 1.9], ['woodpile', barn['x'] - 4.6, barn['z'] + 2.0, 1.57], ['cart', barn['x'] - 6.0, barn['z'] + 8.5, 0.5],
    ['sheep', fr[0] - 5, fr[1] - 2, 0.6], ['sheep', fr[0] + 1, fr[1] + 2.4, 2.4], ['sheep', fr[0] + 5.5, fr[1] - 1.5, 4.0], ['sheep', fr[0] - 1.5, fr[1] + 4.6, 5.2], ['sheep', fr[0] + 8, fr[1] + 3, 1.6],
    ['hay', fr[0] - 8.5, fr[1] - 4.5, 1.0], ['hay', wmill['x'] - 2.5, wmill['z'] - 7.5, 0.3], ['barrels', wmill['x'] + 5.2, wmill['z'] + 2.8, 1.0], ['cart', wmill['x'] - 4.0, wmill['z'] + 6.0, 2.0],
    ['woodpile', MILL[0] + nrm[0] * 3.6 - t[0] * 2, MILL[1] + nrm[1] * 3.6 - t[1] * 2, mill_yaw], ['barrels', MILL[0] + t[0] * 4.6 + nrm[0] * 2.6, MILL[1] + t[1] * 4.6 + nrm[1] * 2.6, 0.2],
    ['crates', by_id['castle_hall']['x'] + 2.5, by_id['castle_hall']['z'] + 4.2, 0.5], ['lamp', M(.385, .158)[0] + 2.6, M(.385, .158)[1] + 1.2, 0],
    ['barrels', by_id['manor']['x'] - 5.0, by_id['manor']['z'] + 5.6, 0], ['bench', by_id['manor']['x'] + 4.0, by_id['manor']['z'] + 5.6, 3.14], ['lamp', M(.565, .158)[0] - 2.4, M(.565, .158)[1] + 0.6, 0],
    ['signpost', *M(.535, .40), 2.0], ['signpost', BS[0] - 2.2, BS[1] + 2.4, 0.4], ['woodpile', by_id['ledge_house']['x'] + 4.0, by_id['ledge_house']['z'] - 1.5, 1.57],
    # the valley: a signpost where the way to it comes down onto the meadow, another at the foot of the way down; a bench at the lookout
    ['signpost', 7.6, 65.5, 2.6], ['signpost', RAMP_FOOT[0] + 2.4, RAMP_FOOT[1] - 1.0, 1.2], ['bench', LOOKOUT[0] + 0.3, LOOKOUT[1] + 2.0, -2.0],
]
PROPS = [[k, round(float(x), 2), round(float(z), 2), round(float(y), 2)] for k, x, z, y in PROPS]
for k, x, z, _ in PROPS:
    i, j = int((z - Z0) / MPP), int((x + XH) / MPP)
    if k not in ('lamp', 'signpost') and path_d[i, j] < 0.6 and not any(math.hypot(x - yx, z - yz) < yr for yx, yz, yr, _p in YARDS): print(f'  ! {k} at {x:.1f}, {z:.1f} stands on a way')
    if water_d[i, j] < 0.5 or slope[i, j] > 0.5: print(f'  ! {k} at {x:.1f}, {z:.1f} is in water or on a cliff')

# ------------------------------------------------------------------ 9. the places to start from (name, spot, the way she faces)
SPAWN = M(.04, .868); FALL = tuple(LIP + RIVER_DIR * 2.0); above = M(.60, .80); rim = (RAMP_TOP[0] - 1.2, RAMP_TOP[1] - 4.0)
VIEWS = {
    'start': [*R2(SPAWN), round(face(SPAWN, M(.12, .895)), 2)], 'vl-plaza': [*R2((px_ + 1.5, pz_ + 5.0)), 3.0], 'vl-bridge': [*R2(BS - BRIDGE_DIR * 3), round(face(BS, BN), 2)],
    'vl-tree': [*R2((ty[0] - 2.5, ty[1] + 3.5)), round(face(ty, (by_id['great_tree']['x'], by_id['great_tree']['z'])), 2)],
    'vl-castle': [*R2(M(.405, .168)), round(face(M(.405, .168), KEEP), 2)], 'vl-manor': [*R2(M(.555, .168)), round(face(M(.555, .168), (by_id['manor']['x'], by_id['manor']['z'])), 2)],
    'vl-pasture': [*R2(M(.735, .345)), 1.4], 'vl-windmill': [*R2(M(.655, .555)), round(face(M(.655, .555), (wmill['x'], wmill['z'])), 2)],
    'vl-watermill': [*R2(M(.40, .49)), round(face(M(.40, .49), tuple(WHEEL)), 2)], 'vl-fields': [*R2(M(.15, .75)), -1.57], 'vl-falltop': [*R2(above), round(face(above, tuple(BASIN)), 2)],
    'vl-spring': [*R2(M(.15, .345)), round(face(M(.15, .345), M(.085, .365)), 2)],
    'vl-eastwood': [*R2(M(.88, .60)), round(face(M(.88, .60), M(.92, .66)), 2)],
    'vl-brink': [*R2(LOOKOUT), round(face(LOOKOUT, FALL), 2)], 'vl-rim': [*R2(rim), round(face(rim, (riv_x(ZH + 70), ZH + 70)), 2)],
    'vl-fallfoot': [*R2(FALL_FOOT), round(face(FALL_FOOT, FALL), 2)], 'vl-valley': [*R2((PW[0] - 2.5, PW[1] + 0.4)), round(face(PW, (riv_x(ZH + 40), ZH + 40)), 2)],
}

# ------------------------------------------------------------------ 10. write it all out
assert H.min() > BASE and H.max() < BASE + RANGE, (H.min(), H.max())
OUT.mkdir(parents=True, exist_ok=True)
v16 = np.clip((H - BASE) / RANGE, 0, 1)
Image.fromarray((np.array(Image.fromarray(v16.astype('f4'), 'F').resize((NX // 2, NZ // 2), Image.BILINEAR)) * 65535).round().astype(np.uint16)).save(OUT / 'hill-village.png')
CELL = 0.4; nx = int(2 * XH / CELL) + 1; nz = int((Z1 - Z0) / CELL) + 1      # the game's copy: a height every CELL metres
gz, gx_ = np.mgrid[0:nz, 0:nx].astype(np.float64)
small = ndi.map_coordinates(H, [gz * CELL / MPP, gx_ * CELL / MPP], order=1, mode='nearest')
np.clip((small - BASE) / RANGE * 65535, 0, 65535).round().astype('<u2').tofile(OUT / 'hill-village.bin')
plan = {
    'land': {'x0': -XH, 'z0': round(Z0, 4), 'cell': CELL, 'nx': nx, 'nz': nz, 'base': BASE, 'range': RANGE, 'play': list(PLAY)},
    'brooks': brooks, 'falls': falls, 'waters': [{'id': t_['name'], 'level': round(t_['level'], 2)} for t_ in tiers],
    'buildings': B, 'wheel': {'x': round(float(WHEEL[0]), 2), 'z': round(float(WHEEL[1]), 2), 'yaw': round(mill_yaw, 3), 'level': round(tiers[1]['level'], 2)},
    'bridge': {'x': round(float(BRIDGE_C[0]), 2), 'z': round(float(BRIDGE_C[1]), 2), 'length': BRIDGE_LEN, 'yaw': round(math.atan2(-BRIDGE_DIR[1], BRIDGE_DIR[0]), 3)},
    'plank': {'x': round(PLANK_X, 2), 'z': round(PLANK_Z, 2), 'length': PLANK_LEN, 'yaw': 0.0},
    'paths': plan_paths, 'yards': YARDS, 'fences': FENCES, 'fields': FIELDS, 'props': PROPS, 'plants': out_plants, 'rocks': rocks,
    'spawn': {'x': round(SPAWN[0], 2), 'z': round(SPAWN[1], 2), 'yaw': VIEWS['start'][2]}, 'views': VIEWS,
}
json.dump(plan, open(OUT / 'hill-village.json', 'w'), separators=(',', ':'))
kinds = {}
for p in out_plants: kinds[p[0]] = kinds.get(p[0], 0) + 1
far_trees = sum(1 for p in out_plants if len(p) > 4)
print(f'land {H.min():.1f} .. {H.max():.1f} m, {nx} x {nz} heights; {len(B)} buildings, {len(plan_paths)} ways, {sum(len(b_) for b_ in brooks)} water rows, {len(falls)} falls')
print(f'plants {kinds} (trees she never comes near: {far_trees}); rocks {len(rocks)}')
