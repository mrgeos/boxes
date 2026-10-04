// Камера, виды, свет сцены, цикл отрисовки
import * as THREE from 'three';
import { $, $$, DEG, clamp } from '../core/util.js';
import { activeObj, sel, state } from '../core/state.js';
import { RT, buildObject, camera, controls, dirtyFaces, fillLight, floor, keyLight, rebuildQueue, renderer, scene, ui, viewport } from './renderer.js';
import { renderFace } from '../faces/render.js';
import { stickerDirty } from '../stickers/placement.js';
import { buildStickerFilms } from '../stickers/film.js';
import { renderLayers } from '../ui/face-panel.js';
import { renderStickers } from '../ui/stickers-panel.js';
import { renderLibrary } from '../ui/library-panel.js';
import { drawEditor } from '../ui/face-editor.js';
import { drawNet } from '../net/net-view.js';
import { syncRings } from './move.js';
import { layoutPending } from '../core/groups.js';

function sceneBounds(onlyActive = false) {
  const b = new THREE.Box3();
  for (const o of state.objects) { if (onlyActive && o.id !== sel.obj) continue; const rt = RT.get(o.id); if (rt) b.expandByObject(rt.group); }
  if (b.isEmpty()) b.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
  return b;
}
const VIEW_DIRS = { front: [0, .2, 1], q: [.78, .62, 1], side: [1, .2, 0], top: [0, 1, .0001], back: [0, .2, -1], bottom: [.0001, -1, .25] };
let camTween = null, lastView = 'q';
/* ---------- orbit around the selected object ----------
   With the lock on, the orbit pivot (controls.target) sits at the selected object's centre.
   Panning shifts the picture on screen (a projection offset) instead of moving the pivot,
   so rotating and zooming always stay around the object. */
let orbitLock = true;
try { orbitLock = localStorage.getItem('box-studio-3d/orbit') !== 'free'; } catch {}
const view = { x: 0, y: 0 };
/* the 3D view is drawn only while something changes, so a still scene costs no GPU time:
   the loop draws when a queue has work, the camera moves or a face flashes, and for a moment after
   anything that may change the scene in place (input, a new view, scene settings) */
let drawUntil = 0;
function invalidate(ms = 200) { drawUntil = Math.max(drawUntil, performance.now() + ms); }
   // screen-space pan, CSS px
const lockActive = () => orbitLock && !!activeObj();
function applyViewOffset() {
  invalidate();
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  if (Math.abs(view.x) < .01 && Math.abs(view.y) < .01) camera.clearViewOffset();
  else camera.setViewOffset(w, h, view.x, view.y, w, h);
}
function fitDistance(r) {
  const vf = camera.fov * DEG / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
  return r / Math.sin(Math.min(vf, hf)) * 1.08;
}
function tweenCamera(p1, q1, instant = false) {
  invalidate();
  if (instant) { camera.position.copy(p1); controls.target.copy(q1); view.x = view.y = 0; applyViewOffset(); controls.update(); return; }
  camTween = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1, q1, v0: { ...view } };
}
function objBounds(id) {
  const rt = RT.get(id), b = new THREE.Box3(); if (rt) b.expandByObject(rt.group);
  return b.isEmpty() ? null : b;
}
/* move the pivot to the selected object; keep the viewing angle, adjust distance only if it is far off */
function focusSelected({ frame = false } = {}) {
  const o = activeObj(), b = o && objBounds(o.id); if (!b) return;
  const c = b.getCenter(new THREE.Vector3()), r = b.getBoundingSphere(new THREE.Sphere()).radius;
  const off = camera.position.clone().sub(controls.target);
  let dist = off.length();
  const fit = fitDistance(r);
  if (frame) dist = fit; else dist = clamp(dist, fit * .45, fit * 3.2);
  off.setLength(dist);
  tweenCamera(c.clone().add(off), c);
  $$('#views .btn[data-view]').forEach(b => b.classList.toggle('on', frame && b.dataset.view === 'focus'));
}
function setView(name, instant = false) {
  if (VIEW_DIRS[name]) lastView = name;
  const o = activeObj();
  const onObj = o && name !== 'fit' && (orbitLock || name === 'focus');
  const dir = new THREE.Vector3(...(VIEW_DIRS[name] || VIEW_DIRS[lastView])).normalize();
  if (onObj) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotY * DEG);   // views follow the object's own front
  const b = onObj ? (objBounds(o.id) || sceneBounds()) : sceneBounds();
  const c = b.getCenter(new THREE.Vector3()), r = b.getBoundingSphere(new THREE.Sphere()).radius;
  tweenCamera(c.clone().add(dir.multiplyScalar(fitDistance(r))), c, instant);
  $$('#views .btn[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === name));
}
function setOrbitLock(on) {
  orbitLock = on;
  try { localStorage.setItem('box-studio-3d/orbit', on ? 'object' : 'free'); } catch {}
  controls.enablePan = !on;
  const b = $('#orbitLockBtn'); b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on);
  if (on) focusSelected(); else if (view.x || view.y) tweenCamera(camera.position.clone(), controls.target.clone());
}
function updateShadowCam() {
  invalidate();
  const b = sceneBounds(), c = b.getCenter(new THREE.Vector3()), r = Math.max(.5, b.getBoundingSphere(new THREE.Sphere()).radius);
  const s = state.scene, az = s.az * DEG, el = s.el * DEG;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  keyLight.position.copy(c).addScaledVector(dir, r * 4); keyLight.target.position.copy(c);
  fillLight.position.copy(c).addScaledVector(new THREE.Vector3(-dir.x, .5, -dir.z), r * 4); fillLight.target.position.copy(c);
  const sc = keyLight.shadow.camera; sc.left = sc.bottom = -r * 1.6; sc.right = sc.top = r * 1.6; sc.near = .01; sc.far = r * 10; sc.updateProjectionMatrix();
}
function applyScene() {
  invalidate();
  const s = state.scene;
  keyLight.intensity = s.light; fillLight.intensity = s.light * .18;
  scene.environmentIntensity = s.env; floor.material.opacity = s.shadow;
  renderer.toneMappingExposure = s.exposure; controls.autoRotate = !!s.autoRotate;
  const st = $('#stage');
  st.classList.toggle('checker', s.bg === 'transparent');
  st.style.background = s.bg === 'gradient' ? `radial-gradient(120% 95% at 50% 32%, ${s.bg1} 0%, ${s.bg2} 100%)` : s.bg === 'solid' ? s.bg1 : '';
  updateShadowCam();
}
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); applyViewOffset();
}
const accent = new THREE.Color();
let recording = null;
/* other parts set these through functions (an imported binding is read-only) */
function setLastView(v) { lastView = v; }
function setCamTween(v) { camTween = v; }
function setRecording(v) { recording = v; }

