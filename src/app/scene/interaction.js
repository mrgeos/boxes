// Мышь, касания, перетаскивание файлов, клавиатура
import * as THREE from 'three';
import { $, DEG, S, toast } from '../core/util.js';
import { activeFaceData, activeLayer, activeObj, sel, state } from '../core/state.js';
import { faceKeys, faceMM, facePx, loopAxis } from '../core/model.js';
import { apply, faceMaps, inv, layerReach, moveLayerOnto } from '../faces/wrap.js';
import { library } from '../core/library.js';
import { RT, camera, controls, cvs, markFace, renderer, ui, world } from './renderer.js';
import { activeSticker, stickerAt, stickerDirty, touchSticker } from '../stickers/placement.js';
import { applyViewOffset, focusSelected, lockActive, recording, setCamTween, setView, view } from './camera.js';
import { pickLayers, select, selectLayer } from '../core/selection.js';
import { boundsOf, clickPick, copyData, moveLayers, pasteData, rotateLayers, scaleLayers, selectedIds, selectedLayers, snapshot } from '../core/layers.js';
import { addFontFile, commit, openProjectFile, redo, undo } from '../core/project.js';
import { refreshFields } from '../ui/fields.js';
import { addImageToFace, deleteLayer, duplicateLayer, layerCmd, moveLayer, renderFaceTabs, renderLayerProps, renderLayers } from '../ui/face-panel.js';
import { deleteSticker, renderStickers, setStickerImage } from '../ui/stickers-panel.js';
import { setTab } from '../ui/tabs.js';
import { handleAt } from './sel-box.js';
import { rotateItem, scaleItem, sizeOf } from '../core/transform.js';
import { editDrag, editFrom, editMode, editRects, setEditMode } from '../core/mask.js';
import { layerBox } from '../faces/render.js';
import { tool } from '../ui/action-bar.js';
import { placeLibImage } from '../ui/library-panel.js';
import { ed, edPoint, edState, hitLayer } from '../ui/face-editor.js';

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(clientX, clientY, only = null) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(only ? [only] : world.children, true);
  const h = hits[0]; if (!h) return null;
  const ud = h.object.userData; const face = ud.faces ? ud.faces[h.face.materialIndex] : ud.face;
  return { objId: ud.objId, face, wall: !!ud.wall, uv: h.uv, mesh: h.object, mi: h.face.materialIndex };
}
let down = null, drag3 = null, dragSt = null, xform = null, hoverT = 0;
/* the sticker under a 3D hit, if any */
function stickerHit(h) {
  const o = state.objects.find(x => x.id === h?.objId);
  if (!o || !h.face || !h.uv || h.wall || !o.stickers?.length) return null;
  const [mw, mh] = faceMM(o, h.face);
  return stickerAt(o, h.face, h.uv.x * mw, (1 - h.uv.y) * mh);
}
/* screen-space pan in orbit-lock mode: right button, Shift/Ctrl/Cmd + left button, or two fingers */
const touches = new Map();
 let pan = null;
const touchMid = () => { const p = [...touches.values()]; return [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2]; };
const endPan = e => { touches.delete(e.pointerId); if (pan && (!pan.touch || touches.size < 2)) { pan = null; cvs.style.cursor = 'grab'; } };
/* drag & drop images onto the model, the editor, or anywhere */
let dragDepth = 0;
const isFileDrag = e => [...(e.dataTransfer?.types || [])].includes('Files');
const isLibDrag = e => [...(e.dataTransfer?.types || [])].includes('application/x-bs-asset');
let nudgeT;

