// Как выбранный объект виден на сцене: контур по силуэту, подложка на полу, уголки рамки, приглушение остального, ярлык
import * as THREE from 'three';
import { $, S } from '../core/util.js';
import { activeLayer, sel, state } from '../core/state.js';
import { objectsIn } from '../core/groups.js';
import { activeSticker } from '../stickers/placement.js';
import { RT, camera, cvs, renderer, scene } from './renderer.js';
import { invalidate, recording } from './camera.js';
import { pick } from './interaction.js';

/* The look of the selection, one of MODES ('none' — no mark on the model, as before). The outline is drawn after
   the scene: the picked objects are drawn flat into a mask (red: selected, green: under the pointer, blue: all
   objects), and a full-screen pass paints a stroke round the mask and, for 'dim', veils the other objects. It is
   not in pictures of the scene: exports render the scene alone, and recording skips it. */
const MODES = { none: 'Сейчас', outline: 'Контур', plate: 'Подложка', corners: 'Уголки', dim: 'Приглушить', label: 'Ярлык', combo: 'Предлагаю' };
let mode = 'none', hoverId = null, key = '';
const ACC = new THREE.Color('#0a7aa1');
const has = m => mode === m || (mode === 'combo' && (m === 'outline' || m === 'plate'));

/* the objects picked: an object, or every object of a group picked in the list */
const pickedIds = () => [...new Set((sel.multi.length ? sel.multi : sel.obj ? [sel.obj] : []).flatMap(objectsIn))].filter(id => { const o = state.objects.find(q => q.id === id); return o && !o.hidden && RT.has(id); });

/* ---------- the mask and the outline pass ---------- */
const MASK_LAYER = 7;
let rtMask = null;
const maskMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true });
const pass = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), new THREE.ShaderMaterial({
  uniforms: { mask: { value: null }, px: { value: new THREE.Vector2() }, acc: { value: ACC }, w: { value: 2 }, selA: { value: 1 }, hovA: { value: 0 }, dimA: { value: 0 }, veil: { value: new THREE.Color('#ebe8e2') } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }',
  // the stroke is two-tone so it reads on dark and light packaging alike: the accent next to the object, a light
  // halo outside it
  fragmentShader: `uniform sampler2D mask; uniform vec2 px; uniform vec3 acc; uniform vec3 veil; uniform float w, selA, hovA, dimA; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(mask, vUv).rgb; vec2 n = vec2(0.), h = vec2(0.);
      for (int i = 0; i < 12; i++) {
        float a = float(i) * .5236; vec2 d = vec2(cos(a), sin(a)) * px;
        n = max(n, texture2D(mask, vUv + d * w * .5).rg); n = max(n, texture2D(mask, vUv + d * w).rg);
        h = max(h, texture2D(mask, vUv + d * (w + 1.5 * w / 3.)).rg);
      }
      float inS = step(.5, c.r), inH = step(.5, c.g);
      float so = n.r * (1. - inS), sh = h.r * (1. - inS) * (1. - n.r);
      float ho = n.g * (1. - inH) * (1. - inS), hh = h.g * (1. - inH) * (1. - inS) * (1. - n.g);
      float dim = dimA * step(.5, c.b) * (1. - inS);
      vec4 o = vec4(veil, dim);
      o = mix(o, vec4(1.), clamp(hh * hovA * .8, 0., 1.));
      o = mix(o, vec4(acc, 1.), clamp(ho * hovA, 0., 1.));
      o = mix(o, vec4(1.), clamp(sh * selA * .85, 0., 1.));
      o = mix(o, vec4(acc, 1.), clamp(so * selA, 0., 1.));
      gl_FragColor = o;
      #include <colorspace_fragment>
    }`,
  transparent: true, depthTest: false, depthWrite: false,
}));
pass.frustumCulled = false;
const passScene = new THREE.Scene(); passScene.add(pass);
const passCam = new THREE.Camera();
function maskInto(ids, color) {
  if (!ids.length) return;
  const tagged = [];
  for (const id of ids) RT.get(id)?.group.traverse(m => { if ((m.isMesh) && m.visible) { m.layers.enable(MASK_LAYER); tagged.push(m); } });
  maskMat.color.setHex(color);
  const was = camera.layers.mask; camera.layers.set(MASK_LAYER);
  renderer.render(scene, camera);
  camera.layers.mask = was; tagged.forEach(m => m.layers.disable(MASK_LAYER));
}
function drawOutline() {
  const outline = has('outline'), dim = has('dim');
  if (!outline && !dim) return;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (!rtMask) rtMask = new THREE.WebGLRenderTarget(size.x, size.y, { depthBuffer: false });
  if (rtMask.width !== size.x || rtMask.height !== size.y) rtMask.setSize(size.x, size.y);
  const ids = pickedIds(), dpr = renderer.getPixelRatio();
  const autoClear = renderer.autoClear, over = scene.overrideMaterial, bg = scene.background, cc = renderer.getClearAlpha();
  const shadows = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rtMask); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.autoClear = false; scene.overrideMaterial = maskMat; scene.background = null;
  maskInto(ids, 0xff0000);
  if (outline && hoverId && !ids.includes(hoverId)) maskInto([hoverId], 0x00ff00);
  if (dim && ids.length) maskInto(state.objects.filter(o => !o.hidden && !ids.includes(o.id)).map(o => o.id), 0x0000ff);
  scene.overrideMaterial = over; scene.background = bg;
  renderer.setRenderTarget(null); renderer.setClearColor(0x000000, cc); renderer.shadowMap.autoUpdate = shadows;
  const u = pass.material.uniforms, quiet = !!(activeLayer() || activeSticker() || sel.ribbon || sel.part);
  u.mask.value = rtMask.texture; u.px.value.set(1 / size.x, 1 / size.y); u.w.value = 3 * dpr;
  u.selA.value = outline ? (quiet ? .35 : 1) : 0; u.hovA.value = outline ? .5 : 0; u.dimA.value = dim ? .55 : 0;
  u.veil.value.set(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#e7e4de');
  renderer.render(passScene, passCam);
  renderer.autoClear = autoClear;
}

