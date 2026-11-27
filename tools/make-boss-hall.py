#!/usr/bin/env python3
# make-boss-hall.py  —  the boss's hall at the end of the dungeon under the waterfall cliff (room ⑤ of the plan), baked for
# boss-hall.html. Made 28 Nov 2026 for the user: "อยากให้มีห้องบอสแบบ solo leveling"; asked, she chose the dark throne room
# (a giant door, tall pillars down both sides, cold blue fire, a throne at the end) and the round temple of giant statues
# whose eyes light when the boss wakes, both at once ("1+2"); the room first, the boss later, the door's opening scene now.
# Our own hall, in the mood only: nothing of the story's places or people.
#
# One job: shape the hall as cut stone (explicit meshes: crisp edges, not a field's soft ones) and bake the light it will be
# seen in, so the phone does no lighting work but the sprite's and the colour of the fire. The light is baked in three parts,
# for the page to play with: the light that is always there (the dark, the pale shaft down the oculus, the two fires before
# the door, the door's seams), the light of every other fire (one number: the page colours it, lights it as the fires catch
# from the door to the throne, turns it red when the statues wake) and the rune circle's glow (one number). Shadows and the
# shut-in dark of corners come from a field of distance to stone, as tools/make-cave-hall.py's do. Writes
#   assets/caves/boss-hall.bin    the mesh (positions, normals, uv in metres, the three lights, what each vertex is), the
#                                 floor and roof she walks between (cave-level.js reads them as it reads the forest hall's),
#                                 and a coarse 3D picture of the light in the air for her (boss-light.js)
#   assets/caves/boss-hall.json   where things are: the fires, the statues and their eyes, the door, the circle, the throne,
#                                 the oculus, the places she can be put at; and where in the .bin each part is
#
# The hall (metres; x east, z south, y up; 0 = the floor; she comes in from the south and goes north):
#   the vestibule   z 23..40, 12 m wide, 15 high: two fires burn before the door; behind her a tunnel, its far end fallen in
#   the door        in a wall 2 m thick at z 21..23: 7.2 m wide, 9 high, two leaves (boss-hall.js draws and swings them), a
#                   carved frame, a disc of runes over the lintel
#   the nave        z -14.7..21, 20 m wide, 18 high: two rows of four octagonal pillars, a rune band round each; four pairs
#                   of fires on stands either side of the way down the middle (a runner of darker stone, a rune line each side)
#   the arch        a wall 1.5 m thick across the nave's end, a round arch 13 m wide into
#   the rotunda     a twenty-sided hall round (0, -36), 22 m to its walls, 16 high, a dome over it to an oculus 31 m up (the
#                   pale shaft); eight niches, a giant hooded statue in each (10.5 m, a sword planted before it, its face a dark
#                   hollow where the eyes will light), a fire before each; the rune circle on the floor in the middle, 7.6 m
#                   across; to the north the dais (eight steps, 2.4 m) and the throne before the deepest niche, a disc of runes
#                   on its back wall
#
# Run: python3 tools/make-boss-hall.py            (numpy, scipy; ~1 minute)
import json, math, os, time
import numpy as np
from scipy import ndimage as ndi

T0 = time.time()
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets', 'caves')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(31)


def log(*a):
    print(f'[{time.time() - T0:5.1f}s]', *a, flush=True)


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def unit(v):
    v = np.asarray(v, float)
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)


def roty(a):
    """three.js' rotation about y (rotation.y = a): local -> world"""
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], float)


# ================================================================ the plan
C = np.array([0.0, -36.0])            # the rotunda's middle (x, z)
APO = 22.0                            # its walls' distance from the middle (twenty sides)
NS = 20
RC = APO / math.cos(math.pi / NS)     # (to its corners)
HALF = RC * math.sin(math.pi / NS)    # half a side (3.48 m)
WALL_H = 16.0                         # the rotunda's walls; the dome over them
DOME_Y0, DOME_R0, DOME_H, OCULUS = 16.6, 22.3, 14.7, 3.5
NAVE_HW = RC * math.sin(math.radians(27))           # 10.11: the nave's walls meet the rotunda's corners either side of its arch
ARCH_Z = C[1] + RC * math.cos(math.radians(27))     # -16.16: the arch wall's rotunda face
ARCH_T = 1.5                                         # its thickness
NAVE_Z0, NAVE_Z1, NAVE_H = ARCH_Z + ARCH_T, 21.0, 18.0
ARCH_HW, ARCH_SPRING = 6.5, 9.0                      # the arch: 13 m wide, round, 15.5 at its crown
DOOR_HW, DOOR_H, DOOR_Z0, DOOR_Z1 = 3.6, 9.0, 21.0, 23.0
VEST_HW, VEST_Z1, VEST_H = 6.0, 40.0, 15.0
TUN_HW, TUN_Z1, TUN_H = 3.0, 50.0, 7.0
PILLARS_Z = [13.0, 5.0, -3.0, -11.0]
PILLAR_X = 5.6
FIRE_NAVE_Z = [17.0, 9.0, 1.0, -7.0]
FIRE_NAVE_X = 3.0
RUNNER_HW = 2.0
NICHE = dict(hw=2.6, d=2.6, spring=9.9)               # a statue's niche: 5.2 wide, 2.6 deep, its top a half round to 12.5
THRONE_NICHE = dict(hw=3.0, d=3.8, spring=11.4)       # the throne's: 6 wide, 3.8 deep, to 14.4
STATUE_SIDES = [2, 4, 6, 8, 12, 14, 16, 18]           # side j's middle faces the hall at angle j * 18 deg (0 north, 90 east)
STEP_H, STEPS, STEP_D = 0.3, 8, 0.7                   # the dais: eight steps of 0.3 m, each 0.7 m deep
DAIS_Z0, DAIS_HW0 = -45.5, 9.5                        # its first step's front edge and half width
CIRCLE_R = [7.6, 7.25, 5.0, 2.0]                      # the rune circle's rings

phi = lambda j: math.radians(j * 360.0 / NS)
dirn = lambda a: np.array([math.sin(a), -math.cos(a)])          # (x, z) of an angle: 0 north (-z), 90 east (+x)
tang = lambda a: np.array([math.cos(a), math.sin(a)])
TOP_STEP = STEPS * STEP_H
DAIS_TOP_Z = DAIS_Z0 - (STEPS - 1) * STEP_D
THRONE_Z = -54.6                                      # the throne's seat (its middle); its back at -56.3


def in_poly(x, z, apo=APO):
    """inside the rotunda's twenty sides"""
    dx, dz = x - C[0], z - C[1]
    a = np.arctan2(dx, -dz)
    k = np.round(a / (2 * np.pi / NS))
    ca = k * 2 * np.pi / NS
    return dx * np.sin(ca) - dz * np.cos(ca) < apo


def dais_h(x, z):
    """the dais' height there (0 off it): eight steps back from its front, narrower as they rise"""
    h = np.zeros(np.broadcast(x, z).shape)
    for k in range(STEPS):
        zf, hw = DAIS_Z0 - k * STEP_D, DAIS_HW0 - k * STEP_D
        h = np.where((z <= zf) & (np.abs(x) <= hw), (k + 1) * STEP_H, h)
    return h


# ================================================================ meshes
class Mesh:
    """positions, normals, uv (metres), info (what: material, group, phase), triangles"""

    def __init__(self):
        self.P, self.N, self.UV, self.INFO, self.I, self.n = [], [], [], [], [], 0

    def add(self, P, N, UV, I, info):
        P = np.asarray(P, float).reshape(-1, 3)
        N = np.asarray(N, float).reshape(-1, 3)
        UV = np.asarray(UV, float).reshape(-1, 2)
        info = np.broadcast_to(np.asarray(info, float), (len(P), 3)) if np.ndim(info) == 1 or len(info) != len(P) else np.asarray(info, float)
        self.P.append(P); self.N.append(N); self.UV.append(UV); self.INFO.append(np.array(info, float))
        self.I.append(np.asarray(I, np.int64).reshape(-1, 3) + self.n)
        self.n += len(P)

    def arrays(self):
        return (np.concatenate(self.P), np.concatenate(self.N), np.concatenate(self.UV), np.concatenate(self.INFO), np.concatenate(self.I))


MESH = Mesh()
# materials (what the shader paints): the floor's slabs, the walls' blocks, carved stone, the statues' stone, the fires' iron,
# fallen stone, the runes (glow), the roof, the statues' eyes (glow), the hollow of a hood, the oculus' light
FLOOR, BLOCKS, CARVED, STATUE, IRON, RUBBLE, RUNE, ROOF, EYE, HOLLOW, SKY = range(11)
# rune groups: the throne and its disc, the circle, the way's lines, the door's frame, the pillars' bands
G_THRONE, G_CIRCLE, G_WAY, G_DOOR, G_PILLAR = 20, 21, 22, 23, 24


def grid_idx(nu, nv):
    a = np.arange(nu)[:, None] * (nv + 1) + np.arange(nv)[None, :]
    a = a.ravel()
    return np.stack([np.stack([a, a + nv + 1, a + 1], 1), np.stack([a + 1, a + nv + 1, a + nv + 2], 1)], 1).reshape(-1, 3)


def quad(o, u, v, info, cell=0.9, uv0=(0.0, 0.0), flip=False, mesh=MESH):
    """a flat rectangle from corner o along u and v, cut into cells (the light is baked per vertex); its face toward u x v"""
    o, u, v = (np.asarray(a, float) for a in (o, u, v))
    lu, lv = np.linalg.norm(u), np.linalg.norm(v)
    nu, nv = max(1, int(math.ceil(lu / cell))), max(1, int(math.ceil(lv / cell)))
    A, B = np.meshgrid(np.linspace(0, 1, nu + 1), np.linspace(0, 1, nv + 1), indexing='ij')
    P = o + A[..., None] * u + B[..., None] * v
    n = unit(np.cross(u, v))
    I = grid_idx(nu, nv)
    if flip:
        n = -n; I = I[:, ::-1]
    UV = np.stack([uv0[0] + A * lu, uv0[1] + B * lv], -1)
    mesh.add(P, np.broadcast_to(n, P.shape), UV, I, info)


def box(c, h, info, R=None, cell=0.9, skip=(), mesh=MESH):
    """a box: middle c, half sizes h, turned by R; skip: faces left out ('+x', '-x', '+y', '-y', '+z', '-z')"""
    c, h = np.asarray(c, float), np.asarray(h, float)
    R = np.eye(3) if R is None else R
    X, Y, Z = R[:, 0] * h[0], R[:, 1] * h[1], R[:, 2] * h[2]
    faces = {'+x': (c + X - Y + Z, -2 * Z, 2 * Y), '-x': (c - X - Y - Z, 2 * Z, 2 * Y),
             '+y': (c - X + Y - Z, 2 * Z, 2 * X), '-y': (c - X - Y - Z, 2 * X, 2 * Z),
             '+z': (c - X - Y + Z, 2 * X, 2 * Y), '-z': (c + X - Y - Z, -2 * X, 2 * Y)}
    for k, (o, u, v) in faces.items():
        if k not in skip:
            quad(o, u, v, info, cell, mesh=mesh)


