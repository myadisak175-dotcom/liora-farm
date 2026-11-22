#!/usr/bin/env python3
"""
tools/make-water-casts.py  —  the pictures of her four water casts (the normal combo's, on its trial page for now:
combo-water-trial/water-jet.webp, water-sweep.webp, water-orbit.webp, water-vortex.webp and water-casts.js), made from
the clip the casts were asked after (22 Nov 2026: ten seconds made with Gemini, a girl's four water casts before the
plant boss, 1280 x 720, 24 pictures a second; the clip itself is not kept here).

    python3 tools/make-water-casts.py CLIP.mp4 realesr-animevideov3.pth [combo-water-trial] [WORK]

Why: the first textures were the clip's frames at a quarter of their size (256 pixels across a cast five metres wide),
which a phone held upright showed six times too big: out of focus ("vfx ดูเบลอๆ", "ถ้าทำให้ texture ชัดสวยจะดีมาก"). These
are the same frames of the clip, put in the same place and as big, but cut at the clip's full size and made crisp.

What it does, in turn:
  1. the clip's frames, as pictures (ffmpeg).
  2. THE KEY: the water lifted off each frame. What is behind the water at a pixel is taken from the same pixel at the
     nearest moments it was clear (before and after); how much water there is, is the least that explains the pixel over
     that ('colour to alpha'); it counts as water only if, with what is behind it taken away, it is bright and cyan or
     white (never her skin, her dress, the boss); inside its body the water keeps its own painted colour (nearly solid);
     its glow reaches only a little way from it (further off it is the flash's light on the land).
  3. what is not a cast's own is taken out (the sweep: the first cast's orb on the boss, and its splash there).
  4. BIG: each frame a cast keeps, cut to the cast's box, made 4 times as big by Real-ESRGAN's anime-video model
     (realesr-animevideov3.pth, BSD-3, from github.com/xinntao/Real-ESRGAN's releases; run here without PyTorch: its
     weights read out of the .pth, the net rebuilt for onnxruntime), and brought down by 3: 4/3 of the clip's size.
  5. MENDED: the water drawn on across the clip's girl (where she is before it, or shows through it).
  6. PACKED: a frame is mostly air, so it is kept as tiles (squares of 14 pixels with water in them, each with a rim of
     one pixel from its neighbours), and a map for every frame says where each square's tile is. A pixel is two numbers:
     how light the water is (red, 32 steps from 0.30 to 1) and how much of it there is (green, 64 steps); the game
     colours it with the cast's own ramp of colours, fitted here. Lossless WebP.

The frames a cast keeps, where the first textures' window was and how wide it was drawn (CASTS) were read off the first
textures themselves (each of their frames matched against the clip), so that a cast is where it was and as big.
Needs: ffmpeg, numpy, opencv, pillow, onnx, onnxruntime. About 20 minutes on two cores, 4 GB of memory.
"""
import sys, os, glob, json, subprocess, zipfile, pickle, collections
import numpy as np, cv2, onnx, onnxruntime as ort
from onnx import helper, TensorProto, numpy_helper
from PIL import Image

CLIP, MODEL = sys.argv[1], sys.argv[2]
OUT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'combo-water-trial')
WORK = sys.argv[4] if len(sys.argv) > 4 else '/tmp/water-casts'

# ---------------------------------------------------------------- the four casts
# the four casts: which frames of the clip (counted from 0), the window the first textures were cut with (x, y, w, h in
# the clip's pixels) and how wide that window was drawn in the game (m at 1.75 m: WATER_CASTS' width)
CASTS = {
    'jet':    dict(first=13,  last=27,  old_step=1, window=(429, 138, 576, 432), width=2.90),
    'sweep':  dict(first=44,  last=82,  old_step=2, window=(197, 36, 896, 672),  width=5.15),
    'orbit':  dict(first=97,  last=131, old_step=2, window=(194, 40, 896, 672),  width=4.55),
    'vortex': dict(first=152, last=190, old_step=2, window=(184, 3, 896, 672),   width=4.55),
}
# what is not the cast's own and is taken out: (first frame, last frame, x, y, radius, feather) discs in the clip's pixels.
# The sweep: the first cast's orb waiting on the boss, then its splash there (the game draws its own where a cast lands)
MASKS = {
    'sweep': [(44, 51, 605, 243, 30, 10), (60, 60, 622, 256, 98, 24), (61, 61, 620, 256, 132, 26), (62, 62, 620, 252, 158, 28), (63, 63, 616, 248, 172, 30),
              (64, 65, 612, 242, 184, 30), (66, 82, 610, 238, 196, 32)],
}

