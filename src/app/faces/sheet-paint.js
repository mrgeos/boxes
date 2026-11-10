// Рисование сквозных слоёв: лист в картинку грани и собственная картинка листа
import { hasInside } from '../net/net-side.js';
import { panelPath } from '../net/net-view.js';
import { flatPanel, sheetToFace } from '../net/sheet-map.js';
import { SIDES, dimsFor, settleSheet, sheetNet, sheetSide } from '../core/sheet.js';
import { ensureFont } from '../core/fonts.js';
import { drawLayer, layerBox } from './render.js';
import { mul } from './wrap.js';

/* A sheet layer is drawn in the sheet's own pixels (its shares of the sheet's width and height, W × H px, the sheet
   n.W × n.H mm): there fonts and lines are the size they would have on the sheet, whatever the face's scale. For a face
   the drawing is laid on its canvas by the map from the sheet to the face (net/sheet-map.js) and cut to the panel
   that shows the face, so a layer over a fold goes on to the next face where the sheet goes on. */
function drawSheetLayer(ctx, L, W, H, n) {
  if (!L.visible) return;
  if (L.type === 'text') ensureFont(L);
  const t = L.anchor?.box && L.anchor.tgt;
  if (!t) return drawLayer(ctx, L, W, H);
  // a layer that fills its part of the box: its own shape stretched to it
  const M = { ...L, rot: 0 }, [bw, bh] = layerBox(M, W, H), sx = t[0] / n.W * W / bw, sy = t[1] / n.H * H / bh;
  ctx.save(); ctx.translate(L.x * W, L.y * H); ctx.scale(sx, sy); ctx.translate(-L.x * W, -L.y * H);
  drawLayer(ctx, M, W, H); ctx.restore();
}
/* the layers of the sheet that print on face k (tier: over the face's own layers or under them) into its canvas ctx
   (W × H px) */
function paintSheet(ctx, o, k, W, H, over) {
  if (!o.sheet) return;
  for (const side of SIDES) {
    const sh = o.sheet[side]; if (!sh?.layers.length || (side === 'back' && !hasInside(o))) continue;
    const n = sheetNet(o, side), ps = n.panels.filter(p => p.key === k && flatPanel(p)); if (!ps.length) continue;
    settleSheet(o, side, n);
    const Ls = sh.layers.filter(L => L.visible && !!L.over === over); if (!Ls.length) continue;
    const [Ws, Hs] = dimsFor(n.W, n.H);
    for (const p of ps) {
      const G = sheetToFace(p, W, H);   // sheet mm → face px
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      if (p.poly || p.r || p.circle || p.ang != null) { ctx.setTransform(...G); panelPath(ctx, p, 0, 0, 1); ctx.setTransform(1, 0, 0, 1, 0, 0); }
      else {
        // a rectangle: kept on whole px, so two parts of one face meet without a seam
        const a = [p.x, p.y], b = [p.x + p.w, p.y + p.h], A = [G[0] * a[0] + G[2] * a[1] + G[4], G[1] * a[0] + G[3] * a[1] + G[5]], B = [G[0] * b[0] + G[2] * b[1] + G[4], G[1] * b[0] + G[3] * b[1] + G[5]];
        const x0 = Math.round(Math.min(A[0], B[0])), y0 = Math.round(Math.min(A[1], B[1])), x1 = Math.round(Math.max(A[0], B[0])), y1 = Math.round(Math.max(A[1], B[1]));
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
      }
      ctx.clip();
      ctx.setTransform(...mul(G, [n.W / Ws, 0, 0, n.H / Hs, 0, 0]));
      for (const L of Ls) drawSheetLayer(ctx, L, Ws, Hs, n);
      ctx.restore();
    }
  }
}
/* the sheet side's own picture (the pseudo-face 'sheet:front' / 'sheet:back'): its layers on a clear ground */
function renderSheetFace(o, k, f, W, H) {
  const side = sheetSide(k), ctx = f.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, W, H);
  const sh = o.sheet?.[side]; if (!sh) return;
  const n = sheetNet(o, side); settleSheet(o, side, n);
  for (const L of sh.layers) drawSheetLayer(ctx, L, W, H, n);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export { paintSheet, renderSheetFace };
