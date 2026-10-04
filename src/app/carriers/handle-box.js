// Коробка для торта с ручкой: гильза, торцы с клапанами, подложка, окна, ручка

const HANDLE_KEYS = ['handleFront', 'handleBack'];
const HANDLE_SHAPES = { arch: 'Арка', rect: 'Прямоугольная с прорезью', photo: 'Рамка с широкой проймой' };
/* a handle leaf: outline w × h with top and bottom corner radii; a hand hole w × h, its bottom y above the
   bridge (0 = open at the bottom: the leaf stands on two legs) and its own corner radii */
const HANDLE_PRESETS = {
  arch: (w, h) => { const b = clamp(Math.min(w, h) * .2, 5, 25); return { rTop: Math.min(w / 2, h), rBot: 0, hole: { w: w - 2 * b, h: h - b, y: 0, rTop: Math.min(w / 2 - b, h - b), rBot: 0 } }; },
  rect: (w, h) => { const hh = clamp(h * .3, 6, 30); return { rTop: Math.min(w, h) * .18, rBot: 0, hole: { w: w * .56, h: hh, y: h * .62 - hh / 2, rTop: hh / 2, rBot: hh / 2 } }; },
  photo: (w, h) => ({ rTop: Math.min(w, h) * .3, rBot: 0, hole: { w: w * .72, h: h * .5, y: h * .2, rTop: Math.min(w, h) * .16, rBot: Math.min(w, h) * .08 } }),
};
function applyHandlePreset(H, shape) {
  const p = HANDLE_PRESETS[shape] ? HANDLE_PRESETS[shape](H.w, H.h) : HANDLE_PRESETS.arch(H.w, H.h);
  Object.assign(H, { shape, rTop: r1(p.rTop), rBot: r1(p.rBot), hole: Object.fromEntries(Object.entries(p.hole).map(([k, v]) => [k, r1(v)])) });
  return H;
}
const defaultHandle = dims => { const w = Math.round(clamp(dims.w * .45, 50, 140)); return applyHandlePreset({ on: true, w, h: Math.round(w * .52), up: true, bridge: 30 }, 'arch'); };
const defaultFrontWin = (dims) => ({ on: false, w: Math.round(dims.w * .62), h: Math.round(dims.h * .5), y: Math.round(dims.h * .52), r: 4 });
/* width (mm) of the strip across the lid window that carries the handle, 0 = none */
const bridgeMM = o => o.type === 'box' && o.lidType === 'handle' && o.handle?.on ? clamp(o.handle.bridge ?? 30, 0, 200) : 0;
/* window opening in face-canvas fractions (top-left origin); rr marks which corners are rounded */
/* window in the drop-down front wall of a handle box: size, height of its centre above the bottom, radius (mm) */
function frontWinMM(o) {
  if (o.type !== 'box' || o.lidType !== 'handle' || !o.frontWin?.on) return null;
  const [fw, fh] = faceMM(o, 'front'), f = o.frontWin, ww = clamp(f.w, 10, fw - 10), wh = clamp(f.h, 10, fh - 10);
  return { ww, wh, cy: clamp(f.y, wh / 2 + 5, fh - wh / 2 - 5), r: clamp(f.r ?? 0, 0, Math.min(ww, wh) / 2 - .5), fw, fh };
}
/* the front window carried over the front edge onto the lid as one opening (handle box): its width, the
   height of its bottom above the floor, how far it reaches back on the lid (to the bridge, else to the back
   of the lid window, else its own depth) and the corner radii at its two ends */
