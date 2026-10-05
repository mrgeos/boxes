// Модель объекта: создание, грани, их размеры, развёртка (общая часть и коробка)
import { clamp, uid } from './util.js';
import { FACE_LABEL, LID_COLORS, LID_WALLS, PRESETS, WHITE_INSIDE } from './constants.js';
import { cupFan, cupGeom } from '../carriers/cup.js';
import { BAG_LABEL, EXT_KEYS, applyBagPreset, bagDims, bagFilm, bagNet, defaultBagWin } from '../carriers/bag.js';
import { applyDomePreset, domeGeom, domeNet, domeSide } from '../carriers/dome.js';
import { TORTE_COLORS, applyTortePreset, torteGeom } from '../carriers/torte.js';
import { lidDimsMM, winMM, windowPlace } from '../carriers/box.js';
import { HANDLE_KEYS, HB_END_KEYS, applyHandlePreset, defaultFrontWin, defaultHandle, hbDims, hbNet, hbOpen } from '../carriers/handle-box.js';
import { SLEEVE_GLUE, defaultSleeve, defaultSleeveHandle, sleeveDims, sleeveOn, sleeveSheet } from '../carriers/sleeve.js';

/* printed faces of an object, in tab order; depends on the lid construction */
/* faces that close into a ring (a sleeve glued into a loop, the wall of a tube, a cup or a cake lid): what runs
   past one end of the face goes on at the other. The axis the ring runs along, or null */
