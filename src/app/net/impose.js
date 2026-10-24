// Раскладка на лист: сколько заготовок (с вылетом и зазором) помещается на печатный лист
import { netLayout } from '../core/model.js';
import { isPart } from '../core/extras.js';
import { BLEED_MM } from './net-check.js';

/* Pure data, no DOM: a script or an agent asks `imposition(o, sheet, opts)` the same way the panel does.
   A sheet is { id, label, w, h (mm, w the short side), kind }. An offset sheet is held by grippers along one long
   edge (GRIP mm that nothing may be printed on); a digital one has no grippers, only the margin. The estimate is
   made on the blank's bounding box (the dies of a real job are nested, so a real layout may hold more): the blank
   and its bleed form a rectangle, the rectangles are laid in a grid at `gap` mm between the cuts, the grid turned
   0° or 90°, whichever holds more. */
const SHEETS = [
  { id: 'A4', label: 'A4', w: 210, h: 297, kind: 'digital' },
  { id: 'A3', label: 'A3', w: 297, h: 420, kind: 'digital' },
  { id: 'SRA3', label: 'SRA3', w: 320, h: 450, kind: 'digital' },
  { id: 'A3+', label: 'A3+', w: 330, h: 488, kind: 'offset' },
  { id: '640x900', label: '640×900', w: 640, h: 900, kind: 'offset' },
  { id: '700x1000', label: '700×1000', w: 700, h: 1000, kind: 'offset' },
  { id: '720x1020', label: '720×1020', w: 720, h: 1020, kind: 'offset' },
  { id: '790x1090', label: '790×1090', w: 790, h: 1090, kind: 'offset' },
];
const GRIP = 12, MARGIN = 5;

/* which extra a panel of the sheet belongs to (null: the object's own blank). A part is cut on its own: a sleeve with
   its glue flap, a board insert with its skirts, tissue, a carrier */
const ownerOf = p => isPart(p.key) ? p.key : p.part ? (p.fold ? 'insert' : p.key === 'glue' ? 'sleeve' : null) : null;

/* the size of what is cut as one piece: the object's blank (part: null) or one of its parts; null where there is no
   sheet to print (a 3D model) */
function pieceOf(o, part = null) {
  if (!o || o.type === 'model') return null;
  const n = netLayout(o), mine = n.panels.filter(p => (ownerOf(p) || null) === part);
  if (!mine.length) return null;
  if (!part && mine.length === n.panels.length) return { w: n.W, h: n.H };   // the whole sheet, tabs and a film's tab included
  const xs = mine.flatMap(p => [p.x, p.x + p.w]), ys = mine.flatMap(p => [p.y, p.y + p.h]);
  if (!part) for (const t of n.tabs || []) for (const [X, Y] of t.pts) { xs.push(X); ys.push(Y); }
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/* how many pieces of `piece` ({ w, h }) a row of length u holds, bleed on both ends of the row */
const across = (u, p, gap, bleed) => u - 2 * bleed >= p - 1e-9 ? Math.floor((u - 2 * bleed - p) / (p + gap) + 1e-9) + 1 : 0;

/* The layout of piece on a sheet (an id from SHEETS or a sheet object). opts: bleed (mm, 3), gap between cuts
   (2 × bleed), grip (mm along the sheet's long edge; 12 on an offset sheet, 0 on a digital one), margin (5), qty
   (a run: how many sheets it takes). Returns { sheet, piece, bleed, gap, grip, margin, area, rot, nx, ny, count, fill,
   items: [{ x, y, w, h }] (each piece's cut box on the sheet, mm, the grip at the left edge), sheets } */
function fitPiece(piece, sheet, opts = {}) {
  const S = typeof sheet === 'string' ? SHEETS.find(s => s.id === sheet) : sheet;
  if (!piece || !S) return null;
  const bleed = opts.bleed ?? BLEED_MM, gap = opts.gap ?? 2 * bleed, margin = opts.margin ?? MARGIN, grip = opts.grip ?? (S.kind === 'offset' ? GRIP : 0);
  const side = Math.max(grip, margin);   // the held edge: the grip, or the margin where there is none
  const area = { x: side, y: margin, w: Math.max(0, S.w - side - margin), h: Math.max(0, S.h - 2 * margin) };
  let best = null;
  for (const rot of [0, 90]) {
    const w = rot ? piece.h : piece.w, h = rot ? piece.w : piece.h, nx = across(area.w, w, gap, bleed), ny = across(area.h, h, gap, bleed);
    if (nx * ny > (best?.count ?? 0)) best = { rot, w, h, nx, ny, count: nx * ny };
  }
  const out = { sheet: { id: S.id, label: S.label, w: S.w, h: S.h, kind: S.kind }, piece: { ...piece }, bleed, gap, grip, margin, area, rot: 0, nx: 0, ny: 0, count: 0, fill: 0, items: [], sheets: null };
  if (best) {
    // the block of pieces sits in the middle of the printable area
    const bw = best.nx * best.w + (best.nx - 1) * gap, bh = best.ny * best.h + (best.ny - 1) * gap, x0 = area.x + (area.w - bw) / 2, y0 = area.y + (area.h - bh) / 2;
    Object.assign(out, { rot: best.rot, nx: best.nx, ny: best.ny, count: best.count, fill: best.count * piece.w * piece.h / (S.w * S.h) });
    for (let j = 0; j < best.ny; j++) for (let i = 0; i < best.nx; i++) out.items.push({ x: x0 + i * (best.w + gap), y: y0 + j * (best.h + gap), w: best.w, h: best.h });
  }
  if (opts.qty > 0) out.sheets = out.count ? Math.ceil(opts.qty / out.count) : null;
  return out;
}

/* the layout of the object's blank (opts.part: of one of its parts) on a sheet; null for a 3D model */
function imposition(o, sheet, opts = {}) { return fitPiece(pieceOf(o, opts.part || null), sheet, opts); }

export { GRIP, MARGIN, SHEETS, fitPiece, imposition, pieceOf };
