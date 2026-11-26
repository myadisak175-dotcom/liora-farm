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
# cut along the west cliff goes down to it; a plank bridge crosses the river in the valley's middle. (The great fall is parted by
# two rocks standing in its lip: it comes down in three strands, with a rib of the cliff between each two: SPLIT, in 6.) At its end the valley opens into a round bowl,
# and in the bowl's floor lies the pit: the hand-drawn one of ?map=pit (assets/heightmaps/abyss-pit.bin, read as pit-level.js
# reads it), its rim set at the floor's height. The river runs to the pit's brink and goes down its shelves in falls, and two
# brooks from the meadow fall into the bowl and follow it down, each from the third shelf into the mist. The top of each
# water's way down is a cascade of low steps with a small pool on each (5b), and the way round the pit crosses each water
# by a plank bridge.
#
#   python3 tools/make-hill-village-heightmap.py       (Termux: pip install numpy scipy pillow)
#
# writes, in assets/heightmaps/:
#   hill-village.png    the land to look at, 16-bit grey: white high, black low
#   hill-village.bin    the land as raw 16-bit numbers, little-endian, land.nx across by land.nz down, one every land.cell
#                       metres from (land.x0, land.z0)  (what the game reads)
#   hill-village-bare.png   on the same grid, 8-bit grey: where the rain's runnels have worn the grass away (white: bare earth)
#   hill-village.json   the plan: where the land lies and the part she walks on, the water (brooks and falls, as for ?map=pit),
#                       the buildings, the bridges, the ways, yards, fences, fields, small things, plants (and the flowering
#                       clumps and the ground cover, each a list of its own), rocks, and the places to start from
#   hill-village-scatter.json   the plants and the valley's rocks as first thrown (written once, then read: see 9)
#   hill-village-foliage.json   every plant as it stands: by the rules the first time, by hand in the game ever after (see 9)
# Places are metres from the middle of the village: x east, z south. A yaw is the way a thing faces: 0 south (+z), pi/2 east.
import json, math, sys, zlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
import water_shape as WS                                             # (the water's ways, as every map's tool shapes them: water_shape.py)

SIZE = 160.0                      # metres across the village's part she walks on (the plan's u, v run over this)
MARGIN = 30.0                     # and round it, land she only sees: wooded hills rising to the map's edge
VLAND = SIZE + 2 * MARGIN         # the village's own square of land, as it was first drawn
S = SIZE / 200.0                  # (the plan was drawn on a 200 m square: heights and widths drawn there are scaled by this)
N = 1024; MPP = VLAND / N
BASE, RANGE = -172.0, 226.0       # black is BASE metres, white BASE + RANGE (the pit's eye is a shaft 150 m deep)
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
# the valley is VLEN metres long; at its end it opens into a round bowl (its middle BOWL, its floor BOWL_R across), and the pit
# lies in the bowl's floor. The pit's picture: as ?map=pit has it (pit-level.js: 110 m square, its rim 15 m, black 60 m under
# white, the black eye in its middle a shaft); its middle is PIT_MID off the picture's, its brink about PIT_BRINK from that
VLEN = 106.0; BOWL_R = 54.0; BOWL = np.array([3.0, ZH + VLEN + 46.0])
PIT_SIZE, PIT_N, PIT_RIM, PIT_DEPTH, PIT_EYE, PIT_MID, PIT_BRINK = 110.0, 513, 15.0, 60.0, -140.0, (1.4, -0.5), 40.4      # (PIT_BRINK: the furthest its brink lies from its middle)
polar = lambda th, r: (float(BOWL[0] + r * math.cos(th)), float(BOWL[1] + r * math.sin(th)))      # from the pit's middle: th 0 east, a quarter turn south
SIDE = [math.radians(10), math.radians(190)]                         # the two side brooks: where round the pit they come down (from the east, from the west)
# The village's picture is set into a longer one (the same metres to a pixel, so the village is as it was): a little more
# margin to the north, and more land to the south: the valley and a margin past its end.
PAD_N = 65; NX = N; XH = VLAND / 2; Z0 = -XH - PAD_N * MPP
PLAY = (-SIZE / 2, SIZE / 2, -SIZE / 2, float(round(BOWL[1] + BOWL_R + 1)))      # the part she walks on: x0, x1, z0, z1
NZ = int(round((PLAY[3] + 44 - Z0) / MPP)); Z1 = Z0 + NZ * MPP       # the land: x -XH..XH, z Z0..Z1
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
Xc = lambda s: XV + 6 * np.sin(s / 38 + 0.6) - 6 * math.sin(0.6) - 30 * sm(48, 112, s)      # (its lower half bears west, to the bowl)
HWf = lambda s: 21 + 3.5 * np.sin(s / 27 + 1) + 2 * np.sin(s / 11 + 2)
RIV = lambda s: Xc(s) + 3.5 * np.sin(s / 13 + 0.5) * np.clip((s - 20) / 20, 0, 1)
_v = np.array([float(RIV(VLEN - 7)), ZH + VLEN - 7]) - BOWL                    # the river comes to the pit from this side: TH_R round the pit,
TH_R = math.atan2(_v[1], _v[0])
sx = WX + (fbm_big(28, 2) - .5) * 7; sz = WZ + (fbm_big(28, 2) - .5) * 7      # its outline wanders
s_ = sz - ZH
cap = np.where(s_ >= HEAD, 1.0, np.sqrt(np.clip(1 - ((HEAD - s_) / HEAD) ** 2, 0, 1)))      # the head is round
d_basin = np.hypot(WX - BASIN[0], WZ - BASIN[1])                     # metres from the middle of the floor under the fall
r_bowl = np.hypot(WX - BOWL[0], WZ - BOWL[1]); a_bowl = np.arctan2(WZ - BOWL[1], WX - BOWL[0])      # every pixel from the pit's middle: how far, which way
floor = ndi.binary_fill_holes(((s_ > 0) & (s_ < VLEN + 14) & (np.abs(sx - Xc(s_)) < HWf(s_) * cap)) | (d_basin < BASIN_R) | (np.hypot(sx - BOWL[0], sz - BOWL[1]) < BOWL_R))
d_out = ndi.distance_transform_edt(~floor) * MPP                     # metres out from the floor's edge (into the cliff)
d_in = ndi.distance_transform_edt(floor) * MPP                       # metres in from it
# the cliffs are stepped: a lower face, a ledge of grass (some metres wide in places, none in others), an upper face. No ledge
# under the fall, nor on the stretch of the west cliff the way down is cut along
west = WX < Xc(WZ - ZH)
no_ledge = np.maximum(west * sm(ZH + 12, ZH + 18, WZ) * (1 - sm(ZH + 82, ZH + 90, WZ)), 1 - sm(BASIN_R + 5, BASIN_R + 11, d_basin))
for th in SIDE:                                                       # nor where a side brook falls into the bowl
    no_ledge = np.maximum(no_ledge, (1 - sm(5, 9, np.abs(np.angle(np.exp(1j * (a_bowl - th)))) * r_bowl)) * (r_bowl > BOWL_R - 6))
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
# the pit, set into the bowl's floor. Its picture has a shallow bed pressed into the shelves for each of its own five brooks;
# this map's brooks come down elsewhere, so those beds are filled in again first: round the pit at each distance from its
# middle, a dip narrower than a bed is brought up to the ground either side of it
_pr = np.fromfile(OUT / 'abyss-pit.bin', '<u2').reshape(PIT_N, PIT_N) / 65535.0
_ph = np.where(_pr < 0.02, PIT_EYE, PIT_RIM + (_pr - 0.93) * PIT_DEPTH)
_rr, _tt = np.arange(4.0, 47.0, 0.2), np.arange(0, 2 * math.pi, 0.004)
_pix = lambda x, z: [(z + PIT_SIZE / 2) / PIT_SIZE * (PIT_N - 1), (x + PIT_SIZE / 2) / PIT_SIZE * (PIT_N - 1)]      # the picture's row, column of a spot (metres from its middle)
_pol = ndi.map_coordinates(_ph, _pix(PIT_MID[0] + _rr[:, None] * np.cos(_tt)[None], PIT_MID[1] + _rr[:, None] * np.sin(_tt)[None]), order=1, mode='nearest')
for i_, r_ in enumerate(_rr):
    med = ndi.median_filter(_pol[i_], size=int(8.0 / r_ / 0.004) | 1, mode='wrap'); dip = med - _pol[i_]
    _pol[i_] = np.where((dip > 0.08) & (dip < 1.2), med, _pol[i_])
# its shelves are 3 to 10 m wide, differently all round: the pit is turned (PIT_TURN) so that where the river and the two brooks
# come down, each of the first three shelves is as wide as can be had (the narrowest of them, within 3 degrees either side)
_wide = np.min([(np.abs(_pol - h_) < 1.0).sum(0) * 0.2 for h_ in (1.6, -8.8, -17.7)], 0); _wide = ndi.minimum_filter1d(_wide, int(math.radians(6) / 0.004) | 1, mode='wrap')
_at = lambda th: _wide[int((th % (2 * math.pi)) / 0.004) % len(_tt)]
PIT_TURN = max((math.radians(d_) for d_ in range(0, 360, 2)), key=lambda t_: min(_at(TH_R - t_), _at(SIDE[0] - t_), _at(SIDE[1] - t_)))
print(f'  the pit is turned {math.degrees(PIT_TURN):.0f} degrees: the shelves under the three streams are at least {min(_at(TH_R - PIT_TURN), _at(SIDE[0] - PIT_TURN), _at(SIDE[1] - PIT_TURN)):.1f} m wide')
PIT_SHIFT = FLOOR - PIT_RIM                                          # (its rim comes to the bowl's floor)
pit_s = ndi.map_coordinates(_pol, [(np.clip(r_bowl, _rr[0], _rr[-1]) - _rr[0]) / 0.2, ((a_bowl - PIT_TURN) % (2 * math.pi)) / 0.004], order=1, mode='grid-wrap') + PIT_SHIFT
_w = sm(0.3, 1.5, H - pit_s) * (r_bowl < PIT_BRINK + 5)
H = H * (1 - _w) + pit_s * _w
pit_in = _w > 0.5                                                    # inside the pit: past its brink


def brink_at(th):
    """how far from the pit's middle its brink lies, the way th"""
    rr = np.arange(BOWL_R - 3, 20, -0.2)
    return float(rr[(sample(H, np.array([polar(th, r) for r in rr])) < FLOOR - 3).argmax()])


# Where the three waters come to the pit, the top of their way down is a cascade: low steps with a small pool on each, in
# place of one tall fall. From the bowl's floor down to the pit's first shelf the steps are let into the floor, back from
# the brink (the shelf below is too narrow to build them out onto); and where a side brook comes over the bowl's cliff, into
# that cliff. A step is a level bench CASC_RUN metres long, the face above it included; CASC_N benches between one level and
# the next, so CASC_N + 1 falls. Each is a bench with a pool on it and the water falling free over its edge: wider than the
# water, with rock either side, not a chute. The way round the pit crosses each water by a plank bridge on the strip of
# floor above its steps. (b: the pit's brink as drawn, the way th; nb: the floor's new brink, at the head of the steps; rb:
# where the bridge lies; rf, rh: the foot and the head of the steps in the bowl's cliff; all metres from the pit's middle)
CASC_RUN, CASC_FACE, CASC_N = 3.7, 0.45, 2


def cliff_foot(th):
    """how far from the pit's middle the bowl's cliff stands, the way th"""
    rr = np.arange(BOWL_R - 10, BOWL_R + 12, 0.2)
    return float(rr[(sample(H, np.array([polar(th, r) for r in rr])) > FLOOR + 2.0).argmax()])


def cascade(th, half, from_meadow, sunk=0.0):
    b = brink_at(th); c = {'th': th, 'half': half, 'sunk': sunk, 'b': b, 'nb': b + CASC_N * CASC_RUN}; c['rb'] = c['nb'] + 2.4
    if from_meadow: c['rf'] = max(cliff_foot(th), c['rb'] + 4.4); c['rh'] = c['rf'] + CASC_N * CASC_RUN
    return c


CASC = [cascade(TH_R, 3.0, False, sunk=FLOOR - RL - 0.12)] + [cascade(th, 1.9, True) for th in SIDE]      # the river, the east brook, the west brook (half: half the width of the pools on its steps)
RIVER_MOUTH = polar(TH_R, CASC[0]['nb'] + 4.0)                       # the river's line ends here, 4 m short of the head of its steps (the lip itself is found from the land, in 6)
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
# the windmill, of the kit like the other houses: a tower, the miller's house against its south wall, and on its west face
# (toward the way up from the village) the sails, which are the supplied model's (hub: how high above the tower's foot they
# turn; span: tip to tip; out: how far in front of the tower's middle)
WMILL = M(.70, .56); WM_YAW = -math.pi / 2
house('mill_tower', WMILL, dict(w=4, l=4, floors=3, wall='brick', upper='plaster', tower=True, door='left', seed=31, windows=0.4, chimney=False), WM_YAW, pad=9.0)
house('mill_house', (WMILL[0] + 2.0, WMILL[1] + 4.0), dict(w=4, l=6, floors=1, wall='plaster', door='front', seed=32, windows=0.6), WM_YAW, pad=1)
B.append({'id': 'windmill', 'kind': 'sails', 'x': WMILL[0], 'z': WMILL[1], 'yaw': round(WM_YAW, 3), 'hub': 7.6, 'span': 10.4, 'out': 2.8, 'pad': 1})
B.append({'id': 'fountain', 'kind': 'well', 'x': PLAZA[0] - 0.8, 'z': PLAZA[1] - 3.0, 'yaw': 0.4, 'pad': 3.2})      # (beside the road through the market, not on it)
B.append({'id': 'great_tree', 'kind': 'tree', 'x': M(.55, .345)[0], 'z': M(.55, .345)[1], 'type': 'oak', 'scale': 2.3, 'pad': 4.5, 'shape': 1162, 'turn': 3.83863})      # (not in the written plan: its yard and the ways round it are laid out by it. shape, turn: which oak, how turned, should it stand again)

# ------------------------------------------------------------------ 3. the water, as planned: stretches, each on its own level
# (name, the terrace it lies on, how far under that terrace the water stands, how deep its bed is pressed, the line: (u, v,
# half-width in metres as drawn)). The two streams are shallow enough to wade (she will not walk into water deeper than half a
# metre); the river and the valley's river are not: the river is crossed by the stone bridge, the valley's by planks.
mv = lambda x, z, half: (*uvm(x, z), half / S)                        # a point of a line given in metres
WATER = [
    ('upper_stream', 27, 0.35, 0.3, [(.085, .365, 4.2), (.13, .385, 3.0), (.165, .40, 2.0), (.19, .41, 2.1)]),
    ('mill_stream', 18, 0.35, 0.3, [(.235, .445, 2.6), (.265, .455, 2.2), (.30, .485, 2.2), (.34, .50, 2.2), (.37, .53, 2.5)]),
    ('river', 10, 1.1, 1.0, [(.40, .585, 4.2), (.425, .615, 3.8), (.4625, .6375, 3.8), (.50, .665, 4.6), (.55, .675, 5.4), (.60, .695, 6.4), (.645, .705, 6.4), (.68, .74, 6.0)]),
    # the valley's river: a plunge pool under the great fall, then winding down the floor, into the bowl and to the pit's brink
    ('valley_river', 3, 0.8 + DROP, 1.2, [mv(*(LIP + RIVER_DIR * 9.0), 6.5), mv(*BASIN, 8.2), mv(float(Xc(19)), ZH + 19, 7.2), mv(float(Xc(26)), ZH + 26, 5.2)]
     + [mv(float(RIV(s)), ZH + s, 3.9 + 0.3 * math.sin(s / 9)) for s in range(33, int(VLEN) - 6, 6)] + [mv(*RIVER_MOUTH, 3.4)]),
]
# (the stretches in the pit are added in 6, where the land they lie on is known: down the shelves from the river's mouth, and
# the two side brooks: across the meadow, down into the bowl, over its floor and down the shelves)
_rl = WATER[3][4]; _rz = [M(u, v)[1] for u, v, _ in _rl]
riv_x = lambda z: float(np.interp(z, _rz, [M(u, v)[0] for u, v, _ in _rl]))      # the valley river's middle at z, and half its width
riv_h = lambda z: float(np.interp(z, _rz, [hw * S for _, _, hw in _rl]))
# the water mill stands on the mill stream's north bank, its wheel in the water
ms = WATER[1][4]; a, b = np.array(M(*ms[2][:2])), np.array(M(*ms[3][:2])); t = (b - a) / np.linalg.norm(b - a); nrm = np.array([t[1], -t[0]])
if nrm[1] > 0: nrm = -nrm                                             # the bank toward the north
s0 = a + (b - a) * 0.35; mill_yaw = math.atan2(t[0], t[1])            # ridge along the stream
WHEEL = s0 + nrm * (ms[2][2] - 0.45); MILL = s0 + nrm * (ms[2][2] + 1.3 + 2.0)      # (the wheel half a metre into the water: its race is cut into the bank under it, in 6)
house('watermill', (float(MILL[0]), float(MILL[1])), dict(w=4, l=6, floors=2, wall='brick', door='front', seed=24, windows=0.5), mill_yaw)
MILL_T, MILL_N = t.copy(), nrm.copy()                                # (along the mill stream there, and out to its north bank)

# the houses and small things moved by hand in the game (place-editor.js; the moves sent from there are kept in
# hill-village-moves.json beside the plan): each is put where it was moved to, before the ground is levelled under it. A move
# finds its thing where it was when it was moved; if the tool has put it somewhere else since, the move is out of date and left
_mv_file = OUT / 'hill-village-moves.json'
MOVES = json.loads(_mv_file.read_text())['moves'] if _mv_file.exists() else []
for m in MOVES:
    b_ = next((q for q in B if q['id'] == m['id']), None)
    if b_ is None: continue                                              # (a small thing: in 8)
    (fx_, fz_, _), (tx_, tz_, ty_) = m['from'], m['to']
    if abs(b_['x'] - fx_) > 0.06 or abs(b_['z'] - fz_) > 0.06: print(f"  ! the move of {m['id']} is out of date: it is no longer at {fx_}, {fz_}"); continue
    if b_['id'] == 'mill_tower':                                         # the windmill's sails go with its tower
        s_ = next(q for q in B if q['kind'] == 'sails'); d_ = ty_ - b_['yaw']; c_, sn_ = math.cos(d_), math.sin(d_); ox_, oz_ = s_['x'] - b_['x'], s_['z'] - b_['z']
        s_['x'], s_['z'], s_['yaw'] = tx_ + ox_ * c_ + oz_ * sn_, tz_ - ox_ * sn_ + oz_ * c_, round(s_['yaw'] + d_, 3)
    b_['x'], b_['z'] = tx_, tz_
    if b_['kind'] != 'tree': b_['yaw'] = ty_
    print(f"  moved by hand: {m['id']} to {tx_}, {tz_}")
for b_ in B:
    if b_['pad'] > 1.5: b_['y'] = round(level_ground(b_['x'], b_['z'], b_['pad']), 2)
by_id = {b_['id']: b_ for b_ in B}
by_id['castle_hall']['y'] = by_id['castle_keep']['y']

# ------------------------------------------------------------------ 4. fields (fenced) and the pasture
FIELDS = [   # centre, size across x and z, yaw, what grows
    {'id': 'west_field_1', 'at': M(.076, .705), 'w': 15, 'd': 9.5, 'yaw': 0.0, 'crop': 'cabbage'},
    {'id': 'west_field_2', 'at': M(.076, .775), 'w': 15, 'd': 9.5, 'yaw': 0.0, 'crop': 'carrot'},
    {'id': 'mill_field', 'at': (WMILL[0], WMILL[1] - 10.8), 'w': 15.5, 'd': 7.5, 'yaw': 0.0, 'crop': 'wheat'},      # on the windmill's ledge, north of the mill
]
for f in FIELDS:
    f['x'], f['z'] = round(f['at'][0], 2), round(f['at'][1], 2); del f['at']


