// Кольцо на полу под выбранным объектом или группой: за него объект двигают по сцене или по ряду группы
import * as THREE from 'three';
import { $, DEG, S, clamp } from '../core/util.js';
import { sel } from '../core/state.js';
import { itemFrame, layoutAll, objectsIn, own, parentOf, rotXZ, slotsOf, topOf } from '../core/groups.js';
import { RT, camera, controls, cvs, scene } from './renderer.js';
import { invalidate, recording } from './camera.js';
import { commit } from '../core/project.js';
import { refreshFields } from '../ui/fields.js';
import { tool } from '../ui/action-bar.js';
import { pick } from './interaction.js';
import { select } from '../core/selection.js';
import { renderObjects } from '../ui/object-list.js';

/* With the move or rotate tool (ui/action-bar.js) an object is dragged by itself or by its ring; with the others
   the rings stay hidden and a drag on the model works on its graphics. Two rings at most: one under the selected item (an object, or a group picked in the list) and, when that
   item sits in a group, a fainter one under the whole top-level group. Dragging a ring moves a free item
   over the floor; an item inside a group follows the cursor and takes the place in the row it is dragged to
   (the ring shows that place), and lands there on release. The rings show only while the pointer is over the
   3D view, so they never get into exports and screenshots. */
let rings = [];   // made in initMove
let hover = false, drag = null, sig = '';
const moving = () => !!drag;
function makeRing(i) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a7aa1, transparent: true, opacity: i ? .32 : .85, depthWrite: false, side: THREE.DoubleSide });
  const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.BufferGeometry(), mat), hit = new THREE.Mesh(new THREE.BufferGeometry(), hitMat);
  m.renderOrder = 5; m.add(hit); m.visible = false; m.userData.hit = hit;
  return m;
}

