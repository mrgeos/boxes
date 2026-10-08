// Лента вокруг коробки или круглой упаковки: две полосы крестом, бант или узел сверху
import * as THREE from 'three';
import { S, clamp, uid } from '../core/util.js';
import { RT, applyLid, contactMat, maxAniso } from '../scene/renderer.js';
import { invalidate } from '../scene/camera.js';
import { artImg } from '../core/vector.js';

/* A ribbon is tied crosswise: one band goes round the object across its width, the other across its depth, both
   through the middle of the top (ox, oz: the cross moved off the middle, mm; 0 for now), and they are tied over
   the cross with a bow or a knot. A band lies taut over the object: its path is the convex outline of the object's
   section along the band (with the lid closed), as wide as the ribbon, a ribbon's thickness off the surface. The
   ribbon can repeat a text or a logo along it. When the lid is opened, the ribbon is off (hidden); it is back when
   the lid is closed. All lengths are mm. */
const RIBBON_MAT = { satin: 'Атлас', grosgrain: 'Репс', twine: 'Шпагат / джут' };
const RIBBON_BOW = { classic: 'Классический бант', puffy: 'Пышный бант', knot: 'Узел без банта' };
const RIBBON_PRINT = { none: 'Без печати', text: 'Текст', logo: 'Логотип' };
const MAT_COLOR = { satin: '#b3243b', grosgrain: '#1f3b63', twine: '#c4a57a' };
/* what a ribbon can be tied round: boxes (but a handle box, whose handle is on top) and the round ones */
const ribbonFits = o => !!o && (o.type === 'box' ? o.lidType !== 'handle' : ['dome', 'tube', 'torte'].includes(o.type));
const ribbonsOf = o => ribbonFits(o) ? o.ribbons || [] : [];
const thickOf = r => r.mat === 'twine' ? r.w : r.mat === 'grosgrain' ? .45 : .3;
function ribbonName(r) {
  return r.mat === 'twine' ? 'Шпагат' : r.mat === 'grosgrain' ? 'Репсовая лента' : 'Атласная лента';
}
/* a new ribbon for object o, sized by it */
function newRibbon(o, over = {}) {
  const mat = over.mat || 'satin', small = Math.min(o.dims.w, o.dims.d ?? o.dims.w);
  const w = mat === 'twine' ? 3 : clamp(Math.round(small * .12), 6, 40);
  return { id: uid(), mat, w, color: MAT_COLOR[mat], print: 'none', text: 'Ваш текст', font: 'Inter', textColor: '#ffffff', src: null, aspect: 1,
    printSize: Math.round(w * .55), gap: 20, bow: 'classic', bowSize: Math.round(clamp(w * 1.8, 18, 90)), tails: Math.round(clamp(w * 2.6, 25, 140)), tie: 'cross', ox: 0, oz: 0, ...over };
}
/* a ribbon made of another stuff: twine is a cord of a few mm, the others are tapes */
function setRibbonMat(o, r, mat) {
  const was = r.mat; if (!RIBBON_MAT[mat] || was === mat) return;
  r.mat = mat;
  if (mat === 'twine' || was === 'twine') {
    const fresh = newRibbon(o, { mat });
    Object.assign(r, { w: fresh.w, bowSize: fresh.bowSize, tails: fresh.tails, printSize: fresh.printSize });
  }
  if (r.color === MAT_COLOR[was]) r.color = MAT_COLOR[mat];
}

/* ---------- the object's outline ---------- */
/* the triangles of the object as it stands with the lid closed, in its own frame (mm); its extras that are not under
   the ribbon (the ribbons themselves, a carrier over the top, the contact shadows) are left out */
