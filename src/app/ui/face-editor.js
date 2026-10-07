// Окно грани (2D-редактор)
import { $, DEG } from '../core/util.js';
import { activeFaceData, activeLayer, activeObj, sel } from '../core/state.js';
import { faceMM, loopAxis } from '../core/model.js';
import { layerReach } from '../faces/wrap.js';
import { RT, markFace, ui } from '../scene/renderer.js';
import { faceWindow, windowPath } from '../carriers/box.js';
import { CARRY_PANEL, carryDims, carryOn, carrySheet } from '../carriers/carry.js';
import { sleeveDims, sleeveOn, sleevePanelLabel, sleeveSheet } from '../carriers/sleeve.js';
import { drawLayer, layerBox } from '../faces/render.js';
import { clipRect, editCursor, editDrag, editFrom, editHandles, editMode, editRects, maskPath, setEditMode, uncropped } from '../core/mask.js';
import { renderLayerProps } from './face-panel.js';
import { placementsFor } from '../stickers/placement.js';
import { drawSticker } from '../stickers/film.js';
import { pickLayers } from '../core/selection.js';
import { startTextEdit } from './text-edit.js';
import { boundsOf, clickPick, groupOf, layerAABB, moveLayers, rotateLayers, scaleLayers, selectedIds, selectedLayers, snapshot } from '../core/layers.js';
import { commit } from '../core/project.js';
import { refreshFields } from './fields.js';
import { rotateItem, scaleItem } from '../core/transform.js';

