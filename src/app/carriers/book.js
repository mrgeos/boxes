// Коробка-книжка на магните: жёсткий переплёт (дно, корешок, крышка, клапан на магнитах) и оклеенный лоток внутри
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';
import { turnIn } from './rigid.js';

/* A rigid book box: grey board wrapped in printed paper. The case is one wrap over four boards: the bottom, the
   spine (the back), the lid and the front flap that comes down over the tray's front and holds with magnets hidden
   in it. The tray is glued on the bottom against the spine; its sides show between the case's boards (they carry
   `left`, `right`), its front `trayFront` is seen with the lid open. Every edge is wrapped, so it is the paper's
   colour. Lengths mm; o.dims is the closed box outside. */
const bookT = o => clamp(o.thickness, 1, Math.min(o.dims.w, o.dims.h, o.dims.d) / 8);
/* the collapsible one (o.bookFlat): the tray's walls are boards hinged on the bottom inside the same wrap, flush with
   its sides; the bottom stops where the front wall stands, the flap comes down in front of both; the side walls stand between
   the spine and the front wall (their ears stick inside those) and the spine is the tray's back. bd: the bottom's depth,
   sd: the side walls' */
function bookDims(o) {
  const { w, h, d } = o.dims, t = bookT(o), ov = o.bookFlat ? 0 : clamp(Math.min(w, d) * .01, 1, 3);
  return { t, ov, tw: w - 2 * ov, td: d - 2 * t - ov, th: h - 2 * t, bd: o.bookFlat ? d - t : d, sd: o.bookFlat ? d - 3 * t : d - 2 * t - ov };
}
function buildBook(o, rt, { add }) {
  const B = bookDims(o), W = o.dims.w * S, H = o.dims.h * S, D = o.dims.d * S, T = B.t * S, P = Math.PI, g = rt.group, F = k => rt.faces[k].mat;
  const wrap = rt.foldMat;
  // a board: its outer face, inner face, wrapped edges (sizes in scene units, centred)
  const board = (parent, w, h, outer, inner, pos, rot, data, edges = [1, 1, 1, 1]) => {
    const b = new THREE.Group(); b.position.set(...pos); b.rotation.set(...rot); parent.add(b);
    add(b, w, h, outer, [0, 0, T / 2], [0, 0, 0], data);
    // the lid's inside is printed (as seen from below, the front up); the other boards' insides are plain
    if (inner === F('inside')) add(b, w, h, inner, [0, 0, -T / 2], [0, P, P], { face: 'inside' });
    else add(b, w, h, inner, [0, 0, -T / 2], [0, P, 0], { face: 'inside', wall: true });
    if (edges[0]) add(b, w, T, wrap, [0, h / 2, 0], [-P / 2, 0, 0]);
    if (edges[1]) add(b, w, T, wrap, [0, -h / 2, 0], [P / 2, 0, 0]);
    for (const sx of [-1, 1]) if (edges[sx < 0 ? 2 : 3]) add(b, T, h, wrap, [sx * w / 2, 0, 0], [0, sx * P / 2, 0]);
    return b;
  };
  // the case: bottom and spine stay, the lid and the flap swing on the spine's top edge
  const bd = B.bd * S;
  board(g, W, bd, F('bottom'), rt.innerMat, [0, T / 2, -(D - bd) / 2], [P / 2, 0, 0], { face: 'bottom' });
  board(g, W, H, F('back'), rt.innerMat, [0, H / 2, -D / 2 + T / 2], [0, P, 0], { face: 'back' }, [1, 0, 1, 1]);
  const pivot = new THREE.Group(); pivot.position.set(0, H, -D / 2); g.add(pivot); rt.lidPivot = pivot; rt.lidGroup = null; rt.contact = [];
  board(pivot, W, D, F('top'), F('inside'), [0, -T / 2, D / 2], [-P / 2, 0, 0], { face: 'top' }, [0, 1, 1, 1]);
  board(pivot, W, H - T, F('front'), rt.innerMat, [0, -T - (H - T) / 2, D - T / 2], [0, 0, 0], { face: 'front' }, [0, 1, 1, 1]);
  // the tray: wrapped walls on the bottom, against the spine
  // (the collapsible one has no back wall of its own: the spine's inside is the tray's back)
  const flat = !!o.bookFlat, tw = B.tw * S, td = B.td * S, th = B.th * S, sd = B.sd * S, z0 = -D / 2 + T, y0 = T, tt = T;
  const zb = flat ? z0 : z0 + tt, zf = z0 + td - tt, zc = (zb + zf) / 2, zs = flat ? z0 + sd / 2 : z0 + td / 2;
  add(g, tw, th, F('trayFront'), [0, y0 + th / 2, z0 + td], [0, 0, 0], { face: 'trayFront' });
  add(g, sd, th, F('right'), [tw / 2, y0 + th / 2, zs], [0, P / 2, 0], { face: 'right' });
  add(g, sd, th, F('left'), [-tw / 2, y0 + th / 2, zs], [0, -P / 2, 0], { face: 'left' });
  const iw = tw - 2 * tt, idp = zf - zb;
  add(g, iw, th - tt, rt.innerMat, [0, y0 + tt + (th - tt) / 2, zf], [0, P, 0], { face: 'inside', wall: true });
  if (!flat) add(g, iw, th - tt, rt.innerMat, [0, y0 + tt + (th - tt) / 2, zb], [0, 0, 0], { face: 'inside', wall: true });
  for (const sx of [-1, 1]) add(g, idp, th - tt, rt.innerMat, [sx * (tw / 2 - tt), y0 + tt + (th - tt) / 2, zc], [0, -sx * P / 2, 0], { face: 'inside', wall: true });
  add(g, iw, idp, F('insideBottom'), [0, y0 + tt, zc], [-P / 2, 0, 0], { face: 'insideBottom' });
  turnIn(add, g, { ax: iw / 2, az: idp / 2, cz: zc, y: y0 + th, dep: Math.min(12, th / S * .5) * S, mat: wrap });
  // the wrapped rim of the tray
  add(g, tw, tt, wrap, [0, y0 + th, z0 + td - tt / 2], [-P / 2, 0, 0], { support: 'rimFront' });
  if (!flat) add(g, tw, tt, wrap, [0, y0 + th, z0 + tt / 2], [-P / 2, 0, 0], { support: 'rimBack' });
  for (const sx of [-1, 1]) add(g, tt, idp, wrap, [sx * (tw / 2 - tt / 2), y0 + th, zc], [-P / 2, 0, 0], { support: sx > 0 ? 'rimRight' : 'rimLeft' });
}

