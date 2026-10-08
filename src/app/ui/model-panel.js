// Левая панель: объекты, форма и размеры, материал, сцена
import { $, $$, esc, toast } from '../core/util.js';
import { BOARD, FINISHES, LID_COLORS, LID_TYPES, LIGHTS, PRESETS, isFoil } from '../core/constants.js';
import { activeObj, assets, sel, state } from '../core/state.js';
import { addAsset } from '../core/assets.js';
import { ENVS, setHdrFile } from '../scene/environments.js';
import { clearLid, ensureFaces, faceKeys, faceMM, setBoard } from '../core/model.js';
import { pickAsset } from './asset-picker.js';
import { applyLid, applyObjMaterials, markFace, markObj, rebuildQueue, ui } from '../scene/renderer.js';
import { BAG_MATS, BAG_TOPS, applyBagPreset, bagFilm } from '../carriers/bag.js';
import { applyDomePreset } from '../carriers/dome.js';
import { TORTE_COLORS, TORTE_FIN, applyTortePreset } from '../carriers/torte.js';
import { BOARD_BOTTOM, BOARD_COVER, BOARD_SHAPE, applyBoardPreset, setBoardCover } from '../carriers/board.js';
import { winMM, windowPlace } from '../carriers/box.js';
import { HANDLE_SHAPES, HB_SIDES, TRAY_FIN, applyHandlePreset, bridgeMM, defaultFrontWin, defaultHandle } from '../carriers/handle-box.js';
import { CARRY_PANEL, CARRY_STYLES, applyCarry, carryDims, carryOn } from '../carriers/carry.js';
import { EXTRA_LABEL, extraById, extraName } from '../core/extras.js';
import { extraAction, renderStickers } from './stickers-panel.js';
import { refreshTabs } from './tabs.js';
import { SLEEVE_AXES, SLEEVE_FIN, SLEEVE_PANEL, applySleeve, defaultSleeve, defaultSleeveHandle, sleeveDims, sleeveOn } from '../carriers/sleeve.js';
import { applyScene, lastView, setView, updateShadowCam } from '../scene/camera.js';
import { select } from '../core/selection.js';
import { groupById, layoutAll, parentOf } from '../core/groups.js';
import { renderObjects } from './object-list.js';
import { syncProps } from './tabs.js';
import { renderActionBar } from './action-bar.js';
import { renderGroupPanel } from './group-panel.js';
import { commit } from '../core/project.js';
import { bindFields, rangeField, refreshFields } from './fields.js';
import { renderFacePanel, renderFaceTabs, updateFaceMeta } from './face-panel.js';

/* the paper sleeve round a box: its own shape panel (an extra, core/extras.js) */
function sleeveFields(o) { const SD = sleeveDims(o); return `<div class="field wide"><span class="fl">Рукав опоясывает</span><select data-k="sleeve.axis">${Object.entries(SLEEVE_AXES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`
      + rangeField('Рукав: ширина ленты, мм', 'sleeve.w', 10, Math.ceil(SD.len + 1), 1) + rangeField('Рукав: смещение от центра, мм', 'sleeve.x', -Math.ceil(SD.len / 2), Math.ceil(SD.len / 2), 1)
      + rangeField('Сдвинуть рукав, мм', 'sleeve.slide', 0, Math.ceil(SD.len + SD.bw), 1)
      + `<label class="check"><input type="checkbox" data-k="sleeve.handle.on"> Ручка из рукава (лента поднимается над крышкой)</label>`
      + (o.sleeve.handle?.on ? rangeField('Ручка: высота, мм', 'sleeve.handle.h', 15, 300, 1) + rangeField('Ручка: скругление верхних углов, мм', 'sleeve.handle.r', 0, 100, .5)
        + rangeField('Ручка: радиус изгиба у основания, мм (0 — острый сгиб)', 'sleeve.handle.rf', 0, 40, .5)
        + rangeField('Пройма: ширина, мм', 'sleeve.handle.hole.w', 0, 400, 1) + rangeField('Пройма: высота, мм', 'sleeve.handle.hole.h', 0, 200, 1)
        + rangeField('Пройма: от крышки, мм', 'sleeve.handle.hole.y', 3, 300, .5) + rangeField('Пройма: скругление, мм', 'sleeve.handle.hole.r', 0, 100, .5) : '')
      + `<div class="field wide"><span class="fl">Бумага рукава</span><select data-k="sleeve.fin">${Object.entries(SLEEVE_FIN).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`
      + `<p class="hint">Дизайн рукава — грань «Рукав»: одна лента, на ней отмечены сгибы (${SD.names.map(k => SLEEVE_PANEL[k]).join(', ')}). Цвет бумаги — фон этой грани. На развёртке рукав — отдельная деталь с биговками и клеевым клапаном.${o.lidType !== 'none' ? ' Перед открытием крышки сдвиньте рукав.' : ' Лоток в рукаве — коробка-пенал: сдвиньте рукав, чтобы выдвинуть лоток.'}</p>`; }
