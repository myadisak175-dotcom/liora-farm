# make-west-fringe-heightmap.py  —  the west fringe (ชนบทชายขอบ): the neglected land west of the hill village
#
# The hill village's land (assets/heightmaps/hill-village.bin) ends at x = -80, where its road comes in and where the
# empty meadow south of the village lies. This tool makes the land that goes on to the west of that edge, 200 m by 247 m to
# walk on, as a heightmap of its own, on the same grid (0.4 m, the same rows) so that the two lie edge to edge:
#   - east of x = -80 this land IS the village's land (copied), so the seam is the same heights on both sides;
#   - the village's old margin (x -110 .. -80, wooded hills she never walked on) is replaced by this land.
#
# What lies in it (the countryside the capital forgot: dry, sunk, fallen in):
#   the old road      from the village's road, along the shelf under the north cliff, through the hamlet, down and out by a
#                     pass in the west hills (the way to the capital)
#   the lost hamlet   a round shelf held in a crescent of cliff, six house floors round a yard, part of its rim fallen away,
#                     a rock fall against the cliff; the old well below it, by the road
#   the dry water     a gully from the west hills, a dry pond (an islet in it), and a dry brook going down three level
#                     reaches to the village's own brook at the seam (so the water can come back one day and flow on).
#                     Made as water makes it, not dug: the pond a shore, shallows, strandlines and a basin (3); the beds
#                     wandering, pool and riffle, cut bank and bar, a pool under each dry fall (6); and the runnels the
#                     rain would wear where it gathers and runs down to them, worked out from the land itself (6)
#   the sunken land   the low ground has dropped in two steps toward the village (two broken scarps, 1.4 and 1.5 m, each with
#                     places where it has slumped to a slope); a sagged field, three sinkholes (one has taken the road), two cracks
#   the dead hill     in the south-west, 14 m, ribbed with gullies, a crag by its flat top, a way winding up, a slip scar on its
#                     north face
#
#   python3 tools/make-west-fringe-heightmap.py [repo] [out] [--into-map]
# writes  west-fringe.png   16-bit grey, white high, black low (601 x 778, one pixel every 0.4 m)
#         west-fringe.bin   the same as raw 16-bit numbers, little-endian (what the game reads)
#         west-fringe.json  where the land lies, the ways, the house floors, the well, the dry water, the dead trees, the places
# The game joins this land to the village's as it loads (west-fringe.js): it is part of the hill village's map.
#
# The dead trees are planted here once, and then put into the map's own foliage with --into-map: that writes them (and the
# village's old margin plants taken out) as hill-village-foliage-edits.json, which make-hill-village-heightmap.py lays over the
# map's kept foliage. From then on they are the map's plants, arranged by hand in the game like any other (foliage-editor.js);
# running this tool again does not move them.
# Places are metres, as in the village's plan: x east, z south.
import json, math, sys, zlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.interpolate import RBFInterpolator
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
REPO = Path(ARGS[0]) if len(ARGS) > 0 else HERE.parent
OUT = Path(ARGS[1]) if len(ARGS) > 1 else REPO / 'assets/heightmaps'
OUT.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------------ 0. the village's land, and this land's grid on the same lines
old = json.load(open(REPO / 'assets/heightmaps/hill-village.json'))['land']
OH = old['base'] + np.fromfile(REPO / 'assets/heightmaps/hill-village.bin', '<u2').reshape(old['nz'], old['nx']).astype(np.float64) / 65535 * old['range']
CELL = old['cell']
SEAM = float(old['play'][0])                                  # x = -80: the village's west edge
X0, X1 = -310.0, -70.0                                        # this land: 30 m of margin, 200 m to walk on, and 10 m of the village's own
NX = int(round((X1 - X0) / CELL)) + 1
JOFF = 285; Z0 = old['z0'] + JOFF * CELL; NZ = old['nz'] - JOFF   # rows: the village's own, from z = -10 to its south end
IOFF = int(round((old['x0'] - X0) / CELL))                   # this land's column of the village's first
PLAY = (-280.0, SEAM, 10.0, float(old['play'][3]))           # the part she walks on: x0, x1, z0, z1
BASE, RANGE = 0.0, 40.0                                       # black is BASE metres, white BASE + RANGE
rng = np.random.default_rng(1117)
JJ, II = np.mgrid[0:NZ, 0:NX].astype(np.float64)
WX = X0 + II * CELL; WZ = Z0 + JJ * CELL


def sm(a, b, x):                                              # 0 at a, 1 at b, smooth between (a may be the greater)
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def noise(cell, octaves=3, gain=0.5):                         # -0.5 .. 0.5, its broadest wave `cell` metres
    out = np.zeros((NZ, NX)); amp = 1.0
    for o in range(octaves):
        c = cell / 2 ** o
        g = rng.random((int(NZ * CELL / c) + 4, int(NX * CELL / c) + 4))
        out += amp * ndi.zoom(g, c / CELL, order=3)[:NZ, :NX]; amp *= gain
    return (out - out.min()) / (out.max() - out.min()) - 0.5


rw = np.random.default_rng(3301)                              # the dry water's own dice (the land's are left to fall as they did)


def wnoise(cell, octaves=2, gain=0.5):                        # as noise(), with the water's dice
    out = np.zeros((NZ, NX)); amp = 1.0
    for o in range(octaves):
        c = cell / 2 ** o
        g = rw.random((int(NZ * CELL / c) + 4, int(NX * CELL / c) + 4))
        out += amp * ndi.zoom(g, c / CELL, order=3)[:NZ, :NX]; amp *= gain
    return (out - out.min()) / (out.max() - out.min()) - 0.5


def wave(n, step, cell):                                      # smooth noise along a line: -1 .. 1 at n points `step` metres apart, its wave `cell` metres
    g = rw.uniform(-1, 1, int(n * step / cell) + 6)
    return np.clip(ndi.map_coordinates(g, [np.arange(n) * step / cell + 1.5], order=3, mode='nearest'), -1, 1)


def lower(a, b, k=0.16):                                      # the lower of two surfaces, rounded where they meet (k metres): no crease
    return -k * np.logaddexp(-a / k, -b / k)


def chaikin(P, n=3, closed=False):                            # corners cut off a line, n times
    P = np.asarray(P, float)
    for _ in range(n):
        A, B = (P, np.roll(P, -1, 0)) if closed else (P[:-1], P[1:])
        Q = np.empty((2 * len(A), 2)); Q[0::2] = .75 * A + .25 * B; Q[1::2] = .25 * A + .75 * B
        P = Q if closed else np.vstack([P[:1], Q, P[-1:]])
    return P


def poly_sd(pts):                                             # metres from a shape's edge: + inside, - outside
    SS = 2
    img = Image.new('L', (NX * SS, NZ * SS), 0)
    ImageDraw.Draw(img).polygon([((x - X0) / CELL * SS + .5, (z - Z0) / CELL * SS + .5) for x, z in pts], fill=255)
    m = np.array(img) > 127
    sd = (ndi.distance_transform_edt(m) - ndi.distance_transform_edt(~m)) * CELL / SS
    return sd.reshape(NZ, SS, NX, SS).mean((1, 3))


def surface(ctrl, smoothing=0.0):                             # a smooth sheet through heights given at a few places
    c = np.asarray(ctrl, float)
    f = RBFInterpolator(c[:, :2], c[:, 2], kernel='thin_plate_spline', smoothing=smoothing)
    return f(np.column_stack([WX.ravel(), WZ.ravel()])).reshape(NZ, NX)


def sample(F, P):
    P = np.asarray(P, float)
    return ndi.map_coordinates(F, [(P[:, 1] - Z0) / CELL, (P[:, 0] - X0) / CELL], order=1, mode='nearest')


def densify(pts, step=0.4):
    P = np.asarray(pts, float); out = [P[:1]]
    for a, b in zip(P[:-1], P[1:]):
        n = max(1, int(math.ceil(np.linalg.norm(b - a) / step)))
        out.append(a + (b - a) * (np.arange(1, n + 1) / n)[:, None])
    Q = np.vstack(out); s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Q, axis=0), axis=1))]
    return Q, s


def near_line(Q, reach):                                      # for every place within reach of a line: (mask, metres off it, which point of it)
    x0, x1, z0, z1 = Q[:, 0].min() - reach, Q[:, 0].max() + reach, Q[:, 1].min() - reach, Q[:, 1].max() + reach
    box = (WX >= x0) & (WX <= x1) & (WZ >= z0) & (WZ <= z1)
    d, i = cKDTree(Q).query(np.column_stack([WX[box], WZ[box]]))
    D = np.full((NZ, NX), 1e9); I = np.zeros((NZ, NX), int); D[box] = d; I[box] = i
    return D < reach, D, I


