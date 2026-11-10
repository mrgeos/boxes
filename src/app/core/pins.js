// Правила слоёв: пересчёт долей грани при смене её размера
import { DEG } from './util.js';
import { faceKeys, faceLabel, faceMM, loopAxis } from './model.js';
import { layerBox } from '../faces/render.js';
import { markFace, ui } from '../scene/renderer.js';
import { SAFE_MM } from '../net/net-check.js';

/* A layer keeps its place and size as shares of its face (x, y, w, h, size). L.pin says what to hold in mm when the
   face changes size: { x, y: 'scale' | 'start' | 'end' | 'center', size: 'scale' | 'fixed' } (no field = 'scale', the
   share stays). face.mm is the size the face's layers were laid out at; reflowObject compares it with the real one.
   L.warn = { kind: 'shrunk' | 'moved' | 'face', from?, sig } marks what the change did to a layer until the user
   touches it (sig is the geometry it was left in: another geometry means the user moved it, so the mark is stale). */
const PX = 10;   // px per mm for measuring boxes (text metrics need a real font size)
const sigOf = L => [L.x, L.y, L.w, L.h, L.size, L.rot].map(v => Math.round((v || 0) * 1e4)).join();
function setWarn(L, w) { L.warn = { ...w, sig: sigOf(L) }; }
/* the layer's mark, or null once the user changed it */
function warnOf(L) {
  if (L.warn && L.warn.sig !== sigOf(L)) delete L.warn;
  return L.warn || null;
}
const WARN_TEXT = { shrunk: 'Уменьшен, чтобы поместиться', moved: 'Сдвинут внутрь грани' };
const warnText = (o, w) => w.kind === 'face' ? `Перенесён с грани «${faceLabel(o, w.from)}»` : WARN_TEXT[w.kind];
function clearLayerWarn(o, k, id) {
  const L = o.faces[k]?.layers.find(l => l.id === id);
  if (!L?.warn) return false;
  delete L.warn; ui.layers = true; return true;
}
function setLayerPin(o, k, id, pin) {
  const L = o.faces[k]?.layers.find(l => l.id === id);
  if (!L) return false;
  L.pin = { ...L.pin, ...pin }; return true;
}

/* the layer's box in mm on a face of W × H mm, and half the extent of its turned box */
function boxMM(L, W, H) {
  const [w, h] = layerBox(L, W * PX, H * PX).map(v => v / PX), r = (L.rot || 0) * DEG, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return { w, h, ex: (w * c + h * s) / 2, ey: (w * s + h * c) / 2 };
}
/* scales the layer's own size by k */
function scaleSize(L, k) {
  if (L.type === 'text') L.size *= k; else { L.w *= k; if (L.type === 'shape') L.h *= k; }
}
/* a layer from a face of `from` mm to one of `to` mm; ax is the axis a ring face runs round (no edge to fit there) */
function reflowLayers(layers, from, to, ax = null) {
  const [fw, fh] = from, [tw, th] = to;
  for (const L of layers) {
    const p = L.pin || {}, had = L.warn && warnOf(L), redo = had?.want;
    // a mark still untouched: start again from what the layer wanted (its size before shrinking, the centre unclamped)
    if (redo && had.k < 1) scaleSize(L, 1 / had.k);
    // the face mark the layer had before (kept, to come back to)
    const prev = redo ? had.prev : had?.kind === 'face' ? { kind: 'face', from: had.from } : null;
    const b0 = boxMM(L, fw, fh), cx0 = redo ? had.want[0] : L.x * fw, cy0 = redo ? had.want[1] : L.y * fh;
    // per axis: was it inside its face (inside the safe zone, or just the face), and not a backdrop; the margin it keeps
    const inside = (c, e, size, m) => c - e >= m - .5 && c + e <= size - m + .5;
    const backdrop = b0.ex * 2 >= fw * .9 && b0.ey * 2 >= fh * .9 || (L.type === 'image' && L.tile) || L.clipTo;
    const axM = (c, e, size, skip) => backdrop || skip ? null : inside(c, e, size, SAFE_MM) ? SAFE_MM : inside(c, e, size, 0) ? 0 : null;
    const margin = redo ? had.margin : [axM(cx0, b0.ex, fw, ax === 'x'), axM(cy0, b0.ey, fh, ax === 'y')];
    // the size in mm kept: the share is recomputed on the new face
    if (p.size === 'fixed') {
      if (L.type === 'text') L.size *= fh / th; else { L.w *= fw / tw; if (L.type === 'shape') L.h *= fh / th; }
    }
    const b1 = boxMM(L, tw, th);
    // the centre: from the edge kept (start, end), the middle (center), or the share (scale)
    const place = (mode, c0, s0, s1, e0, e1) => mode === 'start' ? c0 - e0 + e1 : mode === 'end' ? s1 - (s0 - c0 - e0) - e1 : mode === 'center' ? s1 / 2 + c0 - s0 / 2 : c0 / s0 * s1;
    let cx = place(p.x, cx0, fw, tw, b0.ex, b1.ex), cy = place(p.y, cy0, fh, th, b0.ey, b1.ey), k = 1, moved = false;
    const want = [cx, cy];
    const [mx, my] = margin, fitK = (e, size, m) => m == null ? 1 : (size - 2 * m) / (2 * e);
    k = Math.min(1, fitK(b1.ex, tw, mx), fitK(b1.ey, th, my));
    const clamp = (c, e, size, m) => m == null ? c : Math.min(Math.max(c, m + e * k), size - m - e * k);
    const nx = clamp(cx, b1.ex, tw, mx), ny = clamp(cy, b1.ey, th, my);
    moved = Math.abs(nx - cx) > .01 || Math.abs(ny - cy) > .01; cx = nx; cy = ny;
    if (k < 1) scaleSize(L, k);
    L.x = cx / tw; L.y = cy / th;
    if (k < 1 || moved) setWarn(L, { kind: k < 1 ? 'shrunk' : 'moved', k, want, margin, prev });
    else if (prev) setWarn(L, prev); else if (redo) delete L.warn; else if (had) setWarn(L, had);
  }
}
/* lays out again the layers of every face whose size changed since they were laid out; the faces changed */
function reflowObject(o) {
  const out = [];
  for (const k of faceKeys(o)) {
    const f = o.faces[k]; if (!f) continue;
    const mm = faceMM(o, k); if (!mm.every(Number.isFinite)) continue;
    if (f.mm && f.layers.length && (Math.abs(f.mm[0] - mm[0]) > .01 || Math.abs(f.mm[1] - mm[1]) > .01)) {
      reflowLayers(f.layers, f.mm, mm, loopAxis(o, k)); markFace(o, k); out.push(k); ui.layers = true;
    }
    f.mm = mm;
  }
  return out;
}

export { clearLayerWarn, reflowLayers, reflowObject, setLayerPin, setWarn, warnOf, warnText };
