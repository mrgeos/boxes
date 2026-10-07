// Векторные картинки: исходник SVG, его цвета и перекраска
import { assets } from './state.js';
import { getImg, onAssetLoaded } from './assets.js';

   // { id: asset id, hash, name, aspect, added }
/* ---------- vector images ----------
   An SVG is kept as source next to its raster: vecOf[raster asset id] = svg asset id. Its colours are
   written out as #rrggbb, so a layer or sticker can swap them (recolor: { '#old': '#new' }). */
const vecOf = {};
const VCOL = /((?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*(?:=\s*["']|:\s*))(#[0-9a-f]{6})/gi;
const cssColor = (() => { const x = document.createElement('canvas').getContext('2d'); return v => { x.fillStyle = '#010203'; x.fillStyle = v; const r = x.fillStyle; return /^#[0-9a-f]{6}$/i.test(r) && (r !== '#010203' || /#010203/i.test(v)) ? r.toLowerCase() : null; }; })();
/* SVG text with every paint colour as lowercase #rrggbb (shapes without a fill get black, as browsers draw them) */
function normSvg(text) {
  try {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), root = doc.documentElement;
    if (root.nodeName !== 'svg' || doc.querySelector('parsererror')) return null;
    // shapes with no fill of their own (or from a parent) are drawn black: make that a colour you can swap
    const hasFill = el => el.hasAttribute('fill') || /(^|;)\s*fill\s*:/.test(el.getAttribute('style') || '');
    const bare = [...doc.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,text,use')].some(el => { for (let e = el; e && e !== root; e = e.parentElement) if (hasFill(e)) return false; return true; });
    if ((bare || doc.querySelector('style')) && !hasFill(root)) root.setAttribute('fill', '#000000');
    const PROPS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'], fix = v => { const t = (v || '').trim(); if (!t || /^(none|currentcolor|inherit|transparent)$/i.test(t) || /^url\(/i.test(t)) return v; return cssColor(t) || v; };
    for (const el of doc.querySelectorAll('*')) {
      for (const a of PROPS) if (el.hasAttribute(a)) el.setAttribute(a, fix(el.getAttribute(a)));
      const st = el.getAttribute('style'); if (st) el.setAttribute('style', st.replace(/([\w-]+)\s*:\s*([^;]+)/g, (m, k, v) => PROPS.includes(k.toLowerCase()) ? `${k}:${fix(v)}` : m));
      if (el.nodeName === 'style') el.textContent = el.textContent.replace(/(fill|stroke|stop-color|color)\s*:\s*([^;}]+)/gi, (m, k, v) => `${k}:${fix(v)}`);
    }
    return new XMLSerializer().serializeToString(root);
  } catch { return null; }
}
const svgText = id => { const u = assets[id] || ''; const i = u.indexOf(','); if (i < 0) return ''; const body = u.slice(i + 1); return u.slice(0, i).includes('base64') ? decodeURIComponent(escape(atob(body))) : decodeURIComponent(body); };
const svgURL = t => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t);
const vecColorCache = new Map();
/* the colours of a vector, most used first */
function vecColors(srcId) {
  const v = vecOf[srcId]; if (!v) return [];
  if (!vecColorCache.has(v)) {
    const n = new Map(); for (const m of svgText(v).matchAll(VCOL)) { const c = m[2].toLowerCase(); n.set(c, (n.get(c) || 0) + 1); }
    vecColorCache.set(v, [...n.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]));
  }
  return vecColorCache.get(v);
}
const recolorCache = new Map(), recolorBusy = new Set();
const hasRecolor = rc => rc && Object.entries(rc).some(([a, b]) => a !== b);
/* a colour of a vector swapped for 'none' is taken out: that part is not printed, the paper or the layer under it shows */
const NONE = 'none';
/* what is done to a picture's colours: swapped or taken out (a vector), keyed out (any picture) */
const hasColorEdits = T => hasRecolor(T?.recolor) || !!T?.keyout?.length;
/* the image to draw for src with its colours swapped (a vector) and colours keyed out (keyout: [{ c, tol }]); the
   original until the recoloured raster is ready */
function artImg(srcId, rc, keyout = null) {
  const im = vecImg(srcId, rc);
  return keyout?.length && im ? keyImg(im, srcId + '|' + JSON.stringify(rc || {}), keyout) : im;
}
function vecImg(srcId, rc) {
  const base = getImg(srcId);
  if (!srcId || !vecOf[srcId] || !hasRecolor(rc) || !base) return base;
  const key = srcId + '|' + JSON.stringify(Object.entries(rc).filter(([a, b]) => a !== b).sort());
  if (recolorCache.has(key)) return recolorCache.get(key);
  if (!recolorBusy.has(key)) {
    recolorBusy.add(key);
    const t = svgText(vecOf[srcId]).replace(VCOL, (m, pre, c) => { const v = rc[c.toLowerCase()] || c; return pre + (v === NONE ? 'transparent' : v); }), im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = base.naturalWidth; c.height = base.naturalHeight; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      c.naturalWidth = c.width; c.naturalHeight = c.height;
      if (recolorCache.size > 48) recolorCache.delete(recolorCache.keys().next().value);
      recolorCache.set(key, c); recolorBusy.delete(key); onAssetLoaded(srcId);
    };
    im.onerror = () => recolorBusy.delete(key);
    im.src = svgURL(t);
  }
  return base;
}

/* a picture with colours keyed out: a pixel near a colour (within tol, 0…1 of the RGB distance) goes clear, with a
   soft edge just past it so the cut does not look jagged; kept until the picture or the colours change */
const keyCache = new Map(), SOFT = .06, KEY_MAX = 4096;
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function keyImg(im, base, keyout) {
  const key = base + '|' + JSON.stringify(keyout), w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height;
  const got = keyCache.get(key); if (got?.im === im) return got.cv;
  if (!w0 || !h0) return im;
  const k = Math.min(1, KEY_MAX / Math.max(w0, h0)), cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w0 * k)); cv.height = Math.max(1, Math.round(h0 * k));
  const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, cv.width, cv.height);
  const d = x.getImageData(0, 0, cv.width, cv.height), p = d.data, keys = keyout.map(q => [...hexRGB(q.c), Math.max(0, q.tol ?? .15)]), R = 255 * Math.sqrt(3);
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    let a = 1;
    for (const [r, g, b, tol] of keys) {
      const t = (Math.hypot(p[i] - r, p[i + 1] - g, p[i + 2] - b) / R - tol) / SOFT;
      if (t < 1) a = Math.min(a, Math.max(0, t));
    }
    if (a < 1) p[i + 3] = Math.round(p[i + 3] * a);
  }
  x.putImageData(d, 0, 0);
  cv.naturalWidth = cv.width; cv.naturalHeight = cv.height;
  if (keyCache.size > 24) keyCache.delete(keyCache.keys().next().value);
  keyCache.set(key, { im, cv });
  return cv;
}

/* ---------- actions ---------- */
/* a picture's colour (of a vector) swapped (to '#rrggbb'), taken out (NONE) or back to its own (null); T: a layer or a sticker */
function setVecColor(T, from, to) {
  const rc = { ...(T.recolor || {}) };
  if (!to || to === from) delete rc[from]; else rc[from] = to;
  T.recolor = rc;
}
/* a colour keyed out of a picture (any picture: a photo's white background, say), its tolerance, or taken back */
function addKeyout(T, c, tol = .15) { T.keyout = [...(T.keyout || []).filter(q => q.c !== c.toLowerCase()), { c: c.toLowerCase(), tol }]; }
function setKeyoutTol(T, i, tol) { if (T.keyout?.[i]) T.keyout[i].tol = tol; }
function removeKeyout(T, i) { T.keyout = (T.keyout || []).filter((_, j) => j !== i); if (!T.keyout.length) delete T.keyout; }

export { NONE, addKeyout, artImg, hasColorEdits, hasRecolor, normSvg, removeKeyout, setKeyoutTol, setVecColor, svgURL, vecColors, vecOf };
