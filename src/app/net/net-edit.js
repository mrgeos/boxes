// Правка слоёв на развёртке: тот же редактор, что в окне грани (ui/face-editor.js), с точкой отсчёта на панели развёртки
import { $, DEG } from '../core/util.js';
import { activeFaceData, activeLayer, activeObj, sel } from '../core/state.js';
import { faceKeys } from '../core/model.js';
import { RT } from '../scene/renderer.js';
import { cropPx, drawLayer, layerBox } from '../faces/render.js';
import { isStickerKey } from '../stickers/design.js';
import { pickLayers, select } from '../core/selection.js';
import { boundsOf, moveLayerToFace, moveLayers, selectedLayers, snapshot } from '../core/layers.js';
import { commit } from '../core/project.js';
import { drawSelection, edCursor, edDouble, edMove, edPress, edUp, hitLayer } from '../ui/face-editor.js';
import { refreshFields } from '../ui/fields.js';
import { inPanel, panelPath } from './net-view.js';
import { panelFrame } from './sheet-map.js';
import { markTop, netGeom, netView } from './net-stage.js';

/* A face is shown on the net by one panel, turned by quarter turns (or any angle) and cut to a part of the face. So
   a face px (u, v) is at a point of the screen that is a turn and a shift of (u, v) times one scale: that map
   (`mapFor`) is all the editor needs. Its pointer and handle points are in «local» px: face px times the scale, the
   face's corner at 0, 0, not turned, so the code of the face window runs on the net as it is; the screen turn is
   applied where things are drawn and where the pointer is read. A layer is clipped to its panel (the face's own
   picture is); the part of its frame past the panel is dashed. Dropping layers with their centre over another panel
   moves them to that face. */
const st = { k: 1, W: 0, H: 0, drag: null, guides: [], marquee: null, handles: null };
const surf = { st, el: null, rad: e => (e.pointerType === 'touch' ? 24 : 9), where: 'net', panOnEmpty: true, dropped: d => dropLayers(d) };
let dragMap = null;

/* face px (the face canvas of panel p's face) ↔ the pane's CSS px */
function mapFor(o, p) {
  if (!p || p.fan || !p.key || isStickerKey(p.key)) return null;
  const fc = RT.get(o.id)?.faces[p.key]?.canvas; if (!fc?.width) return null;
  const V = netView, S = cropPx(fc, p) || [0, 0, fc.width, fc.height];
  const { th, c, s, dw, O } = panelFrame(p, S, V.k, V.ox, V.oy);
  return {
    p, key: p.key, k: dw / S[2], W: fc.width, H: fc.height, th, c, s, O,
    toLocal: (x, y) => [(x - O[0]) * c + (y - O[1]) * s, -(x - O[0]) * s + (y - O[1]) * c],
    toScreen: (x, y) => [O[0] + x * c - y * s, O[1] + x * s + y * c],
  };
}
const bind = m => { st.k = m.k; st.W = m.W; st.H = m.H; };
const panelsOf = key => (netGeom()?.n.panels || []).filter(p => p.key === key);
const toSheet = (x, y) => [(x - netView.ox) / netView.k, (y - netView.oy) / netView.k];
/* the map of the picked face: of the panel the picked layers' middle is over, else its first */
function activeMap() {
  const g = netGeom(), o = activeObj(); if (!g || !o || g.o.id !== o.id || !sel.face || isStickerKey(sel.face)) return null;
  const maps = panelsOf(sel.face).map(p => mapFor(o, p)).filter(Boolean); if (!maps.length) return null;
  if (maps.length === 1) return maps[0];
  const b = boundsOf(selectedLayers(), maps[0].W, maps[0].H);
  if (b) for (const m of maps) { const [X, Y] = toSheet(...m.toScreen((b[0] + b[2]) / 2 * m.k, (b[1] + b[3]) / 2 * m.k)); if (inPanel(m.p, X, Y)) return m; }
  return maps[0];
}
/* the face panel under a pane point */
function facePanelAt(x, y) {
  const g = netGeom(); if (!g) return null;
  const [X, Y] = toSheet(x, y), keys = faceKeys(g.o);
  for (let i = g.n.panels.length - 1; i >= 0; i--) { const p = g.n.panels[i]; if (keys.includes(p.key) && !isStickerKey(p.key) && inPanel(p, X, Y)) return p; }
  return null;
}

