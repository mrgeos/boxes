// Поля настроек: ползунки, привязка к данным
import { $$, esc, getPath, setPath } from '../core/util.js';
import { commit } from '../core/project.js';
import { brandColor, checkLink, linkOf, setLink } from '../core/brand.js';

/* a label like "Окно: ширина, мм (0 — нет)" falls into its group ("Окно"), its name ("Ширина"), its unit and a note */
function parseLabel(label) {
  const m = /^(?:([^:]+): )?(.+?)(?:, (мм|°|%))?(?: (\(.+\)))?$/.exec(label) || [];
  const name = m[2] || label;
  return { grp: m[1] || '', name: m[1] ? name[0].toUpperCase() + name.slice(1) : name, unit: m[3] || '', note: m[4] ? m[4].slice(1, -1) : '' };
}
/* a numeric setting. Millimetres get a number box with the unit and no slider (a slider is too coarse for sizes;
   dragging the label changes the value, as in Figma); other values keep the slider. A label's group prefix
   ("Окно: …") becomes a subheading over the run of fields that share it (see groupFields) */
function rangeField(label, k, min, max, step, mul = 1) {
  const { grp, name, unit, note } = parseLabel(label), attrs = `min="${min}" max="${max}" step="${step}" data-k="${k}" data-mul="${mul}" aria-label="${esc(label)}"`;
  const text = unit && unit !== 'мм' ? `${name}, ${unit}` : name, g = grp ? ` data-grp="${esc(grp)}"` : '';
  const fl = cls => `<span class="${cls}" title="${esc(label)}">${esc(text)}${note ? `<small>${esc(note)}</small>` : ''}</span>`;
  if (unit === 'мм') return `<div class="field mm"${g}>${fl('fl scrub')}<span class="unit-in"><input class="num" type="number" ${attrs}><i>мм</i></span></div>`;
  return `<div class="field"${g}>${fl('fl')}<input type="range" ${attrs}><input class="num" type="number" ${attrs}></div>`;
}
/* a subheading over each run of fields of one group */
function groupFields(root) {
  $$('.field[data-grp]', root).forEach(el => {
    const g = el.dataset.grp, prev = el.previousElementSibling;
    // a gap after the run, so the next field does not read as part of the group
    el.classList.toggle('grp-end', el.nextElementSibling?.dataset?.grp !== g);
    if (prev?.dataset?.grp === g || (prev?.classList.contains('fgrp') && prev.textContent === g)) return;
    const h = document.createElement('div'); h.className = 'fgrp'; h.textContent = g; el.before(h);
  });
}
/* drag a millimetre field's label sideways to change it: a step per 2 px, ×10 with Shift */
function bindScrub(fl) {
  if (fl.__scrub) return; fl.__scrub = true;
  const num = fl.parentElement.querySelector('input.num'); if (!num) return;
  fl.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); fl.setPointerCapture(e.pointerId);
    const x0 = e.clientX, v0 = parseFloat(num.value) || 0, step = +num.step || 1, lo = +num.min, hi = +num.max;
    let moved = false;
    const move = ev => {
      const n = Math.round((ev.clientX - x0) / 2); if (!n && !moved) return; moved = true;
      const v = Math.min(hi, Math.max(lo, v0 + n * step * (ev.shiftKey ? 10 : 1)));
      if (+num.value !== v) { num.value = +v.toFixed(2); num.dispatchEvent(new Event('input')); }
    };
    const up = () => { fl.removeEventListener('pointermove', move); if (moved) num.dispatchEvent(new Event('change')); else num.focus(); };
    fl.addEventListener('pointermove', move); fl.addEventListener('pointerup', up, { once: true }); fl.addEventListener('pointercancel', up, { once: true });
  });
}
function showVal(el, v) {
  const mul = +(el.dataset.mul || 1);
  if (el.type === 'checkbox') el.checked = !!v;
  else if (el.type === 'range' || el.type === 'number') el.value = +((+v || 0) * mul).toFixed(2);
  else el.value = v ?? '';
}
function bindFields(root, getT, onInput, onCommit = commit) {
  groupFields(root);
  $$('.fl.scrub', root).forEach(bindScrub);
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
/* the headings of a long panel fold their sections: a click on one hides what follows it up to the next one.
   Folded headings are kept for the next visit; "Положение в сцене" starts folded (the move tool does that job) */
const FOLD_KEY = 'bs3d-fold';
let folded = null;
function foldSections(root) {
  if (!folded) { try { folded = new Set(JSON.parse(localStorage.getItem(FOLD_KEY) || 'null') || ['Положение в сцене']); } catch { folded = new Set(['Положение в сцене']); } }
  const heads = $$(':scope > .sec-h', root);
  if (heads.length < 2) return;
  const paint = h => {
    const name = h.textContent.trim(), off = folded.has(name);
    h.classList.add('fold'); h.setAttribute('aria-expanded', String(!off));
    for (let n = h.nextElementSibling; n && !n.matches('.sec-h'); n = n.nextElementSibling) n.classList.toggle('folded', off);
  };
  heads.forEach(h => {
    paint(h); h.tabIndex = 0; h.setAttribute('role', 'button');
    const flip = () => {
      const name = h.textContent.trim(); folded.has(name) ? folded.delete(name) : folded.add(name); paint(h);
      try { localStorage.setItem(FOLD_KEY, JSON.stringify([...folded])); } catch {}
    };
    h.onclick = flip; h.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } };
  });
}
function refreshFields(root, t) { $$('[data-k]', root).forEach(el => { if (el !== document.activeElement) showVal(el, getPath(t, el.dataset.k)); }); }

export { bindFields, foldSections, linkChip, rangeField, refreshFields };
