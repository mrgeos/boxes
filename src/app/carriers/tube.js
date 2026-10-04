// Тубус / банка
import * as THREE from 'three';
import { S } from '../core/util.js';

function buildTube(o, rt) {
  const R = o.dims.w / 2 * S, H = o.dims.h * S;
  const geo = new THREE.CylinderGeometry(R, R, H, 144, 1, false, Math.PI, Math.PI * 2);
  geo.translate(0, H / 2, 0);
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ny = nor.getY(i);
    if (ny > .5) uv.setXY(i, pos.getX(i) / (2 * R) + .5, -pos.getZ(i) / (2 * R) + .5);
    else if (ny < -.5) uv.setXY(i, pos.getX(i) / (2 * R) + .5, pos.getZ(i) / (2 * R) + .5);
  }
  const m = new THREE.Mesh(geo, [rt.faces.wrap.mat, rt.faces.top.mat, rt.faces.bottom.mat]);
  m.castShadow = m.receiveShadow = true;
  m.userData = { objId: o.id, faces: ['wrap', 'top', 'bottom'] };
  rt.group.add(m);
}

export { buildTube };
