/* Louisville Wall Map Maker: preview + in-browser vector PDF generation */
(() => {
'use strict';
const M = window.MAPMETA, LAYERS = window.LAYERS, C = M.colors;
const NSRC = Math.max(...LAYERS.map(l => l.src)) + 1;
const TILESET = new Set(M.tiles);
const BLEED = 10.8;          // 0.15 in of extra map past interior trim lines
const MILE = 288;            // base units per mile (base: 72 units = 1/4 mile)
const MAXK = 20;            // closest zoom: 1 in = about 66 ft
const hexOf = s => '#' + s.split(' ').map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const BASEHEX = Object.fromEntries(LAYERS.map(l => [l.name, hexOf(l.rgb)]));
const CASED = ['residential', 'link', 'tertiary', 'secondary', 'primary', 'trunk'];
const each = (names, c) => Object.fromEntries(names.map(n => [n, c]));
const GREENS = ['grass', 'park', 'cemetery', 'golf', 'wood', 'wetland', 'pitch'];
const WATERS = ['water', 'canal', 'river'];

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
const shade = (hex, f) => '#' + [1, 3, 5].map(i => {
  const v = parseInt(hex.substr(i, 2), 16);
  return Math.round(clamp(f < 0 ? v * (1 + f) : v + (255 - v) * f, 0, 255)).toString(16).padStart(2, '0');
}).join('');

/* drawing passes for the current style + optional illustrated touches */
function passes() {
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
    } else out.push({ src: L.src, kind: 'line', hex: col(n), width: L.width * wm(n), butt: L.butt, dash: L.dash });
  }
  return out;
}
/* line widths grow more slowly than the map when zooming out, and approach true road width zooming in */
const widthScale = k => k < 1 ? Math.pow(k, -.35) : 1 + .5 * (1 - Math.pow(k, -.6));
const shadowOff = k => clamp(.6 * Math.pow(k, .75), .6, 6);   // output points
const patScale = g => clamp(g.o * 1.5, .55, 1.1);

