// Камера, виды, свет сцены, цикл отрисовки
import * as THREE from 'three';
import { $, DEG, clamp } from '../core/util.js';
import { activeObj, sel, state } from '../core/state.js';
import { RT, buildObject, camera, controls, dirtyFaces, fillLight, floor, keyLight, markObj, rebuildQueue, renderer, scene, staleShadow, takeShadowStale, ui, viewport } from './renderer.js';
import { frameScale, noteFrame } from './quality.js';
import { shadersReady, warmShaders } from './warmup.js';
import { planTextures } from '../core/model.js';
import { renderFace } from '../faces/render.js';
import { stickerDirty } from '../stickers/placement.js';
import { buildStickerFilms } from '../stickers/film.js';
import { renderLayers } from '../ui/face-panel.js';
import { renderStickers } from '../ui/stickers-panel.js';
import { renderLibrary } from '../ui/library-panel.js';
import { drawEditor } from '../ui/face-editor.js';
import { drawNet } from '../net/net-view.js';
import { drawNetStage, markTop } from '../net/net-stage.js';
import { show3D } from '../ui/view-mode.js';
import { syncFaceHi } from './face-hi.js';
import { syncRings } from './move.js';
import { syncSelBox } from './sel-box.js';
import { syncCtxBar } from '../ui/context-bar.js';
import { syncStageHint } from '../ui/stage-hint.js';
import { drawSelLook, syncSelLook } from './sel-look.js';
import { syncViewCube } from '../ui/view-cube.js';
import { syncItemNav } from '../ui/item-nav.js';
import { renderBrand } from '../ui/brand-panel.js';
import { layoutPending, objectsIn } from '../core/groups.js';
import { applyEnv, spinEnv } from './environments.js';
import { active as studioActive, syncRenderChip } from './render-mode.js';
import { isShown } from './isolation.js';
import { syncIsolationPlate } from '../ui/isolation-plate.js';

/* the box round what is shown; all: the isolated-out objects too (where to put a new object) */
function sceneBounds(onlyActive = false, all = false) {
  const b = new THREE.Box3();
  for (const o of state.objects) { if ((onlyActive && o.id !== sel.obj) || (all ? o.hidden : !isShown(o))) continue; const rt = RT.get(o.id); if (rt) b.expandByObject(rt.group); }
  if (b.isEmpty()) b.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
  return b;
}
const VIEW_DIRS = { front: [0, .2, 1], q: [.78, .62, 1], side: [1, .2, 0], left: [-1, .2, 0], top: [0, 1, .0001], back: [0, .2, -1], bottom: [.0001, -1, .25] };
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
/* the scene is drawn for ms more, and at least once more: a frame that took longer than ms (a slow machine, a big
   change) would otherwise let the time run out before the next one, and a change asked for meanwhile (the view
   resized: its picture cleared) would never be drawn */
let drawUntil = 0, drawOnce = false;
function invalidate(ms = 200) { drawUntil = Math.max(drawUntil, performance.now() + ms); drawOnce = true; }
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
function tweenCamera(p1, q1, instant = false, v1 = { x: 0, y: 0 }) {
  invalidate();
  if (instant) { camera.position.copy(p1); controls.target.copy(q1); view.x = v1.x; view.y = v1.y; applyViewOffset(); controls.update(); return; }
  camTween = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1, q1, v0: { ...view }, v1 };
}
/* where the camera stands (kept by the isolation to come back to), and a way back there */
const camPose = () => ({ p: camera.position.clone(), q: controls.target.clone(), v: { ...view }, name: viewName, last: lastView });
function goPose(c) { lastView = c.last; setViewName(c.name); tweenCamera(c.p, c.q, false, c.v); }
function objBounds(id) {
  const rt = RT.get(id), b = new THREE.Box3(); if (rt) b.expandByObject(rt.group);
  return b.isEmpty() ? null : b;
}
/* frames these objects together (an object, or the objects of a group) from the same side the camera looks from now */
function frameItems(ids) {
  const b = new THREE.Box3(); for (const id of ids) { const q = objBounds(id); if (q) b.union(q); }
  if (b.isEmpty()) return;
  const c = b.getCenter(new THREE.Vector3()), r = b.getBoundingSphere(new THREE.Sphere()).radius;
  const off = camera.position.clone().sub(controls.target).setLength(fitDistance(r));
  tweenCamera(c.clone().add(off), c);
}
/* what the camera works with: several picked items or a group — all their objects (shown ones); else the active object.
   Its pivot, framing, views and auto-rotation all go by these */
