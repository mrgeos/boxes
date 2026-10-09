// Загрузчик 3D-моделей: GLB/glTF, OBJ, FBX, USDZ — читает файл, облегчает модель и отдаёт её редактору (отдельный файл, грузится по требованию)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { USDZLoader } from 'three/addons/loaders/USDZLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

/* The editor keeps a 3D model as one GLB (meshes and their pictures in one file), made light on import:
   - its parts are flattened into plain meshes (their placement baked in), animation and skinning dropped;
   - meshes over the triangle budget are simplified (meshoptimizer): the shape stays, the fine relief is in the
     normal map anyway;
   - its pictures are scaled down to the texture budget and stored as JPEG (PNG where they have transparency);
   - it stands on y = 0, centred on x and z, in its own units; the editor scales it to the size set in mm.
   A file comes alone (.glb, .usdz, .fbx) or with its companions (a .gltf with its .bin and pictures, an .obj with
   its .mtl and pictures): all the files picked are offered to the loader by their names. */
const EXT = f => (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const MAIN = ['glb', 'gltf', 'fbx', 'obj', 'usdz'];
/* reads files picked or dropped: the model, made light; { glb, tris, before, name, size } (size: its box, in its own units) */
async function importFiles(files, { maxTris = 40000, maxTex = 2048 } = {}) {
  files = [...files];
  const main = files.find(f => MAIN.includes(EXT(f)));
  if (!main) throw new Error('Нужен файл модели: GLB, glTF, OBJ, FBX или USDZ');
  // the companion files by name (a .gltf names its .bin and pictures, an .obj its .mtl)
  const urls = new Map(files.map(f => [f.name.toLowerCase(), URL.createObjectURL(f)]));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(u => { const n = decodeURIComponent(u.split(/[\\/]/).pop().split('?')[0]).toLowerCase(); return urls.get(n) || u; });
  let root;
  try { root = await load(main, EXT(main), files, manager); }
  finally { setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 30000); }
  const flat = flatten(root), before = countTris(flat);
  await lighten(flat, maxTris, maxTex);
  const glb = await new GLTFExporter().parseAsync(flat, { binary: true, onlyVisible: true });
  const box = new THREE.Box3().setFromObject(flat), size = box.getSize(new THREE.Vector3());
  return { glb, tris: countTris(flat), before, name: main.name.replace(/\.[^.]+$/, ''), size: [size.x, size.y, size.z] };
}
async function load(file, ext, files, manager) {
  if (ext === 'glb' || ext === 'gltf') {
    const L = new GLTFLoader(manager); L.setMeshoptDecoder(MeshoptDecoder);
    const data = ext === 'glb' ? await file.arrayBuffer() : await file.text();
    try { return (await L.parseAsync(data, '')).scene; }
    catch (e) {
      if (/DRACO/i.test(e.message)) throw new Error('Модель сжата Draco — его пока не читаем. Пересохраните без Draco (в Blender: Export glTF → без Compression) или пришлите GLB со сжатием meshopt');
      if (/KHR_texture_basisu|KTX2/i.test(e.message)) throw new Error('Текстуры в формате KTX2 пока не читаем. Пересохраните модель с JPEG/PNG');
      throw e;
    }
  }
  if (ext === 'obj') {
    const mtlFile = files.find(f => EXT(f) === 'mtl'), L = new OBJLoader(manager);
    if (mtlFile) { const mtl = new MTLLoader(manager).parse(await mtlFile.text(), ''); mtl.preload(); L.setMaterials(mtl); }
    const obj = L.parse(await file.text());
    await new Promise(r => { manager.onLoad = r; setTimeout(r, 4000); });   // its pictures
    return obj;
  }
  if (ext === 'fbx') { const obj = new FBXLoader(manager).parse(await file.arrayBuffer(), ''); await new Promise(r => { manager.onLoad = r; setTimeout(r, 4000); }); return obj; }
  if (ext === 'usdz') return new USDZLoader(manager).parse(await file.arrayBuffer());
  throw new Error('Формат не поддерживается');
}
/* plain meshes, each with its placement baked in, under one group standing on y = 0 in the middle */
function flatten(root) {
  root.updateMatrixWorld(true);
  const out = new THREE.Group(); out.name = 'model';
  root.traverse(m => {
    if (!m.isMesh || !m.visible || !m.geometry?.attributes.position) return;
    const g = m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    g.applyMatrix4(m.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    const mats = (Array.isArray(m.material) ? m.material : [m.material]).map(standard);
    const mesh = new THREE.Mesh(g, mats.length > 1 ? mats : mats[0]); mesh.name = m.name;
    out.add(mesh);
  });
  if (!out.children.length) throw new Error('В файле нет видимых сеток');
  const box = new THREE.Box3().setFromObject(out), c = box.getCenter(new THREE.Vector3());
  for (const m of out.children) m.geometry.translate(-c.x, -box.min.y, -c.z);
  return out;
}
/* a material the exporter writes as glTF PBR: standard and physical as they are, the older kinds turned into one */
function standard(m) {
  if (!m || m.isMeshStandardMaterial) return m || new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: .7 });
  const s = new THREE.MeshStandardMaterial({ name: m.name, color: m.color ?? 0xdddddd, map: m.map || null, normalMap: m.normalMap || null, transparent: m.transparent, opacity: m.opacity ?? 1,
    alphaMap: m.alphaMap || null, side: m.side, roughness: m.shininess != null ? clamp01(1 - Math.sqrt(m.shininess / 100)) : .7, metalness: 0, vertexColors: !!m.vertexColors });
  if (m.emissive) { s.emissive.copy(m.emissive); s.emissiveMap = m.emissiveMap || null; }
  return s;
}
const clamp01 = v => Math.min(1, Math.max(0, v));
const triCount = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
const countTris = root => { let n = 0; root.traverse(m => { if (m.isMesh) n += triCount(m.geometry); }); return Math.round(n); };
/* fits the model into the budget: fewer triangles (each mesh by its share), smaller pictures */
async function lighten(root, maxTris, maxTex) {
  const total = countTris(root);
  if (total > maxTris) {
    await MeshoptSimplifier.ready;
    const k = maxTris / total;
    for (const m of root.children) m.geometry = simplify(m.geometry, Math.max(12, Math.floor(triCount(m.geometry) * k)));
  }
  const seen = new Map();
  root.traverse(m => {
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
      const t = mat[key]; if (!t?.image) continue;
      if (!seen.has(t)) seen.set(t, shrink(t, maxTex, key === 'map' || key === 'alphaMap'));
      mat[key] = seen.get(t);
    }
  });
}
/* fewer triangles, keeping the shape, the UV seams and the normals as far as it can */
function simplify(g, target) {
  let geo = g.index ? g : mergeVertices(g);
  if (!geo.index) return g;
  const pos = geo.attributes.position, P = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i); }
  const uv = geo.attributes.uv, nor = geo.attributes.normal, A = new Float32Array(pos.count * 5);
  for (let i = 0; i < pos.count; i++) { A.set([uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, nor ? nor.getX(i) : 0, nor ? nor.getY(i) : 0, nor ? nor.getZ(i) : 0], i * 5); }
  const idx = new Uint32Array(geo.index.array);
  const [out] = MeshoptSimplifier.simplifyWithAttributes(idx, P, 3, A, 5, [1, 1, .5, .5, .5], null, Math.max(3, target * 3 - (target * 3) % 3), .05, ['Regularize']);
  const r = geo.clone(); r.setIndex(new THREE.BufferAttribute(out, 1));
  return r;
}
/* a picture no larger than max px, as JPEG (PNG if it has transparency) for the exporter */
function shrink(t, max, mayAlpha) {
  const im = t.image, w = im.width || im.videoWidth, h = im.height || im.videoHeight; if (!w || !h) return t;
  const k = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height);
  let alpha = false;
  if (mayAlpha) { const d = x.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) { alpha = true; break; } }
  const n = new THREE.CanvasTexture(c);
  Object.assign(n, { flipY: t.flipY, wrapS: t.wrapS, wrapT: t.wrapT, colorSpace: t.colorSpace, channel: t.channel });
  n.repeat.copy(t.repeat); n.offset.copy(t.offset); n.rotation = t.rotation;
  n.userData.mimeType = alpha ? 'image/png' : 'image/jpeg';
  return n;
}
/* a stored GLB (ArrayBuffer) as a group of meshes, ready to be placed (meshopt-compressed ones too) */
async function parse(glb) {
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await L.parseAsync(glb, '');
  return gltf.scene;
}

window.__bsModels = { importFiles, parse, MAIN };
window.dispatchEvent(new Event('bs-models-ready'));
