(function () {
'use strict';
const V = window.V2, M = V.meta;
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const b64buf = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

// ------------------------------------------------------------------ helpers
function inPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function ringArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function innerPoint(poly) {
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (const p of poly) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
  let best = [(minx + maxx) / 2, (minz + maxz) / 2], bd = -1;
  for (let a = 0; a <= 14; a++) for (let b = 0; b <= 14; b++) {
    const x = lerp(minx, maxx, a / 14), z = lerp(minz, maxz, b / 14);
    if (!inPoly(x, z, poly)) continue;
    let md = 1e9;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - p[0]) * dx + (z - p[1]) * dz) / L2, 0, 1);
      md = Math.min(md, Math.hypot(x - p[0] - t * dx, z - p[1] - t * dz));
    }
    if (md > bd) { bd = md; best = [x, z]; }
  }
  return best;
}

// ------------------------------------------------------------------ 1 m DEM (S-map dem_2025), later carved under buildings / the court
const [X0, Z0, X1, Z1] = M.crop, DW = M.dem.w, DH = M.dem.h;
const HF = new Float32Array(DW * DH);
{ const raw = new Uint16Array(b64buf(V.dem)); for (let i = 0; i < raw.length; i++) HF[i] = raw[i] * M.dem.scale; }
const HF0 = HF.slice();                                  // untouched ground, for sampling outside carved areas
function sampleGrid(A, x, z) {
  const fx = clamp(x - X0, 0, DW - 1.001), fz = clamp(z - Z0, 0, DH - 1.001), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
  return A[j * DW + i] * (1 - u) * (1 - v) + A[j * DW + i + 1] * u * (1 - v) + A[(j + 1) * DW + i] * (1 - u) * v + A[(j + 1) * DW + i + 1] * u * v;
}
const getH = (x, z) => sampleGrid(HF, x, z), getH0 = (x, z) => sampleGrid(HF0, x, z);
function rasterPoly(poly, fn) {
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
  for (const p of poly) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); }
  for (let j = Math.max(0, Math.floor(c - Z0)); j <= Math.min(DH - 1, Math.ceil(d - Z0)); j++)
    for (let i = Math.max(0, Math.floor(a - X0)); i <= Math.min(DW - 1, Math.ceil(b - X0)); i++)
      if (inPoly(X0 + i, Z0 + j, poly)) fn(j * DW + i, X0 + i, Z0 + j);
}
function distToPoly(x, z, poly) {
  let m = 1e9;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
    m = Math.min(m, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return m;
}
function obb(poly) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], a = Math.atan2(q[1] - p[1], q[0] - p[0]), c = Math.cos(a), s = Math.sin(a);
    let mnu = 1e9, mxu = -1e9, mnv = 1e9, mxv = -1e9;
    for (const r of poly) { const u = r[0] * c + r[1] * s, v = -r[0] * s + r[1] * c; mnu = Math.min(mnu, u); mxu = Math.max(mxu, u); mnv = Math.min(mnv, v); mxv = Math.max(mxv, v); }
    const A = (mxu - mnu) * (mxv - mnv);
    if (!best || A < best.A) { const cu = (mnu + mxu) / 2, cv = (mnv + mxv) / 2; best = { A, ang: a, w: mxu - mnu, d: mxv - mnv, cx: cu * c - cv * s, cz: cu * s + cv * c }; }
  }
  if (best.d > best.w) { best.ang += Math.PI / 2; const t = best.w; best.w = best.d; best.d = t; }
  return best;
}
const CAMPUS = M.campus;
const nameP = (n) => (M.names.find((x) => x.n === n) || {}).p;
// building pads: ground inside every S-map footprint sits at that building's floor level
for (const f of M.footprints) rasterPoly(f.p, (k) => { HF[k] = f.min; });
// Manhae square: flat court
const COURT = (M.areas || []).find((a) => a.k === 'pitch' && a.s !== 'soccer');
let COURT_Y = 0, BLEACH = null;
if (COURT) {
  const hs = []; rasterPoly(COURT.p, (k) => hs.push(HF0[k])); hs.sort((a, b) => a - b);
  COURT_Y = hs[Math.floor(hs.length * 0.5)];
  rasterPoly(COURT.p, (k) => { HF[k] = COURT_Y; });
  // stone bleachers where the hill rises above the court
  let cx = 0, cz = 0; COURT.p.forEach((p) => { cx += p[0]; cz += p[1]; }); cx /= COURT.p.length; cz /= COURT.p.length;
  const ring = COURT.p.slice(); if (ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
  const STEP_H = 0.42, STEP_D = 0.85;
  const rows = ring.map((p) => {
    const nx = p[0] - cx, nz = p[1] - cz, L = Math.hypot(nx, nz) || 1, ux = nx / L, uz = nz / L;
    let hOut = -1e9; for (let d = 2; d <= 16; d += 1) hOut = Math.max(hOut, getH0(p[0] + ux * d, p[1] + uz * d));
    return { p, ux, uz, n: hOut - COURT_Y > 1.0 ? Math.min(16, Math.floor((hOut - COURT_Y) / STEP_H)) : 0 };
  });
  BLEACH = { rows, cx, cz, STEP_H, STEP_D };
  for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) {
    const x = X0 + i, z = Z0 + j;
    if (Math.abs(x - cx) > 90 || Math.abs(z - cz) > 90 || inPoly(x, z, ring)) continue;
    const d = distToPoly(x, z, ring); if (d > 16 * STEP_D) continue;
    const ang = Math.atan2(z - cz, x - cx); let bi = 0, bd = 1e9;
    rows.forEach((r, k) => { const a = Math.atan2(r.p[1] - cz, r.p[0] - cx); let dd = Math.abs(a - ang); if (dd > Math.PI) dd = 2 * Math.PI - dd; if (dd < bd) { bd = dd; bi = k; } });
    const n = rows[bi].n; if (!n || d > n * STEP_D) continue;
    const k = Math.floor(d / STEP_D) + 1;
    HF[j * DW + i] = Math.min(HF[j * DW + i], COURT_Y + STEP_H * k - 0.5);
  }
}
const FIELD = (M.areas || []).find((a) => a.k === 'pitch' && a.s === 'soccer');
let FIELD_Y = 0;
if (FIELD) { const hs = []; rasterPoly(FIELD.p, (k) => hs.push(HF0[k])); hs.sort((a, b) => a - b); FIELD_Y = hs[Math.floor(hs.length / 2)]; const big = FIELD.p; rasterPoly(big, (k) => { HF[k] = FIELD_Y; }); }
let BASEY = 1e9; for (const p of CAMPUS) BASEY = Math.min(BASEY, getH(p[0], p[1])); BASEY -= 10;
let cx0 = 0, cz0 = 0; for (const p of CAMPUS) { cx0 += p[0]; cz0 += p[1]; } cx0 /= CAMPUS.length; cz0 /= CAMPUS.length;
const HC = getH(cx0, cz0);
// outside the campus fence the land falls away: sheer cliffs down into the haze
const CLIFF_Y = BASEY - 260;

// ------------------------------------------------------------------ renderer, soft sun shadows, sky reflections
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// pixel ratio adapts to the frame rate (see adaptRes); the sun's shadow map is only redrawn when something that casts a shadow moves
// phones and small machines (LITE) get a smaller shadow map, a lower pixel-ratio ceiling and fewer particles (see game.js)
const LITE = window.LITE = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
const PR_MAX = Math.min(window.devicePixelRatio || 1, LITE ? 1.3 : 1.5);
let PR = Math.min(PR_MAX, LITE ? 0.9 : 1);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const scene = new THREE.Scene();
const HAZE = new THREE.Color(0.80, 0.87, 0.93);                      // the sky's horizon colour; fog is mixed in after tone mapping, so it matches 1:1
scene.fog = new THREE.FogExp2(HAZE, 0.00034);   // light enough that Namsan and the tower, about 1.5 km off, stay clear
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 6000);
const controls = new THREE.OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 3; controls.maxDistance = 1500;
controls.screenSpacePanning = false; controls.autoRotateSpeed = 0.35;
const lin = (h) => new THREE.Color(h).convertSRGBToLinear();
scene.add(new THREE.HemisphereLight(0xd8e6f4, 0x7d7262, 0.7));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.05);
sun.position.set(cx0 - 300, HC + 460, cz0 + 360); sun.target.position.set(cx0, HC, cz0);
sun.castShadow = true; sun.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.25;
Object.assign(sun.shadow.camera, { left: -340, right: 340, top: 340, bottom: -340, near: 50, far: 1500 });
scene.add(sun, sun.target);
(function envCube() {
  const S = 128, faces = [];
  const grad = (top, mid, bot) => { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, top); gr.addColorStop(0.5, mid); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, S, S); return c; };
  const flat = (col) => { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, S, S); return c; };
  const side = grad('#6f9fd6', '#d6e3ee', '#8a8273');
  faces.push(side, side, flat('#5d8fd0'), flat('#7a7262'), side, side);
  const env = new THREE.CubeTexture(faces); env.encoding = THREE.sRGBEncoding; env.needsUpdate = true;
  scene.environment = env;
})();
const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'varying vec3 p; void main(){ float h = clamp(p.y,0.0,1.0); vec3 c = mix(vec3(0.80,0.87,0.93), vec3(0.27,0.49,0.79), pow(h,0.55)); gl_FragColor = vec4(c,1.0); }'
}));
scene.add(sky);
const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
let seed = 20261024;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
const cv2d = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };
const texOf = (c, srgb, rep) => { const t = new THREE.CanvasTexture(c); if (srgb) t.encoding = THREE.sRGBEncoding; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; return t; };
function normalFromHeight(hc, k) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = cv2d(w, h), og = out.getContext('2d'), id = og.createImageData(w, h), d = id.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let nx = (H(x - 1, y) - H(x + 1, y)) * k, ny = (H(x, y + 1) - H(x, y - 1)) * k, nz = 1;
    const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
    const o = (y * w + x) * 4; d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  og.putImageData(id, 0, 0); return out;
}

