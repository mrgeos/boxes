// Пакеты: плоский и с дном, верх, окно, экстендер, содержимое
import * as THREE from 'three';
import { S, clamp, esc, smooth } from '../core/util.js';
import { faceMM } from '../core/model.js';
import { getImg } from '../core/assets.js';
import { gridGeo, surfFrame } from '../scene/geometry.js';

const BAG_MATS = { clear: 'Прозрачная плёнка', frosty: 'Матовая плёнка (frosty)', tracing: 'Калька', paper: 'Бумага белая', kraft: 'Крафт-бумага' };
const BAG_TOPS = { flap: 'Клапан с клеевой лентой', fold: 'Завёрнут (отворот)', seal: 'Запаян', open: 'Открыт (горловина)' };
const ZIG = { h: 3.5, pitch: 7 };
   // teeth of a serrated mouth edge, mm
const EXT_KEYS = ['extFront', 'extBack'];
/* film bags print on a see-through base: frosty and tracing paper get a milky ground, clear stays clear */
const bagFilm = o => o.type === 'bag' && ['clear', 'frosty', 'tracing'].includes(o.bagMat);
const BAG_FILM = {
  clear: { fin: { label: 'Печать на плёнке', r: .3, m: 0, cc: .4, ccr: .08 }, ground: null, blur: 0 },
  frosty: { fin: { label: 'Матовая плёнка', r: .7, m: 0, cc: 0, ccr: 0 }, ground: 'rgba(236,240,241,.6)', blur: .012 },
  tracing: { fin: { label: 'Калька', r: .85, m: 0, cc: 0, ccr: 0 }, ground: 'rgba(247,246,240,.8)', blur: .022 },
};
const BAG_LABEL = { fold: 'Отворот', left: 'Левый фальц', right: 'Правый фальц' };
const defaultBagWin = d => ({ on: false, w: Math.round(d.w * .5), h: Math.round(d.h * .35), cy: Math.round(d.h * .37), x: 0, corners: 'round', r: 6 });
function applyBagPreset(o, p) {
  Object.assign(o, { bagStyle: p.bag.style, bagTop: p.bag.top, bagMat: p.bag.mat, flapH: p.bag.flapH, lid: 0, rollTurns: p.bag.turns ?? 1, shoulder: 0,
    ext: { on: !!p.bag.ext, h: 40, ov: 18, w: p.dims.w, staples: 2 }, bagWin: { ...defaultBagWin(p.dims), ...(p.bag.win || { on: false }) } });
  o.product = { src: null, aspect: 1, x: 0, ...o.product, w: Math.round(p.dims.w * (p.bag.prodW ?? .7)), y: p.bag.prodY ?? 6 };
}
/* ---------- bags ----------
   Flat bag: front and back sealed along the sides, folded at the bottom, puffed by the content.
   Flat-bottom bag: front, back, side gussets and a block bottom; at the top the gussets fold in and
   the back comes forward, so the front stays upright. The top has a flap with an adhesive strip
   (back panel folded over the front), a fold-over strip, or a seal. Every printed side is a
   surface f(u, v) in object mm: its mesh, its UVs and the stickers on it all use the same map. */
