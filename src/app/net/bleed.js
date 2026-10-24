// Вылет за линию реза: картинка вылета на холсте (экран и PNG), его контур в мм (SVG), лист печати с вылетом
import { netLayout, faceMM } from '../core/model.js';
import { RT } from '../scene/renderer.js';
import { cropPx } from '../faces/render.js';
import { BLEED_MM } from './net-check.js';
import { panelPath } from './net-view.js';

/* One bleed for the screen and the files. Every printed panel runs on past its own edge by the bleed: a face's
   picture goes on as its edge pixels do (what a print file is made with), a panel that is not a rectangle gets its
   ground colour. The pieces are drawn under the panels, so a neighbour covers them at the folds and they show only
   past the cut. The same panels grown by the bleed give the outline in mm (`bleedLoops`): the boundary of their union.
   Not covered yet: the bleed inside a window or a hole, a cup's fan. */
const rectLike = p => !p.fan && !p.poly && !p.circle && !p.r && p.ang == null;
/* a panel that gets bleed: printed (a face of its own, or a fold's strip in the ground colour), not a fan */
const bleeds = (o, p) => !p.fan && (!!p.fold || !!o.faces[p.key]);

/* ---------- on a canvas ---------- */
/* the face's picture round the panel (x, y, w, h: the panel itself): eight pieces, the middle one left to the panel. Past the
   face's own edge a piece is its edge pixel stretched; past a cut inside the face (half of a lid) it is the picture */
function drawBleed(c, fc, p, x, y, w, h, bm, bp, crop) {
  const S = crop || [0, 0, fc.width, fc.height], q = p.q ?? (p.rot ? 2 : 0);
  c.save();
  c.translate(x + w / 2, y + h / 2); c.rotate(q * Math.PI / 2);
  if (q % 2) [w, h] = [h, w];
  // per axis: [source start, source length, destination start, destination length] of the near band, the middle, the far band
  const axis = (s0, sl, full, d0, dl) => [
    s0 >= bp ? [s0 - bp, bp, d0 - bm, bm] : [s0, 1, d0 - bm, bm],
    [s0, sl, d0, dl],
    s0 + sl + bp <= full ? [s0 + sl, bp, d0 + dl, bm] : [s0 + sl - 1, 1, d0 + dl, bm]];
  const cols = axis(S[0], S[2], fc.width, -w / 2, w), rows = axis(S[1], S[3], fc.height, -h / 2, h);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    if (i === 1 && j === 1) continue;
    c.drawImage(fc, cols[i][0], rows[j][0], cols[i][1], rows[j][1], cols[i][2], rows[j][2], cols[i][3], rows[j][3]);
  }
  c.restore();
}
/* a polygon grown by g (shrunk when g < 0): each corner moves along the miter of its two edges */
function offsetPoly(P, g) {
  // a corner repeated (the handle's arcs have such) has no direction: one is enough
  P = P.filter((v, i) => i === 0 || Math.hypot(v[0] - P[i - 1][0], v[1] - P[i - 1][1]) > 1e-9);
  if (P.length > 1 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) <= 1e-9) P.pop();
  const n = P.length, area = P.reduce((s, [X, Y], i) => s + X * P[(i + 1) % n][1] - P[(i + 1) % n][0] * Y, 0), sg = area > 0 ? 1 : -1;
  const norm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [sg * dy / l, -sg * dx / l]; };
  return P.map((v, i) => {
    const n1 = norm(P[(i + n - 1) % n], v), n2 = norm(v, P[(i + 1) % n]), m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(...m) || 1;
    const u = [m[0] / ml, m[1] / ml], cos = Math.max(.34, u[0] * n1[0] + u[1] * n1[1]), d = g / cos;
    return [v[0] + u[0] * d, v[1] + u[1] * d];
  });
}
/* the outline of a panel grown by g px on a canvas path (offset ox, oy; k px per mm) */
function growPath(c, p, g, ox, oy, k) {
  const x = ox + p.x * k, y = oy + p.y * k, w = p.w * k, h = p.h * k;
  if (p.circle) { c.moveTo(x + w / 2 + w / 2 + g, y + h / 2); c.arc(x + w / 2, y + h / 2, w / 2 + g, 0, Math.PI * 2); }
  else if (p.poly) { offsetPoly(p.poly.map(([X, Y]) => [ox + X * k, oy + Y * k]), g).forEach((v, i) => c[i ? 'lineTo' : 'moveTo'](v[0], v[1])); c.closePath(); }
  else if (p.r) c.roundRect(x - g, y - g, w + 2 * g, h + 2 * g, p.r * k + g);
  else c.rect(x - g, y - g, w + 2 * g, h + 2 * g);
}
/* The bleed of the net's printed panels under what is drawn after it: the sheet's corner at (ox, oy) px, k px per mm, the
   bleed b mm. `line`: a colour to draw the bleed's edge in (the screen's overlay; a file has none). `canvasOf(p)`: the picture of
   a panel's face where it is not the one on the model (a print at its own resolution) */
