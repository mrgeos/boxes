// Подсветка грани на модели в режиме «2D + 3D»: контур поверх 3D, а не в самой сцене
import * as THREE from 'three';
import { S } from '../core/util.js';
import { activeObj, sel } from '../core/state.js';
import { faceKeys } from '../core/model.js';
import { RT, camera, viewport } from './renderer.js';
import { hover, setHoverFace } from '../core/hover.js';
import { effectiveMode } from '../ui/view-mode.js';
import { isShown } from './isolation.js';
import { foldFaceOutlines } from './fold.js';

/* The picked face and the face under the pointer (on the net or on the model) are outlined on a canvas laid over the
   3D view: the corners of the face's rectangle (RT.frames, the same ones stickers use) go through the camera. It is
   not drawn into the scene, so the picture of «Рендер» is not reset by it, and in 3D mode (and where a carrier has
   no frames: a tube, a cup, a tray) there is nothing to draw. */
let cv = null, c2 = null, last = '', drawn = false;
const MW = new THREE.Matrix4(), P = new THREE.Vector3(), N = new THREE.Vector3(), V3 = new THREE.Vector3();
/* the face's four corners on screen (CSS px in the view), null when it is turned away or has no frame */
function corners(o, key, w, h) {
  const rt = RT.get(o.id), F = rt?.frames?.[key]; if (!F) return null;
  F.parent.updateMatrixWorld(); MW.multiplyMatrices(F.parent.matrixWorld, F.pinv);
  N.copy(F.n).transformDirection(MW);
  P.copy(F.c).multiplyScalar(S).applyMatrix4(MW);
  if (N.dot(V3.copy(camera.position).sub(P)) <= 0) return null;
  const out = [];
  for (const [a, b] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
    P.copy(F.c).addScaledVector(F.u, a * F.w / 2).addScaledVector(F.v, b * F.h / 2).multiplyScalar(S).applyMatrix4(MW).project(camera);
    out.push([(P.x + 1) / 2 * w, (1 - P.y) / 2 * h]);
  }
  return out;
}
/* the face's outlines on screen: while the blank folds each panel of the face (a face may lie on several), as the rig has
   them now; else the face's rectangle as the closed model has it */
function outlines(o, key, w, h) {
  const rt = RT.get(o.id);
  if (rt?.rig) {
    const outs = foldFaceOutlines(o.id, key); if (!outs) return null;
    return outs.map(pts => pts.map(q => { const v = q.clone().project(camera); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; }));
  }
  const q = corners(o, key, w, h); return q && [q];
}
/* called every frame: redraws only when the outlines moved */
function syncFaceHi() {
  if (!cv) return;
  const on = effectiveMode() === 'split', w = viewport.clientWidth, h = viewport.clientHeight, o = activeObj();
  // out of «2D + 3D» the canvas is not in the page at all (display: none), so the 3D view is composited as before
  if (cv.hidden === on) cv.hidden = !on;
  if (!on || !o || !isShown(o) || !w || !h) { if (drawn) { c2.clearRect(0, 0, cv.width, cv.height); drawn = false; last = ''; } return; }
  const keys = faceKeys(o), hov = hover.obj === o.id && keys.includes(hover.face) ? hover.face : null, pk = keys.includes(sel.face) ? sel.face : null;
  const items = [[hov && hov !== pk ? hov : null, 'hover'], [pk, 'sel']].map(([k, t]) => [k && outlines(o, k, w, h), t]).filter(([q]) => q);
  const sig = `${w}x${h}|` + items.map(([qs, t]) => t + qs.map(q => q.map(p => p.map(v => v.toFixed(1)).join(',')).join(';')).join('/')).join('|');
  if (sig === last) return;
  last = sig;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  c2.setTransform(dpr, 0, 0, dpr, 0, 0); c2.clearRect(0, 0, w, h); drawn = true;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0a7aa1';
  for (const [qs, t] of items) for (const q of qs) {
    c2.beginPath(); q.forEach(([x, y], i) => c2[i ? 'lineTo' : 'moveTo'](x, y)); c2.closePath();
    c2.globalAlpha = t === 'sel' ? .1 : .16; c2.fillStyle = accent; c2.fill(); c2.globalAlpha = 1;
    c2.lineWidth = t === 'sel' ? 2.5 : 1.5; c2.strokeStyle = accent; c2.stroke();
  }
}
/* the face under the pointer on the model (a pick of the scene's hover), for the net to show */
function notePickHover(h) {
  const o = activeObj();
  if (effectiveMode() !== 'split' || !o || !h || h.objId !== o.id || h.wall || !faceKeys(o).includes(h.face)) setHoverFace(null, null);
  else setHoverFace(o.id, h.face);
}
function initFaceHi() {
  cv = document.createElement('canvas'); cv.className = 'face-hi'; cv.setAttribute('aria-hidden', 'true'); cv.hidden = true; c2 = cv.getContext('2d');
  viewport.after(cv);
}

export { initFaceHi, notePickHover, syncFaceHi };
