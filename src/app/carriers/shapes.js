// Коробки особой формы: подушка, домик с ручкой, пирамида, многогранник с крышкой
import * as THREE from 'three';
import { S, V2, clamp } from '../core/util.js';
import { planeGeoHole, rrectPts } from '../scene/geometry.js';

/* Folding cartons of their own shape (o.lidType names it; they have no lid of the usual kind):
   pillow — a flattened tube whose ends are pushed in along curved creases: w across, d long, h thick;
   gable — a box (w × d × h walls) with a roof: the front and back rise in slopes to a ridge and on into a handle
     of two plies with a hand hole; the sides end in gables;
   pyramid — o.sides triangles from the base (fitted to w × d) up to the apex at h;
   hexagon — a prism of o.sides walls (fitted to w × d), h high, with a cap lid lidH high.
   Lengths mm. */
const SHAPES = ['pillow', 'gable', 'pyramid', 'hexagon'];
const isShape = o => o.type === 'box' && SHAPES.includes(o.lidType);
const shapeSides = o => clamp(Math.round(o.sides || (o.lidType === 'pyramid' ? 4 : 6)), 3, o.lidType === 'pyramid' ? 8 : 12);
/* the base polygon (mm, x right, z toward the front), its front edge first, then on round to the right; fitted to w × d */
function polyPts(o, grow = 0) {
  const n = shapeSides(o), a0 = Math.PI / 2 + Math.PI / n, raw = [];
  for (let i = 0; i < n; i++) { const a = a0 + i * 2 * Math.PI / n; raw.push([Math.cos(a), Math.sin(a)]); }
  const xs = raw.map(p => p[0]), zs = raw.map(p => p[1]), sx = (o.dims.w + 2 * grow) / (Math.max(...xs) - Math.min(...xs)), sz = (o.dims.d + 2 * grow) / (Math.max(...zs) - Math.min(...zs));
  const cz = (Math.max(...zs) + Math.min(...zs)) / 2;
  // the first edge (from the first vertex to the second) is the front one: z largest; it must run toward +x
  const pts = raw.map(([x, z]) => [x * sx, (z - cz) * sz]);
  let best = 0, bz = -Infinity;
  for (let i = 0; i < n; i++) { const z = (pts[i][1] + pts[(i + 1) % n][1]) / 2; if (z > bz + 1e-9) { bz = z; best = i; } }
  let out = [...pts.slice(best), ...pts.slice(0, best)];
  // the other way round: the same front edge first, run toward +x
  if (out[1][0] < out[0][0]) out = [out[1], out[0], ...out.slice(2).reverse()];
  return out;
}
const perimeter = pts => pts.reduce((s, p, i) => s + Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]), 0);
/* ---------- pillow ---------- */
function pillowDims(o) {
  const { w, h, d } = o.dims, e = Math.min(h * .9, d * .25), N = 60, prof = [];
  let s = 0;
  for (let i = 0; i <= N; i++) { const x = -w / 2 + w * i / N, y = h / 2 * Math.cos(Math.PI * x / w); if (i) s += Math.hypot(w / N, y - prof[i - 1][1]); prof.push([x, y, s]); }
  return { e, P: s, prof };
}
function buildPillow(o, rt) {
  const { w, h, d } = o.dims, D = pillowDims(o), g = rt.group, nu = 48, nv = 64, F = k => rt.faces[k].mat;
  const arc = x => { const t = (x + w / 2) / w * (D.prof.length - 1), i = Math.min(D.prof.length - 2, Math.floor(t)), f = t - i; return D.prof[i][2] * (1 - f) + D.prof[i + 1][2] * f; };
  for (const side of [1, -1]) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const x = -w / 2 + w * i / nu, z = -d / 2 + d * j / nv, c = Math.cos(Math.PI * x / w), lim = D.e * (1 - (2 * x / w) ** 2);
      const k = lim < 1e-6 ? 1 : clamp((d / 2 - Math.abs(z)) / lim, 0, 1), y = h / 2 + side * h / 2 * c * Math.sin(k * Math.PI / 2);
      pos.push(x * S, y * S, z * S);
      const u = arc(x) / D.P; uv.push(side > 0 ? u : 1 - u, (d / 2 - z) / d);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const p = j * (nu + 1) + i, q = p + 1, r = p + nu + 1, s2 = r + 1; side > 0 ? idx.push(p, r, q, q, r, s2) : idx.push(p, q, r, q, s2, r); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, F(side > 0 ? 'front' : 'back')); m.castShadow = m.receiveShadow = true;
    m.userData = { objId: o.id, face: side > 0 ? 'front' : 'back', noFrame: true }; g.add(m);
  }
}
function pillowNet(o) {
  const { d, w } = o.dims, D = pillowDims(o), gw = 15, panels = [], tabs = [], N = 24;
  // the curved creases at both ends of each panel (the ends folded in along them)
  const creases = x0 => {
    const out = [];
    for (const end of [0, 1]) for (let i = 0; i < N; i++) {
      const f = (a) => { const x = -w / 2 + w * a / N, s = D.prof[Math.round(a / N * (D.prof.length - 1))][2], e = D.e * (1 - (2 * x / w) ** 2); return [x0 + s, end ? d - e : e]; };
      const [a1, b1] = f(i), [a2, b2] = f(i + 1); out.push([a1, b1, a2, b2]);
    }
    return out;
  };
  panels.push({ key: 'front', x: gw, y: 0, w: D.P, h: d, q: 0, creases: creases(gw) }, { key: 'back', x: gw + D.P, y: 0, w: D.P, h: d, q: 0, creases: creases(gw + D.P) });
  tabs.push({ on: 'front', pts: [[gw, D.e + 2], [0, D.e + 6], [0, d - D.e - 6], [gw, d - D.e - 2]] });
  return { v: 2, shape: 'pillow', W: gw + 2 * D.P, H: d, panels, tabs };
}
/* ---------- gable ---------- */
function gableDims(o) {
  const { w, d } = o.dims, rh = clamp(o.roofH ?? Math.round(d * .45), 5, d * 2), gh = clamp(o.gripH ?? Math.round(Math.min(80, w * .3)), 20, 200);
  const sl = Math.hypot(d / 2, rh), hw = Math.min(90, w * .6), hhole = Math.min(24, gh * .35);
  return { rh, gh, sl, hw, hhole, hy: gh * .55 };
}
function buildGable(o, rt, { add, addG }) {
  const { w, h, d } = o.dims, G = gableDims(o), g = rt.group, P = Math.PI, F = k => rt.faces[k].mat, T = clamp(o.thickness, .3, 5);
  const W = w * S, H = h * S, Dd = d * S;
  add(g, W, H, F('front'), [0, H / 2, Dd / 2], [0, 0, 0], { face: 'front' });
  add(g, W, H, F('back'), [0, H / 2, -Dd / 2], [0, P, 0], { face: 'back' });
  add(g, W, Dd, F('bottom'), [0, 0, 0], [P / 2, 0, 0], { face: 'bottom' });
  // the gable ends: the side wall and its triangle up to the ridge
  for (const [key, sx] of [['right', 1], ['left', -1]]) {
    const pts = [V2(-d / 2, -(h + G.rh) / 2), V2(d / 2, -(h + G.rh) / 2), V2(d / 2, h - (h + G.rh) / 2), V2(0, (h + G.rh) / 2), V2(-d / 2, h - (h + G.rh) / 2)].map(v => V2(v.x * S, v.y * S));
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts)), pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / Dd + .5, pos.getY(i) / ((h + G.rh) * S) + .5);
    addG(g, geo, F(key), [sx * W / 2, (h + G.rh) / 2 * S, 0], [0, sx * P / 2, 0], { face: key, noFrame: true });
  }
  // the roof slopes and the handle above them: one face each side, the slope its lower part
  const a = G.sl / (G.sl + G.gh), tilt = Math.atan2(d / 2, G.rh);
  for (const [key, sz] of [['roofFront', 1], ['roofBack', -1]]) {
    const pv = new THREE.Group(); pv.position.set(0, H, sz * Dd / 2); pv.rotation.y = sz > 0 ? 0 : P; g.add(pv);
    const slope = new THREE.PlaneGeometry(W, G.sl * S), suv = slope.attributes.uv;
    for (let i = 0; i < suv.count; i++) suv.setY(i, suv.getY(i) * a);
    const sm = addG(pv, slope, F(key), [0, 0, 0], [0, 0, 0], { face: key, noFrame: true });
    sm.position.set(0, G.rh / 2 * S, -d / 4 * S); sm.rotation.x = -tilt;
    const hole = rrectPts(0, (G.hy - G.gh / 2) * S, G.hw * S, G.hhole * S, G.hhole / 2 * S);
    const grip = planeGeoHole(W, G.gh * S, hole), guv = grip.attributes.uv;
    for (let i = 0; i < guv.count; i++) guv.setY(i, a + guv.getY(i) * (1 - a));
    addG(pv, grip, F(key), [0, (G.rh + G.gh / 2) * S, -(d / 2 - T / 2) * S], [0, 0, 0], { face: key, noFrame: true });
  }
  add(g, W, 2 * T * S, rt.edgeMat, [0, (h + G.rh + G.gh) * S, 0], [-P / 2, 0, 0]);
}
function gableNet(o) {
  const { w, h, d } = o.dims, G = gableDims(o), gw = 15, panels = [], tabs = [], top = G.sl + G.gh;
  const xs = [gw, gw + d, gw + d + w, gw + 2 * d + w];
  const gable = (key, x) => ({ key, x, y: top - G.rh, w: d, h: h + G.rh, q: 0, poly: [[x, top], [x + d / 2, top - G.rh], [x + d, top], [x + d, top + h], [x, top + h]] });
  panels.push(gable('left', xs[0]), { key: 'front', x: xs[1], y: top, w, h, q: 0 }, gable('right', xs[2]), { key: 'back', x: xs[3], y: top, w, h, q: 0 });
  // the roof and handle over the front and back walls: a crease where the slope meets the handle, the hand hole
  for (const [key, x] of [['roofFront', xs[1]], ['roofBack', xs[3]]]) {
    const cx = x + w / 2, cy = G.gh - G.hy, hole = rrectPts(0, 0, G.hw, G.hhole, G.hhole / 2).map(v => [cx + v.x, cy - v.y]);
    panels.push({ key, x, y: 0, w, h: top, q: 0, creases: [[x, G.gh, x + w, G.gh]], holes: [hole] });
  }
  // the bottom under the front wall, a glue flap under the back
  panels.push({ key: 'bottom', x: xs[1], y: top + h, w, h: d, q: 0 }, { key: 'bflap', blank: 'клей', fs: 4, x: xs[3], y: top + h, w, h: 20 });
  tabs.push({ on: 'left', pts: [[gw, top + 2], [0, top + 6], [0, top + h - 6], [gw, top + h - 2]] });
  return { v: 2, shape: 'gable', W: gw + 2 * d + 2 * w, H: top + h + d, panels, tabs };
}
/* ---------- pyramid ---------- */
function pyramidSides(o) {
  const pts = polyPts(o), A = [0, o.dims.h, 0];
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length], M = [(p[0] + q[0]) / 2, 0, (p[1] + q[1]) / 2], b = Math.hypot(q[0] - p[0], q[1] - p[1]), s = Math.hypot(A[0] - M[0], A[1], A[2] - M[2]);
    return { p, q, M, b, s, key: 'side' + (i + 1) };
  });
}
function buildPyramid(o, rt, { addG }) {
  const g = rt.group, F = k => rt.faces[k].mat, A = new THREE.Vector3(0, o.dims.h, 0);
  for (const sd of pyramidSides(o)) {
    // a triangle in the face's own frame (its middle at the origin), set on the side's plane
    const geo = new THREE.BufferGeometry(), b = sd.b * S, s = sd.s * S;
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-b / 2, -s / 2, 0, b / 2, -s / 2, 0, 0, s / 2, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, .5, 1], 2)); geo.computeVertexNormals();
    const P0 = new THREE.Vector3(sd.p[0], 0, sd.p[1]), P1 = new THREE.Vector3(sd.q[0], 0, sd.q[1]), M = new THREE.Vector3(...sd.M);
    const ex = P1.clone().sub(P0).normalize(), ey = A.clone().sub(M).normalize(), ez = new THREE.Vector3().crossVectors(ex, ey);
    const m = addG(g, geo, F(sd.key), [0, 0, 0], [0, 0, 0], { face: sd.key });
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez)); m.position.copy(M.add(A).multiplyScalar(.5)).multiplyScalar(S);
  }
  addG(g, basePoly(o), F('bottom'), [0, 0, 0], [Math.PI / 2, 0, 0], { face: 'bottom' });
}
/* the polygon of the base as a face (its picture over w × d), facing down (or up) */
function basePoly(o, grow = 0, up = false) {
  // facing down the shape's y is the world's z; facing up (turned the other way) it is -z
  const pts = polyPts(o, grow), geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => V2(x * S, (up ? -z : z) * S)))), pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / ((o.dims.w + 2 * grow) * S) + .5, pos.getY(i) / ((o.dims.d + 2 * grow) * S) + .5);
  return geo;
}
/* the pyramid's sheet: the base in the middle, each side's triangle folded out flat round it */
function pyramidNet(o) {
  const panels = [], sides = pyramidSides(o), pts = polyPts(o);
  // the base as seen from below: front up (z → -y on the sheet)
  const base = pts.map(([x, z]) => [x, -z]);
  const xs0 = base.map(v => v[0]), ys0 = base.map(v => v[1]);
  panels.push({ key: 'bottom', x: Math.min(...xs0), y: Math.min(...ys0), w: o.dims.w, h: o.dims.d, q: 0, poly: base });
  for (const sd of sides) {
    const a = [sd.p[0], -sd.p[1]], b = [sd.q[0], -sd.q[1]], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // outward on the sheet: away from the base's middle
    let nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len; if (nx * m[0] + ny * m[1] < 0) { nx = -nx; ny = -ny; }
    const apex = [m[0] + nx * sd.s, m[1] + ny * sd.s], poly = [a, b, apex], xs = poly.map(v => v[0]), ys = poly.map(v => v[1]);
    // the face's picture: its base edge on the base, its apex out; turned by the angle of the outward direction
    const ang = Math.atan2(nx, -ny);
    panels.push({ key: sd.key, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), poly, joins: ['bottom'], ang, cx: (m[0] + apex[0]) / 2, cy: (m[1] + apex[1]) / 2, fw: sd.b, fh: sd.s });
  }
  return shiftNet(panels, [], { shape: 'pyramid' });
}
/* ---------- polygon prism with a cap lid ---------- */
function hexDims(o) {
  const t = clamp(o.thickness, .3, 5), lh = clamp(o.lidH ?? Math.round(o.dims.h * .3), 5, o.dims.h), pts = polyPts(o), lid = polyPts(o, t + .4);
  return { t, lh, pts, lid, P: perimeter(pts), PL: perimeter(lid) };
}
/* walls along a polygon (y0 .. y0 + h), the face's picture running round them */
function walls(parent, o, pts, y0, h, mat, data, addG, inner = null) {
  const P = perimeter(pts); let s = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), geo = new THREE.PlaneGeometry(L * S, h * S), uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (s + uv.getX(k) * L) / P);
    const ang = Math.atan2(-(q[1] - p[1]), q[0] - p[0]), pos = [(p[0] + q[0]) / 2 * S, (y0 + h / 2) * S, (p[1] + q[1]) / 2 * S];
    addG(parent, geo, mat, pos, [0, ang, 0], data);
    if (inner) addG(parent, new THREE.PlaneGeometry(L * S, h * S), inner, pos, [0, ang + Math.PI, 0], { face: 'inside', wall: true });
    s += L;
  });
}
function buildHexagon(o, rt, { addG }) {
  const X = hexDims(o), g = rt.group, F = k => rt.faces[k].mat, P = Math.PI;
  walls(g, o, X.pts, 0, o.dims.h, F('wrap'), { face: 'wrap', noFrame: true }, addG, rt.innerMat);
  addG(g, basePoly(o), F('bottom'), [0, 0, 0], [P / 2, 0, 0], { face: 'bottom' });
  addG(g, basePoly(o, 0, true), rt.innerMat, [0, X.t * S, 0], [-P / 2, 0, 0], { face: 'inside', wall: true });
  // the cap: a top and its own walls, a little larger than the box
  const lid = new THREE.Group(); g.add(lid); rt.lidGroup = lid; rt.lidBase = o.dims.h * S; rt.lidPivot = null;
  walls(lid, o, X.lid, X.t - X.lh, X.lh, F('lidWrap'), { face: 'lidWrap', noFrame: true }, addG, rt.innerMat);
  addG(lid, basePoly(o, X.t + .4, true), F('top'), [0, X.t * S, 0], [-P / 2, 0, 0], { face: 'top' });
  addG(lid, basePoly(o, X.t + .4), rt.innerMat, [0, 0, 0], [P / 2, 0, 0], { face: 'inside', wall: true });
}
/* the prism's sheets: the walls in a row (each its slice of the picture), the bottom below the front wall, a glue flap;
   the lid's the same with its top above its front wall */
