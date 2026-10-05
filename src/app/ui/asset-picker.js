// Выбор картинки: из библиотеки или с компьютера
import { esc } from '../core/util.js';
import { assets } from '../core/state.js';
import { importImageFile } from '../core/assets.js';
import { library } from '../core/library.js';
import { pickImage } from './face-panel.js';

/* A picture for a sticker (or anything else): a small window under the button with the library's pictures and
   «С компьютера…». With an empty library it goes straight to the file chooser. cb({ id, aspect }) */
let pop = null;
function closePicker() {
  pop?.remove(); pop = null;
  removeEventListener('pointerdown', outside, true); removeEventListener('keydown', onKey, true); removeEventListener('resize', closePicker);
}
function outside(e) { if (pop && !pop.contains(e.target)) closePicker(); }
function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePicker(); } }
function pickAsset(anchor, title, cb) {
  closePicker();
  const upload = () => pickImage(async file => { const r = await importImageFile(file); cb({ id: r.id, aspect: r.aspect }); });
  if (!library.length) return upload();
  pop = document.createElement('div'); pop.className = 'ctx apick'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', title);
  pop.innerHTML = `<div class="ctx-h">${esc(title)}</div>
    <div class="lib">${library.map(it => `<button class="it" data-h="${it.hash}" title="${esc(it.name)}" aria-label="${esc(it.name)}"></button>`).join('')}</div>
    <button class="btn sm" data-a="up">С компьютера…</button>`;
  document.body.appendChild(pop);
  pop.querySelectorAll('.it').forEach(b => {
    const it = library.find(x => x.hash === b.dataset.h);
    b.style.backgroundImage = `url("${assets[it.id]}")`;
    b.onclick = () => { closePicker(); cb({ id: it.id, aspect: it.aspect }); };
  });
  pop.querySelector('[data-a="up"]').onclick = () => { closePicker(); upload(); };
  // under the button, kept on screen
  const r = anchor.getBoundingClientRect(), p = pop.getBoundingClientRect();
  pop.style.left = Math.max(4, Math.min(r.left, innerWidth - p.width - 4)) + 'px';
  pop.style.top = (r.bottom + 4 + p.height > innerHeight - 4 ? Math.max(4, r.top - p.height - 4) : r.bottom + 4) + 'px';
  pop.querySelector('.it').focus({ preventScroll: true });
  addEventListener('pointerdown', outside, true); addEventListener('keydown', onKey, true); addEventListener('resize', closePicker);
}

export { closePicker, pickAsset };
