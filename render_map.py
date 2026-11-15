"""Render the Louisville wall map (120 x 120 in) as vector PDF:
   - output/Louisville_Map_FullSheet_120x120in.pdf   (single sheet, for a print shop)
   - output/Louisville_Map_Tiled_Letter_192pages.pdf (16 x 12 letter pages with overlap)
   - output/Louisville_Map_Preview.png
"""
import glob, json, math, os, sys, time
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
import fetch_osm

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(HERE, "output")

SIZE = 8640.0                      # 120 in in points
MILE = 288.0                       # 1 in = 1/4 mile
X0, Y0, X1, Y1 = fetch_osm.extent()
S = SIZE / (X1 - X0)
R = fetch_osm.R
DEG = math.pi / 180

# tiling (US Letter portrait)
PW, PH = 612.0, 792.0
TW, TH = 540.0, 720.0              # map advance per page: 7.5 x 10 in
COLS, ROWS = 16, 12
INSET = 36.0                       # tile sits 0.5 in inside the paper edge
BLEED = 10.8                       # 0.15 in of extra map printed past each trim line

# ---------------------------------------------------------------- palette
C = dict(
    ink="#1B2733", ink2="#2E3A46", service="#6F7A83", trail="#9C7B52",
    motorway="#A8232C", water="#8FC3D8", stream="#5E9FBC",
    park="#C4E0B2", wood="#9CC58A", grass="#DDEBD1", golf="#B4D99E",
    cemetery="#C3D3B6", pitch="#86B974", wetland="#BFDCD3",
    building="#BDB1A2", rail="#5A4F47", runway="#8E9296", taxiway="#B4B7BA",
    apron="#E2DFD8", aerodrome="#F2F0EA", gold="#B58A2C",
)


def rgb(h):
    h = h.lstrip("#")
    return "%.3f %.3f %.3f" % tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


# layer name -> (kind, colour, width, extra ops)   drawn in this order
LAYERS = [
    ("aerodrome", "fill", C["aerodrome"], 0, ""),
    ("grass", "fill", C["grass"], 0, ""),
    ("park", "fill", C["park"], 0, ""),
    ("cemetery", "fill", C["cemetery"], 0, ""),
    ("golf", "fill", C["golf"], 0, ""),
    ("wood", "fill", C["wood"], 0, ""),
    ("wetland", "fill", C["wetland"], 0, ""),
    ("pitch", "fill", C["pitch"], 0, ""),
    ("ditch", "line", C["stream"], 0.3, ""),
    ("stream", "line", C["stream"], 0.6, ""),
    ("canal", "line", C["water"], 1.4, ""),
    ("river", "line", C["water"], 2.4, ""),
    ("water", "fill", C["water"], 0, ""),
    ("apron", "fill", C["apron"], 0, ""),
    ("taxiway", "line", C["taxiway"], 1.6, "0 J"),
    ("runway", "line", C["runway"], 7.0, "0 J"),
    ("building", "fill", C["building"], 0, ""),
    ("trail", "line", C["trail"], 0.35, ""),
    ("railminor", "line", C["rail"], 0.5, ""),
    ("rail", "line", C["rail"], 1.3, "0 J"),
    ("rail_tie", "line", "#FFFFFF", 0.6, "0 J [3.5 3.5] 0 d"),
    ("service", "line", C["service"], 0.4, ""),
    ("residential", "line", C["ink2"], 0.85, ""),
    ("link", "line", C["ink"], 1.0, ""),
    ("tertiary", "line", C["ink"], 1.4, ""),
    ("secondary", "line", C["ink"], 1.8, ""),
    ("primary", "line", C["ink"], 2.3, ""),
    ("trunk", "line", C["ink"], 2.8, ""),
    ("mlink_case", "line", "#FFFFFF", 2.6, ""),
    ("mlink", "line", C["motorway"], 1.6, ""),
    ("motorway_case", "line", "#FFFFFF", 4.8, ""),
    ("motorway", "line", C["motorway"], 3.4, ""),
]
ALIAS = {"rail_tie": "rail", "mlink_case": "mlink", "motorway_case": "motorway"}

