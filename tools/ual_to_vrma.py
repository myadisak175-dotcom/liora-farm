#!/usr/bin/env python3
"""Convert Quaternius "Universal Animation Library" GLB clips into VRM Animation (.vrma) files.

One .vrma per clip. The output skeleton is a T-pose with identity rest rotations,
so each keyframe rotation is the bone's rotation away from T-pose (what
@pixiv/three-vrm-animation expects).

Usage:
  python3 -I ual_to_vrma.py OUT_DIR TAG=path/to/UAL.glb [TAG=path/to/UAL2.glb ...]

Writes OUT_DIR/<ClipName>.vrma and OUT_DIR/index.json.

  --bind     (before the files it is for) the T-pose is the skin's bind pose, not the nodes' rest pose: for a clip
             exported on a character by another tool (e.g. KinemIQ's UAL mannequin, through Verge3D), whose nodes rest
             in a frame of the clip
  --add      add the clips to OUT_DIR/index.json (the library's), not write a new one with only these
  TAG=path=Name   the clip is written as Name (one clip in the file)

  e.g. python3 -I tools/ual_to_vrma.py assets/animations/vrma --add --bind UAL2=Jump_-_double.glb=Jump_Double
"""
import json
import os
import struct
import sys

import numpy as np

FPS = 30
SKIP_CLIPS = {"A_TPose"}  # rig reference pose, not a game animation

# VRM 1.0 humanoid bone name -> UAL rig bone name
BONE_MAP = {
    "hips": "pelvis",
    "spine": "spine_01",
    "chest": "spine_02",
    "upperChest": "spine_03",
    "neck": "neck_01",
    "head": "Head",
}
for side, s in (("left", "l"), ("right", "r")):
    BONE_MAP.update({
        f"{side}Shoulder": f"clavicle_{s}",
        f"{side}UpperArm": f"upperarm_{s}",
        f"{side}LowerArm": f"lowerarm_{s}",
        f"{side}Hand": f"hand_{s}",
        f"{side}UpperLeg": f"thigh_{s}",
        f"{side}LowerLeg": f"calf_{s}",
        f"{side}Foot": f"foot_{s}",
        f"{side}Toes": f"ball_{s}",
        f"{side}ThumbMetacarpal": f"thumb_01_{s}",
        f"{side}ThumbProximal": f"thumb_02_{s}",
        f"{side}ThumbDistal": f"thumb_03_{s}",
    })
    for vrm_finger, ual_finger in (("Index", "index"), ("Middle", "middle"),
                                   ("Ring", "ring"), ("Little", "pinky")):
        BONE_MAP[f"{side}{vrm_finger}Proximal"] = f"{ual_finger}_01_{s}"
        BONE_MAP[f"{side}{vrm_finger}Intermediate"] = f"{ual_finger}_02_{s}"
        BONE_MAP[f"{side}{vrm_finger}Distal"] = f"{ual_finger}_03_{s}"


# ---------------------------------------------------------------- quaternions (x, y, z, w)

def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(a, -1, 0)
    bx, by, bz, bw = np.moveaxis(b, -1, 0)
    return np.stack([
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ], axis=-1)


def qinv(q):
    return q * np.array([-1.0, -1.0, -1.0, 1.0])


def qrot(q, v):
    """Rotate vectors v (...,3) by unit quaternions q (...,4)."""
    u = q[..., :3]
    w = q[..., 3:4]
    t = 2.0 * np.cross(u, v)
    return v + w * t + np.cross(u, t)


def qnormalize(q):
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def quat_of_matrix(m):
    """A rotation matrix (3x3) as a quaternion (x, y, z, w)."""
    t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s]
    return qnormalize(np.array(q, dtype=np.float64))


def slerp(q0, q1, t):
    dot = np.sum(q0 * q1, axis=-1, keepdims=True)
    q1 = np.where(dot < 0, -q1, q1)
    dot = np.abs(dot)
    theta = np.arccos(np.clip(dot, -1.0, 1.0))
    sin_t = np.sin(theta)
    small = sin_t < 1e-6
    w0 = np.where(small, 1.0 - t, np.sin((1.0 - t) * theta) / np.where(small, 1.0, sin_t))
    w1 = np.where(small, t, np.sin(t * theta) / np.where(small, 1.0, sin_t))
    return qnormalize(w0 * q0 + w1 * q1)