def along(Q, s, g, m, I):                                     # a line's heights g (at its points, s metres along) read at the places m beside it
    T = np.gradient(Q, axis=0); T /= np.linalg.norm(T, axis=1)[:, None] + 1e-9
    i = I[m]; t = (WX[m] - Q[i, 0]) * T[i, 0] + (WZ[m] - Q[i, 1]) * T[i, 1]
    return np.interp(np.clip(s[i] + t, 0, s[-1]), s, g)


# ------------------------------------------------------------------ 1. three sheets of land and the two cliffs between them
# The village's edge, read off its land at x = -80: the high west plateau (22 m) north of z = 9, a cliff, the road's shelf
# (8 m) to z = 71, a bank, the meadow (2.7 m) from there south. All three go on into this land:
#   UP    the high ground behind the north cliff (she does not walk on it)
#   SHELF the road's shelf, the hamlet on a round bulge of it
#   LOW   the low ground, rising slowly to the west
E_LINE = [(-60, 4.8), (-70, 7.2), (-80, 9.2), (-86, 10.0), (-97, 12.0), (-112, 15.5), (-127, 20.0), (-137, 27.5), (-143, 37),       # the north cliff's foot, east to west:
          (-149, 46.5), (-155.5, 52.0),                                                                                           #   a horn of rock,
          (-160.5, 43.5), (-166.9, 34.6), (-177.7, 28.2), (-190, 26.0), (-202.3, 28.2), (-213.1, 34.6), (-219.5, 42.0),            #   the crescent behind the hamlet,
          (-224.5, 49.5), (-229.5, 56.0), (-236, 50.0), (-246, 44.5), (-260, 41.0), (-276, 38.5), (-294, 36.0), (-330, 34.0)]     #   the west horn, and on to the west hills
K_LINE = [(-60, 67.6), (-70, 70.0), (-80, 71.2), (-88, 72.0), (-100, 72.6), (-112, 71.2), (-125, 68.5), (-138, 66.5), (-148, 68.5),   # the shelf's south bank:
          (-158, 74.5), (-166.3, 81.9), (-174.5, 88.8), (-190, 93.0), (-205.5, 88.8), (-213.7, 81.9), (-220, 73.0),                 #   round the hamlet's bulge,
          (-228, 66.0), (-240, 62.0), (-256, 60.0), (-275, 59.0), (-300, 58.0), (-330, 58.0)]                                       #   and fading out in the west
NORTH = [(-330, -40), (-55, -40)]
sdU = poly_sd(list(chaikin(E_LINE, 2)) + NORTH)
sdS = poly_sd(list(chaikin(K_LINE, 2)) + NORTH)
calm = sm(SEAM - 3, SEAM - 34, WX)                            # (nothing wanders at the seam: the cliffs meet the village's where they stand)
wdx = (noise(30, 2) * 7.0 + noise(9, 2) * 2.0) * calm; wdz = (noise(30, 2) * 7.0 + noise(9, 2) * 2.0) * calm
wander = lambda F, k=1.0: ndi.map_coordinates(F, [JJ + k * wdz / CELL, II + k * wdx / CELL], order=1, mode='nearest')
sdU = wander(sdU, 0.55); sdS = wander(sdS, 0.55)
SLIP = (-178.0, 95.5, 7.5)                                    # a bite fallen out of the hamlet's rim
sdS = np.minimum(sdS, np.hypot(WX - SLIP[0], WZ - SLIP[1]) - SLIP[2] * (1 + 0.18 * np.sin(3 * np.arctan2(WZ - SLIP[1], WX - SLIP[0]))))

UP = surface([(-80, -5, 22.6), (-80, 5, 22.2), (-100, 0, 22.6), (-120, 6, 21.4), (-140, 12, 19.6), (-160, 20, 18.0), (-190, 8, 17.0), (-190, 22, 16.7),
              (-225, 34, 17.2), (-250, 24, 18.0), (-280, 20, 19.4), (-305, 10, 21.0), (-160, -8, 19.5), (-230, -8, 19.2), (-141, 34, 18.3), (-153, 46, 17.7),
              (-226, 50, 17.3), (-305, 34, 20.0)], 1.0)
SHELF = surface([(-80, 15, 8.4), (-80, 35, 8.4), (-80, 50, 7.8), (-80, 64, 6.5), (-80, 69, 6.3), (-95, 25, 8.5), (-95, 50, 7.9), (-95, 67, 7.0),
                 (-120, 30, 8.6), (-120, 55, 8.2), (-120, 64, 7.9), (-150, 45, 8.9), (-150, 62, 8.8), (-190, 35, 9.7), (-190, 62, 9.3), (-190, 90, 9.0),
                 (-170, 75, 9.1), (-210, 75, 9.1), (-215, 58, 9.2), (-235, 56, 8.9), (-255, 52, 8.7), (-280, 48, 9.3), (-305, 46, 10.2)], 0.5)
LOW = surface([(-80, 75, 2.6), (-80, 100, 2.6), (-80, 140, 2.7), (-80, 180, 2.78), (-80, 220, 2.8), (-80, 255, 2.9),
               (-100, 90, 2.85), (-100, 150, 2.95), (-100, 220, 3.05), (-130, 100, 3.0), (-130, 160, 3.1), (-130, 230, 3.2),
               (-160, 105, 3.2), (-160, 150, 3.25), (-160, 200, 3.4), (-160, 245, 3.7), (-190, 112, 3.3), (-190, 150, 3.3), (-190, 195, 3.6),
               (-220, 100, 3.6), (-220, 150, 3.5), (-222, 180, 4.0), (-250, 80, 4.8), (-250, 120, 4.0), (-255, 150, 4.2), (-260, 240, 5.3),
               (-280, 100, 5.0), (-280, 62, 6.1), (-280, 150, 5.4), (-282, 200, 6.5), (-280, 255, 7.1), (-200, 250, 4.5), (-130, 255, 3.6),
               (-305, 100, 5.8), (-305, 160, 6.1), (-305, 240, 8.1), (-100, 290, 3.6), (-200, 290, 5.1)], 1.0)
# The low ground has sunk toward the village in two steps: each a broken scarp running north to south, the land west of it
# standing higher. Here and there a scarp has slumped to a slope she can walk (SLUMPS); the ways and the dry brook cross where
# they are laid (6).
F1 = [(-111, -40), (-111, 60), (-110, 74), (-107.5, 90), (-114, 104), (-109, 120), (-116, 136), (-112, 152), (-120, 166), (-116, 182), (-124, 198), (-118, 214), (-126, 232),
      (-122, 250), (-128, 272), (-126, 310)]
F2 = [(-158, -40), (-158, 70), (-158, 88), (-152, 102), (-157, 116), (-150, 130), (-153.5, 144), (-148, 157), (-153, 172), (-146, 186), (-152, 200), (-145, 214), (-151, 230),
      (-146, 248), (-150, 272), (-148, 310)]
STEPS = [(F1, 1.4, [(-112.5, 141, 7.0), (-121, 206, 9.0), (-124, 241, 7.0)], None), (F2, 1.5, [(-151, 129, 7.0), (-149, 222, 9.0)], (212.0, 246.0))]     # (line, drop, slumps, where it dies out)
runS = 0.8 + 6.5 * sm(-226, -256, WX)                         # the bank: a low cliff as far as the hamlet, a soft slope west of it
cS = sm(-1, 1, sdS / runS); cU = sm(-1, 1, sdU / 1.0)
for line, drop, slumps, dies in STEPS:
    sd = wander(poly_sd(list(chaikin(line, 2)) + [(-330, 310), (-330, -40)]), 0.5)
    run = 0.7 + 7.5 * np.max([np.exp(-(np.hypot(WX - x, WZ - z) / r) ** 2) for x, z, r in slumps], axis=0)
    run += 14 * sm(PLAY[3] - 14, PLAY[3] + 6, WZ) + (16 * sm(dies[0], dies[1], WZ) if dies else 0)      # (a slope, not a step, in the south margin and where it dies out)
    k = sm(-1, 1, sd / run)
    LOW = LOW + drop * (1 + 0.5 * noise(34, 2)) * k                                   # the step (not the same height all along)
    LOW += 0.28 * np.exp(-np.clip(sd, 0, None) / 6.0) * k                            # the higher block's edge stands up a little
    LOW += 0.55 * np.exp(np.minimum(sd, 0) / 1.8) * (1 - k) * np.clip(noise(18, 2) * 5 + 0.2, 0, 1)      # earth fallen at its foot, here and there
