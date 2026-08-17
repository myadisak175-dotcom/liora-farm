"""
Shrink an authored background GLB down to what a distant backdrop actually needs.

The floating-island hero model arrived as a 7.2 MB, 103k-triangle asset with
four 1024px PBR maps. It renders about 110 pixels tall on a portrait phone, four
times, behind fog. Almost none of that detail can reach the screen, and all of
it is paid for on a mobile GPU at boot and every frame.

What this does, and why each step is safe for a *background* asset:

  textures   Normal and metallic-roughness maps are dropped and replaced with
             constant factors. A normal map cannot show at 110px, and neither
             can a roughness variation behind 40% fog. Base colour is halved to
             512px. Emissive is kept -- it is 3 KB and it is what makes the
             island read as glowing.

  geometry   Vertex clustering onto a grid, with position/normal/UV averaged
             per cell. Cheaper and blunter than quadric edge collapse, and it
             would be the wrong choice for anything the player can walk up to.
             At this angular size the silhouette is what carries the shape, so
             the script measures exactly that (see verify_background_glb.py)
             instead of trusting the triangle count.

The original is kept beside the output so this is reversible.

    python3 tools/optimize_background_glb.py <in.glb> <out.glb> [--grid 150]
"""
import io
import json
import struct
import sys

import numpy as np
from PIL import Image

COMPONENT = {5120: "i1", 5121: "u1", 5122: "i2", 5123: "u2", 5125: "u4", 5126: "f4"}
NUM = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_glb(path):
    raw = open(path, "rb").read()
    assert raw[:4] == b"glTF", f"{path} is not a GLB"
    off, chunks = 12, {}
    while off < len(raw):
        length, kind = struct.unpack_from("<II", raw, off)
        chunks[kind] = raw[off + 8 : off + 8 + length]
        off += 8 + length
    return json.loads(chunks[0x4E4F534A].decode("utf8")), chunks[0x004E4942], len(raw)


def accessor(js, blob, index):
    acc = js["accessors"][index]
    view = js["bufferViews"][acc["bufferView"]]
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"] * NUM[acc["type"]]
    data = np.frombuffer(blob, dtype=COMPONENT[acc["componentType"]], count=count, offset=start)
    return data.reshape(acc["count"], NUM[acc["type"]])


def cluster(positions, normals, uvs, indices, grid):
    """Collapse vertices sharing a grid cell, then drop degenerate triangles."""
    low, high = positions.min(0), positions.max(0)
    step = (high - low).max() / grid
    cell = np.floor((positions - low) / step).astype(np.int64)
    _, inverse, counts = np.unique(cell, axis=0, return_inverse=True, return_counts=True)
    kept = counts.shape[0]

    def average(values):
        out = np.zeros((kept, values.shape[1]), dtype=np.float64)
        np.add.at(out, inverse, values)
        return (out / counts[:, None]).astype(np.float32)

    new_pos = average(positions)
    new_nrm = average(normals)
    norm = np.linalg.norm(new_nrm, axis=1, keepdims=True)
    new_nrm = (new_nrm / np.where(norm == 0, 1, norm)).astype(np.float32)

    tris = inverse[indices.reshape(-1, 3)]
    good = (tris[:, 0] != tris[:, 1]) & (tris[:, 1] != tris[:, 2]) & (tris[:, 0] != tris[:, 2])
    return new_pos, new_nrm, average(uvs), tris[good].reshape(-1).astype(np.uint32)


