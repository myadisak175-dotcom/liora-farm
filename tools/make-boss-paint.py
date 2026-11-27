#!/usr/bin/env python3
# make-boss-paint.py  —  the boss hall's cut stone, painted in the hand of the cliffs (tools/make-cliff-paint.py): flat dabs
# of one tone each, edges soft and wet, a few thin washes over them, the paper's grain. Cold slate, for a hall lit by blue fire.
#
# Writes (both seamless both ways, 1024 x 1024 for 4 x 4 m, read by boss-hall.js):
#   assets/ground/boss-blocks-paint.webp   the walls' masonry: courses 0.8 m high, blocks 1.1 to 2.4 m long, each block a
#                                          tone of its own broken into two or three planes, lit along its top, a shadow
#                                          under it, a chipped corner here and there, a crack now and then, dark joints
#   assets/ground/boss-slabs-paint.webp    the floor: slabs 2 m square, polished dark stone, one tone each with a soft sheen
#                                          across it, worn paler where feet went, thin cracks, a chipped corner, dark joints
#
#   python3 tools/make-boss-paint.py            (numpy, scipy, pillow)
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

S = 1024                      # pixels a side
M = S / 4.0                   # pixels a metre (the picture is 4 m a side)
OUT = Path(__file__).resolve().parent.parent / 'assets/ground'
yy, xx = np.mgrid[0:S, 0:S].astype(float)


def periodic(rng, g, octaves=3):
    out = np.zeros((S, S)); amp = 1.0; tot = 0.0
    for o in range(octaves):
        n = g * 2 ** o
        a = rng.random((n, n))
        out += amp * ndi.zoom(a, S / n, order=3, mode='grid-wrap', grid_mode=True); tot += amp; amp *= 0.5
    out /= tot
    return (out - out.min()) / (out.max() - out.min())


def palette(hexes):
    return np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in hexes], float) / 255


def colour(pal, t):
    t = np.clip(t, 0, 1) * (len(pal) - 1); i = np.minimum(np.asarray(t).astype(int), len(pal) - 2); f = (t - i)[..., None]
    return pal[i] * (1 - f) + pal[i + 1] * f


