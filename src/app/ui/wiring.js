// Кнопки шапки и панелей
import { $, $$, S, fmt, luminance, slug, toast, uid } from '../core/util.js';
import { startTextEdit } from './text-edit.js';
import { activeFaceData, activeObj, sel, state } from '../core/state.js';
import { faceKeys, faceLabel, netLayout, newObject, newShape, newText, outerKeys } from '../core/model.js';
import { importImageFile } from '../core/assets.js';
import { buildObject, markFace, markObj, ui } from '../scene/renderer.js';
import { VIEW_LABEL, orbitLock, sceneBounds, setOrbitLock, setView, viewName } from '../scene/camera.js';
import { openMenu } from './menu.js';
import { select } from '../core/selection.js';
import { addFontFile, commit, loadProject, openProjectFile, paintProjectName, projectJSON, redo, renameProject, saveFile, undo } from '../core/project.js';
import { refreshFields } from './fields.js';
import { paintHdr, renderModel } from './model-panel.js';
import { renderObjects } from './object-list.js';
import { pickAsset } from './asset-picker.js';
import { detachProject } from '../core/cloud.js';
import { placeLibImage } from './library-panel.js';
import { addLayer, renderFacePanel, renderFaceTabs, renderFonts, renderLayerProps, renderLayers } from './face-panel.js';
import { renderStickers } from './stickers-panel.js';
import { renderLibrary } from './library-panel.js';
import { exportPNG, exportVideo, setPngScale } from '../export/image.js';
import { exportFlat, exportTemplate } from '../net/template.js';
import { sampleProject } from '../core/sample.js';
import { newModelObject } from '../carriers/model-object.js';
import { QUALITY, importModel } from '../core/models3d.js';

function renderAll() { renderLibrary(); renderObjects(); renderModel(); renderFaceTabs(); renderFacePanel(); renderLayers(); renderLayerProps(); renderStickers(); renderFonts(); refreshFields($('#sceneSec'), state.scene); $('#lightPreset').value = state.scene.preset; paintHdr(); ui.editor = ui.net = true; }
/* a new object from a preset: at a point of the floor (mm), or to the right of the scene */
function addObject(presetId, at = null) {
  const o = newObject(presetId);
  if (at) o.pos = { x: Math.round(at.x), z: Math.round(at.z) };
  else { const b = sceneBounds(); o.pos.x = state.objects.length ? Math.round(b.max.x / S + o.dims.w / 2 + 40) : 0; }
  state.objects.push(o); buildObject(o); select(o.id, faceKeys(o)[0], null); renderObjects(); commit(); setTimeout(() => setView('fit'), 60);
}
/* a 3D model as an object of its own, beside the scene (or at a point of the floor, mm) */
function addModelObject(ref, opts = {}, at = null) {
  const o = newModelObject(ref, opts);
  if (at) o.pos = { x: Math.round(at.x), z: Math.round(at.z) };
  else { const b = sceneBounds(); o.pos.x = state.objects.length ? Math.round(b.max.x / S + o.size / 2 + 40) : 0; }
  state.objects.push(o); buildObject(o); select(o.id, undefined, null); renderObjects(); commit(); setTimeout(() => setView('fit'), 400);
  return o;
}
/* model files picked or dropped: made light and added as an object (the quality chosen in the gallery) */
async function importModelFiles(files, at = null) {
  const q = modelQuality();
  toast('Загружаю и облегчаю модель…', 2500);
  try {
    const r = await importModel(files, q);
    addModelObject({ ...r.ref, name: r.name }, { name: r.name, size: r.size }, at);
    toast(r.before > r.tris ? `Модель «${r.name}»: ${r.before.toLocaleString('ru-RU')} → ${r.tris.toLocaleString('ru-RU')} треугольников, ${r.kb} КБ` : `Модель «${r.name}»: ${r.tris.toLocaleString('ru-RU')} треугольников, ${r.kb} КБ`, 4200);
  } catch (e) { console.warn('model import', e); toast(e.message || 'Не удалось прочитать модель', 5000); }
}
let quality = null;
function modelQuality(v) {
  if (v) { quality = v; try { localStorage.setItem('bs3d-model-q', v); } catch { /* private mode */ } }
  if (!quality) { try { quality = localStorage.getItem('bs3d-model-q'); } catch { /* private mode */ } }
  return QUALITY[quality] ? quality : 'normal';
}
/* copies a face's background and layers onto other faces of the object */
function copyFaceDesign(o, from, targets) {
  const f = o.faces[from]; if (!f || !targets.length) return;
  for (const k of targets) { o.faces[k] = { bg: f.bg, ...(f.bgGrad ? { bgGrad: { ...f.bgGrad } } : {}), ...(f.groups ? { groups: { ...f.groups } } : {}), layers: f.layers.map(l => ({ ...structuredClone(l), id: uid() })) }; markFace(o, k); }
  renderFaceTabs(); commit(); toast(`Дизайн скопирован: ${targets.map(k => faceLabel(o, k)).join(', ')}`);
}
function closeMenu() { for (const n of ['export', 'file']) { $(`#${n}Menu`).hidden = true; $(`#${n}Btn`).setAttribute('aria-expanded', 'false'); } }

