"""Build docs/art/hachures/<cx>_<cy>.bin: short strokes drawn down the slope (old-map hill hachures).
Format per cell: gzip JSON flat array [x1,y1,x2,y2, ...] (1 decimal), base coordinates. A stroke belongs to the
cell containing its centre (it may overhang the cell edge by up to ~4.5 units).
Elevation: AWS Terrain Tiles (Terrarium) cached in data/terrain_src/ by build_hillshade.py.
Run:  python build_art_hachures.py
"""
import gzip, json, math, os
import numpy as np
import fetch_osm
from art_common import *
from build_hillshade import blur

SPACING, JITTER = 6.5, 0.45          # sample grid spacing (units) and jitter as a fraction of it
SMOOTH_PX = 1.2                      # light smoothing of the ~15 m elevation pixels
T0, T1 = 0.13, 0.36                 # slope (rise/run) where strokes start / reach full length
LEN0, LEN1 = 3.0, 9.0                # stroke length at T0 / T1 (units)
SEED = 7


def main():
    mos, (L, T, R_, B) = elevation()
    z = blur(mos, SMOOTH_PX)
    x0, y0, x1, y1 = fetch_osm.extent()
    m_per_px = (x1 - x0) / (R_ - L) * math.cos(math.radians(fetch_osm.LAT0))
    gy, gx = np.gradient(z, m_per_px)
    dx, dy = gx, -gy                                  # rise per metre toward east / north
    slope = np.hypot(dx, dy)
    n = int(SIZE / SPACING)
    rng = np.random.default_rng(SEED)
    gi, gj = np.meshgrid(np.arange(n), np.arange(n))
    x = (gi + 0.5 + (rng.random(gi.shape) - 0.5) * 2 * JITTER) * SPACING
    y = (gj + 0.5 + (rng.random(gi.shape) - 0.5) * 2 * JITTER) * SPACING
    u = L + x / SIZE * (R_ - L)
    v = B - y / SIZE * (B - T)                        # mosaic row (north = small)

    def samp(a):                                      # bilinear lookup
        i0, j0 = np.clip(np.floor(v).astype(int), 0, a.shape[0] - 2), np.clip(np.floor(u).astype(int), 0, a.shape[1] - 2)
        fy, fx = v - i0, u - j0
        return (a[i0, j0] * (1 - fx) * (1 - fy) + a[i0, j0 + 1] * fx * (1 - fy)
                + a[i0 + 1, j0] * (1 - fx) * fy + a[i0 + 1, j0 + 1] * fx * fy)
    s, sx, sy = samp(slope), samp(dx), samp(dy)
    ok = s > T0
    x, y, s, sx, sy = x[ok], y[ok], s[ok], sx[ok], sy[ok]
    L_ = LEN0 + (LEN1 - LEN0) * np.clip((s - T0) / (T1 - T0), 0, 1)
    ux, uy = -sx / s, -sy / s                         # downhill unit vector
    h = L_ / 2
    seg = np.stack([x - ux * h, y - uy * h, x + ux * h, y + uy * h], 1)
    seg = np.round(seg, 1)
    cx, cy = np.clip((x // CELL).astype(int), 0, N - 1), np.clip((y // CELL).astype(int), 0, N - 1)
    clean_dir(os.path.join(ART, "hachures"), ".bin")
    total = 0
    for c in np.unique(cx * N + cy):
        sel = (cx * N + cy) == c
        raw = gzip.compress(json.dumps(seg[sel].ravel().tolist(), separators=(",", ":")).encode(), 9, mtime=0)
        open(os.path.join(ART, "hachures", "%d_%d.bin" % divmod(int(c), N)), "wb").write(raw)
        total += len(raw)
    print("samples", n * n, "strokes", len(x), "(%.1f%%)" % (100 * len(x) / (n * n)), "%.2f MB" % (total / 1e6),
          "slope percentiles 50/90/99:", np.percentile(slope, [50, 90, 99]).round(3))


if __name__ == "__main__":
    main()
