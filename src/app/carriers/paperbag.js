// Бумажный пакет с ручками: корпус с фальцами, плоские ручки, развёртка
import * as THREE from 'three';
import { S, clamp, esc } from '../core/util.js';

/* ---------- paper carrier bag ----------
   A paper bag standing open: front and back (dims.w × dims.h), side gussets (dims.d) with a crease down the
   middle and the folds of the flat bottom showing at their foot, the top edge turned in. Two flat paper handles,
   each a strip bent into a U, are glued inside the front and the back under the turn-in. Faces: front, right,
   back, left, each drawn upright. The die is one sheet: front, right gusset, back, left gusset and a glue flap
   in a row, the turn-in above, the bottom flaps below. */
const PB_KEYS = ['front', 'right', 'back', 'left'];
const defaultPaperBag = d => ({ handles: true, hw: 20, hh: Math.round(clamp(d.h * .27, 50, 120)), span: Math.round(clamp(d.w * .4, 60, d.w - 40)), top: 40 });
function pbDims(o) {
  const { w, h, d } = o.dims, P = o.pb || defaultPaperBag(o.dims);
  const top = clamp(P.top ?? 40, 10, h * .4), hw = clamp(P.hw ?? 20, 8, 60), hh = clamp(P.hh ?? 80, 20, 300), span = clamp(P.span ?? w * .4, hw * 2 + 10, w - hw - 4);
  return { w, h, d, top, hw, hh, span, handles: P.handles !== false, glue: 20, bot: Math.round(d / 2 + 15), t: .3 };
}
function buildPaperBag(o, rt) {
  const B = pbDims(o), W = B.w * S, H = B.h * S, D = B.d * S, T = B.t * S, g = rt.group, F = k => rt.faces[k].mat, P = Math.PI;
  const plane = (w, h, mat, pos, rot, face, wall) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(...pos); m.rotation.set(...rot);
    m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, face: face || null, ...(wall ? { wall: true } : {}) }; g.add(m); return m;
  };
  // outside: the four printed faces and the bottom
  plane(W, H, F('front'), [0, H / 2, D / 2], [0, 0, 0], 'front');
  plane(W, H, F('back'), [0, H / 2, -D / 2], [0, P, 0], 'back');
  plane(D, H, F('right'), [W / 2, H / 2, 0], [0, P / 2, 0], 'right');
  plane(D, H, F('left'), [-W / 2, H / 2, 0], [0, -P / 2, 0], 'left');
  plane(W, D, rt.foldMat, [0, .02 * S, 0], [P / 2, 0, 0]);
  // inside: plain paper, and the turned-in top band (the printed side, folded in)
  const tb = B.top * S, ih = H - tb;
  for (const [w, pos, ry] of [[W, [0, 0, D / 2 - T], P], [W, [0, 0, -D / 2 + T], 0], [D, [W / 2 - T, 0, 0], -P / 2], [D, [-W / 2 + T, 0, 0], P / 2]]) {
    plane(w - 2 * T, ih, rt.innerMat, [pos[0], ih / 2, pos[2]], [0, ry, 0], null, true);
    plane(w - 2 * T, tb, rt.foldMat, [pos[0], H - tb / 2, pos[2]], [0, ry, 0]);
  }
  plane(W - 2 * T, D - 2 * T, rt.innerMat, [0, T, 0], [-P / 2, 0, 0], null, true);
  // the creases of the gussets: down the middle to the bottom folds, which open into a peak at the foot
  const lines = [], k = .25 * S;
  for (const sx of [1, -1]) {
    const x = sx * (W / 2 + k), apex = Math.min(D / 2, H * .4);
    lines.push([x, H, 0, x, apex, 0], [x, apex, 0, x, 0, D / 2], [x, apex, 0, x, 0, -D / 2]);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines.flat(), 3));
  rt.pbLineMat ??= new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: .22 });
  const ls = new THREE.LineSegments(lg, rt.pbLineMat); ls.raycast = () => {}; g.add(ls);
  if (!B.handles) return;
  // the handles: a strip bent into a U standing above the top edge, its feet glued inside under the turn-in
  const hw = B.hw * S, hh = B.hh * S, sp = B.span * S, foot = Math.min(tb, 30 * S) * .9, x0 = sp / 2 + hw / 2, x1 = sp / 2 - hw / 2;
  const sh = new THREE.Shape([new THREE.Vector2(-x0, H - foot), new THREE.Vector2(-x1, H - foot), new THREE.Vector2(-x1, H + hh - hw), new THREE.Vector2(x1, H + hh - hw),
    new THREE.Vector2(x1, H - foot), new THREE.Vector2(x0, H - foot), new THREE.Vector2(x0, H + hh), new THREE.Vector2(-x0, H + hh)]);
  rt.pbHandleMat ??= new THREE.MeshStandardMaterial({ roughness: .9, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
  for (const z of [D / 2 - 2 * T, -D / 2 + 2 * T]) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), rt.pbHandleMat); m.position.z = z; m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, face: null }; g.add(m);
  }
}
/* the handle's paper: the bag's own, a shade darker (the strip is folded double) */
function paperBagColors(o, rt) {
  if (rt.pbHandleMat) rt.pbHandleMat.color.copy(rt.foldMat.color).multiplyScalar(.94);
}
function pbNet(o) {
  const B = pbDims(o), { w, h, d, top, glue, bot } = B, y = top;
  const panels = [
    { key: 'front', x: 0, y, w, h }, { key: 'right', x: w, y, w: d, h }, { key: 'back', x: w + d, y, w, h }, { key: 'left', x: 2 * w + d, y, w: d, h },
    { key: 'turn', blank: 'отворот внутрь', x: 0, y: 0, w: 2 * w + 2 * d, h: top }, { key: 'base', blank: 'дно (складывается)', x: 0, y: y + h, w: 2 * w + 2 * d, h: bot },
    { key: 'glue', blank: 'клей', x: 2 * w + 2 * d, y: 0, w: glue, h: top + h + bot }];
  return { pb: true, W: 2 * w + 2 * d + glue, H: top + h + bot, panels };
}
/* the die in SVG: the sheet's cut outline, the creases (panels, gussets' middles, turn-in, bottom and the gussets'
   bottom folds), where the handles are glued (on the back of the turn-in) */
