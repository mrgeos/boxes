// Правка текста прямо на модели и в окне грани: курсор в самой надписи, как в Figma
import { $, DEG } from '../core/util.js';
import { activeLayer, activeObj, sel } from '../core/state.js';
import { facePx } from '../core/model.js';
import { fontStr } from '../core/fonts.js';
import { layerBox, setTextCaret, textIndexAt } from '../faces/render.js';
import { RT, cvs, markFace } from '../scene/renderer.js';
import { pick } from '../scene/interaction.js';
import { invalidate } from '../scene/camera.js';
import { boxOnScreen } from '../scene/sel-box.js';
import { deleteLayers, setLayerSelection, setText } from '../core/layers.js';
import { commit } from '../core/project.js';
import { refreshFields } from './fields.js';
import { ed, edPoint, edState, hitLayer } from './face-editor.js';
import { renderFaceTabs, renderLayerProps, renderLayers } from './face-panel.js';

/* The keys go into a textarea laid over the text layer (in perspective, CSS matrix3d, onto where the layer is on
   the screen: the face window, or the corners of the selection frame on the model) — it is there for the keyboard
   and the input of other alphabets only, invisible and not taking the mouse. What shows is the print itself, drawn
   anew at each key with the caret and the selection on it (faces/render.js), so they sit right on any surface,
   round walls included. A click on the text puts the caret there, a drag over it selects; a drag elsewhere turns
   the camera and the typing goes on; a click elsewhere, Esc or Ctrl+Enter ends it. A text left empty is removed. */
let cur = null;   // { o, k, L, where: '3d' | '2d', raf, before }
const textEditing = () => !!cur;

/* the 3×3 map of the unit square onto a quad (p0…p3: top-left, top-right, bottom-right, bottom-left) */
function squareToQuad([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1, g = den ? (dx3 * dy2 - dx2 * dy3) / den : 0, h = den ? (dx1 * dy3 - dx3 * dy1) / den : 0;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
}
/* the four corners of the layer's box on the screen, or null */
function quad() {
  const { o, k, L, where } = cur;
  if (where === '3d') return boxOnScreen();
  const r = ed.getBoundingClientRect(), PAD = (r.width - edState.dw) / 2, [W, H] = facePx(o, k), [w, h] = layerBox(L, W, H), s = edState.k;
  const a = (L.rot || 0) * DEG, cs = Math.cos(a), sn = Math.sin(a), cx = r.left + PAD + L.x * W * s, cy = r.top + PAD + L.y * H * s;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => { const x = sx * w * s / 2, y = sy * h * s / 2; return [cx + x * cs - y * sn, cy + x * sn + y * cs]; });
}
/* lays the textarea over the layer */
function place() {
  if (!cur) return;
  const ta = $('#textEdit'), { o, k, L } = cur, [W, H] = facePx(o, k), [w, h] = layerBox(L, W, H), q = quad();
  if (!q) { ta.style.visibility = 'hidden'; return; }
  const fs = Math.max(1, L.size * H), pad = fs;   // room for the caret past the end
  ta.style.visibility = '';
  ta.style.font = fontStr(L, fs); ta.style.lineHeight = L.lh * fs + 'px'; ta.style.letterSpacing = (L.ls || 0) * fs + 'px';
  ta.style.textAlign = L.align || 'center'; ta.style.width = w + 'px'; ta.style.height = h + 'px'; ta.style.padding = `0 ${pad}px`;
  const [a, b, c, d, e, f, g, hh] = squareToQuad(q);
  // the element's px → the unit square → the screen; the padding sits outside the layer's box
  ta.style.transform = `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${hh / h},0,0,1,0,${c},${f},0,1) translate(${-pad}px,0)`;
}
function loop() { if (!cur) return; place(); cur.raf = requestAnimationFrame(loop); }

