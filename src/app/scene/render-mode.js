// Режим «Рендер»: переключатель и связь с загрузчиком студийной картинки (отдельный файл box-studio-render.js, грузится по требованию)
import * as THREE from 'three';
import { state } from '../core/state.js';
import { setRenderOn } from '../core/render-flag.js';
import { TOUCH } from '../core/model.js';
import { reapplyQuality } from './quality.js';
import { $, OVERLAY_LAYER, toast } from '../core/util.js';
import { script } from '../core/models3d.js';
import { applyObjMaterials, contactMat, controls, camera, keyLight, petLinear, renderer, scene, staleShadow, viewport } from './renderer.js';
import { invalidate } from './camera.js';
import { hideRings, ringsShown } from './move.js';
import { hideSelBox, selBoxShown } from './sel-box.js';
import { hideSelLook, selLookShown } from './sel-look.js';

/* «Рендер»: while the view stands still the picture is refined, a sample a frame (soft shadows, ambient occlusion, a
   photographic tone curve). The code is a file of its own beside the page (src/render → box-studio-render.js), loaded
   when the mode is first turned on; until it is there, and if it cannot be loaded, the plain view is drawn. The
   choice is this browser's, like the quality level. This module is only the switch and the hand-over of the editor's
   parts to that file. */
const KEY = 'bs3d-render';
/* more marks over the scene, from parts that this module must not import (the order they load in): { hide() → restore, shown() } */
const extraMarks = [];
const addMarks = (hide, shown) => { extraMarks.push({ hide, shown }); };
let on = false, studio = null, loading = false, onChange = () => {}, chip = null, chipDone = 0, chipKey = '';
try { on = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }

/* the studio when it should draw the view now, else null (off, not loaded yet) */
const active = () => (on && studio) || null;
const renderState = () => ({ on, loading, ready: !!studio });
/* a phone or a small screen: 16 samples, half-size AO, no MSAA (src/render), and the picture no sharper than 1.5 pixels per CSS pixel */
const lowProfile = () => !!window.__forceLow || TOUCH || Math.min(innerWidth, innerHeight) < 500;
const pixelCap = () => (on && lowProfile() ? 1.5 : Infinity);

async function load() {
  if (studio || loading) return;
  loading = true; onChange();
  try {
    window.__BS_THREE = THREE;
    if (!window.__bsRender) await script('box-studio-render.js');
    studio = window.__bsRender.create({
      renderer, scene, camera, key: keyLight, low: lowProfile(), viewport, contactMat, petLinear, overlayLayer: OVERLAY_LAYER,
      exposure: () => state.scene.exposure,
      staleShadow,
      // the marks over the scene: hidden while it is sampled, drawn last on top of the result
      hideOverlays: () => { const a = hideRings(), b = hideSelBox(), c = hideSelLook(), d = extraMarks.map(m => m.hide()); return () => { a(); b(); c(); d.forEach(f => f()); }; },
      overlaysShown: () => ringsShown() || selBoxShown() || selLookShown() || extraMarks.some(m => m.shown()),
    });
  } catch (e) {
    console.warn('render', e);
    on = false; try { localStorage.setItem(KEY, '0'); } catch { /* private mode */ }
    toast('Не удалось загрузить режим «Рендер»: показываю обычный вид', 4200);
  }
  loading = false; onChange(); invalidate();
}
function setRender(v) {
  on = !!v; setRenderOn(on);
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
  if (on) load(); else studio?.release();
  for (const o of state.objects) if (o.type === 'tray') applyObjMaterials(o);   // the tray's foil takes the studio's own look and reflections
  reapplyQuality(); invalidate(); onChange();
}
function initRenderMode(cb) {
  onChange = cb || onChange; setRenderOn(on);
  // the progress chip: «● 23/64», «✓» for a moment when the picture is done; not shown while the view moves
  chip = document.createElement('div'); chip.className = 'render-chip'; chip.setAttribute('aria-live', 'off'); chip.hidden = true;
  chip.innerHTML = '<i aria-hidden="true"></i><span></span><button type="button" hidden>Отменить</button>';
  chip.querySelector('button').onclick = () => { if (still) still.cancel = true; };
  $('#stage').append(chip);
  new ResizeObserver(() => chip.classList.toggle('low', $('#stage').clientWidth < 600)).observe($('#stage'));
  if (on) load();
}

/* called every frame by the render loop with the studio (or null) */
function syncRenderChip(st) {
  if (!chip) return;
  const s = st && st.status(), now = performance.now();
  let key = '';
  if (s && s.n > 0) {
    if (s.n < s.N) { key = `${s.n}/${s.N}`; chipDone = 0; }
    else { if (!chipDone) chipDone = now; if (now - chipDone < 1900) key = '✓'; }
  }
  if (key === chipKey) { if (key === '✓') chip.classList.toggle('fade', now - chipDone > 1500); return; }
  chipKey = key; chip.hidden = !key;
  if (key) { chip.classList.toggle('done', key === '✓'); chip.classList.remove('fade'); chip.querySelector('span').textContent = key; }
}

/* ---------- a still picture for the PNG export (export/image.js) ----------
   While it is drawn the loop does nothing else (the view's buffer is the picture's size), the chip shows the progress with a
   button to stop it. */
let still = null;
const stillBusy = () => !!still;
/* the studio's way to draw a still, or null when the plain export is the one to use (the mode is off or not loaded yet) */
function stillStudio() {
  if (!on || !studio) return null;
  return {
    fits(w, h) { const l = studio.limit(); return w * h <= l.px && Math.max(w, h) <= l.side; },
    limit() { return studio.limit(); },
    /* true: the picture is on the canvas now; 'cancel'; false: the graphics card was taken away */
    async render(w, h, transparent) {
      still = { cancel: false };
      const span = chip.querySelector('span'), btn = chip.querySelector('button'), was = controls.enabled;
      chip.className = 'render-chip export' + (chip.classList.contains('low') ? ' low' : ''); chip.hidden = false; btn.hidden = false; chipKey = ''; controls.enabled = false;
      span.textContent = 'Рендер 0/' + studio.status().N;
      try {
        const ok = await studio.still(w, h, transparent, (n, N) => { span.textContent = `Рендер ${n}/${N}`; }, () => still.cancel);
        return ok ? true : still.cancel ? 'cancel' : false;
      } finally { still = null; controls.enabled = was; btn.hidden = true; chip.hidden = true; chip.classList.remove('export'); invalidate(); }
    },
  };
}

export { active, addMarks, initRenderMode, lowProfile, pixelCap, renderState, setRender, stillBusy, stillStudio, syncRenderChip };
