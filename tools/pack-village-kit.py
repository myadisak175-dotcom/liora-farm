# pack-village-kit.py  —  the pieces of Quaternius' Medieval Village MegaKit (CC0) that the village map builds its houses
# from, packed into one small file: assets/models/village-kit.glb
#
# The kit comes as 176 separate .gltf files with 2048 px colour, normal and roughness pictures (59 MB). The game needs only the
# pieces in PIECES below, their colour pictures (the game lights them itself, in three bands) and those at a size a phone is
# happy with. One node for each piece, named as in the kit; one primitive for each material of a piece.
#
#   python3 tools/pack-village-kit.py <the kit's glTF folder> [--size 1024]
#
# The kit: https://quaternius.com/packs/medievalvillagemegakit.html  (the free Standard set; glTF folder)
import io, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image

PIECES = """
Wall_Plaster_Straight Wall_Plaster_Straight_Base Wall_Plaster_WoodGrid Wall_Plaster_Door_Flat Wall_Plaster_Door_Round
Wall_Plaster_Window_Wide_Flat Wall_Plaster_Window_Wide_Round Wall_Plaster_Window_Thin_Round
Wall_UnevenBrick_Straight Wall_UnevenBrick_Door_Flat Wall_UnevenBrick_Door_Round
Wall_UnevenBrick_Window_Wide_Flat Wall_UnevenBrick_Window_Wide_Round Wall_UnevenBrick_Window_Thin_Round
Corner_Exterior_Wood Corner_ExteriorWide_Wood
Door_1_Flat Door_1_Round Door_4_Flat Door_8_Round DoorFrame_Flat_WoodDark DoorFrame_Round_WoodDark
Window_Wide_Flat1 Window_Wide_Round1 Window_Thin_Round1
WindowShutters_Wide_Flat_Open WindowShutters_Wide_Round_Open WindowShutters_Thin_Round_Open
Roof_RoundTiles_4x4 Roof_RoundTiles_4x6 Roof_RoundTiles_4x8 Roof_RoundTiles_6x6 Roof_RoundTiles_6x8 Roof_RoundTiles_6x10
Roof_RoundTiles_6x12 Roof_RoundTiles_8x10 Roof_RoundTiles_8x12 Roof_RoundTiles_8x14
Roof_Front_Brick4 Roof_Front_Brick6 Roof_Front_Brick8 Roof_Tower_RoundTiles Roof_Dormer_RoundTile
Prop_Chimney Prop_Chimney2 Prop_Crate Prop_Wagon Prop_Support
Prop_WoodenFence_Single Prop_WoodenFence_Extension1 Prop_WoodenFence_Extension2
Prop_Vine1 Prop_Vine2 Prop_Vine5 Prop_Vine6 Prop_ExteriorBorder_Straight1 Prop_ExteriorBorder_Corner
Stairs_Exterior_Straight Stairs_Exterior_Platform Balcony_Cross_Straight
""".split()

src = Path(sys.argv[1])
size = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 1024
out = Path(__file__).resolve().parent.parent / 'assets/models/village-kit.glb'
CT = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read(j, bins, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']]); n = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', dt.itemsize * n)
    buf = bins[bv['buffer']]
    if stride == dt.itemsize * n:
        return np.frombuffer(buf, dt, a['count'] * n, off).reshape(a['count'], n)
    return np.stack([np.frombuffer(buf, dt, n, off + k * stride) for k in range(a['count'])])


blob = bytearray(); views = []; accessors = []; materials = []; mat_index = {}; images = []; textures = []; img_index = {}
meshes = []; nodes = []


def view(data, target=None):
    while len(blob) % 4: blob.append(0)
    v = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
    if target: v['target'] = target
    blob.extend(data); views.append(v)
    return len(views) - 1


def accessor(arr, ctype, kind, target, minmax=False):
    a = {'bufferView': view(arr.tobytes(), target), 'componentType': ctype, 'count': len(arr), 'type': kind}
    if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accessors.append(a)
    return len(accessors) - 1