def smooth_normals(P, I):
    N = np.zeros_like(P)
    t = P[I]
    fn = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    for k in range(3):
        np.add.at(N, I[:, k], fn)
    return unit(N)


def surface(G, info, uvs=None, closed_u=True, flip=False, mesh=MESH):
    """a grid of points G[i, j] (i around, j up) as a surface; normals from its own shape"""
    nu, nv = G.shape[0] - 1, G.shape[1] - 1
    P = G.reshape(-1, 3)
    I = grid_idx(nu, nv)
    if flip:
        I = I[:, ::-1]
    N = smooth_normals(P, I)
    if closed_u:                                      # the seam: the first and last columns share their normals
        a, b = np.arange(nv + 1), nu * (nv + 1) + np.arange(nv + 1)
        s = unit(N[a] + N[b]); N[a] = s; N[b] = s
    if uvs is None:
        uvs = np.zeros((len(P), 2))
    mesh.add(P, N, uvs.reshape(-1, 2), I, info)


def lathe(profile, segs, info, sx=1.0, sz=1.0, centre=(0, 0, 0), deform=None, R=None, at=(0, 0, 0), flip=False, mesh=MESH):
    """round a profile [(y, r)] about the y axis (r along x times sx, along z times sz); deform(theta, y, r) -> r"""
    prof = np.asarray(profile, float)
    th = np.linspace(0, 2 * np.pi, segs + 1)
    T, Y = np.meshgrid(th, prof[:, 0], indexing='ij')
    Rr = np.broadcast_to(prof[:, 1], T.shape).copy()
    if deform is not None:
        Rr = deform(T, Y, Rr)
    G = np.stack([centre[0] + np.sin(T) * Rr * sx, Y + centre[1], centre[2] + np.cos(T) * Rr * sz], -1)
    if R is not None:
        G = G @ R.T
    G = G + np.asarray(at, float)
    lens = np.cumsum(np.r_[0, np.hypot(np.diff(prof[:, 0]), np.diff(prof[:, 1]))])
    uvs = np.stack([T * np.mean(prof[:, 1]) * max(sx, sz), np.broadcast_to(lens, T.shape)], -1)
    surface(G, info, uvs, flip=flip, mesh=mesh)


def tube(path, radii, segs, info, R=None, at=(0, 0, 0), mesh=MESH):
    """a round tube along a path (points), its radius along it"""
    path = np.asarray(path, float)
    T = np.gradient(path, axis=0); T = unit(T)
    up = np.array([0.0, 1.0, 0.0]) if abs(T[0][1]) < 0.9 else np.array([1.0, 0.0, 0.0])
    Nf = unit(np.cross(T[0], up))
    rings = []
    for i, p in enumerate(path):
        if i > 0:                                         # parallel transport
            Nf = unit(Nf - T[i] * np.dot(Nf, T[i]))
        Bf = np.cross(T[i], Nf)
        a = np.linspace(0, 2 * np.pi, segs + 1)
        rings.append(p + radii[i] * (np.cos(a)[:, None] * Nf + np.sin(a)[:, None] * Bf))
    G = np.stack(rings, 1)                                # (around, along)
    if R is not None:
        G = G @ R.T
    G = G + np.asarray(at, float)
    surface(G, info, None, mesh=mesh)


