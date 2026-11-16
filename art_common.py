"""Shared helpers for the build_art_*.py generators (tile writing, path parsing, elevation)."""
import gzip, math, os, re
import numpy as np
import fetch_osm
import render_map as m

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "docs", "art")
CELL, N, SIZE = 540, 16, 8640.0
_NUM = re.compile(r"[-\d.]+|[mlh]|f\*")


def parse_rings(s):
    """PDF path string ('x y m x y l ... h ... f*') -> list of rings [(x, y), ...]"""
    rings, cur, t = [], [], s.split()
    i = 0
    while i < len(t):
        if t[i] in ("m", "l", "h", "f*"):
            if t[i] in ("h", "f*") and cur:
                rings.append(cur)
                cur = []
            i += 1
            continue
        if i + 2 < len(t) + 0 and t[i + 2] in ("m", "l"):
            if t[i + 2] == "m" and cur:
                rings.append(cur)
                cur = []
            cur.append((float(t[i]), float(t[i + 1])))
            i += 3
        else:
            i += 1
    if cur:
        rings.append(cur)
    return [r for r in rings if len(r) >= 3]


def ring_path(coords):
    pts = list(coords)
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return "%.2f %.2f m " % pts[0] + " ".join("%.2f %.2f l" % p for p in pts[1:]) + " h"


def clean_dir(path, ext):
    os.makedirs(path, exist_ok=True)
    for f in os.listdir(path):
        if f.endswith(ext):
            os.remove(os.path.join(path, f))


def cells_of(x0, y0, x1, y1):
    for cx in range(max(0, int(x0 // CELL)), min(N - 1, int(x1 // CELL)) + 1):
        for cy in range(max(0, int(y0 // CELL)), min(N - 1, int(y1 // CELL)) + 1):
            yield cx, cy


def elevation(z=13):
    """Mosaic of elevation (metres) from data/terrain_src, resampled to a square grid over base 0..SIZE.
    Returns (array [row 0 = north], metres per pixel along x at the centre latitude, units per pixel)."""
    from PIL import Image
    src = os.path.join(HERE, "data", "terrain_src")
    x0, y0, x1, y1 = fetch_osm.extent()
    W = 20037508.342789244
    n = 2 ** z
    px = lambda xm: (xm + W) / (2 * W) * n * 256
    py = lambda ym: (W - ym) / (2 * W) * n * 256
    L, R_, T, B = px(x0), px(x1), py(y1), py(y0)
    tx0, tx1, ty0, ty1 = int(L // 256), int(R_ // 256), int(T // 256), int(B // 256)
    mos = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            t = np.asarray(Image.open(os.path.join(src, f"z{z}_{tx}_{ty}.png")).convert("RGB"), np.float32)
            mos[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = \
                t[..., 0] * 256 + t[..., 1] + t[..., 2] / 256 - 32768
    return mos, (L - tx0 * 256, T - ty0 * 256, R_ - tx0 * 256, B - ty0 * 256)
