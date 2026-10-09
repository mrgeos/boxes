// Развёртка коробки как настоящая заготовка: лоток-крест с угловыми клапанами, крышка на задней стенке
import { clamp } from '../core/util.js';
import { doubleWall, faceKeys, faceMM } from '../core/model.js';
import { mailerNet } from './mailer.js';
import { rscNet } from './rsc.js';
import { bookNet } from './book.js';
import { casketNet, drawerNet } from './rigid.js';
import { gableNet, hexNet, pillowNet, pyramidNet } from './shapes.js';

/* The base is one blank laid out as a cross: the bottom in the middle, the four walls folded up from its
   edges (front above it, back below, the sides left and right), the inner strips of double walls beyond them.
   The front and back walls carry glue flaps at their ends that go round the corners onto the inside of the
   side walls. A hinged lid (plain, with a flap outside or tucked in) hangs off the top edge of the back wall,
   its flap below it and the ears beside the flap (cut free of the lid, creased to the flap). A lid of a
   lid-and-base box is a second cross of the same kind: its top in the middle, its walls round it.
   Every panel is placed as it lies on the sheet, printed side up; q is its quarter turns clockwise from how
   its face is drawn. `joins`, when set, names the only panels it is creased to (other shared edges are cut). */
function cornerTabs(tabs, wall, x, y0, y1, side, tw, chamfer) {
  // a glue flap on the wall's edge at x, from y0 to y1, sticking out to the left (side -1) or right (1)
  const X = x + side * tw;
  tabs.push({ on: wall, pts: [[x, y0], [X, y0 + chamfer], [X, y1 - chamfer], [x, y1]] });
}
function boxNet(o) {
  const { w, h, d } = o.dims, keys = faceKeys(o), lt = o.lidType || 'flat', t = clamp(o.thickness, .3, 10);
  if (lt === 'f0427') return mailerNet(o);
  if (lt === 'f0201') return rscNet(o);
  if (lt === 'book') return bookNet(o);
  if (lt === 'casket') return casketNet(o);
  if (lt === 'drawer') return drawerNet(o);
  if (lt === 'pillow') return pillowNet(o);
  if (lt === 'gable') return gableNet(o);
  if (lt === 'pyramid') return pyramidNet(o);
  if (lt === 'hexagon') return hexNet(o);
  const panels = [], tabs = [];
  const lidOnBack = keys.includes('top') && lt !== 'telescope';
  const FD = !lidOnBack && doubleWall(o) ? Math.max(1, h - t) : 0;
  const tab = (a, b) => clamp(Math.min(a, b) * .3, 8, 20);
  // the base
  const bx = 0, by = 0, tw = tab(w, d), ch = Math.min(tw * .4, h * .15), gap = 2 * t, top = .5;
  panels.push({ key: 'bottom', x: bx, y: by, w, h: d, q: 0 },
    { key: 'front', x: bx, y: by - h, w, h, q: 0 }, { key: 'back', x: bx, y: by + d, w, h, q: 2 },
    { key: 'left', x: bx - h, y: by, w: h, h: d, q: 3 }, { key: 'right', x: bx + w, y: by, w: h, h: d, q: 1 });
  if (FD) panels.push({ key: 'fold', fold: true, x: bx, y: by - h - FD, w, h: FD }, { key: 'fold', fold: true, x: bx, y: by + d + h, w, h: FD },
    { key: 'fold', fold: true, x: bx - h - FD, y: by, w: FD, h: d }, { key: 'fold', fold: true, x: bx + w + h, y: by, w: FD, h: d });
  cornerTabs(tabs, 'front', bx, by - h + top, by - gap, -1, tw, ch); cornerTabs(tabs, 'front', bx + w, by - h + top, by - gap, 1, tw, ch);
  cornerTabs(tabs, 'back', bx, by + d + gap, by + d + h - top, -1, tw, ch); cornerTabs(tabs, 'back', bx + w, by + d + gap, by + d + h - top, 1, tw, ch);
  // a hinged lid off the back wall's top edge
  if (lidOnBack) {
    const [lw, th] = faceMM(o, 'top'), lx = bx + (w - lw) / 2, ly = by + d + h;
    panels.push({ key: 'top', x: lx, y: ly, w: lw, h: th, q: 0 });
    if (keys.includes('flap')) {
      const [fw, fh] = faceMM(o, 'flap'), fx = lx + (lw - fw) / 2, fy = ly + th;
      panels.push({ key: 'flap', x: fx, y: fy, w: fw, h: fh, q: 0 });
      if (keys.includes('earLeft')) {
        const el = faceMM(o, 'earLeft')[0], c = Math.min(fh, el) * .3, Y = fy + fh;
        panels.push({ key: 'earLeft', x: fx - el, y: fy, w: el, h: fh, q: 0, joins: ['flap'], poly: [[fx - el, fy], [fx, fy], [fx, Y], [fx - el + c, Y], [fx - el, Y - c]] },
          { key: 'earRight', x: fx + fw, y: fy, w: el, h: fh, q: 0, joins: ['flap'], poly: [[fx + fw, fy], [fx + fw + el, fy], [fx + fw + el, Y - c], [fx + fw + el - c, Y], [fx + fw, Y]] });
      }
    }
  }
  // the separate lid of a lid-and-base box, to the right of the base
  if (lt === 'telescope') {
    const [lw, ld] = faceMM(o, 'top'), lh = faceMM(o, 'lidFront')[1], right = bx + w + h + FD + Math.max(tw, 0);
    const lx = right + 20 + lh, ly = by - h - FD, ltw = tab(lw, ld), lch = Math.min(ltw * .4, lh * .15);
    panels.push({ key: 'top', x: lx, y: ly, w: lw, h: ld, q: 0 },
      { key: 'lidFront', x: lx, y: ly + ld, w: lw, h: lh, q: 0 }, { key: 'lidBack', x: lx, y: ly - lh, w: lw, h: lh, q: 2 },
      { key: 'lidLeft', x: lx - lh, y: ly, w: lh, h: ld, q: 1 }, { key: 'lidRight', x: lx + lw, y: ly, w: lh, h: ld, q: 3 });
    cornerTabs(tabs, 'lidFront', lx, ly + ld + gap, ly + ld + lh - top, -1, ltw, lch); cornerTabs(tabs, 'lidFront', lx + lw, ly + ld + gap, ly + ld + lh - top, 1, ltw, lch);
    cornerTabs(tabs, 'lidBack', lx, ly - lh + top, ly - gap, -1, ltw, lch); cornerTabs(tabs, 'lidBack', lx + lw, ly - lh + top, ly - gap, 1, ltw, lch);
  }
  // everything moved so the sheet starts at 0, 0
  const xs = [...panels.flatMap(p => [p.x, p.x + p.w]), ...tabs.flatMap(t => t.pts.map(v => v[0]))];
  const ys = [...panels.flatMap(p => [p.y, p.y + p.h]), ...tabs.flatMap(t => t.pts.map(v => v[1]))];
  const x0 = Math.min(...xs), y0 = Math.min(...ys), mv = ([x, y]) => [x - x0, y - y0];
  for (const p of panels) { p.x -= x0; p.y -= y0; if (p.poly) p.poly = p.poly.map(mv); }
  for (const tb of tabs) tb.pts = tb.pts.map(mv);
  return { v: 2, W: Math.max(...xs) - x0, H: Math.max(...ys) - y0, panels, tabs };
}

