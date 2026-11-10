// Коробка для торта с ручкой: гильза, торцы с клапанами, подложка, окна, ручка
import * as THREE from 'three';
import { S, V2, arcPts, clamp, dedupe, esc, r1, splitBand } from '../core/util.js';
import { unionPolys } from '../core/polygon.js';
import { faceKeys, faceMM } from '../core/model.js';
import { getImg } from '../core/assets.js';
import { notchPts, planeGeo, planeGeoHole, ribbonGeo, rrectPts } from '../scene/geometry.js';
import { netWindows, winMM } from './box.js';
import { addCake } from './cake.js';
import { placeModel } from '../core/models3d.js';

const HANDLE_KEYS = ['handleFront', 'handleBack'];
const HANDLE_SHAPES = { arch: 'Арка', rect: 'Прямоугольная с прорезью', photo: 'Рамка с широкой проймой' };
/* a handle leaf: outline w × h with top and bottom corner radii; a hand hole w × h, its bottom y above the
   bridge (0 = open at the bottom: the leaf stands on two legs) and its own corner radii */
const HANDLE_PRESETS = {
  arch: (w, h) => { const b = clamp(Math.min(w, h) * .2, 5, 25); return { rTop: Math.min(w / 2, h), rBot: 0, hole: { w: w - 2 * b, h: h - b, y: 0, rTop: Math.min(w / 2 - b, h - b), rBot: 0 } }; },
  rect: (w, h) => { const hh = clamp(h * .3, 6, 30); return { rTop: Math.min(w, h) * .18, rBot: 0, hole: { w: w * .56, h: hh, y: h * .62 - hh / 2, rTop: hh / 2, rBot: hh / 2 } }; },
  photo: (w, h) => ({ rTop: Math.min(w, h) * .3, rBot: 0, hole: { w: w * .72, h: h * .5, y: h * .2, rTop: Math.min(w, h) * .16, rBot: Math.min(w, h) * .08 } }),
};
function applyHandlePreset(H, shape) {
  const p = HANDLE_PRESETS[shape] ? HANDLE_PRESETS[shape](H.w, H.h) : HANDLE_PRESETS.arch(H.w, H.h);
  Object.assign(H, { shape, rTop: r1(p.rTop), rBot: r1(p.rBot), hole: Object.fromEntries(Object.entries(p.hole).map(([k, v]) => [k, r1(v)])) });
  return H;
}
const defaultHandle = dims => { const w = Math.round(clamp(dims.w * .45, 50, 140)); return applyHandlePreset({ on: true, w, h: Math.round(w * .52), up: true, bridge: 30 }, 'arch'); };
const defaultFrontWin = (dims) => ({ on: false, w: Math.round(dims.w * .62), h: Math.round(dims.h * .5), y: Math.round(dims.h * .52), r: 4 });
/* width (mm) of the strip across the lid window that carries the handle, 0 = none */
const bridgeMM = o => o.type === 'box' && o.lidType === 'handle' && o.handle?.on ? clamp(o.handle.bridge ?? 30, 0, 200) : 0;
/* window opening in face-canvas fractions (top-left origin); rr marks which corners are rounded */
/* window in the drop-down front wall of a handle box: size, height of its centre above the bottom, radius (mm) */
function frontWinMM(o) {
  if (o.type !== 'box' || o.lidType !== 'handle' || !o.frontWin?.on) return null;
  const [fw, fh] = faceMM(o, 'front'), f = o.frontWin, ww = clamp(f.w, 10, fw - 10), wh = clamp(f.h, 10, fh - 10);
  return { ww, wh, cy: clamp(f.y, wh / 2 + 5, fh - wh / 2 - 5), r: clamp(f.r ?? 0, 0, Math.min(ww, wh) / 2 - .5), fw, fh };
}
/* the front window carried over the front edge onto the lid as one opening (handle box): its width, the
   height of its bottom above the floor, how far it reaches back on the lid (to the bridge, else to the back
   of the lid window, else its own depth) and the corner radii at its two ends */
function joinWinMM(o) {
  const fwn = frontWinMM(o); if (!fwn || !o.frontWin.join) return null;
  const { d } = o.dims, bw = bridgeMM(o), win = winMM(o);
  const back = bw > 0 ? d / 2 - bw / 2 : win ? d / 2 - (win.off - win.wd / 2) : clamp(o.frontWin.d ?? 40, 5, d - 10);
  const zBack = clamp(back, 5, d - 5);
  return { ww: fwn.ww, yb: fwn.cy - fwn.wh / 2, zBack, r: Math.min(fwn.r, fwn.ww / 2 - .5), rBack: Math.min(win ? win.r : fwn.r, fwn.ww / 2 - .5, zBack - .5) };
}
/* a leaf's contours (mm, centred, y up): `outer` its outline, `cut` the outline of the board it is made of
   (on legs: round the legs and back over the hole's arch), `hole` the hand hole when it is closed */
