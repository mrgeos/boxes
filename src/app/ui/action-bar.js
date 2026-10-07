// Панель действий над сценой: инструменты (выделение, перемещение, поворот, ладонь) и быстрые действия с объектом
import * as THREE from 'three';
import { $, $$ } from '../core/util.js';
import { activeObj, sel } from '../core/state.js';
import { faceKeys, newText } from '../core/model.js';
import { controls, cvs } from '../scene/renderer.js';
import { invalidate } from '../scene/camera.js';
import { syncRings } from '../scene/move.js';
import { newSticker } from '../stickers/placement.js';
import { addLayer } from './face-panel.js';
import { placeLibImage } from './library-panel.js';
import { addSticker } from './stickers-panel.js';
import { lidAction, toggleLid } from './context-menus.js';
import { pickAsset } from './asset-picker.js';
import { setTab } from './tabs.js';
import { startTextEdit } from './text-edit.js';

/* Tools decide what a drag on the model does:
   select (V) — picks faces, layers and stickers and drags the graphics over the model; objects stay put;
   move (M)   — drags an object (or the selected group) over the floor, Shift keeps to one axis;
   rotate (R) — turns it round its own axis, Shift in steps of 15°;
   hand       — drags the view; held Space gives it for a moment, as in Photoshop and Figma.
   A drag on empty space turns the camera with every tool but the hand. Quick actions work on the selection. */
const TOOLS = { select: 'Выделение и графика (V)', move: 'Перемещение объекта (M)', rotate: 'Поворот объекта (R)', hand: 'Ладонь — сдвиг вида (пробел)' };
let cur = 'select', spaceFrom = null;
const tool = () => cur;
function setTool(t) {
  if (!TOOLS[t]) return;
  cur = t;
  // the hand drags the view with the left button (the orbit controls pan instead of turning)
  controls.mouseButtons.LEFT = t === 'hand' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  cvs.dataset.tool = t; cvs.style.cursor = t === 'hand' ? 'grab' : '';
  $$('#actionBar [data-tool]').forEach(b => { const on = b.dataset.tool === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  syncRings(); invalidate();
}
/* quick actions follow the selection: what can be added, whether a lid opens */
function renderActionBar() {
  const o = activeObj(), lid = o && lidAction(o);
  $$('#actionBar .needs-obj').forEach(b => { b.disabled = !o; });
  const lb = $('#abLid');
  lb.disabled = !lid; lb.title = lid ? (o.lid > 0 ? lid[1] : lid[0]) : 'Открыть / закрыть';
  lb.classList.toggle('on', !!(o && o.lid > 0));
}
const face = o => sel.face && faceKeys(o).includes(sel.face) ? sel.face : faceKeys(o)[0];
function initActionBar() {
  $$('#actionBar [data-tool]').forEach(b => { b.onclick = () => setTool(b.dataset.tool); b.title = TOOLS[b.dataset.tool]; });
  $('#abText').onclick = () => { const o = activeObj(); if (!o) return; setTab('design'); const L = newText('Ваш текст'); addLayer(L, face(o), o); startTextEdit(L, '3d', true); };
  $('#abImage').onclick = e => { const o = activeObj(); if (!o) return; pickAsset(e.currentTarget, 'Картинка на грань', r => { setTab('design'); placeLibImage(r, o, face(o)); }); };
  $('#abSticker').onclick = () => { const o = activeObj(); if (!o) return; addSticker(newSticker('circle', face(o))); };
  $('#abLid').onclick = () => { const o = activeObj(); if (o) toggleLid(o).then(renderActionBar); };
  document.addEventListener('keydown', e => {
    if (e.target.closest?.('input,textarea,select,[contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat && cur !== 'hand') { spaceFrom = cur; setTool('hand'); } return; }
    const t = { v: 'select', м: 'select', m: 'move', ь: 'move', r: 'rotate', к: 'rotate' }[e.key.toLowerCase()];
    if (t) { e.preventDefault(); setTool(t); }
  });
  document.addEventListener('keyup', e => { if (e.key === ' ' && spaceFrom) { setTool(spaceFrom); spaceFrom = null; } });
  setTool('select'); renderActionBar();
}

export { initActionBar, renderActionBar, setTool, tool };