H = LOW + (SHELF - LOW) * cS + (UP - SHELF) * cU

# fallen rock at the north cliff's foot (here and there), and one great fall against the crescent, north-east of the hamlet
scree = np.clip(noise(40, 2) * 4 + 0.15, 0, 1) * calm
H += 1.3 * np.exp(np.minimum(sdU, 0) / 2.6) * (1 - cU) * scree * (sdU > -12)
FALL = (-170.2, 36.5, 12.0, 3.4)
H += FALL[3] * np.clip(1 - np.hypot(WX - FALL[0], WZ - FALL[1]) / FALL[2], 0, 1) ** 1.3 * (1 - cU)


# ------------------------------------------------------------------ 2. the dead hill, and the shoulders of the west pass
def bump(cx, cz, rx, rz, rot, h):
    c, s = math.cos(rot), math.sin(rot); u = (WX - cx) * c + (WZ - cz) * s; v = -(WX - cx) * s + (WZ - cz) * c
    return h * (1 - sm(0, 1, np.hypot(u / rx, v / rz)))

HILL = (-240.0, 211.0)                                        # its top
hill = bump(HILL[0] + 2, HILL[1] + 1, 44, 37, 0.35, 12.0) + bump(-213, 229, 25, 20, -0.4, 3.4) + bump(HILL[0], HILL[1], 15, 13, 0, 2.2)
_a = np.arctan2(WZ - HILL[1], WX - HILL[0]); _r = np.hypot(WX - HILL[0], WZ - HILL[1])
ribs = np.sin(_a * 7 + 1.5 * np.sin(_a * 2 + 0.7) + _r * 0.06) * 0.5 + 0.5
H += hill - 0.9 * ribs ** 3 * sm(7, 19, _r) * sm(45, 30, _r)                         # gullies run down it between ribs
CRAG = (HILL[0] - 8.5, HILL[1] - 5.5, 4.4, 3.4)                                       # a crag standing beside the top
_c = np.arctan2(WZ - CRAG[1], WX - CRAG[0])
H += CRAG[3] * sm(1.2, 0.62, np.hypot(WX - CRAG[0], WZ - CRAG[1]) / (CRAG[2] * (1 + 0.2 * np.sin(3 * _c + 1) + 0.1 * np.sin(5 * _c))))
H += bump(-289, 70, 24, 20, 0.2, 5.5) + bump(-292, 134, 27, 22, -0.3, 6.5)               # the pass lies between these two


# ------------------------------------------------------------------ 3. the sunken land
# a field sagged like a trap door: nothing at its hinge (south-east), 1.3 m at its far side, a sharp step only along its deep edge
TRAP = [(-121, 108), (-131, 101), (-143, 104), (-147, 115), (-141, 128), (-128, 133), (-118, 124)]
sdT = wander(poly_sd(chaikin(TRAP, 1, True)), 0.4)
_n = np.array([-0.83, -0.55]); _n /= np.linalg.norm(_n)
tilt = np.clip(((WX + 120) * _n[0] + (WZ - 127) * _n[1]) / 27, 0, 1)
H -= 1.3 * tilt * sm(-1, 1, sdT / (0.7 + 6.0 * sm(0.75, 0.3, tilt)))
H += noise(24, 2) * 0.7 * (1 - cS)                            # the low ground heaves in broad swells
H += noise(11, 3) * 0.75                                      # the ground rolls a little (before the holes: their floors are their own)


def sinkhole(cx, cz, r, depth, out, wide=0.55, seed=0):
    """a hole fallen in: steep all round, but slumped to a ramp on the side `out` (an angle: 0 east, a quarter turn south)"""
    global H
    a = np.arctan2(WZ - cz, WX - cx); dist = np.hypot(WX - cx, WZ - cz)
    d = dist / (r * (1 + 0.13 * np.sin(3 * a + seed) + 0.07 * np.sin(5 * a + 2.3 * seed)))
    ramp = np.exp(-((np.angle(np.exp(1j * (a - out)))) / wide) ** 2)
    prof = sm(1.0, 0.72, d) * (1 - ramp) + sm(1.45, 0.2, d) * ramp           # 0 outside, 1 on the floor
    sag = -0.22 * np.exp(-((d - 1.15) / 0.3) ** 2) * (1 - ramp)              # the rim leans in
    floor = depth * (0.86 + 0.14 * np.clip(1 - d * d, 0, 1))
    m = dist < r * 2.2
    H[m] += (-floor * prof + sag)[m]


SINKS = [('sink_big', -168.0, 208.0, 11.0, 4.2, math.radians(-25), 0.9), ('sink_road', -120.0, 50.5, 7.5, 2.6, math.radians(180), 2.1),
         ('sink_small', -204.0, 113.0, 5.0, 1.8, math.radians(80), 4.0)]
for _, x, z, r, dep, out, sd in SINKS: sinkhole(x, z, r, dep, out, seed=sd)
SCAR = (-228.0, 186.0, 10.0, 3.0)                             # the slip on the dead hill's north face: a hollow open down the hill
sinkhole(SCAR[0], SCAR[1], SCAR[2], SCAR[3], math.atan2(-16, 7), wide=0.8, seed=1.3)
H += 1.2 * np.exp(-(((WX + 222) / 7.5) ** 2 + ((WZ - 171.5) / 5.5) ** 2))    # and what slid lies below it

CRACKS = [('crack_1', [(-159, 200.5), (-153.5, 195.5), (-148.5, 193.5), (-142, 189.5)], 1.2, 1.7), ('crack_2', [(-173.5, 218.5), (-177.5, 226), (-181, 232), (-183, 241)], 1.1, 1.6)]
for _, pts, dep, w in CRACKS:                                 # a crack: a narrow V, deepest in its middle
    Q, s = densify(chaikin(pts, 2), 0.3); m, D, I = near_line(Q, w)
    taper = np.sin(np.pi * np.clip(s / s[-1], 0, 1)) ** 0.6
    H[m] -= (dep * taper[I] * np.clip(1 - D / w, 0, 1) ** 1.15)[m]

# The dry pond. Not a bowl dug out: a pond that stood here and dried. Its shore (where the water stood, at the sill's height)
# wanders, with a bay in the south-west and a point on the north side. Inside it a shelf of shallows goes down slowly, wide on
# some sides and narrow on others, then the bottom drops to the basin, deepest off its middle. As the water went down it
# stood a while at each level: low steps ring the shallows (strandlines). Where the gully came in it left a fan of what
# it carried, parted by three shallow runnels. The banks are a beach's first, then steeper, more on some sides than others.
# An islet stands in it, above where the water stood.
POND = (-190.0, 150.0, 23.0, 16.0, 4.6, 5.6)                  # middle, half widths (of the hollow it lies in), floor, and the sill its water stood at
_a = np.arctan2(WZ - POND[1], WX - POND[0])
pd = np.hypot((WX - POND[0]) / POND[2], (WZ - POND[1]) / POND[3]) / (1 + 0.10 * np.sin(2 * _a + 0.6) + 0.07 * np.sin(3 * _a + 2.1) + 0.05 * np.sin(5 * _a + 0.4))
assert H[(pd > 1.1) & (pd < 1.15)].max() < 8.0, 'the pond is cut into a bank'
SHORE = [(-173.5, 151.0), (-176.0, 156.5), (-181.0, 160.0), (-188.0, 161.5), (-195.0, 160.5), (-200.0, 163.0), (-204.5, 162.0), (-205.0, 157.5), (-208.0, 154.0),
         (-209.0, 149.5), (-207.0, 145.0), (-203.5, 141.5), (-199.0, 139.5), (-195.5, 141.8), (-192.0, 138.5), (-186.0, 138.0), (-180.5, 140.5), (-176.5, 144.0), (-174.5, 147.5)]
