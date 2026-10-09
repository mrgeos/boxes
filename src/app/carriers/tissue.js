// Бумага тишью в коробке: один лист по дну или два крест-накрест, края по стенкам или наружу через борт
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';
import { RT } from '../scene/renderer.js';
import { invalidate } from '../scene/camera.js';

/* Tissue paper laid in a box: thin, a little see-through, crumpled. One sheet lies on the floor and its edges
   rise up the walls; or two square sheets cross as a star: one straight, its corners into the box's corners, the
   other turned (by angle, 45° at first), its sharp corners running up the middles of the walls. With `over` the edges that reach the rim fold over it and hang down outside. Both sheets are the
   same print: the face `tissue` (the sheet's size, w × l). It is seen with the lid open only. All lengths mm. */
const TISSUE_LAYOUT = { flat: 'Один лист по дну', cross: 'Два листа крест-накрест' };
const tissueOn = o => o.type === 'box' && o.lidType !== 'handle' && !!o.tissue?.on;
const defaultTissue = () => ({ on: false, layout: 'flat', over: false, w: 0, l: 0, angle: 45, off: 25, sheer: 25, crumple: 50 });
/* the inside of the box: half width / depth, floor, rim (mm) */
function boxInside(o) {
  const t = clamp(o.thickness, .3, 20), wall = clamp(Math.max(o.wallT ?? t, t), t, Math.min(o.dims.w, o.dims.d) / 4);
  return { A: o.dims.w / 2 - wall - .4, B: o.dims.d / 2 - wall - .4, y0: t + .3, top: o.dims.h - .2, ox: o.dims.w / 2 + .5, oz: o.dims.d / 2 + .5 };
}
/* a sheet the size that fits the box: the floor and most of the walls (and over the rim and down a little) */
function fitTissue(o) {
  const T = o.tissue, I = boxInside(o), Hw = I.top - I.y0, up = T.over ? Hw + Math.min(35, Hw * .45 + 8) : Hw * .8;
  // the turned sheet's corners reach up the walls of the longer side
  if (T.layout === 'cross') { const s = Math.round(Math.SQRT2 * (Math.max(I.A, I.B) + up)); T.w = T.l = s; }
  else { T.w = Math.round(I.A * 2 + up * 2); T.l = Math.round(I.B * 2 + up * 2); }
}
/* soft value noise for the crumples, by the place on the sheet (so they stay put) */
function crumple(x, z, seed) {
  let v = 0, a = 1, f = 1 / 28;
  for (let k = 0; k < 3; k++) { v += a * (Math.sin(x * f * 1.7 + seed + k * 3.1) * Math.sin(z * f * 1.3 - seed * .7 + k) + .5 * Math.sin((x + z) * f * 2.3 + k * 5.7)); a *= .45; f *= 2.3; }
  return v;
}
/* where a point of a sheet laid flat in the middle (x, z on the floor plane, mm) comes in the box: on the floor, up
   a wall, over the rim; with the surface's inward normal */
function place(I, over, x, z) {
  const dx = Math.max(0, Math.abs(x) - I.A), dz = Math.max(0, Math.abs(z) - I.B), Hw = I.top - I.y0;
  let c = Math.max(dx, dz);
  const sx = Math.sign(x) || 1, sz = Math.sign(z) || 1;
  // at a corner the paper gathers into a fold standing a little into the box
  const g = c > Hw ? 0 : Math.min(dx, dz) * .35;
  let px = clamp(x, -I.A, I.A) - sx * g, pz = clamp(z, -I.B, I.B) - sz * g, py = I.y0 + c, nx = 0, ny = 1, nz = 0;
  if (c > 0) { if (dx >= dz) nx = -sx; else nz = -sz; ny = 0; }
  if (c > Hw) {
    if (!over) { py = I.top - .5; }
    else {
      // over the rim and down the outside
      const e = c - Hw, R = 3;
      if (dx >= dz) { px = sx * (I.A + Math.min(e, R) * (I.ox - I.A) / R); nx = sx; }
      else { pz = sz * (I.B + Math.min(e, R) * (I.oz - I.B) / R); nz = sz; }
      py = e < R ? I.top + 1 : I.top + 1 - (e - R); ny = e < R ? 1 : 0;
    }
  }
  return [px, py, pz, nx, ny, nz];
}
function buildTissue(o, rt) {
  rt.tissue = null;
  if (!tissueOn(o)) return;
  const T = o.tissue; if (!T.w || !T.l) fitTissue(o);
  const I = boxInside(o), g = new THREE.Group(), W = clamp(T.w, 20, 3000), L = clamp(T.l, 20, 3000), amp = clamp(T.crumple ?? 50, 0, 100) / 100 * 4;
  const sheets = T.layout === 'cross'
    ? [[0, 0, .25], [(T.angle ?? 45) * Math.PI / 180, 0, 1.1]]
    : [[0, 0, .25]];
  sheets.forEach(([rot, shift, lift], si) => {
    const nu = clamp(Math.round(W / 4), 16, 140), nv = clamp(Math.round(L / 4), 16, 140), pos = [], uv = [], idx = [], cs = Math.cos(rot), sn = Math.sin(rot);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, a = (u - .5) * W, b = (v - .5) * L;
      const x = a * cs - b * sn + shift, z = a * sn + b * cs;
      const [px, py, pz, nx, ny, nz] = place(I, T.over, x, z);
      // crumples off the surface, more where the paper bends up the walls; the second sheet lies over the first
      const k = lift + amp * (.5 + .5 * crumple(a, b, si * 7.3 + 1));
      pos.push((px + nx * k) * S, (py + ny * k) * S, (pz + nz * k) * S); uv.push(u, 1 - v);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const p = j * (nu + 1) + i, q = p + 1, r = p + nu + 1, s = r + 1; idx.push(p, r, q, q, r, s); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, rt.faces.tissue.mat); m.castShadow = false; m.receiveShadow = true; m.renderOrder = 2 + si;
    m.userData = { objId: o.id, face: 'tissue', noFrame: true }; g.add(m);
  });
  rt.tissue = g; rt.group.add(g);
  applyTissue(o);
}
/* seen with the lid open (or with no lid), unless hidden */
function applyTissue(o) {
  const rt = RT.get(o.id); if (!rt?.tissue) return;
  rt.tissue.visible = !o.tissue.hidden && (o.lidType === 'none' || o.lid > 2);
  invalidate();
}

export { TISSUE_LAYOUT, applyTissue, boxInside, buildTissue, defaultTissue, fitTissue, tissueOn };
