// Собирает автономный box-studio-3d.html из src/: разметка (index.html), стили (styles.css) и скрипт
// редактора (файлы src/app). three.js встраивается в файл, поэтому редактор работает без интернета
// (кроме веб-шрифтов, у них есть запасные).
//
// Файлы src/app — части одного скрипта с общей областью видимости: сборка склеивает их в порядке APP и
// собирает esbuild'ом. Функции можно объявлять в любом файле; константы и код, который выполняется сразу
// (обработчики, создание сцены), должны идти после того, что они используют, — поэтому порядок важен.
//
// Скрипт хранится в файле сжатым (gzip, base64) и распаковывается браузером при открытии:
// так файл в несколько раз меньше, и его целиком открывают просмотрщики с лимитом размера.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

export const APP = [
  'core/util.js',
  'core/constants.js',
  'core/state.js',
  'core/model.js',
  'core/assets.js',
  'core/library.js',
  'core/vector.js',
  'core/fonts.js',
  'scene/renderer.js',
  'scene/geometry.js',
  'carriers/cup.js',
  'carriers/bag.js',
  'carriers/tube.js',
  'carriers/dome.js',
  'carriers/torte.js',
  'carriers/box.js',
  'carriers/handle-box.js',
  'carriers/sleeve.js',
  'faces/render.js',
  'stickers/placement.js',
  'stickers/film.js',
  'scene/camera.js',
  'core/selection.js',
  'core/project.js',
  'ui/fields.js',
  'ui/model-panel.js',
  'ui/face-panel.js',
  'ui/stickers-panel.js',
  'ui/library-panel.js',
  'ui/face-editor.js',
  'net/net-view.js',
  'scene/interaction.js',
  'export/image.js',
  'net/template.js',
  'core/sample.js',
  'ui/wiring.js',
  'ui/color-picker.js',
  'main.js',
];

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
for (const f of APP) if (!existsSync(new URL('src/app/' + f, import.meta.url))) throw new Error('Нет файла src/app/' + f);
const source = APP.map(f => `// ---- ${f}\n` + read('src/app/' + f)).join('\n');

const out = await build({
  stdin: { contents: source, resolveDir: new URL('.', import.meta.url).pathname, loader: 'js', sourcefile: 'box-studio-3d.js' },
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', legalComments: 'inline',
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
writeFileSync(new URL('box-studio-3d.html', import.meta.url), html);
console.log(`box-studio-3d.html: ${(Buffer.byteLength(html) / 1024).toFixed(0)} КБ (скрипт без сжатия ${(Buffer.byteLength(js) / 1024).toFixed(0)} КБ, ${APP.length} файлов)`);
