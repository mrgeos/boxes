// Развёртка наклейки: контур реза, дизайн с вылетом и безопасная зона; выгрузка контура (SVG) и макета (PNG)
import { esc, fmt, slug } from '../core/util.js';
import { isFoil } from '../core/constants.js';
import { ensureFont } from '../core/fonts.js';
import { isClearFace } from '../core/model.js';
import { clipBase, clipRect } from '../core/mask.js';
import { extraById, extraName } from '../core/extras.js';
import { saveFile } from '../core/project.js';
import { drawLayer, foilPaint, layerPaint } from '../faces/render.js';
import { stickerSize } from './placement.js';
import { stickerKey } from './design.js';
import { tinted } from './film.js';

/* A sticker is printed with its design running a little past the cut (bleed), so a cut a hair off leaves no white
   rim, and the cutter follows its outline: a circle, a rounded rectangle, or for a shape of its own the picture's
   silhouette with its white margin. Text and what must not be cut off stay inside the safe zone. The sheet is laid
   out in mm with its origin at the bleed's corner; the sticker's box (its design) starts at ox, oy. */
const BLEED = 2, SAFE = 2;

/* ---------- a custom shape's outline, traced from its picture ---------- */
/* exact distance (px) from every pixel to the nearest pixel inside, by rows then columns (Felzenszwalb) */
function distField(inside, w, h) {
  const INF = 1e12, d = new Float64Array(w * h), n = Math.max(w, h), f = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n), out = new Float64Array(n);
  const pass = len => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      while ((s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])) <= z[k]) k--;
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; out[q] = (q - v[k]) ** 2 + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = inside[y * w + x] ? 0 : INF; pass(h); for (let y = 0; y < h; y++) d[y * w + x] = out[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = d[y * w + x]; pass(w); for (let x = 0; x < w; x++) d[y * w + x] = Math.sqrt(out[x]); }
  return d;
}
/* the outlines of the pixels that are in, as closed loops of pixel corners */
function traceLoops(isIn, w, h) {
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && isIn(y * w + x), next = new Map(), key = (x, y) => y * (w + 1) + x;
  const edge = (a, b, c, d) => { const k = key(a, b); (next.get(k) || next.set(k, []).get(k)).push([c, d]); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!at(x, y)) continue;
    if (!at(x, y - 1)) edge(x, y, x + 1, y);
    if (!at(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
    if (!at(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
    if (!at(x - 1, y)) edge(x, y + 1, x, y);
  }
  const loops = [];
  for (const [k0, outs] of next) while (outs.length) {
    const sx = k0 % (w + 1), sy = (k0 - sx) / (w + 1), pts = [[sx, sy]];
    let [x, y] = outs.pop();
    while (x !== sx || y !== sy) { pts.push([x, y]); const o = next.get(key(x, y)); if (!o?.length) break; [x, y] = o.pop(); }
    loops.push(pts);
  }
  return loops;
}
/* a loop with the points that hardly change its course left out (Douglas–Peucker, tol in its units) */
function simplify(pts, tol) {
  const keep = new Uint8Array(pts.length), run = (a, b) => {
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1; let m = -1, md = tol;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > md) { md = d; m = i; } }
    if (m >= 0) { keep[m] = 1; run(a, m); run(m, b); }
  };
  let far = 0; pts.forEach((p, i) => { if (Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i; });
  keep[0] = keep[far] = keep[pts.length - 1] = 1; run(0, far); run(far, pts.length - 1);
  return pts.filter((p, i) => keep[i]);
}
/* a closed loop with each point moved towards its neighbours' middle, n times (the pixel steps of a traced outline
   become a smooth line) */
function smoothLoop(pts, n) {
  for (let t = 0; t < n; t++) pts = pts.map((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4]; });
  return pts;
}
/* the picture's silhouette as a distance field: how far each point of a grid round it is from the picture (mm) */
const fields = new Map();
function shapeField(st) {
  const [w, h] = stickerSize(st), grow = (st.outline || 0) + BLEED, key = `${st.src}|${w}|${h}|${grow}`;
  if (fields.get(st.id)?.key === key) return fields.get(st.id);
  const sil = tinted(st.src, '#000000'); if (!sil) return null;
  const ppm = Math.min(10, 1400 / (Math.max(w, h) + 2 * grow)), pad = Math.ceil(grow * ppm) + 2;
  const cw = Math.ceil(w * ppm) + 2 * pad, ch = Math.ceil(h * ppm) + 2 * pad;
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(sil, pad, pad, w * ppm, h * ppm);
  const a = x.getImageData(0, 0, cw, ch).data, inside = new Uint8Array(cw * ch);
  for (let i = 0; i < inside.length; i++) inside[i] = a[i * 4 + 3] > 127 ? 1 : 0;
  const F = { key, ppm, pad, cw, ch, d: distField(inside, cw, ch), masks: new Map() };
  fields.set(st.id, F);
  return F;
}
/* the silhouette grown by r mm, as a picture over the field's grid (white where it is) */
function grownMask(F, r) {
  const k = fmt(r, 2); if (F.masks.has(k)) return F.masks.get(k);
  const c = document.createElement('canvas'); c.width = F.cw; c.height = F.ch;
  const x = c.getContext('2d'), im = x.createImageData(F.cw, F.ch), R = r * F.ppm;
  // a soft edge one pixel wide: the print's edge is not stair-stepped
  for (let i = 0; i < F.d.length; i++) { const t = Math.max(0, Math.min(1, R + 1 - F.d[i])); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = 255; im.data[i * 4 + 3] = Math.round(t * 255); }
  x.putImageData(im, 0, 0); F.masks.set(k, c);
  return c;
}

/* ---------- the sheet ---------- */
/* the sticker's sheet: { kind, w, h (its box), r (corner), loops (custom: the cut in mm of the box), ox, oy (the box on
   the sheet), W, H (the sheet with its bleed), bleed, safe } — null while a custom shape's picture has not loaded */
const sheets = new Map();
function stickerSheet(st) {
  // kept while the shape stays the same (a custom shape's tracing takes a moment)
  const sig = JSON.stringify([stickerSize(st), st.kind, st.radius, st.kind === 'custom' ? [st.src, st.outline] : 0]), got = sheets.get(st.id);
  if (got?.sig === sig) return got.S;
  const S = sheetOf(st); if (S) sheets.set(st.id, { sig, S });
  return S;
}
function sheetOf(st) {
  const [w, h] = stickerSize(st), S = { kind: st.kind === 'custom' ? 'poly' : st.kind === 'circle' ? 'ellipse' : 'rect', w, h, bleed: BLEED, safe: SAFE };
  let x0 = 0, y0 = 0, x1 = w, y1 = h;
  if (S.kind === 'rect') S.r = Math.min(st.radius || 0, w / 2, h / 2);
  if (S.kind === 'poly') {
    const F = shapeField(st); if (!F) return null;
    const R = (st.outline || 0) * F.ppm;
    S.loops = traceLoops(i => F.d[i] <= R, F.cw, F.ch)
      // corners cut to the middle of each pixel side, the pixel steps smoothed out, then the straight runs kept as one
      // segment (a smooth curve for the cutter, a tenth of a millimetre from the traced one)
      .map(l => simplify(smoothLoop(l.map((p, i) => { const q = l[(i + 1) % l.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }), 3), .5))
      .filter(l => l.length > 2).map(l => l.map(([X, Y]) => [(X - F.pad) / F.ppm, (Y - F.pad) / F.ppm]))
      .filter(l => Math.abs(l.reduce((a, [X, Y], i) => { const [X2, Y2] = l[(i + 1) % l.length]; return a + X * Y2 - X2 * Y; }, 0)) / 2 > .25);
    if (!S.loops.length) return null;
    const all = S.loops.flat(); x0 = Math.min(...all.map(p => p[0])); y0 = Math.min(...all.map(p => p[1])); x1 = Math.max(...all.map(p => p[0])); y1 = Math.max(...all.map(p => p[1]));
  }
  Object.assign(S, { ox: BLEED - x0, oy: BLEED - y0, W: x1 - x0 + 2 * BLEED, H: y1 - y0 + 2 * BLEED });
  return S;
}
/* the outline of a circle or rectangle sticker grown by g mm (shrunk when g < 0), on canvas c at k px per mm, the
   sheet's corner at (dx, dy) px */
function shapePath(c, S, g, k, dx = 0, dy = 0) {
  const x = dx + (S.ox - g) * k, y = dy + (S.oy - g) * k, w = (S.w + 2 * g) * k, h = (S.h + 2 * g) * k;
  if (w <= 0 || h <= 0) return false;
  if (S.kind === 'ellipse') c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else c.roundRect(x, y, w, h, Math.max(0, Math.min((S.r + g) * k, w / 2, h / 2)));
  return true;
}
/* the cut on canvas c (k px per mm, the sheet's corner at dx, dy) */
function cutPath(c, S, k, dx = 0, dy = 0) {
  if (S.kind !== 'poly') return shapePath(c, S, 0, k, dx, dy);
  for (const l of S.loops) { l.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](dx + (S.ox + X) * k, dy + (S.oy + Y) * k)); c.closePath(); }
  return true;
}
/* the sticker's design on c, whose transform puts the sticker's box at (0, 0) and W × H px; its ground covers the
   bleed too. Like a face's picture (faces/render.js), with foil layers in their metal */