def ellipsoid(c, r, info, segs=14, R=None, at=(0, 0, 0), mesh=MESH):
    prof = [(c[1] + r[1] * math.cos(t), r[0] * math.sin(t)) for t in np.linspace(np.pi, 0, segs // 2 + 1)]
    lathe(prof, segs, info, sx=1.0, sz=r[2] / r[0], centre=(c[0], 0, c[2]), R=R, at=at, mesh=mesh)


def prism(c, rad, y0, y1, sides, info, cell=0.9, caps=False, rot=0.0, mesh=MESH):
    """an upright prism (a pillar's shaft): sides flat faces round c"""
    a = rot + np.arange(sides + 1) * 2 * np.pi / sides
    pts = np.stack([c[0] + rad * np.sin(a), c[1] + rad * np.cos(a)], 1)
    for i in range(sides):
        p, q = pts[i], pts[i + 1]
        quad((p[0], y0, p[1]), (q[0] - p[0], 0, q[1] - p[1]), (0, y1 - y0, 0), info, cell, flip=False, mesh=mesh)
    if caps:
        for y, up in ((y1, True), (y0, False)):
            P = np.vstack([[c[0], y, c[1]], np.c_[pts[:-1, 0], np.full(sides, y), pts[:-1, 1]]])
            I = np.array([[0, 1 + i, 1 + (i + 1) % sides] for i in range(sides)])
            if up:
                I = I[:, ::-1]
            mesh.add(P, np.broadcast_to([0, 1 if up else -1, 0], P.shape), P[:, [0, 2]], I, info)


def ribbon(pts, nrm, w, info, mesh=MESH):
    """a flat strip along a line of points, w wide, lying on the plane its normal nrm says (the runes)"""
    pts = np.asarray(pts, float)
    d = np.gradient(pts, axis=0)
    side = unit(np.cross(nrm, d)) * (w / 2)
    P = np.concatenate([pts - side, pts + side])
    n = len(pts)
    I = np.array([[i, n + i, i + 1] for i in range(n - 1)] + [[i + 1, n + i, n + i + 1] for i in range(n - 1)])
    if np.dot(np.cross(P[I[0][1]] - P[I[0][0]], P[I[0][2]] - P[I[0][0]]), nrm) < 0:
        I = I[:, ::-1]
    mesh.add(P, np.broadcast_to(nrm, P.shape), np.zeros((len(P), 2)), I, info if np.ndim(info) == 1 else np.concatenate([info, info]))


# ---------------------------------------------------------------- glyphs: a few strokes in a cell (u across, v up)
GLYPHS = [                     # sigils of our own: hooks, crescents, broken circles, crossed stems; no letter of any alphabet
    [((0.5, 0.0), (0.5, 1.0)), ((0.5, 0.78), (0.82, 0.98)), ((0.5, 0.48), (0.2, 0.68)), ((0.5, 0.18), (0.78, 0.36))],
    [('arc', 0.5, 0.72, 0.3, 180, 360), ((0.5, 0.42), (0.5, 0.0)), ((0.3, 0.2), (0.5, 0.3)), ((0.7, 0.2), (0.5, 0.3))],
    [((0.15, 0.35), (0.5, 0.92)), ((0.5, 0.92), (0.85, 0.35)), ((0.25, 0.18), (0.75, 0.18)), ((0.5, 0.0), (0.5, 0.18))],
    [('arc', 0.5, 0.5, 0.42, 120, 420), ((0.5, 0.5), (0.5, 1.0)), ((0.5, 0.5), (0.2, 0.3))],
    [((0.15, 0.85), (0.5, 0.55)), ((0.5, 0.55), (0.85, 0.85)), ((0.15, 0.45), (0.5, 0.15)), ((0.5, 0.15), (0.85, 0.45)), ((0.5, 0.0), (0.5, 1.0))],
    [('arc', 0.38, 0.5, 0.36, -70, 70), ('arc', 0.62, 0.5, 0.36, 110, 250), ((0.5, 0.0), (0.5, 1.0))],
    [((0.5, 0.0), (0.5, 0.62)), ((0.5, 0.62), (0.33, 0.8)), ((0.33, 0.8), (0.5, 0.98)), ((0.5, 0.98), (0.67, 0.8)), ((0.67, 0.8), (0.5, 0.62)), ((0.3, 0.3), (0.7, 0.3))],
    [((0.3, 1.0), (0.62, 0.62)), ((0.62, 0.62), (0.36, 0.45)), ((0.36, 0.45), (0.72, 0.0)), ((0.2, 0.62), (0.45, 0.62))],
    [('arc', 0.5, 0.5, 0.4, 0, 360), ('arc', 0.5, 0.5, 0.16, 0, 360), ((0.5, 0.9), (0.5, 1.0)), ((0.5, 0.0), (0.5, 0.1))],
    [((0.15, 0.5), (0.85, 0.5)), ((0.5, 0.15), (0.5, 0.85)), ('arc', 0.5, 0.5, 0.32, 20, 160), ('arc', 0.5, 0.5, 0.32, 200, 340)],
]


def glyph(o, u, v, nrm, w, info, kind=None, mesh=MESH):
    """one glyph: its strokes as ribbons on a plane, in the cell from o along u (across) and v (up)"""
    g = GLYPHS[kind if kind is not None else rng.integers(len(GLYPHS))]
    for st in g:
        if st[0] == 'arc':                                         # ('arc', cx, cy, r, from deg, to deg)
            _, cx, cy, r, a0, a1 = st
            t = np.radians(np.linspace(a0, a1, max(5, int(abs(a1 - a0) / 18) + 2)))
            pts = np.array([o + u * (cx + r * math.cos(q)) + v * (cy + r * math.sin(q)) for q in t])
            ribbon(pts, nrm, w, info, mesh=mesh)
        else:
            (a, b) = st
            p = o + u * a[0] + v * a[1]; q = o + u * b[0] + v * b[1]
            ribbon(np.linspace(p, q, 3), nrm, w, info, mesh=mesh)


def arc(c, r, a0, a1, y, n):
    """points on a flat circle (round c, radius r) from angle a0 to a1 (radians, 0 north), at height y"""
    a = np.linspace(a0, a1, n)
    return np.stack([c[0] + r * np.sin(a), np.full(n, y), c[1] - r * np.cos(a)], 1)


# ================================================================ the hall, piece by piece
log('shaping')
UP = np.array([0.0, 1.0, 0.0])
info = lambda m, g=0, ph=0: np.array([m, g, ph], float)

# ---- the floor: one grid over everything she walks on (it runs on under the walls; the dais stands on it)
FC = 0.5
fxs = np.arange(-23.0, 23.0 + 1e-6, FC)
fzs = np.arange(-63.0, 50.5 + 1e-6, FC)
FX, FZ = np.meshgrid(fxs, fzs, indexing='ij')


def in_room(x, z, grow=0.0):
    """inside the hall's walls (grown by `grow`): vestibule, tunnel, the door's gap, nave, the arch's gap, the rotunda and
    its throne niche"""
    r = ((np.abs(x) <= VEST_HW + grow) & (z >= DOOR_Z1 - grow) & (z <= VEST_Z1 + grow))
    r |= (np.abs(x) <= TUN_HW + grow) & (z >= VEST_Z1 - grow) & (z <= TUN_Z1 + grow)
    r |= (np.abs(x) <= DOOR_HW + grow) & (z >= DOOR_Z0 - grow) & (z <= DOOR_Z1 + grow)
    r |= (np.abs(x) <= NAVE_HW + grow) & (z >= NAVE_Z0 - grow) & (z <= NAVE_Z1 + grow)
    r |= (np.abs(x) <= ARCH_HW + grow) & (z >= ARCH_Z - grow) & (z <= NAVE_Z0 + grow)
    r |= in_poly(x, z, APO + grow) & (z <= ARCH_Z + grow)
    r |= (np.abs(x) <= THRONE_NICHE['hw'] + grow) & (z <= C[1] - APO + grow) & (z >= C[1] - APO - THRONE_NICHE['d'] - grow)
    for j in STATUE_SIDES:
        a = phi(j); dx, dz = x - C[0], z - C[1]
        tt = dx * math.cos(a) + dz * math.sin(a); nn = dx * math.sin(a) - dz * math.cos(a) - APO
        r |= (np.abs(tt) <= NICHE['hw'] + grow) & (nn >= -grow) & (nn <= NICHE['d'] + grow)
    return r


inside = in_room(FX, FZ, 0.75)
P = np.stack([FX, np.zeros_like(FX), FZ], -1)
keep = inside[:-1, :-1] & inside[1:, :-1] & inside[:-1, 1:] & inside[1:, 1:]
nu, nv = FX.shape[0] - 1, FX.shape[1] - 1
I = grid_idx(nu, nv).reshape(nu, nv, 2, 3)[keep].reshape(-1, 3)
used = np.unique(I)
remap = -np.ones(FX.size, np.int64); remap[used] = np.arange(len(used))
Pf = P.reshape(-1, 3)[used]
MESH.add(Pf, np.broadcast_to(UP, Pf.shape), Pf[:, [0, 2]], remap[I], info(FLOOR))

# ---- walls of a plain run: a vertical rectangle from a to b (x, z), y0..y1, facing the side `face` points to
def wall(a, b, y0, y1, face, m=BLOCKS, cell=0.9, uv0=0.0):
    a, b = np.asarray(a, float), np.asarray(b, float)
    o = np.array([a[0], y0, a[1]]); u = np.array([b[0] - a[0], 0, b[1] - a[1]]); v = np.array([0, y1 - y0, 0])
    n = np.cross(u, v)
    flip = np.dot(n[[0, 2]], face) < 0
    quad(o, u, v, info(m), cell, uv0=(uv0, y0), flip=flip)


def ceiling(x0, x1, z0, z1, y, m=ROOF, cell=1.2):
    quad((x0, y, z0), (x1 - x0, 0, 0), (0, 0, z1 - z0), info(m), cell, flip=False)


# the vestibule, its tunnel, the fallen far end
wall((-VEST_HW, DOOR_Z1), (-VEST_HW, VEST_Z1), 0, VEST_H, (1, 0))
wall((VEST_HW, DOOR_Z1), (VEST_HW, VEST_Z1), 0, VEST_H, (-1, 0))
wall((-VEST_HW, VEST_Z1), (-TUN_HW, VEST_Z1), 0, VEST_H, (0, -1))
wall((TUN_HW, VEST_Z1), (VEST_HW, VEST_Z1), 0, VEST_H, (0, -1))
wall((-TUN_HW, VEST_Z1), (TUN_HW, VEST_Z1), TUN_H, VEST_H, (0, -1))
wall((-TUN_HW, VEST_Z1), (-TUN_HW, TUN_Z1), 0, TUN_H, (1, 0))
wall((TUN_HW, VEST_Z1), (TUN_HW, TUN_Z1), 0, TUN_H, (-1, 0))
wall((-TUN_HW, TUN_Z1), (TUN_HW, TUN_Z1), 0, TUN_H, (0, -1))
ceiling(-VEST_HW, VEST_HW, DOOR_Z1, VEST_Z1, VEST_H)
ceiling(-TUN_HW, TUN_HW, VEST_Z1, TUN_Z1, TUN_H)
for z in (27.0, 33.0, 39.0):                                     # beams across the vestibule's roof
    box((0, VEST_H - 0.6, z), (VEST_HW, 0.6, 0.5), info(CARVED), skip=('+y',))
# the door's wall, both faces, the gap through it
for zf, face in ((DOOR_Z1, (0, 1)), (DOOR_Z0, (0, -1))):
    hw = VEST_HW if zf == DOOR_Z1 else NAVE_HW
    top = VEST_H if zf == DOOR_Z1 else NAVE_H
    wall((-hw, zf), (-DOOR_HW, zf), 0, top, face)
    wall((DOOR_HW, zf), (hw, zf), 0, top, face)
    wall((-DOOR_HW, zf), (DOOR_HW, zf), DOOR_H, top, face)
wall((-DOOR_HW, DOOR_Z0), (-DOOR_HW, DOOR_Z1), 0, DOOR_H, (1, 0), m=CARVED)
wall((DOOR_HW, DOOR_Z0), (DOOR_HW, DOOR_Z1), 0, DOOR_H, (-1, 0), m=CARVED)
quad((-DOOR_HW, DOOR_H, DOOR_Z0), (2 * DOOR_HW, 0, 0), (0, 0, DOOR_Z1 - DOOR_Z0), info(CARVED), flip=True)
# the door's frame on the vestibule's side: two pilasters, a lintel, a disc of runes over it
for s in (-1, 1):
    box((s * (DOOR_HW + 0.7), 5.25, DOOR_Z1 + 0.3), (0.7, 5.25, 0.3), info(CARVED), skip=('-z',))
    box((s * (DOOR_HW + 0.7), 0.35, DOOR_Z1 + 0.45), (0.85, 0.35, 0.45), info(CARVED), skip=('-z', '-y'))
    for k in range(5):                                           # runes down the pilasters' faces
        o = np.array([s * (DOOR_HW + 0.7) - 0.22, 2.2 + k * 1.45, DOOR_Z1 + 0.605])
        glyph(o, np.array([0.44, 0, 0]), np.array([0, 0.8, 0]), np.array([0, 0, 1.0]), 0.07, info(RUNE, G_DOOR, 40 + k * 20), kind=(k * 3 + (s > 0)) % len(GLYPHS))
box((0, 9.9, DOOR_Z1 + 0.4), (DOOR_HW + 1.5, 0.9, 0.4), info(CARVED), skip=('-z',))
disc_c = np.array([0.0, 12.75, DOOR_Z1 + 0.18])
lathe([(0.0, 0.0), (0.0, 1.85), (0.18, 1.85), (0.18, 1.6), (0.12, 1.25), (0.12, 0.0)], 28, info(CARVED),
      R=np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float), at=disc_c)
for r in (1.45, 0.75):
    pts = np.stack([disc_c[0] + r * np.cos(np.linspace(0, 2 * np.pi, 49)), disc_c[1] + r * np.sin(np.linspace(0, 2 * np.pi, 49)), np.full(49, disc_c[2] + 0.19 if r < 1 else disc_c[2] + 0.2)], 1)
    ribbon(pts, np.array([0, 0, 1.0]), 0.08, info(RUNE, G_DOOR, 160))
for k in range(8):
    a = k * np.pi / 4
    p = disc_c + np.array([np.cos(a) * 0.82, np.sin(a) * 0.82, 0.2]); q = disc_c + np.array([np.cos(a) * 1.38, np.sin(a) * 1.38, 0.2])
    ribbon(np.linspace(p, q, 3), np.array([0, 0, 1.0]), 0.07, info(RUNE, G_DOOR, 160))
# the vestibule's two fires' stone sills and some fallen stone along its walls; the tunnel's end fallen in
STONES = []                                                      # (x, z, r): fallen stones she walks round
for s in (-1, 1):
    for k in range(9):
        x = s * (VEST_HW - rng.uniform(0.3, 1.6)); z = rng.uniform(28.5, 39.0); hh = rng.uniform(0.2, 0.55)
        hx, hz = rng.uniform(0.3, 0.7), rng.uniform(0.3, 0.6)
        box((x, hh * 0.8, z), (hx, hh, hz), info(RUBBLE), R=roty(rng.uniform(0, 3.1)), skip=('-y',))
        STONES.append([round(x, 2), round(z, 2), round(max(hx, hz) * 0.9, 2)])
for k in range(42):                                              # the fall at the tunnel's end
    t = rng.random()
    x = rng.uniform(-TUN_HW + 0.3, TUN_HW - 0.3); z = TUN_Z1 - 0.4 - t * 4.5
    y = (1 - t) ** 1.3 * rng.uniform(0.6, 5.5)
    s3 = rng.uniform(0.35, 0.95)
    tl = 0.3 * rng.normal()
    box((x, y + s3 * 0.4, z), (s3, s3 * 0.7, s3 * 0.8), info(RUBBLE), R=roty(rng.uniform(0, 3.1)) @ np.array([[1, 0, 0], [0, math.cos(tl), -math.sin(tl)], [0, math.sin(tl), math.cos(tl)]]), skip=('-y',))

# the nave: walls, roof, beams, pilasters, pillars
wall((-NAVE_HW, NAVE_Z0), (-NAVE_HW, NAVE_Z1), 0, NAVE_H, (1, 0))
wall((NAVE_HW, NAVE_Z0), (NAVE_HW, NAVE_Z1), 0, NAVE_H, (-1, 0))
ceiling(-NAVE_HW, NAVE_HW, NAVE_Z0, NAVE_Z1, NAVE_H)
for z in PILLARS_Z:
    box((0, NAVE_H - 0.65, z), (NAVE_HW, 0.65, 0.6), info(CARVED), skip=('+y',))
    for s in (-1, 1):
        box((s * (NAVE_HW - 0.3), NAVE_H / 2, z), (0.3, NAVE_H / 2, 0.75), info(CARVED), skip=(('+x',) if s > 0 else ('-x',)))
        box((s * (NAVE_HW - 0.45), 0.5, z), (0.45, 0.5, 0.95), info(CARVED), skip=(('+x', '-y') if s > 0 else ('-x', '-y')))
for s in (-1, 1):
    box((s * PILLAR_X, NAVE_H - 0.55, (NAVE_Z0 + NAVE_Z1) / 2), (0.55, 0.55, (NAVE_Z1 - NAVE_Z0) / 2), info(CARVED), skip=('+y',))
for z in PILLARS_Z:
    for s in (-1, 1):
        x = s * PILLAR_X
        box((x, 0.5, z), (1.3, 0.5, 1.3), info(CARVED), skip=('-y',))                    # its plinth
        box((x, 1.15, z), (1.1, 0.15, 1.1), info(CARVED), skip=('-y',))
        prism((x, z), 0.98, 1.3, 15.4, 8, info(CARVED), cell=1.0, rot=math.pi / 8)       # the shaft
        box((x, 15.6, z), (1.05, 0.2, 1.05), info(CARVED), skip=('+y',))               # its capital, stepping out
        box((x, 16.15, z), (1.35, 0.35, 1.35), info(CARVED), skip=('+y',))
        # a band of runes round it, at her eye
        for f in range(8):
            a0 = math.pi / 8 + f * math.pi / 4
            p = np.array([x + 0.98 * math.sin(a0), z + 0.98 * math.cos(a0)])
            q = np.array([x + 0.98 * math.sin(a0 + math.pi / 4), z + 0.98 * math.cos(a0 + math.pi / 4)])
            mid = (p + q) / 2
            out = unit(np.array([mid[0] - x, 0, mid[1] - z])) * 0.012
            u = np.array([q[0] - p[0], 0, q[1] - p[1]]) * 0.46
            o = np.array([p[0], 2.6, p[1]]) + out + np.array([q[0] - p[0], 0, q[1] - p[1]]) * 0.27
            glyph(o, u, np.array([0, 0.46, 0]), unit(out), 0.05, info(RUNE, G_PILLAR, 0), kind=(f + int(z)) % len(GLYPHS))
# the way down the middle: a rune line either side (on the floor, as far as the circle)
for s in (-1, 1):
    zs = np.arange(NAVE_Z1 - 0.4, C[1] + CIRCLE_R[0] + 0.25, -0.5)
    pts = np.stack([np.full(len(zs), s * RUNNER_HW), np.full(len(zs), 0.012), zs], 1)
    ph = np.clip((NAVE_Z1 - zs) * 3.0, 0, 255)
    ribbon(pts, UP, 0.09, np.stack([np.full(len(zs), RUNE), np.full(len(zs), G_WAY), ph], 1))

# the arch wall: both faces with the arch cut, the arch's underside
def arch_y(x, hw, spring):
    return spring + np.sqrt(np.clip(hw * hw - x * x, 0, None))


for zf, face, top in ((ARCH_Z, (0, -1), 24.0), (NAVE_Z0, (0, 1), NAVE_H)):
    wall((-NAVE_HW, zf), (-ARCH_HW, zf), 0, top, face)
    wall((ARCH_HW, zf), (NAVE_HW, zf), 0, top, face)
    xs = np.linspace(-ARCH_HW, ARCH_HW, 41)
    G = np.stack([np.stack([xs, arch_y(xs, ARCH_HW, ARCH_SPRING) + s * (top - arch_y(xs, ARCH_HW, ARCH_SPRING)), np.full_like(xs, zf)], 1) for s in np.linspace(0, 1, 9)], 1)
    surface(G, info(BLOCKS), np.stack([G[..., 0], G[..., 1]], -1), closed_u=False, flip=(face[1] > 0))
for s in (-1, 1):
    wall((s * ARCH_HW, ARCH_Z), (s * ARCH_HW, NAVE_Z0), 0, ARCH_SPRING, (-s, 0), m=CARVED)
a = np.linspace(0, np.pi, 33)
G = np.stack([np.stack([ARCH_HW * np.cos(a), ARCH_SPRING + ARCH_HW * np.sin(a), np.full_like(a, z)], 1) for z in np.linspace(ARCH_Z, NAVE_Z0, 3)], 1)
surface(G, info(CARVED), np.stack([np.broadcast_to(a[:, None] * ARCH_HW, G.shape[:2]), G[..., 2]], -1), closed_u=False, flip=True)
for zf, sgn in ((ARCH_Z, -1), (NAVE_Z0, 1)):                     # a moulding round the arch, both sides
    a = np.linspace(0, np.pi, 33)
    ring_in = np.stack([ARCH_HW * np.cos(a), ARCH_SPRING + ARCH_HW * np.sin(a)], 1)
    ring_out = np.stack([(ARCH_HW + 0.7) * np.cos(a), ARCH_SPRING + (ARCH_HW + 0.7) * np.sin(a)], 1)
    zo = zf + sgn * 0.3
    G = np.stack([np.c_[ring_in, np.full(33, zo)], np.c_[ring_out, np.full(33, zo)]], 1)
    surface(G[:, :, [0, 1, 2]], info(CARVED), None, closed_u=False, flip=(sgn < 0))
    G2 = np.stack([np.c_[ring_out, np.full(33, zf)], np.c_[ring_out, np.full(33, zo)]], 1)
    surface(G2, info(CARVED), None, closed_u=False, flip=(sgn > 0))
    for s in (-1, 1):
        box((s * (ARCH_HW + 0.35), ARCH_SPRING / 2, zf + sgn * 0.15), (0.35, ARCH_SPRING / 2, 0.15), info(CARVED), skip=(('-z',) if sgn > 0 else ('+z',)))

# ---- the rotunda: twenty sides; niches; the cornice, the dome, the oculus
def side_frame(j):
    a = phi(j)
    m = C + dirn(a) * APO
    return a, m, dirn(a), tang(a)


def niche(j, hw, d, spring, top=WALL_H):
    """side j's wall with a round-headed niche cut in it, and the niche: its back, sides, vault, a moulding round it"""
    a, m, n, t = side_frame(j)
    to3 = lambda tt, y, nn: np.stack([m[0] + t[0] * tt + n[0] * nn, y, m[1] + t[1] * tt + n[1] * nn], -1)
    # the wall either side of it and over it (facing the hall: -n)
    for t0, t1 in ((-HALF, -hw), (hw, HALF)):
        G = np.stack([np.stack([to3(tt, y, 0.0) for y in np.linspace(0, top, 18)], 0) for tt in np.linspace(t0, t1, max(2, int(abs(t1 - t0) / 0.9) + 2))], 0)
        surface(G, info(BLOCKS), np.stack([np.broadcast_to(np.linspace(t0, t1, G.shape[0])[:, None], G.shape[:2]) + j * 7.0, G[..., 1]], -1), closed_u=False, flip=True)
    tt = np.linspace(-hw, hw, 25)
    G = np.stack([np.stack([to3(x, arch_y(x, hw, spring) + s * (top - arch_y(x, hw, spring)), 0.0) for x in tt], 0) for s in np.linspace(0, 1, 6)], 1)
    surface(G, info(BLOCKS), np.stack([np.broadcast_to(tt[:, None], G.shape[:2]) + j * 7.0, G[..., 1]], -1), closed_u=False, flip=True)
    # its back (round-headed), sides, vault
    G = np.stack([np.stack([to3(x, s * arch_y(x, hw, spring), d) for x in tt], 0) for s in np.linspace(0, 1, 14)], 1)
    surface(G, info(BLOCKS), np.stack([np.broadcast_to(tt[:, None], G.shape[:2]), G[..., 1]], -1), closed_u=False, flip=True)
    for s in (-1, 1):
        G = np.stack([np.stack([to3(s * hw, y, nn) for y in np.linspace(0, spring, 12)], 0) for nn in np.linspace(0, d, 4)], 0)
        surface(G, info(BLOCKS), np.stack([G[..., 1] * 0 + np.linspace(0, d, 4)[:, None], G[..., 1]], -1), closed_u=False, flip=(s < 0))
    aa = np.linspace(0, np.pi, 25)
    G = np.stack([np.stack([to3(hw * math.cos(q), spring + hw * math.sin(q), nn) for nn in np.linspace(0, d, 4)], 0) for q in aa], 0)
    surface(G, info(BLOCKS), np.stack([np.broadcast_to(aa[:, None] * hw, G.shape[:2]), np.broadcast_to(np.linspace(0, d, 4), G.shape[:2])], -1), closed_u=False, flip=False)
    # a moulding round its mouth (an archivolt and its jambs), standing 0.25 out into the hall
    out = -0.25
    edge_in = np.array([(-hw, y) for y in np.linspace(0, spring, 6)] + [(hw * math.cos(q), spring + hw * math.sin(q)) for q in np.linspace(np.pi, 0, 23)[1:-1]] + [(hw, y) for y in np.linspace(spring, 0, 6)])
    cen = np.array([0.0, spring])
    e_out = []
    for (x, y) in edge_in:
        if y <= spring + 1e-6:
            e_out.append((x + np.sign(x) * 0.55, y))
        else:
            v = unit(np.array([x, y]) - cen); e_out.append(tuple(np.array([x, y]) + v * 0.55))
    e_out = np.array(e_out)
    Gf = np.stack([np.stack([to3(p[0], p[1], out) for p in edge_in], 0), np.stack([to3(p[0], p[1], out) for p in e_out], 0)], 1)
    surface(Gf, info(CARVED), None, closed_u=False, flip=False)
    Gi = np.stack([np.stack([to3(p[0], p[1], 0.0) for p in edge_in], 0), np.stack([to3(p[0], p[1], out) for p in edge_in], 0)], 1)
    surface(Gi, info(CARVED), None, closed_u=False, flip=True)
    Go = np.stack([np.stack([to3(p[0], p[1], 0.0) for p in e_out], 0), np.stack([to3(p[0], p[1], out) for p in e_out], 0)], 1)
    surface(Go, info(CARVED), None, closed_u=False, flip=False)
    return a, m, n, t


for j in range(NS):
    if j in (9, 10, 11):
        continue                                                  # the arch to the nave
    if j == 0:
        niche(j, THRONE_NICHE['hw'], THRONE_NICHE['d'], THRONE_NICHE['spring'])
    elif j in STATUE_SIDES:
        niche(j, NICHE['hw'], NICHE['d'], NICHE['spring'])
    else:
        a, m, n, t = side_frame(j)
        p, q = m - t * HALF, m + t * HALF
        wall(p, q, 0, WALL_H, -n, uv0=j * 7.0)
# pilasters at the corners (where two sides meet), the cornice, the dome, its ribs, the oculus
for j in range(NS):
    ca = phi(j) + math.pi / NS
    if math.radians(160) < ca < math.radians(200):
        continue                                                  # (in the arch's gap: no walls there)
    p = C + dirn(ca) * RC
    box((p[0], WALL_H / 2 - 0.4, p[1]), (0.48, WALL_H / 2 - 0.4, 0.32), info(CARVED), R=roty(-ca), skip=('-z',))
cor_in, cor_out = APO - 0.9, RC + 0.2
for j in range(NS):
    a0, a1 = phi(j) - math.pi / NS, phi(j) + math.pi / NS
    if 9 <= j <= 11:
        continue
    p0i, p1i = C + dirn(a0) * cor_in / math.cos(math.pi / NS), C + dirn(a1) * cor_in / math.cos(math.pi / NS)
    p0o, p1o = C + dirn(a0) * RC, C + dirn(a1) * RC
    # underside, front, top
    quad((p0i[0], 15.4, p0i[1]), (p1i[0] - p0i[0], 0, p1i[1] - p0i[1]), (p0o[0] - p0i[0], 0, p0o[1] - p0i[1]), info(CARVED), flip=False)
    quad((p0i[0], 15.4, p0i[1]), (0, 1.2, 0), (p1i[0] - p0i[0], 0, p1i[1] - p0i[1]), info(CARVED), flip=False)
    quad((p0i[0], 16.6, p0i[1]), (p0o[0] - p0i[0], 0, p0o[1] - p0i[1]), (p1i[0] - p0i[0], 0, p1i[1] - p0i[1]), info(CARVED), flip=False)
amax = math.acos(OCULUS / DOME_R0)
dprof = [(DOME_Y0 + DOME_H * math.sin(t), DOME_R0 * math.cos(t)) for t in np.linspace(0, amax, 22)]
lathe(dprof, 96, info(ROOF), centre=(C[0], 0, C[1]), flip=True)
for j in range(0, NS, 2):                                         # ribs up the dome over each niche
    a = phi(j)
    pts = []
    for (y, r) in dprof:
        pts.append([C[0] + math.sin(a) * (r - 0.25), y - 0.1, C[1] - math.cos(a) * (r - 0.25)])
    pts = np.array(pts)
    d = np.gradient(pts, axis=0)
    side = np.array([math.cos(a), 0, math.sin(a)]) * 0.42
    inward = unit(np.cross(side, d))
    G = np.stack([pts - side, pts - side + inward * 0.45, pts + side + inward * 0.45, pts + side], 1)
    surface(G, info(CARVED), None, closed_u=False)
lathe([(dprof[-1][0] - 0.3, OCULUS + 0.6), (dprof[-1][0] + 0.2, OCULUS + 0.3), (dprof[-1][0] + 0.25, OCULUS), (38.0, OCULUS)], 48, info(CARVED), centre=(C[0], 0, C[1]), flip=True)
quad((C[0] - OCULUS, 37.95, C[1] - OCULUS), (2 * OCULUS, 0, 0), (0, 0, 2 * OCULUS), info(SKY), cell=1.0, flip=True)

# ---- the statues: hooded guardians, a sword planted before each (made here in its own frame: it faces +z)
SMESH = Mesh()


def statue_mesh():
    m = SMESH
    box((0, 0.42, 0), (2.1, 0.42, 1.65), info(CARVED), skip=('-y',), cell=0.8, mesh=m)
    box((0, 0.92, 0), (2.25, 0.09, 1.8), info(CARVED), skip=('-y',), cell=0.8, mesh=m)
    fold = lambda T, Y, Rr: Rr * (1 + 0.075 * np.sin(T * 9 + 0.6) * np.clip((7.2 - Y) / 4.5, 0, 1) + 0.03 * np.sin(T * 17) * np.clip((6 - Y) / 5, 0, 1))
    robe = [(1.0, 1.98), (1.35, 1.95), (2.4, 1.82), (3.7, 1.62), (4.9, 1.44), (5.9, 1.33), (6.7, 1.36), (7.3, 1.5), (7.75, 1.62),
            (8.1, 1.5), (8.4, 1.05), (8.6, 0.6)]
    lathe(robe, 56, info(STATUE), sz=0.74, deform=fold, mesh=m)

    def hood(T, Y, Rr):                           # its face: a hollow pressed into the front, where the eyes will light
        f = (T + np.pi) % (2 * np.pi) - np.pi     # (0 = straight ahead, +z)
        u = np.clip(np.abs(f) / math.radians(58), 0, 1); v = np.clip(np.abs(Y - 9.42) / 0.82, 0, 1)
        return Rr * (1 - 0.48 * (1 - u * u) ** 2 * (1 - v * v) ** 2)
    hp = [(8.3, 1.18), (8.6, 1.3), (9.1, 1.36), (9.7, 1.26), (10.15, 1.02), (10.5, 0.7), (10.75, 0.36), (10.9, 0.0)]
    lathe(hp, 48, info(STATUE), sz=0.98, centre=(0, 0, 0.14), deform=hood, mesh=m)
    hp_ = m.P[-1]                                                 # (the hood just made: its pressed-in face is the hollow)
    f = np.arctan2(hp_[:, 0], hp_[:, 2] - 0.14)
    u = np.clip(np.abs(f) / math.radians(52), 0, 1); v = np.clip(np.abs(hp_[:, 1] - 9.42) / 0.7, 0, 1)
    m.INFO[-1][(1 - u * u) ** 2 * (1 - v * v) ** 2 > 0.3, 0] = HOLLOW
    for s in (-1, 1):
        path = np.array([[s * 1.45, 7.6, 0.05], [s * 1.68, 6.9, 0.3], [s * 1.62, 6.25, 0.62], [s * 1.1, 6.35, 1.05], [s * 0.5, 6.55, 1.3]])
        tube(path, [0.5, 0.46, 0.42, 0.44, 0.52], 14, info(STATUE), mesh=m)
    ellipsoid((0, 6.45, 1.42), (0.34, 0.25, 0.28), info(STATUE), mesh=m)
    ellipsoid((0, 6.86, 1.42), (0.32, 0.24, 0.27), info(STATUE), mesh=m)
    # the sword: a blade (a flattened diamond, tapering to its point at the plinth), the guard, the pommel
    ys = np.linspace(1.0, 6.0, 12)
    w = np.where(ys < 1.6, 0.1 + (ys - 1.0) / 0.6 * 0.4, 0.5 + (ys - 1.6) / 4.4 * 0.12) / 2
    cs = [(-1, 0), (0, 1), (1, 0), (0, -1), (-1, 0)]
    G = np.stack([np.stack([np.array([cx * wk, y, 1.45 + cz * 0.075]) for (y, wk) in zip(ys, w)], 0) for (cx, cz) in cs], 0)
    surface(G, info(STATUE), None, closed_u=True, mesh=m)
    box((0, 6.12, 1.45), (1.05, 0.12, 0.16), info(STATUE), mesh=m)
    for s in (-1, 1):
        box((s * 1.12, 5.98, 1.45), (0.16, 0.2, 0.18), info(STATUE), R=roty(0) @ np.array([[math.cos(0.5 * s), -math.sin(0.5 * s), 0], [math.sin(0.5 * s), math.cos(0.5 * s), 0], [0, 0, 1]]), mesh=m)
    ellipsoid((0, 7.22, 1.45), (0.2, 0.2, 0.2), info(STATUE), segs=10, mesh=m)
    # a mantle over the shoulders
    lathe([(7.45, 1.72), (7.85, 1.78), (8.15, 1.55), (8.35, 1.15)], 48, info(STATUE), sz=0.8, mesh=m)


statue_mesh()
SP, SN, SUV, SINFO, SI = SMESH.arrays()
EYE_LOCAL = [np.array([s * 0.25, 9.52, 0.94]) for s in (-1, 1)]
STATUES = []
order = sorted(STATUE_SIDES, key=lambda j: min(j, NS - j))         # the eyes light from the throne's side outward
for k, j in enumerate(STATUE_SIDES):
    a, m, n, t = side_frame(j)
    pos = m + n * 1.25
    R = roty(-a)                                                 # (its +z toward the middle)
    W = SP @ R.T + np.array([pos[0], 0, pos[1]])
    WN = SN @ R.T
    inf = SINFO.copy()
    MESH.add(W, WN, SUV, SI, inf)
    eyes = []
    for e, el in enumerate(EYE_LOCAL):
        c = R @ el + np.array([pos[0], 0, pos[1]])
        fwd = R @ np.array([0, 0, 1.0])
        right = R @ np.array([1.0, 0, 0])
        tilt = -0.22 if e == 0 else 0.22                         # the eyes' inner ends lower: a scowl
        u = right * math.cos(tilt) + UP * math.sin(tilt)
        v = np.cross(fwd, u)
        ang = np.linspace(0, 2 * np.pi, 13)[:-1]
        ring = c + fwd * 0.03 + np.outer(np.cos(ang), u) * 0.17 + np.outer(np.sin(ang), v) * 0.052
        Pe = np.vstack([c + fwd * 0.04, ring])
        Ie = np.array([[0, 1 + i, 1 + (i + 1) % 12] for i in range(12)])
        if np.dot(np.cross(Pe[Ie[0][1]] - Pe[0], Pe[Ie[0][2]] - Pe[0]), fwd) < 0:
            Ie = Ie[:, ::-1]
        MESH.add(Pe, np.broadcast_to(fwd, Pe.shape), np.zeros((len(Pe), 2)), Ie, info(EYE, k, order.index(j) * 32))
        eyes.append([float(v) for v in c + fwd * 0.06])
    fire = m - n * 1.75
    STATUES.append(dict(side=j, x=float(pos[0]), z=float(pos[1]), yaw=float(-a), eyes=eyes, order=order.index(j), fire=[float(fire[0]), float(fire[1])]))

# ---- the dais, the throne, the disc of runes behind it
for k in range(STEPS):
    zf, hw = DAIS_Z0 - k * STEP_D, DAIS_HW0 - k * STEP_D
    zb = C[1] - APO - THRONE_NICHE['d'] - 0.2
    h = (k + 1) * STEP_H
    box((0, h - STEP_H / 2, (zf + zb) / 2), (hw, STEP_H / 2, (zf - zb) / 2), info(CARVED), skip=('-y',), cell=0.8)
T = np.array([0.0, THRONE_Z])
ty = TOP_STEP
box((0, ty + 0.5, T[1] - 0.1), (1.55, 0.5, 1.35), info(CARVED), skip=('-y',), cell=0.6)              # the seat
box((0, ty + 4.0, T[1] - 1.75), (1.65, 4.0, 0.35), info(CARVED), skip=('-y',), cell=0.7)             # its back
for s in (-1, 1):
    box((s * 1.75, ty + 0.85, T[1] - 0.25), (0.32, 0.85, 1.35), info(CARVED), skip=('-y',), cell=0.6)   # the arms
    box((s * 1.75, ty + 1.72, T[1] + 0.95), (0.42, 0.14, 0.38), info(CARVED), cell=0.6)
for s, hh in ((0, 2.1), (-1, 1.35), (1, 1.35), (-2, 0.8), (2, 0.8)):                                    # its crown of spikes
    x = s * 0.62; y0 = ty + 8.0
    P = np.array([[x - 0.3, y0, T[1] - 1.45], [x + 0.3, y0, T[1] - 1.45], [x + 0.3, y0, T[1] - 2.05], [x - 0.3, y0, T[1] - 2.05], [x, y0 + hh, T[1] - 1.75]])
    for (a_, b_) in ((0, 1), (1, 2), (2, 3), (3, 0)):
        tri = np.array([P[a_], P[b_], P[4]])
        n = unit(np.cross(tri[1] - tri[0], tri[2] - tri[0]))
        if np.dot(n, tri.mean(0) - np.array([x, y0 + hh * 0.3, T[1] - 1.75])) < 0:
            tri = tri[::-1]; n = -n
        MESH.add(tri, np.broadcast_to(n, (3, 3)), tri[:, [0, 1]], np.array([[0, 1, 2]]), info(CARVED))
yb = ty + 4.6
for r in (1.05, 0.62):                                        # its runes: a ring high on its back and a line down from it
    a_ = np.linspace(0, 2 * np.pi, 41)
    ribbon(np.stack([r * np.cos(a_), yb + 2.1 + r * np.sin(a_), np.full(41, T[1] - 1.39)], 1), np.array([0, 0, 1.0]), 0.08, info(RUNE, G_THRONE, 0))
ribbon(np.linspace([0, ty + 1.05, T[1] - 1.39], [0, yb + 1.0, T[1] - 1.39], 8), np.array([0, 0, 1.0]), 0.09, info(RUNE, G_THRONE, 0))
dc = np.array([0.0, 9.6, C[1] - APO - THRONE_NICHE['d'] + 0.02])
for r in (2.7, 2.45, 1.4, 0.55):
    a_ = np.linspace(0, 2 * np.pi, 65)
    ribbon(np.stack([dc[0] + r * np.cos(a_), dc[1] + r * np.sin(a_), np.full(65, dc[2])], 1), np.array([0, 0, 1.0]), 0.1 if r > 2 else 0.08, info(RUNE, G_THRONE, 30))
for k in range(16):
    a_ = k * 2 * np.pi / 16
    u = np.array([math.cos(a_ + np.pi / 2), math.sin(a_ + np.pi / 2), 0]) * 0.36; v = np.array([math.cos(a_), math.sin(a_), 0]) * 0.62
    o = dc + np.array([math.cos(a_), math.sin(a_), 0]) * 1.62 - u / 2
    glyph(o, u, v, np.array([0, 0, 1.0]), 0.06, info(RUNE, G_THRONE, 30), kind=k % len(GLYPHS))

# ---- the rune circle on the floor
cy = 0.014
for k, r in enumerate(CIRCLE_R):
    pts = arc(C, r, 0, 2 * np.pi, cy, max(48, int(r * 22)))
    ribbon(pts, UP, 0.16 if k == 0 else 0.11, info(RUNE, G_CIRCLE, r * 30))
for k in range(8):                                               # spokes
    a_ = k * np.pi / 4 + np.pi / 8
    pts = np.stack([C[0] + np.sin(a_) * np.linspace(2.0, 5.0, 6), np.full(6, cy), C[1] - np.cos(a_) * np.linspace(2.0, 5.0, 6)], 1)
    ribbon(pts, UP, 0.09, info(RUNE, G_CIRCLE, 100))
for k in range(2):                                               # the star in its middle: two squares
    a_ = np.array([0, 1, 2, 3, 4]) * np.pi / 2 + k * np.pi / 4
    pts = np.stack([C[0] + 1.85 * np.sin(a_), np.full(5, cy), C[1] - 1.85 * np.cos(a_)], 1)
    for i in range(4):
        ribbon(np.linspace(pts[i], pts[i + 1], 4), UP, 0.08, info(RUNE, G_CIRCLE, 40))
for k in range(48):                                              # glyphs round it, facing the middle
    a_ = k * 2 * np.pi / 48
    rdir = np.array([math.sin(a_), 0, -math.cos(a_)]); tdir = np.array([math.cos(a_), 0, math.sin(a_)])
    o = np.array([C[0], cy, C[1]]) + rdir * 5.45 - tdir * 0.24
    glyph(o, tdir * 0.48, rdir * 1.45, UP, 0.065, info(RUNE, G_CIRCLE, 190), kind=k % len(GLYPHS))

# ---- the fires: stands and bowls (their flames are boss-hall.js')
FIRES = []                                                       # x, y (the flame's foot), z, size, kind
def brazier(x, z, kind, tall=1.65, bowl=0.62):
    lathe([(0.0, 0.0), (0.0, 0.46), (0.12, 0.46), (0.18, 0.3), (0.28, 0.24), (tall - 0.3, 0.17), (tall - 0.12, 0.26), (tall, bowl * 0.45),
           (tall + 0.32, bowl), (tall + 0.36, bowl * 0.9), (tall + 0.16, bowl * 0.5), (tall + 0.2, 0.0)], 16, info(IRON), centre=(x, 0, z))
    FIRES.append(dict(x=x, y=tall + 0.3, z=z, size=bowl * 2.2, kind=kind))


for s in (-1, 1):
    brazier(s * 4.6, 25.6, 'door')
for z in FIRE_NAVE_Z:
    for s in (-1, 1):
        brazier(s * FIRE_NAVE_X, z, 'nave')
for s in (-1, 1):
    brazier(s * 7.0, -19.6, 'arch')
    brazier(s * 7.9, -44.2, 'dais', tall=1.9, bowl=0.75)
for st in STATUES:
    brazier(st['fire'][0], st['fire'][1], 'statue', tall=1.05, bowl=0.46)
log('mesh', MESH.n, 'vertices')

# ================================================================ the field of distance to stone (positive in stone): for shadows
H = 0.3
X0, Y0, Z0 = -24.0, -0.6, -63.5
X1, Y1, Z1 = 24.0, 39.0, 51.0
gx, gy, gz = np.arange(X0, X1 + 1e-6, H), np.arange(Y0, Y1 + 1e-6, H), np.arange(Z0, Z1 + 1e-6, H)
NXg, NYg, NZg = len(gx), len(gy), len(gz)
MARGIN = 2.0
S = np.full((NXg, NYg, NZg), MARGIN, np.float32)
log('field', NXg, NYg, NZg)


def sub(lo, hi):
    """the field's cells in a box (world), and their points"""
    i0 = max(0, int((lo[0] - X0) / H)); i1 = min(NXg, int(math.ceil((hi[0] - X0) / H)) + 1)
    j0 = max(0, int((lo[1] - Y0) / H)); j1 = min(NYg, int(math.ceil((hi[1] - Y0) / H)) + 1)
    k0 = max(0, int((lo[2] - Z0) / H)); k1 = min(NZg, int(math.ceil((hi[2] - Z0) / H)) + 1)
    sl = (slice(i0, i1), slice(j0, j1), slice(k0, k1))
    Xs, Ys, Zs = np.meshgrid(gx[i0:i1], gy[j0:j1], gz[k0:k1], indexing='ij')
    return sl, Xs, Ys, Zs


def sd_box(px, py, pz, c, h):
    qx, qy, qz = np.abs(px - c[0]) - h[0], np.abs(py - c[1]) - h[1], np.abs(pz - c[2]) - h[2]
    out = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2 + np.maximum(qz, 0) ** 2)
    return out + np.minimum(np.maximum(qx, np.maximum(qy, qz)), 0)


