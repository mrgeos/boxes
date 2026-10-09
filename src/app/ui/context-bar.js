// Плавающая панель над выделенным на сцене: быстрые действия с объектом, слоем, наклейкой или рукавом
import * as THREE from 'three';
import { $, esc, fmt } from '../core/util.js';
import { ICON } from '../core/constants.js';
import { activeLayer, activeObj, sel } from '../core/state.js';
import { RT, applyLid, camera, cvs, markFace, rebuildQueue, ui } from '../scene/renderer.js';
import { fitTissue } from '../carriers/tissue.js';
import { recording, setView } from '../scene/camera.js';
import { boxOnScreen } from '../scene/sel-box.js';
import { selectedLayers } from '../core/layers.js';
import { editMode, setEditMode } from '../core/mask.js';
import { commit } from '../core/project.js';
import { activeSticker } from '../stickers/placement.js';
import { sleeveDims } from '../carriers/sleeve.js';
import { carryDims } from '../carriers/carry.js';
import { deleteLayer, duplicateLayer, renderLayerProps } from './face-panel.js';
import { deleteSticker, duplicateSticker, editStickerText, extraAction, renderStickers } from './stickers-panel.js';
import { deleteIds, duplicateIds, renderObjects } from './object-list.js';
import { lidAction, toggleLid, turn } from './context-menus.js';
import { activeFill, activeRibbon } from '../core/extras.js';
import { buildRibbons } from '../carriers/ribbon.js';
import { modelInput, renderModel } from './model-panel.js';
import { startTextEdit, textEditing } from './text-edit.js';
import { renderActionBar } from './action-bar.js';

/* What it holds follows the selection: an object — open it (a click, or partly with the slider), turn it by 90°,
   its sizes, zoom to it, duplicate, delete; a layer — crop a picture or type into a text, duplicate, delete; a
   sticker — duplicate, delete; a ribbon — how it is tied, delete; a sleeve or a carrier — slide it off, delete. It stands over the selection on the
   screen (under it when there is no room above) and keeps with it as the camera turns; it hides while something
   is dragged on the model or a text is typed. */
const bar = () => $('#ctxBar');
let key = '', busy = false;
const ib = (id, icon, title, extra = '') => `<button class="ab" id="${id}" title="${esc(title)}" aria-label="${esc(title)}" ${extra}>${icon}</button>`;
const sep = '<span class="ab-sep"></span>';

