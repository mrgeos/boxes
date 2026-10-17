// Рифлёный лоток: ванночка с рифлёными стенками, формованная крышка или запаянная плёнка
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';
import { TOUCH } from '../core/model.js';
import { rrectPts } from '../scene/geometry.js';
import { envTexture } from '../scene/environments.js';

/* ---------- thermoformed / foil food tray ----------
   One parametric shape. The plan is a rounded rectangle walked in 8 pieces (4 straight sides, 4 corners); one section
   (the profile: rim, wall, bottom edge, band, floor) is carried round it and pushed in along its normal by the flutes,
   so the ribs, the scallops of the bottom, the rim and the lid always agree.
   dims: w × d = overall size at the rim INCLUDING the flange (or the roll), h = overall height of the tray
   (the lid is on top of it). Inside, L = w − 2·FLANGE, W = d − 2·FLANGE are the sizes of the wall at the rim. */
const FLANGE = 8, ROLL = 1.8, TAB_CORNER = 3;   // mm; the roll's radius; the corner (front right) where the pull tab is
const TRAY_MATS = { pp: 'Белый ПП', pet: 'Прозрачный ПЭТ', black: 'Чёрный ПП', foil: 'Фольга' };
const TRAY_LID = { formed: 'Формованная крышка', film: 'Запаянная плёнка' };
const TRAY_RIM = { flange: 'Фланец', roll: 'Закатка' };
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const defaultRibs = () => ({ pitch: 14, depth: 3, width: .42, flat: .35, margin: 10, onBottom: true, corners: false });
const defaultBot = () => ({ r: 7, band: 11, inset: 3 });
/* the fields a preset sets (a copy of the nested ones) */
const applyTrayPreset = (o, p) => Object.assign(o, structuredClone(p.tray), { lid: 0 });
/* the fields with their defaults; the type may have been switched from another one, so the lid type is checked */
function trayDefaults(o) {
  o.cornerR ??= 14; o.draft ??= 7; o.rim ??= 'flange';
  o.ribs = { ...defaultRibs(), ...o.ribs }; o.bot = { ...defaultBot(), ...o.bot };
  if (o.lidType !== 'film') o.lidType = 'formed';
  o.lidSteps ??= 2; o.lidStepH ??= 5; o.tab ??= true; o.tabL ??= 18; o.tabW ??= 16; o.tabPeel ??= 0; o.mat ??= 'pp';
}

/* ---------- the numbers everything is built from ---------- */
function trayGeom(o) {
  const { w, d, h } = o.dims, rb = { ...defaultRibs(), ...o.ribs }, bt = { ...defaultBot(), ...o.bot };
  const L = Math.max(40, w - 2 * FLANGE), W = Math.max(30, d - 2 * FLANGE), H = Math.max(10, h - .5), roll = o.rim === 'roll';
  const G = { L, W, H, rimY: H + .5, roll, R: clamp(o.cornerR ?? 14, 2, Math.min(L, W) / 2 - .6), tan: Math.tan(clamp(o.draft ?? 7, 0, 20) * Math.PI / 180),
    rib: { pitch: Math.max(2, rb.pitch), depth: rb.depth, width: clamp(rb.width, .1, .95), flat: clamp(rb.flat, 0, .9), margin: Math.max(0, rb.margin), onBottom: rb.onBottom !== false, corners: !!rb.corners },
    bot: { r: clamp(bt.r, 1, 20), band: Math.max(2, bt.band), inset: Math.max(0, bt.inset) },
    film: o.lidType === 'film', steps: clamp(Math.round(o.lidSteps ?? 2), 1, 3), stepH: clamp(o.lidStepH ?? 5, 2, 14),
    tab: o.tab !== false, tabL: o.tabL ?? 18, tabW: o.tabW ?? 16, peel: clamp(o.tabPeel ?? 0, 0, 170) };
  // the sealed film lies on the rim's top: the plan out to the flange (to the roll's top)
  G.fd = roll ? -FLANGE + ROLL : -FLANGE + .8; G.fhx = L / 2 - G.fd; G.fhy = W / 2 - G.fd;
  if (G.film) { G.top = [2 * G.fhx, 2 * G.fhy]; G.lidH = .7; }
  else {
    G.lid = lidProfile(G); G.lidH = G.lid.panelZ - G.rimY;
    // the label: the top panel less a 4 mm margin
    G.top = [Math.max(10, L - 2 * G.lid.panelD - 8), Math.max(10, W - 2 * G.lid.panelD - 8)];
  }
  return G;
}

