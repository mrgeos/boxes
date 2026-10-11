// Браузер на время отобрал у страницы видеокарту (потеря контекста WebGL): заглушка поверх сцены и восстановление
// без перезагрузки
import { state } from '../core/state.js';
import { squeezeTextures } from '../core/model.js';
import { flushSave } from '../core/project.js';
import { cloudOn, saveNow } from '../core/cloud.js';
import { cvs, markObj, rebuildQueue, renderer } from './renderer.js';
import { applyEnv, resetEnvs } from './environments.js';
import { invalidate } from './camera.js';
import { lowerQuality } from './quality.js';

/* A phone's browser (and sometimes a desktop one) takes the graphics card from a page that holds too much of it, or
   when the system needs it: the 3D view goes blank. Like a game on a lost device, the page waits for it to come
   back, says what is happening meanwhile, and then rebuilds what lived only on the card: three.js uploads the
   geometry and pictures again from the page's memory, but the reflections are made on the card, and the faces'
   canvases may have been cleared too, so every object is built and painted anew. Since memory ran short, «Авто»
   takes a lower level and the faces a smaller budget. If the card does not come back, a button restarts the
   editor where it was (the project is saved first). */
const STUCK_MS = 8000;
let overlay = null, stuckTimer = 0;
function show(stuck) {
  overlay.hidden = false; overlay.classList.toggle('stuck', stuck);
  // the project saved before the restart is offered: in this browser or the account, else a file first
  const kept = stuck && (flushSave() || cloudOn());
  overlay.querySelector('b').textContent = stuck ? '3D не вернулся сам' : 'Восстанавливаю 3D…';
  overlay.querySelector('p').textContent = !stuck ? 'Браузеру не хватило памяти видеокарты, и он на время отключил сцену. Проект не пострадал.'
    : kept ? 'Проект сохранён. Перезапустите редактор — он откроется на том же месте.'
    : 'Проект слишком большой для автосохранения: сначала сохраните его в файл (меню ☰), затем перезапустите редактор.';
}
/* everything that lived only on the graphics card, made again */
function recover() {
  lowerQuality(); squeezeTextures();
  resetEnvs(); applyEnv();
  renderer.shadowMap.needsUpdate = true;
  for (const o of state.objects) { rebuildQueue.add(o.id); markObj(o); }
  invalidate();
}
async function restart() {
  overlay.querySelector('button').disabled = true;
  flushSave();
  if (cloudOn()) { try { await saveNow(); } catch { /* the local copy is there */ } }
  location.reload();
}
function initContextLoss() {
  overlay = document.createElement('div'); overlay.className = 'gl-lost'; overlay.hidden = true; overlay.setAttribute('role', 'status');
  overlay.innerHTML = '<div class="card"><i class="spin" aria-hidden="true"></i><b></b><p></p><button type="button" class="btn primary">Перезапустить редактор</button></div>';
  overlay.querySelector('button').onclick = restart;
  (cvs.closest('#stage') || cvs.parentElement).append(overlay);
  // three.js listens first (it keeps the page's claim on a new context and sets itself up again on it)
  cvs.addEventListener('webglcontextlost', () => { show(false); clearTimeout(stuckTimer); stuckTimer = setTimeout(() => show(true), STUCK_MS); });
  cvs.addEventListener('webglcontextrestored', () => { clearTimeout(stuckTimer); overlay.hidden = true; recover(); });
}

export { initContextLoss };
