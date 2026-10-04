// Развёртка в панели
import { $ } from '../core/util.js';
import { activeObj, sel } from '../core/state.js';
import { faceKeys, netLayout } from '../core/model.js';
import { RT } from '../scene/renderer.js';
import { fanOutline, fanXY } from '../carriers/cup.js';
import { cutNetWindow, netWindowPath, netWindows } from '../carriers/box.js';
import { drawNetPanel } from '../faces/render.js';
import { select } from '../core/selection.js';

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
function drawNet() {
  const o = activeObj(); const dpr = Math.min(devicePixelRatio || 1, 2);
  const cw = netC.clientWidth || 300;
  if (!o) { nctx.clearRect(0, 0, netC.width, netC.height); return; }
  const n = netLayout(o), pad = 8, k = (cw - pad * 2) / n.W, ch = Math.round(n.H * k + pad * 2);
  if (netC.width !== cw * dpr || netC.height !== ch * dpr) { netC.width = cw * dpr; netC.height = ch * dpr; netC.style.height = ch + 'px'; }
  const c = nctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, ch);
  const rt = RT.get(o.id);
  const accentCss = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  for (const p of n.panels) {
    const x = pad + p.x * k, y = pad + p.y * k, w = p.w * k, h = p.h * k, fc = rt?.faces[p.key]?.canvas;
    c.save(); c.beginPath(); panelPath(c, p, pad, pad, k); c.clip();
    if (fc) drawNetPanel(c, fc, p, x, y, w, h); else if (p.fold) { c.fillStyle = o.faces.front?.bg || o.board; c.fillRect(x, y, w, h); }
    else if (p.blank) { c.fillStyle = 'rgba(120,110,95,.14)'; c.fillRect(x, y, w, h); }
    c.restore();
    c.beginPath();
    if (p.fan) {
      fanOutline(p.fan).forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](x + X * k, y + Y * k)); c.closePath();
      const [ax, ay] = fanXY(p.fan, 0, 0), [bx, by] = fanXY(p.fan, 0, 1);   // seam: glue overlap to the left
      c.save(); c.setLineDash([2, 2]); c.strokeStyle = 'rgba(120,110,95,.8)'; c.lineWidth = 1; const q = new Path2D(); q.moveTo(x + ax * k, y + ay * k); q.lineTo(x + bx * k, y + by * k); c.stroke(q); c.restore();
    } else if (p.poly || p.r || p.circle) panelPath(c, p, pad, pad, k); else c.rect(x + .5, y + .5, w - 1, h - 1);
    c.setLineDash(p.key === sel.face ? [] : [3, 3]); c.lineWidth = p.key === sel.face ? 2.5 : 1; c.strokeStyle = p.key === sel.face ? accentCss : 'rgba(120,110,95,.8)'; c.stroke(); c.setLineDash([]);
  }
  cutNetWindow(c, o, pad, k);
  for (const p of n.panels) for (const l of p.creases || []) { c.beginPath(); c.moveTo(pad + l[0] * k, pad + l[1] * k); c.lineTo(pad + l[2] * k, pad + l[3] * k); c.setLineDash([4, 3]); c.strokeStyle = 'rgba(230,0,126,.7)'; c.lineWidth = 1; c.stroke(); c.setLineDash([]); }
  for (const t of n.tabs || []) { c.beginPath(); t.pts.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](pad + X * k, pad + Y * k)); c.fillStyle = o.board || '#ffffff'; c.fill(); c.strokeStyle = 'rgba(120,110,95,.8)'; c.lineWidth = 1; c.stroke(); }
  for (const l of n.slots || []) { c.beginPath(); c.moveTo(pad + l[0] * k, pad + l[1] * k); c.lineTo(pad + l[2] * k, pad + l[3] * k); c.strokeStyle = 'rgba(0,160,227,.9)'; c.lineWidth = 1.2; c.stroke(); }
  for (const p of n.panels) for (const hl of p.holes || []) {
    c.save(); c.beginPath(); hl.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](pad + X * k, pad + Y * k)); c.closePath();
    c.globalCompositeOperation = 'destination-out'; c.fill(); c.restore();
    c.beginPath(); hl.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](pad + X * k, pad + Y * k)); c.closePath(); c.setLineDash([3, 3]); c.strokeStyle = 'rgba(120,110,95,.8)'; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
  }
  for (const q of netWindows(o, n)) { netWindowPath(c, q, pad, k); c.strokeStyle = 'rgba(0,160,227,.9)'; c.lineWidth = 1; c.stroke(); }
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

export { drawNet, initNetView, panelPath };