/* ---------- the plan ---------- */
/* the ring's samples: [piece, u]; the same for every offset, so the rows of the surface line up. sp: spacing along the
   straight sides, sc: round the corners (mm) */
function ringSamples(G, sp, sc) {
  const { L, W, R } = G, s = [], nL = Math.max(1, Math.round((L - 2 * R) / sp)), nW = Math.max(1, Math.round((W - 2 * R) / sp));
  const nC = clamp(Math.ceil(R * Math.PI / 2 / sc), 6, 40), counts = [nL, nC, nW, nC, nL, nC, nW, nC];
  counts.forEach((n, p) => { for (let i = 0; i < n; i++) s.push([p, i / n]); });
  return s;
}
/* the point of the plan inset by d (mm) at [piece, u], with the plan's outward direction there */
function planAt(L, W, R, d, p, u) {
  const hx = L / 2 - d, hy = W / 2 - d, r = Math.max(0.4, Math.min(R - d, hx - 0.5, hy - 0.5));
  const ex = Math.max(0, hx - r), ey = Math.max(0, hy - r);
  switch (p) {
    case 0: return [-ex + 2 * ex * u, -hy, 0, -1];
    case 2: return [hx, -ey + 2 * ey * u, 1, 0];
    case 4: return [ex - 2 * ex * u, hy, 0, 1];
    case 6: return [-hx, ey - 2 * ey * u, -1, 0];
  }
  const c = [[ex, -ey, -90], [ex, ey, 0], [-ex, ey, 90], [-ex, -ey, 180]][(p - 1) / 2], a = (c[2] + 90 * u) * Math.PI / 180;
  return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), Math.cos(a), Math.sin(a)];
}
/* the flutes along a straight side: 0 on a crest, 1 at the bottom of a groove. Grooves stand evenly between the
   plain corner blocks; the first and last part a crest from the block */
function groove(G, p, u, sideLen) {
  const rb = G.rib;
  if (p % 2) {
    // a corner: grooves at the same pitch round the arc, if asked for
    if (!rb.corners) return 0;
    const n = Math.max(1, Math.round(G.R * Math.PI / 2 / rb.pitch)), t = Math.abs(u * n - Math.floor(u * n) - .5) / (rb.width / 2);
    return t >= 1 ? 0 : t < rb.flat ? 1 : 0.5 * (1 + Math.cos(Math.PI * (t - rb.flat) / (1 - rb.flat)));
  }
  const x = u * sideLen, m = rb.margin, span = sideLen - 2 * m; if (span <= rb.pitch * 0.6) return 0;
  const n = Math.max(1, Math.round(span / rb.pitch)), step = span / n, half = rb.width * step / 2;
  let g = 0;
  for (let k = 0; k <= n; k++) {
    const t = Math.abs(x - (m + k * step)) / half; if (t >= 1) continue;
    g = Math.max(g, t < rb.flat ? 1 : 0.5 * (1 + Math.cos(Math.PI * (t - rb.flat) / (1 - rb.flat))));
  }
  return g;
}

