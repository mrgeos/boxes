// Проверка макета к печати: края, безопасная зона, разрешение картинок
import { DEG } from '../core/util.js';
import { assets } from '../core/state.js';
import { faceKeys, faceLabel, faceMM, facePx, loopAxis } from '../core/model.js';
import { getImg } from '../core/assets.js';
import { cropOf } from '../core/mask.js';
import { layerBox } from '../faces/render.js';
import { isStickerKey } from '../stickers/design.js';

/* What a printer would send back: content that runs off the cut (it is not printed), content closer to the edge than
   the safe zone (a cut a hair off takes it), a picture with too few pixels for its printed size. All of it is read
   from the project's data (the layers, their faces' mm and the pictures' pixels), so a script can ask as well. A
   picture or plate that covers the face is the background: it runs to the edge on purpose (into the bleed). */
const SAFE_MM = 3, BLEED_MM = 3, MIN_DPI = 150, CUT_TOL_MM = .5;

/* the corners of a layer's box on its face (px) */
function boxCorners(L, W, H) {
  const [w, h] = layerBox(L, W, H), a = (L.rot || 0) * DEG, c = Math.cos(a), s = Math.sin(a), x = L.x * W, y = L.y * H;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [x + i * w / 2 * c - j * h / 2 * s, y + i * w / 2 * s + j * h / 2 * c]);
}
function isBackdrop(L, W, H) {
  if (L.type === 'text') return false;
  if (L.type === 'image' && L.tile) return true;
  const [w, h] = layerBox(L, W, H);
  return w >= W * .9 && h >= H * .9;
}
/* 'cut' (runs off the face), 'safe' (inside the safe margin), or null, for a layer on face k */
function edgeState(o, k, L) {
  const [W, H] = facePx(o, k), [mw] = faceMM(o, k), ppm = W / mw, ax = loopAxis(o, k);
  if (isBackdrop(L, W, H)) return null;
  const q = boxCorners(L, W, H), xs = q.map(p => p[0]), ys = q.map(p => p[1]);
  const lo = [Math.min(...xs), Math.min(...ys)], hi = [Math.max(...xs), Math.max(...ys)], size = [W, H];
  let safe = false;
  for (let i = 0; i < 2; i++) {
    if ((i === 0 && ax === 'x') || (i === 1 && ax === 'y')) continue;   // a ring has no edge there
    if (lo[i] < -CUT_TOL_MM * ppm || hi[i] > size[i] + CUT_TOL_MM * ppm) return 'cut';
    if (lo[i] < SAFE_MM * ppm || hi[i] > size[i] - SAFE_MM * ppm) safe = true;
  }
  return safe ? 'safe' : null;
}
/* printed resolution of a picture: the pixels of the part shown over its printed width; null where there is none to
   count (a vector, a picture not loaded yet) */
function imageDpi(o, k, L) {
  const im = getImg(L.src); if (!im?.naturalWidth || String(assets[L.src]).startsWith('data:image/svg')) return null;
  const [mw] = faceMM(o, k), widthMM = L.w * mw;
  return widthMM > 0 ? Math.round(im.naturalWidth * cropOf(L).w / (widthMM / 25.4)) : null;
}
const nameOf = L => L.type === 'text' ? `«${(L.text || '').replace(/\s+/g, ' ').trim().slice(0, 22)}»` : L.name || (L.type === 'image' ? 'Картинка' : 'Фигура');
/* the problems of object o on its faces (all that can be printed, or the keys given): [{ face, id, kind, text }] */
function printIssues(o, keys = faceKeys(o)) {
  const out = [];
  for (const k of keys) {
    if (isStickerKey(k) || !o.faces[k]) continue;
    for (const L of o.faces[k].layers) {
      if (!L.visible) continue;
      const where = `${faceLabel(o, k)} · ${nameOf(L)}`, st = edgeState(o, k, L);
      if (st === 'cut') out.push({ face: k, id: L.id, kind: 'cut', text: `${where}: за краем, не напечатается` });
      else if (st === 'safe') out.push({ face: k, id: L.id, kind: 'safe', text: `${where}: ближе ${SAFE_MM} мм к краю` });
      if (L.type === 'image' && !L.tile) { const d = imageDpi(o, k, L); if (d != null && d < MIN_DPI) out.push({ face: k, id: L.id, kind: 'dpi', text: `${where}: ${d} dpi, нужно от ${MIN_DPI}` }); }
    }
  }
  return out;
}

export { BLEED_MM, MIN_DPI, SAFE_MM, boxCorners, imageDpi, printIssues };
