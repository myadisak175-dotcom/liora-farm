# make-east-ruins-heightmap.py  —  the east lake and its ruins: the land past the hill village's east edge (?east=1)
#
# The hill village's land (assets/heightmaps/hill-village.bin) ends at x = 80 for her: past it was a margin of wooded hills she
# never walked on. This tool makes the land that goes on to the east of that edge, 90 m more to walk on, as a heightmap of
# its own on the same grid (0.4 m, the same rows), so that the two lie edge to edge:
#   - west of x = 80 this land IS the village's land (copied), so the seam is the same heights on both sides;
#   - the village's old east margin (x 80 .. 110) is replaced by this land, which runs on to x = 200 (play to 170).
#
# What lies in it (from two reference maps the user picked, a waterfall among ruins and a domed temple over a river, used
# for their layout only; the user asked for one lake instead of a river, and for land with depth to it: "อยากให้ภูมิประเทศ
# มันมีมิติ"):
#   the lake        one long water from the foot of the falls in the north-east down to the south-west, where it runs out
#                   into the village's own east brook (the brook that falls into the abyss), at that brook's height (2.87 m):
#                   so it is one water with it. Cliffs stand round it on the north (the village's 10 m shelf carried east)
#                   and the east (the highland), and over its south-east (the temple's bluff); its west shore is low, a
#                   beach along the village's plain
#   the highland    the north-east: rock in ledges stacked one over another (4.6 m each), their edges wandering, from the
#                   lake's east cliff up to 38 m in the margin; the plateau (21 m) and the shelf (10 m) of the village go on
#                   east under it
#   the falls       a stream comes out of a gorge in the highland and goes over one edge into the lake's north-east bay
#                   (16 m: one drop, no steps). It comes in from beyond the land's edge, round a bend that hides where
#   the islets      rock standing out of the lake: a round flat-topped one near the temple (where a round platform will be
#                   built), and a few boulders under the east cliff
#   the bluff       the temple's: a high bank over the lake's south-east, 9.6 m, a ledge half way down its lake side,
#                   its south side a long grassy slope down to the meadow (the way up); on it the temple's floor and its
#                   walled yard, level
#   the ruins       flat floors where ruins will stand: three on the shelf over the lake, two on the plateau, one on the
#                   west shore (the ruins themselves are not built yet: this round is the land, the water and the floors)
#   the ways        along the west shore, up a ramp cut in the shelf's face to the ruins over the lake, and round the lake's
#                   south end (a ford over its outflow) up the bluff's slope to the temple
#   the rain        runnels worn down the slopes and the ledges' faces, as the land itself drains (water_shape.py)
#   the plants      planted here by the land's own rules, for the trial (east-ruins.js adds them; the village's plants in
#                   the old margin are not drawn): woods on the low ground, a few trees among the ruins, pines on the ledges
#
#   python3 tools/make-east-ruins-heightmap.py [repo] [out]
# writes  east-ruins.png   16-bit grey, white high, black low (one pixel every 0.4 m)
#         east-ruins.bin   the same as raw 16-bit numbers, little-endian (what the game reads)
#         east-ruins.json  where the land lies, the water (the lake, the stream and its fall, the outflow), the floors, the
#                          ways, the plants and the places
# The game joins this land to the village's as it loads (east-ruins.js), behind ?east=1.
# Places are metres, as in the village's plan: x east, z south. A yaw: 0 faces south (+z), pi/2 east.
import json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import water_shape as WS
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
REPO = Path(ARGS[0]) if len(ARGS) > 0 else HERE.parent
OUT = Path(ARGS[1]) if len(ARGS) > 1 else REPO / 'assets/heightmaps'
OUT.mkdir(parents=True, exist_ok=True)
sm = WS.sm

# ------------------------------------------------------------------ 0. the village's land, and this land's grid on the same lines
old = json.load(open(REPO / 'assets/heightmaps/hill-village.json'))['land']
OH = old['base'] + np.fromfile(REPO / 'assets/heightmaps/hill-village.bin', '<u2').reshape(old['nz'], old['nx']).astype(np.float64) / 65535 * old['range']
CELL = old['cell']
SEAM = float(old['play'][1])                                  # x = 80: the village's east edge
X0, X1 = 70.0, 200.0                                          # this land: 10 m of the village's own, 90 m to walk on, 30 m of margin
NX = int(round((X1 - X0) / CELL)) + 1
NZ, Z0 = old['nz'], old['z0']                                 # the village's rows, all of them
IOFF = int(round((X0 - old['x0']) / CELL))                   # the village's column of this land's first
NV = old['nx'] - IOFF                                         # how many of the village's columns lie in this land (x 70 .. 110)
iS = int(round((SEAM - X0) / CELL))                          # this land's column of the seam
PLAY = (SEAM, 170.0, float(old['play'][2]), float(old['play'][3]))      # the part she walks on: x0, x1, z0, z1
BASE, RANGE = -12.0, 64.0                                     # black is BASE metres, white BASE + RANGE
LV = 2.87                                                     # the lake's level: the village's east brook's (brook_1_meadow), which it runs into
FEED = 18.95                                                  # the stream's level on the highland, over the falls
STEP, LEDGE0 = 4.6, 10.0                                      # the highland's ledges: one every STEP metres, counted from LEDGE0 (the shelf)
rng = np.random.default_rng(2711)
JJ, II = np.mgrid[0:NZ, 0:NX].astype(np.float64)
WX = X0 + II * CELL; WZ = Z0 + JJ * CELL
LAND = WS.Land(WX, WZ, CELL)
V = np.full((NZ, NX), np.nan); V[:, :NV] = OH[:, IOFF:]       # the village's heights, where it has them
EDGE = OH[:, IOFF + iS].copy()                                # and along the seam, row by row


