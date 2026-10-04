// Картинки проекта: хранение, загрузка, импорт файлов
import { loadImage, readURL, uid } from './util.js';
import { assets, imgCache, state } from './state.js';
import { libAdd } from './library.js';
import { normSvg, svgURL } from './vector.js';
import { RT, markFace, markObj, rebuildQueue, ui } from '../scene/renderer.js';
import { stickerDirty, touchSticker } from '../stickers/placement.js';
import { tintCache } from '../stickers/film.js';

function addAsset(url) { const id = 'a' + uid(); assets[id] = url; return id; }
function getImg(id) {
  if (!id || !assets[id]) return null;
  let im = imgCache[id];
  if (!im) {
    im = new Image();
    im.onload = () => onAssetLoaded(id);
    im.src = assets[id]; imgCache[id] = im;
  }
  return im.complete && im.naturalWidth ? im : null;
}
function onAssetLoaded(id) {
  for (const o of state.objects) {
    if (o.dieline === id) markObj(o);
    for (const k in o.faces) if (o.faces[k].layers.some(l => l.src === id)) markFace(o, k);
    if (o.product?.src === id) rebuildQueue.add(o.id);
    for (const st of o.stickers || []) if (st.src === id) {
      tintCache.forEach((_, key) => key.startsWith(id + '|') && tintCache.delete(key));
      const look = RT.get(o.id)?.stickerLook?.get(st.id); if (look) look.key = '';
      touchSticker(o, st);
    }
    if ((o.stickers || []).some(st => st.text)) stickerDirty.add(o.id);
  }
  ui.layers = true; ui.stickers = true;
}
async function importImageFile(file) {
  let url = await readURL(file);
  // a vector: normalise its colours (so they can be swapped later) and rasterise that version
  const isSvgFile = file.type.includes('svg') || /\.svg$/i.test(file.name || ''), svgSrc = isSvgFile ? normSvg(await file.text()) : null;
  if (svgSrc) url = svgURL(svgSrc);
  const im = await loadImage(url);
  let w = im.naturalWidth || 2048, h = im.naturalHeight || 2048;
  const isSvg = file.type.includes('svg');
  const max = 4096;
  if (isSvg || w > max || h > max) {
    const k = isSvg ? 2048 / Math.max(w, h) : max / Math.max(w, h);
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    url = file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', .92) : c.toDataURL('image/png');
    w = c.width; h = c.height;
  }
  const id = await libAdd(url, (file.name || '').replace(/\.[^.]+$/, '').slice(0, 40), w / h, svgSrc); getImg(id);
  return { id, aspect: w / h };
}

export { addAsset, getImg, importImageFile, onAssetLoaded };
