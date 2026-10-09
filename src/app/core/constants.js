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
  model: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>',
  board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><ellipse cx="12" cy="17" rx="10" ry="3.2"/><path d="M6 16V10.5c0-1.2 2.7-2 6-2s6 .8 6 2V16"/><path d="M6 10.5c0 1.2 2.7 2 6 2s6-.8 6-2"/></svg>',
  torte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M2.5 17.5h19M3.5 17.5 5 20h14l1.5-2.5"/><path d="M5.5 17.5V8.5c0-2 1.5-3.5 3.5-3.5h6c2 0 3.5 1.5 3.5 3.5v9"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
  crop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/></svg>',
  mask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="5"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v18H3z" stroke-dasharray="3 3"/><path d="M8 8h8v8H8z"/></svg>',
  fx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7Z"/></svg>',
  recolor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1-.8-1.4-.8-2.3 0-.9.7-1.7 1.7-1.7H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/></svg>',
  grad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 15 15 3M9 21 21 9"/></svg>',
  arc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17a11 11 0 0 1 18 0"/><path d="M7 20l-1-3M17 20l1-3"/></svg>',
  wrap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h10a4 4 0 0 1 4 4v10"/><path d="M14 18l3 3 3-3"/></svg>',
  blend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>',
  opacity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/></svg>',
  tile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.5"/></svg>',
  lidOpen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16v9H4z"/><path d="M4 11 8 4h12l-4 7"/></svg>',
  dieline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5z"/></svg>',
  sticker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-8-8h8v8Z"/><path d="M20 12h-5a3 3 0 0 1-3-3V4"/></svg>',
  row: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="5" height="8" rx="1"/><rect x="9.5" y="8" width="5" height="8" rx="1"/><rect x="17" y="8" width="5" height="8" rx="1"/></svg>',
  tissueX: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18v9H3z"/><path d="M5 10l2-6 3 4 2-5 2 5 3-4 2 6"/></svg>',
  ribbonX: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9c-2-4-7-5-7-1.5S10 11 12 9Zm0 0c2-4 7-5 7-1.5S14 11 12 9Z"/><path d="m11 10-3 9 2.5-1.5L12 20m1-10 3 9-2.5-1.5"/></svg>',
  sleeveX: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="12" rx="1"/><path d="M9 7v12M15 7v12"/></svg>',
  carryX: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V12h14v8"/><path d="M9 12V7a3 3 0 0 1 6 0v5"/></svg>',
  noColor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M6.5 17.5 17.5 6.5"/></svg>',
  picker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 7 3 3"/><path d="M5 19l1.5-1.5L16.6 7.4a2.1 2.1 0 0 1 3 3L9.5 20.5 8 22l-3-3Z" transform="translate(0 -2)"/></svg>',
  flipH: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 6 3 18h6Z"/><path d="M15 6l6 12h-6Z"/></svg>',
  flipV: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18" stroke-dasharray="2 2"/><path d="M6 9 18 3v6Z"/><path d="M6 15l12 6v-6Z"/></svg>',
  rotL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>',
  rotR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
  focus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="3"/></svg>',
  textT: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
  shapes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="11" height="11" rx="1"/><circle cx="15.5" cy="15.5" r="5.5"/></svg>',
  caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m7 10 5 5 5-5"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
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
/* the metal of a foil (its colour seen straight on; what it shines with comes from what it reflects); holo is silver
   with a rainbow that changes with the angle */
