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
# ONE UNDERGROUND. Every room is described in the same frame (the game's own: metres, x east, z south, y up), so rooms lie
# beside and under one another as they are written, and the land's roll is the underground's, not a room's (WORLD_SEED:
# the same ground on both sides of a way between two rooms). Where a room is to meet the next it names a MOUTH: there
# its floor is level and its walls are as drawn, to the centimetre, so the next room, baked by itself, fits.
#
# THE DESCRIPTION (metres; x east, z south, y up; angles in degrees, 0 toward +x, turning toward +z):
#   "title": "..."                       its name, as the page shows it
#   "bounds": [x0, y0, z0, x1, y1, z1]   the block of rock the room is cut in        "cell": 0.4 (the grid)
#   "rough": 0.45, "seed": 7             how far natural rock wanders from its drawn lines (walls and roofs)
#   "land": "rolling"                    THE LAND BY RULE: how every natural floor of the room lies. A word from LANDS (below:
#                                         "flat", "rolling": the caves' own, "rough"), or { "kind": "rolling", "relief": 0.2 }
#                                         to change one figure: relief (m: how far the floor rolls up and down), skirt (m: how
#                                         far it rises into the walls' feet), skirt_wide (m: from how far out). Any air piece
#                                         may carry its own "land". Held level along ways of stone and at mouths, flatter
#                                         along painted ways
#   "ground": "cave"                     THE GROUND BY RULE: what lies on every natural floor of the room, said by a word from
#                                         RULES (below: "bare": nothing; "cave": the caves' own: moss where a lamp's light
#                                         falls and on a water's banks, gravel at the feet of faces and on scree; "grove":
#                                         a cave where things grow: turf in the light, moss round it, fallen leaves in the
#                                         dim; "ruins": old paving, broken, leaves blown to the walls' feet, moss). Any air
#                                         piece may carry its own "ground" (a chamber that is a grove in a room of bare caves)
#   "grass": "green"                     THE GRASS: it grows by itself from the ground that grows it (GROUNDS' "grows": turf,
#                                         thick; so paint turf where grass is wanted, and a way of earth through it is a way
#                                         through the grass), never in water, on steep ground or on laid stone. The word is its
#                                         kind, from cave-grass.js' GRASSES ("green", "pale", "glow"); "none": no grass in this
#                                         room; or { "kind": "green", "thick": 1.0, "tall": 1.0 } to change how thick it stands
#                                         and how tall
#   "mouths": [ { "name": "...", "at": [x, y, z], "toward": angle, "wide": w, "high": h } ]   where the next room joins
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
#                   "wide": w, "thick": t, "room": h, "built": true, "steps": 0.16 } }     a way of stone: a slab t thick under the
#                                         line, the air over it cleared h high. Over air it is a bridge; a helix of more than a
#                                         turn is a stair winding over itself. Keep it wider than 2.4 m (her camera goes
#                                         through thinner rock) and its flights 3 m apart or more. "steps": where the line
#                                         slopes, real steps of that rise are laid on it (level where it is level: a landing);
#                                         she walks the slope under them (her feet within half a rise of a step's top)
#     { "pillar": { "at": [x, z], "r": r, "from": y, "to": y, "built": true } }
#     { "block":  { "box": [x0, y0, z0, x1, y1, z1], "built": true } }
#   "terrain": [ ... ]                   THE LAND BY HAND: pieces laid, in order, on a storey's ground as it is by then (after
#                                         the air, before the stone: a way cuts through them). "floor": the height of the
#                                         storey each lies on (the piece finds the real ground near it, rolls and all):
#     { "mound":   { "at": [x, z], "r": r | [rx, rz], "high": h, "floor": y } }            a rise she walks over
#     { "hollow":  { "at": [x, z], "r": r | [rx, rz], "deep": d, "floor": y } }            a dip (a pool's bed, later)
#     { "slope":   { "path": [[x, y, z], ...], "wide": w, "fall": 1.3, "floor": y } }      a ramp of rock up along a line, its
#                                         sides falling away as scree (fall: how steeply)
#     { "ledge":   { "outline": [[x, z], ...] | "plan": "file.png" + "at" + "size", "floor": y, "top": y, "broken": 0.5,
#                    "lean": 0.12 } }     a shelf of rock with a face she climbs, its edge broken (m), its face leaning back
#                                         (m a metre of height); one on another: tiers. Keep a pillar or a boulder 1.5 m or
#                                         more from an edge she is to climb or step off (a face that near rock is a wall to her)
#     { "boulder": { "at": [x, z], "r": r | [rx, ry, rz], "floor": y, "sunk": 0.3, "lumpy": 0.35 } }   a great stone, part in the ground
#     { "heights": { "picture": "file.png", "at": [x, z], "size": [w, d], "floor": y, "low": 0, "high": h } }
#                                         DRAWN BY HAND: a grey picture laid on the ground, black "low", white "high" (m over
#                                         the ground as it is; under 0 it digs)
#   "water": "clear"                     THE WATER'S KIND: a word from cave-water.js' WATERS ("clear", "dark", "glow")
#   "waterways": [ ... ]                 THE WATER, laid where the land can hold it (their beds are dug after the terrain and
#                                         before the stone; the water itself is laid once all the rock is as it will be):
#     { "pool":   { "at": [x, z], "level": y } }                                           still water at a height: it fills
#                                         the ground lower than its level round the spot, as far as the land holds it (so it
#                                         takes a hollow's own shape). The tool stops if the spot is dry or the water would
#                                         run off an edge
#     { "stream": { "path": [[x, y, z], ...], "wide": w, "deep": 0.25, "bank": 0.7 } }     running water along a line, y its
#                                         surface: a bed is dug under it (deep in its middle, level with the water at its
#                                         sides, banks eased into the ground over `bank`), it flows down the line, faster
#                                         where steeper. A stretch falling steeper than 1 in 1 is a FALL: water through the
#                                         air from the stretch's first point (the lip) to its last (the foot, which must be
#                                         on water). End a stream in a pool at the pool's own level and the two are one
#                                         water. A stream ending at a mouth is handed on with it (the next room's begins there)
#                                         Under 1.05 m she wades, over it she swims. A way of stone across a stream dams it
#                                         unless it is a bridge (its underside over the water); a painted way fords it
#   "lights": [ { "lamp": { "at": [x, y, z], "colour": "blue" | "warm" | "teal" | "white" | [r, g, b], "reach": 8, "power": 1 } } ]
#   "ambient": [r, g, b]                 the dark's own light
#   "look": { "built": [r, g, b], "fog": "#0a1420", ... }      the room's own colours (cave-ground.js, GROUND_LOOK: any of them)
#   "paint": [ ... ]                     THE GROUND BY HAND: a kind from GROUNDS (below: "gravel", "paving", "leaves", "moss",
#                                         "turf", "earth", "sand"; or "stone": nothing, the bare floor) laid, in order, over
#                                         what the rule gave. Each says where in one of four ways:
#     { "earth":  { "path": [[x, y, z], ...], "wide": w } }                                along a line (a trodden way: the land
#                                         is flatter along it too)
#     { "turf":   { "at": [x, z], "r": r | [rx, rz], "floor": y } }                        a round or long patch
#     { "leaves": { "outline": [[x, z], ...], "floor": y } }                               inside a drawn outline
#     { "moss":   { "picture": "file.png", "at": [x, z], "size": [w, d], "floor": y } }    DRAWN BY HAND: a grey picture laid on
#                                         the floor (its left edge at x, its top at z), white: all of it, black: none
#                                         "floor": the height of the storey it lies on (it takes the ground within 1.5 m of
#                                         that; "reach" to change). A water's bed and shore stay the water's own
#   "spawn": { "x", "y", "z", "yaw" }, "places": [ { "name", "x", "y", "z", "heading" } ]
#
# WHAT IS BAKED (NAME.json's "bin" says where each lies in NAME.bin):
#   mesh     the rock, one mesh (marching cubes of the field, then the steps' faces): position, normal, the light baked on
#            it (rgb: the lamps, with their shadows, and the dark's own light, less in corners; a: a step's own tone, 128 none),
#            info (r: built stone; g: how open to the room; b: on a step, from its back, 0, to its edge, 255; a: 255 a step)
#   floor    the floor map with SPANS (cave-level.js' header): every column's stretches of air a metre high or more, their
#            floors and roofs, "layers" of them; and, in a room with water, the water's surface over each span ("water":
#            cm; -32768: none): what she wades and swims in. What lies on each span: "kinds" lists the kinds of ground
#            this room has (name, picture, tile: metres a repeat, tint, ragged, and "at": which byte holds how much of
#            it lies there: 0..2 "paint"'s r, g, b; 3..6 "paint2"'s r, g, b, a, written only when a room has more than
#            three kinds); "paint"'s a is 150 on laid stone; "step" (a byte a span, into "steps") is what is underfoot
#            there, for her steps
#   water    the water as one mesh (cave-water.js draws it): its surface (every water that meets at one height is one
#            sheet, cut to its shore per pixel by its depth), then the falls, then the foam at their feet ("parts"):
#            position, info (depth under it in m, under 0 past the shore; the flow's x and z in m/s), uv (a fall: across,
#            metres fallen; a foot: angle, how far out), the light baked on it
#   grass    the grass as tufts (cave-grass.js draws them): each one's foot on the rock (root), its own dice (rnd: turn,
#            how tall / 2, phase, tint), the ground's colour under it and how the ground slopes there in x (col), the
#            light baked on it and the slope in z (light)
#   volume   the light in the air, 1 m cells (cave-light.js: on her and on plants)
# and NAME.json says the room's "land", its "water" and its "mouths" (each with the "stream" that ends in it, if one does),
# and its "falls" (lip, foot, width: for what is heard and thrown up there, later).
#
# TO ADD TO THE LAND: a new word for a room's land is a line in LANDS; a new piece is a function in TERRAIN (it reads the
# ground with ground_at and lays or takes rock with put_rock / take_rock), a line in this header, and what it promises in
# tools/check-cave-level.mjs (PIECES). TO ADD TO THE WATER: a new kind of water is a line in cave-water.js' WATERS; a new
# waterway is a function in BEDS (if it digs) and in WATERWAYS (it lays its surface with lay), and its promise in PIECES.
# TO ADD TO THE GROUND: a new kind is a line in GROUNDS and its picture in assets/ground/ (painted by tools/make-path-paint.py
# or tools/make-forest-paint.py: a new look there); a new word for a room's ground is a function in RULES (it reads a
# span's FACTS: the light on it, its tilt, how near a face's foot, how near water). cave-ground.js draws whatever kinds a
# room has: nothing to add there. TO ADD TO WHAT GROWS: a ground that grows grass says so in GROUNDS ("grows": how thick);
# a new look of grass is a line in cave-grass.js' GRASSES; anything else scattered over the floors by rule (ferns, stones,
# mushrooms: the kit's next pieces) is laid with scatter(), as the grass is.