/* ---------- the profiles: one section as (d inward, z up, fade of the flutes) ---------- */
function trayProfile(G) {
  const { H } = G, rb = G.bot.r, band = G.bot.band, inset = G.bot.inset, tan = G.tan, F = FLANGE, pts = [];
  const add = (d, z, f) => pts.push([d, z, f]);
  const seg = (a, b, n, fade) => { for (let i = 0; i < n; i++) { const t = i / n; add(lerp(a[0], b[0], t), lerp(a[1], b[1], t), fade(t)); } };
  const quad = (a, c, b, n, fade) => { for (let i = 0; i < n; i++) { const t = i / n, s = 1 - t; add(s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1], fade(t)); } };
  const dK = H * tan, wallEnd = [tan * (H - rb), rb], filletEnd = [dK + rb, 0], bandEnd = [dK + rb + band, 0], step = Math.max(1.5, inset), panel = [bandEnd[0] + step, inset];
  if (G.roll) {
    // a curl: the edge rolled outward and under into a tube, walked from its tucked end back over the top
    const c = [-F + ROLL, H + .5 - ROLL];
    for (let i = 0; i < 12; i++) { const a = (400 - 310 * i / 12) * Math.PI / 180; add(c[0] + ROLL * Math.cos(a), c[1] + ROLL * Math.sin(a), 0); }
    seg([c[0], H + .5], [-.6, H + .5], 3, () => 0);
  } else {
    // a rolled lip under the flange's outer edge, then the flange
    quad([-F, H - 2.2], [-F - .6, H], [-F + .8, H + .5], 4, () => 0);
    seg([-F + .8, H + .5], [-.6, H + .5], 3, () => 0);
  }
  // a little bead where the wall starts
  quad([-.6, H + .5], [0, H + .5], [0, H - .8], 3, () => 0);
  // the wall: the flutes come in under the flange
  const wallTop = [0, H - .8];
  // (a straight line: rows only where the flutes' fade changes, under the flange)
  const fade = z => smooth(H - 4, H - 10, z), zAt = z => Math.min(wallTop[1], Math.max(wallEnd[1], z)), tAt = z => (wallTop[1] - z) / (wallTop[1] - wallEnd[1]);
  const t1 = tAt(zAt(H - 4)), t2 = tAt(zAt(H - 10));
  for (const [ta, tb, n] of [[0, t1, 2], [t1, t2, 8], [t2, 1, 3]]) {
    for (let i = 0; i < n; i++) { const t = lerp(ta, tb, i / n); if (tb > ta) add(lerp(wallTop[0], wallEnd[0], t), lerp(wallTop[1], wallEnd[1], t), fade(lerp(wallTop[1], wallEnd[1], t))); }
  }
  // the bottom edge, round: the flutes roll under it
  quad(wallEnd, [dK, 0], filletEnd, 10, () => 1);
  // the band round the bottom: scallops, fading out at the panel (or ending at the edge)
  seg(filletEnd, bandEnd, 8, t => G.rib.onBottom ? 1 - smooth(.72, 1, t) : 0);
  quad(bandEnd, [panel[0], 0], panel, 4, () => 0);
  add(panel[0], panel[1], 0);
  return { pts, panelD: panel[0], panelZ: inset };
}
/* the lid: its flange over the tray's, then terraces stepping up and in, and the top panel for the label */
function lidProfile(G) {
  const n = G.steps, h = G.stepH, F = FLANGE, pts = [], z0 = G.H + 1.1;
  const add = (d, z) => pts.push([d, z, 0]);
  const seg = (a, b, k) => { for (let i = 0; i < k; i++) { const t = i / k; add(lerp(a[0], b[0], t), lerp(a[1], b[1], t)); } };
  seg([-F - .4, z0 - 2.4], [-F - .4, z0], 4);
  seg([-F - .4, z0], [1.5, z0], 10);
  let d = 1.5, z = z0;
  const run = Math.min(G.L, G.W) * 0.05;
  for (let i = 0; i < n; i++) {
    seg([d, z], [d + h * .18, z + h], 8); d += h * .18; z += h;
    seg([d, z], [d + run, z], 8); d += run;
  }
  add(d, z);
  return { pts, panelD: d, panelZ: z };
}

