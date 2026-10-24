// Сборка: каркас складывания, собранный из развёртки (панели на сгибах, как в дереве)
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';
import { clearLid, faceMM, netLayout } from '../core/model.js';
import { dieLines } from './box-net.js';
import { netWindows } from './box.js';
import { mailerFold } from './mailer.js';
import { isCarton } from './carton-net.js';
import { rscT } from './rsc.js';
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
/* A family says how its blank folds: the roots (the panels that keep their place: the bottom, a telescope lid), and for
   each crease the turn (ang, degrees, + away from the print, − toward it), where the crease lies (a: mm off the print
   side, + toward the board's back, − the other way: a panel that lands inside what it is hinged to) and when it closes
   (rank, default its depth in the tree). info says which way the panel lies from its crease on the sheet. */
const clampT = o => clamp(o.thickness, .3, Math.min(o.dims.w, o.dims.h, o.dims.d) / 4);
const boxFold = {
  T: clampT,
  roots: (ps, o) => [ps.findIndex(p => p.key === 'bottom' && !p.crop), ...(o.lidType === 'telescope' ? [ps.findIndex(p => p.key === 'top')] : [])],
  hinge(par, ch, T, o) {
    const k = ch.key, tuck = o.lidType === 'tuck';
    if (k === 'tab') return { ang: 90, a: -T };
    if (k === 'fold') return { ang: 180, a: T };
    if (k === 'top') return { ang: 90, a: T };
    if (k === 'flap') return { ang: 90, a: tuck ? -T : 0 };
    return { ang: 90, a: 0 };
  },
};
/* the carton: the bottom is a lid off the back (or front) wall; the walls close the tube from it round to the glue flap;
   dust flaps at the top lie under the lid, those at the bottom over the bottom lid */
const cartonFold = {
  T: clampT,
  roots: ps => [ps.findIndex(p => p.key === 'bottom')],
  hinge(par, ch, T, o, info) {
    const k = ch.key;
    if (k === 'tab') return { ang: 90, a: par.key === 'left' || par.key === 'right' ? (info.dy < 0 ? 0 : -T) : -T };
    if (k === 'top') return { ang: 90, a: T, rank: 5 };
    if (k === 'flap') return { ang: 90, a: -T };
    return { ang: 90, a: 0 };
  },
};
/* the shipping carton: the walls round the front bottom flap; the inner flaps of the sides close first, the outer ones over them */
const rscFold = {
  T: o => rscT(o),
  roots: ps => [ps.findIndex(p => p.key === 'bottom' && p.crop && p.crop[1] === 0)],
  hinge(par, ch, T, o, info, depth) {
    const k = ch.key;
    if (k === 'tab') return { ang: 90, a: -T };
    if (k === 'iflap') return { ang: 90, a: -T };
    if (k === 'top' || k === 'bottom') return { ang: 90, a: 0, rank: depth + 1.5 };
    return { ang: 90, a: 0 };
  },
};
/* the family of an object that can fold (read when asked: the modules import one another in a ring) */
function foldFamily(o) {
  if (o.type !== 'box' || (o.netV ?? 2) < 2) return null;
  const lt = o.lidType || 'flat';
  if (lt === 'f0427') return mailerFold;
  if (lt === 'f0201') return rscFold;
  if (lt === 'tuck' && isCarton(o)) return o.style === 'ste' || o.style === 'rte' ? cartonFold : null;
  if (['flat', 'flap', 'tuck', 'none'].includes(lt) || (lt === 'telescope' && !clearLid(o))) return boxFold;
  return null;
}
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

/* where a panel of the face `key` lies on the face (its middle, fractions u across and v down, the crop taken in) */
const faceMid = p => { const c = p.crop || [0, 0, 1, 1]; return [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2]; };

