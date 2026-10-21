// Как выбранный объект виден на сцене: контур по силуэту и подложка на полу; ярлык с названием над объектом под курсором
import * as THREE from 'three';
import { $, OVERLAY_LAYER, S } from '../core/util.js';
import { activeLayer, sel, state } from '../core/state.js';
import { objectsIn } from '../core/groups.js';
import { activeSticker } from '../stickers/placement.js';
import { RT, camera, cvs, renderer, scene } from './renderer.js';
import { invalidate, recording } from './camera.js';
import { pick } from './interaction.js';
import { tool } from '../ui/action-bar.js';

/* The selected object gets a two-tone outline round its silhouette and a faint plate on the floor; the object under
   the pointer gets a pale outline and a label with its name and size. The outline is drawn after the scene: the
   objects are drawn flat into a mask (red: selected, green: under the pointer), and a full-screen pass paints a
   stroke round it. None of it is in pictures of the scene: exports render the scene alone, recording skips it. */
let hoverId = null, key = '';
const ACC = new THREE.Color('#0a7aa1');

/* the objects picked: an object, or every object of a group picked in the list */
const pickedIds = () => [...new Set((sel.multi.length ? sel.multi : sel.obj ? [sel.obj] : []).flatMap(objectsIn))].filter(id => { const o = state.objects.find(q => q.id === id); return o && !o.hidden && RT.has(id); });

/* ---------- the mask and the outline pass ---------- */
const MASK_LAYER = 7;
let rtMask = null;
const maskMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true });
const pass = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), new THREE.ShaderMaterial({
  uniforms: { mask: { value: null }, px: { value: new THREE.Vector2() }, acc: { value: ACC }, w: { value: 3 }, selA: { value: 1 }, hovA: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }',
  // the stroke is two-tone so it reads on dark and light packaging alike: the accent next to the object, a light
  // halo outside it
  fragmentShader: `uniform sampler2D mask; uniform vec2 px; uniform vec3 acc; uniform float w, selA, hovA; varying vec2 vUv;
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
      vec4 o = vec4(0.);
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
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (!rtMask) rtMask = new THREE.WebGLRenderTarget(size.x, size.y, { depthBuffer: false });
  if (rtMask.width !== size.x || rtMask.height !== size.y) rtMask.setSize(size.x, size.y);
  const ids = pickedIds(), dpr = renderer.getPixelRatio();
  const autoClear = renderer.autoClear, over = scene.overrideMaterial, bg = scene.background, cc = renderer.getClearAlpha();
  const shadows = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rtMask); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.autoClear = false; scene.overrideMaterial = maskMat; scene.background = null;
  maskInto(ids, 0xff0000);
  if (hoverId && !ids.includes(hoverId)) maskInto([hoverId], 0x00ff00);
  scene.overrideMaterial = over; scene.background = bg;
  renderer.setRenderTarget(null); renderer.setClearColor(0x000000, cc); renderer.shadowMap.autoUpdate = shadows;
  const u = pass.material.uniforms, quiet = !!(activeLayer() || activeSticker() || sel.ribbon || sel.part);
  u.mask.value = rtMask.texture; u.px.value.set(1 / size.x, 1 / size.y); u.w.value = 3 * dpr;
  u.selA.value = quiet ? .35 : 1; u.hovA.value = .5;
  renderer.render(passScene, passCam);
  renderer.autoClear = autoClear;
}

/* ---------- the plate on the floor: made in the object's own frame ---------- */
const holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.visible = false;
const plateFill = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ACC, transparent: true, opacity: .07, depthWrite: false }));
const plateLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: ACC, transparent: true, opacity: .45 }));
plateFill.renderOrder = -1; plateFill.layers.enable(OVERLAY_LAYER); plateLine.layers.enable(OVERLAY_LAYER);
holder.add(plateFill, plateLine);
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
/* a rounded frame round the box's footprint, `pad` out from it */
function buildPlate(b) {
  const pad = 12 * S, x0 = b.min.x - pad, x1 = b.max.x + pad, z0 = b.min.z - pad, z1 = b.max.z + pad, r = Math.min(.12, (x1 - x0) / 4, (z1 - z0) / 4);
  const s = new THREE.Shape();
  s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r); s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1);
  s.lineTo(x0 + r, z1); s.quadraticCurveTo(x0, z1, x0, z1 - r); s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
  const y = .0008;   // just over the floor, under the object
  plateFill.geometry.dispose(); plateFill.geometry = new THREE.ShapeGeometry(s, 6).rotateX(Math.PI / 2).translate(0, y, 0);
  plateLine.geometry.dispose(); plateLine.geometry = new THREE.BufferGeometry().setFromPoints(s.getPoints(10).map(p => new THREE.Vector3(p.x, y + .0002, p.y)));
}

/* keeps the marks in step with the selection, the pointer and the objects; true when the scene needs drawing */
function syncSelLook() {
  const ids = pickedIds(), one = ids.length === 1 ? RT.get(ids[0]) : null;
  const k = JSON.stringify([ids, hoverId, tool(), recording ? 1 : 0, one && one.group.matrixWorld.elements.map(v => +v.toFixed(4)), one && one.foot, activeLayer()?.id || sel.sticker || sel.part || '']);
  const changed = k !== key; key = k;
  // with the move and rotate tools the floor ring (scene/move.js) marks it instead
  holder.visible = !!one && !recording && tool() !== 'move' && tool() !== 'rotate';
  if (holder.visible && changed) {
    const b = localBox(one);
    if (b) { buildPlate(b); holder.matrix.copy(one.group.matrixWorld); holder.matrixWorldNeedsUpdate = true; }
  }
  return changed;
}
/* after the scene is drawn: the outline pass and the label over the object under the pointer */
function drawSelLook() {
  const el = $('#selLabel');
  if (recording) { if (el) el.hidden = true; return; }
  drawOutline();
  if (!el) return;
  const o = hoverId && state.objects.find(q => q.id === hoverId), rt = o && !o.hidden && RT.get(o.id);
  if (!rt) { el.hidden = true; return; }
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
  el.style.left = Math.round(Math.min(st.width - el.offsetWidth / 2 - 8, Math.max(el.offsetWidth / 2 + 8, (x0 + x1) / 2 - st.left))) + 'px';
  el.style.top = Math.round(Math.max(el.offsetHeight + 8, y0 - st.top - 10)) + 'px';
}
/* hides the marks for a picture of the scene; returns a function that brings them back */
function hideSelLook() { const v = holder.visible; holder.visible = false; return () => { holder.visible = v; }; }
function initSelLook() {
  scene.add(holder);
  const label = document.createElement('div'); label.id = 'selLabel'; label.className = 'sel-label'; label.hidden = true; $('#stage').append(label);
  // what is under the pointer: a pale outline and its label show it before the click (a mouse only: a touch has no hover)
  let pend = false, lx = 0, ly = 0;
  const setHover = id => { if (id !== hoverId) { hoverId = id; invalidate(); } };
  cvs.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || e.buttons) return;
    lx = e.clientX; ly = e.clientY; if (pend) return; pend = true;
    requestAnimationFrame(() => { pend = false; setHover(pick(lx, ly)?.objId || null); });
  });
  cvs.addEventListener('pointerdown', () => setHover(null));
  cvs.addEventListener('pointerleave', () => setHover(null));
}

const selLookShown = () => holder.visible;

export { drawSelLook, hideSelLook, initSelLook, selLookShown, syncSelLook };
