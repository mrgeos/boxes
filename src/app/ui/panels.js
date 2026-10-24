// Боковые панели, как в Figma: левую можно скрыть (рейка разделов остаётся), обе сужаются и расширяются за край
import { $ } from '../core/util.js';
import { effectiveMode } from './view-mode.js';

/* The viewer's layout, kept in this browser (not in the project): whether the left panel is shown and the widths
   the panels were dragged to (null: the width the window's size gives). A click on a section of the rail shows the
   panel again. The 3D view takes what is left; it stays wide enough (stageMin). */
const KEY = 'bs3d-panels';
/* the room the stage keeps: the 3D view, or in «2D + 3D» both halves */
const stageMin = () => effectiveMode() === 'split' ? 480 : 360;
const LIMITS = { side: [200, 520], prop: [260, 600] };
const lay = { sideOff: false, side: null, prop: null };
/* the left panel put aside by the split view (not the user's choice: not kept), and the width it had */
let sideAuto = false, autoW = 0, touched = false;
const app = () => $('#app');
function save() { try { localStorage.setItem(KEY, JSON.stringify(lay)); } catch { /* private mode */ } }
const sideHidden = () => lay.sideOff || sideAuto;
function apply() {
  const a = app();
  a.classList.toggle('side-off', sideHidden());
  for (const k of ['side', 'prop']) { if (lay[k]) a.style.setProperty(`--${k}-w`, lay[k] + 'px'); else a.style.removeProperty(`--${k}-w`); }
  // a narrower window: the dragged widths give way to the 3D view, for now (they come back when it is wide again)
  let over = matchMedia('(min-width: 861px)').matches ? stageMin() - $('#work').getBoundingClientRect().width : 0;
  for (const k of ['prop', 'side']) {
    if (over <= 0 || !lay[k] || (k === 'side' && sideHidden())) continue;
    const w = width(k), to = Math.max(LIMITS[k][0], w - over); a.style.setProperty(`--${k}-w`, to + 'px'); over -= w - to;
  }
  const b = $('#sideToggle');
  b.setAttribute('aria-pressed', String(!sideHidden()));
  b.title = sideHidden() ? 'Показать левую панель' : 'Скрыть левую панель';
  for (const k of ['side', 'prop']) $(`#${k}Grip`).setAttribute('aria-valuenow', String(Math.round(width(k))));
}
const width = k => $(k === 'side' ? '#sidePanel' : '#propPanel').getBoundingClientRect().width;
/* shows or hides the left panel (the user's choice: it also ends a stepping aside of the split view) */
function setSideOpen(open) {
  const was = sideAuto; sideAuto = false; touched = true;
  if (lay.sideOff === !open) { if (was) apply(); return; }
  lay.sideOff = !open; apply(); save();
}
const sideOpen = () => !sideHidden();
/* the split view puts the left panel aside, or brings it back */
function setSideAuto(on) { if (on === sideAuto) return; if (on) autoW = width('side'); sideAuto = on; apply(); }
const sideAutoOff = () => sideAuto, sideAutoWidth = () => autoW;
/* has the user shown or hidden the panel since the split view began? (then it is left as they set it) */
const sideTouched = () => touched, clearSideTouched = () => { touched = false; };
/* a panel's width in px (null: back to the default), kept within its limits and the room the 3D view needs */
function setPanelWidth(k, px) {
  if (px == null) lay[k] = null;
  else {
    const other = k === 'side' ? width('prop') : (sideHidden() ? 0 : width('side')), rail = $('#rail').getBoundingClientRect().width;
    const room = innerWidth - rail - other - stageMin(), [lo, hi] = LIMITS[k];
    lay[k] = Math.round(Math.max(lo, Math.min(hi, room, px)));
  }
  apply(); save();
}
function initPanels() {
  try { Object.assign(lay, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* none kept */ }
  $('#sideToggle').onclick = () => setSideOpen(sideHidden());
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

export { initPanels, setPanelWidth, clearSideTouched, setSideAuto, setSideOpen, sideAutoOff, sideAutoWidth, sideOpen, sideTouched };