const clipC = document.createElement('canvas');
function paintDesign(c, o, st, W, H) {
  const d = st.design, k = stickerKey(st), big = Math.max(W, H) * 2;
  if (!d) return;
  if (!isClearFace(o, k)) {
    c.fillStyle = d.bg; c.fillRect(-big, -big, W + 2 * big, H + 2 * big);
    if (d.bgGrad) { c.save(); c.translate(W / 2, H / 2); c.fillStyle = layerPaint(c, { grad: d.bgGrad }, d.bg, W, H); c.fillRect(-W / 2 - big, -H / 2 - big, W + 2 * big, H + 2 * big); c.restore(); }
  }
  const one = (x, L, paint, alpha, op) => {
    const r = clipRect(o, k, L, W, H); x.save();
    if (r) { x.beginPath(); x.rect(...r); x.clip(); }
    drawLayer(x, L, W, H, paint, alpha, op); x.restore();
  };
  for (const L of d.layers) {
    if (!L.visible) continue;
    if (L.type === 'text') ensureFont(L);
    const paint = isFoil(L.effect) ? foilPaint(c, L.effect, W, H) : null, base = clipBase(d, L);
    if (!base) { one(c, L, paint, paint ? 1 : null); continue; }
    if (!base.visible) continue;
    // a layer clipped to the one below: drawn on its own, kept only where that one is
    clipC.width = c.canvas.width; clipC.height = c.canvas.height; const x = clipC.getContext('2d'); x.setTransform(c.getTransform());
    one(x, L, paint, 1, 'source-over'); one(x, base, '#000', 1, 'destination-in');
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = paint ? 1 : L.opacity; c.globalCompositeOperation = paint ? 'source-over' : (L.blend || 'source-over');
    c.drawImage(clipC, 0, 0); c.restore();
  }
}
/* the print of the sticker with its bleed, at k px per mm (transparent past the bleed) */
function stickerSheetCanvas(o, st, k, S = stickerSheet(st)) {
  if (!S) return null;
  const out = document.createElement('canvas'); out.width = Math.max(1, Math.round(S.W * k)); out.height = Math.max(1, Math.round(S.H * k));
  const c = out.getContext('2d'), design = () => { c.save(); c.translate(S.ox * k, S.oy * k); paintDesign(c, o, st, S.w * k, S.h * k); c.restore(); };
  if (S.kind !== 'poly') { c.save(); c.beginPath(); shapePath(c, S, BLEED, k); c.clip(); design(); c.restore(); return out; }
  // a shape of its own: the design inside the picture's silhouette, its white margin round it; the bleed carries on
  // whichever of them reaches the cut
  const F = shapeField(st), ol = st.outline || 0, put = (m, op) => {
    c.save(); c.globalCompositeOperation = op;
    c.drawImage(m, (S.ox - F.pad / F.ppm) * k, (S.oy - F.pad / F.ppm) * k, F.cw / F.ppm * k, F.ch / F.ppm * k); c.restore();
  };
  if (ol > 0) {
    design(); put(grownMask(F, 0), 'destination-in');
    put(grownMask(F, ol + BLEED), 'destination-over');
  } else { design(); put(grownMask(F, BLEED), 'destination-in'); }
  return out;
}

