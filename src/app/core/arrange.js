// Выравнивание и расстановка нескольких объектов на полу: по краю или центру, равные промежутки, ряд с шагом
import { itemFrame, layoutAll, own, parentOf, rotXZ } from './groups.js';

/* Works on items at the top of the object list (an object or a whole group); an item inside a group keeps its
   place in the row and is left out. X is the scene's width (left to right), Z its depth (back to front, the
   camera's default side). Sizes are footprints on the floor as they stand, turned, in mm. */
const free = ids => ids.filter(id => own(id) && !parentOf(id));
/* an item's footprint on the floor as it stands (turned), mm */
function footprint(id) {
  const f = itemFrame(id); if (!f) return null;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [bx, bz] of [[f.box.x0, f.box.z0], [f.box.x1, f.box.z0], [f.box.x0, f.box.z1], [f.box.x1, f.box.z1]]) {
    const [wx, wz] = rotXZ(bx, bz, f.rot); x0 = Math.min(x0, f.x + wx); x1 = Math.max(x1, f.x + wx); z0 = Math.min(z0, f.z + wz); z1 = Math.max(z1, f.z + wz);
  }
  return { x0, x1, z0, z1 };
}
const AX = { x: ['x0', 'x1'], z: ['z0', 'z1'] };
function shift(id, axis, d) { const t = own(id); t.pos = { ...t.pos, [axis]: Math.round(t.pos[axis] + d) }; }
/* lines the items up on one axis: 'min' (left / back edge), 'mid' (centre), 'max' (right / front edge) */
function alignItems(ids, axis, to) {
  const items = free(ids).map(id => ({ id, f: footprint(id) })).filter(i => i.f); if (items.length < 2) return false;
  const [lo, hi] = AX[axis], at = i => to === 'min' ? i.f[lo] : to === 'max' ? i.f[hi] : (i.f[lo] + i.f[hi]) / 2;
  const target = to === 'min' ? Math.min(...items.map(at)) : to === 'max' ? Math.max(...items.map(at)) : items.reduce((a, i) => a + at(i), 0) / items.length;
  for (const i of items) shift(i.id, axis, target - at(i));
  layoutAll(); return true;
}
/* equal gaps between the items along an axis; the outermost two stay where they are */
function distributeItems(ids, axis) {
  const [lo, hi] = AX[axis];
  const items = free(ids).map(id => ({ id, f: footprint(id) })).filter(i => i.f).sort((a, b) => (a.f[lo] + a.f[hi]) - (b.f[lo] + b.f[hi]));
  if (items.length < 3) return false;
  const span = items.at(-1).f[hi] - items[0].f[lo], used = items.reduce((a, i) => a + i.f[hi] - i.f[lo], 0), gap = (span - used) / (items.length - 1);
  let at = items[0].f[hi] + gap;
  for (const i of items.slice(1, -1)) { shift(i.id, axis, at - i.f[lo]); at += i.f[hi] - i.f[lo] + gap; }
  layoutAll(); return true;
}
/* a row along an axis with `gap` mm between the items, in their current order, from the first one's place;
   the row is centred on the other axis where the items stood */
function rowItems(ids, axis, gap = 40) {
  const [lo, hi] = AX[axis], other = axis === 'x' ? 'z' : 'x', [olo, ohi] = AX[other];
  const items = free(ids).map(id => ({ id, f: footprint(id) })).filter(i => i.f).sort((a, b) => (a.f[lo] + a.f[hi]) - (b.f[lo] + b.f[hi]));
  if (items.length < 2) return false;
  const mid = items.reduce((a, i) => a + (i.f[olo] + i.f[ohi]) / 2, 0) / items.length;
  let at = items[0].f[lo];
  for (const i of items) { shift(i.id, axis, at - i.f[lo]); shift(i.id, other, mid - (i.f[olo] + i.f[ohi]) / 2); at += i.f[hi] - i.f[lo] + gap; }
  layoutAll(); return true;
}

export { alignItems, distributeItems, footprint, rowItems };
