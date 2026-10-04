// Бумажный стакан: конус, развёртка веером
import * as THREE from 'three';
import { S, clamp, pixelsOf, sampleInto } from '../core/util.js';

/* ---------- paper cup ----------
   The printed side wall is a cone. It is designed on a rectangle that maps onto the cone conformally:
   shapes keep their proportions, horizontal lines stay horizontal, and things grow toward the wider rim
   (scale 1 at the middle). For print the wall unrolls exactly into a fan (annular sector). */
function cupGeom(o) {
  const Dt = o.dims.w, H = o.dims.h, Db = Math.min(o.dims.d, Dt);
  const rr = clamp(Dt * .021, 1, 2.4), Rc = Dt / 2 - rr, yTop = H - rr;          // rolled rim: tube radius, centre
  const dbl = o.cupWall !== 'single', gap = dbl ? 1.3 : .05;
  const rw0 = Db / 2, rw1 = Rc - rr * .7, rw = y => rw0 + (rw1 - rw0) * y / yTop;  // inner cup wall
  // double wall: the printed sleeve starts above the base and stops under the rim
  const y0 = dbl ? clamp(H * .085, 4, 14) : 0, y1 = yTop - rr * (dbl ? 1.25 : .8);
  const r0 = rw(y0) + gap, r1 = rw(y1) + gap, L = Math.hypot(r1 - r0, y1 - y0), sa = (r1 - r0) / L, ca = (y1 - y0) / L;
  const G = { Dt, Db, H, rr, Rc, yTop, dbl, gap, rw, y0, y1, r0, r1, L, sa, ca, cone: sa > .002 };
  if (G.cone) {
    G.s0 = r0 / sa; G.s1 = r1 / sa; G.Phi = 2 * Math.PI * sa; G.lnk = Math.log(G.s1 / G.s0); G.Sm = Math.sqrt(G.s0 * G.s1);
    G.Wr = G.Phi * G.Sm; G.Hr = G.Sm * G.lnk;
  } else { G.Wr = Math.PI * (r0 + r1); G.Hr = L; }
  return G;
}
/* distance along the slant from the bottom of the print for design height v (0 bottom … 1 top) */
const cupSlant = (G, v) => G.cone ? G.s0 * Math.exp(v * G.lnk) - G.s0 : v * G.L;
const CUP_GLUE = 8;
   // mm of overlap at the seam