function leafContours(w, h, H) {
  const P = Math.PI, x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  const rB = clamp(H.rBot ?? 0, 0, w / 2), rT = clamp(H.rTop ?? 0, 0, Math.min(w / 2, h - rB));
  const outer = [...arcPts(x1 - rB, y0 + rB, rB, -P / 2, 0), ...arcPts(x1 - rT, y1 - rT, rT, 0, P / 2), ...arcPts(x0 + rT, y1 - rT, rT, P / 2, P), ...arcPts(x0 + rB, y0 + rB, rB, P, P * 1.5)];
  const hl = H.hole || {}, hw = clamp(hl.w ?? 0, 0, w - 4), hy = clamp(hl.y ?? 0, 0, h - 6), hh = clamp(hl.h ?? 0, 0, h - hy - 2);
  if (hw < 1 || hh < 1) return { kind: 'plain', outer, cut: outer, hole: null };
  const hx0 = -hw / 2, hx1 = hw / 2, hb = y0 + hy, ht = hb + hh;
  if (hy < .5) {
    // the hole reaches the bridge: it opens at the bottom and the leaf stands on two legs.
    // One contour: the outline from the right leg round to the left leg, then back over the hole's arch
    const ow = Math.min(hw, w - 2 * Math.max(2, rB)), ox0 = -ow / 2, ox1 = ow / 2, hT = clamp(hl.rTop ?? 0, 0, Math.min(ow / 2, hh));
    const arch = [[ox0, y0], ...arcPts(ox0 + hT, ht - hT, hT, P, P / 2), ...arcPts(ox1 - hT, ht - hT, hT, P / 2, 0)];
    return { kind: 'legs', outer, cut: [[ox1, y0], ...outer, ...arch], hole: null };
  }
  const hB = clamp(hl.rBot ?? 0, 0, hw / 2), hT = clamp(hl.rTop ?? 0, 0, Math.min(hw / 2, hh - hB));
  const hole = [...arcPts(hx1 - hB, hb + hB, hB, -P / 2, 0), ...arcPts(hx1 - hT, ht - hT, hT, 0, P / 2), ...arcPts(hx0 + hT, ht - hT, hT, P / 2, P), ...arcPts(hx0 + hB, hb + hB, hB, P, P * 1.5)];
  return { kind: 'hole', outer, cut: outer, hole };
}
function handleShape(w, h, H) {
  const L = leafContours(w, h, H), v = pts => pts.map(p => V2(...p));
  if (L.kind === 'plain') return new THREE.Shape(v(L.outer));
  if (L.kind === 'legs') return new THREE.Shape(dedupe(v(L.cut)));
  const sh = new THREE.Shape(dedupe(v(L.outer)));
  sh.holes.push(new THREE.Path(dedupe(v(L.hole))));
  return sh;
}
/* The handle is cut out of the lid: on the flat sheet each leaf lies in the lid's opening, creased to an edge of
   the bridge, the front leaf in front of it with its top towards the lid's front edge, the back one behind.
   Folded up, a leaf shows the board's reverse on the outside (its face is printed on the back of the sheet)
   and the lid's print on the side towards the other leaf. Lid coordinates (mm): x to the right, y to the
   back, the lid's centre at 0, 0. Without a bridge there is nothing to crease them to: null */
function lidLeaves(o) {
  if (!o.handle?.on || o.lidType !== 'handle' || bridgeMM(o) < 1) return null;
  const [pw, ph] = faceMM(o, 'handleFront'), half = bridgeMM(o) / 2, L = leafContours(pw, ph, o.handle), y0 = -ph / 2;
  return [['handleFront', 1], ['handleBack', -1]].map(([key, sz]) => {
    const m = ([x, y]) => { const up = Math.abs(y - y0) < 1e-6 ? 0 : y - y0; return sz > 0 ? [x, -half - up] : [-x, half + up]; };
    const creases = [];
    L.cut.forEach((a, i) => { const b = L.cut[(i + 1) % L.cut.length]; if (Math.abs(a[1] - y0) < 1e-6 && Math.abs(b[1] - y0) < 1e-6 && Math.abs(a[0] - b[0]) > .01) creases.push([...m(a), ...m(b)]); });
    return { key, sz, w: pw, h: ph, outer: L.outer.map(m), cut: L.cut.map(m), hole: L.hole && L.hole.map(m), creases };
  });
}
/* the lid's openings (lid mm): the window split by the bridge, and with the handle cut out of the lid the
   leaves' outlines too (what a leaf leaves behind when it is folded up). A window joined with the front one
   opens out of the lid's front edge: `notch` is that opening's outline inside the lid, from its left end on
   the front edge round to its right end */
function lidOpenings(o) {
  const { w, d } = o.dims, win = winMM(o), J = joinWinMM(o), bw = bridgeMM(o), leaves = lidLeaves(o);
  const P = pts => pts.map(v => [v.x, v.y]);
  let holes = win ? [P(rrectPts(0, -win.off, win.ww, win.wd, win.r))] : [];
  if (holes.length && bw > 0) holes = splitBand(rrectPts(0, -win.off, win.ww, win.wd, win.r), 0, bw / 2).map(q => q.map(v => [v.x, v.y]));
  if (J) holes = bw > 0 ? holes.filter(q => q.every(v => v[1] > 0)) : [];
  let notch = J && P(notchPts(w, d, J.ww / 2, J.zBack, J.rBack, 'bottom'));
  if (leaves) {
    const [front, back] = leaves;
    holes = unionPolys([...holes, ...(J ? [back] : leaves).map(l => l.outer)]);
    if (J) {
      // the opening runs on below the front edge, so the union's outline crosses the edge: keep the part inside the lid
      const below = -d / 2 - 5, region = [...notch, [notch.at(-1)[0], below], [notch[0][0], below]];
      const U = unionPolys([region, front.outer]).find(l => l.some(v => v[1] < -d / 2));
      if (U) notch = insideFrom(U, -d / 2);
    }
  }
  return { holes: holes.length ? holes : null, notch: notch || null, leaves };
}
/* the part of a closed loop (counter-clockwise) above the line y = Y, from where it goes down through the line on
   the left round to where it comes up on the right (the way a notch in a bottom edge is drawn) */
