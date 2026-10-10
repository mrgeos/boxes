// Допы объекта: наклейки, рукав, рукав-переноска, ленты — дочерние объекты внутри объекта
import { uid } from './util.js';
import { activeObj, sel } from './state.js';
import { ensureFaces } from './model.js';
import { markFace, rebuildQueue } from '../scene/renderer.js';
import { invalidate } from '../scene/camera.js';
import { applySleeve, sleeveOn } from '../carriers/sleeve.js';
import { applyCarry, carryOn } from '../carriers/carry.js';
import { applyTissue, fitTissue, tissueOn } from '../carriers/tissue.js';
import { defaultFill, fillFits, fillOn } from '../carriers/fill.js';
import { modelName } from './models3d.js';
import { STICKER_KIND, touchSticker } from '../stickers/placement.js';
import { buildRibbons, newRibbon, ribbonFits, ribbonName, ribbonsOf, showRibbons } from '../carriers/ribbon.js';
import { applyInsert, insertDims, insertOn } from '../carriers/insert.js';

/* A sleeve and a carrier are parts with a face of their own (the key of the part is the key of its face) and
   their own settings (o.sleeve, o.carry); stickers lie in o.stickers, ribbons in o.ribbons (carriers/ribbon.js). Every extra has a name, can be hidden
   (not drawn) and locked (not picked on the model). */
const PART_KEYS = ['sleeve', 'carry', 'tissue', 'insert'];
const isPart = k => PART_KEYS.includes(k);
const EXTRA_LABEL = { sticker: 'Наклейка', sleeve: 'Рукав', carry: 'Рукав-переноска', ribbon: 'Лента', tissue: 'Бумага тишью', insert: 'Ложемент', fill: 'Начинка' };

/* the object's extras, in list order: { kind, id, T: its own data } */
function extrasOf(o) {
  if (!o) return [];
  return [
    ...(sleeveOn(o) ? [{ kind: 'sleeve', id: 'sleeve', T: o.sleeve }] : []),
    ...(carryOn(o) ? [{ kind: 'carry', id: 'carry', T: o.carry }] : []),
    ...(tissueOn(o) ? [{ kind: 'tissue', id: 'tissue', T: o.tissue }] : []),
    ...(insertOn(o) ? [{ kind: 'insert', id: 'insert', T: o.insert }] : []),
    ...ribbonsOf(o).map(r => ({ kind: 'ribbon', id: r.id, T: r })),
    ...(fillOn(o) ? [{ kind: 'fill', id: 'fill', T: o.fill }] : []),
    ...(o.stickers || []).map(st => ({ kind: 'sticker', id: st.id, T: st })),
  ];
}
const extraById = (o, id) => extrasOf(o).find(e => e.id === id) || null;
function extraName(o, e) {
  if (e.T.name) return e.T.name;
  if (e.kind === 'sleeve') return o.sleeve.handle?.on ? 'Рукав с ручкой' : 'Рукав';
  if (e.kind === 'carry') return 'Рукав-переноска';
  if (e.kind === 'tissue') return o.tissue.layout === 'cross' ? 'Тишью, два листа' : 'Бумага тишью';
  if (e.kind === 'insert') return `Ложемент ${o.insert.cols}×${o.insert.rows}${o.insert.mat === 'foam' ? ', пена' : ''}`;
  if (e.kind === 'ribbon') return ribbonName(e.T);
  if (e.kind === 'fill') return `Начинка: ${modelName(o.fill.model).toLowerCase()} ×${o.fill.count}`;
  const st = e.T;
  return st.text?.trim() ? `Наклейка «${st.text.trim().slice(0, 20)}»` : st.bgSrc ? 'Фото-наклейка' : st.kind === 'custom' ? 'Наклейка своей формы' : STICKER_KIND[st.kind].split(' ')[0];
}
const extraHidden = e => e.kind === 'sticker' ? !e.T.visible : !!e.T.hidden;
/* the ribbon picked (shown as an object of its own) */
const activeRibbon = () => ribbonsOf(activeObj()).find(r => r.id === sel.ribbon) || null;
/* the filling picked (sel.ribbon holds the extra without a face that is picked: a ribbon or 'fill') */
const activeFill = () => sel.ribbon === 'fill' && fillOn(activeObj()) ? activeObj().fill : null;

/* ---------- actions ---------- */
/* a part shown or hidden on the model (a sticker keeps its own `visible`) */
function setExtraHidden(o, id, on) {
  const e = extraById(o, id); if (!e) return;
  if (e.kind === 'sticker') { e.T.visible = !on; touchSticker(o, e.T); return; }
  if (on) e.T.hidden = true; else delete e.T.hidden;
  if (e.kind === 'ribbon') return showRibbons(o);
  if (e.kind === 'fill') { rebuildQueue.add(o.id); return; }
  e.kind === 'sleeve' ? applySleeve(o) : e.kind === 'tissue' ? applyTissue(o) : e.kind === 'insert' ? applyInsert(o) : applyCarry(o); invalidate();
}
function setExtraLocked(o, id, on) { const e = extraById(o, id); if (!e) return; if (on) e.T.locked = true; else delete e.T.locked; }
function renameExtra(o, id, name) { const e = extraById(o, id); if (e && name.trim()) e.T.name = name.trim().slice(0, 80); }
/* puts a sleeve (on a box) or a carrier (on a cake container) on the object */
function addPart(o, kind) {
  const T = o[kind]; if (!T) return false;
  T.on = true; delete T.hidden;
  // tissue: a sheet sized to the box, and the lid opened to show it
  if (kind === 'tissue') fitTissue(o);
  // an insert: its height and pockets as they come out for this box, to be changed from there
  if (kind === 'insert') { const D = insertDims(o); o.insert.h ||= D.h; o.insert.depth ||= Math.round(D.h * .7); }
  if ((kind === 'tissue' || kind === 'insert') && o.lidType !== 'none' && !(o.lid > 2)) o.lid = o.lidType === 'telescope' || o.lidType === 'f0201' ? 125 : 100;
  ensureFaces(o); rebuildQueue.add(o.id); markFace(o, kind);
  return true;
}
/* ties a ribbon round the object (crosswise, with a bow on top); `over`: its settings, else the usual ones */
function addRibbon(o, over = {}) {
  if (!ribbonFits(o)) return null;
  const r = newRibbon(o, over);
  (o.ribbons ??= []).push(r); buildRibbons(o);
  return r;
}
/* lays a 3D model in the packaging (several of it, over its floor) */
function addFill(o, ref = null) {
  if (!fillFits(o)) return null;
  o.fill = { ...defaultFill(), ...(o.fill || {}), on: true, ...(ref ? { model: ref } : {}) }; delete o.fill.hidden;
  rebuildQueue.add(o.id);
  return o.fill;
}
function deleteExtra(o, id) {
  const e = extraById(o, id); if (!e) return;
  if (e.kind === 'fill') { o.fill.on = false; rebuildQueue.add(o.id); return; }
  if (e.kind === 'ribbon') { o.ribbons = o.ribbons.filter(r => r !== e.T); if (!o.ribbons.length) delete o.ribbons; buildRibbons(o); return; }
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

export { EXTRA_LABEL, PART_KEYS, activeFill, activeRibbon, addFill, addPart, addRibbon, deleteExtra, duplicateExtra, extraById, extraHidden, extraName, extrasOf, isPart, renameExtra, setExtraHidden, setExtraLocked };