# ---------------------------------------------------------------- 1. the clip's frames
os.makedirs(WORK + '/src', exist_ok=True)
if not glob.glob(WORK + '/src/f_*.png'):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', CLIP, '-vsync', '0', WORK + '/src/f_%04d.png'], check=True)
SRC = sorted(glob.glob(WORK + '/src/f_*.png'))
N = len(SRC)

# ---------------------------------------------------------------- 2. the key
def load(i): return cv2.imread(SRC[i])[..., ::-1]                                  # RGB, uint8
def cyanness(c): return (c[..., 1] + c[..., 2]) * 0.5 - c[..., 0]                   # of a float picture
def luma(c): return c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114
def smooth(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def backgrounds(scale=1, frames=None):
    """for every frame: what is behind the water (two guesses: the last clear moment before, the first after)"""
    frames = frames or [load(i) for i in range(N)]
    H, W = frames[0].shape[:2]
    cy = np.empty((N, H, W), np.float32); lu = np.empty((N, H, W), np.float32)
    for i, f in enumerate(frames):
        c = f.astype(np.float32) / 255
        cy[i] = cyanness(c); lu[i] = luma(c)
    base_c = np.percentile(cy[::2], 20, axis=0); base_l = np.median(lu[::2], axis=0)
    k = max(3, int(round(11 * scale)) | 1)
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    clear = np.empty((N, H, W), bool)
    for i in range(N):
        v = ((cy[i] - base_c > 0.035) | (lu[i] - base_l > 0.12)).astype(np.uint8)
        clear[i] = cv2.dilate(v, ker) == 0
    del cy, lu
    prev = np.empty((N, H, W, 3), np.uint8); nxt = np.empty((N, H, W, 3), np.uint8)
    gp = np.empty((N, H, W), np.uint8); gn = np.empty((N, H, W), np.uint8)
    cur = frames[0].copy(); gap = np.zeros((H, W), np.uint8)
    for i in range(N):
        m = clear[i]; cur[m] = frames[i][m]; gap = np.where(m, 0, np.minimum(gap + 1, 250)).astype(np.uint8)
        prev[i] = cur; gp[i] = gap
    cur = frames[N - 1].copy(); gap = np.zeros((H, W), np.uint8)
    for i in range(N - 1, -1, -1):
        m = clear[i]; cur[m] = frames[i][m]; gap = np.where(m, 0, np.minimum(gap + 1, 250)).astype(np.uint8)
        nxt[i] = cur; gn[i] = gap
    return frames, prev, nxt, gp, gn

def alpha_min(c, b):
    """the least water that explains c over b (as 'colour to alpha' has it)"""
    up = (c - b) / np.maximum(1 - b, 1e-3); down = (b - c) / np.maximum(b, 1e-3)
    return np.clip(np.maximum(up, down).max(axis=-1), 0, 1)

def key(c8, bp8, bn8, scale=1, floor=0.035, core_at=0.34, reach=(5, 26)):
    c = c8.astype(np.float32) / 255
    cands = [bp8.astype(np.float32) / 255, bn8.astype(np.float32) / 255]
    # the guess nearer what is seen is what is behind (where there is water, either will do)
    d0 = np.abs(c - cands[0]).sum(-1); d1 = np.abs(c - cands[1]).sum(-1)
    b = np.where((d0 <= d1)[..., None], cands[0], cands[1])
    a = alpha_min(c, b)
    cy = cyanness(c); dcy = cy - cyanness(b)
    # water is cyan, or white: what the pixel would be with what is behind it taken away must be bright, and cyan or
    # white; never warm, never green (her skin, her dress, the cream of her sleeves), never dark (the boss as it sways)
    f0 = np.clip((c - (1 - a[..., None]) * b) / np.maximum(a[..., None], 1e-3), 0, 1)
    g_f = smooth(-0.07, -0.01, cyanness(f0)) * smooth(-0.2, -0.08, f0[..., 2] - f0[..., 1]) * smooth(0.35, 0.55, np.minimum(f0[..., 1], f0[..., 2]))
    g_more = np.maximum(smooth(0.012, 0.05, dcy), smooth(0.72, 0.88, c.min(-1)))      # more cyan than what is behind, or white
    a = a * g_f * g_more
    # the body of the water keeps its own painted colour: inside it (not along its edge) it is taken as nearly solid
    body = (a > 0.3).astype(np.uint8)
    ke = max(3, int(round(3 * scale)) | 1)
    inside = cv2.erode(body, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ke, ke)))
    inside = cv2.GaussianBlur(inside.astype(np.float32), (0, 0), 1.0 * scale)
    bright = smooth(0.5, 0.68, np.minimum(c[..., 1], c[..., 2]))       # (painted water is bright; the flash's light on the land is not)
    solid = inside * smooth(0.1, 0.26, cy) * bright * 0.92
    a = a + (1 - a) * solid
    # its glow reaches only a little way from the water itself: further off it is the flash's light on the land and on
    # the boss (their shapes would be drawn in fog), which the game's own land does not need
    core = ((a > core_at) & (np.minimum(c[..., 1], c[..., 2]) > 0.55)).astype(np.uint8)
    core = cv2.morphologyEx(core, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))) if scale >= 1 else core
    dist = cv2.distanceTransform(1 - core, cv2.DIST_L2, 3) / scale
    a = a * (1 - smooth(reach[0], reach[1], dist))
    a = np.clip((a - floor) / (1 - floor), 0, 1)                    # (the faintest haze goes: it would only be fog)
    f = np.clip((c - (1 - a[..., None]) * b) / np.maximum(a[..., None], 1e-3), 0, 1)
    return f, a

