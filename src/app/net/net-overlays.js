// Что показать на развёртке сверх дизайна: вылеты, безопасная зона, размеры (только на экране, в файлы не попадает)
import { fmt } from '../core/util.js';
import { sel } from '../core/state.js';
import { faceLabel, faceMM } from '../core/model.js';
import { selectedIds } from '../core/layers.js';
import { RT } from '../scene/renderer.js';
import { cropPx } from '../faces/render.js';
import { boxCorners, BLEED_MM, SAFE_MM } from './net-check.js';
import { mapFor } from './net-edit.js';
import { panelPath } from './net-view.js';

/* The three switches are this browser's choice (like the view mode); `setNetOverlay` is the action for them. The
   drawing runs inside paintNet's two hooks: the bleed under the panels (it is covered by the neighbours at the folds,
   so it shows only past the cut), the safe zone and the dimensions over them. A face's picture runs on into the bleed
   as its edge pixels do (the same a print file is made with); a panel that is not a rectangle gets its ground colour. */
const KEY = 'bs3d-net-overlays', NAMES = ['bleed', 'safe', 'dims'];
const flags = { bleed: false, safe: false, dims: false };
const listeners = new Set();
const netOverlay = name => !!flags[name];
function setNetOverlay(name, on) {
  if (!NAMES.includes(name) || flags[name] === !!on) return;
  flags[name] = !!on;
  try { localStorage.setItem(KEY, JSON.stringify(flags)); } catch { /* private mode */ }
  for (const f of listeners) f();
}
const onNetOverlay = cb => { listeners.add(cb); };
function loadNetOverlays() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); for (const n of NAMES) flags[n] = !!s[n]; } catch { /* none kept */ }
}

const BLEED_LINE = 'rgba(224,64,40,.9)', SAFE_LINE = 'rgba(46,156,90,.95)', WARN = '230,150,0', CUT = '214,50,40';
const rectLike = p => !p.fan && !p.poly && !p.circle && !p.r && p.ang == null;

/* ---------- the bleed ---------- */
/* the face's picture over the panel inflated by the bleed: nine pieces, the middle one left to the panel itself. Past the
   face's own edge a piece is its edge pixel stretched; past a cut inside the face (half of a lid) it is the picture */