/* starts typing into text layer L of face k of object o, on the model ('3d') or in the face window ('2d') */
function startTextEdit(L, where = '3d', all = false) {
  const o = activeObj(), k = sel.face; if (!o || !k || L?.type !== 'text') return;
  if (cur) stopTextEdit();
  setLayerSelection([L.id]);
  cur = { o, k, L, where, before: L.text };
  const ta = $('#textEdit'); ta.value = L.text; ta.hidden = false;
  place(); ta.focus();
  if (all) ta.select(); else ta.setSelectionRange(ta.value.length, ta.value.length);
  cur.raf = requestAnimationFrame(loop);
  cur.blink = setInterval(() => { if (cur) { cur.on = !cur.on; showCaret(true); } }, 530);
  showCaret(true);
}
/* the caret and selection onto the print (only when they changed, or for the blink) */
function showCaret(force = false) {
  if (!cur) return;
  const ta = $('#textEdit'), c = { id: cur.L.id, a: ta.selectionStart, b: ta.selectionEnd, on: cur.on !== false };
  const key = [c.a, c.b, c.on].join();
  if (!force && key === cur.caretKey) return;
  if (key.split(',').slice(0, 2).join() !== (cur.caretKey || '').split(',').slice(0, 2).join()) { cur.on = c.on = true; }
  cur.caretKey = [c.a, c.b, c.on].join();
  setTextCaret(c); markFace(cur.o, cur.k);
}
function stopTextEdit(save = true) {
  if (!cur) return;
  const { o, k, L, before, raf } = cur, ta = $('#textEdit');
  clearInterval(cur.blink); cur = null; cancelAnimationFrame(raf); setTextCaret(null); markFace(o, k);
  ta.hidden = true; ta.blur();
  if (!save) setText(o, k, L, before);
  // a text left empty goes away, as in Figma
  if (!L.text.trim()) { deleteLayers(o, k, [L]); setLayerSelection([]); renderFaceTabs(); }
  renderLayers(); renderLayerProps(); commit(); invalidate();
}
function initTextEdit() {
  const ta = $('#textEdit');
  ta.addEventListener('input', () => {
    if (!cur) return;
    setText(cur.o, cur.k, cur.L, ta.value); place();
    const sec = $('#layerSec'); if (sec && activeLayer() === cur.L) refreshFields(sec, cur.L);
  });
  ta.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); stopTextEdit(); }
  });
  ta.addEventListener('blur', () => { if (cur) stopTextEdit(); });
  document.addEventListener('selectionchange', () => showCaret());
  ta.addEventListener('keyup', () => showCaret());
  // the mouse over the model and the face window while typing
  const press = (e, where) => {
    if (!cur || e.button !== 0) return;
    const i = indexAt(e, where);
    if (i == null) { cur.press = { x: e.clientX, y: e.clientY }; return; }
    // on the text: the caret goes there (Shift: the selection grows to it), a drag selects
    e.stopImmediatePropagation(); e.preventDefault();
    const ta = $('#textEdit'), anchor = e.shiftKey ? ta.selectionStart : i;
    cur.drag = { anchor, target: e.currentTarget }; e.currentTarget.setPointerCapture(e.pointerId);
    ta.setSelectionRange(Math.min(anchor, i), Math.max(anchor, i)); showCaret();
  };
  for (const [el, where] of [[cvs, '3d'], [ed, '2d']]) {
    el.addEventListener('pointerdown', e => press(e, where), true);
    // the textarea keeps the keyboard while the camera turns
    el.addEventListener('mousedown', e => { if (cur) e.preventDefault(); }, true);
    el.addEventListener('pointermove', e => {
      if (!cur?.drag) return;
      const i = indexAt(e, where, true); if (i == null) return;
      const a = cur.drag.anchor; $('#textEdit').setSelectionRange(Math.min(a, i), Math.max(a, i), i < a ? 'backward' : 'forward'); showCaret();
    });
    // a double click on the text selects a word
    el.addEventListener('dblclick', e => {
      if (!cur) return;
      const i = indexAt(e, where); if (i == null) return;
      e.stopImmediatePropagation(); e.preventDefault();
      const t = cur.L.text, w = ch => /[\p{L}\p{N}_]/u.test(ch || '');
      let a = i, b = i; while (a > 0 && w(t[a - 1])) a--; while (b < t.length && w(t[b])) b++;
      $('#textEdit').setSelectionRange(a, b); showCaret();
    }, true);
    el.addEventListener('pointerup', e => {
      if (!cur) return;
      if (cur.drag) { cur.drag = null; e.stopImmediatePropagation(); return; }
      // a click (not a drag) away from the text ends the typing
      const p = cur.press; cur.press = null;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) stopTextEdit();
    }, true);
  }
}
/* the string index under the pointer, if it is on the text being typed (any: anywhere on its face) */
function indexAt(e, where, any = false) {
  const { o, k, L } = cur, [W, H] = facePx(o, k);
  let p = null;
  if (where === '2d') { const [mx, my] = edPoint(e); p = [mx / edState.k, my / edState.k]; }
  else { const h = pick(e.clientX, e.clientY, RT.get(o.id)?.group); if (h?.face === k && h.uv && !h.wall) p = [h.uv.x * W, (1 - h.uv.y) * H]; }
  if (!p || (!any && !hitLayer({ layers: [L] }, W, H, p[0], p[1]))) return null;
  return textIndexAt(L, W, H, p[0], p[1]);
}

export { initTextEdit, startTextEdit, stopTextEdit, textEditing };