sdP = wander(poly_sd(chaikin(SHORE, 2, True)), 0.16)          # metres inside the shore (+), outside it (-)
_in, _out = np.clip(sdP, 0, None), np.clip(-sdP, 0, None)
shW = 4.2 + 5.2 * wnoise(22, 2)                               # the shallows: 1.6 to 6.8 m wide
DEEP = (-194.5, 152.0)                                        # where it is deepest
_far = np.hypot((WX - DEEP[0]) / 15.0, (WZ - DEEP[1]) / 10.0)
_basin = POND[4] - 0.08 + 0.5 * np.clip(_far, 0, 1.4) ** 1.3                         # the bottom: a slow hollow to its deepest, no floor laid flat
_edge = POND[5] - 0.07 * shW
pondT = POND[5] - 0.07 * np.minimum(_in, shW) - np.clip(_edge - _basin, 0, None) * (1 - np.exp(-np.clip(_in - shW, 0, None) / 3.4))
_gz, _gx = np.gradient(pondT, CELL)
pondT += 0.02 * np.sin(2 * np.pi * (pondT - 4.5) / 0.22) * sm(4.9, 5.05, pondT) * sm(POND[5] + 0.02, POND[5] - 0.1, pondT) * sm(0.13, 0.07, np.hypot(_gx, _gz))      # strandlines (on the shallows: a steep bottom keeps none)
_bank = 0.16 + 0.75 * np.clip(wnoise(17, 2) + 0.5, 0, 1) ** 1.6                    # the banks: from a beach she strolls down to a bank cut steep
_beach = 1.0 + 3.0 * np.clip(wnoise(21, 2) + 0.5, 0, 1)
pondT = np.where(sdP > 0, pondT, POND[5] + 0.1 * np.minimum(_out, _beach) + _bank * np.clip(_out - _beach, 0, None) + 0.02 * _out ** 2)
FAN = (-208.6, 149.4, math.atan2(151.0 - 149.4, -196.0 + 208.6))       # the gully's fan: its head, the way it spreads
_r = np.hypot(WX - FAN[0], WZ - FAN[1]); _t = np.angle(np.exp(1j * (np.arctan2(WZ - FAN[1], WX - FAN[0]) - FAN[2])))
_fan = sm(9.5, 1.0, _r) * sm(1.0, 0.55, np.abs(_t)) * (sdP > -1.5)
pondT += 0.3 * _fan - 0.09 * _fan * sm(1.5, 3.5, _r) * np.max([np.exp(-(((_t - q) * _r) / 0.7) ** 2) for q in (-0.46, 0.05, 0.5)], axis=0)
ISLET = (-185.0, 147.0)
_i = np.arctan2(WZ - ISLET[1], WX - ISLET[0])
pondT += 1.4 * np.exp(-(np.hypot((WX - ISLET[0]) / 3.5, (WZ - ISLET[1]) / 2.8) / (1 + 0.16 * np.sin(3 * _i + 0.8))) ** 2)
H = np.where(sdP > -16, lower(H, pondT, 0.12), H)

# ------------------------------------------------------------------ 4. the margin: hills she only sees, west and south (the pass and the gully go out between them)
ROAD = [(SEAM, 55.2), (-97, 52.6), (-106, 53.6), (-112, 58.6), (-120, 61.2), (-128, 58.6), (-135, 53.4), (-143, 53.0), (-150, 56.0), (-162, 61.0), (-176, 61.5), (-190, 62.0), (-204, 64.0), (-214, 69.0),
        (-224, 79.0), (-236, 89.0), (-254, 96.0), (-270, 99.0), (-284, 100.0), (-300, 101.0), (-312, 101.5)]
GULLY = [(-312, 167), (-298, 162), (-286, 164), (-274, 156), (-261, 154), (-250, 145), (-238, 147.5), (-227, 142.5), (-219, 147), (-211, 148)]
outW, outS = PLAY[0] - WX, WZ - PLAY[3]
gap = (1 - np.exp(-((WZ - 100.5) / 13) ** 2)) * (1 - 0.8 * np.exp(-((WZ - 163) / 9) ** 2))
_w, _s = np.clip(outW, 0, None), np.clip(outS, 0, None)
H += np.clip(np.hypot(_w, _s) / 30, 0, 1) ** 1.5 * (5 + 9 * (noise(26, 3) + .5)) * (1 - (1 - (0.12 + 0.88 * gap)) * _w / (_w + _s + 1e-6))
H += np.clip((PLAY[2] - WZ) / 30, 0, 1) ** 1.5 * (2 + 5 * (noise(26, 3) + .5)) * cU       # and the high ground rises on to the north

gz, gx = np.gradient(H, CELL)
rock = ndi.gaussian_filter(np.clip((np.hypot(gx, gz) - .45) / 1.3, 0, 1), 1.9)
H += (np.abs(noise(5.5, 4)) * 2 - .5) * 2.4 * rock * (sdU > -6)                           # craggy on the north cliff
H += (np.abs(noise(4.0, 3)) * 2 - .5) * 0.9 * rock * (sdU <= -6)                          # a little on the low banks and the holes

# ------------------------------------------------------------------ 5. the seam: this land becomes the village's own at x = -80
OLD = np.empty((NZ, NX)); OLD[:, IOFF:] = OH[JOFF:, :NX - IOFF]; OLD[:, :IOFF] = OLD[:, [IOFF]]      # (west of its edge: its last column carried on)
wx = sm(SEAM, SEAM - 6.0, WX)                                                         # all the village's at x >= -80, all this land's 6 m west of it
wn = 1 - (1 - sm(Z0, Z0 + 12, WZ)) * (1 - sm(old['x0'], old['x0'] - 30, WX))          # and along this land's north end, where the village's margin goes on north
H = OLD + (H - OLD) * wx * wn
WEST = sm(SEAM, SEAM - 1.6, WX)                                                       # (what is laid on the land below never touches x >= -80)


# ------------------------------------------------------------------ 6. floors, ways, and the dry water's bed
def level(x, z, r, y=None, feather=0.6):
    global H
    dist = np.hypot(WX - x, WZ - z)
    t = float(np.median(H[dist < r])) if y is None else y
    w = sm(r * (1 + feather), r, dist) * WEST
    H = H * (1 - w) + t * w
    return round(t, 2)


YARD = (-190.0, 62.0)
PADS = [('ruin_1', -177.5, 51.5, 5.0, 0.25), ('ruin_2', -196.0, 45.0, 4.6, 0.45), ('ruin_3', -206.0, 59.0, 5.2, 0.15), ('ruin_4', -199.0, 77.0, 4.8, -0.15),
        ('ruin_5', -182.5, 79.5, 4.6, -0.3), ('ruin_6', -169.5, 68.5, 4.4, 0.0)]
yard_y = level(YARD[0], YARD[1], 7.0)
pads = [{'id': i, 'x': x, 'z': z, 'r': r, 'y': level(x, z, r, round(yard_y + dy, 2), 0.5)} for i, x, z, r, dy in PADS]
WELL = (-224.0, 98.5)
well_y = level(WELL[0], WELL[1], 3.2)
top_y = level(HILL[0], HILL[1], 5.5)


def lay(pts, half, feather=2.0, grade=0.2, sink=0.08, cut=2):
    """a way laid on the land: level across, its rise smoothed and held under `grade`, the land eased to it either side"""
    global H
    Q, s = densify(chaikin(pts, cut), 0.25)
    g = ndi.gaussian_filter1d(sample(H, Q), 3.0 / 0.25, mode='nearest')
    lim = grade * np.diff(s); up, lo = g.copy(), g.copy()     # held under `grade`: half way between the lowest such line above it and the highest below
    for i in range(1, len(g)): up[i] = max(up[i], up[i - 1] - lim[i - 1]); lo[i] = min(lo[i], lo[i - 1] + lim[i - 1])
    for i in range(len(g) - 2, -1, -1): up[i] = max(up[i], up[i + 1] - lim[i]); lo[i] = min(lo[i], lo[i + 1] + lim[i])
    g = (up + lo) / 2
    m, D, I = near_line(Q, half + feather)
    w = (sm(half + feather, half, D) * WEST)[m]
    H[m] = H[m] * (1 - w) + (along(Q, s, g, m, I) - sink) * w
    return [[round(float(x), 2), round(float(z), 2)] for x, z in np.vstack([Q[:-8:16], Q[-1:]])]


def hill_way(c, r0, a0, a1, y1, n=48):
    """the way up the dead hill, round it from bearing a0 to a1: it climbs evenly, and at each bearing lies where the hill
    itself stands at the height it has climbed to (so it is a ledge on the hillside, not a trench cut through it)"""
    rr = np.arange(r0 + 5.0, 2.5, -0.25); y0 = float(sample(H, [(c[0] + r0 * math.cos(a0), c[1] + r0 * math.sin(a0))])[0]); r = []
    for t in np.linspace(0, 1, n):
        a = a0 + (a1 - a0) * t; hs = sample(H, [(c[0] + q * math.cos(a), c[1] + q * math.sin(a)) for q in rr])
        r.append(rr[np.argmax(hs >= y0 + (y1 - y0) * t)] if (hs >= y0 + (y1 - y0) * t).any() else rr[-1])
    r = np.minimum.accumulate(ndi.gaussian_filter1d(np.array(r), 1.5, mode='nearest')); r[0] = r0
    return [(c[0] + ri * math.cos(ai), c[1] + ri * math.sin(ai)) for ri, ai in zip(r, np.linspace(a0, a1, n))]


