// Рамка выделения на сцене: Alt (Option) + перетаскивание выбирает все объекты, которых она касается
import * as THREE from 'three';
import { state, sel } from '../core/state.js';
import { pickItems, topItem } from '../core/selection.js';
import { RT, camera, controls, cvs } from './renderer.js';
import { recording } from './camera.js';
import { tool } from '../ui/action-bar.js';

/* A drag with Alt held draws a frame on the scene; on release every shown object it touches is picked (an object
   in a group brings the whole group, as Shift+click does). With Shift as well it adds to what is picked. The
   frame is tested against each object's box as it looks on screen. Without Alt a drag turns the camera, as before. */
const box3 = new THREE.Box3(), v = new THREE.Vector3();
/* an object's box on screen, CSS pixels */
function screenRect(rt) {
  box3.setFromObject(rt.group); if (box3.isEmpty()) return null;
  const r = cvs.getBoundingClientRect(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box3.max.x : box3.min.x, i & 2 ? box3.max.y : box3.min.y, i & 4 ? box3.max.z : box3.min.z).project(camera);
    if (v.z > 1) continue;   // behind the camera
    const x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return x0 < x1 ? { x0, y0, x1, y1 } : null;
}
/* the items a frame (CSS pixels) touches */
function itemsIn(f) {
  const out = [];
  for (const o of state.objects) {
    if (o.hidden || o.locked) continue;
    const rt = RT.get(o.id), q = rt && screenRect(rt);
    if (q && q.x1 >= f.x0 && q.x0 <= f.x1 && q.y1 >= f.y0 && q.y0 <= f.y1) out.push(topItem(o.id));
  }
  return [...new Set(out)];
}
function initMarquee() {
  const stage = cvs.closest('#stage') || cvs.parentElement.parentElement;
  const el = document.createElement('div'); el.className = 'sel-rect'; el.hidden = true; stage.append(el);
  let m = null;
  const frame = e => ({ x0: Math.min(m.x, e.clientX), y0: Math.min(m.y, e.clientY), x1: Math.max(m.x, e.clientX), y1: Math.max(m.y, e.clientY) });
  // in the capture phase, before the orbit controls, so the drag does not turn the camera
  cvs.addEventListener('pointerdown', e => {
    if (!e.altKey || e.button !== 0 || e.pointerType === 'touch' || recording || tool() === 'hand') return;
    e.stopImmediatePropagation(); e.preventDefault();
    m = { x: e.clientX, y: e.clientY, add: e.shiftKey, base: sel.multi.length ? [...sel.multi] : sel.obj ? [topItem(sel.obj)] : [] };
    controls.enabled = false; cvs.setPointerCapture(e.pointerId);
  }, true);
  cvs.addEventListener('pointermove', e => {
    if (!m) return;
    const f = frame(e), s = stage.getBoundingClientRect();
    Object.assign(el.style, { left: f.x0 - s.left + 'px', top: f.y0 - s.top + 'px', width: f.x1 - f.x0 + 'px', height: f.y1 - f.y0 + 'px' });
    el.hidden = (f.x1 - f.x0) + (f.y1 - f.y0) < 4;
  });
  const end = e => {
    if (!m) return;
    const f = frame(e), add = m.add, base = m.base;
    m = null; el.hidden = true; controls.enabled = true;
    if ((f.x1 - f.x0) + (f.y1 - f.y0) < 4) return;   // an Alt-click without a drag picks nothing new
    const ids = itemsIn(f);
    pickItems(add ? [...base, ...ids] : ids);
  };
  cvs.addEventListener('pointerup', end); cvs.addEventListener('pointercancel', end);
}

export { initMarquee, itemsIn };
