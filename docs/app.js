/* Louisville Wall Map Maker: preview + in-browser vector PDF generation */
(() => {
'use strict';
const M = window.MAPMETA, LAYERS = window.LAYERS, C = M.colors;
const NSRC = Math.max(...LAYERS.map(l => l.src)) + 1;
const BLDG_SRC = LAYERS.find(l => l.name === 'building').src;
const TILESET = new Set(M.tiles);
const BLEED = 10.8;          // 0.15 in of extra map past interior trim lines
const PAPERS = { letter: [612, 792], legal: [612, 1008], a4: [595.28, 841.89], tabloid: [792, 1224] };   // [short, long] in points
const MILE = 288;            // base units per mile (base: 72 units = 1/4 mile)
const MAXK = 20;            // closest zoom: 1 in = about 66 ft
const hexOf = s => '#' + s.split(' ').map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const BASEHEX = Object.fromEntries(LAYERS.map(l => [l.name, hexOf(l.rgb)]));
const CASED = ['residential', 'link', 'tertiary', 'secondary', 'primary', 'trunk'];
const each = (names, c) => Object.fromEntries(names.map(n => [n, c]));
const GREENS = ['grass', 'park', 'cemetery', 'golf', 'wood', 'wetland', 'pitch'];
const WATERS = ['water', 'canal', 'river'];

/* Limited palettes: one or two inks on cream paper. Every layer is the paper, an ink, or a tint (a mix of paper and ink). */
const mixHex = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0')).join('');
function inkTheme(label, note, o) {
  const mx = (c, t) => mixHex(o.paper, c, t);
  const ink = o.ink, wi = o.water || ink, gi = o.green || ink, ac = o.accent || ink, bi = o.bld || ink;
  const colors = Object.assign({
    aerodrome: mx(ink, .05), apron: mx(ink, .10), taxiway: mx(ink, .28), runway: mx(ink, .55),
    grass: mx(gi, .10), park: mx(gi, .17), cemetery: mx(gi, .22), golf: mx(gi, .20), wood: mx(gi, .30), wetland: mx(wi, .22), pitch: mx(gi, .26),
    ditch: mx(wi, .55), stream: mx(wi, .62), canal: mx(wi, .40), river: mx(wi, .40), water: mx(wi, .40),
    building: mx(bi, .36), trail: mx(ink, .55), railminor: mx(ink, .7), rail: ink, rail_tie: o.paper, service: mx(ink, .55),
    mlink: ac, motorway: ac, mlink_case: o.paper, motorway_case: o.paper }, each(['residential', 'link', 'tertiary', 'secondary', 'primary', 'trunk'], ink));
  return { label, note, land: o.paper, limited: true, sw: [o.paper, colors.water, colors.park, ink, ac], colors, widths: { motorway: 1.12, mlink: 1.1 },
    ov: { ink, gold: o.gold || mx(ac, .62), accent: ac, paper: o.paper } };
}
/* Styles. Classic is the base look and the default; the others only override colours. */
const THEMES = {
  classic: { label: 'Classic', note: 'The original', land: '#FFFFFF', sw: ['#FFFFFF', '#8FC3D8', '#9CC58A', '#1B2733', '#A8232C'],
    ov: { ink: C.ink, gold: C.gold, accent: C.motorway, paper: '#FFFFFF' } },
  storybook: { label: 'Storybook', note: 'Soft, illustrated', land: '#F7EFDD', sw: ['#F7EFDD', '#86CDD2', '#93C47D', '#7A5C48', '#F4B942'],
    casing: '#7A5C48', casingExtra: .8,
    widths: Object.assign(each(CASED, 1.3), { motorway: 1.1, mlink: 1.15 }),
    colors: Object.assign({ grass: '#E3EBC2', park: '#C5DE9E', cemetery: '#CFDDB0', golf: '#B9DA94', wood: '#93C47D', wetland: '#BFE0D2', pitch: '#8FC774',
      stream: '#5FB3BD', ditch: '#5FB3BD', aerodrome: '#EFE6D2', apron: '#E5DAC4', taxiway: '#CFC4AE', runway: '#B3A893',
      building: '#E8B998', trail: '#B98A5A', rail: '#7A5C48', railminor: '#7A5C48', rail_tie: '#F7EFDD', service: '#C9B193',
      mlink: '#F4B942', motorway: '#F4B942', mlink_case: '#7A5C48', motorway_case: '#7A5C48' },
      each(WATERS, '#86CDD2'), each(CASED, '#FFFDF7')),
    ov: { ink: '#5B4031', gold: '#C98B2B', accent: '#C8553D', paper: '#FBF5E6' } },
  vintage: { label: 'Vintage', note: 'Antique sepia', land: '#F3E7CB', sw: ['#F3E7CB', '#A8C5C0', '#B4BC85', '#4B3524', '#8E2F1F'],
    colors: Object.assign({ grass: '#E4DDB4', park: '#CDD2A0', cemetery: '#D3D3AE', golf: '#C6CF9A', wood: '#B4BC85', wetland: '#C7D2B8', pitch: '#B1BC80',
      stream: '#7FA6A3', ditch: '#7FA6A3', aerodrome: '#EADDBD', apron: '#E0D2B0', taxiway: '#C9B994', runway: '#A8997A',
      building: '#C2A27C', trail: '#A58258', rail: '#5E4630', railminor: '#5E4630', rail_tie: '#F3E7CB', service: '#9A8468',
      residential: '#5C4532', mlink: '#8E2F1F', motorway: '#8E2F1F', mlink_case: '#F3E7CB', motorway_case: '#F3E7CB' },
      each(WATERS, '#A8C5C0'), each(['link', 'tertiary', 'secondary', 'primary', 'trunk'], '#4B3524')),
    ov: { ink: '#4B3524', gold: '#A9792A', accent: '#8E2F1F', paper: '#F7EDD6' } },
  blueprint: { label: 'Blueprint', note: 'Dark; uses a lot of ink', land: '#14365E', sw: ['#14365E', '#0B2545', '#1D5374', '#F2F7FC', '#FFD166'],
    colors: Object.assign({ grass: '#17406A', park: '#1A4A70', cemetery: '#1A4A70', golf: '#1A4A70', wood: '#1D5374', wetland: '#18476C', pitch: '#215C7C',
      stream: '#5C9BD1', ditch: '#5C9BD1', aerodrome: '#173D66', apron: '#1B446F', taxiway: '#6F93B8', runway: '#9DB9D6',
      building: '#2F6497', trail: '#7FA6CC', rail: '#B7CCE2', railminor: '#B7CCE2', rail_tie: '#14365E', service: '#7FA3C7',
      residential: '#DCE8F4', mlink: '#FFD166', motorway: '#FFD166', mlink_case: '#14365E', motorway_case: '#14365E' },
      each(WATERS, '#0B2545'), each(['link', 'tertiary', 'secondary', 'primary', 'trunk'], '#F2F7FC')),
    ov: { ink: '#F2F7FC', gold: '#FFD166', accent: '#FFD166', paper: '#14365E' } },
  ink: { label: 'Line art', note: 'Minimal, least ink', land: '#FFFFFF', sw: ['#FFFFFF', '#DDE7EC', '#E6ECE0', '#111111', '#111111'],
    hide: ['building'], widths: { motorway: 1.15 },
    colors: Object.assign({ wood: '#E1E9DB', stream: '#9FB4BF', ditch: '#9FB4BF', aerodrome: '#F6F6F4', apron: '#ECECEA', taxiway: '#C4C4C4', runway: '#9A9A9A',
      trail: '#9A9A9A', rail: '#555555', railminor: '#555555', service: '#7A7A7A', residential: '#222222',
      mlink: '#111111', motorway: '#111111' },
      each(['grass', 'park', 'cemetery', 'golf', 'wetland', 'pitch'], '#EDF1E9'), each(WATERS, '#DDE7EC'),
      each(['link', 'tertiary', 'secondary', 'primary', 'trunk'], '#111111')),
    ov: { ink: '#111111', gold: '#111111', accent: '#111111', paper: '#FFFFFF' } },
};
Object.assign(THEMES, {
  navy: inkTheme('Navy on cream', 'One ink, poster look', { paper: '#F4ECD8', ink: '#1B3556' }),
  blackgold: inkTheme('Black and gold', 'Black ink, gold accent', { paper: '#F5F0E3', ink: '#16140F', accent: '#B8892B', green: '#B8892B', gold: '#C9A24A' }),
  cardinal: inkTheme('Cardinal red and black', 'Two inks, bold', { paper: '#F8F3EA', ink: '#1C1C1C', accent: '#B01030', green: '#B01030' }),
  forest: inkTheme('Forest green on cream', 'One ink, calm', { paper: '#F2EDDB', ink: '#1E4A33' }),
});
const shade = (hex, f) => '#' + [1, 3, 5].map(i => {
  const v = parseInt(hex.substr(i, 2), 16);
  return Math.round(clamp(f < 0 ? v * (1 + f) : v + (255 - v) * f, 0, 255)).toString(16).padStart(2, '0');
}).join('');

/* drawing passes for the current style + optional illustrated touches */
function passes() {
  if (isArt()) return passesArt();
  const T = THEMES[state.theme], out = [];
  const col = n => (T.colors && T.colors[n]) || BASEHEX[n];
  const wm = n => (T.widths && T.widths[n]) || 1;
  for (const L of LAYERS) {
    const n = L.name;
    if (T.hide && T.hide.includes(n)) continue;
    if (n === 'residential' && T.casing) {
      for (const r of CASED) {
        const R = LAYERS.find(l => l.name === r);
        out.push({ src: R.src, kind: 'line', hex: T.casing, width: R.width * wm(r) + T.casingExtra, butt: 0, dash: 0 });
      }
    }
    if (L.kind === 'fill') {
      if (n === 'building' && state.shadows) out.push({ src: L.src, kind: 'shadow', hex: shade(col(n), -.42) });
      out.push({ src: L.src, kind: 'fill', hex: col(n), outline: n === 'building' && state.shadows ? shade(col(n), -.5) : null });
      if (n === 'wood' && state.trees) out.push({ src: L.src, kind: 'pattern', pat: { id: 'PT', type: 'trees', T: 40, c1: shade(col(n), -.22), c2: shade(col(n), .25) } });
      if (n === 'water' && state.waves) out.push({ src: L.src, kind: 'pattern', pat: { id: 'PW', type: 'waves', T: 44, c1: state.theme === 'blueprint' ? shade(col(n), .3) : shade(col(n), .55) } });
      if (n === 'water' && state.shore) out.push({ kind: 'shore' });
    } else out.push({ src: L.src, kind: 'line', hex: col(n), width: L.width * wm(n), butt: L.butt, dash: L.dash });
  }
  return out;
}
/* line widths grow more slowly than the map when zooming out, and approach true road width zooming in */
const widthScale = k => k < 1 ? Math.pow(k, -.35) : 1 + .5 * (1 - Math.pow(k, -.6));
const shadowOff = k => clamp(.6 * Math.pow(k, .75), .6, 6);   // output points
const patScale = g => clamp(g.o * 1.5, .55, 1.1);

/* ------------------------------------------------------------ drawing techniques and detail levels
   Everything here is optional: with Drawing = Clean and Detail = Full none of it runs and the output is the original.
   One path-transform stage serves the PDF and the preview: a feature's coordinates are parsed, thinned, optionally
   smoothed (Chaikin) and resampled, then displaced by smooth noise that depends only on the base x, y position, the
   pass seed and the zoom (never on the page, tile or feature order), so strokes meet exactly across page seams and
   tile borders and the preview matches the PDF. Sizes are in output points, converted with the view scale k. */
const DRAW_KEYS = ['clean', 'ink', 'pencil', 'block'], DETAIL_KEYS = ['full', 'simple'];
const DRAW_NAMES = { clean: 'Clean', ink: 'Hand-drawn ink', pencil: 'Pencil sketch', block: 'Block print' };
const isArt = () => state.draw !== 'clean' || state.detail !== 'full';
const SIMPLE_DROP = new Set(['service', 'trail', 'railminor', 'ditch', 'taxiway', 'apron']);
const BLOCK_DROP = new Set(['service', 'trail', 'railminor', 'ditch', 'taxiway', 'apron', 'grass', 'aerodrome']);
const SIMPLE_BLDG_PT = 1.6, BLOCK_BLDG_PT = 2.6;      // smallest building (bounding box, points on the output) that is still drawn
const ROAD_DBL = new Set(['residential', 'link', 'tertiary', 'secondary', 'primary', 'trunk', 'mlink', 'motorway']);
const XF = {
  clean: {},
  ink: { a1: 1.7, w1: 150, a2: .4, w2: 14, eps: .1, ds: 4.5, aref: 6 },
  pencil: { a1: 1.3, w1: 130, a2: .4, w2: 10, eps: .1, ds: 3.4, aref: 6 },
  block: { a1: .5, w1: 5, a2: .24, w2: 1.9, eps: .15, ds: .95, aref: 5 },
};
const BLOCK_WMIN = { residential: .85, link: 1, tertiary: 1.2, secondary: 1.5, primary: 1.9, trunk: 2.3, mlink: 1.5, mlink_case: 2.3, motorway: 2.8, motorway_case: 4,
  rail: 1.1, rail_tie: .7, stream: .7, canal: 1.5, river: 2.4, runway: 3 };
/* hatch patterns for the pencil style: angles, lines per tile (the tile is 96 units) */
const HATCH = { park: { ang: [45], n: 22 }, cemetery: { ang: [90], n: 24 }, golf: { ang: [45], n: 30 }, wood: { ang: [45, -45], n: 24 }, wetland: { ang: [0], n: 28 },
  pitch: { ang: [0, 90], n: 20 }, water: { ang: [0], n: 40 }, building: { ang: [45], n: 70 }, grass: { ang: [-45], n: 16 } };

const lumOf = h => (.2126 * parseInt(h.substr(1, 2), 16) + .7152 * parseInt(h.substr(3, 2), 16) + .0722 * parseInt(h.substr(5, 2), 16)) / 255;
const greyHex = v => { const c = Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0'); return '#' + c + c + c; };
/* graphite grey for a colour: by luminance, lightened by `strength` (1 = same darkness); light on dark styles are flipped */
function pencilGrey(hex, strength) {
  const dark = lumOf(THEMES[state.theme].land) < .4, l = lumOf(hex);
  return greyHex(1 - (1 - (dark ? 1 - l : l)) * strength);
}
const landOf = () => (state.draw === 'pencil' ? pencilGrey(THEMES[state.theme].land, .35) : THEMES[state.theme].land);
/* overlay colours (compass, border, rings, labels): the style's own, or graphite greys for the pencil sketch */
function ovPalFor(opt) {
  const T = THEMES[opt.theme];
  if (opt.draw !== 'pencil') return T.ov;
  const was = state.theme; state.theme = opt.theme;
  const o = { ink: pencilGrey(T.ov.ink, .9), gold: pencilGrey(T.ov.gold, .8), accent: pencilGrey(T.ov.accent, .85), paper: pencilGrey(T.land, .35) };
  state.theme = was;
  return o;
}
function blockCol(T, n) {
  const g = nm => (T.colors && T.colors[nm]) || BASEHEX[nm];
  if (n === 'water' || n === 'canal' || n === 'river' || n === 'stream') return g('water');
  if (GREENS.includes(n)) return g('wood');
  if (n === 'rail_tie' || n.endsWith('_case')) return T.land;
  if (T.limited && (n === 'motorway' || n === 'mlink' || n === 'building')) return g(n);
  if (n === 'building') return T.ov.accent;                 // the second ink: houses are in the accent colour
  return T.ov.ink;
}

/* the ordered drawing passes for any non-default technique or detail level (same shape as passes(), plus `xf` per pass) */
function passesArt() {
  const T = THEMES[state.theme], draw = state.draw, simple = state.detail === 'simple', out = [];
  const pencil = draw === 'pencil', block = draw === 'block', ink = draw === 'ink';
  const base = n => (T.colors && T.colors[n]) || BASEHEX[n];
  const wm = n => (T.widths && T.widths[n]) || 1;
  const fillCol = n => (pencil ? pencilGrey(base(n), .5) : block ? blockCol(T, n) : base(n));
  const lineCol = n => (pencil ? pencilGrey(base(n), .85) : block ? blockCol(T, n) : base(n));
  const smooth = simple ? { ch: 1, cap: 5, eps: .3 } : null;
  const mk = (seed, area, extra) => { const x = Object.assign({}, XF[draw], smooth, { seed, area }, extra); return x; };
  const push = p => { p.xk = JSON.stringify(p.xf); out.push(p); };
  for (const L of LAYERS) {
    const n = L.name;
    if (T.hide && T.hide.includes(n)) continue;
    if (simple && SIMPLE_DROP.has(n)) continue;
    if (block && BLOCK_DROP.has(n)) continue;
    if (n === 'residential' && T.casing && !pencil && !block) {
      for (const r of CASED) {
        const R = LAYERS.find(l => l.name === r);
        push({ src: R.src, kind: 'line', hex: T.casing, width: R.width * wm(r) + T.casingExtra, butt: 0, dash: 0, wmul: 1, wmin: 0, xf: mk(11, false) });
      }
    }
    if (L.kind === 'fill') {
      const col = fillCol(n), xf = mk(3, true);
      const shadows = n === 'building' && state.shadows;
      if (shadows) push({ src: L.src, kind: 'shadow', hex: shade(col, -.42), xf });
      let outline = shadows ? shade(col, -.5) : null, ow = null;
      if (ink) { outline = shade(col, -.5); ow = n === 'building' ? .22 : .3; }
      else if (pencil) { outline = pencilGrey(base(n), 1.25); ow = .26; }
      else if (block && n === 'building') { outline = T.land; ow = .5; }
      push({ src: L.src, kind: 'fill', hex: col, outline, ow, xf });
      if (pencil && HATCH[n]) {
        const h = HATCH[n];
        push({ src: L.src, kind: 'pattern', pat: { id: 'H' + n, type: 'hatch', T: 96, ang: h.ang, n: h.n, c1: pencilGrey(base(n), n === 'water' ? 1.15 : 1.6), lw: n === 'building' ? .3 : n === 'water' ? .32 : .42, seed: 7 + n.length * 13 },
          xf: mk(3, true, n === 'building' ? { minPt: 3.5 } : {}) });
      }
      if (n === 'wood' && state.trees) push({ src: L.src, kind: 'pattern', pat: { id: 'PT', type: 'trees', T: 40, c1: shade(col, -.22), c2: shade(col, .25) }, xf });
      if (n === 'water' && state.waves) push({ src: L.src, kind: 'pattern', pat: { id: 'PW', type: 'waves', T: 44, c1: state.theme === 'blueprint' ? shade(col, .3) : shade(col, .55) }, xf });
      if (n === 'water' && state.shore) push({ kind: 'shore', xf });
    } else {
      const hex = lineCol(n), width = L.width * wm(n);
      const wmin = block ? (BLOCK_WMIN[n] || .7) : ink ? .15 : .12;
      if (block) push({ src: L.src, kind: 'line', hex, width, butt: L.butt, dash: L.dash, wmul: 1.25, wmin, xf: mk(11, false) });
      else if (ROAD_DBL.has(n) && (ink || pencil)) {
        const wmul = pencil ? .62 : .78;
        push({ src: L.src, kind: 'line', hex, width, butt: 0, dash: 0, wmul, wmin, xf: mk(11, false) });
        push({ src: L.src, kind: 'line', hex, width, butt: 0, dash: 0, wmul, wmin, xf: mk(12, false) });
      } else push({ src: L.src, kind: 'line', hex, width, butt: L.butt, dash: L.dash, wmul: ink ? .9 : pencil ? .75 : 1, wmin: draw === 'clean' ? 0 : wmin, xf: mk(11, false) });
    }
  }
  return out;
}

/* smooth value noise on a lattice: two independent channels (x and y displacement) in [-1, 1], left in NX and NY */
let NX = 0, NY = 0;
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return h ^ (h >>> 16);
}
function noise2(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  const a0 = a & 65535, b0 = b & 65535, c0 = c & 65535, d0 = d & 65535, a1 = a >>> 16, b1 = b >>> 16, c1 = c >>> 16, d1 = d >>> 16;
  NX = ((a0 + (b0 - a0) * u) * (1 - v) + (c0 + (d0 - c0) * u) * v) / 32767.5 - 1;
  NY = ((a1 + (b1 - a1) * u) * (1 - v) + (c1 + (d1 - c1) * u) * v) / 32767.5 - 1;
}
/* pass parameters (points) -> base units for one view scale */
function makeSpec(x, k) {
  return { seed: x.seed | 0, k, A1: (x.a1 || 0) / k, i1: x.w1 ? k / x.w1 : 0, A2: (x.a2 || 0) / k, i2: x.w2 ? k / x.w2 : 0,
    eps2: Math.pow((x.eps || 0) / k, 2), ch: x.ch || 0, cap: (x.cap || 6) / k, ds: x.ds ? x.ds / k : 0, area: !!x.area, aref: x.aref || 5, minPt: x.minPt || 0 };
}
const artPad = (P, k) => 6 + Math.max(0, ...P.map(p => (p.xf.a1 || 0) + (p.xf.a2 || 0))) * 1.5 / k;

const wkA = [], wkB = [], wkC = [], cur = [];
let F_SC = 1, F_FIRST = true, F_SKIP = false;
/* one subpath (points in `cur`) through thin -> smooth -> resample -> displace, then to the sink */
function subpath(sp, sink, closed) {
  let src = cur, n = cur.length >> 1;
  if (closed && n > 1 && src[0] === src[2 * n - 2] && src[1] === src[2 * n - 1]) n--;
  if (n < (closed ? 3 : 2)) return;
  let dst = wkA;
  if (sp.eps2) {
    dst[0] = src[0]; dst[1] = src[1];
    let m = 1, lx = src[0], ly = src[1];
    for (let i = 1; i < n; i++) {
      const x = src[2 * i], y = src[2 * i + 1], dx = x - lx, dy = y - ly;
      if (dx * dx + dy * dy >= sp.eps2) { dst[2 * m] = x; dst[2 * m + 1] = y; m++; lx = x; ly = y; }
      else if (!closed && i === n - 1) { dst[2 * m - 2] = x; dst[2 * m - 1] = y; lx = x; ly = y; }       // keep the true end of a line
    }
    if (closed && m > 3) { const dx = dst[0] - lx, dy = dst[1] - ly; if (dx * dx + dy * dy < sp.eps2) m--; }
    n = m; src = dst; dst = wkB;
    if (n < (closed ? 3 : 2)) { if (F_FIRST) F_SKIP = true; return; }
  }
  if (F_FIRST) {
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    for (let i = 0; i < n; i++) { const x = src[2 * i], y = src[2 * i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const size = Math.max(x1 - x0, y1 - y0) * sp.k;
    F_FIRST = false;
    if (sp.minPt && size < sp.minPt) { F_SKIP = true; return; }
    F_SC = sp.area && sp.A1 ? Math.min(1, size / sp.aref) : 1;
  }
  if (F_SKIP) return;
  const other = a => (a === wkA ? wkB : a === wkB ? wkC : wkA);
  for (let it = 0; it < sp.ch; it++) {                         // Chaikin corner cutting, the cut never longer than sp.cap
    let m = 0;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = closed ? (i + 1) % n : i + 1;
      const ax = src[2 * i], ay = src[2 * i + 1], bx = src[2 * j], by = src[2 * j + 1];
      const len = Math.hypot(bx - ax, by - ay), t = len > 4 * sp.cap ? sp.cap / len : .25;
      if (closed || i > 0) { dst[2 * m] = ax + (bx - ax) * t; dst[2 * m + 1] = ay + (by - ay) * t; m++; }
      else { dst[0] = ax; dst[1] = ay; m = 1; }
      if (closed || i < segs - 1) { dst[2 * m] = bx - (bx - ax) * t; dst[2 * m + 1] = by - (by - ay) * t; m++; }
      else { dst[2 * m] = bx; dst[2 * m + 1] = by; m++; }
    }
    n = m; src = dst; dst = other(src);
  }
  if (sp.ds) {                                                 // resample so the noise can bend long straight segments
    let m = 0;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = closed ? (i + 1) % n : i + 1;
      const ax = src[2 * i], ay = src[2 * i + 1], bx = src[2 * j], by = src[2 * j + 1];
      dst[2 * m] = ax; dst[2 * m + 1] = ay; m++;
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / sp.ds);
      for (let s = 1; s < steps; s++) { const t = s / steps; dst[2 * m] = ax + (bx - ax) * t; dst[2 * m + 1] = ay + (by - ay) * t; m++; }
    }
    if (!closed) { dst[2 * m] = src[2 * n - 2]; dst[2 * m + 1] = src[2 * n - 1]; m++; }
    n = m; src = dst; dst = other(src);
  }
  if (sp.A1 || sp.A2) {
    const sc = F_SC, A1 = sp.A1 * sc, A2 = sp.A2 * sc, i1 = sp.i1, i2 = sp.i2, sd = sp.seed;
    for (let i = 0; i < 2 * n; i += 2) {
      const x = src[i], y = src[i + 1];
      let dx = 0, dy = 0;
      if (A1) { noise2(x * i1, y * i1, sd); dx = NX * A1; dy = NY * A1; }
      if (A2) { noise2(x * i2 + 37.7, y * i2 + 11.3, sd + 101); dx += NX * A2; dy += NY * A2; }
      src[i] = x + dx; src[i + 1] = y + dy;
    }
  }
  sink.poly(src, n, closed);
}
/* parse one feature's path operators (bytes) and push every subpath through the transform into the sink */
function xfItem(b, sp, sink) {
  F_FIRST = true; F_SKIP = false; F_SC = 1;
  cur.length = 0;
  const e = b.length;
  let p = 0, have = 0, x = 0;
  while (p < e) {
    const ch = b[p];
    if (ch === 45 || (ch >= 48 && ch <= 57)) {
      let neg = false, v = 0;
      if (ch === 45) { neg = true; p++; }
      while (b[p] >= 48 && b[p] <= 57) { v = v * 10 + b[p] - 48; p++; }
      if (b[p] === 46) { p++; let s = .1; while (b[p] >= 48 && b[p] <= 57) { v += (b[p] - 48) * s; s *= .1; p++; } }
      if (neg) v = -v;
      if (have === 0) { x = v; have = 1; } else { cur.push(x, v); have = 0; }
    } else {
      if (ch === 109) {                                          // `x y m`: the pair just read starts a new subpath
        const n = cur.length;
        if (n > 2) { const mx = cur[n - 2], my = cur[n - 1]; cur.length = n - 2; subpath(sp, sink, false); cur.length = 0; cur.push(mx, my); }
        have = 0;
      }
      else if (ch === 104) { if (cur.length) { subpath(sp, sink, true); cur.length = 0; } }
      p++;
      if (F_SKIP) return;
    }
  }
  if (cur.length) { subpath(sp, sink, false); cur.length = 0; }
}

/* PDF byte writer: path operators with two decimals, straight into byte chunks (no strings) */
class Wr {
  constructor(parts) { this.parts = parts; this.cap = 1 << 17; this.buf = new Uint8Array(this.cap); this.pos = 0; this.count = 0; }
  flush() { if (this.pos) { this.parts.push(this.buf.slice(0, this.pos)); this.pos = 0; } }
  str(s) { if (this.pos + s.length > this.cap - 64) this.flush(); for (let i = 0; i < s.length; i++) this.buf[this.pos++] = s.charCodeAt(i); }
  num(v) {
    let q = Math.round(v * 100), pos = this.pos;
    const buf = this.buf;
    if (q < 0) { buf[pos++] = 45; q = -q; }
    const ip = Math.floor(q / 100), fp = q - ip * 100;
    if (ip === 0) buf[pos++] = 48;
    else { let nd = 0, t = ip; while (t) { nd++; t = (t / 10) | 0; } t = ip; for (let i = nd - 1; i >= 0; i--) { buf[pos + i] = 48 + t % 10; t = (t / 10) | 0; } pos += nd; }
    if (fp) { buf[pos++] = 46; if (fp % 10) { buf[pos++] = 48 + ((fp / 10) | 0); buf[pos++] = 48 + fp % 10; } else buf[pos++] = 48 + fp / 10; }
    this.pos = pos;
  }
  poly(a, n, closed) {
    for (let i = 0; i < n; i++) {
      if (this.pos > this.cap - 64) this.flush();
      this.num(a[2 * i]); this.buf[this.pos++] = 32; this.num(a[2 * i + 1]);
      this.buf[this.pos++] = 32; this.buf[this.pos++] = i ? 108 : 109; this.buf[this.pos++] = 32;
    }
    if (closed) { this.buf[this.pos++] = 104; this.buf[this.pos++] = 32; }
    this.count++;
  }
}
class PathSink {
  constructor() { this.P = new Path2D(); this.count = 0; }
  poly(a, n, closed) {
    const P = this.P;
    P.moveTo(a[0], a[1]);
    for (let i = 1; i < n; i++) P.lineTo(a[2 * i], a[2 * i + 1]);
    if (closed) P.closePath();
    this.count++;
  }
}
/* Transformed outline of every feature of one pass, as a Path2D (base coordinates). Yields now and then; null if cancelled. */
async function buildXfPath(items, sp, cancel) {
  const sink = new PathSink();
  let t0 = performance.now();
  for (let i = 0; i < items.length; i++) {
    xfItem(items[i], sp, sink);
    if ((i & 255) === 255 && performance.now() - t0 > 30) { await tick(); if (cancel && cancel()) return null; t0 = performance.now(); }
  }
  return sink.P;
}
/* the same, written as PDF operators: area features end with `tail` each, lines are stroked in batches */
async function emitXf(wr, items, sp, tail, lines, wait) {
  let t0 = performance.now(), pend = 0;
  for (let i = 0; i < items.length; i++) {
    const c0 = wr.count;
    xfItem(items[i], sp, wr);
    if (wr.count !== c0) {
      if (lines) { if (++pend === 150) { wr.str('S\n'); pend = 0; } else wr.str('\n'); }
      else wr.str(tail);
    }
    if ((i & 255) === 255 && performance.now() - t0 > 40) { wr.flush(); await wait(); t0 = performance.now(); }
  }
  if (lines && pend) wr.str('S\n');
}
/* content-stream parts for the map layers when a technique or detail level is on (passes carry `xf`) */
async function layerPartsArt(parts, g, buckets, tx, ty, P, wait, onPass, win) {
  const ws = widthScale(g.k), k = g.k, wr = new Wr(parts);
  wr.str(`${f5(k)} 0 0 ${f5(k)} ${f2(tx)} ${f2(ty)} cm\n1 j\n`);
  for (let pi = 0; pi < P.length; pi++) {
    const p = P[pi], items = buckets[p.src];
    if (onPass) onPass(pi, P.length);
    if (p.kind === 'shore') { wr.flush(); if (win) parts.push(shoreOps(g, win, p.xf)); continue; }
    if (!items.length) continue;
    const sp = makeSpec(p.xf, k), rgb = hexrgb(p.hex || '#000000');
    if (p.kind === 'fill') {
      if (p.outline) { wr.str(`${rgb} rg ${hexrgb(p.outline)} RG ${f5(p.ow == null ? .22 * ws : p.ow / k)} w [] 0 d\n`); await emitXf(wr, items, sp, 'B*\n', false, wait); }
      else { wr.str(`${rgb} rg\n`); await emitXf(wr, items, sp, 'f*\n', false, wait); }
    } else if (p.kind === 'shadow') {
      const so = shadowOff(k) / k;
      wr.str(`q 1 0 0 1 ${f5(so)} ${f5(-so)} cm ${rgb} rg\n`);
      await emitXf(wr, items, sp, 'f*\n', false, wait);
      wr.str('Q\n');
    } else if (p.kind === 'pattern') {
      wr.str(`/Pattern cs /${p.pat.id} scn\n`);
      await emitXf(wr, items, sp, 'f*\n', false, wait);
    } else {
      const d = p.dash ? `[${f5(p.dash * ws)} ${f5(p.dash * ws)}] 0 d ` : '';
      wr.str(`q ${p.butt ? 0 : 1} J ${d}${rgb} RG ${f5(Math.max(p.width * (p.wmul || 1) * ws, (p.wmin || 0) / k))} w\n`);
      await emitXf(wr, items, sp, '', true, wait);
      wr.str('Q\n');
    }
  }
  wr.flush();
}
/* Detail level filter for collect(): smallest building to keep (base units) and whether merged building masses replace buildings */
function detailFilter(g) {
  const minPt = Math.max(state.detail === 'simple' ? SIMPLE_BLDG_PT : 0, state.draw === 'block' ? BLOCK_BLDG_PT : 0);
  return minPt || state.detail === 'simple' ? { minB: minPt / g.k, blocks: state.detail === 'simple' } : null;
}

function drawPatternTile(ctx, pat) {
  if (pat.type === 'trees') {
    for (const [x, y] of [[8, 10], [27, 7], [18, 24], [34, 28], [6, 33]]) {
      ctx.fillStyle = pat.c1; ctx.beginPath(); ctx.rect(x - .45, y + 2, .9, 3); ctx.fill();
      circ(ctx, x, y, 3.3); ctx.fill();
      ctx.fillStyle = pat.c2; circ(ctx, x - .9, y - 1, 1.3); ctx.fill();
    }
  } else if (pat.type === 'hatch') {
    drawHatch(ctx, pat);
  } else {
    ctx.strokeStyle = pat.c1; ctx.lineWidth = .8; ctx.lineCap = 'round';
    for (const [x, y] of [[6, 12], [26, 32]]) {
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 2, y - 2.4, x + 4, y - 2.4, x + 6, y);
      ctx.bezierCurveTo(x + 8, y + 2.4, x + 10, y + 2.4, x + 12, y);
      ctx.stroke();
    }
  }
}