def noise(cell, octaves=3, gain=0.5, r=None):                 # -0.5 .. 0.5, its broadest wave `cell` metres
    r = r or rng; out = np.zeros((NZ, NX)); amp = 1.0
    for o in range(octaves):
        c = cell / 2 ** o
        g = r.random((int(NZ * CELL / c) + 4, int(NX * CELL / c) + 4))
        out += amp * ndi.zoom(g, c / CELL, order=3)[:NZ, :NX]; amp *= gain
    return (out - out.min()) / (out.max() - out.min()) - 0.5


def chaikin_closed(P, n=3):
    return WS.chaikin(P, n, closed=True)


def mask_of(poly, warp=None, closed_smooth=2):
    """a polygon (metres) as a mask over the land, its corners rounded; warp: (dx, dz) in metres at every place, the edge
    wandering by it (the place looks up the mask that far off)"""
    P = chaikin_closed(poly, closed_smooth)
    img = Image.new('L', (NX, NZ), 0); ImageDraw.Draw(img).polygon([((x - X0) / CELL, (z - Z0) / CELL) for x, z in P], fill=255)
    m = np.array(img, np.float64) / 255
    if warp is not None: m = ndi.map_coordinates(m, [JJ + warp[1] / CELL, II + warp[0] / CELL], order=1, mode='nearest')
    return m > 0.5


def signed(mask):                                             # metres inside a mask (+) or outside it (-)
    return (ndi.distance_transform_edt(mask) - ndi.distance_transform_edt(~mask)) * CELL


# the edges wander, but not at the seam (there they are the village's own) nor where something is set by hand
calm = sm(83, 98, WX)
WARP = ((noise(28, 3) * 9 + noise(8, 2) * 2.4) * calm, (noise(28, 3) * 9 + noise(8, 2) * 2.4) * calm)

# ------------------------------------------------------------------ 1. the levels the village gives: the meadow, the shelf, the plateau
H = 3.75 + 0.34 * noise(22) + 0.12 * noise(6)                # the low ground, a bank over the lake (the village's plain is 2.6 .. 3.2 at the seam: blended in, 9)
H += sm(150, 200, WX) * (2.5 + 5.0 * (noise(30) + 0.5)) * sm(120, 160, WZ)      # the meadow rises into hills in the margin (south-east)
H += sm(255, 300, WZ) * (1.2 + 2.0 * (noise(26) + 0.5))      # and toward the land's south end
SHELF = [(60, -14), (153, -14), (155, 12), (157, 31), (149, 33.2), (139, 33.0), (127, 31.6), (114, 31.0), (102, 31.6), (95, 30.4), (88, 29.4), (80, 28.9), (60, 28.9)]
PLATEAU = [(60, -140), (215, -140), (215, -20), (176, -18), (152, -14.5), (130, -11.5), (104, -9.7), (88, -9.3), (60, -9.25)]
sd_shelf = signed(mask_of(SHELF, WARP)); sd_plat = signed(mask_of(PLATEAU, WARP))
riser = lambda sd, w=0.75: sm(-w, w, sd)                      # an edge between two levels: a cliff, a metre and a half of run
shelf_h = 9.8 + 0.28 * noise(14) + 0.1 * noise(4)
plat_h = 21.4 + 0.36 * noise(16) + 0.1 * noise(4)
H = H + (shelf_h - H) * riser(sd_shelf)
H = H + (plat_h - H) * riser(sd_plat)

# ------------------------------------------------------------------ 2. the highland: ledges stacked over one another
HIGHLAND = [(132, -140), (215, -140), (215, 150), (176, 143), (162, 136), (154, 127), (151.5, 110), (150.5, 92), (152, 76), (155.5, 62),
            (157.6, 52), (157.6, 39), (155.5, 28), (153.5, 10), (149, -4), (140, -14.5), (129, -24), (125.5, -42), (127.5, -64), (131, -100)]
