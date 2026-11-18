# bigmap

Wall Map Maker: design an unlabeled wall map sized to your wall, and print it at home on Letter, Legal, A4 or Tabloid paper. Everything runs in the browser; the PDFs are generated on your device.

- Louisville, Kentucky is built in, with neighborhoods, street names, terrain, landmarks and old-chart details.
- Anywhere else in the US: search for a place in the "Place" box. Its map data is downloaded live as OpenFreeMap vector tiles (OpenStreetMap data) and converted in the browser to the same format (`docs/live.js`, `docs/picker.js`). The page address carries the place: `?lat=..&lon=..&mi=7|11|19&name=..`.
- `docs/poster.html`: turn any picture into a giant poster printed across home-printer pages, with the same trim marks and assembly guide.

Live site: https://james-baunach.github.io/bigmap/

- `docs/` is the website (served by GitHub Pages).
- `extract_pbf.py`, `build_web.py`, `make_previews.py` rebuild the map data from OpenStreetMap extracts.
- `render_map.py` renders a fixed 10 x 10 ft version with Python.
- `serve.py` is a local preview server.

Map data (c) OpenStreetMap contributors, available under the Open Database License.
