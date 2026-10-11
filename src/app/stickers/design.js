// Дизайн наклейки слоями: её собственная «грань» (фон и слои, как у граней коробки), форма наклейки — маска
import { clamp } from '../core/util.js';
import { getImg } from '../core/assets.js';
import { newImage, newText } from '../core/model.js';
import { stickerSize } from './placement.js';

/* A sticker's design is a face of its own, as big as the sticker: st.design = { bg, bgGrad?, layers } like
   o.faces[k], edited by the same layer editor and painted by the same code. It is reached as o.faces['st:<id>'] (a
   link that is not saved: the design travels inside the sticker when it is copied, undone or saved). On the model
   the face's picture is cut to the sticker's shape, with the outline and the finish on top (stickers/film.js). */
const stickerKey = st => 'st:' + st.id;
const isStickerKey = k => typeof k === 'string' && k.startsWith('st:');
const stickerOfKey = (o, k) => isStickerKey(k) ? o.stickers?.find(st => 'st:' + st.id === k) || null : null;
/* the object's sticker designs as [key, face], for whatever goes over all the faces' layers */
const stickerFaces = o => (o.stickers || []).filter(st => st.design).map(st => [stickerKey(st), st.design]);
/* the object's faces and its stickers' designs, as [key, face] */
const faceEntries = o => [...Object.entries(o.faces), ...stickerFaces(o)];
const aspectOf = id => { const im = getImg(id); return im ? im.naturalWidth / im.naturalHeight : 1; };
const keep = (L, st) => Object.assign(L, st.recolor ? { recolor: st.recolor } : {}, st.keyout ? { keyout: st.keyout } : {});
/* Stickers made before had fixed fields (colour, a background picture, a logo, one text): they become the same
   picture in layers, once their pictures have loaded (their proportions place them where they were); until then
   the sticker is drawn the old way. False while it has to wait. */
function migrateSticker(st) {
  if (st.design) return true;
  if ([st.src, st.bgSrc].some(id => id && !getImg(id))) return false;
  const [w, h] = stickerSize(st), layers = [], foil = st.finish?.startsWith('foil');
  if (st.kind === 'custom') {
    // the picture gives the shape; on foil only its outline shows (the metal fills it), so it is no layer then
    if (st.src && !foil) layers.push(keep({ ...newImage(st.src, aspectOf(st.src)), w: 1 }, st));
  } else {
    if (st.bgSrc) {
      // the background picture covered the shape, zoomed and moved within it
      const a = aspectOf(st.bgSrc), k = Math.max(1, st.bgScale || 1);
      let bw = w, bh = w / a; if (bh < h) { bh = h; bw = h * a; }
      bw *= k; bh *= k;
      const ox = clamp(st.bgX || 0, -.5, .5) * (bw - w), oy = clamp(st.bgY || 0, -.5, .5) * (bh - h);
      layers.push({ ...newImage(st.bgSrc, a), w: bw / w, x: .5 + ox / w, y: .5 + oy / h });
    }
    if (st.src) {
      // the logo: its share of the sticker, raised over the text when there is some
      const a = aspectOf(st.src), k = st.imgScale || .7;
      let iw = w * k, ih = iw / a; if (ih > h * k) { ih = h * k; iw = ih * a; }
      layers.push(keep({ ...newImage(st.src, a), w: iw / w, y: .5 - (st.text ? st.textSize * .45 : 0) / h }, st));
    }
  }
  if (st.text?.trim()) {
    const under = st.kind !== 'custom' && st.src;
    layers.push({ ...newText(st.text), font: st.font || 'Montserrat', weight: st.weight ?? 700, color: st.textColor || '#1c1b19', size: (st.textSize || 7) / h, y: .5 + (under ? .28 : 0) });
  }
  st.design = { bg: st.fill || '#ffffff', layers };
  return true;
}

export { faceEntries, isStickerKey, migrateSticker, stickerFaces, stickerKey, stickerOfKey };
