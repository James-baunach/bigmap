# bigmap

Louisville Wall Map Maker: design an unlabeled wall map of Louisville, Kentucky sized to your wall, and print it at home on Letter or Legal paper. Everything runs in the browser; the PDFs are generated on your device.

Live site: https://james-baunach.github.io/bigmap/

- `docs/` is the website (served by GitHub Pages).
- `extract_pbf.py`, `build_web.py`, `make_previews.py` rebuild the map data from OpenStreetMap extracts.
- `render_map.py` renders a fixed 10 x 10 ft version with Python.
- `serve.py` is a local preview server.

Map data (c) OpenStreetMap contributors, available under the Open Database License.
