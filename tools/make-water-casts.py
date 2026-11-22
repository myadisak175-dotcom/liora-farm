#!/usr/bin/env python3
"""
tools/make-water-casts.py  —  the pictures of her four water casts (the normal combo's, on its trial page for now:
combo-water-trial/water-jet.webp, water-sweep.webp, water-orbit.webp, water-vortex.webp), of the bolt of water they
throw and of the splash where it lands (water-bolt.webp, water-hit.webp), of a band of the same water for her waves
and rings (water-blade.webp), and water-casts.js, which says what is in
them: all made from the clip the casts were asked after (22 Nov 2026: ten seconds made with Gemini, a girl's four
water casts before the plant boss, 1280 x 720, 24 pictures a second; the clip itself is not kept here).

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
  3. what is not a picture's own is taken out, and what the clip's girl hides is drawn again (the turn's burst, the
     finisher's whirl: HER). The sweep: the first cast's orb on the boss, and its splash there. The
     first cast (the jet): its bolt of water, which is a picture of its own now and flies where the game throws it
     (it is followed through the clip's frames: BOLT). The bolt: everything but itself; each of its frames made as
     big as the others (in the clip it shrinks as it flies away). The splash: everything but itself, and the orb
     the clip leaves in its middle. The sweep again: her legs, which show through it as it passes before them (LEGS).
  4. BIG: each frame a cast keeps, cut to the cast's box, made 4 times as big by Real-ESRGAN's anime-video model
     (realesr-animevideov3.pth, BSD-3, from github.com/xinntao/Real-ESRGAN's releases; run here without PyTorch: its
     weights read out of the .pth, the net rebuilt for onnxruntime), and brought down by 3: 4/3 of the clip's size.
  5. MENDED: the jet's water drawn on across the clip's girl (where she is before it, or shows through it).
     And THE BLADE (water-blade.webp): the sweep's crescent, in three of its frames, laid out straight (BLADE): a strip
     of the clip's water for the game to lay along a wave (the turn's, the rising cast's) and round a ring on the ground.
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

# The clip's girl stands before the turn's burst and before the finisher's whirl. Keyed, the water has a hole her
# shape there, and where their flash lights her she is taken for water and stays in the picture, a small pale girl in
# the middle of the cast ("อันไหนใช้ไม่ได้ก็วาดใหม่ ... วาดใหม่บาง sprite ให้ style มันเข้ากัน", 22 Nov 2026). So she is taken out
# whole, and the cast is drawn again where she was, from itself:
#   her head and hands (oval: x, y, rx, ry in the clip's pixels; the cast's middle is in it): 'small' is the cast
#       itself made smaller about its middle, again and again inward (a burst's rays run on in to their point, a
#       whirl winds on in, a dome has domes in it), turned and sized so that it meets the water round the oval as well
#       as it can (the middle is looked for near `middle`); 'soft' is the glow round the oval run in across it (a
#       cast nearly gone has no such shape to make small); 'clear' is nothing
#   her body below (found by her colours, in the frames `pose` and the frame itself, within `wide` of the oval's
#       middle): 'across' is what is across the middle from it (a burst is alike all round), 'along' is the water at
#       either side of her drawn on along the rounds about the middle (a whirl's bands; to `far` from the middle:
#       feathered from, to; each side's water turned over into her place, so that it stays as crisp as it is there:
#       run in evenly it was smoother than the whirl round it, "เก็บงานที่ไม่เนียนทั้งหมด"), 'none' is nothing
#   keep: what is plainly water stays where she is (the orbit's rounds pass before her legs; and late in a cast, when
#       her arms come down, all of her width is looked at and only the drops stay)
# how: (first frame, last frame, her body, her head and hands, keep)
HER = {
    'orbit':  dict(oval=(636, 351, 66, 60), middle=(625, 335), pose=range(107, 125, 2), wide=95, far=(280, 300),
                   how=((103, 103, 'none', 'soft', False), (105, 123, 'across', 'small', True))),
    'vortex': dict(oval=(629, 360, 70, 56), middle=(635, 350), pose=range(154, 182, 2), wide=100, far=(150, 185),
                   how=((152, 152, 'none', 'clear', False), (154, 156, 'along', 'small', False), (158, 160, 'across', 'small', False),
                        (162, 172, 'along', 'small', False), (174, 176, 'none', 'small', True), (178, 180, 'none', 'soft', True))),
}
# The sweep passes before her legs (the clip's frames 62 to 70) and they show through it: paler where the water is
# thin, a notch where it is thick. Her legs stand still meanwhile, so where they are is read off the frames before and
# after (pose), below y, within `wide` of x; there the water is drawn across evenly from its two sides, along the
# band's own slope (the one, of `slopes`, for which the two sides are most alike); most: a gap wider than this is
# left alone (the clip's pixels)
LEGS = dict(first=62, last=70, pose=(54, 55, 56, 57, 58, 59, 60, 72, 73, 74, 75, 76), x=645, wide=110, y=455, most=70, slopes=np.linspace(-0.6, 0.6, 25))
# The blade: the sweep's crescent in these frames, laid out straight, its head at the left, its outer edge up. long,
# across: a strip's size (pixels: 37 squares by 8)
BLADE = dict(frames=[50, 56, 58], long=518, across=112)
# ... and as those two begin, their flash lights her legs, which the key takes for water: in those frames (first, last)
# nothing below this height of the clip is the cast's (y, feather)
FLOOR = {'orbit': (97, 107, 472, 14), 'vortex': (152, 156, 455, 14)}

# The first cast's bolt of water and the splash where it lands on the boss, the clip's own (its frames 19 to 42), for
# what her casts throw and where that lands, in place of the game's own orb and burst ("ลูกบอลน้ำไม่เอาอันเก่าแล้ว effect
# ใช้ชุดใหม่ให้หมด", 22 Nov 2026).
# BOLT: how the bolt is followed. first, last: the frames it is clear of the flash; guess: about where its head is at
#       two of them (frame, x, y); axis: from its head to the end of its tail (the clip's pixels: across, down); like:
#       the frame whose size the others are made (it shrinks as it flies away); round: how far from it is still its
#       own (pixels: kept for its picture; taken out of the jet's `wider` more), and the feather of that; early: where
#       its head is in the frames before, when it is still one with the flash at her hand (read off the frames; there
#       its tail ends `short` pixels before the flash's middle, `flash`)
# SPRITES: frames; box: a frame's size (the clip's pixels); at: where in it the bolt's head, the splash's middle, is;
#       ref: so many of the clip's pixels are 1 in the game's reckoning (the bolt: its length; the splash: how far it
#       reaches), which the game makes as many metres as it wants. hit: middle: where on the boss; keep: only so far
#       from it (radius, feather); orb: from this frame on the orb left in its middle is taken out (radius, feather);
#       tail: before this frame what is left of the bolt's tail is taken out, outside the splash itself (from so far
#       out along the bolt's axis, and so much further each frame as the splash grows, to so far; radius, feather):
#       the game's bolt may have come from any side
BOLT = dict(first=19, last=30, guess=((19, 660, 300), (29, 610, 250)), axis=(0.65, 0.76), like=26, round=(46, 14), wider=12,
            early={15: (700, 347), 16: (682, 328), 17: (676, 312), 18: (668, 306)}, flash=(738, 353), short=26)
SPRITES = {
    'bolt': dict(frames=list(range(25, 30)), box=(210, 210), at=(70, 70), ref=120.0),
    'hit':  dict(frames=list(range(32, 43)), box=(336, 336), at=(168, 168), ref=125.0, middle=(598, 240), keep=(160, 22), orb=(38, 40, 12),
                 tail=(36, 64, 11, 190, 14, 8)),
    'blade': dict(frames=BLADE['frames'], box=(BLADE['long'], BLADE['across']), at=(0, 0), ref=float(BLADE['long'])),
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
def body(rgb):
    """rgb: the clip's frame, float 0..1 -> where her skin, her dress and her boots are (uint8; her hair is not found)"""
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
    return keep[lab].astype(np.uint8)
