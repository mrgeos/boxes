// Сборка: каркас складывания, собранный из развёртки (панели на сгибах, как в дереве)
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';
import { netLayout } from '../core/model.js';
import { dieLines } from './box-net.js';
import { netWindows } from './box.js';
import { mailerFold } from './mailer.js';
import { rrectPts } from '../scene/geometry.js';

/* The «Сборка» slider shows the blank folding into the box. While it is below 100 % the object shows this rig instead
   of its model: every panel of the blank is a flat piece (the print on one side, the board's inner side on the other,
   the thickness between) hung on its parent by the crease they share (dieLines finds the creases). A family
   (mailerFold) says which panel is the root and how each crease turns; at 100 % the rig is dropped and the model
   shows. The blank lies printed side up; it turns over first (the first FLIP of the way) and then folds away from the
   print, which is how a box is made: the print ends outside. A panel is a flat shape in the plane y = 0 (x across the
   sheet, z down it); its board lies below it (−y). Lengths mm, scaled by S in the geometry and positions. */
const FLIP = .2, SPAN = .45;
const sm = x => x * x * (3 - 2 * x), rad = a => a * Math.PI / 180;
/* the family of an object that can fold (read when asked: the modules import one another in a ring) */
const foldFamily = o => (o.type === 'box' && o.lidType === 'f0427' && (o.netV ?? 2) >= 2 ? mailerFold : null);
const canFold = o => !!foldFamily(o);

const rect = p => [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]];
/* where a point of the sheet lies in the face's picture (fractions, v down), the panel turned by its quarter turns */
function faceUV(p, X, Y) {
  const q = (((p.q ?? (p.rot ? 2 : 0)) % 4) + 4) % 4, a = (X - p.x) / p.w, b = (Y - p.y) / p.h;
  let u = a, v = b;
  if (q === 2) { u = 1 - a; v = 1 - b; } else if (q === 1) { u = b; v = 1 - a; } else if (q === 3) { u = 1 - b; v = a; }
  const c = p.crop; if (c) { u = c[0] + u * (c[2] - c[0]); v = c[1] + v * (c[3] - c[1]); }
  return [u, 1 - v];
}
/* a flat shape (outline and holes, sheet mm) in the plane y = y0, relative to (ox, oy), the face towards +y (or −y, flipped) */
function flatGeo(outline, holes, ox, oy, y0, flip, uvOf) {
  const m = ([X, Y]) => new THREE.Vector2(X - ox, -(Y - oy));
  const sh = new THREE.Shape(outline.map(m));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(m)));
  const g = new THREE.ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) { const [u, v] = uvOf ? uvOf(pos.getX(i) + ox, pos.getZ(i) + oy) : [0, 0]; uv.setXY(i, u, v); pos.setY(i, y0); }
  if (flip) { const ix = g.index; for (let i = 0; i < ix.count; i += 3) { const b = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, b); } }
  g.scale(S, S, S); g.computeVertexNormals();
  return g;
}
/* the parts of the edge a→b (axis-aligned) that no crease covers; slanted edges whole */
function openParts(a, b, creases) {
  const hor = Math.abs(a[1] - b[1]) < .01, ver = Math.abs(a[0] - b[0]) < .01;
  if (!hor && !ver) return [[a, b]];
  const i = hor ? 0 : 1, c = hor ? 1 : 0, lo = Math.min(a[i], b[i]), hi = Math.max(a[i], b[i]);
  const cov = creases.filter(s => (hor ? Math.abs(s[1] - s[3]) < .01 && Math.abs(s[1] - a[1]) < .01 : Math.abs(s[0] - s[2]) < .01 && Math.abs(s[0] - a[0]) < .01))
    .map(s => [Math.min(s[i], s[i + 2]), Math.max(s[i], s[i + 2])]).sort((p, q) => p[0] - q[0]);
  const out = []; let cur = lo;
  for (const [s, e] of cov) { if (s > cur + .01) out.push([cur, Math.min(s, hi)]); cur = Math.max(cur, e); }
  if (hi > cur + .01) out.push([cur, hi]);
  return out.filter(([s, e]) => e - s > .01).map(([s, e]) => (hor ? [[s, a[c]], [e, a[c]]] : [[a[c], s], [a[c], e]]));
}