function insideFrom(loop, Y) {
  const n = loop.length, s = loop.findIndex((v, i) => v[1] < Y && loop[(i + 1) % n][1] >= Y); if (s < 0) return null;
  const at = (a, b) => [a[0] + (b[0] - a[0]) * (Y - a[1]) / (b[1] - a[1]), Y], out = [at(loop[s], loop[(s + 1) % n])];
  // counter-clockwise, the loop comes up on the right, runs over the top to the left and goes down there
  for (let k = 1; k <= n; k++) {
    const a = loop[(s + k) % n], b = loop[(s + k + 1) % n];
    out.push(a);
    if (b[1] < Y) { out.push(at(a, b)); break; }
  }
  return out.reverse().filter((v, i, q) => i === 0 || Math.hypot(v[0] - q[i - 1][0], v[1] - q[i - 1][1]) > 1e-6);
}
function buildHandle(o, rt, pivot, T, zc, addG, lidMat = null) {
  const [w, h] = faceMM(o, 'handleFront'), up = o.handle.up !== false;
  // the outline is drawn in mm (its hand hole and band have sizes in mm), then scaled into the scene
  const geo = mirror => {
    const g = new THREE.ShapeGeometry(handleShape(w, h, o.handle), 24), pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) { if (mirror) pos.setX(i, -pos.getX(i)); uv.setXY(i, pos.getX(i) / w + .5, pos.getY(i) / h + .5); }
    if (mirror) g.index.array.reverse();
    g.scale(S, S, S);
    return g;
  };
  // a leaf cut out of the lid: its side towards the other leaf is the lid's print where the leaf lay on the sheet
  // (lidLeaves: the front one in front of the bridge, top forwards; the back one behind it)
  const lidGeo = sz => {
    const g = new THREE.ShapeGeometry(handleShape(w, h, o.handle), 24), pos = g.attributes.position, uv = g.attributes.uv, { w: lw, d: ld } = o.dims;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), t = pos.getY(i) + h / 2, [X, Y] = sz > 0 ? [x, -half - t] : [-x, half + t];
      uv.setXY(i, X / lw + .5, Y / ld + .5); pos.setX(i, -x);
    }
    g.index.array.reverse(); g.scale(S, S, S);
    return g;
  };
  // the leaves fold up from the two edges of the bridge and lean in until their tops meet
  const half = Math.max(.5, bridgeMM(o) / 2), lean = Math.asin(clamp((half - .5) / h, 0, .9));
  for (const [key, sz] of [['handleFront', 1], ['handleBack', -1]]) {
    const hinge = new THREE.Group(); hinge.position.set(0, T, zc + sz * half * S); hinge.rotation.x = up ? -sz * lean : sz * (Math.PI / 2 - .02); pivot.add(hinge);
    addG(hinge, geo(false), rt.faces[key].mat, [0, h / 2 * S, 0], [0, sz > 0 ? 0 : Math.PI, 0], { face: key });
    if (lidMat) addG(hinge, lidGeo(sz), lidMat, [0, h / 2 * S, -sz * .05 * S], [0, sz > 0 ? Math.PI : 0, 0], { face: 'top' });
    else addG(hinge, geo(true), rt.foldMat, [0, h / 2 * S, -sz * .05 * S], [0, sz > 0 ? Math.PI : 0, 0]);   // the unprinted back of the leaf
  }
}
/* ---------- cake box with a handle, opening at the end ----------
   A sleeve (front, lid with window and handle, back, floor glued round). An end that opens is closed by an
   upper flap hinged at the lid's edge and a lower one hinged at the floor's edge, meeting halfway with a
   tongue tucked into a slot; behind them two dust flaps from the front and back walls. A flat tray with the
   cake slides out through the open end. */
const HB_SIDES = { right: 'Справа', left: 'Слева', both: 'С обеих сторон' };
const TRAY_FIN = { board: 'Картон (с печатью)', gold: 'Золото', silver: 'Серебро' };
/* both ends close with tuck flaps, as on a real cake box; hbSides only says which end the «Открыть торец» slider opens */
const hbOpen = () => ({ right: true, left: true });
const hbOpens = o => { const s = o.hbSides || 'right'; return { right: s !== 'left', left: s !== 'right' }; };
const HB_END_KEYS = ['rightTop', 'rightBottom', 'leftTop', 'leftBottom'];
/* the end's settings (o.hbEnd) with defaults: the upper flap's and the lower flap's lengths (fractions of the height), the
   tongue's width (fraction of the depth) and height (mm), ears on the upper flap's sides, the corner radius (mm) */
