// Общие свойства нескольких объектов: материал меняется у всех выбранных сразу
import { state } from './state.js';
import { objectsIn } from './groups.js';
import { setBoard } from './model.js';
import { setFlute } from '../carriers/corrugated.js';
import { applyObjMaterials, markObj, rebuildQueue } from '../scene/renderer.js';

/* The settings several objects share, set on all of them at once. A setting goes only to the objects it fits
   (the board grade to boxes; a 3D model has none of these); the others keep theirs. */
const SETTINGS = {
  board: { fits: o => o.type !== 'model' },
  flute: { fits: o => o.type === 'box' },
  whiteInside: { fits: o => o.type !== 'model' && o.type !== 'board' },
  finish: { fits: o => o.type !== 'model' },
  grain: { fits: o => o.type !== 'model' && o.type !== 'board' },
  edge: { fits: o => ['box', 'dome', 'board'].includes(o.type) },
};
/* the objects of these items (a group brings all of its own), each once */
const objectsOf = ids => [...new Set(ids.flatMap(objectsIn))].map(id => state.objects.find(o => o.id === id)).filter(Boolean);
/* the objects of these items a setting fits */
const fitting = (ids, k) => objectsOf(ids).filter(SETTINGS[k].fits);
/* the setting's value if all those objects agree on it, else undefined (shown as «разные») */
function commonValue(ids, k) {
  const os = fitting(ids, k); if (!os.length) return undefined;
  const val = o => k === 'flute' ? o.flute || '' : k === 'whiteInside' ? o.whiteInside !== false : o[k];
  const v = val(os[0]);
  return os.every(o => val(o) === v) ? v : undefined;
}
/* sets a setting on every object of these items it fits */
function setOnAll(ids, k, v) {
  for (const o of fitting(ids, k)) {
    if (k === 'board') setBoard(o, v);
    else if (k === 'flute') { setFlute(o, v); rebuildQueue.add(o.id); }
    else if (k === 'whiteInside') { o.whiteInside = v; setBoard(o, o.board); }
    else o[k] = v;
    applyObjMaterials(o); markObj(o);
  }
}

export { SETTINGS, commonValue, fitting, objectsOf, setOnAll };
