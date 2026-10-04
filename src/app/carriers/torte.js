// Тортница: непрозрачное дно и прозрачная крышка из ПЭТ

PRESETS.push(
  // cake containers: w = base diameter, h = total height; the lid diameter and the base height are their own settings
  { id: 'torte207', label: 'Тортница T-207, ⌀237×110', type: 'torte', dims: { w: 237, h: 110, d: 237 }, finish: 'matte', edge: '#ffffff', thick: .3, board: '#ffffff', grain: 0, torte: { lidD: 208, baseH: 18, lidR: 12, color: '#b8893a', fin: 'metal' } },
  { id: 'torte18', label: 'Тортница T-18, ⌀180×103', type: 'torte', dims: { w: 180, h: 103, d: 180 }, finish: 'matte', edge: '#ffffff', thick: .3, board: '#ffffff', grain: 0, torte: { lidD: 158, baseH: 15, lidR: 10, color: '#b8893a', fin: 'metal' } },
);
const TORTE_COLORS = [['#b8893a', 'Золото'], ['#c3c7cc', 'Серебро'], ['#1d1d1f', 'Чёрное'], ['#f4f4f1', 'Белое'], ['#7a1f2b', 'Бордо']];
const TORTE_FIN = { metal: 'Металлик', gloss: 'Глянцевый цветной ПЭТ', clear: 'Прозрачный ПЭТ' };
const applyTortePreset = (o, p) => Object.assign(o, { lidD: p.torte.lidD, baseH: p.torte.baseH, lidR: p.torte.lidR, lidDraft: .03, baseColor: p.torte.color, baseFin: p.torte.fin, lid: 0 });
/* ---------- cake container (тортница) ----------
   Two thermoformed PET parts: an opaque base (a shallow tray with a channel, a wide flange and a lip) and a
   clear lid that stands in the channel: a near-cylinder with a slight draft, a rounded shoulder and a flat top.
   dims.w = base diameter, dims.h = total height; o.lidD = lid diameter at the bottom, o.baseH = height of the base. */
