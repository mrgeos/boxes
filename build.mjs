// Собирает автономный box-studio-3d.html: three.js встраивается в файл,
// поэтому редактор работает без интернета (кроме веб-шрифтов, у них есть запасные).
// Скрипт хранится в файле сжатым (gzip, base64) и распаковывается браузером при открытии:
// так файл в несколько раз меньше, и его целиком открывают просмотрщики с лимитом размера.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const src = readFileSync('src/box-studio-3d.html', 'utf8');
const importMap = /<script type="importmap">[\s\S]*?<\/script>\s*/;
const moduleRe = /<script type="module">([\s\S]*?)<\/script>/;
const m = src.match(moduleRe);
if (!m || !importMap.test(src)) throw new Error('В исходнике не найден importmap или модульный скрипт');

const out = await build({
  stdin: { contents: m[1], resolveDir: process.cwd(), loader: 'js', sourcefile: 'box-studio-3d.js' },
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', legalComments: 'inline',
});
const js = out.outputFiles[0].text;
const packed = gzipSync(Buffer.from(js, 'utf8'), { level: 9 }).toString('base64');

// the loader: unpack and run the editor as an inline module (the same rules as the plain inline script)
const loader = `<script type="module">
const z = "${packed}";
const fail = () => { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;font:14px system-ui">Этот браузер не умеет распаковывать редактор. Откройте файл в свежей версии Chrome, Edge, Safari или Firefox.</p>'); };
if (!('DecompressionStream' in window)) fail();
else {
  const bytes = Uint8Array.from(atob(z), c => c.charCodeAt(0));
  new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text().then(code => {
    const s = document.createElement('script'); s.type = 'module'; s.textContent = code; document.body.appendChild(s);
  }, fail);
}
</script>`;

const html = src
  .replace(importMap, '')
  .replace(moduleRe, () => loader)
  .replace('<title>Box Studio 3D</title>', '<!-- Собрано из src/box-studio-3d.html командой npm run build. Включает three.js (MIT License, © three.js authors), скрипт сжат gzip. -->\n<title>Box Studio 3D</title>');
writeFileSync('box-studio-3d.html', html);
console.log(`box-studio-3d.html: ${(Buffer.byteLength(html) / 1024).toFixed(0)} КБ (скрипт без сжатия ${(Buffer.byteLength(js) / 1024).toFixed(0)} КБ)`);
