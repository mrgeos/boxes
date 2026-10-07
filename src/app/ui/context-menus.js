// Что в контекстном меню: объект, группа, слой, наклейка, пустое место сцены, несколько выделенных
import * as THREE from 'three';
import { $, S, toast } from '../core/util.js';
import { PRESETS } from '../core/constants.js';
import { activeFaceData, activeObj, sel, state } from '../core/state.js';
import { faceKeys, faceLabel, facePx, outerKeys } from '../core/model.js';
import { library } from '../core/library.js';
import { groupById, groupItems, isGroup, layoutAll, objectsIn, parentOf, ungroup } from '../core/groups.js';
import { applyLid, camera, cvs } from '../scene/renderer.js';
import { focusSelected, setView } from '../scene/camera.js';
import { pick, stickerHit } from '../scene/interaction.js';
import { select, selectGroup, selectLayer } from '../core/selection.js';
import { commit } from '../core/project.js';
import { refreshFields } from './fields.js';
import { renderModel } from './model-panel.js';
import { addImageToFace, deleteLayer, duplicateLayer, moveLayer, renderLayerProps, renderLayers } from './face-panel.js';
import { deleteSticker, duplicateSticker, renderStickers } from './stickers-panel.js';
import { swapImage } from './library-panel.js';
import { ed, edPoint, edState, hitLayer } from './face-editor.js';
import { addObject, copyFaceDesign } from './wiring.js';
import { deleteIds, duplicateIds, groupIds, leaveGroup, renameRow, renderObjects, ungroupIds } from './object-list.js';
import { openMenu } from './menu.js';

const MOD = /Mac|iP(hone|ad)/.test(navigator.platform) ? '⌘' : 'Ctrl+';
const TYPES = { box: 'Коробки', dome: 'Лотки с крышкой-призмой', torte: 'Тортницы', cup: 'Бумажные стаканы', bag: 'Пакеты', tube: 'Тубусы и банки' };
const norm = a => ((a + 180) % 360 + 360) % 360 - 180;
const objById = id => state.objects.find(o => o.id === id) || null;
const layerTitle = L => L.type === 'text' ? `Текст «${(L.text || '').split('\n')[0].slice(0, 24)}»` : L.type === 'image' ? 'Картинка' : L.kind === 'ellipse' ? 'Круг' : 'Плашка';
/* the name field of the panel, ready for typing */
function rename() { const i = $('#modelSec [data-k="name"]'); if (i) { i.focus(); i.select(); } }
/* the object's fields in the panel, after a change made from the menu */
function refreshObject(o) { if (sel.obj === o.id && !sel.group) refreshFields($('#modelSec'), o); }

/* what opens the object's lid (or flap, or end): [open, close, the value to open to] */
function lidAction(o) {
  if (o.type === 'box') return o.lidType === 'none' ? null : o.lidType === 'handle' ? ['Открыть торец', 'Закрыть торец', 100]
    : o.lidType === 'telescope' ? ['Поднять крышку', 'Опустить крышку', 80] : ['Открыть крышку', 'Закрыть крышку', 110];
  if (o.type === 'cup') return o.cupLid ? ['Снять крышку', 'Надеть крышку', 80] : null;
  if (o.type === 'dome' || o.type === 'torte') return ['Поднять крышку', 'Опустить крышку', 80];
  if (o.type === 'bag') return o.bagTop === 'flap' ? ['Открыть клапан', 'Закрыть клапан', 150] : o.bagTop === 'fold' && !(o.rollTurns > 1) ? ['Развернуть отворот', 'Свернуть отворот', 150] : null;
  return null;
}
/* opens or closes the lid (flap, end) in a short movement; resolves when it is there */
function toggleLid(o) {
  const lid = lidAction(o); if (!lid) return Promise.resolve();
  const from = o.lid || 0, to = from > 0 ? 0 : lid[2], t0 = performance.now(), T = 450;
  return new Promise(done => {
    const step = now => {
      const t = Math.min(1, (now - t0) / T), e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      o.lid = Math.round(from + (to - from) * e); applyLid(o);
      if (t < 1) requestAnimationFrame(step); else { refreshObject(o); commit(); done(); }
    };
    requestAnimationFrame(step);
  });
}
function turn(o, deg) { o.rotY = norm(o.rotY + deg); layoutAll(); refreshObject(o); commit(); }

