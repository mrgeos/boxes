// Большая развёртка на сцене: режимы «2D» и «2D + 3D» (масштаб, сдвиг, выбор и подсветка граней)
import { $, fmt } from '../core/util.js';
import { activeObj, sel } from '../core/state.js';
import { faceKeys, faceLabel } from '../core/model.js';
import { RT } from '../scene/renderer.js';
import { fanImage, fanOutline } from '../carriers/cup.js';
import { select } from '../core/selection.js';
import { hover, onHoverFace, setHoverFace } from '../core/hover.js';
import { effectiveMode } from '../ui/view-mode.js';
import { inPanel, paintNet, panelPath, viewNet } from './net-view.js';

/* The net of the active object, big: the panels with the faces' designs, cut and fold lines, windows. Two canvases:
   the base (the sheet, redrawn when a face is repainted or the view moves) and the top (the selected and the hovered
   panel, redrawn on its own, so a hover costs no sheet redraw and touches nothing in the 3D view). The sheet is placed
   by V: k px per mm and the screen position of its corner. A click selects a panel's face as the small net does;
   a drag moves the sheet, the wheel zooms round the pointer. */
const PX_MM = 96 / 25.4;   // 100%: a millimetre of the sheet is a millimetre on a 96 dpi screen
const MARGIN = 44, MIN_K = .04, MAX_K = 14;
const V = { k: 1, ox: 0, oy: 0, fit: true };
let netDirty = true, cw = 0, ch = 0, dpr = 1, geom = null, objKey = '', raf = 0, baseDirty = true, topDirty = true, settle = 0, moving = false, space = false, over = false;
let base = null, top = null, bctx = null, tctx = null;
const fans = new Map();   // the slow warp of a cup's wall: one picture per face version and size

const shown = () => effectiveMode() !== '3d' && cw > 0 && ch > 0;
const clampK = k => Math.min(MAX_K, Math.max(MIN_K, k));
function fitView() {
  if (!geom) return;
  const { n } = geom, aw = Math.max(40, cw - 2 * MARGIN), ah = Math.max(40, ch - 2 * MARGIN - 20);
  V.k = clampK(Math.min(aw / n.W, ah / n.H));
  V.ox = (cw - n.W * V.k) / 2; V.oy = (ch - n.H * V.k) / 2 - 6; V.fit = true;
}
/* the net now: null where the active object has none (a model, nothing picked) */
function currentNet() {
  const o = activeObj(); if (!o) return null;
  const n = viewNet(o);
  return n.panels.length ? { o, n } : { o, n: null };
}
function sizeCanvases() {
  const r = $('#netPane').getBoundingClientRect();
  cw = Math.round(r.width); ch = Math.round(r.height); dpr = Math.min(devicePixelRatio || 1, 2);
  for (const c of [base, top]) { const w = Math.round(cw * dpr), h = Math.round(ch * dpr); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } }
  bctx.imageSmoothingQuality = 'high';
}
/* the warped wall of a cup, kept while the face and the pixel size stay as they are; while the view moves, the
   picture that is there (any size) is used, so a zoom is not held up by the warp */
