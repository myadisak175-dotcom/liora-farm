#!/usr/bin/env python3
"""Bake Vivi's spring bones (hair, skirt, sleeves and chest that swing) from her original VRoid file into vivi-springs.js.

Her model in vivi-data.js was slimmed for the web and lost its VRM data, the spring settings with it; her hair and cloth
bones are all still there. This reads the settings back out of the original .vrm (VRM 0.x "secondaryAnimation") and
writes them by bone name, already in the form three-vrm's spring bones take (the same conversion three-vrm's
VRMSpringBoneLoaderPlugin makes for a VRM 0.x file: a collider's offset has its z negated). character-springs.js builds
the springs from it at load time.

Usage (from the repo folder):
  python3 tools/bake-vivi-springs.py PATH/TO/Vivi.vrm         (the VRoid sample avatar, CC0)
writes vivi-springs.js next to index.html. No packages needed beyond Python 3.
"""
import base64
import json
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def parse_glb_json(data):
    if data[:4] != b"glTF":
        raise ValueError("not a GLB")
    clen = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + clen])


def her_bone_names():
    """Every node name in her model as the game loads it (vivi-data.js)."""
    src = open(os.path.join(REPO, "vivi-data.js"), encoding="utf-8").read()
    m = re.search(r"export const VIVI_GLB = ['\"`]([A-Za-z0-9+/=]+)", src)
    if not m:
        raise ValueError("VIVI_GLB not found in vivi-data.js")
    return {n.get("name") for n in parse_glb_json(base64.b64decode(m.group(1)))["nodes"]}


def r(v, d=5):
    return round(float(v), d)


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    js = parse_glb_json(open(argv[1], "rb").read())
    sa = js.get("extensions", {}).get("VRM", {}).get("secondaryAnimation")
    if not sa:
        raise ValueError(f"{argv[1]}: no VRM 0.x secondaryAnimation (spring bones) in this file")
    names = [n.get("name") for n in js["nodes"]]
    hers = her_bone_names()

    def bone(i):
        name = names[i]
        if name not in hers:
            raise ValueError(f"bone {name!r} is not in her model (vivi-data.js): is this the same avatar?")
        return name

    collider_groups = []
    for g in sa.get("colliderGroups", []):
        collider_groups.append({
            "bone": bone(g["node"]),
            "colliders": [{"offset": [r(c.get("offset", {}).get("x", 0)), r(c.get("offset", {}).get("y", 0)),
                                      r(-(c.get("offset", {}).get("z", 0) or 0))],      # z is opposite in VRM 0.x
                           "radius": r(c.get("radius", 0))} for c in g.get("colliders", [])],
        })
    springs = []
    for g in sa.get("boneGroups", []):
        gd = g.get("gravityDir") or {"x": 0, "y": -1, "z": 0}
        center = g.get("center", -1)
        springs.append({
            "name": g.get("comment") or "",
            "roots": [bone(i) for i in g.get("bones", [])],
            "stiffness": r(g.get("stiffiness", 1)),                  # (sic: the VRM 0.x field is spelled this way)
            "dragForce": r(g.get("dragForce", 0.4)),
            "gravityPower": r(g.get("gravityPower", 0)),
            "gravityDir": [r(gd.get("x", 0)), r(gd.get("y", 0)), r(gd.get("z", 0))],
            "hitRadius": r(g.get("hitRadius", 0)),
            "colliderGroups": [i for i in g.get("colliderGroups", []) if 0 <= i < len(collider_groups)],
            "center": bone(center) if isinstance(center, int) and center >= 0 else None,
        })
    data = {"colliderGroups": collider_groups, "springs": springs}
    out_path = os.path.join(REPO, "vivi-springs.js")
    head = ("// vivi-springs.js: written by tools/bake-vivi-springs.py from her original VRoid file; do not edit by hand.\n"
            f"// {len(springs)} spring groups ({sum(len(s['roots']) for s in springs)} chains: hair, skirt, sleeves, chest), "
            f"{sum(len(g['colliders']) for g in collider_groups)} collision spheres on {len(collider_groups)} body bones.\n")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(head + "export const VIVI_SPRINGS = " + json.dumps(data, separators=(",", ":")) + ";\n")
    print(head.strip())
    print(f"wrote {out_path} ({os.path.getsize(out_path)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
