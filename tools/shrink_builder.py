#!/usr/bin/env python3
"""
shrink_builder.py — ย่อ texture ของ GLB ที่ฝัง base64 อยู่ใน Builder HTML

ใช้:  python3 shrink_builder.py input.html output.html

- ไม่แตะโครงสร้าง HTML/JS เลย แทนที่เฉพาะสตริง base64
- ไม่แตะ mesh / โพลี / animation
- ผลลัพธ์ยังเป็นไฟล์เดียว เปิดจาก file:// ได้เหมือนเดิม

ต้องมี Pillow:  pkg install python-pillow   (Termux)
                pip install pillow          (ทั่วไป)
"""

import base64
import io
import json
import re
import struct
import sys

from PIL import Image

# ---- ตั้งค่าขนาด texture สูงสุด (พิกเซล) --------------------------------
DEFAULT_MAX = 512
NAME_MAX = {
    "house2Raw": 1024,   # บ้านหลังใหญ่ ตัวการหลัก
    "houseRaw": 1024,    # Ivybound Cottage
    "raw": 1024,         # Liora (มี animation) — เก็บคมไว้
}

JPEG_QUALITY = 85
PNG_COLORS = 256          # quantize PNG ที่มี alpha ให้เป็น 256 สี
MIN_B64_LEN = 5000        # สตริงสั้นกว่านี้ไม่สนใจ
# ------------------------------------------------------------------------

GLB_MAGIC = b"glTF"
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942

BLOB_RE = re.compile(
    r"([A-Za-z_$][\w$]*)\s*(?::|=)\s*(?:atob\(\s*)?['\"]([A-Za-z0-9+/=]{%d,})['\"]"
    % MIN_B64_LEN
)


def parse_glb(data):
    magic, _version, _length = struct.unpack("<III", data[:12])
    if data[:4] != GLB_MAGIC:
        raise ValueError("ไม่ใช่ GLB")
    gltf, binary = None, b""
    off = 12
    while off < len(data):
        clen, ctype = struct.unpack("<II", data[off:off + 8])
        chunk = data[off + 8:off + 8 + clen]
        if ctype == CHUNK_JSON:
            gltf = json.loads(chunk.decode("utf-8"))
        elif ctype == CHUNK_BIN:
            binary = chunk
        off += 8 + clen
    return gltf, binary


def build_glb(gltf, binary):
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    binary += b"\x00" * ((4 - len(binary) % 4) % 4)
    out = bytearray(GLB_MAGIC)
    out += struct.pack("<II", 2, 12 + 8 + len(js) + 8 + len(binary))
    out += struct.pack("<II", len(js), CHUNK_JSON) + js
    out += struct.pack("<II", len(binary), CHUNK_BIN) + binary
    return bytes(out)


def has_real_alpha(img):
    if img.mode not in ("RGBA", "LA", "P"):
        return False
    img = img.convert("RGBA")
    return img.getchannel("A").getextrema()[0] < 255


def reencode(raw, max_size):
    """ย่อ + บีบรูป คืน (bytes, mime, ขนาดเดิม, ขนาดใหม่)"""
    img = Image.open(io.BytesIO(raw))
    img.load()
    old_size = img.size
    w, h = img.size
    if max(w, h) > max_size:
        scale = max_size / max(w, h)
        img = img.resize(
            (max(1, round(w * scale)), max(1, round(h * scale))),
            Image.LANCZOS,
        )
    buf = io.BytesIO()
    if has_real_alpha(img):
        img.convert("RGBA").quantize(
            colors=PNG_COLORS, method=Image.FASTOCTREE
        ).save(buf, "PNG", optimize=True)
        mime = "image/png"
    else:
        img.convert("RGB").save(
            buf, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True
        )
        mime = "image/jpeg"
    return buf.getvalue(), mime, old_size, img.size


def shrink_glb(data, max_size, label):
    gltf, binary = parse_glb(data)
    images = gltf.get("images", [])
    if not images:
        return data

    views = gltf["bufferViews"]
    # เก็บ bufferView ที่ไม่ใช่รูป ไว้ตามเดิม แล้วต่อรูปใหม่ท้ายบัฟเฟอร์
    new_bin = bytearray()
    remap = {}
    img_views = {im["bufferView"] for im in images if "bufferView" in im}

    for i, bv in enumerate(views):
        if i in img_views:
            continue
        off = bv.get("byteOffset", 0)
        chunk = binary[off:off + bv["byteLength"]]
        pad = (4 - len(new_bin) % 4) % 4
        new_bin += b"\x00" * pad
        remap[i] = (len(new_bin), len(chunk))
        new_bin += chunk

    for im in images:
        bv_i = im.get("bufferView")
        if bv_i is None:
            continue
        bv = views[bv_i]
        off = bv.get("byteOffset", 0)
        raw = binary[off:off + bv["byteLength"]]
        try:
            enc, mime, old_px, new_px = reencode(raw, max_size)
        except Exception as e:
            print(f"    ! ข้ามรูปหนึ่ง ({e})")
            enc, mime = raw, im.get("mimeType", "image/png")
            old_px = new_px = ("?", "?")
        print(
            f"    {old_px[0]}x{old_px[1]} -> {new_px[0]}x{new_px[1]}  "
            f"{len(raw)/1048576:.2f}MB -> {len(enc)/1048576:.2f}MB"
        )
        pad = (4 - len(new_bin) % 4) % 4
        new_bin += b"\x00" * pad
        remap[bv_i] = (len(new_bin), len(enc))
        new_bin += enc
        im["mimeType"] = mime

    for i, bv in enumerate(views):
        off, length = remap[i]
        bv["byteOffset"] = off
        bv["byteLength"] = length
        bv.pop("byteStride", None) if i in img_views else None

    gltf["buffers"] = [{"byteLength": len(new_bin)}]
    return build_glb(gltf, bytes(new_bin))


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]

    print(f"อ่าน {src} ...")
    html = open(src, encoding="utf-8", errors="surrogatepass").read()
    print(f"  ขนาดเดิม {len(html)/1048576:.1f} MB\n")

    replacements = []
    for m in BLOB_RE.finditer(html):
        name, b64 = m.group(1), m.group(2)
        try:
            data = base64.b64decode(b64)
        except Exception:
            continue
        if data[:4] != GLB_MAGIC:
            continue
        max_size = NAME_MAX.get(name, DEFAULT_MAX)
        print(f"  [{name}] {len(data)/1048576:.2f} MB  (max {max_size}px)")
        try:
            new_data = shrink_glb(data, max_size, name)
        except Exception as e:
            print(f"    ! ข้ามทั้งก้อน ({e})")
            continue
        new_b64 = base64.b64encode(new_data).decode("ascii")
        print(f"    รวม {len(data)/1048576:.2f} MB -> {len(new_data)/1048576:.2f} MB\n")
        replacements.append((m.start(2), m.end(2), new_b64))

    if not replacements:
        print("ไม่เจอ GLB ที่ฝังไว้เลย — ตรวจ MIN_B64_LEN หรือรูปแบบไฟล์")
        sys.exit(1)

    out = []
    prev = 0
    for start, end, new_b64 in replacements:
        out.append(html[prev:start])
        out.append(new_b64)
        prev = end
    out.append(html[prev:])
    result = "".join(out)

    open(dst, "w", encoding="utf-8", errors="surrogatepass").write(result)
    print(f"เขียน {dst}")
    print(f"  {len(html)/1048576:.1f} MB -> {len(result)/1048576:.1f} MB")


if __name__ == "__main__":
    main()
