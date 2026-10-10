// «Мои модели»: 3D-модели, загруженные пользователем, — хранятся в браузере и доступны в любом проекте
import { assets } from './state.js';
import { addAsset } from './assets.js';
import { libDB } from './library.js';
import { ui } from '../scene/renderer.js';

/* A model brought in (made light) is kept once, by its content, in the browser's store (IndexedDB, store
   `models`): its card (m:<hash> — name, size, triangles, weight, a small picture) apart from its GLB (g:<hash>),
   so the list is read at start without the models themselves. A model goes into a project (as an asset) when it
   is placed there; a project carries its models, so it opens anywhere, also where the library is empty.
   Projects opened here add their models to the library. */
const myModels = [];   // cards, newest first: { hash, name, size, tris, kb, thumb, added }
const inProject = new Map();   // hash → asset id in this session
async function store(op, key, val) {
  try {
    const db = await libDB();
    return await new Promise((res, rej) => {
      const tx = db.transaction('models', op === 'put' || op === 'delete' ? 'readwrite' : 'readonly'), st = tx.objectStore('models');
      const r = op === 'cards' ? st.getAll(IDBKeyRange.bound('m:', 'm:\uffff')) : op === 'get' ? st.get(key) : op === 'put' ? st.put(val) : st.delete(key);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  } catch { return op === 'cards' ? [] : null; }
}
async function hashOf(s) {
  try { const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 24); }
  catch { let h = 0; for (let i = 0; i < s.length; i += 13) h = (h * 31 + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(16) + s.length; }
}
const myModelRow = hash => store('get', 'g:' + hash);
let loaded = null;
const loadMyModelsDone = () => loaded || loadMyModels();
async function loadMyModels() {
  if (loaded) return loaded;
  loaded = readCards();
  return loaded;
}
async function readCards() {
  const rows = await store('cards') || [];
  myModels.length = 0;
  for (const r of rows.sort((a, b) => b.added - a.added)) myModels.push(r.card);
  ui.lib = true;
}
/* keeps a model (its GLB as a data: URL) in the library, or finds it there; its card */
async function keepModel(url, { name, size, tris, kb }) {
  const hash = await hashOf(url);
  let card = myModels.find(c => c.hash === hash);
  if (!card) {
    card = { hash, name: name || 'Модель', size, tris, kb, thumb: '', added: Date.now() };
    myModels.unshift(card);
    await store('put', null, { hash: 'g:' + hash, url });
    await store('put', null, { hash: 'm:' + hash, card });
    ui.lib = true;
  }
  return card;
}
/* the model of the library in this project: its ref (the GLB becomes an asset of the project once) */
async function useMyModel(hash) {
  const card = myModels.find(c => c.hash === hash); if (!card) throw new Error('Модели нет в библиотеке');
  let id = inProject.get(hash);
  if (!id || !assets[id]) {
    const row = await store('get', 'g:' + hash); if (!row) throw new Error('Модель не найдена в браузере');
    id = addAsset(row.url); inProject.set(hash, id);
  }
  return { ref: { asset: id, name: card.name, my: hash }, card };
}
/* a model's picture, made once it is shown */
async function setModelThumb(hash, thumb) {
  const card = myModels.find(c => c.hash === hash); if (!card || card.thumb) return;
  card.thumb = thumb; await store('put', null, { hash: 'm:' + hash, card }); ui.lib = true;
}
async function removeMyModel(hash) {
  const i = myModels.findIndex(c => c.hash === hash); if (i < 0) return;
  myModels.splice(i, 1); inProject.delete(hash);
  await store('delete', 'g:' + hash); await store('delete', 'm:' + hash); ui.lib = true;
}
/* the models of a project opened here join the library (one opened elsewhere brings its models with it) */
async function adoptModels(refs) {
  for (const r of refs) {
    if (!r?.asset || !assets[r.asset]?.startsWith('data:model/')) continue;
    const card = await keepModel(assets[r.asset], { name: r.name || 'Модель', size: 0, tris: 0, kb: Math.round(assets[r.asset].length * .75 / 1024) });
    inProject.set(card.hash, r.asset);
  }
}

export { adoptModels, keepModel, loadMyModels, loadMyModelsDone, myModelRow, myModels, removeMyModel, setModelThumb, useMyModel };
