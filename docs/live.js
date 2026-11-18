/* Anywhere in the US: OpenStreetMap data downloaded live as OpenFreeMap vector tiles for the place in the page address
   (?lat=..&lon=..&mi=..&name=..). The data is turned into exactly the same tile format the built-in Louisville data uses
   (one feature per line: id \t layer \t x0 \t y0 \t x1 \t y1 \t <pdf path ops>), so the rest of the app draws it unchanged.
   Without those parameters the page is the built-in Louisville map and nothing here changes it. Loaded before app.js. */
(() => {
'use strict';
const MILE = 288;                                   // base units per mile, the same scale as the built-in map
const R = 6378137, rad = Math.PI / 180;
const SIZES = { 7: 4, 11: 6, 19: 10 };              // area across in miles -> cells each way (540 base units = 1.875 mi a cell)
const CELL = 540;

/* lat/lon -> base coordinates for a square map `size` base units across centred on lat0/lon0 (y grows northward) */
function makeProj(lat0, lon0, size) {
  const h = (size / 2 / MILE) * 1609.344 / Math.cos(lat0 * rad);
  const X0 = lon0 * rad * R - h, Y0 = Math.log(Math.tan(Math.PI / 4 + lat0 * rad / 2)) * R - h, S = size / (2 * h);
  const fwd = (lat, lon) => [(lon * rad * R - X0) * S, (Math.log(Math.tan(Math.PI / 4 + lat * rad / 2)) * R - Y0) * S];
  const inv = (x, y) => [(2 * Math.atan(Math.exp((y / S + Y0) / R)) - Math.PI / 2) / rad, (x / S + X0) / R / rad];
  return { fwd, inv };
}
window.makeProj = makeProj;

const q = new URLSearchParams(location.search);
const lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon'));
const live = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) < 85 && Math.abs(lon) <= 180;
window.LIVE = null;
if (!live) return;

const miKey = SIZES[q.get('mi')] ? q.get('mi') : '11';
const N = SIZES[miKey], SIZE = N * CELL;
const name = String(q.get('name') || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 60).trim() || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
const P = makeProj(lat, lon, SIZE);
const tiles = [];
for (let c = 0; c < N; c++) for (let r = 0; r < N; r++) tiles.push(c + '_' + r);
const base = window.MAPMETA;
window.MAPMETA = Object.assign({}, base, { size: SIZE, cell: CELL, n: N, img: 2400, features: 1, center: [SIZE / 2, SIZE / 2], tiles,
  live: { lat, lon, name, mi: miKey } });

/* ---- OpenFreeMap vector tiles (OpenStreetMap data in the OpenMapTiles layout), zoom 14, decoded here.
   Each cell of the map is covered by a few tiles; a tile is downloaded once and shared by the cells it touches. */
const Z = 14, TILEJSON = 'https://tiles.openfreemap.org/planet';
let tileUrl = null;
const getUrl = () => tileUrl || (tileUrl = fetch(TILEJSON).then(r => { if (!r.ok) throw new Error('map data index ' + r.status); return r.json(); })
  .then(j => j.tiles[0]).catch(err => { tileUrl = null; throw err; }));

/* minimal protobuf / Mapbox Vector Tile reader */
function pbf(buf) {
  let p = 0;
  const varint = () => { let v = 0, m = 1, b; do { b = buf[p++]; v += (b & 127) * m; m *= 128; } while (b & 128); return v; };
  return {
    get pos() { return p; }, set pos(v) { p = v; }, varint,
    skip(w) { if (w === 0) varint(); else if (w === 1) p += 8; else if (w === 2) p += varint(); else if (w === 5) p += 4; },
    bytes() { const n = varint(), s = p; p += n; return buf.subarray(s, s + n); },
    packed() { const n = varint(), e = p + n, out = []; while (p < e) out.push(varint()); return out; },
  };
}
const utf8 = new TextDecoder();
function readValue(b) {
  const r = pbf(b); let v = null;
  while (r.pos < b.length) {
    const t = r.varint(), f = t >> 3, w = t & 7;
    if (f === 1) v = utf8.decode(r.bytes());
    else if (f === 2) { v = new DataView(b.buffer, b.byteOffset + r.pos, 4).getFloat32(0, true); r.pos += 4; }
    else if (f === 3) { v = new DataView(b.buffer, b.byteOffset + r.pos, 8).getFloat64(0, true); r.pos += 8; }
    else if (f === 4 || f === 5) v = r.varint();
    else if (f === 6) { const n = r.varint(); v = (n % 2 ? -(n + 1) / 2 : n / 2); }
    else if (f === 7) v = !!r.varint();
    else r.skip(w);
  }
  return v;
}
const WANT = new Set(['transportation', 'building', 'water', 'waterway', 'landcover', 'landuse', 'park', 'aeroway']);
function decodeTile(buf) {
  const r = pbf(buf), layers = [];
  while (r.pos < buf.length) {
    const t = r.varint();
    if ((t >> 3) !== 3) { r.skip(t & 7); continue; }
    const lb = r.bytes(), lr = pbf(lb);
    let name = '', extent = 4096;
    const keys = [], vals = [], feats = [];
    while (lr.pos < lb.length) {
      const u = lr.varint(), f = u >> 3;
      if (f === 1) name = utf8.decode(lr.bytes());
      else if (f === 2) feats.push(lr.bytes());
      else if (f === 3) keys.push(utf8.decode(lr.bytes()));
      else if (f === 4) vals.push(readValue(lr.bytes()));
      else if (f === 5) extent = lr.varint();
      else lr.skip(u & 7);
    }
    if (!WANT.has(name)) continue;
    const out = [];
    for (const fb of feats) {
      const fr = pbf(fb); let tags = [], type = 0, geom = [];
      while (fr.pos < fb.length) {
        const u = fr.varint(), f = u >> 3;
        if (f === 2) tags = fr.packed(); else if (f === 3) type = fr.varint(); else if (f === 4) geom = fr.packed(); else fr.skip(u & 7);
      }
      const props = {};
      for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = vals[tags[i + 1]];
      out.push({ props, type, geom });
    }
    layers.push({ name, extent, feats: out });
  }
  return layers;
}
/* geometry commands -> parts, each a list of [px, py] in tile units; polygon rings come back closed */
function parts(geom, type) {
  const out = []; let cur = null, x = 0, y = 0, i = 0;
  const zz = n => (n >> 1) ^ -(n & 1);
  while (i < geom.length) {
    const c = geom[i++], cmd = c & 7, n = c >> 3;
    if (cmd === 7) { if (cur && cur.length) cur.push(cur[0]); continue; }
    for (let j = 0; j < n; j++) {
      x += zz(geom[i++]); y += zz(geom[i++]);
      if (cmd === 1) { cur = [[x, y]]; out.push(cur); } else cur.push([x, y]);
    }
  }
  return type === 3 ? out.filter(p => p.length >= 4) : out.filter(p => p.length >= 2);
}

/* OpenMapTiles classes -> this map's layers (the same choices render_map.py makes from raw OpenStreetMap tags) */
const MINOR_RAIL = new Set(['yard', 'siding', 'spur', 'crossover']);
const PARKISH = new Set(['park', 'garden', 'playground', 'recreation_ground', 'village_green', 'dog_park']);
function layerOf(name, p, type) {
  const c = p.class, sc = p.subclass;
  if (name === 'transportation') {
    if (type !== 2) return null;
    if (c === 'rail' || c === 'transit') return p.brunnel === 'tunnel' ? null : (MINOR_RAIL.has(p.service) ? 'railminor' : 'rail');
    if (c === 'motorway') return p.ramp ? 'mlink' : 'motorway';
    if (c === 'trunk' || c === 'primary' || c === 'secondary' || c === 'tertiary') return p.ramp ? 'link' : c;
    if (c === 'minor') return 'residential';
    if (c === 'service' || c === 'raceway' || c === 'busway') return 'service';
    if (c === 'track') return 'trail';
    if (c === 'path') return sc === 'pedestrian' ? 'service' : 'trail';
    return null;
  }
  if (name === 'building') return type === 3 ? 'building' : null;
  if (name === 'water') return type === 3 && c !== 'swimming_pool' && p.brunnel !== 'tunnel' ? 'water' : null;
  if (name === 'waterway') {
    if (type !== 2 || p.brunnel === 'tunnel') return null;
    return c === 'river' ? 'river' : c === 'canal' ? 'canal' : c === 'stream' ? 'stream' : (c === 'ditch' || c === 'drain') ? 'ditch' : null;
  }
  if (type !== 3) return null;
  if (name === 'landcover') {
    if (sc === 'golf_course') return 'golf';
    if (PARKISH.has(sc)) return 'park';
    if (c === 'wood' || sc === 'scrub') return 'wood';
    if (c === 'wetland') return 'wetland';
    if (['grass', 'meadow', 'orchard', 'vineyard'].includes(sc)) return 'grass';
    return null;
  }
  if (name === 'landuse') {
    if (c === 'cemetery') return 'cemetery';
    if (c === 'pitch' || c === 'track') return 'pitch';
    if (PARKISH.has(c)) return 'park';
    return null;
  }
  if (name === 'park') return c === 'nature_reserve' || c === 'park' ? 'park' : null;
  if (name === 'aeroway') {
    if (c === 'aerodrome') return 'aerodrome';
    if (c === 'apron') return 'apron';
    return null;
  }
  return null;
}
const AERO_LINE = { runway: 'runway', taxiway: 'taxiway' };

const SRC = {};                                     // layer name -> source index, from mapdata.js
for (const L of window.LAYERS) if (!(L.name in SRC)) SRC[L.name] = L.src;
const AREA = new Set(window.LAYERS.filter(l => l.kind === 'fill').map(l => l.name));

function thin(pts, tol) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], o = out[out.length - 1];
    if (Math.abs(p[0] - o[0]) > tol || Math.abs(p[1] - o[1]) > tol) out.push(p);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const pathstr = (pts, close) => pts.map((p, i) => p[0].toFixed(2) + ' ' + p[1].toFixed(2) + (i ? ' l' : ' m')).join(' ') + (close ? ' h' : '');

