// Состояние редактора и выбранное
import { LIGHTS } from './constants.js';

// scene.v 2: lighting calibrated so a lit matte face renders close to its printed colour
const state = { objects: [], scene: { v: 2, preset: 'studio', ...LIGHTS.studio, bg: 'gradient', bg1: '#f4f1eb', bg2: '#cec6b8', autoRotate: false }, fonts: [], groups: [], tree: [] };
// group: the group whose settings are shown; multi: items picked in the object list (Shift / Ctrl-click)
const sel = { obj: null, face: null, layer: null, sticker: null, group: null, multi: [] };
const assets = {};
   // id -> dataURL
const imgCache = {};
 // id -> HTMLImageElement

const activeObj = () => state.objects.find(o => o.id === sel.obj) || null;
const activeFaceData = () => { const o = activeObj(); return o && sel.face ? o.faces[sel.face] : null; };
const activeLayer = () => { const f = activeFaceData(); return f ? f.layers.find(l => l.id === sel.layer) || null : null; };

export { activeFaceData, activeLayer, activeObj, assets, imgCache, sel, state };