UPHILL = hill_way(HILL, 38.0, 0.1 * math.pi, 1.5 * math.pi, top_y)
WAYS = [('old_road', 1.6, ROAD, dict(feather=2.4, grade=0.16)),
        ('cart_track', 1.2, [(-177, 69), (-170, 73.5), (-163, 79), (-157.5, 88.5), (-151, 96), (-139, 92), (-124, 89.5), (-110, 90), (-96, 91.5), (SEAM, 93.0)], dict(feather=2.6, grade=0.17)),
        ('to_pond', 1.0, [(-151, 96), (-160, 108), (-168, 122), (-174, 133), (-178, 139)], dict()),
        ('round_pond', 0.9, [(-178, 139), (-168.5, 145), (-165, 158), (-172, 167), (-186, 172), (-195, 186), (-200, 203), UPHILL[0]], dict()),
        ('up_dead_hill', 0.9, UPHILL, dict(feather=2.4, grade=0.2, cut=1)),
        ('to_well', 0.9, [(-233, 86.5), (-228, 92.5), (WELL[0] + 2.2, WELL[1] - 2.2)], dict(feather=1.5))]
ways = [{'id': i, 'half': half, 'points': lay(pts, half, **kw)} for i, half, pts, kw in WAYS]

# The dry water. A level reach is a bed at one height (the water, when it comes back, stands level in it) and goes down to
# the next by a dry fall; the gully above the pond follows the land. The last reach meets the village's brook at the seam.
# The lines below are where it was drawn to run. The bed itself is made as water makes one (channel, below), not cut to a
# rule: it wanders a little about its line; it is wide and shallow on a riffle and narrow and deep in a pool, the pools at
# its bends; in a bend its deepest lies against the outer bank, which the water has cut steep, and the inner side goes up
# slowly over the bar it left there; no two stretches of bank stand alike; under each dry fall the water dug a round pool,
# and its lip is narrow rock, cut back furthest in its middle; where a way crosses, it is a ford: shallow, both banks easy.
VB = [(-97.3, 175.7), (-93.9, 178.1), (-89.9, 180.0), (-85.5, 181.3), (-81.05, 181.96), (SEAM, 182.05)]      # (the line the village's brook came in by)
SILL = [(-174, 151), (-170, 151.8), (-166.5, 152.5)]                                                            # the notch in the pond's rim
REACHES = [('reach_1', 5.2, [(-166.5, 152.5), (-161, 154.5), (-155, 155.5), (-149.5, 156)]),                    # from the pond's sill to the west scarp: a dry fall
           ('reach_2', 3.9, [(-149.5, 156), (-143, 153.5), (-136, 156), (-129, 161.5), (-123, 165.5), (-119.5, 166)]),   # to the east scarp: a dry fall
           ('reach_3', 2.76, [(-119.5, 166), (-113, 169.5), (-106, 173.5), (-101, 175)] + VB)]                    # and to the village's brook


def carve(pts, half, bed, bank=0.45, cut=2):
    """a bed cut along a line to a rule: flat at `bed` (a height, or a list of heights along it), banks rising either side.
    (As the dry water was first made; kept for its last metres, which must meet the village's brook as that was cut.)"""
    global H
    Q, s = densify(chaikin(pts, cut), 0.3); m, D, I = near_line(Q, half + 5.0)
    b = np.full(len(Q), float(bed)) if np.isscalar(bed) else np.asarray(bed)
    t = along(Q, s, b, m, I) + np.clip(D[m] - half, 0, None) * bank
    H[m] = np.where(WEST[m] > 0.999, np.minimum(H[m], t), H[m])
    return Q, s


DS = 0.2                                                      # metres between a bed line's points


def bed_line(pts, wander_m, hold=()):
    """a drawn line made a water's own: its corners rounded, and wandering up to wander_m either side of where it was drawn
    (not at its ends, nor near the places in hold: (x, z, metres))"""
    Q, s = densify(chaikin(pts, 2), DS)
    T = np.gradient(Q, axis=0); T /= np.linalg.norm(T, axis=1)[:, None] + 1e-9
    k = sm(0, 5, s) * sm(s[-1], s[-1] - 5, s)
    for x, z, r in hold: k = k * sm(r * 0.5, r * 1.6, np.hypot(Q[:, 0] - x, Q[:, 1] - z))
    Q = Q + np.column_stack([-T[:, 1], T[:, 0]]) * (wander_m * wave(len(Q), DS, 12.0) * k)[:, None]
    Q = np.column_stack([ndi.gaussian_filter1d(Q[:, 0], 3, mode='nearest'), ndi.gaussian_filter1d(Q[:, 1], 3, mode='nearest')])
    return densify(Q, DS)


def channel(Q, s, level, half, deep, falls=(), fords=(), reach=9.0):
    """a bed along the line Q (s: metres along it), made as water makes one: see above. level: the height of its riffles
    at each point (a dry fall is a step in it); half: its half width on a riffle; deep: how far under its riffles its pools
    go; falls, fords: metres along the line. -> the surface it cuts (where it is lower than the land, the land is cut to
    it), where that is, and the bed's half width at each point"""
    n = len(Q)
    T = np.gradient(Q, axis=0); T /= np.linalg.norm(T, axis=1)[:, None] + 1e-9
    N_ = np.column_stack([-T[:, 1], T[:, 0]])
    turn = ndi.gaussian_filter1d(np.gradient(np.unwrap(np.arctan2(T[:, 1], T[:, 0])), s), 2.0 / DS, mode='nearest')      # 1 / metres: + turning to the N_ side
    kn = np.clip(turn * 9.0, -1, 1)
    calm = np.ones(n)                                                  # 0 at a fall or a ford: no bend's cut there, no pool
    for f in falls: calm *= sm(1.5, 4.5, np.abs(s - f))
    ford = np.zeros(n)
    for f in fords: ford = np.maximum(ford, sm(5.0, 2.0, np.abs(s - f)))
    calm *= 1 - ford
    kn *= calm
    bend = np.roll(np.abs(kn), int(1.5 / DS))                          # (a pool lies a little below the bend that dug it)
    pool = np.clip(0.8 * bend + 0.5 * (0.5 + 0.5 * np.sin(2 * np.pi * s / (11.5 * half) + 6.28 * wave(n, DS, 40.0))) * (1 - bend), 0, 1) * calm
    w = half * (1.14 - 0.32 * pool + 0.2 * wave(n, DS, 9.0)) * (1 + 0.25 * ford)
    dep = 0.12 + (deep - 0.12) * pool
    for f in falls:                                                     # the lip above: narrow, bare; the pool the fall dug below: round, deep, wide
        up, dn = s < f, s >= f
        w = np.where(up, w * (1 - 0.32 * np.exp(-((f - s) / 2.2) ** 2)), w * (1 + 0.5 * np.exp(-((s - f - 2.0) / 2.3) ** 2)))
        dep = np.where(up, dep * (1 - np.exp(-((f - s) / 2.0) ** 2)) + 0.06, dep + 0.62 * np.exp(-((s - f - 1.7) / 1.6) ** 2))
    off = -kn * 0.42 * w                                                # the deepest of it: toward the outside of the bend
    steepL, steepR = 0.55 + 0.24 * wave(n, DS, 7.0), 0.55 + 0.24 * wave(n, DS, 7.0)      # each bank its own, all along
    m, D, I = near_line(Q, reach)
    i = I[m]
    side = np.where((WX[m] - Q[i, 0]) * N_[i, 0] + (WZ[m] - Q[i, 1]) * N_[i, 1] >= 0, 1.0, -1.0)
    # where each place lies along the line (not only which of its points is nearest): a fall's face is then a slope the
    # land's grid can hold, and it is cut back furthest in the bed's middle (there the place counts as further down)
    sc = s[i] + (WX[m] - Q[i, 0]) * T[i, 0] + (WZ[m] - Q[i, 1]) * T[i, 1]
    if len(falls):
        near = np.zeros(n)
        for f in falls: near = np.maximum(near, sm(4.0, 1.0, np.abs(s - f)))
        sc = sc + near[i] * 1.1 * np.clip(1 - (D[m] / w[i]) ** 2, 0, 1)
    lev = np.interp(sc, s, level)
    u = side * D[m] - off[i]
    su = np.where(u >= 0, 1.0, -1.0)
    g = -kn[i] * su                                                     # + on the bend's outer side, - on its inner
    ws = np.maximum(w[i] - su * off[i], 0.3)
    q = np.abs(u) / ws
    bed = lev - dep[i] * (1 - np.clip(q, 0, 1) ** np.where(g > 0, 2.0 + 1.3 * g, 2.0 + 0.7 * g))
    steep = np.clip(np.where(su > 0, steepL[i], steepR[i]) + np.where(g > 0, 1.15 * g, 0.22 * g), 0.3, 1.9)
    steep = steep * (1 - ford[i]) + 0.3 * ford[i]
    d = np.clip(np.abs(u) - ws, 0, None)
    C = np.full((NZ, NX), 1e6); C[m] = np.where(q <= 1, bed, lev + steep * d + 0.025 * d * d)
    return C, m, w, dep


