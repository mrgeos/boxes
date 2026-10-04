// Шрифты

const loadedFonts = new Set();
function fontStr(L, px) { return `${L.italic ? 'italic ' : ''}${L.weight} ${px}px "${L.font}", "Onest", sans-serif`; }
function ensureFont(L) {
  const key = `${L.italic ? 'i' : ''}${L.weight} ${L.font}`;
  if (loadedFonts.has(key) || !document.fonts) return;
  loadedFonts.add(key);
  document.fonts.load(fontStr(L, 48), L.text || 'АБВabc').then(() => markAllText()).catch(() => {});
}
function markAllText() {
  for (const o of state.objects) for (const k in o.faces) if (o.faces[k].layers.some(l => l.type === 'text')) markFace(o, k);
  // sticker artwork with text is redrawn once the font has arrived
  for (const o of state.objects) if (o.stickers?.some(t => t.text)) {
    const rt = RT.get(o.id); rt?.stickerLook?.forEach(L => { L.key = ''; }); stickerDirty.add(o.id);
  }
  ui.editor = true;
}
async function registerFont(f) {
  try {
    const ff = new FontFace(f.name, `url(${assets[f.asset]})`);
    await ff.load(); document.fonts.add(ff); markAllText();
  } catch (e) { toast(`Не удалось подключить шрифт «${f.name}»`); }
}
const allFonts = () => [...FONTS, ...state.fonts.map(f => f.name)];
