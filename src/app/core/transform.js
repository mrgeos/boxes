// Масштаб и поворот слоя или наклейки: действия над данными проекта
import { markFace } from '../scene/renderer.js';
import { touchSticker } from '../stickers/placement.js';

/* A print layer (it has a type) lies on face `face` of object o; a sticker (no type) knows its own face.
   Sizes are scaled from `from` (the item's size when the gesture began, see sizeOf), so a gesture never drifts.
   Layers keep their size as fractions of the face (text: its height), stickers in mm. */
const isSticker = it => !it.type;
const sizeOf = it => ({ w: it.w, h: it.h, size: it.size });
function scaleItem(o, face, it, from, s) {
  s = Math.max(.02, s);
  if (isSticker(it)) { it.w = Math.max(2, from.w * s); it.h = Math.max(2, from.h * s); touchSticker(o, it); return; }
  if (it.type === 'text') it.size = from.size * s;
  else if (it.type === 'image') it.w = from.w * s;
  else { it.w = from.w * s; it.h = from.h * s; }
  markFace(o, face);
}
/* turns it to deg degrees (kept within -180…180, to a tenth) */
function rotateItem(o, face, it, deg) {
  let a = ((deg + 180) % 360 + 360) % 360 - 180;
  if (a === -180) a = 180;
  it.rot = Math.round(a * 10) / 10;
  if (isSticker(it)) touchSticker(o, it); else markFace(o, face);
}

export { rotateItem, scaleItem, sizeOf };