function fanPicture(o) {
  return (p, fc, w, h) => {
    const f = RT.get(o.id)?.faces[p.key], pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr)), tag = `${o.id}|${p.key}`, have = fans.get(tag);
    if (have && have.src === fc && have.ver === f?.tex?.version && (moving || (have.pw === pw && have.ph === ph))) return have.img;
    const cap = moving ? Math.min(1, 400 / Math.max(pw, ph)) : 1, ow = Math.max(1, Math.round(pw * cap)), oh = Math.max(1, Math.round(ph * cap));
    const img = fanImage(p.fan, fc, ow, oh);
    fans.set(tag, { src: fc, ver: f?.tex?.version, pw: ow, ph: oh, img }); return img;
  };
}
function paintBase() {
  baseDirty = false;
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0); bctx.clearRect(0, 0, cw, ch);
  if (!geom) return;
  const { o, n } = geom;
  paintNet(bctx, o, n, { ox: V.ox, oy: V.oy, k: V.k, selKey: null, fan: fanPicture(o) });
}
/* the outline of a panel on the sheet */
function outline(c, p) {
  if (p.fan) { const x = V.ox + p.x * V.k, y = V.oy + p.y * V.k; fanOutline(p.fan).forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](x + X * V.k, y + Y * V.k)); c.closePath(); }
  else panelPath(c, p, V.ox, V.oy, V.k);
}
function paintTop() {
  topDirty = false;
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.clearRect(0, 0, cw, ch);
  if (!geom) return;
  const { o, n } = geom, keys = faceKeys(o), accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0a7aa1';
  const hov = hover.obj === o.id && keys.includes(hover.face) ? hover.face : null;
  const mark = (key, w, fill) => {
    for (const p of n.panels) {
      if (p.key !== key) continue;
      tctx.beginPath(); outline(tctx, p); tctx.globalAlpha = fill; tctx.fillStyle = accent; tctx.fill(); tctx.globalAlpha = 1;
      tctx.lineWidth = w; tctx.strokeStyle = accent; tctx.setLineDash([]); tctx.stroke();
    }
  };
  if (hov && hov !== sel.face) mark(hov, 1.5, .1);
  if (sel.face && keys.includes(sel.face)) mark(sel.face, 2.5, .07);
  // the name of the picked or hovered panel, over its top left corner
  const names = [...new Set([sel.face, hov])].filter(k => k && keys.includes(k));
  tctx.font = '600 11.5px Onest, system-ui, sans-serif'; tctx.textBaseline = 'middle';
  for (const key of names) {
    const p = n.panels.find(q => q.key === key); if (!p) continue;
    const txt = faceLabel(o, key), w = tctx.measureText(txt).width + 14, x = Math.min(cw - w - 4, Math.max(4, V.ox + p.x * V.k + 6)), y = Math.min(ch - 26, Math.max(6, V.oy + p.y * V.k + 6));
    tctx.fillStyle = accent; tctx.beginPath(); tctx.roundRect(x, y, w, 20, 10); tctx.fill();
    tctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-fg').trim() || '#fff'; tctx.fillText(txt, x + 7, y + 10.5);
  }
}
/* the texts and tools round the sheet: the caption, the empty note, the zoom */
function syncChrome(cur) {
  const none = !cur ? 'Выберите объект, чтобы увидеть его развёртку' : !cur.n ? 'У этого объекта нет развёртки' : '';
  $('#netEmpty').hidden = !none; $('#netEmptyText').textContent = none; $('#netTo3d').hidden = !none || effectiveMode() !== '2d';
  $('#netZoom').hidden = $('#netCap').hidden = !!none;
  if (!none) $('#netCap').textContent = `${cur.o.name} · ${fmt(cur.n.W, 1)} × ${fmt(cur.n.H, 1)} мм`;
}
/* redraws what changed; the loop calls drawNetStage when a face is repainted or the selection changes */
function flush() {
  raf = 0;
  if (!shown()) return;
  if (netDirty) {
    netDirty = false;
    const cur = currentNet(), key = cur?.n ? `${cur.o.id}|${sel.part || ''}|${fmt(cur.n.W, 2)}x${fmt(cur.n.H, 2)}` : '';
    geom = cur?.n ? cur : null; syncChrome(cur);
    // another object, or a sheet of another size: fitted again, unless the user has set the view by hand for this one
    if (key !== objKey) { const same = objKey.split('|').slice(0, 2).join() === key.split('|').slice(0, 2).join(); objKey = key; if (!same || V.fit) fitView(); baseDirty = topDirty = true; }
  }
  if (baseDirty) paintBase();
  if (topDirty) paintTop();
  $('#nzPct').textContent = Math.round(V.k / PX_MM * 100) + '%';
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(flush); };
function drawNetStage() { if (!shown()) return; netDirty = baseDirty = topDirty = true; flush(); }
/* the stage was shown (or its mode changed): size, fit, draw */
function refreshNetStage() { if (!base) return; if (effectiveMode() === '3d') return; sizeCanvases(); objKey = ''; V.fit = true; netDirty = baseDirty = topDirty = true; schedule(); }
/* the view moved: redraw the sheet next frame, and sharp (the fan's warp too) a moment after it stops */
function moved() {
  V.fit = false; moving = true; baseDirty = topDirty = true; schedule();
  clearTimeout(settle); settle = setTimeout(() => { moving = false; baseDirty = true; schedule(); }, 160);
}
function zoomAt(f, x = cw / 2, y = ch / 2) {
  const k = clampK(V.k * f), r = k / V.k; if (r === 1) return;
  V.ox = x - (x - V.ox) * r; V.oy = y - (y - V.oy) * r; V.k = k; moved();
}
function zoomTo(k) { zoomAt(clampK(k) / V.k); }
const toSheet = (px, py) => [(px - V.ox) / V.k, (py - V.oy) / V.k];
/* the panel of the active object under a screen point (px, py in the pane), if it is a face */
function panelAt(px, py) {
  if (!geom) return null;
  const [X, Y] = toSheet(px, py), keys = faceKeys(geom.o);
  for (let i = geom.n.panels.length - 1; i >= 0; i--) { const p = geom.n.panels[i]; if (keys.includes(p.key) && inPanel(p, X, Y)) return p; }
  return null;
}

