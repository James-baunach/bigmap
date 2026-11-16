"""Build docs/labels/<cx>_<cy>.bin (gzipped JSON street-label lines per 540-unit cell) and docs/labels/places.json.

Needs data/hoods_osm_cache.json and docs/hoods.json from build_hoods.py (for place points).
Run:  python build_labels.py
"""
import gzip, json, os, re
from collections import defaultdict
import osmium
import shapely
from shapely import box
from shapely.ops import linemerge
from shapely.geometry import LineString, MultiLineString, Polygon
import fetch_osm
from build_hoods import proj_arr, key, SIZE

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "docs", "labels")
CELL, MARGIN, NC = 540.0, 8.0, 16
CLS = {"motorway": 0, "trunk": 0, "primary": 1, "secondary": 1, "tertiary": 2,
       "residential": 3, "unclassified": 3, "living_street": 3}
MINLEN = {0: 10, 1: 10, 2: 25, 3: 25}


class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = defaultdict(list)  # (name, cls) -> [coords]

    def way(self, w):
        c = CLS.get(w.tags.get("highway"))
        if c is None:
            return
        name = w.tags.get("name")
        if not name and c == 0 and w.tags.get("ref"):
            name = w.tags["ref"].split(";")[0].strip().replace(" ", "-", 1)  # "I 64" -> "I-64"
        if not name:
            return
        pts = [(n.lon, n.lat) for n in w.nodes if n.location.valid()]
        if len(pts) < 2:
            return
        lon, lat = zip(*pts)
        x, y = proj_arr(lon, lat)
        if x.max() < -50 or y.max() < -50 or x.min() > SIZE + 50 or y.min() > SIZE + 50:
            return
        self.ways[(name, c)].append(list(zip(x.tolist(), y.tolist())))


def lines_of(g):
    if g.is_empty:
        return []
    return [g] if isinstance(g, LineString) else [p for p in g.geoms if isinstance(p, LineString)]


def main():
    h = H()
    for st in ("kentucky", "indiana"):
        print("reading", st, flush=True)
        h.apply_file(os.path.join(HERE, "data", "pbf", st + ".osm.pbf"), locations=True, idx="flex_mem")
    cells = defaultdict(list)
    for (name, c), segs in h.ways.items():
        merged = linemerge(MultiLineString([s for s in segs]))
        for ln in lines_of(merged):
            bx0, by0, bx1, by1 = ln.bounds
            for cx in range(max(0, int((bx0 - MARGIN) // CELL)), min(NC - 1, int((bx1 + MARGIN) // CELL)) + 1):
                for cy in range(max(0, int((by0 - MARGIN) // CELL)), min(NC - 1, int((by1 + MARGIN) // CELL)) + 1):
                    clip = ln.intersection(box(cx * CELL - MARGIN, cy * CELL - MARGIN,
                                               (cx + 1) * CELL + MARGIN, (cy + 1) * CELL + MARGIN))
                    for piece in lines_of(shapely.line_merge(clip) if clip.geom_type == "MultiLineString" else clip):
                        piece = piece.simplify(0.8)
                        if piece.length < MINLEN[c] or len(piece.coords) < 2:
                            continue
                        p = [round(v, 1) for xy in piece.coords for v in xy]
                        cells[(cx, cy)].append({"n": name, "c": c, "p": p})
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".bin"):
            os.remove(os.path.join(OUT, f))
    total = 0
    for (cx, cy), items in sorted(cells.items()):
        data = gzip.compress(json.dumps(items, separators=(",", ":"), ensure_ascii=False).encode("utf-8"), 9, mtime=0)
        open(os.path.join(OUT, f"{cx}_{cy}.bin"), "wb").write(data)
        total += len(data)
    print(len(cells), "tiles,", sum(len(v) for v in cells.values()), "lines,", round(total / 1e6, 2), "MB gzipped")

    # ---- places.json ----
    hoods = json.load(open(os.path.join(HERE, "docs", "hoods.json")))
    places, seen = [], set()
    for a in hoods:
        poly = None
        for r in a["rings"]:
            ring = Polygon(list(zip(r[0::2], r[1::2])))
            poly = ring if poly is None else poly.symmetric_difference(ring)  # even-odd
        if poly is None or poly.is_empty:
            continue
        pt = poly.intersection(shapely.box(0, 0, SIZE, SIZE)).representative_point()
        places.append({"n": a["name"], "x": round(pt.x, 1), "y": round(pt.y, 1), "r": 0 if a["kind"] == "city" else 1})
        seen.add(key(a["name"]))
    cache = json.load(open(os.path.join(HERE, "data", "hoods_osm_cache.json")))
    for n in cache["nodes"]:
        k = key(n["n"])
        if k in seen or k == "louisville":
            continue
        seen.add(k)
        places.append({"n": n["n"], "x": n["x"], "y": n["y"], "r": 1 if n["place"] in ("suburb", "neighbourhood") else 0})
    places.sort(key=lambda p: p["n"].lower())
    json.dump(places, open(os.path.join(OUT, "places.json"), "w"), separators=(",", ":"), ensure_ascii=False)
    print(len(places), "places", sum(p["r"] == 0 for p in places), "cities")


if __name__ == "__main__":
    main()