function joinWinMM(o) {
  const fwn = frontWinMM(o); if (!fwn || !o.frontWin.join) return null;
  const { d } = o.dims, bw = bridgeMM(o), win = winMM(o);
  const back = bw > 0 ? d / 2 - bw / 2 : win ? d / 2 - (win.off - win.wd / 2) : clamp(o.frontWin.d ?? 40, 5, d - 10);
  const zBack = clamp(back, 5, d - 5);
  return { ww: fwn.ww, yb: fwn.cy - fwn.wh / 2, zBack, r: Math.min(fwn.r, fwn.ww / 2 - .5), rBack: Math.min(win ? win.r : fwn.r, fwn.ww / 2 - .5, zBack - .5) };
}
function handleShape(w, h, H) {
  const P = Math.PI, x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  const rB = clamp(H.rBot ?? 0, 0, w / 2), rT = clamp(H.rTop ?? 0, 0, Math.min(w / 2, h - rB));
  const outer = [...arcPts(x1 - rB, y0 + rB, rB, -P / 2, 0), ...arcPts(x1 - rT, y1 - rT, rT, 0, P / 2), ...arcPts(x0 + rT, y1 - rT, rT, P / 2, P), ...arcPts(x0 + rB, y0 + rB, rB, P, P * 1.5)];
  const hl = H.hole || {}, hw = clamp(hl.w ?? 0, 0, w - 4), hy = clamp(hl.y ?? 0, 0, h - 6), hh = clamp(hl.h ?? 0, 0, h - hy - 2);
  if (hw < 1 || hh < 1) return new THREE.Shape(outer.map(p => V2(...p)));
  const hx0 = -hw / 2, hx1 = hw / 2, hb = y0 + hy, ht = hb + hh;
  if (hy < .5) {
    // the hole reaches the bridge: it opens at the bottom and the leaf stands on two legs.
    // One contour: the outline from the right leg round to the left leg, then back over the hole's arch
    const ow = Math.min(hw, w - 2 * Math.max(2, rB)), ox0 = -ow / 2, ox1 = ow / 2, hT = clamp(hl.rTop ?? 0, 0, Math.min(ow / 2, hh));
    const arch = [[ox0, y0], ...arcPts(ox0 + hT, ht - hT, hT, P, P / 2), ...arcPts(ox1 - hT, ht - hT, hT, P / 2, 0)];
    return new THREE.Shape(dedupe([[ox1, y0], ...outer, ...arch].map(p => V2(...p))));
  }
  const hB = clamp(hl.rBot ?? 0, 0, hw / 2), hT = clamp(hl.rTop ?? 0, 0, Math.min(hw / 2, hh - hB));
  const hole = [...arcPts(hx1 - hB, hb + hB, hB, -P / 2, 0), ...arcPts(hx1 - hT, ht - hT, hT, 0, P / 2), ...arcPts(hx0 + hT, ht - hT, hT, P / 2, P), ...arcPts(hx0 + hB, hb + hB, hB, P, P * 1.5)];
  const sh = new THREE.Shape(dedupe(outer.map(p => V2(...p))));
  sh.holes.push(new THREE.Path(dedupe(hole.map(p => V2(...p)))));
  return sh;
}
function buildHandle(o, rt, pivot, T, zc, addG) {
  const [w, h] = faceMM(o, 'handleFront'), up = o.handle.up !== false;
  // the outline is drawn in mm (its hand hole and band have sizes in mm), then scaled into the scene
  const geo = mirror => {
    const g = new THREE.ShapeGeometry(handleShape(w, h, o.handle), 24), pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) { if (mirror) pos.setX(i, -pos.getX(i)); uv.setXY(i, pos.getX(i) / w + .5, pos.getY(i) / h + .5); }
    if (mirror) g.index.array.reverse();
    g.scale(S, S, S);
    return g;
  };
  // the leaves fold up from the two edges of the bridge and lean in until their tops meet
  const half = Math.max(.5, bridgeMM(o) / 2), lean = Math.asin(clamp((half - .5) / h, 0, .9));
  for (const [key, sz] of [['handleFront', 1], ['handleBack', -1]]) {
    const hinge = new THREE.Group(); hinge.position.set(0, T, zc + sz * half * S); hinge.rotation.x = up ? -sz * lean : sz * (Math.PI / 2 - .02); pivot.add(hinge);
    addG(hinge, geo(false), rt.faces[key].mat, [0, h / 2 * S, 0], [0, sz > 0 ? 0 : Math.PI, 0], { face: key });
    addG(hinge, geo(true), rt.foldMat, [0, h / 2 * S, -sz * .05 * S], [0, sz > 0 ? Math.PI : 0, 0]);   // the unprinted back of the leaf
  }
}
/* ---------- cake box with a handle, opening at the end ----------
   A sleeve (front, lid with window and handle, back, floor glued round). An end that opens is closed by an
   upper flap hinged at the lid's edge and a lower one hinged at the floor's edge, meeting halfway with a
   tongue tucked into a slot; behind them two dust flaps from the front and back walls. A flat tray with the
   cake slides out through the open end. */