function bagDims(o) {
  const W = o.dims.w, H = o.dims.h, block = o.bagStyle === 'block', top = o.bagTop || 'flap', film = bagFilm(o);
  const D = block ? clamp(o.dims.d, 10, W * 1.5) : 0, t = block ? 0 : clamp(o.dims.d, 0, Math.min(W, H) / 3);
  const turns = top === 'fold' ? clamp(Math.round(o.rollTurns ?? 1), 1, 3) : 0;
  let fh = top === 'seal' || top === 'open' ? 0 : clamp(o.flapH, 8, H * .4);
  if (turns) fh = Math.min(fh, H * .6 / (2 * turns - 1));
  // paper rolled into the top: the visible band plus the turns hidden under it
  const roll = turns ? fh * (2 * turns - 1) : 0, Hv = H - roll, ext = !!o.ext?.on && top !== 'open', eh = clamp(o.ext?.h ?? 40, 10, Hv * .5);
  // how much of the bag sits inside the header card; the rest of the card stands above the bag
  const ov = clamp(o.ext?.ov ?? Math.round(eh * .45), Math.min(8, eh), eh);
  const tk = turns > 1 ? .3 + turns * (film ? .5 : 1.1) : .18;
  const B = { W, H, D, t, block, top, turns, fh, roll, Hv, tk, film, seam: block ? 0 : 6, sealTop: top === 'seal' ? 10 : 0, ext, ew: W, eh, ov, open: top === 'open', zig: top === 'open' && o.bagZig !== false };
  B.openT = clamp(o.bagOpen ?? .65, 0, 1);
  if (block) {
    // gable top: from the shoulder the front and back slope in to meet at the crest; above the crest
    // a flat neck holds the extender (or the seal)
    // an open mouth only leans in a little, softly, with the gussets tucked
    B.dmin = 1.2; B.neck = ext ? ov + 3 : top === 'seal' ? 12 : 0;
    const run = B.run = B.open ? (D - B.dmin) / 2 * (1 - B.openT) : (D - B.dmin) / 2, maxL = Math.max(1, Hv - B.neck - 15);
    let hp = o.shoulder > 0 ? clamp(o.shoulder, 3, 400) : B.open ? Math.min(D * 1.2, Hv * .3) : D * .85, L = Math.hypot(hp, run);
    if (L > maxL) { hp = Math.sqrt(Math.max(1, maxL * maxL - run * run)); L = Math.hypot(hp, run); }
    B.hp = hp; B.L = L; B.s0 = Hv - B.neck - L;
  }
  return B;
}
/* a window cut into the front of a paper bag (with film behind), as [u0, u1, v0, v1] plus corner radius r (mm).
   It grows from its centre: cy is the centre's height above the bottom, x shifts it sideways. */
function bagWindows(o) {
  const win = o.bagWin;
  if (o.type !== 'bag' || bagFilm(o) || !win?.on) return {};
  const B = bagDims(o), { W, Hv } = B, w = clamp(win.w, 5, W - 4), h = clamp(win.h, 5, Hv - 10);
  const cy = clamp(win.cy ?? Hv * .4, h / 2 + 3, Hv - h / 2 - 3), x0 = clamp((W - w) / 2 + (win.x || 0), 2, W - w - 2);
  const r = [x0 / W, (x0 + w) / W, (cy - h / 2) / Hv, (cy + h / 2) / Hv];
  r.r = win.corners === 'round' ? clamp(win.r ?? 6, 0, Math.min(w, h) / 2) : 0;
  return { front: r };
}
function bagNet(o) {
  const B = bagDims(o), { W, D, fh, Hv, roll } = B, panels = [], seams = [], HID = 'скрыто в скрутке';
  let NW, NH, glue = null;
  if (!B.block) {
    let y = 0;
    if (B.top === 'fold' && roll > fh) { panels.push({ key: 'hidden', blank: HID, x: 0, y, w: W, h: roll - fh }); y += roll - fh; }
    if (B.top === 'flap' || B.top === 'fold') { panels.push({ key: B.top, x: 0, y, w: W, h: fh, rot: true }); y += fh; }
    const y0 = y;
    panels.push({ key: 'back', x: 0, y, w: W, h: Hv, zig: B.zig && 'top' }); y += Hv;
    panels.push({ key: 'front', x: 0, y, w: W, h: Hv, rot: true, zig: B.zig && 'bottom' }); y += Hv;
    if (B.top === 'fold') { panels.push({ key: 'hidden', blank: B.turns > 1 ? HID : 'скрыто в отвороте', x: 0, y, w: W, h: roll }); y += roll; }
    seams.push([B.seam, y0, B.seam, y], [W - B.seam, y0, W - B.seam, y]);
    if (B.top === 'seal') seams.push([0, B.sealTop, W, B.sealTop], [0, y - B.sealTop, W, y - B.sealTop]);
    NW = W; NH = y;
  } else {
    const t0 = B.top === 'fold' ? roll : B.top === 'flap' ? fh : 0, cols = [['left', 0, D], ['front', D, W], ['right', D + W, D], ['back', 2 * D + W, W]], gx = 2 * D + 2 * W;
    const hid = B.turns > 1 ? HID : 'скрыто в отвороте';
    for (const [key, x, w] of cols) {
      panels.push({ key, x, y: t0, w, h: Hv, zig: B.zig && 'top' });
      if (B.top === 'fold') {
        if (key === 'back') { panels.push({ key: 'fold', x, y: roll - fh, w, h: fh, rot: true }); if (roll > fh) panels.push({ key: 'hidden', blank: hid, x, y: 0, w, h: roll - fh }); }
        else panels.push({ key: 'hidden', blank: hid, x, y: 0, w, h: roll });
      }
      if (B.top === 'flap' && key === 'back') panels.push({ key: 'flap', x, y: 0, w, h: fh, rot: true });
    }
    panels.push({ key: 'glue', blank: 'клеевой шов', x: gx, y: B.top === 'fold' ? 0 : t0, w: 12, h: Hv + (B.top === 'fold' ? roll : 0) });
    panels.push({ key: 'bottom', x: D, y: t0 + Hv, w: W, h: D });
    NW = gx + 12; NH = t0 + Hv + D;
    // crease lines of the gable top across front, back and the gusset centres
    const yc = t0 + B.neck + B.L, yt = t0 + B.neck;   // measured down from the top edge
    seams.creases = [[0, yc, gx, yc], ...(B.neck ? [[0, yt, gx, yt]] : []), [D / 2, t0, D / 2, t0 + Hv], [D + W + D / 2, t0, D + W + D / 2, t0 + Hv]];
  }
  if (B.top === 'flap') { const p = panels.find(q => q.key === 'flap'); glue = { x: p.x + 4, y: p.y + 3, w: p.w - 8, h: Math.min(10, fh * .35) }; }
  if (B.ext) {
    const y = NH + 15;
    panels.push({ key: 'extBack', x: 0, y, w: B.ew, h: B.eh, rot: true, part: true }, { key: 'extFront', x: 0, y: y + B.eh, w: B.ew, h: B.eh, part: true });
    NW = Math.max(NW, B.ew); NH = y + 2 * B.eh;
  }
  return { W: NW, H: NH, panels, seams, glue, bag: B, wins: bagWindows(o) };
}
/* surfaces of a bag in its closed state, object mm. Each side is f(u, v) → [x, y, z] with v measured
   along the paper, so print keeps its size over folds; its rest plane is the side laid out flat
   (paper coordinates) and tells stickers how sides meet. */