/* where a point of a face (fractions u across, v down, as the face is drawn) lies on the sheet */
function netPoint(p, u, v) {
  const q = (((p.q ?? (p.rot ? 2 : 0)) % 4) + 4) % 4;
  return q === 0 ? [p.x + u * p.w, p.y + v * p.h] : q === 2 ? [p.x + (1 - u) * p.w, p.y + (1 - v) * p.h]
    : q === 1 ? [p.x + (1 - v) * p.w, p.y + u * p.h] : [p.x + v * p.w, p.y + (1 - u) * p.h];
}

/* the cut and crease lines of a sheet made of panels and glue flaps: an edge two pieces share is a crease (unless
   one of them only joins others), every other edge is cut */
function dieLines(pieces) {
  const eps = .01, cuts = [], creases = [];
  const edges = pieces.map(pc => pc.pts.map((a, i) => [a, pc.pts[(i + 1) % pc.pts.length]]));
  const joined = (A, B) => (!A.joins || A.joins.includes(B.key)) && (!B.joins || B.joins.includes(A.key));
  pieces.forEach((A, i) => edges[i].forEach(([a, b]) => {
    const hor = Math.abs(a[1] - b[1]) < eps, ver = Math.abs(a[0] - b[0]) < eps;
    if (!hor && !ver) {
      // a slanted edge: a crease where another piece has the same edge and is joined to this one
      const same = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < eps * 10;
      const j = pieces.findIndex((B, k) => k !== i && edges[k].some(([p, q]) => (same(p, a) && same(q, b)) || (same(p, b) && same(q, a))));
      if (j < 0) cuts.push([...a, ...b]); else if (i < j) (joined(A, pieces[j]) ? creases : cuts).push([...a, ...b]);
      return;
    }
    const ax = hor ? 0 : 1, c = a[1 - ax], lo = Math.min(a[ax], b[ax]), hi = Math.max(a[ax], b[ax]), shared = [];
    pieces.forEach((B, j) => {
      if (j === i) return;
      for (const [p, q] of edges[j]) {
        if (Math.abs(p[1 - ax] - q[1 - ax]) > eps || Math.abs(p[1 - ax] - c) > eps || Math.abs(p[ax] - q[ax]) < eps) continue;
        const s = Math.max(lo, Math.min(p[ax], q[ax])), e = Math.min(hi, Math.max(p[ax], q[ax]));
        if (e - s > eps) shared.push([s, e, j]);
      }
    });
    const at = (u, v) => hor ? [u, c, v, c] : [c, u, c, v];
    // shared with a piece it is joined to: a crease; shared with one it is not: a cut between them; both drawn by the
    // piece that comes first. Whatever is left of the edge is its own cut
    let cur = lo;
    for (const [s, e, j] of shared.sort((m, n) => m[0] - n[0])) {
      if (s > cur + eps) cuts.push(at(cur, s));
      if (i < j) (joined(A, pieces[j]) ? creases : cuts).push(at(Math.max(s, cur), e));
      cur = Math.max(cur, e);
    }
    if (hi > cur + eps) cuts.push(at(cur, hi));
  }));
  return { cuts, creases };
}

export { boxNet, dieLines, netPoint };
