// Порядок сборки: шаги и сгибы выбранного объекта (блок во вкладке «Развёртка», сгибы на развёртке, окно сгиба)
import { $, $$, esc } from '../core/util.js';
import { activeObj, sel } from '../core/state.js';
import { commit } from '../core/project.js';
import { canFold, focusFoldStep, foldInfo, foldOf, markFold, mergeFoldSteps, moveFoldStep, onFoldPlan, resetFoldCrease, resetFoldPlan, setFold, setFoldAngle, setFoldStep, setStepTime } from '../scene/fold.js';
import { netOverlay } from '../net/net-overlays.js';
import { drawNetStage, netView, panNetBy } from '../net/net-stage.js';

/* The assembly sequence of the object that can fold. The list of steps (each: its name, how long it takes and the pause
   after it, the creases in it) is the block «Порядок сборки»; a click on a step puts the slider where it begins. A crease
   is picked from a step's list or by a click on its line on the net (the «Сгибы» chip draws them by step); it opens a small
   window — on a phone a sheet over the stage — with its angle, mountain or valley, and its step, and is marked on the
   net and on the model. Everything is done through scene/fold.js (which an agent calls as well); this only commits one
   history step after each change. */
const PALETTE = ['#e0562f', '#2e9c5a', '#2f7fd6', '#c58a00', '#9b4fc7', '#0f9aa6', '#d6457f', '#6b7a2a'];
const colour = i => PALETTE[i % PALETTE.length];
let pick = null, sig = '', openStep = new Set(), pop = null, drag = null;   // pick: { id, cid }
const tOf = () => { const o = activeObj(); return o && canFold(o) ? o : null; };

/* ----- the block ----- */
function stepHTML(info, s, n) {
  const open = openStep.has(s.id);
  const rows = s.ids.map(k => { const c = info.creases.find(q => q.id === k); return `<li><button type="button" class="fs-cr ${pick?.cid === k ? 'on' : ''}" data-cr="${esc(k)}"><span>${esc(c.label)}</span><i>${Math.round(c.mag * 10) / 10}° ${c.valley ? 'долина' : 'гора'}</i></button></li>`; }).join('');
  return `<div class="fs-step" data-i="${s.i}">
    <div class="fs-row"><button type="button" class="fs-grip" aria-label="Перетащить шаг ${s.i + 1}" title="Перетащите, чтобы поменять порядок"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="7" r="1.6"/><circle cx="15" cy="7" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="17" r="1.6"/><circle cx="15" cy="17" r="1.6"/></svg></button>
      <button type="button" class="fs-name" data-act="go" title="Показать шаг на модели"><b style="--c:${colour(s.i)}">${s.i + 1}</b><span>${esc(s.name)}</span></button>
      <button type="button" class="fs-exp" data-act="exp" aria-expanded="${open}" aria-label="Сгибы шага ${s.i + 1}: ${s.ids.length}" title="Сгибы шага"><span>${s.ids.length}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button></div>
    <div class="fs-time">
      <label>Время <input class="num" type="number" inputmode="numeric" min="100" max="20000" step="50" data-k="ms" value="${s.ms}" aria-label="Время шага ${s.i + 1}, мс"><i>мс</i></label>
      <label title="Пауза после шага; отрицательная — следующий шаг начинается раньше">Пауза <input class="num" type="number" inputmode="numeric" min="-5000" max="5000" step="50" data-k="pause" value="${s.pause}" aria-label="Пауза после шага ${s.i + 1}, мс"><i>мс</i></label>
      <span class="fs-btns"><button type="button" class="ab" data-act="up" aria-label="Шаг выше" title="Выше" ${n.first ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg></button>
      <button type="button" class="ab" data-act="down" aria-label="Шаг ниже" title="Ниже" ${n.last ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
      <button type="button" class="btn sm" data-act="merge" title="Этот шаг и следующий сгибаются вместе" ${n.last ? 'disabled' : ''}>Со следующим</button></span>
    </div>
    <ul class="fs-crs" ${open ? '' : 'hidden'}>${rows}</ul></div>`;
}
function renderSteps() {
  const sec = $('#foldSec'), o = tOf(); if (!sec) return;
  sec.classList.toggle('nofold', !o);
  if (!o) { sig = ''; return; }
  const info = foldInfo(o.id); if (!info) { sec.classList.add('nofold'); return; }
  $('#fsList').innerHTML = info.steps.map((s, i) => stepHTML(info, s, { first: i === 0, last: i === info.steps.length - 1 })).join('');
  $('#fsReset').disabled = !o.foldPlan;
}
/* redraws the block when the object, its plan or its sizes changed; marks the step the slider is in */
function syncFoldSteps() {
  const sec = $('#foldSec'); if (!sec || sec.hidden) return;
  const o = tOf(), k = o ? [o.id, JSON.stringify(o.foldPlan), JSON.stringify(o.dims), o.thickness, o.lidType, o.style, o.flapH, o.earsOn, o.earLen, pick?.cid, [...openStep].join()].join('|') : '';
  if (k !== sig && !(drag || $('#fsList input:focus'))) { sig = k; renderSteps(); }
  if (!o) return;
  const info = foldInfo(o.id), t = foldOf(o.id);
  // the step the slider is in (of those that overlap, the latest begun)
  const now = t < 1 ? info?.steps.filter(s => t >= s.start - 1e-6 && t <= s.end + 1e-6).at(-1)?.i : -1;
  $$('#fsList .fs-step').forEach((el, i) => el.classList.toggle('now', i === now));
}