function hexNet(o) {
  const X = hexDims(o), n = X.pts.length, panels = [], tabs = [], h = o.dims.h, gw = 15;
  const row = (key, pts, P, y, hh, x0) => {
    let s = 0;
    pts.forEach((p, i) => { const q = pts[(i + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]); panels.push({ key, x: x0 + s, y, w: L, h: hh, q: 0, crop: [s / P, 0, (s + L) / P, 1] }); s += L; });
    tabs.push({ on: key, pts: [[x0 + s, y + 2], [x0 + s + gw, y + 6], [x0 + s + gw, y + hh - 6], [x0 + s, y + hh - 2]] });
  };
  // the polygon hung on the front wall's edge: the front edge along it
  const cap = (key, pts, x0, y, below) => {
    const zf = pts[0][1];
    const poly = pts.map(([x, z]) => [x0 - pts[0][0] + x, below ? y + (zf - z) : y - (zf - z)]), xs = poly.map(v => v[0]), ys = poly.map(v => v[1]);
    panels.push({ key, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), q: 0, poly });
  };
  row('wrap', X.pts, X.P, 0, h, 0); cap('bottom', X.pts, 0, h, true);
  const ly = h + o.dims.d + 30 + o.dims.d;
  row('lidWrap', X.lid, X.PL, ly, X.lh, 0); cap('top', X.lid, 0, ly, false);
  return shiftNet(panels, tabs, { shape: 'hexagon' });
}
function shiftNet(panels, tabs, extra) {
  const all = [...panels.flatMap(p => p.poly || [[p.x, p.y], [p.x + p.w, p.y + p.h]]), ...tabs.flatMap(t => t.pts)];
  const x0 = Math.min(...all.map(v => v[0])), y0 = Math.min(...all.map(v => v[1])), mv = ([x, y]) => [x - x0, y - y0];
  for (const p of panels) { p.x -= x0; p.y -= y0; if (p.poly) p.poly = p.poly.map(mv); if (p.cx != null) { p.cx -= x0; p.cy -= y0; } if (p.holes) p.holes = p.holes.map(q => q.map(mv)); if (p.creases) p.creases = p.creases.map(([a, b, c, d]) => [a - x0, b - y0, c - x0, d - y0]); }
  for (const t of tabs) t.pts = t.pts.map(mv);
  return { v: 2, W: Math.max(...all.map(v => v[0])) - x0, H: Math.max(...all.map(v => v[1])) - y0, panels, tabs, ...extra };
}

export { SHAPES, buildGable, buildHexagon, buildPillow, buildPyramid, gableDims, gableNet, hexDims, hexNet, isShape, pillowDims, pillowNet, pyramidNet, pyramidSides, shapeSides };