/* ---------- drawing ---------- */
/* the picked layers' frame, handles, guides and crop frame, on the top canvas (c: set to pane px × dpr) */
function drawNetEdit(c, dpr) {
  const o = activeObj(), m = activeMap();
  if (!m || !o) { st.handles = null; return; }
  bind(m);
  const T = (k = 1) => q => q.setTransform(dpr * m.c * k, dpr * m.s * k, -dpr * m.s * k, dpr * m.c * k, dpr * m.O[0], dpr * m.O[1]);
  // layers being carried: the part past their panel (which clips the print) shows faintly, over the other panels too
  if (st.drag?.mode === 'move' && st.drag.moved) {
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.beginPath(); c.rect(-1e5, -1e5, 2e5, 2e5); panelPath(c, m.p, netView.ox, netView.oy, netView.k); c.clip('evenodd');
    T(m.k)(c);
    for (const L of selectedLayers()) if (L.visible) drawLayer(c, L, m.W, m.H, null, .45);
    c.restore();
  }
  c.save(); T()(c);
  drawSelection(c, st, o, {
    k: m.k, W: m.W, H: m.H, dw: m.W * m.k, dh: m.H * m.k, faceT: T(m.k),
    // the frame is solid over the panel and faint past it
    inside: q => { const t = q.getTransform(); q.setTransform(dpr, 0, 0, dpr, 0, 0); q.beginPath(); panelPath(q, m.p, netView.ox, netView.oy, netView.k); q.setTransform(t); q.clip(); },
  });
  c.restore();
}
/* the panel a drag of layers would drop them on (not their own face), or null */
function dropPanel(d = st.drag) {
  if (d?.mode !== 'move' || !d.moved) return null;
  const o = activeObj(), m = dragMap, Ls = selectedLayers(); if (!o || !m || !Ls.length) return null;
  const b = boundsOf(Ls, m.W, m.H), [X, Y] = toSheet(...m.toScreen((b[0] + b[2]) / 2 * m.k, (b[1] + b[3]) / 2 * m.k));
  const p = facePanelAt(netView.ox + X * netView.k, netView.oy + Y * netView.k);
  return p && p.key !== sel.face && mapFor(o, p) ? p : null;
}

