// Рамка выбранного слоя или наклейки прямо на модели
import * as THREE from 'three';
import { S } from '../core/util.js';
import { activeLayer, activeObj, sel } from '../core/state.js';
import { facePx, faceMM } from '../core/model.js';
import { activeSticker, stickerSize } from '../stickers/placement.js';
import { layerBox } from '../faces/render.js';
import { RT } from './renderer.js';
import { recording } from './camera.js';

/* The selected layer (or sticker) gets a thin frame with corner marks on the face it is on, so it is clear on the
   model what the panel works on. It lies on the face's plane a hair in front of it and rides with the part the
   face belongs to (a lid that opens takes it along). Faces without a flat frame (round walls) get
   none. It is never in a picture of the scene: exports hide it, recording drops it. */
let box = null, sig = '';
const mat = new THREE.LineBasicMaterial({ color: 0x0a7aa1, transparent: true, opacity: .95, depthTest: true });
/* the rectangle (mm on the face): centre, size, turn in degrees */
function target() {
  const o = activeObj(); if (!o) return null;
  const st = !activeLayer() && activeSticker();
  if (st) { const [w, h] = stickerSize(st), [mw, mh] = faceMM(o, st.face); return { o, face: st.face, cx: st.x * mw, cy: st.y * mh, w, h, rot: st.rot || 0 }; }
  const L = activeLayer(); if (!L || !sel.face || !L.visible) return null;
  const [mw, mh] = faceMM(o, sel.face), [W, H] = facePx(o, sel.face), ppm = W / mw, [w, h] = layerBox(L, W, H);
  return { o, face: sel.face, cx: L.x * mw, cy: L.y * mh, w: w / ppm, h: h / ppm, rot: L.rot || 0 };
}
function drop() { if (box) { box.parent?.remove(box); box.geometry.dispose(); box = null; } }
/* keeps the frame in step with the selection; true when it changed and the scene needs drawing */
function syncSelBox() {
  const t = recording ? null : target(), F = t && RT.get(t.o.id)?.frames?.[t.face];
  const s = F ? JSON.stringify([t.o.id, t.face, t.cx, t.cy, t.w, t.h, t.rot, F.c.toArray(), F.w, F.h]) : '';
  // a rebuilt object took the frame away with its parts: put it back
  if (s === sig && (!box || box.parent)) return false;
  sig = s; drop();
  if (!F) return true;
  const a = t.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), lift = .35;
  const at = (x, y) => {
    // a point of the rectangle (its own x, y from the centre) on the face, then in the part's own space
    const fx = t.cx + x * ca - y * sa, fy = t.cy + x * sa + y * ca;
    return F.c.clone().addScaledVector(F.u, fx - F.w / 2).addScaledVector(F.v, F.h / 2 - fy).addScaledVector(F.n, lift).multiplyScalar(S).applyMatrix4(F.pinv);
  };
  const hw = t.w / 2, hh = t.h / 2, k = Math.min(Math.max(Math.min(t.w, t.h) * .18, 1.5), 6), pts = [];
  const seg = (x0, y0, x1, y1) => pts.push(at(x0, y0), at(x1, y1));
  seg(-hw, -hh, hw, -hh); seg(hw, -hh, hw, hh); seg(hw, hh, -hw, hh); seg(-hw, hh, -hw, -hh);
  // corner marks: short strokes just outside each corner
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = sx * (hw + 1), y = sy * (hh + 1); seg(x, y, x - sx * k, y); seg(x, y, x, y - sy * k); }
  box = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
  box.renderOrder = 6; box.raycast = () => {};
  F.parent.add(box);
  return true;
}
/* hides the frame for a picture of the scene; returns a function that brings it back */
function hideSelBox() { const v = box?.visible; if (box) box.visible = false; return () => { if (box) box.visible = v; }; }

export { hideSelBox, syncSelBox };
