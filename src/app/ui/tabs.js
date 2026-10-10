// Разделы: слева общее (добавить, объекты, бренд, загрузки), справа — выбранный объект (форма, дизайн, допы, развёртка) или сцена
import { $, $$, esc } from '../core/util.js';
import { activeObj, sel } from '../core/state.js';
import { activeFill, activeRibbon, extraById, extraName } from '../core/extras.js';
import { activeSticker } from '../stickers/placement.js';
import { selectObjectItself } from '../core/selection.js';
import { ui } from '../scene/renderer.js';
import { renderGallery } from './preset-gallery.js';

/* As in Figma: the left panel holds what belongs to the whole project (its rail picks a section: add from presets, the objects, the brand kit, uploads), the right one
   works on the selection (its tabs pick a section; with nothing selected it holds the scene: light, reflections, background). A section is a .sec with
   data-tab. Both choices are kept for the next visit. Canvases in a section (the face editor, the net) are
   drawn again when it is shown, as they take their size from the panel. */
const LEFT = ['add', 'models', 'brand', 'library'], RIGHT = ['shape', 'design', 'extras', 'net'];
let left = 'models', right = 'design', hasSel = true;
const curTab = () => shownTab();
function show(panel, t) {
  $$(`#${panel} > .sec`).forEach(s => { s.hidden = s.dataset.tab !== t; });
  $(`#${panel}`).dataset.tab = t;
}
/* the tabs the selection has: an object all four; a sleeve or a carrier (an extra with a face) its shape, design and
   net; a sticker or a ribbon its settings (in the extras' section). A tab missing for the selection is shown as the first one
   it has, and the chosen tab comes back with the next object. */
function tabsNow() {
  if (sel.group || !activeObj()) return RIGHT;
  // an extra without a face of its own: its settings split into the same tabs as a part's (in the extras' section)
  if (activeSticker() || activeRibbon()) return ['shape', 'design'];
  if (activeFill()) return ['shape'];   // a 3D model: no print
  if (activeObj().type === 'model') return ['shape'];   // a 3D model: no print, no extras
  if (sel.part) return ['shape', 'design', 'net'];
  return RIGHT;
}
const shownTab = () => { const t = tabsNow(); return t.includes(right) ? right : t.includes('design') && !paneExtra() ? 'design' : t[0]; };
/* a sticker, a ribbon or a filling: drawn in the extras' section, its panes (data-pane) follow the tabs */
const paneExtra = () => !sel.group && !!activeObj() && !!(activeSticker() || activeRibbon() || activeFill());
function paintRight() {
  const tabs = tabsNow(), cur = shownTab(), pane = paneExtra() ? cur : '';
  show('propPanel', hasSel ? (pane ? 'extras' : cur) : 'none');
  $('#stickerSec').dataset.pane = pane;
  $('#propTabs').hidden = !hasSel || tabs.length < 2;
  $$('#propTabs button').forEach(b => {
    const on = b.dataset.tab === cur; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); b.hidden = !tabs.includes(b.dataset.tab);
  });
  paintCrumb();
  ui.editor = ui.net = true;
}
/* over the tabs of an extra: the object it belongs to (a click goes back to it) › the extra */
function paintCrumb() {
  const o = activeObj(), el = $('#propCrumb'), e = o && !sel.group && (activeSticker() ? extraById(o, sel.sticker) : activeRibbon() || activeFill() ? extraById(o, sel.ribbon) : sel.part ? extraById(o, sel.part) : null);
  el.hidden = !e;
  if (!e) { el.innerHTML = ''; return; }
  el.innerHTML = `<button class="up" title="К объекту">${esc(o.name)}</button><span class="sep">›</span><b>${esc(extraName(o, e))}</b>`;
  $('.up', el).onclick = () => selectObjectItself();
}
/* the selection changed between an object and its extras */
function refreshTabs() { paintRight(); }
function setTab(t) {
  if (LEFT.includes(t)) {
    left = t; show('sidePanel', t); $('#sidePanel').scrollTop = 0;
    $$('#rail .rail-btn').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    if (t === 'add') renderGallery();
    if (t === 'brand') ui.brand = true;
  } else if (RIGHT.includes(t)) { right = t; paintRight(); $('#propPanel').scrollTop = 0; }
  // the stickers' tab of older versions
  else if (t === 'stickers') return setTab('extras');
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

export { curTab, initTabs, refreshTabs, setTab, syncProps };
