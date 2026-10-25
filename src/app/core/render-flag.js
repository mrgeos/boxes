// Включён ли режим «Рендер»: один флаг без зависимостей, чтобы материалы читали его, не подтягивая режим целиком
/* Parts that look different in «Рендер» (the tray's foil, the foil's reflections) read this; scene/render-mode.js sets it.
   It has no imports on purpose: a new import between big modules changes the order they run in, and with it the paper
   grain (made from Math.random when the page loads), so pictures of the plain view would change. */
let on = false;
const renderOn = () => on;
const setRenderOn = v => { on = !!v; };

export { renderOn, setRenderOn };
