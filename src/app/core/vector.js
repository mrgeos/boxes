// Векторные картинки: исходник SVG, его цвета и перекраска

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
/* the image to draw for src with its colours swapped; the original until the recoloured raster is ready */
function artImg(srcId, rc) {
  const base = getImg(srcId);
  if (!srcId || !vecOf[srcId] || !hasRecolor(rc) || !base) return base;
  const key = srcId + '|' + JSON.stringify(Object.entries(rc).filter(([a, b]) => a !== b).sort());
  if (recolorCache.has(key)) return recolorCache.get(key);
  if (!recolorBusy.has(key)) {
    recolorBusy.add(key);
    const t = svgText(vecOf[srcId]).replace(VCOL, (m, pre, c) => pre + (rc[c.toLowerCase()] || c)), im = new Image();
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