/* ---------- a surface swept: the profile carried round the plan, pushed in along the profile's normal by the flutes ---------- */
function sweep(G, { pts }, fluted, sp, sc) {
  const { L, W, R } = G, ring = ringSamples(G, sp, sc), side = [L - 2 * R, 0, W - 2 * R, 0, L - 2 * R, 0, W - 2 * R, 0];
  const pos = new Float32Array(pts.length * ring.length * 3), idx = [];
  let k = 0;
  for (let j = 0; j < pts.length; j++) {
    const [d, z, fade] = pts[j], a = pts[Math.max(0, j - 1)], b = pts[Math.min(pts.length - 1, j + 1)];
    let td = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(td, tz) || 1; td /= tl; tz /= tl;
    const nIn = [-tz, td];   // into the container: inward on the wall, up on the bottom
    for (const [p, u] of ring) {
      const g = fluted && fade > 0 ? G.rib.depth * fade * groove(G, p, u, side[p]) : 0;
      const [x, y] = planAt(L, W, R, d + g * nIn[0], p, u);
      pos[k++] = x * S; pos[k++] = (z + g * nIn[1]) * S; pos[k++] = y * S;
    }
  }
  const n = ring.length;
  for (let j = 0; j < pts.length - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * n + i, b = j * n + (i + 1) % n, c = a + n, e = b + n;
    idx.push(a, c, b, b, c, e);
  }
  // texture coordinates in real length (50 mm a tile): along the ring, and down the profile
  const uv = new Float32Array(pts.length * n * 2), UV = 50 * S;
  for (let j = 0; j < pts.length; j++) {
    let s = 0;
    const v = j ? uv[((j - 1) * n) * 2 + 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]) * S / UV : 0;
    for (let i = 0; i < n; i++) {
      const a = (j * n + i) * 3, b = (j * n + (i + n - 1) % n) * 3;
      if (i) s += Math.hypot(pos[a] - pos[b], pos[a + 2] - pos[b + 2]) / UV;
      uv[(j * n + i) * 2] = s; uv[(j * n + i) * 2 + 1] = v;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
/* a flat panel: the plan inset by d, at height z */
function panel(G, d, z) {
  const { L, W, R } = G, sh = new THREE.Shape(), ring = ringSamples(G, 1000, 1.5);
  ring.forEach(([p, u], i) => { const [x, y] = planAt(L, W, R, d, p, u); i ? sh.lineTo(x * S, y * S) : sh.moveTo(x * S, y * S); });
  const geo = new THREE.ShapeGeometry(sh); geo.rotateX(Math.PI / 2); geo.translate(0, z * S, 0);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (50 * S), p.getZ(i) / (50 * S));
  return geo;
}

/* ---------- the sealed film with the pull tab ---------- */
/* the film's outline on the plan (mm): the ring out to the rim's top, with the tab's chord cut at the front right
   corner. The tab is its own piece hinged on that chord, so it can be peeled up */
const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
function filmPlan(G) {
  const { L, W, R, fd: d, fhx: hx, fhy: hy } = G, r = Math.max(0.4, Math.min(R - d, hx - .5, hy - .5)), arc = r * Math.PI / 2;
  const w = Math.min(G.tabW, arc * .9), du = w / 2 / arc, pts = [];
  let a = null, b = null;
  for (const [p, u] of ringSamples(G, 1000, 1.5)) {
    if (G.tab && p === TAB_CORNER && Math.abs(u - .5) < du) {
      if (!a) { a = planAt(L, W, R, d, p, .5 - du); b = planAt(L, W, R, d, p, .5 + du); if (pts.length && same(pts[pts.length - 1], a)) pts.pop(); pts.push(a, b); }
      continue;
    }
    const q = planAt(L, W, R, d, p, u);
    if (!(pts.length && same(pts[pts.length - 1], q))) pts.push(q);
  }
  let tab = null;
  if (a) {
    const hw = w * .38, q0 = Math.max(hw + 1, G.tabL - hw), t = [b[0] - a[0], b[1] - a[1]], tl = Math.hypot(...t), o = planAt(L, W, R, d, TAB_CORNER, .5);
    tab = { w, hw, q0, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t: [t[0] / tl, t[1] / tl], o: [o[2], o[3]] };
  }
  return { pts, a, tab };
}
/* the tab's local (s along the chord, q out from it) → the plan */
const tabXY = (T, s, q) => [T.m[0] + T.t[0] * s + T.o[0] * q, T.m[1] + T.t[1] * s + T.o[1] * q];
/* the film with its tab, flat: the plan points of its cut, and the outline of the tab on its own */
function filmOutline(G) {
  const F = filmPlan(G), out = [], T = F.tab;
  for (const p of F.pts) {
    out.push([p[0], p[1]]);
    if (T && p === F.a) for (let i = 0; i <= 10; i++) { const t = Math.PI * (1 - i / 10); out.push(tabXY(T, T.hw * Math.cos(t), T.q0 + T.hw * Math.sin(t))); }
  }
  // (the chord a→b is replaced by the tab: after a come its edge points, then b)
  return { cut: out, body: F.pts.map(p => [p[0], p[1]]), tab: T && [tabXY(T, -T.w / 2, 0), ...Array.from({ length: 11 }, (_, i) => { const t = Math.PI * (1 - i / 10); return tabXY(T, T.hw * Math.cos(t), T.q0 + T.hw * Math.sin(t)); }), tabXY(T, T.w / 2, 0)] };
}
function flipTriangles(geo) {
  const ix = geo.index; for (let i = 0; i < ix.count; i += 3) { const b = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, b); }
}
function film(G, z) {
  const { fhx: hx, fhy: hy } = G, F = filmPlan(G);
  const sh = new THREE.Shape(); F.pts.forEach(([x, y], i) => i ? sh.lineTo(x * S, y * S) : sh.moveTo(x * S, y * S));
  const geo = new THREE.ShapeGeometry(sh); geo.rotateX(Math.PI / 2); geo.translate(0, z * S, 0);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) / S + hx) / (2 * hx), (hy - p.getZ(i) / S) / (2 * hy));
  flipTriangles(geo); geo.computeVertexNormals();   // the shape lies face down after the turn: its front side must look up
  if (!F.tab) return { geo, tab: null };
  // the tab, drawn in (s along the chord, q out from it), then laid at the corner and turned up by the peel
  const T = F.tab, ts = new THREE.Shape();
  ts.moveTo(-T.w / 2, 0); ts.lineTo(T.w / 2, 0); ts.lineTo(T.hw, T.q0); ts.absarc(0, T.q0, T.hw, 0, Math.PI, false); ts.lineTo(-T.w / 2, 0);
  const tab = new THREE.ShapeGeometry(ts, 16), tp = tab.attributes.position, phi = G.peel * Math.PI / 180;
  for (let i = 0; i < tp.count; i++) {
    const s = tp.getX(i), q = tp.getY(i);
    tp.setXYZ(i, (T.m[0] + T.t[0] * s + T.o[0] * q * Math.cos(phi)) * S, (z + q * Math.sin(phi)) * S, (T.m[1] + T.t[1] * s + T.o[1] * q * Math.cos(phi)) * S);
  }
  if (T.t[1] * T.o[0] - T.t[0] * T.o[1] < 0) flipTriangles(tab);   // (the y of t × o: which way the drawn shape faces once laid)
  tab.computeVertexNormals();
  return { geo, tab };
}