/* ----- changes: each is one history step ----- */
const done = () => { commit(); sig = ''; };
function goStep(i) { const o = tOf(); if (o) { const t = focusFoldStep(o.id, i); if (t != null) { pick = null; markFold(o.id, null); drawNetStage(); } } }
function initFoldSteps() {
  const list = $('#fsList');
  onFoldPlan(() => { sig = ''; drawNetStage(); if (pop && !pop.hidden) fillPop(); });
  list.addEventListener('click', e => {
    const o = tOf(), st = e.target.closest('.fs-step'); if (!o || !st) return;
    const i = +st.dataset.i, b = e.target.closest('button[data-act],button[data-cr]');
    if (!b) return;
    if (b.dataset.cr) { openCrease(b.dataset.cr, { anchor: b }); return; }
    const act = b.dataset.act, id = st && foldInfo(o.id).steps[i].id;
    if (act === 'go') goStep(i);
    else if (act === 'exp') { if (openStep.has(id)) openStep.delete(id); else openStep.add(id); sig = ''; }
    else if (act === 'up') { if (moveFoldStep(o.id, i, i - 1)) done(); }
    else if (act === 'down') { if (moveFoldStep(o.id, i, i + 1)) done(); }
    else if (act === 'merge') { if (mergeFoldSteps(o.id, i)) done(); }
  });
  list.addEventListener('change', e => {
    const o = tOf(), st = e.target.closest('.fs-step'), k = e.target.dataset?.k; if (!o || !st || !k) return;
    if (setStepTime(o.id, +st.dataset.i, { [k]: +e.target.value })) done();
  });
  // reordering by the handle: the row follows the pointer; where it is let go is where the step goes (a finger as well)
  list.addEventListener('pointerdown', e => {
    const g = e.target.closest('.fs-grip'), st = g?.closest('.fs-step'); if (!g) return;
    e.preventDefault(); g.setPointerCapture(e.pointerId);
    drag = { st, from: +st.dataset.i, to: +st.dataset.i, y0: e.clientY, rows: $$('#fsList .fs-step').map(r => { const q = r.getBoundingClientRect(); return (q.top + q.bottom) / 2; }) };
    st.classList.add('dragging');
  });
  list.addEventListener('pointermove', e => {
    if (!drag) return;
    drag.st.style.transform = `translateY(${e.clientY - drag.y0}px)`;
    const y = e.clientY - drag.y0 + drag.rows[drag.from];
    drag.to = drag.rows.reduce((b, r, i) => Math.abs(r - y) < Math.abs(drag.rows[b] - y) ? i : b, 0);
    $$('#fsList .fs-step').forEach((r, i) => r.classList.toggle('drop', i === drag.to && i !== drag.from));
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null; d.st.classList.remove('dragging'); d.st.style.transform = '';
    const o = tOf(); if (o && d.to !== d.from && moveFoldStep(o.id, d.from, d.to)) done(); else sig = '';
  };
  list.addEventListener('pointerup', end); list.addEventListener('pointercancel', end);
  $('#fsReset').addEventListener('click', () => { const o = tOf(); if (o && resetFoldPlan(o.id)) { pick = null; markFold(o.id, null); done(); } });
  // the window of a crease
  pop = document.createElement('div');
  pop.className = 'cpop'; pop.id = 'creasePop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Сгиб');
  pop.innerHTML = `<div class="cp-h"><b id="cpTitle"></b><button type="button" class="ab" id="cpClose" aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <label class="cp-r"><span>Угол</span><input type="range" id="cpAngR" min="0" max="180" step="1" aria-label="Угол сгиба"><span class="cp-n"><input class="num" type="number" id="cpAng" min="0" max="180" step="1" inputmode="decimal" aria-label="Угол сгиба, градусов"><i>°</i></span></label>
    <div class="cp-r"><span>Сгиб</span><div class="seg" id="cpDir"><button type="button" data-v="mountain" title="От печати: печать остаётся снаружи">Гора</button><button type="button" data-v="valley" title="К печати: печать внутри сгиба">Долина</button></div></div>
    <label class="cp-r"><span>Шаг</span><select id="cpStep" aria-label="Шаг сгиба"></select></label>
    <div class="cp-f"><button type="button" class="btn sm" id="cpReset">Как у заготовки</button></div>`;
  document.body.appendChild(pop);
  const apply = (deg, valley, commitNow) => { const o = tOf(); if (!o || !pick) return; setFoldAngle(o.id, pick.cid, deg, valley); if (commitNow) done(); };
  const cur = () => foldInfo(pick.id)?.creases.find(c => c.id === pick.cid);
  $('#cpAngR').addEventListener('input', e => { $('#cpAng').value = e.target.value; apply(+e.target.value); });
  $('#cpAngR').addEventListener('change', () => done());
  $('#cpAng').addEventListener('input', e => { if (e.target.value !== '') { $('#cpAngR').value = e.target.value; apply(+e.target.value); } });
  $('#cpAng').addEventListener('change', () => done());
  $('#cpDir').addEventListener('click', e => { const b = e.target.closest('button'); if (b && pick) { apply(cur().mag, b.dataset.v === 'valley', true); } });
  $('#cpStep').addEventListener('change', e => { const o = tOf(); if (o && pick && setFoldStep(o.id, pick.cid, +e.target.value)) { done(); } });
  $('#cpReset').addEventListener('click', () => { const o = tOf(); if (o && pick && resetFoldCrease(o.id, pick.cid)) done(); });
  $('#cpClose').addEventListener('click', closeCrease);
  pop.addEventListener('pointerdown', e => e.stopPropagation());
  addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { e.stopPropagation(); closeCrease(); } }, true);
  addEventListener('pointerdown', e => { if (!pop.hidden && !e.target.closest('#creasePop,.fs-cr,#netPane')) closeCrease(); }, true);
}

