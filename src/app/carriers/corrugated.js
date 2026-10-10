// Гофрокартон как материал коробки: профиль гофры задаёт толщину, на срезах видна волна
import * as THREE from 'three';
import { S } from '../core/util.js';
import { doubleWall } from '../core/model.js';

/* Corrugated board: a fluted medium between two liners. The flute sets the board's thickness; its wave shows on
   every cut edge (the edges are drawn with a texture of the profile, one wave per pitch). Double-wall boards
   (EB, BC) have two flutes with a liner between. t: thickness mm, p: pitch (one wave) mm. */
const FLUTES = {
  F: { label: 'F — микрогофра, 0,8 мм', t: .8, layers: [2.4] },
  E: { label: 'E — 1,5 мм', t: 1.5, layers: [3.4] },
  B: { label: 'B — 3 мм', t: 3, layers: [6.1] },
  C: { label: 'C — 4 мм', t: 4, layers: [7.4] },
  EB: { label: 'EB — двухслойный, 4,5 мм', t: 4.5, layers: [3.4, 6.1] },
  BC: { label: 'BC — двухслойный, 7 мм', t: 7, layers: [6.1, 7.4] },
};
const fluteOf = o => o.type === 'box' && FLUTES[o.flute] ? FLUTES[o.flute] : null;
/* the board becomes corrugated of that flute ('' — plain carton): its thickness follows; single walls stay single */
function setFlute(o, flute) {
  const F = FLUTES[flute], single = !doubleWall(o);
  o.flute = F ? flute : '';
  if (!F) return;
  o.thickness = F.t;
  if (single) o.wallT = F.t;
}
const fluteName = o => fluteOf(o) ? `гофрокартон, профиль ${o.flute}, ${String(FLUTES[o.flute].t).replace('.', ',')} мм` : '';

/* the profile of a cut edge: across the board (v) liner, flute, (liner, flute,) liner; along it (u) one wave of the
   biggest flute. Grey, multiplied by the edge colour. */
const texCache = new Map();
function fluteTex(flute) {
  if (texCache.has(flute)) return texCache.get(flute);
  const F = FLUTES[flute], W = 128, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), n = F.layers.length, liner = H * (n > 1 ? .07 : .1), pBig = Math.max(...F.layers);
  x.fillStyle = '#4a4a4a'; x.fillRect(0, 0, W, H);   // the hollows between the waves
  const band = (H - liner * (n + 1)) / n;
  F.layers.forEach((p, i) => {
    const y0 = liner * (i + 1) + band * i, waves = Math.max(1, Math.round(pBig / p)), lw = Math.max(3, band * .14);
    // the medium: a wave from liner to liner, lit a little more on its crests
    x.strokeStyle = '#e8e8e8'; x.lineWidth = lw; x.beginPath();
    for (let k = 0; k <= W; k += 2) { const y = y0 + band / 2 - Math.cos(k / W * waves * Math.PI * 2) * (band / 2 - lw / 2); k ? x.lineTo(k, y) : x.moveTo(k, y); }
    x.stroke();
  });
  x.fillStyle = '#ffffff';
  for (let i = 0; i <= n; i++) x.fillRect(0, i * (liner + band), W, liner);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  t.userData = { pitch: pBig };
  texCache.set(flute, t);
  return t;
}
/* the cut edges of a corrugated object get the profile: each flat strip (thin across, long along) is mapped one
   wave per pitch along it and the board's thickness across */
function corrugateEdges(o, rt) {
  const F = fluteOf(o);
  rt.edgeMat.map = F ? fluteTex(o.flute) : null; rt.edgeMat.needsUpdate = true;
  if (!F) return;
  const pitch = Math.max(...F.layers), b = new THREE.Box3(), size = new THREE.Vector3();
  rt.group.traverse(m => {
    if (!m.isMesh || m.material !== rt.edgeMat || m.userData.shared) return;
    const g = m.geometry, pos = g.attributes.position, uv = g.attributes.uv; if (!uv) return;
    b.setFromBufferAttribute(pos); b.getSize(size);
    // flat strips only (in their own x / y); the thin side is the board
    if (size.z > 1e-6 * S) return;
    const along = size.x >= size.y ? 0 : 1, thin = (along ? size.x : size.y);
    if (thin <= 0 || thin / S > F.t * 3 + 1) return;
    const lo = [b.min.x, b.min.y];
    for (let i = 0; i < pos.count; i++) {
      const a = [pos.getX(i), pos.getY(i)];
      uv.setXY(i, (a[along] - lo[along]) / S / pitch, (a[1 - along] - lo[1 - along]) / thin);
    }
    uv.needsUpdate = true;
  });
}

export { FLUTES, corrugateEdges, fluteName, fluteOf, setFlute };
