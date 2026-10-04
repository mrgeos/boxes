// Проверка модулей src/app: при загрузке модуль не должен читать то, что объявлено в модуле, который
// импортирует его в ответ (по кругу). Порядок выполнения таких модулей зависит от порядка импортов,
// и код упадёт с «Cannot access … before initialization» при безобидной перестановке.
// Обработчики, цикл отрисовки и прочее, что трогает другие модули, подключайте в функциях init…,
// которые вызывает main.js. Запуск: npm run check (вместе с ESLint).
import { parse } from 'acorn';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/app/', import.meta.url));
const files = readdirSync(ROOT, { recursive: true }).filter(f => f.endsWith('.js')).map(f => join(ROOT, f));

const mods = new Map();
for (const path of files) {
  const code = readFileSync(path, 'utf8'), ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const decl = new Map(), imports = new Map(), deps = new Set(), body = [];
  for (let n of ast.body) {
    if (n.type === 'ImportDeclaration') {
      if (!n.source.value.startsWith('.')) continue;   // three.js and its addons do not import us back
      const from = resolve(dirname(path), n.source.value); deps.add(from);
      for (const s of n.specifiers) imports.set(s.local.name, { from, name: s.type === 'ImportSpecifier' ? s.imported.name : '*' });
      continue;
    }
    if (n.type === 'ExportNamedDeclaration' || n.type === 'ExportDefaultDeclaration') { if (!n.declaration) continue; n = n.declaration; }
    if (n.type === 'FunctionDeclaration') decl.set(n.id.name, n);
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) for (const nm of names(d.id)) decl.set(nm, n);
    body.push(n);
  }
  mods.set(path, { path, code, decl, imports, deps, body });
}
function names(p) { return p.type === 'Identifier' ? [p.name] : p.type === 'ObjectPattern' ? p.properties.flatMap(q => names(q.value ?? q.argument)) : p.type === 'ArrayPattern' ? p.elements.filter(Boolean).flatMap(names) : p.type === 'AssignmentPattern' ? names(p.left) : p.type === 'RestElement' ? names(p.argument) : []; }

// which modules each one reaches through its imports
const reach = new Map();
function reachOf(m) {
  if (reach.has(m)) return reach.get(m);
  const r = new Set(); reach.set(m, r); const st = [...mods.get(m).deps];
  while (st.length) { const d = st.pop(); if (r.has(d) || !mods.has(d)) continue; r.add(d); st.push(...mods.get(d).deps); }
  return r;
}

const isFn = n => /^(Arrow)?Function(Expression)?$/.test(n.type);
const lazy = n => n.type === 'FunctionDeclaration' || (n.type === 'VariableDeclaration' && n.declarations.every(d => d.init && isFn(d.init)));
// identifiers a node reads; with now = true, skips function bodies that run later (handlers, callbacks),
// except ones called on the spot: an IIFE or a callback of forEach / map / … which run synchronously
const SYNC = new Set(['forEach', 'map', 'filter', 'some', 'every', 'reduce', 'find', 'findIndex', 'sort', 'flatMap']);
function refs(node, now) {
  const out = new Set();
  (function go(x, p, k) {
    if (!x || typeof x.type !== 'string') return;
    if (now && isFn(x) && x !== node) {
      const called = p?.type === 'CallExpression' && (k === 'callee' || (k === 'arguments' && p.callee.type === 'MemberExpression' && SYNC.has(p.callee.property.name)));
      if (!called) return;
    }
    if (x.type === 'Identifier' && !(p && ((p.type === 'MemberExpression' && k === 'property' && !p.computed) || ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && k === 'key' && !p.computed)))) out.add(x.name);
    for (const kk in x) { if (kk === 'type') continue; const v = x[kk]; if (Array.isArray(v)) v.forEach(c => go(c, x, kk)); else if (v && typeof v.type === 'string') go(v, x, kk); }
  })(node);
  return out;
}

const problems = [];
for (const m of mods.values()) for (const n of m.body) {
  if (lazy(n)) continue;
  const seen = new Set(), st = [[m, n]], at = m.code.slice(n.start, n.start + 60).replace(/\s+/g, ' ');
  while (st.length) {
    const [cm, cn] = st.pop(), key = cm.path + ':' + cn.start; if (seen.has(key)) continue; seen.add(key);
    // a called function runs its whole body; a statement at load only what it runs right away
    for (const nm of refs(cn, !lazy(cn))) {
      let owner = cm, name = nm;
      const imp = cm.imports.get(nm);
      if (imp) {
        owner = mods.get(imp.from); name = imp.name;
        if (!owner) continue;
        if (reachOf(owner.path).has(m.path)) problems.push(`${relative(ROOT, m.path)}: «${at}» при загрузке читает ${name} из ${relative(ROOT, owner.path)}, а тот импортирует этот модуль по кругу`);
      }
      const d = owner.decl.get(name);
      if (d && d !== cn && lazy(d)) st.push([owner, d]);   // follow functions it may call
    }
  }
}
for (const p of [...new Set(problems)]) console.log('  ✗', p);
console.log(problems.length ? `\n${new Set(problems).size} мест: перенесите этот код в функцию init… и вызовите её из main.js` : `Модули: ${mods.size}, порядок загрузки безопасен`);
process.exit(problems.length ? 1 : 0);
