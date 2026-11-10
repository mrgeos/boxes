// Перенос дизайна: слои с граней, которых не стало после смены конструкции или размера
import { ensureFaces, faceKeys, faceMM, loopAxis } from './model.js';
import { isSheetKey } from './sheet.js';
import { isStickerKey } from '../stickers/design.js';
import { LID_WALLS } from './constants.js';
import { reflowLayers, reflowObject, setWarn } from './pins.js';
import { markFace, rebuildQueue, ui } from '../scene/renderer.js';

/* Where the layers of a face go when it is gone, the first one the new construction has. A face that is not here
   (the sleeve, the tissue, the inside) is only hidden and comes back with its layers when the construction does. */
const WALL = { lidFront: 'front', lidRight: 'right', lidLeft: 'left', lidBack: 'back' };
const FACE_FALLBACK = {
  flap: ['top'], earLeft: ['left'], earRight: ['right'], trayFront: ['front'],
  ...Object.fromEntries(LID_WALLS.map(k => [k, [WALL[k]]])),
  roofFront: ['top', 'front'], roofBack: ['back'], rightTop: ['right'], rightBottom: ['right'], leftTop: ['left'], leftBottom: ['left'],
  wrap: ['front'], lidWrap: ['top', 'front'], top: ['roofFront', 'lidWrap'], right: ['rightTop'], left: ['leftTop'], front: ['wrap'],
};
/* puts the layers of a gone face (mm: its size) on face `to` of o, on top of the stack, marked as moved */
function drop(o, to, from, layers, groups, mm) {
  const t = o.faces[to], size = faceMM(o, to);
  reflowLayers(layers, mm || size, size, loopAxis(o, to));
  for (const L of layers) { setWarn(L, { kind: 'face', from }); if (L.group && groups?.[L.group]) (t.groups ??= {})[L.group] = groups[L.group]; }
  t.layers.push(...layers); markFace(o, to); ui.layers = true;
}
/* after a change of construction: the layers of faces that are gone (and have a place to go) move to the faces the
   table names, or wait in o.unplaced for the user to put them */
function transferFaces(o) {
  reflowObject(o);
  const keys = faceKeys(o), res = { moved: 0, unplaced: 0 };
  for (const k of Object.keys(o.faces)) {
    const f = o.faces[k];
    if (!FACE_FALLBACK[k] || keys.includes(k) || isSheetKey(k) || isStickerKey(k) || !f.layers.length) continue;
    const to = FACE_FALLBACK[k].find(c => keys.includes(c)), layers = f.layers.splice(0), groups = f.groups;
    if (to) { drop(o, to, k, layers, groups, f.mm); res.moved += layers.length; }
    else { (o.unplaced ??= []).push({ from: k, mm: f.mm || [0, 0], layers, groups: groups || {} }); res.unplaced += layers.length; ui.layers = true; }
  }
  return res;
}
/* puts the waiting layers number `index` on face k */
function placeUnplaced(o, index, k) {
  const e = o.unplaced?.[index];
  if (!e || !faceKeys(o).includes(k) || !o.faces[k]) return false;
  o.unplaced.splice(index, 1);
  if (!o.unplaced.length) delete o.unplaced;
  drop(o, k, e.from, e.layers, e.groups, e.mm[0] > 0 ? e.mm : null);
  return true;
}
/* new size in mm (w, h, d), the way the size fields do it: the faces are laid out again when the object is built */
function setDims(o, dims) {
  for (const k of ['w', 'h', 'd']) if (dims[k] != null && dims[k] >= 5) o.dims[k] = Math.round(dims[k]);
  rebuildQueue.add(o.id); ui.net = true; return true;
}
/* another lid construction, the way the «Конструкция» field does it */
function setLidType(o, lt) {
  o.lidType = lt;
  if (lt === 'pyramid' || lt === 'hexagon') o.sides = lt === 'pyramid' ? 4 : 6;
  if (lt === 'gable') { o.roofH ??= Math.round(o.dims.d * .45); o.gripH ??= Math.round(Math.min(80, o.dims.w * .3)); }
  ensureFaces(o); transferFaces(o); rebuildQueue.add(o.id); ui.net = true; return true;
}

export { FACE_FALLBACK, placeUnplaced, setDims, setLidType, transferFaces };
