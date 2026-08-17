"""
Prove a decimated background GLB is indistinguishable at the size it ships at.

A triangle count is not evidence. What matters is whether the pixels change,
so this rasterizes both models at the angular size the island actually occupies
on a portrait phone and compares them:

  silhouette IoU   overlap of the two outlines. This is the number that counts
                   for a backdrop -- against fog and sky, the shape is nearly
                   all the player can read.
  shaded delta     mean absolute difference of a lambert-shaded render, using
                   the game's sun direction.

Run at the real size (about 60px tall for the hero island) and again at 4x, so
a regression that only shows on a tablet still gets caught.

    python3 tools/verify_background_glb.py <before.glb> <after.glb> [--px 64]
"""
import json
import struct
import sys

import numpy as np

COMPONENT = {5120: "i1", 5121: "u1", 5122: "i2", 5123: "u2", 5125: "u4", 5126: "f4"}
NUM = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def load(path):
    raw = open(path, "rb").read()
    off, chunks = 12, {}
    while off < len(raw):
        length, kind = struct.unpack_from("<II", raw, off)
        chunks[kind] = raw[off + 8 : off + 8 + length]
        off += 8 + length
    js = json.loads(chunks[0x4E4F534A].decode("utf8"))
    blob = chunks[0x004E4942]

    def accessor(index):
        acc = js["accessors"][index]
        view = js["bufferViews"][acc["bufferView"]]
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        data = np.frombuffer(blob, dtype=COMPONENT[acc["componentType"]],
                             count=acc["count"] * NUM[acc["type"]], offset=start)
        return data.reshape(acc["count"], NUM[acc["type"]]).astype(np.float64)

    prim = js["meshes"][0]["primitives"][0]
    return (accessor(prim["attributes"]["POSITION"]),
            accessor(prim["indices"]).reshape(-1).astype(np.int64),
            js["materials"][0].get("doubleSided", True))


def render(positions, indices, px, yaw, pitch):
    """Tiny z-buffer rasterizer. Orthographic: the island is 300m away."""
    cy, sy = np.cos(yaw), np.sin(yaw)
    cp, sp = np.cos(pitch), np.sin(pitch)
    rot = np.array([[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]]) @ np.array(
        [[1, 0, 0], [0, cp, sp], [0, -sp, cp]])
    view = positions @ rot.T

    lo, hi = view.min(0), view.max(0)
    span = (hi[:2] - lo[:2]).max() * 1.05
    centre = (hi[:2] + lo[:2]) / 2
    screen = (view[:, :2] - centre) / span * px + px / 2

    tris = indices.reshape(-1, 3)
    a, b, c = screen[tris[:, 0]], screen[tris[:, 1]], screen[tris[:, 2]]
    depth = view[tris, 2].mean(1)

    # Sun matching the game's key light, in view space.
    normals = np.cross(view[tris[:, 1]] - view[tris[:, 0]], view[tris[:, 2]] - view[tris[:, 0]])
    length = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = normals / np.where(length == 0, 1, length)
    shade = np.clip(normals @ np.array([0.35, 0.75, 0.56]), 0, 1) * 0.8 + 0.2

    colour = np.zeros((px, px))
    zbuf = np.full((px, px), -np.inf)
    order = np.argsort(depth)  # painter's order, far to near, then z-test
    ys, xs = np.mgrid[0:px, 0:px]
    ys = ys + 0.5
    xs = xs + 0.5

    for t in order:
        p0, p1, p2 = a[t], b[t], c[t]
        x0 = max(int(min(p0[0], p1[0], p2[0])), 0)
        x1 = min(int(max(p0[0], p1[0], p2[0])) + 2, px)
        y0 = max(int(min(p0[1], p1[1], p2[1])), 0)
        y1 = min(int(max(p0[1], p1[1], p2[1])) + 2, px)
        if x1 <= x0 or y1 <= y0:
            continue
        sub_x, sub_y = xs[y0:y1, x0:x1], ys[y0:y1, x0:x1]
        area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
        if area == 0:
            continue
        w0 = ((p1[0] - p0[0]) * (sub_y - p0[1]) - (sub_x - p0[0]) * (p1[1] - p0[1])) / area
        w1 = ((sub_x - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (sub_y - p0[1])) / area
        inside = (w0 >= 0) & (w1 >= 0) & (w0 + w1 <= 1)
        if not inside.any():
            continue
        hit = inside & (depth[t] > zbuf[y0:y1, x0:x1])
        zbuf[y0:y1, x0:x1] = np.where(hit, depth[t], zbuf[y0:y1, x0:x1])
        colour[y0:y1, x0:x1] = np.where(hit, shade[t], colour[y0:y1, x0:x1])
    return colour, zbuf > -np.inf


def watertight(indices):
    """Every edge shared by exactly two triangles -> backface culling is safe."""
    tris = indices.reshape(-1, 3)
    edges = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    edges = np.sort(edges, axis=1)
    _, counts = np.unique(edges, axis=0, return_counts=True)
    return int((counts != 2).sum()), len(counts)


def main():
    before_path, after_path = sys.argv[1], sys.argv[2]
    px = int(sys.argv[sys.argv.index("--px") + 1]) if "--px" in sys.argv else 64
    before_pos, before_idx, _ = load(before_path)
    after_pos, after_idx, after_double = load(after_path)

    open_edges, total_edges = watertight(after_idx)
    print(f"mesh is {'closed' if open_edges == 0 else f'OPEN ({open_edges}/{total_edges} edges)'}"
          f" -> doubleSided={after_double}"
          f" {'ok' if open_edges == 0 or after_double else 'RISK: holes may show'}")

    worst = 1.0
    for yaw in np.linspace(0, 2 * np.pi, 8, endpoint=False):
        img_a, mask_a = render(before_pos, before_idx, px, yaw, 0.12)
        img_b, mask_b = render(after_pos, after_idx, px, yaw, 0.12)
        union = (mask_a | mask_b).sum()
        iou = ((mask_a & mask_b).sum() / union) if union else 1.0
        delta = np.abs(img_a - img_b).mean()
        worst = min(worst, iou)
        print(f"  yaw {np.degrees(yaw):5.0f}deg  silhouette IoU {iou:6.2%}   shaded delta {delta:5.3f}")
    print(f"\nworst silhouette IoU at {px}px: {worst:.2%}")
    print("PASS" if worst >= 0.97 else "REVIEW BY EYE — silhouette moved more than 3%")


if __name__ == "__main__":
    main()
