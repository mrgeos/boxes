// Контур развёртки для плоттера и САПР: DXF R12 (ASCII), мм
import { BLEED_MM } from '../net/net-check.js';
import { dielineData } from '../net/dieline.js';

/* The dieline (net/dieline.js) as DXF R12, the oldest format every cutter, plotter and CAD takes: millimetres, the
   origin at the net's own corner (the bleed lies at negative coordinates), Y up, so the drawing looks as on the screen.
   Layers: CUT (cyan), CREASE (magenta, dashed), GLUE (orange, dashed; a bag's weld seam is on it too), BLEED (red) and
   INFO (grey, dashed: the print area of a formed lid, the safe zone: nothing to cut). LINE, POLYLINE with bulges for
   arcs, CIRCLE. Names are ASCII: R12 has no Unicode. */
const DXF_LAYERS = [['CUT', 4, 'CONTINUOUS'], ['CREASE', 6, 'DASHED'], ['GLUE', 30, 'DASHED'], ['BLEED', 1, 'CONTINUOUS'], ['INFO', 8, 'DASHED']];
const ON = { SEAL: 'GLUE' };
const num = v => String(+v.toFixed(4));
function dxfText(D) {
  const L = [], g = (code, v) => { L.push(String(code), String(v)); }, y = v => num(D.H - v);
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$MEASUREMENT'); g(70, 1); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 2);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
  g(0, 'LTYPE'); g(2, 'DASHED'); g(70, 0); g(3, 'Dashed'); g(72, 65); g(73, 2); g(40, 3.2); g(49, 2); g(49, -1.2);
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, DXF_LAYERS.length);
  for (const [name, color, lt] of DXF_LAYERS) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, lt); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'BLOCKS'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const p of D.prims) {
    const layer = ON[p.layer] || p.layer;
    if (p.circle) { g(0, 'CIRCLE'); g(8, layer); g(10, num(p.circle.cx)); g(20, y(p.circle.cy)); g(30, 0); g(40, num(p.circle.r)); continue; }
    if (p.pts.length < 2) continue;
    // two points and no arc: a line; else a polyline (a bulge turns the other way once Y is up)
    if (p.pts.length === 2 && !p.closed && !p.bulge[0]) {
      g(0, 'LINE'); g(8, layer); g(10, num(p.pts[0][0])); g(20, y(p.pts[0][1])); g(30, 0); g(11, num(p.pts[1][0])); g(21, y(p.pts[1][1])); g(31, 0); continue;
    }
    g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, p.closed ? 1 : 0);
    p.pts.forEach(([X, Y], i) => { g(0, 'VERTEX'); g(8, layer); g(10, num(X)); g(20, y(Y)); g(30, 0); if (p.bulge[i]) g(42, num(-p.bulge[i])); });
    g(0, 'SEQEND'); g(8, layer);
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return L.join('\n') + '\n';
}
/* the object's dieline as DXF text; bleed (mm, default 3): the BLEED layer (0: none) */
function dielineDXF(o, { bleed = BLEED_MM } = {}) { return dxfText(dielineData(o, { bleed })); }

export { dielineDXF, dxfText };
