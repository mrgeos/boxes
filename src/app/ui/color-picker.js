// Выбор цвета: цвета документа, последние, пипетка

const RECENT_KEY = 'box-studio-3d/recent-colors';
let recentColors = [];
try { recentColors = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 12); } catch {}
function rememberColor(c) {
  c = String(c || '').toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(c)) return;
  recentColors = [c, ...recentColors.filter(x => x !== c)].slice(0, 12);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentColors)); } catch {}
}
/* every colour used in the objects, most used first */
function documentColors() {
  const n = new Map();
  const walk = v => {
    if (typeof v === 'string') { if (/^#[0-9a-f]{6}$/i.test(v)) { const c = v.toLowerCase(); n.set(c, (n.get(c) || 0) + 1); } }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const k in v) walk(v[k]);
  };
  for (const o of state.objects) { const { id, name, ...rest } = o; walk(rest); }
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
}
let colorPop = null;
function closeColorPop() { if (!colorPop) return; colorPop.el.remove(); colorPop = null; }
function openColorPop(input) {
  closeColorPop();
  const el = document.createElement('div'); el.className = 'cpop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Выбор цвета');
  const cur = input.value.toLowerCase(), docC = documentColors().slice(0, 28), rec = recentColors.slice(0, 12);
  const sw = list => list.length ? `<div class="swatches">${list.map(c => `<button class="sw ${c === cur ? 'cur' : ''}" style="background:${c}" data-c="${c}" title="${c}" aria-label="${c}"></button>`).join('')}</div>` : '<div class="none">пока пусто</div>';
  el.innerHTML = `<h3>Цвета в документе</h3>${sw(docC)}<h3>Последние использованные</h3>${sw(rec)}
    <div class="row2">${window.EyeDropper ? '<button class="btn" data-a="eye">Пипетка</button>' : ''}<button class="btn" data-a="more">Другой цвет…</button></div>`;
  document.body.appendChild(el);
  const r = input.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
  el.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  const apply = (c, last = true) => {
    input.value = c; input.dispatchEvent(new Event('input', { bubbles: true }));
    if (last) { input.dispatchEvent(new Event('change', { bubbles: true })); rememberColor(c); }
  };
  el.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.c) { apply(b.dataset.c); closeColorPop(); }
    else if (b.dataset.a === 'more') { closeColorPop(); try { input.showPicker(); } catch { input.focus(); input.click(); } }
    else if (b.dataset.a === 'eye') { try { const { sRGBHex } = await new EyeDropper().open(); apply(sRGBHex); } catch {} closeColorPop(); }
  });
  colorPop = { el, input };
  el.querySelector('button')?.focus({ preventScroll: true });
}
document.addEventListener('click', e => {
  const t = e.target;
  if (t instanceof HTMLInputElement && t.type === 'color' && !t.disabled) {
    if (e.isTrusted === false && !t.dataset.pop) return;
    e.preventDefault(); colorPop?.input === t ? closeColorPop() : openColorPop(t); return;
  }
  if (colorPop && !colorPop.el.contains(t)) closeColorPop();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && colorPop) { const i = colorPop.input; closeColorPop(); i.focus(); } }, true);
document.addEventListener('scroll', () => closeColorPop(), true);
addEventListener('resize', closeColorPop);
// whatever the native picker finishes with is remembered too
document.addEventListener('change', e => { const t = e.target; if (t instanceof HTMLInputElement && t.type === 'color') rememberColor(t.value); }, true);