const ed = $('#editor'), ectx = ed.getContext('2d');
/* the face is drawn with a margin round it (PAD px), where the part of a layer past its edge shows */
const PAD = 16;
const edState = { k: 1, dw: 0, dh: 0, drag: null, guides: [], marquee: null };
function drawEditor() {
  const o = activeObj(), wrap = $('#editorWrap');
  if (!o || !sel.face) { ectx.setTransform(1, 0, 0, 1, 0, 0); ectx.clearRect(0, 0, ed.width, ed.height); return; }
  const rt = RT.get(o.id); const f = rt?.faces[sel.face]; if (!f) return;
  const W = f.canvas.width, H = f.canvas.height;
  const availW = Math.max(120, wrap.clientWidth - 30 - 2 * PAD), availH = 250;
  const k = Math.min(availW / W, availH / H);
  const dw = Math.round(W * k), dh = Math.round(H * k), dpr = Math.min(devicePixelRatio || 1, 2);
  const cw = dw + 2 * PAD, ch = dh + 2 * PAD;
  if (ed.width !== cw * dpr || ed.height !== ch * dpr) { ed.width = cw * dpr; ed.height = ch * dpr; ed.style.width = cw + 'px'; ed.style.height = ch + 'px'; }
  Object.assign(edState, { k, dw, dh, W, H });
  // everything below is drawn in the face's own px (times k): the margin is outside 0…dw, 0…dh
  const c = ectx, base = () => c.setTransform(dpr, 0, 0, dpr, dpr * PAD, dpr * PAD);
  base(); c.clearRect(-PAD, -PAD, cw, ch);
  const circle = o.type === 'tube' && sel.face !== 'wrap';
  c.save();
  if (circle) { c.beginPath(); c.arc(dw / 2, dh / 2, dw / 2, 0, Math.PI * 2); c.clip(); }
  c.drawImage(f.canvas, 0, 0, dw, dh);
  c.restore();
  const accentCss = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  if (circle) { c.strokeStyle = 'rgba(0,0,0,.25)'; c.setLineDash([4, 4]); c.beginPath(); c.arc(dw / 2, dh / 2, dw / 2 - .5, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
  if (sel.face === 'sleeve' && sleeveOn(o)) {
    // where the band folds round the box, and which side each part ends up on
    const SD = sleeveDims(o);
    c.save(); c.strokeStyle = 'rgba(230,0,126,.75)'; c.setLineDash([5, 4]); c.lineWidth = 1;
    c.fillStyle = 'rgba(120,110,95,.85)'; c.font = '600 11px Onest, system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    SD.names.forEach((nm, i) => {
      const y = SD.stops[i] / SD.P * dh, flip = SD.flips[i];
      if (i) { c.beginPath(); c.moveTo(0, y); c.lineTo(dw, y); c.stroke(); }
      c.fillText(sleevePanelLabel(SD, nm) + (flip ? ' (вверх ногами)' : ''), 6, y + 5);
    });
    // the handle's cut: rounded corners and the hand holes
    const sh = sleeveSheet(SD), kx = dw / SD.bw, ky = dh / SD.P;
    c.setLineDash([]); c.strokeStyle = 'rgba(0,160,227,.9)'; c.lineWidth = 1.2;
    for (const q of [...(sh.outline ? [sh.outline.filter(([, y]) => y <= SD.P)] : []), ...sh.holes]) { c.beginPath(); q.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x * kx, y * ky)); if (q !== sh.outline) c.closePath(); c.stroke(); }
    c.restore();
  }
  if (sel.face === 'carry' && carryOn(o)) {
    // the carrier sleeve: where the band folds, which part goes where, the cut of the handle and windows
    const D = carryDims(o), sh = carrySheet(D), kx = dw / D.bw, ky = dh / D.P;
    c.save(); c.strokeStyle = 'rgba(230,0,126,.75)'; c.setLineDash([5, 4]); c.lineWidth = 1;
    c.fillStyle = 'rgba(120,110,95,.85)'; c.font = '600 11px Onest, system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    D.names.forEach((nm, i) => {
      const y = D.stops[i] * ky;
      if (i) { c.beginPath(); c.moveTo(0, y); c.lineTo(dw, y); c.stroke(); }
      c.fillText(CARRY_PANEL[nm] + (D.flips[i] ? ' (вверх ногами)' : ''), 6, y + 5);
    });
    c.setLineDash([]); c.strokeStyle = 'rgba(0,160,227,.9)'; c.lineWidth = 1.2;
    for (const q of [sh.outline, ...sh.holes]) { c.beginPath(); q.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x * kx, y * ky)); c.closePath(); c.stroke(); }
    c.restore();
  }
  const fw = faceWindow(o, sel.face);
  if (fw) {
    // the handle's leaves lie in the lid's opening on the flat sheet: what is printed there ends up on their inner side
    const keep = q => { c.beginPath(); q.forEach((v, i) => c[i ? 'lineTo' : 'moveTo'](v.x * dw, v.y * dh)); c.closePath(); };
    c.save();
    if (fw.keep) { c.beginPath(); c.rect(-1, -1, dw + 2, dh + 2); for (const q of fw.keep) { q.forEach((v, i) => c[i ? 'lineTo' : 'moveTo'](v.x * dw, v.y * dh)); c.closePath(); } c.clip('evenodd'); }
    windowPath(c, fw, 0, 0, dw, dh); c.globalCompositeOperation = 'destination-out'; c.fill(); c.restore();
    c.save(); windowPath(c, fw, 0, 0, dw, dh); c.strokeStyle = 'rgba(0,160,227,.9)'; c.setLineDash([5, 4]); c.lineWidth = 1.2; c.stroke(); c.setLineDash([]);
    for (const q of fw.keep || []) { keep(q); c.setLineDash([2, 3]); c.stroke(); c.setLineDash([]); }
    c.fillStyle = 'rgba(0,120,170,.85)'; c.font = '600 11px Onest, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('окно · плёнка', (fw.x + fw.w / 2) * dw, (fw.y + fw.h / 2) * dh); c.restore();
  }
  // stickers are 3D film on the model; show them here too, as they sit on this face
  if (RT.get(o.id)?.frames) {
    const [mw] = faceMM(o, sel.face), sc = k * W / mw;
    for (const st of o.stickers || []) {
      if (!st.visible) continue;
      for (const pl of placementsFor(o, st)) if (pl.key === sel.face) {
        const M = pl.M; c.save(); c.setTransform(dpr * sc * M[0], dpr * sc * M[1], dpr * sc * M[2], dpr * sc * M[3], dpr * (sc * M[4] + PAD), dpr * (sc * M[5] + PAD));
        drawSticker(c, st, sc * dpr, false); c.restore();
      }
    }
    base();
  }
  // guides
  c.strokeStyle = '#e6007e'; c.lineWidth = 1;
  for (const g of edState.guides) { c.beginPath(); if (g[0] === 'x') { c.moveTo(g[1] * dw, 0); c.lineTo(g[1] * dw, dh); } else { c.moveTo(0, g[1] * dh); c.lineTo(dw, g[1] * dh); } c.stroke(); }
  // a frame drawn with the mouse over empty space
  if (edState.marquee) {
    const [x0, y0, x1, y1] = edState.marquee;
    c.save(); c.fillStyle = 'rgba(10,122,161,.08)'; c.strokeStyle = accentCss; c.lineWidth = 1; c.setLineDash([4, 3]);
    c.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); c.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); c.restore();
  }
  // selection
  const many = selectedLayers();
  if (many.length > 1) {
    // several layers: each outlined thinly, one frame round them all with handles to scale and turn them together
    c.save(); c.strokeStyle = accentCss; c.lineWidth = 1;
    for (const M of many) {
      const [w, h] = layerBox(M, W, H), a = M.rot * DEG, cs = Math.cos(a), sn = Math.sin(a), mx = M.x * W * k, my = M.y * H * k;
      const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [mx + sx * w * k / 2 * cs - sy * h * k / 2 * sn, my + sx * w * k / 2 * sn + sy * h * k / 2 * cs]);
      c.beginPath(); q.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.stroke();
    }
    const b = boundsOf(many, W, H).map(v => v * k), pts = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], cxm = (b[0] + b[2]) / 2, rh = [cxm, b[1] - 18];
    c.lineWidth = 1.5; c.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    c.beginPath(); c.moveTo(cxm, b[1]); c.lineTo(...rh); c.stroke();
    c.fillStyle = '#fff';
    for (const p of pts) { c.beginPath(); c.rect(p[0] - 4, p[1] - 4, 8, 8); c.fill(); c.stroke(); }
    c.beginPath(); c.arc(rh[0], rh[1], 5, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
    edState.handles = { multi: true, corners: pts, rot: rh, center: [cxm, (b[1] + b[3]) / 2] };
    return;
  }
  const L = activeLayer();
  if (L && L.visible) {
    const [w, h] = layerBox(L, W, H); const cx = L.x * W * k, cy = L.y * H * k, a = L.rot * DEG;
    const hw = w * k / 2, hh = h * k / 2, cs = Math.cos(a), sn = Math.sin(a);
    const P = (lx, ly) => [cx + lx * cs - ly * sn, cy + lx * sn + ly * cs];
    const pts = [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)];
    // the part past the face's edge is not printed (unless it runs over the edge or round a ring): hatched red
    const ax = loopAxis(o, sel.face);
    if (!(L.type === 'image' && L.tile) && !(L.wrap && layerReach(o, sel.face, L).length)) {
      c.save(); c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.clip();
      // hatched: past the face's edge and in its window (but not on the handle's leaves printed there)
      if (fw) windowPath(c, fw, 0, 0, dw, dh); else c.beginPath();
      for (const q of fw?.keep || []) { q.forEach((v, i) => c[i ? 'lineTo' : 'moveTo'](v.x * dw, v.y * dh)); c.closePath(); }
      c.rect(-PAD, -PAD, cw, ch);
      const cr = clipRect(o, sel.face, L, W, H);   // cut to the face or to a panel of the band
      if (cr) c.rect(cr[0] * k, cr[1] * k, cr[2] * k, cr[3] * k);
      else if (circle) c.arc(dw / 2, dh / 2, dw / 2, 0, Math.PI * 2, true);
      else c.rect(ax === 'x' ? -PAD : 0, ax === 'y' ? -PAD : 0, ax === 'x' ? cw : dw, ax === 'y' ? ch : dh);
      c.clip('evenodd');
      c.fillStyle = 'rgba(210,69,58,.12)'; c.fillRect(-PAD, -PAD, cw, ch);
      c.strokeStyle = 'rgba(210,69,58,.7)'; c.lineWidth = 1; c.beginPath();
      for (let x = -PAD - ch; x < cw; x += 5) { c.moveTo(x, -PAD); c.lineTo(x + ch, -PAD + ch); }
      c.stroke(); c.restore();
    }
    const mode = editMode(), er = mode && editRects(mode, L, W, H, [w, h]);
    if (er) {
      // crop or mask mode: what is cut away shows faintly round the frame being edited
      const [fx, fy] = er.flip, Q = (x, y) => P(x * k * fx, y * k * fy), rect = ([x0, y0, x1, y1]) => [Q(x0, y0), Q(x1, y0), Q(x1, y1), Q(x0, y1)];
      const inner = rect(er.inner), outer = rect(er.outer), poly = q => { c.beginPath(); q.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); };
      c.save(); c.translate(cx, cy); c.rotate(a);
      c.beginPath(); c.rect(-1e4, -1e4, 2e4, 2e4);
      if (mode === 'mask') { c.save(); c.scale(k, k); maskPath(c, L.mask, w, h); c.restore(); }
      else { c.scale(fx, fy); c.rect(er.inner[0] * k, er.inner[1] * k, (er.inner[2] - er.inner[0]) * k, (er.inner[3] - er.inner[1]) * k); }
      c.clip('evenodd');
      c.setTransform(dpr * k, 0, 0, dpr * k, dpr * PAD, dpr * PAD);
      drawLayer(c, mode === 'crop' ? uncropped(L, W, H) : { ...L, mask: null }, W, H, null, .35);
      c.restore();
      c.strokeStyle = accentCss; c.lineWidth = 1; c.setLineDash([4, 3]); poly(outer); c.stroke(); c.setLineDash([]);
      c.lineWidth = 1.5; poly(inner); c.stroke();
      // the handles are solid in the frame's colour: corners square, the middles of the sides short bars along them
      const hs = editHandles(er, inner);
      c.fillStyle = accentCss;
      hs.forEach((p, i) => {
        c.save(); c.translate(...p); c.rotate(a);
        if (i < 4) c.fillRect(-4.5, -4.5, 9, 9); else if (i % 2) c.fillRect(-2.5, -8, 5, 16); else c.fillRect(-8, -2.5, 16, 5);
        c.restore();
      });
      edState.handles = { edit: mode, corners: inner, grips: hs, center: [cx, cy], box: [w, h] };
      return;
    }
    c.strokeStyle = accentCss; c.lineWidth = 1.5; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.stroke();
    const rh = P(0, -hh - 18); const top = P(0, -hh);
    c.beginPath(); c.moveTo(...top); c.lineTo(...rh); c.stroke();
    c.fillStyle = '#fff';
    for (const p of pts) { c.beginPath(); c.rect(p[0] - 4, p[1] - 4, 8, 8); c.fill(); c.stroke(); }
    c.beginPath(); c.arc(rh[0], rh[1], 5, 0, Math.PI * 2); c.fill(); c.stroke();
    edState.handles = { corners: pts, rot: rh, center: [cx, cy] };
  } else edState.handles = null;
}
const inPoly = ([x, y], q) => { let r = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i][1] > y) !== (q[j][1] > y) && x < (q[j][0] - q[i][0]) * (y - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) r = !r; return r; };
function hitLayer(face, W, H, px, py) {
  for (let i = face.layers.length - 1; i >= 0; i--) {
    const L = face.layers[i]; if (!L.visible) continue;
    if (L.type === 'image' && L.tile) return L;
    const [w, h] = layerBox(L, W, H);
    const dx = px - L.x * W, dy = py - L.y * H, a = -L.rot * DEG;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= w / 2 + 2 && Math.abs(ly) <= h / 2 + 2) return L;
  }
  return null;
}
/* smart guides: a moving box (face px) snaps its edges and centre to the face's edges and centre and to the other
   layers' ones, within 6 screen px; returns the shift to add and the lines to show */