/* hooks up the toolbar and panel buttons */
function initWiring() {
  $('#copyFaceBtn').onclick = () => {
    const o = activeObj(), f = activeFaceData(), t = $('#copyTarget').value; if (!f || !t) return toast('Выберите, куда копировать');
    copyFaceDesign(o, sel.face, t === '*' ? outerKeys(o).filter(k => k !== sel.face) : [t]);
  };
  // a picture onto the face: from the uploads or from the computer, as in the action bar
  $('#addImgBtn').onclick = e => { if (!activeObj()) return; pickAsset(e.currentTarget, 'Картинка на грань', r => placeLibImage(r), { brand: true }); };
  $('#addTextBtn').onclick = () => { const L = newText('Ваш текст'); const f = activeFaceData(); if (!f) return; L.color = luminance(f.bg) < .5 ? '#ffffff' : '#1c1b19'; addLayer(L); startTextEdit(L, '2d', true); };
  $('#addRectBtn').onclick = () => activeFaceData() && addLayer(newShape('rect'));
  $('#addEllBtn').onclick = () => activeFaceData() && addLayer(newShape('ellipse'));
  $('#dielineBtn').onclick = () => { if (!activeObj()) return; $('#dielineInput').value = ''; $('#dielineInput').click(); };
  $('#dielineInput').onchange = async e => {
    const file = e.target.files[0], o = activeObj(); if (!file || !o) return;
    try {
      const r = await importImageFile(file); const n = netLayout(o);
      o.dieline = r.id; markObj(o); renderFacePanel(); commit();
      const want = n.W / n.H;
      if (Math.abs(r.aspect - want) / want > .02) toast(`Пропорции макета ${r.aspect.toFixed(3)} не совпадают с развёрткой ${want.toFixed(3)} (${fmt(n.W)}×${fmt(n.H)} мм). Скачайте шаблон и выровняйте артборд.`, 6000);
      else toast('Макет развёртки наложен на все грани');
    } catch { toast('Не удалось прочитать файл макета'); }
  };
  $('#dielineOffBtn').onclick = () => { const o = activeObj(); if (!o) return; o.dieline = null; o.netV = 2; markObj(o); ui.net = true; renderFacePanel(); commit(); };
  $('#tplBtn').onclick = $('#tplBtn2').onclick = () => { closeMenu(); exportTemplate(); };
  $('#flatBtn').onclick = $('#flatBtn2').onclick = () => { closeMenu(); exportFlat(); };
  $('#pngBtn').onclick = () => { closeMenu(); exportPNG(); };
  $('#videoBtn').onclick = () => { closeMenu(); exportVideo(); };
  $$('#pngScale button').forEach(b => b.onclick = () => { setPngScale(+b.dataset.v); $$('#pngScale button').forEach(x => x.classList.toggle('on', x === b)); });
  // the export menu on the right and the file menu (burger) on the left of the top bar: one open at a time
  for (const n of ['export', 'file']) $(`#${n}Btn`).onclick = e => { e.stopPropagation(); const m = $(`#${n}Menu`), open = m.hidden; closeMenu(); m.hidden = !open; $(`#${n}Btn`).setAttribute('aria-expanded', String(open)); };
  document.addEventListener('click', e => { if (!e.target.closest('.menu') && !e.target.closest('#exportBtn, #fileBtn')) closeMenu(); });
  $$('#fileMenu .btn').forEach(b => b.addEventListener('click', () => closeMenu()));
  $('#undoBtn').onclick = undo;
   $('#redoBtn').onclick = redo;
  $('#saveBtn').onclick = () => saveFile(`${slug(state.name || activeObj()?.name || 'proekt')}.boxstudio.json`, new Blob([projectJSON()], { type: 'application/json' }));
  $('#openBtn').onclick = () => { $('#projInput').value = ''; $('#projInput').click(); };
  $('#projInput').onchange = e => e.target.files[0] && openProjectFile(e.target.files[0]);
  $('#newBtn').onclick = () => {
    const o = newObject('mailer'); o.name = 'Коробка 1';
    detachProject(); loadProject({ name: 'Без названия', objects: [o], scene: state.scene, fonts: state.fonts, assets: {} }, { resetHistory: false });
    toast('Новый проект. Вернуть предыдущий — Ctrl+Z');
  };
  $('#sampleBtn').onclick = () => { detachProject(); loadProject(sampleProject(), { resetHistory: false }); toast('Загружен пример. Вернуть предыдущий — Ctrl+Z'); };
  // the project's name next to the logo: a double click (or Enter, F2) types a new one in place
  const pn = $('#projName');
  const renameInPlace = () => {
    if (pn.querySelector('input')) return;
    const inp = document.createElement('input'); inp.className = 'ren'; inp.value = state.name; inp.setAttribute('aria-label', 'Название проекта');
    pn.textContent = ''; pn.appendChild(inp); inp.focus(); inp.select();
    let done = false;
    const end = save => { if (done) return; done = true; const v = inp.value; inp.remove(); if (!(save && renameProject(v))) paintProjectName(); };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') end(true); if (e.key === 'Escape') end(false); };
    inp.onblur = () => end(true);
  };
  pn.ondblclick = renameInPlace;
  pn.onkeydown = e => { if (e.target === pn && (e.key === 'Enter' || e.key === 'F2')) { e.preventDefault(); renameInPlace(); } };
  paintProjectName();
  $('#fontBtn').onclick = () => { $('#fontInput').value = ''; $('#fontInput').click(); };
  $('#fontInput').onchange = e => e.target.files[0] && addFontFile(e.target.files[0]);
  // the view button: the side the camera looks from now, and in its menu the sides, zoom to the selection or
  // the whole scene, and whether the camera turns round the selected object
  $('#viewBtn').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect(), side = k => ({ label: VIEW_LABEL[k], checked: viewName === k, run: () => setView(k) });
    const items = [...['front', 'q', 'side', 'top', 'back', 'bottom'].map(side), 'sep',
      { label: 'К выбранному', key: 'F', disabled: !activeObj(), run: () => setView('focus') }, { label: 'Показать всё', key: 'H', run: () => setView('fit') }, 'sep',
      { label: 'Вращать вокруг выбранного', checked: orbitLock, run: () => setOrbitLock(!orbitLock) }];
    openMenu(r.left, r.bottom + 6, items, 'Вид');   // under the button, in the top bar
  };
}

export { addModelObject, addObject, copyFaceDesign, importModelFiles, initWiring, modelQuality, renderAll };
