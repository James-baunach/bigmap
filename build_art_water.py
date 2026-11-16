"""Build docs/art/water.bin: dissolved water polygons (gzip JSON) for shoreline effects.
Format: [{"b":[x0,y0,x1,y1], "r":[[x,y,x,y,...] outer, hole, ...]}, ...]  (1 decimal, rings flat, not repeated-closing)
Run:  python build_art_water.py
"""
import gzip, json, os
import shapely
from shapely import box
from shapely.geometry import Polygon
import render_map as m
from art_common import *

CLOSE, SIMP, MIN_AREA, PAD = 0.15, 0.3, 12.0, 60.0


def main():
    polys = []
    for bb, s in m.load()["water"]:
        p = None
        for r in parse_rings(s):
            q = Polygon(r)
            if not q.is_valid:
                q = q.buffer(0)
            p = q if p is None else p.symmetric_difference(q)
        if p is not None and not p.is_empty:
            polys.append(p)
    print(len(polys), "water polygons")
    u = shapely.union_all(polys)
    u = u.buffer(CLOSE).buffer(-CLOSE).simplify(SIMP)           # close hairline gaps, then smooth
    u = u.intersection(box(-PAD, -PAD, SIZE + PAD, SIZE + PAD))
    out = []
    for p in (u.geoms if hasattr(u, "geoms") else [u]):
        if p.geom_type != "Polygon" or p.area < MIN_AREA:
            continue
        holes = [h for h in p.interiors if Polygon(h).area >= MIN_AREA]
        rings = [[round(v, 1) for xy in r.coords[:-1] for v in xy] for r in [p.exterior] + holes]
        out.append({"b": [round(v, 1) for v in p.bounds], "r": rings})
    out.sort(key=lambda e: -len(e["r"][0]))
    os.makedirs(ART, exist_ok=True)
    raw = gzip.compress(json.dumps(out, separators=(",", ":")).encode(), 9, mtime=0)
    open(os.path.join(ART, "water.bin"), "wb").write(raw)
    big = sorted(out, key=lambda e: -(e["b"][2] - e["b"][0]))[:3]
    print(len(out), "polygons,", sum(len(e["r"]) - 1 for e in out), "holes,", len(raw) // 1024, "KB;",
          "biggest bboxes", [e["b"] for e in big], "holes", [len(e["r"]) - 1 for e in big])


if __name__ == "__main__":
    main()
