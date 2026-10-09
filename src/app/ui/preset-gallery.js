// Галерея заготовок: категории и плитки с превью, клик добавляет объект в сцену
import * as THREE from 'three';
import { $, $$, esc, toast } from '../core/util.js';
import { PRESETS } from '../core/constants.js';
import { faceKeys, newObject } from '../core/model.js';
import { RT, buildObject, disposeObject, renderer, scene } from '../scene/renderer.js';
import { invalidate } from '../scene/camera.js';
import { renderFace } from '../faces/render.js';
import { addModelObject, addObject, importModelFiles, modelQuality } from './wiring.js';
import { FOOD, QUALITY, foodById, placeModel } from '../core/models3d.js';
import { myModels, removeMyModel, setModelThumb, useMyModel } from '../core/model-library.js';

/* Presets by kind of packaging. A tile's picture is the preset itself, built off-screen and drawn once by the
   scene's own renderer (in a corner of its canvas, in the same task, so it never shows), then kept in the
   browser. Pictures are made one at a time in the background while the gallery is open. */
const CATS = [['all', 'Все'], ['box', 'Коробки'], ['cake', 'Для тортов'], ['bag', 'Пакеты'], ['cup', 'Стаканы и тубусы'], ['model', '3D-модели']];
const catOf = p => p.type === 'torte' || p.type === 'dome' || p.type === 'board' || p.id.startsWith('cake') ? 'cake'
  : p.type === 'bag' || p.type === 'paperbag' ? 'bag' : p.type === 'cup' || p.type === 'tube' ? 'cup' : 'box';
const THUMB_V = 1, SIZE = 160, STORE = 'bs3d-thumbs';
let cat = 'all', thumbs = null, queue = [], busy = false, stage = null;

