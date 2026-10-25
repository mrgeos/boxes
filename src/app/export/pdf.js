// PDF для типографии: дизайн по граням, рез, биговка, клей и вылет слоями; один лист или раскладка
import { slug } from '../core/util.js';
import { faceKeys, faceLabel, faceMM, netLayout } from '../core/model.js';
import { renderFace, drawNetPanel, cropPx, setSkipStickers } from '../faces/render.js';
import { bagFilm } from '../carriers/bag.js';
import { fanOutline } from '../carriers/cup.js';
import { BLEED_MM } from '../net/net-check.js';
import { grownPoly, paintBleed, printSheet, bleeds } from '../net/bleed.js';
import { dielineData } from '../net/dieline.js';
import { backNet } from '../net/net-side.js';
import { panelPath } from '../net/net-view.js';

/* A PDF written by hand (nothing to load: the file is a few kilobytes of text round the pictures). The page is the
   sheet with its bleed, in mm (1 pt = 25.4/72 mm): MediaBox and BleedBox are the sheet, TrimBox the net.
   The design: every panel of the net is its own picture, painted from its face at the print's own resolution (the
   face is drawn again at `dpi`, not taken from the model's texture, which is far coarser), with its bleed round it,
   as a JPEG; the panels are drawn twice from the one picture, first the bleed ring of all of them, then the panels,
   so a neighbour covers the bleed at a fold, as in the PNG (net/bleed.js). Unprinted panels and glue flaps are plain
   colour. The lines are vectors in spot colours named as the cutters know them: CutContour (the cut), Crease, Glue,
   Bleed. All of it sits in optional-content layers: Дизайн, Рез, Биговка, Клей, Вылет, Справка. The net is one form
   (a drawing that is placed), so a sheet of copies (printPDF with a layout) is the same drawing placed again. */
const PT = 72 / 25.4, MAX_SIDE = 12000, MAX_PX = 60e6;
const n3 = v => String(+v.toFixed(3)), n4 = v => String(+v.toFixed(4));
/* layers: name in the PDF, name for the viewer, the spot colour (alternate RGB), the line */
const LAYERS = [
  ['Design', 'Дизайн'],
  ['Cut', 'Рез', 'CutContour', [0, .627, .89], ''],
  ['Crease', 'Биговка', 'Crease', [.902, 0, .494], '[2 1.2] 0 d'],
  ['Glue', 'Клей', 'Glue', [.953, .573, 0], '[1 1] 0 d'],
  ['Bleed', 'Вылет', 'Bleed', [.91, .133, .165], ''],
  ['Info', 'Справка', null, [.6, .6, .6], '[1.5 1.5] 0 d']];
const LAYER_OF = { CUT: 'Cut', CREASE: 'Crease', GLUE: 'Glue', SEAL: 'Glue', BLEED: 'Bleed', INFO: 'Info' };
const hex16 = s => 'FEFF' + [...s].map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');

/* ---------- the file ---------- */
function writer() {
  const enc = new TextEncoder(), objs = [];
  const reserve = () => objs.push(null), id = () => objs.length;
  const put = (n, dict, stream) => {
    const bytes = typeof stream === 'string' ? enc.encode(stream) : stream, body = bytes == null ? `${dict}` : `${dict.replace(/>>$/, '')} /Length ${bytes.length} >>`;
    const parts = [enc.encode(`${n} 0 obj\n${body}\n`)];
    if (bytes != null) parts.push(enc.encode('stream\n'), bytes, enc.encode('\nendstream\n'));
    parts.push(enc.encode('endobj\n'));
    objs[n - 1] = parts;
  };
  const add = (dict, stream) => { reserve(); put(id(), dict, stream); return id(); };
  const finish = (root, info) => {
    const chunks = [enc.encode('%PDF-1.5\n%\xE2\xE3\xCF\xD3\n')], off = [];
    let at = chunks[0].length;
    objs.forEach(parts => { off.push(at); for (const p of parts) { chunks.push(p); at += p.length; } });
    const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...off.map(v => `${String(v).padStart(10, '0')} 00000 n \n`)].join('');
    chunks.push(enc.encode(`${xref}trailer\n<< /Size ${objs.length + 1} /Root ${root} 0 R /Info ${info} 0 R >>\nstartxref\n${at}\n%%EOF\n`));
    const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0)); let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  };
  return { add, reserve, put, id, finish };
}

