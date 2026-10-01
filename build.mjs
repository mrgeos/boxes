// Собирает автономный box-studio-3d.html: three.js встраивается в файл,
// поэтому редактор работает без интернета (кроме веб-шрифтов, у них есть запасные).
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('src/box-studio-3d.html', 'utf8');
const importMap = /<script type="importmap">[\s\S]*?<\/script>\s*/;
const moduleRe = /<script type="module">([\s\S]*?)<\/script>/;
const m = src.match(moduleRe);
if (!m || !importMap.test(src)) throw new Error('В исходнике не найден importmap или модульный скрипт');

const out = await build({
  stdin: { contents: m[1], resolveDir: process.cwd(), loader: 'js', sourcefile: 'box-studio-3d.js' },
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', legalComments: 'inline',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = src
  .replace(importMap, '')
  .replace(moduleRe, () => `<script type="module">${js}</script>`)
  .replace('<title>Box Studio 3D</title>', '<!-- Собрано из src/box-studio-3d.html командой npm run build -->\n<title>Box Studio 3D</title>');
writeFileSync('box-studio-3d.html', html);
console.log(`box-studio-3d.html: ${(html.length / 1024).toFixed(0)} КБ`);
