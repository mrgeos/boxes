// Мышь, касания, перетаскивание файлов, клавиатура

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
const cvs = renderer.domElement;
let down = null, drag3 = null, dragSt = null, hoverT = 0;
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
cvs.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2 && lockActive()) { const [x, y] = touchMid(); pan = { x, y, vx: view.x, vy: view.y, touch: true }; }
    return;
  }
  if (!lockActive() || drag3) return;
  if (e.button === 2 || (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey))) {
    pan = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; camTween = null; cvs.setPointerCapture(e.pointerId); cvs.style.cursor = 'move';
  }
}, true);
window.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (!pan) return;
  const [x, y] = pan.touch ? (touches.size === 2 ? touchMid() : [pan.x, pan.y]) : [e.clientX, e.clientY];
  view.x = pan.vx - (x - pan.x); view.y = pan.vy - (y - pan.y); applyViewOffset();
});
const endPan = e => { touches.delete(e.pointerId); if (pan && (!pan.touch || touches.size < 2)) { pan = null; cvs.style.cursor = 'grab'; } };
window.addEventListener('pointerup', endPan);
 window.addEventListener('pointercancel', endPan);
cvs.addEventListener('dblclick', e => {
  const h = pick(e.clientX, e.clientY); if (!h) return setView('fit');
  if (h.objId !== sel.obj) select(h.objId, h.face || undefined, null, { flash: true });
  focusSelected({ frame: true });
});
cvs.addEventListener('pointerdown', e => {
  if (recording || e.button !== 0 || pan) return;
  down = { x: e.clientX, y: e.clientY };
  const h = pick(e.clientX, e.clientY), L = activeLayer();
  // a selected sticker is dragged across the model, face to face
  const hs = sel.sticker && h?.objId === sel.obj ? stickerHit(h) : null;
  if (hs && hs.id === sel.sticker) {
    dragSt = { st: hs, o: activeObj() }; controls.enabled = false; cvs.setPointerCapture(e.pointerId); cvs.style.cursor = 'grabbing';
    return;
  }
  if (h && L && h.objId === sel.obj && h.face === sel.face && h.uv && !h.wall) {
    const o = activeObj(), [W, H] = facePx(o, sel.face);
    const hit = hitLayer(o.faces[sel.face], W, H, h.uv.x * W, (1 - h.uv.y) * H);
    if (hit && hit.id === L.id) {
      drag3 = { L, u: h.uv.x, v: h.uv.y, x: L.x, y: L.y, mesh: h.mesh, mi: h.mi };
      controls.enabled = false; cvs.setPointerCapture(e.pointerId); cvs.style.cursor = 'grabbing';
    }
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
  if (drag3) {
    const h = pick(e.clientX, e.clientY, drag3.mesh);
    if (h && h.uv && h.mi === drag3.mi) {
      drag3.L.x = drag3.x + (h.uv.x - drag3.u); drag3.L.y = drag3.y - (h.uv.y - drag3.v);
      markFace(activeObj(), sel.face); refreshFields($('#layerSec'), drag3.L);
    }
    return;
  }
  if (e.buttons || e.timeStamp - hoverT < 50) return; hoverT = e.timeStamp;
  const h = pick(e.clientX, e.clientY); let cur = 'grab';
  if (h?.face) {
    cur = 'pointer';
    const L = activeLayer();
    if (L && h.objId === sel.obj && h.face === sel.face && h.uv && !h.wall) {
      const o = activeObj(), [W, H] = facePx(o, sel.face);
      if (hitLayer(o.faces[sel.face], W, H, h.uv.x * W, (1 - h.uv.y) * H)?.id === L.id) cur = 'move';
    }
    if (sel.sticker && h.objId === sel.obj && stickerHit(h)?.id === sel.sticker) cur = 'move';
  }
  cvs.style.cursor = cur;
});
cvs.addEventListener('pointerup', e => {
  if (dragSt) { stickerDirty.add(dragSt.o.id); dragSt = null; controls.enabled = true; cvs.style.cursor = 'move'; ui.stickers = true; commit(); down = null; return; }
  if (drag3) { drag3 = null; controls.enabled = true; cvs.style.cursor = 'move'; ui.layers = true; commit(); down = null; return; }
  if (e.button !== 0 || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
  down = null;
  const h = pick(e.clientX, e.clientY);
  if (!h) return;
  const o = state.objects.find(x => x.id === h.objId); if (!o) return;
  const hs = stickerHit(h);
  if (hs) {
    if (o.id !== sel.obj || (h.face && h.face !== sel.face)) select(o.id, h.face || undefined, null, { flash: false });
    sel.sticker = hs.id; sel.layer = null; renderLayers(); renderLayerProps(); renderStickers(); ui.editor = true;
    return;
  }
  if (sel.sticker) { sel.sticker = null; ui.stickers = true; }
  let layerId = null;
  if (h.face && h.uv && !h.wall) { const [W, H] = facePx(o, h.face); layerId = hitLayer(o.faces[h.face], W, H, h.uv.x * W, (1 - h.uv.y) * H)?.id ?? null; }
  select(o.id, h.face || undefined, layerId, { flash: true });
});
cvs.addEventListener('pointercancel', () => { if (drag3) { drag3 = null; controls.enabled = true; } if (dragSt) { dragSt = null; controls.enabled = true; } down = null; });
/* drag & drop images onto the model, the editor, or anywhere */
let dragDepth = 0;
const isFileDrag = e => [...(e.dataTransfer?.types || [])].includes('Files');
const isLibDrag = e => [...(e.dataTransfer?.types || [])].includes('application/x-bs-asset');
window.addEventListener('dragover', e => { if (isLibDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
window.addEventListener('drop', e => {
  if (!isLibDrag(e)) return; e.preventDefault();
  const it = library.find(x => x.hash === e.dataTransfer.getData('application/x-bs-asset')); if (!it) return;
  if (e.target === cvs) {
    const h = pick(e.clientX, e.clientY);
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
document.addEventListener('paste', e => {
  if (e.target.closest?.('input,textarea')) return;
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
  if (!mod && !e.altKey) {
    const key = e.key.toLowerCase();
    if (key === 'f' || key === 'а') { e.preventDefault(); return activeObj() ? focusSelected({ frame: true }) : setView('fit'); }
    if (key === 'h' || key === 'р' || e.key === 'Home') { e.preventDefault(); return setView('fit'); }
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
    e.preventDefault(); const st = e.shiftKey ? .05 : .005;
    if (e.key === 'ArrowLeft') L.x -= st; if (e.key === 'ArrowRight') L.x += st; if (e.key === 'ArrowUp') L.y -= st; if (e.key === 'ArrowDown') L.y += st;
    markFace(activeObj(), sel.face); refreshFields($('#layerSec'), L); clearTimeout(nudgeT); nudgeT = setTimeout(commit, 400);
  }
});
let nudgeT;
