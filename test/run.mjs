// Тесты редактора в браузере: npm test (сначала собирается box-studio-3d.html).
// Каждая заготовка строится, получает пломбу, открывается и выгружает шаблон развёртки — без ошибок в консоли.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launch, openEditor, addPreset, download, FIXTURES } from './browser.mjs';

const browser = await launch();
const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)} с)`); }
  catch (e) { results.push([name, false]); console.log(`  ✗ ${name}\n    ${String(e.message || e).split('\n').join('\n    ')}`); }
}

await test('открывается без интернета, пример из трёх объектов', async () => {
  const { ctx, page, errors } = await openEditor(browser, { offline: true });
  assert.equal(await page.evaluate(() => window.__boxStudio.state.objects.length), 3);
  assert.deepEqual(errors, []);
  await ctx.close();
});

const presets = await (async () => { const { ctx, page } = await openEditor(browser); const ids = await page.$$eval('#addPreset option', o => o.map(x => x.value)); await ctx.close(); return ids; })();
await test(`все заготовки (${presets.length}): построение, пломба, открывание, шаблон SVG`, async () => {
  const { ctx, page, errors } = await openEditor(browser);
  for (const id of presets) {
    await addPreset(page, id);
    await page.click('#stSeal');
    const lid = page.locator('input[data-k="lid"]').last();
    if (await lid.count()) { await lid.fill('90'); await lid.dispatchEvent('input'); await page.waitForTimeout(150); await lid.fill('0'); await lid.dispatchEvent('input'); }
    const svg = readFileSync(await (await download(page, '#tplBtn')).path(), 'utf8');
    assert.match(svg, /<svg[\s\S]*<g id="dieline">[\s\S]+<\/g>/, `${id}: пустой шаблон`);
    assert.deepEqual(errors, [], `${id}: ошибки в консоли`);
  }
  await ctx.close();
});

await test('развёртка с дизайном (PNG) и снимок сцены', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  assert.match((await download(page, '#flatBtn')).suggestedFilename(), /\.png$/);
  assert.match((await download(page, '#pngBtn')).suggestedFilename(), /\.png$/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('библиотека: без дублей, на грань, в наклейку, сохраняется в проекте', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  await addPreset(page, 'mailer');
  for (let i = 0; i < 2; i++) {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addImgBtn')]);
    await fc.setFiles(FIXTURES + 'logo.svg'); await page.waitForTimeout(600);
  }
  assert.equal(await page.evaluate(() => window.__boxStudio.library.length), 1, 'один файл дважды — одна запись');
  await page.click('#faceTabs .chip[data-f="top"]'); await page.click('#libSec .it >> nth=0'); await page.waitForTimeout(300);
  await page.hover('#libSec .it >> nth=0'); await page.click('#libSec .it >> nth=0 >> button[data-a="st"]'); await page.waitForTimeout(300);
  const o = await page.evaluate(() => { const S = window.__boxStudio, o = S.state.objects[0]; return { front: o.faces.front.layers.length, top: o.faces.top.layers.length, st: o.stickers.length }; });
  assert.deepEqual(o, { front: 1, top: 1, st: 1 });
  const d = JSON.parse(readFileSync(await (await (async () => { const [x] = await Promise.all([page.waitForEvent('download'), page.click('#saveBtn')]); return x; })()).path(), 'utf8'));
  assert.equal(d.library.length, 1); assert.equal(Object.keys(d.vectors).length, 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('SVG: цвета вектора и перекраска', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  await addPreset(page, 'mailer');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addImgBtn')]);
  await fc.setFiles(FIXTURES + 'logo.svg'); await page.waitForTimeout(800);
  const cols = await page.$$eval('#layerSec [data-vc]', els => els.map(e => e.dataset.vc));
  assert.deepEqual(cols, ['#dc283c', '#145aa0']);
  await page.$eval('#vcAll', el => { el.value = '#ffb000'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(500);
  const rc = await page.evaluate(() => window.__boxStudio.state.objects[0].faces.front.layers.find(l => l.type === 'image').recolor);
  assert.deepEqual(rc, { '#dc283c': '#ffb000', '#145aa0': '#ffb000' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

await browser.close();
const failed = results.filter(r => !r[1]).length;
console.log(failed ? `\n${failed} из ${results.length} тестов не прошли` : `\nВсе ${results.length} тестов прошли`);
process.exit(failed ? 1 : 0);
