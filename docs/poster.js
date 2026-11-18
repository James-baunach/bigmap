/* Giant Picture Poster Maker: any picture, sized to the wall, split across home-printer pages (same page layout,
   trim marks and assembly steps as the wall map). Everything happens on this device. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const PAPERS = { letter: [612, 792], legal: [612, 1008], a4: [595.28, 841.89], tabloid: [792, 1224] };
const EDGE = 36, BLEED = 10.8, MAX_DPI = 300;
const state = { img: null, name: 'poster', wallW: 48, wallH: 36, lock: true, fit: 'fill', paper: 'letter', orient: 'auto', grid: true, px: .5, py: .5 };

/* ---- layout: same rules as the map (every page full except the last, which shares with its neighbour if thin) */
function spans(total, full, n) {
  if (n === 1) return { size: [total], start: [0] };
  const size = Array(n).fill(full), rem = total - (n - 1) * full;
  if (rem < full / 2) size[n - 2] = size[n - 1] = (full + rem) / 2; else size[n - 1] = rem;
  const start = [0];
  for (let i = 1; i < n; i++) start.push(start[i - 1] + size[i - 1]);
  return { size, start };
}
function layout() {
  const [short, long] = PAPERS[state.paper];
  const mapW = state.wallW * 72 - 2 * EDGE, mapH = state.wallH * 72 - 2 * EDGE, opts = [];
  for (const [pw, ph, name] of [[short, long, 'portrait'], [long, short, 'landscape']]) {
    if (state.orient !== 'auto' && state.orient !== name) continue;
    const fw = pw - 2 * EDGE, fh = ph - 2 * EDGE;
    const cols = Math.max(1, Math.ceil(mapW / fw - 1e-9)), rows = Math.max(1, Math.ceil(mapH / fh - 1e-9));
    const sx = spans(mapW, fw, cols), sy = spans(mapH, fh, rows);
    opts.push({ W: mapW + 2 * EDGE, H: mapH + 2 * EDGE, pw, ph, name, cols, rows, mapW, mapH, colW: sx.size, colX: sx.start, rowH: sy.size, rowY: sy.start });
  }
  opts.sort((a, b) => a.cols * a.rows - b.cols * b.rows);
  return opts[0];
}
/* where the picture sits on the poster area: { x, y, w, h } in points from the poster area's top-left */
function placement(L) {
  const im = state.img, s = state.fit === 'fill' ? Math.max(L.mapW / im.width, L.mapH / im.height) : Math.min(L.mapW / im.width, L.mapH / im.height);
  const w = im.width * s, h = im.height * s;
  return { w, h, x: (L.mapW - w) * state.px, y: (L.mapH - h) * state.py, s };
}
const rowName = r => (r < 26 ? String.fromCharCode(65 + r) : String.fromCharCode(64 + Math.floor(r / 26)) + String.fromCharCode(65 + r % 26));
const f2 = v => (Math.round(v * 100) / 100).toString();
const feet = inch => { const ft = Math.floor(inch / 12 + 1e-9), i = Math.round((inch - ft * 12) * 10) / 10; return ft ? `${ft} ft${i ? ' ' + i + ' in' : ''}` : `${i} in`; };

/* ---- preview */
const canvas = $('view'), stage = $('stage');
let raf = 0, disp = 1;
const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
function render() {
  raf = 0;
  const L = layout();
  disp = Math.max(.001, Math.min((stage.clientWidth - 44) / L.W, (stage.clientHeight - 44) / L.H));
  const cw = Math.round(L.W * disp), ch = Math.round(L.H * disp), dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(EDGE * disp, EDGE * disp);
  ctx.beginPath(); ctx.rect(0, 0, L.mapW * disp, L.mapH * disp); ctx.clip();
  if (state.img) {
    const p = placement(L);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.img, p.x * disp, p.y * disp, p.w * disp, p.h * disp);
  } else {
    ctx.fillStyle = '#f3f1ec'; ctx.fillRect(0, 0, L.mapW * disp, L.mapH * disp);
    ctx.fillStyle = '#44505c'; ctx.font = '600 15px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Choose a picture to start', L.mapW * disp / 2, L.mapH * disp / 2);
  }
  if (state.grid) {
    ctx.strokeStyle = 'rgba(168,35,44,.6)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let i = 1; i < L.cols; i++) { const x = Math.round(L.colX[i] * disp) + .5; ctx.moveTo(x, 0); ctx.lineTo(x, L.mapH * disp); }
    for (let j = 1; j < L.rows; j++) { const y = Math.round(L.rowY[j] * disp) + .5; ctx.moveTo(0, y); ctx.lineTo(L.mapW * disp, y); }
    ctx.stroke();
  }
  ctx.restore();
  canvas.style.cursor = state.img && state.fit === 'fill' ? 'grab' : 'default';
  $('sPages').textContent = `${L.cols * L.rows} (${L.rows} x ${L.cols}, ${L.name})`;
  if (state.img) {
    const dpi = Math.round(1 / (placement(L).s / 72));
    $('sDpi').textContent = dpi + ' dpi';
    const note = $('dpiNote');
    note.hidden = dpi >= 100;
    note.textContent = dpi < 50 ? `At this size the picture has only ${dpi} pixels per inch, so it will look blocky up close. A larger original, or a smaller poster, will look sharper.`
      : `At this size the picture has ${dpi} pixels per inch: fine from a few steps back, a little soft up close.`;
  } else $('sDpi').textContent = '-';
}
new ResizeObserver(schedule).observe(stage);

