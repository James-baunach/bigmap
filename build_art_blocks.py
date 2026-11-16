"""Build docs/art/blocks/<cx>_<cy>.bin: neighbouring buildings merged into soft 'mass' polygons (layer 0).
Seam-free: buildings are grouped into connected components (buffered footprints that touch), and each
component is unioned whole, so no mass is ever cut at a chunk border.
Run:  python build_art_blocks.py
"""
import gzip, os, time
import numpy as np
import shapely
from shapely import STRtree
from shapely.geometry import Polygon
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
import render_map as m
from art_common import *

OUT = os.path.join(ART, "blocks")
GROW, SHRINK, SIMP, MIN_AREA, MIN_HOLE = 1.3, 0.9, 0.5, 5.0, 30.0


def to_poly(rings):
    p = None
    for r in rings:
        q = Polygon(r)
        if not q.is_valid:
            q = q.buffer(0)
        p = q if p is None else p.symmetric_difference(q)   # even-odd, like f*
    return p


def main():
    t0 = time.time()
    feats = m.load()["building"]
    print(len(feats), "buildings loaded %.0fs" % (time.time() - t0), flush=True)
    polys = []
    for bb, s in feats:
        p = to_poly(parse_rings(s))
        if p is not None and not p.is_empty:
            polys.append(p)
    del feats
    geoms = np.array(polys, dtype=object)
    print(len(geoms), "polygons %.0fs" % (time.time() - t0), flush=True)
    buf = shapely.buffer(geoms, GROW, quad_segs=3)
    tree = STRtree(buf)
    a, b = tree.query(buf, predicate="intersects")
    n = len(buf)
    _, lab = connected_components(coo_matrix((np.ones(len(a), np.int8), (a, b)), shape=(n, n)), directed=False)
    print("components", lab.max() + 1, "largest", np.bincount(lab).max(), "%.0fs" % (time.time() - t0), flush=True)
    order = np.argsort(lab, kind="stable")
    cuts = np.flatnonzero(np.diff(lab[order])) + 1
    cells, fid = {}, 0
    for grp in np.split(order, cuts):
        u = shapely.union_all(buf[grp]) if len(grp) > 1 else buf[grp[0]]
        u = u.buffer(-SHRINK, quad_segs=3).simplify(SIMP)
        for p in (u.geoms if hasattr(u, "geoms") else [u]):
            if p.is_empty or p.area < MIN_AREA:
                continue
            holes = [h for h in p.interiors if Polygon(h).area > MIN_HOLE]
            rings = [p.exterior] + holes
            fid += 1
            x0, y0, x1, y1 = p.bounds
            x0, y0, x1, y1 = int(x0) - 4, int(y0) - 4, int(np.ceil(x1)) + 4, int(np.ceil(y1)) + 4
            line = "%d\t0\t%d\t%d\t%d\t%d\t%s f*\n" % (fid, x0, y0, x1, y1, " ".join(ring_path(r.coords) for r in rings))
            for c in cells_of(x0, y0, x1, y1):
                cells.setdefault(c, []).append(line)
    clean_dir(OUT, ".bin")
    total = 0
    for (cx, cy), lines in cells.items():
        raw = gzip.compress("".join(lines).encode("ascii"), 9, mtime=0)
        total += len(raw)
        open(os.path.join(OUT, "%d_%d.bin" % (cx, cy)), "wb").write(raw)
    print("tiles", len(cells), "polygons (max id)", fid, "%.2f MB" % (total / 1e6), "%.0fs" % (time.time() - t0))


if __name__ == "__main__":
    main()
