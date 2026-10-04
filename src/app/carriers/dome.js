// Лоток с прозрачной крышкой-призмой
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';
import { LID_WALLS } from '../core/constants.js';
import { faceMM } from '../core/model.js';
import { floor } from '../scene/renderer.js';
import { loopSurface, quadGeo, rrLoop, rrectPts } from '../scene/geometry.js';

const applyDomePreset = (o, p) => Object.assign(o, { trayH: p.dome.trayH, botK: p.dome.botK, flangeW: p.dome.flange, domeTop: p.dome.top, cornerR: p.dome.cr, lid: 0 });
/* ---------- tray with a clear domed lid ----------
   A pressed board tray whose walls flare outward from a smaller floor, closed by a thermoformed PET lid:
   a flat flange that sits on the tray rim and a truncated pyramid with rounded corners and shoulders.
   dims: w × d = outer size of the tray at the rim, h = total height with the lid. */
function domeGeom(o) {
  const { w, d, h } = o.dims;
  const trayH = clamp(o.trayH ?? h * .45, 10, Math.max(10, h - 15)), bk = clamp(o.botK ?? .66, .3, 1);
  const wb = w * bk, db = d * bk, T = clamp(o.thickness, .3, Math.min(w, d, trayH) / 4);
  const hd = Math.max(8, h - trayH), fl = clamp(o.flangeW ?? 8, 0, 30);
  const Aw = w / 2, Bd = d / 2, kt = clamp(o.domeTop ?? .6, .2, .92), At = Aw * kt, Bt = Bd * kt;
  const rsA = clamp(Math.min(At, Bt) * .35, 3, hd * .5), cr = clamp(o.cornerR ?? 12, 0, Math.min(Aw, Bd) * .8);
  const Af = Math.max(4, At - rsA), Bf = Math.max(4, Bd * Af / Aw);   // flat top: where the print goes
  return { w, d, h, trayH, wb, db, T, hd, fl, Aw, Bd, At, Bt, rsA, cr, Af, Bf,
    Lf: Math.hypot(trayH, (d - db) / 2), Ls: Math.hypot(trayH, (w - wb) / 2) };   // slant of the front/back and of the side walls
}
/* lid outline as a stack of rounded rectangles, from the flange tip up over the shoulder to the flat top */
function domeProfile(G) {
  const { Aw, Bd, At, Bt, hd, fl, rsA, cr } = G, P = [];
  const add = (A, B, y) => P.push({ A, B, y, r: clamp(cr * A / Aw, 1.5, Math.min(A, B) - .3) });
  add(Aw + fl, Bd + fl, -1.4); add(Aw + fl, Bd + fl, .4); add(Aw + .5, Bd + .5, 1); P.base = P.length;
  const b = [Aw - 1.2, Bd - 1.2, 1.4], c = [At, Bt, hd], len = Math.hypot(b[0] - c[0], b[2] - c[2]), sg = clamp(rsA / len, .08, .5);
  const s0 = c.map((v, i) => v + (b[i] - v) * sg), s1 = [Math.max(3, At - rsA), Math.max(3, Bt - rsA * Bd / Aw), hd];
  add(...b);
  for (let i = 0; i <= 7; i++) { const t = i / 7, a = (1 - t) * (1 - t), m = 2 * (1 - t) * t, e = t * t; add(a * s0[0] + m * c[0] + e * s1[0], a * s0[1] + m * c[1] + e * s1[1], a * s0[2] + m * c[2] + e * s1[2]); }
  return P;
}
/* one side of the lid (front, right, back, left): for every profile ring its distance along the side's
   normal, the half length of its straight part (between the rounded corners) and its height */
