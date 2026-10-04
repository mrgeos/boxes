// Мелкие помощники: DOM, числа, строки, геометрия на плоскости
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEG = Math.PI / 180;
const S = 0.01;
                       // scene units per millimetre (1 unit = 100 mm)
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
const fmt = (v, d = 0) => (+v).toFixed(d).replace(/\.0+$/, '');
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
const r1 = v => Math.round(v * 10) / 10;
/* a polygon (points with x, y) clipped to the half-plane y <= c (keep = -1) or y >= c (keep = 1) */
function clipY(pts, c, keep) {
  const out = [], inside = q => keep < 0 ? q.y <= c : q.y >= c;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b);
    if (ia) out.push({ x: a.x, y: a.y });
    if (ia !== ib) { const t = (c - a.y) / (b.y - a.y); out.push({ x: a.x + (b.x - a.x) * t, y: c }); }
  }
  return out.length > 2 ? out : null;
}
/* a window outline split by a band |y - yc| < half into two openings */
const splitBand = (pts, yc, half) => [clipY(pts, yc - half, -1), clipY(pts, yc + half, 1)].filter(Boolean);
/* pixels of an image, scaled to fit within max px */
function pixelsOf(src, max) {
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height, k = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const x = c.getContext('2d'); x.drawImage(src, 0, 0, c.width, c.height);
  return x.getImageData(0, 0, c.width, c.height);
}
/* bilinear sample; wrapX repeats horizontally (the wall is a closed loop) */
function sampleInto(D, o, S, fx, fy, wrapX) {
  const w = S.width, h = S.height, s = S.data;
  fx = fx * w - .5; fy = clamp(fy * h - .5, 0, h - 1);
  let x0 = Math.floor(fx); const tx = fx - x0, y0 = Math.floor(fy), ty = fy - y0, y1 = Math.min(h - 1, y0 + 1);
  let x1 = x0 + 1;
  if (wrapX) { x0 = ((x0 % w) + w) % w; x1 = ((x1 % w) + w) % w; } else { x0 = clamp(x0, 0, w - 1); x1 = clamp(x1, 0, w - 1); }
  const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, d = (y1 * w + x1) * 4;
  for (let i = 0; i < 4; i++) D[o + i] = (s[a + i] * (1 - tx) + s[b + i] * tx) * (1 - ty) + (s[c + i] * (1 - tx) + s[d + i] * tx) * ty;
}
const smooth = (a, b, x) => { const q = clamp((x - a) / (b - a), 0, 1); return q * q * (3 - 2 * q); };
const readURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const loadImage = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
const V2 = (x, y) => new THREE.Vector2(x, y);
const dedupe = pts => pts.filter((q, i) => i === 0 || q.distanceTo(pts[i - 1]) > 1e-7);
/* rounded rectangle x0…x1 × y0…y1 as points; r0: radius of the two corners at y0, r1 at y1 */
function rrPoly(x0, y0, x1, y1, r0, r1) {
  const P = Math.PI, a = (cx, cy, r, s, e) => arcPts(cx, cy, r, s, e, 8).map(([x, y]) => ({ x, y }));
  const up = y1 > y0, s = up ? 1 : -1;
  return [...a(x1 - r0, y0 + s * r0, r0, -s * P / 2, 0), ...a(x1 - r1, y1 - s * r1, r1, 0, s * P / 2), ...a(x0 + r1, y1 - s * r1, r1, s * P / 2, s * P), ...a(x0 + r0, y0 + s * r0, r0, s * P, s * P * 1.5)];
}
/* carry handle of a cake box: two leaves standing up from the middle of the lid, back to back, printed
   on their outer sides; folded down they lie flat on the lid */
/* points of a rounded rectangle x0…x1 × y0…y1, counter-clockwise from the end of its bottom edge; rT, rB:
   top and bottom corner radii */
function arcPts(cx, cy, r, a0, a1, n = 10) { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return out; }
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slug = s => [...(s || 'box').toLowerCase()].map(c => TR[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'box';
function luminance(hex) { const c = new THREE.Color(hex); return .2126 * c.r + .7152 * c.g + .0722 * c.b; }
