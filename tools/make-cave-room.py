#!/usr/bin/env python3
# make-cave-room.py  —  ANY cave room baked from its description (the caves' kit, since 28 Nov 2026)
#
#   python3 tools/make-cave-room.py NAME        (pip install numpy scipy scikit-image pillow)
#
# reads   tools/cave-rooms/NAME.json            the room's description (below), and the pictures it names, beside it
# writes  assets/caves/NAME.bin + NAME.json     what the game reads: cave-room.js draws it, cave-level.js is her level in it
#
# As the hill village is written from one description (tools/make-hill-village-heightmap.py), so is a room: the user, of
# the caves' floors, pictures, water and surroundings, each room's own until then: "ตอนนี้ต้องวางระบบไว้ก่อน เหมือนที่เราวาง
# ระบบ heightmap hill village". A room is rock; its description takes air out of it, puts stone back, hangs lamps, and says
# where she begins. Nothing here knows any one room. (The three rooms made before the kit, tools/make-cave-hall.py,
# make-fang-hall.py, make-boss-hall.py, each with its own drawing code, are as they were: to be made anew on the kit.)
#
# THE DESCRIPTION (metres; x east, z south, y up; angles in degrees, 0 toward +x, turning toward +z):
#   "bounds": [x0, y0, z0, x1, y1, z1]   the block of rock the room is cut in        "cell": 0.4 (the grid)
#   "rough": 0.45, "seed": 7             how far natural rock wanders from its drawn lines (walls and roofs: never floors)
#   "air": [ ... ]                       taken out of the rock, in order:
#     { "hall":   { "at": [x, z], "r": [rx, rz], "turn": 0, "floor": y, "roof": y, "walls": h } }    a round or long hall under a dome
#     { "tunnel": { "path": [[x, y, z], ...], "wide": w, "high": h } }                     a passage along a line, its floor through the points
#     { "shaft":  { "at": [x, z], "r": r, "floor": y, "roof": y } }                        a round well
#     { "picture": { "plan": "NAME-plan.png", "at": [x, z], "size": [w, d], "floor": y | "file.png", "roof": y | "file.png",
#                    "low": y, "high": y } }                                               DRAWN BY HAND: the plan's white is air (its
#                                         left edge at x, its top at z, w by d metres); a floor or a roof that is a picture is
#                                         grey for height: black "low", white "high"
#   "stone": [ ... ]                     put back, in order ("built": true: laid stone, blocks and slabs; else natural rock):
#     { "way":    { "path": [[x, y, z], ...]  or  "helix": { "at": [x, z], "r": r, "from": [angle, y], "to": [angle, y] },
#                   "wide": w, "thick": t, "room": h, "built": true } }                    a way of stone: a slab t thick under the
#                                         line, the air over it cleared h high. Over air it is a bridge; a helix of more than a
#                                         turn is a stair winding over itself. Keep it wider than 2.4 m (her camera goes
#                                         through thinner rock) and its flights 3 m apart or more
#     { "pillar": { "at": [x, z], "r": r, "from": y, "to": y, "built": true } }
#     { "block":  { "box": [x0, y0, z0, x1, y1, z1], "built": true } }
#   "lights": [ { "lamp": { "at": [x, y, z], "colour": "blue" | "warm" | "teal" | [r, g, b], "reach": 8, "power": 1 } } ]
#   "ambient": [r, g, b]                 the dark's own light
#   "paint": [ { "earth": { "path": [[x, y, z], ...], "wide": w } }, { "sand": { ... } } ]   what lies on natural floors (moss comes
#                                         by itself where a lamp's light falls)
#   "pools": [ { "c": [x, z], "r": r, "level": y } ]      (handed on as they are: the water is the kit's next piece)
#   "spawn": { "x", "y", "z", "yaw" }, "places": [ { "name", "x", "y", "z", "heading" } ]
#
# WHAT IS BAKED (NAME.json's "bin" says where each lies in NAME.bin):
#   mesh     the rock, one mesh (marching cubes of the field): position, normal, the light baked on it (the lamps, with
#            their shadows; the dark's own light, less in corners), info (r: built stone; g: how open to the room)
#   floor    the floor map with SPANS (cave-level.js' header): every column's stretches of air a metre high or more, their
#            floors, roofs and paint (r earth, g sand, b moss, a 150: stone slabs underfoot), "layers" of them
#   volume   the light in the air, 1 m cells (cave-light.js: on her and on plants)