hmask = mask_of(HIGHLAND, WARP, 3)
sd_high = signed(hmask)
north = sm(-6, -18, WZ)                                       # north of the shelf it rises from the plateau, beside the lake from the shelf
foot = 14.2 * (1 - north) + 22.6 * north
twist = (noise(34, 3) * 13 + noise(11, 2) * 3.5, noise(34, 3) * 13 + noise(11, 2) * 3.5)      # (the ledges' outlines: their own wander, in lobes and fingers, so no two lie alike)
dd = ndi.map_coordinates(np.maximum(sd_high, 0), [JJ + twist[1] / CELL, II + twist[0] / CELL], order=1, mode='nearest')
lobes = np.abs(noise(26, 3)) * 2 - 0.5                        # (ridged: spurs that run out and hollows that run in)
raw = foot + 0.34 * dd * (1 + 0.4 * noise(40)) + 9.0 * noise(32, 3) + 3.2 * lobes + 1.4 * noise(9, 2)
raw += 9.0 * np.exp(-((WX - 191.0) ** 2 + (WZ - 4.0) ** 2) / (2 * 7.0 ** 2))      # a crag at the gorge's bend in the margin: where the stream comes from is never seen
LIP = (159.6, 45.2)                                           # where the stream goes over, into the lake's north-east bay
GORGE = [(205, -2), (199, 6), (193, 14), (187, 23), (181, 32), (174, 39), (166, 43.4), (161, 45.0), LIP]
Qg, sg = WS.densify(WS.chaikin(GORGE, 2), 0.4)
_, Dg, Ig = LAND.near_line(Qg, 30.0)
raw += 8.0 * np.exp(-((WX - LIP[0] - 6.0) ** 2 + (WZ - LIP[1]) ** 2) / (2 * 8.0 ** 2))      # (the ledges stand high round the lip: the stream goes over from the 19 m one or higher, never onto a lower)
raw = np.where((WX > LIP[0]) & (Dg < 14.0), np.maximum(raw, 21.5 + 0.12 * Dg + 2.0 * np.exp(-(Dg / 9.0) ** 2) - 3.0 * sm(9.0, 14.0, Dg)), raw)      # (and all along the gorge: the stream runs in a cut through high ground, a wall either side)
raw = np.maximum(raw, foot)
step = STEP * (1 + 0.32 * noise(55, 2))                       # ledges of different heights, here three metres, there six
t = (raw - LEDGE0) / step
RISE = 0.15                                                   # each ledge's face: this much of a step's run (steep)
ledges = LEDGE0 + step * (np.floor(t) + sm(1 - RISE, 1.0, t - np.floor(t)))
ledges += 0.25 * noise(11) + 0.08 * noise(3)                  # (a ledge's top rolls a little)
ledges = np.minimum(ledges, 38.0 + 2 * noise(20))             # (the margin's tops)
H = H + (np.maximum(H, ledges) - H) * riser(sd_high, 0.9)

# ------------------------------------------------------------------ 3. the gorge the stream comes down, and the shelf over the falls
wg = 3.4 + 1.3 * WS.wave(rng, len(Qg), 0.4, 14.0)            # the gorge's floor: half as wide as this, and wandering
wg = wg * (1 + 0.9 * sm(16, 3, sg[-1] - sg))                  # (it opens into a shelf at the lip, over the falls)
half = wg[Ig]
floor_g = 19.35 + 0.15 * noise(6)
wall = floor_g + np.maximum(0, Dg - half) * (2.6 + 0.8 * noise(7))
near_lip = np.hypot(WX - LIP[0], WZ - LIP[1])
gorge_cut = np.where(Dg < 30, wall, 1e6)
H = np.where(WX > LIP[0] - 2.0, np.minimum(H, gorge_cut), H)  # the gorge, cut through the ledges
# its mouth: the gorge's floor runs out level to the lip, and from the lip the rock goes down sheer into the bay (no ledge
# under the fall to catch it: the bay is cut in to the lip, below)
mouth = (WX >= LIP[0] - 0.1) & (WX < LIP[0] + 2.2) & (np.abs(WZ - LIP[1]) < 3.4)
H = np.where(mouth & (H < floor_g), floor_g, H)

# ------------------------------------------------------------------ 4. the temple's bluff
BLUFF = [(126.5, 151), (131.5, 141.5), (146, 137.5), (160, 136.5), (176, 140), (180, 214), (163, 216), (148.5, 212.5), (137.5, 206), (131, 197), (127, 183), (125.8, 165)]
sd_b = signed(mask_of(BLUFF, (WARP[0] * 0.45, WARP[1] * 0.45), 3))
TOP = 9.6
top_h = TOP + 0.22 * noise(12)
BC = np.array([151.0, 176.0])
toward = np.arctan2(WZ - BC[1], WX - BC[0])                   # which way from the bluff's middle: its south and east sides are slopes
slope_side = np.clip(np.maximum(sm(0.25, 0.75, np.sin(toward)), sm(0.55, 0.9, np.cos(toward))), 0, 1)
slope_side = ndi.gaussian_filter(slope_side, 6)
gentle = top_h - 0.2 * np.maximum(0, -sd_b) * (1 + 0.2 * noise(10))      # the long slope down to the meadow
mid = 6.15 + 0.2 * noise(7)                                   # the ledge half way down its lake side
steep = np.where(sd_b > -5.6, mid + (top_h - mid) * riser(sd_b, 0.6), -1e3)
steep = np.where(sd_b > -5.6, np.maximum(steep, H + (mid - H) * sm(-5.6, -4.6, sd_b)), -1e3)
bluff = gentle * slope_side + steep * (1 - slope_side)
H = np.maximum(H, bluff)

