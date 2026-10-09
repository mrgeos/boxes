// Ложемент в коробке: картонная площадка с вырубленными ячейками или вкладыш из пены с углублениями
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';
import { RT } from '../scene/renderer.js';
import { invalidate } from '../scene/camera.js';
import { boxInside } from './tissue.js';
import { isShape } from './shapes.js';

/* An insert holds things in place in a box: rows × cols cells, round or rectangular. Of board: a platform at height
   h over the floor, its edges folded down to the floor (the skirts), the cells cut through it (what is put in
   stands on the floor). Of foam: a block filling the box up to h, the cells pockets `depth` deep. The top is the
   face `insert` (printed on board; on foam its colour is the foam's). Seen with the lid open. Lengths mm. */
const INSERT_MAT = { board: 'Картон: площадка с вырубкой', foam: 'Пена (EVA, изолон)' };
const INSERT_CELL = { round: 'Круглые', rect: 'Прямоугольные' };
const insertOn = o => o.type === 'box' && o.lidType !== 'handle' && o.lidType !== 'drawer' && !isShape(o) && !!o.insert?.on;
const defaultInsert = () => ({ on: false, mat: 'board', cell: 'round', rows: 2, cols: 3, h: 0, depth: 0, size: 80 });
/* the plate and its cells: plate w × d at height h over the floor, cells (centres x, z from the middle, front +z),
   each cw × cd (round: a circle of cw), rounded r; the pockets' depth */
