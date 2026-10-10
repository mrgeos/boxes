// Поля настроек: числовые поля (тянуть вбок, касание — ввод), место X/Y, привязка к данным
import { $$, esc, getPath, setPath } from '../core/util.js';
import { commit } from '../core/project.js';
import { brandColor, checkLink, linkOf, setLink } from '../core/brand.js';

/* a label like "Окно: ширина, мм (0 — нет)" falls into its group ("Окно"), its name ("Ширина"), its unit and a note */
function parseLabel(label) {
  const m = /^(?:([^:]+): )?(.+?)(?:, (мм|°|%))?(?: (\(.+\)))?$/.exec(label) || [];
  const name = m[2] || label;
  return { grp: m[1] || '', name: m[1] ? name[0].toUpperCase() + name.slice(1) : name, unit: m[3] || '', note: m[4] ? m[4].slice(1, -1) : '' };
}
/* A numeric setting is one field, as in Figma and Blender: drag it (or its label) sideways to change the value,
   a tap without moving types a number, arrows step it, Shift steps ×10. Sizes in mm are a plain number with
   the unit; a value with clear bounds (%, a strength) is filled to its share of the range; a turn of −180…180°
   gets quarter-turn buttons. The real <input type=number> inside keeps data-k, so bindFields works as before.
   A label's group prefix ("Окно: …") becomes a subheading over the run of fields that share it (see groupFields) */
