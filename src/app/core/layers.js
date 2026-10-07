// Несколько слоёв сразу: выбор, перемещение, масштаб и поворот, выравнивание, группы, порядок, копирование
import { DEG, uid } from './util.js';
import { activeFaceData, activeObj, sel } from './state.js';
import { faceMM, facePx, newImage, outerKeys } from './model.js';
import { applyObjMaterials, markFace } from '../scene/renderer.js';
import { layerBox } from '../faces/render.js';
import { rotateItem, scaleItem, sizeOf } from './transform.js';

/* The selection of a face's layers: sel.layer is the main one (its properties are shown), sel.layers all of them.
   sel.layers counts only while it holds sel.layer, so code that picks one layer (sel.layer = id) simply ends a
   multiple selection. Groups are marks on layers (L.group = id; their names in face.groups), kept next to each other
   in the face's stack: a group is picked, moved, turned and scaled as one, and drawn as its layers are. */
function selectedIds() {
  if (!sel.layer) return [];
  return sel.layers?.length > 1 && sel.layers.includes(sel.layer) ? sel.layers : [sel.layer];
}
function selectedLayers(face = activeFaceData()) {
  if (!face) return [];
  const ids = new Set(selectedIds());
  return face.layers.filter(L => ids.has(L.id));
}
/* picks layers: ids (the last is the main one unless main is given) */
function setLayerSelection(ids, main = ids.at(-1) ?? null) {
  sel.bg = false;
  sel.layers = ids.length > 1 ? [...ids] : [];
  sel.layer = ids.length ? main : null;
  if (ids.length) sel.sticker = null;
}
/* the layers of L's group (or L alone) */
const groupOf = (face, L) => L?.group ? face.layers.filter(l => l.group === L.group) : L ? [L] : [];

/* the box a layer covers on its face (px, axis-aligned, turned corners included) */
function layerAABB(L, W, H) {
  const [w, h] = layerBox(L, W, H), r = (L.rot || 0) * DEG, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  const ex = (w * c + h * s) / 2, ey = (w * s + h * c) / 2, x = L.x * W, y = L.y * H;
  return [x - ex, y - ey, x + ex, y + ey];
}
function boundsOf(Ls, W, H) {
  if (!Ls.length) return null;
  const b = Ls.map(L => layerAABB(L, W, H));
  return [Math.min(...b.map(q => q[0])), Math.min(...b.map(q => q[1])), Math.max(...b.map(q => q[2])), Math.max(...b.map(q => q[3]))];
}

/* ---------- moving, scaling, turning several layers (from where a gesture began) ---------- */
const snapshot = Ls => Ls.map(L => ({ L, x: L.x, y: L.y, rot: L.rot || 0, size: sizeOf(L) }));
function moveLayers(o, k, snap, dx, dy) {
  const [W, H] = facePx(o, k);
  for (const s of snap) { s.L.x = s.x + dx / W; s.L.y = s.y + dy / H; }
  markFace(o, k);
}
/* scales by s round the point (px) px, py */
function scaleLayers(o, k, snap, px, py, s) {
  const [W, H] = facePx(o, k);
  s = Math.max(.02, s);
  for (const q of snap) { q.L.x = (px + (q.x * W - px) * s) / W; q.L.y = (py + (q.y * H - py) * s) / H; scaleItem(o, k, q.L, q.size, s); }
}
/* turns by deg degrees round the point (px) px, py */
function rotateLayers(o, k, snap, px, py, deg) {
  const [W, H] = facePx(o, k), a = deg * DEG, c = Math.cos(a), s = Math.sin(a);
  for (const q of snap) {
    const dx = q.x * W - px, dy = q.y * H - py;
    q.L.x = (px + dx * c - dy * s) / W; q.L.y = (py + dx * s + dy * c) / H;
    rotateItem(o, k, q.L, q.rot + deg);
  }
}