/* one decoded tile -> its tile lines with their boxes; ids are numbered across the whole area so a feature drawn from
   a tile that touches two cells is only drawn once */
let nextId = 1;
function tileLines(tx, ty, layers) {
  const out = [], n2 = 2 ** Z;
  for (const L of layers) {
    const ext = L.extent;
    const toBase = ([px, py]) => {
      const lonv = (tx + px / ext) / n2 * 360 - 180;
      const latv = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + py / ext) / n2))) / rad;
      return P.fwd(latv, lonv);
    };
    for (const f of L.feats) {
      let layer = layerOf(L.name, f.props, f.type);
      if (!layer && L.name === 'aeroway' && f.type === 2) layer = AERO_LINE[f.props.class] || null;
      if (!layer) continue;
      const area = AREA.has(layer);
      const ps = parts(f.geom, area ? 3 : 2).map(q => q.map(toBase));
      if (!ps.length) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of ps) for (const [x, y] of q) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < -5 || y1 < -5 || x0 > SIZE + 5 || y0 > SIZE + 5) continue;
      const tol = layer === 'building' ? .03 : .12;
      const s = area ? ps.map(q => pathstr(thin(q, tol), true)).join(' ') + ' f*\n' : ps.map(q => pathstr(thin(q, tol), false)).join(' ') + '\n';
      const box = [Math.floor(x0) - 4, Math.floor(y0) - 4, Math.ceil(x1) + 4, Math.ceil(y1) + 4];
      out.push({ box, text: `${nextId++}\t${SRC[layer]}\t${box.join('\t')}\t${s}` });
    }
  }
  return out;
}

