// Сквозные слои: печать на листе развёртки, поверх всех граней и через их стыки (действия над данными, без интерфейса)
import { DEG } from './util.js';
import { faceKeys, facePx, netLayout } from './model.js';
import { backNet, hasInside } from '../net/net-side.js';
import { inPanel } from '../net/net-view.js';
import { faceToSheet, flatPanel } from '../net/sheet-map.js';
import { apply } from '../faces/wrap.js';
import { layerBox } from '../faces/render.js';
import { markFace } from '../scene/renderer.js';
import { tidyGroups } from './layers.js';

/* A sheet layer is printed on the sheet of the net, not on one face: o.sheet = { front, back }, each { layers, groups }
   like a face (the layer editor and the painter take it as one: o.faces['sheet:front'] is a link to it, not saved).
   Its numbers are shares of the sheet (x, y, an image's w, a shape's w and h of the sheet's width and height, a text's
   size of its height), so a layer lies over the fold between two faces as one piece. The sheet is painted into each
   face it passes over (faces/sheet-paint.js): the face's own layers go over it (tier under, the default) or under it
   (`over`). `anchor` keeps the layer with the faces it belongs to when the box is resized: its place is a share of
   the group of those faces' panels, its size follows the group's width (`stretch`: it fills its part of the group,
   as a band does). Layers are plain: no wrap, clip or finish. `back` is the sheet turned over (the inside's side). */
const SIDES = ['front', 'back'];
const sheetKey = side => 'sheet:' + side;
const isSheetKey = k => k === 'sheet:front' || k === 'sheet:back';
const sheetSide = k => (k === 'sheet:back' ? 'back' : 'front');
const sheetFaces = o => (o.sheet ? SIDES.filter(s => o.sheet[s]).map(s => [sheetKey(s), o.sheet[s]]) : []);
const sheetCount = o => (o.sheet ? SIDES.reduce((n, s) => n + (o.sheet[s]?.layers.length || 0), 0) : 0);
/* makes o.sheet's sides and the links to them (called by ensureFaces for a saved sheet) */
function linkSheet(o) {
  if (!o.sheet) return;
  for (const s of SIDES) {
    o.sheet[s] ??= { layers: [], groups: {} }; o.sheet[s].layers ??= []; o.sheet[s].groups ??= {};
    const k = sheetKey(s);
    if (!Object.getOwnPropertyDescriptor(o.faces, k)) Object.defineProperty(o.faces, k, { get: () => o.sheet?.[s], configurable: true, enumerable: false });
  }
}
function ensureSheet(o) { o.sheet ??= {}; linkSheet(o); return o.sheet; }

/* ---------- the sheet ---------- */
/* the sheet as a net seen from `side` (the back only where the object has an inside) */
const sheetNet = (o, side) => (side === 'back' && hasInside(o) ? backNet(o, netLayout(o)) : netLayout(o));
const sheetMM = o => { const n = netLayout(o); return [n.W, n.H]; };
/* the sheet's picture size, px: [w, h, px per mm] */
function dimsFor(W, H) { const s = Math.min(10, 2048 / Math.max(W, H, 1)); return [Math.max(16, Math.round(W * s)), Math.max(16, Math.round(H * s)), s]; }
const sheetPx = o => dimsFor(...sheetMM(o));
/* the box (mm: x, y, w, h) of the panels of faces `keys` on net n; the whole sheet for none */
function groupBox(n, keys) {
  const ps = keys ? n.panels.filter(p => keys.includes(p.key) && flatPanel(p)) : [];
  if (!ps.length) return [0, 0, n.W, n.H];
  const x0 = Math.min(...ps.map(p => p.x)), y0 = Math.min(...ps.map(p => p.y)), x1 = Math.max(...ps.map(p => p.x + p.w)), y1 = Math.max(...ps.map(p => p.y + p.h));
  return [x0, y0, x1 - x0, y1 - y0];
}

/* ---------- anchors ---------- */
const sizeMM = (L, W, H) => (L.type === 'image' ? { w: L.w * W } : L.type === 'shape' ? { w: L.w * W, h: L.h * H } : { size: L.size * H });
const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
/* (re)takes the layer's anchor from where it lies now: keys = faces it belongs to (null: the whole sheet; undefined: the
   panel under its middle) */
function reanchorLayer(o, side, L, keys = undefined) {
  const n = sheetNet(o, side), W = n.W, H = n.H;
  if (keys === undefined) { const p = n.panels.find(q => flatPanel(q) && inPanel(q, L.x * W, L.y * H)); keys = p ? [p.key] : null; }
  const g = groupBox(n, keys), a = L.anchor;
  L.anchor = { keys, g0: g, sz: [W, H], nx: (L.x * W - g[0]) / g[2], ny: (L.y * H - g[1]) / g[3], m: sizeMM(L, W, H) };
  if (a?.box) L.anchor.box = a.box;
}
/* brings the layers to the box as it is now: where the faces they belong to moved or changed size they follow; where
   nothing changed, the anchor takes the layer's own place (it may have been moved) */
