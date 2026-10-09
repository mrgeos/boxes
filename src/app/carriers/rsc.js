// Четырёхклапанный гофрокороб FEFCO 0201: стенки лентой с клеевым клапаном, по четыре клапана сверху и снизу, скотч
import * as THREE from 'three';
import { DEG, S, clamp } from '../core/util.js';
import { RT } from '../scene/renderer.js';
import { invalidate } from '../scene/camera.js';

/* FEFCO 0201, the regular slotted carton: the four walls are one strip, closed by a glue flap; every wall has a flap
   at the top and at the bottom, all half the box's depth high. The flaps of the front and back meet in the middle
   (outer flaps), those of the sides go under them (inner flaps). The design of the top is one picture, `top`, the
   two outer top flaps closed (its front half on the front flap, its back half on the back one); the same for the
   bottom. `inside` is the underside of the outer top flaps. Opening: the outer flaps swing out, then the inner ones.
   Tape across the seam: clear, kraft or none. Lengths in mm. */
const TAPES = { clear: 'Прозрачный скотч', kraft: 'Крафт-скотч', none: 'Без скотча' };
const TAPE_W = 48, TAPE_DOWN = 60;
const rscT = o => clamp(o.thickness, .3, Math.min(o.dims.w, o.dims.h, o.dims.d) / 8);
/* a plane w × h (in its own x, y) with its v running from v0 to v1 instead of 0..1 */
function halfPlane(w, h, v0, v1) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  return g;
}
function buildRsc(o, rt, { addG, add }) {
  const W = o.dims.w * S, H = o.dims.h * S, D = o.dims.d * S, T = rscT(o) * S, P = Math.PI, g = rt.group, F = k => rt.faces[k].mat;
  // the walls, outside and in
  add(g, W, H, F('front'), [0, H / 2, D / 2], [0, 0, 0], { face: 'front' });
  add(g, W, H, F('back'), [0, H / 2, -D / 2], [0, P, 0], { face: 'back' });
  add(g, D, H, F('right'), [W / 2, H / 2, 0], [0, P / 2, 0], { face: 'right' });
  add(g, D, H, F('left'), [-W / 2, H / 2, 0], [0, -P / 2, 0], { face: 'left' });
  const ih = H - 2 * T, iy = (H + 2 * T) / 2;
  add(g, W - 2 * T, ih, rt.innerMat, [0, iy, D / 2 - T], [0, P, 0], { face: 'inside', wall: true });
  add(g, W - 2 * T, ih, rt.innerMat, [0, iy, -D / 2 + T], [0, 0, 0], { face: 'inside', wall: true });
  add(g, D - 2 * T, ih, rt.innerMat, [W / 2 - T, iy, 0], [0, -P / 2, 0], { face: 'inside', wall: true });
  add(g, D - 2 * T, ih, rt.innerMat, [-W / 2 + T, iy, 0], [0, P / 2, 0], { face: 'inside', wall: true });
  add(g, W - 2 * T, D - 2 * T, F('insideBottom'), [0, 2 * T, 0], [-P / 2, 0, 0], { face: 'insideBottom' });
  // the rims of the walls (creases), seen with the flaps open
  for (const sz of [-1, 1]) add(g, W, T, rt.foldMat, [0, H, sz * (D / 2 - T / 2)], [-P / 2, 0, 0]);
  for (const sx of [-1, 1]) add(g, T, D - 2 * T, rt.foldMat, [sx * (W / 2 - T / 2), H - T, 0], [-P / 2, 0, 0]);
  // outer flaps (front and back): the halves of `top` above, of `inside` below; they meet in the middle
  const L = D / 2, flaps = { outer: [], inner: [] };
  for (const sz of [1, -1]) {
    const pv = new THREE.Group(); pv.position.set(0, H, sz * D / 2); g.add(pv);
    const front = sz > 0, zc = -sz * L / 2;
    const q = o.dims.d / 4;   // the face's middle is the seam: a quarter of the depth off each half's own
    addG(pv, halfPlane(W, L, front ? 0 : .5, front ? .5 : 1), F('top'), [0, 0, zc], [-P / 2, 0, 0], { face: 'top', frameOff: [0, front ? q : -q] });
    addG(pv, halfPlane(W, L, front ? .5 : 0, front ? 1 : .5), F('inside'), [0, -T, zc], [P / 2, 0, 0], { face: 'inside', frameOff: [0, front ? -q : q] });
    add(pv, W, T, rt.edgeMat, [0, -T / 2, -sz * L], [0, front ? 0 : P, 0]);
    for (const sx of [-1, 1]) add(pv, L, T, rt.edgeMat, [sx * W / 2, -T / 2, zc], [0, sx * P / 2, 0]);
    flaps.outer.push({ g: pv, sz });
  }
  // inner flaps (sides), under the outer ones: the board's outer side up
  const IW = D - 2 * T;
  for (const sx of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(sx * W / 2, H - T, 0); g.add(pv);
    add(pv, L, IW, rt.foldMat, [-sx * L / 2, 0, 0], [-P / 2, 0, 0]);
    add(pv, L, IW, rt.innerMat, [-sx * L / 2, -T, 0], [P / 2, 0, 0]);
    add(pv, IW, T, rt.edgeMat, [-sx * L, -T / 2, 0], [0, -sx * P / 2, 0]);
    flaps.inner.push({ g: pv, sx });
  }
  // the bottom: the outer bottom flaps carry the halves of `bottom`
  for (const sz of [1, -1]) {
    const front = sz > 0;
    addG(g, halfPlane(W, L, front ? .5 : 0, front ? 1 : .5), F('bottom'), [0, 0, sz * L / 2], [P / 2, 0, 0], { face: 'bottom', frameOff: [0, (front ? -1 : 1) * o.dims.d / 4] });
  }
  // tape across the top seam and down the sides
  rt.rscTape = null;
  if (o.tape && o.tape !== 'none') {
    const tp = new THREE.Group(), tw = TAPE_W * S, td = Math.min(TAPE_DOWN, o.dims.h * .6) * S, m = tapeMat(rt, o.tape), lift = .15 * S;
    const strip = (w, h, pos, rot) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); s.position.set(...pos); s.rotation.set(...rot); s.receiveShadow = true; s.userData = { objId: o.id, face: null }; s.raycast = () => {}; tp.add(s); };
    strip(W, tw, [0, H + lift, 0], [-P / 2, 0, 0]);
    for (const sx of [-1, 1]) strip(tw, td, [sx * (W / 2 + lift), H - td / 2, 0], [0, sx * P / 2, 0]);
    g.add(tp); rt.rscTape = tp;
  }
  rt.rsc = flaps;
  rt.lidPivot = rt.lidGroup = null;
  applyRsc(o);
}
function tapeMat(rt, kind) {
  rt.rscTapeMat ??= new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const m = rt.rscTapeMat, clear = kind === 'clear';
  Object.assign(m, { transparent: clear, opacity: clear ? .38 : 1, roughness: clear ? .12 : .78, clearcoat: clear ? 1 : 0, depthWrite: !clear });
  m.color.set(clear ? '#eef3f4' : '#b98a55'); m.needsUpdate = true;
  return m;
}
/* the flaps at o.lid (0 closed … 125 open): the outer ones swing out first, then the inner ones; the tape is cut */
function applyRsc(o) {
  const rt = RT.get(o.id); if (!rt?.rsc) return;
  const f = clamp(o.lid / 125, 0, 1), a = clamp(f / .55, 0, 1) * 200 * DEG, b = clamp((f - .35) / .65, 0, 1) * 190 * DEG;
  for (const { g, sz } of rt.rsc.outer) g.rotation.x = sz * a;
  for (const { g, sx } of rt.rsc.inner) g.rotation.z = -sx * b;
  if (rt.rscTape) rt.rscTape.visible = o.lid < .5;
  invalidate();
}