// ------------------------------------------------------------------ facades: 8 bays x 8 floors per texture, row 0 is the ground floor
// lum = luminance detail, hgt = relief (normal map), rm: R = accent mask, G = roughness, B = glass mask
const BAY = 3.6, FLOOR = 3.6, TU = 8 * BAY, FC = 128;
const FAC = {};
function facade(style) {
  if (FAC[style]) return FAC[style];
  const W = FC * 8, Hh = FC * 8;
  const L = cv2d(W, Hh), Hc = cv2d(W, Hh), R = cv2d(W, Hh);
  const gl = L.getContext('2d'), gh = Hc.getContext('2d'), gr = R.getContext('2d');
  const put = (x, y, w, h, o) => {
    if (o.l !== undefined) { gl.fillStyle = typeof o.l === 'string' ? o.l : `rgb(${o.l},${o.l},${o.l})`; gl.fillRect(x, y, w, h); }
    if (o.h !== undefined) { gh.fillStyle = `rgb(${o.h},${o.h},${o.h})`; gh.fillRect(x, y, w, h); }
    if (o.r !== undefined) { gr.fillStyle = `rgb(${o.a || 0},${o.r},${o.g || 0})`; gr.fillRect(x, y, w, h); }
  };
  const wall = { l: 236, h: 128, r: 215, a: 0, g: 0 }, frame = { l: 248, h: 190, r: 170, a: 0, g: 0 };
  const glass = (x, y, w, h) => {
    const g2 = gl.createLinearGradient(0, y, 0, y + h); g2.addColorStop(0, '#d8dde2'); g2.addColorStop(0.45, '#9aa4ad'); g2.addColorStop(1, '#6f7a84');
    gl.fillStyle = g2; gl.fillRect(x, y, w, h);
    put(x, y, w, h, { h: 70, r: 38, a: 0, g: 255 });
    put(x, y, w, 3, { l: 120, h: 60 }); put(x, y, 3, h, { l: 140, h: 62 });                 // reveal shadow
  };
  const accent = (x, y, w, h, lum, ht) => put(x, y, w, h, { l: lum || 225, h: ht || 200, r: 190, a: 255, g: 0 });
  put(0, 0, W, Hh, wall);
  for (let i = 0; i < 2200; i++) { const v = 228 + Math.floor(rnd() * 16); gl.fillStyle = `rgb(${v},${v},${v})`; gl.fillRect(rnd() * W, rnd() * Hh, 2, 2); }
  const door = (x, y, w, h) => {                                                          // glazed double door with frame and handles
    put(x - 4, y - 4, w + 8, h + 4, { l: 90, h: 175, r: 120 });
    glass(x, y, w / 2 - 2, h); glass(x + w / 2 + 2, y, w / 2 - 2, h);
    put(x + w / 2 - 6, y + h * 0.45, 3, 18, { l: 210, h: 220 }); put(x + w / 2 + 3, y + h * 0.45, 3, 18, { l: 210, h: 220 });
  };
  for (let r = 0; r < 8; r++) for (let i = 0; i < 8; i++) {
    const x = i * FC, y = (7 - r) * FC, ground = r === 0;
    if (style === 'stone') {
      for (let k = 0; k < 8; k++) put(x, y + k * 16, FC, 1, { l: 205, h: 110 });
      for (let k = 0; k < 8; k++) for (let m = 0; m < 4; m++) put(x + m * 32 + (k % 2) * 16, y + k * 16, 1, 16, { l: 210, h: 112 });
      if (ground && i % 4 === 1) { accent(x + 22, y + 6, 84, 10, 220, 200); door(x + 34, y + 30, 60, 98); continue; }
      accent(x + 30, y + 10, 68, 8, 228, 205); put(x + 32, y + 18, 64, 82, { l: 200, h: 150 });
      glass(x + 38, y + 22, 52, 74);
      put(x + 62, y + 22, 4, 74, frame); put(x + 38, y + 56, 52, 4, frame);
      accent(x + 30, y + 98, 68, 7, 232, 215);
    } else if (style === 'ribbon') {
      if (ground) { glass(x + 2, y + 12, FC - 4, 110); for (let k = 0; k < 3; k++) put(x + k * 43, y + 12, 4, 110, frame); if (i % 4 === 1) door(x + 30, y + 30, 68, 92); put(x, y + 122, FC, 6, { l: 170, h: 150 }); continue; }
      put(x, y, FC, 20, { l: 240, h: 150 });
      glass(x, y + 26, FC, 64);
      for (let k = 0; k < 4; k++) put(x + k * 32, y + 26, 4, 64, frame);
      put(x, y + 24, FC, 3, frame); put(x, y + 89, FC, 4, frame);
      put(x, y + 118, FC, 10, { l: 225, h: 140 });
    } else if (style === 'curtain') {
      glass(x, y, FC, FC - 14);
      put(x, y + FC - 14, FC, 14, { l: 150, h: 120, r: 120, a: 0, g: 255 });                // opaque spandrel glass
      for (let k = 0; k < 3; k++) put(x + k * 43, y, 5, FC, frame);
      put(x, y + FC - 16, FC, 4, frame); put(x, y + 44, FC, 3, frame);
      if (ground && i % 4 === 1) door(x + 34, y + 34, 60, 94);
    } else if (style === 'grid' || style === 'tile') {
      if (style === 'tile') for (let k = 0; k < 16; k++) put(x, y + k * 8, FC, 1, { l: 220, h: 118 });
      if (ground && i % 4 === 1) { door(x + 30, y + 28, 68, 100); accent(x + 20, y + 16, 88, 8); continue; }
      put(x + 14, y + 20, 100, 80, frame);
      glass(x + 18, y + 24, 92, 72);
      put(x + 62, y + 24, 4, 72, frame); put(x + 18, y + 54, 92, 3, frame);
      put(x + 12, y + 100, 104, 6, { l: 225, h: 205 });
      put(x, y + 120, FC, 8, { l: 226, h: 150 });
    } else if (style === 'brick') {
      for (let k = 0; k < 21; k++) for (let m = -1; m < 6; m++) { const v = 170 + Math.floor(rnd() * 70); put(x + m * 22 + (k % 2) * 11, y + k * 6, 21, 5, { l: v, h: 132 }); }
      if (ground && i % 4 === 1) { accent(x + 22, y + 18, 84, 10); door(x + 32, y + 30, 64, 98); continue; }
      accent(x + 16, y + 16, 96, 9);
      glass(x + 20, y + 26, 88, 66);
      put(x + 62, y + 26, 4, 66, frame); put(x + 20, y + 58, 88, 3, frame);
      accent(x + 16, y + 92, 96, 7, 230, 215);
    } else if (style === 'louver') {
      put(x, y, FC, 16, { l: 238, h: 150 });
      glass(x, y + 16, FC, 104);
      put(x, y + 64, FC, 3, frame);
      for (let k = 0; k < 8; k++) accent(x + k * 16 + 4, y + 16, 7, 104, 215, 235);
      if (ground && i % 4 === 1) door(x + 34, y + 30, 60, 98);
    } else if (style === 'panel') {
      for (let k = 0; k < 3; k++) put(x, y + k * 43, FC, 2, { l: 214, h: 110 });
      for (let k = 0; k < 2; k++) put(x + k * 64, y, 2, FC, { l: 214, h: 110 });
      if (ground) { if (i % 4 === 1) door(x + 34, y + 30, 60, 98); else if (i % 2) glass(x + 10, y + 20, 108, 100); continue; }
      if (i % 2 === 0) { glass(x + 44, y + 14, 40, 96); put(x + 62, y + 14, 3, 96, frame); }
    }
  }
  const out = { map: texOf(L, true, true), normalMap: texOf(normalFromHeight(Hc, 3.0), false, true), rm: texOf(R, false, true) };
  FAC[style] = out; return out;
}
function facadeMaterial(style, wallHex, glassHex, accentHex) {
  const T = facade(style);
  const m = new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.normalMap, roughnessMap: T.rm, roughness: 1, metalness: 0, envMapIntensity: 1.0 });
  const U = { uWall: { value: lin(wallHex) }, uGlass: { value: lin(glassHex || '#5f7f92') }, uAccent: { value: lin(accentHex || '#efece6') } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = 'uniform vec3 uWall; uniform vec3 uGlass; uniform vec3 uAccent;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec2 fUv = vec2(vUv.x, (vUv.y < 1.0 ? vUv.y : 1.0 + mod(vUv.y - 1.0, 7.0)) / 8.0);
        vec4 fRm = texture2D(roughnessMap, fUv);
        vec3 fLum = mapTexelToLinear(texture2D(map, fUv)).rgb;
        bool fPar = vUv.y < -5.0 && vUv.y > -50.0;
        if (fPar) {
          float dTop = (-10.0 - vUv.y) * 3.6;                          // metres below the top of the wall
          float cop = step(dTop, 0.26), shd = step(0.26, dTop) * step(dTop, 0.36);
          fRm = vec4(0.0, 0.92 - cop * 0.3, 0.0, 1.0);
          fLum = vec3(0.9 + 0.22 * cop) * (1.0 - 0.35 * shd);
        }
        // every window pane its own: blinds half down, a lamp left on, a darker room, a little more sky in the glass
        vec2 wId = floor(vec2(vUv.x * 8.0, vUv.y));
        float wh = fract(sin(dot(wId, vec2(12.9898, 78.233))) * 43758.5453), wh2 = fract(wh * 7.13);
        vec3 gl = uGlass * 1.6 * (0.72 + 0.5 * wh2);
        gl = mix(gl, vec3(0.86, 0.82, 0.72), step(0.84, wh) * step(0.55, fract(vUv.y * 1.0 + 0.6)));
        gl = mix(gl, vec3(1.0, 0.84, 0.56) * 0.75, step(0.955, wh));
        vec3 fBase = mix(mix(uWall, uAccent, fRm.r), gl, fRm.b);
        diffuseColor.rgb *= fLum * fBase;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * max(fRm.g, 0.06);')
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = fPar ? vec3(0.0, 0.0, 1.0) : texture2D(normalMap, fUv).xyz * 2.0 - 1.0; mapN.xy *= normalScale;
        normal = perturbNormal2Arb(-vViewPosition, normal, mapN, faceDirection);`);
  };
  m.customProgramCacheKey = () => 'facade-v5';
  m.userData.U = U;
  return m;
}
const roofTex = (() => { const c = cv2d(256), g = c.getContext('2d'); g.fillStyle = '#e6e3dd'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 1500; i++) { const v = 200 + Math.floor(rnd() * 50); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * 256, rnd() * 256, 3, 3); } g.fillStyle = 'rgba(0,0,0,.08)'; for (let k = 0; k < 4; k++) { g.fillRect(k * 64, 0, 2, 256); g.fillRect(0, k * 64, 256, 2); } return texOf(c, true, true); })();
const panelRoofTex = (() => { const c = cv2d(256), g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256); for (let k = 0; k < 16; k++) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(k * 16, 0, 3, 256); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(k * 16 + 4, 0, 2, 256); } return texOf(c, true, true); })();

// per-building looks, taken from the campus-map photos
const BCFG = {
  '명진관': { f: 'stone', w: '#cbc2b0', g: '#2d6074', a: '#ddd5c5', r: '#868c91', d: '1956년 건축가 송민구가 설계한, 캠퍼스에서 가장 오래된 건물. 대한민국 건축상을 받았고 근대문화유산으로 꼽힌다. 사암빛 석조 외벽 가운데로 세로 창이 길게 난 탑이 솟아 있다.' },
  '본관': { f: 'ribbon', w: '#f2f1ed', g: '#4f9aa3', r: '#7f8c8d', d: '대학 본부(남산홀). 3층에 기부자를 기리는 명예의 전당이 있다. 흰 띠와 청록 띠창이 겹친 외관.' },
  '만해관': { f: 'curtain', w: '#f3f5f6', g: '#3f8f95', r: '#8d8173', d: '시인이자 독립운동가 만해 한용운의 이름을 딴 건물. 법학관과 이어져 있고 청록 유리 커튼월이 특징이다.' },
  '혜화관': { f: 'ribbon', w: '#f3f2ee', g: '#7f8e98', r: '#7f9b8c' },
  '혜화별관': { f: 'curtain', w: '#c9ced3', g: '#41678a', r: '#8f8a80' },
  '사회과학관.경영관': { f: 'curtain', w: '#e9ebec', g: '#4f8496', r: '#8c9590' },
  '문화관': { f: 'panel', w: '#e2dccd', g: '#5f948a', r: '#8a9298', d: '개교 90주년 기념관 가운데 한 동. 곡면 외벽 아래 이해랑예술극장 입구가 있다.' },
  '학술관': { f: 'panel', w: '#e7e5e0', g: '#6f8794', r: '#8a9298', d: '개교 90주년 기념관 가운데 한 동.' },
  '모 대학교 박물관': { f: 'stone', w: '#d8d1c2', g: '#3d4650', a: '#ece6da', r: '#7a7468', d: '1963년 문을 연 불교 박물관.' },
  '다향관': { f: 'curtain', w: '#ecebe6', g: '#3f78a8', r: '#86806f' },
  '체육관': { f: 'grid', w: '#eeede8', g: '#6c8796', r: '#3f73b6', roof: 'panel' },
  '학림관(J)': { f: 'tile', w: '#cfb68c', g: '#4f9a9c', a: '#f0ece2', r: '#8c9394' },
  '계산관': { f: 'brick', w: '#a5563f', g: '#55636c', a: '#ece8e0', r: '#76706a' },
  '학생회관': { f: 'tile', w: '#c9a57a', g: '#5d7480', r: '#8a8172' },
  '정보문화관(P)': { f: 'curtain', w: '#c8c4bc', g: '#4f9a86', a: '#efece6', r: '#7f9f64' },
  '정보문화관(Q)': { f: 'brick', w: '#9c5a45', g: '#5b6d76', a: '#d9d6cf', r: '#6f6a64' },
  '원흥관': { f: 'grid', w: '#f0eee9', g: '#5d7381', r: '#8b9590' },
  '원흥별관': { f: 'brick', w: '#c26a3e', g: '#4f7d86', a: '#f0ede6', r: '#8b8f8c' },
  '남산학사': { f: 'louver', w: '#e4e2dc', g: '#5a7d8f', a: '#c99a52', r: '#7f9690', d: '기숙사. 유리 위로 금빛 세로 루버가 촘촘히 붙어 있다.' },
  '신공학관': { f: 'louver', w: '#f2f1ee', g: '#5c7b8a', a: '#e2a92e', r: '#8a9a9c', roof: 'panel', d: '공과대학 건물. 흰 벽 사이로 노란 세로 패널이 줄지어 있고 지붕엔 태양광 패널이 덮여 있다.' },
  '과학관': { f: 'grid', w: '#ecebe6', g: '#5f7682', r: '#8e8170' },
  '중앙도서관': { f: 'panel', w: '#e3ddd1', g: '#2f9a90', r: '#86a86c', d: '135만 권이 넘는 장서를 갖춘 도서관. 옥상정원 하늘마루에서 남산과 도심이 보인다.' },
  '상록원 학생식당': { f: 'panel', w: '#d8d5ce', g: '#5d7480', r: '#9a8b78', d: '학생식당. 곡선 경사로가 외벽을 감싼다.' }
};
const DEF_CFG = { f: 'grid', w: '#e6e3dc', g: '#5f7682', r: '#8e918e' };

// ------------------------------------------------------------------ ground: base colour + splat (R lawn, G asphalt, B paving) with tiled close-up detail
function noiseTex(draw) { const c = cv2d(256), g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256); draw(g); return texOf(c, false, true); }
const DET = {
  grass: noiseTex((g) => { for (let i = 0; i < 9000; i++) { const v = 90 + Math.floor(rnd() * 90); g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1; const x = rnd() * 256, y = rnd() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 5); g.stroke(); } }),
  pave: noiseTex((g) => { for (let r = 0; r < 24; r++) for (let c = -1; c < 13; c++) { const v = 110 + Math.floor(rnd() * 50); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(c * 21 + (r % 2) * 10 + 1, r * 10.67 + 1, 19, 8.6); } }),
  asph: noiseTex((g) => { for (let i = 0; i < 14000; i++) { const v = 90 + Math.floor(rnd() * 80); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5); } })
};
const VEH = new Set(['service', 'residential', 'living_street', 'tertiary', 'secondary', 'unclassified']);
function noisePattern(ctx, base, specks, size, n, rmin, rmax) {
  const c = cv2d(size), g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) { g.fillStyle = specks[Math.floor(rnd() * specks.length)]; g.globalAlpha = 0.25 + rnd() * 0.5; const r = rmin + rnd() * (rmax - rmin); g.beginPath(); g.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2); g.fill(); }
  return ctx.createPattern(c, 'repeat');
}
// burn / heat map for the game: rgb darkens the ground, alpha < 1 glows like hot rock
const SCORCH = new THREE.DataTexture(new Uint8Array(DW * DH * 4).fill(255), DW, DH, THREE.RGBAFormat);
SCORCH.magFilter = SCORCH.minFilter = THREE.LinearFilter; SCORCH.needsUpdate = true;
async function buildTerrain() {
  const cov = await loadImg(V.cover);
  const PX = 4, cw = Math.round((X1 - X0) * PX), ch = Math.round((Z1 - Z0) * PX);
  const cv = cv2d(cw, ch), g = cv.getContext('2d'), sp = cv2d(cw, ch), s = sp.getContext('2d');
  s.fillStyle = 'rgb(0,0,110)'; s.fillRect(0, 0, cw, ch);
  const small = cv2d(cov.width, cov.height), sg = small.getContext('2d'); sg.drawImage(cov, 0, 0);
  const src = sg.getImageData(0, 0, cov.width, cov.height).data;
  const mask = (cls) => { const m = cv2d(cov.width, cov.height), mg = m.getContext('2d'), id = mg.createImageData(cov.width, cov.height); for (let i = 0; i < src.length; i += 4) id.data[i + 3] = cls.includes(src[i]) ? 255 : 0; mg.putImageData(id, 0, 0); return m; };
  const layer = (ctx, fill, m) => { const Lc = cv2d(cw, ch), lg = Lc.getContext('2d'); lg.fillStyle = fill; lg.fillRect(0, 0, cw, ch); lg.globalCompositeOperation = 'destination-in'; lg.drawImage(m, 0, 0, cw, ch); ctx.drawImage(Lc, 0, 0); };
  g.fillStyle = noisePattern(g, '#b8b0a1', ['#aea696', '#c0b9aa', '#a8a090', '#c5beb0'], 128, 700, 0.8, 2.6); g.fillRect(0, 0, cw, ch);
  const mVeg = mask([1, 2]), mCan = mask([2]);
  layer(g, noisePattern(g, '#94a862', ['#8a9e59', '#a2b46d', '#adb373', '#869553'], 128, 900, 0.8, 2.6), mVeg);
  layer(g, noisePattern(g, '#6c7d44', ['#7b6a3a', '#5f6e3b', '#8a7440', '#66753f', '#4f5e33'], 256, 2600, 2, 7), mCan);
  layer(s, 'rgb(255,0,0)', mVeg);
  const T = (p) => [(p[0] - X0) * PX, (p[1] - Z0) * PX];
  const poly = (ctx, pts) => { ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = T(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
  const line = (ctx, pts) => { ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = T(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
  for (const c of [g, s]) { c.lineJoin = 'round'; c.lineCap = 'round'; }
  // lawns (OSM) — bright, mown, with stone edging
  for (const a of M.green || []) {
    if (a.k !== 'lawn') continue;
    poly(g, a.p); g.fillStyle = noisePattern(g, '#7fae4e', ['#76a447', '#8ab95a', '#71a043'], 64, 260, 0.6, 1.6); g.fill();
    g.strokeStyle = '#d2cbbb'; g.lineWidth = 0.35 * PX; g.stroke();
    poly(s, a.p); s.fillStyle = 'rgb(255,0,0)'; s.fill(); s.strokeStyle = 'rgb(0,0,200)'; s.lineWidth = 0.35 * PX; s.stroke();
  }
  for (const a of M.areas || []) {
    if (a.k === 'parking') { poly(g, a.p); g.fillStyle = '#7c7d7f'; g.fill(); g.strokeStyle = 'rgba(240,240,235,.7)'; g.lineWidth = 0.15 * PX; g.stroke(); poly(s, a.p); s.fillStyle = 'rgb(0,255,0)'; s.fill(); }
    else if (a.k === 'plaza') { poly(g, a.p); g.fillStyle = '#c9bca4'; g.fill(); poly(s, a.p); s.fillStyle = 'rgb(0,0,255)'; s.fill(); }
  }
  // Manhae square court: salmon surface, green basketball court, white lines, red keys
  if (COURT) {
    poly(g, COURT.p); g.fillStyle = '#d79c86'; g.fill(); poly(s, COURT.p); s.fillStyle = 'rgb(0,90,0)'; s.fill();
    const o = obb(COURT.p);
    g.save(); const [fx, fy] = T([o.cx, o.cz]); g.translate(fx, fy); g.rotate(o.ang); g.scale(PX, PX);
    const cw2 = Math.min(30, o.w - 8), ch2 = Math.min(17, o.d - 6);
    g.fillStyle = '#3e9157'; g.fillRect(-cw2 / 2, -ch2 / 2, cw2, ch2);
    g.fillStyle = '#c94c3e'; g.fillRect(-cw2 / 2, -2.45, 5.8, 4.9); g.fillRect(cw2 / 2 - 5.8, -2.45, 5.8, 4.9);
    g.strokeStyle = '#ffffff'; g.lineWidth = 0.08;
    g.strokeRect(-cw2 / 2, -ch2 / 2, cw2, ch2); g.beginPath(); g.moveTo(0, -ch2 / 2); g.lineTo(0, ch2 / 2); g.stroke();
    g.beginPath(); g.arc(0, 0, 1.8, 0, Math.PI * 2); g.stroke();
    for (const sgn of [-1, 1]) { g.beginPath(); g.arc(sgn * (cw2 / 2 - 1.575), 0, 6.75, sgn > 0 ? Math.PI / 2 : -Math.PI / 2, sgn > 0 ? Math.PI * 1.5 : Math.PI / 2); g.stroke(); g.strokeRect(sgn > 0 ? cw2 / 2 - 5.8 : -cw2 / 2, -2.45, 5.8, 4.9); }
    g.restore();
  }
  // main field
  const field = (M.areas || []).find((a) => a.k === 'pitch' && a.s === 'soccer');
  if (field) {
    const o = obb(field.p);
    g.save(); const [fx, fy] = T([o.cx, o.cz]); g.translate(fx, fy); g.rotate(o.ang); g.scale(PX, PX);
    const w = o.w, h = o.d, fw = w - 9, fh = h - 9;
    g.fillStyle = '#a9483a'; g.fillRect(-w / 2, -h / 2, w, h);
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#4f8d3e' : '#5a9a47'; g.fillRect(-fw / 2 + i * fw / 12, -fh / 2, fw / 12 + 0.05, fh); }
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.12;
    g.strokeRect(-fw / 2 + 1, -fh / 2 + 1, fw - 2, fh - 2); g.beginPath(); g.moveTo(0, -fh / 2 + 1); g.lineTo(0, fh / 2 - 1); g.stroke();
    g.beginPath(); g.arc(0, 0, 9.15, 0, Math.PI * 2); g.stroke();
    const bw = Math.min(16.5, fw * 0.16), bh = Math.min(40.3, fh * 0.6);
    g.strokeRect(-fw / 2 + 1, -bh / 2, bw, bh); g.strokeRect(fw / 2 - 1 - bw, -bh / 2, bw, bh);
    for (let k = 1; k <= 5; k++) { g.strokeStyle = 'rgba(255,255,255,0.4)'; g.strokeRect(-w / 2 + k * 1.22, -h / 2 + k * 1.22, w - k * 2.44, h - k * 2.44); }
    g.restore();
    poly(s, field.p); s.fillStyle = 'rgb(200,0,0)'; s.fill();
  }
  // roads: kerb, asphalt, centre line
  for (const r of M.paths) if (VEH.has(r.k)) { line(g, r.p); g.strokeStyle = '#a49c8e'; g.lineWidth = (r.k === 'service' ? 7.2 : 9) * PX; g.stroke(); line(s, r.p); s.strokeStyle = 'rgb(0,0,255)'; s.lineWidth = (r.k === 'service' ? 7.2 : 9) * PX; s.stroke(); }
  for (const r of M.paths) if (VEH.has(r.k)) { line(g, r.p); g.strokeStyle = '#d9d4c9'; g.lineWidth = (r.k === 'service' ? 5.6 : 7.4) * PX; g.stroke(); }
  for (const r of M.paths) if (VEH.has(r.k)) { line(g, r.p); g.strokeStyle = '#66686c'; g.lineWidth = (r.k === 'service' ? 5 : 6.8) * PX; g.stroke(); line(s, r.p); s.strokeStyle = 'rgb(0,255,0)'; s.lineWidth = (r.k === 'service' ? 5 : 6.8) * PX; s.stroke(); }
  for (const r of M.paths) if (VEH.has(r.k) && r.k !== 'service') { line(g, r.p); g.strokeStyle = '#d9b23a'; g.lineWidth = 0.15 * PX; g.stroke(); }
  // footways: brick paving with edging; steps get a 3D stair later
  for (const r of M.paths) {
    if (VEH.has(r.k)) continue;
    const w = r.k === 'steps' ? 2.8 : r.k === 'pedestrian' ? 4 : 2.6;
    line(g, r.p); g.strokeStyle = '#a99f8c'; g.lineWidth = (w + 0.4) * PX; g.stroke();
    line(g, r.p); g.strokeStyle = r.k === 'steps' ? '#b8b0a2' : '#c8b79c'; g.lineWidth = w * PX; g.stroke();
    line(s, r.p); s.strokeStyle = 'rgb(0,0,255)'; s.lineWidth = (w + 0.4) * PX; s.stroke();
  }
  g.save(); g.shadowColor = 'rgba(25,22,15,0.45)'; g.shadowBlur = 12; g.fillStyle = '#5a564f';
  for (const f of M.footprints) { poly(g, f.p); g.fill(); }
  g.restore();
  // a kerb of pale stone along the fence, then everything outside it is cut away (the cliff starts there)
  g.strokeStyle = '#b9b1a2'; g.lineWidth = 1.6 * PX; poly(g, CAMPUS); g.stroke();
  g.strokeStyle = '#8f877a'; g.lineWidth = 0.5 * PX; poly(g, CAMPUS); g.stroke();
  g.globalCompositeOperation = 'destination-in'; poly(g, CAMPUS); g.fillStyle = '#000'; g.fill(); g.globalCompositeOperation = 'source-over';
  const tex = texOf(cv, true, false), stex = texOf(sp, false, false);
  const STEP = 1, nx = Math.floor((X1 - X0) / STEP) + 1, nz = Math.floor((Z1 - Z0) / STEP) + 1;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + i * STEP, z = Z0 + j * STEP, k = j * nx + i;
    pos[k * 3] = x; pos[k * 3 + 1] = getH(x, z); pos[k * 3 + 2] = z;
    uv[k * 2] = (x - X0) / (X1 - X0); uv[k * 2 + 1] = 1 - (z - Z0) / (Z1 - Z0);
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let o = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1; idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = e; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const gm = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.3 });
  gm.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tSplat: { value: stex }, tGrass: { value: DET.grass }, tPave: { value: DET.pave }, tAsph: { value: DET.asph }, tScorch: { value: SCORCH }, uScO: { value: new THREE.Vector4(X0, Z0, DW, DH) } });
    sh.vertexShader = 'varying vec2 vWxz;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform sampler2D tSplat, tGrass, tPave, tAsph, tScorch; uniform vec4 uScO; varying vec2 vWxz;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec3 spl = texture2D(tSplat, vUv).rgb;
      float dg = texture2D(tGrass, vWxz / 1.6).r, dp = texture2D(tPave, vWxz / 2.4).r, da = texture2D(tAsph, vWxz / 3.0).r;
      float det = 1.0;
      det = mix(det, 0.55 + dg * 0.9, spl.r); det = mix(det, 0.72 + da * 0.56, spl.g); det = mix(det, 0.62 + dp * 0.76, spl.b);
      diffuseColor.rgb *= det;
      vec4 scH = texture2D(tScorch, (vWxz - uScO.xy + 0.5) / uScO.zw); diffuseColor.rgb *= scH.rgb;`).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.33, 0.06) * pow(1.0 - scH.a, 1.6) * 4.0;');
  };
  const ground = new THREE.Mesh(geo, gm); ground.name = 'ground'; ground.receiveShadow = true; scene.add(ground);
  buildBackdrop();
}

