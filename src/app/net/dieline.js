// Контур развёртки как данные: линии реза, биговки, клея и вылета в мм (для DXF, PDF и скриптов)
import { BLEED_MM } from './net-check.js';
import { bleedLoops, printSheet } from './bleed.js';
import { templateSVG } from './template.js';
import { backNet } from './net-side.js';
import { netLayout } from '../core/model.js';

/* The dieline of an object as lines, read from its template SVG (net/template.js): that file is what the technologist
   gets, so it is the one source, and no carrier has to say its lines twice. The layer of a line comes from the colour
   and the dash the template draws it in:
     CUT    blue, solid: the cutting rule        CREASE  magenta, dashed: the crease
     GLUE   orange, dashed: glue zones           SEAL    green, dashed: a bag's welded seam
     INFO   grey or dashed blue: the print area of a formed lid, the safe zone (nothing is cut or creased there)
     BLEED  the bleed's outline (net/bleed.js), when bleed > 0
   A line is { layer, pts: [[x, y]…] in the net's mm (origin: its corner, y down), closed, bulge: [per vertex, the arc
   from it to the next: tan(¼ of the arc's angle), positive when it turns clockwise on screen] } or { layer, circle:
   { cx, cy, r } }. */
const LAYERS = ['CUT', 'CREASE', 'GLUE', 'SEAL', 'INFO', 'BLEED'];
const layerOf = (stroke, dashed) => {
  const c = String(stroke).toLowerCase();
  if (c === '#00a0e3') return dashed ? 'INFO' : 'CUT';
  if (c === '#e6007e') return 'CREASE';
  if (c === '#f39200' || c === '#f08c00') return 'GLUE';
  if (c === '#2e9e5b') return 'SEAL';
  return 'INFO';
};
const attrsOf = s => { const a = {}; for (const m of s.matchAll(/([\w:-]+)="([^"]*)"/g)) a[m[1]] = m[2]; return a; };
const numsOf = s => (String(s).match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number);
const QUARTER = Math.tan(Math.PI / 8);
/* the bulge of the arc p → q of radius r (SVG's flags) */
function bulgeOf(p, q, r, large, sweep) {
  const c = Math.hypot(q[0] - p[0], q[1] - p[1]); if (c < 1e-9) return 0;
  const th = 2 * Math.asin(Math.min(1, c / (2 * Math.max(r, c / 2)))), t = Math.tan((large ? 2 * Math.PI - th : th) / 4);
  return sweep ? t : -t;
}
/* an SVG path's M L H V A Z (absolute), as lines */
function pathLines(d) {
  const out = []; let pts = [], bu = [], cur = [0, 0];
  const end = closed => {
    if (pts.length > 1) {
      if (closed && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) { pts.pop(); bu.pop(); bu.push(0); }
      out.push({ pts, bulge: bu.slice(0, pts.length).map(v => v || 0), closed });
    }
    pts = []; bu = [];
  };
  for (const m of d.matchAll(/([MLHVAZ])([^MLHVAZ]*)/gi)) {
    const c = m[1], v = numsOf(m[2]);
    if (c === 'M') { end(false); cur = [v[0], v[1]]; pts = [cur]; bu = [0]; }
    else if (c === 'L') for (let i = 0; i + 1 < v.length; i += 2) { cur = [v[i], v[i + 1]]; pts.push(cur); bu.push(0); }
    else if (c === 'H') { cur = [v[0], cur[1]]; pts.push(cur); bu.push(0); }
    else if (c === 'V') { cur = [cur[0], v[0]]; pts.push(cur); bu.push(0); }
    else if (c === 'A') { const q = [v[5], v[6]]; bu[bu.length - 1] = bulgeOf(cur, q, v[0], v[3], v[4]); cur = q; pts.push(cur); bu.push(0); }
    else if (c === 'Z') end(true);
  }
  end(false);
  return out;
}
/* the lines of the template's «dieline» group (the SVG text of templateSVG) */
function parseDieline(svg) {
  const a = svg.indexOf('<g id="dieline">'), b = svg.indexOf('<g id="bleed">'), body = svg.slice(a < 0 ? 0 : a, b < 0 ? undefined : b), prims = [];
  for (const m of body.matchAll(/<(line|polygon|polyline|rect|circle|path)\b([^>]*?)\/?>/g)) {
    const t = m[1], A = attrsOf(m[2]); if (!A.stroke) continue;
    const layer = layerOf(A.stroke, A['stroke-dasharray'] != null), add = (pts, closed, bulge) => prims.push({ layer, pts, closed, bulge: bulge || pts.map(() => 0) });
    if (t === 'line') add([[+A.x1, +A.y1], [+A.x2, +A.y2]], false);
    else if (t === 'polygon' || t === 'polyline') { const v = numsOf(A.points), pts = []; for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]); add(pts, t === 'polygon'); }
    else if (t === 'circle') prims.push({ layer, circle: { cx: +A.cx, cy: +A.cy, r: +A.r } });
    else if (t === 'rect') {
      const x = +A.x, y = +A.y, w = +A.width, h = +A.height, r = Math.min(+A.rx || 0, w / 2, h / 2);
      if (r > 1e-6) add([[x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r], [x + w - r, y + h], [x + r, y + h], [x, y + h - r], [x, y + r]], true, [0, QUARTER, 0, QUARTER, 0, QUARTER, 0, QUARTER]);
      else add([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
    } else for (const l of pathLines(A.d || '')) add(l.pts, l.closed, l.bulge);
  }
  return prims;
}
/* The object's dieline: { W, H (the net, mm), bleed (mm, 0 when the net has none), sheet: { W, H } (the net and its
   bleed), prims, counts: { layer: n } } */
/* the lines seen from the back of the sheet: turned over, so left and right change places (and an arc's bulge its sign) */
function mirrorPrims(prims, W) {
  return prims.map(pr => pr.circle ? { ...pr, circle: { ...pr.circle, cx: W - pr.circle.cx } } : { ...pr, pts: pr.pts.map(([x, y]) => [W - x, y]), bulge: pr.bulge.map(v => -v) });
}
function dielineData(o, { bleed = BLEED_MM, side = 'front' } = {}) {
  const back = side === 'back', S = printSheet(o, bleed, back ? backNet(o, netLayout(o)) : undefined), b = S.bleed;
  let prims = parseDieline(templateSVG(o, { bleed: 0 }));
  if (back) prims = mirrorPrims(prims, S.n.W);
  if (b) for (const loop of bleedLoops(o, S.n, b)) prims.push({ layer: 'BLEED', pts: loop, closed: true, bulge: loop.map(() => 0) });
  const counts = {}; for (const l of LAYERS) counts[l] = prims.filter(p => p.layer === l).length;
  return { W: S.n.W, H: S.n.H, bleed: b, sheet: { W: S.W, H: S.H }, prims, counts };
}

export { LAYERS, dielineData, parseDieline };
