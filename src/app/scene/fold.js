// Сборка: ползунок от плоской развёртки до собранной коробки (вид, в файл проекта не попадает)
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';
import { state } from '../core/state.js';
import { faceKeys } from '../core/model.js';
import { netPoint } from '../carriers/box-net.js';
import { FLIP, SPAN, applyPlan, buildRig, canFold, disposeRig, foldCreases, markCrease, poseRig } from '../carriers/fold-rig.js';
import { FLIP_MS, foldMs, mergeSteps, moveStep, pruneEmpty, resetCrease, resolvePlan, setCrease, setCreaseStep, setTime, slices } from '../carriers/fold-plan.js';
import { RT, applyLid, camera, controls, staleShadow } from './renderer.js';
import { camPose, camTween, frameBox, goPose, invalidate } from './camera.js';

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
    if (rt.foldSel) markCrease(rig, rt.foldSel);
  }
  const { plan, sl } = planOf(o); applyPlan(rt.rig, plan, sl);
  poseRig(rt.rig, t); syncFoldVis(); invalidate(); staleShadow();
}
/* the project's plan resolved against the object's creases (kept until the plan or the object changes) */
function creasesOf(o) { const rt = RT.get(o.id); return rt ? rt.creases ??= foldCreases(o) : null; }
function planOf(o) {
  const rt = RT.get(o.id), sig = JSON.stringify(o.foldPlan || 0);
  if (!rt.planned || rt.planned.sig !== sig) { const plan = resolvePlan(o, creasesOf(o)); rt.planned = { sig, plan, sl: slices(plan.steps) }; }
  return rt.planned;
}
/* frames the camera on the flat blank and the box together (once, when the fold begins) */
function foldFrame(id) {
  const o = objById(id), rt = RT.get(id); if (!o || !rt?.rig) return;
  const t = rt.fold ?? 1, b = new THREE.Box3(), f = rt.foot || { x0: -o.dims.w / 2, x1: o.dims.w / 2, z0: -o.dims.d / 2, z1: o.dims.d / 2 };
  // the camera stays where it is while the blank folds: it must see the flat blank and the poses after the turn-over (the turn itself may reach out of the view for a moment)
  for (const q of [0, .2, .35, .5, .7, 1]) { poseRig(rt.rig, q); b.union(new THREE.Box3().setFromObject(rt.rig.group)); }
  b.union(new THREE.Box3(new THREE.Vector3(f.x0 * S, 0, f.z0 * S), new THREE.Vector3(f.x1 * S, o.dims.h * S, f.z1 * S)).applyMatrix4(rt.group.matrixWorld));
  poseRig(rt.rig, t); rt.foldBefore = camPose(); rt.foldSet = frameBox(b);
}
/* the fold is back to 100 %: the camera goes back to the pose it had when the fold began, unless the user has moved it since */
function foldDone(id) {
  const rt = RT.get(id); if (!rt?.foldSet || (rt.fold ?? 1) < 1) return;
  const { p, q } = rt.foldSet, before = rt.foldBefore, still = camTween || (camera.position.distanceTo(p) < 1e-3 && controls.target.distanceTo(q) < 1e-3);
  rt.foldSet = rt.foldBefore = null;
  if (still && before) goPose(before);
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
/* ----- the time of the fold: the turn-over takes FLIP_MS, then the steps take their own (default: DEFAULT_FOLD_MS in all) ----- */
const lenMs = o => FLIP_MS + foldMs(planOf(o).plan);
const tAt = (o, ms) => ms <= FLIP_MS ? ms / FLIP_MS * FLIP : FLIP + (ms - FLIP_MS) / (lenMs(o) - FLIP_MS) * (1 - FLIP);
const msAt = (o, t) => t <= FLIP ? t / FLIP * FLIP_MS : FLIP_MS + (t - FLIP) / (1 - FLIP) * (lenMs(o) - FLIP_MS);
/* unfolds to the flat blank and folds back to the box (~4 s with the family's own order, else as the steps take);
   resolves when it is done, or at once if it cannot fold. Any other setFold / playFold stops it */
function playFold(id, { ms = 0, frame = true } = {}) {
  const o = objById(id); if (!o || !canFold(o)) return Promise.resolve(false);
  stopFold(id);
  const from = foldOf(id), t0 = performance.now(), hold = from > 0 ? 300 : 0, down = msAt(o, from), up = lenMs(o), k = ms ? ms / (down + hold + up) : 1;
  return new Promise(done => {
    let raf = 0, ended = false, first = true;
    const finish = ok => { if (ended) return; ended = true; cancelAnimationFrame(raf); anims.delete(id); if (ok) foldDone(id); done(ok); };
    anims.set(id, () => finish(false));
    const step = now => {
      const e = (now - t0) / k, v = e >= down + hold + up ? 1 : e < down ? tAt(o, down - e) : e < down + hold ? 0 : tAt(o, e - down - hold);
      setFold(id, v, { frame: frame && first }); first = false;
      if (v < 1 || e < down + hold + up) raf = requestAnimationFrame(step); else finish(true);
    };
    raf = requestAnimationFrame(step);
  });
}
/* the timeline of the fold for a video: [turn-over ms, fold ms] and the mapping from ms (flat = 0) to the slider's t */
const foldTimeline = id => { const o = objById(id); return o && canFold(o) ? { flip: FLIP_MS, fold: lenMs(o) - FLIP_MS, total: lenMs(o), at: ms => tAt(o, Math.max(0, Math.min(lenMs(o), ms))) } : null; };

/* ----- the editor's side: what the project's plan says, and the changes to it. Each change returns the new info (null if it
   did nothing); the interface commits (one history step) after it, as an agent does. ----- */
const listeners = new Set();
const onFoldPlan = cb => { listeners.add(cb); };
/* the plan as the editor shows it: steps (with where they begin and end on the slider, 0…1) and creases */
function foldInfo(id) {
  const o = objById(id); if (!o || !canFold(o) || !RT.get(id)) return null;
  const cr = creasesOf(o), { plan, sl } = planOf(o), D = Math.max(1, ...cr.map(c => c.rank)), by = new Map(cr.map(c => [c.id, c]));
  const steps = plan.steps.map(s => {
    // with the family's own order a step begins with its first crease and lasts until its last one has closed
    const st = plan.custom ? sl[s.i].s : Math.min(...s.ids.map(k => (by.get(k).rank - 1) * (1 - SPAN) / Math.max(1, D - 1))), en = plan.custom ? sl[s.i].s + sl[s.i].len : st + SPAN;
    return { i: s.i, id: s.id, name: s.name, ms: s.ms, pause: s.pause, ids: [...s.ids], start: FLIP + (1 - FLIP) * st, end: FLIP + (1 - FLIP) * Math.min(1, en) };
  });
  const creases = cr.map(c => ({ id: c.id, label: c.label, key: c.key, parentKey: c.parentKey, step: plan.stepOf[c.id], ang: plan.ang[c.id], mag: plan.mag[c.id], valley: plan.valley[c.id],
    custom: !!o.foldPlan?.creases?.[c.id], seg: c.seg, def: { mag: Math.abs(c.ang0), valley: c.ang0 < 0 } }));
  return { id, custom: plan.custom, steps, creases, ms: foldMs(plan), total: lenMs(o) };
}
function change(id, fn) {
  const o = objById(id), rt = RT.get(id); if (!o || !rt || !canFold(o)) return null;
  const plan = resolvePlan(o, creasesOf(o));
  if (fn(o, plan) === false) return null;
  pruneEmpty(o); rt.planned = null; applyFold(o);
  for (const f of listeners) f(id);
  return foldInfo(id);
}
const known = (o, cid) => creasesOf(o).some(c => c.id === cid);
/* the angle of a crease (0…180°) and its direction: valley true folds toward the print, false (mountain) away from it */
const setFoldAngle = (id, cid, deg, valley) => change(id, o => known(o, cid) && setCrease(o, cid, { ang: deg, valley }));
/* a crease into step number `step` (0…; a number past the last makes a step of its own) */
const setFoldStep = (id, cid, step) => change(id, (o, plan) => setCreaseStep(o, plan, cid, step));
const moveFoldStep = (id, from, to) => change(id, (o, plan) => moveStep(o, plan, from, to));
/* step i and the next one close together (one step) */
const mergeFoldSteps = (id, i) => change(id, (o, plan) => mergeSteps(o, plan, i));
/* a step's time and the pause after it, ms (the pause may be negative: the next step begins before this one is done) */
const setStepTime = (id, i, t) => change(id, (o, plan) => setTime(o, plan, i, t));
const resetFoldCrease = (id, cid) => change(id, o => { resetCrease(o, cid); });
const resetFoldPlan = id => change(id, o => { delete o.foldPlan; });
const listFoldCreases = id => foldInfo(id)?.creases || null;
/* the crease the editor has picked, marked on the model while it shows the rig (null: none) */
function markFold(id, cid) {
  const rt = RT.get(id); if (!rt) return;
  rt.foldSel = cid || null;
  if (rt.rig) { markCrease(rt.rig, rt.foldSel); invalidate(); }
}
/* the slider to where the step begins (so what it folds is seen); returns that value */
function focusFoldStep(id, i) {
  const info = foldInfo(id), s = info?.steps[i]; if (!s) return null;
  setFold(id, s.start, { frame: true }); return s.start;
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
    const p = rt.rig.panels[n.i]; if (!keys.includes(p.key)) continue;
    // the face's own middle: for a panel that carries a part of the face (a half), the plane carried on to it
    const c0 = p.crop || [0, 0, 1, 1], [X, Y] = netPoint(p, (.5 - c0[0]) / (c0[2] - c0[0]), (.5 - c0[1]) / (c0[3] - c0[1]));
    const c = n.content.localToWorld(new THREE.Vector3((X - n.ox) * S, 0, (Y - n.oy) * S)).applyMatrix4(inv).divideScalar(S);
    const nn = new THREE.Vector3(0, 1, 0).transformDirection(n.content.matrixWorld).applyMatrix3(nm).normalize();
    out.push({ key: p.key, c: c.toArray(), n: nn.toArray() });
  }
  return out;
}

/* the crease mark is a mark over the scene, not part of the picture: «Рендер» hides it while it samples and draws it last
   (scene/render-mode.js) */
const foldMarkShown = () => [...RT.values()].some(rt => rt.rig?.mark?.visible);
function hideFoldMark() {
  const hid = [...RT.values()].map(rt => rt.rig?.mark).filter(m => m?.visible); hid.forEach(m => { m.visible = false; });
  return () => hid.forEach(m => { m.visible = true; });
}

export { foldMarkShown, hideFoldMark, applyFold, canFold, focusFoldStep, foldDone, foldFrame, foldInfo, foldOf, foldPoses, foldTimeline, listFoldCreases, markFold, mergeFoldSteps, moveFoldStep, onFoldPlan, playFold, resetFoldCrease, resetFoldPlan, setFold, setFoldAngle, setFoldStep, setStepTime, stopFold, syncFoldVis };