/* drag to choose the visible part when the picture is trimmed */
let drag = null;
canvas.addEventListener('pointerdown', e => {
  if (!state.img || state.fit !== 'fill') return;
  drag = { x: e.clientX, y: e.clientY, px: state.px, py: state.py };
  canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const L = layout(), p = placement(L);
  const ox = L.mapW - p.w, oy = L.mapH - p.h;           // negative: how much is trimmed
  if (ox < -1e-6) state.px = clamp(drag.px + (e.clientX - drag.x) / disp / ox, 0, 1);
  if (oy < -1e-6) state.py = clamp(drag.py + (e.clientY - drag.y) / disp / oy, 0, 1);
  schedule();
});
const endDrag = () => { drag = null; schedule(); };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

/* ---- controls */
function readSide(ft, inch) { return clamp((+$(ft).value || 0) * 12 + (+$(inch).value || 0), 12, 192); }
function writeSide(ft, inch, v) { v = Math.round(v * 2) / 2; $(ft).value = Math.floor(v / 12); $(inch).value = v - Math.floor(v / 12) * 12; }
function onSize(which) {
  state.wallW = readSide('wFt', 'wIn'); state.wallH = readSide('hFt', 'hIn');
  if (state.lock && state.img) {
    const ar = state.img.width / state.img.height;          // the picture area keeps the picture's shape; the border is fixed
    if (which === 'w') state.wallH = clamp((state.wallW * 72 - 2 * EDGE) / ar / 72 + 2 * EDGE / 72, 12, 192);
    else state.wallW = clamp((state.wallH * 72 - 2 * EDGE) * ar / 72 + 2 * EDGE / 72, 12, 192);
  }
  writeSide('wFt', 'wIn', state.wallW); writeSide('hFt', 'hIn', state.wallH);
  state.wallW = readSide('wFt', 'wIn'); state.wallH = readSide('hFt', 'hIn');
  schedule();
}
['wFt', 'wIn'].forEach(id => $(id).addEventListener('change', () => onSize('w')));
['hFt', 'hIn'].forEach(id => $(id).addEventListener('change', () => onSize('h')));
$('lock').addEventListener('change', e => { state.lock = e.target.checked; onSize('w'); });
$('fit').addEventListener('change', e => { state.fit = e.target.value; schedule(); });
document.querySelectorAll('input[name=paper]').forEach(r => r.addEventListener('change', () => { state.paper = r.value; schedule(); }));
$('orient').addEventListener('change', e => { state.orient = e.target.value; schedule(); });
$('grid').addEventListener('change', e => { state.grid = e.target.checked; schedule(); });

$('file').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  $('fileMsg').textContent = 'Opening...';
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    state.img = bmp; state.px = state.py = .5;
    state.name = (f.name.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'poster').slice(0, 40);
    $('fileMsg').textContent = `${f.name}: ${bmp.width} x ${bmp.height} pixels. It stays on your device.`;
    $('dlPages').disabled = $('dlSheet').disabled = false;
    onSize('w');
  } catch (err) {
    $('fileMsg').textContent = 'Could not open that file as a picture. Try a JPEG or PNG.';
  }
});

