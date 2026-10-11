// Выбор качества 3D в меню файла: «Авто», «Плавно», «Баланс», «Чётко» и подпись, что выбрано сейчас
import { $, $$ } from '../core/util.js';
import { initQuality, qualityState, setQuality } from '../scene/quality.js';

function paintQuality() {
  const q = qualityState();
  $$('#qualitySeg button').forEach(b => { const on = b.dataset.v === q.choice; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $('#qualityNote').textContent = q.choice === 'auto' ? `Сейчас «${q.name}» — подобрано под это устройство` : 'Выбрано для этого браузера';
}
function initQualityMenu() {
  $$('#qualitySeg button').forEach(b => { b.onclick = () => setQuality(b.dataset.v); });
  initQuality(paintQuality);
}

export { initQualityMenu };
