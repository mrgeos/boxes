// Окружение сцены: что отражается в фольге, лаке и глянце (студии, нарисованные кодом, или свой HDR)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { DEG } from '../core/util.js';
import { assets, state } from '../core/state.js';
import { pmrem, scene } from './renderer.js';
import { invalidate } from './camera.js';

/* Metal and gloss show what is round them, not their own colour: a foil in an even grey room looks a dull grey from
   most angles. A studio has bright softboxes on a dark room, so a foil or a varnish catches light at one angle and
   goes dark at the next, as it does in a photo. The studios are drawn here as small 3D rooms (no files, they work
   offline); they light matte board about as the old room did, so only the reflections change. A HDR picture of a
   place (.hdr, an equirectangular panorama) can be loaded instead; it is kept with the project as a picture. The
   reflections can be turned round the model (envRot, degrees) or turn slowly by themselves (envSpin). */
const ENVS = { softbox: 'Студия с софтбоксами', bright: 'Светлая студия', contrast: 'Контраст', warm: 'Тёплый интерьер', room: 'Комната (как раньше)', hdr: 'Свой HDR' };
/* a softbox's glow: bright in the middle, falling off softly to its edges */
let softTex = null;
function soft() {
  if (softTex) return softTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), d = x.createImageData(128, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
    const u = Math.abs(i / 63.5 - 1), v = Math.abs(j / 63.5 - 1), e = Math.max(u, v), k = Math.pow(1 - Math.min(1, Math.max(0, (e - .55) / .45)), 1.6) * (1 - .25 * Math.hypot(u, v) / 1.42);
    d.data.set([255 * k, 255 * k, 255 * k, 255], (j * 128 + i) * 4);
  }
  x.putImageData(d, 0, 0); softTex = new THREE.CanvasTexture(c); softTex.colorSpace = THREE.SRGBColorSpace;
  return softTex;
}
/* the room round the model: a sphere, light at the top, `mid` at the horizon, dark under the floor */
function sky(top, mid, low) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(.42, mid); g.addColorStop(.55, mid); g.addColorStop(.62, low); g.addColorStop(1, low);
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide }));
}
/* a studio: its room and softboxes facing the model: [azimuth°, elevation°, width, height, colour, strength] */
function studio(room, boxes, gain = 1) {
  const s = new THREE.Scene(), w = sky(...room); w.material.color.setScalar(gain); s.add(w);
  for (const [az, el, w, h, c, k] of boxes) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: soft(), color: new THREE.Color(c).multiplyScalar(k * gain), side: THREE.DoubleSide }));
    const A = az * DEG, E = el * DEG, r = 14;
    m.position.set(Math.sin(A) * Math.cos(E) * r, Math.sin(E) * r, Math.cos(A) * Math.cos(E) * r); m.lookAt(0, 0, 0); s.add(m);
  }
  return s;
}
const SCENES = {
  // a big softbox right above, a tall strip to the left, a square one to the right, a low fill in front, a rim behind
  softbox: () => studio(['#b3afa8', '#5a5651', '#1c1a18'], [
    [0, 90, 26, 20, '#ffffff', 4.2], [-75, 15, 6, 18, '#ffffff', 6], [70, 20, 12, 12, '#fff3e6', 3.5], [0, 10, 18, 6, '#ffffff', 2.2], [180, 32, 24, 7, '#ffffff', 3]], 1.6),
  // light all round: soft, even reflections
  bright: () => studio(['#efede9', '#c3c0ba', '#7d7a74'], [
    [0, 90, 30, 30, '#ffffff', 2.6], [-60, 15, 14, 12, '#ffffff', 2], [60, 15, 14, 12, '#ffffff', 1.8], [180, 25, 22, 10, '#ffffff', 1.6]], 1.15),
  // dark with narrow strips: hard, graphic highlights
  contrast: () => studio(['#333333', '#0d0d0d', '#050505'], [
    [-70, 20, 2.5, 20, '#ffffff', 14], [80, 20, 2, 18, '#ffffff', 10], [0, 90, 6, 28, '#ffffff', 7], [180, 35, 26, 2, '#ffffff', 9]], 2),
  // warm walls, a cool window, a lamp
  warm: () => studio(['#c4a280', '#755844', '#2e2118'], [
    [-80, 12, 14, 12, '#e4eeff', 4], [55, 35, 4, 4, '#ffc27a', 16], [0, 90, 20, 20, '#ffe6c8', 2.6], [180, 30, 16, 6, '#ffd9b0', 2]], 1.8),
  room: () => new RoomEnvironment(),
};
const made = new Map();   // name → its prefiltered texture
let hdrKey = '', hdrTex = null;
/* the texture of environment `name` (a studio is made once) */
function envTexture(name) {
  if (name === 'hdr') return hdrTex;
  if (!made.has(name)) { const s = SCENES[name] || SCENES.softbox; made.set(name, pmrem.fromScene(s(), .04).texture); }
  return made.get(name);
}
/* reads a HDR picture (an asset of the project, a data: URL) into a prefiltered texture; null if it is not one */
function hdrFrom(url) {
  try {
    const i = url.indexOf(','), bin = atob(url.slice(i + 1)), bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    const L = new RGBELoader(), d = L.parse(bytes.buffer); if (!d) return null;
    const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
    t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.LinearSRGBColorSpace;
    t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = true; t.needsUpdate = true;
    const env = pmrem.fromEquirectangular(t).texture; t.dispose();
    return env;
  } catch (e) { console.warn('hdr', e); return null; }
}
/* puts the scene's environment on: the chosen one, its turn and how strong it is */
function applyEnv() {
  const s = state.scene;
  if (!ENVS[s.envMap]) s.envMap = 'softbox';   // projects from before the studios: a studio too
  const name = s.envMap;
  if (name === 'hdr' && s.envHdr !== hdrKey) { hdrTex?.dispose(); hdrKey = s.envHdr || ''; hdrTex = assets[s.envHdr] ? hdrFrom(assets[s.envHdr]) : null; }
  scene.environment = envTexture(name) || envTexture('softbox');
  scene.environmentRotation.set(0, (s.envRot || 0) * DEG, 0);
  invalidate();
}
/* the reflections turning by themselves: called each frame; true when they moved */
let spinT = null;
function spinEnv(now) {
  if (!state.scene.envSpin) { spinT = null; return false; }
  if (spinT == null) spinT = now;
  scene.environmentRotation.y = ((state.scene.envRot || 0) + (now - spinT) / 1000 * 18) * DEG;   // 18° a second
  return true;
}
/* a HDR file chosen by the viewer: kept as a picture of the project and put on */
async function setHdrFile(file, addAsset) {
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const tex = hdrFrom(url); if (!tex) return false;
  hdrTex?.dispose(); hdrTex = tex; hdrKey = state.scene.envHdr = addAsset(url);
  state.scene.envMap = 'hdr'; applyEnv();
  return true;
}

export { ENVS, applyEnv, setHdrFile, spinEnv };