function paintBleed(c, o, n, ox, oy, k, b = BLEED_MM, line = null, canvasOf = null) {
  const rt = RT.get(o.id), g = b * k;
  for (const p of n.panels) {
    if (p.fan) continue;
    const fc = canvasOf ? canvasOf(p) : rt?.faces[p.key]?.canvas;
    if (!fc && !p.fold) continue;
    if (rectLike(p) && fc?.width) {
      const bp = Math.max(1, Math.round(b * fc.width / faceMM(o, p.key)[0]));
      drawBleed(c, fc, p, ox + p.x * k, oy + p.y * k, p.w * k, p.h * k, g, bp, cropPx(fc, p));
    } else {
      c.save(); c.beginPath(); growPath(c, p, g, ox, oy, k);
      if (p.circle) c.moveTo(ox + (p.x + p.w) * k, oy + (p.y + p.h / 2) * k);
      panelPath(c, p, ox, oy, k); c.fillStyle = o.faces[p.key]?.bg || o.board || '#ffffff'; c.fill('evenodd'); c.restore();
    }
    if (line) { c.save(); c.beginPath(); growPath(c, p, g, ox, oy, k); c.strokeStyle = line; c.lineWidth = 1; c.stroke(); c.restore(); }
  }
}

/* ---------- the outline in mm ---------- */
const SAG = .02;
/* a panel grown by g mm, as a polygon of its sheet's mm (an arc is cut into steps that stay within .02 mm of it) */
function grownPoly(p, g) {
  const arc = (cx, cy, r, a0, a1) => { const m = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (2 * Math.acos(Math.max(0, 1 - SAG / Math.max(r, SAG * 2)))))); return Array.from({ length: m + 1 }, (_, i) => [cx + r * Math.cos(a0 + (a1 - a0) * i / m), cy + r * Math.sin(a0 + (a1 - a0) * i / m)]); };
  if (p.circle) return arc(p.x + p.w / 2, p.y + p.h / 2, p.w / 2 + g, 0, 2 * Math.PI).slice(1);
  if (p.poly) return offsetPoly(p.poly, g);
  const x = p.x - g, y = p.y - g, w = p.w + 2 * g, h = p.h + 2 * g;
  if (!p.r) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const r = Math.min(p.r + g, w / 2, h / 2), P = Math.PI;
  return [...arc(x + w - r, y + r, r, -P / 2, 0), ...arc(x + w - r, y + h - r, r, 0, P / 2), ...arc(x + r, y + h - r, r, P / 2, P), ...arc(x + r, y + r, r, P, 1.5 * P)];
}
const EPS = 1e-6, ON = 1e-5;
const area2 = P => P.reduce((s, [X, Y], i) => s + X * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * Y, 0);
/* how point v lies against polygon P: 'in', 'on' (on an edge; dir is that edge's direction) or 'out' */
function where(P, v) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [bx, by] = P[i], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const t = ((v[0] - ax) * dx + (v[1] - ay) * dy) / (L * L);
    if (t >= -1e-9 && t <= 1 + 1e-9 && Math.abs((v[0] - ax) * dy - (v[1] - ay) * dx) / L < ON) return { at: 'on', dir: [dx, dy] };
    if ((ay > v[1]) !== (by > v[1]) && v[0] < dx * (v[1] - ay) / dy + ax) inside = !inside;
  }
  return { at: inside ? 'in' : 'out' };
}
/* The boundary of the union of polygons, as closed loops. Each polygon's edges are cut where the others cross them and
   kept where they lie outside every other polygon (an edge two of them share, the same way round, is kept once). */
