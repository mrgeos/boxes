// История, автосохранение, файл проекта
import { $, loadImage, readURL, toast } from './util.js';
import { LIGHTS } from './constants.js';
import { activeFaceData, activeObj, assets, sel, state } from './state.js';
import { ensureFaces, faceKeys, faceMM, newImage, newObject, setBoard } from './model.js';
import { addAsset } from './assets.js';
import { libAdopt, libStore, library } from './library.js';
import { vecOf } from './vector.js';
import { registerFont } from './fonts.js';
import { RT, buildObject, disposeObject, ui } from '../scene/renderer.js';
import { activeSticker } from '../stickers/placement.js';
import { applyScene, setLastView, setView } from '../scene/camera.js';
import { layoutAll, normalizeTree } from './groups.js';
import { renderFonts, renderLayerProps } from '../ui/face-panel.js';
import { renderAll } from '../ui/wiring.js';

const hist = { stack: [], i: -1 };
const snapshot = () => JSON.stringify({ objects: state.objects, scene: state.scene, fonts: state.fonts, groups: state.groups, tree: state.tree });
function commit() {
  normalizeTree();
  const s = snapshot(); if (hist.stack[hist.i] === s) return;
  hist.stack = hist.stack.slice(0, hist.i + 1); hist.stack.push(s);
  if (hist.stack.length > 100) hist.stack.shift();
  hist.i = hist.stack.length - 1; updateUndo(); scheduleSave(); ui.lib = true;
}
function restore(s) {
  const d = JSON.parse(s);
  const ids = new Set(d.objects.map(o => o.id));
  for (const id of [...RT.keys()]) if (!ids.has(id)) disposeObject(id);
  state.objects = d.objects; state.scene = d.scene; state.fonts = d.fonts || []; state.groups = d.groups || []; state.tree = d.tree || [];
  for (const o of state.objects) buildObject(o);
  layoutAll();
  if (!activeObj()) sel.obj = state.objects[0]?.id ?? null;
  if (sel.group && !state.groups.some(g => g.id === sel.group)) sel.group = null;
  sel.multi = sel.multi.filter(id => state.groups.some(g => g.id === id) || state.objects.some(o => o.id === id));
  const f = activeFaceData(); if (!f || !f.layers.some(l => l.id === sel.layer)) sel.layer = null;
  if (!activeSticker()) sel.sticker = null;
  applyScene(); renderAll(); updateUndo(); scheduleSave();
}
function undo() { if (hist.i > 0) { hist.i--; restore(hist.stack[hist.i]); } }
function redo() { if (hist.i < hist.stack.length - 1) { hist.i++; restore(hist.stack[hist.i]); } }
function updateUndo() { $('#undoBtn').disabled = hist.i <= 0; $('#redoBtn').disabled = hist.i >= hist.stack.length - 1; }
function usedAssets() {
  const used = new Set();
  for (const o of state.objects) {
    if (o.dieline) used.add(o.dieline);
    for (const k in o.faces) for (const l of o.faces[k].layers) if (l.src) used.add(l.src);
    for (const st of o.stickers || []) for (const id of [st.src, st.bgSrc]) if (id) used.add(id);
    if (o.product?.src) used.add(o.product.src);
  }
  for (const f of state.fonts) used.add(f.asset);
  return used;
}
const assetsOf = ids => { const out = {}; for (const id of ids) { if (assets[id]) out[id] = assets[id]; if (vecOf[id] && assets[vecOf[id]]) out[vecOf[id]] = assets[vecOf[id]]; } return out; };
/* a project file carries its whole library; the autosave only what the design uses (the library is in the browser) */
function projectJSON(withLibrary = true) {
  const ids = usedAssets(); if (withLibrary) for (const it of library) ids.add(it.id);
  return JSON.stringify({ app: 'box-studio-3d', version: 1, objects: state.objects, groups: state.groups, tree: state.tree, scene: state.scene, fonts: state.fonts,
    library: library.filter(it => withLibrary || ids.has(it.id) || !it.browser).map(({ id, hash, name, aspect, added }) => ({ id, hash, name, aspect, added })), assets: assetsOf(ids),
    vectors: Object.fromEntries([...ids].filter(id => vecOf[id]).map(id => [id, vecOf[id]])) });
}
const LS_KEY = 'box-studio-3d/project';
let saveTimer, saveWarned = false;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, projectJSON(false)); }
    catch (e) { if (!saveWarned) { saveWarned = true; toast('Проект слишком большой для автосохранения в браузере. Используйте «Сохранить проект».', 4200); } }
  }, 900);
}
function loadProject(d, { resetHistory = true } = {}) {
  if (!d || !Array.isArray(d.objects)) throw new Error('bad project');
  for (const id of [...RT.keys()]) disposeObject(id);
  Object.assign(assets, d.assets || {});
  for (const [id, v] of Object.entries(d.vectors || {})) if (assets[v]) vecOf[id] = v;
  for (const it of d.library || []) if (assets[it.id] && !library.some(x => x.hash === it.hash)) { library.push({ ...it }); libStore('put', { hash: it.hash, name: it.name, aspect: it.aspect, url: assets[it.id], added: it.added || Date.now(), svg: vecOf[it.id] ? assets[vecOf[it.id]] : null }); }
  const svgIds = new Set(Object.values(d.vectors || {}));
  libAdopt(Object.keys(d.assets || {}).filter(id => !svgIds.has(id) && !(d.fonts || []).some(f => f.asset === id)));
  state.objects = d.objects; state.groups = d.groups || []; state.tree = d.tree || []; state.scene = { ...state.scene, ...(d.scene || {}) }; state.fonts = d.fonts || [];
  if ((d.scene?.v || 1) < 2) Object.assign(state.scene, LIGHTS[state.scene.preset] || LIGHTS.studio, { v: 2 });
  state.fonts.forEach(registerFont);
  for (const o of state.objects) { ensureFaces(o); buildObject(o); }
  layoutAll();
  sel.obj = state.objects[0]?.id ?? null; sel.face = null; sel.layer = null; sel.group = null; sel.multi = sel.obj ? [sel.obj] : [];
  if (sel.obj) sel.face = faceKeys(activeObj())[0];
  applyScene(); renderAll();
  if (resetHistory) { hist.stack = []; hist.i = -1; }
  commit();
  requestAnimationFrame(() => { setLastView('q'); setView('fit', true); });
}
/* ---------- file saving (viewer download capability, with a plain fallback) ---------- */
let dlNS;
async function saveFile(filename, blob) {
  if (window.claude?.use) {
    if (dlNS === undefined) { try { dlNS = await window.claude.use('downloads'); } catch { dlNS = null; } }
    if (dlNS) {
      try { await dlNS.save({ filename, data: blob }); toast(`Сохранено: ${filename}`); }
      catch (e) { if (e?.code !== 'declined') toast(`Не удалось сохранить файл (${e?.code || 'ошибка'})`); }
      return;
    }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`Сохранено: ${filename}`);
}
async function addFontFile(file) {
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 40) || 'Мой шрифт';
  const url = await readURL(file); const asset = addAsset(url);
  const f = { name, asset }; state.fonts = state.fonts.filter(x => x.name !== name); state.fonts.push(f);
  await registerFont(f); renderFonts(); renderLayerProps(); commit(); toast(`Шрифт «${name}» добавлен в список шрифтов`);
}
async function openProjectFile(file) {
  let d;
  try { d = JSON.parse(await file.text()); } catch { return toast('Файл не читается как проект (.json)'); }
  try {
    if (d.format === 'box-studio') { loadProject(await convertLegacy(d), { resetHistory: false }); toast(`Проект «Студии коробки» открыт: ${file.name}`); }
    else { loadProject(d); toast(`Открыт проект: ${file.name}`); }
  } catch { toast('Это не файл проекта Box Studio 3D или «Студии коробки»'); }
}
/* projects saved by the first version («Студия коробки», 200×150×50 box with a window) */
async function convertLegacy(p) {
  if (!p.faces || !/^#[0-9a-f]{6}$/i.test(p.color || '')) throw new Error('bad legacy project');
  const o = newObject('window');
  o.name = 'Коробка с окном (из «Студии коробки»)';
  o.whiteInside = p.inside !== false; setBoard(o, p.color);
  for (const k of ['top', 'front', 'back', 'left', 'right', 'bottom']) {
    const f = p.faces[k];
    if (!f || typeof f.data !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(f.data)) continue;
    const im = await loadImage(f.data), iw = im.naturalWidth, ih = im.naturalHeight;
    const [W, H] = faceMM(o, k), scale = (+f.scale || 100) / 100;
    const L = newImage(addAsset(f.data), iw / ih);
    if (f.fit === 'tile') { L.tile = true; L.w = .33 * scale; }
    else { const k2 = f.fit === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih); L.w = iw * k2 * scale / W; }
    L.x = .5 + (+f.x || 0) / 100; L.y = .5 + (+f.y || 0) / 100; L.rot = +f.angle || 0;
    o.faces[k].layers.push(L);
  }
  return { objects: [o], scene: state.scene, fonts: state.fonts, assets: {} };
}

export { LS_KEY, addFontFile, commit, loadProject, openProjectFile, projectJSON, redo, saveFile, scheduleSave, undo, usedAssets };
