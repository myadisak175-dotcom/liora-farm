# water_shape.py  —  water's ways shaped as water shapes them, for the maps' heightmap tools
#
# One job: given a land (a grid of heights) and where its water runs, say how the water would have worn it. A tool draws
# where a brook runs and how high its water stands; this makes the bed (and, for land that is not to be kept as it is, the
# rain's own runnels down its slopes). It decides nothing about where things are: the tools do that, each for its own map,
# and say what must be left as it is.
#
#   the bed       bed_line: the line drawn for a water, made a water's own (its corners rounded, wandering a little).
#                 profile: along that line, what the water has made of it: wide and shallow on a riffle and narrow and
#                 deep in a pool, the pools at the bends; in a bend its deepest lies against the outer bank, cut steep, and
#                 the inner side goes up slowly over the bar it left there; no two stretches of bank alike; under each fall
#                 a round pool, the lip above narrow and cut back in its middle; where a way crosses, a ford.
#                 section: the bed and its banks across the line, at any places beside it.
#                 channel: the two together, over a whole land (as the west fringe's dry beds are made).
#   the rain      flow: how much ground drains through each place (hollows filled first, as a flood would fill them, so
#                 every drop gets somewhere). runnels: how deep the land is worn by it: a gully where the water runs fast (down
#                 a bank, a scarp, a hill), no more than a swale where it runs slowly.
#   and           ease: anything small left too steep (which the land would paint as rock) eased to a slope of earth.
#
# Heights are metres; places are metres (x east, z south). A tool hands its land over as a Land: its grid of places (WX,
# WZ) and the metres between two of them. Its dice too (a numpy Generator): the shapes come out the same each time.
import heapq, math
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree


def sm(a, b, x):                                              # 0 at a, 1 at b, smooth between (a may be the greater)
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def lower(a, b, k=0.16):                                      # the lower of two surfaces, rounded where they meet (k metres): no crease
    return -k * np.logaddexp(-a / k, -b / k)


def chaikin(P, n=3, closed=False):                            # corners cut off a line, n times
    P = np.asarray(P, float)
    for _ in range(n):
        A, B = (P, np.roll(P, -1, 0)) if closed else (P[:-1], P[1:])
        Q = np.empty((2 * len(A), 2)); Q[0::2] = .75 * A + .25 * B; Q[1::2] = .25 * A + .75 * B
        P = Q if closed else np.vstack([P[:1], Q, P[-1:]])
    return P


def densify(pts, step=0.4):                                   # a line as points `step` metres apart, and how far along it each lies
    P = np.asarray(pts, float); out = [P[:1]]
    for a, b in zip(P[:-1], P[1:]):
        n = max(1, int(math.ceil(np.linalg.norm(b - a) / step)))
        out.append(a + (b - a) * (np.arange(1, n + 1) / n)[:, None])
    Q = np.vstack(out); s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Q, axis=0), axis=1))]
    return Q, s


def wave(rng, n, step, cell):                                 # smooth noise along a line: -1 .. 1 at n points `step` metres apart, its wave `cell` metres
    g = rng.uniform(-1, 1, int(n * step / cell) + 6)
    return np.clip(ndi.map_coordinates(g, [np.arange(n) * step / cell + 1.5], order=3, mode='nearest'), -1, 1)


class Land:
    """a tool's land as this needs it: WX, WZ (the place of every height, metres) and cell (metres between two)"""
    def __init__(self, WX, WZ, cell):
        self.WX, self.WZ, self.cell = WX, WZ, cell
        self.x0, self.z0 = float(WX[0, 0]), float(WZ[0, 0])

    def near_line(self, Q, reach):                            # every place within reach of a line: (mask, metres off it, which point of it)
        WX, WZ = self.WX, self.WZ
        x0, x1, z0, z1 = Q[:, 0].min() - reach, Q[:, 0].max() + reach, Q[:, 1].min() - reach, Q[:, 1].max() + reach
        box = (WX >= x0) & (WX <= x1) & (WZ >= z0) & (WZ <= z1)
        d, i = cKDTree(Q).query(np.column_stack([WX[box], WZ[box]]))
        D = np.full(WX.shape, 1e9); I = np.zeros(WX.shape, int); D[box] = d; I[box] = i
        return D < reach, D, I

    def sample(self, F, P):                                   # a field's values at places P (n x 2), read between its heights
        P = np.asarray(P, float)
        return ndi.map_coordinates(F, [(P[:, 1] - self.z0) / self.cell, (P[:, 0] - self.x0) / self.cell], order=1, mode='nearest')

    def slope(self, F):                                       # how steeply the land falls at each place (rise over run)
        gz, gx = np.gradient(F, self.cell); return np.hypot(gx, gz)


# ------------------------------------------------------------------ the bed
DS = 0.2                                                      # metres between a bed line's points