import json, math, os, sys
import numpy as np
from scipy import ndimage as ndi
from skimage import measure
from PIL import Image, ImageDraw

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
# the mouths: where the next room joins. Round each the rock is as drawn (no wander), so two rooms baked apart meet
MOUTHS = D.get('mouths', [])
for m in MOUTHS:
    mx, my, mz = m['at']; w, h = m.get('wide', 3.2), m.get('high', 3.2)
    t = np.clip((np.sqrt((GX - mx) ** 2 + (GY - (my + h / 2)) ** 2 + (GZ - mz) ** 2) - max(w, h) / 2 - 0.4) / 2.2, 0, 1)
    t = (t * t * (3 - 2 * t)).astype(np.float32)
    WOB *= t; WOB2 *= t
# the underground's own land: its roll at every column, the same whichever room is baked (two rooms meet on one ground)
WORLD_SEED = 1128
X2, Z2 = GX[:, 0, :], GZ[:, 0, :]                                             # the columns, seen from above: (NX, 1), (1, NZ)
RELN = np.clip(1.6 * fbm(GX, GY[:, :1, :] * 0, GZ, WORLD_SEED, 6.0), -1, 1)   # the roll, -1..1: (NX, 1, NZ)
EDGE = np.clip(1.7 * fbm(GX, GY[:, :1, :] * 0, GZ, WORLD_SEED + 7, 2.6), -1, 1)[:, 0, :]      # how a ledge's edge breaks: (NX, NZ)
LANDS = {                     # a room's land by a word (add one here and every room may ask for it)
    'flat':    {'relief': 0.0,  'skirt': 0.0,  'skirt_wide': 1.0},
    'rolling': {'relief': 0.14, 'skirt': 0.45, 'skirt_wide': 2.4},           # the caves' own: floors that roll a little and rise into the walls' feet
    'rough':   {'relief': 0.30, 'skirt': 0.80, 'skirt_wide': 3.0},
}
GROUNDS = {                   # what may lie on a natural floor, in the order it is laid (a later one lies over an earlier). Add one
    # here, with its picture, and every room may ask for it. picture: in assets/ground/; tile: metres a repeat; tint: its
    # colour under the cave's light (a word: the room's look of that name); grey: the picture is read for its light and
    # dark only (divided by this, its mean); ragged: how far its edge follows the stone under it; step: what her steps
    # sound like on it (step-sounds.js' grounds); grows: how thick grass stands on it (0..1; left out: none)
    'gravel': dict(picture='cave-gravel-paint.webp', tile=2.4,  tint=[1.0, 1.02, 1.1],     ragged=0.3,  step='earth'),
    'paving': dict(picture='boss-slabs-paint.webp',  tile=2.38, tint='built', grey=0.187,  ragged=0.12, step='stone'),
    'leaves': dict(picture='forest-damp-paint.webp', tile=3.6,  tint=[1.0, 1.0, 1.0],      ragged=0.35, step='grass'),
    'moss':   dict(picture='cave-moss-paint.webp',   tile=3.6,  tint=[1.0, 1.0, 1.0],      ragged=0.35, step='grass'),
    'turf':   dict(picture='cave-turf-paint.webp',   tile=3.6,  tint=[0.86, 0.9, 0.86],    ragged=0.35, step='grass', grows=1.0),
    'earth':  dict(picture='path-dirt.webp',         tile=2.6,  tint=[0.66, 0.68, 0.76],   ragged=0.3,  step='earth'),
    'sand':   dict(picture='path-sand.webp',         tile=2.3,  tint=[0.6, 0.63, 0.7],     ragged=0.2,  step='sand'),
}
BIG = 1e3


# ---------------------------------------------------------------- the pieces: each a distance, < 0 inside it
def way_parts(path, X, Z, round_ends=True):
    # a line's stretches, seen from above, at spots (X, Z): for each stretch (a, b, d, f, own): how far off the spot is, the
    # line's height there, and whether the spot is that stretch's own (no nearer the stretch before or after: so where a
    # level stretch meets a slope neither lies over the other, and a line may wind over itself). round_ends: the line's two
    # ends reach half its width on (a tunnel's); without it they are cut square (a way of stone's)
    segs = []
    for a, b in zip(path[:-1], path[1:]):
        dx, dz = b[0] - a[0], b[2] - a[2]
        raw = ((X - a[0]) * dx + (Z - a[2]) * dz) / max(dx * dx + dz * dz, 1e-6)
        t = np.clip(raw, 0, 1)
        segs.append((a, b, np.hypot(X - (a[0] + t * dx), Z - (a[2] + t * dz)), a[1] + t * (b[1] - a[1]), raw))
    out = []
    for i, (a, b, d, f, raw) in enumerate(segs):
        own = np.ones(np.shape(d), bool)
        if i > 0:
            own &= d <= segs[i - 1][2] + 1e-4
        elif not round_ends:
            own &= raw >= 0
        if i + 1 < len(segs):
            own &= d <= segs[i + 1][2] + 1e-4
        elif not round_ends:
            own &= raw <= 1
        out.append((a, b, d, f, own))
    return out


def sloped(a, b):
    return abs(b[1] - a[1]) > 0.04 * math.hypot(b[0] - a[0], b[2] - a[2])


def helix_path(h):
    cx, cz = h['at']; r = h['r']; (a0, ya), (a1, yb) = h['from'], h['to']
    n = max(2, int(abs(a1 - a0) / 6) + 1)
    return [[cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / (n - 1))), ya + (yb - ya) * i / (n - 1),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / (n - 1)))] for i in range(n)]


