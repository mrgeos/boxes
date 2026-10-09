// 3D-модели в проекте: библиотека еды и свои файлы — подгрузка по требованию, кэш, расстановка в сцене и в упаковке
import * as THREE from 'three';
import { S, clamp, toast } from './util.js';
import { assets, state } from './state.js';
import { addAsset } from './assets.js';
import { FOOD } from './food-library.js';
import { rebuildQueue } from '../scene/renderer.js';
import { invalidate } from '../scene/camera.js';

/* A model is referred to as { lib: id } (the food library: box-studio-food/<id>.js beside the page) or
   { asset: id } (a file brought by the user, made light and kept in the project as a GLB). Neither the loader
   (box-studio-models.js) nor a model is loaded before it is needed. A model loaded once is kept: every object that
   shows it shares its meshes and pictures (one copy in the graphics memory however many croissants stand in the box).
   While a model loads, nothing stands in its place; when it is ready, the objects using it are built again. */
const base = n => new URL(n, document.baseURI).href;
const scripts = new Map();
function script(src) {
  if (!scripts.has(src)) scripts.set(src, new Promise((res, rej) => { const s = document.createElement('script'); s.src = base(src); s.onload = res; s.onerror = () => { scripts.delete(src); rej(new Error('Не удалось загрузить ' + src)); }; document.head.appendChild(s); }));
  return scripts.get(src);
}
/* the loader of model files: a file of its own, using the editor's three.js */
async function loader() {
  window.__BS_THREE = THREE;
  if (!window.__bsModels) await script('box-studio-models.js');
  return window.__bsModels;
}
/* a model of the library as a GLB: its file calls __bsFood(id, base64) */
const foodWait = new Map();
function foodGLB(id) {
  window.__bsFood ??= (fid, b64) => { const r = foodWait.get(fid); if (r) r.resolve(b64ToBuf(b64)); };
  if (!foodWait.has(id)) {
    let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; });
    foodWait.set(id, { p, resolve, reject });
    script(`box-studio-food/${id}.js`).catch(e => { foodWait.delete(id); reject(e); });
  }
  return foodWait.get(id).p;
}
function b64ToBuf(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
/* a GLB kept in the project (a data: URL, or the address of a stored file) */
async function assetGLB(id) {
  const url = assets[id]; if (!url) throw new Error('В проекте нет файла модели');
  if (url.startsWith('data:')) return b64ToBuf(url.slice(url.indexOf(',') + 1));
  return (await fetch(url)).arrayBuffer();
}
const keyOf = ref => ref?.lib ? 'lib:' + ref.lib : ref?.asset ? 'asset:' + ref.asset : '';
/* loaded models: key → { status, group, size: [x, y, z] in its own units } */
const cache = new Map();
/* the model ready to place, or null (then it is being loaded, and its objects are built again when it is) */
function modelOf(ref) {
  const k = keyOf(ref); if (!k) return null;
  const c = cache.get(k);
  if (c) return c.status === 'ready' ? c : null;
  const entry = { status: 'loading' }; cache.set(k, entry);
  (async () => {
    const [L, glb] = await Promise.all([loader(), ref.lib ? foodGLB(ref.lib) : assetGLB(ref.asset)]);
    const g = await L.parse(glb);
    // its meshes with their placement in the model (a file may nest them in nodes)
    g.updateMatrixWorld(true);
    const parts = [];
    g.traverse(m => { if (m.isMesh) { for (const mat of [].concat(m.material)) if (mat.map) mat.map.anisotropy = 8; parts.push({ geo: m.geometry, mat: m.material, matrix: m.matrixWorld.clone() }); } });
    const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    Object.assign(entry, { status: 'ready', parts, size: [size.x, size.y, size.z], min: box.min.clone(), center: c });
    for (const o of state.objects) if (usesModel(o, k)) rebuildQueue.add(o.id);
    invalidate();
    setTimeout(() => window.dispatchEvent(new CustomEvent('bs-model-ready', { detail: k })), 50);   // panels showing its size
  })().catch(e => { console.warn('model', k, e); entry.status = 'error'; toast('Не удалось загрузить 3D-модель: ' + (e.message || e)); });
  return null;
}
/* the refs an object shows (itself, its filling, its cake) */
function modelRefs(o) { return [o.model, o.fill?.on && o.fill.model, o.cake?.model, o.product?.model].filter(r => r && keyOf(r)); }
const usesModel = (o, k) => modelRefs(o).some(r => keyOf(r) === k);
/* a copy of the model under parent, its longest side `size` mm (or fit into box [w, d, h] mm), standing at
   [x, y, z] mm, turned by rotY°; its meshes are shared with the cache (not disposed with the object) */
function placeModel(parent, o, ref, { size = 100, fit = null, at = [0, 0, 0], rotY = 0, pick = true } = {}) {
  const M = modelOf(ref); if (!M) return null;
  const [sx, sy, sz] = M.size, k = fit ? Math.min(fit[0] / sx, fit[1] / sz, fit[2] / sy) : size / Math.max(sx, sy, sz);
  const g = new THREE.Group(), inner = new THREE.Group();
  for (const p of M.parts) {
    const c = new THREE.Mesh(p.geo, p.mat); c.matrixAutoUpdate = false; c.matrix.copy(p.matrix);
    c.castShadow = c.receiveShadow = true; c.userData = { objId: o.id, face: null, shared: true };
    if (!pick) c.raycast = () => {};
    inner.add(c);
  }
  // centred on x, z, standing on its bottom
  inner.position.set(-M.center.x, -M.min.y, -M.center.z); g.add(inner);
  g.scale.setScalar(k * S); g.position.set(at[0] * S, at[1] * S, at[2] * S); g.rotation.y = rotY * Math.PI / 180;
  parent.add(g);
  return { group: g, k, dims: [sx * k, sy * k, sz * k] };
}
/* several of the same model (a row, a grid): one draw per mesh for all of them, whatever their number */
function placeMany(parent, o, ref, spots, { size = 100, rotY = 0, pick = false } = {}) {
  const M = modelOf(ref); if (!M || !spots.length) return null;
  const [sx, sy, sz] = M.size, k = size / Math.max(sx, sy, sz), g = new THREE.Group(), mat = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  const off = new THREE.Matrix4().makeTranslation(-M.center.x, -M.min.y, -M.center.z);
  for (const p of M.parts) {
    const im = new THREE.InstancedMesh(p.geo, p.mat, spots.length), local = off.clone().multiply(p.matrix);
    spots.forEach(([x, y, z, r = 0], i) => {
      q.setFromAxisAngle(Y, (rotY + r) * Math.PI / 180);
      mat.compose(new THREE.Vector3(x * S, y * S, z * S), q, new THREE.Vector3(k * S, k * S, k * S));
      im.setMatrixAt(i, mat.clone().multiply(local));
    });
    im.castShadow = im.receiveShadow = true; im.userData = { objId: o.id, face: null, shared: true };
    if (!pick) im.raycast = () => {};
    g.add(im);
  }
  parent.add(g);
  return { group: g, k, dims: [sx * k, sy * k, sz * k] };
}
/* the proportions of a model once loaded ([x, y, z], longest side 1), or null */
function modelShape(ref) { const M = modelOf(ref); if (!M) return null; const m = Math.max(...M.size); return M.size.map(v => v / m); }

/* ---------- bringing models in ---------- */
const QUALITY = { light: { label: 'Лёгкая (слабые компьютеры)', tris: 15000, tex: 1024 }, normal: { label: 'Обычная', tris: 40000, tex: 2048 }, fine: { label: 'Подробная', tris: 120000, tex: 2048 } };
/* model files picked or dropped (a GLB, or a glTF / OBJ with its companions): made light and kept in the project;
   { ref, name, tris, before, size (mm, a guess: glTF is in metres) } */
async function importModel(files, quality = 'normal') {
  const Q = QUALITY[quality] || QUALITY.normal, L = await loader();
  const r = await L.importFiles(files, { maxTris: Q.tris, maxTex: Q.tex });
  const b64 = bufToB64(r.glb), id = addAsset('data:model/gltf-binary;base64,' + b64);
  const longest = Math.max(...r.size), mm = longest * 1000;
  return { ref: { asset: id }, name: r.name, tris: r.tris, before: r.before, kb: Math.round(r.glb.byteLength / 1024), size: mm >= 20 && mm <= 600 ? Math.round(mm) : 200 };   // a size that does not look like a thing on a table: a guess
}
function bufToB64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
const isModelFile = f => /\.(glb|gltf|obj|fbx|usdz|mtl|bin)$/i.test(f.name || '');
const foodById = id => FOOD.find(f => f.id === id) || null;
const modelName = ref => ref?.lib ? foodById(ref.lib)?.name || 'Модель' : ref?.name || 'Своя модель';
const clampSize = v => clamp(+v || 100, 5, 3000);

export { FOOD, QUALITY, clampSize, foodById, importModel, isModelFile, modelName, modelOf, modelRefs, modelShape, placeMany, placeModel };