/* the rig of an object: a tree of Groups, posed by poseRig(rig, t); null when the blank cannot be folded */
function buildRig(o, rt) {
  const fam = foldFamily(o); if (!fam) return null;
  const net = netLayout(o), T = fam.T(o), panels = net.panels.filter(p => !p.part && !p.circle && !p.fan && p.ang == null);
  const pieces = panels.map(p => ({ key: p.key, joins: p.joins, pts: p.poly || rect(p) }));
  const { links } = dieLines(pieces);
  // one crease between two panels: the longest shared edge
  const pair = new Map();
  for (const l of links) { const k = l.a + '-' + l.b, len = Math.hypot(l.seg[2] - l.seg[0], l.seg[3] - l.seg[1]); if (!pair.has(k) || len > pair.get(k).len) pair.set(k, { ...l, len }); }
  const adj = panels.map(() => []);
  for (const l of pair.values()) { adj[l.a].push({ to: l.b, seg: l.seg }); adj[l.b].push({ to: l.a, seg: l.seg }); }
  const root = panels.findIndex(fam.root); if (root < 0) return null;
  const nodes = [], seen = new Set([root]), queue = [{ i: root, parent: null, seg: null, depth: 0 }];
  while (queue.length) {
    const n = queue.shift(); nodes.push(n);
    for (const { to, seg } of adj[n.i]) if (!seen.has(to)) { seen.add(to); queue.push({ i: to, parent: n, seg, depth: n.depth + 1 }); }
  }
  const sheet = nodes.flatMap(n => pieces[n.i].pts), xs = sheet.map(v => v[0]), ys = sheet.map(v => v[1]);
  const rp = panels[root], rx = rp.x + rp.w / 2, ry = rp.y + rp.h / 2;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2 - rx, cz = (Math.min(...ys) + Math.max(...ys)) / 2 - ry, zh = (Math.max(...ys) - Math.min(...ys)) / 2;
  const F = new THREE.Group(), R = new THREE.Group(); F.add(R); R.position.set(-cx * S, 0, -cz * S);
  F.name = 'fold-rig';
  const wins = netWindows(o, net).filter(q => q.lid);
  const meshes = [];
  const mesh = (parent, geo, mat, data, extra = {}) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, face: null, ...data };
    Object.assign(m, extra); parent.add(m); meshes.push(m); return m;
  };
  for (const n of nodes) {
    const p = panels[n.i], par = n.parent;
    let ox, oy;
    if (!par) { ox = rx; oy = ry; } else { ox = (n.seg[0] + n.seg[2]) / 2; oy = (n.seg[1] + n.seg[3]) / 2; }
    n.ox = ox; n.oy = oy;
    const h = par ? fam.hinge(panels[par.i], p, T) : { ang: 0, a: 0 };
    n.ang = rad(h.ang); n.a = h.a;
    n.content = new THREE.Group(); n.content.position.y = h.a * S;
    if (!par) { n.rot = n.content; R.add(n.content); n.content.position.y = 0; }
    else {
      const anchor = new THREE.Group(), horiz = Math.abs(n.seg[1] - n.seg[3]) < .01, vert = Math.abs(n.seg[0] - n.seg[2]) < .01;
      if (!horiz && !vert) return null;   // a slanted crease: not folded here
      anchor.position.set((ox - par.ox) * S, -h.a * S, (oy - par.oy) * S);
      const pts = pieces[n.i].pts, mx = pts.reduce((s, v) => s + v[0], 0) / pts.length, my = pts.reduce((s, v) => s + v[1], 0) / pts.length;
      // the axis along the crease, and which way the panel lies from it; the turn away from the print is down (−y)
      const side = horiz ? Math.sign(my - oy) : Math.sign(mx - ox);
      n.axis = horiz ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      n.sign = horiz ? side : -side;
      n.rot = new THREE.Group(); anchor.add(n.rot); n.rot.add(n.content); par.content.add(anchor);
    }
    // the panel: print side up, the board's side below it, the cut edges between
    const outline = pieces[n.i].pts, holes = (p.holes || []).slice();
    if (p.key === 'top') for (const q of wins) {
      if (q.x + q.w / 2 < p.x || q.x + q.w / 2 > p.x + p.w || q.y + q.h / 2 < p.y || q.y + q.h / 2 > p.y + p.h) continue;
      holes.push(q.polys ? q.polys[0].map(v => [v.x, v.y]) : rrectPts(q.x + q.w / 2, q.y + q.h / 2, q.w, q.h, q.radii?.[0] ?? 0).map(v => [v.x, v.y]));
    }
    const face = rt.faces[p.key], hasFace = !!face && p.key !== 'fold';
    const backKey = p.key === 'bottom' ? 'insideBottom' : p.key === 'top' ? 'inside' : null, back = backKey && rt.faces[backKey];
    const ox0 = ox, oy0 = oy;
    mesh(n.content, flatGeo(outline, holes, ox0, oy0, 0, false, hasFace ? (X, Y) => faceUV(p, X, Y) : null), hasFace ? face.mat : rt.foldMat, { face: hasFace ? p.key : null });
    mesh(n.content, flatGeo(outline, holes, ox0, oy0, -T, true, back && p.q === 0 ? (X, Y) => [(X - p.x) / p.w, (Y - p.y) / p.h] : null), back && p.q === 0 ? back.mat : rt.innerMat, { face: back && p.q === 0 ? backKey : null });
    // edges: every side of the outline and the holes but where a crease runs
    const creases = [...(par ? [n.seg] : []), ...nodes.filter(k => k.parent === n).map(k => k.seg)];
    const v = [];
    const edge = (a, b, ctl) => { for (const [s, e] of ctl ? openParts(a, b, creases) : [[a, b]]) { const A = [(s[0] - ox0) * S, 0, (s[1] - oy0) * S], B = [(e[0] - ox0) * S, 0, (e[1] - oy0) * S], Z = -T * S; v.push(...A, ...B, B[0], Z, B[2], ...A, B[0], Z, B[2], A[0], Z, A[2]); } };
    outline.forEach((a, i) => edge(a, outline[(i + 1) % outline.length], true));
    for (const hl of holes) hl.forEach((a, i) => edge(a, hl[(i + 1) % hl.length], false));
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); eg.computeVertexNormals();
    mesh(n.content, eg, rt.edgeMat, {});
    // a window: its film in the middle of the board
    if (p.key === 'top') for (const hl of holes.slice((p.holes || []).length)) {
      const fm = mesh(n.content, flatGeo(hl, [], ox0, oy0, -T / 2, false, null), rt.filmMat, {}, { renderOrder: 2 }); fm.castShadow = false; fm.raycast = () => {};
    }
  }
  const depth = Math.max(1, ...nodes.map(n => n.depth));
  return { group: F, nodes, meshes, T, cx, cz, zh, depth, panels };
}

/* poses the rig at t: 0 the blank flat, print up; the first FLIP turns it over; then the creases close, outer ones first */
function poseRig(rig, t) {
  const u = sm(clamp(t / FLIP, 0, 1)), phi = Math.PI * u, { T, cx, cz, zh } = rig;
  rig.group.rotation.x = phi;
  rig.group.position.set(cx * u * S, (T * Math.max(Math.cos(phi), 0) + zh * Math.abs(Math.sin(phi))) * S, -cz * u * S);
  const ft = clamp((t - FLIP) / (1 - FLIP), 0, 1), D = rig.depth;
  for (const n of rig.nodes) {
    if (!n.parent) continue;
    const start = (n.depth - 1) * (1 - SPAN) / Math.max(1, D - 1);
    n.rot.quaternion.setFromAxisAngle(n.axis, n.sign * n.ang * sm(clamp((ft - start) / SPAN, 0, 1)));
  }
  rig.group.updateMatrixWorld(true);
}
function disposeRig(rig) { for (const m of rig.meshes) m.geometry.dispose(); }

export { buildRig, canFold, disposeRig, foldFamily, poseRig };