const defaultHbEnd = () => ({ top: .77, bottom: .4, tongueW: .5, tongueH: 18, ears: true, r: 6 });
function hbDims(o) {
  const { w, h, d } = o.dims, t = clamp(o.thickness, .3, Math.min(w, h, d) / 4), E = { ...defaultHbEnd(), ...o.hbEnd };
  // the flaps overlap by at least 10 mm: the lower one is lengthened when they would not
  let top = clamp(E.top, .3, .95), bottom = clamp(E.bottom, .1, .9);
  if (top + bottom < 1 + 10 / h) { bottom = Math.min(.9, 1 + 10 / h - top); if (top + bottom < 1 + 10 / h) top = Math.min(.95, 1 + 10 / h - bottom); }
  const dl = Math.round(clamp(d * .3, 15, h * .9)), tl = top * h, bl = bottom * h, r = clamp(E.r, 0, 30);
  const tw = clamp(E.tongueW * d, 12, Math.max(12, d - 2 * (r + 5))), th = clamp(E.tongueH, 4, tl * .3);
  // ears on the upper flap's sides, beyond the dust flaps: width off the flap, length along it, distance from its free end
  const room = tl - dl - 4 - (r + 1), earL = Math.min(47, tl * .3, room), earW = Math.min(20, dl * .4);
  const ears = E.ears !== false && earL >= 8 && earW >= 3, earG = ears ? Math.min(tl * .22, room - earL) + r + 1 : 0;
  return { w, h, d, t, dl, top, bottom, tl, bl, ovl: tl + bl - h, tw, th, r, ears, earL, earW, earG,
    trW: Math.max(10, w - 2 * t - 2), trD: Math.max(10, d - 2 * t - 2), trT: 1.5 };
}
/* a rectangle's outline (net mm) with its four corners (top left, top right, bottom right, bottom left) rounded by r[i] */
function cornerPoly(x0, y0, x1, y1, r) {
  const P = Math.PI, arc = (cx, cy, rr, a0, a1, px, py) => rr > .01 ? arcPts(cx, cy, rr, a0, a1, 6) : [[px, py]];
  return [...arc(x0 + r[0], y0 + r[0], r[0], P, P * 1.5, x0, y0), ...arc(x1 - r[1], y0 + r[1], r[1], P * 1.5, P * 2, x1, y0), ...arc(x1 - r[2], y1 - r[2], r[2], 0, P / 2, x1, y1), ...arc(x0 + r[3], y1 - r[3], r[3], P / 2, P, x0, y1)];
}
/* the die: a vertical strip front, lid, back, floor, glue flap; the right end's parts on the sheet's left
   (the sheet is seen from outside, so +x of the box is on the left), the left end's parts on the right */
function hbNet(o) {
  const B = hbDims(o), { w, h, d, dl, tl, bl, r } = B, keys = faceKeys(o);
  const XL = Math.max(tl + B.th, dl), XR = XL, x0 = XL + w;
  const panels = [
    { key: 'front', x: XL, y: 0, w, h, rot: true }, { key: 'top', x: XL, y: h, w, h: d, rot: true },
    { key: 'back', x: XL, y: h + d, w, h }, { key: 'bottom', x: XL, y: 2 * h + d, w, h: d, rot: true },
    { key: 'glue', blank: 'клеевой клапан', x: XL, y: 2 * h + 2 * d, w, h: 12 }];
  const tabs = [], slots = [];
  for (const side of ['right', 'left']) {
    const R = side === 'right', ex = R ? XL : x0, out = R ? -1 : 1;   // the strip edge on this side, and the way out
    // a flap lies from the strip's edge outwards: its free end has rounded corners (top left, top right, bottom right, bottom left)
    const free = hang => R ? [hang, 0, 0, hang] : [0, hang, hang, 0], fx = len => R ? ex - len : ex;
    // the upper flap on the lid, the lower one on the floor (the upper lies over the lower); `joins` keeps neighbours that only touch from being creases
    panels.push({ key: side + 'Top', x: fx(tl), y: h, w: tl, h: d, q: R ? 1 : 3, joins: ['top', 'tab', 'ear'], poly: cornerPoly(fx(tl), h, fx(tl) + tl, h + d, free(r)) },
      { key: side + 'Bottom', x: fx(bl), y: 2 * h + d, w: bl, h: d, q: R ? 3 : 1, joins: ['bottom'], poly: cornerPoly(fx(bl), 2 * h + d, fx(bl) + bl, 2 * h + 2 * d, free(r)) });
    // the dust flaps: on the front and on the back wall
    for (const [y, wall] of [[0, 'front'], [h + d, 'back']]) panels.push({ key: 'dust', side, blank: 'клапан', x: fx(dl), y, w: dl, h, joins: [wall], poly: cornerPoly(fx(dl), y, fx(dl) + dl, y + h, free(Math.min(r, dl / 3))) });
    // the ears on the upper flap's sides, beyond the dust flaps, folded in
    if (B.ears) {
      const er = Math.min(r, B.earW / 2.5, B.earL / 2.5), ex0 = R ? ex - tl + B.earG : ex + tl - B.earG - B.earL;
      for (const up of [true, false]) {
        const y0 = up ? h - B.earW : h + d, y1 = up ? h : h + d + B.earW;
        panels.push({ key: 'ear', side, blank: 'ушко', x: ex0, y: y0, w: B.earL, h: B.earW, joins: [side + 'Top'], poly: cornerPoly(ex0, y0, ex0 + B.earL, y1, up ? [er, er, 0, 0] : [0, 0, er, er]) });
      }
    }
    // the tongue on the upper flap's free edge, the slot in the lower flap as far from its free edge as the flaps overlap
    const fe = ex + out * tl, cy = h + d / 2, cyb = 2 * h + d + d / 2, ins = B.th * .35, sx = ex + out * bl - out * B.ovl;
    tabs.push({ on: side + 'Top', base: [fe, cy - B.tw / 2, fe, cy + B.tw / 2], pts: [[fe, cy - B.tw / 2], [fe + out * B.th, cy - B.tw / 2 + ins], [fe + out * B.th, cy + B.tw / 2 - ins], [fe, cy + B.tw / 2]] });
    slots.push([sx, cyb - B.tw / 2 - 1, sx, cyb + B.tw / 2 + 1]);
  }
  let W = XL + w + XR, H = 2 * h + 2 * d + 12;
  // the separate parts lie well clear of the sheet: the tray is not cut from it
  const gap = 15, y = H + 30; let x = 0, rowH = 0;
  const part = (key, pw, ph, extra = {}) => { panels.push({ key, x, y, w: pw, h: ph, part: true, ...extra(x, y) }); x += pw + gap; rowH = Math.max(rowH, ph); };
  const leaves = lidLeaves(o);
  // without a bridge the leaves are separate parts
  if (!leaves) for (const k of keys.filter(k => HANDLE_KEYS.includes(k))) {
    const [pw, ph] = faceMM(o, k), sp = handleShape(pw, ph, o.handle).extractPoints(10);
    part(k, pw, ph, (px, py) => { const m = v => [px + pw / 2 + v.x, py + ph / 2 - v.y]; return { poly: sp.shape.map(m), holes: sp.holes.map(hl => hl.map(m)) }; });
  }
  part('tray', B.trW, B.trD, () => ({ note: 'отдельная деталь' }));
  // the leaves lie in the lid (turned 180° on the sheet: +x of the box on the left); the lid's own print is on their other side
  const onLid = ([lx, ly]) => [XL + w / 2 - lx, h + d / 2 + ly];
  const sheetLeaves = leaves && leaves.map(l => ({ key: l.key, outer: l.outer.map(onLid), cut: l.cut.map(onLid), hole: l.hole && l.hole.map(onLid), creases: l.creases.map(([a, b, c, e]) => [...onLid([a, b]), ...onLid([c, e])]) }));
  W = Math.max(W, x - gap); H = y + rowH;
  // the leaves on the back of the sheet, where they lie in the lid (the sheet turned over: x mirrored about the sheet's
  // middle): what is printed there is the outside of the standing handle, so these panels carry the handle's faces
  const cx = W - XL - w / 2, half = bridgeMM(o) / 2, onBack = ([lx, ly]) => [cx + lx, h + d / 2 + ly];
  const leafBack = leaves && leaves.map(l => ({ key: l.key, x: cx - l.w / 2, y: l.sz > 0 ? h + d / 2 - half - l.h : h + d / 2 + half, w: l.w, h: l.h,
    q: l.sz > 0 ? 0 : 2, poly: l.cut.map(onBack), holes: l.hole ? [l.hole.map(onBack)] : [] }));
  return { W, H, panels, hb: true, tabs, slots, leaves: sheetLeaves, leafBack };
}
/* the handle box's die in SVG: an edge two panels share is a crease, any other edge is cut (except the
   tongues' bases, which crease); tongues, slots, windows and the separate parts */