HIGHWAY = {
    "motorway": "motorway", "motorway_link": "mlink", "trunk": "trunk", "trunk_link": "link",
    "primary": "primary", "primary_link": "link", "secondary": "secondary", "secondary_link": "link",
    "tertiary": "tertiary", "tertiary_link": "link", "residential": "residential",
    "unclassified": "residential", "living_street": "residential", "road": "residential",
    "service": "service", "pedestrian": "service", "raceway": "service",
    "footway": "trail", "path": "trail", "cycleway": "trail", "bridleway": "trail",
    "track": "trail", "steps": "trail",
}


def classify(t):
    """-> (layer, is_area) or None"""
    hw = t.get("highway")
    if hw:
        if t.get("area") == "yes":
            return None
        if hw in ("footway", "path", "steps") and t.get("footway") in ("sidewalk", "crossing"):
            return None
        L = HIGHWAY.get(hw)
        return (L, False) if L else None
    if "railway" in t:
        if t.get("tunnel") == "yes":
            return None
        return ("railminor" if t.get("service") in ("yard", "siding", "spur", "crossover") else "rail", False)
    aw = t.get("aeroway")
    if aw == "runway":
        return ("runway", False)
    if aw == "taxiway":
        return ("taxiway", False)
    if aw == "apron":
        return ("apron", True)
    if aw == "aerodrome":
        return ("aerodrome", True)
    nat, lu, le, ww = t.get("natural"), t.get("landuse"), t.get("leisure"), t.get("waterway")
    if nat == "water" or lu in ("reservoir", "basin") or ww in ("riverbank", "dock"):
        return ("water", True)
    if ww:
        if ww == "river":
            return ("river", False)
        if ww == "canal":
            return ("canal", False)
        if ww in ("stream", "tidal_channel"):
            return ("stream", False)
        if ww in ("ditch", "drain"):
            return ("ditch", False)
        return None
    if nat == "wetland":
        return ("wetland", True)
    if nat in ("wood", "scrub") or lu == "forest":
        return ("wood", True)
    if le in ("pitch", "track", "stadium"):
        return ("pitch", True) if le != "stadium" else None
    if le == "golf_course":
        return ("golf", True)
    if lu == "cemetery":
        return ("cemetery", True)
    if le in ("park", "nature_reserve", "garden", "playground", "recreation_ground", "dog_park") or lu in (
            "recreation_ground", "village_green"):
        return ("park", True)
    if lu in ("grass", "meadow", "orchard", "vineyard") or le == "sports_centre":
        return ("grass", True)
    return None


def proj(g):
    out = []
    for p in g:
        if p is None:
            continue
        x = (p["lon"] * DEG * R - X0) * S
        y = (math.log(math.tan(math.pi / 4 + p["lat"] * DEG / 2)) * R - Y0) * S
        out.append((x, y))
    return out


def thin(pts, tol=0.12):
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    for p in pts[1:-1]:
        q = out[-1]
        if abs(p[0] - q[0]) > tol or abs(p[1] - q[1]) > tol:
            out.append(p)
    out.append(pts[-1])
    return out


def stitch(ways):
    """join member ways into closed rings"""
    rings, open_ = [], []
    for w in ways:
        if len(w) < 2:
            continue
        if w[0] == w[-1]:
            rings.append(w)
        else:
            open_.append(list(w))
    while open_:
        cur = open_.pop()
        changed = True
        while changed and cur[0] != cur[-1]:
            changed = False
            for i, w in enumerate(open_):
                if w[0] == cur[-1]:
                    cur.extend(w[1:])
                elif w[-1] == cur[-1]:
                    cur.extend(w[-2::-1])
                elif w[-1] == cur[0]:
                    cur = w + cur[1:]
                elif w[0] == cur[0]:
                    cur = w[::-1] + cur[1:]
                else:
                    continue
                open_.pop(i)
                changed = True
                break
        if len(cur) >= 4:
            rings.append(cur)
    return rings


