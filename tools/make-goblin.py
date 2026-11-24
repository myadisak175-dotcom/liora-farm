#!/usr/bin/env python3
"""Make the goblin (assets/models/goblin.glb and goblin-anim.js) from the model and the front drawing the user sent.

The user sent (25 Nov 2026) an .fbx of 50,000 triangles with no UVs, no picture and no bones, and three drawings of it
(front, side, back). The three drawings do not agree (the back has no headband and a red hood, the side a brown headband);
the user chose the front one for the whole body ("ยึดด้านหน้าทั้งตัว"), so only the front drawing is read. What is done:

  1. The classes: which part of the sculpt is skin, hair, the cream cloth, the cape, the skirt, the rope, the bracers, the
     sack, the inner ear, the claws and tusks, the stone ring, the leather pouch. Seeds: the front drawing's colours (in
     zones of the picture, KMEANS_FAMILY and front_labels()), projected onto what the front of the sculpt shows of itself;
     points picked by hand on views of its back and sides (PICKS); the claws, toes and ankle wraps found by their shape.
     Then a random walk over the surface from the seeds, cheap to cross along a crease, and a graph cut (alpha expansion)
     of its faces that puts every class's edge on the cloth's edges.
  2. Fewer triangles: 8,000 (meshlab's quadric collapse; the face, hands and feet kept finer).
  3. UVs (xatlas; the face packed bigger, for its painted eyes), and the picture (1024 px): each texel's class read where a
     ray from the low surface meets the high one, in flat colours (PAL); specks cleaned; the drawing's red zigzags and its
     face (eyes, brows, nostrils, the mouth's line) laid on from the front; a soft AO; a faint painterly variation.
     Normals for the cel light: the sculpt's, smoothed over its surface.
  4. Bones with VRoid's names (the spine, arms, legs, no fingers) and an ear each (Goblin_L_Ear, Goblin_R_Ear), every bone
     turned no way in its rest pose, which is the pose it was sculpted in; weights by bone heat (Pinocchio), the ears only
     on the ears. It faces -Z, as VRoid models do.
  5. Its idle (goblin-anim.js): the library's Idle_Loop as character-anim.js has it, laid on the goblin's own stance as its
     motion about the clip's own average (x1.3).

Usage (from the repo folder; the .fbx and the drawing are not kept in the repo):
  pip install numpy scipy pillow scikit-image scikit-learn matplotlib trimesh embreex rtree xatlas pymeshlab PyMaxflow
  python3 tools/make-goblin.py goblin.fbx front.png
writes assets/models/goblin.glb and goblin-anim.js. Takes some minutes (embreex makes the rays quick; without it trimesh
casts them slowly). pymeshlab needs libOpenGL (Debian/Ubuntu: apt install libopengl0).
"""
import io, json, os, struct, sys, zlib
import numpy as np
from PIL import Image
from scipy import ndimage, optimize, sparse
from scipy.sparse.linalg import splu
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# ============================================================================ the sculpt
def read_fbx_mesh(path):
    """The one mesh of a binary FBX (positions and triangles)."""
    data = open(path, 'rb').read()
    assert data[:20] == b'Kaydara FBX Binary  ', 'not a binary FBX'
    big = struct.unpack_from('<I', data, 23)[0] >= 7500
    def node(off):
        if big: end, nprops, _ = struct.unpack_from('<QQQ', data, off); off += 24
        else: end, nprops, _ = struct.unpack_from('<III', data, off); off += 12
        nlen = data[off]; off += 1
        if end == 0: return None, off
        name = data[off:off+nlen].decode('ascii', 'replace'); off += nlen
        props = []
        for _ in range(nprops):
            t = chr(data[off]); off += 1
            if t in 'YCIFDL':
                fmt, size = {'Y': ('<h', 2), 'C': ('<B', 1), 'I': ('<i', 4), 'F': ('<f', 4), 'D': ('<d', 8), 'L': ('<q', 8)}[t]
                props.append(struct.unpack_from(fmt, data, off)[0]); off += size
            elif t in 'fdlib':
                n, enc, clen = struct.unpack_from('<III', data, off); off += 12
                raw = data[off:off+clen]; off += clen
                if enc == 1: raw = zlib.decompress(raw)
                props.append(np.frombuffer(raw, {'f': '<f4', 'd': '<f8', 'l': '<i8', 'i': '<i4', 'b': 'u1'}[t], n))
            elif t in 'SR':
                n = struct.unpack_from('<I', data, off)[0]; off += 4
                props.append(data[off:off+n]); off += n
            else: raise ValueError('bad FBX property ' + t)
        kids, nul = [], 25 if big else 13
        while off < end:
            if end - off == nul: off += nul; break
            c, off = node(off)
            if c is None: break
            kids.append(c)
        return {'name': name, 'props': props, 'kids': kids}, end
    off, top = 27, []
    while off < len(data):
        n, nxt = node(off)
        if n is None: break
        top.append(n); off = nxt
    objs = next(n for n in top if n['name'] == 'Objects')
    geo = next(c for c in objs['kids'] if c['name'] == 'Geometry')
    V = next(c for c in geo['kids'] if c['name'] == 'Vertices')['props'][0].reshape(-1, 3).astype(np.float64)
    I = next(c for c in geo['kids'] if c['name'] == 'PolygonVertexIndex')['props'][0].astype(np.int64)
    assert ((np.where(I < 0)[0] % 3) == 2).all(), 'only triangles are read'
    I = np.where(I < 0, -I - 1, I)
    return V, I.reshape(-1, 3)

def normals(V, F):
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    area = np.linalg.norm(fn, axis=1) * 0.5
    vn = np.zeros_like(V)
    for k in range(3): np.add.at(vn, F[:, k], fn)
    vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)
    return vn, fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12), area

def raster_ids(P2, Z, F, W, H):
    """Which triangle is nearest (largest Z) at each pixel centre; P2 in pixels (x right, y down)."""
    ids = np.full((H, W), -1, np.int32); zb = np.full((H, W), -np.inf)
    tri, tz = P2[F], Z[F]
    mn = np.maximum(np.floor(tri.min(1)).astype(int), 0); mx = np.ceil(tri.max(1)).astype(int)
    mx[:, 0] = np.minimum(mx[:, 0], W - 1); mx[:, 1] = np.minimum(mx[:, 1], H - 1)
    for t in range(len(F)):
        x0, y0 = mn[t]; x1, y1 = mx[t]
        if x1 < x0 or y1 < y0: continue
        X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = tri[t]
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12: continue
        l0 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / d
        l1 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / d
        l2 = 1 - l0 - l1
        inside = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
        if not inside.any(): continue
        z = l0 * tz[t, 0] + l1 * tz[t, 1] + l2 * tz[t, 2]
        sub = zb[y0:y1 + 1, x0:x1 + 1]
        better = inside & (z > sub)
        sub[better] = z[better]; ids[y0:y1 + 1, x0:x1 + 1][better] = t
    return ids, zb

def view_rot(yaw, elev=0.0):
    a, e = np.radians(yaw), np.radians(elev)
    c = np.array([np.sin(a) * np.cos(e), np.sin(e), np.cos(a) * np.cos(e)])
    right = np.cross([0, 1.0, 0], c); right /= np.linalg.norm(right)
    return np.stack([right, np.cross(c, right), c])

