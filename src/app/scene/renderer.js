// Three.js: рендерер, сцена, свет, пол, фактура бумаги; объекты сцены и их материалы
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { $, DEG, S, clamp } from '../core/util.js';
import { FINISHES, LID_COLORS, WHITE_INSIDE } from '../core/constants.js';
import { sel } from '../core/state.js';
import { clearLid, ensureFaces, faceKeys, faceMM, facePx } from '../core/model.js';
import { buildCup } from '../carriers/cup.js';
import { buildBag } from '../carriers/bag.js';
import { buildTube } from '../carriers/tube.js';
import { buildDome, domeGeom } from '../carriers/dome.js';
import { TORTE_COLORS, buildTorte } from '../carriers/torte.js';
import { buildBox } from '../carriers/box.js';
import { buildSleeve, sleeveColors } from '../carriers/sleeve.js';
import { computeFrames } from '../stickers/placement.js';
import { buildStickerFilms } from '../stickers/film.js';
import { camTween, invalidate, orbitLock, updateShadowCam } from './camera.js';

const viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);
viewport.appendChild(renderer.domElement);
const cvs = renderer.domElement;
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const world = new THREE.Group();
 scene.add(world);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 400);
camera.position.set(4, 3, 6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
 controls.dampingFactor = .09;
controls.minDistance = .3;
 controls.maxDistance = 80;
controls.autoRotateSpeed = 1.4;
const hemi = new THREE.HemisphereLight(0xffffff, 0x8d8473, .35);
 scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0004;
 keyLight.shadow.normalBias = 0.02;
 keyLight.shadow.radius = 5;
scene.add(keyLight, keyLight.target);
const fillLight = new THREE.DirectionalLight(0xfff4e6, .45);
 scene.add(fillLight, fillLight.target);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: .38 }));
floor.rotation.x = -Math.PI / 2;
 floor.position.y = -0.001;
 floor.receiveShadow = true;
 scene.add(floor);
