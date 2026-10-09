// Развёртка коробки как настоящая заготовка: лоток-крест с угловыми клапанами, крышка на задней стенке, мейлер FEFCO 0427
import { clamp } from '../core/util.js';
import { doubleWall, faceKeys, faceMM } from '../core/model.js';
import { cartonNet, isCarton } from './carton-net.js';

/* The base is one blank laid out as a cross: the bottom in the middle, the four walls folded up from its
   edges (front above it, back below, the sides left and right), the inner strips of double walls beyond them.
   The front and back walls carry glue flaps at their ends that go round the corners onto the inside of the
   side walls. A hinged lid (plain, with a flap outside or tucked in) hangs off the top edge of the back wall,
   its flap below it and the ears beside the flap (cut free of the lid, creased to the flap). A lid of a
   lid-and-base box is a second cross of the same kind: its top in the middle, its walls round it.
   Every panel is placed as it lies on the sheet, printed side up; q is its quarter turns clockwise from how
   its face is drawn. `joins`, when set, names the only panels it is creased to (other shared edges are cut). */
/* the version of the blank layout: 2 — the tray cross, 3 — the mailer (FEFCO 0427) and inner strips of the walls under a hinged lid.
   A project with an uploaded design of the whole sheet keeps the version it was drawn on */
const NET_V = 3;
function cornerTabs(tabs, wall, x, y0, y1, side, tw, chamfer, label) {
  // a glue flap on the wall's edge at x, from y0 to y1, sticking out to the left (side -1) or right (1)
  const X = x + side * tw;
  tabs.push({ on: wall, pts: [[x, y0], [X, y0 + chamfer], [X, y1 - chamfer], [x, y1]], ...(label != null ? { label } : {}) });
}
function boxNet(o) {
  const { w, h, d } = o.dims, keys = faceKeys(o), lt = o.lidType || 'flat', t = clamp(o.thickness, .3, 10), v = o.netV ?? NET_V;
  if (isCarton(o)) return cartonNet(o);
  if (lt === 'tuck' && v >= 3) return mailerNet(o);
  const panels = [], tabs = [];
  const lidOnBack = keys.includes('top') && lt !== 'telescope';
  // a double wall folds in at the top; under a lid hinged on the back wall the back wall stays single
  const FD = (!lidOnBack || v >= 3) && doubleWall(o) ? Math.max(1, h - t) : 0;
  const tab = (a, b) => clamp(Math.min(a, b) * .3, 8, 20);
  // the base
  const bx = 0, by = 0, tw = tab(w, d), ch = Math.min(tw * .4, h * .15), gap = 2 * t, top = .5;
  panels.push({ key: 'bottom', x: bx, y: by, w, h: d, q: 0 },
    { key: 'front', x: bx, y: by - h, w, h, q: 0 }, { key: 'back', x: bx, y: by + d, w, h, q: 2 },
    { key: 'left', x: bx - h, y: by, w: h, h: d, q: 3 }, { key: 'right', x: bx + w, y: by, w: h, h: d, q: 1 });
  if (FD) panels.push({ key: 'fold', fold: true, x: bx, y: by - h - FD, w, h: FD }, ...(lidOnBack ? [] : [{ key: 'fold', fold: true, x: bx, y: by + d + h, w, h: FD }]),
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
  return toOrigin({ v: 2, panels, tabs });
}

/* FEFCO 0427, the roll-end tuck-front mailer: one blank, no glue. The bottom in the middle; the front and the side
   walls are double: their inner strips roll over the top into the box and lock with tabs into slots of the bottom.
   The front and back walls carry anchor flaps at their ends that are trapped between the two layers of the side walls.
   The lid hangs off the back wall; its front flap is double and tucks into the box, with dust ears at its ends.
   The inner strips, flaps and tabs are not printed */
function mailerNet(o) {
  const { w, h, d } = o.dims, t = clamp(o.thickness, .3, 10), panels = [], tabs = [], slots = [];
  const ih = Math.max(1, h - t), gap = 2 * t, top = .5;
  const aw = clamp(d * .35, 6, Math.max(6, d / 2 - 2 * t)), ach = Math.min(aw * .3, h * .2);
  const lockW = n => clamp(n * .14, 6, 30), lockH = clamp(h * .12, 3, 8), slotH = Math.max(1.5, 1.5 * t);
  // a locking tab on the inner strip's free edge (x0..x1 at y on a horizontal edge, or y0..y1 at x on a vertical one)
  // and its slot in the bottom, just inside the crease the strip comes down at
  const lock = (hor, at, lo, hi, out, slotAt) => {
    const c = lockH * .4, e = at + out * lockH, pts = [[lo, at], [lo + c, e], [hi - c, e], [hi, at]];
    tabs.push({ on: 'fold', label: '', pts: hor ? pts : pts.map(([a, b]) => [b, a]) });
    const s = [[lo - .5, slotAt], [hi + .5, slotAt], [hi + .5, slotAt + slotH * -out], [lo - .5, slotAt + slotH * -out]];
    slots.push(hor ? s : s.map(([a, b]) => [b, a]));
  };
  panels.push({ key: 'bottom', x: 0, y: 0, w, h: d, q: 0 },
    { key: 'front', x: 0, y: -h, w, h, q: 0 }, { key: 'back', x: 0, y: d, w, h, q: 2 },
    { key: 'left', x: -h, y: 0, w: h, h: d, q: 3 }, { key: 'right', x: w, y: 0, w: h, h: d, q: 1 });
  // the double front: its inner strip fits between the double side walls
  const fx0 = 2 * t, fx1 = w - 2 * t, fy = -h - ih;
  panels.push({ key: 'fold', fold: true, x: fx0, y: fy, w: fx1 - fx0, h: ih });
  for (const c of [.25, .75]) { const lw = lockW(w), cx = fx0 + (fx1 - fx0) * c; lock(true, fy, cx - lw / 2, cx + lw / 2, -1, t); }
  // the double sides: inner strips between the front (two layers) and the back
  const sy0 = 2 * t, sy1 = d - t;
  panels.push({ key: 'fold', fold: true, x: -h - ih, y: sy0, w: ih, h: sy1 - sy0 }, { key: 'fold', fold: true, x: w + h, y: sy0, w: ih, h: sy1 - sy0 });
  for (const c of [.25, .75]) {
    const lw = lockW(d), cy = sy0 + (sy1 - sy0) * c;
    lock(false, -h - ih, cy - lw / 2, cy + lw / 2, -1, t); lock(false, w + h + ih, cy - lw / 2, cy + lw / 2, 1, w - t);
  }
  // anchor flaps at the ends of the front and back walls
  for (const [wall, y0, y1] of [['front', -h + top, -gap], ['back', d + gap, d + h - top]]) {
    cornerTabs(tabs, wall, 0, y0, y1, -1, aw, ach, ''); cornerTabs(tabs, wall, w, y0, y1, 1, aw, ach, '');
  }
  // the lid off the back wall's top edge, its double tuck flap and the dust ears
  const [lw, th] = faceMM(o, 'top'), lx = (w - lw) / 2, ly = d + h;
  panels.push({ key: 'top', x: lx, y: ly, w: lw, h: th, q: 0 });
  const [fw, fh] = faceMM(o, 'flap'), flx = lx + (lw - fw) / 2, fly = ly + th;
  panels.push({ key: 'flap', x: flx, y: fly, w: fw, h: fh, q: 0 }, { key: 'fold', fold: true, joins: ['flap'], x: flx + t, y: fly + fh, w: fw - 2 * t, h: Math.max(1, fh - t) });
  const el = clamp(d * .3, 6, Math.max(6, d - 2 * t)), ech = Math.min(fh, el) * .3;
  cornerTabs(tabs, 'flap', flx, fly + gap, fly + fh - top, -1, el, ech, ''); cornerTabs(tabs, 'flap', flx + fw, fly + gap, fly + fh - top, 1, el, ech, '');
  const n = toOrigin({ v: 2, mailer: true, panels, tabs, slots });
  // the slots are cut through the bottom
  n.panels[0].holes = n.slots;
  delete n.slots;
  return n;
}

/* moves a sheet so it starts at 0, 0 and measures it (a panel cut to an outline by its outline) */
function toOrigin(n) {
  const { panels, tabs } = n, pts = [...panels.flatMap(p => p.poly || [[p.x, p.y], [p.x + p.w, p.y + p.h]]), ...tabs.flatMap(t => t.pts)];
  const xs = pts.map(v => v[0]), ys = pts.map(v => v[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), mv = ([x, y]) => [x - x0, y - y0];
  for (const p of panels) { p.x -= x0; p.y -= y0; if (p.poly) p.poly = p.poly.map(mv); if (p.ly != null) p.ly -= y0; }
  for (const tb of tabs) { tb.pts = tb.pts.map(mv); if (tb.glue) tb.glue = tb.glue.map(mv); if (tb.creases) tb.creases = tb.creases.map(([a, b, c, e]) => [a - x0, b - y0, c - x0, e - y0]); }
  if (n.slots) n.slots = n.slots.map(q => q.map(mv));
  return Object.assign(n, { W: Math.max(...xs) - x0, H: Math.max(...ys) - y0 });
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
    if (!hor && !ver) { cuts.push([...a, ...b]); return; }
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

export { NET_V, boxNet, cornerTabs, dieLines, netPoint, toOrigin };
