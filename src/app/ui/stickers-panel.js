// Правая панель: допы объекта (наклейки, рукава, ленты) и настройки выбранной наклейки
import { $, $$, esc, fmt, uid } from '../core/util.js';
import { ICON } from '../core/constants.js';
import { activeObj, sel } from '../core/state.js';
import { clearLid, faceKeys, faceLabel } from '../core/model.js';
import { allFonts } from '../core/fonts.js';
import { RT, markFace, ui } from '../scene/renderer.js';
import { hbOpen } from '../carriers/handle-box.js';
import { STICKER_FINISH, STICKER_KIND, activeSticker, newSticker, stickerKeys, stickerSize, touchSticker } from '../stickers/placement.js';
import { commit } from '../core/project.js';
import { bindFields, rangeField } from './fields.js';
import { bindVecColors, vecColorsHTML } from './face-panel.js';
import { pickAsset } from './asset-picker.js';
import { activeFill, activeRibbon, addFill, addPart, addRibbon, deleteExtra, duplicateExtra, extraById, extraHidden, extraName, extrasOf, isPart, renameExtra, setExtraHidden, setExtraLocked } from '../core/extras.js';
import { sleeveOn } from '../carriers/sleeve.js';
import { carryOn } from '../carriers/carry.js';
import { tissueOn } from '../carriers/tissue.js';
import { select, selectExtra } from '../core/selection.js';
import { renameExtraTree, renderObjects } from './object-list.js';
import { refreshTabs } from './tabs.js';
import { openMenu } from './menu.js';
import { renderModel } from './model-panel.js';
import { ribbonFits } from '../carriers/ribbon.js';
import { bindRibbon, ribbonHTML } from './ribbon-panel.js';
import { renderFillPanel } from './fill-panel.js';
import { fillFits, fillOn } from '../carriers/fill.js';
import { insertOn } from '../carriers/insert.js';
import { isShape } from '../carriers/shapes.js';