/* the rig of an object: a tree of Groups per root, posed by poseRig(rig, t); null when the blank cannot be folded */
function buildRig(o, rt) {
  const fam = foldFamily(o); if (!fam) return null;
  const net = netLayout(o), T = fam.T(o), H = o.dims.h;
  const tabs = (net.tabs || []).filter(t => t.pts?.length > 2).map(t => {
    const xs = t.pts.map(v => v[0]), ys = t.pts.map(v => v[1]), x = Math.min(...xs), y = Math.min(...ys);
    return { key: 'tab', on: t.on, joins: [t.on], poly: t.pts, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  });
  const panels = [...net.panels.filter(p => !p.part && !p.circle && !p.fan && p.ang == null), ...tabs];
  const pieces = panels.map(p => ({ key: p.key, joins: p.joins, pts: p.poly || rect(p) }));
  const { links } = dieLines(pieces);
  // one crease between two panels: the longest shared edge
  const pair = new Map();
  for (const l of links) { const k = l.a + '-' + l.b, len = Math.hypot(l.seg[2] - l.seg[0], l.seg[3] - l.seg[1]); if (!pair.has(k) || len > pair.get(k).len) pair.set(k, { ...l, len }); }
  const adj = panels.map(() => []);
  for (const l of pair.values()) { adj[l.a].push({ to: l.b, seg: l.seg }); adj[l.b].push({ to: l.a, seg: l.seg }); }
  const rootIs = fam.roots(panels, o).filter(i => i >= 0); if (!rootIs.length) return null;
  const nodes = [], seen = new Set(rootIs), queue = rootIs.map(i => ({ i, parent: null, seg: null, depth: 0, root: null }));
  for (const n of queue) n.root = n;
  while (queue.length) {
    const n = queue.shift(); nodes.push(n);
    for (const { to, seg } of adj[n.i]) if (!seen.has(to)) { seen.add(to); queue.push({ i: to, parent: n, seg, depth: n.depth + 1, root: n.root }); }
  }
  const bbox = ns => { const q = ns.flatMap(n => pieces[n.i].pts), xs = q.map(v => v[0]), ys = q.map(v => v[1]); return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]; };
  const all = bbox(nodes), Gx = (all[0] + all[1]) / 2, Gy = (all[2] + all[3]) / 2;
  const wins = netWindows(o, net), meshes = [], roots = [], group = new THREE.Group();
  group.name = 'fold-rig';
  const mesh = (parent, geo, mat, data, extra = {}) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, face: null, ...data };
    Object.assign(m, extra); parent.add(m); meshes.push(m); return m;
  };
  // each root: where it lies when folded (the bottom: print down at the floor; a telescope lid: print up on the base)
  for (const rn of nodes.filter(n => !n.parent)) {
    const p = panels[rn.i], [u, v] = faceMid(p), top = p.key === 'top', [fw, fd] = faceMM(o, p.key);
    const rx = p.x + p.w / 2, ry = p.y + p.h / 2, [x0, x1, y0, y1] = bbox(nodes.filter(n => n.root === rn));
    const q2 = (((p.q ?? (p.rot ? 2 : 0)) % 4) + 4) % 4 === 2, c = new THREE.Vector3((x0 + x1) / 2 - rx, 0, (y0 + y1) / 2 - ry);
    const axis = q2 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), fin = new THREE.Vector3((u - .5) * fw, top ? H + T : 0, (top ? v - .5 : .5 - v) * fd);
    const qf = new THREE.Quaternion().setFromAxisAngle(axis, top ? 0 : Math.PI);
    const F = new THREE.Group(), R = new THREE.Group(); F.add(R); R.position.set(-c.x * S, 0, -c.z * S); group.add(F);
    roots.push({ node: rn, F, R, flip: !top, late: top ? .3 : 0, axis, hh: q2 ? (x1 - x0) / 2 : (y1 - y0) / 2, flat: [(x0 + x1) / 2 - Gx, (y0 + y1) / 2 - Gy], to: fin.clone().add(c.clone().applyQuaternion(qf)) });
    rn.ox = rx; rn.oy = ry; rn.rotG = R;
  }
  for (const n of nodes) {
    const p = panels[n.i], par = n.parent;
    let ox, oy;
    if (!par) { ox = n.ox; oy = n.oy; } else { ox = (n.seg[0] + n.seg[2]) / 2; oy = (n.seg[1] + n.seg[3]) / 2; }
    n.ox = ox; n.oy = oy;
    const pts = pieces[n.i].pts, mx = pts.reduce((s, q) => s + q[0], 0) / pts.length, my = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    const h = par ? fam.hinge(panels[par.i], p, T, o, { dx: Math.sign(mx - ox), dy: Math.sign(my - oy) }, n.depth) : { ang: 0, a: 0 };
    n.ang = rad(h.ang); n.a = h.a; n.rank = par ? h.rank ?? par.rank + 1 : 0;
    n.content = new THREE.Group();
    if (!par) { n.rot = n.content; n.root.rotG.add(n.content); }
    else {
      n.content.position.y = h.a * S;
      const anchor = new THREE.Group(), horiz = Math.abs(n.seg[1] - n.seg[3]) < .01, vert = Math.abs(n.seg[0] - n.seg[2]) < .01;
      if (!horiz && !vert) return null;   // a slanted crease: not folded here
      anchor.position.set((ox - par.ox) * S, -h.a * S, (oy - par.oy) * S);
      // the axis along the crease, and which way the panel lies from it; the turn away from the print is down (−y)
      const side = horiz ? Math.sign(my - oy) : Math.sign(mx - ox);
      n.axis = horiz ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      n.sign = horiz ? side : -side;
      n.rot = new THREE.Group(); anchor.add(n.rot); n.rot.add(n.content); par.content.add(anchor);
    }
    // the panel: print side up, the board's side below it, the cut edges between
    const outline = pts, own = (p.holes || []).slice(), holes = own.slice(), filmed = [];
    // windows lying wholly in the panel are cut out of it (one running over its edge, or over a crease, stays solid here)
    for (const q of wins) for (const hl of q.polys ? q.polys.map(pl => pl.map(w => [w.x, w.y])) : [rrectPts(q.x + q.w / 2, q.y + q.h / 2, q.w, q.h, q.radii?.[0] ?? 0).map(w => [w.x, w.y])]) {
      if (p.key !== 'tab' && hl.every(w => w[0] > p.x + .3 && w[0] < p.x + p.w - .3 && w[1] > p.y + .3 && w[1] < p.y + p.h - .3) && (!p.poly || hl.every(w => inside(p.poly, w)))) { holes.push(hl); filmed.push(hl); }
    }
    const face = rt.faces[p.key], hasFace = !!face && p.key !== 'fold' && p.key !== 'tab';
    const backKey = p.key === 'bottom' ? 'insideBottom' : p.key === 'top' ? 'inside' : null, back = backKey && !p.crop && (p.q ?? 0) === 0 && rt.faces[backKey];
    mesh(n.content, flatGeo(outline, holes, ox, oy, 0, false, hasFace ? (X, Y) => faceUV(p, X, Y) : null), hasFace ? face.mat : rt.foldMat, { face: hasFace ? p.key : null });
    mesh(n.content, flatGeo(outline, holes, ox, oy, -T, true, back ? (X, Y) => [(X - p.x) / p.w, (Y - p.y) / p.h] : null), back ? back.mat : rt.innerMat, { face: back ? backKey : null });
    // edges: every side of the outline and the holes but where a crease runs
    const creases = [...(par ? [n.seg] : []), ...nodes.filter(k => k.parent === n).map(k => k.seg)];
    const v = [];
    const edge = (a, b, ctl) => { for (const [s, e] of ctl ? openParts(a, b, creases) : [[a, b]]) { const A = [(s[0] - ox) * S, 0, (s[1] - oy) * S], B = [(e[0] - ox) * S, 0, (e[1] - oy) * S], Z = -T * S; v.push(...A, ...B, B[0], Z, B[2], ...A, B[0], Z, B[2], A[0], Z, A[2]); } };
    outline.forEach((a, i) => edge(a, outline[(i + 1) % outline.length], true));
    for (const hl of holes) hl.forEach((a, i) => edge(a, hl[(i + 1) % hl.length], false));
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); eg.computeVertexNormals();
    mesh(n.content, eg, rt.edgeMat, {});
    // a window: its film in the middle of the board
    for (const hl of filmed) { const fm = mesh(n.content, flatGeo(hl, [], ox, oy, -T / 2, false, null), rt.filmMat, {}, { renderOrder: 2 }); fm.castShadow = false; fm.raycast = () => {}; }
  }
  const rank = Math.max(1, ...nodes.map(n => n.rank));
  return { group, nodes, roots, meshes, T, rank, panels };
}
/* is the point inside the polygon */
function inside(poly, [x, y]) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

