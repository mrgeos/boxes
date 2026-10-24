// Файлы для типографии: PDF, DXF, PDF листа с раскладкой (кнопки меню «Экспорт» и вкладки «Развёртка»)
import { slug, fmt, toast } from '../core/util.js';
import { activeObj } from '../core/state.js';
import { netLayout } from '../core/model.js';
import { saveFile } from '../core/project.js';
import { BLEED_MM, printIssues } from '../net/net-check.js';
import { printPDF } from './pdf.js';
import { dielineDXF } from './dxf.js';
import { zipStore } from './zip.js';

/* The three files a printer asks for. Each is made from the project's data (printPDF, dielineDXF), so these functions
   only save and tell. Nothing is held back by what the check finds: the toast says how many remarks the layout has. */
let busy = false;
const remarks = o => { const n = printIssues(o).length; return n ? ` · замечаний к макету: ${n}` : ''; };
async function savePDF(o, name, opts) {
  if (busy) return toast('PDF ещё собирается');
  busy = true; toast('Готовлю PDF…', 120000);
  try {
    const r = await printPDF(o, { ...opts, report: label => toast(`PDF: грань «${label}»…`, 120000) });
    const low = r.faces.filter(f => f.dpi < 295), note = ['300 dpi', ...low.map(f => `${f.label} ${f.dpi} dpi`)].join(', ');
    if (await saveFile(name(r), new Blob([r.bytes], { type: 'application/pdf' }))) toast(`PDF: ${note}${opts.bleed === 0 || r.bleed ? '' : ' · без вылета'}${remarks(o)}`, 6000);
  } catch (e) { toast('Не удалось собрать PDF: ' + (e?.message || e), 6000); } finally { busy = false; }
}
/* the net of the picked object with its design, the cut and the bleed */
function exportPDF() {
  const o = activeObj(); if (!o) return toast('Выберите объект');
  const n = netLayout(o); if (!n.panels.length) return toast('У этого объекта нет развёртки');
  return savePDF(o, r => `${slug(o.name)}-pechat-${fmt(n.W)}x${fmt(n.H)}mm${r.bleed ? '-s-vyletom' : ''}.pdf`, { bleed: BLEED_MM });
}
/* the sheet of copies: fit is an imposition of net/impose.js (ui/impose-panel.js hands over the picked one) */
function exportSheetPDF(fit) {
  const o = activeObj(); if (!o || !fit?.count) return toast('Выберите объект');
  return savePDF(o, () => `${slug(o.name)}-list-${fit.sheet.id.replace('+', 'plus')}-${fit.count}sht.pdf`, { bleed: fit.bleed, layout: { sheet: fit.sheet, items: fit.items, rot: fit.rot } });
}
/* the cut as DXF; the page of claude.ai does not save .dxf, there it is in a .zip */
async function exportDXF() {
  const o = activeObj(); if (!o) return toast('Выберите объект');
  const n = netLayout(o); if (!n.panels.length) return toast('У этого объекта нет развёртки');
  const text = dielineDXF(o, { bleed: BLEED_MM }), name = `${slug(o.name)}-kontur-${fmt(n.W)}x${fmt(n.H)}mm.dxf`;
  const ok = window.claude?.use ? await saveFile(name + '.zip', new Blob([zipStore([{ name, data: text }])], { type: 'application/zip' })) : await saveFile(name, new Blob([text], { type: 'application/dxf' }));
  if (ok) toast(`DXF: слои CUT, CREASE, GLUE, BLEED, INFO, мм${remarks(o)}`, 6000);
}

export { exportDXF, exportPDF, exportSheetPDF };
