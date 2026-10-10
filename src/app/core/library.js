// Библиотека ассетов: всё загруженное, один раз по содержимому; хранится в проекте и в браузере
import { loadImage } from './util.js';
import { assets } from './state.js';
import { addAsset } from './assets.js';
import { svgURL, vecOf } from './vector.js';
import { ui } from '../scene/renderer.js';
import { scheduleSave } from './project.js';

/* ---------- asset library ----------
   Every image added while working (layers, stickers, product photos, dielines) is kept here, once per
   content, so it can be placed again on any face, sticker or object. It is saved with the project and,
   when the browser allows, in the browser too, so it is at hand in other projects. */
const library = [];
async function contentHash(url) {
  try { const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(url)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  catch { let h = 0; for (let i = 0; i < url.length; i += 7) h = (h * 31 + url.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(16) + url.length; }
}
const LIB_DB = { name: 'box-studio-3d', store: 'library' };
/* the browser's store: pictures (library) and 3D models (models), each by its content hash */
function libDB() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(LIB_DB.name, 2);
      r.onupgradeneeded = () => { for (const s of ['library', 'models']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'hash' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function libStore(op, val, store = LIB_DB.store) {
  try {
    const db = await libDB();
    return await new Promise((res, rej) => {
      const tx = db.transaction(store, op === 'all' || op === 'get' ? 'readonly' : 'readwrite'), st = tx.objectStore(store);
      const r = op === 'all' ? st.getAll() : op === 'get' ? st.get(val) : op === 'put' ? st.put(val) : st.delete(val);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  } catch { return op === 'all' ? [] : null; }
}
/* add an image (data URL) to the library, or find it there; returns its asset id */
async function libAdd(url, name, aspect, svg = null) {
  const hash = await contentHash(url);
  let it = library.find(x => x.hash === hash);
  if (!it) {
    it = { id: addAsset(url), hash, name: name || 'Изображение', aspect, added: Date.now() };
    library.unshift(it); ui.lib = true;
    if (svg) vecOf[it.id] = addAsset(svgURL(svg));
    libStore('put', { hash, name: it.name, aspect, url, added: it.added, svg: svg ? assets[vecOf[it.id]] : null });
  }
  return it.id;
}
function libRemove(hash) {
  const i = library.findIndex(x => x.hash === hash); if (i < 0) return;
  library.splice(i, 1); libStore('delete', hash); ui.lib = true; scheduleSave();
}
/* images already in a project (older ones had no library) and the browser's library join the panel */
async function libAdopt(ids) {
  for (const id of ids) {
    const url = assets[id]; if (!url || !/^data:image\//.test(url) || library.some(x => x.id === id)) continue;
    const hash = await contentHash(url);
    if (library.some(x => x.hash === hash)) continue;
    const im = await loadImage(url).catch(() => null);
    library.push({ id, hash, name: 'Изображение', aspect: im ? im.naturalWidth / im.naturalHeight : 1, added: Date.now() });
  }
  ui.lib = true;
}
async function libLoadBrowser() {
  const rows = await libStore('all') || [];
  for (const r of rows.sort((a, b) => b.added - a.added)) {
    if (library.some(x => x.hash === r.hash)) continue;
    const id = addAsset(r.url); library.push({ id, hash: r.hash, name: r.name, aspect: r.aspect, added: r.added, browser: true });
    if (r.svg) vecOf[id] = addAsset(r.svg);
  }
  ui.lib = true;
}

export { libAdd, libAdopt, libDB, libLoadBrowser, libRemove, libStore, library };