const rng32 = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
/* Pencil hatching: parallel, slightly irregular lines (0, 90, 45 or -45 degrees). Each line's offset and wobble depend only
   on its index modulo the line count, and the wobble has a whole number of waves per tile, so the tiles join seamlessly. */
function drawHatch(ctx, pat) {
  const T = pat.T, n = pat.n, d = T / n, S = 16, rnd = rng32(pat.seed || 1);
  ctx.strokeStyle = pat.c1; ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
  for (const ang of pat.ang) {
    const jit = [], ph = [];
    for (let m = 0; m < n; m++) { jit.push((rnd() - .5) * d * .6); ph.push(rnd() * 6.2832); }
    const diag = ang === 45 || ang === -45, A = d * .16, J = diag ? 1 : 2;
    for (let grp = 0; grp < 2; grp++) {
      ctx.lineWidth = pat.lw * (grp ? 1.15 : .8);
      ctx.beginPath();
      for (let m = diag ? -n - 1 : -1; m <= (diag ? n + 1 : n); m++) {
        const mi = ((m % n) + n) % n;
        if ((mi & 1) !== grp) continue;
        if (!diag) {
          const c = m * d + d / 2 + jit[mi];
          for (let i = 0; i <= S; i++) {
            const u = -1 + (T + 2) * i / S, v = c + A * Math.sin(6.2832 * J * u / T + ph[mi]);
            const x = ang === 0 ? u : v, y = ang === 0 ? v : u;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
        } else {
          const c = m * d + jit[mi], ac = Math.abs(c);
          if (ac >= T + 1) continue;
          const u0 = ac - 1.5, u1 = 2 * T - ac + 1.5, N = Math.max(2, Math.round(S * (u1 - u0) / T));
          for (let i = 0; i <= N; i++) {
            const u = u0 + (u1 - u0) * i / N, dl = A * Math.sin(6.2832 * J * u / T + ph[mi]);
            let x = (u + c) / 2 + dl * .7071; const y = (u - c) / 2 - dl * .7071;
            if (ang === -45) x = T - x;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
        }
      }
      ctx.stroke();
    }
  }
}

/* lat/lon -> base map coordinates (same projection as the data build) */
const LIVE = window.LIVE;           // set when the map is of somewhere else, downloaded live (see live.js); null for Louisville
const PROJ = LIVE ? LIVE.proj.fwd : window.makeProj(38.185, -85.675, M.size).fwd;
const PLACES = LIVE ? [] : [
  ['Downtown', 38.2545, -85.7585], ['NuLu', 38.2530, -85.7385], ['Butchertown', 38.2590, -85.7290],
  ['Old Louisville', 38.2300, -85.7640], ['The Highlands', 38.2330, -85.7090], ['Germantown', 38.2290, -85.7350],
  ['Clifton', 38.2560, -85.7090], ['Crescent Hill', 38.2530, -85.6890], ['St. Matthews', 38.2530, -85.6560],
  ['Portland', 38.2680, -85.7950], ['Shawnee', 38.2600, -85.8250], ['Churchill Downs', 38.2030, -85.7700],
  ['Iroquois Park', 38.1640, -85.7850], ['Audubon Park', 38.2050, -85.7270], ['Cherokee Park', 38.2400, -85.6950],
  ['Lyndon', 38.2570, -85.6020], ['Jeffersontown', 38.1940, -85.5640], ['Middletown', 38.2450, -85.5390],
  ['Fern Creek', 38.1600, -85.5900], ['Okolona', 38.1410, -85.6880], ['Pleasure Ridge Park', 38.1450, -85.8580],
  ['Prospect', 38.3450, -85.6150], ['Jeffersonville, IN', 38.2775, -85.7370], ['New Albany, IN', 38.2855, -85.8240],
];
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const state = {
  wallW: 120, wallH: 120, paper: 'letter', orient: 'auto',
  whole: false,                                 // whole sheets: snap the finished size to a whole number of full pages
  zoom: 1, cx: M.size / 2, cy: M.size / 2,
  border: true, compass: true, rings: true, grid: true,
  theme: 'classic', trees: false, waves: false, shadows: false,
  title: '', subtitle: '', tpos: 'br',          // optional title block: tpos is 'br' | 'bc' | 'tc'
  markers: [],                                  // [{ t: 'heart'|'star'|'house'|'pin', x, y }] in base coordinates
  hood: '',                                     // name of the highlighted neighborhood or city ('' = none)
  labStreets: false, labPlaces: false,          // optional street names / neighborhood and city names
  terrain: false, terrainAmt: 60,               // optional terrain shading and its strength in percent
  draw: 'clean', detail: 'full',                // drawing technique 'clean' | 'ink' | 'pencil' | 'block'; detail level 'full' | 'simple'
  lettering: 'plain',                           // type for names and the title: 'plain' | 'hand' | 'antique'
  landmarks: false,                             // small drawings of well-known places
  shore: false, hachure: false, ornate: false,  // old-chart details: shore lines in the water, hachured hills, ornate compass and ribbon title
};

/* ------------------------------------------------------------ layout */
const EDGE = 36;             // white paper border around the finished map: 0.5 in
/* How much map each column (or row) of pages carries. Every page is filled to its full printable width `full`;
   only the last one takes what is left. If that would be a thin sliver, the last two share their total equally.
   Returns the sizes and the offsets of each start. */
function spans(total, full, n) {
  if (n === 1) return { size: [total], start: [0] };
  const size = Array(n).fill(full);
  const rem = total - (n - 1) * full;
  if (rem < full / 2) size[n - 2] = size[n - 1] = (full + rem) / 2; else size[n - 1] = rem;
  const start = [0];
  for (let i = 1; i < n; i++) start.push(start[i - 1] + size[i - 1]);
  return { size, start };
}
function layout() {
  const [short, long] = PAPERS[state.paper] || PAPERS.letter;
  const reqW = state.wallW * 72 - 2 * EDGE, reqH = state.wallH * 72 - 2 * EDGE;   // the map size asked for
  const opts = [];
  for (const [pw, ph, name] of [[short, long, 'portrait'], [long, short, 'landscape']]) {
    if (state.orient !== 'auto' && state.orient !== name) continue;
    const fw = pw - 2 * EDGE, fh = ph - 2 * EDGE;          // the most map one page can carry
    let cols, rows, mapW, mapH;
    if (state.whole) {
      // whole sheets: the nearest whole number of full pages each way, so every page is full and none is cut short
      cols = Math.max(1, Math.round(reqW / fw)); rows = Math.max(1, Math.round(reqH / fh));
      mapW = cols * fw; mapH = rows * fh;
    } else {
      // one column or row is allowed when the map fits; the page code then centres the map on the sheet
      cols = Math.max(1, Math.ceil(reqW / fw - 1e-9)); rows = Math.max(1, Math.ceil(reqH / fh - 1e-9));
      mapW = reqW; mapH = reqH;
    }
    const sx = spans(mapW, fw, cols), sy = spans(mapH, fh, rows);
    // colW/colX: width and left offset of each column; rowH/rowY: height and top offset of each row (row A at the top)
    opts.push({ W: mapW + 2 * EDGE, H: mapH + 2 * EDGE, pw, ph, name, cols, rows, colW: sx.size, colX: sx.start, rowH: sy.size, rowY: sy.start,
      advX: Math.max(...sx.size), advY: Math.max(...sy.size), mx: EDGE, my: EDGE, mapW, mapH,
      off: Math.abs(mapW - reqW) + Math.abs(mapH - reqH) });
  }
  // fewest pages; with whole sheets, first the direction that comes closest to the size asked for
  opts.sort((a, b) => (state.whole ? a.off - b.off : 0) || a.cols * a.rows - b.cols * b.rows);
  return opts[0];
}

function geom() {
  const L = layout();
  const minK = Math.max(L.mapW, L.mapH) / M.size;
  const maxZoom = Math.max(1.5, MAXK / minK);
  state.zoom = clamp(state.zoom, 1, maxZoom);
  const k = minK * state.zoom;
  const vw = L.mapW / k, vh = L.mapH / k;
  state.cx = clamp(state.cx, vw / 2, M.size - vw / 2);
  state.cy = clamp(state.cy, vh / 2, M.size - vh / 2);
  const o = clamp(Math.pow(Math.min(L.mapW, L.mapH) / M.size, 0.75), 0.28, 1.25);
  return Object.assign(L, { k, vw, vh, x0: state.cx - vw / 2, y0: state.cy - vh / 2, o, minK, maxZoom });
}

/* ------------------------------------------------------------ overlay
   Drawn through the Canvas2D API subset; PdfCtx below implements the same
   subset so the preview and the PDF share one drawing routine.
   Coordinates: points, origin at the map's top-left, y down. */
function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); }

function fleur(ctx, cx, cy, h, angDeg, fill) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-angDeg * Math.PI / 180);
  ctx.scale(h, -h);
  ctx.fillStyle = fill;
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(s * .10, -.10);
    ctx.bezierCurveTo(s * .15, .12, s * .30, .44, s * .53, .46);
    ctx.bezierCurveTo(s * .74, .48, s * .86, .28, s * .80, .10);
    ctx.bezierCurveTo(s * .76, -.02, s * .63, -.08, s * .54, -.02);
    ctx.bezierCurveTo(s * .62, .02, s * .66, .14, s * .59, .21);
    ctx.bezierCurveTo(s * .50, .29, s * .40, .20, s * .35, .08);
    ctx.bezierCurveTo(s * .32, 0, s * .30, -.05, s * .29, -.10);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * .11, -.26); ctx.lineTo(s * .29, -.26);
    ctx.bezierCurveTo(s * .31, -.36, s * .38, -.44, s * .50, -.47);
    ctx.bezierCurveTo(s * .36, -.54, s * .19, -.48, s * .11, -.26);
    ctx.closePath(); ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.bezierCurveTo(.10, .82, .27, .58, .25, .32);
  ctx.bezierCurveTo(.23, .12, .12, 0, .07, -.10);
  ctx.lineTo(-.07, -.10);
  ctx.bezierCurveTo(-.12, 0, -.23, .12, -.25, .32);
  ctx.bezierCurveTo(-.27, .58, -.10, .82, 0, 1);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-.07, -.26); ctx.lineTo(.07, -.26);
  ctx.bezierCurveTo(.10, -.42, .06, -.62, 0, -.80);
  ctx.bezierCurveTo(-.06, -.62, -.10, -.42, -.07, -.26);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.rect(-.34, -.245, .68, .13); ctx.fill();
  ctx.restore();
}

function compass(ctx, cx, cy, r, pal) {
  const ink = pal.ink, gold = pal.gold, white = pal.paper;
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.globalAlpha = .88; ctx.fillStyle = white; circ(ctx, cx, cy, r * 1.34); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ink;
  ctx.lineWidth = r * .012; circ(ctx, cx, cy, r * 1.30); ctx.stroke();
  ctx.lineWidth = r * .004; circ(ctx, cx, cy, r * 1.26); ctx.stroke();
  circ(ctx, cx, cy, r * .80); ctx.stroke();
  ctx.strokeStyle = gold; ctx.lineWidth = r * .01; circ(ctx, cx, cy, r * .84); ctx.stroke();
  ctx.strokeStyle = ink;
  for (let d = 0; d < 360; d += 5) {
    const a = d * Math.PI / 180, major = d % 15 === 0;
    const r0 = r * (major ? .84 : .86), r1 = r * (major ? .94 : .90);
    ctx.lineWidth = r * (major ? .007 : .003);
    ctx.beginPath();
    ctx.moveTo(cx + r0 * Math.sin(a), cy - r0 * Math.cos(a));
    ctx.lineTo(cx + r1 * Math.sin(a), cy - r1 * Math.cos(a));
    ctx.stroke();
  }
  const star = (n, off, len, half, dark) => {
    for (let i = 0; i < n; i++) {
      const a = (off + i * 360 / n) * Math.PI / 180;
      for (const [sg, col] of [[1, dark], [-1, white]]) {
        const b = a + sg * Math.PI / n;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + half * Math.sin(b), cy - half * Math.cos(b));
        ctx.lineTo(cx + len * Math.sin(a), cy - len * Math.cos(a));
        ctx.closePath();
        ctx.fillStyle = col; ctx.strokeStyle = ink; ctx.lineWidth = r * .004;
        ctx.fill(); ctx.stroke();
      }
    }
  };
  star(8, 22.5, r * .56, r * .10, gold);
  star(4, 45, r * .78, r * .16, pal.accent);
  star(4, 0, r * 1.08, r * .20, ink);
  ctx.fillStyle = white; ctx.strokeStyle = ink; ctx.lineWidth = r * .008;
  circ(ctx, cx, cy, r * .07); ctx.fill(); ctx.stroke();
  ctx.fillStyle = gold; circ(ctx, cx, cy, r * .03); ctx.fill();
  ctx.globalAlpha = .92; ctx.fillStyle = white; circ(ctx, cx, cy - r * 1.30, r * .22); ctx.fill();
  ctx.globalAlpha = 1; ctx.lineWidth = r * .006; ctx.stroke();
  fleur(ctx, cx, cy - r * 1.285, r * .15, 0, pal.accent);
  ctx.restore();
}

/* The ornate compass rose (Old chart details): a 32-point rose whose points alternate solid and hatched halves, a pearl band,
   concentric rings and a decorated north fleur-de-lis. Same footprint as the plain rose. */
function compassOrnate(ctx, cx, cy, r, pal) {
  const ink = pal.ink, gold = pal.gold, white = pal.paper, acc = pal.accent;
  const pt = (rad, deg) => [cx + rad * Math.sin(deg * Math.PI / 180), cy - rad * Math.cos(deg * Math.PI / 180)];
  const ring = (rad, lw, col) => { ctx.strokeStyle = col; ctx.lineWidth = r * lw; ctx.setLineDash([]); circ(ctx, cx, cy, r * rad); ctx.stroke(); };
  ctx.save();
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  ctx.globalAlpha = .9; ctx.fillStyle = white; circ(ctx, cx, cy, r * 1.34); ctx.fill();
  ctx.globalAlpha = 1;
  ring(1.30, .016, ink); ring(1.265, .005, ink); ring(1.115, .008, gold); ring(1.095, .003, ink);
  for (let i = 0; i < 32; i++) {                                                           // pearl band
    const [x, y] = pt(r * 1.19, i * 11.25);
    ctx.fillStyle = i % 2 ? gold : ink; circ(ctx, x, y, r * (i % 8 === 0 ? .034 : .02)); ctx.fill();
  }
  for (let i = 0; i < 4; i++) {                                                            // a diamond at each intercardinal point
    const a = 45 + i * 90, [x, y] = pt(r * 1.19, a), s = r * .06;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a * Math.PI / 180);
    ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(s * .8, 0); ctx.lineTo(0, s * 1.3); ctx.lineTo(-s * .8, 0); ctx.closePath();
    ctx.fillStyle = acc; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = r * .005; ctx.stroke();
    ctx.restore();
  }
  ring(.96, .004, ink); ring(.80, .007, ink); ring(.84, .009, gold);
  ctx.strokeStyle = ink;
  for (let d = 0; d < 360; d += 2.5) {                                                     // degree scale
    const a = d * Math.PI / 180, big = d % 15 === 0, mid = d % 5 === 0;
    const r0 = r * (big ? .85 : .87), r1 = r * (big ? .96 : mid ? .93 : .915);
    ctx.lineWidth = r * (big ? .007 : mid ? .0045 : .0025);
    ctx.beginPath(); ctx.moveTo(cx + r0 * Math.sin(a), cy - r0 * Math.cos(a)); ctx.lineTo(cx + r1 * Math.sin(a), cy - r1 * Math.cos(a)); ctx.stroke();
  }
  /* the points: each is a kite split down its axis; one half solid, the other paper with fine hatching along the axis */
  const star = (n, off, len, half, solid, parity) => {
    for (let i = 0; i < n; i++) {
      const a = (off + i * 360 / n) * Math.PI / 180;
      for (const sg of [1, -1]) {
        const b = a + sg * Math.PI / n, plain = (i + (sg > 0 ? 0 : 1) + parity) % 2 === 0;
        const tri = () => {
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.lineTo(cx + half * Math.sin(b), cy - half * Math.cos(b));
          ctx.lineTo(cx + len * Math.sin(a), cy - len * Math.cos(a));
          ctx.closePath();
        };
        tri(); ctx.fillStyle = plain ? solid : white; ctx.fill();
        if (!plain) {
          ctx.save(); tri(); ctx.clip();
          ctx.strokeStyle = ink; ctx.lineWidth = r * .0035;
          const nl = Math.max(2, Math.round(half / (r * .028))), dx = Math.sin(a), dy = -Math.cos(a), px = -dy, py = dx;
          for (let j = 1; j <= nl; j++) {                                                  // lines parallel to the point's axis, on the hatched side
            const o = sg * half * Math.cos(Math.PI / n) * j / (nl + 1) * 1.05;
            ctx.beginPath(); ctx.moveTo(cx + px * o, cy + py * o); ctx.lineTo(cx + px * o + dx * len, cy + py * o + dy * len); ctx.stroke();
          }
          ctx.restore();
        }
        tri(); ctx.strokeStyle = ink; ctx.lineWidth = r * .004; ctx.stroke();
      }
    }
  };
  star(16, 11.25, r * .46, r * .06, acc, 1);
  star(8, 22.5, r * .66, r * .095, ink, 0);
  star(4, 45, r * .84, r * .13, acc, 0);
  star(4, 0, r * 1.10, r * .20, ink, 0);
  ctx.fillStyle = white; ctx.strokeStyle = ink; ctx.lineWidth = r * .008;
  circ(ctx, cx, cy, r * .085); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = gold; ctx.lineWidth = r * .008; circ(ctx, cx, cy, r * .055); ctx.stroke();
  ctx.fillStyle = ink; circ(ctx, cx, cy, r * .022); ctx.fill();
  for (const a of [90, 180, 270]) {                                                         // small medallions at east, south and west
    const [x, y] = pt(r * 1.30, a);
    ctx.fillStyle = white; ctx.strokeStyle = ink; ctx.lineWidth = r * .006; circ(ctx, x, y, r * .1); ctx.fill(); ctx.stroke();
    ctx.fillStyle = gold; circ(ctx, x, y, r * .05); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = r * .004; circ(ctx, x, y, r * .05); ctx.stroke();
  }
  const ny = cy - r * 1.30, nr = r * .25;                                                  // the north medallion
  ctx.globalAlpha = .96; ctx.fillStyle = white; circ(ctx, cx, ny, nr * 1.08); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = ink; ctx.lineWidth = r * .01; circ(ctx, cx, ny, nr * 1.08); ctx.stroke();
  ctx.lineWidth = r * .004; circ(ctx, cx, ny, nr * .92); ctx.stroke();
  ctx.strokeStyle = gold; ctx.lineWidth = r * .006; circ(ctx, cx, ny, nr * 1.0); ctx.stroke();
  ctx.strokeStyle = ink; ctx.lineWidth = r * .004;
  for (let i = 0; i < 24; i++) {                                                            // a ring of rays around the medallion
    const a = i * Math.PI / 12, r0 = nr * 1.1, r1 = nr * (i % 2 ? 1.2 : 1.3);
    ctx.beginPath(); ctx.moveTo(cx + r0 * Math.sin(a), ny - r0 * Math.cos(a)); ctx.lineTo(cx + r1 * Math.sin(a), ny - r1 * Math.cos(a)); ctx.stroke();
  }
  fleur(ctx, cx, ny + nr * .06, r * .19, 0, acc);
  ctx.restore();
}

/* ---- text support shared by the preview and the PDF.
   The PDF uses the standard Type1 fonts (Helvetica, Times), so only WinAnsi characters can be printed.
   Widths are measured on a canvas with Arial / Times New Roman, which are metric-compatible with them. */
const CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89,
  0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96,
  0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
const winAnsi = s => [...String(s)].map(ch => {
  const c = ch.codePointAt(0);
  return (c >= 32 && c < 127) || (c >= 160 && c < 256) || CP1252[c] ? ch : '?';
}).join('');
const pdfStr = s => {                       // PDF literal string body: escapes ( ) \ and writes non-ASCII as octal bytes
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0), b = CP1252[c] || c;
    if (b === 40 || b === 41 || b === 92) out += '\\' + ch;
    else if (b < 32 || b > 126) out += '\\' + b.toString(8).padStart(3, '0');
    else out += ch;
  }
  return out;
};
const SERIF = '"Times New Roman", Times, serif', SANS = 'Arial, Helvetica, sans-serif';
const tmeas = document.createElement('canvas').getContext('2d');
/* The two lettering fonts (see the "Lettering" section) are measured from the advance widths in their JSON files, never by the
   browser, so the PDF layout, the preview and the PNG agree exactly. */
