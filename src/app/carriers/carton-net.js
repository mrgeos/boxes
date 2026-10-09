// Развёртка картонной пачки (ECMA): прямая и обратная заправка, дно-автомат, дно-«конверт»
import { clamp } from '../core/util.js';
import { faceMM } from '../core/model.js';
import { cornerTabs, toOrigin } from './box-net.js';

/* the folding-carton styles a box with a tucked lid can be made in; `code` is the style's number in the ECMA catalogue */
const BOX_STYLES = {
  mailer: { label: 'Мейлер, цельная вырубка (FEFCO 0427)', code: 'FEFCO 0427' },
  ste: { label: 'Пачка, прямая заправка (ECMA A20.20.01.01)', code: 'ECMA A20.20.01.01' },
  rte: { label: 'Пачка, обратная заправка (ECMA A20.20.03.01)', code: 'ECMA A20.20.03.01' },
  crash: { label: 'Пачка с дном-автоматом (ECMA A60.20.00.01)', code: 'ECMA A60.20.00.01' },
  snap: { label: 'Пачка с дном-конвертом (ECMA A55.20.01.01)', code: 'ECMA A55.20.01.01' },
};
const isCarton = o => o.type === 'box' && o.lidType === 'tuck' && !!BOX_STYLES[o.style] && o.style !== 'mailer';

/* A folding carton is a tube: the four walls in a row (left, front, right, back, as seen from outside), closed by
   the glue flap on the left wall's free edge. The top is a tuck lid off the back wall's top edge with dust flaps on
   the side walls. The bottom: a second tuck lid, off the back wall (straight tuck) or the front wall (reverse
   tuck); four glued flaps that open flat with the carton (crash lock); or four flaps that lock into one another
   (snap lock). The bottom face is printed on the bottom panel, or on the two large flaps of a crash or snap lock
   bottom: each of them carries the whole face, cut to the flap's outline, so the print lands where the flap lies
   when folded. Dust flaps, tucks and small flaps are not printed */
function cartonNet(o) {
  const { w, h, d } = o.dims, t = clamp(o.thickness, .3, 10), st = o.style, panels = [], tabs = [];
  const L = 0, F = d, R = d + w, B = 2 * d + w;
  const fh = faceMM(o, 'flap')[1], tc = Math.min(fh * .45, w * .15, 8);
  const dh = Math.max(5, Math.min(w / 2 - t, d * .8)), dc = Math.min(dh * .3, d * .25);
  // a flap on a horizontal edge from x0 to x1 at y, out = 1 below it, -1 above; a, b: insets of its far corners
  const flap = (on, x0, x1, y, depth, out, a, b, extra = {}) => tabs.push({ on, label: '', ...extra,
    pts: [[x0, y], [x0 + a, y + out * depth], [x1 - b, y + out * depth], [x1, y]] });
  panels.push({ key: 'left', x: L, y: 0, w: d, h, q: 0 }, { key: 'front', x: F, y: 0, w, h, q: 0 },
    { key: 'right', x: R, y: 0, w: d, h, q: 0 }, { key: 'back', x: B, y: 0, w, h, q: 0 });
  // the glue flap, glued to the inside of the back wall
  const gw = clamp(Math.min(w, d) * .35, 6, 15);
  cornerTabs(tabs, 'left', L, .5, h - .5, -1, gw, Math.min(gw * .6, h * .1));
  // the top: tuck lid, its tuck with cut corners, dust flaps
  panels.push({ key: 'top', x: B, y: -d, w, h: d, q: 2 },
    { key: 'flap', x: B, y: -d - fh, w, h: fh, q: 2, poly: [[B, -d], [B + w, -d], [B + w, -d - fh + tc], [B + w - tc, -d - fh], [B + tc, -d - fh], [B, -d - fh + tc]] });
  flap('left', L, L + d, 0, dh, -1, dc, dc); flap('right', R, R + d, 0, dh, -1, dc, dc);
  if (st === 'ste' || st === 'rte') {
    // the bottom tuck lid: off the back wall like the top (straight tuck) or off the front wall (reverse tuck)
    const x = st === 'ste' ? B : F;
    panels.push({ key: 'bottom', x, y: h, w, h: d, q: st === 'ste' ? 2 : 0 });
    flap('bottom', x, x + w, h + d, fh, 1, tc, tc);
    flap('left', L, L + d, h, dh, 1, dc, dc); flap('right', R, R + d, h, dh, 1, dc, dc);
  } else if (st === 'crash') {
    // crash lock: each side flap has a crease at 45° from its corner by the next wall; the triangle beyond it is
    // glued to the next large flap, so the bottom opens and folds flat with the carton
    const M = d / 2 + Math.min(d * .15, 10), m = Math.max(5, w / 2 - t), g = Math.min(m, d * .9), k = Math.min(M, w) * .3;
    for (const [key, x, q] of [['front', F, 0], ['back', B, 2]]) panels.push({ key: 'bottom', x, y: h, w, h: d, q, joins: [key], ...(key === 'back' ? { nolabel: true } : { ly: h + M / 2 }),
      poly: [[x, h], [x + w, h], [x + w, h + M - k], [x + w - k, h + M], [x, h + M]] });
    for (const [key, x] of [['left', L], ['right', R]]) {
      const c = Math.min(m, d) * .3;
      tabs.push({ on: key, label: '', pts: [[x, h], [x + d, h], [x + d, h + m], [x + c, h + m], [x, h + m - c]],
        creases: [[x + d, h, x + d - g, h + g]], glue: [[x + d, h], [x + d, h + g], [x + d - g, h + g]] });
    }
  } else {
    // snap lock: the side flaps fold in first, then the front flap; the back flap goes over it, its wings under the
    // front flap and the front flap's tongue under the back one
    const m = Math.max(5, Math.min(w / 2 - t, d * .8)), c = m * .3, Lk = Math.min(d * .3, 15), tw = w * .4, a = w / 2 - tw / 2, b = w / 2 + tw / 2, hd = d / 2;
    flap('left', L, L + d, h, m, 1, c, c); flap('right', R, R + d, h, m, 1, c, c);
    const fp = [[0, 0], [w, 0], [w, hd], [b, hd], [b - Lk * .3, hd + Lk], [a + Lk * .3, hd + Lk], [a, hd], [0, hd]];
    const bp = [[0, 0], [w, 0], [w, hd + Lk], [b, hd + Lk], [b, hd], [a, hd], [a, hd + Lk], [0, hd + Lk]];
    panels.push({ key: 'bottom', x: F, y: h, w, h: d, q: 0, joins: ['front'], ly: h + hd / 2, poly: fp.map(([X, Y]) => [F + X, h + Y]) },
      { key: 'bottom', x: B, y: h, w, h: d, q: 2, joins: ['back'], nolabel: true, poly: bp.map(([X, Y]) => [B + w - X, h + Y]) });
  }
  return toOrigin({ v: 2, carton: st, panels, tabs });
}

export { BOX_STYLES, cartonNet, isCarton };
