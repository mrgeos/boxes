// Подложка под торт или пирожное: поднос из толстого картона, обтянутый фольгой или бумагой с печатью, с тортом сверху
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';
import { FINISHES, FOIL_METAL, isFoil } from '../core/constants.js';
import { addCake } from './cake.js';

/* A cake board is a sheet of thick board (dims.h, 1.5–12 mm; a thick one is a drum) of a round or rectangular
   outline (dims.w × dims.d, a circle: dims.w), its edge plain or scalloped, with a tab to take it by (a pastry
   board) or without. It is covered with gold or silver foil or with printed laminated paper (the top face is the
   design, as any face); the covering is turned over its edge (cbWrap) or the cut board shows there, and its
   underside is bare grey board or covered as well. A cake stands on it: round (cake.d, its diameter) or a slab
   (cake.w × cake.l), at first the board's shape and a little smaller, any of the two on any board.
   Faces: top (Верх) and bottom (Низ), both of the outline's size (with the tab). All lengths are mm. */
const BOARD_SHAPE = { round: 'Круглая', rect: 'Прямоугольная' };
const BOARD_COVER = { 'foil-gold': 'Фольга — золото', 'foil-silver': 'Фольга — серебро', print: 'Бумага с печатью (ламинированная)' };
const BOARD_BOTTOM = { raw: 'Серый картон', covered: 'Обтянут, как верх' };
const RAW_BOARD = '#b9b2a6';   // grey chipboard
/* the finish of a foil covering: metal, a little rough; what is printed on it is ink (not metal) */
const BOARD_FOIL = { label: 'Фольга', r: .22, m: 1, cc: 0, ccr: 0, foilBase: true };

