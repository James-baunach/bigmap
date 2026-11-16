"""Build docs/hillshade.jpg: 4096x4096 greyscale shaded relief covering base square 0..8640 (north up).

Elevation: AWS Open Data "Terrain Tiles" (Mapzen Terrarium PNG), cached in data/terrain_src/.
Flat ground comes out ~250 (white); slopes darken, for use with a multiply blend.
Run:  python build_hillshade.py
"""
import math, os, time, urllib.request
import numpy as np
from PIL import Image
import fetch_osm

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "data", "terrain_src")
OUT = os.path.join(HERE, "docs", "hillshade.jpg")
PROOF = os.path.join(HERE, "data", "hillshade_proof.png")
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
Z = 13            # ~15 m/px on the ground here; z12 would be ~30 m
N = 4096
MARGIN = 6        # extra source pixels around the extent
# --- look ---
SMOOTH = 2.2      # gaussian sigma in output pixels (~33 m)
EXAG = 4.0        # vertical exaggeration
GAIN = 190.0      # grey levels per unit of illumination change
FLAT = 250.0      # grey level of flat ground
AZIMUTHS = [(315, .40), (270, .20), (360, .20), (225, .10), (45, .10)]   # (compass azimuth, weight)
ZENITH = math.radians(45)


def fetch(x, y):
    p = os.path.join(SRC, f"z{Z}_{x}_{y}.png")
    if not os.path.exists(p):
        req = urllib.request.Request(URL.format(z=Z, x=x, y=y), headers={"User-Agent": "map-builder"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = r.read()
                break
            except Exception as e:
                print("retry", x, y, e)
                time.sleep(2)
        else:
            raise RuntimeError(f"tile {x},{y} failed")
        open(p, "wb").write(data)
        time.sleep(0.15)
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)


def blur(a, sigma):
    r = int(sigma * 4)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(a, r, mode="edge")
    p = sum(k[i] * p[i:i + a.shape[0], :] for i in range(2 * r + 1))
    p = sum(k[i] * p[:, i:i + a.shape[1]] for i in range(2 * r + 1))
    return p


def main():
    os.makedirs(SRC, exist_ok=True)
    x0, y0, x1, y1 = fetch_osm.extent()
    W = 20037508.342789244
    n = 2 ** Z
    def px(xm): return (xm + W) / (2 * W) * n * 256
    def py(ym): return (W - ym) / (2 * W) * n * 256
    L, R_ = px(x0) - MARGIN, px(x1) + MARGIN
    T, B = py(y1) - MARGIN, py(y0) + MARGIN
    tx0, tx1, ty0, ty1 = int(L // 256), int(R_ // 256), int(T // 256), int(B // 256)
    print("tiles", (tx1 - tx0 + 1) * (ty1 - ty0 + 1))
    mos = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            t = fetch(tx, ty)
            mos[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = \
                t[..., 0] * 256 + t[..., 1] + t[..., 2] / 256 - 32768
    print("elevation range m", mos.min(), mos.max())
    # resample to N x N covering exactly the extent (plus a margin of MARGIN*N/size px for gradients)
    scale = N / (px(x1) - px(x0))
    m = int(round(MARGIN * scale))
    box = (px(x0) - MARGIN - tx0 * 256, py(y1) - MARGIN - ty0 * 256,
           px(x1) + MARGIN - tx0 * 256, py(y0) + MARGIN - ty0 * 256)
    im = Image.fromarray(mos, "F").resize((N + 2 * m, N + 2 * m), Image.BICUBIC, box=box)
    z = blur(np.asarray(im, np.float32), SMOOTH)
    # ground size of one output pixel (metres), per row, mercator scale corrected by cos(lat)
    ymerc = y1 - (np.arange(N + 2 * m) - m + 0.5) * (y1 - y0) / N
    lat = 2 * np.arctan(np.exp(ymerc / fetch_osm.R)) - math.pi / 2
    cell = ((x1 - x0) / N * np.cos(lat))[:, None]
    gy, gx = np.gradient(z)
    dzdx, dzdy = gx / cell * EXAG, -gy / cell * EXAG      # dzdy: positive = rising to the north
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(-dzdx, -dzdy)                     # compass direction the slope faces (downhill)
    shade = 0
    for az, w in AZIMUTHS:
        I = math.cos(ZENITH) * np.cos(slope) + math.sin(ZENITH) * np.sin(slope) * np.cos(math.radians(az) - aspect)
        shade = shade + w * I
    flat = math.cos(ZENITH)
    g = FLAT + GAIN * (shade - flat * sum(w for _, w in AZIMUTHS))
    g = g[m:m + N, m:m + N]
    rng = np.random.default_rng(1)
    g = g + rng.random(g.shape) - rng.random(g.shape)      # triangular dither against banding
    g8 = np.clip(np.round(g), 0, 255).astype(np.uint8)
    out = Image.fromarray(g8, "L")
    out.save(OUT, quality=80, optimize=True)
    out.resize((1024, 1024), Image.LANCZOS).save(PROOF)
    print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB; grey min/median/max", g8.min(), int(np.median(g8)), g8.max())
    # tile seam check: mean |difference| across tile boundaries vs. within, in raw elevation
    sx = np.abs(np.diff(mos, axis=1)).mean(axis=0)
    sy = np.abs(np.diff(mos, axis=0)).mean(axis=1)
    bx, by = sx[255::256], sy[255::256]
    print("seam check (mean |dz| m/px): boundaries x %.2f y %.2f vs overall x %.2f y %.2f; max boundary/overall %.2f"
          % (bx.mean(), by.mean(), sx.mean(), sy.mean(), max(bx.max() / sx.mean(), by.max() / sy.mean())))
    print("voids: min elevation", mos.min(), "count below 50 m:", int((mos < 50).sum()))


if __name__ == "__main__":
    main()