/* is the selected layer L under the 3D hit h, on its face or where it runs over an edge? its point there, face mm */
function layerUnder(h, L) {
  const o = activeObj(), A = sel.face;
  if (!h || !o || h.objId !== o.id || !h.face || !h.uv || h.wall) return null;
  const [fw, fh] = faceMM(o, h.face), p = [h.uv.x * fw, (1 - h.uv.y) * fh];
  const q = h.face === A ? p : (() => { const r = layerReach(o, A, L).find(r => r.key === h.face); return r && apply(inv(r.G), p); })();
  if (!q) return null;
  const [W, H] = facePx(o, A), [aw, ah] = faceMM(o, A), ppm = W / aw, ax = h.face === A && loopAxis(o, A);
  // the selected layer is grabbed anywhere inside it, even where another layer lies over it; on a ring also
  // by its part drawn past the other end
  const tries = ax ? [q, ...[1, -1].map(s => ax === 'x' ? [q[0] + s * aw, q[1]] : [q[0], q[1] + s * ah])] : [q];
  return tries.find(t => hitLayer({ layers: [L] }, W, H, t[0] * ppm, t[1] * ppm)) || null;
}
/* drags a layer over the model: across an edge it goes on printing over it (wrap), and once its centre has left
   the face it belongs to the face the centre is on, at the same size in mm */
function dragLayer(e) {
  const { o, L } = drag3, h = pick(e.clientX, e.clientY, RT.get(o.id).group);
  if (!h || !h.face || !h.uv || h.wall || !faceKeys(o).includes(h.face)) return;
  const A = drag3.face, [aw, ah] = faceMM(o, A), [fw, fh] = faceMM(o, h.face), cur = [h.uv.x * fw, (1 - h.uv.y) * fh];
  let pA = cur;
  if (h.face !== A) {
    const G = faceMaps(o, A, L.x * aw, L.y * ah).get(h.face); if (!G) return;
    pA = apply(inv(G), cur);
    if (!L.wrap) { L.wrap = true; renderLayerProps(); }
  }
  const cx = pA[0] + drag3.grab[0], cy = pA[1] + drag3.grab[1], ring = loopAxis(o, A), wrap1 = v => v - Math.floor(v);
  L.x = cx / aw; L.y = cy / ah;
  // a ring has no ends: past one end the layer goes on from the other
  if (ring) { if (ring === 'x') L.x = wrap1(L.x); else L.y = wrap1(L.y); markFace(o, A); refreshFields($('#layerSec'), L); return; }
  if (cx < 0 || cy < 0 || cx > aw || cy > ah) {
    for (const [T, G] of faceMaps(o, A, cx, cy)) {
      if (T === A) continue;
      const [tx, ty] = apply(G, [cx, cy]), [tw, th] = faceMM(o, T);
      if (tx < 0 || ty < 0 || tx > tw || ty > th) continue;
      markFace(o, A); moveLayerOnto(o, A, T, L, G);
      const [gx, gy] = drag3.grab; drag3.grab = [G[0] * gx + G[2] * gy, G[1] * gx + G[3] * gy]; drag3.face = T;
      select(o.id, T, L.id);
      break;
    }
  }
  markFace(o, drag3.face); refreshFields($('#layerSec'), L);
}

/* a handle of the selection frame on the model: corners scale the layer or sticker, the dot on the stalk turns it.
   Both go by the pointer round the item's centre on screen; Shift turns in steps of 15°. */
/* where the pointer is on face k of object o, in the face's px: on the face's plane where it has one (so also
   past its edge), else on the surface under the pointer */