function settleSheet(o, side, n = sheetNet(o, side)) {
  const sh = o.sheet?.[side]; if (!sh) return;
  const W = n.W, H = n.H;
  for (const L of sh.layers) {
    const a = L.anchor; if (!a) continue;
    const g = groupBox(n, a.keys);
    if (same(g, a.g0) && same([W, H], a.sz)) {
      if (!a.box) { a.nx = (L.x * W - g[0]) / g[2]; a.ny = (L.y * H - g[1]) / g[3]; a.m = sizeMM(L, W, H); }
      else a.tgt = [a.box[2] * g[2], a.box[3] * g[3]];
      continue;
    }
    const s = a.g0[2] > 0 ? g[2] / a.g0[2] : 1;
    if (a.box) {
      // a stretched layer fills its part of the group (rect shares of the group's box)
      const [bx, by, bw, bh] = a.box; a.tgt = [bw * g[2], bh * g[3]];
      L.x = (g[0] + (bx + bw / 2) * g[2]) / W; L.y = (g[1] + (by + bh / 2) * g[3]) / H;
      if (L.type === 'shape') { L.w = a.tgt[0] / W; L.h = a.tgt[1] / H; }
    } else {
      L.x = (g[0] + a.nx * g[2]) / W; L.y = (g[1] + a.ny * g[3]) / H;
      if (L.type === 'image') L.w = a.m.w * s / W;
      else if (L.type === 'shape') { L.w = a.m.w * s / W; L.h = a.m.h * s / H; }
      else L.size = a.m.size * s / H;
      a.m = sizeMM(L, W, H);
    }
    a.g0 = g; a.sz = [W, H];
  }
}
/* the layer fills its part of the faces' box (box: shares [x, y, w, h] of it; by default the part it covers now), or
   goes back to keeping its size */
function setSheetStretch(o, side, id, on, box = null) {
  const L = o.sheet?.[side]?.layers.find(l => l.id === id); if (!L) return null;
  const n = sheetNet(o, side);
  if (!on) { delete L.anchor?.box; delete L.anchor?.tgt; if (L.anchor) reanchorLayer(o, side, L, L.anchor.keys); }
  else {
    if (!L.anchor) reanchorLayer(o, side, L);
    const g = groupBox(n, L.anchor.keys), [px, py] = sheetPx(o), [w, h] = layerBox({ ...L, rot: 0 }, px, py).map((v, i) => v / (i ? py : px) * (i ? n.H : n.W));
    const b = box || [(L.x * n.W - w / 2 - g[0]) / g[2], (L.y * n.H - h / 2 - g[1]) / g[3], w / g[2], h / g[3]];
    L.rot = 0; L.anchor.box = b; L.anchor.tgt = [b[2] * g[2], b[3] * g[3]];
    L.x = (g[0] + (b[0] + b[2] / 2) * g[2]) / n.W; L.y = (g[1] + (b[1] + b[3] / 2) * g[3]) / n.H;
    if (L.type === 'shape') { L.w = L.anchor.tgt[0] / n.W; L.h = L.anchor.tgt[1] / n.H; }
  }
  markSheet(o);
  return L;
}

/* ---------- actions ---------- */
/* repaints what a change of the sheet's layers touches: every face (a layer may lie on any) and the sheet's own picture */
function markSheet(o) {
  for (const k of faceKeys(o)) markFace(o, k);
  for (const s of SIDES) markFace(o, sheetKey(s));
}
/* a sheet layer is plain print: no wrap, clip or finish */
function plain(L) { delete L.wrap; delete L.clipTo; delete L.clipBelow; delete L.group; L.effect = 'none'; delete L.over; return L; }
/* puts a layer (new, or one the caller owns) on the sheet's side; its anchor is the faces it lies over (keys: a list, or
   null for the whole sheet); over: printed over the faces' own layers */
