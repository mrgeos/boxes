// Экспорт картинки и видео
import * as THREE from 'three';
import { $, slug, toast } from '../core/util.js';
import { activeObj, state } from '../core/state.js';
import { RT, camera, controls, cvs, renderer, scene, viewport } from '../scene/renderer.js';
import { resize, setRecording } from '../scene/camera.js';
import { saveFile } from '../core/project.js';

function paintBackground(c, w, h) {
  const s = state.scene;
  if (s.bg === 'solid') { c.fillStyle = s.bg1; c.fillRect(0, 0, w, h); }
  else if (s.bg === 'gradient') {
    const g = c.createRadialGradient(w / 2, h * .32, 0, w / 2, h * .32, Math.max(w, h) * .78);
    g.addColorStop(0, s.bg1); g.addColorStop(1, s.bg2); c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
}
let pngScale = 2;
async function exportPNG() {
  const transparent = $('#pngTransparent').checked || state.scene.bg === 'transparent';
  const w0 = viewport.clientWidth, h0 = viewport.clientHeight, k = Math.min(pngScale, 8192 / Math.max(w0, h0));
  const W = Math.round(w0 * k), H = Math.round(h0 * k);
  const pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  for (const rt of RT.values()) for (const f of Object.values(rt.faces)) { f.flash = 0; f.mat.emissive.setRGB(0, 0, 0); }
  renderer.render(scene, camera);
  const out = document.createElement('canvas'); out.width = W; out.height = H; const c = out.getContext('2d');
  if (!transparent) paintBackground(c, W, H);
  c.drawImage(renderer.domElement, 0, 0);
  renderer.setPixelRatio(pr); resize();
  out.toBlob(b => saveFile(`${slug(activeObj()?.name)}-mockup-${W}x${H}.png`, b), 'image/png');
}
function exportVideo() {
  if (!window.MediaRecorder || !cvs.captureStream) { toast('Этот браузер не умеет записывать видео с холста'); return; }
  const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
  if (!type) { toast('Браузер не поддерживает запись видео'); return; }
  const bgC = document.createElement('canvas'); bgC.width = 1024; bgC.height = 640; paintBackground(bgC.getContext('2d'), 1024, 640);
  const bgTex = new THREE.CanvasTexture(bgC); bgTex.colorSpace = THREE.SRGBColorSpace;
  if (state.scene.bg !== 'transparent') scene.background = bgTex;
  const stream = cvs.captureStream(30), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 }), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const target = controls.target.clone(), off = camera.position.clone().sub(target);
  const radius = Math.hypot(off.x, off.z), y = off.y, a0 = Math.atan2(off.x, off.z), dur = 6000, t0 = performance.now();
  controls.enabled = false; $('#recBadge').hidden = false;
  setRecording({ step(now) {
    const t = Math.min(1, (now - t0) / dur), a = a0 + t * Math.PI * 2;
    camera.position.set(target.x + Math.sin(a) * radius, target.y + y, target.z + Math.cos(a) * radius); camera.lookAt(target);
    if (t >= 1 && rec.state === 'recording') rec.stop();
  } });
  rec.onstop = () => {
    setRecording(null); controls.enabled = true; scene.background = null; bgTex.dispose(); $('#recBadge').hidden = true;
    saveFile(`${slug(activeObj()?.name)}-360.${type.includes('mp4') ? 'mp4' : 'webm'}`, new Blob(chunks, { type: type.split(';')[0] }));
  };
  rec.start();
}
function setPngScale(v) { pngScale = v; }

export { exportPNG, exportVideo, setPngScale };
