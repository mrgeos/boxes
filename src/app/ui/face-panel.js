// Правая панель: грани, слои и их свойства
import { $, $$, esc, fmt, toast } from '../core/util.js';
import { BLENDS, EFFECTS, ICON, SWATCHES } from '../core/constants.js';
import { activeFaceData, activeLayer, activeObj, assets, sel, state } from '../core/state.js';
import { faceKeys, faceLabel, faceMM, facePx, isClearFace, newImage } from '../core/model.js';
import { getImg, importImageFile } from '../core/assets.js';
import { library } from '../core/library.js';
import { extraById, extraName, isPart } from '../core/extras.js';
import { viewNet } from '../net/net-view.js';
import { drawLayer, layerBox } from '../faces/render.js';
import { openMenu } from './menu.js';
import { pickAsset } from './asset-picker.js';
import { FONT_ROLES, kit, linkOf, setLink } from '../core/brand.js';
import { swapImage } from './library-panel.js';
import { NONE, addKeyout, hasColorEdits, hasRecolor, removeKeyout, setKeyoutTol, setVecColor, vecColors } from '../core/vector.js';
import { allFonts, ensureFont } from '../core/fonts.js';
import { RT, markFace, ui } from '../scene/renderer.js';
import { pickLayers, select } from '../core/selection.js';
import { addBackgroundImage, bgToAllFaces, clearFace, imageFitOf, selectBg, setFaceBg, setFaceBgGrad, setImageFit, alignLayers, deleteLayers, distributeLayers, duplicateLayers, groupLayers, groupOf, placeLayers, ungroupLayers, unitsOf, renameItem, selectedIds, selectedLayers, setGradient, setLayerSelection, setLocked, setVisible, shiftLayers } from '../core/layers.js';
import { commit } from '../core/project.js';
import { bindFields, rangeField } from './fields.js';
import { MASKS, cropped, editMode, hasPanels, resetCrop, setClipBelow, setClipTo, setEditMode, setMask } from '../core/mask.js';
import { invalidate } from '../scene/camera.js';

function renderFaceTabs() {
  const o = activeObj();
  $('#objBadge').textContent = o ? (sel.part ? extraName(o, extraById(o, sel.part) || { kind: sel.part, T: {} }) : o.name) : '';
  // the faces of the object itself, or the one face of the sleeve or carrier picked
  const keys = o ? (sel.part ? [sel.part] : faceKeys(o).filter(k => !isPart(k))) : [];
  $('#faceTabs').hidden = keys.length < 2;
  $('#faceTabs').innerHTML = o ? keys.map(k => `<button class="chip ${k === sel.face ? 'on' : ''}" data-f="${k}">${faceLabel(o, k)}${o.faces[k].layers.length ? `<span class="cnt">${o.faces[k].layers.length}</span>` : ''}</button>`).join('') : '';
  $$('#faceTabs .chip').forEach(b => b.onclick = () => select(sel.obj, b.dataset.f, null, { flash: true }));
  const sel2 = $('#copyTarget');
  sel2.innerHTML = o ? `<option value="">Скопировать дизайн на…</option><option value="*">все внешние грани</option>` + faceKeys(o).filter(k => k !== sel.face).map(k => `<option value="${k}">${faceLabel(o, k)}</option>`).join('') : '';
}
function updateFaceMeta() {
  const o = activeObj(); if (!o || !sel.face) { $('#faceMeta').textContent = ''; return; }
  const [mw, mh] = faceMM(o, sel.face), [pw, ph] = facePx(o, sel.face);
  $('#faceMeta').innerHTML = `<span>${faceLabel(o, sel.face)} · ${fmt(mw, 1)} × ${fmt(mh, 1)} мм</span><span>превью ${pw}×${ph} px</span>`;
  const n = viewNet(o); $('#netSize').textContent = `${fmt(n.W)} × ${fmt(n.H)} мм`;
}
function renderFacePanel() {
  $('#dielineOffBtn').hidden = !activeObj()?.dieline;
  updateFaceMeta();
}
function layerName(L) {
  if (L.name) return L.name;
  if (L.type === 'text') return L.text.split('\n')[0] || 'Текст';
  if (L.type === 'image') return library.find(it => it.id === L.src)?.name || 'Изображение';
  return L.kind === 'ellipse' ? 'Круг' : 'Плашка';
}
function imageDpi(o, L) {
  const im = getImg(L.src); if (!im) return null;
  const [mw] = faceMM(o, sel.face); const widthMM = L.w * mw;
  return Math.round(im.naturalWidth / (widthMM / 25.4));
}
/* the face's layers, top first, as in Figma: groups with their layers under them (folded or not), several picked
   with Shift (a run) or Ctrl/Cmd (one more), dragged to another place or into a group, renamed by a double click */