const DOME_SIDES = { front: ['lidFront', 0, 1], right: ['lidRight', 1, 0], back: ['lidBack', 0, -1], left: ['lidLeft', -1, 0] };
function domeSide(o, lidKey, G = domeGeom(o), prof = domeProfile(G)) {
  const [wall, [, nx, nz]] = Object.entries(DOME_SIDES).find(([, v]) => v[0] === lidKey);
  const pts = prof.map(q => ({ pos: nx ? q.A : q.B, ext: Math.max(.5, (nx ? q.B : q.A) - q.r), y: q.y }));
  // a point of the side in lid space: s runs along the side, to the right as seen from outside
  const at = (i, sg) => { const q = pts[i]; return [nx * q.pos + nz * q.ext * sg, q.y, nz * q.pos - nx * q.ext * sg]; };
  return { wall, nx, nz, pts, at, base: prof.base, n: prof.length };
}
function domeNet(o) {
  // star layout: the floor in the middle, a wall folded up from each of its edges, wide (rim) edge outermost
  const G = domeGeom(o), { w, d, wb, db, Lf, Ls } = G;
  const W0 = Math.max(w, wb + 2 * Ls), H0 = Math.max(d, db + 2 * Lf), x0 = (W0 - wb) / 2, y0 = (H0 - db) / 2, cx = W0 / 2, cy = H0 / 2;
  const panels = [
    { key: 'front', x: cx - w / 2, y: y0 - Lf, w, h: Lf, poly: [[cx - wb / 2, y0], [cx + wb / 2, y0], [cx + w / 2, y0 - Lf], [cx - w / 2, y0 - Lf]] },
    { key: 'back', x: cx - w / 2, y: y0 + db, w, h: Lf, q: 2, poly: [[cx - wb / 2, y0 + db], [cx + wb / 2, y0 + db], [cx + w / 2, y0 + db + Lf], [cx - w / 2, y0 + db + Lf]] },
    { key: 'right', x: x0 + wb, y: cy - d / 2, w: Ls, h: d, q: 1, poly: [[x0 + wb, cy - db / 2], [x0 + wb, cy + db / 2], [x0 + wb + Ls, cy + d / 2], [x0 + wb + Ls, cy - d / 2]] },
    { key: 'left', x: x0 - Ls, y: cy - d / 2, w: Ls, h: d, q: 3, poly: [[x0, cy - db / 2], [x0, cy + db / 2], [x0 - Ls, cy + d / 2], [x0 - Ls, cy - d / 2]] },
    { key: 'bottom', x: x0, y: y0, w: wb, h: db }];
  // the clear lid is thermoformed, not die-cut: its print area sits apart as a separate part
  const gap = 15, [tw, th] = faceMM(o, 'top');
  let px = 0, py = H0 + gap, rowH = 0, W = W0;
  const place = (pw, ph) => { if (px > 0 && px + pw > Math.max(W0, tw)) { px = 0; py += rowH + gap; rowH = 0; } const r = [px, py]; px += pw + gap; rowH = Math.max(rowH, ph); W = Math.max(W, px - gap); return r; };
  const [x1, y1] = place(tw, th);
  panels.push({ key: 'top', x: x1, y: y1, w: tw, h: th, part: true, r: Math.min(G.cr * G.Af / G.Aw, tw / 2, th / 2) });
  for (const key of LID_WALLS) {
    // a slope of the lid: wide at the flange, narrower at the shoulder
    const [pw, ph] = faceMM(o, key), sd = domeSide(o, key, G), e = sd.pts[sd.base + 1].ext, [x, y] = place(pw, ph);
    panels.push({ key, x, y, w: pw, h: ph, part: true, poly: [[x, y + ph], [x + pw, y + ph], [x + pw / 2 + e, y], [x + pw / 2 - e, y]] });
  }
  return { W, H: py + rowH, panels, dome: G };
}
function buildDome(o, rt) {
  const G = domeGeom(o), { w, d, wb, db, T, trayH: H } = G, g = rt.group, P = Math.PI, F = k => rt.faces[k].mat;
  const mesh = (parent, geo, mat, data = {}, shadow = true) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = shadow; m.userData = { objId: o.id, face: null, ...data }; parent.add(m); return m;
  };
  // the four flared walls. Each is a quad from the floor edge up to the rim; the design is the sheet
  // rectangle (rim width × slant), so the floor edge shows the middle part of it, as on the die
  const walls = [['front', 0, 1, w, wb, d / 2, db / 2], ['back', 0, -1, w, wb, d / 2, db / 2], ['right', 1, 0, d, db, w / 2, wb / 2], ['left', -1, 0, d, db, w / 2, wb / 2]];
  for (const [key, nx, nz, wt, wf, dt, df] of walls) {
    const tx = nz, tz = -nx;   // runs to the right as seen from outside
    const pt = (dist, wid, k, y) => [nx * dist + tx * wid * k, y, nz * dist + tz * wid * k];
    mesh(g, quadGeo([pt(df, wf, -.5, 0), pt(df, wf, .5, 0), pt(dt, wt, .5, H), pt(dt, wt, -.5, H)],
      [[.5 - wf / wt / 2, 0], [.5 + wf / wt / 2, 0], [1, 1], [0, 1]]), F(key), { face: key });
    // inner side and the rim strip (the cut edge of the board)
    const q = (dist, wid, k, y) => pt(dist - T, wid - 2 * T, k, y);
    mesh(g, quadGeo([q(df, wf, -.5, T), q(df, wf, .5, T), q(dt, wt, .5, H), q(dt, wt, -.5, H)]), rt.innerMat, {});
    mesh(g, quadGeo([pt(dt, wt, -.5, H), pt(dt, wt, .5, H), q(dt, wt, .5, H), q(dt, wt, -.5, H)]), rt.edgeMat, {}, false);
  }
  const bottom = mesh(g, new THREE.PlaneGeometry(wb * S, db * S), F('bottom'), { face: 'bottom' }); bottom.rotation.x = P / 2;
  const floor = mesh(g, new THREE.PlaneGeometry((wb - 2 * T) * S, (db - 2 * T) * S), F('insideBottom'), { face: 'insideBottom' }); floor.rotation.x = -P / 2; floor.position.y = T * S;
  // clear PET lid: a thin shell (flange, then the dome) plus its print overlay on the flat top
  const lg = new THREE.Group(); lg.position.y = H * S; g.add(lg); rt.domeLid = lg;
  const prof = domeProfile(G), loops = prof.map(q => rrLoop(q.A, q.B, q.r, q.y));
  for (const [i0, i1, cap] of [[0, prof.base, false], [prof.base, prof.length - 1, true]]) { const sh = mesh(lg, loopSurface(loops, i0, i1, cap), rt.petMat, {}, false); sh.raycast = () => {}; }
  for (const i of [1, prof.base, prof.length - 1]) {
    const ln = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loops[i].map(p => new THREE.Vector3(p[0] * S, p[1] * S, p[2] * S))), rt.petEdgeMat);
    ln.raycast = () => {}; ln.renderOrder = 4; lg.add(ln);
  }
  for (const key of LID_WALLS) {
    const sd = domeSide(o, key, G, prof), b = sd.base, e = sd.pts[b + 1].ext / sd.pts[b].ext / 2;
    const P4 = [sd.at(b, -1), sd.at(b, 1), sd.at(b + 1, 1), sd.at(b + 1, -1)].map(p => new THREE.Vector3(...p));
    const n = new THREE.Vector3().crossVectors(P4[1].clone().sub(P4[0]), P4[3].clone().sub(P4[0])).normalize().multiplyScalar(.06);
    const m = mesh(lg, quadGeo(P4.map(p => p.add(n).toArray()), [[0, 0], [1, 0], [.5 + e, 1], [.5 - e, 1]]), F(key), { face: key }, false); m.renderOrder = 3;
  }
  const [tw, th] = faceMM(o, 'top'), top = prof[prof.length - 1], rf = Math.min(top.r, tw / 2 - .1, th / 2 - .1);
  const pg = new THREE.ShapeGeometry(new THREE.Shape(rrectPts(0, 0, tw * S, th * S, rf * S))), pp = pg.attributes.position, pu = pg.attributes.uv;
  for (let i = 0; i < pp.count; i++) pu.setXY(i, pp.getX(i) / (tw * S) + .5, pp.getY(i) / (th * S) + .5);
  const print = mesh(lg, pg, F('top'), { face: 'top' }, false); print.rotation.x = -P / 2; print.position.y = (top.y + .06) * S; print.renderOrder = 3;
}
/* sticker frames of the tray: four sloping walls, the floor and the lid's flat top. A wall's frame is the
   sheet rectangle (rim width × slant) lying in the wall's plane; the part of it beyond the wall's slanted
   side edges is cut off by the mitre plane through that corner, so a film turns the corner instead */
