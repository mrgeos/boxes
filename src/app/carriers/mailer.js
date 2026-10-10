// Мейлер FEFCO 0427: самосборная коробка из одной заготовки — двойные борта с ушками, крышка с клапаном внутрь
import * as THREE from 'three';
import { S, V2, clamp } from '../core/util.js';
import { planeGeo, planeGeoHole, ribbonGeo, rrectPts } from '../scene/geometry.js';
import { winMM } from './box.js';

/* FEFCO 0427, the folding mailer: one blank, no glue. The bottom is in the middle. The side walls are double: the
   outer wall rises from the bottom, rolls over at the top and comes down inside, its locks going into slots in the
   bottom; the ears of the front and back walls are held between the two layers. The front wall is double too
   (rolled in, locked into the bottom). The back wall is single and carries the lid. The lid's front edge is rolled
   under, and the tuck flap goes down inside the front wall, its dust ears inside the side walls.
   Lengths in mm; the outside of the box is o.dims. */
function mailerDims(o) {
  const { w, h, d } = o.dims, t = clamp(o.thickness, .3, Math.min(w, h, d) / 8);
  const wf = 2 * t + .3, ws = 3 * t + .3, wb = t;
  const fh = clamp(o.flapH, 3, h - 2 * t), fw = w - 2 * ws - 1;
  const el = clamp(Math.min(d * .4, 90), 5, Math.max(5, d / 2 - wf));   // the ears of the front and back walls
  const dl = clamp(Math.min(d * .3, 60), 5, d - wf - wb - 4);   // the dust ears of the tuck flap
  return { t, wf, ws, wb, fh, fw, el, dl };
}
function buildMailer(o, rt, { addG, add }) {
  const M = mailerDims(o), W = o.dims.w * S, H = o.dims.h * S, D = o.dims.d * S, T = M.t * S, P = Math.PI, g = rt.group;
  const WF = M.wf * S, WS = M.ws * S, WB = M.wb * S, F = k => rt.faces[k].mat;
  // inside: the rolled walls show the board's outer side, the back wall its inner side
  const ih = H - T, iy = (H + T) / 2, iw = W - 2 * WS, sd = D - WB - T, sz = (WB - T) / 2;
  add(g, iw, ih, rt.foldMat, [0, iy, D / 2 - WF], [0, P, 0], { face: 'inside', wall: true });
  add(g, iw, ih, rt.innerMat, [0, iy, -D / 2 + WB], [0, 0, 0], { face: 'inside', wall: true });
  for (const sx of [-1, 1]) add(g, sd, ih, rt.foldMat, [sx * (W / 2 - WS), iy, sz], [0, -sx * P / 2, 0], { face: 'inside', wall: true });
  add(g, iw, D - WF - WB, F('insideBottom'), [0, T, (WB - WF) / 2], [-P / 2, 0, 0], { face: 'insideBottom' });
  // the rolled tops of the walls and the crease of the lid
  add(g, iw, WF, rt.foldMat, [0, H, D / 2 - WF / 2], [-P / 2, 0, 0], { support: 'rimFront' });
  add(g, iw, WB, rt.foldMat, [0, H, -D / 2 + WB / 2], [-P / 2, 0, 0], { support: 'rimBack' });
  for (const sx of [-1, 1]) add(g, WS, D, rt.foldMat, [sx * (W / 2 - WS / 2), H, 0], [-P / 2, 0, 0], { support: sx > 0 ? 'rimRight' : 'rimLeft' });
  // the lid, hinged at the top of the back wall
  const pivot = new THREE.Group(); pivot.position.set(0, H, -D / 2); g.add(pivot); rt.lidPivot = pivot; rt.lidGroup = null; rt.contact = [];
  const win = winMM(o), hole = win && [rrectPts(0, -win.off * S, win.ww * S, win.wd * S, win.r * S)], holeIn = hole && hole.map(q => q.map(v => V2(v.x, -v.y)));
  addG(pivot, hole ? planeGeoHole(W, D, hole) : planeGeo(W, D), F('top'), [0, T, D / 2], [-P / 2, 0, 0], { face: 'top' });
  addG(pivot, holeIn ? planeGeoHole(W, D, holeIn) : planeGeo(W, D), F('inside'), [0, 0, D / 2], [P / 2, 0, 0], { face: 'inside' });
  if (hole) {
    const loop = [...hole[0], hole[0][0]];
    addG(pivot, ribbonGeo(loop.map(v => [v.x, T, D / 2 - v.y]), loop.map(v => [v.x, 0, D / 2 - v.y])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
    const film = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(hole[0])), rt.filmMat);
    film.position.set(0, T / 2, D / 2); film.rotation.set(-P / 2, 0, 0); film.renderOrder = 2; film.raycast = () => {}; pivot.add(film);
  }
  // the rolled front edge, the hinge, the cut sides
  add(pivot, W, T, rt.foldMat, [0, T / 2, D], [0, 0, 0]);
  add(pivot, W, T, rt.foldMat, [0, T / 2, 0], [0, P, 0]);
  for (const sx of [-1, 1]) add(pivot, D, T, rt.edgeMat, [sx * W / 2, T / 2, D / 2], [0, sx * P / 2, 0]);
  // the tuck flap inside the front wall, its print toward the wall
  const FH = M.fh * S, FW = M.fw * S, z = D - WF, fp = new THREE.Group(); fp.position.set(0, 0, z); pivot.add(fp);
  add(fp, FW, FH, F('flap'), [0, -FH / 2, 0], [0, 0, 0], { face: 'flap' });
  add(fp, FW, FH, rt.innerMat, [0, -FH / 2, -T], [0, P, 0], { face: 'inside', wall: true });
  add(fp, FW, T, rt.edgeMat, [0, -FH, -T / 2], [P / 2, 0, 0]);
  // the dust ears: folded back from the flap's ends, inside the side walls
  const DL = M.dl * S, ch = Math.min(FH, DL) * .45;
  const ear = (sx, out) => {
    // the face toward +x is the shape as drawn turned a quarter; toward -x, its mirror turned the other way
    const n = out ? sx : -sx, pts = [V2(0, 0), V2(DL, 0), V2(DL, -FH + ch), V2(DL - ch, -FH), V2(0, -FH)].map(v => V2(v.x * n, v.y));
    addG(fp, new THREE.ShapeGeometry(new THREE.Shape(pts)), out ? rt.foldMat : rt.innerMat, [sx * (FW / 2 - (out ? 0 : T)), 0, -T / 2], [0, n * P / 2, 0]);
  };
  for (const sx of [-1, 1]) { ear(sx, true); ear(sx, false); add(fp, T, DL - ch, rt.edgeMat, [sx * (FW / 2 - T / 2), -FH, -T / 2 - (DL - ch) / 2], [P / 2, 0, 0]); }
}

