// Общее для тестов: браузер с WebGL без видеокарты и детерминированный Math.random (фактура бумаги
// одинакова при каждом запуске, поэтому снимки можно сравнивать попиксельно).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

export const PAGE = 'file://' + fileURLToPath(new URL('../box-studio-3d.html', import.meta.url));

export async function launch() {
  // Chromium из Playwright (npx playwright install chromium) или указанный в PW_CHROMIUM
  return chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}
/* a stand-in for the stores of a claude.ai page (db, user, assets) and its /_blob/ files, kept in sessionStorage over
   reloads; window.__stub() reads it, S.fail lists files that cannot be read */
function claudeStub() {
  const S = JSON.parse(sessionStorage.getItem('stub') || '{"docs":{},"files":{},"n":0,"uploads":0,"fail":[]}');
  const persist = () => sessionStorage.setItem('stub', JSON.stringify(S));
  window.__stub = () => JSON.parse(sessionStorage.getItem('stub'));
  window.__stubSet = f => { const T = window.__stub(); f(T); sessionStorage.setItem('stub', JSON.stringify(T)); };
  const b64 = async blob => { let t = ''; for (const c of new Uint8Array(await blob.arrayBuffer())) t += String.fromCharCode(c); return btoa(t); };
  const doc = path => ({ async get() { const d = S.docs[path]; return { exists: !!d, id: path.split('/').pop(), data: () => d && JSON.parse(JSON.stringify(d)) }; },
    async set(v) { S.docs[path] = JSON.parse(JSON.stringify(v)); persist(); }, async delete() { delete S.docs[path]; persist(); }, collection: n => col(path + '/' + n) });
  const col = path => ({ doc: id => doc(path + '/' + id), orderBy() { return this; }, limit() { return this; },
    async get() { return { docs: Object.keys(S.docs).filter(k => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).map(k => ({ id: k.split('/').pop(), data: () => S.docs[k] })) }; } });
  window.claude = { use: async n => n === 'db' ? { doc } : n === 'user' ? { id: async () => 'u1' }
    : n === 'assets' ? { upload: async blob => { const id = (++S.n).toString(16).padStart(32, '0'); S.files[id] = { type: blob.type, data: await b64(blob) }; S.uploads++; persist(); return { id }; } } : null };
  const f0 = window.fetch;
  window.fetch = async (u, ...r) => {
    const m = /\/_blob\/([0-9a-f]+)$/.exec(String(u)); if (!m) return f0(u, ...r);
    const f = !S.fail.includes(m[1]) && S.files[m[1]]; if (!f) return new Response('', { status: 404 });
    return new Response(Uint8Array.from(atob(f.data), c => c.charCodeAt(0)), { headers: { 'content-type': f.type } });
  };
}
export async function openEditor(browser, { offline = false, cloud = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true, offline });
  if (cloud) await ctx.addInitScript(claudeStub);
  await ctx.addInitScript(() => {
    window.__noThumbs = true;
    let s = 12345; Math.random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    try { localStorage.clear(); indexedDB.deleteDatabase('box-studio-3d'); } catch {}
    // a fixed quality: «Авто» would lower it on this slow software renderer, and pictures would differ between runs
    try { localStorage.setItem('bs3d-quality', 'high'); } catch {}
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|ERR_INTERNET_DISCONNECTED|net::ERR/.test(m.text())) errors.push(m.text()); });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__boxStudio?.state.objects.length > 0, null, { timeout: 30000 });
  await facesPainted(page);
  return { ctx, page, errors };
}
/* the faces are painted a few a frame: waits until none is left (pictures then show the whole design) */
export const facesPainted = page => page.waitForFunction(() => !window.__boxStudio.pendingFaces?.(), null, { timeout: 60000 });
/* the ids of all presets, from the gallery */
export const presetIds = async page => { await page.click('.rail-btn[data-tab="add"]'); return page.$$eval('#galSec .gal-it', a => a.map(x => x.dataset.preset)); };
/* clears the sample scene and adds one object from a preset (through the gallery) */
export async function addPreset(page, id) {
  await page.click('.rail-btn[data-tab="models"]');
  while (await page.locator('#objList .obj').count()) { await page.click('#objList .obj >> nth=0'); await page.keyboard.press('Delete'); }
  await page.click('.rail-btn[data-tab="add"]');
  await page.click(`#galSec .gal-it[data-preset="${id}"]`); await page.waitForTimeout(400); await facesPainted(page);
}
export async function download(page, button) {
  await page.click('#exportBtn');
  const [d] = await Promise.all([page.waitForEvent('download'), page.click(button)]);
  return d;
}