# ------------------------------------------------------------------ 5. the lake: its shore, its bed; the islets
LAKE = [(98, 38.5), (104, 35.6), (110, 36.8), (114, 40.5), (118, 37.0), (124, 35.4), (131, 37.8), (139, 36.4), (149.5, 38.4), (155.5, 40.0), (158.6, 41.6),
        (160.0, 45.2), (158.6, 48.8), (156.2, 52.5), (152.8, 60), (149.8, 74), (148.6, 88), (154.5, 96), (153.0, 106), (150.2, 112), (146.4, 126), (137.5, 136.2), (128.2, 143.5),
        (122.6, 157), (122.2, 174), (117.6, 189), (108.6, 199), (99.6, 206.4), (94.0, 211.0), (90.0, 209.8), (90.6, 199), (92.4, 186), (93.4, 168),
        (97.5, 160), (104.0, 154.5), (100.5, 148.5), (93.6, 145), (93.0, 128), (96.4, 110), (95.0, 90), (92.2, 72), (93.4, 54)]
shore_warp = (noise(12, 2) * 2.2 * sm(10, 4, near_lip), noise(12, 2) * 2.2 * sm(10, 4, near_lip))      # (the shore wanders a little, not at the falls)
lake = mask_of(LAKE, shore_warp, 3)
sd_l = signed(lake)
land_round = ndi.maximum_filter(np.where(lake, -1e3, H), size=int(7 / CELL))      # the highest land just round each spot
cliffy = sm(LV + 3.0, LV + 7.0, land_round)                   # (by a cliff the water is deep at once: no shallows at its foot)
depth = 0.04 + 3.7 * sm(0, 19, sd_l) ** 0.85 + 1.6 * cliffy * sm(0, 3.5, sd_l) + 0.35 * noise(9) * sm(0, 6, sd_l)
depth += 1.6 * np.exp(-((WX - 155.6) ** 2 + (WZ - 45.4) ** 2) / (2 * 4.6 ** 2))      # the pool the fall has dug (no deeper than the lake's deep middle by much: land-water.js takes ground far under a water's usual bed for air)
bed = LV - depth
H = np.where(lake, np.minimum(H, bed), H)
# under the cliffs round the lake a broken ledge lies a few metres over the water here and there (the cliff came down in
# steps, and a step stayed): not under the falls, where the water drops clear
foot_band = (~lake) & (sd_l > -(2.6 + 2.2 * (noise(9) + 0.5))) & (H > LV + 6.0) & (near_lip > 10.0) & (noise(17, 2) > -0.05)
H = np.where(foot_band, np.minimum(H, LV + 3.4 + 0.5 * noise(5) + 0.9 * np.maximum(0, 0.5 + sd_l / 4.0)), H)
# the low shore: a beach that goes down into the water; by the cliffs nothing changes (they come up out of the water)
beach = LV + 0.07 + 0.11 * np.maximum(0, -sd_l) + 0.006 * np.maximum(0, -sd_l) ** 2
H = np.where(~lake & (sd_l > -9), np.minimum(H, np.where(H < LV + 1.6, np.maximum(beach, H - 0.0 * beach), H)), H)
H = np.where(~lake & (sd_l > -9) & (H < LV + 1.4), np.minimum(H, beach + 0.12 * noise(5)), H)
H = np.where(~lake, np.maximum(H, LV + 0.05), H)              # (nothing outside the shore lies under the water's level: no puddle beside the lake)
ISLETS = [  # x, z, radius of its top, its top's height, flat (the platform's) or a rock
    (108.0, 172.0, 5.4, 4.35, True), (146.2, 81.0, 2.4, 4.9, False), (139.6, 103.0, 1.8, 3.95, False), (152.2, 62.0, 1.6, 4.5, False),
    (126.2, 150.5, 2.0, 4.15, False), (117.8, 121.0, 1.3, 3.55, False)]
for x, z, r, top, flat in ISLETS:
    d = np.hypot(WX - x, WZ - z) * (1 + 0.06 * noise(4))
    if flat: h = np.where(d < r, top, top - (d - r) * (2.6 + 0.6 * noise(3)))      # a round flat top, its side rock
    else: h = top - (d / r) ** 2 * 0.9 - np.maximum(0, d - r) * 2.2 + 0.25 * noise(2)
    H = np.maximum(H, h)