def capsule(px, py, pz, a, b, r):
    a, b = np.asarray(a, float), np.asarray(b, float)
    ba = b - a
    pa = np.stack([px - a[0], py - a[1], pz - a[2]], -1)
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return np.linalg.norm(pa - h[..., None] * ba, axis=-1) - r


def air_box(lo, hi, grow=0.1):
    c = (np.array(lo) + np.array(hi)) / 2; h = (np.array(hi) - np.array(lo)) / 2 + grow
    sl, Xs, Ys, Zs = sub(np.array(lo) - MARGIN, np.array(hi) + MARGIN)
    S[sl] = np.minimum(S[sl], sd_box(Xs, Ys, Zs, c, h))


def solid(lo, hi, fn):
    sl, Xs, Ys, Zs = sub(np.array(lo) - MARGIN, np.array(hi) + MARGIN)
    S[sl] = np.maximum(S[sl], -fn(Xs, Ys, Zs))


# the air: vestibule, tunnel, the door's gap (open: the light goes through it), the nave, the arch's gap, the rotunda and its
# dome and oculus, the niches
air_box((-VEST_HW, 0, DOOR_Z1), (VEST_HW, VEST_H, VEST_Z1))
air_box((-TUN_HW, 0, VEST_Z1 - 0.5), (TUN_HW, TUN_H, TUN_Z1))
air_box((-DOOR_HW, 0, DOOR_Z0 - 0.5), (DOOR_HW, DOOR_H, DOOR_Z1 + 0.5))
air_box((-NAVE_HW, 0, NAVE_Z0), (NAVE_HW, NAVE_H, NAVE_Z1))
air_box((-ARCH_HW, 0, ARCH_Z - 0.5), (ARCH_HW, ARCH_SPRING + ARCH_HW * 0.8, NAVE_Z0 + 0.5))
sl, Xs, Ys, Zs = sub(np.array([C[0] - RC, 0, C[1] - RC]) - MARGIN, np.array([C[0] + RC, 40, C[1] + RC]) + MARGIN)
dx, dz = Xs - C[0], Zs - C[1]
rr = np.hypot(dx, dz)
ang = np.arctan2(dx, -dz); kk = np.round(ang / (2 * np.pi / NS)); ca = kk * 2 * np.pi / NS
poly = dx * np.sin(ca) - dz * np.cos(ca) - APO - 0.1             # (negative inside the twenty sides)
cyl = np.maximum(poly, np.maximum(-Ys - 0.1, Ys - WALL_H - 0.6))
ey = np.maximum(Ys - DOME_Y0, 0)
dome = (np.sqrt((rr / (DOME_R0 + 0.1)) ** 2 + (ey / (DOME_H + 0.1)) ** 2) - 1) * min(DOME_R0, DOME_H)
dome = np.where(Ys < DOME_Y0, 1e3, dome)
ocu = np.maximum(rr - OCULUS, np.maximum(DOME_Y0 + DOME_H - 1.5 - Ys, Ys - 38.0))
S[sl] = np.minimum(S[sl], np.minimum(np.minimum(cyl, dome), ocu))
for j in range(NS):
    if j in (9, 10, 11) or (j not in STATUE_SIDES and j != 0):
        continue
    nd = THRONE_NICHE if j == 0 else NICHE
    a, m, n, t = side_frame(j)
    R = roty(-a)
    hw, d, spring = nd['hw'], nd['d'], nd['spring']
    sl, Xs, Ys, Zs = sub(np.array([m[0] - 7, 0, m[1] - 7]), np.array([m[0] + 7, spring + hw + 1, m[1] + 7]))
    lx = (Xs - m[0]) * R[0, 0] + (Zs - m[1]) * R[2, 0]        # into the niche's own frame: across, up, out of the hall
    lz = (Xs - m[0]) * R[0, 2] + (Zs - m[1]) * R[2, 2]
    q = sd_box(lx, Ys, -lz, (0, spring / 2, d / 2 - 0.25), (hw + 0.1, spring / 2 + 0.1, d / 2 + 0.35))
    vault = np.maximum(np.hypot(lx, Ys - spring) - hw - 0.1, np.maximum(-(Ys - spring), np.maximum(-lz - d - 0.1, lz - 0.25)))
    S[sl] = np.minimum(S[sl], np.minimum(q, vault))