def girl(rgb):
    """rgb: the clip's frame, float 0..1 -> where she is (bool)"""
    m = cv2.morphologyEx(body(rgb), cv2.MORPH_CLOSE, np.ones((75, 5), np.uint8))   # (up and down: across a band of water)
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
SHEETS = {**{n: dict(c, frames=frames_of(c)) for n, c in CASTS.items()}, **SPRITES}

# 2: every frame a picture keeps, keyed whole (BGRA pictures in WORK/key)
os.makedirs(WORK + '/key', exist_ok=True)
NEED = sorted({fi for sh in SHEETS.values() for fi in sh['frames']} | set(range(BOLT['first'], BOLT['last'] + 1)))
if not all(os.path.exists('%s/key/f_%03d.png' % (WORK, fi)) for fi in NEED):
    print('the key ...', flush=True)
    _, prev, nxt, _, _ = backgrounds()
    for fi in NEED:
        f, a = key(load(fi), prev[fi], nxt[fi])
        cv2.imwrite('%s/key/f_%03d.png' % (WORK, fi), (np.dstack([f[..., ::-1], a[..., None]]) * 255 + 0.5).astype(np.uint8))
    del prev, nxt
def keyed(fi): return cv2.imread('%s/key/f_%03d.png' % (WORK, fi), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255      # BGRA, 0..1

# 3: the bolt followed (TRACK: for a frame, its head's x and y, how big its body is, how long it and the drops behind it
# are, and the way from its head to its tail's end), and what is not a picture's own taken out
def follow():
    (f0, x0, y0), (f1, x1, y1) = BOLT['guess']
    ax, ay = BOLT['axis']
    out = {}
    for fi in range(BOLT['first'], BOLT['last'] + 1):
        a = keyed(fi)[..., 3]
        fat = cv2.morphologyEx((a > 0.55).astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
        n, lab, stats, cen = cv2.connectedComponentsWithStats(fat, connectivity=8)
        gx, gy = x0 + (x1 - x0) * (fi - f0) / (f1 - f0), y0 + (y1 - y0) * (fi - f0) / (f1 - f0)
        near = [(np.hypot(cen[i][0] - gx, cen[i][1] - gy), i) for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] > 150]
        d, i = min(near)
        assert d < 60, (fi, d)
        ys, xs = np.nonzero(lab == i)
        along = xs * ax + ys * ay
        front = along < np.percentile(along, 45)                       # (its head: the half of it furthest from its tail's end)
        out[fi] = (float(xs[front].mean()), float(ys[front].mean()), float(stats[i, cv2.CC_STAT_AREA]), float(along.max() - along.min()) + 30, ax, ay)
    # before it is clear of the flash: its head as read off the frames, its tail toward the flash's middle
    for fi, (x, y) in BOLT['early'].items():
        dx, dy = BOLT['flash'][0] - x, BOLT['flash'][1] - y; far = float(np.hypot(dx, dy))
        out[fi] = (float(x), float(y), out[BOLT['first']][2], max(0.0, far - BOLT['short']), dx / far, dy / far)
    return out
TRACK = follow()
YY, XX = np.mgrid[0:720, 0:1280].astype(np.float32)
def round_bolt(fi, wider=0):
    """1 where the bolt is (its head, its tail and the drops by it), 0 away from it"""
    hx, hy, _, long, ax, ay = TRACK[fi]
    r, soft = BOLT['round'][0] + wider, BOLT['round'][1]
    t = np.clip((XX - hx) * ax + (YY - hy) * ay, -10, long)             # (the nearest place on the line from its head to its tail's end)
    return 1 - smooth(r - soft, r, np.hypot(XX - hx - ax * t, YY - hy - ay * t))
POSE = {}
def shape(name, fi):
    """where the clip's girl's body is below her oval, with room about it (float, feathered)"""
    h = HER[name]; ox, oy, rx, ry = h['oval']
    if name not in POSE:
        m = np.zeros((720, 1280), np.uint8)
        for f in h['pose']: m |= body(load(f).astype(np.float32) / 255)
        POSE[name] = m
    m = POSE[name] | body(load(fi).astype(np.float32) / 255)
    m[(np.abs(XX - ox) > h['wide']) | (YY < oy)] = 0
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), 3)
def small(c, k, deg):
    """the 2x3 matrix that takes a point to the one k times as far from c, turned deg about it"""
    t = np.deg2rad(deg); co, si = k * np.cos(t), k * np.sin(t)
    return np.float32([[co, -si, c[0] - co * c[0] + si * c[1]], [si, co, c[1] - si * c[0] - co * c[1]]])