/* ---------- the net: what is printed (and cut) ---------- */
function trayNet(o) {
  const G = trayGeom(o), [tw, th] = G.top;
  if (!G.film) return { W: tw, H: th, panels: [{ key: 'top', x: 0, y: 0, w: tw, h: th, part: true, r: topRadius(G) }] };
  // film: the face is its bounding rectangle; net y runs from the back (the top of the picture) to the front
  const F = filmOutline(G), hx = G.fhx, hy = G.fhy, all = [...F.cut, [-hx, -hy], [hx, hy]];
  const x0 = Math.min(...all.map(p => p[0])), y0 = Math.min(...all.map(p => p[1])), x1 = Math.max(...all.map(p => p[0])), y1 = Math.max(...all.map(p => p[1]));
  const m = pts => pts.map(([x, y]) => [x - x0, y - y0]);
  const { L, W, R } = G, safe = [];
  for (const [p, u] of ringSamples(G, 1000, 1.5)) { const q = planAt(L, W, R, G.fd + 4, p, u); safe.push([q[0], q[1]]); }
  const panels = [{ key: 'top', x: -hx - x0, y: -hy - y0, w: 2 * hx, h: 2 * hy, poly: m(F.body) }];
  if (F.tab) { const tp = m(F.tab); panels.push({ key: 'tab', x: Math.min(...tp.map(p => p[0])), y: Math.min(...tp.map(p => p[1])), w: 1, h: 1, poly: tp, part: true, nolabel: true }); }
  return { W: x1 - x0, H: y1 - y0, panels, tray: { cut: m(F.cut), safe: m(safe) } };
}
/* corner radius of the print rectangle on a formed lid */
const topRadius = G => {
  const d = G.lid?.panelD ?? 0;
  return Math.max(3, Math.max(.4, Math.min(G.R - d, G.L / 2 - d - .5, G.W / 2 - d - .5)) - 4);   // the top panel's corner less the margin
};

