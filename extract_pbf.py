"""Extract the map extent from Geofabrik state .osm.pbf files into the JSON
layout render_map.py reads (same shape as Overpass 'out geom')."""
import json, os, sys, time
import osmium
import fetch_osm
from render_map import classify

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

x0, y0, x1, y1 = fetch_osm.extent()
S_, W_ = fetch_osm.inv(x0 - 500, y0 - 500)
N_, E_ = fetch_osm.inv(x1 + 500, y1 + 500)
KEYS = ("highway", "railway", "waterway", "natural", "leisure", "landuse", "aeroway")
KEEP = KEYS + ("area", "footway", "service", "tunnel")


class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.main, self.bldg = [], []

    def inside(self, nodes):
        for n in nodes:
            loc = n.location if hasattr(n, "location") else n
            if loc.valid() and W_ <= loc.lon <= E_ and S_ <= loc.lat <= N_:
                return True
        return False

    @staticmethod
    def geom(nodes):
        out = []
        for n in nodes:
            loc = n.location if hasattr(n, "location") else n
            if loc.valid():
                out.append({"lat": round(loc.lat, 7), "lon": round(loc.lon, 7)})
        return out

    def way(self, w):
        t = w.tags
        if not any(k in t for k in KEYS):
            return
        tags = {k: t[k] for k in KEEP if k in t}
        cls = classify(tags)
        if not cls or cls[1]:
            return
        if not self.inside(w.nodes):
            return
        self.main.append({"type": "way", "id": w.id, "tags": tags, "geometry": self.geom(w.nodes)})

    def area(self, a):
        t = a.tags
        b = "building" in t and t["building"] != "no"
        tags = {}
        if not b:
            if not any(k in t for k in KEYS):
                return
            tags = {k: t[k] for k in KEEP if k in t}
            cls = classify(tags)
            if not cls or not cls[1]:
                return
        rings = []
        hit = False
        for outer in a.outer_rings():
            if self.inside(outer):
                hit = True
            rings.append(self.geom(outer))
            for inner in a.inner_rings(outer):
                rings.append(self.geom(inner))
        if not hit:
            return
        tags["type"] = "multipolygon"
        el = {"type": "relation", "id": a.id, "tags": tags,
              "members": [{"type": "way", "geometry": r} for r in rings]}
        (self.bldg if b else self.main).append(el)


for name in sys.argv[1:]:
    t0 = time.time()
    h = H()
    h.apply_file(os.path.join(DATA, "pbf", name + ".osm.pbf"), locations=True, idx="flex_mem")
    for kind, els in (("main", h.main), ("bldg", h.bldg)):
        with open(os.path.join(DATA, f"{kind}_pbf_{name}.json"), "w") as f:
            json.dump({"elements": els}, f)
    print(name, len(h.main), "features", len(h.bldg), "buildings", "%.0fs" % (time.time() - t0), flush=True)
