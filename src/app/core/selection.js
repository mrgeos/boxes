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

function select(objId, face = undefined, layerId = null, { flash = false } = {}) {
  const changedObj = sel.obj !== objId, leftGroup = !!sel.group;
  sel.obj = objId; sel.group = null; sel.multi = objId ? [objId] : [];
  if (changedObj) sel.sticker = null;
  const o = activeObj();
  if (o) {
    if (face !== undefined && face && faceKeys(o).includes(face)) sel.face = face;
    else if (!faceKeys(o).includes(sel.face)) sel.face = faceKeys(o)[0];
  } else sel.face = null;
  setLayerSelection(layerId ? [layerId] : []);
  if (flash && o) { const f = RT.get(o.id)?.faces[sel.face]; if (f) { f.flash = 1; accent.set(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0a7aa1'); } }
  if (changedObj || leftGroup) { renderObjects(); renderModel(); }
  if (changedObj) { renderStickers(); if (orbitLock) focusSelected(); }
  renderFaceTabs(); renderFacePanel(); renderLayers(); renderLayerProps();
  ui.editor = ui.net = ui.lib = true;
}
function selectLayer(id) { pickLayers(id ? [id] : []); }
/* picks several layers of the active face (main: the one whose properties are shown) */
function pickLayers(ids, main = ids.at(-1)) {
  ui.lib = true; setLayerSelection(ids, main);
  if (ids.length && sel.sticker) { sel.sticker = null; ui.stickers = true; }
  renderLayers(); renderLayerProps(); ui.editor = true; invalidate();
}

/* shows a group's settings; its first object (or the selected one, if inside) stays active for the face panels */
function selectGroup(gid) {
  const objs = objectsIn(gid);
  select(objs.includes(sel.obj) ? sel.obj : objs[0] ?? null, undefined, null);
  sel.group = gid; sel.multi = [gid];
  renderObjects(); renderModel();
}

export { pickLayers, select, selectGroup, selectLayer };