/* the wraps as they are cut: the case's paper (bottom, spine, lid, flap in a strip, gaps at the hinges, turn-ins round
   it) and the tray's paper (a cross: its walls round the bottom, turn-ins over the rim, corner flaps) */
function bookNet(o) {
  const { w, h, d } = o.dims, B = bookDims(o), t = B.t, m = 15, hg = 2 * t + 1, panels = [], tabs = [];
  // the case, top to bottom: bottom, spine (upside down), lid, flap
  let y = m;
  const strip = [['bottom', d, 0], ['back', h, 2], ['top', d, 0], ['front', h - t, 0]];
  strip.forEach(([key, len, q], i) => {
    panels.push({ key, x: m, y, w, h: len, q });
    if (i < strip.length - 1) panels.push({ key: 'fold', fold: true, x: m, y: y + len, w, h: hg });
    y += len + (i < strip.length - 1 ? hg : 0);
  });
  const caseH = y + m;
  panels.push({ key: 'fold', fold: true, x: m, y: 0, w, h: m }, { key: 'fold', fold: true, x: m, y: y, w, h: m },
    { key: 'fold', fold: true, x: 0, y: m, w: m, h: y - m }, { key: 'fold', fold: true, x: m + w, y: m, w: m, h: y - m });
  // the tray, to the right: its bottom (not printed, glued down), walls round it, the turn-ins beyond
  const { tw, td, th } = B, x0 = w + 2 * m + 20 + th + m, y0 = th + m, ti = Math.min(12, th * .5);
  panels.push({ key: 'tbottom', blank: 'дно лотка', fs: 5, x: x0, y: y0, w: tw, h: td },
    { key: 'trayFront', x: x0, y: y0 - th, w: tw, h: th, q: 0 }, { key: 'tback', blank: 'зад лотка', fs: 5, x: x0, y: y0 + td, w: tw, h: th },
    { key: 'left', x: x0 - th, y: y0, w: th, h: td, q: 3 }, { key: 'right', x: x0 + tw, y: y0, w: th, h: td, q: 1 },
    { key: 'fold', fold: true, x: x0, y: y0 + td + th, w: tw, h: ti }, { key: 'fold', fold: true, x: x0, y: y0 - th - ti, w: tw, h: ti },
    { key: 'fold', fold: true, x: x0 - th - ti, y: y0, w: ti, h: td }, { key: 'fold', fold: true, x: x0 + tw + th, y: y0, w: ti, h: td });
  // corner flaps of the front and back walls, round the corners onto the sides
  const cw = Math.min(15, th * .6);
  for (const [on, ya, yb] of [['tback', y0 + td, y0 + td + th], ['trayFront', y0 - th, y0]])
    for (const [x, s] of [[x0, -1], [x0 + tw, 1]]) tabs.push({ on, pts: [[x, ya + 1], [x + s * cw, ya + 3], [x + s * cw, yb - 3], [x, yb - 1]] });
  const all = [...panels.flatMap(p => [[p.x, p.y], [p.x + p.w, p.y + p.h]]), ...tabs.flatMap(tb => tb.pts)];
  const xm = Math.min(...all.map(v => v[0])), ym = Math.min(...all.map(v => v[1]));
  for (const p of panels) { p.x -= xm; p.y -= ym; }
  for (const tb of tabs) tb.pts = tb.pts.map(([a, b]) => [a - xm, b - ym]);
  return { v: 2, book: true, W: Math.max(...all.map(v => v[0])) - xm, H: Math.max(caseH, ...all.map(v => v[1])) - ym, panels, tabs };
}