function objectTris(rt) {
  rt.group.updateMatrixWorld(true);
  const inv = rt.group.matrixWorld.clone().invert(), M = new THREE.Matrix4(), v = new THREE.Vector3(), out = [];
  const walk = n => {
    if (!n.visible || n === rt.ribbons || n === rt.carry) return;
    if (n.isMesh && n.material !== contactMat && n.geometry?.attributes.position) {
      M.multiplyMatrices(inv, n.matrixWorld);
      const pos = n.geometry.attributes.position, p = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(M).divideScalar(S); p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z; }
      const idx = n.geometry.index ? n.geometry.index.array : null;
      out.push({ p, idx, n: idx ? idx.length : pos.count });
    }
    for (const c of n.children) walk(c);
  };
  walk(rt.group);
  return out;
}
/* points where the vertical planes through c (offset t along their normal) cut the object: [along d, height] */
function slice(tris, c, d, offsets) {
  const nx = -d[1], nz = d[0], pts = [];
  for (const { p, idx, n } of tris) {
    for (const t of offsets) {
      const k = c[0] * nx + c[1] * nz + t;
      for (let i = 0; i < n; i += 3) {
        const a = (idx ? idx[i] : i) * 3, b = (idx ? idx[i + 1] : i + 1) * 3, e = (idx ? idx[i + 2] : i + 2) * 3;
        const sa = p[a] * nx + p[a + 2] * nz - k, sb = p[b] * nx + p[b + 2] * nz - k, se = p[e] * nx + p[e + 2] * nz - k;
        if ((sa > 0 && sb > 0 && se > 0) || (sa < 0 && sb < 0 && se < 0)) continue;
        for (const [u, su, w, sw] of [[a, sa, b, sb], [b, sb, e, se], [e, se, a, sa]]) {
          if (su === 0) { pts.push([(p[u] - c[0]) * d[0] + (p[u + 2] - c[1]) * d[1], p[u + 1]]); continue; }
          if ((su > 0) === (sw > 0) || sw === 0) continue;
          const f = su / (su - sw), x = p[u] + (p[w] - p[u]) * f, y = p[u + 1] + (p[w + 1] - p[u + 1]) * f, z = p[u + 2] + (p[w + 2] - p[u + 2]) * f;
          pts.push([(x - c[0]) * d[0] + (z - c[1]) * d[1], y]);
        }
      }
    }
  }
  return pts;
}
/* convex hull, counter-clockwise (monotone chain) */
function hull(pts) {
  const P = [...new Map(pts.map(q => [Math.round(q[0] * 20) + ',' + Math.round(q[1] * 20), q])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of P) { while (lo.length > 1 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...P].reverse()) { while (up.length > 1 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/* the hull grown by r all round, its corners rounded (the ribbon bends round an edge) */
function grow(H, r) {
  const out = [], n = H.length;
  const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return Math.atan2(-dx / l, dy / l); };
  for (let i = 0; i < n; i++) {
    const q = H[i], a0 = nrm(H[(i - 1 + n) % n], q); let a1 = nrm(q, H[(i + 1) % n]);
    while (a1 < a0) a1 += Math.PI * 2;
    const k = Math.max(1, Math.ceil((a1 - a0) / (Math.PI / 12)));
    for (let j = 0; j <= k; j++) { const a = a0 + (a1 - a0) * j / k; out.push([q[0] + Math.cos(a) * r, q[1] + Math.sin(a) * r]); }
  }
  return out;
}
/* the outline as a path from the top of the cross line (a = 0) round towards +a: points and the length up to each */
function pathFromTop(poly) {
  const n = poly.length; let best = null;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    if ((p[0] - 0) * (q[0] - 0) > 0 || p[0] === q[0]) continue;
    const f = (0 - p[0]) / (q[0] - p[0]), y = p[1] + (q[1] - p[1]) * f;
    if (!best || y > best.y) best = { i, y };
  }
  if (!best) return null;
  // counter-clockwise goes towards -a over the top: the path walks it backwards
  const pts = [[0, best.y]];
  for (let k = 0; k < n; k++) pts.push(poly[(best.i - k + n) % n]);
  pts.push([0, best.y]);
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len, L: len.at(-1) };
}
/* the start of a path, up to length l */
function pathHead(P, l) {
  const pts = [P.pts[0]], len = [0];
  for (let i = 1; i < P.pts.length && len.at(-1) < l; i++) {
    if (P.len[i] <= l) { pts.push(P.pts[i]); len.push(P.len[i]); continue; }
    const f = (l - P.len[i - 1]) / (P.len[i] - P.len[i - 1]), a = P.pts[i - 1], b = P.pts[i];
    pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); len.push(l);
  }
  return { pts, len, L: len.at(-1) };
}
/* the taut outline round the object along horizontal direction d through c, for a strip of width w, r off it */
function wrapPath(tris, c, d, w, r) {
  const offs = [-w / 2, -w / 4, 0, w / 4, w / 2];
  const H = hull(slice(tris, c, d, offs));
  if (H.length < 3) return null;
  return pathFromTop(grow(H, r).map(([a, y]) => [a, Math.max(y, .05)]));
}

/* ---------- strips ---------- */
const UNIT = 100;   // mm of ribbon per unit of its texture coordinate along it
/* a ribbon strip along 3D points (mm) with the across-direction at each, width w (or w·wf[i]); u by the length so far;
   notch: a V cut into the end, as a tail is cut */
