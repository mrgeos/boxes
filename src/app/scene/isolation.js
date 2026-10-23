// Изоляция: на сцене остаётся только выбранное. Это вид, а не данные проекта: в файл и историю не попадает
import { sel, state } from '../core/state.js';
import { isGroup, objectsIn, own } from '../core/groups.js';
import { select, selectGroup, pickItems } from '../core/selection.js';
import { applyTransform } from './renderer.js';
import { camPose, frameItems, goPose, invalidate, updateShadowCam } from './camera.js';

/* While it is on, every object but the isolated ones is hidden (really: its group is not visible, so it is neither
   drawn, picked, nor casts a shadow). `objs` are the isolated objects (a group isolates all its members as they
   are now), `roots` the items asked for (for the plate's name), `known` the objects there were when it began:
   one made later (a new object, a copy) is not in it and so is shown, it joins the isolation. `cam` is where the
   camera stood before, for the way out. */
let iso = null;
const objById = id => state.objects.find(o => o.id === id) || null;

/* is this object drawn: not hidden by its eye, and not left out by the isolation */
function isShown(o) { return !o.hidden && (!iso || !iso.known.has(o.id) || iso.objs.has(o.id)); }
/* the isolated objects (ids), or null when nothing is isolated */
const isolation = () => (iso ? [...iso.objs] : null);
const isolated = () => !!iso;
/* is this item (an object or a group) in the isolation, wholly or in part */
const inIsolation = id => !iso || objectsIn(id).some(x => iso.objs.has(x));
/* the items asked for, to extend the isolation with more */
const isolationRoots = () => (iso ? iso.roots.filter(own) : []);
const WORD = n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'объект' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'объекта' : 'объектов'}`;
/* what the plate names: the item, or «3 объекта» */
function isolationLabel() {
  if (!iso) return '';
  const r = iso.roots.filter(own);
  return r.length === 1 ? own(r[0]).name : WORD(iso.objs.size);
}
/* what the keys and buttons isolate: the picked items, else the selected object */
function selectedItems() { const ids = sel.multi.filter(own); return ids.length ? ids : sel.obj ? [sel.obj] : []; }

function show() { for (const o of state.objects) applyTransform(o, false); updateShadowCam(); invalidate(); }

/* isolates these items (objects or groups; null or none: leaves). The camera moves to frame them; leaving brings it
   back to where it was before the first isolation. false when there is nothing to show (all hidden by their eyes) */
function setIsolation(ids) {
  if (!ids || !ids.length) { exitIsolation(); return true; }
  const roots = [...new Set(ids)].filter(own);
  const objs = new Set(roots.flatMap(objectsIn).filter(id => !objById(id).hidden));
  if (!objs.size) return false;
  iso = { objs, roots, known: new Set(state.objects.map(o => o.id)), cam: iso ? iso.cam : camPose() };
  show();
  // the selection stays among what is shown
  const within = id => objectsIn(id).some(x => objs.has(x));
  if (sel.multi.length > 1) { const keep = sel.multi.filter(within); if (keep.length !== sel.multi.length) pickItems(keep); }
  else if (sel.group ? !within(sel.group) : sel.obj && !objs.has(sel.obj)) { const r = roots[0]; if (isGroup(r)) selectGroup(r); else select(r, undefined, null, { focus: false }); }
  frameItems([...objs]);
  return true;
}
/* leaves the isolation; the camera goes back (unless a new project is being opened) */
function exitIsolation({ camera = true } = {}) {
  if (!iso) return;
  const cam = iso.cam; iso = null;
  show();
  if (camera) goPose(cam);
}
/* on when off, off when on: for the key and the buttons */
function toggleIsolation(ids = selectedItems()) { if (iso) { exitIsolation(); return true; } return setIsolation(ids); }
/* more items join the isolation (a dimmed row of the list was picked together with others) */
function joinIsolation(ids) { if (!iso) return; const more = ids.filter(id => !inIsolation(id)); if (more.length) setIsolation([...isolationRoots(), ...more]); }
/* the layout calls this after objects were deleted or changed: gone objects leave it, and the last one's going ends it */
function pruneIsolation() {
  if (!iso) return;
  for (const id of iso.objs) if (!objById(id)) iso.objs.delete(id);
  if (!iso.objs.size) { const cam = iso.cam; iso = null; goPose(cam); }
}

export { exitIsolation, inIsolation, isShown, isolated, isolation, isolationLabel, isolationRoots, joinIsolation, pruneIsolation, selectedItems, setIsolation, toggleIsolation };
