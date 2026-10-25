// Геометрия деталей: плоскости с вырезами, ленты, сетки по поверхности
import * as THREE from 'three';
import { S, V2, clamp, dedupe } from '../core/util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TOUCH, faceMM } from '../core/model.js';

/* the number of segments around or along a curved part: half on a touch screen, where a phone's graphics card draws
   the whole scene (a cup's lid keeps its look at a phone's size with a quarter of the triangles) */
const seg = (n, min = 8) => TOUCH ? Math.max(min, Math.round(n / 2)) : n;

/* polyline of a U-shaped notch cut into the top or bottom edge of a centred W×H plane */
function notchPts(W, H, hw, depth, r, edge) {
  const p = new THREE.Path(), x0 = -hw, x1 = hw;
  if (edge === 'top') {
    const yb = H / 2 - depth;
    p.moveTo(x1, H / 2); p.lineTo(x1, yb + r); if (r > 0) p.quadraticCurveTo(x1, yb, x1 - r, yb);
    p.lineTo(x0 + r, yb); if (r > 0) p.quadraticCurveTo(x0, yb, x0, yb + r); p.lineTo(x0, H / 2);
  } else {
    const yt = -H / 2 + depth;
    p.moveTo(x0, -H / 2); p.lineTo(x0, yt - r); if (r > 0) p.quadraticCurveTo(x0, yt, x0 + r, yt);
    p.lineTo(x1 - r, yt); if (r > 0) p.quadraticCurveTo(x1, yt, x1, yt - r); p.lineTo(x1, -H / 2);
  }
  return dedupe(p.getPoints(10));
}
/* closed rounded rectangle, as points */
function rrectPts(cx, cy, w, h, r) {
  const p = new THREE.Path(), x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  p.moveTo(x0 + r, y0); p.lineTo(x1 - r, y0); if (r > 0) p.quadraticCurveTo(x1, y0, x1, y0 + r);
  p.lineTo(x1, y1 - r); if (r > 0) p.quadraticCurveTo(x1, y1, x1 - r, y1);
  p.lineTo(x0 + r, y1); if (r > 0) p.quadraticCurveTo(x0, y1, x0, y1 - r);
  p.lineTo(x0, y0 + r); if (r > 0) p.quadraticCurveTo(x0, y0, x0 + r, y0);
  const pts = dedupe(p.getPoints(10));
  if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-7) pts.pop();
  return pts;
}
function planeGeoHole(W, H, hole) {
  const sh = new THREE.Shape([V2(-W / 2, -H / 2), V2(W / 2, -H / 2), V2(W / 2, H / 2), V2(-W / 2, H / 2)]);
  for (const h of Array.isArray(hole[0]) ? hole : [hole]) sh.holes.push(new THREE.Path(h));
  const g = new THREE.ShapeGeometry(sh), pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / W + .5, pos.getY(i) / H + .5);
  return g;
}
function planeGeo(W, H, notch = null, edge = 'top') {
  if (!notch) return new THREE.PlaneGeometry(W, H);
  const pts = edge === 'top'
    ? [V2(-W / 2, -H / 2), V2(W / 2, -H / 2), V2(W / 2, H / 2), ...notch, V2(-W / 2, H / 2)]
    : [V2(-W / 2, -H / 2), ...notch, V2(W / 2, -H / 2), V2(W / 2, H / 2), V2(-W / 2, H / 2)];
  const g = new THREE.ShapeGeometry(new THREE.Shape(dedupe(pts)));
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / W + .5, pos.getY(i) / H + .5);
  return g;
}
function ribbonGeo(A, B) {
  const v = [];
  for (let i = 0; i < A.length - 1; i++) v.push(...A[i], ...A[i + 1], ...B[i + 1], ...A[i], ...B[i + 1], ...B[i]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
}
/* an arbitrary quad (clockwise-free: any four corners, in order) with its own UVs */
function quadGeo(pts, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(p => p.map(v => v * S)), 3));
  if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  return g;
}
/* rounded rectangle as a ring of points (x, z) at height y, A and B are half sizes */
function rrLoop(A, B, r, y, n = 5) {
  const out = [];
  for (const [cx, cz, a0] of [[A - r, B - r, 0], [-(A - r), B - r, 1], [-(A - r), -(B - r), 2], [A - r, -(B - r), 3]])
    for (let i = 0; i <= n; i++) { const t = (a0 + i / n) * Math.PI / 2; out.push([cx + r * Math.cos(t), y, cz + r * Math.sin(t)]); }
  return out;
}
/* surface through a stack of equal-sized rings, i0…i1 of the lid profile; the flat top closes it if cap is set */
function loopSurface(loops, i0, i1, cap) {
  const m = loops[0].length, P = [], I = [];
  for (let j = i0; j <= i1; j++) for (const p of loops[j]) P.push(p[0] * S, p[1] * S, p[2] * S);
  for (let j = 0; j < i1 - i0; j++) for (let i = 0; i < m; i++) {
    const a = j * m + i, b = j * m + (i + 1) % m, c = a + m, d = b + m; I.push(a, c, b, b, c, d);
  }
  if (cap) {
    const top = loops[i1], ci = P.length / 3, y = top[0][1];
    P.push(0, y * S, 0);
    for (let i = 0; i < m; i++) I.push(ci, (i1 - i0) * m + (i + 1) % m, (i1 - i0) * m + i);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
  return g;
}
/* How sharp the surface turns at each vertex (0…1), as the vertex attribute `edge`: the angle between the normals of the
   faces that meet there, through a smoothstep. Clear plastic whitens at its creases in the «Рендер» mode (petMat in
   scene/renderer.js). Vertices at one place count as one (a seam), whatever the index. Big meshes are left out. */
function addCreaseEdge(geo, maxTris = 60000) {
  const pos = geo.attributes.position; if (!pos || geo.attributes.edge) return;
  const idx = geo.index, tris = idx ? idx.count / 3 : pos.count / 3;
  if (tris > maxTris) return;
  const at = j => idx ? idx.getX(j) : j, Q = 1e4, rec = new Map(), rid = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round(pos.getX(i) * Q) + ',' + Math.round(pos.getY(i) * Q) + ',' + Math.round(pos.getZ(i) * Q);
    if (!rec.has(k)) rec.set(k, rec.size);
    rid[i] = rec.get(k);
  }
  const sum = new Float32Array(rec.size * 3), ang = new Float32Array(rec.size), fn = new Float32Array(tris * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    const i0 = at(t * 3), i1 = at(t * 3 + 1), i2 = at(t * 3 + 2);
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1).sub(a); c.fromBufferAttribute(pos, i2).sub(a); b.cross(c);
    if (b.lengthSq() < 1e-18) continue;
    b.normalize(); fn.set([b.x, b.y, b.z], t * 3);
    for (const i of [i0, i1, i2]) { const r = rid[i] * 3; sum[r] += b.x; sum[r + 1] += b.y; sum[r + 2] += b.z; }
  }
  for (let t = 0; t < tris; t++) for (let v = 0; v < 3; v++) {
    const r = rid[at(t * 3 + v)], l = Math.hypot(sum[r * 3], sum[r * 3 + 1], sum[r * 3 + 2]);
    if (!l) { ang[r] = Math.PI; continue; }
    const d = (sum[r * 3] * fn[t * 3] + sum[r * 3 + 1] * fn[t * 3 + 1] + sum[r * 3 + 2] * fn[t * 3 + 2]) / l;
    ang[r] = Math.max(ang[r], Math.acos(Math.max(-1, Math.min(1, d))));
  }
  const out = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) out[i] = THREE.MathUtils.smoothstep(ang[rid[i]], .12, .5);
  geo.setAttribute('edge', new THREE.BufferAttribute(out, 1));
}
/* a tangent [x, y, z, w] for a vertex with normal N: T (the direction of the texture's u) made square to N, and w the
   handedness so that cross(N, T) · w points along B (the texture's v). Real tangents, because three.js derives the frame
   from screen-space derivatives otherwise, which are degenerate in places and give NaN on some GPUs (Apple's) for a
   normal-mapped or anisotropic material */