// ------------------------------------------------------------------ the campus alone, on a rock: past the fence the land drops away as a cliff
// into a sea of cloud. Namsan and N Seoul Tower rise out of the cloud far to the south-west (real bearing and distance: about 1.3 km).
const CLOUD_Y = BASEY - 95;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
// GLSL value noise, shared by the cliff and the cloud shaders
const GLSL_NOISE = `
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { return vn(p) * 0.5 + vn(p * 2.03) * 0.25 + vn(p * 4.01) * 0.125 + vn(p * 8.05) * 0.0625; }
`;
function campusRing(step) {
  const ring = CAMPUS.slice(); if (ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
  if (ringArea(ring) < 0) ring.reverse();
  const pts = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) continue;
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) pts.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
  }
  // outward normals, averaged over a few metres so corners turn instead of folding
  const N = pts.length, nrm = [];
  for (let i = 0; i < N; i++) {
    let nx = 0, nz = 0;
    for (let k = -4; k <= 4; k++) { const p = pts[(i + k - 1 + N * 2) % N], q = pts[(i + k + 1 + N) % N], w = 1 - Math.abs(k) / 5; nx += (q[1] - p[1]) * w; nz += -(q[0] - p[0]) * w; }
    const L = Math.hypot(nx, nz) || 1; nrm.push([nx / L, nz / L]);
  }
  let s = 0; const arc = [0]; for (let i = 1; i < N; i++) { s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); arc.push(s); }
  return { pts, nrm, arc, N };
}
function buildCliffs() {
  const { pts, nrm, arc, N } = campusRing(0.9);
  // rows from the lip down: dense near the top where the eye is, sparse where the cloud swallows it
  const DEP = [0, 0.3, 0.9, 1.8, 3, 4.4, 6, 7.8, 9.8, 12, 14.5, 17.2, 20.2, 23.5, 27, 31, 35.5, 40.5, 46, 52, 59, 67, 76, 86, 98, 112, 128, 150];
  const R = DEP.length, pos = new Float32Array(N * R * 3), col = new Float32Array(N * R * 3), ao = new Float32Array(N * R);
  const BAND = 6.4, c = new THREE.Color();
  const GRASS = lin('#6f8c42'), SOIL = lin('#6b5238'), SOIL2 = lin('#56412c');
  // Namsan is granite: pale grey-beige, warmer where iron stains it
  const ROCK = ['#bdb6a9', '#aaa397', '#c9c1b2', '#9f988c', '#b8ab96', '#d1cabd', '#a99d88'].map(lin);
  for (let i = 0; i < N; i++) {
    const p = pts[i], [nx, nz] = nrm[i], s = arc[i], top = getH(p[0], p[1]);
    // columns: the face juts and recesses along the ring, in blocks of a few metres with a softer wobble on top
    const blk = Math.floor(s / 5.5), colJut = (hash1(blk) - 0.5) * 1.6 + Math.sin(s * 0.37) * 0.35 + Math.sin(s * 1.13 + 2.1) * 0.18;
    for (let r = 0; r < R; r++) {
      const d = DEP[r], y = top - d, k = (r * N + i) * 3;
      let w;
      if (d < 0.01) w = 0;
      else if (d < 0.5) w = 0.35;                                         // the turf lip hangs a little over the edge
      else if (d < 2.2) w = 0.1 - (d - 0.5) * 0.25;                       // under it, soil cut back into the slope
      else {
        const band = Math.floor((y + 400) / BAND), t = (y + 400) / BAND - band;  // horizontal strata in world height
        const ledge = Math.pow(t, 3) * 2.6 - 0.7 + (hash1(band * 7.31 + blk * 0.13) - 0.5) * 0.7;   // each stratum sticks out at its top
        w = colJut * smoothstep(2, 10, d) + ledge * smoothstep(1.5, 6, d) - Math.max(0, d - 34) * 0.2 - Math.pow(Math.max(0, d - 90) / 60, 2) * 14;
        ao[r * N + i] = clamp(0.55 + t * 0.55, 0.55, 1);                  // the underside of every ledge sits in its own shadow
      }
      if (d < 2.2) ao[r * N + i] = 1;
      pos[k] = p[0] + nx * w; pos[k + 1] = y; pos[k + 2] = p[1] + nz * w;
      if (d < 0.5) c.copy(GRASS);
      else if (d < 2.2) c.copy(SOIL).lerp(SOIL2, (d - 0.5) / 1.7);
      else { const band = Math.floor((y + 400) / BAND); c.copy(ROCK[Math.floor(hash1(band * 3.7) * ROCK.length)]).lerp(ROCK[Math.floor(hash1(band * 9.1 + 4) * ROCK.length)], 0.35); c.multiplyScalar((hash1(band * 1.7) < 0.5 ? 0.9 : 1.06) * lerp(1, 0.8, smoothstep(10, 120, d))); }
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
  }
  const idx = new Uint32Array(N * (R - 1) * 6); let o = 0;
  for (let r = 0; r < R - 1; r++) for (let i = 0; i < N; i++) {
    const a = r * N + i, b = r * N + (i + 1) % N, e = a + N, f = b + N;
    idx[o++] = a; idx[o++] = b; idx[o++] = e; idx[o++] = b; idx[o++] = f; idx[o++] = e;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aAo', new THREE.BufferAttribute(ao, 1)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, envMapIntensity: 0.35 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFade = { value: new THREE.Vector2(CLOUD_Y + 45, CLOUD_Y - 5) };
    sh.vertexShader = 'attribute float aAo; varying float vAo; varying vec3 vWp; varying vec3 vWn;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vAo = aAo; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = objectNormal;');
    sh.fragmentShader = 'uniform vec2 uFade; varying float vAo; varying vec3 vWp; varying vec3 vWn;\n' + GLSL_NOISE + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float rn = fbm(vWp * vec3(0.09, 0.3, 0.09));                   // broad mottling, stretched sideways like bedding
        float rg = vn(vWp * 0.8);
        float rc = fbm(vWp * vec3(0.32, 0.12, 0.32));
        diffuseColor.rgb *= 0.84 + rn * 0.3 + rg * 0.06;
        diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.01, 0.045, abs(rc - 0.5)));   // long dark joints
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.06, 0.98, 0.9), smoothstep(0.55, 0.8, vn(vWp * vec3(0.05, 0.4, 0.05))));   // iron stains
        float up = clamp(vWn.y, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.38, 0.17) * (0.8 + rn * 0.4), smoothstep(0.35, 0.75, up) * smoothstep(0.35, 0.7, vn(vWp * 0.6)) * 0.85);   // moss on the ledges
        diffuseColor.rgb *= vAo;`)
      .replace('#include <fog_fragment>', '#include <fog_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(uFade.x, uFade.y, vWp.y));');
  };
  const m = new THREE.Mesh(geo, mat); m.name = 'cliff'; m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false; scene.add(m);
  buildRailing(pts, nrm);
}
// a low guard rail just inside the edge, so the drop reads as a drop; it stops where buildings and gates meet the fence
function buildRailing(pts, nrm) {
  const post = [], rail = [];
  const fpNear = (x, z) => M.footprints.some((f) => inPoly(x, z, f.p) || distToPoly(x, z, f.p) < 1.2);
  const gateNear = (x, z) => M.gates.some((g) => Math.hypot(g.p[0] - x, g.p[1] - z) < 9);
  const N = pts.length, STEP = 3;
  let prev = null;
  for (let i = 0; i < N; i += STEP) {
    const p = pts[i], [nx, nz] = nrm[i], x = p[0] - nx * 0.7, z = p[1] - nz * 0.7;
    if (fpNear(x, z) || gateNear(x, z)) { prev = null; continue; }
    const y = getH(x, z);
    post.push([x, y + 0.55, z, 0.09, 1.1, 0.09, 0]);
    if (prev) {
      const dx = x - prev[0], dz = z - prev[2], L = Math.hypot(dx, dz);
      if (L < 4.5) for (const h of [1.05, 0.55]) rail.push([(x + prev[0]) / 2, (y + prev[1]) / 2 + h, (z + prev[2]) / 2, L, 0.05, 0.05, Math.atan2(dz, dx), Math.atan2(y - prev[1], L)]);
    }
    prev = [x, y, z];
  }
  const box = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshStandardMaterial({ color: lin('#3d4248'), roughness: 0.5, metalness: 0.6 });
  const mk = (list) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(box, mat, list.length), o = new THREE.Object3D();
    list.forEach((b, i) => { o.position.set(b[0], b[1], b[2]); o.rotation.set(0, -b[6], b[7] || 0, 'YZX'); o.scale.set(b[3], b[4], b[5]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  };
  mk(post); mk(rail);
}
// the cloud sea: one big disc, shaded with drifting noise, thick near the rock and thinning toward the horizon
const CLOUD_U = { uT: { value: 0 } };
function buildClouds() {
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  const geo = new THREE.CircleGeometry(4200, 96).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uC: { value: new THREE.Vector2(cx, cz) }, uHaze: { value: HAZE.clone() } }, CLOUD_U), transparent: true, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uT; uniform vec2 uC; uniform vec3 uHaze; varying vec3 vWp;\n' + GLSL_NOISE + `
      void main(){
        vec2 q = vWp.xz * 0.006 + vec2(uT * 0.004, uT * 0.0025);
        float n = fbm(vec3(q, uT * 0.01)), n2 = fbm(vec3(q * 3.1 + 7.0, uT * 0.02));
        float puff = smoothstep(0.32, 0.72, n * 0.8 + n2 * 0.35);
        float d = length(vWp.xz - uC);
        vec3 top = vec3(1.0, 0.99, 0.97), low = vec3(0.72, 0.78, 0.86);
        vec3 c = mix(low, top, puff * 0.85 + n2 * 0.25);
        float far = smoothstep(900.0, 3600.0, d);
        c = mix(c, uHaze, far * 0.85);
        gl_FragColor = vec4(c, mix(0.86 + puff * 0.14, 1.0, far));
      }`
  });
  const m = new THREE.Mesh(geo, mat); m.position.set(cx, CLOUD_Y, cz); m.renderOrder = -1; m.name = 'clouds'; scene.add(m);
  // a second, thinner layer a little higher, drifting the other way, wisps that brush the foot of the cliff
  const m2 = new THREE.Mesh(new THREE.CircleGeometry(1600, 64).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: Object.assign({ uC: { value: new THREE.Vector2(cx, cz) } }, CLOUD_U), transparent: true, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uT; uniform vec2 uC; varying vec3 vWp;\n' + GLSL_NOISE + `
      void main(){
        vec2 q = vWp.xz * 0.011 - vec2(uT * 0.006, -uT * 0.003);
        float n = fbm(vec3(q, 3.0 + uT * 0.015));
        float a = smoothstep(0.5, 0.78, n) * 0.55 * (1.0 - smoothstep(700.0, 1600.0, length(vWp.xz - uC)));
        gl_FragColor = vec4(vec3(0.98, 0.98, 1.0), a);
      }`
  }));
  m2.position.set(cx, CLOUD_Y + 26, cz); m2.renderOrder = -1; scene.add(m2);
}
// Namsan: a forested ridge rising out of the cloud, highest under the tower, running down toward the campus
const NAMSAN = { x: -1000, z: 805, peak: 262 };
const TOWER = { x: -1040, z: 780 };
function namsanF(x, z) {
  const dx = x - NAMSAN.x, dz = z - NAMSAN.z;
  const u = dx * 0.8 - dz * 0.6, v = dx * 0.6 + dz * 0.8;
  const su = u > 0 ? 820 : 700, sv = 400 + Math.max(0, u) * 0.12;
  const n = Math.sin(x * 0.011 + z * 0.007) * 0.08 + Math.sin(x * 0.029 - z * 0.023) * 0.06 + Math.sin(u * 0.02) * 0.05 + Math.sin(v * 0.035 + 1.3) * 0.04;
  const r2 = (u * u) / (su * su) + (v * v) / (sv * sv);
  return Math.exp(-r2 * 1.25) * (1 + n * 0.45) * (1 - 0.15 * Math.exp(-r2 * 30));
}
const namsanH = (x, z) => CLOUD_Y + (NAMSAN.peak - CLOUD_Y) * (namsanF(x, z) - 0.3) / 0.7;
const NS_MESH = {};
function namsanSurf(x, z) {
  const dx = x - NAMSAN.x, dz = z - NAMSAN.z, r = Math.hypot(dx, dz), t = Math.atan2(dz, dx);
  const gul = Math.abs(Math.sin(t * 9 + r * 0.004)) * 14 + Math.abs(Math.sin(t * 23 - r * 0.009)) * 6;
  return namsanH(x, z) - gul * Math.min(1, r / 300);
}
// a hit on the mountain: the ground sinks a little and goes dark around the spot (the mesh is coarse, so it is a soft dent)
function namsanHit(x, z, R) {
  const m = NS_MESH; if (!m.pos) return false;
  if (namsanSurf(x, z) < CLOUD_Y + 2) return false;
  const P = m.pos.array, C = m.col.array, rr = Math.max(R * 1.6, 26);
  for (let i = 0; i < P.length / 3; i++) {
    const dx = P[i * 3] - x, dz = P[i * 3 + 2] - z, d = Math.hypot(dx, dz); if (d > rr) continue;
    const k = 1 - d / rr; P[i * 3 + 1] -= R * 0.18 * k; for (let c = 0; c < 3; c++) C[i * 3 + c] *= 1 - 0.55 * k;
  }
  m.pos.needsUpdate = true; m.col.needsUpdate = true; m.geo.computeVertexNormals();
  return true;
}
function buildNamsan() {
  const R = 1250, NR = 40, NA = 80, pos = [], col = [], idx = [], c = new THREE.Color(), A = lin('#2c4a26'), B = lin('#4d6632');
  for (let i = 0; i <= NR; i++) for (let a = 0; a < NA; a++) {
    const r = R * Math.pow(i / NR, 1.3), t = a / NA * Math.PI * 2, x = NAMSAN.x + Math.cos(t) * r, z = NAMSAN.z + Math.sin(t) * r;
    pos.push(x, namsanSurf(x, z), z);
    const n = Math.sin(x * 0.03 + z * 0.02) * 0.5 + 0.5; c.copy(A).lerp(B, n); col.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < NR; i++) for (let a = 0; a < NA; a++) { const p = i * NA + a, q = i * NA + (a + 1) % NA; idx.push(p, q, p + NA, q, q + NA, p + NA); }   // counter-clockwise seen from above
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  // the forest: canopy blobs from noise, darker down in the folds, a few rock scars near the top
  const mm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.4 });
  mm.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vWp; varying vec3 vWn;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = objectNormal;');
    sh.fragmentShader = 'varying vec3 vWp; varying vec3 vWn;\n' + GLSL_NOISE + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float cb = fbm(vWp * 0.06), cs = vn(vWp * 0.22);
      diffuseColor.rgb *= 0.78 + cb * 0.3 + cs * 0.1;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.33, 0.18), smoothstep(0.55, 0.9, vn(vWp * vec3(0.012, 0.0, 0.012) + 3.0)) * 0.16);   // autumn patches
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.53, 0.5), smoothstep(0.22, 0.08, vWn.y) * 0.3);   // bare rock on the steep bits`);
  };
  const nm = new THREE.Mesh(geo, mm); nm.name = 'namsan'; nm.receiveShadow = true; scene.add(nm);
  Object.assign(NS_MESH, { geo, pos: geo.attributes.position, col: geo.attributes.color });
  // N Seoul Tower: base building, tapering shaft, observation drum with its window band, striped antenna mast
  const g = new THREE.Group(), y0 = namsanH(TOWER.x, TOWER.z) - 2;
  const conc = new THREE.MeshLambertMaterial({ color: lin('#f4f2ee'), emissive: lin('#3a3836') }), dark = new THREE.MeshLambertMaterial({ color: lin('#2e3a48'), emissive: lin('#1c2a3c') }), red = new THREE.MeshLambertMaterial({ color: lin('#e0402e'), emissive: lin('#4a1208') });
  const add = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; g.add(o); };
  add(new THREE.CylinderGeometry(15, 17, 10, 16), conc, 5);
  add(new THREE.CylinderGeometry(2.6, 4.6, 118, 16), conc, 69);
  add(new THREE.CylinderGeometry(9.5, 7.5, 6, 24), conc, 128);
  add(new THREE.CylinderGeometry(10, 10, 7, 24), dark, 134.5);
  add(new THREE.CylinderGeometry(9, 10, 5, 24), conc, 140.5);
  add(new THREE.CylinderGeometry(6, 9, 4, 24), conc, 145);
  for (let k = 0; k < 6; k++) add(new THREE.CylinderGeometry(1.6 - k * 0.2, 1.8 - k * 0.2, 14, 10), k % 2 ? conc : red, 154 + k * 14);
  add(new THREE.CylinderGeometry(0.35, 0.6, 18, 6), conc, 245);
  // drawn a little stouter than life: at 1.5 km the real shaft is a hairline, and the tower is how people know the place
  g.scale.set(2.2, 1.12, 2.2);
  g.position.set(TOWER.x, y0, TOWER.z); g.name = 'tower'; scene.add(g);
  const info = { name: 'N서울타워', en: 'N Seoul Tower', top: y0 + 270, base: y0, pos: new THREE.Vector3(TOWER.x, y0 + 290, TOWER.z), big: true };
  g.traverse((o) => { if (o.isMesh) { o.userData.info = info; o.castShadow = false; } });
  TRAD.push(Object.assign(info, { towerLabel: true }));
}
function buildBackdrop() { buildCliffs(); buildClouds(); buildNamsan(); }