def pathstr(pts, close):
    s = ["%.2f %.2f m" % pts[0]]
    s.extend("%.2f %.2f l" % p for p in pts[1:])
    if close:
        s.append("h")
    return " ".join(s)


def load():
    feats = {name: [] for name, *_ in LAYERS if name not in ALIAS}
    seen = set()
    files = sorted(glob.glob(os.path.join(DATA, "main_*.json"))) + sorted(glob.glob(os.path.join(DATA, "bldg_*.json")))
    for fn in files:
        is_b = os.path.basename(fn).startswith("bldg")
        with open(fn, "rb") as f:
            els = json.load(f)["elements"]
        for e in els:
            key = (e["type"], e["id"])
            if key in seen:
                continue
            seen.add(key)
            if is_b:
                cls = ("building", True)
            else:
                t = e.get("tags") or {}
                if e["type"] == "relation" and t.get("type") != "multipolygon":
                    continue
                cls = classify(t)
            if not cls:
                continue
            layer, area = cls
            if e["type"] == "way":
                pts = proj(e.get("geometry") or [])
                if len(pts) < 2:
                    continue
                parts = [pts]
            elif e["type"] == "relation":
                if not area:
                    continue
                parts = stitch([proj(m["geometry"]) for m in e.get("members", [])
                                if m.get("type") == "way" and m.get("geometry")])
                if not parts:
                    continue
            else:
                continue
            xs = [p[0] for part in parts for p in part]
            ys = [p[1] for part in parts for p in part]
            bb = (min(xs), min(ys), max(xs), max(ys))
            if bb[2] < -5 or bb[3] < -5 or bb[0] > SIZE + 5 or bb[1] > SIZE + 5:
                continue
            if area:
                if any(len(p) < 3 for p in parts):
                    parts = [p for p in parts if len(p) >= 3]
                    if not parts:
                        continue
                tol = 0.03 if layer == "building" else 0.12
                s = " ".join(pathstr(thin(p, tol), True) for p in parts) + " f*\n"
            else:
                s = pathstr(thin(parts[0]), False) + "\n"
            feats[layer].append((bb, s))
    return feats


# ---------------------------------------------------------------- overlay
def fleur(c, cx, cy, h, angle=0, fill=None):
    """fleur-de-lis, total height ~1.8*h, centred on (cx, cy)"""
    c.saveState()
    c.translate(cx, cy)
    c.rotate(angle)
    c.scale(h, h)
    if fill is not None:
        c.setFillColor(fill)
    for sx in (1, -1):
        p = c.beginPath()
        p.moveTo(sx * 0.10, -0.10)
        p.curveTo(sx * 0.15, 0.12, sx * 0.30, 0.44, sx * 0.53, 0.46)
        p.curveTo(sx * 0.74, 0.48, sx * 0.86, 0.28, sx * 0.80, 0.10)
        p.curveTo(sx * 0.76, -0.02, sx * 0.63, -0.08, sx * 0.54, -0.02)
        p.curveTo(sx * 0.62, 0.02, sx * 0.66, 0.14, sx * 0.59, 0.21)
        p.curveTo(sx * 0.50, 0.29, sx * 0.40, 0.20, sx * 0.35, 0.08)
        p.curveTo(sx * 0.32, 0.00, sx * 0.30, -0.05, sx * 0.29, -0.10)
        p.close()
        c.drawPath(p, stroke=0, fill=1)
        p = c.beginPath()
        p.moveTo(sx * 0.11, -0.26)
        p.lineTo(sx * 0.29, -0.26)
        p.curveTo(sx * 0.31, -0.36, sx * 0.38, -0.44, sx * 0.50, -0.47)
        p.curveTo(sx * 0.36, -0.54, sx * 0.19, -0.48, sx * 0.11, -0.26)
        p.close()
        c.drawPath(p, stroke=0, fill=1)
    p = c.beginPath()
    p.moveTo(0, 1.0)
    p.curveTo(0.10, 0.82, 0.27, 0.58, 0.25, 0.32)
    p.curveTo(0.23, 0.12, 0.12, 0.00, 0.07, -0.10)
    p.lineTo(-0.07, -0.10)
    p.curveTo(-0.12, 0.00, -0.23, 0.12, -0.25, 0.32)
    p.curveTo(-0.27, 0.58, -0.10, 0.82, 0, 1.0)
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    p = c.beginPath()
    p.moveTo(-0.07, -0.26)
    p.lineTo(0.07, -0.26)
    p.curveTo(0.10, -0.42, 0.06, -0.62, 0, -0.80)
    p.curveTo(-0.06, -0.62, -0.10, -0.42, -0.07, -0.26)
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    c.roundRect(-0.34, -0.245, 0.68, 0.13, 0.05, stroke=0, fill=1)
    c.restoreState()


