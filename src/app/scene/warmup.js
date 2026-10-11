// Прогрев шейдеров: программы отрисовки готовятся заранее и в фоне, а не посреди кадра
import { camera, cvs, renderer, scene } from './renderer.js';

/* A material drawn for the first time needs its shader program built, and the frame that draws it waits for that:
   with a big project, a second or more of a frozen page. Like a game warming its shaders behind a loading screen,
   after the scene changed (objects built, faces painted, reflections changed) every program it will need is
   started at once. Where the browser builds them in the background (KHR_parallel_shader_compile: Chrome on Android
   and desktops) the last frame stays on screen until they are ready, instead of the page stopping, with a note if
   that takes a while; the wait is capped. Browsers without it build them at the next frame, as before. */
const MAX_WAIT_MS = 5000, NOTE_MS = 400;
let wanted = true, pending = null, since = 0, note = null;
/* the scene has (or may have) materials not drawn before */
function warmShaders() { wanted = true; }
function showNote(on) {
  if (!note) {
    note = document.createElement('div'); note.className = 'warm-note'; note.setAttribute('role', 'status'); note.hidden = true;
    note.innerHTML = '<i class="spin" aria-hidden="true"></i>Готовлю 3D…';
    (cvs.closest('#stage') || cvs.parentElement).append(note);
  }
  if (note.hidden === on) note.hidden = !on;
}
/* asked before a frame is drawn: false while programs it needs are still being built (the frame waits) */
function shadersReady(now) {
  if (wanted) {
    wanted = false;
    if (renderer.extensions.has('KHR_parallel_shader_compile')) { pending = [...renderer.compile(scene, camera)]; since = now; }
  }
  if (!pending) return true;
  pending = pending.filter(m => { const p = renderer.properties.get(m).currentProgram; return p && !p.isReady(); });
  if (!pending.length || now - since > MAX_WAIT_MS) { pending = null; showNote(false); return true; }
  if (now - since > NOTE_MS) showNote(true);
  return false;
}

export { shadersReady, warmShaders };