/* ----- the window of a crease ----- */
function fillPop() {
  const info = pick && foldInfo(pick.id), c = info?.creases.find(q => q.id === pick.cid);
  if (!c) { closeCrease(); return; }
  $('#cpTitle').textContent = c.label;
  if (document.activeElement !== $('#cpAng')) $('#cpAng').value = Math.round(c.mag * 10) / 10;
  $('#cpAngR').value = c.mag;
  $$('#cpDir button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'valley') === c.valley));
  $('#cpStep').innerHTML = info.steps.map(s => `<option value="${s.i}" ${s.i === c.step ? 'selected' : ''}>${s.i + 1}. ${esc(s.name)}</option>`).join('') + `<option value="${info.steps.length}">Новый шаг</option>`;
  $('#cpReset').disabled = !c.custom;
}
/* opens the crease (cid) of the active object: the slider goes to its step, the crease is marked, the window opens by
   the anchor (a button, or a point of the screen); on a phone the sheet stands at the bottom and the net moves up so that
   the crease is seen over it */
function openCrease(cid, { anchor, x, y } = {}) {
  const o = tOf(); if (!o) return;
  const info = foldInfo(o.id), c = info?.creases.find(q => q.id === cid); if (!c) return;
  pick = { id: o.id, cid }; markFold(o.id, cid);
  if (foldOf(o.id) >= info.steps[c.step].end || foldOf(o.id) < info.steps[c.step].start) setFold(o.id, info.steps[c.step].start, { frame: true });
  fillPop(); pop.hidden = false; sig = '';
  const r = anchor?.getBoundingClientRect(), W = innerWidth, H = innerHeight, phone = matchMedia('(max-width:700px)').matches;
  if (phone) { pop.style.left = pop.style.top = ''; pop.classList.add('sheet'); }
  else {
    pop.classList.remove('sheet');
    const w = pop.offsetWidth, h = pop.offsetHeight, ax = x ?? (r ? r.left : W / 2), ay = y ?? (r ? r.bottom + 6 : H / 2);
    pop.style.left = Math.round(Math.max(8, Math.min(W - w - 8, ax - w / 2))) + 'px'; pop.style.top = Math.round(Math.max(8, Math.min(H - h - 8, ay + 10))) + 'px';
  }
  if (phone) keepSeen(c);
  drawNetStage();
}
/* the net is moved up when the sheet would cover the crease */
function keepSeen(c) {
  const pane = $('#netPane').getBoundingClientRect(); if (!pane.width || $('#netPane').offsetParent === null) return;
  const my = pane.top + netView.oy + (c.seg[1] + c.seg[3]) / 2 * netView.k, top = pop.getBoundingClientRect().top - 24;
  if (my > top) panNetBy(0, top - my);
}
function closeCrease() {
  pop.hidden = true;
  const o = activeObj(); if (o) markFold(o.id, null);
  pick = null; sig = ''; drawNetStage();
}

/* ----- on the net ----- */
const foldLines = () => { const o = tOf(); return o && netOverlay('folds') && !sel.part ? o : null; };
/* the crease nearest to a point of the sheet (mm) within `tol` px, else null */
function creaseAt(X, Y, k, tol = 8) {
  const o = foldLines(); if (!o) return null;
  let best = null, bd = tol / k;
  for (const c of foldInfo(o.id)?.creases || []) {
    const [x1, y1, x2, y2] = c.seg, dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((X - x1) * dx + (Y - y1) * dy) / l2)), d = Math.hypot(X - x1 - t * dx, Y - y1 - t * dy);
    if (d < bd) { bd = d; best = c; }
  }
  return best?.id || null;
}
/* the creases on the sheet, by step: a line and the step's number; the picked one thick */
function drawFolds(c, ox, oy, k) {
  const o = foldLines(); if (!o) return;
  const info = foldInfo(o.id); if (!info) return;
  c.save(); c.lineCap = 'round'; c.setLineDash([]);
  for (const f of info.creases) {
    const [x1, y1, x2, y2] = f.seg, on = pick?.cid === f.id, col = colour(f.step);
    c.beginPath(); c.moveTo(ox + x1 * k, oy + y1 * k); c.lineTo(ox + x2 * k, oy + y2 * k);
    if (on) { c.lineWidth = 8; c.strokeStyle = 'rgba(255,255,255,.9)'; c.stroke(); }
    c.lineWidth = on ? 4.5 : 3; c.strokeStyle = col; c.stroke();
  }
  c.font = '700 10.5px Onest, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const f of info.creases) {
    const [x1, y1, x2, y2] = f.seg; if (Math.hypot(x2 - x1, y2 - y1) * k < 26) continue;
    const mx = ox + (x1 + x2) / 2 * k, my = oy + (y1 + y2) / 2 * k;
    c.beginPath(); c.arc(mx, my, 8.5, 0, Math.PI * 2); c.fillStyle = colour(f.step); c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#fff'; c.stroke();
    c.fillStyle = '#fff'; c.fillText(String(f.step + 1), mx, my + .5);
  }
  c.restore();
}
/* a click on a crease line of the net: its window opens at the pointer */
function clickCrease(cid, x, y) { openCrease(cid, { x, y }); }

export { clickCrease, creaseAt, drawFolds, foldLines, initFoldSteps, syncFoldSteps };