def rect(x, z, w, d_, yaw=0.0):
    c, s = math.cos(yaw), math.sin(yaw)
    return [R2((x + lx * c + lz * s, z - lx * s + lz * c)) for lx, lz in [(-w / 2, -d_ / 2), (w / 2, -d_ / 2), (w / 2, d_ / 2), (-w / 2, d_ / 2)]]


wf = (FIELDS[0]['x'], (FIELDS[0]['z'] + FIELDS[1]['z']) / 2)
FENCES = [
    {'id': 'pasture', 'points': [R2(M(.755, .315)), R2(M(.91, .31)), R2(M(.915, .41)), R2(M(.76, .41))], 'gate': 3},       # (gate: in the middle of which side)
    {'id': 'west_fields', 'points': rect(wf[0], wf[1], 18, 24), 'gate': 1},
    {'id': 'mill_field', 'points': rect(FIELDS[2]['x'], FIELDS[2]['z'], 18, 10, FIELDS[2]['yaw']), 'gate': 3},
]


def lie(points, step=0.5):
    """the ground along a closed line and inside it: (lowest, highest, the steepest rise along the line, metres up per metre)"""
    P_ = [np.array(q, float) for q in points]; along = []
    for a_, b_ in zip(P_, P_[1:] + P_[:1]):
        n_ = max(2, int(np.linalg.norm(b_ - a_) / step)); along.append(sample(H, np.array([a_ + (b_ - a_) * k / n_ for k in range(n_ + 1)])))
    c_ = sum(P_) / len(P_); inside = sample(H, np.array([c_ + (q - c_) * t_ for q in P_ for t_ in np.arange(0.1, 1.0, 0.1)]))
    every = np.concatenate(along + [inside])
    return float(every.min()), float(every.max()), float(max(np.abs(np.diff(g_)).max() for g_ in along) / step)


# a field is tilled ground: made even, if it is nearly so. A field or a fence across a cliff is a mistake in this plan (the
# crop and the rails would climb the rock): said out loud here, and again at the end, on the land as it is written
for f in FIELDS:
    fence = next(q for q in FENCES if q['id'] == f['id'] or (q['id'] == 'west_fields' and f['id'].startswith('west_field')))
    lo_, hi_, _ = lie(rect(f['x'], f['z'], f['w'] + 2, f['d'] + 2, f['yaw']))
    if hi_ - lo_ > 2.5: print(f"  ! field {f['id']} lies across a cliff: its ground is {lo_:.1f} .. {hi_:.1f} m"); continue
    c_, s_ = math.cos(f['yaw']), math.sin(f['yaw']); u_ = (WX - f['x']) * c_ - (WZ - f['z']) * s_; v_ = (WX - f['x']) * s_ + (WZ - f['z']) * c_
    out_ = np.maximum(np.abs(u_) - f['w'] / 2 - 1.0, np.abs(v_) - f['d'] / 2 - 1.0)
    w_ = 1 - sm(0.0, 2.5, out_); H = H * (1 - w_) + float(np.median(H[out_ < 0])) * w_

# ------------------------------------------------------------------ 5. the two bridges and the ways (ramps where they climb)
BRIDGE_C = np.array(M(.4625, .6375)); BRIDGE_DIR = np.array([1.0, -1.0]) / math.sqrt(2); BRIDGE_LEN = 13.0
BS, BN = BRIDGE_C - BRIDGE_DIR * BRIDGE_LEN / 2, BRIDGE_C + BRIDGE_DIR * BRIDGE_LEN / 2
even_ends(BS, BN)                                                     # the stone bridge: both its ends stand at one height
# the plank bridge over the valley's river: about the middle of the valley's floor, halfway between the great fall and the
# bridge at the pit's brink (it stood at ZH + 86, twenty metres from that one: too near it), and square to the river there
PLANK_S = 54.0; PLANK_Z = ZH + PLANK_S; PLANK_X = riv_x(PLANK_Z); PLANK_LEN = round(2 * riv_h(PLANK_Z) + 4.6, 1)
_pt = np.array([1.0, -(riv_x(PLANK_Z + 2) - riv_x(PLANK_Z - 2)) / 4]); _pt /= np.linalg.norm(_pt)      # across the river: toward its east bank
PLANK_YAW = math.atan2(-_pt[1], _pt[0])                               # (a bridge lies along its own x: toward (cos yaw, -sin yaw))
PW, PE = np.array([PLANK_X, PLANK_Z]) - _pt * PLANK_LEN / 2, np.array([PLANK_X, PLANK_Z]) + _pt * PLANK_LEN / 2
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
RING_R = PIT_BRINK + 6.0                                              # the way round the pit: this far from its middle; at each water it swings out to the bridge
_turn = lambda a_: (a_ + math.pi) % (2 * math.pi) - math.pi          # an angle brought to -pi..pi
ring_r = lambda th: RING_R + sum(max(0.0, c['rb'] - RING_R) * (1 - float(sm(5.0, 14.0, abs(_turn(th - c['th'])) * RING_R))) for c in CASC)
ring_at = lambda th: polar(th, ring_r(th))
# a plank bridge over each of the three waters, on the strip of floor above its steps: across the water, square to it (a:
# its end on the side the angle round the pit is less, b: the other)
PLANKS = []
for c, hw_ in zip(CASC, (3.4, 1.6, 1.6)):
    mid = np.array(polar(c['th'], c['rb'])); t_ = np.array([-math.sin(c['th']), math.cos(c['th'])]); L_ = round(2 * hw_ + 4.6, 1)
    PLANKS.append({'mid': mid, 'a': mid - t_ * L_ / 2, 'b': mid + t_ * L_ / 2, 'len': L_, 'yaw': math.atan2(-t_[1], t_[0]), 'th': c['th'], 'reach': (L_ / 2 + 2.0) / c['rb']})
    even_ends(PLANKS[-1]['a'], PLANKS[-1]['b'], 1.6, 1.6)
J_E, J_W = ring_at(TH_R + math.radians(14)), ring_at(TH_R - math.radians(14))      # where the ways down the valley's two banks come to it
RING = []                                                             # the way round, in three arcs: each from one bridge's end to the next bridge
_order = sorted(PLANKS, key=lambda p_: (p_['th'] - TH_R) % (2 * math.pi))
for p_, q_ in zip(_order, _order[1:] + _order[:1]):
    a0 = p_['th'] + p_['reach']; a1 = a0 + (q_['th'] - q_['reach'] - a0) % (2 * math.pi)
    angs = list(np.linspace(a0, a1, max(2, int(math.degrees(a1 - a0) / 9) + 1)))
    for j_ in (TH_R + math.radians(14), TH_R - math.radians(14)):
        jj = a0 + (j_ - a0) % (2 * math.pi)
        if jj < a1: angs = sorted([a_ for a_ in angs if abs(a_ - jj) > math.radians(3.5)] + [jj])
    RING.append([tuple(p_['b'])] + [ring_at(a_) for a_ in angs] + [tuple(q_['a'])])
PIT_SOUTH = ring_at(math.radians(97))                                # a spot on the far side of the pit from the valley
PIT_NORTH = ring_at(TH_R - math.radians(27))                         # and one on the near side, west of the river
# a spot at the end of the west brook's bridge, to look up its steps from (the steps let into the floor are seen from the
# bridges, looking down, and from across the pit)
_p, _c = PLANKS[2], CASC[2]; CASCADE_VIEW = tuple(_p['a'] + (_p['a'] - _p['mid']) / np.linalg.norm(_p['a'] - _p['mid']) * 1.2); CASCADE_MID = polar(_c['th'], _c['rf'] + CASC_RUN)
_ar = np.arange(BOWL_R + 16, BOWL_R - 2, -0.2); _ap = np.array([polar(math.radians(150), r_) for r_ in _ar])
PIT_ABOVE = polar(math.radians(150), float(_ar[(sample(H_before, _ap) - sample(H, _ap) > 0.3).argmax()]) + 2.2)      # and one up on the meadow, at the bowl's brink (2.2 m back from where the land breaks off)
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
    'to_mill_field': (0.8, [(.60, .535), (.622, .509), (.639, .4925)]),
    # ways to the parts of the map no door stands on, so all of it can be walked: the west wood and its spring; down the cliff
    # below the village to the meadow and along the valley's brink to the top of the way down; and from the windmill's ledge
    # through the east wood to a lookout on the valley's east brink
    'to_west_wood': (1.0, [(.54, .375), (.48, .385), (.43, .385), (.38, .375), (.32, .36), (.26, .35), (.20, .335), (.14, .345), (.125, .345)]),
    'to_valley': (1.0, [(.39, .685), (.45, .73), (.50, .765), (.545, .79), uvm(6.5, 55.0), uvm(5.5, 64.0), uvm(RAMP_TOP[0] - 3.5, RAMP_TOP[1] - 6.0), uvm(*RAMP_TOP)]),
    'to_lookout': (1.0, [(.74, .56), (.77, .555), (.83, .57), (.88, .60), (.92, .66), (.915, .72), uvm(LOOKOUT[0] - 1.0, LOOKOUT[1] - 15.0), uvm(LOOKOUT[0] + 1.0, LOOKOUT[1] - 7.0), uvm(*LOOKOUT)]),
    # and in the valley: down the cliff to the floor, and back up the west bank to the plank bridge in the valley's middle; from
    # the bridge up the east bank to the foot of the great fall, and down both banks to the pit
    'valley_ramp': (1.1, [uvm(*p) for p in RAMP]),
    'valley_floor': (1.0, [uvm(*RAMP_FOOT), uvm(*west_bank(RAMP_B - 7)), uvm(*west_bank((RAMP_B + PLANK_S) / 2)), uvm(*west_bank(PLANK_S + 7)), uvm(*PW)]),
    'valley_east': (0.9, [uvm(*PE)] + [uvm(*east_bank(s_)) for s_ in (PLANK_S - 6, 38)] + [uvm(*east_bank(29, 3.5)), uvm(*east_bank(22, 3.5)), uvm(*FALL_FOOT)]),
    # and on to the pit: down each bank to the bowl, and all the way round the pit's brink, over a plank bridge at each of the
    # three waters (the river, and the two side brooks)
    'valley_south': (0.9, [uvm(*RAMP_FOOT), uvm(*west_bank(RAMP_B + 6)), uvm(*west_bank(92)), uvm(*west_bank(98)), uvm(*J_W)]),
    'valley_east_south': (0.9, [uvm(*PE)] + [uvm(*east_bank(s_)) for s_ in (PLANK_S + 7, 70, 78, 86, 92, 98)] + [uvm(*J_E)]),
    **{f'pit_ring_{i_ + 1}': (1.0, [uvm(*p_) for p_ in arc_]) for i_, arc_ in enumerate(RING)},
}
YARDS = [[*R2(PLAZA), 6.5, 1], [*R2(TREE_YARD), 5.0, 0], [*R2(M(.385, .158)), 3.0, 1], [*R2(M(.565, .158)), 2.6, 1], [*R2(door_of('barn', 2.0)), 2.6, 0],
         [*R2(LOOKOUT), 2.2, 0], [*R2(PIT_SOUTH), 2.4, 0], [*R2(PIT_ABOVE), 2.4, 0], [*R2(FALL_FOOT), 2.6, 0]]     # x, z, radius, paved?
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


WAY_STEEP = 0.30                                                     # the steepest a way may climb (rise over run)


def way_profile(hp, arc, pin=(True, True)):
    """the height of a way along its line: as near the land under it as it can lie and still be walked (never steeper than
    WAY_STEEP). Where the land is gentler it is the land itself, a little smoothed; where the land is steeper the way is cut
    into the top of the slope and laid on a bank at its foot, half and half, over just as long as the climb needs. So a way
    goes up a hill on the hill, and across a level village at the village's level - not on a straight ramp from one end to
    the other, which stood the village's road on a bank 5 m over the houses on either side. An end that is pinned lies on
    the land, so a way meets the plaza, the bridge or the way it comes from at the height it had before (an end out past the
    edge of the play is not: the road coming in from beyond it only has to arrive)"""
    s_ = WAY_STEEP * 0.97; d = s_ * STEP
    lo = hp.copy(); hi = hp.copy()                                   # the highest walkable line under the land (all cut) and the lowest over it (all bank)
    for i in range(1, len(hp)): lo[i] = min(lo[i], lo[i - 1] + d); hi[i] = max(hi[i], hi[i - 1] - d)
    for i in range(len(hp) - 2, -1, -1): lo[i] = min(lo[i], lo[i + 1] + d); hi[i] = max(hi[i], hi[i + 1] - d)
    hs = ndi.gaussian_filter1d((lo + hi) / 2, 2.5 / STEP, mode='nearest')      # (smoothing keeps it no steeper)
    A = np.full(len(hp), -1e9); B = np.full(len(hp), 1e9)            # the band a line from the pinned ends can lie in, climbing no steeper
    for end, k, on in ((0, arc, pin[0]), (-1, arc[-1] - arc, pin[1])):
        if on: A = np.maximum(A, hp[end] - s_ * k); B = np.minimum(B, hp[end] + s_ * k)
    if (A > B + 1e-6).any(): print(f'  ! a way climbs {abs(hp[-1] - hp[0]):.1f} m in {arc[-1]:.0f} m: steeper than it may')
    return np.clip(hs, A, np.maximum(A, B))


path_d = np.full(NZ * NX, 1e9); plan_paths = []
BANK_SIDE = 2.6                                                      # a bank h m high has sides 2.6 h m wide: no steeper than about a half
keep_land = np.zeros((NZ, NX), bool)
for b_ in B: keep_land |= np.hypot(WX - b_['x'], WZ - b_['z']) < b_['pad'] + 1.0
for _, _, _, _, line_ in WATER:
    for u_, v_, hw_ in line_:
        x_, z_ = M(u_, v_); keep_land |= np.hypot(WX - x_, WZ - z_) < hw_ * S + 4.0
for name, (half, pts_uv) in PATHS.items():
    pts = [M(*p) for p in pts_uv]
    P = densify(pts); hp = sample(H, P); arc = np.arange(len(P)) * STEP
    hs = way_profile(hp, arc, [bool(PLAY[0] < x < PLAY[1] and PLAY[2] < z < PLAY[3]) for x, z in (P[0], P[-1])])
    print(f'  way {name}: {hs[0]:.1f} -> {hs[-1]:.1f} m, steepest {np.abs(np.diff(hs)).max() / STEP * 100:.0f}%')
    # where the way stands over the land, or is sunk in it (it must be, to climb a cliff gently enough), the bank's or the
    # cutting's sides run out BANK_SIDE times as far as it is high or deep: a slope of earth and grass, not a wall of rock
    bank, cut = np.maximum(hs - hp, 0), np.maximum(hp - hs, 0)
    side = np.clip(BANK_SIDE * np.maximum(bank, cut), 3.0, 16.0)
    at, dd, idx = nearest(P, half + side.max() + 0.2)
    w = np.clip(1 - (dd - half) / 3.0, 0, 1); w = w * w * (3 - 2 * w)
    flat = H.ravel(); old = flat[at].copy(); flat[at] = old * (1 - w) + hs[idx] * w
    sw = np.clip(1 - (dd - half) / side[idx], 0, 1); sw = sw * sw * (3 - 2 * sw)
    sw[keep_land.ravel()[at]] = 0                                    # (never over a house's pad, the yards round the fountain and the great tree, or the water's banks)
    to = old * (1 - sw) + hs[idx] * sw
    up = bank[idx] > 0                                               # (a bank's sides only ever raise the land, a cutting's only lower it)
    flat[at] = np.where(up, np.maximum(flat[at], to), np.minimum(flat[at], to))
    H = flat.reshape(NZ, NX)
    path_d[at] = np.minimum(path_d[at], dd - half)
    plan_paths.append({'id': name, 'half': half, 'points': [R2(p) for p in pts]})
path_d = path_d.reshape(NZ, NX)
# the ways painted by hand in the game (path-brush.js: the strokes sent from there are kept in hill-village-paths.json beside the
# plan): the plan carries them as they are (the game paints them on the ground, the map's picture draws them), and nothing is
# planted on a painted way (paving is a way with stones laid in it: the same). (Grass painted over a way in the game only hides
# it: the land under it is left as the way made it.)
_po_file = OUT / 'hill-village-paths.json'
PATH_OPS = json.loads(_po_file.read_text())['ops'] if _po_file.exists() else []
for o_ in PATH_OPS:
    if o_['k'] not in ('way', 'pave') or len(o_['pts']) < 2: continue
    P_ = densify([tuple(p_) for p_ in o_['pts']]); at_, dd_, _ = nearest(P_, o_['half'] + 0.5)
    pd_ = path_d.ravel(); pd_[at_] = np.minimum(pd_[at_], dd_ - o_['half']); path_d = pd_.reshape(NZ, NX)
if PATH_OPS: print(f'  painted by hand: {sum(o_["k"] == "way" for o_ in PATH_OPS)} ways, {sum(o_["k"] == "pave" for o_ in PATH_OPS)} of paving, {sum(o_["k"] == "grass" for o_ in PATH_OPS)} strokes of grass')
for x, z, r, _ in YARDS: path_d = np.minimum(path_d, np.hypot(WX - x, WZ - z) - r)

# ------------------------------------------------------------------ 5b. the steps of the three cascades, cut into the land
# (after the ways, so no way's grading blurs their edges; before the water, which is then laid on them as on any terrace)
_cr = np.random.default_rng(57)                                      # (dice of its own: the rest of the land is thrown as before)
_lumps = lambda cell: ndi.zoom(_cr.random((int(NZ * MPP / cell) + 4, int(NX * MPP / cell) + 4)), cell / MPP, order=3)[:NZ, :NX]
crag_a, crag_b = _lumps(3.0), _lumps(6.5)


def steps_down(rho, lat, r0, grounds, low, half):
    """the land cut to a stair along one line from the pit's middle: rho metres out along it, lat metres to its side. From r0
    outward: a bench at each of `grounds` (lowest first), each CASC_RUN long with its face; inside r0 the ground is `low`
    (None: left as it is). Each bench is as wide as the water's pool and 1.5 m of rock either side; from there its sides
    stand back as they rise, as a gully's do (steep, and craggy), so it is widest at the top and toward its foot"""
    global H
    n = len(grounds); head = r0 + n * CASC_RUN
    rr = rho + 0.22 * np.sin(lat * 1.9 + r0) + 0.12 * np.sin(lat * 4.3 + 1.0)      # (the faces' lines wander a little)
    step_at = lambda k: sm(r0 + k * CASC_RUN - CASC_FACE, r0 + k * CASC_RUN, rr)      # 0 below the face that stands k steps out, 1 above it
    T = np.full(H.shape, grounds[0]) if low is None else low + (grounds[0] - low) * step_at(0)
    for k in range(1, n): T = T + (grounds[k] - grounds[k - 1]) * step_at(k)
    T = T + (H - grounds[-1]) * step_at(n)                           # past its head: the land as it is
    W = half + 1.5 + (crag_b - .5) * 1.6
    cut = T + np.clip(np.abs(lat) - W, 0, None) * (2.2 + 1.6 * crag_a)      # the sides: two to four metres up for each metre out
    at = (rho < head + 1.0) & (rho > r0 - (6.0 if low is None else 2.4)) & (np.abs(lat) < W + 9.0)
    H = np.where(at, np.minimum(H, cut), H)


