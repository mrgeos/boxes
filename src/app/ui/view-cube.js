// Куб видов в правом нижнем углу сцены: ракурс выбранного объекта одним кликом; на телефоне — кнопка с панелью ракурсов
import * as THREE from 'three';
import { $, DEG } from '../core/util.js';
import { activeObj } from '../core/state.js';
import { camera, controls } from '../scene/renderer.js';
import { VIEW_LABEL, invalidate, lookFrom, orbitLock, setView, setViewName, viewName } from '../scene/camera.js';

/* The cube turns with the camera (in the selected object's frame, so «Перед» is the object's front) and shows
   where the camera looks from. A face picks that side, an edge or a corner the view between its faces; dragging
   the cube turns the camera. A face is a 3 × 3 grid: the middle cell is the face, the others its edges and corners.
   On a phone (narrow or touch screen) a round button shows the current view and opens big buttons instead. */
const FACES = [
  // key, label, normal, right, up (three.js axes, the object's front is +Z), the CSS turn that puts the face there
  ['front', 'Перед', [0, 0, 1], [1, 0, 0], [0, 1, 0], 'rotateY(0deg)'],
  ['back', 'Зад', [0, 0, -1], [-1, 0, 0], [0, 1, 0], 'rotateY(180deg)'],
  ['side', 'Право', [1, 0, 0], [0, 0, -1], [0, 1, 0], 'rotateY(90deg)'],
  ['left', 'Лево', [-1, 0, 0], [0, 0, 1], [0, 1, 0], 'rotateY(-90deg)'],
  ['top', 'Верх', [0, 1, 0], [1, 0, 0], [0, 0, -1], 'rotateX(90deg)'],
  ['bottom', 'Низ', [0, -1, 0], [1, 0, 0], [0, 0, 1], 'rotateX(-90deg)'],
];
const SHEET = ['q', 'front', 'back', 'side', 'left', 'top', 'bottom'];   // 3/4 across, then the opposite sides in pairs
const ICON_FOCUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_ALL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="7" height="9" rx="1"/><rect x="14" y="7" width="7" height="13" rx="1"/><path d="M6 7l3-3 3 3"/></svg>';

