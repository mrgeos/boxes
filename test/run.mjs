// Тесты редактора в браузере: npm test (сначала собирается box-studio-3d.html).
// Каждая заготовка строится, получает пломбу, открывается и выгружает шаблон развёртки — без ошибок в консоли.
// Только часть тестов: node test/run.mjs библиотека   (по подстроке названия)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launch, openEditor, addPreset, download, FIXTURES } from './browser.mjs';

const browser = await launch();
const results = [];
const only = process.argv[2];
async function test(name, fn) {
  if (only && !name.includes(only)) return;
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

await test('сцена рисуется только при изменениях', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  const frames = () => page.evaluate(() => window.__boxStudio.renderer.info.render.frame);
  let f0 = -1; for (let f = await frames(); f !== f0; f = await frames()) { f0 = f; await page.waitForTimeout(800); }   // wait until it settles
  await page.waitForTimeout(1000);
  assert.equal(await frames(), f0, 'в покое сцена не перерисовывается');
  const shot = () => page.locator('#viewport').screenshot();
  const before = await shot();
  await page.$eval('#faceBg', el => { el.value = '#ff0000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(800);
  assert.ok(await frames() > f0, 'после правки сцена перерисована');
  assert.ok(!before.equals(await shot()), 'новый цвет грани виден в 3D');
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('группы: ряд с отступом, порядок, перетаскивание, разгруппировать, сохранение', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  const B = fn => page.evaluate(fn);
  // footprints of the objects on the floor in the scene, mm, in list order of the group
  const feet = () => B(() => {
    const S = window.__boxStudio, ids = S.state.groups[0]?.items ?? S.state.tree;
    return ids.map(id => { const rt = S.RT.get(id), f = rt.foot, b = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
      for (const [x, z] of [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]]) { const v = rt.group.localToWorld(new S.THREE.Vector3(x * .01, 0, z * .01)); b.x0 = Math.min(b.x0, v.x * 100); b.x1 = Math.max(b.x1, v.x * 100); b.z0 = Math.min(b.z0, v.z * 100); b.z1 = Math.max(b.z1, v.z * 100); }
      return b; });
  });
  const gaps = f => f.slice(1).map((b, i) => +(b.x0 - f[i].x1).toFixed(1));
  const places = () => B(() => window.__boxStudio.state.objects.map(o => { const p = window.__boxStudio.RT.get(o.id).group.position; return [+(p.x * 100).toFixed(1), +(p.z * 100).toFixed(1)]; }));

  // the tube alone: dragged by its floor ring
  await page.click('#orbitLockBtn'); await page.evaluate(() => window.__boxStudio.setView('top', true)); await page.waitForTimeout(600);
  await page.click('#objList .obj >> nth=2'); await page.waitForTimeout(600);
  const ring = await B(() => { const S = window.__boxStudio, o = S.state.objects[2], rt = S.RT.get(o.id), v = new S.THREE.Vector3((rt.foot.x1 + 12) * .01, 0, 0); rt.group.localToWorld(v).project(S.camera); const r = S.renderer.domElement.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; });
  const before = (await places())[2];
  await page.mouse.move(...ring); await page.waitForTimeout(300); await page.mouse.down(); await page.mouse.move(ring[0] + 60, ring[1], { steps: 4 }); await page.mouse.up();
  assert.ok((await places())[2][0] > before[0] + 10, 'объект сдвинут за кольцо на полу');

  await page.click('#objList .obj >> nth=0'); await page.click('#objList .obj >> nth=2', { modifiers: ['Shift'] }); await page.click('#groupBtn');
  assert.deepEqual(await B(() => [window.__boxStudio.state.tree.length, window.__boxStudio.state.groups[0].items.length]), [1, 3], 'три объекта в одной группе');
  for (const g of gaps(await feet())) assert.ok(Math.abs(g - 20) < .5, `отступ 20 мм, а не ${g}`);
  const setField = async (k, v) => { const el = page.locator(`#modelSec [data-k="${k}"]`).last(); await el.fill(String(v)); await el.dispatchEvent('input'); await el.dispatchEvent('change'); };
  await setField('gap', 50);
  for (const g of gaps(await feet())) assert.ok(Math.abs(g - 50) < .5, `отступ 50 мм, а не ${g}`);
  await page.selectOption('#modelSec [data-k="align"]', 'start');
  const z0 = (await feet()).map(b => b.z0); assert.ok(Math.max(...z0) - Math.min(...z0) < .5, 'выровнены по заднему краю');

  // drag the first row onto the bottom half of the last one: the order of the row follows the list
  const first = await B(() => window.__boxStudio.state.groups[0].items[0]);
  const last = page.locator('#objList .obj >> nth=3'), lb = await last.boundingBox();
  await page.locator('#objList .obj >> nth=1').dragTo(last, { targetPosition: { x: 20, y: lb.height - 3 } });
  assert.equal(await B(() => window.__boxStudio.state.groups[0].items.at(-1)), first, 'перетащенный объект встал в конец ряда');
  for (const g of gaps(await feet())) assert.ok(Math.abs(g - 50) < .5, `после перестановки отступ 50 мм, а не ${g}`);

  const grouped = await places();
  await page.click('#objList .obj >> nth=0'); await page.click('#ungroupBtn');
  assert.deepEqual(await B(() => [window.__boxStudio.state.groups.length, window.__boxStudio.state.tree.length]), [0, 3]);
  assert.deepEqual(await places(), grouped, 'после разгруппировки объекты стоят на местах');
  await page.click('#undoBtn');
  assert.equal(await B(() => window.__boxStudio.state.groups.length), 1, 'Ctrl+Z возвращает группу');
  const d = JSON.parse(readFileSync(await (await (async () => { const [x] = await Promise.all([page.waitForEvent('download'), page.click('#saveBtn')]); return x; })()).path(), 'utf8'));
  assert.equal(d.groups.length, 1); assert.equal(d.groups[0].gap, 50); assert.equal(d.tree.length, 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('контекстное меню: объект, слой, пустое место, список, группа', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  const B = fn => page.evaluate(fn);
  // a point of object i on screen: local (x, y, z) in mm, or the centre of its box
  const at = (i, p = null) => page.evaluate(([i, p]) => {
    const S = window.__boxStudio, rt = S.RT.get(S.state.objects[i].id), v = new S.THREE.Vector3();
    if (p) rt.group.localToWorld(v.set(p[0] * .01, p[1] * .01, p[2] * .01)); else new S.THREE.Box3().setFromObject(rt.group).getCenter(v);
    v.project(S.camera); const r = S.renderer.domElement.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  }, [i, p]);
  const menu = async () => (await page.locator('.ctx').allInnerTexts()).join(' | ');
  await page.waitForTimeout(600);

  const rot = await B(() => window.__boxStudio.state.objects[1].rotY);
  await page.mouse.click(...await at(1), { button: 'right' });
  assert.match(await menu(), /Повернуть на 90° влево/);
  await page.click('.ctx-it:has-text("Повернуть на 90° влево")');
  assert.equal(await B(() => window.__boxStudio.state.objects[1].rotY), rot + 90, 'поворот из меню');
  assert.equal(await page.locator('.ctx').count(), 0, 'меню закрылось');

  // the box's front: its text layer is in the menu as a submenu
  const box = await B(() => { const o = window.__boxStudio.state.objects[0], f = window.__boxStudio.RT.get(o.id).foot; return [o.faces.front.layers.length, f.z1, o.dims.h]; });
  const [fx, fy] = await at(0, [0, box[2] * .3, box[1] - .5]);
  await page.mouse.click(fx, fy, { button: 'right' });
  await page.hover('.ctx-it:has-text("Слой:")'); await page.click('.ctx >> nth=1 >> .ctx-it:has-text("Удалить")');
  assert.equal(await B(() => window.__boxStudio.state.objects[0].faces.front.layers.length), box[0] - 1, 'слой удалён из меню');

  // empty floor: a new object stands where the menu was opened
  const n = await B(() => window.__boxStudio.state.objects.length);
  await page.mouse.click(320, 160, { button: 'right' });
  assert.match(await menu(), /Добавить объект/);
  await page.hover('.ctx-it:has-text("Добавить объект")'); await page.hover('.ctx-it:has-text("Тубусы и банки")'); await page.click('.ctx-it:has-text("Низкая банка")');
  assert.equal(await B(() => window.__boxStudio.state.objects.length), n + 1);
  // dragging with the right button moves the view and opens nothing
  await page.mouse.move(700, 500); await page.mouse.down({ button: 'right' }); await page.mouse.move(790, 520, { steps: 5 }); await page.mouse.up({ button: 'right' });
  assert.equal(await page.locator('.ctx').count(), 0, 'протягивание правой кнопкой не открывает меню');

  // the list: two rows picked → group them, then the group's direction from its own menu, by keyboard
  await page.click('#objList .obj >> nth=0'); await page.click('#objList .obj >> nth=1', { modifiers: ['Shift'] });
  await page.click('#objList .obj >> nth=1', { button: 'right' });
  assert.match(await menu(), /Выделено: 2/);
  await page.click('.ctx-it:has-text("Сгруппировать")');
  assert.equal(await B(() => window.__boxStudio.state.groups.length), 1);
  await page.click('#objList .obj >> nth=0', { button: 'right' });
  await page.hover('.ctx-it:has-text("Направление ряда")'); await page.click('.ctx-it:has-text("Сзади вперёд")');
  assert.equal(await B(() => window.__boxStudio.state.groups[0].dir), 'z');
  await page.click('#objList .obj >> nth=0', { button: 'right' }); await page.keyboard.press('Escape');
  assert.equal(await page.locator('.ctx').count(), 0, 'Esc закрывает меню');
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('слой через ребро: печать на соседней грани, перенос мышью, закрытые края', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  // pixels of the plate's colour on each face
  const plate = () => page.evaluate(() => { const S = window.__boxStudio, rt = S.RT.get(S.state.objects[0].id), out = {};
    for (const k in rt.faces) { const c = rt.faces[k].canvas, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 10) < 30 && Math.abs(d[i + 1] - 122) < 30 && Math.abs(d[i + 2] - 161) < 30) n++; if (n) out[k] = n; }
    return out; });
  // a point of face k (fractions of it) on screen
  const pt = (k, fx, fy) => page.evaluate(([k, fx, fy]) => { const S = window.__boxStudio, rt = S.RT.get(S.state.objects[0].id), F = rt.frames[k];
    const p = F.c.clone().addScaledVector(F.u, (fx - .5) * F.w).addScaledVector(F.v, (.5 - fy) * F.h).multiplyScalar(.01); rt.group.localToWorld(p).project(S.camera);
    const r = S.renderer.domElement.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; }, [k, fx, fy]);
  const shape = () => page.evaluate(() => { const o = window.__boxStudio.state.objects[0]; for (const k in o.faces) { const L = o.faces[k].layers.find(l => l.type === 'shape'); if (L) return { face: k, y: L.y, hmm: L.h * window.__boxStudio.faceMM(o, k)[1], wrap: !!L.wrap }; } });

  await addPreset(page, 'mailer');
  await page.click('#faceTabs .chip[data-f="front"]'); await page.click('#addRectBtn');
  await page.evaluate(() => window.__boxStudio.setView('q', true)); await page.waitForTimeout(700);
  assert.deepEqual(Object.keys(await plate()), ['front'], 'плашка только на переде');
  const h0 = (await shape()).hmm;
  // drag it up to the lid's front edge: it runs over the edge, then belongs to the lid
  await page.mouse.move(...await pt('front', .5, .5)); await page.waitForTimeout(200); await page.mouse.down();
  await page.mouse.move(...await pt('top', .5, .97), { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(700);
  const s = await shape();
  assert.equal(s.face, 'top', 'слой переехал на крышку'); assert.ok(s.wrap, 'включился переход через рёбра');
  assert.ok(Math.abs(s.hmm - h0) < .01, `размер в мм сохранён (${h0} → ${s.hmm})`);
  const p = await plate();
  assert.ok(p.front > 1000 && p.top > 1000, 'плашка на стыке печатается на обеих гранях: ' + JSON.stringify(p));
  // the base's wall under a lid: its top edge is covered, nothing comes out on the lid
  await addPreset(page, 'lidbase');
  await page.evaluate(() => { const S = window.__boxStudio, o = S.state.objects[0];
    o.faces.front.layers.push({ id: 'wrapTest', type: 'shape', kind: 'rect', w: .5, h: .22, fill: '#0a7aa1', radius: 0, stroke: 0, x: .5, y: 0, rot: 0, opacity: 1, blend: 'source-over', effect: 'none', visible: true, wrap: true });
    S.select(o.id, 'front', 'wrapTest'); });
  await page.locator('#layerSec [data-k="opacity"]').last().dispatchEvent('input'); await page.waitForTimeout(800);
  assert.deepEqual(Object.keys(await plate()), ['front'], 'с края под крышкой на крышку не переходит');
  assert.deepEqual(errors, []);
  await ctx.close();
});

const presets = only && !'все заготовки'.includes(only) ? [] : await (async () => { const { ctx, page } = await openEditor(browser); const ids = await page.$$eval('#addPreset option', o => o.map(x => x.value)); await ctx.close(); return ids; })();
if (presets.length) await test(`все заготовки (${presets.length}): построение, пломба, открывание, шаблон SVG`, async () => {
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
    await fc.setFiles(FIXTURES + 'logo.svg'); await page.waitForFunction(n => window.__boxStudio.state.objects[0].faces.front.layers.length === n, i + 1);
  }
  assert.equal(await page.evaluate(() => window.__boxStudio.library.length), 1, 'один файл дважды — одна запись');
  await page.click('#faceTabs .chip[data-f="top"]'); await page.click('#libSec .it >> nth=0'); await page.waitForTimeout(300);
  await page.hover('#libSec .it >> nth=0'); await page.click('#libSec .it >> nth=0 >> button[data-a="st"]'); await page.waitForTimeout(300);
  const o = await page.evaluate(() => { const S = window.__boxStudio, o = S.state.objects[0]; return { front: o.faces.front.layers.length, top: o.faces.top.layers.length, st: o.stickers.length }; });
  assert.deepEqual(o, { front: 2, top: 1, st: 1 }, 'каждая загрузка — слой на перед, из библиотеки — на крышку и наклейка');
  const d = JSON.parse(readFileSync(await (await (async () => { const [x] = await Promise.all([page.waitForEvent('download'), page.click('#saveBtn')]); return x; })()).path(), 'utf8'));
  assert.equal(d.library.length, 1); assert.equal(Object.keys(d.vectors).length, 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('SVG: цвета вектора и перекраска', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  await addPreset(page, 'mailer');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addImgBtn')]);
  await fc.setFiles(FIXTURES + 'logo.svg');
  await page.waitForSelector('#layerSec [data-vc]', { timeout: 10000 });
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
