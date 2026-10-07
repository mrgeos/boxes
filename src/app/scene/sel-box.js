// Рамка выбранного слоя или наклейки прямо на модели
import * as THREE from 'three';
import { $, DEG, S } from '../core/util.js';
import { activeLayer, activeObj, sel } from '../core/state.js';
import { faceKeys, faceMM, facePx, loopAxis } from '../core/model.js';
import { activeSticker, placementsFor, stickerSize } from '../stickers/placement.js';
import { apply, layerMM, layerReach } from '../faces/wrap.js';
import { RT, camera, cvs, scene, world } from './renderer.js';
import { editMode, editRects } from '../core/mask.js';
import { boundsOf, selectedLayers } from '../core/layers.js';
import { tool } from '../ui/action-bar.js';
import { recording } from './camera.js';

/* The selected layer (or sticker) gets a thin frame with corner marks, so it is clear on the model what the
   panel works on. The frame is drawn on the surface itself: each point of it is found on the meshes printed
   with that face through their texture coordinates. So it follows round walls and bends, rides with a lid that
   opens and folds over edges where the layer or sticker goes on to the next face; parts off every face are left
   out. It is never in a picture of the scene: exports hide it, recording drops it. */
let lines = [], sig = '', built = null;
const mat = new THREE.LineBasicMaterial({ color: 0x0a7aa1, transparent: true, opacity: .95 });
const ghostMat = new THREE.LineBasicMaterial({ color: 0xd2453a, transparent: true, opacity: .85 });
/* a note on the stage while part of the item is off every face: that part is not printed */
function showOff(what) {
  const el = $('#offHint'); if (!el) return;
  el.hidden = !what;
  if (what) el.textContent = { sticker: 'Часть наклейки за краем (пунктир) — она не ляжет на упаковку', band: 'Часть слоя за краем ленты (пунктир) — она не печатается' }[what] || 'Часть слоя за краем грани (пунктир) — она не печатается';
}
const LIFT = .4 * S, HLIFT = 1.5 * S, STEP = 1.5;   // off the surface; sampling step along the frame (mm)