const folded = new Set();
let drag = null;
function renderLayers() {
  const o = activeObj(), f = activeFaceData(), box = $('#layers');
  if (!f) { box.innerHTML = ''; return; }
  const picked = new Set(selectedIds()), rows = [], seen = new Set();
  if (!f.layers.length) rows.push(`<div class="empty">Добавьте картинку, текст или плашку — или перетащите файл на грань в 3D.</div>`);
  for (const L of [...f.layers].reverse()) {
    if (L.group && !seen.has(L.group)) {
      seen.add(L.group);
      const ms = f.layers.filter(l => l.group === L.group), all = ms.every(l => picked.has(l.id)), vis = ms.some(l => l.visible);
      rows.push(`<div class="layer grp ${all ? 'on' : ''} ${vis ? '' : 'hidden'}" data-g="${L.group}" style="--d:0" draggable="true">
        <button class="tw" data-a="fold" aria-label="${folded.has(L.group) ? 'Развернуть' : 'Свернуть'}">${folded.has(L.group) ? '▸' : '▾'}</button>
        <span class="th">${ICON_GROUP}</span><span class="ln">${esc(f.groups?.[L.group] || 'Группа')}</span><span class="badge">${ms.length}</span>
        <span class="acts">${rowActs(vis, ms.every(l => l.locked))}</span></div>`);
    }
    if (L.group && folded.has(L.group)) continue;
    const mods = layerMods(o, L).map(m => `<button class="mod ${m.cls || ''}" data-a="mod" data-to="${esc(m.to)}" title="${esc(m.t)}" aria-label="${esc(m.t)}">${ICON[m.i]}</button>`).join('');
    rows.push(`<div class="layer ${picked.has(L.id) ? 'on' : ''} ${L.id === sel.layer && picked.size > 1 ? 'main' : ''} ${L.visible ? '' : 'hidden'} ${L.locked ? 'locked' : ''} ${L.clipBelow ? 'clipped' : ''} ${L.group ? 'in-grp' : ''}" data-id="${L.id}" style="--d:${L.group ? 1 : 0}" draggable="true">
      <span class="tw" ${L.clipBelow ? 'title="Обтравка по слою ниже"' : 'aria-hidden="true"'}>${L.clipBelow ? '↳' : ''}</span>${thumbHTML(L)}<span class="ln">${esc(layerName(L))}</span><span class="mods">${mods}</span>
      <span class="acts">${rowActs(L.visible, L.locked)}</span></div>`);
  }
  // the background: always the bottom row (a clear PET face has none)
  if (!isClearFace(o, sel.face)) rows.push(bgRowHTML(f));
  box.innerHTML = rows.join('');
  const bgRow = $('#layers .bgrow');
  if (bgRow) {
    bgRow.onclick = () => { selectBg(); renderLayers(); renderLayerProps(); ui.editor = true; };
    bgRow.oncontextmenu = e => { e.preventDefault(); bgMenu(o, e.clientX, e.clientY); };
  }
  $$('#layers canvas.th').forEach(c => drawThumb(c, o, f.layers.find(l => l.id === c.closest('.layer').dataset.id)));
  const unitOf = el => el.dataset.g ? f.layers.filter(l => l.group === el.dataset.g) : f.layers.filter(l => l.id === el.dataset.id);
  // the rows' layers top first, for a Shift run
  const order = () => [...f.layers].reverse().map(l => l.id);
  $$('#layers .layer:not(.bgrow)').forEach(el => {
    el.onclick = e => {
      const a = e.target.closest('button')?.dataset.a, unit = unitOf(el);
      if (a === 'fold') { const g = el.dataset.g; folded.has(g) ? folded.delete(g) : folded.add(g); return renderLayers(); }
      if (a === 'mod') { pickLayers(unit.map(l => l.id), el.dataset.id); return revealProp(e.target.closest('button').dataset.to); }
      if (a) return rowAction(o, f, unit, a);
      // a double click renames the layer or the group (the first click redrew the list, so no dblclick comes:
      // the second click's count tells it)
      if (e.detail === 2 && !e.shiftKey && !e.ctrlKey && !e.metaKey) return renameRow(o, f, el);
      const ids = unit.map(l => l.id);
      if (e.shiftKey && sel.layer) {
        // a run from the main layer to this row
        const ord = order(), i = ord.indexOf(sel.layer), j = Math.max(...ids.map(id => ord.indexOf(id))), k = Math.min(...ids.map(id => ord.indexOf(id)));
        const run = ord.slice(Math.min(i, k), Math.max(i, j) + 1);
        return pickLayers(f.layers.filter(l => run.includes(l.id)).map(l => l.id), sel.layer);
      }
      if (e.ctrlKey || e.metaKey) {
        const cur = new Set(selectedIds()), on = ids.every(id => cur.has(id));
        for (const id of ids) on ? cur.delete(id) : cur.add(id);
        return pickLayers(f.layers.filter(l => cur.has(l.id)).map(l => l.id));
      }
      pickLayers(ids, el.dataset.g ? ids.at(-1) : el.dataset.id);
    };
    el.oncontextmenu = e => { e.preventDefault(); rowMenu(o, f, el, e.clientX, e.clientY); };
    el.ondragstart = e => {
      const unit = unitOf(el), sel_ = selectedLayers(f), whole = !!el.dataset.g;
      drag = { Ls: !whole && unit.every(l => sel_.includes(l)) ? sel_ : unit, whole };
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'layers'); el.classList.add('dragging');
    };
    el.ondragend = () => { drag = null; $$('#layers .layer').forEach(r => r.classList.remove('dragging', 'drop-above', 'drop-below')); };
    el.ondragover = e => {
      if (!drag) return; e.preventDefault();
      const r = el.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
      $$('#layers .layer').forEach(q => q.classList.remove('drop-above', 'drop-below'));
      el.classList.add(above ? 'drop-above' : 'drop-below');
    };
    el.ondrop = e => {
      if (!drag) return; e.preventDefault();
      const above = el.classList.contains('drop-above'); dropRows(o, f, el, above); drag = null;
    };
  });
}
const ICON_GROUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
/* the row's own buttons, as in Figma: lock and eye show on hover, and stay while the layer is locked or hidden;
   the rest (order, duplicate, delete, rename) is in the row's context menu and on keys */
const rowActs = (vis, locked) => `<button data-a="lock" class="${locked ? 'pin' : ''}" title="${locked ? 'Разблокировать' : 'Заблокировать: не выбирается и не двигается на модели и в окне грани'}" aria-label="Блокировка">${locked ? ICON.lock : ICON.unlock}</button>
  <button data-a="vis" class="${vis ? '' : 'pin'}" title="${vis ? 'Скрыть' : 'Показать'}" aria-label="Видимость">${vis ? ICON.eye : ICON.eyeOff}</button>`;
