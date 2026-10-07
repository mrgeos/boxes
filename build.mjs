// Собирает автономный box-studio-3d.html из src/: разметка (index.html), стили (styles.css) и скрипт
// редактора (файлы src/app). three.js встраивается в файл, поэтому редактор работает без интернета
// (кроме веб-шрифтов, у них есть запасные).
//
// Файлы src/app — ES-модули с явными import/export; точка входа — src/app/main.js, esbuild собирает
// из неё всё, что она импортирует. Модули при загрузке только объявляют функции и данные (и создают
// сцену в scene/renderer.js); обработчики и цикл отрисовки подключают функции init…, которые по очереди
// вызывает main.js. Так порядок выполнения модулей ни на что не влияет.
//
// Скрипт хранится в файле сжатым (gzip, base64) и распаковывается браузером при открытии:
// так файл в несколько раз меньше, и его целиком открывают просмотрщики с лимитом размера.
//
// node build.mjs --check ничего не пишет, а сверяет box-studio-3d.html со сборкой из src/ (для проверки перед пушем).
// Сравнивается распакованный скрипт: сжатые байты могут отличаться между версиями zlib.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');

const out = await build({
  entryPoints: [new URL('src/app/main.js', import.meta.url).pathname],
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', legalComments: 'inline', metafile: true,
});
const js = out.outputFiles[0].text;
const packed = gzipSync(Buffer.from(js, 'utf8'), { level: 9 }).toString('base64');

// the loader: unpack and run the editor as an inline module (the same rules as a plain inline script)
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

const page = read('src/index.html');
const parts = [['<link rel="stylesheet" href="styles.css">', `<style>\n${read('src/styles.css')}</style>`], ['<script type="module" data-app></script>', loader]];
let html = page;
for (const [from, to] of parts) { if (!html.includes(from)) throw new Error('В src/index.html нет ' + from); html = html.replace(from, () => to); }
html = html.replace('<title>Box Studio 3D</title>', '<!-- Собрано из src/ командой npm run build. Включает three.js (MIT License, © three.js authors), скрипт сжат gzip. -->\n<title>Box Studio 3D</title>');
const unpack = h => { const m = h.match(/const z = "([^"]*)";/); return m ? [h.replace(m[1], ''), gunzipSync(Buffer.from(m[1], 'base64')).toString('utf8')] : [h, '']; };
if (process.argv.includes('--check')) {
  const [a, b] = [unpack(read('box-studio-3d.html')), unpack(html)];
  if (a[0] !== b[0] || a[1] !== b[1]) { console.error('box-studio-3d.html не совпадает со сборкой из src/: выполните npm run build и закоммитьте его'); process.exit(1); }
  console.log('box-studio-3d.html совпадает со сборкой из src/');
  process.exit(0);
}
writeFileSync(new URL('box-studio-3d.html', import.meta.url), html);
console.log(`box-studio-3d.html: ${(Buffer.byteLength(html) / 1024).toFixed(0)} КБ (скрипт без сжатия ${(Buffer.byteLength(js) / 1024).toFixed(0)} КБ, ${Object.keys(out.metafile.inputs).filter(f => f.startsWith('src/app/')).length} модулей)`);