/* ---------- paths (mm, y down) ---------- */
const K = .5522847498;
function circleOps(cx, cy, r) {
  const k = K * r;
  return `${n3(cx + r)} ${n3(cy)} m ${n3(cx + r)} ${n3(cy + k)} ${n3(cx + k)} ${n3(cy + r)} ${n3(cx)} ${n3(cy + r)} c ${n3(cx - k)} ${n3(cy + r)} ${n3(cx - r)} ${n3(cy + k)} ${n3(cx - r)} ${n3(cy)} c ${n3(cx - r)} ${n3(cy - k)} ${n3(cx - k)} ${n3(cy - r)} ${n3(cx)} ${n3(cy - r)} c ${n3(cx + k)} ${n3(cy - r)} ${n3(cx + r)} ${n3(cy - k)} ${n3(cx + r)} ${n3(cy)} c h `;
}
/* the arc from p to q with bulge t (positive: clockwise on screen) as Bézier curves of at most 90° */
function arcOps(p, q, t) {
  const c = Math.hypot(q[0] - p[0], q[1] - p[1]); if (c < 1e-9) return '';
  const sg = t > 0 ? 1 : -1, th = 4 * Math.atan(Math.abs(t)), r = c / (2 * Math.sin(th / 2)), d = r * Math.cos(th / 2);
  const ux = (q[0] - p[0]) / c, uy = (q[1] - p[1]) / c, cx = (p[0] + q[0]) / 2 - sg * -uy * d, cy = (p[1] + q[1]) / 2 - sg * ux * d;
  const a0 = Math.atan2(p[1] - cy, p[0] - cx), m = Math.max(1, Math.ceil(th / (Math.PI / 2))), da = sg * th / m, kk = 4 / 3 * Math.tan(da / 4);
  let s = '';
  for (let i = 0; i < m; i++) {
    const A = a0 + da * i, B = A + da, c1 = [cx + r * (Math.cos(A) - kk * Math.sin(A)), cy + r * (Math.sin(A) + kk * Math.cos(A))], c2 = [cx + r * (Math.cos(B) + kk * Math.sin(B)), cy + r * (Math.sin(B) - kk * Math.cos(B))];
    s += `${n3(c1[0])} ${n3(c1[1])} ${n3(c2[0])} ${n3(c2[1])} ${n3(cx + r * Math.cos(B))} ${n3(cy + r * Math.sin(B))} c `;
  }
  return s;
}
function lineOps(pr) {
  if (pr.circle) return circleOps(pr.circle.cx, pr.circle.cy, pr.circle.r);
  const P = pr.pts; if (P.length < 2) return '';
  let s = `${n3(P[0][0])} ${n3(P[0][1])} m `;
  const m = pr.closed ? P.length : P.length - 1;
  for (let i = 0; i < m; i++) { const q = P[(i + 1) % P.length]; s += pr.bulge[i] ? arcOps(P[i], q, pr.bulge[i]) : `${n3(q[0])} ${n3(q[1])} l `; }
  return s + (pr.closed ? 'h ' : '');
}
const polyOps = P => P.map((v, i) => `${n3(v[0])} ${n3(v[1])} ${i ? 'l' : 'm'}`).join(' ') + ' h ';
/* the outline of a panel grown by g mm (0: the panel itself) */
function shapeOps(p, g) {
  if (p.fan) return polyOps(fanOutline(p.fan).map(([X, Y]) => [p.x + X, p.y + Y]));
  if (g > 0) return polyOps(grownPoly(p, g));
  if (p.circle) return circleOps(p.x + p.w / 2, p.y + p.h / 2, p.w / 2);
  if (p.poly) return polyOps(p.poly);
  if (p.r) { const r = Math.min(p.r, p.w / 2, p.h / 2), x = p.x, y = p.y, X = x + p.w, Y = y + p.h; return lineOps({ pts: [[x + r, y], [X - r, y], [X, y + r], [X, Y - r], [X - r, Y], [x + r, Y], [x, Y - r], [x, y + r]], closed: true, bulge: [0, .41421356, 0, .41421356, 0, .41421356, 0, .41421356] }); }
  return `${n3(p.x)} ${n3(p.y)} ${n3(p.w)} ${n3(p.h)} re `;
}
let tint = null;
function rgbOf(css) {
  if (!tint) { const c = document.createElement('canvas'); c.width = c.height = 1; tint = c.getContext('2d', { willReadFrequently: true }); }
  tint.clearRect(0, 0, 1, 1); tint.fillStyle = '#000'; tint.fillStyle = css || '#ffffff'; tint.fillRect(0, 0, 1, 1);
  return [...tint.getImageData(0, 0, 1, 1).data.slice(0, 3)].map(v => n4(v / 255)).join(' ');
}
const tick = () => new Promise(r => setTimeout(r));
const jpeg = async c => new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', .92))).arrayBuffer());

