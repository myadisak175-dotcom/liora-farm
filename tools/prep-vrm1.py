#!/usr/bin/env python3
"""Turn a VRM 1.0 avatar (.vrm with VRMC_vrm: UniVRM 0.1xx, VRoid Studio 1.x and the like) into a game character model,
the same kind of model tools/prep-vroid.py makes from a VRM 0.x VRoid file, so that stylized-character.js draws it and the
game's clips (character-anim.js and the others: each bone's turn away from the VRoid T-pose) move it.

A VRM 1.0 file differs from the VRoid 0.x ones the game was made with, and this puts each difference back:
  - its bones may be turned in their rest pose (this one's spine follows the curve of her back, each bone along it):
    here every bone is turned no way at all, the T-pose kept, so a clip's turn means the same on her as on Vivi;
  - its mesh may not be where its bones say (the file's bones were moved after it was bound: this one's body stands
    3.7 cm higher in its shoes and its hair is fitted 11% bigger): the mesh is laid where the bones put it, as any VRM
    viewer shows her standing in T-pose;
  - it faces +Z (VRM 0.x faces -Z): turned round, so the game turns it as it turns the others;
  - its colours are linear (VRM 0.x's MToon colours are as they look): written as they look;
  - its springs are VRMC_springBone: written as the game's <id>.springs.json, by bone name, turned with the bones.
And as tools/prep-vroid.py does: one skin for all of it and the pieces merged into one per material (this one's hair was
108 meshes, each with a skin of its own: a draw call each); only each material's main picture, made smaller, as WebP;
the VRM data dropped, and the face's blend shapes but for the expressions asked for (--faces). Triangles that can never be seen are dropped too: where a cut-out
material's picture is clear over the whole triangle (the body under the clothes).

Usage (from the repo folder):
  python3 tools/prep-vrm1.py IN.vrm OUT.glb OUT.springs.json [--px BIG,SMALL]
    --px   the largest a picture may be, in pixels: skin and clothes, and the rest (face parts, eyes, hair). 1024,512
           (the playable characters' sizes) unless said; an NPC is drawn smaller, and there may be many: 512,512
    --faces  the file's own expressions to keep, by their VRM names (happy,relaxed,aa,ih,ou,ee,oh,blink): each one
             morph target, its blend shapes added up as the file binds them, on a mesh of its own ("Face", the face's
             pieces) with the names in its extras.targetNames (three.js: morphTargetDictionary). None unless said
Then, for fewer triangles: node tools/simplify-character.mjs OUT.glb OUT.glb --hair 0.4 --cloth 0.75 --skin 0.8
The second NPC (assets/npcs/yingnui.*), the user's own VRoid Studio character, smiling and talking:
  python3 tools/prep-vrm1.py Yingnui1.vrm /tmp/npc.glb assets/npcs/yingnui.springs.json --px 512,512 \
      --faces happy,relaxed,aa,ih,ou,ee,oh,blink
  node tools/simplify-character.mjs /tmp/npc.glb assets/npcs/yingnui.glb --hair 0.4 --cloth 0.75 --skin 0.8
The first NPC (assets/npcs/fantasy-girl.*), from the .vrm the user sent:
  python3 tools/prep-vrm1.py fantasy_girl_01.vrm /tmp/npc.glb assets/npcs/fantasy-girl.springs.json --px 512,512
  node tools/simplify-character.mjs /tmp/npc.glb assets/npcs/fantasy-girl.glb --hair 0.4 --cloth 0.75 --skin 0.8
Needs numpy and Pillow (pip install numpy pillow).
"""
import hashlib
import importlib.util
import io
import json
import os
import struct
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("prep_vroid", os.path.join(HERE, "prep-vroid.py"))
_pv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_pv)
read_glb, accessor, Writer = _pv.read_glb, _pv.accessor, _pv.Writer

FLIP = np.diag([-1.0, 1.0, -1.0])        # turned half round, about Y: faces -Z, as the VRM 0.x VRoid models do