// ------------------------------------------------------------------ crisp surface overlays (court, field) drawn at 1-2 cm per pixel
function surfaceOverlay(poly, y, W, draw) {
  const o = obb(poly), c = Math.cos(o.ang), s = Math.sin(o.ang);
  const cw = W, ch = Math.round(W * o.d / o.w), cvs = cv2d(cw, ch), g = cvs.getContext('2d');
  g.save(); g.translate(cw / 2, ch / 2); g.scale(cw / o.w, ch / o.d); draw(g, o.w, o.d); g.restore();
  const tex = texOf(cvs, true, false);
  const contour = poly.map((p) => new THREE.Vector2(p[0], p[1]));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = [], uv = [];
  for (const f of faces) for (const k of f) {
    const x = poly[k][0], z = poly[k][1], lu = (x - o.cx) * c + (z - o.cz) * s, lv = -(x - o.cx) * s + (z - o.cz) * c;
    pos.push(x, y, z); uv.push(lu / o.w + 0.5, 0.5 - lv / o.d);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.receiveShadow = true; scene.add(m);
}
function buildSurfaces() {
  if (COURT) surfaceOverlay(COURT.p, COURT_Y + 0.02, 2048, (g, w, h) => {
    g.fillStyle = '#d69b85'; g.fillRect(-w / 2, -h / 2, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.03)' : 'rgba(255,255,255,.04)'; g.fillRect((Math.random() - 0.5) * w, (Math.random() - 0.5) * h, 0.3, 0.3); }
    const cw2 = Math.min(28, w - 8), ch2 = Math.min(15, h - 6);
    g.fillStyle = '#3e9157'; g.fillRect(-cw2 / 2 - 1.5, -ch2 / 2 - 1.5, cw2 + 3, ch2 + 3);
    g.fillStyle = '#c94c3e'; g.fillRect(-cw2 / 2, -2.45, 5.8, 4.9); g.fillRect(cw2 / 2 - 5.8, -2.45, 5.8, 4.9);
    g.strokeStyle = '#ffffff'; g.lineWidth = 0.05;
    g.strokeRect(-cw2 / 2, -ch2 / 2, cw2, ch2); g.beginPath(); g.moveTo(0, -ch2 / 2); g.lineTo(0, ch2 / 2); g.stroke();
    g.beginPath(); g.arc(0, 0, 1.8, 0, Math.PI * 2); g.stroke();
    for (const sg of [-1, 1]) {
      g.strokeRect(sg > 0 ? cw2 / 2 - 5.8 : -cw2 / 2, -2.45, 5.8, 4.9);
      g.beginPath(); g.arc(sg * (cw2 / 2 - 5.8), 0, 1.8, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(sg * cw2 / 2, -6.6); g.lineTo(sg * (cw2 / 2 - 1.6), -6.6); g.arc(sg * (cw2 / 2 - 1.575), 0, 6.75, sg > 0 ? -Math.PI / 2 - 0.25 : -Math.PI / 2 + 0.25, sg > 0 ? Math.PI / 2 + 0.25 : Math.PI / 2 - 0.25, sg > 0); g.lineTo(sg * cw2 / 2, 6.6); g.stroke();
    }
  });
  if (FIELD) surfaceOverlay(FIELD.p, FIELD_Y + 0.03, 4096, (g, w, h) => {
    g.fillStyle = '#ad4c3c'; g.fillRect(-w / 2, -h / 2, w, h);
    const fw = w - 9, fh = h - 9;
    for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? '#4c8c3c' : '#59994a'; g.fillRect(-fw / 2 + i * fw / 14, -fh / 2, fw / 14 + 0.02, fh); }
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 0.12;
    const L = fw - 2, Hh = fh - 2;
    g.strokeRect(-L / 2, -Hh / 2, L, Hh); g.beginPath(); g.moveTo(0, -Hh / 2); g.lineTo(0, Hh / 2); g.stroke();
    g.beginPath(); g.arc(0, 0, Math.min(9.15, Hh * 0.18), 0, Math.PI * 2); g.stroke();
    const bw = Math.min(16.5, L * 0.16), bh = Math.min(40.3, Hh * 0.6), sw = Math.min(5.5, L * 0.05), sh = Math.min(18.3, Hh * 0.3);
    for (const sg of [-1, 1]) { g.strokeRect(sg > 0 ? L / 2 - bw : -L / 2, -bh / 2, bw, bh); g.strokeRect(sg > 0 ? L / 2 - sw : -L / 2, -sh / 2, sw, sh); g.fillStyle = '#fff'; g.beginPath(); g.arc(sg * (L / 2 - Math.min(11, L * 0.1)), 0, 0.2, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 0.06;
    for (let k = 1; k <= 4; k++) g.strokeRect(-w / 2 + k * 1.1, -h / 2 + k * 1.1, w - k * 2.2, h - k * 2.2);
  });
}

// ------------------------------------------------------------------ buildings: S-map geometry, facade materials, stone foundations down to the ground
const buildings = []; const pickables = [];
const HIDE = new Set((M.hide || []).map((h) => h[0] + ':' + h[1]));
function osmNameFor(c) {
  let best = null;
  for (const n of M.names) {
    if (inPoly(c[0], c[1], n.p)) return n.n;
    let x = 0, z = 0; n.p.forEach((p) => { x += p[0]; z += p[1]; }); x /= n.p.length; z /= n.p.length;
    const d = Math.hypot(x - c[0], z - c[1]); if (d < 18 && (!best || d < best.d)) best = { n: n.n, d };
  }
  return best && best.n;
}
const plinthMat = new THREE.MeshStandardMaterial({ color: lin('#9d968a'), roughness: 0.95, map: roofTex });
const PAR = 1.05;
// cut a convex polygon of [x, y, z, u, v] at height yc: the part below and the part above
function splitY(poly, yc) {
  const lo = [], hi = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ia = a[1] < yc, ib = b[1] < yc;
    (ia ? lo : hi).push(a);
    if (ia !== ib) { const t = (yc - a[1]) / (b[1] - a[1]), m = a.map((x, k) => x + (b[k] - x) * t); m[1] = yc; lo.push(m); hi.push(m); }
  }
  return [lo, hi];
}
// rooftop plant: air-handling units, a stair and lift tower on the bigger roofs. They are part of the building's own roof
// geometry, so they break and fall with it.
function addRoofPlant(flat, rp, rn, ru, wp, wn, wu, dom) {
  if (!flat.length) return;
  // the main roof is the flat level with the most area (parapet tops and small penthouses sit higher)
  const bins = new Map(); for (const t of flat) { const k = Math.round((t[1] + t[4] + t[7]) / 3 * 2); bins.set(k, (bins.get(k) || 0) + t[9]); }
  let bk = 0, ba = -1; for (const [k, a] of bins) if (a > ba) { ba = a; bk = k; }
  const top = bk / 2;
  const roof = flat.filter((t) => Math.abs((t[1] + t[4] + t[7]) / 3 - top) < 0.6);
  let area = 0; for (const t of roof) area += t[9];
  if (area < 120) return;
  const inTri = (x, z, t) => {
    const d = (x1, z1, x2, z2, x3, z3) => (x1 - x3) * (z2 - z3) - (x2 - x3) * (z1 - z3);
    const d1 = d(x, z, t[0], t[2], t[3], t[5]), d2 = d(x, z, t[3], t[5], t[6], t[8]), d3 = d(x, z, t[6], t[8], t[0], t[2]);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const onRoof = (x, z) => roof.some((t) => inTri(x, z, t));
  const cs = Math.cos(dom), sn = Math.sin(dom);
  const fits = (x, z, hw, hd, m) => { for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) { const u = a * (hw + m), v = b * (hd + m); if (!onRoof(x + u * cs - v * sn, z + u * sn + v * cs)) return false; } return true; };
  const pick = () => { let r = rnd() * area; for (const t of roof) { r -= t[9]; if (r <= 0) { let a = rnd(), b = rnd(); if (a + b > 1) { a = 1 - a; b = 1 - b; } return [t[0] + (t[3] - t[0]) * a + (t[6] - t[0]) * b, t[2] + (t[5] - t[2]) * a + (t[8] - t[2]) * b]; } } return null; };
  const boxes = [];
  const want = Math.min(7, Math.max(1, Math.round(area / 260)));
  if (area > 600) for (let k = 0; k < 30; k++) { const p = pick(); if (p && fits(p[0], p[1], 2.6, 3.2, 2)) { boxes.push([p[0], p[1], 2.6, 3.2, 3.4]); break; } }   // stair and lift tower
  for (let k = 0; k < 60 && boxes.length < want + 1; k++) {
    const p = pick(); if (!p) break;
    const hw = 0.8 + rnd() * 1.4, hd = 0.6 + rnd() * 1.0, h = 0.9 + rnd() * 1.2;
    if (!fits(p[0], p[1], hw, hd, 1.6)) continue;
    if (boxes.some((b) => Math.hypot(b[0] - p[0], b[1] - p[1]) < b[2] + hw + 1.2)) continue;
    boxes.push([p[0], p[1], hw, hd, h]);
  }
  for (const [x, z, hw, hd, h] of boxes) {
    const y0 = top, y1 = top + h, c = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [x + u * cs - v * sn, z + u * sn + v * cs]);
    const facing = (p1, p2, p3, n) => ((p2[1] - p1[1]) * (p3[2] - p1[2]) - (p2[2] - p1[2]) * (p3[1] - p1[1])) * n[0] + ((p2[2] - p1[2]) * (p3[0] - p1[0]) - (p2[0] - p1[0]) * (p3[2] - p1[2])) * n[1] + ((p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0])) * n[2] > 0;
    const tri = (p1, p2, p3, n) => { if (!facing(p1, p2, p3, n)) { const t = p2; p2 = p3; p3 = t; } for (const p of [p1, p2, p3]) { rp.push(p[0], p[1], p[2]); rn.push(n[0], n[1], n[2]); ru.push(p[0] / 4 + p[1] * 0.25, p[2] / 4); } };
    const T = c.map((q) => [q[0], y1, q[1]]), Bt = c.map((q) => [q[0], y0, q[1]]);
    tri(T[0], T[2], T[1], [0, 1, 0]); tri(T[0], T[3], T[2], [0, 1, 0]);
    // the sides use the wall material as plain parapet wall (uv.y in the parapet range), so each unit gets a pale capped rim
    const side = (p1, p2, p3, n, u0) => { if (!facing(p1, p2, p3, n)) { let t = p2; p2 = p3; p3 = t; t = u0[1]; u0 = [u0[0], u0[2], t]; } for (const [p, u] of [[p1, u0[0]], [p2, u0[1]], [p3, u0[2]]]) { wp.push(p[0], p[1], p[2]); wn.push(n[0], n[1], n[2]); wu.push(u, -10 - (y1 - p[1]) / FLOOR); } };
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, ex = c[j][0] - c[i][0], ez = c[j][1] - c[i][1], L = Math.hypot(ex, ez) || 1, mx = (c[i][0] + c[j][0]) / 2 - x, mz = (c[i][1] + c[j][1]) / 2 - z;
      let n = [-ez / L, 0, ex / L]; if (n[0] * mx + n[2] * mz < 0) n = [-n[0], 0, -n[2]];
      const ua = 0, ub = L / TU;
      side(Bt[i], T[j], T[i], n, [ua, ub, ua]); side(Bt[i], Bt[j], T[j], n, [ua, ub, ub]);
    }
  }
}
async function buildBuildings() {
  for (let k = 0; k < M.meshes.length; k++) {
    const m = M.meshes[k];
    const buf = b64buf(V.meshes[k]);
    const P = new Float32Array(buf, 0, m.nv * 3), I = new Uint32Array(buf, m.nv * 20, m.ni);
    m.buildings.forEach((b0, bi) => {
      if (HIDE.has(k + ':' + bi)) return;
      const nm = osmNameFor(b0.c), cfg = (nm && BCFG[nm]) || DEF_CFG;
      const wp = [], wn = [], wu = [], rp = [], rn = [], ru = [];
      const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
      const uo = Math.floor(rnd() * 8) * BAY, bcx = (b0.bb[0] + b0.bb[2]) / 2, bcz = (b0.bb[1] + b0.bb[3]) / 2;
      const hist = new Float32Array(90);
      for (let t = b0.s; t < b0.s + b0.n; t += 3) {
        A.fromArray(P, I[t] * 3); B.fromArray(P, I[t + 1] * 3); C.fromArray(P, I[t + 2] * 3);
        N.crossVectors(e1.subVectors(B, A), e2.subVectors(C, A)); const ar = N.length(); if (ar < 1e-6) continue; N.divideScalar(ar);
        if (Math.abs(N.y) > 0.55) continue;
        let a = Math.atan2(N.z, N.x); a = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
        hist[Math.floor(a / (Math.PI / 2) * 90) % 90] += ar;
      }
      let hb = 0; for (let i = 1; i < 90; i++) if (hist[i] > hist[hb]) hb = i;
      const dom = (hb + 0.5) / 90 * Math.PI / 2, D5 = Math.PI / 36;
      // the top of the wall above each spot (0.5 m columns): a triangle mid-way up a tall facade must not grow a parapet
      const colTop = new Map(), ck = (x, z) => Math.round(x * 2) * 100000 + Math.round(z * 2);
      for (let t = b0.s; t < b0.s + b0.n; t += 3) {
        A.fromArray(P, I[t] * 3); B.fromArray(P, I[t + 1] * 3); C.fromArray(P, I[t + 2] * 3);
        N.crossVectors(e1.subVectors(B, A), e2.subVectors(C, A)); if (N.lengthSq() < 1e-12) continue; N.normalize();
        if (Math.abs(N.y) > 0.55) continue;
        for (const v of [A, B, C]) { const key = ck(v.x, v.z); colTop.set(key, Math.max(colTop.get(key) || -1e9, v.y)); }
      }
      const flat = [];                                                     // flat roof triangles, for the rooftop plant below
      for (let t = b0.s; t < b0.s + b0.n; t += 3) {
        A.fromArray(P, I[t] * 3); B.fromArray(P, I[t + 1] * 3); C.fromArray(P, I[t + 2] * 3);
        N.crossVectors(e1.subVectors(B, A), e2.subVectors(C, A)); const len = N.length(); if (len < 1e-6) continue; N.divideScalar(len);
        if (Math.abs(N.y) > 0.55) {
          for (const v of [A, B, C]) { rp.push(v.x, v.y, v.z); rn.push(N.x, N.y, N.z); ru.push(v.x / 4, v.z / 4); }
          if (N.y > 0.97) flat.push([A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z, len / 2]);
          continue;
        }
        let a = Math.atan2(N.z, N.x); const k = Math.round((a - dom) / (Math.PI / 2)), snap = dom + k * Math.PI / 2;
        a = Math.abs(a - snap) < 0.17 ? snap : Math.round(a / D5) * D5;
        const tx = -Math.sin(a), tz = Math.cos(a);
        const vs = [A, B, C].map((v) => [v.x, v.y, v.z, ((v.x - bcx) * tx + (v.z - bcz) * tz + uo) / TU, Math.max(0, v.y - b0.ymin) / FLOOR]);
        let top = -1e9; for (const v of vs) top = Math.max(top, colTop.get(ck(v[0], v[2])) || v[1]);
        const put = (poly, par) => {
          for (let q = 1; q < poly.length - 1; q++) for (const v of [poly[0], poly[q], poly[q + 1]]) {
            wp.push(v[0], v[1], v[2]); wn.push(N.x, N.y, N.z); wu.push(v[3], par ? -10 - (top - v[1]) / FLOOR : v[4]);
          }
        };
        const yc = top - PAR;
        let ymn = 1e9, ymx = -1e9; for (const v of vs) { ymn = Math.min(ymn, v[1]); ymx = Math.max(ymx, v[1]); }
        if (ymx <= yc + 0.01) put(vs, false);
        else if (ymn >= yc - 0.01 || top - ymn < PAR + 0.6) put(vs, true);   // short walls (terrace balustrades) are parapet all the way down
        else { const [lo, hi] = splitY(vs, yc); if (lo.length > 2) put(lo, false); if (hi.length > 2) put(hi, true); }
      }
      addRoofPlant(flat, rp, rn, ru, wp, wn, wu, dom);
      const nW = wp.length / 3, nR = rp.length / 3;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(wp.concat(rp), 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(wn.concat(rn), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(wu.concat(ru), 2));
      geo.addGroup(0, nW, 0); geo.addGroup(nW, nR, 1);
      const roofMat = new THREE.MeshStandardMaterial({ color: lin(cfg.r), roughness: cfg.roof === 'panel' ? 0.45 : 0.92, metalness: cfg.roof === 'panel' ? 0.25 : 0, map: cfg.roof === 'panel' ? panelRoofTex : roofTex });
      const mesh = new THREE.Mesh(geo, [facadeMaterial(cfg.f, cfg.w, cfg.g, cfg.a), roofMat]); mesh.castShadow = mesh.receiveShadow = true;
      const b = Object.assign({ mesh, cfg, osm: nm }, b0); mesh.userData.b = b;
      buildings.push(b); scene.add(mesh); pickables.push(mesh);
    });
  }
  // stone plinth from each footprint down to the ground so no building floats on the downhill side
  const pp = [], pn = [], pu = [];
  for (const f of M.footprints) {
    const ring = f.p.slice(); if (ringArea(ring) < 0) ring.reverse();
    const top = f.min + 0.25;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
      const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L, n = Math.max(1, Math.ceil(L / 1.5));
      for (let k = 0; k < n; k++) {
        const p0 = [lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)], p1 = [lerp(a[0], b[0], (k + 1) / n), lerp(a[1], b[1], (k + 1) / n)];
        const b0 = Math.min(getH0(p0[0] + nx, p0[1] + nz), f.min) - 0.6, b1 = Math.min(getH0(p1[0] + nx, p1[1] + nz), f.min) - 0.6;
        if (top - Math.max(b0, b1) < 0.05) continue;
        for (const q of [[p0, b0, 0], [p1, top, 1], [p1, b1, 1], [p0, b0, 0], [p0, top, 0], [p1, top, 1]]) { pp.push(q[0][0] + nx * 0.03, q[1], q[0][1] + nz * 0.03); pn.push(nx, 0, nz); pu.push(q[2] * L / n / 2, q[1] / 2); }
      }
    }
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); pg.setAttribute('normal', new THREE.Float32BufferAttribute(pn, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2));
  const pm = new THREE.Mesh(pg, plinthMat); pm.castShadow = pm.receiveShadow = true; scene.add(pm);
}

