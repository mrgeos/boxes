// Контекстное меню: пункты, подменю, клавиши, управление с клавиатуры
import { esc } from '../core/util.js';

/* An item is { label, key, run, disabled, checked, sub: [items] } or 'sep'. The menu opens at a point, stays
   inside the window, closes on a pick, Esc, a click elsewhere, scrolling or resizing. Arrows move, → and ←
   open and close submenus, Enter picks. */
let root = null;
const stack = [];   // open menus: the main one and its open submenus

function closeMenu() {
  for (const m of stack.splice(0)) m.el.remove();
  root = null;
  removeEventListener('pointerdown', outside, true); removeEventListener('keydown', onKey, true);
  removeEventListener('resize', closeMenu); removeEventListener('scroll', closeMenu, true); removeEventListener('blur', closeMenu);
}
function outside(e) { if (!stack.some(m => m.el.contains(e.target))) closeMenu(); }

function build(items, x, y, depth) {
  const el = document.createElement('div');
  el.className = 'ctx'; el.setAttribute('role', 'menu');
  el.innerHTML = items.map((it, i) => it === 'sep' ? '<div class="ctx-sep" role="separator"></div>'
    : `<button class="ctx-it" role="menuitem" data-i="${i}" ${it.disabled ? 'disabled aria-disabled="true"' : ''} ${it.sub ? 'aria-haspopup="menu"' : ''}>
        <span class="ctx-ck">${it.checked ? '✓' : ''}</span><span class="ctx-l">${esc(it.label)}</span><span class="ctx-k">${it.sub ? '›' : esc(it.key || '')}</span></button>`).join('');
  document.body.appendChild(el);
  const m = { el, items, depth, active: -1 };
  // keep it on screen: a submenu that would run off the right side opens to the left of its parent
  const r = el.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  let left = x, top = y;
  if (left + r.width > W - 4) left = depth ? x - r.width - (stack[depth - 1]?.el.getBoundingClientRect().width || 0) + 4 : W - r.width - 4;
  if (top + r.height > H - 4) top = Math.max(4, H - r.height - 4);
  el.style.left = Math.max(4, left) + 'px'; el.style.top = top + 'px';
  el.querySelectorAll('.ctx-it').forEach(b => {
    const i = +b.dataset.i;
    b.onpointerenter = () => focusItem(m, i, true);
    b.onclick = () => pick(m, i);
  });
  stack.splice(depth); stack.push(m);
  return m;
}
const buttons = m => [...m.el.querySelectorAll('.ctx-it')];
function focusItem(m, i, byPointer = false) {
  stack.splice(m.depth + 1).forEach(s => s.el.remove());
  m.active = i;
  const b = m.el.querySelector(`.ctx-it[data-i="${i}"]`); if (!b) return;
  buttons(m).forEach(x => x.classList.toggle('on', x === b)); b.focus({ preventScroll: true });
  if (byPointer && m.items[i].sub && !m.items[i].disabled) openSub(m, i, false);
}
function openSub(m, i, focusFirst = true) {
  const b = m.el.querySelector(`.ctx-it[data-i="${i}"]`), r = b.getBoundingClientRect();
  const s = build(m.items[i].sub, r.right - 4, r.top - 4, m.depth + 1);
  b.setAttribute('aria-expanded', 'true');
  if (focusFirst) step(s, 1);
}
function pick(m, i) {
  const it = m.items[i]; if (!it || it === 'sep' || it.disabled) return;
  if (it.sub) return openSub(m, i);
  closeMenu(); it.run?.();
}
/* moves to the next enabled item (1) or the previous one (-1) */
function step(m, d) {
  const ids = buttons(m).filter(b => !b.disabled).map(b => +b.dataset.i); if (!ids.length) return;
  const at = ids.indexOf(m.active);
  focusItem(m, ids[at < 0 ? (d > 0 ? 0 : ids.length - 1) : (at + d + ids.length) % ids.length]);
}
function onKey(e) {
  const m = stack.at(-1); if (!m) return;
  const keys = { ArrowDown: () => step(m, 1), ArrowUp: () => step(m, -1), Escape: () => (stack.length > 1 ? closeSub() : closeMenu()),
    ArrowRight: () => { const it = m.items[m.active]; if (it?.sub && !it.disabled) openSub(m, m.active); },
    ArrowLeft: () => { if (stack.length > 1) closeSub(); }, Enter: () => pick(m, m.active), ' ': () => pick(m, m.active), Tab: () => closeMenu() };
  if (!keys[e.key]) return;
  e.preventDefault(); e.stopPropagation(); keys[e.key]();
}
function closeSub() { const s = stack.pop(); s.el.remove(); const p = stack.at(-1); p.el.querySelector(`.ctx-it[data-i="${p.active}"]`)?.focus({ preventScroll: true }); }

/* opens a menu at a point of the window; `title` is a small heading on top (what the menu is about) */
function openMenu(x, y, items, title = '') {
  closeMenu();
  items = items.filter(Boolean).filter((it, i, a) => it !== 'sep' || (i > 0 && a[i - 1] !== 'sep' && i < a.length - 1));   // no stray separators
  if (!items.length) return;
  root = build(items, x, y, 0);
  if (title) root.el.insertAdjacentHTML('afterbegin', `<div class="ctx-h">${esc(title)}</div>`);
  addEventListener('pointerdown', outside, true); addEventListener('keydown', onKey, true);
  addEventListener('resize', closeMenu); addEventListener('scroll', closeMenu, true); addEventListener('blur', closeMenu);
  root.el.focus?.();
  return root.el;
}
const menuOpen = () => !!root;

export { closeMenu, menuOpen, openMenu };