def into_land(C, m):
    global H
    H = np.where(m & (WEST > 0.999), lower(H, C), H)


def crossings(Q, s):                                                    # where the ways laid above cross a bed line: metres along it
    out = []
    for w_ in ways:
        P, _ = densify(w_['points'], 0.3); d, k = cKDTree(Q).query(P)
        if d.min() < 0.6: out.append(float(s[k[np.argmin(d)]]))
    return out


Hplain = None
Hb = H.copy()                                                 # (the land before the beds: to say how deep each lies)
# the gully: from the west hills to the pond, 0.7 m under the land, never rising on its way down
Qg, sg = bed_line(GULLY, 1.3)
gb = ndi.gaussian_filter1d(sample(H, Qg), 4.0 / DS, mode='nearest') - 0.7
gb = np.minimum.accumulate(gb); gb = np.maximum(gb, POND[5] + 0.05)
Cg, mg, wg, dg = channel(Qg, sg, gb, 1.15, 0.42, fords=crossings(Qg, sg))
# the brook: out over the sill, and down its three level reaches to the seam, one line
BROOK = SILL + [p for _, _, pts in REACHES for p in pts[1:]]
FALLS = [REACHES[1][2][0], REACHES[2][2][0]]                  # where a reach ends: a dry fall, at a scarp
Qb, sb = bed_line(BROOK, 1.1, hold=[(x, z, 4.0) for x, z in FALLS] + [(SILL[-1][0], SILL[-1][1], 4.0), (-88.0, 180.0, 14.0)])
at_s = lambda p: float(sb[np.argmin(np.hypot(Qb[:, 0] - p[0], Qb[:, 1] - p[1]))])
sF = [at_s(p) for p in FALLS]; s1 = at_s(SILL[-1])
Lb = np.where(sb < sF[0], REACHES[0][1], np.where(sb < sF[1], REACHES[1][1], REACHES[2][1])).astype(float)
Lb = np.where(sb < sF[0], REACHES[0][1] + (POND[5] - REACHES[0][1]) * sm(s1 + 2.5, s1 - 2.5, sb), Lb)      # (from the sill down to the first reach: a run, no step)
for f, hi, lo in ((sF[0], REACHES[0][1], REACHES[1][1]), (sF[1], REACHES[1][1], REACHES[2][1])):          # a dry fall: its face stands 0.9 m deep
    Lb = np.where(np.abs(sb - f) < 0.45, hi + (lo - hi) * sm(f - 0.45, f + 0.45, sb), Lb)
Cb, mb, wb, db = channel(Qb, sb, Lb, 1.85, 0.6, falls=sF, fords=crossings(Qb, sb))
Hland = H.copy()
for i, (name, bed, pts) in enumerate(REACHES[2:]): carve(pts, 1.5, bed)      # the last metres as first cut: what the village's brook meets
Hplain = H.copy(); H = Hland
into_land(Cg, mg); into_land(Cb, mb)
_k = sm(SEAM - 1.6, SEAM - 9.0, WX)                           # (within 9 m of the seam the bed goes over into that cut)
H = Hplain + (H - Hplain) * _k

# The rain's own runnels. Where would water run on this land? Each place is drained to its lowest neighbour (the hollows
# filled as a flood would fill them, so every drop gets somewhere: to a bed, the pond, a sinkhole, the land's edge), and
# what runs through each place is counted: the ground that drains through it (FLOW, square metres). Where enough ground
# drains through one line the land is worn into a runnel along it, deeper and wider the more it carries: they gather
# down the slopes, join, and notch the banks where they reach a bed. Only on the low ground and the dead hill; nothing is
# worn where a way runs, a floor lies or a tree stands, nor by the seam.
import heapq
def trees_now():                                              # the dead trees as they stand in the map's foliage (moved by hand since, maybe), else as planted
    f = REPO / 'assets/heightmaps/hill-village-foliage.json'
    if f.exists(): return [(r[1], r[2], r[3]) for r in json.loads(f.read_text())['plants'] if r[0] in ('oak', 'broadleaf', 'birch', 'sapling', 'pine') and r[1] < SEAM]
    w = REPO / 'assets/heightmaps/west-fringe.json'
    return [(r[1], r[2], r[3]) for r in json.loads(w.read_text())['dead_trees']] if w.exists() else []


def kept_as_is():
    """1 where the land is not to be worn (a way, a floor, a tree's foot, the seam), 0 where it may be, eased between"""
    keep = sm(SEAM - 12.0, SEAM - 7.0, WX)
    for w_ in ways:
        Qw, _ = densify(w_['points'], 0.4); m_, D_, _ = near_line(Qw, w_['half'] + 3.6)
        keep = np.maximum(keep, sm(w_['half'] + 3.4, w_['half'] + 1.6, D_) * m_)
    for x, z, r in [(q['x'], q['z'], q['r'] + 1.5) for q in pads] + [(YARD[0], YARD[1], 9.0), (WELL[0], WELL[1], 5.0), (HILL[0], HILL[1], 7.0)] + [(x, z, 1.3 + 1.0 * sz) for x, z, sz in trees_now()]:
        keep = np.maximum(keep, sm(r + 1.6, r, np.hypot(WX - x, WZ - z)))
    return keep


def flow(Hf, out):
    """the ground draining through each place (square metres), the hollows of Hf filled; out: where water leaves (a bed, a hole, the edge)"""
    nz, nx = Hf.shape; h = Hf.ravel().tolist(); seen = out.ravel().copy(); par = np.full(nz * nx, -1, np.int64); order = []
    heap = [(h[k], k) for k in np.flatnonzero(seen)]; heapq.heapify(heap)
    NB = [(-1, -1, 1.414), (-1, 0, 1), (-1, 1, 1.414), (0, -1, 1), (0, 1, 1), (1, -1, 1.414), (1, 0, 1), (1, 1, 1.414)]
    seen = seen.tolist()
    while heap:
        y, k = heapq.heappop(heap); order.append(k); j, i = divmod(k, nx)
        for dj, di, _ in NB:
            jj, ii = j + dj, i + di
            if 0 <= jj < nz and 0 <= ii < nx:
                q = jj * nx + ii
                if not seen[q]: seen[q] = True; par[q] = k; heapq.heappush(heap, (max(h[q], y + 1e-4), q))
    acc = np.full(nz * nx, CELL * CELL)
    for k in reversed(order):
        if par[k] >= 0: acc[par[k]] += acc[k]
    return acc.reshape(nz, nx)


RJ0, RJ1, RI0, RI1 = int((92 - Z0) / CELL), int((PLAY[3] + 4 - Z0) / CELL), int((PLAY[0] - 6 - X0) / CELL), int((SEAM - 4 - X0) / CELL)      # the low ground and the dead hill, with a little round them
_R = (slice(RJ0, RJ1), slice(RI0, RI1))
bedsM = ((Cb < Hland + 0.02) | (Cg < Hland + 0.02) | (sdP > 0))                       # the beds and the pond: where the runnels run to
_out = bedsM[_R].copy(); _out[0, :] = _out[-1, :] = _out[:, 0] = _out[:, -1] = True
for _, x, z, r, *_ in SINKS: _out |= (np.hypot(WX - x, WZ - z) < r * 0.55)[_R]
# (the land it is worked out on: smoothed, and with small swells of its own, so that over the flats the water's way wanders
# as it does on real ground and is not ruled across them)
FLOW = np.zeros((NZ, NX)); FLOW[_R] = flow((ndi.gaussian_filter(H, 1.0) + 0.24 * wnoise(9.0, 2) + 0.07 * wnoise(3.5, 2))[_R], _out)
KEEP = kept_as_is()
_gz, _gx = np.gradient(ndi.gaussian_filter(H, 1.5), CELL)
_fall = ndi.gaussian_filter(np.hypot(_gx, _gz), 1.0)                                # how steeply the land falls there
_r = np.clip(np.log(np.maximum(FLOW, 1) / 40.0) / math.log(700.0 / 40.0), 0, 1) * (~bedsM) * (sdS < -2.0)
# water wears the land by how much of it there is and how fast it runs: a gully where it comes down a bank, a scarp or the
# hill; over the flats no more than a swale, broad and a hand deep
RILL = ndi.gaussian_filter(1.05 * _r ** 1.2 * sm(0.05, 0.3, _fall), 1.25) + ndi.gaussian_filter(0.11 * _r, 2.6)
RILL *= (1 - KEEP) * (WEST > 0.999)
H = H - RILL