// ------------------------------------------------------------------ 3D stairs along every OSM "steps" way
function buildSteps() {
  const mat = new THREE.MeshStandardMaterial({ color: lin('#c2bbae'), roughness: 0.9, map: roofTex });
  const cheek = new THREE.MeshStandardMaterial({ color: lin('#a39b8c'), roughness: 0.95 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const items = [], cheeks = [];
  for (const r of M.paths) {
    if (r.k !== 'steps') continue;
    let total = 0; for (let i = 1; i < r.p.length; i++) total += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
    if (total < 1) continue;
    const h0 = getH(r.p[0][0], r.p[0][1]), h1 = getH(r.p[r.p.length - 1][0], r.p[r.p.length - 1][1]);
    const nSteps = Math.max(3, Math.round(Math.abs(h1 - h0) / 0.16)), run = total / nSteps, W = 2.8;
    let acc = 0;
    for (let i = 1; i < r.p.length; i++) {
      const a = r.p[i - 1], b = r.p[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) continue;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let d = 0; d < L - 1e-6; d += run) {
        const t = (acc + d + run / 2) / total, x = a[0] + (b[0] - a[0]) * (d + run / 2) / L, z = a[1] + (b[1] - a[1]) * (d + run / 2) / L;
        const top = lerp(h0, h1, Math.round(t * nSteps + 0.5) / nSteps), bottom = Math.min(top, getH(x, z)) - 0.8;
        items.push([x, (top + bottom) / 2, z, run + 0.02, top - bottom, W, ang]);
        if (Math.floor(d / run) % 3 === 0) for (const sd of [-1, 1]) cheeks.push([x - Math.sin(ang) * sd * (W / 2 + 0.15), top + 0.25, z + Math.cos(ang) * sd * (W / 2 + 0.15), run * 3, 0.5, 0.3, ang]);
      }
      acc += L;
    }
  }
  const mk = (list, m) => {
    const im = new THREE.InstancedMesh(box, m, list.length), o = new THREE.Object3D();
    list.forEach((s, i) => { o.position.set(s[0], s[1], s[2]); o.rotation.set(0, -s[6], 0); o.scale.set(s[3], s[4], s[5]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = im.receiveShadow = true; scene.add(im);
  };
  if (items.length) mk(items, mat);
  if (cheeks.length) mk(cheeks, cheek);
}

// ------------------------------------------------------------------ traditional buildings: Jeonggakwon temple hall and the bell pavilion
const HANOK = {};
function canvasTex(w, h, draw, rep) { const c = cv2d(w, h); draw(c.getContext('2d'), w, h); return texOf(c, true, rep); }
function hanokMaterials() {
  if (HANOK.tile) return HANOK;
  HANOK.tile = new THREE.MeshStandardMaterial({ color: lin('#5c6066'), roughness: 0.75, side: THREE.DoubleSide, map: canvasTex(128, 128, (g) => { g.fillStyle = '#b9bcc0'; g.fillRect(0, 0, 128, 128); for (let k = 0; k < 8; k++) { g.fillStyle = '#7b8086'; g.fillRect(k * 16, 0, 5, 128); g.fillStyle = '#e1e3e6'; g.fillRect(k * 16 + 7, 0, 3, 128); } for (let k = 0; k < 8; k++) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, k * 16, 128, 2); } }, true) });
  HANOK.under = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, map: canvasTex(128, 128, (g) => { g.fillStyle = '#2f6e5f'; g.fillRect(0, 0, 128, 128); for (let k = 0; k < 8; k++) { g.fillStyle = '#c4473a'; g.fillRect(k * 16 + 5, 0, 6, 128); g.fillStyle = '#f2ead7'; g.fillRect(k * 16 + 6, 100, 4, 22); } }, true) });
  HANOK.col = new THREE.MeshStandardMaterial({ color: lin('#8a3324'), roughness: 0.7 });
  HANOK.stone = new THREE.MeshStandardMaterial({ roughness: 0.95, map: canvasTex(256, 256, (g) => { g.fillStyle = '#cdc6b8'; g.fillRect(0, 0, 256, 256); for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) { const v = 180 + Math.floor(rnd() * 45); g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(c * 64 + (r % 2) * 32 + 2, r * 32 + 2, 60, 28); } }, true) });
  HANOK.door = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#8a3324'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f8a6d'; g.fillRect(8, 30, w - 16, h - 40); g.strokeStyle = '#d8c58c'; g.lineWidth = 2; for (let x = 8; x < w - 8; x += 12) { g.beginPath(); g.moveTo(x, 30); g.lineTo(x, h - 10); g.stroke(); } for (let y = 30; y < h - 10; y += 12) { g.beginPath(); g.moveTo(8, y); g.lineTo(w - 8, y); g.stroke(); } g.fillStyle = '#2b6f5c'; g.fillRect(0, 0, w, 26); g.fillStyle = '#e8d9a0'; g.fillRect(0, 10, w, 4); }, true);
  HANOK.dan = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#2e7a68'; g.fillRect(0, 0, w, h); for (let k = 0; k < 8; k++) { const x = k * 32; g.fillStyle = '#c4473a'; g.beginPath(); g.arc(x + 16, 32, 11, 0, Math.PI * 2); g.fill(); g.fillStyle = '#f4ecd6'; g.beginPath(); g.arc(x + 16, 32, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2b4f9a'; g.fillRect(x, 0, 3, h); g.fillStyle = '#e9b84a'; g.fillRect(x + 14, 30, 4, 4); } g.fillStyle = '#f4ecd6'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); }, true);
  HANOK.bracket = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#2b6f5c'; g.fillRect(0, 0, w, h); for (let k = 0; k < 4; k++) { g.fillStyle = '#c4473a'; g.fillRect(k * 32 + 4, 10, 24, 18); g.fillStyle = '#e9b84a'; g.fillRect(k * 32 + 10, 32, 12, 22); g.fillStyle = '#f4ecd6'; g.fillRect(k * 32 + 12, 14, 8, 6); } }, true);
  HANOK.plaster = new THREE.MeshStandardMaterial({ color: lin('#efe7d4'), roughness: 0.9 });
  return HANOK;
}
function curvedRoof(W, D, H, ridgeFrac, curve) {
  const r = W * ridgeFrac / 2;
  const faces = [
    [[-W / 2, 0, D / 2], [W / 2, 0, D / 2], [-r, H, 0], [r, H, 0], W],
    [[W / 2, 0, -D / 2], [-W / 2, 0, -D / 2], [r, H, 0], [-r, H, 0], W],
    [[-W / 2, 0, -D / 2], [-W / 2, 0, D / 2], [-r, H, 0], [-r, H, 0], D],
    [[W / 2, 0, D / 2], [W / 2, 0, -D / 2], [r, H, 0], [r, H, 0], D]
  ];
  const pos = [], uv = [], idx = [], S = 16, T2 = 8;
  for (const f of faces) {
    const base = pos.length / 3, slope = Math.hypot(H, D / 2);
    for (let t = 0; t <= T2; t++) for (let s = 0; s <= S; s++) {
      const u = s / S, v = t / T2;
      const bx = lerp(f[0][0], f[1][0], u), bz = lerp(f[0][2], f[1][2], u), tx = lerp(f[2][0], f[3][0], u), tz = lerp(f[2][2], f[3][2], u);
      let x = lerp(bx, tx, v), z = lerp(bz, tz, v), y = lerp(0, H, v);
      y -= Math.sin(Math.PI * v) * H * 0.17 * curve;
      y += Math.pow(Math.abs(2 * u - 1), 4) * (1 - v) * H * 0.38 * curve;
      pos.push(x, y, z); uv.push(u * f[4] / 1.0, v * slope / 1.0);
    }
    for (let t = 0; t < T2; t++) for (let s = 0; s < S; s++) { const a = base + t * (S + 1) + s, b = a + 1, c = a + S + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function addMesh(grp, geo, mat, x, y, z, ry) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.castShadow = m.receiveShadow = true; grp.add(m); return m; }
function hanokHall(grp, W, D, y0, colH, roofH, ov, rf, opts) {
  const H = hanokMaterials();
  const nx = Math.max(2, Math.round(W / 3.3)), nz = Math.max(2, Math.round(D / 3.3));
  const colGeo = new THREE.CylinderGeometry(0.3, 0.34, colH, 12);
  for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) { if (i && i < nx && k && k < nz) continue; addMesh(grp, colGeo, H.col, -W / 2 + W * i / nx, y0 + colH / 2, -D / 2 + D * k / nz); }
  if (!opts.open) {
    const front = H.door.clone(); front.needsUpdate = true; front.repeat.set(nx, 1);
    const side = H.door.clone(); side.needsUpdate = true; side.repeat.set(nz, 1);
    const mFront = new THREE.MeshStandardMaterial({ map: front, roughness: 0.8 }), mSide = new THREE.MeshStandardMaterial({ map: side, roughness: 0.8 });
    addMesh(grp, new THREE.BoxGeometry(W - 0.2, colH - 0.2, D - 0.2), [mSide, mSide, H.plaster, H.plaster, mFront, mFront], 0, y0 + colH / 2 - 0.1, 0);
  }
  const dan = H.dan.clone(); dan.needsUpdate = true; dan.repeat.set(Math.round(W / 2), 1);
  const danMat = new THREE.MeshStandardMaterial({ map: dan, roughness: 0.8 });
  addMesh(grp, new THREE.BoxGeometry(W + 0.5, 0.7, D + 0.5), danMat, 0, y0 + colH + 0.1, 0);
  const br = H.bracket.clone(); br.needsUpdate = true; br.repeat.set(Math.round(W / 1.2), 1);
  addMesh(grp, new THREE.BoxGeometry(W + 1.1, 0.8, D + 1.1), new THREE.MeshStandardMaterial({ map: br, roughness: 0.8 }), 0, y0 + colH + 0.85, 0);
  const rg = curvedRoof(W + ov * 2, D + ov * 2, roofH, rf, 1);
  const top = addMesh(grp, rg, H.tile, 0, y0 + colH + 1.2, 0);
  const under = addMesh(grp, rg, H.under, 0, y0 + colH + 1.12, 0); under.castShadow = false;
  if (rf > 0.05) {
    const rl = (W + ov * 2) * rf;
    addMesh(grp, new THREE.BoxGeometry(rl + 0.8, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: lin('#3c4046'), roughness: 0.7 }), 0, y0 + colH + 1.2 + roofH + 0.15, 0);
    for (const s of [-1, 1]) { const c = addMesh(grp, new THREE.BoxGeometry(0.5, 1.1, 0.6), new THREE.MeshStandardMaterial({ color: lin('#34383d') }), s * (rl / 2 + 0.3), y0 + colH + 1.2 + roofH + 0.5, 0); c.rotation.z = -s * 0.35; }
  } else {
    const fin = new THREE.Group(); addMesh(fin, new THREE.CylinderGeometry(0.25, 0.4, 0.5, 10), new THREE.MeshStandardMaterial({ color: lin('#3c4046') }), 0, 0.25, 0); addMesh(fin, new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshStandardMaterial({ color: lin('#3c4046') }), 0, 0.7, 0); addMesh(fin, new THREE.ConeGeometry(0.16, 0.5, 8), new THREE.MeshStandardMaterial({ color: lin('#3c4046') }), 0, 1.1, 0);
    fin.position.y = y0 + colH + 1.2 + roofH - 0.1; grp.add(fin);
  }
  if (opts.sign) {
    const sign = canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#1f3b45'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d9b45a'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = '#e7c46a'; g.font = 'bold 58px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(opts.sign, w / 2, h / 2 + 4); });
    const sd = opts.side || 1; addMesh(grp, new THREE.PlaneGeometry(2.6, 1.0), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6 }), 0, y0 + colH - 0.2, sd * (D / 2 + 0.35), sd < 0 ? Math.PI : 0);
  }
}
function lantern(grp, x, y, z) {
  const st = hanokMaterials().stone;
  addMesh(grp, new THREE.BoxGeometry(0.7, 0.3, 0.7), st, x, y + 0.15, z);
  addMesh(grp, new THREE.CylinderGeometry(0.14, 0.18, 0.9, 8), st, x, y + 0.75, z);
  addMesh(grp, new THREE.BoxGeometry(0.6, 0.5, 0.6), st, x, y + 1.45, z);
  addMesh(grp, new THREE.ConeGeometry(0.6, 0.45, 4), st, x, y + 1.92, z, Math.PI / 4);
}
function shrub(grp, x, y, z, r) { addMesh(grp, new THREE.SphereGeometry(r, 14, 10), new THREE.MeshStandardMaterial({ color: lin(rnd() < 0.5 ? '#3f6b35' : '#4b7a3c'), roughness: 0.9 }), x, y + r * 0.7, z); }
function buildTraditional() {
  const H = hanokMaterials();
  // Jeonggakwon: hall on a high granite terrace with a steep stair between round shrubs
  const jp = nameP('정각원');
  if (jp) {
    const o = obb(jp), g = new THREE.Group();
    const fx = -Math.sin(o.ang), fz = Math.cos(o.ang);                 // local +z
    const side = getH0(o.cx + fx * (o.d + 8), o.cz + fz * (o.d + 8)) < getH0(o.cx - fx * (o.d + 8), o.cz - fz * (o.d + 8)) ? 1 : -1;
    let gmax = -1e9, gmin = 1e9; for (const p of jp) { gmax = Math.max(gmax, getH0(p[0], p[1])); gmin = Math.min(gmin, getH0(p[0], p[1])); }
    const top = gmax + 0.6, W = o.w, D = o.d;
    const terr = addMesh(g, new THREE.BoxGeometry(W + 4, top - gmin + 4, D + 4), H.stone, 0, (top - gmin + 4) / 2 - (top - gmin + 4) + (top - gmin), 0);
    terr.position.y = top - (top - gmin + 4) / 2;
    addMesh(g, new THREE.BoxGeometry(W + 1.4, 0.6, D + 1.4), H.stone, 0, top + 0.3, 0);
    hanokHall(g, W, D, top + 0.6, 5.2, 5.4, 2.3, 0.5, { sign: '正覺院', side });
    // front stair down to the lower ground
    const baseZ = side * (D / 2 + 2), foot = getH0(o.cx + fx * side * (D / 2 + 14), o.cz + fz * side * (D / 2 + 14));
    const n = Math.max(6, Math.round((top + 0.6 - foot) / 0.2)), run = 0.36, SW = 5.2;
    for (let i = 0; i < n; i++) {
      const y = top + 0.6 - (i + 1) * (top + 0.6 - foot) / n, z = baseZ + side * (i * run + run / 2);
      addMesh(g, new THREE.BoxGeometry(SW, y - foot + 1.5, run + 0.02), H.stone, 0, (y + foot - 1.5) / 2, z);
      if (i % 3 === 0) for (const s of [-1, 1]) shrub(g, s * (SW / 2 + 1.1), y - 0.2, z, 0.75 + rnd() * 0.3);
    }
    for (const s of [-1, 1]) lantern(g, s * (SW / 2 + 0.9), foot, baseZ + side * (n * run + 1.2));
    g.position.set(o.cx, 0, o.cz); g.rotation.y = -o.ang; g.userData.protect = true; scene.add(g);
    const info = { name: '정각원', en: 'Jeonggakwon', top: top + 0.6 + 5.2 + 1.2 + 5.4, base: foot, pos: new THREE.Vector3(o.cx, top + 13, o.cz), desc: '서울특별시 유형문화재. 조선 경희궁의 정전 숭정전을 옮겨 지은 법당으로, 높은 화강암 기단 위에 앉아 있고 앞쪽으로 둥근 관목 사이 가파른 돌계단이 이어진다.' };
    g.traverse((m) => { if (m.isMesh) { m.userData.info = info; pickables.push(m); } });
    TRAD.push(info);
  }
  // bell pavilion next to the law school: granite base, red railing, four columns, pyramid roof, bronze bell
  const bp = nameP('모 대학교종각');
  if (bp) {
    let cx = 0, cz = 0; bp.forEach((p) => { cx += p[0]; cz += p[1]; }); cx /= bp.length; cz /= bp.length;
    const o = obb(bp), g = new THREE.Group(), S = Math.max(4.6, Math.min(6.5, Math.max(o.w, o.d)));
    let gmax = -1e9, gmin = 1e9; for (const p of bp) { gmax = Math.max(gmax, getH0(p[0], p[1])); gmin = Math.min(gmin, getH0(p[0], p[1])); }
    const deck = gmax + 0.9;
    const base = addMesh(g, new THREE.BoxGeometry(S + 1.2, deck - gmin + 2, S + 1.2), H.stone, 0, 0, 0); base.position.y = deck - (deck - gmin + 2) / 2;
    addMesh(g, new THREE.BoxGeometry(S + 0.4, 0.2, S + 0.4), new THREE.MeshStandardMaterial({ color: lin('#8b6a4a'), roughness: 0.8 }), 0, deck + 0.1, 0);
    const rail = new THREE.MeshStandardMaterial({ color: lin('#b8372b'), roughness: 0.6 });
    for (const [ax, az, len, rot] of [[0, S / 2, S, 0], [0, -S / 2, S, 0], [S / 2, 0, S, Math.PI / 2], [-S / 2, 0, S, Math.PI / 2]]) {
      addMesh(g, new THREE.BoxGeometry(len, 0.08, 0.08), rail, ax, deck + 0.95, az, rot);
      addMesh(g, new THREE.BoxGeometry(len, 0.06, 0.06), rail, ax, deck + 0.5, az, rot);
      for (let k = 0; k <= 6; k++) { const t = -len / 2 + len * k / 6; addMesh(g, new THREE.BoxGeometry(0.08, 1.0, 0.08), rail, rot ? ax : ax + t, deck + 0.5, rot ? az + t : az); }
    }
    hanokHall(g, S - 1.2, S - 1.2, deck + 0.2, 3.4, 2.8, 1.5, 0.0, { open: true });
    const prof = [[0, 0], [0.85, 0], [0.8, 0.2], [0.68, 0.9], [0.62, 1.4], [0.4, 1.65], [0.12, 1.75], [0, 1.8]].map((p) => new THREE.Vector2(p[0], p[1]));
    addMesh(g, new THREE.LatheGeometry(prof, 20), new THREE.MeshStandardMaterial({ color: lin('#5a4a32'), metalness: 0.7, roughness: 0.4 }), 0, deck + 1.3, 0);
    addMesh(g, new THREE.BoxGeometry(S - 1.4, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: lin('#6b4a32') }), 0, deck + 3.2, 0);
    g.position.set(cx, 0, cz); g.rotation.y = -o.ang; g.userData.protect = true; scene.add(g);
    const info = { name: '종각', en: 'Bell pavilion', top: deck + 7.5, base: gmin, pos: new THREE.Vector3(cx, deck + 8, cz), desc: '법학관 옆 석축 위의 종각. 붉은 난간과 네 기둥, 끝이 휘어 오른 지붕 아래 범종이 걸려 있다.' };
    g.traverse((m) => { if (m.isMesh) { m.userData.info = info; pickables.push(m); } });
    TRAD.push(info);
  }
}
const TRAD = [];