import json, math, os, sys
import numpy as np
from scipy import ndimage as ndi
from skimage import measure
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
NAME = sys.argv[1] if len(sys.argv) > 1 else 'test'
SRC = os.path.join(HERE, 'cave-rooms')
D = json.load(open(os.path.join(SRC, NAME + '.json'), encoding='utf-8'))

CELL = float(D.get('cell', 0.4))
X0, Y0, Z0, X1, Y1, Z1 = D['bounds']
NX, NY, NZ = (int(round((b - a) / CELL)) + 1 for a, b in ((X0, X1), (Y0, Y1), (Z0, Z1)))
GX = (X0 + np.arange(NX) * CELL).astype(np.float32)[:, None, None]
GY = (Y0 + np.arange(NY) * CELL).astype(np.float32)[None, :, None]
GZ = (Z0 + np.arange(NZ) * CELL).astype(np.float32)[None, None, :]
ROUGH = float(D.get('rough', 0.45))
SEED = int(D.get('seed', 7))
LIGHT_SCALE = 4.0
MIN_AIR = 1.0                 # m: a span lower than this is not baked
COLOURS = {'blue': [0.42, 0.74, 1.0], 'warm': [1.0, 0.78, 0.5], 'teal': [0.32, 0.95, 0.84], 'white': [0.85, 0.95, 1.0]}


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- noise: the same value for the same spot
def fbm(px, py, pz, seed, period, octaves=3):
    out, amp, tot = 0.0, 1.0, 0.0
    for o in range(octaves):
        lat = np.random.default_rng(seed + 101 * o).random((24, 24, 24)).astype(np.float32)
        c = np.stack(np.broadcast_arrays(px / period, py / period, pz / period)).astype(np.float32)
        out = out + amp * (ndi.map_coordinates(lat, c, order=1, mode='grid-wrap') - 0.5) * 2.0
        tot += amp; amp *= 0.5; period *= 0.5
    return (out / tot).astype(np.float32)


WOB = ROUGH * fbm(GX, GY, GZ, SEED, 3.2)             # a wall's wander (m)
WOB2 = ROUGH * 0.8 * fbm(GX, GY, GZ, SEED + 50, 2.6)  # a roof's


# ---------------------------------------------------------------- the pieces: each a distance, < 0 inside it
def seg_plan(a, b):
    # along a segment a -> b, seen from above: how far along (0..1) every column is, how far off, and the line's height there
    ax, ay, az = a; bx, by, bz = b
    dx, dz = bx - ax, bz - az
    t = np.clip(((GX - ax) * dx + (GZ - az) * dz) / max(dx * dx + dz * dz, 1e-6), 0, 1)
    d = np.hypot(GX - (ax + t * dx), GZ - (az + t * dz))
    return d, ay + t * (by - ay)


def helix_path(h):
    cx, cz = h['at']; r = h['r']; (a0, ya), (a1, yb) = h['from'], h['to']
    n = max(2, int(abs(a1 - a0) / 6) + 1)
    return [[cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / (n - 1))), ya + (yb - ya) * i / (n - 1),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / (n - 1)))] for i in range(n)]


def hall_sd(s):
    cx, cz = s['at']; rx, rz = s['r']; t = math.radians(s.get('turn', 0))
    dx, dz = GX - cx, GZ - cz
    u, v = dx * math.cos(t) + dz * math.sin(t), -dx * math.sin(t) + dz * math.cos(t)
    e = np.sqrt((u / rx) ** 2 + (v / rz) ** 2)
    fl, top = s['floor'], s['roof']; walls = s.get('walls', 0.4 * (top - fl))
    roof = fl + walls + (top - fl - walls) * np.sqrt(np.clip(1 - e * e, 0, 1))
    return np.maximum(np.maximum((e - 1) * min(rx, rz) + WOB, fl - GY), GY - roof + WOB2)


