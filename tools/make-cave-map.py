# make-cave-map.py  —  the forest hall's map (the dungeon under the waterfall cliff, room ③), as a game shows one: the hall
# seen from straight above, painted the way the hill village's map is (tools/make-hill-village-map.py), in a cave's tones
#
# Asked for on 28 Nov 2026: "ทำแผนที่แบบ hill village ก่อนได้ไหม จะได้เห็นว่าเดินไปไหน". Reads what tools/make-cave-hall.py
# baked (assets/caves/cave-hall.bin + .json: the floor and roof over every spot, what lies there, the light in the air, the
# trees, crystals, the pool, the ways closed by crystals) and paints the map from it, so the map is always the hall as it is:
# run this after that tool. Writes assets/maps/cave-hall-map.webp (north, the game's -z, at the top) and cave-hall-map.json
# (the part of the world the picture covers: game-map.js puts her and the places on it, as it does in the hill village).
#
# How it is painted, from the bottom up:
#   1. the rock round the hall, dark; the hall's floor in moss, paler the higher a level stands (the forest floor, the tier,
#      the balcony, the arm), lit from the north-west so every level's edge shows; its faces in rock, lit or in shade;
#   2. what is no floor of hers inside the hall (the walls' feet, the columns, the boulders), a darker rock; the hall's edge;
#   3. the earth of the ways she walks, the sand round the pool, the fallen leaves under the trees (the bake's own paint);
#   4. the pool, its bank, its pale middle; the patch the sun falls on through the crack, warm;
#   5. bushes and trees (a shadow, a crown, a light on it), the crystals, the crystals across the ways in and on.
#
#   python3 tools/make-cave-map.py            (Termux: pip install numpy scipy pillow)
#   python3 tools/make-cave-map.py fang-hall  the fang hall's (room ①, tools/make-fang-hall.py): assets/maps/fang-hall-map.*,
#                                             its floor bare stone (moss where the daylight or a crystal's glow reaches), the
#                                             daylight at the mouth, the stalagmites, the curtain of the fall at the ledge
#
# To change its look: PPM (pixels to a metre), MARGIN (rock shown round the hall), COL.
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'assets/caves', ROOT / 'assets/maps'
HALL = sys.argv[1] if len(sys.argv) > 1 else 'cave-hall'
NAME = HALL + '-map'
PPM, MARGIN, SS = 10, 3.0, 2                       # pixels to a metre; metres of rock shown round the hall; drawn this much larger, then made small
COL = {
    'rock_out': '#2b3940', 'rock_out2': '#36474f', 'edge': '#18232a', 'wall_in': '#56666c',
    'floor_low': '#5c8c40', 'floor_high': '#b5cd72', 'face_dark': '#6b5d4b', 'face_lit': '#c9b48f',
    'earth': '#b48b54', 'sand': '#e2cf94', 'leaves': '#8d6b3a',
    'water': '#4fb5de', 'water_mid': '#93dbf2', 'water_edge': '#2c83b3', 'sun': '#fff2b0',
    'crystal': '#6af3e2', 'crystal_edge': '#17837b', 'gate': '#f2fdff',
    'tree': {'oak': ('#5fa63c', '#8fcb52'), 'broadleaf': ('#6db340', '#9bd45a'), 'birch': ('#86c24a', '#b4dd66'), 'bush': ('#4f9a3c', '#7fbf4e'),
             'sapling': ('#78bb44', '#a5d75f')},
    'tree_r': {'oak': 2.5, 'broadleaf': 2.3, 'birch': 1.5, 'bush': 0.8, 'sapling': 1.2}, 'shadow': (10, 20, 15, 90),
}
if HALL == 'fang-hall':                            # bare stone underfoot; the paint's third: moss; the daylight at the mouth
    COL.update({'floor_low': '#6f7e86', 'floor_high': '#b9c2c2', 'leaves': '#6e9a48', 'sun': '#eaf6ff', 'rock_out': '#26313a', 'rock_out2': '#303c46'})