// ------------------------------------------------------------------ central plaza: Buddha shrine and the elephant family; Manhae square fittings
function buildLandmarks() {
  const granite = new THREE.MeshStandardMaterial({ color: lin('#d6d1c6'), roughness: 0.85, map: roofTex });
  const bronze = new THREE.MeshStandardMaterial({ color: lin('#59503e'), metalness: 0.65, roughness: 0.42 });
  const teal = new THREE.MeshStandardMaterial({ color: lin('#4f9b98'), metalness: 0.1, roughness: 0.15 });
  const eleMat = new THREE.MeshStandardMaterial({ color: lin('#7f8676'), metalness: 0.35, roughness: 0.55 });
  const buddha = M.art.find((a) => /관세음|부처/.test(a.n)), ele = M.art.find((a) => /코끼리/.test(a.n));
  if (buddha) {
    const g = new THREE.Group(), y = getH(buddha.p[0], buddha.p[1]);
    addMesh(g, new THREE.BoxGeometry(6.2, 0.5, 4.2), granite, 0, 0.25, 0); addMesh(g, new THREE.BoxGeometry(5.2, 0.5, 3.4), granite, 0, 0.75, 0);
    for (const s of [-1, 1]) { addMesh(g, new THREE.BoxGeometry(1.15, 9.2, 1.4), granite, s * 1.75, 1.0 + 4.6, 0); addMesh(g, new THREE.BoxGeometry(0.12, 6.5, 0.7), teal, s * 1.15, 1.0 + 4.2, 0); }
    addMesh(g, new THREE.BoxGeometry(4.8, 1.0, 1.6), granite, 0, 1.0 + 9.2 + 0.2, 0);
    addMesh(g, new THREE.CylinderGeometry(0.75, 0.9, 1.4, 12), granite, 0, 1.7, 0);
    const prof = [[0, 0], [0.5, 0], [0.55, 0.4], [0.48, 1.4], [0.44, 2.0], [0.26, 2.2], [0.3, 2.45], [0.24, 2.75], [0.1, 2.9], [0, 2.95]].map((p) => new THREE.Vector2(p[0], p[1]));
    addMesh(g, new THREE.LatheGeometry(prof, 20), bronze, 0, 2.4, 0);
    if (ele) g.rotation.y = -Math.atan2(ele.p[1] - buddha.p[1], ele.p[0] - buddha.p[0]) + Math.PI / 2;
    g.position.set(buddha.p[0], y, buddha.p[1]); g.userData.protect = true; scene.add(g);
  }
  if (ele) {
    const y = getH(ele.p[0], ele.p[1]);
    const elephant = (s) => {
      const g = new THREE.Group(), sph = new THREE.SphereGeometry(1, 20, 14);
      const add = (geo, x, yy, z, sx, sy, sz) => { const m = addMesh(g, geo, eleMat, x, yy, z); if (sx) m.scale.set(sx, sy, sz); return m; };
      add(sph, 0, 1.95, 0, 1.75, 1.15, 1.05);
      for (const [x, z] of [[1.0, 0.55], [1.0, -0.55], [-1.0, 0.55], [-1.0, -0.55]]) add(new THREE.CylinderGeometry(0.36, 0.42, 1.6, 12), x, 0.8, z);
      add(sph, 1.85, 2.55, 0, 0.8, 0.78, 0.72);
      add(sph, 1.5, 2.6, 0.75, 0.12, 0.85, 0.7); add(sph, 1.5, 2.6, -0.75, 0.12, 0.85, 0.7);
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(2.5, 2.35, 0), new THREE.Vector3(2.85, 1.7, 0), new THREE.Vector3(2.85, 0.9, 0), new THREE.Vector3(3.1, 0.4, 0)]), 18, 0.2, 8, false), 0, 0, 0);
      for (const z of [0.28, -0.28]) { const t = addMesh(g, new THREE.ConeGeometry(0.09, 1.1, 8), new THREE.MeshStandardMaterial({ color: lin('#ece6d6') }), 2.6, 1.9, z); t.rotation.z = -2.1; }
      g.scale.setScalar(s); return g;
    };
    [[0, 0, 0, 1.0], [-1.6, 2.4, 0.4, 0.95], [1.4, -2.0, -0.3, 0.5]].forEach(([dx, dz, ry, s]) => { const e = elephant(s); e.position.set(ele.p[0] + dx, y, ele.p[1] + dz); e.rotation.y = 0.6 + ry; scene.add(e); });
  }
  // Manhae square: stone bleachers, hoops, light towers
  if (COURT && BLEACH) {
    const { rows, STEP_H, STEP_D } = BLEACH, pos = [], nor = [], uv = [];
    const quad = (a, b, c, d, n) => { for (const v of [a, b, c, a, c, d]) { pos.push(...v); nor.push(...n); uv.push(v[0] / 2 + v[2] / 2, v[1] / 2); } };
    for (let i = 0; i < rows.length; i++) {
      const A = rows[i], B = rows[(i + 1) % rows.length], n = Math.min(A.n, B.n);
      for (let k = 1; k <= n; k++) {
        const y = COURT_Y + STEP_H * k, d0 = (k - 1) * STEP_D, d1 = k * STEP_D;
        const P = (R, d, yy) => [R.p[0] + R.ux * d, yy, R.p[1] + R.uz * d];
        quad(P(A, d0, y), P(B, d0, y), P(B, d1, y), P(A, d1, y), [0, 1, 0]);
        const ex = B.p[0] - A.p[0], ez = B.p[1] - A.p[1], L = Math.hypot(ex, ez) || 1;
        quad(P(A, d0, y - STEP_H), P(B, d0, y - STEP_H), P(B, d0, y), P(A, d0, y), [-(ez / L), 0, ex / L]);
      }
    }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const bm = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: lin('#aaa498'), roughness: 0.95, map: roofTex, side: THREE.DoubleSide })); bm.castShadow = bm.receiveShadow = true; scene.add(bm);
    const o = obb(COURT.p), ux = Math.cos(o.ang), uz = Math.sin(o.ang), cw2 = Math.min(30, o.w - 8);
    const blue = new THREE.MeshStandardMaterial({ color: lin('#2f6fc0'), roughness: 0.5 }), white = new THREE.MeshStandardMaterial({ color: lin('#f4f4f2'), roughness: 0.5 }), steel = new THREE.MeshStandardMaterial({ color: lin('#9aa0a6'), metalness: 0.6, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      addMesh(g, new THREE.BoxGeometry(1.2, 1.4, 1.6), blue, 0, 0.7, 0);
      addMesh(g, new THREE.BoxGeometry(0.16, 2.6, 0.16), white, 0.2, 2.6, 0);
      addMesh(g, new THREE.BoxGeometry(0.12, 0.12, 1.4), white, -0.5, 3.8, 0).rotation.z = 0;
      addMesh(g, new THREE.BoxGeometry(0.05, 1.05, 1.8), new THREE.MeshStandardMaterial({ color: lin('#ffffff'), transparent: true, opacity: 0.7, roughness: 0.1 }), -1.2, 3.55, 0);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 8, 20), new THREE.MeshStandardMaterial({ color: lin('#e0582c') })); rim.rotation.x = Math.PI / 2; rim.position.set(-1.45, 3.05, 0); g.add(rim);
      const x = o.cx + ux * s * (cw2 / 2 + 1.2), z = o.cz + uz * s * (cw2 / 2 + 1.2);
      g.position.set(x, COURT_Y, z); g.rotation.y = -o.ang + (s > 0 ? 0 : Math.PI); scene.add(g);
    }
    for (const s of [-1, 1]) {
      const x = o.cx + ux * s * (o.w / 2 + 1.5), z = o.cz + uz * s * (o.w / 2 + 1.5), y = getH0(x, z), g = new THREE.Group();
      addMesh(g, new THREE.CylinderGeometry(0.18, 0.26, 17, 10), steel, 0, 8.5, 0);
      addMesh(g, new THREE.BoxGeometry(2.4, 1.4, 0.3), steel, 0, 17.3, 0);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) addMesh(g, new THREE.CylinderGeometry(0.22, 0.22, 0.2, 10), white, -0.8 + a * 0.8, 16.95 + b * 0.7, 0.2).rotation.x = Math.PI / 2;
      g.position.set(x, y, z); g.rotation.y = -o.ang + Math.PI / 2; scene.add(g);
    }
  }
}

