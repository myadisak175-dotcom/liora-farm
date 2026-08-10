#!/usr/bin/env python3
"""
split_builder.py — แยก GLB ที่ฝัง base64 ออกเป็นไฟล์จริง แล้วแก้ HTML ให้โหลดจาก path

ใช้:  python3 split_builder.py input.html outdir/

ผลลัพธ์ใน outdir/
    index.html
    assets/models/builder/*.glb
    assets/models/player/*.glb

ต้องรันผ่านเซิร์ฟเวอร์ (file:// จะโดน CORS):
    cd outdir && python3 -m http.server 8000
"""

import base64
import os
import re
import sys

# ชื่อตัวแปรใน HTML -> path ปลายทาง
BLOB_MAP = {
    "houseRaw":  "assets/models/builder/house.glb",
    "house2Raw": "assets/models/builder/house2.glb",
    "pineRaw":   "assets/models/builder/pine.glb",
    "palmRaw":   "assets/models/builder/palm.glb",
    "treeRaw":   "assets/models/builder/tree.glb",
    "raw":       "assets/models/player/liora_all_animations_web_1k.glb",
}

# ตัวที่อยู่ในอ็อบเจ็กต์ embeddedBuilderAssets
CATALOG_KEYS = ["grass", "crate", "wine_barrel", "path_tile"]
CATALOG_DIR = "assets/models/builder"

# ชื่อตัวแปร -> ชื่อตัวแปร URL ที่โค้ดเดิมใช้อยู่
URL_VAR = {
    "houseRaw": "houseURL",
    "house2Raw": "house2URL",
    "pineRaw": "pineURL",
    "palmRaw": "palmURL",
    "treeRaw": "treeURL",
    "raw": "modelURL",
}


def write_asset(outdir, relpath, data):
    full = os.path.join(outdir, relpath)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as f:
        f.write(data)
    print(f"  {relpath:52s} {len(data)/1048576:6.2f} MB")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, outdir = sys.argv[1], sys.argv[2]

    html = open(src, encoding="utf-8", errors="surrogatepass").read()
    print(f"อ่าน {src}  ({len(html)/1048576:.1f} MB)\n")
    os.makedirs(outdir, exist_ok=True)

    print("เขียนไฟล์โมเดล:")

    # ---- 1) ก้อนที่ประกาศเดี่ยว ๆ ด้วย atob(...) -----------------------
    for var, relpath in BLOB_MAP.items():
        pat = re.compile(
            r"const\s+" + re.escape(var) + r"\s*=\s*atob\(\s*['\"]([A-Za-z0-9+/=]+)['\"]\s*\)\s*;"
        )
        m = pat.search(html)
        if not m:
            print(f"  ! ไม่เจอ {var} — ข้าม")
            continue
        write_asset(outdir, relpath, base64.b64decode(m.group(1)))
        html = html[:m.start()] + html[m.end():]

        # ลบบรรทัดแปลง bytes + สร้าง object URL แล้วแทนด้วย path ตรง ๆ
        prefix = var[:-3] if var.endswith("Raw") else ""
        bytes_var = (prefix + "Bytes") if prefix else "bytes"
        url_var = URL_VAR[var]

        plumbing = re.compile(
            r"const\s+" + re.escape(bytes_var) + r"\s*=\s*new\s+Uint8Array\([^)]*\)\s*;\s*"
            r"for\s*\([^)]*\)\s*" + re.escape(bytes_var) + r"\[i\]\s*=\s*[\w]+\.charCodeAt\(i\)\s*;\s*"
            r"const\s+" + re.escape(url_var) + r"\s*=\s*URL\.createObjectURL\([^;]*\)\s*;"
        )
        replacement = f"const {url_var} = '{relpath}';"
        html, n = plumbing.subn(replacement, html, count=1)
        if not n:
            print(f"    ! แก้โค้ดโหลดของ {var} ไม่สำเร็จ — ต้องแก้มือ")

    # ---- 2) อ็อบเจ็กต์ embeddedBuilderAssets ---------------------------
    obj = re.compile(r"const\s+embeddedBuilderAssets\s*=\s*\{(.*?)\}\s*;", re.S)
    m = obj.search(html)
    if m:
        body = m.group(1)
        paths = {}
        for key in CATALOG_KEYS:
            km = re.search(
                re.escape(key) + r'\s*:\s*["\']([A-Za-z0-9+/=]+)["\']', body
            )
            if not km:
                print(f"  ! ไม่เจอ {key} — ข้าม")
                continue
            rel = f"{CATALOG_DIR}/{key}.glb"
            write_asset(outdir, rel, base64.b64decode(km.group(1)))
            paths[key] = rel
        entries = ",".join(f'{k}:"{v}"' for k, v in paths.items())
        html = html[:m.start()] + f"const embeddedBuilderAssets={{{entries}}};" + html[m.end():]

        # เปลี่ยนตัวโหลดให้รับ path แทน base64
        old_loader = re.compile(
            r"const\s+raw\s*=\s*atob\(embeddedBuilderAssets\[assetId\]\)\s*;\s*"
            r"const\s+bytes\s*=\s*new\s+Uint8Array\(raw\.length\)\s*;\s*"
            r"for\s*\([^)]*\)\s*bytes\[i\]\s*=\s*raw\.charCodeAt\(i\)\s*;\s*"
            r"const\s+url\s*=\s*URL\.createObjectURL\([^;]*\)\s*;"
        )
        html, n = old_loader.subn(
            "const url=embeddedBuilderAssets[assetId];", html, count=1
        )
        if not n:
            print("  ! แก้ loadEmbeddedBuilderAsset ไม่สำเร็จ — ต้องแก้มือ")
        # revokeObjectURL กับ path ธรรมดาไม่มีผล แต่ไม่พัง ปล่อยไว้ได้

    out_html = os.path.join(outdir, "index.html")
    open(out_html, "w", encoding="utf-8", errors="surrogatepass").write(html)
    print(f"\nเขียน {out_html}  ({len(html)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