function layerItems(o, face, L) {
  const f = o.faces[face], i = f.layers.indexOf(L), on = fn => () => { select(o.id, face, L.id); fn(); };
  return [
    { label: 'Дублировать', key: MOD + 'D', run: on(() => duplicateLayer(L.id)) },
    { label: 'Удалить', key: 'Delete', run: on(() => deleteLayer(L.id)) },
    'sep',
    { label: 'Выше по слоям', disabled: i >= f.layers.length - 1, run: on(() => moveLayer(L.id, 1)) },
    { label: 'Ниже по слоям', disabled: i <= 0, run: on(() => moveLayer(L.id, -1)) },
    L.type === 'image' && { label: 'Заменить картинку из библиотеки', disabled: !library.length, sub: libraryItems(on(() => {})) },
  ];
}
/* the latest pictures of the library; `before` selects what gets the picture */
function libraryItems(before) { return library.slice(-14).reverse().map(it => ({ label: it.name || 'Картинка', run: () => { before(); swapImage(it); } })); }
function stickerItems(o, st) {
  const on = fn => () => { if (sel.obj !== o.id) select(o.id); sel.sticker = st.id; sel.layer = null; fn(); };
  return [
    { label: 'Дублировать', run: on(() => duplicateSticker(st.id)) },
    { label: 'Удалить', key: 'Delete', run: on(() => deleteSticker(st.id)) },
    'sep',
    { label: 'Заменить картинку из библиотеки', disabled: !library.length, sub: libraryItems(on(() => { renderStickers(); })) },
  ];
}
function objectItems(o, face = null, layer = null) {
  const lid = lidAction(o), from = face && o.faces[face] ? face : sel.face, others = outerKeys(o).filter(k => k !== from), g = parentOf(o.id);
  return [
    face && (face !== sel.face || sel.obj !== o.id) && { label: `Выбрать грань «${faceLabel(o, face)}»`, run: () => select(o.id, face, null, { flash: true }) },
    { label: 'Приблизить', key: 'F', run: () => { select(o.id); focusSelected({ frame: true }); } },
    'sep',
    layer && { label: `Слой: ${layerTitle(layer)}`, sub: layerItems(o, face, layer) },
    layer && 'sep',
    { label: 'Дублировать', run: () => duplicateIds([o.id]) },
    { label: 'Удалить', run: () => deleteIds([o.id]) },
    { label: 'Переименовать', run: () => { select(o.id); renameRow(o.id) || rename(); } },
    'sep',
    { label: 'Повернуть на 90° влево', run: () => turn(o, 90) },
    { label: 'Повернуть на 90° вправо', run: () => turn(o, -90) },
    lid && { label: o.lid > 0 ? lid[1] : lid[0], run: () => toggleLid(o) },
    'sep',
    { label: 'Сгруппировать', key: MOD + 'G', run: () => groupIds([o.id]) },
    g && { label: `Убрать из группы «${g.name}»`, run: () => leaveGroup(o.id) },
    from && others.length && { label: `Копировать дизайн грани «${faceLabel(o, from)}» на`, sub: [
      { label: 'Все внешние грани', run: () => copyFaceDesign(o, from, others) }, 'sep',
      ...others.map(k => ({ label: faceLabel(o, k), run: () => copyFaceDesign(o, from, [k]) }))] },
  ];
}
function groupMenu(g) {
  const dirs = { x: 'Слева направо', z: 'Сзади вперёд' };
  return [
    { label: 'Разгруппировать', key: MOD + 'Shift+G', run: () => ungroupIds([g.id]) },
    { label: 'Выделить все объекты группы', run: () => { const ids = objectsIn(g.id); select(ids[0]); sel.multi = ids; renderObjects(); } },
    { label: 'Направление ряда', sub: Object.entries(dirs).map(([d, label]) => ({ label, checked: g.dir === d, run: () => { g.dir = d; layoutAll(); if (sel.group === g.id) renderModel(); commit(); } })) },
    'sep',
    { label: 'Дублировать', run: () => duplicateIds([g.id]) },
    { label: 'Удалить', run: () => deleteIds([g.id]) },
    { label: 'Переименовать', run: () => { selectGroup(g.id); renameRow(g.id) || rename(); } },
  ];
}
function multiItems(ids) {
  return [
    { label: 'Сгруппировать', key: MOD + 'G', run: () => groupIds(ids) },
    { label: 'Дублировать', run: () => duplicateIds(ids) },
    { label: 'Удалить', run: () => deleteIds(ids) },
    'sep',
    { label: 'Выровнять в ряд', run: () => { const g = groupItems(ids); if (!g) return; const items = ungroup(g.id); select(objectsIn(items[0])[0]); sel.multi = items; renderObjects(); commit(); toast('Выстроены в ряд с отступом 20 мм'); } },
  ];
}
function emptyItems(at) {
  return [
    { label: 'Добавить объект', sub: Object.entries(TYPES).map(([t, label]) => ({ label, sub: PRESETS.filter(p => p.type === t).map(p => ({ label: p.label, run: () => addObject(p.id, at) })) })) },
    'sep',
    { label: 'Показать всё', key: 'H', run: () => setView('fit') },
    { label: 'Сбросить вид', run: () => setView('q') },
    'sep',
    { label: 'Вставить картинку', key: MOD + 'V', disabled: !activeObj(), run: pasteImage },
  ];
}
async function pasteImage() {
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find(t => t.startsWith('image/'));
      if (type) return addImageToFace(new File([await item.getType(type)], 'вставка.' + type.split('/')[1], { type }));
    }
    toast('В буфере обмена нет картинки');
  } catch { toast(`Браузер не дал прочитать буфер обмена. Нажмите ${MOD}V`); }
}
/* the menu for an item of the list (an object or a group), or for several picked ones */
function itemMenu(id) {
  if (sel.multi.length > 1 && sel.multi.includes(id)) return [multiItems([...sel.multi]), `Выделено: ${sel.multi.length}`];
  const g = groupById(id); if (g) return [groupMenu(g), g.name];
  const o = objById(id); return o ? [objectItems(o), o.name] : [[], ''];
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt = new THREE.Vector3();
function floorAt(x, y) {
  const r = cvs.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(floorPlane, pt) ? { x: pt.x / S, z: pt.z / S } : null;
}
function sceneMenu(x, y) {
  const h = pick(x, y), o = h && objById(h.objId);
  if (!o) return openMenu(x, y, emptyItems(floorAt(x, y)), 'Сцена');
  if (sel.multi.length > 1 && sel.multi.includes(o.id)) return openMenu(x, y, ...itemMenu(o.id));
  const st = stickerHit(h);
  if (st) {
    if (sel.obj !== o.id) select(o.id, h.face || undefined, null);
    sel.sticker = st.id; sel.layer = null; renderLayers(); renderLayerProps(); renderStickers();
    return openMenu(x, y, stickerItems(o, st), 'Наклейка');
  }
  let L = null;
  if (h.face && h.uv && !h.wall) { const [W, H] = facePx(o, h.face); L = hitLayer(o.faces[h.face], W, H, h.uv.x * W, (1 - h.uv.y) * H); }
  if (sel.obj !== o.id || sel.group) select(o.id);
  openMenu(x, y, objectItems(o, h.face && faceKeys(o).includes(h.face) ? h.face : null, L), o.name);
}
/* the 2D window of the face: the layer under the cursor, or the face itself */
function editorMenu(e) {
  const o = activeObj(), f = activeFaceData(); if (!o || !f) return;
  const [mx, my] = edPoint(e), L = hitLayer(f, edState.W, edState.H, mx / edState.k, my / edState.k);
  if (L) { selectLayer(L.id); return openMenu(e.clientX, e.clientY, layerItems(o, sel.face, L), layerTitle(L)); }
  const others = outerKeys(o).filter(k => k !== sel.face), click = id => () => $(id).click();
  openMenu(e.clientX, e.clientY, [
    { label: 'Добавить текст', run: click('#addTextBtn') }, { label: 'Добавить картинку', run: click('#addImgBtn') },
    { label: 'Добавить плашку', run: click('#addRectBtn') }, { label: 'Добавить круг', run: click('#addEllBtn') },
    'sep',
    { label: 'Фон на все грани', run: click('#bgAllBtn') },
    others.length && { label: 'Копировать дизайн на', sub: [{ label: 'Все внешние грани', run: () => copyFaceDesign(o, sel.face, others) }, 'sep', ...others.map(k => ({ label: faceLabel(o, k), run: () => copyFaceDesign(o, sel.face, [k]) }))] },
    { label: 'Очистить грань', disabled: !f.layers.length, run: click('#clearFaceBtn') },
  ], `Грань «${faceLabel(o, sel.face)}»`);
}

/* hooks up right clicks: the 3D view (a click without dragging; dragging with the right button still moves
   the view), the object list and the 2D window of the face */
function initContextMenus() {
  let rdown = null;
  cvs.addEventListener('contextmenu', e => e.preventDefault());
  cvs.addEventListener('pointerdown', e => { if (e.button === 2) rdown = [e.clientX, e.clientY]; }, true);
  cvs.addEventListener('pointerup', e => {
    if (e.button !== 2 || !rdown) return;
    const still = Math.hypot(e.clientX - rdown[0], e.clientY - rdown[1]) < 5; rdown = null;
    if (still) sceneMenu(e.clientX, e.clientY);
  });
  const list = $('#objList'), rowMenu = (el, x, y) => {
    const id = el.dataset.id;
    if (!(sel.multi.length > 1 && sel.multi.includes(id))) isGroup(id) ? selectGroup(id) : select(id);
    openMenu(x, y, ...itemMenu(id));
  };
  list.addEventListener('contextmenu', e => { const el = e.target.closest('.obj'); if (!el) return; e.preventDefault(); rowMenu(el, e.clientX, e.clientY); });
  list.addEventListener('keydown', e => {
    const el = e.target.closest('.obj'); if (!el || !(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return;
    e.preventDefault(); const r = el.getBoundingClientRect(); rowMenu(el, r.left + 24, r.bottom);
  });
  ed.addEventListener('contextmenu', e => { e.preventDefault(); editorMenu(e); });
}

export { initContextMenus, lidAction, toggleLid };
