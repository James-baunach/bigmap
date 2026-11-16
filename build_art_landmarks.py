"""Build docs/art/landmarks.json: ~24 landmark positions (base coordinates) taken from the OSM extracts.
Each landmark is pinned to a specific OSM object found by name/tag search ('n' node, 'w' way, 'a' osmium area id =
2*way id or 2*relation id+1); the position is the centroid of that object. Reads both .osm.pbf files (~8 min).
Run:  python build_art_landmarks.py
"""
import json, os
import osmium
from shapely.geometry import MultiPoint, Polygon
from shapely.ops import unary_union
from build_hoods import proj_arr

HERE = os.path.dirname(os.path.abspath(__file__))
# slug, name, kind, osm type, osm id
SPEC = [
    ("churchill-downs", "Churchill Downs", "racetrack", "w", 24685850),
    ("big-four-bridge", "Big Four Bridge", "bridge", "a", 1310594188),
    ("louisville-slugger-museum", "Louisville Slugger Museum", "bat", "w", 331282813),
    ("kfc-yum-center", "KFC Yum! Center", "arena", "w", 331282808),
    ("muhammad-ali-center", "Muhammad Ali Center", "museum", "w", 264161753),
    ("belle-of-louisville", "Belle of Louisville", "boat", "n", 8589312353),
    ("louisville-zoo", "Louisville Zoo", "zoo", "w", 24050556),
    ("cherokee-park", "Cherokee Park (Hogan's Fountain)", "park", "w", 237256811),
    ("iroquois-park", "Iroquois Park (Amphitheater)", "park", "w", 331586170),
    ("university-of-louisville", "University of Louisville (Grawemeyer Hall)", "university", "w", 334900740),
    ("l-and-n-stadium", "L&N Federal Credit Union Stadium", "stadium", "w", 663916139),
    ("lynn-family-stadium", "Lynn Family Stadium", "stadium", "a", 22415157),
    ("louisville-slugger-field", "Louisville Slugger Field", "ballpark", "a", 9427629),
    ("louisville-water-tower", "Louisville Water Tower", "tower", "a", 664662322),
    ("falls-of-the-ohio", "Falls of the Ohio Interpretive Center", "fossils", "w", 943420512),
    ("waterfront-park", "Waterfront Park", "park", "a", 33004831),
    ("louisville-airport", "Louisville Muhammad Ali International Airport", "airport", "a", 20198237),
    ("bowman-field", "Bowman Field", "airport", "w", 540099120),
    ("speed-art-museum", "Speed Art Museum", "museum", "w", 334900781),
    ("kentucky-expo-center", "Kentucky Exposition Center", "arena", "a", 9457601),
    ("colgate-clock", "Colgate Clock (Colgate Park, Clarksville)", "clock", "a", 723233202),
    ("locust-grove", "Locust Grove", "house", "w", 332558557),
    ("st-james-court-fountain", "St. James Court Fountain", "fountain", "w", 479561257),
    ("clark-memorial-bridge", "Clark Memorial (Second Street) Bridge", "bridge", "w", 655297050),
]
WANT = {(t, i) for _, _, _, t, i in SPEC}


class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.pts = {}

    def node(self, n):
        if ("n", n.id) in WANT:
            self.pts[("n", n.id)] = [(n.location.lon, n.location.lat)]

    def way(self, w):
        if ("w", w.id) in WANT:
            self.pts[("w", w.id)] = [(n.lon, n.lat) for n in w.nodes if n.location.valid()]

    def area(self, a):
        if ("a", a.id) in WANT:
            rings = [[(n.lon, n.lat) for n in o if n.location.valid()] for o in a.outer_rings()]
            self.pts[("a", a.id)] = rings


def main():
    h = H()
    for st in ("kentucky", "indiana"):
        h.apply_file(os.path.join(HERE, "data", "pbf", st + ".osm.pbf"), locations=True, idx="flex_mem")
    out = []
    for slug, name, kind, t, i in SPEC:
        g = h.pts.get((t, i))
        if not g:
            print("NOT FOUND", slug, t, i)
            continue
        rings = g if t == "a" else [g]
        shapes = [Polygon(r) for r in rings if len(r) >= 4] if (t == "a" or (len(g) > 3 and g[0] == g[-1])) else []
        if t == "a" or shapes and t == "w":
            lon, lat = (unary_union([s.buffer(0) for s in (shapes or [Polygon(r) for r in rings])]).centroid.coords[0])
        else:
            lon, lat = MultiPoint(g).centroid.coords[0]     # node, or an open way: mean of vertices
        x, y = proj_arr([lon], [lat])
        out.append({"id": slug, "name": name, "kind": kind, "x": round(float(x[0]), 1), "y": round(float(y[0]), 1)})
    out.sort(key=lambda e: e["name"].lower())
    os.makedirs(os.path.join(HERE, "docs", "art"), exist_ok=True)
    json.dump(out, open(os.path.join(HERE, "docs", "art", "landmarks.json"), "w"), indent=1)
    print(len(out), "landmarks")
    for e in out:
        print("%-52s %-10s %7.1f %7.1f" % (e["name"], e["kind"], e["x"], e["y"]))


if __name__ == "__main__":
    main()