def bed_line(rng, pts, wander_m, hold=(), corners=2):
    """a drawn line made a water's own: its corners rounded, and wandering up to wander_m either side of where it was drawn
    (not at its ends, nor near the places in hold: (x, z, metres)). -> its points, DS metres apart, and how far along each"""
    Q, s = densify(chaikin(pts, corners), DS)
    T = np.gradient(Q, axis=0); T /= np.linalg.norm(T, axis=1)[:, None] + 1e-9
    k = sm(0, 5, s) * sm(s[-1], s[-1] - 5, s)
    for x, z, r in hold: k = k * sm(r * 0.5, r * 1.6, np.hypot(Q[:, 0] - x, Q[:, 1] - z))
    Q = Q + np.column_stack([-T[:, 1], T[:, 0]]) * (wander_m * wave(rng, len(Q), DS, 12.0) * k)[:, None]
    Q = np.column_stack([ndi.gaussian_filter1d(Q[:, 0], 3, mode='nearest'), ndi.gaussian_filter1d(Q[:, 1], 3, mode='nearest')])
    return densify(Q, DS)


def profile(rng, Q, s, half, deep, falls=(), fords=(), shallow=0.12):
    """along a bed line (Q, s: from bed_line), what the water has made of it. half: its half width on a riffle (metres: one,
    or one at each point); shallow, deep: how far its riffles and its pools lie under its banks' foot; falls, fords: metres
    along the line. -> a dict of
    arrays along the line: T, N (along it, and to its side), kn (how hard it bends there, -1 .. 1: + toward N), w (half its
    width), dep (how deep, under its riffles), off (where its deepest lies, metres toward N), steep (each bank's slope:
    0 the N side, 1 the other), ford (1 at a ford), near_fall (1 at a fall), falls"""
    n = len(Q)
    half = np.broadcast_to(np.asarray(half, float), (n,))
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
    pool = np.clip(0.8 * bend + 0.5 * (0.5 + 0.5 * np.sin(2 * np.pi * s / (11.5 * half) + 6.28 * wave(rng, n, DS, 40.0))) * (1 - bend), 0, 1) * calm
    w = half * (1.14 - 0.32 * pool + 0.2 * wave(rng, n, DS, 9.0)) * (1 + 0.25 * ford)
    dep = shallow + (deep - shallow) * pool
    for f in falls:                                                     # the lip above: narrow, bare; the pool the fall dug below: round, deep, wide
        up = s < f
        w = np.where(up, w * (1 - 0.32 * np.exp(-((f - s) / 2.2) ** 2)), w * (1 + 0.5 * np.exp(-((s - f - 2.0) / 2.3) ** 2)))
        dep = np.where(up, dep * (1 - np.exp(-((f - s) / 2.0) ** 2)) + 0.06, dep + 0.62 * np.exp(-((s - f - 1.7) / 1.6) ** 2))
    off = -kn * 0.42 * w                                                # the deepest of it: toward the outside of the bend
    steep = np.stack([0.55 + 0.24 * wave(rng, n, DS, 7.0), 0.55 + 0.24 * wave(rng, n, DS, 7.0)])      # each bank its own, all along
    near_fall = np.zeros(n)
    for f in falls: near_fall = np.maximum(near_fall, sm(4.0, 1.0, np.abs(s - f)))
    return dict(Q=Q, s=s, T=T, N=N_, kn=kn, w=w, dep=dep, off=off, steep=steep, ford=ford, near_fall=near_fall, falls=list(falls), fords=list(fords))


def section(P, px, pz, D, I, level, land_h=None, face_at=1.1):
    """the bed and its banks across the line, at places (px, pz) beside it: D metres off it, I its nearest point. level: the
    height of its riffles at each point of the line (a fall is a step in it). land_h: the land at those places, smoothed, to
    say how high it stands over the bed (None: no matter): nothing low stands steep (the land paints rock on what is steeper than about 0.7, and a bank a
    step high painted as rock is a row of splinters), so a pool's side is kept under 0.6 and a bank is cut steep only where
    it stands over face_at metres above the bed, where it is a face. -> (the surface it cuts: where it is lower than the land,
    the land is cut to it; how far across the bed each place is (under 1: in it); where a bank is meant to stand as a face)"""
    Q, s, T, N_, kn, w, dep, off = P['Q'], P['s'], P['T'], P['N'], P['kn'], P['w'], P['dep'], P['off']
    i = I
    side = np.where((px - Q[i, 0]) * N_[i, 0] + (pz - Q[i, 1]) * N_[i, 1] >= 0, 1.0, -1.0)
    # where each place lies along the line (not only which of its points is nearest): a fall's face is then a slope the
    # land's grid can hold, and it is cut back furthest in the bed's middle (there the place counts as further down)
    sc = s[i] + (px - Q[i, 0]) * T[i, 0] + (pz - Q[i, 1]) * T[i, 1]
    if len(P['falls']): sc = sc + P['near_fall'][i] * 1.1 * np.clip(1 - (D / w[i]) ** 2, 0, 1)
    lev = np.interp(sc, s, level)
    u = side * D - off[i]
    su = np.where(u >= 0, 1.0, -1.0)
    g = -kn[i] * su                                                     # + on the bend's outer side, - on its inner
    ws = np.maximum(w[i] - su * off[i], 0.3)
    q = np.abs(u) / ws
    shape = np.minimum(np.where(g > 0, 2.0 + 1.3 * g, 2.0 + 0.7 * g), np.maximum(1.25, 0.58 * ws / np.maximum(dep[i], 0.05)))
    bed = lev - dep[i] * (1 - np.clip(q, 0, 1) ** shape)
    steep = np.clip(np.where(su > 0, P['steep'][0][i], P['steep'][1][i]) + np.where(g > 0, 1.15 * g, 0.22 * g), 0.3, 1.9)
    if land_h is not None: steep = np.minimum(steep, 0.56 + 1.3 * sm(face_at, face_at + 0.8, land_h - lev))
    steep = steep * (1 - P['ford'][i]) + 0.3 * P['ford'][i]
    d = np.clip(np.abs(u) - ws, 0, None)
    C = np.where(q <= 1, bed, lev + steep * d + 0.025 * d * d)
    return C, q, (steep > 0.62) & (q > 1)