def tunnel_sd(s):
    out = None
    for a, b in zip(s['path'][:-1], s['path'][1:]):
        d, f = seg_plan(a, b)
        roof = f + s['high'] * (1 - 0.3 * np.clip(d / (s['wide'] / 2), 0, 1) ** 2)
        sd = np.maximum(np.maximum(d - s['wide'] / 2 + WOB * 0.6, f - GY), GY - roof + WOB2 * 0.5)
        out = sd if out is None else np.minimum(out, sd)
    return out


def shaft_sd(s):
    cx, cz = s['at']
    return np.maximum(np.maximum(np.hypot(GX - cx, GZ - cz) - s['r'] + WOB, s['floor'] - GY), GY - s['roof'] + WOB2)


def picture_on_grid(file, at, size):
    # a drawn picture laid on the room's columns (0..1; outside it: 0)
    im = np.asarray(Image.open(os.path.join(SRC, file)).convert('L'), np.float32) / 255.0
    u = (GX[:, 0, 0] - at[0]) / size[0] * im.shape[1] - 0.5
    v = (GZ[0, 0, :] - at[1]) / size[1] * im.shape[0] - 0.5
    uu, vv = np.meshgrid(u, v, indexing='ij')
    return ndi.map_coordinates(im, [vv, uu], order=1, mode='constant', cval=0.0)


def picture_sd(s):
    at, size = s['at'], s['size']
    plan = picture_on_grid(s['plan'], at, size) > 0.5
    lat = (ndi.distance_transform_edt(~plan) - ndi.distance_transform_edt(plan)).astype(np.float32) * CELL
    lo, hi = s.get('low', 0.0), s.get('high', 1.0)
    height = lambda v: (np.float32(v) if not isinstance(v, str) else lo + (hi - lo) * picture_on_grid(v, at, size))
    fl, roof = height(s['floor']), height(s['roof'])
    fl = fl[:, None, :] if isinstance(fl, np.ndarray) else fl
    roof = roof[:, None, :] if isinstance(roof, np.ndarray) else roof
    return np.maximum(np.maximum(lat[:, None, :] + WOB * 0.5, fl - GY), GY - roof + WOB2 * 0.5)


AIR = {'hall': hall_sd, 'tunnel': tunnel_sd, 'shaft': shaft_sd, 'picture': picture_sd}

# ---------------------------------------------------------------- the rock, everywhere (> 0 in rock), and where it is built
log(f'{NAME}: {NX} x {NY} x {NZ} cells of {CELL} m')
F = np.full((NX, NY, NZ), 50.0, np.float32)
for piece in D['air']:
    (kind, s), = piece.items()
    F = np.minimum(F, AIR[kind](s))
BUILT = np.zeros((NX, NY, NZ), np.float32)
for piece in D.get('stone', []):
    (kind, s), = piece.items()
    if kind == 'way':
        path = s['path'] if 'path' in s else helix_path(s['helix'])
        head = slab = None
        for a, b in zip(path[:-1], path[1:]):
            d, f = seg_plan(a, b)
            h = np.maximum(np.maximum(d - (s['wide'] / 2 + 0.15), f - GY), GY - (f + s.get('room', 3.2)))
            sl = np.maximum(np.maximum(d - s['wide'] / 2, GY - f), (f - s.get('thick', 0.8)) - GY)
            head = h if head is None else np.minimum(head, h)
            slab = sl if slab is None else np.minimum(slab, sl)
        F = np.minimum(F, head)                      # the air over the way
        sd = slab
    elif kind == 'pillar':
        cx, cz = s['at']
        sd = np.maximum(np.maximum(np.hypot(GX - cx, GZ - cz) - s['r'], s['from'] - GY), GY - s['to'])
        sd = np.broadcast_to(sd, F.shape)
    elif kind == 'block':
        bx0, by0, bz0, bx1, by1, bz1 = s['box']
        sd = np.maximum(np.maximum(np.abs(GX - (bx0 + bx1) / 2) - (bx1 - bx0) / 2, np.abs(GY - (by0 + by1) / 2) - (by1 - by0) / 2), np.abs(GZ - (bz0 + bz1) / 2) - (bz1 - bz0) / 2)
    else:
        raise SystemExit(f'no such stone: {kind}')
    F = np.maximum(F, -sd)                           # the stone itself
    if s.get('built'):
        BUILT = np.maximum(BUILT, np.clip(1 - sd / 0.5, 0, 1))