function domeFrames(o, rt) {
  const G = domeGeom(o), { w, d, wb, db, trayH: H, hd, fl } = G, V = a => new THREE.Vector3(...a), I4 = new THREE.Matrix4(), frames = {};
  const lidInv = new THREE.Matrix4().makeTranslation(0, -H * S, 0), lid = rt.domeLid;
  const link = (a, b, e0, e1, { oneWay = false, clip = false } = {}) => {
    frames[a].links.push({ to: b, e0, e1, clip });
    if (!oneWay) frames[b].links.push({ to: a, e0, e1, clip });
  };
  const walls = [['front', 0, 1, w, wb, d / 2, db / 2], ['back', 0, -1, w, wb, d / 2, db / 2], ['right', 1, 0, d, db, w / 2, wb / 2], ['left', -1, 0, d, db, w / 2, wb / 2]];
  for (const [key, nx, nz, wt, wf, dt, df] of walls) {
    const tx = nz, tz = -nx, pt = (dist, wid, k, y) => V([nx * dist + tx * wid * k, y, nz * dist + tz * wid * k]);
    const corners = [pt(df, wf, -.5, 0), pt(df, wf, .5, 0), pt(dt, wt, .5, H), pt(dt, wt, -.5, H)];
    const bc = corners[0].clone().add(corners[1]).multiplyScalar(.5), sv = corners[2].clone().add(corners[3]).multiplyScalar(.5).sub(bc), h = sv.length();
    sv.divideScalar(h);
    const u = V([tx, 0, tz]);
    frames[key] = { key, c: bc.clone().addScaledVector(sv, h / 2), u, v: sv, n: new THREE.Vector3().crossVectors(u, sv).normalize(), w: wt, h, parent: rt.group, pinv: I4, corners, clip: [], links: [] };
  }
  frames.bottom = { key: 'bottom', c: V([0, 0, 0]), u: V([1, 0, 0]), v: V([0, 0, 1]), n: V([0, -1, 0]), w: wb, h: db, parent: rt.group, pinv: I4, links: [],
    corners: [V([-wb / 2, 0, -db / 2]), V([wb / 2, 0, -db / 2]), V([wb / 2, 0, db / 2]), V([-wb / 2, 0, db / 2])] };
  const [tw, th] = faceMM(o, 'top');
  frames.top = { key: 'top', c: V([0, H + hd, 0]), u: V([1, 0, 0]), v: V([0, 0, -1]), n: V([0, 1, 0]), w: tw, h: th, parent: lid, pinv: lidInv, links: [] };
  // walls meet each other at the corners (mitre planes cut each wall's sheet rectangle there) and the floor at its edges
  const shared = (A, B) => A.corners.filter(p => B.corners.some(q => p.distanceToSquared(q) < 1e-4));
  const wk = ['front', 'back', 'right', 'left'];
  for (const a of wk) for (const b of [...wk, 'bottom']) {
    const A = frames[a], B = frames[b], e = a !== b ? shared(A, B) : [];
    if (e.length !== 2) continue;
    if (b !== 'bottom') { const m = A.n.clone().sub(B.n).normalize(); A.clip.push({ n: m, d: m.dot(e[0]), sign: 1 }); }
    if (wk.indexOf(b) > wk.indexOf(a) || b === 'bottom') link(a, b, e[0], e[1]);
  }
  // the lid, side by side: strips between its profile rings (flange lip, flange, step, the slope that is the
  // printed side, the shoulder) up to the flat top. Off the flange lip a sticker cannot follow the plastic:
  // it bridges through the air onto the tray wall, and only from the lid down (one way)
  const prof = domeProfile(G);
  for (const wall of wk) {
    const lidKey = DOME_SIDES[wall][0], sd = domeSide(o, lidKey, G, prof), at = (i, sg) => V(sd.at(i, sg)).add(V([0, H, 0]));
    const strip = (key, lo, hi, parent, pinv) => {
      const lc = lo[0].clone().add(lo[1]).multiplyScalar(.5), v = hi[0].clone().add(hi[1]).multiplyScalar(.5).sub(lc), h = v.length(); v.divideScalar(h);
      const u = lo[1].clone().sub(lo[0]).normalize();
      frames[key] = { key, c: lc.clone().addScaledVector(v, h / 2), u, v, n: new THREE.Vector3().crossVectors(u, v).normalize(),
        w: Math.max(lo[0].distanceTo(lo[1]), hi[0].distanceTo(hi[1])), h, parent, pinv, links: [] };
    };
    const ring = i => [at(i, -1), at(i, 1)], key = i => i === sd.base ? lidKey : `dome:${wall}:${i}`;
    for (let i = 0; i < sd.n - 1; i++) strip(key(i), ring(i), ring(i + 1), lid, lidInv);
    for (let i = 0; i < sd.n - 2; i++) link(key(i), key(i + 1), ...ring(i + 1));
    link(key(sd.n - 2), 'top', ...ring(sd.n - 1));
    const W = frames[wall], yb = clamp(fl * .6 + 2, 2, H * .5), f = (H - yb) / H;
    const foot = [W.corners[0].clone().lerp(W.corners[3], f), W.corners[1].clone().lerp(W.corners[2], f)];
    strip(`dome:${wall}:bridge`, foot, ring(0), lid, lidInv);
    link(`dome:${wall}:bridge`, key(0), ...ring(0));
    link(`dome:${wall}:bridge`, wall, ...foot, { oneWay: true, clip: true });
  }
  Object.defineProperty(frames, 'walk', { value: Object.keys(frames) });
  Object.defineProperty(frames, 'maxDepth', { value: 16 });
  return frames;
}
/* a sticker folded about the edge two faces share: rotate its centre and axes by the angle between the
   normals. Where the edge runs across a face (the bridge meeting the tray wall), each side keeps only its part */
function domeAcross(A, F, cur) {
  const L = A.links.find(l => l.to === F.key); if (!L) return null;
  const q = new THREE.Quaternion().setFromUnitVectors(A.n, F.n), rot = x => x.clone().applyQuaternion(q);
  const m = { c: rot(new THREE.Vector3().subVectors(cur.c, L.e0)).add(L.e0), su: rot(cur.su), sv: rot(cur.sv) };
  if (L.clip) {
    const e = L.e1.clone().sub(L.e0).normalize(), dA = L.e0.clone().sub(A.c); dA.addScaledVector(e, -dA.dot(e)).normalize();
    const dF = rot(dA);
    m.clipA = { n: dA, d: dA.dot(L.e0), sign: -1 }; m.clipF = { n: dF, d: dF.dot(L.e0), sign: 1 };
  }
  return m;
}

export { applyDomePreset, buildDome, domeAcross, domeFrames, domeGeom, domeNet, domeSide };