def compass(c, cx, cy, r):
    ink, gold = HexColor(C["ink"]), HexColor(C["gold"])
    c.saveState()
    c.setFillColor(Color(1, 1, 1, alpha=0.88))
    c.circle(cx, cy, r * 1.34, stroke=0, fill=1)
    c.setStrokeColor(ink)
    c.setLineWidth(r * 0.012)
    c.circle(cx, cy, r * 1.30, stroke=1, fill=0)
    c.setLineWidth(r * 0.004)
    c.circle(cx, cy, r * 1.26, stroke=1, fill=0)
    c.circle(cx, cy, r * 0.80, stroke=1, fill=0)
    c.setStrokeColor(gold)
    c.setLineWidth(r * 0.01)
    c.circle(cx, cy, r * 0.84, stroke=1, fill=0)
    # degree ticks
    c.setStrokeColor(ink)
    for d in range(0, 360, 5):
        a = math.radians(d)
        r0 = r * (0.86 if d % 15 else 0.84)
        r1 = r * (0.90 if d % 15 else 0.94)
        c.setLineWidth(r * (0.003 if d % 15 else 0.007))
        c.line(cx + r0 * math.sin(a), cy + r0 * math.cos(a), cx + r1 * math.sin(a), cy + r1 * math.cos(a))

    def star(n, off, length, half, dark, light):
        for i in range(n):
            a = math.radians(off + i * 360 / n)
            tip = (cx + length * math.sin(a), cy + length * math.cos(a))
            for sgn, col in ((1, dark), (-1, light)):
                b = a + sgn * math.pi / 2
                base = (cx + half * math.sin(a + sgn * math.pi / n * 1.0), cy + half * math.cos(a + sgn * math.pi / n * 1.0))
                p = c.beginPath()
                p.moveTo(cx, cy)
                p.lineTo(*base)
                p.lineTo(*tip)
                p.close()
                c.setFillColor(col)
                c.setStrokeColor(ink)
                c.setLineWidth(r * 0.004)
                c.drawPath(p, stroke=1, fill=1)

    white = HexColor("#FFFFFF")
    star(8, 22.5, r * 0.56, r * 0.10, gold, white)
    star(4, 45, r * 0.78, r * 0.16, HexColor(C["motorway"]), white)
    star(4, 0, r * 1.08, r * 0.20, ink, white)
    c.setFillColor(white)
    c.setStrokeColor(ink)
    c.setLineWidth(r * 0.008)
    c.circle(cx, cy, r * 0.07, stroke=1, fill=1)
    c.setFillColor(gold)
    c.circle(cx, cy, r * 0.03, stroke=0, fill=1)
    # north marker
    c.setFillColor(Color(1, 1, 1, alpha=0.92))
    c.circle(cx, cy + r * 1.30, r * 0.22, stroke=0, fill=1)
    c.setStrokeColor(ink)
    c.setLineWidth(r * 0.006)
    c.circle(cx, cy + r * 1.30, r * 0.22, stroke=1, fill=0)
    fleur(c, cx, cy + r * 1.285, r * 0.15, 0, HexColor(C["motorway"]))
    c.restoreState()