# The game's taste over the file's own spring values, by spring name (as tools/bake-character-springs.py's TUNE).
TUNE = {
    "Skirt": {"stiffness": 3.0, "dragForce": 0.5},          # as every playable character's skirt
    "TopsUpperArm": {"stiffness": 1.4, "dragForce": 0.45},   # this file's coat tails: drag 0 never stops swinging
}


def quat_to_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def local_matrix(n):
    if "matrix" in n:
        return np.array(n["matrix"], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    m[:3, :3] = quat_to_mat(n.get("rotation", [0, 0, 0, 1])) @ np.diag(n.get("scale", [1, 1, 1]))
    m[:3, 3] = n.get("translation", [0, 0, 0])
    return m


def world_matrices(nodes):
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
    world = [None] * len(nodes)

    def get(i):
        if world[i] is None:
            world[i] = get(parent[i]) @ local_matrix(nodes[i]) if i in parent else local_matrix(nodes[i])
        return world[i]
    for i in range(len(nodes)):
        get(i)
    return world, parent


def srgb(c):
    """A linear colour (VRM 1.0) as it looks (VRM 0.x's MToon colours, and what the game's cel shader takes)."""
    c = np.clip(np.asarray(c, dtype=np.float64), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def image_bytes(js, binary, image_index):
    v = js["bufferViews"][js["images"][image_index]["bufferView"]]
    return binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]


def picture(raw, limit):
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    if max(im.size) > limit:
        s = limit / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    buf = io.BytesIO()
    if im.getextrema()[3][0] == 255:
        im = im.convert("RGB")                      # no transparency in it: smaller file
    im.save(buf, format="WEBP", quality=82, method=6)
    return buf.getvalue()


def clear_triangles(alpha, cutoff, uv, tri):
    """Triangles over which a cut-out picture is clear (below its cutoff) everywhere: never drawn, so never needed.
    Looked at on a grid of points over each triangle in the picture, a little grown so that an edge is never cut."""
    h, w = alpha.shape
    a, b, c = uv[tri[:, 0]], uv[tri[:, 1]], uv[tri[:, 2]]
    seen = np.zeros(len(tri), dtype=bool)
    k = 6
    for i in range(k + 1):
        for j in range(k + 1 - i):
            u, v = i / k, j / k
            p = a * (1 - u - v) + b * u + c * v
            for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                x = np.mod(np.floor(p[:, 0] * w).astype(np.int64) + dx, w)
                y = np.mod(np.floor(p[:, 1] * h).astype(np.int64) + dy, h)
                seen |= alpha[y, x] >= cutoff
    return ~seen


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    px, faces = (1024, 512), []
    for i, a in enumerate(argv):
        if a == "--px":
            px = tuple(int(x) for x in argv[i + 1].split(","))
            args.remove(argv[i + 1])
        if a == "--faces":
            faces = [x for x in argv[i + 1].split(",") if x]
            args.remove(argv[i + 1])
    if len(args) < 3:
        print(__doc__)
        return 1
    src, out, out_springs = args[:3]
    js, binary = read_glb(src)
    vrm = js.get("extensions", {}).get("VRMC_vrm")
    if not vrm:
        raise ValueError(f"{src}: not a VRM 1.0 file (no VRMC_vrm); a VRM 0.x VRoid file goes through tools/prep-vroid.py")
    nodes = js["nodes"]
    world, parent = world_matrices(nodes)

    # ---- the expressions kept: for each mesh node, each expression's blend shapes and their weights
    expr = {**vrm.get("expressions", {}).get("preset", {}), **vrm.get("expressions", {}).get("custom", {})}
    for f in faces:
        if f not in expr:
            raise ValueError(f"{src}: no expression \"{f}\" (it has: {', '.join(expr)})")
    binds = {}                                     # node -> [[(morph index, weight), ...] for each expression in faces]
    for k, f in enumerate(faces):
        for b in expr[f].get("morphTargetBinds", []):
            binds.setdefault(b["node"], [[] for _ in faces])[k].append((b["index"], float(b["weight"])))
    rest = np.array([FLIP @ w[:3, 3] for w in world])           # where every node stands, turned round, in T-pose

    # ---- nodes: every node but the meshes', turned no way and scaled not at all; one node for the whole mesh
    mesh_nodes = [i for i, n in enumerate(nodes) if "mesh" in n]
    keep = [i for i in range(len(nodes)) if i not in set(mesh_nodes)]
    new_index = {old: k for k, old in enumerate(keep)}
    out_nodes = []
    for old in keep:
        n = nodes[old]
        p = rest[old] - (rest[parent[old]] if old in parent else 0)
        nn = {"name": n.get("name", f"node{old}"), "translation": [round(float(x), 7) for x in p]}
        kids = [new_index[c] for c in n.get("children", []) if c in new_index]
        if kids:
            nn["children"] = kids
        out_nodes.append(nn)
    used_joints = sorted({j for s in js["skins"] for j in s["joints"]})
    joint_slot = {old: k for k, old in enumerate(used_joints)}

    # ---- materials: the same material twice (this file's hair has two alike) is one
    def mat_key(i):
        m = js["materials"][i]
        t = m.get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("index")
        img = hashlib.md5(image_bytes(js, binary, js["textures"][t]["source"])).hexdigest() if t is not None else None
        mt = m.get("extensions", {}).get("VRMC_materials_mtoon", {})
        return json.dumps([m.get("name"), m.get("alphaMode"), m.get("alphaCutoff"), m.get("doubleSided"), img,
                           m.get("pbrMetallicRoughness", {}).get("baseColorFactor"), mt.get("shadeColorFactor"),
                           mt.get("renderQueueOffsetNumber"), mt.get("transparentWithZWrite")])
    canon, first = {}, {}
    for i in range(len(js["materials"])):
        k = mat_key(i)
        first.setdefault(k, i)
        canon[i] = first[k]
    alpha_of = {}                                  # material -> (its picture's alpha, cutoff) for the cut-out ones

    def alpha_mask(i):
        if i not in alpha_of:
            m = js["materials"][i]
            t = m.get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("index")
            alpha_of[i] = None
            if m.get("alphaMode") == "MASK" and t is not None:
                im = Image.open(io.BytesIO(image_bytes(js, binary, js["textures"][t]["source"]))).convert("RGBA")
                a = np.asarray(im)[:, :, 3].astype(np.float32) / 255 * m.get("pbrMetallicRoughness", {}).get("baseColorFactor", [1, 1, 1, 1])[3]
                if a.min() < m.get("alphaCutoff", 0.5):
                    alpha_of[i] = (a, m.get("alphaCutoff", 0.5))
        return alpha_of[i]

    # ---- the mesh where its bones put it standing in T-pose, turned round; one skin; one piece per material
    face_materials = set()
    groups = {}                                    # material -> lists of arrays
    dropped = 0
    for ni in mesh_nodes:
        node, mesh = nodes[ni], js["meshes"][nodes[ni]["mesh"]]
        skin = js["skins"][node["skin"]]
        ibm = accessor(js, binary, skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
        bind = np.stack([world[j] @ ibm[k] for k, j in enumerate(skin["joints"])])    # bound pose -> T-pose, per joint
        to_slot = np.array([joint_slot[j] for j in skin["joints"]])
        cache = {}
        morphs = binds.get(ni)                     # this mesh's expressions, if any are kept
        if mesh.get("name", "").startswith("Face"):
            face_materials.update(canon[p["material"]] for p in mesh["primitives"])
        for p in mesh["primitives"]:
            at = p["attributes"]
            key = (at["POSITION"], at.get("NORMAL"), at.get("TEXCOORD_0"), at["JOINTS_0"], at["WEIGHTS_0"])
            if key not in cache:
                pos = accessor(js, binary, at["POSITION"]).astype(np.float64)
                nrm = accessor(js, binary, at["NORMAL"]).astype(np.float64) if "NORMAL" in at else None
                uv = accessor(js, binary, at["TEXCOORD_0"]).astype(np.float32) if "TEXCOORD_0" in at else None
                jo = accessor(js, binary, at["JOINTS_0"]).astype(np.int64)
                we = accessor(js, binary, at["WEIGHTS_0"]).astype(np.float64)
                we = we / np.maximum(we.sum(1, keepdims=True), 1e-9)
                m = (we[:, :, None, None] * bind[jo]).sum(1)                       # each vertex's own blend
                pos = np.einsum("nij,nj->ni", m[:, :3, :3], pos) + m[:, :3, 3]
                if nrm is not None:
                    nrm = np.einsum("nij,nj->ni", m[:, :3, :3], nrm)
                    nrm = nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
                    nrm = nrm @ FLIP.T
                cache[key] = {"POSITION": pos @ FLIP.T, "NORMAL": nrm, "TEXCOORD_0": uv,
                              "JOINTS_0": np.where(we > 0, to_slot[jo], 0), "WEIGHTS_0": we, "M": m[:, :3, :3]}
            full = cache[key]
            moved = None                           # (vertices, expressions, 3): how far each expression moves each vertex
            if morphs:
                moved = np.zeros((len(full["POSITION"]), len(faces), 3))
                for k, bl in enumerate(morphs):
                    for mi, wt in bl:
                        moved[:, k] += wt * accessor(js, binary, p["targets"][mi]["POSITION"]).astype(np.float64)
                    moved[:, k] = np.einsum("nij,nj->ni", full["M"], moved[:, k]) @ FLIP.T
            tri = accessor(js, binary, p["indices"]).reshape(-1, 3).astype(np.int64)
            mat = canon[p["material"]]
            mask = alpha_mask(mat)
            if mask is not None and full["TEXCOORD_0"] is not None:
                gone = clear_triangles(mask[0], mask[1], full["TEXCOORD_0"], tri)
                dropped += int(gone.sum())
                tri = tri[~gone]
            if not len(tri):
                continue
            used, remap = np.unique(tri.reshape(-1), return_inverse=True)
            g = groups.setdefault((mat, bool(morphs)), {k: [] for k in ("POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0", "idx", "T")})
            if morphs:
                g["T"].append(moved[used])
            base = sum(len(x) for x in g["POSITION"])
            for k in ("POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"):
                if full[k] is not None:
                    g[k].append(full[k][used])
            g["idx"].append(remap.reshape(-1, 3) + base)

    w = Writer()
    prims = []
    for (mat, has_t), g in groups.items():
        n = sum(len(x) for x in g["POSITION"])
        prim = {"attributes": {}, "material": mat, "mode": 4}
        if has_t:                                  # the face's pieces: one morph target per expression kept
            t = np.concatenate(g["T"])
            prim["targets"] = [{"POSITION": w.accessor(t[:, k], 5126, "VEC3", 34962, minmax=True)} for k in range(len(faces))]
        prim["attributes"]["POSITION"] = w.accessor(np.concatenate(g["POSITION"]), 5126, "VEC3", 34962, minmax=True)
        if g["NORMAL"]:
            prim["attributes"]["NORMAL"] = w.accessor(np.concatenate(g["NORMAL"]), 5126, "VEC3", 34962)
        if g["TEXCOORD_0"]:
            prim["attributes"]["TEXCOORD_0"] = w.accessor(np.concatenate(g["TEXCOORD_0"]), 5126, "VEC2", 34962)
        prim["attributes"]["JOINTS_0"] = w.accessor(np.concatenate(g["JOINTS_0"]), 5123, "VEC4", 34962)
        prim["attributes"]["WEIGHTS_0"] = w.accessor(np.concatenate(g["WEIGHTS_0"]), 5126, "VEC4", 34962)
        prim["indices"] = w.accessor(np.concatenate(g["idx"]).reshape(-1, 1), 5125 if n > 65535 else 5123, "SCALAR", 34963)
        prims.append(prim)

    # ---- materials: the main picture and the cel shader's settings (stylized-character.js), as prep-vroid.py writes them
    images, textures, materials, mat_index, pic_index = [], [], [], {}, {}
    for prim in prims:
        old = prim["material"]
        if old not in mat_index:
            m = js["materials"][old]
            name = m.get("name", f"material{old}")
            pbr = m.get("pbrMetallicRoughness", {})
            mt = m.get("extensions", {}).get("VRMC_materials_mtoon", {})
            mode = m.get("alphaMode", "OPAQUE")
            out_m = {"name": name, "pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 1}, "alphaMode": mode,
                     "doubleSided": bool(m.get("doubleSided")), "extensions": {"KHR_materials_unlit": {}}}
            if mode == "MASK":
                out_m["alphaCutoff"] = round(float(m.get("alphaCutoff", 0.5)), 3)
            t = pbr.get("baseColorTexture", {}).get("index")
            if t is not None:
                src_img = js["textures"][t]["source"]
                raw = image_bytes(js, binary, src_img)
                limit = px[0] if ("_SKIN" in name or "_CLOTH" in name) else px[1]
                key = (hashlib.md5(raw).hexdigest(), limit)
                if key not in pic_index:                  # one picture used by two materials is kept once
                    images.append({"name": js["images"][src_img].get("name") or f"image{src_img}", "mimeType": "image/webp",
                                   "bufferView": w.view(picture(raw, limit))})
                    textures.append({"source": len(images) - 1, "sampler": 0})
                    pic_index[key] = len(textures) - 1
                out_m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": pic_index[key]}
            base = pbr.get("baseColorFactor", [1, 1, 1, 1])
            queue = (2000 if mode == "OPAQUE" else 2450 if mode == "MASK" else
                     (2501 if mt.get("transparentWithZWrite") else 3000) + int(mt.get("renderQueueOffsetNumber", 0)))
            out_m["extras"] = {"color": [round(float(x), 3) for x in srgb(base[:3])] + [round(float(base[3]), 3)],
                               "shade": [round(float(x), 3) for x in srgb(mt.get("shadeColorFactor", [1, 1, 1]))],
                               "queue": queue, "face": old in face_materials}
            mat_index[old] = len(materials)
            materials.append(out_m)
        prim["material"] = mat_index[old]

    # ---- one skin: every bone a mesh was bound to, each now standing as T-pose has it, turned no way
    ibms = np.zeros((len(used_joints), 4, 4))
    for k, j in enumerate(used_joints):
        m = np.eye(4)
        m[:3, 3] = -rest[j]
        ibms[k] = m
    root = vrm["humanoid"]["humanBones"]["hips"]["node"]
    while root in parent:
        root = parent[root]
    skins = [{"joints": [new_index[j] for j in used_joints], "skeleton": new_index[root],
              "inverseBindMatrices": w.accessor(ibms.transpose(0, 2, 1).reshape(-1, 16), 5126, "MAT4")}]
    meshes = [{"name": "Body", "primitives": [p for p in prims if "targets" not in p]}]
    out_nodes.append({"name": "Body", "mesh": 0, "skin": 0})
    added = [len(out_nodes) - 1]
    if any("targets" in p for p in prims):         # the face, with its expressions, a mesh of its own
        meshes.append({"name": "Face", "primitives": [p for p in prims if "targets" in p], "weights": [0.0] * len(faces),
                       "extras": {"targetNames": faces}})
        out_nodes.append({"name": "Face", "mesh": 1, "skin": 0})
        added.append(len(out_nodes) - 1)
    scene_nodes = [new_index[i] for i in js["scenes"][js.get("scene", 0)]["nodes"] if i in new_index] + added

    meta = vrm.get("meta", {})
    out_js = {
        "asset": {"version": "2.0", "generator": "prep-vrm1.py",
                  "extras": {"title": meta.get("name", ""), "author": ", ".join(meta.get("authors", [])),
                             "license": meta.get("licenseUrl", ""), "avatarPermission": meta.get("avatarPermission", ""),
                             "commercialUsage": meta.get("commercialUsage", ""), "allowRedistribution": meta.get("allowRedistribution"),
                             "modification": meta.get("modification", "")}},
        "scene": 0, "scenes": [{"nodes": scene_nodes}], "nodes": out_nodes, "meshes": meshes,
        "skins": skins, "materials": materials, "textures": textures, "images": images,
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
    tris = sum(w.accessors[p["indices"]]["count"] // 3 for p in prims)
    was = sum(js["accessors"][p["indices"]]["count"] // 3 for m in js["meshes"] for p in m["primitives"])
    print(f"{out}: {os.path.getsize(out) / 1e6:.2f} MB (was {os.path.getsize(src) / 1e6:.1f}), {len(prims)} pieces "
          f"(was {sum(len(m['primitives']) for m in js['meshes'])}), {tris} triangles (was {was}; {dropped} never seen), "
          f"{len(images)} pictures, {len(used_joints)} bones in its skin"
          + (f", {len(faces)} expressions ({', '.join(faces)})" if len(meshes) > 1 else ""))

    # ---- springs: as tools/bake-character-springs.py writes them (by bone name), turned with the bones
    sb = js.get("extensions", {}).get("VRMC_springBone")
    if not sb:
        print("no VRMC_springBone: no springs written")
        return 0
    name = [n.get("name") for n in nodes]

    def turned(node, v):                  # a vector in a node's own frame, in the posed bone's (world's, turned round)
        return FLIP @ (world[node][:3, :3] @ np.asarray(v, dtype=np.float64))

    groups_out, group_slots = [], []      # a VRM 1.0 group may hang colliders on several bones: one game group per bone
    for g in sb.get("colliderGroups", []):
        slots, by_bone = [], {}
        for ci in g["colliders"]:
            c = sb["colliders"][ci]
            shape = c["shape"].get("sphere")
            if shape is None:             # (a capsule: its two ends as spheres)
                cap = c["shape"]["capsule"]
                ends = [cap.get("offset", [0, 0, 0]), cap.get("tail", [0, 0, 0])]
                spheres = [{"offset": e, "radius": cap.get("radius", 0)} for e in ends]
            else:
                spheres = [shape]
            for s in spheres:
                scale = float(np.cbrt(abs(np.linalg.det(world[c["node"]][:3, :3]))))
                by_bone.setdefault(c["node"], []).append({"offset": [round(float(x), 5) for x in turned(c["node"], s.get("offset", [0, 0, 0]))],
                                                         "radius": round(float(s.get("radius", 0)) * scale, 5)})
        for node, cols in by_bone.items():
            slots.append(len(groups_out))
            groups_out.append({"bone": name[node], "colliders": cols})
        group_slots.append(slots)
    springs, by_settings = [], {}
    for s in sb.get("springs", []):
        j0 = s["joints"][0]
        gd = FLIP @ np.asarray(j0.get("gravityDir", [0, -1, 0]), dtype=np.float64)
        entry = {"name": s.get("name", ""), "stiffness": round(float(j0.get("stiffness", 1)), 5),
                 "dragForce": round(float(j0.get("dragForce", 0.5)), 5), "gravityPower": round(float(j0.get("gravityPower", 0)), 5),
                 "gravityDir": [round(float(x), 5) for x in gd], "hitRadius": round(float(j0.get("hitRadius", 0)), 5),
                 "colliderGroups": sorted({k for gi in s.get("colliderGroups", []) for k in group_slots[gi]}),
                 "center": name[s["center"]] if isinstance(s.get("center"), int) and s["center"] >= 0 else None}
        entry.update(TUNE.get(entry["name"], {}))
        key = json.dumps(entry, sort_keys=True)
        if key not in by_settings:
            by_settings[key] = dict(entry, roots=[])
            springs.append(by_settings[key])
        by_settings[key]["roots"].append(name[j0["node"]])
    data = {"colliderGroups": groups_out, "springs": springs,
            "tuned": {k: v for k, v in TUNE.items() if any(s["name"] == k for s in springs)}}
    with open(out_springs, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"{out_springs}: {len(springs)} spring groups ({sum(len(s['roots']) for s in springs)} chains), "
          f"{sum(len(g['colliders']) for g in groups_out)} collision spheres on {len(groups_out)} bones"
          + (f"; tuned: {', '.join(data['tuned'])}" if data["tuned"] else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
