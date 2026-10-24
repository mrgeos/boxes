// Качество 3D на этом устройстве: уровни, как в играх, выбор «Авто» и упрощение картинки, пока движется камера
import { toast } from '../core/util.js';
import { TOUCH } from '../core/model.js';
import * as THREE from 'three';
import { keyLight, renderer, scene } from './renderer.js';
import { warmShaders } from './warmup.js';
import { fitShadowBias, invalidate, resize } from './camera.js';
import { pixelCap } from './render-mode.js';

/* Like a game's quality presets. A level sets how sharp the picture is at rest (pixels per CSS pixel), how far that
   drops while the camera moves (dynamic resolution: a moving picture looks as sharp with far fewer pixels, and the
   frame after the move is drawn in full), and the key light's shadow map. The viewer picks a level in the file menu
   or leaves «Авто»: a first guess from the device, lowered a step when turning the camera runs under ~18 frames a
   second. The shadow: «Плавно» three's quick filter on a small map; the others a soft edge without steps
   (scene/soft-shadows.js) on a larger map, the largest on «Чётко». The choice is this browser's, not the project's. */
const LEVELS = {
  low: { name: 'Плавно', pr: 1.25, motion: .5, shadow: 1024, soft: false },
  mid: { name: 'Баланс', pr: 2, motion: .6, shadow: 2048, soft: true },
  high: { name: 'Чётко', pr: 2, motion: .75, shadow: 4096, soft: true },
};
const ORDER = ['low', 'mid', 'high'], KEY = 'bs3d-quality', SLOW_MS = 55, SAMPLE = 40;
let choice = 'auto', level = 'high', basePR = 1, onChange = () => {};
const slow = { n: 0, sum: 0 };

/* the level a device likely manages: a phone or tablet the middle one; a software renderer, an old mobile or
   integrated graphics chip, or little memory a step lower */
function guessLevel() {
  let i = ORDER.indexOf(TOUCH ? 'mid' : 'high');
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software|mali-[gt]?[4-7]\d\b|adreno\D*[3-5]\d\d\b|powervr|intel.*hd graphics/i.test(gpu)) i--;
  } catch { /* the name is hidden: keep the guess */ }
  if ((navigator.deviceMemory || 8) <= 2) i = 0;
  return ORDER[Math.max(0, i)];
}
function apply() {
  const L = LEVELS[level];
  basePR = Math.min(devicePixelRatio || 1, L.pr, pixelCap());   // «Рендер» on a phone: no more than 1.5
  const size = Math.min(L.shadow, renderer.capabilities.maxTextureSize);
  if (keyLight.shadow.mapSize.x !== size) { keyLight.shadow.mapSize.set(size, size); keyLight.shadow.map?.dispose(); keyLight.shadow.map = null; fitShadowBias(); }
  // the filter is part of every lit material's program: they are built again (in the background, scene/warmup.js)
  const type = L.soft ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  if (renderer.shadowMap.type !== type) { renderer.shadowMap.type = type; scene.traverse(o => { for (const m of [o.material].flat()) if (m) m.needsUpdate = true; }); warmShaders(); }
  renderer.shadowMap.needsUpdate = true;
  renderer.setPixelRatio(basePR); resize(); invalidate();
}
/* the viewer's choice: 'auto' or a level */
function setQuality(v) {
  if (v !== 'auto' && !LEVELS[v]) return;
  choice = v; try { localStorage.setItem(KEY, v); } catch { /* private mode */ }
  level = v === 'auto' ? guessLevel() : v; slow.n = slow.sum = 0;
  apply(); onChange();
}
const qualityState = () => ({ choice, level, name: LEVELS[level].name });
/* called every frame from the render loop: the pixel ratio for this frame, lower while the camera moves; true when
   it changed (then the frame is drawn) */
function frameScale(moving) {
  const pr = basePR * (moving ? LEVELS[level].motion : 1);
  if (Math.abs(renderer.getPixelRatio() - pr) < 1e-3) return false;
  renderer.setPixelRatio(pr); resize(); return true;
}
/* «Авто»: the time between frames while the camera moves; a slow run lowers the level a step */
function noteFrame(ms, moving) {
  if (choice !== 'auto' || !moving || ms > 400) return;   // a pause (the page busy with something else) says nothing
  slow.n++; slow.sum += ms;
  if (slow.n < SAMPLE) return;
  const avg = slow.sum / slow.n; slow.n = slow.sum = 0;
  if (avg <= SLOW_MS || level === 'low') return;
  level = ORDER[ORDER.indexOf(level) - 1]; apply(); onChange();
  toast(`Чтобы камера двигалась плавнее, качество 3D снижено: «${LEVELS[level].name}». Сменить — в меню ☰`, 4200);
}
/* «Авто»: a step lower now (the browser ran short of graphics memory); false when it cannot go lower */
function lowerQuality() {
  if (choice !== 'auto' || level === 'low') return false;
  level = ORDER[ORDER.indexOf(level) - 1]; apply(); onChange(); return true;
}
function initQuality(cb) {
  onChange = cb || onChange;
  let v = 'auto'; try { v = localStorage.getItem(KEY) || 'auto'; } catch { /* private mode */ }
  setQuality(v === 'auto' || LEVELS[v] ? v : 'auto');
}

/* the pixel ratio again (the «Рендер» mode was turned on or off) */
const reapplyQuality = () => apply();

export { reapplyQuality, frameScale, initQuality, lowerQuality, noteFrame, qualityState, setQuality };