for c in CASC:
    th = c['th']; rho = (WX - BOWL[0]) * math.cos(th) + (WZ - BOWL[1]) * math.sin(th); lat = -(WX - BOWL[0]) * math.sin(th) + (WZ - BOWL[1]) * math.cos(th)
    g_floor = float(sample(H, polar(th, c['nb'] + 1.5))[0])
    g_shelf = float(np.median(sample(H, np.array([polar(th, r_) for r_ in np.arange(c['b'] - 3.4, c['b'] - 1.5, 0.2)]))))
    g_from = g_floor - c['sunk']                                      # (the river stands well under the floor: its steps are measured from its own bed's edge, so its falls come out even)
    c['grounds'] = [g_from + (g_shelf - g_from) * k / (CASC_N + 1) for k in range(CASC_N, 0, -1)]      # the benches' ground, lowest first
    steps_down(rho, lat, c['b'], c['grounds'], None, c['half'])
    if 'rf' in c:                                                     # and a side brook's steps down the bowl's cliff, from the meadow
        g_meadow = float(sample(H, polar(th, c['rh'] + 2.0))[0])
        c['grounds_up'] = [g_meadow + (g_floor - g_meadow) * k / (CASC_N + 1) for k in range(CASC_N, 0, -1)]
        steps_down(rho, lat, c['rf'], c['grounds_up'], g_floor + 0.05, c['half'])
    print(f"  cascade at {math.degrees(th):.0f} deg: brink {c['b']:.1f} -> {c['nb']:.1f} m, bridge at {c['rb']:.1f}, steps at {', '.join(f'{g_:.1f}' for g_ in c['grounds'][::-1])} m"
          + (f"; from the meadow: cliff cut back to {c['rf']:.1f}..{c['rh']:.1f}, steps at {', '.join(f'{g_:.1f}' for g_ in c['grounds_up'][::-1])} m" if 'rf' in c else ''))

# ------------------------------------------------------------------ 6. the water laid on the land: beds, and falls where a terrace ends
H0 = H.copy()
# each stretch: its level, how deep its bed, its line; next: the stretch its water falls into (None: none); deep_end: it ends by
# falling into the pit's mist; fed: it begins under a fall
tiers = []
for name, terrace, under, deep, line in WATER:
    tiers.append({'name': name, 'level': terrace * S - under, 'deep': deep, 'pts': [M(u, v) for u, v, _ in line], 'half': [hw * S for _, _, hw in line], 'next': len(tiers) + 1, 'deep_end': False})
tiers[-1]['next'] = None


def shelf_runs(th, r_from):
    """walking in toward the pit's middle along th, from r_from on the bowl's floor: the level runs met (the floor, then each step and shelf): (outer r, inner r, height)"""
    rr = np.arange(r_from, 9.0, -0.2); g = sample(H0, np.array([polar(th, r) for r in rr])); level = np.abs(np.gradient(g, 0.2)) < 0.6
    runs = []; i = 0
    while i < len(rr):
        j = i
        while level[i] and j + 1 < len(rr) and level[j + 1]: j += 1
        if level[i] and rr[i] - rr[j] >= 1.6: runs.append((float(rr[i]), float(rr[j]), float(np.median(g[i:j + 1]))))
        i = j + 1
    return runs


def stretch(name, pts, half, under=0.35, deep=0.3):
    """a stretch laid on the land as it lies: its level a little under the ground along its line"""
    P = densify(pts, step=0.5); tiers.append({'name': name, 'level': round(float(np.median(sample(H0, P))) - under, 2), 'deep': deep, 'pts': list(pts), 'half': list(half), 'next': None, 'deep_end': False})
    return len(tiers) - 1


def down_the_pit(c, half, name, feeder):
    """the water of stretch `feeder`, which comes to the head of the steps of cascade c, goes on down the pit: a pool on each
    step, a stretch on each of the first three shelves, and from the third into the mist"""
    th = c['th']; runs = shelf_runs(th, c['nb'] + 2.5); n = CASC_N + 3
    assert len(runs) > n and all(a_[2] - b_[2] > 3 for a_, b_ in zip(runs, runs[1:n + 1])), (name, runs)
    for k, (r_out, r_in, h_) in enumerate(runs[1:n + 1]):
        step = k < CASC_N
        i = stretch(f'{name}_step_{k + 1}' if step else f'{name}_shelf_{k + 1 - CASC_N}', [polar(th, r_out - min(1.0, (r_out - r_in) * 0.25)), polar(th, r_in + 0.5)], [c['half'] if step else half] * 2, under=0.12)
        tiers[feeder]['next'] = i; feeder = i
    tiers[feeder]['deep_end'] = True


down_the_pit(CASC[0], 2.6, 'river', len(tiers) - 1)
for n_, c in enumerate(CASC[1:]):                                     # the side brooks: a spring on the meadow, down the bowl's cliff in steps, across its floor (under the bridge), down the pit
    th = c['th']
    i_ = stretch(f'brook_{n_ + 1}_meadow', [polar(th + 0.07, c['rh'] + 21), polar(th + 0.085, c['rh'] + 15), polar(th + 0.02, c['rh'] + 8.5), polar(th, c['rh'] + 2.5)], [2.4, 1.5, 1.6, 1.6])      # (a spring's pool, and a bend on its way to the cliff)
    for k in range(CASC_N):                                           # the pools on its steps down the cliff, the highest first
        r_in = c['rh'] - (k + 1) * CASC_RUN; r_out = r_in + CASC_RUN - CASC_FACE
        j_ = stretch(f'brook_{n_ + 1}_cliff_step_{k + 1}', [polar(th, r_out - 0.8), polar(th, r_in + 0.5)], [c['half']] * 2, under=0.12)
        tiers[i_]['next'] = j_; i_ = j_
    i_b = stretch(f'brook_{n_ + 1}_bowl', [polar(th, c['rf'] - 1.2), polar(th, c['nb'] + 3.0)], [1.6, 1.6], deep=0.2)
    tiers[i_]['next'] = i_b; down_the_pit(c, 1.5, f'brook_{n_ + 1}', i_b)
# A fall parted by rocks: where a river goes over a ledge, rocks standing in its lip part the water into strands, and the cliff
# under each rock is left standing as a rib between them (so a wide fall is not one flat sheet). For each stretch named: the
# rocks across its lip: (where across the water: -1 one bank .. 1 the other; how wide the rock is, metres; how big its boulder)
SPLIT = {'river': [(-0.27, 1.3, 1.15), (0.48, 1.0, 0.95)]}
for t_ in tiers: t_['fed'] = False
for t_ in tiers:
    if t_['next'] is not None: tiers[t_['next']]['fed'] = True
falls = []
for i_, up in enumerate(tiers):
    if up['next'] is not None:
        low = tiers[up['next']]
        a_, b_ = np.array(up['pts'][-1]), np.array(low['pts'][0]); L = np.linalg.norm(b_ - a_); dirn = (b_ - a_) / L
        ext = np.array([a_ + dirn * s_ for s_ in np.arange(-2, L + 6, 0.2)]); g = sample(H0, ext)
        on_top = np.nonzero(g >= up['level'] - 0.9)[0]; lip_i = on_top[-1] if len(on_top) else 0
        foot = np.nonzero((np.arange(len(g)) > lip_i) & (g <= low['level'] + 1.6))[0]; foot_i = foot[0] if len(foot) else len(g) - 1
        lip, ft = ext[lip_i] + dirn * 0.8, ext[foot_i]               # (the bed runs a step out past the brink, so the fall clears the cliff's foot)
        up['pts'][-1] = tuple(lip); low['pts'][0] = tuple(ft + dirn * 0.5); low['half'][0] = low['half'][0] * 1.15
        falls.append({'x': round(float(lip[0]), 2), 'z': round(float(lip[1]), 2), 'top': round(up['level'], 2), 'bottom': round(low['level'], 2), 'width': round(2 * up['half'][-1] + 0.4, 2),
                      'yaw': round(float(math.atan2(dirn[0], dirn[1])), 3), 'deep': 0, 'from': i_, 'out': round(float(np.linalg.norm(ft - lip)), 2)})
        if up['name'] in SPLIT: falls[-1]['rocks'] = [[round(u_ * up['half'][-1], 2), w_, b_] for u_, w_, b_ in SPLIT[up['name']]]      # (metres across from the lip's middle, width, boulder)
        print(f"  fall {up['name']} -> {low['name']}: {up['level']:.1f} -> {low['level']:.1f} m, {np.linalg.norm(ft - lip):.1f} m out from the lip")
    elif up['deep_end']:                                              # into the mist: the lip is where its own shelf ends, along its own line
        a_ = np.array(up['pts'][-1]); dirn = a_ - np.array(up['pts'][-2]); dirn /= np.linalg.norm(dirn)
        ext = np.array([a_ + dirn * s_ for s_ in np.arange(-2, 8, 0.2)]); g = sample(H0, ext)
        on_top = np.nonzero(g >= up['level'] - 0.9)[0]; lip = ext[on_top[-1] if len(on_top) else 0] + dirn * 0.8
        up['pts'][-1] = tuple(lip)
        falls.append({'x': round(float(lip[0]), 2), 'z': round(float(lip[1]), 2), 'top': round(up['level'], 2), 'bottom': round(up['level'] - 42, 2), 'width': round(2 * up['half'][-1] + 0.4, 2),
                      'yaw': round(float(math.atan2(dirn[0], dirn[1])), 3), 'deep': 1, 'from': i_, 'out': 0})
        print(f"  fall {up['name']} -> the mist, from {up['level']:.1f} m")
for f_ in falls:                                                      # under each fall the cliff is sheer (water wears it back), so the sheet falls free: as wide as the water, out to its foot
    if f_['deep']: continue                                           # (and the floor there is the pool the fall has dug: the deeper the higher it falls from, see below)
    low = tiers[tiers[f_['from']]['next']]; D_ = 0.4 + min(1.4, 0.075 * (f_['top'] - f_['bottom']))
    dx_, dz_ = math.sin(f_['yaw']), math.cos(f_['yaw']); rx, rz = WX - f_['x'], WZ - f_['z']
    along = rx * dx_ + rz * dz_; side = rx * dz_ - rz * dx_; across = np.abs(side)
    w = np.clip((along - 0.25) / 0.5, 0, 1) * np.clip((f_['out'] + 1.2 - along) / 1.0, 0, 1) * np.clip((f_['width'] / 2 + 0.3 - across) / 0.6, 0, 1)
    for u_, w_, _ in f_.get('rocks', []): w = w * sm(w_ / 2 - 0.1, w_ / 2 + 0.5, np.abs(side - u_))      # (under a rock in its lip the cliff is left as it is: a rib between two strands)
    H = np.where(w > 0, np.minimum(H, H * (1 - w) + (low['level'] - D_) * w), H)
# The stretches that run a way of their own (not a cascade's step or a shelf of the pit: those are pools too short to have a
# shape) are made as water makes a bed, not pressed in to a rule (water_shape.py): the line drawn for each wanders a little;
# it is wide and shallow on a riffle and narrow and deep in a pool, the pools at its bends; in a bend its deepest lies
# against the outer bank, cut steep, and the inner side goes up slowly over its bar; under the fall that feeds it a round
# pool. Its water still stands level, at the stretch's height, and is as wide as its bed (the plan's rows say so, point by
# point). Kept as they are: its ends (the lip it leaves by, the fall it comes in under), the bridges, the mill's wheel; and
# it neither wanders nor widens toward anything that must stay dry (a house, a yard, a field, a way, a plant): it keeps
# the width drawn for it there. Where a way crosses it, it is a ford: shallow, both banks easy.
# (name: how far its line may wander, metres; how deep its riffles and its pools lie under its banks' foot (the river and the
# valley's are never shallow enough to wade: 1.05 m and more everywhere, as before; the streams always are, but under a fall)
SHAPED = {'upper_stream': (0.5, 0.18, 0.42), 'mill_stream': (0.45, 0.18, 0.42), 'river': (0.6, 1.0, 1.55), 'valley_river': (1.2, 1.15, 1.9),
          'brook_1_meadow': (0.5, 0.15, 0.36), 'brook_2_meadow': (0.5, 0.15, 0.36), 'brook_1_bowl': (0.35, 0.12, 0.3), 'brook_2_bowl': (0.35, 0.12, 0.3)}
LAND = WS.Land(WX, WZ, MPP)
rwat = np.random.default_rng(4409)                                   # (the water's own dice)
Hsoft = ndi.gaussian_filter(H, 3.0 / MPP)                            # (to say how high a bank stands over its water)
# what must stay dry, and so how much room the water has: houses (their pads), yards, fields, the plants as they stand
_dry = np.zeros((NZ, NX), bool)
for b_ in B: _dry |= np.hypot(WX - b_['x'], WZ - b_['z']) < b_['pad'] + 0.5
for x, z, r, _ in YARDS: _dry |= np.hypot(WX - x, WZ - z) < r + 0.3
for f_ in FIELDS:
    c_, s_ = math.cos(f_.get('yaw', 0.0)), math.sin(f_.get('yaw', 0.0)); rx_, rz_ = WX - f_['x'], WZ - f_['z']
    _dry |= (np.abs(rx_ * c_ - rz_ * s_) < f_['w'] / 2 + 0.5) & (np.abs(rx_ * s_ + rz_ * c_) < f_['d'] / 2 + 0.5)
_fol0 = OUT / 'hill-village-foliage.json'
STANDING = json.loads(_fol0.read_text())['plants'] if _fol0.exists() else []
_clear = {'oak': 2.0, 'broadleaf': 1.8, 'birch': 1.4, 'pine': 1.4, 'sapling': 1.2, 'bush': 0.9, 'flower': 0.8, 'clump': 0.8}
_pl = [(r_[1], r_[2], _clear.get(r_[0], 1.0)) for r_ in STANDING]
if _pl:
    _pt = cKDTree(np.array([(x, z) for x, z, _ in _pl])); _pd, _pi = _pt.query(np.column_stack([WX.ravel(), WZ.ravel()]), distance_upper_bound=4.0)
    _ok = np.isfinite(_pd); _dry.ravel()[np.flatnonzero(_ok)[_pd[_ok] < np.array([_pl[k][2] for k in _pi[_ok]])]] = True
ROOM = ndi.distance_transform_edt(~_dry) * MPP                       # metres to the nearest of them
ROCKS_KEPT = [r_ for r_ in (json.loads((OUT / 'hill-village-scatter.json').read_text())['rocks'] if (OUT / 'hill-village-scatter.json').exists() else []) if r_[0] != 'pebbles']
BRIDGES = [(float(BRIDGE_C[0]), float(BRIDGE_C[1]), BRIDGE_LEN / 2 + 1.0), (PLANK_X, PLANK_Z, PLANK_LEN / 2 + 1.0), (float(WHEEL[0]), float(WHEEL[1]), 6.0)] + \
          [(float(p_['mid'][0]), float(p_['mid'][1]), p_['len'] / 2 + 1.0) for p_ in PLANKS]


