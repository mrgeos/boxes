// Слои печати через рёбра: часть слоя на соседних гранях, перенос слоя на другую грань
import { DEG } from '../core/util.js';
import { faceKeys, faceMM, facePx } from '../core/model.js';
import { RT } from '../scene/renderer.js';
import { placementsAt } from '../stickers/placement.js';
import { layerBox } from './render.js';

/* A layer with `wrap` on keeps printing past its face's edges: the parts beyond land on the faces next to
   it, folded over the edge the way a sticker is (stickers/placement.js), and each face draws its part.
   A face that lies over the layer's own face (a flap over a wall, a lid over the base) does not take it:
   the print under a flap must not show through on the flap. Affine maps are canvas-style [a, b, c, d, e, f]:
   x' = a x + c y + e, y' = b x + d y + f, in mm of the faces. */
const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
function inv(M) { const [a, b, c, d, e, f] = M, k = a * d - b * c; return [d / k, -b / k, -c / k, a / k, (c * f - d * e) / k, (b * e - a * f) / k]; }
const apply = (M, [x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
const canWrap = L => !!L.wrap && L.visible && !(L.type === 'image' && L.tile);

/* the layer on its face, mm: centre and size */
function layerMM(o, k, L) {
  const [mw, mh] = faceMM(o, k), [W, H] = facePx(o, k), ppm = W / mw, [w, h] = layerBox(L, W, H);
  return { cx: L.x * mw, cy: L.y * mh, w: w / ppm, h: h / ppm };
}
/* a face that covers face A from the front (parallel, a little in front of it) */
function covers(fr, A, F) { return fr && fr[A] && fr[F] && fr[F].n.dot(fr[A].n) > .99 && fr[F].c.clone().sub(fr[A].c).dot(fr[A].n) > .2; }
/* the edge of face A towards face F (at right angles) is under a face that covers A, like the top of the base's
   wall under a lid: the print there is hidden, and must not come out on the far side of the cover */
function hiddenEdge(fr, A, F) {
  const a = fr?.[A], f = fr?.[F]; if (!a || !f || Math.abs(f.n.dot(a.n)) > .03) return false;
  const toF = f.n.clone().multiplyScalar(Math.sign(f.c.clone().sub(a.c).dot(f.n)) || 1);
  const e = a.c.clone().addScaledVector(toF, Math.abs(a.u.dot(toF)) * a.w / 2 + Math.abs(a.v.dot(toF)) * a.h / 2);
  return Object.keys(fr).some(k => {
    const c = fr[k]; if (k === A || !c?.n || c.n.dot(a.n) < .99 || c.c.clone().sub(a.c).dot(a.n) <= .2) return false;
    const d = e.clone().sub(c.c);
    return Math.abs(d.dot(c.u)) <= c.w / 2 + .5 && Math.abs(d.dot(c.v)) <= c.h / 2 + .5;
  });
}
/* a face lying just behind face A (a flap tucked behind a wall, the base under a lid): where A covers it, it
   takes nothing, only the part of the layer that runs on beyond A's outline. A's outline in that face's mm */
function behind(fr, A, F) {
  const a = fr?.[A], f = fr?.[F]; if (!a || !f || f.n.dot(a.n) < .99) return null;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const d = a.c.clone().addScaledVector(a.u, sx * a.w / 2).addScaledVector(a.v, sy * a.h / 2).sub(f.c);
    return [d.dot(f.u) + f.w / 2, f.h / 2 - d.dot(f.v)];
  });
}
/* the other faces a wrapping layer reaches: for each, the map from its own face's mm to that face's mm */
function layerReach(o, k, L) {
  if (!canWrap(L)) return [];
  const m = layerMM(o, k, L), pls = placementsAt(o, k, L.x, L.y, L.rot, Math.hypot(m.w, m.h) / 2 + 1, true);
  const own = pls.find(p => p.key === k); if (pls.length < 2 || !own) return [];
  const back = inv(own.M), fr = RT.get(o.id)?.frames, keys = faceKeys(o), out = [];
  for (const p of pls) {
    if (p.key === k || !keys.includes(p.key) || covers(fr, k, p.key) || hiddenEdge(fr, k, p.key)) continue;
    // only where some of the layer's rectangle really is on that face
    const [fw, fh] = faceMM(o, p.key), cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => apply(p.M, [sx * m.w / 2, sy * m.h / 2]));
    const x0 = Math.min(...cs.map(c => c[0])), x1 = Math.max(...cs.map(c => c[0])), y0 = Math.min(...cs.map(c => c[1])), y1 = Math.max(...cs.map(c => c[1]));
    if (x1 < .2 || y1 < .2 || x0 > fw - .2 || y0 > fh - .2) continue;
    out.push({ key: p.key, G: mul(p.M, back), clips: p.clips, hole: behind(fr, k, p.key) });
  }
  return out;
}
/* the parts of other faces' layers that face k prints: { L, from, z (its place in its own face's stack), G, clip } */
function wrapsOnto(o, k) {
  const out = [];
  for (const from of faceKeys(o)) {
    if (from === k) continue;
    (o.faces[from]?.layers || []).forEach((L, z) => { for (const r of layerReach(o, from, L)) if (r.key === k) out.push({ L, from, z, G: r.G, clip: clipPolygon(o, k, r.clips), hole: r.hole }); });
  }
  return out;
}
/* the face's rectangle (mm) cut by the half-spaces an inner corner leaves it (object space planes) */
function clipPolygon(o, k, clips) {
  const F = RT.get(o.id)?.frames?.[k]; if (!F || !clips?.length) return null;
  const [w, h] = [F.w, F.h];
  let poly = [[0, 0], [w, 0], [w, h], [0, h]];
  for (const cl of clips) {
    // keep where sign * (n · p - d) >= 0, p = c + u (x - w/2) + v (h/2 - y)
    const nu = cl.n.dot(F.u), nv = cl.n.dot(F.v), k0 = cl.n.dot(F.c) - cl.d - nu * w / 2 + nv * h / 2;
    const side = ([x, y]) => cl.sign * (nu * x - nv * y + k0), out = [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], a = side(p), b = side(q);
      if (a >= 0) out.push(p);
      if ((a >= 0) !== (b >= 0)) { const t = a / (a - b); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    });
    poly = out; if (poly.length < 3) return [];
  }
  return poly;
}
/* draws a part of another face's layer into a canvas of face k (W px wide): `draw(ctx, L, W, H)` paints
   the layer the way its own face does, in that face's pixels */
