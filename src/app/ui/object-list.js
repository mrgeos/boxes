// Список «Объекты в сцене»: дерево групп, выделение нескольких, перетаскивание, группировка
import { $, $$, esc, fmt, toast } from '../core/util.js';
import { ICON } from '../core/constants.js';
import { sel, state } from '../core/state.js';
import { faceKeys } from '../core/model.js';
import { deleteItems, duplicateItem, flatTree, groupById, groupItems, isGroup, moveItem, normalizeTree, objectsIn, own, parentOf, renameById, setHidden, setLocked, siblingsOf, ungroup } from '../core/groups.js';
import { thumbOf } from './object-thumbs.js';
import { lidAction, toggleLid } from './context-menus.js';
import { setTab } from './tabs.js';
import { renderModel } from './model-panel.js';
import { renderGroupPanel } from './group-panel.js';
import { select, selectGroup } from '../core/selection.js';
import { commit } from '../core/project.js';
import { setView } from '../scene/camera.js';

const GROUP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
const objById = id => state.objects.find(o => o.id === id);
const dimsText = o => o.type === 'torte' || o.type === 'tube' ? `⌀${fmt(o.dims.w)}×${fmt(o.dims.h)}` : o.type === 'cup' ? `⌀${fmt(o.dims.w)}/${fmt(o.dims.d)}×${fmt(o.dims.h)}` : o.type === 'bag' && o.bagStyle !== 'block' ? `${fmt(o.dims.w)}×${fmt(o.dims.h)}` : `${fmt(o.dims.w)}×${fmt(o.dims.d)}×${fmt(o.dims.h)}`;
const count = n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'объект' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'объекта' : 'объектов'}`;
/* what the buttons act on: the items picked in the list, or the selected object */
const picked = () => { const ids = sel.multi.filter(id => own(id)); return ids.length ? ids : sel.obj ? [sel.obj] : []; };
let anchor = null;   // the row a Shift-click range starts from

/* rows of the tree, without the insides of closed groups */
function visibleRows() {
  const rows = flatTree(), out = []; let skip = Infinity;
  for (const r of rows) { if (r.depth > skip) continue; skip = Infinity; out.push(r); const g = groupById(r.id); if (g && !g.open) skip = r.depth; }
  return out;
}
function renderObjects() {
  normalizeTree();
  const on = new Set(sel.multi.length ? sel.multi : sel.obj ? [sel.obj] : []);
  $('#objList').innerHTML = visibleRows().map(({ id, depth }) => {
    const g = groupById(id), os = objectsIn(id).map(objById), hid = os.length && os.every(o => o.hidden), lck = os.length && os.every(o => o.locked);
    const cls = `obj ${g ? 'grp' : ''} ${on.has(id) ? 'on' : ''} ${hid ? 'hidden' : ''} ${lck ? 'locked' : ''}`;
    const acts = `<span class="acts">${rowActs(hid, lck)}</span>`;
    if (g) return `<div class="${cls}" data-id="${id}" style="--d:${depth}" tabindex="0" role="button" draggable="true">
      <button class="caret" data-open aria-label="${g.open ? 'Свернуть' : 'Развернуть'}" aria-expanded="${g.open}">${g.open ? '▾' : '▸'}</button>${GROUP_ICON}<span class="nm">${esc(g.name)}</span><span class="dm">${count(os.length)}</span>${acts}</div>`;
    const o = own(id), url = thumbOf(id);
    const th = url ? `<img class="th" src="${url}" alt="">` : `<span class="th">${ICON[o.type] || ICON.box}</span>`;
    return `<div class="${cls}" data-id="${id}" style="--d:${depth}" tabindex="0" role="button" draggable="true" title="${esc(o.name)} · ${dimsText(o)} мм">
      ${th}<span class="nm">${esc(o.name)}</span><span class="mods">${objMods(id, o).map(m => `<button class="mod" data-mod="${m.k}" title="${esc(m.t)}" aria-label="${esc(m.t)}">${ICON[m.i]}</button>`).join('')}</span><span class="dm mono">${dimsText(o)}</span>${acts}</div>`;
  }).join('') || '<div class="empty">Добавьте коробку, стакан или тубус</div>';
  $$('#objList .obj').forEach(el => {
    const id = el.dataset.id;
    el.onclick = e => {
      if (e.target.closest('[data-open]')) { const g = groupById(id); g.open = !g.open; renderObjects(); return; }
      const a = e.target.closest('[data-a]')?.dataset.a, mod = e.target.closest('[data-mod]')?.dataset.mod;
      if (a) { const ids = on.has(id) ? [...on] : [id], os = ids.flatMap(objectsIn).map(objById); a === 'vis' ? setHidden(ids, !os.every(o => o.hidden)) : setLocked(ids, !os.every(o => o.locked)); renderObjects(); commit(); return; }
      if (mod) return modAction(id, mod);
      if (e.ctrlKey || e.metaKey) { sel.multi = on.has(id) ? [...on].filter(x => x !== id) : [...on, id]; anchor = id; renderObjects(); return; }
      if (e.shiftKey && anchor) {
        const ids = visibleRows().map(r => r.id), a = ids.indexOf(anchor), b = ids.indexOf(id);
        if (a >= 0 && b >= 0) { sel.multi = ids.slice(Math.min(a, b), Math.max(a, b) + 1); renderObjects(); return; }
      }
      anchor = id;
      isGroup(id) ? selectGroup(id) : select(id, undefined, null);
    };
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
    el.ondragstart = e => {
      const ids = on.has(id) ? flatTree().map(r => r.id).filter(x => on.has(x)) : [id];
      e.dataTransfer.setData('application/x-bs-item', JSON.stringify(ids)); e.dataTransfer.effectAllowed = 'move';
    };
  });
}
/* lock and eye show on hover, as in the layer list, and stay while the object is locked or hidden */
const rowActs = (hid, lck) => `<button data-a="lock" class="${lck ? 'pin' : ''}" title="${lck ? 'Разблокировать' : 'Заблокировать: не выбирается и не двигается в сцене'}" aria-label="Блокировка">${lck ? ICON.lock : ICON.unlock}</button>
  <button data-a="vis" class="${hid ? 'pin' : ''}" title="${hid ? 'Показать' : 'Скрыть: не видно в сцене, в картинке и видео'}" aria-label="Видимость">${hid ? ICON.eyeOff : ICON.eye}</button>`;
/* what is going on with an object, as small marks in its row: { k: what a click does, i: icon, t: title } */
function objMods(id, o) {
  const m = [], lid = lidAction(o), g = parentOf(id);
  if (lid && o.lid > 0) m.push({ k: 'lid', i: 'lidOpen', t: `Открыто. Клик: ${lid[1].toLowerCase()}` });
  if (o.dieline) m.push({ k: 'net', i: 'dieline', t: 'Свой макет развёртки' });
  if (o.stickers?.length) m.push({ k: 'stickers', i: 'sticker', t: `Наклейки: ${o.stickers.length}` });
  if (g) m.push({ k: 'group', i: 'row', t: `В ряду группы «${g.name}»` });
  return m;
}
function modAction(id, k) {
  const o = objById(id);
  if (k === 'lid') { toggleLid(o).then(() => { renderObjects(); commit(); }); return; }
  if (k === 'group') { selectGroup(parentOf(id).id); return; }
  select(id, undefined, null); setTab(k);
}

/* ---------- drag rows to reorder or to move them into a group ---------- */
const isItemDrag = e => [...(e.dataTransfer?.types || [])].includes('application/x-bs-item');
/* where a drop lands: before / after a row, or into a group row (its middle) */
function dropZone(el, e) {
  const r = el.getBoundingClientRect(), t = (e.clientY - r.top) / r.height;
  if (el.classList.contains('grp')) return t < .25 ? 'before' : t > .75 ? 'after' : 'into';
  return t < .5 ? 'before' : 'after';
}
function clearMarks() { $$('#objList .drop-before, #objList .drop-after, #objList .drop-into').forEach(el => el.classList.remove('drop-before', 'drop-after', 'drop-into')); $('#objList').classList.remove('drop-end'); }
function dropItems(ids, el, zone) {
  let moved = false;
  if (!el) { for (const id of ids) moved = moveItem(id, null, null) || moved; return moved; }
  const target = el.dataset.id;
  if (zone === 'into') { for (const id of ids) moved = moveItem(id, target, null) || moved; return moved; }
  const gid = parentOf(target)?.id ?? null;
  let before = target;
  if (zone === 'after') { const l = siblingsOf(target); before = l[l.indexOf(target) + 1] ?? null; while (ids.includes(before)) { before = l[l.indexOf(before) + 1] ?? null; } }
  for (const id of ids) if (id !== target) moved = moveItem(id, gid, before) || moved;
  return moved;
}

/* ---------- actions (the buttons and the context menu) ---------- */
function groupIds(ids) {
  const g = groupItems(ids); if (!g) return;
  selectGroup(g.id); commit(); toast(`${g.name}: ${count(objectsIn(g.id).length)} в ряд. Порядок — как в списке`);
}
function ungroupIds(ids) {
  const gs = ids.filter(isGroup); if (!gs.length) return;
  const items = gs.flatMap(ungroup);
  const first = items.find(id => !isGroup(id)) ?? objectsIn(items[0])[0];
  select(first ?? state.objects[0]?.id ?? null, undefined, null); sel.multi = items; renderObjects(); commit();
}
function duplicateIds(ids) {
  if (!ids.length) return;
  const copies = ids.map(duplicateItem), c = copies[0];
  isGroup(c) ? selectGroup(c) : select(c, sel.face, null);
  sel.multi = copies; renderObjects(); commit(); setTimeout(() => setView('fit'), 60);
}
function deleteIds(ids) {
  if (!ids.length) return;
  const names = deleteItems(ids);
  sel.group = null; sel.multi = [];   // sel.obj still names the deleted one, so select() sees the change
  const next = state.objects[0];
  select(next?.id ?? null, next ? faceKeys(next)[0] : undefined, null); renderObjects(); commit();
  toast(`Удалено: ${names.join(', ')}. Вернуть — Ctrl+Z`);
}
/* takes an item out of its group: it stands right after the group, one level up */
function leaveGroup(id) {
  const g = parentOf(id); if (!g) return;
  const list = siblingsOf(g.id);
  moveItem(id, parentOf(g.id)?.id ?? null, list[list.indexOf(g.id) + 1] ?? null);
  renderObjects(); commit();
}

/* types a new name for an object or a group right in its row; Enter or a click away keeps it, Esc does not */
function renameRow(id) {
  const row = $(`#objList .obj[data-id="${id}"]`), nm = row && $('.nm', row); if (!nm || !row.offsetParent) return false;
  const inp = document.createElement('input'); inp.className = 'ren'; inp.value = own(id).name; inp.setAttribute('aria-label', 'Название');
  row.draggable = false; nm.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const end = save => {
    if (done) return; done = true;
    if (save && inp.value.trim() && inp.value.trim() !== own(id).name) {
      renameById(id, inp.value);
      isGroup(id) ? renderGroupPanel() : renderModel();
      if (id === sel.obj) $('#objBadge').textContent = own(id).name;
      commit();
    }
    renderObjects();
  };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') end(true); if (e.key === 'Escape') end(false); };
  inp.onblur = () => end(true);
  for (const t of ['click', 'dblclick', 'pointerdown']) inp.addEventListener(t, e => e.stopPropagation());
  return true;
}

