// Сборка: порядок и углы сгибов (o.foldPlan) поверх того, что даёт семейство заготовки
/* What the project keeps of the assembly: o.foldPlan = { v: 1, steps?: [{ id, ms, pause, ids: [crease ids] }], creases?:
   { [id]: { ang?, valley? } } }. Only what was changed is kept: a crease without an entry turns as its family says; with
   no `steps` the steps are the family's own order (the creases that close together), timed as before. The first change
   of the order, the grouping or the time makes the steps explicit: from then on each step takes its own time, one after
   another (a negative pause overlaps the next one). A crease is told by its panels and its place among those with
   the same two: `parent>child#n`, so it stays the same when the sizes change. This file holds data only (no three.js). */
const FLIP_MS = 500, DEFAULT_FOLD_MS = 1350, STEP_MS = 700, MIN_MS = 100, MAX_MS = 20000;
const LABEL = { front: 'Перед', back: 'Зад', left: 'Левый бок', right: 'Правый бок', bottom: 'Дно', top: 'Крышка', flap: 'Язычок', tab: 'Клапан', fold: 'Загиб', lock: 'Замок',
  ear: 'Ушко', dust: 'Пылевой клапан', iflap: 'Боковой клапан', lidFront: 'Крышка: перед', lidBack: 'Крышка: зад', lidLeft: 'Крышка: левый бок', lidRight: 'Крышка: правый бок', earLeft: 'Левое ушко', earRight: 'Правое ушко', gtri: 'Склейка', wrap: 'Стенка', lidWrap: 'Крышка: стенка' };
const STEP = { front: 'стенки', back: 'стенки', left: 'стенки', right: 'стенки', bottom: 'дно', top: 'крышка', flap: 'язычок', tab: 'клапаны', fold: 'загибы', lock: 'замки', ear: 'ушки',
  dust: 'пылевые клапаны', iflap: 'боковые клапаны', lidFront: 'стенки крышки', lidBack: 'стенки крышки', lidLeft: 'стенки крышки', lidRight: 'стенки крышки', earLeft: 'ушки', earRight: 'ушки', gtri: 'склеено заранее', wrap: 'стенки', lidWrap: 'стенки крышки' };
const label = k => LABEL[k] || (/^side\d+$/.test(k) ? `Грань ${k.slice(4)}` : k);
const creaseLabel = c => `${label(c.key)} ↔ ${label(c.parentKey)}`;
/* the names of the creases, those that read alike told apart: by the side of the parent panel they lie on, as the net shows it
   («Ушко ↔ Перед (слева)»), else by number («Загиб ↔ Левый бок 1») in the order top to bottom, left to right.
   creases: [{ key, parentKey, mx, my (the crease's middle), px (the parent panel's middle across) }]; sets .label */
