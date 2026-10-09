// 3D-модель как объект сцены: круассан, торт или своя модель стоит на полу рядом с упаковкой
import { uid } from '../core/util.js';
import { clampSize, modelName, modelShape, placeModel } from '../core/models3d.js';

/* An object of type 'model' shows a model ({ lib } or { asset }) at its size: o.size, the longest side in mm.
   It has no print faces; it moves, turns, groups and hides as any object. Its dims follow the model's
   proportions once it is loaded (until then they are a cube of its size). */
function newModelObject(ref, { name, size = 120 } = {}) {
  const s = clampSize(size);
  return { id: uid(), type: 'model', name: name || modelName(ref), model: { ...ref }, size: s, dims: { w: s, h: s, d: s }, lid: 0, thickness: 1, finish: 'matte', edge: '#ffffff',
    grain: 0, dieline: null, pos: { x: 0, z: 0 }, rotY: 0, faces: {}, board: '#ffffff', whiteInside: true, window: null, stickers: [] };
}
function buildModelObject(o, rt) {
  const sh = modelShape(o.model), s = clampSize(o.size);
  if (sh) { o.dims.w = Math.round(sh[0] * s); o.dims.h = Math.round(sh[1] * s); o.dims.d = Math.round(sh[2] * s); }
  placeModel(rt.group, o, o.model, { size: s });
}

export { buildModelObject, newModelObject };