const C = new THREE.Matrix4().makeScale(1, -1, 1), M = new THREE.Matrix4(), Ry = new THREE.Matrix4(), V = new THREE.Matrix4();
let last = '';
/* the direction of a cell: the face, plus the neighbouring faces for an edge or a corner cell */
function cellDir(f, i, j) {
  const [, , n, r, u] = FACES.find(x => x[0] === f), a = i - 1, b = 1 - j;
  return [0, 1, 2].map(k => n[k] + r[k] * a + u[k] * b);
}
/* the cube follows the camera: the inverse of the view, in the object's frame, with CSS's y pointing down */
function syncViewCube() {
  placeCube();
  const cube = $('#vcCube'); if (!cube || cube.offsetParent === null) return;
  const o = activeObj(), yaw = o && orbitLock ? o.rotY * DEG : 0;
  V.extractRotation(camera.matrixWorldInverse); Ry.makeRotationY(yaw);
  M.copy(C).multiply(V).multiply(Ry).multiply(C);
  const t = `matrix3d(${M.elements.map(v => +v.toFixed(5)).join(',')})`;
  if (t !== last) { last = t; cube.style.transform = t; }
}
/* the corner, raised over the action bar and the selection's bar when they reach under it (a narrow stage, a phone) */
function placeCube() {
  const box = $('#viewCube'); if (!box) return;
  const st = box.parentElement, x0 = st.clientWidth - box.offsetWidth - 24;
  let top = st.clientHeight;
  for (const el of [$('#actionBar'), $('#ctxBar')]) if (el && !el.hidden && el.offsetWidth && el.offsetLeft + el.offsetWidth > x0) top = Math.min(top, el.offsetTop);
  const bottom = top < st.clientHeight ? st.clientHeight - top + 10 : 16;
  if (box.style.bottom !== bottom + 'px') box.style.bottom = bottom + 'px';
}
/* the camera turned by a drag on the cube: round the pivot, as the orbit controls do */
function orbitBy(dx, dy) {
  const off = camera.position.clone().sub(controls.target), s = new THREE.Spherical().setFromVector3(off);
  s.theta -= dx * .012; s.phi = Math.min(Math.PI - .01, Math.max(.01, s.phi - dy * .012));
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
  camera.lookAt(controls.target); controls.update(); setViewName('custom'); invalidate();
}
function initViewCube() {
  const stage = $('#stage'), box = document.createElement('div');
  box.id = 'viewCube'; box.className = 'vcube';
  box.innerHTML = `<div class="vc-scene" role="group" aria-label="Ракурс: клик по грани, ребру или углу, перетаскивание поворачивает">
      <div class="vc-cube" id="vcCube">${FACES.map(([k, label, , , , turn]) => `<div class="vc-face" style="transform:${turn} translateZ(var(--vc-h))" data-f="${k}">
        ${[0, 1, 2].map(j => [0, 1, 2].map(i => `<button type="button" data-i="${i}" data-j="${j}" ${i === 1 && j === 1 ? `aria-label="${label}"` : 'tabindex="-1" aria-hidden="true"'}>${i === 1 && j === 1 ? label : ''}</button>`).join('')).join('')}</div>`).join('')}</div></div>
    <div class="vc-btns"><button type="button" class="vc-b" id="vcFocus" title="К выбранному (F)" aria-label="К выбранному">${ICON_FOCUS}</button><button type="button" class="vc-b" id="vcAll" title="Вся сцена (H)" aria-label="Вся сцена">${ICON_ALL}</button></div>
    <button type="button" class="vc-fab" id="vcFab" aria-haspopup="true" aria-expanded="false" aria-controls="vcSheet" title="Ракурс"><span id="vcFabName">3/4</span></button>
    <div class="vc-sheet" id="vcSheet" role="group" aria-label="Ракурс" hidden>${SHEET.map(k => `<button type="button" data-v="${k}">${VIEW_LABEL[k]}</button>`).join('')}<button type="button" data-v="focus">К объекту</button><button type="button" data-v="fit">Вся сцена</button></div>`;
  stage.append(box);
  // a click on a cell looks from there; a drag turns the camera
  const sc = $('.vc-scene', box);
  let x0 = null, y0 = 0, lx = 0, ly = 0, moved = false;
  sc.addEventListener('pointerdown', e => { if (e.button > 0) return; x0 = lx = e.clientX; y0 = ly = e.clientY; moved = false; sc.setPointerCapture(e.pointerId); });
  sc.addEventListener('pointermove', e => {
    if (x0 == null) return;
    if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return;
    moved = true; orbitBy(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY;
  });
  sc.addEventListener('pointerup', e => {
    if (x0 == null) return; x0 = null; if (moved) return;
    const b = document.elementFromPoint(e.clientX, e.clientY)?.closest('.vc-face button'); if (!b) return;
    const f = b.closest('.vc-face').dataset.f, i = +b.dataset.i, j = +b.dataset.j;
    // the middle of a face: the named view (with its slight look from above); else the edge or corner between faces
    if (i === 1 && j === 1) setView(f); else { lookFrom(cellDir(f, i, j)); setViewName('custom'); }
  });
  sc.addEventListener('pointercancel', () => { x0 = null; });
  sc.addEventListener('keydown', e => { const b = e.target.closest('.vc-face button'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setView(b.closest('.vc-face').dataset.f); } });
  $('#vcFocus').onclick = () => setView(activeObj() ? 'focus' : 'fit');
  $('#vcAll').onclick = () => setView('fit');
  // the phone: the button and its sheet
  const fab = $('#vcFab'), sheet = $('#vcSheet');
  const open = on => { sheet.hidden = !on; fab.setAttribute('aria-expanded', String(on)); if (on) $('#vcFabName').textContent = VIEW_LABEL[viewName] || '3/4'; };
  fab.onclick = () => open(sheet.hidden);
  sheet.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; setView(b.dataset.v === 'focus' && !activeObj() ? 'fit' : b.dataset.v); open(false); };
  addEventListener('pointerdown', e => { if (!sheet.hidden && !e.target.closest('#vcSheet,#vcFab')) open(false); }, true);
  // the button shows the current view
  const name = $('#viewName');
  if (name) new MutationObserver(() => { $('#vcFabName').textContent = name.textContent; }).observe(name, { childList: true, characterData: true, subtree: true });
}

export { initViewCube, syncViewCube };