function drawBleed(c, fc, p, x, y, w, h, bm, bp, crop) {
  const S = crop || [0, 0, fc.width, fc.height], q = p.q ?? (p.rot ? 2 : 0);
  c.save();
  c.translate(x + w / 2, y + h / 2); c.rotate(q * Math.PI / 2);
  if (q % 2) [w, h] = [h, w];
  // per axis: [source start, source length, destination start, destination length] of the near band, the middle, the far band
  const axis = (s0, sl, full, d0, dl) => [
    s0 >= bp ? [s0 - bp, bp, d0 - bm, bm] : [s0, 1, d0 - bm, bm],
    [s0, sl, d0, dl],
    s0 + sl + bp <= full ? [s0 + sl, bp, d0 + dl, bm] : [s0 + sl - 1, 1, d0 + dl, bm]];
  const cols = axis(S[0], S[2], fc.width, -w / 2, w), rows = axis(S[1], S[3], fc.height, -h / 2, h);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    if (i === 1 && j === 1) continue;
    c.drawImage(fc, cols[i][0], rows[j][0], cols[i][1], rows[j][1], cols[i][2], rows[j][2], cols[i][3], rows[j][3]);
  }
  c.restore();
}
/* the outline of a panel grown by g px (a polygon by its corners' miters) */
function growPath(c, p, g, ox, oy, k) {
  const x = ox + p.x * k, y = oy + p.y * k, w = p.w * k, h = p.h * k;
  if (p.circle) { c.moveTo(x + w / 2 + w / 2 + g, y + h / 2); c.arc(x + w / 2, y + h / 2, w / 2 + g, 0, Math.PI * 2); }
  else if (p.poly) {
    const P = p.poly.map(([X, Y]) => [ox + X * k, oy + Y * k]), n = P.length;
    const area = P.reduce((s, [X, Y], i) => s + X * P[(i + 1) % n][1] - P[(i + 1) % n][0] * Y, 0), sg = area > 0 ? 1 : -1;
    const norm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [sg * dy / l, -sg * dx / l]; };
    P.forEach((v, i) => {
      const n1 = norm(P[(i + n - 1) % n], v), n2 = norm(v, P[(i + 1) % n]), m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(...m) || 1;
      const u = [m[0] / ml, m[1] / ml], cos = Math.max(.34, u[0] * n1[0] + u[1] * n1[1]), d = g / cos;
      c[i ? 'lineTo' : 'moveTo'](v[0] + u[0] * d, v[1] + u[1] * d);
    });
    c.closePath();
  } else if (p.r) c.roundRect(x - g, y - g, w + 2 * g, h + 2 * g, p.r * k + g);
  else c.rect(x - g, y - g, w + 2 * g, h + 2 * g);
}
/* under the panels: the band and the thin line at its edge */
function bleedUnder(c, o, n, ox, oy, k) {
  const rt = RT.get(o.id), b = BLEED_MM, g = b * k;
  for (const p of n.panels) {
    if (p.fan) continue;
    const f = rt?.faces[p.key], fc = f?.canvas;
    if (!fc && !p.fold) continue;
    if (rectLike(p) && fc?.width) {
      const bp = Math.max(1, Math.round(b * fc.width / faceMM(o, p.key)[0]));
      drawBleed(c, fc, p, ox + (p.x - b) * k, oy + (p.y - b) * k, (p.w + 2 * b) * k, (p.h + 2 * b) * k, g, bp, cropPx(fc, p));
    } else {
      c.save(); c.beginPath(); growPath(c, p, g, ox, oy, k);
      if (p.circle) c.moveTo(ox + (p.x + p.w) * k, oy + (p.y + p.h / 2) * k);
      panelPath(c, p, ox, oy, k); c.fillStyle = o.faces[p.key]?.bg || o.board || '#ffffff'; c.fill('evenodd'); c.restore();
    }
    c.save(); c.beginPath(); growPath(c, p, g, ox, oy, k); c.strokeStyle = BLEED_LINE; c.lineWidth = 1; c.stroke(); c.restore();
  }
}

/* ---------- the safe zone ---------- */
function drawSafe(c, o, n, issues, ox, oy, k) {
  const s = SAFE_MM * k;
  for (const p of n.panels) {
    if (p.fan || p.key == null || !o.faces[p.key]) continue;
    const x = ox + p.x * k, y = oy + p.y * k, w = p.w * k, h = p.h * k;
    c.save();
    if (rectLike(p) && w > 2 * s && h > 2 * s) {
      c.setLineDash([4, 3]); c.strokeStyle = SAFE_LINE; c.lineWidth = 1; c.strokeRect(x + s + .5, y + s + .5, w - 2 * s - 1, h - 2 * s - 1);
    } else {
      // another shape: the margin is shaded inside its edge
      c.beginPath(); panelPath(c, p, ox, oy, k); c.clip(); c.lineWidth = 2 * s; c.strokeStyle = 'rgba(46,156,90,.2)'; c.beginPath(); panelPath(c, p, ox, oy, k); c.stroke();
    }
    c.restore();
  }
  // what crosses it: its box tinted where it lies on the face's panel
  for (const it of issues) {
    if (it.kind === 'dpi') continue;
    const L = o.faces[it.face]?.layers.find(l => l.id === it.id); if (!L) continue;
    for (const p of n.panels.filter(q => q.key === it.face)) {
      const m = mapFor(o, p); if (!m) continue;
      const q = boxCorners(L, m.W, m.H).map(([X, Y]) => m.toScreen(X * m.k, Y * m.k)), rgb = it.kind === 'cut' ? CUT : WARN;
      c.save(); c.beginPath(); q.forEach((v, i) => c[i ? 'lineTo' : 'moveTo'](...v)); c.closePath();
      c.fillStyle = `rgba(${rgb},.26)`; c.fill(); c.strokeStyle = `rgba(${rgb},.9)`; c.lineWidth = 1; c.stroke(); c.restore();
    }
  }
}