/* poses the rig at t: 0 the blank flat, print up; the first FLIP turns the bottom over; then the creases close, those
   nearest the roots first, while each root moves to where it ends */
function poseRig(rig, t) {
  const u = sm(clamp(t / FLIP, 0, 1)), phi = Math.PI * u, { T } = rig, ft = clamp((t - FLIP) / (1 - FLIP), 0, 1);
  for (const r of rig.roots) {
    r.F.quaternion.setFromAxisAngle(r.axis, r.flip ? phi : 0);
    // the blank turns over where it lies, then slides to where the box stands as it folds (a lid comes last, to set on the base)
    const w = sm(clamp((ft - r.late) / (1 - r.late), 0, 1)), x = r.flat[0] + (r.to.x - r.flat[0]) * w, z = r.flat[1] + (r.to.z - r.flat[1]) * w;
    // turning over, the blank lifts so no part dips under the floor
    const y = r.flip ? T * Math.max(Math.cos(phi), 0) + r.hh * Math.abs(Math.sin(phi)) : T + (r.to.y - T) * w;
    r.F.position.set(x * S, y * S, z * S);
  }
  const D = rig.rank;
  for (const n of rig.nodes) {
    if (!n.parent) continue;
    const start = (n.rank - 1) * (1 - SPAN) / Math.max(1, D - 1);
    n.rot.quaternion.setFromAxisAngle(n.axis, n.sign * n.ang * sm(clamp((ft - start) / SPAN, 0, 1)));
  }
  rig.group.updateMatrixWorld(true);
}
function disposeRig(rig) { for (const m of rig.meshes) m.geometry.dispose(); }

export { buildRig, canFold, disposeRig, foldFamily, poseRig };
