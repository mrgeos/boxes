// Обрезка слоя: кадр картинки, маска-фигура, обтравка по слою ниже, обрезка по грани или панели
import { DEG, clamp } from './util.js';
import { sel } from './state.js';
import { getImg } from './assets.js';
import { faceMM } from './model.js';
import { markFace } from '../scene/renderer.js';
import { sleeveDims, sleeveOn } from '../carriers/sleeve.js';
import { carryDims, carryOn } from '../carriers/carry.js';

/* All of it is data of the layer, so the picture itself is never cut and any of it can be changed or undone:
   L.crop      — the part of an image shown: { x, y, w, h }, fractions of the picture (the layer box is that part);
   L.mask      — a shape the layer shows through, in the layer's own box: { kind: rect | ellipse | polygon | star,
                 x, y (centre, from the box's centre, in box widths/heights), w, h (in box sizes), r (rect corners,
                 0…1), n (corners or rays), inner (star's inner radius, 0…1) };
   L.clipBelow — the layer shows only where the layer under it is (the first one below that is not clipped
                 itself), as a clipping mask in Photoshop;
   L.clipTo    — 'face': nothing past the face's edge (no running over edges or round a ring);
                 'panel': nothing past the panel of a band it is on (a sleeve's or carrier's top, front…). */
const MASKS = { rect: 'Прямоугольник', ellipse: 'Эллипс', polygon: 'Многоугольник', star: 'Звезда' };
const FULL = { x: 0, y: 0, w: 1, h: 1 };
const cropOf = L => L.crop || FULL;
const cropped = L => !!L.crop && (L.crop.x > 1e-4 || L.crop.y > 1e-4 || L.crop.w < 1 - 1e-4 || L.crop.h < 1 - 1e-4);

/* the outline of a mask (or of any of its shapes) as a path, centred at 0, 0, in a box of w × h px */
function maskPath(ctx, m, w, h) {
  const cx = (m.x || 0) * w, cy = (m.y || 0) * h, mw = Math.max(.5, m.w * w), mh = Math.max(.5, m.h * h);
  if (m.kind === 'ellipse') { ctx.ellipse(cx, cy, mw / 2, mh / 2, 0, 0, Math.PI * 2); return; }
  if (m.kind === 'polygon' || m.kind === 'star') {
    const n = Math.max(3, Math.round(m.n || (m.kind === 'star' ? 5 : 6))), star = m.kind === 'star', k = star ? n * 2 : n;
    for (let i = 0; i < k; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / k, r = star && i % 2 ? clamp(m.inner ?? .5, .05, 1) : 1;
      ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * mw / 2 * r, cy + Math.sin(a) * mh / 2 * r);
    }
    ctx.closePath(); return;
  }
  ctx.roundRect(cx - mw / 2, cy - mh / 2, mw, mh, clamp(m.r || 0, 0, 1) * Math.min(mw, mh) / 2);
}

/* the rectangle (face px) a layer is cut to by clipTo, or null */
function clipRect(o, k, L, W, H) {
  if (!L.clipTo) return null;
  if (L.clipTo === 'panel') {
    const D = k === 'sleeve' && sleeveOn(o) ? sleeveDims(o) : k === 'carry' && carryOn(o) ? carryDims(o) : null;
    if (D) {
      // the panel the layer's centre is on (the band is a ring: its centre may be past either end)
      const s = ((L.y % 1) + 1) % 1 * D.P, i = Math.max(0, D.stops.findIndex((v, j) => s >= v && s < (D.stops[j + 1] ?? Infinity)));
      return [0, D.stops[i] / D.P * H, W, (Math.min(D.stops[i + 1] ?? D.P, D.P) - D.stops[i]) / D.P * H];
    }
  }
  return [0, 0, W, H];
}
/* faces with panels to cut to */
const hasPanels = (o, k) => (k === 'sleeve' && sleeveOn(o)) || (k === 'carry' && carryOn(o));