# ------------------------------------------------------------------ 6. the stream on the highland and its bed; the outflow
def line_rows(Q, s, w, level, every=1.0, pad=0.25):
    """a water's rows along its bed line: every `every` metres, each as wide as the water its bed holds there (out either side
    to where the ground first comes up to the water's level: the bed is wider than its riffle's half width on a bend)"""
    T = np.gradient(Q, axis=0); T /= np.linalg.norm(T, axis=1)[:, None] + 1e-9
    out, last = [], -1e9
    for k in range(len(Q)):
        if s[k] - last >= every or k == len(Q) - 1:
            n = np.array([-T[k, 1], T[k, 0]]); reach = []
            for side in (1, -1):
                r = np.arange(0.1, 7.0, 0.1); P = Q[k] + side * r[:, None] * n
                up = LAND.sample(H, P) >= level - 0.02
                reach.append(float(r[np.argmax(up)]) if up.any() else float(w[k]))
            out.append([round(float(Q[k, 0]), 2), round(float(Q[k, 1]), 2), level, round(max(float(w[k]), max(reach)) + pad, 2)]); last = s[k]
    return out


feed_pts = [(193.5, 13.0), (187, 23), (181, 32), (174, 39), (167, 43.4), (162.6, 45.0), (LIP[0] + 0.5, LIP[1])]
Qf, sf = WS.bed_line(rng, feed_pts, 0.8, hold=[(LIP[0], LIP[1], 5.0)], corners=2)
Cf, mf, wf, depf, _ = WS.channel(LAND, rng, Qf, sf, np.full(len(Qf), FEED), 1.35, 0.42, falls=(), reach=7.0)
H = np.where(mf, np.minimum(H, Cf), H)
# the outflow: from the lake's south-west end into the village's brook, at the same height (and the brook's bed carried on
# from the seam to where its plan begins, 83.75 m)
OUT_AT = (93.4, 210.6)                                        # the lake's end: its outflow begins here
out_pts = [OUT_AT, (91.6, 213.4), (89.2, 217.2), (86.2, 220.9), (83.75, 222.38), (81.4, 222.25), (79.6, 222.22)]
Qo, so = WS.bed_line(rng, out_pts, 0.6, hold=[(83.75, 222.38, 6.0), (OUT_AT[0], OUT_AT[1], 4.0)], corners=1)
ford_s = float(so[np.argmin(np.hypot(Qo[:, 0] - 89.0, Qo[:, 1] - 217.7))])
Co, mo, wo, depo, _ = WS.channel(LAND, rng, Qo, so, np.full(len(Qo), LV), 2.05, 0.42, fords=(ford_s,), reach=8.0)
H = np.where(mo & (WX > SEAM + 0.2), np.minimum(H, Co), H)

# ------------------------------------------------------------------ 7. the floors: the temple's, its yard's, the ruins'; the ways
def level_rect(cx, cz, w, d_, yaw, level, feather=2.2, r=1.2):
    c, s_ = math.cos(yaw), math.sin(yaw)
    lx = (WX - cx) * c - (WZ - cz) * s_; lz = (WX - cx) * s_ + (WZ - cz) * c
    q = np.hypot(np.maximum(np.abs(lx) - (w / 2 - r), 0), np.maximum(np.abs(lz) - (d_ / 2 - r), 0)) - r      # metres outside the rounded box
    k = sm(feather, 0, q)
    return H + (level - H) * k


FLOORS = {
    'temple': dict(x=146.0, z=175.0, w=14.0, d=34.0, yaw=0.0, y=TOP + 0.15),
    'yard': dict(x=161.0, z=176.0, w=11.0, d=22.0, yaw=0.0, y=TOP + 0.15),
    'platform': dict(x=108.0, z=172.0, r=5.4, y=4.35),
}
RUINS = [  # x, z, w, d, yaw: where a ruin will stand, level as the ground it stands on
    (93.5, 6.5, 10, 10, 0.08), (112.0, 13.5, 12, 12, -0.12), (129.5, 5.0, 10, 10, 0.2),
    (97.5, -47.0, 11, 10, 0.05), (119.0, -35.5, 10, 9, -0.25), (87.0, 64.0, 6.5, 8.0, 0.1)]
for k in ('temple', 'yard'):
    f = FLOORS[k]; H = level_rect(f['x'], f['z'], f['w'], f['d'], f['yaw'], f['y'])
floors_out = []
for (x, z, w, d_, yaw) in RUINS:
    i, j = int(round((x - X0) / CELL)), int(round((z - Z0) / CELL))
    y = float(np.median(H[j - 6:j + 7, i - 6:i + 7]))
    H = level_rect(x, z, w + 1.0, d_ + 1.0, yaw, y, feather=1.6, r=1.0)
    floors_out.append({'x': x, 'z': z, 'w': w, 'd': d_, 'yaw': yaw, 'y': round(y, 2)})

