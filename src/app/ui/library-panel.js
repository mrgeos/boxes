// Правая панель: библиотека ассетов

/* ---------- library panel ---------- */
function renderLibrary() {
  const sec = $('#libSec'), o = activeObj(), used = usedAssets(), L = activeLayer(), st = activeSticker();
  const canSwap = (L?.type === 'image') || (st && st.kind !== 'custom') || (st?.kind === 'custom');
  const prod = o && (o.type === 'bag' || (o.type === 'box' && o.lidType === 'handle'));
  sec.innerHTML = `<div class="sec-h"><h2>Библиотека</h2><span class="hint">${library.length || ''}</span></div>
    ${library.length ? `<div class="lib">${library.map(it => `<div class="it ${used.has(it.id) ? 'used' : ''}" tabindex="0" role="button" draggable="true" data-h="${it.hash}" title="${esc(it.name)} — клик: на грань, можно перетащить на модель или в окно грани" aria-label="${esc(it.name)}">
      <span class="acts"><button data-a="st" title="Наклейка из картинки" aria-label="Наклейка из картинки">★</button>${prod ? `<button data-a="prod" title="Фото продукта / торта" aria-label="Фото продукта">◉</button>` : ''}<button data-a="swap" title="${L?.type === 'image' ? 'Заменить картинку в выбранном слое' : 'Поставить в выбранную наклейку'}" aria-label="Заменить" ${canSwap ? '' : 'disabled'}>⇄</button><button data-a="del" title="Убрать из библиотеки" aria-label="Убрать из библиотеки">×</button></span></div>`).join('')}</div>
      <p class="hint">Сюда попадает всё, что вы загружаете: картинки слоёв, наклеек, фото продукта. Клик — на текущую грань; ★ — наклейка; ⇄ — заменить в выбранном слое или наклейке. Библиотека сохраняется в файле проекта и в браузере, она доступна и в других проектах. Точка — картинка уже есть в дизайне.</p>`
      : `<p class="hint">Здесь будут все картинки, которые вы загружаете (логотипы, паттерны, фото). Их можно снова ставить на любую грань, наклейку или носитель.</p>`}
    <button class="btn sm" id="libAddBtn">Добавить в библиотеку…</button>`;
  $$('#libSec .it').forEach(el => {
    const it = library.find(x => x.hash === el.dataset.h); if (!it) return;
    el.style.backgroundImage = `url("${assets[it.id]}")`; getImg(it.id);
    if (vecOf[it.id]) el.insertAdjacentHTML('afterbegin', '<span class="vbadge">SVG</span>');
    el.onclick = e => {
      const a = e.target.closest('button')?.dataset.a, o = activeObj(); if (!o) return toast('Сначала добавьте объект');
      if (a === 'del') { libRemove(it.hash); return toast(used.has(it.id) ? 'Убрано из библиотеки (в дизайне картинка остаётся)' : 'Убрано из библиотеки'); }
      if (a === 'st') return addSticker(newSticker('custom', sel.face && faceKeys(o).includes(sel.face) ? sel.face : faceKeys(o)[0], { src: it.id, aspect: it.aspect, w: 50, outline: 1.5, text: '' }));
      if (a === 'prod') { o.product.src = it.id; o.product.aspect = it.aspect; rebuildQueue.add(o.id); renderModel(); return commit(); }
      if (a === 'swap') {
        const L = activeLayer(), st = activeSticker();
        if (L?.type === 'image') { L.src = it.id; L.aspect = it.aspect; L.recolor = {}; markFace(o, sel.face); renderLayers(); renderLayerProps(); return commit(); }
        if (st) { st.src = it.id; st.recolor = {}; if (st.kind === 'custom') st.aspect = it.aspect; touchSticker(o, st); renderStickers(); return commit(); }
        return;
      }
      placeLibImage(it, o, sel.face);
    };
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } if (e.key === 'Delete') libRemove(it.hash); };
    el.ondragstart = e => { e.dataTransfer.setData('application/x-bs-asset', it.hash); e.dataTransfer.effectAllowed = 'copy'; };
  });
  $('#libAddBtn').onclick = () => pickImage(async file => { if (!file.type.startsWith('image/')) return toast('Нужен файл изображения'); await importImageFile(file); renderLibrary(); scheduleSave(); });
}
function placeLibImage(it, obj = activeObj(), face = sel.face, at = null) {
  if (!obj || !face || !faceKeys(obj).includes(face)) return;
  const L = newImage(it.id, it.aspect), [W, H] = facePx(obj, face);
  L.w = Math.min(.6, (H * .6 * it.aspect) / W);
  if (at) { L.x = at[0]; L.y = at[1]; }
  addLayer(L, face, obj);
}