/* ---------- facts ---------- */
/* the volume to the flange (the flutes taken out), ml */
function trayVolumeMl(o) {
  const G = trayGeom(o), { L, W, R, H, tan } = G, rb = G.rib;
  let v = 0; const steps = 60;
  for (let i = 0; i < steps; i++) {
    const z = (i + .5) / steps * H, d = (H - z) * tan, hx = L - 2 * d, hy = W - 2 * d, r = Math.max(0, R - d);
    v += (hx * hy - (4 - Math.PI) * r * r) * H / steps;
  }
  const span = s => Math.max(0, s - 2 * rb.margin), nG = s => span(s) > rb.pitch * .6 ? Math.round(span(s) / rb.pitch) + 1 : 0;
  const grooves = 2 * nG(L - 2 * R) + 2 * nG(W - 2 * R), gw = rb.width * rb.pitch;
  v -= grooves * gw * rb.depth * (0.5 + 0.5 * rb.flat) * (H - 10);
  v -= (L - 2 * (H * tan + G.bot.r + G.bot.band)) * (W - 2 * (H * tan + G.bot.r + G.bot.band)) * G.bot.inset;
  return Math.max(0, v / 1000);
}
/* where things lie on the floor: half sizes (mm) and the height */
function trayFloor(o) {
  const G = trayGeom(o), tp = trayProfile(G);
  return { A: Math.max(5, G.L / 2 - tp.panelD - 2), B: Math.max(5, G.W / 2 - tp.panelD - 2), y: tp.panelZ + .2, round: false };
}

/* ---------- materials ---------- */
/* the foil's crinkle: tileable ridged noise turned into a normal map (made once, only when a foil tray exists; the
   noise is seeded, so it is the same every time; the texture is shared and never disposed) */
let crinkleTex = null;
function crinkle() {
  if (crinkleTex) return crinkleTex;
  const N = 512, h = new Float32Array(N * N);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [g, amp] of [[8, 1], [16, .55], [32, .3], [64, .15]]) {
    const v = Array.from({ length: g * g }, rnd), at = (i, j) => v[(j % g) * g + (i % g)];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / N * g, fy = y / N * g, i = Math.floor(fx), j = Math.floor(fy), sx = fx - i, sy = fy - j;
      const ux = sx * sx * (3 - 2 * sx), uy = sy * sy * (3 - 2 * sy);
      const n = lerp(lerp(at(i, j), at(i + 1, j), ux), lerp(at(i, j + 1), at(i + 1, j + 1), ux), uy);
      h[y * N + x] += amp * (1 - Math.abs(2 * n - 1));   // ridged: creases where the noise crosses its middle
    }
  }
  const c = document.createElement('canvas'); c.width = c.height = N;
  const x2 = c.getContext('2d'), img = x2.createImageData(N, N), k = 6;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N]) * k, dy = (h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x]) * k, l = Math.hypot(dx, dy, 1), o = (y * N + x) * 4;
    img.data[o] = (-dx / l * .5 + .5) * 255; img.data[o + 1] = (dy / l * .5 + .5) * 255; img.data[o + 2] = (1 / l * .5 + .5) * 255; img.data[o + 3] = 255;
  }
  x2.putImageData(img, 0, 0);
  crinkleTex = new THREE.CanvasTexture(c); crinkleTex.wrapS = crinkleTex.wrapT = THREE.RepeatWrapping; crinkleTex.anisotropy = 8;
  return crinkleTex;
}
const FOIL_ENV = 1;
const PLASTIC = {
  pp: { color: '#f3f3f1', metalness: 0, roughness: .32, clearcoat: .35, clearcoatRoughness: .25 },
  black: { color: '#18181a', metalness: 0, roughness: .28, clearcoat: .6, clearcoatRoughness: .15 },
  foil: { color: '#d4d6d9', metalness: 1, roughness: .3, clearcoat: 0, clearcoatRoughness: 0 },
};
/* the bowl's material by o.mat (clear PET is the editor's own PET material); the tab takes the film's colour */
function trayMaterial(o, rt) {
  if (!rt.bowl) return;
  const m = rt.bowlMat, k = o.mat in TRAY_MATS ? o.mat : 'pp', pet = k === 'pet';
  if (!pet) {
    Object.assign(m, { ...PLASTIC[k], color: new THREE.Color(PLASTIC[k].color) });
    m.normalMap = k === 'foil' ? crinkle() : null; m.normalScale.set(.3, .3); m.needsUpdate = true;
  }
  // metal shows what is round it: the foil keeps its own bright room, whatever studio the scene has (a metal in a dark
  // studio goes black). The texture is asked for each time: the cache is cleared when the graphics card is lost.
  const room = envTexture('room');
  for (const mm of [m, rt.tabBackMat]) { mm.envMap = k === 'foil' || mm === rt.tabBackMat ? room : null; mm.envMapIntensity = FOIL_ENV; mm.needsUpdate = true; }
  for (const b of rt.bowl) { b.material = pet ? rt.petMat : m; b.castShadow = !pet; }
  rt.tabMat.color.set(o.board || '#ffffff');
}
/* raises the lid: it lifts off, slides back a little and tilts about the rim (as the dome's) */
function trayLidAt(o, rt) {
  if (!rt.trayLid) return;
  const G = trayGeom(o), f = clamp(o.lid / 125, 0, 1);
  rt.trayLid.position.set(0, (G.rimY + f * (G.lidH + 25)) * S, -f * G.W * .18 * S); rt.trayLid.rotation.x = -f * .32;
}