# the ways (painted by the game as the village's are): (id, half width, points); where one climbs, a ramp is cut for it
WAYS = [
    ('shore', 1.25, [(73.8, 70.0), (80.5, 72.0), (86.0, 76.0), (87.8, 92.0), (88.4, 112.0), (87.6, 132.0), (88.6, 152.0), (88.4, 172.0), (87.6, 190.0), (88.4, 204.0), (89.2, 216.0), (92.0, 222.5)]),
    ('ramp', 1.2, [(86.0, 76.0), (86.4, 60.0), (87.2, 47.0), (89.6, 38.0), (95.0, 33.2), (101.5, 29.0), (106.0, 22.5), (111.0, 15.5)]),
    ('ruins', 1.0, [(101.5, 29.0), (96.0, 18.0), (93.5, 11.5)]),
    ('temple', 1.3, [(92.0, 222.5), (104.0, 225.0), (118.0, 228.0), (132.0, 230.0), (143.0, 226.0), (148.5, 218.0), (147.0, 204.0), (146.0, 192.0)]),
]
RAMP = {'ramp': [(0.0, None), (14.0, None), (29.0, 3.7), (40.0, 6.0), (47.5, 8.3), (55.0, 9.75), (62.0, None), (70.0, None)]}      # metres along the way -> its height (None: the ground's)


def carve_way(pts, half, prof):
    Q, s = WS.densify(WS.chaikin(pts, 2), 0.3)
    g = LAND.sample(ndi.gaussian_filter(H, 2.0), Q)
    known = [(a, b) for a, b in prof if b is not None]
    y = np.interp(s, [a for a, _ in known], [b for _, b in known])
    k = np.clip(np.interp(s, [a for a, _ in prof], [0.0 if b is None else 1.0 for _, b in prof]), 0, 1)
    y = g * (1 - k) + y * k                                   # (where it is the ground's, it is the ground's)
    m, D, I = LAND.near_line(Q, half + 4.0)
    tgt = y[I]; inside = sm(half + 3.2, half + 0.5, D) * k[I]
    return np.where(m, H + (tgt - H) * inside, H), Q
ways_out = []
for wid, half, pts in WAYS:
    if wid in RAMP: H, _ = carve_way(pts, half, RAMP[wid])
    ways_out.append({'id': wid, 'half': half, 'points': [[round(x, 2), round(z, 2)] for x, z in pts]})

# ------------------------------------------------------------------ 8. the rain: runnels down the slopes and the ledges' faces
keep = lake | (np.hypot(WX - 146, WZ - 175) < 22) | (WX < SEAM + 8)      # (not in the lake, on the temple's floors, nor by the seam)
for (x, z, w, d_, yaw) in RUINS: keep |= (np.abs(WX - x) < w / 2 + 3) & (np.abs(WZ - z) < d_ / 2 + 3)
keep |= mf | mo
for wid, half, pts in WAYS:
    Q, _ = WS.densify(pts, 0.5); m, D, _ = LAND.near_line(Q, half + 2.5); keep |= m
edge = np.zeros_like(lake); edge[0, :] = edge[-1, :] = edge[:, -1] = True
FLOW, fall = WS.flow(ndi.gaussian_filter(H, 1.0), edge | lake | mf | mo, CELL, along=True)
worn = WS.runnels(FLOW, ndi.gaussian_filter(fall, 1.5), CELL, where=(~keep).astype(float), deep=0.9, swale=0.08, start=60.0, full=900.0)
H = H - worn * sm(SEAM + 8, SEAM + 14, WX)

# ------------------------------------------------------------------ 9. the seam: west of it the village's own; ten metres to blend
w = sm(SEAM, SEAM + 10.0, WX)
H = EDGE[:, None] * (1 - w) + H * w
H = np.where(mo & (WX > SEAM + 0.2), np.minimum(H, Co), H)    # (the outflow's bed runs on through the blend to the seam)
H[:, :iS + 1] = V[:, :iS + 1]                                 # (to the seam: exactly the village's)

# ------------------------------------------------------------------ 11. the places to start from (name -> x, z, the way she faces)
face = lambda a, b: round(math.atan2(b[0] - a[0], b[1] - a[1]), 2)
GO = {
    'ea-shore': (88.0, 124.0, face((88, 124), (130, 100))),
    'ea-falls': (127.0, 26.5, face((127, 26.5), (160, 45))),
    'ea-ruins': (104.0, 8.5, face((104, 8.5), (122, 40))),
    'ea-plateau': (106.0, -36.0, face((106, -36), (150, -40))),
    'ea-ridge': (164.0, 62.0, face((164, 62), (112, 100))),
    'ea-temple': (135.0, 145.5, face((135, 145.5), (124, 80))),
    'ea-islet': (108.0, 172.0, face((108, 172), (146, 175))),
    'ea-outflow': (96.0, 223.5, face((96, 223.5), (118, 160))),
}
for k, (x, z, _) in GO.items():
    i, j = int(round((x - X0) / CELL)), int(round((z - Z0) / CELL))
    assert not lake[j, i] or k == 'ea-islet', k