function stripGeo(P, A, w, len, { wf = null, notch = 0 } = {}) {
  const n = P.length, pos = new Float32Array(n * 9), uv = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n; i++) {
    const hw = w * (wf ? wf[i] : 1) / 2;
    for (let j = 0; j < 3; j++) {
      const t = (j - 1) * hw, back = notch && i === n - 1 && j === 1 ? notch : 0;
      // the middle of the cut end is short of the edges: a V notch
      const T = back && i > 0 ? P[i].clone().sub(P[i - 1]).setLength(back) : null, q = P[i].clone().addScaledVector(A[i], t);
      if (T) q.sub(T);
      pos.set([q.x * S, q.y * S, q.z * S], (i * 3 + j) * 3);
      // the print reads along the strip, not mirrored, seen from its outer side
      uv.set([(len[i] - (back || 0)) / UNIT, 1 - j / 2], (i * 3 + j) * 2);
    }
    if (i) for (let j = 0; j < 2; j++) { const a = (i - 1) * 3 + j, b = a + 1, c2 = a + 3, d2 = a + 4; idx.push(a, c2, b, b, c2, d2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/* a cord (twine) along 3D points (mm), radius r; u by length as for a strip */
function cordGeo(P, r, closed = false) {
  const curve = new THREE.CatmullRomCurve3(P.map(p => p.clone().multiplyScalar(S)), closed, 'centripetal');
  const L = curve.getLength() / S, g = new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(L / 2)), r * S, 8, closed);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * L / UNIT);
  return g;
}
/* the length of a run of 3D points and its length so far at each */
const runLen = P => { const l = [0]; for (let i = 1; i < P.length; i++) l.push(l[i - 1] + P[i].distanceTo(P[i - 1])); return l; };
/* a 2D path (a along d, y) through c as 3D points; across it runs the horizontal normal */
function lift(path, c, d) {
  return path.pts.map(([a, y]) => new THREE.Vector3(c[0] + d[0] * a, y, c[1] + d[1] * a));
}

/* ---------- the bow ---------- */
/* one loop of a bow: out from the knot along azimuth psi, rising at elev, length L, its plane leaning by tilt towards
   its side (so the ribbon's face shows from above); as points and their across-direction */
function petal(base, psi, elev, L, w, open = 32, tilt = 0) {
  const h = new THREE.Vector3(Math.cos(psi), 0, Math.sin(psi)), side = new THREE.Vector3(-Math.sin(psi), 0, Math.cos(psi)), Y = new THREE.Vector3(0, 1, 0);
  const up = Y.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt)), across = side.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(Y, -Math.sin(tilt));
  const half = clamp(open + w * .15, 22, 55) * Math.PI / 180, P = [], A = [], wf = [], n = 26;
  for (let i = 0; i <= n; i++) {
    const f = i / n, phi = -half + 2 * half * f, r = L * Math.pow(Math.cos(phi / half * Math.PI / 2), .65), a = elev + phi;
    P.push(base.clone().addScaledVector(h, r * Math.cos(a)).addScaledVector(up, r * Math.sin(a)));
    A.push(across); wf.push(.45 + .55 * Math.sin(Math.PI * f));   // gathered into the knot at both ends
  }
  return { P, A, wf };
}
/* the knot over the cross: a short band wrapped round the gathered middle (its axis along x) */
function knot(base, w, big) {
  const kz = w * (big ? .5 : .38), ky = w * (big ? .42 : .32), P = [], A = [], n = 24, ax = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= n; i++) { const t = -Math.PI / 2 + i / n * Math.PI * 2; P.push(new THREE.Vector3(base.x, base.y + ky + Math.sin(t) * ky, base.z + Math.cos(t) * kz)); A.push(ax); }
  return { P, A, wf: P.map(() => big ? .95 : .8) };
}
/* the loops of a bow by its style: [{ P, A, wf }] */
function bowLoops(r, base) {
  const L = clamp(r.bowSize, 8, 200), w = r.w;
  if (r.bow === 'knot') return [];
  if (r.bow === 'puffy') {
    const out = [], ring = (k, elev, len, rot, open) => { for (let i = 0; i < k; i++) out.push(petal(base, rot + i * Math.PI * 2 / k, elev, len, w, open)); };
    ring(8, .22, L * .85, 0, 30); ring(6, .75, L * .68, Math.PI / 6, 28); ring(3, 1.25, L * .45, Math.PI / 3, 26);
    return out;
  }
  // two loops to the sides, leaning to the front, and their open side up
  return [petal(base, 0, .5, L, w, 40, .45), petal(base, Math.PI, .5, L, w, 40, -.45)];
}