/* the blank: the walls in a row (left side, front, right side, back) with the glue flap on the left; above each wall
   its top flap, below its bottom flap, slots between the flaps */
function rscNet(o) {
  const { w, h, d } = o.dims, t = rscT(o), fh = d / 2, s = t, panels = [], tabs = [];
  const xs = [0, d, d + w, 2 * d + w, 2 * d + 2 * w], walls = ['left', 'front', 'right', 'back'];
  walls.forEach((key, i) => {
    const x = xs[i], ww = xs[i + 1] - x, fx = x + s, fw = ww - 2 * s;
    panels.push({ key, x, y: fh, w: ww, h, q: 0 });
    if (key === 'front') panels.push({ key: 'top', x: fx, y: 0, w: fw, h: fh, q: 0, crop: [0, .5, 1, 1], half: 'передняя' }, { key: 'bottom', x: fx, y: fh + h, w: fw, h: fh, q: 0, crop: [0, 0, 1, .5], half: 'передняя' });
    else if (key === 'back') panels.push({ key: 'top', x: fx, y: 0, w: fw, h: fh, q: 2, crop: [0, 0, 1, .5], half: 'задняя' }, { key: 'bottom', x: fx, y: fh + h, w: fw, h: fh, q: 2, crop: [0, .5, 1, 1], half: 'задняя' });
    else panels.push({ key: 'iflap', blank: 'клапан', fs: 4, x: fx, y: 0, w: fw, h: fh, joins: [key] }, { key: 'iflap', blank: 'клапан', fs: 4, x: fx, y: fh + h, w: fw, h: fh, joins: [key] });
  });
  // the glue flap on the left side wall, glued inside the back wall's free edge
  const gw = clamp(h * .2, 15, 35), ch = Math.min(gw * .5, h * .1);
  tabs.push({ on: 'left', pts: [[0, fh], [-gw, fh + ch], [-gw, fh + h - ch], [0, fh + h]] });
  const x0 = -gw, W = xs[4] - x0;
  for (const p of panels) p.x -= x0;
  for (const tb of tabs) tb.pts = tb.pts.map(([x, y]) => [x - x0, y]);
  return { v: 2, fefco: '0201', W, H: 2 * fh + h, panels, tabs };
}

export { TAPES, applyRsc, buildRsc, rscNet };
