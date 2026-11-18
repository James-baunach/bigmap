# bigmap

Wall Map Maker: design an unlabeled wall map sized to your wall, and print it at home on Letter, Legal, A4 or Tabloid paper. Everything runs in the browser; the PDFs are generated on your device.

- Louisville, Kentucky is built in, with neighborhoods, street names, terrain, landmarks and old-chart details.
- Anywhere else in the US: search for a place in the "Place" box. Its map data is downloaded live as OpenFreeMap vector tiles (OpenStreetMap data) and converted in the browser to the same format (`docs/live.js`, `docs/picker.js`). The page address carries the place: `?lat=..&lon=..&mi=7|11|19&name=..`.
- Poster mode (the Map / Poster switch at the top of the panel, or `?mode=poster`): turn any picture into a giant poster printed across home-printer pages, with the same trim marks and assembly guide (`docs/poster.js`; `docs/poster.html` redirects there).
- Personal touches: markers with their own printed size, color and label, word-only notes, a dotted path joining them, your own colors, and map shapes (rounded, circle, oval, heart). A close-up window shows any part of the map at its actual printed size.

Live site: https://james-baunach.github.io/bigmap/

- `docs/` is the website (served by GitHub Pages).
- `extract_pbf.py`, `build_web.py`, `make_previews.py` rebuild the map data from OpenStreetMap extracts.
- `render_map.py` renders a fixed 10 x 10 ft version with Python.
- `serve.py` is a local preview server.

Map data (c) OpenStreetMap contributors, available under the Open Database License.