const keyOf = p => { let h = 2166136261; for (const c of THUMB_V + JSON.stringify(p)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return p.id + ':' + (h >>> 0).toString(36); };
function loadThumbs() {
  if (thumbs) return thumbs;
  try { thumbs = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { thumbs = {}; }
  return thumbs;
}
function saveThumbs() {
  const keep = Object.fromEntries(PRESETS.map(p => [keyOf(p), thumbs[keyOf(p)]]).filter(([, v]) => v));
  try { localStorage.setItem(STORE, JSON.stringify(keep)); } catch {}
}

/* 3D models: the food library and the user's own files (GLB, glTF, OBJ, FBX, USDZ), made light on import */
function renderModels(sec) {
  sec.innerHTML = `<div class="sec-h"><h2>3D-модели</h2><span class="hint">${FOOD.length}</span></div>
    <div class="gal-cats" role="tablist">${CATS.map(([k, n]) => `<button role="tab" data-cat="${k}" class="${k === cat ? 'on' : ''}" aria-selected="${k === cat}">${n}</button>`).join('')}</div>
    <div class="row"><button class="btn sm" id="modelFile">Загрузить свою модель…</button></div>
    <div class="field wide"><span class="fl">Качество</span><select id="modelQ">${Object.entries(QUALITY).map(([k, v]) => `<option value="${k}">${v.label} — до ${(v.tris / 1000)} тыс. треуг., текстуры ${v.tex} px</option>`).join('')}</select></div>
    <p class="hint">GLB или glTF (с файлами .bin и картинками — выберите их вместе), OBJ (с .mtl и картинками), FBX, USDZ. Тяжёлая модель облегчается: меньше треугольников, картинки меньше, рельеф остаётся в карте нормалей. Можно перетащить файлы в окно.</p>
    ${myModels.length ? `<h3 class="gal-h">Мои модели <span class="hint">${myModels.length}</span></h3>
    <div class="gal">${myModels.map(c => `<div class="gal-it my" data-my="${c.hash}" tabindex="0" role="button" title="${esc(c.name)}${c.tris ? ` · ${c.tris.toLocaleString('ru-RU')} треуг.` : ''} · ${c.kb} КБ"><span class="th ${c.thumb ? '' : 'wait'}" ${c.thumb ? `style="background-image:url('${c.thumb}')"` : ''}></span><span class="nm">${esc(c.name)}</span><button class="vx del" data-del="${c.hash}" title="Убрать из библиотеки (в проектах модель остаётся)" aria-label="Убрать из библиотеки">✕</button></div>`).join('')}</div>
    <h3 class="gal-h">Библиотека еды</h3>` : ''}
    <div class="gal">${FOOD.map(f => `<button class="gal-it" data-food="${f.id}" title="${esc(f.name)} · ${f.tris?.toLocaleString('ru-RU') || '?'} треуг. · ${f.kb} КБ"><span class="th" style="background-image:url('${f.thumb}')"></span><span class="nm">${esc(f.name)}</span></button>`).join('')}</div>
    <p class="hint">Модели еды — Poly Haven, CC0 (свободно для любых целей). Загружаются по клику.</p>`;
  $$('#galSec .gal-cats button').forEach(b => { b.onclick = () => { cat = b.dataset.cat; renderGallery(); }; });
  $$('#galSec [data-my]').forEach(el => {
    el.onclick = async e => {
      const h = el.dataset.my;
      if (e.target.closest('[data-del]')) { const b = e.target.closest('[data-del]'); if (!b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = 'Убрать?'; return; } await removeMyModel(h); return renderModels(sec); }
      try { const { ref, card } = await useMyModel(h); addModelObject(ref, { name: card.name, size: card.size || 200 }); } catch (err) { toast(err.message); }
    };
    el.onkeydown = e => { if (e.key === 'Enter') el.click(); };
  });
  // pictures of my models not drawn yet: drawn as each one loads
  for (const c of myModels.filter(c => !c.thumb)) {
    const ref = { my: c.hash }, draw = () => { const url = modelThumb(ref); if (!url) return false; setModelThumb(c.hash, url); const t = $(`#galSec [data-my="${c.hash}"] .th`); if (t) { t.style.backgroundImage = `url('${url}')`; t.classList.remove('wait'); } return true; };
    if (!draw()) addEventListener('bs-model-ready', function once(e) { if (e.detail === 'my:' + c.hash && draw()) removeEventListener('bs-model-ready', once); });
  }
  $$('#galSec [data-food]').forEach(b => { b.onclick = () => { const f = foodById(b.dataset.food); addModelObject({ lib: f.id }, { name: f.name, size: f.size }); }; });
  $('#modelQ').value = modelQuality(); $('#modelQ').onchange = e => modelQuality(e.target.value);
  $('#modelFile').onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.glb,.gltf,.bin,.obj,.mtl,.fbx,.usdz,.jpg,.jpeg,.png,.webp';
    inp.onchange = () => { if (inp.files.length) importModelFiles(inp.files); };
    inp.click();
  };
}
function renderGallery() {
  if (cat === 'model') return renderModels($('#galSec'));
  const sec = $('#galSec'), T = loadThumbs(), list = PRESETS.filter(p => cat === 'all' || catOf(p) === cat);
  sec.innerHTML = `<div class="sec-h"><h2>Браузер заготовок</h2><span class="hint">${list.length}</span></div>
    <div class="gal-cats" role="tablist">${CATS.map(([k, n]) => `<button role="tab" data-cat="${k}" class="${k === cat ? 'on' : ''}" aria-selected="${k === cat}">${n}</button>`).join('')}</div>
    <div class="gal">${list.map(p => `<button class="gal-it" data-preset="${p.id}" title="${esc(p.label)}"><span class="th ${T[keyOf(p)] ? '' : 'wait'}" data-th="${p.id}"></span><span class="nm">${esc(p.label)}</span></button>`).join('')}</div>`;
  $$('#galSec .gal-cats button').forEach(b => { b.onclick = () => { cat = b.dataset.cat; renderGallery(); }; });
  $$('#galSec .gal-it').forEach(b => { b.onclick = () => addObject(b.dataset.preset); });
  for (const p of list) { const u = T[keyOf(p)]; if (u) $(`#galSec [data-th="${p.id}"]`).style.backgroundImage = `url("${u}")`; }
  // tests switch the pictures off (window.__noThumbs): they only slow the runs down
  queue = window.__noThumbs ? [] : list.filter(p => !T[keyOf(p)]);
  if (!busy) setTimeout(nextThumb, 200);
}
function nextThumb() {
  const p = queue.shift();
  if (!p || $('#galSec').hidden) { busy = false; return; }
  busy = true;
  try {
    const url = thumbOf(p); thumbs[keyOf(p)] = url; saveThumbs();
    const el = $(`#galSec [data-th="${p.id}"]`); if (el) { el.style.backgroundImage = `url("${url}")`; el.classList.remove('wait'); }
  } catch (e) { console.warn('preset picture', p.id, e); }
  setTimeout(nextThumb, 30);
}
/* the preset built on its own (with its own random numbers, so the scene's are untouched) and drawn 3/4 */
function makeStage() {
  stage ??= (() => {
    const s = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, .01, 100);
    s.add(new THREE.HemisphereLight(0xffffff, 0xb8b2a8, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 5, 4); s.add(key);
    const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
    return { s, cam, cv };
  })();
  return stage;
}
function thumbOf(p) {
  makeStage();
  const rnd = Math.random; let seed = 7; Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let o;
  try {
    o = newObject(p.id); buildObject(o);
    for (const k of faceKeys(o)) renderFace(o, k);
  } finally { Math.random = rnd; }
  const rt = RT.get(o.id), url = snap(rt.group);
  disposeObject(o.id);
  return url;
}
/* a picture of a group (an object's, a model's), 3/4 from the front, as the gallery shows them */
function snap(g) {
  const { s, cam, cv } = makeStage();
  s.environment = scene.environment; s.environmentIntensity = scene.environmentIntensity; s.environmentRotation.copy(scene.environmentRotation);
  s.add(g); g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const dir = new THREE.Vector3(.78, .55, 1).normalize(), dist = r / Math.sin(cam.fov / 2 * Math.PI / 180) * 1.02;
  cam.position.copy(c).addScaledVector(dir, dist); cam.near = dist / 50; cam.far = dist * 4; cam.updateProjectionMatrix(); cam.lookAt(c);
  // draw it in the bottom-left corner of the scene's canvas and copy it out before the page shows that frame
  const pr = renderer.getPixelRatio(), n = Math.round(SIZE / pr), dom = renderer.domElement;
  renderer.setScissorTest(true); renderer.setViewport(0, 0, n, n); renderer.setScissor(0, 0, n, n);
  renderer.clear(); renderer.render(s, cam);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, dom.width / pr, dom.height / pr);
  const x = cv.getContext('2d'); x.clearRect(0, 0, SIZE, SIZE); x.drawImage(dom, 0, dom.height - n * pr, n * pr, n * pr, 0, 0, SIZE, SIZE);
  s.remove(g); invalidate();
  return cv.toDataURL('image/webp', .82);
}
/* a picture of a model of «Мои модели», once it is loaded (null until then) */
function modelThumb(ref) {
  const g = new THREE.Group();
  if (!placeModel(g, { id: '_thumb' }, ref, { size: 100 })) return null;
  return snap(g);
}

export { renderGallery };
