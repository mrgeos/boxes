// Плашка «Изоляция: имя ✕» вверху сцены и действие «Изолировать» для кнопок, меню и клавиши
import { $, toast } from '../core/util.js';
import { ICON } from '../core/constants.js';
import { exitIsolation, isolated, isolationLabel, toggleIsolation } from '../scene/isolation.js';
import { renderObjects } from './object-list.js';

let key = '', plate = null;
/* isolates the items (the picked ones by default), or leaves the isolation when it is on; the keys, the buttons and the
   menus all come here. Isolation itself is scene/isolation.js: this adds the word to the user when it cannot be done */
function isolateAction(ids) {
  if (!toggleIsolation(ids)) toast('Объект скрыт глазком в списке: покажите его, чтобы изолировать');
}
/* called after each frame: the plate, the stage's class and the list follow the isolation */
function syncIsolationPlate() {
  if (!plate) return;
  const k = isolated() ? isolationLabel() : '';
  if (k === key && !!k === isolated()) return;
  key = k; const on = isolated();
  plate.hidden = !on; $('#stage').classList.toggle('iso', on);
  if (on) plate.querySelector('.iso-name').textContent = k;
  renderObjects();
}
function initIsolationPlate() {
  plate = document.createElement('div'); plate.className = 'iso-plate'; plate.hidden = true; plate.setAttribute('role', 'status');
  plate.innerHTML = `${ICON.isolate}<span class="iso-t">Изоляция: <b class="iso-name"></b></span><button type="button" title="Выйти из изоляции (Esc или /)" aria-label="Выйти из изоляции">✕</button>`;
  plate.querySelector('button').onclick = () => exitIsolation();
  $('#stage').append(plate);
  new ResizeObserver(() => { const low = $('#stage').clientWidth < 600; plate.classList.toggle('low', low); $('#stage').classList.toggle('iso-low', low); }).observe($('#stage'));
}

export { initIsolationPlate, isolateAction, syncIsolationPlate };