const FOIL_METAL = { 'foil-gold': ['#f6dc8e', '#e7c262'], 'foil-silver': ['#f3f5f8', '#dde1e7'], 'foil-copper': ['#f4b48e', '#dc8f63'], 'foil-holo': ['#eef1f5', '#dfe4ea'] };
/* spot UV varnish: how high it stands (bump grey) and how soft its edge is (blur, × the usual) */
const UV_THICK = { normal: { label: 'Обычный', bump: '#b8b8b8', blur: 1 }, thin: { label: 'Тонкий', bump: '#9c9c9c', blur: .7 }, thick: { label: 'Толстый (3D-лак)', bump: '#ffffff', blur: 2.6 } };
const isFoil = e => e && e.startsWith('foil');
const BLENDS = { 'source-over': 'Обычное', multiply: 'Умножение', screen: 'Осветление', overlay: 'Перекрытие' };
const PRESETS = [
  { id: 'window', label: 'Коробка с окном', type: 'box', dims: { w: 200, h: 50, d: 150 }, finish: 'matte', edge: '#e9e5dc', thick: .8, board: '#f4f1e9', window: { on: true, w: 136, d: 127, h: 23, r: 6 } },
  { id: 'flap150', label: 'С клапаном 150×90×70', type: 'box', dims: { w: 150, h: 70, d: 90 }, finish: 'matte', edge: '#b88d5c', thick: .6, board: '#c39460', grain: .45, lid: { type: 'flap', flapH: 24 } },
  { id: 'flapwin', label: 'С клапаном и окном 230×140×60', type: 'box', dims: { w: 230, h: 60, d: 140 }, finish: 'matte', edge: '#b88d5c', thick: .6, board: '#c39460', grain: .45, lid: { type: 'flap', flapH: 20 }, window: { on: true, place: 'lid', w: 150, d: 80, h: 12, r: 8, off: 0, corners: 'round' } },
  { id: 'flap230', label: 'С клапаном 230×140×60', type: 'box', dims: { w: 230, h: 60, d: 140 }, finish: 'matte', edge: '#b88d5c', thick: .6, board: '#c39460', grain: .45, lid: { type: 'flap', flapH: 20 } },
  { id: 'mailer', label: 'Почтовая коробка (мейлер)', type: 'box', dims: { w: 260, h: 80, d: 170 }, finish: 'matte', edge: '#cdb08a', thick: 1.5, flute: 'E', lid: { type: 'tuck', flapH: 45 } },
  { id: 'lidbase', label: 'Крышка-дно', type: 'box', dims: { w: 220, h: 90, d: 160 }, finish: 'soft', edge: '#e2ddd4', thick: 1.5, lid: { type: 'telescope', lidH: 45 } },
  { id: 'shipping', label: 'Гофрокороб', type: 'box', dims: { w: 400, h: 300, d: 300 }, finish: 'kraft', edge: '#a87f50', thick: 4, flute: 'C' },
  { id: 'product', label: 'Коробка для продукта', type: 'box', dims: { w: 70, h: 180, d: 70 }, finish: 'gloss', edge: '#ece8e0', thick: .6 },
  { id: 'cake', label: 'Коробка для торта, белая', type: 'box', dims: { w: 220, h: 45, d: 220 }, finish: 'matte', edge: '#ece8e0', thick: .8, wallT: 6, board: '#f7f5f0', lid: { type: 'telescope', lidH: 120, mat: 'clear', fit: 'inside' } },
  { id: 'cakeKraft', label: 'Коробка для торта, крафт', type: 'box', dims: { w: 220, h: 45, d: 220 }, finish: 'matte', edge: '#b88d5c', thick: .8, wallT: 6, board: '#c39460', grain: .45, whiteInside: false, lid: { type: 'telescope', lidH: 120, mat: 'clear', fit: 'inside' } },
  { id: 'gift', label: 'Подарочная коробка', type: 'box', dims: { w: 200, h: 120, d: 200 }, finish: 'soft', edge: '#e2ddd4', thick: 1.5, lid: { type: 'telescope', lidH: 40 } },
  { id: 'cakeHandle', label: 'Коробка для торта с ручкой 216×216×146', type: 'box', dims: { w: 216, h: 146, d: 216 }, finish: 'matte', edge: '#ece8e0', thick: .8, board: '#f7f5f0', lid: { type: 'handle' }, window: { on: true, place: 'lid', w: 130, d: 130, h: 20, r: 65, off: 0, corners: 'round' }, handle: { shape: 'arch', w: 120, h: 62 } },
  { id: 'cakeHandleKraft', label: 'Коробка для торта с ручкой 300×300×190, крафт', type: 'box', dims: { w: 300, h: 190, d: 300 }, finish: 'matte', edge: '#b88d5c', thick: 1.2, board: '#c39460', grain: .45, whiteInside: true, lid: { type: 'handle' }, window: { on: true, place: 'lid', w: 200, d: 170, h: 20, r: 10, off: 0, corners: 'round' }, handle: { shape: 'rect', w: 120, h: 60 } },
  { id: 'cakeHandleFront', label: 'Коробка для торта с ручкой и окном спереди 200×200×190', type: 'box', dims: { w: 200, h: 190, d: 200 }, finish: 'matte', edge: '#ece8e0', thick: .8, board: '#f7f5f0', lid: { type: 'handle' }, window: { on: true, place: 'lid', w: 150, d: 150, h: 20, r: 6, off: 0, corners: 'round' }, handle: { shape: 'photo', w: 130, h: 75, bridge: 26 }, frontWin: { on: true, w: 140, h: 110, y: 100, r: 3 } },
  { id: 'mailerSleeve', label: 'Мейлер крафт с рукавом', type: 'box', dims: { w: 260, h: 90, d: 190 }, finish: 'kraft', edge: '#a87f50', thick: 1.5, flute: 'E', lid: { type: 'tuck', flapH: 45 }, sleeve: { axis: 'x', w: 170, bg: '#d32f2f', fin: 'matte' } },
  { id: 'boxBand', label: 'Коробка крафт с узкой бандеролью', type: 'box', dims: { w: 260, h: 110, d: 200 }, finish: 'kraft', edge: '#a87f50', thick: 1.5, lid: { type: 'telescope', lidH: 50 }, sleeve: { axis: 'z', w: 55, x: 30, bg: '#2a2a2a', fin: 'soft' } },
  { id: 'cakeSleeveHandle', label: 'Коробка для торта крафт с рукавом-ручкой', type: 'box', dims: { w: 260, h: 140, d: 260 }, finish: 'kraft', edge: '#a87f50', thick: 1.5, lid: { type: 'telescope', lidH: 70 }, sleeve: { axis: 'x', w: 120, bg: '#f2a9b4', fin: 'matte', handle: { on: true, h: 80, r: 22, rf: 14, hole: { w: 70, h: 22, y: 44, r: 11 } } } },
  { id: 'matchbox', label: 'Коробка-пенал: лоток в рукаве', type: 'box', dims: { w: 180, h: 50, d: 120 }, finish: 'matte', edge: '#e2ddd4', thick: 1, board: '#f4f1e9', lid: { type: 'none' }, sleeve: { axis: 'x', w: 182, bg: '#1f3b57', fin: 'soft' } },
  { id: 'tray', label: 'Лоток без крышки', type: 'box', dims: { w: 240, h: 60, d: 160 }, finish: 'kraft', edge: '#a87f50', thick: 1.5, lid: { type: 'none' } },
  { id: 'flat', label: 'Плоская (пицца, одежда)', type: 'box', dims: { w: 330, h: 45, d: 330 }, finish: 'kraft', edge: '#a87f50', thick: 3, flute: 'B' },
  { id: 'tube', label: 'Тубус', type: 'tube', dims: { w: 80, h: 200, d: 80 }, finish: 'matte', edge: '#cdb08a' },
  { id: 'can', label: 'Низкая банка', type: 'tube', dims: { w: 100, h: 60, d: 100 }, finish: 'metal', edge: '#cccccc' },
  // paper cups: w = rim diameter, d = bottom diameter, h = height
  { id: 'cup250', label: 'Бумажный стакан 250 мл', type: 'cup', dims: { w: 80, h: 92, d: 54 }, finish: 'matte', edge: '#ece8e0', thick: .4, board: '#f7f5f0', grain: .1 },
  { id: 'cup350', label: 'Бумажный стакан 350 мл', type: 'cup', dims: { w: 90, h: 110, d: 60 }, finish: 'matte', edge: '#ece8e0', thick: .4, board: '#f7f5f0', grain: .1 },
  { id: 'cup450', label: 'Бумажный стакан 450 мл', type: 'cup', dims: { w: 90, h: 130, d: 60 }, finish: 'matte', edge: '#ece8e0', thick: .4, board: '#f7f5f0', grain: .1 },
  // bags: w = width, h = height, d = gusset depth (flat-bottom bag) or content thickness (flat bag)
  { id: 'paperBagKraft', label: 'Бумажный пакет с ручками 240×140×320, крафт', type: 'paperbag', dims: { w: 240, h: 320, d: 140 }, finish: 'matte', edge: '#b88d5c', thick: .1, board: '#c39460', grain: .45, whiteInside: false },
  { id: 'paperBagWhite', label: 'Бумажный пакет с ручками 320×120×400, белый', type: 'paperbag', dims: { w: 320, h: 400, d: 120 }, finish: 'matte', edge: '#f2f0ea', thick: .1, board: '#ffffff', grain: .1, whiteInside: true },
  { id: 'bagFlat', label: 'Пакет плоский 140×140 с клапаном', type: 'bag', dims: { w: 140, h: 140, d: 12 }, finish: 'matte', edge: '#ffffff', thick: .05, board: '#ffffff', grain: 0, bag: { style: 'flat', top: 'flap', mat: 'frosty', flapH: 35 } },
  { id: 'bagFlatClear', label: 'Пакет плоский прозрачный 100×150', type: 'bag', dims: { w: 100, h: 150, d: 10 }, finish: 'matte', edge: '#ffffff', thick: .05, board: '#ffffff', grain: 0, bag: { style: 'flat', top: 'flap', mat: 'clear', flapH: 30 } },
  { id: 'bagBlock', label: 'Пакет с плоским дном 90×60×230', type: 'bag', dims: { w: 90, h: 230, d: 60 }, finish: 'matte', edge: '#ffffff', thick: .05, board: '#ffffff', grain: 0, bag: { style: 'block', top: 'fold', turns: 2, mat: 'frosty', flapH: 16 } },
  { id: 'bagKraft', label: 'Крафт-пакет с дном и экстендером', type: 'bag', dims: { w: 90, h: 230, d: 60 }, finish: 'matte', edge: '#c39460', thick: .1, board: '#c39460', grain: .45, bag: { style: 'block', top: 'fold', turns: 2, mat: 'kraft', flapH: 16, ext: true } },
  { id: 'bagBaguette', label: 'Пакет для багета 100×450, открытый', type: 'bag', dims: { w: 100, h: 450, d: 34 }, finish: 'matte', edge: '#c39460', thick: .1, board: '#c39460', grain: .45, bag: { style: 'flat', top: 'open', mat: 'kraft', flapH: 20, prodW: .62, prodY: 110 } },
  { id: 'bagWindow', label: 'Крафт-пакет с окном 90×60×230', type: 'bag', dims: { w: 90, h: 230, d: 60 }, finish: 'matte', edge: '#c39460', thick: .1, board: '#e8d3b4', grain: .35, bag: { style: 'block', top: 'fold', turns: 2, mat: 'kraft', flapH: 16, win: { on: true, w: 46, h: 80, cy: 75, corners: 'round', r: 6 } } },
  // tray with a clear domed lid: w × d = tray size at the rim, h = total height with the lid
  { id: 'dome145', label: 'Лоток с крышкой-призмой 145×145×90, крафт', type: 'dome', dims: { w: 145, h: 90, d: 145 }, finish: 'matte', edge: '#b88d5c', thick: .6, board: '#c39460', grain: .45, whiteInside: false, dome: { trayH: 40, botK: .66, flange: 8, top: .66, cr: 12 } },
  { id: 'dome110', label: 'Лоток с крышкой-призмой 110×110×90, крафт', type: 'dome', dims: { w: 110, h: 90, d: 110 }, finish: 'matte', edge: '#b88d5c', thick: .6, board: '#c39460', grain: .45, whiteInside: false, dome: { trayH: 40, botK: .68, flange: 6, top: .5, cr: 10 } },
  { id: 'dome145w', label: 'Лоток с крышкой-призмой 145×145×90, белый', type: 'dome', dims: { w: 145, h: 90, d: 145 }, finish: 'matte', edge: '#ece8e0', thick: .6, board: '#f7f5f0', grain: .1, whiteInside: true, dome: { trayH: 40, botK: .66, flange: 8, top: .66, cr: 12 } },
  // cake containers: w = base diameter, h = total height; the lid diameter and the base height are their own settings
  { id: 'torte207', label: 'Тортница T-207, ⌀237×110', type: 'torte', dims: { w: 237, h: 110, d: 237 }, finish: 'matte', edge: '#ffffff', thick: .3, board: '#ffffff', grain: 0, torte: { lidD: 208, baseH: 18, lidR: 12, color: '#b8893a', fin: 'metal' } },
  { id: 'torte18', label: 'Тортница T-18, ⌀180×103', type: 'torte', dims: { w: 180, h: 103, d: 180 }, finish: 'matte', edge: '#ffffff', thick: .3, board: '#ffffff', grain: 0, torte: { lidD: 158, baseH: 15, lidR: 10, color: '#b8893a', fin: 'metal' } },
  { id: 'torte207Carry', label: 'Тортница T-207 в рукаве-переноске', type: 'torte', dims: { w: 237, h: 110, d: 237 }, finish: 'matte', edge: '#ffffff', thick: .3, board: '#ffffff', grain: 0, torte: { lidD: 208, baseH: 18, lidR: 12, color: '#f4f4f1', fin: 'gloss' }, carry: { fin: 'matte' } },
  { id: 'torte18Carry', label: 'Тортница T-18 в рукаве-шалаше, крафт', type: 'torte', dims: { w: 180, h: 103, d: 180 }, finish: 'matte', edge: '#ffffff', thick: .3, board: '#ffffff', grain: 0, torte: { lidD: 158, baseH: 15, lidR: 10, color: '#b8893a', fin: 'metal' }, carry: { fin: 'kraft', style: 'tent', spread: 60, w: 110, h: 80, hole: { w: 70, h: 24, y: 42, r: 12 }, cut: { on: true, w: 70, h: 14, y: 12, r: 3 } } },
  // cake boards: w × d = the board (a round one: w is its diameter), h = the board's thickness; cb: shape, covering, edge, tab, cake
  { id: 'cbRound300Gold', label: 'Подложка под торт ⌀300, золото', type: 'board', dims: { w: 300, h: 3, d: 300 }, finish: 'gloss', edge: '#b9b2a6', grain: 0, cb: { shape: 'round', cover: 'foil-gold', wrap: true, bottom: 'raw', cake: { h: 85 } } },
  { id: 'cbScallop260Silver', label: 'Подложка ⌀260 с волнистым краем, серебро', type: 'board', dims: { w: 260, h: 2, d: 260 }, finish: 'gloss', edge: '#b9b2a6', grain: 0, cb: { shape: 'round', cover: 'foil-silver', edge: 'scallop', wrap: false, bottom: 'raw', cake: { h: 75 } } },
  { id: 'cbRect300Gold', label: 'Подложка 300×400, золото', type: 'board', dims: { w: 400, h: 3, d: 300 }, finish: 'gloss', edge: '#b9b2a6', grain: 0, cb: { shape: 'rect', r: 6, cover: 'foil-gold', wrap: true, bottom: 'raw', cake: { h: 65 } } },
  { id: 'cbPrint240', label: 'Подложка ⌀240 с печатью, глянец', type: 'board', dims: { w: 240, h: 3, d: 240 }, finish: 'gloss', edge: '#b9b2a6', grain: .05, cb: { shape: 'round', cover: 'print', wrap: true, bottom: 'raw', cake: { h: 75 } } },
  { id: 'cbDrum300Silver', label: 'Драм-доска ⌀300, 12 мм, серебро', type: 'board', dims: { w: 300, h: 12, d: 300 }, finish: 'gloss', edge: '#b9b2a6', grain: 0, cb: { shape: 'round', cover: 'foil-silver', wrap: true, bottom: 'covered', cake: { h: 95 } } },
  { id: 'cbPastryGold', label: 'Подложка под пирожное с язычком, золото', type: 'board', dims: { w: 90, h: 1.5, d: 90 }, finish: 'gloss', edge: '#b9b2a6', grain: 0, cb: { shape: 'round', cover: 'foil-gold', wrap: false, bottom: 'raw', tab: { on: true, w: 34, l: 22 }, cake: { h: 45 } } },
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
const FACE_LABEL = { sleeve: 'Рукав', carry: 'Рукав-переноска', handleFront: 'Ручка: перед', handleBack: 'Ручка: зад', rightTop: 'Правый торец: верх', rightBottom: 'Правый торец: низ', leftTop: 'Левый торец: верх', leftBottom: 'Левый торец: низ', tray: 'Подложка', extFront: 'Экстендер: перед', extBack: 'Экстендер: зад', fold: 'Внутренний борт', flap: 'Клапан', earLeft: 'Ушко левое', earRight: 'Ушко правое', lidFront: 'Крышка: перед', lidBack: 'Крышка: зад', lidLeft: 'Крышка: левый бок', lidRight: 'Крышка: правый бок', front: 'Перед', back: 'Зад', left: 'Левый бок', right: 'Правый бок', top: 'Крышка', bottom: 'Дно', inside: 'Крышка изнутри', insideBottom: 'Дно изнутри', wrap: 'Обечайка' };
const BOARD = [['#f4f1e9', 'Белый'], ['#c39460', 'Крафт'], ['#2e3530', 'Графит'], ['#879c79', 'Шалфей'], ['#d28f84', 'Розовый'], ['#8aacca', 'Голубой']];
const WHITE_INSIDE = '#f8f6ef';
const SWATCHES = ['#ffffff', '#f3ead6', '#1c1b19', '#20392b', '#0a7aa1', '#b8461b', '#e6007e', '#ffe500'];
const LIGHTS = {
  studio: { light: 1.6, az: 38, el: 52, env: .55, shadow: .38, exposure: .85, envMap: 'softbox' },
  day:    { light: 2.2, az: -30, el: 62, env: .42, shadow: .5, exposure: .88, envMap: 'bright' },
  drama:  { light: 3.0, az: 70, el: 24, env: .14, shadow: .62, exposure: .85, envMap: 'contrast' },
  flat:   { light: .7, az: 20, el: 70, env: .95, shadow: .18, exposure: .9, envMap: 'bright' },
};

export { BLENDS, BOARD, EFFECTS, FACE_LABEL, FINISHES, FOIL_METAL, FOILS, UV_THICK, FONTS, ICON, LID_COLORS, LID_TYPES, LID_WALLS, LIGHTS, PET_PRINT, PRESETS, SWATCHES, WHITE_INSIDE, isFoil };