/* what is selected: the rectangle (its own mm, centred) and a key that changes whenever the frame would */
function target() {
  const o = activeObj(), rt = o && RT.get(o.id); if (!rt) return null;
  const st = !activeLayer() && activeSticker(), L = !st && activeLayer();
  // several layers: one frame round them all, square to the face (its own mm)
  const many = !st && selectedLayers();
  if (many?.length > 1) {
    const [W, H] = facePx(o, sel.face), [mw] = faceMM(o, sel.face), b = boundsOf(many, W, H).map(v => v * mw / W);
    return { o, rt, multi: true, w: b[2] - b[0], h: b[3] - b[1], M: [1, 0, 0, 1, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2], key: JSON.stringify([o.id, sel.face, many, 'multi']), built: rt.group.children[0] };
  }
  if (!st && (!L || !sel.face || !L.visible)) return null;
  const [w, h] = st ? stickerSize(st) : (m => [m.w, m.h])(layerMM(o, sel.face, L));
  // crop or mask mode: the frame being edited and the one round it (the layer's own mm)
  const mode = L && editMode(), er = mode && editRects(mode, L, ...faceMM(o, sel.face), [w, h]);
  // a rebuild makes new parts (and new frames for stickers and layers over edges)
  return { o, rt, st, L, w, h, er, mode, key: JSON.stringify([o.id, sel.face, st || L, w, h, mode]), built: rt.group.children[0] };
}
/* where it goes: parts [{ key, M, G }] map it onto the mm of each face it is on */
function partsOf({ o, st, L, rt, multi, M: MM }) {
  if (multi) return [{ key: sel.face, M: MM }];
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
/* the point at (u, v) of triangle t of a mesh, lifted off it along the surface's normal, in the mesh's own space;
   (u, v) may be outside the triangle: then the point is on the triangle's plane, past its edge */
function atTri(mesh, t, u, v, lift) {
  const pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal;
  const [a, b, c, ua, va, ub, vb, uc, vc] = t, d = (vb - vc) * (ua - uc) + (uc - ub) * (va - vc);
  const l1 = ((vb - vc) * (u - uc) + (uc - ub) * (v - vc)) / d, l2 = ((vc - va) * (u - uc) + (ua - uc) * (v - vc)) / d, l3 = 1 - l1 - l2;
  A.fromBufferAttribute(pos, a); B.fromBufferAttribute(pos, b); C.fromBufferAttribute(pos, c);
  // off the triangle its plane's normal stays the one at its middle
  const w = [l1, l2, l3].some(l => l < -1e-5) ? [1 / 3, 1 / 3, 1 / 3] : [l1, l2, l3];
  if (nor) N.fromBufferAttribute(nor, a).multiplyScalar(w[0]).addScaledVector(T.fromBufferAttribute(nor, b), w[1]).addScaledVector(T.fromBufferAttribute(nor, c), w[2]);
  else N.subVectors(B, A).cross(T.subVectors(C, A));
  return new THREE.Vector3().addScaledVector(A, l1).addScaledVector(B, l2).addScaledVector(C, l3).addScaledVector(N.normalize(), lift);
}
/* the point at (u, v) on a mesh, if (u, v) is on it */
function onMesh(mesh, tris, u, v, lift = LIFT) {
  const e = 1e-5;
  for (const t of tris) {
    if (u < t[9] - e || u > t[10] + e || v < t[11] - e || v > t[12] + e) continue;
    const [, , , ua, va, ub, vb, uc, vc] = t, d = (vb - vc) * (ua - uc) + (uc - ub) * (va - vc);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((vb - vc) * (u - uc) + (uc - ub) * (v - vc)) / d, l2 = ((vc - va) * (u - uc) + (ua - uc) * (v - vc)) / d;
    if (l1 < -e || l2 < -e || 1 - l1 - l2 < -e) continue;
    return atTri(mesh, t, u, v, lift);
  }
  return null;
}
function drop() { for (const l of lines) { l.parent?.remove(l); l.geometry.dispose(); } lines = []; handles = []; }
const attached = x => { while (x.parent) x = x.parent; return x === scene; };

let handles = [];   // [{ mode: 'scale' | 'rot' | 'center' | 'corner', mesh, p }] — 'center' and 'corner' are not drawn
const dots = {};
/* the picture of a handle: a white square (scale) or a white dot (turn) with the accent outline, a fixed size on screen */
function dotMat(mode) {
  if (dots[mode]) return dots[mode];
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.strokeStyle = '#0a7aa1'; x.lineWidth = 4; x.beginPath();
  if (mode === 'rot') x.arc(16, 16, 12, 0, Math.PI * 2); else x.rect(5, 5, 22, 22);
  x.fill(); x.stroke();
  return dots[mode] = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: mode === 'rot' ? 13 : 11, sizeAttenuation: false, transparent: true, alphaTest: .3 });
}
/* keeps the frame in step with the selection; true when it changed and the scene needs drawing */
function syncSelBox() {
  const t = recording ? null : target(), grips = t && tool() === 'select', s = t ? t.key + grips : '';
  // a rebuilt object took the frame away with its parts: put it back
  if (s === sig && (!t || t.built === built) && lines.every(attached)) return false;
  sig = s; built = t?.built; drop();
  if (!t) { showOff(null); return true; }
  const rt = t.rt, surfaces = [];
  // every face the item is on: its meshes and the way from the item's own mm to a point on each of them
  for (const { key, M, G } of partsOf(t)) {
    const fm = rt.faces[key]?.mat; if (!fm) continue;
    const meshes = [];
    rt.group.traverse(m => {
      if (!m.isMesh || !m.visible || m.userData.objId !== t.o.id || m.userData.wall || !m.geometry.attributes.uv) return;
      if (Array.isArray(m.material) ? m.material.includes(fm) : m.material === fm) meshes.push([m, trisOf(m, fm)]);
    });
    if (!meshes.length) continue;
    const [mw, mh] = faceMM(t.o, key), loop = loopAxis(t.o, key), wrap = q => q - Math.floor(q);
    const uvOf = p => {
      const q = apply(M, p), [fx, fy] = G ? apply(G, q) : q;
      let u = fx / mw, v = 1 - fy / mh;
      if (loop === 'x') u = wrap(u); else if (loop === 'y') v = wrap(v);
      return [u, v];
    };
    surfaces.push({ meshes, mw, mh, uvOf, at: (p, lift) => { const [u, v] = uvOf(p); return meshes.map(([m, tris]) => onMesh(m, tris, u, v, lift)); } });
  }
  /* a point of the item off every face: on the plane of the nearest bit of surface, past its edge. The frame goes
     on there as a dashed "ghost", so the item's real outline and its handles are always there to see and grab */
  const ghost = p => {
    let best = null, bd = Infinity;
    for (const f of surfaces) {
      const [u, v] = f.uvOf(p);
      for (const [m, tris] of f.meshes) for (const t of tris) {
        const d = ((t[3] + t[5] + t[7]) / 3 - u) ** 2 * f.mw * f.mw + ((t[4] + t[6] + t[8]) / 3 - v) ** 2 * f.mh * f.mh;
        if (d < bd && Math.abs((t[6] - t[8]) * (t[3] - t[7]) + (t[7] - t[5]) * (t[4] - t[8])) > 1e-12) { bd = d; best = { m, t, f }; }
      }
    }
    return best;
  };
  const onGhost = (g, p, lift = LIFT) => { const [u, v] = g.f.uvOf(p); return atTri(g.m, g.t, u, v, lift); };
  // the first place a point of the item is on the model; handles stand a little higher, clear of the surface
  const locate = (p, off = false) => {
    for (const f of surfaces) { const r = f.at(p, HLIFT); const j = r.findIndex(Boolean); if (j >= 0) return { mesh: f.meshes[j][0], p: r[j] }; }
    const g = off && ghost(p); return g ? { mesh: g.m, p: onGhost(g, p, HLIFT) } : null;
  };
  // the frame as polylines in its own mm: the rectangle, and either handles or short corner marks
  const hw = t.w / 2, hh = t.h / 2, k = Math.min(Math.max(Math.min(t.w, t.h) * .18, 1.5), 6), strokes = [];
  const run = (x0, y0, x1, y1) => {
    const n = Math.min(400, Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / STEP))), pts = [];
    for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
    strokes.push(pts);
  };
  const er = t.er, box = ([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [x * er.flip[0], y * er.flip[1]]);
  const corners = er ? box(er.inner) : [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  corners.forEach((c, i) => run(...c, ...corners[(i + 1) % 4]));
  const dashed = new Set();
  if (er) {
    // crop or mask mode: the frame being edited has handles at its corners, the one round it is dashed
    const out = box(er.outer); out.forEach((c, i) => { dashed.add(strokes.length); run(...c, ...out[(i + 1) % 4]); });
    corners.forEach((c, i) => { const h = locate(c, true); if (h) handles.push({ mode: 'edit', idx: i, ...h }); });
    const c = locate([0, 0], true); if (c) handles.push({ mode: 'center', ...c });
  } else if (grips) {
    // scale at the corners, turn on a stalk over the top edge; where that is off the model (past the edge of the
    // face, in a window), under the bottom edge or beside the item, closer in if need be
    const R = Math.min(Math.max(Math.max(t.w, t.h) * .12, 6), 25);
    for (const r of [R, R / 2, -R]) {
      // nowhere on the model: on the ghost over the top edge
      if (r < 0) { const at = locate([0, -hh - R], true); if (at) { run(0, -hh, 0, -hh - R); handles.push({ mode: 'rot', ...at }); } break; }
      const way = [[0, -1, hh], [0, 1, hh], [1, 0, hw], [-1, 0, hw]].map(([dx, dy, e]) => [dx, dy, e, locate([dx * (e + r), dy * (e + r)])]).find(w => w[3]);
      if (!way) continue;
      const [dx, dy, e, at] = way; run(dx * e, dy * e, dx * (e + r), dy * (e + r)); handles.push({ mode: 'rot', ...at });
      break;
    }
    for (const c of corners) { const h = locate(c, true); if (h) handles.push({ mode: 'scale', ...h }); }
    const c = locate([0, 0], true); if (c) handles.push({ mode: 'center', ...c });
  } else for (const [sx, sy] of corners.map(([x, y]) => [Math.sign(x), Math.sign(y)])) { const x = sx * (hw + 1), y = sy * (hh + 1); run(x, y, x - sx * k, y); run(x, y, x, y - sy * k); }
  // three corners in order tell whether the item is seen mirrored (from the back of the face)
  for (const c of corners.slice(0, 3)) { const h = locate(c, true); if (h) handles.push({ mode: 'corner', ...h }); }
  const segs = new Map();   // mesh -> ends of its segments
  for (const { meshes, at } of surfaces) for (const [si, pts] of strokes.entries()) {
    let prev = at(pts[0]);
    for (let i = 1; i < pts.length; i++) {
      const cur = at(pts[i]);
      if (dashed.has(si) && i % 2) { prev = cur; continue; }
      meshes.forEach(([m], j) => {
        // two ends far apart on one mesh are on different pieces of it: no line between them
        if (!prev[j] || !cur[j] || prev[j].distanceToSquared(cur[j]) > (STEP * 4 * S) ** 2) return;
        let arr = segs.get(m); if (!arr) segs.set(m, arr = []);
        arr.push(prev[j], cur[j]);
      });
      prev = cur;
    }
  }
  // the ghost: every other step of the frame where it is off every face (dashes), joined to the face's edge
  const ghosts = new Map(); let off = false;
  strokes.forEach((pts, si) => {
    if (dashed.has(si)) return;
    const real = pts.map(p => surfaces.some(f => f.at(p, LIFT).some(Boolean)));
    let g = null;
    for (let i = 1; i < pts.length; i++) {
      if (real[i - 1] && real[i]) continue;
      if (si < 4) off = true;
      g = !real[i] ? ghost(pts[i]) : g || ghost(pts[i - 1]);
      if (!g || i % 2) continue;
      let arr = ghosts.get(g.m); if (!arr) ghosts.set(g.m, arr = []);
      arr.push(onGhost(g, pts[i - 1]), onGhost(g, pts[i]));
    }
  });
  const keep = l => { l.renderOrder = 6; l.raycast = () => {}; l.userData = { objId: t.o.id, face: null }; lines.push(l); return l; };
  for (const [m, pts] of segs) m.add(keep(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat)));
  for (const [m, pts] of ghosts) m.add(keep(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), ghostMat)));
  showOff(off && (t.st ? 'sticker' : sel.face === 'sleeve' || sel.face === 'carry' ? 'band' : 'layer'));
  for (const h of handles) if (h.mode === 'rot' || h.mode === 'scale' || h.mode === 'edit') h.mesh.add(keep(new THREE.Points(new THREE.BufferGeometry().setFromPoints([h.p]), dotMat(h.mode === 'rot' ? 'rot' : 'scale'))));
  return true;
}
/* where a handle is on the screen (client px) and whether it is in sight */
const ray = new THREE.Raycaster();
function onScreen(h) {
  const w = h.p.clone().applyMatrix4(h.mesh.matrixWorld), d = w.distanceTo(camera.position), v = w.clone().project(camera), r = cvs.getBoundingClientRect();
  ray.set(camera.position, w.clone().sub(camera.position).normalize());
  const hit = ray.intersectObjects(world.children, true)[0];
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, seen: v.z < 1 && (!hit || hit.distance > d - 2.5 * S) };
}
/* the handle under the pointer, if any: { mode, c: the item's centre on screen, flip: -1 when seen mirrored } */
function handleAt(x, y) {
  if (!lines.length || !lines.every(attached)) return null;
  for (const mode of ['rot', 'scale', 'edit']) for (const h of handles) {
    if (h.mode !== mode) continue;
    const q = onScreen(h); if (!q.seen || Math.hypot(q.x - x, q.y - y) > 10) continue;
    const c = handles.find(g => g.mode === 'center'), cs = handles.filter(g => g.mode === 'corner').map(onScreen);
    const cc = c ? onScreen(c) : q;
    const flip = cs.length === 3 && (cs[1].x - cs[0].x) * (cs[2].y - cs[1].y) - (cs[1].y - cs[0].y) * (cs[2].x - cs[1].x) < 0 ? -1 : 1;
    return { mode, c: [cc.x, cc.y], flip, idx: h.idx };
  }
  return null;
}
/* hides the frame for a picture of the scene; returns a function that brings it back */
function hideSelBox() { const was = lines.map(l => l.visible); lines.forEach(l => { l.visible = false; }); return () => lines.forEach((l, i) => { l.visible = was[i] ?? true; }); }

export { handleAt, hideSelBox, syncSelBox };