/* ---------- stickers panel ---------- */
/* a seal goes across the line where the box opens */
function sealSpot(o) {
  const lt = o.lidType || 'flat';
  if (o.type === 'bag') return o.bagTop === 'open' ? { face: 'front', x: .5, y: .15 } : o.ext?.on ? { face: 'extFront', x: .5, y: 1 } : o.bagTop === 'seal' ? { face: 'front', x: .5, y: .03 } : { face: o.bagTop, x: .5, y: 1 };
  if (o.type === 'dome') return { face: 'lidFront', x: .5, y: .97 };
  if (o.type === 'torte') return { face: 'lidWrap', x: .5, y: .97 };
  if (o.type !== 'box') return { face: faceKeys(o)[0], x: .5, y: .5 };
  if (lt === 'flap') return { face: 'flap', x: .5, y: 1 };
  if (lt === 'handle') { const op = hbOpen(o); return op.right || op.left ? { face: op.right ? 'rightTop' : 'leftTop', x: .5, y: 1, rot: 0 } : { face: 'front', x: .5, y: .5 }; }
  if (lt === 'telescope') return clearLid(o) && o.lidFit === 'inside' ? { face: 'top', x: .5, y: .5 } : { face: 'lidFront', x: .5, y: 1 };
  if (lt === 'none') return { face: 'front', x: .5, y: .5 };
  return { face: 'front', x: .5, y: 0 };
}
function addSticker(st) {
  const o = activeObj(); if (!o) return;
  o.stickers.push(st); touchSticker(o, st);
  selectExtra(o.id, st.id); commit();
}
function duplicateSticker(id) {
  const t = activeObj()?.stickers.find(x => x.id === id); if (!t) return;
  addSticker({ ...structuredClone(t), id: uid(), x: t.x + .05, y: t.y + .05 });
}
function deleteSticker(id) {
  const o = activeObj(); if (!o) return;
  const st = o.stickers.find(t => t.id === id); if (!st) return;
  o.stickers = o.stickers.filter(t => t.id !== id); touchSticker(o, { ...st, visible: false });
  for (const k of stickerKeys.get(id) || []) markFace(o, k);
  if (sel.sticker === id) sel.sticker = null;
  renderStickers(); renderObjects(); refreshTabs(); commit();
}
function renderStickers() {
  ui.lib = true;
  // the picked sticker shows in the object list and switches the panel's tabs
  renderObjects(); refreshTabs();
  const sec = $('#stickerSec'), o = activeObj();
  if (!o) { sec.innerHTML = ''; return; }
  const st = activeSticker();
  // a picked ribbon shows its own settings
  const rb = !st && activeRibbon();
  if (rb) { sec.innerHTML = ribbonHTML(o, rb); return bindRibbon(sec, o); }
  const fl = !st && activeFill();
  if (fl) return renderFillPanel(sec, o);
  // the object's extras and what can be added; a picked sticker shows its own settings instead
  let html = st ? `<div class="sec-h"><h2>Наклейка</h2><span class="badge">${esc(faceLabel(o, st.face))}</span></div>` : extrasHTML(o);
  if (st) {
    const custom = st.kind === 'custom';
    html += `<div class="field wide"><span class="fl">Название</span><input class="txt" data-k="name" placeholder="${esc(extraName(o, { kind: 'sticker', T: { ...st, name: '' } }))}" aria-label="Название наклейки"></div>
      <div class="field wide"><span class="fl">Форма</span><select data-k="kind">${Object.entries(STICKER_KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      ${rangeField(st.kind === 'circle' ? 'Ширина (Ø), мм' : 'Ширина, мм', 'w', 5, 400, .5)}
      ${custom ? '' : rangeField('Высота, мм', 'h', 5, 400, .5)}
      ${st.kind === 'rect' ? rangeField('Скругление, мм', 'radius', 0, 60, .5) : ''}
      ${custom ? `<div class="row"><button class="btn sm" id="stShape">${st.src ? 'Заменить форму…' : 'Загрузить форму…'}</button></div>${vecColorsHTML(st)}${rangeField('Белая окантовка, мм', 'outline', 0, 10, .1)}`
        : `<div class="row"><span class="hint">Фон</span><input type="color" data-k="fill" aria-label="Цвет наклейки"><label class="check"><input type="checkbox" data-k="clear"> Без фона</label></div>
           <div class="row"><button class="btn sm" id="stBg">${st.bgSrc ? 'Заменить картинку фона…' : 'Картинка на фон…'}</button>${st.bgSrc ? '<button class="btn sm" id="stBgOff">Убрать</button>' : ''}</div>
           ${st.bgSrc ? rangeField('Зум фона, %', 'bgScale', 100, 400, 1, 100) + rangeField('Фон по X, %', 'bgX', -50, 50, 1, 100) + rangeField('Фон по Y, %', 'bgY', -50, 50, 1, 100) : ''}
           <div class="row"><span class="hint">Обводка</span><input type="color" data-k="stroke" aria-label="Цвет обводки"><span class="grow"></span></div>${rangeField('Обводка, мм', 'strokeW', 0, 10, .1)}
           <div class="row"><button class="btn sm" id="stImg">${st.src ? 'Заменить логотип…' : 'Логотип поверх фона…'}</button>${st.src ? '<button class="btn sm" id="stImgOff">Убрать</button>' : ''}</div>
           ${st.src ? rangeField('Логотип, %', 'imgScale', 10, 100, 1, 100) + vecColorsHTML(st) : ''}`}
      <textarea data-k="text" rows="1" aria-label="Текст наклейки" placeholder="Текст на наклейке"></textarea>
      <div class="grid2"><select data-k="font" aria-label="Шрифт">${allFonts().map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select>
        <div class="row"><input type="color" data-k="textColor" aria-label="Цвет текста"><span class="hint">цвет текста</span></div></div>
      ${rangeField('Кегль, мм', 'textSize', 1, 60, .5)}
      ${rangeField('Толщина, мм', 'thick', 0, 3, .05)}
      ${rangeField('Натяжение плёнки, %', 'tension', 0, 100, 1, 100)}
      <p class="hint">0 % — плотно облегает внутренние углы и ступеньки, 100 % — натянута и перекидывается через них (радиус до 15 мм).</p>
      <div class="field wide"><span class="fl">Покрытие</span><select data-k="finish">${Object.entries(STICKER_FINISH).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field wide"><span class="fl">Грань</span><select data-k="face">${faceKeys(o).map(k => `<option value="${k}">${faceLabel(o, k)}</option>`).join('')}</select></div>
      ${rangeField('Центр X, %', 'x', -20, 120, .1, 100)}${rangeField('Центр Y, %', 'y', -20, 120, .1, 100)}${rangeField('Поворот, °', 'rot', -180, 180, 1)}
      <div class="grid2"><button class="btn sm" id="stSealPos">Пломбой на линию открытия</button><button class="btn sm danger" id="stDel">Удалить</button></div>`;
  }
  sec.innerHTML = html;
  if (!st) return bindExtras(sec, o);
  bindFields(sec, activeSticker, k => {
    const t = activeSticker(); if (!t) return;
    if (k === 'kind' && t.kind === 'custom' && !t.src) { $('#stShape')?.click(); }
    if (k === 'name') { renderObjects(); refreshTabs(); return; }
    // the text: the sticker and its name in the list follow as it is typed; the panel stays (it would lose the focus)
    if (k === 'text') { touchSticker(o, t); renderObjects(); refreshTabs(); return; }
    if (k === 'kind' || k === 'face') { touchSticker(o, t); renderObjects(); refreshTabs(); return renderStickers(); }
    touchSticker(o, t);
  });
  $('#stDel').onclick = () => deleteSticker(st.id);
  $('#stSealPos').onclick = () => { Object.assign(st, sealSpot(o)); touchSticker(o, st); renderStickers(); commit(); };
  const pickInto = (btn, title, key) => btn && (btn.onclick = () => pickAsset(btn, title, r => { st[key] = r.id; if (key === 'src') { st.recolor = {}; if (st.kind === 'custom') st.aspect = r.aspect; } touchSticker(o, st); renderStickers(); commit(); }));
  pickInto($('#stShape'), 'Форма наклейки', 'src');
  pickInto($('#stImg'), 'Логотип на наклейке', 'src');
  pickInto($('#stBg'), 'Картинка на фон наклейки', 'bgSrc');
  $('#stImgOff') && ($('#stImgOff').onclick = () => { st.src = null; touchSticker(o, st); renderStickers(); commit(); });
  $('#stBgOff') && ($('#stBgOff').onclick = () => { st.bgSrc = null; touchSticker(o, st); renderStickers(); commit(); });
  bindVecColors(sec, activeSticker, t => { const look = RT.get(o.id)?.stickerLook?.get(t.id); if (look) look.key = ''; touchSticker(o, t); }, renderStickers);
}

