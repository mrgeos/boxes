// Проекты в аккаунте: «Мои проекты» и автосохранение, когда редактор открыт как страница claude.ai
import { uid } from './util.js';
import { assets, state } from './state.js';
import { loadProject, projectJSON, usedAssets } from './project.js';
import { vecOf } from './vector.js';

/* Opened from claude.ai, the page has a store of its own per viewer (db, under data/users/<id>/, private even from
   the page's owner) and a file store (assets). A project is two documents: its card in profile/projects/<pid>
   (name, time, a small picture) and its body in profile/bodies/<pid> (the project's JSON as a string, without the
   pictures and fonts: those go to the file store once, by their content, and the body maps the project's asset ids
   to the stored ones). Every change is saved a moment later (autosave). Opened as a plain file, none of this exists:
   the project lives in the browser (the autosave in localStorage) and in files, as before. */
const AUTOSAVE_MS = 2500, BODY_MAX = 250 * 1024;
let db = null, files = null, me = null, prof = null;
let pid = null, dirty = false, timer = 0, busy = null, status = 'off', onStatus = () => {};
const LS = 'box-studio-3d/cloud';
const remember = () => { try { localStorage.setItem(LS, JSON.stringify({ pid, dirty })); } catch { /* private mode */ } };
const ref = () => db.doc(`data/users/${me}/profile`);
const cardRef = id => ref().collection('projects').doc(id);
const bodyRef = id => ref().collection('bodies').doc(id);
const cloudOn = () => !!db;
const cloudPid = () => pid;
function setStatus(s) { status = s; onStatus(s); }

/* the page's stores, if it runs in claude.ai with them granted; null otherwise */
async function initCloud(statusCb) {
  onStatus = statusCb || onStatus;
  if (!window.claude?.use) { setStatus('off'); return false; }
  try {
    const [d, u, a] = await Promise.all([window.claude.use('db'), window.claude.use('user'), window.claude.use('assets')]);
    me = d && u ? await u.id() : null;
    if (!d || !me) { setStatus('off'); return false; }
    db = d; files = a;
    const p = await ref().get(); prof = p.exists ? { ...p.data() } : { assetMap: {}, last: null };
    prof.assetMap = { ...(prof.assetMap || {}) };
  } catch { db = null; setStatus('off'); return false; }
  setStatus('off');   // nothing in the account yet: no mark until the first save
  return true;
}
/* what to open on start: the project being worked on here (saved or not yet), else the last one saved */
async function startProject() {
  if (!db) return false;
  let local = {}; try { local = JSON.parse(localStorage.getItem(LS) || '{}'); } catch { /* none */ }
  if (local.pid && local.dirty) { pid = local.pid; dirty = true; saveSoon(0); return true; }   // the browser has newer work: push it
  const last = local.pid || prof.last;
  if (last) { try { await openCloudProject(last); return true; } catch { /* gone: start fresh */ } }
  return false;
}

/* ---------- saving ---------- */
const sha1 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
/* the pictures and fonts `ids` in the file store: { project asset id: stored id } (each picture is stored once, by
   its content) */
async function storeAssets(urls) {
  const map = {};
  for (const [id, url] of Object.entries(urls)) {
    const h = await sha1(url);
    if (!prof.assetMap[h]) {
      if (!files) throw new Error('no file store');
      const blob = await (await fetch(url)).blob();
      prof.assetMap[h] = (await files.upload(blob)).id;
    }
    map[id] = prof.assetMap[h];
  }
  return map;
}
/* the project as it is now, taken at once (the upload that follows may outlive it: another project can be opened) */
function snapshotNow() {
  const d = JSON.parse(projectJSON(false)); delete d.assets;
  const ids = usedAssets(); for (const id of [...ids]) if (vecOf[id]) ids.add(vecOf[id]);
  const urls = {}; for (const id of ids) if (assets[id]) urls[id] = assets[id];
  return { pid, json: JSON.stringify(d), urls, card: { name: state.name, updated: Date.now(), objects: state.objects.length, thumb: thumbFn() || '' } };
}
async function saveNow() {
  if (!db || !pid) return;
  if (busy) { dirty = true; return busy; }
  const snap = snapshotNow();
  dirty = false; setStatus('saving');
  busy = (async () => {
    try {
      if (snap.json.length > BODY_MAX) throw Object.assign(new Error('too big'), { code: 'too_big' });
      const map = await storeAssets(snap.urls);
      await bodyRef(snap.pid).set({ json: snap.json, assets: map });
      await cardRef(snap.pid).set(snap.card);
      prof.last = snap.pid; await ref().set(prof);
      if (snap.pid === pid) setStatus(dirty ? 'pending' : 'saved');
    } catch (e) { if (snap.pid === pid) { dirty = true; setStatus(e.code === 'too_big' ? 'big' : 'error'); } }
    finally { busy = null; remember(); if (dirty && pid && status !== 'big') saveSoon(); }
  })();
  return busy;
}
function saveSoon(ms = AUTOSAVE_MS) { clearTimeout(timer); timer = setTimeout(saveNow, ms); }
/* a change to the project (called from commit): it is saved a moment later; a project not yet in the store gets
   its place there with its first change */
function cloudChanged() {
  if (!db) return;
  if (!pid) pid = uid() + uid();
  dirty = true; remember(); setStatus('pending'); saveSoon();
}
let thumbFn = () => '';
function setThumbSource(fn) { thumbFn = fn; }

/* ---------- the list of projects ---------- */
async function listProjects() {
  if (!db) return [];
  const s = await ref().collection('projects').orderBy('updated', 'desc').limit(200).get();
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
const blobURL = async id => { const b = await (await fetch('/_blob/' + id)).blob(); return new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); };
async function openCloudProject(id) {
  clearTimeout(timer); if (dirty && pid) await saveNow();
  const b = await bodyRef(id).get(); if (!b.exists) throw new Error('missing');
  const { json, assets: map } = b.data(), d = JSON.parse(json);
  d.assets = {};
  await Promise.all(Object.entries(map || {}).map(async ([local, stored]) => { d.assets[local] = await blobURL(stored); }));
  loadProject(d);
  pid = id; dirty = false; remember(); clearTimeout(timer); setStatus('saved');
}
/* the project being worked on starts anew in the store (a new project, a sample, a file opened): what it had
   unsaved goes first (taken now, sent after) */
function detachProject() { clearTimeout(timer); if (dirty && pid) saveNow(); pid = null; dirty = false; remember(); setStatus('off'); }
async function deleteCloudProject(id) {
  await bodyRef(id).delete(); await cardRef(id).delete();
  if (prof.last === id) { prof.last = null; await ref().set(prof); }
  if (pid === id) { pid = null; dirty = false; remember(); }
}
async function duplicateCloudProject(id) {
  const [b, c] = await Promise.all([bodyRef(id).get(), cardRef(id).get()]);
  const nid = uid() + uid(), card = { ...c.data(), name: (c.data().name || 'Проект') + ' (копия)', updated: Date.now() };
  const body = { ...b.data() }, d = JSON.parse(body.json); d.name = card.name; body.json = JSON.stringify(d);
  await bodyRef(nid).set(body); await cardRef(nid).set(card);
  return nid;
}

export { cloudChanged, cloudOn, cloudPid, deleteCloudProject, detachProject, duplicateCloudProject, initCloud, listProjects, openCloudProject, saveNow, setThumbSource, startProject };