/* the sizes an object shows, by its kind: [key of o.dims, label] */
function dimKeys(o) {
  if (o.type === 'tube' || o.type === 'torte') return [['w', 'Ø'], ['h', 'В']];
  if (o.type === 'model') return [];
  if (o.type === 'board') return o.cbShape === 'round' ? [['w', 'Ø']] : [['w', 'Ш'], ['d', 'Г']];   // its thickness is set in the panel (it can be under 5 mm)
  if (o.type === 'cup') return [['w', 'Ø верх'], ['d', 'Ø низ'], ['h', 'В']];
  return [['w', 'Ш'], ['d', 'Г'], ['h', 'В']];
}
/* a part's slider: [field, label, max] */
function partSlide(o, k) {
  if (k === 'sleeve') { const D = sleeveDims(o); return ['sleeve.slide', 'Сдвинуть рукав', Math.ceil(D.len + D.bw)]; }
  const D = carryDims(o); return ['carry.slide', 'Снять переноску', Math.ceil(D.ys + D.hh)];
}
function kindNow() {
  const o = activeObj();
  if (!o || sel.group || recording || textEditing()) return null;
  if (activeSticker()) return 'sticker';
  if (activeRibbon()) return 'ribbon';
  if (activeFill()) return 'fill';
  if (activeLayer()) return selectedLayers().length > 1 ? 'layers' : 'layer';
  if (sel.part) return 'part';
  if (sel.bg) return null;
  return 'object';
}
function build(kind) {
  const o = activeObj(), L = activeLayer();
  if (kind === 'object') {
    const lid = lidAction(o), open = o.lid > 0;
    return (lid ? `<button class="ab wide ${open ? 'on' : ''}" id="cbLid" title="${esc(open ? lid[1] : lid[0])}">${ICON.lidOpen}<span>${esc(open ? lid[1] : lid[0])}</span></button>
        <input type="range" id="cbLidR" min="0" max="${lid[2]}" step="1" value="${o.lid || 0}" aria-label="Насколько открыть">${sep}` : '')
      + ib('cbRotL', ICON.rotL, 'Повернуть на 90° влево') + ib('cbRotR', ICON.rotR, 'Повернуть на 90° вправо') + sep
      + (dimKeys(o).length ? `<span class="cb-dims">${dimKeys(o).map(([k, t]) => `<label title="${t}, мм"><span>${t}</span><input class="num" type="number" min="5" max="2000" step="1" data-dim="${k}" value="${fmt(o.dims[k])}"></label>`).join('')}<span class="hint">мм</span></span>${sep}` : '')
      + ib('cbFocus', ICON.focus, 'Приблизить (F)') + ib('cbDup', ICON.copy, 'Дублировать (Ctrl+D)') + ib('cbDel', ICON.trash, 'Удалить (Delete)');
  }
  if (kind === 'part' && sel.part === 'tissue') return `<span class="hint cb-l">Тишью</span>${[['flat', '1 лист'], ['cross', '2 листа']].map(([v, t]) => `<button class="ab wide ${o.tissue.layout === v ? 'on' : ''}" data-lay="${v}"><span>${t}</span></button>`).join('')}${sep}` + ib('cbDel', ICON.trash, 'Удалить (Delete)');
  if (kind === 'part') {
    const [k, t, max] = partSlide(o, sel.part), v = sel.part === 'sleeve' ? o.sleeve.slide : o.carry.slide;
    return `<span class="hint cb-l">${t}</span><input type="range" id="cbSlide" data-k="${k}" min="0" max="${max}" step="1" value="${v || 0}" aria-label="${t}">${sep}` + ib('cbDel', ICON.trash, 'Удалить (Delete)');
  }
  if (kind === 'layer' || kind === 'layers') {
    const one = kind === 'layer' ? L : null;
    const first = one?.type === 'image' && !one.tile ? `<button class="ab wide ${editMode() === 'crop' ? 'on' : ''}" id="cbCrop">${ICON.crop}<span>${editMode() === 'crop' ? 'Готово' : 'Кадрировать'}</span></button>${sep}`
      : one?.type === 'text' ? `<button class="ab wide" id="cbType">${ICON.textT}<span>Править текст</span></button>${sep}` : '';
    return first + ib('cbDup', ICON.copy, 'Дублировать (Ctrl+D)') + ib('cbDel', ICON.trash, 'Удалить (Delete)');
  }
  if (kind === 'ribbon') {
    const r = activeRibbon();
    return `<span class="hint cb-l">Завязка</span>${[['classic', 'Бант'], ['puffy', 'Пышный'], ['knot', 'Узел']].map(([v, t]) => `<button class="ab wide ${r.bow === v ? 'on' : ''}" data-bow="${v}"><span>${t}</span></button>`).join('')}${sep}` + ib('cbDel', ICON.trash, 'Удалить ленту (Delete)');
  }
  if (kind === 'fill') return `<span class="hint cb-l">Начинка ×${o.fill.count}</span><button class="ab" id="cbLess" title="Меньше">−</button><button class="ab" id="cbMore" title="Больше">+</button>${sep}` + ib('cbDel', ICON.trash, 'Убрать начинку (Delete)');
  if (kind === 'sticker') return `<button class="ab wide" id="cbType">${ICON.textT}<span>Текст</span></button>${sep}` + ib('cbDup', ICON.copy, 'Дублировать наклейку') + ib('cbDel', ICON.trash, 'Удалить наклейку (Delete)');
  return '';
}
function bind(kind) {
  const o = activeObj(), on = (id, ev, fn) => { const el = $('#' + id); if (el) el.addEventListener(ev, fn); };
  if (kind === 'object') {
    on('cbLid', 'click', () => toggleLid(o).then(() => { renderActionBar(); renderModel(); refresh(); }));
    on('cbLidR', 'input', e => { o.lid = +e.target.value; applyLid(o); $('#cbLid')?.classList.toggle('on', o.lid > 0); });
    on('cbLidR', 'change', () => { renderModel(); commit(); key = ''; });
    on('cbRotL', 'click', () => turn(o, -90)); on('cbRotR', 'click', () => turn(o, 90));
    bar().querySelectorAll('[data-dim]').forEach(inp => inp.addEventListener('change', () => {
      const v = Math.round(+inp.value); if (!(v >= 5)) { inp.value = fmt(o.dims[inp.dataset.dim]); return; }
      o.dims[inp.dataset.dim] = v; modelInput('dims.' + inp.dataset.dim); renderModel(); commit();
    }));
    on('cbFocus', 'click', () => setView('focus'));
    on('cbDup', 'click', () => duplicateIds([o.id])); on('cbDel', 'click', () => deleteIds([o.id]));
  } else if (kind === 'part') {
    const k = sel.part;
    bar().querySelectorAll('[data-lay]').forEach(b => b.addEventListener('click', () => { o.tissue.layout = b.dataset.lay; fitTissue(o); rebuildQueue.add(o.id); markFace(o, 'tissue'); ui.net = true; renderModel(); commit(); refresh(); }));
    on('cbSlide', 'input', e => { const T = o[k]; T.slide = +e.target.value; modelInput(k + '.slide'); });
    on('cbSlide', 'change', () => { renderModel(); commit(); });
    on('cbDel', 'click', () => extraAction(o, k, 'del'));
  } else if (kind === 'ribbon') {
    const r = activeRibbon();
    bar().querySelectorAll('[data-bow]').forEach(b => b.addEventListener('click', () => { r.bow = b.dataset.bow; buildRibbons(o); renderStickers(); commit(); refresh(); }));
    on('cbDel', 'click', () => extraAction(o, r.id, 'del'));
  } else if (kind === 'fill') {
    const step = d => { o.fill.count = Math.max(1, Math.min(30, o.fill.count + d)); rebuildQueue.add(o.id); renderStickers(); renderObjects(); commit(); refresh(); };
    on('cbLess', 'click', () => step(-1)); on('cbMore', 'click', () => step(1));
    on('cbDel', 'click', () => extraAction(o, 'fill', 'del'));
  } else if (kind === 'sticker') {
    const st = activeSticker();
    on('cbType', 'click', () => editStickerText(o, st.id));
    on('cbDup', 'click', () => duplicateSticker(st.id)); on('cbDel', 'click', () => deleteSticker(st.id));
  } else {
    const L = activeLayer();
    on('cbCrop', 'click', () => { setEditMode(editMode() === 'crop' ? null : 'crop'); renderLayerProps(); refresh(); });
    on('cbType', 'click', () => startTextEdit(L, '3d'));
    on('cbDup', 'click', () => duplicateLayer(L.id)); on('cbDel', 'click', () => deleteLayer(L.id));
  }
}
/* the selection's box on the screen (client px): a layer or sticker by its frame, an object by its 3D box */
const box3 = new THREE.Box3(), v3 = new THREE.Vector3();
function screenBox(kind) {
  if (kind !== 'object' && kind !== 'part' && kind !== 'ribbon' && kind !== 'fill') {
    const q = boxOnScreen(); if (!q) return null;
    const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  const rt = RT.get(activeObj().id); if (!rt) return null;
  const g = kind === 'part' ? rt[sel.part] || rt.group : kind === 'ribbon' ? rt.ribbonGroups?.get(sel.ribbon) || rt.group : kind === 'fill' ? rt.fill || rt.group : rt.group;
  box3.setFromObject(g); if (box3.isEmpty()) return null;
  const r = cvs.getBoundingClientRect(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    v3.set(i & 1 ? box3.max.x : box3.min.x, i & 2 ? box3.max.y : box3.min.y, i & 4 ? box3.max.z : box3.min.z).project(camera);
    const x = r.left + (v3.x + 1) / 2 * r.width, y = r.top + (1 - v3.y) / 2 * r.height;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}
/* builds the bar again when the selection changed, and puts it over the selection; called after each drawn frame */
function syncCtxBar(moved = true) {
  const el = bar(); if (!el) return;
  const kind = busy ? null : kindNow(), o = activeObj();
  const k = kind && [kind, o.id, sel.layer, selectedLayers().length, sel.sticker, sel.ribbon, activeRibbon()?.bow, o.tissue?.layout, o.fill?.count, sel.part, editMode(), o.lid > 0, o.type, o.lidType, JSON.stringify(o.dims)].join('|');
  if (!kind) { el.hidden = true; key = ''; return; }
  // nothing new and the view still: it stays where it is
  if (k === key && !moved) return;
  if (k !== key) { key = k; el.innerHTML = build(kind); bind(kind); }
  const b = screenBox(kind); if (!b) { el.hidden = true; return; }
  el.hidden = false;
  const st = el.parentElement.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  let x = (b[0] + b[2]) / 2 - st.left - w / 2, y = b[1] - st.top - h - 12;
  if (y < 8) y = Math.min(b[3] - st.top + 12, st.height - h - 60);   // no room above: under it (clear of the action bar)
  el.style.left = Math.round(Math.max(8, Math.min(st.width - w - 8, x))) + 'px';
  el.style.top = Math.round(Math.max(8, y)) + 'px';
}
/* the bar is built again on the next frame */
function refresh() { key = ''; }
function initCtxBar() {
  // out of the way while something is dragged on the model
  cvs.addEventListener('pointerdown', e => { if (e.button === 0) { busy = true; bar().hidden = true; } });
  addEventListener('pointerup', () => { if (busy) { busy = false; key = ''; requestAnimationFrame(syncCtxBar); } });
  bar().addEventListener('pointerdown', e => e.stopPropagation());
}

export { initCtxBar, refresh as refreshCtxBar, syncCtxBar };