/* ---------- the object's extras ---------- */
const EXTRA_ICON = { sleeve: ICON.sleeveX, carry: ICON.carryX, ribbon: ICON.ribbonX, tissue: ICON.tissueX, insert: ICON.insertX, fill: ICON.model };
const stickerIcon = t => t.kind === 'circle' ? ICON.ell : t.kind === 'rect' ? ICON.rect : ICON.sticker;
const extraIcon = e => e.kind === 'sticker' ? stickerIcon(e.T) : EXTRA_ICON[e.kind];
/* lock and eye of an extra's row: on hover, and kept while it is locked or hidden (as for layers) */
const extraActs = e => { const hid = extraHidden(e), lck = !!e.T.locked; return `<button data-a="lock" class="${lck ? 'pin' : ''}" title="${lck ? 'Разблокировать' : 'Заблокировать: не выбирается и не двигается на модели'}" aria-label="Блокировка">${lck ? ICON.lock : ICON.unlock}</button><button data-a="vis" class="${hid ? 'pin' : ''}" title="${hid ? 'Показать' : 'Скрыть'}" aria-label="Видимость">${hid ? ICON.eyeOff : ICON.eye}</button>`; };
function extrasHTML(o) {
  const list = extrasOf(o), sleeveFree = o.type === 'box' && o.lidType !== 'handle' && !isShape(o) && !sleeveOn(o), carryFree = o.type === 'torte' && !carryOn(o), ribbon = ribbonFits(o), tissueFree = o.type === 'box' && !['handle', 'drawer'].includes(o.lidType) && !isShape(o) && !tissueOn(o), insertFree = o.type === 'box' && !['handle', 'drawer'].includes(o.lidType) && !isShape(o) && !insertOn(o), fillFree = fillFits(o) && !fillOn(o);
  return `<div class="sec-h"><h2>Допы</h2><span class="hint">${list.length || ''}</span></div>
    <p class="hint">Наклейки, рукава, ленты и другое, что надевается на ${o.type === 'torte' ? 'тортницу' : 'объект'} или клеится на него. Выбранный доп настраивается как отдельный объект.</p>
    <div class="grid2"><button class="btn sm" id="addSticker" aria-haspopup="menu">${ICON.sticker}Наклейка</button>${fillFree ? `<button class="btn sm" id="addFill">${ICON.model}Начинка (3D)</button>` : ''}${ribbon ? `<button class="btn sm" id="addRibbon">${ICON.ribbonX}Лента с бантом</button>` : ''}${tissueFree ? `<button class="btn sm" id="addTissue">${ICON.tissueX}Бумага тишью</button>` : ''}${insertFree ? `<button class="btn sm" id="addInsert">${ICON.insertX}Ложемент</button>` : ''}${sleeveFree ? `<button class="btn sm" id="addSleeve">${ICON.sleeveX}Рукав</button>` : ''}${carryFree ? `<button class="btn sm" id="addCarry">${ICON.carryX}Рукав-переноска</button>` : ''}</div>
    ${list.length ? `<div class="layers" id="extraList">${list.map(e => `<div class="layer ${extraHidden(e) ? 'hidden' : ''} ${e.T.locked ? 'locked' : ''}" data-id="${e.id}">
      <span class="th">${extraIcon(e)}</span><span class="ln">${esc(extraName(o, e))}</span>${e.kind === 'sticker' ? `<span class="dm mono">${fmt(e.T.w)}×${fmt(stickerSize(e.T)[1])}</span>` : ''}
      <span class="acts">${extraActs(e)}</span></div>`).join('')}</div>`
      : `<div class="empty">Допов пока нет. Наклейка — круг, прямоугольник, фото или своя форма из PNG/SVG${sleeveFree ? '; рукав — бумажная лента вокруг коробки' : ''}${carryFree ? '; рукав-переноска — лента под дном с ручкой' : ''}${ribbon ? '; лента — крестом с бантом сверху' : ''}.</div>`}`;
}
function bindExtras(sec, o) {
  const face = () => sel.face && faceKeys(o).includes(sel.face) && !isPart(sel.face) ? sel.face : faceKeys(o)[0];
  // one button for stickers, like the other extras; the kind is picked from its menu
  $('#addSticker').onclick = e => {
    const btn = e.currentTarget, r = btn.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [
      { label: 'Круг', run: () => addSticker(newSticker('circle', face())) },
      { label: 'Прямоугольник', run: () => addSticker(newSticker('rect', face())) },
      // a photo sticker: the picture fills a rectangle of its own proportions
      { label: 'Фото…', run: () => pickAsset(btn, 'Фото на наклейку', a => {
        const w = 50;
        addSticker(newSticker('rect', face(), { bgSrc: a.id, w, h: Math.round(w / a.aspect * 2) / 2, radius: 2, text: '' }));
      }) },
      { label: 'Своя форма (PNG, SVG)…', run: () => pickAsset(btn, 'Своя форма: PNG или SVG с прозрачным фоном', a => addSticker(newSticker('custom', face(), { src: a.id, aspect: a.aspect, w: 50, outline: 1.5 }))) },
      'sep',
      { label: 'Пломба на линию открытия', run: () => addSticker(newSticker('rect', 'front', { ...sealSpot(o), w: 22, h: o.type === 'dome' || o.type === 'torte' ? 80 : 50, radius: 2, text: '', fill: '#f3ead6', stroke: '#b8461b', strokeW: .8, finish: 'gloss' })) },
    ], 'Наклейка');
  };
  const flBtn = $('#addFill');
  if (flBtn) flBtn.onclick = () => { if (addFill(o)) { selectExtra(o.id, 'fill'); renderObjects(); commit(); } };
  const rbBtn = $('#addRibbon');
  if (rbBtn) rbBtn.onclick = () => { const r = addRibbon(o); if (r) { selectExtra(o.id, r.id); renderObjects(); commit(); } };
  for (const kind of ['sleeve', 'carry', 'tissue', 'insert']) {
    const b = $(kind === 'sleeve' ? '#addSleeve' : kind === 'tissue' ? '#addTissue' : kind === 'insert' ? '#addInsert' : '#addCarry');
    if (b) b.onclick = () => { if (addPart(o, kind)) { selectExtra(o.id, kind); renderObjects(); commit(); } };
  }
  $$('#extraList .layer').forEach(el => el.onclick = e => {
    const a = e.target.closest('button')?.dataset.a, id = el.dataset.id;
    if (a) return extraAction(o, id, a);
    if (e.detail === 2) return renameExtraRow(o, el);
    selectExtra(o.id, id);
  });
  $$('#extraList .layer').forEach(el => el.oncontextmenu = e => { e.preventDefault(); extraMenu(o, el.dataset.id, e.clientX, e.clientY); });
}
/* the buttons and menu items of an extra's row (here and in the object list) */
function extraAction(o, id, a) {
  const e = extraById(o, id); if (!e) return;
  if (a === 'vis') setExtraHidden(o, id, !extraHidden(e));
  if (a === 'lock') setExtraLocked(o, id, !e.T.locked);
  if (a === 'dup') { const c = duplicateExtra(o, id); if (c) { selectExtra(o.id, c.id); } }
  if (a === 'del') {
    deleteExtra(o, id);
    if (sel.sticker === id) sel.sticker = null;
    if (sel.ribbon === id) sel.ribbon = null;
    if (sel.part === id) { sel.part = null; select(o.id, faceKeys(o).find(k => !isPart(k)), null); }
    for (const k of stickerKeys.get(id) || []) markFace(o, k);
  }
  renderStickers(); renderObjects(); refreshTabs(); if (isPart(id)) renderModel(); commit();
}
function extraMenu(o, id, x, y) {
  const e = extraById(o, id); if (!e) return;
  openMenu(x, y, [
    { label: 'Выбрать', run: () => selectExtra(o.id, id) },
    { label: 'Переименовать', run: () => { const row = $(`#extraList .layer[data-id="${id}"]`) ; if (row) renameExtraRow(o, row); else renameExtraTree(o.id, id); } },
    e.kind === 'sticker' && { label: 'Дублировать', run: () => extraAction(o, id, 'dup') },
    { label: 'Удалить', run: () => extraAction(o, id, 'del') },
    'sep',
    { label: extraHidden(e) ? 'Показать' : 'Скрыть', run: () => extraAction(o, id, 'vis') },
    { label: e.T.locked ? 'Разблокировать' : 'Заблокировать', run: () => extraAction(o, id, 'lock') },
  ], extraName(o, e));
}
/* types a new name right in the row */
function renameExtraRow(o, row) {
  const id = row.dataset.id, e = extraById(o, id), ln = $('.ln', row); if (!e || !ln) return;
  const inp = document.createElement('input'); inp.className = 'ren'; inp.value = extraName(o, e); inp.setAttribute('aria-label', 'Название');
  ln.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const end = save => { if (done) return; done = true; if (save) { renameExtra(o, id, inp.value); commit(); } renderStickers(); renderObjects(); refreshTabs(); };
  inp.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') end(true); if (ev.key === 'Escape') end(false); };
  inp.onblur = () => end(true);
  for (const t of ['click', 'pointerdown']) inp.addEventListener(t, ev => ev.stopPropagation());
}

/* types into a sticker's text: the sticker is picked and its text field gets the caret, its text selected */
function editStickerText(o, id) {
  selectExtra(o.id, id);
  requestAnimationFrame(() => { const ta = $('#stickerSec textarea[data-k="text"]'); if (ta) { ta.focus(); ta.select(); } });
}
/* a picture put into a sticker (from the library, dropped on it): the shape of a custom one, the background of the others */
function setStickerImage(o, st, it) {
  if (st.kind === 'custom') { st.src = it.id; st.aspect = it.aspect; st.recolor = {}; } else st.bgSrc = it.id;
  touchSticker(o, st); renderStickers(); commit();
}

export { addSticker, deleteSticker, duplicateSticker, editStickerText, extraAction, extraIcon, extraActs, extraMenu, renderStickers, setStickerImage };
