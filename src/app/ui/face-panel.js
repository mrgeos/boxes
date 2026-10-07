// Правая панель: грани, слои и их свойства
import { $, $$, esc, fmt, toast, uid } from '../core/util.js';
import { BLENDS, EFFECTS, EFFECT_SHORT, ICON, SWATCHES } from '../core/constants.js';
import { activeFaceData, activeLayer, activeObj, assets, sel, state } from '../core/state.js';
import { faceKeys, faceLabel, faceMM, facePx, netLayout, newImage } from '../core/model.js';
import { getImg, importImageFile } from '../core/assets.js';
import { hasRecolor, vecColors } from '../core/vector.js';
import { allFonts, ensureFont } from '../core/fonts.js';
import { RT, applyObjMaterials, markFace, ui } from '../scene/renderer.js';
import { select, selectLayer } from '../core/selection.js';
import { commit } from '../core/project.js';
import { bindFields, rangeField, refreshFields } from './fields.js';
import { MASKS, cropped, editMode, hasPanels, resetCrop, setClipBelow, setClipTo, setEditMode, setMask } from '../core/mask.js';
import { invalidate } from '../scene/camera.js';

function renderFaceTabs() {
  const o = activeObj();
  $('#objBadge').textContent = o ? o.name : '';
  $('#faceTabs').innerHTML = o ? faceKeys(o).map(k => `<button class="chip ${k === sel.face ? 'on' : ''}" data-f="${k}">${faceLabel(o, k)}${o.faces[k].layers.length ? `<span class="cnt">${o.faces[k].layers.length}</span>` : ''}</button>`).join('') : '';
  $$('#faceTabs .chip').forEach(b => b.onclick = () => select(sel.obj, b.dataset.f, null, { flash: true }));
  const sel2 = $('#copyTarget');
  sel2.innerHTML = o ? `<option value="">Скопировать дизайн на…</option><option value="*">все внешние грани</option>` + faceKeys(o).filter(k => k !== sel.face).map(k => `<option value="${k}">${faceLabel(o, k)}</option>`).join('') : '';
}
function updateFaceMeta() {
  const o = activeObj(); if (!o || !sel.face) { $('#faceMeta').textContent = ''; return; }
  const [mw, mh] = faceMM(o, sel.face), [pw, ph] = facePx(o, sel.face);
  $('#faceMeta').innerHTML = `<span>${faceLabel(o, sel.face)} · ${fmt(mw, 1)} × ${fmt(mh, 1)} мм</span><span>превью ${pw}×${ph} px</span>`;
  const n = netLayout(o); $('#netSize').textContent = `${fmt(n.W)} × ${fmt(n.H)} мм`;
}
function renderFacePanel() {
  const f = activeFaceData();
  $('#faceBg').value = f ? f.bg : '#ffffff';
  $('#bgSwatches').innerHTML = SWATCHES.map(c => `<button class="sw" style="background:${c}" data-c="${c}" title="${c}" aria-label="Фон ${c}"></button>`).join('');
  $$('#bgSwatches .sw').forEach(b => b.onclick = () => setFaceBg(b.dataset.c, true));
  $('#dielineOffBtn').hidden = !activeObj()?.dieline;
  updateFaceMeta();
}
function setFaceBg(c, doCommit) {
  const o = activeObj(), f = activeFaceData(); if (!f) return;
  f.bg = c; $('#faceBg').value = c; markFace(o, sel.face);
  if (sel.face === 'inside' || sel.face === 'flap' || sel.face === 'sleeve') applyObjMaterials(o);
  if (doCommit) commit();
}
function layerName(L) {
  if (L.type === 'text') return L.text.split('\n')[0] || 'Текст';
  if (L.type === 'image') return 'Изображение';
  return L.kind === 'ellipse' ? 'Круг' : 'Плашка';
}
function imageDpi(o, L) {
  const im = getImg(L.src); if (!im) return null;
  const [mw] = faceMM(o, sel.face); const widthMM = L.w * mw;
  return Math.round(im.naturalWidth / (widthMM / 25.4));
}
function renderLayers() {
  const o = activeObj(), f = activeFaceData(), box = $('#layers');
  if (!f) { box.innerHTML = ''; return; }
  if (!f.layers.length) { box.innerHTML = `<div class="empty">На этой грани пока только фон. Добавьте картинку, текст или плашку — или перетащите файл на грань в 3D.</div>`; return; }
  box.innerHTML = [...f.layers].reverse().map(L => {
    let th = '';
    if (L.type === 'image') th = `<span class="th" data-src="${L.src}"></span>`;
    else if (L.type === 'text') th = `<span class="th" style="color:${L.color};font-family:'${esc(L.font)}'">Aa</span>`;
    else th = `<span class="th" style="color:${L.fill}">${L.kind === 'ellipse' ? ICON.ell : ICON.rect}</span>`;
    const dpi = L.type === 'image' ? imageDpi(o, L) : null;
    const badge = L.effect !== 'none' ? `<span class="badge">${EFFECT_SHORT[L.effect]}</span>`
      : dpi != null ? `<span class="badge ${dpi < 150 ? 'warn' : 'ok'} mono" title="Разрешение при печати">${dpi} dpi</span>` : '';
    const cut = (L.mask ? ' · маска' : '') + (cropped(L) ? ' · кадр' : '') + (L.clipTo ? ' · обрезан' : '');
    return `<div class="layer ${L.id === sel.layer ? 'on' : ''} ${L.visible ? '' : 'hidden'} ${L.clipBelow ? 'clipped' : ''}" data-id="${L.id}" ${cut || L.clipBelow ? `title="${L.clipBelow ? 'Обтравка по слою ниже' : ''}${cut}"` : ''}>
      ${L.clipBelow ? '<span class="clip-mark" aria-hidden="true">↳</span>' : ''}${th}<span class="ln">${esc(layerName(L))}</span>${badge}
      <span class="acts">
        <button data-a="vis" title="${L.visible ? 'Скрыть' : 'Показать'}" aria-label="Видимость">${L.visible ? ICON.eye : ICON.eyeOff}</button>
        <button data-a="up" title="Выше" aria-label="Выше">${ICON.up}</button>
        <button data-a="down" title="Ниже" aria-label="Ниже">${ICON.down}</button>
        <button data-a="dup" title="Дублировать (Ctrl+D)" aria-label="Дублировать">${ICON.copy}</button>
        <button data-a="del" title="Удалить (Delete)" aria-label="Удалить">${ICON.trash}</button>
      </span></div>`;
  }).join('');
  $$('#layers .th[data-src]').forEach(t => { const u = assets[t.dataset.src]; if (u) t.style.backgroundImage = `url("${u}")`; });
  $$('#layers .layer').forEach(el => {
    el.onclick = e => {
      const a = e.target.closest('button')?.dataset.a, id = el.dataset.id;
      if (!a) return selectLayer(id);
      const i = f.layers.findIndex(l => l.id === id), L = f.layers[i];
      if (a === 'vis') L.visible = !L.visible;
      if (a === 'up' || a === 'down') return moveLayer(id, a === 'up' ? 1 : -1);
      if (a === 'dup') return duplicateLayer(id);
      if (a === 'del') return deleteLayer(id);
      markFace(o, sel.face); renderLayers(); commit();
    };
  });
}
function renderLayerProps() {
  const sec = $('#layerSec'), L = activeLayer(), o = activeObj();
  if (!L) { sec.innerHTML = `<div class="sec-h"><h2>Слой</h2></div><p class="hint">Выберите слой в списке, в окне грани или кликом по модели. Стрелки сдвигают слой, Shift+стрелки — сильнее.</p>`; return; }
  const effOpts = Object.entries(EFFECTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  let html = `<div class="sec-h"><h2>Слой: ${esc(layerName(L)).slice(0, 24)}</h2><span class="badge">${faceLabel(o, sel.face)}</span></div>`;
  if (L.type === 'text') {
    html += `<textarea data-k="text" rows="2" aria-label="Текст"></textarea>
      <div class="grid2"><select data-k="font" aria-label="Шрифт">${allFonts().map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select>
      <select data-k="weight" aria-label="Насыщенность"><option value="400">Обычный</option><option value="500">Средний</option><option value="700">Жирный</option><option value="900">Сверхжирный</option></select></div>
      <div class="row"><input type="color" data-k="color" aria-label="Цвет текста"><select data-k="align" class="grow" aria-label="Выравнивание"><option value="left">По левому краю</option><option value="center">По центру</option><option value="right">По правому краю</option></select>
      <label class="check"><input type="checkbox" data-k="italic"> Курсив</label></div>
      ${rangeField('Кегль, % выс.', 'size', .5, 80, .1, 100)}${rangeField('Трекинг', 'ls', -10, 80, 1, 100)}${rangeField('Интерлиньяж', 'lh', .7, 2.5, .01)}`;
  } else if (L.type === 'image') {
    const dpi = imageDpi(o, L);
    html += `<div class="row"><button class="btn sm" id="imgReplace">Заменить…</button><button class="btn sm" id="imgCover">Залить грань</button><button class="btn sm" id="imgFit">Вписать</button></div>
      <div class="row"><label class="check"><input type="checkbox" data-k="flipX"> Отразить ↔</label><label class="check"><input type="checkbox" data-k="flipY"> Отразить ↕</label></div>
      ${vecColorsHTML(L.src, L.recolor)}
      <label class="check"><input type="checkbox" data-k="tile"> Повторять узором</label>
      ${rangeField(L.tile ? 'Размер плитки, %' : 'Ширина, %', 'w', 1, 400, .1, 100)}
      ${dpi != null ? `<p class="hint">При печати этого размера: <b class="mono">${dpi} dpi</b>${dpi < 150 ? ' — мало для офсета, нужно от 300 dpi' : dpi < 300 ? ' — допустимо, для офсета лучше 300 dpi' : ' — подходит для печати'}.</p>` : ''}`;
  } else {
    html += `<div class="row"><input type="color" data-k="fill" aria-label="Цвет"><select data-k="kind" class="grow" aria-label="Форма"><option value="rect">Прямоугольник</option><option value="ellipse">Эллипс</option></select></div>
      ${rangeField('Ширина, %', 'w', 1, 200, .1, 100)}${rangeField('Высота, %', 'h', 1, 200, .1, 100)}
      ${L.kind === 'rect' ? rangeField('Скругление', 'radius', 0, 100, 1, 100) : ''}${rangeField('Контур (0 — заливка)', 'stroke', 0, 100, 1, 1000)}`;
  }
  html += `${rangeField('Центр X, %', 'x', -50, 150, .1, 100)}${rangeField('Центр Y, %', 'y', -50, 150, .1, 100)}${rangeField('Поворот, °', 'rot', -180, 180, 1)}${rangeField('Непрозрачность', 'opacity', 0, 100, 1, 100)}
    ${!(L.type === 'image' && L.tile) && Object.keys(RT.get(o.id)?.frames || {}).length ? '<label class="check" title="Часть слоя за краем грани печатается на соседних гранях, через сгиб. Включается сама, если тянуть слой через ребро на модели"><input type="checkbox" data-k="wrap"> Переходит через рёбра на соседние грани</label>' : ''}
    <div class="field wide"><span class="fl">Отделка</span><select data-k="effect">${effOpts}</select></div>
    <div class="field wide"><span class="fl">Наложение</span><select data-k="blend">${Object.entries(BLENDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    ${cropHTML(o, L)}
    <div class="grid2"><button class="btn sm" id="centerBtn">По центру</button><button class="btn sm danger" id="delLayerBtn">Удалить слой</button></div>`;
  sec.innerHTML = html;
  bindFields(sec, activeLayer, (k) => {
    const L = activeLayer();
    if (k === 'weight') L.weight = +L.weight;
    if (k === 'font' || k === 'weight' || k === 'italic') ensureFont(L);
    if (k === 'text' || k === 'effect') ui.layers = true;
    if (k === 'kind' || k === 'tile') renderLayerProps();
    if (k === 'w' && L.type === 'image') ui.layers = true;
    markFace(activeObj(), sel.face);
  });
  bindCrop(o, L);
  $('#centerBtn').onclick = () => { const L = activeLayer(); L.x = .5; L.y = .5; markFace(o, sel.face); refreshFields(sec, L); commit(); };
  $('#delLayerBtn').onclick = () => deleteLayer(L.id);
  if (L.type === 'image') {
    $('#imgReplace').onclick = () => pickImage(async file => { const r = await importImageFile(file); const L = activeLayer(); L.src = r.id; L.aspect = r.aspect; L.recolor = {}; markFace(o, sel.face); renderLayers(); renderLayerProps(); commit(); });
    bindVecColors(sec, activeLayer, () => { markFace(o, sel.face); ui.layers = true; });
    $('#imgCover').onclick = () => fitImage(true);
    $('#imgFit').onclick = () => fitImage(false);
  }
}
/* the layer's cut: crop frame of a picture, a mask shape, clipping to the layer below, to the face or the panel */
function cropHTML(o, L) {
  const m = L.mask, mode = editMode(), f = activeFaceData(), bottom = f.layers.indexOf(L) === 0;
  const opt = (v, t, cur) => `<option value="${v}" ${v === (cur || '') ? 'selected' : ''}>${t}</option>`;
  return `<div class="cut"><h3>Обрезка</h3>
    ${L.type === 'image' && !L.tile ? `<div class="row"><button class="btn sm ${mode === 'crop' ? 'on' : ''}" id="cropBtn" title="Двойной клик по картинке в окне грани или на модели">${mode === 'crop' ? 'Готово' : 'Кадрировать'}</button>${cropped(L) ? '<button class="btn sm" id="cropReset">Сбросить кадр</button>' : ''}</div>` : ''}
    <div class="row"><select id="maskKind" class="grow" aria-label="Маска">${opt('', 'Без маски', m?.kind)}${Object.entries(MASKS).map(([k, t]) => opt(k, 'Маска: ' + t.toLowerCase(), m?.kind)).join('')}</select>
      ${m ? `<button class="btn sm ${mode === 'mask' ? 'on' : ''}" id="maskEdit">${mode === 'mask' ? 'Готово' : 'Править'}</button>` : ''}</div>
    ${m?.kind === 'rect' ? rangeField('Скругление', 'mask.r', 0, 100, 1, 100) : ''}
    ${m?.kind === 'polygon' ? rangeField('Углов', 'mask.n', 3, 16, 1) : ''}
    ${m?.kind === 'star' ? rangeField('Лучей', 'mask.n', 3, 24, 1) + rangeField('Глубина лучей, %', 'mask.inner', 5, 95, 1, 100) : ''}
    <label class="check" title="${bottom ? 'Под этим слоем нет других' : 'Слой виден только там, где есть слой под ним (как обтравочная маска в Photoshop)'}"><input type="checkbox" id="clipBelow" ${L.clipBelow ? 'checked' : ''} ${bottom ? 'disabled' : ''}> Обтравка по слою ниже</label>
    <div class="field wide"><span class="fl">Обрезать по</span><select id="clipTo">${opt('', 'не обрезать', L.clipTo)}${opt('face', 'краю грани', L.clipTo)}${hasPanels(o, sel.face) ? opt('panel', 'панели ленты', L.clipTo) : ''}</select></div></div>`;
}
function bindCrop(o, L) {
  const k = sel.face, done = () => { ui.editor = true; ui.layers = true; renderLayerProps(); commit(); };
  const toggle = mode => { setEditMode(editMode() === mode ? null : mode); ui.editor = true; invalidate(); renderLayerProps(); };
  $('#cropBtn') && ($('#cropBtn').onclick = () => toggle('crop'));
  $('#cropReset') && ($('#cropReset').onclick = () => { resetCrop(o, k, L); setEditMode(null); done(); });
  $('#maskEdit') && ($('#maskEdit').onclick = () => toggle('mask'));
  $('#maskKind').onchange = e => { setMask(o, k, L, e.target.value || null); setEditMode(e.target.value ? 'mask' : null); done(); };
  $('#clipBelow').onchange = e => { setClipBelow(o, k, L, e.target.checked); done(); };
  $('#clipTo').onchange = e => { setClipTo(o, k, L, e.target.value || null); done(); };
}
function fitImage(cover) {
  const o = activeObj(), L = activeLayer(); if (!L || L.type !== 'image') return;
  const [W, H] = facePx(o, sel.face); const im = getImg(L.src); const a = im ? im.naturalWidth / im.naturalHeight : L.aspect;
  const wpx = cover ? Math.max(W, H * a) : Math.min(W, H * a);
  L.w = wpx / W; L.x = .5; L.y = .5; L.rot = 0;
  markFace(o, sel.face); renderLayerProps(); ui.layers = true; commit();
}
/* ---------- layer ops ---------- */
function addLayer(L, face = sel.face, obj = activeObj()) {
  if (!obj || !face) return;
  obj.faces[face].layers.push(L);
  if (obj.id !== sel.obj || face !== sel.face) select(obj.id, face, L.id, { flash: true });
  else { sel.layer = L.id; renderLayers(); renderLayerProps(); renderFaceTabs(); }
  markFace(obj, face); commit();
}
function deleteLayer(id) {
  const o = activeObj(), f = activeFaceData(); if (!f) return;
  f.layers = f.layers.filter(l => l.id !== id);
  if (sel.layer === id) sel.layer = null;
  markFace(o, sel.face); renderLayers(); renderLayerProps(); renderFaceTabs(); commit();
}
/* one step up (1) or down (-1) in the face's layers: up is drawn over the others */
function moveLayer(id, step) {
  const o = activeObj(), f = activeFaceData(), i = f?.layers.findIndex(l => l.id === id) ?? -1, j = i + step;
  if (i < 0 || j < 0 || j >= f.layers.length) return;
  [f.layers[i], f.layers[j]] = [f.layers[j], f.layers[i]];
  markFace(o, sel.face); renderLayers(); commit();
}
function duplicateLayer(id) {
  const o = activeObj(), f = activeFaceData(); const L = f?.layers.find(l => l.id === id); if (!L) return;
  const c = { ...structuredClone(L), id: uid(), x: L.x + .03, y: L.y + .03 };
  f.layers.splice(f.layers.indexOf(L) + 1, 0, c); sel.layer = c.id;
  markFace(o, sel.face); renderLayers(); renderLayerProps(); renderFaceTabs(); commit();
}
async function addImageToFace(file, obj = activeObj(), face = sel.face, at = null) {
  if (!file || !file.type.startsWith('image/')) { toast('Нужен файл изображения: PNG, JPG, SVG или WebP'); return; }
  try {
    const r = await importImageFile(file);
    const L = newImage(r.id, r.aspect);
    const [W, H] = facePx(obj, face);
    L.w = Math.min(.6, (H * .6 * r.aspect) / W);
    if (at) { L.x = at[0]; L.y = at[1]; }
    addLayer(L, face, obj);
  } catch { toast('Не удалось прочитать изображение'); }
}
let pickCb = null;
function pickImage(cb) { pickCb = cb; $('#imgInput').value = ''; $('#imgInput').click(); }
/* ---------- vector colours: one row per colour of the SVG, swapped per layer / sticker ---------- */
function vecColorsHTML(srcId, rc) {
  const cols = vecColors(srcId); if (!cols.length) return '';
  const shown = cols.slice(0, 16);
  return `<div class="field wide"><span class="fl">Цвета вектора</span><div class="vcols">${shown.map(c => `<label class="vc" title="${c}"><span class="sw" style="background:${c}"></span>→<input type="color" data-vc="${c}" value="${rc?.[c] || c}" aria-label="Заменить ${c}"></label>`).join('')}</div></div>
    <div class="row"><span class="hint">Всё одним цветом</span><input type="color" id="vcAll" value="${rc?.[cols[0]] || cols[0]}" aria-label="Перекрасить всё"><button class="btn sm" id="vcReset" ${hasRecolor(rc) ? '' : 'disabled'}>Исходные цвета</button></div>
    ${cols.length > shown.length ? `<p class="hint">Показаны 16 главных цветов из ${cols.length}; «Всё одним цветом» перекрашивает все.</p>` : ''}`;
}
function bindVecColors(root, getT, onChange) {
  const cols = () => vecColors(getT()?.src), set = (rc, done) => { const t = getT(); if (!t) return; t.recolor = rc; onChange(t); if (done) commit(); };
  $$('[data-vc]', root).forEach(inp => {
    const go = done => { const t = getT(); const rc = { ...(t.recolor || {}) }; if (inp.value.toLowerCase() === inp.dataset.vc) delete rc[inp.dataset.vc]; else rc[inp.dataset.vc] = inp.value.toLowerCase(); set(rc, done); };
    inp.addEventListener('input', () => go(false)); inp.addEventListener('change', () => go(true));
  });
  const all = $('#vcAll', root);
  if (all) {
    const go = done => { const rc = Object.fromEntries(cols().map(c => [c, all.value.toLowerCase()])); set(rc, done); $$('[data-vc]', root).forEach(i => { i.value = all.value; }); };
    all.addEventListener('input', () => go(false)); all.addEventListener('change', () => { go(true); });
  }
  const rs = $('#vcReset', root); if (rs) rs.onclick = () => { set({}, true); $$('[data-vc]', root).forEach(i => { i.value = i.dataset.vc; }); rs.disabled = true; };
}
function renderFonts() {
  $('#fontList').innerHTML = state.fonts.map(f => `<span class="chip" style="font-family:'${esc(f.name)}'">${esc(f.name)}</span>`).join('');
}

/* hooks up the image picker */
function initFacePanel() {
  $('#imgInput').onchange = e => { const f = e.target.files[0]; if (f && pickCb) pickCb(f); };
}

export { addImageToFace, addLayer, bindVecColors, deleteLayer, duplicateLayer, initFacePanel, moveLayer, pickImage, renderFacePanel, renderFaceTabs, renderFonts, renderLayerProps, renderLayers, setFaceBg, updateFaceMeta, vecColorsHTML };
