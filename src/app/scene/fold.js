// Сборка: ползунок от плоской развёртки до собранной коробки (вид, в файл проекта не попадает)
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';
import { state } from '../core/state.js';
import { faceKeys } from '../core/model.js';
import { netPoint } from '../carriers/box-net.js';
import { buildRig, canFold, disposeRig, poseRig } from '../carriers/fold-rig.js';
import { RT, applyLid, staleShadow } from './renderer.js';
import { frameBox, invalidate } from './camera.js';

/* How far an object is folded (0 the blank flat … 1 the box) is a look, like the isolation: it lives on the object's
   runtime record (rt.fold, missing = 1), not in the project, and is gone with the object. Below 1 the object shows its
   fold rig (carriers/fold-rig.js) in place of the model: the model's parts are hidden (and so are the stickers,
   ribbons, sleeve, insert and fill, which sit on the closed box), and the lid is closed whatever o.lid says. At 1 the
   rig is dropped and the model shows as it is, with its own o.lid. Nothing here touches the interface: the panel
   (ui/fold-bar.js) and an agent both call setFold / playFold. */
const objById = id => state.objects.find(o => o.id === id) || null;
const foldOf = id => RT.get(id)?.fold ?? 1;
const anims = new Map();

function dropRig(rt, o) {
  rt.group.remove(rt.rig.group); disposeRig(rt.rig); rt.rig = null;
  for (const [c, v] of rt.foldPrev || []) c.visible = v;
  rt.foldPrev = null;
  applyLid(o);   // (the lid's own parts decide again what shows)
}
/* hides the model's parts while the rig shows; also the ones added meanwhile (a sticker's film) */
function syncFoldVis() {
  for (const rt of RT.values()) {
    if (!rt.rig) continue;
    rt.foldPrev ??= new Map();
    for (const c of rt.group.children) {
      if (c === rt.rig.group) { c.visible = true; continue; }
      if (!rt.foldPrev.has(c)) rt.foldPrev.set(c, c.visible);
      c.visible = false;
    }
  }
}
/* builds, poses or drops the rig for the object's fold; called after each build of the object */
function applyFold(o) {
  const rt = RT.get(o.id); if (!rt) return;
  const t = rt.fold ?? 1;
  if (!canFold(o) || (t >= 1 && !rt.foldForce)) { if (rt.rig) dropRig(rt, o); return; }
  if (!rt.rig) {
    const rig = buildRig(o, rt);
    if (!rig) { rt.fold = 1; return; }
    rt.rig = rig; rt.group.add(rig.group);
  }
  poseRig(rt.rig, t); syncFoldVis(); invalidate(); staleShadow();
}
/* frames the camera on the flat blank and the box together (once, when the fold begins) */
function foldFrame(id) {
  const o = objById(id), rt = RT.get(id); if (!o || !rt?.rig) return;
  const t = rt.fold ?? 1; poseRig(rt.rig, 0);
  const b = new THREE.Box3().setFromObject(rt.rig.group), f = rt.foot || { x0: -o.dims.w / 2, x1: o.dims.w / 2, z0: -o.dims.d / 2, z1: o.dims.d / 2 };
  b.union(new THREE.Box3(new THREE.Vector3(f.x0 * S, 0, f.z0 * S), new THREE.Vector3(f.x1 * S, o.dims.h * S, f.z1 * S)).applyMatrix4(rt.group.matrixWorld));
  poseRig(rt.rig, t); frameBox(b);
}
/* sets how far the object is folded, 0…1 (false if it cannot fold); frame: bring the camera to the blank first */
function setFold(id, t, { frame = false } = {}) {
  const o = objById(id), rt = RT.get(id); if (!o || !rt || !canFold(o)) return false;
  const was = rt.fold ?? 1; rt.fold = clamp(+t || 0, 0, 1);
  applyFold(o);
  if (frame && was >= 1 && rt.fold < 1) foldFrame(id);
  return true;
}
function stopFold(id) { anims.get(id)?.(); }
/* unfolds to the flat blank and folds back to the box, ~4 s in all; resolves when it is done, or at once if it cannot fold. Any other setFold / playFold stops it */
function playFold(id, { ms = 4000, frame = true } = {}) {
  const o = objById(id); if (!o || !canFold(o)) return Promise.resolve(false);
  stopFold(id);
  const from = foldOf(id), t0 = performance.now(), hold = .08, d = from > 0 ? (1 - hold) / 2 : 0;
  const ease = x => x < .5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
  return new Promise(done => {
    let raf = 0, ended = false, first = true;
    const finish = ok => { if (ended) return; ended = true; cancelAnimationFrame(raf); anims.delete(id); done(ok); };
    anims.set(id, () => finish(false));
    const step = now => {
      const k = Math.min(1, (now - t0) / ms);
      // from where it is down to 0 (the first half), a short rest, then up to 1
      const v = k >= 1 ? 1 : k < d ? from * (1 - ease(k / d)) : k < d + hold ? 0 : ease((k - d - hold) / (1 - d - hold));
      setFold(id, v, { frame: frame && first }); first = false;
      if (k < 1) raf = requestAnimationFrame(step); else finish(true);
    };
    raf = requestAnimationFrame(step);
  });
}

/* for the tests: where each face's middle and normal are on the rig now, in the object's frame (mm); the model's own
   frames are RT.frames. rig: show the rig at 1 too */
function foldPoses(id, force = null) {
  const o = objById(id), rt = RT.get(id); if (!o || !rt) return null;
  if (force != null) { rt.foldForce = !!force; applyFold(o); }
  if (!rt.rig) return null;
  rt.group.updateMatrixWorld(true);
  const inv = rt.group.matrixWorld.clone().invert(), nm = new THREE.Matrix3().getNormalMatrix(inv), keys = faceKeys(o), out = [];
  for (const n of rt.rig.nodes) {
    const p = rt.rig.panels[n.i]; if (!keys.includes(p.key) || p.crop) continue;
    const [X, Y] = netPoint(p, .5, .5), c = n.content.localToWorld(new THREE.Vector3((X - n.ox) * S, 0, (Y - n.oy) * S)).applyMatrix4(inv).divideScalar(S);
    const nn = new THREE.Vector3(0, 1, 0).transformDirection(n.content.matrixWorld).applyMatrix3(nm).normalize();
    out.push({ key: p.key, c: c.toArray(), n: nn.toArray() });
  }
  return out;
}

export { applyFold, canFold, foldFrame, foldOf, foldPoses, playFold, setFold, stopFold, syncFoldVis };