function loopAxis(o, k) {
  if (k === 'sleeve') return 'y';
  if ((k === 'wrap' && (o.type === 'tube' || o.type === 'cup')) || (k === 'lidWrap' && o.type === 'torte')) return 'x';
  return null;
}
function faceKeys(o) {
  if (o.type === 'tube') return ['wrap', 'top', 'bottom'];
  if (o.type === 'cup') return ['wrap'];
  if (o.type === 'torte') return ['lidWrap', 'top'];
  if (o.type === 'dome') return ['front', 'right', 'back', 'left', 'top', ...LID_WALLS, 'bottom', 'insideBottom'];
  if (o.type === 'bag') {
    const k = ['front'];
    if (o.bagTop === 'flap') k.push('flap'); else if (o.bagTop === 'fold') k.push('fold');
    if (o.ext?.on) k.push(...EXT_KEYS);
    k.push('back');
    if (o.bagStyle === 'block') k.push('left', 'right', 'bottom');
    return k;
  }
  const lt = o.lidType || 'flat';
  if (lt === 'handle') {
    // handle box: a sleeve; an end that opens has an upper and a lower flap instead of a wall, and the tray inside
    const op = hbOpen(o), k = ['front', 'top'];
    if (o.handle?.on) k.push(...HANDLE_KEYS);
    k.push(...(op.right ? ['rightTop', 'rightBottom'] : ['right']), 'back', ...(op.left ? ['leftTop', 'leftBottom'] : ['left']), 'bottom', 'tray', 'inside', 'insideBottom');
    return k;
  }
  const k = ['front'];
  if (lt !== 'none') k.push('top');
  if (lt === 'flap' || lt === 'tuck') k.push('flap');
  if (lt === 'flap' && o.earsOn) k.push('earLeft', 'earRight');
  if (lt === 'telescope') k.push(...LID_WALLS);
  k.push('right', 'left', 'back', 'bottom');
  if (sleeveOn(o)) k.push('sleeve');
  if (lt !== 'none' && !(lt === 'telescope' && o.lidMat === 'clear')) k.push('inside');
  k.push('insideBottom');
  return k;
}
/* base wall thickness in mm; above the board thickness the wall is a double wall folded in */
const wallMM = o => clamp(Math.max(o.wallT ?? o.thickness, o.thickness), o.thickness, Math.min(o.dims.w, o.dims.d) / 4);
const doubleWall = o => o.type === 'box' && wallMM(o) > o.thickness * 1.6 + .2;
/* a separate lid can be clear PET (cake boxes): its faces carry only print, the rest is plastic */
const clearLid = o => o.type === 'box' && o.lidType === 'telescope' && o.lidMat === 'clear';
const isClearFace = (o, k) => (clearLid(o) && (k === 'top' || LID_WALLS.includes(k))) || (bagFilm(o) && !EXT_KEYS.includes(k)) || (o.type === 'dome' && (k === 'top' || LID_WALLS.includes(k))) || o.type === 'torte';
const outerKeys = o => faceKeys(o).filter(k => k !== 'inside' && k !== 'insideBottom');
const faceLabel = (o, k) => (o.type === 'tube' && k === 'top') ? 'Верх' : (o.type === 'dome' && k === 'top') ? 'Крышка сверху' : (o.type === 'torte' && k === 'top') ? 'Крышка сверху' : k === 'lidWrap' ? 'Крышка: стенка' : (o.type === 'cup' && k === 'wrap') ? 'Стенка стакана' : (o.type === 'bag' && BAG_LABEL[k]) || FACE_LABEL[k];
function ensureFaces(o) {
  o.stickers ??= [];
  if (o.type === 'box') {
    o.lidType ??= 'flat';
    o.flapH ??= Math.round(o.dims.h * .35);
    o.earsOn ??= true; o.earFull ??= true; o.earLen ??= o.dims.d;
    o.lidH ??= Math.round(o.dims.h * .45);
    o.lidMat ??= 'board';
    o.wallT ??= o.thickness;
    o.lidFit ??= 'over';
    o.handle ??= defaultHandle(o.dims);
    o.sleeve ??= defaultSleeve(o.dims);
    o.sleeve.handle ??= defaultSleeveHandle(); o.sleeve.handle.rf ??= 10;
    if (o.handle.rTop == null) applyHandlePreset(o.handle, o.handle.shape || 'arch');   // projects from before adjustable handles
    o.frontWin ??= defaultFrontWin(o.dims);
    if (o.lidType === 'handle') { o.hbSides ??= 'right'; o.tray ??= { out: 0, fin: 'board' }; o.product ??= { src: null, aspect: 1, w: Math.round(o.dims.w * .7), x: 0, y: 0, cake: true }; }
  }
  if (o.type === 'torte') { o.lidD ??= Math.round(o.dims.w * .88); o.baseH ??= Math.round(clamp(o.dims.w * .075, 10, 25)); o.lidR ??= Math.round(o.lidD * .06); o.lidDraft ??= .03; o.baseColor ??= TORTE_COLORS[0][0]; o.baseFin ??= 'metal'; }
  if (o.type === 'dome') { o.trayH ??= Math.round(o.dims.h * .45); o.botK ??= .66; o.flangeW ??= 8; o.domeTop ??= .6; o.cornerR ??= 12; }
  if (o.type === 'cup') { o.cupWall ??= 'double'; o.cupLid ??= true; o.lidColor ??= LID_COLORS[0][0]; }
  if (o.type === 'bag') {
    o.bagStyle ??= 'flat'; o.bagTop ??= 'flap'; o.bagZig ??= true; o.bagOpen ??= .65; o.bagMat ??= 'frosty'; o.flapH ??= 35; o.rollTurns ??= 1; o.shoulder ??= 0;
    o.bagWin ??= defaultBagWin(o.dims);
    o.bagWin.cy ??= (o.bagWin.y ?? Math.round(o.dims.h * .2)) + (o.bagWin.h ?? 0) / 2; o.bagWin.corners ??= 'square'; o.bagWin.r ??= 6;
    o.ext ??= { on: false, h: 40, ov: 18, w: o.dims.w, staples: 2 };
    o.product ??= { src: null, aspect: 1, w: Math.round(o.dims.w * .7), x: 0, y: 6 };
  }
  if (!o.window) o.window = { on: false, w: Math.round(o.dims.w * .68), d: Math.round(o.dims.d * .85), h: Math.round(o.dims.h * .46), r: 6 };
  o.window.place ??= 'edge'; o.window.off ??= 0; o.window.corners ??= 'round';
  if (o.whiteInside === undefined) o.whiteInside = true;
  for (const st of o.stickers) if (!faceKeys(o).includes(st.face)) st.face = faceKeys(o)[0];
  for (const k of faceKeys(o)) if (!o.faces[k]) o.faces[k] = { bg: EXT_KEYS.includes(k) || k === 'sleeve' ? '#ffffff' : k.startsWith('inside') ? (o.whiteInside === false && o.board ? o.board : '#f4f1ea') : (o.board || '#ffffff'), layers: [] };
  if (!o.board) o.board = (o.faces.front || o.faces.wrap).bg;
}
function newObject(presetId = 'mailer') {
  const p = PRESETS.find(x => x.id === presetId) || PRESETS[0];
  const o = { id: uid(), name: p.label, type: p.type, dims: { ...p.dims }, lid: 0, thickness: p.thick ?? 2, finish: p.finish, edge: p.edge,
    grain: p.grain ?? (p.finish === 'kraft' ? .55 : .12), dieline: null, pos: { x: 0, z: 0 }, rotY: 0, faces: {},
    board: '#ffffff', whiteInside: p.whiteInside ?? true, window: p.window ? { ...p.window } : null,
    sleeve: p.sleeve ? { ...defaultSleeve(p.dims), ...p.sleeve, handle: { ...defaultSleeveHandle(), ...(p.sleeve.handle || {}) }, on: true } : undefined,
    handle: p.handle ? applyHandlePreset({ ...defaultHandle(p.dims), ...p.handle }, p.handle.shape || 'arch') : undefined,
    frontWin: p.frontWin ? { ...defaultFrontWin(p.dims), ...p.frontWin } : undefined,
    lidType: p.lid?.type ?? 'flat', flapH: p.lid?.flapH, lidH: p.lid?.lidH, lidMat: p.lid?.mat ?? 'board', lidFit: p.lid?.fit ?? 'over', wallT: p.wallT ?? p.thick ?? 2 };
  if (p.bag) applyBagPreset(o, p);
  if (p.dome) applyDomePreset(o, p);
  if (p.torte) applyTortePreset(o, p);
  ensureFaces(o);
  if (p.board) setBoard(o, p.board);
  if (p.sleeve?.bg) o.faces.sleeve.bg = p.sleeve.bg;
  return o;
}
/* unprinted board colour: outer faces take it, the inside stays white unless switched off */
function setBoard(o, c) {
  o.board = c;
  for (const k of outerKeys(o)) if (!(o.type === 'bag' && EXT_KEYS.includes(k)) && k !== 'sleeve') o.faces[k].bg = c;
  for (const k of ['inside', 'insideBottom']) if (o.faces[k]) o.faces[k].bg = o.whiteInside ? WHITE_INSIDE : c;
}
const newText = (text = 'Текст') => ({ id: uid(), type: 'text', text, font: 'Montserrat', weight: 700, italic: false, size: .14, color: '#1c1b19', align: 'center', ls: 0, lh: 1.1, x: .5, y: .5, rot: 0, opacity: 1, blend: 'source-over', effect: 'none', visible: true });
const newImage = (src, aspect = 1) => ({ id: uid(), type: 'image', src, aspect, w: .5, tile: false, x: .5, y: .5, rot: 0, opacity: 1, blend: 'source-over', effect: 'none', flipX: false, flipY: false, visible: true });
const newShape = (kind = 'rect') => ({ id: uid(), type: 'shape', kind, w: kind === 'ellipse' ? .3 : .5, h: kind === 'ellipse' ? .3 : .22, fill: '#0a7aa1', radius: 0, stroke: 0, x: .5, y: .5, rot: 0, opacity: 1, blend: 'source-over', effect: 'none', visible: true });
/* ---------- face geometry (mm → px) ---------- */
function faceMM(o, k) {
  const { w, h, d } = o.dims;
  if (o.type === 'tube') return k === 'wrap' ? [Math.PI * w, h] : [w, w];
  if (o.type === 'cup') { const G = cupGeom(o); return [G.Wr, G.Hr]; }
  if (o.type === 'torte') {
    const G = torteGeom(o);
    return k === 'top' ? [2 * G.Rt, 2 * G.Rt] : [Math.PI * (G.Rl + G.Rs), Math.hypot(G.Rl - G.Rs, G.yS - G.y1)];
  }
  if (o.type === 'dome') {
    const G = domeGeom(o);
    if (k === 'front' || k === 'back') return [w, G.Lf];
    if (k === 'left' || k === 'right') return [d, G.Ls];
    if (k === 'top') return [2 * G.Af, 2 * G.Bf];
    if (LID_WALLS.includes(k)) { const sd = domeSide(o, k), b = sd.base, lo = sd.pts[b], hi = sd.pts[b + 1]; return [2 * lo.ext, Math.hypot(lo.pos - hi.pos, hi.y - lo.y)]; }
    if (k === 'insideBottom') return [G.wb - 2 * G.T, G.db - 2 * G.T];
    return [G.wb, G.db];
  }
  if (o.type === 'bag') {
    const B = bagDims(o);
    if (k === 'flap' || k === 'fold') return [w, B.fh];
    if (EXT_KEYS.includes(k)) return [B.ew, B.eh];
    if (k === 'left' || k === 'right') return [B.D, B.Hv];
    if (k === 'bottom') return [w, B.D];
    return [w, B.Hv];
  }
  if (k === 'sleeve') { const SD = sleeveDims(o); return [SD.bw, SD.P]; }
  if (k === 'front' || k === 'back') return [w, h];
  if (k === 'left' || k === 'right') return [d, h];
  const tele = o.lidType === 'telescope', inLid = tele && o.lidMat === 'clear' && o.lidFit === 'inside';
  const lw = inLid ? w - 2 * (wallMM(o) + .6) : w + 2 * o.thickness + 1, ld = inLid ? d - 2 * (wallMM(o) + .6) : d + 2 * o.thickness + 1;
  if (HANDLE_KEYS.includes(k)) return [clamp(o.handle?.w ?? 100, 20, w), clamp(o.handle?.h ?? 50, 15, 300)];
  if (o.lidType === 'handle' && HB_END_KEYS.includes(k)) return [d, h / 2];
  if (k === 'tray') { const B = hbDims(o); return [B.trW, B.trD]; }
  if (o.lidType === 'flap' && ['flap', 'earLeft', 'earRight', 'top', 'inside'].includes(k)) {
    const ld = lidDimsMM(o);
    return k === 'flap' ? [ld.wl, ld.fh] : k.startsWith('ear') ? [ld.el, ld.fh] : [ld.wl, ld.dl];
  }
  if (k === 'flap') return [w, clamp(o.flapH, 3, h)];
  const lh = clamp(o.lidH, 3, o.lidMat === 'clear' ? 1000 : h);
  if (k === 'lidFront' || k === 'lidBack') return [lw, lh];
  if (k === 'lidLeft' || k === 'lidRight') return [ld, lh];
  if (tele && (k === 'top' || k === 'inside')) return [lw, ld];
  return [w, d];
}
/* face texture size: every face gets as many pixels as a TEX_MAX square, so long narrow parts (a sleeve,
   a cup wrap, a tall bag) keep the detail per mm of square ones instead of being limited by their long side;
   at most TEX_SIDE on a side (works on every GPU) and 10 px/mm */