# ---------------------------------------------------------------- 4. big: the anime model, without PyTorch
def read_pth(path):
    z = zipfile.ZipFile(path)
    root = [n for n in z.namelist() if n.endswith('data.pkl')][0][:-len('data.pkl')]
    class Storage:
        def __init__(self, dtype, key): self.dtype, self.key = dtype, key
    def rebuild(storage, offset, size, stride, *rest):
        raw = np.frombuffer(z.read(root + 'data/' + storage.key), dtype=storage.dtype)
        n = int(np.prod(size)) if len(size) else 1
        return raw[offset:offset + n].reshape(size).copy()
    class U(pickle.Unpickler):
        def find_class(self, module, name):
            if name == '_rebuild_tensor_v2': return rebuild
            if name == 'FloatStorage': return np.float32
            if name == 'HalfStorage': return np.float16
            if name == 'OrderedDict':
                import collections; return collections.OrderedDict
            if name == '_rebuild_parameter': return lambda data, requires_grad, hooks: data
            return super().find_class(module, name)
        def persistent_load(self, pid):
            # ('storage', storage type, key, location, size)
            return Storage(pid[1], pid[2])
    return U(z.open(root + 'data.pkl')).load()

def build(path):
    sd = read_pth(path)
    sd = sd.get('params_ema', sd.get('params', sd))
    keys = list(sd.keys())
    nodes, inits = [], []
    def init(name, arr): inits.append(numpy_helper.from_array(np.ascontiguousarray(arr.astype(np.float32)), name)); return name
    x = 'x'; i = 0; last = max(int(k.split('.')[1]) for k in keys)
    while i <= last:
        w, b = sd['body.%d.weight' % i], sd['body.%d.bias' % i]
        out = 'c%d' % i
        nodes.append(helper.make_node('Conv', [x, init('w%d' % i, w), init('b%d' % i, b)], [out], pads=[1, 1, 1, 1]))
        x = out; i += 1
        if i <= last and ('body.%d.bias' % i) not in sd:                     # a PReLU: one slope per channel
            out = 'p%d' % i
            nodes.append(helper.make_node('PRelu', [x, init('s%d' % i, sd['body.%d.weight' % i].reshape(-1, 1, 1))], [out]))
            x = out; i += 1
    nodes.append(helper.make_node('DepthToSpace', [x], ['up'], blocksize=4, mode='CRD'))
    nodes.append(helper.make_node('Resize', ['x', '', init('scales', np.array([1, 1, 4, 4], np.float32))], ['base'], mode='nearest'))
    nodes.append(helper.make_node('Add', ['up', 'base'], ['y']))
    g = helper.make_graph(nodes, 'srvgg', [helper.make_tensor_value_info('x', TensorProto.FLOAT, [1, 3, None, None])],
                          [helper.make_tensor_value_info('y', TensorProto.FLOAT, [1, 3, None, None])], inits)
    m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 17)]); m.ir_version = 8
    onnx.checker.check_model(m)
    return m

