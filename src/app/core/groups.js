// Группы объектов: дерево, раскладка «ряд», положение в сцене
import { DEG, uid } from './util.js';
import { state } from './state.js';
import { RT, applyTransform, buildObject, disposeObject } from '../scene/renderer.js';
import { invalidate, updateShadowCam } from '../scene/camera.js';

/* The scene is a tree: state.tree lists the top-level items (object and group ids) in list order, each group
   in state.groups lists its own items. An object at the top level stands where its pos / rotY say; a group's
   items are laid out in a row (along x or z, a gap in mm between their footprints, aligned across the row)
   around the group's origin, and the group stands where its own pos / rotY say, or is laid out in turn by its
   parent group. Items keep their own rotation inside a group. */
const GROUP_DEFAULTS = { dir: 'x', gap: 20, align: 'center', pos: { x: 0, z: 0 }, rotY: 0, open: true };
const groupById = id => state.groups.find(g => g.id === id) || null;
const objById = id => state.objects.find(o => o.id === id) || null;
const isGroup = id => !!groupById(id);
const parentOf = id => state.groups.find(g => g.items.includes(id)) || null;
const siblingsOf = id => parentOf(id)?.items ?? state.tree;
/* the item's own transform: what pos / rotY it has (a top-level item) or keeps inside its group */
const own = id => groupById(id) || objById(id);
function ancestors(id) { const out = []; for (let p = parentOf(id); p; p = parentOf(p.id)) out.push(p); return out; }
const topOf = id => ancestors(id).at(-1) || null;
const inside = (id, gid) => ancestors(id).some(g => g.id === gid);
/* object ids inside an item, in list order */
function objectsIn(id) { const g = groupById(id); return g ? g.items.flatMap(objectsIn) : objById(id) ? [id] : []; }
/* hidden objects are not drawn (nor in pictures and videos); locked ones are not picked or dragged in the scene.
   ids: objects or groups (all the objects in them) */
function setHidden(ids, on) { for (const id of ids.flatMap(objectsIn)) { const o = objById(id); if (on) o.hidden = true; else delete o.hidden; applyTransform(o, false); } updateShadowCam(); }
function setLocked(ids, on) { for (const id of ids.flatMap(objectsIn)) { const o = objById(id); if (on) o.locked = true; else delete o.locked; } }
/* every item in list order, depth first */
function flatTree() { const out = []; const go = (list, depth) => { for (const id of list) { out.push({ id, depth }); const g = groupById(id); if (g) go(g.items, depth + 1); } }; go(state.tree, 0); return out; }

/* makes the tree match the objects: drops unknown and repeated ids, puts new objects (and lost groups) at the
   top level, removes empty groups and fills in group settings */
function normalizeTree() {
  state.groups ??= []; state.tree ??= [];
  const objs = new Set(state.objects.map(o => o.id)), gmap = new Map(state.groups.map(g => [g.id, g])), seen = new Set();
  const walk = list => {
    const out = list.filter(id => { if (seen.has(id) || (!objs.has(id) && !gmap.has(id))) return false; seen.add(id); return true; });
    for (const id of out) { const g = gmap.get(id); if (g) g.items = walk(g.items || []); }
    return out;
  };
  state.tree = walk(state.tree);
  for (const g of state.groups) if (!seen.has(g.id)) { seen.add(g.id); g.items = walk(g.items || []); state.tree.push(g.id); }
  for (const o of state.objects) if (!seen.has(o.id)) { seen.add(o.id); state.tree.push(o.id); }
  const prune = list => list.filter(id => { const g = gmap.get(id); if (!g) return true; g.items = prune(g.items); return g.items.length > 0; });
  state.tree = prune(state.tree);
  const live = new Set(flatTree().map(x => x.id));
  state.groups = state.groups.filter(g => live.has(g.id));
  for (const g of state.groups) for (const [k, v] of Object.entries(GROUP_DEFAULTS)) g[k] ??= structuredClone(v);
}

