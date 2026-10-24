// Экспорт картинки и видео
import * as THREE from 'three';
import { $, slug, toast } from '../core/util.js';
import { activeObj, state } from '../core/state.js';
import { RT, camera, controls, cvs, glLost, renderer, scene, viewport } from '../scene/renderer.js';
import { fitShadowToView, flushFaces, resize, setRecording } from '../scene/camera.js';
import { saveFile } from '../core/project.js';
import { hideRings } from '../scene/move.js';
import { hideSelBox } from '../scene/sel-box.js';
import { hideSelLook } from '../scene/sel-look.js';
import { foldDone, foldOf, foldTimeline, setFold, stopFold } from '../scene/fold.js';

function paintBackground(c, w, h) {
  const s = state.scene;
  if (s.bg === 'solid') { c.fillStyle = s.bg1; c.fillRect(0, 0, w, h); }
  else if (s.bg === 'gradient') {
    const g = c.createRadialGradient(w / 2, h * .32, 0, w / 2, h * .32, Math.max(w, h) * .78);
    g.addColorStop(0, s.bg1); g.addColorStop(1, s.bg2); c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
}
let pngScale = 2;
const LOST = 'Сцена восстанавливается после нехватки памяти видеокарты — повторите через несколько секунд';
async function exportPNG() {
  if (glLost()) { toast(LOST, 4200); return; }
  flushFaces();   // every face painted, not only those a frame has reached
  const transparent = $('#pngTransparent').checked || state.scene.bg === 'transparent';
  const w0 = viewport.clientWidth, h0 = viewport.clientHeight, k = Math.min(pngScale, 8192 / Math.max(w0, h0));
  const W = Math.round(w0 * k), H = Math.round(h0 * k);
  const pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  for (const rt of RT.values()) for (const f of Object.values(rt.faces)) { f.flash = 0; f.mat.emissive.setRGB(0, 0, 0); }
  const showRings = hideRings(), showSel = hideSelBox(), showLook = hideSelLook(); fitShadowToView(); renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); showRings(); showSel(); showLook();
  const out = document.createElement('canvas'); out.width = W; out.height = H; const c = out.getContext('2d');
  if (!transparent) paintBackground(c, W, H);
  c.drawImage(renderer.domElement, 0, 0);
  renderer.setPixelRatio(pr); resize();
  out.toBlob(b => saveFile(`${slug(activeObj()?.name)}-mockup-${W}x${H}.png`, b), 'image/png');
}
/* what the browser records with, or null (with a word to the user) */
function videoType() {
  if (glLost()) { toast(LOST, 4200); return null; }
  flushFaces();
  if (!window.MediaRecorder || !cvs.captureStream) { toast('Этот браузер не умеет записывать видео с холста'); return null; }
  const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
  if (!type) toast('Браузер не поддерживает запись видео');
  return type || null;
}
/* records the canvas while drive(ms since the start) moves the scene (true: that was the last frame); restore puts things back */
function recordVideo(type, name, drive, restore = () => {}) {
  const bgC = document.createElement('canvas'); bgC.width = 1024; bgC.height = 640; paintBackground(bgC.getContext('2d'), 1024, 640);
  const bgTex = new THREE.CanvasTexture(bgC); bgTex.colorSpace = THREE.SRGBColorSpace;
  if (state.scene.bg !== 'transparent') scene.background = bgTex;
  const stream = cvs.captureStream(30), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 }), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const t0 = performance.now();
  controls.enabled = false; $('#recBadge').hidden = false;
  setRecording({ step(now) { if (drive(now - t0) && rec.state === 'recording') rec.stop(); } });
  rec.onstop = () => {
    setRecording(null); controls.enabled = true; scene.background = null; bgTex.dispose(); $('#recBadge').hidden = true; restore();
    saveFile(`${slug(activeObj()?.name)}-${name}.${type.includes('mp4') ? 'mp4' : 'webm'}`, new Blob(chunks, { type: type.split(';')[0] }));
  };
  rec.start();
}
function exportVideo() {
  const type = videoType(); if (!type) return;
  const target = controls.target.clone(), off = camera.position.clone().sub(target);
  const radius = Math.hypot(off.x, off.z), y = off.y, a0 = Math.atan2(off.x, off.z), dur = 6000;
  recordVideo(type, '360', ms => {
    const t = Math.min(1, ms / dur), a = a0 + t * Math.PI * 2;
    camera.position.set(target.x + Math.sin(a) * radius, target.y + y, target.z + Math.cos(a) * radius); camera.lookAt(target);
    return t >= 1;
  });
}
/* the blank folds into the box: a still flat blank, the fold (its time is the plan's), the box held, and with `back` it
   unfolds again. The camera is brought to the blank first and goes back after */
function exportFoldVideo(back = false) {
  const o = activeObj(), tl = o && foldTimeline(o.id);
  if (!tl) { toast('У этого объекта нет сборки: выберите коробку, которая складывается'); return; }
  const type = videoType(); if (!type) return;
  const was = foldOf(o.id), L = tl.total, lead = 800, hold = 1100, tail = 500, total = lead + L + hold + (back ? L + tail : 0);
  stopFold(o.id); setFold(o.id, 0, { frame: true });
  setTimeout(() => recordVideo(type, 'sborka', ms => {
    const m = ms - lead - L - hold;
    setFold(o.id, ms < lead ? 0 : ms < lead + L ? tl.at(ms - lead) : m < 0 || !back ? 1 : m < L ? tl.at(L - m) : 0);
    return ms >= total;
  }, () => { setFold(o.id, was); foldDone(o.id); }), 700);   // (after the camera has come to the blank)
}
function setPngScale(v) { pngScale = v; }

export { exportFoldVideo, exportPNG, exportVideo, setPngScale };
