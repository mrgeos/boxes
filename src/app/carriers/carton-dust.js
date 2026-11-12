// Пылевые клапаны пачки ECMA в 3D: складываются внутрь под крышку, при открытой крышке видны с печатью
import * as THREE from 'three';
import { DEG, S, V2, clamp } from '../core/util.js';
import { wallMM, netLayout } from '../core/model.js';
import { ensureFlaps } from '../faces/flaps.js';
import { RT } from '../scene/renderer.js';
import { invalidate } from '../scene/camera.js';

/* A carton's top dust flaps hang off the tops of the two side walls and fold in under the lid (the bottom ones lie
   between the walls and the solid bottom, so they are not built). The flap is made standing up on the wall's top
   edge (its print side out, like the wall) and turned in by `rt.dust[i].g`: 90° while the lid is shut, leaning
   in less once the lid opens. The picture is the sheet's (faces/flaps.js): each vertex finds its place on the sheet. */
function buildCartonDust(o, rt) {
  const net = netLayout(o), fpic = ensureFlaps(o, rt, net), W = o.dims.w * S, H = o.dims.h * S, D = o.dims.d, WT = wallMM(o) * S, T = Math.max(.2, o.thickness) * S;
  rt.dust = [];
  for (const tab of net.tabs || []) {
    const fp = tab.fp, wall = net.panels.find(p => p.key === tab.on && !p.part);
    if (!fp?.flap || !wall || (tab.on !== 'left' && tab.on !== 'right') || Math.max(...tab.pts.map(v => v[1])) > wall.y + .5) continue;
    const sx = tab.on === 'right' ? 1 : -1;
    // the sheet's point (x, y) ↔ the flap's plane (s along the wall, u up from the wall's top edge)
    const toPlane = ([x, y]) => { const z = sx > 0 ? D / 2 - (x - wall.x) : x - wall.x - D / 2; return V2(-sx * z * S, (wall.y - y) * S); };
    const geo = new THREE.ShapeGeometry(new THREE.Shape(tab.pts.map(toPlane))), pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const s = pos.getX(i) / S, u = pos.getY(i) / S, z = -sx * s;
      uv.setXY(i, (wall.x + (sx > 0 ? D / 2 - z : z + D / 2)) / fpic.W, 1 - (wall.y - u) / fpic.H);
    }
    const g = new THREE.Group(); g.position.set(sx * (W / 2 - WT), H - T, 0); rt.group.add(g);
    const mk = (geometry, mat, z) => { const m = new THREE.Mesh(geometry, mat); m.rotation.y = sx * Math.PI / 2; m.position.x = sx * z; m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, face: null }; g.add(m); };
    mk(geo, fpic.mat, 0);
    // the back of the flap: the board's inside, the same outline wound the other way
    const back = geo.clone(), bn = back.attributes.normal; for (let i = 0; i < bn.count; i++) bn.setZ(i, -1);
    const bi = back.index; if (bi) for (let i = 0; i < bi.count; i += 3) { const t = bi.getX(i + 1); bi.setX(i + 1, bi.getX(i + 2)); bi.setX(i + 2, t); }
    mk(back, rt.innerMat, -T * .5);
    rt.dust.push({ g, sx });
  }
  applyDust(o);
}
/* the flaps at o.lid (0 shut … 125 open) */
function applyDust(o) {
  const rt = RT.get(o.id); if (!rt?.dust) return;
  const a = (90 - 42 * clamp(o.lid / 70, 0, 1)) * DEG;
  for (const { g, sx } of rt.dust) g.rotation.z = sx * a;
  invalidate();
}

export { applyDust, buildCartonDust };