const manyPicked = () => sel.multi.length > 1 || !!sel.group;
function selIds() {
  if (!manyPicked()) { const o = activeObj(); return o ? [o.id] : []; }
  return [...new Set((sel.group ? [sel.group] : sel.multi).flatMap(objectsIn))].filter(id => { const o = state.objects.find(q => q.id === id); return o && isShown(o); });
}
function selBounds() {
  const b = new THREE.Box3(); for (const id of selIds()) { const q = objBounds(id); if (q) b.union(q); }
  return b.isEmpty() ? null : b;
}
/* move the pivot to the selection (its centre, for several); keep the viewing angle, adjust distance only if it is far off */
function focusSelected({ frame = false } = {}) {
  const b = selBounds(); if (!b) return;
  const c = b.getCenter(new THREE.Vector3()), r = b.getBoundingSphere(new THREE.Sphere()).radius;
  const off = camera.position.clone().sub(controls.target);
  let dist = off.length();
  const fit = fitDistance(r);
  if (frame) dist = fit; else dist = clamp(dist, fit * .45, fit * 3.2);
  off.setLength(dist);
  tweenCamera(c.clone().add(off), c);
}
function setView(name, instant = false) {
  if (VIEW_DIRS[name]) lastView = name;
  const o = activeObj();
  lookFrom(VIEW_DIRS[name] || VIEW_DIRS[lastView], { instant, onObj: o && name !== 'fit' && (orbitLock || name === 'focus') });
  if (VIEW_DIRS[name]) setViewName(name);
}
/* the camera looks at the selected object (or the whole scene) from `d`, a direction in the object's own frame
   (its front is +Z), and frames it. ui/view-cube.js picks sides, edges and corners this way */
function lookFrom(d, { instant = false, onObj = !!activeObj() } = {}) {
  const o = activeObj(), dir = new THREE.Vector3(...d).normalize();
  // views follow the object's own front; several objects are seen in the scene's axes
  if (onObj && o && !manyPicked()) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotY * DEG);
  const b = onObj && o ? (selBounds() || sceneBounds()) : sceneBounds();
  const c = b.getCenter(new THREE.Vector3()), r = b.getBoundingSphere(new THREE.Sphere()).radius;
  tweenCamera(c.clone().add(dir.multiplyScalar(fitDistance(r))), c, instant);
}
/* which side the camera looks from, shown on the view button: one of VIEW_DIRS, or 'custom' once the user turns it */
const VIEW_LABEL = { front: 'Спереди', q: '3/4', side: 'Справа', left: 'Слева', top: 'Сверху', back: 'Сзади', bottom: 'Снизу', custom: 'Свой' };
let viewName = 'q';
function setViewName(n) { viewName = n; const el = $('#viewName'); if (el) el.textContent = VIEW_LABEL[n] || n; }
function setOrbitLock(on) {
  orbitLock = on;
  try { localStorage.setItem('box-studio-3d/orbit', on ? 'object' : 'free'); } catch {}
  controls.enablePan = !on;
  if (on) focusSelected(); else if (view.x || view.y) tweenCamera(camera.position.clone(), controls.target.clone());
}
/* depth precision depends on the near plane: a fixed 5 mm near plane leaves too few depth steps far away,
   and thin board, paper and film (inside and outside a fraction of a mm apart) flicker as the camera moves.
   So the near plane sits just short of the closest object (half the gap, for shadows and handles around them),
   never closer than 1/200 of the orbit distance */
function fitClipPlanes() {
  const d = camera.position.distanceTo(controls.target), gap = sceneBounds().distanceToPoint(camera.position);
  const near = clamp(gap * .5, Math.max(.002, d / 200), 50);
  if (Math.abs(near - camera.near) > camera.near * .02) { camera.near = near; camera.updateProjectionMatrix(); }
}
function updateShadowCam() {
  invalidate();
  const b = sceneBounds(), c = b.getCenter(new THREE.Vector3()), r = Math.max(.5, b.getBoundingSphere(new THREE.Sphere()).radius);
  const s = state.scene, az = s.az * DEG, el = s.el * DEG;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  keyLight.position.copy(c).addScaledVector(dir, r * 4); keyLight.target.position.copy(c);
  fillLight.position.copy(c).addScaledVector(new THREE.Vector3(-dir.x, .5, -dir.z), r * 4); fillLight.target.position.copy(c);
  const sc = keyLight.shadow.camera; sc.left = sc.bottom = -r * 1.6; sc.right = sc.top = r * 1.6; sc.near = .01; sc.far = r * 10; sc.updateProjectionMatrix();
  fitShadowBias();
}
/* Like a game, the key light's shadow covers what the camera sees rather than the whole scene: close up on a small
   box beside a large carton, its pixels go to that box. It is fitted where the shadow is drawn anew (the camera at
   rest, or the scene changed), from the scene as it is then (an opened lid or a loaded model reaches past where the
   objects were built), so a moving camera keeps the shadow it has. Seen from the light, the area is where the scene
   and the camera's view overlap, with a margin, and not so small that the map's pixel is finer than SHADOW_TEXEL; in
   depth it takes the whole scene and past it, so what casts a shadow into the view from outside it still does. */
