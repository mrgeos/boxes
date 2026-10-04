// Наклейки: рисунок, тень и плёнка в 3D
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';
import { FOILS } from '../core/constants.js';
import { getImg } from '../core/assets.js';
import { artImg } from '../core/vector.js';
import { ensureFont, fontStr } from '../core/fonts.js';
import { RT, maxAniso } from '../scene/renderer.js';
import { torteSample } from '../carriers/torte.js';
import { STICKER_FX, placementsFor, stickerSize } from './placement.js';
import { dragSt } from '../scene/interaction.js';

const tintCache = new Map();
function tinted(src, color) {
  const im = getImg(src); if (!im) return null;
  const key = src + '|' + color; let c = tintCache.get(key);
  if (!c) {
    const k = Math.min(1, 1024 / Math.max(im.naturalWidth, im.naturalHeight));
    c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
    const x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c);
  }
  return c;
}
function stickerPath(c, st, w, h) {
  c.beginPath();
  if (st.kind === 'circle') c.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else c.roundRect(-w / 2, -h / 2, w, h, Math.min(st.radius || 0, w / 2, h / 2));
}
/* the sticker's outline filled with one colour: for its shadow and for the finish maps */
function stickerMask(c, st, color) {
  const [w, h] = stickerSize(st);
  if (st.kind === 'custom') {
    const t = tinted(st.src, color); if (!t) return;
    const ol = st.outline || 0;
    if (ol > 0) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; c.drawImage(t, -w / 2 + Math.cos(a) * ol, -h / 2 + Math.sin(a) * ol, w, h); }
    c.drawImage(t, -w / 2, -h / 2, w, h);
  } else { stickerPath(c, st, w, h); c.fillStyle = color; c.fill(); }
}
function stickerFoil(c, finish, w, h) {
  const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  const cols = finish === 'foil-holo' ? ['#f9c5e4', '#c3e8ff', '#d9ffd2', '#fff6c2', '#e6ccff'] : FOILS[finish];
  cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col));
  return g;
}
/* draws a sticker in its own mm space (origin at its centre); ppm sizes the shadow in pixels */
function drawSticker(c, st, ppm, withShadow = true) {
  const [w, h] = stickerSize(st), foil = st.finish.startsWith('foil');
  if (withShadow && st.finish !== 'clear') {
    c.save(); c.shadowColor = 'rgba(0,0,0,.28)'; c.shadowBlur = Math.max(1, .9 * ppm); c.shadowOffsetY = .35 * ppm;
    stickerMask(c, st, '#ffffff'); c.restore();
  }
  if (st.kind === 'custom') {
    const ol = st.outline || 0, im = artImg(st.src, st.recolor);
    if (ol > 0) { const t = tinted(st.src, '#ffffff'); if (t) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; c.drawImage(t, -w / 2 + Math.cos(a) * ol, -h / 2 + Math.sin(a) * ol, w, h); } }
    if (im && foil) { const t = tinted(st.src, '#000000'); c.save(); c.drawImage(t, -w / 2, -h / 2, w, h); c.globalCompositeOperation = 'source-atop'; c.fillStyle = stickerFoil(c, st.finish, w, h); c.fillRect(-w / 2, -h / 2, w, h); c.restore(); }
    else if (im) c.drawImage(im, -w / 2, -h / 2, w, h);
  } else {
    c.save(); stickerPath(c, st, w, h); c.clip();
    if (!st.clear) { c.fillStyle = foil ? stickerFoil(c, st.finish, w, h) : st.fill; c.fillRect(-w / 2, -h / 2, w, h); }
    const im = st.src && artImg(st.src, st.recolor);
    if (im) {
      const a = im.naturalWidth / im.naturalHeight, k = st.imgScale || .7;
      let iw = w * k, ih = iw / a; if (ih > h * k) { ih = h * k; iw = ih * a; }
      c.drawImage(im, -iw / 2, -ih / 2 - (st.text ? st.textSize * .45 : 0), iw, ih);
    }
    c.restore();
    if (st.strokeW > 0) { stickerPath(c, st, w - st.strokeW, h - st.strokeW); c.lineWidth = st.strokeW; c.strokeStyle = st.stroke; c.stroke(); }
  }
  if (st.text) {
    const L = { font: st.font, weight: st.weight, italic: false, text: st.text }; ensureFont(L);
    c.save(); c.font = fontStr(L, st.textSize); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = st.textColor;
    const im = st.kind !== 'custom' && st.src && getImg(st.src);
    const lines = st.text.split('\n'), lh = st.textSize * 1.1, y0 = (im ? h * .28 : 0) - lh * (lines.length - 1) / 2;
    lines.forEach((ln, i) => c.fillText(ln, 0, y0 + i * lh));
    c.restore();
  }
}
/* soft contact shadow painted on the board under a sticker */
function stickerShadow(c, st, ppm) {
  c.save(); c.filter = `blur(${Math.max(1, .8 * ppm)}px)`; c.globalAlpha = st.finish === 'clear' ? .1 : .3 + Math.min(.2, (st.thick || 0) * .1);
  c.translate(0, .3 + (st.thick || 0) * .4); stickerMask(c, st, '#000000'); c.restore();
}
/* the sticker as a film in 3D. A grid follows the faces (folded over edges, projected over flaps
   and lids); where the surface underneath steps down the film bridges the step instead of
   following it, and it splits along the opening line, each piece riding with its own part. */