CENTER = (38.2570, -85.7560)       # downtown Louisville riverfront


def overlay(c):
    ink, gold = HexColor(C["ink"]), HexColor(C["gold"])
    gx, gy = proj([{"lat": CENTER[0], "lon": CENTER[1]}])[0]
    c.saveState()
    c.setLineCap(0)
    # distance rings: one per mile from downtown, heavier every 5 miles
    far = max(math.hypot(gx - x, gy - y) for x in (0, SIZE) for y in (0, SIZE))
    c.setStrokeColor(Color(gold.red, gold.green, gold.blue, alpha=0.85))
    n = 1
    while n * MILE < far:
        five = n % 5 == 0
        c.setLineWidth(1.5 if five else 0.45)
        c.setDash([] if five else [1.2, 2.4])
        c.circle(gx, gy, n * MILE, stroke=1, fill=0)
        n += 1
    # compass rays from downtown
    c.setDash([6, 3, 1, 3])
    for i in range(16):
        a = math.radians(i * 22.5)
        c.setLineWidth(0.7 if i % 4 == 0 else 0.35)
        c.line(gx + MILE * math.sin(a), gy + MILE * math.cos(a), gx + far * math.sin(a), gy + far * math.cos(a))
    c.setDash([])
    # downtown marker
    c.setFillColor(HexColor("#FFFFFF"))
    c.setStrokeColor(gold)
    c.setLineWidth(1.2)
    c.circle(gx, gy, 15, stroke=1, fill=1)
    fleur(c, gx, gy - 1, 10.5, 0, gold)
    c.restoreState()

    compass(c, 108 + 640, 108 + 610, 400)

    # ---- border frame
    c.saveState()
    B = 108.0
    c.setFillColor(HexColor("#FFFFFF"))
    for x, y, w, h in ((0, 0, SIZE, B), (0, SIZE - B, SIZE, B), (0, 0, B, SIZE), (SIZE - B, 0, B, SIZE)):
        c.rect(x, y, w, h, stroke=0, fill=1)
    c.setStrokeColor(ink)
    c.setLineJoin(0)
    c.setLineWidth(7)
    c.rect(26, 26, SIZE - 52, SIZE - 52, stroke=1, fill=0)
    c.setLineWidth(2)
    c.rect(B, B, SIZE - 2 * B, SIZE - 2 * B, stroke=1, fill=0)
    c.setStrokeColor(gold)
    c.setLineWidth(1.6)
    c.rect(82, 82, SIZE - 164, SIZE - 164, stroke=1, fill=0)
    # checkered half-mile scale band
    a, b = 42.0, 60.0
    c.setFillColor(ink)
    k = 0
    x = 0.0
    while x < SIZE:
        xa, xb = max(x, B), min(x + 144, SIZE - B)
        if xb > xa and k % 2 == 0:
            for (rx, ry, rw, rh) in ((xa, a, xb - xa, b - a), (xa, SIZE - b, xb - xa, b - a),
                                     (a, xa, b - a, xb - xa), (SIZE - b, xa, b - a, xb - xa)):
                c.rect(rx, ry, rw, rh, stroke=0, fill=1)
        x += 144
        k += 1
    c.setStrokeColor(ink)
    c.setLineWidth(0.8)
    for (rx, ry, rw, rh) in ((B, a, SIZE - 2 * B, b - a), (B, SIZE - b, SIZE - 2 * B, b - a),
                             (a, B, b - a, SIZE - 2 * B), (SIZE - b, B, b - a, SIZE - 2 * B)):
        c.rect(rx, ry, rw, rh, stroke=1, fill=0)
    # corner ornaments
    for (cx, cy, ang) in ((62, 62, 135), (SIZE - 62, 62, -135), (62, SIZE - 62, 45), (SIZE - 62, SIZE - 62, -45)):
        c.setFillColor(HexColor("#FFFFFF"))
        c.setStrokeColor(gold)
        c.setLineWidth(1.6)
        c.circle(cx, cy, 30, stroke=1, fill=1)
        fleur(c, cx, cy, 19, ang, HexColor(C["motorway"]))
    c.restoreState()