rgb = lambda c: np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float)
sm = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))

J = json.loads((SRC / f'{HALL}.json').read_text())
B = (SRC / f'{HALL}.bin').read_bytes()
F = J['bin']['floor']; nx, nz, cell, fx0, fz0 = F['nx'], F['nz'], F['cell'], F['x0'], F['z0']
fl = np.frombuffer(B, '<i2', nx * nz, F['floor']).reshape(nx, nz).astype(float)
ce = np.frombuffer(B, '<i2', nx * nz, F['ceil']).reshape(nx, nz).astype(float)
paint = np.frombuffer(B, np.uint8, nx * nz * 4, F['paint']).reshape(nx, nz, 4).astype(float) / 255
air = fl != -32768
fl = np.where(air, fl / 100, np.nan); ce = np.where(air, ce / 100, np.nan)
walk = air & (ce - np.nan_to_num(fl) >= 2.0) & (paint[..., 3] < 0.8)        # where she may stand (cave-level.js' own rule)
V = J['bin']['volume']                                                        # the light in the air: its last channel, the sun
vol = np.frombuffer(B, np.uint8, V['nx'] * V['ny'] * V['nz'] * 4, V['data']).reshape(V['nz'], V['ny'], V['nx'], 4)

# the picture's frame: the hall (every spot of air) and some rock round it
ii, kk = np.where(air)
X0, X1 = fx0 + ii.min() * cell - MARGIN, fx0 + ii.max() * cell + MARGIN
Z0, Z1 = fz0 + kk.min() * cell - MARGIN, fz0 + kk.max() * cell + MARGIN
W, Hh = int(round((X1 - X0) * PPM)), int(round((Z1 - Z0) * PPM))
X1, Z1 = X0 + W / PPM, Z0 + Hh / PPM
K = PPM * SS
px = X0 + (np.arange(W * SS) + 0.5) / K; pz = Z0 + (np.arange(Hh * SS) + 0.5) / K
PX, PZ = np.meshgrid(px, pz)                                                  # (rows: z, north at the top)
gi, gk = (PX - fx0) / cell, (PZ - fz0) / cell
near = lambda A: A[np.clip(np.round(gi).astype(int), 0, nx - 1), np.clip(np.round(gk).astype(int), 0, nz - 1)]
smooth = lambda A, fill: ndi.map_coordinates(np.where(np.isnan(A), fill, A), [gi, gk], order=1, mode='nearest')

