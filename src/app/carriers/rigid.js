// Жёсткие коробки: шкатулка с крышкой на петлях и коробка с выдвижным ящиком (футляр и ящик с ленточкой)
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';

/* Grey board wrapped in printed paper, every edge wrapped (the paper's colour).
   Casket: a base and a lid of the same footprint that meet at a split line, the lid (lidH high, with its own walls)
   on two small hinges at the back; inside lined with velvet (o.lining, '' — the printed paper).
   Drawer box: a case (top, bottom, sides, closed back) and a drawer that slides out of its front (o.lid: how far);
   the drawer's front is the face `front`, a ribbon pull on it. Lengths mm. */
const rigidT = o => clamp(o.thickness, 1, Math.min(o.dims.w, o.dims.h, o.dims.d) / 8);
const casketLidH = o => clamp(o.lidH ?? o.dims.h * .35, 5, o.dims.h - 5);
const LININGS = [['#5b1a2a', 'Бордовый бархат'], ['#1b2340', 'Синий бархат'], ['#1c1c1e', 'Чёрный бархат'], ['#e9e2d6', 'Молочный бархат']];
function velvet(rt, o) {
  rt.velvetMat ??= new THREE.MeshPhysicalMaterial({ roughness: .95, sheen: 1, sheenRoughness: .45, side: THREE.DoubleSide });
  rt.velvetMat.color.set(o.lining || '#5b1a2a'); rt.velvetMat.sheenColor.set(o.lining || '#5b1a2a').offsetHSL(0, -.1, .25);
  return rt.velvetMat;
}
/* walls of a rigid shell: outer faces, inner faces offset by T, wrapped rim at the top (y0..y0+h, footprint W × D) */
function shell(add, parent, { W, D, T, y0, h, faces, inner, rim, rimY, floor }) {
  const P = Math.PI, ym = y0 + h / 2;
  add(parent, W, h, faces.front, [0, ym, D / 2], [0, 0, 0], faces.frontD);
  add(parent, W, h, faces.back, [0, ym, -D / 2], [0, P, 0], faces.backD);
  add(parent, D, h, faces.right, [W / 2, ym, 0], [0, P / 2, 0], faces.rightD);
  add(parent, D, h, faces.left, [-W / 2, ym, 0], [0, -P / 2, 0], faces.leftD);
  const iw = W - 2 * T, id = D - 2 * T, wd = { face: 'inside', wall: true };
  add(parent, iw, h - (floor ? T : 0), inner, [0, ym + (floor ? T / 2 : 0), D / 2 - T], [0, P, 0], wd);
  add(parent, iw, h - (floor ? T : 0), inner, [0, ym + (floor ? T / 2 : 0), -D / 2 + T], [0, 0, 0], wd);
  for (const sx of [-1, 1]) add(parent, id, h - (floor ? T : 0), inner, [sx * (W / 2 - T), ym + (floor ? T / 2 : 0), 0], [0, -sx * P / 2, 0], wd);
  for (const sz of [-1, 1]) add(parent, W, T, rim, [0, rimY, sz * (D / 2 - T / 2)], [P / 2, 0, 0]);
  for (const sx of [-1, 1]) add(parent, T, D - 2 * T, rim, [sx * (W / 2 - T / 2), rimY, 0], [P / 2, 0, 0]);
}
function buildCasket(o, rt, { add }) {
  const W = o.dims.w * S, H = o.dims.h * S, D = o.dims.d * S, T = rigidT(o) * S, LH = casketLidH(o) * S, BH = H - LH, P = Math.PI, g = rt.group, F = k => rt.faces[k].mat;
  const lined = !!o.lining, lin = lined ? velvet(rt, o) : rt.innerMat;
  // the base, its floor lined
  add(g, W, D, F('bottom'), [0, 0, 0], [P / 2, 0, 0], { face: 'bottom' });
  shell(add, g, { W, D, T, y0: 0, h: BH, inner: lin, rim: rt.foldMat, rimY: BH, floor: true,
    faces: { front: F('front'), back: F('back'), right: F('right'), left: F('left'), frontD: { face: 'front' }, backD: { face: 'back' }, rightD: { face: 'right' }, leftD: { face: 'left' } } });
  add(g, W - 2 * T, D - 2 * T, lined ? lin : F('insideBottom'), [0, T, 0], [-P / 2, 0, 0], lined ? {} : { face: 'insideBottom' });
  // the lid on its hinges at the back
  const pivot = new THREE.Group(); pivot.position.set(0, BH, -D / 2); g.add(pivot); rt.lidPivot = pivot; rt.lidGroup = null; rt.contact = [];
  const lid = new THREE.Group(); lid.position.set(0, 0, D / 2); pivot.add(lid);
  add(lid, W, D, F('top'), [0, LH, 0], [-P / 2, 0, 0], { face: 'top' });
  shell(add, lid, { W, D, T, y0: 0, h: LH, inner: lin, rim: rt.foldMat, rimY: 0, floor: false,
    faces: { front: F('lidFront'), back: F('lidBack'), right: F('lidRight'), left: F('lidLeft'), frontD: { face: 'lidFront' }, backD: { face: 'lidBack' }, rightD: { face: 'lidRight' }, leftD: { face: 'lidLeft' } } });
  add(lid, W - 2 * T, D - 2 * T, lined ? lin : F('inside'), [0, LH - T, 0], [P / 2, 0, 0], lined ? {} : { face: 'inside' });
  // two small hinges
  for (const sx of [-1, 1]) {
    const hg = new THREE.Mesh(new THREE.CylinderGeometry(1.4 * S, 1.4 * S, Math.min(22, o.dims.w * .12) * S, 12), rt.metalMat);
    hg.rotation.z = P / 2; hg.position.set(sx * W * .3, BH, -D / 2 - .6 * S); hg.castShadow = true; hg.userData = { objId: o.id, face: null }; g.add(hg);
  }
}
/* the drawer's travel at o.lid: up to three quarters of the depth */
const drawerOut = o => clamp(o.lid / 125, 0, 1) * o.dims.d * .75;
function buildDrawerBox(o, rt, { add }) {
  const W = o.dims.w * S, H = o.dims.h * S, D = o.dims.d * S, T = rigidT(o) * S, P = Math.PI, g = rt.group, F = k => rt.faces[k].mat;
  // the case: top, bottom, sides and back; the front open, its edges wrapped
  add(g, W, D, F('top'), [0, H, 0], [-P / 2, 0, 0], { face: 'top' });
  add(g, W, D, F('bottom'), [0, 0, 0], [P / 2, 0, 0], { face: 'bottom' });
  add(g, D, H, F('right'), [W / 2, H / 2, 0], [0, P / 2, 0], { face: 'right' });
  add(g, D, H, F('left'), [-W / 2, H / 2, 0], [0, -P / 2, 0], { face: 'left' });
  add(g, W, H, F('back'), [0, H / 2, -D / 2], [0, P, 0], { face: 'back' });
  add(g, W - 2 * T, D - T, rt.innerMat, [0, H - T, T / 2], [P / 2, 0, 0], { face: 'inside', wall: true });
  add(g, W - 2 * T, D - T, rt.innerMat, [0, T, T / 2], [-P / 2, 0, 0], { face: 'inside', wall: true });
  for (const sx of [-1, 1]) add(g, D - T, H - 2 * T, rt.innerMat, [sx * (W / 2 - T), H / 2, T / 2], [0, -sx * P / 2, 0], { face: 'inside', wall: true });
  add(g, W, T, rt.foldMat, [0, H - T / 2, D / 2], [0, 0, 0]); add(g, W, T, rt.foldMat, [0, T / 2, D / 2], [0, 0, 0]);
  for (const sx of [-1, 1]) add(g, T, H - 2 * T, rt.foldMat, [sx * (W / 2 - T / 2), H / 2, D / 2], [0, 0, 0]);
  // the drawer: its front (the face `front`) flush with the case, a tray behind it
  const c = .3 * S, dw = W - 2 * T - 2 * c, dh = H - 2 * T - 2 * c, dd = D - T - c, dt = T * .8, dr = new THREE.Group(); g.add(dr); rt.drawer = dr;
  const y0 = T + c, zf = D / 2;
  add(dr, dw, dh, F('front'), [0, y0 + dh / 2, zf], [0, 0, 0], { face: 'front' });
  add(dr, dw, dh, rt.foldMat, [0, y0 + dh / 2, zf - dd], [0, P, 0]);
  for (const sx of [-1, 1]) add(dr, dd, dh, rt.foldMat, [sx * dw / 2, y0 + dh / 2, zf - dd / 2], [0, sx * P / 2, 0]);
  add(dr, dw, dd, rt.foldMat, [0, y0, zf - dd / 2], [P / 2, 0, 0]);
  const iw = dw - 2 * dt, idd = dd - 2 * dt, ih = dh - dt;
  add(dr, iw, idd, F('insideBottom'), [0, y0 + dt, zf - dd / 2], [-P / 2, 0, 0], { face: 'insideBottom' });
  add(dr, iw, ih, rt.innerMat, [0, y0 + dt + ih / 2, zf - dt], [0, P, 0], { face: 'inside', wall: true });
  add(dr, iw, ih, rt.innerMat, [0, y0 + dt + ih / 2, zf - dd + dt], [0, 0, 0], { face: 'inside', wall: true });
  for (const sx of [-1, 1]) add(dr, idd, ih, rt.innerMat, [sx * (dw / 2 - dt), y0 + dt + ih / 2, zf - dd / 2], [0, -sx * P / 2, 0], { face: 'inside', wall: true });
  add(dr, dw, dt, rt.foldMat, [0, y0 + dh, zf - dt / 2], [-P / 2, 0, 0], { support: 'rimFront' });
  add(dr, dw, dt, rt.foldMat, [0, y0 + dh, zf - dd + dt / 2], [-P / 2, 0, 0], { support: 'rimBack' });
  for (const sx of [-1, 1]) add(dr, dt, idd, rt.foldMat, [sx * (dw / 2 - dt / 2), y0 + dh, zf - dd / 2], [-P / 2, 0, 0], { support: sx > 0 ? 'rimRight' : 'rimLeft' });
  // the ribbon pull: a short loop out of the drawer's front
  if (o.pull !== 'none') {
    rt.pullMat ??= new THREE.MeshStandardMaterial({ roughness: .45, side: THREE.DoubleSide });
    rt.pullMat.color.set(o.pullColor || '#b8461b');
    const rw = Math.min(14, o.dims.w * .12) * S, rl = Math.min(18, o.dims.h * .35) * S;
    const loop = new THREE.Mesh(new THREE.CylinderGeometry(rl / 2, rl / 2, rw, 24, 1, true, 0, Math.PI), rt.pullMat);
    loop.rotation.set(0, 0, P / 2); loop.position.set(0, y0 + dh / 2, zf + .2 * S); loop.scale.set(1, 1, .45); loop.castShadow = true; loop.userData = { objId: o.id, face: null }; dr.add(loop);
  }
}

