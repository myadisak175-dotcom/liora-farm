# make-hill-village-map.py  —  the hill village's map, as a game shows one: the land seen from straight above, painted
#
# Reads what tools/make-hill-village-heightmap.py wrote (assets/heightmaps/hill-village.bin + .json: the land's heights and the
# plan of everything on it) and paints the map from it, so the map is always the land as it is: run this after that tool.
# Writes assets/maps/hill-village-map.webp (north, the game's -z, at the top) and hill-village-map.json (the part of the world
# the picture covers, for game-map.js to put her and the places on it).
#
# How it is painted, from the bottom up:
#   1. the land: meadow green, a little paler the higher it lies, lit from the north-west so every terrace's edge shows;
#   2. the cliffs: rock where the land is steep; the pit going down into its mist; the land she cannot walk on, washed out;
#   3. the water: each stretch as wide as it is, with a pale middle; foam where it falls;
#   4. the ways and yards (sand), the fields (tilled rows) and their fences, the bridges;
#   5. the houses from above (a roof, lit on one side of the ridge), the windmill's sails, the well;
#   6. rocks, bushes and trees (a shadow, a crown, a light on it).
#
#   python3 tools/make-hill-village-map.py            (Termux: pip install numpy scipy pillow)
#
# To change its look: PPM (pixels to a metre), MARGIN (how much land is shown beyond where she can walk), COL.
import json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'assets/heightmaps', ROOT / 'assets/maps'
PPM, MARGIN, SS = 5, 5.0, 2                                           # pixels to a metre; metres shown beyond the walkable land; drawn this many times larger, then made small (smooth edges)
COL = {
    'grass_low': '#86bf4c', 'grass_high': '#b3d862', 'rock_lit': '#d8c6a4', 'rock_dark': '#8f775c', 'mist': '#eef5f8', 'beyond': '#dfe8d8',
    'water': '#56bfe6', 'water_mid': '#93dcf3', 'water_edge': '#3492c2', 'foam': '#ffffff',
    'way': '#ecd9a0', 'way_edge': '#b99c62', 'soil': '#a67844', 'fence': '#7a4c2b', 'stone': '#d3c7ae', 'stone_edge': '#8d8270', 'plank': '#b07b45',
    'roof_lit': '#e06a3e', 'roof_dark': '#b44c2f', 'roof_edge': '#6b2f20', 'sail': '#f1e6c8', 'sail_edge': '#7a5233',
    'crop': {'wheat': '#e6bd4c', 'cabbage': '#86c060', 'carrot': '#6ea84e'},
    'tree': {'oak': ('#5fa63c', '#8fcb52'), 'broadleaf': ('#6db340', '#9bd45a'), 'birch': ('#86c24a', '#b4dd66'), 'pine': ('#3d8a4b', '#5aa85a'), 'bush': ('#7fbd47', '#a6d65e'),
             'sapling': ('#78bb44', '#a5d75f')},
    'tree_r': {'oak': 2.5, 'broadleaf': 2.3, 'birch': 1.5, 'pine': 1.6, 'bush': 0.75, 'sapling': 1.2}, 'rock': '#bdb7aa', 'rock_edge': '#857f74', 'shadow': (40, 60, 40, 70),
}
rgb = lambda c: np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float)
sm = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))

plan = json.loads((SRC / 'hill-village.json').read_text())
L = plan['land']; H = np.fromfile(SRC / 'hill-village.bin', '<u2').reshape(L['nz'], L['nx']) / 65535 * L['range'] + L['base']
X0, X1, Z0, Z1 = L['play'][0] - MARGIN, L['play'][1] + MARGIN, L['play'][2] - MARGIN, L['play'][3] + MARGIN
W, Hh = int(round((X1 - X0) * PPM)), int(round((Z1 - Z0) * PPM))