# ---- 1. the rock round the hall, the floor by its height, its faces
rng = np.random.default_rng(7)
drift = ndi.zoom(rng.random((Hh * SS // 40 + 3, W * SS // 40 + 3)), 40, order=3)[:Hh * SS, :W * SS]
h = smooth(fl, 0.0)                                                           # (the floor's height; in the rock, 0: painted over below)
m = 1 / K
dz, dx = np.gradient(ndi.gaussian_filter(h, 1.4), m)
slope = np.hypot(dx, dz)
light = np.clip(1.0 + (dx * 0.62 + dz * 0.62) * 0.5, 0.55, 1.35)              # lit from the north-west: a face that falls toward the south-east is in shade
high = sm(-1.0, 12.0, h) if HALL != 'fang-hall' else sm(-11.5, -6.5, h)
img = rgb(COL['floor_low']) * (1 - high[..., None]) + rgb(COL['floor_high']) * high[..., None]
img *= (0.94 + 0.12 * drift)[..., None]
face = sm(0.6, 1.1, slope)[..., None]
img = img * (1 - face) + (rgb(COL['face_dark']) + (rgb(COL['face_lit']) - rgb(COL['face_dark'])) * sm(0.6, 1.3, light)[..., None]) * face
img *= (0.84 + 0.16 * np.clip(light, 0.6, 1.2) / 1.2)[..., None]
# ---- 3. what lies on the floor: earth, sand, fallen leaves (the bake's own paint), not on the faces
P = np.stack([ndi.map_coordinates(paint[..., c], [gi, gk], order=1, mode='nearest') for c in range(3)], -1)
for c, key, k in ((2, 'leaves', 0.55), (0, 'earth', 0.85), (1, 'sand', 0.9)):
    a = (sm(0.3, 0.6, P[..., c]) * k * (1 - face[..., 0]))[..., None]
    img = img * (1 - a) + rgb(COL[key]) * (0.9 + 0.1 * drift[..., None]) * a
# ---- 4. the sun's patch: where it falls on the floor through the crack (the light in the air just over the floor)
vx = np.clip((PX - V['x0']) / V['cell'], 0, V['nx'] - 1); vz = np.clip((PZ - V['z0']) / V['cell'], 0, V['nz'] - 1)
vy = np.clip((h + 0.8 - V['y0']) / V['cell'], 0, V['ny'] - 1)
sun = ndi.map_coordinates(vol[..., 3].astype(float) / 255, [vz, vy, vx], order=1, mode='nearest')
sun = ndi.gaussian_filter(sun, 3) * (1 - face[..., 0])
glow = (sm(0.08, 0.6, sun) * 0.55)[..., None]
img = img * (1 - glow) + rgb(COL['sun']) * glow
# ---- 2. no floor of hers inside the hall, and the rock outside it; the hall's edge
soft = lambda M: ndi.gaussian_filter(ndi.map_coordinates(M.astype(float), [gi, gk], order=1, mode='nearest'), 1.2 * SS)      # (a mask with smooth edges, not the grid's steps)
inside = soft(air) > 0.5
walkable = ndi.binary_opening(soft(walk) > 0.5, iterations=SS)
blocked = inside & ~walkable
img[blocked] = rgb(COL['wall_in']) * (0.85 + 0.25 * drift[blocked][:, None]) * np.clip(light[blocked], 0.7, 1.2)[:, None]
out = ~inside
img[out] = (rgb(COL['rock_out']) * (1 - drift[out][:, None]) + rgb(COL['rock_out2']) * drift[out][:, None])
edge = ndi.binary_dilation(walkable, iterations=2 * SS) & ~walkable
img[edge & ~walkable] = img[edge & ~walkable] * 0.55 + rgb(COL['edge']) * 0.45
canvas = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('RGBA')
d = ImageDraw.Draw(canvas)
Pt = lambda x, z: ((x - X0) * K, (z - Z0) * K)

# ---- 4. the pool: the floor under its level, its bank, the water, a pale middle
pool = J['pool']
wet = (h < pool['level'] - 0.02) & (np.hypot(PX - pool['c'][0], PZ - pool['c'][1]) < pool['r'] + 2.5)
lab, _ = ndi.label(wet)
mid = lab[int((pool['c'][1] - Z0) * K), int((pool['c'][0] - X0) * K)]
basin = lab == mid if mid else wet
for grow, colour in ((0.35, COL['water_edge']), (0.0, COL['water']), (-1.6, COL['water_mid'])):
    n = int(round(abs(grow) * K)); msk = ndi.binary_dilation(basin, iterations=n) if grow > 0 else ndi.binary_erosion(basin, iterations=n) if grow < 0 else basin
    canvas.paste(colour, (0, 0), Image.fromarray((msk * 255).astype(np.uint8)))
d = ImageDraw.Draw(canvas)
if 'trickle' in J:
    t = J['trickle']['bottom']; cx, cy = Pt(t[0], t[2]); r = 0.6 * K
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill='#ffffff')               # foam where the thin fall from the crack lands
if 'curtain' in J:                                                            # the curtain of the fall, at the ledge's edge
    c = J['curtain']; foot = c['rows'][-1]; ax, az = c['across'][0], c['across'][2]
    a_, b_ = Pt(foot[0] - ax * c['half'], foot[2] - az * c['half']), Pt(foot[0] + ax * c['half'], foot[2] + az * c['half'])
    d.line([a_, b_], fill='#f4fbff', width=int(0.9 * K))
    d.line([a_, b_], fill='#b9e3f5', width=int(0.35 * K))

# ---- 5. bushes and trees (shadows first, all of them), the crystals, the ways closed
shade = Image.new('RGBA', canvas.size, (0, 0, 0, 0)); ds = ImageDraw.Draw(shade)
plants = [(t['type'] if t['kind'] == 'tree' else 'bush', t['x'], t['z'], t['scale'] * (1.25 if t.get('great') else 1.0)) for t in J['trees']]
for kind, x, z, scale in plants:
    r = COL['tree_r'].get(kind, 2.0) * scale * K; cx, cy = Pt(x + 0.7 * scale, z + 0.7 * scale)
    ds.ellipse([cx - r, cy - r, cx + r, cy + r], fill=COL['shadow'])
canvas = Image.alpha_composite(canvas, shade); d = ImageDraw.Draw(canvas)
for kind, x, z, scale in sorted(plants, key=lambda p: (p[0] != 'bush', p[2])):
    dark, lit = COL['tree'].get(kind, COL['tree']['broadleaf']); r = COL['tree_r'].get(kind, 2.0) * scale * K; cx, cy = Pt(x, z)
    edgec = tuple(int(v * 0.72) for v in rgb(dark))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dark, outline=edgec, width=max(1, int(0.14 * K)))
    d.ellipse([cx - r * 0.72, cy - r * 0.72, cx + r * 0.25, cy + r * 0.25], fill=lit)      # the light on its crown, from the north-west


def diamond(x, z, s, fill, outline):
    cx, cy = Pt(x, z); a, b = s * 0.55 * K, s * 0.9 * K
    d.polygon([(cx, cy - b), (cx + a, cy), (cx, cy + b), (cx - a, cy)], fill=fill, outline=outline)


for f in J.get('fangs', []):                                                  # the stalagmites (fangs rising from the floor)
    if not f.get('up'): continue
    cx, cy = Pt(f['x'], f['z']); r = max(0.35, f['r'] * 0.9) * K
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill='#d9d2c2', outline='#5b5a55', width=max(1, int(0.12 * K)))
    d.ellipse([cx - r * 0.45, cy - r * 0.45, cx + r * 0.1, cy + r * 0.1], fill='#f4f0e6')
