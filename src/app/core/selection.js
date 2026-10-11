// Выбор объекта, грани, слоя
import { activeObj, sel, state } from './state.js';
import { faceKeys } from './model.js';
import { RT, ui } from '../scene/renderer.js';
import { accent, focusSelected, frameItems, invalidate, orbitLock } from '../scene/camera.js';
import { setLayerSelection } from './layers.js';
import { renderModel } from '../ui/model-panel.js';
import { renderObjects } from '../ui/object-list.js';
import { groupById, objectsIn, topOf } from './groups.js';
import { renderFacePanel, renderFaceTabs, renderLayerProps, renderLayers } from '../ui/face-panel.js';
import { renderStickers } from '../ui/stickers-panel.js';
import { refreshTabs } from '../ui/tabs.js';
import { extraById, isPart } from './extras.js';

function select(objId, face = undefined, layerId = null, { flash = false } = {}) {
  const changedObj = sel.obj !== objId, leftGroup = !!sel.group, part0 = sel.part;
  sel.obj = objId; sel.group = null; sel.multi = objId ? [objId] : [];
  if (changedObj) { sel.sticker = null; sel.ribbon = null; sel.part = null; }
  const o = activeObj();
  if (o) {
    if (face !== undefined && face && faceKeys(o).includes(face)) sel.face = face;
    else if (!faceKeys(o).includes(sel.face)) sel.face = faceKeys(o)[0];
    // the face of a sleeve or a carrier selects that part; any other face, the object itself
    if (face && faceKeys(o).includes(face)) sel.part = isPart(face) ? face : null;
    if (sel.part && !faceKeys(o).includes(sel.part)) sel.part = null;
    if (sel.part) sel.face = sel.part;
    else if (isPart(sel.face)) sel.face = faceKeys(o).find(k => !isPart(k)) ?? sel.face;
  } else { sel.face = null; sel.part = null; }
  setLayerSelection(layerId ? [layerId] : []);
  if (flash && o) { const f = RT.get(o.id)?.faces[sel.face]; if (f) { f.flash = 1; accent.set(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0a7aa1'); } }
  // the shape panel shows the object or its sleeve / carrier
  if (changedObj || leftGroup || sel.part !== part0) { renderObjects(); renderModel(); }
  if (changedObj) { if (orbitLock) focusSelected(); }
  renderStickers(); refreshTabs();
  renderFaceTabs(); renderFacePanel(); renderLayers(); renderLayerProps();
  ui.editor = ui.net = ui.lib = true;
}
function selectLayer(id) { pickLayers(id ? [id] : []); }
/* picks several layers of the active face (main: the one whose properties are shown) */
function pickLayers(ids, main = ids.at(-1)) {
  ui.lib = true; setLayerSelection(ids, main);
  if (ids.length && (sel.sticker || sel.ribbon)) { sel.sticker = sel.ribbon = null; ui.stickers = true; }
  renderLayers(); renderLayerProps(); ui.editor = true; invalidate();
}

/* shows a group's settings; its first object (or the selected one, if inside) stays active for the face panels */
function selectGroup(gid) {
  const objs = objectsIn(gid);
  select(objs.includes(sel.obj) ? sel.obj : objs[0] ?? null, undefined, null);
  sel.group = gid; sel.multi = [gid];
  renderObjects(); renderModel();
}

/* the next (d = 1) or previous (d = −1) item at the top of the object list — an object, or a whole group as one —
   picked and framed from the same side; round the end to the start; items with nothing shown are passed over */
function stepItem(d) {
  const shown = id => objectsIn(id).some(oid => !state.objects.find(o => o.id === oid)?.hidden);
  const items = state.tree.filter(shown); if (!items.length) return null;
  const cur = sel.group || sel.obj, top = cur ? topOf(cur)?.id || cur : null, at = items.indexOf(top);
  const next = items[at < 0 ? (d > 0 ? 0 : items.length - 1) : (at + d + items.length) % items.length];
  if (groupById(next)) selectGroup(next); else select(next, undefined, null);
  frameItems(objectsIn(next));
  return next;
}

/* an extra of the object as an object of its own: a sticker, a ribbon, a sleeve or a carrier (core/extras.js) */
function selectExtra(objId, id) {
  if (isPart(id)) { select(objId, id, null); return; }
  select(objId, undefined, null);
  // a sticker or a ribbon
  const kd = extraById(activeObj(), id)?.kind, rb = kd === 'ribbon' || kd === 'fill';
  sel.sticker = rb ? null : id; sel.ribbon = rb ? id : null; sel.part = null; setLayerSelection([]);
  renderObjects(); renderStickers(); renderLayers(); renderLayerProps(); refreshTabs(); invalidate();
}
/* back from an extra to the object itself */
function selectObjectItself() {
  const o = activeObj(); if (!o) return;
  sel.sticker = null; sel.ribbon = null;
  select(o.id, sel.part ? faceKeys(o).find(k => !isPart(k)) : undefined, null);
  renderObjects(); renderStickers(); refreshTabs();
}

export { pickLayers, select, selectExtra, selectGroup, selectLayer, selectObjectItself, stepItem };