/* the carrier sleeve of a cake container */
function carryFields(o) {
  const D = carryDims(o), tent = D.tent;
  return `<div class="field wide"><span class="fl">Форма</span><select data-k="carry.style">${Object.entries(CARRY_STYLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`
    + rangeField('Ширина ленты, мм', 'carry.w', 20, Math.floor(o.dims.w), 1)
    + (tent ? rangeField('Дно шире тортницы (с каждой стороны), мм', 'carry.spread', 0, 300, 1) : rangeField('Высота прямых стенок, мм', 'carry.wall', Math.ceil(D.G.hb + 3), Math.floor(o.dims.h), 1))
    + rangeField('Ручка: высота, мм', 'carry.h', 20, 300, 1) + rangeField('Ручка: скругление верхних углов, мм', 'carry.r', 0, 100, .5)
    + rangeField('Пройма: ширина, мм', 'carry.hole.w', 0, 400, 1) + rangeField('Пройма: высота, мм', 'carry.hole.h', 0, 200, 1)
    + rangeField('Пройма: от основания ручки, мм', 'carry.hole.y', 3, 300, .5) + rangeField('Пройма: скругление, мм', 'carry.hole.r', 0, 100, .5)
    + `<label class="check"><input type="checkbox" data-k="carry.cut.on"> Окно внизу ${tent ? 'скатов' : 'стенок'} (видно тортницу)</label>`
    + (o.carry.cut?.on ? rangeField('Окно: ширина, мм', 'carry.cut.w', 5, 500, 1) + rangeField('Окно: высота, мм', 'carry.cut.h', 3, 300, 1)
      + rangeField('Окно: от дна, мм', 'carry.cut.y', 3, 300, .5) + rangeField('Окно: скругление, мм', 'carry.cut.r', 0, 100, .5) : '')
    + `<div class="field wide"><span class="fl">Бумага рукава</span><select data-k="carry.fin">${Object.entries(SLEEVE_FIN).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`
    + rangeField('Снять рукав, мм', 'carry.slide', 0, Math.ceil(D.ys + D.hh), 1)
    + `<p class="hint">Дизайн — грань «Рукав-переноска»: одна лента, на ней отмечены сгибы (${D.names.map(k => CARRY_PANEL[k]).join(', ')}). Цвет бумаги — фон этой грани. Лента начинается и кончается на верху ручки: её концы — лепестки с проймами, они склеиваются оборотом. Бока открыты.</p>`;
}
/* a field of the shape panel changed: what it takes to show it (shared by an object and its parts) */
function modelInput(k) {
  const o = activeObj();
  if (k === 'sleeve.name' || k === 'carry.name') { renderObjects(); renderStickers(); refreshTabs(); return; }
  if (k === 'name') { renderObjects(); $('#objBadge').textContent = o.name; return; }
  if (k === 'type') { o.dims = { ...PRESETS.find(p => p.type === o.type).dims }; ensureFaces(o); if (o.type === 'board') setBoardCover(o); rebuildQueue.add(o.id); select(o.id, faceKeys(o)[0]); renderModel(); renderObjects(); return; }
  if (k === 'lidType') { ensureFaces(o); rebuildQueue.add(o.id); select(o.id, sel.face); renderModel(); ui.net = true; updateFaceMeta(); return; }
  if (k === 'wallT' || k === 'lidFit') { rebuildQueue.add(o.id); applyObjMaterials(o); ui.net = true; updateFaceMeta(); return; }
  if (k === 'lidMat') { ensureFaces(o); rebuildQueue.add(o.id); select(o.id, sel.face); renderModel(); ui.net = true; updateFaceMeta(); return; }
  if (k.startsWith('pb.')) { rebuildQueue.add(o.id); ui.net = true; updateFaceMeta(); if (k === 'pb.handles') renderModel(); return; }
  if (k === 'sleeve.slide') { applySleeve(o); return; }
  if (k === 'carry.slide') { applyCarry(o); return; }
  if (k.startsWith('carry.')) {
    ensureFaces(o); rebuildQueue.add(o.id); markFace(o, 'carry'); ui.net = ui.editor = true; updateFaceMeta();
    if (['carry.on', 'carry.style', 'carry.cut.on'].includes(k)) { select(o.id, k === 'carry.on' && o.carry.on ? 'carry' : faceKeys(o).includes(sel.face) ? sel.face : faceKeys(o)[0]); renderModel(); renderFaceTabs(); }
    return;
  }
  if (k.startsWith('sleeve.')) {
    if (k === 'sleeve.axis') { const SD = sleeveDims(o); o.sleeve.x = 0; o.sleeve.w = Math.round(Math.min(o.sleeve.w, SD.len)); o.sleeve.slide = 0; }
    ensureFaces(o); rebuildQueue.add(o.id); markFace(o, 'sleeve'); ui.net = ui.editor = true; updateFaceMeta();
    if (k === 'sleeve.on' || k === 'sleeve.axis' || k === 'sleeve.handle.on') { select(o.id, k === 'sleeve.on' && o.sleeve.on ? 'sleeve' : sel.face); renderModel(); renderFaceTabs(); }
    return;
  }
  if (k === 'handle.shape') applyHandlePreset(o.handle, o.handle.shape);
  if (k === 'tray.out') { applyLid(o); return; }
  if (k === 'hbSides' || k === 'tray.fin' || k === 'product.cake') { ensureFaces(o); rebuildQueue.add(o.id); ui.net = true; select(o.id, sel.face); renderModel(); updateFaceMeta(); return; }
  if (k.startsWith('handle.') || k.startsWith('frontWin.')) {
    ensureFaces(o); rebuildQueue.add(o.id); ui.net = ui.editor = true; updateFaceMeta();
    if (['handle.on', 'handle.shape', 'frontWin.on', 'frontWin.join'].includes(k)) { select(o.id, sel.face); renderModel(); }
    return;
  }
  if (k === 'earsOn' || k === 'earFull') { ensureFaces(o); rebuildQueue.add(o.id); select(o.id, sel.face); renderModel(); ui.net = true; updateFaceMeta(); return; }
  if (k === 'flapH' || k === 'earLen' || k === 'lidH') { rebuildQueue.add(o.id); ui.net = true; updateFaceMeta(); return; }
  if (k.startsWith('dims') || k === 'thickness') { if (sleeveOn(o)) markFace(o, 'sleeve'); if (carryOn(o)) markFace(o, 'carry'); rebuildQueue.add(o.id); renderObjects(); ui.net = true; updateFaceMeta(); return; }
  if (k === 'lid') { applyLid(o); return; }
  if (k === 'bagStyle') { o.dims.d = o.bagStyle === 'block' ? Math.round(o.dims.w * .65) : 12; o.lid = 0; ensureFaces(o); rebuildQueue.add(o.id); select(o.id, sel.face); renderModel(); renderObjects(); ui.net = true; updateFaceMeta(); return; }
  if (k === 'bagTop' || k === 'ext.on') { o.lid = 0; if (k === 'bagTop' && o.bagTop === 'fold' && o.bagStyle === 'block' && o.rollTurns < 2) { o.rollTurns = 2; o.flapH = 16; } ensureFaces(o); rebuildQueue.add(o.id); select(o.id, sel.face); renderModel(); ui.net = true; updateFaceMeta(); return; }
  if (k === 'bagMat') {
    if (o.bagMat === 'kraft') { o.grain = .45; setBoard(o, '#c39460'); } else if (o.bagMat === 'paper') { o.grain = .12; setBoard(o, '#ffffff'); }
    rebuildQueue.add(o.id); applyObjMaterials(o); markObj(o); renderModel(); renderFacePanel(); return;
  }
  if (k.startsWith('product') || k.startsWith('ext.')) { rebuildQueue.add(o.id); ui.net = true; updateFaceMeta(); return; }
  if (k === 'rollTurns' || k === 'shoulder' || k === 'bagZig' || k === 'bagOpen' || k.startsWith('bagWin')) {
    if (k === 'rollTurns') o.lid = 0;
    rebuildQueue.add(o.id); markObj(o); ui.net = true; updateFaceMeta();
    if (k === 'rollTurns' || k === 'bagWin.on' || k === 'bagWin.corners') renderModel();
    return;
  }
  // a cake board: its covering and underside repaint it; its shape, edge, tab and cake build it again
  if (k === 'cbCover' || k === 'cbBottom') { setBoardCover(o); applyObjMaterials(o); markObj(o); renderModel(); renderFacePanel(); return; }
  if (k === 'cbWrap') { applyObjMaterials(o); ui.net = true; renderModel(); return; }
  if (k.startsWith('cb') || k.startsWith('cake.')) {
    rebuildQueue.add(o.id); ui.net = ui.editor = true; updateFaceMeta();
    if (['cbShape', 'cbTab.on', 'cake.on'].includes(k)) { renderModel(); renderObjects(); }
    return;
  }
  if (k === 'baseColor') { applyObjMaterials(o); $$('#torteSw .sw').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === o.baseColor)); return; }
  if (['lidD', 'baseH', 'lidDraft', 'lidR', 'baseFin'].includes(k)) { if (carryOn(o)) markFace(o, 'carry'); rebuildQueue.add(o.id); ui.net = true; updateFaceMeta(); return; }
  if (['trayH', 'botK', 'domeTop', 'flangeW', 'cornerR'].includes(k)) { rebuildQueue.add(o.id); ui.net = true; updateFaceMeta(); return; }
  if (k === 'cupWall' || k === 'cupLid') { rebuildQueue.add(o.id); ui.net = true; updateFaceMeta(); if (k === 'cupLid') renderModel(); return; }
  if (k === 'lidColor') { applyObjMaterials(o); $$('#lidSw .sw').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === o.lidColor)); return; }
  if (k.startsWith('pos') || k === 'rotY') { layoutAll(); return; }
  if (k === 'finish' || k === 'grain') { applyObjMaterials(o); markObj(o); return; }
  if (k === 'edge') applyObjMaterials(o);
  if (k.startsWith('window')) {
    if ((k === 'window.place' || (k === 'window.on' && o.window.on)) && windowPlace(o) === 'lid') {
      // a window that stays inside the lid needs margins; start from a centred, smaller opening
      const [lw, lh] = faceMM(o, 'top');
      if (o.window.d > lh * .75) o.window.d = Math.round(lh * .55);
      if (o.window.w > lw * .8) o.window.w = Math.round(lw * .6);
      o.window.off = 0;
    }
    rebuildQueue.add(o.id); ui.editor = ui.net = true;
    if (['window.on', 'window.place', 'window.corners'].includes(k)) renderModel();
    return;
  }
  if (k === 'whiteInside') { setBoard(o, o.board); applyObjMaterials(o); markObj(o); renderFacePanel(); }
}
function modelCommit(k) { commit(); if (k.startsWith('dims')) updateShadowCam(); }
/* a sleeve or a carrier picked as an object of its own: its shape, name, visibility */
function renderPartModel(sec, o) {
  const k = sel.part, e = extraById(o, k); if (!e) return;
  sec.innerHTML = `<div class="sec-h"><h2>${EXTRA_LABEL[k]}</h2></div>
    <div class="field wide"><span class="fl">Название</span><input class="txt" data-k="${k}.name" placeholder="${esc(extraName(o, { ...e, T: { ...e.T, name: '' } }))}" aria-label="Название"></div>
    ${k === 'sleeve' ? sleeveFields(o) : carryFields(o)}
    <div class="grid2"><button class="btn sm" id="partHide">${e.T.hidden ? 'Показать' : 'Скрыть'}</button><button class="btn sm danger" id="partDel">Удалить</button></div>`;
  bindFields(sec, activeObj, modelInput, modelCommit);
  $('#partHide').onclick = () => { extraAction(o, k, 'vis'); renderModel(); };
  $('#partDel').onclick = () => extraAction(o, k, 'del');
}
function renderModel() {
  const o = activeObj(), sec = $('#modelSec');
  syncProps(!!o || !!(sel.group && groupById(sel.group))); renderActionBar();
  if (sel.group && groupById(sel.group)) return renderGroupPanel(sec);
  const group = o && parentOf(o.id);
  if (!o) { sec.innerHTML = '<div class="sec-h"><h2>Форма</h2></div><div class="empty">Нет выбранного объекта</div>'; return; }
  if (sel.part) return renderPartModel(sec, o);
  const box = o.type === 'box', cboard = o.type === 'board', foilCover = cboard && isFoil(o.cbCover), pbag = o.type === 'paperbag', cup = o.type === 'cup', bag = o.type === 'bag', dome = o.type === 'dome', torte = o.type === 'torte', film = bagFilm(o);
  sec.innerHTML = `
    <div class="sec-h"><h2>Форма и размеры</h2></div>
    <div class="field wide"><span class="fl">Название</span><input class="txt" data-k="name" aria-label="Название"></div>
    <div class="field wide"><span class="fl">Тип</span><select data-k="type"><option value="box">Коробка с крышкой</option><option value="dome">Лоток с прозрачной крышкой-призмой</option><option value="torte">Тортница (ПЭТ)</option><option value="board">Подложка под торт</option><option value="cup">Бумажный стакан</option><option value="bag">Пакет</option><option value="paperbag">Бумажный пакет с ручками</option><option value="tube">Тубус / банка</option></select></div>
    <div class="field wide"><span class="fl">Заготовка</span><select id="presetSel"><option value="">— выбрать размер —</option>${PRESETS.filter(p => p.type === o.type).map(p => `<option value="${p.id}">${p.label}</option>`).join('')}</select></div>
    ${pbag ? rangeField('Ширина, мм', 'dims.w', 60, 800, 1) + rangeField('Глубина (фальц), мм', 'dims.d', 30, 400, 1) + rangeField('Высота, мм', 'dims.h', 80, 900, 1)
        + `<label class="check"><input type="checkbox" data-k="pb.handles"> Плоские бумажные ручки</label>`
        + (o.pb.handles ? rangeField('Ручка: ширина ленты, мм', 'pb.hw', 8, 60, 1) + rangeField('Ручка: высота над краем, мм', 'pb.hh', 20, 300, 1) + rangeField('Ручка: между ножками, мм', 'pb.span', 30, 800, 1) : '')
        + rangeField('Отворот внутрь по верху, мм', 'pb.top', 10, 120, 1)
        + `<p class="hint">Грани: перед, фальцы и зад, каждая — стоящим прямоугольником. Ручки клеятся изнутри под отворот. Цвет бумаги — внизу, в «Материале»; белая или крафтовая изнанка — галочкой.</p>`
      : box ? rangeField('Ширина, мм', 'dims.w', 20, 800, 1) + rangeField('Глубина, мм', 'dims.d', 20, 800, 1) + rangeField('Высота, мм', 'dims.h', 10, 800, 1)
      : cup ? rangeField('Диаметр верха, мм', 'dims.w', 40, 160, 1) + rangeField('Диаметр дна, мм', 'dims.d', 30, 160, 1) + rangeField('Высота, мм', 'dims.h', 40, 250, 1)
          + `<div class="field wide"><span class="fl">Стенка</span><select data-k="cupWall"><option value="double">Двухслойная (внешний слой выше дна)</option><option value="single">Однослойная</option></select></div>`
          + `<label class="check"><input type="checkbox" data-k="cupLid"> Крышка</label>`
          + (o.cupLid ? `<div class="field wide"><span class="fl">Цвет крышки</span><div class="row">
              <div class="swatches" id="lidSw">${LID_COLORS.map(([c, n]) => `<button class="sw" style="background:${c}" data-c="${c}" title="${n}" aria-label="${n}" aria-pressed="${o.lidColor === c}"></button>`).join('')}</div>
              <input type="color" data-k="lidColor" aria-label="Свой цвет крышки"></div></div>` + rangeField('Снять крышку', 'lid', 0, 125, 1) : '')
          + `<p class="hint">Дизайн стенки рисуется на прямоугольнике: середина — лицевая сторона, края сходятся на шве сзади. К верхнему краю элементы на стакане крупнее, к нижнему — мельче (стакан расширяется), пропорции не искажаются. Для типографии — «Шаблон SVG» и «Развёртка PNG» веером.</p>`
      : dome ? rangeField('Ширина по борту, мм', 'dims.w', 50, 400, 1) + rangeField('Глубина по борту, мм', 'dims.d', 50, 400, 1) + rangeField('Высота с крышкой, мм', 'dims.h', 30, 300, 1)
          + rangeField('Высота лотка, мм', 'trayH', 10, 250, 1) + rangeField('Дно относительно борта, %', 'botK', 30, 100, 1, 100)
          + rangeField('Крышка: плоский верх, % борта', 'domeTop', 20, 92, 1, 100) + rangeField('Крышка: фланец, мм', 'flangeW', 0, 30, .5) + rangeField('Крышка: скругление углов, мм', 'cornerR', 0, 60, .5)
          + rangeField('Поднять крышку', 'lid', 0, 125, 1)
          + `<p class="hint">Стенки лотка расходятся от дна к борту; печать — на четырёх стенках и на дне, внутри — «Дно изнутри». Крышка — прозрачный ПЭТ: на плоский верх можно нанести печать, остальное остаётся прозрачным. Дизайн стенки — прямоугольник по ширине борта, на дне видна его средняя часть, как на штанцформе.</p>`
      : torte ? rangeField('Диаметр дна, мм', 'dims.w', 80, 450, 1) + rangeField('Диаметр крышки, мм', 'lidD', 40, 440, 1) + rangeField('Высота с крышкой, мм', 'dims.h', 40, 400, 1)
          + rangeField('Высота дна, мм', 'baseH', 8, 40, .5) + rangeField('Конусность стенки, %', 'lidDraft', 0, 15, .5, 100) + rangeField('Скругление плеча, мм', 'lidR', 2, 40, .5)
          + rangeField('Поднять крышку', 'lid', 0, 125, 1)
          + `<p class="hint">Тортница из двух формованных деталей: дно из непрозрачного ПЭТ, крышка из прозрачного стоит в канавке дна. Печать — на стенке и верхе крышки, незапечатанное остаётся прозрачным. Наклейки огибают стенку, переходят через плечо на верх и спускаются на фланец и бортик дна (пломба).</p>`
      : bag ? bagFields(o)
      : cboard ? `<div class="field wide"><span class="fl">Форма</span><select data-k="cbShape">${Object.entries(BOARD_SHAPE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`
          + (o.cbShape === 'round' ? rangeField('Диаметр, мм', 'dims.w', 40, 600, 1) : rangeField('Ширина, мм', 'dims.w', 40, 800, 1) + rangeField('Глубина, мм', 'dims.d', 40, 800, 1) + rangeField('Скругление углов, мм', 'cbR', 0, 100, .5))
          + rangeField('Толщина картона, мм', 'dims.h', 1, 12, .5)
          + `<div class="field wide"><span class="fl">Край</span><select data-k="cbEdge"><option value="smooth">Ровный</option><option value="scallop">Волнистый (фигурный)</option></select></div>`
          + `<label class="check"><input type="checkbox" data-k="cbTab.on"> Язычок, за который берут (под пирожное)</label>`
          + (o.cbTab?.on ? rangeField('Язычок: ширина, мм', 'cbTab.w', 10, 200, 1) + rangeField('Язычок: длина, мм', 'cbTab.l', 5, 120, 1) : '')
          + `<label class="check"><input type="checkbox" data-k="cake.on"> Торт на подложке</label>`
          + (o.cake?.on !== false ? rangeField('Высота торта, мм', 'cake.h', 10, 250, 1) : '')
          + `<p class="hint">Подложка — толстый картон, обтянутый фольгой или ламинированной бумагой с печатью. Дизайн — на гранях «Верх подложки» и «Низ подложки» по форме подложки (с язычком и волнистым краем). Торт стоит сверху, той же формы, чуть меньше.</p>`
      : rangeField('Диаметр, мм', 'dims.w', 20, 400, 1) + rangeField('Высота, мм', 'dims.h', 10, 800, 1)}
    ${box ? `<div class="field wide"><span class="fl">Крышка</span><select data-k="lidType">${Object.entries(LID_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>` : ''}
    ${box && o.lidType !== 'none' ? rangeField(o.lidType === 'telescope' ? 'Поднять крышку' : o.lidType === 'handle' ? 'Открыть торец' : 'Открыть крышку, °', 'lid', 0, 125, 1) : ''}
    ${box && (o.lidType === 'flap' || o.lidType === 'tuck') ? rangeField('Клапан, мм', 'flapH', 3, 300, 1) : ''}
    ${box && o.lidType === 'handle' ? `<div class="field wide"><span class="fl">Открывается</span><select data-k="hbSides">${Object.entries(HB_SIDES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`
      + rangeField('Выдвинуть подложку, мм', 'tray.out', 0, o.dims.w, 1)
      + `<div class="field wide"><span class="fl">Подложка</span><select data-k="tray.fin">${Object.entries(TRAY_FIN).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`
      + `<div class="field wide"><span class="fl">Торт</span><div class="row"><button class="btn sm" id="prodBtn">${o.product?.src ? 'Заменить фото…' : 'Фото торта (PNG)…'}</button>${o.product?.src ? '<button class="btn sm" id="prodOff">Убрать</button>' : ''}</div></div>`
      + (o.product?.src ? rangeField('Торт: ширина, мм', 'product.w', 5, 800, 1) : `<label class="check"><input type="checkbox" data-k="product.cake"> Торт-заглушка, пока нет фото</label>`)
      + `<label class="check"><input type="checkbox" data-k="handle.on"> Ручка</label>` : ''}
    ${box && o.lidType === 'handle' && o.handle?.on ? `<div class="field wide"><span class="fl">Заготовка ручки</span><select data-k="handle.shape">${Object.entries(HANDLE_SHAPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`
      + rangeField('Ручка: ширина, мм', 'handle.w', 20, 400, 1) + rangeField('Ручка: высота, мм', 'handle.h', 15, 200, 1)
      + rangeField('Ручка: скругление верхних углов, мм', 'handle.rTop', 0, 200, .5) + rangeField('Ручка: скругление нижних углов, мм', 'handle.rBot', 0, 200, .5)
      + rangeField('Пройма: ширина, мм', 'handle.hole.w', 0, 400, 1) + rangeField('Пройма: высота, мм', 'handle.hole.h', 0, 200, 1)
      + rangeField('Пройма: от перемычки, мм (0 — открыта снизу)', 'handle.hole.y', 0, 200, .5)
      + rangeField('Пройма: скругление верхних углов, мм', 'handle.hole.rTop', 0, 200, .5) + rangeField('Пройма: скругление нижних углов, мм', 'handle.hole.rBot', 0, 200, .5)
      + rangeField('Перемычка под ручкой, мм (0 — нет)', 'handle.bridge', 0, 120, 1)
      + `<label class="check"><input type="checkbox" data-k="handle.up"> Ручка поднята</label>`
      + `<p class="hint">${bridgeMM(o) ? 'Ручка вырублена из крышки: на развёртке лепестки лежат в вырезе окна и поднимаются по биговкам у краёв перемычки. Снаружи ручки оборот картона, поэтому её дизайн печатается с оборота.' : 'Без перемычки лепестки ручки вырубаются отдельными деталями.'}</p>`
      + `<label class="check"><input type="checkbox" data-k="frontWin.on"> Окно на передней стенке</label>`
      + (o.frontWin?.on ? rangeField('Окно спереди: ширина, мм', 'frontWin.w', 10, 800, 1) + rangeField('Окно спереди: высота, мм', 'frontWin.h', 10, 800, 1)
        + rangeField('Окно спереди: центр от низа, мм', 'frontWin.y', 5, 800, 1) + rangeField('Окно спереди: радиус, мм', 'frontWin.r', 0, 200, .5)
        + `<label class="check"><input type="checkbox" data-k="frontWin.join"> Окно спереди переходит на крышку (одно окно через ребро)</label>`
        + (o.frontWin.join && !bridgeMM(o) && !winMM(o) ? rangeField('Окно спереди: заход на крышку, мм', 'frontWin.d', 5, 800, 1) : '')
        + (o.frontWin.join ? `<p class="hint">Окно на передней стенке поднимается до ребра и продолжается на крышке ${bridgeMM(o) ? 'до перемычки' : winMM(o) ? 'до заднего края окна в крышке' : 'на заданную глубину'}, ширина — как у окна спереди.</p>` : '') : '')
      + `<p class="hint">Коробка открывается с торца: верхний клапан откидывается вверх, нижний — вниз, они сходятся посередине на замке «язычок в прорезь»; за ними внутренние крылышки от передней и задней стенок. Подложка с тортом выдвигается через открытый торец. Ручка — два лепестка: они поднимаются от краёв перемычки поперёк окна и сходятся вверху.</p>` : ''}
    ${box && o.lidType === 'flap' ? `<label class="check"><input type="checkbox" data-k="earsOn"> Боковые ушки клапана</label>` : ''}
    ${box && o.lidType === 'flap' && o.earsOn ? `<label class="check"><input type="checkbox" data-k="earFull"> Ушки на всю глубину коробки</label>` : ''}
    ${box && o.lidType === 'flap' && o.earsOn && !o.earFull ? rangeField('Длина ушек, мм', 'earLen', 5, 800, 1) : ''}
    ${box && o.lidType === 'telescope' ? `<div class="field wide"><span class="fl">Материал крышки</span><select data-k="lidMat"><option value="board">Картон, как дно</option><option value="clear">Прозрачный пластик (ПЭТ)</option></select></div>` : ''}
    ${box && clearLid(o) ? `<div class="field wide"><span class="fl">Посадка крышки</span><select data-k="lidFit"><option value="inside">Внутри дна (дно обхватывает крышку)</option><option value="over">Поверх дна</option></select></div>` : ''}
    ${box && o.lidType === 'telescope' ? rangeField('Высота крышки, мм', 'lidH', 3, 600, 1) : ''}
    ${box && clearLid(o) ? `<p class="hint">${o.lidFit === 'inside' ? 'Крышка стоит на дне лотка внутри бортов; высота считается от дна.' : 'Если крышка выше дна, она стоит на столе и закрывает лоток целиком.'} На прозрачные грани можно нанести печать: всё, что не закрыто слоями, остаётся прозрачным.</p>` : ''}
    ${box || dome ? rangeField('Толщина, мм', 'thickness', .3, 6, .1) : ''}
    ${box ? rangeField('Стенки дна, мм', 'wallT', .3, 30, .1) : ''}
    ${box ? `<p class="hint">Стенки толще картона — двойной борт: стенка загибается внутрь, сверху виден сгиб.</p>` : ''}
    ${box && windowPlace(o) ? `<label class="check"><input type="checkbox" data-k="window.on"> Прозрачное окно с плёнкой</label>` : ''}
    ${box && o.window.on && windowPlace(o) ? windowFields(o) : ''}
    <div class="sec-h" style="margin-top:4px"><h2>Материал</h2></div>
    ${cboard ? `<div class="field wide"><span class="fl">Покрытие</span><select data-k="cbCover">${Object.entries(BOARD_COVER).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`
      + (foilCover ? `<p class="hint">Фольга — металл: блики даёт то, что она отражает (вкладка «Сцена», «Отражения»). Печать поверх фольги — краска, она не блестит.</p>`
        : `<div class="field wide"><span class="fl">Цвет бумаги</span><div class="row">
      <div class="swatches" id="boardSw">${BOARD.map(([c, n]) => `<button class="sw" style="background:${c}" data-c="${c}" title="${n}" aria-label="${n}" aria-pressed="${o.board === c}"></button>`).join('')}</div>
      <input type="color" id="boardColor" value="${o.board || '#ffffff'}" aria-label="Свой цвет бумаги"></div></div>
      <div class="field wide"><span class="fl">Ламинация</span><select data-k="finish">${Object.entries(FINISHES).filter(([k]) => k !== 'metal' && k !== 'kraft').map(([k, f]) => `<option value="${k}">${f.label}</option>`).join('')}</select></div>`)
      + `<label class="check"><input type="checkbox" data-k="cbWrap"> Покрытие заворачивается на борт</label>`
      + `<div class="field wide"><span class="fl">Низ</span><select data-k="cbBottom">${Object.entries(BOARD_BOTTOM).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`
      : torte ? `<div class="field wide"><span class="fl">Дно</span><div class="row">
      <div class="swatches" id="torteSw">${TORTE_COLORS.map(([c, n]) => `<button class="sw" style="background:${c}" data-c="${c}" title="${n}" aria-label="${n}" aria-pressed="${o.baseColor === c}"></button>`).join('')}</div>
      <input type="color" data-k="baseColor" aria-label="Свой цвет дна"></div></div>
    <div class="field wide"><span class="fl">Материал дна</span><select data-k="baseFin">${Object.entries(TORTE_FIN).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>` : film ? `<p class="hint">Плёнка: всё, что не закрыто печатью, остаётся ${o.bagMat === 'clear' ? 'прозрачным' : 'полупрозрачным'}. Материал меняется в настройках пакета выше.</p>` : `
    <div class="field wide"><span class="fl">${bag || pbag ? 'Цвет бумаги' : 'Цвет картона'}</span><div class="row">
      <div class="swatches" id="boardSw">${BOARD.map(([c, n]) => `<button class="sw" style="background:${c}" data-c="${c}" title="${n}" aria-label="${n}" aria-pressed="${o.board === c}"></button>`).join('')}</div>
      <input type="color" id="boardColor" value="${o.board || '#ffffff'}" aria-label="Свой цвет картона"></div></div>
    <label class="check"><input type="checkbox" data-k="whiteInside"> Белая внутренняя сторона</label>
    <div class="field wide"><span class="fl">Покрытие</span><select data-k="finish">${Object.entries(FINISHES).map(([k, f]) => `<option value="${k}">${f.label}</option>`).join('')}</select></div>
    ${rangeField('Фактура бумаги', 'grain', 0, 100, 1, 100)}`}
    ${box || dome || (cboard && !o.cbWrap) ? `<div class="field wide"><span class="fl">Цвет торца</span><div class="row"><input type="color" data-k="edge" aria-label="Цвет торца"><span class="hint">виден на срезе картона</span></div></div>` : ''}
    <div class="sec-h" style="margin-top:4px"><h2>Положение в сцене</h2></div>
    ${group ? `<p class="hint">Место в ряду задаёт группа «${esc(group.name)}»: порядок — как в списке, отступ и выравнивание — в настройках группы. Поворот — внутри группы.</p>`
      : rangeField('Смещение X, мм', 'pos.x', -1000, 1000, 1) + rangeField('Смещение Z, мм', 'pos.z', -1000, 1000, 1)}
    ${rangeField(group ? 'Поворот в группе, °' : 'Поворот, °', 'rotY', -180, 180, 1)}`;
  bindFields(sec, activeObj, modelInput, modelCommit);
  const board = c => { setBoard(o, c); applyObjMaterials(o); markObj(o); renderFacePanel(); $$('#boardSw .sw').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === c)); $('#boardColor').value = c; };
  $$('#boardSw .sw').forEach(b => b.onclick = () => { board(b.dataset.c); commit(); });
  $$('#lidSw .sw').forEach(b => b.onclick = () => { o.lidColor = b.dataset.c; applyObjMaterials(o); renderModel(); commit(); });
  $$('#torteSw .sw').forEach(b => b.onclick = () => { o.baseColor = b.dataset.c; applyObjMaterials(o); renderModel(); commit(); });
  $('#boardColor')?.addEventListener('input', e => board(e.target.value));
  $('#boardColor')?.addEventListener('change', () => commit());
  if ($('#prodBtn')) $('#prodBtn').onclick = e => pickAsset(e.currentTarget, 'Фото торта (PNG с прозрачным фоном)', r => {
    o.product.src = r.id; o.product.aspect = r.aspect;
    rebuildQueue.add(o.id); renderModel(); commit();
  });
  if ($('#prodOff')) $('#prodOff').onclick = () => { o.product.src = null; rebuildQueue.add(o.id); renderModel(); commit(); };
  $('#presetSel').onchange = e => {
    const p = PRESETS.find(x => x.id === e.target.value); if (!p) return;
    o.dims = { ...p.dims }; o.finish = p.finish; o.edge = p.edge; o.thickness = p.thick ?? 2; o.grain = p.grain ?? (p.finish === 'kraft' ? .55 : o.grain);
    o.window = p.window ? { ...p.window } : { ...o.window, on: false };
    if (o.type === 'box') {
      o.lidType = p.lid?.type ?? 'flat';
      for (const [k, v] of [['flapH', p.lid?.flapH], ['lidH', p.lid?.lidH]]) if (v != null) o[k] = v;
      o.lidMat = p.lid?.mat ?? 'board'; o.lidFit = p.lid?.fit ?? 'over'; o.wallT = p.wallT ?? o.thickness;
      o.earsOn = true; o.earFull = true;
      if (p.sleeve) { o.sleeve = { ...defaultSleeve(o.dims), ...p.sleeve, handle: { ...defaultSleeveHandle(), ...(p.sleeve.handle || {}) }, on: true }; ensureFaces(o); if (p.sleeve.bg) o.faces.sleeve.bg = p.sleeve.bg; }
      if (o.lidType === 'handle') {
        o.handle = applyHandlePreset({ ...defaultHandle(o.dims), ...(p.handle || {}) }, p.handle?.shape || 'arch');
        o.frontWin = { ...defaultFrontWin(o.dims), ...(p.frontWin || {}) };
      }
      if (p.whiteInside != null) o.whiteInside = p.whiteInside;
      ensureFaces(o); if (p.board) setBoard(o, p.board);
      applyObjMaterials(o); select(o.id, sel.face);
    }
    if (o.type === 'cup' && p.board) { setBoard(o, p.board); applyObjMaterials(o); }
    if (o.type === 'torte') { applyTortePreset(o, p); ensureFaces(o); applyObjMaterials(o); select(o.id, sel.face); }
    if (o.type === 'board') { applyBoardPreset(o, p); ensureFaces(o); setBoardCover(o); applyObjMaterials(o); select(o.id, sel.face); }
    if (o.type === 'dome') {
      applyDomePreset(o, p); if (p.whiteInside != null) o.whiteInside = p.whiteInside;
      ensureFaces(o); if (p.board) setBoard(o, p.board); applyObjMaterials(o); select(o.id, sel.face);
    }
    if (o.type === 'bag') { applyBagPreset(o, p); ensureFaces(o); if (p.board) setBoard(o, p.board); applyObjMaterials(o); select(o.id, sel.face); }
    rebuildQueue.add(o.id); renderModel(); renderObjects(); commit(); setTimeout(() => setView(lastView), 50);
  };
}
function bagFields(o) {
  const block = o.bagStyle === 'block', top = o.bagTop, pr = o.product || {};
  return `<div class="field wide"><span class="fl">Форма</span><select data-k="bagStyle"><option value="flat">Плоский</option><option value="block">С плоским дном</option></select></div>`
    + rangeField('Ширина, мм', 'dims.w', 30, 600, 1) + rangeField('Высота, мм', 'dims.h', 30, 800, 1)
    + (block ? rangeField('Глубина дна (фальц), мм', 'dims.d', 10, 300, 1) : rangeField('Толщина содержимого, мм', 'dims.d', 0, 80, 1))
    + `<div class="field wide"><span class="fl">Верх</span><select data-k="bagTop">${Object.entries(BAG_TOPS).map(([k, v]) => `<option value="${k}">${k === 'fold' && block ? 'Завёрнут (скрутка)' : v}</option>`).join('')}</select></div>`
    + (top === 'fold' ? rangeField('Обороты (1 — простой отворот)', 'rollTurns', 1, 3, 1) : '')
    + (top === 'open' ? rangeField('Раскрытие горловины, %', 'bagOpen', 0, 100, 1, 100) + `<label class="check"><input type="checkbox" data-k="bagZig"> Зубчатый край горловины</label>` : '')
    + (top === 'flap' || top === 'fold' ? rangeField(top === 'flap' ? 'Клапан, мм' : (o.rollTurns > 1 ? 'Скрутка: ширина валика, мм' : 'Отворот, мм'), 'flapH', 8, 200, 1) : '')
    + (top === 'flap' || (top === 'fold' && !(o.rollTurns > 1)) ? rangeField(top === 'flap' ? 'Открыть клапан, °' : 'Развернуть отворот, °', 'lid', 0, 180, 1) : '')
    + (block ? rangeField('Скат верха, мм (0 — авто)', 'shoulder', 0, 300, 1) : '')
    + `<div class="field wide"><span class="fl">Материал</span><select data-k="bagMat">${Object.entries(BAG_MATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`
    + (top !== 'open' ? `<label class="check"><input type="checkbox" data-k="ext.on"> Экстендер (картонный хедер на степлере)</label>` : '')
    + (o.ext?.on && top !== 'open' ? rangeField('Экстендер: высота, мм', 'ext.h', 10, 200, 1) + rangeField('Экстендер: нахлёст на пакет, мм', 'ext.ov', 8, 200, 1) + `<div class="field wide"><span class="fl">Скобы</span><select data-k="ext.staples"><option value="1">Одна по центру</option><option value="2">Две</option></select></div>` : '')
    + (!bagFilm(o) ? `<label class="check"><input type="checkbox" data-k="bagWin.on"> Окно с плёнкой</label>`
      + (o.bagWin?.on ? rangeField('Окно: ширина, мм', 'bagWin.w', 5, 600, 1) + rangeField('Окно: высота, мм', 'bagWin.h', 5, 800, 1)
        + rangeField('Окно: центр от дна, мм', 'bagWin.cy', 5, 800, 1) + rangeField('Окно: сдвиг вбок, мм', 'bagWin.x', -300, 300, 1)
        + `<div class="field wide"><span class="fl">Углы окна</span><select data-k="bagWin.corners"><option value="round">Скруглённые</option><option value="square">Прямые</option></select></div>`
        + (o.bagWin.corners === 'round' ? rangeField('Окно: радиус, мм', 'bagWin.r', 0, 60, .5) : '')
        + `<p class="hint">Окно растёт от своего центра во все стороны.</p>` : '') : '')
    + `<div class="field wide"><span class="fl">Содержимое</span><div class="row"><button class="btn sm" id="prodBtn">${pr.src ? 'Заменить фото…' : 'Фото продукта (PNG)…'}</button>${pr.src ? '<button class="btn sm" id="prodOff">Убрать</button>' : ''}</div></div>`
    + (pr.src ? rangeField('Содержимое: ширина, мм', 'product.w', 5, 600, 1) + rangeField('Содержимое: от дна, мм', 'product.y', -50, 600, 1) + rangeField('Содержимое: сдвиг вбок, мм', 'product.x', -300, 300, 1) : '')
    + `<p class="hint">Фото продукта без фона (PNG) стоит внутри пакета и просвечивает сквозь плёнку: через матовую плёнку и кальку — размыто.${top === 'flap' ? ' Клеевая лента — на внутренней стороне клапана, видна при открытии.' : ''}</p>`;
}
function windowFields(o) {
  const place = windowPlace(o), lt = o.lidType, flap = lt === 'flap';
  const canEdge = lt === 'flat' || lt === 'flap', canBack = canEdge || lt === 'tuck';
  if (canBack && o.window.place !== place) o.window.place = place;   // keep the menu on an option this lid offers
  return (canBack ? `<div class="field wide"><span class="fl">Окно</span><select data-k="window.place">
      ${canEdge ? `<option value="edge">${flap ? 'Через переднее ребро на клапан' : 'Через переднее ребро на переднюю стенку'}</option>` : ''}
      <option value="back">Через заднее ребро на заднюю стенку</option><option value="lid">В крышке</option></select></div>` : '')
    + `<div class="field wide"><span class="fl">Углы окна</span><select data-k="window.corners"><option value="round">Скруглённые</option><option value="square">Прямые</option></select></div>`
    + rangeField('Окно: ширина, мм', 'window.w', 10, 800, 1)
    + rangeField(place === 'lid' ? 'Окно: глубина, мм' : 'Окно: на крышке, мм', 'window.d', 5, 800, 1)
    + (place !== 'lid' ? rangeField(place === 'back' ? 'Окно: на задней, мм' : flap ? 'Окно: на клапане, мм' : 'Окно: на передней, мм', 'window.h', 2, 800, 1)
                        : rangeField('Окно: сдвиг к переду, мм', 'window.off', -400, 400, 1))
    + (o.window.corners !== 'square' ? rangeField('Окно: радиус, мм', 'window.r', 0, 60, .5) : '');
}
/* the HDR row shows with «Свой HDR» picked */
function paintHdr() { const s = state.scene; $('#envHdrRow').hidden = s.envMap !== 'hdr'; $('#envHdrName').textContent = s.envMap === 'hdr' ? (s.envHdr && assets[s.envHdr] ? 'панорама загружена' : 'выберите файл .hdr') : ''; }
function bindScene() {
  const sec = $('#sceneSec');
  $('#sceneFields').innerHTML = rangeField('Свет', 'light', 0, 6, .05) + rangeField('Направление, °', 'az', -180, 180, 1) + rangeField('Высота света, °', 'el', 5, 89, 1) + rangeField('Тень', 'shadow', 0, 100, 1, 100) + rangeField('Экспозиция', 'exposure', .4, 1.8, .01);
  // what metal and gloss reflect: a studio or a HDR of one's own, turned round the model, how strong
  $('#envMap').innerHTML = Object.entries(ENVS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
  $('#envFields').innerHTML = rangeField('Поворот, °', 'envRot', -180, 180, 1) + rangeField('Сила', 'env', 0, 2, .01);
  $('#envHdrBtn').onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.hdr';
    inp.onchange = async () => { const f = inp.files[0]; if (!f) return; if (await setHdrFile(f, addAsset)) { refreshFields(sec, state.scene); paintHdr(); commit(); } else toast('Это не HDR-панорама (.hdr)'); };
    inp.click();
  };
  bindFields(sec, () => state.scene, k => { applyScene(); if (k === 'envMap') { paintHdr(); if (state.scene.envMap === 'hdr' && !assets[state.scene.envHdr]) $('#envHdrBtn').click(); } });
  paintHdr();
  $('#lightPreset').value = state.scene.preset;
  $('#lightPreset').onchange = e => { Object.assign(state.scene, LIGHTS[e.target.value], { preset: e.target.value }); refreshFields(sec, state.scene); paintHdr(); applyScene(); commit(); };
}

export { bindScene, modelInput, paintHdr, renderModel };