function paperBagSVG(o, n, f, label) {
  const B = pbDims(o), { w, h, d, top } = B, X = 2 * w + 2 * d, yb = top + h;
  const CUT = 'stroke="#00a0e3" stroke-width="0.3"', FOLD = 'stroke="#e6007e" stroke-width="0.3" stroke-dasharray="2 1.2"';
  const line = (l, st) => `<line x1="${f(l[0])}" y1="${f(l[1])}" x2="${f(l[2])}" y2="${f(l[3])}" ${st}/>`;
  let body = `<rect x="0" y="0" width="${f(n.W)}" height="${f(n.H)}" fill="none" ${CUT}/>`;
  const folds = [[0, top, X, top], [0, yb, X, yb]];
  for (const x of [w, w + d, 2 * w + d, X]) folds.push([x, 0, x, n.H]);
  for (const gx of [w, 2 * w + d]) { const c = gx + d / 2, a = yb - Math.min(d / 2, h * .4); folds.push([c, 0, c, n.H], [gx, yb, c, a], [gx + d, yb, c, a]); }
  body += folds.map(l => line(l, FOLD)).join('');
  // the bottom flaps are cut apart at the corners of the gussets
  for (const x of [w, w + d, 2 * w + d]) body += line([x, yb + 4, x, n.H], CUT);
  if (B.handles) for (const px of [0, w + d]) for (const s of [-1, 1]) {
    const cx = px + w / 2 + s * B.span / 2, gh = Math.min(top, 30) * .9;
    body += `<rect x="${f(cx - B.hw / 2)}" y="${f(top - gh)}" width="${f(B.hw)}" height="${f(gh)}" fill="#f39200" fill-opacity="0.12" stroke="#f39200" stroke-width="0.3" stroke-dasharray="1 1"/>`;
  }
  for (const p of n.panels) body += p.blank ? `<text x="${f(p.x + p.w / 2)}" y="${f(p.y + p.h / 2)}" font-family="Arial, sans-serif" font-size="${f(Math.max(2.5, Math.min(p.w, p.h) * .18))}" fill="#9a9a9a" text-anchor="middle" dominant-baseline="middle"${p.h > p.w * 2 ? ` transform="rotate(-90 ${f(p.x + p.w / 2)} ${f(p.y + p.h / 2)})"` : ''}>${esc(p.blank.toUpperCase())}</text>` : label(p);
  return body;
}

export { PB_KEYS, buildPaperBag, defaultPaperBag, paperBagColors, paperBagSVG, pbDims, pbNet };