function handleBoxSVG(o, n, f, label) {
  const line = (l, st) => `<line x1="${f(l[0])}" y1="${f(l[1])}" x2="${f(l[2])}" y2="${f(l[3])}" ${st}/>`;
  const CUT = 'stroke="#00a0e3" stroke-width="0.3"', FOLD = 'stroke="#e6007e" stroke-width="0.3" stroke-dasharray="2 1.2"';
  // a panel's outline as segments (a rounded one from its points); an edge two panels share is a crease only when they are joined
  const ps = n.panels.filter(p => !p.part), edges = p => p.poly ? p.poly.map((a, i) => [...a, ...p.poly[(i + 1) % p.poly.length]]) : [[p.x, p.y, p.x + p.w, p.y], [p.x, p.y + p.h, p.x + p.w, p.y + p.h], [p.x, p.y, p.x, p.y + p.h], [p.x + p.w, p.y, p.x + p.w, p.y + p.h]];
  const cut = [], fold = new Map(), near = (a, b) => Math.abs(a - b) < 1e-6, joined = (p, q) => (!p.joins || p.joins.includes(q.key)) && (!q.joins || q.joins.includes(p.key));
  for (const p of ps) for (const [x1, y1, x2, y2] of edges(p)) {
    const hor = near(y1, y2);
    if (!hor && !near(x1, x2)) { cut.push([x1, y1, x2, y2]); continue; }   // a corner's arc
    let parts = [[hor ? Math.min(x1, x2) : Math.min(y1, y2), hor ? Math.max(x1, x2) : Math.max(y1, y2)]];
    const sub = (s0, s1) => { parts = parts.flatMap(([u, v]) => [[u, Math.min(v, s0)], [Math.max(u, s1), v]].filter(([a, b]) => b - a > .01)); };
    for (const q of ps) if (q !== p) for (const [a1, b1, a2, b2] of edges(q)) {
      if (hor ? near(b1, b2) && near(b1, y1) : near(a1, a2) && near(a1, x1)) {
        const s0 = Math.max(hor ? Math.min(x1, x2) : Math.min(y1, y2), hor ? Math.min(a1, a2) : Math.min(b1, b2)), s1 = Math.min(hor ? Math.max(x1, x2) : Math.max(y1, y2), hor ? Math.max(a1, a2) : Math.max(b1, b2));
        if (s1 - s0 > .01) {
          if (joined(p, q)) { fold.set(`${hor}|${s0.toFixed(2)}|${s1.toFixed(2)}|${(hor ? y1 : x1).toFixed(2)}`, hor ? [s0, y1, s1, y1] : [x1, s0, x1, s1]); sub(s0, s1); }
          else if (ps.indexOf(q) < ps.indexOf(p)) sub(s0, s1);   // a cut two panels share is drawn once
        }
      }
    }
    for (const t of n.tabs) { const [bx, b0, , b1] = t.base; if (!hor && near(bx, x1)) { fold.set('tab' + bx + b0, [bx, b0, bx, b1]); sub(b0, b1); } }
    for (const [u, v] of parts) cut.push(hor ? [u, y1, v, y1] : [x1, u, x1, v]);
  }
  const wins = netWindows(o, n), trim = ([x1, y1, x2, y2]) => {
    const hor = near(y1, y2); let segs = [[hor ? x1 : y1, hor ? x2 : y2]];
    for (const q of wins) {
      if (!(hor ? y1 > q.y + .01 && y1 < q.y + q.h - .01 : x1 > q.x + .01 && x1 < q.x + q.w - .01)) continue;
      const a = hor ? q.x : q.y, b = hor ? q.x + q.w : q.y + q.h;
      segs = segs.flatMap(([u, v]) => [[u, Math.min(v, a)], [Math.max(u, b), v]].filter(([s0, s1]) => s1 - s0 > .01));
    }
    return segs.map(([u, v]) => hor ? [u, y1, v, y1] : [x1, u, x1, v]);
  };
  // the handle cut out of the lid: the leaves' creases on the bridge, the cut round the leaves and the openings
  const LC = wins.leafCut, pline = pts => `<polyline points="${pts.map(v => v.map(f).join(',')).join(' ')}" fill="none" ${CUT}/>`;
  let body = cut.map(l => line(l, CUT)).join('') + [...fold.values()].flatMap(trim).map(l => line(l, FOLD)).join('');
  if (LC) body += LC.creases.map(l => line(l, FOLD)).join('') + LC.cuts.map(pline).join('');
  body += n.tabs.map(t => `<polyline points="${t.pts.map(v => v.map(f).join(',')).join(' ')}" fill="none" ${CUT}/>`).join('');
  body += n.slots.map(l => line(l, CUT)).join('');
  for (const q of wins) {
    if (LC && q.lid) continue;
    if (q.polys) { for (const pl of q.polys) body += `<path d="${pl.map((v, i) => `${i ? 'L' : 'M'}${f(v.x)},${f(v.y)}`).join(' ')} Z" fill="none" ${CUT}/>`; continue; }
    body += `<rect x="${f(q.x)}" y="${f(q.y)}" width="${f(q.w)}" height="${f(q.h)}" rx="${f(Math.min(q.radii[0], q.w / 2, q.h / 2))}" fill="none" ${CUT}/>`;
  }
  const poly = q => `<polygon points="${q.map(v => v.map(f).join(',')).join(' ')}" fill="none" ${CUT}/>`;
  for (const p of n.panels.filter(p => p.part)) body += p.poly ? poly(p.poly) + (p.holes || []).map(poly).join('') : `<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}" fill="none" ${CUT}/>`;
  for (const p of n.panels) {
    if (p.blank) { if (p.blank.length) body += `<text x="${f(p.x + p.w / 2)}" y="${f(p.y + p.h / 2)}" font-family="Arial, sans-serif" font-size="${f(Math.max(2.5, Math.min(p.w, p.h) * .12))}" fill="#9a9a9a" text-anchor="middle" dominant-baseline="middle"${p.h > p.w ? ` transform="rotate(-90 ${f(p.x + p.w / 2)} ${f(p.y + p.h / 2)})"` : ''}>${esc(p.blank.toUpperCase())}</text>`; }
    else body += label(p);
  }
  return body;
}
function buildHandleBox(o, rt, { addG, add, film }) {
  const B = hbDims(o), W = B.w * S, H = B.h * S, D = B.d * S, T = B.t * S, P = Math.PI, g = rt.group, F = k => rt.faces[k].mat;
  rt.hb = { flaps: [], dust: [], tongues: [], tray: null, dir: hbOpens(o).right ? 1 : -1 };
  rt.lidPivot = rt.lidGroup = null;
  // front wall, with its window
  const J = joinWinMM(o), fwn = !J && frontWinMM(o), fHole = fwn && rrectPts(0, fwn.cy * S - H / 2, fwn.ww * S, fwn.wh * S, fwn.r * S);
  if (J) {
    // the window runs out of the front wall's top edge (and on over the lid)
    const jw = J.ww * S / 2, jr = J.r * S, nO = notchPts(W, H, jw, H - J.yb * S, jr, 'top'), nI = notchPts(W - 2 * T, H - 2 * T, jw, H - T - J.yb * S, jr, 'top');
    addG(g, planeGeo(W, H, nO, 'top'), F('front'), [0, H / 2, D / 2], [0, 0, 0], { face: 'front' });
    addG(g, planeGeo(W - 2 * T, H - 2 * T, nI, 'top'), rt.innerMat, [0, H / 2, D / 2 - T], [0, P, 0], { face: 'inside', wall: true });
    addG(g, ribbonGeo(nO.map(p => [p.x, H / 2 + p.y, D / 2]), nO.map(p => [p.x, H / 2 + p.y, D / 2 - T])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
    film(g, nO, [0, H / 2, D / 2 - T / 2], [0, 0, 0]);
  } else addG(g, fHole ? planeGeoHole(W, H, fHole) : new THREE.PlaneGeometry(W, H), F('front'), [0, H / 2, D / 2], [0, 0, 0], { face: 'front' });
  if (!J) addG(g, fHole ? planeGeoHole(W - 2 * T, H - 2 * T, fHole.map(v => V2(-v.x, v.y))) : new THREE.PlaneGeometry(W - 2 * T, H - 2 * T), rt.innerMat, [0, H / 2, D / 2 - T], [0, P, 0], { face: 'inside', wall: true });
  if (fHole) {
    const loop = [...fHole, fHole[0]];
    addG(g, ribbonGeo(loop.map(p => [p.x, H / 2 + p.y, D / 2]), loop.map(p => [p.x, H / 2 + p.y, D / 2 - T])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
    film(g, fHole, [0, H / 2, D / 2 - T / 2], [0, 0, 0]);
  }
  add(g, W, H, F('back'), [0, H / 2, -D / 2], [0, P, 0], { face: 'back' });
  add(g, W - 2 * T, H - 2 * T, rt.innerMat, [0, H / 2, -D / 2 + T], [0, 0, 0], { face: 'inside', wall: true });
  add(g, W, D, F('bottom'), [0, 0, 0], [P / 2, 0, 0], { face: 'bottom' });
  add(g, W - 2 * T, D - 2 * T, F('insideBottom'), [0, T, 0], [-P / 2, 0, 0], { face: 'insideBottom' });
  // the lid: window split by the bridge, the handle standing on it
  const lg = new THREE.Group(); lg.position.set(0, H, 0); g.add(lg);
  const win = winMM(o);
  let holes = win && [rrectPts(0, -win.off * S, win.ww * S, win.wd * S, win.r * S)];
  if (holes && bridgeMM(o) > 0) holes = splitBand(holes[0], 0, bridgeMM(o) * S / 2).map(q => q.map(v => V2(v.x, v.y)));
  // a window joined with the front one: its front part becomes a notch in the lid's front edge
  // (shape y runs to the back; the front edge is at y = -D/2)
  let jn = J && notchPts(W, D, J.ww * S / 2, J.zBack * S, J.rBack * S, 'bottom');
  if (J && holes) holes = bridgeMM(o) > 0 ? holes.filter(q => q.every(v => v.y > 0)) : [];
  if (holes && !holes.length) holes = null;
  // the handle cut out of the lid: the openings take in the leaves' outlines
  const LO = lidLeaves(o) && lidOpenings(o), sv = q => q.map(([x, y]) => V2(x * S, y * S));
  if (LO) { holes = LO.holes && LO.holes.map(sv); if (J) jn = sv(LO.notch); }
  const lidGeo = (hl, mirror) => {
    if (!jn) return hl ? planeGeoHole(W, D, hl) : new THREE.PlaneGeometry(W, D);
    const notch = mirror ? (LO ? jn.map(v => V2(v.x, -v.y)).reverse() : notchPts(W, D, J.ww * S / 2, J.zBack * S, J.rBack * S, 'top')) : jn;
    const outer = mirror ? [V2(-W / 2, -D / 2), V2(W / 2, -D / 2), V2(W / 2, D / 2), ...notch, V2(-W / 2, D / 2)] : [V2(-W / 2, -D / 2), ...notch, V2(W / 2, -D / 2), V2(W / 2, D / 2), V2(-W / 2, D / 2)];
    const sh = new THREE.Shape(dedupe(outer)); for (const h of hl || []) sh.holes.push(new THREE.Path(h));
    const geo = new THREE.ShapeGeometry(sh), pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / W + .5, pos.getY(i) / D + .5);
    return geo;
  };
  addG(lg, lidGeo(holes, false), F('top'), [0, 0, 0], [-P / 2, 0, 0], { face: 'top' });
  addG(lg, lidGeo(holes && holes.map(q => q.map(v => V2(v.x, -v.y))), true), F('inside'), [0, -T, 0], [P / 2, 0, 0], { face: 'inside' });
  if (jn) {
    addG(lg, ribbonGeo(jn.map(p => [p.x, 0, -p.y]), jn.map(p => [p.x, -T, -p.y])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
    film(lg, jn, [0, -T / 2, 0], [-P / 2, 0, 0]);
  }
  for (const hole of holes || []) {
    const loop = [...hole, hole[0]];
    addG(lg, ribbonGeo(loop.map(p => [p.x, 0, -p.y]), loop.map(p => [p.x, -T, -p.y])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
    if (win) film(lg, hole, [0, -T / 2, 0], [-P / 2, 0, 0]);   // without a window the leaves leave open holes
  }
  add(lg, W, T, rt.edgeMat, [0, -T / 2, -D / 2], [0, P, 0]);
  if (jn && LO) for (const [a, b] of [[-W / 2, jn[0].x], [jn.at(-1).x, W / 2]]) add(lg, b - a, T, rt.edgeMat, [(a + b) / 2, -T / 2, D / 2], [0, 0, 0]);
  else if (jn) { const sw = (W - J.ww * S) / 2; for (const sx of [-1, 1]) add(lg, sw, T, rt.edgeMat, [sx * (W - sw) / 2, -T / 2, D / 2], [0, 0, 0]); }
  else add(lg, W, T, rt.edgeMat, [0, -T / 2, D / 2], [0, 0, 0]);
  if (o.handle?.on) buildHandle(o, rt, lg, 0, 0, addG, LO ? F('top') : null);
  // the ends
  const tL = B.tl * S, bL = B.bl * S, rr = B.r * S, v2 = pts => dedupe(pts.map(([x, y]) => V2(x, y)));
  // a flap's outline, D wide and len long (centred), the corners at its free end rounded: at the bottom when `down`
  const flapPts = (len, down) => cornerPoly(-D / 2, -len / 2, D / 2, len / 2, down ? [rr, rr, 0, 0] : [0, 0, rr, rr]).map(([x, y]) => V2(x, y));
  const flapGeo = (len, down) => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(dedupe(flapPts(len, down)))), pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / D + .5, pos.getY(i) / len + .5);
    return g;
  };
  // one flap: its printed face outside, its board's back inside, the cut edge round the free end and the sides (not at the hinge)
  const flap = (grp, len, down, ry, sx, key) => {
    const yc = down ? -len / 2 : len / 2, P = flapPts(len, down), hy = down ? len / 2 : -len / 2, n = P.length;
    addG(grp, flapGeo(len, down), F(key), [0, yc, 0], [0, ry, 0], { face: key });
    addG(grp, flapGeo(len, down), rt.innerMat, [-sx * T, yc, 0], [0, -ry, 0], { face: 'inside', wall: true });
    const k = P.findIndex((q, i) => Math.abs(q.y - hy) < 1e-7 && Math.abs(P[(i + 1) % n].y - hy) < 1e-7), open = [...P.slice(k + 1), ...P.slice(0, k + 1)];
    addG(grp, ribbonGeo(open.map(q => [0, yc + q.y, -sx * q.x]), open.map(q => [-sx * T, yc + q.y, -sx * q.x])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
  };
  for (const sx of [1, -1]) {
    const side = sx > 0 ? 'right' : 'left', ry = sx * P / 2;
    // the upper flap hangs from the lid's edge and lies outside; the lower one rises from the floor's edge, a board's thickness further in
    const uh = new THREE.Group(); uh.position.set(sx * W / 2, H, 0); g.add(uh);
    flap(uh, tL, true, ry, sx, side + 'Top');
    // the tongue on the upper flap's free edge: it slants in through the slot in the lower flap while the end is closed
    const tw = B.tw * S / 2, ins = B.th * .35 * S, tg = new THREE.Group(); tg.position.set(-sx * T, -tL, 0); uh.add(tg);
    const tm = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([V2(-tw, 0), V2(tw, 0), V2(tw - ins, -B.th * S), V2(-tw + ins, -B.th * S)])), rt.foldMat);
    tm.rotation.set(0, ry, 0); tm.castShadow = true; tm.userData = { objId: o.id, face: null }; tg.add(tm);
    const tong = { m: tg, sx, al: 15 * P / 180, slot: null }; rt.hb.tongues.push(tong);
    // the ears on its sides, beyond the dust flaps, folded in (they turn with the flap)
    if (B.ears) {
      const er = Math.min(B.r, B.earW / 2.5, B.earL / 2.5) * S, eg = new THREE.ShapeGeometry(new THREE.Shape(v2(cornerPoly(-B.earL * S / 2, 0, B.earL * S / 2, B.earW * S, [0, 0, er, er])))), pos = eg.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setXYZ(i, -sx * pos.getY(i), pos.getX(i), 0);
      eg.computeVertexNormals();
      for (const zs of [1, -1]) {
        const em = new THREE.Mesh(eg, rt.foldMat); em.position.set(0, -tL + (B.earG + B.earL / 2) * S, zs * (D / 2 - 1.3 * T)); em.castShadow = em.receiveShadow = true; em.userData = { objId: o.id, face: null }; uh.add(em);
      }
    }
    const lh = new THREE.Group(); lh.position.set(sx * (W / 2 - T), 0, 0); g.add(lh);
    flap(lh, bL, false, ry, sx, side + 'Bottom');
    const slot = new THREE.Mesh(new THREE.PlaneGeometry((B.tw + 2) * S, .7 * S), rt.holeMat); slot.position.set(sx * .05 * S, bL - B.ovl * S, 0); slot.rotation.set(0, ry, 0); slot.raycast = () => {}; lh.add(slot); tong.slot = slot;
    rt.hb.flaps.push({ u: uh, l: lh, sx });
    // dust flaps fold in from the front and back walls, just inside the end flaps
    for (const zs of [1, -1]) {
      const dg = new THREE.Group(); dg.position.set(sx * (W / 2 - 3 * T), H / 2, zs * (D / 2 - T)); g.add(dg);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(B.dl * S, H - 2.4 * T), rt.foldMat); m.position.set(0, 0, -zs * B.dl * S / 2); m.rotation.y = P / 2;
      m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, face: null }; dg.add(m);
      rt.hb.dust.push({ g: dg, sx, zs });
    }
  }
  // the tray and the cake on it
  const tr = new THREE.Group(); tr.position.set(0, T, 0); g.add(tr); rt.hb.tray = tr;
  const TW = B.trW * S, TD = B.trD * S, TT = B.trT * S, metal = o.tray?.fin === 'gold' || o.tray?.fin === 'silver';
  rt.trayMat ??= new THREE.MeshPhysicalMaterial({ roughness: .3, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.BoxGeometry(TW, TT, TD), metal ? rt.trayMat : rt.foldMat); body.position.y = TT / 2; body.castShadow = body.receiveShadow = true; body.userData = { objId: o.id, face: null }; tr.add(body);
  addG(tr, new THREE.PlaneGeometry(TW, TD), metal ? rt.trayMat : F('tray'), [0, TT + .02 * S, 0], [-P / 2, 0, 0], { face: 'tray' });
  const pr = o.product || {}, im = pr.src && getImg(pr.src);
  if (im) {
    rt.productTex?.dispose(); rt.productTex = new THREE.Texture(im); rt.productTex.colorSpace = THREE.SRGBColorSpace; rt.productTex.needsUpdate = true;
    rt.productMat.map = rt.productTex; rt.productMat.needsUpdate = true;
    const pw = clamp(pr.w ?? B.trW * .8, 5, 1000) * S, ph = pw * im.naturalHeight / im.naturalWidth;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), rt.productMat); m.position.set((pr.x || 0) * S, TT + ph / 2, 0); m.raycast = () => {}; m.userData = { objId: o.id, face: null }; tr.add(m);
  } else if (pr.cake !== false && pr.model) {
    // a 3D model of the cake: as large as fits the tray and under the lid
    placeModel(tr, o, pr.model, { fit: [B.trW * .85, B.trD * .85, (H - TT) / S * .9], at: [pr.x || 0, TT / S, 0], pick: false });
  } else if (pr.cake !== false) {
    // a plain cake while there is no photo: sponge, cream top, a ring of cream dollops and berries
    const R = Math.min(TW, TD) * .38, hc = Math.min(H * .42, 70 * S, R * 1.1);
    addCake(tr, o, rt, { R: R / S, y0: TT / S, h: hc / S });
  }
}

export { defaultHbEnd, hbOpens, HANDLE_KEYS, HANDLE_SHAPES, HB_END_KEYS, HB_SIDES, TRAY_FIN, applyHandlePreset, bridgeMM, buildHandleBox, defaultFrontWin, defaultHandle, frontWinMM, handleBoxSVG, hbDims, hbNet, hbOpen, joinWinMM, lidLeaves, lidOpenings };