const plane = new THREE.Plane(), hitP = new THREE.Vector3(), MW = new THREE.Matrix4();
function facePoint(e, o, k) {
  const [W, H] = facePx(o, k), [mw, mh] = faceMM(o, k), F = RT.get(o.id)?.frames?.[k];
  if (F) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    F.parent.updateMatrixWorld(); MW.multiplyMatrices(F.parent.matrixWorld, F.pinv);
    const c = F.c.clone().multiplyScalar(S).applyMatrix4(MW), n = F.n.clone().transformDirection(MW);
    if (!ray.ray.intersectPlane(plane.setFromNormalAndCoplanarPoint(n, c), hitP)) return null;
    const p = hitP.applyMatrix4(MW.clone().invert()).divideScalar(S).sub(F.c);
    return [(p.dot(F.u) + F.w / 2) * W / mw, (F.h / 2 - p.dot(F.v)) * H / mh];
  }
  const h = pick(e.clientX, e.clientY, RT.get(o.id).group);
  return h?.face === k && h.uv ? [h.uv.x * W, (1 - h.uv.y) * H] : null;
}
/* the pointer in the layer's own px (from its centre then, unturned) */
function layerLocal(e, o, k, from, rot) {
  const p = facePoint(e, o, k); if (!p) return null;
  const [W, H] = facePx(o, k), a = -rot * DEG, ex = p[0] - from.x * W, ey = p[1] - from.y * H;
  return [ex * Math.cos(a) - ey * Math.sin(a), ex * Math.sin(a) + ey * Math.cos(a)];
}
/* crop or mask mode on the model: a corner handle resizes the frame, a drag inside it moves */
function startEdit(e, handle) {
  const o = activeObj(), L = activeLayer(), k = sel.face, from = editFrom(L), at = layerLocal(e, o, k, from, L.rot);
  if (!at) return false;
  const [W, H] = facePx(o, k);
  xform = { edit: editMode(), handle, it: L, o, face: k, from, at, box: layerBox(L, W, H) };
  controls.enabled = false; cvs.setPointerCapture(e.pointerId); cvs.style.cursor = handle === 'move' ? 'grabbing' : 'nwse-resize';
  return true;
}
/* is the pointer inside the frame being edited? */
function inEditFrame(e) {
  const o = activeObj(), L = activeLayer(), mode = editMode(); if (!o || !L || !mode) return false;
  const [W, H] = facePx(o, sel.face), box = layerBox(L, W, H), er = editRects(mode, L, W, H, box), p = layerLocal(e, o, sel.face, L, L.rot);
  if (!er || !p) return false;
  const [x, y] = [p[0] * er.flip[0], p[1] * er.flip[1]], [x0, y0, x1, y1] = er.inner;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}
function startXform(e, g) {
  const it = activeLayer() || activeSticker(), dx = e.clientX - g.c[0], dy = e.clientY - g.c[1], many = !activeSticker() || activeLayer() ? selectedLayers() : [];
  xform = { ...g, it, o: activeObj(), face: sel.face, from: sizeOf(it), r0: it.rot || 0, a0: Math.atan2(dy, dx), d0: Math.max(4, Math.hypot(dx, dy)) };
  // several layers: scaled and turned together round the middle of their frame
  if (many.length > 1) {
    const [W, H] = facePx(xform.o, sel.face), b = boundsOf(many, W, H);
    Object.assign(xform, { snap: snapshot(many), px: (b[0] + b[2]) / 2, py: (b[1] + b[3]) / 2 });
  }
  controls.enabled = false; cvs.setPointerCapture(e.pointerId); cvs.style.cursor = g.mode === 'rot' ? 'grabbing' : 'nwse-resize';
}
function dragXform(e) {
  if (xform.edit) {
    const { o, face, it, from, at, box } = xform, p = layerLocal(e, o, face, from, from.rot ?? it.rot); if (!p) return;
    const [W, H] = facePx(o, face);
    editDrag(o, face, it, xform.edit, xform.handle, from, p[0] - at[0], p[1] - at[1], W, H, box);
    refreshFields($('#layerSec'), it); return;
  }
  if (xform.many) {
    const p = facePoint(e, xform.o, xform.face); if (!p) return;
    moveLayers(xform.o, xform.face, xform.snap, p[0] - xform.at[0], p[1] - xform.at[1]);
    refreshFields($('#layerSec'), activeLayer()); return;
  }
  const { it, o, face, c, mode } = xform, dx = e.clientX - c[0], dy = e.clientY - c[1];
  if (xform.snap) {
    if (mode === 'scale') scaleLayers(o, face, xform.snap, xform.px, xform.py, Math.hypot(dx, dy) / xform.d0);
    else { let a = xform.flip * (Math.atan2(dy, dx) - xform.a0) / DEG; if (e.shiftKey) a = Math.round(a / 15) * 15; rotateLayers(o, face, xform.snap, xform.px, xform.py, a); }
    refreshFields($('#layerSec'), activeLayer()); return;
  }
  if (mode === 'scale') scaleItem(o, face, it, xform.from, Math.hypot(dx, dy) / xform.d0);
  else {
    let a = xform.r0 + xform.flip * (Math.atan2(dy, dx) - xform.a0) / DEG;
    a = ((a + 180) % 360 + 360) % 360 - 180;
    if (e.shiftKey) a = Math.round(a / 15) * 15; else for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(a - s) < 3) a = s;
    rotateItem(o, face, it, a);
  }
  refreshFields($(it.type ? '#layerSec' : '#stickerSec'), it);
}
function endXform() {
  if (!xform.it.type) { stickerDirty.add(xform.o.id); ui.stickers = true; } else { ui.layers = true; ui.editor = true; }
  xform = null; controls.enabled = true; commit();
}

