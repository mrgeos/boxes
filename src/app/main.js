// Запуск

/* boot */
resize();
 bindScene();
 setOrbitLock(orbitLock);
let booted = false;
try { const saved = localStorage.getItem(LS_KEY); if (saved) { loadProject(JSON.parse(saved)); booted = true; } } catch {}
if (!booted) loadProject(sampleProject());
document.fonts?.ready.then(() => markAllText());
libLoadBrowser();
window.__boxStudio = { library, state, sel, select, setView, RT, camera, THREE, renderer, scene, applyScene, controlsTarget: () => controls.target, placementsFor, __bsf: o => buildStickerFilms(o) };