// ------------------------------------------------------------------ autumn trees seeded from the ortho canopy, kept off paths, courts and stairs
const TREES = { list: [] };
function buildTrees() {
  const segs = []; for (const r of M.paths) for (let i = 1; i < r.p.length; i++) segs.push([r.p[i - 1], r.p[i], VEH.has(r.k) ? 4 : 1.8]);
  const nearPath = (x, z) => segs.some(([a, b, w]) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < w; });
  const jp = nameP('정각원');
  const T = (M.trees3d || []).filter((t) => !M.art.some((a) => !a.place && Math.hypot(a.p[0] - t[0], a.p[1] - t[1]) < 6 + t[2])
    && !(COURT && (inPoly(t[0], t[1], COURT.p) || distToPoly(t[0], t[1], COURT.p) < 8))
    && !(FIELD && (inPoly(t[0], t[1], FIELD.p) || distToPoly(t[0], t[1], FIELD.p) < 2))
    && !(M.areas || []).some((a) => a.k === 'parking' && inPoly(t[0], t[1], a.p))
    && !(jp && distToPoly(t[0], t[1], jp) < 9) && !nearPath(t[0], t[1]));
  // lawns (e.g. the central plaza) keep only a few clipped trees, mostly pines
  const lawns = (M.green || []).filter((a) => a.k === 'lawn').map((a) => a.p);
  const T2 = T.filter((t) => { const h = Math.abs(Math.sin(t[0] * 7.13 + t[1] * 3.77) * 1000) % 1; return !lawns.some((p) => inPoly(t[0], t[1], p)) || h < 0.35; });
  T.length = 0; T.push(...T2);
  const onLawn = T.map((t) => lawns.some((p) => inPoly(t[0], t[1], p)));
  if (!T.length) return;
  const canopy = new THREE.IcosahedronGeometry(1, 1);
  { const p = canopy.attributes.position; for (let i = 0; i < p.count; i++) { const hs = Math.sin(p.getX(i) * 12.99 + p.getY(i) * 78.23 + p.getZ(i) * 37.71) * 43758.55, k = 0.86 + (hs - Math.floor(hs)) * 0.26; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } canopy.computeVertexNormals(); }
  const cone = new THREE.ConeGeometry(1, 1, 7); cone.translate(0, 0.5, 0);
  const trunk = new THREE.CylinderGeometry(0.5, 0.7, 1, 6); trunk.translate(0, 0.5, 0);
  const leaf = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const isPine = T.map((t, i) => Math.abs(Math.sin(t[0] * 3.1 + t[1] * 7.7)) % 1 < (onLawn[i] ? 0.6 : 0.28)), nP = isPine.filter(Boolean).length;
  const dec = new THREE.InstancedMesh(canopy, leaf, T.length - nP), pine = new THREE.InstancedMesh(cone, leaf, nP), tr = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: lin('#5a4636'), roughness: 0.9 }), T.length);
  const AUT = ['#c6622a', '#d98d2e', '#b4422a', '#e2b23a', '#8f8d3a', '#6c7d3a', '#a8512c'].map(lin), PIN = ['#2f4a2c', '#3a5532', '#2a4229'].map(lin);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  let di = 0, pi = 0;
  T.forEach((t, i) => {
    const [x, z, r0] = t, r = Math.min(r0, onLawn[i] ? 2.6 : 4.5), y = getH(x, z), h = r * 1.9 + 3, hash = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1, w = 0.85 + hash * 0.3;
    e.set(0, hash * 6.28, 0); q.setFromEuler(e);
    if (isPine[i]) { v.set(x, y + h * 0.22, z); s.set(r * 0.75 * w, h * 0.85, r * 0.75 * w); m4.compose(v, q, s); pine.setMatrixAt(pi, m4); pine.setColorAt(pi++, PIN[Math.floor(hash * PIN.length)]); }
    else { v.set(x, y + h * 0.62, z); s.set(r * w, h * 0.36, r * w); m4.compose(v, q, s); dec.setMatrixAt(di, m4); dec.setColorAt(di++, AUT[Math.floor(hash * AUT.length)]); }
    TREES.list.push({ x, z, y, h, pine: isPine[i], k: isPine[i] ? pi - 1 : di - 1, i, state: 0 });
    v.set(x, y, z); s.set(0.38, h * (isPine[i] ? 0.35 : 0.55), 0.38); m4.compose(v, q, s); tr.setMatrixAt(i, m4);
  });
  for (const im of [dec, pine, tr]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
  TREES.dec = dec; TREES.pine = pine; TREES.tr = tr;
}