const tileCache = new Map();                        // 'x/y' -> Promise of tile lines
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getTile(tx, ty) {
  const url = (await getUrl()).replace('{z}', Z).replace('{x}', tx).replace('{y}', ty);
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404 || res.status === 204) return [];
      if (!res.ok) throw new Error('status ' + res.status);
      let buf = new Uint8Array(await res.arrayBuffer());
      if (buf[0] === 0x1f && buf[1] === 0x8b) buf = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      return tileLines(tx, ty, decodeTile(buf));
    } catch (err) { lastErr = err; await sleep(800 * (attempt + 1)); }
  }
  throw new Error('Could not download map data from OpenFreeMap (' + (lastErr && lastErr.message) + '). Check your connection and try again.');
}
const tileOf = (latv, lonv) => {
  const n2 = 2 ** Z, s = Math.sin(latv * rad);
  return [Math.floor((lonv + 180) / 360 * n2), Math.floor((1 - Math.log((1 + s) / (1 - s)) / (2 * Math.PI)) / 2 * n2)];
};
async function fetchCell(key) {
  const [c, r] = key.split('_').map(Number);
  const bx0 = c * CELL, by0 = r * CELL, bx1 = bx0 + CELL, by1 = by0 + CELL;
  const [s, w] = P.inv(bx0, by0), [n, e] = P.inv(bx1, by1);
  const [tx0, ty0] = tileOf(n, w), [tx1, ty1] = tileOf(s, e);
  const jobs = [];
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
    const k = tx + '/' + ty;
    if (!tileCache.has(k)) tileCache.set(k, getTile(tx, ty).catch(err => { tileCache.delete(k); throw err; }));
    jobs.push(tileCache.get(k));
  }
  let text = '';
  for (const lines of await Promise.all(jobs))
    for (const l of lines) if (l.box[2] >= bx0 && l.box[0] <= bx1 && l.box[3] >= by0 && l.box[1] <= by1) text += l.text;
  return new TextEncoder().encode(text);
}

window.LIVE = { name, lat, lon, mi: miKey, size: SIZE, proj: P, cell: fetchCell, maxId: () => nextId };
})();
