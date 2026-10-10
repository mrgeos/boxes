// Левая панель «Бренд»: фирменные цвета, логотипы, паттерны и шрифты проекта
import { $, $$, esc, slug, toast } from '../core/util.js';
import { ICON } from '../core/constants.js';
import { activeObj, assets, sel, state } from '../core/state.js';
import { faceKeys } from '../core/model.js';
import { addAsset } from '../core/assets.js';
import { library } from '../core/library.js';
import { allFonts } from '../core/fonts.js';
import { FONT_ROLES, LOGO_ROLES, addBrandColor, addBrandLogo, addBrandPattern, brandColor, brandLogo, kit, kitFile, loadKit, parsePalette, pictureColors,
  placeBrandLogo, placeBrandPattern, projectFonts, removeBrandColor, removeBrandPicture, replaceBrandPicture, setBrandFont, updateBrandColor, usesOf } from '../core/brand.js';
import { assetsOf, commit, saveFile } from '../core/project.js';
import { documentColors } from './color-picker.js';
import { pickAsset } from './asset-picker.js';
import { openMenu } from './menu.js';
import { pickLayers, select } from '../core/selection.js';
import { renderFaceTabs, renderLayerProps, renderLayers } from './face-panel.js';
import { setTab } from './tabs.js';

/* the colour being edited (its fields under the list), and a list of colours offered to add (from a logo, the
   project or a palette), each one ticked or not */
