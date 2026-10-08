// Торт-заглушка: стоит на подложке коробки с ручкой и на подложке под торт
import * as THREE from 'three';
import { S, clamp } from '../core/util.js';

/* A plain cake, while there is no photo of the real one: a sponge, a cream top, cream dollops and berries round
   the edge. Round (R) or a slab (rect: [w, d, corner r]); sizes in mm, y0: what it stands on. It is not a print face
   and is not picked. */
function addCake(parent, o, rt, { R = 0, rect = null, y0 = 0, h = 50 }) {
  rt.cakeMats ??= ['#efdcbc', '#fbf6ee', '#ffffff', '#a51d36'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .7 }));
  const [sponge, cream, dollop, berry] = rt.cakeMats;
  const put = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x * S, y * S, z * S); m.castShadow = m.receiveShadow = true; m.userData = { objId: o.id, face: null }; m.raycast = () => {}; parent.add(m); return m; };
  const blob = (x, z, r, i) => put(new THREE.SphereGeometry(r * S, 16, 12), i % 3 ? dollop : berry, x, y0 + h + r * .55, z);
  if (!rect) {
    put(new THREE.CylinderGeometry(R * S, R * S, h * .82 * S, 72), sponge, 0, y0 + h * .41, 0);
    put(new THREE.CylinderGeometry(R * 1.01 * S, R * 1.01 * S, h * .18 * S, 72), cream, 0, y0 + h * .91, 0);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; blob(Math.cos(a) * R * .8, Math.sin(a) * R * .8, R * .09, i); }
    return;
  }
  // a slab: rounded corners, the same layers, dollops along its edge
  const [w, d, r] = rect, slab = (k, hh, y, mat) => {
    const sh = new THREE.Shape(), rr = Math.min(r, w / 2, d / 2) * k, x0 = -w * k / 2, z0 = -d * k / 2;
    sh.moveTo(x0 + rr, z0); sh.lineTo(-x0 - rr, z0); sh.quadraticCurveTo(-x0, z0, -x0, z0 + rr); sh.lineTo(-x0, -z0 - rr); sh.quadraticCurveTo(-x0, -z0, -x0 - rr, -z0);
    sh.lineTo(x0 + rr, -z0); sh.quadraticCurveTo(x0, -z0, x0, -z0 - rr); sh.lineTo(x0, z0 + rr); sh.quadraticCurveTo(x0, z0, x0 + rr, z0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: hh, bevelEnabled: false, curveSegments: 8 }).scale(S, S, S).rotateX(Math.PI / 2);
    put(g, mat, 0, y + hh, 0);
  };
  slab(1, h * .82, y0, sponge); slab(1.01, h * .18, y0 + h * .82, cream);
  const br = clamp(Math.min(w, d) * .045, 3, 9), nx = Math.max(2, Math.round(w * .84 / (br * 2.6))), nz = Math.max(2, Math.round(d * .84 / (br * 2.6)));
  let i = 0;
  for (let k = 0; k < nx; k++) { const x = (k + .5) / nx * w * .84 - w * .42; blob(x, -d * .38, br, i++); blob(x, d * .38, br, i++); }
  for (let k = 1; k < nz - 1; k++) { const z = (k + .5) / nz * d * .84 - d * .42; blob(-w * .4, z, br, i++); blob(w * .4, z, br, i++); }
}

export { addCake };
