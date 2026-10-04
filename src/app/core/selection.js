// Выбор объекта, грани, слоя
import { activeObj, sel } from './state.js';
import { faceKeys } from './model.js';
import { RT, ui } from '../scene/renderer.js';
import { accent, focusSelected, orbitLock } from '../scene/camera.js';
import { renderModel, renderObjects } from '../ui/model-panel.js';
import { renderFacePanel, renderFaceTabs, renderLayerProps, renderLayers } from '../ui/face-panel.js';
import { renderStickers } from '../ui/stickers-panel.js';

function select(objId, face = undefined, layerId = null, { flash = false } = {}) {
  const changedObj = sel.obj !== objId;
  sel.obj = objId;
  if (changedObj) sel.sticker = null;
  const o = activeObj();
  if (o) {
    if (face !== undefined && face && faceKeys(o).includes(face)) sel.face = face;
    else if (!faceKeys(o).includes(sel.face)) sel.face = faceKeys(o)[0];
  } else sel.face = null;
  sel.layer = layerId;
  if (flash && o) { const f = RT.get(o.id)?.faces[sel.face]; if (f) { f.flash = 1; accent.set(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0a7aa1'); } }
  if (changedObj) { renderObjects(); renderModel(); renderStickers(); if (orbitLock) focusSelected(); }
  renderFaceTabs(); renderFacePanel(); renderLayers(); renderLayerProps();
  ui.editor = ui.net = ui.lib = true;
}
function selectLayer(id) { ui.lib = true; sel.layer = id; if (id && sel.sticker) { sel.sticker = null; ui.stickers = true; } renderLayers(); renderLayerProps(); ui.editor = true; }

export { select, selectLayer };
