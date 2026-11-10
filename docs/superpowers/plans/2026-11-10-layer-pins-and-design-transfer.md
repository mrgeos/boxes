# Правила слоёв и перенос дизайна — план реализации (фаза 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** слой знает, как вести себя при смене размера (резиновый / привязанный / фиксированный в мм); при смене размера и конструкции дизайн переносится сам, а что не поместилось — уменьшено, помечено значком и попадает в проверку макета.

**Architecture:** слой по-прежнему хранит доли грани (`L.x`, `L.y`, `L.w`, `L.h`, `L.size`), отрисовка не меняется. Новое поле `L.pin` говорит, что держать в миллиметрах. Грань помнит размер, при котором слои разложены (`face.mm`). Перед построением объекта `reflowObject(o)` сравнивает размер каждой грани с `face.mm` и пересчитывает доли закреплённых слоёв. Смена конструкции раскладывает слои с исчезнувших граней по таблице соответствия.

**Tech Stack:** ES-модули на JavaScript, three.js, сборка `build.mjs`, e2e-тесты на Playwright (`test/run.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-10-product-source-of-truth-design.md` (разделы 3.2–3.4, 6.1 шаги 2–3).

## Global Constraints

- Правила `CLAUDE.md`: правки только в `src/`, затем `npm run build` и коммит `box-studio-3d.html`; первая строка нового файла — заголовок по-русски, комментарии в коде — по-английски.
- Импорты по кругу: на верхнем уровне модуля только объявления (проверяет `npm run check`).
- Каждое действие — функция над данными, вызываемая без интерфейса, и есть в `window.__boxStudio`; панель только вызывает её.
- Тесты: одно короткое e2e на то, что нельзя ломать (раздел Task 5), юнит-тестов не добавлять.
- Старые проекты переносить не нужно: отсутствие `L.pin` и `face.mm` просто значит «резиновый» и «размер ещё не запомнен».
- Безопасная зона — `SAFE_MM` из `net/net-check.js` (3 мм).
- Слои листа (`o.sheet`, сквозные) в этой фазе не трогаем: у них уже есть `anchor` и `stretch`.
- Без новых зависимостей.

## Review Focus

1. Слой, который до смены размера уже выходил за край нарочно (фон, вылет под обрез), не должен «умещаться» — уменьшаем только то, что было внутри грани, а после смены вылезло. Тест: Task 1, шаг с фоном.
2. Повернутый слой: габариты считать по повёрнутой рамке (`layerBox` + угол), иначе уместится неверно. Тест: Task 1.
3. Смена конструкции туда и обратно не должна терять слои: число слоёв на всех гранях + в `o.unplaced` до и после одинаково. Тест: Task 5.
4. Отмена (`undo`) после смены размера или конструкции возвращает слои на места одним шагом. Тест: Task 5.
5. Текст: его ширина зависит от кегля и шрифта, а кегль — доля высоты грани. «Фиксированный» текст держит кегль в мм (`L.size * Hmm`), а не ширину.

---

### Task 1: `core/pins.js` — пересчёт слоёв при смене размера грани

**Files:**
- Create: `src/app/core/pins.js`
- Modify: `src/app/scene/renderer.js` (в начале `buildObject(o)`, около строки 156 — вызвать `reflowObject(o)`)

**Interfaces:**
- Produces:
  - `L.pin = { x: 'scale'|'start'|'end'|'center', y: 'scale'|'start'|'end'|'center', size: 'scale'|'fixed' }` — нет поля или нет ключа = `'scale'`.
  - `face.mm = [wMM, hMM]` — размер, при котором слои грани разложены.
  - `L.warn = { kind: 'shrunk'|'moved'|'face', from?: string }` — пометка для пользователя (Task 3 её показывает).
  - `reflowLayers(layers, fromMM: [w,h], toMM: [w,h]): void` — пересчитать доли слоёв с одного размера на другой (используется и Task 2).
  - `reflowObject(o): string[]` — для каждой грани из `faceKeys(o)`: если `face.mm` есть и отличается от `faceMM(o,k)` больше чем на 0,01 мм — `reflowLayers`, `markFace(o,k)`; затем `face.mm = faceMM(o,k)`. Возвращает ключи изменённых граней.
  - `export { reflowLayers, reflowObject }`.

- [ ] **Step 1: Реализовать `reflowLayers`.** Для каждого слоя: габарит в мм по старому размеру (рамка из `layerBox(L, Wpx, Hpx)` с учётом `L.rot`, переведённая в мм; можно считать в «пикселях» `W = wMM`, `H = hMM`, тогда 1 px = 1 мм).
  - Размер: `size: 'fixed'` — картинка `L.w *= fromW/toW`, плашка `L.w *= fromW/toW`, `L.h *= fromH/toH`, текст `L.size *= fromH/toH`. `'scale'` — доли не меняются (как сейчас).
  - Положение по оси X (Y — так же с высотой): `scale` — `L.x` не меняется; `start` — расстояние от левого края до рамки в мм сохраняется; `end` — от правого; `center` — смещение центра от середины грани в мм сохраняется. Новая доля = новый центр / новая ширина.
  - Умещение: если рамка слоя **до** была внутри грани (с допуском 0,5 мм), а **после** вылезает за `[SAFE_MM, size − SAFE_MM]` — уменьшить размер слоя на общий множитель `k ≤ 1`, чтобы влезло, сдвинуть центр внутрь, поставить `L.warn = { kind: 'shrunk' }`. Если влезло без уменьшения, но центр пришлось сдвинуть — `{ kind: 'moved' }`. Слой, который был снаружи до смены, не трогать.
- [ ] **Step 2: Реализовать `reflowObject` и вызвать его в начале `buildObject(o)`** (до построения граней). Проверить, что все пути смены размера (поля «Ширина/Глубина/Высота» в `ui/model-panel.js`, `ui/context-bar.js`, выбор заготовки) проходят через `buildObject`.
- [ ] **Step 3: Проверка глазами в браузере** (скрипт в scratchpad, не в репозитории): коробка 100×60×200, на «Перед» плашка 30×20 мм `pin {x:'center', y:'end', size:'fixed'}` в 5 мм от низа; размер → 80×50×150; в мм плашка 30×20, низ рамки в 5 мм от низа грани. Повёрнутая на 45° плашка и фон на всю грань (`L.w = 1`) — фон не получает `warn`. Рамки считать через `window.__boxStudio` (Task 4 добавит `setDims`; до него — менять `o.dims` и `rebuildQueue.add(o.id)`).
- [ ] **Step 4: `npm run check`, `npm run build`, коммит** `Правила слоёв: пересчёт при смене размера грани`.

### Task 2: `core/transfer.js` — перенос при смене конструкции

**Files:**
- Create: `src/app/core/transfer.js`
- Modify: `src/app/ui/model-panel.js` (ветки `k === 'lidType'` около строки 89, выбор заготовки около строки 463, `k === 'type'` около строки 78: запомнить ключи граней до смены и вызвать `transferFaces` после `ensureFaces`)

**Interfaces:**
- Consumes: `reflowLayers` (Task 1), `faceKeys`, `faceMM` из `core/model.js`.
- Produces:
  - `FACE_FALLBACK: Record<string, string[]>` — для ключа, которого может не стать, — кандидаты по порядку. Минимум: `flap→['top']`, `earLeft→['left']`, `earRight→['right']`, `trayFront→['front']`, стены крышки `LID_WALLS` → соответствующая стенка (`front/back/left/right`), `roofFront→['top','front']`, `roofBack→['back']`, `rightTop`/`rightBottom→['right']`, `leftTop`/`leftBottom→['left']`, `wrap→['front']`, `lidWrap→['top','front']`, `top→['roofFront','lidWrap']`, `right→['rightTop']`, `left→['leftTop']`. Остальное строитель дополняет по `faceKeys`.
  - `o.unplaced: Array<{ from: string, mm: [w,h], layers: Layer[] }>` — слои, которым не нашлось грани.
  - `transferFaces(o, prevKeys: string[]): { moved: number, unplaced: number }` — для каждого ключа из `prevKeys`, которого нет в `faceKeys(o)` и у которого на грани есть слои: первый кандидат из `FACE_FALLBACK`, который есть в новой конструкции, получает эти слои в конец стопки (`reflowLayers` с размера старой грани на размер новой, у каждого `L.warn = { kind: 'face', from }`); если кандидата нет — запись в `o.unplaced`. Слои со старой грани убрать (сама грань остаётся, как сейчас). Группы слоёв (`L.group`) переносятся вместе с именами из `face.groups`.
  - `placeUnplaced(o, index: number, key: string): boolean` — поставить запись из `o.unplaced` на грань `key` (тот же `reflowLayers`, `warn: 'face'`).
  - `export { FACE_FALLBACK, placeUnplaced, transferFaces }`.

- [ ] **Step 1: Реализовать модуль.**
- [ ] **Step 2: Подключить в `ui/model-panel.js`** во всех трёх местах смены конструкции; убедиться, что смена остаётся одним шагом истории (тот же `commit()`, что сейчас).
- [ ] **Step 3: Проверка в браузере** (scratchpad): мейлер `f0427` со слоем на `flap` → `lidType = 'flat'` → слой на `top` с `warn.kind === 'face'`, `from === 'flap'`; `undo()` возвращает слой на `flap`.
- [ ] **Step 4: `npm run check`, `npm run build`, коммит** `Перенос дизайна при смене конструкции`.

### Task 3: значок у слоя и пункты в проверке макета

**Files:**
- Modify: `src/app/ui/face-panel.js` (`renderLayers`, около строки 72; свойства выбранного слоя)
- Modify: `src/app/net/net-check.js` (`printIssues`)
- Modify: `src/app/ui/print-menu.js` (показ новых пунктов, если список строится по видам)
- Modify: места, где пользователь двигает, масштабирует или поворачивает слой (`core/transform.js` и обработчики перетаскивания) — снять `L.warn` после правки

**Interfaces:**
- Consumes: `L.warn`, `o.unplaced` (Task 1–2).
- Produces:
  - `clearLayerWarn(o, k, id): boolean` в `core/pins.js`.
  - В `printIssues` — пункты вида `{ kind: 'transfer', obj, face, layer, text }` для каждого слоя с `L.warn` и `{ kind: 'unplaced', obj, index, text }` для каждой записи `o.unplaced`. Тексты по-русски: «Уменьшен, чтобы поместиться», «Сдвинут внутрь грани», «Перенесён с грани «<имя>»», «Не нашлось места: <n> слоёв с грани «<имя>»» (имя грани — `faceLabel`).

- [ ] **Step 1: Значок ⚠ в строке слоя** с подсказкой (тот же текст), кнопка «Так и надо» в свойствах слоя вызывает `clearLayerWarn`.
- [ ] **Step 2: Пункты в `printIssues`**, клик по пункту выбирает слой (как другие пункты проверки, если там это есть; если нет — только список).
- [ ] **Step 3: Снятие пометки** при перемещении, масштабе или повороте слоя пользователем.
- [ ] **Step 4: Неразмещённые слои:** в панели граней — строка «Не размещено (n)» с выбором грани, вызывает `placeUnplaced`.
- [ ] **Step 5: Проверка глазами** на 1500, 1024 и 390 px (правило `CLAUDE.md`): значок не наезжает на имя слоя, длинное имя обрезается.
- [ ] **Step 6: `npm run check`, `npm run build`, коммит** `Предупреждения о переносе: значок у слоя и проверка макета`.

### Task 4: переключатели правил слоя и действия для агента

**Files:**
- Modify: `src/app/ui/face-panel.js` (свойства выбранного слоя)
- Modify: `src/app/main.js` (`window.__boxStudio`, обёртка `asStep` около строки 103)

**Interfaces:**
- Consumes: `L.pin`, `clearLayerWarn`, `transferFaces`, `placeUnplaced`.
- Produces в `window.__boxStudio` (все изменяющие — через `asStep`):
  - `setLayerPin(id, k, layerId, pin)` — слить `pin` в `L.pin`, без пересчёта.
  - `setDims(id, { w?, h?, d? })` — сменить размеры, `rebuildQueue.add`, `true`.
  - `setLidType(id, lidType)` — тот же путь, что поле «Конструкция» (с `transferFaces`).
  - `transferIssues(id)` — пункты `printIssues` видов `transfer` и `unplaced` для объекта.
  - `placeUnplaced(id, index, k)`, `clearLayerWarn(id, k, layerId)`.

- [ ] **Step 1: Переключатели в свойствах слоя**, группа «При смене размера»: «По горизонтали» — Растягивать / От левого края / От правого края / От центра; «По вертикали» — Растягивать / От верха / От низа / От центра; галочка «Размер в мм (не масштабировать)». Подписи по-русски, как остальные поля (`ui/fields.js`).
- [ ] **Step 2: Действия в `window.__boxStudio`.** Вынести логику `setDims`/`setLidType` в функции над данными (например, в `core/transfer.js` или рядом с `ensureFaces`), панель `model-panel.js` вызывает их же.
- [ ] **Step 3: `npm run check`, `npm run build`, коммит** `Правила слоя в панели и действия для агента`.

### Task 5: e2e-тест и документация

**Files:**
- Modify: `test/run.mjs` (новый тест)
- Modify: `README.md` (раздел «Что умеет»), `PLAN.md` (сделанное — в «Сделано»)

- [ ] **Step 1: Тест** `перенос дизайна: смена размера и конструкции не теряет слои`, через `window.__boxStudio`:
  - коробка `flat` 100×60×200, на `front` плашка 30×20 мм, `pin { x:'center', y:'end', size:'fixed' }`, низ в 5 мм от низа; `setDims(id, { w:80, d:50, h:150 })`; ждать построения; ожидание: размер плашки 30±0,2 × 20±0,2 мм, низ в 5±0,2 мм от низа грани;
  - мейлер (`addPreset` мейлера) со слоем на `flap`; число слоёв (все грани + `o.unplaced`) = N; `setLidType(id, 'flat')`; слой на `top`, `warn.kind === 'face'`; число слоёв = N; `transferIssues(id).length ≥ 1`;
  - `undo()`: слой снова на `flap`;
  - `errors` пусты.
- [ ] **Step 2: `PW_CHROMIUM=<путь к Chrome> node test/run.mjs перенос`** — PASS.
- [ ] **Step 3: README и PLAN**, `npm run build`, `npm run prepush` (около 4 минут; тест «открывается без интернета» на этой машине бывает нестабилен — при падении повторить отдельно).
- [ ] **Step 4: Коммит** `Перенос дизайна: тест, README, PLAN`.

## Отложено (не в этой фазе)

- Режим правил по умолчанию для проекта (спецификация 3.2, решение Claude) — добавить, когда появятся линейки (проект 2).
- Правила для слоёв листа (сквозных) — у них уже `anchor`/`stretch`; свести к `L.pin` в фазе «3D из кроя».
- 3D из кроя (спецификация 3.1, шаги 4–5 раздела 6.1) — отдельный план.