/* ---------- align and distribute ---------- */
/* how: left, hcenter, right, top, vcenter, bottom. One layer (or one group) aligns to the face, several to their box */
function alignLayers(o, k, Ls, how) {
  const [W, H] = facePx(o, k), face = o.faces[k];
  // a group moves as one
  const units = unitsOf(face, Ls), one = units.length < 2, all = one ? [0, 0, W, H] : boundsOf(Ls, W, H);
  for (const u of units) {
    const b = boundsOf(u, W, H); let dx = 0, dy = 0;
    if (how === 'left') dx = all[0] - b[0]; if (how === 'right') dx = all[2] - b[2]; if (how === 'hcenter') dx = (all[0] + all[2] - b[0] - b[2]) / 2;
    if (how === 'top') dy = all[1] - b[1]; if (how === 'bottom') dy = all[3] - b[3]; if (how === 'vcenter') dy = (all[1] + all[3] - b[1] - b[3]) / 2;
    for (const L of u) { L.x += dx / W; L.y += dy / H; }
  }
  markFace(o, k);
}
/* equal gaps between them, across (x) or down (y); the first and the last stay */
function distributeLayers(o, k, Ls, ax) {
  const [W, H] = facePx(o, k), units = unitsOf(o.faces[k], Ls).map(u => ({ u, b: boundsOf(u, W, H) }));
  if (units.length < 3) return;
  const i0 = ax === 'x' ? 0 : 1, i1 = i0 + 2;
  units.sort((a, b) => (a.b[i0] + a.b[i1]) - (b.b[i0] + b.b[i1]));
  const span = units.at(-1).b[i1] - units[0].b[i0], used = units.reduce((t, q) => t + q.b[i1] - q.b[i0], 0), gap = (span - used) / (units.length - 1);
  let at = units[0].b[i1] + gap;
  for (const q of units.slice(1, -1)) {
    const d = at - q.b[i0];
    for (const L of q.u) { if (ax === 'x') L.x += d / W; else L.y += d / H; }
    at += q.b[i1] - q.b[i0] + gap;
  }
  markFace(o, k);
}
/* the layers split into what moves as one: groups whole, the rest one by one */
function unitsOf(face, Ls) {
  const seen = new Set(), out = [];
  for (const L of Ls) {
    if (L.group) { if (seen.has(L.group)) continue; seen.add(L.group); out.push(Ls.filter(l => l.group === L.group)); }
    else out.push([L]);
  }
  return out;
}

/* ---------- groups ---------- */
/* makes a group of the layers; they come together at the place of the top one. Returns its id */
function groupLayers(o, k, Ls, name = null) {
  const face = o.faces[k]; if (Ls.length < 2) return null;
  const gid = uid(), set = new Set(Ls), top = Math.max(...Ls.map(L => face.layers.indexOf(L)));
  const rest = face.layers.filter(L => !set.has(L)), at = rest.indexOf(face.layers.slice(0, top + 1).filter(L => !set.has(L)).at(-1)) + 1;
  const ordered = face.layers.filter(L => set.has(L));
  for (const L of ordered) L.group = gid;
  face.layers = [...rest.slice(0, at), ...ordered, ...rest.slice(at)];
  face.groups = { ...(face.groups || {}), [gid]: name || `Группа ${Object.keys(face.groups || {}).length + 1}` };
  tidyGroups(face); markFace(o, k);
  return gid;
}
function ungroupLayers(o, k, Ls) {
  const face = o.faces[k];
  for (const L of Ls) delete L.group;
  tidyGroups(face); markFace(o, k);
}
/* drops names of groups that have no layers left, and groups of one layer */
function tidyGroups(face) {
  const n = {}; for (const L of face.layers) if (L.group) n[L.group] = (n[L.group] || 0) + 1;
  for (const L of face.layers) if (L.group && n[L.group] < 2) delete L.group;
  if (face.groups) for (const g of Object.keys(face.groups)) if (!(n[g] >= 2)) delete face.groups[g];
}
function renameItem(o, k, target, name) {
  const face = o.faces[k];
  if (typeof target === 'string') face.groups = { ...(face.groups || {}), [target]: name };
  else if (name) target.name = name; else delete target.name;
}

/* ---------- order ---------- */
/* puts the layers (kept in their order) at position `at` of the stack without them (0 = bottom); group:
   the group they join there (null: none) */
