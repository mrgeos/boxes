// Правая панель: начинка упаковки — какая 3D-модель, сколько штук, как лежат
import { $, esc, toast } from '../core/util.js';
import { activeFill } from '../core/extras.js';
import { FILL_LAYOUT } from '../carriers/fill.js';
import { FOOD, importModel, modelName } from '../core/models3d.js';
import { myModels, useMyModel } from '../core/model-library.js';
import { rebuildQueue } from '../scene/renderer.js';
import { commit } from '../core/project.js';
import { bindFields, rangeField } from './fields.js';
import { bindExtraFoot, extraFoot, renderStickers } from './stickers-panel.js';
import { renderObjects } from './object-list.js';
import { refreshTabs } from './tabs.js';
import { modelQuality } from './wiring.js';

/* a model picker shared by the filling and the cake: the food library and the user's own file */
function modelOptions(ref, extra = '') {
  const lib = ref?.lib;
  const my = ref?.my;
  return extra + (myModels.length ? `<optgroup label="Мои модели">${myModels.map(c => `<option value="@my:${c.hash}" ${c.hash === my ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>` : '')
    + `<optgroup label="Библиотека еды">${FOOD.map(x => `<option value="${x.id}" ${x.id === lib ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`
    + (ref?.asset && !myModels.some(c => c.hash === my) ? `<option value="" selected>${esc(modelName(ref))} (свой файл)</option>` : '') + '<option value="@file">Загрузить файл…</option>';
}
/* what the picker chose: a library model, or a file brought in (then cb gets its ref) */
function pickModel(value, cb) {
  if (value.startsWith('@my:')) { useMyModel(value.slice(4)).then(r => cb(r.ref), e => toast(e.message)); return; }
  if (value !== '@file') { if (value) cb({ lib: value }); return; }
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.glb,.gltf,.bin,.obj,.mtl,.fbx,.usdz,.jpg,.jpeg,.png,.webp';
  inp.onchange = async () => {
    try { const r = await importModel(inp.files, modelQuality()); cb({ ...r.ref, name: r.name }); toast(`Модель «${r.name}»: ${r.tris.toLocaleString('ru-RU')} треугольников, ${r.kb} КБ`); }
    catch (e) { toast(e.message || 'Не удалось прочитать модель', 5000); }
  };
  inp.click();
}
function renderFillPanel(sec, o) {
  const F = activeFill(); if (!F) return;
  const auto = !(F.size > 0);
  sec.innerHTML = `<div class="sec-h"><h2>Начинка</h2><span class="badge">3D</span></div>
    <div class="field wide"><span class="fl">Модель</span><select id="fillModel">${modelOptions(F.model)}</select></div>
    ${rangeField('Сколько штук', 'count', 1, 30, 1)}
    <div class="field wide"><span class="fl">Как лежат</span><select data-k="layout">${Object.entries(FILL_LAYOUT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <label class="check"><input type="checkbox" id="fillAuto" ${auto ? 'checked' : ''}> Размер — как помещается на дно</label>
    ${auto ? '' : rangeField('Размер (длинная сторона), мм', 'size', 5, 600, 1)}
    ${rangeField('Промежуток, мм', 'gap', 0, 60, 1)}${rangeField('Поворот, °', 'rot', -180, 180, 1)}
    <p class="hint">Модели лежат на дне${o.type === 'box' ? ' коробки (поверх тишью, если она есть)' : o.type === 'dome' ? ' лотка' : ' тортницы'}, равномерно по нему. Сколько бы их ни было, каждая часть модели рисуется один раз — это быстро и на слабом компьютере.</p>
    ${extraFoot(!!F.hidden)}`;
  const again = () => { rebuildQueue.add(o.id); renderObjects(); refreshTabs(); };
  bindFields(sec, activeFill, () => again());
  $('#fillModel').onchange = e => pickModel(e.target.value, ref => { F.model = ref; again(); renderStickers(); commit(); });
  $('#fillAuto').onchange = e => { F.size = e.target.checked ? 0 : 80; again(); renderStickers(); commit(); };
  bindExtraFoot(sec, o, 'fill');
}

export { modelOptions, pickModel, renderFillPanel };