const LETTER_FONT = /^\s*(?:(?:bold|italic|oblique|normal|[1-9]00)\s+)*[\d.]+px\s+(MMHand|MMAntique)\b/;
const letterMeta = {};                          // 'MMHand' | 'MMAntique' -> parsed JSON, once loaded
const ansiByte = ch => { const c = ch.codePointAt(0); return CP1252[c] || c; };
const textW = (font, s) => {
  const lm = LETTER_FONT.exec(font);
  if (lm && letterMeta[lm[1]]) {
    const meta = letterMeta[lm[1]], size = parseFloat(/([\d.]+)px/.exec(font)[1]) || 10;
    let w = 0;
    for (const ch of s) { const i = ansiByte(ch) - meta.firstChar; w += i >= 0 && meta.widths[i] ? meta.widths[i] : 0; }
    return w * size / meta.unitsPerEm;
  }
  tmeas.font = font; return tmeas.measureText(s).width;
};
/* map a CSS-like font string ("bold 12px "Times New Roman", serif") to a PDF font resource name and size */
function pdfFont(font) {
  const m = /([\d.]+)px\s*(.*)$/.exec(font) || [];
  const size = parseFloat(m[1]) || 10, fam = m[2] || '';
  const bold = /\b(bold|[6-9]00)\b/.test(font), ital = /\b(italic|oblique)\b/.test(font);
  if (/^\s*["']?MMHand/.test(fam)) return { key: 'F6', size };
  if (/^\s*["']?MMAntique/.test(fam)) return { key: 'F7', size };
  if (/^\s*["']?(Times|Georgia|serif)/i.test(fam)) return { key: bold ? 'F4' : ital ? 'F5' : 'F3', size };
  return { key: bold ? 'F2' : 'F1', size };
}

/* ------------------------------------------------------------ lettering (optional)
   Two bundled fonts, loaded only when chosen: the preview gets them through the FontFace API, the PDF embeds the TrueType
   file once per document. `letterMeta` (advance widths) is filled when a font is ready, so until then the plain type is
   used everywhere, and everything is laid out again when the font arrives. */
const LETTERINGS = {
  hand: { css: 'MMHand', file: 'patrickhand', key: 'F6', generic: 'cursive', fix: 1.1 },
  antique: { css: 'MMAntique', file: 'imfell', key: 'F7', generic: 'serif', fix: 1.05 },
};
const LETTER_KEYS = ['plain', 'hand', 'antique'];
const activeLetter = () => { const L = LETTERINGS[state.lettering]; return L && letterMeta[L.css] ? L : null; };
const letterFont = (L, size) => `${f5(size)}px ${L.css}, ${L.generic}`;
const letterLoads = {};
function loadLetter(key) {
  const L = LETTERINGS[key];
  if (!L) return Promise.resolve(null);
  if (!letterLoads[key]) {
    letterLoads[key] = (async () => {
      const [jr, tr] = await Promise.all([fetch(`fonts/${L.file}.json`), fetch(`fonts/${L.file}.ttf`)]);
      if (!jr.ok || !tr.ok) throw new Error('Could not load the lettering font.');
      const meta = await jr.json(), bytes = new Uint8Array(await tr.arrayBuffer());
      if (!meta || !Array.isArray(meta.widths) || meta.widths.length !== meta.lastChar - meta.firstChar + 1 || !(meta.unitsPerEm > 0) || bytes.length < 1000) throw new Error('The lettering font file is not usable.');
      const ff = new FontFace(L.css, bytes.slice().buffer);
      await ff.load();
      document.fonts.add(ff);
      L.bytes = bytes; L.meta = meta;
      letterMeta[L.css] = meta;
      return L;
    })().catch(err => { delete letterLoads[key]; throw err; });
  }
  return letterLoads[key];
}
/* after a lettering font arrives or the choice changes: lay the names out again */
function letteringChanged() {
  labelState.key = '';
  schedule();
}

/* the Ohio River's centre line (base coordinates, from the dissolved water polygon in art/water.bin) for the river name */
const RIVER_W = 88;                              // typical width of the river in base units
const RIVER = (() => {
  const a = [11, 720, 146, 787, 262, 884, 366, 995, 449, 1121, 502, 1263, 530, 1412, 543, 1563, 558, 1714, 575, 1864, 608, 2012, 652, 2157, 702, 2300, 743, 2446,
    762, 2596, 762, 2748, 744, 2898, 722, 3048, 709, 3199, 697, 3350, 693, 3502, 700, 3653, 708, 3804, 731, 3954, 777, 4098, 844, 4234, 920, 4365, 1003, 4492,
    1094, 4613, 1198, 4723, 1312, 4823, 1429, 4920, 1541, 5021, 1639, 5137, 1719, 5266, 1774, 5406, 1797, 5556, 1807, 5707, 1818, 5858, 1874, 5998, 1950, 6129,
    2074, 6212, 2220, 6254, 2370, 6270, 2521, 6282, 2664, 6238, 2777, 6140, 2861, 6015, 2989, 5936, 3137, 5906, 3287, 5920, 3424, 5983, 3549, 6068, 3675, 6153,
    3801, 6237, 3931, 6316, 4061, 6393, 4191, 6472, 4313, 6561, 4411, 6675, 4497, 6791, 4590, 6911, 4647, 7046, 4683, 7079, 4730, 7190, 4778, 7334, 4823, 7479,
    4872, 7622, 4918, 7767, 4957, 7913, 4979, 8063, 5002, 8213, 5026, 8362, 5051, 8512, 5088, 8659];
  let p = a;
  for (let it = 0; it < 2; it++) {                // Chaikin corner cutting: a smooth curve through the hand-made points
    const q = [p[0], p[1]];
    for (let i = 0; i + 3 < p.length; i += 2) {
      q.push(.75 * p[i] + .25 * p[i + 2], .75 * p[i + 1] + .25 * p[i + 3], .25 * p[i] + .75 * p[i + 2], .25 * p[i + 1] + .75 * p[i + 3]);
    }
    q.push(p[p.length - 2], p[p.length - 1]);
    p = q;
  }
  return p;
})();
const waterFill = () => {
  const T = THEMES[state.theme], b = (T.colors && T.colors.water) || BASEHEX.water;
  return state.draw === 'pencil' ? pencilGrey(b, .5) : b;
};
/* a darker (or, on dark water, lighter) tone of the water for lettering and fine lines */
const waterInk = (hex, f) => (lumOf(hex) > .3 ? shade(hex, -f) : shade(hex, f));

function drawMarker(ctx, t, x, y, s, pal) {
  ctx.save();
  ctx.translate(x, t === 'pin' ? y - s * .5 : y);      // a pin points at its spot with its tip
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (t === 'heart') {
    ctx.moveTo(0, .46);
    ctx.bezierCurveTo(-.14, .33, -.5, .06, -.5, -.2);
    ctx.bezierCurveTo(-.5, -.45, -.15, -.5, 0, -.22);
    ctx.bezierCurveTo(.15, -.5, .5, -.45, .5, -.2);
    ctx.bezierCurveTo(.5, .06, .14, .33, 0, .46);
  } else if (t === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5, r = i % 2 ? .22 : .5;
      if (i) ctx.lineTo(r * Math.sin(a), -r * Math.cos(a) + .04); else ctx.moveTo(r * Math.sin(a), -r * Math.cos(a) + .04);
    }
  } else if (t === 'house') {
    ctx.moveTo(0, -.5); ctx.lineTo(.5, -.04); ctx.lineTo(.36, -.04); ctx.lineTo(.36, .46);
    ctx.lineTo(-.36, .46); ctx.lineTo(-.36, -.04); ctx.lineTo(-.5, -.04);
  } else {
    ctx.moveTo(0, .5);
    ctx.bezierCurveTo(-.12, .28, -.34, .12, -.34, -.12);
    ctx.bezierCurveTo(-.34, -.34, -.18, -.5, 0, -.5);
    ctx.bezierCurveTo(.18, -.5, .34, -.34, .34, -.12);
    ctx.bezierCurveTo(.34, .12, .12, .28, 0, .5);
  }
  ctx.closePath();
  ctx.lineWidth = .17; ctx.strokeStyle = pal.paper; ctx.stroke();
  ctx.fillStyle = pal.accent; ctx.fill();
  if (t === 'house') { ctx.fillStyle = pal.paper; ctx.beginPath(); ctx.rect(-.085, .14, .17, .32); ctx.fill(); }
  if (t === 'pin') { ctx.fillStyle = pal.paper; circ(ctx, 0, -.14, .13); ctx.fill(); }
  ctx.restore();
}

/* ------------------------------------------------------------ landmark drawings (optional)
   One small drawing per well-known place (art/landmarks.json), drawn through the shared Canvas subset so the preview, the PDF
   and the PNG agree. Each icon is designed in a unit box (centre 0,0, y down, a round medallion of radius 1) and scaled; line
   work is ink, shapes are filled with the paper colour, the accent colour or its softer partner, so it suits every style. */
let landmarkData = null, landmarkPromise = null;
function loadLandmarks() {
  if (!landmarkPromise) {
    landmarkPromise = fetch('art/landmarks.json').then(r => { if (!r.ok) throw new Error('Could not load the landmark list (' + r.status + ')'); return r.json(); })
      .then(a => {
        landmarkData = (Array.isArray(a) ? a : []).filter(q => q && typeof q.kind === 'string' && ICONS[q.kind] && Number.isFinite(q.x) && Number.isFinite(q.y));
        const rank = id => { const i = LM_ORDER.indexOf(id); return i < 0 ? 999 : i; };
        landmarkData.sort((p, q) => rank(p.id) - rank(q.id));
        schedule();
      }).catch(err => { landmarkPromise = null; throw err; });
  }
  return landmarkPromise;
}
/* the most important first: when two drawings would overlap, the earlier one stays */
const LM_ORDER = ['churchill-downs', 'louisville-slugger-museum', 'belle-of-louisville', 'big-four-bridge', 'louisville-zoo', 'kfc-yum-center', 'louisville-airport',
  'speed-art-museum', 'university-of-louisville', 'louisville-water-tower', 'st-james-court-fountain', 'cherokee-park', 'falls-of-the-ohio', 'muhammad-ali-center',
  'locust-grove', 'colgate-clock', 'louisville-slugger-field', 'lynn-family-stadium', 'l-and-n-stadium', 'kentucky-expo-center', 'clark-memorial-bridge',
  'waterfront-park', 'iroquois-park', 'bowman-field'];
/* which drawings are shown, and where: [{ d, x, y, s }] with frame coordinates and s = medallion diameter in points */
function landmarkItems(g) {
  if (!landmarkData) return [];
  const { mapW, mapH, k, o } = g;
  const s = Math.max(24, 66 * o * clamp(Math.pow(k / g.minK, .2), 1, 1.5));
  const out = [];
  for (const d of landmarkData) {
    const x = (d.x - g.x0) * k, y = mapH - (d.y - g.y0) * k;
    if (x < -s || x > mapW + s || y < -s || y > mapH + s) continue;
    if (out.some(q => Math.hypot(q.x - x, q.y - y) < s * 1.02)) continue;
    out.push({ d, x, y, s });
  }
  return out;
}
function drawLandmarks(ctx, g, pal) {
  const items = landmarkItems(g);
  if (!items.length) return;
  const mix = mixHex(pal.paper, pal.ink, .3);
  const P = { ink: pal.ink, paper: pal.paper, acc: pal.accent, sec: pal.gold === pal.ink ? mix : pal.gold, gold: pal.gold };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const it of items.slice().reverse()) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.scale(it.s / 2, it.s / 2);
    ctx.globalAlpha = .86; ctx.fillStyle = pal.paper; circ(ctx, 0, 0, 1); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = pal.gold; ctx.lineWidth = .045; ctx.setLineDash([]); circ(ctx, 0, 0, .965); ctx.stroke();
    ctx.lineWidth = LW; ctx.strokeStyle = pal.ink;
    ICONS[it.d.kind](ctx, P);
    ctx.restore();
  }
  ctx.restore();
}
const LW = .05;
/* small drawing helpers; every shape is outlined in ink */
const sh = (c, pts, fill) => { c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } c.stroke(); };
const ln = (c, pts) => { c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke(); };
const rc = (c, x, y, w, h, fill) => { c.beginPath(); c.rect(x, y, w, h); if (fill) { c.fillStyle = fill; c.fill(); } c.stroke(); };
const ell = (c, x, y, rx, ry, fill, line = true) => {
  const k = .5522847498;
  c.beginPath(); c.moveTo(x + rx, y);
  c.bezierCurveTo(x + rx, y + k * ry, x + k * rx, y + ry, x, y + ry); c.bezierCurveTo(x - k * rx, y + ry, x - rx, y + k * ry, x - rx, y);
  c.bezierCurveTo(x - rx, y - k * ry, x - k * rx, y - ry, x, y - ry); c.bezierCurveTo(x + k * rx, y - ry, x + rx, y - k * ry, x + rx, y);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (line) c.stroke();
};
const dot = (c, x, y, r, fill) => { c.fillStyle = fill; circ(c, x, y, r); c.fill(); };
/* a cluster of circles drawn as one outlined blob: outlines first, then the fills hide the lines inside */
const blob = (c, cs, fill) => {
  const w = c.lineWidth; c.lineWidth = w * 2;
  for (const [x, y, r] of cs) { circ(c, x, y, r); c.stroke(); }
  c.lineWidth = w; c.fillStyle = fill;
  for (const [x, y, r] of cs) { circ(c, x, y, r); c.fill(); }
};
const wave = (c, x0, x1, y, n, a) => {
  c.beginPath(); c.moveTo(x0, y);
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) c.bezierCurveTo(x0 + w * (i + .33), y - a * (i % 2 ? -1 : 1), x0 + w * (i + .66), y - a * (i % 2 ? -1 : 1), x0 + w * (i + 1), y);
  c.stroke();
};
const ICONS = {
  /* twin spires over a grandstand */
  racetrack(c, P) {
    ln(c, [[-.74, .56], [.74, .56]]);
    rc(c, -.7, .12, 1.4, .44, P.paper);
    sh(c, [[-.76, .12], [.76, .12], [.68, 0], [-.68, 0]], P.sec);
    for (let i = 0; i < 7; i++) rc(c, -.6 + i * .19, .26, .1, .13, P.ink);
    for (const sx of [-.3, .3]) {
      rc(c, sx - .13, -.3, .26, .3, P.paper);
      rc(c, sx - .03, -.2, .06, .12, P.ink);
      sh(c, [[sx - .18, -.3], [sx + .18, -.3], [sx, -.7]], P.acc);
      ln(c, [[sx, -.7], [sx, -.82]]);
      sh(c, [[sx, -.82], [sx + .13, -.77], [sx, -.72]], P.ink);
    }
  },
  /* an arch truss bridge over the river */
  bridge(c, P) {
    wave(c, -.7, .7, .66, 5, .05);
    rc(c, -.58, .26, .1, .34, P.paper); rc(c, .48, .26, .1, .34, P.paper);
    const ay = x => .22 - .62 * (1 - (x / .64) * (x / .64));
    for (const x of [-.48, -.32, -.16, 0, .16, .32, .48]) ln(c, [[x, ay(x)], [x, .22]]);
    c.lineWidth = LW * 2.3; c.strokeStyle = P.acc;
    c.beginPath(); for (let i = 0; i <= 20; i++) { const x = -.64 + 1.28 * i / 20; if (i) c.lineTo(x, ay(x)); else c.moveTo(x, ay(x)); } c.stroke();
    c.lineWidth = LW; c.strokeStyle = P.ink;
    rc(c, -.84, .2, 1.68, .1, P.ink);
  },
  /* a baseball bat leaning, with a ball */
  bat(c, P) {
    c.save(); c.rotate(.5);
    const half = [[0, -.86], [.07, -.85], [.115, -.8], [.135, -.72], [.14, -.56], [.135, -.4], [.115, -.22], [.085, -.04], [.058, .12], [.047, .28], [.047, .58], [.062, .66], [.09, .71], [.1, .78], [.07, .84], [0, .85]];
    sh(c, half.concat(half.slice(1, -1).reverse().map(q => [-q[0], q[1]])), P.sec);
    c.strokeStyle = P.acc; c.lineWidth = LW * 1.5; ln(c, [[-.138, -.42], [.138, -.42]]); ln(c, [[-.14, -.56], [.14, -.56]]);
    c.restore();
    c.lineWidth = LW; c.strokeStyle = P.ink;
    circ(c, -.5, .44, .23); c.fillStyle = P.paper; c.fill(); c.stroke();
    c.strokeStyle = P.acc; c.lineWidth = LW * .8;
    c.beginPath(); c.moveTo(-.64, .28); c.bezierCurveTo(-.5, .36, -.5, .52, -.64, .6); c.stroke();
    c.beginPath(); c.moveTo(-.36, .28); c.bezierCurveTo(-.5, .36, -.5, .52, -.36, .6); c.stroke();
    c.strokeStyle = P.ink; c.lineWidth = LW;
  },
  /* a domed arena */
  arena(c, P) {
    ln(c, [[-.76, .56], [.76, .56]]);
    rc(c, -.72, .2, 1.44, .36, P.paper);
    for (let i = 0; i < 6; i++) {
      const x = -.6 + i * .21;
      c.beginPath(); c.moveTo(x, .56); c.lineTo(x, .43); c.bezierCurveTo(x, .32, x + .13, .32, x + .13, .43); c.lineTo(x + .13, .56); c.closePath(); c.fillStyle = P.ink; c.fill();
    }
    rc(c, -.8, .06, 1.6, .14, P.paper);
    c.beginPath(); c.moveTo(-.66, .06); c.bezierCurveTo(-.66, -.56, .66, -.56, .66, .06); c.closePath(); c.fillStyle = P.acc; c.fill(); c.stroke();
    c.lineWidth = LW * .7;
    for (const b of [-.4, -.2, .2, .4]) { c.beginPath(); c.moveTo(0, -.4); c.bezierCurveTo(b * .35, -.36, b, -.2, b, .06); c.stroke(); }
    c.lineWidth = LW;
    ln(c, [[0, -.4], [0, -.76]]); sh(c, [[0, -.76], [.22, -.69], [0, -.62]], P.ink);
  },
  /* a columned museum */
  museum(c, P) {
    sh(c, [[-.76, -.18], [0, -.66], [.76, -.18]], P.acc);
    ell(c, 0, -.34, .09, .09, P.paper);
    rc(c, -.76, -.18, 1.52, .1, P.paper);
    for (let i = 0; i < 6; i++) rc(c, -.62 + i * .248 - .045, -.08, .09, .5, P.paper);
    rc(c, -.74, .4, 1.48, .09, P.paper); rc(c, -.8, .49, 1.6, .09, P.paper);
  },
  /* a paddle-wheel steamboat */
  boat(c, P) {
    c.save(); c.translate(-.1, .02); c.scale(.9, .9); c.lineWidth = LW / .9;
    wave(c, -.78, .78, .7, 6, .045);
    sh(c, [[-.84, .24], [.5, .24], [.5, .54], [-.6, .54]], P.paper);
    rc(c, -.84, .24, 1.34, .08, P.acc);
    rc(c, -.58, .02, .96, .22, P.paper);
    for (let i = 0; i < 6; i++) rc(c, -.5 + i * .15, .08, .08, .09, P.ink);
    rc(c, -.42, -.2, .7, .22, P.paper);
    for (let i = 0; i < 4; i++) rc(c, -.34 + i * .16, -.14, .08, .09, P.ink);
    rc(c, -.2, -.36, .26, .16, P.paper);
    for (const sx of [-.34, .2]) {
      rc(c, sx - .06, -.64, .12, .44, P.acc);
      sh(c, [[sx - .1, -.7], [sx + .1, -.7], [sx + .06, -.58], [sx - .06, -.58]], P.ink);
    }
    ell(c, .56, .3, .27, .27, P.acc);
    c.strokeStyle = P.paper; c.lineWidth = LW * .7;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 6; ln(c, [[.56 + .24 * Math.cos(a), .3 + .24 * Math.sin(a)], [.56 - .24 * Math.cos(a), .3 - .24 * Math.sin(a)]]); }
    c.strokeStyle = P.ink; c.lineWidth = LW;
    dot(c, .56, .3, .05, P.ink);
    c.restore(); c.lineWidth = LW;
  },
  /* a giraffe */
  zoo(c, P) {
    ln(c, [[-.66, .68], [.66, .68]]);
    for (const x of [-.46, -.33, .1, .23]) { rc(c, x, .1, .06, .58, P.sec); rc(c, x - .005, .62, .07, .06, P.ink); }
    c.beginPath(); c.moveTo(-.5, 0); c.bezierCurveTo(-.62, .06, -.64, .26, -.58, .4); c.stroke();
    dot(c, -.58, .42, .04, P.ink);
    c.beginPath(); c.moveTo(-.54, .02);
    c.bezierCurveTo(-.5, -.14, -.2, -.15, .02, -.1);
    c.bezierCurveTo(.08, -.3, .14, -.5, .2, -.62);
    c.bezierCurveTo(.28, -.7, .46, -.68, .56, -.58);
    c.bezierCurveTo(.6, -.52, .56, -.46, .5, -.46);
    c.bezierCurveTo(.4, -.46, .34, -.44, .3, -.4);
    c.bezierCurveTo(.3, -.2, .3, -.05, .26, .06);
    c.bezierCurveTo(.2, .2, .1, .27, -.12, .27);
    c.bezierCurveTo(-.34, .27, -.54, .2, -.54, .02);
    c.closePath(); c.fillStyle = P.sec; c.fill(); c.stroke();
    ln(c, [[.26, -.68], [.24, -.8]]); ln(c, [[.35, -.68], [.37, -.8]]);
    dot(c, .24, -.82, .035, P.ink); dot(c, .37, -.82, .035, P.ink);
    dot(c, .42, -.6, .022, P.ink);
    for (const [x, y, r] of [[-.36, .0, .06], [-.18, .08, .05], [-.02, .0, .05], [-.3, .14, .04], [.08, .14, .04], [.2, -.2, .04], [.15, -.4, .035], [.14, -.02, .04], [-.46, .08, .035]]) dot(c, x, y, r, P.paper);
  },
  /* a tree and a fountain */
  park(c, P) {
    ln(c, [[-.7, .62], [.7, .62]]);
    rc(c, -.45, .18, .1, .44, P.paper);
    blob(c, [[-.4, -.12, .3], [-.62, .06, .21], [-.18, .06, .21]], P.sec);
    ell(c, .42, .56, .34, .08, P.paper);
    rc(c, .39, .26, .06, .3, P.paper);
    ell(c, .42, .26, .2, .055, P.paper);
    c.strokeStyle = P.acc; c.lineWidth = LW * 1.2;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(.42, .2); c.bezierCurveTo(.42 + s * .05, -.2, .42 + s * .28, -.1, .42 + s * .3, .24); c.stroke(); }
    ln(c, [[.42, .2], [.42, -.12]]);
    c.strokeStyle = P.ink; c.lineWidth = LW;
  },
  /* a hall with portico and a cupola */
  university(c, P) {
    ln(c, [[-.76, .58], [.76, .58]]);
    rc(c, -.74, .12, 1.48, .46, P.paper);
    for (const x of [-.64, -.52, .44, .56]) rc(c, x, .22, .08, .14, P.ink);
    rc(c, -.19, -.26, .38, .38, P.paper);
    c.beginPath(); c.moveTo(-.24, -.26); c.bezierCurveTo(-.24, -.7, .24, -.7, .24, -.26); c.closePath(); c.fillStyle = P.acc; c.fill(); c.stroke();
    ln(c, [[0, -.5], [0, -.84]]); rc(c, -.05, -.56, .1, .08, P.paper);
    sh(c, [[-.44, .14], [0, -.08], [.44, .14]], P.paper);
    for (let i = 0; i < 4; i++) rc(c, -.33 + i * .22 - .035, .14, .07, .42, P.paper);
    rc(c, -.5, .56, 1.0, .07, P.paper);
  },
  /* an oval stadium */
  stadium(c, P) {
    ell(c, 0, .22, .8, .46, P.acc);
    ell(c, 0, .1, .8, .46, P.paper);
    ell(c, 0, .1, .64, .35, P.acc);
    c.strokeStyle = P.paper; c.lineWidth = LW * .55;
    for (let i = 0; i < 28; i++) { const a = i * Math.PI / 14; ln(c, [[.64 * Math.cos(a) * .86, .1 + .35 * Math.sin(a) * .86], [.64 * Math.cos(a), .1 + .35 * Math.sin(a)]]); }
    c.strokeStyle = P.ink; c.lineWidth = LW;
    ell(c, 0, .1, .46, .24, P.sec);
    c.strokeStyle = P.paper; c.lineWidth = LW * .7;
    ln(c, [[0, -.12], [0, .32]]); ell(c, 0, .1, .1, .06, null);
    c.strokeStyle = P.ink; c.lineWidth = LW;
    for (const sx of [-.5, .5]) { ln(c, [[sx, -.2], [sx, -.62]]); rc(c, sx - .1, -.74, .2, .12, P.paper); }
  },
  /* a baseball field */
  ballpark(c, P) {
    c.beginPath(); c.moveTo(0, .54); c.lineTo(-.66, -.12); c.bezierCurveTo(-.66, -.82, .66, -.82, .66, -.12); c.closePath(); c.fillStyle = P.sec; c.fill(); c.stroke();
    c.strokeStyle = P.acc; c.lineWidth = LW * 2; c.beginPath(); c.moveTo(-.66, -.12); c.bezierCurveTo(-.66, -.82, .66, -.82, .66, -.12); c.stroke();
    c.strokeStyle = P.ink; c.lineWidth = LW;
    sh(c, [[0, .5], [.32, .2], [0, -.1], [-.32, .2]], P.paper);
    sh(c, [[0, .38], [.18, .2], [0, .02], [-.18, .2]], P.sec);
    for (const [x, y] of [[.32, .2], [0, -.1], [-.32, .2]]) { c.save(); c.translate(x, y); c.rotate(Math.PI / 4); rc(c, -.05, -.05, .1, .1, P.ink); c.restore(); }
    dot(c, 0, .2, .04, P.paper); c.beginPath(); c.arc(0, .2, .04, 0, 7); c.stroke();
    sh(c, [[-.06, .5], [.06, .5], [.06, .55], [0, .6], [-.06, .55]], P.paper);
  },
  /* a tall classical water tower */
  tower(c, P) {
    rc(c, -.4, .52, .8, .1, P.paper); rc(c, -.33, .44, .66, .08, P.paper);
    rc(c, -.25, -.3, .5, .74, P.paper);
    c.lineWidth = LW * .55;
    for (const x of [-.15, -.05, .05, .15]) ln(c, [[x, -.24], [x, .26]]);
    c.lineWidth = LW;
    c.beginPath(); c.moveTo(-.09, .44); c.lineTo(-.09, .32); c.bezierCurveTo(-.09, .24, .09, .24, .09, .32); c.lineTo(.09, .44); c.closePath(); c.fillStyle = P.ink; c.fill();
    rc(c, -.31, -.38, .62, .08, P.paper); rc(c, -.36, -.46, .72, .08, P.paper);
    rc(c, -.23, -.64, .46, .18, P.paper);
    for (const x of [-.15, -.04, .07]) rc(c, x, -.6, .08, .1, P.ink);
    sh(c, [[-.3, -.64], [.3, -.64], [0, -.86]], P.acc);
  },
  /* a spiral shell, an ammonite */
  fossils(c, P) {
    ell(c, 0, 0, .72, .72, P.sec);
    const r = t => .05 * Math.exp(.1313 * t), tEnd = 6.2 * Math.PI;
    c.strokeStyle = P.ink; c.lineWidth = LW * .65;
    for (let t = tEnd - 5.5 * Math.PI; t < tEnd; t += .42) {
      const a = r(t), b = r(t - 2 * Math.PI);
      ln(c, [[b * Math.cos(t) * .98, b * Math.sin(t) * .98], [a * Math.cos(t), a * Math.sin(t)]]);
    }
    c.lineWidth = LW * 1.2;
    c.beginPath();
    for (let t = 0; t <= tEnd; t += .1) { const a = r(t); if (t) c.lineTo(a * Math.cos(t), a * Math.sin(t)); else c.moveTo(a, 0); }
    c.stroke();
    c.lineWidth = LW;
    dot(c, .0, .0, .03, P.ink);
  },
  /* an aeroplane */
  airport(c, P) {
    c.save(); c.rotate(-Math.PI / 4);
    const half = [[0, -.84], [.06, -.72], [.075, -.3], [.74, .16], [.74, .32], [.085, .14], [.07, .5], [.3, .68], [.3, .78], [.03, .72]];
    sh(c, half.concat(half.slice(1).reverse().map(q => [-q[0], q[1]])), P.acc);
    ell(c, 0, -.56, .035, .1, P.paper);
    for (const s of [-1, 1]) rc(c, s * .3 - .045, -.12, .09, .22, P.paper);
    c.restore();
    c.strokeStyle = P.ink;
  },
  /* a clock face on a post */
  clock(c, P) {
    rc(c, -.07, .5, .14, .2, P.paper); rc(c, -.26, .66, .52, .1, P.paper);
    ell(c, 0, -.1, .66, .66, P.acc);
    ell(c, 0, -.1, .52, .52, P.paper);
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r0 = i % 3 ? .42 : .36; ln(c, [[r0 * Math.sin(a), -.1 - r0 * Math.cos(a)], [.48 * Math.sin(a), -.1 - .48 * Math.cos(a)]]); }
    c.lineWidth = LW * 1.5;
    ln(c, [[0, -.1], [-.2, -.26]]);
    ln(c, [[0, -.1], [.04, -.52]]);
    c.lineWidth = LW;
    dot(c, 0, -.1, .045, P.ink);
  },
  /* a Georgian house */
  house(c, P) {
    ln(c, [[-.7, .62], [.7, .62]]);
    rc(c, -.38, -.7, .11, .26, P.paper); rc(c, .27, -.7, .11, .26, P.paper);
    rc(c, -.62, -.12, 1.24, .74, P.paper);
    sh(c, [[-.72, -.12], [-.46, -.56], [.46, -.56], [.72, -.12]], P.acc);
    for (const x of [-.46, -.23, 0, .23, .46]) rc(c, x - .045, -.02, .09, .18, P.ink);
    for (const x of [-.46, -.26, .26, .46]) rc(c, x - .05, .26, .1, .2, P.ink);
    rc(c, -.07, .3, .14, .32, P.acc);
    sh(c, [[-.13, .3], [0, .2], [.13, .3]], P.paper);
    rc(c, -.13, .62, .26, .05, P.paper);
  },
  /* a tiered fountain */
  fountain(c, P) {
    ell(c, 0, .56, .78, .17, P.paper);
    ell(c, 0, .56, .62, .1, P.sec);
    rc(c, -.06, .1, .12, .46, P.paper);
    c.beginPath(); c.moveTo(-.44, .1); c.bezierCurveTo(-.44, .34, .44, .34, .44, .1); c.closePath(); c.fillStyle = P.paper; c.fill(); c.stroke();
    ell(c, 0, .1, .44, .075, P.sec);
    rc(c, -.04, -.22, .08, .32, P.paper);
    c.beginPath(); c.moveTo(-.25, -.22); c.bezierCurveTo(-.25, -.04, .25, -.04, .25, -.22); c.closePath(); c.fillStyle = P.paper; c.fill(); c.stroke();
    ell(c, 0, -.22, .25, .05, P.sec);
    rc(c, -.03, -.5, .06, .28, P.paper);
    dot(c, 0, -.54, .07, P.paper); c.beginPath(); c.arc(0, -.54, .07, 0, 7); c.stroke();
    c.strokeStyle = P.acc; c.lineWidth = LW * 1.1;
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * .02, -.6); c.bezierCurveTo(s * .2, -.82, s * .34, -.5, s * .34, -.24); c.stroke();
      c.beginPath(); c.moveTo(s * .08, -.28); c.bezierCurveTo(s * .3, -.4, s * .5, -.2, s * .56, .06); c.stroke();
    }
    c.strokeStyle = P.ink; c.lineWidth = LW;
  },
};

