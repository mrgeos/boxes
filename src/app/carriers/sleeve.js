// Рукав (бандероль) вокруг коробки, в том числе с ручкой

/* ---------- sleeve ----------
   A paper band glued into a tube around a closed box (or round an open tray: a matchbox-style box).
   It goes round the box across its width (top, front, bottom, back; axis x) or across its depth (top,
   right, bottom, left; axis z). Its design is one strip: across the band = canvas x, along the band = canvas
   y, starting at the top, so the panels read top, front/right, bottom, back/left. */
const SLEEVE_AXES = { x: 'Поперёк ширины: верх, перед, дно, зад', z: 'Поперёк глубины: верх, бока, дно' };
const SLEEVE_FIN = { matte: 'Матовая бумага', gloss: 'Глянцевая ламинация', soft: 'Soft-touch', kraft: 'Крафт' };
const SLEEVE_GLUE = 15;
   // mm of glue flap on the die
const sleeveOn = o => o.type === 'box' && o.lidType !== 'handle' && !!o.sleeve?.on;
const defaultSleeveHandle = () => ({ on: false, h: 75, r: 18, rf: 10, hole: { w: 70, h: 22, y: 38, r: 11 } });
const defaultSleeve = dims => ({ on: false, axis: 'x', w: Math.round(dims.w * .5), x: 0, slide: 0, fin: 'matte', handle: defaultSleeveHandle() });
/* the closed box's outline the sleeve wraps (mm): x half width, z front/back, y top */
function boxEnvelope(o) {
  const { w, h, d } = o.dims, t = clamp(o.thickness, .3, Math.min(w, h, d) / 4), lt = o.lidType || 'flat';
  let hx = w / 2, zf = d / 2, zb = -d / 2, top = h;
  if (lt === 'flat' || lt === 'tuck') top = h + t;
  if (lt === 'flap') { hx = w / 2 + t + .3; zf = d / 2 + t + .3; top = h + t; }
  if (lt === 'telescope') {
    if (o.lidMat === 'clear') {
      const LH = clamp(o.lidH, 3, 1000);
      if (o.lidFit === 'inside') top = Math.max(h, t + LH); else { hx = w / 2 + .9; zf = d / 2 + .9; zb = -zf; top = Math.max(h + .3, LH); }
    } else { hx = w / 2 + t + .5; zf = d / 2 + t + .5; zb = -zf; top = h + t; }
  }
  return { hx, zf, zb, top };
}
function sleeveDims(o) {
  const E = boxEnvelope(o), S0 = o.sleeve || {}, g = .45, st = .3, ax = S0.axis === 'z' ? 'z' : 'x';
  // the cross-section the band goes round, and the length of the box along the band's axis
  const y0 = -g, y1 = E.top + g, a0 = ax === 'x' ? E.zb - g : -E.hx - g, a1 = ax === 'x' ? E.zf + g : E.hx + g;
  const len = ax === 'x' ? 2 * E.hx : E.zf - E.zb, mid = ax === 'x' ? 0 : (E.zf + E.zb) / 2;
  const bw = clamp(S0.w ?? len * .5, 10, len + 2 * g), c = mid + clamp(S0.x || 0, -(len - bw) / 2 - g, (len - bw) / 2 + g);
  const A = a1 - a0, Hh = y1 - y0;
  // a carry handle: the band rises from the middle of the top in two layers and comes down again
  const hh = S0.handle?.on ? clamp(S0.handle.h ?? 70, 15, 300) : 0;
  // where the band turns up into the handle it bends round a radius rf instead of folding sharp
  const rf = hh ? clamp(S0.handle.rf ?? 10, 0, Math.min(hh * .4, A / 2 * .4)) : 0, q = Math.PI * rf / 2;
  const names = hh ? ['topA', 'handleA', 'handleB', 'topB', ...(ax === 'x' ? ['front', 'bottom', 'back'] : ['right', 'bottom', 'left'])]
    : ax === 'x' ? ['top', 'front', 'bottom', 'back'] : ['top', 'right', 'bottom', 'left'];
  const lens = hh ? [A / 2 - rf + q / 2, hh - rf + q / 2, hh - rf + q / 2, A / 2 - rf + q / 2, Hh, A, Hh] : [A, Hh, A, Hh], stops = [0];
  for (const l of lens) stops.push(stops[stops.length - 1] + l);
  const P = stops[stops.length - 1];
  // along the band: top straight to sT1, bend to sA0, leaf up to the fold sF, leaf down to sB0, bend to sT2
  const sT1 = A / 2 - rf, sA0 = sT1 + q, sF = sA0 + hh - rf, sB0 = sF + hh - rf, sT2 = sB0 + q;
  return { ax, y0, y1, a0, a1, am: (a0 + a1) / 2, A, Hh, P, bw, c, len, names, lens, stops, st, E, hh, rf, sT1, sA0, sF, sB0, sT2, leaf: hh ? sleeveLeaf(S0.handle, bw, hh, rf) : null };
}
/* the handle leaf of a sleeve (mm, x across the band from its centre, y up from the top of the box): the
   outline's top corners are rounded, the hand hole sits y above the box */
