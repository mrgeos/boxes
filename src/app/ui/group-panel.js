// Настройки группы: раскладка, отступ, выравнивание, положение
import { $, esc } from '../core/util.js';
import { sel } from '../core/state.js';
import { groupById, layoutAll, objectsIn, parentOf } from '../core/groups.js';
import { commit } from '../core/project.js';
import { bindFields, rangeField } from './fields.js';
import { renderObjects } from './object-list.js';

const DIRS = { x: 'Ряд слева направо', z: 'Ряд сзади вперёд' };
// align 'start' is the smaller coordinate across the row: the back edge of a row along x, the left one along z
const ALIGN = { x: { start: 'По заднему краю', center: 'По центру', end: 'По переднему краю' }, z: { start: 'По левому краю', center: 'По центру', end: 'По правому краю' } };

function renderGroupPanel(sec) {
  const g = groupById(sel.group), parent = parentOf(g.id), n = objectsIn(g.id).length;
  sec.innerHTML = `
    <div class="sec-h"><h2>Группа</h2><span class="hint">${n} в ряду</span></div>
    <div class="field wide"><span class="fl">Название</span><input class="txt" data-k="name" aria-label="Название группы"></div>
    <div class="field wide"><span class="fl">Раскладка</span><select data-k="dir">${Object.entries(DIRS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    ${rangeField('Отступ между объектами, мм', 'gap', 0, 500, 1)}
    <div class="field wide"><span class="fl">Выравнивание</span><select data-k="align">${Object.entries(ALIGN[g.dir] || ALIGN.x).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <p class="hint">Порядок в ряду — как в списке объектов: перетаскивайте строки или объекты на сцене за кольцо на полу. Размеры объектов можно менять — ряд перестроится сам.</p>
    <div class="sec-h" style="margin-top:4px"><h2>Положение в сцене</h2></div>
    ${parent ? `<p class="hint">Группу ставит в ряд группа «${esc(parent.name)}». Поворот — внутри неё.</p>`
      : rangeField('Смещение X, мм', 'pos.x', -2000, 2000, 1) + rangeField('Смещение Z, мм', 'pos.z', -2000, 2000, 1)}
    ${rangeField(parent ? 'Поворот в группе, °' : 'Поворот, °', 'rotY', -180, 180, 1)}
    <div class="grid2"><button class="btn sm" id="ungroupBtn2">Разгруппировать</button></div>`;
  bindFields(sec, () => groupById(sel.group), k => {
    if (k === 'name') return renderObjects();
    layoutAll();
    if (k === 'dir') { commit(); renderGroupPanel(sec); }   // the alignment names depend on the direction
  });
  $('#ungroupBtn2').onclick = () => $('#ungroupBtn').click();
}

export { renderGroupPanel };