log('field: rooms')

# the stone in the air: the arch wall, the tunnel's fall, pillars, pilasters, the plinths and capitals, beams, statues, the
# dais and throne, the fires' stands (each a little inside its faces: the bake's points just off a face must read as air)
AZ = (ARCH_Z + NAVE_Z0) / 2


def arch_wall(X, Y, Z):
    slab = sd_box(X, Y, Z, (0, 15.0, AZ), (NAVE_HW + 3, 16.0, ARCH_T / 2 - 0.1))
    gap = np.minimum(sd_box(X, Y, Z, (0, ARCH_SPRING / 2 - 0.5, AZ), (ARCH_HW + 0.1, ARCH_SPRING / 2 + 0.5, ARCH_T)),
                     np.maximum(np.hypot(X, Y - ARCH_SPRING) - ARCH_HW - 0.1, np.abs(Z - AZ) - ARCH_T))
    return np.maximum(slab, -gap)


solid((-NAVE_HW - 3, -1, ARCH_Z - 0.3), (NAVE_HW + 3, 31, NAVE_Z0 + 0.3), arch_wall)
solid((-TUN_HW, 0, 45.0), (TUN_HW, TUN_H, TUN_Z1), lambda X, Y, Z: np.maximum(sd_box(X, Y, Z, (0, 3.5, 48.0), (TUN_HW + 1, 3.5, 2.6)), (Y - 6.0 * (Z - 45.5) / 4.5) * 0.6))
for z in PILLARS_Z:
    for s in (-1, 1):
        x = s * PILLAR_X
        solid((x - 1.4, 0, z - 1.4), (x + 1.4, NAVE_H, z + 1.4), lambda X, Y, Z, x=x, z=z: np.minimum(np.minimum(
            np.maximum(np.hypot(X - x, Z - z) - 0.84, np.abs(Y - 8.0) - 8.6), sd_box(X, Y, Z, (x, 0.6, z), (1.2, 0.6, 1.2))), sd_box(X, Y, Z, (x, 16.2, z), (1.25, 0.4, 1.25))))
        solid((s * (NAVE_HW - 0.6) - 1, 0, z - 1), (s * (NAVE_HW - 0.6) + 1, NAVE_H, z + 1), lambda X, Y, Z, s=s, z=z: sd_box(X, Y, Z, (s * (NAVE_HW - 0.3), NAVE_H / 2, z), (0.22, NAVE_H / 2, 0.65)))
    solid((-NAVE_HW, NAVE_H - 1.4, z - 0.7), (NAVE_HW, NAVE_H, z + 0.7), lambda X, Y, Z, z=z: sd_box(X, Y, Z, (0, NAVE_H - 0.65, z), (NAVE_HW, 0.55, 0.5)))