function drawPatternTile(ctx, pat) {
  if (pat.type === 'trees') {
    for (const [x, y] of [[8, 10], [27, 7], [18, 24], [34, 28], [6, 33]]) {
      ctx.fillStyle = pat.c1; ctx.beginPath(); ctx.rect(x - .45, y + 2, .9, 3); ctx.fill();
      circ(ctx, x, y, 3.3); ctx.fill();
      ctx.fillStyle = pat.c2; circ(ctx, x - .9, y - 1, 1.3); ctx.fill();
    }
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

/* lat/lon -> base map coordinates (same projection as the data build) */
const PROJ = (() => {
  const R = 6378137, rad = Math.PI / 180, lat0 = 38.185, lon0 = -85.675;
  const h = 15 * 1609.344 / Math.cos(lat0 * rad);
  const X0 = lon0 * rad * R - h, Y0 = Math.log(Math.tan(Math.PI / 4 + lat0 * rad / 2)) * R - h, S = M.size / (2 * h);
  return (lat, lon) => [(lon * rad * R - X0) * S, (Math.log(Math.tan(Math.PI / 4 + lat * rad / 2)) * R - Y0) * S];
})();
const PLACES = [
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
  zoom: 1, cx: M.size / 2, cy: M.size / 2,
  border: true, compass: true, rings: true, grid: true,
  theme: 'classic', trees: false, waves: false, shadows: false,
};

/* ------------------------------------------------------------ layout */
const EDGE = 36;             // white paper border around the finished map: 0.5 in
function layout() {
  const W = state.wallW * 72, H = state.wallH * 72;
  const short = 612, long = state.paper === 'legal' ? 1008 : 792;
  const mapW = W - 2 * EDGE, mapH = H - 2 * EDGE;
  const opts = [];
  for (const [pw, ph, name] of [[short, long, 'portrait'], [long, short, 'landscape']]) {
    if (state.orient !== 'auto' && state.orient !== name) continue;
    const cols = Math.max(2, Math.ceil(mapW / (pw - 2 * EDGE) - 1e-9));
    const rows = Math.max(2, Math.ceil(mapH / (ph - 2 * EDGE) - 1e-9));
    opts.push({ W, H, pw, ph, name, cols, rows, advX: mapW / cols, advY: mapH / rows, mx: EDGE, my: EDGE, mapW, mapH });
  }
  opts.sort((a, b) => a.cols * a.rows - b.cols * b.rows);
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

function drawOverlay(ctx, g, opt) {
  const { mapW, mapH, k, o } = g;
  const pal = THEMES[opt.theme].ov;
  const ink = pal.ink, gold = pal.gold, white = pal.paper;
  const fx = bx => (bx - g.x0) * k, fy = by => mapH - (by - g.y0) * k;

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

  const B = opt.border ? 108 * o : 0;
  if (opt.compass) {
    const r = 400 * o * (Math.min(mapW, mapH) < 3600 ? .8 : 1);
    compass(ctx, B + r * 1.6, mapH - B - r * 1.52, r, pal);
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
}

/* ------------------------------------------------------------ preview */
const canvas = $('view'), stage = $('stage');
let raf = 0, disp = 1;                     // disp = css px per point
const imgs = {};
function themeImg() {
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
const styleSig = () => [state.theme, state.trees, state.waves, state.shadows].join();
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
  const ctx = can.getContext('2d');
  const sc = disp * dpr * g.k, ws = widthScale(g.k);
  const ox = -g.x0 * sc, oy = (g.y0 + g.vh) * sc;
  ctx.fillStyle = THEMES[state.theme].land; ctx.fillRect(0, 0, can.width, can.height);
  ctx.lineJoin = 'round';
  let t0 = performance.now();
  for (const p of passes()) {
    for (const key of keys) {
      const c = cells.get(key);
      if (!c.paths) buildPaths(c);
      const path = c.paths[p.src];
      if (!path) continue;
      ctx.setTransform(sc, 0, 0, -sc, ox, oy);
      if (p.kind === 'fill') {
        ctx.fillStyle = p.hex; ctx.fill(path, 'nonzero');
        if (p.outline) { ctx.strokeStyle = p.outline; ctx.lineWidth = .22 * ws; ctx.setLineDash([]); ctx.stroke(path); }
      } else if (p.kind === 'shadow') {
        const so = shadowOff(g.k) * disp * dpr;
        ctx.setTransform(sc, 0, 0, -sc, ox + so, oy + so);
        ctx.fillStyle = p.hex; ctx.fill(path, 'nonzero');
      } else if (p.kind === 'pattern') {
        ctx.save();
        ctx.clip(path, 'nonzero');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = canvasPattern(ctx, p.pat, p.pat.T * patScale(g) * disp * dpr);
        ctx.fillRect(0, 0, can.width, can.height);
        ctx.restore();
      } else {
        ctx.strokeStyle = p.hex; ctx.lineWidth = p.width * ws; ctx.lineCap = p.butt ? 'butt' : 'round';
        ctx.setLineDash(p.dash ? [p.dash * ws, p.dash * ws] : []);
        ctx.stroke(path);
      }
    }
    if (performance.now() - t0 > 30) { await tick(); if (run !== vrun) return; t0 = performance.now(); }
  }
  vcan = can;
  vinfo = { x0: g.x0, y0: g.y0, vw: g.vw, vh: g.vh, style: styleSig(), sig };
  schedule();
}

/* draw the map area (no paper margin) at d px per point with its top-left at the origin */
function paintMap(ctx, g, d) {
  const s = M.img / M.size;
  const img = themeImg();
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = img.ready ? THEMES[state.theme].land : '#f3f1ec';
  ctx.fillRect(0, 0, g.mapW * d, g.mapH * d);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, g.mapW * d, g.mapH * d); ctx.clip();
  if (img.ready) ctx.drawImage(img, g.x0 * s, (M.size - g.y0 - g.vh) * s, g.vw * s, g.vh * s, 0, 0, g.mapW * d, g.mapH * d);
  if (vinfo && vinfo.style === styleSig() && vectorKeys(g)) {
    ctx.drawImage(vcan, (vinfo.x0 - g.x0) * g.k * d, (g.y0 + g.vh - vinfo.y0 - vinfo.vh) * g.k * d, vinfo.vw * g.k * d, vinfo.vh * g.k * d);
  }
  ctx.scale(d, d);
  drawOverlay(ctx, g, state);
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
  paintMap(ctx, g, disp);
  if (state.grid) {
    ctx.strokeStyle = 'rgba(168,35,44,.45)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let i = 1; i < g.cols; i++) { const x = Math.round(i * g.advX * disp) + .5; ctx.moveTo(x, 0); ctx.lineTo(x, g.mapH * disp); }
    for (let j = 1; j < g.rows; j++) { const y = Math.round(j * g.advY * disp) + .5; ctx.moveTo(0, y); ctx.lineTo(g.mapW * disp, y); }
    ctx.stroke();
  }
  ctx.restore();
  if (vectorKeys(g)) {
    const sig = [g.x0, g.y0, g.k, g.mapW, g.mapH, disp, styleSig()].join();
    if (!vinfo || vinfo.sig !== sig) { clearTimeout(vtimer); vtimer = setTimeout(renderVector, 140); }
  }
  if (!themeImg().ready) {
    ctx.fillStyle = C.ink; ctx.font = '600 15px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Loading map...', cw / 2, ch / 2);
  }
  summary(g);
}
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
  const z = $('zoom');
  if (document.activeElement !== z) z.value = Math.round(1000 * Math.log(state.zoom) / Math.log(g.maxZoom));
  const big = Math.max(g.mapW, g.mapH) > 14400;
  $('dlSheet').disabled = busy || big;
  $('dlSheet').title = big ? 'A single PDF sheet is limited to 200 in (16 ft 8 in).' : '';
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
let pinch = 0;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  canvas.classList.add('drag');
  pinch = 0;
});
canvas.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
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
const up = e => { ptrs.delete(e.pointerId); pinch = 0; if (!ptrs.size) canvas.classList.remove('drag'); };
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
$('goDowntown').addEventListener('click', () => { [state.cx, state.cy] = M.center; schedule(); });

