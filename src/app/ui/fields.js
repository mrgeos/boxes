// Поля настроек: ползунки, привязка к данным
import { $$, esc, getPath, setPath } from '../core/util.js';
import { commit } from '../core/project.js';

function rangeField(label, k, min, max, step, mul = 1) {
  return `<div class="field"><span class="fl" title="${esc(label)}">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" data-k="${k}" data-mul="${mul}" aria-label="${esc(label)}"><input class="num" type="number" min="${min}" max="${max}" step="${step}" data-k="${k}" data-mul="${mul}" aria-label="${esc(label)}"></div>`;
}
function showVal(el, v) {
  const mul = +(el.dataset.mul || 1);
  if (el.type === 'checkbox') el.checked = !!v;
  else if (el.type === 'range' || el.type === 'number') el.value = +((+v || 0) * mul).toFixed(2);
  else el.value = v ?? '';
}
function bindFields(root, getT, onInput, onCommit = commit) {
  $$('[data-k]', root).forEach(el => {
    const k = el.dataset.k, t = getT(); if (!t) return;
    showVal(el, getPath(t, k));
    el.addEventListener('input', () => {
      const t = getT(); if (!t) return;
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'range' || el.type === 'number') { v = parseFloat(el.value); if (Number.isNaN(v)) return; v /= +(el.dataset.mul || 1); }
      else v = el.value;
      setPath(t, k, v);
      $$(`[data-k="${k}"]`, root).forEach(o => { if (o !== el) showVal(o, v); });
      onInput(k, v);
    });
    el.addEventListener('change', () => onCommit(k));
  });
}
function refreshFields(root, t) { $$('[data-k]', root).forEach(el => { if (el !== document.activeElement) showVal(el, getPath(t, el.dataset.k)); }); }

export { bindFields, rangeField, refreshFields };