def material(j, m):
    name = m['name']
    if name in mat_index: return mat_index[name]
    pbr = m.get('pbrMetallicRoughness', {}); o = {'name': name, 'doubleSided': True, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 1}}
    if 'baseColorFactor' in pbr: o['pbrMetallicRoughness']['baseColorFactor'] = pbr['baseColorFactor']
    if m.get('alphaMode') == 'MASK': o['alphaMode'] = 'MASK'; o['alphaCutoff'] = m.get('alphaCutoff', 0.5)
    t = pbr.get('baseColorTexture')
    if t:
        uri = j['images'][j['textures'][t['index']]['source']]['uri']
        if uri not in img_index:
            im = Image.open(src / uri); alpha = o.get('alphaMode') == 'MASK'
            im = im.convert('RGBA' if alpha else 'RGB')
            s = min(size, im.width) if not alpha else min(256, im.width)
            im = im.resize((s, s), Image.LANCZOS); b = io.BytesIO()
            if alpha: im.save(b, 'PNG', optimize=True)
            else: im.save(b, 'JPEG', quality=84, optimize=True)
            images.append({'bufferView': view(b.getvalue()), 'mimeType': 'image/png' if alpha else 'image/jpeg', 'name': Path(uri).stem})
            textures.append({'source': len(images) - 1, 'sampler': 0})
            img_index[uri] = len(textures) - 1
        o['pbrMetallicRoughness']['baseColorTexture'] = {'index': img_index[uri]}
    materials.append(o); mat_index[name] = len(materials) - 1
    return mat_index[name]


tris = 0
for name in PIECES:
    j = json.load(open(src / (name + '.gltf')))
    bins = [(src / b['uri']).read_bytes() for b in j['buffers']]
    assert len(j['nodes']) == 1 and not any(k in j['nodes'][0] for k in ('translation', 'rotation', 'scale', 'matrix')), name
    prims = []
    for p in j['meshes'][0]['primitives']:
        pos = read(j, bins, p['attributes']['POSITION']).astype('<f4'); nor = read(j, bins, p['attributes']['NORMAL'])
        idx = read(j, bins, p['indices']).reshape(-1)
        o = {'attributes': {'POSITION': accessor(pos, 5126, 'VEC3', 34962, True),
                            'NORMAL': accessor(np.round(np.clip(nor, -1, 1) * 127).astype('i1'), 5120, 'VEC3', 34962)},
             'indices': accessor(idx.astype('<u2' if len(pos) < 65536 else '<u4'), 5123 if len(pos) < 65536 else 5125, 'SCALAR', 34963),
             'material': material(j, j['materials'][p['material']])}
        accessors[o['attributes']['NORMAL']]['normalized'] = True
        if 'TEXCOORD_0' in p['attributes']:
            o['attributes']['TEXCOORD_0'] = accessor(read(j, bins, p['attributes']['TEXCOORD_0']).astype('<f4'), 5126, 'VEC2', 34962)
        prims.append(o); tris += len(idx) // 3
    meshes.append({'name': name, 'primitives': prims}); nodes.append({'name': name, 'mesh': len(meshes) - 1})

# int8 normals: 3 bytes a vertex, so each view's stride is padded to 4
for a in accessors:
    if a['componentType'] == 5120:
        v = views[a['bufferView']]; raw = np.frombuffer(bytes(blob[v['byteOffset']:v['byteOffset'] + v['byteLength']]), 'i1').reshape(-1, 3)
        pad = np.zeros((len(raw), 4), 'i1'); pad[:, :3] = raw
        v2 = view(pad.tobytes(), 34962); views[v2]['byteStride'] = 4; a['bufferView'] = v2
# (the unpadded copies stay in the file as unused bytes only if left; rebuild the blob without them)
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

gltf = {'asset': {'version': '2.0', 'generator': 'pack-village-kit.py', 'copyright': 'Medieval Village MegaKit by Quaternius, CC0 1.0'},
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
print(f'{out.name}: {len(PIECES)} pieces, {tris} triangles, {len(images)} pictures at {size}px, {out.stat().st_size / 1e6:.2f} MB')