def make_continuous(q):
    """Flip signs so consecutive keyframes stay on the same hemisphere."""
    q = q.copy()
    for i in range(1, len(q)):
        if np.dot(q[i], q[i - 1]) < 0:
            q[i] = -q[i]
    return q


# ---------------------------------------------------------------- GLB I/O

NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, _version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise ValueError(f"{path} is not a GLB file")
    off, js, binary = 12, None, b""
    while off < length:
        clen, ctype = struct.unpack_from("<I4s", data, off)
        off += 8
        chunk = data[off:off + clen]
        off += clen
        if ctype == b"JSON":
            js = json.loads(chunk)
        elif ctype == b"BIN\x00":
            binary = chunk
    return js, binary


def read_accessor(js, binary, index):
    acc = js["accessors"][index]
    if acc["componentType"] != 5126 or "sparse" in acc:
        raise ValueError(f"accessor {index}: only dense float accessors are supported")
    view = js["bufferViews"][acc["bufferView"]]
    n = NCOMP[acc["type"]]
    off = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride", 0) or 4 * n
    if stride == 4 * n:
        arr = np.frombuffer(binary, dtype="<f4", count=acc["count"] * n, offset=off)
        return arr.reshape(acc["count"], n).astype(np.float64)
    rows = [np.frombuffer(binary, dtype="<f4", count=n, offset=off + i * stride)
            for i in range(acc["count"])]
    return np.array(rows, dtype=np.float64)