/* flat layout of the printed wall: apex below the sheet, the rim edge is the upper arc */
function cupFan(G) {
  if (!G.cone) { const gU = CUP_GLUE / G.Wr; return { G, cone: false, gU, W: G.Wr * (1 + gU), H: G.Hr }; }
  const gU = CUP_GLUE / (G.Phi * G.Sm), pts = [];
  for (let i = 0; i <= 200; i++) {
    const psi = (-gU + (1 + gU) * i / 200 - .5) * G.Phi;
    for (const s of [G.s0, G.s1]) pts.push([s * Math.sin(psi), -s * Math.cos(psi)]);
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), mx = Math.min(...xs), my = Math.min(...ys);
  return { G, cone: true, gU, ax: -mx, ay: -my, W: Math.max(...xs) - mx, H: Math.max(...ys) - my };
}
/* sheet point (mm) → design uv; u runs past 0 into the glue overlap */
function fanUV(F, X, Y) {
  const G = F.G;
  if (!F.cone) { const u = X / G.Wr - F.gU, v = 1 - Y / G.Hr; return v < 0 || v > 1 || u < -F.gU || u > 1 ? null : [u, v]; }
  const dx = X - F.ax, dy = F.ay - Y, u = Math.atan2(dx, dy) / G.Phi + .5, v = Math.log(Math.hypot(dx, dy) / G.s0) / G.lnk;
  return v < 0 || v > 1 || u < -F.gU || u > 1 ? null : [u, v];
}
function fanXY(F, u, v) {
  const G = F.G;
  if (!F.cone) return [(u + F.gU) * G.Wr, (1 - v) * G.Hr];
  const s = G.s0 * Math.exp(v * G.lnk), psi = (u - .5) * G.Phi;
  return [F.ax + s * Math.sin(psi), F.ay - s * Math.cos(psi)];
}
/* the wall design (rectangle) warped onto the fan, as a canvas of pw × ph px covering F.W × F.H mm */
function fanImage(F, src, pw, ph) {
  const S = pixelsOf(src, Math.max(pw, ph) * 2), out = document.createElement('canvas');
  out.width = pw; out.height = ph;
  const x = out.getContext('2d'), img = x.createImageData(pw, ph), D = img.data;
  for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
    const uv = fanUV(F, (i + .5) / pw * F.W, (j + .5) / ph * F.H); if (!uv) continue;
    sampleInto(D, (j * pw + i) * 4, S, uv[0] - Math.floor(uv[0]), 1 - uv[1], true);
  }
  x.putImageData(img, 0, 0);
  return out;
}
/* the reverse: a full fan layout (e.g. an uploaded print file) cut back into the wall rectangle */
const fanCache = new Map();
function fanToRect(F, im, W, H, key) {
  const k = `${key}|${W}x${H}|${F.W.toFixed(3)}x${F.H.toFixed(3)}`;
  if (fanCache.has(k)) return fanCache.get(k);
  const S = pixelsOf(im, 4096), out = document.createElement('canvas'); out.width = W; out.height = H;
  const x = out.getContext('2d'), img = x.createImageData(W, H), D = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const [X, Y] = fanXY(F, (i + .5) / W, 1 - (j + .5) / H);
    sampleInto(D, (j * W + i) * 4, S, X / F.W, Y / F.H, false);
  }
  x.putImageData(img, 0, 0);
  fanCache.clear(); fanCache.set(k, out);
  return out;
}
/* outline of the fan as an SVG/canvas path in mm: rim arc, seam side, base arc, glue side */
function fanOutline(F, u0 = -F.gU, u1 = 1, n = 96) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(fanXY(F, u0 + (u1 - u0) * i / n, 1));
  for (let i = n; i >= 0; i--) pts.push(fanXY(F, u0 + (u1 - u0) * i / n, 0));
  return pts;
}
function buildCup(o, rt) {
  const G = cupGeom(o), ud = { objId: o.id, face: null };
  const add = (geo, mat, extra = {}) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.userData = { ...ud, ...extra }; rt.group.add(m); return m; };
  // a cone band between heights ya and yb (mm) with radius r(y), open at both ends
  const cone = (ra, rb, ya, yb) => { const g = new THREE.CylinderGeometry(rb * S, ra * S, (yb - ya) * S, 160, 1, true); g.translate(0, (ya + yb) / 2 * S, 0); return g; };
  // printed wall: u around (seam at the back), v up the slant (conformal on a cone)
  const nu = 160, nv = 40, P = [], N = [], UV = [], I = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, d = cupSlant(G, v), r = G.r0 + d * G.sa, y = G.y0 + d * G.ca;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, th = Math.PI + u * Math.PI * 2, sn = Math.sin(th), cs = Math.cos(th);
      P.push(r * sn * S, y * S, r * cs * S); N.push(G.ca * sn, -G.sa, G.ca * cs); UV.push(u, v);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    I.push(a, b, d, a, d, c);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); wg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); wg.setIndex(I);
  add(wg, rt.faces.wrap.mat, { face: 'wrap' });
  const yB = Math.min(6, G.H * .07), tk = .35;
  if (G.dbl) {
    // inner cup shows below the sleeve; its lower edge closes the gap, flush with the sleeve (no lip)
    add(cone(G.rw(0), G.rw(G.yTop), 0, G.yTop), rt.foldMat);
    const ring = new THREE.RingGeometry(G.rw(G.y0) * S, (G.r0 - .03) * S, 160); ring.rotateX(Math.PI / 2); ring.translate(0, G.y0 * S, 0);
    add(ring, rt.foldMat);
  }
  // inside wall and bottom, the base recess underneath, the rolled rim
  add(cone(G.rw(yB) - tk, G.rw(G.yTop) - tk, yB, G.yTop), rt.innerMat);
  const ib = new THREE.CircleGeometry((G.rw(yB) - tk) * S, 96); ib.rotateX(-Math.PI / 2); ib.translate(0, yB * S, 0); add(ib, rt.innerMat);
  const ub = new THREE.CircleGeometry(G.rw(1.5) * S, 96); ub.rotateX(Math.PI / 2); ub.translate(0, 1.5 * S, 0); add(ub, rt.foldMat);
  const rim = new THREE.TorusGeometry(G.Rc * S, G.rr * S, 16, 160); rim.rotateX(Math.PI / 2); rim.translate(0, G.yTop * S, 0); add(rim, rt.foldMat);
  if (o.cupLid) buildCupLid(o, rt, G);
}
/* sip lid: a sunken centre, a wide raised ring with the sip slot at the front and the vent pinhole at the back,
   a riser, and a skirt that snaps over the rim */