let editing = null, offer = null;
const roleOpts = cur => Object.entries(LOGO_ROLES).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v}</option>`).join('');
const fontOpts = cur => `<option value="">— не задан —</option>` + allFonts().map(f => `<option value="${esc(f)}" ${f === cur ? 'selected' : ''}>${esc(f)}</option>`).join('');
const pic = l => assets[l.src] ? `style="background-image:url('${assets[l.src]}')"` : '';

function renderBrand() {
  const sec = $('#brandSec'); if (!sec) return;
  const K = kit(), ed = editing && brandColor(editing);
  sec.innerHTML = `<div class="sec-h"><h2>Бренд-кит</h2><button class="btn icon ghost" id="brandMenu" title="Экспорт и импорт кита" aria-label="Меню кита">⋯</button></div>
    <p class="hint">Фирменные цвета, логотипы, паттерны и шрифты проекта. Дизайн, который их взял, связан с китом: поменяли здесь — поменялось на всех объектах.</p>
    <h3 class="bh">Цвета</h3>
    <div class="bcolors">${K.colors.map(c => `<button class="bc ${c.id === editing ? 'on' : ''}" data-c="${c.id}" title="${esc(c.name)} · ${c.hex}${c.pantone ? ' · ' + esc(c.pantone) : ''}">
      <span class="sw" style="background:${c.hex}"></span><span class="bn">${esc(c.name)}</span><span class="bx mono">${c.hex}</span>${usesOf(c.id) ? `<span class="bu" title="Связано полей в дизайне">${usesOf(c.id)}</span>` : ''}</button>`).join('')}
      <button class="bc add" id="bcAdd" title="Добавить цвет"><span class="sw">＋</span><span class="bn">Цвет</span></button></div>
    ${ed ? `<div class="bedit">
      <div class="row"><input type="color" id="beHex" value="${ed.hex}" aria-label="Цвет"><input class="txt grow" id="beName" value="${esc(ed.name)}" aria-label="Название цвета"></div>
      <div class="grid2"><input class="txt" id="beCmyk" value="${esc(ed.cmyk || '')}" placeholder="CMYK: 0 30 100 0" aria-label="CMYK"><input class="txt" id="bePms" value="${esc(ed.pantone || '')}" placeholder="Pantone 7741 C" aria-label="Pantone"></div>
      <div class="row"><span class="hint grow">${usesOf(ed.id) ? `Связано с дизайном: ${usesOf(ed.id)}` : 'Пока не используется: выберите его в любом поле цвета'}</span><button class="btn sm danger" id="beDel">Убрать из кита</button></div></div>` : ''}
    <div class="row wrap"><button class="btn sm" id="bcLogo" ${K.logos.length ? '' : 'disabled title="Сначала добавьте логотип"'}>Из логотипа</button><button class="btn sm" id="bcProj">Из проекта</button><button class="btn sm" id="bcImp">Импорт палитры…</button></div>
    ${offer ? offerHTML() : ''}
    <h3 class="bh">Логотипы</h3>
    ${K.logos.map(l => `<div class="bcard" data-l="${l.id}"><span class="bt" ${pic(l)}></span><div class="bm"><input class="txt" data-name value="${esc(l.name)}" aria-label="Название"><select data-role aria-label="Версия">${roleOpts(l.role)}</select>
      <div class="ba"><button class="btn sm" data-a="place" title="Поставить на выбранную грань (на тёмном фоне — инверсный)">На грань</button><span class="grow"></span><button class="vx" data-a="swap" title="Заменить картинку: поменяется везде">${ICON.swap}</button><button class="vx" data-a="del" title="Убрать из кита">${ICON.trash}</button></div></div></div>`).join('')}
    <button class="btn sm" id="blAdd">${ICON.plus}Добавить логотип…</button>
    <h3 class="bh">Паттерны</h3>
    ${K.patterns.map(l => `<div class="bcard" data-l="${l.id}"><span class="bt tile" ${pic(l)}></span><div class="bm"><input class="txt" data-name value="${esc(l.name)}" aria-label="Название">
      <div class="ba"><button class="btn sm" data-a="pattern" title="Узором на фон выбранной грани">На фон грани</button><span class="grow"></span><button class="vx" data-a="swap" title="Заменить картинку: поменяется везде">${ICON.swap}</button><button class="vx" data-a="del" title="Убрать из кита">${ICON.trash}</button></div></div></div>`).join('')}
    <button class="btn sm" id="bpAdd">${ICON.plus}Добавить паттерн…</button>
    <h3 class="bh">Шрифты</h3>
    ${Object.entries(FONT_ROLES).map(([r, t]) => `<div class="field wide"><span class="fl">${t}</span><select data-font="${r}">${fontOpts(K.fonts[r])}</select></div>`).join('')}
    <div class="row"><button class="btn sm" id="bfUp">Загрузить шрифт…</button>${projectFonts().length ? `<span class="hint">В дизайне: ${projectFonts().slice(0, 3).map(esc).join(', ')}</span>` : ''}</div>
    <p class="hint">Текст берёт шрифт кита в его свойствах (список «Шрифт» → «Бренд»): поменяли шрифт здесь — поменялся у всех таких текстов.</p>`;
  bind(sec);
}
function offerHTML() {
  return `<div class="boffer"><div class="row"><b class="grow">${esc(offer.title)}</b><button class="vx" id="boX" title="Закрыть">✕</button></div>
    ${offer.paste ? `<textarea id="boText" rows="3" placeholder="Коды цветов: #20392b, #e8d9a8 — можно с названиями, по строке на цвет"></textarea><div class="row"><button class="btn sm" id="boParse">Разобрать</button><button class="btn sm" id="boAse">Файл .ase…</button></div>` : ''}
    ${offer.colors.length ? `<div class="swatches">${offer.colors.map((c, i) => `<button class="sw ${offer.on.has(i) ? 'cur' : 'off'}" data-o="${i}" style="background:${c.hex}" title="${esc(c.name || c.hex)}" aria-pressed="${offer.on.has(i)}"></button>`).join('')}</div>
      <div class="row"><span class="hint grow">Отмечено: ${offer.on.size} из ${offer.colors.length}</span><button class="btn sm primary" id="boAdd" ${offer.on.size ? '' : 'disabled'}>Добавить в кит</button></div>` : offer.paste ? '' : '<p class="hint">Цветов не нашлось.</p>'}</div>`;
}
const fresh = cs => cs.filter(c => !kit().colors.some(k => k.hex === c.hex));
function offerColors(title, colors, paste = false) { const cs = fresh(colors); offer = { title, colors: cs, on: new Set(cs.map((_, i) => i)), paste }; renderBrand(); }
function changed(n = 0) { renderBrand(); renderLayers(); renderLayerProps(); commit(); if (n) toast(`Обновлено в дизайне: ${n}`); }

function bind(sec) {
  const K = kit();
  $('#brandMenu', sec).onclick = e => { const r = e.currentTarget.getBoundingClientRect(); openMenu(r.left, r.bottom + 4, [
    { label: 'Сохранить кит в файл…', run: () => saveFile(`${slug(state.name)}-brand.json`, new Blob([kitFile(assetsOf)], { type: 'application/json' })) },
    { label: 'Открыть кит из файла…', run: () => openFile('.json,application/json', async f => { try { loadKit(JSON.parse(await f.text()), addAsset); changed(); toast('Бренд-кит загружен'); } catch { toast('Это не файл бренд-кита'); } }) },
  ], 'Бренд-кит'); };
  // colours
  $$('.bc[data-c]', sec).forEach(b => b.onclick = () => { editing = editing === b.dataset.c ? null : b.dataset.c; renderBrand(); });
  $('#bcAdd', sec).onclick = () => { const c = addBrandColor(pickFree()); editing = c.id; changed(); };
  const ed = editing && brandColor(editing);
  if (ed) {
    $('#beHex', sec).addEventListener('input', e => { updateBrandColor(ed.id, { hex: e.target.value.toLowerCase() }); const sw = $(`.bc[data-c="${ed.id}"] .sw`, sec); if (sw) sw.style.background = e.target.value; });
    $('#beHex', sec).addEventListener('change', () => changed());
    for (const [id, k] of [['beName', 'name'], ['beCmyk', 'cmyk'], ['bePms', 'pantone']]) $('#' + id, sec).addEventListener('change', e => { updateBrandColor(ed.id, { [k]: e.target.value.trim() }); changed(); });
    $('#beDel', sec).onclick = () => { removeBrandColor(ed.id); editing = null; changed(); };
  }
  $('#bcLogo', sec).onclick = () => { const l = K.logos.find(x => x.role === 'main') || K.logos[0]; offerColors(`Цвета логотипа «${l.name}»`, pictureColors(l.src).map(hex => ({ hex }))); };
  $('#bcProj', sec).onclick = () => offerColors('Цвета проекта', documentColors().slice(0, 24).map(hex => ({ hex })));
  $('#bcImp', sec).onclick = () => { offer = { title: 'Импорт палитры', colors: [], on: new Set(), paste: true }; renderBrand(); $('#boText')?.focus(); };
  if (offer) {
    $('#boX', sec).onclick = () => { offer = null; renderBrand(); };
    $$('[data-o]', sec).forEach(b => b.onclick = () => { const i = +b.dataset.o; offer.on.has(i) ? offer.on.delete(i) : offer.on.add(i); renderBrand(); });
    $('#boAdd', sec) && ($('#boAdd', sec).onclick = () => { for (const i of offer.on) { const c = offer.colors[i]; addBrandColor(c.hex, c.name, c.cmyk ? { cmyk: c.cmyk } : {}); } toast(`В кит добавлено цветов: ${offer.on.size}`); offer = null; changed(); });
    $('#boParse', sec) && ($('#boParse', sec).onclick = () => { const cs = fresh(parsePalette($('#boText').value)); offer = { ...offer, colors: cs, on: new Set(cs.map((_, i) => i)) }; renderBrand(); });
    $('#boAse', sec) && ($('#boAse', sec).onclick = () => openFile('.ase,.txt,.gpl,.css', async f => {
      const cs = fresh(/\.ase$/i.test(f.name) ? parsePalette(await f.arrayBuffer()) : parsePalette(await f.text()));
      offer = { ...offer, colors: cs, on: new Set(cs.map((_, i) => i)) }; renderBrand(); if (!cs.length) toast('В файле не нашлось новых цветов');
    }));
  }
  // logos and patterns
  $('#blAdd', sec).onclick = e => pickAsset(e.currentTarget, 'Логотип в бренд-кит', r => {
    const first = !K.logos.length, l = addBrandLogo(r.id, r.aspect, nameOf(r.id, 'Логотип'));
    changed();
    // the first logo brings its colours along, to tick
    if (first && !K.colors.length) setTimeout(() => offerColors(`Цвета логотипа «${l.name}»`, pictureColors(l.src).map(hex => ({ hex }))), 200);
  });
  $('#bpAdd', sec).onclick = e => pickAsset(e.currentTarget, 'Паттерн в бренд-кит', r => { addBrandPattern(r.id, r.aspect, nameOf(r.id, 'Паттерн')); changed(); });
  $$('.bcard', sec).forEach(card => {
    const l = brandLogo(card.dataset.l);
    $('[data-name]', card).onchange = e => { l.name = e.target.value.trim() || l.name; changed(); };
    $('[data-role]', card)?.addEventListener('change', e => { l.role = e.target.value; changed(); });
    card.onclick = e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'del') { removeBrandPicture(l.id); changed(); }
      if (a === 'swap') pickAsset(e.target.closest('button'), 'Заменить: поменяется во всём дизайне', r => changed(replaceBrandPicture(l.id, r.id, r.aspect)));
      if (a === 'place' || a === 'pattern') {
        const o = activeObj(); if (!o) return toast('Выберите объект и грань');
        const k = sel.face && faceKeys(o).includes(sel.face) ? sel.face : faceKeys(o)[0];
        const L = a === 'place' ? placeBrandLogo(o, k, l) : placeBrandPattern(o, k, l);
        if (sel.face !== k) select(o.id, k, null);
        setTab('design'); pickLayers([L.id]); renderFaceTabs(); commit();
      }
    };
  });
  // fonts
  $$('[data-font]', sec).forEach(s => s.onchange = () => changed(setBrandFont(s.dataset.font, s.value)));
  $('#bfUp', sec).onclick = () => $('#fontBtn').click();
}
/* a colour not in the kit yet, for a new swatch */
function pickFree() { const used = new Set(kit().colors.map(c => c.hex)); return documentColors().find(c => !used.has(c)) || '#0a7aa1'; }
const nameOf = (id, d) => library.find(x => x.id === id)?.name || d;
function openFile(accept, cb) {
  const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
  i.onchange = () => i.files[0] && cb(i.files[0]); i.click();
}
export { renderBrand };
