// Рамка выбранного слоя или наклейки прямо на модели
import * as THREE from 'three';
import { DEG, S } from '../core/util.js';
import { activeLayer, activeObj, sel } from '../core/state.js';
import { faceKeys, faceMM, loopAxis } from '../core/model.js';
import { activeSticker, placementsFor, stickerSize } from '../stickers/placement.js';
import { apply, layerMM, layerReach } from '../faces/wrap.js';
import { RT, scene } from './renderer.js';
import { recording } from './camera.js';

/* The selected layer (or sticker) gets a thin frame with corner marks, so it is clear on the model what the
   panel works on. The frame is drawn on the surface itself: each point of it is found on the meshes printed
   with that face through their texture coordinates. So it follows round walls and bends, rides with a lid that
   opens and folds over edges where the layer or sticker goes on to the next face; parts off every face are left
   out. It is never in a picture of the scene: exports hide it, recording drops it. */
let lines = [], sig = '', built = null;
const mat = new THREE.LineBasicMaterial({ color: 0x0a7aa1, transparent: true, opacity: .95 });
const LIFT = .4 * S, STEP = 1.5;   // off the surface; sampling step along the frame (mm)

/* what is selected: the rectangle (its own mm, centred) and a key that changes whenever the frame would */
function target() {
  const o = activeObj(), rt = o && RT.get(o.id); if (!rt) return null;
  const st = !activeLayer() && activeSticker(), L = !st && activeLayer();
  if (!st && (!L || !sel.face || !L.visible)) return null;
  const [w, h] = st ? stickerSize(st) : (m => [m.w, m.h])(layerMM(o, sel.face, L));
  // a rebuild makes new parts (and new frames for stickers and layers over edges)
  return { o, rt, st, L, w, h, key: JSON.stringify([o.id, sel.face, st || L, w, h]), built: rt.group.children[0] };
}
/* where it goes: parts [{ key, M, G }] map it onto the mm of each face it is on */
function partsOf({ o, st, L, rt }) {
  if (st) { const keys = faceKeys(o); return placementsFor(o, st).filter(p => keys.includes(p.key) && rt.faces[p.key]).map(p => ({ key: p.key, M: p.M })); }
  const k = sel.face, [mw, mh] = faceMM(o, k), r = (L.rot || 0) * DEG, cs = Math.cos(r), sn = Math.sin(r), M = [cs, sn, -sn, cs, L.x * mw, L.y * mh];
  // a layer running over edges: its own face's mm map on to the faces it reaches
  return [{ key: k, M }, ...layerReach(o, k, L).map(p => ({ key: p.key, M, G: p.G }))];
}

/* triangles of a mesh drawn with material fm, with their UV boxes for a quick test (kept per geometry) */
const triCache = new WeakMap();
function trisOf(mesh, fm) {
  const g = mesh.geometry, mats = Array.isArray(mesh.material) ? mesh.material : null, mi = mats ? mats.indexOf(fm) : 0;
  let byMat = triCache.get(g); if (!byMat) triCache.set(g, byMat = new Map());
  if (byMat.has(mi)) return byMat.get(mi);
  const uv = g.attributes.uv, idx = g.index, n = idx ? idx.count : g.attributes.position.count, out = [];
  const ranges = mats ? g.groups.filter(r => r.materialIndex === mi).map(r => [r.start, Math.min(n, r.start + r.count)]) : [[0, n]];
  for (const [s, e] of ranges) for (let t = s; t + 2 < e; t += 3) {
    const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
    const ua = uv.getX(a), va = uv.getY(a), ub = uv.getX(b), vb = uv.getY(b), uc = uv.getX(c), vc = uv.getY(c);
    out.push([a, b, c, ua, va, ub, vb, uc, vc, Math.min(ua, ub, uc), Math.max(ua, ub, uc), Math.min(va, vb, vc), Math.max(va, vb, vc)]);
  }
  byMat.set(mi, out); return out;
}
const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), T = new THREE.Vector3();
/* the point at (u, v) on a mesh, lifted off it along the surface's normal, in the mesh's own space */
function onMesh(mesh, tris, u, v) {
  const e = 1e-5, pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal;
  for (const t of tris) {
    if (u < t[9] - e || u > t[10] + e || v < t[11] - e || v > t[12] + e) continue;
    const [a, b, c, ua, va, ub, vb, uc, vc] = t, d = (vb - vc) * (ua - uc) + (uc - ub) * (va - vc);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((vb - vc) * (u - uc) + (uc - ub) * (v - vc)) / d, l2 = ((vc - va) * (u - uc) + (ua - uc) * (v - vc)) / d, l3 = 1 - l1 - l2;
    if (l1 < -e || l2 < -e || l3 < -e) continue;
    A.fromBufferAttribute(pos, a); B.fromBufferAttribute(pos, b); C.fromBufferAttribute(pos, c);
    if (nor) N.fromBufferAttribute(nor, a).multiplyScalar(l1).addScaledVector(T.fromBufferAttribute(nor, b), l2).addScaledVector(T.fromBufferAttribute(nor, c), l3);
    else N.subVectors(B, A).cross(T.subVectors(C, A));
    return new THREE.Vector3().addScaledVector(A, l1).addScaledVector(B, l2).addScaledVector(C, l3).addScaledVector(N.normalize(), LIFT);
  }
  return null;
}
function drop() { for (const l of lines) { l.parent?.remove(l); l.geometry.dispose(); } lines = []; }
const attached = x => { while (x.parent) x = x.parent; return x === scene; };