def render_view(V, F, yaw, elev=0.0, px=700, pad=0.04):
    """An orthographic view of the sculpt (yaw 0: from the front), its triangle at each pixel: for picking."""
    R = view_rot(yaw, elev); P = V @ R.T
    x0, x1, y0, y1 = P[:, 0].min() - pad, P[:, 0].max() + pad, P[:, 1].min() - pad, P[:, 1].max() + pad
    W, H = int((x1 - x0) * px) + 1, int((y1 - y0) * px) + 1
    ids, _ = raster_ids(np.stack([(P[:, 0] - x0) * px, (y1 - P[:, 1]) * px], 1), P[:, 2], F, W, H)
    return ids

# ============================================================================ the classes
CLASSES = ['skin', 'hair', 'cream', 'cape', 'skirt', 'rope', 'bracer', 'sack', 'ear', 'ivory', 'ring', 'leather']
CI = {c: i for i, c in enumerate(CLASSES)}
# the front drawing's colours in 24 clusters (k-means in Lab): each cluster's family is that of the nearest of these
KMEANS_FAMILY = [('#59493d', 'dbrown'), ('#beb65c', 'skin'), ('#8f6c50', 'brown'), ('#edcb98', 'cream'), ('#837b43', 'skin'),
                 ('#aa9a8e', 'grey'), ('#c29f76', 'tan'), ('#7f624b', 'brown'), ('#918748', 'skin'), ('#6a6544', 'hair'),
                 ('#4b4b38', 'hair'), ('#d8cdc3', 'grey'), ('#41382f', 'vdark'), ('#b67958', 'red'), ('#b5ac58', 'skin'),
                 ('#b88d5d', 'tan'), ('#a89c51', 'skin'), ('#6d5746', 'brown'), ('#a17a54', 'brown'), ('#d1956e', 'salmon'),
                 ('#e5bf86', 'cream'), ('#d3a972', 'tan'), ('#595337', 'hair'), ('#726b3f', 'skin2')]
# points picked by hand on views of the sculpt (render_view: [view, yaw, elev, px]), each [class, x, y, radius in px]
PICK_VIEWS = {'back': (180, 0, 700), 'left': (90, 0, 700), 'right': (270, 0, 700), 'front2': (0, 0, 1400)}
PICKS = {
    'back': [['hair', 190, 120, 25], ['hair', 215, 200, 15], ['hair', 160, 150, 15], ['hair', 250, 90, 15], ['hair', 240, 160, 12],
             ['hair', 130, 135, 10], ['hair', 268, 250, 8], ['hair', 262, 285, 6], ['skin', 450, 190, 15], ['skin', 500, 185, 8],
             ['skin', 400, 200, 10], ['skin', 90, 190, 15], ['skin', 130, 195, 10], ['skin', 60, 188, 8], ['skirt', 180, 540, 15],
             ['skirt', 240, 550, 12], ['skirt', 150, 560, 8], ['skirt', 420, 545, 8], ['leather', 340, 520, 20], ['leather', 310, 560, 10],
             ['leather', 380, 560, 10], ['rope', 175, 735, 10], ['rope', 360, 735, 10], ['skin', 195, 780, 10], ['skin', 375, 780, 10]],
    'left': [['hair', 240, 120, 18], ['hair', 290, 140, 15], ['hair', 330, 170, 10], ['hair', 220, 175, 10], ['hair', 270, 90, 15],
             ['skirt', 200, 560, 10], ['skirt', 240, 520, 10], ['leather', 262, 510, 10], ['rope', 200, 740, 10], ['skin', 175, 775, 8]],
    'right': [['leather', 136, 530, 12], ['leather', 156, 500, 10], ['rope', 216, 735, 10], ['skin', 206, 775, 8]],
    'front2': [['ivory', 470, 868, 11], ['ivory', 667, 864, 11]],
}

def hexrgb(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)

def front_clusters(img):
    from skimage import color
    from sklearn.cluster import KMeans
    bg = np.array([252, 246, 238.])
    fg = np.abs(img - bg).sum(-1) > 40
    lab = color.rgb2lab(img / 255.)
    km = KMeans(24, n_init=4, random_state=1).fit(lab[fg][::5])
    L = np.full(fg.shape, -1); L[fg] = km.predict(lab[fg])
    ref = color.rgb2lab(np.array([hexrgb(h) for h, _ in KMEANS_FAMILY])[None] / 255.)[0]
    fam_of = [KMEANS_FAMILY[np.argmin(np.linalg.norm(ref - c, axis=1))][1] for c in km.cluster_centers_]
    F = np.full(L.shape, '', dtype=object)
    for k, f in enumerate(fam_of): F[L == k] = f
    return L, F

