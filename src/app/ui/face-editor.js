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
import { drawSticker, stickerFoil, tinted } from '../stickers/film.js';
import { stickerOfKey } from '../stickers/design.js';
import { stickerSize } from '../stickers/placement.js';
import { pickLayers } from '../core/selection.js';
import { startTextEdit } from './text-edit.js';
import { boundsOf, clickPick, groupOf, layerAABB, moveLayers, rotateLayers, scaleLayers, selectedIds, selectedLayers, snapshot } from '../core/layers.js';
import { commit } from '../core/project.js';
import { refreshFields } from './fields.js';
import { rotateItem, scaleItem } from '../core/transform.js';
import { boardFacePath } from '../carriers/board.js';
import { shapeOutline } from '../carriers/shapes.js';
import { insertOutline } from '../carriers/insert.js';

const ed = $('#editor'), ectx = ed.getContext('2d');
/* the face is drawn with a margin round it (PAD px), where the part of a layer past its edge shows */
const PAD = 16;
const edState = { k: 1, dw: 0, dh: 0, drag: null, guides: [], marquee: null };
/* a sticker's design: what lies outside its shape is cut away; it is veiled, the shape's edge dashed */
let veilC = null;
function stickerVeil(c, st, dw, dh) {
  veilC ??= document.createElement('canvas'); veilC.width = Math.max(1, Math.round(dw * 2)); veilC.height = Math.max(1, Math.round(dh * 2));
  const x = veilC.getContext('2d'), W = veilC.width, H = veilC.height, [w] = stickerSize(st);
  x.fillStyle = 'rgba(244,241,234,.78)'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'destination-out';
  const path = q => { q.beginPath(); if (st.kind === 'circle') q.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2); else q.roundRect(0, 0, W, H, Math.min((st.radius || 0) * W / w, W / 2, H / 2)); };
  if (st.kind === 'custom') { const t = tinted(st.src, '#000'); if (t) x.drawImage(t, 0, 0, W, H); } else { path(x); x.fill(); }
  x.globalCompositeOperation = 'source-over';
  c.drawImage(veilC, 0, 0, dw, dh);
  if (st.kind !== 'custom') {
    c.save(); c.scale(dw / W, dh / H); path(c); c.restore();
    c.save(); c.strokeStyle = 'rgba(0,0,0,.35)'; c.setLineDash([4, 4]); c.lineWidth = 1; c.stroke(); c.restore();
  }
}
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
  // a cake board: its own outline (round, scalloped, with its tab)
  else if (o.type === 'board') { c.beginPath(); boardFacePath(o, sel.face).forEach(([u, v], i) => c[i ? 'lineTo' : 'moveTo'](u * dw, v * dh)); c.closePath(); c.clip(); }
  // a foil sticker: its metal under the print, as on the model
  const stE = stickerOfKey(o, sel.face);
  if (stE?.finish.startsWith('foil') && !stE.clear) { c.save(); c.translate(dw / 2, dh / 2); c.fillStyle = stickerFoil(c, stE.finish, dw, dh); c.fillRect(-dw / 2, -dh / 2, dw, dh); c.restore(); }
  c.drawImage(f.canvas, 0, 0, dw, dh);
  c.restore();
  if (stE) stickerVeil(c, stE, dw, dh);
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
  // a face that is not all printed (a triangle, a gable, holes cut through it) and its folds: the rest veiled
  const fo = sel.face === 'insert' && o.insert?.on ? insertOutline(o) : shapeOutline(o, sel.face);
  if (fo) {
    const poly = q => { q.forEach(([u, v], i) => c[i ? 'lineTo' : 'moveTo'](u * dw, v * dh)); c.closePath(); };
    c.save(); c.beginPath();
    if (fo.outer) { c.rect(-1, -1, dw + 2, dh + 2); poly(fo.outer); }
    for (const q of fo.holes) poly(q);
    c.fillStyle = 'rgba(244,241,234,.78)'; c.fill('evenodd');
    c.strokeStyle = 'rgba(0,160,227,.9)'; c.setLineDash([5, 4]); c.lineWidth = 1.2;
    if (fo.outer) { c.beginPath(); poly(fo.outer); c.stroke(); }
    for (const q of fo.holes) { c.beginPath(); poly(q); c.stroke(); }
    c.strokeStyle = 'rgba(230,0,126,.7)'; c.setLineDash([4, 3]);
    for (const [u1, v1, u2, v2] of fo.folds) { c.beginPath(); c.moveTo(u1 * dw, v1 * dh); c.lineTo(u2 * dw, v2 * dh); c.stroke(); }
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
        drawSticker(c, st, sc * dpr, false, rt.faces['st:' + st.id]?.canvas); c.restore();
      }
    }
    base();
  }
  // the part of a layer past the face's edge is not printed (unless it runs over the edge or round a ring): hatched red
  const hatch = (c, L, pts, w, h) => {
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
  };
  drawSelection(c, edState, o, { k, W, H, dw, dh, faceT: q => q.setTransform(dpr * k, 0, 0, dpr * k, dpr * PAD, dpr * PAD), hatch });
}

