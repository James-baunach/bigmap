"""Download OpenStreetMap data for the Louisville map extent (tiled, cached)."""
import json, math, os, sys, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

# Map extent: 30 x 30 miles (1 inch = 1/4 mile on a 120 in sheet)
LAT0, LON0 = 38.185, -85.675
R = 6378137.0
HALF_M = 15 * 1609.344  # 15 miles each side of centre


def extent():
    k = 1 / math.cos(math.radians(LAT0))  # mercator stretch at centre
    x0 = math.radians(LON0) * R
    y0 = math.log(math.tan(math.pi / 4 + math.radians(LAT0) / 2)) * R
    h = HALF_M * k
    return x0 - h, y0 - h, x0 + h, y0 + h


def inv(x, y):
    return math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2), math.degrees(x / R)


ENDPOINTS = [
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]

MAIN = """[out:json][timeout:240][maxsize:900000000];
(
  way["highway"]({b});
  way["railway"~"^(rail|light_rail|tram)$"]({b});
  way["waterway"]({b});
  relation["waterway"]({b});
  way["natural"~"^(water|wood|scrub|wetland)$"]({b});
  relation["natural"~"^(water|wood|scrub|wetland)$"]({b});
  way["leisure"~"^(park|nature_reserve|golf_course|garden|pitch|track|playground|recreation_ground|dog_park|sports_centre|stadium)$"]({b});
  relation["leisure"~"^(park|nature_reserve|golf_course|garden|pitch|recreation_ground)$"]({b});
  way["landuse"~"^(forest|cemetery|grass|meadow|recreation_ground|reservoir|basin|village_green|orchard|vineyard)$"]({b});
  relation["landuse"~"^(forest|cemetery|grass|meadow|recreation_ground|reservoir|basin)$"]({b});
  way["aeroway"~"^(runway|taxiway|apron|aerodrome)$"]({b});
  relation["aeroway"="aerodrome"]({b});
);
out geom qt;
"""

BLDG = """[out:json][timeout:240][maxsize:900000000];
(
  way["building"]({b});
  relation["building"]({b});
);
out skel geom qt;
"""


def fetch(query, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 100:
        return
    body = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(12):
        url = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "wall-map-renderer/1.0"})
            with urllib.request.urlopen(req, timeout=900) as r:
                raw = r.read()
            j = json.loads(raw)
            if "elements" not in j or (j.get("remark") and "error" in j["remark"]):
                raise RuntimeError(j.get("remark", "no elements"))
            with open(dest + ".tmp", "wb") as f:
                f.write(raw)
            os.replace(dest + ".tmp", dest)
            print("ok", os.path.basename(dest), len(j["elements"]), "elements", len(raw) // 1024, "KB", flush=True)
            return
        except Exception as e:
            print("retry", os.path.basename(dest), url.split("/")[2], repr(e)[:120], flush=True)
            time.sleep(10 + 10 * attempt)
    raise SystemExit("failed " + dest)


def main():
    x0, y0, x1, y1 = extent()
    pad = 400
    for name, q, n in (("main", MAIN, 4), ("bldg", BLDG, 6)):
        for i in range(n):
            for j in range(n):
                ax = x0 - pad + (x1 - x0 + 2 * pad) * i / n
                bx = x0 - pad + (x1 - x0 + 2 * pad) * (i + 1) / n
                ay = y0 - pad + (y1 - y0 + 2 * pad) * j / n
                by = y0 - pad + (y1 - y0 + 2 * pad) * (j + 1) / n
                s, w = inv(ax, ay)
                nn, e = inv(bx, by)
                b = f"{s:.5f},{w:.5f},{nn:.5f},{e:.5f}"
                fetch(q.format(b=b), os.path.join(DATA, f"{name}_{i}_{j}.json"))
                time.sleep(2)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