# ------------------------------------------------------------------ 7. checks
gz, gx = np.gradient(H, CELL); SL = np.hypot(gx, gz)
seam_err = np.abs(H[:, IOFF + int(round((SEAM - old['x0']) / CELL)):] - OLD[:, IOFF + int(round((SEAM - old['x0']) / CELL)):]).max()
assert seam_err < 1e-9, 'the village side of the seam was touched'
assert BASE < H.min() and H.max() < BASE + RANGE, (H.min(), H.max())
inplay = (WX >= PLAY[0]) & (WX <= PLAY[1]) & (WZ >= PLAY[2]) & (WZ <= PLAY[3])
walk = inplay & (SL < 0.9)
lab, _ = ndi.label(walk)
at = lambda x, z: (int(round((z - Z0) / CELL)), int(round((x - X0) / CELL)))
home = lab[at(SEAM - 1.0, 56.0)]                              # the road, just inside this land
PLACES = {'road_in': (SEAM - 1, 55.5), 'meadow_in': (SEAM - 1, 120), 'sink_road': (-120, 50.5), 'hamlet': YARD, 'well': WELL, 'west_pass': (-279, 100),
          'east_step': (-95, 130), 'middle_step': (-135, 180), 'west_step': (-180, 120), 'sag_field': (-134, 116), 'pond_floor': (-192, 153), 'islet': (-185, 147),
          'sink_big': (-168, 208), 'sink_small': (-204, 113), 'dead_hill_top': HILL,
          'slip_scar': (-227, 184), 'brook_out': (SEAM - 1, 182), 'south_east': (-95, 250)}
reach = {k: bool(lab[at(*p)] == home) for k, p in PLACES.items()}
ground = inplay & (sdU < -1.5)                                # (all but the high ground and its cliff)
print('heights %.2f .. %.2f m' % (H.min(), H.max()), '| seam error', seam_err)
print('she can stand on %.1f%% of the ground below the north cliff, and reach %.1f%% of that from the road' % (100 * (walk & ground).sum() / ground.sum(), 100 * ((lab == home) & ground).sum() / (walk & ground).sum()))
print('reached:', reach)
assert all(reach.values()), [k for k, v in reach.items() if not v]
strip = (WX > SEAM - 6.5) & (WX < SEAM) & (WZ > PLAY[2] + 3) & (WZ < PLAY[3])
print('the seam: she can walk on %.1f%% of the 6 m just west of it (the rest: the shelf\'s bank)' % (100 * walk[strip].mean()))
for name, bed, pts in REACHES:
    Q, _ = densify(pts, 1.0); side = sample(ndi.maximum_filter(Hb, 15), Q) - bed
    print('  %-8s bed %.2f m, its banks %.1f .. %.1f m above it' % (name, bed, side[Q[:, 0] < SEAM - 2].min(), side.max()))
_calm = np.min([np.abs(sb - f) for f in sF], axis=0) > 6
print('  the brook\'s bed %.1f .. %.1f m wide, its pools to %.2f m under its riffles (%.2f m under a dry fall), fords at %s; the gully\'s %.1f .. %.1f m wide' % (
    2 * wb.min(), 2 * wb.max(), db[_calm].max(), db.max(), [round(f) for f in crossings(Qb, sb)], 2 * wg.min(), 2 * wg.max()))
print('  runnels: worn into %.1f%% of the low ground, the deepest %.2f m' % (100 * (RILL > 0.05)[inplay & (sdS < -2)].mean(), RILL.max()))
for name, Q_ in (('brook', Qb), ('gully', Qg)):                 # she walks in the beds too: all of each but a dry fall's face (and what lies past where she may go)
    P_ = Q_[(Q_[:, 0] > PLAY[0] + 1) & (Q_[:, 0] < SEAM - 1)]; on = np.array([lab[at(x, z)] == home for x, z in P_])
    print('  she can walk %.0f%% of the %s\'s bed' % (100 * on.mean(), name))
    assert on.mean() > 0.93, name
_bedd = ndi.distance_transform_edt(~bedsM) * CELL
for x, z, sz in trees_now():
    if not (X0 < x < SEAM - 1 and Z0 < z < Z0 + (NZ - 1) * CELL): continue
    j_, i_ = at(x, z)
    assert _bedd[j_, i_] > 0.5 + 0.5 * sz, 'a tree stands in the dry water\'s bed: %s' % ((x, z),)
    assert RILL[j_, i_] < 0.03, 'a runnel is worn under a tree: %s' % ((x, z),)
for w in ways:
    P = np.array(w['points']); hh = sample(H, P); dd = np.linalg.norm(np.diff(P, axis=0), axis=1)
    print('  %-13s %5.0f m long, %5.2f -> %5.2f m, steepest %.0f%%' % (w['id'], dd.sum(), hh[0], hh[-1], 100 * np.abs(np.diff(hh) / dd).max()))

# ------------------------------------------------------------------ 8. the dead woods, and the places to go to
# Every tree here is dead (the game takes its leaves off: anime-tree.js, dryness). They stand off the ways, the dry beds,
# the holes, the floors and the steep ground: thick on the dead hill, a few by the ruins and along the road's shelf, thin
# over the low ground, and hardly any on the lowest step by the farm (that one is to be farmed). The steeper the ground a
# tree stands on, the smaller it is: a great stem's foot is metres across, and on a slope half of it would hang in the air.
tr = np.random.default_rng(2207)
wayQ = np.vstack([densify(w['points'], 1.0)[0] for w in ways])
dryQ = np.vstack([Qb[::5], Qg[::5]])
off = lambda Q: cKDTree(Q).query(np.column_stack([WX.ravel(), WZ.ravel()]))[0].reshape(NZ, NX)
ok = inplay & (WX < SEAM - 5) & (SL < 0.45) & (sdU < -4) & (off(wayQ) > 4.5) & (off(dryQ) > 5.0) & (pd > 1.25)
for _, x, z, r, *_ in SINKS: ok &= np.hypot(WX - x, WZ - z) > r * 1.5 + 2
ok &= np.hypot(WX - SCAR[0], WZ - SCAR[1]) > SCAR[2] + 2
for q in pads: ok &= np.hypot(WX - q['x'], WZ - q['z']) > q['r'] + 3.5
ok &= (np.hypot(WX - YARD[0], WZ - YARD[1]) > 9.5) & (np.hypot(WX - WELL[0], WZ - WELL[1]) > 5) & (np.hypot(WX - HILL[0], WZ - HILL[1]) > 8.5)
ok &= ndi.minimum_filter(SL < 0.7, 9)                         # (nor at a cliff's very edge or foot)
KINDS = [('oak', 0.35, 1.5, 2.3), ('broadleaf', 0.35, 1.4, 1.9), ('birch', 0.2, 1.2, 1.7), ('sapling', 0.1, 1.0, 1.3)]
dead_trees = []


def wood(mask, want, apart, tries=6000):
    js, is_ = np.nonzero(mask & ok); n = 0
    for k in tr.permutation(len(js))[:tries]:
        x, z = float(WX[js[k], is_[k]]), float(WZ[js[k], is_[k]])
        if any(math.hypot(x - t[1], z - t[2]) < apart for t in dead_trees): continue
        kind, _, a, b = KINDS[int(np.searchsorted(np.cumsum([q[1] for q in KINDS]), tr.random()))]
        size = float(tr.uniform(a, b)) * (1 - 0.4 * float(sm(0.18, 0.42, SL[js[k], is_[k]])))
        dead_trees.append([kind, round(x, 2), round(z, 2), round(size, 2), round(float(tr.uniform(0, 360)), 1), 700 + len(dead_trees)])
        n += 1
        if n >= want: break
    return n


# They are planted once: where the plan this tool wrote before stands in the repo, its trees are read from it and left as
# they are (they are the map's plants by then; the land's shape may have changed under them since). --replant: anew.
_was = REPO / 'assets/heightmaps/west-fringe.json'
if _was.exists() and '--replant' not in sys.argv:
    dead_trees = json.loads(_was.read_text())['dead_trees']
    print('dead trees:', len(dead_trees), '(as planted before)')
