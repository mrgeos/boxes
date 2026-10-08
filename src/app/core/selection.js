// Выбор объекта, грани, слоя
import { activeObj, sel } from './state.js';
import { faceKeys } from './model.js';
import { RT, ui } from '../scene/renderer.js';
import { accent, focusSelected, invalidate, orbitLock } from '../scene/camera.js';
import { setLayerSelection } from './layers.js';
import { renderModel } from '../ui/model-panel.js';
import { renderObjects } from '../ui/object-list.js';
import { objectsIn } from './groups.js';
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

/* an extra of the object as an object of its own: a sticker, a ribbon, a sleeve or a carrier (core/extras.js) */
function selectExtra(objId, id) {
  if (isPart(id)) { select(objId, id, null); return; }
  select(objId, undefined, null);
  // a sticker or a ribbon
  const rb = extraById(activeObj(), id)?.kind === 'ribbon';
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

export { pickLayers, select, selectExtra, selectGroup, selectLayer, selectObjectItself };
