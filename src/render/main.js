// Студийный рендер: кадр дочищается, пока стоит на месте (отдельный файл, грузится по требованию; three.js берёт у редактора)
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* While the view stands still, every frame adds one sample to the picture: the camera is shifted by a sub-pixel
   (Halton 2,3: antialiasing) and the key light over a small disk (soft shadows); each sample gets screen-space
   ambient occlusion (GTAO, its noise turned per sample) and the samples are averaged in a float target. The average
   is then tone mapped by our own shader (Neutral, the editor's exposure), with a glow of the real highlights only,
   a vignette and a static grain. A frame that changed (a camera move, an edit) is drawn without the sampling.
   The marks over the scene (rings, selection frame, floor plate) are never part of it: they are hidden while it is
   drawn, then drawn last, unshifted, over a depth-only copy of the scene so that they stay behind what hides them.
   The picture keeps its alpha (premultiplied): the page's own background shows through, as without the mode.
   Every pass guards against NaN and Inf (Apple's GPUs make them out of degenerate tangents): a bad texel is left out
   of the average. */
const LOOK = { ao: .6, bloom: .3, vig: 0, vigExport: .3, grain: .12, contrast: .06, keyR: .07 };   // vig 0 on screen: the canvas is transparent over the page's own background, which a vignette would dirty; vigExport is for a picture with our background (PNG export). keyR: the light's disk, as a share of its distance
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const BAD = 'bool bad(vec3 v){ return !(abs(v.x) < 1e5 && abs(v.y) < 1e5 && abs(v.z) < 1e5); }   // true for NaN and Inf too';
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const fx = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending });

function create(ctx) {
  const { renderer, scene, camera, key, viewport } = ctx;
  const low = !!window.__forceLow || matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 500;
  const FT = !window.__forceHalf && renderer.extensions.has('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;   // the running average needs the precision
  const NS = +new URLSearchParams(location.search).get('n') || Math.min(low ? 16 : 64, FT === THREE.FloatType ? 64 : 32);
  const rt = (type, o = {}) => new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: false, ...o });
  const rtScene = rt(THREE.HalfFloatType, { samples: low ? 0 : 4, depthBuffer: true }), rtFrame = rt(THREE.HalfFloatType), rtShow = rt(THREE.HalfFloatType);
  const rtAcc = [0, 1].map(() => rt(FT, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }));
  let cur = 0, W = 1, H = 1, accN = 0, sampleMs = 0, lightMoved = false;
  const quad = new FullScreenQuad(null);
  const run = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); quad.render(renderer); };

  /* AO: three's GTAOPass with its noise turned per sample (the golden angle), so the average converges */
  const gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.output = GTAOPass.OUTPUT.Off; gtao.normalMaterial.side = THREE.DoubleSide;
  gtao.updatePdMaterial({ radius: 6 });
  const addFrame = (m, from, patch) => {
    if (!m.fragmentShader.includes(from)) console.warn('GTAO noise patch missed');
    m.fragmentShader = m.fragmentShader.replace('uniform sampler2D tNoise;', 'uniform sampler2D tNoise; uniform float uFrame;').split(from).join(from + patch);
    m.uniforms.uFrame = { value: 0 }; m.needsUpdate = true;
  };
  addFrame(gtao.gtaoMaterial, 'vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);',
    'vec2 nd = noiseTexel.xy * 2.0 - 1.0; float na = atan(nd.y, nd.x) + uFrame * 2.399963; noiseTexel.xy = vec2(cos(na), sin(na)) * 0.5 + 0.5; noiseTexel.w = fract(noiseTexel.w + uFrame * 0.7548777);');
  addFrame(gtao.pdMaterial, 'vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);', 'noiseTexel = fract(noiseTexel + uFrame * 0.618034);');
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), LOOK.bloom, .7, 6);   // threshold 6 in linear HDR: only real highlights
  bloom.highPassUniforms.smoothWidth.value = .6;

  /* the AO is multiplied in; on the (otherwise invisible) floor it also raises the alpha = a soft contact shadow */
  const mComp = fx(`uniform sampler2D tScene, tAO, tNormal; uniform float uAO, uInject, uGuard; uniform mat4 uCam; varying vec2 vUv;
${BAD}
void main(){
  vec4 c = texture2D(tScene, vUv);
  if (uInject > .5) { vec2 g = floor(gl_FragCoord.xy / 6.); float h = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453); if (h > .997) c.rgb = vec3(sqrt(-uInject), 1e30 * uInject, 1. / (uInject - 1.)); }   // debug: NaN / Inf blocks
  float ao = texture2D(tAO, vUv).r;
  if (uGuard > .5 && !(ao >= 0. && ao <= 1.)) ao = 1.;   // NaN -> no occlusion
  float k = exp(log(max(ao, 1e-3)) * uAO);
  vec3 nv = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
  vec3 n = (uCam * vec4(nv, 0.0)).xyz; n = dot(n, n) > 1e-8 ? normalize(n) : vec3(0.);
  float floorM = smoothstep(.9, .98, n.y);
  vec4 o = vec4(c.rgb * k, c.a + (1.0 - c.a) * (1.0 - k) * floorM);
  if (uGuard > .5) { if (bad(o.rgb) || !(o.a == o.a)) o = vec4(0., 0., 0., -1.); else o = vec4(clamp(o.rgb, 0., 32.), clamp(o.a, 0., 1.)); }   // alpha -1 marks a bad texel: the average ignores it
  gl_FragColor = o;
}`, { uInject: { value: 0 }, uGuard: { value: 1 }, tScene: { value: null }, tAO: { value: null }, tNormal: { value: null }, uAO: { value: LOOK.ao * 2 }, uCam: { value: new THREE.Matrix4() } });
  const mAcc = fx(`uniform sampler2D tPrev, tNew; uniform float uW, uGuard; varying vec2 vUv;
${BAD}
void main(){
  vec4 p = texture2D(tPrev, vUv), n = texture2D(tNew, vUv);
  if (uGuard > .5) {
    bool nb = n.a < 0. || bad(n.rgb) || !(n.a == n.a), pb = bad(p.rgb) || !(p.a == p.a);
    if (nb && pb) { gl_FragColor = vec4(0.); return; }
    if (nb) { gl_FragColor = uW >= 1. ? vec4(0.) : p; return; }   // a bad new texel: keep the average as it was
    if (pb) { gl_FragColor = n; return; }
  }
  gl_FragColor = mix(p, n, uW);
}`, { uGuard: { value: 1 }, tPrev: { value: null }, tNew: { value: null }, uW: { value: 1 } });
  const mCopy = fx(`uniform sampler2D tMap; uniform float uGuard; varying vec2 vUv;
${BAD}
void main(){ vec4 t = texture2D(tMap, vUv); if (uGuard > .5) t = (bad(t.rgb) || !(t.a == t.a)) ? vec4(0.) : vec4(clamp(t.rgb, 0., 64.), clamp(t.a, 0., 1.)); gl_FragColor = t; }   // keeps one hot texel from flooding the bloom mips
`, { uGuard: { value: 1 }, tMap: { value: null } });
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); black.needsUpdate = true;
  /* the final look: tone map (Neutral, the exposure of the scene), glow, vignette (a black layer: it darkens the page's
     background too), static grain; premultiplied, so the page's background shows through where nothing is drawn */
  const mFinal = fx(`precision highp float;
uniform sampler2D tAcc, tGlow; uniform float uVig, uGrain, uCon; varying vec2 vUv;
#include <tonemapping_pars_fragment>
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
${BAD}
void main(){
  vec4 t = texture2D(tAcc, vUv);
  if (bad(t.rgb) || !(t.a == t.a)) t = vec4(0.);
  float a = clamp(t.a, 0., 1.);
  vec3 obj = a > 1e-3 ? min(t.rgb / a, vec3(64.)) : vec3(0.);
  vec3 gl = texture2D(tGlow, vUv).rgb; if (bad(gl)) gl = vec3(0.); gl = clamp(gl, 0., 64.);
  vec3 g = NeutralToneMapping(gl);
  vec3 col = pow(NeutralToneMapping(max(obj, 0.)), vec3(1. + uCon)) * a + g;
  float al = clamp(max(a, max(g.r, max(g.g, g.b))), 0., 1.);
  float v = uVig * smoothstep(.45, 1.35, length((vUv - .5) * 2.));
  col *= 1. - v; al += (1. - al) * v;
  vec3 un = al > 1e-4 ? clamp(col / al, 0., 1.) : vec3(0.);
  vec3 o = sRGBTransferOETF(vec4(un, 1.)).rgb;
  float n = hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 17.3) - 1.;
  float l = dot(o, vec3(.299, .587, .114));
  o = clamp(o + n * (uGrain * .05 * (1. - .6 * abs(l * 2. - 1.)) + 1. / 255.), 0., 1.);
  gl_FragColor = vec4(o * al, al);
}`, { tAcc: { value: null }, tGlow: { value: null }, uVig: { value: LOOK.vig }, uGrain: { value: LOOK.grain }, uCon: { value: LOOK.contrast } });

  mFinal.toneMapped = false;   // we tone map ourselves

  function resize(w, h) {
    W = w; H = h; accN = 0;
    const as = low ? .5 : 1;
    for (const t of [rtScene, rtFrame, rtShow, ...rtAcc]) t.setSize(W, H);
    gtao.setSize(Math.round(W * as), Math.round(H * as)); gtao.updateGtaoMaterial({ samples: low ? 12 : 24, radius: .14, thickness: .35, distanceExponent: 1 });
    bloom.setSize(W, H);
  }
  /* meshes hidden for a pass, put back by the returned function */
  function hideMeshes(pred) {
    const hid = []; scene.traverse(o => { if (o.isMesh && o.visible && pred(o)) { o.visible = false; hid.push(o); } });
    return () => hid.forEach(o => { o.visible = true; });
  }
  const mats = o => [o.material].flat().filter(Boolean);
  // clear plastic and alpha-cut parts are no wall for the occlusion (the lid is left out: the AO belongs to what is seen through it)
  const notSolid = o => mats(o).some(m => (m.transparent && !m.depthWrite) || m.alphaTest > .4);
  const isContact = o => o.material === ctx.contactMat;   // the drawn contact shadow: the AO does that here

  // the camera shifted by a sub-pixel on top of the editor's own pan (its view offset, CSS px)
  function shift(i) {
    const cw = viewport.clientWidth, ch = viewport.clientHeight, pr = renderer.getPixelRatio(), v = camera.view?.enabled ? camera.view : null;
    camera.setViewOffset(cw, ch, (v ? v.offsetX : 0) + (halton(i + 1, 2) - .5) / pr, (v ? v.offsetY : 0) + (halton(i + 1, 3) - .5) / pr, cw, ch);
  }
  const base = new THREE.Vector3(), dir = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3();
  function shiftLight(i) {
    base.copy(key.position); dir.copy(base).sub(key.target.position); const dist = dir.length(); dir.normalize();
    U.crossVectors(dir, Math.abs(dir.y) > .95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize(); V.crossVectors(dir, U);
    const r = dist * LOOK.keyR * Math.sqrt(halton(i + 1, 5)), a = 2 * Math.PI * halton(i + 1, 7);
    key.position.addScaledVector(U, r * Math.cos(a)).addScaledVector(V, r * Math.sin(a));
  }

  /* one sample: shifted camera and light -> scene -> AO -> composite -> running average */
  function sample(i) {
    const t0 = performance.now(), key0 = key.position.clone(), view = camera.view?.enabled ? { ...camera.view } : null, radius = key.shadow.radius;
    if (i) { shift(i); shiftLight(i); key.shadow.radius = Math.max(1, radius * .5); }   // the light's disk softens the shadow now
    renderer.shadowMap.needsUpdate = true; lightMoved = true;
    const showContact = hideMeshes(isContact);
    renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
    gtao.gtaoMaterial.uniforms.uFrame.value = gtao.pdMaterial.uniforms.uFrame.value = i;
    const showClear = hideMeshes(notSolid);
    gtao.render(renderer, null, null);
    showClear(); showContact();
    const u = mComp.uniforms;
    u.tScene.value = rtScene.texture; u.tAO.value = gtao.gtaoMap; u.tNormal.value = gtao.normalRenderTarget.texture;
    const guard = window.__noGuard ? 0 : 1; u.uGuard.value = mAcc.uniforms.uGuard.value = mCopy.uniforms.uGuard.value = guard; u.uInject.value = window.__inject === i ? 1 : 0;
    u.uCam.value.copy(camera.matrixWorld);
    run(mComp, rtFrame);
    mAcc.uniforms.tPrev.value = rtAcc[cur].texture; mAcc.uniforms.tNew.value = rtFrame.texture; mAcc.uniforms.uW.value = 1 / (i + 1);
    run(mAcc, rtAcc[1 - cur]); cur = 1 - cur;
    if (view) camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height); else camera.clearViewOffset();
    key.position.copy(key0); key.shadow.radius = radius;
    if (window.__studioSync) renderer.readRenderTargetPixels(rtAcc[cur], 0, 0, 1, 1, new Float32Array(4));   // debug only: forces the GPU to finish, for timing
    sampleMs = performance.now() - t0;
  }
  /* the average -> the glow of its highlights -> the final look on the screen */
  function display() {
    let glow = black;
    if (LOOK.bloom > 0) {
      mCopy.uniforms.tMap.value = rtAcc[cur].texture; run(mCopy, rtShow);
      bloom.strength = LOOK.bloom * 1.2; bloom.render(renderer, null, rtShow, 0, false);
      glow = bloom.renderTargetsHorizontal[0].texture;
    }
    mFinal.uniforms.tAcc.value = rtAcc[cur].texture; mFinal.uniforms.tGlow.value = glow;
    run(mFinal, null);
  }
  /* a frame that changed: the scene as it is, with the final look, no sampling */
  function preview() {
    renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
    mFinal.uniforms.tAcc.value = rtScene.texture; mFinal.uniforms.tGlow.value = black;
    run(mFinal, null);
  }
  /* the marks over the scene, last: a depth-only copy of the scene (clear plastic writes no depth), then the marks alone */
  function overlays(restore) {
    const saved = new Map();
    scene.traverse(o => { if (o.isMesh && o.visible) for (const m of mats(o)) saved.set(m, m.colorWrite); });
    saved.forEach((_, m) => { m.colorWrite = false; });
    renderer.autoClear = false; renderer.setRenderTarget(null); renderer.clearDepth(); renderer.render(scene, camera);
    saved.forEach((c, m) => { m.colorWrite = c; });
    restore();
    const was = camera.layers.mask; camera.layers.set(ctx.overlayLayer);
    renderer.render(scene, camera);
    camera.layers.mask = was; renderer.autoClear = true;
  }

  function frame(changed) {
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (s.x !== W || s.y !== H) resize(s.x, s.y);
    if (changed) { accN = 0; if (lightMoved) { lightMoved = false; ctx.staleShadow(); } }
    const marks = ctx.overlaysShown(), restore = ctx.hideOverlays(), ac = renderer.autoClear;
    ctx.petLinear.value = 1;   // clear plastic is drawn into a linear target
    if (changed) preview(); else { sample(accN++); display(); }
    ctx.petLinear.value = 0;
    if (marks) overlays(restore); else restore();
    renderer.autoClear = ac;
    window.__studio = { n: accN, N: NS, done: !changed && accN >= NS, sampleMs, W, H, low, half: FT !== THREE.FloatType };
  }
  const pending = () => accN < Math.min(NS, window.__studioCap || NS);
  // turned off: the big targets are given back (they are sized again at the next frame)
  const release = () => { resize(1, 1); W = 0; H = 0; lightMoved = false; ctx.staleShadow(); window.__studio = { n: 0, N: NS, done: false, off: true }; };
  return { frame, pending, release };
}

window.__bsRender = { create };