// ------------------------------------------------------------------ names (OSM) matched onto S-map buildings
const RENAME = { '사회과학관.경영관': '사회과학관/경영관', '상록원 학생식당': '상록원', '정보문화관(P)': '정보문화관 P', '정보문화관(Q)': '정보문화관 Q', '학림관(J)': '학림관', 'MediaCenter': '미디어센터', '만해관': '만해관/법학관', '모 대학교 박물관': '박물관' };
const SKIP = new Set(['카페쎄리오', '카페보니애', 'MediaCenter', '모 대학교종각', '정각원']);
const labelsEl = $('#labels'); const labels = [];
function addLabel(text, pos, cls, info) {
  const el = document.createElement('div'); el.className = 'lbl ' + (cls || ''); el.innerHTML = '<span>' + text + '</span>';
  labelsEl.appendChild(el);
  const L = { el, pos, cls, info };
  if (info) el.addEventListener('click', (e) => { e.stopPropagation(); select(info, true); });
  labels.push(L); return L;
}
function buildingAt(x, z) {
  let best = null;
  for (const b of buildings) {
    const bb = b.bb; if (x < bb[0] - 1 || x > bb[2] + 1 || z < bb[1] - 1 || z > bb[3] + 1) continue;
    const d = Math.hypot(b.c[0] - x, b.c[1] - z);
    if (!best || d < best.d) best = { b, d };
  }
  return best && best.b;
}
function footprintAt(x, z) { for (const f of M.footprints) if (inPoly(x, z, f.p)) return f; return null; }
function buildLabels() {
  for (const n of M.names) {
    if (SKIP.has(n.n)) continue;
    const ip = innerPoint(n.p);
    const f = footprintAt(ip[0], ip[1]);
    const b = buildingAt(ip[0], ip[1]);
    const top = f ? f.max : b ? b.ymax : getH(ip[0], ip[1]) + 12;
    // anchor the label over the building's highest roof, not the OSM centroid
    let ax = ip[0], az = ip[1], ay = top;
    if (b) {
      const P = b.mesh.geometry.attributes.position.array;
      let sx = 0, sz = 0, n = 0;
      for (let v = 0; v < P.length / 3; v++) { if (P[v * 3 + 1] > b.ymax - 1.5) { sx += P[v * 3]; sz += P[v * 3 + 2]; n++; } }
      if (n) { ax = sx / n; az = sz / n; ay = b.ymax; }
    }
    const base = f ? f.min : b ? b.ymin : getH(ip[0], ip[1]);
    const name = RENAME[n.n] || n.n;
    const info = { name, en: n.en, lv: n.lv, top, base, b, pos: new THREE.Vector3(ax, ay, az), floors: (M.guide || []).filter((gd) => gd.osm === n.n && gd.floors).map((gd) => gd.site + ' — ' + gd.floors).join(String.fromCharCode(10)) };
    if (b) b.info = info;
    info.label = addLabel(name, info.pos.clone().add(new THREE.Vector3(0, 3, 0)), 'campus', info);
  }
  for (const a of M.art) {
    const y = getH(a.p[0], a.p[1]);
    const nm = a.n.replace(/\s*\(.*\)/, '');
    if (a.place) addLabel(nm, new THREE.Vector3(a.p[0], y + 8, a.p[1]), 'place');
    else addLabel(nm, new THREE.Vector3(a.p[0], y + 6, a.p[1]), 'minor');
  }
  for (const t of TRAD) t.label = addLabel(t.name, t.pos.clone(), t.towerLabel ? 'campus' : 'campus heritage', t);
  const pj = M.art.filter((a) => /관세음|코끼리/.test(a.n));
  if (pj.length) { const x = pj.reduce((s, a) => s + a.p[0], 0) / pj.length, z = pj.reduce((s, a) => s + a.p[1], 0) / pj.length; addLabel('팔정도', new THREE.Vector3(x, getH(x, z) + 12, z), 'place'); }
  for (const g of M.gates) addLabel(g.n.replace(/^.*대학교/, ''), new THREE.Vector3(g.p[0], getH(g.p[0], g.p[1]) + 6, g.p[1]), 'gate');
}

// ------------------------------------------------------------------ selection
let hl = null;
const hlMat = new THREE.MeshBasicMaterial({ color: 0xf47b20, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
function select(info, fly) {
  if (hl) { scene.remove(hl); hl = null; }
  labels.forEach((l) => l.el.classList.toggle('sel', !!info && l.info === info));
  if (!info) { $('#info').classList.remove('show'); return; }
  const b = info.b;
  if (b) {
    hl = new THREE.Mesh(b.mesh.geometry, hlMat); hl.renderOrder = 3; scene.add(hl);
  }
  $('#infoName').textContent = info.name || '건물';
  $('#infoEn').textContent = info.en || '';
  const chips = [];
  if (info.lv) chips.push('지상 ' + info.lv + '층');
  if (info.top && info.base) chips.push('높이 ' + (info.top - info.base).toFixed(1) + 'm');
  if (info.base) chips.push('바닥 해발 ' + info.base.toFixed(1) + 'm');
  if (info.top) chips.push('지붕 해발 ' + info.top.toFixed(1) + 'm');
  $('#infoChips').innerHTML = chips.map((c) => '<span>' + c + '</span>').join('');
  $('#infoDesc').textContent = (b && b.cfg && b.cfg.d) || info.desc || '';
  $('#infoFloors').textContent = info.floors || ''; $('#infoFloorsWrap').style.display = info.floors ? '' : 'none';
  $('#info').classList.add('show');
  if (fly) {
    const t = info.pos.clone(); t.y = (info.top + info.base) / 2;
    const dir = camera.position.clone().sub(controls.target); dir.y = 0; if (dir.lengthSq() < 1) dir.set(1, 0, 1); dir.normalize();
    const size = b ? Math.max(b.bb[2] - b.bb[0], b.bb[3] - b.bb[1]) : 40;
    const dist = clamp(size * 2.4, 60, 500);
    flyTo(t.clone().addScaledVector(dir, dist).add(new THREE.Vector3(0, dist * 0.55, 0)), t);
  }
}
let fly = null;
function flyTo(pos, target, dur) { if (walk.on) exitWalk(); fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, s: performance.now(), d: dur || 1500 }; }
function overview(instant) {
  const p = new THREE.Vector3(cx0 + 330, HC + 250, cz0 - 300), t = new THREE.Vector3(cx0, HC - 5, cz0 + 10);
  if (instant) { camera.position.copy(p); controls.target.copy(t); controls.update(); } else flyTo(p, t, 1700);
}

// ------------------------------------------------------------------ walk mode (real walking speed) + distance tool
const WALK_SPEED = 1.3, RUN_SPEED = 3.0, EYE = 1.6;
const walk = { on: false, yaw: 0, pitch: 0, keys: {}, dist: 0, time: 0 };
function blocked(x, z) {
  if (!inPoly(x, z, CAMPUS)) return true;
  const f = footprintAt(x, z); return !!f && f.min < getH(x, z) + 2.5;
}
function enterWalk(x, z) {
  fly = null; walk.on = true; walk.dist = 0; walk.time = 0;
  controls.enabled = false; controls.autoRotate = false; $('#tRotate').checked = false;
  if (x === undefined) { const pj = M.art.find((a) => /코끼리/.test(a.n)) || { p: [cx0, cz0] }; x = pj.p[0] + 6; z = pj.p[1] + 6; }
  camera.position.set(x, getH(x, z) + EYE, z);
  walk.yaw = Math.PI; walk.pitch = -0.05;
  if (canvas.requestPointerLock) { const pr = canvas.requestPointerLock(); if (pr && pr.catch) pr.catch(() => {}); }
  document.body.classList.add('walking');
}
function exitWalk() {
  if (!walk.on) return;
  walk.on = false; controls.enabled = true;
  const f = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
  controls.target.copy(camera.position).addScaledVector(f, 30); controls.target.y = getH(controls.target.x, controls.target.z) + 2;
  camera.position.addScaledVector(f, -30).y += 30;
  if (document.pointerLockElement) document.exitPointerLock();
  document.body.classList.remove('walking');
}
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && walk.on) exitWalk(); });
document.addEventListener('mousemove', (e) => { if (!walk.on || !document.pointerLockElement) return; walk.yaw -= e.movementX * 0.0022; walk.pitch = clamp(walk.pitch - e.movementY * 0.0022, -1.35, 1.35); });
document.addEventListener('keydown', (e) => { walk.keys[e.code] = true; if (e.code === 'Escape') { exitWalk(); measure.on && stopMeasure(); } });
document.addEventListener('keyup', (e) => { walk.keys[e.code] = false; });
const fmtTime = (s) => { s = Math.round(s); const m = Math.floor(s / 60); return m ? m + '분 ' + (s % 60) + '초' : s + '초'; };
function stepWalk(dt) {
  const K = walk.keys, sp = (K.ShiftLeft || K.ShiftRight ? RUN_SPEED : WALK_SPEED);
  const f = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw)), r = new THREE.Vector3(-f.z, 0, f.x), mv = new THREE.Vector3();
  if (K.KeyW || K.ArrowUp) mv.add(f); if (K.KeyS || K.ArrowDown) mv.sub(f);
  if (K.KeyD || K.ArrowRight) mv.add(r); if (K.KeyA || K.ArrowLeft) mv.sub(r);
  if (mv.lengthSq()) {
    mv.normalize().multiplyScalar(sp * dt);
    const p = camera.position, ox = p.x, oz = p.z, oh = getH(ox, oz);
    if (!blocked(p.x + mv.x, p.z)) p.x += mv.x;
    if (!blocked(p.x, p.z + mv.z)) p.z += mv.z;
    const moved = Math.hypot(p.x - ox, p.z - oz, getH(p.x, p.z) - oh);
    if (moved > 0) { walk.dist += moved; walk.time += dt; }
  }
  camera.position.y = lerp(camera.position.y, getH(camera.position.x, camera.position.z) + EYE, Math.min(1, dt * 10));
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(-Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), -Math.cos(walk.yaw) * Math.cos(walk.pitch))));
  $('#walkStat').textContent = '이동 ' + walk.dist.toFixed(0) + 'm · ' + fmtTime(walk.time) + ' · 해발 ' + getH(camera.position.x, camera.position.z).toFixed(1) + 'm';
}
// Tobler's hiking function: km/h = 6·exp(-3.5·|slope + 0.05|), scaled so flat ground = 1.3 m/s
const tobler = (slope) => 6 * Math.exp(-3.5 * Math.abs(slope + 0.05)) / 5.036 * 1.3;
const measure = { on: false, pts: [], line: null, dots: [] };
const mLineMat = new THREE.LineBasicMaterial({ color: 0xf47b20, depthTest: false, transparent: true });
const dotGeo = new THREE.SphereGeometry(0.9, 12, 8), dotMat = new THREE.MeshBasicMaterial({ color: 0xf47b20, depthTest: false, transparent: true });
function startMeasure() { stopMeasure(); measure.on = true; document.body.classList.add('measuring'); $('#measure').classList.add('show'); updateMeasure(); }
function stopMeasure() {
  measure.on = false; measure.pts = []; document.body.classList.remove('measuring'); $('#measure').classList.remove('show');
  if (measure.line) { scene.remove(measure.line); measure.line = null; } measure.dots.forEach((d) => scene.remove(d)); measure.dots = [];
}
function updateMeasure() {
  if (measure.line) { scene.remove(measure.line); measure.line.geometry.dispose(); measure.line = null; }
  let dist = 0, time = 0, up = 0, down = 0; const pts = [];
  for (let i = 0; i < measure.pts.length; i++) {
    const p = measure.pts[i];
    if (i) {
      const q = measure.pts[i - 1], L = Math.hypot(p.x - q.x, p.z - q.z), n = Math.max(1, Math.ceil(L / 1));
      for (let k = 1; k <= n; k++) {
        const x0 = lerp(q.x, p.x, (k - 1) / n), z0 = lerp(q.z, p.z, (k - 1) / n), x1 = lerp(q.x, p.x, k / n), z1 = lerp(q.z, p.z, k / n);
        const h0 = getH(x0, z0), h1 = getH(x1, z1), dh = h1 - h0, run = L / n, d3 = Math.hypot(run, dh);
        dist += d3; time += d3 / tobler(dh / Math.max(run, 1e-6)); if (dh > 0) up += dh; else down -= dh;
        pts.push(new THREE.Vector3(x1, h1 + 0.6, z1));
      }
    } else pts.push(new THREE.Vector3(p.x, getH(p.x, p.z) + 0.6, p.z));
  }
  if (pts.length > 1) { measure.line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), Math.min(2000, pts.length * 2), 0.45, 6, false), dotMat); measure.line.renderOrder = 6; scene.add(measure.line); }
  $('#mStat').innerHTML = measure.pts.length < 2 ? '땅을 눌러 출발점과 경유점을 찍으세요.'
    : '<b>' + dist.toFixed(0) + 'm</b> · 걸어서 약 <b>' + fmtTime(time) + '</b><br>오르막 ' + up.toFixed(1) + 'm · 내리막 ' + down.toFixed(1) + 'm';
}

// ------------------------------------------------------------------ UI
function wireUI() {
  window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
}

// ------------------------------------------------------------------ loop
const tv = new THREE.Vector3(); let last = performance.now();
// labels only touch the DOM when what they show actually changes (style writes every frame force a full style recalc)
const setSt = (l, k, v) => { if (l['_' + k] !== v) { l['_' + k] = v; l.el.style[k] = v; } };
function updateLabels() {
  if (labelsEl.style.display === 'none' || document.body.classList.contains('scoped')) return;
  const W = innerWidth, H = innerHeight;
  for (const l of labels) {
    tv.copy(l.pos).project(camera);
    const d = camera.position.distanceTo(l.pos), maxD = l.cls === 'minor' ? 250 : l.cls === 'gate' ? 600 : l.info && l.info.big ? 4000 : 1400;
    if (tv.z > 1 || Math.abs(tv.x) > 1.1 || Math.abs(tv.y) > 1.1 || d > maxD) { setSt(l, 'display', 'none'); continue; }
    setSt(l, 'display', '');
    setSt(l, 'transform', 'translate(' + Math.round((tv.x + 1) / 2 * W) + 'px,' + Math.round((1 - tv.y) / 2 * H) + 'px)');
    setSt(l, 'zIndex', String(10000 - Math.round(d / 4) * 4)); setSt(l, 'opacity', clamp(1.25 - d / maxD, 0.3, 1).toFixed(2));
  }
}
// resolution follows the frame rate: drop the pixel ratio when frames run long, raise it back when there's headroom
let frameAvg = 16, resT = 0;
function adaptRes(ms, now) {
  if (ms > 0 && ms < 250) frameAvg += (ms - frameAvg) * 0.05;
  if (now - resT < 1500 || document.hidden) return;
  let p = PR;
  if (frameAvg > 24 && PR > 0.6) p = Math.max(0.6, PR - 0.15);
  else if (frameAvg < 17.8 && PR < PR_MAX) p = Math.min(PR_MAX, PR + 0.1);   // a 60 Hz phone running at full rate earns sharper pixels back
  if (p !== PR) { PR = p; resT = now; renderer.setPixelRatio(PR); renderer.setSize(innerWidth, innerHeight); window.dispatchEvent(new Event('pixelratio')); }
}
function frame(now) {
  const ms = now - last, dt = Math.min(0.05, ms / 1000); last = now;
  adaptRes(ms, now);
  if (fly) { const t = clamp((now - fly.s) / fly.d, 0, 1), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e); if (t >= 1) fly = null; }
  if (walk.on) stepWalk(dt);
  else if (!(window.__game && window.__game.G.playing)) { controls.update(); const gy = getH(camera.position.x, camera.position.z) + 2; if (camera.position.y < gy) camera.position.y = gy; }
  sky.position.copy(camera.position); CLOUD_U.uT.value = now / 1000;
  const G = window.__game; if (G) G.pre(dt, now);
  renderer.render(scene, camera); updateLabels();
}
function loop(now) { if (!(window.__v2 && window.__v2.paused)) frame(now); requestAnimationFrame(loop); }

(async function boot() {
  try {
    const bar = (p, t) => { $('#loadBar').style.width = p + '%'; $('#loadTxt').textContent = t; return new Promise((r) => setTimeout(r, 16)); };
    await bar(65, '남산 자락 지형을 까는 중'); await buildTerrain();
    await bar(80, '부술 건물을 세우는 중'); await buildBuildings(); buildSurfaces(); buildSteps(); buildTraditional(); buildLandmarks(); buildTrees();
    buildLabels(); wireUI(); await bar(92, '무기를 장전하는 중');
    overview(true);
    window.__v2.ready = true; window.dispatchEvent(new Event('v2ready'));
    renderer.shadowMap.needsUpdate = true;
    $('#loading').classList.remove('show');
    requestAnimationFrame(loop);
    
  } catch (err) { console.error(err); $('#loadTxt').textContent = '오류: ' + err.message; }
})();
window.__v2 = { namsanSurf, namsanHit, CLOUD_Y, scene, camera, controls, renderer, getH, getH0, buildings, overview, frame: () => frame(performance.now()), TREES, SCORCH, HF, DW, DH, X0, Z0, CAMPUS, BASEY, inPoly, labels, TRAD, sun, M, CLIFF_Y, stats: () => ({ pr: PR, frameAvg: +frameAvg.toFixed(1) }) };
})();
