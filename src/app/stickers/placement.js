// Наклейки: где они ложатся, переход через рёбра
import * as THREE from 'three';
import { DEG, S, uid } from '../core/util.js';
import { activeObj, sel } from '../core/state.js';
import { faceMM, outerKeys } from '../core/model.js';
import { getImg } from '../core/assets.js';
import { RT, applyLid, markFace } from '../scene/renderer.js';
import { domeAcross, domeFrames } from '../carriers/dome.js';
import { stickerMargin } from './film.js';

const STICKER_FINISH = { gloss: 'Глянцевая', matte: 'Матовая', 'foil-gold': 'Фольга — золото', 'foil-silver': 'Фольга — серебро', 'foil-holo': 'Голография', clear: 'Прозрачная плёнка' };
const STICKER_FX = { gloss: [.1, 0], matte: [.78, 0], 'foil-gold': [.22, 1], 'foil-silver': [.2, 1], 'foil-holo': [.14, 1], clear: [.06, 0] };
const STICKER_KIND = { circle: 'Круг / овал', rect: 'Прямоугольник', custom: 'Своя форма (PNG / SVG)' };
function newSticker(kind, face, extra = {}) {
  return { id: uid(), kind, face, x: .5, y: .5, rot: 0, w: kind === 'rect' ? 60 : 40, h: kind === 'rect' ? 25 : 40, radius: 3,
    fill: '#ffffff', clear: false, stroke: '#1c1b19', strokeW: 0, src: null, aspect: 1, imgScale: .7, outline: 0,
    text: kind === 'custom' ? '' : 'Спасибо!', textColor: '#1c1b19', textSize: 7, font: 'Caveat', weight: 700,
    finish: 'gloss', thick: .2, tension: .5, visible: true, ...extra };
}
const activeSticker = () => activeObj()?.stickers?.find(t => t.id === sel.sticker) || null;
function stickerSize(st) {
  if (st.kind !== 'custom') return [st.w, st.h];
  const im = getImg(st.src), a = im ? im.naturalWidth / im.naturalHeight : (st.aspect || 1);
  return [st.w, st.w / a];
}
/* closed-state frame of every printed face, in object space (mm): centre, axes and size.
   Canvas x runs along u, canvas y runs against v. */
function computeFrames(o, rt) {
  rt.frames = null;
  if (o.type === 'bag') { rt.frames = rt.bagFrames || null; return; }
  if (o.type === 'dome') { rt.frames = domeFrames(o, rt); return; }
  if (o.type === 'torte') { rt.frames = {}; return; }   // films are laid along sections of the solid (torteSample)
  if (o.type !== 'box') return;
  // frames are taken closed: lid shut, tray pushed in (and the tray is never a neighbour for stickers)
  const saved = o.lid, savedOut = o.tray?.out; o.lid = 0; if (o.tray) o.tray.out = 0; applyLid(o);
  rt.group.updateMatrixWorld(true);
  const inv = rt.group.matrixWorld.clone().invert(), frames = {};
  rt.group.traverse(m => {
    const k = m.userData?.face || m.userData?.support;
    if (!m.isMesh || !k || m.userData.wall || frames[k]) return;
    const gp = m.geometry.parameters;
    const M = inv.clone().multiply(m.matrixWorld), [w, h] = m.userData.face ? faceMM(o, k) : [gp.width / S, gp.height / S];
    const c = new THREE.Vector3().applyMatrix4(M).divideScalar(S);
    const u = new THREE.Vector3(1, 0, 0).transformDirection(M), v = new THREE.Vector3(0, 1, 0).transformDirection(M);
    const pinv = inv.clone().multiply(m.parent.matrixWorld).invert();   // object space → the part's own space (closed)
    frames[k] = { c, u, v, n: new THREE.Vector3().crossVectors(u, v).normalize(), w, h, parent: m.parent, pinv };
  });
  o.lid = saved; if (o.tray) o.tray.out = savedOut; applyLid(o);
  delete frames.tray;
  rt.frames = frames;
}
/* where a sticker lands: one affine map (sticker mm → face mm) per surface it reaches, found by
   walking from the anchor face to its neighbours and on (up to four steps). A neighbour can lie
   just above/below (a flap over a wall, a lid over a tray: projected) or meet at a corner, convex
   or concave (folded over). Where a corner sits inside a face, the part of that face beyond the
   corner is clipped off, so the film turns the corner instead of running through it. */