/* a wrapped piece: its middle panel, its walls round it (each with a turn-in over the rim), corner flaps on the
   front and back walls; keys: { mid, front, back, left, right } (a key or { blank }), sizes mm. Round a bottom the
   front wall is above it; round a lid's top (its picture's top is the back) the back wall is, every wall turned
   so that its top edge meets the top */
function wrapCross(panels, tabs, x0, y0, w, d, h, keys, lid = false) {
  const ti = Math.min(12, h * .5), cw = Math.min(15, h * .6), put = (k, p) => panels.push(typeof k === 'string' ? { key: k, ...p } : { key: k.key, blank: k.blank, fs: 5, ...p });
  put(keys.mid, { x: x0, y: y0, w, h: d, q: 0 });
  const [above, below] = lid ? [keys.back, keys.front] : [keys.front, keys.back];
  put(above, { x: x0, y: y0 - h, w, h, q: lid ? 2 : 0 }); put(below, { x: x0, y: y0 + d, w, h, q: lid ? 0 : 2 });
  put(keys.left, { x: x0 - h, y: y0, w: h, h: d, q: lid ? 1 : 3 }); put(keys.right, { x: x0 + w, y: y0, w: h, h: d, q: lid ? 3 : 1 });
  panels.push({ key: 'fold', fold: true, x: x0, y: y0 - h - ti, w, h: ti }, { key: 'fold', fold: true, x: x0, y: y0 + d + h, w, h: ti },
    { key: 'fold', fold: true, x: x0 - h - ti, y: y0, w: ti, h: d }, { key: 'fold', fold: true, x: x0 + w + h, y: y0, w: ti, h: d });
  const key = k => typeof k === 'string' ? k : k.key, fk = key(above), bk = key(below);
  for (const [on, ya, yb] of [[fk, y0 - h, y0], [bk, y0 + d, y0 + d + h]])
    for (const [x, s] of [[x0, -1], [x0 + w, 1]]) tabs.push({ on, pts: [[x, ya + 1], [x + s * cw, ya + 3], [x + s * cw, yb - 3], [x, yb - 1]] });
  return { x1: x0 + w + h + ti, y1: y0 + d + h + ti };
}
function normalize(panels, tabs, extra = {}) {
  const all = [...panels.flatMap(p => [[p.x, p.y], [p.x + p.w, p.y + p.h]]), ...tabs.flatMap(tb => tb.pts)];
  const xm = Math.min(...all.map(v => v[0])), ym = Math.min(...all.map(v => v[1]));
  for (const p of panels) { p.x -= xm; p.y -= ym; }
  for (const tb of tabs) tb.pts = tb.pts.map(([a, b]) => [a - xm, b - ym]);
  return { v: 2, W: Math.max(...all.map(v => v[0])) - xm, H: Math.max(...all.map(v => v[1])) - ym, panels, tabs, ...extra };
}
/* the casket's papers: the base's (bottom in the middle, walls round it) and the lid's (top in the middle) */
function casketNet(o) {
  const { w, h, d } = o.dims, lh = casketLidH(o), panels = [], tabs = [];
  const a = wrapCross(panels, tabs, 0, 0, w, d, h - lh, { mid: 'bottom', front: 'front', back: 'back', left: 'left', right: 'right' });
  wrapCross(panels, tabs, a.x1 + 20 + lh + 12, 0, w, d, lh, { mid: 'top', front: 'lidFront', back: 'lidBack', left: 'lidLeft', right: 'lidRight' }, true);
  return normalize(panels, tabs, { rigid: 'casket' });
}
/* the drawer box's papers: the case as a band (left side, top, right side, bottom) with a glue flap, its back, and
   the drawer (its front in the middle row of a cross whose other walls are plain) */
