// Печать на гранях: слои, текст, отделка, карты материалов
import { DEG, clamp, luminance } from '../core/util.js';
import { FINISHES, FOIL_METAL, PET_PRINT, UV_THICK, isFoil } from '../core/constants.js';
import { faceKeys, faceMM, isClearFace, loopAxis, netLayout, outerKeys } from '../core/model.js';
import { getImg } from '../core/assets.js';
import { artImg } from '../core/vector.js';
import { ensureFont, fontStr } from '../core/fonts.js';
import { RT, aux, ensureFaceRT, grainCanvas } from '../scene/renderer.js';
import { fanImage, fanToRect } from '../carriers/cup.js';
import { BAG_FILM, bagSeals, bagWindows } from '../carriers/bag.js';
import { faceGrain } from '../carriers/sleeve.js';
import { STICKER_FX, placementsFor } from '../stickers/placement.js';
import { drawSticker, stickerMask, stickerShadow } from '../stickers/film.js';
import { drawWrapped, wrapsOnto } from './wrap.js';
import { clipBase, clipRect, cropOf, cropped, maskPath } from '../core/mask.js';
import { boardFin } from '../carriers/board.js';
import * as THREE from 'three';
/* tissue paper: matt, a soft sheen at grazing angles */
const TISSUE_FIN = { label: 'Тишью', r: .9, m: 0, cc: 0, ccr: 0, sheen: .45 };

/* the copies of a layer a ring face needs: +1 when it runs over the start of the face, -1 over its end */
function loopShifts(L, W, H, ax) {
  if ((L.type === 'image' && L.tile) || L.clipTo) return [];
  const [w, h] = layerBox(L, W, H), r = L.rot * DEG, c = ax === 'x' ? L.x * W : L.y * H, len = ax === 'x' ? W : H;
  const ext = ax === 'x' ? (Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r))) / 2 : (Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r))) / 2;
  return [...(c - ext < 0 ? [1] : []), ...(c + ext > len ? [-1] : [])];
}
/* draw a face canvas into its dieline rectangle, turned if the panel lies upside down on the die */
function drawNetPanel(c, src, p, x, y, w, h, crop = null, inv = false) {
  if (p.fan) {
    // the wall unrolls into a fan; render it at the canvas' real pixel density
    const t = c.getTransform(), sc = Math.hypot(t.a, t.b) || 1;
    c.drawImage(fanImage(p.fan, src, Math.max(1, Math.round(w * sc)), Math.max(1, Math.round(h * sc))), x, y, w, h);
    return;
  }
  c.save();
  // quarter turns (q) of a panel lying on the sheet; inv cuts a sheet region back into the face
  const q = p.q ?? (p.rot ? 2 : 0);
  if (q) { c.translate(x + w / 2, y + h / 2); c.rotate((inv ? -q : q) * Math.PI / 2); if (q % 2) [w, h] = [h, w]; x = -w / 2; y = -h / 2; }
  if (crop) c.drawImage(src, ...crop, x, y, w, h); else c.drawImage(src, x, y, w, h);
  c.restore();
}
const mctx = document.createElement('canvas').getContext('2d');
const hasLS = 'letterSpacing' in mctx;
function textMetrics(L, H) {
  const fs = Math.max(1, L.size * H);
  mctx.font = fontStr(L, fs); if (hasLS) mctx.letterSpacing = (L.ls * fs) + 'px';
  const lines = String(L.text ?? '').split('\n');
  let mw = 0; for (const ln of lines) mw = Math.max(mw, mctx.measureText(ln).width);
  const m = { fs, lines, w: Math.max(mw, fs * .3), h: fs * L.lh * lines.length };
  if (Math.abs(L.arc || 0) >= 1) m.g = arcGeom(L.arc, m.w, m.h);
  return m;
}
/* text bent along a circle: the line of width w turns by `deg` degrees (> 0 arches up, < 0 sags);
   R the radius of the text's middle, s the bend's side, cy the shift that centres the band in its box (w × h) */