# ------------------------------------------------------------------ 10. the plants (for the trial: the game adds them; see east-ruins.js)
prng = np.random.default_rng(4513)
slope = LAND.slope(ndi.gaussian_filter(H, 1.0))
def ok(x, z, r=1.2, flat=0.45):
    if not (PLAY[0] + 1 < x < X1 - 4 and Z0 + 6 < z < Z0 + (NZ - 1) * CELL - 6): return False
    i, j = int(round((x - X0) / CELL)), int(round((z - Z0) / CELL))
    if lake[j, i] or H[j, i] < LV + 0.35 or slope[j, i] > flat: return False
    if any(abs(x - rx) < rw / 2 + r and abs(z - rz) < rd / 2 + r for rx, rz, rw, rd, _ in RUINS): return False
    if abs(x - 146) < 12 + r and abs(z - 175) < 22 + r: return False
    for wid, half, pts in WAYS:
        Q, _ = WS.densify(pts, 0.5)
        if np.min(np.hypot(Q[:, 0] - x, Q[:, 1] - z)) < half + r: return False
    if np.min(np.hypot(Qf[:, 0] - x, Qf[:, 1] - z)) < 3 + r or np.min(np.hypot(Qo[:, 0] - x, Qo[:, 1] - z)) < 3 + r: return False
    for gx, gz, gyaw in GO.values():                          # (nothing grows where she starts, nor in the first metres of the way she looks)
        if math.hypot(x - gx, z - gz) < 6 + r: return False
        ax, az = x - gx, z - gz; al = ax * math.sin(gyaw) + az * math.cos(gyaw)
        if 0 < al < 22 and abs(ax * math.cos(gyaw) - az * math.sin(gyaw)) < 3.5 + al * 0.25 + r: return False
    return True
plants, cover, placed = [], [], []
def put(kind, x, z, scale, detail=0.8, bed=None):
    rad = {'oak': 3.0, 'broadleaf': 2.6, 'birch': 1.8, 'pine': 2.0, 'sapling': 1.4, 'bush': 1.1, 'flower': 1.4}[kind] * scale * 0.55
    if any(math.hypot(x - a, z - b) < rad + c for a, b, c in placed): return False
    if not ok(x, z, rad * 0.6 + 0.6, 0.62 if kind in ('pine', 'sapling', 'bush') else 0.45): return False
    placed.append((x, z, rad))
    plants.append([kind, round(x, 2), round(z, 2), round(scale, 2), bed if kind == 'flower' else round(detail, 2), 0, round(float(prng.uniform(0, 360)), 1), int(prng.integers(100, 900))])
    return True
def grove(cx, cz, rad, n, kinds, scale=(0.9, 1.15), detail=0.8):
    names, weights = zip(*kinds); weights = np.array(weights) / sum(weights)
    for _ in range(n * 4):
        if n <= 0: break
        a, rr = prng.uniform(0, 2 * math.pi), rad * math.sqrt(prng.uniform(0, 1))
        k = str(prng.choice(names, p=weights)); base = {'oak': 2.0, 'broadleaf': 1.6, 'birch': 1.4, 'pine': 1.45, 'sapling': 1.05, 'bush': 1.0}[k]
        if put(k, cx + rr * math.cos(a), cz + rr * math.sin(a), base * prng.uniform(*scale), detail): n -= 1
def colony(kind, cx, cz, n, spread=2.2):
    c = len(cover) + 1000
    for _ in range(n):
        x, z = cx + prng.normal(0, spread), cz + prng.normal(0, spread)
        if ok(x, z, 0.3, 0.7): cover.append([kind, round(x, 2), round(z, 2), round(float(prng.uniform(0.85, 1.2)), 2), c])
# the woods south of the lake and round the bluff's slope, a wood's edge open toward the temple's way
for cx, cz, r, n in [(110, 244, 12, 12), (130, 248, 11, 10), (152, 246, 10, 8), (100, 236, 7, 5), (162, 228, 8, 6), (124, 214, 6, 4)]:
    grove(cx, cz, r, n, [('broadleaf', 4), ('oak', 2), ('birch', 2), ('sapling', 3)])
# the west shore: birches and saplings in small groups, flowers by the beach
for cx, cz in [(84, 96), (84.5, 140), (84, 168), (84.5, 188), (85, 120)]:
    grove(cx, cz, 4.0, 3, [('birch', 3), ('sapling', 3), ('broadleaf', 1)])
for cx, cz, col in [(89.5, 104, 'yellow'), (90, 158, 'pink'), (89, 180, 'blue'), (88.5, 84, 'pink')]:
    put('flower', cx, cz, 1.2, bed=col)
# among the ruins on the shelf and the plateau: a few old trees, saplings coming up in the floors' edges
for cx, cz, r, n in [(102, 2, 5, 3), (121, 20, 5, 3), (138, 10, 5, 3), (108, -44, 7, 4), (126, -50, 6, 3), (90, -30, 6, 3), (112, -22, 5, 2)]:
    grove(cx, cz, r, n, [('oak', 2), ('broadleaf', 2), ('sapling', 3), ('birch', 1)])
# pines on the ledges' tops, the higher the more; a few on the bluff's edges
for _ in range(220):
    x, z = prng.uniform(136, 168), prng.uniform(-78, 135)
    i, j = int(round((x - X0) / CELL)), int(round((z - Z0) / CELL))
    if H[j, i] < 13.5 or prng.uniform() > 0.42: continue
    put('pine', x, z, 1.45 * prng.uniform(0.85, 1.12), 0.8 if x < 160 else 0.5)