function unionLoops(polys) {
  const P = polys.map(pl => area2(pl) < 0 ? pl.slice().reverse() : pl), kept = [];
  P.forEach((A, ai) => A.forEach((a, i) => {
    const b = A[(i + 1) % A.length], d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1];
    if (L2 < EPS) return;
    const ts = [0, 1];
    P.forEach((B, bi) => {
      if (bi === ai) return;
      B.forEach((p, j) => {
        const q = B[(j + 1) % B.length], e = [q[0] - p[0], q[1] - p[1]], den = d[0] * e[1] - d[1] * e[0];
        if (Math.abs(den) > 1e-12) {
          const t = ((p[0] - a[0]) * e[1] - (p[1] - a[1]) * e[0]) / den, u = ((p[0] - a[0]) * d[1] - (p[1] - a[1]) * d[0]) / den;
          if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
        }
        // a corner of B lying on this edge splits it too
        const t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2;
        if (t > 1e-9 && t < 1 - 1e-9 && Math.abs((p[0] - a[0]) * d[1] - (p[1] - a[1]) * d[0]) / Math.sqrt(L2) < ON) ts.push(t);
      });
    });
    ts.sort((m, n) => m - n);
    for (let s = 0; s + 1 < ts.length; s++) {
      if (ts[s + 1] - ts[s] < 1e-9) continue;
      const p = [a[0] + d[0] * ts[s], a[1] + d[1] * ts[s]], q = [a[0] + d[0] * ts[s + 1], a[1] + d[1] * ts[s + 1]], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      let keep = true;
      P.forEach((B, bi) => {
        if (!keep || bi === ai) return;
        const w = where(B, m);
        if (w.at === 'in') keep = false;
        else if (w.at === 'on') keep = (w.dir[0] * d[0] + w.dir[1] * d[1] > 0) && ai < bi;
      });
      if (keep) kept.push([p, q]);
    }
  }));
  // chained head to tail into loops
  const key = v => `${Math.round(v[0] * 1e4)},${Math.round(v[1] * 1e4)}`, from = new Map();
  kept.forEach((e, i) => { const k = key(e[0]); (from.get(k) || from.set(k, []).get(k)).push(i); });
  const used = new Set(), loops = [];
  kept.forEach((e0, i0) => {
    if (used.has(i0)) return;
    const loop = [e0[0]]; let i = i0;
    while (i != null && !used.has(i)) {
      used.add(i); const q = kept[i][1]; loop.push(q);
      i = (from.get(key(q)) || []).find(j => !used.has(j));
    }
    if (loop.length > 3) loops.push(loop.slice(0, -1));
  });
  // corners that do not turn are dropped
  return loops.map(l => l.filter((v, i) => { const a = l[(i + l.length - 1) % l.length], b = l[(i + 1) % l.length]; return Math.abs((v[0] - a[0]) * (b[1] - v[1]) - (v[1] - a[1]) * (b[0] - v[0])) > 1e-7; })).filter(l => l.length > 2);
}
/* the bleed's outline round the printed panels of the net n of object o: closed loops of [x, y] in the sheet's mm */
function bleedLoops(o, n, b = BLEED_MM) {
  const polys = n.panels.filter(p => bleeds(o, p)).map(p => grownPoly(p, b)).filter(pl => pl.every(v => Number.isFinite(v[0]) && Number.isFinite(v[1])));
  return polys.length && b > 0 ? unionLoops(polys) : [];
}

/* ---------- the print sheet ---------- */
/* The sheet a print file is made on: the net with the bleed round it, its corner at (ox, oy) = (bleed, bleed) of the
   sheet; the same numbers for the PNG and the SVG, so one lies right over the other. A net with nothing that bleeds (a
   cup) gets none. */
function printSheet(o, bleed = 0, n = netLayout(o)) {
  const b = bleed > 0 && n.panels.some(p => bleeds(o, p)) ? bleed : 0;
  return { n, bleed: b, ox: b, oy: b, W: n.W + 2 * b, H: n.H + 2 * b };
}

export { bleedLoops, bleeds, grownPoly, growPath, offsetPoly, paintBleed, printSheet, rectLike };