function arcGeom(deg, w, h) {
  const th = Math.min(Math.abs(deg), 360) * DEG, R = w / th, s = Math.sign(deg), half = th / 2;
  // the band between radii R ± h/2 over angles ±half, drawn arching up; a sagging one is its mirror
  const angs = [-half, half, ...[0, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI].filter(a => Math.abs(a) <= half)];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of [Math.max(0, R - h / 2), R + h / 2]) for (const a of angs) {
    const x = r * Math.sin(a), y = s * (R - r * Math.cos(a));
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { R, s, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
/* a point (x along the line, y across it) of straight text → [x, y, turn] on the arc */
function arcPt(g, x, y) {
  const a = x / g.R, r = g.R - g.s * y;
  return [r * Math.sin(a), g.s * (g.R - r * Math.cos(a)) - g.cy, g.s * a];
}
/* a point on the arc → [x, y] of straight text */
function arcInv(g, px, py) {
  const qy = g.s * (py + g.cy) - g.R;
  return [Math.atan2(px, -qy) * g.R, g.s * (g.R - Math.hypot(px, qy))];
}
/* the arc's centre and canvas angle of the point x along the line (the angle runs backwards when the text sags) */
const arcCentre = g => [0, g.s * g.R - g.cy];
const arcAng = (g, x) => g.s * (x / g.R - Math.PI / 2);
function layerBox(L, W, H) {
  if (L.type === 'image') {
    // a cropped image: the box is the part shown
    const im = getImg(L.src), c = cropOf(L), a = (im ? im.naturalWidth / im.naturalHeight : (L.aspect || 1)) * c.w / c.h, w = L.w * W;
    return [w, w / a];
  }
  if (L.type === 'shape') return [L.w * W, L.h * H];
  const m = textMetrics(L, H); return m.g ? [m.g.w, m.g.h] : [m.w, m.h];
}
/* the layer's colour, or its gradient over the layer's w × h box from that colour to grad.color;
   `at` ([x, y, turn] of a glyph's frame in the box) keeps the gradient on the box while the glyph turns */
function layerPaint(ctx, L, base, w, h, at = null) {
  const g = L.grad; if (!g) return base;
  const loc = at ? (x, y) => { const dx = x - at[0], dy = y - at[1], c = Math.cos(at[2]), s = Math.sin(at[2]); return [dx * c + dy * s, dy * c - dx * s]; } : (x, y) => [x, y];
  let gr;
  if (g.kind === 'radial') { const [cx, cy] = loc(0, 0); gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, w / 2, h / 2)); }
  else {
    const a = (g.angle ?? 90) * DEG, ux = Math.cos(a), uy = Math.sin(a), e = Math.max(.5, (Math.abs(w * ux) + Math.abs(h * uy)) / 2);
    gr = ctx.createLinearGradient(...loc(-ux * e, -uy * e), ...loc(ux * e, uy * e));
  }
  gr.addColorStop(0, base); gr.addColorStop(1, g.color);
  return gr;
}
/* the shown part of a cropped picture, kept while the picture and its crop stay the same */
const cropCache = new WeakMap();
function cropImg(im, c) {
  const key = [c.x, c.y, c.w, c.h].join(), got = cropCache.get(im);
  if (got?.key === key) return got.cv;
  const nw = im.naturalWidth || im.width, nh = im.naturalHeight || im.height;
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(c.w * nw)); cv.height = Math.max(1, Math.round(c.h * nh));
  cv.getContext('2d').drawImage(im, c.x * nw, c.y * nh, c.w * nw, c.h * nh, 0, 0, cv.width, cv.height);
  cropCache.set(im, { key, cv });
  return cv;
}
const tmp = document.createElement('canvas');
 const tctx = tmp.getContext('2d');