def pack(js, parts):
    """Rebuild bufferViews/accessors/buffer from scratch around `parts`."""
    js["bufferViews"], js["accessors"], blob = [], [], bytearray()

    def add(data, target=None, acc=None):
        while len(blob) % 4:
            blob.append(0)
        offset = len(blob)
        blob.extend(data.tobytes())
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(blob) - offset}
        if target:
            view["target"] = target
        js["bufferViews"].append(view)
        if acc is None:
            return len(js["bufferViews"]) - 1
        js["accessors"].append({**acc, "bufferView": len(js["bufferViews"]) - 1})
        return len(js["accessors"]) - 1

    pos, nrm, uv, idx, images = parts
    a_pos = add(pos, 34962, {"componentType": 5126, "count": len(pos), "type": "VEC3",
                             "min": pos.min(0).tolist(), "max": pos.max(0).tolist()})
    a_nrm = add(nrm, 34962, {"componentType": 5126, "count": len(nrm), "type": "VEC3"})
    a_uv = add(uv, 34962, {"componentType": 5126, "count": len(uv), "type": "VEC2"})
    a_idx = add(idx, 34963, {"componentType": 5125, "count": len(idx), "type": "SCALAR"})

    js["meshes"][0]["primitives"][0]["attributes"] = {"POSITION": a_pos, "NORMAL": a_nrm, "TEXCOORD_0": a_uv}
    js["meshes"][0]["primitives"][0]["indices"] = a_idx

    js["images"] = [{"mimeType": mime, "bufferView": add(np.frombuffer(payload, dtype=np.uint8))}
                    for payload, mime in images]
    js["buffers"] = [{"byteLength": len(blob)}]
    return bytes(blob)


def write_glb(path, js, blob):
    head = json.dumps(js, separators=(",", ":")).encode("utf8")
    head += b" " * (-len(head) % 4)
    blob += b"\0" * (-len(blob) % 4)
    body = (struct.pack("<II", len(head), 0x4E4F534A) + head
            + struct.pack("<II", len(blob), 0x004E4942) + blob)
    open(path, "wb").write(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)


def main():
    source, target = sys.argv[1], sys.argv[2]
    grid = int(sys.argv[sys.argv.index("--grid") + 1]) if "--grid" in sys.argv else 150
    js, blob, size_before = read_glb(source)

    prim = js["meshes"][0]["primitives"][0]
    positions = accessor(js, blob, prim["attributes"]["POSITION"]).astype(np.float64)
    normals = accessor(js, blob, prim["attributes"]["NORMAL"]).astype(np.float64)
    uvs = accessor(js, blob, prim["attributes"]["TEXCOORD_0"]).astype(np.float64)
    indices = accessor(js, blob, prim["indices"]).reshape(-1).astype(np.int64)
    tris_before = len(indices) // 3

    pos, nrm, uv, idx = cluster(positions, normals, uvs, indices, grid)

    # Keep base colour (halved) and emissive; drop the maps that cannot show.
    material = js["materials"][0]
    base_index = material["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    emissive_index = material.get("emissiveTexture", {}).get("index")

    def encode(image_index, scale):
        view = js["bufferViews"][js["images"][image_index]["bufferView"]]
        raw = blob[view.get("byteOffset", 0):view.get("byteOffset", 0) + view["byteLength"]]
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        if scale != 1:
            image = image.resize((image.width // scale, image.height // scale), Image.LANCZOS)
        out = io.BytesIO()
        image.save(out, format="PNG", optimize=True)
        return out.getvalue(), "image/png"

    images = [encode(js["textures"][base_index]["source"], 2)]
    textures = [{"source": 0}]
    material["pbrMetallicRoughness"] = {"baseColorTexture": {"index": 0},
                                        "metallicFactor": 0.0, "roughnessFactor": 0.85}
    material.pop("normalTexture", None)
    if emissive_index is not None:
        images.append(encode(js["textures"][emissive_index]["source"], 1))
        textures.append({"source": 1})
        material["emissiveTexture"] = {"index": 1}
    # doubleSided stays on. Backface culling would halve the fragments
    # rasterized, but verify_background_glb.py reports ~1.2k open edges in this
    # mesh, so culling would punch visible holes in it. Left as authored.
    js["textures"] = textures

    write_glb(target, js, pack(js, (pos, nrm, uv, idx, images)))
    size_after = len(open(target, "rb").read())
    tris_after = len(idx) // 3
    print(f"triangles {tris_before:,} -> {tris_after:,}  ({tris_after / tris_before:.1%})")
    print(f"vertices  {len(positions):,} -> {len(pos):,}")
    print(f"file      {size_before / 1e6:.2f} MB -> {size_after / 1e6:.2f} MB "
          f"({size_after / size_before:.1%})")


if __name__ == "__main__":
    main()
