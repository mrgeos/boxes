// Допы объекта: наклейки, рукав, рукав-переноска — дочерние объекты внутри объекта
import { uid } from './util.js';
import { ensureFaces } from './model.js';
import { markFace, rebuildQueue } from '../scene/renderer.js';
import { invalidate } from '../scene/camera.js';
import { applySleeve, sleeveOn } from '../carriers/sleeve.js';
import { applyCarry, carryOn } from '../carriers/carry.js';
import { STICKER_KIND, touchSticker } from '../stickers/placement.js';

/* A sleeve and a carrier are parts with a face of their own (the key of the part is the key of its face) and
   their own settings (o.sleeve, o.carry); stickers lie in o.stickers. Every extra has a name, can be hidden
   (not drawn) and locked (not picked on the model). */
const PART_KEYS = ['sleeve', 'carry'];
const isPart = k => PART_KEYS.includes(k);
const EXTRA_LABEL = { sticker: 'Наклейка', sleeve: 'Рукав', carry: 'Рукав-переноска' };

/* the object's extras, in list order: { kind, id, T: its own data } */
function extrasOf(o) {
  if (!o) return [];
  return [
    ...(sleeveOn(o) ? [{ kind: 'sleeve', id: 'sleeve', T: o.sleeve }] : []),
    ...(carryOn(o) ? [{ kind: 'carry', id: 'carry', T: o.carry }] : []),
    ...(o.stickers || []).map(st => ({ kind: 'sticker', id: st.id, T: st })),
  ];
}
const extraById = (o, id) => extrasOf(o).find(e => e.id === id) || null;
function extraName(o, e) {
  if (e.T.name) return e.T.name;
  if (e.kind === 'sleeve') return o.sleeve.handle?.on ? 'Рукав с ручкой' : 'Рукав';
  if (e.kind === 'carry') return 'Рукав-переноска';
  const st = e.T;
  return st.text?.trim() ? `Наклейка «${st.text.trim().slice(0, 20)}»` : st.bgSrc ? 'Фото-наклейка' : st.kind === 'custom' ? 'Наклейка своей формы' : STICKER_KIND[st.kind].split(' ')[0];
}
const extraHidden = e => e.kind === 'sticker' ? !e.T.visible : !!e.T.hidden;

/* ---------- actions ---------- */
/* a part shown or hidden on the model (a sticker keeps its own `visible`) */
function setExtraHidden(o, id, on) {
  const e = extraById(o, id); if (!e) return;
  if (e.kind === 'sticker') { e.T.visible = !on; touchSticker(o, e.T); return; }
  if (on) e.T.hidden = true; else delete e.T.hidden;
  e.kind === 'sleeve' ? applySleeve(o) : applyCarry(o); invalidate();
}
function setExtraLocked(o, id, on) { const e = extraById(o, id); if (!e) return; if (on) e.T.locked = true; else delete e.T.locked; }
function renameExtra(o, id, name) { const e = extraById(o, id); if (e && name.trim()) e.T.name = name.trim().slice(0, 80); }
/* puts a sleeve (on a box) or a carrier (on a cake container) on the object */
function addPart(o, kind) {
  const T = o[kind]; if (!T) return false;
  T.on = true; delete T.hidden;
  ensureFaces(o); rebuildQueue.add(o.id); markFace(o, kind);
  return true;
}
function deleteExtra(o, id) {
  const e = extraById(o, id); if (!e) return;
  if (e.kind === 'sticker') { o.stickers = o.stickers.filter(t => t !== e.T); touchSticker(o, { ...e.T, visible: false }); return; }
  e.T.on = false; rebuildQueue.add(o.id);
}
/* a copy of a sticker beside it (one sleeve and one carrier per object for now) */
function duplicateExtra(o, id) {
  const e = extraById(o, id); if (e?.kind !== 'sticker') return null;
  const c = { ...structuredClone(e.T), id: uid(), x: e.T.x + .05, y: e.T.y + .05 };
  if (c.name) c.name += ' (копия)';
  o.stickers.push(c); touchSticker(o, c);
  return c;
}

export { EXTRA_LABEL, PART_KEYS, addPart, deleteExtra, duplicateExtra, extraById, extraHidden, extraName, extrasOf, isPart, renameExtra, setExtraHidden, setExtraLocked };