/* what is done to a layer beyond its plain look, as small marks in its row: { i: icon, t: title, to: the field it opens } */
function layerMods(o, L) {
  const m = [], dpi = L.type === 'image' && !L.tile ? imageDpi(o, L) : null;
  if (dpi != null && dpi < 300) m.push({ i: 'warn', cls: dpi < 150 ? 'bad' : 'warn', t: `${dpi} dpi при печати — ${dpi < 150 ? 'мало для офсета' : 'для офсета лучше 300 dpi'}`, to: '[data-k="w"]' });
  if (cropped(L)) m.push({ i: 'crop', t: 'Кадрирована', to: '.cut' });
  if (L.mask) m.push({ i: 'mask', t: 'Маска: ' + (MASKS[L.mask.kind] || '').toLowerCase(), to: '.cut' });
  if (L.clipTo) m.push({ i: 'clip', t: L.clipTo === 'panel' ? 'Обрезана по панели ленты' : 'Обрезана по краю грани', to: '.cut' });
  if (L.type === 'image' && L.tile) m.push({ i: 'tile', t: 'Повторяется узором', to: '[data-k="tile"]' });
  if (L.type === 'image' && hasColorEdits(L)) m.push({ i: 'recolor', t: Object.values(L.recolor || {}).includes(NONE) || L.keyout?.length ? 'Цвета заменены или убраны' : 'Цвета вектора заменены', to: L.keyout?.length ? '.kos' : '.vcols' });
  if (L.grad) m.push({ i: 'grad', t: L.grad.kind === 'radial' ? 'Радиальный градиент' : 'Линейный градиент', to: '#gradKind' });
  if (L.type === 'text' && Math.abs(L.arc || 0) >= 1) m.push({ i: 'arc', t: `По дуге ${Math.round(L.arc)}°`, to: '[data-k="arc"]' });
  if (L.wrap) m.push({ i: 'wrap', t: 'Переходит через рёбра', to: '[data-k="wrap"]' });
  if (L.effect && L.effect !== 'none') m.push({ i: 'fx', t: 'Отделка: ' + EFFECTS[L.effect], to: '[data-k="effect"]' });
  if (L.blend && L.blend !== 'source-over') m.push({ i: 'blend', t: 'Наложение: ' + BLENDS[L.blend], to: '[data-k="blend"]' });
  if (L.opacity < 1) m.push({ i: 'opacity', t: `Непрозрачность ${Math.round(L.opacity * 100)} %`, to: '[data-k="opacity"]' });
  return m;
}
/* scrolls the layer's settings to a field and flashes it */
function revealProp(to) {
  requestAnimationFrame(() => {
    const el = $('#layerSec')?.querySelector(to); if (!el) return;
    const box = el.closest('.field, .row, .cut, label') || el;
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
  });
}
/* the row's picture: the layer itself, small (a picture with its crop and mask, a plate in its fill); a text as "Aa" in its colours */
function thumbHTML(L) {
  if (L.type !== 'text') return '<canvas class="th" width="40" height="40"></canvas>';
  const g = L.grad, bg = g ? (g.kind === 'radial' ? `radial-gradient(${L.color},${g.color})` : `linear-gradient(${(g.angle ?? 90) + 90}deg,${L.color},${g.color})`) : null;
  return `<span class="th txt" style="font-family:'${esc(L.font)}';${bg ? `background-image:${bg};-webkit-background-clip:text;background-clip:text;color:transparent` : `color:${L.color}`}">Aa</span>`;
}
function drawThumb(c, o, L) {
  if (!L) return;
  const x = c.getContext('2d'), T = c.width, [W, H] = facePx(o, sel.face);
  if (L.type === 'image' && !getImg(L.src)?.complete) { const u = assets[L.src]; if (u) c.style.backgroundImage = `url("${u}")`; return; }
  const one = { ...L, x: .5, y: .5, rot: 0, opacity: 1, blend: 'source-over', visible: true, tile: false }, [w, h] = layerBox(one, W, H), sc = T * .9 / Math.max(w, h, 1);
  x.setTransform(sc, 0, 0, sc, T / 2 - sc * W / 2, T / 2 - sc * H / 2);
  drawLayer(x, one, W, H);
}
/* the row's context menu: what the row's buttons used to do, and more */
function rowMenu(o, f, el, cx, cy) {
  const unit = el.dataset.g ? f.layers.filter(l => l.group === el.dataset.g) : f.layers.filter(l => l.id === el.dataset.id);
  if (!unit.every(l => selectedIds().includes(l.id))) pickLayers(unit.map(l => l.id), el.dataset.g ? unit.at(-1).id : el.dataset.id);
  const Ls = selectedLayers(f), vis = Ls.some(l => l.visible), locked = Ls.every(l => l.locked), i = f.layers.indexOf(Ls.at(-1));
  const act = a => () => rowAction(o, f, Ls, a);
  openMenu(cx, cy, [
    { label: 'Переименовать', run: () => { const row = $(`#layers .layer[${el.dataset.g ? `data-g="${el.dataset.g}"` : `data-id="${el.dataset.id}"`}]`); if (row) renameRow(o, f, row); } },
    { label: 'Дублировать', key: 'Ctrl+D', run: act('dup') },
    { label: 'Удалить', key: 'Delete', run: act('del') },
    'sep',
    { label: 'Выше', key: 'Ctrl+]', disabled: i >= f.layers.length - 1, run: act('up') },
    { label: 'Ниже', key: 'Ctrl+[', disabled: f.layers.indexOf(Ls[0]) <= 0, run: act('down') },
    'sep',
    { label: vis ? 'Скрыть' : 'Показать', run: act('vis') },
    { label: locked ? 'Разблокировать' : 'Заблокировать', run: act('lock') },
    Ls.length > 1 && 'sep', Ls.length > 1 && { label: 'Сгруппировать', key: 'Ctrl+G', run: () => layerCmd('group') },
    Ls.some(l => l.group) && { label: 'Разгруппировать', key: 'Ctrl+Shift+G', run: () => layerCmd('ungroup') },
  ], Ls.length > 1 ? `Слоёв: ${Ls.length}` : layerName(Ls[0]));
}
/* a row's buttons act on its layer or its whole group */
function rowAction(o, f, unit, a) {
  const k = sel.face;
  if (a === 'vis') setVisible(o, k, unit, !unit.some(l => l.visible));
  if (a === 'lock') setLocked(o, k, unit, !unit.every(l => l.locked));
  if (a === 'up' || a === 'down') shiftLayers(o, k, unit, a === 'up' ? 1 : -1);
  if (a === 'dup') { const c = duplicateLayers(o, k, unit); setLayerSelection(c.map(l => l.id)); }
  if (a === 'del') { deleteLayers(o, k, unit); if (!f.layers.some(l => l.id === sel.layer)) setLayerSelection([]); renderFaceTabs(); }
  renderLayers(); renderLayerProps(); ui.editor = true; commit();
}
/* drops the dragged layers above or below a row: next to a group's layer they join that group */
function dropRows(o, f, el, above) {
  const k = sel.face, moved = new Set(drag.Ls), rest = f.layers.filter(l => !moved.has(l));
  let R = el.dataset.g ? null : f.layers.find(l => l.id === el.dataset.id), g = el.dataset.g || R?.group || null;
  if (R && moved.has(R)) return renderLayers();
  const ms = g ? rest.filter(l => l.group === g) : [];
  let at, join;
  if (drag.whole && g) {
    // a whole group goes next to another group, never into it
    at = above ? rest.indexOf(ms.at(-1)) + 1 : rest.indexOf(ms[0]); join = undefined;
  } else if (el.dataset.g) {
    // on a group's row: above it — over the group; below it — into the group at its top (or under it, folded)
    if (above) { at = rest.indexOf(ms.at(-1)) + 1; join = null; }
    else if (folded.has(g)) { at = rest.indexOf(ms[0]); join = null; }
    else { at = rest.indexOf(ms.at(-1)) + 1; join = g; }
  } else { at = rest.indexOf(R) + (above ? 1 : 0); join = drag.whole ? undefined : R.group || null; }
  if (at < 0) return renderLayers();
  placeLayers(o, k, drag.Ls, at, join);
  renderLayers(); ui.editor = true; commit();
}
function renameRow(o, f, el) {
  const ln = $('.ln', el), L = el.dataset.id && f.layers.find(l => l.id === el.dataset.id), g = el.dataset.g;
  const inp = document.createElement('input'); inp.className = 'ren'; inp.value = g ? f.groups?.[g] || 'Группа' : layerName(L);
  ln.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const end = save => { if (done) return; done = true; if (save) { renameItem(o, sel.face, g || L, inp.value.trim()); commit(); } renderLayers(); renderLayerProps(); };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') end(true); if (e.key === 'Escape') end(false); };
  inp.onblur = () => end(true); inp.onclick = e => e.stopPropagation();
}
/* align and distribute: one layer (or one group) to the face, several to their common box */
const AL = { left: ['M4 3v18M8 8h11M8 16h6', 'По левому краю (Alt+A)'], hcenter: ['M12 3v18M5 8h14M8 16h8', 'По центру по горизонтали (Alt+H)'], right: ['M20 3v18M5 8h11M10 16h6', 'По правому краю (Alt+D)'],
  top: ['M3 4h18M8 8v11M16 8v6', 'По верхнему краю (Alt+W)'], vcenter: ['M3 12h18M8 5v14M16 8v8', 'По центру по вертикали (Alt+V)'], bottom: ['M3 20h18M8 5v11M16 10v6', 'По нижнему краю (Alt+S)'] };