# ---------------------------------------------------------------- the land by rule: every natural floor's own lie
def held(path, wide, soft=1.6, round_ends=True):
    # 0 on a line's own floor (within half its width, at about its height), 1 away from it: the land is held level there
    out = np.ones((NX, NY, NZ), np.float32)
    for a, b, d, f, own in way_parts(path, GX, GZ, round_ends):
        t = np.clip((np.where(own, d, BIG) - wide / 2 - 0.2) / soft, 0, 1)
        v = np.clip((np.abs(GY - f) - 1.5) / 1.5, 0, 1)                   # (only the storey it is on)
        out = np.minimum(out, np.maximum(t * t * (3 - 2 * t), v))
    return out


EASE = np.ones((NX, NY, NZ), np.float32)
for piece in D.get('stone', []):
    (kind, s), = piece.items()
    if kind == 'way':
        EASE = np.minimum(EASE, held(s['path'] if 'path' in s else helix_path(s['helix']), s['wide'], round_ends=False))
for piece in D.get('paint', []):
    (kind, s), = piece.items()
    if 'path' in s:
        EASE = np.minimum(EASE, 0.35 + 0.65 * held(s['path'], s['wide']))  # (a trodden way: flatter, not flat)
for m in MOUTHS:
    t = np.clip((np.hypot(GX - m['at'][0], GZ - m['at'][2]) - m.get('wide', 3.2) / 2) / 2.5, 0, 1)
    EASE = np.minimum(EASE, np.maximum(t * t * (3 - 2 * t), np.clip((np.abs(GY - m['at'][1]) - 1.5) / 1.5, 0, 1)))


def land_of(s):
    v = s.get('land', D.get('land', 'rolling'))
    v = {'kind': v} if isinstance(v, str) else dict(v)
    kind = v.pop('kind', 'rolling')
    if kind not in LANDS:
        raise SystemExit(f'no such land: {kind} (LANDS has: {", ".join(LANDS)})')
    return {**LANDS[kind], **v}


def ground(s, inside, wide=None):
    # how far over its drawn floor a piece's ground lies: the land's roll, and its rise toward the walls (inside: how far
    # from them a column is), held level where the land is held
    L = land_of(s)
    w = L['skirt_wide'] if wide is None else min(L['skirt_wide'], wide)
    return (L['relief'] * RELN + L['skirt'] * np.clip(1 - inside / max(w, 1e-3), 0, 1) ** 2) * EASE


def hall_sd(s):
    cx, cz = s['at']; rx, rz = s['r']; t = math.radians(s.get('turn', 0))
    dx, dz = GX - cx, GZ - cz
    u, v = dx * math.cos(t) + dz * math.sin(t), -dx * math.sin(t) + dz * math.cos(t)
    e = np.sqrt((u / rx) ** 2 + (v / rz) ** 2)
    fl, top = s['floor'], s['roof']; walls = s.get('walls', 0.4 * (top - fl))
    roof = fl + walls + (top - fl - walls) * np.sqrt(np.clip(1 - e * e, 0, 1))
    return np.maximum(np.maximum((e - 1) * min(rx, rz) + WOB, fl + ground(s, (1 - e) * min(rx, rz)) - GY), GY - roof + WOB2)


def tunnel_sd(s):
    out = None
    for a, b, d, f, own in way_parts(s['path'], GX, GZ):
        d = np.where(own, d, 1e3)
        roof = f + s['high'] * (1 - 0.3 * np.clip(d / (s['wide'] / 2), 0, 1) ** 2)
        sd = np.maximum(np.maximum(d - s['wide'] / 2 + WOB * 0.6, f + ground(s, s['wide'] / 2 - d, s['wide'] * 0.3) - GY), GY - roof + WOB2 * 0.5)
        out = sd if out is None else np.minimum(out, sd)
    return out


def shaft_sd(s):
    cx, cz = s['at']; d = np.hypot(GX - cx, GZ - cz)
    return np.maximum(np.maximum(d - s['r'] + WOB, s['floor'] + ground(s, s['r'] - d) - GY), GY - s['roof'] + WOB2)


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
    fl = fl[:, None, :] if isinstance(fl, np.ndarray) and fl.ndim == 2 else fl + ground(s, -lat[:, None, :])       # (a drawn floor lies as drawn)
    roof = roof[:, None, :] if isinstance(roof, np.ndarray) and roof.ndim == 2 else roof
    return np.maximum(np.maximum(lat[:, None, :] + WOB * 0.5, fl - GY), GY - roof + WOB2 * 0.5)


AIR = {'hall': hall_sd, 'tunnel': tunnel_sd, 'shaft': shaft_sd, 'picture': picture_sd}

# ---------------------------------------------------------------- the rock, everywhere (> 0 in rock), and where it is built
log(f'{NAME}: {NX} x {NY} x {NZ} cells of {CELL} m')
F = np.full((NX, NY, NZ), 50.0, np.float32)
OWNER = np.full((NX, NY, NZ), -1, np.int16)          # which air piece a cell is deepest in (-1: none's): a piece's own "ground" goes by it
for n, piece in enumerate(D['air']):
    (kind, s), = piece.items()
    sd = AIR[kind](s)
    OWNER[sd < np.minimum(F, 0)] = n
    F = np.minimum(F, sd)


# ---------------------------------------------------------------- the land by hand: pieces laid on a storey's ground as it is
def ground_at(floor, down=1.2, up=1.2):
    # the ground of the storey drawn at `floor`: at every column the height where rock meets the air over it (the highest
    # within reach of the drawn floor; nan: none there)
    lo = max(0, int(math.floor((floor - down - Y0) / CELL))); hi = min(NY - 2, int(math.ceil((floor + up - Y0) / CELL)))
    G = np.full((NX, NZ), np.nan, np.float32)
    for l in range(lo, hi + 1):
        a, b = F[:, l, :], F[:, l + 1, :]
        G = np.where((a > 0) & (b <= 0), Y0 + (l + a / np.maximum(a - b, 1e-6)) * CELL, G)
    return G


def put_rock(h, floor, side=None, under=2.0):
    # rock laid up to the heights h (over the columns; -BIG: none) on the storey at `floor`, and `under` below it (so it
    # stands on what is there); side: how far inside the piece's own edge every point is (m), for a piece with a face
    global F
    body = np.minimum(h[:, None, :] - GY, GY - (floor - under))
    F = np.maximum(F, body if side is None else np.minimum(body, side))


def take_rock(h, floor, where):
    # the ground dug down to the heights h where `where` (the storey's own ground only)
    global F
    F = np.minimum(F, np.where(where[:, None, :] & (GY < floor + 1.0), h[:, None, :] - GY, BIG))


def bell(s):
    # a round or long patch seen from above: 1 at its middle, 0 at its rim, level at both
    cx, cz = s['at']; r = s['r']; rx, rz = r if isinstance(r, list) else (r, r)
    e = np.hypot((X2 - cx) / rx, (Z2 - cz) / rz)
    return np.cos(np.clip(e, 0, 1) * math.pi) * 0.5 + 0.5, e < 1


def mound(s):
    G = ground_at(s['floor']); b, on = bell(s); on &= ~np.isnan(G)
    put_rock(np.where(on, G + s['high'] * b, -BIG), s['floor'])


def hollow(s):
    G = ground_at(s['floor']); b, on = bell(s); on &= ~np.isnan(G)
    take_rock(np.where(on, G - s['deep'] * b, BIG), s['floor'], on)


def slope(s):
    G = ground_at(s['floor'], up=max(p[1] for p in s['path']) - s['floor'] + 0.8)
    h = np.full((NX, NZ), -BIG, np.float32)
    for a, b, d, f, own in way_parts(s['path'], X2, Z2):
        h = np.maximum(h, np.where(own, f - s.get('fall', 1.3) * np.maximum(0, d - s['wide'] / 2), -BIG))
    put_rock(np.where(~np.isnan(G) & (h > G + 0.02), h, -BIG), s['floor'])


