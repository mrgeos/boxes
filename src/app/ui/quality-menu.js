// Выбор качества 3D в меню файла: «Авто», «Плавно», «Баланс», «Чётко» и подпись, что выбрано сейчас
import { $, $$ } from '../core/util.js';
import { initQuality, qualityState, setQuality } from '../scene/quality.js';
import { initRenderMode, renderState, setRender } from '../scene/render-mode.js';

function paintQuality() {
  const q = qualityState();
  $$('#qualitySeg button').forEach(b => { const on = b.dataset.v === q.choice; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $('#qualityNote').textContent = q.choice === 'auto' ? `Сейчас «${q.name}» — подобрано под это устройство` : 'Выбрано для этого браузера';
}
function paintRender() {
  const r = renderState();
  $('#renderOn').checked = r.on;
  $('#renderNote').textContent = r.on ? (r.loading ? 'Загружаю…' : 'Кадр дочищается, пока стоит на месте') : '';
}
function initQualityMenu() {
  $('#renderOn').onchange = e => setRender(e.target.checked);
  initRenderMode(paintRender); paintRender();
  $$('#qualitySeg button').forEach(b => { b.onclick = () => setQuality(b.dataset.v); });
  initQuality(paintQuality);
}

export { initQualityMenu };