const SHADOW_TEXEL = .0015;   // 0.15 mm (a millimetre is 0.01 here): finer pixels would only be wasted
const PENUMBRA = .025;   // half the width of a shadow's soft edge: 2.5 mm, as from a large soft light
// a camera, as three's shadow camera is (an Object3D's lookAt turns its +z to the target, a camera's -z)
const lightCam = new THREE.OrthographicCamera(), lp = new THREE.Vector3(), lq = new THREE.Vector3();
function fitShadowToView() {
  const b = sceneBounds(), c = b.getCenter(new THREE.Vector3()), r = Math.max(.5, b.getBoundingSphere(new THREE.Sphere()).radius);
  const s = state.scene, az = s.az * DEG, el = s.el * DEG;
  keyLight.position.copy(c).addScaledVector(lp.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)), r * 4); keyLight.target.position.copy(c);
  keyLight.updateMatrixWorld(); keyLight.target.updateMatrixWorld(); camera.updateMatrixWorld();
  lightCam.position.copy(keyLight.position); lightCam.lookAt(c); lightCam.updateMatrixWorld();
  const toLight = lightCam.matrixWorld.clone().invert(), span = () => [Infinity, Infinity, -Infinity, -Infinity, Infinity, -Infinity];
  const grow = (a, v) => { v.applyMatrix4(toLight); a[0] = Math.min(a[0], v.x); a[1] = Math.min(a[1], v.y); a[2] = Math.max(a[2], v.x); a[3] = Math.max(a[3], v.y); a[4] = Math.min(a[4], v.z); a[5] = Math.max(a[5], v.z); };
  // the scene's box, and the camera's view as far as the scene's farthest corner
  const A = span(), F = span(); let reach = 0;
  for (let i = 0; i < 8; i++) {
    lq.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
    reach = Math.max(reach, lq.distanceTo(camera.position)); grow(A, lq);
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const n = new THREE.Vector3(x, y, -1).unproject(camera), d = new THREE.Vector3(x, y, .5).unproject(camera).sub(n).normalize();
    grow(F, n.clone()); grow(F, n.addScaledVector(d, reach));
  }
  let [x0, y0, x1, y1] = [Math.max(A[0], F[0]), Math.max(A[1], F[1]), Math.min(A[2], F[2]), Math.min(A[3], F[3])];
  if (!(x1 > x0 && y1 > y0)) [x0, y0, x1, y1] = A;
  // a margin, so a turn of the camera does not at once leave the shadowed area; then at least the size whose pixels
  // are SHADOW_TEXEL (no finer than the soft edge needs), kept within the scene where it can
  const pad = Math.max(.05, (x1 - x0) * .12, (y1 - y0) * .12), least = SHADOW_TEXEL * keyLight.shadow.mapSize.x;
  const fit = (a0, a1, lo, hi) => {
    a0 -= pad; a1 += pad; lo -= pad; hi += pad;
    const w = Math.max(least, a1 - a0); if (w === a1 - a0) return [a0, a1];
    if (w >= hi - lo) return [(lo + hi - w) / 2, (lo + hi + w) / 2];   // larger than the scene: round it
    a0 = (a0 + a1 - w) / 2; a1 = a0 + w;
    if (a0 < lo) { a1 += lo - a0; a0 = lo; } else if (a1 > hi) { a0 -= a1 - hi; a1 = hi; }
    return [a0, a1];
  };
  [x0, x1] = fit(x0, x1, A[0], A[2]); [y0, y1] = fit(y0, y1, A[1], A[3]);
  const sc = keyLight.shadow.camera;
  sc.left = x0; sc.right = x1; sc.bottom = y0; sc.top = y1;
  // the light looks down its -z: the whole scene in depth, and well past it, where shadows fall on the floor beyond
  // the objects (a shadow past the far end would be cut off)
  sc.near = Math.max(.01, -A[5] - .1); sc.far = -A[4] + r * 3; sc.updateProjectionMatrix();
  fitShadowBias();
}
/* the shadow covers the whole scene, so in a big one or on a smaller map each of its pixels covers more of the
   surface; a surface's own shadow then falls on it in stripes ("acne"). The lookup is pushed off the surface by a
   pixel and a half of the map, never less than 2 mm. The soft edge is PENUMBRA wide in the scene (radius in pixels of
   the map, for the shadow filter: scene/soft-shadows.js), at most 6 of them: close up it is narrower, never noisy */