function torteGeom(o) {
  const D = o.dims.w, R = D / 2, H = o.dims.h;
  const hb = clamp(o.baseH ?? D * .07, 8, Math.min(40, H * .45));
  const Dl = clamp(o.lidD ?? D * .88, D * .5, D - 8), Rl = Dl / 2;
  const y1 = hb + 5, rs = clamp(o.lidR ?? Rl * .12, 2, Math.min(40, Rl * .5, (H - y1) * .5));
  const yS = H - rs, Rs = Math.max(rs + 5, Rl - clamp(o.lidDraft ?? .03, 0, .15) * (yS - y1)), Rt = Rs - rs;
  return { D, R, H, hb, Rl, y1, rs, yS, Rs, Rt, rW: y => Rl + (Rs - Rl) * (y - y1) / (yS - y1) };
}
/* outer outline of the closed container, from the base lip up over the lid to the centre of its top */
function torteEnvelope(G) {
  const { R, hb, Rl, y1, rs, yS, Rs, Rt, H } = G, key = [];
  for (const p of [[R, .8], [R, hb - 2.5], [R - .6, hb - .8], [R - 2.5, hb], [Rl + 2.6, hb]]) key.push([...p, 'base']);
  for (const p of [[Rl + 1.2, hb], [Rl + 1.2, hb + 2.5], [Rl + .2, hb + 4], [Rl, y1], [Rs, yS]]) key.push([...p, 'lid']);
  for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI / 2; key.push([Rt + rs * Math.cos(a), yS + rs * Math.sin(a), 'lid']); }
  key.push([0, H, 'lid']);
  // even samples (≤ 1 mm) with the outward normal of their segment in (r, y)
  const out = [];
  for (let i = 0; i < key.length - 1; i++) {
    const [r0, y0, , ] = key[i], [r1, y1_, part] = key[i + 1], n = Math.max(1, Math.ceil(Math.hypot(r1 - r0, y1_ - y0)));
    const l = Math.hypot(r1 - r0, y1_ - y0) || 1, nr = (y1_ - y0) / l, ny = -(r1 - r0) / l;
    for (let j = i ? 1 : 0; j <= n; j++) out.push({ r: r0 + (r1 - r0) * j / n, y: y0 + (y1_ - y0) * j / n, part, nr, ny });
  }
  return out;
}
function torteProfiles(G) {
  const { R, hb, Rl, y1, rs, yS, Rs, Rt, H } = G, V2 = (x, y) => new THREE.Vector2(x, y);
  // base: floor with two decorative rings, the channel the lid stands in, flange, lip
  const base = [V2(0, 3)];
  for (const rr of [.3, .55]) { const c = (Rl - 6) * rr; base.push(V2(c - 4, 3), V2(c - 2, 4.4), V2(c + 2, 4.4), V2(c + 4, 3)); }
  base.push(V2(Rl - 5, 3), V2(Rl - 4, hb - 1), V2(Rl - 2.5, hb), V2(Rl - .6, hb - 4.6), V2(Rl + 2.6, hb - 4.6), V2(Rl + 3.4, hb),
    V2(R - 2.5, hb), V2(R - .6, hb - .8), V2(R, hb - 2.5), V2(R, .8), V2(R - .8, 0));
  const lid = [V2(Rl + 1.2, hb - 4), V2(Rl + 1.2, hb + 2.5), V2(Rl + .2, hb + 4), V2(Rl, y1), V2(Rs, yS)];
  for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI / 2; lid.push(V2(Rt + rs * Math.cos(a), yS + rs * Math.sin(a))); }
  lid.push(V2(0, H));
  return { base, lid };
}
function buildTorte(o, rt) {
  const G = torteGeom(o), g = rt.group, F = k => rt.faces[k].mat, pr = torteProfiles(G);
  rt.baseMat ??= new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
  const flip = pts => pts.map(p => new THREE.Vector2(p.x * S, p.y * S));
  const base = new THREE.Mesh(new THREE.LatheGeometry(flip(pr.base), 144), o.baseFin === 'clear' ? rt.petMat : rt.baseMat);
  base.castShadow = o.baseFin !== 'clear'; base.receiveShadow = true; base.userData = { objId: o.id, face: null }; g.add(base);
  const lg = new THREE.Group(); g.add(lg); rt.torteLid = lg;
  const shell = new THREE.Mesh(new THREE.LatheGeometry(flip(pr.lid), 144), rt.petMat); shell.raycast = () => {}; lg.add(shell);
  for (const [r, y] of [[G.Rl + 1.2, G.hb + 2.5], [G.Rl, G.y1], [G.Rs, G.yS], [G.Rt, G.H]]) {
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 145 }, (_, i) => { const t = i / 144 * Math.PI * 2; return new THREE.Vector3(r * Math.sin(t) * S, y * S, r * Math.cos(t) * S); })), rt.petEdgeMat);
    ring.raycast = () => {}; ring.renderOrder = 4; lg.add(ring);
  }
  // print on the lid: the wall (u around, seam at the back, as on a cup) and the flat top
  const nu = 160, nv = 12, P = [], N = [], UV = [], I = [], lift = .06, sl = (G.Rl - G.Rs) / Math.hypot(G.Rl - G.Rs, G.yS - G.y1), cl = Math.sqrt(1 - sl * sl);
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, y = G.y1 + (G.yS - G.y1) * v, r = G.rW(y) + lift;
    for (let i = 0; i <= nu; i++) { const u = i / nu, th = Math.PI + u * Math.PI * 2, sn = Math.sin(th), cs = Math.cos(th); P.push(r * sn * S, y * S, r * cs * S); N.push(cl * sn, sl, cl * cs); UV.push(u, v); }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; I.push(a, b, d, a, d, c); }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); wg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); wg.setIndex(I);
  const wall = new THREE.Mesh(wg, F('lidWrap')); wall.userData = { objId: o.id, face: 'lidWrap' }; wall.renderOrder = 3; lg.add(wall);
  const tg = new THREE.CircleGeometry(G.Rt * S, 96); tg.rotateX(-Math.PI / 2); tg.translate(0, (G.H + lift) * S, 0);
  const top = new THREE.Mesh(tg, F('top')); top.userData = { objId: o.id, face: 'top' }; top.renderOrder = 3; lg.add(top);
}
/* sticker film on the container. Each column of the sticker follows the section of the solid cut by a plane
   parallel to the meridian through the sticker's anchor; along it the sticker keeps its length, over the
   shoulder onto the top, or down over the base flange and lip. On the flat top this is exact, on the wall
   the horizontal size is wrapped back to arc length. */
