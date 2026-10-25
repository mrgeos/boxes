// Запуск
import { initTabs } from './ui/tabs.js';
import { initPanels } from './ui/panels.js';
import { initSoftShadows } from './scene/soft-shadows.js';
import { initActionBar } from './ui/action-bar.js';
import { initCtxBar } from './ui/context-bar.js';
import { initStageHint } from './ui/stage-hint.js';
import { initSelLook } from './scene/sel-look.js';
import { initViewCube } from './ui/view-cube.js';
import { initItemNav } from './ui/item-nav.js';
import { initMarquee } from './scene/marquee.js';
import { footprint } from './core/arrange.js';
import { initProjects } from './ui/projects.js';
import { initTextEdit } from './ui/text-edit.js';
import { initQualityMenu } from './ui/quality-menu.js';
import { addMarks, setRender } from './scene/render-mode.js';
import { initContextLoss } from './scene/context-loss.js';
import * as THREE from 'three';
import { sel, state } from './core/state.js';
import { faceMM, newImage, newShape, newText } from './core/model.js';
import * as Sheet from './core/sheet.js';
import { renderFace } from './faces/render.js';
import { sleeveDims, sleeveSheet } from './carriers/sleeve.js';
import { libLoadBrowser, library } from './core/library.js';
import { loadMyModels } from './core/model-library.js';
import { markAllText } from './core/fonts.js';
import { RT, camera, controls, dirtyFaces, floor, markObj, rebuildQueue, renderer, scene } from './scene/renderer.js';
import { placementsFor } from './stickers/placement.js';
import { buildStickerFilms } from './stickers/film.js';
import { applyScene, initCamera, invalidate, orbitLock, resize, sceneBounds, setOrbitLock, setView } from './scene/camera.js';
import { select } from './core/selection.js';
import { LS_KEY, loadProject } from './core/project.js';
import { bindScene } from './ui/model-panel.js';
import { initFacePanel } from './ui/face-panel.js';
import { initFaceEditor } from './ui/face-editor.js';
import { initNetView } from './net/net-view.js';
import { initNetStage, netView, panelRects } from './net/net-stage.js';
import { hover } from './core/hover.js';
import { netHandles } from './net/net-edit.js';
import { labelRects, netOverlay, setNetOverlay } from './net/net-overlays.js';
import { printIssues } from './net/net-check.js';
import { hasReverse, setNetSide, sideOf } from './net/net-side.js';
import { initFaceHi } from './scene/face-hi.js';
import { initViewMode, setViewMode, viewMode } from './ui/view-mode.js';
import { initInteraction, pick, stickerHit } from './scene/interaction.js';
import { boxOnScreen, handleAt } from './scene/sel-box.js';
import { initMove } from './scene/move.js';
import { initContextMenus } from './ui/context-menus.js';
import { sampleProject } from './core/sample.js';
import { initWiring } from './ui/wiring.js';
import { initImposePanel } from './ui/impose-panel.js';
import { SHEETS, fitPiece, imposition, pieceOf } from './net/impose.js';
import { bleedLoops, printSheet } from './net/bleed.js';
import { dielineData } from './net/dieline.js';
import { dielineDXF } from './export/dxf.js';
import { printPDF } from './export/pdf.js';
import { printCanvas, templateSVG } from './net/template.js';
import { initObjectList } from './ui/object-list.js';
import { initObjectThumbs } from './ui/object-thumbs.js';
import { initColorPicker } from './ui/color-picker.js';
import { exitIsolation, isShown, isolation, setIsolation, toggleIsolation } from './scene/isolation.js';
import { initIsolationPlate } from './ui/isolation-plate.js';
import { initFoldBar } from './ui/fold-bar.js';
import { initFoldSteps } from './ui/fold-steps.js';
import * as Fold from './scene/fold.js';
import { commit, projectJSON, redo, undo } from './core/project.js';

/* boot: hook up the parts in the order they were built, then load the project (the shadow filter first: before any
   material is built) */
initSoftShadows();
initCamera();
initFacePanel();
initFaceEditor();
initNetView();
initNetStage();
initFaceHi();
initInteraction();
initMove();
initContextMenus();
initObjectList(); initObjectThumbs();
initWiring(); initImposePanel();
initColorPicker();
initPanels();
initViewMode();
initTabs();
initActionBar(); initCtxBar(); initStageHint(); initSelLook(); initViewCube(); initItemNav(); initMarquee(); initIsolationPlate();
initTextEdit(); initFoldBar(); initFoldSteps();
addMarks(Fold.hideFoldMark, Fold.foldMarkShown);   // the fold's crease mark is a mark over the scene too
initQualityMenu(); initContextLoss();
resize();
bindScene();
setOrbitLock(orbitLock);
let booted = false;
try { const saved = localStorage.getItem(LS_KEY); if (saved) { loadProject(JSON.parse(saved)); booted = true; } } catch {}
if (!booted) loadProject(sampleProject());
document.fonts?.ready.then(() => markAllText());
libLoadBrowser(); loadMyModels();
initProjects();
window.__boxStudio = { dielineData, dielineDXF, printPDF, templateSVG, printCanvas, bleedLoops, printSheet, imposition, fitPiece, pieceOf, SHEETS, setViewMode, viewMode, setNetSide, netSide: () => sideOf(state.objects.find(q => q.id === sel.obj)), hasReverse, setNetOverlay, netOverlay, netLabelRects: labelRects, printIssues, netPanelRects: panelRects, netView, hover, netHandles, library, state, sel, select, pick, stickerHit, boxOnScreen, handleAt, setView, faceMM, footprint, pendingFaces: () => dirtyFaces.size,
  sleeveHoles: o => { const D = sleeveDims(o); return sleeveSheet(D).holes.map(h => h.reduce((a, p) => a + p[1], 0) / h.length / D.P); }, sleeveFold: o => { const D = sleeveDims(o); return D.s0 / D.P; }, RT, camera, THREE, renderer, setRender, setIsolation, exitIsolation, toggleIsolation, isolation, isShown, sceneBounds, scene, applyScene, markObj, rebuildQueue, controlsTarget: () => controls.target, placementsFor, __bsf: o => { buildStickerFilms(o); invalidate(); } };