/* hooks up the object list and its buttons */
function initObjectList() {
  const list = $('#objList');
  // a double click on a row renames the object or the group
  list.addEventListener('dblclick', e => {
    const row = e.target.closest('.obj'); if (!row || e.target.closest('button, input')) return;
    e.preventDefault(); renameRow(row.dataset.id);
  });
  list.addEventListener('dragover', e => {
    if (!isItemDrag(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; clearMarks();
    const el = e.target.closest('.obj');
    if (el) el.classList.add('drop-' + dropZone(el, e)); else list.classList.add('drop-end');
  });
  list.addEventListener('dragleave', e => { if (!list.contains(e.relatedTarget)) clearMarks(); });
  list.addEventListener('drop', e => {
    if (!isItemDrag(e)) return;
    e.preventDefault(); clearMarks();
    const el = e.target.closest('.obj'), ids = JSON.parse(e.dataTransfer.getData('application/x-bs-item') || '[]');
    if (dropItems(ids, el, el && dropZone(el, e))) { renderObjects(); commit(); }
  });
  // Ctrl+G groups, Ctrl+Shift+G ungroups (by key position, so it works in any keyboard layout); with layers
  // picked on a face the keys group those instead (scene/interaction.js)
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyG' || sel.layer || e.target.closest?.('input,textarea,select')) return;
    e.preventDefault(); e.shiftKey ? ungroupIds(picked()) : groupIds(picked());
  });
}

export { renameRow, deleteIds, duplicateIds, groupIds, initObjectList, leaveGroup, picked, renderObjects, ungroupIds };
