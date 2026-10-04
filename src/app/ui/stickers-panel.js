// Правая панель: наклейки
import { $, $$, esc, fmt, uid } from '../core/util.js';
import { ICON } from '../core/constants.js';
import { activeObj, sel } from '../core/state.js';
import { clearLid, faceKeys, faceLabel } from '../core/model.js';
import { importImageFile } from '../core/assets.js';
import { allFonts } from '../core/fonts.js';
import { RT, markFace, ui } from '../scene/renderer.js';
import { hbOpen } from '../carriers/handle-box.js';
import { STICKER_FINISH, STICKER_KIND, activeSticker, newSticker, stickerKeys, stickerSize, touchSticker } from '../stickers/placement.js';
import { commit } from '../core/project.js';
import { bindFields, rangeField } from './fields.js';
import { bindVecColors, pickImage, renderLayerProps, renderLayers, vecColorsHTML } from './face-panel.js';

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
  o.stickers.push(st); sel.sticker = st.id; sel.layer = null;
  touchSticker(o, st); renderLayers(); renderLayerProps(); renderStickers(); commit();
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
  renderStickers(); commit();
}
function renderStickers() {
  ui.lib = true;
  const sec = $('#stickerSec'), o = activeObj();
  if (!o) { sec.innerHTML = ''; return; }
  const list = o.stickers || [], st = activeSticker();
  const kindIcon = t => t.kind === 'circle' ? ICON.ell : t.kind === 'rect' ? ICON.rect : '★';
  let html = `<div class="sec-h"><h2>Наклейки</h2><span class="hint">${list.length || ''}</span></div>
    <p class="hint">Наклеиваются поверх печати. Выберите наклейку и тяните её по модели — у ребра она переходит на соседнюю грань, как настоящая.</p>
    <div class="addrow">
      <button class="btn" id="stCircle">${ICON.ell}Круг</button>
      <button class="btn" id="stRect">${ICON.rect}Прямоуг.</button>
      <button class="btn" id="stCustom"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7Z"/></svg>Своя форма</button>
      <button class="btn" id="stSeal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="2" width="8" height="20" rx="1"/><path d="M3 12h18" stroke-dasharray="2 2"/></svg>Пломба</button>
    </div>`;
  html += list.length ? `<div class="layers">${[...list].reverse().map(t => `<div class="layer ${t.id === sel.sticker ? 'on' : ''} ${t.visible ? '' : 'hidden'}" data-id="${t.id}">
      <span class="th">${kindIcon(t)}</span><span class="ln">${esc(t.text || STICKER_KIND[t.kind])} · ${fmt(t.w)}×${fmt(stickerSize(t)[1])} мм</span>
      <span class="badge">${esc(faceLabel(o, t.face))}</span>
      <span class="acts"><button data-a="vis" aria-label="Видимость">${t.visible ? ICON.eye : ICON.eyeOff}</button><button data-a="dup" aria-label="Дублировать">${ICON.copy}</button><button data-a="del" aria-label="Удалить">${ICON.trash}</button></span></div>`).join('')}</div>`
    : `<div class="empty">Наклеек пока нет. Круг, прямоугольник или своя форма из PNG/SVG с прозрачным фоном.</div>`;
  if (st) {
    const custom = st.kind === 'custom';
    html += `<div class="sec-h" style="margin-top:6px"><h2>Наклейка</h2></div>
      <div class="field wide"><span class="fl">Форма</span><select data-k="kind">${Object.entries(STICKER_KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      ${rangeField(st.kind === 'circle' ? 'Ширина (Ø), мм' : 'Ширина, мм', 'w', 5, 400, .5)}
      ${custom ? '' : rangeField('Высота, мм', 'h', 5, 400, .5)}
      ${st.kind === 'rect' ? rangeField('Скругление, мм', 'radius', 0, 60, .5) : ''}
      ${custom ? `<div class="row"><button class="btn sm" id="stShape">${st.src ? 'Заменить форму…' : 'Загрузить форму…'}</button></div>${vecColorsHTML(st.src, st.recolor)}${rangeField('Белая окантовка, мм', 'outline', 0, 10, .1)}`
        : `<div class="row"><span class="hint">Фон</span><input type="color" data-k="fill" aria-label="Цвет наклейки"><label class="check"><input type="checkbox" data-k="clear"> Без фона</label></div>
           <div class="row"><span class="hint">Обводка</span><input type="color" data-k="stroke" aria-label="Цвет обводки"><span class="grow"></span></div>${rangeField('Обводка, мм', 'strokeW', 0, 10, .1)}
           <div class="row"><button class="btn sm" id="stImg">${st.src ? 'Заменить логотип…' : 'Логотип…'}</button>${st.src ? '<button class="btn sm" id="stImgOff">Убрать</button>' : ''}</div>
           ${st.src ? rangeField('Логотип, %', 'imgScale', 10, 100, 1, 100) + vecColorsHTML(st.src, st.recolor) : ''}`}
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
  $('#stCircle').onclick = () => addSticker(newSticker('circle', sel.face && faceKeys(o).includes(sel.face) ? sel.face : faceKeys(o)[0]));
  $('#stRect').onclick = () => addSticker(newSticker('rect', sel.face && faceKeys(o).includes(sel.face) ? sel.face : faceKeys(o)[0]));
  $('#stSeal').onclick = () => addSticker(newSticker('rect', 'front', { ...sealSpot(o), w: 22, h: o.type === 'dome' || o.type === 'torte' ? 80 : 50, radius: 2, text: '', fill: '#f3ead6', stroke: '#b8461b', strokeW: .8, finish: 'gloss' }));
  $('#stCustom').onclick = () => pickImage(async file => {
    const r = await importImageFile(file);
    addSticker(newSticker('custom', sel.face && faceKeys(o).includes(sel.face) ? sel.face : faceKeys(o)[0], { src: r.id, aspect: r.aspect, w: 50, outline: 1.5 }));
  });
  $$('#stickerSec .layer').forEach(el => el.onclick = e => {
    const a = e.target.closest('button')?.dataset.a, t = o.stickers.find(x => x.id === el.dataset.id); if (!t) return;
    if (a === 'del') return deleteSticker(t.id);
    if (a === 'vis') { t.visible = !t.visible; touchSticker(o, t); renderStickers(); return commit(); }
    if (a === 'dup') return duplicateSticker(t.id);
    sel.sticker = t.id; sel.layer = null; renderLayers(); renderLayerProps(); renderStickers();
  });
  if (!st) return;
  bindFields(sec, activeSticker, k => {
    const t = activeSticker(); if (!t) return;
    if (k === 'kind' && t.kind === 'custom' && !t.src) { $('#stShape')?.click(); }
    if (k === 'kind' || k === 'face' || k === 'text') { touchSticker(o, t); return renderStickers(); }
    touchSticker(o, t);
  });
  $('#stDel').onclick = () => deleteSticker(st.id);
  $('#stSealPos').onclick = () => { Object.assign(st, sealSpot(o)); touchSticker(o, st); renderStickers(); commit(); };
  const pickInto = (key, after) => pickImage(async file => { const r = await importImageFile(file); st[key] = r.id; if (after) after(r); touchSticker(o, st); renderStickers(); commit(); });
  $('#stShape') && ($('#stShape').onclick = () => pickInto('src', r => { st.aspect = r.aspect; }));
  $('#stImg') && ($('#stImg').onclick = () => pickInto('src'));
  $('#stImgOff') && ($('#stImgOff').onclick = () => { st.src = null; touchSticker(o, st); renderStickers(); commit(); });
  bindVecColors(sec, activeSticker, t => { const look = RT.get(o.id)?.stickerLook?.get(t.id); if (look) look.key = ''; touchSticker(o, t); });
}

export { addSticker, deleteSticker, duplicateSticker, renderStickers };