# ---- 1, 2. the land, painted point by point
px = X0 + (np.arange(W * SS) + 0.5) / (PPM * SS); pz = Z0 + (np.arange(Hh * SS) + 0.5) / (PPM * SS)
gi, gj = np.meshgrid((px - L['x0']) / L['cell'], (pz - L['z0']) / L['cell'])
h = ndi.map_coordinates(H, [gj, gi], order=1, mode='nearest')
m = 1 / (PPM * SS)
dz, dx = np.gradient(ndi.gaussian_filter(h, 1.2), m)
slope = np.hypot(dx, dz)
light = np.clip(1.0 + (dx * 0.62 + dz * 0.62) * 0.55, 0.55, 1.35)      # lit from the north-west: a face that falls toward the south-east is in shade
rng = np.random.default_rng(5)
drift = ndi.zoom(rng.random((Hh // 60 + 3, W // 60 + 3)), 60 * SS, order=3)[:Hh * SS, :W * SS]      # broad drifts of tone over the meadow
high = sm(-14, 24, h)                                                  # how high the land lies, the valley's floor to the keep's crag
img = rgb(COL['grass_low']) * (1 - high[..., None]) + rgb(COL['grass_high']) * high[..., None]
img *= (0.94 + 0.12 * drift)[..., None]
rock = sm(0.55, 1.0, slope)[..., None]
img = img * (1 - rock) + (rgb(COL['rock_dark']) + (rgb(COL['rock_lit']) - rgb(COL['rock_dark'])) * sm(0.6, 1.3, light)[..., None]) * rock
img *= (0.86 + 0.14 * np.clip(light, 0.6, 1.2) / 1.2 * 1.2)[..., None] * (1 - rock * 0.0)
pit = plan.get('pit')
if pit:                                                               # down the pit: darker shelf by shelf, then its mist
    rim = pit['shift'] + 15.0; deep = np.clip((rim - 3 - h) / 30, 0, 1)
    img *= (1 - 0.28 * deep)[..., None]
    mist = sm(rim - 30, rim - 52, h) * (0.78 + 0.22 * ndi.zoom(rng.random((Hh // 12 + 3, W // 12 + 3)), 12 * SS, order=3)[:Hh * SS, :W * SS])
    img = img * (1 - mist[..., None]) + rgb(COL['mist']) * mist[..., None]
PX, PZ = np.meshgrid(px, pz)
off = np.maximum.reduce([L['play'][0] - PX, PX - L['play'][1], L['play'][2] - PZ, PZ - L['play'][3]])      # metres outside where she can walk
wash = sm(-0.5, 2.5, off)[..., None] * 0.6
img = img * (1 - wash) + rgb(COL['beyond']) * wash
canvas = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('RGBA')

# ---- drawing on it: everything else is shapes, in metres
K = PPM * SS
P = lambda x, z: ((x - X0) * K, (z - Z0) * K)
layer = lambda: Image.new('RGBA', canvas.size, (0, 0, 0, 0))


def stroke(d, pts, width, fill):
    """a line of that width (metres) with round ends and joints"""
    q = [P(*p) for p in pts]; w = max(1, int(round(width * K)))
    d.line(q, fill=fill, width=w, joint='curve')
    for x, y in (q[0], q[-1]): d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=fill)


def box(x, z, w, l, yaw, lx0=-0.5, lx1=0.5, lz0=-0.5, lz1=0.5):
    """the corners of a rectangle w across (its own x) and l along (its own z), turned as the game turns a house: its z toward (sin yaw, cos yaw)"""
    c, s = math.cos(yaw), math.sin(yaw)
    return [P(x + a * w * c + b * l * s, z - a * w * s + b * l * c) for a, b in [(lx0, lz0), (lx1, lz0), (lx1, lz1), (lx0, lz1)]]


def catmull(pts, step=1.0):
    """the way through its points as the game lays it: a smooth curve"""
    out = []; g = lambda i: pts[min(len(pts) - 1, max(0, i))]
    for i in range(len(pts) - 1):
        a, b, c, d = g(i - 1), g(i), g(i + 1), g(i + 2); n = max(2, int(math.hypot(c[0] - b[0], c[1] - b[1]) / step))
        for k in range(n):
            t = k / n; out.append(tuple(0.5 * ((2 * b[j]) + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t ** 3) for j in (0, 1)))
    return out + [tuple(pts[-1])]


# ---- 3. the water
d = ImageDraw.Draw(canvas)
for grow, part, colour in ((0.35, 1.0, COL['water_edge']), (0.0, 1.0, COL['water']), (0.0, 0.45, COL['water_mid'])):      # its bank's line, the water, its pale middle
    for rows in plan['brooks']:                                       # (a row: x, z, the water's height, half its width)
        for a, b in zip(rows, rows[1:]): stroke(d, [a[:2], b[:2]], (a[3] + b[3]) * part + 2 * grow, colour)
for f in plan['falls']:                                               # foam along the lip, and a streak down the way it falls
    c, s = math.cos(f['yaw']), math.sin(f['yaw']); half = f['width'] / 2
    stroke(d, [(f['x'] - c * half, f['z'] + s * half), (f['x'] + c * half, f['z'] - s * half)], 0.9, COL['foam'])
    stroke(d, [(f['x'], f['z']), (f['x'] + s * 1.6, f['z'] + c * 1.6)], max(0.8, half * 0.9), COL['foam'])

# ---- 4. ways, yards, fields, fences, bridges
before_ways = canvas.copy()                                           # (grass painted over a way by hand: the land as it was before the ways)
ways = [(catmull(p['points']), p['half']) for p in plan['paths']]
for grow, colour in ((0.3, COL['way_edge']), (0.0, COL['way'])):
    for pts, half in ways: stroke(d, pts, 2 * half + 2 * grow, colour)
    for x, z, r, *_ in plan['yards']:
        cx, cy = P(x, z); rr = (r + grow) * K; d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=colour)
# the ways painted by hand in the game (path-brush.js; kept in hill-village-paths.json and written into the plan as pathOps), in
# the order they were painted: a way drawn as the others are, grass by laying the land as it was before the ways back over
for o in plan.get('pathOps', []):
    pts = catmull(o['pts']) if len(o['pts']) > 1 else [tuple(o['pts'][0]), (o['pts'][0][0] + 0.3, o['pts'][0][1])]
    if o['k'] == 'way':
        for grow, colour in ((0.3, COL['way_edge']), (0.0, COL['way'])): stroke(d, pts, 2 * o['half'] + 2 * grow, colour)
    else:
        mask = Image.new('L', canvas.size, 0); stroke(ImageDraw.Draw(mask), pts, 2 * o['r'], 255)
        canvas.paste(before_ways, (0, 0), mask); d = ImageDraw.Draw(canvas)
for f in plan['fields']:
    d.polygon(box(f['x'], f['z'], f['w'], f['d'], f['yaw']), fill=COL['soil'])
    n = max(3, int(f['d'] / 1.1))
    for k in range(n):                                                # its rows, along its own x
        t = -0.5 + (k + 0.5) / n; c, s = math.cos(f['yaw']), math.sin(f['yaw'])
        a, b = (f['x'] - 0.46 * f['w'] * c + t * f['d'] * s, f['z'] + 0.46 * f['w'] * s + t * f['d'] * c), (f['x'] + 0.46 * f['w'] * c + t * f['d'] * s, f['z'] - 0.46 * f['w'] * s + t * f['d'] * c)
        stroke(d, [a, b], 0.55, COL['crop'].get(f['crop'], '#86c060'))
for f in plan['fences']:
    pts = f['points'] + f['points'][:1]
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        if i == f.get('gate'):                                        # a gap for the gate, in the middle of that side
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); u = np.array(b) - np.array(a); u = u / np.linalg.norm(u) * 1.1
            stroke(d, [a, (mid[0] - u[0], mid[1] - u[1])], 0.4, COL['fence']); stroke(d, [(mid[0] + u[0], mid[1] + u[1]), b], 0.4, COL['fence'])
        else: stroke(d, [a, b], 0.4, COL['fence'])
br = plan['bridge']                                                   # (the bridges lie along their own x: toward (cos yaw, -sin yaw))
for b, wide, fill, edge in [(br, 3.4, COL['stone'], COL['stone_edge'])] + [(q, 2.3, COL['plank'], COL['fence']) for q in [plan['plank']] + plan.get('planks', [])]:
    c, s = math.cos(b['yaw']), math.sin(b['yaw']); a, e = (b['x'] - c * b['length'] / 2, b['z'] + s * b['length'] / 2), (b['x'] + c * b['length'] / 2, b['z'] - s * b['length'] / 2)
    d.line([P(*a), P(*e)], fill=edge, width=int((wide + 0.5) * K)); d.line([P(*a), P(*e)], fill=fill, width=int(wide * K))

# ---- shadows of what stands up (one soft layer, laid under the things themselves)
sh = layer(); ds = ImageDraw.Draw(sh)
inside = lambda x, z: X0 - 3 < x < X1 + 3 and Z0 - 3 < z < Z1 + 3
plants = [p for p in plan['plants'] if p[0] in COL['tree'] and inside(p[1], p[2])]
for b in plan['buildings']:
    if b['kind'] == 'house':
        w, l = b['spec']['w'] + 1.0, b['spec']['l'] + 0.8; o = 0.5 + b['spec'].get('floors', 1) * 0.6
        ds.polygon(box(b['x'] + o, b['z'] + o, w, l, b['yaw']), fill=COL['shadow'])
for kind, x, z, scale, *_ in plants:
    r = COL['tree_r'][kind] * scale * K; cx, cy = P(x + 0.7 * scale, z + 0.7 * scale); ds.ellipse([cx - r, cy - r, cx + r, cy + r], fill=COL['shadow'])
canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(K * 0.35)))
d = ImageDraw.Draw(canvas)

# ---- 5. the houses, the well, the sails
for b in plan['buildings']:
    if b['kind'] == 'house':
        w, l = b['spec']['w'] + 1.0, b['spec']['l'] + 0.8; ew = max(1, int(0.22 * K))
        if b['spec'].get('tower'):                                    # a tower's roof: four slopes to a point
            q = box(b['x'], b['z'], w, l, b['yaw']); mid = P(b['x'], b['z'])
            for i, shade in enumerate(('roof_lit', 'roof_dark', 'roof_dark', 'roof_lit')): d.polygon([q[i], q[(i + 1) % 4], mid], fill=COL[shade])
            d.line(q + q[:1], fill=COL['roof_edge'], width=ew, joint='curve')
            for c_ in q: d.line([c_, mid], fill=COL['roof_edge'], width=max(1, ew // 2))
        else:                                                         # a ridge along its own z: one side in the light, one out of it
            west_lit = math.cos(b['yaw']) > math.sin(b['yaw'])       # (its -x side faces (-cos yaw, sin yaw): is that toward the north-west, where the light is?)
            d.polygon(box(b['x'], b['z'], w, l, b['yaw'], -0.5, 0.0), fill=COL['roof_lit' if west_lit else 'roof_dark'])
            d.polygon(box(b['x'], b['z'], w, l, b['yaw'], 0.0, 0.5), fill=COL['roof_dark' if west_lit else 'roof_lit'])
            q = box(b['x'], b['z'], w, l, b['yaw']); d.line(q + q[:1], fill=COL['roof_edge'], width=ew, joint='curve')
            r0, r1 = box(b['x'], b['z'], w, l, b['yaw'], 0.0, 0.0)[0], box(b['x'], b['z'], w, l, b['yaw'], 0.0, 0.0)[2]
            d.line([r0, r1], fill=COL['roof_edge'], width=max(1, ew // 2))
    elif b['kind'] == 'well':
        cx, cy = P(b['x'], b['z']); r = 1.2 * K
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=COL['stone'], outline=COL['stone_edge'], width=max(1, int(0.2 * K)))
        d.ellipse([cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5], fill=COL['water'])
for b in plan['buildings']:
    if b['kind'] == 'sails':                                          # the windmill's sails: a cross before the tower's face
        fx, fz = math.sin(b['yaw']), math.cos(b['yaw']); hx, hz = b['x'] + fx * b['out'], b['z'] + fz * b['out']; r = b['span'] / 2
        for wdt, colour in ((1.5, COL['sail_edge']), (1.0, COL['sail'])):      # (seen from above, sails that turn before a wall are a bar along it)
            stroke(d, [(hx - fz * r, hz + fx * r), (hx + fz * r, hz - fx * r)], wdt, colour)

# ---- 6. rocks, bushes, trees
for kind, x, z, scale, *_ in plan.get('rocks', []):
    if not inside(x, z): continue
    cx, cy = P(x, z); r = 0.8 * scale * K
    d.ellipse([cx - r, cy - r * 0.8, cx + r, cy + r * 0.8], fill=COL['rock'], outline=COL['rock_edge'], width=max(1, int(0.15 * K)))
for kind, x, z, scale, *_ in sorted(plants, key=lambda p: (p[0] != 'bush', p[2])):
    dark, lit = COL['tree'][kind]; r = COL['tree_r'][kind] * scale * K; cx, cy = P(x, z)
    edge = tuple(int(v * 0.72) for v in rgb(dark))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dark, outline=edge, width=max(1, int(0.14 * K)))
    d.ellipse([cx - r * 0.72, cy - r * 0.72, cx + r * 0.25, cy + r * 0.25], fill=lit)      # the light on its crown, from the north-west
for b in plan['buildings']:
    if b['kind'] == 'tree':                                           # the great tree
        dark, lit = COL['tree']['oak']; r = 2.6 * b.get('scale', 2) * K; cx, cy = P(b['x'], b['z'])
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dark, outline=tuple(int(v * 0.72) for v in rgb(dark)), width=max(1, int(0.2 * K)))
        d.ellipse([cx - r * 0.75, cy - r * 0.75, cx + r * 0.2, cy + r * 0.2], fill=lit)

OUT.mkdir(parents=True, exist_ok=True)
final = canvas.convert('RGB').resize((W, Hh), Image.LANCZOS)
final.save(OUT / 'hill-village-map.webp', quality=88, method=6)
(OUT / 'hill-village-map.json').write_text(json.dumps({'file': 'hill-village-map.webp', 'x0': X0, 'z0': Z0, 'x1': X1, 'z1': Z1, 'width': W, 'height': Hh, 'play': L['play']}) + '\n')
print(f"hill-village-map.webp: {W} x {Hh} px, {X1 - X0:.0f} x {Z1 - Z0:.0f} m ({PPM} px to a metre), {(OUT / 'hill-village-map.webp').stat().st_size // 1024} kB; "
      f"{len(plan['brooks'])} stretches of water, {len(ways)} ways, {sum(b['kind'] == 'house' for b in plan['buildings'])} houses, {len(plants)} trees and bushes")
