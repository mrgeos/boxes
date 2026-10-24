// Развёртка в панели
import { $ } from '../core/util.js';
import { activeObj, sel } from '../core/state.js';
import { faceKeys, netLayout } from '../core/model.js';
import { RT } from '../scene/renderer.js';
import { fanOutline, fanXY } from '../carriers/cup.js';
import { cutNetWindow, netWindowPath, netWindows } from '../carriers/box.js';
import { cropPx, drawNetPanel } from '../faces/render.js';
import { select } from '../core/selection.js';
import { isPart } from '../core/extras.js';
import { activeSticker } from '../stickers/placement.js';
import { cutPath, shapePath, stickerSheet, stickerSheetCanvas } from '../stickers/sheet.js';
import { stickerFoil } from '../stickers/film.js';
import { fmt } from '../core/util.js';

const netC = $('#net'), nctx = netC.getContext('2d');
let netGeom = null;
/* outline of a panel on the sheet (px at scale k, offset ox/oy): circle, slanted wall, rounded part or plain rectangle */
function panelPath(c, p, ox, oy, k) {
  const x = ox + p.x * k, y = oy + p.y * k, w = p.w * k, h = p.h * k;
  if (p.circle) c.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
  else if (p.poly) { p.poly.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](ox + X * k, oy + Y * k)); c.closePath(); }
  else if (p.r) c.roundRect(x, y, w, h, p.r * k);
  else c.rect(x, y, w, h);
}
function inPanel(p, X, Y) {
  if (!p.poly) return X >= p.x && X <= p.x + p.w && Y >= p.y && Y <= p.y + p.h;
  let ins = false;
  for (let i = 0, j = p.poly.length - 1; i < p.poly.length; j = i++) {
    const [xi, yi] = p.poly[i], [xj, yj] = p.poly[j];
    if ((yi > Y) !== (yj > Y) && X < (xj - xi) * (Y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
/* what the panel shows: the object's sheet without its parts (a sleeve, a carrier), or the picked part's sheet alone */
function viewNet(o) {
  const all = netLayout(o);
  if (!sel.part) {
    const panels = all.panels.filter(p => !isPart(p.key));
    if (panels.length === all.panels.length) return all;
    return { ...all, panels, H: Math.max(...panels.map(p => p.y + p.h)) };
  }
  const own = all.panels.filter(p => p.key === sel.part); if (!own.length) return all;
  const x0 = Math.min(...own.map(p => p.x)), y0 = Math.min(...own.map(p => p.y));
  const mv = q => q.map(([X, Y]) => [X - x0, Y - y0]);
  const panels = own.map(p => ({ ...p, x: p.x - x0, y: p.y - y0, ...(p.poly ? { poly: mv(p.poly) } : {}), ...(p.holes ? { holes: p.holes.map(mv) } : {}),
    ...(p.creases ? { creases: p.creases.map(([a, b, c, d]) => [a - x0, b - y0, c - x0, d - y0]) } : {}) }));
  return { W: Math.max(...panels.map(p => p.x + p.w)), H: Math.max(...panels.map(p => p.y + p.h)), panels, part: true };
}
/* the section's texts and buttons: a sticker's sheet or an object's net */
const NET_TEXT = {
  obj: ['Клик по панели развёртки выбирает грань. Готовый макет всей развёртки можно наложить целиком: он сам разрежется по граням.', 'Шаблон SVG', 'PNG с дизайном'],
  sticker: ['Голубой — контур реза. За ним вылет 2 мм: фон и картинки у края продолжаются туда, чтобы при неточной резке не осталось каймы. Серый пунктир — безопасная зона: текст и важное держите внутри.', 'Контур SVG', 'PNG с вылетом'],
};
function netTexts(st) {
  const [hint, svg, png] = NET_TEXT[st ? 'sticker' : 'obj'];
  $('#netHint').textContent = st?.kind === 'custom' ? hint.replace(/ Серый пунктир.*$/, ' Текст и важное держите в 2 мм от края картинки.') : hint;
  $('#tplBtn2').textContent = svg; $('#flatBtn2').textContent = png;
  $('#bleedRow').hidden = !!st; $('#dielineBtn').hidden = !!st; if (st) $('#dielineOffBtn').hidden = true;
}
/* a sticker's sheet: its print with the bleed (paler past the cut), the cut and the safe zone */
function drawStickerNet(o, st, cw, dpr) {
  const S = stickerSheet(st), pad = 8;
  $('#netSize').textContent = S ? `${fmt(S.W - 2 * S.bleed, 1)} × ${fmt(S.H - 2 * S.bleed, 1)} мм + вылет ${S.bleed}` : '';
  if (!S) { nctx.clearRect(0, 0, netC.width, netC.height); return; }
  // as large as the panel allows, a tall sticker no taller than the panel is wide
  const k = Math.min((cw - pad * 2) / S.W, (cw - pad * 2) / S.H), ch = Math.round(S.H * k + pad * 2), ox = (cw - S.W * k) / 2;
  if (netC.width !== cw * dpr || netC.height !== ch * dpr) { netC.width = cw * dpr; netC.height = ch * dpr; netC.style.height = ch + 'px'; }
  const c = nctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, ch);
  const pic = stickerSheetCanvas(o, st, k * dpr, S);
  // on foil, what is not printed is the metal (as in the design's window)
  if (st.finish?.startsWith('foil')) { c.save(); c.beginPath(); cutPath(c, S, k, ox, pad); c.translate(ox + S.W * k / 2, pad + S.H * k / 2); c.fillStyle = stickerFoil(c, st.finish, S.W * k, S.H * k); c.fill('evenodd'); c.restore(); }
  if (pic) c.drawImage(pic, ox, pad, S.W * k, S.H * k);
  // past the cut: veiled, it is cut away
  c.save(); c.beginPath(); c.rect(ox, pad, S.W * k, S.H * k); cutPath(c, S, k, ox, pad); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill('evenodd'); c.restore();
  c.beginPath(); cutPath(c, S, k, ox, pad); c.strokeStyle = 'rgba(0,160,227,.95)'; c.lineWidth = 1.5; c.stroke();
  if (S.kind !== 'poly') { c.beginPath(); if (shapePath(c, S, -S.safe, k, ox, pad)) { c.setLineDash([4, 3]); c.strokeStyle = 'rgba(120,110,95,.85)'; c.lineWidth = 1; c.stroke(); c.setLineDash([]); } }
  netGeom = null;
}
/* the object's net (viewNet) on a canvas context: the panels with their designs, cut and fold lines, windows, tabs.
   (ox, oy): where the sheet's corner is, k: px per mm. selKey: the panel drawn as selected (null: none);
   fan(p, canvas, w, h): a picture for a fan panel, where the caller keeps the slow warp in a cache;
   before(c), after(c): more drawn under the panels and over everything (the bleed, the safe zone, dimensions) */
function paintNet(c, o, n, { ox, oy = ox, k, selKey = sel.face, accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), fan = null, before = null, after = null }) {
  const accentCss = accent;
  const rt = RT.get(o.id);
  before?.(c);
  for (const p of n.panels) {
    const x = ox + p.x * k, y = oy + p.y * k, w = p.w * k, h = p.h * k, fc = rt?.faces[p.key]?.canvas;
    c.save(); c.beginPath(); panelPath(c, p, ox, oy, k); c.clip();
    if (fc && p.fan && fan) c.drawImage(fan(p, fc, w, h), x, y, w, h); else if (fc) drawNetPanel(c, fc, p, x, y, w, h, cropPx(fc, p)); else if (p.fold) { c.fillStyle = o.faces.front?.bg || o.board; c.fillRect(x, y, w, h); }
    else if (p.blank) { c.fillStyle = 'rgba(120,110,95,.14)'; c.fillRect(x, y, w, h); }
    c.restore();
    c.beginPath();
    if (p.fan) {
      fanOutline(p.fan).forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](x + X * k, y + Y * k)); c.closePath();
      const [ax, ay] = fanXY(p.fan, 0, 0), [bx, by] = fanXY(p.fan, 0, 1);   // seam: glue overlap to the left
      c.save(); c.setLineDash([2, 2]); c.strokeStyle = 'rgba(120,110,95,.8)'; c.lineWidth = 1; const q = new Path2D(); q.moveTo(x + ax * k, y + ay * k); q.lineTo(x + bx * k, y + by * k); c.stroke(q); c.restore();
    } else if (p.poly || p.r || p.circle) panelPath(c, p, ox, oy, k); else c.rect(x + .5, y + .5, w - 1, h - 1);
    c.setLineDash(p.key === selKey ? [] : [3, 3]); c.lineWidth = p.key === selKey ? 2.5 : 1; c.strokeStyle = p.key === selKey ? accentCss : 'rgba(120,110,95,.8)'; c.stroke(); c.setLineDash([]);
  }
  if (!n.part) cutNetWindow(c, o, ox, k, oy);
  // a film's safe zone: 4 mm in from the cut
  if (n.tray?.safe) { c.beginPath(); n.tray.safe.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](ox + X * k, oy + Y * k)); c.closePath(); c.setLineDash([3, 3]); c.lineWidth = 1; c.strokeStyle = 'rgba(120,110,95,.8)'; c.stroke(); c.setLineDash([]); }
  for (const p of n.panels) for (const l of p.creases || []) { c.beginPath(); c.moveTo(ox + l[0] * k, oy + l[1] * k); c.lineTo(ox + l[2] * k, oy + l[3] * k); c.setLineDash([4, 3]); c.strokeStyle = 'rgba(230,0,126,.7)'; c.lineWidth = 1; c.stroke(); c.setLineDash([]); }
  for (const t of n.tabs || []) { c.beginPath(); t.pts.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](ox + X * k, oy + Y * k)); c.fillStyle = o.board || '#ffffff'; c.fill(); c.strokeStyle = 'rgba(120,110,95,.8)'; c.lineWidth = 1; c.stroke();
    if (t.glue) { c.beginPath(); t.glue.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](ox + X * k, oy + Y * k)); c.fillStyle = 'rgba(243,146,0,.25)'; c.fill(); }
    for (const l of t.creases || []) { c.beginPath(); c.moveTo(ox + l[0] * k, oy + l[1] * k); c.lineTo(ox + l[2] * k, oy + l[3] * k); c.setLineDash([4, 3]); c.strokeStyle = 'rgba(230,0,126,.7)'; c.stroke(); c.setLineDash([]); }
  }
  for (const l of n.slots || []) { c.beginPath(); c.moveTo(ox + l[0] * k, oy + l[1] * k); c.lineTo(ox + l[2] * k, oy + l[3] * k); c.strokeStyle = 'rgba(0,160,227,.9)'; c.lineWidth = 1.2; c.stroke(); }
  for (const p of n.panels) for (const hl of p.holes || []) {
    c.save(); c.beginPath(); hl.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](ox + X * k, oy + Y * k)); c.closePath();
    c.globalCompositeOperation = 'destination-out'; c.fill(); c.restore();
    c.beginPath(); hl.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](ox + X * k, oy + Y * k)); c.closePath(); c.setLineDash([3, 3]); c.strokeStyle = 'rgba(120,110,95,.8)'; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
  }
  const ws = n.part ? [] : netWindows(o, n), line = (pts, dash) => { c.beginPath(); pts.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](ox + X * k, oy + Y * k)); c.setLineDash(dash); c.stroke(); c.setLineDash([]); };
  c.strokeStyle = 'rgba(0,160,227,.9)'; c.lineWidth = 1;
  for (const q of ws) if (!(ws.leafCut && q.lid)) { netWindowPath(c, q, ox, k, oy); c.stroke(); }
  // the handle cut out of the lid: its leaves lie in the openings, creased to the bridge
  if (ws.leafCut) {
    for (const l of ws.leafCut.cuts) line(l, []);
    c.strokeStyle = 'rgba(230,0,126,.8)'; for (const [a, b, x2, y2] of ws.leafCut.creases) line([[a, b], [x2, y2]], [4, 3]);
  }
  after?.(c);
}
function drawNet() {
  const o = activeObj(); const dpr = Math.min(devicePixelRatio || 1, 2);
  const cw = netC.clientWidth || 300, st = o && activeSticker();
  netTexts(st);
  if (!o) { nctx.clearRect(0, 0, netC.width, netC.height); return; }
  // (a sticker's sheet only while it is shown: it is drawn again when the section opens)
  if (st) return netC.clientWidth ? drawStickerNet(o, st, cw, dpr) : undefined;
  const n = viewNet(o), pad = 8, k = (cw - pad * 2) / n.W, ch = Math.round(n.H * k + pad * 2);
  if (netC.width !== cw * dpr || netC.height !== ch * dpr) { netC.width = cw * dpr; netC.height = ch * dpr; netC.style.height = ch + 'px'; }
  const c = nctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, ch);
  paintNet(c, o, n, { ox: pad, k });
  netGeom = { n, k, pad };
}

/* hooks up clicks on the net */
function initNetView() {
  netC.addEventListener('click', e => {
    if (!netGeom) return; const r = netC.getBoundingClientRect(); const x = (e.clientX - r.left - netGeom.pad) / netGeom.k, y = (e.clientY - r.top - netGeom.pad) / netGeom.k;
    const p = netGeom.n.panels.find(p => inPanel(p, x, y));
    if (p && faceKeys(activeObj()).includes(p.key)) select(sel.obj, p.key, null, { flash: true });
  });
}

export { drawNet, inPanel, initNetView, paintNet, panelPath, viewNet };