function snapBox(bx, others, W, H) {
  const th = 6 / edState.k, xs = [0, W / 2, W], ys = [0, H / 2, H];
  for (const L of others) { if (!L.visible) continue; const q = layerAABB(L, W, H); xs.push(q[0], (q[0] + q[2]) / 2, q[2]); ys.push(q[1], (q[1] + q[3]) / 2, q[3]); }
  const best = (vals, cands) => { let r = null; for (const v of vals) for (const c of cands) { const d = c - v; if (Math.abs(d) < th && (!r || Math.abs(d) < Math.abs(r[0]))) r = [d, c]; } return r; };
  const bx_ = best([bx[0], (bx[0] + bx[2]) / 2, bx[2]], xs), by_ = best([bx[1], (bx[1] + bx[3]) / 2, bx[3]], ys);
  return { dx: bx_?.[0] || 0, dy: by_?.[0] || 0, guides: [...(bx_ ? [['x', bx_[1] / W]] : []), ...(by_ ? [['y', by_[1] / H]] : [])] };
}
function edPoint(e) { const r = ed.getBoundingClientRect(); return [(e.clientX - r.left - PAD), (e.clientY - r.top - PAD)]; }
const edUp = () => {
  const d = edState.drag; if (!d) return;
  edState.drag = null; edState.guides = []; edState.marquee = null; ui.editor = true; ui.layers = true;
  // a click on one of several picked layers (without moving it) picks it alone
  if (d.mode === 'move' && !d.moved && d.pick) pickLayers(d.pick);
  commit();
};