/* ---------- the outline ---------- */
const boardD = o => o.cbShape === 'round' ? o.dims.w : o.dims.d;
function circle(R, n = 256) { const P = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; P.push([Math.cos(a) * R, Math.sin(a) * R]); } return P; }
/* a rounded rectangle x0…x1 × z0…z1 */
function rrect(x0, z0, x1, z1, r, seg = 12) {
  r = clamp(r, 0, Math.min(x1 - x0, z1 - z0) / 2); const P = [];
  const arc = (cx, cz, a0) => { for (let i = 0; i <= seg; i++) { const a = a0 + i / seg * Math.PI / 2; P.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } };
  arc(x1 - r, z1 - r, 0); arc(x0 + r, z1 - r, Math.PI / 2); arc(x0 + r, z0 + r, Math.PI); arc(x1 - r, z0 + r, Math.PI * 1.5);
  return P;
}
/* how far a ray from the middle along (dx, dz) runs to leave a convex outline (0 if it misses it) */
function reach(P, dx, dz) {
  let t = 0;
  for (let i = 0; i < P.length; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const s = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den;
    if (s > 0 && u >= 0 && u <= 1) t = Math.max(t, s);
  }
  return t;
}
/* points along a closed outline, about `step` apart, with the length so far */
function resample(P, step) {
  const L = [0]; for (let i = 1; i <= P.length; i++) L.push(L[i - 1] + Math.hypot(P[i % P.length][0] - P[i - 1][0], P[i % P.length][1] - P[i - 1][1]));
  const total = L.at(-1), n = Math.max(16, Math.round(total / step)), out = [];
  for (let k = 0, i = 1; k < n; k++) {
    const s = total * k / n; while (L[i] < s) i++;
    const f = (s - L[i - 1]) / ((L[i] - L[i - 1]) || 1), a = P[i - 1], b = P[i % P.length];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return { P: out, total };
}
/* the outward normal at each point of a closed outline (counter-clockwise as x right, z to the front) */
function normals(P) {
  let A = 0; for (let i = 0; i < P.length; i++) { const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length]; A += ax * bz - bx * az; }
  const sg = A > 0 ? 1 : -1;
  return P.map((_, i) => { const [ax, az] = P[(i - 1 + P.length) % P.length], [bx, bz] = P[(i + 1) % P.length], tx = bx - ax, tz = bz - az, l = Math.hypot(tx, tz) || 1; return [sg * tz / l, -sg * tx / l]; });
}
/* the smooth outline: the board's shape and its tab (the tab sticks out at the front) */
function smoothOutline(o) {
  const w = o.dims.w, d = boardD(o);
  const base = o.cbShape === 'round' ? circle(w / 2) : rrect(-w / 2, -d / 2, w / 2, d / 2, o.cbR ?? 10);
  if (!o.cbTab?.on) return base;
  const tw = clamp(o.cbTab.w ?? 40, 10, w), tl = clamp(o.cbTab.l ?? 25, 5, 300), z0 = d / 2 - Math.min(d / 4, tw / 2);
  const tab = rrect(-tw / 2, z0, tw / 2, d / 2 + tl, Math.min(tw * .3, tl * .7));
  // both are seen whole from the middle: the outline is the farther of the two along each ray
  const P = [];
  for (let i = 0; i < 720; i++) { const a = i / 720 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), r = Math.max(reach(base, dx, dz), reach(tab, dx, dz)); P.push([dx * r, dz * r]); }
  return P;
}
/* the board's outline (mm, x right, z to the front) with its scallops, and its box */
function boardOutline(o) {
  const smooth = smoothOutline(o);
  let P = smooth;
  if (o.cbEdge === 'scallop') {
    // round lobes with sharp notches between them, as a scalloped doily
    const R = resample(smooth, 1), lam0 = clamp(Math.min(o.dims.w, boardD(o)) * .07, 8, 26), n = Math.max(6, Math.round(R.total / lam0)), lam = R.total / n, A = lam * .3, N = normals(R.P);
    P = R.P.map(([x, z], i) => { const s = R.total * i / R.P.length, k = A * (1 - Math.sqrt(Math.abs(Math.sin(Math.PI * s / lam)))); return [x - N[i][0] * k, z - N[i][1] * k]; });
  }
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { P, smooth, x0, x1, z0, z1, W: x1 - x0, D: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}
const boardFaceMM = o => { const B = boardOutline(o); return [B.W, B.D]; };
/* the outline on face k's canvas, 0…1 (the top seen from above, the underside turned over towards you) */
function boardFacePath(o, k) { const B = boardOutline(o); return B.P.map(([x, z]) => [(x - B.x0) / B.W, k === 'bottom' ? (B.z1 - z) / B.D : (z - B.z0) / B.D]); }

/* ---------- covering ---------- */
/* the covering (foil or printed paper): the top takes the foil's metal (or white paper after foil), the underside
   follows the top or stays bare board */
function setBoardCover(o, cover = o.cbCover) {
  const was = o.cbCover; o.cbCover = BOARD_COVER[cover] ? cover : 'foil-gold';
  const top = o.faces.top, bot = o.faces.bottom;
  if (top) {
    if (isFoil(o.cbCover)) top.bg = FOIL_METAL[o.cbCover][1];
    else if (isFoil(was) || Object.values(FOIL_METAL).some(c => c[1] === top.bg)) top.bg = '#ffffff';
  }
  if (bot) bot.bg = o.cbBottom === 'covered' ? top?.bg ?? '#ffffff' : RAW_BOARD;
}
/* the finish a face of the board is printed with */
function boardFin(o, k) {
  const covered = k === 'top' || o.cbBottom === 'covered';
  if (!covered) return FINISHES.matte;
  return isFoil(o.cbCover) ? BOARD_FOIL : FINISHES[o.finish] || FINISHES.gloss;
}
const boardGrain = (o, k) => k === 'bottom' && o.cbBottom !== 'covered' ? .5 : isFoil(o.cbCover) ? 0 : o.grain;
function applyBoardPreset(o, p) {
  const c = p.cb;
  Object.assign(o, { cbShape: c.shape || 'round', cbCover: c.cover || 'foil-gold', cbEdge: c.edge || 'smooth', cbR: c.r ?? 10, cbWrap: c.wrap ?? true, cbBottom: c.bottom || 'raw',
    cbTab: { on: false, w: 40, l: 25, ...(c.tab || {}) }, cake: { on: true, ...(c.cake || {}) }, lid: 0 });
}
function boardDefaults(o) {
  o.cbShape ??= 'round'; o.cbCover ??= 'foil-gold'; o.cbEdge ??= 'smooth'; o.cbR ??= 10; o.cbWrap ??= true; o.cbBottom ??= 'raw';
  o.cbTab ??= { on: false, w: 40, l: 25 }; o.cake ??= { on: true };
  if (o.cbShape === 'round') o.dims.d = o.dims.w;
  o.cake.h ??= Math.round(clamp(Math.min(o.dims.w, o.dims.d || o.dims.w) * .3, 20, 90));
  if (!o.cake.shape) fitCake(o);
}
/* the cake made to fit the board again: its shape, a little smaller (its height stays) */
function fitCake(o, shape = o.cbShape === 'rect' ? 'rect' : 'round') {
  const w = o.dims.w, d = boardD(o);
  Object.assign(o.cake, { shape, d: Math.round(Math.min(w, d) * .82), w: Math.round(w * .84), l: Math.round(d * .84) });
}

/* ---------- the model ---------- */
function buildBoard(o, rt) {
  const B = boardOutline(o), h = clamp(o.dims.h, 1, 40);
  const face = (k, y, rx, flip) => {
    const sh = new THREE.Shape(B.P.map(([x, z]) => new THREE.Vector2(x - B.cx, flip ? z - B.cz : B.cz - z)));
    const g = new THREE.ShapeGeometry(sh, 1), pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + B.W / 2) / B.W, (pos.getY(i) + B.D / 2) / B.D);
    g.scale(S, S, S);
    const m = new THREE.Mesh(g, rt.faces[k].mat); m.position.set(B.cx * S, y * S, B.cz * S); m.rotation.x = rx;
    m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, face: k }; rt.group.add(m);
  };
  face('top', h, -Math.PI / 2, false); face('bottom', 0, Math.PI / 2, true);
  // the edge all round: the covering turned over it, or the cut board
  const n = B.P.length, pos = [], idx = [];
  for (const [x, z] of B.P) pos.push(x * S, 0, z * S, x * S, h * S, z * S);
  for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  rt.cbSideMat ??= new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide });
  const side = new THREE.Mesh(g, rt.cbSideMat); side.castShadow = side.receiveShadow = true; side.userData = { objId: o.id, face: null, wall: true }; rt.group.add(side);
  // the cake: round or a slab, of its own size, in the middle of the board (the tab aside)
  const C = o.cake;
  if (C && C.on !== false) {
    const ch = clamp(C.h ?? 50, 10, 300);
    if (C.shape === 'rect') { const cw = clamp(C.w ?? 100, 20, 2000), cl = clamp(C.l ?? 100, 20, 2000); addCake(rt.group, o, rt, { rect: [cw, cl, Math.min(cw, cl) * .06 + (o.cbShape === 'rect' ? (o.cbR || 0) * .5 : 0)], y0: h, h: ch }); }
    else { const cd = clamp(C.d ?? 100, 20, 2000); addCake(rt.group, o, rt, { R: cd / 2, y0: h, h: Math.min(ch, cd * .7) }); }
  }
  boardColors(o, rt);
}
/* the edge's look: the covering turned over it (foil metal, or the paper's colour and finish) or the cut board */
function boardColors(o, rt) {
  const m = rt.cbSideMat; if (!m) return;
  const top = o.faces.top?.bg || '#ffffff', foil = isFoil(o.cbCover), fin = FINISHES[o.finish] || FINISHES.gloss;
  if (!o.cbWrap) Object.assign(m, { metalness: 0, roughness: .92, clearcoat: 0 }), m.color.set(o.edge || RAW_BOARD);
  else if (foil) Object.assign(m, { metalness: 1, roughness: .26, clearcoat: 0 }), m.color.set(top);
  else Object.assign(m, { metalness: fin.m, roughness: fin.r, clearcoat: fin.cc, clearcoatRoughness: fin.ccr }), m.color.set(top);
}