function drawerNet(o) {
  const { w, h, d } = o.dims, t = rigidT(o), panels = [], tabs = [], ti = 12;
  let x = 0;
  for (const [key, len, q] of [['left', h, 1], ['top', w, 0], ['right', h, 3], ['bottom', w, 2]]) { panels.push({ key, x, y: ti, w: len, h: d, q }); x += len; }
  tabs.push({ on: 'bottom', pts: [[x, ti + 2], [x + 15, ti + 6], [x + 15, ti + d - 6], [x, ti + d - 2]] });
  panels.push({ key: 'fold', fold: true, x: 0, y: 0, w: x, h: ti }, { key: 'fold', fold: true, x: 0, y: ti + d, w: x, h: ti });
  panels.push({ key: 'back', x: x + 30, y: ti, w, h, q: 0 });
  const dw = w - 2 * t - .6, dh = h - 2 * t - .6, dd = d - t - .3;
  wrapCross(panels, tabs, dh + ti + 10, ti + d + ti + 20 + dh + ti, dw, dd, dh, { mid: { key: 'dbottom', blank: 'дно ящика' }, front: 'front', back: { key: 'dback', blank: 'зад ящика' }, left: { key: 'dleft', blank: 'бок' }, right: { key: 'dright', blank: 'бок' } });
  return normalize(panels, tabs, { rigid: 'drawer' });
}

export { LININGS, buildCasket, buildDrawerBox, casketLidH, casketNet, drawerNet, drawerOut, rigidT };
