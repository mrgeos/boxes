// Пример проекта
import { LIGHTS } from './constants.js';
import { state } from './state.js';
import { newImage, newObject, newShape, newText, setBoard } from './model.js';
import { addAsset } from './assets.js';
import { newSticker } from '../stickers/placement.js';

function makeEmblem(color) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = color; x.strokeStyle = color; x.lineWidth = 22;
  x.beginPath(); x.arc(256, 256, 236, 0, Math.PI * 2); x.stroke();
  const tri = (cy, hw, hh) => { x.beginPath(); x.moveTo(256, cy - hh); x.lineTo(256 + hw, cy); x.lineTo(256 - hw, cy); x.closePath(); x.fill(); };
  tri(210, 70, 95); tri(285, 105, 110); tri(365, 140, 120);
  x.fillRect(236, 360, 40, 70);
  x.beginPath(); x.arc(370, 150, 26, 0, Math.PI * 2); x.fill();
  return c.toDataURL('image/png');
}
function sampleProject() {
  const gold = addAsset(makeEmblem('#ffffff')), green = addAsset(makeEmblem('#20392b'));
  const T = (text, o) => Object.assign(newText(text), o);
  const m = newObject('mailer');
  Object.assign(m, { name: 'Пример: мейлер «Север»', finish: 'soft', lid: 24, grain: .1, pos: { x: -60, z: 0 }, rotY: -12 });
  for (const k of ['front', 'back', 'left', 'right', 'top', 'bottom', 'flap']) m.faces[k].bg = '#20392b';
  m.faces.top.layers = [
    Object.assign(newShape('rect'), { w: .93, h: .89, stroke: .006, fill: '#e8d9a8', effect: 'foil-gold' }),
    Object.assign(newImage(gold, 1), { w: .17, y: .3, effect: 'foil-gold' }),
    T('СЕВЕР', { font: 'Unbounded', weight: 900, size: .16, color: '#e8d9a8', y: .6, ls: .22, effect: 'foil-gold' }),
    T('ЧАЙНАЯ МАСТЕРСКАЯ', { font: 'Montserrat', weight: 500, size: .045, color: '#cfe0d2', y: .75, ls: .42 }),
  ];
  m.faces.front.layers = [
    Object.assign(newImage(gold, 1), { w: .09, x: .12, effect: 'foil-gold' }),
    T('СЕВЕР', { font: 'Unbounded', weight: 700, size: .26, color: '#e8d9a8', x: .5, ls: .3, effect: 'foil-gold' }),
  ];
  m.faces.right.layers = [T('чай с северных склонов', { font: 'Caveat', weight: 700, size: .24, color: '#cfe0d2' })];
  m.faces.left.layers = [T('ХРУПКОЕ · ХРАНИТЬ В СУХОМ', { font: 'Montserrat', weight: 700, size: .09, color: '#cfe0d2', ls: .15 })];
  m.faces.back.layers = [T('260 × 170 × 80 мм · картон 450 г/м²', { font: 'Montserrat', weight: 500, size: .1, color: '#cfe0d2' })];
  m.faces.bottom.layers = [T('Собрано вручную в Карелии', { font: 'Montserrat', weight: 500, size: .06, color: '#cfe0d2' })];
  m.faces.inside.bg = '#f3ead6'; m.faces.insideBottom.bg = '#f3ead6';
  m.faces.inside.layers = [
    T('Спасибо, что вы с нами', { font: 'Caveat', weight: 700, size: .15, color: '#20392b', y: .42 }),
    T('Заварите 1 ч. л. на 200 мл воды 90 °C, 4 минуты', { font: 'Montserrat', weight: 500, size: .045, color: '#4e6b58', y: .6 }),
  ];
  m.faces.insideBottom.layers = [Object.assign(newImage(green, 1), { w: .22, effect: 'deboss', opacity: .35 })];
  m.stickers = [newSticker('circle', 'front', { x: .5, y: 0, w: 30, h: 30, fill: '#e8d9a8', finish: 'foil-gold', text: 'С', font: 'Unbounded', weight: 700, textSize: 13, textColor: '#20392b' })];

  const t = newObject('tube');
  Object.assign(t, { name: 'Пример: тубус «Иван-чай»', dims: { w: 80, h: 180, d: 80 }, finish: 'matte', grain: .2, pos: { x: 215, z: 70 }, rotY: 0 });
  t.faces.wrap.bg = '#ece3d2'; t.faces.top.bg = '#20392b'; t.faces.bottom.bg = '#ece3d2';
  t.faces.wrap.layers = [
    Object.assign(newShape('rect'), { w: .46, h: 1.02, fill: '#20392b' }),
    Object.assign(newImage(gold, 1), { w: .11, y: .24, effect: 'foil-gold' }),
    T('ИВАН-ЧАЙ', { font: 'Unbounded', weight: 700, size: .075, color: '#e8d9a8', y: .45, ls: .08 }),
    T('с чабрецом', { font: 'Caveat', weight: 700, size: .09, color: '#cfe0d2', y: .55 }),
    T('75 г', { font: 'Montserrat', weight: 700, size: .045, color: '#cfe0d2', y: .86 }),
    T('СОСТАВ: кипрей узколистный\nферментированный, чабрец', { font: 'Montserrat', weight: 500, size: .035, color: '#20392b', x: .87, y: .5, lh: 1.3 }),
  ];
  t.faces.top.layers = [Object.assign(newImage(gold, 1), { w: .5, effect: 'foil-gold' })];
  const wb = newObject('window');
  Object.assign(wb, { name: 'Пример: коробка с окном', pos: { x: -40, z: 250 }, rotY: 6 });
  setBoard(wb, '#f4f1e9');
  wb.faces.insideBottom.bg = '#f3ead6';
  wb.faces.insideBottom.layers = [Object.assign(newImage(green, 1), { tile: true, w: .14, opacity: .4, rot: 12 })];
  wb.faces.front.layers = [T('ПРЯНИКИ С МОРОШКОЙ', { font: 'Montserrat', weight: 700, size: .17, color: '#20392b', y: .73, ls: .16 })];
  wb.faces.top.layers = [T('СЕВЕР', { font: 'Unbounded', weight: 700, size: .085, color: '#20392b', y: .077, ls: .3, effect: 'foil-gold' })];
  for (const k of ['left', 'right']) wb.faces[k].layers = [T('200 × 150 × 50 мм', { font: 'Montserrat', weight: 500, size: .16, color: '#4e6b58' })];
  return { objects: [wb, m, t], scene: { ...state.scene, ...LIGHTS.studio, preset: 'studio' }, fonts: [] };
}

export { sampleProject };
