"""Export the map for the browser app in docs/:
   docs/tiles/<cx>_<cy>.bin   gzip text, one feature per line:
                             id \t layer \t x0 \t y0 \t x1 \t y1 \t <pdf path ops>
   docs/mapdata.js            layer styles + metadata
"""
import gzip, json, math, os, re, shutil
from reportlab.pdfgen import canvas
import render_map as m

WEB = os.path.join(m.HERE, "docs")
TILES = os.path.join(WEB, "tiles")
CELL, N = 540, 16
IMG = 5400


def main():
    feats = m.load()
    if os.path.isdir(TILES):
        shutil.rmtree(TILES)
    os.makedirs(TILES)

    names = [n for n, *_ in m.LAYERS]
    src_index = {}
    layers = []
    for name, kind, col, width, extra in m.LAYERS:
        src = m.ALIAS.get(name, name)
        src_index.setdefault(src, len(src_index))
        dash = re.search(r"\[([\d.]+)", extra)
        layers.append(dict(name=name, src=src_index[src], kind=kind, rgb=m.rgb(col), width=width,
                           butt=1 if "0 J" in extra else 0, dash=float(dash.group(1)) if dash else 0))

    cells = {}
    fid = 0
    for src, si in src_index.items():
        for bb, s in feats[src]:
            fid += 1
            x0, y0 = math.floor(bb[0]) - 4, math.floor(bb[1]) - 4
            x1, y1 = math.ceil(bb[2]) + 4, math.ceil(bb[3]) + 4
            line = "%d\t%d\t%d\t%d\t%d\t%d\t%s" % (fid, si, x0, y0, x1, y1, s)
            for cx in range(max(0, x0 // CELL), min(N - 1, x1 // CELL) + 1):
                for cy in range(max(0, y0 // CELL), min(N - 1, y1 // CELL) + 1):
                    cells.setdefault((cx, cy), []).append(line)
    total = 0
    for (cx, cy), lines in cells.items():
        raw = gzip.compress("".join(lines).encode("ascii"), 9, mtime=0)
        total += len(raw)
        with open(os.path.join(TILES, "%d_%d.bin" % (cx, cy)), "wb") as f:
            f.write(raw)
    print("tiles", len(cells), "features", fid, "%.1f MB" % (total / 1e6))

    gx, gy = m.proj([{"lat": m.CENTER[0], "lon": m.CENTER[1]}])[0]
    meta = dict(size=m.SIZE, cell=CELL, n=N, img=4600, features=fid, center=[round(gx, 1), round(gy, 1)],
                colors=m.C, tiles=sorted("%d_%d" % k for k in cells))
    with open(os.path.join(WEB, "mapdata.js"), "w") as f:
        f.write("window.MAPMETA=" + json.dumps(meta) + ";\nwindow.LAYERS=" + json.dumps(layers) + ";\n")

    # preview-<style>.jpg files are rasterized from the web app's own single-sheet PDFs (see make_previews.py)


if __name__ == "__main__":
    main()