const TEX_MAX = 1536, TEX_SIDE = 4096;
function facePx(o, k) {
  const [mw, mh] = faceMM(o, k);
  const s = Math.min(TEX_MAX / Math.sqrt(mw * mh), TEX_SIDE / Math.max(mw, mh), 10);
  return [Math.max(16, Math.round(mw * s)), Math.max(16, Math.round(mh * s)), s];
}
function netLayout(o) {
  const { w, h, d } = o.dims;
  if (o.type === 'tube') {
    const D = w, C = Math.PI * D;
    return { W: C, H: h + 2 * D, panels: [
      { key: 'top', x: C / 2 - D / 2, y: 0, w: D, h: D, circle: true },
      { key: 'wrap', x: 0, y: D, w: C, h },
      { key: 'bottom', x: C / 2 - D / 2, y: D + h, w: D, h: D, circle: true }] };
  }
  if (o.type === 'bag') return bagNet(o);
  if (o.type === 'dome') return domeNet(o);
  if (o.type === 'torte') {
    // print areas of the clear lid: the wall unrolled and the round top above it
    const [C, hw] = faceMM(o, 'lidWrap'), [Dt] = faceMM(o, 'top'), gap = 15, W = Math.max(C, Dt);
    return { W, H: Dt + gap + hw, panels: [{ key: 'top', x: W / 2 - Dt / 2, y: 0, w: Dt, h: Dt, circle: true }, { key: 'lidWrap', x: (W - C) / 2, y: Dt + gap, w: C, h: hw }] };
  }
  if (o.type === 'cup') {
    // the side wall is printed flat as a fan (an annular sector), with a glue overlap on the left
    const G = cupGeom(o), F = cupFan(G);
    return { W: F.W, H: F.H, fan: F, panels: [{ key: 'wrap', x: 0, y: 0, w: F.W, h: F.H, fan: F }] };
  }
  // base as a cross. A flat lid sits above the front panel (so a window can run across the fold).
  // A lid with a flap hangs off the back panel as one piece: lid, flap, and ears beside the flap;
  // that piece is drawn turned 180° (rot), as it lies on the real die.
  const keys = faceKeys(o), lt = o.lidType || 'flat';
  // a window across the hinge needs the lid attached to the back panel too, so the cut is one opening
  if (lt === 'handle') return hbNet(o);
  const backLid = lt === 'flap' || lt === 'tuck' || (lt === 'flat' && !!winMM(o) && windowPlace(o) === 'back');
  const hinged = keys.includes('top') && !backLid && lt !== 'telescope';
  const panels = [];
  let oy = 0, tx = 0, tw = 0, lid = null;
  if (hinged) {
    const [w0, h0] = faceMM(o, 'top'); tw = w0; oy = h0; tx = d + (w - tw) / 2;
    panels.push({ key: 'top', x: tx, y: 0, w: tw, h: h0 });
  } else if (backLid) {
    const [w0, th] = faceMM(o, 'top'), hasFlap = keys.includes('flap'), [fw, fh] = hasFlap ? faceMM(o, 'flap') : [w0, 0];
    const el = keys.includes('earLeft') ? faceMM(o, 'earLeft')[0] : 0;
    tw = w0; tx = 2 * d + w + (w - tw) / 2; oy = th + fh;
    const fx = tx + (tw - fw) / 2;
    panels.push({ key: 'top', x: tx, y: fh, w: tw, h: th, rot: true });
    if (hasFlap) panels.push({ key: 'flap', x: fx, y: 0, w: fw, h: fh, rot: true });
    if (el) panels.push({ key: 'earRight', x: fx - el, y: 0, w: el, h: fh, rot: true }, { key: 'earLeft', x: fx + fw, y: 0, w: el, h: fh, rot: true });
    lid = { th, fx, fw, fh, el, ch: el ? Math.min(fh, el) * .3 : 0 };
  }
  // double walls of a tray fold in at the top: their inner strips sit in a row above the walls
  const folds = !hinged && !backLid && doubleWall(o);
  if (folds) {
    const hf = Math.max(1, h - o.thickness); oy = hf;
    for (const [x, pw] of [[0, d], [d, w], [d + w, d], [2 * d + w, w]]) panels.push({ key: 'fold', x, y: 0, w: pw, h: hf, fold: true });
  }
  panels.push(
    { key: 'left', x: 0, y: oy, w: d, h }, { key: 'front', x: d, y: oy, w, h }, { key: 'right', x: d + w, y: oy, w: d, h },
    { key: 'back', x: 2 * d + w, y: oy, w, h }, { key: 'bottom', x: d, y: oy + h, w, h: d });
  let W = Math.max(...panels.map(p => p.x + p.w)), H = oy + h + d;
  const extra = keys.filter(k => LID_WALLS.includes(k) || (k === 'top' && !hinged && !backLid));
  if (extra.length) {
    const gap = 15, y = H + gap; let x = 0, rowH = 0;
    for (const k of extra) { const [pw, ph] = faceMM(o, k); panels.push({ key: k, x, y, w: pw, h: ph, part: true }); x += pw + gap; rowH = Math.max(rowH, ph); }
    W = Math.max(W, x - gap); H = y + rowH;
  }
  if (sleeveOn(o)) {
    const SD = sleeveDims(o), y = H + 15, sh = sleeveSheet(SD), m = q => q.map(([a, b]) => [a, y + b]);
    panels.push({ key: 'sleeve', x: 0, y, w: SD.bw, h: SD.P, part: true, creases: sh.creases.map(([a, b, c, d]) => [a, y + b, c, y + d]), ...(sh.outline ? { poly: m(sh.outline), holes: sh.holes.map(m) } : {}) },
      { key: 'glue', blank: 'клеевой клапан', x: 0, y: y + SD.P, w: SD.bw, h: SLEEVE_GLUE, part: true, crease: true });
    W = Math.max(W, SD.bw); H = y + SD.P + SLEEVE_GLUE;
  }
  return { W, H, panels, oy, hinged, backLid, tx, tw, lid, folds };
}

export { loopAxis, clearLid, doubleWall, ensureFaces, faceKeys, faceLabel, faceMM, facePx, isClearFace, netLayout, newImage, newObject, newShape, newText, outerKeys, setBoard, wallMM };
