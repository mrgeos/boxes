// Общее для тестов: браузер с WebGL без видеокарты и детерминированный Math.random (фактура бумаги
// одинакова при каждом запуске, поэтому снимки можно сравнивать попиксельно).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

export const PAGE = 'file://' + fileURLToPath(new URL('../box-studio-3d.html', import.meta.url));

export async function launch() {
  // Chromium из Playwright (npx playwright install chromium) или указанный в PW_CHROMIUM
  return chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}
export async function openEditor(browser, { offline = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true, offline });
  await ctx.addInitScript(() => {
    let s = 12345; Math.random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    try { localStorage.clear(); indexedDB.deleteDatabase('box-studio-3d'); } catch {}
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|ERR_INTERNET_DISCONNECTED|net::ERR/.test(m.text())) errors.push(m.text()); });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__boxStudio?.state.objects.length > 0, null, { timeout: 30000 });
  return { ctx, page, errors };
}
/* clears the sample scene and adds one object from a preset */
export async function addPreset(page, id) {
  while (await page.locator('#objList .obj').count()) { await page.click('#objList .obj >> nth=0'); await page.click('#delObjBtn'); }
  await page.selectOption('#addPreset', id); await page.click('#addObjBtn'); await page.waitForTimeout(400);
}
export async function download(page, button) {
  await page.click('#exportBtn');
  const [d] = await Promise.all([page.waitForEvent('download'), page.click(button)]);
  return d;
}