# the block's own faces are rock: the mesh is closed
for ax in range(3):
    for side in (0, -1):
        sl = [slice(None)] * 3; sl[ax] = side
        F[tuple(sl)] = np.maximum(F[tuple(sl)], 0.5)

ORG = np.array([X0, Y0, Z0], np.float32)


def at_field(A, P, order=1):
    # a grid's value at points (n, 3)
    return ndi.map_coordinates(A, ((P - ORG) / CELL).T, order=order, mode='nearest')


# ---------------------------------------------------------------- the light: the dark's own, and the lamps (with shadows)
AMBIENT = np.array(D.get('ambient', [0.085, 0.11, 0.15]), np.float32)
LAMPS = []
for piece in D.get('lights', []):
    (kind, s), = piece.items()
    if kind != 'lamp':
        raise SystemExit(f'no such light: {kind}')
    col = s.get('colour', 'blue')
    LAMPS.append({'at': [float(v) for v in s['at']], 'colour': COLOURS[col] if isinstance(col, str) else col, 'reach': float(s.get('reach', 8)), 'power': float(s.get('power', 1))})


def lamp_light(P, Nn=None):
    # the lamps' light at points: on a face (Nn: its normals) or in the air; each lamp's shadow walked through the rock
    out = np.zeros((len(P), 3), np.float32)
    for lamp in LAMPS:
        L = np.array(lamp['at'], np.float32) - P
        dist = np.linalg.norm(L, axis=1) + 1e-6
        k = dist / (lamp['reach'] * 2.0)
        s = np.clip(1 - np.clip(k, 0, 1) ** 2 * (3 - 2 * np.clip(k, 0, 1)), 0, 1) / (1 + 9 * k * k) * lamp['power']
        lit = s > 0.004
        if not lit.any():
            continue
        Pl, Ld, dl = P[lit], (L[lit] / dist[lit, None]), dist[lit]
        sh = np.ones(len(Pl), np.float32)
        start = Pl + (Nn[lit] * 0.3 if Nn is not None else 0)
        for i in range(1, 33):                       # 32 steps from the point to the lamp: how near the rock comes to the line
            t = dl * (i / 33.0)
            sh = np.minimum(sh, np.clip(0.35 + 6.0 * (-at_field(F, start + Ld * t[:, None])) / np.maximum(t, 0.4), 0, 1))
        face = np.clip((Nn[lit] * Ld).sum(1) * 0.8 + 0.2, 0, 1) if Nn is not None else 1.0
        out[lit] += np.array(lamp['colour'], np.float32)[None, :] * (s[lit] * sh * face)[:, None]
    return out


# ---------------------------------------------------------------- the mesh
verts, faces, normals, _ = measure.marching_cubes(F, 0.0, spacing=(CELL, CELL, CELL))
verts = (verts + ORG).astype(np.float32)
# (faces wound so they face the air: against the field's rise)
fn = np.cross(verts[faces[:, 1]] - verts[faces[:, 0]], verts[faces[:, 2]] - verts[faces[:, 0]])
if (fn * normals[faces[:, 0]]).sum() < 0:
    faces = faces[:, ::-1]
