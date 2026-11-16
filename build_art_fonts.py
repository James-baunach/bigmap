"""Build docs/fonts/: two static TrueType (glyf) fonts subset to Latin-1/WinAnsi, with licence + PDF metrics JSON.
Sources (SIL OFL 1.1, google/fonts repo, downloaded into data/fonts_src/<name>/ first):
  patrickhand/PatrickHand-Regular.ttf   friendly hand lettering
  imfellenglish/IMFeENrm28P.ttf         IM Fell English (antique engraving type)
Run:  python build_art_fonts.py
"""
import io, json, os, shutil, urllib.request
from fontTools.ttLib import TTFont
from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "data", "fonts_src")
OUT = os.path.join(HERE, "docs", "fonts")
RAW = "https://raw.githubusercontent.com/google/fonts/main/ofl/"
FONTS = [  # out name, source folder, google/fonts folder, file, family, flags, stemV
    ("patrickhand", "patrickhand", "patrickhand", "PatrickHand-Regular.ttf", "Patrick Hand", 32, 72),
    ("imfell", "imfell", "imfellenglish", "IMFeENrm28P.ttf", "IM Fell English", 34, 84),   # 34 = nonsymbolic + serif
]


def fetch(folder, gf, file):
    d = os.path.join(SRC, folder)
    os.makedirs(d, exist_ok=True)
    for f in (file, "OFL.txt"):
        p = os.path.join(d, f)
        if not os.path.exists(p):
            req = urllib.request.Request(RAW + gf + "/" + f, headers={"User-Agent": "map-builder"})
            open(p, "wb").write(urllib.request.urlopen(req, timeout=60).read())
    return d


def main():
    os.makedirs(OUT, exist_ok=True)
    codes = {}
    for c in range(32, 256):
        try:
            codes[c] = ord(bytes([c]).decode("cp1252"))
        except UnicodeDecodeError:
            pass
    for name, folder, gf, file, family, flags, stemv in FONTS:
        d = fetch(folder, gf, file)
        font = TTFont(os.path.join(d, file))
        assert "glyf" in font and "CFF " not in font and "fvar" not in font, "need static glyf font"
        opt = subset.Options()
        opt.layout_features = ["kern"]
        opt.hinting = False
        opt.name_IDs = [0, 1, 2, 3, 4, 5, 6]
        opt.notdef_outline = True
        opt.glyph_names = False
        opt.drop_tables += ["DSIG"]
        s = subset.Subsetter(opt)
        s.populate(unicodes=sorted(set(codes.values())))
        s.subset(font)
        ttf = os.path.join(OUT, name + ".ttf")
        font.save(ttf)
        shutil.copy(os.path.join(d, "OFL.txt"), os.path.join(OUT, name + "-OFL.txt"))

        f = TTFont(ttf)
        upm = f["head"].unitsPerEm
        k = 1000.0 / upm
        cmap = f.getBestCmap()
        assert any(t.platformID == 3 and t.platEncID == 1 for t in f["cmap"].tables), "no (3,1) cmap"
        gs, hmtx = f.getGlyphSet(), f["hmtx"]
        widths = [round(hmtx[cmap[codes[c]]][0] * k) if c in codes and codes[c] in cmap else 0 for c in range(32, 256)]

        def height(ch):
            from fontTools.pens.boundsPen import BoundsPen
            bp = BoundsPen(gs)
            gs[cmap[ord(ch)]].draw(bp)
            return round(bp.bounds[3] * k)
        head, hhea = f["head"], f["hhea"]
        meta = dict(family=family, file=name + ".ttf", unitsPerEm=1000,
                    ascent=round(hhea.ascent * k), descent=round(hhea.descent * k),
                    capHeight=height("H"), xHeight=height("x"),
                    bbox=[round(v * k) for v in (head.xMin, head.yMin, head.xMax, head.yMax)],
                    italicAngle=round(f["post"].italicAngle), flags=flags, stemV=stemv,
                    firstChar=32, lastChar=255, widths=widths,
                    license="SIL Open Font License 1.1 (see %s-OFL.txt)" % name)
        json.dump(meta, open(os.path.join(OUT, name + ".json"), "w"), indent=1)
        print(name, os.path.getsize(ttf) // 1024, "KB,", len(f.getGlyphOrder()), "glyphs, tables", sorted(f.keys()),
              "| asc/desc/cap/x", meta["ascent"], meta["descent"], meta["capHeight"], meta["xHeight"], "| zero widths",
              [c + 32 for c, w in enumerate(widths) if not w])


if __name__ == "__main__":
    main()