function stickerMaterial(params, offset) {
  const m = new THREE.MeshPhysicalMaterial(params);
  m.userData.off = { value: offset };
  m.onBeforeCompile = sh => {
    sh.uniforms.uStOff = m.userData.off;
    sh.vertexShader = 'uniform float uStOff;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(objectNormal) * uStOff;');
  };
  m.customProgramCacheKey = () => 'sticker-film-v1';
  return m;
}
const stickerMargin = st => (st.kind === 'custom' ? st.outline || 0 : 0) + .5;
function stickerLook(rt, st) {
  rt.stickerLook ??= new Map();
  const key = JSON.stringify({ ...st, x: 0, y: 0, face: 0, rot: 0, visible: 0, loaded: !!(st.src && getImg(st.src)) });
  let L = rt.stickerLook.get(st.id);
  if (L && L.key === key) return L;
  if (L) { L.tex.dispose(); L.edgeTex.dispose(); L.art.dispose(); L.edges.forEach(e => e.dispose()); }
  const [w, h] = stickerSize(st), m = stickerMargin(st), ew = w + 2 * m, eh = h + 2 * m;
  const ppm = Math.min(12, 2048 / Math.max(ew, eh));
  const paint = fn => { const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(ew * ppm)); c.height = Math.max(2, Math.round(eh * ppm));
    const x = c.getContext('2d'); x.setTransform(c.width / ew, 0, 0, c.height / eh, c.width / 2, c.height / 2); fn(x); return c; };
  const tex = new THREE.CanvasTexture(paint(x => drawSticker(x, st, ppm, false)));
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso;
  // the edge colour: paper for opaque stickers, a darker tone of the fill for coloured ones
  const edgeCol = st.finish === 'clear' ? '#dfe7ea' : new THREE.Color(st.kind === 'custom' ? '#ece9e2' : st.fill).multiplyScalar(.82).getStyle();
  const edgeTex = new THREE.CanvasTexture(paint(x => stickerMask(x, st, edgeCol)));
  edgeTex.colorSpace = THREE.SRGBColorSpace;
  const [r, mt] = STICKER_FX[st.finish] || STICKER_FX.gloss, thick = Math.max(0, st.thick ?? .2) * S;
  const art = stickerMaterial({ map: tex, transparent: true, alphaTest: .04, roughness: r, metalness: mt, clearcoat: st.finish === 'gloss' ? .6 : 0, clearcoatRoughness: .1,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, thick);
  const layers = thick > .03 * S ? clamp(Math.ceil(thick / (.04 * S)), 2, 40) : 0, edges = [];
  for (let i = 0; i < layers; i++) edges.push(stickerMaterial({ map: edgeTex, alphaTest: .5, roughness: .85, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }, thick * i / layers));
  L = { key, tex, edgeTex, art, edges, ext: [ew, eh] }; rt.stickerLook.set(st.id, L);
  return L;
}
function buildStickerFilms(o) {
  const rt = RT.get(o.id); if (!rt) return;
  for (const m of rt.stickerMeshes || []) { m.parent?.remove(m); if (m.userData.own) m.geometry.dispose(); }
  rt.stickerMeshes = [];
  if (!rt.frames) return;
  const lift = .1, V = () => new THREE.Vector3();
  for (const st of o.stickers || []) {
    if (!st.visible) continue;
    const torte = o.type === 'torte', pls = torte ? [] : placementsFor(o, st).filter(pl => rt.frames[pl.key]); if (!pls.length && !torte) continue;
    const look = stickerLook(rt, st), [ew, eh] = look.ext;
    const step = Math.max(.7, Math.max(ew, eh) / 110) * (dragSt ? 2 : 1), nx = Math.max(2, Math.ceil(ew / step) + 1), ny = Math.max(2, Math.ceil(eh / step) + 1), N = nx * ny;
    const P = new Array(N), Nn = new Array(N), own = new Array(N), sup = new Array(N);
    if (torte) torteSample(o, rt, st, ew, eh, nx, ny, P, Nn, own, sup, lift);
    else for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const sx = -ew / 2 + ew * i / (nx - 1), sy = -eh / 2 + eh * j / (ny - 1);
      let best = null, near = null, nearD = Infinity;
      for (const { key, M, clips } of pls) {
        const F = rt.frames[key], X = M[0] * sx + M[2] * sy + M[4], Y = M[1] * sx + M[3] * sy + M[5];
        const p = F.map ? F.map(X, Y) : F.c.clone().addScaledVector(F.u, X - F.w / 2).addScaledVector(F.v, F.h / 2 - Y);
        let out = Math.max(0, -X, X - F.w) + Math.max(0, -Y, Y - F.h);
        for (const cl of clips || []) out += Math.max(0, -cl.sign * (p.dot(cl.n) - cl.d));
        if (out < 1e-6) { if (!best || (best.F.n.dot(F.n) > .99 && p.dot(F.n) > best.p.dot(F.n))) best = { p, F, X, Y }; }
        else if (out < nearD) { nearD = out; near = { p, F, X, Y }; }
      }
      const hit = best || near, k = j * nx + i, nn = hit.F.nrm ? hit.F.nrm(hit.X, hit.Y) : hit.F.n;
      P[k] = hit.p.addScaledVector(nn, lift); Nn[k] = nn; own[k] = hit.F; sup[k] = !!best || nearD < 1;
    }
    // tension as a rolling ball of radius r: the film follows what a ball pressed onto the sticker
    // from outside can reach, so it fillets inner corners and ramps over steps, while flat areas and
    // outer edges keep full contact. For each point: rest balls on nearby surface samples, keep the
    // ones that don't dig into any other sample, and lift the point onto the nearest such ball.
    if (!torte) {
    const t = clamp(st.tension ?? .5, 0, 1), r = .3 + 15 * t * t;
    const cell = Math.max(r, step * 1.5), X = new Float64Array(N * 3), CC = new Float64Array(N * 3);
    for (let k = 0; k < N; k++) { X[k * 3] = P[k].x; X[k * 3 + 1] = P[k].y; X[k * 3 + 2] = P[k].z; }
    // samples are hashed per surface: a ball resting on a plane can only be blocked by other surfaces
    const key = (i, j, l) => ((i * 73856093) ^ (j * 19349663) ^ (l * 83492791)) | 0, planes = new Map();
    const hashOf = F => { let h = planes.get(F); if (!h) planes.set(F, h = new Map()); return h; };
    for (let k = 0; k < N; k++) {
      const h = hashOf(own[k]), kk = key(Math.floor(X[k * 3] / cell), Math.floor(X[k * 3 + 1] / cell), Math.floor(X[k * 3 + 2] / cell));
      let l = h.get(kk); if (!l) h.set(kk, l = []); l.push(k);
    }
    const near = (x, y, z, span, fn, skip = null, only = null) => {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (const [F, hash] of planes) {
        if (F === skip || (only && !only(F))) continue;
        for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) for (let c = -span; c <= span; c++) {
          const list = hash.get(key(cx + a, cy + b, cz + c)); if (list) for (let i = 0; i < list.length; i++) if (fn(list[i]) === false) return;
        }
      }
    };
    const ok = new Uint8Array(N), r2 = (r - .02) ** 2;
    for (let q = 0; q < N; q++) {
      const cx = X[q * 3] + Nn[q].x * r, cy = X[q * 3 + 1] + Nn[q].y * r, cz = X[q * 3 + 2] + Nn[q].z * r;
      CC[q * 3] = cx; CC[q * 3 + 1] = cy; CC[q * 3 + 2] = cz;
      let free = 1;
      near(cx, cy, cz, 1, j => { const dx = X[j * 3] - cx, dy = X[j * 3 + 1] - cy, dz = X[j * 3 + 2] - cz; if (dx * dx + dy * dy + dz * dz < r2) { free = 0; return false; } }, own[q]);
      ok[q] = free;
    }
    // points no free ball touches sit under the fillet: move each radially onto the nearest free ball,
    // which keeps their order along the arc, so the film stays one continuous sheet
    const moved = new Array(N);
    for (let k = 0; k < N; k++) {
      if (ok[k]) continue;
      const px = X[k * 3], py = X[k * 3 + 1], pz = X[k * 3 + 2];
      let best = Infinity, bq = -1;
      near(px, py, pz, 2, q => {
        if (!ok[q]) return;
        const dx = px - CC[q * 3], dy = py - CC[q * 3 + 1], dz = pz - CC[q * 3 + 2], d = dx * dx + dy * dy + dz * dz;
        if (d < best) { best = d; bq = q; }
      });
      if (bq < 0) continue;
      const d = Math.sqrt(best); if (d - r >= r || d < 1e-9) continue;
      const f = r / d; moved[k] = new THREE.Vector3(CC[bq * 3] + (px - CC[bq * 3]) * f, CC[bq * 3 + 1] + (py - CC[bq * 3 + 1]) * f, CC[bq * 3 + 2] + (pz - CC[bq * 3 + 2]) * f);
    }
    for (let k = 0; k < N; k++) if (moved[k]) P[k].copy(moved[k]);
    }
    // one geometry per rigid part; a cell rides with the part under its first corner
    const byPart = new Map();
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, F = own[a];
      if (!sup[a] || !sup[a + 1] || !sup[a + nx] || !sup[a + nx + 1]) continue;   // nothing underneath: no film in the air
      if (!byPart.has(F.parent)) byPart.set(F.parent, { F, idx: [] });
      byPart.get(F.parent).idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
    for (const [parent, { F, idx }] of byPart) {
      const pos = new Float32Array(N * 3), uv = new Float32Array(N * 2), tmp = V();
      for (let k = 0; k < N; k++) {
        tmp.copy(P[k]).multiplyScalar(S).applyMatrix4(F.pinv); pos.set([tmp.x, tmp.y, tmp.z], k * 3);
        uv.set([(k % nx) / (nx - 1), 1 - Math.floor(k / nx) / (ny - 1)], k * 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      // make normals face outward (along the face normal in the part's space)
      const nPart = F.n.clone().transformDirection(F.pinv), nrm = geo.attributes.normal;
      if (nrm.count && new THREE.Vector3().fromBufferAttribute(nrm, idx[0]).dot(nPart) < 0) { geo.setIndex(idx.map((_, t) => idx[t - (t % 3) + [0, 2, 1][t % 3]])); geo.computeVertexNormals(); }
      const mk = (mat, own, order) => { const m = new THREE.Mesh(geo, mat); m.raycast = () => {}; m.receiveShadow = true; m.renderOrder = order; m.userData.own = own; parent.add(m); rt.stickerMeshes.push(m); };
      look.edges.forEach((mat, i) => mk(mat, false, 2));
      mk(look.art, true, 3);
    }
  }
}

export { buildStickerFilms, drawSticker, stickerMargin, stickerMask, stickerShadow, tintCache };
