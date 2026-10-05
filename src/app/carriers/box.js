// Коробка: основание, крышки (откидная, с клапаном, мейлер, крышка-дно, прозрачная), окно с плёнкой
import * as THREE from 'three';
import { DEG, S, V2, clamp, rrPoly, splitBand } from '../core/util.js';
import { clearLid, doubleWall, faceMM, netLayout, wallMM } from '../core/model.js';
import { contactMat } from '../scene/renderer.js';
import { notchPts, planeGeo, planeGeoHole, ribbonGeo, rrectPts } from '../scene/geometry.js';
import { bridgeMM, buildHandleBox, frontWinMM, joinWinMM } from './handle-box.js';
import { netPoint } from './box-net.js';

/* lid outline in mm: an outer-flap lid overhangs the base by the board thickness on the sides and front */
function lidDimsMM(o) {
  const { w, h, d } = o.dims, t = clamp(o.thickness, .3, Math.min(w, h, d) / 4), e = .3;
  const flap = o.lidType === 'flap';
  const wl = flap ? w + 2 * (t + e) : w, dl = flap ? d + t + e : d;
  const fh = clamp(o.flapH, 3, h);
  const el = flap && o.earsOn ? (o.earFull ? dl : clamp(o.earLen, 5, dl)) : 0;
  return { wl, dl, fh, el };
}
/* ---------- window cut-out (die-cut window with PET film over the lid/front edge) ---------- */
/* where the window can go: across the lid's front edge (onto the front wall, or onto the flap),
   or as a closed opening inside the lid */