function sleeveLeaf(H, bw, hh, rf = 0) {
  const r = clamp(H.r ?? 18, 0, Math.min(bw / 2, hh - rf) - .5), hl = H.hole || {};
  const hw = clamp(hl.w ?? bw * .55, 0, bw - 8), hhh = clamp(hl.h ?? 22, 0, hh - rf - 6), lo = Math.max(3, rf + 2), hy = clamp(hl.y ?? hh - hhh - 14, lo, Math.max(lo, hh - hhh - 3)), hr = clamp(hl.r ?? hhh / 2, 0, Math.min(hw, hhh) / 2);
  // the flat leaf starts where the bend ends, rf above the box
  const P = Math.PI, outer = [[bw / 2, rf], ...arcPts(bw / 2 - r, hh - r, r, 0, P / 2), ...arcPts(-bw / 2 + r, hh - r, r, P / 2, P), [-bw / 2, rf]];
  const hole = hw > 1 && hhh > 1 ? rrPoly(-hw / 2, hy, hw / 2, hy + hhh, hr, hr).map(v => [v.x, v.y]) : null;
  // half width of the leaf at height y (the outline narrows only in the rounded corners)
  const half = y => y <= hh - r ? bw / 2 : bw / 2 - r + Math.sqrt(Math.max(0, r * r - (y - hh + r) ** 2));
  return { r, outer, hole, half };
}
const SLEEVE_PANEL = { top: 'верх', front: 'перед', bottom: 'дно', back: 'зад', right: 'правый бок', left: 'левый бок' };
const sleevePanelLabel = (SD, k) => k === 'topA' ? `верх: ${SD.ax === 'x' ? 'задняя' : 'левая'} половина` : k === 'topB' ? `верх: ${SD.ax === 'x' ? 'передняя' : 'правая'} половина`
  : k === 'handleA' ? `ручка: ${SD.ax === 'x' ? 'задняя' : 'левая'} сторона` : k === 'handleB' ? `ручка: ${SD.ax === 'x' ? 'передняя' : 'правая'} сторона` : SLEEVE_PANEL[k];
/* the sleeve on the sheet: canvas mm (x across, y along the band from its start), as the outline with the
   handle's rounded corners, the hand holes and the creases */
