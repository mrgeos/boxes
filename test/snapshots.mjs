// Снимки для проверки переделок «без изменения поведения»: для каждой заготовки — вид 3/4 с пломбой,
// развёртка в панели и шаблон SVG. Снимите до и после и сравните:
//   node test/snapshots.mjs снимки/до    (на старой сборке)
//   node test/snapshots.mjs снимки/после (на новой)
//   node test/snapshots.mjs --compare снимки/до снимки/после
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { launch, openEditor, addPreset, download, presetIds } from './browser.mjs';

const args = process.argv.slice(2);
if (args[0] === '--compare') {
  const [a, b] = args.slice(1), files = readdirSync(a).sort(); let diff = 0;
  for (const f of files) { let same; try { same = readFileSync(`${a}/${f}`).equals(readFileSync(`${b}/${f}`)); } catch { same = false; } if (!same) { diff++; console.log('  отличается:', f); } }
  console.log(diff ? `${diff} из ${files.length} файлов отличаются` : `Все ${files.length} файлов совпадают`);
  process.exit(diff ? 1 : 0);
}
const out = args[0] || 'snapshots';
mkdirSync(out, { recursive: true });
const browser = await launch();
const ids = await (async () => { const { ctx, page } = await openEditor(browser); const r = await presetIds(page); await ctx.close(); return r; })();
for (const id of ids) {
  // a fresh page per preset, so earlier ones cannot change later pictures
  const { ctx, page, errors } = await openEditor(browser);
  await addPreset(page, id); await page.click('#propTabs [data-tab="extras"]'); await page.click('#stSeal'); await page.waitForTimeout(200); await page.click('#propCrumb .up');
  await page.evaluate(() => window.__boxStudio.setView('q', true)); await page.waitForTimeout(900);
  await (await page.$('#stage')).screenshot({ path: `${out}/${id}-3d.png` });
  await page.click('#propTabs [data-tab="net"]'); await page.waitForTimeout(300); await (await page.$('#net')).screenshot({ path: `${out}/${id}-net.png` });
  writeFileSync(`${out}/${id}.svg`, readFileSync(await (await download(page, '#tplBtn')).path()));
  if (errors.length) console.log(`  ${id}: ${errors.join('; ')}`);
  await ctx.close(); process.stdout.write(id + ' ');
}
await browser.close();
console.log(`\n${ids.length} заготовок → ${out}/`);