/* hooks up the 2D editor */
function initFaceEditor() {
  ed.addEventListener('pointerdown', e => {
    const f = activeFaceData(); if (!f) return;
    const [mx, my] = edPoint(e), { k, W, H } = edState, px = mx / k, py = my / k;
    const L = activeLayer(), hd = edState.handles;
    let mode = null;
    if (L && hd?.edit) {
      // crop or mask mode: a corner resizes the frame, inside it moves (the picture under the crop frame, the mask
      // over the layer); a press elsewhere ends the mode
      const i = hd.grips.findIndex(p => Math.hypot(mx - p[0], my - p[1]) < 9), inside = inPoly([mx, my], hd.corners);
      if (i >= 0 || inside) {
        ed.setPointerCapture(e.pointerId);
        edState.drag = { mode: 'edit', edit: hd.edit, handle: i >= 0 ? i : 'move', L, mx, my, from: editFrom(L), box: hd.box };
        return;
      }
      setEditMode(null); renderLayerProps(); ui.editor = true;
    }
    if (L && hd && !hd.edit) {
      if (Math.hypot(mx - hd.rot[0], my - hd.rot[1]) < 9) mode = 'rot';
      else if (hd.corners.some(p => Math.hypot(mx - p[0], my - p[1]) < 9)) mode = 'scale';
    }
    const many = selectedLayers(f);
    ed.setPointerCapture(e.pointerId);
    if (mode && hd.multi) {
      // several layers scaled or turned together round the middle of their frame
      const [cx, cy] = hd.center;
      edState.drag = { mode: 'm' + mode, snap: snapshot(many), mx, my, cx, cy, px: cx / k, py: cy / k, d0: Math.max(4, Math.hypot(mx - cx, my - cy)), a0: Math.atan2(my - cy, mx - cx) };
      return;
    }
    if (mode) {
      const [cx, cy] = [L.x * W * k, L.y * H * k];
      edState.drag = { mode, L, mx, my, x: L.x, y: L.y, rot: L.rot, w: L.w, h: L.h, size: L.size, d0: Math.max(4, Math.hypot(mx - cx, my - cy)), cx, cy };
      return;
    }
    // the selected layers first, even under others; else the top layer under the cursor
    const hit = (many.length && hitLayer({ layers: many }, W, H, px, py)) || hitLayer(f, W, H, px, py);
    if (!hit) {
      // empty space: a frame drawn with the mouse picks the layers it touches (Shift adds to the picked ones)
      const keep = e.shiftKey || e.ctrlKey || e.metaKey ? many.map(l => l.id) : [];
      if (!keep.length && sel.layer) pickLayers([]);
      edState.drag = { mode: 'marquee', mx, my, keep };
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) { pickLayers(clickPick(f, hit, true)); edState.drag = null; return; }
    // a press on one of several picked layers moves them all; a click without moving then picks it alone
    let pick = null;
    if (!many.includes(hit)) pickLayers(clickPick(f, hit), hit.group ? undefined : hit.id);
    else if (many.length > 1) pick = clickPick(f, hit);
    const Ls = selectedLayers(f);
    edState.drag = { mode: 'move', snap: snapshot(Ls), mx, my, pick, moved: false, others: f.layers.filter(l => !Ls.includes(l)), box: boundsOf(Ls, W, H) };
  });
  ed.addEventListener('pointermove', e => {
    const d = edState.drag;
    if (!d) {
      const f = activeFaceData(); if (!f) return;
      const [mx, my] = edPoint(e), hd = edState.handles;
      let cur = 'default';
      const gi = hd?.edit ? hd.grips.findIndex(p => Math.hypot(mx - p[0], my - p[1]) < 9) : -1;
      if (hd?.edit) cur = gi >= 0 ? editCursor(gi) : inPoly([mx, my], hd.corners) ? 'move' : 'default';
      else if (hd && Math.hypot(mx - hd.rot[0], my - hd.rot[1]) < 9) cur = 'grab';
      else if (hd && hd.corners.some(p => Math.hypot(mx - p[0], my - p[1]) < 9)) cur = 'nwse-resize';
      else if (hitLayer(f, edState.W, edState.H, mx / edState.k, my / edState.k)) cur = 'move';
      ed.style.cursor = cur; return;
    }
    const [mx, my] = edPoint(e), { k, W, H } = edState, L = d.L, o = activeObj(), f = activeFaceData();
    if (d.mode === 'marquee') {
      edState.marquee = [d.mx, d.my, mx, my];
      const r = [Math.min(d.mx, mx) / k, Math.min(d.my, my) / k, Math.max(d.mx, mx) / k, Math.max(d.my, my) / k], ids = new Set(d.keep);
      for (const M of f.layers) {
        if (!M.visible) continue;
        const q = layerAABB(M, W, H);
        if (q[0] <= r[2] && q[2] >= r[0] && q[1] <= r[3] && q[3] >= r[1]) for (const g of groupOf(f, M)) ids.add(g.id);
      }
      const now = f.layers.filter(l => ids.has(l.id)).map(l => l.id);
      if (now.join() !== selectedIds().join()) pickLayers(now); else ui.editor = true;
      return;
    }
    if (d.mode === 'move') {
      let dx = (mx - d.mx) / k, dy = (my - d.my) / k;
      if (!d.moved && Math.hypot(mx - d.mx, my - d.my) < 2) return;
      d.moved = true;
      // smart guides (Alt: none)
      const g = e.altKey ? { dx: 0, dy: 0, guides: [] } : snapBox([d.box[0] + dx, d.box[1] + dy, d.box[2] + dx, d.box[3] + dy], d.others, W, H);
      dx += g.dx; dy += g.dy; edState.guides = g.guides;
      moveLayers(o, sel.face, d.snap, dx, dy);
      refreshFields($('#layerSec'), activeLayer() || d.snap[0].L); return;
    }
    if (d.mode === 'mscale') { scaleLayers(o, sel.face, d.snap, d.px, d.py, Math.hypot(mx - d.cx, my - d.cy) / d.d0); refreshFields($('#layerSec'), activeLayer()); return; }
    if (d.mode === 'mrot') {
      let a = (Math.atan2(my - d.cy, mx - d.cx) - d.a0) / DEG;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      rotateLayers(o, sel.face, d.snap, d.px, d.py, a); refreshFields($('#layerSec'), activeLayer()); return;
    }
    if (d.mode === 'edit') {
      // the pointer's move in the layer's own px (unturned)
      const a = -L.rot * DEG, ex = (mx - d.mx) / k, ey = (my - d.my) / k;
      editDrag(activeObj(), sel.face, L, d.edit, d.handle, d.from, ex * Math.cos(a) - ey * Math.sin(a), ex * Math.sin(a) + ey * Math.cos(a), W, H, d.box);
      refreshFields($('#layerSec'), L); return;
    }
    if (d.mode === 'scale') {
      scaleItem(activeObj(), sel.face, L, d, Math.hypot(mx - d.cx, my - d.cy) / d.d0);
    } else if (d.mode === 'rot') {
      let a = Math.atan2(my - d.cy, mx - d.cx) / DEG + 90;
      if (a > 180) a -= 360;
      if (e.shiftKey) a = Math.round(a / 15) * 15; else for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(a - s) < 3) a = s;
      rotateItem(activeObj(), sel.face, L, a);
    }
    markFace(activeObj(), sel.face); refreshFields($('#layerSec'), L);
  });
  ed.addEventListener('pointerup', edUp);
   ed.addEventListener('pointercancel', edUp);
  ed.addEventListener('dblclick', e => {
    // a double click on a layer of a group picks it alone (inside the group, as in Figma)
    const f = activeFaceData(), [mx, my] = edPoint(e), hit = f && hitLayer(f, edState.W, edState.H, mx / edState.k, my / edState.k);
    if (hit?.group && selectedIds().length > 1) { pickLayers([hit.id]); return; }
    const L = activeLayer();
    // a text: typed in place
    if (L?.type === 'text') return startTextEdit(L, '2d');
    // a picture: its crop frame
    if (L?.type === 'image' && !L.tile) { setEditMode(editMode() === 'crop' ? null : 'crop'); renderLayerProps(); ui.editor = true; }
  });
  new ResizeObserver(() => { ui.editor = true; ui.net = true; }).observe($('#editorWrap'));
}

export { drawEditor, ed, edPoint, edState, hitLayer, initFaceEditor };
