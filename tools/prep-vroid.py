#!/usr/bin/env python3
"""Turn a VRoid avatar (.vrm, VRM 0.x) into a playable character model for the game, the way Vivi's was made.

What it keeps and what it drops:
  - every node, bone and skin as they are (the animation and spring data address bones by name);
  - each mesh's pieces merged into one per material (VRoid hair alone is 50-110 pieces: one draw call each), with only the
    vertices each material uses; position, normal, uv, joints, weights;
  - only each material's main picture, scaled down (skin and clothes to 1024 px, faces, eyes and hair to 512) as WebP;
  - the VRM data (and with it the face's blend shapes) is dropped: stylized-character.js draws her with its own cel
    shader, from each material's alphaMode, doubleSided and extras { color, shade, queue, face } written here from the
    MToon settings (_Color, _ShadeColor, render queue, blend and cull modes). face: every material of the Face mesh.

Usage:
  python3 tools/prep-vroid.py IN.vrm OUT.glb [THUMB.webp]
THUMB: a small round-able picture of her face from the file's own thumbnail, for the character picker.
Needs numpy and Pillow (pip install numpy pillow).
"""
import io
import json
import struct
import sys

import numpy as np
from PIL import Image

CTYPE = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
KEEP = ("POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0")
BIG_TEXTURE = 1024           # skin and clothes
SMALL_TEXTURE = 512          # face parts, eyes, hair


def read_glb(path):
    data = open(path, "rb").read()
    clen = struct.unpack_from("<I", data, 12)[0]
    js = json.loads(data[20:20 + clen])
    boff = 20 + clen
    blen = struct.unpack_from("<I", data, boff)[0]
    return js, data[boff + 8:boff + 8 + blen]


def accessor(js, binary, i):
    a = js["accessors"][i]
    if "sparse" in a:
        raise ValueError("sparse accessors are not supported")
    v = js["bufferViews"][a["bufferView"]]
    dt = np.dtype(CTYPE[a["componentType"]]).newbyteorder("<")
    n = NCOMP[a["type"]]
    off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = v.get("byteStride", 0) or dt.itemsize * n
    if stride == dt.itemsize * n:
        arr = np.frombuffer(binary, dtype=dt, count=a["count"] * n, offset=off)
    else:
        rows = [np.frombuffer(binary, dtype=dt, count=n, offset=off + k * stride) for k in range(a["count"])]
        arr = np.concatenate(rows)
    arr = arr.reshape(a["count"], n)
    if a.get("normalized") and dt.kind in "iu":
        arr = arr.astype(np.float32) / np.iinfo(dt).max
    return arr


class Writer:
    def __init__(self):
        self.blobs, self.views, self.accessors, self.size = [], [], [], 0

    def view(self, data, target=None):
        pad = (4 - self.size % 4) % 4
        if pad:
            self.blobs.append(b"\x00" * pad)
            self.size += pad
        v = {"buffer": 0, "byteOffset": self.size, "byteLength": len(data)}
        if target:
            v["target"] = target
        self.blobs.append(data)
        self.size += len(data)
        self.views.append(v)
        return len(self.views) - 1

    def accessor(self, arr, ctype, atype, target=None, minmax=False):
        arr = np.ascontiguousarray(arr.astype(CTYPE[ctype]).reshape(len(arr), -1))
        a = {"bufferView": self.view(arr.astype(arr.dtype.newbyteorder("<")).tobytes(), target), "componentType": ctype,
             "count": len(arr), "type": atype}
        if minmax:
            a["min"] = [float(x) for x in arr.min(axis=0)]
            a["max"] = [float(x) for x in arr.max(axis=0)]
        self.accessors.append(a)
        return len(self.accessors) - 1

    def binary(self):
        return b"".join(self.blobs)


def material_props(js):
    """VRM 0.x MToon settings by material index."""
    props = js.get("extensions", {}).get("VRM", {}).get("materialProperties", [])
    by_name = {p.get("name"): p for p in props}
    return [by_name.get(m.get("name"), {}) for m in js["materials"]]