for c in J['crystals']:
    if c['kind'] == 'float': continue
    x, z = c['p'][0], c['p'][2]
    if not (X0 < x < X1 and Z0 < z < Z1): continue
    diamond(x, z, 0.55 + 0.25 * c['size'], COL['crystal'], COL['crystal_edge'])
for x, z, r in J.get('gates', []):                                             # the crystals across the ways in and on: closed for now
    for ox, oz in ((-0.6, -0.4), (0.5, 0.3), (0.0, 0.0)):
        diamond(x + ox, z + oz, 1.0, COL['gate'], COL['crystal_edge'])

OUT.mkdir(parents=True, exist_ok=True)
final = canvas.convert('RGB').resize((W, Hh), Image.LANCZOS)
final.save(OUT / f'{NAME}.webp', quality=88, method=6)
(OUT / f'{NAME}.json').write_text(json.dumps({'file': f'{NAME}.webp', 'x0': round(X0, 3), 'z0': round(Z0, 3), 'x1': round(X1, 3), 'z1': round(Z1, 3), 'width': W, 'height': Hh}))
print(f'{NAME}.webp: {W} x {Hh} px, {X1 - X0:.0f} x {Z1 - Z0:.0f} m ({PPM} px to a metre), {(OUT / f"{NAME}.webp").stat().st_size // 1024} kB')