/* the layer a clipped layer shows through: the first one under it that is not clipped itself */
function clipBase(face, L) {
  if (!L.clipBelow) return null;
  const i = face.layers.indexOf(L);
  for (let j = i - 1; j >= 0; j--) if (!face.layers[j].clipBelow) return face.layers[j];
  return null;
}

/* the whole picture of a cropped image as a layer of its own (where it lies uncut), to show what is cut away */
function uncropped(L, W, H) {
  const c = cropOf(L), im = getImg(L.src), a = im ? im.naturalWidth / im.naturalHeight : (L.aspect || 1);
  const w = L.w * W, h = w / (a * c.w / c.h), fw = w / c.w, fh = h / c.h;
  // the picture's centre from the layer's, turned with the layer
  const dx = -w / 2 - c.x * fw + fw / 2, dy = -h / 2 - c.y * fh + fh / 2, r = (L.rot || 0) * DEG;
  const sx = L.flipX ? -1 : 1, sy = L.flipY ? -1 : 1, ex = dx * sx, ey = dy * sy;
  return { ...L, crop: null, mask: null, clipTo: null, w: fw / W, x: L.x + (ex * Math.cos(r) - ey * Math.sin(r)) / W, y: L.y + (ex * Math.sin(r) + ey * Math.cos(r)) / H };
}

/* ---------- actions ---------- */
function setMask(o, face, L, kind) {
  if (!kind) delete L.mask;
  else L.mask = { x: 0, y: 0, w: 1, h: 1, r: .25, n: kind === 'star' ? 5 : 6, inner: .5, ...(L.mask || {}), kind };
  markFace(o, face);
}
function setClipBelow(o, face, L, on) { if (on) L.clipBelow = true; else delete L.clipBelow; markFace(o, face); }
function setClipTo(o, face, L, to) { if (to) L.clipTo = to; else delete L.clipTo; markFace(o, face); }
function resetCrop(o, face, L) {
  if (!L.crop) return;
  const c = L.crop; L.w = L.w / c.w; delete L.crop;
  markFace(o, face);
}
/* the layer's state a crop or mask drag starts from */
const editFrom = L => ({ x: L.x, y: L.y, w: L.w, crop: { ...cropOf(L) }, mask: L.mask ? { ...L.mask } : null });
/* the frame being edited and the one round it, in the layer's own px (centred, unturned) of a W × H face:
   crop — the shown part inside the whole picture; mask — the mask inside the layer's box */
function editRects(mode, L, W, H, box) {
  const [w, h] = box;
  if (mode === 'crop') {
    // in the picture's own px: a flipped picture shows them flipped (flip)
    const c = cropOf(L), fw = w / c.w, fh = h / c.h;
    return { flip: [L.flipX ? -1 : 1, L.flipY ? -1 : 1], sides: true, inner: [-w / 2, -h / 2, w / 2, h / 2], outer: [-w / 2 - c.x * fw, -h / 2 - c.y * fh, -w / 2 - c.x * fw + fw, -h / 2 - c.y * fh + fh] };
  }
  const m = L.mask; if (!m) return null;
  return { flip: [1, 1], sides: m.kind === 'rect', inner: [(m.x - m.w / 2) * w, (m.y - m.h / 2) * h, (m.x + m.w / 2) * w, (m.y + m.h / 2) * h], outer: [-w / 2, -h / 2, w / 2, h / 2] };
}
/* the cursor over edit handle i */
const editCursor = i => i < 4 ? 'nwse-resize' : i % 2 ? 'ew-resize' : 'ns-resize';
/* the frame's handles from its corners (top-left, top-right, bottom-right, bottom-left): the corners, then, when the
   frame has them (er.sides), the middles of its sides (top, right, bottom, left) */
const editHandles = (er, corners) => er.sides ? [...corners, ...corners.map((p, i) => { const q = corners[(i + 1) % 4]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; })] : corners;
/* which edges of the frame handle h moves: [left, right, top, bottom] */
const EDGES = [[1, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 1], [1, 0, 0, 1], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1], [1, 0, 0, 0]];
/* drags the edited frame (the corners as editRects gives them, flip included): handle 0…3 is a corner (top-left, top-right, bottom-right, bottom-left; the opposite one
   stays), 4…7 the middle of a side (top, right, bottom, left; only that side moves), 'move' moves the picture under the crop frame or the mask over the layer. (dx, dy): the pointer's move in
   the layer's own px, from where the drag began; from: editFrom(L) then; box: the layer's box then (px) */
