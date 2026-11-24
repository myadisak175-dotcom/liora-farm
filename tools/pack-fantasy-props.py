# pack-fantasy-props.py  —  the props of Quaternius' Fantasy Props MegaKit (CC0) that the guild is furnished with, packed into
# one small file: assets/models/fantasy-props.glb
#
# The kit comes as 94 separate .gltf files with 2048 px colour, normal and roughness pictures (163 MB unpacked). The game needs
# only the props in PROPS below, their colour pictures (it lights them itself) at a size a phone is happy with, and their
# vertex colours (the kit tints its pictures with them: the books' and potions' colours, darker and paler woods; its plain
# metal is darkened to iron in them here: IRON below). One node for
# each prop, named as in the kit; one primitive for each picture it is painted from (the kit's "..._Vertex" materials are the
# same pictures, tinted by the vertex colours, so they join the others). A prop made of several parts (the chest: its base
# and lid, on bones) is one node: its parts where they stand at rest, the bones left out.
#
#   python3 tools/pack-fantasy-props.py <the kit's glTF folder> [--size 1024]
#
# The kit: https://quaternius.com  (Fantasy Props MegaKit, the free Standard set; its Exports/glTF folder)
import io, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image

PROPS = """
Table_Large Chair_1 Stool Bench Cabinet Bookcase_2 Nightstand_Shelf Shelf_Simple Shelf_Arch Shelf_Small_Bottles BookStand
Workbench WeaponStand Peg_Rack Barrel Barrel_Holder Barrel_Apples Crate_Wooden Chest_Wood Stall_Cart_Empty Stall_Empty
Dummy Whetstone Anvil_Log Cauldron Cage_Small FarmCrate_Apple FarmCrate_Carrot Bucket_Wooden_1 Vase_2 Vase_4 Rope_1 Rope_2
Chandelier CandleStick CandleStick_Triple CandleStick_Stand Candle_1 Candle_2 Lantern_Wall Torch_Metal
Mug Table_Plate Table_Fork Table_Knife Table_Spoon Chalice Bottle_1 Potion_1 Potion_2 Potion_4 SmallBottle SmallBottles_1
Coin_Pile Coin_Pile_2 Pouch_Large Bag Scroll_1 Scroll_2 Book_5 Book_7 Book_Stack_1 Book_Stack_2 Key_Gold
BookGroup_Medium_1 BookGroup_Medium_2 BookGroup_Medium_3 BookGroup_Small_1 BookGroup_Small_2 BookGroup_Small_3
Shield_Wooden Sword_Bronze Axe_Bronze Pickaxe_Bronze Banner_1 Banner_2 Banner_1_Cloth Banner_2_Cloth
""".split()

src = Path(sys.argv[1])
size = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 1024
out = Path(__file__).resolve().parent.parent / 'assets/models/fantasy-props.glb'
CT = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
NORM = {5121: 255.0, 5123: 65535.0}
# the kit's plain metal (MI_Trim_Metal: iron bands, hinges, chains, pots, torches, lanterns) is a PBR metal: its colour picture
# is pale and it is the metalness that makes it dark. The game does not light that way, so the iron's darkness is put into
# its vertex colours here (linear: about 0.45 of the picture's brightness as seen, a little cool). The kit's tinted metal
# (MI_Trim_Metal_Vertex: coins, a shield's boss) keeps its own colours.
IRON = np.array([0.16, 0.17, 0.2], '<f4')
PEWTER = np.array([0.44, 0.45, 0.48], '<f4')      # (plates, cutlery, a cup: paler)
TABLEWARE = {'Table_Plate', 'Table_Fork', 'Table_Knife', 'Table_Spoon', 'Chalice'}