for st in STATUES:
    R = roty(st['yaw']); pos = np.array([st['x'], 0, st['z']])

    def statue_sd(X, Y, Z, R=R, pos=pos):
        lx = (X - pos[0]) * R[0, 0] + (Z - pos[2]) * R[2, 0]
        lz = (X - pos[0]) * R[0, 2] + (Z - pos[2]) * R[2, 2]
        ped = sd_box(lx, Y, lz, (0, 0.45, 0), (2.0, 0.4, 1.55))
        t = np.clip((Y - 1.0) / 7.4, 0, 1)
        body = np.maximum(np.hypot(lx, lz / 0.74) - (1.95 + (1.35 - 1.95) * t) * 0.86, np.maximum(1.0 - Y, Y - 8.5))
        head = np.hypot(np.hypot(lx, Y - 9.5), (lz - 0.05) / 0.9) - 1.05
        sword = sd_box(lx, Y, lz, (0, 3.6, 1.45), (0.2, 2.5, 0.05))
        guard = sd_box(lx, Y, lz, (0, 6.1, 1.45), (0.95, 0.08, 0.1))
        arms = np.minimum(capsule(np.abs(lx), Y, lz, (1.45, 7.6, 0.05), (1.62, 6.25, 0.62), 0.32),
                          capsule(np.abs(lx), Y, lz, (1.62, 6.25, 0.62), (0.5, 6.55, 1.3), 0.3))
        return np.minimum.reduce([ped, body, head, sword, guard, arms])
    solid((st['x'] - 3, 0, st['z'] - 3), (st['x'] + 3, 11.2, st['z'] + 3), statue_sd)
