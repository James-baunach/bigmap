"""Build docs/hoods.json (neighborhood / city outlines in base coordinates).

Sources
  * LOJIC "Louisville KY Urban Neighborhoods" (ArcGIS MapServer layer 15), downloaded to
    data/hoods_src/urban_neighborhoods.geojson
  * OpenStreetMap admin_level=8 boundaries and place=neighbourhood|suburb|quarter areas,
    read from data/pbf/*.osm.pbf (cached in data/hoods_osm_cache.json; delete to rescan).
    The same scan caches place nodes for build_labels.py.
Run:  python build_hoods.py
"""
import json, math, os, re, urllib.request
import numpy as np
import shapely
from shapely import wkt
from shapely.geometry import box, Polygon, MultiPolygon
import osmium
import fetch_osm

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "data", "hoods_src", "urban_neighborhoods.geojson")
URL = ("https://gis.lojic.org/maps/rest/services/LojicSolutions/OpenDataSociety/MapServer/15/query"
       "?where=1%3D1&outFields=*&outSR=4326&f=geojson")
CACHE = os.path.join(HERE, "data", "hoods_osm_cache.json")
OUT = os.path.join(HERE, "docs", "hoods.json")
SIZE = 8640.0
X0, Y0, X1, Y1 = fetch_osm.extent()
S = SIZE / (X1 - X0)
R = fetch_osm.R
MAPBOX = box(0, 0, SIZE, SIZE)
SKIP = {"louisville", "louisvillemetro", "jeffersoncounty", "remainderofcity",
        "louisvillejeffersoncountymetrogovernmentbalance", "louisvillejeffersoncounty"}


def proj_arr(lon, lat):
    lon, lat = np.asarray(lon, float), np.asarray(lat, float)
    x = (np.radians(lon) * R - X0) * S
    y = (np.log(np.tan(np.pi / 4 + np.radians(lat) / 2)) * R - Y0) * S
    return x, y


def to_base(geom):  # shapely geometry in lon/lat -> base coordinates
    return shapely.transform(geom, lambda c: np.column_stack(proj_arr(c[:, 0], c[:, 1])))


def key(name):
    n = re.sub(r"\s+neighbou?rhood$", "", name.strip().lower().replace("saint", "st"))
    return re.sub(r"[^a-z0-9]", "", n).rstrip("s")


def pretty(name):
    s = name.strip().title()
    s = re.sub(r"\bSaint\b", "St.", s)
    return s


# ---- OSM scan -------------------------------------------------------------------
class Scan(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.areas, self.nodes = [], []
        self.wkb = osmium.geom.WKBFactory()

    def node(self, n):
        p = n.tags.get("place")
        if p in ("suburb", "neighbourhood", "town", "city", "village") and "name" in n.tags and n.location.valid():
            x, y = proj_arr(n.location.lon, n.location.lat)
            if 0 <= x <= SIZE and 0 <= y <= SIZE:
                self.nodes.append({"n": n.tags["name"], "place": p, "x": round(float(x), 1), "y": round(float(y), 1)})

    def area(self, a):
        t = a.tags
        name = t.get("name")
        if not name:
            return
        if t.get("boundary") == "administrative" and t.get("admin_level") == "8":
            kind = "city"
        elif t.get("place") in ("neighbourhood", "suburb", "quarter"):
            kind = "neighborhood"
        else:
            return
        try:
            g = shapely.from_wkb(self.wkb.create_multipolygon(a), )
        except Exception:
            return
        g = to_base(g)
        if g.is_empty or not g.intersects(MAPBOX):
            return
        self.areas.append({"name": name, "kind": kind, "wkt": g.wkt})


def osm_scan():
    if os.path.exists(CACHE):
        return json.load(open(CACHE))
    h = Scan()
    for st in ("kentucky", "indiana"):
        print("scanning", st, flush=True)
        h.apply_file(os.path.join(HERE, "data", "pbf", st + ".osm.pbf"), locations=True, idx="flex_mem")
    d = {"areas": h.areas, "nodes": h.nodes}
    json.dump(d, open(CACHE, "w"))
    return d


# ---- build ----------------------------------------------------------------------
def rings_of(g):
    polys = [g] if isinstance(g, Polygon) else [p for p in getattr(g, "geoms", []) if isinstance(p, Polygon)]
    out = []
    for p in polys:
        for r in [p.exterior, *p.interiors]:
            c = np.round(np.asarray(r.coords)[:-1], 1)
            if len(c) >= 3:
                out.append([float(v) for v in c.ravel()])
    return out


def main():
    if not os.path.exists(SRC):
        os.makedirs(os.path.dirname(SRC), exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "map-builder"}), timeout=90) as r:
            open(SRC, "wb").write(r.read())
    items = {}  # key -> dict(name, kind, geom, source)
    gj = json.load(open(SRC))
    for f in gj["features"]:
        nm = (f["properties"].get("NH_NAME") or "").strip()
        if not nm or key(nm) in SKIP:
            continue
        g = shapely.geometry.shape(f["geometry"])
        k = key(nm)
        if k in items:
            items[k]["geom"] = items[k]["geom"].union(to_base(g))
        else:
            items[k] = {"name": pretty(nm), "kind": "neighborhood", "geom": to_base(g), "src": "LOJIC"}
    nlojic = len(items)
    osm = osm_scan()
    half = SIZE * SIZE / 2
    for a in sorted(osm["areas"], key=lambda a: a["kind"] != "city"):  # admin boundaries first
        k = key(a["name"])
        if k in items or k in SKIP:
            continue
        g = wkt.loads(a["wkt"])
        if not g.is_valid:
            g = g.buffer(0)
        if g.area > half:
            continue
        items[k] = {"name": a["name"], "kind": a["kind"], "geom": g, "src": "OSM"}
    out = []
    for it in items.values():
        g = it["geom"].intersection(MAPBOX.buffer(40))  # clip to the map plus a little margin
        g = g.simplify(1.5)
        rings = rings_of(g)
        if not rings:
            continue
        xs = [v for r in rings for v in r[0::2]]
        ys = [v for r in rings for v in r[1::2]]
        out.append({"name": it["name"], "kind": it["kind"],
                    "bbox": [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)],
                    "rings": rings, "_src": it["src"]})
    out.sort(key=lambda o: o["name"].lower())
    stats = {}
    for o in out:
        stats[(o["_src"], o["kind"])] = stats.get((o["_src"], o["kind"]), 0) + 1
        del o["_src"]
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(len(out), "areas (LOJIC merged", nlojic, ")", stats, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
