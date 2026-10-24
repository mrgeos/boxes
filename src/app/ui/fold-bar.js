// Ползунок «Сборка» под 3D: от плоской развёртки до собранной коробки, и кнопка «играть»
import { $ } from '../core/util.js';
import { activeObj, sel } from '../core/state.js';
import { liftOverBars } from './view-cube.js';
import { recording } from '../scene/camera.js';
import { canFold, foldDone, foldOf, playFold, setFold, stopFold } from '../scene/fold.js';
import { textEditing } from './text-edit.js';

/* A slim bar over the context bar (or over the action bar when that is hidden) for an object whose blank can fold:
   ▶ plays the box unfolding and folding back, the slider sets the fold by hand. It only calls setFold / playFold
   (scene/fold.js), which an agent calls just as well. The camera is brought to the flat blank when the fold begins. */
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
let el = null, key = '', playing = false;
const bar = () => el || (el = $('#foldBar'));

function target() {
  const o = activeObj();
  return o && !sel.group && sel.multi.length < 2 && !recording && !textEditing() && canFold(o) ? o : null;
}
function setPlaying(v) { playing = v; const b = $('#fbPlay'); if (b) { b.innerHTML = v ? PAUSE : PLAY; b.setAttribute('aria-label', v ? 'Остановить' : 'Показать сборку'); b.title = v ? 'Остановить' : 'Показать, как коробка собирается из развёртки'; } }
/* shown for the selected object; follows the fold (a play, or the API) and sits over the bars below it */
function syncFoldBar() {
  const b = bar(); if (!b) return;
  const o = target();
  if (!o) { if (!b.hidden) { b.hidden = true; liftOverBars($('#viewCube')); liftOverBars($('#itemNav')); } if (playing) setPlaying(false); key = ''; return; }
  const v = Math.round(foldOf(o.id) * 100), r = $('#fbRange');
  if (!b.dataset.drag && +r.value !== v) r.value = v;
  $('#fbVal').textContent = v + ' %';
  const st = b.parentElement, sw = st.clientWidth, narrow = sw < 520;
  b.hidden = false;
  b.style.width = narrow ? sw - 16 + 'px' : ''; b.style.left = '8px';
  const left = narrow ? 8 : Math.round(Math.max(8, (sw - b.offsetWidth) / 2));
  const cb = $('#ctxBar'), top = (!cb.hidden && cb.offsetHeight ? cb.offsetTop : $('#actionBar').offsetTop) - b.offsetHeight - 6;
  const k = [o.id, left, Math.round(top), sw].join('|');
  b.style.left = left + 'px'; b.style.top = Math.round(top) + 'px';
  if (k !== key) { key = k; liftOverBars($('#viewCube')); liftOverBars($('#itemNav')); }
}
function initFoldBar() {
  const b = document.createElement('div');
  b.className = 'fbar'; b.id = 'foldBar'; b.setAttribute('role', 'group'); b.setAttribute('aria-label', 'Сборка'); b.hidden = true;
  b.innerHTML = `<button class="ab" id="fbPlay" type="button">${PLAY}</button><span class="fb-l">Сборка</span><input type="range" id="fbRange" min="0" max="100" step="1" value="100" aria-label="Сборка: от развёртки до коробки"><output id="fbVal" aria-live="off">100 %</output>`;
  $('#ctxBar').before(b); bar();
  setPlaying(false);
  b.addEventListener('pointerdown', e => e.stopPropagation());
  $('#fbRange').addEventListener('pointerdown', () => { b.dataset.drag = '1'; });
  addEventListener('pointerup', () => { delete b.dataset.drag; });
  $('#fbRange').addEventListener('input', e => {
    const o = target(); if (!o) return;
    stopFold(o.id); setPlaying(false);
    setFold(o.id, +e.target.value / 100, { frame: true });
  });
  $('#fbRange').addEventListener('change', () => { const o = target(); if (o) foldDone(o.id); });   // (released at 100 %: the camera comes back)
  $('#fbPlay').addEventListener('click', () => {
    const o = target(); if (!o) return;
    if (playing) { stopFold(o.id); setPlaying(false); return; }
    setPlaying(true);
    playFold(o.id).then(() => setPlaying(false));
  });
}

export { initFoldBar, syncFoldBar };