/* the optional title block (a cartouche); nothing is drawn unless a title was typed */
function drawTitle(ctx, g, opt, pal, B) {
  const title = winAnsi((opt.title || '').trim()), sub = winAnsi((opt.subtitle || '').trim());
  if (!title) return;
  const { mapW, mapH, o } = g;
  const m = (opt.border ? B : 0) + (opt.border ? 16 : 26) * o;       // distance from the map edge
  const LT = activeLetter(), tf = LT ? LT.fix : 1;                  // optional lettering: the title and subtitle use its font
  const titleF100 = LT ? letterFont(LT, 100) : `bold 100px ${SERIF}`, subF100 = LT ? letterFont(LT, 100) : `italic 100px ${SERIF}`;
  const wPerU = Math.max(textW(titleF100, title) * .46 * tf, sub ? textW(subF100, sub) * .23 * tf : 0, 170) + 68;
  const hPerU = sub ? 123.5 : 87;
  const rc = 400 * o * (Math.min(mapW, mapH) < 3600 ? .8 : 1);
  const compassEnd = opt.compass ? (opt.border ? B : 0) + rc * 2.94 + 24 * o : 0;   // right edge of the compass rose plus a gap
  const avail = opt.tpos === 'tc' ? mapW - 2 * m : opt.tpos === 'bc' ? 2 * (mapW / 2 - Math.max(compassEnd, m)) : mapW - m - Math.max(compassEnd, m);
  const O = o * 1.55;                                                // the title block is a little bigger than the other ornaments
  const u = Math.max(O * .3, Math.min(O, avail / wPerU));
  const w = wPerU * u, h = hPerU * u;
  const x = opt.tpos === 'br' ? mapW - m - w : (mapW - w) / 2;
  const y = opt.tpos === 'tc' ? m : mapH - m - h;
  const T = 46 * u * tf, S = 23 * u * tf;
  const titleFont = LT ? letterFont(LT, T) : `bold ${f5(T)}px ${SERIF}`, subFont = LT ? letterFont(LT, S) : `italic ${f5(S)}px ${SERIF}`;
  ctx.save();
  ctx.lineCap = 'butt';
  if (LT) ctx.fontKerning = 'none';
  if (opt.ornate) { drawRibbon(ctx, pal, { x, y, w, h, u, tf, title, sub, titleFont, subFont, top: opt.tpos === 'tc', LT }); ctx.restore(); return; }
  ctx.globalAlpha = .94; ctx.fillStyle = pal.paper;
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = pal.ink; ctx.lineWidth = 2.4 * u;
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.stroke();
  ctx.strokeStyle = pal.gold; ctx.lineWidth = 1.1 * u;
  ctx.beginPath(); ctx.rect(x + 6 * u, y + 6 * u, w - 12 * u, h - 12 * u); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.ink; ctx.font = titleFont;
  const ty = y + 22 * u + .72 * T;
  ctx.fillText(title, x + w / 2, ty);
  if (sub) {
    const ry = ty + 15 * u;
    ctx.strokeStyle = pal.gold; ctx.lineWidth = 1.1 * u;
    ctx.beginPath(); ctx.moveTo(x + w * .2, ry); ctx.lineTo(x + w / 2 - 8 * u, ry); ctx.moveTo(x + w / 2 + 8 * u, ry); ctx.lineTo(x + w * .8, ry); ctx.stroke();
    ctx.fillStyle = pal.gold;
    ctx.beginPath(); ctx.moveTo(x + w / 2, ry - 4 * u); ctx.lineTo(x + w / 2 + 4 * u, ry); ctx.lineTo(x + w / 2, ry + 4 * u); ctx.lineTo(x + w / 2 - 4 * u, ry); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.ink; ctx.font = subFont;
    ctx.fillText(sub, x + w / 2, ry + 10 * u + .72 * S);
  }
  ctx.restore();
}

/* Ornate title block: a swallow-tailed ribbon with folded ends carrying the title, and a smaller ribbon beneath for the
   subtitle. Drawn inside the same box as the plain cartouche (bottom aligned unless the block is at the top). */
function drawRibbon(ctx, pal, r) {
  const { x, w, u, title, sub } = r;
  const ink = pal.ink, paper = pal.paper;
  const contrast = (a, b) => Math.abs(lumOf(a) - lumOf(b));
  const onAccent = contrast(pal.accent, paper) >= contrast(pal.accent, ink) ? paper : ink;
  const dark = lumOf(pal.accent) > .12 ? shade(pal.accent, -.3) : shade(pal.accent, .3);       // the folded-back part of the ribbon
  const sub2 = pal.gold === ink ? mixHex(paper, ink, .25) : pal.gold;
  const hB = 58 * u, F = 12 * u, E = 22 * u, hB2 = 30 * u, F2 = 8 * u, E2 = 14 * u;
  const rh = sub ? 6 * u + hB + F + hB2 + F2 : 2 * u + hB + F;
  const y0 = r.top ? r.y : r.y + r.h - rh - 2 * u;
  const yT = y0 + 2 * u, yB = yT + hB;
  const poly = pts => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); };
  const ribbon = (xl, xr, top, hh, ext, drop, fill, tail, fs, text, font, tcol) => {
    const bot = top + hh, notch = ext * .42;
    ctx.lineJoin = 'miter'; ctx.strokeStyle = ink; ctx.lineWidth = 1.7 * u;
    for (const s of [-1, 1]) {                                   // the two folded-back tails behind the band, with a swallow-tail notch
      const xe = s < 0 ? xl : xr, xo = xe + s * ext, xin = xe - s * ext * .38;
      ctx.fillStyle = tail;
      poly([[xin, top + drop], [xo, top + drop], [xo + s * notch * -1, top + drop + hh / 2], [xo, bot + drop], [xin, bot + drop]]);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = shade(tail, lumOf(tail) > .12 ? -.35 : .35);                              // the fold: a small triangle under the band end
      poly([[xe, bot], [xin, bot], [xe, bot + drop]]);
      ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = fill; ctx.beginPath(); ctx.rect(xl, top, xr - xl, hh); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = pal.gold === ink ? onAccent : (fill === pal.accent ? onAccent : pal.gold); ctx.lineWidth = .9 * u; ctx.setLineDash([3 * u, 2 * u]);
    ctx.beginPath(); ctx.moveTo(xl, top + 4 * u); ctx.lineTo(xr, top + 4 * u); ctx.moveTo(xl, bot - 4 * u); ctx.lineTo(xr, bot - 4 * u); ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.fillStyle = tcol; ctx.font = font;
    ctx.fillText(text, (xl + xr) / 2, top + hh / 2 + fs * .34);
  };
  const cx = x + w / 2;
  ribbon(x + E, x + w - E, yT, hB, E, F, pal.accent, dark, 44 * u * r.tf, title, r.titleFont, onAccent);
  if (sub) {
    const sw = Math.min(w - 2 * E - 4 * u, textW(r.subFont, sub) + 22 * u), top2 = yB + F + 6 * u;
    ribbon(cx - sw / 2, cx + sw / 2, top2, hB2, E2, F2, paper, sub2, 23 * u * r.tf, sub, r.subFont, ink);
  }
}

/* Neighborhood highlight: a paper-coloured veil over everything outside the chosen area (even-odd fill of a big
   rectangle plus the boundary rings) and a crisp outline in the accent colour. Rings that cannot touch the view
   are skipped and points closer than a quarter point are dropped, so the per-page cost stays small. */
function drawHighlight(ctx, g, opt, pal) {
  const h = hoodByName(opt.hood);
  if (!h) return;
  const { mapW, mapH, k, o } = g;
  const rings = [];
  for (const b of h.bb) {
    if (b[2] < g.x0 - 8 || b[0] > g.x0 + g.vw + 8 || b[3] < g.y0 - 8 || b[1] > g.y0 + g.vh + 8) continue;
    const r = b[4], pts = [];
    let lx = 1e18, ly = 1e18;
    for (let i = 0; i < r.length; i += 2) {
      const x = Math.round((r[i] - g.x0) * k * 100) / 100, y = Math.round((mapH - (r[i + 1] - g.y0) * k) * 100) / 100;
      if (Math.abs(x - lx) + Math.abs(y - ly) < .25) continue;
      pts.push(x, y); lx = x; ly = y;
    }
    if (pts.length >= 6) rings.push(pts);
  }
  const trace = () => {
    for (const pts of rings) {
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
    }
  };
  ctx.save();
  ctx.globalAlpha = HOOD_FADE; ctx.fillStyle = pal.paper;
  ctx.beginPath(); ctx.rect(-2, -2, mapW + 4, mapH + 4); trace(); ctx.fill('evenodd');
  ctx.globalAlpha = 1;
  if (rings.length) {
    ctx.strokeStyle = pal.accent; ctx.lineWidth = Math.max(1.5, 4.5 * o); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
    ctx.beginPath(); trace(); ctx.stroke();
  }
  ctx.restore();
}

/* `mid(ctx)` is called after the highlight and distance rings and before markers, compass, border and title: that is
   where the optional street and place names go. */
function drawOverlay(ctx, g, opt, mid) {
  const { mapW, mapH, k, o } = g;
  const pal = ovPalFor(opt);
  const ink = pal.ink, gold = pal.gold, white = pal.paper;
  const fx = bx => (bx - g.x0) * k, fy = by => mapH - (by - g.y0) * k;

  if (opt.hood) drawHighlight(ctx, g, opt, pal);
  if (opt.rings) {
    const gx = fx(M.center[0]), gy = fy(M.center[1]);
    const dx = Math.max(0, -gx, gx - mapW), dy = Math.max(0, -gy, gy - mapH);
    const near = Math.hypot(dx, dy);
    const far = Math.max(...[[0, 0], [mapW, 0], [0, mapH], [mapW, mapH]].map(p => Math.hypot(gx - p[0], gy - p[1])));
    let step = 1;
    for (const s of [.1, .25, .5, 1, 2, 5, 10]) { step = s; if (s * MILE * k >= 200 * o) break; }
    const unit = step * MILE * k;
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.globalAlpha = .85;
    ctx.strokeStyle = gold;
    for (let n = Math.max(1, Math.floor(near / unit)); n * unit < far; n++) {
      const five = n % 5 === 0;
      ctx.lineWidth = (five ? 1.5 : .45) * o;
      ctx.setLineDash(five ? [] : [1.2 * o, 2.4 * o]);
      circ(ctx, gx, gy, n * unit); ctx.stroke();
    }
    ctx.setLineDash([6 * o, 3 * o, 1 * o, 3 * o]);
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      ctx.lineWidth = (i % 4 === 0 ? .7 : .35) * o;
      ctx.beginPath();
      ctx.moveTo(gx + unit * Math.sin(a), gy - unit * Math.cos(a));
      ctx.lineTo(gx + far * Math.sin(a), gy - far * Math.cos(a));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = white; ctx.lineWidth = 1.2 * o;
    circ(ctx, gx, gy, 15 * o); ctx.fill(); ctx.stroke();
    fleur(ctx, gx, gy + 1 * o, 10.5 * o, 0, gold);
    ctx.restore();
  }
  if (opt.landmarks) drawLandmarks(ctx, g, pal);
  if (mid) mid(ctx);

  const B = opt.border ? 108 * o : 0;
  if (opt.markers && opt.markers.length) {
    const ms = 72 * o;
    for (const mk of opt.markers) {
      const sx = fx(mk.x), sy = fy(mk.y);
      if (sx < -ms || sx > mapW + ms || sy < -ms || sy > mapH + ms) continue;
      drawMarker(ctx, mk.t, sx, sy, ms, pal);
    }
  }
  if (opt.compass) {
    const r = 400 * o * (Math.min(mapW, mapH) < 3600 ? .8 : 1);
    (opt.ornate ? compassOrnate : compass)(ctx, B + r * 1.6, mapH - B - r * 1.52, r, pal);
  }

  if (opt.border) {
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.fillStyle = white;
    for (const [x, y, w, h] of [[0, 0, mapW, B], [0, mapH - B, mapW, B], [0, 0, B, mapH], [mapW - B, 0, B, mapH]]) {
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill();
    }
    const box = (ins, lw, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.rect(ins, ins, mapW - 2 * ins, mapH - 2 * ins); ctx.stroke();
    };
    box(26 * o, 7 * o, ink);
    box(B, 2 * o, ink);
    box(82 * o, 1.6 * o, gold);
    // checkered band: each block is a fixed ground distance, aligned to the map
    const a = 42 * o, b = 60 * o;
    let blk = 10;
    for (const mi of [.0125, .025, .05, .125, .25, .5, 1, 2, 5, 10]) { blk = mi; if (mi * MILE * k >= 110 * o) break; }
    const bu = blk * MILE;
    ctx.fillStyle = ink;
    for (let i = Math.floor(g.x0 / bu); i * bu < g.x0 + g.vw; i++) {
      if (i & 1) continue;
      const xa = Math.max(fx(i * bu), B), xb = Math.min(fx((i + 1) * bu), mapW - B);
      if (xb <= xa) continue;
      ctx.beginPath(); ctx.rect(xa, a, xb - xa, b - a); ctx.fill();
      ctx.beginPath(); ctx.rect(xa, mapH - b, xb - xa, b - a); ctx.fill();
    }
    for (let i = Math.floor(g.y0 / bu); i * bu < g.y0 + g.vh; i++) {
      if (i & 1) continue;
      const ya = Math.max(fy((i + 1) * bu), B), yb = Math.min(fy(i * bu), mapH - B);
      if (yb <= ya) continue;
      ctx.beginPath(); ctx.rect(a, ya, b - a, yb - ya); ctx.fill();
      ctx.beginPath(); ctx.rect(mapW - b, ya, b - a, yb - ya); ctx.fill();
    }
    ctx.strokeStyle = ink; ctx.lineWidth = .8 * o;
    for (const [x, y, w, h] of [[B, a, mapW - 2 * B, b - a], [B, mapH - b, mapW - 2 * B, b - a],
      [a, B, b - a, mapH - 2 * B], [mapW - b, B, b - a, mapH - 2 * B]]) {
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.stroke();
    }
    const q = 62 * o;
    for (const [x, y, ang] of [[q, mapH - q, 135], [mapW - q, mapH - q, -135], [q, q, 45], [mapW - q, q, -45]]) {
      ctx.fillStyle = white; ctx.strokeStyle = gold; ctx.lineWidth = 1.6 * o;
      circ(ctx, x, y, 30 * o); ctx.fill(); ctx.stroke();
      fleur(ctx, x, y, 19 * o, ang, pal.accent);
    }
    ctx.restore();
  }
  drawTitle(ctx, g, opt, pal, B);
}

/* ------------------------------------------------------------ preview */
const canvas = $('view'), stage = $('stage');
let raf = 0, disp = 1;                     // disp = css px per point
const imgs = {};
function themeImg() {
  if (LIVE) return liveOverview();
  const t = state.theme;
  if (!imgs[t]) {
    const im = new Image();
    im.onload = () => { im.ready = true; schedule(); };
    im.src = `preview-${t}.jpg`;
    imgs[t] = im;
  }
  return imgs[t];
}

/* sharp close-up: when the view covers only a few data tiles, draw the real vector data */
let vcan = null, vinfo = null, vtimer = 0, vrun = 0;
const styleSig = () => [state.theme, state.trees, state.waves, state.shadows, state.draw, state.detail, state.shore, state.hachure].join();
function vectorKeys(g) {
  const keys = cellKeys(g.x0, g.y0, g.x0 + g.vw, g.y0 + g.vh);
  return keys.length <= 12 ? keys : null;
}
function buildPaths(c) {
  const paths = new Array(NSRC).fill(null), b = c.buf;
  for (let i = 0, n = c.id.length; i < n; i++) {
    const P = paths[c.ly[i]] || (paths[c.ly[i]] = new Path2D());
    let p = c.s[i], x = 0, y = 0, have = 0;
    const e = c.e[i];
    while (p < e) {
      const ch = b[p];
      if (ch === 45 || (ch >= 48 && ch <= 57)) {
        let neg = false, v = 0;
        if (ch === 45) { neg = true; p++; }
        while (b[p] >= 48 && b[p] <= 57) { v = v * 10 + b[p] - 48; p++; }
        if (b[p] === 46) { p++; let sc = .1; while (b[p] >= 48 && b[p] <= 57) { v += (b[p] - 48) * sc; sc *= .1; p++; } }
        if (neg) v = -v;
        if (have === 0) { x = v; have = 1; } else { y = v; have = 2; }
      } else {
        if (ch === 109) { P.moveTo(x, y); have = 0; } else if (ch === 108) { P.lineTo(x, y); have = 0; } else if (ch === 104) P.closePath();
        p++;
      }
    }
  }
  c.paths = paths;
}
function canvasPattern(ctx, pat, px) {
  const tc = document.createElement('canvas');
  tc.width = tc.height = Math.max(4, Math.round(px));
  const t = tc.getContext('2d');
  t.scale(tc.width / pat.T, tc.width / pat.T);
  drawPatternTile(t, pat);
  return ctx.createPattern(tc, 'repeat');
}
/* Draws the real vector data (all passes of the current style) for the view into a canvas that is
   `ppp` pixels per output point. Shared by the sharp preview and the PNG export. The cells for `keys`
   must already be loaded. `cancel()` is polled while yielding; returns false if cancelled. */
async function paintVector(can, g, keys, ppp, cancel, onPass) {
  const ctx = can.getContext('2d');
  const sc = ppp * g.k, ws = widthScale(g.k), win = [g.x0, g.y0, g.x0 + g.vw, g.y0 + g.vh];
  const ox = -g.x0 * sc, oy = (g.y0 + g.vh) * sc;
  await ensureDeco(win);
  ctx.fillStyle = landOf(); ctx.fillRect(0, 0, can.width, can.height);
  ctx.lineJoin = 'round';
  let t0 = performance.now();
  const P = passes(), art = isArt();
  let buckets = null, xcache = null;
  if (art) {
    const pad = artPad(P, g.k);
    buckets = collect(g.x0 - pad, g.y0 - pad, g.x0 + g.vw + pad, g.y0 + g.vh + pad, detailFilter(g));
    xcache = new Map();
  }
  const drawPath = (p, path) => {
    ctx.setTransform(sc, 0, 0, -sc, ox, oy);
    if (p.kind === 'fill') {
      ctx.fillStyle = p.hex; ctx.fill(path, 'nonzero');
      if (p.outline) { ctx.strokeStyle = p.outline; ctx.lineWidth = p.ow == null ? .22 * ws : p.ow / g.k; ctx.setLineDash([]); ctx.stroke(path); }
    } else if (p.kind === 'shadow') {
      const so = shadowOff(g.k) * ppp;
      ctx.setTransform(sc, 0, 0, -sc, ox + so, oy + so);
      ctx.fillStyle = p.hex; ctx.fill(path, 'nonzero');
    } else if (p.kind === 'pattern') {
      ctx.save();
      ctx.clip(path, 'nonzero');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = canvasPattern(ctx, p.pat, p.pat.T * patScale(g) * ppp);
      ctx.fillRect(0, 0, can.width, can.height);
      ctx.restore();
    } else {
      ctx.strokeStyle = p.hex; ctx.lineWidth = Math.max(p.width * (p.wmul || 1) * ws, (p.wmin || 0) / g.k); ctx.lineCap = p.butt ? 'butt' : 'round';
      ctx.setLineDash(p.dash ? [p.dash * ws, p.dash * ws] : []);
      ctx.stroke(path);
    }
  };
  let n = 0;
  for (const p of P) {
    if (p.kind === 'shore') {
      ctx.setTransform(sc, 0, 0, -sc, ox, oy);
      paintShore(ctx, g, win, p.xf);
    } else if (art) {
      const items = buckets[p.src];
      if (items.length) {
        const key = p.src + '|' + p.xk;
        let path = xcache.get(key);
        if (!path) {
          path = await buildXfPath(items, makeSpec(p.xf, g.k), cancel);
          if (!path) return false;
          xcache.set(key, path);
        }
        drawPath(p, path);
      }
    } else {
      for (const key of keys) {
        const c = cells.get(key);
        if (!c.paths) buildPaths(c);
        const path = c.paths[p.src];
        if (!path) continue;
        drawPath(p, path);
      }
    }
    n++;
    if (onPass) onPass(n, P.length);
    if (performance.now() - t0 > 30) { await tick(); if (cancel()) return false; t0 = performance.now(); }
  }
  if (state.hachure) { ctx.setTransform(sc, 0, 0, -sc, ox, oy); paintHach(ctx, g, win, ovPalFor(state).ink); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return true;
}
/* Shore lines and hachures over the low-resolution picture used when zoomed out (up close they are part of paintVector).
   A cached layer, like the sharp close-up: made once the view settles, drawn shifted or scaled until then. */
let dcan = null, dinfo = null, dtimer = 0, drun = 0;
const decoOn = () => state.shore || state.hachure;
const decoSig = g => [g.x0, g.y0, g.k, g.mapW, g.mapH, disp, state.theme, state.draw, state.shore, state.hachure].join();
async function renderDeco() {
  const run = ++drun, g = geom();
  if (!decoOn() || vectorKeys(g)) return;
  const sig = decoSig(g), win = [g.x0, g.y0, g.x0 + g.vw, g.y0 + g.vh];
  layerMsg('Loading fine details...');
  try { await ensureDeco(win); } catch (err) { layerMsg(err.message); return; }
  if (run !== drun) return;
  layerMsg('');
  const dpr = Math.min(2, window.devicePixelRatio || 1), ppp = Math.min(disp * dpr, 3000 / Math.max(g.mapW, g.mapH)), can = document.createElement('canvas');
  can.width = Math.round(g.mapW * ppp); can.height = Math.round(g.mapH * ppp);
  const ctx = can.getContext('2d'), sc = ppp * g.k;
  ctx.setTransform(sc, 0, 0, -sc, -g.x0 * sc, (g.y0 + g.vh) * sc);
  const P = passes().find(p => p.kind === 'shore');
  if (state.shore) paintShore(ctx, g, win, P ? P.xf : null);
  if (state.hachure) paintHach(ctx, g, win, ovPalFor(state).ink);
  dcan = can; dinfo = { x0: g.x0, y0: g.y0, vw: g.vw, vh: g.vh, sig, flags: [state.theme, state.draw, state.shore, state.hachure].join() };
  schedule();
}
async function renderVector() {
  const run = ++vrun;
  const g = geom(), keys = vectorKeys(g);
  if (!keys) return;
  const sig = [g.x0, g.y0, g.k, g.mapW, g.mapH, disp, styleSig()].join();
  await loadCells(keys, () => {});
  if (run !== vrun) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const can = document.createElement('canvas');
  can.width = Math.round(g.mapW * disp * dpr); can.height = Math.round(g.mapH * disp * dpr);
  if (!await paintVector(can, g, keys, disp * dpr, () => run !== vrun)) return;
  vcan = can;
  vinfo = { x0: g.x0, y0: g.y0, vw: g.vw, vh: g.vh, style: styleSig(), sig };
  schedule();
}

/* Live areas have no ready-made overview pictures: download every cell once, then paint the whole area into a canvas
   (about 2400 px across) in the current style. Rebuilt when the style changes. */
let liveImg = null, liveRun = 0, liveStatus = 'Loading map...';
const liveCover = () => { const g = geom(); return { g, keys: cellKeys(0, 0, M.size, M.size) }; };
function liveOverview() {
  const sig = styleSig();
  if (liveImg && liveImg.sig === sig) return liveImg;
  const prev = liveImg && liveImg.ready ? liveImg : null;
  const cur = { sig, ready: false };
  liveImg = cur;
  const run = ++liveRun;
  (async () => {
    const { g, keys } = liveCover();
    await loadCells(keys, (d, n) => { liveStatus = `Downloading map data for ${LIVE.name}: ${d} of ${n}`; schedule(); });
    if (run !== liveRun) return;
    liveStatus = 'Drawing the map...'; schedule();
    const k = g.minK, px = 2400, ppp = px / (M.size * k);
    const g0 = Object.assign({}, g, { x0: 0, y0: 0, vw: M.size, vh: M.size, k, mapW: M.size * k, mapH: M.size * k });
    const can = document.createElement('canvas');
    can.width = can.height = px;
    if (!await paintVector(can, g0, keys, ppp, () => run !== liveRun)) return;
    can.naturalWidth = px; can.ready = true; can.sig = sig;
    liveImg = can;
    schedule();
  })().catch(err => { if (run === liveRun) { liveStatus = err.message; schedule(); } });
  return prev ? Object.assign(prev, { ready: true }) : cur;
}

/* draw the map area (no paper margin) at d px per point with its top-left at the origin */
function paintMap(ctx, g, d, lab) {
  const img = themeImg();
  const s = (img.ready && img.naturalWidth ? img.naturalWidth : M.img) / M.size;      // previews may differ in size from one style to the next
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = img.ready ? landOf() : '#f3f1ec';
  ctx.fillRect(0, 0, g.mapW * d, g.mapH * d);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, g.mapW * d, g.mapH * d); ctx.clip();
  if (img.ready) ctx.drawImage(img, g.x0 * s, (M.size - g.y0 - g.vh) * s, g.vw * s, g.vh * s, 0, 0, g.mapW * d, g.mapH * d);
  if (vinfo && vinfo.style === styleSig() && vectorKeys(g)) {
    ctx.drawImage(vcan, (vinfo.x0 - g.x0) * g.k * d, (g.y0 + g.vh - vinfo.y0 - vinfo.vh) * g.k * d, vinfo.vw * g.k * d, vinfo.vh * g.k * d);
  }
  if (dinfo && decoOn() && !vectorKeys(g) && dinfo.flags === [state.theme, state.draw, state.shore, state.hachure].join()) {
    ctx.drawImage(dcan, (dinfo.x0 - g.x0) * g.k * d, (g.y0 + g.vh - dinfo.y0 - dinfo.vh) * g.k * d, dinfo.vw * g.k * d, dinfo.vh * g.k * d);
  }
  drawTerrain(ctx, g, d);
  ctx.scale(d, d);
  drawOverlay(ctx, g, state, lab && lab.list.length ? c => drawLabels(c, lab.list, ovPalFor(state), lab.dx, lab.dy) : null);
  ctx.restore();
}