def shaped_bed(tr, name):
    """the bed of a stretch made as water makes it: -> its line (points DS apart), its profile (water_shape.profile), and the
    half width drawn for it at each point"""
    wander, shallow, deep = SHAPED[name]
    P0, A0 = densify(tr['pts'], [[hw] for hw in tr['half']], step=WS.DS)
    s0 = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P0, axis=0), axis=1))]
    room0 = sample(ROOM, P0); wayd0 = sample(path_d, P0)
    hold = [(x, z, r) for x, z, r in BRIDGES if np.hypot(P0[:, 0] - x, P0[:, 1] - z).min() < r + A0[:, 0].max() + 2]
    for k in range(0, len(P0), 10):                                  # (every 2 m: is anything that must stay dry, or a way, close by?)
        if room0[k] < A0[k, 0] + 2.4 or 0 < wayd0[k] < A0[k, 0] + 2.0: hold.append((float(P0[k, 0]), float(P0[k, 1]), 3.0))
    Q, s = WS.bed_line(rwat, tr['pts'], wander, hold, corners=3)      # (its drawn corners well rounded: a bed wider than a bend is tight folds across itself)
    drawn = np.interp(s / s[-1], s0 / s0[-1], A0[:, 0])
    on_way = sample(path_d, Q) < 0                                    # where a way crosses: a ford
    fords = []
    if on_way.any():
        runs = np.flatnonzero(np.diff(np.r_[0, on_way.astype(int), 0]))
        fords = [float(s[(a_ + b_ - 1) // 2]) for a_, b_ in zip(runs[0::2], runs[1::2])]
    # (under the fall that feeds it, the pool the fall dug: not for the valley's river, whose pool under the great fall is drawn)
    pr = WS.profile(rwat, Q, s, drawn, deep, falls=[0.0] if tr['fed'] and name != 'valley_river' else (), fords=fords, shallow=shallow)
    pr['w'] = np.minimum(pr['w'], drawn * 1.3 + 0.3)                 # (and never much wider than it was drawn)
    # it keeps the width drawn for it near anything that must stay dry or a way it does not cross, at its two ends (the
    # fall it comes in under and the lip it leaves by are found by the game across those widths), and at a bridge
    room = sample(ROOM, Q) - 0.5; wayd = sample(path_d, Q) - 0.4
    cap = np.where(room < drawn + 2.0, np.maximum(drawn, np.minimum(pr['w'], room)), pr['w'])
    cap = np.where((wayd > 0) & (wayd < drawn + 2.0), np.maximum(drawn, np.minimum(cap, wayd)), cap)
    for x, z, r in BRIDGES: cap = np.where(np.hypot(Q[:, 0] - x, Q[:, 1] - z) < r + 2.0, np.minimum(cap, drawn), cap)
    # nor where it would reach into higher ground than its own banks (a cliff's foot, a terrace): its shore would be that
    # ground's edge, a ruled line
    for sd_ in (1, -1):
        hi_ = sample(H0, Q + pr['N'] * sd_ * (pr['w'][:, None] + 0.6)) - tr['level']
        cap = np.where(hi_ > 2.0, np.minimum(cap, drawn), cap)
    cap = np.minimum(cap, ndi.grey_erosion(cap, size=int(4.0 / WS.DS)))      # (and not widened by a step: eased over a few metres)
    cap = ndi.gaussian_filter1d(cap, 1.5 / WS.DS, mode='nearest')
    ends = tr['next'] is not None or tr['deep_end']
    keep_end = sm(1.0, 4.0, s[-1] - s) if ends else 1.0
    keep_head = 1.0 if tr['fed'] else sm(1.0, 4.0, s)
    pr['w'] = drawn + (cap - drawn) * keep_end * keep_head
    pr['dep'] = pr['dep'] * keep_end + shallow * (1 - keep_end) if ends else pr['dep']
    return Q, s, pr, drawn


brooks = []; water_d = np.full(NZ * NX, 1e9); BEDS = {}
flat = H.ravel().copy(); g0 = H0.ravel()
unit = lambda v_: v_ / np.linalg.norm(v_)
for k_, tr in enumerate(tiers):
    if tr['name'] in SHAPED:
        P, s_line, prof, drawn = shaped_bed(tr, tr['name']); BEDS[tr['name']] = (P, prof)
        at, dd, idx = nearest(P, float(prof['w'].max()) * 1.35 + 2.2 + 3.0); half = prof['w'][idx]; lvl = tr['level']; bank = 2.2 + half * 0.35; ends = tr['next'] is not None or tr['deep_end']
        px_at = np.stack([WX.ravel()[at], WZ.ravel()[at]], 1); past = np.zeros(len(at), bool)
        if ends: past |= (idx == len(P) - 1) & (((px_at - P[-1]) @ unit(P[-1] - P[-min(11, len(P))])) > 0.1)
        if tr['fed']: past |= (idx == 0) & (((px_at - P[0]) @ unit(P[0] - P[min(10, len(P) - 1)])) > 0.1)
        up_lip = (len(P) - 1 - idx) * WS.DS if ends else np.full(len(at), 99.0)
        at_lip = (up_lip < 3.0) & ~past
        own = (g0[at] < lvl + 3.2) & ((g0[at] > lvl - 3.2) | (dd < half) | at_lip) & ~past
        C, q, _ = WS.section(prof, px_at[:, 0], px_at[:, 1], dd, idx, np.full(len(P), lvl - 0.12), Hsoft.ravel()[at])
        d_out = np.clip(dd - half, 0, None)
        # in its bed: the bed. On its banks: cut to the bank's slope where the land stands higher, and never lower than a hand
        # over the water for the first metre and a half out (so it holds its water, as the old banks did); then the land
        for kind_, rx_, rz_, sc_, _ in ROCKS_KEPT:                    # (a rock standing in the water still stands out of it: it sits on a shoal of its own, a hand or two under the water)
            r_ = 0.9 * sc_ + 0.5; d_r = np.hypot(px_at[:, 0] - rx_, px_at[:, 1] - rz_)
            C = np.where(d_r < r_ + 2.5, np.maximum(C, lvl - 0.4 - 1.6 * sm(r_, r_ + 2.5, d_r)), C)
        held = np.maximum(WS.lower(flat[at], C, 0.12), np.where((d_out > 0.25) & (d_out < 1.5), lvl + 0.15, -1e9))
        target = np.where(q <= 1, C, held)
        wgt = np.where(q <= 1, 1.0, 1 - sm(bank * 0.6, bank, d_out))
        new = flat[at] + (target - flat[at]) * wgt
        shoulder = (lvl + 0.3) + (flat[at] - (lvl + 0.3)) * sm(0, 1.0, dd - half - 1.2)
        new = new + (np.maximum(new, shoulder) - new) * (1 - sm(2.0, 3.0, up_lip)) * (q > 1)
        flat[at] = np.where(own & (dd < half + bank), new, flat[at])
        water_d[at] = np.minimum(water_d[at], dd - half)
        rows = np.vstack([P[:-1:5], P[-1:]]); hw = np.concatenate([prof['w'][:-1:5], prof['w'][-1:]])
        brooks.append([[round(float(p[0]), 2), round(float(p[1]), 2), round(lvl, 2), round(float(h_), 2)] for p, h_ in zip(rows, hw)])
        print(f"  {tr['name']}: {len(P) * WS.DS:.0f} m, its bed {2 * prof['w'].min():.1f} .. {2 * prof['w'].max():.1f} m wide (drawn {2 * drawn.min():.1f} .. {2 * drawn.max():.1f}), "
              f"{prof['dep'].min() + 0.12:.2f} .. {prof['dep'].max() + 0.12:.2f} m deep" + (f", fords at {', '.join(f'{f:.0f}' for f in prof['fords'])} m" if prof['fords'] else ''))
        continue
    P, A = densify(tr['pts'], [[hw] for hw in tr['half']], step=0.25)
    at, dd, idx = nearest(P, max(tr['half']) * 1.35 + 2.2 + 3.0); half = A[idx, 0]; lvl = tr['level']; bank = 2.2 + half * 0.35; ends = tr['next'] is not None or tr['deep_end']
    # its own terrace only: the cliff above is never cut into, and past the brink (or behind the foot of the fall that feeds it)
    # the land is left as it is; up to the brink its bed is laid even where the ground has begun to drop
    px_at = np.stack([WX.ravel()[at], WZ.ravel()[at]], 1); past = np.zeros(len(at), bool)
    if ends: past |= (idx == len(P) - 1) & (((px_at - P[-1]) @ unit(P[-1] - P[-min(9, len(P))])) > 0.1)
    if tr['fed']: past |= (idx == 0) & (((px_at - P[0]) @ unit(P[0] - P[min(8, len(P) - 1)])) > 0.1)
    # where it ends in a fall, its last 3 m are made a lip: the bed comes up to a shallow sill, and a shoulder of rock stands
    # each side of the water right to the lip's line, even where the cliff's edge had already curved away there. The water
    # then leaves over a straight edge, with a bank on both sides to the very end
    up_lip = (len(P) - 1 - idx) * 0.25 if ends else np.full(len(at), 99.0)      # metres up from the lip
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
# Under each fall the water has dug itself a pool, the deeper the higher it falls from (0.4 m under a low step, nearly two
# under the great fall): the ground already under the water below is taken down about where the fall lands (the game's own
# reckoning, land-water.js: it leaps out 0.6 m and 0.12 m more for each metre it drops, 2.2 at most), as wide as the fall
# and a little more, and never steeper than the water would leave it from the shore in. So a fall lands in water deep
# enough to take it, even when the water stands lower (a drought: drought.js)
for f_ in falls:
    if f_['deep']: continue
    lv_ = tiers[tiers[f_['from']]['next']]['level']; drop_ = f_['top'] - f_['bottom']
    D_ = 0.4 + min(1.4, 0.075 * drop_); fwd_ = min(2.2, 0.6 + 0.12 * drop_) + 0.35; reach_ = fwd_ + 3.0 + f_['width'] / 2 + 2.0
    i0, i1 = np.searchsorted(WX[0], f_['x'] - reach_), np.searchsorted(WX[0], f_['x'] + reach_)
    j0, j1 = np.searchsorted(WZ[:, 0], f_['z'] - reach_), np.searchsorted(WZ[:, 0], f_['z'] + reach_)
    sub = H[j0:j1, i0:i1]; dx_, dz_ = math.sin(f_['yaw']), math.cos(f_['yaw']); rx, rz = WX[j0:j1, i0:i1] - f_['x'], WZ[j0:j1, i0:i1] - f_['z']
    along = rx * dx_ + rz * dz_; across = np.abs(rx * dz_ - rz * dx_)
    bowl = sm(fwd_ + 2.4, fwd_ + 0.7, along) * sm(-0.3, 0.7, along) * sm(f_['width'] / 2 + 1.2, f_['width'] / 2 - 0.2, across)
    wet_ = sub < lv_ - 0.02
    from_shore = ndi.distance_transform_edt(wet_) * MPP               # metres in from the nearest dry ground (its shore is not moved)
    H[j0:j1, i0:i1] = np.where(wet_, np.minimum(sub, lv_ - np.minimum(D_ * bowl, 1.5 * np.maximum(0, from_shore - 0.3))), sub)
    print(f"  pool under the fall {tiers[f_['from']]['name']}: {D_:.2f} m deep at most")
ROCKS_IN_LIPS = []                                                  # the boulders that stand on them (put with the valley's rocks, in 9)
for f_ in falls:                                                      # the rocks in a parted fall's lip: each a hump standing out of the water, rounded upstream, from above the sill out to the lip
    dx_, dz_ = math.sin(f_['yaw']), math.cos(f_['yaw']); rx, rz = WX - f_['x'], WZ - f_['z']
    along = rx * dx_ + rz * dz_; side = rx * dz_ - rz * dx_
    for u_, w_, b_ in f_.get('rocks', []):
        L_ = 1.7 * w_; q_ = ((side - u_) / (w_ / 2 + 0.15)) ** 2 + (np.clip(-(along + 0.5), 0, None) / (L_ - 0.5)) ** 2
        hump = f_['top'] + 0.15 + 0.85 * np.sqrt(np.clip(1 - q_, 0, 1))
        H = np.where((q_ < 1) & (along < 0.5), np.maximum(H, hump), H)
        ROCKS_IN_LIPS.append(['boulder', f_['x'] + dz_ * u_ - dx_ * (0.55 * L_), f_['z'] - dx_ * u_ - dz_ * (0.55 * L_), b_, f_['yaw'] + 1.2 * u_])
# the water mill's wheel turns in a race cut into the bank beside the mill: the ground under it, and a little either side, is
# taken down below the water, so the stream runs round the whole wheel and its paddles dip in it (it stood half on the bank,
# its lower rim buried in the ground)
race_x, race_z = WX - WHEEL[0], WZ - WHEEL[1]
race_a = race_x * MILL_N[0] + race_z * MILL_N[1]                     # (out from the wheel's middle toward the mill: under the wheel and a little either side, no further)
race_w = (1 - sm(2.2, 2.8, np.abs(race_x * MILL_T[0] + race_z * MILL_T[1]))) * (1 - sm(0.55, 1.0, race_a)) * sm(-1.4, -0.8, race_a)
H = np.where(race_w > 0, np.minimum(H, H * (1 - race_w) + (tiers[1]['level'] - 0.9) * race_w), H)
H = ndi.gaussian_filter(H, 0.6)

# ------------------------------------------------------------------ 7. the small things: a market round the fountain, and what a farm leaves lying about
px_, pz_ = PLAZA; ty = TREE_YARD; barn = by_id['barn']; wmill = by_id['windmill']; fr = M(.835, .36)
PROP_R = {'stall': 2.2, 'kit:Prop_Wagon': 2.2, 'cart': 2.0, 'hay': 1.3, 'table': 1.3, 'woodpile': 1.2, 'bench': 1.1, 'barrels': 1.0, 'crates': 1.0, 'signpost': 0.6, 'lamp': 0.5, 'sheep': 0.0}      # metres of ground each takes up (the plants keep off it; the game's level has the same for the ground it makes even: hill-village-level.js PADS)
PROPS = [   # kind (stylized-buildings.js propGeometry, or kit:<piece>), x, z, yaw
    ['stall', px_ - 7.5, pz_ - 5.0, 0.9], ['stall', px_ + 2.5, pz_ - 8.0, -0.2], ['stall', px_ + 8.0, pz_ + 3.5, -1.9], ['stall', px_ - 3.0, pz_ + 8.5, 2.9],
    ['barrels', px_ - 9.4, pz_ - 2.4, 0.3], ['crates', px_ + 5.6, pz_ - 7.4, 1.0], ['crates', px_ + 10.2, pz_ + 4.6, 2.0], ['kit:Prop_Wagon', px_ + 13.0, pz_ + 8.0, 2.4], ['bench', px_ - 2.6, pz_ - 3.6, 0.6], ['bench', px_ + 3.4, pz_ + 2.6, -2.4], ['lamp', px_ - 4.4, pz_ + 3.4, 0], ['lamp', px_ + 4.6, pz_ - 3.2, 0],
    ['table', *M(.47, .775), 0.3], ['bench', M(.47, .775)[0], M(.47, .775)[1] + 1.6, 0.3], ['table', M(.47, .775)[0] + 4, M(.47, .775)[1] + 0.8, 0.2], ['signpost', *M(.19, .835), 0.8],
    ['stall', ty[0] + 8.0, ty[1] - 6.5, -2.3], ['barrels', ty[0] + 10.5, ty[1] - 4.6, 0.4], ['bench', ty[0] - 3.4, ty[1] + 4.6, 2.4], ['lamp', ty[0] + 4.6, ty[1] + 2.6, 0],
    ['hay', barn['x'] + 5.0, barn['z'] + 4.0, 0.4], ['hay', barn['x'] + 5.6, barn['z'] + 6.2, 1.9], ['woodpile', barn['x'] - 4.6, barn['z'] + 2.0, 1.57], ['cart', barn['x'] - 6.0, barn['z'] + 8.5, 0.5],
    ['sheep', fr[0] - 5, fr[1] - 2, 0.6], ['sheep', fr[0] + 1, fr[1] + 2.4, 2.4], ['sheep', fr[0] + 5.5, fr[1] - 1.5, 4.0], ['sheep', fr[0] - 1.5, fr[1] + 4.6, 5.2], ['sheep', fr[0] + 8, fr[1] + 3, 1.6],
    ['hay', fr[0] - 8.5, fr[1] - 4.5, 1.0], ['hay', wmill['x'] + 5.5, wmill['z'] - 4.0, 0.3], ['barrels', wmill['x'] + 6.2, wmill['z'] + 3.2, 1.0], ['cart', wmill['x'] - 4.0, wmill['z'] + 6.0, 2.0],
    ['woodpile', MILL[0] + nrm[0] * 3.6 - t[0] * 2, MILL[1] + nrm[1] * 3.6 - t[1] * 2, mill_yaw], ['barrels', MILL[0] + t[0] * 4.6 + nrm[0] * 2.6, MILL[1] + t[1] * 4.6 + nrm[1] * 2.6, 0.2],
    ['crates', by_id['castle_hall']['x'] + 2.5, by_id['castle_hall']['z'] + 4.2, 0.5], ['lamp', M(.385, .158)[0] + 2.6, M(.385, .158)[1] + 1.2, 0],
    ['barrels', by_id['manor']['x'] - 5.0, by_id['manor']['z'] + 5.6, 0], ['bench', by_id['manor']['x'] + 4.0, by_id['manor']['z'] + 5.6, 3.14], ['lamp', M(.565, .158)[0] - 2.4, M(.565, .158)[1] + 0.6, 0],
    ['signpost', *M(.535, .40), 2.0], ['signpost', BS[0] - 2.2, BS[1] + 2.4, 0.4], ['woodpile', by_id['ledge_house']['x'] + 4.0, by_id['ledge_house']['z'] - 1.5, 1.57],
    # the valley: a signpost where the way to it comes down onto the meadow, another at the foot of the way down; a bench at the lookout
    ['signpost', 7.6, 65.5, 2.6], ['signpost', RAMP_FOOT[0] + 2.4, RAMP_FOOT[1] - 1.0, 1.2], ['bench', LOOKOUT[0] + 0.3, LOOKOUT[1] + 2.0, -2.0],
    # the pit: a signpost where the west bank's way comes to it, a bench on its far side
    ['signpost', J_W[0] - 2.0, J_W[1] - 1.4, 0.6], ['bench', PIT_SOUTH[0] + 6.0, PIT_SOUTH[1] + 2.6, round(face(PIT_SOUTH, tuple(BOWL)), 2)],
]
PROPS = [[k, round(float(x), 2), round(float(z), 2), round(float(y), 2)] for k, x, z, y in PROPS]
for m in MOVES:                                                          # the small things moved by hand: the nearest of its kind_ to where it was
    if '@' not in m['id']: continue
    kind_ = m['id'].split('@')[0]; (fx_, fz_, _), (tx_, tz_, ty_) = m['from'], m['to']
    p_ = min((q for q in PROPS if q[0] == kind_), key=lambda q: math.hypot(q[1] - fx_, q[2] - fz_), default=None)
    if p_ is None or math.hypot(p_[1] - fx_, p_[2] - fz_) > 0.3: print(f"  ! the move of {m['id']} is out of date"); continue
    p_[1:] = [tx_, tz_, ty_]; print(f"  moved by hand: {m['id']} to {tx_}, {tz_}")
    if PROP_R.get(kind_, 0) >= 1.0: level_ground(tx_, tz_, PROP_R[kind_])      # (the ground made even under it, as under a moved house: a stall is not left half sunk in a slope. A lamp, a signpost, a sheep stand on the ground as it is)
INFLOWS_EARLY = [   # where the waters come from (see 10): the stretch, its line (x, z, half-width in metres), its knoll
    ('upper_stream', [(-105.2, -57.0, 1.0), (-105.2, -48.5, 1.1), (-103.8, -41.0, 1.2), (-99.0, -34.0, 1.25), (-93.0, -30.2, 1.3), (-85.0, -26.8, 1.4), (-76.0, -23.8, 1.7)], (-91.0, -44.0, 3.4, 7.5)),
    ('brook_2_meadow', [(-104.5, 157.0, 0.9), (-103.4, 166.0, 1.0), (-99.5, 173.5, 1.1), (-93.0, 178.6, 1.15), (-85.5, 181.3, 1.2)], (-90.5, 168.0, 3.0, 7.0)),
    ('brook_1_meadow', [(104.8, 247.5, 0.9), (105.0, 239.0, 1.0), (104.6, 232.5, 1.05), (100.8, 227.0, 1.1), (94.0, 224.2, 1.2), (88.5, 222.8, 1.5)], (91.0, 238.0, 3.0, 7.0)),
]

# ------------------------------------------------------------------ 7b. the rain's runnels
# Where would rain run on this land? Each place is drained to its lowest neighbour (the hollows filled, as a flood would
# fill them: every drop gets somewhere, to a water, the pit, the land's edge) and the ground draining through each place is
# counted; where enough gathers the land is worn into a runnel along it, deeper and wider the more it carries and the faster
# it runs (water_shape.py, flow and runnels): gullies down the hills at the map's edges, down the bowl's sides above the pit,
# down the banks between the village's terraces; on level ground no more than a swale. On a cliff (the land paints its
# strata there) a runnel is half as deep, a notch the strata run into. Nothing is worn where something stands or is walked
# (a house, a yard, a field, a fence, a way, a bridge's end, a plant, a rock), in or by a water, at a fall or a cascade's
# steps, in the pit, where an inflow's valley is cut in the game, nor by the seam with the west fringe.
_K = 2                                                               # (the water's way is worked out on every second height: a quarter of the work)
_Hc = ndi.gaussian_filter(H, 1.0)[::_K, ::_K] + 0.22 * fbm_big(9.0, 2)[::_K, ::_K] - 0.11
_out = (water_d < 0.2)[::_K, ::_K] | pit_in[::_K, ::_K]
_out[0, :] = _out[-1, :] = _out[:, 0] = _out[:, -1] = True
_acc, _run = WS.flow(_Hc, _out, MPP * _K, along=True)
_up = lambda F: np.pad(ndi.zoom(F, _K, order=1)[:NZ, :NX], ((0, max(0, NZ - F.shape[0] * _K)), (0, max(0, NX - F.shape[1] * _K))), mode='edge')[:NZ, :NX]
FLOW = _up(_acc)
# how fast it runs: the slope along its own way down, eased over a few metres of it (not the land round it: along the foot
# of a cliff the water runs slowly and only lays a swale, though the cliff beside it is steep)
_onw = (_acc > 20.0).astype(float); _sg = 1.2 / (MPP * _K)
_fall = _up(ndi.gaussian_filter(_run * _onw, _sg) / np.maximum(ndi.gaussian_filter(_onw, _sg), 1e-3))      # (eased along the ways the water takes only)
_keep = np.zeros((NZ, NX))
def _keep_round(x, z, r, edge=1.6):
    global _keep
    _keep = np.maximum(_keep, sm(r + edge, r, np.hypot(WX - x, WZ - z)))
for b_ in B: _keep_round(b_['x'], b_['z'], b_['pad'] + 1.5)
for x, z, r, _ in YARDS: _keep_round(x, z, r + 1.0)
for x, z, r in BRIDGES: _keep_round(x, z, r + 2.0)
for kind_, x, z, sc_, _ in ROCKS_KEPT: _keep_round(x, z, 0.9 * sc_ + 0.8)
for r_ in STANDING: _keep_round(r_[1], r_[2], 1.2 + 0.6 * r_[3] if r_[0] in ('oak', 'broadleaf', 'birch', 'pine', 'sapling') else 0.8, 1.0)
for f_ in falls: _keep_round(f_['x'], f_['z'], 6.0 if not f_['deep'] else 4.0)
for f_ in FIELDS: _keep_round(f_['x'], f_['z'], math.hypot(f_['w'], f_['d']) / 2 + 1.0)
for q_ in FENCES:
    for x, z in q_['points']: _keep_round(x, z, 1.0)
for k_, x, z, _ in PROPS: _keep_round(x, z, 1.6)
for c in CASC:                                                       # (the cascades' steps, from the meadow down to the pit)
    th = c['th']; _keep = np.maximum(_keep, sm(9.0, 6.0, np.abs(-(WX - BOWL[0]) * math.sin(th) + (WZ - BOWL[1]) * math.cos(th))) * ((WX - BOWL[0]) * math.cos(th) + (WZ - BOWL[1]) * math.sin(th) > PIT_BRINK - 6))
for _, line_, _kn in INFLOWS_EARLY:                                  # (the inflows' valleys, cut by the game as it loads)
    for x, z, _hw in line_: _keep_round(x, z, 7.0, 3.0)
    _keep_round(_kn[0], _kn[1], _kn[3] + 2.0, 3.0)
_keep = np.maximum.reduce([_keep, sm(1.6, 0.6, path_d), sm(1.4, 0.4, water_d), sm(-70.0, -76.0, WX), (r_bowl < PIT_BRINK + 2.5).astype(float)])
RILL = WS.runnels(FLOW, _fall, MPP, where=(water_d > 0.3), deep=1.3, start=30.0) * (1 - 0.5 * sm(0.9, 1.6, _fall)) * (1 - _keep)
H = H - RILL
# Under the meadow's grass a runnel a hand or two deep is not seen at all: where one is cut deep down a slope, where the water
# runs fast, the grass has gone from its floor and the bare earth shows (hill-village-bare.png: the game paints it bare)
BARE = ndi.gaussian_filter(np.clip(sm(0.1, 0.32, RILL) * sm(0.07, 0.2, _fall), 0, 1), 0.3 / MPP)
print(f'  runnels: worn into {100 * (RILL > 0.05).mean():.1f}% of the land, the deepest {RILL.max():.2f} m; bare earth in {100 * (BARE > 0.5).mean():.2f}% of it')

# ------------------------------------------------------------------ 8. the places to start from (name, spot, the way she faces)
SPAWN = M(.04, .868); FALL = tuple(LIP + RIVER_DIR * 2.0); above = M(.60, .80); rim = (RAMP_TOP[0] - 1.2, RAMP_TOP[1] - 4.0)
VIEWS = {
    'start': [*R2(SPAWN), round(face(SPAWN, M(.12, .895)), 2)], 'vl-plaza': [*R2((px_ + 1.5, pz_ + 5.0)), 3.0], 'vl-bridge': [*R2(BS - BRIDGE_DIR * 3), round(face(BS, BN), 2)],
    'vl-tree': [*R2((ty[0] - 2.5, ty[1] + 3.5)), round(face(ty, (by_id['great_tree']['x'], by_id['great_tree']['z'])), 2)],
    'vl-castle': [*R2(M(.405, .168)), round(face(M(.405, .168), KEEP), 2)], 'vl-manor': [*R2(M(.555, .168)), round(face(M(.555, .168), (by_id['manor']['x'], by_id['manor']['z'])), 2)],
    'vl-pasture': [*R2(M(.735, .345)), 1.4], 'vl-windmill': [*R2(M(.60, .535)), round(face(M(.60, .535), (wmill['x'], wmill['z'])), 2)],
    'vl-watermill': [*R2(M(.40, .49)), round(face(M(.40, .49), tuple(WHEEL)), 2)], 'vl-fields': [*R2(M(.15, .75)), -1.57], 'vl-falltop': [*R2(above), round(face(above, tuple(BASIN)), 2)],
    'vl-spring': [*R2(M(.15, .345)), round(face(M(.15, .345), M(.085, .365)), 2)],
    'vl-eastwood': [*R2(M(.88, .60)), round(face(M(.88, .60), M(.92, .66)), 2)],
    'vl-brink': [*R2(LOOKOUT), round(face(LOOKOUT, FALL), 2)], 'vl-rim': [*R2(rim), round(face(rim, (riv_x(ZH + 70), ZH + 70)), 2)],
    'vl-pit': [*R2(PIT_NORTH), round(face(PIT_NORTH, tuple(BOWL)), 2)], 'vl-cascade': [*R2(CASCADE_VIEW), round(face(CASCADE_VIEW, CASCADE_MID), 2)], 'vl-pit-south': [*R2(PIT_SOUTH), round(face(PIT_SOUTH, tuple(BOWL)), 2)],
    'vl-pit-above': [*R2(PIT_ABOVE), round(face(PIT_ABOVE, tuple(BOWL)), 2)],
    'vl-fallfoot': [*R2(FALL_FOOT), round(face(FALL_FOOT, FALL), 2)], 'vl-valley': [*R2((PW[0] - 2.5, PW[1] + 0.4)), round(face(PW, (riv_x(ZH + 40), ZH + 40)), 2)],
}


def _before_view(x, z):                                              # in the wedge before a place to look from (30 m out, about 17 degrees each side),
    for vx, vz, yaw in VIEWS.values():                                # or within 7 m of it all round (the camera stands behind her there)
        dx, dz = x - vx, z - vz; f_ = dx * math.sin(yaw) + dz * math.cos(yaw); s_ = dx * math.cos(yaw) - dz * math.sin(yaw)
        if (0 < f_ < 30 and abs(s_) < 2.5 + f_ * 0.3) or math.hypot(dx, dz) < 7: return True
    return False

# ------------------------------------------------------------------ 9. plants: the land decides what grows where, in groups
# Nothing is drawn by hand: every spot is put in one zone by what the land is there (how steep, how high, how near water, a
# way, a house or a cliff, inside the part she walks on or out in the margin). Change the land and the plants follow it.
#   never        on a way, in water, on ground steeper than 30 degrees, on a house, a field, a pen, a bridge, a cascade's
#                steps, the map's edge, the line she cannot cross, a small thing (7) or a rock; and no tree in front of a
#                place to look from (8), under the windmill's sails or on a cliff's brink
#   the pit      pines and a few birches on its upper shelves, strewn
#   the margin   thick wood, strewn: broadleaf and oak low down, the higher the more pines; at its edge bushes and small
#                trees first, so the wood never ends in a straight line
# Inside, where she walks, nothing stands alone: everything is planted in groups, each put where the village or the land
# gives it a reason, with clear grass between one group and the next. A group has its tall thing in the middle or at the
# back, lower things round it (small trees, then bushes in twos and threes, then flowering clumps), flowers at its sunny
# edge, and one colour of flowers throughout (pink, yellow or blue beds, with clumps to match). Bushes are plain green: with
# beds of flowers and flowering clumps about, bushes in flower too were more than the eye could rest on.
#   a house      beds of flowers either side of its door and along its walls, bushes at its corners, a small tree or two
#                behind it so the roof stands against green; here and there a big tree beside one
#   the market   a big tree at its rim, beds and bushes between the ways that leave it; the great tree's yard the same
#   a fence      a hedge along it in runs, flowers in the gaps
#   where ways meet   a tree with flowers at its foot
#   a bridge     a group of birches either side of each end
#   a way        every so often a small tree, bushes and flowers beside it, and flowers along its very edge
#   the water    birches in twos and threes along the bank, bushes and flowers toward the water
#   a cliff's foot   a thicket along it: broadleaf trees in a line, bushes on the open side
#   a cliff's top    bushes in a group (no tree to hang over the brink);  a slope (15 to 30 degrees): pines in a group
#   open ground  copses where a slow noise says trees gather (big ones in its heart: an oak or a broadleaf, more trees
#                round it, saplings at the rim), and between them stands of young trees, drifts of flowers and groups
#                of bushes
gy, gx = np.gradient(H, MPP); slope = np.hypot(gx, gy)
px_m = lambda m: max(1, int(round(m / MPP)))
STEEP, MIDSLOPE = math.tan(math.radians(30)), math.tan(math.radians(15))
P2 = lambda p: ((p[0] + XH) / MPP, (p[1] - Z0) / MPP)
PXX = lambda u: ((u - .5) * SIZE + XH) / MPP; PXZ = lambda v: ((v - .5) * SIZE - Z0) / MPP
blocked = ndi.binary_dilation(slope > STEEP, iterations=px_m(1.0))
for c in CASC:                                                        # nor before a cascade, down the pit or beside its bridge: its steps are to be seen from across the pit
    th = c['th']; rho_ = (WX - BOWL[0]) * math.cos(th) + (WZ - BOWL[1]) * math.sin(th); lat_ = -(WX - BOWL[0]) * math.sin(th) + (WZ - BOWL[1]) * math.cos(th)
    blocked |= (np.abs(lat_) < 8.0) & (rho_ > 10) & (rho_ < c.get('rh', c['nb']) + 3)
e = px_m(2.5); blocked[:e] = blocked[-e:] = True; blocked[:, :e] = blocked[:, -e:] = True
blocked |= (np.abs(OUTSIDE) < 1.2)                                    # (nothing on the line she cannot cross: a trunk there would look like a wall)
blocked |= d_basin < BASIN_R + 6                                      # (nor in the spray round the plunge pool)


def _made(fence_w, field_pad):
    """what is built on the ground, as a mask: the bridges, a pen with its fence (fence_w metres wide), a field and field_pad metres round it"""
    mk = Image.new('L', (NX, NZ), 0); md = ImageDraw.Draw(mk)
    md.line([P2(BS), P2(BN)], fill=255, width=px_m(6)); md.line([P2(PW), P2(PE)], fill=255, width=px_m(5))
    for p_ in PLANKS: md.line([P2(p_['a']), P2(p_['b'])], fill=255, width=px_m(5))
    for f in FENCES: md.polygon([P2(p) for p in f['points']], fill=255); md.line([P2(p) for p in f['points'] + f['points'][:1]], fill=255, width=px_m(fence_w))
    for f in FIELDS:
        c_, s_ = math.cos(f['yaw']), math.sin(f['yaw']); hw_, hd_ = f['w'] / 2 + field_pad, f['d'] / 2 + field_pad
        md.polygon([P2((f['x'] + a * c_ + b * s_, f['z'] - a * s_ + b * c_)) for a, b in ((-hw_, -hd_), (hw_, -hd_), (hw_, hd_), (-hw_, hd_))], fill=255)
    return np.array(mk) > 0


off_low = blocked | _made(1.0, 0.6)                                   # where not even a flower grows (a hedge may stand right against a fence)
blocked |= _made(3.0, 1.5)                                            # a tree keeps a metre and a half from a fence or a field
off_tree = blocked.copy()                                             # where no tree grows (the houses apart: wall_d below)
for b_ in B:
    if b_['kind'] != 'tree': blocked |= np.hypot(WX - b_['x'], WZ - b_['z']) < b_['pad'] + 0.8
hard = blocked.copy()                                                 # (where nothing strewn grows; the ground cover may come nearer a way and the water than the rest)
blocked |= (water_d < 2.0) | (path_d < 1.5)
free = ~blocked
seen = np.maximum(np.abs(WX) / XH, np.abs(WZ - (Z0 + Z1) / 2) / ((Z1 - Z0) / 2)) < 0.94      # (past this the land is lost in the haze)
_wm = Image.new('L', (NX, NZ), 0); _wd = ImageDraw.Draw(_wm)           # the houses as they stand (w across, l along the ridge, turned by yaw), and the well
for b_ in B:
    if 'spec' in b_: _wd.polygon([P2(q) for q in rect(b_['x'], b_['z'], b_['spec']['w'], b_['spec']['l'], b_['yaw'])], fill=255)
    elif b_['kind'] == 'well': _wd.ellipse([P2((b_['x'] - 1.4, b_['z'] - 1.4)), P2((b_['x'] + 1.4, b_['z'] + 1.4))], fill=255)
wall_d = ndi.distance_transform_edt(np.array(_wm) == 0) * MPP          # metres from the nearest wall
way_d = ndi.distance_transform_edt(path_d > 0) * MPP                  # metres from the nearest way, however far (path_d is only kept near one)

# what the land is at every spot
bld_d = np.full((NZ, NX), 1e9)                                        # metres from the nearest house's ground
for b_ in B:
    if b_['kind'] in ('house', 'well'): bld_d = np.minimum(bld_d, np.hypot(WX - b_['x'], WZ - b_['z']) - b_['pad'])
Hs = ndi.gaussian_filter(H, px_m(4.0))                                # the land smoothed: a cliff's foot lies below it, its top above it
cliffy = ndi.gaussian_filter((slope > 0.8).astype(float), px_m(3.5)) > 0.06
inside_ = OUTSIDE < 0
pit_zone = pit_in & (H > FLOOR - 36) & (r_bowl > 14)
village = inside_ & ~pit_in & (bld_d < 14) & ~floor
river = inside_ & ~pit_in & ~village & (water_d >= 2) & (water_d < 8)
foot = inside_ & ~pit_in & ~village & ~river & cliffy & (H < Hs - 0.25) & (slope < MIDSLOPE)
brink = inside_ & ~pit_in & ~village & ~river & cliffy & (H > Hs + 0.25)
slope_z = inside_ & ~pit_in & ~village & ~river & ~foot & ~brink & (slope >= MIDSLOPE)
open_ = inside_ & ~pit_in & ~village & ~river & ~foot & ~brink & ~slope_z
margin = OUTSIDE > 0
pn = np.random.default_rng(611)                                       # the plants' own dice (the rest of the plan's are thrown as before)


def noise(cell, octaves=3, gain=0.5):
    """the plants' own slow noise over the whole land, 0..1; cell: metres across its broadest lumps"""
    out = np.zeros((NZ, NX)); amp = 1.0; tot = 0.0
    for o in range(octaves):
        k = cell / 2 ** o / MPP
        z = ndi.zoom(pn.random((int(NZ / k) + 4, int(NX / k) + 4)), k, order=3)[:NZ, :NX]
        out += amp * z; tot += amp; amp *= gain
    out /= tot
    return (out - out.min()) / (out.max() - out.min())


groves = noise(26, 3)                                                 # where trees gather
_m = margin & seen
H_LO, H_HI = float(np.percentile(H[_m], 15)), float(np.percentile(H[_m], 92))
height01 = np.clip((H - H_LO) / (H_HI - H_LO), 0, 1)                   # how high up the margin's hills a spot is
grove_core, grove_edge = open_ & (groves > 0.64), open_ & (groves > 0.55) & (groves <= 0.64)
meadow = open_ & (groves <= 0.55)

plants = []; _grid = {}; GRID = 8.0                                   # the strewn ones (kind, x, z, radius): no two closer than their radii added


def _crowded(x, z, rad):
    gx_, gz_ = int(x // GRID), int(z // GRID)
    for i_ in range(gx_ - 2, gx_ + 3):
        for j_ in range(gz_ - 2, gz_ + 3):
            for q in _grid.get((i_, j_), ()):
                if math.hypot(q[1] - x, q[2] - z) < rad + q[3]: return True
    return False


def scatter(mask, spacing, pick, tries=0.25, keep=1.0):
    ys, xs = np.nonzero(mask & free)
    if not len(ys): return
    for i in pn.integers(0, len(ys), int(len(ys) * MPP * MPP * tries)):
        x, z = (xs[i] + pn.random()) * MPP - XH, (ys[i] + pn.random()) * MPP + Z0
        if pn.random() > keep: continue
        kind = pick(x, z)
        if _crowded(x, z, spacing / 2): continue
        p_ = (kind, x, z, spacing / 2); plants.append(p_); _grid.setdefault((int(x // GRID), int(z // GRID)), []).append(p_)


one = lambda k: (lambda x, z: k)
def mix(*kw):                                                         # mix(('oak', 0.4), ('broadleaf', 0.45), ...): one at random, by weight
    tot = sum(w for _, w in kw)
    def pick(x, z):
        r_ = pn.random() * tot
        for k, w in kw:
            r_ -= w
            if r_ <= 0: return k
        return kw[-1][0]
    return pick
def margin_tree(x, z):                                                # the margin's wood: the higher up its hills, the more pines
    h01 = float(sample(height01, (x, z))[0]); pine = sm(0.3, 0.75, h01)
    if pn.random() < pine: return 'pine'
    r_ = pn.random(); return 'oak' if r_ < 0.25 else 'broadleaf' if r_ < 0.9 else 'birch'      # (few oaks out there: seen from far off a broadleaf does as well, with half the leaves)


# the pit and the margin: strewn
scatter(pit_zone, 6.5, mix(('pine', 0.7), ('birch', 0.3)), tries=0.12, keep=0.6)
scatter(margin & (OUTSIDE < 4), 4.8, one('sapling'), tries=0.15, keep=0.55)       # the wood's edge: small first
scatter(margin & (OUTSIDE < 4), 3.2, one('bush'), tries=0.12, keep=0.6)
scatter(margin & (OUTSIDE >= 4) & (OUTSIDE < 10), 7.5, margin_tree)
scatter(margin & (OUTSIDE >= 10) & seen, 11.0, margin_tree)
TREES_K = 0.87                                                        # every tree 87% of the size it was first given: beside Vivi (1.6 m) the woods stood 7 to 9 times her height
SCALE = {'pine': (0.85, 1.05), 'oak': (0.85, 1.25), 'broadleaf': (0.8, 1.15), 'birch': (0.9, 1.2), 'sapling': (0.85, 1.25)}      # (pines were 0.9 .. 1.35: up to 15 m, far over the rest)
SCALE = {k: (lo * TREES_K, hi * TREES_K) for k, (lo, hi) in SCALE.items()}
GROWN = {'oak': 2.35, 'broadleaf': 1.95, 'birch': 1.6, 'pine': 1.8, 'sapling': 1.25}      # and then grown to a tree's real size beside the houses (a two-storey house is some 10 m to its ridge): oaks 13..18 m, broadleaf 12..17, birches 12..15, pines 14..18, saplings 4..6
SCALE = {k: (lo * GROWN[k], hi * GROWN[k]) for k, (lo, hi) in SCALE.items()}
SCALE['bush'] = (0.75, 1.15)
TREE_KINDS = ('oak', 'broadleaf', 'birch', 'pine', 'sapling')
plants = [p_ for p_ in plants if p_[0] == 'bush' or not _before_view(p_[1], p_[2])]      # (no tree in front of a place to look from)
# the plan's rows: kind, x, z, scale, a fifth by its kind (a tree: 0.8, or 0.5 for one she never comes near: fewer leaves; a bush:
# 'green' (bushes bear no flowers: the flowers are the beds' and the clumps'); a bed of flowers: its colour), the group
# it was planted in (0: strewn, none); and once the foliage is kept (below) its turn in degrees and which of its kind's shapes
out_plants = []
for kind, x, z, _r in plants:
    far = kind != 'bush' and (sample(OUTSIDE, (x, z))[0] > 6 or math.hypot(x - BOWL[0], z - BOWL[1]) < PIT_BRINK + 1)      # (trees she never comes near, in the margin and down the pit: drawn with fewer leaves)
    out_plants.append([kind, round(x, 2), round(z, 2), round(float(pn.uniform(*SCALE[kind])), 2), 'green' if kind == 'bush' else 0.5 if far else 0.8, 0])

# ---- inside: the groups. Their own dice, so the pit and the margin stay as they are whatever is changed here.
gr = np.random.default_rng(614)
U = lambda a_, b_: float(gr.uniform(a_, b_)); N = lambda a_, b_: int(gr.integers(a_, b_ + 1)); chance = lambda p_: bool(gr.random() < p_)
pick = lambda seq: seq[int(gr.integers(0, len(seq)))]
BEDS = ('pink', 'yellow', 'blue')                                     # a bed's colour (meadow-flowers.js), and the clumps' flowers that go with it
BLOOM = {'pink': ('pink', 'pink', 'white'), 'yellow': ('yellow', 'yellow', 'white'), 'blue': ('lilac', 'blue', 'lilac')}
REACH = {'oak': 2.4, 'broadleaf': 2.0, 'birch': 1.3, 'pine': 1.3, 'sapling': 1.1, 'bush': 0.62, 'flower': 1.0, 'clump': 0.66}      # metres a plant takes up on the ground, at scale 1
NEAR_WAY = {'oak': 2.4, 'broadleaf': 2.2, 'birch': 1.8, 'pine': 1.8, 'sapling': 1.6, 'bush': 1.15, 'flower': 0.7, 'clump': 0.75}      # how near a way each may stand,
NEAR_WALL = {'oak': 5.0, 'broadleaf': 4.4, 'birch': 3.0, 'pine': 3.2, 'sapling': 2.4, 'bush': 1.35, 'flower': 1.3, 'clump': 1.1}      # a house's wall,
NEAR_WATER = {'oak': 2.4, 'broadleaf': 2.2, 'birch': 2.0, 'pine': 2.0, 'sapling': 2.0, 'bush': 1.7, 'flower': 1.3, 'clump': 1.3}      # the water
_sc_path = OUT / 'hill-village-scatter.json'
_rocks0 = json.loads(_sc_path.read_text())['rocks'] if _sc_path.exists() else []      # the valley's rocks, where they were first thrown (see below)
_ij = lambda x, z: (int((z - Z0) / MPP), int((x + XH) / MPP))
_things = [(x, z, PROP_R.get(k, 1.0)) for k, x, z, _ in PROPS] + [(rk[1], rk[2], 0.5 + 0.5 * rk[3]) for rk in _rocks0 if rk[0] != 'pebbles']
_gt = by_id['great_tree']; _pit_ground = (r_bowl < PIT_BRINK + 1) & pit_in
_gz, _gx = np.gradient(ndi.gaussian_filter(H, px_m(1.5)), MPP)         # which way the land falls (its contours run across this)
_cz, _cx = np.gradient(Hs, MPP)                                       # the same, of the land smoothed: which way a cliff faces
_wz, _wx = np.gradient(np.minimum(water_d, 30.0), MPP); _pz, _px = np.gradient(np.minimum(path_d, 30.0), MPP)      # away from the water, away from a way


def _line(fx, fz, x, z, dice):
    """the way the land's line runs at (x, z): across the slope of a field (fx, fz: its gradient); any way where it is flat"""
    i, j = _ij(x, z); g_ = (float(fx[i, j]), float(fz[i, j]))
    return math.atan2(g_[0], -g_[1]) if math.hypot(*g_) > 0.03 else float(dice.uniform(0, math.pi))


def _ground(kind, x, z):
    """may a plant of this kind stand at (x, z), for what the ground is there (the other plants apart)"""
    i, j = _ij(x, z)
    if not (0 <= i < NZ and 0 <= j < NX): return False
    tree = kind in TREE_KINDS
    if (off_tree if tree else off_low)[i, j] or OUTSIDE[i, j] > -1.3 or _pit_ground[i, j]: return False
    if path_d[i, j] < NEAR_WAY[kind] or water_d[i, j] < NEAR_WATER[kind] or wall_d[i, j] < NEAR_WALL[kind]: return False
    d_gt = math.hypot(x - _gt['x'], z - _gt['z'])
    if tree and (brink[i, j] or _before_view(x, z) or math.hypot(x - WMILL[0], z - WMILL[1]) < 9.5 or d_gt < (12.0 if kind in ('oak', 'broadleaf') else 8.5)): return False
    if d_gt < 2.2: return False
    r_ = 0.9 if tree else 0.5
    return all(math.hypot(q[0] - x, q[1] - z) > q[2] + r_ for q in _things)


def _apart(ka, ra, kb, rb, same):
    """how far apart two plants must stand (ra, rb: what each takes up); nearer in one group than in two"""
    fa, fb = ka == 'flower', kb == 'flower'
    if fa and fb: return (ra + rb) * (0.8 if same else 1.05)          # the beds of one drift run into each other
    if fa or fb:                                                      # a bed lies up to a trunk's foot, and half under a bush
        rf, ko, ro = (ra, kb, rb) if fa else (rb, ka, ra)
        return rf * 0.55 + (0.5 if ko in TREE_KINDS else ro * 0.9)
    return (ra + rb) * (0.62 if same else 0.85)


_pg = {}; PG = 6.0; planted = []; _groups = []; _tally = {}           # every plant by where it stands; the groups' plants; (x, z, radius) of each group
for kind, x, z, _r in plants: _pg.setdefault((int(x // PG), int(z // PG)), []).append((x, z, kind, REACH[kind], -1))
_room = lambda x, z, R, gap=2.5: all(math.hypot(q[0] - x, q[1] - z) > q[2] + R + gap for q in _groups)      # may a group R metres across stand at (x, z): clear grass between it and the rest


class Group:
    """plants put in together. u, v: metres from its middle, along the way it faces and to the left of that"""
    count = 0

    def __init__(self, x, z, ang):
        Group.count += 1; self.id = Group.count; self.x, self.z, self.c, self.s = x, z, math.cos(ang), math.sin(ang); self.items = []; self.bed = pick(BEDS)

    def add(self, kind, u, v, size, extra=None):
        """a plant, if it has room. size: 0..1 through the kind's own sizes for a tree; the scale itself for a bush or a clump; a bed's radius"""
        x, z = self.x + self.c * u - self.s * v, self.z + self.s * u + self.c * v
        sc_ = SCALE[kind][0] + (SCALE[kind][1] - SCALE[kind][0]) * min(1.0, max(0.0, size)) if kind in TREE_KINDS else size
        rr = REACH[kind] * (sc_ / 0.9 if kind in TREE_KINDS else sc_)
        if not _ground(kind, x, z): return False
        gx_, gz_ = int(x // PG), int(z // PG)
        for a_ in range(gx_ - 1, gx_ + 2):
            for b_ in range(gz_ - 1, gz_ + 2):
                for q in _pg.get((a_, b_), ()):
                    if math.hypot(q[0] - x, q[1] - z) < _apart(kind, rr, q[2], q[3], False): return False
        if any(math.hypot(q[1] - x, q[2] - z) < _apart(kind, rr, q[0], q[5], True) for q in self.items): return False
        self.items.append((kind, x, z, sc_, extra, rr)); return True

    def n(self, *kinds): return sum(q[0] in kinds for q in self.items)

    def keep(self, name, discs=None):
        """plant it: its plants take their places, and the ground it covers is kept clear of other groups"""
        for q in self.items: _pg.setdefault((int(q[1] // PG), int(q[2] // PG)), []).append((q[1], q[2], q[0], q[5], self.id)); planted.append(q + (self.id,))
        if discs is None:
            cx_, cz_ = sum(q[1] for q in self.items) / len(self.items), sum(q[2] for q in self.items) / len(self.items)
            discs = [(cx_, cz_, max(math.hypot(q[1] - cx_, q[2] - cz_) + q[5] * 0.6 for q in self.items))]
        _groups.extend(discs); t_ = _tally.setdefault(name, [0, 0]); t_[0] += 1; t_[1] += len(self.items)

    # the pieces a group is put together from
    def bushes(self, cu, cv, n, r0, r1, lean, spread=1.0):
        """n bushes round (cu, cv), r0 to r1 metres from it, gathered toward lean; most with a smaller one right beside"""
        got = 0
        for _t in range(n * 6):
            if got >= n: break
            a = lean + float(gr.normal(0, spread)); d = U(r0, r1); u, v = cu + math.cos(a) * d, cv + math.sin(a) * d
            if self.add('bush', u, v, U(0.82, 1.15)):
                got += 1
                if got < n and chance(0.6):
                    a = U(0, 6.28); d = U(0.75, 1.0); got += self.add('bush', u + math.cos(a) * d, v + math.sin(a) * d, U(0.6, 0.85))
        return got

    def clumps(self, cu, cv, n, r0, r1, lean, spread=1.0):
        got = 0
        for _t in range(n * 6):
            if got >= n: break
            a = lean + float(gr.normal(0, spread)); d = U(r0, r1)
            got += self.add('clump', cu + math.cos(a) * d, cv + math.sin(a) * d, U(0.5, 0.74), pick(BLOOM[self.bed]))
        return got

    def beds(self, cu, cv, n, ang, la, lc, sizes=(1.0, 1.7)):
        """n beds of flowers in one drift round (cu, cv), la metres long along ang and lc across"""
        got = 0; c_, s_ = math.cos(ang), math.sin(ang)
        for _t in range(n * 6):
            if got >= n: break
            a, b = float(gr.normal(0, 0.6)) * la, float(gr.normal(0, 0.6)) * lc
            got += self.add('flower', cu + c_ * a - s_ * b, cv + s_ * a + c_ * b, U(*sizes), self.bed)
        return got


def _side(fx, fz, x, z, ang, toward):
    """+1 or -1: which side of a group facing ang lies down a field's slope (toward = -1) or up it (+1)"""
    i, j = _ij(x, z); d_ = -math.sin(ang) * float(fx[i, j]) + math.cos(ang) * float(fz[i, j])
    return (1 if d_ >= 0 else -1) * toward


def copse(x, z, big, lead=None):
    """trees together: a big one, two or three more round it of other kinds and heights (a loose triangle, never a row),
    saplings at the rim, bushes on one side, flowers out in the sun beyond them"""
    g = Group(x, z, U(0, 6.28))
    if not g.add(lead or (pick(('oak', 'oak', 'broadleaf')) if big else pick(('broadleaf', 'broadleaf', 'birch'))), 0, 0, U(0.55, 1.0) if big else U(0.3, 0.8)): return None
    a0 = U(0, 6.28)
    for n in range(N(3, 4) if big else N(1, 2)):
        for _t in range(6):
            a = a0 + n * U(1.3, 2.0) + U(-0.3, 0.3); d = U(3.8, 6.2) if big else U(3.0, 4.4)
            if g.add(pick(('broadleaf', 'birch', 'birch')) if big else pick(('birch', 'sapling', 'sapling')), math.cos(a) * d, math.sin(a) * d, U(0.0, 0.6)): break
    for n in range(N(2, 4) if big else N(1, 2)):
        for _t in range(5):
            a = U(0, 6.28); d = U(5.8, 8.4) if big else U(4.2, 5.8)
            if g.add('sapling', math.cos(a) * d, math.sin(a) * d, U(0.0, 0.8)): break
    if g.n(*TREE_KINDS) < (3 if big else 2): return None
    lean = U(0, 6.28); out = 6.5 if big else 5.0
    g.bushes(0, 0, N(2, 3) if big else N(1, 2), 2.8, out, lean)
    g.clumps(0, 0, N(1, 3) if big else N(1, 2), 3.5, out + 1.0, lean + U(-1, 1))
    g.beds(math.cos(lean) * (out + 0.8), math.sin(lean) * (out + 0.8), N(2, 3) if big else N(1, 2), lean + math.pi / 2, 2.4, 1.0)
    return g


def shade_tree(x, z, kind, size):
    """one tree with flowers at its foot and a few bushes: for the market's rim, a meeting of ways, beside a house"""
    g = Group(x, z, U(0, 6.28))
    if not g.add(kind, 0, 0, size): return None
    g.beds(0, 0, N(1, 2), U(0, 3.14), 1.5, 1.0, sizes=(1.1, 1.5))
    g.bushes(0, 0, N(2, 3), 1.8, 3.2, U(0, 6.28), spread=0.9)
    g.clumps(0, 0, N(1, 2), 1.8, 3.6, U(0, 6.28), spread=3)
    return g


def thicket(x, z):
    """along a cliff's foot: broadleaf trees in a line, bushes and clumps on the open side"""
    ang = _line(_cx, _cz, x, z, gr); g = Group(x, z, ang); side = _side(_cx, _cz, x, z, ang, -1); n = N(2, 3); u = -(n - 1) * 2.0
    for k in range(n): g.add('broadleaf' if chance(0.7) else 'birch', u + U(-0.6, 0.6), U(-0.7, 0.7), U(0.1, 0.9)); u += U(3.4, 4.6)
    if g.n(*TREE_KINDS) < 1: return None
    for k in range(N(2, 3)): g.add('bush', U(-5.5, 5.5), side * U(1.6, 3.6), U(0.75, 1.15))
    for k in range(N(1, 2)): g.add('clump', U(-5.5, 5.5), side * U(3.0, 4.8), U(0.5, 0.74), pick(BLOOM[g.bed]))
    if chance(0.5): g.beds(U(-3, 3), side * 4.6, 1, 0, 1.5, 0.6)
    return g if len(g.items) >= 4 else None


def bank(x, z):
    """by the water: birches in twos and threes along the bank, bushes and flowers on the water's side"""
    ang = _line(_wx, _wz, x, z, gr); g = Group(x, z, ang); side = _side(_wx, _wz, x, z, ang, -1)
    if not g.add('birch', 0, 0, U(0.3, 1.0)): return None
    if chance(0.75): g.add(pick(('birch', 'sapling')), pick((-1, 1)) * U(2.6, 3.6), -side * U(0.2, 1.4), U(0.0, 0.6))
    if chance(0.45): g.add('sapling', pick((-1, 1)) * U(3.6, 5.0), -side * U(0.5, 2.0), U(0.0, 0.7))
    for k in range(N(1, 3)): g.add('bush', U(-5, 5), side * U(0.2, 1.8), U(0.75, 1.1))
    g.beds(0, side * 1.8, N(1, 2), 0, 2.6, 0.5, sizes=(1.0, 1.4))
    for k in range(N(1, 2)): g.add('clump', U(-5, 5), side * U(0.8, 2.6), U(0.5, 0.74), pick(BLOOM[g.bed]))
    return g if len(g.items) >= 4 else None


def wayside(x, z, tree):
    """beside a way: a small tree (none where one may not stand: before a place to look from), bushes and flowers between it and the way"""
    ang = _line(_px, _pz, x, z, gr); g = Group(x, z, ang); side = _side(_px, _pz, x, z, ang, -1)
    tree = tree and g.add(tree, 0, 0, U(0.1, 0.8))
    for k in range(N(0, 2) if tree else N(1, 2)): g.add('bush', U(-3.2, 3.2), side * U(0.2, 1.5) if tree else U(-0.8, 0.8), U(0.75, 1.1))
    g.beds(0, side * 1.7, N(1, 2), 0, 2.2, 0.5, sizes=(1.0, 1.35))
    for k in range(N(1, 2)): g.add('clump', U(-3.2, 3.2), side * U(1.0, 2.4), U(0.5, 0.74), pick(BLOOM[g.bed]))
    return g if len(g.items) >= 3 else None


def verge(x, z):
    """right at a way's edge: flowers along it, a clump or two behind them"""
    ang = _line(_px, _pz, x, z, gr); g = Group(x, z, ang); side = _side(_px, _pz, x, z, ang, -1)
    if g.beds(0, 0, N(2, 3), 0, 2.4, 0.3, sizes=(0.9, 1.25)) < 2: return None
    for k in range(N(1, 2)): g.add('clump', U(-3, 3), -side * U(0.5, 1.4), U(0.5, 0.74), pick(BLOOM[g.bed]))
    if chance(0.3): g.add('bush', U(-3, 3), -side * U(1.0, 1.8), U(0.75, 1.05))
    return g


def flowers(x, z):
    """a drift of flowers in the open, along the land's contour, flowering clumps standing in it"""
    g = Group(x, z, _line(_gx, _gz, x, z, gr))
    if g.beds(0, 0, N(3, 6), 0, 3.2, 1.3) < 3: return None
    g.clumps(0, 0, N(1, 3), 0.4, 4.2, 0, spread=3)
    if chance(0.35): g.bushes(pick((-1, 1)) * U(3.2, 4.6), U(-1, 1), N(1, 2), 0.0, 1.2, 0, spread=3)
    return g


def bush_group(x, z):
    """bushes together, three to five, clumps at their feet"""
    g = Group(x, z, U(0, 6.28))
    if g.bushes(0, 0, N(3, 4), 0.2, 2.4, 0, spread=3) < 3: return None
    g.clumps(0, 0, N(1, 2), 1.6, 3.6, 0, spread=3)
    if chance(0.4): g.beds(U(-2, 2), U(-2, 2), 1, 0, 1, 1, sizes=(1.0, 1.4))
    return g


def stand(x, z):
    """young trees coming up together in the open: three to five saplings of all heights, a bush or two, flowers"""
    g = Group(x, z, U(0, 6.28))
    if not g.add('sapling', 0, 0, U(0.6, 1.0)): return None
    for k in range(N(2, 4)):
        for _t in range(6):
            a = U(0, 6.28); d = U(2.0, 3.8)
            if g.add('sapling', math.cos(a) * d, math.sin(a) * d, U(0.0, 0.8)): break
    if g.n('sapling') < 3: return None
    g.bushes(0, 0, N(1, 2), 1.5, 3.5, U(0, 6.28), spread=1.2)
    g.beds(0, 0, N(0, 2), U(0, 3.14), 3.0, 1.5)
    g.clumps(0, 0, N(0, 2), 1.5, 4.0, 0, spread=3)
    return g


def pines(x, z):
    """on a slope: pines in twos and threes, a bush or two below them"""
    g = Group(x, z, U(0, 6.28))
    if not g.add('pine', 0, 0, U(0.3, 1.0)): return None
    for k in range(N(1, 2)):
        for _t in range(8):
            a = U(0, 6.28); d = U(2.8, 4.4)
            if g.add('pine', math.cos(a) * d, math.sin(a) * d, U(0.0, 0.7)): break
    if g.n('pine') < 2: return None
    g.bushes(0, 0, N(1, 3), 1.6, 4.0, 0, spread=3)
    return g


def garden(b_):
    """round a house: flowers either side of its door and along its walls, bushes at its corners, a small tree or two behind"""
    sp = b_['spec']; hw, hl = sp['w'] / 2, sp['l'] / 2
    g = Group(b_['x'], b_['z'], math.pi / 2 - b_['yaw'])                 # (u: out of the front gable; v: toward the house's left)
    put = lambda kind, lx, lz, size, extra=None: g.add(kind, lz, -lx, size, extra)      # by the house's own measure: lx across, lz along its ridge
    plain = b_['id'] in ('barn', 'stable_shed', 'castle_keep', 'castle_hall', 'mill_tower')      # a working building: bushes, no flower beds
    dx, dz, nx, nz = {'front': (0, hl, 0, 1), 'back': (0, -hl, 0, -1), 'right': (hw, 0, 1, 0), 'left': (-hw, 0, -1, 0)}[sp.get('door', 'front')]
    tx, tz = -nz, nx                                                   # (the door, the way it faces, and along its wall)
    if not plain:
        for sgn in (-1, 1): d = sgn * U(1.8, 2.4); put('flower', dx + nx * 1.7 + tx * d, dz + nz * 1.7 + tz * d, U(1.0, 1.3), g.bed)
    for cx_, cz_ in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        if chance(0.85) and put('bush', cx_ * (hw + U(1.0, 1.5)), cz_ * (hl + U(1.0, 1.5)), U(0.82, 1.12)) and chance(0.55):
            put('bush', cx_ * (hw + U(1.1, 1.5)), cz_ * (hl - U(0.3, 1.1)), U(0.6, 0.85))
    for sgn in (-1, 1):                                                # along the two long walls: a bed or two, or clumps
        if not plain and chance(0.7):
            for k in range(N(1, 2)): put('flower', sgn * (hw + 1.7), U(-hl * 0.6, hl * 0.6), U(1.0, 1.35), g.bed)
        else:
            for k in range(N(1, 3)): put('clump', sgn * (hw + U(1.15, 1.6)), U(-hl * 0.8, hl * 0.8), U(0.5, 0.74), pick(BLOOM[g.bed]))
    far = hl if nz else hw; wide = (hw if nz else hl) + 2.0             # behind it (away from the door)
    for _t in range(10):
        d = far + U(3.4, 5.8); s_ = U(-1, 1) * wide; lx, lz = -nx * d + tx * s_, -nz * d + tz * s_
        if put(pick(('birch', 'sapling', 'sapling')), lx, lz, U(0.2, 0.9)):
            a = U(0, 6.28); d = U(2.2, 3.0); put('sapling', lx + math.cos(a) * d, lz + math.sin(a) * d, U(0.0, 0.5))
            for k in range(N(2, 3)): a = U(0, 6.28); d = U(1.3, 2.3); put('bush', lx + math.cos(a) * d, lz + math.sin(a) * d, U(0.7, 1.05))
            break
    return g if len(g.items) >= 3 else None


def garden_ground(b_, g):
    """the ground a garden keeps to itself: round the house, and round each tree behind it"""
    return [(b_['x'], b_['z'], math.hypot(b_['spec']['w'], b_['spec']['l']) / 2 + 1.8)] + [(q[1], q[2], 2.6) for q in g.items if q[0] in TREE_KINDS]


_low_ok = ~off_low & (path_d > 0.7) & (water_d > 1.3) & (wall_d > 1.3)   # where a group with no tree in it may have its middle


def grow(name, mask, one_per_m2, build, R, gap=2.5, low=False):
    """groups over the mask, about one to every one_per_m2 of it; build(x, z) -> a group or None; R: about how far one reaches"""
    ys, xs = np.nonzero(mask & (_low_ok if low else free) & inside_ & ~_pit_ground); want = int(round(len(ys) * MPP * MPP / one_per_m2)); got = 0
    for i in (gr.permutation(len(ys))[:want * 30] if len(ys) else ()):
        if got >= want: break
        x, z = (xs[i] + 0.5) * MPP - XH, (ys[i] + 0.5) * MPP + Z0
        if not _room(x, z, R, gap): continue
        g = build(x, z)
        if g: g.keep(name); got += 1


def best_spot(cx, cz, r0, r1, kind, apart=(), n=24):
    """round (cx, cz), r0 to r1 metres from it: the spot where a plant of this kind has most room from the ways (None if nowhere)"""
    best = None
    for k in range(n):
        a = (k + U(0, 1)) / n * 2 * math.pi; d = U(r0, r1); x, z = cx + math.cos(a) * d, cz + math.sin(a) * d
        if not _ground(kind, x, z) or not _room(x, z, 2.0, 0.5) or any(math.hypot(x - q[0], z - q[1]) < q[2] for q in apart): continue
        sc_ = min(float(sample(path_d, (x, z))[0]), 6.0) + U(0, 0.5)
        if best is None or sc_ > best[0]: best = (sc_, x, z)
    return best and best[1:]


# 1. the houses
for b_ in B:
    if 'spec' in b_:
        g = garden(b_)
        if g: g.keep('gardens', discs=garden_ground(b_, g))
# 2. the market and the great tree's yard: a big tree at the market's rim, beds and bushes between the ways that leave them
for (yx, yz, yr, _paved), tree in zip(YARDS[:2], (('oak', 'broadleaf'), ())):
    took = []
    for kind in tree:
        at = best_spot(yx, yz, yr + 3.6, yr + 5.5, kind, apart=took)
        g = at and shade_tree(*at, kind, U(0.6, 0.95))
        if g: g.keep('market trees'); took.append((*at, 14.0))
    for k in range(5):
        at = best_spot(yx, yz, yr + 1.4, yr + 2.4, 'flower', apart=took, n=18)
        if not at: break
        g = Group(*at, U(0, 6.28)); g.beds(0, 0, N(1, 2), U(0, 3.14), 1.2, 0.8, sizes=(1.0, 1.35)); g.bushes(0, 0, N(1, 2), 0.6, 1.8, 0, spread=3); g.clumps(0, 0, N(1, 2), 0.6, 2.0, 0, spread=3)
        if len(g.items) >= 2: g.keep('market beds'); took.append((*at, 6.0))
# 3. here and there a big tree beside a house (never before its door)
_shade = 0
for id_ in ('manor', 'village_house_2', 'barn', 'cottage_upper_1', 'village_house_4', 'cottage_upper_3', 'watermill', 'ledge_house', 'village_house_3'):
    if _shade >= 5: break
    b_ = by_id[id_]; fx_, fz_ = math.sin(b_['yaw']), math.cos(b_['yaw']); r_ = math.hypot(b_['spec']['w'], b_['spec']['l']) / 2
    front = [(b_['x'] + fx_ * (r_ + 4), b_['z'] + fz_ * (r_ + 4), r_ + 5.5)]
    at = best_spot(b_['x'], b_['z'], r_ + 4.5, r_ + 7.5, 'broadleaf', apart=front)
    g = at and shade_tree(*at, pick(('broadleaf', 'broadleaf', 'oak')), U(0.5, 0.9))
    if g: g.keep('house trees'); _shade += 1
# 4. the fences: a hedge along each side in runs of bushes, flowers in the gaps (none before the gate)
for f in FENCES:
    pts_ = [np.array(q, float) for q in f['points']]; mid = sum(pts_) / len(pts_)
    for k, (a_, b_) in enumerate(zip(pts_, pts_[1:] + pts_[:1])):
        L_ = float(np.linalg.norm(b_ - a_)); t_ = (b_ - a_) / L_; n_ = np.array([t_[1], -t_[0]])
        if n_ @ (a_ - mid) < 0: n_ = -n_
        o_ = a_ + n_ * 1.25; g = Group(float(o_[0]), float(o_[1]), math.atan2(t_[1], t_[0])); u = U(0.4, 2.0)
        while u < L_ - 0.4:
            for r_ in range(N(2, 4)):
                if u > L_ - 0.4: break
                if not (k == f.get('gate') and abs(u - L_ / 2) < 2.8): g.add('bush', u, U(-0.2, 0.2), U(0.75, 1.05))
                u += U(1.2, 1.65)
            gap_ = U(3.2, 6.0)
            if not (k == f.get('gate') and abs(u + gap_ / 2 - L_ / 2) < 2.8):
                if chance(0.65): g.add('flower', u + gap_ / 2 - 0.6, U(0.2, 0.7), U(1.0, 1.3), g.bed)
                else:
                    for c_ in range(N(1, 2)): g.add('clump', u + U(0.3, gap_ - 0.9), U(0.0, 0.5), U(0.5, 0.74), pick(BLOOM[g.bed]))
            u += gap_
        if len(g.items) >= 3: g.keep('hedges', discs=[(float(o_[0] + t_[0] * d), float(o_[1] + t_[1] * d), 1.6) for d in np.arange(1.5, L_, 3.0)])
# 5. where ways meet: a tree with flowers at its foot
_ways = {name: densify([M(*p) for p in pts_uv]) for name, (half, pts_uv) in PATHS.items()}
_meet = []
for name, P_ in _ways.items():
    for end in (P_[0], P_[-1]):
        if any(n2 != name and float(np.min(np.hypot(Q_[:, 0] - end[0], Q_[:, 1] - end[1]))) < 1.6 for n2, Q_ in _ways.items()) \
           and all(math.hypot(end[0] - q[0], end[1] - q[1]) > 9 for q in _meet) and all(math.hypot(end[0] - yx, end[1] - yz) > yr + 6 for yx, yz, yr, _p in YARDS):
            _meet.append((float(end[0]), float(end[1])))
for mx, mz in _meet:
    if not (PLAY[0] < mx < PLAY[1] and PLAY[2] < mz < PLAY[3]): continue
    kind = pick(('broadleaf', 'birch', 'birch', 'broadleaf', 'oak'))
    at = best_spot(mx, mz, 4.2, 6.5, kind)
    g = at and shade_tree(*at, kind, U(0.3, 0.8))
    if g: g.keep('meetings of ways')
# 6. the bridges: birches either side of each end
for a_, b_ in [(BS, BN), (PW, PE)] + [(np.array(p_['a'], float), np.array(p_['b'], float)) for p_ in PLANKS]:
    d_ = (b_ - a_) / np.linalg.norm(b_ - a_); n_ = np.array([d_[1], -d_[0]])
    for end, out_ in ((a_, -d_), (b_, d_)):
        for sgn in (-1, 1):
            for _t in range(24):
                at = end + out_ * U(2.0, 9.0) + n_ * sgn * U(3.2, 7.5)
                g = _room(float(at[0]), float(at[1]), 3.0, 0.5) and bank(float(at[0]), float(at[1]))
                if g: g.keep('bridge ends'); break
# 7. the land's own groups, the tallest first
grow("cliff feet: thickets", foot, 140, thicket, 6.0)
grow('the water: birches', inside_ & (water_d > 3.2) & (water_d < 5.2), 50, bank, 5.0)
# along every way, so no stretch of it is bare: every so many metres a group beside it, now on one side and now on the other
# (a small tree, most often, with bushes and flowers; nearer together in the village than out on the land), and between two
# of them, across the way, flowers at its very edge
for name, P_ in _ways.items():
    half = PATHS[name][0]; L_ = len(P_) * STEP; at_ = U(3, 7); side = pick((-1, 1))
    while at_ < L_ - 3:
        i_ = int(at_ / STEP); q_ = P_[i_]; t_ = P_[min(len(P_) - 1, i_ + 8)] - P_[max(0, i_ - 8)]; t_ = t_ / (np.linalg.norm(t_) + 1e-9); n_ = np.array([-t_[1], t_[0]])
        near = bool(sample(bld_d, (q_[0], q_[1]))[0] < 30); step = U(9, 13) if near else U(14, 20); g = None
        for sd, off, slip in ((side, 3.3, 0), (-side, 3.3, 0), (side, 3.3, 2.5), (-side, 3.3, -2.5), (side, 5.0, 0), (-side, 5.0, 0)):      # (the other side, a little along, or further out, where the first spot has no room)
            x_, z_ = (float(v_) for v_ in q_ + t_ * slip + n_ * sd * (half + off + U(-0.5, 0.5)))
            g = _room(x_, z_, 3.0, 1.2) and wayside(x_, z_, pick(('sapling', 'sapling', 'sapling', 'sapling', 'birch', None, None, None, 'broadleaf')))
            if g: g.keep('waysides'); break
        if not g or chance(0.7 if near else 0.4):
            i2 = min(len(P_) - 1, int((at_ + (step / 2 if g else 0)) / STEP))
            for sd in (-side, side):
                x_, z_ = (float(v_) for v_ in P_[i2] + n_ * sd * (half + 1.25))
                g2 = _room(x_, z_, 2.0, 0.8) and verge(x_, z_)
                if g2: g2.keep('verges'); break
        at_ += step; side = -side
# (the big copses stand thickest where they are seen from a way, near enough each other to make a wood; further off fewer, and small ones)
grow('copses, big', open_ & (groves > 0.5) & (way_d > 5) & (way_d < 36), 210, lambda x, z: copse(x, z, True), 8.5, gap=2.2)
grow('copses, big', open_ & (groves > 0.6) & (way_d >= 36), 420, lambda x, z: copse(x, z, True), 8.5, gap=3.5)
grow('copses, small', (open_ & (groves > 0.42)) | (village & (wall_d > 7)), 330, lambda x, z: copse(x, z, False), 6.0, gap=3.5)
grow('drifts of flowers', (open_ & (groves <= 0.5)) | river | (village & (wall_d > 4)), 300, flowers, 5.0, gap=3.0, low=True)
grow('young trees', (open_ & (groves <= 0.6)) | river, 480, stand, 4.0, gap=3.0)
grow('slopes: pines', slope_z, 60, pines, 4.5)
grow('brinks: bushes', brink, 420, bush_group, 3.2, low=True)
grow('bushes', open_ | village | slope_z, 1400, bush_group, 3.2, gap=3.0, low=True)

# the plan's rows, and the flowering clumps (walked through, like the flowers), a list of their own: x, z, scale, colour, group
clumps = []
for kind, x, z, sc_, extra, _rr, gid in planted:
    if kind == 'clump': clumps.append([round(x, 2), round(z, 2), round(sc_, 2), extra, gid])
    else: out_plants.append([kind, round(x, 2), round(z, 2), round(sc_, 2), extra or ('green' if kind == 'bush' else 0.8), gid])
    if kind not in ('clump', 'flower'): plants.append((kind, x, z, REACH[kind]))
_n = {}
for q in planted: _n[q[0]] = _n.get(q[0], 0) + 1
CARDS = {'oak': 3576, 'broadleaf': 1894, 'birch': 1677, 'sapling': 280, 'bush': 410, 'clump': 221, 'flower': 80}      # leaf cards each is drawn with (anime-tree.js; a bed: the clumps that stand in it)
print(f"  groups: {len(_groups)} ({'; '.join(f'{k} {v[0]} ({v[1]})' for k, v in _tally.items())})")
print(f"    their plants: {_n}; about {sum(CARDS.get(k, 0) * v for k, v in _n.items()) // 1000}k leaf cards")

# Ground cover: ferns and tall tufts of grass, the layer between the grass and the bushes (ground-cover.js). Nothing
# here is solid, so it may stand close to a trunk, a way or the water. Never one alone, and never strewn evenly: they grow
# in colonies (some five to fifteen together, the biggest in the middle, small ones at the rim). A colony lies where the
# land gives it a reason, is stretched along the land's own line there, and has clear grass between it and the next.
#   ferns (shade, damp)   along a cliff's foot, following the cliff (on the valley's floor too) · between two trees of a
#                         wood, or in a crescent at the foot of one · against a boulder down in the valley
#   tufts (sun)           along the water's edge, following the bank · along the foot and the top of a bank in the open,
#                         following it · in a hollow of the meadow · along a cliff's brink · across a slope, on its
#                         contour · a bunch by the wayside · a few big islands out on the flat meadow
# Their own dice, and a list of their own in the plan ('cover': rows of kind, x, z, scale, which colony): the plants are as they were.
gc = np.random.default_rng(613)
cover = []; _cg = {}; CG = 3.0
_cover_free = ~hard & (path_d > 0.3) & (water_d > 0.8) & (OUTSIDE < 6) & (bld_d > 0.2) & ~((r_bowl < PIT_BRINK + 1) & pit_in)
_solid = [(q[1], q[2], {'bush': 0.45, 'flower': 0.75}.get(q[0], 0.3) * q[3]) for q in out_plants if q[4] != 0.5] \
       + [(c_[0], c_[1], 0.6 * c_[2]) for c_ in clumps] + [(rk[1], rk[2], 0.3 + 0.45 * rk[3]) for rk in _rocks0 if rk[0] != 'pebbles']
_sg = {}
for q in _solid: _sg.setdefault((int(q[0] // CG), int(q[1] // CG)), []).append(q)


def _fits(x, z, rad, mine):
    """may a fern or a tuft stand at (x, z): free ground, nothing solid there, clear of the cover already placed"""
    i, j = _ij(x, z)
    if not (0 <= i < NZ and 0 <= j < NX) or not _cover_free[i, j]: return False
    gx_, gz_ = int(x // CG), int(z // CG)
    for a_ in range(gx_ - 1, gx_ + 2):
        for b_ in range(gz_ - 1, gz_ + 2):
            if any(math.hypot(q[0] - x, q[1] - z) < q[2] + 0.25 for q in _sg.get((a_, b_), ())): return False
            if any(math.hypot(q[0] - x, q[1] - z) < q[2] + rad for q in _cg.get((a_, b_), ())): return False
    return all(math.hypot(q[1] - x, q[2] - z) > q[4] + rad for q in mine)


_colonies = []; CLEAR = 2.2                                            # (x, z, reach) of each; metres of open grass between two


def _colony(kind, x, z, ang, n, la, lc, big=1.35, small=0.75, least=4, mix=None):
    """a colony at (x, z): up to n plants, spread la metres along ang and lc across it, the biggest in the middle. Nothing
    is planted if it would touch another colony or fewer than `least` find room. -> how many were planted"""
    reach = 1.3 * max(la, lc)
    if any(math.hypot(q[0] - x, q[1] - z) < q[2] + reach + CLEAR for q in _colonies): return 0
    ca, sa = math.cos(ang), math.sin(ang); mine = []
    for _try in range(n * 8):
        if len(mine) >= n: break
        u, v = gc.normal(0, 0.7), gc.normal(0, 0.7); r = math.hypot(u, v)
        if r > 1.5: continue
        k = mix if (mix and r > 0.85 and gc.random() < 0.3) else kind
        sc_ = float((big + (small - big) * min(1.0, r / 1.2)) * gc.uniform(0.9, 1.1))
        px, pz = x + ca * u * la - sa * v * lc, z + sa * u * la + ca * v * lc
        if _fits(px, pz, (0.36 if k == 'fern' else 0.28) * sc_, mine): mine.append((k, px, pz, sc_, (0.36 if k == 'fern' else 0.28) * sc_))
    if len(mine) < least: return 0
    for k, px, pz, sc_, rad in mine:
        cover.append([k, round(px, 1), round(pz, 1), round(sc_, 2), len(_colonies) + 1]); _cg.setdefault((int(px // CG), int(pz // CG)), []).append((px, pz, rad))
    _colonies.append((x, z, reach)); return len(mine)


_tally = {}
def _grow(name, mask, one_per_m2, plant):
    """colonies over the mask, about one to every one_per_m2 of it; plant(x, z) -> how many it planted"""
    ys, xs = np.nonzero(mask & _cover_free); want = int(round(len(ys) * MPP * MPP / one_per_m2)); got = [0, 0]
    for i in (gc.permutation(len(ys))[:want * 25] if len(ys) else ()):
        if got[0] >= want: break
        n_ = plant((xs[i] + 0.5) * MPP - XH, (ys[i] + 0.5) * MPP + Z0)
        if n_: got[0] += 1; got[1] += n_
    _tally[name] = got


U = lambda a_, b_: float(gc.uniform(a_, b_)); N_ = lambda a_, b_: int(gc.integers(a_, b_ + 1))
# ferns along a cliff's foot
_grow('ferns: cliff feet', foot | (floor & ~pit_in & (d_in > 0.6) & (d_in < 3.5)), 42,
      lambda x, z: _colony('fern', x, z, _line(_cx, _cz, x, z, gc), N_(8, 15), U(2.0, 3.2), U(0.7, 1.0)))
# ferns in the woods: between a tree and its neighbour, or a crescent at its foot on the side the land falls
_near = [r_ for r_ in out_plants if r_[0] in ('oak', 'broadleaf', 'birch', 'pine') and r_[4] != 0.5]
_tally['ferns: woods'] = [0, 0]
for t_ in gc.permutation(len(_near)):
    row = _near[t_]
    if gc.random() > {'oak': 0.75, 'broadleaf': 0.7, 'birch': 0.35, 'pine': 0.4}[row[0]]: continue
    i, j = _ij(row[1], row[2])
    if not (0 <= i < NZ and 0 <= j < NX) or sample(OUTSIDE, (row[1], row[2]))[0] > 5: continue
    d_, nb = min(((math.hypot(q[1] - row[1], q[2] - row[2]), q) for q in _near if q is not row), key=lambda e_: e_[0])
    if d_ < 8.5:                                                      # a drift from this trunk toward the next
        ang = math.atan2(nb[2] - row[2], nb[1] - row[1]); k_ = U(0.3, 0.45)
        n_ = _colony('fern', row[1] + math.cos(ang) * d_ * k_, row[2] + math.sin(ang) * d_ * k_, ang, N_(7, 13), d_ * U(0.26, 0.34), U(0.8, 1.1))
    else:                                                             # one standing alone: a crescent round its foot
        ang = math.atan2(-float(_gz[i, j]), -float(_gx[i, j])) if math.hypot(_gx[i, j], _gz[i, j]) > 0.04 else U(0, 6.28)
        d0 = 0.9 * row[3] + 0.5
        n_ = _colony('fern', row[1] + math.cos(ang) * d0, row[2] + math.sin(ang) * d0, ang + math.pi / 2, N_(5, 8), U(1.2, 1.6), U(0.5, 0.7), big=1.2)
    if n_: _tally['ferns: woods'][0] += 1; _tally['ferns: woods'][1] += n_
# against a boulder: ferns down in the valley (damp), tufts up in the open
_tally['boulders'] = [0, 0]
for rk in [r_ for r_ in _rocks0 if r_[0] in ('boulder', 'stones')]:
    i, j = _ij(rk[1], rk[2]); ang = U(0, 6.28); d0 = 0.5 + 0.5 * rk[3] + 0.45
    n_ = _colony('fern' if floor[i, j] else 'tuft', rk[1] + math.cos(ang) * d0, rk[2] + math.sin(ang) * d0, ang + math.pi / 2, N_(3, 6), U(0.8, 1.2), U(0.4, 0.55), big=1.15, small=0.8, least=3)
    if n_: _tally['boulders'][0] += 1; _tally['boulders'][1] += n_
# tufts along the water's edge
_grow("tufts: water's edge", inside_ & (water_d > 0.9) & (water_d < 1.7), 11,
      lambda x, z: _colony('tuft', x, z, _line(_wx, _wz, x, z, gc), N_(5, 10), U(1.6, 2.8), U(0.45, 0.7), big=1.4, small=0.85))
# tufts where the open ground breaks: along the foot and the top of a bank, and in a hollow
_rough = ndi.gaussian_filter(slope, px_m(2.5)); _H7 = ndi.gaussian_filter(H, px_m(7.0)); _open = open_ | river
_bank = _open & (slope < 0.24) & (_rough > 0.15) & (np.abs(H - Hs) > 0.07)
_hollow = _open & (slope < 0.16) & (_H7 - H > 0.16) & ~_bank
_grow('tufts: banks', _bank, 55, lambda x, z: _colony('tuft', x, z, _line(_gx, _gz, x, z, gc), N_(9, 16), U(2.2, 3.4), U(0.6, 0.95), mix='fern' if gc.random() < 0.3 else None))
_grow('tufts: hollows', _hollow, 70, lambda x, z: _colony('tuft', x, z, _line(_gx, _gz, x, z, gc), N_(11, 18), U(1.8, 2.6), U(1.1, 1.5), big=1.4))
_grow('tufts: brinks', brink, 70, lambda x, z: _colony('tuft', x, z, _line(_cx, _cz, x, z, gc), N_(4, 8), U(1.8, 2.6), U(0.45, 0.6), big=1.2))
_grow('tufts: slopes', slope_z, 90, lambda x, z: _colony('tuft', x, z, _line(_gx, _gz, x, z, gc), N_(5, 9), U(2.2, 3.0), U(0.45, 0.6), big=1.2, mix='fern'))
_grow('tufts: wayside', inside_ & (path_d > 0.45) & (path_d < 0.9), 15,
      lambda x, z: _colony('tuft', x, z, _line(_px, _pz, x, z, gc), N_(3, 6), U(1.0, 1.8), U(0.3, 0.4), big=1.1, small=0.7, least=3))
_grow('tufts: meadow islands', (meadow | grove_edge) & (slope < 0.12) & ~_bank & ~_hollow, 420,
      lambda x, z: _colony('tuft', x, z, _line(_gx, _gz, x, z, gc), N_(14, 24), U(2.4, 3.4), U(1.4, 2.0), big=1.45, small=0.8, least=8))
_ferns = sum(c_[0] == 'fern' for c_ in cover)
print(f"  ground cover: {len(_colonies)} colonies, {_ferns} ferns and {len(cover) - _ferns} tufts ({'; '.join(f'{k} {v[0]} ({v[1]})' for k, v in _tally.items())})")
print(f"    (the land: banks {int(_bank.sum() * MPP * MPP)} m2, hollows {int(_hollow.sum() * MPP * MPP)} m2, cliff feet {int(foot.sum() * MPP * MPP)} m2, brinks {int(brink.sum() * MPP * MPP)} m2, slopes {int(slope_z.sum() * MPP * MPP)} m2, meadow {int(meadow.sum() * MPP * MPP)} m2)")

# The foliage is kept: hill-village-foliage.json beside the plan holds every plant as it stands (the rows above, each with its
# turn in degrees and which of its kind's shapes it has), first as the rules put them, then as arranged by hand in the game
# (foliage-editor.js). While that file is there the rules are not asked again: what they planted just now is put aside. To
# plant afresh by the rules: delete it. What the editor sends ("คัดลอกข้อมูล": rows taken out, changed and added, by where
# they stand in the kept lists) goes in hill-village-foliage-edits.json and is laid over the kept foliage once: it names the
# stamp of the foliage it was made on, and the foliage has another stamp once it is in. An edit marked 'carry' (only plants out
# and plants in, none changed) is also written into the plan as foliageWas: a browser still holding an arrangement made on the
# foliage before it takes the same out and puts the same in, and its arrangement stands (foliage-edits.js). The next edit
# laid over lets that go.
_stamp = lambda f_: zlib.crc32(json.dumps([f_['plants'], f_['clumps'], f_['cover']], separators=(',', ':')).encode())
_fol_file, _ed_file = OUT / 'hill-village-foliage.json', OUT / 'hill-village-foliage-edits.json'
if _fol_file.exists():
    FOL = json.loads(_fol_file.read_text()); print(f"  foliage kept as it stands: {len(FOL['plants'])} plants, {len(FOL['clumps'])} clumps, {len(FOL['cover'])} of ground cover (the rules' own planting put aside)")
else:
    fd = np.random.default_rng(615); turn = lambda: [int(fd.integers(0, 360)), int(fd.integers(1, 1000))]
    FOL = {'plants': [r_ + turn() for r_ in out_plants], 'clumps': [r_ + turn() for r_ in clumps], 'cover': cover}
if _ed_file.exists():
    ED = json.loads(_ed_file.read_text())
    if ED.get('full') or ED.get('base') == _stamp(FOL):
        _carry = ED.get('carry') and not ED.get('full') and not any('all' in (ED.get(n) or {}) or (ED.get(n) or {}).get('set') for n in ('plants', 'clumps', 'cover'))
        FOL['was'] = {'base': _stamp(FOL), 'gone': {}, 'add': {}} if _carry else None
        for name in ('plants', 'clumps', 'cover'):
            e_ = ED.get(name) or {}; rows = FOL[name]
            if 'all' in e_: rows = e_['all']
            else:
                for i_, row in e_.get('set', []): rows[i_] = row
                gone = set(e_.get('del', [])); rows = [r_ for i_, r_ in enumerate(rows) if i_ not in gone] + e_.get('add', [])
                if FOL['was'] and gone: FOL['was']['gone'][name] = sorted(gone)
                if FOL['was'] and e_.get('add'): FOL['was']['add'][name] = list(range(len(rows) - len(e_['add']), len(rows)))
            print(f"  foliage arranged by hand, {name}: {len(e_.get('all', [])) or ''}{'all given' if 'all' in e_ else str(len(e_.get('set', []))) + ' changed, ' + str(len(e_.get('del', []))) + ' out, ' + str(len(e_.get('add', []))) + ' new'}")
            FOL[name] = rows
    else: print('  foliage edits: already in (made on an earlier foliage): nothing to do')
FOL = {'stamp': _stamp(FOL), 'plants': FOL['plants'], 'clumps': FOL['clumps'], 'cover': FOL['cover'], **({'was': FOL['was']} if FOL.get('was') else {})}
_fol_file.write_text(json.dumps(FOL, separators=(',', ':')))
out_plants, clumps, cover = FOL['plants'], FOL['clumps'], FOL['cover']

# The valley's rocks are kept where they were first thrown: hill-village-scatter.json beside the plan, written the first time
# and read ever after (a thing she has moved by hand is found by where it stood). Those now in the way of something (a way, a
# bridge) are left out. To throw them afresh: delete that file. (The plants used to be kept there too; now the rules place them.)
vr = np.random.default_rng(21)
_sc_file = OUT / 'hill-village-scatter.json'
KEPT = json.loads(_sc_file.read_text()) if _sc_file.exists() else None

# rocks in the valley: water-worn stones and pebbles along the river's banks, boulders round the plunge pool and at the cliffs' feet
rocks = []
clear = lambda x, z, r: sample(path_d, (x, z))[0] > r and math.hypot(x - PLANK_X, z - PLANK_Z) > PLANK_LEN / 2 + 2 and all(math.hypot(x - q[1], z - q[2]) > r + q[3] * 0.8 for q in rocks)
z_ = ZH + 24.0
while z_ < ZH + VLEN - 10:
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
ys_, xs_ = np.nonzero(floor & ~pit_in & (d_in > 1.0) & (d_in < 2.6) & (d_basin > BASIN_R + 8) & (water_d > 3))
for i in vr.integers(0, len(ys_), 90):
    x_, zz_ = xs_[i] * MPP - XH, ys_[i] * MPP + Z0
    if len([q for q in rocks if q[0] in ('boulder', 'stones')]) < 30 and clear(x_, zz_, 4.0) and all(math.hypot(x_ - p[1], zz_ - p[2]) > 2.2 for p in plants if p[0] != 'flower'):
        rocks.append(['boulder' if vr.random() < 0.55 else 'stones', x_, zz_, float(vr.uniform(0.8, 1.5)), float(vr.uniform(0, 6.28))])
rocks = [[k, round(x, 2), round(z, 2), round(sc_, 2), round(rot, 2)] for k, x, z, sc_, rot in rocks]
if KEPT:                                                              # as first thrown, but for those now in the way
    _span = lambda x, z: float(np.linalg.norm(np.array([x, z]) - (PW + (PE - PW) * np.clip(((np.array([x, z]) - PW) @ (PE - PW)) / ((PE - PW) @ (PE - PW)), 0, 1))))      # metres from the plank bridge's line
    _free = lambda x, z, r: sample(path_d, (x, z))[0] > r and _span(x, z) > r + 1.6      # (not on a way, nor at the bridge)
    rocks = [r_ for r_ in KEPT['rocks'] if _free(r_[1], r_[2], 0.6 + 0.5 * r_[3] * (r_[0] != 'pebbles'))]      # (the plants are not kept: the rules above place them afresh)
    _left = [r_ for r_ in KEPT['rocks'] if r_ not in rocks]
    print(f"  rocks kept as first thrown: {len(rocks)}; now in the way and left out: {', '.join(f'{r_[0]} ({r_[1]:.0f}, {r_[2]:.0f})' for r_ in _left) or 'none'}")
else: _sc_file.write_text(json.dumps({'plants': out_plants, 'rocks': rocks}, separators=(',', ':')))
rocks += [[k, round(x, 2), round(z, 2), round(sc_, 2), round(rot, 2)] for k, x, z, sc_, rot in ROCKS_IN_LIPS]      # and the boulders in a parted fall's lip

# the small things again: none on a way, in the water or on a cliff
for k, x, z, _ in PROPS:
    i, j = int((z - Z0) / MPP), int((x + XH) / MPP)
    by_hand = any('@' in m_['id'] and m_['id'].split('@')[0] == k and abs(m_['to'][0] - x) < 0.01 and abs(m_['to'][1] - z) < 0.01 for m_ in MOVES)      # (a thing put on a way by hand was meant to stand there)
    if k not in ('lamp', 'signpost') and not by_hand and path_d[i, j] < 0.6 and not any(math.hypot(x - yx, z - yz) < yr for yx, yz, yr, _p in YARDS): print(f'  ! {k} at {x:.1f}, {z:.1f} stands on a way')
    if water_d[i, j] < 0.5 or slope[i, j] > 0.5: print(f'  ! {k} at {x:.1f}, {z:.1f} is in water or on a cliff')

# ------------------------------------------------------------------ 10. write it all out
assert H.min() > BASE and H.max() < BASE + RANGE, (H.min(), H.max())
OUT.mkdir(parents=True, exist_ok=True)
v16 = np.clip((H - BASE) / RANGE, 0, 1)
Image.fromarray((np.array(Image.fromarray(v16.astype('f4'), 'F').resize((NX // 2, NZ // 2), Image.BILINEAR)) * 65535).round().astype(np.uint16)).save(OUT / 'hill-village.png')
CELL = 0.4; nx = int(2 * XH / CELL) + 1; nz = int((Z1 - Z0) / CELL) + 1      # the game's copy: a height every CELL metres
gz, gx_ = np.mgrid[0:nz, 0:nx].astype(np.float64)
small = ndi.map_coordinates(H, [gz * CELL / MPP, gx_ * CELL / MPP], order=1, mode='nearest')
np.clip((small - BASE) / RANGE * 65535, 0, 65535).round().astype('<u2').tofile(OUT / 'hill-village.bin')
# where the rain's runnels have left the earth bare (7b), on the same grid: 0 grass .. 255 bare
Image.fromarray((np.clip(ndi.map_coordinates(BARE, [gz * CELL / MPP, gx_ * CELL / MPP], order=1, mode='nearest'), 0, 1) * 255).round().astype(np.uint8)).save(OUT / 'hill-village-bare.png', optimize=True)
# ------------------------------------------------------------------ 10. where the waters come from
# No water rises at a spot she can look at: the upper stream and the two meadow brooks each come in from the margin, out of a
# small valley through its hills and round the foot of a knoll that hides where the water begins. Those stretches are NOT laid
# on the land here: the land, and so every plant the rules put on it, stays as it was. The plan only says where each runs
# (inflows: the stretch it flows into, rows of x, z, half-width from its hidden head down to that stretch's own head, and its
# knoll: x, z, height, radius); the game cuts the valley and the bed as it loads and lays the water on as part of that stretch
# (hill-village-level.js, VALLEY), and the map's picture draws it.
INFLOWS = INFLOWS_EARLY
inflows = []
for name_, line_, knoll_ in INFLOWS:
    i_ = next(k for k, t_ in enumerate(tiers) if t_['name'] == name_); head_ = brooks[i_][0]
    pts_ = [tuple(q) for q in line_] + [(head_[0], head_[1], head_[3])]; g_ = lambda k: pts_[min(len(pts_) - 1, max(0, k))]; rows_ = []
    for k in range(len(pts_) - 1):                                    # a smooth curve through them (Catmull-Rom), a row a metre
        a_, b_, c_, d_ = g_(k - 1), g_(k), g_(k + 1), g_(k + 2); n_ = max(2, int(math.hypot(c_[0] - b_[0], c_[1] - b_[1])))
        for q in range(n_):
            t_ = q / n_; rows_.append([round(0.5 * (2 * b_[j] + (-a_[j] + c_[j]) * t_ + (2 * a_[j] - 5 * b_[j] + 4 * c_[j] - d_[j]) * t_ * t_ + (-a_[j] + 3 * b_[j] - 3 * c_[j] + d_[j]) * t_ ** 3), 2) for j in (0, 1, 2)])
    inflows.append({'stretch': i_, 'level': round(tiers[i_]['level'], 2), 'rows': rows_, 'knoll': list(knoll_)})
    print(f"  inflow into {name_}: {len(rows_)} m, from ({rows_[0][0]}, {rows_[0][1]}), at {tiers[i_]['level']:.2f} m")

plan = {
    'land': {'x0': -XH, 'z0': round(Z0, 4), 'cell': CELL, 'nx': nx, 'nz': nz, 'base': BASE, 'range': RANGE, 'play': list(PLAY)},
    'brooks': brooks, 'falls': falls, 'waters': [{'id': t_['name'], 'level': round(t_['level'], 2)} for t_ in tiers],
    'buildings': [b_ for b_ in B if b_['kind'] != 'tree'], 'wheel': {'x': round(float(WHEEL[0]), 2), 'z': round(float(WHEEL[1]), 2), 'yaw': round(mill_yaw, 3), 'level': round(tiers[1]['level'], 2)},
    'bridge': {'x': round(float(BRIDGE_C[0]), 2), 'z': round(float(BRIDGE_C[1]), 2), 'length': BRIDGE_LEN, 'yaw': round(math.atan2(-BRIDGE_DIR[1], BRIDGE_DIR[0]), 3)},
    'plank': {'x': round(PLANK_X, 2), 'z': round(PLANK_Z, 2), 'length': PLANK_LEN, 'yaw': round(PLANK_YAW, 3)},
    'planks': [{'x': round(float(p_['mid'][0]), 2), 'z': round(float(p_['mid'][1]), 2), 'length': p_['len'], 'yaw': round(p_['yaw'], 3)} for p_ in PLANKS],      # the three round the pit
    'paths': plan_paths, **({'pathOps': PATH_OPS} if PATH_OPS else {}), 'yards': YARDS, 'fences': FENCES, 'fields': FIELDS, 'props': PROPS, 'plants': out_plants, 'clumps': clumps, 'cover': cover, 'foliage': FOL['stamp'], **({'foliageWas': FOL['was']} if FOL.get('was') else {}), 'rocks': rocks,
    # the pit: its middle, about how far its brink is from that, how far its picture's heights were moved to stand in the bowl (the
    # abyss's clouds and the land's fading into mist are set by height), and its shelves (metres in from the brink)
    'pit': {'x': round(float(BOWL[0]), 2), 'z': round(float(BOWL[1]), 2), 'brink': 39.2, 'shift': round(PIT_SHIFT, 2), 'turn': round(PIT_TURN, 3),
            'shelves': [{'u0': 0.6, 'u1': 7.0, 'y': 1.6}, {'u0': 7.6, 'u1': 14.0, 'y': -8.8}, {'u0': 14.6, 'u1': 20.8, 'y': -17.7}, {'u0': 21.4, 'u1': 27.2, 'y': -26.0}]},      # (y: as the pit's own picture has them, before the shift)
    'split': [f_['from'] for f_ in falls if f_.get('rocks')],            # the stretches whose fall is parted by rocks in its lip: one strand between each two
    'deep': [f_['from'] for f_ in falls if f_['deep']],              # the stretches that end by falling into the pit's mist
    'inflows': inflows,                                              # where each water comes in from the margin (10)
    'spawn': {'x': round(SPAWN[0], 2), 'z': round(SPAWN[1], 2), 'yaw': VIEWS['start'][2]}, 'views': VIEWS,
}
json.dump(plan, open(OUT / 'hill-village.json', 'w'), separators=(',', ':'))
kinds = {}
for p in out_plants: kinds[p[0]] = kinds.get(p[0], 0) + 1
far_trees = sum(1 for p in out_plants if p[4] == 0.5)
for f in FIELDS:                                                       # (the check of section 4 again, on the land as it is written)
    lo_, hi_, _ = lie(rect(f['x'], f['z'], f['w'], f['d'], f['yaw']))
    if hi_ - lo_ > 1.2: print(f"  ! field {f['id']} is not on level ground: {lo_:.1f} .. {hi_:.1f} m")
for q in FENCES:
    lo_, hi_, rise_ = lie(q['points'])
    if rise_ > 1.0: print(f"  ! fence {q['id']} climbs a cliff: its ground is {lo_:.1f} .. {hi_:.1f} m, {rise_:.1f} m up in a metre at the steepest")
print(f'land {H.min():.1f} .. {H.max():.1f} m, {nx} x {nz} heights; {len(B)} buildings, {len(plan_paths)} ways, {sum(len(b_) for b_ in brooks)} water rows, {len(falls)} falls')
print(f'plants {kinds} (trees she never comes near: {far_trees}); rocks {len(rocks)}')

# the map shown in the game is painted from what was just written, so it is never a map of an older land
import runpy
runpy.run_path(str(Path(__file__).with_name('make-hill-village-map.py')), run_name='__main__')