function windowPlace(o) {
  const lt = o.lidType || 'flat';
  if (lt === 'none' || clearLid(o)) return null;
  if (lt === 'telescope' || lt === 'handle') return 'lid';
  const pl = o.window.place;
  if (pl === 'lid' || pl === 'back') return pl;
  return lt === 'flat' || lt === 'flap' ? 'edge' : 'lid';
}
function winMM(o) {
  if (o.type !== 'box' || !o.window?.on) return null;
  const place = windowPlace(o); if (!place) return null;
  const { h } = o.dims, t = o.thickness, wn = o.window, [lw, lh] = faceMM(o, 'top'), square = wn.corners === 'square';
  const ww = clamp(wn.w, 10, lw - 6);
  if (place === 'edge') {
    const flap = o.lidType === 'flap', fh = flap ? lidDimsMM(o).fh : 0;
    const wd = clamp(wn.d, 5, lh - 4);
    const wh = flap ? clamp(wn.h, 2, Math.max(2, fh - 2)) : clamp(wn.h, 2, Math.max(2, h - t - 2));
    // behind a flap the front wall is cut too, so the opening shows the inside
    const whFront = flap ? clamp(wh - t, 0, h - t - 2) : wh;
    const r = square ? 0 : clamp(wn.r, 0, Math.max(0, Math.min(ww / 2, wd, wh) - .5));
    return { place, ww, wd, wh, whFront, r, flap };
  }
  if (place === 'back') {
    // across the hinge: from the lid's back edge down the back wall
    const wd = clamp(wn.d, 5, lh - 4), wh = clamp(wn.h, 2, Math.max(2, h - t - 2));
    const r = square ? 0 : clamp(wn.r, 0, Math.max(0, Math.min(ww / 2, wd, wh) - .5));
    return { place, ww, wd, wh, r };
  }
  const wd = clamp(wn.d, 5, lh - 8), lim = Math.max(0, (lh - wd) / 2 - 4), off = clamp(wn.off || 0, -lim, lim);
  const r = square ? 0 : clamp(wn.r, 0, Math.max(0, Math.min(ww, wd) / 2 - .5));
  return { place, ww, wd, off, r };
}
function faceWindow(o, k) {
  const J = joinWinMM(o);
  if (J && k === 'front') { const [mw, mh] = faceMM(o, 'front'); return { x: (mw - J.ww) / 2 / mw, y: 0, w: J.ww / mw, h: (mh - J.yb) / mh, rr: [0, 0, 1, 1], r: J.r / mw, rmm: J.r }; }
  if (o.lidType === 'handle' && k === 'front') {
    const fwn = frontWinMM(o); if (!fwn) return null;
    return { x: (fwn.fw - fwn.ww) / 2 / fwn.fw, y: (fwn.fh - fwn.cy - fwn.wh / 2) / fwn.fh, w: fwn.ww / fwn.fw, h: fwn.wh / fwn.fh, rr: [1, 1, 1, 1], r: fwn.r / fwn.fw, rmm: fwn.r };
  }
  const win = winMM(o); if (!win) return null;
  const [mw, mh] = faceMM(o, k), x = (mw - win.ww) / 2 / mw, w = win.ww / mw, r = win.r / mw;
  if (win.place === 'edge') {
    if (k === 'front' && win.whFront > .5) return { x, y: 0, w, h: win.whFront / mh, rr: [0, 0, 1, 1], r };
    if (k === 'flap') return { x, y: 0, w, h: win.wh / mh, rr: [0, 0, 1, 1], r };
    if (k === 'top') return { x, y: 1 - win.wd / mh, w, h: win.wd / mh, rr: [1, 1, 0, 0], r };
    if (k === 'inside') return { x, y: 0, w, h: win.wd / mh, rr: [0, 0, 1, 1], r };
    return null;
  }
  if (win.place === 'back') {
    if (k === 'back') return { x, y: 0, w, h: win.wh / mh, rr: [0, 0, 1, 1], r };
    if (k === 'top') return { x, y: 0, w, h: win.wd / mh, rr: [0, 0, 1, 1], r };
    if (k === 'inside') return { x, y: 1 - win.wd / mh, w, h: win.wd / mh, rr: [1, 1, 0, 0], r };
    return null;
  }
  // inside the lid: the top canvas has the back at the top, the lid's inner side has the front at the top
  if (k !== 'top' && k !== 'inside') return null;
  const h = win.wd / mh, cy = .5 + (k === 'top' ? 1 : -1) * win.off / mh, fw = { x, y: cy - h / 2, w, h, rr: [1, 1, 1, 1], r };
  const bw = bridgeMM(o);
  if (bw > 0) {
    // the strip the handle stands on runs across the middle of the lid: two openings, in face fractions
    const pts = rrectPts(mw / 2, cy * mh, win.ww, win.wd, win.r);
    fw.polys = splitBand(pts, mh / 2, bw / 2).map(q => q.map(v => ({ x: v.x / mw, y: v.y / mh })));
  }
  if (J) {
    // the front part of the lid opening runs out over the front edge into the front window
    // (top canvas: front at the bottom; the lid's inner side: front at the top)
    const fy = k === 'top' ? y => y : y => mh - y, x0 = (mw - J.ww) / 2;
    const front = rrPoly(x0, fy(mh - J.zBack), x0 + J.ww, fy(mh), J.rBack, 0).map(v => ({ x: v.x / mw, y: v.y / mh }));
    const keep = (fw.polys || []).filter(q => k === 'top' ? q.every(v => v.y < .5) : q.every(v => v.y > .5));
    Object.assign(fw, { polys: [front, ...keep], joinFront: true });
  }
  return fw;
}
function windowPath(c, fw, X, Y, sx, sy) {
  c.beginPath();
  if (fw.polys) for (const q of fw.polys) { q.forEach((v, i) => c[i ? 'lineTo' : 'moveTo'](X + v.x * sx, Y + v.y * sy)); c.closePath(); }
  else c.roundRect(X + fw.x * sx, Y + fw.y * sy, fw.w * sx, fw.h * sy, fw.rr.map(v => v * fw.r * sx));
}
/* the outline of a dieline window (rounded rectangle or polygons) as a canvas path, at scale k and offset pad */
function netWindowPath(c, q, pad, k) {
  c.beginPath();
  if (q.polys) for (const pl of q.polys) { pl.forEach((v, i) => c[i ? 'lineTo' : 'moveTo'](pad + v.x * k, pad + v.y * k)); c.closePath(); }
  else c.roundRect(pad + q.x * k, pad + q.y * k, q.w * k, q.h * k, q.radii.map(v => v * k));
}
/* window cut-outs in dieline mm; pieces that meet across a fold become one opening */
function netWindows(o, n = netLayout(o)) {
  const win = winMM(o); if (!win && !frontWinMM(o)) return [];
  const out = [], J = joinWinMM(o);
  if (J) {
    // one opening over the front edge: from the front wall's window bottom to its end on the lid
    const pf = n.panels.find(p => p.key === 'front'), pt = n.panels.find(p => p.key === 'top');
    const sy = (p, fy) => p.y + (p.rot ? 1 - fy : fy) * p.h, ya = sy(pf, (pf.h - J.yb) / pf.h), yb = sy(pt, (pt.h - J.zBack) / pt.h);
    const x0 = pf.x + (pf.w - J.ww) / 2, [y0, y1, r0, r1] = ya < yb ? [ya, yb, J.r, J.rBack] : [yb, ya, J.rBack, J.r];
    out.push({ x: x0, y: y0, w: J.ww, h: y1 - y0, rr: [1, 1, 1, 1], polys: [rrPoly(x0, y0, x0 + J.ww, y1, r0, r1)] });
  }
  for (const p of n.panels) {
    if (J && p.key === 'front') continue;
    let fw = faceWindow(o, p.key); if (!fw) continue;
    if (J && fw.joinFront) { if (fw.polys.length < 2) continue; fw = { ...fw, polys: fw.polys.slice(1) }; }
    // the face's window on the sheet, the panel turned by quarter turns: corners and radii go round with it
    const q = (((p.q ?? (p.rot ? 2 : 0)) % 4) + 4) % 4, [ax, ay] = netPoint(p, fw.x, fw.y), [bx, by] = netPoint(p, fw.x + fw.w, fw.y + fw.h);
    const rr = [0, 1, 2, 3].map(i => fw.rr[(i + 4 - q) % 4]);
    const polys = fw.polys?.map(pl => pl.map(v => { const [x, y] = netPoint(p, v.x, v.y); return { x, y }; }));
    out.push({ x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay), rr, polys, rmm: fw.rmm });
  }
  for (let i = 0; i < out.length; i++) for (let j = out.length - 1; j > i; j--) {
    let a = out[i], b = out[j]; if (b.y < a.y) [a, b] = [b, a];
    if (!a.polys && !b.polys && Math.abs(a.y + a.h - b.y) < .05 && Math.abs(a.x - b.x) < .05) {
      out[i] = { x: a.x, y: a.y, w: a.w, h: a.h + b.h, rr: [a.rr[0], a.rr[1], b.rr[2], b.rr[3]] }; out.splice(j, 1);
    }
  }
  return out.map(q => ({ ...q, radii: q.rr.map(v => v * (q.rmm ?? win.r)) }));
}
function cutNetWindow(c, o, pad, k) {
  const ws = netWindows(o); if (!ws.length) return;
  c.save(); c.globalCompositeOperation = 'destination-out';
  for (const q of ws) { netWindowPath(c, q, pad, k); c.fill(); }
  c.restore();
}
function buildBox(o, rt) {
  const W = o.dims.w * S, H = o.dims.h * S, D = o.dims.d * S;
  const T = clamp(o.thickness, .3, Math.min(o.dims.w, o.dims.h, o.dims.d) / 4) * S;
  const P = Math.PI, F = k => rt.faces[k].mat, g = rt.group;
  const addG = (parent, geo, mat, p, r, data = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p); m.rotation.set(...r); m.castShadow = m.receiveShadow = true;
    m.userData = { objId: o.id, face: null, ...data }; parent.add(m); return m;
  };
  const add = (parent, w, h, mat, p, r, data) => addG(parent, new THREE.PlaneGeometry(w, h), mat, p, r, data);
  const film = (parent, pts, p, r) => {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), rt.filmMat);
    m.position.set(...p); m.rotation.set(...r); m.renderOrder = 2; m.raycast = () => {}; parent.add(m);
  };
  if (o.lidType === 'handle') return buildHandleBox(o, rt, { addG, add, film });
  const win = winMM(o), edgeWin = win?.place === 'edge' ? win : null, lidWin = win?.place === 'lid' ? win : null, backWin = win?.place === 'back' ? win : null;
  const ww = win ? win.ww * S : 0, wd = win ? win.wd * S : 0, wr = win ? win.r * S : 0;
  const wfH = edgeWin ? edgeWin.whFront * S : 0, wfR = Math.min(wr, wfH * .999);
  // outer shell — orientation matches the cross-shaped dieline
  const frontNotch = wfH > 1e-4 ? notchPts(W, H, ww / 2, wfH, wfR, 'top') : null;
  addG(g, planeGeo(W, H, frontNotch, 'top'), F('front'), [0, H / 2, D / 2], [0, 0, 0], { face: 'front' });
  const wbH = backWin ? backWin.wh * S : 0, wbR = Math.min(wr, wbH * .999);
  const backNotch = wbH > 1e-4 ? notchPts(W, H, ww / 2, wbH, wbR, 'top') : null;
  addG(g, planeGeo(W, H, backNotch, 'top'), F('back'), [0, H / 2, -D / 2], [0, P, 0], { face: 'back' });
  // side walls overlap the front and back by a hair so no seam opens at the corners
  const seam = .06 * S;
  add(g, D + 2 * seam, H, F('right'), [W / 2, H / 2, 0], [0, P / 2, 0], { face: 'right' });
  add(g, D + 2 * seam, H, F('left'), [-W / 2, H / 2, 0], [0, -P / 2, 0], { face: 'left' });
  add(g, W, D, F('bottom'), [0, 0, 0], [P / 2, 0, 0], { face: 'bottom' });
  // inner walls & floor
  // inner walls & floor; a wall thicker than the board is a double wall folded in at the top,
  // so its inner face and the fold show the board's outer colour
  const WT = wallMM(o) * S, dbl = doubleWall(o), inMat = dbl ? rt.foldMat : rt.innerMat, rimMat = dbl ? rt.foldMat : rt.edgeMat;
  const ih = H - T, iy = (H + T) / 2;
  addG(g, planeGeo(W - 2 * WT, ih, frontNotch && notchPts(W - 2 * WT, ih, ww / 2, wfH, wfR, 'top'), 'top'), inMat, [0, iy, D / 2 - WT], [0, P, 0], { face: 'inside', wall: true });
  addG(g, planeGeo(W - 2 * WT, ih, backNotch && notchPts(W - 2 * WT, ih, ww / 2, wbH, wbR, 'top'), 'top'), inMat, [0, iy, -D / 2 + WT], [0, 0, 0], { face: 'inside', wall: true });
  add(g, D - 2 * WT, ih, inMat, [W / 2 - WT, iy, 0], [0, -P / 2, 0], { face: 'inside', wall: true });
  add(g, D - 2 * WT, ih, inMat, [-W / 2 + WT, iy, 0], [0, P / 2, 0], { face: 'inside', wall: true });
  add(g, W - 2 * WT, D - 2 * WT, F('insideBottom'), [0, T, 0], [-P / 2, 0, 0], { face: 'insideBottom' });
  // top edges of the walls (cut edge, or the fold of a double wall), split where a window runs through
  if (frontNotch) {
    const sw = (W - ww) / 2;
    for (const sx of [-1, 1]) add(g, sw, WT, rimMat, [sx * (ww / 2 + sw / 2), H, D / 2 - WT / 2], [-P / 2, 0, 0]);
    addG(g, ribbonGeo(frontNotch.map(p => [p.x, H / 2 + p.y, D / 2]), frontNotch.map(p => [p.x, H / 2 + p.y, D / 2 - WT])), rimMat, [0, 0, 0], [0, 0, 0]);
    if (!edgeWin.flap) film(g, frontNotch, [0, H / 2, D / 2 - WT / 2], [0, 0, 0]);   // behind a flap the film sits on the flap
  } else add(g, W, WT, rimMat, [0, H, D / 2 - WT / 2], [-P / 2, 0, 0], { support: 'rimFront' });
  if (backNotch) {
    const sw = (W - ww) / 2;
    for (const sx of [-1, 1]) add(g, sw, WT, rimMat, [sx * (ww / 2 + sw / 2), H, -D / 2 + WT / 2], [-P / 2, 0, 0]);
    addG(g, ribbonGeo(backNotch.map(p => [-p.x, H / 2 + p.y, -D / 2]), backNotch.map(p => [-p.x, H / 2 + p.y, -D / 2 + WT])), rimMat, [0, 0, 0], [0, 0, 0]);
    film(g, backNotch, [0, H / 2, -D / 2 + WT / 2], [0, P, 0]);
  } else add(g, W, WT, rimMat, [0, H, -D / 2 + WT / 2], [-P / 2, 0, 0], { support: 'rimBack' });
  add(g, WT, D - 2 * WT, rimMat, [W / 2 - WT / 2, H, 0], [-P / 2, 0, 0], { support: 'rimRight' });
  add(g, WT, D - 2 * WT, rimMat, [-W / 2 + WT / 2, H, 0], [-P / 2, 0, 0], { support: 'rimLeft' });
  rt.lidPivot = rt.lidGroup = null;
  const lt = o.lidType || 'flat', eps = .3 * S;
  if (lt === 'none') return;
  if (lt === 'telescope') {
    // separate lid: a shallow box that slides over the base walls
    if (clearLid(o)) {
      // clear PET lid: a thin transmissive shell, print sits on a transparent overlay just outside it.
      // A lid taller than the tray rests on the floor, a shorter one on the tray rim.
      // seated inside: the lid stands on the tray floor and the tray walls wrap around it
      const inside = o.lidFit === 'inside', G = .6 * S, TP = .3 * S, LH = clamp(o.lidH, 3, 1000) * S;
      const WL = inside ? W - 2 * (WT + G) : W + 2 * (G + TP), DL = inside ? D - 2 * (WT + G) : D + 2 * (G + TP);
      const top = inside ? T + LH : Math.max(H + TP, LH), lift = .05 * S;
      const lg = new THREE.Group(); lg.position.set(0, top, 0); g.add(lg); rt.lidGroup = lg; rt.lidBase = top;
      const part = (key, w, h, pos, rot, n) => {
        const shell = add(lg, w, h, rt.petMat, pos, rot); shell.castShadow = false; shell.raycast = () => {};
        const print = add(lg, w, h, F(key), pos.map((v, i) => v + n[i] * lift), rot, { face: key }); print.castShadow = false; print.renderOrder = 3;
      };
      part('top', WL, DL, [0, 0, 0], [-P / 2, 0, 0], [0, 1, 0]);
      part('lidFront', WL, LH, [0, -LH / 2, DL / 2], [0, 0, 0], [0, 0, 1]);
      part('lidBack', WL, LH, [0, -LH / 2, -DL / 2], [0, P, 0], [0, 0, -1]);
      part('lidRight', DL, LH, [WL / 2, -LH / 2, 0], [0, P / 2, 0], [1, 0, 0]);
      part('lidLeft', DL, LH, [-WL / 2, -LH / 2, 0], [0, -P / 2, 0], [-1, 0, 0]);
      // folded PET edges read as thin bright lines
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(WL, LH, DL)), rt.petEdgeMat);
      edges.position.set(0, -LH / 2, 0); edges.raycast = () => {}; edges.renderOrder = 4; lg.add(edges);
      return;
    }
    const G = .5 * S, WL = W + 2 * (T + G), DL = D + 2 * (T + G), LH = clamp(o.lidH, 3, o.dims.h) * S, wy = (T - LH) / 2;
    const lg = new THREE.Group(); lg.position.set(0, H, 0); g.add(lg); rt.lidGroup = lg; rt.lidBase = H;
    const tHole = lidWin && rrectPts(0, -lidWin.off * S, ww, wd, wr), tHoleIn = tHole && tHole.map(v => V2(v.x, -v.y));
    addG(lg, tHole ? planeGeoHole(WL, DL, tHole) : new THREE.PlaneGeometry(WL, DL), F('top'), [0, T, 0], [-P / 2, 0, 0], { face: 'top' });
    addG(lg, tHoleIn ? planeGeoHole(WL - 2 * T, DL - 2 * T, tHoleIn) : new THREE.PlaneGeometry(WL - 2 * T, DL - 2 * T), F('inside'), [0, 0, 0], [P / 2, 0, 0], { face: 'inside' });
    if (tHole) {
      const loop = [...tHole, tHole[0]];
      addG(lg, ribbonGeo(loop.map(p => [p.x, T, -p.y]), loop.map(p => [p.x, 0, -p.y])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
      film(lg, tHole, [0, T / 2, 0], [-P / 2, 0, 0]);
    }
    add(lg, WL, LH, F('lidFront'), [0, T - LH / 2, DL / 2], [0, 0, 0], { face: 'lidFront' });
    add(lg, WL, LH, F('lidBack'), [0, T - LH / 2, -DL / 2], [0, P, 0], { face: 'lidBack' });
    add(lg, DL, LH, F('lidRight'), [WL / 2, T - LH / 2, 0], [0, P / 2, 0], { face: 'lidRight' });
    add(lg, DL, LH, F('lidLeft'), [-WL / 2, T - LH / 2, 0], [0, -P / 2, 0], { face: 'lidLeft' });
    add(lg, WL - 2 * T, LH - T, rt.innerMat, [0, wy, DL / 2 - T], [0, P, 0], { face: 'inside', wall: true });
    add(lg, WL - 2 * T, LH - T, rt.innerMat, [0, wy, -DL / 2 + T], [0, 0, 0], { face: 'inside', wall: true });
    add(lg, DL - 2 * T, LH - T, rt.innerMat, [WL / 2 - T, wy, 0], [0, -P / 2, 0], { face: 'inside', wall: true });
    add(lg, DL - 2 * T, LH - T, rt.innerMat, [-WL / 2 + T, wy, 0], [0, P / 2, 0], { face: 'inside', wall: true });
    for (const sz of [-1, 1]) add(lg, WL, T, rt.edgeMat, [0, T - LH, sz * (DL / 2 - T / 2)], [P / 2, 0, 0]);
    for (const sx of [-1, 1]) add(lg, T, DL - 2 * T, rt.edgeMat, [sx * (WL / 2 - T / 2), T - LH, 0], [P / 2, 0, 0]);
    return;
  }
  // hinged lid; with an outer flap the lid is wider and deeper than the base by the board
  // thickness, so the flap and its ears always wrap the walls from outside
  const flapOut = lt === 'flap', ld = lidDimsMM(o);
  const WL = ld.wl * S, DL = ld.dl * S;
  const pivot = new THREE.Group(); pivot.position.set(0, H, -D / 2); g.add(pivot); rt.lidPivot = pivot;
  // an edge window notches the lid's front edge, a back window its hinge edge
  const cut = edgeWin || backWin, outerEdge = edgeWin ? 'bottom' : 'top', innerEdge = edgeWin ? 'top' : 'bottom';
  const lidNotch = cut && notchPts(WL, DL, ww / 2, wd, wr, outerEdge);
  let lidHole = lidWin && [rrectPts(0, -lidWin.off * S, ww, wd, wr)];
  if (lidHole && bridgeMM(o) > 0) lidHole = splitBand(lidHole[0], 0, bridgeMM(o) * S / 2).map(q => q.map(v => V2(v.x, v.y)));
  if (lidHole && !lidHole.length) lidHole = null;
  const lidHoleIn = lidHole && lidHole.map(q => q.map(v => V2(v.x, -v.y)));
  addG(pivot, lidHole ? planeGeoHole(WL, DL, lidHole) : planeGeo(WL, DL, lidNotch, outerEdge), F('top'), [0, T, DL / 2], [-P / 2, 0, 0], { face: 'top' });
  addG(pivot, lidHoleIn ? planeGeoHole(WL, DL, lidHoleIn) : planeGeo(WL, DL, cut && notchPts(WL, DL, ww / 2, wd, wr, innerEdge), innerEdge), F('inside'), [0, 0, DL / 2], [P / 2, 0, 0], { face: 'inside' });
  if (lidNotch) {
    const sw = (WL - ww) / 2;
    if (edgeWin && !flapOut) for (const sx of [-1, 1]) add(pivot, sw, T, rt.edgeMat, [sx * (ww / 2 + sw / 2), T / 2, DL], [0, 0, 0]);
    if (backWin) for (const sx of [-1, 1]) add(pivot, sw, T, rt.edgeMat, [sx * (ww / 2 + sw / 2), T / 2, 0], [0, P, 0]);
    if (backWin && !flapOut) add(pivot, WL, T, rt.edgeMat, [0, T / 2, DL], [0, 0, 0]);
    addG(pivot, ribbonGeo(lidNotch.map(p => [p.x, T, DL / 2 - p.y]), lidNotch.map(p => [p.x, 0, DL / 2 - p.y])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
    film(pivot, lidNotch, [0, T / 2, DL / 2], [-P / 2, 0, 0]);
  } else if (!flapOut) add(pivot, WL, T, rt.edgeMat, [0, T / 2, DL], [0, 0, 0]);
  for (const hole of lidHole || []) {
    const loop = [...hole, hole[0]];
    addG(pivot, ribbonGeo(loop.map(p => [p.x, T, DL / 2 - p.y]), loop.map(p => [p.x, 0, DL / 2 - p.y])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
    film(pivot, hole, [0, T / 2, DL / 2], [-P / 2, 0, 0]);
  }
  if (!backWin) add(pivot, WL, T, rt.edgeMat, [0, T / 2, 0], [0, P, 0]);
  const EL = ld.el * S, sideEdge = DL - EL;   // lid side edges are only exposed where no ear hangs
  if (sideEdge > 1e-4) for (const sx of [-1, 1]) add(pivot, sideEdge, T, rt.edgeMat, [sx * WL / 2, T / 2, sideEdge / 2], [0, sx * P / 2, 0]);
  rt.contact = [];
  if (flapOut) {
    const FH = ld.fh * S;
    // the flap is hinged at the lid's front edge; without ears it springs slightly outward
    const fp = new THREE.Group(); fp.position.set(0, T, DL); fp.rotation.x = EL > 0 ? 0 : -3.5 * DEG; pivot.add(fp);
    // a window across the lid edge continues down the flap
    const fwh = edgeWin ? edgeWin.wh * S : 0, iwh = fwh - T;
    const flapNotch = fwh > 0 ? notchPts(WL, FH, ww / 2, fwh, Math.min(wr, fwh * .999), 'top') : null;
    addG(fp, planeGeo(WL, FH, flapNotch, 'top'), F('flap'), [0, -FH / 2, 0], [0, 0, 0], { face: 'flap' });
    addG(fp, planeGeo(WL, FH - T, iwh > 1e-4 ? notchPts(WL, FH - T, ww / 2, iwh, Math.min(wr, iwh * .999), 'top') : null, 'top'), rt.innerMat, [0, -(FH + T) / 2, -T], [0, P, 0], { face: 'inside', wall: true });
    if (flapNotch) {
      addG(fp, ribbonGeo(flapNotch.map(p => [p.x, -FH / 2 + p.y, 0]), flapNotch.map(p => [p.x, -FH / 2 + p.y, -T])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
      film(fp, flapNotch, [0, -FH / 2, -T / 2], [0, 0, 0]);
    }
    add(fp, WL, T, rt.edgeMat, [0, -FH, -T / 2], [P / 2, 0, 0]);
    if (EL > 0) {
      // ears fold back from the flap's side edges and run along the side walls
      const ch = Math.min(FH, EL) * .3;
      const earGeo = (mirror) => {
        const m = mirror ? -1 : 1, pts = [V2(-EL / 2, FH / 2), V2(EL / 2, FH / 2), V2(EL / 2, -FH / 2 + ch), V2(EL / 2 - ch, -FH / 2), V2(-EL / 2, -FH / 2)].map(v => V2(v.x * m, v.y));
        const geo = new THREE.ShapeGeometry(new THREE.Shape(mirror ? pts.reverse() : pts));
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / EL + .5, pos.getY(i) / FH + .5);
        return geo;
      };
      for (const sx of [-1, 1]) {
        const right = sx > 0, key = right ? 'earRight' : 'earLeft';
        const eg = new THREE.Group(); eg.position.set(sx * WL / 2, 0, 0); fp.add(eg);
        const X = x => x - sx * WL / 2;
        // outer plane: local +x runs toward the back on the right ear and toward the front on the left one
        addG(eg, earGeo(!right), F(key), [0, -FH / 2, -EL / 2], [0, sx * P / 2, 0], { face: key });
        addG(eg, earGeo(right), rt.innerMat, [X(sx * (WL / 2 - T)), -FH / 2, -EL / 2], [0, -sx * P / 2, 0], { face: 'inside', wall: true });
        add(eg, T, EL - ch, rt.edgeMat, [X(sx * (WL / 2 - T / 2)), -FH, -(EL - ch) / 2], [P / 2, 0, 0]);
        add(eg, T, FH - ch, rt.edgeMat, [X(sx * (WL / 2 - T / 2)), -(FH - ch) / 2, -EL], [0, P, 0]);
      }
    } else for (const sx of [-1, 1]) add(fp, T, FH, rt.edgeMat, [sx * WL / 2, -FH / 2, -T / 2], [0, sx * P / 2, 0]);
    // soft contact shadow on the walls just under the closed flap and ears
    const CH = Math.min(7 * S, H * .25), cy = H + T - FH - CH / 2, lift = .08 * S;
    if (cy > CH / 2) {
      const strip = (w, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, CH), contactMat); m.position.set(...pos); m.rotation.set(...rot); m.raycast = () => {}; m.renderOrder = 1; g.add(m); rt.contact.push(m); };
      strip(W, [0, cy, D / 2 + lift], [0, 0, 0]);
      const z0 = Math.max(-D / 2, -D / 2 + DL - EL);
      if (EL > 0) for (const sx of [-1, 1]) strip(D / 2 - z0, [sx * (W / 2 + lift), cy, (D / 2 + z0) / 2], [0, sx * P / 2, 0]);
    }
  } else if (lt === 'tuck') {
    // tuck flap hangs inside the front wall
    const TF = clamp(o.flapH, 3, o.dims.h - 2 * o.thickness) * S, TW = W - 2 * WT - 2 * eps, z = D - WT - eps;
    add(pivot, TW, TF, F('flap'), [0, -TF / 2, z], [0, 0, 0], { face: 'flap' });
    add(pivot, TW, TF, rt.innerMat, [0, -TF / 2, z - T], [0, P, 0], { face: 'inside', wall: true });
    add(pivot, TW, T, rt.edgeMat, [0, -TF, z - T / 2], [P / 2, 0, 0]);
  }
}

export { buildBox, cutNetWindow, faceWindow, lidDimsMM, netWindowPath, netWindows, winMM, windowPath, windowPlace };
