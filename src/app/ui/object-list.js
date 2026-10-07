// Список «Объекты в сцене»: дерево групп, выделение нескольких, перетаскивание, группировка
import { $, $$, esc, fmt, toast } from '../core/util.js';
import { ICON } from '../core/constants.js';
import { sel, state } from '../core/state.js';
import { faceKeys } from '../core/model.js';
import { deleteItems, duplicateItem, flatTree, groupById, groupItems, isGroup, moveItem, normalizeTree, objectsIn, own, parentOf, siblingsOf, ungroup } from '../core/groups.js';
import { select, selectGroup } from '../core/selection.js';
import { commit } from '../core/project.js';
import { setView } from '../scene/camera.js';

const GROUP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
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
    const g = groupById(id);
    if (g) return `<div class="obj grp ${on.has(id) ? 'on' : ''}" data-id="${id}" style="--d:${depth}" tabindex="0" role="button" draggable="true">
      <button class="caret" data-open aria-label="${g.open ? 'Свернуть' : 'Развернуть'}" aria-expanded="${g.open}">${g.open ? '▾' : '▸'}</button>${GROUP_ICON}<span class="nm">${esc(g.name)}</span><span class="dm">${count(objectsIn(id).length)}</span></div>`;
    const o = own(id);
    return `<div class="obj ${on.has(id) ? 'on' : ''}" data-id="${id}" style="--d:${depth}" tabindex="0" role="button" draggable="true">
      ${ICON[o.type] || ICON.box}<span class="nm">${esc(o.name)}</span><span class="dm mono">${dimsText(o)}</span></div>`;
  }).join('') || '<div class="empty">Добавьте коробку, стакан или тубус</div>';
  $$('#objList .obj').forEach(el => {
    const id = el.dataset.id;
    el.onclick = e => {
      if (e.target.closest('[data-open]')) { const g = groupById(id); g.open = !g.open; renderObjects(); return; }
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
  const ids = picked();
  $('#dupObjBtn').disabled = $('#delObjBtn').disabled = $('#groupBtn').disabled = !ids.length;
  $('#ungroupBtn').disabled = !ids.some(isGroup);
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

/* hooks up the object list and its buttons */
function initObjectList() {
  const list = $('#objList');
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
  $('#groupBtn').onclick = () => groupIds(picked());
  $('#ungroupBtn').onclick = () => ungroupIds(picked());
  $('#dupObjBtn').onclick = () => duplicateIds(picked());
  $('#delObjBtn').onclick = () => deleteIds(picked());
  // Ctrl+G groups, Ctrl+Shift+G ungroups (by key position, so it works in any keyboard layout); with layers
  // picked on a face the keys group those instead (scene/interaction.js)
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyG' || sel.layer || e.target.closest?.('input,textarea,select')) return;
    e.preventDefault(); e.shiftKey ? ungroupIds(picked()) : groupIds(picked());
  });
}

export { deleteIds, duplicateIds, groupIds, initObjectList, leaveGroup, picked, renderObjects, ungroupIds };