def channel(land, rng, Q, s, level, half, deep, falls=(), fords=(), reach=9.0, rise_over=None):
    """a whole bed over a land: profile and section together. rise_over: the land (smoothed) to say how high a bank stands
    over the bed. -> (the surface it cuts, everywhere: 1e6 where it does not reach; where it reaches; the bed's half width at
    each point of the line; how deep it lies under its riffles there; where a bank stands as a face)"""
    P = profile(rng, Q, s, half, deep, falls, fords)
    m, D, I = land.near_line(Q, reach)
    Cm, q, face_m = section(P, land.WX[m], land.WZ[m], D[m], I[m], np.asarray(level, float), None if rise_over is None else rise_over[m])
    C = np.full(land.WX.shape, 1e6); C[m] = Cm
    face = np.zeros(land.WX.shape, bool); face[m] = face_m
    return C, m, P['w'], P['dep'], face


# ------------------------------------------------------------------ the rain
def flow(Hf, out, cell, along=False):
    """the ground draining through each place (square metres), the hollows of Hf filled; out: where water leaves (a bed, a
    hole, the land's edge: True). along: also how steeply the water runs down from each place to the next on its way
    (rise over run, 0 where it crosses a filled hollow): how fast it runs, as the land round it does not say (water running
    along the foot of a cliff runs slowly, though the land beside it is steep)"""
    nz, nx = Hf.shape; h = Hf.ravel().tolist(); seen = out.ravel().copy(); par = np.full(nz * nx, -1, np.int64); order = []
    heap = [(h[k], k) for k in np.flatnonzero(seen)]; heapq.heapify(heap)
    NB = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    seen = seen.tolist()
    while heap:
        y, k = heapq.heappop(heap); order.append(k); j, i = divmod(k, nx)
        for dj, di in NB:
            jj, ii = j + dj, i + di
            if 0 <= jj < nz and 0 <= ii < nx:
                q = jj * nx + ii
                if not seen[q]: seen[q] = True; par[q] = k; heapq.heappush(heap, (max(h[q], y + 1e-4), q))
    acc = np.full(nz * nx, cell * cell)
    for k in reversed(order):
        if par[k] >= 0: acc[par[k]] += acc[k]
    if not along: return acc.reshape(nz, nx)
    k = np.flatnonzero(par >= 0); p = par[k]; hv = Hf.ravel()
    run = np.where((k % nx != p % nx) & (k // nx != p // nx), cell * math.sqrt(2), cell)
    slope = np.zeros(nz * nx); slope[k] = np.clip(hv[k] - hv[p], 0, None) / run
    return acc.reshape(nz, nx), slope.reshape(nz, nx)


def runnels(FLOW, fall, cell, where=1.0, deep=1.05, swale=0.11, start=40.0, full=700.0):
    """how deep the rain has worn the land: FLOW (from flow), fall (how steeply the land falls there, smoothed). Where more
    than `start` square metres drain through a place it is worn, to its full depth by `full`: a gully up to `deep` metres
    where it runs fast (fall 0.3 and up), no more than a swale `swale` metres deep where it runs slowly. where: 1 where water
    may run as a runnel (not in a bed: there it is the bed's). (The tool says where the land is not to be worn: multiply by it.)"""
    r = np.clip(np.log(np.maximum(FLOW, 1) / start) / math.log(full / start), 0, 1) * where
    return ndi.gaussian_filter(deep * r ** 1.2 * sm(0.05, 0.3, fall), 0.5 / cell) + ndi.gaussian_filter(swale * r, 1.04 / cell)


def ease(land, H, soft, limit=0.58, rounds=60):
    """within soft (True where it may be eased), whatever stands steeper than limit (rise over run) eased toward a slope of
    earth, a little at a time, until none does"""
    for _ in range(rounds):
        hot = soft & (land.slope(H) > limit)
        if not hot.any(): break
        hot = ndi.binary_dilation(hot, iterations=1) & soft
        H = np.where(hot, 0.45 * H + 0.55 * ndi.gaussian_filter(H, 0.36 / land.cell), H)
    return H