def write_glb(path, js, binary):
    json_bytes = json.dumps(js, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    binary += b"\x00" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        f.write(json_bytes)
        f.write(struct.pack("<I4s", len(binary), b"BIN\x00"))
        f.write(binary)


# ---------------------------------------------------------------- source rig

class SourceRig:
    def __init__(self, path, bind=False):
        self.bind = bind
        self.js, self.bin = read_glb(path)
        nodes = self.js["nodes"]
        self.names = [n.get("name", f"node{i}") for i, n in enumerate(nodes)]
        self.index = {name: i for i, name in enumerate(self.names)}
        self.parent = {}
        for i, n in enumerate(nodes):
            if "matrix" in n:
                raise ValueError("matrix-form nodes are not supported")
            for c in n.get("children", []):
                self.parent[c] = i
        self.order = []  # parents before children
        for root in self.js["scenes"][self.js.get("scene", 0)]["nodes"]:
            stack = [root]
            while stack:
                i = stack.pop()
                self.order.append(i)
                stack.extend(reversed(nodes[i].get("children", [])))
        self.rest_t = np.array([n.get("translation", [0, 0, 0]) for n in nodes], dtype=np.float64)
        self.rest_r = np.array([n.get("rotation", [0, 0, 0, 1]) for n in nodes], dtype=np.float64)
        self.rest_s = np.array([n.get("scale", [1, 1, 1]) for n in nodes], dtype=np.float64)
        missing = [b for b in BONE_MAP.values() if b not in self.index]
        if missing:
            raise ValueError(f"rig is missing bones: {missing}")

    def world(self, local_t, local_r, local_s):
        """local_*: (nodes, frames, k). Returns world rotation (nodes,frames,4), position (nodes,frames,3)."""
        wr = np.zeros_like(local_r)
        wp = np.zeros_like(local_t)
        ws = np.zeros_like(local_s)
        for i in self.order:
            p = self.parent.get(i)
            if p is None:
                wr[i], wp[i], ws[i] = local_r[i], local_t[i], local_s[i]
            else:
                wr[i] = qnormalize(qmul(wr[p], local_r[i]))
                wp[i] = wp[p] + qrot(wr[p], ws[p] * local_t[i])
                ws[i] = ws[p] * local_s[i]
        return wr, wp

    def rest_world(self):
        wr, wp = self.world(self.rest_t[:, None], self.rest_r[:, None], self.rest_s[:, None])
        if not self.bind:
            return wr, wp
        # --bind: each joint's world turn and place in the skin's bind pose (its inverse bind matrix, inverted; in the
        # skinned mesh's world), where the nodes' rest is only a frame of the clip
        wr, wp = wr.copy(), wp.copy()
        for node_i, node in enumerate(self.js["nodes"]):
            if "skin" not in node:
                continue
            skin = self.js["skins"][node["skin"]]
            mesh_r, mesh_p = wr[node_i][0], wp[node_i][0]
            ibm = read_accessor(self.js, self.bin, skin["inverseBindMatrices"]).reshape(-1, 4, 4)
            for j, m in zip(skin["joints"], ibm):
                w = np.linalg.inv(m.T)                     # (glTF matrices are column-major)
                r3 = w[:3, :3] / np.linalg.norm(w[:3, :3], axis=0)
                wr[j][0] = qnormalize(qmul(mesh_r, quat_of_matrix(r3)))
                wp[j][0] = mesh_p + qrot(mesh_r, w[:3, 3])
            break
        return wr, wp

    def sample_clip(self, anim, times):
        n_nodes, n_frames = len(self.names), len(times)
        lt = np.repeat(self.rest_t[:, None], n_frames, axis=1)
        lr = np.repeat(self.rest_r[:, None], n_frames, axis=1)
        ls = np.repeat(self.rest_s[:, None], n_frames, axis=1)
        for ch in anim["channels"]:
            sampler = anim["samplers"][ch["sampler"]]
            if sampler.get("interpolation", "LINEAR") != "LINEAR":
                raise ValueError(f"{anim.get('name')}: only LINEAR interpolation is supported")
            node, path = ch["target"]["node"], ch["target"]["path"]
            key_t = read_accessor(self.js, self.bin, sampler["input"])[:, 0]
            key_v = read_accessor(self.js, self.bin, sampler["output"])
            hi = np.clip(np.searchsorted(key_t, times, side="right"), 1, len(key_t) - 1)
            lo = hi - 1
            span = np.maximum(key_t[hi] - key_t[lo], 1e-9)
            u = np.clip((times - key_t[lo]) / span, 0.0, 1.0)[:, None]
            if len(key_t) == 1:
                vals = np.repeat(key_v[:1], n_frames, axis=0)
            elif path == "rotation":
                vals = slerp(qnormalize(key_v[lo]), qnormalize(key_v[hi]), u)
            else:
                vals = key_v[lo] * (1 - u) + key_v[hi] * u
            if path == "rotation":
                lr[node] = vals
            elif path == "translation":
                lt[node] = vals
            elif path == "scale":
                ls[node] = vals
        return self.world(lt, lr, ls)

    def mapped_parent(self, ual_bone, mapped):
        i = self.parent.get(self.index[ual_bone])
        while i is not None:
            if self.names[i] in mapped:
                return self.names[i]
            i = self.parent.get(i)
        return None


# ---------------------------------------------------------------- conversion

def build_vrma(rig, anim, clip_name):
    duration = 0.0
    for s in anim["samplers"]:
        acc = rig.js["accessors"][s["input"]]
        duration = max(duration, acc["max"][0] if "max" in acc
                       else float(read_accessor(rig.js, rig.bin, s["input"])[-1, 0]))
    n_frames = max(2, int(round(duration * FPS)) + 1)
    times = np.linspace(0.0, duration, n_frames)

    rest_wr, rest_wp = rig.rest_world()
    anim_wr, anim_wp = rig.sample_clip(anim, times)

    mapped = set(BONE_MAP.values())
    vrm_of = {ual: vrm for vrm, ual in BONE_MAP.items()}
    bones = list(BONE_MAP.items())  # (vrm, ual), hips first
    node_of = {ual: k for k, (_vrm, ual) in enumerate(bones)}

    # rotation away from T-pose, in world space, per bone and frame
    delta = {}
    for _vrm, ual in bones:
        i = rig.index[ual]
        delta[ual] = qnormalize(qmul(anim_wr[i], qinv(rest_wr[i][0])))

    nodes, rot_tracks = [], []
    for vrm, ual in bones:
        parent = rig.mapped_parent(ual, mapped)
        i = rig.index[ual]
        if parent is None:
            translation = rest_wp[i][0]
            local = delta[ual]
        else:
            translation = rest_wp[i][0] - rest_wp[rig.index[parent]][0]
            local = qnormalize(qmul(qinv(delta[parent]), delta[ual]))
        nodes.append({"name": vrm, "translation": [round(float(x), 6) for x in translation]})
        rot_tracks.append(make_continuous(local))
    for vrm, ual in bones:
        parent = rig.mapped_parent(ual, mapped)
        if parent is not None:
            nodes[node_of[parent]].setdefault("children", []).append(node_of[ual])
    roots = [node_of[ual] for _vrm, ual in bones if rig.mapped_parent(ual, mapped) is None]
    if roots != [0]:
        raise ValueError(f"expected hips as the only root, got {[bones[r][0] for r in roots]}")

    hips_pos = anim_wp[rig.index["pelvis"]]

    # ---- pack buffers
    blobs, views, accessors = [], [], []

    def add(arr, acc_type, with_minmax=False):
        data = np.ascontiguousarray(arr, dtype="<f4").tobytes()
        offset = sum(len(b) for b in blobs)
        blobs.append(data)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data)})
        acc = {"bufferView": len(views) - 1, "componentType": 5126,
               "count": int(arr.shape[0]), "type": acc_type}
        if with_minmax:
            acc["min"] = [float(v) for v in np.min(arr, axis=0)]
            acc["max"] = [float(v) for v in np.max(arr, axis=0)]
        accessors.append(acc)
        return len(accessors) - 1

    t_acc = add(times[:, None], "SCALAR", with_minmax=True)
    samplers, channels = [], []
    for k, track in enumerate(rot_tracks):
        samplers.append({"input": t_acc, "output": add(track, "VEC4"), "interpolation": "LINEAR"})
        channels.append({"sampler": len(samplers) - 1, "target": {"node": k, "path": "rotation"}})
    samplers.append({"input": t_acc, "output": add(hips_pos, "VEC3"), "interpolation": "LINEAR"})
    channels.append({"sampler": len(samplers) - 1, "target": {"node": 0, "path": "translation"}})

    binary = b"".join(blobs)
    gltf = {
        "asset": {"version": "2.0", "generator": "ual_to_vrma.py (Quaternius UAL, CC0)"},
        "extensionsUsed": ["VRMC_vrm_animation"],
        "extensions": {"VRMC_vrm_animation": {
            "specVersion": "1.0",
            "humanoid": {"humanBones": {vrm: {"node": node_of[ual]} for vrm, ual in bones}},
        }},
        "scene": 0,
        "scenes": [{"nodes": roots}],
        "nodes": nodes,
        "animations": [{"name": clip_name, "samplers": samplers, "channels": channels}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
    }
    return gltf, binary, duration, n_frames


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    out_dir = argv[1]
    os.makedirs(out_dir, exist_ok=True)
    index, seen = [], {}
    bind = add = False
    for spec in argv[2:]:
        if spec == "--bind":
            bind = True
            continue
        if spec == "--add":
            add = True
            continue
        tag, path = spec.split("=", 1)
        path, _, rename = path.partition("=")
        rig = SourceRig(path, bind)
        anims = rig.js.get("animations", [])
        if rename and len(anims) != 1:
            raise ValueError(f"{path}: a new name is for a file of one clip ({len(anims)} here)")
        for anim in anims:
            name = rename or anim.get("name", "clip")
            if name in SKIP_CLIPS:
                continue
            if name in seen:
                raise ValueError(f"clip name '{name}' appears in both {seen[name]} and {tag}")
            seen[name] = tag
            gltf, binary, duration, frames = build_vrma(rig, anim, name)
            file_name = f"{name}.vrma"
            write_glb(os.path.join(out_dir, file_name), gltf, binary)
            index.append({
                "name": name,
                "file": file_name,
                "source": tag,
                "duration": round(duration, 3),
                "frames": frames,
                "loop": "Loop" in name,
            })
    head = {"fps": FPS, "license": "CC0-1.0 (Quaternius)"}
    index_path = os.path.join(out_dir, "index.json")
    if add and os.path.exists(index_path):                 # --add: into the library's own list
        with open(index_path, encoding="utf-8") as f:
            have = json.load(f)
        head = {k: v for k, v in have.items() if k != "clips"}
        new = {c["name"] for c in index}
        index = [c for c in have["clips"] if c["name"] not in new] + index
    index.sort(key=lambda c: c["name"])
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump({**head, "clips": index}, f, indent=2)
    print(f"wrote {len(index)} clips to {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