function editDrag(o, face, L, mode, handle, from, dx, dy, W, H, box) {
  const [w, h] = box, MIN = 4;
  if (mode === 'crop') {
    if (L.flipX) dx = -dx;
    if (L.flipY) dy = -dy;
    const c = from.crop, fw = w / c.w, fh = h / c.h;
    // the whole picture, the crop frame (layer px, from the layer's centre then)
    const P = [-w / 2 - c.x * fw, -h / 2 - c.y * fh]; let [x0, y0, x1, y1] = [-w / 2, -h / 2, w / 2, h / 2];
    if (handle === 'move') {
      // the picture moves, the frame stays (and stays on the picture)
      const px = clamp(P[0] + dx, x1 - fw, x0), py = clamp(P[1] + dy, y1 - fh, y0);
      L.crop = { x: (x0 - px) / fw, y: (y0 - py) / fh, w: c.w, h: c.h };
    } else {
      const [l, r, t, b] = EDGES[handle];
      if (l) x0 = clamp(x0 + dx, P[0], x1 - MIN); if (r) x1 = clamp(x1 + dx, x0 + MIN, P[0] + fw);
      if (t) y0 = clamp(y0 + dy, P[1], y1 - MIN); if (b) y1 = clamp(y1 + dy, y0 + MIN, P[1] + fh);
      L.crop = { x: (x0 - P[0]) / fw, y: (y0 - P[1]) / fh, w: (x1 - x0) / fw, h: (y1 - y0) / fh };
      L.w = (x1 - x0) / W;
      moveCentre(L, from, (x0 + x1) / 2, (y0 + y1) / 2, W, H);
    }
  } else if (from.mask) {
    const m = from.mask; let [x0, y0, x1, y1] = [(m.x - m.w / 2) * w, (m.y - m.h / 2) * h, (m.x + m.w / 2) * w, (m.y + m.h / 2) * h];
    if (handle === 'move') { x0 += dx; x1 += dx; y0 += dy; y1 += dy; }
    else {
      const [l, r, t, b] = EDGES[handle];
      if (l) x0 = Math.min(x0 + dx, x1 - MIN); if (r) x1 = Math.max(x1 + dx, x0 + MIN);
      if (t) y0 = Math.min(y0 + dy, y1 - MIN); if (b) y1 = Math.max(y1 + dy, y0 + MIN);
    }
    L.mask = { ...m, x: (x0 + x1) / 2 / w, y: (y0 + y1) / 2 / h, w: (x1 - x0) / w, h: (y1 - y0) / h };
  }
  markFace(o, face);
}
/* puts the layer's centre at (cx, cy) of its own px as they were at the drag's start */
function moveCentre(L, from, cx, cy, W, H) {
  const r = (L.rot || 0) * DEG, sx = L.flipX ? -1 : 1, sy = L.flipY ? -1 : 1, ex = cx * sx, ey = cy * sy;
  L.x = from.x + (ex * Math.cos(r) - ey * Math.sin(r)) / W; L.y = from.y + (ex * Math.sin(r) + ey * Math.cos(r)) / H;
}
/* the crop or mask mode of the selected layer: sel.edit = { id, mode }; it ends with another layer's selection */
const editMode = () => sel.edit && sel.edit.id === sel.layer ? sel.edit.mode : null;
function setEditMode(mode) { sel.edit = mode && sel.layer ? { id: sel.layer, mode } : null; }
/* a layer's own px in mm of its face (for the frame on the model) */
const pxPerMM = (o, k, W) => W / faceMM(o, k)[0];

export { MASKS, clipBase, clipRect, cropOf, cropped, editCursor, editDrag, editFrom, editHandles, editMode, editRects, hasPanels, maskPath, pxPerMM, resetCrop, setClipBelow, setClipTo, setEditMode, setMask, uncropped };
