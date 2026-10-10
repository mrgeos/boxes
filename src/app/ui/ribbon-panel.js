// Правая панель: настройки выбранной ленты (материал, ширина, цвет, печать, бант)
import { $, $$, esc } from '../core/util.js';
import { allFonts } from '../core/fonts.js';
import { activeRibbon, extraName } from '../core/extras.js';
import { RIBBON_BOW, buildRibbons, ribbonLook, setRibbonMat } from '../carriers/ribbon.js';
import { commit } from '../core/project.js';
import { setLink } from '../core/brand.js';
import { bindFields, rangeField } from './fields.js';
import { pickAsset } from './asset-picker.js';
import { bindExtraFoot, extraFoot, renderStickers } from './stickers-panel.js';
import { renderObjects } from './object-list.js';
import { refreshTabs } from './tabs.js';

/* fields that change the ribbon's shape (made again) rather than its look */
const SHAPE_KEYS = ['w', 'thick', 'lift', 'bowSize', 'tails'];
const seg = (k, opts, cur, label) => `<div class="seg" data-seg="${k}" role="group" aria-label="${esc(label)}">${Object.entries(opts).map(([v, t]) => `<button type="button" data-v="${v}" class="${v === cur ? 'on' : ''}" aria-pressed="${v === cur}">${esc(t)}</button>`).join('')}</div>`;
const SHORT_BOW = { classic: 'Бант', puffy: 'Пышный', knot: 'Узел' };
const SHORT_MAT = { satin: 'Атлас', grosgrain: 'Репс', twine: 'Шпагат' };
const SHORT_PRINT = { none: 'Нет', text: 'Текст', logo: 'Логотип' };

function ribbonHTML(o, r) {
  const twine = r.mat === 'twine', print = twine ? 'none' : r.print || 'none';
  // like every extra: «Форма» (material, size, the bow) and «Дизайн» (colour and print)
  return `<div data-pane="shape">
    <div class="sec-h"><h2>Лента</h2><span class="badge">крестом</span></div>
    <div class="field wide"><span class="fl">Название</span><input class="txt" data-k="name" placeholder="${esc(extraName(o, { kind: 'ribbon', T: { ...r, name: '' } }))}" aria-label="Название ленты"></div>
    <div class="field wide"><span class="fl">Материал</span>${seg('mat', SHORT_MAT, r.mat, 'Материал')}</div>
    ${twine ? rangeField('Толщина, мм', 'w', 1, 10, .5) : rangeField('Ширина, мм', 'w', 3, 60, .5) + rangeField('Толщина, мм', 'thick', .1, 3, .05)}
    ${rangeField('Зазор, мм', 'lift', 0, 10, .1)}
    <div class="sec-h"><h2>Бант</h2></div>
    <div class="field wide"><span class="fl">Завязка</span>${seg('bow', SHORT_BOW, r.bow, 'Как завязана')}</div>
    ${r.bow === 'knot' ? '' : rangeField('Размер банта, мм', 'bowSize', 8, 160, 1)}
    ${rangeField('Хвосты, мм', 'tails', 0, 300, 1)}
    <p class="hint">Зазор приподнимает ленту над поверхностью, под ней видна тень. ${esc(RIBBON_BOW[r.bow] || '')}: лента идёт крестом через центр крышки и дно. Когда крышку открывают, лента снята; закрыли — снова на месте.</p>
    ${extraFoot(!!r.hidden)}
  </div>
  <div data-pane="design">
    <div class="sec-h"><h2>Дизайн ленты</h2></div>
    <div class="row"><span class="hint">Цвет</span><input type="color" data-k="color" aria-label="Цвет ленты"><span class="grow"></span></div>
    ${twine ? '<p class="hint">На шпагате печати нет.</p>' : `<div class="field wide"><span class="fl">Печать</span>${seg('print', SHORT_PRINT, print, 'Печать на ленте')}</div>
      ${print === 'text' ? `<input class="txt" data-k="text" aria-label="Текст на ленте" placeholder="Текст повторяется вдоль ленты">
        <div class="grid2"><select data-k="font" aria-label="Шрифт">${allFonts().map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select>
          <div class="row"><input type="color" data-k="textColor" aria-label="Цвет текста"><span class="hint">цвет текста</span></div></div>` : ''}
      ${print === 'logo' ? `<div class="row"><button class="btn sm" id="rbLogo">${r.src ? 'Заменить логотип…' : 'Выбрать логотип…'}</button></div>` : ''}
      ${print !== 'none' ? rangeField(print === 'logo' ? 'Высота логотипа, мм' : 'Кегль, мм', 'printSize', 1, Math.max(4, r.w), .5) + rangeField('Промежуток, мм', 'gap', 0, 200, 1) : ''}`}
  </div>`;
}
function bindRibbon(sec, o) {
  const r = activeRibbon(); if (!r) return;
  bindFields(sec, activeRibbon, k => {
    const t = activeRibbon(); if (!t) return;
    if (k === 'name') { renderObjects(); refreshTabs(); return; }
    if (SHAPE_KEYS.includes(k)) buildRibbons(o); else ribbonLook(o, t);
  });
  $$('[data-seg]', sec).forEach(g => g.addEventListener('click', e => {
    const v = e.target.closest('[data-v]')?.dataset.v, t = activeRibbon(); if (!v || !t) return;
    const k = g.dataset.seg;
    if (k === 'mat') setRibbonMat(o, t, v); else t[k] = v;
    if (k === 'print') ribbonLook(o, t); else buildRibbons(o);
    renderStickers(); if (k === 'mat') renderObjects(); commit();
  }));
  const logo = $('#rbLogo');
  if (logo) logo.onclick = () => pickAsset(logo, 'Логотип на ленте', it => { const t = activeRibbon(); if (!t) return; t.src = it.id; t.aspect = it.aspect; t.recolor = {}; setLink(t, 'src', it.brand || null); ribbonLook(o, t); renderStickers(); commit(); }, { brand: true });
  bindExtraFoot(sec, o, r.id);
}

export { bindRibbon, ribbonHTML };