function render() {
  raf = 0;
  const g = geom();
  const availW = stage.clientWidth - 44, availH = stage.clientHeight - 44;
  disp = Math.max(.001, Math.min(availW / g.W, availH / g.H));
  const cw = Math.round(g.W * disp), ch = Math.round(g.H * disp);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(g.mx * disp, g.my * disp);
  if (state.terrain) hillImg();
  paintMap(ctx, g, disp, previewLabels(g));
  if (state.grid) {
    ctx.strokeStyle = 'rgba(168,35,44,.45)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let i = 1; i < g.cols; i++) { const x = Math.round(g.colX[i] * disp) + .5; ctx.moveTo(x, 0); ctx.lineTo(x, g.mapH * disp); }
    for (let j = 1; j < g.rows; j++) { const y = Math.round(g.rowY[j] * disp) + .5; ctx.moveTo(0, y); ctx.lineTo(g.mapW * disp, y); }
    ctx.stroke();
  }
  ctx.restore();
  if (vectorKeys(g)) {
    const sig = [g.x0, g.y0, g.k, g.mapW, g.mapH, disp, styleSig()].join();
    if (!vinfo || vinfo.sig !== sig) { clearTimeout(vtimer); vtimer = setTimeout(renderVector, 140); }
  } else if (decoOn() && (!dinfo || dinfo.sig !== decoSig(g))) { clearTimeout(dtimer); dtimer = setTimeout(renderDeco, 140); }
  if (!themeImg().ready) {
    ctx.fillStyle = C.ink; ctx.font = '600 15px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(LIVE ? liveStatus : 'Loading map...', cw / 2, ch / 2);
  }
  queueLabels(g);
  summary(g);
  lastDpr = dpr;
  queueInk();
  queueHash();
}
let lastDpr = 1;
function schedule() { if (!raf) raf = requestAnimationFrame(render); }

const inches = v => {
  const r = Math.round(v * 100) / 100;
  return (Number.isInteger(r) ? r : r.toFixed(2)) + ' in';
};
function summary(g) {
  $('sPages').textContent = `${g.cols} across x ${g.rows} down = ${g.cols * g.rows} (${g.name})`;
  const mi = 1 / (4 * g.k);
  $('sScale').textContent = mi >= .2 ? `1 in = ${mi.toFixed(2)} mi` : `1 in = ${Math.round(mi * 5280 / 10) * 10} ft`;
  $('sArea').textContent = `${(g.vw / MILE).toFixed(1)} x ${(g.vh / MILE).toFixed(1)} mi`;
  $('sBorder').textContent = inches(EDGE / 72) + ' all round';
  const changed = Math.abs(g.W - state.wallW * 72) > .5 || Math.abs(g.H - state.wallH * 72) > .5;
  $('wholeNote').hidden = !changed;
  $('wholeNote').textContent = changed ? `Whole sheets: the finished map comes out ${feet(g.W / 72)} wide x ${feet(g.H / 72)} tall.` : '';
  const z = $('zoom');
  if (document.activeElement !== z) z.value = Math.round(1000 * Math.log(state.zoom) / Math.log(g.maxZoom));
  const big = Math.max(g.mapW, g.mapH) > 14400;
  $('dlSheet').disabled = busy || big;
  $('dlSheet').title = big ? 'A single PDF sheet is limited to 200 in (16 ft 8 in).' : '';
  $('styleHint').hidden = !(isArt() && !vectorKeys(g));
  $('dlPng').disabled = busy;
  $('dlTest').disabled = busy;
  const poster = POSTERS.some(p => Math.abs(p[0] - state.wallW) < .01 && Math.abs(p[1] - state.wallH) < .01);
  $('posterNote').hidden = !poster;
  $('dlSheet').classList.toggle('hot', poster);
}
const POSTERS = [[18, 24], [24, 18], [24, 36], [36, 24]];   // wall width x height in inches

/* ---- ink estimate: average darkness of the map area of the preview, computed once the view settles */
let inkT = 0, inkCan = null;
function queueInk() { clearTimeout(inkT); inkT = setTimeout(measureInk, 450); }
function measureInk() {
  if (ptrs.size) return queueInk();
  if (!themeImg().ready) return;
  const g = geom(), sw = 96, sh = clamp(Math.round(sw * g.mapH / g.mapW), 8, 200);
  if (!inkCan) inkCan = document.createElement('canvas');
  inkCan.width = sw; inkCan.height = sh;
  const c = inkCan.getContext('2d', { willReadFrequently: true });
  const s = disp * lastDpr;
  c.fillStyle = '#fff'; c.fillRect(0, 0, sw, sh);
  c.drawImage(canvas, g.mx * s, g.my * s, g.mapW * s, g.mapH * s, 0, 0, sw, sh);
  const d = c.getImageData(0, 0, sw, sh).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 1 - (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255;
  const pct = 100 * sum / (d.length / 4);
  const rating = pct < 10 ? 'light' : pct < 25 ? 'moderate' : 'heavy';
  $('sInk').textContent = `${pct < 1 ? 'under 1' : 'about ' + Math.round(pct)}% (${rating})`;
  $('sInk').title = 'Rough share of the page covered with color, from the preview. Dark styles use much more ink; Line art uses the least.';
}

/* ---- interaction */
function zoomAt(factor, px, py) {
  const g = geom();
  const bx = g.x0 + (px / disp - g.mx) / g.k, by = g.y0 + g.vh - (py / disp - g.my) / g.k;
  state.zoom = clamp(state.zoom * factor, 1, g.maxZoom);
  const k2 = g.minK * state.zoom;
  state.cx = bx - (px / disp - g.mx) / k2 + g.mapW / k2 / 2;
  state.cy = by + (py / disp - g.my) / k2 - g.mapH / k2 / 2;
  schedule();
}
const ptrs = new Map();
let pinch = 0, clickCand = null;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  canvas.classList.add('drag');
  pinch = 0;
  clickCand = ptrs.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
});
canvas.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  if (clickCand && Math.hypot(e.clientX - clickCand.x, e.clientY - clickCand.y) > 5) clickCand = null;
  const prev = ptrs.get(e.pointerId);
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 1) {
    const g = geom();
    state.cx -= (e.clientX - prev[0]) / (disp * g.k);
    state.cy += (e.clientY - prev[1]) / (disp * g.k);
    schedule();
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const r = canvas.getBoundingClientRect();
    if (pinch) zoomAt(d / pinch, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
    pinch = d;
  }
});
const up = e => {
  const click = e.type === 'pointerup' && clickCand && clickCand.id === e.pointerId && ptrs.size === 1;
  ptrs.delete(e.pointerId); pinch = 0; clickCand = null;
  if (!ptrs.size) canvas.classList.remove('drag');
  if (click && placing) placeMarker(e);
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? .05 : .0015)), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

$('zoom').addEventListener('input', e => {
  const g = geom();
  state.zoom = Math.pow(g.maxZoom, e.target.value / 1000);
  schedule();
});
$('fitAll').addEventListener('click', () => { state.zoom = 1; state.cx = state.cy = M.size / 2; schedule(); });
if (LIVE) $('goDowntown').textContent = 'Center on ' + LIVE.name.split(',')[0];
$('goDowntown').addEventListener('click', () => { [state.cx, state.cy] = M.center; schedule(); });

function readWall() {
  const num = id => Math.max(0, parseFloat($(id).value) || 0);
  state.wallW = clamp(num('wFt') * 12 + num('wIn'), 12, 192);
  state.wallH = clamp(num('hFt') * 12 + num('hIn'), 12, 192);
  schedule();
}
document.querySelectorAll('[data-poster]').forEach(b => b.addEventListener('click', () => {
  const [w, h] = b.dataset.poster.split('x').map(Number);
  state.wallW = w; state.wallH = h;
  normWall(); schedule();
}));
function normWall() {
  for (const [f, i, v] of [['wFt', 'wIn', state.wallW], ['hFt', 'hIn', state.wallH]]) {
    $(f).value = Math.floor(v / 12); $(i).value = Math.round((v % 12) * 100) / 100;
  }
}
for (const id of ['wFt', 'wIn', 'hFt', 'hIn']) {
  $(id).addEventListener('input', readWall);
  $(id).addEventListener('change', () => { readWall(); normWall(); });
}
document.querySelectorAll('input[name=paper]').forEach(r => r.addEventListener('change', () => { state.paper = r.value; schedule(); }));
$('orient').addEventListener('change', e => { state.orient = e.target.value; schedule(); });
$('oWhole').addEventListener('change', e => { state.whole = e.target.checked; schedule(); });
const CHECKS = [['oBorder', 'border'], ['oStreets', 'labStreets'], ['oPlaces', 'labPlaces'], ['oTerrain', 'terrain'], ['oCompass', 'compass'], ['oRings', 'rings'], ['oGrid', 'grid'],
  ['oTrees', 'trees'], ['oWaves', 'waves'], ['oShadows', 'shadows'], ['oLandmarks', 'landmarks'], ['oShore', 'shore'], ['oHach', 'hachure'], ['oOrnate', 'ornate']];
for (const [id, key] of CHECKS) {
  $(id).addEventListener('change', e => { state[key] = e.target.checked; schedule(); });
}
$('oLandmarks').addEventListener('change', () => { if (state.landmarks) loadLandmarks().catch(err => layerMsg(err.message)); });
for (const id of ['oShore', 'oHach']) $(id).addEventListener('change', () => { layerMsg(''); });
document.querySelectorAll('input[name=lettering]').forEach(r => r.addEventListener('change', () => {
  if (!r.checked) return;
  state.lettering = r.value;
  layerMsg('');
  letteringChanged();
  loadLetter(r.value).then(letteringChanged).catch(err => layerMsg(err.message));
}));
const themeBox = $('themes');
for (const [key, T] of Object.entries(THEMES)) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'theme'; b.dataset.theme = key;
  b.setAttribute('aria-pressed', key === state.theme);
  b.innerHTML = `<span class="sw">${T.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span><b>${T.label}</b><small>${T.note}</small>`;
  b.addEventListener('click', () => { state.theme = key; syncTheme(); schedule(); });
  themeBox.appendChild(b);
}
for (const [name, key] of [['draw', 'draw'], ['detail', 'detail']]) {
  document.querySelectorAll(`input[name=${name}]`).forEach(r => r.addEventListener('change', () => { if (r.checked) { state[key] = r.value; schedule(); } }));
}
function syncTheme() { themeBox.querySelectorAll('.theme').forEach(x => x.setAttribute('aria-pressed', x.dataset.theme === state.theme)); }
const placeSel = $('place');
PLACES.slice().sort((a, b) => a[0].localeCompare(b[0])).forEach(p => {
  const o = document.createElement('option'); o.value = p[0]; o.textContent = p[0]; placeSel.appendChild(o);
});
/* centre the view on a base-coordinate point at roughly neighborhood zoom (about 1.5 miles across) */
function centerOn(bx, by) {
  const g = geom();
  state.cx = bx; state.cy = by;
  state.zoom = clamp((Math.min(g.mapW, g.mapH) / (1.5 * MILE)) / g.minK, 1, g.maxZoom);
  schedule();
}
placeSel.addEventListener('change', () => {
  const p = PLACES.find(x => x[0] === placeSel.value);
  if (!p) return;
  centerOn(...PROJ(p[1], p[2]));
  placeSel.value = '';
});