def read(j, bins, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']]); n = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', dt.itemsize * n)
    buf = bins[bv['buffer']]
    if stride == dt.itemsize * n:
        arr = np.frombuffer(buf, dt, a['count'] * n, off).reshape(a['count'], n)
    else:
        arr = np.stack([np.frombuffer(buf, dt, n, off + k * stride) for k in range(a['count'])])
    if a.get('normalized') and a['componentType'] in NORM: arr = arr.astype('<f4') / NORM[a['componentType']]
    return arr


def trs(node):                                                  # a node's own matrix (column vectors)
    if 'matrix' in node: return np.array(node['matrix'], dtype=float).reshape(4, 4).T
    t = node.get('translation', [0, 0, 0]); x, y, z, w = node.get('rotation', [0, 0, 0, 1]); s = node.get('scale', [1, 1, 1])
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m = np.eye(4); m[:3, :3] = r * np.array(s); m[:3, 3] = t
    return m


blob = bytearray(); views = []; accessors = []; materials = []; mat_index = {}; images = []; textures = []; img_index = {}
meshes = []; nodes = []


def view(data, target=None):
    while len(blob) % 4: blob.append(0)
    v = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
    if target: v['target'] = target
    blob.extend(data); views.append(v)
    return len(views) - 1


def accessor(arr, ctype, kind, target, minmax=False, normalized=False):
    a = {'bufferView': view(arr.tobytes(), target), 'componentType': ctype, 'count': len(arr), 'type': kind}
    if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    if normalized: a['normalized'] = True
    accessors.append(a)
    return len(accessors) - 1


def material(j, m):
    """one material for each picture (the kit's materials that share a picture are one here)"""
    t = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
    uri = j['images'][j['textures'][t['index']]['source']]['uri'] if t else None
    name = Path(uri).stem.replace('_BaseColor', '') if uri else m['name']
    if name in mat_index: return mat_index[name]
    o = {'name': name, 'doubleSided': True, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 1}}
    if uri:
        if uri not in img_index:
            im = Image.open(src / uri).convert('RGB')
            s = min(256 if 'Page' in uri else size, im.width)
            im = im.resize((s, s), Image.LANCZOS); b = io.BytesIO()
            im.save(b, 'JPEG', quality=84, optimize=True)
            images.append({'bufferView': view(b.getvalue()), 'mimeType': 'image/jpeg', 'name': Path(uri).stem})
            textures.append({'source': len(images) - 1, 'sampler': 0})
            img_index[uri] = len(textures) - 1
        o['pbrMetallicRoughness']['baseColorTexture'] = {'index': img_index[uri]}
    materials.append(o); mat_index[name] = len(materials) - 1
    return mat_index[name]