function readWall() {
  const num = id => Math.max(0, parseFloat($(id).value) || 0);
  state.wallW = clamp(num('wFt') * 12 + num('wIn'), 24, 192);
  state.wallH = clamp(num('hFt') * 12 + num('hIn'), 24, 192);
  schedule();
}
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
for (const [id, key] of [['oBorder', 'border'], ['oCompass', 'compass'], ['oRings', 'rings'], ['oGrid', 'grid'],
  ['oTrees', 'trees'], ['oWaves', 'waves'], ['oShadows', 'shadows']]) {
  $(id).addEventListener('change', e => { state[key] = e.target.checked; schedule(); });
}
const themeBox = $('themes');
for (const [key, T] of Object.entries(THEMES)) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'theme'; b.dataset.theme = key;
  b.setAttribute('aria-pressed', key === state.theme);
  b.innerHTML = `<span class="sw">${T.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span><b>${T.label}</b><small>${T.note}</small>`;
  b.addEventListener('click', () => {
    state.theme = key;
    themeBox.querySelectorAll('.theme').forEach(x => x.setAttribute('aria-pressed', x === b));
    schedule();
  });
  themeBox.appendChild(b);
}
const placeSel = $('place');
PLACES.slice().sort((a, b) => a[0].localeCompare(b[0])).forEach(p => {
  const o = document.createElement('option'); o.value = p[0]; o.textContent = p[0]; placeSel.appendChild(o);
});
placeSel.addEventListener('change', () => {
  const p = PLACES.find(x => x[0] === placeSel.value);
  if (!p) return;
  const g = geom();
  [state.cx, state.cy] = PROJ(p[1], p[2]);
  state.zoom = clamp((Math.min(g.mapW, g.mapH) / (1.5 * MILE)) / g.minK, 1, g.maxZoom);   // about 1.5 miles across
  placeSel.value = '';
  schedule();
});
new ResizeObserver(schedule).observe(stage);

/* ------------------------------------------------------------ vector tiles */
const cells = new Map();
async function loadCell(key) {
  if (cells.has(key)) return;
  const res = await fetch(`tiles/${key}.bin`);
  if (!res.ok) throw new Error('Could not load map data (' + key + ')');
  let buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    buf = new Uint8Array(await new Response(ds).arrayBuffer());
  }
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
  cells.set(key, { buf, id, ly, x0, y0, x1, y1, s, e });
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
}