/* ---- PDF (tiny writer: images as JPEG, text in the standard Helvetica fonts) */
class Pdf {
  constructor() { this.parts = []; this.offs = []; this.len = 0; this.n = 2; this.pages = []; this.enc = new TextEncoder(); this.push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'); }
  push(x) { const b = typeof x === 'string' ? this.enc.encode(x) : x; this.parts.push(b); this.len += b.length; }
  obj(id, dict, stream) {
    this.offs[id] = this.len;
    if (stream) { this.push(`${id} 0 obj\n<< ${dict} /Length ${stream.length} >>\nstream\n`); this.push(stream); this.push('\nendstream\nendobj\n'); }
    else this.push(`${id} 0 obj\n${dict}\nendobj\n`);
  }
  id() { return ++this.n; }
  page(pw, ph, content, imgs) {
    const c = this.id(), p = this.id();
    this.obj(c, '', this.enc.encode(content));
    const xo = Object.entries(imgs || {}).map(([k, v]) => `/${k} ${v} 0 R`).join(' ');
    this.obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(pw)} ${f2(ph)}] /Contents ${c} 0 R /Resources << /Font << /F1 1 0 R >> /XObject << ${xo} >> >> >>`);
    this.pages.push(p);
  }
  blob() {
    this.offs[1] = this.len; this.push('1 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
    this.offs[2] = this.len; this.push(`2 0 obj\n<< /Type /Pages /Kids [${this.pages.map(p => p + ' 0 R').join(' ')}] /Count ${this.pages.length} >>\nendobj\n`);
    const cat = this.id(); this.offs[cat] = this.len; this.push(`${cat} 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
    const x = this.len;
    let t = `xref\n0 ${this.n + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= this.n; i++) t += String(this.offs[i] || 0).padStart(10, '0') + ' 00000 n \n';
    this.push(t + `trailer\n<< /Size ${this.n + 1} /Root ${cat} 0 R >>\nstartxref\n${x}\n%%EOF\n`);
    return new Blob(this.parts, { type: 'application/pdf' });
  }
}
const esc = s => s.replace(/[\\()]/g, m => '\\' + m).replace(/[^\x20-\x7e]/g, '?');
const tick = () => new Promise(r => setTimeout(r, 0));
async function jpegOf(L, p, bx0, by0, bw, bh) {
  // the part of the poster area [bx0, by0, bw, bh] (points) as a JPEG at the picture's own sharpness, at most 300 dpi
  const ppp = Math.min(MAX_DPI / 72, 1 / p.s), w = Math.max(1, Math.round(bw * ppp)), h = Math.max(1, Math.round(bh * ppp));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.scale(w / bw, h / bh); ctx.translate(-bx0, -by0);
  ctx.beginPath(); ctx.rect(0, 0, L.mapW, L.mapH); ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.img, p.x, p.y, p.w, p.h);
  ctx.restore();
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .92));
  return { w, h, data: new Uint8Array(await b.arrayBuffer()) };
}
function progress(frac, text) {
  $('progress').hidden = false; $('bar').style.width = (frac * 100).toFixed(1) + '%'; $('ptext').textContent = text;
}
function save(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
async function build(mode) {
  const L = layout(), p = placement(L), doc = new Pdf();
  const sizeTxt = `${Math.round(state.wallW)}x${Math.round(state.wallH)}in`;
  if (mode === 'sheet') {
    progress(.2, 'Drawing the sheet');
    const im = await jpegOf(L, p, 0, 0, L.mapW, L.mapH), id = doc.id();
    doc.obj(id, `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, im.data);
    doc.page(L.W, L.H, `q ${f2(L.mapW)} 0 0 ${f2(L.mapH)} ${EDGE} ${EDGE} cm /Im0 Do Q\n`, { Im0: id });
    return { blob: doc.blob(), name: `${state.name}-${sizeTxt}-sheet.pdf` };
  }
  const { pw, ph, cols, rows } = L, total = cols * rows;
  /* assembly guide */
  progress(.02, 'Drawing the assembly guide');
  const thumb = await jpegOf(L, p, 0, 0, L.mapW, L.mapH).catch(() => null);
  const g = [], lines = [
    `Finished size ${feet(L.W / 72)} wide x ${feet(L.H / 72)} tall, including a 0.5 in white paper border all round.`,
    `${total} pages: ${rows} rows (A at the top to ${rowName(rows - 1)}) x ${cols} columns (1 at the left to ${cols}). Paper ${f2(pw / 72)} x ${f2(ph / 72)} in.`,
    '',
    `1.  Print pages 2 to ${total + 1} at ACTUAL SIZE / 100% (turn off "Fit to page" / "Shrink oversized pages").`,
    '2.  Each page has its name in small type in the margin (A1, A2 ...). These get cut off or covered.',
    '3.  Where another page joins, 0.15 in of extra picture prints past the trim marks.',
    '4.  Trim the LEFT edge of every page except column 1, and the TOP edge of every page except row A,',
    '     along the trim marks. Leave the right and bottom edges untrimmed.',
    '5.  Work left to right, top to bottom. Lay each trimmed edge over the untrimmed edge of its neighbor,',
    '     line up the picture and the trim marks, and fix with glue stick or tape on the back.',
  ];
  let y = ph - 62;
  g.push(`0.11 0.15 0.2 rg BT /F1 19 Tf 54 ${y} Td (Giant Picture Poster: Assembly Guide) Tj ET\n`);
  y -= 24;
  for (const ln of lines) { if (ln) g.push(`BT /F1 9.3 Tf 54 ${y} Td (${esc(ln)}) Tj ET\n`); y -= 13.6; }
  const sc = Math.min((pw - 108) / L.mapW, (y - 40) / L.mapH), gw = L.mapW * sc, gh = L.mapH * sc, gx = (pw - gw) / 2, gy = y - gh;
  const imgs = {};
  if (thumb) {
    const id = doc.id();
    doc.obj(id, `/Type /XObject /Subtype /Image /Width ${thumb.w} /Height ${thumb.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, thumb.data);
    imgs.Im0 = id; g.push(`q ${f2(gw)} 0 0 ${f2(gh)} ${f2(gx)} ${f2(gy)} cm /Im0 Do Q\n`);
  }
  g.push('1 0 0 RG 0.6 w\n');
  const xs = [...L.colX, L.mapW].map(v => gx + v * sc), ys = [...L.rowY, L.mapH].map(v => gy + gh - v * sc);
  for (const x of xs) g.push(`${f2(x)} ${f2(gy)} m ${f2(x)} ${f2(gy + gh)} l S\n`);
  for (const yy of ys) g.push(`${f2(gx)} ${f2(yy)} m ${f2(gx + gw)} ${f2(yy)} l S\n`);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lab = rowName(r) + (c + 1), sz = Math.min(8, L.colW[c] * sc / 3, L.rowH[r] * sc / 2);
    const tx = xs[c] + L.colW[c] * sc / 2 - lab.length * sz * .3, ty = ys[r] - L.rowH[r] * sc / 2 - sz * .35;
    g.push(`1 1 1 rg ${f2(tx - 1.5)} ${f2(ty - 1.5)} ${f2(lab.length * sz * .6 + 3)} ${f2(sz + 2)} re f 0 0 0 rg BT /F1 ${f2(sz)} Tf ${f2(tx)} ${f2(ty)} Td (${lab}) Tj ET\n`);
  }
  doc.page(pw, ph, g.join(''), imgs);
  /* poster pages, top row first: each page's piece sits at the sheet's top-left inside the 0.5 in margin */
  let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tw = L.colW[c], th = L.rowH[r];
    const bl = c > 0 ? BLEED : 0, br = c < cols - 1 ? BLEED : 0, bt = r > 0 ? BLEED : 0, bb = r < rows - 1 ? BLEED : 0;
    const im = await jpegOf(L, p, L.colX[c] - bl, L.rowY[r] - bt, tw + bl + br, th + bt + bb), id = doc.id();
    doc.obj(id, `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, im.data);
    const x0 = EDGE, yTop = ph - EDGE;                       // trim box: x0 .. x0+tw, yTop-th .. yTop
    const ops = [`q ${f2(tw + bl + br)} 0 0 ${f2(th + bt + bb)} ${f2(x0 - bl)} ${f2(yTop - th - bb)} cm /Im0 Do Q\n`, '0 0 0 RG 0.4 w\n'];
    const xL = x0, xR = x0 + tw, yT = yTop, yB = yTop - th, m = 18, gap = BLEED + 3;
    for (const [x, y, dx, dy] of [[xL, yT, -1, 1], [xR, yT, 1, 1], [xL, yB, -1, -1], [xR, yB, 1, -1]]) {
      ops.push(`${f2(x + dx * gap)} ${f2(y)} m ${f2(x + dx * (gap + m))} ${f2(y)} l S ${f2(x)} ${f2(y + dy * gap)} m ${f2(x)} ${f2(y + dy * (gap + m))} l S\n`);
    }
    ops.push(`0.35 0.35 0.35 rg BT /F1 7 Tf ${f2(x0 + 24)} ${f2(yTop + 16)} Td (${rowName(r)}${c + 1}   row ${rowName(r)}, column ${c + 1} of ${cols}) Tj ET\n`);
    doc.page(pw, ph, ops.join(''), { Im0: id });
    n++;
    progress(.05 + .9 * n / total, `Building page ${n} of ${total}`);
    await tick();
  }
  return { blob: doc.blob(), name: `${state.name}-${sizeTxt}-${total}pages-${state.paper}.pdf` };
}
for (const [id, mode] of [['dlPages', 'pages'], ['dlSheet', 'sheet']]) {
  $(id).addEventListener('click', async () => {
    if (!state.img) return;
    $('dlPages').disabled = $('dlSheet').disabled = true;
    try {
      const { blob, name } = await build(mode);
      save(blob, name);
      progress(1, `Done: ${name} (${(blob.size / 1048576).toFixed(1)} MB)`);
    } catch (err) { progress(0, 'Something went wrong: ' + err.message); }
    finally { $('dlPages').disabled = $('dlSheet').disabled = false; }
  });
}
window.__poster = { state, build, layout, onSize };
onSize('w');
})();