function fitShadowBias() {
  const sc = keyLight.shadow.camera, texel = Math.max(sc.right - sc.left, sc.top - sc.bottom) / keyLight.shadow.mapSize.x;
  keyLight.shadow.normalBias = Math.max(.02, 1.5 * texel);
  keyLight.shadow.radius = Math.min(6, Math.max(1, PENUMBRA / texel));
}
function applyScene() {
  invalidate();
  const s = state.scene;
  keyLight.intensity = s.light; fillLight.intensity = s.light * .18;
  scene.environmentIntensity = s.env; floor.material.opacity = s.shadow; applyEnv();
  renderer.toneMappingExposure = s.exposure;
  const st = $('#stage');
  st.classList.toggle('checker', s.bg === 'transparent');
  st.style.background = s.bg === 'gradient' ? `radial-gradient(120% 95% at 50% 32%, ${s.bg1} 0%, ${s.bg2} 100%)` : s.bg === 'solid' ? s.bg1 : '';
  updateShadowCam();
}
/* The faces waiting for their picture are painted a few a frame, like a game streaming its world in: about FACE_MS
   of each frame, the selected objects' first, then the nearest to the camera. Opening a big project no longer
   freezes the page for seconds; until its turn a face shows its ground colour. While the camera is still the share
   is bigger and the scene is drawn only a few times a second (as a game's loading screen); while it moves, painting
   steps back. flushFaces paints them all at once (before an export). */
