// Правила печати листа: какие клапаны, ушки и язычки печатаются и чем, одна классификация для всех упаковок из листа
import { clamp } from '../core/util.js';

/* One classification for every sheet-material pack (netLayout runs it over each net it builds). A piece of the net with
   no face of its own — a panel with `blank`, or a tab — hangs by a crease on a panel that has one (found by the shared
   edge, `joins` and a tab's `on` respected). Then:
   1. a glue flap (panel `kind: 'glue'` or key `glue`; a tab that is not a lock tongue, a wrap turn-in or a flap of a
      carton) prints a strip of `o.glueBleed` mm by its crease, with the host's ground; the rest is bare (no ink, no
      varnish, not even the bleed of the panel it folds off): `glueStrip`, and `flap` with a `strip`;
   2. the turn-ins of a wrapped rigid box (tabs of a net with `book` / `rigid`), 3. every other flap, ear, dust flap,
      hidden fold and tongue print whole: `flap: { bgOf }`, the host's ground and the sheet's layers, cut to the outline.
   A tab is not a panel of the net (its outline is a polygon beside them), so the rules put a panel-like twin of each
   classified tab in `n.flapPanels`, and `n.panels` stays as the builders made it. Everything that prints (the screen's
   net, the PNG and PDF, the 3D picture) walks `printPanels(n)`: the panels and these twins. */
const EPS = .6;
const boxOf = p => p.pts ? [Math.min(...p.pts.map(v => v[0])), Math.min(...p.pts.map(v => v[1])), Math.max(...p.pts.map(v => v[0])), Math.max(...p.pts.map(v => v[1]))] : [p.x, p.y, p.x + p.w, p.y + p.h];
const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
/* which edge of rectangle a lies on rectangle b, and for how long: { edge: 'left' | 'right' | 'top' | 'bottom' (of a), len } or null */
function touch(a, b) {
  const cand = [];
  if (Math.abs(a[2] - b[0]) < EPS) cand.push({ edge: 'right', len: overlap(a[1], a[3], b[1], b[3]) });
  if (Math.abs(a[0] - b[2]) < EPS) cand.push({ edge: 'left', len: overlap(a[1], a[3], b[1], b[3]) });
  if (Math.abs(a[3] - b[1]) < EPS) cand.push({ edge: 'bottom', len: overlap(a[0], a[2], b[0], b[2]) });
  if (Math.abs(a[1] - b[3]) < EPS) cand.push({ edge: 'top', len: overlap(a[0], a[2], b[0], b[2]) });
  return cand.filter(c => c.len > 1).sort((m, n) => n.len - m.len)[0] || null;
}
/* does piece p (a panel or a flap twin) lie against the rectangle r (net mm) */
const adjacent = (p, r) => !!touch(boxOf(p), r);

function applyFlapRules(o, n, hasFace) {
  const bleed = clamp(o.glueBleed ?? 3, 0, 10), hosts = n.panels.filter(q => !q.part && !q.fan && !q.circle);
  const isPanel = p => !p.part && !p.fold && !p.circle && !p.fan && !p.plain && p.ang == null && p.blank != null && !hasFace(p.key) && !p.flap && !p.glueStrip;
  const todo = [
    ...n.panels.filter(isPanel).map(p => ({ p, glue: (p.kind ?? (p.key === 'glue' ? 'glue' : 'flap')) === 'glue', joins: p.joins, key: p.key })),
    ...(n.tabs || []).filter(t => t.pts?.length > 2 && !t.flap).map(t => ({ p: t, tab: true, joins: [t.on], key: 'tab', on: t.on,
      glue: (t.kind ?? (n.book || n.rigid ? 'wrap' : t.label === '' ? 'flap' : 'glue')) === 'glue' }))];
  const bgOf = q => q.flap ? q.flap.bgOf : hasFace(q.key) ? q.key : null;
  const left = new Set(todo), out = [];
  // a piece may hang on another piece without a face (an ear on a flap): a second pass takes those
  for (let pass = 0; pass < 2 && left.size; pass++) for (const it of [...left]) {
    const r = boxOf(it.p);
    let best = null;
    for (const q of hosts) {
      const bg = bgOf(q); if (!bg || q === it.p) continue;
      if (it.joins && !it.joins.includes(q.key)) continue;
      if (q.joins && !q.joins.includes(it.key)) continue;
      const t = touch(r, boxOf(q)); if (t && (!best || t.len > best.t.len)) best = { q, t, bg };
    }
    // a tab whose own panel is not next to it (it hangs on another of the same key)
    if (!best && it.tab) for (const q of hosts) { const bg = bgOf(q), t = bg && touch(r, boxOf(q)); if (t && (!best || t.len > best.t.len)) best = { q, t, bg }; }
    if (!best) continue;
    left.delete(it);
    const { q, t, bg } = best, size = t.edge === 'left' || t.edge === 'right' ? r[2] - r[0] : r[3] - r[1], mm = Math.min(bleed, size);
    const flap = it.glue ? (mm > 0 ? { bgOf: bg, strip: { mm, edge: t.edge } } : null) : { bgOf: bg, ...(it.tab && it.p.glue?.length > 2 ? { hole: it.p.glue } : {}) };
    const glueStrip = it.glue ? { of: q.key, edge: t.edge, mm } : null;
    if (it.tab) {
      const tw = { key: 'tab', tab: true, x: r[0], y: r[1], w: r[2] - r[0], h: r[3] - r[1], poly: it.p.pts, noPrint: it.glue, ...(flap ? { flap } : {}), ...(glueStrip ? { glueStrip } : {}) };
      it.p.fp = tw; out.push(tw);
    } else {
      Object.assign(it.p, flap ? { flap } : {}, glueStrip ? { glueStrip, noPrint: true } : {});
    }
  }
  if (out.length) n.flapPanels = out;
  return n;
}
const flipEdge = e => e === 'left' ? 'right' : e === 'right' ? 'left' : e;
/* the panels that print: the net's, then the twins of its classified tabs */
const printPanels = n => n.flapPanels ? [...n.panels, ...n.flapPanels] : n.panels;
/* the twin of a tab on the net seen from behind (x mirrored about the sheet's width W; the reverse of a flap is the board's
   inside, `plain`); pts: the tab's mirrored outline */
function mirrorTwin(f, pts, W, plain) {
  const m = { key: 'tab', tab: true, x: W - f.x - f.w, y: f.y, w: f.w, h: f.h, poly: pts, noPrint: f.noPrint, plain };
  if (f.glueStrip) m.glueStrip = { ...f.glueStrip, edge: flipEdge(f.glueStrip.edge) };
  return m;
}
/* the net has a glue flap (then the «Вылет на клеевой клапан» field belongs in the panel) */
const hasGlueFlap = n => !!n && (n.panels.some(p => p.glueStrip && !p.part) || (n.tabs || []).some(t => t.fp?.glueStrip));

export { adjacent, applyFlapRules, flipEdge, hasGlueFlap, mirrorTwin, printPanels, touch };