/* ---------- the plate on the floor and the corner brackets: made in the object's own frame ---------- */
const holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.visible = false;
const plateFill = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ACC, transparent: true, opacity: .12, depthWrite: false }));
const plateLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: ACC, transparent: true, opacity: .9 }));
const corners = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: ACC, depthTest: false, transparent: true, opacity: .95 }));
corners.renderOrder = 10; plateFill.renderOrder = -1;
holder.add(plateFill, plateLine, corners);
const lbl = () => $('#selLabel');
/* the object's box in its own frame (three.js units) */
function localBox(rt) {
  rt.group.updateMatrixWorld(true);
  const inv = rt.group.matrixWorld.clone().invert(), b = new THREE.Box3(), t = new THREE.Box3(), m = new THREE.Matrix4();
  rt.group.traverse(x => {
    if (!x.isMesh || !x.visible || x.userData.shared) return;
    if (!x.geometry.boundingBox) x.geometry.computeBoundingBox();
    b.union(t.copy(x.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, x.matrixWorld)));
  });
  return b.isEmpty() ? null : b;
}
function shapeFrom(b, pad) {
  const x0 = b.min.x - pad, x1 = b.max.x + pad, z0 = b.min.z - pad, z1 = b.max.z + pad, r = Math.min(.12, (x1 - x0) / 4, (z1 - z0) / 4);
  const s = new THREE.Shape();
  s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r); s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1);
  s.lineTo(x0 + r, z1); s.quadraticCurveTo(x0, z1, x0, z1 - r); s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
  return s;
}
function buildHolder(rt, b) {
  const pad = 12 * S, s = shapeFrom(b, pad), y = -b.min.y + .0008;   // just over the floor, under the object
  plateFill.geometry.dispose(); plateFill.geometry = new THREE.ShapeGeometry(s, 6).rotateX(Math.PI / 2).translate(0, b.min.y + y, 0);
  plateLine.geometry.dispose(); plateLine.geometry = new THREE.BufferGeometry().setFromPoints(s.getPoints(10).map(p => new THREE.Vector3(p.x, b.min.y + y + .0002, p.y)));
  // brackets: three short strokes from each corner of the box, a fifth of its smallest side
  const L = Math.min(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) * .22, P = [];
  for (const x of [b.min.x, b.max.x]) for (const yy of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    const sx = x === b.min.x ? 1 : -1, sy = yy === b.min.y ? 1 : -1, sz = z === b.min.z ? 1 : -1;
    P.push(x, yy, z, x + sx * L, yy, z, x, yy, z, x, yy + sy * L, z, x, yy, z, x, yy, z + sz * L);
  }
  corners.geometry.dispose(); corners.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
}