const FACE_MS = 40, FACE_MS_MOVING = 8, PAINT_DRAW_MS = 200;
function paintFaces(ms) {
  if (!dirtyFaces.size) return;
  const t0 = performance.now(), mine = new Set(selIds()), rank = new Map(), objs = new Map(state.objects.map(o => [o.id, o]));
  const idOf = key => key.slice(0, key.indexOf('|'));
  for (const key of dirtyFaces) {
    const id = idOf(key); if (rank.has(id)) continue;
    const g = RT.get(id)?.group;
    rank.set(id, mine.has(id) ? -1 : g ? g.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position) : 1e9);
  }
  for (const key of [...dirtyFaces].sort((a, b) => rank.get(idOf(a)) - rank.get(idOf(b)))) {
    dirtyFaces.delete(key);
    const id = idOf(key), o = objs.get(id); if (!o) continue;
    renderFace(o, key.slice(id.length + 1));
    if (id === sel.obj) { ui.editor = true; ui.net = true; }
    if (performance.now() - t0 > ms) break;
  }
}
const flushFaces = () => paintFaces(Infinity);
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
  // only the user's own dragging starts the controls; a click that does not move the camera keeps the view's name
  let userDrag = false;
  controls.addEventListener('start', () => { userDrag = true; });
  controls.addEventListener('end', () => { userDrag = false; });
  controls.addEventListener('change', () => { if (userDrag) setViewName('custom'); });
  // a handler may change materials or the scene directly: draw after any input
  // (input outside the 3D view may change the scene in ways the parts do not report: its shadow is drawn anew)
  for (const t of ['pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup', 'input', 'change', 'click', 'drop', 'paste']) addEventListener(t, e => {
    // working on the net (zoom, pan, hover) does not change the 3D view: its refined picture stays
    if ((e.type === 'wheel' || e.type.startsWith('pointer')) && e.target.closest?.('#netPane')) return;
    invalidate(); if (e.target !== renderer.domElement) staleShadow();
  }, { capture: true, passive: true });
  renderer.domElement.addEventListener('pointermove', () => invalidate(), { passive: true });
  let lastNow = 0, wasMoving = false, lastDraw = 0;
  renderer.setAnimationLoop(now => {
    // seconds since the last frame: the auto-rotation turns by time, not by frames (a slow machine turns as fast)
    const gap = lastNow ? now - lastNow : 0, dt = Math.min(.25, gap / 1000); lastNow = now;
    let changed = rebuildQueue.size || stickerDirty.size || camTween || recording || now < drawUntil || drawOnce;
    drawOnce = false;
    if (dirtyFaces.size || stickerDirty.size) staleShadow();   // a face's picture may cut it (alpha) and so its shadow
    let turning = !!camTween;
    for (const id of rebuildQueue) { const o = state.objects.find(x => x.id === id); if (o) buildObject(o); }
    if (rebuildQueue.size) { rebuildQueue.clear(); updateShadowCam(); warmShaders(); }
    if (layoutPending()) changed = true;
    for (const o of planTextures(state.objects, selIds())) markObj(o);
    const painting = dirtyFaces.size > 0;
    if (painting || stickerDirty.size) warmShaders();   // a painted face may take new maps (another program)
    paintFaces(wasMoving ? FACE_MS_MOVING : FACE_MS);
    for (const id of stickerDirty) { const o = state.objects.find(x => x.id === id); if (o) buildStickerFilms(o); }
    stickerDirty.clear();
    if (camTween) {
      const t = clamp((now - camTween.t0) / 520, 0, 1), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      camera.position.lerpVectors(camTween.p0, camTween.p1, e); controls.target.lerpVectors(camTween.q0, camTween.q1, e);
      const { v0, v1 } = camTween; view.x = v0.x + (v1.x - v0.x) * e; view.y = v0.y + (v1.y - v0.y) * e; applyViewOffset();
      if (t >= 1) camTween = null;
    }
    controls.enablePan = !lockActive();
    if (syncRings()) changed = true;
    if (syncSelBox()) changed = true;
    if (syncSelLook()) changed = true;
    if (spinEnv(now)) changed = true;
    if (recording) recording.step(now);
    else if (controls.update(dt)) { changed = true; turning = true; }
    // while the camera moves the frame is drawn with fewer pixels and keeps its shadow (see quality.js); a click that
    // does not move it stays sharp, and a video is always drawn in full
    const moving = !recording && turning;
    if (frameScale(moving)) changed = true;
    noteFrame(gap, moving && changed);
    for (const rt of RT.values()) for (const k in rt.faces) {
      const f = rt.faces[k];
      if (f.flash > 0) { changed = true; f.flash = Math.max(0, f.flash - .035); f.mat.emissive.copy(accent).multiplyScalar(f.flash * .45); }
    }
    // a frame where only faces were painted is drawn now and then, and when the last of them is done
    if (painting && !changed && (!dirtyFaces.size || now - lastDraw > PAINT_DRAW_MS)) changed = true;
    wasMoving = moving;
    // the frame waits (the last one stays on screen) while the programs it needs are built in the background
    // in «2D» the 3D view is hidden: nothing is drawn (the faces are still painted, the net needs them)
    const live = show3D();
    if (!live) changed = false;
    if (changed && !shadersReady(now)) { changed = false; invalidate(); }
    // «Рендер» (scene/render-mode.js): a frame that changed is drawn quickly; a still one adds a sample to the refined picture
    const studio = studioActive(), refining = live && !!studio && !changed && studio.pending();
    if (changed) { lastDraw = now; fitClipPlanes(); if (takeShadowStale() || !moving) { fitShadowToView(); renderer.shadowMap.needsUpdate = true; } if (studio) studio.frame(true); else renderer.render(scene, camera); drawSelLook(); syncViewCube(); syncItemNav(); }
    else if (refining) { studio.frame(false); drawSelLook(); }
    syncRenderChip(studio); syncCtxBar(changed); syncStageHint(); syncIsolationPlate(); syncFaceHi();
    if (ui.editor) { ui.editor = false; drawEditor(); markTop(); }
    if (ui.net) { ui.net = false; drawNet(); drawNetStage(); }
    if (ui.layers) { ui.layers = false; renderLayers(); }
    if (ui.stickers) { ui.stickers = false; renderStickers(); }
    if (ui.lib) { ui.lib = false; renderLibrary(); }
    if (ui.brand) { ui.brand = false; renderBrand(); }
  });
}

export { camPose, goPose, VIEW_DIRS, VIEW_LABEL, fitShadowBias, fitShadowToView, flushFaces, frameItems, manyPicked, lookFrom, setViewName, accent, applyScene, applyViewOffset, camTween, focusSelected, initCamera, invalidate, lastView, lockActive, orbitLock, recording, resize, sceneBounds, setCamTween, setLastView, setOrbitLock, setRecording, setView, updateShadowCam, view, viewName };