else:
    dead_trees.append(['oak', -186.5, 70.5, 2.5, 40.0, 700])                          # the hamlet's own great oak, by the yard
    hillD = np.hypot(WX - HILL[0], WZ - HILL[1])
    counts = {'hill': wood(hillD < 45, 30, 8.0), 'hamlet': wood((sdS > 2.5) & (np.hypot(WX - YARD[0], WZ - YARD[1]) < 36), 6, 9.0),
              'shelf': wood((sdS > 2.5) & (WX > -165), 8, 11.0), 'west': wood((sdS < -3) & (WX < -205) & (WZ < 135), 7, 12.0),
              'low': wood((sdS < -3) & (WX < -114) & (hillD > 45), 22, 11.0), 'by the farm': wood((sdS < -3) & (WX > -110), 4, 16.0)}
    print('dead trees:', len(dead_trees), counts)

face = lambda a, b: round(math.atan2(b[0] - a[0], b[1] - a[1]), 3)                    # the yaw that looks from a toward b (0 south, a quarter turn east)
GO = {'wf-road': ((-91.0, 54.0), (-120, 52)), 'wf-sinkroad': ((-108.5, 56.5), (-120, 50.5)), 'wf-hamlet': ((-177.0, 64.0), (-196, 50)), 'wf-well': ((-221.0, 95.0), WELL),
      'wf-steps': ((-98.0, 150.0), (-150, 150)), 'wf-fall': ((-141.0, 158.5), (-150, 156)), 'wf-pond': ((-169.0, 141.0), (POND[0], POND[1])), 'wf-sink': ((-151.5, 203.0), (-168, 208)),
      'wf-hill': (HILL, (-190, 110)), 'wf-pass': ((-272.0, 99.0), (-200, 110))}
for k, (a, b) in GO.items(): assert lab[at(*a)] == home, k

# ------------------------------------------------------------------ 9. written out
v16 = np.round((H - BASE) / RANGE * 65535).astype('<u2')
v16.tofile(OUT / 'west-fringe.bin')
Image.fromarray(v16.astype(np.uint16)).save(OUT / 'west-fringe.png')
R2 = lambda x, z: [round(float(x), 2), round(float(z), 2)]
hy = lambda x, z: round(float(sample(H, [(x, z)])[0]), 2)
bed_rows = lambda Q, w, lev: [[round(float(Q[k, 0]), 2), round(float(Q[k, 1]), 2), round(float(w[k]), 2), round(float(lev[k]), 2)] for k in list(range(0, len(Q) - 1, 8)) + [len(Q) - 1]]      # (a point every 1.6 m)


def shore_ring(n=72):
    """the pond's shore as a ring of points: from its middle outward, the last place still inside it"""
    rr = np.arange(0.5, 34.0, 0.2); out = []
    for a in np.linspace(0, 2 * math.pi, n, endpoint=False):
        inside = sample(sdP, np.column_stack([POND[0] + rr * math.cos(a), POND[1] + rr * math.sin(a)])) > 0
        r = rr[np.argmin(inside)] if not inside.all() else rr[-1]
        out.append(R2(POND[0] + r * math.cos(a), POND[1] + r * math.sin(a)))
    return out
plan = {
    'land': {'x0': X0, 'z0': round(Z0, 4), 'cell': CELL, 'nx': NX, 'nz': NZ, 'base': BASE, 'range': RANGE, 'play': list(PLAY)},
    'joins': {'land': 'hill-village', 'seam_x': SEAM, 'same_from_x': SEAM, 'replaces_margin': [old['x0'], SEAM],
              'note': 'same grid as hill-village (cell, rows); every height at x >= seam_x is hill-village\'s own; west of it hill-village\'s margin is replaced by this land'},
    'ways': ways,
    'ruins': pads, 'yard': {'x': YARD[0], 'z': YARD[1], 'r': 7.0, 'y': yard_y},
    'well': {'x': WELL[0], 'z': WELL[1], 'y': well_y},
    'rock_fall': {'x': FALL[0], 'z': FALL[1], 'r': FALL[2]}, 'rim_slip': {'x': SLIP[0], 'z': SLIP[1], 'r': SLIP[2]},
    # the dry water as it lies: each bed's line with, at every point, half its width and the height of its riffles there
    # (x, z, half, level: what lies under that level is pool), the pond's shore (where its water stood, at the sill's
    # height), each level reach's height and where it begins and ends, the dry falls
    'dry_water': {'beds': [{'id': 'gully', 'points': bed_rows(Qg, wg, gb)}, {'id': 'brook', 'points': bed_rows(Qb, wb, Lb)}],
                  'pond': {'x': POND[0], 'z': POND[1], 'rx': POND[2], 'rz': POND[3], 'floor': POND[4], 'sill': POND[5], 'islet': list(ISLET), 'shore': shore_ring()},
                  'reaches': [{'id': n, 'bed': b, 'from': R2(*pts[0]), 'to': R2(*pts[-1])} for n, b, pts in REACHES],
                  'falls': [R2(*p) for p in FALLS],
                  'meets': {'land': 'hill-village', 'at': R2(SEAM, 182.05)}},
    'sunken': {'scarps': [{'line': [R2(*p) for p in line[2:-1]], 'drop': drop, 'slumps': [list(q) for q in slumps]} for line, drop, slumps, _ in STEPS],
               'sag_field': {'outline': [R2(*p) for p in TRAP], 'drop': 1.3},
               'sinkholes': [{'id': i, 'x': x, 'z': z, 'r': r, 'depth': dep, 'y': hy(x, z)} for i, x, z, r, dep, _, _ in SINKS],
               'cracks': [{'id': i, 'points': [R2(*p) for p in pts], 'depth': dep} for i, pts, dep, _ in CRACKS]},
    'dead_hill': {'x': HILL[0], 'z': HILL[1], 'top_r': 5.5, 'y': top_y, 'crag': {'x': CRAG[0], 'z': CRAG[1], 'r': CRAG[2]}, 'slip_scar': {'x': SCAR[0], 'z': SCAR[1], 'r': SCAR[2]}},
    'west_pass': {'x': PLAY[0], 'z': 100.0, 'y': hy(PLAY[0], 100.0)},
    'dead_trees': dead_trees,                               # kind, x, z, size, turn (degrees), which of its kind's shapes
    'go': {k: [a[0], a[1], face(a, b)] for k, (a, b) in GO.items()},      # places to be taken to: x, z, the way she faces
    'views': {k: R2(*p) + [hy(*p)] for k, p in PLACES.items()},
}
json.dump(plan, open(OUT / 'west-fringe.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('written:', OUT / 'west-fringe.png', v16.shape[::-1], 'heights %.1f..%.1f' % (BASE, BASE + RANGE))

# ------------------------------------------------------------------ 10. into the map's foliage, once (--into-map)
# As an arrangement made by hand is sent (foliage-edits.js): on the stamp of the map's kept foliage, the margin's plants out
# (they stood in the wooded hills this land replaces), the dead trees in. 'carry': the map then tells a browser holding an
# arrangement made on the foliage before this one to take the same out and put the same in (foliageWas), so it stands.
if '--into-map' in sys.argv:
    fol_file = REPO / 'assets/heightmaps/hill-village-foliage.json'
    FOL = json.loads(fol_file.read_text())
    stamp = zlib.crc32(json.dumps([FOL['plants'], FOL['clumps'], FOL['cover']], separators=(',', ':')).encode())
    assert stamp == FOL['stamp'], 'the kept foliage is not what its stamp says'
    gone = lambda x, z: x < SEAM - 0.5 and z > Z0                    # (as west-fringe.js has it: the margin west of the seam, beside this land)
    assert not any(gone(r[1], r[2]) for r in FOL['plants'] if r[0] in ('oak', 'broadleaf', 'birch', 'sapling') and r[7] >= 700 and r[4] == 0.8 and r[5] == 0), 'the dead trees are in already'
    ed = {'map': 'hillvillage', 'v': 1, 'base': stamp, 'carry': True, 'why': 'the west fringe: its dead trees in, the old margin\'s plants out',
          'plants': {'set': [], 'del': [i for i, r in enumerate(FOL['plants']) if gone(r[1], r[2])], 'add': [[k, x, z, s, 0.8, 0, t, sh] for k, x, z, s, t, sh in dead_trees]},
          'clumps': {'set': [], 'del': [i for i, r in enumerate(FOL['clumps']) if gone(r[0], r[1])], 'add': []},
          'cover': {'set': [], 'del': [i for i, r in enumerate(FOL['cover']) if gone(r[1], r[2])], 'add': []}}
    (REPO / 'assets/heightmaps/hill-village-foliage-edits.json').write_text(json.dumps(ed, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('into the map: %d plants and %d of ground cover out, %d dead trees in; now run make-hill-village-heightmap.py' % (len(ed['plants']['del']), len(ed['cover']['del']), len(ed['plants']['add'])))
