// Разделы: слева общее (добавить, модели, загрузки, сцена), справа — выбранный объект (форма, дизайн, наклейки, развёртка)
import { $, $$ } from '../core/util.js';
import { ui } from '../scene/renderer.js';
import { renderGallery } from './preset-gallery.js';

/* As in Figma: the left panel holds what belongs to the whole project (its rail picks a section: add from presets, the objects, uploads, the scene), the right one
   works on the selection (its tabs pick a section; with nothing selected it says so). A section is a .sec with
   data-tab. Both choices are kept for the next visit. Canvases in a section (the face editor, the net) are
   drawn again when it is shown, as they take their size from the panel. */
const LEFT = ['add', 'models', 'library', 'scene'], RIGHT = ['shape', 'design', 'stickers', 'net'];
let left = 'models', right = 'design', hasSel = true;
const curTab = () => right;
function show(panel, t) {
  $$(`#${panel} > .sec`).forEach(s => { s.hidden = s.dataset.tab !== t; });
  $(`#${panel}`).dataset.tab = t;
}
function paintRight() {
  show('propPanel', hasSel ? right : 'none');
  $('#propTabs').hidden = !hasSel;
  $$('#propTabs button').forEach(b => { const on = b.dataset.tab === right; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  ui.editor = ui.net = true;
}
function setTab(t) {
  if (LEFT.includes(t)) {
    left = t; show('sidePanel', t); $('#sidePanel').scrollTop = 0;
    $$('#rail .rail-btn').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    if (t === 'add') renderGallery();
  } else if (RIGHT.includes(t)) { right = t; paintRight(); $('#propPanel').scrollTop = 0; }
  else return;
  try { localStorage.setItem('bs3d-tabs', JSON.stringify({ left, right })); } catch {}
}
/* the right panel follows the selection: something selected or nothing */
function syncProps(has) { if (has === hasSel) return; hasSel = has; paintRight(); }
function initTabs() {
  $$('#rail .rail-btn').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
  $$('#propTabs button').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('bs3d-tabs') || '{}'); } catch {}
  setTab(LEFT.includes(saved.left) ? saved.left : 'models');
  setTab(RIGHT.includes(saved.right) ? saved.right : 'design');
}

export { curTab, initTabs, setTab, syncProps };