function sleeveSheet(SD) {
  const { bw, P, stops, leaf, hh } = SD;
  if (!leaf) return { outline: null, holes: [], creases: stops.slice(1, -1).map(s => [0, s, bw, s]) };
  const { rf, sA0, sF } = SD, N = 16, up = y => sA0 + y - rf, down = y => sF + hh - y, side = sg => {
    const pts = [];
    for (let i = 0; i <= N; i++) { const y = rf + (hh - rf) * i / N; pts.push([bw / 2 + sg * leaf.half(y), up(y)]); }
    for (let i = N - 1; i >= 0; i--) { const y = rf + (hh - rf) * i / N; pts.push([bw / 2 + sg * leaf.half(y), down(y)]); }
    return pts;
  };
  const L = side(-1), R = side(1).reverse();
  const outline = [[0, 0], ...L, [0, P + SLEEVE_GLUE], [bw, P + SLEEVE_GLUE], ...R, [bw, 0]];
  const holes = leaf.hole ? [leaf.hole.map(([x, y]) => [bw / 2 + x, up(y)]), leaf.hole.map(([x, y]) => [bw / 2 + x, down(y)])] : [];
  const fold = leaf.half(hh);
  // the bends at the handle's foot are soft (no crease); the fold at its top is narrowed by the corners
  const creases = stops.slice(1, -1).flatMap((s, i) => i === 0 || i === 2 ? (rf > .5 ? [] : [[0, s, bw, s]]) : i === 1 ? [[bw / 2 - fold, s, bw / 2 + fold, s]] : [[0, s, bw, s]]);
  return { outline, holes, creases };
}
function buildSleeve(o, rt) {
  rt.sleeve = null;
  if (!sleeveOn(o)) return;
  const D = sleeveDims(o), g = new THREE.Group(), st = D.st;
  sleeveColors(o, rt);
  // map (along-axis b, section a, y) to box space; across the band runs to the right as seen from the front (x) / right (z)
  const X = (b, a, y) => D.ax === 'x' ? [b, y, a] : [a, y, b];
  const b0 = D.c - D.bw / 2, b1 = D.c + D.bw / 2, mat = rt.faces.sleeve.mat, [L, R] = D.ax === 'x' ? [b0, b1] : [b1, b0];
  const toV3 = (na, ny) => new THREE.Vector3(...X(0, na, ny)).sub(new THREE.Vector3(...X(0, 0, 0))).normalize();
  const quad = (pts, uvs, m, face, outward) => {
    let geo = quadGeo(pts, uvs);
    const n = new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, 0);
    if (n.dot(outward) < 0) { geo.dispose(); geo = quadGeo([pts[0], pts[3], pts[2], pts[1]], uvs && [uvs[0], uvs[3], uvs[2], uvs[1]]); }
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; mesh.userData = { objId: o.id, face }; g.add(mesh); return mesh;
  };
  // the flat parts of the loop, as (a, y) points out by `out`, with their stretch of the band
  const gap = .2, pts = out => ({ TB: [D.a0 - out, D.y1 + out], M1: [D.am - gap - D.rf, D.y1 + out], M2: [D.am + gap + D.rf, D.y1 + out], TF: [D.a1 + out, D.y1 + out], BF: [D.a1 + out, D.y0 - out], BB: [D.a0 - out, D.y0 - out] });
  const s = D.stops, segs = D.hh ? [['TB', 'M1', s[0], D.sT1], ['M2', 'TF', D.sT2, s[4]], ['TF', 'BF', s[4], s[5]], ['BF', 'BB', s[5], s[6]], ['BB', 'TB', s[6], s[7]]]
    : [['TB', 'TF', s[0], s[1]], ['TF', 'BF', s[1], s[2]], ['BF', 'BB', s[2], s[3]], ['BB', 'TB', s[3], s[4]]];
  const O = pts(st), I = pts(0);
  for (const [k0, k1, s0, s1] of segs) {
    const [pa, py] = O[k0], [qa, qy] = O[k1], [ia, iy] = I[k0], [ja, jy] = I[k1], v0 = 1 - s0 / D.P, v1 = 1 - s1 / D.P;
    const ta = qa - pa, ty = qy - py, tl = Math.hypot(ta, ty) || 1, out = toV3(-ty / tl, ta / tl);
    quad([X(L, pa, py), X(R, pa, py), X(R, qa, qy), X(L, qa, qy)], [[0, v0], [1, v0], [1, v1], [0, v1]], mat, 'sleeve', out);
    quad([X(L, ia, iy), X(R, ia, iy), X(R, ja, jy), X(L, ja, jy)], null, rt.sleeveIn, null, out.clone().negate());
    for (const [b, sg] of [[b0, -1], [b1, 1]]) {
      const e = new THREE.Vector3(...(D.ax === 'x' ? [sg, 0, 0] : [0, 0, sg]));
      quad([X(b, ia, iy), X(b, pa, py), X(b, qa, qy), X(b, ja, jy)], null, rt.sleeveEdge, null, e);
    }
  }
  if (D.leaf && D.rf > .3) {
    // the soft bends at the handle's foot: the band is concave there, its printed side faces the bend's centre
    const N = 10;
    for (const [sg, sa, sb] of [[-1, D.sT1, D.sA0], [1, D.sB0, D.sT2]]) {
      const ca = D.am + sg * (gap + D.rf);
      for (const [r, m, face, inward] of [[D.rf, mat, 'sleeve', 1], [D.rf + st, rt.sleeveIn, null, -1]]) {
        const cy = D.y1 + st + D.rf;
        // the arc from the top (below the centre) round to the leaf (beside it, towards the middle)
        const P0 = t => { const an = sg < 0 ? -Math.PI / 2 + t * Math.PI / 2 : -Math.PI / 2 - t * Math.PI / 2; return [ca + r * Math.cos(an), cy + r * Math.sin(an)]; };
        for (let i = 0; i < N; i++) {
          const t0 = i / N, t1 = (i + 1) / N, [pa, py] = P0(t0), [qa, qy] = P0(t1);
          const ma = (pa + qa) / 2, my = (py + qy) / 2, out = toV3(inward * (ca - ma), inward * (cy - my));
          const sv0 = sg < 0 ? sa + (sb - sa) * t0 : sb - (sb - sa) * t0, sv1 = sg < 0 ? sa + (sb - sa) * t1 : sb - (sb - sa) * t1, v0 = 1 - sv0 / D.P, v1 = 1 - sv1 / D.P;
          quad([X(L, pa, py), X(R, pa, py), X(R, qa, qy), X(L, qa, qy)], face ? [[0, v0], [1, v0], [1, v1], [0, v1]] : null, m, face, out);
        }
      }
    }
  }
  if (D.leaf) {
    // the handle: two leaves back to back standing on the middle of the top, the hand hole through both
    const sh = new THREE.Shape(D.leaf.outer.map(p => V2(...p)));
    if (D.leaf.hole) sh.holes.push(new THREE.Path(D.leaf.hole.map(p => V2(...p))));
    for (const [sg, outA] of [[-1, -1], [1, 1]]) {
      const geo = new THREE.ShapeGeometry(sh, 16), pos = geo.attributes.position, uv = geo.attributes.uv, base = D.y1 + st;
      for (let i = 0; i < pos.count; i++) {
        const xs = pos.getX(i), ys = pos.getY(i), b = D.c + xs, sp = sg < 0 ? D.sA0 + ys - D.rf : D.sF + D.hh - ys;
        uv.setXY(i, D.ax === 'x' ? (b - b0) / D.bw : (b1 - b) / D.bw, 1 - sp / D.P);
        const p = X(b, D.am + sg * gap, base + ys); pos.setXYZ(i, p[0] * S, p[1] * S, p[2] * S);
      }
      geo.computeVertexNormals();
      const want = toV3(outA, 0), n = new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, 0);
      if (n.dot(want) < 0) { geo.index.array.reverse(); geo.computeVertexNormals(); }
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, face: 'sleeve' }; g.add(m);
      const back = new THREE.Mesh(geo.clone(), rt.sleeveIn); back.geometry.index.array.reverse(); back.geometry.computeVertexNormals(); back.userData = { objId: o.id, face: null }; g.add(back);
    }
  }
  rt.sleeve = g; rt.group.add(g);
  applySleeve(o);
}
function applySleeve(o) {
  const rt = RT.get(o.id); if (!rt?.sleeve) return;
  const D = sleeveDims(o), s = clamp(o.sleeve.slide || 0, 0, D.len + D.bw) * S;
  rt.sleeve.position.set(D.ax === 'x' ? s : 0, 0, D.ax === 'z' ? s : 0);
}
function sleeveColors(o, rt) {
  rt.sleeveIn ??= new THREE.MeshStandardMaterial({ roughness: .9, side: THREE.FrontSide });
  rt.sleeveEdge ??= new THREE.MeshStandardMaterial({ roughness: .9, side: THREE.DoubleSide });
  const paper = new THREE.Color(o.faces.sleeve?.bg || '#ffffff');
  if (o.sleeve?.fin === 'kraft') paper.multiply(new THREE.Color(FINISHES.kraft.kraft));
  // the inside of the band is unprinted paper; the cut edges show the paper's colour
  rt.sleeveIn.color.copy(o.sleeve?.fin === 'kraft' ? paper : new THREE.Color('#f6f3ec')); rt.sleeveEdge.color.copy(paper).multiplyScalar(.92);
}
const faceGrain = (o, k) => k === 'sleeve' ? (o.sleeve?.fin === 'kraft' ? .45 : .06) : o.grain;