normals = normals.astype(np.float32)
normals /= np.linalg.norm(normals, axis=1, keepdims=True) + 1e-9
open_to = np.ones(len(verts), np.float32)            # how open to the room a point is (corners and cracks: less)
for d, w in ((0.5, 0.5), (1.1, 0.3), (2.2, 0.2)):
    open_to -= w * np.clip((d + at_field(F, verts + normals * d)) / d, 0, 1)
open_to = np.clip(open_to, 0.15, 1)
light = AMBIENT[None, :] * (0.35 + 0.65 * open_to)[:, None] + lamp_light(verts, normals) * (0.5 + 0.5 * open_to)[:, None]
built = np.clip(at_field(BUILT, verts - normals * 0.1), 0, 1)
log(f'mesh: {len(verts)} points, {len(faces)} triangles; light up to {light.max():.2f}')

# ---------------------------------------------------------------- the floor map: every column's spans
Yn = Y0 + np.arange(NY) * CELL
cols = []
K = 1
for i in range(NX):
    for j in range(NZ):
        v = F[i, :, j]; air = v < 0; spans = []
        l = 1
        while l < NY - 1:
            if air[l] and not air[l - 1]:
                m = l
                while m + 1 < NY and air[m + 1]:
                    m += 1
                fl = Yn[l - 1] + CELL * v[l - 1] / (v[l - 1] - v[l])
                ce = Yn[m] + CELL * (-v[m]) / (v[m + 1] - v[m]) if m + 1 < NY else Yn[m]
                if ce - fl >= MIN_AIR:
                    spans.append((fl, ce))
                l = m + 1
            else:
                l += 1
        cols.append(spans); K = max(K, len(spans))