function buildCupLid(o, rt, G) {
  const R = G.Dt / 2, k = clamp(R / 42, .85, 1.2), g = new THREE.Group(), top = 13.3 * k;
  const prof = [[0, 9.6], [.54, 9.6], [.58, 10.2], [.62, 12.4], [.67, 13.15], [.72, 13.3], [.81, 13.35], [.89, 13.3], [.92, 12.8], [.935, 11.4], [.94, 9], [.945, 5.2], [.96, 4.3]]
    .map(([r, y]) => [r * R, y * k])
    .concat([[R - .4, 3.9], [R + .9, 3.3], [R + 1.4, 1.8], [R + 1.4, -.6], [R + 1.9, -1.4], [R + 1.9, -2.6], [R + 2.8, -5], [R + 3, -6.4], [R + 2.4, -6.7]].map(([r, y]) => [r, y * k]));
  const curve = new THREE.CatmullRomCurve3(prof.map(([r, y]) => new THREE.Vector3(r * S, y * S, 0)), false, 'centripetal', .2);
  const pts = curve.getSpacedPoints(240).map(p => new THREE.Vector2(Math.max(0, p.x), p.y));
  pts[0].x = 0;
  const lid = new THREE.Mesh(new THREE.LatheGeometry(pts, 128), rt.cupLidMat);
  lid.castShadow = lid.receiveShadow = true; lid.userData = { objId: o.id, face: null }; g.add(lid);
  // height of the lid's top surface at radius rho (mm), so the openings sit exactly on it
  const yAt = rho => {
    const x = rho * S;
    for (let i = 1; i < pts.length; i++) if (pts[i].x >= x && pts[i - 1].x <= x) { const a = pts[i - 1], b = pts[i], t = (x - a.x) / (b.x - a.x || 1); return (a.y + (b.y - a.y) * t) / S + .07; }
    return top + .07;
  };
  // sip slot: a capsule bent along the ring, on its flat top at the front (+z)
  const rc = .78 * R, sw = 9.4 * k, sr = 2.3 * k, sh = new THREE.Shape();
  sh.absarc(sw / 2, 0, sr, -Math.PI / 2, Math.PI / 2, false); sh.absarc(-sw / 2, 0, sr, Math.PI / 2, Math.PI * 1.5, false);
  const sg = new THREE.ShapeGeometry(sh, 24), sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const t = sp.getX(i) / rc, rho = rc + sp.getY(i);
    sp.setXYZ(i, rho * Math.sin(t) * S, yAt(rho) * S, rho * Math.cos(t) * S);
  }
  const slot = new THREE.Mesh(sg, rt.holeMat); slot.userData = { objId: o.id, face: null }; g.add(slot);
  // vent pinhole on the ring, opposite the slot
  const vent = new THREE.Mesh(new THREE.CircleGeometry(.8 * k * S, 16), rt.holeMat);
  vent.rotation.x = -Math.PI / 2; const rv = .755 * R; vent.position.set(0, yAt(rv) * S, -rv * S); vent.userData = { objId: o.id, face: null }; g.add(vent);
  rt.cupLid = g; rt.group.add(g);
}

export { CUP_GLUE, buildCup, cupFan, cupGeom, fanImage, fanOutline, fanToRect, fanXY };