def front_labels(F):
    """The front drawing's pixels as classes, by colour family and where on the drawing they are; and its red zigzags."""
    from matplotlib.path import Path
    H, W = F.shape; Y, X = np.mgrid[0:H, 0:W]
    lab = np.full(F.shape, -1, np.int32); red = np.zeros(F.shape, bool)
    def box(x0, x1, y0, y1): return (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)
    def poly(pts): return Path(pts).contains_points(np.stack([X.ravel(), Y.ravel()], 1)).reshape(H, W)
    def setl(m, c): lab[m] = CI[c]
    head = (Y < 455) | box(760, 960, 380, 485)
    knot = poly([(735, 205), (800, 170), (870, 215), (905, 255), (870, 300), (845, 380), (860, 470), (800, 490), (760, 440), (745, 330), (730, 260)])
    ears = head & ((X < 395) | (X > 805)) & (Y > 235) & (Y < 430) & ~knot
    eyes = box(492, 550, 276, 324) | box(652, 712, 276, 324)
    mouth = box(465, 735, 352, 428)
    band = (Y < 245) | knot
    setl(head & (F == 'hair'), 'hair')
    setl(head & ((F == 'skin') | (F == 'skin2')) & ~box(0, W, 0, 150), 'skin')
    setl(head & (F == 'cream') & ~mouth & band, 'cream')
    setl(head & (F == 'cream') & ~mouth & ~band & ~ears, 'skin')
    setl(head & (F == 'cream') & mouth, 'ivory')
    setl(head & (F == 'tan') & ~ears & band, 'cream')
    setl(head & (F == 'tan') & ears, 'ear')
    setl(head & (F == 'red') & ~ears & band, 'cream'); red |= head & (F == 'red') & ~ears & band
    setl(head & ((F == 'red') | (F == 'salmon')) & ears, 'ear')
    setl(head & (F == 'salmon') & knot, 'cream')
    setl(eyes & ((F == 'vdark') | (F == 'hair') | (F == 'skin2') | (F == 'cream')), 'skin')
    body = ~head
    cape = body & (Y < 700) & (X > 300) & (X < 905)
    ring = ((X - 690) ** 2 + (Y - 598) ** 2) < 52 ** 2
    strap = poly([(470, 740), (500, 758), (700, 600), (905, 470), (905, 440), (860, 450), (690, 575), (470, 720)])
    scarf = poly([(420, 470), (630, 470), (600, 520), (545, 560), (490, 545), (430, 500)])
    setl(cape & ((F == 'brown') | (F == 'dbrown')), 'cape')
    setl(cape & (F == 'red'), 'cape'); red |= cape & (F == 'red')
    setl(cape & (F == 'tan') & ~strap & ~ring, 'cape')
    setl(cape & ((F == 'tan') | (F == 'brown')) & strap & ~ring, 'rope')
    setl(cape & (F == 'cream') & scarf, 'cream')
    setl(cape & (F == 'cream') & ~scarf & ~ring, 'cape')
    setl(body & ring & ((F == 'grey') | (F == 'cream') | (F == 'tan')), 'ring')
    setl(body & (Y < 1150) & (F == 'skin'), 'skin')
    setl(body & (Y < 1150) & (F == 'skin2') & ~cape, 'skin')
    belt = body & (Y >= 700) & (Y < 800) & (X > 330) & (X < 885)
    sack = poly([(345, 780), (380, 760), (430, 752), (470, 760), (500, 800), (505, 860), (480, 905), (430, 925), (370, 915), (345, 870), (338, 820)])
    sacktie = poly([(395, 735), (470, 735), (470, 780), (395, 780)])
    setl(belt & ((F == 'tan') | (F == 'brown') | (F == 'dbrown')) & ~sack, 'rope')
    setl(belt & strap & ((F == 'tan') | (F == 'brown')), 'rope')
    setl(body & sack & ((F == 'cream') | (F == 'tan')), 'sack')
    setl(body & sacktie & ((F == 'tan') | (F == 'brown')), 'rope')
    apron = poly([(470, 790), (560, 770), (690, 775), (800, 790), (830, 830), (790, 965), (700, 985), (590, 980), (500, 960), (475, 900)])
    setl(body & apron & ~belt & ((F == 'cream') | (F == 'tan')), 'cream')
    setl(body & apron & ~belt & (F == 'red'), 'cream'); red |= body & apron & ~belt & (F == 'red')
    skirt = body & (Y >= 760) & (Y < 1075) & (X > 320) & (X < 880) & ~sack & ~(apron & ~belt)
    setl(skirt & ~belt & ((F == 'brown') | (F == 'dbrown') | (F == 'vdark')), 'skirt')
    setl(body & apron & ~belt & ((F == 'brown') | (F == 'dbrown')), 'skirt')
    br = box(165, 345, 730, 885) | box(845, 1010, 730, 885)
    setl(body & br & ((F == 'brown') | (F == 'dbrown') | (F == 'tan') | (F == 'cream') | (F == 'vdark')), 'bracer')
    feet = body & (Y >= 1140)
    setl(feet & ((F == 'cream') | (F == 'tan')), 'ivory')
    setl(feet & ((F == 'skin') | (F == 'skin2')), 'skin')
    lab[feet & (F == 'grey')] = -1
    return lab, red

def align_front(V, F, fg, ymin=None, p0=None, iters=300):
    """Scale and offset that lay the sculpt's front silhouette (from +Z) on the drawing's (or the head's alone)."""
    H, W = fg.shape
    if ymin is None:
        px, x0, y1 = 1000.0, V[:, 0].min() - 0.05, V[:, 1].max() + 0.05
        Wm, Hm = int((V[:, 0].max() - x0 + 0.05) * px) + 1, int((y1 - V[:, 1].min() + 0.05) * px) + 1
        ids, _ = raster_ids(np.stack([(V[:, 0] - x0) * px, (y1 - V[:, 1]) * px], 1), V[:, 2], F, Wm, Hm)
        M = ids >= 0
        ys, xs = np.where(fg)
        s0 = (ys.max() - ys.min()) / (V[:, 1].max() - V[:, 1].min())
        p0 = np.array([s0, (xs.min() + xs.max()) / 2 - s0 * (V[:, 0].min() + V[:, 0].max()) / 2, ys.max() + s0 * V[:, 1].min()])
        def loss(p):
            s, tx, ty = p
            Wp = ndimage.affine_transform(fg.astype(np.float32), np.diag([s / px, s / px]), offset=[ty - s * y1, tx + s * x0], output_shape=M.shape, order=1) > 0.5
            return 1 - (Wp & M).sum() / (Wp | M).sum()
        simplex = np.array([p0, p0 + [s0 * 0.03, 0, 0], p0 + [0, 15, 0], p0 + [0, 0, 15]])
    else:
        keep = V[F][:, :, 1].min(1) > ymin
        row = int(p0[2] - p0[0] * ymin)
        fgh = fg.copy(); fgh[row:] = False
        def loss(p):
            s, tx, ty = p
            ids, _ = raster_ids(np.stack([tx + s * V[:, 0], ty - s * V[:, 1]], 1), V[:, 2], F[keep], W, H)
            M = ids >= 0; M[row:] = False
            return 1 - (M & fgh).sum() / (M | fgh).sum()
        simplex = np.array([p0, p0 + [25, 0, 0], p0 + [0, 6, 0], p0 + [0, 0, 6]])
    r = optimize.minimize(loss, p0, method='Nelder-Mead', options=dict(xatol=0.05, fatol=1e-5, maxiter=iters, initial_simplex=simplex))
    print(f'  fitted ({"head" if ymin else "whole"}): IoU {1 - r.fun:.3f}')
    return r.x

def edges_of(F):
    return np.unique(np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), 1), axis=0)