/* ---------- the design: a picture for every panel ---------- */
/* the pictures of the net's panels: [{ p, w, h (px), data (JPEG), x, y, W, H (mm: the picture's place, the panel with its bleed) }], and the dpi each face was
   painted at. A face is painted once, the panels cut from it, then it is let go (a large sheet's faces would not fit in memory together). */
async function panelPictures(o, S, dpi, report) {
  const n = S.n, b = S.bleed, pics = new Map(), dpis = [];
  const keys = [...new Set(n.panels.map(p => p.key))].filter(k => faceKeys(o).includes(k));
  for (const key of keys) {
    const [mw, mh] = faceMM(o, key), ppm = Math.min(dpi / 25.4, MAX_SIDE / Math.max(mw, mh), Math.sqrt(MAX_PX / (mw * mh)));
    report?.(faceLabel(o, key));
    await tick();
    const T = document.createElement('canvas'); T.width = Math.max(16, Math.round(mw * ppm)); T.height = Math.max(16, Math.round(mh * ppm));
    const target = { canvas: T, ctx: T.getContext('2d'), ppm: T.width / mw };
    setSkipStickers(true); try { renderFace(o, key, target); } finally { setSkipStickers(false); }
    dpis.push({ key, label: faceLabel(o, key), dpi: Math.round(T.width / mw * 25.4) });
    for (const p of n.panels.filter(q => q.key === key)) {
      const k = T.width / mw, X = p.x - b, Y = p.y - b, W = p.w + 2 * b, H = p.h + 2 * b;
      const R = document.createElement('canvas'); R.width = Math.max(1, Math.round(W * k)); R.height = Math.max(1, Math.round(H * k));
      const c = R.getContext('2d'); c.fillStyle = o.faces[key]?.bg || o.board || '#ffffff'; c.fillRect(0, 0, R.width, R.height);
      c.translate(-X * k, -Y * k);
      if (b && bleeds(o, p)) paintBleed(c, o, { panels: [p] }, 0, 0, k, b, null, () => T);
      c.save(); c.beginPath(); panelPath(c, p, 0, 0, k); c.clip(); drawNetPanel(c, T, p, p.x * k, p.y * k, p.w * k, p.h * k, cropPx(T, p)); c.restore();
      pics.set(p, { w: R.width, h: R.height, data: await jpeg(R), x: X, y: Y, W, H });
      R.width = R.height = 0;
    }
    T.width = T.height = 0;
  }
  return { pics, dpis };
}

