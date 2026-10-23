// Стрелки < > в левом нижнем углу сцены: предыдущий и следующий объект верхнего уровня списка (Tab / Shift+Tab)
import { $ } from '../core/util.js';
import { state } from '../core/state.js';
import { stepItem } from '../core/selection.js';
import { objectsIn } from '../core/groups.js';
import { liftOverBars } from './view-cube.js';
import { isShown } from '../scene/isolation.js';

const ICON = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
let lastN = -1;
/* how many items take part: the top of the object list with something shown (a group counts once) */
const count = () => state.tree.filter(id => objectsIn(id).some(oid => { const o = state.objects.find(q => q.id === oid); return o && isShown(o); })).length;
/* called after each drawn frame: the arrows sit in the corner, raised over the bars when they reach under them,
   and are off when there is nothing to step to */
function syncItemNav() {
  const box = $('#itemNav'); if (!box) return;
  const n = count();
  if (n !== lastN) { lastN = n; box.querySelectorAll('button').forEach(b => { b.disabled = n < 2; }); }
  liftOverBars(box);
}
function initItemNav() {
  const box = document.createElement('div'); box.id = 'itemNav'; box.className = 'inav'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Переключение объектов');
  box.innerHTML = `<button type="button" id="navPrev" title="Предыдущий объект (Shift+Tab)" aria-label="Предыдущий объект">${ICON('m15 6-6 6 6 6')}</button><button type="button" id="navNext" title="Следующий объект (Tab)" aria-label="Следующий объект">${ICON('m9 6 6 6-6 6')}</button>`;
  $('#stage').append(box);
  $('#navPrev').onclick = () => stepItem(-1);
  $('#navNext').onclick = () => stepItem(1);
  // Tab and Shift+Tab step through the objects while the focus is on the scene, not in a panel or a field
  addEventListener('keydown', e => {
    if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement;
    if (a && a !== document.body && !a.closest('#stage')) return;
    if (a?.closest('input,textarea,select,[contenteditable]')) return;
    e.preventDefault(); stepItem(e.shiftKey ? -1 : 1);
  });
}

export { initItemNav, syncItemNav };