/* ---------- looks ---------- */
const stripes = (draw, w = 64, h = 64) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; return t; };
let ribsTex = null, twistTex = null;
/* grosgrain: fine ribs across the ribbon; twine: plies twisted along the cord */
const ribs = () => ribsTex ??= stripes((x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#000'); g.addColorStop(.5, '#fff'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
const twist = () => twistTex ??= stripes((x, w, h) => {
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = w / 6;
  for (let k = -2; k <= 2; k++) { x.beginPath(); x.moveTo(k * w / 2, h); x.lineTo(k * w / 2 + w, 0); x.stroke(); }
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * .3})`; x.fillRect(Math.random() * w, Math.random() * h, 1, 3); }
});
/* the tile repeated along a printed ribbon: [canvas, its length in mm], or null (no print, or its picture still loading) */
function printTile(r) {
  if (r.mat === 'twine' || !r.print || r.print === 'none') return null;
  const ppm = clamp(160 / r.w, 4, 12), H = Math.round(r.w * ppm), size = clamp(r.printSize || r.w * .55, 1, r.w), gap = clamp(r.gap ?? 20, 0, 400);
  let draw, len;
  if (r.print === 'logo') {
    const im = r.src && artImg(r.src, r.recolor, r.keyout); if (!im) return null;
    const ih = size, iw = ih * (r.aspect || (im.naturalWidth || im.width) / (im.naturalHeight || im.height) || 1);
    len = iw + gap; draw = (x, W) => x.drawImage(im, (W - iw * ppm) / 2, (H - ih * ppm) / 2, iw * ppm, ih * ppm);
  } else {
    const t = (r.text || '').trim(); if (!t) return null;
    const m = document.createElement('canvas').getContext('2d'), font = `600 ${size * ppm}px "${r.font || 'Inter'}", sans-serif`;
    m.font = font; len = m.measureText(t).width / ppm + gap;
    draw = (x, W) => { x.font = font; x.fillStyle = r.textColor || '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, W / 2, H / 2 + size * ppm * .05); };
  }
  len = Math.max(len, 4);
  const c = document.createElement('canvas'); c.width = Math.max(4, Math.min(2048, Math.round(len * ppm))); c.height = H;
  const x = c.getContext('2d'); x.fillStyle = r.color; x.fillRect(0, 0, c.width, H);
  x.save(); x.scale(c.width / (len * ppm), 1); draw(x, len * ppm); x.restore();
  return [c, len];
}
/* the material of ribbon r (its colour, stuff and print), made again when they change */
function ribbonLook(o, r) {
  const rt = RT.get(o.id), G = rt?.ribbonGroups?.get(r.id); if (!G) return;
  invalidate();
  const old = G.userData.mat, tile = printTile(r), twine = r.mat === 'twine';
  const m = r.mat === 'satin' ? new THREE.MeshPhysicalMaterial({ roughness: .3, sheen: .8, sheenRoughness: .3, specularIntensity: .9, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ roughness: twine ? .95 : .72, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
  if (tile) {
    const t = new THREE.CanvasTexture(tile[0]); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = maxAniso;
    t.repeat.set(UNIT / tile[1], 1); m.map = t; m.color.set('#ffffff');
  } else m.color.set(r.color);
  if (r.mat === 'satin') m.sheenColor.set(r.color).lerp(new THREE.Color('#ffffff'), .35);
  if (r.mat === 'grosgrain') { m.bumpMap = ribs().clone(); m.bumpMap.repeat.set(UNIT / .9, 1); m.bumpScale = 1.5; }
  if (twine) { m.bumpMap = twist().clone(); m.bumpMap.repeat.set(UNIT / (r.w * 1.6), 1); m.bumpScale = 3; }
  G.traverse(x => { if (x.isMesh) x.material = m; });
  G.userData.mat = m;
  if (old) { old.map?.dispose(); old.bumpMap?.dispose(); old.dispose(); }
  // its font may come a moment later
  if (tile && r.print === 'text' && document.fonts && !document.fonts.check(`12px "${r.font || 'Inter'}"`)) document.fonts.load(`12px "${r.font || 'Inter'}"`).then(() => ribbonLook(o, r), () => {});
}

/* ---------- building ---------- */
const blank = new THREE.MeshBasicMaterial();   // until the ribbon's own material is put on
function disposeRibbons(rt) {
  if (!rt.ribbons) return;
  rt.ribbons.traverse(x => { if (x.isMesh) x.geometry.dispose(); });
  for (const G of rt.ribbonGroups?.values() || []) { const m = G.userData.mat; if (m) { m.map?.dispose(); m.bumpMap?.dispose(); m.dispose(); } }
  rt.ribbons.removeFromParent(); rt.ribbons = null; rt.ribbonGroups = null;
}
/* the object's ribbons, made again (after the object itself was built, or a ribbon changed) */
function buildRibbons(o, rt = RT.get(o.id)) {
  if (!rt) return;
  invalidate();
  disposeRibbons(rt);
  const list = ribbonsOf(o); if (!list.length) return;
  // their path goes round the object as it is closed
  const lid = o.lid; if (lid) { o.lid = 0; applyLid(o); }
  const tris = objectTris(rt);
  if (lid) { o.lid = lid; applyLid(o); }
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const { p } of tris) for (let i = 0; i < p.length; i += 3) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]); }
  if (!(x1 > x0)) return;
  rt.ribbons = new THREE.Group(); rt.ribbonGroups = new Map(); rt.group.add(rt.ribbons);
  list.forEach((r, k) => {
    const G = new THREE.Group(); G.visible = !r.hidden; rt.ribbons.add(G); rt.ribbonGroups.set(r.id, G);
    const c = [(x0 + x1) / 2 + (r.ox || 0), (z0 + z1) / 2 + (r.oz || 0)], th = thickOf(r), twine = r.mat === 'twine', w = clamp(r.w, 1, 120);
    // several ribbons lie one over the other
    const lift0 = k * th * 2.2 + (twine ? w / 2 : th / 2) + .15;
    const add = geo => { const m = new THREE.Mesh(geo, blank); m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, ribbon: r.id }; G.add(m); };
    const piece = (P, A, len, opt = {}) => add(twine ? cordGeo(P, w / 2, opt.closed) : stripGeo(P, A, w, len, opt));
    // the two bands: across the width, then over it across the depth
    let top = 0;
    [[1, 0], [0, 1]].forEach((d, i) => {
      const P = wrapPath(tris, c, d, twine ? 0 : w, lift0 + i * (twine ? w : th)); if (!P) return;
      const pts = lift(P, c, d), n = new THREE.Vector3(-d[1], 0, d[0]);
      if (twine) pts.pop();
      piece(pts, pts.map(() => n), P.len, { closed: twine });
      top = Math.max(top, P.pts[0][1]);
    });
    if (!top) return;
    const base = new THREE.Vector3(c[0], top + (twine ? w / 2 : th), c[1]);
    // the tails: from the knot down over the top, and over the edge if they are long, cut with a V
    const tl = clamp(r.tails ?? 0, 0, 600);
    if (tl > 1) for (const s of [-1, 1]) {
      // towards the front, splayed
      const a = (r.bow === 'puffy' ? 45 : 35) * Math.PI / 180, dn = [s * Math.sin(a), Math.cos(a)];
      const P = wrapPath(tris, c, dn, twine ? 0 : w, lift0 + (twine ? w * 2 : th * 2.5)); if (!P) continue;
      const head = pathHead(P, tl + w * .3), pts = lift(head, c, dn), n = new THREE.Vector3(-dn[1], 0, dn[0]);
      piece(pts, pts.map(() => n), head.len, { notch: twine ? 0 : w * .35 });
    }
    // the knot and the loops
    const K = knot(base, w, r.bow === 'knot');
    if (twine) add(new THREE.SphereGeometry(w * .9 * S, 12, 8).translate(base.x * S, (base.y + w * .3) * S, base.z * S));
    else piece(K.P, K.A, runLen(K.P), { wf: K.wf });
    for (const L of bowLoops(r, base.clone().setY(base.y + (twine ? w * .3 : w * .25)))) piece(L.P, L.A, runLen(L.P), { wf: twine ? null : L.wf });
    ribbonLook(o, r);
  });
  showRibbons(o);
}
/* on the model while the lid is closed; each one unless hidden */
function showRibbons(o) {
  const rt = RT.get(o.id); if (!rt?.ribbons) return;
  rt.ribbons.visible = !(o.lid > .5);
  for (const r of o.ribbons || []) { const G = rt.ribbonGroups.get(r.id); if (G) G.visible = !r.hidden; }
  invalidate();
}
/* a picture a ribbon prints was loaded */
function ribbonAssetLoaded(o, id) { for (const r of o.ribbons || []) if (r.src === id) ribbonLook(o, r); }

export { RIBBON_BOW, RIBBON_MAT, RIBBON_PRINT, buildRibbons, disposeRibbons, newRibbon, ribbonAssetLoaded, ribbonFits, ribbonLook, ribbonName, ribbonsOf, setRibbonMat, showRibbons };
