// Боковые панели, как в Figma: левую можно скрыть (рейка разделов остаётся), обе сужаются и расширяются за край
import { $ } from '../core/util.js';

/* The viewer's layout, kept in this browser (not in the project): whether the left panel is shown and the widths
   the panels were dragged to (null: the width the window's size gives). A click on a section of the rail shows the
   panel again. The 3D view takes what is left; it stays at least STAGE_MIN wide. */
const KEY = 'bs3d-panels', STAGE_MIN = 360;
const LIMITS = { side: [200, 520], prop: [260, 600] };
const lay = { sideOff: false, side: null, prop: null };
const app = () => $('#app');
function save() { try { localStorage.setItem(KEY, JSON.stringify(lay)); } catch { /* private mode */ } }
function apply() {
  const a = app();
  a.classList.toggle('side-off', lay.sideOff);
  for (const k of ['side', 'prop']) { if (lay[k]) a.style.setProperty(`--${k}-w`, lay[k] + 'px'); else a.style.removeProperty(`--${k}-w`); }
  // a narrower window: the dragged widths give way to the 3D view, for now (they come back when it is wide again)
  let over = matchMedia('(min-width: 861px)').matches ? STAGE_MIN - $('#stage').getBoundingClientRect().width : 0;
  for (const k of ['prop', 'side']) {
    if (over <= 0 || !lay[k] || (k === 'side' && lay.sideOff)) continue;
    const w = width(k), to = Math.max(LIMITS[k][0], w - over); a.style.setProperty(`--${k}-w`, to + 'px'); over -= w - to;
  }
  const b = $('#sideToggle');
  b.setAttribute('aria-pressed', String(!lay.sideOff));
  b.title = lay.sideOff ? 'Показать левую панель' : 'Скрыть левую панель';
  for (const k of ['side', 'prop']) $(`#${k}Grip`).setAttribute('aria-valuenow', String(Math.round(width(k))));
}
const width = k => $(k === 'side' ? '#sidePanel' : '#propPanel').getBoundingClientRect().width;
/* shows or hides the left panel */
function setSideOpen(open) { if (lay.sideOff === !open) return; lay.sideOff = !open; apply(); save(); }
const sideOpen = () => !lay.sideOff;
/* a panel's width in px (null: back to the default), kept within its limits and the room the 3D view needs */
function setPanelWidth(k, px) {
  if (px == null) lay[k] = null;
  else {
    const other = k === 'side' ? width('prop') : (lay.sideOff ? 0 : width('side')), rail = $('#rail').getBoundingClientRect().width;
    const room = innerWidth - rail - other - STAGE_MIN, [lo, hi] = LIMITS[k];
    lay[k] = Math.round(Math.max(lo, Math.min(hi, room, px)));
  }
  apply(); save();
}
function initPanels() {
  try { Object.assign(lay, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* none kept */ }
  $('#sideToggle').onclick = () => setSideOpen(lay.sideOff);
  for (const k of ['side', 'prop']) {
    const g = $(`#${k}Grip`), dir = k === 'side' ? 1 : -1;
    const [lo, hi] = LIMITS[k]; g.setAttribute('aria-valuemin', lo); g.setAttribute('aria-valuemax', hi);
    g.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); g.setPointerCapture(e.pointerId); g.classList.add('drag'); document.body.classList.add('pane-drag');
      const x0 = e.clientX, w0 = width(k);
      const move = ev => setPanelWidth(k, w0 + dir * (ev.clientX - x0));
      const up = () => { g.removeEventListener('pointermove', move); g.classList.remove('drag'); document.body.classList.remove('pane-drag'); };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up, { once: true }); g.addEventListener('pointercancel', up, { once: true });
    });
    g.addEventListener('dblclick', () => setPanelWidth(k, null));
    // the keyboard: arrows by 16 px (Shift: 64), Home / End to the limits
    g.addEventListener('keydown', e => {
      const step = e.shiftKey ? 64 : 16, w = width(k);
      const to = e.key === 'ArrowLeft' ? w - dir * step : e.key === 'ArrowRight' ? w + dir * step : e.key === 'Home' ? lo : e.key === 'End' ? hi : null;
      if (to == null) return; e.preventDefault(); setPanelWidth(k, to);
    });
  }
  addEventListener('resize', apply);
  apply();
}

export { initPanels, setPanelWidth, setSideOpen, sideOpen };