const tileC = document.createElement('canvas'), clipC = document.createElement('canvas');
/* the colour of a foil: its metal, a little uneven (the shine and the dark come from what it reflects, in 3D) */
function foilPaint(ctx, effect, W, H) {
  const [a, b] = FOIL_METAL[effect] || FOIL_METAL['foil-gold'];
  const g = ctx.createLinearGradient(0, 0, W * .6, H);
  g.addColorStop(0, a); g.addColorStop(.5, b); g.addColorStop(1, a);
  return g;
}
/* a holo foil's rainbow: the film's thickness (green) running in bands across the face, its strength (red) full */
function holoPaint(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W, H * .7);
  for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, `rgb(255,${Math.round(127 + 120 * Math.sin(i * 1.9))},0)`);
  return g;
}
/* draws a layer into a face-sized context; `paint` overrides its colours (silhouette), `op` its blending */
function drawLayer(ctx, L, W, H, paint = null, alpha = null, op = null) {
  if (!L.visible) return;
  const [w, h] = layerBox(L, W, H);
  ctx.save();
  ctx.globalAlpha = alpha ?? L.opacity;
  ctx.globalCompositeOperation = op || (paint ? 'source-over' : (L.blend || 'source-over'));
  ctx.translate(L.x * W, L.y * H); ctx.rotate(L.rot * DEG);
  // a mask shape: in the layer's box, turned with it
  if (L.mask) { ctx.beginPath(); maskPath(ctx, L.mask, w, h); ctx.clip(); }
  if (L.type === 'image') {
    let im = artImg(L.src, L.recolor, L.keyout);
    // a cropped image: only its part is drawn (cut out once into a canvas of its own)
    if (im && cropped(L)) im = cropImg(im, L.crop);
    if (im) {
      ctx.scale(L.flipX ? -1 : 1, L.flipY ? -1 : 1);
      let src = im;
      if (paint) {
        const tw = Math.max(1, Math.ceil(w)), th = Math.max(1, Math.ceil(h));
        tmp.width = tw; tmp.height = th;
        tctx.globalCompositeOperation = 'source-over'; tctx.drawImage(im, 0, 0, tw, th);
        tctx.globalCompositeOperation = 'source-in';
        tctx.setTransform(1, 0, 0, 1, -(L.x * W - w / 2), -(L.y * H - h / 2));
        tctx.fillStyle = paint; tctx.fillRect(L.x * W - w / 2, L.y * H - h / 2, tw, th);
        tctx.setTransform(1, 0, 0, 1, 0, 0);
        src = tmp;
      }
      if (L.tile) {
        // repeat the image as a pattern across the whole face; the layer box is one tile
        const tw = clamp(Math.round(w), 1, 4096), th = clamp(Math.round(h), 1, 4096);
        tileC.width = tw; tileC.height = th; tileC.getContext('2d').drawImage(src, 0, 0, tw, th);
        const pat = ctx.createPattern(tileC, 'repeat');
        pat.setTransform(new DOMMatrix().translate(-w / 2, -h / 2).scale(w / tw, h / th));
        const rr = Math.hypot(W, H) * 1.5; ctx.fillStyle = pat; ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
      } else ctx.drawImage(src, -w / 2, -h / 2, w, h);
    }
  } else if (L.type === 'shape') {
    const fill = paint || layerPaint(ctx, L, L.fill, w, h), sw = L.stroke * Math.min(W, H);
    ctx.beginPath();
    if (L.kind === 'ellipse') ctx.ellipse(0, 0, Math.max(.1, w / 2 - sw / 2), Math.max(.1, h / 2 - sw / 2), 0, 0, Math.PI * 2);
    else { const r = Math.min(L.radius * Math.min(w, h) / 2, w / 2, h / 2); ctx.roundRect(-w / 2 + sw / 2, -h / 2 + sw / 2, Math.max(.1, w - sw), Math.max(.1, h - sw), r); }
    if (sw > 0) { ctx.lineWidth = sw; ctx.strokeStyle = fill; ctx.stroke(); } else { ctx.fillStyle = fill; ctx.fill(); }
  } else {
    const m = textMetrics(L, H);
    ctx.font = fontStr(L, m.fs); if (hasLS) ctx.letterSpacing = (L.ls * m.fs) + 'px';
    ctx.textBaseline = 'middle'; ctx.textAlign = L.align;
    if (m.g) drawArcText(ctx, L, m, w, h, paint);
    else {
      ctx.fillStyle = paint || layerPaint(ctx, L, L.color, w, h);
      const ax = L.align === 'left' ? -m.w / 2 : L.align === 'right' ? m.w / 2 : 0;
      // letterSpacing adds trailing space after the last glyph; nudge centred text back
      const nudge = hasLS && L.align === 'center' ? L.ls * m.fs / 2 : 0;
      m.lines.forEach((ln, i) => ctx.fillText(ln, ax + nudge, -m.h / 2 + m.fs * L.lh * (i + .5)));
    }
    // the text being typed: its selection and caret, drawn on the print itself so they sit right on any surface
    if (!paint && caret?.id === L.id) drawCaret(ctx, L, m);
  }
  ctx.restore();
}
/* text along an arc: each glyph stands at its place on the straight line, carried onto the circle and turned with it */
function drawArcText(ctx, L, m, w, h, paint) {
  const lsp = hasLS ? L.ls * m.fs : 0;
  for (const sp of lineSpots(ctx, L, m)) {
    let i = 0, before = 0;
    for (const ch of sp.ln) {
      i += ch.length;
      const adv = ctx.measureText(sp.ln.slice(0, i)).width - before, at = arcPt(m.g, sp.x + before + (adv - lsp) / 2, sp.y);
      before += adv;
      if (!ch.trim()) continue;
      ctx.save(); ctx.translate(at[0], at[1]); ctx.rotate(at[2]);
      if (hasLS) ctx.letterSpacing = '0px';
      ctx.textAlign = 'center'; ctx.fillStyle = paint || layerPaint(ctx, L, L.color, w, h, at);
      ctx.fillText(ch, 0, 0); ctx.restore();
    }
  }
}
/* the caret of the text being typed: { id, a, b (selection, string indices), on (shown in this blink) } */
let caret = null;
function setTextCaret(c) { caret = c; }
/* where each line of a text starts (x) and its middle (y), in the layer's own px; ctx has the text's font set */
function lineSpots(ctx, L, m) {
  const nudge = hasLS && L.align === 'center' ? L.ls * m.fs / 2 : 0;
  return m.lines.map((ln, i) => {
    const lw = ctx.measureText(ln).width;
    return { ln, x: L.align === 'left' ? -m.w / 2 : L.align === 'right' ? m.w / 2 - lw : nudge - lw / 2, y: -m.h / 2 + m.fs * L.lh * (i + .5) };
  });
}
const lineCol = (lines, i) => { let n = i; for (let l = 0; l < lines.length; l++) { if (n <= lines[l].length) return [l, n]; n -= lines[l].length + 1; } return [lines.length - 1, lines.at(-1).length]; };
function drawCaret(ctx, L, m) {
  const spots = lineSpots(ctx, L, m), lh = m.fs * L.lh, at = ([l, c]) => spots[l].x + ctx.measureText(spots[l].ln.slice(0, c)).width;
  const a = lineCol(m.lines, Math.min(caret.a, caret.b)), b = lineCol(m.lines, Math.max(caret.a, caret.b));
  ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // a run x0…x1 of a line, straight or bent along the arc
  const band = (x0, y0, x1, y1) => {
    if (!m.g) { ctx.fillRect(x0, y0, x1 - x0, y1 - y0); return; }
    const g = m.g, [cx, cy] = arcCentre(g), back = g.s < 0, rad = y => Math.max(0, g.R - g.s * y);
    ctx.beginPath(); ctx.arc(cx, cy, rad(y0), arcAng(g, x0), arcAng(g, x1), back); ctx.arc(cx, cy, rad(y1), arcAng(g, x1), arcAng(g, x0), !back); ctx.fill();
  };
  if (caret.a !== caret.b) {
    ctx.fillStyle = 'rgba(10,122,161,.35)';
    for (let l = a[0]; l <= b[0]; l++) {
      const x0 = l === a[0] ? at(a) : spots[l].x, x1 = l === b[0] ? at(b) : spots[l].x + ctx.measureText(spots[l].ln).width + m.fs * .25;
      band(x0, spots[l].y - lh / 2, x0 + Math.max(1, x1 - x0), spots[l].y + lh / 2);
    }
  } else if (caret.on) {
    const p = lineCol(m.lines, caret.a), w = Math.max(1.5, m.fs * .06), x = at(p), y = spots[p[0]].y;
    ctx.fillStyle = luminance(L.color) > .6 ? '#0a7aa1' : L.color;
    if (m.g) { const [px, py, t] = arcPt(m.g, x, y); ctx.translate(px, py); ctx.rotate(t); ctx.fillRect(-w / 2, -m.fs * .55, w, m.fs * 1.1); }
    else band(x - w / 2, y - m.fs * .55, x + w / 2, y + m.fs * .55);
  }
  ctx.restore();
}
/* the string index nearest to the point (px, py) of a W × H face, in text layer L */
function textIndexAt(L, W, H, px, py) {
  const m = textMetrics(L, H), r = -(L.rot || 0) * DEG, dx = px - L.x * W, dy = py - L.y * H;
  let lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
  if (m.g) [lx, ly] = arcInv(m.g, lx, ly);
  mctx.font = fontStr(L, m.fs); if (hasLS) mctx.letterSpacing = (L.ls * m.fs) + 'px';
  const spots = lineSpots(mctx, L, m), l = clamp(Math.floor((ly + m.h / 2) / (m.fs * L.lh)), 0, m.lines.length - 1);
  let best = 0, bd = Infinity;
  for (let c = 0; c <= spots[l].ln.length; c++) { const d = Math.abs(spots[l].x + mctx.measureText(spots[l].ln.slice(0, c)).width - lx); if (d < bd) { bd = d; best = c; } }
  return m.lines.slice(0, l).reduce((t, s) => t + s.length + 1, 0) + best;
}
function renderFace(o, k) {
  const rt = RT.get(o.id); if (!rt || !faceKeys(o).includes(k)) return;
  const f = ensureFaceRT(o, k), face = o.faces[k], ctx = f.ctx;
  const W = f.canvas.width, H = f.canvas.height;
  // print on a clear PET lid: no board colour, paper grain or kraft, only the layers
  const clear = f.clear = isClearFace(o, k);
  const bf = clear && o.type === 'bag' ? BAG_FILM[o.bagMat] : null;
  const fin = clear ? bf?.fin || PET_PRINT : o.type === 'board' ? boardFin(o, k) : k === 'tissue' ? TISSUE_FIN : k === 'sleeve' ? FINISHES[o.sleeve?.fin] || FINISHES.matte : k === 'carry' ? FINISHES[o.carry?.fin] || FINISHES.matte : FINISHES[o.finish] || FINISHES.matte, grain = faceGrain(o, k);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (clear) { ctx.clearRect(0, 0, W, H); if (bf?.ground) { ctx.fillStyle = bf.ground; ctx.fillRect(0, 0, W, H); } }
  else {
    // the background: a colour, or a gradient over the whole face (as a layer's, from the face's middle)
    ctx.fillStyle = face.bg; ctx.fillRect(0, 0, W, H);
    if (face.bgGrad) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.fillStyle = layerPaint(ctx, { grad: face.bgGrad }, face.bg, W, H); ctx.fillRect(-W / 2, -H / 2, W, H); ctx.restore(); }
  }
  if (!clear && o.dieline && outerKeys(o).includes(k)) {
    const im = getImg(o.dieline), net = netLayout(o), p = net.panels.find(p => p.key === k);
    if (im && p?.fan) ctx.drawImage(fanToRect(p.fan, im, W, H, o.dieline), 0, 0);
    else if (im && p) drawNetPanel(ctx, im, p, 0, 0, W, H, [p.x / net.W * im.naturalWidth, p.y / net.H * im.naturalHeight, p.w / net.W * im.naturalWidth, p.h / net.H * im.naturalHeight], true);
  }
  // the face's own layers, then the parts of neighbours' layers that run over an edge onto it
  const fxl = [], ax = loopAxis(o, k);
  const plain = (c, it, cw, ch, paint, alpha, op) => {
    if (it.from) return drawWrapped(c, o, k, it, cw, (x, L, sw, sh) => drawLayer(x, L, sw, sh, paint, alpha, op));
    const r = clipRect(o, k, it.L, cw, ch);
    c.save();
    if (r) { c.beginPath(); c.rect(...r); c.clip(); }
    if (it.shift) c.translate(ax === 'x' ? it.shift * cw : 0, ax === 'y' ? it.shift * ch : 0);
    drawLayer(c, it.L, cw, ch, paint, alpha, op); c.restore();
  };
  // a clipped layer is drawn on its own, kept only where the layer it clips to is, then put on the face
  const draw = (c, it, cw, ch, paint, alpha) => {
    const base = clipBase(o.faces[it.from || k], it.L);
    if (!base) return plain(c, it, cw, ch, paint, alpha);
    if (!base.visible) return;
    clipC.width = cw; clipC.height = ch; const x = clipC.getContext('2d');
    plain(x, it, cw, ch, paint, 1, 'source-over');
    plain(x, { ...it, L: base }, cw, ch, '#000', 1, 'destination-in');
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = alpha ?? it.L.opacity; c.globalCompositeOperation = paint ? 'source-over' : (it.L.blend || 'source-over');
    c.drawImage(clipC, 0, 0); c.restore();
  };
  // on a ring a layer over one end is drawn again past the other end (shift: whole lengths of the face)
  const own = face.layers.flatMap((L, z) => [{ L, z }, ...(ax ? loopShifts(L, W, H, ax).map(shift => ({ L, z, shift })) : [])]);
  // a part that came over an edge sits in the stack at its place in its own face (the bottom layer of a face is
  // under the bottom layer of this one), so a pattern spread over several faces stays under the logos of each
  const items = [...own, ...wrapsOnto(o, k)].map((it, i) => ({ it, i })).sort((a, b) => a.it.z - b.it.z || (!!b.it.from - !!a.it.from) || a.i - b.i).map(x => x.it);
  for (const it of items) {
    const L = it.L; if (!L.visible) continue;
    if (L.type === 'text') ensureFont(L);
    if (isFoil(L.effect)) fxl.push(it);
    // on foil, what is printed is ink, not metal: those layers go to the finish map too
    else { draw(ctx, it, W, H); if (L.effect !== 'none' || fin.foilBase) fxl.push(it); }
  }
  if (fin.kraft && !clear) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = fin.kraft; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  if (grain > 0 && !clear) {
    const grainPat = f.pat || (f.pat = ctx.createPattern(grainCanvas, 'repeat'));
    grainPat.setTransform(new DOMMatrix().scale(f.ppm * 45 / 256));
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = Math.min(1, grain * (fin.kraft ? .9 : .45));
    ctx.fillStyle = grainPat; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  for (const it of fxl) if (isFoil(it.L.effect)) draw(ctx, it, W, H, foilPaint(ctx, it.L.effect, W, H), 1);
  if (bf && o.bagStyle !== 'block' && (k === 'front' || k === 'back')) bagSeals(ctx, o, W, H);
  const bw = o.type === 'bag' ? bagWindows(o)[k] : null;
  f.win = !!bw;
  if (bw) {
    const kk = W / faceMM(o, k)[0];
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath();
    ctx.roundRect(bw[0] * W, (1 - bw[3]) * H, (bw[1] - bw[0]) * W, (bw[3] - bw[2]) * H, bw.r * kk); ctx.fill(); ctx.restore();
  }
  // stickers sit on top of everything printed
  const ops = [];
  const frs = RT.get(o.id)?.frames;
  if (!skipStickers) for (const st of o.stickers || []) {
    if (!st.visible) continue;
    const pls = placementsFor(o, st);
    for (const pl of pls) {
      if (pl.key !== k) continue;
      // under a flap or lid the board is hidden by the outer face; no shadow there (it would show once opened)
      const F = frs?.[k];
      if (isClearFace(o, k)) continue;
      if (F && pls.some(q => q.key !== k && frs[q.key] && frs[q.key].n.dot(F.n) > .99 && frs[q.key].c.dot(F.n) > F.c.dot(F.n) + .2)) continue;
      ops.push({ st, M: pl.M });
    }
  }
  const ppx = W / faceMM(o, k)[0], film = !!RT.get(o.id)?.frames;
  for (const { st, M } of ops) {
    ctx.setTransform(M[0] * ppx, M[1] * ppx, M[2] * ppx, M[3] * ppx, M[4] * ppx, M[5] * ppx);
    if (film) stickerShadow(ctx, st, ppx); else drawSticker(ctx, st, ppx);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  f.tex.needsUpdate = true;
  updateFaceMaterial(o, k, f, fxl, fin, film ? [] : ops, draw);
}
let skipStickers = false;
/* fxl: layers with a finish, as { L } or a part of a neighbour's layer; draw(ctx, item, W, H, paint, alpha) paints one */
function updateFaceMaterial(o, k, f, fxl, fin, ops, draw) {
  const m = f.mat;
  const needFx = ops.length > 0 || !!fin.foilBase || fxl.some(({ L }) => isFoil(L.effect) || L.effect === 'spot-uv');
  const holo = fxl.some(({ L }) => L.effect === 'foil-holo'), uv = fxl.some(({ L }) => L.effect === 'spot-uv');
  const needBump = ops.length > 0 || fxl.some(({ L }) => isFoil(L.effect) || L.effect === 'emboss' || L.effect === 'deboss' || L.effect === 'spot-uv');
  const opsDraw = (x, ppx, color) => { for (const { st, M } of ops) { x.setTransform(M[0] * ppx, M[1] * ppx, M[2] * ppx, M[3] * ppx, M[4] * ppx, M[5] * ppx); stickerMask(x, st, color(st)); } x.setTransform(1, 0, 0, 1, 0, 0); };
  if (needFx) {
    const c = aux(f, 'fx'), x = f.fxCtx, W = c.width, H = c.height;
    x.globalAlpha = 1; x.fillStyle = `rgb(0,${Math.round(fin.r * 255)},${Math.round(fin.m * 255)})`; x.fillRect(0, 0, W, H);
    for (const it of fxl) {
      const e = it.L.effect;
      if (isFoil(e)) draw(x, it, W, H, `rgb(0,${e === 'foil-holo' ? 30 : 46},255)`, 1);
      else if (e === 'spot-uv') draw(x, it, W, H, `rgb(0,10,${Math.round(fin.m * 255)})`, 1);
      else if (fin.foilBase && (!e || e === 'none')) draw(x, it, W, H, 'rgb(0,140,0)', 1);
    }
    opsDraw(x, W / faceMM(o, k)[0], st => { const [r, mt] = STICKER_FX[st.finish] || STICKER_FX.gloss; return `rgb(0,${Math.round(r * 255)},${Math.round(mt * 255)})`; });
    f.fxTex.needsUpdate = true;
    m.roughnessMap = m.metalnessMap = f.fxTex; m.roughness = 1; m.metalness = 1;
  } else { m.roughnessMap = m.metalnessMap = null; m.roughness = fin.r; m.metalness = fin.m; }
  if (needBump) {
    const c = aux(f, 'bump'), x = f.bumpCtx, W = c.width, H = c.height;
    x.filter = 'none'; x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#808080'; x.fillRect(0, 0, W, H);
    if (faceGrain(o, k) > 0 && !f.clear) {
      const p = x.createPattern(grainCanvas, 'repeat'); p.setTransform(new DOMMatrix().scale(f.ppm / 2 * 45 / 256));
      x.globalCompositeOperation = 'overlay'; x.globalAlpha = faceGrain(o, k) * .6; x.fillStyle = p; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    }
    const blur = Math.max(.6, f.ppm / 2 * .35);
    for (const it of fxl) {
      const e = it.L.effect;
      x.filter = `blur(${blur}px)`;
      if (e === 'emboss') draw(x, it, W, H, '#ffffff', 1);
      else if (e === 'deboss') draw(x, it, W, H, '#000000', 1);
      else if (isFoil(e)) draw(x, it, W, H, '#5c5c5c', 1);
      // the varnish stands up from the print: its edge catches the light even off its highlight
      else if (e === 'spot-uv') { const u = UV_THICK[it.L.uv] || UV_THICK.normal; x.filter = `blur(${blur * u.blur}px)`; draw(x, it, W, H, u.bump, 1); }
    }
    opsDraw(x, W / faceMM(o, k)[0], () => '#a6a6a6');   // a sticker stands a little proud of the board
    x.filter = 'none';
    f.bumpTex.needsUpdate = true;
    m.bumpMap = f.bumpTex; m.bumpScale = 4;
  } else if (faceGrain(o, k) > 0 && !f.clear) { m.bumpMap = f.grain; m.bumpScale = faceGrain(o, k) * 1.2; }
  else m.bumpMap = null;
  // spot varnish is a glossy coat of its own over the print (red: coat, green: its roughness), on any board
  if (uv) {
    const c = aux(f, 'coat'), x = f.coatCtx, W = c.width, H = c.height;
    x.globalAlpha = 1; x.filter = 'none'; x.fillStyle = `rgb(${Math.round(fin.cc * 255)},${Math.round(fin.ccr * 255)},0)`; x.fillRect(0, 0, W, H);
    for (const it of fxl) if (it.L.effect === 'spot-uv') draw(x, it, W, H, 'rgb(255,6,0)', 1);
    f.coatTex.needsUpdate = true;
    m.clearcoatMap = m.clearcoatRoughnessMap = f.coatTex; m.clearcoat = 1; m.clearcoatRoughness = 1;
  } else { m.clearcoatMap = m.clearcoatRoughnessMap = null; m.clearcoat = fin.cc; m.clearcoatRoughness = fin.ccr; }
  // holo foil: a thin film over the metal, its rainbow shifting with the angle
  if (holo) {
    const c = aux(f, 'iri'), x = f.iriCtx, W = c.width, H = c.height;
    x.globalAlpha = 1; x.filter = 'none'; x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    for (const it of fxl) if (it.L.effect === 'foil-holo') draw(x, it, W, H, holoPaint(x, W, H), 1);
    f.iriTex.needsUpdate = true;
    m.iridescenceMap = m.iridescenceThicknessMap = f.iriTex; m.iridescence = 1; m.iridescenceIOR = 1.8; m.iridescenceThicknessRange = [250, 850];
  } else { m.iridescenceMap = m.iridescenceThicknessMap = null; m.iridescence = 0; }
  m.sheen = fin.sheen || 0; m.sheenRoughness = .8; m.sheenColor.set(0xffffff);
  // bag film keeps depth so the flap and stickers on it always cover the side beneath
  m.transparent = !!f.clear; m.depthWrite = !f.clear || o.type === 'bag';
  m.alphaTest = f.win ? .5 : 0;   // a window cut in a paper bag
  // tissue paper lets some light through, both its sides show
  if (k === 'tissue') { m.transparent = true; m.opacity = 1 - clamp(o.tissue?.sheer ?? 25, 0, 70) / 100; m.depthWrite = true; m.side = THREE.DoubleSide; }
  else m.opacity = 1;
  const sig = [k === 'tissue', !!m.roughnessMap, !!m.bumpMap, m.clearcoat > 0, !!m.clearcoatMap, holo, !!fin.sheen, !!f.clear, !!f.win].join();
  if (sig !== f.sig) { f.sig = sig; m.needsUpdate = true; }
}
function setSkipStickers(v) { skipStickers = v; }

export { drawLayer, drawNetPanel, layerBox, renderFace, setTextCaret, textIndexAt, setSkipStickers, tmp };
