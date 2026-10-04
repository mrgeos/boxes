// Константы предметной области: иконки, шрифты, покрытия, отделка, заготовки коробок, свет

const ICON = {
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>',
  tube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5" rx="7" ry="2.5"/><path d="M5 5v14c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5"/></svg>',
  cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4.5 6.5h15M6 4.5h12l1.5 2-2 14.5h-11L4.5 6.5z"/><path d="M6.6 11h10.8"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 8h12l1 13H5L6 8z"/><path d="M6 8l1.5-4h9L18 8M9 12.5h6"/></svg>',
  dome: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 13.5h18M4.2 13.5 7 20h10l2.8-6.5"/><path d="M6.5 13.5 8.2 6.5a2 2 0 0 1 2-1.5h3.6a2 2 0 0 1 2 1.5l1.7 7"/></svg>',
  torte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M2.5 17.5h19M3.5 17.5 5 20h14l1.5-2.5"/><path d="M5.5 17.5V8.5c0-2 1.5-3.5 3.5-3.5h6c2 0 3.5 1.5 3.5 3.5v9"/></svg>',
  rect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>',
  ell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>',
};
const FONTS = ['Montserrat', 'Rubik', 'Unbounded', 'Oswald', 'Russo One', 'Onest', 'Playfair Display', 'PT Serif', 'Roboto Slab', 'Lobster', 'Caveat', 'Comfortaa', 'Pacifico'];
const FINISHES = {
  matte: { label: 'Матовый мелованный картон', r: .78, m: 0, cc: 0, ccr: 0 },
  soft:  { label: 'Soft-touch ламинация', r: .93, m: 0, cc: 0, ccr: 0, sheen: .12 },
  gloss: { label: 'Глянцевая ламинация', r: .42, m: 0, cc: 1, ccr: .05 },
  kraft: { label: 'Крафт (печать по бурому)', r: .95, m: 0, cc: 0, ccr: 0, kraft: '#c49a6a' },
  metal: { label: 'Металлизированный картон', r: .3, m: .9, cc: .3, ccr: .15 },
};
const PET_PRINT = { label: 'Печать на ПЭТ', r: .35, m: 0, cc: 0, ccr: 0 };
const EFFECTS = {
  none: 'Обычная печать', 'foil-gold': 'Фольга — золото', 'foil-silver': 'Фольга — серебро', 'foil-copper': 'Фольга — медь',
  'foil-holo': 'Фольга — голография', 'spot-uv': 'Выборочный УФ-лак', emboss: 'Тиснение выпуклое', deboss: 'Конгрев вдавленный',
};
const FOILS = {
  'foil-gold': ['#fbe7a1', '#d6a53c', '#8f6516'], 'foil-silver': ['#f7f8fa', '#bfc4cc', '#7d838d'],
  'foil-copper': ['#f6c29c', '#bf6f3f', '#7c3e1b'], 'foil-holo': null,
};
const EFFECT_SHORT = { 'foil-gold': 'золото', 'foil-silver': 'серебро', 'foil-copper': 'медь', 'foil-holo': 'голо', 'spot-uv': 'УФ-лак', emboss: 'тиснение', deboss: 'конгрев' };
const isFoil = e => e && e.startsWith('foil');
const BLENDS = { 'source-over': 'Обычное', multiply: 'Умножение', screen: 'Осветление', overlay: 'Перекрытие' };
const PRESETS = [
  { id: 'window', label: 'Коробка с окном', type: 'box', dims: { w: 200, h: 50, d: 150 }, finish: 'matte', edge: '#e9e5dc', thick: .8, board: '#f4f1e9', window: { on: true, w: 136, d: 127, h: 23, r: 6 } },
  { id: 'flap150', label: 'С клапаном 150×90×70', type: 'box', dims: { w: 150, h: 70, d: 90 }, finish: 'matte', edge: '#b88d5c', thick: .6, board: '#c39460', grain: .45, lid: { type: 'flap', flapH: 24 } },
  { id: 'flapwin', label: 'С клапаном и окном 230×140×60', type: 'box', dims: { w: 230, h: 60, d: 140 }, finish: 'matte', edge: '#b88d5c', thick: .6, board: '#c39460', grain: .45, lid: { type: 'flap', flapH: 20 }, window: { on: true, place: 'lid', w: 150, d: 80, h: 12, r: 8, off: 0, corners: 'round' } },
  { id: 'flap230', label: 'С клапаном 230×140×60', type: 'box', dims: { w: 230, h: 60, d: 140 }, finish: 'matte', edge: '#b88d5c', thick: .6, board: '#c39460', grain: .45, lid: { type: 'flap', flapH: 20 } },
  { id: 'mailer', label: 'Почтовая коробка (мейлер)', type: 'box', dims: { w: 260, h: 80, d: 170 }, finish: 'matte', edge: '#cdb08a', lid: { type: 'tuck', flapH: 45 } },
  { id: 'lidbase', label: 'Крышка-дно', type: 'box', dims: { w: 220, h: 90, d: 160 }, finish: 'soft', edge: '#e2ddd4', thick: 1.5, lid: { type: 'telescope', lidH: 45 } },
  { id: 'shipping', label: 'Гофрокороб', type: 'box', dims: { w: 400, h: 300, d: 300 }, finish: 'kraft', edge: '#a87f50', thick: 4 },
  { id: 'product', label: 'Коробка для продукта', type: 'box', dims: { w: 70, h: 180, d: 70 }, finish: 'gloss', edge: '#ece8e0', thick: .6 },
  { id: 'cake', label: 'Коробка для торта, белая', type: 'box', dims: { w: 220, h: 45, d: 220 }, finish: 'matte', edge: '#ece8e0', thick: .8, wallT: 6, board: '#f7f5f0', lid: { type: 'telescope', lidH: 120, mat: 'clear', fit: 'inside' } },
  { id: 'cakeKraft', label: 'Коробка для торта, крафт', type: 'box', dims: { w: 220, h: 45, d: 220 }, finish: 'matte', edge: '#b88d5c', thick: .8, wallT: 6, board: '#c39460', grain: .45, whiteInside: false, lid: { type: 'telescope', lidH: 120, mat: 'clear', fit: 'inside' } },
  { id: 'gift', label: 'Подарочная коробка', type: 'box', dims: { w: 200, h: 120, d: 200 }, finish: 'soft', edge: '#e2ddd4', thick: 1.5, lid: { type: 'telescope', lidH: 40 } },
  { id: 'cakeHandle', label: 'Коробка для торта с ручкой 216×216×146', type: 'box', dims: { w: 216, h: 146, d: 216 }, finish: 'matte', edge: '#ece8e0', thick: .8, board: '#f7f5f0', lid: { type: 'handle' }, window: { on: true, place: 'lid', w: 130, d: 130, h: 20, r: 65, off: 0, corners: 'round' }, handle: { shape: 'arch', w: 120, h: 62 } },
  { id: 'cakeHandleKraft', label: 'Коробка для торта с ручкой 300×300×190, крафт', type: 'box', dims: { w: 300, h: 190, d: 300 }, finish: 'matte', edge: '#b88d5c', thick: 1.2, board: '#c39460', grain: .45, whiteInside: true, lid: { type: 'handle' }, window: { on: true, place: 'lid', w: 200, d: 170, h: 20, r: 10, off: 0, corners: 'round' }, handle: { shape: 'rect', w: 120, h: 60 } },
  { id: 'cakeHandleFront', label: 'Коробка для торта с ручкой и окном спереди 200×200×190', type: 'box', dims: { w: 200, h: 190, d: 200 }, finish: 'matte', edge: '#ece8e0', thick: .8, board: '#f7f5f0', lid: { type: 'handle' }, window: { on: true, place: 'lid', w: 150, d: 150, h: 20, r: 6, off: 0, corners: 'round' }, handle: { shape: 'photo', w: 130, h: 75, bridge: 26 }, frontWin: { on: true, w: 140, h: 110, y: 100, r: 3 } },
  { id: 'mailerSleeve', label: 'Мейлер крафт с рукавом', type: 'box', dims: { w: 260, h: 90, d: 190 }, finish: 'kraft', edge: '#a87f50', thick: 1.5, lid: { type: 'tuck', flapH: 45 }, sleeve: { axis: 'x', w: 170, bg: '#d32f2f', fin: 'matte' } },
  { id: 'boxBand', label: 'Коробка крафт с узкой бандеролью', type: 'box', dims: { w: 260, h: 110, d: 200 }, finish: 'kraft', edge: '#a87f50', thick: 1.5, lid: { type: 'telescope', lidH: 50 }, sleeve: { axis: 'z', w: 55, x: 30, bg: '#2a2a2a', fin: 'soft' } },
  { id: 'cakeSleeveHandle', label: 'Коробка для торта крафт с рукавом-ручкой', type: 'box', dims: { w: 260, h: 140, d: 260 }, finish: 'kraft', edge: '#a87f50', thick: 1.5, lid: { type: 'telescope', lidH: 70 }, sleeve: { axis: 'x', w: 120, bg: '#f2a9b4', fin: 'matte', handle: { on: true, h: 80, r: 22, rf: 14, hole: { w: 70, h: 22, y: 44, r: 11 } } } },
  { id: 'matchbox', label: 'Коробка-пенал: лоток в рукаве', type: 'box', dims: { w: 180, h: 50, d: 120 }, finish: 'matte', edge: '#e2ddd4', thick: 1, board: '#f4f1e9', lid: { type: 'none' }, sleeve: { axis: 'x', w: 182, bg: '#1f3b57', fin: 'soft' } },
  { id: 'tray', label: 'Лоток без крышки', type: 'box', dims: { w: 240, h: 60, d: 160 }, finish: 'kraft', edge: '#a87f50', thick: 1.5, lid: { type: 'none' } },
  { id: 'flat', label: 'Плоская (пицца, одежда)', type: 'box', dims: { w: 330, h: 45, d: 330 }, finish: 'kraft', edge: '#a87f50', thick: 3 },
  { id: 'tube', label: 'Тубус', type: 'tube', dims: { w: 80, h: 200, d: 80 }, finish: 'matte', edge: '#cdb08a' },
  { id: 'can', label: 'Низкая банка', type: 'tube', dims: { w: 100, h: 60, d: 100 }, finish: 'metal', edge: '#cccccc' },
  // paper cups: w = rim diameter, d = bottom diameter, h = height
  { id: 'cup250', label: 'Бумажный стакан 250 мл', type: 'cup', dims: { w: 80, h: 92, d: 54 }, finish: 'matte', edge: '#ece8e0', thick: .4, board: '#f7f5f0', grain: .1 },
  { id: 'cup350', label: 'Бумажный стакан 350 мл', type: 'cup', dims: { w: 90, h: 110, d: 60 }, finish: 'matte', edge: '#ece8e0', thick: .4, board: '#f7f5f0', grain: .1 },
  { id: 'cup450', label: 'Бумажный стакан 450 мл', type: 'cup', dims: { w: 90, h: 130, d: 60 }, finish: 'matte', edge: '#ece8e0', thick: .4, board: '#f7f5f0', grain: .1 },
];
const LID_COLORS = [['#1d1d1f', 'Чёрная'], ['#f4f4f1', 'Белая']];
const LID_TYPES = {
  flat: 'Откидная крышка',
  flap: 'Откидная с клапаном снаружи',
  tuck: 'Откидная с клапаном внутрь (мейлер)',
  telescope: 'Отдельная крышка (крышка-дно)',
  handle: 'С ручкой: крышка с передней стенкой (торт)',
  none: 'Без крышки (лоток)',
};
const LID_WALLS = ['lidFront', 'lidRight', 'lidLeft', 'lidBack'];
const FACE_LABEL = { sleeve: 'Рукав', handleFront: 'Ручка: перед', handleBack: 'Ручка: зад', rightTop: 'Правый торец: верх', rightBottom: 'Правый торец: низ', leftTop: 'Левый торец: верх', leftBottom: 'Левый торец: низ', tray: 'Подложка', extFront: 'Экстендер: перед', extBack: 'Экстендер: зад', fold: 'Внутренний борт', flap: 'Клапан', earLeft: 'Ушко левое', earRight: 'Ушко правое', lidFront: 'Крышка: перед', lidBack: 'Крышка: зад', lidLeft: 'Крышка: левый бок', lidRight: 'Крышка: правый бок', front: 'Перед', back: 'Зад', left: 'Левый бок', right: 'Правый бок', top: 'Крышка', bottom: 'Дно', inside: 'Крышка изнутри', insideBottom: 'Дно изнутри', wrap: 'Обечайка' };
const BOARD = [['#f4f1e9', 'Белый'], ['#c39460', 'Крафт'], ['#2e3530', 'Графит'], ['#879c79', 'Шалфей'], ['#d28f84', 'Розовый'], ['#8aacca', 'Голубой']];
const WHITE_INSIDE = '#f8f6ef';
const SWATCHES = ['#ffffff', '#f3ead6', '#1c1b19', '#20392b', '#0a7aa1', '#b8461b', '#e6007e', '#ffe500'];
const LIGHTS = {
  studio: { light: 1.6, az: 38, el: 52, env: .55, shadow: .38, exposure: .85 },
  day:    { light: 2.2, az: -30, el: 62, env: .42, shadow: .5, exposure: .88 },
  drama:  { light: 3.0, az: 70, el: 24, env: .14, shadow: .62, exposure: .85 },
  flat:   { light: .7, az: 20, el: 70, env: .95, shadow: .18, exposure: .9 },
};
