// Бренд-кит проекта: фирменные цвета, логотипы, паттерны и шрифты — переменные, на которые ссылается дизайн
import { getPath, luminance, setPath, uid } from './util.js';
import { state } from './state.js';
import { getImg } from './assets.js';
import { facePx, newImage } from './model.js';
import { vecColors } from './vector.js';
import { ensureFont } from './fonts.js';
import { markFace } from '../scene/renderer.js';
import { touchSticker } from '../stickers/placement.js';
import { ribbonLook } from '../carriers/ribbon.js';

/* The kit lives in the project (state.brand). Its colours, logos and fonts are variables: a field of a layer, a face
   or a sticker that took one keeps a link to it beside its own value (T.links = { color: 'c1', 'grad.color': 'c2',
   src: 'l1', font: 'heading' }). The value itself stays a plain colour (picture, font), so everything that draws or
   exports reads it as before; a change in the kit is written into every linked field. A field set by hand to
   anything else drops its link. */
const FONT_ROLES = { heading: 'Заголовки', body: 'Текст' };
const LOGO_ROLES = { main: 'Основной', inverse: 'Инверсный (для тёмного фона)', mark: 'Знак' };
const emptyKit = () => ({ colors: [], logos: [], patterns: [], fonts: { heading: null, body: null } });
const kit = () => (state.brand ??= emptyKit());
const isHex = c => /^#[0-9a-f]{6}$/i.test(c || '');
const brandColor = id => kit().colors.find(c => c.id === id) || null;
const brandLogo = id => kit().logos.find(l => l.id === id) || kit().patterns.find(l => l.id === id) || null;

/* every item of the design that can link to the kit: { T, done() } (done shows the change) */
function* linkables() {
  for (const o of state.objects) {
    for (const k in o.faces) {
      const f = o.faces[k];
      yield { T: f, done: () => markFace(o, k) };
      for (const L of f.layers) yield { T: L, done: () => markFace(o, k) };
    }
    for (const st of o.stickers || []) yield { T: st, done: () => touchSticker(o, st) };
    for (const r of o.ribbons || []) yield { T: r, done: () => ribbonLook(o, r) };
  }
}
/* the value of a link as the field takes it */
function linkValue(link, field) {
  if (field === 'font') return kit().fonts[link] || null;
  if (field === 'src') { const l = brandLogo(link); return l ? l.src : null; }
  return brandColor(link)?.hex || null;
}
/* writes the kit into every field linked to `id` (all links when id is null); returns how many changed */
function propagate(id = null) {
  let n = 0;
  for (const { T, done } of linkables()) {
    if (!T.links) continue;
    let hit = false;
    for (const [field, link] of Object.entries(T.links)) {
      if (id && link !== id) continue;
      const v = linkValue(link, field); if (v == null) continue;
      const parent = field.includes('.') ? getPath(T, field.split('.').slice(0, -1).join('.')) : T; if (!parent) continue;
      if (field === 'src') { const l = brandLogo(link); if (T.src !== v) { T.src = v; T.aspect = l.aspect; T.recolor = {}; delete T.keyout; hit = true; } continue; }
      if (getPath(T, field) !== v) { setPath(T, field, v); hit = true; }
      if (field === 'font') ensureFont(T);
    }
    if (hit) { n++; done(); }
  }
  return n;
}
/* links field k of T (a layer, a face, a sticker) to the kit's item `id`, or drops the link (id null) */
function setLink(T, k, id) {
  if (id) { (T.links ??= {})[k] = id; const v = linkValue(id, k); if (v != null && k !== 'src') setPath(T, k, v); }
  else if (T.links) { delete T.links[k]; if (!Object.keys(T.links).length) delete T.links; }
}
const linkOf = (T, k) => T?.links?.[k] || null;
/* a field changed by hand: its link goes unless the value is still the kit's */
function checkLink(T, k) { const id = linkOf(T, k); if (id && linkValue(id, k) !== getPath(T, k)) setLink(T, k, null); }