def classes(V, F, img):
    VN, FN, FA = normals(V, F)
    n, K = len(V), len(CLASSES)
    L, Fam = front_clusters(img)
    lab, red = front_labels(Fam)
    fg = ndimage.binary_fill_holes(ndimage.binary_opening(L >= 0))
    body = align_front(V, F, fg)
    head = align_front(V, F, fg, ymin=0.66, p0=body, iters=120)
    # ---- seeds from the front: where the sculpt shows itself to the front, square on, away from edges, and the drawing agrees
    s, tx, ty = body
    H, W = lab.shape
    u, v = tx + s * V[:, 0], ty - s * V[:, 1]
    ids, zb = raster_ids(np.stack([u, v], 1), V[:, 2], F, W, H)
    ui, vi = np.clip(np.round(u - 0.5).astype(int), 0, W - 1), np.clip(np.round(v - 0.5).astype(int), 0, H - 1)
    vis = V[:, 2] >= zb[vi, ui] - 0.004
    msk = ids >= 0; zz = np.nan_to_num(np.where(msk, zb, np.nan), nan=-1)
    edge = np.zeros(msk.shape, bool)
    dzx, dzy = np.abs(np.diff(zz, axis=1)) > 0.02, np.abs(np.diff(zz, axis=0)) > 0.02
    edge[:, 1:] |= dzx; edge[:, :-1] |= dzx; edge[1:, :] |= dzy; edge[:-1, :] |= dzy
    edge |= msk ^ ndimage.binary_erosion(msk)
    dedge, dimg = ndimage.distance_transform_edt(~edge), ndimage.distance_transform_edt(L >= 0)
    votes = np.stack([ndimage.uniform_filter((lab == k).astype(np.float32), size=9) for k in range(K)])
    mode, share = votes.argmax(0), votes.max(0)
    ok = vis & (VN[:, 2] > 0.35) & (dedge[vi, ui] > 6) & (dimg[vi, ui] > 6) & (share[vi, ui] > 0.75) & (lab[vi, ui] >= 0)
    seeds = np.where(ok, mode[vi, ui], -1)
    seeds[(seeds == CI['ivory']) & (V[:, 1] < 0.25)] = -1          # (the claws come from their shape, below)
    print('  front seeds', int((seeds >= 0).sum()))
    # ---- seeds picked by hand on views of its back and sides
    for view, picks in PICKS.items():
        yaw, elev, px = PICK_VIEWS[view]
        vid = render_view(V, F, yaw, elev, px)
        Hh, Ww = vid.shape; Yy, Xx = np.mgrid[0:Hh, 0:Ww]
        for c, x, y, r in picks:
            tris = np.unique(vid[((Xx - x) ** 2 + (Yy - y) ** 2 <= r * r) & (vid >= 0)])
            seeds[np.unique(F[tris].ravel())] = CI[c]
    # ---- seeds by shape: claws (the toes' tips), the toes and instep (skin), the ankle wraps
    claw, toe, wrap = (np.zeros(n, bool) for _ in range(3))
    for sel in (V[:, 0] > 0, V[:, 0] < 0):
        lo = sel & (V[:, 1] > 0.10) & (V[:, 1] < 0.14)
        ax, az = V[lo, 0].mean(), V[lo, 2].mean()
        ft = np.where(sel & (V[:, 1] < 0.055))[0]
        d = np.hypot(V[ft, 0] - ax, V[ft, 2] - az)
        ang = np.degrees(np.arctan2(V[ft, 0] - ax, V[ft, 2] - az))
        front = np.abs(ang) < 70; bins = np.round(ang / 4).astype(int)
        for b in np.unique(bins[front]):
            mb = front & (bins == b); dm = d[mb].max()
            if dm < 0.11: continue
            claw[ft[mb & (d > dm - 0.02)]] = True
            toe[ft[mb & (d < dm - 0.038) & (d > 0.06)]] = True
        toe[sel & (V[:, 1] > 0.035) & (V[:, 1] < 0.066) & (V[:, 2] > az + 0.03)] = True
        wrap[sel & (V[:, 1] > 0.075) & (V[:, 1] < 0.107) & (np.hypot(V[:, 0] - ax, V[:, 2] - az) < 0.075)] = True
    seeds[toe] = CI['skin']; seeds[claw] = CI['ivory']; seeds[wrap] = CI['rope']
    # ---- the random walk from the seeds (cheap to cross along a crease)
    E = edges_of(F)
    w = np.exp(-np.maximum(1 - (VN[E[:, 0]] * VN[E[:, 1]]).sum(1), 0) / 0.05) + 1e-4
    Wm = sparse.coo_matrix((np.concatenate([w, w]), (np.concatenate([E[:, 0], E[:, 1]]), np.concatenate([E[:, 1], E[:, 0]]))), shape=(n, n)).tocsr()
    Lap = sparse.diags(np.asarray(Wm.sum(1)).ravel()) - Wm
    S, U = np.where(seeds >= 0)[0], np.where(seeds < 0)[0]
    B = np.zeros((len(S), K)); B[np.arange(len(S)), seeds[S]] = 1
    P = np.zeros((n, K)); P[S] = B; P[U] = splu(Lap[U][:, U].tocsc()).solve(-(Lap[U][:, S] @ B))
    # ---- the graph cut of the faces: the walk's odds, and a Potts term cheap to cut along creases
    nf = len(F)
    Ef = np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), 1); fid = np.tile(np.arange(nf), 3)
    key = Ef[:, 0] * n + Ef[:, 1]; o = np.argsort(key); key, fid, Ef = key[o], fid[o], Ef[o]
    same = key[1:] == key[:-1]
    fa, fb = fid[:-1][same], fid[1:][same]
    el = np.linalg.norm(V[Ef[:-1][same][:, 0]] - V[Ef[:-1][same][:, 1]], axis=1)
    wpair = (el / el.mean()) * np.exp(-(np.arccos(np.clip((FN[fa] * FN[fb]).sum(1), -1, 1)) / np.radians(22.0)) ** 2)
    Dd = -np.log(np.clip(P[F].mean(1), 0.02, 1.0))
    labf = Dd.argmin(1)
    import maxflow
    energy = lambda l: Dd[np.arange(nf), l].sum() + wpair[l[fa] != l[fb]].sum()
    for _ in range(3):
        changed = 0
        for a in range(K):
            g = maxflow.Graph[float](); nodes = g.add_nodes(nf)
            isa = labf == a
            u0 = np.where(isa, Dd[:, a], Dd[np.arange(nf), labf]); u1 = Dd[:, a].copy()
            la, lb = labf[fa], labf[fb]
            A_, B_, C_ = wpair * (la != lb), wpair * (la != a), wpair * (lb != a)
            np.add.at(u1, fa, C_ - A_); np.add.at(u1, fb, -C_)
            m = np.minimum(u0, u1)
            g.add_grid_tedges(nodes, u1 - m, u0 - m)
            g.add_edges(nodes[fa], nodes[fb], np.maximum(B_ + C_ - A_, 0), np.zeros_like(wpair))
            g.maxflow()
            new = np.where(g.get_grid_segments(nodes) & ~isa, a, labf)
            if energy(new) < energy(labf) - 1e-9: changed += int((new != labf).sum()); labf = new
        if not changed: break
    Q = np.zeros((n, K))
    for k in range(3): np.add.at(Q, (F[:, k], labf), FA)
    Q /= Q.sum(1, keepdims=True)
    print('  classes:', {c: int((labf == i).sum()) for i, c in enumerate(CLASSES)})
    return Q, red, body, head

# ============================================================================ fewer triangles, UVs
def decimate(V, F, target=8000):
    import pymeshlab
    q = np.ones(len(V))
    q[(V[:, 2] > 0.06) & (V[:, 1] > 0.74) & (V[:, 1] < 0.90) & (np.abs(V[:, 0]) < 0.14)] = 4.0      # the face
    q[(np.abs(V[:, 0]) > 0.2) & (V[:, 1] > 0.2) & (V[:, 1] < 0.47)] = 2.0                           # the hands
    q[V[:, 1] < 0.06] = 1.6                                                                          # the feet
    ms = pymeshlab.MeshSet()
    ms.add_mesh(pymeshlab.Mesh(V, F.astype(np.int32), v_scalar_array=q))
    ms.meshing_decimation_quadric_edge_collapse(targetfacenum=target, qualitythr=0.4, preserveboundary=True, preservenormal=True,
                                                preservetopology=True, optimalplacement=True, planarquadric=True, planarweight=0.002,
                                                qualityweight=True, autoclean=True)
    m = ms.current_mesh()
    return m.vertex_matrix(), m.face_matrix().astype(np.int64)

