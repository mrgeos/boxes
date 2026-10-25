// Лицо и оборот развёртки: сторона листа, оборот как зеркальная развёртка с внутренними гранями
import { WHITE_INSIDE } from '../core/constants.js';
import { faceKeys } from '../core/model.js';
import { RT } from '../scene/renderer.js';
import { netWindows } from '../carriers/box.js';

/* A sheet is printed on both sides: the outside faces on one, what is inside the box on the other. Seen from the back
   the sheet is turned over (mirrored left to right), and each panel shows the face on its other side: the lid's
   `top` has `inside` under it, the floor's `bottom` has `insideBottom`; the walls and flaps have no print of their
   own there, only the board's inner colour. `backNet` is that sheet as a net like any other (the same panels at their
   mirrored places, the keys and the picture's turn changed), so the net's drawing, the editing on it
   and the files take it as it is. The side is this browser's choice, like the overlays; `setNetSide` is the action. */
const KEY = 'bs3d-net-side', INSIDE = { top: 'inside', bottom: 'insideBottom' };
let side = 'front';
const listeners = new Set();
const onNetSide = cb => { listeners.add(cb); };
function setNetSide(v) {
  v = v === 'back' ? 'back' : 'front';
  if (v === side) return;
  side = v;
  try { localStorage.setItem(KEY, v); } catch { /* private mode */ }
  for (const f of listeners) f();
}
function loadNetSide() { try { side = localStorage.getItem(KEY) === 'back' ? 'back' : 'front'; } catch { /* none kept */ } }
const insideKeys = o => faceKeys(o).filter(k => k === 'inside' || k === 'insideBottom');
/* has this object an inside to print? (then the reverse can be shown and designed) */
const hasInside = o => !!o && insideKeys(o).length > 0;
/* the side shown for o: the reverse only where there is one */
const sideOf = o => (side === 'back' && hasInside(o) ? 'back' : 'front');
/* the inside's colour as it is made (the board's own or white): a face left at it has nothing to print */
const isDefaultInside = (o, bg) => [WHITE_INSIDE, '#f4f1ea', o.board].some(c => c && String(c).toLowerCase() === String(bg).toLowerCase());
/* does the inside carry anything to print: a layer, a gradient, a colour of its own */
const hasReverse = o => !!o && insideKeys(o).some(k => { const f = o.faces[k]; return !!f && (f.layers.length > 0 || !!f.bgGrad || !isDefaultInside(o, f.bg)); });
/* the colour of the board's inside where nothing is printed (what the 3D model shows on the walls) */
function innerColor(o) {
  const c = RT.get(o.id)?.innerMat?.color;
  return c ? '#' + c.getHexString() : o.faces.inside?.bg || o.faces.insideBottom?.bg || WHITE_INSIDE;
}

/* ---------- mirroring ---------- */
const mp = (W, pts) => pts.map(([X, Y]) => [W - X, Y]);
const ml = (W, l) => [W - l[0], l[1], W - l[2], l[3]];
/* openings, as netWindows gives them, on the mirrored sheet */
function mirrorWindows(ws, W) {
  const out = ws.map(q => ({ ...q, x: W - q.x - q.w, ...(q.radii ? { radii: [q.radii[1], q.radii[0], q.radii[3], q.radii[2]] } : {}), ...(q.rr ? { rr: [q.rr[1], q.rr[0], q.rr[3], q.rr[2]] } : {}),
    ...(q.polys ? { polys: q.polys.map(pl => pl.map(v => ({ x: W - v.x, y: v.y }))) } : {}) }));
  const lc = ws.leafCut;
  out.leafCut = lc ? { cuts: lc.cuts.map(l => mp(W, l)), creases: lc.creases.map(l => ml(W, l)), keep: lc.keep.map(l => mp(W, l)) } : lc;
  return out;
}
/* the net seen from its back: the panels where the turned-over sheet has them, with the face on their other side */
function backNet(o, n) {
  const W = n.W, plain = innerColor(o), have = new Set(insideKeys(o));
  const panels = n.panels.map(p => {
    const bk = INSIDE[p.key], ok = bk && have.has(bk) && !p.fan, m = { ...p, x: W - p.x - p.w };
    m.key = ok ? bk : null;
    // the inside's picture lies on the paper's other side: turned over left to right, it is turned half a round on the sheet
    // (as the model assembles it: net/../fold-rig.js); the piece of the face a panel shows stays the same
    if (ok) { m.q = (((p.q ?? (p.rot ? 2 : 0)) + 2) % 4 + 4) % 4; delete m.rot; } else { m.plain = plain; delete m.crop; }
    if (p.poly) m.poly = mp(W, p.poly);
    if (p.holes) m.holes = p.holes.map(h => mp(W, h));
    if (p.creases) m.creases = p.creases.map(l => ml(W, l));
    if (p.glue) m.glue = mp(W, p.glue);
    if (p.cx != null) { m.cx = W - p.cx; m.ang = -p.ang; }
    return m;
  });
  const out = { ...n, panels, back: true, plain, windows: n.part ? [] : mirrorWindows(netWindows(o, n), W) };
  if (n.tabs) out.tabs = n.tabs.map(t => ({ ...t, pts: mp(W, t.pts), ...(t.glue ? { glue: mp(W, t.glue) } : {}), ...(t.creases ? { creases: t.creases.map(l => ml(W, l)) } : {}) }));
  if (n.slots) out.slots = n.slots.map(l => ml(W, l));
  if (n.tray) out.tray = { ...n.tray, cut: mp(W, n.tray.cut), safe: mp(W, n.tray.safe) };
  return out;
}
/* the net as seen from side `s` ('back' where the object has an inside) */
const netFor = (o, n, s) => (s === 'back' && hasInside(o) && !n.part ? backNet(o, n) : n);

export { backNet, hasInside, hasReverse, insideKeys, innerColor, isDefaultInside, loadNetSide, netFor, onNetSide, setNetSide, sideOf };