/* resizes the view with its box and starts the render loop */
function initCamera() {
  new ResizeObserver(resize).observe(viewport);
  // a handler may change materials or the scene directly: draw after any input
  for (const t of ['pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup', 'input', 'change', 'click', 'drop', 'paste']) addEventListener(t, () => invalidate(), { capture: true, passive: true });
  renderer.domElement.addEventListener('pointermove', () => invalidate(), { passive: true });
  renderer.setAnimationLoop(now => {
    let changed = rebuildQueue.size || dirtyFaces.size || stickerDirty.size || camTween || recording || now < drawUntil;
    for (const id of rebuildQueue) { const o = state.objects.find(x => x.id === id); if (o) buildObject(o); }
    if (rebuildQueue.size) { rebuildQueue.clear(); updateShadowCam(); }
    if (layoutPending()) changed = true;
    for (const key of dirtyFaces) {
      const [id, k] = key.split('|'); const o = state.objects.find(x => x.id === id); if (o) renderFace(o, k);
    }
    dirtyFaces.clear();
    for (const id of stickerDirty) { const o = state.objects.find(x => x.id === id); if (o) buildStickerFilms(o); }
    stickerDirty.clear();
    if (camTween) {
      const t = clamp((now - camTween.t0) / 520, 0, 1), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      camera.position.lerpVectors(camTween.p0, camTween.p1, e); controls.target.lerpVectors(camTween.q0, camTween.q1, e);
      view.x = camTween.v0.x * (1 - e); view.y = camTween.v0.y * (1 - e); applyViewOffset();
      if (t >= 1) camTween = null;
    }
    controls.enablePan = !lockActive();
    if (syncRings()) changed = true;
    if (recording) recording.step(now);
    else if (controls.update()) changed = true;
    for (const rt of RT.values()) for (const k in rt.faces) {
      const f = rt.faces[k];
      if (f.flash > 0) { changed = true; f.flash = Math.max(0, f.flash - .035); f.mat.emissive.copy(accent).multiplyScalar(f.flash * .45); }
    }
    if (changed) renderer.render(scene, camera);
    if (ui.editor) { ui.editor = false; drawEditor(); }
    if (ui.net) { ui.net = false; drawNet(); }
    if (ui.layers) { ui.layers = false; renderLayers(); }
    if (ui.stickers) { ui.stickers = false; renderStickers(); }
    if (ui.lib) { ui.lib = false; renderLibrary(); }
  });
}

export { accent, applyScene, applyViewOffset, camTween, focusSelected, initCamera, invalidate, lastView, lockActive, orbitLock, recording, resize, sceneBounds, setCamTween, setLastView, setOrbitLock, setRecording, setView, updateShadowCam, view };