/* what an agent (and the tests) can do with the assembly: the view (setFold, playFold) and the plan, which is the
   product's data, so each change of it is one step of the history */
const asStep = f => (...a) => { const r = f(...a); if (r) commit(); return r; };
Object.assign(window.__boxStudio, { setFold: Fold.setFold, foldOf: Fold.foldOf, canFold: Fold.canFold, playFold: Fold.playFold, foldPoses: Fold.foldPoses, floorMesh: () => floor,
  getFoldPlan: Fold.foldInfo, listFoldCreases: Fold.listFoldCreases, focusFoldStep: Fold.focusFoldStep, foldTimeline: Fold.foldTimeline,
  setFoldAngle: asStep(Fold.setFoldAngle), setFoldStep: asStep(Fold.setFoldStep), moveFoldStep: asStep(Fold.moveFoldStep), mergeFoldSteps: asStep(Fold.mergeFoldSteps),
  setStepTime: asStep(Fold.setStepTime), resetFoldCrease: asStep(Fold.resetFoldCrease), resetFoldPlan: asStep(Fold.resetFoldPlan) });
/* sheet layers (core/sheet.js): printed on the net's sheet over the folds between faces; the actions work on the data and
   take the object by id (the picked one by default) */
{
  const obj = id => state.objects.find(q => q.id === (id ?? sel.obj)) || null;
  const mk = (type, props = {}) => Object.assign(type === 'image' ? newImage(props.src, props.aspect || 1) : type === 'shape' ? newShape(props.kind) : newText(props.text), props);
  Object.assign(window.__boxStudio, {
    projectJSON: () => projectJSON(false), loadProject, undo, redo,
    newSheetLayer: mk,
    addSheetLayer: asStep((side, L, opts, id) => { const o = obj(id); return o && Sheet.addSheetLayer(o, side, L, opts); }),
    removeSheetLayer: asStep((side, lid, id) => { const o = obj(id); return o && Sheet.removeSheetLayer(o, side, lid); }),
    layerToSheet: asStep((k, ids, opts, id) => { const o = obj(id); const r = o ? Sheet.layerToSheet(o, k, ids, opts) : []; return r.length ? r : null; }),
    sheetToFace: asStep((side, ids, k, id) => { const o = obj(id); const r = o ? Sheet.sheetToFace(o, side, ids, k) : []; return r.length ? r : null; }),
    setSheetStretch: asStep((side, lid, on, box, id) => { const o = obj(id); return o && Sheet.setSheetStretch(o, side, lid, on, box); }),
    moveSheetLayer: asStep((side, lid, at, id) => { const o = obj(id); return o && Sheet.moveSheetLayer(o, side, lid, at); }),
    setSheetTier: asStep((side, lid, over, id) => { const o = obj(id); return o && Sheet.setSheetTier(o, side, lid, over); }),
    // the sheet as a net: its size (mm) and panels (key, place, turn)
    sheetInfo: (side, id) => { const o = obj(id); if (!o) return null; const n = Sheet.sheetNet(o, side); return { W: n.W, H: n.H, panels: n.panels.map(({ key, x, y, w, h, q, rot, ang, crop, fan, poly, r, circle }) => ({ key, x, y, w, h, q: q ?? (rot ? 2 : 0), ang, crop, fan: !!fan, poly: !!poly, r, circle: !!circle })) }; },
    // where the sheet's layers lie on face k (outlines in shares of the face)
    sheetFootprints: (k, id) => { const o = obj(id); return o ? Sheet.sheetFootprints(o, k).map(g => ({ side: g.side, id: g.L.id, quad: g.quad })) : []; },
    sheetLayers: (side, id) => obj(id)?.sheet?.[side]?.layers || [],
    // the sheet side's own picture, painted now
    sheetPicture: (side, id) => { const o = obj(id); if (!o?.sheet?.[side]) return null; renderFace(o, Sheet.sheetKey(side)); return RT.get(o.id)?.faces[Sheet.sheetKey(side)]?.canvas || null; },
  });
}