tris = 0
for name in PROPS:
    j = json.load(open(src / (name + '.gltf')))
    bins = [(src / b['uri']).read_bytes() for b in j['buffers']]
    # every mesh in the scene where it stands (its nodes' matrices down from the scene's roots), by picture
    parts = {}
    def walk(k, parent):
        node = j['nodes'][k]; m = parent @ trs(node)
        if 'mesh' in node:
            for p in j['meshes'][node['mesh']]['primitives']:
                at = p['attributes']; pos = read(j, bins, at['POSITION']).astype(float); nor = read(j, bins, at['NORMAL']).astype(float)
                pos = pos @ m[:3, :3].T + m[:3, 3]; nm = np.linalg.inv(m[:3, :3]).T; nor = nor @ nm.T
                nor /= np.maximum(1e-9, np.linalg.norm(nor, axis=1, keepdims=True))
                uv = read(j, bins, at['TEXCOORD_0']).astype('<f4') if 'TEXCOORD_0' in at else np.zeros((len(pos), 2), '<f4')
                col = read(j, bins, at['COLOR_0'])[:, :3].astype('<f4') if 'COLOR_0' in at else np.ones((len(pos), 3), '<f4')
                if j['materials'][p['material']]['name'] == 'MI_Trim_Metal': col = col * (PEWTER if name in TABLEWARE else IRON)
                idx = read(j, bins, p['indices']).reshape(-1).astype(np.int64)
                if np.linalg.det(m[:3, :3]) < 0: idx = idx.reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)
                mi = material(j, j['materials'][p['material']])
                parts.setdefault(mi, []).append((pos, nor, uv, col, idx))
        for c in node.get('children', []): walk(c, m)
    for root in j['scenes'][j.get('scene', 0)]['nodes']: walk(root, np.eye(4))
    prims = []
    for mi, lst in parts.items():
        pos = np.concatenate([p[0] for p in lst]).astype('<f4'); nor = np.concatenate([p[1] for p in lst])
        uv = np.concatenate([p[2] for p in lst]); col = np.concatenate([p[3] for p in lst])
        offs = np.cumsum([0] + [len(p[0]) for p in lst[:-1]]); idx = np.concatenate([p[4] + o for p, o in zip(lst, offs)])
        big = len(pos) >= 65536
        o = {'attributes': {'POSITION': accessor(pos, 5126, 'VEC3', 34962, True),
                            'NORMAL': accessor(np.round(np.clip(nor, -1, 1) * 127).astype('i1'), 5120, 'VEC3', 34962, normalized=True),
                            'TEXCOORD_0': accessor(uv, 5126, 'VEC2', 34962)},
             'indices': accessor(idx.astype('<u4' if big else '<u2'), 5125 if big else 5123, 'SCALAR', 34963),
             'material': mi}
        if not np.allclose(col, 1, atol=0.004):                  # (a part that is all white needs no colours)
            rgba = np.ones((len(col), 4)); rgba[:, :3] = np.clip(col, 0, 1)
            o['attributes']['COLOR_0'] = accessor(np.round(rgba * 255).astype('u1'), 5121, 'VEC4', 34962, normalized=True)
        prims.append(o); tris += len(idx) // 3
    meshes.append({'name': name, 'primitives': prims}); nodes.append({'name': name, 'mesh': len(meshes) - 1})

# int8 normals: 3 bytes a vertex, so each view's stride is padded to 4
for a in accessors:
    if a['componentType'] == 5120:
        v = views[a['bufferView']]; raw = np.frombuffer(bytes(blob[v['byteOffset']:v['byteOffset'] + v['byteLength']]), 'i1').reshape(-1, 3)
        pad = np.zeros((len(raw), 4), 'i1'); pad[:, :3] = raw
        v2 = view(pad.tobytes(), 34962); views[v2]['byteStride'] = 4; a['bufferView'] = v2
used = sorted({a['bufferView'] for a in accessors} | {i['bufferView'] for i in images})
new_blob = bytearray(); remap = {}
for k in used:
    v = views[k]
    while len(new_blob) % 4: new_blob.append(0)
    data = blob[v['byteOffset']:v['byteOffset'] + v['byteLength']]
    nv = dict(v); nv['byteOffset'] = len(new_blob); new_blob.extend(data); remap[k] = nv
order = {k: n for n, k in enumerate(used)}
for a in accessors: a['bufferView'] = order[a['bufferView']]
for i in images: i['bufferView'] = order[i['bufferView']]
views = [remap[k] for k in used]; blob = new_blob
while len(blob) % 4: blob.append(0)

gltf = {'asset': {'version': '2.0', 'generator': 'pack-fantasy-props.py', 'copyright': 'Fantasy Props MegaKit by Quaternius, CC0 1.0'},
        'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
        'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes, 'materials': materials,
        'textures': textures, 'images': images, 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
        'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(blob)}]}
js = json.dumps(gltf, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
out.parent.mkdir(parents=True, exist_ok=True)
with open(out, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob)))
    f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
    f.write(struct.pack('<I4s', len(blob), b'BIN\0')); f.write(blob)
print(f'{out.name}: {len(PROPS)} props, {tris} triangles, {len(images)} pictures at {size}px, {out.stat().st_size / 1e6:.2f} MB')