def unwrap(LV, LF, face_scale=2.6):
    import xatlas
    c = LV[LF].mean(1)
    fn = np.cross(LV[LF[:, 1]] - LV[LF[:, 0]], LV[LF[:, 2]] - LV[LF[:, 0]]); fn /= np.linalg.norm(fn, axis=1, keepdims=True)
    face = (np.abs(c[:, 0]) < 0.125) & (c[:, 1] > 0.738) & (c[:, 1] < 0.885) & (c[:, 2] > 0.07) & (fn[:, 2] > 0.1)
    atlas, parts = xatlas.Atlas(), []
    for sel, k in ((face, face_scale), (~face, 1.0)):
        fi = np.where(sel)[0]; used = np.unique(LF[fi])
        remap = -np.ones(len(LV), np.int64); remap[used] = np.arange(len(used))
        atlas.add_mesh((LV[used] * k).astype(np.float32), remap[LF[fi]].astype(np.uint32))
        parts.append((fi, used))
    co = xatlas.ChartOptions(); co.max_iterations = 2; co.max_cost = 4.0
    po = xatlas.PackOptions(); po.resolution = 1024; po.padding = 4; po.bilinear = True
    atlas.generate(co, po)
    vm, uv, idx, off = [], [], np.zeros((len(LF), 3), np.int64), 0
    for m, (fi, used) in enumerate(parts):
        vmap, ii, uvs = atlas[m]
        vm.append(used[vmap]); uv.append(uvs); idx[fi] = ii + off; off += len(vmap)
    return np.concatenate(vm), idx, np.concatenate(uv)

# ============================================================================ the picture
PAL = {'skin': '#c3c264', 'hair': '#64653f', 'cream': '#f1d8a6', 'cape': '#a47c56', 'skirt': '#7c634d', 'rope': '#c39a66', 'bracer': '#957052',
       'sack': '#e3bf86', 'ear': '#df9e86', 'ivory': '#f6e8c6', 'ring': '#bdb3a6', 'leather': '#9a6847'}
RED, LINE, SCLERA, HL, BROW = (hexrgb(h) for h in ('#c8704f', '#33271f', '#f0e2c3', '#ffffff', '#4e5034'))
EYES_DRAWN = np.array([[519., 311.], [682., 311.]])        # the irises' middles on the front drawing
EYES_SCULPT = np.array([[-0.058, 0.827], [0.057, 0.827]])  # the sculpt's eyeballs (x, y), seen from the front

def face_features(img):
    """The drawing's face as paint: 1 lines (irises, lids, nostrils, the mouth), 2 the whites, 3 the glints, 4 the brows."""
    from skimage import color
    lab = color.rgb2lab(img / 255.); L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    H, W = L.shape; Y, X = np.mgrid[0:H, 0:W]
    feat = np.zeros((H, W), np.uint8)
    zone = (X > 440) & (X < 760) & (Y > 236) & (Y < 430)
    eyes = (((X - 516) / 34.0) ** 2 + ((Y - 305) / 27.0) ** 2 < 1) | (((X - 684) / 34.0) ** 2 + ((Y - 305) / 27.0) ** 2 < 1)
    dark = zone & (L < 33)
    brow = zone & (Y < 296) & (L < 46) & (A < 2) & ~eyes
    feat[brow] = 4; feat[dark & ~brow] = 1
    loc = ndimage.uniform_filter(L, 9)
    feat[(Y > 382) & (Y < 406) & (X > 470) & (X < 735) & (L < loc - 7) & (L < 62)] = 1
    feat[eyes & (L > 72) & (B > 12) & ~dark] = 2
    feat[eyes & (L > 88) & (B < 14)] = 3
    for k in (1, 2, 4):
        m = feat == k; lb, nl = ndimage.label(m)
        sizes = ndimage.sum(m, lb, range(1, nl + 1))
        feat[np.isin(lb, np.where(sizes < (6 if k != 1 else 4))[0] + 1)] = 0
    return feat

