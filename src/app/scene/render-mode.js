// Режим «Рендер»: переключатель и связь с загрузчиком студийной картинки (отдельный файл box-studio-render.js, грузится по требованию)
import * as THREE from 'three';
import { state } from '../core/state.js';
import { OVERLAY_LAYER, toast } from '../core/util.js';
import { script } from '../core/models3d.js';
import { contactMat, camera, keyLight, petLinear, renderer, scene, staleShadow, viewport } from './renderer.js';
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
let on = false, studio = null, loading = false, onChange = () => {};
try { on = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }

/* the studio when it should draw the view now, else null (off, not loaded yet) */
const active = () => (on && studio) || null;
const renderState = () => ({ on, loading, ready: !!studio });

async function load() {
  if (studio || loading) return;
  loading = true; onChange();
  try {
    window.__BS_THREE = THREE;
    if (!window.__bsRender) await script('box-studio-render.js');
    studio = window.__bsRender.create({
      renderer, scene, camera, key: keyLight, viewport, contactMat, petLinear, overlayLayer: OVERLAY_LAYER,
      exposure: () => state.scene.exposure,
      staleShadow,
      // the marks over the scene: hidden while it is sampled, drawn last on top of the result
      hideOverlays: () => { const a = hideRings(), b = hideSelBox(), c = hideSelLook(); return () => { a(); b(); c(); }; },
      overlaysShown: () => ringsShown() || selBoxShown() || selLookShown(),
    });
  } catch (e) {
    console.warn('render', e);
    on = false; try { localStorage.setItem(KEY, '0'); } catch { /* private mode */ }
    toast('Не удалось загрузить режим «Рендер»: показываю обычный вид', 4200);
  }
  loading = false; onChange(); invalidate();
}
function setRender(v) {
  on = !!v;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
  if (on) load(); else studio?.release();
  invalidate(); onChange();
}
function initRenderMode(cb) {
  onChange = cb || onChange;
  if (on) load();
}

export { active, initRenderMode, renderState, setRender };