function torteSample(o, rt, st, ew, eh, nx, ny, P, Nn, own, sup, lift) {
  const G = torteGeom(o), env = torteEnvelope(G), I4 = new THREE.Matrix4(), V = () => new THREE.Vector3();
  const parts = { lid: { parent: rt.torteLid, pinv: I4, n: null }, base: { parent: rt.group, pinv: I4, n: null } };
  const r = st.rot * DEG, cs = Math.cos(r), sn = Math.sin(r);
  let er, ea, rho0, y0, wrap = 0;
  if (st.face === 'top') {
    const [tw, th] = faceMM(o, 'top'), x0 = st.x * tw - tw / 2, z0 = st.y * th - th / 2;
    rho0 = Math.hypot(x0, z0); er = rho0 > 1e-3 ? new THREE.Vector3(x0 / rho0, 0, z0 / rho0) : new THREE.Vector3(0, 0, 1); y0 = G.H;
  } else {
    const t = Math.PI + st.x * Math.PI * 2; er = new THREE.Vector3(Math.sin(t), 0, Math.cos(t));
    y0 = G.y1 + (1 - st.y) * (G.yS - G.y1); rho0 = G.rW(y0); wrap = rho0;
  }
  ea = new THREE.Vector3(er.z, 0, -er.x);   // to the right as seen from outside
  // sticker (sx, sy) → column offset a (tangential) and distance b along the section, b > 0 away from the top
  const ab = (sx, sy) => {
    if (st.face === 'top') { const dx = cs * sx - sn * sy, dz = sn * sx + cs * sy; return [dx * ea.x + dz * ea.z, dx * er.x + dz * er.z]; }
    const a = cs * sx - sn * sy; return [wrap * Math.sin(clamp(a / wrap, -Math.PI / 2, Math.PI / 2)), sn * sx + cs * sy];
  };
  const AB = []; let amin = Infinity, amax = -Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q = ab(-ew / 2 + ew * i / (nx - 1), -eh / 2 + eh * j / (ny - 1)); AB.push(q); amin = Math.min(amin, q[0]); amax = Math.max(amax, q[0]); }
  // one section per bin of a: far half up over the top, then the near half down. The film is laid along the
  // section after it is pulled taut (radius rb), so it keeps its length where it bridges an inner corner
  const tn = clamp(st.tension ?? .5, 0, 1), rb = .3 + 15 * tn * tn;
  const nb = clamp(Math.ceil((amax - amin) / 1.5), 2, 96), bins = [];
  for (let b = 0; b <= nb; b++) {
    const a = amin + (amax - amin) * b / nb, pts = [];
    for (let k = 0; k < env.length; k++) if (env[k].r > Math.abs(a)) pts.push({ rho: -Math.sqrt(env[k].r ** 2 - a * a), k });
    for (let k = env.length - 1; k >= 0; k--) if (env[k].r > Math.abs(a)) pts.push({ rho: Math.sqrt(env[k].r ** 2 - a * a), k });
    for (const p of pts) p.y = env[p.k].y;
    tautSection(pts, rb);
    let L = 0, best = Infinity, Lref = 0;
    pts.forEach((p, i) => {
      if (i) { const q = pts[i - 1], dl = Math.hypot(p.rho - q.rho, p.y - q.y); L += dl; p.L = L;
        // where the reference row (through the anchor) crosses this section
        const t = dl ? clamp(((rho0 - q.rho) * (p.rho - q.rho) + (y0 - q.y) * (p.y - q.y)) / (dl * dl), 0, 1) : 0, d = Math.hypot(q.rho + (p.rho - q.rho) * t - rho0, q.y + (p.y - q.y) * t - y0);
        if (d < best) { best = d; Lref = q.L + dl * t; }
      } else p.L = 0;
    });
    bins.push({ a, pts, Lref });
  }
  const at = (bin, b) => {
    const { pts } = bin, L = bin.Lref + b; if (pts.length < 2 || L < 0 || L > pts[pts.length - 1].L) return null;
    let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].L < L) lo = m; else hi = m; }
    const p = pts[lo], q = pts[hi], t = (L - p.L) / ((q.L - p.L) || 1), rho = p.rho + (q.rho - p.rho) * t, y = p.y + (q.y - p.y) * t, e = env[Math.max(p.k, q.k)];
    const pos = V().addScaledVector(er, rho).addScaledVector(ea, bin.a); pos.y = y;
    // outward normal of the (taut) section: the tangent turned a quarter
    const tr = q.rho - p.rho, ty = q.y - p.y, tl = Math.hypot(tr, ty) || 1;
    return { pos, n: V().addScaledVector(er, -ty / tl).add(V().set(0, tr / tl, 0)).normalize(), part: e.part };
  };
  for (let k = 0; k < AB.length; k++) {
    const [a, b] = AB[k], f = (amax - amin) > 1e-9 ? (a - amin) / (amax - amin) * nb : 0, i0 = Math.min(nb - 1, Math.floor(f)), t = f - i0;
    const p0 = at(bins[i0], b), p1 = at(bins[Math.min(nb, i0 + 1)], b), h = p0 && p1 ? null : p0 || p1;
    if (!p0 && !p1) { P[k] = V(); Nn[k] = V().set(0, 1, 0); own[k] = parts.lid; sup[k] = false; continue; }
    const pos = h ? h.pos : p0.pos.clone().lerp(p1.pos, t), n = h ? h.n : p0.n.clone().lerp(p1.n, t).normalize(), part = parts[(h || (t < .5 ? p0 : p1)).part];
    P[k] = pos.addScaledVector(n, lift); Nn[k] = n; own[k] = part; sup[k] = true;
    if (!part.n) part.n = n.clone();
  }
  for (const p of Object.values(parts)) p.n ??= new THREE.Vector3(0, 1, 0);
}
/* a section (ρ, y points in order, solid on the inner side) pulled taut like a film with tension: a ball of
   radius r rolled along the outside; points it cannot reach (inner corners) move onto the ball's arc */