/* the collapsible one: one wrap. The bottom in the middle, the tray's front wall above it, its sides beside it (hinge gaps
   between the boards), then down from the bottom the spine (upside down), the lid and the flap as in bookNet. The side walls'
   ears carry double-sided tape and stick inside the front wall and the spine; the spine's side turn-ins start past them. */
// a hinge gap is named by what turns on it (the assembly's steps); its value is the rank it closes at
const HINGE = { 1: 'hingeWalls', 3: 'hingeBack', 4: 'hingeLid', 5: 'hingeFlap' };
function bookFlatNet(o) {
  const { w, h, d } = o.dims, B = bookDims(o), { t, th, bd } = B, m = 15, hg = 2 * t + 1, ti = Math.min(12, th * .5), panels = [], tabs = [];
  const { sd } = B, fold = (x, y, fw, fh, gap) => panels.push({ key: gap ? HINGE[gap] : 'fold', fold: true, x, y, w: fw, h: fh, ...(gap ? { gap } : {}) });
  // the case strip, the bottom's front edge at y = 0
  let y = 0;
  const strip = [['bottom', bd, 0], ['back', h, 2], ['top', d, 0], ['front', h - t, 0]];
  strip.forEach(([key, len, q], i) => {
    panels.push({ key, x: 0, y, w, h: len, q });
    if (i < strip.length - 1) fold(0, y + len, w, hg, i + 3);
    y += len + (i < strip.length - 1 ? hg : 0);
  });
  // the walls (the sides from the front wall's inside, t in from the bottom's front edge): hinge gap, wall, turn-in over its top
  panels.push({ key: 'trayFront', x: 0, y: -hg - th, w, h: th, q: 0 }, { key: 'left', x: -hg - th, y: t, w: th, h: sd, q: 3 }, { key: 'right', x: w + hg, y: t, w: th, h: sd, q: 1 });
  fold(0, -hg, w, hg, 1); fold(-hg, t, hg, sd, 1); fold(w, t, hg, sd, 1);
  fold(0, -hg - th - ti, w, ti); fold(-hg - th - ti, t, ti, sd); fold(w + hg + th, t, ti, sd);
  // the ears: off both ends of each side wall, 2 mm in from the wall's edges, tapering
  const ew = clamp(th * .6, 6, 25), ea = Math.min(2, th / 4), ta = Math.min(3, th / 4);
  for (const [on, xl] of [['left', -hg - th], ['right', w + hg]])
    for (const [ye, s] of [[t, -1], [t + sd, 1]])
      tabs.push({ on, kind: 'glue', label: 'скотч', pts: [[xl + ea, ye], [xl + ea + ta, ye + s * ew], [xl + th - ea - ta, ye + s * ew], [xl + th - ea, ye]] });
  // the turn-ins along the spine (past the back ears), the lid and the flap, and past the flap's end
  const y0 = t + sd + ew + 1;
  for (const p of panels.filter(q => ['back', 'top', 'front'].includes(q.key))) { const ya = Math.max(p.y, y0); fold(-m, ya, m, p.y + p.h - ya); fold(w, ya, m, p.y + p.h - ya); }
  fold(0, y, w, m);
  const all = [...panels.flatMap(p => [[p.x, p.y], [p.x + p.w, p.y + p.h]]), ...tabs.flatMap(tb => tb.pts)];
  const xm = Math.min(...all.map(v => v[0])), ym = Math.min(...all.map(v => v[1]));
  for (const p of panels) { p.x -= xm; p.y -= ym; }
  for (const tb of tabs) tb.pts = tb.pts.map(([a, c]) => [a - xm, c - ym]);
  return { v: 2, book: true, bookFlat: true, W: Math.max(...all.map(v => v[0])) - xm, H: Math.max(...all.map(v => v[1])) - ym, panels, tabs };
}

/* the collapsible one folds from the flat cross: the walls stand up (rank 1), their ears turn in (2), the spine rises (3), the lid
   comes over (4), the flap down (5). A board after a hinge gap goes on straight and slides back over the gap to where its board
   stands (on the bottom's board for the walls, on the floor for the spine, from the back edge for the lid, under the lid
   for the flap). The turn-ins were glued
   down when the blank was made. */
const bookFold = {
  T: o => bookT(o),
  roots: ps => [ps.findIndex(p => p.key === 'bottom')],
  // the bottom stops short of the front by the flap's thickness
  rootAt: o => [0, -(o.dims.d - bookDims(o).bd) / 2],
  hinge(par, ch, T) {
    const hg = 2 * T + 1;
    if (ch.key === 'tab') return { ang: 90, a: 0, rank: 2 };
    if (ch.gap) return { ang: 90, a: 0, rank: ch.gap };
    if (ch.key === 'fold') return { ang: 180, from: 180, a: T, rank: 1 };
    return { ang: 0, a: 0, d: ch.key === 'back' || ch.key === 'top' ? hg : hg - T, rank: par.gap ?? 1 };
  },
};

export { bookDims, bookFlatNet, bookFold, bookNet, buildBook };
