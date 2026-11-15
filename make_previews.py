"""Rasterize data/_test/sheet-<style>.pdf (whole-area single-sheet PDFs saved from the web app
with overlays off, via PUT /_save/ on serve.py) into docs/preview-<style>.jpg."""
import os, pymupdf
HERE = os.path.dirname(os.path.abspath(__file__))
for t in ["classic", "storybook", "vintage", "blueprint", "ink"]:
    d = pymupdf.open(os.path.join(HERE, "data", "_test", "sheet-%s.pdf" % t))
    z = 4600 / d[0].rect.width
    d[0].get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False).save(os.path.join(HERE, "docs", "preview-%s.jpg" % t), jpg_quality=78)
    print(t)