/* ---------- colours ---------- */
function addBrandColor(hex, name = '', more = {}) {
  hex = String(hex).toLowerCase(); if (!isHex(hex)) return null;
  const have = kit().colors.find(c => c.hex === hex); if (have) return have;
  const c = { id: uid(), name: name || `Цвет ${kit().colors.length + 1}`, hex, cmyk: '', pantone: '', ...more };
  kit().colors.push(c); return c;
}
/* a kit colour changed (hex, name, CMYK, Pantone); a new hex goes into the design */
function updateBrandColor(id, patch) {
  const c = brandColor(id); if (!c) return 0;
  Object.assign(c, patch);
  return patch.hex ? propagate(id) : 0;
}
/* a colour leaves the kit; what was linked to it keeps its colour, unlinked */
function removeBrandColor(id) {
  kit().colors = kit().colors.filter(c => c.id !== id);
  for (const { T } of linkables()) for (const [k, v] of Object.entries(T.links || {})) if (v === id) setLink(T, k, null);
}
/* how many fields use a kit item */
function usesOf(id) { let n = 0; for (const { T } of linkables()) for (const v of Object.values(T.links || {})) if (v === id) n++; return n; }

/* ---------- logos and patterns ---------- */
function addBrandLogo(src, aspect, name = 'Логотип', role = null) {
  const L = kit().logos, l = { id: uid(), name, role: role || (L.some(x => x.role === 'main') ? (L.some(x => x.role === 'inverse') ? 'mark' : 'inverse') : 'main'), src, aspect };
  L.push(l); return l;
}
function addBrandPattern(src, aspect, name = 'Паттерн') { const p = { id: uid(), name, src, aspect }; kit().patterns.push(p); return p; }
/* another picture for a logo or a pattern: every layer linked to it changes too */
function replaceBrandPicture(id, src, aspect) { const l = brandLogo(id); if (!l) return 0; l.src = src; l.aspect = aspect; return propagate(id); }
function removeBrandPicture(id) {
  kit().logos = kit().logos.filter(l => l.id !== id); kit().patterns = kit().patterns.filter(l => l.id !== id);
  for (const { T } of linkables()) if (T.links?.src === id) setLink(T, 'src', null);
}
/* the logo for a face: the inverse one on a dark background, if there is one */
function logoFor(face, logo = null) {
  const L = kit().logos, inv = L.find(l => l.role === 'inverse');
  if (logo) return logo.role === 'main' && inv && luminance(face.bg) < .45 ? inv : logo;
  const main = L.find(l => l.role === 'main') || L[0];
  return main && inv && luminance(face.bg) < .45 ? inv : main;
}
/* puts a kit logo on face k of o (linked: replacing the logo in the kit replaces it here) */
function placeBrandLogo(o, k, logo = null) {
  const l = logoFor(o.faces[k], logo); if (!l) return null;
  const [W, H] = facePx(o, k), L = newImage(l.src, l.aspect);
  L.w = Math.min(.45, (H * .45 * l.aspect) / W); L.name = l.name; setLink(L, 'src', l.id);
  o.faces[k].layers.push(L); markFace(o, k);
  return L;
}
/* a kit pattern over the whole face, under the other layers */
function placeBrandPattern(o, k, p) {
  const L = newImage(p.src, p.aspect);
  L.tile = true; L.w = .25; L.name = p.name; setLink(L, 'src', p.id);
  o.faces[k].layers.unshift(L); markFace(o, k);
  return L;
}

/* ---------- fonts ---------- */
function setBrandFont(role, font) { kit().fonts[role] = font || null; return font ? propagate(role) : 0; }

