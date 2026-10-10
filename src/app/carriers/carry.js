// Рукав-переноска для тортницы: лента под дном, стенки, скаты и ручка из двух концов ленты
import * as THREE from 'three';
import { S, clamp, rrPoly } from '../core/util.js';
import { FINISHES } from '../core/constants.js';
import { RT } from '../scene/renderer.js';
import { sleeveLeaf, sleeveSheet } from './sleeve.js';
import { torteEnvelope, torteGeom } from './torte.js';

/* ---------- carrier sleeve for a cake container ----------
   One paper band from front to back under the container: it rises in two walls (front and back), turns in at
   the shoulders towards the middle above the lid and goes up into the handle. The band starts and ends at the
   top of the handle: its two ends are the handle's leaves, glued back to back, with the hand hole through both
   (as on a box sleeve with a handle). The sides stay open. A house has upright walls and shoulders; a tent runs
   from the handle straight down to a bottom wide enough for the slopes to clear the lid.
   Its design is one strip (face 'carry'): across the band = canvas x, along the band = canvas y, from the
   top of the front leaf: front leaf, front shoulder, front wall, bottom, back wall, back shoulder, back leaf.
   A window low in the walls (front and back alike) shows the container. Section coordinates: z to the
   front, y up, the floor at 0. */
const carryOn = o => o.type === 'torte' && !!o.carry?.on;
const CARRY_PANEL = { handleF: 'ручка: перед', shoulderF: 'скат: перед', wallF: 'перед', sideF: 'перед', bottom: 'дно', sideB: 'зад', wallB: 'зад', shoulderB: 'скат: зад', handleB: 'ручка: зад' };
const CARRY_STYLES = { house: 'Домик: прямые стенки и скаты к ручке', tent: 'Шалаш: от ручки прямо к дну' };
/* the foot of the handle for a house with walls hw high at Ab from the middle: the shoulders clear the lid */
function houseYs(G, env, hw, Ab, gap, g) {
  let ys = G.H + g + 2;
  for (const p of env) if (p.y > hw && p.r < Ab - .01) ys = Math.max(ys, hw + (p.y + g - hw) * (Ab - gap) / (Ab - p.r) + 1);
  return ys;
}
/* walls just high enough for the handle's foot to stand `lift` above the lid */
function houseWall(G, lift) {
  const env = torteEnvelope(G), Ab = G.R + .8, want = G.H + .8 + lift;
  let lo = G.hb + 3, hi = G.H + .8;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (houseYs(G, env, m, Ab, .15, .8) > want) lo = m; else hi = m; }
  return hi;
}
function defaultCarry(o) {
  const G = torteGeom(o), bw = Math.round(G.Rl * 2 * .62), wall = Math.round(houseWall(G, clamp(G.R * .4, 15, 80)));
  return { on: false, w: bw, wall, spread: 50, h: 70, r: 16, hole: { w: Math.round(Math.min(bw * .55, 90)), h: 22, y: 34, r: 11 },
    cut: { on: true, w: Math.round(bw * .6), h: Math.round(Math.min(wall * .3, 40)), y: 8, r: 4 }, style: 'house', slide: 0, fin: 'matte' };
}
function carryDims(o) {
  const G = torteGeom(o), C = o.carry || defaultCarry(o), g = .8, st = .3, gap = .15, tent = C.style === 'tent', env = torteEnvelope(G);
  const bw = clamp(C.w ?? G.Rl, 20, 2 * G.R), hh = clamp(C.h ?? 70, 20, 300);
  let names, lens, pts, hw = 0, ys, Ab;
  if (tent) {
    // a tent: from the foot of the handle straight down to a bottom `spread` wider than the container on each side,
    // the handle as low as the slopes can be while clearing the lid
    Ab = G.R + g + clamp(C.spread ?? 50, 0, 500); ys = G.H + g + 5;
    for (const p of env) ys = Math.max(ys, (p.y + g) * (Ab - gap) / (Ab - p.r) + 1);
    const Ls = Math.hypot(Ab - gap, ys);
    names = ['handleF', 'sideF', 'bottom', 'sideB', 'handleB']; lens = [hh, Ls, 2 * Ab, Ls, hh];
    pts = [[gap, ys + hh], [gap, ys], [Ab, 0], [-Ab, 0], [-gap, ys], [-gap, ys + hh]];
  } else {
    // a house: upright walls at the container's rim, shoulders from their top in to the foot of the handle, clear of the lid
    Ab = G.R + g; hw = clamp(C.wall ?? houseWall(G, clamp(G.R * .4, 15, 80)), G.hb + 3, G.H + g); ys = houseYs(G, env, hw, Ab, gap, g);
    const Ls = Math.hypot(Ab - gap, ys - hw);
    names = ['handleF', 'shoulderF', 'wallF', 'bottom', 'wallB', 'shoulderB', 'handleB']; lens = [hh, Ls, hw, 2 * Ab, hw, Ls, hh];
    pts = [[gap, ys + hh], [gap, ys], [Ab, hw], [Ab, 0], [-Ab, 0], [-Ab, hw], [-gap, ys], [-gap, ys + hh]];
  }
  const stops = [0]; for (const l of lens) stops.push(stops.at(-1) + l);
  // the window low in the front and back panels (the walls, or the slopes of a tent), from the bottom fold up
  const iF = names.indexOf(tent ? 'sideF' : 'wallF'), iB = names.indexOf(tent ? 'sideB' : 'wallB'), pl = lens[iF];
  const c = C.cut || {}, cw = clamp(c.w ?? 0, 0, bw - 6), ch = clamp(c.h ?? 0, 0, pl - 6), cy = clamp(c.y ?? 0, 3, Math.max(3, pl - ch - 3));
  const cut = c.on && cw > 2 && ch > 2 ? { w: cw, h: ch, y: cy, r: clamp(c.r ?? 0, 0, Math.min(cw, ch) / 2 - .1), sF: stops[iF + 1], sB: stops[iB] } : null;
  return { G, tent, bw, hh, hw, ys, Ab, gap, st, P: stops.at(-1), names, lens, stops, pts, cut, cy: tent ? ys * .3 : hw / 2, rf: 0, leaf: sleeveLeaf(C, bw, hh, 0),
    flips: names.map(k => ['bottom', 'wallB', 'shoulderB', 'sideB', 'handleB'].includes(k)) };
}
/* the windows low in the walls, on the strip (mm: x across, y along) */
function carryWindows(D) {
  if (!D.cut) return [];
  const { w, h, y, r, sF, sB } = D.cut, x0 = (D.bw - w) / 2;
  return [rrPoly(x0, sF - y - h, x0 + w, sF - y, r, r), rrPoly(x0, sB + y, x0 + w, sB + y + h, r, r)].map(q => q.map(v => [v.x, v.y]));
}
/* the band on the sheet: outline (the leaves' rounded tops at both ends), hand holes and windows, creases, the
   leaf that takes the glue on its back */
