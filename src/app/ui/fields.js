// Поля настроек: ползунки, привязка к данным
import { $$, esc, getPath, setPath } from '../core/util.js';
import { commit } from '../core/project.js';
import { brandColor, checkLink, linkOf, setLink } from '../core/brand.js';

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
    // a colour can be linked to the brand kit: the picker needs to know what it sets, and the link shows by it
    if (el.type === 'color') { el.__target = getT; el.__commit = () => onCommit(k); linkChip(el, t, k); }
    el.addEventListener('input', () => {
      const t = getT(); if (!t) return;
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'range' || el.type === 'number') { v = parseFloat(el.value); if (Number.isNaN(v)) return; v /= +(el.dataset.mul || 1); }
      else v = el.value;
      setPath(t, k, v);
      // a colour set by hand to anything but its kit colour leaves the kit
      if (el.type === 'color') { checkLink(t, k); linkChip(el, t, k); }
      $$(`[data-k="${k}"]`, root).forEach(o => { if (o !== el) showVal(o, v); });
      onInput(k, v);
    });
    el.addEventListener('change', () => onCommit(k));
  });
}
/* the name of the kit colour a colour field is linked to, beside it; its ✕ drops the link */
function linkChip(el, t, k) {
  let chip = el.nextElementSibling?.classList.contains('blink') ? el.nextElementSibling : null;
  const id = linkOf(t, k), c = id && brandColor(id);
  if (!c) { chip?.remove(); return; }
  if (!chip) { chip = document.createElement('span'); chip.className = 'blink'; el.after(chip); }
  chip.innerHTML = `<span class="bdot" style="background:${c.hex}"></span>${esc(c.name)}<button type="button" title="Отвязать от бренд-кита" aria-label="Отвязать">✕</button>`;
  chip.title = `Связан с цветом бренд-кита «${c.name}»: меняется вместе с ним`;
  chip.querySelector('button').onclick = e => { e.stopPropagation(); setLink(t, k, null); chip.remove(); el.__commit?.(); };
}
function refreshFields(root, t) { $$('[data-k]', root).forEach(el => { if (el !== document.activeElement) showVal(el, getPath(t, el.dataset.k)); }); }

export { bindFields, linkChip, rangeField, refreshFields };