/* keeps the marks in step with the selection, the pointer and the objects; true when the scene needs drawing */
function syncSelLook() {
  const ids = pickedIds(), one = ids.length === 1 ? RT.get(ids[0]) : null;
  const k = JSON.stringify([mode, ids, hoverId, recording ? 1 : 0, one && one.group.matrixWorld.elements.map(v => +v.toFixed(4)), one && one.foot, activeLayer()?.id || sel.sticker || sel.part || '']);
  const changed = k !== key; key = k;
  const flat = (has('plate') || has('corners')) && one && !recording;
  holder.visible = !!flat;
  if (flat && changed) {
    const b = localBox(one);
    if (b) { buildHolder(one, b); holder.matrix.copy(one.group.matrixWorld); holder.matrixWorldNeedsUpdate = true; }
    plateFill.visible = plateLine.visible = has('plate'); corners.visible = has('corners');
    plateFill.material.opacity = mode === 'combo' ? .07 : .14; plateLine.material.opacity = mode === 'combo' ? .45 : .9;
  }
  return changed;
}
/* after the scene is drawn: the outline pass and the label */
function drawSelLook() {
  const el = lbl();
  if (recording) { if (el) el.hidden = true; return; }
  drawOutline();
  if (!el) return;
  const ids = pickedIds(), o = ids.length === 1 && state.objects.find(q => q.id === ids[0]), rt = o && RT.get(o.id);
  if (!has('label') || !rt) { el.hidden = true; return; }
  // over the top of the object's box on screen
  const b = new THREE.Box3().setFromObject(rt.group), r = cvs.getBoundingClientRect(), st = el.parentElement.getBoundingClientRect(), v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
    const x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y);
  }
  const { w, d, h } = o.dims;
  el.textContent = `${o.name} · ${w}×${d}×${h} мм`; el.hidden = false;
  el.style.left = Math.round((x0 + x1) / 2 - st.left) + 'px'; el.style.top = Math.round(y0 - st.top - 10) + 'px';
}
/* hides the marks for a picture of the scene; returns a function that brings them back */
function hideSelLook() { const v = holder.visible; holder.visible = false; return () => { holder.visible = v; }; }
function setSelLook(m) { if (!MODES[m]) return; mode = m; key = ''; invalidate(); try { localStorage.setItem('bs3d-sellook', m); } catch {} paintSwitch(); }

/* the switcher of the try-out build (window.__selDemo): the looks side by side on the real scene */
function paintSwitch() { document.querySelectorAll('#selDemo button').forEach(b => { const on = b.dataset.m === mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
function initSelLook() {
  scene.add(holder);
  const stage = $('#stage');
  const label = document.createElement('div'); label.id = 'selLabel'; label.className = 'sel-label'; label.hidden = true; stage.append(label);
  // what is under the pointer: the outline shows it before the click
  let pend = false, lx = 0, ly = 0;
  cvs.addEventListener('pointermove', e => {
    lx = e.clientX; ly = e.clientY; if (pend || e.buttons) return; pend = true;
    requestAnimationFrame(() => { pend = false; const id = has('outline') ? pick(lx, ly)?.objId || null : null; if (id !== hoverId) { hoverId = id; invalidate(); } });
  });
  cvs.addEventListener('pointerleave', () => { if (hoverId) { hoverId = null; invalidate(); } });
  if (!window.__selDemo) return;
  try { const m = localStorage.getItem('bs3d-sellook'); if (MODES[m]) mode = m; else mode = 'combo'; } catch { mode = 'combo'; }
  const bar = document.createElement('div'); bar.id = 'selDemo'; bar.className = 'sel-demo'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Как показать выбранный объект');
  bar.innerHTML = `<span>Выделение</span>${Object.entries(MODES).map(([k, v]) => `<button type="button" data-m="${k}">${v}</button>`).join('')}`;
  bar.onclick = e => { const b = e.target.closest('[data-m]'); if (b) setSelLook(b.dataset.m); };
  stage.append(bar); paintSwitch();
}

export { drawSelLook, hideSelLook, initSelLook, setSelLook, syncSelLook };
