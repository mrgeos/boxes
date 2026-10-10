// Подсказка над сценой: одна строка о том, что можно сделать с выбранным, и окно «?» с управлением и клавишами
import { $ } from '../core/util.js';
import { activeLayer, activeObj, sel } from '../core/state.js';
import { activeSticker } from '../stickers/placement.js';

const KEY = 'box-studio-3d/hint';
let off = false, shown = '';
/* the hint for what is picked now */
function hintNow() {
  if (!activeObj()) return 'Выберите объект: кликом по модели или в списке слева';
  if (activeLayer()) return 'Тащите слой прямо по модели, стрелки сдвигают его. Esc — снять выбор';
  if (activeSticker()) return 'Тащите наклейку прямо по модели, стрелки сдвигают её. Esc — к объекту';
  if (sel.part || sel.ribbon) return 'Доп настраивается справа, как отдельный объект. Esc — к объекту';
  return 'Клик по грани — её дизайн справа. Двойной клик или F — приблизить';
}
/* called after each drawn frame: the text follows the selection */
function syncStageHint() {
  if (off) return;
  const t = hintNow(); if (t === shown) return;
  shown = t; $('#hintText').textContent = t;
}
function toggleHelp(open = $('#helpPop').hidden) {
  $('#helpPop').hidden = !open; $('#helpBtn').setAttribute('aria-expanded', String(open));
}
function initStageHint() {
  try { off = !!localStorage.getItem(KEY); } catch {}
  $('#stageHint').hidden = off;
  $('#hideHint').onclick = () => { off = true; $('#stageHint').hidden = true; try { localStorage.setItem(KEY, '1'); } catch {} };
  $('#helpBtn').onclick = () => toggleHelp();
  addEventListener('pointerdown', e => { if (!$('#helpPop').hidden && !e.target.closest('#helpPop,#helpBtn')) toggleHelp(false); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#helpPop').hidden) toggleHelp(false); });
}

export { initStageHint, syncStageHint };