/* where the face panels are on the page (client px boxes), for tests and scripts */
function panelRects() {
  if (!geom) return [];
  const r = $('#netPane').getBoundingClientRect(), keys = faceKeys(geom.o);
  return geom.n.panels.filter(p => keys.includes(p.key)).map(p => ({ key: p.key, x: r.left + V.ox + p.x * V.k, y: r.top + V.oy + p.y * V.k, w: p.w * V.k, h: p.h * V.k }));
}

function initNetStage() {
  const pane = $('#netPane'); base = $('#netBase'); top = $('#netTop'); bctx = base.getContext('2d'); tctx = top.getContext('2d');
  new ResizeObserver(() => { if (effectiveMode() === '3d') return; sizeCanvases(); if (V.fit) fitView(); baseDirty = topDirty = true; schedule(); }).observe(pane);
  onHoverFace(() => { topDirty = true; schedule(); });
  // wheel: zoom round the pointer (Ctrl and a pinch on a touchpad, faster)
  pane.addEventListener('wheel', e => {
    if (e.target.closest('#netZoom') || !geom) return;
    e.preventDefault();
    const r = pane.getBoundingClientRect(), dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    zoomAt(Math.exp(-dy * (e.ctrlKey ? .012 : .0016)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  // pointers: one drags the sheet (a click that does not move picks a panel), two pinch and move it
  const pts = new Map(); let drag = null, pinch = null;
  const local = e => { const r = pane.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  pane.addEventListener('pointerdown', e => {
    if (e.target.closest('#netZoom, #netEmpty')) return;
    pane.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e));
    if (pts.size === 2) {
      const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; drag = null; return;
    }
    if (e.button === 2) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: V.ox, oy: V.oy, moved: false, by: e.button === 1 || space };
    if (e.button === 1) e.preventDefault();
  });
  pane.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, local(e));
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      V.ox += mx - pinch.mx; V.oy += my - pinch.my; zoomAt(d / pinch.d, mx, my); moved(); pinch.d = d; pinch.mx = mx; pinch.my = my; return;
    }
    if (drag && e.pointerId === drag.id) {
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) { drag.moved = true; pane.style.cursor = 'grabbing'; }
      if (drag.moved) { V.ox = drag.ox + e.clientX - drag.x; V.oy = drag.oy + e.clientY - drag.y; moved(); }
      return;
    }
    if (e.pointerType === 'touch') return;
    const p = panelAt(...local(e)); pane.style.cursor = space ? 'grab' : p ? 'pointer' : '';
    setHoverFace(geom?.o.id, p?.key);
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (drag && e.pointerId === drag.id) {
      const d = drag; drag = null; pane.style.cursor = '';
      if (!d.moved && !d.by && e.type === 'pointerup' && e.button === 0) {
        const p = panelAt(...local(e)); if (p && geom) select(geom.o.id, p.key, null, { flash: true, focus: false });
      }
    }
  };
  pane.addEventListener('pointerup', end); pane.addEventListener('pointercancel', end);
  pane.addEventListener('pointerleave', () => setHoverFace(null, null));
  pane.addEventListener('pointerenter', () => { over = true; });
  pane.addEventListener('pointerleave', () => { over = false; });
  pane.addEventListener('auxclick', e => e.preventDefault());
  // the space bar pans while it is held over the sheet
  addEventListener('keydown', e => { if (e.code === 'Space' && over && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) { space = true; e.preventDefault(); pane.style.cursor = 'grab'; } });
  addEventListener('keyup', e => { if (e.code === 'Space' && space) { space = false; pane.style.cursor = ''; } });
  $('#nzOut').onclick = () => zoomAt(1 / 1.25);
  $('#nzIn').onclick = () => zoomAt(1.25);
  $('#nzPct').onclick = () => zoomTo(PX_MM);
  $('#nzFit').onclick = () => { fitView(); baseDirty = topDirty = true; schedule(); };
  pane.addEventListener('dblclick', e => { if (!e.target.closest('#netZoom') && !panelAt(...local(e))) { fitView(); baseDirty = topDirty = true; schedule(); } });
  refreshNetStage();
  addEventListener('resize', () => { if (shown()) { sizeCanvases(); if (V.fit) fitView(); baseDirty = topDirty = true; schedule(); } });
}

export { drawNetStage, initNetStage, panelAt, panelRects, refreshNetStage, toSheet, V as netView, zoomAt };