const SUPPORTS = ['rimFront', 'rimBack', 'rimRight', 'rimLeft'];
const extent = (F, d) => Math.abs(F.u.dot(d)) * F.w / 2 + Math.abs(F.v.dot(d)) * F.h / 2;
function mapAcross(A, F, cur, tol) {
  const V = () => new THREE.Vector3(), dot = A.n.dot(F.n);
  if (dot > .99) {
    const dist = V().subVectors(cur.c, F.c).dot(F.n);
    if (Math.abs(dist) > tol) return null;
    return { c: cur.c.clone().addScaledVector(F.n, -dist), su: cur.su, sv: cur.sv };
  }
  if (Math.abs(dot) > .03) return null;
  const hA = extent(A, F.n), dA = V().subVectors(F.c, A.c).dot(F.n);
  const hF = extent(F, A.n), dF = V().subVectors(A.c, F.c).dot(A.n);
  // is the corner line on each face's outline (either side) or inside it?
  const onA = Math.abs(Math.abs(dA) - hA) <= tol, inA = Math.abs(dA) <= hA + tol;
  const onF = Math.abs(Math.abs(dF) - hF) <= tol, inF = Math.abs(dF) <= hF + tol;
  if (!inA || !inF) return null;
  if (onA && onF) { if (dA < 0 || dF < 0) return null; }                                // a convex fold
  else if (onF) { if (V().subVectors(F.c, A.c).dot(A.n) <= 0) return null; }            // F stands out in front of A (inner corner)
  else if (onA) { if (V().subVectors(A.c, F.c).dot(F.n) <= 0) return null; }            // A stands on F's front side
  else return null;
  const e = V().crossVectors(A.n, F.n).normalize(), ae = A.c.dot(e), fe = F.c.dot(e), ea = extent(A, e), ef = extent(F, e);
  if (Math.min(ae + ea, fe + ef) - Math.max(ae - ea, fe - ef) < 1) return null;   // they must share some of the edge
  const s = V().subVectors(cur.c, F.c).dot(F.n);
  const fold = x => { const t = x.dot(F.n); return x.clone().addScaledVector(F.n, -t).addScaledVector(A.n, -t); };
  return {
    c: cur.c.clone().addScaledVector(F.n, -s).addScaledVector(A.n, -s), su: fold(cur.su), sv: fold(cur.sv),
    // at an inner corner the face carrying the corner line keeps only the side the other face looks at
    clipA: onA ? null : { n: F.n, d: F.c.dot(F.n), sign: 1 },
    clipF: onF ? null : { n: A.n, d: A.c.dot(A.n), sign: 1 },
  };
}
function placementsFor(o, st) {
  const [aw, ah] = faceMM(o, st.face), r = st.rot * DEG, cs = Math.cos(r), sn = Math.sin(r);
  const fr = RT.get(o.id)?.frames, A = fr?.[st.face];
  if (!A) return [{ key: st.face, M: [cs, sn, -sn, cs, st.x * aw, st.y * ah], clips: [] }];
  const V = () => new THREE.Vector3();
  const su = V().addScaledVector(A.u, cs).addScaledVector(A.v, -sn), sv = V().addScaledVector(A.u, sn).addScaledVector(A.v, cs);
  const c = A.c.clone().addScaledVector(A.u, st.x * aw - aw / 2).addScaledVector(A.v, ah / 2 - st.y * ah);
  const [sw, sh] = stickerSize(st), R = Math.hypot(sw, sh) / 2 + stickerMargin(st) + 1, tol = Math.max(3, 2 * o.thickness + 2);
  const inner = st.face === 'inside' || st.face === 'insideBottom';
  const keys = inner ? [] : fr.walk || [...outerKeys(o), ...SUPPORTS].filter(k => fr[k]);
  const toM = (e, F) => { const d = V().subVectors(e.c, F.c); return [e.su.dot(F.u), -e.su.dot(F.v), -e.sv.dot(F.u), e.sv.dot(F.v), d.dot(F.u) + F.w / 2, F.h / 2 - d.dot(F.v)]; };
  const start = { key: st.face, c, su, sv, depth: 0, clips: [...(A.clip || [])] };
  const seen = new Map([[st.face, start]]), queue = [start];
  while (queue.length) {
    const cur = queue.shift(), Af = fr[cur.key];
    if (cur.depth >= (fr.maxDepth || 4)) continue;
    for (const k of keys) {
      if (seen.has(k)) continue;
      const F = fr[k], m = Af.links ? domeAcross(Af, F, cur) : mapAcross(Af, F, cur, tol); if (!m) continue;
      const ent = { key: k, c: m.c, su: m.su, sv: m.sv, depth: cur.depth + 1, clips: [...(m.clipF ? [m.clipF] : []), ...(F.clip || [])] };
      const M = toM(ent, F);
      if (M[4] < -R || M[4] > F.w + R || M[5] < -R || M[5] > F.h + R) continue;
      if (m.clipA) cur.clips.push(m.clipA);
      seen.set(k, ent); queue.push(ent);
    }
  }
  return [...seen.values()].map(e => ({ key: e.key, M: toM(e, fr[e.key]), clips: e.clips }));
}
const stickerDirty = new Set();
/* re-render only the faces a sticker touched before or touches now */
const stickerKeys = new Map();
function touchSticker(o, st) {
  stickerDirty.add(o.id);
  const now = st ? placementsFor(o, st).map(p => p.key) : [];
  for (const k of new Set([...(stickerKeys.get(st?.id) || []), ...now])) markFace(o, k);
  if (st) stickerKeys.set(st.id, now);
}
/* hit test in a face: which sticker sits under the point (face-canvas mm) */
function stickerAt(o, key, px, py) {
  const list = o.stickers || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const st = list[i]; if (!st.visible) continue;
    const [w, h] = stickerSize(st);
    for (const pl of placementsFor(o, st)) {
      if (pl.key !== key) continue;
      const [a, b, c, d, e, f] = pl.M, det = a * d - b * c, X = px - e, Y = py - f;
      const sx = (d * X - c * Y) / det, sy = (-b * X + a * Y) / det;
      const inside = st.kind === 'circle' ? (sx / (w / 2)) ** 2 + (sy / (h / 2)) ** 2 <= 1 : Math.abs(sx) <= w / 2 && Math.abs(sy) <= h / 2;
      if (inside) return st;
    }
  }
  return null;
}

export { STICKER_FINISH, STICKER_FX, STICKER_KIND, activeSticker, computeFrames, newSticker, placementsFor, stickerAt, stickerDirty, stickerKeys, stickerSize, touchSticker };
