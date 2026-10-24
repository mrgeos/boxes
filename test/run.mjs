// Тесты редактора в браузере: npm test (сначала собирается box-studio-3d.html).
// Редактор целиком клиентский, серверной части нет, поэтому оставлены только короткие e2e для критичного:
// открытие, все заготовки без ошибок, сохранение и открытие проекта (в том числе старого и в аккаунте claude.ai),
// выгрузка файлов.
// Только часть тестов: node test/run.mjs заготовки   (по подстроке названия)
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { launch, openEditor, addPreset, download, presetIds } from './browser.mjs';

const browser = await launch();
const results = [];
const only = process.argv[2];
async function test(name, fn) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)} с)`); }
  catch (e) { results.push([name, false]); console.log(`  ✗ ${name}\n    ${String(e.message || e).split('\n').join('\n    ')}`); }
}
/* saves the project through the button and opens it again from the file; returns the saved JSON */
async function saveAndReopen(page, edit = p => p) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.click('#fileBtn').then(() => page.click('#saveBtn'))]);
  const proj = edit(JSON.parse(readFileSync(await d.path(), 'utf8'))), file = (await d.path()) + '-reopen.json';
  writeFileSync(file, JSON.stringify(proj));
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#fileBtn').then(() => page.click('#openBtn'))]); await fc.setFiles(file); await page.waitForTimeout(1200);
  return proj;
}

await test('открывается без интернета, пример из трёх объектов, проект сохраняется и открывается', async () => {
  const { ctx, page, errors } = await openEditor(browser, { offline: true });
  const snap = () => page.evaluate(() => JSON.stringify(window.__boxStudio.state.objects.map(o => ({ type: o.type, dims: o.dims, faces: Object.keys(o.faces) }))));
  assert.equal(await page.evaluate(() => window.__boxStudio.state.objects.length), 3);
  const before = await snap();
  await saveAndReopen(page);
  assert.equal(await snap(), before, 'после сохранения и открытия те же объекты');
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('проект в аккаунте claude.ai: картинки сохраняются и находятся, даже если страница не смогла их прочитать', async () => {
  const { ctx, page, errors } = await openEditor(browser, { cloud: true });
  const body = () => page.evaluate(() => { const S = window.__stub(); return S.docs[Object.keys(S.docs).find(k => k.includes('/bodies/'))]; });
  const uploads = () => page.evaluate(() => window.__stub().uploads);
  const rename = async name => { await page.dblclick('#projName'); await page.keyboard.press('Control+a'); await page.keyboard.type(name); await page.keyboard.press('Enter'); await page.waitForTimeout(4000); };
  const reopen = async () => { await page.reload(); await page.waitForFunction(() => window.__boxStudio?.state.objects.length > 0); await page.waitForTimeout(3000); };
  await rename('Облако');
  const orig = { ...(await body()).assets }, [a, b] = Object.keys(orig), up0 = await uploads();
  assert.ok(a && b, 'картинки примера сохранены');
  // what older versions left in a picture's place: its address as text, and that text wrapped once more
  await page.evaluate(([a, b, oa, ob]) => window.__stubSet(S => {
    const put = t => { const id = (++S.n).toString(16).padStart(32, '0'); S.files[id] = { type: 'text/plain', data: btoa(t) }; return id; };
    const d = S.docs[Object.keys(S.docs).find(k => k.includes('/bodies/'))];
    d.assets[a] = put('/_blob/' + oa); d.assets[b] = put('data:text/plain;base64,' + btoa('/_blob/' + ob));
  }), [a, b, orig[a], orig[b]]);
  await reopen();
  // the project is written again pointing at the pictures (a moment after it opens)
  await page.waitForFunction(([a, oa]) => { const S = window.__stub(); return S.docs[Object.keys(S.docs).find(k => k.includes('/bodies/'))].assets[a] === oa; }, [a, orig[a]], { timeout: 15000 }).catch(() => {});
  assert.deepEqual([(await body()).assets[a], (await body()).assets[b]], [orig[a], orig[b]], 'после открытия проект снова указывает на сами картинки');
  // a picture the page cannot read back stays that same file on save, not its address stored as text
  await page.evaluate(id => window.__stubSet(S => { S.fail = [id]; }), orig[a]);
  await reopen(); await rename('Облако 2');
  assert.equal((await body()).assets[a], orig[a], 'непрочитанная картинка — ссылка на тот же файл');
  assert.equal(await uploads(), up0, 'заглушек в хранилище не появилось');
  assert.deepEqual(errors, []);
  await ctx.close();
});

const presets = only && !'заготовки'.includes(only) ? [] : await (async () => { const { ctx, page } = await openEditor(browser); const ids = await presetIds(page); await ctx.close(); return ids; })();
if (presets.length) await test(`все заготовки (${presets.length}): построение, шаблон SVG и DXF без ошибок`, async () => {
  const { ctx, page, errors } = await openEditor(browser);
  for (const id of presets) {
    await addPreset(page, id);
    const svg = readFileSync(await (await download(page, '#tplBtn')).path(), 'utf8');
    assert.match(svg, /<svg[\s\S]*<g id="dieline">[\s\S]+<\/g>/, `${id}: пустой шаблон`);
    // the DXF is read from that SVG: a line of the cut the reader does not know would be lost without a word (a formed lid has none)
    const dxf = await page.evaluate(() => window.__boxStudio.dielineDXF(window.__boxStudio.state.objects[0], { bleed: 0 }));
    if (/<[^>]*stroke="#00a0e3"(?![^>]*stroke-dasharray)/.test(svg)) assert.match(dxf, /\n(LINE|POLYLINE|CIRCLE)\n8\nCUT\n/, `${id}: в DXF нет линий реза`);
    assert.deepEqual(errors, [], `${id}: ошибки в консоли`);
  }
  await ctx.close();
});

await test('старые проекты открываются: рукав с ручкой переносится, макет развёртки держит прежнюю раскладку', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  // a sleeve saved before the strip started at the handle's top: its design moves along the strip
  await addPreset(page, 'cakeSleeveHandle');
  await saveAndReopen(page, proj => {
    const o = proj.objects[0]; delete o.sleeve.handle.join;
    o.faces.sleeve.layers = [{ id: 'old', type: 'shape', kind: 'rect', w: .5, h: .02, fill: '#0a7aa1', radius: 0, stroke: 0, x: .5, y: .5, rot: 0, opacity: 1, blend: 'source-over', effect: 'none', visible: true }];
    return proj;
  });
  const up = await page.evaluate(() => { const S = window.__boxStudio, o = S.state.objects[0]; return { join: o.sleeve.handle.join, y: o.faces.sleeve.layers[0].y, s0: S.sleeveFold(o) }; });
  assert.equal(up.join, 'ends');
  assert.ok(Math.abs(((.5 - up.s0) + 1) % 1 - up.y) < 1e-9, `слой сдвинут вдоль ленты (${up.y})`);
  // a box with an uploaded design of the whole sheet keeps the sheet it was drawn on
  await addPreset(page, 'flap150');
  await saveAndReopen(page, proj => { delete proj.objects[0].netV; proj.objects[0].dieline = 'old-sheet'; return proj; });
  assert.equal(await page.evaluate(() => window.__boxStudio.state.objects[0].netV), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('выгрузка: развёртка с дизайном (PNG) и снимок сцены', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  assert.match((await download(page, '#flatBtn')).suggestedFilename(), /\.png$/);
  assert.match((await download(page, '#pngBtn')).suggestedFilename(), /\.png$/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await browser.close();
const failed = results.filter(r => !r[1]);
console.log(failed.length ? `\n${failed.length} из ${results.length} тестов не прошли` : `\nВсе ${results.length} тестов прошли`);
process.exit(failed.length ? 1 : 0);
