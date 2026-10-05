// Многоугольники: объединение контуров, точка внутри, отрезки контура вне других фигур
/* Polygons are arrays of [x, y]. The outline of a union is made of the pieces of every polygon's edges that
   do not run inside another polygon: edges are split where they cross (or run along) another polygon's
   edges, the pieces whose outer side is in no other polygon are kept, pieces two polygons share are kept once,
   and the pieces are chained back into closed loops. */
const EPS = 1e-6;
const area = p => p.reduce((a, [x, y], i) => { const [X, Y] = p[(i + 1) % p.length]; return a + x * Y - X * y; }, 0) / 2;
const clean = p => {
  const q = p.filter((v, i) => { const w = p[(i + 1) % p.length]; return Math.abs(v[0] - w[0]) > EPS || Math.abs(v[1] - w[1]) > EPS; });
  return area(q) < 0 ? q.reverse() : q;   // counter-clockwise (y up): the inside is on the left of each edge
};
function inside(p, [x, y]) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
/* where two segments meet: parameters along each (proper crossings, and the ends of a stretch they share) */
function meet(a, b, c, d, out1, out2) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], den = rx * sy - ry * sx;
  const qx = c[0] - a[0], qy = c[1] - a[1], L1 = Math.hypot(rx, ry), L2 = Math.hypot(sx, sy);
  if (Math.abs(den) < EPS * L1 * L2) {
    // parallel: on one line, split each at the other's ends that fall inside it
    if (Math.abs(qx * ry - qy * rx) > EPS * L1 * Math.max(1, Math.hypot(qx, qy))) return;
    for (const p of [c, d]) { const t = ((p[0] - a[0]) * rx + (p[1] - a[1]) * ry) / (L1 * L1); if (t > EPS && t < 1 - EPS) out1.push([t, p]); }
    for (const p of [a, b]) { const t = ((p[0] - c[0]) * sx + (p[1] - c[1]) * sy) / (L2 * L2); if (t > EPS && t < 1 - EPS) out2.push([t, p]); }
    return;
  }
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return;
  const p = [a[0] + rx * t, a[1] + ry * t];
  if (t > EPS && t < 1 - EPS) out1.push([t, p]);
  if (u > EPS && u < 1 - EPS) out2.push([u, p]);
}
/* every polygon's edges cut where other polygons' edges cross them: [{ a, b, from }] in each polygon's direction */
function pieces(polys) {
  const cuts = polys.map(p => p.map(() => []));
  polys.forEach((P, i) => polys.forEach((Q, j) => {
    if (j <= i) return;
    P.forEach((a, m) => Q.forEach((c, n) => meet(a, P[(m + 1) % P.length], c, Q[(n + 1) % Q.length], cuts[i][m], cuts[j][n])));
  }));
  const out = [];
  polys.forEach((P, i) => P.forEach((a, m) => {
    const pts = [a, ...cuts[i][m].sort((s, t) => s[0] - t[0]).map(s => s[1]), P[(m + 1) % P.length]];
    for (let k = 1; k < pts.length; k++) if (Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) > EPS) out.push({ a: pts[k - 1], b: pts[k], from: i });
  }));
  return out;
}
/* a point just off the middle of a piece: to its right (outside its own polygon) or left (inside) */
const side = ({ a, b }, s, e = 1e-3) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); return [(a[0] + b[0]) / 2 + s * dy / L * e, (a[1] + b[1]) / 2 - s * dx / L * e]; };
const key = p => p[0].toFixed(4) + ',' + p[1].toFixed(4);
/* the outline of the union of polygons: closed loops (counter-clockwise), each point tagged with the polygon its
   next edge came from (loop.from[i]) */
function unionPolys(list) {
  const polys = list.map(clean).filter(p => p.length > 2);
  const keep = pieces(polys).filter(s => { const o = side(s, 1); return !polys.some((P, j) => j !== s.from && inside(P, o)); });
  const seen = new Set(), next = new Map();
  for (const s of keep) {
    const k = key(s.a) + '|' + key(s.b); if (seen.has(k)) continue; seen.add(k);
    next.set(key(s.a), [...(next.get(key(s.a)) || []), s]);
  }
  const loops = [], used = new Set();
  for (const first of keep) {
    if (used.has(first) || !next.get(key(first.a))?.includes(first)) continue;
    const loop = [], from = []; let s = first;
    while (s && !used.has(s)) {
      used.add(s); loop.push(s.a); from.push(s.from);
      s = (next.get(key(s.b)) || []).find(t => !used.has(t));
    }
    if (loop.length > 2) { loop.from = from; loops.push(loop); }
  }
  return loops;
}
/* the stretches of a closed outline whose inner side is in none of the polygons, as polylines: where a polygon
   covers the outline's inside along an edge (its edge running on the outline, or crossing it) the outline is left out */
function outlineOutside(outline, polys) {
  const P = clean(outline), others = polys.map(clean), all = pieces([P, ...others]).filter(s => s.from === 0);
  const runs = [];
  for (const s of all) {
    const i = side(s, -1), out = !others.some(Q => inside(Q, i));
    if (!out) continue;
    const last = runs.at(-1);
    if (last && key(last.at(-1)) === key(s.a)) last.push(s.b); else runs.push([s.a, s.b]);
  }
  // a run that goes on over the start of the outline joins the first one
  if (runs.length > 1 && key(runs.at(-1).at(-1)) === key(runs[0][0])) runs[0] = [...runs.pop(), ...runs[0].slice(1)];
  return runs;
}

export { area, inside, outlineOutside, unionPolys };