N2 = NX * NZ
fl_map = np.full(K * N2, -32768, np.int16); ce_map = np.full(K * N2, -32768, np.int16)
pts, where = [], []
for k, spans in enumerate(cols):
    for s, (fl, ce) in enumerate(spans):
        fl_map[s * N2 + k] = int(round(fl * 100)); ce_map[s * N2 + k] = int(round(ce * 100))
        pts.append([X0 + (k // NZ) * CELL, fl, Z0 + (k % NZ) * CELL]); where.append(s * N2 + k)
pts = np.array(pts, np.float32); where = np.array(where)
paint = np.zeros((K * N2, 4), np.uint8)
if len(pts):
    slab = at_field(BUILT, pts - np.array([0, 0.15, 0], np.float32)) > 0.5
    lum = (lamp_light(pts + np.array([0, 0.3, 0], np.float32)) * np.array([0.3, 0.59, 0.11], np.float32)).sum(1)
    rag = fbm(pts[:, 0], pts[:, 1] * 0, pts[:, 2], SEED + 9, 1.7, 2)
    earth = np.zeros(len(pts), np.float32); sand = np.zeros(len(pts), np.float32)
    for piece in D.get('paint', []):
        (kind, s), = piece.items()
        best = np.full(len(pts), 1e9, np.float32)
        for a, b in zip(s['path'][:-1], s['path'][1:]):
            ab = np.array([b[0] - a[0], b[2] - a[2]], np.float32)
            t = np.clip(((pts[:, 0] - a[0]) * ab[0] + (pts[:, 2] - a[2]) * ab[1]) / max(float(ab @ ab), 1e-6), 0, 1)
            d = np.hypot(pts[:, 0] - (a[0] + t * ab[0]), pts[:, 2] - (a[2] + t * ab[1]))
            d = np.where(np.abs(pts[:, 1] - (a[1] + t * (b[1] - a[1]))) < 1.5, d, 1e9)      # (on that way's own floor)
            best = np.minimum(best, d)
        amount = np.clip(1.15 - (best + rag * 0.5) / (s['wide'] / 2), 0, 1)
        if kind == 'earth': earth = np.maximum(earth, amount)
        elif kind == 'sand': sand = np.maximum(sand, amount)
        else: raise SystemExit(f'no such paint: {kind}')
    moss = np.clip((lum - 0.16) * 3.2 + rag * 0.25, 0, 1) * (1 - earth) * (1 - sand)
    paint[where, 0] = np.where(slab, 0, earth * 255)
    paint[where, 1] = np.where(slab, 0, sand * 255)
    paint[where, 2] = np.where(slab, 0, moss * 255)
    paint[where, 3] = np.where(slab, 150, 0)
log(f'floor: {NX} x {NZ} columns, up to {K} spans a column ({len(pts)} spans)')

# ---------------------------------------------------------------- the light in the air: 1 m cells
VC = 1.0
VNX, VNY, VNZ = (int(math.ceil((b - a) / VC)) + 1 for a, b in ((X0, X1), (Y0, Y1), (Z0, Z1)))
vx, vy, vz = np.meshgrid(X0 + np.arange(VNX) * VC, Y0 + np.arange(VNY) * VC, Z0 + np.arange(VNZ) * VC, indexing='ij')
VP = np.stack([vx, vy, vz], -1).reshape(-1, 3).astype(np.float32)
vol = AMBIENT[None, :] * 0.9 + lamp_light(VP)
vol8 = np.zeros((VNX, VNY, VNZ, 4), np.uint8)
vol8[..., :3] = np.clip(vol / LIGHT_SCALE * 255, 0, 255).reshape(VNX, VNY, VNZ, 3)
vol8[..., 3] = 255
vol8 = np.ascontiguousarray(vol8.transpose(2, 1, 0, 3))      # (as a 3D picture is laid out: z, then y, then x)

# ---------------------------------------------------------------- write
blob = bytearray()


def put(arr):
    while len(blob) % 4:
        blob.append(0)
    at = len(blob); blob.extend(np.ascontiguousarray(arr).tobytes()); return at


nrm8 = np.zeros((len(verts), 4), np.int8); nrm8[:, :3] = np.clip(np.round(normals * 127), -127, 127)
light8 = np.zeros((len(verts), 4), np.uint8); light8[:, :3] = np.clip(light / LIGHT_SCALE * 255, 0, 255); light8[:, 3] = 255
info8 = np.zeros((len(verts), 4), np.uint8); info8[:, 0] = built * 255; info8[:, 1] = open_to * 255
mesh = {'vertices': int(len(verts)), 'indices': int(faces.size), 'pos': put(verts), 'nrm': put(nrm8), 'light': put(light8), 'info': put(info8),
        'idx': put(faces.astype(np.uint32).reshape(-1))}
floor = {'nx': NX, 'nz': NZ, 'x0': X0, 'z0': Z0, 'cell': CELL, 'layers': K, 'floor': put(fl_map), 'ceil': put(ce_map), 'paint': put(paint)}
volume = {'nx': VNX, 'ny': VNY, 'nz': VNZ, 'x0': X0, 'y0': Y0, 'z0': Z0, 'cell': VC, 'data': put(vol8)}


def stand(p):
    return {**{k: v for k, v in p.items() if k not in ('y',)}, 'y': p['y']}


out = {
    'kit': 1, 'name': NAME, 'about': D.get('about', '') + ' (made by tools/make-cave-room.py from tools/cave-rooms/' + NAME + '.json; read by cave-room.js)',
    'bin': {'mesh': mesh, 'floor': floor, 'volume': volume, 'lightScale': LIGHT_SCALE},
    'bounds': [X0, Y0, Z0, X1, Y1, Z1], 'ambient': [float(v) for v in AMBIENT], 'lamps': LAMPS, 'pools': D.get('pools', []),
    'look': D.get('look', {}),
    'spawn': stand(D['spawn']), 'places': [stand(p) for p in D.get('places', [])],
}
os.makedirs(os.path.join(ROOT, 'assets', 'caves'), exist_ok=True)
open(os.path.join(ROOT, 'assets', 'caves', NAME + '.bin'), 'wb').write(blob)
json.dump(out, open(os.path.join(ROOT, 'assets', 'caves', NAME + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
log(f'wrote assets/caves/{NAME}.bin ({len(blob) / 1e6:.2f} MB) + .json')