_sess = None
def session():
    global _sess
    if _sess is None:
        so = ort.SessionOptions(); so.intra_op_num_threads = 2
        _sess = ort.InferenceSession(build(MODEL).SerializeToString(), so, providers=['CPUExecutionProvider'])
    return _sess

def model_x4(rgb):
    """rgb: float32 0..1, H x W x 3 -> the same picture 4 times as big"""
    H, W = rgb.shape[:2]
    pad = 8
    p = np.pad(rgb, ((pad, pad), (pad, pad), (0, 0)), mode='reflect')
    y = session().run(None, {'x': p.transpose(2, 0, 1)[None].astype(np.float32)})[0][0].transpose(1, 2, 0)
    return np.clip(y[pad * 4:(pad + H) * 4, pad * 4:(pad + W) * 4], 0, 1)

def bleed(rgb, a):
    """the colour of the water carried on outward into where there is none"""
    out = rgb * (a[..., None] > 0.02)
    w = (a > 0.02).astype(np.float32)
    acc, wacc = out * w[..., None], w.copy()
    for r in (1.5, 3, 6, 12, 24, 48):
        b = cv2.GaussianBlur(acc, (0, 0), r); bw = cv2.GaussianBlur(wacc, (0, 0), r)
        fill = b / np.maximum(bw[..., None], 1e-6)
        m = (wacc < 0.999)[..., None] & (bw[..., None] > 1e-4)
        acc = np.where(m, acc + fill * (1 - wacc[..., None]) * (bw[..., None] > 1e-4), acc)
        wacc = np.where(bw > 1e-4, 1.0, wacc)
    return np.where(w[..., None] > 0, rgb, np.clip(acc, 0, 1))
def big_x4(rgb, a):
    big = model_x4(bleed(rgb, a).astype(np.float32))
    al = model_x4(np.repeat(a[..., None], 3, -1).astype(np.float32)).mean(-1)
    return big, al

# ---------------------------------------------------------------- 5. mended: the water drawn on across the clip's girl
def girl(rgb):
    """rgb: the clip's frame, float 0..1 -> where she is (bool)"""
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1); sat = (mx - mn) / np.maximum(mx, 1e-3)
    skin = (R > 0.62) & (R - B > 0.13) & (R - G > 0.05) & (G > 0.4)
    cream = (R > 0.8) & (G > 0.68) & (B > 0.55) & (R - B > 0.07) & (R >= G)
    dress = (G > R + 0.02) & (G - B > 0.16) & (G > 0.35)
    dark = (mx < 0.45) & (R - B > 0.09) & (sat > 0.42) & (R > G)
    m = (skin | cream | dress | dark).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = np.zeros(n, bool); keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= 60
    m = keep[lab].astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((75, 5), np.uint8))          # (up and down: across a band of water)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 17), np.uint8))
    return m > 0