/* ---------- the sheets for print ---------- */
/* the outline grown by m (the smooth one: a scalloped board is die-cut, not wrapped) */
function grown(P, m) { const N = normals(P); return P.map(([x, z], i) => [x + N[i][0] * m, z + N[i][1] * m]); }
/* the covering sheet of the top (cut round the outline, or grown by the turn-over when it wraps the edge, the edge
   and the turn-under marked as folds) and, with the underside covered, the sheet under it */
function boardNet(o) {
  const B = boardOutline(o), h = clamp(o.dims.h, 1, 40), wrap = o.cbWrap && o.cbEdge !== 'scallop', m = wrap ? h + 12 : 0, gap = 15;
  const sheet = (P, ox, oy, under) => P.map(([x, z]) => [ox + x - B.x0, oy + (under ? B.z1 - z : z - B.z0)]);   // the underside reads turned over towards you
  const sm = resample(B.smooth, 1.5).P;
  const top = { key: 'top', x: m, y: m, w: B.W, h: B.D, poly: sheet(wrap ? grown(sm, m) : B.P, m, m), folds: wrap ? [sheet(sm, m, m), sheet(grown(sm, h), m, m)] : [] };
  const n = { W: B.W + 2 * m, H: B.D + 2 * m, board: true, panels: [top] };
  if (o.cbBottom === 'covered') {
    // under it, a sheet a little smaller than the board hides the turned-in edge
    const x = n.W + gap, inset = wrap ? 3 : 0;
    n.panels.push({ key: 'bottom', x, y: m, w: B.W, h: B.D, poly: sheet(inset ? grown(sm, -inset) : B.P, x, m, true), folds: [] });
    n.W = x + B.W;
  }
  return n;
}

export { BOARD_BOTTOM, BOARD_COVER, BOARD_SHAPE, RAW_BOARD, applyBoardPreset, boardColors, boardDefaults, fitCake, boardFaceMM, boardFacePath, boardFin, boardGrain, boardNet, boardOutline, buildBoard, setBoardCover };
