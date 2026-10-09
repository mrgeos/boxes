// Начинка упаковки: несколько одинаковых 3D-моделей (круассаны, фрукты) разложены по дну коробки, лотка или тортницы
import { clamp } from '../core/util.js';
import { modelShape, placeMany } from '../core/models3d.js';
import { boxInside, tissueOn } from './tissue.js';
import { domeGeom } from './dome.js';
import { torteGeom } from './torte.js';

/* o.fill: a model ({ lib } / { asset }), how many (count), each size mm (its longest side; 0 — as large as fits),
   how they lie (rows: a neat grid; loose: turned a little each, as laid by hand) and their turn. They stand on the
   floor of the box (on the tissue, if there is one), of the dome's tray or of the cake container's base, spread
   evenly over it. However many there are, each mesh of the model is drawn once for all (instancing). */
const FILL_LAYOUT = { rows: 'Ровными рядами', loose: 'Свободно, как руками' };
const fillFits = o => (o.type === 'box' && o.lidType !== 'handle') || o.type === 'dome' || o.type === 'torte';
const fillOn = o => fillFits(o) && !!o.fill?.on;
const defaultFill = () => ({ on: false, model: { lib: 'croissant' }, count: 4, size: 0, layout: 'loose', rot: 0, gap: 6 });
/* where things lie: half sizes of the floor (mm), its height, round or not */
function floorOf(o) {
  if (o.type === 'dome') { const G = domeGeom(o); return { A: G.wb / 2 - 3, B: G.db / 2 - 3, y: G.T + .2, round: false }; }
  if (o.type === 'torte') { const G = torteGeom(o); return { A: G.Rl - 8, B: G.Rl - 8, y: 4.6, round: true }; }
  const I = boxInside(o);
  return { A: I.A - 2, B: I.B - 2, y: I.y0 + (tissueOn(o) ? 2.5 : 0), round: false };
}
/* the spots of count things over the floor, and the size each can have (mm): a grid with as many columns as suit
   the floor's proportions and the thing's own */
function fillSpots(o) {
  const F = o.fill, n = clamp(Math.round(F.count || 1), 1, 60), fl = floorOf(o), sh = modelShape(F.model) || [1, .5, .6];
  const turn = (F.rot || 0) * Math.PI / 180, fx = Math.abs(sh[0] * Math.cos(turn)) + Math.abs(sh[2] * Math.sin(turn)), fz = Math.abs(sh[0] * Math.sin(turn)) + Math.abs(sh[2] * Math.cos(turn));
  const W = fl.A * 2, D = fl.B * 2, gap = clamp(F.gap ?? 6, 0, 100);
  // try every number of columns: the one that lets the things be largest
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols), s = Math.min((W - gap * (cols - 1)) / cols / fx, (D - gap * (rows - 1)) / rows / fz);
    if (!best || s > best.s) best = { cols, rows, s };
  }
  const size = F.size > 0 ? F.size : Math.max(5, best.s * (fl.round ? .72 : 1)), { cols, rows } = best;
  const cw = W / cols, rd = D / rows, spots = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - r * cols : cols, c = i - r * cols;
    let x = -W / 2 + cw * (c + .5) + (cols - inRow) * cw / 2, z = -D / 2 + rd * (r + .5), a = 0;
    if (F.layout === 'loose') { const h = Math.sin(i * 12.9898 + 78.233) * 43758.5453, j = h - Math.floor(h); a = (j - .5) * 28; x += (j - .5) * cw * .12; z += (((h * 7) % 1) - .5) * rd * .12; }
    if (fl.round) { const k = Math.hypot(x / fl.A, z / fl.B); if (k > .8) { x *= .8 / k; z *= .8 / k; } }
    spots.push([x, fl.y, z, a]);
  }
  return { spots, size };
}
function buildFill(o, rt) {
  rt.fill = null;
  if (!fillOn(o) || o.fill.hidden) return;
  const { spots, size } = fillSpots(o), r = placeMany(rt.group, o, o.fill.model, spots, { size, rotY: o.fill.rot || 0 });
  if (r) rt.fill = r.group;
}

export { FILL_LAYOUT, buildFill, defaultFill, fillFits, fillOn };