/* ---------- layout ---------- */
// rotation about the vertical axis, the same way three.js turns an object by rotation.y
function rotXZ(x, z, deg) { const a = deg * DEG, c = Math.cos(a), s = Math.sin(a); return [x * c + z * s, -x * s + z * c]; }
function rotBox(b, deg) {
  if (!deg) return { ...b };
  const r = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) {
    const [u, v] = rotXZ(x, z, deg); r.x0 = Math.min(r.x0, u); r.x1 = Math.max(r.x1, u); r.z0 = Math.min(r.z0, v); r.z1 = Math.max(r.z1, v);
  }
  return r;
}
/* an object's footprint in its own frame (mm): measured from its geometry when built, else from its size */
function objFoot(o) { const f = RT.get(o.id)?.foot; if (f) return f; const { w, d } = o.dims, dd = o.type === 'cup' || o.type === 'tube' || o.type === 'torte' ? w : d; return { x0: -w / 2, x1: w / 2, z0: -dd / 2, z1: dd / 2 }; }
/* the item's footprint in its parent's frame when it stands at the parent's origin, own rotation applied */
function itemBox(id) { const g = groupById(id); return g ? rotBox(layoutGroup(g), g.rotY) : rotBox(objFoot(objById(id)), objById(id).rotY); }
/* places a group's items in a row (into slots); returns the row's footprint, centred on the group's origin */
function layoutGroup(g) {
  const ax = g.dir === 'z' ? 'z' : 'x', cr = ax === 'x' ? 'z' : 'x', at = [];
  let cur = 0;
  for (const id of g.items) {
    const b = itemBox(id), a = cur - b[ax + '0'];
    const c = g.align === 'start' ? -b[cr + '0'] : g.align === 'end' ? -b[cr + '1'] : -(b[cr + '0'] + b[cr + '1']) / 2;
    at.push({ id, a, c, b }); cur += b[ax + '1'] - b[ax + '0'] + g.gap;
  }
  const r = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const { a, c, b } of at) {
    r[ax + '0'] = Math.min(r[ax + '0'], a + b[ax + '0']); r[ax + '1'] = Math.max(r[ax + '1'], a + b[ax + '1']);
    r[cr + '0'] = Math.min(r[cr + '0'], c + b[cr + '0']); r[cr + '1'] = Math.max(r[cr + '1'], c + b[cr + '1']);
  }
  const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
  slots.set(g.id, new Map(at.map(({ id, a, c }) => { const [x, z] = ax === 'x' ? [a, c] : [c, a]; return [id, [x - mx, z - mz]]; })));
  return { x0: r.x0 - mx, x1: r.x1 - mx, z0: r.z0 - mz, z1: r.z1 - mz };
}
const place = new Map();   // id -> { x, z, rot }: where an item stands in the scene, mm and degrees
const slots = new Map();   // group id -> Map(item id -> [x, z]): where its items stand in its own frame
const placeOf = o => place.get(o.id) || { x: o.pos.x, z: o.pos.z, rot: o.rotY };
/* lays out every group and moves the objects to their places */
let pending = false;
function layoutAll() {
  pending = false;
  normalizeTree();
  place.clear();
  const put = (id, x, z, rot) => {
    place.set(id, { x, z, rot });
    const g = groupById(id); if (!g) return;
    layoutGroup(g);
    for (const c of g.items) { const [lx, lz] = slots.get(g.id).get(c), [wx, wz] = rotXZ(lx, lz, rot); put(c, x + wx, z + wz, rot + own(c).rotY); }
  };
  for (const id of state.tree) { const t = own(id); put(id, t.pos.x, t.pos.z, t.rotY); }
  for (const o of state.objects) applyTransform(o, false);
  updateShadowCam();
}
/* asks for a layout in the next frame: several rebuilt objects then cost one layout */
function layoutSoon() { pending = true; invalidate(); }
/* the render loop runs the layout asked for; true when it did */
function layoutPending() { if (!pending) return false; layoutAll(); return true; }
/* where an item stands and its footprint in its own frame (unturned): the floor ring draws it */
function itemFrame(id) { const p = place.get(id), g = groupById(id), o = objById(id); if (!p || (!g && !o)) return null; return { ...p, box: g ? layoutGroup(g) : objFoot(o) }; }
/* where an item's items stand in its frame (a group's slots), for dragging one along the row */
const slotsOf = gid => slots.get(gid);
/* the item's place in the scene written into its own pos / rotY, so it stays put when it leaves its group */
const norm = a => ((a + 180) % 360 + 360) % 360 - 180;
function bake(id) { const p = place.get(id), t = own(id); if (!p || !t) return; t.pos = { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 }; t.rotY = Math.round(norm(p.rot) * 10) / 10; }