function carrySheet(D) {
  const sh = sleeveSheet(D);
  return { ...sh, holes: [...sh.holes, ...carryWindows(D)] };
}
function buildCarry(o, rt) {
  rt.carry = null;
  if (!carryOn(o)) return;
  const D = carryDims(o), g = new THREE.Group(), mat = rt.faces.carry.mat, wins = carryWindows(D);
  carryColors(o, rt);
  // a flat piece of the band: a shape in strip coordinates (x across from the band's middle, s along) and where
  // a strip point is in the section (z, y), with the outward normal; printed outside, plain paper inside
  const piece = (shape, at, n) => {
    for (const [outer, m, face] of [[true, mat, 'carry'], [false, rt.sleeveIn, null]]) {
      const geo = new THREE.ShapeGeometry(shape, 12), pos = geo.attributes.position, uv = geo.attributes.uv, off = outer ? D.st : 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), s = pos.getY(i), [z, y] = at(s);
        uv.setXY(i, x / D.bw + .5, 1 - s / D.P);
        pos.setXYZ(i, x * S, (y + n[1] * off) * S, (z + n[0] * off) * S);
      }
      geo.computeVertexNormals();
      const want = new THREE.Vector3(0, n[1], n[0]).multiplyScalar(outer ? 1 : -1), got = new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, 0);
      if (got.dot(want) < 0) { geo.index.array.reverse(); geo.computeVertexNormals(); }
      const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; mesh.userData = { objId: o.id, face }; g.add(mesh);
    }
  };
  const V = (x, y) => new THREE.Vector2(x, y), half = D.bw / 2;
  // shoulders, walls and bottom
  for (let i = 1; i < D.names.length - 1; i++) {
    const [za, ya] = D.pts[i], [zb, yb] = D.pts[i + 1], s0 = D.stops[i], s1 = D.stops[i + 1], L = s1 - s0;
    const tz = (zb - za) / L, ty = (yb - ya) / L, cz = (za + zb) / 2, cyy = (ya + yb) / 2 - D.cy;
    let n = [ty, -tz]; if (n[0] * cz + n[1] * cyy < 0) n = [-n[0], -n[1]];
    const sh = new THREE.Shape([V(-half, s0), V(half, s0), V(half, s1), V(-half, s1)]);
    for (const w of wins) if (w.every(([, s]) => s > s0 && s < s1)) sh.holes.push(new THREE.Path(w.map(([x, s]) => V(x - half, s))));
    piece(sh, s => [za + (zb - za) * (s - s0) / L, ya + (yb - ya) * (s - s0) / L], n);
  }
  // the handle: the band's two ends standing back to back over the middle, the hand hole through both
  for (const front of [true, false]) {
    const toS = yl => front ? D.hh - yl : D.P - D.hh + yl;
    const sh = new THREE.Shape(D.leaf.outer.map(([x, yl]) => V(x, toS(yl))));
    if (D.leaf.hole) sh.holes.push(new THREE.Path(D.leaf.hole.map(([x, yl]) => V(x, toS(yl)))));
    const z = front ? D.gap : -D.gap;
    piece(sh, s => [z, D.ys + (front ? D.hh - s : s - (D.P - D.hh))], [front ? 1 : -1, 0]);
  }
  rt.carry = g; rt.group.add(g);
  applyCarry(o);
}
/* the sleeve lifted off the container */
function applyCarry(o) {
  const rt = RT.get(o.id); if (!rt?.carry) return;
  rt.carry.position.y = clamp(o.carry.slide || 0, 0, 1000) * S;
  rt.carry.visible = !o.carry.hidden;
}
function carryColors(o, rt) {
  rt.sleeveIn ??= new THREE.MeshStandardMaterial({ roughness: .9, side: THREE.FrontSide });
  const kraft = o.carry?.fin === 'kraft', paper = new THREE.Color(o.faces.carry?.bg || '#ffffff');
  if (kraft) paper.multiply(new THREE.Color(FINISHES.kraft.kraft));
  rt.sleeveIn.color.copy(kraft ? paper : new THREE.Color('#f6f3ec'));
}

export { CARRY_PANEL, CARRY_STYLES, applyCarry, buildCarry, carryColors, carryDims, carryOn, carrySheet, defaultCarry };