function nameCreases(creases) {
  const groups = new Map();
  for (const c of creases) { const k = creaseLabel(c); (groups.get(k) || groups.set(k, []).get(k)).push(c); }
  for (const [name, g] of groups) {
    if (g.length === 1) { g[0].label = name; continue; }
    const left = g.filter(c => c.mx - c.px < -.5), right = g.filter(c => c.mx - c.px > .5);
    if (left.length === 1 && right.length === 1 && g.length === 2) { left[0].label = name + ' (слева)'; right[0].label = name + ' (справа)'; continue; }
    g.sort((a, b) => a.my - b.my || a.mx - b.mx).forEach((c, i) => { c.label = `${name} ${i + 1}`; });
  }
}
/* a step's name by what closes in it: «Стенки», «Пылевые клапаны, крышка» */
function stepName(creases) {
  const names = [...new Set(creases.map(c => /^side\d+$/.test(c.key) ? 'грани' : STEP[c.key] || label(c.key).toLowerCase()))];
  const s = names.slice(0, 2).join(', ') + (names.length > 2 ? '…' : '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/* the steps of the project: the stored ones with the creases that exist (a crease of a new size goes to the last step),
   or the family's own, a step for each rank. creases: [{ id, key, parentKey, ang0, rank }] */
function resolvePlan(o, creases) {
  const ids = new Set(creases.map(c => c.id)), by = new Map(creases.map(c => [c.id, c]));
  const P = o.foldPlan, stored = P?.steps?.length ? P.steps : null;
  let steps;
  if (stored) {
    const used = new Set();
    steps = stored.map(s => ({ id: s.id, ms: s.ms, pause: s.pause, ids: s.ids.filter(i => ids.has(i) && !used.has(i) && used.add(i)) })).filter(s => s.ids.length);
    const rest = creases.filter(c => !used.has(c.id));
    if (rest.length) { if (!steps.length) steps.push({ id: 's1', ms: STEP_MS, pause: 0, ids: [] }); steps.at(-1).ids.push(...rest.map(c => c.id)); }
  } else {
    const ranks = [...new Set(creases.map(c => +c.rank.toFixed(3)))].sort((a, b) => a - b);
    steps = ranks.map((r, i) => ({ id: 's' + (i + 1), ms: STEP_MS, pause: 0, ids: creases.filter(c => +c.rank.toFixed(3) === r).map(c => c.id) }));
  }
  steps.forEach((s, i) => { s.i = i; s.name = stepName(s.ids.map(k => by.get(k))); });
  const stepOf = {}; steps.forEach(s => s.ids.forEach(k => { stepOf[k] = s.i; }));
  const ang = {}, valley = {}, mag = {};
  for (const c of creases) {
    const e = P?.creases?.[c.id] || {};
    mag[c.id] = e.ang ?? Math.abs(c.ang0); valley[c.id] = e.valley ?? c.ang0 < 0;
    ang[c.id] = (valley[c.id] ? -1 : 1) * mag[c.id];
  }
  return { steps, custom: !!stored, stepOf, ang, mag, valley };
}
/* where each step lies in the fold's time (0…1, the part of the way after the turn-over): [{ s, len }] */
function slices(steps) {
  const total = steps.reduce((a, s, i) => a + s.ms + (i < steps.length - 1 ? s.pause : 0), 0) || 1;
  let at = 0;
  return steps.map(s => { const r = { s: Math.max(0, at / total), len: Math.max(.001, s.ms / total) }; at += s.ms + s.pause; return r; });
}
/* how long the fold takes after the turn-over, ms */
const foldMs = plan => plan.custom ? Math.max(200, plan.steps.reduce((a, s, i) => a + s.ms + (i < plan.steps.length - 1 ? s.pause : 0), 0)) : DEFAULT_FOLD_MS;

/* ----- changes of the project's plan: each takes the object, its resolved plan and the creases; the steps are made explicit first ----- */
function explicit(o, plan) {
  const P = o.foldPlan ??= { v: 1 };
  if (!P.steps?.length) P.steps = plan.steps.map(s => ({ id: s.id, ms: s.ms, pause: s.pause, ids: [...s.ids] }));
  return P;
}
const tidy = P => { P.steps = P.steps.filter(s => s.ids.length); P.steps.forEach(s => { s.ms = Math.round(Math.min(MAX_MS, Math.max(MIN_MS, +s.ms || STEP_MS))); s.pause = Math.round(Math.min(5000, Math.max(-5000, +s.pause || 0))); }); };
const newId = P => { let n = P.steps.length + 1; while (P.steps.some(s => s.id === 's' + n)) n++; return 's' + n; };
function moveStep(o, plan, from, to) {
  if (from === to || !plan.steps[from] || to < 0 || to >= plan.steps.length) return false;
  const P = explicit(o, plan); const [s] = P.steps.splice(from, 1); P.steps.splice(to, 0, s); return true;
}
function mergeSteps(o, plan, i) {
  if (!plan.steps[i] || !plan.steps[i + 1]) return false;
  const P = explicit(o, plan); P.steps[i].ids.push(...P.steps[i + 1].ids); P.steps.splice(i + 1, 1); return true;
}
/* a crease into step `to` (a number past the last: a new step of its own) */
function setCreaseStep(o, plan, id, to) {
  if (!(id in plan.stepOf)) return false;
  const P = explicit(o, plan), from = P.steps.findIndex(s => s.ids.includes(id));
  if (from === to && P.steps[from].ids.length === 1) return true;
  P.steps[from].ids = P.steps[from].ids.filter(k => k !== id);
  if (to >= P.steps.length || to < 0) P.steps.push({ id: newId(P), ms: STEP_MS, pause: 0, ids: [id] }); else P.steps[to].ids.push(id);
  tidy(P); return true;
}
function setTime(o, plan, i, t) {
  if (!plan.steps[i]) return false;
  const P = explicit(o, plan), s = P.steps[i]; if (t.ms != null) s.ms = t.ms; if (t.pause != null) s.pause = t.pause;
  tidy(P); return true;
}
function setCrease(o, id, c) {
  const P = o.foldPlan ??= { v: 1 }; P.creases ??= {};
  const e = P.creases[id] ??= {};
  if (c.ang != null) e.ang = Math.round(Math.min(180, Math.max(0, +c.ang || 0)) * 10) / 10;
  if (c.valley != null) e.valley = !!c.valley;
  return true;
}
function resetCrease(o, id) { if (o.foldPlan?.creases) delete o.foldPlan.creases[id]; }
function pruneEmpty(o) { const P = o.foldPlan; if (P && !P.steps?.length && !Object.keys(P.creases || {}).length) delete o.foldPlan; }

export { FLIP_MS, MIN_MS, MAX_MS, creaseLabel, foldMs, label, mergeSteps, nameCreases, moveStep, pruneEmpty, resetCrease, resolvePlan, setCrease, setCreaseStep, setTime, slices, tidy };
