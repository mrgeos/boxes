// Запуск
import * as THREE from 'three';
import { sel, state } from './core/state.js';
import { faceMM } from './core/model.js';
import { libLoadBrowser, library } from './core/library.js';
import { markAllText } from './core/fonts.js';
import { RT, camera, controls, renderer, scene } from './scene/renderer.js';
import { placementsFor } from './stickers/placement.js';
import { buildStickerFilms } from './stickers/film.js';
import { applyScene, initCamera, invalidate, orbitLock, resize, setOrbitLock, setView } from './scene/camera.js';
import { select } from './core/selection.js';
import { LS_KEY, loadProject } from './core/project.js';
import { bindScene } from './ui/model-panel.js';
import { initFacePanel } from './ui/face-panel.js';
import { initFaceEditor } from './ui/face-editor.js';
import { initNetView } from './net/net-view.js';
import { initInteraction } from './scene/interaction.js';
import { initMove } from './scene/move.js';
import { initContextMenus } from './ui/context-menus.js';
import { sampleProject } from './core/sample.js';
import { initWiring } from './ui/wiring.js';
import { initObjectList } from './ui/object-list.js';
import { initColorPicker } from './ui/color-picker.js';

/* boot: hook up the parts in the order they were built, then load the project */
initCamera();
initFacePanel();
initFaceEditor();
initNetView();
initInteraction();
initMove();
initContextMenus();
initObjectList();
initWiring();
initColorPicker();
resize();
bindScene();
setOrbitLock(orbitLock);
let booted = false;
try { const saved = localStorage.getItem(LS_KEY); if (saved) { loadProject(JSON.parse(saved)); booted = true; } } catch {}
if (!booted) loadProject(sampleProject());
document.fonts?.ready.then(() => markAllText());
libLoadBrowser();
window.__boxStudio = { library, state, sel, select, setView, faceMM, RT, camera, THREE, renderer, scene, applyScene, controlsTarget: () => controls.target, placementsFor, __bsf: o => { buildStickerFilms(o); invalidate(); } };