def drawn_on(img, bad, round_=False):
    """img[t, j]: for every j, each run of t that `bad` marks is drawn in from the water at its two ends, each end's
    turned over into it (so that it stays as crisp as it is there) and the two mixed across the run's middle;
    round_: t goes round (its last is next to its first)"""
    n = img.shape[0]
    for j in range(img.shape[1]):
        b = bad[:, j]
        if not b.any() or (~b).sum() < n * 0.2: continue
        k0 = int(np.argmax(~b)) if round_ else 0
        b = np.roll(b, -k0); col = np.roll(img[:, j], -k0, axis=0)
        e = np.diff(np.concatenate([[0], b.astype(np.int8), [0]]))
        for a, z in zip(np.nonzero(e == 1)[0], np.nonzero(e == -1)[0]):          # the run: a .. z - 1
            i = np.arange(z - a)
            lt = a - 1 - i; rt = z + (z - a - 1 - i)
            if round_: lt %= n; rt %= n
            okl = (lt >= 0) & ~b[np.clip(lt, 0, n - 1)]; okr = (rt < n) & ~b[np.clip(rt, 0, n - 1)]
            L = np.where(okl[:, None], col[np.clip(lt, 0, n - 1)], col[a - 1] if a > 0 else 0)
            R = np.where(okr[:, None], col[np.clip(rt, 0, n - 1)], col[z] if z < n else (col[0] if round_ else 0))
            if a == 0 and not round_: w = np.ones((z - a, 1), np.float32)
            elif z == n and not round_: w = np.zeros((z - a, 1), np.float32)
            else: w = smooth(0.3, 0.7, (i + 0.5) / (z - a))[:, None].astype(np.float32)
            col[a:z] = L * (1 - w) + R * w
        img[:, j] = np.roll(col, k0, axis=0)
    return img
