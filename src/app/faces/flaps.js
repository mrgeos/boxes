// Печать на клапанах листа, у которых нет своей грани: фон соседней грани и слои листа, обрезанные контуром клапана
import * as THREE from 'three';
import { FINISHES } from '../core/constants.js';
import { getImg } from '../core/assets.js';
import { faceMM, netLayout } from '../core/model.js';
import { dimsFor, settleSheet } from '../core/sheet.js';
import { faceToSheet, flatPanel } from '../net/sheet-map.js';
import { panelPath } from '../net/net-view.js';
import { printPanels } from '../net/flap-rules.js';
import { RT } from '../scene/renderer.js';
import { layerPaint } from './render.js';
import { drawSheetLayer } from './sheet-paint.js';

/* A dust flap or an ear has no face of its own (no chip, no layers): a panel of the net with `flap: { bgOf }` is printed
   with the ground of that face (a colour, a gradient carried on from the face over the flap, the uploaded print file,
   the kraft of the finish) and the sheet's layers of the front side, cut to the flap's outline. The faces' own layers
   do not go over to it. This one function draws it for everything: the net on screen, the PNG and PDF files and the
   3D model's picture (below), each into its own canvas at its own scale. (ox, oy): where the sheet's corner is on the
   canvas, k: px per mm; n: the net the panel is on. */
/* the part of a flap that is printed (net mm, [x, y, w, h]): all of it, or only a strip by its crease (a glue flap: the
   print runs onto it past the fold, the rest stays bare for the glue) */
function flapRect(p) {
  const s = p.flap?.strip; if (!s) return [p.x, p.y, p.w, p.h];
  const m = Math.min(s.mm, s.edge === 'left' || s.edge === 'right' ? p.w : p.h);
  return s.edge === 'bottom' ? [p.x, p.y + p.h - m, p.w, m] : s.edge === 'left' ? [p.x, p.y, m, p.h] : s.edge === 'right' ? [p.x + p.w - m, p.y, m, p.h] : [p.x, p.y, p.w, m];
}
/* the bare part of a glue flap (net mm, [x, y, w, h]): all of it beyond the printed strip; nothing else prints there,
   not even the bleed of the panel it folds off */
function bareRect(p) {
  const s = p.glueStrip, m = Math.min(s.mm, s.edge === 'left' || s.edge === 'right' ? p.w : p.h);
  return s.edge === 'bottom' ? [p.x, p.y, p.w, p.h - m] : s.edge === 'left' ? [p.x + m, p.y, p.w - m, p.h] : s.edge === 'right' ? [p.x, p.y, p.w - m, p.h] : [p.x, p.y + m, p.w, p.h - m];
}
function drawFlap(c, o, n, p, ox, oy, k) {
  const face = o.faces[p.flap.bgOf]; if (!face) return;
  const src = n.panels.find(q => q.key === p.flap.bgOf && flatPanel(q));
  c.save(); c.beginPath(); panelPath(c, p, ox, oy, k); c.clip();
  if (p.flap.strip) { const [x, y, w, h] = flapRect(p); c.beginPath(); c.rect(ox + x * k, oy + y * k, w * k, h * k); c.clip(); }
  c.translate(ox, oy); c.scale(k, k);
  c.fillStyle = face.bg; c.fillRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2);
  if (face.bgGrad && src) {
    // the face's gradient is laid out on the face's own rectangle and goes on beyond it
    const [fw, fh] = faceMM(o, src.key);
    c.save(); c.transform(...faceToSheet(src, fw, fh).M); c.translate(fw / 2, fh / 2);
    c.fillStyle = layerPaint(c, { grad: face.bgGrad }, face.bg, fw, fh); c.fillRect(-4 * fw, -4 * fh, 8 * fw, 8 * fh); c.restore();
  }
  const im = o.dieline && getImg(o.dieline); if (im) c.drawImage(im, 0, 0, n.W, n.H);
  const sh = o.sheet?.front;
  if (sh?.layers.some(L => L.visible)) {
    settleSheet(o, 'front', n);
    const [Ws, Hs] = dimsFor(n.W, n.H);
    c.save(); c.scale(n.W / Ws, n.H / Hs);
    for (const L of sh.layers) drawSheetLayer(c, L, Ws, Hs, n);
    c.restore();
  }
  const kraft = FINISHES[o.finish]?.kraft;
  if (kraft) { c.globalCompositeOperation = 'multiply'; c.fillStyle = kraft; c.fillRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2); }
  c.restore();
}
/* the faces whose ground the net's flaps take */
const flapSources = n => new Set(printPanels(n).filter(p => p.flap).map(p => p.flap.bgOf));

/* ---------- the 3D model: one picture of the whole sheet, the flaps' meshes take their part of it ---------- */
/* rt.flaps = { canvas, tex, mat, W, H (the sheet, mm), s (px per mm), src (faces it follows) }: made with the model, painted
   like a face (the key 'flaps' in the queue of scene/camera.js) */
function ensureFlaps(o, rt, n) {
  const [cw, ch, s] = dimsFor(n.W, n.H);
  let f = rt.flaps;
  if (!f) {
    const canvas = document.createElement('canvas');
    f = rt.flaps = { canvas, ctx: canvas.getContext('2d'), mat: new THREE.MeshStandardMaterial({ roughness: .88, side: THREE.FrontSide, shadowSide: THREE.DoubleSide }) };
  }
  if (f.canvas.width !== cw || f.canvas.height !== ch) {
    f.canvas.width = cw; f.canvas.height = ch; f.tex?.dispose();
    f.tex = new THREE.CanvasTexture(f.canvas); f.tex.colorSpace = THREE.SRGBColorSpace; f.mat.map = f.tex; f.mat.needsUpdate = true;
    f.ctx.fillStyle = o.board || '#ffffff'; f.ctx.fillRect(0, 0, cw, ch);   // until it is painted
  }
  Object.assign(f, { W: n.W, H: n.H, s, src: flapSources(n) });
  return f;
}
function renderFlaps(o) {
  const f = RT.get(o.id)?.flaps; if (!f) return;
  const n = netLayout(o), c = f.ctx;
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, f.canvas.width, f.canvas.height);
  for (const p of printPanels(n)) {
    if (p.flap) drawFlap(c, o, n, p, 0, 0, f.s);
    // the bare part of a glue flap is the paper itself
    if (p.glueStrip) { const [x, y, w, h] = bareRect(p); c.save(); c.beginPath(); panelPath(c, p, 0, 0, f.s); c.clip(); c.fillStyle = o.board || '#ffffff'; c.fillRect(x * f.s, y * f.s, w * f.s, h * f.s); c.restore(); }
  }
  f.tex.needsUpdate = true;
}

export { bareRect, drawFlap, ensureFlaps, flapRect, renderFlaps };
