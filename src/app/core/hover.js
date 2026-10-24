// Грань под курсором: одна на развёртку и 3D (режим «2D + 3D»), подсвечивается в обоих видах
/* the face the pointer is over, on the net or on the model (of the active object); changes are told to listeners */
const hover = { obj: null, face: null };
const listeners = new Set();
function setHoverFace(obj, face) {
  if (!obj || !face) obj = face = null;
  if (hover.obj === obj && hover.face === face) return;
  hover.obj = obj; hover.face = face;
  for (const f of listeners) f();
}
const onHoverFace = cb => { listeners.add(cb); };

export { hover, onHoverFace, setHoverFace };