/* ---------- files ---------- */
const nameOf = (o, st) => extraName(o, extraById(o, st.id) || { T: st, kind: 'sticker' });
/* the cut and the safe zone in mm, the sheet as large as the print with its bleed (the PNG lies right over it) */
function stickerSheetSVG(o, st) {
  const S = stickerSheet(st); if (!S) return null;
  const f = v => +v.toFixed(3), line = 'fill="none" stroke-width="0.3"';
  const shape = (g, attrs) => {
    const x = S.ox - g, y = S.oy - g, w = S.w + 2 * g, h = S.h + 2 * g; if (w <= 0 || h <= 0) return '';
    return S.kind === 'ellipse' ? `<ellipse cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" rx="${f(w / 2)}" ry="${f(h / 2)}" ${attrs}/>`
      : `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(Math.max(0, Math.min(S.r + g, w / 2, h / 2)))}" ${attrs}/>`;
  };
  const cut = S.kind === 'poly' ? `<path d="${S.loops.map(l => l.map(([X, Y], i) => `${i ? 'L' : 'M'}${f(S.ox + X)},${f(S.oy + Y)}`).join(' ') + ' Z').join(' ')}" fill-rule="evenodd" ${line} stroke="#00a0e3"/>` : shape(0, `${line} stroke="#00a0e3"`);
  const safe = S.kind === 'poly' ? '' : shape(-SAFE, `${line} stroke="#9a9a9a" stroke-dasharray="1.5 1"`);
  const fin = st.finish?.startsWith('foil') ? ' Наклейка на фольге: где на макете прозрачно, остаётся металл.' : st.clear ? ' Прозрачная плёнка: где на макете прозрачно, плёнка без печати.' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${f(S.W)}mm" height="${f(S.H)}mm" viewBox="0 0 ${f(S.W)} ${f(S.H)}">
<!-- Box Studio 3D — ${esc(o.name)}, ${esc(nameOf(o, st))}: ${fmt(S.W - 2 * BLEED, 1)}×${fmt(S.H - 2 * BLEED, 1)} мм по контуру. Слой cut (голубой) — контур реза, режется только он. Лист — размер макета с вылетом ${BLEED} мм: PNG «с вылетом» ложится на него точно.${safe ? ` Слой safe (серый пунктир) — безопасная зона, ${SAFE} мм от реза: текст и важное держите внутри; не режется.` : ''}${fin} -->
<g id="cut">${cut}</g>${safe ? `\n<g id="safe">${safe}</g>` : ''}
</svg>`;
}
function exportStickerSVG(o, st) {
  const svg = stickerSheetSVG(o, st); if (!svg) return false;
  const S = stickerSheet(st);
  saveFile(`${slug(o.name)}-${slug(nameOf(o, st))}-kontur-${fmt(S.W)}x${fmt(S.H)}mm.svg`, new Blob([svg], { type: 'image/svg+xml' }));
  return true;
}
function exportStickerPNG(o, st) {
  const S = stickerSheet(st); if (!S) return false;
  const out = stickerSheetCanvas(o, st, Math.min(6000 / Math.max(S.W, S.H), 300 / 25.4), S);
  out.toBlob(b => saveFile(`${slug(o.name)}-${slug(nameOf(o, st))}-s-vyletom.png`, b), 'image/png');
  return true;
}

export { cutPath, exportStickerPNG, exportStickerSVG, shapePath, stickerSheet, stickerSheetCanvas, stickerSheetSVG };