const DI = { x: ['M4 4v16M20 4v16M10 8v8M14 8v8', 'Распределить по горизонтали (Alt+Shift+H)'], y: ['M4 4h16M4 20h16M8 10h8M8 14h8', 'Распределить по вертикали (Alt+Shift+V)'] };
const svgI = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="${d}"/></svg>`;
function alignBarHTML(n) {
  return `<div class="abar-al" role="toolbar" aria-label="Выравнивание">${Object.entries(AL).map(([k, [d, t]]) => `<button data-al="${k}" title="${t}" aria-label="${t}">${svgI(d)}</button>`).join('')}
    <span class="sep"></span>${Object.entries(DI).map(([k, [d, t]]) => `<button data-di="${k}" title="${t}" aria-label="${t}" ${n < 3 ? 'disabled' : ''}>${svgI(d)}</button>`).join('')}</div>`;
}
/* the layer actions of the panel, for the buttons and the keys alike */
function layerCmd(cmd, arg) {
  const o = activeObj(), k = sel.face, f = activeFaceData(), Ls = selectedLayers(f); if (!o || !f || !Ls.length) return;
  if (cmd === 'align') alignLayers(o, k, Ls, arg);
  else if (cmd === 'distribute') distributeLayers(o, k, Ls, arg);
  else if (cmd === 'group') { if (unitsOf(f, Ls).length < 2) return; groupLayers(o, k, Ls); }
  else if (cmd === 'ungroup') { if (!Ls.some(l => l.group)) return; ungroupLayers(o, k, Ls.flatMap(l => groupOf(f, l))); }
  renderLayers(); renderLayerProps(); ui.editor = true; commit();
}
function bindAlignBar(sec) {
  $$('[data-al]', sec).forEach(b => { b.onclick = () => layerCmd('align', b.dataset.al); });
  $$('[data-di]', sec).forEach(b => { b.onclick = () => layerCmd('distribute', b.dataset.di); });
}
/* several layers picked: what they share */
function renderMultiProps(sec, o, Ls) {
  const f = activeFaceData(), units = unitsOf(f, Ls), grouped = Ls.some(l => l.group), main = activeLayer() || Ls.at(-1);
  const oneGroup = units.length === 1 && grouped;
  sec.innerHTML = `<div class="sec-h"><h2>${oneGroup ? esc(f.groups?.[Ls[0].group] || 'Группа') : `Выбрано слоёв: ${Ls.length}`}</h2><span class="badge">${faceLabel(o, sel.face)}</span></div>
    ${alignBarHTML(units.length)}
    <div class="grid2"><button class="btn sm" id="grpBtn" ${units.length < 2 ? 'disabled' : ''} title="Ctrl+G">Сгруппировать</button><button class="btn sm" id="ungrpBtn" ${grouped ? '' : 'disabled'} title="Ctrl+Shift+G">Разгруппировать</button></div>
    ${rangeField('Непрозрачность', 'opacity', 0, 100, 1, 100)}
    <div class="field wide"><span class="fl">Наложение</span><select data-k="blend">${Object.entries(BLENDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="grid2"><button class="btn sm" id="dupLayersBtn" title="Ctrl+D">Дублировать</button><button class="btn sm danger" id="delLayersBtn" title="Delete">Удалить</button></div>
    <p class="hint">${oneGroup ? 'Двойной клик по слою группы в окне грани или на модели выбирает его одного. ' : ''}Shift- или Ctrl-клик добавляет и убирает слой, рамка мышью в окне грани выбирает несколько, Ctrl+A — все слои грани.</p>`;
  bindAlignBar(sec);
  // a shared setting: shown as the main layer has it, set for all
  bindFields(sec, () => main, (key, v) => { for (const L of Ls) L[key] = v; markFace(o, sel.face); });
  $('#grpBtn').onclick = () => layerCmd('group');
  $('#ungrpBtn').onclick = () => layerCmd('ungroup');
  $('#dupLayersBtn').onclick = () => duplicateLayer(main.id);
  $('#delLayersBtn').onclick = () => deleteLayer(main.id);
}
function renderLayerProps() {
  const sec = $('#layerSec'), L = activeLayer(), o = activeObj(), many = selectedLayers();
  if (many.length > 1) return renderMultiProps(sec, o, many);
  if (!L && sel.bg && activeFaceData()) return renderBgProps(sec, o, activeFaceData());
  if (!L) { sec.innerHTML = `<div class="sec-h"><h2>Слой</h2></div><p class="hint">Выберите слой в списке, в окне грани или кликом по модели. Стрелки сдвигают слой, Shift+стрелки — сильнее.</p>`; return; }
  const effOpts = Object.entries(EFFECTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  // a picture's name is in its card (under the title), and its alignment under the card
  const pic = L.type === 'image';
  let html = `<div class="sec-h"><h2>${pic ? 'Картинка' : `Слой: ${esc(layerName(L)).slice(0, 24)}`}</h2><span class="badge">${faceLabel(o, sel.face)}</span></div>${pic ? '' : alignBarHTML(1)}`;
  if (L.type === 'text') {
    html += `<textarea data-k="text" rows="2" aria-label="Текст"></textarea>
      <div class="grid2"><select data-k="font" aria-label="Шрифт">${brandFontOpts()}<optgroup label="Все шрифты">${allFonts().map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}</optgroup></select>
      <select data-k="weight" aria-label="Насыщенность"><option value="400">Обычный</option><option value="500">Средний</option><option value="700">Жирный</option><option value="900">Сверхжирный</option></select></div>
      <div class="row"><select data-k="align" class="grow" aria-label="Выравнивание"><option value="left">По левому краю</option><option value="center">По центру</option><option value="right">По правому краю</option></select>
      <label class="check"><input type="checkbox" data-k="italic"> Курсив</label></div>
      ${rangeField('Кегль, % выс.', 'size', .5, 80, .1, 100)}${rangeField('Трекинг', 'ls', -10, 80, 1, 100)}${rangeField('Интерлиньяж', 'lh', .7, 2.5, .01)}
      ${rangeField('Дуга, °', 'arc', -360, 360, 1)}`;
  } else if (L.type === 'image') {
    // what the picture is (a card), then how it lies on the face (with the position below)
    html += imageCardHTML(o, L) + alignBarHTML(1);
  } else {
    html += `<div class="field wide"><span class="fl">Форма</span><select data-k="kind" aria-label="Форма"><option value="rect">Прямоугольник</option><option value="ellipse">Эллипс</option></select></div>
      ${rangeField('Ширина, %', 'w', 1, 200, .1, 100)}${rangeField('Высота, %', 'h', 1, 200, .1, 100)}
      ${L.kind === 'rect' ? rangeField('Скругление', 'radius', 0, 100, 1, 100) : ''}${rangeField('Контур (0 — заливка)', 'stroke', 0, 100, 1, 1000)}`;
  }
  const img = L.type === 'image';
  // a picture's flips sit by its turn, as two toggles
  const rot = img ? rangeField('Поворот, °', 'rot', -180, 180, 1).replace(/<\/div>$/, `<span class="flips"><button class="vx" id="flipX" aria-pressed="${!!L.flipX}" title="Отразить по горизонтали">${ICON.flipH}</button><button class="vx" id="flipY" aria-pressed="${!!L.flipY}" title="Отразить по вертикали">${ICON.flipV}</button></span></div>`).replace('class="field"', 'class="field rotf"') : rangeField('Поворот, °', 'rot', -180, 180, 1);
  const pos = `${rangeField('Центр X, %', 'x', -50, 150, .1, 100)}${rangeField('Центр Y, %', 'y', -50, 150, .1, 100)}${rot}
    ${!(img && L.tile) && Object.keys(RT.get(o.id)?.frames || {}).length ? '<label class="check" title="Часть слоя за краем грани печатается на соседних гранях, через сгиб. Включается сама, если тянуть слой через ребро на модели"><input type="checkbox" data-k="wrap"> Переходит через рёбра на соседние грани</label>' : ''}`;
  html += img ? `<div class="cut"><h3>Размер и положение</h3>${fitSegHTML(o, L)}${rangeField(L.tile ? 'Размер плитки, %' : 'Ширина, %', 'w', 1, 400, .1, 100)}${pos}</div>` : pos;
  html += `
    ${materialsHTML(L, effOpts)}
    ${cropHTML(o, L)}`;
  sec.innerHTML = html;
  bindFields(sec, activeLayer, (k) => {
    const L = activeLayer();
    if (k === 'weight') L.weight = +L.weight;
    // a kit font (@heading, @body) links the text to it; any other font drops the link
    if (k === 'font') setLink(L, 'font', L.font.startsWith('@') ? L.font.slice(1) : null);
    if (k === 'font' || k === 'weight' || k === 'italic') ensureFont(L);
    if (k === 'text' || k === 'effect') ui.layers = true;
    if (k === 'kind' || k === 'tile') renderLayerProps();
    if (k === 'w' && L.type === 'image') ui.layers = true;
    markFace(activeObj(), sel.face);
  });
  bindCrop(o, L); bindAlignBar(sec);
  if (L.type === 'text' && linkOf(L, 'font') && $('[data-k="font"]', sec)) $('[data-k="font"]', sec).value = '@' + linkOf(L, 'font');
  $('#gradKind') && ($('#gradKind').onchange = e => { setGradient(o, sel.face, activeLayer(), e.target.value || null); ui.layers = true; renderLayerProps(); commit(); });
  if (L.type === 'image') {
    // another picture in its place: from the uploads, or from the computer (as the action bar does)
    $('#imgReplace').onclick = e => pickAsset(e.currentTarget, 'Заменить картинку', r => swapImage(r), { brand: true });
    bindVecColors(sec, activeLayer, () => { markFace(o, sel.face); ui.layers = true; }, renderLayerProps);
    $$('#fitSeg button', sec).forEach(b => b.onclick = () => { setImageFit(o, sel.face, activeLayer(), b.dataset.fit); ui.layers = true; renderLayerProps(); commit(); });
    for (const ax of ['X', 'Y']) $('#flip' + ax, sec).onclick = () => { const L = activeLayer(); L['flip' + ax] = !L['flip' + ax]; markFace(o, sel.face); ui.layers = true; renderLayerProps(); commit(); };
  }
}
/* the kit's fonts first in a text's font list (as variables: '@heading', '@body') */
function brandFontOpts() {
  const F = kit().fonts, set = Object.entries(FONT_ROLES).filter(([r]) => F[r]);
  return set.length ? `<optgroup label="Бренд">${set.map(([r, t]) => `<option value="@${r}">${t} — ${esc(F[r])}</option>`).join('')}</optgroup>` : '';
}
/* the fill of a text or shape: plain colour or a gradient from it to a second colour */
function gradHTML(L, key = 'grad') {
  const g = L[key], opt = (v, t) => `<option value="${v}" ${v === (g?.kind || '') ? 'selected' : ''}>${t}</option>`;
  return `<div class="row"><select id="gradKind" class="grow" aria-label="Заливка">${opt('', 'Сплошной цвет')}${opt('linear', 'Линейный градиент')}${opt('radial', 'Радиальный градиент')}</select>
    ${g ? `<input type="color" data-k="${key}.color" aria-label="Второй цвет градиента">` : ''}</div>
    ${g?.kind === 'linear' ? rangeField('Угол градиента, °', key + '.angle', -180, 180, 1) : ''}`;
}
/* how a layer is printed: its opacity, its colours (a text's or a plate's colour and gradient, a picture's colours
   swapped or taken out), the finish (foil, varnish, embossing) and the blending with what is under it */
function materialsHTML(L, effOpts) {
  const colors = L.type === 'text' ? `<div class="row"><input type="color" data-k="color" aria-label="Цвет текста"><span class="hint">Цвет текста</span></div>${gradHTML(L)}`
    : L.type === 'shape' ? `<div class="row"><input type="color" data-k="fill" aria-label="Цвет"><span class="hint">Цвет</span></div>${gradHTML(L)}`
    : vecColorsHTML(L);
  return `<div class="cut mat"><h3>Материалы</h3>
    ${rangeField('Непрозрачность', 'opacity', 0, 100, 1, 100)}
    ${colors}
    <div class="field wide"><span class="fl">Отделка</span><select data-k="effect">${effOpts}</select></div>
    <div class="field wide"><span class="fl">Наложение</span><select data-k="blend">${Object.entries(BLENDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div></div>`;
}
/* ---------- the background row and its settings ---------- */
const bgCss = f => f.bgGrad ? (f.bgGrad.kind === 'radial' ? `radial-gradient(${f.bg},${f.bgGrad.color})` : `linear-gradient(${(f.bgGrad.angle ?? 90) + 90}deg,${f.bg},${f.bgGrad.color})`) : f.bg;
function bgRowHTML(f) {
  return `<div class="layer bgrow ${sel.bg ? 'on' : ''}" style="--d:0" title="Фон грани — всегда внизу, под всеми слоями">
    <span class="tw"></span><span class="th" style="background:${bgCss(f)}"></span><span class="ln">Фон</span><span class="dm mono">${f.bgGrad ? 'градиент' : esc(f.bg)}</span>
    <span class="acts"><span class="pin-lock" aria-hidden="true">${ICON.lock}</span></span></div>`;
}
function renderBgProps(sec, o, f) {
  const k = sel.face;
  sec.innerHTML = `<div class="sec-h"><h2>Фон</h2><span class="badge">${faceLabel(o, k)}</span></div>
    <p class="hint">Нижний слой грани: цвет бумаги под печатью. Он всегда под остальными слоями и заливает всю грань.</p>
    <div class="row"><input type="color" data-k="bg" aria-label="Цвет фона"><div class="swatches" id="bgSw">${SWATCHES.map(c => `<button class="sw" style="background:${c}" data-c="${c}" title="${c}" aria-label="Фон ${c}" aria-pressed="${f.bg === c}"></button>`).join('')}</div></div>
    ${gradHTML(f, 'bgGrad')}
    <div class="grid2"><button class="btn sm" id="bgAll">На все грани</button><button class="btn sm" id="bgPic">Картинка на фон…</button></div>
    <div class="grid2"><button class="btn sm danger" id="faceClear" ${f.layers.length ? '' : 'disabled'}>Очистить грань</button></div>`;
  const redraw = () => { ui.layers = true; ui.editor = true; };
  bindFields(sec, activeFaceData, key => { if (key === 'bg') setFaceBg(o, k, f.bg); else markFace(o, k); redraw(); });
  $$('#bgSw .sw', sec).forEach(b => b.onclick = () => { setFaceBg(o, k, b.dataset.c); redraw(); renderLayerProps(); commit(); });
  $('#gradKind', sec).onchange = e => { setFaceBgGrad(o, k, e.target.value || null); redraw(); renderLayerProps(); commit(); };
  $('#bgAll', sec).onclick = () => { bgToAllFaces(o, k); renderFaceTabs(); commit(); toast('Фон применён ко всем внешним граням'); };
  $('#bgPic', sec).onclick = e => pickAsset(e.currentTarget, 'Картинка на фон грани', r => {
    const L = addBackgroundImage(o, k, r.id, r.aspect); pickLayers([L.id]); renderFaceTabs(); commit();
  });
  $('#faceClear', sec).onclick = () => { clearFace(o, k); selectBg(); renderLayers(); renderLayerProps(); renderFaceTabs(); commit(); };
}
function bgMenu(o, x, y) {
  const k = sel.face, f = o.faces[k];
  selectBg(); renderLayers(); renderLayerProps();
  openMenu(x, y, [
    { label: 'Фон на все грани', run: () => { bgToAllFaces(o, k); commit(); toast('Фон применён ко всем внешним граням'); } },
    { label: 'Картинка на фон…', run: () => $('#bgPic')?.click() },
    'sep',
    { label: 'Очистить грань', disabled: !f.layers.length, run: () => $('#faceClear')?.click() },
  ], 'Фон');
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
/* a picture's card: what it is (its preview, name, print resolution) and a button to put another one in its place */
function imageCardHTML(o, L) {
  const dpi = imageDpi(o, L), u = assets[L.src];
  const q = dpi == null ? '' : dpi < 150 ? `<b class="bad">${dpi} dpi</b> — мало для офсета, нужно от 300` : dpi < 300 ? `<b class="warn">${dpi} dpi</b> — для офсета лучше 300` : `<b>${dpi} dpi</b> — для печати хорошо`;
  return `<div class="imgcard"><span class="ic-th" ${u ? `style="background-image:url('${u}')"` : ''}></span>
    <div class="ic-t"><b class="ic-n" title="${esc(layerName(L))}">${esc(layerName(L))}</b><span class="hint mono" title="При печати этого размера">${q}</span></div>
    <button class="btn sm" id="imgReplace">Заменить…</button></div>`;
}
/* how the picture lies on the face: as placed, fitted in, filling the face, or repeated as a pattern */
function fitSegHTML(o, L) {
  const cur = imageFitOf(o, sel.face, L);
  return `<div class="seg" id="fitSeg" role="group" aria-label="Как лежит картинка">${[['free', 'Свободно', 'Как поставили'], ['contain', 'Вписать', 'Целиком внутри грани'], ['cover', 'Залить', 'Покрыть всю грань'], ['tile', 'Узор', 'Повторять картинку узором; ширина — размер плитки']]
    .map(([k, t, h]) => `<button data-fit="${k}" class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}" title="${h}">${t}</button>`).join('')}</div>`;
}
/* ---------- layer ops ---------- */
function addLayer(L, face = sel.face, obj = activeObj()) {
  if (!obj || !face) return;
  obj.faces[face].layers.push(L);
  if (obj.id !== sel.obj || face !== sel.face) select(obj.id, face, L.id, { flash: true });
  else { sel.layer = L.id; renderLayers(); renderLayerProps(); renderFaceTabs(); }
  markFace(obj, face); commit();
}
/* these act on a layer, or on all the selected ones when it is one of them */
const withSel = (f, id) => { const S = selectedLayers(f); return S.some(l => l.id === id) ? S : f.layers.filter(l => l.id === id); };
function deleteLayer(id) {
  const o = activeObj(), f = activeFaceData(); if (!f) return;
  deleteLayers(o, sel.face, withSel(f, id));
  if (!f.layers.some(l => l.id === sel.layer)) setLayerSelection([]);
  renderLayers(); renderLayerProps(); renderFaceTabs(); ui.editor = true; commit();
}
/* one step up (1) or down (-1) in the face's layers: up is drawn over the others; ±Infinity: to the top or bottom */
function moveLayer(id, step) {
  const o = activeObj(), f = activeFaceData(); if (!f) return;
  shiftLayers(o, sel.face, withSel(f, id), step);
  renderLayers(); ui.editor = true; commit();
}
function duplicateLayer(id) {
  const o = activeObj(), f = activeFaceData(); if (!f) return;
  const c = duplicateLayers(o, sel.face, withSel(f, id)); if (!c.length) return;
  setLayerSelection(c.map(l => l.id));
  renderLayers(); renderLayerProps(); renderFaceTabs(); ui.editor = true; commit();
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
/* the colours of a picture (a layer's or a sticker's, T): a vector's colours swapped or taken out one by one, and for
   a raster (a photo, a PNG logo) colours keyed out by a picker; what is taken out is not printed */
function vecColorsHTML(T) {
  const cols = vecColors(T.src), rc = T.recolor || {};
  let html = '';
  if (cols.length) {
    const shown = cols.slice(0, 16);
    html += `<div class="field wide"><span class="fl">Цвета вектора</span><div class="vcols">${shown.map(c => {
      const off = rc[c] === NONE;
      return `<span class="vc ${off ? 'off' : ''}" title="${c}"><span class="sw" style="background:${c}"></span>→<input type="color" data-vc="${c}" value="${off ? c : rc[c] || c}" ${off ? 'disabled' : ''} aria-label="Заменить ${c}"><button class="vx" data-vx="${c}" aria-pressed="${off}" title="${off ? 'Вернуть цвет' : 'Убрать цвет: не печатается, видно бумагу или слой ниже'}">${ICON.noColor}</button></span>`;
    }).join('')}</div></div>
    <div class="row"><span class="hint">Всё одним цветом</span><input type="color" id="vcAll" value="${rc[cols[0]] && rc[cols[0]] !== NONE ? rc[cols[0]] : cols[0]}" aria-label="Перекрасить всё"><button class="btn sm" id="vcReset" ${hasRecolor(rc) ? '' : 'disabled'}>Исходные цвета</button></div>
    ${cols.length > shown.length ? `<p class="hint">Показаны 16 главных цветов из ${cols.length}; «Всё одним цветом» перекрашивает все.</p>` : ''}`;
  } else if (T.src) {
    const ko = T.keyout || [];
    html += `<div class="field wide"><span class="fl">Убрать цвет</span><div class="kos">${ko.map((q, i) => `<div class="ko"><span class="sw" style="background:${q.c}" title="${q.c}"></span>
      <input type="range" min="0" max="60" step="1" value="${Math.round(q.tol * 100)}" data-ko="${i}" aria-label="Допуск для ${q.c}" title="Допуск: захватывает близкие оттенки"><span class="mono kt">${Math.round(q.tol * 100)}%</span>
      <button class="vx" data-kodel="${i}" title="Вернуть цвет">✕</button></div>`).join('') || '<span class="hint">Цвет, убранный с картинки, не печатается: видно бумагу или слой ниже.</span>'}</div></div>
    <div class="row">${'EyeDropper' in window ? `<button class="btn sm" id="koPick" title="Клик по цвету в любом месте экрана: на модели или в окне грани">${ICON.picker}Пипетка</button>` : ''}<button class="btn sm" id="koWhite">Белый фон</button><input type="color" id="koAdd" value="#ffffff" title="Выбрать цвет, который убрать" aria-label="Убрать цвет"></div>`;
  }
  return html;
}
/* hooks up vecColorsHTML: onChange(T) shows the change, redraw() draws the panel again (a colour added or taken back) */
function bindVecColors(root, getT, onChange, redraw = () => {}) {
  const cols = () => vecColors(getT()?.src), set = (rc, done) => { const t = getT(); if (!t) return; t.recolor = rc; onChange(t); if (done) commit(); };
  const edit = (fn, again = false) => { const t = getT(); if (!t) return; fn(t); onChange(t); commit(); if (again) redraw(); };
  $$('[data-vc]', root).forEach(inp => {
    const go = done => { const t = getT(); if (!t) return; setVecColor(t, inp.dataset.vc, inp.value.toLowerCase()); onChange(t); if (done) commit(); };
    inp.addEventListener('input', () => go(false)); inp.addEventListener('change', () => go(true));
  });
  $$('[data-vx]', root).forEach(b => b.onclick = () => edit(t => setVecColor(t, b.dataset.vx, t.recolor?.[b.dataset.vx] === NONE ? null : NONE), true));
  const all = $('#vcAll', root);
  if (all) {
    const go = done => { const rc = Object.fromEntries(cols().map(c => [c, all.value.toLowerCase()])); set(rc, done); $$('[data-vc]', root).forEach(i => { i.value = all.value; }); };
    all.addEventListener('input', () => go(false)); all.addEventListener('change', () => { go(true); redraw(); });
  }
  const rs = $('#vcReset', root); if (rs) rs.onclick = () => { set({}, true); redraw(); };
  // keyed-out colours of a raster
  const add = c => edit(t => addKeyout(t, c), true);
  $('#koWhite', root) && ($('#koWhite', root).onclick = () => add('#ffffff'));
  $('#koAdd', root) && $('#koAdd', root).addEventListener('change', e => add(e.target.value));
  $('#koPick', root) && ($('#koPick', root).onclick = async () => { try { const r = await new EyeDropper().open(); if (r?.sRGBHex) add(r.sRGBHex.startsWith('#') ? r.sRGBHex : '#' + r.sRGBHex.match(/\d+/g).slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('')); } catch { /* cancelled */ } });
  $$('[data-ko]', root).forEach(inp => {
    const i = +inp.dataset.ko, out = inp.nextElementSibling;
    inp.addEventListener('input', () => { const t = getT(); if (!t) return; setKeyoutTol(t, i, +inp.value / 100); out.textContent = inp.value + '%'; onChange(t); });
    inp.addEventListener('change', () => commit());
  });
  $$('[data-kodel]', root).forEach(b => b.onclick = () => edit(t => removeKeyout(t, +b.dataset.kodel), true));
}
function renderFonts() {
  $('#fontList').innerHTML = state.fonts.map(f => `<span class="chip" style="font-family:'${esc(f.name)}'">${esc(f.name)}</span>`).join('');
}

/* hooks up the image picker */
function initFacePanel() {
  $('#imgInput').onchange = e => { const f = e.target.files[0]; if (f && pickCb) pickCb(f); };
}

export { addImageToFace, addLayer, layerCmd, bindVecColors, deleteLayer, duplicateLayer, initFacePanel, moveLayer, pickImage, renderFacePanel, renderFaceTabs, renderFonts, renderLayerProps, renderLayers, updateFaceMeta, vecColorsHTML };