function roundRect(x0, z0, x1, z1, r) {
  const s = new THREE.Shape(); r = Math.min(r, (x1 - x0) / 2, (z1 - z0) / 2);
  s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r); s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1);
  s.lineTo(x0 + r, z1); s.quadraticCurveTo(x0, z1, x0, z1 - r); s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
  return s;
}
/* a flat rounded frame around a footprint (mm): `pad` from it, `w` wide */
function frameGeom(b, pad, w) {
  const o = roundRect(b.x0 - pad - w, b.z0 - pad - w, b.x1 + pad + w, b.z1 + pad + w, pad + w + 4), hole = roundRect(b.x0 - pad, b.z0 - pad, b.x1 + pad, b.z1 + pad, pad + 4);
  o.holes.push(hole);
  const g = new THREE.ShapeGeometry(o, 6); g.rotateX(Math.PI / 2); g.scale(S, S, S);
  return g;
}
/* which items get a ring right now */
function ringItems() {
  const id = sel.group || sel.obj; if (!id || !own(id)) return [];
  const top = topOf(id);
  return top && top.id !== id ? [id, top.id] : [id];
}
/* keeps the rings in step with the selection and the layout; true when they changed and need drawing */
function syncRings() {
  const ids = (hover || drag) && !recording && (tool() === 'move' || tool() === 'rotate') ? ringItems() : [];
  const frames = ids.map(itemFrame);
  const s = JSON.stringify([ids, frames.map(f => f && [f.x, f.z, f.rot, f.box])]);
  if (s === sig) return false;
  sig = s;
  rings.forEach((m, i) => {
    const f = frames[i]; m.visible = !!f; m.userData.id = ids[i];
    if (!f) return;
    const size = Math.max(f.box.x1 - f.box.x0, f.box.z1 - f.box.z0), w = clamp(size * .02, 3, 9), pad = i ? 18 : 8;
    m.geometry.dispose(); m.geometry = frameGeom(f.box, pad, w);
    m.userData.hit.geometry.dispose(); m.userData.hit.geometry = frameGeom(f.box, pad - 2, w + 14);
    m.position.set(f.x * S, .6 * S, f.z * S); m.rotation.y = f.rot * DEG;
  });
  return true;
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt = new THREE.Vector3();
function aim(e) { const r = cvs.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
function ringAt(e) { aim(e); return rings.find(m => m.visible && ray.intersectObject(m.userData.hit, false).length)?.userData.id ?? null; }
/* the point on the floor under the cursor, mm */
function floorAt(e) { aim(e); return ray.ray.intersectPlane(floorPlane, pt) ? { x: pt.x / S, z: pt.z / S } : null; }

/* the item a press on the model takes: the selected group when the object is in it, else the object */
function itemAt(e) {
  const h = pick(e.clientX, e.clientY); if (!h?.objId) return null;
  if (sel.group && objectsIn(sel.group).includes(h.objId)) return sel.group;
  if (sel.obj !== h.objId) select(h.objId, h.face || undefined, null);
  return h.objId;
}
function startDrag(e, id) {
  const p = floorAt(e), f = itemFrame(id); if (!p || !f) return false;
  const parent = parentOf(id), t = own(id);
  // rotate: the angle round the item's centre on the floor; move: where it was grabbed
  drag = { id, parent, grab: { x: p.x - f.x, z: p.z - f.z }, start: parent ? null : { ...t.pos },
    rot: tool() === 'rotate' ? { a0: Math.atan2(p.z - f.z, p.x - f.x), r0: t.rotY || 0, c: { x: f.x, z: f.z } } : null };
  controls.enabled = false; cvs.setPointerCapture(e.pointerId); cvs.style.cursor = 'grabbing';
  return true;
}
function dragTo(e) {
  const p = floorAt(e); if (!p) return;
  const t = own(drag.id);
  if (drag.rot) {
    // turning: three.js turns +y counter-clockwise seen from above, which is the floor angle's way back
    const { a0, r0, c } = drag.rot; let r = r0 - (Math.atan2(p.z - c.z, p.x - c.x) - a0) / DEG;
    r = e.shiftKey ? Math.round(r / 15) * 15 : Math.round(r);
    t.rotY = ((r + 180) % 360 + 360) % 360 - 180; layoutAll();
    if (sel.group === drag.id || sel.obj === drag.id) refreshFields($('#modelSec'), t);
    return;
  }
  let x = p.x - drag.grab.x, z = p.z - drag.grab.z;
  // Shift: along the axis it has moved most on
  if (e.shiftKey && drag.start) { if (Math.abs(x - drag.start.x) > Math.abs(z - drag.start.z)) z = drag.start.z; else x = drag.start.x; }
  if (!drag.parent) {
    t.pos = { x: Math.round(x), z: Math.round(z) }; layoutAll();
    if (sel.group === drag.id || sel.obj === drag.id) refreshFields($('#modelSec'), t);
    return;
  }
  // inside a group: the row position under the cursor, then the item follows the cursor itself
  const g = drag.parent, gf = itemFrame(g.id), [lx, lz] = rotXZ(x - gf.x, z - gf.z, -gf.rot), along = g.dir === 'z' ? lz : lx;
  const slots = slotsOf(g.id), axis = g.dir === 'z' ? 1 : 0, others = g.items.filter(id => id !== drag.id);
  const at = others.filter(id => slots.get(id)[axis] < along).length;
  if (g.items.indexOf(drag.id) !== at) { g.items = [...others.slice(0, at), drag.id, ...others.slice(at)]; layoutAll(); renderObjects(); }
  const f = itemFrame(drag.id), dx = (x - f.x) * S, dz = (z - f.z) * S;
  for (const oid of objectsIn(drag.id)) { const rt = RT.get(oid); if (rt) { rt.group.position.x += dx; rt.group.position.z += dz; } }
  invalidate();
}
function endDrag() {
  drag = null; controls.enabled = true; layoutAll(); renderObjects(); commit(); invalidate();
}

/* hooks up the floor rings */
function initMove() {
  rings = [0, 1].map(makeRing);
  scene.add(...rings);
  cvs.addEventListener('pointerenter', () => { hover = true; syncRings(); invalidate(); });
  cvs.addEventListener('pointerleave', () => { hover = false; invalidate(); });
  // before the other handlers (and the orbit controls) on the canvas, so grabbing a ring does not turn the camera
  cvs.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.pointerType === 'touch' || e.ctrlKey || e.metaKey || recording || (tool() !== 'move' && tool() !== 'rotate')) return;
    const id = ringAt(e) || itemAt(e);
    if (id && startDrag(e, id)) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  cvs.addEventListener('pointermove', e => {
    if (drag) { dragTo(e); return; }
    if (!e.buttons && (tool() === 'move' || tool() === 'rotate')) cvs.style.cursor = ringAt(e) || pick(e.clientX, e.clientY)?.objId ? (tool() === 'move' ? 'move' : 'ew-resize') : '';
  });
  cvs.addEventListener('pointerup', e => { if (drag) { e.stopImmediatePropagation(); endDrag(); } }, true);
  cvs.addEventListener('pointercancel', () => { if (drag) endDrag(); });
}
/* hides the rings for a picture of the scene; returns a function that brings them back */
function hideRings() { const v = rings.map(m => m.visible); rings.forEach(m => { m.visible = false; }); return () => rings.forEach((m, i) => { m.visible = v[i]; }); }

export { hideRings, initMove, moving, syncRings };