/* shared paper grain */
const grainCanvas = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); const d = x.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = 222 + Math.random() * 33; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  x.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const px = Math.random() * 256, py = Math.random() * 256, a = Math.random() * Math.PI, l = 3 + Math.random() * 12;
    x.strokeStyle = `rgba(${Math.random() < .5 ? '90,70,40' : '255,255,255'},${.08 + Math.random() * .16})`;
    x.lineWidth = .5 + Math.random() * .9;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox + Math.cos(a) * l, py + oy + Math.sin(a) * l); x.stroke();
    }
  }
  return c;
})();
const grainTex = new THREE.CanvasTexture(grainCanvas);
grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
/* runtime per object */
const RT = new Map();
const dirtyFaces = new Set();
const rebuildQueue = new Set();
const ui = { editor: true, net: true, layers: false, stickers: false, lib: true };
function markFace(o, k) { dirtyFaces.add(o.id + '|' + k); if (o.id === sel.obj) { ui.editor = true; ui.net = true; } }
function markObj(o) { for (const k of faceKeys(o)) markFace(o, k); }
function ensureFaceRT(o, k) {
  const rt = RT.get(o.id); let f = rt.faces[k];
  const [W, H, ppm] = facePx(o, k);
  if (!f) {
    f = rt.faces[k] = { canvas: document.createElement('canvas'), mat: new THREE.MeshPhysicalMaterial({ shadowSide: THREE.DoubleSide }), flash: 0, sig: '' };
    f.ctx = f.canvas.getContext('2d');
  }
  if (f.canvas.width !== W || f.canvas.height !== H) {
    f.canvas.width = W; f.canvas.height = H;
    if (f.tex) f.tex.dispose();
    f.tex = new THREE.CanvasTexture(f.canvas);
    f.tex.colorSpace = THREE.SRGBColorSpace; f.tex.anisotropy = maxAniso;
    f.mat.map = f.tex;
    for (const n of ['fx', 'bump']) if (f[n]) { f[n + 'Tex'].dispose(); f[n] = null; }
    f.mat.needsUpdate = true;
  }
  const [mw, mh] = faceMM(o, k);
  if (!f.grain) { f.grain = grainTex.clone(); }
  f.grain.repeat.set(mw / 45, mh / 45);
  f.ppm = ppm;
  return f;
}
function aux(f, n) {
  const W = Math.max(8, f.canvas.width >> 1), H = Math.max(8, f.canvas.height >> 1);
  if (!f[n]) { f[n] = document.createElement('canvas'); f[n].width = W; f[n].height = H; f[n + 'Ctx'] = f[n].getContext('2d'); f[n + 'Tex'] = new THREE.CanvasTexture(f[n]); f[n + 'Tex'].anisotropy = maxAniso; }
  return f[n];
}
function buildObject(o) {
  invalidate();
  ensureFaces(o);
  let rt = RT.get(o.id);
  if (!rt) {
    rt = { group: new THREE.Group(), faces: {},
      edgeMat: new THREE.MeshStandardMaterial({ roughness: .92, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }),
      petMat: makePetMaterial(),
      foldMat: new THREE.MeshStandardMaterial({ roughness: .88, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }),
      petEdgeMat: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85, depthWrite: false }),
      filmMat: new THREE.MeshPhysicalMaterial({ color: 0xf2f8f8, transparent: true, opacity: .22, roughness: .04, metalness: 0, clearcoat: 1, clearcoatRoughness: .02, side: THREE.DoubleSide, depthWrite: false }),
      innerMat: new THREE.MeshStandardMaterial({ roughness: .9, shadowSide: THREE.DoubleSide }),
      cupLidMat: new THREE.MeshPhysicalMaterial({ roughness: .38, clearcoat: .35, clearcoatRoughness: .22, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }),
      tapeMat: new THREE.MeshStandardMaterial({ color: 0xe4edf1, roughness: .3, transparent: true, opacity: .9, side: THREE.DoubleSide }),
      cardMat: new THREE.MeshStandardMaterial({ roughness: .85, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }),
      metalMat: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 1, roughness: .32 }),
      productMat: new THREE.MeshStandardMaterial({ roughness: .85, alphaTest: .35, side: THREE.DoubleSide }),
      holeMat: new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), lidPivot: null };
    RT.set(o.id, rt); world.add(rt.group);
  }
  rt.group.traverse(m => { if (m.isMesh || m.isLine) m.geometry.dispose(); });
  rt.group.clear(); rt.lidPivot = null; rt.hb = null; rt.sleeve = null; rt.lidGroup = null; rt.domeLid = null; rt.torteLid = null; rt.cupLid = null; rt.bagPivot = null; rt.bagFrames = null; rt.bagTape = null;
  rt.innerMat.side = o.type === 'cup' || o.type === 'dome' ? THREE.DoubleSide : o.type === 'bag' ? THREE.BackSide : THREE.FrontSide; rt.innerMat.needsUpdate = true;
  for (const k of faceKeys(o)) ensureFaceRT(o, k);
  if (o.type === 'box') buildBox(o, rt); else if (o.type === 'cup') buildCup(o, rt); else if (o.type === 'dome') buildDome(o, rt); else if (o.type === 'torte') buildTorte(o, rt); else if (o.type === 'bag') buildBag(o, rt); else buildTube(o, rt);
  applyTransform(o); computeFrames(o, rt); buildSleeve(o, rt); applyLid(o); applyObjMaterials(o); markObj(o);
  rt.stickerMeshes = []; buildStickerFilms(o);
}
function disposeObject(id) {
  invalidate();
  const rt = RT.get(id); if (!rt) return;
  rt.group.traverse(m => { if (m.isMesh || m.isLine) m.geometry.dispose(); });
  world.remove(rt.group);
  for (const k in rt.faces) { const f = rt.faces[k]; f.mat.dispose(); f.tex?.dispose(); f.fxTex?.dispose(); f.bumpTex?.dispose(); f.grain?.dispose(); }
  for (const L of rt.stickerLook?.values() || []) { L.tex.dispose(); L.edgeTex.dispose(); L.art.dispose(); L.edges.forEach(e => e.dispose()); }
  rt.edgeMat.dispose(); rt.innerMat.dispose(); rt.filmMat.dispose(); rt.petMat.dispose(); rt.petEdgeMat.dispose(); rt.foldMat.dispose(); rt.cupLidMat.dispose(); rt.holeMat.dispose();
  rt.tapeMat.dispose(); rt.cardMat.dispose(); rt.metalMat.dispose(); rt.productMat.dispose(); rt.productTex?.dispose(); rt.baseMat?.dispose(); rt.trayMat?.dispose(); rt.cakeMats?.forEach(m => m.dispose()); rt.sleeveIn?.dispose(); rt.sleeveEdge?.dispose(); RT.delete(id);
}
/* clear PET: black diffuse, so only reflections remain (stronger at grazing angles). The shader turns
   their brightness into coverage, so plain plastic stays see-through even over the page background
   (the canvas is transparent) and highlights still read as light on top. */
function makePetMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: .06, ior: 1.57, specularIntensity: 1,
    transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float petHaze = 0.045;
      vec3 petLight = gl_FragColor.rgb + vec3(petHaze);
      float petA = clamp(max(max(petLight.r, petLight.g), petLight.b), 0.0, 1.0);
      gl_FragColor = vec4(petLight / max(petA, 1e-3), petA);`);
  };
  m.customProgramCacheKey = () => 'pet-v1';
  return m;
}
const contactMat = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(.3, 'rgba(0,0,0,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 4, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
})();
function applyTransform(o) {
  invalidate();
  const rt = RT.get(o.id); if (!rt) return;
  const before = rt.group.position.clone();
  rt.group.position.set(o.pos.x * S, 0, o.pos.z * S); rt.group.rotation.y = o.rotY * DEG;
  // keep orbiting the selected object while it is being moved
  if (rt.placed && orbitLock && o.id === sel.obj && !camTween) { const d = rt.group.position.clone().sub(before); camera.position.add(d); controls.target.add(d); }
  rt.placed = true;
  updateShadowCam();
}
function applyLid(o) {
  invalidate();
  const rt = RT.get(o.id); if (!rt) return;
  if (rt.bagPivot) rt.bagPivot.rotation.x = -clamp(o.lid, 0, 180) * DEG;
  if (rt.bagTape) rt.bagTape.visible = o.lid > 1;
  if (rt.cupLid) {
    // the cup lid lifts off and tilts back
    const f = clamp(o.lid / 125, 0, 1);
    rt.cupLid.position.set(0, (o.dims.h + f * (o.dims.h * .12 + 22)) * S, -f * o.dims.w * .55 * S);
    rt.cupLid.rotation.x = -f * .45;
  }
  if (rt.torteLid) {
    // the lid lifts out of the channel, slides back a little and tilts
    const f = clamp(o.lid / 125, 0, 1);
    rt.torteLid.position.set(0, f * (o.dims.h * .55 + 25) * S, -f * o.dims.w * .22 * S); rt.torteLid.rotation.x = -f * .3;
  }
  if (rt.domeLid) {
    // the lid lifts off, slides back a little and tilts
    const f = clamp(o.lid / 125, 0, 1), G = domeGeom(o);
    rt.domeLid.position.set(0, (G.trayH + f * (G.hd + 25)) * S, -f * G.d * .18 * S); rt.domeLid.rotation.x = -f * .32;
  }
  if (rt.hb) {
    // handle box end: the upper flap swings up, the lower one down onto the table, then the dust flaps open
    const f = clamp(o.lid / 125, 0, 1), a = clamp(f / .6, 0, 1), b = clamp((f - .5) / .5, 0, 1), T = clamp(o.thickness, .3, 40) * S;
    for (const { u, l, sx } of rt.hb.flaps) { u.rotation.z = sx * a * 150 * DEG; l.rotation.z = -sx * a * 90 * DEG; }
    for (const { g: d, sx, zs } of rt.hb.dust) d.rotation.y = -sx * zs * b * 90 * DEG;
    // the tongue is tucked through the slot (behind the lower flap) while closed, straight once open
    for (const { m, sx, y } of rt.hb.tongues) { m.position.set(a > .02 ? 0 : -sx * 1.6 * T, y, 0); }
    if (rt.hb.tray) rt.hb.tray.position.x = rt.hb.dir * clamp(o.tray?.out ?? 0, 0, o.dims.w) * S;
  }
  if (rt.lidPivot) rt.lidPivot.rotation.x = -o.lid * DEG;
  for (const m of rt.contact || []) m.visible = o.lid < 1.5;
  if (rt.lidGroup) {
    // the separate lid lifts, slides back a little and tilts
    const f = clamp(o.lid / 125, 0, 1), H = o.dims.h * S, LH = clamp(o.lidH, 3, clearLid(o) ? 1000 : o.dims.h) * S;
    rt.lidGroup.position.set(0, (rt.lidBase ?? H) + f * (Math.min(LH, (rt.lidBase ?? H)) + H * .35 + .3), -f * o.dims.d * S * .18);
    rt.lidGroup.rotation.x = -f * .32;
  }
}
function applyObjMaterials(o) {
  invalidate();
  const rt = RT.get(o.id); if (!rt) return;
  rt.edgeMat.color.set(o.edge);
  const inner = new THREE.Color(o.type === 'bag' ? (o.whiteInside ? WHITE_INSIDE : o.board) : o.type === 'dome' ? o.faces.insideBottom?.bg || '#f4f1ea' : o.faces.inside?.bg || '#f4f1ea');
  if (FINISHES[o.finish]?.kraft) inner.multiply(new THREE.Color(FINISHES[o.finish].kraft));
  rt.innerMat.color.copy(inner);
  const fold = new THREE.Color(o.faces.front?.bg || o.board || '#ffffff');
  if (FINISHES[o.finish]?.kraft) fold.multiply(new THREE.Color(FINISHES[o.finish].kraft));
  rt.foldMat.color.copy(fold);
  rt.cupLidMat.color.set(o.lidColor || LID_COLORS[0][0]);
  if (rt.sleeve) sleeveColors(o, rt);
  if (rt.trayMat) { const gold = o.tray?.fin === 'gold'; rt.trayMat.color.set(gold ? '#d6b25e' : '#c9cdd3'); rt.trayMat.metalness = .9; rt.trayMat.roughness = .3; }
  if (rt.baseMat) {
    const metal = o.baseFin === 'metal';
    Object.assign(rt.baseMat, { metalness: metal ? .85 : 0, roughness: metal ? .32 : .22, clearcoat: metal ? .3 : .8, clearcoatRoughness: .08 });
    rt.baseMat.color.set(o.baseColor || TORTE_COLORS[0][0]);
  }
  rt.cardMat.color.set(o.faces.extFront?.bg || '#ffffff');
  rt.foldMat.bumpMap = o.grain > 0 ? rt.faces.front?.grain ?? null : null; rt.foldMat.bumpScale = o.grain * 1.2; rt.foldMat.needsUpdate = true;
  rt.innerMat.bumpMap = o.grain > 0 ? rt.faces.inside?.grain ?? null : null;
  rt.innerMat.bumpScale = o.grain * 1.2; rt.innerMat.needsUpdate = true;
}

export { RT, applyLid, applyObjMaterials, applyTransform, aux, buildObject, camera, contactMat, controls, cvs, dirtyFaces, disposeObject, ensureFaceRT, fillLight, floor, grainCanvas, keyLight, markFace, markObj, maxAniso, rebuildQueue, renderer, scene, ui, viewport, world };