def bake(HV, HF, HN, Q, LV, LF, vmap, idx, uvs, red, body, head, feat, res=1024):
    import trimesh
    PALA = np.array([hexrgb(PAL[c]) for c in CLASSES])
    PV = LV[vmap]; P2 = uvs * res
    tid, _ = raster_ids(P2, np.zeros(len(P2)), idx, res, res)
    ty_, tx_ = np.where(tid >= 0); t = tid[ty_, tx_]
    A_, B_, C_ = P2[idx[t, 0]], P2[idx[t, 1]], P2[idx[t, 2]]
    px, py = tx_ + 0.5, ty_ + 0.5
    d = (B_[:, 1] - C_[:, 1]) * (A_[:, 0] - C_[:, 0]) + (C_[:, 0] - B_[:, 0]) * (A_[:, 1] - C_[:, 1])
    l0 = ((B_[:, 1] - C_[:, 1]) * (px - C_[:, 0]) + (C_[:, 0] - B_[:, 0]) * (py - C_[:, 1])) / d
    l1 = ((C_[:, 1] - A_[:, 1]) * (px - C_[:, 0]) + (A_[:, 0] - C_[:, 0]) * (py - C_[:, 1])) / d
    X3 = l0[:, None] * PV[idx[t, 0]] + l1[:, None] * PV[idx[t, 1]] + (1 - l0 - l1)[:, None] * PV[idx[t, 2]]
    fn = np.cross(PV[idx[:, 1]] - PV[idx[:, 0]], PV[idx[:, 2]] - PV[idx[:, 0]]); fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    N3 = fn[t]
    # where each texel meets the high mesh: a ray in along -normal from just outside (a thin layer is read from its own side)
    hi = trimesh.Trimesh(HV, HF, process=False)
    orig = X3 + N3 * 0.008
    locs, ri, tri = hi.ray.intersects_location(orig, -N3, multiple_hits=False)
    ok = np.linalg.norm(locs - orig[ri], axis=1) < 0.024
    hf = np.full(len(t), -1); hloc = np.zeros_like(X3); hf[ri[ok]] = tri[ok]; hloc[ri[ok]] = locs[ok]
    miss = hf < 0
    if miss.any():
        cp, _, ctri = trimesh.proximity.closest_point(hi, X3[miss]); hf[miss] = ctri; hloc[miss] = cp
    bary = np.clip(trimesh.triangles.points_to_barycentric(HV[HF[hf]], hloc), 0, 1); bary /= bary.sum(1, keepdims=True)
    cls = (Q[HF[hf]] * bary[..., None]).sum(1).argmax(1)
    # specks of a class (where the low surface skims another layer of the high one) go to what is round them
    CL = np.full((res, res), -1, np.int64); CL[ty_, tx_] = cls
    bad = np.zeros((res, res), bool)
    for k in range(len(CLASSES)):
        if CLASSES[k] in ('ivory', 'ring', 'ear'): continue
        lb, nl = ndimage.label(CL == k, structure=np.ones((3, 3)))
        if nl == 0: continue
        small = np.bincount(lb.ravel()) < 60; small[0] = False
        bad |= small[lb]
    ii = ndimage.distance_transform_edt(~((CL >= 0) & ~bad), return_distances=False, return_indices=True)
    cls = CL[ii[0], ii[1]][ty_, tx_]
    col = PALA[cls].copy()
    # AO on the high mesh, soft: occluders within 12 cm
    rng = np.random.default_rng(3); K = 40
    u1, u2 = rng.random((len(HN), K)), rng.random((len(HN), K))
    r = np.sqrt(u1); phi = 2 * np.pi * u2
    a = np.where(np.abs(HN[:, 0:1]) < 0.9, np.array([[1., 0, 0]]), np.array([[0, 1., 0]]))
    tt = np.cross(HN, a); tt /= np.linalg.norm(tt, axis=1, keepdims=True); bb = np.cross(HN, tt)
    dirs = (r * np.cos(phi))[..., None] * tt[:, None] + (r * np.sin(phi))[..., None] * bb[:, None] + np.sqrt(1 - u1)[..., None] * HN[:, None]
    o2 = np.repeat(HV + HN * 0.0015, K, axis=0)
    l2, r2, _ = hi.ray.intersects_location(o2, dirs.reshape(-1, 3), multiple_hits=False)
    hit = np.zeros(len(o2), bool); hit[r2[np.linalg.norm(l2 - o2[r2], axis=1) < 0.12]] = True
    ao = ((1 - hit.reshape(-1, K).mean(1))[HF[hf]] * bary).sum(1)
    # the drawing's details, laid on from the front where the texel faces it and is not hidden
    def front(tr, cut):
        s, tx, ty = tr
        _, zb = raster_ids(np.stack([tx + s * HV[:, 0], ty - s * HV[:, 1]], 1), HV[:, 2], HF, 1199, 1312)
        qu, qv = tx + s * hloc[:, 0], ty - s * hloc[:, 1]
        ui, vi = np.clip(qu.astype(int), 0, 1198), np.clip(qv.astype(int), 0, 1311)
        return (N3[:, 2] > cut) & (hloc[:, 2] >= zb[vi, ui] - 0.006), ui, vi, qu, qv
    red = ndimage.binary_closing(red, iterations=2)
    for tr, allowed, part in ((head, ('cream',), hloc[:, 1] > 0.85), (body, ('cream', 'cape'), hloc[:, 1] < 0.85)):
        ok, ui, vi, _, _ = front(tr, 0.15)
        col[ok & red[vi, ui] & np.isin(cls, [CI[c] for c in allowed]) & part] = RED
    s = (EYES_DRAWN[1, 0] - EYES_DRAWN[0, 0]) / (EYES_SCULPT[1, 0] - EYES_SCULPT[0, 0])
    tr = (s, EYES_DRAWN[:, 0].mean() - s * EYES_SCULPT[:, 0].mean(), EYES_DRAWN[:, 1].mean() + s * EYES_SCULPT[:, 1].mean())
    ok, ui, vi, qu, qv = front(tr, 0.25)
    face = ok & (((qu - 600) / 140.) ** 2 + ((qv - 322) / 104.) ** 2 < 1) & (hloc[:, 1] > 0.74) & (hloc[:, 1] < 0.9) & np.isin(cls, [CI['skin'], CI['hair']])
    painted = np.zeros(len(t), bool)
    for k, c in ((4, BROW), (2, SCLERA), (1, LINE), (3, HL)):
        m = face & (ndimage.map_coordinates(ndimage.gaussian_filter((feat == k).astype(float), 0.8), [qv - 0.5, qu - 0.5], order=1) > 0.45)
        col[m] = c
        if k != 4: painted |= m
    # light: AO darkens toward a cool brown, gently; a faint painterly variation in 3D (no seams)
    aoK = np.clip((1 - ao) * 1.3, 0, 1) ** 1.3; aoK[painted] = 0
    col *= 1 - 0.3 * aoK[:, None] * (1 - np.array([0.64, 0.6, 0.68]))
    q = hloc * 22; i = np.floor(q); fr = q - i; fr = fr * fr * (3 - 2 * fr)
    def hsh(o):
        k = (i + o).astype(np.int64)
        return ((k[:, 0] * 73856093 ^ k[:, 1] * 19349663 ^ k[:, 2] * 83492791) & 0xffff) / 65535.0
    c8 = {(dx, dy, dz): hsh(np.array([dx, dy, dz])) for dx in (0, 1) for dy in (0, 1) for dz in (0, 1)}
    lx = lambda p, q_: p * (1 - fr[:, 0]) + q_ * fr[:, 0]
    nz = ((lx(c8[0, 0, 0], c8[1, 0, 0]) * (1 - fr[:, 1]) + lx(c8[0, 1, 0], c8[1, 1, 0]) * fr[:, 1]) * (1 - fr[:, 2])
          + (lx(c8[0, 0, 1], c8[1, 0, 1]) * (1 - fr[:, 1]) + lx(c8[0, 1, 1], c8[1, 1, 1]) * fr[:, 1]) * fr[:, 2]) - 0.5
    nz[painted] = 0
    col *= 1 + nz[:, None] * 0.045
    img = np.zeros((res, res, 3)); has = np.zeros((res, res), bool)
    img[ty_, tx_] = np.clip(col, 0, 255); has[ty_, tx_] = True
    ii = ndimage.distance_transform_edt(~has, return_distances=False, return_indices=True)
    return Image.fromarray(img[ii[0], ii[1]].astype(np.uint8))

def shading_normals(HV, HF, HN, LV, LF, smooth=6):
    E = edges_of(HF); n = len(HV)
    Wm = sparse.coo_matrix((np.ones(2 * len(E)), (np.concatenate([E[:, 0], E[:, 1]]), np.concatenate([E[:, 1], E[:, 0]]))), shape=(n, n)).tocsr()
    deg = np.asarray(Wm.sum(1)).ravel(); SN = HN.copy()
    for _ in range(smooth):
        SN = 0.5 * SN + 0.5 * (Wm @ SN) / deg[:, None]; SN /= np.linalg.norm(SN, axis=1, keepdims=True)
    lvn, _, _ = normals(LV, LF)
    dd, ii = cKDTree(HV).query(LV, k=12)
    w = np.exp(-(dd / 0.008) ** 2) * np.clip((HN[ii] * lvn[:, None, :]).sum(-1), 0, 1) ** 2
    w[w.sum(1) < 1e-8, 0] = 1; w /= w.sum(1, keepdims=True)
    LN = (SN[ii] * w[..., None]).sum(1)
    return LN / np.linalg.norm(LN, axis=1, keepdims=True)

# ============================================================================ the bones
JOINTS = {'J_Bip_C_Hips': (0, 0.335, -0.02), 'J_Bip_C_Spine': (0, 0.40, -0.022), 'J_Bip_C_Chest': (0, 0.47, -0.025),
          'J_Bip_C_UpperChest': (0, 0.545, -0.028), 'J_Bip_C_Neck': (0, 0.635, -0.03), 'J_Bip_C_Head': (0, 0.705, -0.025), 'END_Head': (0, 0.98, -0.01)}
SIDE = {'Shoulder': (0.04, 0.600, -0.025), 'UpperArm': (0.172, 0.595, -0.022), 'LowerArm': (0.232, 0.488, -0.002), 'Hand': (0.285, 0.378, 0.050),
        'END_Hand': (0.296, 0.235, 0.075), 'UpperLeg': (0.085, 0.325, -0.020), 'LowerLeg': (0.104, 0.200, -0.012), 'Foot': (0.110, 0.088, -0.032),
        'ToeBase': (0.125, 0.026, 0.055), 'END_Toe': (0.135, 0.015, 0.130), 'Ear': (0.138, 0.866, -0.030), 'END_Ear': (0.355, 0.885, -0.055)}
