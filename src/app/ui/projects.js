// «Мои проекты»: список проектов в аккаунте, открытие, копия, удаление; значок автосохранения у названия
import { $, esc, toast } from '../core/util.js';
import { state } from '../core/state.js';
import { cloudOn, cloudPid, deleteCloudProject, duplicateCloudProject, initCloud, listProjects, openCloudProject, saveNow, setThumbSource, startProject } from '../core/cloud.js';
import { thumbOf } from './object-thumbs.js';

const STATUS = {
  off: ['', ''],
  saved: ['Сохранено', 'Проект сохранён в вашем аккаунте claude.ai: он есть в «Моих проектах» на любом устройстве'],
  pending: ['Есть изменения', 'Сохранится через пару секунд'],
  saving: ['Сохраняется…', 'Проект сохраняется в аккаунт'],
  error: ['Не сохранено', 'Не удалось сохранить в аккаунт — попробую ещё раз при следующей правке. Клик — сохранить сейчас'],
  big: ['Слишком большой', 'Проект больше 250 КБ (без картинок) и не помещается в хранилище. Сохраните его в файл'],
};
function paintStatus(s) {
  const el = $('#cloudState'); if (!el) return;
  const [t, title] = STATUS[s] || STATUS.off;
  el.hidden = !t; el.dataset.s = s; el.title = title;
  el.innerHTML = `<i></i>${t}`;
}
const when = t => { const d = new Date(t), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }); };

/* the dialog with the projects of the account, newest first */
async function openProjects() {
  const dlg = $('#projDlg'); if (!dlg || !cloudOn()) return;
  dlg.hidden = false;
  const body = $('#projList'); body.innerHTML = '<p class="hint">Загружаю…</p>';
  let list = [];
  try { list = await listProjects(); } catch { body.innerHTML = '<p class="hint">Не удалось получить список проектов. Попробуйте ещё раз.</p>'; return; }
  const cur = cloudPid();
  body.innerHTML = list.length ? list.map(p => `<div class="pcard ${p.id === cur ? 'on' : ''}" data-p="${p.id}" tabindex="0" role="button" aria-label="Открыть ${esc(p.name || 'проект')}">
      <span class="pt" ${p.thumb ? `style="background-image:url('${p.thumb}')"` : ''}></span>
      <span class="pn">${esc(p.name || 'Без названия')}</span><span class="pd">${when(p.updated)}${p.id === cur ? ' · открыт' : ''}</span>
      <span class="pa"><button class="vx" data-a="dup" title="Копия">⧉</button><button class="vx" data-a="del" title="Удалить">✕</button></span></div>`).join('')
    : '<p class="hint">Здесь будут проекты, сохранённые в вашем аккаунте. Текущий сохранится сам после первой правки.</p>';
  body.querySelectorAll('.pcard').forEach(card => {
    const id = card.dataset.p;
    card.onclick = async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'del') {
        // asked in the card itself (the viewer shows no confirm dialogs): a second click deletes
        const btn = e.target.closest('[data-a]');
        if (!btn.classList.contains('sure')) { btn.classList.add('sure'); btn.textContent = 'Удалить?'; btn.title = 'Ещё раз — удалить без возврата'; return; }
        await deleteCloudProject(id); toast('Проект удалён'); return openProjects();
      }
      if (a === 'dup') { await duplicateCloudProject(id); toast('Копия проекта сохранена'); return openProjects(); }
      if (id === cur) { closeProjects(); return; }
      body.querySelectorAll('.pcard').forEach(c => c.classList.add('wait'));
      try { await openCloudProject(id); closeProjects(); toast(`Открыт проект «${state.name}»`); }
      catch { toast('Не удалось открыть проект'); openProjects(); }
    };
    card.onkeydown = e => { if (e.key === 'Enter') card.click(); };
  });
}
function closeProjects() { const dlg = $('#projDlg'); if (dlg) dlg.hidden = true; }

/* the account's store, when the page runs in claude.ai: the status by the name, «Мои проекты» in the file menu */
async function initProjects() {
  $('#projClose').onclick = closeProjects;
  $('#projDlg').addEventListener('click', e => { if (e.target.id === 'projDlg') closeProjects(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#projDlg').hidden) closeProjects(); });
  $('#cloudState').onclick = () => { if (cloudOn()) saveNow(); };
  setThumbSource(() => state.objects[0] && thumbOf(state.objects[0].id));
  // the runtime may come a moment after the page's own script
  for (let i = 0; i < 20 && !window.claude?.use; i++) await new Promise(r => setTimeout(r, 150));
  if (!(await initCloud(paintStatus))) return;
  $('#myProjBtn').hidden = false;
  $('#myProjBtn').onclick = () => { $('#fileMenu').hidden = true; openProjects(); };
  await startProject();
}

export { closeProjects, initProjects, openProjects };
