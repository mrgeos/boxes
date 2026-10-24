// Блок «Для типографии» в меню «Экспорт»: статус макета, PDF, DXF, раскладка на лист
import { $ } from '../core/util.js';
import { activeObj } from '../core/state.js';
import { printIssues } from '../net/net-check.js';
import { showIssues } from '../net/net-stage.js';
import { exportDXF, exportPDF } from '../export/print-files.js';
import { setTab } from './tabs.js';

/* The status line is the net's «Готово к печати» chip (net/net-stage.js) for the picked object, asked when the menu
   opens: green, or «Проверьте: N» and a click lists the remarks. The files are never held back by it. */
function syncPrintStatus() {
  const o = activeObj(), n = o ? printIssues(o).length : 0, b = $('#prepReady');
  b.classList.toggle('ok', !n); b.classList.toggle('warn', !!n); b.lastChild.textContent = n ? `Проверьте: ${n}` : 'Готово к печати';
}
function initPrintMenu(closeMenu) {
  $('#exportBtn').addEventListener('click', syncPrintStatus);
  $('#pdfBtn').onclick = () => { closeMenu(); exportPDF(); };
  $('#dxfBtn').onclick = () => { closeMenu(); exportDXF(); };
  // the table of sheets: the «Развёртка» tab, scrolled to it
  $('#impBtn').onclick = () => { closeMenu(); setTab('net'); requestAnimationFrame(() => $('#impSec').scrollIntoView({ block: 'start', behavior: 'smooth' })); };
  $('#prepReady').onclick = e => {
    const o = activeObj(); if (!o) return;
    const r = e.currentTarget.getBoundingClientRect(), list = printIssues(o);
    closeMenu(); showIssues(o, list, Math.max(8, r.left), r.bottom + 4);
  };
}

export { initPrintMenu, syncPrintStatus };