/* the selection on a surface (the face window, or a panel of the net): guides, the frame drawn with the mouse, the
   frame of the picked layer or layers with its handles. c is set to the surface's own px (a face px times ctx.k, the
   face's corner at 0, 0); ctx.faceT(c) sets it to face px. st gets .handles, to hit-test the pointer with */
function drawSelection(c, st, o, ctx) {
  const { k, W, H, dw, dh } = ctx, accentCss = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  // guides
  c.strokeStyle = '#e6007e'; c.lineWidth = 1;
  for (const g of st.guides) { c.beginPath(); if (g[0] === 'x') { c.moveTo(g[1] * dw, 0); c.lineTo(g[1] * dw, dh); } else { c.moveTo(0, g[1] * dh); c.lineTo(dw, g[1] * dh); } c.stroke(); }
  // a frame drawn with the mouse over empty space
  if (st.marquee) {
    const [x0, y0, x1, y1] = st.marquee;
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
    st.handles = { multi: true, corners: pts, rot: rh, center: [cxm, (b[1] + b[3]) / 2] };
    return;
  }
  const L = activeLayer();
  if (L && L.visible) {
    const [w, h] = layerBox(L, W, H); const cx = L.x * W * k, cy = L.y * H * k, a = L.rot * DEG;
    const hw = w * k / 2, hh = h * k / 2, cs = Math.cos(a), sn = Math.sin(a);
    const P = (lx, ly) => [cx + lx * cs - ly * sn, cy + lx * sn + ly * cs];
    const pts = [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)];
    if (ctx.hatch) ctx.hatch(c, L, pts, w, h);
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
      ctx.faceT(c);
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
      st.handles = { edit: mode, corners: inner, grips: hs, center: [cx, cy], box: [w, h] };
      return;
    }
    // where the layer reaches past what is printed (the net: past its panel) the frame is faint and dashed
    const frame = () => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); };
    c.strokeStyle = accentCss; c.lineWidth = 1.5; frame();
    if (ctx.inside) { c.save(); c.globalAlpha = .5; c.setLineDash([4, 3]); c.stroke(); c.restore(); c.save(); ctx.inside(c); frame(); c.stroke(); c.restore(); } else c.stroke();
    const rh = P(0, -hh - 18); const top = P(0, -hh);
    c.beginPath(); c.moveTo(...top); c.lineTo(...rh); c.stroke();
    c.fillStyle = '#fff';
    for (const p of pts) { c.beginPath(); c.rect(p[0] - 4, p[1] - 4, 8, 8); c.fill(); c.stroke(); }
    c.beginPath(); c.arc(rh[0], rh[1], 5, 0, Math.PI * 2); c.fill(); c.stroke();
    st.handles = { corners: pts, rot: rh, center: [cx, cy] };
  } else st.handles = null;
}
const inPoly = ([x, y], q) => { let r = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i][1] > y) !== (q[j][1] > y) && x < (q[j][0] - q[i][0]) * (y - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) r = !r; return r; };
function hitLayer(face, W, H, px, py) {
  for (let i = face.layers.length - 1; i >= 0; i--) {
    const L = face.layers[i]; if (!L.visible || L.locked) continue;
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
function snapBox(st, bx, others, W, H) {
  const th = 6 / st.k, xs = [0, W / 2, W], ys = [0, H / 2, H];
  for (const L of others) { if (!L.visible) continue; const q = layerAABB(L, W, H); xs.push(q[0], (q[0] + q[2]) / 2, q[2]); ys.push(q[1], (q[1] + q[3]) / 2, q[3]); }
  const best = (vals, cands) => { let r = null; for (const v of vals) for (const c of cands) { const d = c - v; if (Math.abs(d) < th && (!r || Math.abs(d) < Math.abs(r[0]))) r = [d, c]; } return r; };
  const bx_ = best([bx[0], (bx[0] + bx[2]) / 2, bx[2]], xs), by_ = best([bx[1], (bx[1] + bx[3]) / 2, bx[3]], ys);
  return { dx: bx_?.[0] || 0, dy: by_?.[0] || 0, guides: [...(bx_ ? [['x', bx_[1] / W]] : []), ...(by_ ? [['y', by_[1] / H]] : [])] };
}
function edPoint(e) { const r = ed.getBoundingClientRect(); return [(e.clientX - r.left - PAD), (e.clientY - r.top - PAD)]; }
/* A surface the pointer works on: the face window, or a panel of the net. s.st holds its state (k: px per face px, W, H,
   drag, guides, marquee, handles), s.el takes the pointer, s.rad(e) is the handle radius (px), s.where names it for
   the text editor. Points (mx, my) are in the surface's own px: a face px times st.k, the face's corner at 0, 0.
   s.panOnEmpty: a press on empty space is not taken (the net moves the sheet there; with Shift it draws a frame). */
const edSurf = { st: edState, el: ed, rad: () => 9, where: '2d' };
const edUp = s => {
  const st = s.st, d = st.drag; if (!d) return;
  st.drag = null; st.guides = []; st.marquee = null; ui.editor = true; ui.layers = true;
  // a click on one of several picked layers (without moving it) picks it alone
  if (d.mode === 'move' && !d.moved && d.pick) pickLayers(d.pick);
  // the surface may do more with what was dragged (the net moves a layer to the face it was dropped on)
  s.dropped?.(d);
  commit();
};
/* a press: true when it started something (a handle, a drag of layers, a frame) */
function edPress(s, e, mx, my) {
  const f = activeFaceData(); if (!f) return false;
  const st = s.st, { k, W, H } = st, px = mx / k, py = my / k, R = s.rad(e);
  const L = activeLayer(), hd = st.handles;
  let mode = null;
  if (L && hd?.edit) {
    // crop or mask mode: a corner resizes the frame, inside it moves (the picture under the crop frame, the mask
    // over the layer); a press elsewhere ends the mode
    let i = hd.grips.findIndex(p => Math.hypot(mx - p[0], my - p[1]) < 9);
    const inside = inPoly([mx, my], hd.corners);
    // a wider reach for a finger (R) counts only outside the frame: inside it a press moves the frame
    if (i < 0 && !inside && R > 9) i = hd.grips.findIndex(p => Math.hypot(mx - p[0], my - p[1]) < R);
    if (i >= 0 || inside) {
      s.el.setPointerCapture(e.pointerId);
      st.drag = { mode: 'edit', edit: hd.edit, handle: i >= 0 ? i : 'move', L, mx, my, from: editFrom(L), box: hd.box };
      return true;
    }
    setEditMode(null); renderLayerProps(); ui.editor = true;
  }
  if (L && hd && !hd.edit) {
    const near = p => Math.hypot(mx - p[0], my - p[1]), dr = near(hd.rot), dc = Math.min(...hd.corners.map(near));
    if (dr < 9) mode = 'rot';
    else if (dc < 9) mode = 'scale';
    // a wider reach for a finger counts only outside the frame (a small layer would else have no body to grab)
    else if (R > 9 && !inPoly([mx, my], hd.corners)) mode = dr < R ? 'rot' : dc < R ? 'scale' : null;
  }
  const many = selectedLayers(f);
  // the selected layers first, even under others; else the top layer under the cursor
  const hit = !mode && ((many.length && hitLayer({ layers: many }, W, H, px, py)) || hitLayer(f, W, H, px, py));
  if (!mode && !hit && s.panOnEmpty && !(e.shiftKey || e.ctrlKey || e.metaKey)) return false;
  s.el.setPointerCapture(e.pointerId);
  if (mode && hd.multi) {
    // several layers scaled or turned together round the middle of their frame
    const [cx, cy] = hd.center;
    st.drag = { mode: 'm' + mode, snap: snapshot(many), mx, my, cx, cy, px: cx / k, py: cy / k, d0: Math.max(4, Math.hypot(mx - cx, my - cy)), a0: Math.atan2(my - cy, mx - cx) };
    return true;
  }
  if (mode) {
    const [cx, cy] = [L.x * W * k, L.y * H * k];
    st.drag = { mode, L, mx, my, x: L.x, y: L.y, rot: L.rot, w: L.w, h: L.h, size: L.size, d0: Math.max(4, Math.hypot(mx - cx, my - cy)), cx, cy };
    return true;
  }
  if (!hit) {
    // empty space: a frame drawn with the mouse picks the layers it touches (Shift adds to the picked ones)
    const keep = e.shiftKey || e.ctrlKey || e.metaKey ? many.map(l => l.id) : [];
    if (!keep.length && sel.layer) pickLayers([]);
    st.drag = { mode: 'marquee', mx, my, keep };
    return true;
  }
  if (e.shiftKey || e.ctrlKey || e.metaKey) { pickLayers(clickPick(f, hit, true)); st.drag = null; return true; }
  // a press on one of several picked layers moves them all; a click without moving then picks it alone
  let pick = null;
  if (!many.includes(hit)) pickLayers(clickPick(f, hit), hit.group ? undefined : hit.id);
  else if (many.length > 1) pick = clickPick(f, hit);
  const Ls = selectedLayers(f);
  st.drag = { mode: 'move', snap: snapshot(Ls), mx, my, pick, moved: false, others: f.layers.filter(l => !Ls.includes(l)), box: boundsOf(Ls, W, H) };
  return true;
}
/* the cursor over (mx, my) when nothing is dragged */
function edCursor(s, e, mx, my) {
  const f = activeFaceData(); if (!f) return 'default';
  const st = s.st, hd = st.handles, R = s.rad(e);
  const gi = hd?.edit ? hd.grips.findIndex(p => Math.hypot(mx - p[0], my - p[1]) < R) : -1;
  if (hd?.edit) return gi >= 0 ? editCursor(gi) : inPoly([mx, my], hd.corners) ? 'move' : 'default';
  if (hd && Math.hypot(mx - hd.rot[0], my - hd.rot[1]) < R) return 'grab';
  if (hd && hd.corners.some(p => Math.hypot(mx - p[0], my - p[1]) < R)) return 'nwse-resize';
  if (hitLayer(f, st.W, st.H, mx / st.k, my / st.k)) return 'move';
  return 'default';
}
function edMove(s, e, mx, my) {
  const st = s.st, d = st.drag, { k, W, H } = st, L = d.L, o = activeObj(), f = activeFaceData();
  if (d.mode === 'marquee') {
    st.marquee = [d.mx, d.my, mx, my];
    const r = [Math.min(d.mx, mx) / k, Math.min(d.my, my) / k, Math.max(d.mx, mx) / k, Math.max(d.my, my) / k], ids = new Set(d.keep);
    for (const M of f.layers) {
      if (!M.visible || M.locked) continue;
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
    const g = e.altKey ? { dx: 0, dy: 0, guides: [] } : snapBox(st, [d.box[0] + dx, d.box[1] + dy, d.box[2] + dx, d.box[3] + dy], d.others, W, H);
    dx += g.dx; dy += g.dy; st.guides = g.guides;
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
    if (e.shiftKey) a = Math.round(a / 15) * 15; else for (const q of [-180, -90, 0, 90, 180]) if (Math.abs(a - q) < 3) a = q;
    rotateItem(activeObj(), sel.face, L, a);
  }
  markFace(activeObj(), sel.face); refreshFields($('#layerSec'), L);
}
/* a double click on a layer: a text is typed in place, a picture gets its crop frame; true when it did something */
function edDouble(s, mx, my) {
  // a double click on a layer of a group picks it alone (inside the group, as in Figma)
  const f = activeFaceData(), hit = f && hitLayer(f, s.st.W, s.st.H, mx / s.st.k, my / s.st.k);
  if (hit?.group && selectedIds().length > 1) { pickLayers([hit.id]); return true; }
  const L = activeLayer();
  if (L?.type === 'text') { startTextEdit(L, s.where); return true; }
  if (L?.type === 'image' && !L.tile) { setEditMode(editMode() === 'crop' ? null : 'crop'); renderLayerProps(); ui.editor = true; return true; }
  return false;
}

/* hooks up the 2D editor */
function initFaceEditor() {
  ed.addEventListener('pointerdown', e => { const [mx, my] = edPoint(e); edPress(edSurf, e, mx, my); });
  ed.addEventListener('pointermove', e => {
    const [mx, my] = edPoint(e);
    if (!edState.drag) { if (activeFaceData()) ed.style.cursor = edCursor(edSurf, e, mx, my); return; }
    edMove(edSurf, e, mx, my);
  });
  ed.addEventListener('pointerup', () => edUp(edSurf));
  ed.addEventListener('pointercancel', () => edUp(edSurf));
  ed.addEventListener('dblclick', e => { const [mx, my] = edPoint(e); edDouble(edSurf, mx, my); });
  new ResizeObserver(() => { ui.editor = true; ui.net = true; }).observe($('#editorWrap'));
}

export { drawEditor, drawSelection, edCursor, edDouble, edMove, edPoint, edPress, edState, edUp, ed, hitLayer, initFaceEditor };