for k in range(STEPS):
    zf, hw = DAIS_Z0 - k * STEP_D, DAIS_HW0 - k * STEP_D
    zb = C[1] - APO - THRONE_NICHE['d'] - 0.2
    h = (k + 1) * STEP_H
    solid((-hw, 0, zb), (hw, h, zf), lambda X, Y, Z, hw=hw, zf=zf, zb=zb, h=h: sd_box(X, Y, Z, (0, h / 2 - 0.05, (zf + zb) / 2 - 0.05), (hw - 0.08, h / 2 - 0.05, (zf - zb) / 2 - 0.05)))
solid((-2.2, TOP_STEP, THRONE_Z - 2.2), (2.2, TOP_STEP + 10.5, THRONE_Z + 1.4), lambda X, Y, Z: np.minimum.reduce([
    sd_box(X, Y, Z, (0, TOP_STEP + 0.45, THRONE_Z - 0.1), (1.45, 0.45, 1.25)), sd_box(X, Y, Z, (0, TOP_STEP + 4.0, THRONE_Z - 1.75), (1.55, 3.9, 0.25)),
    sd_box(X, Y, Z, (1.75, TOP_STEP + 0.8, THRONE_Z - 0.25), (0.24, 0.8, 1.25)), sd_box(X, Y, Z, (-1.75, TOP_STEP + 0.8, THRONE_Z - 0.25), (0.24, 0.8, 1.25))]))
for f in FIRES:
    solid((f['x'] - 0.7, 0, f['z'] - 0.7), (f['x'] + 0.7, f['y'], f['z'] + 0.7), lambda X, Y, Z, f=f: np.minimum(
        np.maximum(np.hypot(X - f['x'], Z - f['z']) - 0.14, np.maximum(-Y, Y - f['y'] + 0.4)), np.maximum(np.hypot(X - f['x'], Z - f['z']) - f['size'] * 0.3, np.maximum(f['y'] - 0.45 - Y, Y - f['y'] + 0.02))))
log('field: stone')


def sample(px, py, pz):
    c = np.stack([(px - X0) / H, (py - Y0) / H, (pz - Z0) / H])
    return ndi.map_coordinates(S, c, order=1, mode='nearest')


def soft_shadow(Pp, Lp, k=6.0, step0=0.2, steps=70):
    """how much of a light at Lp reaches the points Pp (1 = all), marched through the field, soft at the edges"""
    D = Lp[None, :] - Pp if Lp.ndim == 1 else Lp - Pp
    dist = np.linalg.norm(D, axis=1) + 1e-6
    D = D / dist[:, None]
    res = np.ones(len(Pp)); t = np.full(len(Pp), step0); alive = np.ones(len(Pp), bool)
    for _ in range(steps):
        q = Pp + D * t[:, None]
        d = -sample(q[:, 0], q[:, 1], q[:, 2])                  # into the air (> 0)
        res = np.where(alive, np.minimum(res, np.clip(k * d / t, 0, 1)), res)
        alive &= (d > 0.01) & (t < dist - 0.35)
        t = t + np.clip(d, 0.12, 1.5)
        if not alive.any():
            break
    return np.clip(res, 0, 1)


def ao_at(Pp, Nn):
    occ = np.zeros(len(Pp))
    for hstep, w in ((0.3, 0.45), (0.8, 0.3), (1.8, 0.2), (3.6, 0.1)):
        q = Pp + Nn * hstep
        d = -sample(q[:, 0], q[:, 1], q[:, 2])
        occ += w * np.clip((hstep - d) / hstep, 0, 1)
    return np.clip(1.0 - occ * 1.1, 0.15, 1.0)


# ================================================================ the light
BLUE = np.array([0.34, 0.72, 1.0])
SEAM = np.array([0.38, 0.78, 1.0])
PALE = np.array([0.66, 0.78, 1.0])
AMB = np.array([0.062, 0.078, 0.125])
OCU_POS = np.array([C[0], 36.0, C[1]])
LSCALE, FSCALE = 4.0, 4.0
BASE_FIRES = [f for f in FIRES if f['kind'] == 'door']
OTHER_FIRES = [f for f in FIRES if f['kind'] != 'door']
FIRE_POWER = {'door': (2.2, 16.0), 'nave': (2.2, 17.0), 'arch': (2.0, 17.0), 'dais': (2.5, 19.0), 'statue': (2.0, 13.5)}


def point(Pp, Nn, lp, inten, rad, shadow=True):
    Dv = lp[None, :] - Pp
    d = np.linalg.norm(Dv, axis=1) + 1e-6
    lam = np.clip((np.sum(Nn * Dv, 1) / d) * 0.5 + 0.5, 0, 1) ** 2 if Nn is not None else np.ones(len(Pp))
    fall = inten / (1.0 + (d / (rad * 0.35)) ** 2) * sstep(rad, rad * 0.4, d)
    out = lam * fall
    near = out > 0.004
    if shadow and near.any():
        out[near] *= soft_shadow(Pp[near], lp)
    return out


def light_at(Pp, Nn):
    """the light at points (normals Nn, or None for the air): base RGB, fire, rune circle"""
    n = len(Pp)
    ao = ao_at(Pp, Nn) if Nn is not None else np.clip(-sample(Pp[:, 0], Pp[:, 1], Pp[:, 2]) / 2.0, 0.35, 1.0)
    base = AMB[None, :] * ao[:, None] * 1.0
    # the pale shaft down the oculus: a soft beam onto the circle, and a little spill round it
    Dv = OCU_POS[None, :] - Pp
    d = np.linalg.norm(Dv, axis=1) + 1e-6
    cosd = Dv[:, 1] / d
    beam = sstep(math.cos(math.radians(9.5)), math.cos(math.radians(5.5)), cosd) * 2.1 + sstep(math.cos(math.radians(38)), math.cos(math.radians(9)), cosd) * 0.24
    lam = np.clip((np.sum(Nn * Dv, 1) / d) * 0.6 + 0.4, 0, 1) if Nn is not None else np.ones(n)
    beam = beam * lam
    lit = beam > 0.003
    if lit.any():
        beam[lit] *= soft_shadow(Pp[lit], OCU_POS, k=10.0, steps=80)
    base += beam[:, None] * PALE[None, :]
    for f in BASE_FIRES:
        inten, rad = FIRE_POWER[f['kind']]
        base += point(Pp, Nn, np.array([f['x'], f['y'] + 0.7, f['z']]), inten, rad)[:, None] * BLUE[None, :]
    base += point(Pp, Nn, np.array([0.0, 4.5, DOOR_Z1 + 0.6]), 0.45, 7.0, shadow=False)[:, None] * SEAM[None, :]
    base += point(Pp, Nn, np.array([0.0, 12.75, DOOR_Z1 + 0.9]), 0.25, 4.0, shadow=False)[:, None] * SEAM[None, :]
    fire = np.zeros(n)
    for f in OTHER_FIRES:
        inten, rad = FIRE_POWER[f['kind']]
        fire += point(Pp, Nn, np.array([f['x'], f['y'] + 0.7, f['z']]), inten, rad)
    rune = np.zeros(n)
    for r, cnt, inten in ((7.4, 28, 0.32), (5.0, 16, 0.22), (2.0, 6, 0.2)):
        for k in range(cnt):
            a_ = k * 2 * np.pi / cnt
            rune += point(Pp, Nn, np.array([C[0] + r * math.sin(a_), 0.35, C[1] - r * math.cos(a_)]), inten, 4.0, shadow=False)
    rune += point(Pp, Nn, np.array([0.0, 9.6, C[1] - APO - THRONE_NICHE['d'] + 0.8]), 0.9, 6.0, shadow=False)
    return base, fire, rune