def planes(rng, n, stretch, wob):
    """dabs: the nearest of a scatter of points owns each spot (squeezed sideways so they come out long); seamless"""
    wx = (periodic(rng, 24, 2) - .5) * wob; wy = (periodic(rng, 24, 2) - .5) * wob * 0.6
    pts = np.stack([rng.random(n) * S, rng.random(n) * S], 1)
    tiles = np.concatenate([pts + [dx * S, dy * S] for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
    q = np.stack([(xx + wx).ravel() / stretch, (yy + wy).ravel()], 1)
    d, i = cKDTree(tiles * [1 / stretch, 1]).query(q, k=2)
    return (i[:, 0] % n).reshape(S, S), (d[:, 1] - d[:, 0]).reshape(S, S)


def washes(rng, canvas, pal, count, length, height, alpha, tone_of):
    edge = periodic(rng, 40, 3)
    for _ in range(count):
        cx, cy = rng.random() * S, rng.random() * S
        a, b = rng.uniform(*length) / 2, rng.uniform(*height) / 2
        th = rng.normal(0, 0.15)
        R = int(max(a, b) * 1.25) + 6
        ys = np.arange(int(cy) - R, int(cy) + R + 1); xs = np.arange(int(cx) - R, int(cx) + R + 1)
        iy, ix = np.ix_(ys % S, xs % S)
        dy, dx = np.meshgrid(ys - cy, xs - cx, indexing='ij')
        u = (dx * np.cos(th) + dy * np.sin(th)) / a; v = (-dx * np.sin(th) + dy * np.cos(th)) / b
        d = (np.abs(u) ** 3 + np.abs(v) ** 3) ** (1 / 3) + (edge[iy, ix] - .5) * 0.5
        wet = np.clip((1.0 - d) / 0.2, 0, 1); wet = wet * wet * (3 - 2 * wet)
        al = wet * rng.uniform(*alpha)
        col = colour(pal, np.array(tone_of(cx, cy) + rng.normal(0, 0.16)))
        canvas[iy, ix] = canvas[iy, ix] * (1 - al[..., None]) + col * al[..., None]


def crack(rng, mask, x, y, steps, ang):
    """a thin wandering line (a crack) into mask"""
    for k in range(steps):
        ang += rng.normal(0, 0.13)
        x += np.cos(ang) * 2.5; y += np.sin(ang) * 2.5
        ix, iy = int(x) % S, int(y) % S
        mask[iy, ix] = 1
        if k > 6 and rng.random() < 0.025:                      # a branch now and then, shorter
            crack(rng, mask, x, y, int(steps * 0.3), ang + rng.choice([-1, 1]) * rng.uniform(0.5, 1.0))


def soft(img, s):
    return np.stack([ndi.gaussian_filter(img[..., k], s, mode='wrap') for k in range(3)], -1) if img.ndim == 3 else ndi.gaussian_filter(img, s, mode='wrap')


def grain(rng, canvas, amount=0.05):
    g = ndi.zoom(rng.random((S // 2, S // 2)), 2, order=1, mode='grid-wrap', grid_mode=True)
    return canvas * (1 - amount / 2 + amount * g)[..., None]


def save(canvas, name):
    p = OUT / name
    Image.fromarray((np.clip(canvas, 0, 1) * 255).round().astype(np.uint8)).save(p, 'WEBP', quality=88, method=6)
    print(f'{name}: {S} x {S}, {p.stat().st_size / 1e3:.0f} kB')


# ======================================================================== the walls' masonry
def blocks():
    rng = np.random.default_rng(5)
    pal = palette(['#262a36', '#2f3443', '#383f51', '#434b60', '#4f5870', '#5d6782'])
    ROWS = 5                                  # courses of 0.8 m in 4 m
    rowH = S / ROWS
    JOINT = 0.045 * M                         # the joints' width (px)
    bid = np.zeros((S, S), int)               # which block owns each spot
    lx = np.zeros((S, S)); ly = np.zeros((S, S))       # where in its block (px from its left and top edge)
    bw = np.zeros((S, S))                     # the block's length (px)
    nb = 0
    edges = []
    for r in range(ROWS):
        # lengths 1.1 .. 2.4 m that fill the 4 m row exactly (it repeats sideways)
        while True:
            ls = []
            while sum(ls) < 4.0 - 1.1:
                ls.append(rng.uniform(1.1, 2.4))
            last = 4.0 - sum(ls)
            if 1.0 <= last <= 2.5:
                ls.append(last); break
        off = rng.uniform(0, 4.0)
        y0, y1 = int(round(r * rowH)), int(round((r + 1) * rowH))
        x = off
        for L in ls:
            a = x * M
            for k in range(int(L * M) + 1):
                xi = int(a + k) % S
                bid[y0:y1, xi] = nb
                lx[y0:y1, xi] = k
                bw[y0:y1, xi] = L * M
            ly[y0:y1, :] = (np.arange(y0, y1) - y0)[:, None]
            edges.append((nb, r, x, L))
            nb += 1
            x += L
    # each block: a tone, and inside it two or three planes of the tones beside it
    btone = np.clip(rng.normal(0.5, 0.17, nb), 0.12, 0.92)
    cell, rim = planes(rng, 520, 2.6, 30)
    ptone = rng.normal(0, 0.075, 520)
    tone = btone[bid] + ptone[cell]
    tone = np.round(np.clip(tone, 0, 1) * (len(pal) - 1)) / (len(pal) - 1)
    canvas = colour(pal, tone)
    canvas *= (1 - 0.03 * np.clip(1 - rim / 5.0, 0, 1))[..., None]
    # lit along each block's top, a shadow under it, the ends a little darker
    hh = rowH - JOINT
    top = np.clip(1 - (ly - JOINT * 0.5) / (0.07 * M), 0, 1) * (ly > JOINT * 0.5)
    under = np.clip((ly - (hh - 0.09 * M)) / (0.09 * M), 0, 1)
    ends = np.clip(1 - np.minimum(lx, bw - lx) / (0.08 * M), 0, 1)
    canvas = canvas * (1 + 0.20 * top[..., None]) * (1 - 0.30 * under[..., None]) * (1 - 0.12 * ends[..., None])
    canvas = soft(canvas, 1.6)
    # chipped corners: a bite out of a block's corner, in the joints' dark with a pale rim
    chip = np.zeros((S, S))
    for (b, r, x, L) in edges:
        if rng.random() < 0.45:
            corner = rng.integers(4)
            cx = (x + (0 if corner % 2 == 0 else L)) * M
            cy = (r + (0 if corner < 2 else 1)) * rowH
            rr = rng.uniform(0.07, 0.16) * M
            d = np.hypot(((xx - cx + S / 2) % S) - S / 2, ((yy - cy + S / 2) % S) - S / 2)
            wob = 1 + 0.35 * np.sin(np.arctan2(yy - cy, xx - cx) * 5 + rng.random() * 6)
            chip = np.maximum(chip, (d < rr * wob) & (bid == b))
    chip = ndi.gaussian_filter(chip.astype(float), 1.2, mode='wrap')
    canvas = canvas * (1 - 0.45 * chip[..., None]) + pal[4] * 0.25 * np.clip(chip * (1 - chip) * 4, 0, 1)[..., None]
    # a few cracks
    cm = np.zeros((S, S))
    for _ in range(9):
        crack(rng, cm, rng.random() * S, rng.random() * S, int(rng.integers(30, 80)), rng.uniform(0, 6.28))
    cm = np.clip(ndi.gaussian_filter(cm, 0.7, mode='wrap') * 2.2, 0, 1)
    canvas *= (1 - 0.42 * cm)[..., None]
    # the joints
    jy = np.minimum(ly, rowH - ly)
    jx = np.minimum(lx, bw - lx)
    joint = np.clip(1 - (np.minimum(jy, jx) - JOINT * 0.45) / (JOINT * 0.6), 0, 1)
    canvas = canvas * (1 - joint[..., None]) + pal[0] * 0.55 * joint[..., None]
    # washes and grain
    washes(rng, canvas, pal, 55, (160, 420), (30, 90), (0.10, 0.22), lambda cx, cy: btone[bid[int(cy) % S, int(cx) % S]])
    canvas = grain(rng, canvas, 0.06)
    save(canvas, 'boss-blocks-paint.webp')


# ======================================================================== the floor's slabs
def slabs():
    rng = np.random.default_rng(9)
    pal = palette(['#191c24', '#20242e', '#282d39', '#313745', '#3b4253', '#485066'])
    SL = 2.0 * M                              # a slab
    JOINT = 0.035 * M
    sx, sy = (xx // SL).astype(int), (yy // SL).astype(int)
    sid = sy * 2 + sx
    lx, ly = xx - sx * SL, yy - sy * SL
    stone = np.clip(rng.normal(0.48, 0.14, 4), 0.2, 0.8)
    cell, rim = planes(rng, 300, 1.8, 40)
    tone = stone[sid] + rng.normal(0, 0.08, 300)[cell]
    tone = np.round(np.clip(tone, 0, 1) * (len(pal) - 1) * 2) / ((len(pal) - 1) * 2)      # (half steps: polished, smoother)
    canvas = colour(pal, tone)
    canvas = soft(canvas, 2.4)
    # a soft sheen across each slab, as polished stone takes the light
    ang = rng.uniform(0.5, 1.0, 4)[sid]
    u = (lx * np.cos(ang) + ly * np.sin(ang)) / SL
    sheen = np.exp(-((u - 0.55) / 0.22) ** 2) * 0.10
    canvas = canvas * (1 + sheen[..., None])
    # worn paler patches (where feet went), faint veins
    wear = periodic(rng, 6, 3)
    canvas = canvas * (1 + 0.10 * np.clip((wear - 0.55) / 0.3, 0, 1)[..., None])
    vein = periodic(rng, 10, 4)
    vl = np.exp(-((vein - 0.5) / 0.012) ** 2)
    canvas = canvas * (1 + 0.08 * vl[..., None])
    # bevels: lit along the top-left edges, shadowed along the bottom-right
    e1 = np.clip(1 - np.minimum(lx, ly) / (0.06 * M), 0, 1)
    e2 = np.clip(1 - np.minimum(SL - lx, SL - ly) / (0.06 * M), 0, 1)
    canvas = canvas * (1 + 0.16 * e1[..., None]) * (1 - 0.22 * e2[..., None])
    # cracks, chipped corners
    cm = np.zeros((S, S))
    for _ in range(7):
        crack(rng, cm, rng.random() * S, rng.random() * S, int(rng.integers(50, 130)), rng.uniform(0, 6.28))
    cm = np.clip(ndi.gaussian_filter(cm, 0.7, mode='wrap') * 2.2, 0, 1)
    canvas *= (1 - 0.4 * cm)[..., None]
    for _ in range(4):                                          # a bite out of a slab's edge here and there
        cx, cy = rng.integers(0, 2) * SL + rng.uniform(0.3, 1.7) * M * rng.integers(0, 2), rng.integers(0, 2) * SL
        if rng.random() < 0.5: cx, cy = cy, cx
        rr = rng.uniform(0.05, 0.1) * M
        d = np.hypot(((xx - cx + S / 2) % S) - S / 2, ((yy - cy + S / 2) % S) - S / 2)
        wob = 1 + 0.4 * np.sin(np.arctan2(yy - cy, xx - cx) * 4 + rng.random() * 6)
        ch = ndi.gaussian_filter((d < rr * wob).astype(float), 1.2, mode='wrap')
        canvas = canvas * (1 - 0.3 * ch[..., None])
    # the joints
    j = np.clip(1 - (np.minimum(np.minimum(lx, SL - lx), np.minimum(ly, SL - ly)) - JOINT * 0.4) / (JOINT * 0.6), 0, 1)
    canvas = canvas * (1 - j[..., None]) + pal[0] * 0.5 * j[..., None]
    washes(rng, canvas, pal, 30, (200, 520), (60, 160), (0.08, 0.16), lambda cx, cy: stone[sid[int(cy) % S, int(cx) % S]])
    canvas = grain(rng, canvas, 0.05)
    save(canvas, 'boss-slabs-paint.webp')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    blocks()
    slabs()