const HB_SIDES = { right: 'Справа', left: 'Слева', both: 'С обеих сторон' };
const TRAY_FIN = { board: 'Картон (с печатью)', gold: 'Золото', silver: 'Серебро' };
const hbOpen = o => { const s = o.hbSides || 'right'; return { right: s !== 'left', left: s !== 'right' }; };
const HB_END_KEYS = ['rightTop', 'rightBottom', 'leftTop', 'leftBottom'];
function hbDims(o) {
  const { w, h, d } = o.dims, t = clamp(o.thickness, .3, Math.min(w, h, d) / 4);
  return { w, h, d, t, dl: Math.round(clamp(d * .3, 15, h * .9)), tw: clamp(d * .22, 12, 45), th: clamp(h * .1, 6, 16), slot: 3,
    trW: Math.max(10, w - 2 * t - 2), trD: Math.max(10, d - 2 * t - 2), trT: 1.5 };
}
/* the die: a vertical strip front, lid, back, floor, glue flap; the right end's parts on the sheet's left
   (the sheet is seen from outside, so +x of the box is on the left), the left end's parts on the right */
function hbNet(o) {
  const B = hbDims(o), { w, h, d, dl } = B, op = hbOpen(o), keys = faceKeys(o), half = h / 2;
  const XL = op.right ? Math.max(half, dl) : d, XR = op.left ? Math.max(half, dl) : d, x0 = XL + w;
  const panels = [
    { key: 'front', x: XL, y: 0, w, h, rot: true }, { key: 'top', x: XL, y: h, w, h: d, rot: true },
    { key: 'back', x: XL, y: h + d, w, h }, { key: 'bottom', x: XL, y: 2 * h + d, w, h: d, rot: true },
    { key: 'glue', blank: 'клеевой клапан', x: XL, y: 2 * h + 2 * d, w, h: 12 }];
  const tabs = [], slots = [];
  for (const side of ['right', 'left']) {
    const R = side === 'right', ex = R ? XL : x0, out = R ? -1 : 1;   // the strip edge on this side, and the way out
    if (!op[side]) { panels.push({ key: side, x: R ? XL - d : x0, y: h + d, w: d, h }); continue; }
    panels.push({ key: side + 'Top', x: R ? XL - half : x0, y: h, w: half, h: d, q: R ? 1 : 3 },
      { key: side + 'Bottom', x: R ? XL - half : x0, y: 2 * h + d, w: half, h: d, q: R ? 3 : 1 });
    for (const y of [0, h + d]) panels.push({ key: 'dust', blank: 'клапан', x: R ? XL - dl : x0, y, w: dl, h });
    // tongue on the upper flap's free edge, slot near the lower flap's free edge
    const fe = ex + out * half, cy = h + d / 2, cyb = 2 * h + d + d / 2, ins = B.th * .35;
    tabs.push({ base: [fe, cy - B.tw / 2, fe, cy + B.tw / 2], pts: [[fe, cy - B.tw / 2], [fe + out * B.th, cy - B.tw / 2 + ins], [fe + out * B.th, cy + B.tw / 2 - ins], [fe, cy + B.tw / 2]] });
    slots.push([fe - out * B.slot, cyb - B.tw / 2 - 1, fe - out * B.slot, cyb + B.tw / 2 + 1]);
  }
  let W = XL + w + XR, H = 2 * h + 2 * d + 12;
  const gap = 15, y = H + gap; let x = 0, rowH = 0;
  const part = (key, pw, ph, extra = {}) => { panels.push({ key, x, y, w: pw, h: ph, part: true, ...extra(x, y) }); x += pw + gap; rowH = Math.max(rowH, ph); };
  for (const k of keys.filter(k => HANDLE_KEYS.includes(k))) {
    const [pw, ph] = faceMM(o, k), sp = handleShape(pw, ph, o.handle).extractPoints(10);
    part(k, pw, ph, (px, py) => { const m = v => [px + pw / 2 + v.x, py + ph / 2 - v.y]; return { poly: sp.shape.map(m), holes: sp.holes.map(hl => hl.map(m)) }; });
  }
  part('tray', B.trW, B.trD, () => ({}));
  W = Math.max(W, x - gap); H = y + rowH;
  return { W, H, panels, hb: true, tabs, slots };
}
/* the handle box's die in SVG: an edge two panels share is a crease, any other edge is cut (except the
   tongues' bases, which crease); tongues, slots, windows and the separate parts */