function insertDims(o) {
  const T = o.insert, I = boxInside(o), pw = I.A * 2 - 1, pd = I.B * 2 - 1, room = I.top - I.y0;
  const h = clamp(T.h || Math.round(room * .45), 3, Math.max(3, room - 1));
  const cols = clamp(Math.round(T.cols || 1), 1, 12), rows = clamp(Math.round(T.rows || 1), 1, 12);
  const g = clamp(Math.min(pw / cols, pd / rows) * .12, 3, 15), sw = (pw - g) / cols, sd = (pd - g) / rows, k = clamp(T.size ?? 80, 20, 100) / 100;
  let cw = Math.max(2, (sw - g) * k), cd = Math.max(2, (sd - g) * k);
  if (T.cell === 'round') cw = cd = Math.min(cw, cd);
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([-pw / 2 + g / 2 + sw * (c + .5), -pd / 2 + g / 2 + sd * (r + .5)]);
  const depth = T.mat === 'foam' ? clamp(T.depth || Math.round(h * .7), 2, h - 1) : h;
  return { pw, pd, h, y0: I.y0, cells, cw, cd, r: T.cell === 'round' ? cw / 2 : Math.min(cw, cd) * .12, depth, round: T.cell === 'round' };
}
/* a cell's outline (mm, x right, y toward the back), counter-clockwise */
function cellPts(D, [cx, cz]) {
  const pts = [];
  if (D.round) { for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; pts.push([cx + Math.cos(a) * D.r, -cz + Math.sin(a) * D.r]); } return pts; }
  const hw = D.cw / 2, hd = D.cd / 2, r = Math.min(D.r, hw, hd);
  for (const [qx, qy, a0] of [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]])
    for (let i = 0; i <= 6; i++) { const a = (a0 + i * 15) * Math.PI / 180; pts.push([cx + qx * (hw - r) + Math.cos(a) * r, -cz + qy * (hd - r) + Math.sin(a) * r]); }
  return pts;
}
function buildInsert(o, rt) {
  rt.insert = null;
  if (!insertOn(o)) return;
  const D = insertDims(o), foam = o.insert.mat === 'foam', g = new THREE.Group(), P = Math.PI, top = (D.y0 + D.h) * S;
  const mat = rt.faces.insert.mat;
  rt.cellMat ??= new THREE.MeshStandardMaterial({ roughness: .95, side: THREE.DoubleSide });
  rt.cellMat.color.set(foam ? o.faces.insert.bg : rt.innerMat.color);
  // the top with the cells cut out; its picture spread over it as on the face
  const shape = new THREE.Shape([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => new THREE.Vector2(x * D.pw / 2 * S, y * D.pd / 2 * S)));
  for (const c of D.cells) shape.holes.push(new THREE.Path(cellPts(D, c).map(([x, y]) => new THREE.Vector2(x * S, y * S))));
  const geo = new THREE.ShapeGeometry(shape, 12), pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (D.pw * S) + .5, pos.getY(i) / (D.pd * S) + .5);
  const add = (m, p, r) => { m.position.set(...p); m.rotation.set(...r); m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, face: null, ...m.userData }; g.add(m); return m; };
  const plate = add(new THREE.Mesh(geo, mat), [0, top, 0], [-P / 2, 0, 0]); plate.userData.face = 'insert'; plate.userData.noFrame = true;
  // the sides: the board's skirts down to the floor, or the foam's block
  const sideMat = foam ? rt.cellMat : rt.foldMat, hh = D.h * S;
  for (const sz of [-1, 1]) add(new THREE.Mesh(new THREE.PlaneGeometry(D.pw * S, hh), sideMat), [0, top - hh / 2, sz * D.pd / 2 * S], [0, sz > 0 ? 0 : P, 0]);
  for (const sx of [-1, 1]) add(new THREE.Mesh(new THREE.PlaneGeometry(D.pd * S, hh), sideMat), [sx * D.pw / 2 * S, top - hh / 2, 0], [0, sx * P / 2, 0]);
  // the cells: the cut edge of the board, or the pocket's wall and bottom in the foam
  const dep = (foam ? D.depth : Math.min(D.h, clamp(o.thickness, .3, 20) + .2)) * S;
  for (const c of D.cells) {
    const pts = cellPts(D, c), n = pts.length, wp = [], idx = [];
    for (let i = 0; i <= n; i++) { const [x, y] = pts[i % n]; wp.push(x * S, 0, -y * S, x * S, -dep, -y * S); }
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setIndex(idx); wg.computeVertexNormals();
    add(new THREE.Mesh(wg, foam ? rt.cellMat : rt.edgeMat), [0, top, 0], [0, 0, 0]);
    if (foam) {
      const bg = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * S, y * S))), 12);
      add(new THREE.Mesh(bg, rt.cellMat), [0, top - dep, 0], [-P / 2, 0, 0]);
    }
  }
  rt.insert = g; rt.group.add(g);
  applyInsert(o);
}
/* seen with the lid open (or with no lid), unless hidden */
function applyInsert(o) {
  const rt = RT.get(o.id); if (!rt?.insert) return;
  rt.insert.visible = !o.insert.hidden && (o.lidType === 'none' || o.lid > 2);
  invalidate();
}
/* where the filling goes in an insert: a thing per cell, as big as the cell lets it */
function insertSpots(o) {
  const D = insertDims(o), y = o.insert.mat === 'foam' ? D.y0 + D.h - D.depth : D.y0;
  return { spots: D.cells.map(([x, z]) => [x, y, z]), size: Math.min(D.cw, D.cd) * .92 };
}
/* the board insert on the sheet: the platform with the cells cut out, the skirts round it */
function insertPanels(o, x0, y0) {
  if (o.insert.mat === 'foam') return [];
  const D = insertDims(o), x = x0 + D.h, y = y0 + D.h;
  const holes = D.cells.map(c => cellPts(D, c).map(([px, py]) => [x + D.pw / 2 + px, y + D.pd / 2 - py]));
  return [{ key: 'insert', x, y, w: D.pw, h: D.pd, part: true, holes },
    { key: 'fold', fold: true, part: true, joins: ['insert'], x, y: y - D.h, w: D.pw, h: D.h }, { key: 'fold', fold: true, part: true, joins: ['insert'], x, y: y + D.pd, w: D.pw, h: D.h },
    { key: 'fold', fold: true, part: true, joins: ['insert'], x: x0, y, w: D.h, h: D.pd }, { key: 'fold', fold: true, part: true, joins: ['insert'], x: x + D.pw, y, w: D.h, h: D.pd }];
}

export { INSERT_CELL, INSERT_MAT, applyInsert, buildInsert, defaultInsert, insertDims, insertOn, insertPanels, insertSpots };