/* ---------- filling the kit ---------- */
/* the main colours of a picture: a vector's own, a raster's by the most common tones (no near-white or clear) */
function pictureColors(src, max = 8) {
  const v = vecColors(src); if (v.length) return v.slice(0, max);
  const im = getImg(src); if (!im?.naturalWidth) return [];
  const c = document.createElement('canvas'), N = 64; c.width = c.height = N;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, N, N);
  const p = x.getImageData(0, 0, N, N).data, bins = new Map();
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 128) continue;
    const key = (p[i] >> 4) << 8 | (p[i + 1] >> 4) << 4 | (p[i + 2] >> 4), b = bins.get(key) || [0, 0, 0, 0];
    b[0] += p[i]; b[1] += p[i + 1]; b[2] += p[i + 2]; b[3]++; bins.set(key, b);
  }
  const hex = b => '#' + b.slice(0, 3).map(v => Math.round(v / b[3]).toString(16).padStart(2, '0')).join('');
  const out = [];
  for (const b of [...bins.values()].sort((a, b) => b[3] - a[3])) {
    const h = hex(b); if (luminance(h) > .96) continue;
    // not a near repeat of a colour already taken
    if (out.some(o => dist(o, h) < 40)) continue;
    out.push(h); if (out.length >= max) break;
  }
  return out;
}
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const dist = (a, b) => { const p = rgb(a), q = rgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
/* the fonts of the design, most used first */
function projectFonts() {
  const n = new Map();
  for (const { T } of linkables()) if (T.type === 'text' && T.font) n.set(T.font, (n.get(T.font) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
}
/* colours from a palette: an Adobe .ase file (RGB, CMYK, grey) or text with #hex codes (a name before a code is kept) */
function parsePalette(data) {
  const out = [];
  if (data instanceof ArrayBuffer) {
    const v = new DataView(data); if (v.getUint32(0) !== 0x41534546) return out;   // 'ASEF'
    let p = 12;
    const n = v.getUint32(8);
    for (let b = 0; b < n && p < v.byteLength; b++) {
      const type = v.getUint16(p), len = v.getUint32(p + 2); let q = p + 6; p = q + len;
      if (type !== 1) continue;
      const nl = v.getUint16(q); q += 2; let name = '';
      for (let i = 0; i < nl - 1; i++) name += String.fromCharCode(v.getUint16(q + i * 2));
      q += nl * 2;
      const model = String.fromCharCode(...[0, 1, 2, 3].map(i => v.getUint8(q + i))); q += 4;
      const f = i => v.getFloat32(q + i * 4);
      let r, g, bl, cmyk = '';
      if (model === 'RGB ') [r, g, bl] = [f(0), f(1), f(2)];
      else if (model === 'CMYK') { const [c, m, y, k] = [f(0), f(1), f(2), f(3)]; [r, g, bl] = [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]; cmyk = [c, m, y, k].map(x => Math.round(x * 100)).join(' '); }
      else if (model === 'Gray') r = g = bl = f(0);
      else continue;
      out.push({ hex: '#' + [r, g, bl].map(x => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join(''), name, cmyk });
    }
    return out;
  }
  for (const line of String(data).split(/[\n;,]+/)) {
    const m = line.match(/#?([0-9a-f]{6})\b/i); if (!m) continue;
    out.push({ hex: '#' + m[1].toLowerCase(), name: line.slice(0, m.index).replace(/[:=\-–—\s]+$/, '').trim() });
  }
  return out;
}
/* the kit as a file of its own (with its pictures), and back */
function kitFile(assetsOf) {
  const k = kit(), ids = [...k.logos, ...k.patterns].map(l => l.src);
  return JSON.stringify({ app: 'box-studio-3d-brand', version: 1, ...k, assets: assetsOf(new Set(ids)) });
}
function loadKit(d, addAsset) {
  if (d?.app !== 'box-studio-3d-brand') throw new Error('not a kit');
  const map = {};
  for (const [id, url] of Object.entries(d.assets || {})) map[id] = addAsset(url);
  const re = l => ({ ...l, src: map[l.src] || l.src });
  state.brand = { colors: d.colors || [], logos: (d.logos || []).map(re), patterns: (d.patterns || []).map(re), fonts: { heading: null, body: null, ...(d.fonts || {}) } };
  propagate();
}

export { FONT_ROLES, LOGO_ROLES, addBrandColor, addBrandLogo, addBrandPattern, brandColor, brandLogo, checkLink, emptyKit, isHex, kit, kitFile, linkOf, loadKit, logoFor,
  parsePalette, pictureColors, placeBrandLogo, placeBrandPattern, projectFonts, propagate, removeBrandColor, removeBrandPicture, replaceBrandPicture, setBrandFont, setLink, updateBrandColor, usesOf };