function tangentOf(N, T, B) {
  const d = N[0] * T[0] + N[1] * T[1] + N[2] * T[2]; T = [T[0] - N[0] * d, T[1] - N[1] * d, T[2] - N[2] * d];
  let l = Math.hypot(...T);
  if (l < 1e-9) { T = Math.abs(N[0]) < .9 ? [1, 0, 0] : [0, 0, 1]; const e = N[0] * T[0] + N[1] * T[1] + N[2] * T[2]; T = [T[0] - N[0] * e, T[1] - N[1] * e, T[2] - N[2] * e]; l = Math.hypot(...T) || 1; }
  T = [T[0] / l, T[1] / l, T[2] / l];
  const c = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]];
  return [...T, c[0] * B[0] + c[1] * B[1] + c[2] * B[2] < 0 ? -1 : 1];
}
/* a grid over a surface f(u, v) (mm), offset by off (mm) into a part's own space */
function gridGeo(f, nu, nv, off = [0, 0, 0], r = [0, 1, 0, 1], vtop = null) {
  const P = [], UV = [], I = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = r[0] + (r[1] - r[0]) * i / nu, v = r[2] + ((vtop ? vtop(i) : r[3]) - r[2]) * j / nv, p = f(u, v);
    P.push((p[0] - off[0]) * S, (p[1] - off[1]) * S, (p[2] - off[2]) * S); UV.push(u, v);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; I.push(a, b, d, a, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}
/* sticker frame for a curved side: the rest plane finds neighbours, map/nrm give the real surface */
function surfFrame(o, key, s3, parent, pinv) {
  const V = (a) => new THREE.Vector3(...a), [w, h] = faceMM(o, key), u = V(s3.rest.u), v = V(s3.rest.v), n = new THREE.Vector3().crossVectors(u, v);
  const at = (a, b) => V(s3.f(clamp(a, 0, 1), clamp(b, 0, 1)));
  const map = (X, Y) => { const a = X / w, b = 1 - Y / h, ca = clamp(a, 0, 1), cb = clamp(b, 0, 1); return at(ca, cb).addScaledVector(u, (a - ca) * w).addScaledVector(v, (b - cb) * h); };
  const nrm = (X, Y) => {
    const a = clamp(X / w, 0, 1), b = clamp(1 - Y / h, 0, 1), e = .01;
    const m = new THREE.Vector3().crossVectors(at(a + e, b).sub(at(a - e, b)), at(a, b + e).sub(at(a, b - e))).normalize();
    return m.dot(n) < 0 ? m.negate() : m;
  };
  return { c: V(s3.rest.c), u, v, n, w, h, parent, pinv, map, nrm, key };
}

/* Like a game batching its static props: an object's parts that look the same and never move apart (one opaque
   material, the same parent, no face or other role of their own, and nothing in the object's record holding them,
   as the lid's or the contact shadow's parts are held) become one mesh per parent: one draw instead of dozens. */
function mergeStatic(rt) {
  const held = new Set(), hold = v => { if (v?.isObject3D) held.add(v); };
  for (const v of Object.values(rt)) { hold(v); if (Array.isArray(v) || v instanceof Set || v instanceof Map) v.forEach(hold); }
  const sets = new Map();
  rt.group.traverse(m => {
    if (!m.isMesh || m.isInstancedMesh || !m.visible || held.has(m) || Array.isArray(m.material) || m.material.transparent) return;
    const g = m.geometry, ud = m.userData;
    if (g.groups.length || Object.keys(g.morphAttributes).length || Object.keys(ud).some(k => k !== 'objId' && !(k === 'face' && ud.face == null))) return;
    const key = [m.parent.uuid, m.material.uuid, m.castShadow, m.receiveShadow, m.renderOrder, m.raycast === THREE.Mesh.prototype.raycast, !!g.index, Object.keys(g.attributes).sort().join()].join('|');
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push(m);
  });
  for (const ms of sets.values()) {
    if (ms.length < 2) continue;
    const geos = ms.map(m => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); });
    const merged = mergeGeometries(geos); geos.forEach(g => g.dispose()); if (!merged) continue;
    const a = ms[0], m = new THREE.Mesh(merged, a.material);
    m.castShadow = a.castShadow; m.receiveShadow = a.receiveShadow; m.renderOrder = a.renderOrder; m.raycast = a.raycast; m.userData = { ...a.userData };
    a.parent.add(m);
    for (const x of ms) { x.parent.remove(x); x.geometry.dispose(); }
  }
}

export { addCreaseEdge, tangentOf, gridGeo, loopSurface, mergeStatic, seg, notchPts, planeGeo, planeGeoHole, quadGeo, ribbonGeo, rrLoop, rrectPts, surfFrame };