V, NRM, UV, INFO, IDX = MESH.arrays()
log('baking', len(V), 'vertices,', len(IDX), 'triangles')
NRM = unit(NRM)
lit_mat = ~np.isin(INFO[:, 0], (RUNE, EYE, SKY))
s_out = sample(*(V + NRM * 0.3).T); s_in = sample(*(V - NRM * 0.3).T)
wrong = lit_mat & (s_out > s_in + 0.12)
NRM[wrong] *= -1
fn = np.cross(V[IDX[:, 1]] - V[IDX[:, 0]], V[IDX[:, 2]] - V[IDX[:, 0]])
bad = np.sum(fn * NRM[IDX].sum(1), 1) < 0
IDX[bad] = IDX[bad][:, ::-1]
log('normals turned round:', int(wrong.sum()), 'of', len(V), '; triangles rewound:', int(bad.sum()))
Pb = V + NRM * 0.12
base = np.zeros((len(V), 3)); fire = np.zeros(len(V)); rune = np.zeros(len(V))
for a0 in range(0, len(V), 40000):
    b0 = min(len(V), a0 + 40000)
    bb, ff, rr_ = light_at(Pb[a0:b0], NRM[a0:b0])
    base[a0:b0], fire[a0:b0], rune[a0:b0] = bb, ff, rr_
    log('  baked', b0)
# the glowing things carry no baked light of their own (they light themselves)
glowing = np.isin(INFO[:, 0], (RUNE, EYE, SKY))
base[glowing] = 0; fire[glowing] = 0
light8 = np.zeros((len(V), 4), np.uint8)
light8[:, :3] = np.clip(base / LSCALE * 255 + 0.5, 0, 255)
light8[:, 3] = np.clip(fire / FSCALE * 255 + 0.5, 0, 255)
info8 = np.zeros((len(V), 4), np.uint8)
info8[:, 0] = INFO[:, 0]; info8[:, 1] = INFO[:, 1]; info8[:, 2] = np.clip(INFO[:, 2], 0, 255)
info8[:, 3] = np.clip(rune / 2.0 * 255 + 0.5, 0, 255)
nrm8 = np.zeros((len(V), 4), np.int8)
nrm8[:, :3] = np.clip(np.round(NRM * 127), -127, 127)
V32 = V.astype(np.float32)
UV32 = UV.astype(np.float32)
I32 = IDX.astype(np.uint32)
log('mesh baked')

# ================================================================ her floor and roof (cave-level.js reads them as the forest hall's)
HF = 0.4
FX0, FZ0 = -23.6, -63.2
fnx, fnz = int(47.2 / HF) + 1, int(114.4 / HF) + 1
cx_ = FX0 + np.arange(fnx) * HF; cz_ = FZ0 + np.arange(fnz) * HF
GX, GZ = np.meshgrid(cx_, cz_, indexing='ij')
room = in_room(GX, GZ, -0.05)
floorY = np.where(room, dais_h(GX, GZ), np.nan)
# the roof over each spot: the vestibule's, the tunnel's, the nave's (its beams), the rotunda's dome, the niches'
rr = np.hypot(GX - C[0], GZ - C[1])
dome_y = DOME_Y0 + DOME_H * np.sqrt(np.clip(1 - (rr / DOME_R0) ** 2, 0, 1))
ceilY = np.full(GX.shape, np.nan)
ceilY = np.where(room & (GZ >= DOOR_Z1), VEST_H - 1.2, ceilY)
ceilY = np.where(room & (GZ >= VEST_Z1), TUN_H, ceilY)
ceilY = np.where(room & (GZ >= DOOR_Z0) & (GZ <= DOOR_Z1), DOOR_H, ceilY)
ceilY = np.where(room & (GZ >= NAVE_Z0) & (GZ < DOOR_Z0), NAVE_H - 1.3, ceilY)
ceilY = np.where(room & (GZ < NAVE_Z0) & (GZ >= ARCH_Z), ARCH_SPRING + np.sqrt(np.clip(ARCH_HW ** 2 - GX ** 2, 0, None)), ceilY)
ceilY = np.where(room & (GZ < ARCH_Z), np.where(rr < OCULUS, 38.0, dome_y - 0.6), ceilY)
ceilY = np.where(room & (GZ < C[1] - APO), THRONE_NICHE['spring'], ceilY)
# where stone stands on the floor (the field, a hand over the floor): no floor of hers there
base_y = np.where(np.isnan(floorY), 0, floorY)
low = (sample(GX.ravel(), (base_y + 0.9).ravel(), GZ.ravel()).reshape(GX.shape) > -0.25) & room
tall = low & (sample(GX.ravel(), (base_y + 4.0).ravel(), GZ.ravel()).reshape(GX.shape) > -0.15)
floorY = np.where(tall, np.nan, floorY)
ceilY = np.where(tall, np.nan, ceilY)
fl16 = np.where(np.isnan(floorY), -32768, np.round(floorY * 100)).astype(np.int16)
ce16 = np.where(np.isnan(ceilY), -32768, np.round(np.minimum(ceilY, 300) * 100)).astype(np.int16)
paintG = np.zeros((fnx, fnz, 4), np.uint8)
paintG[..., 3] = np.where(np.isnan(floorY) | low, 255, 150)        # (150: bare stone, hers; 255: no floor of hers)
log('floor map', fnx, fnz)

# ================================================================ the light in the air (for her): 1 m cells
VC = 1.0
VX0, VY0, VZ0 = -23.0, -0.5, -62.5
vxs, vys, vzs = np.arange(VX0, 23.01, VC), np.arange(VY0, 24.01, VC), np.arange(VZ0, 50.01, VC)
VNX, VNY, VNZ = len(vxs), len(vys), len(vzs)
Pv = np.stack(np.meshgrid(vxs, vys, vzs, indexing='ij'), -1).reshape(-1, 3)
inair = sample(Pv[:, 0], Pv[:, 1], Pv[:, 2]) < 0.2
Pa = Pv[inair]
log('volume', VNX, VNY, VNZ, 'cells in the air:', len(Pa))
vb = np.zeros((len(Pa), 3)); vf = np.zeros(len(Pa))
for a0 in range(0, len(Pa), 40000):
    b0 = min(len(Pa), a0 + 40000)
    bb, ff, _ = light_at(Pa[a0:b0], None)
    vb[a0:b0], vf[a0:b0] = bb, ff
vol = np.zeros((len(Pv), 4), np.float32)
vol[inair, :3] = vb * 0.9
vol[inair, 3] = vf * 0.9
vol = vol.reshape(VNX, VNY, VNZ, 4)
mask = inair.reshape(VNX, VNY, VNZ)
idx = ndi.distance_transform_edt(~mask, return_distances=False, return_indices=True)
vol = vol[idx[0], idx[1], idx[2]]
vol8 = np.zeros((VNZ, VNY, VNX, 4), np.uint8)                  # three's Data3DTexture: x fastest, then y, then z
vt = vol.transpose(2, 1, 0, 3)
vol8[..., :3] = np.clip(vt[..., :3] / LSCALE * 255 + 0.5, 0, 255)
vol8[..., 3] = np.clip(vt[..., 3] / FSCALE * 255 + 0.5, 0, 255)
log('volume baked')

# ================================================================ write
parts, off = [], 0


def put(arr):
    global off
    b = np.ascontiguousarray(arr).tobytes()
    pad = (-len(b)) % 4
    parts.append(b + b'\0' * pad)
    o = off
    off += len(b) + pad
    return o


header = {
    # light: base RGB (x lightScale), fire (x fireScale); info: material, group, phase, the rune circle's light (x 2)
    'mesh': {'vertices': int(len(V32)), 'indices': int(I32.size),
             'pos': put(V32), 'nrm': put(nrm8), 'uv': put(UV32), 'light': put(light8), 'info': put(info8), 'idx': put(I32)},
    'floor': {'nx': int(fnx), 'nz': int(fnz), 'x0': FX0, 'z0': FZ0, 'cell': HF,
              'floor': put(fl16), 'ceil': put(ce16), 'paint': put(paintG)},
    'volume': {'nx': int(VNX), 'ny': int(VNY), 'nz': int(VNZ), 'x0': VX0, 'y0': VY0, 'z0': VZ0, 'cell': VC, 'data': put(vol8)},
    'lightScale': LSCALE, 'fireScale': FSCALE,
}
with open(os.path.join(OUT, 'boss-hall.bin'), 'wb') as f:
    f.write(b''.join(parts))
PLACES = [dict(name='หน้าประตู', x=0.0, z=37.5, heading=math.pi),
          dict(name='ทางเดินเสา', x=0.0, z=16.0, heading=math.pi),
          dict(name='วงรูปปั้น', x=0.0, z=-19.5, heading=math.pi),
          dict(name='บัลลังก์', x=0.0, z=-49.2, heading=0.0)]
layout = {
    'about': 'the boss hall (room 5 of the dungeon plan): made by tools/make-boss-hall.py, read by boss-hall.js',
    'bin': header,
    'materials': ['floor', 'blocks', 'carved', 'statue', 'iron', 'rubble', 'rune', 'roof', 'eye', 'hollow', 'sky'],
    'groups': {'throne': G_THRONE, 'circle': G_CIRCLE, 'way': G_WAY, 'door': G_DOOR, 'pillar': G_PILLAR},
    'fires': [dict(x=round(f['x'], 3), y=round(f['y'], 3), z=round(f['z'], 3), size=round(f['size'], 3), kind=f['kind']) for f in FIRES],
    'statues': STATUES,
    'door': {'hw': DOOR_HW, 'h': DOOR_H, 'z': (DOOR_Z0 + DOOR_Z1) / 2, 'thick': 0.5, 'wall': [DOOR_Z0, DOOR_Z1]},
    'circle': {'c': list(C), 'r': CIRCLE_R},
    'oculus': {'c': list(C), 'r': OCULUS, 'y': DOME_Y0 + DOME_H * math.sin(amax), 'top': 38.0},
    'throne': {'x': 0.0, 'z': THRONE_Z, 'y': TOP_STEP},
    'nave': {'hw': NAVE_HW, 'z0': NAVE_Z0, 'z1': NAVE_Z1, 'h': NAVE_H},
    'pool': {'c': [999.0, 999.0], 'r': 0.0, 'level': -99.0},        # (none: cave-level.js asks)
    'spawn': {'x': PLACES[0]['x'], 'z': PLACES[0]['z'], 'yaw': PLACES[0]['heading']},
    'places': [dict(p, y=round(float(dais_h(np.array(p['x']), np.array(p['z']))), 2)) for p in PLACES],
    'gates': [],
    'stones': STONES,                                             # x, z, r: fallen stones in the vestibule (she walks round them)
    'bounds': [X0, Y0, Z0, X1, Y1, Z1],
}
json.dump(layout, open(os.path.join(OUT, 'boss-hall.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
log('wrote', os.path.getsize(os.path.join(OUT, 'boss-hall.bin')) // 1024, 'KB bin,', len(V32), 'vertices,', len(I32), 'triangles')