def picture(js, binary, tex_index, limit):
    img = js["images"][js["textures"][tex_index]["source"]]
    v = js["bufferViews"][img["bufferView"]]
    im = Image.open(io.BytesIO(binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])).convert("RGBA")
    if max(im.size) > limit:
        s = limit / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    buf = io.BytesIO()
    if im.getextrema()[3][0] == 255:
        im = im.convert("RGB")                      # no transparency in it: smaller file
    im.save(buf, format="WEBP", quality=82, method=6)
    return buf.getvalue(), img.get("name") or f"image{tex_index}"


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    src, out = argv[1], argv[2]
    js, binary = read_glb(src)
    vrm = js.get("extensions", {}).get("VRM", {})
    props = material_props(js)
    w = Writer()

    # ---- meshes: one primitive per material, only the vertices it uses
    face_materials = set()
    meshes = []
    used_materials = []
    for mesh in js["meshes"]:
        groups = {}
        for p in mesh["primitives"]:
            groups.setdefault(p["material"], []).append(p)
        if mesh.get("name", "").startswith("Face"):
            face_materials.update(groups)
        prims = []
        for mat, plist in groups.items():
            attrs = {k: [] for k in KEEP}
            indices, base = [], 0
            cache = {}
            for p in plist:
                key = tuple(p["attributes"].get(k) for k in KEEP)
                if key not in cache:
                    cache[key] = {k: accessor(js, binary, p["attributes"][k]) for k in KEEP if k in p["attributes"]}
                full = cache[key]
                idx = accessor(js, binary, p["indices"]).reshape(-1).astype(np.int64)
                used, remap = np.unique(idx, return_inverse=True)
                for k in KEEP:
                    if k in full:
                        attrs[k].append(full[k][used])
                indices.append(remap + base)
                base += len(used)
            idx = np.concatenate(indices)
            prim = {"attributes": {}, "material": mat, "mode": 4}
            prim["attributes"]["POSITION"] = w.accessor(np.concatenate(attrs["POSITION"]), 5126, "VEC3", 34962, minmax=True)
            if attrs["NORMAL"]:
                prim["attributes"]["NORMAL"] = w.accessor(np.concatenate(attrs["NORMAL"]), 5126, "VEC3", 34962)
            if attrs["TEXCOORD_0"]:
                prim["attributes"]["TEXCOORD_0"] = w.accessor(np.concatenate(attrs["TEXCOORD_0"]), 5126, "VEC2", 34962)
            if attrs["JOINTS_0"]:
                prim["attributes"]["JOINTS_0"] = w.accessor(np.concatenate(attrs["JOINTS_0"]), 5123, "VEC4", 34962)
            if attrs["WEIGHTS_0"]:
                prim["attributes"]["WEIGHTS_0"] = w.accessor(np.concatenate(attrs["WEIGHTS_0"]), 5126, "VEC4", 34962)
            prim["indices"] = w.accessor(idx.reshape(-1, 1), 5125 if base > 65535 else 5123, "SCALAR", 34963)
            prims.append(prim)
            if mat not in used_materials:
                used_materials.append(mat)
        meshes.append({"name": mesh.get("name", "mesh"), "primitives": prims})

    # ---- materials: main picture + the cel shader's settings, renumbered to the ones in use
    images, textures, materials = [], [], []
    mat_index = {}
    for old in used_materials:
        m, p = js["materials"][old], props[old]
        name = m.get("name", f"material{old}")
        fp, vp = p.get("floatProperties", {}), p.get("vectorProperties", {})
        blend = int(fp.get("_BlendMode", 0))
        out_m = {"name": name, "pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 1},
                 "alphaMode": "OPAQUE" if blend == 0 else "MASK" if blend == 1 else "BLEND",
                 "doubleSided": int(fp.get("_CullMode", 2)) == 0,
                 "extensions": {"KHR_materials_unlit": {}}}
        if blend == 1:
            out_m["alphaCutoff"] = round(float(fp.get("_Cutoff", 0.5)), 3)
        tex = p.get("textureProperties", {}).get("_MainTex")
        if tex is None:
            tex = m.get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("index")
        if tex is not None:
            limit = BIG_TEXTURE if name.endswith(("_SKIN", "_CLOTH")) else SMALL_TEXTURE
            data, img_name = picture(js, binary, tex, limit)
            images.append({"name": img_name, "mimeType": "image/webp", "bufferView": w.view(data)})
            textures.append({"source": len(images) - 1, "sampler": 0})
            out_m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": len(textures) - 1}
        color = vp.get("_Color", [1, 1, 1, 1])
        shade = vp.get("_ShadeColor", [1, 1, 1, 1])
        out_m["extras"] = {"color": [round(float(x), 3) for x in color[:4]], "shade": [round(float(x), 3) for x in shade[:3]],
                           "queue": int(p.get("renderQueue", 2000)), "face": old in face_materials}
        mat_index[old] = len(materials)
        materials.append(out_m)
    for mesh in meshes:
        for prim in mesh["primitives"]:
            prim["material"] = mat_index[prim["material"]]

    # ---- skins (their inverse bind matrices) and nodes as they were
    skins = []
    for s in js["skins"]:
        ns = {k: v for k, v in s.items() if k != "inverseBindMatrices"}
        if "inverseBindMatrices" in s:
            ns["inverseBindMatrices"] = w.accessor(accessor(js, binary, s["inverseBindMatrices"]), 5126, "MAT4")
        skins.append(ns)
    nodes = []
    for n in js["nodes"]:
        nn = {k: v for k, v in n.items() if k in ("name", "children", "translation", "rotation", "scale", "mesh", "skin", "matrix")}
        nodes.append(nn)

    meta = vrm.get("meta", {})
    out_js = {
        "asset": {"version": "2.0", "generator": "prep-vroid.py",
                  "extras": {"title": meta.get("title", ""), "author": meta.get("author") or "pixiv (VRoid Studio sample)",
                             "license": meta.get("licenseName", "")}},
        "scene": 0, "scenes": js["scenes"], "nodes": nodes, "meshes": meshes, "skins": skins, "materials": materials,
        "textures": textures, "images": images,
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "accessors": w.accessors, "bufferViews": w.views, "buffers": [{"byteLength": w.size}],
        "extensionsUsed": ["KHR_materials_unlit"],
    }
    body = w.binary()
    jb = json.dumps(out_js, separators=(",", ":")).encode()
    jb += b" " * ((4 - len(jb) % 4) % 4)
    body += b"\x00" * ((4 - len(body) % 4) % 4)
    with open(out, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(jb) + 8 + len(body)))
        f.write(struct.pack("<I4s", len(jb), b"JSON") + jb)
        f.write(struct.pack("<I4s", len(body), b"BIN\x00") + body)
    tris = sum(js_a["count"] // 3 for js_a in (w.accessors[p["indices"]] for m in meshes for p in m["primitives"]))
    print(f"{out}: {len(body) / 1e6:.2f} MB, {sum(len(m['primitives']) for m in meshes)} pieces "
          f"(was {sum(len(m['primitives']) for m in js['meshes'])}), {tris} triangles, {len(images)} pictures")

    if len(argv) > 3:                               # the face picture for the character picker
        t = meta.get("texture")
        if isinstance(t, int) and t >= 0:
            img = js["images"][js["textures"][t]["source"]]
            v = js["bufferViews"][img["bufferView"]]
            im = Image.open(io.BytesIO(binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])).convert("RGB")
            side = min(im.size)
            im = im.crop(((im.width - side) // 2, 0, (im.width + side) // 2, side)).resize((112, 112), Image.LANCZOS)
            im.save(argv[3], format="WEBP", quality=85, method=6)
            print(f"{argv[3]}: face picture")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