function tautSection(pts, r) {
  const n = pts.length; if (r < .35 || n < 3) return;
  const cx = new Float64Array(n), cy = new Float64Array(n), ok = new Uint8Array(n), s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i].rho - pts[i - 1].rho, pts[i].y - pts[i - 1].y);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], tr = b.rho - a.rho, ty = b.y - a.y, l = Math.hypot(tr, ty) || 1;
    cx[i] = pts[i].rho - ty / l * r; cy[i] = pts[i].y + tr / l * r;
  }
  // only points close along the section can be close in space here (a concave corner spans about 2r)
  const span = 3 * r + 2, r2 = (r - .02) ** 2;
  let j0 = 0;
  for (let i = 0; i < n; i++) {
    while (s[i] - s[j0] > span) j0++;
    let free = 1;
    for (let j = j0; j < n && s[j] - s[i] <= span; j++) { const dx = pts[j].rho - cx[i], dy = pts[j].y - cy[i]; if (dx * dx + dy * dy < r2) { free = 0; break; } }
    ok[i] = free;
  }
  const moved = [];
  j0 = 0;
  for (let i = 0; i < n; i++) {
    while (s[i] - s[j0] > span) j0++;
    if (ok[i]) continue;
    let best = Infinity, bq = -1;
    for (let q = j0; q < n && s[q] - s[i] <= span; q++) { if (!ok[q]) continue; const d = (pts[i].rho - cx[q]) ** 2 + (pts[i].y - cy[q]) ** 2; if (d < best) { best = d; bq = q; } }
    if (bq < 0) continue;
    const d = Math.sqrt(best); if (d < 1e-9 || d - r >= r) continue;
    moved.push([i, cx[bq] + (pts[i].rho - cx[bq]) * r / d, cy[bq] + (pts[i].y - cy[bq]) * r / d]);
  }
  for (const [i, rho, y] of moved) { pts[i].rho = rho; pts[i].y = y; }
}