/* hooks up the mouse, touch, drag-and-drop and keyboard */
function initInteraction() {
  cvs.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2 && lockActive()) { const [x, y] = touchMid(); pan = { x, y, vx: view.x, vy: view.y, touch: true }; }
      return;
    }
    if (!lockActive() || drag3) return;
    if (e.button === 2 || (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey || tool() === 'hand'))) {
      // a Shift- or Ctrl-click that does not move stays a click (it adds a layer to the picked ones)
      pan = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; setCamTween(null); if (e.button === 0) down = { x: e.clientX, y: e.clientY }; cvs.setPointerCapture(e.pointerId); cvs.style.cursor = 'move';
    }
  }, true);
  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (!pan) return;
    const [x, y] = pan.touch ? (touches.size === 2 ? touchMid() : [pan.x, pan.y]) : [e.clientX, e.clientY];
    view.x = pan.vx - (x - pan.x); view.y = pan.vy - (y - pan.y); applyViewOffset();
  });
  window.addEventListener('pointerup', endPan);
   window.addEventListener('pointercancel', endPan);
  cvs.addEventListener('dblclick', e => {
    const h = pick(e.clientX, e.clientY); if (!h) return setView('fit');
    // a double click on a layer of a picked group picks it alone (inside the group)
    const o = state.objects.find(x => x.id === h.objId);
    if (o && h.face === sel.face && h.uv && !h.wall && selectedIds().length > 1) {
      const [W, H] = facePx(o, h.face), hl = hitLayer(o.faces[h.face], W, H, h.uv.x * W, (1 - h.uv.y) * H);
      if (hl?.group) { pickLayers([hl.id]); return; }
    }
    // a double click on the selected picture: its crop frame
    const L = activeLayer();
    if (L?.type === 'image' && !L.tile && tool() === 'select' && layerUnder(h, L)) { setEditMode(editMode() === 'crop' ? null : 'crop'); renderLayerProps(); ui.editor = true; return; }
    if (h.objId !== sel.obj) select(h.objId, h.face || undefined, null, { flash: true });
    focusSelected({ frame: true });
  });
  cvs.addEventListener('pointerdown', e => {
    if (recording || e.button !== 0 || pan) return;
    down = { x: e.clientX, y: e.clientY };
    if (tool() !== 'select') return;   // graphics are dragged with the select tool only
    const g = handleAt(e.clientX, e.clientY);
    if (editMode()) {
      // crop or mask mode: corners and the inside edit; a press elsewhere ends the mode
      if (g?.mode === 'edit' && startEdit(e, g.idx)) return;
      if (inEditFrame(e) && startEdit(e, 'move')) return;
      setEditMode(null); renderLayerProps(); ui.editor = true;
    } else if (g) return startXform(e, g);
    // several picked layers: a press on any of them moves them all (over their face)
    const many = selectedLayers(), hm = many.length > 1 && pick(e.clientX, e.clientY);
    if (hm && many.some(M => layerUnder(hm, M))) {
      const o = activeObj(), at = facePoint(e, o, sel.face);
      if (at) { xform = { many: true, snap: snapshot(many), o, face: sel.face, at, it: many[0] }; controls.enabled = false; cvs.setPointerCapture(e.pointerId); cvs.style.cursor = 'grabbing'; return; }
    }
    const h = pick(e.clientX, e.clientY), L = activeLayer();
    // a selected sticker is dragged across the model, face to face
    const hs = sel.sticker && h?.objId === sel.obj ? stickerHit(h) : null;
    if (hs && hs.id === sel.sticker) {
      dragSt = { st: hs, o: activeObj() }; controls.enabled = false; cvs.setPointerCapture(e.pointerId); cvs.style.cursor = 'grabbing';
      return;
    }
    const at = L && layerUnder(h, L);
    if (at) {
      const o = activeObj(), [aw, ah] = faceMM(o, sel.face);
      drag3 = { L, o, face: sel.face, grab: [L.x * aw - at[0], L.y * ah - at[1]] };
      controls.enabled = false; cvs.setPointerCapture(e.pointerId); cvs.style.cursor = 'grabbing';
    }
  });
  cvs.addEventListener('pointermove', e => {
    if (dragSt) {
      const { st, o } = dragSt, h = pick(e.clientX, e.clientY, RT.get(o.id).group);
      if (h && h.face && h.uv && !h.wall && faceKeys(o).includes(h.face)) {
        st.face = h.face; st.x = h.uv.x; st.y = 1 - h.uv.y;
        touchSticker(o, st); refreshFields($('#stickerSec'), st);
        const fs = $('#stickerSec [data-k="face"]'); if (fs) fs.value = st.face;
      }
      return;
    }
    if (drag3) { dragLayer(e); return; }
    if (xform) { dragXform(e); return; }
    if (e.buttons || e.timeStamp - hoverT < 50 || tool() !== 'select') return; hoverT = e.timeStamp;
    const g = handleAt(e.clientX, e.clientY);
    if (g) { cvs.style.cursor = g.mode === 'rot' ? 'grab' : 'nwse-resize'; return; }
    const h = pick(e.clientX, e.clientY); let cur = 'grab';
    if (h?.face) {
      cur = 'pointer';
      const L = activeLayer();
      if (L && layerUnder(h, L)) cur = 'move';
      if (sel.sticker && h.objId === sel.obj && stickerHit(h)?.id === sel.sticker) cur = 'move';
    }
    cvs.style.cursor = cur;
  });
  cvs.addEventListener('pointerup', e => {
    if (xform) {
      const was = xform; endXform(); cvs.style.cursor = '';
      // a click on one of several picked layers, without moving them, falls through and picks it alone
      if (!(was.many && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 5)) { down = null; return; }
    }
    if (dragSt) { stickerDirty.add(dragSt.o.id); dragSt = null; controls.enabled = true; cvs.style.cursor = 'move'; ui.stickers = true; commit(); down = null; return; }
    if (drag3) {
      drag3 = null; controls.enabled = true; cvs.style.cursor = 'move';
      // a click without moving falls through: it picks the top layer there, as before
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { ui.layers = true; commit(); down = null; return; }
    }
    if (e.button !== 0 || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null;
    if (tool() === 'hand') return;   // the hand only moves the view
    const h = pick(e.clientX, e.clientY);
    // a click on empty space drops the selection, as in Figma
    if (!h) { if (sel.obj || sel.group) select(null); return; }
    const o = state.objects.find(x => x.id === h.objId); if (!o) return;
    const hs = stickerHit(h);
    if (hs) {
      if (o.id !== sel.obj || (h.face && h.face !== sel.face)) select(o.id, h.face || undefined, null, { flash: false });
      sel.sticker = hs.id; sel.layer = null; renderLayers(); renderLayerProps(); renderStickers(); ui.editor = true;
      setTab('stickers');
      return;
    }
    if (sel.sticker) { sel.sticker = null; ui.stickers = true; }
    let hitL = null;
    if (h.face && h.uv && !h.wall) { const [W, H] = facePx(o, h.face); hitL = hitLayer(o.faces[h.face], W, H, h.uv.x * W, (1 - h.uv.y) * H); }
    const layerId = hitL?.id ?? null, same = o.id === sel.obj && h.face === sel.face, add = e.shiftKey || e.ctrlKey || e.metaKey;
    // a layer of a group picks the group (a layer inside it once the group is entered); Shift / Ctrl adds or takes off
    if (hitL && same) pickLayers(clickPick(o.faces[h.face], hitL, add));
    else if (add && same) return;
    else { select(o.id, h.face || undefined, null, { flash: true }); if (hitL) pickLayers(clickPick(o.faces[h.face], hitL)); }
    // a click on a layer opens its design; a click on a bare face keeps the section that is open
    if (layerId) setTab('design');
  });
  cvs.addEventListener('pointercancel', () => { if (xform) endXform(); if (drag3) { drag3 = null; controls.enabled = true; } if (dragSt) { dragSt = null; controls.enabled = true; } down = null; });
  window.addEventListener('dragover', e => { if (isLibDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  window.addEventListener('drop', e => {
    if (!isLibDrag(e)) return; e.preventDefault();
    const it = library.find(x => x.hash === e.dataTransfer.getData('application/x-bs-asset')); if (!it) return;
    if (e.target === cvs) {
      const h = pick(e.clientX, e.clientY), st = stickerHit(h);
      // onto a sticker: its picture
      if (st) { const o = state.objects.find(x => x.id === h.objId); select(o.id, st.face); sel.sticker = st.id; return setStickerImage(o, st, it); }
      if (h?.face && !h.wall) { const o = state.objects.find(x => x.id === h.objId); select(o.id, h.face); return placeLibImage(it, o, h.face, h.uv ? [h.uv.x, 1 - h.uv.y] : null); }
    }
    if (e.target === ed && activeObj()) { const [mx, my] = edPoint(e); return placeLibImage(it, activeObj(), sel.face, [mx / edState.dw, my / edState.dh]); }
  });
  window.addEventListener('dragenter', e => { if (!isFileDrag(e)) return; e.preventDefault(); dragDepth++; $('#dropHint').hidden = false; });
  window.addEventListener('dragleave', e => { if (!isFileDrag(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropHint').hidden = true; });
  window.addEventListener('dragover', e => { if (isFileDrag(e)) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!isFileDrag(e)) return; e.preventDefault(); dragDepth = 0; $('#dropHint').hidden = true;
    const file = [...e.dataTransfer.files][0]; if (!file) return;
    if (/\.(ttf|otf|woff2?)$/i.test(file.name)) return addFontFile(file);
    if (file.name.endsWith('.json')) return openProjectFile(file);
    if (e.target === cvs) {
      const h = pick(e.clientX, e.clientY);
      if (h?.face && !h.wall) { const o = state.objects.find(x => x.id === h.objId); return addImageToFace(file, o, h.face, h.uv ? [h.uv.x, 1 - h.uv.y] : null); }
    }
    if (e.target === ed && activeObj()) { const [mx, my] = edPoint(e); return addImageToFace(file, activeObj(), sel.face, [mx / edState.dw, my / edState.dh]); }
    if (activeObj()) addImageToFace(file);
  });
  // layers go to the clipboard as text marked as ours, so they paste onto another face, object or tab
  const CLIP = 'boxstudio-layers:';
  const copyOut = (e, cut) => {
    if (e.target.closest?.('input,textarea') || String(getSelection?.() || '')) return;
    const o = activeObj(), Ls = selectedLayers(); if (!o || !Ls.length) return;
    e.preventDefault(); e.clipboardData.setData('text/plain', CLIP + JSON.stringify(copyData(o, sel.face, Ls)));
    if (cut) deleteLayer(Ls[0].id);
  };
  document.addEventListener('copy', e => copyOut(e, false));
  document.addEventListener('cut', e => copyOut(e, true));
  document.addEventListener('paste', e => {
    if (e.target.closest?.('input,textarea')) return;
    const txt = e.clipboardData?.getData('text/plain') || '';
    if (txt.startsWith(CLIP) && activeObj() && sel.face) {
      e.preventDefault();
      try { const out = pasteData(activeObj(), sel.face, JSON.parse(txt.slice(CLIP.length))); pickLayers(out.map(l => l.id)); renderFaceTabs(); commit(); } catch { toast('Не удалось вставить слои'); }
      return;
    }
    const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (it && activeObj()) { e.preventDefault(); addImageToFace(it.getAsFile()); }
  });
  /* keyboard */
  document.addEventListener('keydown', e => {
    const typing = e.target.closest?.('input,textarea,select');
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape') { $('#exportMenu').hidden = true; $('#exportBtn').setAttribute('aria-expanded', 'false'); }
    if (typing) return;
    // Enter or Esc ends crop or mask mode
    if (editMode() && (e.key === 'Escape' || e.key === 'Enter')) { e.preventDefault(); setEditMode(null); renderLayerProps(); ui.editor = true; return; }
    if (!mod && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'f' || key === 'а') { e.preventDefault(); return activeObj() ? focusSelected({ frame: true }) : setView('fit'); }
      if (key === 'h' || key === 'р' || e.key === 'Home') { e.preventDefault(); return setView('fit'); }
    }
    // the face's layers, as in Figma: Ctrl+A all, Ctrl+G group, Ctrl+Shift+G ungroup, Alt+A/D/W/S/H/V align,
    // Alt+Shift+H/V distribute, Ctrl+] / Ctrl+[ up and down (with Shift: to the top or the bottom)
    if (activeObj() && sel.face && activeFaceData()) {
      if (mod && !e.altKey && e.code === 'KeyA') { e.preventDefault(); return pickLayers(activeFaceData().layers.map(l => l.id)); }
      if (mod && e.code === 'KeyG' && sel.layer) { e.preventDefault(); return layerCmd(e.shiftKey ? 'ungroup' : 'group'); }
      if (e.altKey && !mod && sel.layer) {
        const al = { KeyA: 'left', KeyD: 'right', KeyW: 'top', KeyS: 'bottom', KeyH: 'hcenter', KeyV: 'vcenter' }[e.code];
        if (e.shiftKey && (e.code === 'KeyH' || e.code === 'KeyV')) { e.preventDefault(); return layerCmd('distribute', e.code === 'KeyH' ? 'x' : 'y'); }
        if (al) { e.preventDefault(); return layerCmd('align', al); }
      }
      if (mod && sel.layer && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
        e.preventDefault(); const up = e.code === 'BracketRight';
        return moveLayer(sel.layer, e.shiftKey ? (up ? Infinity : -Infinity) : up ? 1 : -1);
      }
    }
    const ST = !activeLayer() && activeSticker();
    if (ST) {
      const o = activeObj();
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return deleteSticker(ST.id); }
      if (e.key === 'Escape') { sel.sticker = null; return renderStickers(); }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault(); const [mw, mh] = faceMM(o, ST.face), mm = e.shiftKey ? 5 : .5;
        if (e.key === 'ArrowLeft') ST.x -= mm / mw; if (e.key === 'ArrowRight') ST.x += mm / mw;
        if (e.key === 'ArrowUp') ST.y -= mm / mh; if (e.key === 'ArrowDown') ST.y += mm / mh;
        touchSticker(o, ST); refreshFields($('#stickerSec'), ST); clearTimeout(nudgeT); nudgeT = setTimeout(commit, 400);
      }
      return;
    }
    const L = activeLayer(); if (!L) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteLayer(L.id); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateLayer(L.id); }
    else if (e.key === 'Escape') selectLayer(null);
    else if (e.key.startsWith('Arrow')) {
      // all the picked layers, by half a percent of the face (Shift: five)
      e.preventDefault(); const o = activeObj(), [W, H] = facePx(o, sel.face), st = e.shiftKey ? .05 : .005;
      const dx = e.key === 'ArrowLeft' ? -st * W : e.key === 'ArrowRight' ? st * W : 0, dy = e.key === 'ArrowUp' ? -st * H : e.key === 'ArrowDown' ? st * H : 0;
      moveLayers(o, sel.face, snapshot(selectedLayers()), dx, dy);
      refreshFields($('#layerSec'), L); clearTimeout(nudgeT); nudgeT = setTimeout(commit, 400);
    }
  });
}

export { down, dragSt, initInteraction, pick, stickerHit };