function handleBoxSVG(o, n, f, label) {
  const line = (l, st) => `<line x1="${f(l[0])}" y1="${f(l[1])}" x2="${f(l[2])}" y2="${f(l[3])}" ${st}/>`;
  const CUT = 'stroke="#00a0e3" stroke-width="0.3"', FOLD = 'stroke="#e6007e" stroke-width="0.3" stroke-dasharray="2 1.2"';
  const ps = n.panels.filter(p => !p.part), edges = p => [[p.x, p.y, p.x + p.w, p.y], [p.x, p.y + p.h, p.x + p.w, p.y + p.h], [p.x, p.y, p.x, p.y + p.h], [p.x + p.w, p.y, p.x + p.w, p.y + p.h]];
  const cut = [], fold = new Map(), near = (a, b) => Math.abs(a - b) < 1e-6;
  for (const p of ps) for (const [x1, y1, x2, y2] of edges(p)) {
    const hor = near(y1, y2); let parts = [[hor ? x1 : y1, hor ? x2 : y2]];
    const sub = (s0, s1) => { parts = parts.flatMap(([u, v]) => [[u, Math.min(v, s0)], [Math.max(u, s1), v]].filter(([a, b]) => b - a > .01)); };
    for (const q of ps) if (q !== p) for (const [a1, b1, a2, b2] of edges(q)) {
      if (hor ? near(b1, b2) && near(b1, y1) : near(a1, a2) && near(a1, x1)) {
        const s0 = Math.max(hor ? x1 : y1, hor ? a1 : b1), s1 = Math.min(hor ? x2 : y2, hor ? a2 : b2);
        if (s1 - s0 > .01) { fold.set(`${hor}|${s0.toFixed(2)}|${s1.toFixed(2)}|${(hor ? y1 : x1).toFixed(2)}`, hor ? [s0, y1, s1, y1] : [x1, s0, x1, s1]); sub(s0, s1); }
      }
    }
    for (const t of n.tabs) { const [bx, b0, , b1] = t.base; if (!hor && near(bx, x1)) { fold.set('tab' + bx + b0, [bx, b0, bx, b1]); sub(b0, b1); } }
    for (const [u, v] of parts) cut.push(hor ? [u, y1, v, y1] : [x1, u, x1, v]);
  }
  const wins = netWindows(o, n), trim = ([x1, y1, x2, y2]) => {
    const hor = near(y1, y2); let segs = [[hor ? x1 : y1, hor ? x2 : y2]];
    for (const q of wins) {
      if (!(hor ? y1 > q.y + .01 && y1 < q.y + q.h - .01 : x1 > q.x + .01 && x1 < q.x + q.w - .01)) continue;
      const a = hor ? q.x : q.y, b = hor ? q.x + q.w : q.y + q.h;
      segs = segs.flatMap(([u, v]) => [[u, Math.min(v, a)], [Math.max(u, b), v]].filter(([s0, s1]) => s1 - s0 > .01));
    }
    return segs.map(([u, v]) => hor ? [u, y1, v, y1] : [x1, u, x1, v]);
  };
  let body = cut.map(l => line(l, CUT)).join('') + [...fold.values()].flatMap(trim).map(l => line(l, FOLD)).join('');
  body += n.tabs.map(t => `<polyline points="${t.pts.map(v => v.map(f).join(',')).join(' ')}" fill="none" ${CUT}/>`).join('');
  body += n.slots.map(l => line(l, CUT)).join('');
  for (const q of wins) {
    if (q.polys) { for (const pl of q.polys) body += `<path d="${pl.map((v, i) => `${i ? 'L' : 'M'}${f(v.x)},${f(v.y)}`).join(' ')} Z" fill="none" ${CUT}/>`; continue; }
    body += `<rect x="${f(q.x)}" y="${f(q.y)}" width="${f(q.w)}" height="${f(q.h)}" rx="${f(Math.min(q.radii[0], q.w / 2, q.h / 2))}" fill="none" ${CUT}/>`;
  }
  const poly = q => `<polygon points="${q.map(v => v.map(f).join(',')).join(' ')}" fill="none" ${CUT}/>`;
  for (const p of n.panels.filter(p => p.part)) body += p.poly ? poly(p.poly) + (p.holes || []).map(poly).join('') : `<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}" fill="none" ${CUT}/>`;
  for (const p of n.panels) {
    if (p.blank) { if (p.blank.length) body += `<text x="${f(p.x + p.w / 2)}" y="${f(p.y + p.h / 2)}" font-family="Arial, sans-serif" font-size="${f(Math.max(2.5, Math.min(p.w, p.h) * .12))}" fill="#9a9a9a" text-anchor="middle" dominant-baseline="middle"${p.h > p.w ? ` transform="rotate(-90 ${f(p.x + p.w / 2)} ${f(p.y + p.h / 2)})"` : ''}>${esc(p.blank.toUpperCase())}</text>`; }
    else body += label(p);
  }
  return body;
}
function buildHandleBox(o, rt, { addG, add, film }) {
  const B = hbDims(o), W = B.w * S, H = B.h * S, D = B.d * S, T = B.t * S, P = Math.PI, g = rt.group, F = k => rt.faces[k].mat, op = hbOpen(o);
  rt.hb = { flaps: [], dust: [], tongues: [], tray: null, dir: op.right ? 1 : -1 };
  rt.lidPivot = rt.lidGroup = null;
  // front wall, with its window
  const J = joinWinMM(o), fwn = !J && frontWinMM(o), fHole = fwn && rrectPts(0, fwn.cy * S - H / 2, fwn.ww * S, fwn.wh * S, fwn.r * S);
  if (J) {
    // the window runs out of the front wall's top edge (and on over the lid)
    const jw = J.ww * S / 2, jr = J.r * S, nO = notchPts(W, H, jw, H - J.yb * S, jr, 'top'), nI = notchPts(W - 2 * T, H - 2 * T, jw, H - T - J.yb * S, jr, 'top');
    addG(g, planeGeo(W, H, nO, 'top'), F('front'), [0, H / 2, D / 2], [0, 0, 0], { face: 'front' });
    addG(g, planeGeo(W - 2 * T, H - 2 * T, nI, 'top'), rt.innerMat, [0, H / 2, D / 2 - T], [0, P, 0], { face: 'inside', wall: true });
    addG(g, ribbonGeo(nO.map(p => [p.x, H / 2 + p.y, D / 2]), nO.map(p => [p.x, H / 2 + p.y, D / 2 - T])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
    film(g, nO, [0, H / 2, D / 2 - T / 2], [0, 0, 0]);
  } else addG(g, fHole ? planeGeoHole(W, H, fHole) : new THREE.PlaneGeometry(W, H), F('front'), [0, H / 2, D / 2], [0, 0, 0], { face: 'front' });
  if (!J) addG(g, fHole ? planeGeoHole(W - 2 * T, H - 2 * T, fHole.map(v => V2(-v.x, v.y))) : new THREE.PlaneGeometry(W - 2 * T, H - 2 * T), rt.innerMat, [0, H / 2, D / 2 - T], [0, P, 0], { face: 'inside', wall: true });
  if (fHole) {
    const loop = [...fHole, fHole[0]];
    addG(g, ribbonGeo(loop.map(p => [p.x, H / 2 + p.y, D / 2]), loop.map(p => [p.x, H / 2 + p.y, D / 2 - T])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
    film(g, fHole, [0, H / 2, D / 2 - T / 2], [0, 0, 0]);
  }
  add(g, W, H, F('back'), [0, H / 2, -D / 2], [0, P, 0], { face: 'back' });
  add(g, W - 2 * T, H - 2 * T, rt.innerMat, [0, H / 2, -D / 2 + T], [0, 0, 0], { face: 'inside', wall: true });
  add(g, W, D, F('bottom'), [0, 0, 0], [P / 2, 0, 0], { face: 'bottom' });
  add(g, W - 2 * T, D - 2 * T, F('insideBottom'), [0, T, 0], [-P / 2, 0, 0], { face: 'insideBottom' });
  // the lid: window split by the bridge, the handle standing on it
  const lg = new THREE.Group(); lg.position.set(0, H, 0); g.add(lg);
  const win = winMM(o);
  let holes = win && [rrectPts(0, -win.off * S, win.ww * S, win.wd * S, win.r * S)];
  if (holes && bridgeMM(o) > 0) holes = splitBand(holes[0], 0, bridgeMM(o) * S / 2).map(q => q.map(v => V2(v.x, v.y)));
  // a window joined with the front one: its front part becomes a notch in the lid's front edge
  // (shape y runs to the back; the front edge is at y = -D/2)
  const jn = J && notchPts(W, D, J.ww * S / 2, J.zBack * S, J.rBack * S, 'bottom');
  if (J && holes) holes = bridgeMM(o) > 0 ? holes.filter(q => q.every(v => v.y > 0)) : [];
  if (holes && !holes.length) holes = null;
  const lidGeo = (hl, mirror) => {
    if (!jn) return hl ? planeGeoHole(W, D, hl) : new THREE.PlaneGeometry(W, D);
    const notch = mirror ? notchPts(W, D, J.ww * S / 2, J.zBack * S, J.rBack * S, 'top') : jn;
    const outer = mirror ? [V2(-W / 2, -D / 2), V2(W / 2, -D / 2), V2(W / 2, D / 2), ...notch, V2(-W / 2, D / 2)] : [V2(-W / 2, -D / 2), ...notch, V2(W / 2, -D / 2), V2(W / 2, D / 2), V2(-W / 2, D / 2)];
    const sh = new THREE.Shape(dedupe(outer)); for (const h of hl || []) sh.holes.push(new THREE.Path(h));
    const geo = new THREE.ShapeGeometry(sh), pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / W + .5, pos.getY(i) / D + .5);
    return geo;
  };
  addG(lg, lidGeo(holes, false), F('top'), [0, 0, 0], [-P / 2, 0, 0], { face: 'top' });
  addG(lg, lidGeo(holes && holes.map(q => q.map(v => V2(v.x, -v.y))), true), F('inside'), [0, -T, 0], [P / 2, 0, 0], { face: 'inside' });
  if (jn) {
    addG(lg, ribbonGeo(jn.map(p => [p.x, 0, -p.y]), jn.map(p => [p.x, -T, -p.y])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
    film(lg, jn, [0, -T / 2, 0], [-P / 2, 0, 0]);
  }
  for (const hole of holes || []) {
    const loop = [...hole, hole[0]];
    addG(lg, ribbonGeo(loop.map(p => [p.x, 0, -p.y]), loop.map(p => [p.x, -T, -p.y])), rt.edgeMat, [0, 0, 0], [0, 0, 0]);
    film(lg, hole, [0, -T / 2, 0], [-P / 2, 0, 0]);
  }
  add(lg, W, T, rt.edgeMat, [0, -T / 2, -D / 2], [0, P, 0]);
  if (jn) { const sw = (W - J.ww * S) / 2; for (const sx of [-1, 1]) add(lg, sw, T, rt.edgeMat, [sx * (W - sw) / 2, -T / 2, D / 2], [0, 0, 0]); }
  else add(lg, W, T, rt.edgeMat, [0, -T / 2, D / 2], [0, 0, 0]);
  if (o.handle?.on) buildHandle(o, rt, lg, 0, 0, addG);
  // the ends
  const half = H / 2, fH = half - .15 * S;
  for (const sx of [1, -1]) {
    const side = sx > 0 ? 'right' : 'left', ry = sx * P / 2;
    if (!op[side]) {
      add(g, D, H, F(side), [sx * W / 2, H / 2, 0], [0, ry, 0], { face: side });
      add(g, D - 2 * T, H - 2 * T, rt.innerMat, [sx * (W / 2 - T), H / 2, 0], [0, -ry, 0], { face: 'inside', wall: true });
      continue;
    }
    // upper flap on the lid's edge, lower flap on the floor's edge; each with its board back and cut edge
    const uh = new THREE.Group(); uh.position.set(sx * W / 2, H, 0); g.add(uh);
    add(uh, D, fH, F(side + 'Top'), [0, -fH / 2, 0], [0, ry, 0], { face: side + 'Top' });
    add(uh, D, fH, rt.innerMat, [-sx * T, -fH / 2, 0], [0, -ry, 0], { face: 'inside', wall: true });
    add(uh, D, T, rt.edgeMat, [-sx * T / 2, -fH, 0], [P / 2, 0, ry]);
    const tg = new THREE.Mesh(new THREE.PlaneGeometry(B.tw * S, B.th * S), rt.foldMat); tg.rotation.set(0, ry, 0); tg.castShadow = true; tg.userData = { objId: o.id, face: null };
    uh.add(tg); rt.hb.tongues.push({ m: tg, sx, y: -fH - B.th * S / 2 });
    const lh = new THREE.Group(); lh.position.set(sx * W / 2, 0, 0); g.add(lh);
    add(lh, D, fH, F(side + 'Bottom'), [0, fH / 2, 0], [0, ry, 0], { face: side + 'Bottom' });
    add(lh, D, fH, rt.innerMat, [-sx * T, fH / 2, 0], [0, -ry, 0], { face: 'inside', wall: true });
    add(lh, D, T, rt.edgeMat, [-sx * T / 2, fH, 0], [P / 2, 0, ry]);
    const slot = new THREE.Mesh(new THREE.PlaneGeometry((B.tw + 2) * S, .7 * S), rt.holeMat); slot.position.set(sx * .05 * S, fH - B.slot * S, 0); slot.rotation.set(0, ry, 0); slot.raycast = () => {}; lh.add(slot);
    rt.hb.flaps.push({ u: uh, l: lh, sx });
    // dust flaps fold in from the front and back walls, just inside the end flaps
    for (const zs of [1, -1]) {
      const dg = new THREE.Group(); dg.position.set(sx * (W / 2 - 1.6 * T), H / 2, zs * (D / 2 - T)); g.add(dg);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(B.dl * S, H - 2.4 * T), rt.foldMat); m.position.set(0, 0, -zs * B.dl * S / 2); m.rotation.y = P / 2;
      m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, face: null }; dg.add(m);
      rt.hb.dust.push({ g: dg, sx, zs });
    }
  }
  // the tray and the cake on it
  const tr = new THREE.Group(); tr.position.set(0, T, 0); g.add(tr); rt.hb.tray = tr;
  const TW = B.trW * S, TD = B.trD * S, TT = B.trT * S, metal = o.tray?.fin === 'gold' || o.tray?.fin === 'silver';
  rt.trayMat ??= new THREE.MeshPhysicalMaterial({ roughness: .3, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.BoxGeometry(TW, TT, TD), metal ? rt.trayMat : rt.foldMat); body.position.y = TT / 2; body.castShadow = body.receiveShadow = true; body.userData = { objId: o.id, face: null }; tr.add(body);
  addG(tr, new THREE.PlaneGeometry(TW, TD), metal ? rt.trayMat : F('tray'), [0, TT + .02 * S, 0], [-P / 2, 0, 0], { face: 'tray' });
  const pr = o.product || {}, im = pr.src && getImg(pr.src);
  if (im) {
    rt.productTex?.dispose(); rt.productTex = new THREE.Texture(im); rt.productTex.colorSpace = THREE.SRGBColorSpace; rt.productTex.needsUpdate = true;
    rt.productMat.map = rt.productTex; rt.productMat.needsUpdate = true;
    const pw = clamp(pr.w ?? B.trW * .8, 5, 1000) * S, ph = pw * im.naturalHeight / im.naturalWidth;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), rt.productMat); m.position.set((pr.x || 0) * S, TT + ph / 2, 0); m.raycast = () => {}; m.userData = { objId: o.id, face: null }; tr.add(m);
  } else if (pr.cake !== false) {
    // a plain cake while there is no photo: sponge, cream top, a ring of cream dollops and berries
    rt.cakeMats ??= ['#efdcbc', '#fbf6ee', '#ffffff', '#a51d36'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .7 }));
    const R = Math.min(TW, TD) * .38, hc = Math.min(H * .42, 70 * S, R * 1.1), [sponge, cream, dollop, berry] = rt.cakeMats;
    const cyl = (r, h, y, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 72), mat); m.position.y = y; m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, face: null }; tr.add(m); };
    cyl(R, hc * .82, TT + hc * .41, sponge); cyl(R * 1.01, hc * .18, TT + hc * .91, cream);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * P * 2, s = new THREE.Mesh(new THREE.SphereGeometry(R * .09, 16, 12), i % 3 ? dollop : berry);
      s.position.set(Math.cos(a) * R * .8, TT + hc + R * .05, Math.sin(a) * R * .8); s.castShadow = true; s.userData = { objId: o.id, face: null }; tr.add(s);
    }
  }
}
