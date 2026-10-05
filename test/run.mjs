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
  const shape = () => page.evaluate(() => { const o = window.__boxStudio.state.objects[0]; for (const k in o.faces) { const L = o.faces[k].layers.find(l => l.type === 'shape' && l.id !== 'cover'); if (L) return { face: k, y: L.y, hmm: L.h * window.__boxStudio.faceMM(o, k)[1], wrap: !!L.wrap }; } });

  await addPreset(page, 'mailer');
  await page.click('#faceTabs .chip[data-f="front"]'); await page.click('#addRectBtn');
  await page.evaluate(() => window.__boxStudio.setView('q', true)); await page.waitForTimeout(700);
  assert.deepEqual(Object.keys(await plate()), ['front'], 'плашка только на переде');
  const h0 = (await shape()).hmm;
  // a layer over it (an invisible one, as big as the face): the selected plate is still grabbed under it
  await page.evaluate(() => { const S = window.__boxStudio, o = S.state.objects[0], f = o.faces.front, L = f.layers.find(l => l.type === 'shape');
    f.layers.push({ ...structuredClone(L), id: 'cover', w: 1, h: 1, x: .5, y: .5, opacity: 0 }); S.select(o.id, 'front', L.id); });
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

await test('рукав и обечайка — кольцо: слой через шов продолжается с другого конца', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  // blue pixels in a row of a face's canvas (fraction of its height or width)
  const blue = (k, along, at) => page.evaluate(([k, along, at]) => { const S = window.__boxStudio, c = S.RT.get(S.state.objects[0].id).faces[k].canvas, x = c.getContext('2d');
    const d = along === 'y' ? x.getImageData(0, Math.round(at * (c.height - 1)), c.width, 1).data : x.getImageData(Math.round(at * (c.width - 1)), 0, 1, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 60 && d[i + 2] > 120) n++; return n; }, [k, along, at]);
  const ellipse = async (face, x, y) => {
    await page.click(`#faceTabs .chip[data-f="${face}"]`); await page.click('#addEllBtn');
    await page.evaluate(([face, x, y]) => { const S = window.__boxStudio, o = S.state.objects[0], L = o.faces[face].layers.at(-1); Object.assign(L, { fill: '#0a7aa1', w: .3, h: .12, x, y }); S.select(o.id, face, L.id); }, [face, x, y]);
    await page.locator('#layerSec [data-k="opacity"]').last().dispatchEvent('input'); await page.waitForTimeout(800);
  };
  await addPreset(page, 'cakeSleeveHandle');
  await ellipse('sleeve', .5, .98);
  assert.ok(await blue('sleeve', 'y', .995) > 50 && await blue('sleeve', 'y', .005) > 50, 'на рукаве круг у шва печатается у обоих концов ленты');
  assert.equal(await blue('sleeve', 'y', .5), 0);
  await addPreset(page, 'tube');
  await ellipse('wrap', .01, .5);
  assert.ok(await blue('wrap', 'x', .002) > 20 && await blue('wrap', 'x', .998) > 20, 'на тубусе круг у шва продолжается с другого края');
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('рукав с ручкой: лента от верха ручки, проймы на концах, старые проекты переносятся', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  await addPreset(page, 'cakeSleeveHandle');
  const svg = readFileSync(await (await download(page, '#tplBtn')).path(), 'utf8');
  assert.match(svg, /клей с оборота/, 'лепесток ручки помечен под склейку');
  assert.doesNotMatch(svg, /клеевой клапан/, 'клеевого клапана у рукава с ручкой нет');
  // the hand holes: one at each end of the band
  const holes = await page.evaluate(() => { const S = window.__boxStudio, o = S.state.objects[0]; return S.sleeveHoles(o); });
  assert.equal(holes.length, 2);
  assert.ok(holes[0] < .15 && holes[1] > .85, 'проймы у начала и у конца ленты: ' + holes.map(v => v.toFixed(2)));
  // a project saved before: no `join`, the band started at the back edge of the top; its design moves along with it
  const [d] = await Promise.all([page.waitForEvent('download'), page.click('#saveBtn')]);
  const proj = JSON.parse(readFileSync(await d.path(), 'utf8')), o = proj.objects[0];
  delete o.sleeve.handle.join;
  o.faces.sleeve.layers = [{ id: 'old', type: 'shape', kind: 'rect', w: .5, h: .02, fill: '#0a7aa1', radius: 0, stroke: 0, x: .5, y: .5, rot: 0, opacity: 1, blend: 'source-over', effect: 'none', visible: true }];
  const file = (await d.path()) + '-legacy.json'; (await import('node:fs')).writeFileSync(file, JSON.stringify(proj));
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#openBtn')]); await fc.setFiles(file); await page.waitForTimeout(1200);
  const up = await page.evaluate(() => { const S = window.__boxStudio, o = S.state.objects[0]; return { join: o.sleeve.handle.join, y: o.faces.sleeve.layers[0].y, s0: S.sleeveFold(o) }; });
  assert.equal(up.join, 'ends');
  assert.ok(Math.abs(((.5 - up.s0) + 1) % 1 - up.y) < 1e-9, `слой сдвинут вдоль ленты (${up.y})`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('развёртка коробки — лоток-крест: клеевые клапаны в углах, крышка на задней стенке, старые макеты не ломаются', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  const svgOf = async () => readFileSync(await (await download(page, '#tplBtn')).path(), 'utf8');
  const size = svg => svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/).slice(1).map(Number);
  // a tray without a lid: the bottom in the middle, the walls round it, a glue flap at each end of the front and back walls
  await addPreset(page, 'tray');
  let svg = await svgOf(), { w, h, d } = await page.evaluate(() => window.__boxStudio.state.objects[0].dims);
  assert.match(svg, /лоток-крест/);
  assert.equal((svg.match(/>клей</g) || []).length, 4, 'четыре клеевых клапана');
  assert.deepEqual(size(svg), [w + 2 * h, d + 2 * h], 'лист — крест: дно со стенками по четырём сторонам');
  // a lid with a flap: the lid off the back wall's top edge, the flap after it, in one column with the base
  await addPreset(page, 'flap150');
  svg = await svgOf();
  const m = await page.evaluate(() => { const S = window.__boxStudio, o = S.state.objects[0]; return { ...o.dims, top: S.faceMM(o, 'top')[1], flap: S.faceMM(o, 'flap')[1] }; });
  assert.ok(Math.abs(size(svg)[1] - (m.d + 2 * m.h + m.top + m.flap)) < .2, 'крышка и клапан идут за задней стенкой: ' + size(svg)[1]);
  assert.match(svg, /Крышка отогнута от верхнего края задней стенки/);
  // a project with an uploaded design of the whole sheet keeps the sheet it was drawn on
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#saveBtn')]);
  const proj = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  delete proj.objects[0].netV; proj.objects[0].dieline = 'old-sheet';
  const file = (await dl.path()) + '-legacy.json'; (await import('node:fs')).writeFileSync(file, JSON.stringify(proj));
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#openBtn')]); await fc.setFiles(file); await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => window.__boxStudio.state.objects[0].netV), 1);
  assert.doesNotMatch(await svgOf(), /лоток-крест/, 'старая раскладка листа');
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('коробка с ручкой: ручка вырублена из крышки, её дизайн печатается с оборота', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  await addPreset(page, 'cakeHandleKraft');
  let svg = readFileSync(await (await download(page, '#tplBtn')).path(), 'utf8');
  assert.match(svg, /Ручка вырублена из крышки/);
  assert.match(svg, /ОБОРОТ КРЫШКИ — ВИД С ОБОРОТА/, 'на листе показан оборот с лепестками');
  assert.match(svg, /РУЧКА: ПЕРЕД · [\d.]+×[\d.]+ мм · с оборота/);
  const lid = await page.evaluate(() => { const o = window.__boxStudio.state.objects[0]; return { bg: o.faces.handleFront.bg, inside: o.faces.inside.bg }; });
  assert.equal(lid.bg, lid.inside, 'снаружи ручки — оборот картона');
  // without a bridge there is nothing to crease the leaves to: separate parts
  const r = page.locator('input[data-k="handle.bridge"]').first(); await r.fill('0'); await r.dispatchEvent('input'); await page.waitForTimeout(400);
  svg = readFileSync(await (await download(page, '#tplBtn')).path(), 'utf8');
  assert.match(svg, /Лепестки ручки — отдельные детали/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('рукав-переноска для тортницы: лента под дном, ручка из концов ленты, окно внизу', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  for (const id of ['torte207Carry', 'torte18Carry']) {
    await addPreset(page, id);
    const svg = readFileSync(await (await download(page, '#tplBtn')).path(), 'utf8');
    assert.match(svg, /РУКАВ-ПЕРЕНОСКА · [\d.]+×[\d.]+ мм/, `${id}: лента на развёртке`);
    assert.match(svg, /клей с оборота/, `${id}: лепестки ручки склеиваются`);
    // a polygon each: the band's outline, two hand holes, two windows
    const cut = (svg.match(/<polygon points="[^"]+" fill="none" stroke="#00a0e3"/g) || []).length;
    assert.equal(cut, 5, `${id}: контур, две проймы, два окна (${cut})`);
  }
  // a plain container gets one with a tick
  await addPreset(page, 'torte18');
  await page.click('input[data-k="carry.on"]'); await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => { const o = window.__boxStudio.state.objects[0]; return o.carry.on && !!o.faces.carry; }));
  assert.match(readFileSync(await (await download(page, '#tplBtn')).path(), 'utf8'), /Рукав-переноска — бумажная вырубка/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test('наклейки: фото на всю наклейку, картинка на фон из библиотеки или с компьютера, сохраняются в проекте', async () => {
  const { ctx, page, errors } = await openEditor(browser);
  await addPreset(page, 'mailer');
  const sts = () => page.evaluate(() => window.__boxStudio.state.objects[0].stickers.map(t => ({ kind: t.kind, w: t.w, h: t.h, bg: t.bgSrc, src: t.src })));
  // a photo sticker takes the picture's proportions (160 × 100)
  let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#stPhoto')]); await fc.setFiles(FIXTURES + 'photo.png');
  await page.waitForFunction(() => window.__boxStudio.state.objects[0].stickers.length === 1);
  let s = await sts();
  assert.equal(s[0].kind, 'rect'); assert.ok(s[0].bg, 'картинка — фон наклейки');
  assert.ok(Math.abs(s[0].h - s[0].w / 1.6) < .5, `пропорции картинки: ${s[0].w}×${s[0].h}`);
  // a round sticker with a picture background from the library (the photo is there now), zoomed in
  await page.click('#stCircle');
  await page.click('#stBg'); await page.click('.apick .it');
  await page.waitForFunction(() => !!window.__boxStudio.state.objects[0].stickers[1]?.bgSrc);
  assert.equal((await sts())[1].bg, s[0].bg, 'та же картинка из библиотеки');
  // the logo, from the computer through the same window
  await page.click('#stImg');
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.apick [data-a="up"]')]); await fc.setFiles(FIXTURES + 'logo.svg');
  await page.waitForFunction(() => !!window.__boxStudio.state.objects[0].stickers[1]?.src);
  const r = page.locator('#stickerSec input[type=range][data-k="bgScale"]'); await r.fill('150'); await r.dispatchEvent('input');
  assert.equal(await page.evaluate(() => window.__boxStudio.state.objects[0].stickers[1].bgScale), 1.5);
  const d = JSON.parse(readFileSync(await (await (async () => { const [x] = await Promise.all([page.waitForEvent('download'), page.click('#saveBtn')]); return x; })()).path(), 'utf8'));
  s = await sts();
  assert.ok(d.assets[s[1].bg], 'картинка фона сохранена в проекте');
  assert.deepEqual(errors, []);
  await ctx.close();
});

const presets = only &&!'все заготовки'.includes(only) ? [] : await (async () => { const { ctx, page } = await openEditor(browser); const ids = await page.$$eval('#addPreset option', o => o.map(x => x.value)); await ctx.close(); return ids; })();
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