/* the blank: the bottom in the middle (with the slots for the locks), the walls round it, each double wall rolled
   beyond its outer wall (the rim, the inner wall, the locks); the ears on the ends of the front and back walls; the
   lid off the back wall, its rolled front edge, the tuck flap and the flap's dust ears */
function mailerNet(o) {
  const { w, h, d } = o.dims, { t, wf, ws, fh, fw, el, dl } = mailerDims(o), panels = [];
  const ih = h - t, lk = 2 * t + 2, slot = t + .6, rect = (x, y, W, H) => [[x, y], [x + W, y], [x + W, y + H], [x, y + H]];
  const lockW = L => clamp(L * .16, 10, 40), at = L => [L * .25, L * .75];
  // slots in the bottom where the inner walls' locks go
  const fwl = lockW(w), sdl = lockW(d), holes = [];
  for (const c of at(w)) holes.push(rect(c - fwl / 2 - .5, wf - t - .3, fwl + 1, slot));
  for (const c of at(d)) { holes.push(rect(ws - t - .3, c - sdl / 2 - .5, slot, sdl + 1)); holes.push(rect(w - ws - .3, c - sdl / 2 - .5, slot, sdl + 1)); }
  panels.push({ key: 'bottom', x: 0, y: 0, w, h: d, q: 0, holes });
  // the front wall, rolled in: rim, inner wall, locks
  panels.push({ key: 'front', x: 0, y: -h, w, h, q: 0 },
    { key: 'fold', fold: true, x: ws, y: -h - wf, w: w - 2 * ws, h: wf },
    { key: 'fold', fold: true, x: ws + .5, y: -h - wf - ih, w: w - 2 * ws - 1, h: ih });
  for (const c of at(w)) panels.push({ key: 'lock', fold: true, joins: ['fold'], x: c - fwl / 2, y: -h - wf - ih - lk, w: fwl, h: lk, poly: [[c - fwl / 2 + 1, -h - wf - ih - lk], [c + fwl / 2 - 1, -h - wf - ih - lk], [c + fwl / 2, -h - wf - ih], [c - fwl / 2, -h - wf - ih]] });
  // the back wall and its lid
  panels.push({ key: 'back', x: 0, y: d, w, h, q: 2 });
  const ly = d + h;
  panels.push({ key: 'top', x: 0, y: ly, w, h: d, q: 0 }, { key: 'fold', fold: true, x: 0, y: ly + d, w, h: wf });
  const fx = (w - fw) / 2, fy = ly + d + wf, c = Math.min(fh * .35, 8);
  panels.push({ key: 'flap', x: fx, y: fy, w: fw, h: fh, q: 0, poly: [[fx, fy], [fx + fw, fy], [fx + fw, fy + fh - c], [fx + fw - c, fy + fh], [fx + c, fy + fh], [fx, fy + fh - c]] });
  const dc = Math.min(fh, dl) * .45;
  panels.push({ key: 'dust', blank: 'ушко', fs: 4, joins: ['flap'], x: fx - dl, y: fy, w: dl, h: fh, poly: [[fx - dl, fy], [fx, fy], [fx, fy + fh], [fx - dl + dc, fy + fh], [fx - dl, fy + fh - dc]] },
    { key: 'dust', blank: 'ушко', fs: 4, joins: ['flap'], x: fx + fw, y: fy, w: dl, h: fh, poly: [[fx + fw, fy], [fx + fw + dl, fy], [fx + fw + dl, fy + fh - dc], [fx + fw + dl - dc, fy + fh], [fx + fw, fy + fh]] });
  // the ears of the front and back walls, folded into the side walls
  const eh = h - t - 1, ec = Math.min(el, eh) * .35;
  for (const [on, y0] of [['front', -h + t + .5], ['back', d + .5]]) {
    const Y = y0 + eh, top = on === 'front';
    // the chamfer on the corner away from the bottom
    const cy = top ? y0 : Y, oy = top ? Y : y0, k = top ? 1 : -1;
    panels.push({ key: 'ear', blank: 'ушко', fs: 4, joins: [on], x: -el, y: y0, w: el, h: eh, poly: [[0, oy], [-el, oy], [-el, cy + k * ec], [-el + ec, cy], [0, cy]] },
      { key: 'ear', blank: 'ушко', fs: 4, joins: [on], x: w, y: y0, w: el, h: eh, poly: [[w, oy], [w + el, oy], [w + el, cy + k * ec], [w + el - ec, cy], [w, cy]] });
  }
  // the side walls, rolled in: rim, inner wall, locks
  for (const [key, sx] of [['left', -1], ['right', 1]]) {
    const x = sx < 0 ? -h : w, rim = sx < 0 ? -h - ws : w + h, inn = sx < 0 ? -h - ws - ih : w + h + ws, lx = sx < 0 ? inn - lk : inn + ih;
    panels.push({ key, x, y: 0, w: h, h: d, q: sx < 0 ? 3 : 1 },
      { key: 'fold', fold: true, x: rim, y: 0, w: ws, h: d }, { key: 'fold', fold: true, x: inn, y: t + .5, w: ih, h: d - 2 * t - 1 });
    for (const cc of at(d)) {
      const e = sx < 0 ? lx : lx + lk, b = sx < 0 ? lx + lk : lx;
      panels.push({ key: 'lock', fold: true, joins: ['fold'], x: lx, y: cc - sdl / 2, w: lk, h: sdl, poly: [[b, cc - sdl / 2], [e, cc - sdl / 2 + 1], [e, cc + sdl / 2 - 1], [b, cc + sdl / 2]] });
    }
  }
  // everything moved so the sheet starts at 0, 0
  const all = panels.flatMap(p => p.poly || rect(p.x, p.y, p.w, p.h)), x0 = Math.min(...all.map(v => v[0])), y0 = Math.min(...all.map(v => v[1]));
  const mv = ([x, y]) => [x - x0, y - y0];
  for (const p of panels) { p.x -= x0; p.y -= y0; if (p.poly) p.poly = p.poly.map(mv); if (p.holes) p.holes = p.holes.map(q => q.map(mv)); }
  return { v: 2, fefco: '0427', W: Math.max(...all.map(v => v[0])) - x0, H: Math.max(...all.map(v => v[1])) - y0, panels, tabs: [] };
}

export { buildMailer, mailerDims, mailerNet };