/* ---------- the drawing of one net (a form, in mm with y down) ---------- */
/* The form of one side of the sheet: its pictures, the design, the lines. sh = { S, D, pics }; the numbers of the layers
   and the spot colours are shared by all the sides of the file. */
function sideForm(pdf, o, sh, ocg, cs) {
  const { S, D, pics } = sh, n = S.n, b = S.bleed;
  const images = new Map(); let im = 0;
  for (const [p, pic] of pics) { images.set(p, `Im${im++}`); pic.id = pdf.add(`<< /Type /XObject /Subtype /Image /Width ${pic.w} /Height ${pic.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode >>`, pic.data); }
  // the design: bleed rings of all panels first, then the panels, then the glue flaps
  const colorOf = p => p.plain ? rgbOf(p.plain) : p.fold ? rgbOf(o.faces.front?.bg || o.board) : p.blank && !bagFilm(o) ? rgbOf(p.reverse ? o.faces.inside?.bg || o.board : o.board) : null;
  let design = '';
  const place = p => { const pic = pics.get(p); return `q ${n3(pic.W)} 0 0 ${n3(-pic.H)} ${n3(pic.x)} ${n3(pic.y + pic.H)} cm /${images.get(p)} Do Q `; };
  if (b) for (const p of n.panels) {
    if (!bleeds(o, p)) continue;
    const col = pics.has(p) ? null : colorOf(p);
    if (!pics.has(p) && !col) continue;
    design += `q ${shapeOps(p, b)}${shapeOps(p, 0)}W* n ${col ? `${col} rg ${shapeOps(p, b)}f* ` : place(p)}Q\n`;
  }
  for (const p of n.panels) {
    const col = pics.has(p) ? null : colorOf(p);
    if (!pics.has(p) && !col) continue;
    design += `q ${shapeOps(p, 0)}W n ${col ? `${col} rg ${shapeOps(p, 0)}f ` : place(p)}Q\n`;
  }
  for (const t of n.tabs || []) design += `q ${rgbOf(n.plain || o.board || '#ffffff')} rg ${polyOps(t.pts)}f Q\n`;
  // the lines
  let lines = ''; const by = {};
  for (const pr of D.prims) (by[LAYER_OF[pr.layer]] ||= []).push(pr);
  for (const [key, , spot, rgb, dash] of LAYERS.slice(1)) {
    const list = by[key]; if (!list?.length) continue;
    lines += `/OC /L${key} BDC q ${spot ? `/Cs${key} CS 1 SCN` : `${rgb.map(n4).join(' ')} RG`} ${key === 'Cut' ? .2 : .15} w ${dash || '[] 0 d'} ${list.map(pr => lineOps(pr) + 'S ').join('')}Q EMC\n`;
  }
  const content = `q 1 0 0 1 ${n3(b)} ${n3(b)} cm\n/OC /LDesign BDC\n${design}EMC\n${lines}Q\n`;
  const res = `<< /XObject << ${[...images].map(([p, nm]) => `/${nm} ${pics.get(p).id} 0 R`).join(' ')} >> /ColorSpace << ${cs} >> /Properties << ${LAYERS.map(([k]) => `/L${k} ${ocg[k]} 0 R`).join(' ')} >> >>`;
  return pdf.add(`<< /Type /XObject /Subtype /Form /BBox [0 0 ${n3(S.W)} ${n3(S.H)}] /Resources ${res} >>`, content);
}
/* back: a second page, the sheet seen from behind (net/net-side.js: mirrored, with the inside faces), the same size and trim */
async function build(o, { bleed = BLEED_MM, dpi = 300, layout = null, report = null, back = false } = {}) {
  const sheets = [];
  for (const side of back && !layout ? ['front', 'back'] : ['front']) {
    const S = printSheet(o, bleed, side === 'back' ? backNet(o, netLayout(o)) : undefined), D = dielineData(o, { bleed: S.bleed, side });
    sheets.push({ S, D, side, ...(await panelPictures(o, S, dpi, report)) });
  }
  const S = sheets[0].S, b = S.bleed, pdf = writer(), dpis = sheets.flatMap(h => h.side === 'back' ? h.dpis.map(f => ({ ...f, label: `${f.label} (оборот)` })) : h.dpis);
  // catalog, pages, page: numbers first, the rest is put when known
  const root = pdf.add('<< >>'), pages = pdf.add('<< >>'), page = pdf.add('<< >>'), info = pdf.add(`<< /Title (${slug(o.name || 'box').replace(/[^\x20-\x7E]/g, '').replace(/[()\\]/g, '') || 'box'}) /Producer (Box Studio 3D) /Creator (Box Studio 3D) >>`);
  const ocg = {}; for (const [key, name] of LAYERS) ocg[key] = pdf.add(`<< /Type /OCG /Name <${hex16(name)}> >>`);
  const cs = LAYERS.filter(l => l[2]).map(([key, , spot, rgb]) => `/Cs${key} [/Separation /${spot} /DeviceRGB << /FunctionType 2 /Domain [0 1] /C0 [1 1 1] /C1 [${rgb.map(n4).join(' ')}] /N 1 >>]`).join(' ');
  const box = (x0, y0, x1, y1) => `[${[x0, y0, x1, y1].map(v => n4(v * PT)).join(' ')}]`, sw = layout ? layout.sheet.w : S.W, sh = layout ? layout.sheet.h : S.H;
  const kids = [];
  sheets.forEach((h, i) => {
    const form = sideForm(pdf, o, h, ocg, cs), pg = i ? pdf.add('<< >>') : page;
    // the page: the net once, or the copies of a sheet's layout
    let place0 = '';
    if (layout) for (const it of layout.items) place0 += layout.rot ? `q 0 1 -1 0 ${n3(it.x - b + S.H)} ${n3(it.y - b)} cm /F Do Q\n` : `q 1 0 0 1 ${n3(it.x - b)} ${n3(it.y - b)} cm /F Do Q\n`;
    else place0 = '/F Do\n';
    const stream = pdf.add('<< >>', `q ${n4(PT)} 0 0 ${n4(-PT)} 0 ${n4(sh * PT)} cm\n${place0}Q\n`);
    pdf.put(pg, `<< /Type /Page /Parent ${pages} 0 R /MediaBox ${box(0, 0, sw, sh)}${layout ? '' : ` /BleedBox ${box(0, 0, sw, sh)} /TrimBox ${box(b, b, b + S.n.W, b + S.n.H)}`} /Contents ${stream} 0 R /Resources << /XObject << /F ${form} 0 R >> >> >>`);
    kids.push(pg);
  });
  pdf.put(pages, `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
  const all = LAYERS.map(([k]) => `${ocg[k]} 0 R`).join(' '), labels = kids.length > 1 ? ` /PageLabels << /Nums [0 << /P <${hex16('Лицо')}> >> 1 << /P <${hex16('Оборот')}> >>] >>` : '';
  pdf.put(root, `<< /Type /Catalog /Pages ${pages} 0 R /OCProperties << /OCGs [${all}] /D << /Order [${all}] /ON [${all}] >> >>${labels} >>`);
  return { bytes: pdf.finish(root, info), faces: dpis, dpi: Math.min(...dpis.map(f => f.dpi), Math.round(dpi)), bleed: b, sheet: { w: sw, h: sh }, pages: kids.length };
}
/* The print PDF of object o: { bytes, faces: [{ key, label, dpi }], dpi, bleed, sheet, pages }. bleed (mm, 3), dpi (300); layout
   (an imposition of net/impose.js): the sheet of copies instead of one net; back: also the reverse page. */
const printPDF = (o, opts = {}) => build(o, opts);

export { printPDF };