/* ---------- the pointer ---------- */
/* a press at pane point (x, y): true when it picked or started something on a layer (else the net is moved) */
function netPress(e, x, y) {
  const o = activeObj(), g = netGeom(); if (!o || !g || g.o.id !== o.id) return false;
  surf.el = $('#netPane');
  const A = activeMap();
  if (A && activeFaceData()) {
    bind(A);
    if (edPress(surf, e, ...A.toLocal(x, y))) { dragMap = A; return true; }
  }
  const P = facePanelAt(x, y); if (!P) return false;
  const m = mapFor(o, P), f = o.faces[P.key]; if (!m || !f) return false;
  const [lx, ly] = m.toLocal(x, y);
  if (!hitLayer(f, m.W, m.H, lx / m.k, ly / m.k)) return false;
  // a layer of another face (or the other half of this one): that face is picked first
  if (P.key !== sel.face) select(o.id, P.key, null, { focus: false });
  st.handles = null; bind(m);
  if (edPress(surf, e, lx, ly)) { dragMap = m; return true; }
  return false;
}
function netMove(e, x, y) { if (!dragMap || !st.drag) return; bind(dragMap); edMove(surf, e, ...dragMap.toLocal(x, y)); }
function netRelease() { if (st.drag) { bind(dragMap); edUp(surf); } dragMap = null; markTop(); }
/* a drag ended: layers whose middle is over another panel go to that face, in place and turned as they looked */
function dropLayers(d) {
  const P = dropPanel(d), o = activeObj(); if (!P || !o) return;
  const from = sel.face, T = mapFor(o, P), S = dragMap, Ls = selectedLayers(), at = {};
  for (const L of Ls) {
    const [lx, ly] = T.toLocal(...S.toScreen(L.x * S.W * S.k, L.y * S.H * S.k));
    at[L.id] = { x: lx / T.k / T.W, y: ly / T.k / T.H, rot: (L.rot || 0) + (S.th - T.th) / DEG };
  }
  const ids = Ls.map(L => L.id);
  moveLayerToFace(o, ids, from, P.key, at);
  select(o.id, P.key, null, { focus: false }); pickLayers(ids);
}
/* the cursor over a pane point when nothing is dragged */
function netCursor(e, x, y) {
  const o = activeObj(), A = activeMap(); if (!o) return 'default';
  if (A && st.handles && activeFaceData()) { bind(A); const c = edCursor(surf, e, ...A.toLocal(x, y)); if (c !== 'default') return c; }
  const P = facePanelAt(x, y), m = P && mapFor(o, P), f = P && o.faces[P.key];
  if (m && f) { const [lx, ly] = m.toLocal(x, y); if (hitLayer(f, m.W, m.H, lx / m.k, ly / m.k)) return 'move'; }
  return 'default';
}
/* a double click: a text is typed in place, a picture is cropped */
function netDouble(e, x, y) {
  const o = activeObj(), P = facePanelAt(x, y); if (!o) return false;
  const m = P && mapFor(o, P), f = P && o.faces[P.key];
  if (!m || !f) return false;
  const [lx, ly] = m.toLocal(x, y);
  if (!hitLayer(f, m.W, m.H, lx / m.k, ly / m.k) && !(P.key === sel.face && activeLayer())) return false;
  if (P.key !== sel.face) { const h = hitLayer(f, m.W, m.H, lx / m.k, ly / m.k); select(o.id, P.key, null, { focus: false }); pickLayers([h.id]); }
  const A = activeMap(); if (!A) return false;
  surf.el = $('#netPane'); bind(A);
  return edDouble(surf, ...A.toLocal(x, y));
}
/* keys on the net pane: the arrows nudge the picked layers as they look on the sheet (a turned panel included) */
function netKey(e) {
  if (!e.key.startsWith('Arrow') || e.target.closest?.('input,textarea,select') || !activeLayer()) return;
  const o = activeObj(), m = activeMap(); if (!o || !m) return;
  e.preventDefault(); e.stopPropagation();
  const step = e.shiftKey ? .05 : .005, sx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, sy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
  // the screen direction in the face's own axes, and then by that share of the face
  const lx = Math.round(sx * m.c + sy * m.s), ly = Math.round(-sx * m.s + sy * m.c);
  moveLayers(o, sel.face, snapshot(selectedLayers()), lx * step * m.W, ly * step * m.H);
  refreshFields($('#layerSec'), activeLayer());
  clearTimeout(nudge); nudge = setTimeout(commit, 400);
}
let nudge = 0;
/* where the picked text sits on the page (corners of its box, client px), and the face px under a pointer, for typing in place */
function netQuad(L) {
  const m = activeMap(), pane = $('#netPane'); if (!m) return null;
  const r = pane.getBoundingClientRect(), [w, h] = layerBox(L, m.W, m.H), a = (L.rot || 0) * DEG, cs = Math.cos(a), sn = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = sx * w / 2, y = sy * h / 2, lx = (L.x * m.W + x * cs - y * sn) * m.k, ly = (L.y * m.H + x * sn + y * cs) * m.k, [px, py] = m.toScreen(lx, ly);
    return [r.left + px, r.top + py];
  });
}
function netFacePoint(e) {
  const m = activeMap(); if (!m) return null;
  const r = $('#netPane').getBoundingClientRect(), [lx, ly] = m.toLocal(e.clientX - r.left, e.clientY - r.top);
  return [lx / m.k, ly / m.k];
}
/* where the handles of the picked layer are on the page (client px), for tests and scripts */
function netHandles() {
  const m = activeMap(), h = st.handles; if (!m || !h) return null;
  const r = $('#netPane').getBoundingClientRect(), at = ([x, y]) => { const [px, py] = m.toScreen(x, y); return [r.left + px, r.top + py]; };
  return { corners: h.corners?.map(at), rot: h.rot && at(h.rot), grips: h.grips?.map(at), center: h.center && at(h.center) };
}

export { mapFor, drawNetEdit, dropPanel, netCursor, netDouble, netFacePoint, netKey, netMove, netPress, netHandles, netQuad, netRelease };