for cx, cz in [(132, 146), (168, 152), (170, 200), (134, 200)]:
    grove(cx, cz, 4.0, 2, [('broadleaf', 2), ('birch', 2), ('pine', 1)])
# ferns and tufts at the woods' feet and along the shore
for p in list(plants):
    if p[0] in ('broadleaf', 'oak', 'birch') and prng.uniform() < 0.45: colony('fern' if prng.uniform() < 0.5 else 'tuft', p[1], p[2], int(prng.integers(4, 9)), 1.8)
for z in range(80, 200, 14): colony('tuft', 89.2 + prng.uniform(-0.6, 0.6), z + prng.uniform(-4, 4), 6, 1.4)

# ------------------------------------------------------------------ 12. write it all out
feeder = line_rows(Qf, sf, wf, FEED)                          # (the waters' rows, from the land as it is now finished)
outflow = [r for r in line_rows(Qo, so, wo, LV, 1.0, 0.3) if r[0] > 83.9]      # (its rows go before the brook's own, which begin at 83.75)
for r in outflow[:2]: r[3] = min(r[3], 3.0)                   # (its first row is the lake's last: there it is as wide as the channel's mouth, not the lake)
U = np.clip(np.round((H - BASE) / RANGE * 65535), 0, 65535).astype('<u2')
U.tofile(OUT / 'east-ruins.bin')
Image.fromarray(U.astype(np.uint16)).save(OUT / 'east-ruins.png')
lake_rows = []                                                # the lake's line, north to south-west, with how far its water may reach at each row
spine = [(158.4, 45.2), (152.5, 46.5), (141.0, 50.0), (130.0, 60.0), (124.0, 76.0), (121.5, 94.0), (121.0, 112.0), (117.0, 128.0), (111.0, 142.0), (107.0, 156.0),
         (105.0, 172.0), (104.0, 186.0), (100.5, 198.0), (96.4, 205.6), OUT_AT]
Qs, ss_ = WS.densify(WS.chaikin(spine, 2), 1.2)
inside_pts = np.column_stack([WX[lake], WZ[lake]])
from scipy.spatial import cKDTree
tree = cKDTree(Qs)
dist, near = tree.query(inside_pts)
reach = np.zeros(len(Qs))
np.maximum.at(reach, near, dist)
reach = ndi.maximum_filter1d(reach, 5)
for k, (x, z) in enumerate(Qs): lake_rows.append([round(float(x), 2), round(float(z), 2), LV, round(float(reach[k] + 1.2), 2)])
plan = {
    'land': {'x0': X0, 'z0': Z0, 'cell': CELL, 'nx': NX, 'nz': NZ, 'base': BASE, 'range': RANGE, 'play': list(PLAY)},
    'joins': {'land': 'hill-village', 'seam_x': SEAM, 'same_to_x': SEAM, 'replaces_margin': [SEAM, float(old['x0'] + (old['nx'] - 1) * CELL)],
              'note': "same grid as hill-village (cell, rows); every height at x <= seam_x is hill-village's own; east of it hill-village's margin is replaced by this land, which runs on to x1"},
    'water': {
        'lake': {'id': 'ea_lake', 'level': LV, 'rows': lake_rows, 'box': [round(float(WX[lake].min()) - 2, 1), round(float(WX[lake].max()) + 2, 1), round(float(WZ[lake].min()) - 2, 1), round(float(WZ[lake].max()) + 2, 1)]},
        'stream': {'id': 'ea_stream', 'level': FEED, 'rows': feeder},
        'fall': {'x': LIP[0], 'z': LIP[1], 'top': FEED, 'bottom': LV, 'width': round(float(2 * wf[-1]), 2), 'yaw': face(feeder[-3][:2], feeder[-1][:2]), 'deep': 0, 'out': 1.6},
        'outflow': {'into': 'brook_1_meadow', 'rows': outflow},
    },
    'floors': {'temple': FLOORS['temple'], 'yard': FLOORS['yard'], 'platform': FLOORS['platform'], 'ruins': floors_out},
    'islets': [{'x': x, 'z': z, 'r': r, 'top': top} for x, z, r, top, _ in ISLETS],
    'ways': ways_out,
    'plants': plants, 'cover': cover,
    'go': {k: [x, z, yaw] for k, (x, z, yaw) in GO.items()},
}
(OUT / 'east-ruins.json').write_text(json.dumps(plan, ensure_ascii=False, separators=(',', ':')))
print('[east-ruins] land', NX, 'x', NZ, 'heights', round(float(H.min()), 2), '..', round(float(H.max()), 2),
      '| lake', int(lake.sum() * CELL * CELL), 'm2,', len(lake_rows), 'rows | stream', len(feeder), 'rows | outflow', len(outflow), 'rows',
      '| plants', len(plants), 'cover', len(cover))