def along(pm, cover, c, far=300, steps=1080):
    """pm with what `cover` covers drawn on along the rounds about c, from the water at either side of it"""
    pol = cv2.warpPolar(pm, (far, steps), c, far, cv2.WARP_POLAR_LINEAR | cv2.INTER_LINEAR)      # rows: the way round; columns: how far out
    cov = cv2.warpPolar(cover, (far, steps), c, far, cv2.WARP_POLAR_LINEAR | cv2.INTER_LINEAR)
    pol = drawn_on(pol, cov >= 0.03, True)
    return cv2.warpPolar(pol, (1280, 720), c, far, cv2.WARP_POLAR_LINEAR | cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
LEGS_AT = {}
def legs(fi, im):
    """the sweep's keyed frame with her legs out of the water that passes before them (LEGS)"""
    if not LEGS['first'] <= fi <= LEGS['last']: return im
    if 'm' not in LEGS_AT:
        m = np.zeros((720, 1280), np.uint8)
        for f in LEGS['pose']: m |= body(load(f).astype(np.float32) / 255)
        m[(np.abs(XX - LEGS['x']) > LEGS['wide']) | (YY < LEGS['y'])] = 0
        LEGS_AT['m'] = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    bad = LEGS_AT['m']
    pm = im.copy(); pm[..., :3] *= pm[..., 3:]
    def slid(a, sl, back=False):
        M = np.float32([[1, 0, 0], [-sl, 1, sl * LEGS['x']]])
        return cv2.warpAffine(a, M, (1280, 720), flags=cv2.INTER_LINEAR | (cv2.WARP_INVERSE_MAP if back else 0))
    def runs(b, y):
        e = np.diff(np.concatenate([[0], b[y].astype(np.int8), [0]]))
        return [(a, z) for a, z in zip(np.nonzero(e == 1)[0], np.nonzero(e == -1)[0]) if z - a <= LEGS['most'] and a >= 5 and z <= 1275]
    best = None
    for sl in LEGS['slopes']:
        p = slid(pm, sl); b = slid(bad, sl) > 0
        err, n = 0.0, 0
        for y in np.nonzero(b.any(axis=1))[0][::3]:
            for a, z in runs(b, y):
                l, r = np.median(p[y, a - 5:a], axis=0), np.median(p[y, z:z + 5], axis=0)
                if max(l[3], r[3]) < 0.2: continue
                err += float(np.abs(l - r).sum()); n += 1
        if n and (best is None or err / n < best[0]): best = (err / n, sl)
    sl = best[1] if best else 0.0
    p = slid(pm, sl); b = slid(bad, sl) > 0
    for y in np.nonzero(b.any(axis=1))[0]:
        for a, z in runs(b, y):
            l, r = np.median(p[y, a - 5:a], axis=0), np.median(p[y, z:z + 5], axis=0)
            w = ((np.arange(z - a) + 0.5) / (z - a))[:, None]
            p[y, a:z] = l * (1 - w) + r * w
    S = cv2.GaussianBlur(bad.astype(np.float32), (0, 0), 1.5)[..., None]
    out = pm * (1 - S) + slid(p, sl, True) * S
    a = np.clip(out[..., 3:], 0, 1)
    out[..., :3] = np.where(a > 1e-3, out[..., :3] / np.maximum(a, 1e-3), 0); out[..., 3:] = a
    return np.clip(out, 0, 1)
def straight(fi):
    """the sweep's crescent in its big frame fi, laid out straight (BLADE): BGRA, uint8"""
    L, Hh = BLADE['long'], BLADE['across'] // 2
    im = cv2.imread('%s/hi/sweep_%03d.png' % (WORK, fi), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
    a = im[..., 3]
    n, lab, stats, cen = cv2.connectedComponentsWithStats((a > 0.35).astype(np.uint8), connectivity=8)
    ys, xs = np.nonzero(lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    (cx, cy), _, _ = cv2.fitEllipse(np.ascontiguousarray(np.stack([xs, ys], 1)[::7].astype(np.float32).reshape(-1, 1, 2)))
    # about the middle of the round it is part of: for each way round, how far out the crescent's middle is
    N = 720; th = np.arctan2(ys - cy, xs - cx); r = np.hypot(xs - cx, ys - cy); w = a[ys, xs]
    b = ((th + np.pi) / (2 * np.pi) * N).astype(int) % N
    sw = np.bincount(b, w, N); sr = np.bincount(b, w * r, N)
    k = np.ones(15) / 15
    wrap = lambda v: np.convolve(np.concatenate([v[-7:], v, v[:7]]), k, 'valid')
    rr = wrap(sr) / np.maximum(wrap(sw), 1e-6)
    idx = np.nonzero(sw > 3)[0]                                             # (the longest run of ways round that have it)
    gaps = np.diff(np.concatenate([idx, [idx[0] + N]])); g = np.argmax(gaps)
    order = (idx[(g + 1) % len(idx)] + np.arange(N - gaps[g] + 1)) % N
    t = (order + 0.5) / N * 2 * np.pi - np.pi
    soft = lambda v: cv2.GaussianBlur(v.reshape(1, -1), (0, 0), 6, borderType=cv2.BORDER_REPLICATE)[0]
    px, py = soft(cx + rr[order] * np.cos(t)), soft(cy + rr[order] * np.sin(t))
    # (on a little past both its ends, the way it leaves by)
    more = 26; step = np.hypot(np.diff(px), np.diff(py)).mean()
    d0 = np.array([px[0] - px[6], py[0] - py[6]]); d0 /= np.linalg.norm(d0); d1 = np.array([px[-1] - px[-7], py[-1] - py[-7]]); d1 /= np.linalg.norm(d1)
    px = np.concatenate([px[0] + d0[0] * step * np.arange(more, 0, -1), px, px[-1] + d1[0] * step * np.arange(1, more + 1)])
    py = np.concatenate([py[0] + d0[1] * step * np.arange(more, 0, -1), py, py[-1] + d1[1] * step * np.arange(1, more + 1)])
    far = np.concatenate([[0], np.cumsum(np.hypot(np.diff(px), np.diff(py)))])
    u = np.linspace(0, far[-1], L); X = np.interp(u, far, px); Y = np.interp(u, far, py)
    tx, ty = np.gradient(X), np.gradient(Y); nrm = np.hypot(tx, ty); nx, ny = -ty / nrm, tx / nrm
    if np.mean(nx * (X - cx) + ny * (Y - cy)) < 0: nx, ny = -nx, -ny           # (out: away from the middle)
    d = np.linspace(Hh, -Hh, 2 * Hh)[:, None] * far[-1] / L                     # rows: from its outer edge to its inner, as big as along it
    pm = im.copy(); pm[..., :3] *= pm[..., 3:]
    out = cv2.remap(pm, (X[None] + nx[None] * d).astype(np.float32), (Y[None] + ny[None] * d).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    al = out[..., 3:]
    out[..., :3] = np.where(al > 1e-3, out[..., :3] / np.maximum(al, 1e-3), 0)
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)
def run_in(pm, known):
    """pm (premultiplied) run in from where it is known across where it is not, the nearest water counting most"""
    out = np.zeros_like(pm); got = np.zeros(known.shape, np.float32)
    for s in (2, 4, 8, 16, 32, 64):
        w = cv2.GaussianBlur(known, (0, 0), s); v = cv2.GaussianBlur(pm * known[..., None], (0, 0), s)
        take = (1 - got) * smooth(0.05, 0.35, w)
        out += v / np.maximum(w, 1e-4)[..., None] * take[..., None]; got += take
    return out
def redrawn(name, fi, im):
    """the keyed frame with the clip's girl out of it and the cast drawn again where she was (HER)"""
    h = HER[name]; how = [k[2:] for k in h['how'] if k[0] <= fi <= k[1]]
    if not how: return im
    low, mid, keep = how[0]
    pm = im.copy(); pm[..., :3] *= pm[..., 3:]
    ox, oy, rx, ry = h['oval']
    d = np.hypot((XX - ox) / rx, (YY - oy) / ry)
    E = 1 - smooth(0.86, 1.0, d)
    S = shape(name, fi)
    if keep:
        if low == 'none': S = np.maximum(S, (1 - smooth(h['wide'] - 12, h['wide'], np.abs(XX - ox))) * smooth(oy, oy + 14, YY))
        b, g, r, a = im[..., 0], im[..., 1], im[..., 2], im[..., 3]
        water = smooth(0.45, 0.65, a) * smooth(0.5, 0.66, (g + b) * 0.5) * smooth(-0.03, 0.03, np.minimum(g, b) - r)
        water = cv2.erode(water, np.ones((3, 3), np.uint8))
        S = S * (1 - cv2.GaussianBlur(water, (0, 0), 1.2))
    both = np.maximum(S, E); clear = pm * (1 - both)[..., None]
    def done(out):
        a = np.clip(out[..., 3:], 0, 1)
        out[..., :3] = np.where(a > 1e-3, out[..., :3] / np.maximum(a, 1e-3), 0); out[..., 3:] = a
        return np.clip(out, 0, 1)
    if mid == 'clear': return done(clear)
    if mid == 'soft':
        return done(clear + run_in(clear, 1 - smooth(0.02, 0.4, both)) * E[..., None])
    # ---- the middle, the size and the turn: those for which the ring of water just outside the oval is most like
    # what it would be drawn from (the oval's own edge then meets it). What it is drawn from has her body's width
    # below the oval filled from across the middle, whatever is done with her body in the picture
    col = (1 - smooth(60, 78, np.abs(XX - ox))) * smooth(oy - 10, oy + 14, YY)
    def source(c):
        back = cv2.warpAffine(pm * (1 - np.maximum(col, E))[..., None], cv2.getRotationMatrix2D(c, 180, 1.0), (1280, 720), flags=cv2.INTER_LINEAR)
        return pm * (1 - col[..., None]) + back * col[..., None]
    ring = (d > 1.0) & (d < 1.22) & (col < 0.5)
    py, px = np.nonzero(ring); P = np.stack([px, py, np.ones_like(px)], 0).astype(np.float32)
    best = None
    for cx in range(-16, 17, 8):
        for cy in range(-16, 17, 8):
            c = (h['middle'][0] + cx, h['middle'][1] + cy); src = cv2.GaussianBlur(source(c), (0, 0), 1.5)
            want = src[py, px]
            for k in (1.6, 2.0):
                for deg in range(-180, 180, 10):
                    q = small(c, k, deg) @ P
                    got = cv2.remap(src, q[0].reshape(-1, 1), q[1].reshape(-1, 1), cv2.INTER_LINEAR)[:, 0]
                    err = float(np.abs(got - want).mean()) + 0.00004 * abs(deg)
                    if best is None or err < best[0]: best = (err, c, k, deg)
    err, c, k, deg = best
    # ---- her body
    base = clear
    if low == 'along':
        base = clear + along(clear, both, c) * (S * (1 - E) * (1 - smooth(h['far'][0], h['far'][1], np.hypot(XX - c[0], YY - c[1]))))[..., None]
    elif low == 'across':
        base = clear + cv2.warpAffine(clear, cv2.getRotationMatrix2D(c, 180, 1.0), (1280, 720), flags=cv2.INTER_LINEAR) * (S * (1 - E))[..., None]
    # ---- her head and hands: nine times inward (to a pixel of the middle; the very middle, too small to draw, is even)
    fill = base; M = small(c, k, deg)
    for i in range(9):
        s = cv2.warpAffine(cv2.GaussianBlur(fill, (0, 0), 0.7), M, (1280, 720), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
        fill = base + s * E[..., None]
    core = (1 - smooth(5, 12, np.hypot(XX - c[0], YY - c[1]))) * E
    return done(fill * (1 - core[..., None]) + cv2.GaussianBlur(fill, (0, 0), 5) * core[..., None])
def own(name, fi):
    """the keyed frame with only what is this picture's own left in it (BGRA, 0..1)"""
    im = keyed(fi); a = im[..., 3]
    if name in CASTS:
        for (f0, f1, x, y, r, soft) in MASKS.get(name, []):
            if f0 <= fi <= f1: a *= smooth(r - soft, r, np.hypot(XX - x, YY - y))
        if name == 'jet' and fi in TRACK: a *= 1 - round_bolt(fi, BOLT['wider'])
        if name in FLOOR and FLOOR[name][0] <= fi <= FLOOR[name][1]: a *= 1 - smooth(FLOOR[name][2] - FLOOR[name][3], FLOOR[name][2], YY)
        if name == 'sweep': im = legs(fi, im)
        if name in HER:
            im = redrawn(name, fi, im)
            if name in FLOOR and FLOOR[name][0] <= fi <= FLOOR[name][1]: im[..., 3] *= 1 - smooth(FLOOR[name][2] - FLOOR[name][3], FLOOR[name][2], YY)      # (what was drawn in stops there too)
    elif name == 'bolt':
        a *= round_bolt(fi)
    elif name == 'hit':
        sh = SPRITES['hit']; d = np.hypot(XX - sh['middle'][0], YY - sh['middle'][1])
        a *= 1 - smooth(sh['keep'][0] - sh['keep'][1], sh['keep'][0], d)
        if fi >= sh['orb'][0]: a *= smooth(sh['orb'][1] - sh['orb'][2], sh['orb'][1], d)
        if fi < sh['tail'][0]:
            _, near, more, far, r, soft = sh['tail']; ax, ay = BOLT['axis']
            t = np.clip((XX - sh['middle'][0]) * ax + (YY - sh['middle'][1]) * ay, near + more * (fi - sh['frames'][0]), far)
            a *= smooth(r - soft, r, np.hypot(XX - sh['middle'][0] - ax * t, YY - sh['middle'][1] - ay * t))
    return im
def placed(im, x, y, s, w, h, at):
    """a frame (BGRA, 0..1) with its point (x, y) put at `at` of a picture w by h, s times as big"""
    pm = im.copy(); pm[..., :3] *= pm[..., 3:]
    M = np.array([[s, 0, at[0] - s * x], [0, s, at[1] - s * y]], np.float32)
    out = cv2.warpAffine(pm, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    a = np.clip(out[..., 3:], 0, 1)
    out[..., :3] = np.where(a > 1e-3, out[..., :3] / np.maximum(a, 1e-3), 0); out[..., 3:] = a
    return np.clip(out, 0, 1)

# 4: made big (BGRA pictures in WORK/hi, and each cast's box in the clip)
UNIT = 21                                   # a box's sides are so many of the clip's pixels: 28 of ours, two tiles
os.makedirs(WORK + '/hi', exist_ok=True)
def make_big(im):
    """im: a frame cut to its box (BGRA, 0..1) -> 4/3 as big, crisp (BGRA, uint8)"""
    rgb, a = im[..., 2::-1], im[..., 3]
    if a.max() < 0.02: return np.zeros((im.shape[0] * 4 // 3, im.shape[1] * 4 // 3, 4), np.uint8)
    # faint water (its glow, its edge) takes the colour of the solid water beside it: what was worked out for it
    # there is mostly what was behind it
    solid = np.where(a > 0.55, a, 0)
    near = bleed(rgb, solid) if solid.max() > 0 else rgb
    k = smooth(0.25, 0.55, a)[..., None]
    up, al = big_x4(near * (1 - k) + rgb * k, a)
    H, W = up.shape[:2]
    up = cv2.resize(up, (W // 3, H // 3), interpolation=cv2.INTER_AREA); al = cv2.resize(al, (W // 3, H // 3), interpolation=cv2.INTER_AREA)
    al = np.clip((al - 0.012) / (1 - 0.012), 0, 1)
    return (np.dstack([up[..., ::-1], al]) * 255 + 0.5).astype(np.uint8)
BOX = {}
for name, sh in SHEETS.items():
    todo = [fi for fi in sh['frames'] if not os.path.exists('%s/hi/%s_%03d.png' % (WORK, name, fi))]
    if name in CASTS:
        b = [1e9, 1e9, -1, -1]
        for fi in sh['frames']:
            ys, xs = np.nonzero(own(name, fi)[..., 3] > 5.5 / 255)
            if len(xs): b = [min(b[0], xs.min()), min(b[1], ys.min()), max(b[2], xs.max() + 1), max(b[3], ys.max() + 1)]
        x0, y0, x1, y1 = b[0] - 6, b[1] - 6, b[2] + 6, b[3] + 6
        w = -(-(x1 - x0) // UNIT) * UNIT; h = -(-(y1 - y0) // UNIT) * UNIT
        x0 -= (w - (x1 - x0)) // 2; y0 -= (h - (y1 - y0)) // 2
        box = BOX[name] = (int(x0), int(y0), int(w), int(h))
        print(name, 'box', box, flush=True)
        for fi in todo:
            im = own(name, fi)
            im = (im * 255 + 0.5).astype(np.uint8).astype(np.float32) / 255
            cv2.imwrite('%s/hi/%s_%03d.png' % (WORK, name, fi), make_big(cut(im, *box)))
    else:
        w, h = sh['box']
        for fi in todo:
            if name == 'blade': cv2.imwrite('%s/hi/%s_%03d.png' % (WORK, name, fi), straight(fi)); continue
            if name == 'bolt': x, y, s = TRACK[fi][0], TRACK[fi][1], (TRACK[BOLT['like']][2] / TRACK[fi][2]) ** 0.5
            else: x, y, s = sh['middle'][0], sh['middle'][1], 1.0
            cv2.imwrite('%s/hi/%s_%03d.png' % (WORK, name, fi), make_big(placed(own(name, fi), x, y, s, w, h, sh['at'])))
        print(name, 'made', flush=True)

# ---------------------------------------------------------------- 5, 6. mended, and packed
# 6: a frame is mostly air, so it is kept as tiles (see the top)
T, PITCH, AW = 14, 16, 2048
GLOW = (4, 20)
DARK = 0.30                                 # the lightness kept: from this (0) to 1 (255), in 32 steps; alpha in 64
STOPS = [0.44 + 0.08 * k for k in range(8)]
LUMA = np.array([0.114, 0.587, 0.299], np.float32)          # (of a BGR picture)
HEAD = """// combo-water-trial/water-casts.js: what is in the water casts' pictures (water-jet.webp, water-sweep.webp,
// water-orbit.webp, water-vortex.webp; water-bolt.webp, water-hit.webp, water-blade.webp), for magic-combo-fx.js. MADE by
// tools/make-water-casts.py: not written by hand.
//   size: the picture's (pixels); grid: the squares of a frame, across and down (a square: 14 pixels; its tile in the
//         picture: 16, with its rim)
//   origin: a frame's top left corner from where the cast is put (m at 1.75 m: to the right, up); cell: a square's
//         side (m); half: half the height the first textures' picture had (m: her wrap is counted in it)
//   frames: for each, [its map's place in the picture (x, y), the squares with water in them (x0, y0, x1, y1)]
//   ramp: the water's colour at lightness 0.44, 0.52 ... 1.0 (a pixel's red is its lightness, from 0.30 to 1; its
//         green how much water)
// blade: three frames of the sweep's crescent laid out straight (its head at the left, its outer edge up), for a band
// of water along a wave or round a ring: only its size, grid, frames and ramp are used.
// bolt (what a cast throws) and hit (the splash where it lands) are the same, reckoned from their own point (the
// bolt's head, the splash's middle) in their own measure: 1 is the bolt's length, how far the splash reaches (the game
// makes that as many metres as it wants). The bolt's picture flies the way BOLT_WAY says (radians, from its right,
// turning to its top).
export const BOLT_WAY = %s;
""" % round(float(np.arctan2(BOLT['axis'][1], -BOLT['axis'][0])), 4)
meta = {}
for name, c in SHEETS.items():
    info = {'box': BOX.get(name), 'frames': c['frames']}
    frames = [cv2.imread('%s/hi/%s_%03d.png' % (WORK, name, fi), cv2.IMREAD_UNCHANGED) for fi in info['frames']]
    H, W = frames[0].shape[:2]
    gw, gh = W // T, H // T
    # ---- the water drawn on across the clip's girl (girl, mend: above)
    for fi, im in zip(info['frames'], frames):
        if name != 'jet': break                                             # (the sweep, the orbit and the vortex have her out already; the rest are clear of her)
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
    if name in CASTS:
        wx, wy, ww, wh = c['window']; bx, by, bw, bh = info['box']
        mpp = c['width'] / ww                                               # m to a pixel of the clip
        where = dict(
            origin=[round((bx - (wx + ww / 2)) * mpp, 4), round(-(by - (wy + wh / 2)) * mpp, 4)],      # the frame's top left corner from where the cast is put (m: to the right, up)
            cell=round(T * 0.75 * mpp, 5),                                  # a square's side (m)
            half=round(0.375 * c['width'], 4))                              # (half the height of the first textures' picture: the wrap round her is counted in it)
    else:
        # the bolt, the splash: reckoned from its own point, in its own measure (ref of the clip's pixels are 1)
        where = dict(origin=[round(-c['at'][0] / c['ref'], 4), round(c['at'][1] / c['ref'], 4)], cell=round(T * 0.75 / c['ref'], 5), half=1)
    meta[name] = dict(
        size=[AW, AH], grid=[gw, gh], **where,
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
