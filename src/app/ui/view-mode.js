// Режим сцены: «2D» (одна развёртка), «2D + 3D» (развёртка слева, 3D справа) и «3D»
import { $ } from '../core/util.js';
import { activeObj } from '../core/state.js';
import { focusSelected, invalidate, resize } from '../scene/camera.js';
import { clearSideTouched, setSideAuto, sideAutoOff, sideAutoWidth, sideOpen, sideTouched } from './panels.js';
import { refreshNetStage } from '../net/net-stage.js';

/* Which of three views the stage shows. Kept in this browser (not in the project), like the panels' widths. On a
   phone «2D + 3D» does not fit: it shows 3D there (the choice is kept for a wider screen), so `effectiveMode` is what
   is on screen. In 2D the 3D view is not drawn (the render loop asks `show3D`); it stays in the layout, only
   hidden, so its size (and so a PNG of the scene) does not change. */
const KEY = 'bs3d-view', SPLIT_KEY = 'bs3d-split', MODES = ['2d', 'split', '3d'], NARROW = 700;
let mode = '3d', eff = '3d', frac = null;
const isPhone = () => matchMedia('(max-width: 860px)').matches;
const viewMode = () => mode;
const effectiveMode = () => eff;
const show3D = () => eff !== '2d';

/* the mode asked for; returns the one shown (it differs only on a phone) */
function setViewMode(m, { save = true } = {}) {
  if (!MODES.includes(m)) return eff;
  mode = m;
  if (save) { try { localStorage.setItem(KEY, m); } catch { /* private mode */ } }
  apply();
  return eff;
}
/* the net's share of the stage in split mode (0.2 – 0.8; null: half), kept in this browser */
function setSplit(f) {
  frac = f == null ? null : Math.min(.8, Math.max(.2, f));
  $('#work').style.setProperty('--net-w', frac == null ? '50%' : (frac * 100).toFixed(2) + '%');
  $('#splitGrip').setAttribute('aria-valuenow', String(Math.round((frac ?? .5) * 100)));
  try { if (frac == null) localStorage.removeItem(SPLIT_KEY); else localStorage.setItem(SPLIT_KEY, String(frac)); } catch { /* private mode */ }
}
function apply() {
  const was = eff;
  eff = mode === 'split' && isPhone() ? '3d' : mode;
  $('#app').dataset.view = eff;
  if (eff === 'split' && was !== 'split') clearSideTouched();   // only what the user does during the split counts
  for (const b of document.querySelectorAll('#modeSeg button')) { const on = b.dataset.v === eff; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
  syncSide();
  if (eff !== was) {
    invalidate(); refreshNetStage();
    // the 3D view is about half as wide now: the selected object is framed again, so it is not cut off
    if (eff === 'split' && activeObj()) { resize(); focusSelected({ frame: true }); }
  }
}
/* split in a narrow window: the left panel steps aside (for now, not kept); it comes back when the split goes or the
   window is wide enough, unless the user has opened or closed it by hand meanwhile (panels.js notes that) */
function syncSide() {
  const w = $('#work').getBoundingClientRect().width;
  if (eff !== 'split') clearSideTouched();
  if (eff === 'split' && w && w < NARROW && sideOpen() && !sideTouched()) setSideAuto(true);
  else if (sideAutoOff() && (eff !== 'split' || w >= NARROW + sideAutoWidth() + 24)) setSideAuto(false);
}
function initViewMode() {
  try { const m = localStorage.getItem(KEY); if (MODES.includes(m)) mode = m; const f = parseFloat(localStorage.getItem(SPLIT_KEY)); if (f > 0) frac = f; } catch { /* private mode */ }
  const seg = $('#modeSeg');
  seg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setViewMode(b.dataset.v); });
  seg.addEventListener('keydown', e => {
    const vis = [...seg.querySelectorAll('button')].filter(b => b.offsetParent), i = vis.findIndex(b => b.dataset.v === eff);
    const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? vis[(i + 1) % vis.length] : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? vis[(i + vis.length - 1) % vis.length] : null;
    if (to) { e.preventDefault(); setViewMode(to.dataset.v); to.focus(); }
  });
  $('#netTo3d').onclick = () => setViewMode('3d');
  matchMedia('(max-width: 860px)').addEventListener('change', apply);
  new ResizeObserver(syncSide).observe($('#work'));
  // the divider: drag, arrows (16 px, Shift: 64), a double click puts it back at the middle
  const g = $('#splitGrip'), work = $('#work');
  g.setAttribute('aria-valuemin', '20'); g.setAttribute('aria-valuemax', '80');
  g.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); g.setPointerCapture(e.pointerId); g.classList.add('drag'); document.body.classList.add('pane-drag');
    const move = ev => { const r = work.getBoundingClientRect(); setSplit((ev.clientX - r.left) / r.width); };
    const up = () => { g.removeEventListener('pointermove', move); g.classList.remove('drag'); document.body.classList.remove('pane-drag'); };
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up, { once: true }); g.addEventListener('pointercancel', up, { once: true });
  });
  g.addEventListener('dblclick', () => setSplit(null));
  g.addEventListener('keydown', e => {
    const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); setSplit(e.key === 'Home' ? .2 : .8); }
    else if (d) { e.preventDefault(); setSplit((frac ?? .5) + d * (e.shiftKey ? 64 : 16) / work.getBoundingClientRect().width); }
  });
  setSplit(frac);
  apply();
}

export { effectiveMode, initViewMode, setSplit, setViewMode, show3D, viewMode };