function bagShape(o) {
  const B = bagDims(o), { W, D, fh, Hv } = B, S3 = {}, P = (c, u, v) => ({ c, u, v });
  // the strip folded over the top and the extender press the top of the bag flat
  const cover = Math.max(B.top === 'seal' ? 0 : fh, B.ext ? B.ov : 0);
  let frontAt, backTop;   // a point and outward normal on the front at (x, paper s); the back's top edge
  if (!B.block) {
    // puff: zero along the sealed sides, the bottom fold and the mouth; a faint ripple in the film
    const mx = Math.min(W * .25, 28), my = Math.min(Hv * .25, 28), top = Hv - Math.max(B.sealTop, B.ext ? B.ov * .9 : 0);
    const sx = x => smooth(0, mx, W / 2 - B.seam - Math.abs(x));
    const puff = (x, y) => sx(x) * smooth(0, my, y) * (B.open ? 1 : smooth(0, my * .8, top - y));
    // an open mouth parts into a soft lens between the side seams
    const mo = W * .11 * B.openT, mouth = (x, y) => B.open ? mo * sx(x) * smooth(Hv - Math.min(60, Hv * .3), Hv, y) : 0;   // lens opening of a flat bag
    const rip = (x, y) => .3 * Math.sin(x * .13 + y * .07) * Math.sin(y * .11 - x * .05);
    const e = B.film ? .06 : .25;   // half the gap where front and back meet (paper is thicker; keeps them apart in depth)
    const zFront = (x, y) => { const f = puff(x, y); return f * (B.t / 2 + rip(x, y)) + mouth(x, y) + e; };
    const zBack = (x, y) => { const f = puff(x, y); return -f * (B.t / 2 + rip(-x, y + 9)) - mouth(x, y) - e; };
    S3.front = { f: (u, v) => { const x = (u - .5) * W, y = v * Hv; return [x, y, zFront(x, y)]; }, rest: P([0, Hv / 2, 0], [1, 0, 0], [0, 1, 0]) };
    S3.back = { f: (u, v) => { const x = (.5 - u) * W, y = v * Hv; return [x, y, zBack(x, y)]; }, rest: P([0, Hv / 2, 0], [-1, 0, 0], [0, 1, 0]) };
    frontAt = (x, s) => ({ p: [x, s, zFront(x, s)], n: [0, 0, 1] });
    backTop = x => [x, Hv, zBack(x, Hv)];
    B.topY = Hv; B.zTop = zFront(0, Hv); B.zBackTop = zBack(0, Hv);
  } else {
    // paper profile of the front (y, z) against paper length s: upright, a crease, the slope, the crest.
    // Paper bags fold on sharp creases, film rounds them a little.
    const { s0, L, run } = B, r = B.film ? 4 : B.open ? 14 : .6;
    const sp = x => x / r > 30 ? x : r * Math.log1p(Math.exp(x / r));
    const zP = s => D / 2 - run * (sp(s - s0) - sp(s - s0 - L)) / L;
    const N = 800, ys = new Float64Array(N + 1), zs = new Float64Array(N + 1);
    zs[0] = zP(0);
    for (let i = 1; i <= N; i++) { const s = Hv * i / N, ds = Hv / N; zs[i] = zP(s); const dz = zs[i] - zs[i - 1]; ys[i] = ys[i - 1] + Math.sqrt(Math.max(0, ds * ds - dz * dz)); }
    const prof = s => {
      const f = clamp(s / Hv, 0, 1) * N, i = Math.min(N - 1, Math.floor(f)), t = f - i;
      const y = ys[i] + (ys[i + 1] - ys[i]) * t, z = zs[i] + (zs[i + 1] - zs[i]) * t, dy = ys[i + 1] - ys[i], dz = zs[i + 1] - zs[i], l = Math.hypot(dy, dz) || 1;
      return { y, z, ny: -dz / l, nz: dy / l };
    };
    const b = Math.min(3.5, W * .035), g = s => smooth(0, 18, s) * (1 - smooth(s0 - 30, s0 - 4, s)) * (1 - smooth(Hv - cover - 25, Hv - cover, s));
    const bulge = (x, s) => b * Math.cos(Math.PI * x / W) * g(s);
    S3.front = { f: (u, v) => { const x = (u - .5) * W, s = v * Hv, q = prof(s); return [x, q.y, q.z + bulge(x, s) + .06]; }, rest: P([0, Hv / 2, D / 2], [1, 0, 0], [0, 1, 0]) };
    S3.back = { f: (u, v) => { const x = (.5 - u) * W, s = v * Hv, q = prof(s); return [x, q.y, -q.z - bulge(x, s) - .06]; }, rest: P([0, Hv / 2, -D / 2], [-1, 0, 0], [0, 1, 0]) };
    // gussets fold in along a centre crease as front and back close up: triangles under the slope
    const side = sg => (u, v) => {
      const s = v * Hv, q = prof(s), zf = q.z, w = sg < 0 ? u : 1 - u;   // w: 0 at the back edge … 1 at the front edge
      const inset = Math.sqrt(Math.max(0, (D / 2) ** 2 - zf * zf)), cx = sg * (W / 2 - inset);
      const [ax, az, bx, bz, t] = w < .5 ? [sg * W / 2, -zf, cx, 0, w * 2] : [cx, 0, sg * W / 2, zf, w * 2 - 1];
      return [ax + (bx - ax) * t + sg * (b * .6 * Math.sin(Math.PI * w) * g(s) + .06), q.y, az + (bz - az) * t];
    };
    S3.left = { f: side(-1), rest: P([-W / 2, Hv / 2, 0], [0, 0, 1], [0, 1, 0]) };
    S3.right = { f: side(1), rest: P([W / 2, Hv / 2, 0], [0, 0, -1], [0, 1, 0]) };
    S3.bottom = { f: (u, v) => [(u - .5) * W, -.06, (v - .5) * D], rest: P([0, 0, 0], [1, 0, 0], [0, 0, 1]) };
    frontAt = (x, s) => { const q = prof(s); return { p: [x, q.y, q.z + bulge(x, s) + .06], n: [0, q.ny, q.nz] }; };
    backTop = x => { const q = prof(Hv); return [x, q.y, -q.z - .06]; };
    const qt = prof(Hv); B.topY = qt.y; B.zTop = qt.z + .06; B.zBackTop = -qt.z - .06;
  }
  // the flap / fold-over strip lies on the front, measured from the top edge down
  const z0 = B.block ? D / 2 : 0;
  if (B.top === 'flap' || B.top === 'fold') {
    const lift = B.top === 'fold' ? B.tk : .18;
    S3[B.top] = { f: (u, v) => { const a = frontAt((u - .5) * W, Hv - (1 - v) * fh); return [a.p[0] + a.n[0] * lift, a.p[1] + a.n[1] * lift, a.p[2] + a.n[2] * lift]; },
      rest: P([0, Hv - fh / 2, z0 + .18], [1, 0, 0], [0, 1, 0]), hinge: [0, B.topY, B.zTop + lift / 2] };
    if (B.turns > 1) {
      // the roll: its top runs round from the front band over to the back, its ends are closed
      const strip = S3.fold.f;
      const arc = (u, v) => {
        const a = strip(u, 1), b = backTop((u - .5) * W), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r = Math.hypot(a[1] - b[1], a[2] - b[2]) / 2 + .05;
        const dy = (a[1] - c[1]) / r, dz = (a[2] - c[2]) / r, an = Math.PI * v;   // from the front point over the top to the back
        return [a[0], c[1] + (dy * Math.cos(an) + dz * Math.sin(an)) * r, c[2] + (dz * Math.cos(an) - dy * Math.sin(an)) * r];
      };
      B.roll3 = { arc, strip, inner: (u, v) => frontAt((u - .5) * W, Hv - (1 - v) * fh).p };
    }
  }
  // extender: a card folded over the crest, stapled through
  const zf = B.zTop + (B.top === 'fold' ? B.tk : B.top === 'flap' ? .36 : 0), zb = B.zBackTop;
  B.extZ = [zf + .35, zb - .35];
  if (B.ext) {
    // the card hangs over the bag by the overlap; above the bag its two halves close up
    const yb = B.topY + (B.turns > 1 ? B.tk : 0), yt = yb + B.eh - B.ov, zc = (B.extZ[0] + B.extZ[1]) / 2, half = (B.extZ[0] - B.extZ[1]) / 2, shut = .35;
    const zAt = y => half + (shut - half) * smooth(yb, yb + Math.min(6, B.eh - B.ov + .01), y);
    Object.assign(B, { extTop: yt, extBagTop: yb, extZc: zc, extShut: B.eh - B.ov > .5 ? shut : half });
    S3.extFront = { f: (u, v) => { const y = yt - (1 - v) * B.eh; return [(u - .5) * B.ew, y, zc + zAt(y)]; }, rest: P([0, yt - B.eh / 2, z0 + .6], [1, 0, 0], [0, 1, 0]) };
    S3.extBack = { f: (u, v) => { const y = yt - (1 - v) * B.eh; return [(.5 - u) * B.ew, y, zc - zAt(y)]; }, rest: P([0, yt - B.eh / 2, -z0 - .6], [-1, 0, 0], [0, 1, 0]) };
  }
  return { B, S3 };
}
function buildBag(o, rt) {
  const { B, S3 } = bagShape(o), film = bagFilm(o), clear = o.bagMat === 'clear', frames = rt.bagFrames = {}, wins = bagWindows(o);
  const I4 = new THREE.Matrix4();
  const res = k => { const [w, h] = faceMM(o, k); return [clamp(Math.ceil(w / 3), 4, 60), clamp(Math.ceil(h / 2.5), 4, 120)]; };
  const face = (key, parent, off = [0, 0, 0], pinv = I4) => {
    let [nu, nv] = res(key), vtop = null;
    if (B.zig && ['front', 'back', 'left', 'right'].includes(key)) {
      // serrated mouth: the top row of the grid alternates between tooth tips and notches
      const [w, h] = faceMM(o, key); nu = Math.max(2, 2 * Math.round(w / ZIG.pitch)); const dv = ZIG.h / h;
      vtop = i => i % 2 ? 1 - dv : 1;
    }
    const s3 = S3[key], geo = gridGeo(s3.f, nu, nv, off, [0, 1, 0, 1], vtop), f = rt.faces[key], card = EXT_KEYS.includes(key);
    f.mat.side = film && !card ? THREE.DoubleSide : THREE.FrontSide;
    const m = new THREE.Mesh(geo, f.mat); m.userData = { objId: o.id, face: key };
    m.castShadow = !clear || card; m.receiveShadow = true; m.renderOrder = 2; parent.add(m);
    const sub = (r, mat, order) => { const g = gridGeo(s3.f, Math.max(2, Math.ceil(nu * (r[1] - r[0]))), Math.max(2, Math.ceil(nv * (r[3] - r[2]))), off, r); const x = new THREE.Mesh(g, mat); x.raycast = () => {}; x.receiveShadow = true; x.renderOrder = order; parent.add(x); return x; };
    if (film && !card) {
      if (clear) { const sh = new THREE.Mesh(geo, rt.petMat); sh.raycast = () => {}; sh.renderOrder = 1; parent.add(sh); }
    } else if (wins[key]) {
      // a window: the inside of the paper around it, and the film across it
      const [u0, u1, v0, v1] = wins[key];
      for (const r of [[0, 1, 0, v0], [0, 1, v1, 1], [0, u0, v0, v1], [u1, 1, v0, v1]]) if (r[1] - r[0] > 1e-4 && r[3] - r[2] > 1e-4) sub(r, rt.innerMat, 0);
      sub(wins[key], rt.petMat, 4);
    } else { const tw = new THREE.Mesh(geo, rt.innerMat); tw.raycast = () => {}; tw.receiveShadow = true; parent.add(tw); }
    frames[key] = surfFrame(o, key, s3, parent, pinv);
    return m;
  };
  for (const k of ['front', 'back', 'left', 'right', 'bottom']) if (S3[k]) face(k, rt.group);
  if (B.top === 'flap' || B.top === 'fold') {
    const st = S3[B.top], hg = st.hinge;
    if (B.turns > 1) {
      // a roll stays rolled: the band is part of the bag, its top and ends are board
      face('fold', rt.group);
      const R = B.roll3, mat = rt.faces.fold.mat;
      const cap = gridGeo(R.arc, 48, 10); const uv = cap.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1);
      const cm = new THREE.Mesh(cap, mat); cm.castShadow = cm.receiveShadow = true; cm.userData = { objId: o.id, face: 'fold' }; rt.group.add(cm);
      for (const u of [0, 1]) {
        const band = gridGeo((a, b) => { const p = R.inner(u, a), q = R.strip(u, a); return [p[0] + (q[0] - p[0]) * b, p[1] + (q[1] - p[1]) * b, p[2] + (q[2] - p[2]) * b]; }, 16, 1);
        const top = gridGeo((a, b) => { const c = R.arc(u, .5), p = R.arc(u, a); return [c[0], c[1] + (p[1] - c[1]) * b, c[2] + (p[2] - c[2]) * b]; }, 16, 1);
        for (const g of [band, top]) { const e = new THREE.Mesh(g, rt.foldMat); e.userData = { objId: o.id, face: null }; rt.group.add(e); }
      }
    } else {
      const pv = new THREE.Group();
      pv.position.set(hg[0] * S, hg[1] * S, hg[2] * S); rt.group.add(pv); rt.bagPivot = pv;
      face(B.top, pv, hg, new THREE.Matrix4().makeTranslation(-hg[0] * S, -hg[1] * S, -hg[2] * S));
      if (B.top === 'flap') {
        // adhesive tape on the inside of the flap, near its edge; hidden while the flap is shut (it is sandwiched anyway)
        const v0 = 3 / B.fh, v1 = v0 + Math.min(10, B.fh * .35) / B.fh;
        const tape = new THREE.Mesh(gridGeo((u, v) => { const p = st.f(.03 + .94 * u, v0 + (v1 - v0) * v); p[2] -= .1; return p; }, 48, 4, hg), rt.tapeMat);
        tape.raycast = () => {}; pv.add(tape); rt.bagTape = tape;
      }
    }
  }
  if (B.ext) {
    face('extFront', rt.group); face('extBack', rt.group);
    const [zf, zb] = B.extZ, zc = B.extZc, r = B.extShut, yt = B.extTop;
    const bend = new THREE.Mesh(gridGeo((u, v) => [(u - .5) * B.ew, yt + r * Math.sin(Math.PI * v), zc + r * Math.cos(Math.PI * v)], 2, 10), rt.cardMat);
    bend.castShadow = bend.receiveShadow = true; bend.userData = { objId: o.id, face: null }; rt.group.add(bend);
    const n = +o.ext.staples === 1 ? [0] : [-B.ew * .27, B.ew * .27];
    for (const x of n) for (const z of [zf + .25, zb - .25]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(11 * S, .7 * S, .45 * S), rt.metalMat);
      sp.position.set(x * S, (B.extBagTop - B.ov / 2) * S, z * S); sp.castShadow = true; rt.group.add(sp);   // through card and bag
    }
  }
  // the product inside: a cut-out photo, softened behind frosty film or tracing paper
  const pr = o.product, im = pr?.src && getImg(pr.src);
  if (im) {
    const k = Math.min(1, 1024 / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
    const blur = film ? BAG_FILM[o.bagMat].blur * Math.max(w, h) : 0, pad = Math.ceil(blur * 2.5);
    const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2;
    const x = c.getContext('2d'); if (blur) x.filter = `blur(${blur}px)`; x.drawImage(im, pad, pad, w, h);
    rt.productTex?.dispose(); rt.productTex = new THREE.CanvasTexture(c); rt.productTex.colorSpace = THREE.SRGBColorSpace;
    rt.productMat.map = rt.productTex; rt.productMat.needsUpdate = true;
    const pw = clamp(pr.w, 5, 1000), ph = pw * h / w, sc = (w + pad * 2) / w;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw * sc * S, ph * (h + pad * 2) / h * S), rt.productMat);
    m.position.set((pr.x || 0) * S, ((pr.y ?? 6) + ph / 2) * S, 0); m.userData = { objId: o.id, face: null }; m.raycast = () => {};
    rt.group.add(m);
  }
}
/* heat seals of a film bag: fine ribs along the sealed sides (and the top seal) */
function bagSeals(c, o, W, H) {
  const B = bagDims(o), k = W / B.W, sw = B.seam * k;
  c.save(); c.strokeStyle = 'rgba(255,255,255,.32)'; c.lineWidth = Math.max(1, .35 * k);
  c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(0, 0, sw, H); c.fillRect(W - sw, 0, sw, H);
  c.beginPath();
  for (let y = 0; y < H; y += .9 * k) { c.moveTo(0, y); c.lineTo(sw, y); c.moveTo(W - sw, y); c.lineTo(W, y); }
  if (B.sealTop) { const th = B.sealTop * k; c.fillRect(sw, 0, W - 2 * sw, th); for (let x = 0; x < W; x += .9 * k) { c.moveTo(x, 0); c.lineTo(x, th); } }
  c.stroke(); c.restore();
}
/* bag die: an edge two panels share is a fold, any other edge is cut; seals and the tape are marked */
function bagSVG(o, n, f, label) {
  const segs = [], key = (a, b, c, d) => [a, b, c, d].map(v => v.toFixed(2)).join(',');
  const edges = p => [[p.x, p.y, p.x + p.w, p.y], [p.x, p.y + p.h, p.x + p.w, p.y + p.h], [p.x, p.y, p.x, p.y + p.h], [p.x + p.w, p.y, p.x + p.w, p.y + p.h]];
  const cut = [], fold = new Map(), zig = [];
  for (const p of n.panels) for (const [x1, y1, x2, y2] of edges(p)) {
    // the serrated mouth edge is cut as teeth
    if (p.zig && y1 === y2 && Math.abs(y1 - (p.zig === 'top' ? p.y : p.y + p.h)) < 1e-6) {
      const k = Math.max(1, Math.round((x2 - x1) / ZIG.pitch)), d = p.zig === 'top' ? ZIG.h : -ZIG.h, pts = [];
      for (let i = 0; i <= 2 * k; i++) pts.push([x1 + (x2 - x1) * i / (2 * k), y1 + (i % 2 ? d : 0)]);
      zig.push(pts); continue;
    }
    const hor = y1 === y2; let parts = [[hor ? x1 : y1, hor ? x2 : y2]];
    const shared = [];
    for (const q of n.panels) if (q !== p) for (const [a1, b1, a2, b2] of edges(q)) {
      if (hor ? (b1 === b2 && Math.abs(b1 - y1) < 1e-6) : (a1 === a2 && Math.abs(a1 - x1) < 1e-6)) {
        const s0 = Math.max(hor ? x1 : y1, hor ? Math.min(a1, a2) : Math.min(b1, b2)), s1 = Math.min(hor ? x2 : y2, hor ? Math.max(a1, a2) : Math.max(b1, b2));
        if (s1 - s0 > .01) shared.push([s0, s1]);
      }
    }
    for (const [s0, s1] of shared) {
      fold.set(hor ? key(s0, y1, s1, y1) : key(x1, s0, x1, s1), hor ? [s0, y1, s1, y1] : [x1, s0, x1, s1]);
      parts = parts.flatMap(([u, v]) => [[u, Math.min(v, s0)], [Math.max(u, s1), v]].filter(([a, b]) => b - a > .01));
    }
    for (const [u, v] of parts) cut.push(hor ? [u, y1, v, y1] : [x1, u, x1, v]);
  }
  const line = (l, st) => `<line x1="${f(l[0])}" y1="${f(l[1])}" x2="${f(l[2])}" y2="${f(l[3])}" ${st}/>`;
  let body = cut.map(l => line(l, 'stroke="#00a0e3" stroke-width="0.3"')).join('');
  body += zig.map(pts => `<polyline points="${pts.map(q => q.map(f).join(',')).join(' ')}" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`).join('');
  body += [...fold.values()].map(l => line(l, 'stroke="#e6007e" stroke-width="0.3" stroke-dasharray="2 1.2"')).join('');
  body += (n.seams || []).map(l => line(l, 'stroke="#2e9e5b" stroke-width="0.3" stroke-dasharray="0.8 0.8"')).join('');
  body += (n.seams?.creases || []).map(l => line(l, 'stroke="#e6007e" stroke-width="0.3" stroke-dasharray="2 1.2"')).join('');
  for (const p of n.panels) {
    const r = n.wins?.[p.key]; if (!r) continue;
    const x = p.rot ? p.x + (1 - r[1]) * p.w : p.x + r[0] * p.w, y = p.rot ? p.y + r[2] * p.h : p.y + (1 - r[3]) * p.h;
    body += `<rect x="${f(x)}" y="${f(y)}" width="${f((r[1] - r[0]) * p.w)}" height="${f((r[3] - r[2]) * p.h)}"${r.r ? ` rx="${f(r.r)}"` : ''} fill="none" stroke="#00a0e3" stroke-width="0.3"/>`;
  }
  if (n.glue) { const g = n.glue; body += `<rect x="${f(g.x)}" y="${f(g.y)}" width="${f(g.w)}" height="${f(g.h)}" fill="none" stroke="#f08c00" stroke-width="0.3" stroke-dasharray="1.5 1"/><text x="${f(g.x + g.w / 2)}" y="${f(g.y + g.h / 2)}" font-family="Arial, sans-serif" font-size="${f(Math.min(3, g.h * .5))}" fill="#f08c00" text-anchor="middle" dominant-baseline="middle">КЛЕЕВАЯ ЛЕНТА (с обратной стороны)</text>`; }
  for (const p of n.panels) {
    if (p.blank) { const fs = Math.max(2.5, Math.min(p.w, p.h) * .12); body += `<text x="${f(p.x + p.w / 2)}" y="${f(p.y + p.h / 2)}" font-family="Arial, sans-serif" font-size="${f(fs)}" fill="#9a9a9a" text-anchor="middle" dominant-baseline="middle"${p.h > p.w ? ` transform="rotate(-90 ${f(p.x + p.w / 2)} ${f(p.y + p.h / 2)})"` : ''}>${esc(p.blank.toUpperCase())}</text>`; }
    else body += label(p);
  }
  return body;
}

export { BAG_FILM, BAG_LABEL, BAG_MATS, BAG_TOPS, EXT_KEYS, applyBagPreset, bagDims, bagFilm, bagNet, bagSVG, bagSeals, bagWindows, buildBag, defaultBagWin };