PARENT = {'J_Bip_C_Hips': None, 'J_Bip_C_Spine': 'J_Bip_C_Hips', 'J_Bip_C_Chest': 'J_Bip_C_Spine', 'J_Bip_C_UpperChest': 'J_Bip_C_Chest',
          'J_Bip_C_Neck': 'J_Bip_C_UpperChest', 'J_Bip_C_Head': 'J_Bip_C_Neck', 'END_Head': 'J_Bip_C_Head'}
for _s, _g in (('L', 1), ('R', -1)):                        # (the sculpt's frame: it faces +Z, its left is +x)
    for _k, (_x, _y, _z) in SIDE.items():
        JOINTS[(f'END_{_s}_' + _k[4:]) if _k.startswith('END_') else (f'Goblin_{_s}_Ear' if _k == 'Ear' else f'J_Bip_{_s}_{_k}')] = (_g * _x, _y, _z)
    PARENT.update({f'J_Bip_{_s}_Shoulder': 'J_Bip_C_UpperChest', f'J_Bip_{_s}_UpperArm': f'J_Bip_{_s}_Shoulder', f'J_Bip_{_s}_LowerArm': f'J_Bip_{_s}_UpperArm',
                   f'J_Bip_{_s}_Hand': f'J_Bip_{_s}_LowerArm', f'END_{_s}_Hand': f'J_Bip_{_s}_Hand', f'J_Bip_{_s}_UpperLeg': 'J_Bip_C_Hips',
                   f'J_Bip_{_s}_LowerLeg': f'J_Bip_{_s}_UpperLeg', f'J_Bip_{_s}_Foot': f'J_Bip_{_s}_LowerLeg', f'J_Bip_{_s}_ToeBase': f'J_Bip_{_s}_Foot',
                   f'END_{_s}_Toe': f'J_Bip_{_s}_ToeBase', f'Goblin_{_s}_Ear': 'J_Bip_C_Head', f'END_{_s}_Ear': f'Goblin_{_s}_Ear'})
JOINTS = {k: np.array(v, float) for k, v in JOINTS.items()}
BONES = [k for k in JOINTS if not k.startswith('END_')]

def seg_end(b):
    pref = {'J_Bip_C_Hips': 'J_Bip_C_Spine', 'J_Bip_C_UpperChest': 'J_Bip_C_Neck', 'J_Bip_C_Head': 'END_Head'}
    if b in pref: return JOINTS[pref[b]]
    kids = [k for k, p in PARENT.items() if p == b]
    return JOINTS[kids[0]] if kids else JOINTS[b]

def skin_weights(V, F, HV, Q, heat=6.0):
    """Bone heat: each vertex warmed by the nearest bone it can see, diffused over the surface; the four strongest kept."""
    import trimesh
    n, B = len(V), len(BONES)
    mesh = trimesh.Trimesh(V, F, process=False)
    I, J, W = [], [], []
    for (i, j, k) in ((0, 1, 2), (1, 2, 0), (2, 0, 1)):
        a, b = V[F[:, i]] - V[F[:, k]], V[F[:, j]] - V[F[:, k]]
        c = 0.5 * (a * b).sum(1) / np.maximum(np.linalg.norm(np.cross(a, b), axis=1), 1e-12)
        I += [F[:, i], F[:, j]]; J += [F[:, j], F[:, i]]; W += [c, c]
    Cm = sparse.coo_matrix((np.maximum(np.concatenate(W), 1e-6), (np.concatenate(I), np.concatenate(J))), shape=(n, n)).tocsr()
    C = sparse.diags(np.asarray(Cm.sum(1)).ravel()) - Cm
    A = np.zeros(n)
    for k in range(3): np.add.at(A, F[:, k], mesh.area_faces / 3)
    S0, S1 = np.array([JOINTS[b] for b in BONES]), np.array([seg_end(b) for b in BONES])
    def closest(a, b):
        ab = b - a; t = np.clip(((V - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
        return a + t[:, None] * ab
    CP = np.stack([closest(S0[k], S1[k]) for k in range(B)], 1)
    D = np.linalg.norm(CP - V[:, None, :], axis=2)
    order, vis = np.argsort(D, 1), np.zeros((n, B), bool)
    for r in range(6):
        bk = order[:, r]; tgt = CP[np.arange(n), bk]
        dv = tgt - V; L = np.linalg.norm(dv, axis=1); dv /= np.maximum(L, 1e-9)[:, None]
        o = V + dv * 0.002
        locs, ri, _ = mesh.ray.intersects_location(o, dv, multiple_hits=False)
        blocked = np.zeros(n, bool); blocked[ri[np.linalg.norm(locs - o[ri], axis=1) < (L[ri] - 0.004)]] = True
        vis[np.arange(n), bk] = ~blocked
    Dv = np.where(vis, D, np.inf)
    near, dn = Dv.argmin(1), Dv.min(1)
    nov = ~np.isfinite(dn); near[nov] = D[nov].argmin(1); dn[nov] = D[nov].min(1)
    Pm = ((Dv <= dn[:, None] * 1.01) & np.isfinite(Dv)).astype(float)
    Pm[nov] = 0; Pm[nov, near[nov]] = 1; Pm /= Pm.sum(1, keepdims=True)
    AH = sparse.diags(A * heat / np.maximum(dn, 0.004) ** 2)
    Wt = np.clip(splu((C + AH).tocsc()).solve(AH @ Pm), 0, 1)
    # the ears: only the ear itself (skin or inner ear, out past the temple) follows an ear bone; the knot, its tails and the
    # hair beside it go with the head
    vcls = Q[cKDTree(HV).query(V)[1]].argmax(1)
    head = BONES.index('J_Bip_C_Head')
    for s, g in (('L', 1), ('R', -1)):
        e = BONES.index(f'Goblin_{s}_Ear')
        ramp = np.clip((g * V[:, 0] - 0.165) / 0.045, 0, 1) * np.isin(vcls, [CI['skin'], CI['ear']]) * ((V[:, 1] > 0.78) & (V[:, 1] < 0.97))
        tot = Wt[:, e] + Wt[:, head]
        Wt[:, e], Wt[:, head] = tot * ramp, tot * (1 - ramp)
        out = ramp > 0.999
        Wt[np.ix_(out, [k for k in range(B) if k not in (e, head)])] = 0
    top = np.argsort(-Wt, 1)[:, :4]
    tw = np.take_along_axis(Wt, top, 1); tw[tw < 0.01] = 0
    return top, tw / np.maximum(tw.sum(1, keepdims=True), 1e-9)

# ============================================================================ the files
def write_glb(path, LV, vmap, idx, uvs, LN, joints, weights, picture):
    R = np.array([-1.0, 1.0, -1.0])                         # turned to face -Z, as VRoid models
    pos = (LV[vmap] * R).astype(np.float32)
    nrm = (LN[vmap] * R).astype(np.float32); nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    jt = joints[vmap].astype(np.uint8); wt = weights[vmap].astype(np.float32); wt /= wt.sum(1, keepdims=True)
    buf = io.BytesIO(); picture.convert('RGB').save(buf, 'WEBP', quality=90, method=6)
    blob, views, accs = bytearray(), [], []
    def add(data, target=None):
        while len(blob) % 4: blob.append(0)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data), **({'target': target} if target else {})})
        blob.extend(data); return len(views) - 1
    def acc(arr, ctype, typ, target=None, minmax=False):
        a = {'bufferView': add(arr.tobytes(), target), 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
        if minmax: a['min'], a['max'] = arr.min(0).tolist(), arr.max(0).tolist()
        accs.append(a); return len(accs) - 1
    attrs = {'POSITION': acc(pos, 5126, 'VEC3', 34962, True), 'NORMAL': acc(nrm, 5126, 'VEC3', 34962), 'TEXCOORD_0': acc(uvs.astype(np.float32), 5126, 'VEC2', 34962),
             'JOINTS_0': acc(jt, 5121, 'VEC4', 34962), 'WEIGHTS_0': acc(wt, 5126, 'VEC4', 34962)}
    ind = acc(idx.astype(np.uint16).ravel(), 5123, 'SCALAR', 34963)
    jw = {b: JOINTS[b] * R for b in BONES}
    ibm = []
    for b in BONES:                                          # each bone's bind pose is where it stands, turned no way
        M = np.eye(4); M[:3, 3] = -jw[b]; ibm.append(M.T.ravel())          # (column-major)
    ibm = np.array(ibm, np.float32)
    ibmA = acc(ibm, 5126, 'MAT4'); img = add(buf.getvalue())
    nodes = [{'name': 'Body', 'mesh': 0, 'skin': 0}, {'name': 'Root', 'children': []}]
    bi = {b: 2 + k for k, b in enumerate(BONES)}
    for b in BONES:
        p = PARENT[b]
        nodes.append({'name': b, 'translation': [float(x) for x in (jw[b] - (jw[p] if p else 0))]})
    for b in BONES:
        p = PARENT[b]
        (nodes[bi[p]] if p else nodes[1]).setdefault('children', []).append(bi[b])
    gltf = {'asset': {'version': '2.0', 'generator': 'liora-farm tools/make-goblin.py'}, 'extensionsUsed': ['KHR_materials_unlit'],
            'scene': 0, 'scenes': [{'name': 'goblin', 'nodes': [0, 1]}], 'nodes': nodes,
            'meshes': [{'name': 'Body', 'primitives': [{'attributes': attrs, 'indices': ind, 'material': 0}]}],
            'skins': [{'name': 'goblin', 'joints': [bi[b] for b in BONES], 'inverseBindMatrices': ibmA, 'skeleton': 1}],
            'materials': [{'name': 'GOBLIN_BODY', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 1},
                           'alphaMode': 'OPAQUE', 'doubleSided': False, 'extensions': {'KHR_materials_unlit': {}},
                           'extras': {'color': [1, 1, 1, 1], 'shade': [0.88, 0.82, 0.9], 'queue': 2000, 'face': False}}],
            'textures': [{'sampler': 0, 'source': 0}], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
            'images': [{'bufferView': img, 'mimeType': 'image/webp'}], 'accessors': accs, 'bufferViews': views}
    while len(blob) % 4: blob.append(0)
    gltf['buffers'] = [{'byteLength': len(blob)}]
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    open(path, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js
                           + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob))
    print(f'wrote {path}: {len(pos)} vertices, {len(idx)} triangles, {len(BONES)} bones, picture {len(buf.getvalue())} bytes')