const seen = new Int32Array(M.features + 2);
let stamp = 0;
/* features intersecting a base-coordinate window, bucketed by source layer */
function collect(bx0, by0, bx1, by1) {
  stamp++;
  const buckets = Array.from({ length: NSRC }, () => []);
  for (const key of cellKeys(bx0, by0, bx1, by1)) {
    const c = cells.get(key);
    for (let i = 0, n = c.id.length; i < n; i++) {
      if (c.x1[i] < bx0 || c.x0[i] > bx1 || c.y1[i] < by0 || c.y0[i] > by1) continue;
      const id = c.id[i];
      if (seen[id] === stamp) continue;
      seen[id] = stamp;
      buckets[c.ly[i]].push(c.buf.subarray(c.s[i], c.e[i]));
    }
  }
  return buckets;
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
    this.dash = []; this.globalAlpha = 1; this.lineCap = 'butt';
  }
  save() { this.o.push('q'); this.st.push([this.fillStyle, this.strokeStyle, this.lineWidth, this.dash, this.globalAlpha, this.lineCap]); }
  restore() { this.o.push('Q'); [this.fillStyle, this.strokeStyle, this.lineWidth, this.dash, this.globalAlpha, this.lineCap] = this.st.pop(); }
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
  fill() { this.o.push(`${hexrgb(this.fillStyle)} rg ${this.gs()} ${this.p.join(' ')} f`); }
  stroke() {
    this.o.push(`${hexrgb(this.strokeStyle)} RG ${this.gs()} ${f5(this.lineWidth)} w ${this.lineCap === 'round' ? 1 : 0} J 0 j ` +
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
function layerParts(parts, g, buckets, tx, ty, P) {
  const ws = widthScale(g.k);
  parts.push(`${f5(g.k)} 0 0 ${f5(g.k)} ${f2(tx)} ${f2(ty)} cm\n1 j\n`);
  for (const p of P) {
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

async function buildPdf(mode) {
  const g = geom();
  const opt = { border: state.border, compass: state.compass, rings: state.rings, theme: state.theme };
  const P = passes(), land = THEMES[state.theme].land;
  const pats = P.filter(p => p.kind === 'pattern').map(p => p.pat);
  await loadCells(cellKeys(g.x0 - 20, g.y0 - 20, g.x0 + g.vw + 20, g.y0 + g.vh + 20),
    (d, n) => progress(.35 * d / n, `Loading map detail ${d} of ${n}`));

  const doc = new PdfDoc();
  const alphas = new Set([100]);
  const oc = new PdfCtx(alphas);
  drawOverlay(oc, g, opt);
  const overlayOps = oc.o.join('\n') + '\n';

  const idCat = doc.alloc(), idPages = doc.alloc(), idF1 = doc.alloc(), idF2 = doc.alloc(),
    idGS = doc.alloc(), idImg = doc.alloc();
  const kids = [];
  let hasImg = false;
  /* tiling patterns are anchored to the map, so each page gets its own copies shifted to line up across seams */
  const patStreams = pats.map(pat => {
    const pc = new PdfCtx(alphas);
    drawPatternTile(pc, pat);
    return enc.encode(`1 0 0 -1 0 ${pat.T} cm\n` + pc.o.join('\n') + '\n');
  });
  const addPage = async (w, h, parts, ox, oy) => {
    const data = await deflate(parts);
    let pr = '';
    if (pats.length && ox !== undefined) {
      const ps = patScale(g);
      pr = ' /Pattern << ' + pats.map((pat, i) => {
        const id = doc.alloc();
        doc.obj(id, `/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 ${pat.T} ${pat.T}] /XStep ${pat.T} /YStep ${pat.T} ` +
          `/Resources << /ExtGState ${idGS} 0 R >> /Matrix [${f5(ps)} 0 0 ${f5(ps)} ${f2(ox)} ${f2(oy)}]`, patStreams[i]);
        return `/${pat.id} ${id} 0 R`;
      }).join(' ') + ' >>';
    }
    const res = `<< /Font << /F1 ${idF1} 0 R /F2 ${idF2} 0 R >> /ExtGState ${idGS} 0 R` +
      (hasImg ? ` /XObject << /Im1 ${idImg} 0 R >>` : '') + pr + ' >>';
    const c = doc.alloc(), p = doc.alloc();
    doc.obj(c, '/Filter /FlateDecode', data);
    doc.obj(p, `<< /Type /Page /Parent ${idPages} 0 R /MediaBox [0 0 ${f2(w)} ${f2(h)}] /Resources ${res} /Contents ${c} 0 R >>`);
    kids.push(p);
  };

  if (mode === 'sheet') {
    progress(.4, 'Drawing the sheet');
    await tick();
    const parts = [`q ${hexrgb(land)} rg 0 0 ${f2(g.mapW)} ${f2(g.mapH)} re f\n`];
    layerParts(parts, g, collect(g.x0 - 8, g.y0 - 8, g.x0 + g.vw + 8, g.y0 + g.vh + 8), -g.x0 * g.k, -g.y0 * g.k, P);
    parts.push(`Q\nq 1 0 0 -1 0 ${f2(g.mapH)} cm\n`, overlayOps, 'Q\n');
    progress(.7, 'Compressing');
    await addPage(g.mapW, g.mapH, parts, 0, 0);
  } else {
    /* ---- assembly guide */
    const im = themeImg();
    if (!im.ready) await new Promise(r => { im.addEventListener('load', r); im.addEventListener('error', r); });
    if (vectorKeys(g)) await renderVector();
    const tc = document.createElement('canvas');
    const td = 1100 / Math.max(g.mapW, g.mapH);
    tc.width = Math.round(g.mapW * td); tc.height = Math.round(g.mapH * td);
    const tctx = tc.getContext('2d');
    tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, tc.width, tc.height);
    paintMap(tctx, g, td);
    const jpg = new Uint8Array(await (await new Promise(r => tc.toBlob(r, 'image/jpeg', .85))).arrayBuffer());
    doc.obj(idImg, `/Type /XObject /Subtype /Image /Width ${tc.width} /Height ${tc.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, jpg);
    hasImg = true;

    const { pw, ph, cols, rows } = g;
    const total = cols * rows;
    const advTxt = `${f2(g.advX / 72)} x ${f2(g.advY / 72)} in`;
    const lines = [
      `Finished size ${feet(state.wallW)} wide x ${feet(state.wallH)} tall, including a 0.5 in white paper border all round.`,
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
    gp.push(`${ink} rg BT /F2 19 Tf 54 ${y} Td (${esc('Louisville Wall Map: Assembly Guide')}) Tj ET\n`);
    y -= 24;
    const fs = pw < 700 ? 9.3 : 10;
    for (const ln of lines) {
      if (ln) gp.push(`BT /F1 ${fs} Tf 54 ${y} Td (${esc(ln)}) Tj ET\n`);
      y -= 13.6;
    }
    const boxW = pw - 108, boxH = y - 44;
    const sc = Math.min(boxW / g.mapW, boxH / g.mapH);
    const gw = g.mapW * sc, gh = g.mapH * sc, gx = (pw - gw) / 2, gy = y - gh;
    gp.push(`q ${f2(gw)} 0 0 ${f2(gh)} ${f2(gx)} ${f2(gy)} cm /Im1 Do Q\n`);
    gp.push('0 0 0 RG 0.4 w\n');
    const cw = gw / cols, rh = gh / rows;
    for (let i = 0; i <= cols; i++) gp.push(`${f2(gx + i * cw)} ${f2(gy)} m ${f2(gx + i * cw)} ${f2(gy + gh)} l S\n`);
    for (let j = 0; j <= rows; j++) gp.push(`${f2(gx)} ${f2(gy + j * rh)} m ${f2(gx + gw)} ${f2(gy + j * rh)} l S\n`);
    alphas.add(80);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lab = rowName(r) + (c + 1);
      const sz = Math.min(7, cw / (lab.length * .62 + .6), rh * .7);
      const w = lab.length * sz * .6;
      const tx = gx + (c + .5) * cw - w / 2, ty = gy + gh - (r + .5) * rh - sz * .36;
      gp.push(`/A80 gs 1 1 1 rg ${f2(tx - 1)} ${f2(ty - 1)} ${f2(w + 2)} ${f2(sz + 1.2)} re f /A100 gs ${ink} rg ` +
        `BT /F2 ${f2(sz)} Tf ${f2(tx)} ${f2(ty)} Td (${lab}) Tj ET\n`);
    }
    gp.push(`0.35 0.35 0.35 rg BT /F1 7 Tf 54 26 Td (${esc('Map data (c) OpenStreetMap contributors, openstreetmap.org/copyright')}) Tj ET\n`);
    await addPage(pw, ph, gp);

    /* ---- map pages, top row first */
    let n = 0;
    for (let r = 0; r < rows; r++) {
      const rb = rows - 1 - r;
      for (let c = 0; c < cols; c++) {
        const lB = c > 0 ? BLEED : 0, rB = c < cols - 1 ? BLEED : 0, bB = rb > 0 ? BLEED : 0, tB = rb < rows - 1 ? BLEED : 0;
        /* outside edges sit 0.5 in from the paper edge and are never trimmed:
           column 1 hugs the left, every other column the right; row A hugs the top, every other row the bottom */
        const px = c === 0 ? EDGE : pw - EDGE - g.advX;
        const py = r === 0 ? ph - EDGE - g.advY : EDGE;
        const cx0 = px - lB, cx1 = px + g.advX + rB, cy0 = py - bB, cy1 = py + g.advY + tB;
        const clip = `${f2(cx0)} ${f2(cy0)} ${f2(cx1 - cx0)} ${f2(cy1 - cy0)} re W n\n`;
        const bx0 = g.x0 + (c * g.advX - lB) / g.k, bx1 = g.x0 + ((c + 1) * g.advX + rB) / g.k;
        const by0 = g.y0 + (rb * g.advY - bB) / g.k, by1 = g.y0 + ((rb + 1) * g.advY + tB) / g.k;
        const ox = px - c * g.advX, oy = py - rb * g.advY;
        const parts = ['q\n', clip, `${hexrgb(land)} rg ${f2(cx0)} ${f2(cy0)} ${f2(cx1 - cx0)} ${f2(cy1 - cy0)} re f\n`];
        layerParts(parts, g, collect(bx0 - 6, by0 - 6, bx1 + 6, by1 + 6), ox - g.x0 * g.k, oy - g.y0 * g.k, P);
        parts.push('Q\nq\n', clip, `1 0 0 -1 ${f2(ox)} ${f2(oy + g.mapH)} cm\n`, overlayOps, 'Q\n');
        // trim marks (interior seams only) just outside the printed map
        let mk = '0.33 0.33 0.33 RG 0.4 w /A100 gs [] 0 d\n';
        const TK = 18;
        for (const [x, inner] of [[px, c > 0], [px + g.advX, c < cols - 1]]) {
          if (!inner) continue;
          mk += `${f2(x)} ${f2(cy0 - 2 - TK)} m ${f2(x)} ${f2(cy0 - 2)} l S ${f2(x)} ${f2(cy1 + 2)} m ${f2(x)} ${f2(cy1 + 2 + TK)} l S\n`;
        }
        for (const [yy, inner] of [[py, rb > 0], [py + g.advY, rb < rows - 1]]) {
          if (!inner) continue;
          mk += `${f2(cx0 - 2 - TK)} ${f2(yy)} m ${f2(cx0 - 2)} ${f2(yy)} l S ${f2(cx1 + 2)} ${f2(yy)} m ${f2(cx1 + 2 + TK)} ${f2(yy)} l S\n`;
        }
        // page name goes where it will be cut off (above the top trim) or covered (below row A)
        const lab = rowName(r) + (c + 1);
        const ly = r === 0 ? cy0 - 9 : cy1 + 4;
        mk += `0.33 0.33 0.33 rg BT /F1 5.5 Tf ${f2(px + 26)} ${f2(ly)} Td (${lab}   row ${rowName(r)} of ${rowName(rows - 1)}, column ${c + 1} of ${cols}) Tj ET\n`;
        parts.push(mk);
        await addPage(pw, ph, parts, ox, oy);
        n++;
        if (n % 4 === 0 || n === total) { progress(.35 + .65 * n / total, `Building page ${n} of ${total}`); await tick(); }
      }
    }
  }

  doc.obj(idF1, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  doc.obj(idF2, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  doc.obj(idGS, '<< ' + [...alphas].map(a => `/A${a} << /CA ${a / 100} /ca ${a / 100} >>`).join(' ') + ' >>');
  if (!hasImg) doc.obj(idImg, '<< >>');
  doc.obj(idPages, `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map(k => k + ' 0 R').join(' ')}] >>`);
  doc.obj(idCat, `<< /Type /Catalog /Pages ${idPages} 0 R >>`);
  return { blob: doc.finish(idCat), g };
}

async function download(mode) {
  if (busy) return;
  busy = true;
  $('dlPages').disabled = $('dlSheet').disabled = true;
  try {
    const { blob, g } = await buildPdf(mode);
    const size = `${feet(state.wallW)} x ${feet(state.wallH)}`.replace(/ /g, '');
    const st = state.theme === 'classic' ? '' : '-' + state.theme;
    const name = mode === 'sheet' ? `Louisville-map-${size}${st}-single-sheet.pdf`
      : `Louisville-map-${size}${st}-${state.paper}-${g.cols * g.rows}-pages.pdf`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    progress(1, `Done: ${name} (${(blob.size / 1048576).toFixed(1)} MB)`);
  } catch (err) {
    console.error(err);
    progress(0, 'Something went wrong: ' + err.message);
  } finally {
    busy = false;
    $('dlPages').disabled = false;
    schedule();
  }
}
$('dlPages').addEventListener('click', () => download('pages'));
$('dlSheet').addEventListener('click', () => download('sheet'));

window.__mapmaker = { state, geom, buildPdf, schedule, THEMES, PROJ };
readWall();
})();