/* ---------- editing the tree ---------- */
/* an item's rotation inside the group `gid` (null: the scene) that keeps it turned as it stands now */
const relRot = (id, gid) => norm(place.get(id).rot - (gid ? place.get(gid).rot : 0));
/* groups items (and keeps their order in the list); the group takes the place of the first one */
function groupItems(ids) {
  layoutAll();
  const order = flatTree().map(x => x.id);
  ids = ids.filter(id => !ids.some(a => a !== id && inside(id, a))).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (!ids.length) return null;
  const parent = parentOf(ids[0]), list = siblingsOf(ids[0]);
  let cx = 0, cz = 0; for (const id of ids) { const p = place.get(id); cx += p.x / ids.length; cz += p.z / ids.length; }
  const n = Math.max(0, ...state.groups.map(x => +(/^Группа (\d+)$/.exec(x.name)?.[1] ?? 0))) + 1;
  const g = { id: uid(), name: 'Группа ' + n, ...structuredClone(GROUP_DEFAULTS), items: ids, pos: parent ? { x: 0, z: 0 } : { x: Math.round(cx), z: Math.round(cz) } };
  for (const id of ids) own(id).rotY = relRot(id, parent?.id ?? null);   // the new group is turned like its parent
  list[list.indexOf(ids[0])] = g.id;
  for (const id of ids.slice(1)) { const l = siblingsOf(id); l.splice(l.indexOf(id), 1); }
  state.groups.push(g);
  layoutAll();
  return g;
}
/* the group's items take its place; each stays where it stands */
function ungroup(gid) {
  const g = groupById(gid); if (!g) return [];
  layoutAll();
  const list = siblingsOf(gid), at = list.indexOf(gid), items = [...g.items];
  for (const id of items) { if (list === state.tree) bake(id); else own(id).rotY = norm(own(id).rotY + g.rotY); }   // turned as before
  list.splice(at, 1, ...items); g.items = [];
  layoutAll();
  return items;
}
/* moves an item into a group (null: the top level) before the item `before` (null: at the end) */
function moveItem(id, gid, before = null) {
  if (id === gid || (gid && inside(gid, id)) || id === before) return false;
  layoutAll();
  const from = siblingsOf(id), to = gid ? groupById(gid)?.items : state.tree; if (!to) return false;
  if (to === state.tree) { if (from !== state.tree) bake(id); } else own(id).rotY = relRot(id, gid);
  from.splice(from.indexOf(id), 1);
  const i = before ? to.indexOf(before) : -1; to.splice(i < 0 ? to.length : i, 0, id);
  layoutAll();
  return true;
}
/* deletes items with everything inside; returns the names for the message */
function deleteItems(ids) {
  const objs = new Set(ids.flatMap(objectsIn)), names = ids.map(id => own(id)?.name).filter(Boolean);
  for (const id of objs) disposeObject(id);
  state.objects = state.objects.filter(o => !objs.has(o.id));
  layoutAll();
  return names;
}
/* a copy of an item (a group with copies of everything inside) right after it; a top-level copy stands beside it */
function duplicateItem(id) {
  const copy = src => {
    const g = groupById(src);
    if (g) { const c = { ...structuredClone(g), id: uid(), items: g.items.map(copy) }; state.groups.push(c); return c.id; }
    const o = structuredClone(objById(src)); o.id = uid(); state.objects.push(o); buildObject(o); return o.id;
  };
  layoutAll();
  const c = copy(id), t = own(c), list = siblingsOf(id);
  t.name = own(id).name + ' (копия)';
  list.splice(list.indexOf(id) + 1, 0, c);
  if (list === state.tree) { const b = itemBox(id); t.pos.x = Math.round(t.pos.x + b.x1 - b.x0 + 40); }
  layoutAll();
  return c;
}

export { GROUP_DEFAULTS, setHidden, setLocked, ancestors, itemFrame, layoutPending, layoutSoon, slotsOf, deleteItems, duplicateItem, flatTree, groupById, groupItems, inside, isGroup, itemBox, layoutAll, moveItem, normalizeTree, objectsIn, own, parentOf, placeOf, rotXZ, siblingsOf, topOf, ungroup };