/* ---------- the dimensions ---------- */
/* Every label takes a rectangle of the sheet (pane px); one that would lie over a taken one is left out, so nothing is
   printed over anything. The sheet's own dimensions go first, then what is in the way: the picked face's name, the
   picked layers' frame with its handles, the design's own texts (a label may not hide those). Each size is labelled
   once per axis, on the largest panel that has it, along the panel's edge, on a small pill that reads over any print. */
const placed = [];   // { k: 'sheet' | 'dim' | 'line' | 'chip' | 'frame' | 'text', x, y, w, h, g }: a dim and its line share g
const hits = (a, b) => a.x < b.x + b.w - .5 && b.x < a.x + a.w - .5 && a.y < b.y + b.h - .5 && b.y < a.y + a.h - .5;
/* a label (kind 'dim') may not lie over anything taken; its line (kind 'line') over anything but the design's texts */
const free = (r, soft) => !placed.some(q => hits(r, q) && !(soft && q.k === 'text'));
const labelRects = () => placed.map(q => ({ ...q }));
function drawDims(c, o, n, ox, oy, k) {
  placed.length = 0;
  const css = getComputedStyle(document.documentElement), fg = css.getPropertyValue('--fg').trim() || '#1c1b19', pill = css.getPropertyValue('--panel').trim() || '#f6f4f0', edge = css.getPropertyValue('--line-2').trim() || '#c5beb2';
  const ink = 'rgba(0,120,170,.95)';
  c.save(); c.font = '500 11px "JetBrains Mono", ui-monospace, monospace'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.lineWidth = 1;
  const PH = 16, tw = s => c.measureText(s).width + 10;
  /* the label's pill (at a centre, turned or not) and the rectangle it takes */
  const pillAt = (s, x, y, turned) => { const w = tw(s); return turned ? { x: x - PH / 2, y: y - w / 2, w: PH, h: w } : { x: x - w / 2, y: y - PH / 2, w, h: PH }; };
  const drawPill = (s, x, y, turned) => {
    const w = tw(s); c.save(); c.translate(x, y); if (turned) c.rotate(-Math.PI / 2);
    c.beginPath(); c.roundRect(-w / 2, -PH / 2, w, PH, PH / 2); c.globalAlpha = .94; c.fillStyle = pill; c.fill(); c.globalAlpha = 1; c.strokeStyle = edge; c.stroke();
    c.fillStyle = fg; c.fillText(s, 0, .5); c.restore();
  };
  // ----- what is in the way
  const sh = [{ k: 'sheet', ...pillAt(`${fmt(n.W, 1)} мм`, ox + n.W * k / 2, oy - 20, false) }, { k: 'sheet', ...pillAt(`${fmt(n.H, 1)} мм`, ox - 20, oy + n.H * k / 2, true) }];
  placed.push(...sh);
  if (sel.face && !sel.layer) for (const p of n.panels) if (p.key === sel.face) placed.push({ k: 'chip', x: Math.max(4, ox + p.x * k + 6), y: Math.max(6, oy + p.y * k + 6), w: faceLabel(o, sel.face).length * 6.6 + 14, h: 20 });
  const box = pts => { const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
  const picked = new Set(sel.layer ? selectedIds() : []);
  for (const p of n.panels) {
    const f = o.faces[p.key], m = f && mapFor(o, p); if (!m) continue;
    for (const L of f.layers) {
      if (!L.visible) continue;
      const hit = p.key === sel.face && picked.has(L.id);
      if (!hit && L.type !== 'text') continue;
      const r = box(boxCorners(L, m.W, m.H).map(([X, Y]) => m.toScreen(X * m.k, Y * m.k)));
      // a picked layer: its frame and handles (the turning one stands up from the top), a finger's reach of room round them
      placed.push(hit ? { k: 'frame', x: r.x - 14, y: r.y - 34, w: r.w + 28, h: r.h + 48 } : { k: 'text', ...r });
    }
  }
  // ----- the sheet
  const dimH = (x1, x2, y, s) => { c.strokeStyle = ink; c.beginPath(); c.moveTo(x1, y); c.lineTo(x2, y); c.moveTo(x1, y - 5); c.lineTo(x1, y + 5); c.moveTo(x2, y - 5); c.lineTo(x2, y + 5); c.stroke(); };
  const dimV = (x, y1, y2) => { c.strokeStyle = ink; c.beginPath(); c.moveTo(x, y1); c.lineTo(x, y2); c.moveTo(x - 5, y1); c.lineTo(x + 5, y1); c.moveTo(x - 5, y2); c.lineTo(x + 5, y2); c.stroke(); };
  dimH(ox, ox + n.W * k, oy - 20); drawPill(`${fmt(n.W, 1)} мм`, ox + n.W * k / 2, oy - 20, false);
  dimV(ox - 20, oy, oy + n.H * k); drawPill(`${fmt(n.H, 1)} мм`, ox - 20, oy + n.H * k / 2, true);
  // ----- the panels, the largest first; a size already labelled on that axis is not labelled again
  const done = new Set(), box1 = p => ({ p, x: ox + p.x * k, y: oy + p.y * k, w: p.w * k, h: p.h * k });
  const cand = n.panels.filter(p => !p.fan && p.key != null && !p.blank && o.faces[p.key]).map(box1).sort((a, b) => b.w * b.h - a.w * a.h);
  const attempt = (s, at, turned, line, key) => {
    if (done.has(key)) return;
    const r = pillAt(s, at[0], at[1], turned);
    if (!free(r, false) || (line && !free(line, true))) return;
    const g = placed.length; placed.push({ k: 'dim', g, ...r }); if (line) placed.push({ k: 'line', g, ...line });
    done.add(key); if (line) { if (turned) dimV(line.x + line.w / 2, line.y, line.y + line.h); else dimH(line.x, line.x + line.w, line.y + line.h / 2); }
    drawPill(s, at[0], at[1], turned);
  };
  for (const { p, x, y, w, h } of cand) {
    if (p.circle) { attempt(`⌀ ${fmt(p.w, 1)} мм`, [x + w / 2, y + h / 2], false, null, 'd|' + fmt(p.w, 1)); continue; }
    if (p.poly || p.ang != null) { if (w > 70 && h > 30) attempt(`${fmt(p.w, 1)} × ${fmt(p.h, 1)} мм`, [x + w / 2, y + h / 2], false, null, 'b|' + fmt(p.w, 1) + 'x' + fmt(p.h, 1)); continue; }
    // the width along the top edge (else the bottom one), the height along the left (else the right) one, just inside
    const sw = `${fmt(p.w, 1)} мм`, shh = `${fmt(p.h, 1)} мм`;
    if (tw(sw) + 12 < w) for (const yy of [y + 9, y + h - 9]) { attempt(sw, [x + w / 2, yy], false, { x: x + 4, y: yy - 3, w: w - 8, h: 6 }, 'w|' + fmt(p.w, 1)); if (done.has('w|' + fmt(p.w, 1))) break; }
    if (tw(shh) + 12 < h) for (const xx of [x + 9, x + w - 9]) { attempt(shh, [xx, y + h / 2], true, { x: xx - 3, y: y + 4, w: 6, h: h - 8 }, 'h|' + fmt(p.h, 1)); if (done.has('h|' + fmt(p.h, 1))) break; }
  }
  c.restore();
}

/* what paintNet runs under and over the panels (null: nothing to add) */
function overlayHooks(o, n, ox, oy, k, issues) {
  return {
    before: flags.bleed ? c => bleedUnder(c, o, n, ox, oy, k) : null,
    after: flags.safe || flags.dims ? c => { if (flags.safe) drawSafe(c, o, n, issues, ox, oy, k); if (flags.dims) drawDims(c, o, n, ox, oy, k); } : null,
  };
}

export { labelRects, loadNetOverlays, netOverlay, onNetOverlay, overlayHooks, setNetOverlay };