function placeLayers(o, k, Ls, at, group = undefined) {
  const face = o.faces[k], set = new Set(Ls), rest = face.layers.filter(L => !set.has(L)), moved = face.layers.filter(L => set.has(L));
  if (group !== undefined) for (const L of moved) { if (group) L.group = group; else delete L.group; }
  face.layers = [...rest.slice(0, at), ...moved, ...rest.slice(at)];
  tidyGroups(face); markFace(o, k);
}
/* one step up (1) or down (-1), or to the top (Infinity) or the bottom (-Infinity); a group moves whole */
function shiftLayers(o, k, Ls, step) {
  const face = o.faces[k], g = Ls[0]?.group, members = g ? face.layers.filter(L => L.group === g) : [];
  // part of one group: it moves among the group's layers only
  if (g && Ls.every(L => L.group === g) && Ls.length < members.length) {
    const set = new Set(Ls), others = members.filter(L => !set.has(L)), lo = members.findIndex(L => set.has(L));
    const below = members.slice(0, lo).filter(L => !set.has(L)).length;
    const j = Math.max(0, Math.min(others.length, step === Infinity ? others.length : step === -Infinity ? 0 : below + step));
    const order = [...others.slice(0, j), ...members.filter(L => set.has(L)), ...others.slice(j)], first = face.layers.indexOf(members[0]);
    const rest = face.layers.filter(L => L.group !== g);
    face.layers = [...rest.slice(0, first), ...order, ...rest.slice(first)];
    markFace(o, k); return;
  }
  const set = new Set(Ls.flatMap(L => groupOf(face, L))), rest = face.layers.filter(L => !set.has(L));
  const lo = face.layers.findIndex(L => set.has(L)), below = face.layers.slice(0, lo).filter(L => !set.has(L)).length;
  let at = step === Infinity ? rest.length : step === -Infinity ? 0 : below + step;
  // past a whole group of others, not into it
  const nb = step > 0 ? rest[at - 1] : rest[at];
  if (nb?.group && Number.isFinite(step)) { const g = rest.filter(L => L.group === nb.group); at = step > 0 ? rest.indexOf(g.at(-1)) + 1 : rest.indexOf(g[0]); }
  placeLayers(o, k, [...set], Math.max(0, Math.min(rest.length, at)));
}

/* ---------- delete, duplicate, copy and paste ---------- */
function deleteLayers(o, k, Ls) {
  const face = o.faces[k], set = new Set(Ls);
  face.layers = face.layers.filter(L => !set.has(L));
  tidyGroups(face); markFace(o, k);
}
/* copies of the layers (a group's copy is a new group), put over them; returns the copies */
function duplicateLayers(o, k, Ls, shift = .03) {
  const face = o.faces[k], ids = new Map(), top = Math.max(...Ls.map(L => face.layers.indexOf(L)));
  const copies = Ls.map(L => {
    const c = { ...structuredClone(L), id: uid(), x: L.x + shift, y: L.y + shift };
    if (L.group) { if (!ids.has(L.group)) ids.set(L.group, uid()); c.group = ids.get(L.group); }
    return c;
  });
  for (const [g, n] of ids) face.groups = { ...(face.groups || {}), [n]: (face.groups?.[g] || 'Группа') + ' — копия' };
  face.layers.splice(top + 1, 0, ...copies);
  tidyGroups(face); markFace(o, k);
  return copies;
}
/* layers as plain data to copy (with the size of their face, so a paste elsewhere keeps their size in mm) */
function copyData(o, k, Ls) {
  const face = o.faces[k];
  return { v: 1, mm: faceMM(o, k), layers: structuredClone(Ls), groups: Object.fromEntries(Ls.filter(L => L.group).map(L => [L.group, face.groups?.[L.group] || 'Группа'])) };
}
/* pastes copied layers onto face k: on the same spot of a face of the same size (a little off if they are still
   there), else at the same place of the face and the same size in mm; returns the new layers */
function pasteData(o, k, data) {
  const face = o.faces[k], [tw, th] = faceMM(o, k), [aw, ah] = data.mm || [tw, th], same = Math.abs(aw - tw) < .01 && Math.abs(ah - th) < .01;
  const there = same && data.layers.some(L => face.layers.some(l => Math.abs(l.x - L.x) < 1e-6 && Math.abs(l.y - L.y) < 1e-6));
  const gids = new Map(), out = data.layers.map(L => {
    const c = { ...structuredClone(L), id: uid() };
    if (there) { c.x += .03; c.y += .03; }
    if (!same) { if (c.type === 'image') c.w = c.w * aw / tw; else if (c.type === 'shape') { c.w = c.w * aw / tw; c.h = c.h * ah / th; } else c.size = c.size * ah / th; }
    if (c.group) { if (!gids.has(c.group)) gids.set(c.group, uid()); c.group = gids.get(c.group); }
    return c;
  });
  for (const [g, n] of gids) face.groups = { ...(face.groups || {}), [n]: data.groups?.[g] || 'Группа' };
  face.layers.push(...out);
  tidyGroups(face); markFace(o, k);
  return out;
}
/* the layers a click on L picks: its group whole, unless the selection is already inside that group (then the
   layer alone, as in Figma); toggle adds or takes it off the selection (Shift / Ctrl-click) */
