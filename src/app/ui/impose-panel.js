// Раздел «Раскладка на лист» во вкладке «Развёртка»: таблица листов и схема выбранного
import { $, $$, fmt } from '../core/util.js';
import { activeObj, sel } from '../core/state.js';
import { activeSticker } from '../stickers/placement.js';
import { ui } from '../scene/renderer.js';
import { SHEETS, fitPiece, pieceOf } from '../net/impose.js';
import { exportSheetPDF } from '../export/print-files.js';

/* The three numbers and the picked sheet are this browser's choice (like the net's overlays). The table is the pure
   `fitPiece` (net/impose.js) for every sheet; this file only draws it. It is drawn again only when what it shows
   changes: the loop asks for it with every redraw of the net. */
const KEY = 'bs3d-impose', DEF = { gap: 6, grip: 12, margin: 5 }, P = { ...DEF, sheet: null };
const FIELDS = { impGap: ['gap', 0, 60], impGrip: ['grip', 0, 60], impMargin: ['margin', 0, 30] };
let sig = '', shown = null;   // shown: the layout the table has picked
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const [, [k, lo, hi]] of Object.entries(FIELDS)) if (Number.isFinite(s[k])) P[k] = Math.min(hi, Math.max(lo, s[k]));
    if (typeof s.sheet === 'string') P.sheet = s.sheet;
  } catch { /* none kept */ }
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* private mode */ } };
/* the grip is held by an offset sheet only */
const optsFor = S => ({ gap: P.gap, margin: P.margin, grip: S.kind === 'offset' ? P.grip : 0 });

/* the sheet with the pieces laid on it: the gripper strip, the printable area, each piece with its bleed */
function sheetSVG(r) {
  const { sheet: S, area: A, items, bleed: b } = r, f = v => +v.toFixed(1);
  const held = Math.max(r.grip, r.margin);
  let g = `<rect x="0" y="0" width="${S.w}" height="${S.h}" style="fill:var(--field);stroke:var(--line-2)" stroke-width="${f(Math.max(S.w, S.h) / 300)}"/>`;
  g += `<rect x="0" y="0" width="${held}" height="${S.h}" style="fill:var(--muted);opacity:${r.grip ? .35 : .12}"/>`;
  g += `<rect x="${f(A.x)}" y="${f(A.y)}" width="${f(A.w)}" height="${f(A.h)}" style="fill:none;stroke:var(--line-2)" stroke-width="${f(Math.max(S.w, S.h) / 400)}" stroke-dasharray="${f(S.h / 100)} ${f(S.h / 150)}"/>`;
  for (const it of items) {
    g += `<rect x="${f(it.x - b)}" y="${f(it.y - b)}" width="${f(it.w + 2 * b)}" height="${f(it.h + 2 * b)}" style="fill:var(--accent);opacity:.25"/>`;
    g += `<rect x="${f(it.x)}" y="${f(it.y)}" width="${f(it.w)}" height="${f(it.h)}" style="fill:var(--accent-soft);stroke:var(--accent)" stroke-width="${f(Math.max(S.w, S.h) / 400)}"/>`;
  }
  return `<svg viewBox="0 0 ${S.w} ${S.h}" role="img" aria-label="Лист ${S.label}: ${r.count} шт.">${g}</svg>`;
}
/* the sheet's second line: its size (a plano sheet's name is its size already, it says «плано» instead) and how it is
   held: the grip of an offset sheet, «цифра» for a digital one */
const subOf = r => `${r.sheet.label === `${r.sheet.w}×${r.sheet.h}` ? 'плано' : `${r.sheet.w}×${r.sheet.h}`}, ${r.sheet.kind === 'offset' ? 'захват ' + r.grip : 'цифра'}`;
function rowHTML(r, on) {
  const S = r.sheet, ok = r.count > 0;
  return `<button class="imp-row${on ? ' on' : ''}${ok ? '' : ' no'}" data-id="${S.id}" aria-pressed="${on}" title="${S.w} × ${S.h} мм${S.kind === 'offset' ? ', захват ' + r.grip + ' мм' : ', цифровая печать'}">`
    + `<span class="imp-n"><b>${S.label}</b><small>${subOf(r)}</small></span><span class="imp-c">${ok ? r.count : '—'}</span>`
    + (ok ? `<span class="imp-s">${r.nx}×${r.ny}${r.rot ? ' · 90°' : ''}</span><span class="imp-f">${Math.round(r.fill * 100)}%</span>` : '<span class="imp-s">не помещается</span>') + '</button>';
}

function drawImpose() {
  const sec = $('#impSec'), o = activeObj(), piece = o && !activeSticker() ? pieceOf(o, sel.part || null) : null;
  sec.classList.toggle('imp-off', !piece);
  if (!piece || sec.hidden) { if (!piece) { sig = ''; shown = null; } return; }
  const key = JSON.stringify([o.id, sel.part, +piece.w.toFixed(2), +piece.h.toFixed(2), P]);
  if (key === sig) return;
  sig = key;
  const rows = SHEETS.map(S => fitPiece(piece, S, optsFor(S)));
  const pick = rows.find(r => r.sheet.id === P.sheet) || rows.find(r => r.count) || rows[0];
  $('#impSize').textContent = `${fmt(piece.w, 1)} × ${fmt(piece.h, 1)} мм`;
  $('#impRows').innerHTML = rows.map(r => rowHTML(r, r === pick)).join('');
  $('#impPrev').innerHTML = pick.count ? sheetSVG(pick) : '';
  $('#impPrev').hidden = !pick.count; shown = pick.count ? pick : null; $('#impPdfBtn').hidden = !shown;
  $('#impNote').textContent = rows.some(r => r.count) ? '' : 'Заготовка больше самого большого листа в таблице.';
}

function initImposePanel() {
  load();
  for (const [id, [k]] of Object.entries(FIELDS)) {
    const el = $('#' + id); el.value = P[k];
    el.onchange = () => {
      const [, lo, hi] = FIELDS[id], v = parseFloat(el.value);
      P[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : DEF[k];
      el.value = P[k]; save(); ui.net = true;
    };
  }
  $('#impPdfBtn').onclick = () => shown && exportSheetPDF(shown);
  $('#impRows').addEventListener('click', e => {
    const b = e.target.closest('.imp-row'); if (!b) return;
    P.sheet = b.dataset.id; save(); ui.net = true;
  });
  $$('#impSec input').forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); }));
}

export { drawImpose, initImposePanel };
