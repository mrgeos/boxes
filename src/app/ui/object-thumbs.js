// Превью объектов в списке «Объекты в сцене»: маленький снимок самого объекта с его дизайном
import * as THREE from 'three';
import { state } from '../core/state.js';
import { RT, renderer, scene } from '../scene/renderer.js';
import { invalidate, recording } from '../scene/camera.js';
import { renderObjects } from './object-list.js';

/* A picture is taken once an object has stopped changing (the same data two checks in a row): its own 3D group
   is drawn 3/4 in a corner of the scene's canvas and copied out in the same task, so the page never shows it. */
const SIZE = 64, shots = new Map();   // id -> { sig, url, seen }
let stage = null;
const thumbOf = id => shots.get(id)?.url || null;
/* what the picture depends on: everything but where the object stands */
const sigOf = o => JSON.stringify({ ...o, pos: 0, rotY: 0, hidden: 0, locked: 0, name: 0 });

function check() {
  if (window.__noThumbs || recording || document.hidden) return;
  let got = false;
  for (const o of state.objects) {
    const s = shots.get(o.id) || {}, sig = sigOf(o);
    // still changing: wait for it to settle
    if (sig !== s.seen) { shots.set(o.id, { ...s, seen: sig }); continue; }
    if (sig === s.sig || !RT.get(o.id)) continue;
    try { shots.set(o.id, { sig, seen: sig, url: shoot(o) }); got = true; } catch (e) { console.warn('object picture', o.id, e); }
  }
  for (const id of shots.keys()) if (!state.objects.some(o => o.id === id)) shots.delete(id);
  if (got) renderObjects();
}
function shoot(o) {
  stage ??= (() => {
    const s = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, .01, 100);
    s.add(new THREE.HemisphereLight(0xffffff, 0xb8b2a8, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 5, 4); s.add(key);
    const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
    return { s, cam, cv };
  })();
  const rt = RT.get(o.id), g = rt.group, { s, cam, cv } = stage;
  // the object on its own, unturned at the origin, without the selection frame drawn on it
  const parent = g.parent, pos = g.position.clone(), rotY = g.rotation.y, vis = g.visible, off = [];
  g.traverse(m => { if ((m.isLine || m.isPoints) && m.visible) { m.visible = false; off.push(m); } });
  s.environment = scene.environment; s.environmentIntensity = scene.environmentIntensity; s.environmentRotation.copy(scene.environmentRotation);
  s.add(g); g.position.set(0, 0, 0); g.rotation.y = 0; g.visible = true; g.updateMatrixWorld(true);
  try {
    const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
    const dir = new THREE.Vector3(.78, .55, 1).normalize(), dist = r / Math.sin(cam.fov / 2 * Math.PI / 180) * 1.02;
    cam.position.copy(c).addScaledVector(dir, dist); cam.near = dist / 50; cam.far = dist * 4; cam.updateProjectionMatrix(); cam.lookAt(c);
    const pr = renderer.getPixelRatio(), n = Math.round(SIZE / pr), dom = renderer.domElement;
    renderer.setScissorTest(true); renderer.setViewport(0, 0, n, n); renderer.setScissor(0, 0, n, n);
    renderer.clear(); renderer.render(s, cam);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, dom.width / pr, dom.height / pr);
    const x = cv.getContext('2d'); x.clearRect(0, 0, SIZE, SIZE); x.drawImage(dom, 0, dom.height - n * pr, n * pr, n * pr, 0, 0, SIZE, SIZE);
  } finally {
    parent.add(g); g.position.copy(pos); g.rotation.y = rotY; g.visible = vis; g.updateMatrixWorld(true);
    for (const m of off) m.visible = true;
    invalidate();
  }
  return cv.toDataURL('image/png');
}
function initObjectThumbs() { setInterval(check, 700); }

export { initObjectThumbs, thumbOf };