function buildTray(o, rt) {
  const G = trayGeom(o), g = rt.group, F = k => rt.faces[k].mat, Y0 = G.rimY * S;
  rt.bowlMat ??= new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
  rt.tabMat ??= new THREE.MeshStandardMaterial({ roughness: .5 });
  rt.tabBackMat ??= new THREE.MeshStandardMaterial({ color: 0xd4d6d9, metalness: 1, roughness: .35, side: THREE.BackSide });
  // fine enough for the flutes (about 5 samples across a groove), coarser on a touch screen
  const sp = clamp(G.rib.pitch * G.rib.width / 5, .4, 1) * (TOUCH ? 2 : 1), tp = trayProfile(G);
  rt.bowl = [];
  for (const geo of [sweep(G, tp, true, sp, sp), panel(G, tp.panelD, tp.panelZ)]) {
    const m = new THREE.Mesh(geo, rt.bowlMat); m.receiveShadow = true; m.userData = { objId: o.id, face: null }; g.add(m); rt.bowl.push(m);
  }
  // picking is done on a coarse smooth copy of the bowl: the fluted mesh has up to 200 000 triangles, too many for a ray on every mouse move
  const pick = new THREE.Mesh(sweep(G, tp, false, 8, 8), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  rt.bowl[0].raycast = function (rc, hits) {
    pick.matrixWorld.copy(this.matrixWorld); const n = hits.length; pick.raycast(rc, hits);
    for (let i = n; i < hits.length; i++) hits[i].object = this;
  };
  rt.bowl[0].geometry.addEventListener('dispose', () => { pick.geometry.dispose(); pick.material.dispose(); });
  // the lid hangs from the rim: its parts are built in the tray's space and moved down by the rim's height
  const lg = new THREE.Group(); lg.position.y = Y0; g.add(lg); rt.trayLid = lg;
  const rel = geo => geo.translate(0, -Y0, 0);
  const [tw, th] = G.top, topMesh = geo => { const m = new THREE.Mesh(geo, F('top')); m.userData = { objId: o.id, face: 'top' }; m.renderOrder = 3; lg.add(m); return m; };
  if (G.film) {
    const f = film(G, G.rimY + .2);
    // the print on the film's top side only; its underside is the foil backing
    const body = topMesh(rel(f.geo)); body.castShadow = true;
    const under = new THREE.Mesh(f.geo, rt.tabBackMat); under.raycast = () => {}; lg.add(under);
    if (f.tab) {
      rel(f.tab);
      const t = new THREE.Mesh(f.tab, rt.tabMat), back = new THREE.Mesh(f.tab, rt.tabBackMat);
      t.castShadow = true; for (const m of [t, back]) { m.raycast = () => {}; lg.add(m); }
    }
  } else {
    for (const geo of [sweep(G, G.lid, false, 1000, 3), panel(G, G.lid.panelD, G.lid.panelZ)]) {
      const m = new THREE.Mesh(rel(geo), rt.petMat); m.raycast = () => {}; lg.add(m);
    }
    // the print on the top panel (clear PET: only the layers show)
    const rf = Math.min(topRadius(G), tw / 2 - .1, th / 2 - .1);
    const pg = new THREE.ShapeGeometry(new THREE.Shape(rrectPts(0, 0, tw * S, th * S, rf * S))), pp = pg.attributes.position, pu = pg.attributes.uv;
    for (let i = 0; i < pp.count; i++) pu.setXY(i, pp.getX(i) / (tw * S) + .5, pp.getY(i) / (th * S) + .5);
    const print = topMesh(pg); print.rotation.x = -Math.PI / 2; print.position.y = (G.lid.panelZ - G.rimY + .15) * S;
  }
  trayLidAt(o, rt);
}

export { TRAY_LID, TRAY_MATS, TRAY_RIM, applyTrayPreset, buildTray, trayDefaults, trayFloor, trayGeom, trayLidAt, trayMaterial, trayNet, trayVolumeMl };
