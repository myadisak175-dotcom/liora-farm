#!/usr/bin/env python3
"""Bake a character's spring bones (hair, skirt, sleeves and chest that swing) from its original VRoid file.

The game's character models (tools/prep-vroid.py) are slimmed for the web and lose their VRM data, the spring
settings with it; the hair and cloth bones are all still there. This reads the settings back out of the original .vrm
(VRM 0.x "secondaryAnimation") and writes them by bone name, already in the form three-vrm's spring bones take (the same
conversion three-vrm's VRMSpringBoneLoaderPlugin makes for a VRM 0.x file: a collider's offset has its z negated).
character-springs.js builds the springs from it at load time.

Usage (from the repo folder):
  python3 tools/bake-character-springs.py IN.vrm MODEL.glb OUT.springs.json
    IN.vrm     the character's original VRoid file (CC0 samples)
    MODEL.glb  the game model made from it (assets/characters/<id>.glb): every bone named is checked to be in it
No packages needed beyond Python 3.
"""
import json
import struct
import sys

# The game's own taste over the VRoid files' values, by spring group name. VRoid skirts are very loose (stiffness 0.5,
# drag 0.05): running, they flew up past the waist. Stiffer and damped, a skirt still swings and lifts over the knees (the
# leg collision spheres still push it), but settles quickly: on a sprint, nine bones in ten stay within ~40° of rest (was ~80°).
TUNE = {
    "Skirt": {"stiffness": 3.0, "dragForce": 0.5},
}


def parse_glb_json(path):
    data = open(path, "rb").read()
    if data[:4] != b"glTF":
        raise ValueError(f"{path}: not a GLB")
    clen = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + clen])


def r(v, d=5):
    return round(float(v), d)


def main(argv):
    if len(argv) < 4:
        print(__doc__)
        return 1
    js = parse_glb_json(argv[1])
    sa = js.get("extensions", {}).get("VRM", {}).get("secondaryAnimation")
    if not sa:
        raise ValueError(f"{argv[1]}: no VRM 0.x secondaryAnimation (spring bones) in this file")
    names = [n.get("name") for n in js["nodes"]]
    model_bones = {n.get("name") for n in parse_glb_json(argv[2])["nodes"]}

    def bone(i):
        name = names[i]
        if name not in model_bones:
            raise ValueError(f"bone {name!r} is not in {argv[2]}: is it made from the same avatar?")
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
        springs[-1].update(TUNE.get(springs[-1]["name"], {}))
    data = {"colliderGroups": collider_groups, "springs": springs,
            "tuned": {k: v for k, v in TUNE.items() if any(s["name"] == k for s in springs)}}
    with open(argv[3], "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"{argv[3]}: {len(springs)} spring groups ({sum(len(s['roots']) for s in springs)} chains), "
          f"{sum(len(g['colliders']) for g in collider_groups)} collision spheres on {len(collider_groups)} bones"
          + (f"; tuned: {', '.join(data['tuned'])}" if data["tuned"] else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