def mend(im, her):
    """im: the big keyed frame, BGRA uint8 (changed in place); her: where she is, at its size -> pixels mended"""
    a = im[..., 3]
    near = cv2.dilate((a > 30).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))) > 0
    fill = cv2.dilate(her.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    fill &= near
    if not fill.any() or not (a[~fill] > 30).any(): return 0
    f8 = fill.astype(np.uint8)
    im[..., :3] = cv2.inpaint(np.ascontiguousarray(im[..., :3]), f8, 8, cv2.INPAINT_TELEA)
    im[..., 3] = cv2.inpaint(np.ascontiguousarray(a), f8, 8, cv2.INPAINT_TELEA)
    return int(fill.sum())

# ---------------------------------------------------------------- the making
def cut(im, x0, y0, w, h):
    out = np.zeros((h, w) + im.shape[2:], im.dtype)
    sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(im.shape[1], x0 + w), min(im.shape[0], y0 + h)
    out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = im[sy0:sy1, sx0:sx1]
    return out
def frames_of(c): return list(range(c['first'], c['last'] + 1, c['old_step']))

# 2, 3: every frame the casts keep, keyed (BGRA pictures in WORK/key)
os.makedirs(WORK + '/key', exist_ok=True)
if not all(os.path.exists('%s/key/%s_%03d.png' % (WORK, n, fi)) for n, c in CASTS.items() for fi in frames_of(c)):
    print('the key ...', flush=True)
    _, prev, nxt, _, _ = backgrounds()
    yy, xx = np.mgrid[0:prev.shape[1], 0:prev.shape[2]].astype(np.float32)
    for name, c in CASTS.items():
        for fi in frames_of(c):
            f, a = key(load(fi), prev[fi], nxt[fi])
            for (f0, f1, x, y, r, soft) in MASKS.get(name, []):
                if f0 <= fi <= f1: a = a * smooth(r - soft, r, np.hypot(xx - x, yy - y))
            cv2.imwrite('%s/key/%s_%03d.png' % (WORK, name, fi), (np.dstack([f[..., ::-1], a[..., None]]) * 255 + 0.5).astype(np.uint8))
    del prev, nxt

# 4: made big (BGRA pictures in WORK/hi, and each cast's box in the clip)
UNIT = 21                                   # a box's sides are so many of the clip's pixels: 28 of ours, two tiles
os.makedirs(WORK + '/hi', exist_ok=True)
BOX = {}
for name, c in CASTS.items():
    b = [1e9, 1e9, -1, -1]
    for fi in frames_of(c):
        a = cv2.imread('%s/key/%s_%03d.png' % (WORK, name, fi), cv2.IMREAD_UNCHANGED)[..., 3]
        ys, xs = np.nonzero(a > 5)
        if len(xs): b = [min(b[0], xs.min()), min(b[1], ys.min()), max(b[2], xs.max() + 1), max(b[3], ys.max() + 1)]
    x0, y0, x1, y1 = b[0] - 6, b[1] - 6, b[2] + 6, b[3] + 6
    w = -(-(x1 - x0) // UNIT) * UNIT; h = -(-(y1 - y0) // UNIT) * UNIT
    x0 -= (w - (x1 - x0)) // 2; y0 -= (h - (y1 - y0)) // 2
    box = BOX[name] = (int(x0), int(y0), int(w), int(h))
    print(name, 'box', box, flush=True)
    for fi in frames_of(c):
        to = '%s/hi/%s_%03d.png' % (WORK, name, fi)
        if os.path.exists(to): continue
        im = cut(cv2.imread('%s/key/%s_%03d.png' % (WORK, name, fi), cv2.IMREAD_UNCHANGED), *box).astype(np.float32) / 255
        rgb, a = im[..., 2::-1], im[..., 3]
        if a.max() < 0.02:
            big = np.zeros((box[3] * 4 // 3, box[2] * 4 // 3, 4), np.uint8)
        else:
            # faint water (its glow, its edge) takes the colour of the solid water beside it: what was worked out for it
            # there is mostly what was behind it
            solid = np.where(a > 0.55, a, 0)
            near = bleed(rgb, solid) if solid.max() > 0 else rgb
            k = smooth(0.25, 0.55, a)[..., None]
            up, al = big_x4(near * (1 - k) + rgb * k, a)
            H, W = up.shape[:2]
            up = cv2.resize(up, (W // 3, H // 3), interpolation=cv2.INTER_AREA); al = cv2.resize(al, (W // 3, H // 3), interpolation=cv2.INTER_AREA)
            al = np.clip((al - 0.012) / (1 - 0.012), 0, 1)
            big = (np.dstack([up[..., ::-1], al]) * 255 + 0.5).astype(np.uint8)
        cv2.imwrite(to, big)

# ---------------------------------------------------------------- 5, 6. mended, and packed
# 6: a frame is mostly air, so it is kept as tiles (see the top)
T, PITCH, AW = 14, 16, 2048
GLOW = (4, 20)
DARK = 0.30                                 # the lightness kept: from this (0) to 1 (255), in 32 steps; alpha in 64
STOPS = [0.44 + 0.08 * k for k in range(8)]
LUMA = np.array([0.114, 0.587, 0.299], np.float32)          # (of a BGR picture)
HEAD = """// combo-water-trial/water-casts.js: what is in the four casts' pictures (water-jet.webp, water-sweep.webp,
// water-orbit.webp, water-vortex.webp), for magic-combo-fx.js. MADE by tools/make-water-casts.py: not written by hand.
//   size: the picture's (pixels); grid: the squares of a frame, across and down (a square: 14 pixels; its tile in the
//         picture: 16, with its rim)
//   origin: a frame's top left corner from where the cast is put (m at 1.75 m: to the right, up); cell: a square's
//         side (m); half: half the height the first textures' picture had (m: her wrap is counted in it)
//   frames: for each, [its map's place in the picture (x, y), the squares with water in them (x0, y0, x1, y1)]
//   ramp: the water's colour at lightness 0.44, 0.52 ... 1.0 (a pixel's red is its lightness, from 0.30 to 1; its
//         green how much water)
"""
meta = {}
for name, c in CASTS.items():
    info = {'box': BOX[name], 'frames': frames_of(c)}
    frames = [cv2.imread('%s/hi/%s_%03d.png' % (WORK, name, fi), cv2.IMREAD_UNCHANGED) for fi in info['frames']]
    H, W = frames[0].shape[:2]
    gw, gh = W // T, H // T
    # ---- the water drawn on across the clip's girl (girl, mend: above)
    for fi, im in zip(info['frames'], frames):
        her = girl(load(fi).astype(np.float32) / 255)
        her = cv2.resize(cut(her.astype(np.uint8), *info['box']), (W, H), interpolation=cv2.INTER_LINEAR) > 0
        mend(im, her)
    assert gw * T == W and gh * T == H, (W, H)
    # ---- the glow round the water is drawn in a little (GLOW pixels from water to nothing: a wide soft glow is most of
    # what a picture would hold, and reads as blur); faint specks that stand alone go (bits of her outline the key let
    # through); water and its glow stay
    for im in frames:
        a = im[..., 3]
        core = (a > 76).astype(np.uint8)
        dist = cv2.distanceTransform(1 - core, cv2.DIST_L2, 3)
        k = np.clip((dist - GLOW[0]) / (GLOW[1] - GLOW[0]), 0, 1)
        a[:] = (a * (1 - k * k * (3 - 2 * k)) + 0.5).astype(np.uint8)
        n, lab, stats, _ = cv2.connectedComponentsWithStats((a > 20).astype(np.uint8), connectivity=8)
        if n > 1:
            peak = np.zeros(n, np.uint8); np.maximum.at(peak, lab.ravel(), a.ravel())
            drop = peak < 72
            drop[0] = False
            # (and what little is left round a dropped speck)
            kill = cv2.dilate(drop[lab].astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
            keep = cv2.dilate((~drop[lab] & (lab > 0)).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
            a[kill & ~keep] = 0
        a[a < 3] = 0
    # ---- the cast's colours: the middle colour of its solid water at each lightness
    px = np.concatenate([im[im[..., 3] > 215][:, :3] for im in frames]).astype(np.float32) / 255
    l = px @ LUMA
    ramp = []
    for s in STOPS:
        m = np.abs(l - s) < 0.03
        ramp.append(np.median(px[m], axis=0)[::-1] if m.sum() > 300 else None)
    known = [i for i, r in enumerate(ramp) if r is not None]
    for i in range(len(ramp)):
        if ramp[i] is None:
            j = min(known, key=lambda k: abs(k - i))
            ramp[i] = np.clip(ramp[j] * (STOPS[i] / STOPS[j]), 0, 1)       # (as the nearest, lighter or darker)
    ramp[-1] = np.maximum(ramp[-1], [0.97, 1.0, 1.0])
    # ---- tiles
    tiles = [np.zeros((PITCH, PITCH, 2), np.uint8)]                         # (the empty one)
    maps, boxes = [], []
    for im in frames:
        l = np.clip((im[..., :3].astype(np.float32) / 255 @ LUMA - DARK) / (1 - DARK), 0, 1)
        w8 = (np.round(l * 31) * (255 / 31) + 0.5).astype(np.uint8)
        a8 = (np.round(im[..., 3].astype(np.float32) / 255 * 63) * (255 / 63) + 0.5).astype(np.uint8)
        im[..., 3] = a8
        two = np.dstack([w8, a8])
        pad = np.pad(two, ((1, 1), (1, 1), (0, 0)), mode='edge')
        pad[0, :, 1] = 0; pad[-1, :, 1] = 0; pad[:, 0, 1] = 0; pad[:, -1, 1] = 0
        occ = im[..., 3].reshape(gh, T, gw, T).max(axis=(1, 3)) > 0
        m = np.zeros((gh, gw, 2), np.uint8)
        for cy, cx in zip(*np.nonzero(occ)):
            slot = len(tiles)
            tiles.append(pad[cy * T:cy * T + PITCH, cx * T:cx * T + PITCH])
            m[cy, cx] = (slot % (AW // PITCH), slot // (AW // PITCH))
        maps.append(m)
        ys, xs = np.nonzero(occ)
        boxes.append([int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1] if len(xs) else [0, 0, 0, 0])
    per = AW // PITCH
    trows = -(-len(tiles) // per)
    assert trows <= 256, trows
    mrow = AW // gw                                                         # maps side by side
    mrows = -(-len(maps) // mrow)
    AH = trows * PITCH + mrows * gh
    atlas = np.zeros((AH, AW, 3), np.uint8)
    for i, t in enumerate(tiles):
        y, x = (i // per) * PITCH, (i % per) * PITCH
        atlas[y:y + PITCH, x:x + PITCH, :2] = t
    blocks = []
    for i, m in enumerate(maps):
        x, y = (i % mrow) * gw, trows * PITCH + (i // mrow) * gh
        atlas[y:y + gh, x:x + gw, :2] = m
        blocks.append([x, y])
    Image.fromarray(atlas, 'RGB').save('%s/water-%s.webp' % (OUT, name), lossless=True, quality=100, method=6)
    wx, wy, ww, wh = c['window']; bx, by, bw, bh = info['box']
    mpp = c['width'] / ww                                                   # m to a pixel of the clip
    meta[name] = dict(
        size=[AW, AH], grid=[gw, gh],
        origin=[round((bx - (wx + ww / 2)) * mpp, 4), round(-(by - (wy + wh / 2)) * mpp, 4)],      # the frame's top left corner from where the cast is put (m: to the right, up)
        cell=round(T * 0.75 * mpp, 5),                                      # a square's side (m)
        half=round(0.375 * c['width'], 4),                                  # (half the height of the first textures' picture: the wrap round her is counted in it)
        frames=[b + box for b, box in zip(blocks, boxes)],                  # [map x, map y, the squares with water: x0, y0, x1, y1]
        ramp=[[round(float(v), 3) for v in r] for r in ramp],
    )
    kb = os.path.getsize('%s/water-%s.webp' % (OUT, name)) / 1024
    print('%-7s frames %d  %dx%d px  grid %dx%d  tiles %d  picture %dx%d (%.1f MB as it is held, %.0f kB to fetch)' % (name, len(frames), W, H, gw, gh, len(tiles), AW, AH, AW * AH * 2 / 1e6, kb))
if True:
    lines = ['  %s: {\n    size: %s, grid: %s, origin: %s, cell: %s, half: %s,\n    frames: %s,\n    ramp: %s,\n  },' % (
        n, json.dumps(m['size']), json.dumps(m['grid']), json.dumps(m['origin']), m['cell'], m['half'],
        json.dumps(m['frames']).replace('], [', '],[').replace(', ', ','), json.dumps(m['ramp'])) for n, m in meta.items()]
    open('%s/water-casts.js' % OUT, 'w').write(HEAD + 'export const WATER_SHEETS = {\n' + '\n'.join(lines) + '\n};\n')