function addSheetLayer(o, side, L, { keys = undefined, over = false } = {}) {
  const sh = ensureSheet(o)[side]; plain(L);
  if (over) L.over = true;
  sh.layers.push(L); reanchorLayer(o, side, L, keys);
  markSheet(o);
  return L;
}
function removeSheetLayer(o, side, id) {
  const sh = o.sheet?.[side], L = sh?.layers.find(l => l.id === id); if (!L) return null;
  sh.layers = sh.layers.filter(l => l !== L); tidyGroups(sh); markSheet(o);
  return L;
}
/* puts a layer at (x, y) (shares of the sheet; one of them may be left out); it keeps to the faces it is over now */
function moveSheetLayer(o, side, id, { x = null, y = null } = {}) {
  const L = o.sheet?.[side]?.layers.find(l => l.id === id); if (!L) return null;
  if (x != null) L.x = x;
  if (y != null) L.y = y;
  reanchorLayer(o, side, L, L.anchor?.box ? L.anchor.keys : undefined);
  markSheet(o);
  return L;
}
/* tier of a layer: over the faces' own layers, or under them */
function setSheetTier(o, side, id, over) {
  const L = o.sheet?.[side]?.layers.find(l => l.id === id); if (!L) return null;
  if (over) L.over = true; else delete L.over;
  markSheet(o);
  return L;
}
const turnOf = d => Math.round((((d + 180) % 360 + 360) % 360 - 180) * 10) / 10;
const sideOfFace = (o, k) => (k === 'inside' || k === 'insideBottom' ? 'back' : 'front');
const panelsOf = (n, k) => n.panels.filter(p => p.key === k && flatPanel(p));
/* the panel of face k that point (u, v) (face px) lies on, else the first */
function panelAt(ps, W, H, u, v) { return ps.find(p => { const [X, Y] = apply(faceToSheet(p, W, H).M, [u, v]); return inPanel(p, X, Y); }) || ps[0]; }
/* moves layers of face k onto the sheet (the back for the inside's faces), where they print as they did, keeping their
   size in mm and their look; the faces they belonged to are the anchor. Returns the moved layers (none for a face the
   sheet does not carry flat, a cup's wall). */
function layerToSheet(o, k, ids, opts = {}) {
  const face = o.faces[k]; if (!face || isSheetKey(k) || !faceKeys(o).includes(k)) return [];
  const side = sideOfFace(o, k); if (side === 'back' && !hasInside(o)) return [];
  const n = sheetNet(o, side), ps = panelsOf(n, k); if (!ps.length) return [];
  const [W, H] = facePx(o, k), set = [].concat(ids), Ls = face.layers.filter(L => set.includes(L.id)), out = [];
  const sh = ensureSheet(o)[side];
  for (const L of Ls) {
    const p = panelAt(ps, W, H, L.x * W, L.y * H), { M, kx, ky, th } = faceToSheet(p, W, H);
    const [X, Y] = apply(M, [L.x * W, L.y * H]);
    if (L.type === 'image') L.w = L.w * W * kx / n.W;
    else if (L.type === 'shape') { L.w = L.w * W * kx / n.W; L.h = L.h * H * ky / n.H; }
    else L.size = L.size * H * ky / n.H;
    L.x = X / n.W; L.y = Y / n.H; L.rot = turnOf((L.rot || 0) + th / DEG);
    plain(L); if (opts.over) L.over = true;
    out.push(L);
  }
  face.layers = face.layers.filter(L => !Ls.includes(L)); tidyGroups(face);
  for (const L of out) { sh.layers.push(L); reanchorLayer(o, side, L, [k]); }
  markFace(o, k); markSheet(o);
  return out;
}
/* moves sheet layers back onto a face (k: the face; by default the one they are anchored to or lie over); what lies past
   the face is cut off by its edge. Returns the moved layers. */
function sheetToFace(o, side, ids, k = null) {
  const sh = o.sheet?.[side]; if (!sh) return [];
  const n = sheetNet(o, side), set = [].concat(ids), Ls = sh.layers.filter(L => set.includes(L.id)), out = [];
  for (const L of Ls) {
    const a = L.anchor, key = k || a?.keys?.find(q => faceKeys(o).includes(q) && panelsOf(n, q).length) || n.panels.find(p => flatPanel(p) && inPanel(p, L.x * n.W, L.y * n.H))?.key;
    const face = key && o.faces[key], ps = key ? panelsOf(n, key) : [];
    if (!face || !ps.length || isSheetKey(key)) continue;
    const [W, H] = facePx(o, key), p = ps.find(q => inPanel(q, L.x * n.W, L.y * n.H)) || ps[0], { M, kx, ky, th } = faceToSheet(p, W, H);
    // sheet mm → face px: the inverse of the placing, by its parts (a turn and one scale)
    const c = Math.cos(th), s = Math.sin(th), dx = L.x * n.W - M[4], dy = L.y * n.H - M[5];
    const u = (dx * c + dy * s) / kx, v = (-dx * s + dy * c) / ky;
    if (L.type === 'image') L.w = L.w * n.W / kx / W;
    else if (L.type === 'shape') { L.w = L.w * n.W / kx / W; L.h = L.h * n.H / ky / H; }
    else L.size = L.size * n.H / ky / H;
    L.x = u / W; L.y = v / H; L.rot = turnOf((L.rot || 0) - th / DEG);
    delete L.anchor; delete L.over; delete L.group;
    face.layers.push(L); out.push(L); markFace(o, key);
  }
  sh.layers = sh.layers.filter(L => !out.includes(L)); tidyGroups(sh); markSheet(o);
  return out;
}

export { SIDES, addSheetLayer, dimsFor, ensureSheet, groupBox, isSheetKey, layerToSheet, linkSheet, markSheet, moveSheetLayer, reanchorLayer, removeSheetLayer, setSheetStretch, setSheetTier, settleSheet, sheetCount, sheetFaces, sheetKey, sheetMM, sheetNet, sheetPx, sheetSide, sheetToFace };