/* keeps the frame in step with the selection; true when it changed and the scene needs drawing */
function syncSelBox() {
  const t = recording ? null : target(), s = t ? t.key : '';
  // a rebuilt object took the frame away with its parts: put it back
  if (s === sig && (!t || t.built === built) && lines.every(attached)) return false;
  sig = s; built = t?.built; drop();
  if (!t) return true;
  const rt = t.rt, parts = partsOf(t);
  // the frame as polylines in its own mm: the rectangle and short corner marks just outside it
  const hw = t.w / 2, hh = t.h / 2, k = Math.min(Math.max(Math.min(t.w, t.h) * .18, 1.5), 6), strokes = [];
  const run = (x0, y0, x1, y1) => {
    const n = Math.min(400, Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / STEP))), pts = [];
    for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
    strokes.push(pts);
  };
  run(-hw, -hh, hw, -hh); run(hw, -hh, hw, hh); run(hw, hh, -hw, hh); run(-hw, hh, -hw, -hh);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = sx * (hw + 1), y = sy * (hh + 1); run(x, y, x - sx * k, y); run(x, y, x, y - sy * k); }
  const segs = new Map();   // mesh -> ends of its segments
  for (const { key, M, G } of parts) {
    const fm = rt.faces[key]?.mat; if (!fm) continue;
    const meshes = [];
    rt.group.traverse(m => {
      if (!m.isMesh || !m.visible || m.userData.objId !== t.o.id || m.userData.wall || !m.geometry.attributes.uv) return;
      if (Array.isArray(m.material) ? m.material.includes(fm) : m.material === fm) meshes.push([m, trisOf(m, fm)]);
    });
    if (!meshes.length) continue;
    const [mw, mh] = faceMM(t.o, key), loop = loopAxis(t.o, key), wrap = q => q - Math.floor(q);
    const at = p => {
      const q = apply(M, p), [fx, fy] = G ? apply(G, q) : q;
      let u = fx / mw, v = 1 - fy / mh;
      if (loop === 'x') u = wrap(u); else if (loop === 'y') v = wrap(v);
      return meshes.map(([m, tris]) => onMesh(m, tris, u, v));
    };
    for (const pts of strokes) {
      let prev = at(pts[0]);
      for (let i = 1; i < pts.length; i++) {
        const cur = at(pts[i]);
        meshes.forEach(([m], j) => {
          // two ends far apart on one mesh are on different pieces of it: no line between them
          if (!prev[j] || !cur[j] || prev[j].distanceToSquared(cur[j]) > (STEP * 4 * S) ** 2) return;
          let arr = segs.get(m); if (!arr) segs.set(m, arr = []);
          arr.push(prev[j], cur[j]);
        });
        prev = cur;
      }
    }
  }
  for (const [m, pts] of segs) {
    const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
    l.renderOrder = 6; l.raycast = () => {}; l.userData = { objId: t.o.id, face: null };
    m.add(l); lines.push(l);
  }
  return true;
}
/* hides the frame for a picture of the scene; returns a function that brings it back */
function hideSelBox() { const was = lines.map(l => l.visible); lines.forEach(l => { l.visible = false; }); return () => lines.forEach((l, i) => { l.visible = was[i] ?? true; }); }

export { hideSelBox, syncSelBox };