function clickPick(face, L, toggle = false) {
  const cur = selectedLayers(face), inside = L.group && cur.length && cur.every(l => l.group === L.group) && cur.length < groupOf(face, L).length;
  const unit = L.group && !inside ? groupOf(face, L) : [L];
  if (!toggle) return unit.map(l => l.id);
  const ids = new Set(cur.map(l => l.id)), on = unit.every(l => ids.has(l.id));
  for (const l of unit) on ? ids.delete(l.id) : ids.add(l.id);
  return face.layers.filter(l => ids.has(l.id)).map(l => l.id);
}
/* a text layer's words */
function setText(o, k, L, text) { L.text = text; markFace(o, k); }
/* the fill of a text or shape layer: plain (kind null), or a 'linear' / 'radial' gradient from its colour to grad.color */
function setGradient(o, k, L, kind) {
  if (!kind) delete L.grad;
  else L.grad = { color: '#ffffff', angle: 90, ...(L.grad || {}), kind };
  markFace(o, k);
}
/* all of the active face's layers selected */
function selectAllLayers() { const f = activeFaceData(), Ls = f?.layers.filter(L => !L.locked); if (Ls?.length) setLayerSelection(Ls.map(L => L.id)); }
/* locked layers are not picked or dragged on the model and in the face window (only in the list) */
function setLocked(o, k, Ls, on) { for (const L of Ls) { if (on) L.locked = true; else delete L.locked; } markFace(o, k); }
/* shown or hidden */
function setVisible(o, k, Ls, on) { for (const L of Ls) L.visible = on; markFace(o, k); }
const activeFaceKey = () => (activeObj() && sel.face) || null;

/* ---------- the face's background: the bottom "layer" of every face (face.bg, face.bgGrad) ---------- */
/* the background picked in the layer list (its settings shown instead of a layer's) */
function selectBg() { setLayerSelection([]); sel.bg = true; }
/* faces whose background shows in the material too (the inside of a box, the flap's back, a sleeve's paper) */
const BG_MAT = ['inside', 'flap', 'sleeve', 'carry'];
function setFaceBg(o, k, c) { o.faces[k].bg = c; markFace(o, k); if (BG_MAT.includes(k)) applyObjMaterials(o); }
/* a gradient from the background colour to bgGrad.color ('linear' with an angle, 'radial'), or plain (null) */
function setFaceBgGrad(o, k, kind) {
  const f = o.faces[k];
  if (!kind) delete f.bgGrad; else f.bgGrad = { color: '#ffffff', angle: 90, ...(f.bgGrad || {}), kind };
  markFace(o, k);
}
/* the background (with its gradient) on all the outer faces */
function bgToAllFaces(o, k) {
  const f = o.faces[k];
  for (const t of outerKeys(o)) { if (t === k) continue; o.faces[t].bg = f.bg; if (f.bgGrad) o.faces[t].bgGrad = { ...f.bgGrad }; else delete o.faces[t].bgGrad; markFace(o, t); }
  applyObjMaterials(o);
}
/* every layer off the face (the background stays) */
function clearFace(o, k) { o.faces[k].layers = []; delete o.faces[k].groups; setLayerSelection([]); markFace(o, k); }
/* a picture as the background: an image layer under all the others, covering the face */
function addBackgroundImage(o, k, src, aspect) {
  const [W, H] = facePx(o, k), L = newImage(src, aspect);
  L.w = Math.max(W, H * aspect) / W; L.x = .5; L.y = .5; L.name = 'Фон-картинка';
  o.faces[k].layers.unshift(L); markFace(o, k);
  return L;
}

export { addBackgroundImage, bgToAllFaces, clearFace, selectBg, setFaceBg, setFaceBgGrad, activeFaceKey, alignLayers, clickPick, boundsOf, copyData, deleteLayers, distributeLayers, duplicateLayers, groupLayers, groupOf, layerAABB, moveLayers, pasteData, placeLayers, renameItem, rotateLayers, scaleLayers, selectAllLayers, selectedIds, selectedLayers, setGradient, setLayerSelection, setLocked, setText, setVisible, shiftLayers, snapshot, tidyGroups, ungroupLayers, unitsOf };