def inside_of(s):
    # how far inside a drawn edge every column is (m; under 0: outside): an "outline" of points, or a "plan" picture (white inside)
    if 'outline' in s:
        ss = 4
        im = Image.new('L', (NX * ss, NZ * ss), 0)
        ImageDraw.Draw(im).polygon([(((x - X0) / CELL + 0.5) * ss, ((z - Z0) / CELL + 0.5) * ss) for x, z in s['outline']], fill=255)
        m = np.asarray(im).T > 127
        d = (ndi.distance_transform_edt(m) - ndi.distance_transform_edt(~m)) / ss * CELL
        return d[ss // 2::ss, ss // 2::ss].astype(np.float32)
    m = picture_on_grid(s['plan'], s['at'], s['size']) > 0.5
    return ((ndi.distance_transform_edt(m) - ndi.distance_transform_edt(~m)) * CELL).astype(np.float32)


def ledge(s):
    top = s['top'] + 0.5 * land_of(s)['relief'] * RELN[:, 0, :]
    # its face: the drawn edge broken along itself, wandering as the walls do, leaning back a little toward its top
    side = (inside_of(s) + s.get('broken', 0.5) * EDGE)[:, None, :] + 0.6 * WOB - s.get('lean', 0.12) * np.maximum(GY - s['floor'], 0)
    put_rock(top, s['floor'], side=side, under=s.get('under', 2.0))


LUMP = []


def boulder(s):
    global F
    if not LUMP:
        LUMP.append(fbm(GX, GY, GZ, WORLD_SEED + 3, 1.9))
    cx, cz = s['at']; r = s['r']; rx, ry, rz = r if isinstance(r, list) else (r, r, r)
    G = ground_at(s['floor'])
    g = G[int(round((cx - X0) / CELL)), int(round((cz - Z0) / CELL))]
    cy = (s['floor'] if np.isnan(g) else float(g)) + ry * (1 - 2 * s.get('sunk', 0.3))
    e = np.sqrt(((GX - cx) / rx) ** 2 + ((GY - cy) / ry) ** 2 + ((GZ - cz) / rz) ** 2)
    F = np.maximum(F, -((e - 1) + s.get('lumpy', 0.35) * LUMP[0]) * min(rx, ry, rz))


def heights(s):
    at, size = s['at'], s['size']
    off = s.get('low', 0.0) + (s.get('high', 1.0) - s.get('low', 0.0)) * ndi.gaussian_filter(picture_on_grid(s['picture'], at, size), 0.7)
    G = ground_at(s['floor'])
    on = (X2 >= at[0]) & (X2 <= at[0] + size[0]) & (Z2 >= at[1]) & (Z2 <= at[1] + size[1]) & ~np.isnan(G)
    put_rock(np.where(on & (off > 0.02), G + off, -BIG), s['floor'])
    take_rock(np.where(on & (off < -0.02), G + off, BIG), s['floor'], on & (off < -0.02))


TERRAIN = {'mound': mound, 'hollow': hollow, 'slope': slope, 'ledge': ledge, 'boulder': boulder, 'heights': heights}
for piece in D.get('terrain', []):
    (kind, s), = piece.items()
    if kind not in TERRAIN:
        raise SystemExit(f'no such terrain: {kind} (TERRAIN has: {", ".join(TERRAIN)})')
    TERRAIN[kind](s)



# ---------------------------------------------------------------- the waterways: their beds (dug now; the water is laid later)
STEEP = 1.0                   # a stream's stretch falling steeper than this (1 in 1) is a fall


def falling(a, b):
    return a[1] - b[1] > max(0.5, STEEP * math.hypot(b[0] - a[0], b[2] - a[2]))


def stream_bed(s):
    w, deep, bank = s['wide'], s.get('deep', 0.25), s.get('bank', 0.7)
    for a, b, d, f, own in way_parts(s['path'], X2, Z2):
        if falling(a, b):
            continue
        mid = (a[1] + b[1]) / 2
        G = ground_at(mid, down=1.6, up=1.6)
        on = own & (d < w / 2 + bank) & ~np.isnan(G)
        t = np.clip((d - w / 2) / bank, 0, 1); t = t * t * (3 - 2 * t)
        # its bed: deepest in the middle, level with the water at its sides; then its banks, eased into the ground as it is
        bed = np.where(d < w / 2, f - deep * (np.cos(np.clip(d / (w / 2), 0, 1) * math.pi) * 0.5 + 0.5), f + 0.04 + (G - f - 0.04) * t)
        put_rock(np.where(on & (bed > G + 0.01), bed, -BIG), mid)
        take_rock(np.where(on & (bed < G - 0.01), bed, BIG), mid, on & (bed < G - 0.01))


BEDS = {'stream': stream_bed}
for piece in D.get('waterways', []):
    (kind, s), = piece.items()
    if kind in BEDS:
        BEDS[kind](s)

BUILT = np.zeros((NX, NY, NZ), np.float32)
UNDER = 0.1                   # m: under its steps a slope's own stone lies this much lower (the steps cover it)
STEPPED = []                  # the ways with steps: (path, wide, rise)
for piece in D.get('stone', []):
    (kind, s), = piece.items()
    if kind == 'way':
        path = s['path'] if 'path' in s else helix_path(s['helix'])
        rise = float(s.get('steps', 0))
        if rise > 0:
            STEPPED.append((path, s['wide'], rise))
        head = slab = None
        for a, b, d, f, own in way_parts(path, GX, GZ, round_ends=False):
            d = np.where(own, d, 1e3)
            if rise > 0 and sloped(a, b):
                f = f - UNDER
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


# ---------------------------------------------------------------- the steps: real ones, laid on a way's slopes
def way_steps(path, wide, rise):
    # the faces of the steps along one way: points, normals, triangles, along (0 a step's back .. 1 its edge), tone (a step's own)
    P = np.array(path, np.float64)
    run = np.concatenate([[0.0], np.cumsum(np.hypot(np.diff(P[:, 0]), np.diff(P[:, 2])))])
    ss = np.arange(0.0, run[-1] + 1e-6, 0.05)
    x, y, z = (np.interp(ss, run, P[:, k]) for k in range(3))
    V, Nn, T, A, Tn = [], [], [], [], []
    rnd = np.random.default_rng(SEED + 31)
    half = wide / 2 + 0.06

    def quad(c, n, along, tone):
        # four corners in order round the face, wound to face n
        c = np.array(c, np.float64); n = np.array(n, np.float64)
        if np.dot(np.cross(c[1] - c[0], c[2] - c[0]), n) < 0:
            c = c[::-1]; along = along[::-1]
        i = len(V)
        V.extend(c.tolist()); Nn.extend([n.tolist()] * 4); A.extend(along); Tn.extend([tone] * 4)
        T.extend([[i, i + 1, i + 2], [i, i + 2, i + 3]])

    slope = np.gradient(y, ss)
    sloped = np.abs(slope) > 0.04
    i = 0
    while i < len(ss):
        if not sloped[i]:
            i += 1; continue
        j = i
        while j + 1 < len(ss) and sloped[j + 1] and (slope[j + 1] > 0) == (slope[i] > 0):
            j += 1
        # one flight, taken from its top down
        idx = np.arange(i, j + 1) if y[i] > y[j] else np.arange(j, i - 1, -1)
        fs, fy, fx, fz = np.abs(ss[idx] - ss[idx[0]]), y[idx], x[idx], z[idx]
        n = max(1, int(round((fy[0] - fy[-1]) / rise)))
        r = (fy[0] - fy[-1]) / n
        at = np.interp(fy[0] - r * np.arange(n + 1), fy[::-1], fs[::-1])        # where the line has come down k rises
        for k in range(n):
            ends = []
            for q in (at[k], at[k + 1]):
                cx, cz = np.interp(q, fs, fx), np.interp(q, fs, fz)
                tx, tz = np.interp(min(q + 0.1, fs[-1]), fs, fx) - np.interp(max(q - 0.1, 0), fs, fx), np.interp(min(q + 0.1, fs[-1]), fs, fz) - np.interp(max(q - 0.1, 0), fs, fz)
                tl = math.hypot(tx, tz) or 1.0; tx, tz = tx / tl, tz / tl
                ends.append(((cx - tz * half, cz + tx * half), (cx + tz * half, cz - tx * half), (tx, tz)))
            (l0, r0, _), (l1, r1, (tx, tz)) = ends
            top = fy[0] - r * k + 0.02
            tone = float(0.5 + 0.22 * (rnd.random() - 0.5))
            quad([[l0[0], top, l0[1]], [r0[0], top, r0[1]], [r1[0], top, r1[1]], [l1[0], top, l1[1]]], [0, 1, 0], [0.0, 0.0, 1.0, 1.0], tone)      # where she treads
            quad([[l1[0], top, l1[1]], [r1[0], top, r1[1]], [r1[0], top - r - 0.02, r1[1]], [l1[0], top - r - 0.02, l1[1]]], [tx, 0, tz], [1.0, 1.0, 0.0, 0.0], tone)   # its front
            for (p0, p1), sgn in (((l0, l1), -1.0), ((r0, r1), 1.0)):                # its two ends
                quad([[p0[0], top, p0[1]], [p1[0], top, p1[1]], [p1[0], top - r - 0.4, p1[1]], [p0[0], top - r - 0.4, p0[1]]], [sgn * tz, 0, -sgn * tx], [0.6, 0.6, 0.6, 0.6], tone)
        i = j + 1
    return V, Nn, T, A, Tn


step_along = np.zeros(len(verts), np.float32); step_is = np.zeros(len(verts), np.float32); tone = np.full(len(verts), 0.5, np.float32)
nsteps = 0
for path, wide, rise in STEPPED:
    V, Nn, T, A, Tn = way_steps(path, wide, rise)
    if not V:
        continue
    faces = np.concatenate([faces, np.array(T, faces.dtype) + len(verts)])
    verts = np.concatenate([verts, np.array(V, np.float32)]); normals = np.concatenate([normals, np.array(Nn, np.float32)])
    step_along = np.concatenate([step_along, np.array(A, np.float32)]); step_is = np.concatenate([step_is, np.ones(len(V), np.float32)])
    tone = np.concatenate([tone, np.array(Tn, np.float32)])
    nsteps += len(V) // 16


def light_on(P, Nn):
    # the light on points of the rock's face (Nn: their normals): how open to the room each is (corners and cracks: less),
    # the dark's own light by that, and the lamps' -> (light, open)
    op = np.ones(len(P), np.float32)
    for d, w in ((0.5, 0.5), (1.1, 0.3), (2.2, 0.2)):
        op -= w * np.clip((d + at_field(F, P + Nn * d)) / d, 0, 1)
    op = np.clip(op, 0.15, 1)
    return AMBIENT[None, :] * (0.35 + 0.65 * op)[:, None] + lamp_light(P, Nn) * (0.5 + 0.5 * op)[:, None], op


light, open_to = light_on(verts, normals)
built = np.maximum(np.clip(at_field(BUILT, verts - normals * 0.1), 0, 1), step_is)
log(f'mesh: {len(verts)} points, {len(faces)} triangles ({nsteps} steps); light up to {light.max():.2f}')

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
# under steps she walks the slope through their middles (the stone itself lies UNDER lower, the steps up to a rise over it)
raised = np.zeros(len(pts), bool)
for path, wide, rise in STEPPED:
    for a, b, d, f, own in way_parts(path, pts[:, 0], pts[:, 2], round_ends=False):
        if not sloped(a, b):
            continue
        on = own & (d < wide / 2 + 0.1) & (np.abs(pts[:, 1] - (f - UNDER)) < 0.45) & ~raised
        pts[on, 1] += UNDER + rise / 2
        raised |= on
fl_map[where[raised]] = np.round(pts[raised, 1] * 100).astype(np.int16)


# ---------------------------------------------------------------- the water: laid where the rock, as it now is, holds it
def ground_under(W, reach=4.0):
    # under a water's surface W (over the columns; nan: none): the ground it lies on (the highest within reach under it, or
    # just over it: a bank), and whether a column without such ground is rock at the water's height (a wall it runs into;
    # else it is air: an edge it would run off)
    G = np.full((NX, NZ), np.nan, np.float32)
    for l in range(NY - 1):
        a, b = F[:, l, :], F[:, l + 1, :]
        y = Y0 + (l + a / np.maximum(a - b, 1e-6)) * CELL
        G = np.where((a > 0) & (b <= 0) & (y <= W + 0.5) & (y >= W - reach), y, G)
    li = np.clip(np.round((np.nan_to_num(W, nan=Y0) - Y0) / CELL), 0, NY - 1).astype(int)
    return G, np.take_along_axis(F, li[:, None, :], axis=1)[:, 0, :] > 0


SHEETS = []                   # every water that meets at one height is one sheet: { W: its surface over the columns, flow }
FALLS = []                    # (lip, foot, width, the way it was running)


def lay(W, flow=None):
    for S in SHEETS:
        both = ~np.isnan(S['W']) & ~np.isnan(W)
        if both.any() and np.abs(S['W'][both] - W[both]).min() < 0.15:
            S['W'] = np.fmax(S['W'], W)
            if flow is not None:
                S['flow'] += flow
            return
    SHEETS.append({'W': W, 'flow': np.zeros((NX, NZ, 2), np.float32) if flow is None else flow})


def pool_water(s):
    level = float(s['level'])
    G, wall = ground_under(np.full((NX, NZ), level, np.float32))
    wet = G < level - 0.005
    i, j = int(round((s['at'][0] - X0) / CELL)), int(round((s['at'][1] - Z0) / CELL))
    if not wet[i, j]:
        raise SystemExit(f"the pool at {s['at']} lies on dry ground (the ground there is at {G[i, j]:.2f}, its level {level}): dig a hollow there, or raise its level")
    lab, _ = ndi.label(wet)
    body = lab == lab[i, j]
    off = ndi.binary_dilation(np.isnan(G) & ~wall) & body        # (beside air with no ground under it: an edge)
    if off.any():
        a, b = np.argwhere(off)[0]
        raise SystemExit(f"the pool at {s['at']} is not held: at its level ({level}) it runs off an edge at {X0 + a * CELL:.1f}, {Z0 + b * CELL:.1f}: lower its level, or raise the ground there")
    lay(np.where(ndi.binary_dilation(body, iterations=2), level, np.nan).astype(np.float32))
    log(f"  a pool at {s['at']}: {body.sum() * CELL * CELL:.0f} m2, up to {level - np.nanmin(np.where(body, G, np.nan)):.2f} m deep")


def stream_water(s):
    w, bank = s['wide'], s.get('bank', 0.7)
    W = np.full((NX, NZ), np.nan, np.float32); flow = np.zeros((NX, NZ, 2), np.float32)
    was = None
    for a, b, d, f, own in way_parts(s['path'], X2, Z2):
        run = max(math.hypot(b[0] - a[0], b[2] - a[2]), 1e-6); ux, uz = (b[0] - a[0]) / run, (b[2] - a[2]) / run
        if falling(a, b):
            FALLS.append((a, b, w, (ux, uz) if run > 0.25 or was is None else was))
            continue
        was = (ux, uz)
        on = own & (d < w / 2 + bank + 0.4)
        W = np.where(on, f, W)
        k = np.where(on, np.clip(1 - (d - w / 2) / 0.5, 0, 1), 0) * (0.45 + 4.0 * max((a[1] - b[1]) / run, 0))      # (m/s: faster where steeper)
        flow[..., 0] += k * ux; flow[..., 1] += k * uz
    for m in MOUTHS:                                      # (a stream ending at a mouth is the next room's too)
        for end in (s['path'][0], s['path'][-1]):
            if math.hypot(end[0] - m['at'][0], end[2] - m['at'][2]) < 2.0 and abs(end[1] - m['at'][1]) < 1.5:
                m['stream'] = {'level': end[1], 'wide': w}
    lay(W, flow)


WATERWAYS = {'pool': pool_water, 'stream': stream_water}
for piece in D.get('waterways', []):
    (kind, s), = piece.items()
    if kind not in WATERWAYS:
        raise SystemExit(f'no such waterway: {kind} (WATERWAYS has: {", ".join(WATERWAYS)})')
    WATERWAYS[kind](s)

water_map = np.full(K * N2, -32768, np.int16)             # the water's surface over each span (cm), for her level
wet_by = np.full(len(pts), np.nan, np.float32)            # every span's floor under (+) or over (-) the water beside it (m)
WV, WI, WUV, WT = [], [], [], []                          # the water's mesh: points, info (depth, flow x, flow z, 0), uv, triangles
parts = {}
for S in SHEETS:
    W = S['W']; G, wall = ground_under(W)
    depth = np.where(np.isnan(G), np.where(wall & ~np.isnan(W), 0.6, np.nan), W - G)      # (into a wall: as if deep; off an edge: none)
    real = ~np.isnan(G) & (depth > 0)
    for sp in range(K):                                   # the spans it lies over (or beside: its shore)
        flv = fl_map[sp * N2:(sp + 1) * N2].reshape(NX, NZ)
        on = ~np.isnan(G) & (flv != -32768) & (np.abs(flv / 100.0 - G) < 0.6)
        water_map[sp * N2:(sp + 1) * N2][on.reshape(-1)] = np.round(W[on] * 100).astype(np.int16)
    have = ~np.isnan(depth)
    quad = have[:-1, :-1] & have[1:, :-1] & have[:-1, 1:] & have[1:, 1:] & (real[:-1, :-1] | real[1:, :-1] | real[:-1, 1:] | real[1:, 1:])
    use = np.zeros((NX, NZ), bool)
    use[:-1, :-1] |= quad; use[1:, :-1] |= quad; use[:-1, 1:] |= quad; use[1:, 1:] |= quad
    ids = np.full((NX, NZ), -1, np.int64); ids[use] = len(WV) + np.arange(use.sum())
    ii, jj = np.nonzero(use)
    WV.extend(np.stack([X0 + ii * CELL, W[ii, jj], Z0 + jj * CELL], 1).tolist())
    WI.extend(np.stack([np.clip(depth[ii, jj], -0.6, 4.0), S['flow'][ii, jj, 0], S['flow'][ii, jj, 1], np.zeros(len(ii))], 1).tolist())
    WUV.extend(np.stack([ii * CELL, jj * CELL], 1).tolist())
    qi, qj = np.nonzero(quad)
    a, b, c, d = ids[qi, qj], ids[qi + 1, qj], ids[qi, qj + 1], ids[qi + 1, qj + 1]
    WT.extend(np.stack([a, c, b], 1).tolist()); WT.extend(np.stack([b, c, d], 1).tolist())      # (wound to face up)
parts['surface'] = [0, len(WT) * 3]
# every span by a water: how far its floor is under or over it
wm = water_map[where]
wet_by = np.where(wm != -32768, wm / 100.0 - pts[:, 1], np.nan)
# the falls: water through the air from a lip to a foot, and the foam where it lands
n0 = len(WT)
for lip, foot, w, (ux, uz) in FALLS:
    hit = water_map.reshape(K, NX, NZ)[:, int(round((foot[0] - X0) / CELL)), int(round((foot[2] - Z0) / CELL))]
    if not ((hit != -32768) & (np.abs(hit / 100.0 - foot[1]) < 0.3)).any():
        raise SystemExit(f'the fall from {lip} lands at {foot}, where there is no water at that height: end it on a pool at the pool\'s level')
    px, pz = -uz, ux; n = 12; base = len(WV); fell = 0.0; prev = None
    hx, hz = foot[0] - lip[0], foot[2] - lip[2]
    for k in range(n + 1):
        t = k / n
        c = np.array([lip[0] + hx * t, lip[1] - (lip[1] - foot[1]) * t * t, lip[2] + hz * t])       # (out at an even pace, down faster and faster)
        fell += 0.0 if prev is None else float(np.linalg.norm(c - prev)); prev = c
        half = w / 2 * (0.92 + 0.16 * t)
        for side in (-1, 1):
            WV.append([c[0] + px * half * side, c[1], c[2] + pz * half * side]); WI.append([1.0, ux, uz, 0.0]); WUV.append([(side + 1) / 2, fell])
        if k:
            q = base + 2 * k
            WT.extend([[q - 2, q - 1, q], [q - 1, q + 1, q]])
parts['falls'] = [n0 * 3, (len(WT) - n0) * 3]
n1 = len(WT)
for lip, foot, w, (ux, uz) in FALLS:
    base = len(WV); R = max(0.9, w * 1.25); m = 18
    WV.append([foot[0], foot[1] + 0.025, foot[2]]); WI.append([1.0, 0.0, 0.0, 0.0]); WUV.append([0.0, 0.0])
    for k in range(m + 1):
        an = 2 * math.pi * k / m
        WV.append([foot[0] + R * math.cos(an), foot[1] + 0.025, foot[2] + R * math.sin(an)]); WI.append([1.0, 0.0, 0.0, 0.0]); WUV.append([k / m, 1.0])
        if k:
            WT.append([base, base + k + 1, base + k])
parts['feet'] = [n1 * 3, (len(WT) - n1) * 3]
if SHEETS:
    log(f'water: {len(SHEETS)} sheets, {len(FALLS)} falls; {len(WV)} points, {len(WT)} triangles')

# ---------------------------------------------------------------- the ground: what lies on the floors
# BY RULE. A rule reads every span's FACTS and says how much of each kind lies there (0..1; a kind it does not name: none):
#   lum    the lamps' light on it            tilt   how steep it is (degrees)     level  1 on level ground, 0 past 16 degrees
#   foot   1 at the foot of a face or a wall, 0 a metre and a half out            rag, patch   the underground's own noise, small and large
#   shore  1 on a water's bed and up its shore                                    damp   1 at a water's edge, 0 a metre over it
def bare_ground(f):
    return {}


def cave_ground(f):
    gravel = np.clip(np.maximum(f['foot'] * (0.85 + 1.5 * f['patch']), (f['tilt'] - 20) / 14) + f['rag'] * 0.3, 0, 1)        # at the feet of faces, in stretches; on scree
    return {
        'gravel': gravel,
        'moss': np.clip((f['lum'] - 0.16) * 3.2 + f['rag'] * 0.25 + f['damp'] * 0.55, 0, 1) * (1 - 0.85 * gravel),           # where a lamp's light falls, and on a water's banks; not on loose stones
        'turf': np.clip((f['lum'] - 0.44) * 4.0 + f['rag'] * 0.3, 0, 1) * f['level'] * (1 - gravel),                         # right under a strong lamp (grass grows from it)
        'sand': f['shore'],
    }


def grove_ground(f):
    leaves = np.clip(np.maximum(1.15 - f['lum'] * 3.2 + f['patch'] * 0.9, f['foot'] * 1.4 - 0.3 + f['patch'] * 0.8), 0, 1)   # in the dim, and blown to the walls' feet
    return {
        'gravel': np.clip((f['tilt'] - 22) / 14 + f['rag'] * 0.3, 0, 1),
        'leaves': leaves,
        'moss': np.clip((f['lum'] - 0.08) * 4.0 + f['rag'] * 0.25 + f['damp'] * 0.55, 0, 1) * (1 - 0.8 * leaves),
        'turf': np.clip((f['lum'] - 0.2) * 4.0 + f['rag'] * 0.3, 0, 1) * f['level'],                                         # where the light is strong, on level ground
        'sand': f['shore'],
    }


def ruins_ground(f):
    return {
        'gravel': np.clip(np.maximum(0.05 - f['patch'] * 2.2, (f['tilt'] - 20) / 14) + f['rag'] * 0.3, 0, 1),                # rubble, where the paving is gone
        'paving': np.clip(1.0 + f['patch'] * 2.2 + f['rag'] * 0.3, 0, 1) * np.clip((22 - f['tilt']) / 8, 0, 1),              # old slabs, in broken stretches
        'leaves': np.clip(f['foot'] * 1.3 - 0.2 + f['rag'] * 0.4, 0, 1),                                                     # blown to the walls' feet
        'moss': np.clip((f['lum'] - 0.5) * 3.0 + f['rag'] * 0.25 + f['damp'] * 0.7, 0, 1),                                   # right under a lamp, and on a water's banks
        'sand': f['shore'],
    }


RULES = {'bare': bare_ground, 'cave': cave_ground, 'grove': grove_ground, 'ruins': ruins_ground}


# BY HAND. How much of a painted thing lies on every span (0..1), from where its entry says
def lies_on(kind, s, rag):
    if 'path' in s:                                                       # along a line, on that way's own floor
        best = np.full(len(pts), 1e9, np.float32)
        for a, b in zip(s['path'][:-1], s['path'][1:]):
            ab = np.array([b[0] - a[0], b[2] - a[2]], np.float32)
            t = np.clip(((pts[:, 0] - a[0]) * ab[0] + (pts[:, 2] - a[2]) * ab[1]) / max(float(ab @ ab), 1e-6), 0, 1)
            d = np.hypot(pts[:, 0] - (a[0] + t * ab[0]), pts[:, 2] - (a[2] + t * ab[1]))
            best = np.minimum(best, np.where(np.abs(pts[:, 1] - (a[1] + t * (b[1] - a[1]))) < 1.5, d, 1e9))
        return np.clip(1.15 - (best + rag * 0.5) / (s['wide'] / 2), 0, 1)
    if 'floor' not in s:
        raise SystemExit(f'a painted {kind} that is not along a "path" says which storey it lies on: "floor": y')
    on = np.abs(pts[:, 1] - s['floor']) < s.get('reach', 1.5)
    ci, cj = (where % N2) // NZ, (where % N2) % NZ
    if 'picture' in s:                                                    # a drawn picture: its grey is how much
        return np.where(on, ndi.gaussian_filter(picture_on_grid(s['picture'], s['at'], s['size']), 0.6)[ci, cj], 0).astype(np.float32)
    if 'outline' in s:                                                    # inside a drawn outline
        inside = inside_of(s)[ci, cj]
    elif 'at' in s:                                                       # a round or long patch
        r = s['r']; rx, rz = r if isinstance(r, list) else (r, r)
        inside = (1 - np.hypot((pts[:, 0] - s['at'][0]) / rx, (pts[:, 2] - s['at'][1]) / rz)) * min(rx, rz)
    else:
        raise SystemExit(f'a painted {kind} says nowhere to lie: give it "path", "at", "outline" or "picture"')
    return np.where(on, np.clip(0.5 + (inside + rag * 0.4) / 0.6, 0, 1), 0).astype(np.float32)


def rule_word(s=None):
    word = (s or {}).get('ground', D.get('ground', 'cave'))
    if word not in RULES:
        raise SystemExit(f'no such ground: {word} (RULES has: {", ".join(RULES)})')
    return word


paint = np.zeros((K * N2, 4), np.uint8); paint2 = np.zeros((K * N2, 4), np.uint8); step = np.zeros(K * N2, np.uint8)
STEPS = ['stone'] + sorted({g['step'] for g in GROUNDS.values()} - {'stone'})      # what "step"'s bytes name
KINDS = []                                                                # the kinds this room has, as the game reads them
if len(pts):
    up = np.array([0, 1, 0], np.float32)
    slab = at_field(BUILT, pts - up * 0.15) > 0.5
    # ---- every span's facts
    rag = fbm(pts[:, 0], pts[:, 1] * 0, pts[:, 2], WORLD_SEED + 9, 1.7, 2)
    GRAD = np.gradient(ndi.gaussian_filter(F, 0.8), CELL)                 # which way the rock rises, smoothed (what grows reads it too)
    grad = np.stack([at_field(c, pts) for c in GRAD], 1)
    tilt = np.degrees(np.arccos(np.clip(-grad[:, 1] / (np.linalg.norm(grad, axis=1) + 1e-6), -1, 1)))
    clear = np.full(len(pts), 9.0, np.float32)                            # the air a metre up, 0.8 m out every way: how far from rock
    for an in np.arange(8) * math.pi / 4:
        clear = np.minimum(clear, -at_field(F, pts + np.array([0.8 * math.cos(an), 1.0, 0.8 * math.sin(an)], np.float32)))
    f = dict(
        lum=(lamp_light(pts + up * 0.3) * np.array([0.3, 0.59, 0.11], np.float32)).sum(1), rag=rag,
        patch=fbm(pts[:, 0], pts[:, 1] * 0, pts[:, 2], WORLD_SEED + 11, 5.5, 2),
        tilt=tilt, level=np.clip((16 - tilt) / 8, 0, 1), foot=np.clip(1 - (clear + 0.5) / 1.2, 0, 1),
        shore=np.nan_to_num(np.clip((wet_by + 0.22 + rag * 0.08) / 0.22, 0, 1), nan=0.0),
        damp=np.nan_to_num(np.clip(1 + wet_by / 1.0, 0, 1) * (wet_by < 0), nan=0.0))
    # ---- by rule: the room's word, or the word of the air piece a span is in (eased from one to the next over a metre)
    words = [rule_word(next(iter(piece.values()))) for piece in D['air']]
    said = sorted(set(words) | {rule_word()})
    if len(said) == 1:
        share = {said[0]: 1.0}
    else:
        near = ndi.distance_transform_edt(OWNER < 0, return_distances=False, return_indices=True)
        whose = np.array([said.index(w) for w in words])[OWNER[tuple(near)]]          # every cell: the rule of the air nearest it
        share = {w: at_field(ndi.gaussian_filter((whose == n).astype(np.float32), 1.5), pts + up * 0.4) for n, w in enumerate(said)}
        tot = sum(share.values()) + 1e-6
        share = {w: v / tot for w, v in share.items()}
    amt = {name: np.zeros(len(pts), np.float32) for name in GROUNDS}
    for w in said:
        for name, v in RULES[w](f).items():
            amt[name] += share[w] * v
    # ---- by hand, over the rule's: each entry over what lay there before it (a water's bed and shore stay the water's own)
    for piece in D.get('paint', []):
        (kind, s), = piece.items()
        if kind != 'stone' and kind not in GROUNDS:
            raise SystemExit(f'no such ground to paint: {kind} (GROUNDS has: {", ".join(GROUNDS)}; "stone": the bare floor)')
        a = lies_on(kind, s, rag) * (1 - f['shore'])
        for name in amt:
            amt[name] = np.maximum(amt[name], a) if name == kind else amt[name] * (1 - a)
    # ---- baked: each kind the room has takes a byte of every span; what is underfoot (the topmost kind there)
    used = [name for name in GROUNDS if (amt[name] * ~slab).max() > 0.3]
    if len(used) > 7:
        raise SystemExit(f'this room has {len(used)} kinds of ground ({", ".join(used)}): a floor\'s paint holds 7')
    top = np.zeros(len(pts), np.uint8); topk = np.full(len(pts), -1)
    for ch, name in enumerate(used):
        g = GROUNDS[name]
        (paint if ch < 3 else paint2)[where, ch if ch < 3 else ch - 3] = np.where(slab, 0, np.clip(amt[name], 0, 1) * 255)
        KINDS.append({'name': name, 'picture': g['picture'], 'tile': g['tile'], 'tint': g['tint'], **({'grey': g['grey']} if 'grey' in g else {}),
                      'ragged': g['ragged'], 'step': g['step'], **({'grows': g['grows']} if g.get('grows') else {}), 'at': ch})
        on = (amt[name] > 0.5) & ~slab
        top[on] = STEPS.index(g['step']); topk[on] = ch
    paint[where, 3] = np.where(slab, 150, 0)
    step[where] = top
    nat = max(int((~slab).sum()), 1)
    log(f"ground ({', '.join(said)}): " + ', '.join([f"{k['name']} {100 * (topk == k['at']).sum() / nat:.0f} %" for k in KINDS] + [f"bare stone {100 * ((topk < 0) & ~slab).sum() / nat:.0f} %"]))
log(f'floor: {NX} x {NZ} columns, up to {K} spans a column ({len(pts)} spans)')

# ---------------------------------------------------------------- what grows on the floors: scattered by rule
def rand01(a, b, c, salt):
    # a number 0..1 for a spot (three whole numbers) and a purpose: the same wherever and whenever it is asked
    x = (a.astype(np.int64) * 73856093) ^ (b.astype(np.int64) * 19349663) ^ (c.astype(np.int64) * 83492791) ^ np.int64(salt * 2654435761)
    x = x.astype(np.uint64)
    x ^= x >> np.uint64(33); x *= np.uint64(0xff51afd7ed558ccd); x ^= x >> np.uint64(33); x *= np.uint64(0xc4ceb9fe1a85ec53); x ^= x >> np.uint64(33)
    return ((x >> np.uint64(11)).astype(np.float64) / float(1 << 53)).astype(np.float32)


def scatter(thick, per_m2, salt):
    # things scattered over the floors: on every span `thick` (0..1 and over) of `per_m2` a square metre, each at a spot of
    # its own in the span's cell, by the cell's place in the underground (so a room baked again grows them where they
    # were), dropped onto the rock as it is there (one that finds no floor of its span under it, at a ledge's edge, is left out).
    # -> their points (n, 3), each one's span (into pts), each one's own dice (n, 4; 0..1)
    gi, gj, gy = (np.round(pts[:, a] / u).astype(np.int64) for a, u in ((0, CELL / 2), (2, CELL / 2), (1, 1.4)))
    n = np.floor(thick * per_m2 * CELL * CELL + rand01(gi, gj, gy, salt)).astype(np.int64)
    span = np.repeat(np.arange(len(pts)), n)
    c = np.arange(len(span)) - np.repeat(np.cumsum(n) - n, n)             # (which of its span's each is)
    dice = np.stack([rand01(gi[span], gj[span], gy[span] * 64 + c, salt + 1 + d) for d in range(6)], 1)
    P = pts[span].copy()
    P[:, 0] += (dice[:, 0] - 0.5) * CELL; P[:, 2] += (dice[:, 1] - 0.5) * CELL
    e = np.array([0, 0.1, 0], np.float32)
    for _ in range(3):
        rise = (at_field(F, P - e) - at_field(F, P + e)) / 0.2
        P[:, 1] += np.clip(at_field(F, P) / np.maximum(rise, 0.3), -0.2, 0.2)
    ok = (np.abs(at_field(F, P)) < 0.02) & (np.abs(P[:, 1] - pts[span, 1]) < 0.25)     # (on rock, and on its own span's floor: not down a face beside it)
    return P[ok], span[ok], dice[ok, 2:]


GRASS = D.get('grass', 'green')
GRASS = {'kind': GRASS} if isinstance(GRASS, str) else dict(GRASS)
TUFTS = 40.0                  # tufts of grass a square metre where it stands thickest
grass = None
if len(pts) and GRASS.get('kind', 'green') != 'none':
    # how much of each kind of ground shows on a span (what the kinds laid over it leave of it: as cave-ground.js lays a
    # kind in, none under 0.32 of it, all of it past 0.62), and so how thick grass stands there: by the grounds that
    # grow it, not in water (thin at its very edge), not on steep ground, not on laid stone
    seen = {}; left = np.ones(len(pts), np.float32)
    for name in reversed(list(GROUNDS)):
        t = np.clip((amt[name] - 0.32) / 0.3, 0, 1); t = t * t * (3 - 2 * t)
        seen[name] = t * left; left = left * (1 - t)
    grown = [name for name in GROUNDS if GROUNDS[name].get('grows')]
    thick = sum(GROUNDS[name]['grows'] * seen[name] for name in grown) * GRASS.get('thick', 1.0)
    thick = thick * np.where(np.isnan(wet_by), 1.0, np.clip((-wet_by - 0.03) / 0.12, 0, 1)) * np.clip((38 - f['tilt']) / 10, 0, 1) * ~slab
    P, span, dice = scatter(thick, TUFTS, 31)
    if len(P):
        # each tuft: taller in clumps and where it stands thick, shorter toward its patch's edge
        clump = fbm(P[:, 0], P[:, 1] * 0, P[:, 2], WORLD_SEED + 13, 1.6, 2)
        tall = np.clip((0.66 + 0.9 * clump) * (0.8 + 0.4 * dice[:, 0]) * (0.4 + 0.6 * np.clip(thick[span], 0, 1)) * GRASS.get('tall', 1.0), 0.2, 2.0)
        # the colour of the ground it rises from (the growing kinds showing there: their pictures' own colour, tinted), so
        # a blade has no root to be seen
        def colour_of(name):
            g = GROUNDS[name]; tint = D.get('look', {}).get(name, g['tint'])
            return np.asarray(Image.open(os.path.join(ROOT, 'assets', 'ground', g['picture'])).convert('RGB'), np.float32).reshape(-1, 3).mean(0) / 255 * np.array(tint, np.float32)
        share = np.stack([seen[name][span] * GROUNDS[name]['grows'] for name in grown], 1) + 1e-4
        ground = (share[:, :, None] * np.stack([colour_of(name) for name in grown])[None]).sum(1) / share.sum(1, keepdims=True)
        # the rock's own face there: its light (as the rock under it is lit), and how it slopes (a tuft's blades stand a
        # hand apart)
        N = -np.stack([at_field(c, P) for c in GRAD], 1); N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-6
        lit, _ = light_on(P, N.astype(np.float32))
        lean = np.clip(-N[:, [0, 2]] / np.maximum(N[:, 1:2], 0.3), -1, 1)
        rnd8 = np.zeros((len(P), 4), np.uint8); col8 = np.zeros((len(P), 4), np.uint8); lit8 = np.zeros((len(P), 4), np.uint8)
        rnd8[:, 0] = dice[:, 1] * 255; rnd8[:, 1] = tall / 2 * 255; rnd8[:, 2] = dice[:, 2] * 255; rnd8[:, 3] = dice[:, 3] * 255
        col8[:, :3] = np.clip(ground, 0, 1) * 255; col8[:, 3] = (lean[:, 0] * 0.5 + 0.5) * 255
        lit8[:, :3] = np.clip(lit / LIGHT_SCALE * 255, 0, 255); lit8[:, 3] = (lean[:, 1] * 0.5 + 0.5) * 255
        grass = (P.astype(np.float32), rnd8, col8, lit8)
        log(f"grass ({GRASS.get('kind', 'green')}): {len(P)} tufts on {(thick > 0.5).sum() * CELL * CELL:.0f} m2 ({', '.join(grown)})")

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
light8 = np.zeros((len(verts), 4), np.uint8); light8[:, :3] = np.clip(light / LIGHT_SCALE * 255, 0, 255); light8[:, 3] = np.clip(tone * 255, 0, 255)
info8 = np.zeros((len(verts), 4), np.uint8); info8[:, 0] = built * 255; info8[:, 1] = open_to * 255; info8[:, 2] = step_along * 255; info8[:, 3] = step_is * 255
mesh = {'vertices': int(len(verts)), 'indices': int(faces.size), 'pos': put(verts), 'nrm': put(nrm8), 'light': put(light8), 'info': put(info8),
        'idx': put(faces.astype(np.uint32).reshape(-1))}
floor = {'nx': NX, 'nz': NZ, 'x0': X0, 'z0': Z0, 'cell': CELL, 'layers': K, 'floor': put(fl_map), 'ceil': put(ce_map), 'paint': put(paint),
         **({'paint2': put(paint2)} if len(KINDS) > 3 else {}), 'kinds': KINDS, 'step': put(step), 'steps': STEPS}
water = None
if WT:
    floor['water'] = put(water_map)
    wv = np.array(WV, np.float32)
    wl = AMBIENT[None, :] * 0.8 + lamp_light(wv + np.array([0, 0.05, 0], np.float32), np.tile(np.array([[0, 1, 0]], np.float32), (len(wv), 1)))
    wl8 = np.zeros((len(wv), 4), np.uint8); wl8[:, :3] = np.clip(wl / LIGHT_SCALE * 255, 0, 255); wl8[:, 3] = 255
    water = {'vertices': int(len(wv)), 'indices': int(len(WT) * 3), 'pos': put(wv), 'info': put(np.array(WI, np.float32)), 'uv': put(np.array(WUV, np.float32)),
             'light': put(wl8), 'idx': put(np.array(WT, np.uint32).reshape(-1)), 'parts': parts}
grown = None
if grass:
    grown = {'tufts': int(len(grass[0])), 'root': put(grass[0]), 'rnd': put(grass[1]), 'col': put(grass[2]), 'light': put(grass[3])}
volume = {'nx': VNX, 'ny': VNY, 'nz': VNZ, 'x0': X0, 'y0': Y0, 'z0': Z0, 'cell': VC, 'data': put(vol8)}


def stand(p):
    return {**{k: v for k, v in p.items() if k not in ('y',)}, 'y': p['y']}


out = {
    'kit': 1, 'name': NAME, 'title': D.get('title', NAME), 'about': D.get('about', '') + ' (made by tools/make-cave-room.py from tools/cave-rooms/' + NAME + '.json; read by cave-room.js)',
    'bin': {'mesh': mesh, 'floor': floor, 'volume': volume, 'lightScale': LIGHT_SCALE, **({'water': water} if water else {}), **({'grass': grown} if grown else {})},
    'bounds': [X0, Y0, Z0, X1, Y1, Z1], 'ambient': [float(v) for v in AMBIENT], 'lamps': LAMPS,
    'water': D.get('water', 'clear'), 'grass': GRASS.get('kind', 'green'), 'falls': [{'lip': list(a), 'foot': list(b), 'wide': w} for a, b, w, _ in FALLS],
    'look': D.get('look', {}), 'land': D.get('land', 'rolling'), 'ground': D.get('ground', 'cave'), 'mouths': MOUTHS,
    'spawn': stand(D['spawn']), 'places': [stand(p) for p in D.get('places', [])],
}
os.makedirs(os.path.join(ROOT, 'assets', 'caves'), exist_ok=True)
open(os.path.join(ROOT, 'assets', 'caves', NAME + '.bin'), 'wb').write(blob)
json.dump(out, open(os.path.join(ROOT, 'assets', 'caves', NAME + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
log(f'wrote assets/caves/{NAME}.bin ({len(blob) / 1e6:.2f} MB) + .json')