const isTurn = (k, min, max) => /(^|\.)(rot|envRot)$/.test(k) && min === -180 && max === 180;
function numBox(k, min, max, step, mul, unit, aria, { fill = false, pre = '' } = {}) {
  return `<span class="nf${fill ? ' fill' : ''}">${fill ? '<span class="nf-bar"></span>' : ''}${pre ? `<b class="nf-pre">${pre}</b>` : ''}<input class="num" type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" data-k="${k}" data-mul="${mul}" aria-label="${esc(aria)}">${unit ? `<i>${unit}</i>` : ''}</span>`;
}
function rangeField(label, k, min, max, step, mul = 1) {
  const { grp, name, unit, note } = parseLabel(label), g = grp ? ` data-grp="${esc(grp)}"` : '', turn = isTurn(k, min, max);
  const fl = `<span class="fl scrub" title="${esc(label)}">${esc(name)}${note ? `<small>${esc(note)}</small>` : ''}</span>`;
  const box = numBox(k, min, max, step, mul, unit, label, { fill: unit !== 'мм' && !turn });
  const q = turn ? '<span class="nf-q"><button type="button" class="btn sm" data-turn="-90" title="Повернуть на −90°">−90°</button><button type="button" class="btn sm" data-turn="90" title="Повернуть на +90°">+90°</button></span>' : '';
  return `<div class="field nfrow${turn ? ' turn' : ''}"${g}>${fl}${box}${q}</div>`;
}
/* the place of a thing on a face: X and Y in one row, and a 3 × 3 grid that puts it in the middle, by an edge or in a corner */
function placeField(label, kx, ky, min, max, step, mul = 1, at = [.15, .5, .85]) {
  const cells = at.flatMap(y => at.map(x => `<button type="button" data-ax="${x}" data-ay="${y}" aria-label="X ${Math.round(x * 100)} %, Y ${Math.round(y * 100)} %"></button>`)).join('');
  return `<div class="field place"><span class="fl">${esc(label)}<span class="anchor" role="group" aria-label="Быстрое положение">${cells}</span></span>
    <span class="pair">${numBox(kx, min, max, step, mul, '%', label + ' X', { pre: 'X' })}${numBox(ky, min, max, step, mul, '%', label + ' Y', { pre: 'Y' })}</span></div>`;
}
/* a value with a few usual settings: buttons for them, and the exact number under them */
function presetField(label, k, presets, min, max, step, mul = 1) {
  return `<div class="field wide"><span class="fl">${esc(label)}</span><span class="seg nf-seg" data-for="${k}">${presets.map(([v, t, tip]) => `<button type="button" data-v="${v}" title="${esc(tip || '')}">${esc(t)}</button>`).join('')}</span></div>
    <div class="field nfrow"><span class="fl scrub">Точно</span>${numBox(k, min, max, step, mul, '%', label, { fill: true })}</div>`;
}
/* sets a field's input as if typed: the data follows, and with done the change is kept (undo step) */
function putNum(inp, v, done) {
  const lo = +inp.min, hi = +inp.max, st = +inp.step || 1;
  v = Math.min(hi, Math.max(lo, Math.round(v / st) * st));
  inp.value = +v.toFixed(4); inp.dispatchEvent(new Event('input'));
  if (done) inp.dispatchEvent(new Event('change'));
}
/* the look that follows a value: the fill, the picked preset, the picked grid cell */
function paintNum(inp) {
  const nf = inp.closest('.nf'), v = parseFloat(inp.value);
  const bar = nf?.querySelector('.nf-bar');
  if (bar) bar.style.width = (Number.isNaN(v) ? 0 : Math.min(1, Math.max(0, (v - inp.min) / (inp.max - inp.min))) * 100) + '%';
  const row = inp.closest('.field')?.previousElementSibling;
  row?.querySelectorAll(`.nf-seg[data-for="${inp.dataset.k}"] button`).forEach(b => { const on = Math.abs(b.dataset.v * (+inp.dataset.mul || 1) - v) < 1e-6; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  const pl = inp.closest('.place');
  if (pl) {
    const [ix, iy] = pl.querySelectorAll('input.num'), m = +ix.dataset.mul || 1;
    pl.querySelectorAll('.anchor button').forEach(b => b.classList.toggle('on', Math.abs(b.dataset.ax * m - ix.value) < .01 && Math.abs(b.dataset.ay * m - iy.value) < .01));
  }
}
/* drag on `el` sideways changes `inp`: a fill field spans its range over its width, a plain one moves a step per 2 px.
   A press that does not move types into the field */
function dragNum(el, inp, fill) {
  let x0 = null, v0 = 0, moved = false, pid = null;
  el.addEventListener('pointerdown', e => {
    if (e.button > 0 || el.closest('.nf')?.classList.contains('typing') && el.classList.contains('nf')) return;
    x0 = e.clientX; v0 = parseFloat(inp.value) || 0; moved = false; pid = e.pointerId;
  });
  el.addEventListener('pointermove', e => {
    if (x0 == null || e.pointerId !== pid) return;
    const dx = e.clientX - x0;
    if (!moved) { if (Math.abs(dx) < 4) return; moved = true; el.setPointerCapture(pid); el.classList.add('drag'); }
    const box = inp.closest('.nf'), per = fill ? (inp.max - inp.min) / box.clientWidth : (+inp.step || 1) / 2;
    putNum(inp, v0 + dx * per * (e.shiftKey ? 10 : 1));
  });
  const end = e => {
    if (x0 == null || e.pointerId !== pid) return;
    x0 = null; el.classList.remove('drag');
    if (moved) inp.dispatchEvent(new Event('change'));
    else if (e.type === 'pointerup') typeNum(inp);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
function typeNum(inp) {
  const nf = inp.closest('.nf'); nf.classList.add('typing'); inp.focus(); inp.select();
}
function bindNum(root) {
  $$('.nf input.num', root).forEach(inp => {
    if (inp.__nf) return; inp.__nf = true;
    const nf = inp.closest('.nf'), fill = nf.classList.contains('fill');
    dragNum(nf, inp, fill);
    const fl = nf.closest('.field')?.querySelector(':scope > .fl.scrub'); if (fl) dragNum(fl, inp, fill);
    inp.addEventListener('input', () => paintNum(inp));
    inp.addEventListener('focus', () => nf.classList.add('typing'));
    inp.addEventListener('blur', () => nf.classList.remove('typing'));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') inp.blur(); });
    paintNum(inp);
  });
  $$('.nf-q [data-turn]', root).forEach(b => {
    if (b.__nf) return; b.__nf = true;
    b.onclick = () => { const inp = b.closest('.field').querySelector('input.num'); let v = (parseFloat(inp.value) || 0) + +b.dataset.turn; if (v > 180) v -= 360; if (v < -180) v += 360; putNum(inp, v, true); };
  });
  $$('.nf-seg', root).forEach(g => {
    if (g.__nf) return; g.__nf = true;
    const inp = g.closest('.field').nextElementSibling?.querySelector(`input.num[data-k="${g.dataset.for}"]`); if (!inp) return;
    g.onclick = e => { const b = e.target.closest('[data-v]'); if (b) putNum(inp, b.dataset.v * (+inp.dataset.mul || 1), true); };
    paintNum(inp);
  });
  $$('.place .anchor', root).forEach(a => {
    if (a.__nf) return; a.__nf = true;
    const [ix, iy] = a.closest('.place').querySelectorAll('input.num'), m = +ix.dataset.mul || 1;
    a.onclick = e => { const b = e.target.closest('[data-ax]'); if (!b) return; putNum(ix, b.dataset.ax * m); putNum(iy, b.dataset.ay * m, true); ix.dispatchEvent(new Event('change')); };
  });
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
function showVal(el, v) {
  const mul = +(el.dataset.mul || 1);
  if (el.type === 'checkbox') el.checked = !!v;
  else if (el.type === 'range' || el.type === 'number') { el.value = +((+v || 0) * mul).toFixed(2); if (el.__nf) paintNum(el); }
  else el.value = v ?? '';
}
function bindFields(root, getT, onInput, onCommit = commit) {
  groupFields(root);
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
  bindNum(root);
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

export { bindFields, bindNum, foldSections, linkChip, placeField, presetField, rangeField, refreshFields };