/* ---- address search (OpenStreetMap Nominatim; one request per button press) */
const NOMINATIM = (() => {
  let vb = '-85.95,38.40,-85.40,37.97';
  if (LIVE) { const [s, w] = LIVE.proj.inv(0, 0), [n, e] = LIVE.proj.inv(M.size, M.size); vb = [w, n, e, s].map(v => v.toFixed(4)).join(','); }
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=us&viewbox=${vb}&bounded=1&q=`;
})();
const AREA_NAME = LIVE ? LIVE.name : 'Louisville';
const inMap = (bx, by) => bx >= 0 && bx <= M.size && by >= 0 && by <= M.size;
const addrMsg = t => { $('addrMsg').textContent = t; };
async function findAddress() {
  const q = $('addr').value.trim();
  const list = $('addrRes');
  list.textContent = '';
  if (!q) { addrMsg('Type an address or place name first.'); return; }
  $('addrGo').disabled = true;
  addrMsg('Searching...');
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(NOMINATIM + encodeURIComponent(q), { signal: ctl.signal });
    if (!res.ok) throw new Error('The search service answered with an error (' + res.status + ').');
    const data = await res.json();
    const hits = (Array.isArray(data) ? data : []).map(d => ({ lat: parseFloat(d.lat), lon: parseFloat(d.lon), name: String(d.display_name || '') }))
      .filter(h => Number.isFinite(h.lat) && Number.isFinite(h.lon)).slice(0, 5);
    if (!hits.length) { addrMsg('No match found around ' + AREA_NAME + '. Try adding the street number, or a neighborhood name.'); return; }
    addrMsg('Choose a result:');
    for (const h of hits) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = h.name || `${h.lat.toFixed(4)}, ${h.lon.toFixed(4)}`;
      b.addEventListener('click', () => {
        const [bx, by] = PROJ(h.lat, h.lon);
        if (!inMap(bx, by)) { addrMsg('That place is outside the area this map covers.'); return; }
        centerOn(bx, by);
        addrMsg('Centered the map on your choice.');
      });
      li.appendChild(b); list.appendChild(li);
    }
  } catch (err) {
    addrMsg(err.name === 'AbortError' ? 'The search took too long. Check your connection and try again.' :
      'Could not reach the search service. ' + (err.message && !/fetch/i.test(err.message) ? err.message : 'Check your connection and try again.'));
  } finally {
    clearTimeout(to);
    $('addrGo').disabled = false;
  }
}
$('addrGo').addEventListener('click', findAddress);
$('addr').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); findAddress(); } });

/* ---- title block inputs */
const cleanText = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
$('tTitle').addEventListener('input', e => { state.title = cleanText(e.target.value, 60); schedule(); });
$('tSub').addEventListener('input', e => { state.subtitle = cleanText(e.target.value, 80); schedule(); });
$('tPos').addEventListener('change', e => { state.tpos = e.target.value; schedule(); });

/* ---- personal markers */
const MARK_NAMES = { heart: 'Heart', star: 'Star', house: 'House', pin: 'Pin' };
const MAXMARK = 100;
let placing = null;
function setPlacing(t) {
  placing = t;
  document.querySelectorAll('[data-mark]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mark === t));
  canvas.classList.toggle('place', !!t);
  $('mHint').textContent = t ? `Click the map where the ${MARK_NAMES[t].toLowerCase()} should go. Click its button again to cancel.` :
    'Choose a symbol, then click the map to drop it there. Markers stay on their spot when you move or zoom the map.';
}
document.querySelectorAll('[data-mark]').forEach(b => b.addEventListener('click', () => setPlacing(placing === b.dataset.mark ? null : b.dataset.mark)));
function placeMarker(e) {
  const g = geom(), r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) / disp - g.mx, my = (e.clientY - r.top) / disp - g.my;
  if (mx < 0 || my < 0 || mx > g.mapW || my > g.mapH) return;
  if (state.markers.length >= MAXMARK) { $('mHint').textContent = `That is the most markers (${MAXMARK}). Remove one to add another.`; setPlacing(null); return; }
  state.markers.push({ t: placing, x: clamp(g.x0 + mx / g.k, 0, M.size), y: clamp(g.y0 + (g.mapH - my) / g.k, 0, M.size) });
  setPlacing(null);
  renderMarkerList();
  schedule();
}
function renderMarkerList() {
  const ul = $('mList'), cnt = {};
  ul.textContent = '';
  state.markers.forEach((m, i) => {
    cnt[m.t] = (cnt[m.t] || 0) + 1;
    const li = document.createElement('li'), sp = document.createElement('span'), b = document.createElement('button');
    sp.textContent = `${MARK_NAMES[m.t]} ${cnt[m.t]}`;
    b.type = 'button'; b.textContent = 'Remove'; b.setAttribute('aria-label', `Remove ${sp.textContent}`);
    b.addEventListener('click', () => { state.markers.splice(i, 1); renderMarkerList(); schedule(); });
    li.append(sp, b); ul.appendChild(li);
  });
  $('mClear').hidden = !state.markers.length;
}
$('mClear').addEventListener('click', () => { state.markers = []; renderMarkerList(); schedule(); });
new ResizeObserver(schedule).observe(stage);

/* ------------------------------------------------------------ vector tiles */
const cells = new Map();
async function gunzipIf(res) {
  let buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    buf = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  return buf;
}
function parseTile(buf) {
  const id = [], ly = [], x0 = [], y0 = [], x1 = [], y1 = [], s = [], e = [];
  let p = 0;
  const n = buf.length;
  const int = () => {
    let v = 0, neg = false;
    if (buf[p] === 45) { neg = true; p++; }
    while (buf[p] !== 9) { v = v * 10 + buf[p] - 48; p++; }
    p++;
    return neg ? -v : v;
  };
  while (p < n) {
    id.push(int()); ly.push(int()); x0.push(int()); y0.push(int()); x1.push(int()); y1.push(int());
    s.push(p);
    let q = buf.indexOf(10, p);
    if (q < 0) q = n - 1;
    e.push(q + 1);
    p = q + 1;
  }
  return { buf, id, ly, x0, y0, x1, y1, s, e };
}
const cellLoads = new Map();
async function loadCell(key) {
  if (cells.has(key)) return;
  if (LIVE) {                                   // downloaded from OpenStreetMap; shared by everyone waiting on the same cell
    if (!cellLoads.has(key)) cellLoads.set(key, LIVE.cell(key).then(buf => {
      cells.set(key, parseTile(buf));
      if (LIVE.maxId() + 2 > seen.length) seen = new Int32Array(LIVE.maxId() + 65536);
    }).finally(() => cellLoads.delete(key)));
    return cellLoads.get(key);
  }
  const res = await fetch(`tiles/${key}.bin`);
  if (!res.ok) throw new Error('Could not load map data (' + key + ')');
  cells.set(key, parseTile(await gunzipIf(res)));
}
/* Merged building masses for the Simplified level (art/blocks/<cx>_<cy>.bin, same tile format, own id space). A tile
   that is not there simply stays null and the individual buildings are used instead. */
const blockCells = new Map();
let seenB = new Int32Array(1);
async function loadBlocks(key) {
  if (blockCells.has(key)) return;
  if (LIVE) { blockCells.set(key, null); return; }    // merged building masses exist only for the built-in map
  let c = null;
  try {
    const res = await fetch(`art/blocks/${key}.bin`);
    if (res.ok) {
      c = parseTile(await gunzipIf(res));
      let mx = 0;
      for (const v of c.id) if (v > mx) mx = v;
      if (mx + 2 > seenB.length) seenB = new Int32Array(mx + 1024);
      if (!c.id.length) c = null;
    }
  } catch (err) { c = null; }
  blockCells.set(key, c);
}

function cellKeys(bx0, by0, bx1, by1) {
  const keys = [];
  const c0 = clamp(Math.floor(bx0 / M.cell), 0, M.n - 1), c1 = clamp(Math.floor(bx1 / M.cell), 0, M.n - 1);
  const r0 = clamp(Math.floor(by0 / M.cell), 0, M.n - 1), r1 = clamp(Math.floor(by1 / M.cell), 0, M.n - 1);
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
    const k = c + '_' + r;
    if (TILESET.has(k)) keys.push(k);
  }
  return keys;
}

async function loadCells(keys, onProgress) {
  const todo = keys.filter(k => !cells.has(k));
  let done = 0, i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const k = todo[i++];
      await loadCell(k);
      onProgress(++done, todo.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  if (state.detail === 'simple') await pool(keys.filter(k => !blockCells.has(k)), loadBlocks);
}

let seen = new Int32Array(M.features + 2);
let stamp = 0;
/* features intersecting a base-coordinate window, bucketed by source layer. `flt` (detail filter, see detailFilter) drops
   buildings smaller than flt.minB and, in tiles that have merged building masses, replaces buildings by them. */
function collect(bx0, by0, bx1, by1, flt) {
  stamp++;
  const buckets = Array.from({ length: NSRC }, () => []);
  for (const key of cellKeys(bx0, by0, bx1, by1)) {
    const c = cells.get(key);
    if (!c) continue;
    const bc = flt && flt.blocks ? blockCells.get(key) : null;
    for (let i = 0, n = c.id.length; i < n; i++) {
      if (c.x1[i] < bx0 || c.x0[i] > bx1 || c.y1[i] < by0 || c.y0[i] > by1) continue;
      if (flt && c.ly[i] === BLDG_SRC && (bc || (flt.minB && Math.max(c.x1[i] - c.x0[i], c.y1[i] - c.y0[i]) < flt.minB))) continue;
      const id = c.id[i];
      if (seen[id] === stamp) continue;
      seen[id] = stamp;
      buckets[c.ly[i]].push(c.buf.subarray(c.s[i], c.e[i]));
    }
    if (bc) {
      for (let i = 0, n = bc.id.length; i < n; i++) {
        if (bc.x1[i] < bx0 || bc.x0[i] > bx1 || bc.y1[i] < by0 || bc.y0[i] > by1) continue;
        const id = bc.id[i];
        if (seenB[id] === stamp) continue;
        seenB[id] = stamp;
        buckets[BLDG_SRC].push(bc.buf.subarray(bc.s[i], bc.e[i]));
      }
    }
  }
  return buckets;
}

/* ------------------------------------------------------------ extra layers: neighborhood highlight, names, terrain
   Everything here is opt-in and off by default. */
const HOOD_FADE = .6;                          // opacity of the paper-coloured veil outside the highlighted area
const hoodMap = new Map();
let hoodPromise = null;
const hoodByName = n => (n ? hoodMap.get(n) || null : null);
const layerMsg = t => { $('layerMsg').textContent = t || ''; };
function loadHoods() {
  if (!hoodPromise) {
    hoodPromise = fetch('hoods.json').then(r => { if (!r.ok) throw new Error('Could not load the neighborhood outlines (' + r.status + ')'); return r.json(); })
      .then(arr => {
        for (const h of arr) {
          if (!h || typeof h.name !== 'string' || !Array.isArray(h.rings)) continue;
          h.bb = h.rings.map(r => {
            let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
            for (let i = 0; i < r.length; i += 2) { a = Math.min(a, r[i]); c = Math.max(c, r[i]); b = Math.min(b, r[i + 1]); d = Math.max(d, r[i + 1]); }
            return [a, b, c, d, r];
          });
          hoodMap.set(h.name, h);
        }
        if (state.hood && !hoodMap.has(state.hood)) state.hood = '';
        fillHoodSelect(); syncLayerUI(); schedule();
      }).catch(err => { hoodPromise = null; layerMsg(err.message); throw err; });
  }
  return hoodPromise;
}
function fillHoodSelect() {
  const sel = $('hood');
  sel.textContent = '';
  const none = document.createElement('option'); none.value = ''; none.textContent = 'None'; sel.appendChild(none);
  for (const [label, kind] of [['Neighborhoods', 'neighborhood'], ['Cities and towns', 'city']]) {
    const grp = document.createElement('optgroup'); grp.label = label;
    for (const h of hoodMap.values()) if (h.kind === kind) { const o = document.createElement('option'); o.value = h.name; o.textContent = h.name; grp.appendChild(o); }
    if (grp.children.length) sel.appendChild(grp);
  }
  sel.value = state.hood;
}
function syncLayerUI() {
  const sel = $('hood');
  if (state.hood && ![...sel.options].some(o => o.value === state.hood)) {
    const o = document.createElement('option'); o.value = state.hood; o.textContent = state.hood; sel.appendChild(o);
  }
  sel.value = state.hood;
  $('hoodFit').disabled = !hoodByName(state.hood);
  $('oStreets').checked = state.labStreets; $('oPlaces').checked = state.labPlaces; $('oTerrain').checked = state.terrain;
  $('terrAmt').value = state.terrainAmt; $('terrVal').textContent = state.terrainAmt + '%';
  $('terrAmt').disabled = !state.terrain;
}
['focus', 'pointerdown', 'keydown'].forEach(ev => $('hood').addEventListener(ev, () => { loadHoods().catch(() => {}); }));
$('hood').addEventListener('change', e => { state.hood = e.target.value; syncLayerUI(); schedule(); });
/* centre and zoom the view on the highlighted area with a small margin */
$('hoodFit').addEventListener('click', () => {
  const h = hoodByName(state.hood);
  if (!h) return;
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const r of h.bb) { a = Math.min(a, r[0]); b = Math.min(b, r[1]); c = Math.max(c, r[2]); d = Math.max(d, r[3]); }
  const g = geom();
  const need = Math.min(g.mapW / (Math.max(c - a, 40) * 1.16), g.mapH / (Math.max(d - b, 40) * 1.16));
  state.zoom = clamp(need / g.minK, 1, g.maxZoom);
  state.cx = (a + c) / 2; state.cy = (b + d) / 2;
  schedule();
});
for (const id of ['oStreets', 'oPlaces']) $(id).addEventListener('change', () => { layerMsg(''); });
$('oTerrain').addEventListener('change', syncLayerUI);
$('terrAmt').addEventListener('input', e => { state.terrainAmt = clamp(Math.round(+e.target.value) || 60, 10, 100); $('terrVal').textContent = state.terrainAmt + '%'; schedule(); });

/* ---- terrain shading: greyscale relief, multiplied over the map */
let hillIm = null;
function hillImg() {
  if (!hillIm) {
    hillIm = new Image();
    hillIm.onload = () => { hillIm.ready = true; schedule(); };
    hillIm.onerror = () => { hillIm.failed = true; layerMsg('Could not load the terrain image.'); };
    hillIm.src = 'hillshade.jpg';
  }
  return hillIm;
}
async function hillReady() {
  const im = hillImg();
  if (!im.ready && !im.failed) await new Promise(r => { im.addEventListener('load', r); im.addEventListener('error', r); });
  if (!im.ready) throw new Error('Could not load the terrain image.');
  return im;
}
function drawTerrain(ctx, g, d) {
  if (!state.terrain) return;
  const im = hillImg();
  if (!im.ready) return;
  const sx = im.naturalWidth / M.size, sy = im.naturalHeight / M.size;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = state.terrainAmt / 100; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im, g.x0 * sx, (M.size - g.y0 - g.vh) * sy, g.vw * sx, g.vh * sy, 0, 0, g.mapW * d, g.mapH * d);
  ctx.restore();
}
const jpegComps = b => {
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 255) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return b[i + 9];
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return 3;
};
/* JPEG of the part of the relief that covers a base-coordinate window, for one PDF page. Up to 150 pixels per inch of
   paper but never more than the source has. The crop is aligned to whole source pixels; the returned base rectangle is
   exactly what the crop covers. */
async function terrainImage(g, win) {
  const im = await hillReady();
  const W = im.naturalWidth, H = im.naturalHeight, sx = W / M.size, sy = H / M.size;
  const px0 = clamp(Math.floor(win[0] * sx), 0, W - 1), px1 = clamp(Math.ceil(win[2] * sx), px0 + 1, W);
  const py0 = clamp(Math.floor((M.size - win[3]) * sy), 0, H - 1), py1 = clamp(Math.ceil((M.size - win[1]) * sy), py0 + 1, H);
  const sw = px1 - px0, sh = py1 - py0;
  const wantW = (win[2] - win[0]) * g.k / 72 * 150;
  const dw = clamp(Math.round(wantW), Math.min(4, sw), sw), dh = Math.max(1, Math.min(sh, Math.round(sh * dw / sw)));
  if (!terrCan) terrCan = document.createElement('canvas');
  terrCan.width = dw; terrCan.height = dh;
  const c = terrCan.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(im, px0, py0, sw, sh, 0, 0, dw, dh);
  const blob = await new Promise(r => terrCan.toBlob(r, 'image/jpeg', .8));
  if (!blob) throw new Error('Your browser could not make the terrain image.');
  const jpg = new Uint8Array(await blob.arrayBuffer());
  return { jpg, w: dw, h: dh, comps: jpegComps(jpg), bx0: px0 / sx, bx1: px1 / sx, by0: M.size - py1 / sy, by1: M.size - py0 / sy };
}
let terrCan = null;

/* ---- street and place names */
let labFail = false;
const labCells = new Map();                    // cell key -> prepared lines
let placesData = null, placesPromise = null;
const pool = async (items, fn, n = 6) => {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
};
async function loadLabelCell(key) {
  if (labCells.has(key)) return;
  let lines = [];
  try {
    let res = null;
    for (let tryN = 0; tryN < 3 && !(res && res.ok); tryN++) {        // a busy browser sometimes refuses a request: try again
      if (tryN) await new Promise(r => setTimeout(r, 200 * tryN));
      res = await fetch(`labels/${key}.bin`).catch(() => null);
    }
    if (!res || !res.ok) throw new Error('missing');
    let buf = new Uint8Array(await res.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      buf = new Uint8Array(await new Response(ds).arrayBuffer());
    }
    for (const s of JSON.parse(new TextDecoder().decode(buf))) {
      if (!s || typeof s.n !== 'string' || !Array.isArray(s.p) || s.p.length < 4) continue;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, len = 0;
      for (let i = 0; i < s.p.length; i += 2) {
        const x = s.p[i], y = s.p[i + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (i) len += Math.hypot(x - s.p[i - 2], y - s.p[i - 1]);
      }
      lines.push({ n: s.n, c: s.c | 0, p: s.p, x0, y0, x1, y1, len });
    }
  } catch (e) { lines = []; labFail = true; }
  labCells.set(key, lines);
}
const labelKeys = win => {
  const keys = [], cl = v => clamp(Math.floor(v / 540), 0, 15);
  for (let cx = cl(win[0] - 8); cx <= cl(win[2] + 8); cx++) for (let cy = cl(win[1] - 8); cy <= cl(win[3] + 8); cy++) keys.push(cx + '_' + cy);
  return keys;
};
async function loadLabelData(want, win, onProgress) {
  if (want.places && !placesData) {
    if (!placesPromise) placesPromise = fetch('labels/places.json').then(r => (r.ok ? r.json() : [])).catch(() => []).then(a => { placesData = Array.isArray(a) ? a.filter(q => q && typeof q.n === 'string' && Number.isFinite(q.x) && Number.isFinite(q.y)) : []; });
    await placesPromise;
  }
  if (want.streets) {
    const todo = labelKeys(win).filter(k => !labCells.has(k));
    let done = 0;
    await pool(todo, async k => { await loadLabelCell(k); if (onProgress) onProgress(++done, todo.length); });
  }
}

const STREET_SIZE = [10, 9, 7.5, 6.5];         // points, by road class, before scaling
const STREET_MINK = [0, .2, .7, 2.5];         // smallest view scale (points per base unit) at which a class is named
const MAX_TURN = 20 * Math.PI / 180;           // most a street may bend across its label
const MAX_STREET_TRIES = 14000, MAX_LABELS = 4000;
const wrapPi = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const widthCache = new Map();
function measure(font, text) {
  const key = font + '|' + text;
  let w = widthCache.get(key);
  if (w === undefined) { w = textW(font, text); widthCache.set(key, w); }
  return w;
}
/* street names grow with the roads once zoomed in to neighborhood scale */
const streetBoost = k => clamp(Math.pow(k / 2.5, .55), 1, 3);
const labelScale = g => clamp(.8 + .45 * g.o, .9, 1.35) * clamp(Math.pow(g.k / 4, .12), .85, 1.35);

/* Samples a street (base coordinates) at even spacing `d` in frame points, keeping only the parts inside the rectangle
   `r`; each unbroken piece becomes one run (flat x,y array). */
function resample(p, g, d, r, runs) {
  const { k, mapH } = g;
  let px = (p[0] - g.x0) * k, py = mapH - (p[1] - g.y0) * k, run = null, carry = 0;
  for (let i = 2; i < p.length; i += 2) {
    const cx = (p[i] - g.x0) * k, cy = mapH - (p[i + 1] - g.y0) * k;
    const dx = cx - px, dy = cy - py, len = Math.hypot(dx, dy);
    let t0 = 0, t1 = 1, ok = len > 1e-9;
    if (ok) for (const [pp, qq] of [[-dx, px - r[0]], [dx, r[2] - px], [-dy, py - r[1]], [dy, r[3] - py]]) {
      if (pp === 0) { if (qq < 0) ok = false; } else { const t = qq / pp; if (pp < 0) { if (t > t1) ok = false; else if (t > t0) t0 = t; } else if (t < t0) ok = false; else if (t < t1) t1 = t; }
    }
    if (ok && t1 > t0) {
      if (t0 > 0 || !run) { run = []; runs.push(run); carry = t0 * len; }
      let s = carry;
      for (; s <= t1 * len + 1e-9; s += d) run.push(px + dx * s / len, py + dy * s / len);
      carry = s - t1 * len;
      if (t1 < 1) run = null;
    } else run = null;
    px = cx; py = cy;
  }
}

/* "OHIO RIVER" along the river, letter by letter: each letter is its own label item, rotated to the river's local direction.
   The text goes on the stretch of river inside the label area where it can be largest and straightest. */
function placeRiverName(g, LT, out, inside, free, claim, ax0, ay0, ax1, ay1) {
  const { k, o } = g, text = 'OHIO RIVER', chars = [...text];
  const adv = chars.map(ch => textW(letterFont(LT, 1), ch));                 // advance of each letter per point of size
  const advSum = adv.reduce((a, b) => a + b, 0), LS = .42;                  // letter spacing as a share of the size
  const per = advSum + LS * (chars.length - 1);                             // the whole text's length per point of size
  const wPt = RIVER_W * k, cap = 58 * o;
  if (wPt * .62 < 8) return;                                                // the river is too narrow at this zoom
  const d = Math.max(2, Math.min(8, wPt * .12));
  const runs = [], pad = wPt * .2;
  resample(RIVER, g, d, [ax0 + pad, ay0 + pad, ax1 - pad, ay1 - pad], runs);
  let best = null;
  for (const q of runs) {
    const n = q.length / 2, len = (n - 1) * d;
    if (n < 4) continue;
    const size = Math.min(wPt * .62, cap, len * .9 / per);
    if (size >= 8 && (!best || size > best.size + 1e-6 || (Math.abs(size - best.size) < 1e-6 && len > best.len))) best = { q, n, len, size };
  }
  if (!best) return;
  let { q, n, size } = best;
  const total = size * per;
  let hd0 = Math.atan2(q[2 * n - 1] - q[1], q[2 * n - 2] - q[0]);
  if (hd0 > Math.PI / 2 - .05 || hd0 <= -Math.PI / 2 - .05) {               // read left to right (upwards when the river runs straight down)
    const r = new Array(q.length);
    for (let i = 0; i < n; i++) { r[2 * i] = q[2 * (n - 1 - i)]; r[2 * i + 1] = q[2 * (n - 1 - i) + 1]; }
    q = r;
  }
  const headAt = (s0, s1) => {                                                // direction of the chord between two arc positions
    const a = at(s0), b = at(s1);
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  const at = s => {
    const f = clamp(s / d, 0, n - 1), i = Math.min(n - 2, Math.floor(f)), t = f - i;
    return [q[2 * i] + (q[2 * i + 2] - q[2 * i]) * t, q[2 * i + 1] + (q[2 * i + 3] - q[2 * i + 1]) * t];
  };
  const slack = (n - 1) * d - total;
  const cands = [];
  for (let j = 0; j <= 12; j++) {
    const t0 = slack * j / 12;
    const turn = Math.abs(wrapPi(headAt(t0 + total * .5, t0 + total) - headAt(t0, t0 + total * .5)));
    cands.push([turn + .5 * Math.abs(j / 12 - .5), t0]);
  }
  cands.sort((a, b) => a[0] - b[0]);
  for (const [, t0] of cands.slice(0, 8)) {
    const items = [];
    let s = t0, ok = true;
    for (let i = 0; i < chars.length && ok; i++) {
      const a = adv[i] * size;
      if (chars[i] !== ' ') {
        const c = s + a / 2, p = at(c), ang = headAt(c - a / 2 - size * .1, c + a / 2 + size * .1);
        const rr = Math.max(a, size * .7) / 2 + 1, box = [p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr];
        if (!inside(box) || !free(box)) ok = false;
        else items.push({ text: chars[i], x: p[0], y: p[1], angle: ang, size, kind: 'river', font: letterFont(LT, size), ls: 0, box, letter: true, halo: false, fill: waterInk(waterFill(), .55) });
      }
      s += a + size * LS;
    }
    if (!ok) continue;
    for (const it of items) { claim(it.box); out.push(it); }
    return;
  }
}

/* Decides every label for one view: returns [{ text, x, y, angle, size, kind, font, ls, box }] in frame coordinates
   (points, origin top-left, y down). One function for the preview, the PDFs and the PNG, so they always agree.
   `want` = { streets, places, border }; `win` = base-coordinate window whose streets are considered (default: the view).
   The label data for `win` must already be loaded (see loadLabelData). */
function placeLabels(g, want, win) {
  const out = [];
  if (!want.streets && !want.places) return out;
  const { mapW, mapH, k, o } = g;
  win = win || [g.x0, g.y0, g.x0 + g.vw, g.y0 + g.vh];
  const B = want.border ? 108 * o : 0, ax0 = B, ay0 = B, ax1 = mapW - B, ay1 = mapH - B;
  const sc = labelScale(g), GS = 48, grid = new Map(), gk = (i, j) => i * 16384 + j, LT = activeLetter(), lf = LT ? LT.fix : 1;
  const inside = b => b[0] >= ax0 && b[1] >= ay0 && b[2] <= ax1 && b[3] <= ay1;
  const free = b => {
    for (let i = Math.floor(b[0] / GS); i <= Math.floor(b[2] / GS); i++) for (let j = Math.floor(b[1] / GS); j <= Math.floor(b[3] / GS); j++) {
      const c = grid.get(gk(i, j));
      if (c) for (const q of c) if (b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]) return false;
    }
    return true;
  };
  const claim = b => {
    for (let i = Math.floor(b[0] / GS); i <= Math.floor(b[2] / GS); i++) for (let j = Math.floor(b[1] / GS); j <= Math.floor(b[3] / GS); j++) {
      const key = gk(i, j);
      if (grid.has(key)) grid.get(key).push(b); else grid.set(key, [b]);
    }
  };

  if (want.landmarks) for (const it of landmarkItems(g)) claim([it.x - it.s / 2, it.y - it.s / 2, it.x + it.s / 2, it.y + it.s / 2]);   // names keep clear of the drawings

  if (want.places && placesData) {
    for (const r of [0, 1]) for (const q of placesData) {
      if ((q.r ? 1 : 0) !== r) continue;
      if (q.x < win[0] - 700 || q.x > win[2] + 700 || q.y < win[1] - 700 || q.y > win[3] + 700) continue;
      let size = (r ? 10.5 : 15.5) * sc;
      if (size < 5.5) continue;
      if (LT) size *= lf;
      const text = winAnsi(q.n).toUpperCase();
      const font = LT ? letterFont(LT, size) : `${r ? 'italic' : 'bold'} ${f5(size)}px ${SERIF}`, ls = size * (r ? .12 : .18);
      const w = measure(font, text) + ls * text.length;
      const x = (q.x - g.x0) * k, y = mapH - (q.y - g.y0) * k;
      const box = [x - w / 2 - 2, y - size * .6 - 2, x + w / 2 + 2, y + size * .6 + 2];
      if (!inside(box) || !free(box)) continue;
      claim(box);
      out.push({ text, x, y, angle: 0, size, kind: r ? 'hood' : 'city', font, ls, box, letter: !!LT });
    }
  }

  if (LT) placeRiverName(g, LT, out, inside, free, claim, ax0, ay0, ax1, ay1);

  if (want.streets) {
    const ssc = sc * streetBoost(k);
    const on = [0, 1, 2, 3].filter(c => k >= STREET_MINK[c] && STREET_SIZE[c] * ssc >= 5);
    const cand = [[], [], [], []];
    let seq = 0;
    for (const key of labelKeys(win)) {
      const lines = labCells.get(key);
      if (!lines) continue;
      for (const ln of lines) {
        if (!on.includes(ln.c) || ln.c > 3 || ln.c < 0) continue;
        if (ln.x1 < win[0] - 8 || ln.x0 > win[2] + 8 || ln.y1 < win[1] - 8 || ln.y0 > win[3] + 8) continue;
        cand[ln.c].push([ln.len * k, seq++, ln]);
      }
    }
    const reps = new Map();
    let tries = 0;
    outer: for (const c of on) {
      cand[c].sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      const size = STREET_SIZE[c] * ssc * lf, font = LT ? letterFont(LT, size) : `${c === 0 ? 'bold ' : ''}${f5(size)}px ${SANS}`;
      const d = Math.max(size * .7, 3.5), rect = [ax0 - size, ay0 - size, ax1 + size, ay1 + size];
      for (const [flen, , ln] of cand[c]) {
        if (flen < size * 3) break;                      // sorted: everything after is shorter still
        if (++tries > MAX_STREET_TRIES || out.length >= MAX_LABELS) break outer;
        const text = winAnsi(ln.n).trim();
        if (!text) continue;
        const w = measure(font, text), need = w + size * .7;
        if (flen < need) continue;
        const rep = Math.max(216, w * 3);
        const runs = [];
        resample(ln.p, g, d, rect, runs);
        const m = Math.ceil(need / d) + 1, stp = Math.max(1, Math.floor(m / 4)), t = Math.max(1, Math.floor((m - 1) / 3));
        for (const q of runs) {
          const n = q.length / 2;
          if (n < m) continue;
          const hd = (a, b) => Math.atan2(q[2 * b + 1] - q[2 * a + 1], q[2 * b] - q[2 * a]);
          const cs = [];
          for (let j = 0; j + m <= n; j += stp) {
            const h1 = hd(j, j + t), h2 = hd(j + t, j + m - 1 - t), h3 = hd(j + m - 1 - t, j + m - 1);
            const spread = Math.max(Math.abs(wrapPi(h1 - h2)), Math.abs(wrapPi(h2 - h3)), Math.abs(wrapPi(h1 - h3)));
            if (spread > MAX_TURN) continue;
            cs.push([spread / MAX_TURN + .25 * Math.abs(2 * (j + (m - 1) / 2) / (n - 1) - 1), j]);
          }
          cs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          const maxPer = clamp(Math.floor((n - 1) * d / rep), 1, 5);
          let placed = 0;
          for (let ci = 0; ci < cs.length && ci < 14 && placed < maxPer; ci++) {
            const j = cs[ci][1], mid = j + (m - 1) / 2, i0 = Math.floor(mid), i1 = Math.ceil(mid);
            const x = (q[2 * i0] + q[2 * i1]) / 2, y = (q[2 * i0 + 1] + q[2 * i1 + 1]) / 2;
            let ang = hd(j, j + m - 1);
            if (ang > Math.PI / 2) ang -= Math.PI; else if (ang <= -Math.PI / 2) ang += Math.PI;
            const cc = Math.abs(Math.cos(ang)), ss = Math.abs(Math.sin(ang)), ew = w / 2 + 1.5, eh = size * .55 + 1.5;
            const hx = cc * ew + ss * eh, hy = ss * ew + cc * eh, box = [x - hx, y - hy, x + hx, y + hy];
            if (!inside(box) || !free(box)) continue;
            const rp = reps.get(text) || [];
            if (rp.some(([rx, ry]) => Math.hypot(rx - x, ry - y) < rep)) continue;
            rp.push([x, y]); reps.set(text, rp);
            claim(box);
            out.push({ text, x, y, angle: ang, size, kind: 'street', cls: c, font, ls: 0, box, letter: !!LT });
            placed++;
          }
        }
      }
    }
  }
  return out;
}
const wantLabels = () => ({ streets: state.labStreets, places: state.labPlaces, border: state.border, landmarks: state.landmarks });
async function computeLabels(g, win, onProgress) {
  const want = wantLabels();
  if (!want.streets && !want.places) return [];
  win = win || [g.x0, g.y0, g.x0 + g.vw, g.y0 + g.vh];
  if (want.landmarks) await loadLandmarks();
  await loadLabelData(want, win, onProgress);
  return placeLabels(g, want, win);
}

/* Draws placed labels: theme ink with a paper-coloured halo. Used by the preview, the PNG and (per page) the PDF. */
function drawLabels(ctx, list, pal, dx, dy) {
  if (!list.length) return;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.textAlign = 'center';
  for (const L of list) {
    ctx.save();
    ctx.translate(L.x + (dx || 0), L.y + (dy || 0));
    if (L.angle) ctx.rotate(L.angle);
    ctx.font = L.font; ctx.letterSpacing = L.ls ? f5(L.ls) + 'px' : '0px';
    if (L.letter) ctx.fontKerning = 'none';
    const by = L.size * .34;
    if (L.halo !== false) { ctx.lineWidth = L.size * .3; ctx.strokeStyle = pal.paper; ctx.strokeText(L.text, 0, by); }
    ctx.fillStyle = L.fill || pal.ink; ctx.fillText(L.text, 0, by);
    ctx.restore();
  }
  ctx.restore();
}
/* PDF operators for the labels that touch one page's clip box (bleed included), so a label on a seam is on both pages */
function labelOps(g, list, t, ox, oy, pal, alphas) {
  const fx0 = t.cx0 - ox, fx1 = t.cx1 - ox, fy0 = oy + g.mapH - t.cy1, fy1 = oy + g.mapH - t.cy0;
  const sel = list.filter(L => L.box[2] >= fx0 && L.box[0] <= fx1 && L.box[3] >= fy0 && L.box[1] <= fy1);
  if (!sel.length) return '';
  const pc = new PdfCtx(alphas);
  drawLabels(pc, sel, pal);
  return pc.o.join('\n') + '\n';
}

/* preview: placements are recomputed once the view settles; meanwhile the previous set is drawn shifted (pan) or hidden */
const labelState = { key: '', list: null, g: null };
let labelTimer = 0, labelRun = 0;
const labFlags = () => [state.border, state.labStreets, state.labPlaces, state.lettering, !!activeLetter(), state.landmarks, !!landmarkData].join();
const labelKey = g => [g.x0, g.y0, g.k, g.mapW, g.mapH, g.o, labFlags()].join();
function previewLabels(g) {
  if ((!state.labStreets && !state.labPlaces) || !labelState.list) return null;
  if (labelState.key === labelKey(g)) return { list: labelState.list, dx: 0, dy: 0 };
  const p = labelState.g;
  if (p.k === g.k && p.mapW === g.mapW && p.mapH === g.mapH && p.o === g.o && labelState.flags === labFlags())
    return { list: labelState.list, dx: (p.x0 - g.x0) * g.k, dy: (g.y0 - p.y0) * g.k };
  return null;
}
function queueLabels(g) {
  if (!state.labStreets && !state.labPlaces) return;
  if (labelState.key === labelKey(g)) return;
  clearTimeout(labelTimer);
  labelTimer = setTimeout(runLabels, 220);
}
async function runLabels() {
  if (ptrs.size) return queueLabels(geom());
  const run = ++labelRun, g = geom(), key = labelKey(g);
  if (labelState.key === key || (!state.labStreets && !state.labPlaces)) return;
  layerMsg('Placing names...');
  try {
    const list = await computeLabels(g);
    if (run !== labelRun) return;
    labelState.key = key; labelState.list = list; labelState.g = g; labelState.flags = labFlags();
    layerMsg(labFail ? 'Some street names could not be loaded. Reload the page to try again.' : '');
    schedule();
  } catch (err) { if (run === labelRun) layerMsg('Could not place names: ' + err.message); }
}

/* ------------------------------------------------------------ old-chart details: shore lines and hachured hills
   Both are optional. The data are art/water.bin (dissolved water polygons) and art/hachures/<cx>_<cy>.bin (short downhill
   strokes). Everything is clipped to the page window before it is written, so a page carries only what it shows. */
let waterPolys = null, waterPromise = null;
function loadWater() {
  if (!waterPromise) {
    waterPromise = fetch('art/water.bin').then(async r => {
      if (!r.ok) throw new Error('Could not load the water shapes (' + r.status + ')');
      const arr = JSON.parse(new TextDecoder().decode(await gunzipIf(r)));
      waterPolys = (Array.isArray(arr) ? arr : []).filter(p => p && Array.isArray(p.b) && p.b.length === 4 && Array.isArray(p.r) && p.r.length)
        .map(p => ({ b: p.b, r: p.r.filter(q => Array.isArray(q) && q.length >= 6) }));
      for (const p of waterPolys) p.rb = p.r.map(q => { let a = 1e18, b = 1e18, c = -1e18, d = -1e18; for (let i = 0; i < q.length; i += 2) { const x = q[i], y = q[i + 1]; if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } return [a, b, c, d]; });
    }).catch(err => { waterPromise = null; throw err; });
  }
  return waterPromise;
}
const hachCells = new Map();                      // key -> Float32Array [x1,y1,x2,y2, ...]
async function loadHach(key) {
  if (hachCells.has(key)) return;
  let a = new Float32Array(0);
  try {
    const res = await fetch(`art/hachures/${key}.bin`);
    if (res.ok) { const j = JSON.parse(new TextDecoder().decode(await gunzipIf(res))); if (Array.isArray(j)) a = Float32Array.from(j); }
  } catch (e) { /* a missing or unreadable tile simply has no strokes */ }
  hachCells.set(key, a);
}
const hachKeys = win => {
  const keys = [], cl = v => clamp(Math.floor(v / M.cell), 0, M.n - 1);
  for (let cx = cl(win[0] - 6); cx <= cl(win[2] + 6); cx++) for (let cy = cl(win[1] - 6); cy <= cl(win[3] + 6); cy++) keys.push(cx + '_' + cy);
  return keys;
};
/* make sure the data for the chosen details covering a base-coordinate window is loaded */
async function ensureDeco(win) {
  if (state.shore) await loadWater();
  if (state.hachure) await pool(hachKeys(win).filter(k => !hachCells.has(k)), loadHach);
}

/* ---- shore lines: concentric fine lines inside the bank. For each polygon: clip to it, then stroke its outline from the
   widest to the narrowest, alternating a line tone and the plain water colour, so thin lines remain at fixed distances. */
function shoreSpec(g) {
  const o = g.o, S = clamp(3.2 * o, 1.4, 4.4), n = 4;       // spacing in points
  const wf = waterFill(), dk = waterInk(wf, .5), strokes = [];
  for (let i = n; i >= 1; i--) {
    const d = i * S, lw = clamp(.5 * o * (1 - .17 * (i - 1)), .22, 1.1);
    strokes.push({ w: 2 * d, hex: mixHex(dk, wf, (i - 1) / n * .75) }, { w: 2 * (d - lw), hex: wf });
  }
  return { strokes, reach: n * S + 2, minSize: 12 * S };       // minSize: the smallest pond (longest side, points) that gets lines
}
/* Sutherland-Hodgman: one closed ring (flat x,y array) against a rectangle; null when nothing is left */
function clipRing(r, x0, y0, x1, y1, rb) {
  if (rb[2] < x0 || rb[0] > x1 || rb[3] < y0 || rb[1] > y1) return null;
  if (rb[0] >= x0 && rb[2] <= x1 && rb[1] >= y0 && rb[3] <= y1) return r;
  let p = r;
  for (let pl = 0; pl < 4; pl++) {
    const n = p.length >> 1, q = [];
    if (!n) return null;
    const d = (x, y) => (pl === 0 ? x - x0 : pl === 1 ? x1 - x : pl === 2 ? y - y0 : y1 - y);
    let px = p[2 * n - 2], py = p[2 * n - 1], pd = d(px, py);
    for (let i = 0; i < n; i++) {
      const cx = p[2 * i], cy = p[2 * i + 1], cd = d(cx, cy);
      if (cd >= 0) { if (pd < 0) { const t = pd / (pd - cd); q.push(px + (cx - px) * t, py + (cy - py) * t); } q.push(cx, cy); }
      else if (pd >= 0) { const t = pd / (pd - cd); q.push(px + (cx - px) * t, py + (cy - py) * t); }
      px = cx; py = cy; pd = cd;
    }
    p = q;
  }
  return p.length >= 6 ? p : null;
}
/* the clipped rings of every polygon that matters inside a base-coordinate window, with the margin that keeps the artificial
   edges of the clip out of sight: [{ rings: [flat arrays] }] */
function shoreRings(g, win, sp) {
  const m = (sp.reach + 3) / g.k, x0 = win[0] - m, y0 = win[1] - m, x1 = win[2] + m, y1 = win[3] + m, out = [];
  for (const poly of waterPolys) {
    const b = poly.b;
    if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;
    if (Math.max(b[2] - b[0], b[3] - b[1]) * g.k < sp.minSize) continue;
    const rings = [];
    poly.r.forEach((r, i) => { const c = clipRing(r, x0, y0, x1, y1, poly.rb[i]); if (c) rings.push(c); });
    if (rings.length) out.push(rings);
  }
  return out;
}
class StrSink {                                   // builds PDF path text; `dec` decimals
  constructor(dec) { this.dec = dec; this.s = ''; }
  poly(a, n, closed) {
    const dec = this.dec, f = v => String(+v.toFixed(dec));
    let s = '';
    for (let i = 0; i < n; i++) s += f(a[2 * i]) + ' ' + f(a[2 * i + 1]) + (i ? ' l ' : ' m ');
    this.s += s + (closed ? 'h ' : '');
  }
}
const ringBytes = r => {                          // a ring as path text that xfItem can read
  let s = '';
  for (let i = 0; i < r.length; i += 2) s += r[i] + ' ' + r[i + 1] + (i ? ' l ' : ' m ');
  return enc.encode(s + 'h');
};
/* PDF operators for the shore lines of one window; the caller has the map layers' matrix in force */
function shoreOps(g, win, xf) {
  const sp = shoreSpec(g), polys = shoreRings(g, win, sp), k = g.k;
  const dec = k <= .2 ? 0 : k <= 2 ? 1 : 2, spec = xf ? makeSpec(Object.assign({}, xf, { area: false, minPt: 0 }), k) : null;
  let out = '';
  for (const rings of polys) {
    const sink = new StrSink(dec);
    for (const r of rings) { if (spec) xfItem(ringBytes(r), spec, sink); else sink.poly(r, r.length >> 1, true); }
    if (!sink.s) continue;
    out += `q 1 J 1 j [] 0 d ${sink.s}W* n\n`;
    for (const st of sp.strokes) out += `${hexrgb(st.hex)} RG ${f5(st.w / k)} w ${sink.s}S\n`;
    out += 'Q\n';
  }
  return out;
}
/* the same on a canvas whose transform already maps base coordinates (y up) to pixels */
function paintShore(ctx, g, win, xf) {
  const sp = shoreSpec(g), polys = shoreRings(g, win, sp), k = g.k;
  const spec = xf ? makeSpec(Object.assign({}, xf, { area: false, minPt: 0 }), k) : null;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.setLineDash([]);
  for (const rings of polys) {
    const sink = new PathSink();
    for (const r of rings) { if (spec) xfItem(ringBytes(r), spec, sink); else sink.poly(r, r.length >> 1, true); }
    if (!sink.count) continue;
    ctx.save();
    ctx.clip(sink.P, 'evenodd');
    for (const st of sp.strokes) { ctx.strokeStyle = st.hex; ctx.lineWidth = st.w / k; ctx.stroke(sink.P); }
    ctx.restore();
  }
  ctx.restore();
}

/* ---- hachures: each stroke becomes a thin triangle, wide at the top of the slope and pointed downhill */
const hachStride = k => Math.max(1, Math.round(1 / (1.1 * k * k)));            // thinning at far zoom: keep every nth stroke of each tile
const hachWidth = k => clamp(.36 * Math.pow(Math.max(k, .05), .18), .26, .5);   // points
const hachStats = { strokes: 0, kept: 0 };
/* triangles (flat array of 6 numbers each, base coordinates) for the strokes touching a window */
function hachTris(g, win) {
  const k = g.k, st = hachStride(k), len = clamp(Math.pow(st, .3), 1, 2.2), hw = hachWidth(k) * .85 / k;
  const out = [];
  let seen = 0;
  for (const key of hachKeys(win)) {
    const a = hachCells.get(key);
    if (!a) continue;
    for (let i = 0, j = 0; i < a.length; i += 4, j++) {
      seen++;
      if (j % st) continue;
      const x1 = a[i], y1 = a[i + 1];
      let x2 = a[i + 2], y2 = a[i + 3];
      if (len !== 1) { x2 = x1 + (x2 - x1) * len; y2 = y1 + (y2 - y1) * len; }
      if (Math.max(x1, x2) < win[0] - hw || Math.min(x1, x2) > win[2] + hw || Math.max(y1, y2) < win[1] - hw || Math.min(y1, y2) > win[3] + hw) continue;
      const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      const nx = -dy / l * hw, ny = dx / l * hw;
      out.push(x1 + nx, y1 + ny, x1 - nx, y1 - ny, x2, y2);
    }
  }
  hachStats.strokes = seen; hachStats.kept = out.length / 6;
  return out;
}
/* PDF operators (map-layer matrix in force) for the hachures of one window; colour is the overlay ink */
function hachOps(g, win, ink) {
  const t = hachTris(g, win);
  if (!t.length) return '';
  const k = g.k, dec = k <= .2 ? 0 : k <= 2 ? 1 : 2, f = v => String(+v.toFixed(dec + 1));
  const parts = [`${hexrgb(ink)} rg\n`];
  let s = '';
  for (let i = 0; i < t.length; i += 6) {
    s += f(t[i]) + ' ' + f(t[i + 1]) + ' m ' + f(t[i + 2]) + ' ' + f(t[i + 3]) + ' l ' + f(t[i + 4]) + ' ' + f(t[i + 5]) + ' l f\n';
    if (s.length > 60000) { parts.push(s); s = ''; }
  }
  parts.push(s);
  return parts.join('');
}
function paintHach(ctx, g, win, ink) {
  const t = hachTris(g, win);
  if (!t.length) return;
  ctx.fillStyle = ink;
  for (let a = 0; a < t.length; a += 6 * 20000) {                  // in batches: one path with hundreds of thousands of pieces is slow to fill
    const P = new Path2D();
    for (let i = a, e = Math.min(t.length, a + 6 * 20000); i < e; i += 6) { P.moveTo(t[i], t[i + 1]); P.lineTo(t[i + 2], t[i + 3]); P.lineTo(t[i + 4], t[i + 5]); P.closePath(); }
    ctx.fill(P, 'nonzero');
  }
}

/* ------------------------------------------------------------ PDF */
const enc = new TextEncoder();
const f2 = n => String(+n.toFixed(2));
const f5 = n => String(+n.toFixed(5));
const hexrgb = h => [1, 3, 5].map(i => +(parseInt(h.substr(i, 2), 16) / 255).toFixed(3)).join(' ');

class PdfCtx {
  constructor(alphas) {
    this.o = []; this.p = []; this.st = []; this.alphas = alphas;
    this.fillStyle = '#000000'; this.strokeStyle = '#000000'; this.lineWidth = 1;
    this.dash = []; this.globalAlpha = 1; this.lineCap = 'butt'; this.lineJoin = 'miter';
    this.font = '10px Arial'; this.textAlign = 'left'; this.letterSpacing = '0px';
  }
  save() { this.o.push('q'); this.st.push([this.fillStyle, this.strokeStyle, this.lineWidth, this.dash, this.globalAlpha, this.lineCap, this.lineJoin, this.font, this.textAlign, this.letterSpacing]); }
  restore() { this.o.push('Q'); [this.fillStyle, this.strokeStyle, this.lineWidth, this.dash, this.globalAlpha, this.lineCap, this.lineJoin, this.font, this.textAlign, this.letterSpacing] = this.st.pop(); }
  /* Text: ctx.font is a CSS-like string with a px size, e.g. `bold 12px "Times New Roman", serif` (serif -> Times,
     anything else -> Helvetica; bold and italic are honoured). Only textBaseline 'alphabetic' is supported.
     (x, y) is in the current user space, which may be y-down: the text matrix un-flips it so it never prints mirrored. */
  measureText(s) { return { width: textW(this.font, winAnsi(s)) }; }
  /* letterSpacing is a CSS length in px (points here); returns the extra advance for a string and the Tc operator text */
  tracking(t) { const ls = parseFloat(this.letterSpacing) || 0; return { ls, w: ls * [...t].length }; }
  textPos(t, x) {
    const tr = this.tracking(t), full = textW(this.font, t) + tr.w;
    return { tr, x: x - (this.textAlign === 'center' ? full / 2 : this.textAlign === 'right' || this.textAlign === 'end' ? full : 0) };
  }
  fillText(s, x, y) {
    const t = winAnsi(s);
    if (!t) return;
    const f = pdfFont(this.font), tp = this.textPos(t, x);
    this.o.push(`${hexrgb(this.fillStyle)} rg ${this.gs()} BT /${f.key} ${f5(f.size)} Tf ${tp.tr.ls ? f5(tp.tr.ls) + ' Tc ' : ''}1 0 0 -1 ${f5(tp.x)} ${f5(y)} Tm (${pdfStr(t)}) Tj${tp.tr.ls ? ' 0 Tc' : ''} ET`);
  }
  /* outlined text (text render mode 1) in the stroke colour: used for the halo behind labels */
  strokeText(s, x, y) {
    const t = winAnsi(s);
    if (!t) return;
    const f = pdfFont(this.font), tp = this.textPos(t, x);
    this.o.push(`${hexrgb(this.strokeStyle)} RG ${this.gs()} ${f5(this.lineWidth)} w ${this.lineJoin === 'round' ? 1 : 0} j 0 J [] 0 d BT /${f.key} ${f5(f.size)} Tf ${tp.tr.ls ? f5(tp.tr.ls) + ' Tc ' : ''}1 Tr 1 0 0 -1 ${f5(tp.x)} ${f5(y)} Tm (${pdfStr(t)}) Tj 0 Tr${tp.tr.ls ? ' 0 Tc' : ''} ET`);
  }
  translate(x, y) { this.o.push(`1 0 0 1 ${f5(x)} ${f5(y)} cm`); }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); this.o.push(`${f5(c)} ${f5(s)} ${f5(-s)} ${f5(c)} 0 0 cm`); }
  scale(x, y) { this.o.push(`${f5(x)} 0 0 ${f5(y)} 0 0 cm`); }
  beginPath() { this.p = []; }
  moveTo(x, y) { this.p.push(`${f5(x)} ${f5(y)} m`); }
  lineTo(x, y) { this.p.push(`${f5(x)} ${f5(y)} l`); }
  bezierCurveTo(a, b, c, d, e, f) { this.p.push(`${f5(a)} ${f5(b)} ${f5(c)} ${f5(d)} ${f5(e)} ${f5(f)} c`); }
  closePath() { this.p.push('h'); }
  rect(x, y, w, h) { this.p.push(`${f5(x)} ${f5(y)} ${f5(w)} ${f5(h)} re`); }
  arc(x, y, r) {
    const k = .5522847498 * r;
    this.moveTo(x + r, y);
    this.bezierCurveTo(x + r, y + k, x + k, y + r, x, y + r);
    this.bezierCurveTo(x - k, y + r, x - r, y + k, x - r, y);
    this.bezierCurveTo(x - r, y - k, x - k, y - r, x, y - r);
    this.bezierCurveTo(x + k, y - r, x + r, y - k, x + r, y);
  }
  setLineDash(d) { this.dash = d; }
  gs() { const a = Math.round(this.globalAlpha * 100); this.alphas.add(a); return `/A${a} gs`; }
  fill(rule) { this.o.push(`${hexrgb(this.fillStyle)} rg ${this.gs()} ${this.p.join(' ')} ${rule === 'evenodd' ? 'f*' : 'f'}`); }
  stroke() {
    this.o.push(`${hexrgb(this.strokeStyle)} RG ${this.gs()} ${f5(this.lineWidth)} w ${this.lineCap === 'round' ? 1 : 0} J ${this.lineJoin === 'round' ? 1 : this.lineJoin === 'bevel' ? 2 : 0} j ` +
      `[${this.dash.map(f5).join(' ')}] 0 d ${this.p.join(' ')} S`);
  }
  clip() { this.o.push(this.p.join(' ') + ' W n'); }
}

class PdfDoc {
  constructor() { this.parts = []; this.off = []; this.len = 0; this.n = 0; this.put('%PDF-1.4\n%âãÏÓ\n'); }
  put(x) { const b = typeof x === 'string' ? enc.encode(x) : x; this.parts.push(b); this.len += b.length; }
  alloc() { return ++this.n; }
  obj(num, dict, stream) {
    this.off[num] = this.len;
    this.put(`${num} 0 obj\n`);
    if (stream) {
      this.put(`<< ${dict} /Length ${stream.length} >>\nstream\n`);
      this.put(stream);
      this.put('\nendstream\nendobj\n');
    } else this.put(`${dict}\nendobj\n`);
  }
  finish(root) {
    const x = this.len;
    let s = `xref\n0 ${this.n + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= this.n; i++) s += String(this.off[i]).padStart(10, '0') + ' 00000 n \n';
    s += `trailer\n<< /Size ${this.n + 1} /Root ${root} 0 R >>\nstartxref\n${x}\n%%EOF\n`;
    this.put(s);
    return new Blob(this.parts, { type: 'application/pdf' });
  }
}