def write_anim(path, gain=1.3):
    src = open(os.path.join(REPO, 'character-anim.js')).read()
    A = json.loads(src[src.index('export const CHARACTER_ANIM = ') + len('export const CHARACTER_ANIM = '):].strip().rstrip(';'))
    c = A['clips']['idle']
    def qmul(a, b):
        x1, y1, z1, w1 = a.T; x2, y2, z2, w2 = b.T
        return np.stack([w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2], 1)
    def qpow(q, k):
        q = q * np.sign(q[:, 3:4] + 1e-12); ang = 2 * np.arccos(np.clip(q[:, 3], -1, 1)); s = np.sin(ang / 2)
        ax = np.where(s[:, None] > 1e-9, q[:, :3] / np.maximum(s, 1e-9)[:, None], np.array([1.0, 0, 0]))
        return np.concatenate([ax * np.sin(ang * k / 2)[:, None], np.cos(ang * k / 2)[:, None]], 1)
    arm = {'J_Bip_L_UpperArm', 'J_Bip_R_UpperArm', 'J_Bip_L_LowerArm', 'J_Bip_R_LowerArm'}
    tracks = {}
    for b, v in c['tracks'].items():
        q = np.array(v, float).reshape(-1, 4)
        if b not in BONES or len(q) == 1: continue
        m = q.mean(0); m /= np.linalg.norm(m); q = q * np.sign((q * m).sum(1, keepdims=True))
        d = qpow(qmul(q, np.repeat((m * [-1, -1, -1, 1])[None], len(q), 0)), gain * (0.8 if b in arm else 1.0))
        tracks[b] = [round(float(x), 5) for x in (d / np.linalg.norm(d, axis=1, keepdims=True)).ravel()]
    h = np.array(c['hips'], float).reshape(-1, 3)
    hips = JOINTS['J_Bip_C_Hips'] * [-1, 1, -1] / JOINTS['J_Bip_C_Hips'][1] + (h - h.mean(0)) * gain
    anim = {'fps': 30, 'forwardYaw': A['forwardYaw'], 'hipsBone': 'J_Bip_C_Hips', 'hipsUnit': 'hipsHeight',
            'clips': {'idle': {'duration': c['duration'], 'frames': c['frames'], 'loop': True, 'speed': 0.0, 'tracks': tracks,
                               'hips': [round(float(x), 5) for x in hips.ravel()]}}}
    open(path, 'w').write('// goblin-anim.js: written by tools/make-goblin.py; do not edit by hand.\n'
                          "// The goblin's idle: Quaternius' Universal Animation Library (CC0), Idle_Loop as character-anim.js has it, laid on\n"
                          "// the goblin's own stance as its motion about its own average (the goblin keeps its sculpted A-pose).\n"
                          'export const GOBLIN_ANIM = ' + json.dumps(anim, separators=(',', ':')) + ';\n')
    print(f'wrote {path}: idle, {len(tracks)} bones')

def main():
    if len(sys.argv) < 3: sys.exit(__doc__)
    fbx, front_png = sys.argv[1], sys.argv[2]
    print('the sculpt'); HV, HF = read_fbx_mesh(fbx); HN, _, _ = normals(HV, HF)
    img = np.asarray(Image.open(front_png).convert('RGB')).astype(float)
    print('its classes'); Q, red, body, head = classes(HV, HF, img)
    print('fewer triangles'); LV, LF = decimate(HV, HF)
    print('UVs'); vmap, idx, uvs = unwrap(LV, LF)
    print('the picture'); picture = bake(HV, HF, HN, Q, LV, LF, vmap, idx, uvs, red, body, head, face_features(img))
    print('normals, bones and weights'); LN = shading_normals(HV, HF, HN, LV, LF); joints, weights = skin_weights(LV, LF, HV, Q)
    write_glb(os.path.join(REPO, 'assets', 'models', 'goblin.glb'), LV, vmap, idx, uvs, LN, joints, weights, picture)
    write_anim(os.path.join(REPO, 'goblin-anim.js'))

if __name__ == '__main__':
    main()
