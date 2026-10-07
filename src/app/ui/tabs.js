// Разделы левой панели: рейка слева, в панели виден один раздел
import { $, $$ } from '../core/util.js';
import { ui } from '../scene/renderer.js';
import { renderGallery } from './preset-gallery.js';

/* Each section of the side panel belongs to one tab (data-tab); the rail picks the tab. The choice is kept
   for the next visit. Canvases in a tab (the face editor, the net) are drawn again when it is shown, as
   they take their size from the panel. */
const TABS = ['models', 'shape', 'design', 'stickers', 'library', 'net', 'scene'];
let tab = 'design';
const curTab = () => tab;
function setTab(t) {
  if (!TABS.includes(t)) return;
  tab = t;
  $('#sidePanel').dataset.tab = t;
  $$('#sidePanel > .sec').forEach(s => { s.hidden = s.dataset.tab !== t; });
  $$('#rail .rail-btn').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  $('#sidePanel').scrollTop = 0;
  ui.editor = ui.net = true;
  if (t === 'models') renderGallery();
  try { localStorage.setItem('bs3d-tab', t); } catch {}
}
function initTabs() {
  $$('#rail .rail-btn').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
  let saved = null; try { saved = localStorage.getItem('bs3d-tab'); } catch {}
  setTab(TABS.includes(saved) ? saved : 'models');
}

export { curTab, initTabs, setTab };
