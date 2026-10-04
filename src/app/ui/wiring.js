// Кнопки шапки и панелей
import { $, $$, S, fmt, luminance, slug, toast, uid } from '../core/util.js';
import { PRESETS } from '../core/constants.js';
import { activeFaceData, activeObj, sel, state } from '../core/state.js';
import { faceKeys, faceLabel, netLayout, newObject, newShape, newText, outerKeys } from '../core/model.js';
import { importImageFile } from '../core/assets.js';
import { buildObject, markFace, markObj, ui } from '../scene/renderer.js';
import { orbitLock, sceneBounds, setOrbitLock, setView } from '../scene/camera.js';
import { select } from '../core/selection.js';
import { addFontFile, commit, loadProject, openProjectFile, projectJSON, redo, saveFile, undo } from '../core/project.js';
import { refreshFields } from './fields.js';
import { renderModel } from './model-panel.js';
import { renderObjects } from './object-list.js';
import { addImageToFace, addLayer, pickImage, renderFacePanel, renderFaceTabs, renderFonts, renderLayerProps, renderLayers, setFaceBg } from './face-panel.js';
import { renderStickers } from './stickers-panel.js';
import { renderLibrary } from './library-panel.js';
import { exportPNG, exportVideo, setPngScale } from '../export/image.js';
import { exportFlat, exportTemplate } from '../net/template.js';
import { sampleProject } from '../core/sample.js';

function renderAll() { renderLibrary(); renderObjects(); renderModel(); renderFaceTabs(); renderFacePanel(); renderLayers(); renderLayerProps(); renderStickers(); renderFonts(); refreshFields($('#sceneSec'), state.scene); $('#lightPreset').value = state.scene.preset; ui.editor = ui.net = true; }
function closeMenu() { $('#exportMenu').hidden = true; $('#exportBtn').setAttribute('aria-expanded', 'false'); }

/* hooks up the toolbar and panel buttons */
function initWiring() {
  $('#addPreset').innerHTML = PRESETS.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
  $('#addObjBtn').onclick = () => {
    const o = newObject($('#addPreset').value);
    const b = sceneBounds(); o.pos.x = state.objects.length ? Math.round(b.max.x / S + o.dims.w / 2 + 40) : 0;
    state.objects.push(o); buildObject(o); select(o.id, faceKeys(o)[0], null); renderObjects(); commit(); setTimeout(() => setView('fit'), 60);
  };
  $('#faceBg').addEventListener('input', e => setFaceBg(e.target.value, false));
  $('#faceBg').addEventListener('change', () => commit());
  $('#bgAllBtn').onclick = () => {
    const o = activeObj(), f = activeFaceData(); if (!f) return;
    for (const k of outerKeys(o)) o.faces[k].bg = f.bg; markObj(o); commit(); toast('Фон применён ко всем внешним граням');
  };
  $('#clearFaceBtn').onclick = () => {
    const o = activeObj(), f = activeFaceData(); if (!f) return;
    f.layers = []; sel.layer = null; markFace(o, sel.face); renderLayers(); renderLayerProps(); renderFaceTabs(); commit();
  };
  $('#copyFaceBtn').onclick = () => {
    const o = activeObj(), f = activeFaceData(), t = $('#copyTarget').value; if (!f || !t) return toast('Выберите, куда копировать');
    const targets = t === '*' ? outerKeys(o).filter(k => k !== sel.face) : [t];
    for (const k of targets) { o.faces[k] = { bg: f.bg, layers: f.layers.map(l => ({ ...structuredClone(l), id: uid() })) }; markFace(o, k); }
    renderFaceTabs(); commit(); toast(`Дизайн скопирован: ${targets.map(k => faceLabel(o, k)).join(', ')}`);
  };
  $('#addImgBtn').onclick = () => { if (!activeObj()) return; pickImage(f => addImageToFace(f)); };
  $('#addTextBtn').onclick = () => { const L = newText('Ваш текст'); const f = activeFaceData(); if (!f) return; L.color = luminance(f.bg) < .5 ? '#ffffff' : '#1c1b19'; addLayer(L); };
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
  $('#dielineOffBtn').onclick = () => { const o = activeObj(); if (!o) return; o.dieline = null; markObj(o); renderFacePanel(); commit(); };
  $('#tplBtn').onclick = $('#tplBtn2').onclick = () => { closeMenu(); exportTemplate(); };
  $('#flatBtn').onclick = () => { closeMenu(); exportFlat(); };
  $('#pngBtn').onclick = () => { closeMenu(); exportPNG(); };
  $('#videoBtn').onclick = () => { closeMenu(); exportVideo(); };
  $$('#pngScale button').forEach(b => b.onclick = () => { setPngScale(+b.dataset.v); $$('#pngScale button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#exportBtn').onclick = e => { e.stopPropagation(); const m = $('#exportMenu'); m.hidden = !m.hidden; $('#exportBtn').setAttribute('aria-expanded', String(!m.hidden)); };
  document.addEventListener('click', e => { if (!e.target.closest('#exportMenu') && !e.target.closest('#exportBtn')) closeMenu(); });
  $('#undoBtn').onclick = undo;
   $('#redoBtn').onclick = redo;
  $('#saveBtn').onclick = () => saveFile(`${slug(activeObj()?.name || 'proekt')}.boxstudio.json`, new Blob([projectJSON()], { type: 'application/json' }));
  $('#openBtn').onclick = () => { $('#projInput').value = ''; $('#projInput').click(); };
  $('#projInput').onchange = e => e.target.files[0] && openProjectFile(e.target.files[0]);
  $('#newBtn').onclick = () => {
    const o = newObject('mailer'); o.name = 'Коробка 1';
    loadProject({ objects: [o], scene: state.scene, fonts: state.fonts, assets: {} }, { resetHistory: false });
    toast('Новый проект. Вернуть предыдущий — Ctrl+Z');
  };
  $('#sampleBtn').onclick = () => { loadProject(sampleProject(), { resetHistory: false }); toast('Загружен пример. Вернуть предыдущий — Ctrl+Z'); };
  $('#fontBtn').onclick = () => { $('#fontInput').value = ''; $('#fontInput').click(); };
  $('#fontInput').onchange = e => e.target.files[0] && addFontFile(e.target.files[0]);
  $$('#views .btn[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
  $('#orbitLockBtn').onclick = () => setOrbitLock(!orbitLock);
  $('#hideHint').onclick = () => { $('#stageHint').hidden = true; try { localStorage.setItem('box-studio-3d/hint', '1'); } catch {} };
  try { if (localStorage.getItem('box-studio-3d/hint')) $('#stageHint').hidden = true; } catch {}
}

export { initWiring, renderAll };
