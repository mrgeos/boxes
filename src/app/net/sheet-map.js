// Связь грани и листа развёртки: где панель стоит на листе и как точка грани ложится на лист
import { inv } from '../faces/wrap.js';

/* A face is shown on the sheet by one panel: turned by quarter turns (or any angle) and cut to a part of the face
   (`crop`). A point of the face's picture (u, v, in px) is then at a point of the sheet that is a turn and a shift of
   (u, v) times one scale. `panelFrame` gives that placing for a panel drawn at scale k from the offset (ox, oy)
   (k = 1, 0, 0 for the sheet's own mm); the net editor (net-edit.js) and the sheet layers (core/sheet.js,
   faces/sheet-paint.js) both stand on it, so a layer lands on the sheet exactly where the face's picture does. */

/* the part of the face (px, [x, y, w, h]) a panel shows */
const cropRect = (p, W, H) => p.crop ? [p.crop[0] * W, p.crop[1] * H, (p.crop[2] - p.crop[0]) * W, (p.crop[3] - p.crop[1]) * H] : [0, 0, W, H];
/* S: the part of the face a panel shows, in the face's px. Returns the panel's turn th, its cos/sin, its shown size
   dw × dh and O: where the face's corner (0, 0) lands */
function panelFrame(p, S, k, ox, oy) {
  let th, cx, cy, dw, dh;
  if (p.ang != null) { th = p.ang; cx = ox + p.cx * k; cy = oy + p.cy * k; dw = p.fw * k; dh = p.fh * k; }
  else {
    const q = p.q ?? (p.rot ? 2 : 0); th = q * Math.PI / 2; cx = ox + (p.x + p.w / 2) * k; cy = oy + (p.y + p.h / 2) * k;
    [dw, dh] = q % 2 ? [p.h * k, p.w * k] : [p.w * k, p.h * k];
  }
  const c = Math.cos(th), s = Math.sin(th), rx = (-S[0] / S[2] - .5) * dw, ry = (-S[1] / S[3] - .5) * dh;
  return { th, c, s, dw, dh, O: [cx + rx * c - ry * s, cy + rx * s + ry * c] };
}
/* can a panel carry a face's picture (a fan of a cup's wall is bent, not laid flat) */
const flatPanel = p => !!p && !p.fan && !!p.key;
/* face px → sheet mm, as a canvas matrix [a, b, c, d, e, f], for the face canvas W × H */
function faceToSheet(p, W, H) {
  const S = cropRect(p, W, H), f = panelFrame(p, S, 1, 0, 0), kx = f.dw / S[2], ky = f.dh / S[3];
  return { M: [f.c * kx, f.s * kx, -f.s * ky, f.c * ky, f.O[0], f.O[1]], kx, ky, th: f.th };
}
/* sheet mm → face px */
const sheetToFace = (p, W, H) => inv(faceToSheet(p, W, H).M);

export { cropRect, faceToSheet, flatPanel, panelFrame, sheetToFace };