async function deflate(parts) {
  const s = new Blob(parts).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/* content-stream parts for the map layers inside the current clip */
function layerParts(parts, g, buckets, tx, ty, P, win) {
  const ws = widthScale(g.k);
  parts.push(`${f5(g.k)} 0 0 ${f5(g.k)} ${f2(tx)} ${f2(ty)} cm\n1 j\n`);
  for (const p of P) {
    if (p.kind === 'shore') { if (win) parts.push(shoreOps(g, win, null)); continue; }
    const items = buckets[p.src];
    if (!items.length) continue;
    const rgb = hexrgb(p.hex || '#000000');
    if (p.kind === 'fill') {
      if (p.outline) {
        parts.push(`${rgb} rg ${hexrgb(p.outline)} RG ${f5(.22 * ws)} w [] 0 d\n`);
        for (let i = 0; i < items.length; i++) parts.push(items[i].subarray(0, items[i].length - 3), 'B*\n');
      } else {
        parts.push(`${rgb} rg\n`);
        for (let i = 0; i < items.length; i++) parts.push(items[i]);
      }
    } else if (p.kind === 'shadow') {
      const so = shadowOff(g.k) / g.k;
      parts.push(`q 1 0 0 1 ${f5(so)} ${f5(-so)} cm ${rgb} rg\n`);
      for (let i = 0; i < items.length; i++) parts.push(items[i]);
      parts.push('Q\n');
    } else if (p.kind === 'pattern') {
      parts.push(`/Pattern cs /${p.pat.id} scn\n`);
      for (let i = 0; i < items.length; i++) parts.push(items[i]);
    } else {
      const d = p.dash ? `[${f5(p.dash * ws)} ${f5(p.dash * ws)}] 0 d ` : '';
      parts.push(`q ${p.butt ? 0 : 1} J ${d}${rgb} RG ${f5(p.width * ws)} w\n`);
      for (let i = 0; i < items.length; i++) {
        parts.push(items[i]);
        if (i % 150 === 149) parts.push('S\n');
      }
      parts.push('S\nQ\n');
    }
  }
}

const rowName = r => { let s = ''; r++; while (r > 0) { r--; s = String.fromCharCode(65 + r % 26) + s; r = Math.floor(r / 26); } return s; };
const esc = s => s.replace(/[\\()]/g, m => '\\' + m);
const feet = v => { const f = Math.floor(v / 12), i = Math.round((v - f * 12) * 100) / 100; return i ? `${f} ft ${i} in` : `${f} ft`; };

let busy = false;
function progress(frac, text) {
  $('progress').hidden = false;
  $('bar').style.width = Math.round(frac * 100) + '%';
  $('ptext').textContent = text;
}
const tick = () => new Promise(r => setTimeout(r, 0));

/* everything drawOverlay needs from the user's choices (the preview passes `state`, which has the same fields) */
const overlayOpt = () => ({ border: state.border, compass: state.compass, rings: state.rings, theme: state.theme,
  title: state.title, subtitle: state.subtitle, tpos: state.tpos, markers: state.markers, hood: state.hood, draw: state.draw,
  landmarks: state.landmarks, ornate: state.ornate, lettering: state.lettering });

/* Where tile (row r from the top, column c from the left) sits on its page, in PDF points (y up).
   Outside edges sit 0.5 in from the paper edge and are never trimmed: column 1 hugs the left, every other column
   the right; row A hugs the top, every other row the bottom. A single column or row is centred on the sheet. */
function tileBox(g, r, c) {
  const { pw, ph, cols, rows } = g;
  const rb = rows - 1 - r;
  const lB = c > 0 ? BLEED : 0, rB = c < cols - 1 ? BLEED : 0, bB = rb > 0 ? BLEED : 0, tB = rb < rows - 1 ? BLEED : 0;
  const w = g.colW[c], h = g.rowH[r];
  const px = cols === 1 ? (pw - w) / 2 : c === 0 ? EDGE : pw - EDGE - w;
  const py = rows === 1 ? (ph - h) / 2 : r === 0 ? ph - EDGE - h : EDGE;
  // mx0/my0: the tile's lower-left corner in map points measured from the map's lower-left (y up)
  const mx0 = g.colX[c], my0 = g.mapH - g.rowY[r] - h;
  return { r, c, rb, w, h, mx0, my0, px, py, cx0: px - lB, cx1: px + w + rB, cy0: py - bB, cy1: py + h + tB };
}
/* the base-coordinate window a tile needs (with bleed), for loading and collecting features */
const tileWindow = (g, t) => [g.x0 + (t.mx0 - (t.px - t.cx0)) / g.k, g.y0 + (t.my0 - (t.py - t.cy0)) / g.k,
  g.x0 + (t.mx0 + t.w + (t.cx1 - t.px - t.w)) / g.k, g.y0 + (t.my0 + t.h + (t.cy1 - t.py - t.h)) / g.k];

/* the terrain image drawn in base coordinates (the current matrix is the map layers' matrix), multiplied over the map */
const terrainOp = t => `q /TS gs ${f5(t.bx1 - t.bx0)} 0 0 ${f5(t.by1 - t.by0)} ${f5(t.bx0)} ${f5(t.by0)} cm /Tr1 Do Q\n`;

/* content stream parts for one printed map page: map layers, overlay, trim marks and the page name */
async function tileParts(g, P, land, ov, t, terr) {
  const { cols, rows } = g;
  const { r, c, rb, px, py, cx0, cx1, cy0, cy1 } = t;
  const clip = `${f2(cx0)} ${f2(cy0)} ${f2(cx1 - cx0)} ${f2(cy1 - cy0)} re W n\n`;
  const [bx0, by0, bx1, by1] = tileWindow(g, t);
  const ox = px - t.mx0, oy = py - t.my0;
  const parts = ['q\n', clip, `${hexrgb(land)} rg ${f2(cx0)} ${f2(cy0)} ${f2(cx1 - cx0)} ${f2(cy1 - cy0)} re f\n`];
  if (ov.art) {
    const pad = artPad(P, g.k);
    await layerPartsArt(parts, g, collect(bx0 - pad, by0 - pad, bx1 + pad, by1 + pad, ov.flt), ox - g.x0 * g.k, oy - g.y0 * g.k, P, tick, null, [bx0, by0, bx1, by1]);
  } else layerParts(parts, g, collect(bx0 - 6, by0 - 6, bx1 + 6, by1 + 6), ox - g.x0 * g.k, oy - g.y0 * g.k, P, [bx0, by0, bx1, by1]);
  if (terr) parts.push(terrainOp(terr));
  if (state.hachure) parts.push(hachOps(g, [bx0, by0, bx1, by1], ov.pal.ink));
  parts.push('Q\nq\n', clip, `1 0 0 -1 ${f2(ox)} ${f2(oy + g.mapH)} cm\n`, ov.under, ov.list ? labelOps(g, ov.list, t, ox, oy, ov.pal, ov.alphas) : '', ov.over, 'Q\n');
  // trim marks (interior seams only) just outside the printed map
  let mk = '0.33 0.33 0.33 RG 0.4 w /A100 gs [] 0 d\n';
  const TK = 18;
  for (const [x, inner] of [[px, c > 0], [px + t.w, c < cols - 1]]) {
    if (!inner) continue;
    mk += `${f2(x)} ${f2(cy0 - 2 - TK)} m ${f2(x)} ${f2(cy0 - 2)} l S ${f2(x)} ${f2(cy1 + 2)} m ${f2(x)} ${f2(cy1 + 2 + TK)} l S\n`;
  }
  for (const [yy, inner] of [[py, rb > 0], [py + t.h, rb < rows - 1]]) {
    if (!inner) continue;
    mk += `${f2(cx0 - 2 - TK)} ${f2(yy)} m ${f2(cx0 - 2)} ${f2(yy)} l S ${f2(cx1 + 2)} ${f2(yy)} m ${f2(cx1 + 2 + TK)} ${f2(yy)} l S\n`;
  }
  // page name goes where it will be cut off (above the top trim) or covered (below row A)
  const lab = rowName(r) + (c + 1);
  const ly = r === 0 ? cy0 - 9 : cy1 + 4;
  mk += `0.33 0.33 0.33 rg BT /F1 5.5 Tf ${f2(px + 26)} ${f2(ly)} Td (${lab}   row ${rowName(r)} of ${rowName(rows - 1)}, column ${c + 1} of ${cols}) Tj ET\n`;
  parts.push(mk);
  return { parts, ox, oy };
}

/* Check rulers (10 cm and 1 in) in the page margin of a test tile, plus a one-line instruction.
   The ruler goes in whichever of the top/bottom margins has more room and sits between the seam ticks. */
function rulerOps(g, t) {
  const { pw, ph, cols } = g;
  const labelTop = t.r !== 0;                                  // where the page name is printed (see tileParts)
  const roomTop = ph - t.cy1 - 12 - 2 - (labelTop ? 12 : 0), roomBot = t.cy0 - 12 - 2 - (labelTop ? 0 : 12);
  const top = roomTop >= roomBot;
  const room = Math.max(roomTop, roomBot);
  const f = clamp(room / 22, .55, 1);                          // scale down the ruler in a tight margin
  const lo = cols > 1 && t.c > 0 ? t.px + 8 : 8, hi = cols > 1 && t.c < cols - 1 ? t.px + t.w - 8 : pw - 8;
  const CM = 28.3465, IN = 72, len = 100 * CM / 10;            // 10 cm
  const x0 = lo + Math.max(0, (hi - lo - len) / 2);
  // band for the ruler (y up): measured away from the page edge by 12 pt (printers do not print right to the edge)
  const yMid = top ? ph - 12 - 11 * f - 1 : 12 + 11 * f + 1;
  const fs = 4.6 * f, tk = 4 * f;
  let s = `q 0 0 0 rg 0 0 0 RG /A100 gs [] 0 d 0.35 w\n`;
  const ln = (x1, y1, x2, y2, w) => { s += `${w ? w + ' w ' : ''}${f2(x1)} ${f2(y1)} m ${f2(x2)} ${f2(y2)} l S\n`; };
  const tx = (str, x, y, size, bold) => { s += `BT /${bold ? 'F2' : 'F1'} ${f2(size)} Tf ${f2(x)} ${f2(y)} Td (${pdfStr(str)}) Tj ET\n`; };
  // centimetre scale: ticks point up from a line just above the middle
  const yc = yMid + 1;
  ln(x0, yc, x0 + len, yc, .5);
  for (let mm = 0; mm <= 100; mm++) {
    const x = x0 + mm * CM / 10, cm = mm % 10 === 0, half = mm % 5 === 0;
    ln(x, yc, x, yc + (cm ? tk : half ? tk * .75 : tk * .5), cm ? .5 : .3);
    if (cm) tx(String(mm / 10), x - (mm >= 100 ? 2.4 : 1.2) * f, yc + tk + 1.1, fs, false);
  }
  tx('cm', x0 + len + 4, yc + 1, fs * 1.2, true);
  // inch scale: ticks point down from a line just below the middle
  const yi = yMid - 1;
  ln(x0, yi, x0 + IN, yi, .5);
  for (let e = 0; e <= 8; e++) {
    const x = x0 + e * IN / 8, whole = e % 8 === 0, half = e === 4, q = e % 2 === 0;
    ln(x, yi, x, yi - (whole ? tk : half ? tk * .85 : q ? tk * .65 : tk * .45), whole ? .5 : .3);
  }
  tx('0', x0 - 1.2 * f, yi - tk - fs - .8, fs, false);
  tx('1 in', x0 + IN - 3 * f, yi - tk - fs - .8, fs, false);
  // instruction line on the opposite margin
  const msg = 'Test page: 10 cm should measure 100 mm and 1 in 25.4 mm. If not, print at Actual size / 100%.';
  const ty = top ? 12 + 2 : ph - 12 - 7;
  const mw = Math.min(hi - lo, textW('6.4px Arial', msg));
  tx(msg, lo + Math.max(0, (hi - lo - mw) / 2), ty, 6.4, false);
  return s + 'Q\n';
}

async function buildPdf(mode) {
  const g = geom();
  if (state.hood && !hoodByName(state.hood)) await loadHoods();
  const opt = overlayOpt();
  const P = passes(), land = landOf();
  const pats = P.filter(p => p.kind === 'pattern').map(p => p.pat);
  // the test page needs only the tile that holds the centre of the view
  const testTile = mode === 'test' ? tileBox(g, clamp(Math.floor(g.rows / 2), 0, g.rows - 1), clamp(Math.floor(g.cols / 2), 0, g.cols - 1)) : null;
  const win = testTile ? tileWindow(g, testTile).map((v, i) => v + (i < 2 ? -20 : 20)) : [g.x0 - 20, g.y0 - 20, g.x0 + g.vw + 20, g.y0 + g.vh + 20];
  await loadCells(cellKeys(...win), (d, n) => progress(.35 * d / n, `Loading map detail ${d} of ${n}`));
  /* optional lettering: the font is embedded (once) only when some text will use it */
  const LT = state.lettering !== 'plain' && (state.labStreets || state.labPlaces || state.title.trim()) ? await loadLetter(state.lettering) : null;
  if (state.landmarks) await loadLandmarks();
  await ensureDeco(win);
  let placed = null;
  if (state.labStreets || state.labPlaces) {
    placed = await computeLabels(g, win.map((v, i) => v + (i < 2 ? 20 : -20)), (d, n) => progress(.35 + .03 * d / n, `Loading street names ${d} of ${n}`));
    progress(.38, `Placed ${placed.length} names`);
  }
  if (state.terrain) await hillReady();

  const doc = new PdfDoc();
  const alphas = new Set([100]);
  const oc = new PdfCtx(alphas);
  let split = 0;
  drawOverlay(oc, g, opt, c => { split = c.o.length; });
  // the overlay is split where the names go: highlight and rings under them, markers, compass, border and title over them
  const ov = { under: oc.o.slice(0, split).join('\n') + (split ? '\n' : ''), over: oc.o.length > split ? oc.o.slice(split).join('\n') + '\n' : '',
    list: placed && placed.length ? placed : null, pal: ovPalFor(state), alphas, art: isArt(), flt: isArt() ? detailFilter(g) : null };

  const idCat = doc.alloc(), idPages = doc.alloc(), idF1 = doc.alloc(), idF2 = doc.alloc(),
    idGS = doc.alloc(), idImg = doc.alloc(), idF3 = doc.alloc(), idF4 = doc.alloc(), idF5 = doc.alloc();
  const idLF = LT ? doc.alloc() : 0, idLD = LT ? doc.alloc() : 0, idLB = LT ? doc.alloc() : 0;
  const kids = [];
  let hasImg = false;
  /* tiling patterns are anchored to the map, so each page gets its own copies shifted to line up across seams */
  const patStreams = pats.map(pat => {
    const pc = new PdfCtx(alphas);
    drawPatternTile(pc, pat);
    return enc.encode(`1 0 0 -1 0 ${pat.T} cm\n` + pc.o.join('\n') + '\n');
  });
  const addPage = async (w, h, parts, ox, oy, terr) => {
    const data = await deflate(parts);
    let tr = '';
    if (terr) {
      const id = doc.alloc();
      doc.obj(id, `/Type /XObject /Subtype /Image /Width ${terr.w} /Height ${terr.h} /ColorSpace /${terr.comps === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Interpolate true`, terr.jpg);
      tr = ` /Tr1 ${id} 0 R`;
    }
    let pr = '';
    if (pats.length && ox !== undefined) {
      const ps = patScale(g);
      pr = ' /Pattern << ' + pats.map((pat, i) => {
        const id = doc.alloc();
        const pd = pat.type === 'hatch' ? 1.5 : 0;     // hatch lines overrun the tile a little so neighbouring tiles overlap and hide the join
        doc.obj(id, `/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [${-pd} ${-pd} ${pat.T + pd} ${pat.T + pd}] /XStep ${pat.T} /YStep ${pat.T} ` +
          `/Resources << /ExtGState ${idGS} 0 R >> /Matrix [${f5(ps)} 0 0 ${f5(ps)} ${f2(ox)} ${f2(oy)}]`, patStreams[i]);
        return `/${pat.id} ${id} 0 R`;
      }).join(' ') + ' >>';
    }
    const res = `<< /Font << /F1 ${idF1} 0 R /F2 ${idF2} 0 R /F3 ${idF3} 0 R /F4 ${idF4} 0 R /F5 ${idF5} 0 R${LT ? ` /${LT.key} ${idLF} 0 R` : ''} >> /ExtGState ${idGS} 0 R` +
      (hasImg || tr ? ` /XObject << ${hasImg ? `/Im1 ${idImg} 0 R` : ''}${tr} >>` : '') + pr + ' >>';
    const c = doc.alloc(), p = doc.alloc();
    doc.obj(c, '/Filter /FlateDecode', data);
    doc.obj(p, `<< /Type /Page /Parent ${idPages} 0 R /MediaBox [0 0 ${f2(w)} ${f2(h)}] /Resources ${res} /Contents ${c} 0 R >>`);
    kids.push(p);
  };

  if (mode === 'test') {
    progress(.5, 'Drawing the test page');
    await tick();
    const terr = state.terrain ? await terrainImage(g, tileWindow(g, testTile)) : null;
    const { parts, ox, oy } = await tileParts(g, P, land, ov, testTile, terr);
    parts.push(rulerOps(g, testTile));
    await addPage(g.pw, g.ph, parts, ox, oy, terr);
  } else if (mode === 'sheet') {
    progress(.4, 'Drawing the sheet');
    await tick();
    const parts = [`q ${hexrgb(land)} rg 0 0 ${f2(g.mapW)} ${f2(g.mapH)} re f\n`];
    if (ov.art) {
      const pad = artPad(P, g.k);
      await layerPartsArt(parts, g, collect(g.x0 - pad - 2, g.y0 - pad - 2, g.x0 + g.vw + pad + 2, g.y0 + g.vh + pad + 2, ov.flt), -g.x0 * g.k, -g.y0 * g.k, P, tick,
        (i, n) => progress(.4 + .3 * i / n, `Drawing the sheet (${i + 1} of ${n})`), [g.x0, g.y0, g.x0 + g.vw, g.y0 + g.vh]);
    } else layerParts(parts, g, collect(g.x0 - 8, g.y0 - 8, g.x0 + g.vw + 8, g.y0 + g.vh + 8), -g.x0 * g.k, -g.y0 * g.k, P, [g.x0, g.y0, g.x0 + g.vw, g.y0 + g.vh]);
    const terr = state.terrain ? await terrainImage(g, [g.x0, g.y0, g.x0 + g.vw, g.y0 + g.vh]) : null;
    if (terr) parts.push(terrainOp(terr));
    if (state.hachure) parts.push(hachOps(g, [g.x0, g.y0, g.x0 + g.vw, g.y0 + g.vh], ov.pal.ink));
    let labs = '';
    if (ov.list) { const pc = new PdfCtx(alphas); drawLabels(pc, ov.list, ov.pal); labs = pc.o.join('\n') + '\n'; }
    parts.push(`Q\nq 1 0 0 -1 0 ${f2(g.mapH)} cm\n`, ov.under, labs, ov.over, 'Q\n');
    progress(.7, 'Compressing');
    await addPage(g.mapW, g.mapH, parts, 0, 0, terr);
  } else {
    /* ---- assembly guide */
    const im = themeImg();
    if (!im.ready) await new Promise(r => { im.addEventListener('load', r); im.addEventListener('error', r); });
    if (vectorKeys(g)) await renderVector(); else await renderDeco();
    const tc = document.createElement('canvas');
    const td = 1100 / Math.max(g.mapW, g.mapH);
    tc.width = Math.round(g.mapW * td); tc.height = Math.round(g.mapH * td);
    const tctx = tc.getContext('2d');
    tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, tc.width, tc.height);
    paintMap(tctx, g, td, placed && placed.length ? { list: placed, dx: 0, dy: 0 } : null);
   
    const jpg = new Uint8Array(await (await new Promise(r => tc.toBlob(r, 'image/jpeg', .85))).arrayBuffer());
    doc.obj(idImg, `/Type /XObject /Subtype /Image /Width ${tc.width} /Height ${tc.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, jpg);
    hasImg = true;

    const { pw, ph, cols, rows } = g;
    const total = cols * rows;
    const advTxt = `up to ${f2(g.advX / 72)} x ${f2(g.advY / 72)} in`;
    const lines = [
      `Finished size ${feet(g.W / 72)} wide x ${feet(g.H / 72)} tall, including a 0.5 in white paper border all round.`,
      `${total} pages: ${rows} rows (A at the top to ${rowName(rows - 1)}) x ${cols} columns (1 at the left to ${cols}). Paper ${f2(pw / 72)} x ${f2(ph / 72)} in.`,
      '',
      `1.  Print pages 2 to ${total + 1} at ACTUAL SIZE / 100% (turn off "Fit to page" / "Shrink oversized pages").`,
      '2.  Each page has its name in small type just outside the map (A1, A2 ...). These get cut off or covered.',
      `3.  Each page carries ${advTxt} of map, set against the outer side of the sheet. Where another page joins, 0.15 in of extra map`,
      '     prints past the trim marks. Nothing prints past the outer border: the outside is never trimmed.',
      '4.  Trim the LEFT edge of every page except column 1, and the TOP edge of every page except row A,',
      '     along the trim marks. Leave the right and bottom edges untrimmed.',
      '5.  Work left to right, top to bottom. Lay each trimmed edge over the untrimmed edge of its neighbor,',
      '     line up the roads and trim marks, and fix with glue stick or tape on the back.',
      '6.  Tip: print A1 and A2 first and check that the roads line up before printing the rest.',
    ];
    const gp = [];
    const ink = hexrgb(C.ink);
    let y = ph - 62;
    gp.push(`${ink} rg BT /F2 19 Tf 54 ${y} Td (${pdfStr(winAnsi(AREA_NAME.split(',')[0]).slice(0, 40) + ' Wall Map: Assembly Guide')}) Tj ET\n`);
    y -= 24;
    const fs = pw < 700 ? 9.3 : 10;
    for (const ln of lines) {
      if (ln) gp.push(`BT /F1 ${fs} Tf 54 ${y} Td (${esc(ln)}) Tj ET\n`);
      y -= 13.6;
    }
    const credits = [];
    if (state.hood) credits.push('Neighborhood boundaries: LOJIC / Louisville Metro open data');
    if (state.terrain || state.hachure) credits.push('Elevation: Mapzen / AWS Terrain Tiles (USGS 3DEP and other sources)');
    if (LT) credits.push(`Lettering: ${LT.meta.family}, SIL Open Font License`);
    const boxW = pw - 108, boxH = y - 44 - 9 * credits.length;
    const sc = Math.min(boxW / g.mapW, boxH / g.mapH);
    const gw = g.mapW * sc, gh = g.mapH * sc, gx = (pw - gw) / 2, gy = y - gh;
    gp.push(`q ${f2(gw)} 0 0 ${f2(gh)} ${f2(gx)} ${f2(gy)} cm /Im1 Do Q\n`);
    gp.push('0 0 0 RG 0.4 w\n');
    const xs = [...g.colX, g.mapW].map(v => gx + v * sc), ys = [...g.rowY, g.mapH].map(v => gy + gh - v * sc);
    for (const x of xs) gp.push(`${f2(x)} ${f2(gy)} m ${f2(x)} ${f2(gy + gh)} l S\n`);
    for (const y of ys) gp.push(`${f2(gx)} ${f2(y)} m ${f2(gx + gw)} ${f2(y)} l S\n`);
    alphas.add(80);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lab = rowName(r) + (c + 1);
      const cw = g.colW[c] * sc, rh = g.rowH[r] * sc;
      const sz = Math.min(7, cw / (lab.length * .62 + .6), rh * .7);
      const w = lab.length * sz * .6;
      const tx = xs[c] + cw / 2 - w / 2, ty = ys[r] - rh / 2 - sz * .36;
      gp.push(`/A80 gs 1 1 1 rg ${f2(tx - 1)} ${f2(ty - 1)} ${f2(w + 2)} ${f2(sz + 1.2)} re f /A100 gs ${ink} rg ` +
        `BT /F2 ${f2(sz)} Tf ${f2(tx)} ${f2(ty)} Td (${lab}) Tj ET\n`);
    }
    credits.push('Map data (c) OpenStreetMap contributors, openstreetmap.org/copyright');
    credits.reverse().forEach((t, i) => gp.push(`0.35 0.35 0.35 rg BT /F1 7 Tf 54 ${26 + 9 * i} Td (${esc(t)}) Tj ET\n`));
    await addPage(pw, ph, gp);

    /* ---- map pages, top row first */
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = tileBox(g, r, c);
        const terr = state.terrain ? await terrainImage(g, tileWindow(g, t)) : null;
        const { parts, ox, oy } = await tileParts(g, P, land, ov, t, terr);
        await addPage(pw, ph, parts, ox, oy, terr);
        n++;
        if (n % 4 === 0 || n === total || ov.art) { progress(.35 + .65 * n / total, `Building page ${n} of ${total}`); await tick(); }
      }
    }
  }

  doc.obj(idF1, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  doc.obj(idF2, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  doc.obj(idF3, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>');
  doc.obj(idF4, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>');
  doc.obj(idF5, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>');
  if (LT) {                                    // the embedded TrueType font: font dictionary, descriptor and the compressed font file
    const m = LT.meta, bn = m.family.replace(/\s+/g, '') + '-Regular';
    doc.obj(idLF, `<< /Type /Font /Subtype /TrueType /BaseFont /${bn} /FirstChar ${m.firstChar} /LastChar ${m.lastChar} /Widths [${m.widths.join(' ')}] /Encoding /WinAnsiEncoding /FontDescriptor ${idLD} 0 R >>`);
    doc.obj(idLD, `<< /Type /FontDescriptor /FontName /${bn} /Flags ${m.flags} /FontBBox [${m.bbox.join(' ')}] /ItalicAngle ${m.italicAngle} /Ascent ${m.ascent} /Descent ${m.descent} /CapHeight ${m.capHeight} /StemV ${m.stemV} /FontFile2 ${idLB} 0 R >>`);
    doc.obj(idLB, `/Filter /FlateDecode /Length1 ${LT.bytes.length}`, await deflate([LT.bytes]));
  }
  doc.obj(idGS, '<< ' + [...alphas].map(a => `/A${a} << /CA ${a / 100} /ca ${a / 100} >>`).join(' ') +
    (state.terrain ? ` /TS << /Type /ExtGState /BM /Multiply /CA ${state.terrainAmt / 100} /ca ${state.terrainAmt / 100} >>` : '') + ' >>');
  if (!hasImg) doc.obj(idImg, '<< >>');
  doc.obj(idPages, `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map(k => k + ' 0 R').join(' ')}] >>`);
  doc.obj(idCat, `<< /Type /Catalog /Pages ${idPages} 0 R >>`);
  return { blob: doc.finish(idCat), g };
}

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const setBusy = v => { busy = v; for (const id of ['dlPages', 'dlSheet', 'dlPng', 'dlTest']) $(id).disabled = v; };
const fileStem = () => {
  const g = layout(), size = `${feet(g.W / 72)} x ${feet(g.H / 72)}`.replace(/ /g, '');
  return `${AREA_NAME.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'map'}-map-${size}${state.theme === 'classic' ? '' : '-' + state.theme}${state.draw === 'clean' ? '' : '-' + state.draw}${state.detail === 'full' ? '' : '-simplified'}`;
};
async function download(mode) {
  if (busy) return;
  setBusy(true);
  try {
    const { blob, g } = await buildPdf(mode);
    const name = mode === 'sheet' ? `${fileStem()}-single-sheet.pdf`
      : mode === 'test' ? `${fileStem()}-${state.paper}-test-page.pdf`
      : `${fileStem()}-${state.paper}-${g.cols * g.rows}-pages.pdf`;
    saveBlob(blob, name);
    progress(1, `Done: ${name} (${(blob.size / 1048576).toFixed(1)} MB)`);
  } catch (err) {
    console.error(err);
    progress(0, 'Something went wrong: ' + err.message);
  } finally {
    setBusy(false);
    schedule();
  }
}
$('dlPages').addEventListener('click', () => download('pages'));
$('dlSheet').addEventListener('click', () => download('sheet'));
$('dlTest').addEventListener('click', () => download('test'));

/* ---- PNG export of the single sheet, drawn by the same code as the sharp preview */
const PNG_MAX_SIDE = 12000, PNG_MAX_PIXELS = 120e6;
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
/* PNG fresh from canvas.toBlob has no resolution tag; add a pHYs chunk so print software knows the dpi */
async function pngWithDpi(blob, dpi) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length < 41 || buf[1] !== 0x50) return blob;
  const ppm = Math.round(dpi / .0254), ch = new Uint8Array(21), dv = new DataView(ch.buffer);
  dv.setUint32(0, 9); ch.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); ch[16] = 1;
  dv.setUint32(17, crc32(ch.subarray(4, 17)));
  return new Blob([buf.subarray(0, 33), ch, buf.subarray(33)], { type: 'image/png' });
}
async function downloadPng() {
  if (busy) return;
  setBusy(true);
  try {
    const g = geom();
    const inW = g.mapW / 72, inH = g.mapH / 72;
    const maxDpi = Math.min(PNG_MAX_SIDE / Math.max(inW, inH), Math.sqrt(PNG_MAX_PIXELS / (inW * inH)));
    const want = +$('pngDpi').value || 150;
    const dpi = want <= maxDpi ? want : Math.floor(maxDpi);
    if (dpi < 20) throw new Error('This sheet is too large for a PNG. Use the PDF instead.');
    const wpx = Math.min(PNG_MAX_SIDE, Math.round(inW * dpi)), hpx = Math.min(PNG_MAX_SIDE, Math.round(inH * dpi));
    const keys = cellKeys(g.x0 - 20, g.y0 - 20, g.x0 + g.vw + 20, g.y0 + g.vh + 20);
    await loadCells(keys, (d, n) => progress(.3 * d / n, `Loading map detail ${d} of ${n}`));
    if (state.hood && !hoodByName(state.hood)) await loadHoods();
    if (state.landmarks) await loadLandmarks();
    if (state.lettering !== 'plain' && (state.labStreets || state.labPlaces || state.title.trim())) await loadLetter(state.lettering);
    const placed = await computeLabels(g);
    if (state.terrain) await hillReady();
    progress(.3, `Drawing ${wpx} x ${hpx} pixels`);
    await tick();
    const can = document.createElement('canvas');
    can.width = wpx; can.height = hpx;
    const ctx = can.getContext('2d');
    if (!ctx || can.width !== wpx) throw new Error('Your browser could not make an image this large. Try 150 dpi or use the PDF.');
    await paintVector(can, g, keys, wpx / g.mapW, () => false, (i, n) => progress(.3 + .5 * i / n, `Drawing the map (${i} of ${n})`));
    progress(.85, 'Drawing the border and labels');
    drawTerrain(ctx, g, wpx / g.mapW);
    ctx.setTransform(wpx / g.mapW, 0, 0, wpx / g.mapW, 0, 0);
    drawOverlay(ctx, g, overlayOpt(), placed.length ? c => drawLabels(c, placed, ovPalFor(state)) : null);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    progress(.92, 'Saving the PNG');
    await tick();
    let blob = await new Promise(r => can.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Your browser could not save an image this large. Try 150 dpi or use the PDF.');
    blob = await pngWithDpi(blob, dpi);
    const name = `${fileStem()}-single-sheet-${dpi}dpi.png`;
    saveBlob(blob, name);
    progress(1, (dpi < want ? `Used ${dpi} dpi instead of ${want}: the image is capped at ${PNG_MAX_SIDE} pixels on a side and 120 megapixels. ` : '') +
      `Done: ${name} (${(blob.size / 1048576).toFixed(1)} MB)`);
  } catch (err) {
    console.error(err);
    progress(0, 'Something went wrong: ' + err.message);
  } finally {
    setBusy(false);
    schedule();
  }
}
$('dlPng').addEventListener('click', downloadPng);

/* ---- shareable link: the whole state lives in the URL hash */
const ORIENT_CODE = { auto: 'a', portrait: 'p', landscape: 'l' };
const FLAGS = ['border', 'compass', 'rings', 'grid'], TOUCHES = ['trees', 'waves', 'shadows'];
const ART_FLAGS = ['landmarks', 'shore', 'hachure', 'ornate'];
const enc1 = v => encodeURIComponent(v).replace(/%3A/gi, ':').replace(/%2C/gi, ',');
function encodeState() {
  const kv = [['w', +state.wallW.toFixed(2)], ['h', +state.wallH.toFixed(2)], ['p', state.paper], ['o', ORIENT_CODE[state.orient]], ['s', state.theme],
    ['f', FLAGS.map(k => +state[k]).join('')], ['x', TOUCHES.map(k => +state[k]).join('')],
    ['z', +state.zoom.toFixed(3)], ['c', `${+state.cx.toFixed(1)},${+state.cy.toFixed(1)}`]];
  if (state.whole) kv.push(['ws', 1]);
  if (state.title) kv.push(['t', state.title]);
  if (state.subtitle) kv.push(['u', state.subtitle]);
  if (state.tpos !== 'br') kv.push(['tp', state.tpos]);
  if (state.hood) kv.push(['n', state.hood]);
  if (state.labStreets || state.labPlaces) kv.push(['l', `${+state.labStreets}${+state.labPlaces}`]);
  if (state.terrain) kv.push(['e', Math.round(state.terrainAmt)]);
  if (state.draw !== 'clean') kv.push(['dr', state.draw]);
  if (state.detail !== 'full') kv.push(['dl', state.detail]);
  if (state.lettering !== 'plain') kv.push(['lt', state.lettering]);
  if (ART_FLAGS.some(k => state[k])) kv.push(['ar', ART_FLAGS.map(k => +state[k]).join('')]);
  if (state.markers.length) kv.push(['m', state.markers.map(m => `${m.t}:${+m.x.toFixed(1)}:${+m.y.toFixed(1)}`).join('~')]);
  return '#' + kv.map(([k, v]) => k + '=' + enc1(v)).join('&');
}
/* read a hash into state; every value is validated and clamped, anything unusable is ignored */
function applyHash(hash) {
  const q = Object.create(null);
  for (const part of String(hash).replace(/^#/, '').split('&')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    try { q[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1)); } catch (e) { /* ignore */ }
  }
  const num = (k, a, b) => { const v = q[k] === undefined || q[k] === '' ? NaN : Number(q[k]); return Number.isFinite(v) ? clamp(v, a, b) : null; };
  let v;
  if ((v = num('w', 12, 192)) !== null) state.wallW = v;
  if ((v = num('h', 12, 192)) !== null) state.wallH = v;
  if (q.p in PAPERS) state.paper = q.p;
  const o = Object.keys(ORIENT_CODE).find(k => ORIENT_CODE[k] === q.o);
  if (o) state.orient = o;
  state.whole = q.ws === '1';
  if (Object.prototype.hasOwnProperty.call(THEMES, q.s)) state.theme = q.s;
  state.draw = DRAW_KEYS.includes(q.dr) ? q.dr : 'clean';
  state.detail = DETAIL_KEYS.includes(q.dl) ? q.dl : 'full';
  state.lettering = LETTER_KEYS.includes(q.lt) ? q.lt : 'plain';
  ART_FLAGS.forEach((k, i) => { state[k] = /^[01]{4}$/.test(q.ar || '') && q.ar[i] === '1'; });
  if (state.lettering !== 'plain') loadLetter(state.lettering).then(letteringChanged).catch(err => layerMsg(err.message));
  if (state.landmarks) loadLandmarks().then(schedule).catch(err => layerMsg(err.message));
  if (/^[01]{4}$/.test(q.f || '')) FLAGS.forEach((k, i) => { state[k] = q.f[i] === '1'; });
  if (/^[01]{3}$/.test(q.x || '')) TOUCHES.forEach((k, i) => { state[k] = q.x[i] === '1'; });
  if ((v = num('z', 1, 10000)) !== null) state.zoom = v;
  const c = (q.c || '').split(',');
  if (c.length === 2 && c[0] !== '' && c[1] !== '' && Number.isFinite(+c[0]) && Number.isFinite(+c[1])) { state.cx = clamp(+c[0], 0, M.size); state.cy = clamp(+c[1], 0, M.size); }
  if (q.t !== undefined) state.title = cleanText(q.t, 60);
  if (q.u !== undefined) state.subtitle = cleanText(q.u, 80);
  if (q.tp === 'br' || q.tp === 'bc' || q.tp === 'tc') state.tpos = q.tp;
  state.hood = q.n ? cleanText(q.n, 60) : '';               // checked against the real list once hoods.json has loaded
  state.labStreets = /^[01]{2}$/.test(q.l || '') && q.l[0] === '1';
  state.labPlaces = /^[01]{2}$/.test(q.l || '') && q.l[1] === '1';
  state.terrain = false; state.terrainAmt = 60;
  if ((v = num('e', 10, 100)) !== null) { state.terrain = true; state.terrainAmt = Math.round(v); }
  if (state.hood && hoodMap.size && !hoodMap.has(state.hood)) state.hood = '';
  if (LIVE) { state.hood = ''; state.labStreets = state.labPlaces = state.terrain = state.landmarks = state.shore = state.hachure = false; }
  if (state.hood) loadHoods().catch(() => {});
  if (q.m) {
    const out = [];
    for (const part of q.m.split('~')) {
      const [t, x, y] = part.split(':');
      if (!(t in MARK_NAMES) || x === undefined || y === undefined || x === '' || y === '' || !Number.isFinite(+x) || !Number.isFinite(+y)) continue;
      if (out.length < MAXMARK) out.push({ t, x: clamp(+x, 0, M.size), y: clamp(+y, 0, M.size) });
    }
    state.markers = out;
  }
}
/* push the state into every control */
function syncUI() {
  normWall();
  document.querySelectorAll('input[name=paper]').forEach(r => { r.checked = r.value === state.paper; });
  $('orient').value = state.orient;
  $('oWhole').checked = state.whole;
  for (const [id, key] of CHECKS) $(id).checked = state[key];
  syncTheme();
  document.querySelectorAll('input[name=draw]').forEach(r => { r.checked = r.value === state.draw; });
  document.querySelectorAll('input[name=detail]').forEach(r => { r.checked = r.value === state.detail; });
  document.querySelectorAll('input[name=lettering]').forEach(r => { r.checked = r.value === state.lettering; });
  $('tTitle').value = state.title; $('tSub').value = state.subtitle; $('tPos').value = state.tpos;
  renderMarkerList();
  syncLayerUI();
}
let hashT = 0, lastHash = '';
function queueHash() { clearTimeout(hashT); hashT = setTimeout(syncHash, 500); }
function syncHash() {
  const h = encodeState();
  if (h === lastHash) return;
  lastHash = h;
  try { history.replaceState(null, '', h); } catch (e) { /* some sandboxes forbid it */ }
}
$('copyLink').addEventListener('click', async () => {
  geom();
  clearTimeout(hashT); syncHash();
  const url = location.href, btn = $('copyLink');
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) { /* fall through */ }
    ta.remove();
  }
  btn.textContent = ok ? 'Link copied' : 'Could not copy: use the address bar';
  clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = 'Copy link to this map'; }, 2200);
});

window.__mapmaker = { renderDeco, paintShore, paintHach, __lmData: d => { landmarkData = d; }, hachStats, shoreOps, hachOps, shoreSpec, hachTris, loadWater, ensureDeco, loadLetter, letterMeta, LETTERINGS, loadLandmarks, drawLandmarks, landmarkItems, ICONS, paintVector, loadCells, cellKeys, passes, collect, makeSpec, xfItem, buildXfPath, layerPartsArt, detailFilter, ovPalFor, landOf, pencilGrey, noise2, drawHatch, placeLabels, computeLabels, loadHoods, terrainImage, hoodByName, labelState, state, geom, buildPdf, schedule, THEMES, PROJ, PdfCtx, drawOverlay, textW, winAnsi, pdfStr, pdfFont, encodeState, applyHash, syncUI, overlayOpt, downloadPng };
if (location.hash.length > 1) { applyHash(location.hash); syncUI(); }
lastHash = encodeState();
setPlacing(null);
renderMarkerList();
syncLayerUI();
readWall();
})();