function drawWrapped(ctx, o, k, item, W, draw) {
  const [mw] = faceMM(o, k), tp = W / mw, [sW, sH] = facePx(o, item.from), sp = sW / faceMM(o, item.from)[0];
  ctx.save();
  const path = (pts, start = true) => { if (start) ctx.beginPath(); pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x * tp, y * tp)); ctx.closePath(); };
  if (item.clip) { if (item.clip.length < 3) { ctx.restore(); return; } path(item.clip); ctx.clip(); }
  if (item.hole) { ctx.beginPath(); ctx.rect(-1e5, -1e5, 2e5, 2e5); path(item.hole, false); ctx.clip('evenodd'); }
  const T = mul(mul([tp, 0, 0, tp, 0, 0], item.G), [1 / sp, 0, 0, 1 / sp, 0, 0]);
  ctx.transform(...T);
  draw(ctx, item.L, sW, sH);
  ctx.restore();
}

/* faces whose picture depends on face k's wrapping layers: the ones they reach now and reached before */
const reached = new Map();
function wrapTouch(o, k) {
  const id = o.id + '|' + k, before = reached.get(id) || [], now = [];
  for (const L of o.faces[k]?.layers || []) for (const r of layerReach(o, k, L)) now.push(r.key);
  if (now.length) reached.set(id, now); else reached.delete(id);
  return [...new Set([...before, ...now])];
}

/* where a point of face A (mm) is on each face it unfolds onto: maps from A's mm, for dragging a layer over edges */
function faceMaps(o, A, x, y) {
  const [aw, ah] = faceMM(o, A), keys = faceKeys(o), out = new Map();
  for (const p of placementsAt(o, A, x / aw, y / ah, 0, 4000, true)) if (keys.includes(p.key)) out.set(p.key, mul(p.M, [1, 0, 0, 1, -x, -y]));
  return out;
}
/* moves a layer from face A onto face T (G: A's mm → T's mm), keeping its size in mm and its turn on the box */
function moveLayerOnto(o, A, T, L, G) {
  const [aw, ah] = faceMM(o, A), [tw, th] = faceMM(o, T), [x, y] = apply(G, [L.x * aw, L.y * ah]);
  if (L.type === 'image') L.w = L.w * aw / tw;
  else if (L.type === 'shape') { L.w = L.w * aw / tw; L.h = L.h * ah / th; }
  else L.size = L.size * ah / th;
  const a = L.rot + Math.atan2(G[1], G[0]) / DEG;
  L.x = x / tw; L.y = y / th; L.rot = Math.round((((a + 180) % 360 + 360) % 360 - 180) * 10) / 10;
  o.faces[A].layers = o.faces[A].layers.filter(l => l !== L); o.faces[T].layers.push(L);
}

export { apply, canWrap, drawWrapped, faceMaps, inv, layerMM, layerReach, moveLayerOnto, wrapTouch, wrapsOnto };
