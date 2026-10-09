// Шаблон развёртки (SVG) и развёртка с дизайном (PNG)
import { DEG, esc, fmt, slug, toast } from '../core/util.js';
import { activeObj } from '../core/state.js';
import { faceKeys, faceLabel, faceMM, isClearFace, netLayout } from '../core/model.js';
import { RT, markObj } from '../scene/renderer.js';
import { CUP_GLUE, fanOutline, fanXY } from '../carriers/cup.js';
import { BAG_MATS, bagFilm, bagSVG } from '../carriers/bag.js';
import { cutNetWindow, netWindows } from '../carriers/box.js';
import { dieLines } from '../carriers/box-net.js';
import { carryOn } from '../carriers/carry.js';
import { paperBagSVG } from '../carriers/paperbag.js';
import { handleBoxSVG } from '../carriers/handle-box.js';
import { SLEEVE_GLUE } from '../carriers/sleeve.js';
import { cropPx, drawNetPanel, renderFace, setSkipStickers } from '../faces/render.js';
import { saveFile } from '../core/project.js';
import { panelPath } from './net-view.js';
import { fluteName } from '../carriers/corrugated.js';

function templateSVG(o) {
  const n = netLayout(o), f = v => +v.toFixed(2);
  let body = '';
  const label = (p) => { const [mw, mh] = p.fold || p.crop ? [p.w, p.h] : faceMM(o, p.key), ang = (p.q ?? (p.rot ? 2 : 0)) * 90, pet = p.reverse ? ' · с оборота' : isClearFace(o, p.key) ? (o.type === 'bag' ? ` · ${BAG_MATS[o.bagMat].toLowerCase()}` : ' · ПЭТ') : '';
    const txt = `${faceLabel(o, p.key).toUpperCase()}${p.half ? ` (${p.half} половина)` : ''} · ${fmt(mw, 1)}×${fmt(mh, 1)} мм${pet}`, fs = Math.min(Math.max(3, Math.min(p.w, p.h) * .07), p.w * .92 / (txt.length * .56));
    return `<text x="${f(p.x + p.w / 2)}" y="${f(p.y + p.h / 2)}"${ang ? ` transform="rotate(${ang} ${f(p.x + p.w / 2)} ${f(p.y + p.h / 2)})"` : ''} font-family="Arial, sans-serif" font-size="${f(fs)}" fill="#9a9a9a" text-anchor="middle" dominant-baseline="middle">${esc(txt)}</text>`; };
  if (o.type === 'bag') body = bagSVG(o, n, f, label);
  else if (o.type === 'board') {
    // the covering sheets of a cake board: cut round, the edge and the turn-under marked as folds
    const pts = q => q.map(v => v.map(f).join(',')).join(' ');
    for (const p of n.panels) body += `<polygon points="${pts(p.poly)}" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`
      + p.folds.map(q => `<polygon points="${pts(q)}" fill="none" stroke="#e6007e" stroke-width="0.3" stroke-dasharray="2 1.2"/>`).join('') + label(p);
  }
  else if (o.type === 'dome') {
    // each wall is cut on three sides and folded up from the floor along its narrow edge
    for (const p of n.panels) {
      if (p.part && p.poly) body += `<polygon points="${p.poly.map(v => v.map(f).join(',')).join(' ')}" fill="none" stroke="#00a0e3" stroke-width="0.3" stroke-dasharray="1.2 1.2"/>`;
      else if (p.poly) {
        const [a, b, c, e] = p.poly, pts = q => q.map(v => v.map(f).join(',')).join(' ');
        body += `<polyline points="${pts([b, c, e, a])}" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`;
        body += `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="#e6007e" stroke-width="0.3" stroke-dasharray="2 1.2"/>`;
      } else if (p.part) body += `<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}" rx="${f(p.r)}" fill="none" stroke="#00a0e3" stroke-width="0.3" stroke-dasharray="1.2 1.2"/>`;
      body += label(p);
    }
  }
  else if (o.type === 'cup') {
    const F = n.fan, G = F.G, P = pts => pts.map(([X, Y], i) => `${i ? 'L' : 'M'}${f(X)},${f(Y)}`).join(' ');
    body += `<path d="${P(fanOutline(F, -F.gU, 1, 240))} Z" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`;
    body += `<path d="${P([fanXY(F, 0, 0), fanXY(F, 0, 1)])}" fill="none" stroke="#e6007e" stroke-width="0.3" stroke-dasharray="2 1.2"/>`;
    const [cx, cy] = fanXY(F, .5, .5), fs = Math.max(3, G.Hr * .05);
    const [gx, gy] = fanXY(F, -F.gU / 2, .5), ga = F.cone ? (-F.gU / 2 - .5) * G.Phi / DEG : 0;
    body += `<text x="${f(cx)}" y="${f(cy)}" font-family="Arial, sans-serif" font-size="${f(fs)}" fill="#9a9a9a" text-anchor="middle" dominant-baseline="middle">СТЕНКА СТАКАНА · ⌀${fmt(o.dims.w)}/${fmt(o.dims.d)}×${fmt(o.dims.h)} мм${G.dbl ? ' · ВНЕШНИЙ СЛОЙ' : ''}</text>`;
    body += `<text x="${f(gx)}" y="${f(gy)}" transform="rotate(${f(ga - 90)} ${f(gx)} ${f(gy)})" font-family="Arial, sans-serif" font-size="${f(Math.min(fs, CUP_GLUE * .45))}" fill="#9a9a9a" text-anchor="middle" dominant-baseline="middle">НАХЛЁСТ ${CUP_GLUE} мм</text>`;
    if (F.cone) body += `<text x="${f(cx)}" y="${f(cy + fs * 1.6)}" font-family="Arial, sans-serif" font-size="${f(fs * .7)}" fill="#9a9a9a" text-anchor="middle" dominant-baseline="middle">R ${fmt(G.s1, 1)} / ${fmt(G.s0, 1)} мм · угол ${fmt(G.Phi / DEG, 2)}° + нахлёст · высота по образующей ${fmt(G.L, 1)} мм</text>`;
  } else if (o.type === 'tube' || o.type === 'torte') {
    for (const p of n.panels) {
      if (p.key === 'carry') {
        // the carrier sleeve: one die-cut band, creased at the folds, the back leaf glued to the front one
        const poly = q => `<polygon points="${q.map(v => v.map(f).join(',')).join(' ')}" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`;
        body += poly(p.poly) + p.holes.map(poly).join('') + glueZone(p, f)
          + p.creases.map(l => `<line x1="${f(l[0])}" y1="${f(l[1])}" x2="${f(l[2])}" y2="${f(l[3])}" stroke="#e6007e" stroke-width="0.3" stroke-dasharray="2 1.2"/>`).join('') + label(p);
        continue;
      }
      body += p.circle ? `<circle cx="${f(p.x + p.w / 2)}" cy="${f(p.y + p.h / 2)}" r="${f(p.w / 2)}" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`
        : `<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`;
      body += label(p);
    }
  } else if (n.pb) body = paperBagSVG(o, n, f, label);
  else if (n.hb) body = handleBoxSVG(o, n, f, label);
  else if (n.v === 2) body = blankSVG(o, n, f, label);
  else {
    const { w, h, d } = o.dims, oy = n.oy;
    // base cut outline (the lid row is cut as separate parts)
    const L = n.lid, ly = L ? L.fh : 0, fx0 = L ? L.fx - L.el : 0, fx1 = L ? L.fx + L.fw + L.el : 0;
    const pts = n.backLid
      ? [[0, oy], [n.tx, oy], [n.tx, ly], [fx0, ly], ...(L.el ? [[fx0, L.ch], [fx0 + L.ch, 0], [fx1 - L.ch, 0], [fx1, L.ch]] : [[fx0, 0], [fx1, 0]]), [fx1, ly], [n.tx + n.tw, ly], [n.tx + n.tw, oy],
         [2 * d + 2 * w, oy], [2 * d + 2 * w, oy + h], [d + w, oy + h], [d + w, oy + h + d], [d, oy + h + d], [d, oy + h], [0, oy + h]]
      : n.hinged
      ? [[n.tx, 0], [n.tx + n.tw, 0], [n.tx + n.tw, oy], [2 * d + 2 * w, oy], [2 * d + 2 * w, oy + h], [d + w, oy + h], [d + w, oy + h + d], [d, oy + h + d], [d, oy + h], [0, oy + h], [0, oy], [n.tx, oy]]
      : [[0, 0], [2 * d + 2 * w, 0], [2 * d + 2 * w, oy + h], [d + w, oy + h], [d + w, oy + h + d], [d, oy + h + d], [d, oy + h], [0, oy + h]];
    body += `<polygon points="${pts.map(p => p.map(f).join(',')).join(' ')}" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`;
    const wins = netWindows(o, n);
    let folds = [[d, oy + h, d + w, oy + h], [d, oy, d, oy + h], [d + w, oy, d + w, oy + h], [2 * d + w, oy, 2 * d + w, oy + h]];
    if (n.hinged) folds.push([d, oy, d + w, oy]);
    if (n.folds) {
      folds.push([0, oy, 2 * d + 2 * w, oy]);
      for (const x of [d, d + w, 2 * d + w]) body += `<line x1="${f(x)}" y1="0" x2="${f(x)}" y2="${f(oy)}" stroke="#00a0e3" stroke-width="0.3"/>`;
    }
    for (const q of wins) {
      if (q.polys) { for (const pl of q.polys) body += `<path d="${pl.map((v, i) => `${i ? 'L' : 'M'}${f(v.x)},${f(v.y)}`).join(' ')} Z" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`; continue; }
      const [tl, tr, br, bl] = q.radii, x = q.x, y = q.y, X = q.x + q.w, Y = q.y + q.h, arc = (r, ex, ey) => r ? `A${f(r)},${f(r)} 0 0 1 ${f(ex)},${f(ey)}` : '';
      body += `<path d="M${f(x + tl)},${f(y)} H${f(X - tr)} ${arc(tr, X, y + tr)} V${f(Y - br)} ${arc(br, X - br, Y)} H${f(x + bl)} ${arc(bl, x, Y - bl)} V${f(y + tl)} ${arc(tl, x + tl, y)} Z" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`;
    }
    if (n.backLid) {
      folds.push([2 * d + w, oy, 2 * d + 2 * w, oy]);
      if (ly > 0) folds.push([L.fx, ly, L.fx + L.fw, ly]);
      if (L.el) folds.push([L.fx, 0, L.fx, ly], [L.fx + L.fw, 0, L.fx + L.fw, ly]);
    }
    // folds stop where a window opening crosses them
    folds = folds.flatMap(([x1, y1, x2, y2]) => {
      const hor = Math.abs(y1 - y2) < 1e-6; let segs = [[hor ? x1 : y1, hor ? x2 : y2]];
      for (const q of wins) {
        const inside = hor ? (y1 > q.y + .01 && y1 < q.y + q.h - .01) : (x1 > q.x + .01 && x1 < q.x + q.w - .01);
        if (!inside) continue;
        const a = hor ? q.x : q.y, b = hor ? q.x + q.w : q.y + q.h;
        segs = segs.flatMap(([s0, s1]) => [[s0, Math.min(s1, a)], [Math.max(s0, b), s1]].filter(([u, v]) => v - u > .01));
      }
      return segs.map(([u, v]) => hor ? [u, y1, v, y1] : [x1, u, x1, v]);
    });
    const poly = q => `<polygon points="${q.map(v => v.map(f).join(',')).join(' ')}" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`;
    // a sleeve and its glue flap are cut as one outline (the flap's edge is a crease)
    for (const p of n.panels) if (p.part && !p.crease) body += p.poly ? poly(p.poly) + (p.holes || []).map(poly).join('') : `<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h + (p.key === 'sleeve' ? SLEEVE_GLUE : 0))}" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`;
    for (const p of n.panels) { folds.push(...(p.creases || [])); if (p.crease) folds.push([p.x, p.y, p.x + p.w, p.y]); }
    // the leaf of a handle that is glued to the other one, on its back
    for (const p of n.panels) if (p.glue?.length) body += `<polygon points="${p.glue.map(v => v.map(f).join(',')).join(' ')}" fill="#f39200" fill-opacity="0.12" stroke="#f39200" stroke-width="0.3" stroke-dasharray="1 1"/><text x="${f(p.x + p.w / 2)}" y="${f(p.glue.reduce((a, v) => a + v[1], 0) / p.glue.length)}" font-family="Arial, sans-serif" font-size="3" fill="#c46f00" text-anchor="middle" dominant-baseline="middle">клей с оборота</text>`;
    body += folds.map(l => `<line x1="${f(l[0])}" y1="${f(l[1])}" x2="${f(l[2])}" y2="${f(l[3])}" stroke="#e6007e" stroke-width="0.3" stroke-dasharray="2 1.2"/>`).join('');
    for (const p of n.panels) body += p.blank ? `<text x="${f(p.x + p.w / 2)}" y="${f(p.y + p.h / 2)}" font-family="Arial, sans-serif" font-size="${f(Math.max(2.5, Math.min(p.w, p.h) * .3))}" fill="#9a9a9a" text-anchor="middle" dominant-baseline="middle">${esc(p.blank.toUpperCase())}</text>` : label(p);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${f(n.W)}mm" height="${f(n.H)}mm" viewBox="0 0 ${f(n.W)} ${f(n.H)}">
<!-- Box Studio 3D — ${esc(o.name)}. ${o.type === 'paperbag' ? 'Голубой: рез, пурпурный пунктир: биговка. Лист: перед, правый фальц, зад, левый фальц и клеевой клапан в ряд; сверху отворот внутрь, снизу клапаны дна, разрезанные у углов фальцев. По середине фальцев биговка, внизу — диагонали складывания дна. Оранжевым — где с оборота отворота клеятся ножки ручек. Схему дна сверьте с типографией. Вылеты 3 мм добавьте в типографском макете.' : o.type === 'bag' ? 'Голубой: рез, пурпурный пунктир: сгиб, зелёный пунктир: запайка (шов), оранжевый: клеевая лента клапана. Клапан, отворот и задняя половина экстендера лежат на развёртке вверх ногами — подписи повёрнуты так же.' + (o.bagStyle === 'block' ? ' Дно показано упрощённо, одной панелью: схему складывания дна сверьте с типографией.' : ' Пакет сложен по дну: перед повёрнут на 180°.') + ' Вылеты добавьте в типографском макете.' : o.type === 'board' ? 'Подложка под торт: голубой — рез листа покрытия, пурпурный пунктир — сгибы.' + (n.panels[0].folds.length ? ' Лист верха больше подложки: внутренний пунктир — край верха, внешний — низ борта; за ним полоса загибается под подложку.' : ' Лист верха вырубается по контуру подложки и кашируется на картон без загиба.') + (n.panels.some(p => p.key === 'bottom') ? ' Лист низа (справа, вид снизу) закрывает загнутые края.' : '') + (n.panels.some(p => p.key === 'collar') ? ' Ацетатная лента (прозрачный ПЭТ) — полоса под листами: справа нахлёст под клей за пунктиром; незапечатанное остаётся прозрачным.' : '') + ' Вылеты 3 мм добавьте в типографском макете.' : o.type === 'torte' ? 'Зоны печати на прозрачной крышке тортницы (ПЭТ, формованная деталь, не вырубается): стенка в развёртке по средней окружности и круглый верх. Крышка почти цилиндрическая (небольшой конус), поэтому развёртка стенки — прямоугольник. Сверьте с технологом формовки.' + (carryOn(o) ? ' Рукав-переноска — бумажная вырубка, одна лента: голубой — рез, пурпурный пунктир — биговка. Лента начинается и кончается на верху ручки: её концы — лепестки с проймами, они складываются оборотом друг к другу и склеиваются (оранжевый пунктир: клей с оборота). Подписи стоят на панели дна. Вылеты 3 мм добавьте в типографском макете.' : '') : o.type === 'dome' ? 'Голубой: линия реза, пурпурный пунктир: биговка (дно / стенка). Дно в центре, стенки отогнуты от его краёв; стенки расходятся к борту, поэтому углы остаются открытыми — складки и клапаны в углах решаются конструкцией штанцформы. Пунктир голубого: зона печати на прозрачной крышке (ПЭТ, не вырубается). Вылеты 3 мм добавьте в типографском макете.' : o.type === 'cup' ? 'Голубой: линия реза стенки стакана (веер), пурпурный пунктир: край нахлёста на шве. Верхняя дуга — край у бортика, нижняя — у дна. Размер монтажной области = размер развёртки. Вылеты 3 мм добавьте в типографском макете.' : 'Голубой: линия реза, пурпурный пунктир: биговка. Размер монтажной области = размер развёртки. Вылеты 3 мм добавьте в типографском макете. ' + (fluteName(o) ? `Материал: ${fluteName(o)}. ` : '') + (n.hb ? 'Гильза: перед, крышка, зад, дно и клеевой клапан; торцы закрываются клапанами с замком «язычок в прорезь». ' + (n.leaves ? 'Ручка вырублена из крышки: лепестки лежат в вырезе окна и поднимаются по биговкам у краёв перемычки. Снаружи у поднятой ручки оборот листа, поэтому её дизайн печатается с оборота: серый пунктир «Оборот крышки» показывает, как лепестки лежат на обороте (вид с оборота). Сторона лепестка к другому лепестку — лицо листа, там печать крышки.' : 'Лепестки ручки — отдельные детали.') + ' Подложка — отдельная деталь.' : n.shape === 'pillow' ? 'Коробка-подушка: две панели (лицо и оборот) и клеевой клапан слева; дуговые биговки у концов — по ним концы вдавливаются внутрь. Ширина панелей — по дуге сечения, а не по ширине готовой коробки.' : n.shape === 'gable' ? 'Коробка-домик: стенки в ряд (левый фронтон, перед, правый фронтон, зад) и клеевой клапан слева; над передом и задом — скат и ручка с проймой (биговка между ними), фронтоны загибаются внутрь. Дно — под передом, клей — под задом; схему дна сверьте с технологом.' : n.shape === 'pyramid' ? 'Пирамида: основание в центре, треугольные грани отогнуты от его рёбер. Клапаны для склейки граней добавьте по технологии производства.' : n.shape === 'hexagon' ? 'Многогранник: сверху стенки коробки в ряд с клеевым клапаном и дном под передней стенкой, снизу — стенки крышки и её верх над передней стенкой. Края дна и верха приклеиваются к стенкам; клапаны склейки добавьте по технологии.' : n.rigid === 'casket' ? 'Шкатулка, жёсткая: слева бумага основания (дно в центре, стенки вокруг), справа — крышки (верх в центре, её стенки вокруг). Загибы через борт внутрь, угловые клапаны («клей») переходят на бока. Картонные детали — по размерам граней; петли и бархат — отдельно.' : n.rigid === 'drawer' ? 'Коробка с ящиком, жёсткая: сверху бумага футляра — лента (левый бок, верх, правый бок, дно) с клеевым клапаном и загибами по краям, справа его задняя стенка; снизу бумага ящика — перед ящика в крест с остальными стенками (без печати), загибы через борт. Ленточка-язычок вклеивается за переднюю стенку ящика.' : n.book ? 'Коробка-книжка, жёсткая: слева бумага переплёта — дно, корешок (вверх ногами), крышка и клапан в ряд, между ними зазоры на сгиб (две толщины картона), по краю загибы 15 мм внутрь. Справа бумага лотка: стенки вокруг дна, загибы через борт внутрь, угловые клапаны («клей») переходят на бока. Картон переплёта и лотка — отдельные детали по размерам граней.' : n.fefco === '0201' ? 'Заготовка FEFCO 0201 (четырёхклапанный короб): стенки в ряд — левый бок, перед, правый бок, зад; клеевой клапан слева клеится к свободному краю задней стенки. Сверху и снизу у каждой стенки клапан в половину глубины, между клапанами прорези. Клапаны переда и зада наружные: на них половины граней «Крышка» и «Дно» (на заднем клапане вверх ногами), боковые клапаны — внутренние, без печати.' : n.fefco === '0427' ? 'Заготовка FEFCO 0427 (мейлер, без клея): дно в центре с прорезями для замков; боковые стенки и перед двойные — за наружной стенкой полоса сгиба, внутренняя стенка и замки, которые входят в прорези дна; ушки по краям передней и задней стенок заводятся между слоями боковых стенок. Крышка — за задней стенкой, её передний край завёрнут (полоса сгиба), за ним клапан с пылевыми ушками уходит внутрь за переднюю стенку. Полосы сгиба, внутренние стенки и замки — без подписей, они не печатаются.' : n.v === 2 ? 'Заготовка — лоток-крест: дно в центре, стенки отогнуты от его краёв; трапеции «клей» в углах — клеевые клапаны передней и задней стенок, они клеятся к внутренней стороне боковых стенок.' + (faceKeys(o).includes('top') && o.lidType !== 'telescope' ? ' Крышка отогнута от верхнего края задней стенки, клапан и ушки — за ней.' : '') + (o.lidType === 'telescope' ? ' Крышка — отдельная заготовка того же вида справа.' : '') + ' Подписи повёрнуты так, как грань лежит на листе.' : 'Крышка с клапаном и ушками крепится к задней стенке и лежит на развёртке вверх ногами — подписи повёрнуты так же.') + (o.tissue?.on && o.lidType !== 'handle' ? ` Бумага тишью — отдельный лист (пунктир голубым)${o.tissue.layout === 'cross' ? ', нужно два одинаковых' : ''}; режется в размер, не вырубается.` : '') + (o.insert?.on && o.lidType !== 'handle' ? (o.insert.mat === 'foam' ? ' Ложемент из пены вырезается отдельно, на развёртке его нет.' : ' Ложемент — отдельная вырубка внизу: площадка с ячейками, вырубленными насквозь, и бортики, загнутые вниз до дна.') : '') + (o.sleeve?.on && o.sleeve.handle?.on ? ' Рукав с ручкой — одна лента: её концы — лепестки ручки с проймами, они складываются оборотом друг к другу и склеиваются (оранжевый пунктир: клей с оборота); клеевого клапана нет.' : '')} -->
<g id="dieline">${body}</g>
</svg>`;
}
/* a box blank laid out as it is made: cut and crease lines from the panels' shared edges, glue flaps, windows */
function blankSVG(o, n, f, label) {
  const rect = p => [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]];
  const pieces = [...n.panels.map(p => ({ key: p.key, joins: p.joins, pts: p.poly || rect(p) })), ...(n.tabs || []).map(t => ({ key: 'tab', joins: [t.on], pts: t.pts }))];
  const { cuts, creases } = dieLines(pieces), wins = netWindows(o, n);
  const line = (l, stroke, dash) => `<line x1="${f(l[0])}" y1="${f(l[1])}" x2="${f(l[2])}" y2="${f(l[3])}" stroke="${stroke}" stroke-width="0.3"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  const poly = q => `<polygon points="${q.map(v => v.map(f).join(',')).join(' ')}" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`;
  let body = cuts.map(l => line(l, '#00a0e3')).join('');
  for (const q of wins) body += windowPath(q, f);
  for (const p of n.panels) body += (p.holes || []).map(poly).join('');
  for (const p of n.panels) if (p.glue?.length) body += glueZone(p, f);
  body += splitByWindows([...creases, ...n.panels.flatMap(p => p.creases || [])], wins).map(l => line(l, '#e6007e', '2 1.2')).join('');
  for (const t of n.tabs || []) { const [cx, cy] = t.pts.reduce((a, v) => [a[0] + v[0] / t.pts.length, a[1] + v[1] / t.pts.length], [0, 0]); body += `<text x="${f(cx)}" y="${f(cy)}" font-family="Arial, sans-serif" font-size="2.5" fill="#9a9a9a" text-anchor="middle" dominant-baseline="middle">клей</text>`; }
  for (const p of n.panels) body += p.blank ? `<text x="${f(p.x + p.w / 2)}" y="${f(p.y + p.h / 2)}" font-family="Arial, sans-serif" font-size="${f(p.fs ?? Math.max(2.5, Math.min(p.w, p.h) * .3))}" fill="#9a9a9a" text-anchor="middle" dominant-baseline="middle">${esc(p.blank)}</text>` : p.fold ? '' : label(p);
  return body;
}
/* an opening on the sheet: a polygon, or a rectangle with its corner radii */
function windowPath(q, f) {
  if (q.polys) return q.polys.map(pl => `<path d="${pl.map((v, i) => `${i ? 'L' : 'M'}${f(v.x)},${f(v.y)}`).join(' ')} Z" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`).join('');
  const [tl, tr, br, bl] = q.radii, x = q.x, y = q.y, X = q.x + q.w, Y = q.y + q.h, arc = (r, ex, ey) => r ? `A${f(r)},${f(r)} 0 0 1 ${f(ex)},${f(ey)}` : '';
  return `<path d="M${f(x + tl)},${f(y)} H${f(X - tr)} ${arc(tr, X, y + tr)} V${f(Y - br)} ${arc(br, X - br, Y)} H${f(x + bl)} ${arc(bl, x, Y - bl)} V${f(y + tl)} ${arc(tl, x + tl, y)} Z" fill="none" stroke="#00a0e3" stroke-width="0.3"/>`;
}
/* creases stop where a window opening crosses them */
function splitByWindows(lines, wins) {
  return lines.flatMap(([x1, y1, x2, y2]) => {
    // slanted creases (a pyramid's sides) are not crossed by windows
    if (Math.abs(y1 - y2) > 1e-6 && Math.abs(x1 - x2) > 1e-6) return [[x1, y1, x2, y2]];
    const hor = Math.abs(y1 - y2) < 1e-6; let segs = [[Math.min(hor ? x1 : y1, hor ? x2 : y2), Math.max(hor ? x1 : y1, hor ? x2 : y2)]];
    for (const q of wins) {
      const inside = hor ? (y1 > q.y + .01 && y1 < q.y + q.h - .01) : (x1 > q.x + .01 && x1 < q.x + q.w - .01);
      if (!inside) continue;
      const a = hor ? q.x : q.y, b = hor ? q.x + q.w : q.y + q.h;
      segs = segs.flatMap(([s0, s1]) => [[s0, Math.min(s1, a)], [Math.max(s0, b), s1]].filter(([u, v]) => v - u > .01));
    }
    return segs.map(([u, v]) => hor ? [u, y1, v, y1] : [x1, u, x1, v]);
  });
}
/* the leaf of a handle that is glued to the other one, on its back */
const glueZone = (p, f) => `<polygon points="${p.glue.map(v => v.map(f).join(',')).join(' ')}" fill="#f39200" fill-opacity="0.12" stroke="#f39200" stroke-width="0.3" stroke-dasharray="1 1"/><text x="${f(p.x + p.w / 2)}" y="${f(p.glue.reduce((a, v) => a + v[1], 0) / p.glue.length)}" font-family="Arial, sans-serif" font-size="3" fill="#c46f00" text-anchor="middle" dominant-baseline="middle">клей с оборота</text>`;
function exportTemplate() {
  const o = activeObj(); if (!o) return toast('Выберите объект');
  saveFile(`${slug(o.name)}-razvertka-${fmt(netLayout(o).W)}x${fmt(netLayout(o).H)}mm.svg`, new Blob([templateSVG(o)], { type: 'image/svg+xml' }));
}
function exportFlat() {
  const o = activeObj(); if (!o) return toast('Выберите объект');
  const n = netLayout(o), k = Math.min(6000 / Math.max(n.W, n.H), 300 / 25.4);
  const out = document.createElement('canvas'); out.width = Math.round(n.W * k); out.height = Math.round(n.H * k);
  const c = out.getContext('2d'), rt = RT.get(o.id);
  // stickers are applied after printing, so the print sheet leaves them out
  setSkipStickers(true); for (const key of faceKeys(o)) renderFace(o, key); setSkipStickers(false);
  for (const p of n.panels) {
    const fc = rt.faces[p.key]?.canvas, x = p.x * k, y = p.y * k, w = p.w * k, h = p.h * k;
    c.save(); c.beginPath(); panelPath(c, p, 0, 0, k); c.clip();
    if (fc) drawNetPanel(c, fc, p, x, y, w, h, cropPx(fc, p)); else if (p.fold) { c.fillStyle = o.faces.front?.bg || o.board; c.fillRect(x, y, w, h); }
    else if (p.blank && !bagFilm(o)) { c.fillStyle = p.reverse ? o.faces.inside?.bg || o.board : o.board; c.fillRect(x, y, w, h); }
    c.restore();
  }
  // hand holes and the like go through the sheet
  c.save(); c.globalCompositeOperation = 'destination-out';
  for (const p of n.panels) for (const hl of p.holes || []) { c.beginPath(); hl.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](X * k, Y * k)); c.closePath(); c.fill(); }
  c.restore();
  for (const t of n.tabs || []) { c.beginPath(); t.pts.forEach(([X, Y], i) => c[i ? 'lineTo' : 'moveTo'](X * k, Y * k)); c.closePath(); c.fillStyle = o.board || '#ffffff'; c.fill(); }
  cutNetWindow(c, o, 0, k);
  markObj(o);
  out.toBlob(b => saveFile(`${slug(o.name)}-razvertka-dizain.png`, b), 'image/png');
}

export { exportFlat, exportTemplate };
