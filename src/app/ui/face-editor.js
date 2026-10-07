// Окно грани (2D-редактор)
import { $, DEG } from '../core/util.js';
import { activeFaceData, activeLayer, activeObj, sel } from '../core/state.js';
import { faceMM, loopAxis } from '../core/model.js';
import { layerReach } from '../faces/wrap.js';
import { RT, markFace, ui } from '../scene/renderer.js';
import { faceWindow, windowPath } from '../carriers/box.js';
import { CARRY_PANEL, carryDims, carryOn, carrySheet } from '../carriers/carry.js';
import { sleeveDims, sleeveOn, sleevePanelLabel, sleeveSheet } from '../carriers/sleeve.js';
import { layerBox } from '../faces/render.js';
import { placementsFor } from '../stickers/placement.js';
import { drawSticker } from '../stickers/film.js';
import { selectLayer } from '../core/selection.js';
import { commit } from '../core/project.js';
import { refreshFields } from './fields.js';
import { rotateItem, scaleItem } from '../core/transform.js';

const ed = $('#editor'), ectx = ed.getContext('2d');
/* the face is drawn with a margin round it (PAD px), where the part of a layer past its edge shows */
const PAD = 16;
const edState = { k: 1, dw: 0, dh: 0, drag: null, guides: [] };
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
  // selection
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
      c.beginPath(); c.rect(-PAD, -PAD, cw, ch);
      if (circle) c.arc(dw / 2, dh / 2, dw / 2, 0, Math.PI * 2, true);
      else c.rect(ax === 'x' ? -PAD : 0, ax === 'y' ? -PAD : 0, ax === 'x' ? cw : dw, ax === 'y' ? ch : dh);
      c.clip('evenodd');
      c.fillStyle = 'rgba(210,69,58,.12)'; c.fillRect(-PAD, -PAD, cw, ch);
      c.strokeStyle = 'rgba(210,69,58,.7)'; c.lineWidth = 1; c.beginPath();
      for (let x = -PAD - ch; x < cw; x += 5) { c.moveTo(x, -PAD); c.lineTo(x + ch, -PAD + ch); }
      c.stroke(); c.restore();
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
function snapMove(L, nx, ny, W, H, free) {
  const guides = [];
  if (!free) {
    const [w, h] = layerBox(L, W, H); const th = 6 / edState.k;
    const tx = [[.5, 0], [0, w / 2 / W], [1, -w / 2 / W]], ty = [[.5, 0], [0, h / 2 / H], [1, -h / 2 / H]];
    for (const [g, off] of tx) if (Math.abs((nx - off - g) * W) < th && !L.rot) { nx = g + off; guides.push(['x', g]); break; }
    for (const [g, off] of ty) if (Math.abs((ny - off - g) * H) < th && !L.rot) { ny = g + off; guides.push(['y', g]); break; }
    if (L.rot && Math.abs((nx - .5) * W) < th) { nx = .5; guides.push(['x', .5]); }
    if (L.rot && Math.abs((ny - .5) * H) < th) { ny = .5; guides.push(['y', .5]); }
  }
  edState.guides = guides; L.x = nx; L.y = ny;
}
function edPoint(e) { const r = ed.getBoundingClientRect(); return [(e.clientX - r.left - PAD), (e.clientY - r.top - PAD)]; }
const edUp = () => { if (edState.drag) { edState.drag = null; edState.guides = []; ui.editor = true; ui.layers = true; commit(); } };

/* hooks up the 2D editor */
function initFaceEditor() {
  ed.addEventListener('pointerdown', e => {
    const f = activeFaceData(); if (!f) return;
    const [mx, my] = edPoint(e), { k, W, H } = edState, px = mx / k, py = my / k;
    const L = activeLayer(), hd = edState.handles;
    let mode = null;
    if (L && hd) {
      if (Math.hypot(mx - hd.rot[0], my - hd.rot[1]) < 9) mode = 'rot';
      else if (hd.corners.some(p => Math.hypot(mx - p[0], my - p[1]) < 9)) mode = 'scale';
    }
    let target = L;
    if (!mode) {
      // the selected layer first, even under others; else the top layer under the cursor
      target = L && hitLayer({ layers: [L] }, W, H, px, py) ? L : hitLayer(f, W, H, px, py);
      if (!target) { if (sel.layer) selectLayer(null); return; }
      if (target.id !== sel.layer) selectLayer(target.id);
      mode = 'move';
    }
    ed.setPointerCapture(e.pointerId);
    const [cx, cy] = [target.x * W * k, target.y * H * k];
    edState.drag = { mode, L: target, mx, my, x: target.x, y: target.y, rot: target.rot, w: target.w, h: target.h, size: target.size,
      d0: Math.max(4, Math.hypot(mx - cx, my - cy)), cx, cy };
  });
  ed.addEventListener('pointermove', e => {
    const d = edState.drag;
    if (!d) {
      const f = activeFaceData(); if (!f) return;
      const [mx, my] = edPoint(e), hd = edState.handles;
      let cur = 'default';
      if (hd && Math.hypot(mx - hd.rot[0], my - hd.rot[1]) < 9) cur = 'grab';
      else if (hd && hd.corners.some(p => Math.hypot(mx - p[0], my - p[1]) < 9)) cur = 'nwse-resize';
      else if (hitLayer(f, edState.W, edState.H, mx / edState.k, my / edState.k)) cur = 'move';
      ed.style.cursor = cur; return;
    }
    const [mx, my] = edPoint(e), { k, W, H } = edState, L = d.L;
    if (d.mode === 'move') snapMove(L, d.x + (mx - d.mx) / (W * k), d.y + (my - d.my) / (H * k), W, H, e.altKey);
    else if (d.mode === 'scale') {
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
  ed.addEventListener('dblclick', () => { const L = activeLayer(); if (L?.type === 'text') { const t = $('#layerSec textarea'); t?.focus(); t?.select(); } });
  new ResizeObserver(() => { ui.editor = true; ui.net = true; }).observe($('#editorWrap'));
}

export { drawEditor, ed, edPoint, edState, hitLayer, initFaceEditor };