# ---------------------------------------------------------------- drawing
def draw_layers(c, get):
    code = c._code
    code.append("1 J 1 j")
    for name, kind, col, width, extra in LAYERS:
        items = get(ALIAS.get(name, name))
        if not items:
            continue
        code.append("q")
        if extra:
            code.append(extra)
        if kind == "fill":
            code.append(rgb(col) + " rg")
            code.append("".join(items))
        else:
            code.append(rgb(col) + " RG %.2f w" % width)
            for i in range(0, len(items), 150):
                code.append("".join(items[i:i + 150]) + "S")
        code.append("Q")


def page_label(r, c_):
    return "%s%d" % ("ABCDEFGHIJKL"[r], c_ + 1)


def main():
    t0 = time.time()
    feats = load()
    print("loaded", {k: len(v) for k, v in feats.items()}, "%.0fs" % (time.time() - t0), flush=True)
    os.makedirs(OUT, exist_ok=True)

    # ---------- full sheet
    full = os.path.join(OUT, "Louisville_Map_FullSheet_120x120in.pdf")
    c = canvas.Canvas(full, pagesize=(SIZE, SIZE), pageCompression=1)
    c.setTitle("Louisville wall map 120 x 120 in")
    cache = {k: [s for _, s in v] for k, v in feats.items()}
    draw_layers(c, lambda k: cache[k])
    overlay(c)
    c.showPage()
    c.save()
    print("full sheet done %.0fs" % (time.time() - t0), flush=True)

    # ---------- preview png + thumbnail for the guide
    import pymupdf
    doc = pymupdf.open(full)
    pix = doc[0].get_pixmap(matrix=pymupdf.Matrix(0.5, 0.5), alpha=False)
    prev = os.path.join(OUT, "Louisville_Map_Preview.png")
    pix.save(prev)
    thumb = os.path.join(DATA, "thumb.png")
    doc[0].get_pixmap(matrix=pymupdf.Matrix(0.14, 0.14), alpha=False).save(thumb)
    doc.close()
    print("preview done %.0fs" % (time.time() - t0), flush=True)

    # ---------- spatial index for tiles
    grid = {}
    pad = BLEED + 6
    for layer, items in feats.items():
        for bb, s in items:
            c0 = max(0, int((bb[0] - pad) // TW)); c1 = min(COLS - 1, int((bb[2] + pad) // TW))
            r0 = max(0, int((bb[1] - pad) // TH)); r1 = min(ROWS - 1, int((bb[3] + pad) // TH))
            for ci in range(c0, c1 + 1):
                for ri in range(r0, r1 + 1):
                    grid.setdefault((ri, ci, layer), []).append(s)

    tiled = os.path.join(OUT, "Louisville_Map_Tiled_Letter_192pages.pdf")
    c = canvas.Canvas(tiled, pagesize=(PW, PH), pageCompression=1)
    c.setTitle("Louisville wall map - 192 letter pages")
    guide(c, thumb)
    grey = HexColor("#555555")
    for r in range(ROWS):                # r = 0 is the top row (A)
        rb = ROWS - 1 - r                # row index from the bottom
        for ci in range(COLS):
            c.saveState()
            p = c.beginPath()
            # extra map past the trim line only where another page joins; never past the outer border
            cx0 = INSET - (BLEED if ci > 0 else 0)
            cx1 = INSET + TW + (BLEED if ci < COLS - 1 else 0)
            cy0 = INSET - (BLEED if rb > 0 else 0)
            cy1 = INSET + TH + (BLEED if rb < ROWS - 1 else 0)
            p.rect(cx0, cy0, cx1 - cx0, cy1 - cy0)
            c.clipPath(p, stroke=0, fill=0)
            c.translate(INSET - ci * TW, INSET - rb * TH)
            draw_layers(c, lambda k: grid.get((rb, ci, k)))
            overlay(c)
            c.restoreState()
            # trim marks in the margin + page id
            c.setStrokeColor(grey)
            c.setLineWidth(0.4)
            for x, inner in ((INSET, ci > 0), (INSET + TW, ci < COLS - 1)):
                if inner:
                    c.line(x, 14, x, INSET - BLEED - 2)
                    c.line(x, PH - 14, x, PH - INSET + BLEED + 2)
            for y, inner in ((INSET, rb > 0), (INSET + TH, rb < ROWS - 1)):
                if inner:
                    c.line(14, y, INSET - BLEED - 2, y)
                    c.line(PW - 14, y, PW - INSET + BLEED + 2, y)
            c.setFillColor(grey)
            c.setFont("Helvetica", 5.5)
            lab = page_label(r, ci)
            c.drawString(INSET + 6, 16.5, "%s   row %s of L, column %d of 16" % (lab, lab[0], ci + 1))
            c.drawRightString(INSET + TW - 6, 16.5, lab)
            c.showPage()
        print("row", r + 1, "of", ROWS, "%.0fs" % (time.time() - t0), flush=True)
    c.save()
    print("tiled done %.0fs" % (time.time() - t0), flush=True)


def guide(c, thumb):
    ink = HexColor(C["ink"])
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(54, 730, "Louisville Wall Map: Assembly Guide")
    c.setFont("Helvetica", 10)
    lines = [
        "Finished size 10 ft x 10 ft (120 x 120 in).  Scale: 1 inch = 1/4 mile (1:15,840).",
        "192 letter pages: 12 rows (A at the top to L at the bottom) x 16 columns (1 at the left to 16 at the right).",
        "",
        "1.  Print pages 2 to 193 at ACTUAL SIZE / 100% (turn off \"Fit to page\" and \"Shrink oversized pages\").",
        "2.  Each page is labeled in its bottom margin (A1 ... L16). The labels are trimmed or covered; the map has none.",
        "3.  Each page carries 7.5 x 10 in of map. Where another page joins, 0.15 in of extra map prints past the",
        "     trim marks. Nothing prints past the outer border, so the outside edges never need trimming.",
        "4.  Trim the LEFT edge of every page except column 1, and the TOP edge of every page except row A,",
        "     along the trim marks. Leave the right and bottom edges untrimmed.",
        "5.  Work left to right, top to bottom. Lay each trimmed edge over the untrimmed edge of its neighbor,",
        "     line up the roads and trim marks, and fix with glue stick or tape on the back.",
        "6.  Tip: build one row at a time as a strip, then join the 12 strips. Check the first two pages measure",
        "     7.5 in between trim marks before printing the rest.",
    ]
    y = 706
    for ln in lines:
        c.drawString(54, y, ln)
        y -= 14.5
    # grid diagram
    gw = 504.0
    gh = gw
    gx, gy = 54, 30
    c.drawImage(thumb, gx, gy, gw, gh)
    c.setStrokeColor(HexColor("#000000"))
    c.setLineWidth(0.4)
    cw, rh = gw / COLS, gh / ROWS
    for i in range(COLS + 1):
        c.line(gx + i * cw, gy, gx + i * cw, gy + gh)
    for j in range(ROWS + 1):
        c.line(gx, gy + j * rh, gx + gw, gy + j * rh)
    c.setFont("Helvetica-Bold", 7)
    for r in range(ROWS):
        for ci in range(COLS):
            lab = page_label(r, ci)
            tx, ty = gx + ci * cw + cw / 2, gy + gh - (r + 0.5) * rh - 2.5
            w = c.stringWidth(lab, "Helvetica-Bold", 7)
            c.setFillColor(Color(1, 1, 1, alpha=0.8))
            c.rect(tx - w / 2 - 1.5, ty - 1.5, w + 3, 8, stroke=0, fill=1)
            c.setFillColor(ink)
            c.drawCentredString(tx, ty, lab)
    c.showPage()


if __name__ == "__main__":
    main()
