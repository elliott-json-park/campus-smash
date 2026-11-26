(function () {
'use strict';
// Campus Smash V4 — no aircraft. You aim from a free camera above the campus with six weapons;
// the work here is in how things blow up: staged fireballs, shock fronts, fragments, soot and broken glass on the
// facades, interior floors exposed by holes, and buildings that groan, lean and sink into their own dust.
// The scene can finish booting before this script is even parsed, so check the flag as well as listening.
function boot() {
  if (window.__game) return;
  try { window.__game = createGame(); }
  catch (err) { console.error(err); window.__gameErr = err.stack; const t = document.querySelector('#loadTxt'); if (t) { t.textContent = '오류: ' + err.message; document.querySelector('#loading').classList.add('show'); } }
}
if (window.__v2 && window.__v2.ready) boot(); else window.addEventListener('v2ready', boot, { once: true });

function createGame() {
const V = window.__v2;
const { scene, camera, controls, renderer, getH, buildings, TREES, SCORCH, HF, DW, DH, X0, Z0, CAMPUS, BASEY, inPoly, labels, M, CLIFF_Y } = V;
const canvas = renderer.domElement;
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const V3 = THREE.Vector3, UP = new V3(0, 1, 0);
const _v = new V3(), _v2 = new V3(), _v3 = new V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _e = new THREE.Euler(), _c = new THREE.Color();
const lin = (h) => new THREE.Color(h).convertSRGBToLinear();
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const GRAV = 16;
// sparks and chunks ask for the ground thousands of times a frame, so cache the campus test per 1 m cell.
// Off campus there is only the cliff, and far below it the cloud.
const inCampus = new Int8Array(DW * DH).fill(-1);
function groundY(x, z) {
  const i = Math.round(x - X0), j = Math.round(z - Z0);
  if (i < 0 || j < 0 || i >= DW || j >= DH) return offGround(x, z);
  const k = j * DW + i; let f = inCampus[k];
  if (f < 0) f = inCampus[k] = inPoly(X0 + i, Z0 + j, CAMPUS) ? 1 : 0;
  return f ? getH(x, z) : offGround(x, z);
}
function inCampusAt(x, z) { const i = Math.round(x - X0), j = Math.round(z - Z0); if (i < 0 || j < 0 || i >= DW || j >= DH) return false; const k = j * DW + i; if (inCampus[k] < 0) inCampus[k] = inPoly(X0 + i, Z0 + j, CAMPUS) ? 1 : 0; return inCampus[k] === 1; }
function offGround(x, z) { const h = V.namsanSurf(x, z); return h > V.CLOUD_Y + 1 ? h : CLIFF_Y; }
const camGround = (x, z) => Math.max(BASEY + 10, groundY(x, z));   // the camera's target glides over the drop instead of diving into it
function randDir(out) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u); return out.set(s * Math.cos(a), u, s * Math.sin(a)); }
const fmtNum = (n) => Math.round(n).toLocaleString('ko-KR');
let BX0 = 1e9, BX1 = -1e9, BZ0 = 1e9, BZ1 = -1e9;
for (const p of CAMPUS) { BX0 = Math.min(BX0, p[0]); BX1 = Math.max(BX1, p[0]); BZ0 = Math.min(BZ0, p[1]); BZ1 = Math.max(BZ1, p[1]); }
const CXc = (BX0 + BX1) / 2, CZc = (BZ0 + BZ1) / 2;

// footprint lookup grid (1 m): which building stands where, so falling things can land on roofs that still exist
const FP = M.footprints, fpGrid = new Int16Array(DW * DH).fill(-1), fpStruct = new Array(FP.length).fill(null);
FP.forEach((f, fi) => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of f.p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  f.bb = [x0, z0, x1, z1];
  for (let j = clamp(Math.floor(z0 - Z0), 0, DH - 1); j <= clamp(Math.ceil(z1 - Z0), 0, DH - 1); j++)
    for (let i = clamp(Math.floor(x0 - X0), 0, DW - 1); i <= clamp(Math.ceil(x1 - X0), 0, DW - 1); i++) if (inPoly(X0 + i, Z0 + j, f.p)) fpGrid[j * DW + i] = fi;
});
function fpAt(x, z) { const i = Math.round(x - X0), j = Math.round(z - Z0); return i >= 0 && j >= 0 && i < DW && j < DH ? fpGrid[j * DW + i] : -1; }
function surfaceY(x, z, y) {
  const fi = fpAt(x, z);
  if (fi >= 0) { const S = fpStruct[fi]; if (S && !S.dead && y > FP[fi].max - 1.5) return FP[fi].max; }
  return groundY(x, z);
}
function roofTopAt(x, z) { const fi = fpAt(x, z); if (fi >= 0) { const S = fpStruct[fi]; if (S && !S.dead) return FP[fi].max; } return groundY(x, z); }
function groundNormal(x, z, out) { return out.set(groundY(x - 1, z) - groundY(x + 1, z), 2, groundY(x, z - 1) - groundY(x, z + 1)).normalize(); }

// ------------------------------------------------------------------ textures
function canvasTex(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return new THREE.CanvasTexture(c); }
const GLOW = canvasTex(128, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.75)'); gr.addColorStop(0.45, 'rgba(255,255,255,.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
// billowy puff: rgb = fractal detail (shades the puff), alpha = soft cauliflower edge
function puffTex(size, seed, edge) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
  const N = 32, grid = new Float32Array(N * N); let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N * N; i++) grid[i] = rnd();
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, a = ((xi % N) + N) % N, b = ((yi % N) + N) % N, a1 = (a + 1) % N, b1 = (b + 1) % N;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(grid[b * N + a], grid[b * N + a1], u), lerp(grid[b1 * N + a], grid[b1 * N + a1], u), v);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * 5, fy = y / size * 5;
    const n = (vn(fx, fy) * 0.5 + vn(fx * 2.1, fy * 2.1) * 0.25 + vn(fx * 4.3, fy * 4.3) * 0.15 + vn(fx * 8.7, fy * 8.7) * 0.1) / 1.0;
    const dx = x / size - 0.5, dy = y / size - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 2, base = 1 - r;
    const a = clamp(base * 1.7 + (n - 0.5) * edge, 0, 1) * clamp(base * 4, 0, 1);
    const k = (y * size + x) * 4, lum = clamp(0.45 + n * 0.75, 0, 1);
    d[k] = d[k + 1] = d[k + 2] = Math.round(lum * 255); d[k + 3] = Math.round(Math.pow(a, 1.25) * 255);
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}
const FIRE_TEX = puffTex(128, 7, 2.2), SMOKE_TEX = puffTex(128, 31, 1.6);

// ------------------------------------------------------------------ particles: additive (fire) + alpha (smoke/dust/dirt)
// fields: 0-2 pos, 3-5 vel, 6 age, 7 life, 8 size0, 9 size1, 10-12 rgb, 13 alpha, 14 drag, 15 gravity(+down), 16 kind, 17 rot, 18 spin, 19 wind, 20 delay, 21 glow
const ST = 22;
const PV = 'attribute float aSize; attribute vec4 aCol; attribute float aRot; uniform float uScale; varying vec4 vC; varying float vR;\n' +
  'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.5, -mv.z); vC = aCol; vR = aRot; gl_Position = projectionMatrix * mv; }';
const PF = 'uniform sampler2D tex; uniform float uShade; varying vec4 vC; varying float vR;\n' +
  'void main(){ vec2 pc = gl_PointCoord - 0.5; float cs = cos(vR), sn = sin(vR); vec2 c = vec2(cs * pc.x - sn * pc.y, sn * pc.x + cs * pc.y);\n' +
  ' vec4 t = texture2D(tex, c + 0.5); float a = t.a * vC.a; if (a < 0.004) discard;\n' +
  ' float sh = mix(1.0, 1.08 - pc.y * 0.85, uShade) * mix(1.0, t.r * 1.25, 0.8);\n' +
  ' gl_FragColor = vec4(vC.rgb * sh, a); }';
const pScale = { value: 1 };
const _dbs = new THREE.Vector2();
function updPScale() { const h = renderer.getDrawingBufferSize(_dbs).y; pScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * (camera.view && camera.view.enabled ? camera.view.fullHeight / camera.view.height : 1); }
updPScale(); for (const ev of ['resize', 'pixelratio']) window.addEventListener(ev, () => setTimeout(updPScale, 0));
function makePS(cap, additive, order, tex) {
  const geo = new THREE.BufferGeometry();
  const P = new Float32Array(cap * 3), C = new Float32Array(cap * 4), S = new Float32Array(cap), R = new Float32Array(cap);
  const aP = new THREE.BufferAttribute(P, 3), aC = new THREE.BufferAttribute(C, 4), aS = new THREE.BufferAttribute(S, 1), aR = new THREE.BufferAttribute(R, 1);
  for (const a of [aP, aC, aS, aR]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aP); geo.setAttribute('aCol', aC); geo.setAttribute('aSize', aS); geo.setAttribute('aRot', aR); geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({ uniforms: { tex: { value: tex }, uScale: pScale, uShade: { value: additive ? 0 : 1 } }, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = order; scene.add(pts);
  return { cap, n: 0, D: new Float32Array(cap * ST), P, C, S, R, aP, aC, aS, aR, geo };
}
const FIRE = makePS(window.LITE ? 4500 : 8000, true, 6, FIRE_TEX), SMOKE = makePS(window.LITE ? 5500 : 10000, false, 5, SMOKE_TEX);
// particle budget: shrinks when frames get slow (overdraw from big smoke puffs is the usual cause) and recovers when they're fast again
let PQ = 1, frameEma = 16, lastNow = 0;
function adaptBudget(dt) {
  const now = performance.now(), ms = now - lastNow; lastNow = now;
  if (ms > 0 && ms < 200) frameEma = lerp(frameEma, ms, 0.06);
  if (frameEma > 34) PQ = Math.max(0.45, PQ - dt * 0.5); else if (frameEma < 24) PQ = Math.min(1, PQ + dt * 0.15);
}
function emit(ps, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav, kind, wind, delay, glow) {
  const lim = ps.cap * PQ;
  if (ps.n > lim * 0.5 && Math.random() < (ps.n - lim * 0.5) / (lim * 0.5)) return;   // under load, thin out instead of piling up overdraw
  let i = ps.n; if (i >= ps.cap) i = (Math.random() * ps.cap) | 0; else ps.n++;
  const D = ps.D, o = i * ST;
  D[o] = x; D[o + 1] = y; D[o + 2] = z; D[o + 3] = vx; D[o + 4] = vy; D[o + 5] = vz; D[o + 6] = 0; D[o + 7] = life; D[o + 8] = s0; D[o + 9] = s1;
  D[o + 10] = r; D[o + 11] = g; D[o + 12] = b; D[o + 13] = a; D[o + 14] = drag; D[o + 15] = grav; D[o + 16] = kind; D[o + 17] = Math.random() * 6.28; D[o + 18] = rand(-1, 1); D[o + 19] = wind || 0;
  D[o + 20] = delay || 0; D[o + 21] = glow || 0;
}
const WIND = new V3(2.2, 0, 1.2);
function stepPS(ps, dt) {
  const D = ps.D, P = ps.P, C = ps.C, S = ps.S, R = ps.R;
  let i = 0;
  while (i < ps.n) {
    const o = i * ST;
    D[o + 6] += dt;
    const age = D[o + 6] - D[o + 20];
    if (age >= D[o + 7]) { ps.n--; if (i !== ps.n) D.copyWithin(o, ps.n * ST, ps.n * ST + ST); continue; }
    if (age < 0) { P[i * 3] = D[o]; P[i * 3 + 1] = D[o + 1]; P[i * 3 + 2] = D[o + 2]; S[i] = 0; C[i * 4 + 3] = 0; i++; continue; }
    const dr = Math.max(0, 1 - D[o + 14] * dt);
    D[o + 3] *= dr; D[o + 5] *= dr; D[o + 4] = D[o + 4] * dr - D[o + 15] * dt;
    D[o] += (D[o + 3] + WIND.x * D[o + 19]) * dt; D[o + 1] += D[o + 4] * dt; D[o + 2] += (D[o + 5] + WIND.z * D[o + 19]) * dt;
    D[o + 17] += D[o + 18] * dt * 0.6;
    const t = age / D[o + 7], kind = D[o + 16];
    let r, g, b, a, s;
    if (kind === 1) {                                                  // flame: white-hot → yellow → orange → deep red
      if (t < 0.06) { const k = t / 0.06; r = 1; g = 0.92 - 0.2 * k; b = 0.7 - 0.42 * k; }
      else if (t < 0.38) { const k = (t - 0.06) / 0.32; r = 1; g = 0.72 - 0.38 * k; b = 0.28 - 0.21 * k; }
      else if (t < 0.7) { const k = (t - 0.38) / 0.32; r = 1 - 0.35 * k; g = 0.36 - 0.24 * k; b = 0.08 - 0.05 * k; }
      else { const k = (t - 0.7) / 0.3; r = 0.65 - 0.5 * k; g = 0.12 - 0.09 * k; b = 0.03 - 0.02 * k; }
      a = D[o + 13] * Math.pow(1 - t, 1.2); s = D[o + 8] + (D[o + 9] - D[o + 8]) * Math.sqrt(t);
    } else if (kind === 2) {
      r = 1; g = 0.85 - 0.4 * t; b = 0.45 - 0.35 * t; a = D[o + 13] * (1 - t); s = D[o + 8] * (1 - 0.5 * t);
    } else {
      r = D[o + 10]; g = D[o + 11]; b = D[o + 12];
      if (kind === 4) {                                                // smoke lit from inside by the fireball, cooling to soot
        const k = Math.min(1, t / 0.3), w = (1 - k) * (1 - k) * D[o + 21];
        r = r + (1.0 - r) * w; g = g + (0.46 - g) * w; b = b + (0.14 - b) * w;
        a = D[o + 13] * Math.min(1, t * 14) * Math.pow(1 - t, 1.3);
      } else a = D[o + 13] * Math.min(1, t * 7) * Math.pow(1 - t, 1.4);
      s = D[o + 8] + (D[o + 9] - D[o + 8]) * (1 - (1 - t) * (1 - t));
    }
    P[i * 3] = D[o]; P[i * 3 + 1] = D[o + 1]; P[i * 3 + 2] = D[o + 2];
    C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = a; S[i] = s; R[i] = D[o + 17];
    i++;
  }
  ps.geo.setDrawRange(0, ps.n);
  // upload only the live part of each buffer
  ps.aP.updateRange.count = ps.n * 3; ps.aC.updateRange.count = ps.n * 4; ps.aS.updateRange.count = ps.aR.updateRange.count = ps.n;
  ps.aP.needsUpdate = ps.aC.needsUpdate = ps.aS.needsUpdate = ps.aR.needsUpdate = true;
}
// a blast front sweeps the dust and smoke that is already hanging around
function shockPush(p, R) {
  const Rp = R * 3.2, R2 = Rp * Rp, D = SMOKE.D;
  for (let i = 0; i < SMOKE.n; i++) {
    const o = i * ST; if (D[o + 6] - D[o + 20] < 0.4) continue;
    const dx = D[o] - p.x, dy = D[o + 1] - p.y, dz = D[o + 2] - p.z, dd = dx * dx + dy * dy + dz * dz; if (dd > R2 || dd < 0.01) continue;
    const d = Math.sqrt(dd), k = (1 - d / Rp) * R * 1.4 / d;
    D[o + 3] += dx * k; D[o + 4] += dy * k * 0.6 + k * d * 0.2; D[o + 5] += dz * k;
  }
}

// ------------------------------------------------------------------ sparks: velocity-stretched glowing streaks (fragments, glass, embers, tracers)
// fields: 0-2 pos, 3-5 vel, 6 age, 7 life, 8 width, 9 stretch, 10 kind, 11-13 rgb, 14 drag, 15 gravity
// kinds: 0 hot fragment (cools, skips off surfaces), 1 glass (glints), 2 ember (flickers), 3 tracer (solid)
const SPS = 16, SP_CAP = 5000;
const SPK = { n: 0, D: new Float32Array(SP_CAP * SPS) };
{
  const H = new Float32Array(SP_CAP * 12), T = new Float32Array(SP_CAP * 12), Cc = new Float32Array(SP_CAP * 16), W = new Float32Array(SP_CAP * 4);
  const Sd = new Float32Array(SP_CAP * 4), En = new Float32Array(SP_CAP * 4), idx = new Uint16Array(SP_CAP * 6);
  for (let i = 0; i < SP_CAP; i++) {
    Sd.set([-1, 1, -1, 1], i * 4); En.set([0, 0, 1, 1], i * 4);
    const v = i * 4; idx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  const aH = new THREE.BufferAttribute(H, 3), aT = new THREE.BufferAttribute(T, 3), aC = new THREE.BufferAttribute(Cc, 4), aW = new THREE.BufferAttribute(W, 1);
  for (const a of [aH, aT, aC, aW]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aH); geo.setAttribute('aTail', aT); geo.setAttribute('aCol', aC); geo.setAttribute('aW', aW);
  geo.setAttribute('aSide', new THREE.BufferAttribute(Sd, 1)); geo.setAttribute('aEnd', new THREE.BufferAttribute(En, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: pScale },
    vertexShader: 'attribute vec3 aTail; attribute vec4 aCol; attribute float aW; attribute float aSide; attribute float aEnd; uniform float uScale; varying vec4 vC; varying vec2 vQ;\n' +
      'void main(){ vec4 h = modelViewMatrix * vec4(position, 1.0), t = modelViewMatrix * vec4(aTail, 1.0);\n' +
      ' vec2 d = t.xy / max(0.1, -t.z) - h.xy / max(0.1, -h.z); float L = length(d); vec2 dir = L > 1e-6 ? d / L : vec2(0.0, 1.0);\n' +
      ' vec4 p = aEnd > 0.5 ? t : h; float w = max(aW, -p.z * 1.2 / uScale) * (aEnd > 0.5 ? 0.6 : 1.0);\n' +
      ' p.xy += vec2(-dir.y, dir.x) * aSide * w; gl_Position = projectionMatrix * p; vC = aCol; vQ = vec2(aSide, aEnd); }',
    fragmentShader: 'varying vec4 vC; varying vec2 vQ; void main(){ float a = vC.a * (1.0 - vQ.x * vQ.x) * (1.0 - 0.8 * vQ.y); gl_FragColor = vec4(vC.rgb, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide      // the quad winding flips with the streak's screen direction
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 7; scene.add(mesh);
  Object.assign(SPK, { H, T, Cc, W, aH, aT, aC, aW, geo, mat });
}
function spark(x, y, z, vx, vy, vz, life, width, stretch, kind, r, g, b, drag, grav) {
  const lim = SP_CAP * PQ;
  if (kind !== 3 && SPK.n > lim * 0.5 && Math.random() < (SPK.n - lim * 0.5) / (lim * 0.5)) return;
  let i = SPK.n; if (i >= SP_CAP) i = (Math.random() * SP_CAP) | 0; else SPK.n++;
  const D = SPK.D, o = i * SPS;
  D[o] = x; D[o + 1] = y; D[o + 2] = z; D[o + 3] = vx; D[o + 4] = vy; D[o + 5] = vz; D[o + 6] = 0; D[o + 7] = life; D[o + 8] = width; D[o + 9] = stretch; D[o + 10] = kind;
  D[o + 11] = r; D[o + 12] = g; D[o + 13] = b; D[o + 14] = drag; D[o + 15] = grav;
}
function stepSparks(dt) {
  const D = SPK.D, H = SPK.H, T = SPK.T, Cc = SPK.Cc, W = SPK.W;
  let i = 0;
  while (i < SPK.n) {
    const o = i * SPS;
    D[o + 6] += dt;
    if (D[o + 6] >= D[o + 7]) { SPK.n--; if (i !== SPK.n) D.copyWithin(o, SPK.n * SPS, SPK.n * SPS + SPS); continue; }
    const kind = D[o + 10], dr = Math.max(0, 1 - D[o + 14] * dt);
    D[o + 3] *= dr; D[o + 5] *= dr; D[o + 4] = D[o + 4] * dr - D[o + 15] * dt;
    D[o] += D[o + 3] * dt; D[o + 1] += D[o + 4] * dt; D[o + 2] += D[o + 5] * dt;
    if (kind === 0 || kind === 1) {
      const gy = surfaceY(D[o], D[o + 2], D[o + 1]);
      if (D[o + 1] < gy) { D[o + 1] = gy + 0.02; D[o + 4] = Math.abs(D[o + 4]) * (kind ? 0.12 : 0.32); D[o + 3] *= 0.6; D[o + 5] *= 0.6; }
    }
    const t = D[o + 6] / D[o + 7];
    let r, g, b, a;
    if (kind === 0) {
      if (t < 0.3) { const k = t / 0.3; r = 1; g = 0.95 - 0.35 * k; b = 0.7 - 0.5 * k; } else { const k = (t - 0.3) / 0.7; r = 1 - 0.45 * k; g = 0.6 - 0.48 * k; b = 0.2 - 0.18 * k; }
      a = 1 - t * t;
    } else if (kind === 1) { const tw = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(D[o + 6] * 38 + i * 2.7), 3); r = D[o + 11] * tw; g = D[o + 12] * tw; b = D[o + 13] * tw; a = 1 - t; }
    else if (kind === 2) { const fl = 0.55 + 0.45 * Math.sin(D[o + 6] * 21 + i * 1.7); r = D[o + 11] * fl; g = D[o + 12] * fl; b = D[o + 13] * fl; a = (1 - t) * Math.min(1, t * 8); }
    else { r = D[o + 11]; g = D[o + 12]; b = D[o + 13]; a = 1; }
    const k3 = D[o + 9], sp = Math.hypot(D[o + 3], D[o + 4], D[o + 5]), L = sp * k3, minL = D[o + 8] * 2;
    let tx = D[o] - D[o + 3] * k3, ty = D[o + 1] - D[o + 4] * k3, tz = D[o + 2] - D[o + 5] * k3;
    if (L < minL) { const f = sp > 1e-3 ? minL / sp : 0; tx = D[o] - D[o + 3] * f; ty = D[o + 1] - (sp > 1e-3 ? D[o + 4] * f : minL); tz = D[o + 2] - D[o + 5] * f; }
    for (let v = 0; v < 4; v++) {
      const q = i * 4 + v;
      H[q * 3] = D[o]; H[q * 3 + 1] = D[o + 1]; H[q * 3 + 2] = D[o + 2];
      T[q * 3] = tx; T[q * 3 + 1] = ty; T[q * 3 + 2] = tz;
      Cc[q * 4] = r; Cc[q * 4 + 1] = g; Cc[q * 4 + 2] = b; Cc[q * 4 + 3] = a; W[q] = D[o + 8];
    }
    i++;
  }
  SPK.geo.setDrawRange(0, SPK.n * 6);
  SPK.aH.updateRange.count = SPK.aT.updateRange.count = SPK.n * 12; SPK.aC.updateRange.count = SPK.n * 16; SPK.aW.updateRange.count = SPK.n * 4;
  SPK.aH.needsUpdate = SPK.aT.needsUpdate = SPK.aC.needsUpdate = SPK.aW.needsUpdate = true;
}

// ------------------------------------------------------------------ flashes, rings, shock fronts, lights, camera shake
const flashes = [], rings = [], shocks = [], lights = [];
// every point light in the scene is paid for by every lit pixel, even at zero intensity, so keep the pool tiny
for (let i = 0; i < 1; i++) { const L = new THREE.PointLight(0xffa860, 0, 80, 2); L.userData = { t: 1, dur: 1, I: 0 }; scene.add(L); lights.push(L); }
let lightI = 0;
const ringGeo = new THREE.RingGeometry(0.82, 1, 72).rotateX(-Math.PI / 2);
const shockGeo = new THREE.SphereGeometry(1, 40, 20);
const SHOCK_V = 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const SHOCK_F = 'uniform float uA; uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(vN, vV)); gl_FragColor = vec4(uC, pow(f, 2.6) * uA); }';
const FLASH_C = new THREE.Color(1, 0.93, 0.78), GLOW_C = new THREE.Color(1, 0.55, 0.22);
function flash(p, size, dur, color) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.position.copy(p); s.scale.setScalar(0.01); scene.add(s); flashes.push({ s, t: 0, dur, size });
}
function ring(p, R, dur, color) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: color || 0xfff0d8, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(p); m.scale.setScalar(0.01); scene.add(m); rings.push({ m, t: 0, dur, R });
}
function shockwave(p, R, dur, a, color) {
  const m = new THREE.Mesh(shockGeo, new THREE.ShaderMaterial({ uniforms: { uA: { value: a }, uC: { value: new THREE.Color(color || 0xfff3e0) } }, vertexShader: SHOCK_V, fragmentShader: SHOCK_F,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.copy(p); m.scale.setScalar(0.01); m.renderOrder = 8; scene.add(m); shocks.push({ m, t: 0, dur, R, a });
}
function flashLight(p, R) {
  const L = lights[lightI++ % lights.length];
  L.position.copy(p); L.position.y += R * 0.4; L.distance = R * 8; L.userData = { t: 0, dur: 0.3 + R * 0.025, I: 5 + R * 0.3 };
  return L;
}
function flashLightBlue(p, R) { const L = flashLight(p, R); L.userData.blue = true; L.userData.I *= 2.2; L.distance = R * 14; }
// trauma-style shake: arrives with the shock front (≈ speed of sound, capped) and wobbles smoothly instead of jittering
let trauma = 0; const shakeQ = [];
function addShake(p, mag) { const d = camera.position.distanceTo(p); shakeQ.push({ at: G.time + Math.min(0.6, d / 340), m: mag * clamp(170 / d, 0.04, 1.5) }); }
const wob = (t, a, b, c) => Math.sin(t * a) * 0.6 + Math.sin(t * b + 1.3) * 0.3 + Math.sin(t * c + 2.1) * 0.1;
function stepFx(dt) {
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.t += dt; const k = f.t / f.dur;
    if (k >= 1) { scene.remove(f.s); f.s.material.dispose(); flashes.splice(i, 1); continue; }
    f.s.scale.setScalar(f.size * (0.35 + 0.65 * (1 - Math.pow(1 - k, 3)))); f.s.material.opacity = Math.pow(1 - k, 2);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; const k = r.t / r.dur;
    if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; }
    r.m.scale.setScalar(r.R * (0.15 + 2.2 * (1 - Math.pow(1 - k, 3)))); r.m.material.opacity = 0.32 * (1 - k) * (1 - k);
  }
  for (let i = shocks.length - 1; i >= 0; i--) {
    const s = shocks[i]; s.t += dt; const k = s.t / s.dur;
    if (k >= 1) { scene.remove(s.m); s.m.material.dispose(); shocks.splice(i, 1); continue; }
    s.m.scale.setScalar(s.R * (0.08 + 0.92 * (1 - Math.pow(1 - k, 2.4)))); s.m.material.uniforms.uA.value = s.a * Math.pow(1 - k, 1.6);
  }
  for (const L of lights) {
    const u = L.userData; u.t += dt; const k = u.t / u.dur;
    L.intensity = k < 1 ? u.I * (1 - k) * (1 - k) : 0;
    if (k < 1) { if (u.blue) L.color.setRGB(lerp(0.8, 0.45, k), lerp(0.88, 0.6, k), 1); else L.color.setRGB(1, lerp(0.85, 0.42, k), lerp(0.6, 0.12, k)); }
  }
  for (let i = shakeQ.length - 1; i >= 0; i--) if (G.time >= shakeQ[i].at) { trauma = Math.min(1, trauma + shakeQ[i].m); shakeQ.splice(i, 1); }
}
function applyShake(dt) {
  if (trauma < 0.002) return;
  const s = trauma * trauma, t = G.time;
  camera.rotateX(s * 0.03 * wob(t, 23, 37, 61)); camera.rotateY(s * 0.03 * wob(t, 19, 31, 53)); camera.rotateZ(s * 0.02 * wob(t, 17, 29, 47));
  trauma = Math.max(0, trauma - dt * 0.85);
}
const flashEl = $('#flashFx');
function screenFlash(p, R, col) {
  _v.copy(p).project(camera); if (_v.z > 1 || Math.abs(_v.x) > 1.2 || Math.abs(_v.y) > 1.2) return;
  const d = camera.position.distanceTo(p), o = clamp(R / 50, 0.08, 0.55) * clamp(500 / d, 0.2, 1);
  flashEl.style.background = col || '#fff6e0';
  flashEl.style.transition = 'none'; flashEl.style.opacity = o.toFixed(2); void flashEl.offsetWidth;
  flashEl.style.transition = 'opacity ' + (0.25 + R * 0.01).toFixed(2) + 's ease-out'; flashEl.style.opacity = '0';
}

// ------------------------------------------------------------------ audio: layered synthesis. Every sound is placed left/right by where it is on screen,
// muffled and delayed with distance (≈ 340 m/s), and sent into an outdoor reverb plus a slap-back echo off the campus buildings.
let AC = null, master = null, muted = false, OUT = null, REV = null, ECHO = null, NB = null, PB = null, BB = null, SHAPE = null, SHAPE_HARD = null;
function noiseBuf(kind) {
  const len = AC.sampleRate * 3, b = AC.createBuffer(1, len, AC.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') {                                      // Paul Kellet's filter
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }   // brown
  }
  return b;
}
// outdoor impulse response: sparse early reflections off nearby walls, then a diffuse tail that darkens as it decays
function makeIR(sec) {
  const rate = AC.sampleRate, len = Math.floor(rate * sec), ir = AC.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) { const t = i / rate; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / sec, 2) * Math.exp(-t * 1.4) * 0.45; }
    for (let k = 0; k < 16; k++) { const t = 0.01 + Math.random() * 0.22, i0 = Math.floor(t * rate), a = (0.6 - t * 2) * (Math.random() < 0.5 ? -1 : 1); for (let j = 0; j < 60 && i0 + j < len; j++) d[i0 + j] += a * (1 - j / 60) * (Math.random() * 0.6 + 0.4); }
    let y = 0; for (let i = 0; i < len; i++) { const k = 0.6 - 0.5 * Math.min(1, i / len * 1.4); y += (d[i] - y) * k; d[i] = y; }
  }
  return ir;
}
function makeShaper(k) { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } const s = AC.createWaveShaper(); s.curve = c; s.oversample = '2x'; return s; }
// sound budget: a phone can't mix dozens of overlapping synth layers, and building them stalls the frame. Past a few voices at once,
// new filler sounds are simply dropped (the player's own shots and big blasts get a little extra room), and phones get thinner layers.
const SND_LITE = !!window.LITE, MAXV = SND_LITE ? 6 : 14, LQ = SND_LITE ? 0.3 : 1, MASTER_V = 0.55;
const vEnds = [];
function voice(dur, prio) {
  if (!live()) return false;
  const now = AC.currentTime;
  for (let i = vEnds.length - 1; i >= 0; i--) if (vEnds[i] <= now) vEnds.splice(i, 1);
  const cap = prio >= 2 ? MAXV + 4 : prio === 1 ? MAXV : Math.ceil(MAXV / 2);
  if (vEnds.length >= cap) return false;
  vEnds.push(now + dur); return true;
}
const nq = (n) => Math.max(1, Math.round(n * LQ));
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    try { AC = new Ctx({ latencyHint: SND_LITE ? 'balanced' : 'interactive' }); } catch (e) { AC = new Ctx(); }
    master = AC.createGain(); master.gain.value = muted ? 0 : MASTER_V;
    const comp = AC.createDynamicsCompressor(); comp.threshold.value = -22; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.3;
    const lim = AC.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.15;
    master.connect(comp); comp.connect(lim); lim.connect(AC.destination);
    OUT = AC.createGain(); OUT.connect(master);
    REV = AC.createConvolver(); REV.buffer = makeIR(SND_LITE ? 1.6 : 3.4); const rg = AC.createGain(); rg.gain.value = 0.5; REV.connect(rg); rg.connect(master);
    ECHO = AC.createDelay(2); ECHO.delayTime.value = 0.38; const ef = flt('lowpass', 1500), eg = AC.createGain(), fb = AC.createGain(); eg.gain.value = 0.3; fb.gain.value = 0.32;
    ECHO.connect(ef); ef.connect(eg); eg.connect(master); ef.connect(fb); fb.connect(ECHO);
    NB = noiseBuf('white'); PB = noiseBuf('pink'); BB = noiseBuf('brown'); SHAPE = makeShaper(2.2); SHAPE_HARD = makeShaper(6);
    loadSamples();
  } catch (e) { AC = null; }
}
const live = () => AC && !muted;
// recorded layers (Kenney CC0 packs, embedded): decoded once; any that fail to decode are simply skipped and the synthesis carries the sound
const SMP = {};
function loadSamples() {
  const src = window.KENNEY_SFX || {};
  for (const k in src) {
    try { const bin = atob(src[k]), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); AC.decodeAudioData(u.buffer, (b) => { SMP[k] = b; }, () => {}); } catch (e) {}
  }
}
const pick = (base, n) => SMP[base + '_00' + ((Math.random() * n) | 0)];
function samp(buf, out, t, rate, gain, lp) {
  if (!buf) return null;
  const s = AC.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; const g = AC.createGain(); g.gain.value = gain;
  if (lp) chain(s, flt('lowpass', lp), g, out); else chain(s, g, out);
  s.start(t); return s;
}
const distVol = (p) => p ? clamp(1.3 - camera.position.distanceTo(p) / 900, 0.12, 1) : 1;
const sndDelay = (p) => p ? Math.min(0.9, camera.position.distanceTo(p) / 340) : 0;
function flt(type, freq, Q) { const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (Q != null) f.Q.value = Q; return f; }
function gEnv(t, peak, a, d, hold) {
  const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  if (hold) g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + (hold || 0) + d); return g;
}
function chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[0]; }
function noise(buf, t, dur, rate) { const s = AC.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate || 1; s.start(t, Math.random() * 2.5); s.stop(t + dur + 0.05); return s; }
function osc(type, t, dur, f0, f1, curve) { const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + (curve || dur)); o.start(t); o.stop(t + dur + 0.05); return o; }
// where a sound comes from: returns the node to plug into and the (distance-delayed) start time
const _ap = new V3();
function place(p, loud, pan0) {
  const d = p ? camera.position.distanceTo(p) : 0, t = AC.currentTime + 0.005 + (p ? Math.min(0.9, d / 340) : 0);
  const g = AC.createGain(), lp = flt('lowpass', p ? clamp(18000 * Math.exp(-d / 300), 700, 18000) : 18000);
  g.gain.value = p ? clamp(80 / (d + 50), 0.05, 1.3) : 1;
  let tail = lp; g.connect(lp);
  if (AC.createStereoPanner) {
    let x = pan0 || 0;
    if (p) { _ap.copy(p).applyMatrix4(camera.matrixWorldInverse); x = clamp(_ap.x / (Math.abs(_ap.z) + 15), -1, 1) * 0.9; }
    const sp = AC.createStereoPanner(); sp.pan.value = x; lp.connect(sp); tail = sp;
  }
  tail.connect(OUT);
  const send = AC.createGain(); send.gain.value = clamp(0.15 + d / 800, 0.15, 0.95) * (loud ? 1 : 0.55); tail.connect(send); send.connect(REV);
  if (loud) { const es = AC.createGain(); es.gain.value = clamp(0.2 + d / 1100, 0.2, 0.65); tail.connect(es); es.connect(ECHO); }
  return { node: g, t, d };
}
// a single grain of crumbling concrete / gravel
function grain(out, t, f, q, v, dur) { const s = noise(NB, t, dur || 0.04); chain(s, flt('bandpass', f, q), gEnv(t, v, 0.002, dur || 0.04), out); }
// metal or glass ringing: a few inharmonic partials
function modal(out, t, f0, ratios, v, decay) { ratios.forEach((r, i) => { const o = osc('sine', t, decay * 1.2, f0 * r); chain(o, gEnv(t, v / (1 + i * 0.6), 0.002, decay / (1 + i * 0.4)), out); }); }

let lastBoomT = 0;
// explosions: a sharp crack, a saturated body sweeping down, a sub-bass punch, a rolling tail, then rubble raining down
function sfxBoom(R, p, opt) {
  if (!live()) return;
  if (R < 6 && AC.currentTime - lastBoomT < (SND_LITE ? 0.15 : 0.05)) return;
  if (!voice(Math.min(2, 0.5 + R * 0.05), R >= 9 ? 2 : 1)) return;
  const P = place(p, R >= 4), t = P.t, out = P.node, k = clamp(R / 14, 0.22, 1.8), far = clamp(P.d / 700, 0, 1);
  lastBoomT = AC.currentTime;
  const dur = 0.35 + R * 0.05;
  if (far < 0.9) chain(noise(NB, t, 0.03), flt('highpass', 1400), SHAPE_HARD, gEnv(t, 0.7 * k * (1 - far * 0.7), 0.001, 0.025), out);   // crack
  samp(pick('explosionCrunch', 5), out, t, clamp(1.35 - R / 20, 0.55, 1.5) * rand(0.92, 1.08), 0.72 * k);                       // recorded blast
  if (R >= 9) samp(SMP['lowFrequency_explosion_00' + (Math.random() < 0.5 ? 0 : 1)], out, t, clamp(1 - R / 45, 0.5, 0.9), 1.15 * k);
  chain(noise(PB, t, dur + 0.3), (() => { const f = flt('lowpass', 7000, 0.7); f.frequency.setValueAtTime(7000, t); f.frequency.exponentialRampToValueAtTime(140, t + dur); return f; })(), SHAPE, gEnv(t, 1.0 * k, 0.003, dur), out);
  chain(osc('sine', t, 0.9, 72, 26, 0.55), SHAPE, gEnv(t, 1.25 * k, 0.003, 0.5 + R * 0.03), out);        // sub punch
  chain(osc('triangle', t, 0.25, 140, 45, 0.12), gEnv(t, 0.5 * k, 0.002, 0.14), out);                     // chest thump
  if (R >= 4) {
    const L = 1.4 + R * 0.12;
    chain(noise(BB, t + 0.04, L), flt('lowpass', 240), gEnv(t + 0.04, 0.75 * k, 0.12, L - 0.12), out);  // rolling tail
    chain(noise(PB, t + 0.02, 0.9), flt('bandpass', 900, 0.8), gEnv(t + 0.02, 0.25 * k, 0.04, 0.8), out); // air tearing
  }
  if (R >= 4 && !(opt && opt.air)) {                                 // rubble and clods coming back down
    const n = nq(Math.min(26, Math.round(R * 2)));
    for (let i = 0; i < n; i++) { const tt = t + 0.25 + Math.pow(Math.random(), 1.4) * (1 + R * 0.08); grain(out, tt, rand(350, 2600), rand(3, 9), rand(0.05, 0.16) * k, rand(0.02, 0.06)); }
    for (let i = 0; i < Math.min(5, R / 3) * LQ; i++) { const tt = t + rand(0.4, 1.6); chain(osc('sine', tt, 0.2, rand(80, 120), 45, 0.15), gEnv(tt, 0.25 * k, 0.002, 0.16), out); }
    for (let i = 0; i < Math.min(7, R / 2) * LQ; i++) samp(pick('impactMining', 4), out, t + 0.3 + Math.pow(Math.random(), 1.3) * (1 + R * 0.06), rand(0.55, 1.1), rand(0.15, 0.3) * k);
  }
  if (opt && opt.fire) for (let i = 0; i < nq(18); i++) { const tt = t + 0.3 + Math.random() * 2.2; grain(out, tt, rand(1500, 5000), 2, rand(0.02, 0.05), 0.008); }
}
let lastClat = 0;
function sfxDebris(p, n) {
  if (!live()) return;
  if (AC.currentTime - lastClat < (SND_LITE ? 0.3 : 0.12) || !voice(0.9, 0)) return; lastClat = AC.currentTime;
  const P = place(p, false);
  const k = nq(Math.min(14, 3 + Math.round(n * 0.6)));
  chain(noise(PB, P.t, 0.5), flt('bandpass', 700, 0.9), gEnv(P.t, 0.18, 0.01, 0.45), P.node);           // the crunch of the wall giving way
  for (let i = 0; i < k; i++) { const tt = P.t + 0.08 + Math.pow(Math.random(), 1.6) * 1.6; grain(P.node, tt, rand(400, 2400), rand(3, 10), rand(0.08, 0.22), rand(0.02, 0.07)); }
  for (let i = 0; i < (SND_LITE ? 1 : 3); i++) samp(pick('impactMining', 4), P.node, P.t + rand(0, 1.2), rand(0.7, 1.2), 0.35);
}
let lastGlass = 0;
function sfxGlass(p) {
  if (!live()) return;
  if (AC.currentTime - lastGlass < (SND_LITE ? 0.4 : 0.15) || !voice(0.8, 0)) return; lastGlass = AC.currentTime;
  const P = place(p, false);
  chain(noise(NB, P.t, 0.35), flt('highpass', 3200), gEnv(P.t, 0.32, 0.002, 0.3), P.node);
  samp(pick('impactGlass_heavy', 3), P.node, P.t, rand(0.85, 1.1), 0.75); for (let i = 0; i < (SND_LITE ? 0 : 2); i++) samp(pick('impactGlass_medium', 2), P.node, P.t + rand(0.2, 0.9), rand(0.9, 1.3), 0.35);
  for (let i = 0; i < nq(16); i++) { const tt = P.t + Math.pow(Math.random(), 1.3) * 1.3; modal(P.node, tt, rand(2400, 6400), [1, 2.32, 4.25], rand(0.05, 0.12) * (1 - (tt - P.t) / 1.6), rand(0.1, 0.35)); }
}
function sfxRumble(p, dur) {
  if (!voice(Math.min(1.5, dur * 0.5), 1)) return;
  const P = place(p, true), t = P.t;
  const lfo = osc('sine', t, dur, rand(2, 4)), lg = AC.createGain(); lg.gain.value = 0.35; lfo.connect(lg);
  const amp = AC.createGain(); amp.gain.value = 0.65; lg.connect(amp.gain);
  chain(noise(BB, t, dur), flt('lowpass', 170), amp, gEnv(t, 1, 0.3, dur - 0.3), P.node);
  for (let i = 0; i < dur * 5 * LQ; i++) { const tt = t + Math.random() * dur * 0.8; chain(noise(PB, tt, 0.15), flt('bandpass', rand(200, 900), 2), gEnv(tt, 0.2, 0.005, 0.12), P.node); }
}
// a building giving up: steel groaning and concrete snapping
function sfxCreak(p, dur) {
  if (!voice(Math.min(1.5, dur * 0.5), 1)) return;
  const P = place(p, true), t = P.t;
  for (let v = 0; v < (SND_LITE ? 1 : 2); v++) {
    const o = AC.createOscillator(); o.type = 'sawtooth'; const f0 = rand(38, 62) * (v ? 1.5 : 1); o.frequency.setValueAtTime(f0, t);
    for (let k = 1; k <= 6; k++) o.frequency.linearRampToValueAtTime(f0 * rand(0.7, 1.35), t + dur * k / 6);
    o.start(t); o.stop(t + dur + 0.1);
    const bus = gEnv(t, 0.22, dur * 0.35, dur * 0.65); o.connect(bus);
    for (const [f, q] of [[320, 9], [720, 11], [1350, 13]]) chain(bus, flt('bandpass', f * rand(0.9, 1.1), q), P.node);
  }
  samp(SMP.impactPlate_heavy_000, P.node, t + dur * 0.3, 0.32, 0.55, 900); samp(SMP.impactPlate_heavy_000, P.node, t + dur * 0.75, 0.27, 0.6, 700);   // steel straining
  for (let i = 0; i < nq(10); i++) { const tt = t + Math.pow(Math.random(), 0.7) * dur; chain(noise(NB, tt, 0.03), flt('highpass', 900), SHAPE, gEnv(tt, rand(0.15, 0.4), 0.001, 0.03), P.node); grain(P.node, tt + 0.02, rand(300, 1200), 4, 0.12, 0.08); }
}
function sfxThud(p, size) {
  if (!voice(0.3, 0)) return;
  const P = place(p, size > 3), k = clamp(size / 4, 0.15, 1);
  chain(osc('sine', P.t, 0.35, 95, 34, 0.25), SHAPE, gEnv(P.t, 0.8 * k, 0.003, 0.28), P.node);
  chain(noise(BB, P.t, 0.35), flt('lowpass', 500), gEnv(P.t, 0.6 * k, 0.003, 0.3), P.node);
  for (let i = 0; i < nq(4); i++) grain(P.node, P.t + rand(0.03, 0.3), rand(300, 1500), 5, 0.08 * k, 0.04);
  samp(pick('impactMining', 4), P.node, P.t, rand(0.45, 0.62), 0.6 * k);
}
function sfxClink(p) {                                               // a steel grenade body bouncing
  if (!voice(0.2, 1)) return;
  const P = place(p, false);
  chain(noise(NB, P.t, 0.01), flt('highpass', 2500), gEnv(P.t, 0.15, 0.0005, 0.01), P.node);
  modal(P.node, P.t, rand(1300, 1800), [1, 2.43, 3.96, 5.62], 0.08, 0.22); samp(pick('impactMetal_light', 3), P.node, P.t, rand(1, 1.25), 0.55);
  chain(osc('sine', P.t, 0.1, 160, 70, 0.08), gEnv(P.t, 0.15, 0.002, 0.08), P.node);
}
function sfxWhoosh(dur, v, f0, f1, p) {
  if (!voice(dur * 0.6, 1)) return;
  const P = p ? place(p, false) : { node: OUT, t: AC.currentTime };
  for (const [m, q] of [[1, 2.2], [1.9, 4]]) {
    const f = flt('bandpass', f0 * m, q); f.frequency.setValueAtTime(f0 * m, P.t); f.frequency.exponentialRampToValueAtTime(f1 * m, P.t + dur);
    const g = AC.createGain(); g.gain.setValueAtTime(0.0001, P.t); g.gain.exponentialRampToValueAtTime(v / m, P.t + dur * 0.65); g.gain.exponentialRampToValueAtTime(0.0001, P.t + dur);
    chain(noise(PB, P.t, dur), f, g, P.node);
  }
}
let lastGun = 0, gunN = 0;
// 30 mm autocannon right beside the camera: a hard muzzle report, the bolt cycling, now and then a spent casing ringing
function sfxCannon() {
  if (!live()) return;
  const t = AC.currentTime + 0.003; if (t - lastGun < 0.03) return;
  if (!voice(0.15, 2)) return; lastGun = t; gunN++;
  const P = place(null, !SND_LITE, 0.35), out = P.node;
  chain(noise(PB, t, 0.16), flt('lowpass', 3500, 0.8), SHAPE_HARD, gEnv(t, 0.55, 0.001, 0.13), out);
  chain(osc('sine', t, 0.2, 120, 42, 0.12), SHAPE, gEnv(t, 0.7, 0.002, 0.14), out);
  if (!SND_LITE) {
    chain(noise(NB, t, 0.02), flt('highpass', 2000), gEnv(t, 0.35, 0.0005, 0.018), out);
    chain(osc('square', t + 0.045, 0.02, 2100), flt('bandpass', 2100, 6), gEnv(t + 0.045, 0.05, 0.001, 0.015), out);
  }
  if (gunN % (SND_LITE ? 6 : 3) === 0) modal(out, t + rand(0.35, 0.55), rand(3000, 4200), [1, 2.7, 5.1], 0.035, 0.18);
  samp(SMP.explosionCrunch_000, out, t, rand(1.75, 2.05), 0.32); if (!SND_LITE) samp(SMP.impactMetal_000, out, t + 0.04, 2.2, 0.06);
}
// thunder: the strike is a tearing crack; the roll arrives later and swells several times
function sfxThunder(p) {
  if (!voice(1.5, 2)) return;
  const d = camera.position.distanceTo(p), now = AC.currentTime, near = place(null, true), v = clamp(1.5 - d / 800, 0.35, 1.2);
  const crack = near.node;
  chain(noise(NB, now, 0.006), SHAPE_HARD, gEnv(now, 0.9 * v, 0.0003, 0.006), crack);
  const tear = AC.createGain(); tear.gain.value = 0;
  for (let i = 0; i < 40; i++) { const tt = now + Math.pow(i / 40, 1.5) * 0.35; tear.gain.setValueAtTime(rand(0.2, 1) * (1 - i / 40), tt); tear.gain.setValueAtTime(0, tt + 0.004); }
  chain(noise(NB, now, 0.4), flt('highpass', 700), tear, gEnv(now, 0.7 * v, 0.001, 0.38), crack);
  chain(noise(PB, now, 0.6), flt('lowpass', 2500), SHAPE, gEnv(now, 0.6 * v, 0.002, 0.5), crack);
  samp(pick('explosionCrunch', 5), crack, now, 1.45, 0.55 * v);
  const P = place(p, true), t = P.t, L = 4.5;
  for (let k = 0; k < (SND_LITE ? 2 : 5); k++) { const t0 = t + k * rand(0.25, 0.7), dur = rand(1.2, 2.6); chain(noise(BB, t0, dur), flt('lowpass', rand(150, 340)), SHAPE, gEnv(t0, rand(0.4, 0.75) * v * (1 - k * 0.12), rand(0.08, 0.3), dur), P.node); }
  chain(osc('sine', t, 1.4, 58, 24, 1.2), SHAPE, gEnv(t, 0.9 * v, 0.02, 1.3), P.node);
  samp(SMP.lowFrequency_explosion_001, P.node, t, 0.42, 1.0 * v); samp(SMP.lowFrequency_explosion_000, P.node, t + rand(0.6, 1.2), 0.35, 0.7 * v);
  chain(noise(PB, t, L), flt('bandpass', 420, 0.7), gEnv(t, 0.3 * v, 0.2, L - 0.2), P.node);
}
function sfxCrackle(p, dur) {                                        // electric fizz before a strike
  if (!voice(dur, 0)) return;
  const P = place(p, false), gate = AC.createGain(); gate.gain.value = 0;
  for (let i = 0; i < dur * 120; i++) { const tt = P.t + Math.random() * dur; gate.gain.setValueAtTime(rand(0.3, 1), tt); gate.gain.setValueAtTime(0, tt + 0.003); }
  chain(noise(NB, P.t, dur), flt('highpass', 2500), gate, gEnv(P.t, 0.5, 0.01, dur), P.node);
}
// 조준 파괴포: capacitor whine while it charges, then a magnetic slam and a supersonic crack
function sfxRailCharge() {
  if (!voice(0.8, 2)) return;
  const t = AC.currentTime + 0.01, out = place(null, false, 0.2).node;
  for (const [type, m, v] of [['sine', 1, 0.08], ['triangle', 2.01, 0.04], ['sawtooth', 0.5, 0.015]]) chain(osc(type, t, 0.7, 180 * m, 2200 * m, 0.6), gEnv(t, v, 0.4, 0.3), out);
  chain(osc('sine', t + 0.68, 0.08, 1760), gEnv(t + 0.68, 0.07, 0.003, 0.07), out); chain(osc('sine', t + 0.78, 0.12, 2349), gEnv(t + 0.78, 0.07, 0.003, 0.1), out);
}
function sfxRail() {
  if (!voice(1.2, 2)) return;
  const t = AC.currentTime + 0.003, out = place(null, true, 0.15).node;
  const car = osc('sawtooth', t, 0.3, 260, 3400, 0.09), mod = osc('sine', t, 0.3, 90, 900, 0.1), mg = AC.createGain(); mg.gain.value = 600; mod.connect(mg); mg.connect(car.frequency);
  chain(car, flt('bandpass', 1600, 1.5), gEnv(t, 0.35, 0.002, 0.22), out);
  chain(osc('sine', t, 0.9, 64, 24, 0.6), SHAPE_HARD, gEnv(t, 1.1, 0.002, 0.7), out);
  samp(SMP.laserLarge_000, out, t, 0.72, 0.55); samp(SMP.lowFrequency_explosion_000, out, t, 0.8, 0.9);
  chain(noise(NB, t, 0.01), SHAPE_HARD, gEnv(t, 0.8, 0.0003, 0.008), out);
  chain(noise(PB, t, 1.1), (() => { const f = flt('lowpass', 8000); f.frequency.setValueAtTime(8000, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.9); return f; })(), SHAPE, gEnv(t, 0.8, 0.002, 0.95), out);
  const gate = AC.createGain(); gate.gain.value = 0; for (let i = 0; i < 50; i++) { const tt = t + 0.05 + Math.random() * 0.6; gate.gain.setValueAtTime(rand(0.2, 1), tt); gate.gain.setValueAtTime(0, tt + 0.004); }
  chain(noise(NB, t, 0.7), flt('highpass', 3000), gate, gEnv(t, 0.25, 0.01, 0.6), out);
}
function sfxBeep(f, v) { if (!live()) return; const t = AC.currentTime + 0.005; chain(osc('sine', t, 0.08, f), gEnv(t, v || 0.05, 0.002, 0.06), place(null, false).node); }
function sfxChime() {
  if (!live()) return;
  const t = AC.currentTime + 0.01, out = place(null, false).node;
  [1046.5, 1318.5, 1568, 2093, 2637].forEach((fr, i) => { const tt = t + i * 0.07; modal(out, tt, fr, [1, 2, 3.01], 0.09, 0.7); });
  for (let i = 0; i < nq(24); i++) { const tt = t + Math.random() * 0.8; chain(osc('sine', tt, 0.1, rand(4000, 8000)), gEnv(tt, 0.02, 0.002, 0.08), out); }
}
// 먼작귀's voice: a tiny high-pitched formant voice ("야!", "핫!", "와아~")
const VOWEL = { a: [850, 1610, 2900], i: [300, 2300, 3000], u: [325, 700, 2530], e: [500, 1900, 2600], o: [450, 800, 2830] };
const PHRASES = {
  ya: [['i', 0.035, 760, 800], ['a', 0.17, 820, 560]], eit: [['e', 0.07, 700, 780], ['i', 0.11, 820, 600]], hap: [['a', 0.12, 720, 980]],
  waa: [['u', 0.07, 520, 640], ['a', 0.42, 760, 600]], kyu: [['i', 0.04, 900, 950], ['u', 0.2, 1000, 640]], hihi: [['i', 0.08, 900, 960], [null, 0.05], ['i', 0.09, 980, 900]],
  uuu: [['u', 0.6, 560, 600]], hup: [['u', 0.05, 640, 700], ['a', 0.1, 760, 900]], wee: [['u', 0.06, 600, 700], ['i', 0.4, 900, 1250]]
};
function sfxVoice(name, p) {
  if (!live()) return;
  const P = p ? place(p, false) : place(null, false), seq = PHRASES[name]; if (!seq) return;
  let t = P.t; const shift = 1.3;
  for (const [vw, dur, f0, f1] of seq) {
    if (!vw) { t += dur; continue; }
    const src = osc('sawtooth', t, dur + 0.04, f0, f1, dur), vib = osc('sine', t, dur + 0.04, 7), vg = AC.createGain(); vg.gain.value = f0 * 0.025; vib.connect(vg); vg.connect(src.frequency);
    const e = gEnv(t, 0.7, 0.012, dur); src.connect(e);
    VOWEL[vw].forEach((f, i) => chain(e, flt('bandpass', f * shift, 7 + i * 3), (() => { const g = AC.createGain(); g.gain.value = [1.4, 0.9, 0.45][i]; return g; })(), P.node));
    chain(noise(NB, t, dur * 0.5), flt('bandpass', 4000, 1), gEnv(t, 0.015, 0.005, dur * 0.4), P.node);
    t += dur;
  }
}
// continuous sounds that follow something moving (missile motors, meteors): keep them panned, muffled and Doppler-shifted every frame
const loops = [];
function startLoop(kind, p) {
  if (!live() || (kind !== 'meteor' && loops.length >= (SND_LITE ? 2 : 5))) return null;
  const g = AC.createGain(), lp = flt('lowpass', 8000), sp = AC.createStereoPanner ? AC.createStereoPanner() : null; g.gain.value = 0;
  g.connect(lp); const tail = sp ? (lp.connect(sp), sp) : lp; tail.connect(OUT); const send = AC.createGain(); send.gain.value = 0.35; tail.connect(send); send.connect(REV);
  const srcs = [], t = AC.currentTime;
  if (kind === 'missile') {
    const r = samp(SMP.thrusterFire_000, g, t, 1, 0.9); if (r) { r.loop = true; r.baseRate = 1; r.stop(t + 30); srcs.push(r); }
    const s = noise(PB, t, 30); chain(s, flt('bandpass', 900, 0.6), SHAPE, g); srcs.push(s);
    const s2 = noise(NB, t, 30); chain(s2, flt('highpass', 3500), (() => { const x = AC.createGain(); x.gain.value = 0.25; return x; })(), g); srcs.push(s2);
    const rough = osc('sawtooth', t, 30, 55), rg = AC.createGain(); rg.gain.value = 0.15; chain(rough, flt('lowpass', 400), rg, g); srcs.push(rough);
  } else if (kind === 'meteor') {
    const r = samp(SMP.thrusterFire_000, g, t, 0.45, 1.2); if (r) { r.loop = true; r.baseRate = 0.45; r.stop(t + 30); srcs.push(r); }
    const s = noise(BB, t, 30); chain(s, flt('lowpass', 500), SHAPE, g); srcs.push(s);
    const s2 = noise(PB, t, 30); const crk = AC.createGain(); crk.gain.value = 0.4; chain(s2, flt('bandpass', 1800, 0.8), crk, g); srcs.push(s2);
  }
  const L = { kind, g, lp, sp, srcs, p: p.clone(), prevD: camera.position.distanceTo(p), on: true };
  loops.push(L); return L;
}
function updateLoop(L, p, dt, vol) {
  if (!L || !L.on) return;
  const d = camera.position.distanceTo(p), t = AC.currentTime, vr = dt > 0 ? (L.prevD - d) / dt : 0; L.prevD = d;
  const rate = clamp(1 + vr / 340, 0.6, 1.8);                          // Doppler: higher while closing in
  for (const s of L.srcs) { if (s.playbackRate) s.playbackRate.setTargetAtTime((s.baseRate || 1) * rate, t, 0.05); else s.frequency.setTargetAtTime(55 * rate, t, 0.05); }
  L.g.gain.setTargetAtTime(vol * clamp(90 / (d + 40), 0.03, 1.4), t, 0.05);
  L.lp.frequency.setTargetAtTime(clamp(16000 * Math.exp(-d / 280), 600, 16000), t, 0.05);
  if (L.sp) { _ap.copy(p).applyMatrix4(camera.matrixWorldInverse); L.sp.pan.setTargetAtTime(clamp(_ap.x / (Math.abs(_ap.z) + 15), -1, 1) * 0.9, t, 0.05); }
}
function stopLoop(L) {
  if (!L || !L.on) return; L.on = false;
  const t = AC.currentTime; L.g.gain.cancelScheduledValues(t); L.g.gain.setTargetAtTime(0, t, 0.03);
  for (const s of L.srcs) try { s.stop(t + 0.2); } catch (e) {}
  const i = loops.indexOf(L); if (i >= 0) loops.splice(i, 1);
}
// held beams (먼작귀's eyes): a hum with harmonics, crackle and a high shimmer
const beamLoops = {};
function beamSound(name, on, p) {
  if (!AC) return;
  const B = beamLoops[name];
  if (on && !B && !muted) {
    const t = AC.currentTime, g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(name === 'mj' ? 0.12 : 0.15, t + 0.08);
    const lp = flt('lowpass', name === 'mj' ? 2600 : 1400); g.connect(lp); lp.connect(OUT); const send = AC.createGain(); send.gain.value = 0.3; lp.connect(send); send.connect(REV);
    const base = name === 'mj' ? 220 : 92, srcs = [];
    for (const [type, m, v] of [['sawtooth', 1, 0.6], ['square', 2.003, 0.3], ['sine', 4.01, 0.25]]) { const o = osc(type, t, 600, base * m); chain(o, (() => { const x = AC.createGain(); x.gain.value = v; return x; })(), g); srcs.push(o); }
    const wob = osc('sine', t, 600, name === 'mj' ? 9 : 31), wg = AC.createGain(); wg.gain.value = base * 0.04; wob.connect(wg); wg.connect(srcs[0].frequency); srcs.push(wob);
    const n = noise(NB, t, 600), gate = AC.createGain(); gate.gain.value = 0.25; chain(n, flt('bandpass', 3400, 1.2), gate, g); srcs.push(n);
    const ff = samp(SMP.forceField_000, g, t, name === 'mj' ? 1.3 : 0.7, 0.5); if (ff) { ff.loop = true; srcs.push(ff); }
    beamLoops[name] = { g, srcs, gate };
  } else if (!on && B) {
    const t = AC.currentTime; delete beamLoops[name];
    B.g.gain.cancelScheduledValues(t); B.g.gain.setValueAtTime(Math.max(0.0002, B.g.gain.value), t); B.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    for (const s of B.srcs) try { s.stop(t + 0.2); } catch (e) {}
  } else if (on && B) B.gate.gain.setTargetAtTime(rand(0.05, 0.5), AC.currentTime, 0.01);   // sputtering crackle
}
function sfxStep(p) { if (!voice(0.2, 0)) return; const P = place(p, false); samp(pick('footstep_concrete', 3), P.node, P.t, rand(0.32, 0.4), 1.1); }
function sfxPunch(p, big) { if (!voice(0.3, 1)) return; const P = place(p, true); samp(pick('impactPunch_heavy', 3), P.node, P.t, big ? 0.5 : rand(0.65, 0.8), 1.1); }
function sfxSqueak(k) { sfxVoice(k > 1.1 ? 'hap' : 'ya'); }

// ------------------------------------------------------------------ building surface damage: soot, shattered windows, glowing hot spots (per-building shader marks)
const NMARK = 16;
const DMG_DECL = 'uniform vec4 uDmg[' + NMARK + ']; uniform float uHeat[' + NMARK + ']; uniform int uDmgN; uniform float uChar; varying vec3 vLPos;\n';
const DMG_CORE = `
  float dSoot = 0.0, dBroken = 0.0, dGlow = 0.0;
  for (int i = 0; i < ${NMARK}; i++) {
    if (i >= uDmgN) break;
    vec4 dm = uDmg[i];
    float dd = distance(vLPos, dm.xyz);
    float nz = (sin(vLPos.x * 0.83 + vLPos.y * 0.31) * sin(vLPos.z * 0.71 - vLPos.y * 0.53) + sin(vLPos.x * 1.9 + vLPos.z * 1.7 + vLPos.y * 1.3) * 0.5) * 0.4;
    dSoot = max(dSoot, smoothstep(dm.w * 1.35, dm.w * 0.3, dd + nz * dm.w * 0.5));
    dBroken = max(dBroken, smoothstep(dm.w * 2.2, dm.w * 1.5, dd + nz * dm.w * 0.6));
    dGlow = max(dGlow, uHeat[i] * smoothstep(dm.w * 0.85, dm.w * 0.2, dd + nz * dm.w * 0.55));
  }`;
const DMG_EMIS = '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * dGlow * dGlow * 3.6;';
const VERT_LPOS = (vs) => 'varying vec3 vLPos;\n' + vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLPos = transformed;');
function makeDmg(char) {
  return { uDmg: { value: Array.from({ length: NMARK }, () => new THREE.Vector4(0, -1e5, 0, 0)) }, uHeat: { value: new Float32Array(NMARK) }, uDmgN: { value: 0 }, uChar: { value: char || 0 } };
}
// walls: the façade shader plus marks; the inside of the shell reads as a dark interior with a slab line at each storey;
// the interior floor slabs (uv.y = -100) are plain concrete
function patchFacade(mat, base, D) {
  mat.onBeforeCompile = (sh, r) => {
    base(sh, r); Object.assign(sh.uniforms, D);
    sh.vertexShader = VERT_LPOS(sh.vertexShader);
    sh.fragmentShader = DMG_DECL + sh.fragmentShader
      .replace('float roughnessFactor = roughness * max(fRm.g, 0.06);', `
        bool slab = vUv.y < -50.0;
        if (slab) { diffuseColor.rgb = vec3(0.32, 0.31, 0.29) * (0.75 + 0.45 * fLum.g); fRm = vec4(0.0, 0.95, 0.0, 1.0); }
        ${DMG_CORE}
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.013, 0.016), fRm.b * dBroken);
        fRm.g = mix(fRm.g, 0.85, fRm.b * dBroken);
        diffuseColor.rgb *= mix(1.0, 0.06, dSoot) * (1.0 - uChar);
        if (!gl_FrontFacing) diffuseColor.rgb = (slab ? vec3(0.2, 0.19, 0.18) : vec3(0.13, 0.12, 0.115) * (fract(vUv.y) < 0.08 ? 0.45 : 1.0)) * (1.0 - 0.6 * dSoot);
        float roughnessFactor = roughness * max(fRm.g, 0.06);`)
      .replace('#include <emissivemap_fragment>', DMG_EMIS);
  };
  mat.customProgramCacheKey = () => 'facade-v4';
  mat.side = THREE.DoubleSide; mat.needsUpdate = true;
}
function patchRoof(mat, D) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, D);
    sh.vertexShader = VERT_LPOS(sh.vertexShader);
    sh.fragmentShader = DMG_DECL + sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + DMG_CORE + '\n diffuseColor.rgb *= mix(1.0, 0.06, dSoot) * (1.0 - uChar);\n if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.17, 0.16, 0.15) * (1.0 - 0.6 * dSoot);')
      .replace('#include <emissivemap_fragment>', DMG_EMIS);
  };
  mat.customProgramCacheKey = () => 'roof-v4';
  mat.side = THREE.DoubleSide; mat.needsUpdate = true;
}
const marked = new Set();
function addMark(S, p, r, heat) {
  const D = S.D, arr = D.uDmg.value, H = D.uHeat.value, n = D.uDmgN.value;
  for (let i = 0; i < n; i++) {
    const m = arr[i], dx = m.x - p.x, dy = m.y - p.y, dz = m.z - p.z;
    if (dx * dx + dy * dy + dz * dz < m.w * m.w * 0.36) { m.w = Math.min(Math.max(m.w, r) * 1.06, 26); H[i] = Math.min(1, Math.max(H[i], heat)); marked.add(S); return; }
  }
  const i = n < NMARK ? D.uDmgN.value++ : (S.markI++ % NMARK);
  arr[i].set(p.x, p.y, p.z, r); H[i] = heat; marked.add(S);
}
function coolMarks(dt) {
  const k = Math.exp(-dt * 0.45);
  for (const S of marked) { const H = S.D.uHeat.value; let warm = false; for (let i = 0; i < NMARK; i++) if (H[i] > 0.01) { H[i] *= k; warm = true; } else H[i] = 0; if (!warm) marked.delete(S); }
}

// ------------------------------------------------------------------ buildings -> destructible cells (walls + roof + interior floor slabs)
const CS = 5, MAXE = 3.2, COLLAPSE = 0.56, FLOOR = 3.6;
// Besides the chunks it loses, every hit shakes the whole frame. Integrity = cells left − accumulated stress; below COLLAPSE it comes down.
const STRESS = 0.0065;
const integrity = (S) => S.type === 'b' ? S.alive / S.total - S.stress : S.wAlive / S.wTotal;
const structs = [];
const GRAY = lin('#9a958c'), CONCRETE = lin('#8d8a84');
let stamp = 1, aimDirty = true;
function d2(p, a, b) { const x = p[a * 3] - p[b * 3], y = p[a * 3 + 1] - p[b * 3 + 1], z = p[a * 3 + 2] - p[b * 3 + 2]; return x * x + y * y + z * z; }
function subdiv(p, u, out, depth, maxE) {
  const e0 = d2(p, 0, 1), e1 = d2(p, 1, 2), e2 = d2(p, 2, 0), m = Math.max(e0, e1, e2);
  if (m <= maxE * maxE || depth > 12) { out.push(p, u); return; }
  const a = m === e0 ? 0 : m === e1 ? 1 : 2, b = (a + 1) % 3, c = (a + 2) % 3;
  const mp = [(p[a * 3] + p[b * 3]) / 2, (p[a * 3 + 1] + p[b * 3 + 1]) / 2, (p[a * 3 + 2] + p[b * 3 + 2]) / 2], mu = [(u[a * 2] + u[b * 2]) / 2, (u[a * 2 + 1] + u[b * 2 + 1]) / 2];
  const P = (i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]], U = (i) => [u[i * 2], u[i * 2 + 1]];
  subdiv([...P(a), ...mp, ...P(c)], [...U(a), ...mu, ...U(c)], out, depth + 1, maxE);
  subdiv([...mp, ...P(b), ...P(c)], [...mu, ...U(b), ...U(c)], out, depth + 1, maxE);
}
function triArea(p) {
  const ax = p[3] - p[0], ay = p[4] - p[1], az = p[5] - p[2], bx = p[6] - p[0], by = p[7] - p[1], bz = p[8] - p[2];
  return 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
}
// clip a triangle given in xz to the cell grid; fn gets each non-empty piece as a ring of [x, z]
function clipAxis(poly, a, v, s) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], dp = s * (p[a] - v), dq = s * (q[a] - v);
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
function clipGrid(t, fn) {
  const x0 = Math.floor(Math.min(t[0], t[2], t[4]) / CS), x1 = Math.floor(Math.max(t[0], t[2], t[4]) / CS);
  const z0 = Math.floor(Math.min(t[1], t[3], t[5]) / CS), z1 = Math.floor(Math.max(t[1], t[3], t[5]) / CS);
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
    let poly = [[t[0], t[1]], [t[2], t[3]], [t[4], t[5]]];
    poly = clipAxis(poly, 0, ix * CS, 1); if (poly.length < 3) continue;
    poly = clipAxis(poly, 0, (ix + 1) * CS, -1); if (poly.length < 3) continue;
    poly = clipAxis(poly, 1, iz * CS, 1); if (poly.length < 3) continue;
    poly = clipAxis(poly, 1, (iz + 1) * CS, -1); if (poly.length >= 3) fn(poly);
  }
}
function prepBuilding(b) {
  const g = b.mesh.geometry, P = g.attributes.position.array, N = g.attributes.normal.array, Uv = g.attributes.uv.array;
  const nWv = g.groups[0].count, nt = P.length / 9;
  const src = [];
  for (let t = 0; t < nt; t++) src.push([Array.from(P.subarray(t * 9, t * 9 + 9)), Array.from(Uv.subarray(t * 6, t * 6 + 6)), [N[t * 9], N[t * 9 + 1], N[t * 9 + 2]], t * 3 < nWv ? 0 : 1, MAXE]);
  // interior floor slabs (their own mesh, kept out of the shadow pass): every up-facing roof triangle, cut along the cell grid,
  // repeated at each storey below it — so a hole in the wall opens onto floors
  for (let t = nWv / 3; t < nt; t++) {
    if (N[t * 9 + 1] < 0.55) continue;
    const top = Math.min(P[t * 9 + 1], P[t * 9 + 4], P[t * 9 + 7]);
    if (top - 1.2 <= b.ymin + FLOOR) continue;
    clipGrid([P[t * 9], P[t * 9 + 2], P[t * 9 + 3], P[t * 9 + 5], P[t * 9 + 6], P[t * 9 + 8]], (poly) => {
      for (let k = 1; k < poly.length - 1; k++) {
        const a = poly[0], c = poly[k], d = poly[k + 1];
        if (Math.abs((c[0] - a[0]) * (d[1] - a[1]) - (d[0] - a[0]) * (c[1] - a[1])) < 0.1) continue;
        for (let y = b.ymin + FLOOR; y < top - 1.2; y += FLOOR) src.push([[a[0], y, a[1], c[0], y, c[1], d[0], y, d[1]], [a[0] / 4, -100, c[0] / 4, -100, d[0] / 4, -100], [0, 1, 0], 2, Infinity]);
      }
    });
  }
  const map = new Map(), cells = [], tmp = [];
  const keyOf = (ix, iy, iz) => ((ix + 600) * 256 + iy) * 2048 + (iz + 600);
  for (const [p0, u0, nrm, mat, maxE] of src) {
    tmp.length = 0; subdiv(p0, u0, tmp, 0, maxE);
    const wall = mat === 0;
    for (let q = 0; q < tmp.length; q += 2) {
      const pp = tmp[q], cx = (pp[0] + pp[3] + pp[6]) / 3, cy = (pp[1] + pp[4] + pp[7]) / 3, cz = (pp[2] + pp[5] + pp[8]) / 3;
      const ix = Math.floor(cx / CS), iy = clamp(Math.floor((cy - b.ymin) / CS), 0, 255), iz = Math.floor(cz / CS), key = keyOf(ix, iy, iz);
      let c = map.get(key);
      if (!c) { c = { ix, iy, iz, tris: [[], [], []], cx: 0, cy: 0, cz: 0, area: 0, minY: 1e9, alive: true, nbs: [], mark: 0, cm: 0, wall: false, glass: false, edge: false }; map.set(key, c); cells.push(c); }
      const ar = triArea(pp) + 1e-4;
      c.tris[mat].push({ p: pp, u: tmp[q + 1], n: nrm });
      if (wall) c.wall = true;
      c.cx += cx * ar; c.cy += cy * ar; c.cz += cz * ar; c.area += ar; c.minY = Math.min(c.minY, pp[1], pp[4], pp[7]);
    }
  }
  let area = 0, base = 0;
  for (const c of cells) {
    c.cx /= c.area; c.cy /= c.area; c.cz /= c.area; area += c.area;
    c.ground = c.minY < b.ymin + 1.2 || (c.iy === 0 && c.wall); if (c.ground) base++;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dy && !dz) continue; const nb = map.get(keyOf(c.ix + dx, c.iy + dy, c.iz + dz)); if (nb) c.nbs.push(nb);
    }
    c.pts = Math.max(5, Math.round(c.area * 1.5));
  }
  let nW = 0, nR = 0; for (const c of cells) { nW += c.tris[0].length; nR += c.tris[1].length; }
  const tot = nW + nR, pos = new Float32Array(tot * 9), nor = new Float32Array(tot * 9), uv = new Float32Array(tot * 6);
  let o = 0;
  const put = (tr) => { pos.set(tr.p, o * 9); for (let k = 0; k < 3; k++) nor.set(tr.n, o * 9 + k * 3); uv.set(tr.u, o * 6); o++; };
  for (const c of cells) { c.w0 = o * 3; for (const tr of c.tris[0]) put(tr); c.wn = o * 3 - c.w0; }
  for (const c of cells) { c.r0 = o * 3; for (const tr of c.tris[1]) put(tr); c.rn = o * 3 - c.r0; }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  ng.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  ng.addGroup(0, nW * 3, 0); ng.addGroup(nW * 3, nR * 3, 1); ng.computeBoundingSphere(); ng.computeBoundingBox();
  g.dispose(); b.mesh.geometry = ng;
  let nS = 0; for (const c of cells) nS += c.tris[2].length;
  const sp = new Float32Array(nS * 9), sn = new Float32Array(nS * 9), su = new Float32Array(nS * 6);
  o = 0;
  for (const c of cells) { c.s0 = o * 3; for (const tr of c.tris[2]) { sp.set(tr.p, o * 9); for (let k = 0; k < 3; k++) sn.set(tr.n, o * 9 + k * 3); su.set(tr.u, o * 6); o++; } c.sn = o * 3 - c.s0; }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage)); sg.setAttribute('normal', new THREE.BufferAttribute(sn, 3)); sg.setAttribute('uv', new THREE.BufferAttribute(su, 2));
  sg.computeBoundingSphere();
  const mats = b.mesh.material, U = mats[0].userData.U, baseOBC = mats[0].onBeforeCompile;
  const slabMesh = new THREE.Mesh(sg, mats[0]); slabMesh.receiveShadow = true; slabMesh.castShadow = false; scene.add(slabMesh);
  const D = makeDmg(0), Dd = makeDmg(0.16);
  const debMats = [mats[0].clone(), mats[1].clone()];
  patchFacade(mats[0], baseOBC, D); patchRoof(mats[1], D);
  patchFacade(debMats[0], baseOBC, Dd); patchRoof(debMats[1], Dd);
  const w = b.bb[2] - b.bb[0], dd = b.bb[3] - b.bb[1], h = b.ymax - b.ymin, vol = w * dd * 0.6 * h;
  const rubCol = lin(b.cfg.w).lerp(GRAY, 0.45).multiplyScalar(0.78);       // broken material reads dustier than the painted façade
  const S = {
    type: 'b', b, mesh: b.mesh, slabMesh, cells, total: cells.length, alive: cells.length, base, baseAlive: base, area, bb: b.bb, ymin: b.ymin, ymax: b.ymax,
    cx: (b.bb[0] + b.bb[2]) / 2, cz: (b.bb[1] + b.bb[3]) / 2, name: (b.info && b.info.name) || b.osm || null, label: b.info && b.info.label,
    U, D, debMats, markI: 0, rubCol, dust: [lerp(rubCol.r, 0.6, 0.6), lerp(rubCol.g, 0.56, 0.6), lerp(rubCol.b, 0.5, 0.6)],
    vol, value: vol * 0.02, counts: true, dead: false, geoDirty: false, stress: 0, dsx: 0, dsy: 0, dsz: 0, dn: 0, edge: [], hurt: false, crumble: 0, col: null
  };
  structs.push(S);
  return S;
}
for (const b of buildings) prepBuilding(b);
// footprint → building (the footprint centroid's nearest building box)
FP.forEach((f, fi) => {
  let x = 0, z = 0; for (const p of f.p) { x += p[0]; z += p[1]; } x /= f.p.length; z /= f.p.length;
  let best = null, bd = 1e9;
  for (const S of structs) { if (S.type !== 'b') continue; const bb = S.bb; if (x < bb[0] - 2 || x > bb[2] + 2 || z < bb[1] - 2 || z > bb[3] + 2) continue; const d = Math.hypot(S.cx - x, S.cz - z); if (d < bd) { bd = d; best = S; } }
  fpStruct[fi] = best; if (best) (best.fps || (best.fps = [])).push(fi);
});

function prepGroups() {
  for (const obj of scene.children.slice()) {
    if (obj.type !== 'Group' || obj.userData.protect) continue;   // the temple hall, the bell and the Buddha are left standing
    const meshes = []; obj.traverse((m) => { if (m.isMesh) meshes.push(m); });
    if (!meshes.length) continue;
    obj.updateMatrixWorld(true);
    let info = null; for (const m of meshes) if (m.userData.info) { info = m.userData.info; break; }
    const parts = [], bb = [1e9, 1e9, -1e9, -1e9]; let ymin = 1e9, ymax = -1e9;
    for (const m of meshes) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const bs = m.geometry.boundingSphere, sc = m.getWorldScale(_v).x, c = bs.center.clone().applyMatrix4(m.matrixWorld), r = bs.radius * sc;
      const fixed = m.geometry.type === 'BoxGeometry' && r > 6 && c.y < getH(c.x, c.z) + 4;
      parts.push({ m, c, r, w: r * r, alive: true, fixed });
      bb[0] = Math.min(bb[0], c.x - r); bb[1] = Math.min(bb[1], c.z - r); bb[2] = Math.max(bb[2], c.x + r); bb[3] = Math.max(bb[3], c.z + r);
      ymin = Math.min(ymin, c.y - r); ymax = Math.max(ymax, c.y + r);
    }
    const live = parts.filter((p) => !p.fixed).length; if (!live) continue;
    const wTotal = parts.reduce((s, p) => s + (p.fixed ? 0 : p.w), 0);
    structs.push({ type: 'g', group: obj, parts, total: live, alive: live, wTotal, wAlive: wTotal, bb, ymin, ymax, cx: (bb[0] + bb[2]) / 2, cz: (bb[1] + bb[3]) / 2,
      name: info ? info.name : null, label: info ? info.label : null, counts: !!info, value: info ? (info.big ? 1500 : 300) : 6, vol: 0, dead: false });
  }
}
prepGroups();
const TOTAL = structs.filter((s) => s.counts).length;
if (TREES.dec) for (const im of [TREES.dec, TREES.pine, TREES.tr]) im.frustumCulled = false;

// ------------------------------------------------------------------ chunks (instanced flying concrete/earth) and rubble (instanced, static)
function jitterGeo(geo, amt) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), hs = (k) => { const s = Math.sin(Math.round(x * 50) * 12.9898 + Math.round(y * 50) * 78.233 + Math.round(z * 50) * 37.719 + k) * 43758.5453; return s - Math.floor(s) - 0.5; };
    p.setXYZ(i, x + hs(1) * amt, y + hs(2) * amt, z + hs(3) * amt);
  }
  geo.computeVertexNormals(); return geo;
}
const BLOCK = jitterGeo(new THREE.BoxGeometry(1, 1, 1), 0.28), ROCK = jitterGeo(new THREE.IcosahedronGeometry(0.62, 0), 0.3);
const chunkMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true });
const RUB_CAP = 12000;
function makeRubble(geo) {
  const mesh = new THREE.InstancedMesh(geo, chunkMat, RUB_CAP);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));                  // r128 sizes instanceColor from .count, so create it before count drops to 0
  mesh.count = 0; mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
  return { mesh, n: 0, lo: RUB_CAP, hi: -1, x: new Float32Array(RUB_CAP), y: new Float32Array(RUB_CAP), z: new Float32Array(RUB_CAP) };
}
const RUB = [makeRubble(BLOCK), makeRubble(ROCK)];
function addRubble(kind, x, y, z, ex, ey, ez, sx, sy, sz, r, g, b) {
  const R = RUB[kind], i = R.n % RUB_CAP; R.n++;
  _e.set(ex, ey, ez); _q.setFromEuler(_e); _v.set(x, y, z); _v2.set(sx, sy, sz); _m.compose(_v, _q, _v2);
  R.mesh.setMatrixAt(i, _m); _c.setRGB(r, g, b); R.mesh.setColorAt(i, _c);
  R.mesh.count = Math.min(RUB_CAP, R.n); R.x[i] = x; R.y[i] = y; R.z[i] = z;
  if (i < R.lo) R.lo = i; if (i > R.hi) R.hi = i;
}
// upload just the instances that changed since last frame
function flushRubble() {
  for (const R of RUB) {
    if (R.hi < R.lo) continue;
    const im = R.mesh.instanceMatrix, ic = R.mesh.instanceColor;
    im.updateRange.offset = R.lo * 16; im.updateRange.count = (R.hi - R.lo + 1) * 16; im.needsUpdate = true;
    if (ic) { ic.updateRange.offset = R.lo * 3; ic.updateRange.count = (R.hi - R.lo + 1) * 3; ic.needsUpdate = true; }
    R.lo = RUB_CAP; R.hi = -1;
  }
}
function rubbleAt(x, z, size, col, yOff, flat) {
  const k = rand(0.5, 1), kind = Math.random() < 0.6 ? 0 : 1, sy = size * (flat ? rand(0.18, 0.32) : rand(0.4, 0.75));
  addRubble(kind, x, groundY(x, z) + sy * 0.3 + (yOff || 0), z, rand(-0.4, 0.4), rand(0, 6.28), rand(-0.4, 0.4), size * rand(0.8, 1.4), sy, size * rand(0.8, 1.3), col.r * k, col.g * k, col.b * k);
}
// flying chunks: 0-2 pos, 3-5 vel, 6-8 rot, 9-11 spin, 12-14 scale, 15-17 colour, 18 age, 19 trail (0 none, 1 dust, 2 fire), 20 bounces
const CK = 21, CH_CAP = 2200;
function makeChunks(geo, kind) {
  const mesh = new THREE.InstancedMesh(geo, chunkMat, CH_CAP);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
  return { mesh, kind, n: 0, D: new Float32Array(CH_CAP * CK) };
}
const CHUNKS = [makeChunks(BLOCK, 0), makeChunks(ROCK, 1)];
function spawnChunk(rock, x, y, z, vx, vy, vz, size, col, trail) {
  const C = CHUNKS[rock ? 1 : 0]; let i = C.n; if (i >= CH_CAP) i = (Math.random() * CH_CAP) | 0; else C.n++;
  const D = C.D, o = i * CK, k = rand(0.55, 1.05);
  D[o] = x; D[o + 1] = y; D[o + 2] = z; D[o + 3] = vx; D[o + 4] = vy; D[o + 5] = vz;
  D[o + 6] = rand(0, 6.28); D[o + 7] = rand(0, 6.28); D[o + 8] = rand(0, 6.28); D[o + 9] = rand(-9, 9); D[o + 10] = rand(-9, 9); D[o + 11] = rand(-9, 9);
  if (rock) { D[o + 12] = size * rand(0.8, 1.2); D[o + 13] = size * rand(0.7, 1.1); D[o + 14] = size * rand(0.8, 1.2); }
  else { D[o + 12] = size * rand(0.7, 1.4); D[o + 13] = size * rand(0.35, 0.8); D[o + 14] = size * rand(0.6, 1.3); }
  D[o + 15] = col.r * k; D[o + 16] = col.g * k; D[o + 17] = col.b * k; D[o + 18] = 0; D[o + 19] = trail || 0; D[o + 20] = 0;
}
let lastThud = 0;
function stepChunks(dt) {
  for (const C of CHUNKS) {
    const D = C.D, mesh = C.mesh; let i = 0;
    while (i < C.n) {
      const o = i * CK; D[o + 18] += dt;
      D[o + 4] -= GRAV * 1.15 * dt; const dr = 1 - 0.08 * dt; D[o + 3] *= dr; D[o + 5] *= dr;
      D[o] += D[o + 3] * dt; D[o + 1] += D[o + 4] * dt; D[o + 2] += D[o + 5] * dt;
      D[o + 6] += D[o + 9] * dt; D[o + 7] += D[o + 10] * dt; D[o + 8] += D[o + 11] * dt;
      const tr = D[o + 19], age = D[o + 18];
      if (tr === 1 && age < 1.6 && Math.random() < 0.55) emit(SMOKE, D[o], D[o + 1], D[o + 2], 0, 0.4, 0, rand(1.2, 2.4), D[o + 12] * 0.9, D[o + 12] * 3, 0.55, 0.52, 0.48, 0.45, 1.5, -0.2, 0, 0.6);
      else if (tr === 2 && age < 3) {
        emit(FIRE, D[o], D[o + 1], D[o + 2], 0, 0, 0, rand(0.25, 0.5), D[o + 12] * 1.6, D[o + 12] * 0.6, 0, 0, 0, 0.9, 0, 0, 1, 0);
        if (Math.random() < 0.6) emit(SMOKE, D[o], D[o + 1], D[o + 2], 0, 1, 0, rand(2, 4), D[o + 12] * 1.2, D[o + 12] * 4.5, 0.16, 0.15, 0.14, 0.5, 1, -0.4, 0, 1);
      }
      const half = D[o + 13] * 0.45, sy = surfaceY(D[o], D[o + 2], D[o + 1]);
      let settle = age > 9;
      if (D[o + 1] - half < sy) {
        D[o + 1] = sy + half;
        const vy = D[o + 4];
        if (vy < -7 && D[o + 20] < 1) {
          emit(SMOKE, D[o], sy + 0.4, D[o + 2], rand(-2, 2), rand(0.5, 2), rand(-2, 2), rand(1.5, 3), D[o + 12] * 1.2, D[o + 12] * 4, 0.6, 0.56, 0.5, 0.45, 2, -0.2, 0, 0.5);
          if (D[o + 12] > 1.2 && G.time - lastThud > 0.08) { lastThud = G.time; sfxThud(_v.set(D[o], sy, D[o + 2]), D[o + 12]); }
        }
        D[o + 4] = -vy * 0.28; D[o + 3] *= 0.55; D[o + 5] *= 0.55; D[o + 9] *= 0.5; D[o + 10] *= 0.5; D[o + 11] *= 0.5; D[o + 20]++;
        if (D[o + 3] * D[o + 3] + D[o + 4] * D[o + 4] + D[o + 5] * D[o + 5] < 4 || D[o + 20] > 3) settle = true;
      }
      if (settle) {
        addRubble(C.kind, D[o], D[o + 1] - half * 0.35, D[o + 2], D[o + 6], D[o + 7], D[o + 8], D[o + 12], D[o + 13], D[o + 14], D[o + 15], D[o + 16], D[o + 17]);
        if (tr === 2 && Math.random() < 0.35) addFire(D[o], D[o + 1], D[o + 2], rand(5, 10), rand(0.8, 1.5), null);
        C.n--; if (i !== C.n) D.copyWithin(o, C.n * CK, C.n * CK + CK); continue;
      }
      _e.set(D[o + 6], D[o + 7], D[o + 8]); _q.setFromEuler(_e); _v.set(D[o], D[o + 1], D[o + 2]); _v2.set(D[o + 12], D[o + 13], D[o + 14]); _m.compose(_v, _q, _v2);
      mesh.setMatrixAt(i, _m); _c.setRGB(D[o + 15], D[o + 16], D[o + 17]); mesh.setColorAt(i, _c);
      i++;
    }
    mesh.count = C.n; mesh.instanceMatrix.updateRange.count = C.n * 16; mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) { mesh.instanceColor.updateRange.count = C.n * 3; mesh.instanceColor.needsUpdate = true; }
  }
}
function pushChunks(p, R, power) {
  for (const C of CHUNKS) {
    const D = C.D;
    for (let i = 0; i < C.n; i++) {
      const o = i * CK; if (D[o + 18] < 0.25) continue;                 // fresh chunks already carry this blast (or a simultaneous one)
      const dx = D[o] - p.x, dy = D[o + 1] - p.y, dz = D[o + 2] - p.z, dd = dx * dx + dy * dy + dz * dz; if (dd > R * R || dd < 1e-4) continue;
      const d = Math.sqrt(dd), k = (1 - d / R) * Math.min(power, 30) * 0.5 / d; D[o + 3] += dx * k; D[o + 4] += dy * k + (1 - d / R) * Math.min(power, 30) * 0.25; D[o + 5] += dz * k;
      const sp = Math.hypot(D[o + 3], D[o + 4], D[o + 5]); if (sp > 28) { const f = 28 / sp; D[o + 3] *= f; D[o + 4] *= f; D[o + 5] *= f; }
    }
  }
}

// ------------------------------------------------------------------ big debris (real wall/slab pieces cut out of the building mesh)
const debris = [], MAXDEB = 380;
function addDebris(mesh, v, spin, r, o) {
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (!mesh.parent) scene.add(mesh);
  debris.push({ mesh, v, w: new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(spin), r, t: 0, rest: false, restT: 0, keep: rand(6, 11), sink: 0, own: o.own, col: o.col, n: o.n || 1, hot: o.hot, brittle: o.brittle });
  while (debris.length > MAXDEB) { const d = debris.shift(); rubbleFor(d); scene.remove(d.mesh); if (d.own) d.mesh.geometry.dispose(); }
}
function rubbleFor(d) {
  const p = d.mesh.position, n = clamp(Math.round(d.n * 1.2), 1, 10);
  for (let k = 0; k < n; k++) rubbleAt(p.x + rand(-d.r, d.r) * 0.7, p.z + rand(-d.r, d.r) * 0.7, clamp(d.r * rand(0.35, 0.6), 0.4, 3.2), d.col, 0, Math.random() < 0.3);
}
// a big slab that lands hard breaks into blocks and a puff of dust instead of lying there like cardboard
function shatter(d, gy) {
  const p = d.mesh.position, n = clamp(Math.round(d.r * 3), 3, 14);
  for (let k = 0; k < n; k++) spawnChunk(Math.random() < 0.3, p.x + rand(-d.r, d.r) * 0.6, gy + rand(0.5, 1.5), p.z + rand(-d.r, d.r) * 0.6, d.v.x * 0.4 + rand(-6, 6), rand(2, 8), d.v.z * 0.4 + rand(-6, 6), clamp(d.r * rand(0.2, 0.45), 0.35, 2.2), d.col, 0);
  for (let k = 0; k < 8 + d.r * 2; k++) { const a = rand(0, 6.28), sp = rand(4, 10); emit(SMOKE, p.x, gy + rand(0.3, 2), p.z, Math.cos(a) * sp, rand(0.5, 3), Math.sin(a) * sp, rand(3, 6), d.r * 0.6, d.r * rand(2.5, 4), 0.6, 0.56, 0.5, 0.5, 1.6, -0.2, 0, 0.7); }
  rubbleFor(d); sfxThud(p, d.r * 1.5);
}
function stepDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i], m = d.mesh, p = m.position; d.t += dt;
    if (d.sink) {
      d.sink += dt; p.y -= dt * (0.6 + d.r * 0.3);
      if (d.sink > 2.5) { scene.remove(m); if (d.own) m.geometry.dispose(); debris.splice(i, 1); }
      continue;
    }
    if (d.rest) { d.restT += dt; if (d.restT > d.keep) { rubbleFor(d); d.sink = 1e-4; } continue; }
    d.v.y -= GRAV * dt; p.addScaledVector(d.v, dt);
    m.rotation.x += d.w.x * dt; m.rotation.y += d.w.y * dt; m.rotation.z += d.w.z * dt;
    if (d.hot && d.t < 2 && Math.random() < 0.6) emit(SMOKE, p.x, p.y, p.z, 0, 1, 0, rand(1.5, 3), d.r * 0.8, d.r * 2.4, 0.2, 0.19, 0.17, 0.45, 1, -0.5, 0, 1);
    else if (d.t < 1.2 && Math.random() < 0.3) emit(SMOKE, p.x, p.y, p.z, 0, 0, 0, rand(1, 2), d.r * 0.5, d.r * 1.8, 0.6, 0.57, 0.52, 0.35, 1.5, -0.2, 0, 0.6);
    const gy = surfaceY(p.x, p.z, p.y), lift = d.r * 0.3;
    if (p.y < gy + lift) {
      p.y = gy + lift;
      if (d.v.y < -9 && d.r > 1.3) { shatter(d, gy); scene.remove(m); if (d.own) m.geometry.dispose(); debris.splice(i, 1); continue; }
      if (d.v.y < -6) for (let k = 0; k < 3; k++) emit(SMOKE, p.x + rand(-1, 1) * d.r, gy + 0.5, p.z + rand(-1, 1) * d.r, rand(-3, 3), rand(0.5, 2), rand(-3, 3), rand(1.5, 3), d.r * 0.8, d.r * 2.6, 0.6, 0.56, 0.5, 0.5, 2, -0.3, 0, 0.5);
      d.v.y = -d.v.y * 0.24; d.v.x *= 0.52; d.v.z *= 0.52; d.w.multiplyScalar(0.45);
      if (d.v.lengthSq() < 3) d.rest = true;
    }
    if (p.y < CLIFF_Y + 40) { scene.remove(m); if (d.own) m.geometry.dispose(); debris.splice(i, 1); }
  }
}
function pushDebris(p, R, power) {
  for (const d of debris) {
    if (d.sink || d.t < 0.25) continue;
    _v.subVectors(d.mesh.position, p); const dist = _v.length(); if (dist > R || dist < 1e-3) continue;
    const k = 1 - dist / R, pw = Math.min(power, 30); _v.multiplyScalar(pw * k * 0.5 / dist); _v.y += pw * k * 0.35;
    d.v.add(_v); if (d.v.length() > 24) d.v.setLength(24); d.rest = false; d.restT = 0; d.w.addScalar(rand(-2, 2) * k);
  }
}

// ------------------------------------------------------------------ cell removal, pulverising, support, collapse
const hurt = [];
function removeCell(S, c, quiet) {
  c.alive = false; S.alive--; if (c.ground) S.baseAlive--;
  const A = S.mesh.geometry.attributes.position.array;
  for (let k = c.w0; k < c.w0 + c.wn; k++) { A[k * 3] = c.cx; A[k * 3 + 1] = c.cy; A[k * 3 + 2] = c.cz; }
  for (let k = c.r0; k < c.r0 + c.rn; k++) { A[k * 3] = c.cx; A[k * 3 + 1] = c.cy; A[k * 3 + 2] = c.cz; }
  if (c.sn) { const B = S.slabMesh.geometry.attributes.position.array; for (let k = c.s0; k < c.s0 + c.sn; k++) { B[k * 3] = c.cx; B[k * 3 + 1] = c.cy; B[k * 3 + 2] = c.cz; } S.slabDirty = true; }
  S.geoDirty = true;
  S.dsx += c.cx; S.dsy += c.cy; S.dsz += c.cz; S.dn++;
  for (const nb of c.nbs) if (nb.alive && !nb.edge) { nb.edge = true; S.edge.push(nb); }
  if (!S.hurt) { S.hurt = true; hurt.push(S); }
  if (!quiet) addScore(c.pts, S.value * c.area / S.area);
}
// mesh = cells cut out as one rigid piece; mtx places it when the building itself has moved (collapse)
function cellDebris(S, list, vx, vy, vz, spin, hot, mtx) {
  let cx = 0, cy = 0, cz = 0, A = 0, nw = 0, nr = 0;
  for (const c of list) { cx += c.cx * c.area; cy += c.cy * c.area; cz += c.cz * c.area; A += c.area; nw += c.tris[0].length + c.tris[2].length; nr += c.tris[1].length; }
  cx /= A; cy /= A; cz /= A;
  const nt = nw + nr, pos = new Float32Array(nt * 9), nor = new Float32Array(nt * 9), uv = new Float32Array(nt * 6);
  let o = 0;
  const put = (tr) => {
    for (let k = 0; k < 3; k++) { pos[o * 9 + k * 3] = tr.p[k * 3] - cx; pos[o * 9 + k * 3 + 1] = tr.p[k * 3 + 1] - cy; pos[o * 9 + k * 3 + 2] = tr.p[k * 3 + 2] - cz; nor.set(tr.n, o * 9 + k * 3); }
    uv.set(tr.u, o * 6); o++;
  };
  for (const c of list) { for (const tr of c.tris[0]) put(tr); for (const tr of c.tris[2]) put(tr); }
  for (const c of list) for (const tr of c.tris[1]) put(tr);
  // give the cut-out shell a concrete body: an inset back face plus side walls along the open edges
  const TH = 0.45, ek = (i) => Math.round(pos[i] * 20) + ',' + Math.round(pos[i + 1] * 20) + ',' + Math.round(pos[i + 2] * 20), edges = new Map();
  for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) {
    const a = t * 9 + e * 3, b = t * 9 + ((e + 1) % 3) * 3, ka = ek(a), kb = ek(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    const r = edges.get(k); if (r) r.n++; else edges.set(k, { n: 1, a, b, t });
  }
  const body = [];
  for (let t = 0; t < nt; t++) {
    const nx = nor[t * 9] * TH, ny = nor[t * 9 + 1] * TH, nz = nor[t * 9 + 2] * TH;
    for (const v of [0, 2, 1]) body.push(pos[t * 9 + v * 3] - nx, pos[t * 9 + v * 3 + 1] - ny, pos[t * 9 + v * 3 + 2] - nz, -nor[t * 9] , -nor[t * 9 + 1], -nor[t * 9 + 2]);
  }
  for (const r of edges.values()) {
    if (r.n !== 1) continue;
    const t = r.t, nx = nor[t * 9] * TH, ny = nor[t * 9 + 1] * TH, nz = nor[t * 9 + 2] * TH;
    const ax = pos[r.a], ay = pos[r.a + 1], az = pos[r.a + 2], bx = pos[r.b], by = pos[r.b + 1], bz = pos[r.b + 2];
    _v.set(bx - ax, by - ay, bz - az).cross(_v2.set(nor[t * 9], nor[t * 9 + 1], nor[t * 9 + 2])).normalize();
    for (const q of [[ax, ay, az], [bx, by, bz], [bx - nx, by - ny, bz - nz], [ax, ay, az], [bx - nx, by - ny, bz - nz], [ax - nx, ay - ny, az - nz]]) body.push(q[0], q[1], q[2], _v.x, _v.y, _v.z);
  }
  const nb = body.length / 6, P2 = new Float32Array((nt * 3 + nb) * 3), N2 = new Float32Array(P2.length), U2 = new Float32Array(P2.length / 3 * 2);
  P2.set(pos.subarray(0, nw * 9)); N2.set(nor.subarray(0, nw * 9)); U2.set(uv.subarray(0, nw * 6));
  for (let i = 0; i < nb; i++) { const q = nw * 3 + i; P2[q * 3] = body[i * 6]; P2[q * 3 + 1] = body[i * 6 + 1]; P2[q * 3 + 2] = body[i * 6 + 2]; N2[q * 3] = body[i * 6 + 3]; N2[q * 3 + 1] = body[i * 6 + 4]; N2[q * 3 + 2] = body[i * 6 + 5]; U2[q * 2] = 0; U2[q * 2 + 1] = -100; }
  const r0 = (nw * 3 + nb) * 3;
  P2.set(pos.subarray(nw * 9, nt * 9), r0); N2.set(nor.subarray(nw * 9, nt * 9), r0); U2.set(uv.subarray(nw * 6, nt * 6), (nw * 3 + nb) * 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P2, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N2, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U2, 2));
  geo.addGroup(0, nw * 3 + nb, 0); geo.addGroup(nw * 3 + nb, nr * 3, 1);
  const m = new THREE.Mesh(geo, S.debMats); m.position.set(cx, cy, cz);
  if (mtx) { m.position.applyMatrix4(mtx); m.quaternion.setFromRotationMatrix(mtx); }
  addDebris(m, new V3(vx, vy, vz), spin, clamp(Math.sqrt(A) * 0.32, 0.6, 16), { own: true, col: S.rubCol, n: list.length, hot });
}
function glassBurst(c, p, n) {
  _v.set(c.cx - p.x, 0, c.cz - p.z); const L = _v.length() || 1;
  for (let k = 0; k < n; k++) {
    const sp = rand(2, 9);
    spark(c.cx + rand(-2, 2), c.cy + rand(-1.5, 1.5), c.cz + rand(-2, 2), _v.x / L * sp + rand(-2, 2), rand(-1, 3), _v.z / L * sp + rand(-2, 2), rand(1.1, 2.4), rand(0.04, 0.08), 0.02, 1, rand(0.7, 0.9), rand(0.86, 0.95), 1, 0.3, 12);
  }
}
// cells close to a blast don't survive as pieces: they turn into blocks, dust and glass
function pulverize(S, c, dx, dy, dz, sp, laser) {
  const n = laser ? (Math.random() < 0.5 ? 1 : 0) : (c.area > 10 ? 3 : 2), col = c.wall ? S.rubCol : CONCRETE, v = Math.min(sp * 0.6, 24);
  for (let k = 0; k < n; k++) {
    const s = rand(0.35, 1.0) * (c.wall ? 1 : 1.2);
    spawnChunk(Math.random() < 0.25, c.cx + rand(-1.5, 1.5), c.cy + rand(-1.5, 1.5), c.cz + rand(-1.5, 1.5),
      dx * v * rand(0.5, 1.2) + rand(-3, 3), dy * v * rand(0.4, 0.9) + v * 0.25 + rand(0, 3), dz * v * rand(0.5, 1.2) + rand(-3, 3), s, col, v > 16 ? 1 : 0);
  }
  const d = S.dust;
  emit(SMOKE, c.cx, c.cy, c.cz, dx * sp * 0.2, dy * sp * 0.2 + rand(0.5, 2), dz * sp * 0.2, rand(3, 6), 2, rand(7, 11), d[0], d[1], d[2], 0.5, 1.3, -0.15, 0, 0.8);
  if (laser) for (let k = 0; k < 3; k++) spark(c.cx, c.cy, c.cz, rand(-6, 6), rand(2, 10), rand(-6, 6), rand(0.5, 1.2), 0.08, 0.04, 0, 1, 0.6, 0.2, 0.4, 14);
  else if (c.wall && !c.glass) { c.glass = true; glassBurst(c, _v3.set(c.cx - dx, c.cy - dy, c.cz - dz), 5); }
}
function looseCells(S) {
  const st = ++stamp, q = [];
  for (const c of S.cells) if (c.alive && c.ground) { c.mark = st; q.push(c); }
  while (q.length) { const c = q.pop(); for (const nb of c.nbs) if (nb.alive && nb.mark !== st) { nb.mark = st; q.push(nb); } }
  const out = []; for (const c of S.cells) if (c.alive && c.mark !== st) out.push(c);
  return out;
}
function components(list) {
  const st = ++stamp; for (const c of list) c.cm = st;
  const out = [];
  for (const c of list) {
    if (c.cm !== st) continue;
    const comp = [], q = [c]; c.cm = -st;
    while (q.length) { const x = q.pop(); comp.push(x); for (const nb of x.nbs) if (nb.cm === st) { nb.cm = -st; q.push(nb); } }
    out.push(comp);
  }
  return out;
}
function damageLook(S) {
  const k = clamp((1 - integrity(S)) / (1 - COLLAPSE), 0, 1);
  S.D.uChar.value = k * 0.22;
  labelHP(S);
}
function labelHP(S) {
  if (!S.label) return;
  if (!S.hpEl) { const i = document.createElement('i'); i.className = 'hp'; i.innerHTML = '<b></b>'; S.label.el.querySelector('span').appendChild(i); S.hpEl = i.firstChild; }
  const lim = S.type === 'b' ? COLLAPSE : 0.5;
  const hp = S.type === 'b' ? Math.min(clamp((integrity(S) - lim) / (1 - lim), 0, 1), clamp((S.baseAlive / Math.max(1, S.base) - 0.45) / 0.55, 0, 1)) : clamp((integrity(S) - lim) / (1 - lim), 0, 1);
  S.hpEl.style.width = (hp * 100).toFixed(0) + '%';
}
function hitBuilding(S, p, R, power, o) {
  const R2 = R * R, G2 = R * R * 4.4; let hits = 0, pieces = 0, glass = 0;
  const pk = o.laser ? 2 : 0.55;
  for (const c of S.cells) {
    if (!c.alive) continue;
    const dx = c.cx - p.x, dy = c.cy - p.y, dz = c.cz - p.z, dd = dx * dx + dy * dy + dz * dz;
    if (dd > R2) {
      // the blast wave breaks windows well beyond the hole
      if (dd < G2 && c.wall && !c.glass && !o.laser && Math.random() < 0.4) { c.glass = true; if (glass++ < 14) glassBurst(c, p, 4); }
      continue;
    }
    const d = Math.sqrt(dd), k = d / R, prob = k < 0.5 ? 1 : (1 - k) / 0.5;
    if (Math.random() > prob) continue;
    removeCell(S, c);
    const inv = 1 / Math.max(d, 0.5), sp = power * Math.sqrt(1 - k) * rand(0.45, 1.1);
    if (k < pk || pieces >= 10 || c.area < 5) pulverize(S, c, dx * inv, dy * inv, dz * inv, sp, o.laser);
    else { const v = Math.min(sp * 0.7, 20); cellDebris(S, [c], dx * inv * v, dy * inv * v * 0.6 + v * 0.3 + 2, dz * inv * v, 1 + (1 - k) * 4, sp > 12); pieces++; }
    hits++;
  }
  if (glass) sfxGlass(p);
  if (!hits) return;
  if (!o.clean) addMark(S, p, R * (o.laser ? 0.95 : 1.15), o.laser ? 1 : 0.8);
  if (hits > 2) sfxDebris(p, hits);
  S.stress += STRESS * R * power / S.total;
  if (integrity(S) < COLLAPSE || S.baseAlive < S.base * 0.45) { collapse(S); return; }
  const loose = looseCells(S);
  if (loose.length) {
    if (integrity(S) - loose.length / S.total < COLLAPSE) { collapse(S); return; }
    for (const comp of components(loose)) {
      for (const c of comp) removeCell(S, c);
      cellDebris(S, comp, rand(-1.5, 1.5), rand(-1, 0.5), rand(-1.5, 1.5), comp.length > 6 ? 0.25 : 1.2, false);
    }
    sfxRumble(p, 1.2);
  }
  damageLook(S);
  if (!o.clean && Math.random() < (o.laser ? 0.04 : 0.55)) addFire(p.x + rand(-2, 2), clamp(p.y, S.ymin + 1, S.ymax), p.z + rand(-2, 2), rand(10, 18), clamp(R * 0.18, 1.2, 4), S);
}
// broken edges keep shedding grit and the odd block while the building stands
function stepCrumble(dt) {
  for (let h = hurt.length - 1; h >= 0; h--) {
    const S = hurt[h];
    if (S.dead || !S.edge.length) { if (S.dead) hurt.splice(h, 1); continue; }
    const dmg = 1 - S.alive / S.total;
    S.crumble += dt * (0.5 + dmg * 14);
    while (S.crumble >= 1) {
      S.crumble--;
      const j = (Math.random() * S.edge.length) | 0, c = S.edge[j];
      if (!c.alive) { S.edge[j] = S.edge[S.edge.length - 1]; S.edge.pop(); if (!S.edge.length) break; continue; }
      if (c.cy < groundY(c.cx, c.cz) + 2) continue;
      _v.set(c.cx - S.cx, 0, c.cz - S.cz).normalize();
      if (Math.random() < 0.55) spawnChunk(Math.random() < 0.3, c.cx + rand(-1.5, 1.5), c.cy + rand(-1.5, 1.5), c.cz + rand(-1.5, 1.5), _v.x * rand(0.5, 2.5), rand(-1, 1), _v.z * rand(0.5, 2.5), rand(0.25, 0.6), c.wall ? S.rubCol : CONCRETE, 0);
      const d = S.dust;
      emit(SMOKE, c.cx + rand(-1.5, 1.5), c.cy, c.cz + rand(-1.5, 1.5), _v.x * 0.6, -rand(1, 3), _v.z * 0.6, rand(2.5, 4.5), 1.2, rand(4, 7), d[0], d[1], d[2], 0.4, 0.8, 0.6, 0, 0.6);
    }
  }
}

// ------------------------------------------------------------------ collapse: shudder → lean toward the damage → sink into its own dust; the base is pulverised as it comes down
const collapsing = [];
function collapse(S) {
  if (S.dead) return;
  S.dead = true; aimDirty = true;
  const alive = S.cells.filter((c) => c.alive);
  for (const c of alive) addScore(Math.round(c.pts * 0.5), S.value * c.area / S.area);
  const cx = S.cx, cz = S.cz, hgt = S.ymax - S.ymin, half = Math.max(S.bb[2] - S.bb[0], S.bb[3] - S.bb[1]) / 2;
  let dx = 0, dz = 0; if (S.dn) { dx = S.dsx / S.dn - cx; dz = S.dsz / S.dn - cz; }
  let L = Math.hypot(dx, dz); if (L < 1) { const a = rand(0, 6.283); dx = Math.cos(a); dz = Math.sin(a); L = 1; }
  dx /= L; dz /= L;
  const slender = hgt / Math.max(8, Math.min(S.bb[2] - S.bb[0], S.bb[3] - S.bb[1]) / 2);
  const lean = clamp(0.1 + slender * 0.09 + (L > 4 ? 0.1 : 0), 0.08, 0.62) * rand(0.85, 1.15);
  S.col = { t: -rand(0.6, 0.9), axis: new V3(dz, 0, -dx), lean, pivot: new V3(cx + dx * half * 0.55, S.ymin, cz + dz * half * 0.55), sink: 0, vy: 0,
    mtx: new THREE.Matrix4(), half, hgt, peel: 0, crushed: 0, total: alive.length, pileH: clamp(hgt * 0.15, 2, 8), started: false };
  S.mesh.matrixAutoUpdate = S.slabMesh.matrixAutoUpdate = false;
  collapsing.push(S);
  const cen = new V3(cx, S.ymin + hgt * 0.3, cz);
  sfxCreak(cen, 1.3); addShake(cen, 0.25);
  // first cracks: grit pours from the base
  for (let i = 0; i < 40; i++) { const a = rand(0, 6.283), r = half * rand(0.5, 1); emit(SMOKE, cx + Math.cos(a) * r, S.ymin + rand(0.5, 6), cz + Math.sin(a) * r, Math.cos(a) * rand(1, 4), rand(-1, 1), Math.sin(a) * rand(1, 4), rand(3, 6), 2, rand(8, 14), S.dust[0], S.dust[1], S.dust[2], 0.45, 1, 0.1, 0, 0.6); }
  kill(S);
}
function crushFx(S, x, gy, z, rich) {
  const d = S.dust, C = S.col;
  let ox = x - S.cx, oz = z - S.cz; const L = Math.hypot(ox, oz); if (L < 1) { const a = rand(0, 6.283); ox = Math.cos(a); oz = Math.sin(a); } else { ox /= L; oz /= L; }
  const sp = rand(7, 19);
  emit(SMOKE, x, gy + rand(0.5, 3), z, ox * sp, rand(0.5, 3.5), oz * sp, rand(8, 14), rand(4, 7), rand(18, 32), d[0] * rand(0.9, 1.05), d[1] * rand(0.9, 1.05), d[2] * rand(0.9, 1.05), 0.42, 0.55, -0.12, 0, 1);
  if (rich) {
    emit(SMOKE, x, gy + rand(1, 6), z, ox * rand(1, 4), rand(4, 10), oz * rand(1, 4), rand(9, 15), rand(5, 8), rand(22, 36), d[0] * 0.82, d[1] * 0.8, d[2] * 0.78, 0.38, 0.45, -0.25, 0, 1);
    spawnChunk(Math.random() < 0.3, x, gy + rand(1, 3), z, ox * rand(3, 10) + rand(-2, 2), rand(2, 9), oz * rand(3, 10) + rand(-2, 2), rand(0.5, 1.5), Math.random() < 0.6 ? S.rubCol : CONCRETE, Math.random() < 0.3 ? 1 : 0);
  }
  // the pile builds up as the building comes down
  const r = Math.hypot(x - S.cx, z - S.cz) / (C.half * 1.15), prof = Math.max(0, 1 - r * r);
  if (Math.random() < 0.4) rubbleAt(x + rand(-2, 2), z + rand(-2, 2), rand(0.8, 2.2), Math.random() < 0.6 ? S.rubCol : CONCRETE, C.pileH * prof * (C.crushed / C.total) * rand(0.4, 1), Math.random() < 0.35);
}
function stepCollapse(dt) {
  for (let s = collapsing.length - 1; s >= 0; s--) {
    const S = collapsing[s], C = S.col; C.t += dt;
    const cen = _v3.set(S.cx, S.ymin + C.hgt * 0.3, S.cz);
    if (C.t < 0) {                                                 // the frame shudders and sheds grit before it lets go
      const j = 0.18 * (1 + C.t * 0.3);
      C.mtx.makeTranslation(rand(-j, j), rand(-j, 0), rand(-j, j));
      if (Math.random() < 0.7) { const c = S.cells[(Math.random() * S.cells.length) | 0]; if (c.alive && c.wall) emit(SMOKE, c.cx, c.cy, c.cz, 0, -rand(1, 3), 0, rand(2, 4), 1.5, rand(5, 8), S.dust[0], S.dust[1], S.dust[2], 0.45, 0.8, 0.8, 0, 0.6); }
    } else {
      if (!C.started) {
        C.started = true; sfxRumble(cen, 6); sfxBoom(12, cen); addShake(cen, 0.9);
      }
      C.vy = Math.min(17, C.vy + 8.2 * dt); C.sink += C.vy * dt;
      const ang = C.lean * Math.min(1, Math.pow(C.t / 2.4, 2));
      const px = C.pivot.x, py = C.pivot.y, pz = C.pivot.z;
      C.mtx.makeTranslation(px, py - C.sink, pz).multiply(_m.makeRotationAxis(C.axis, ang)).multiply(_m2.makeTranslation(-px, -py, -pz));
      if (trauma < 0.25) trauma = Math.min(1, trauma + dt * 0.4 * clamp(220 / camera.position.distanceTo(cen), 0.1, 1));
    }
    S.mesh.matrix.copy(C.mtx); S.mesh.matrixWorldNeedsUpdate = true; S.slabMesh.matrix.copy(C.mtx); S.slabMesh.matrixWorldNeedsUpdate = true;
    if (C.t >= 0) {
      const e = C.mtx.elements; let budget = 30;
      for (const c of S.cells) {
        if (!c.alive) continue;
        const wx = e[0] * c.cx + e[4] * c.cy + e[8] * c.cz + e[12], wy = e[1] * c.cx + e[5] * c.cy + e[9] * c.cz + e[13], wz = e[2] * c.cx + e[6] * c.cy + e[10] * c.cz + e[14];
        const gy = groundY(wx, wz);
        if (wy < gy + 1) { removeCell(S, c, true); C.crushed++; crushFx(S, wx, gy, wz, budget-- > 0); }
      }
      // facade pieces peel away from the falling upper floors
      C.peel += dt;
      if (C.peel > 0.09 && C.t > 0.25) {
        C.peel = 0;
        for (let tries = 0; tries < 6; tries++) {
          const c = S.cells[(Math.random() * S.cells.length) | 0];
          if (!c.alive || !c.wall || c.iy < 1) continue;
          const list = [c]; for (const nb of c.nbs) if (nb.alive && nb.wall && list.length < 4 && Math.random() < 0.6) list.push(nb);
          for (const x of list) removeCell(S, x, true);
          _v.set(c.cx - S.cx, 0, c.cz - S.cz).normalize();
          cellDebris(S, list, _v.x * rand(2, 6), -C.vy * 0.8 + rand(-1, 2), _v.z * rand(2, 6), rand(0.5, 2), false, C.mtx);
          break;
        }
      }
    }
    if (S.alive <= 0 || C.t > 7) { finishCollapse(S); collapsing.splice(s, 1); }
  }
}
function finishCollapse(S) {
  const C = S.col, e = C.mtx.elements;
  for (const c of S.cells) if (c.alive) {
    const wx = e[0] * c.cx + e[4] * c.cy + e[8] * c.cz + e[12], wz = e[2] * c.cx + e[6] * c.cy + e[10] * c.cz + e[14];
    removeCell(S, c, true); C.crushed++; crushFx(S, wx, groundY(wx, wz), wz, false);
  }
  S.mesh.visible = S.slabMesh.visible = false;
  // the mound: big blocks and flat slabs heaped highest in the middle
  const half = C.half, n = clamp(Math.round((S.bb[2] - S.bb[0]) * (S.bb[3] - S.bb[1]) / 5), 80, 900);
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283), r = Math.sqrt(Math.random()) * half * 0.95, x = S.cx + Math.cos(a) * r, z = S.cz + Math.sin(a) * r;
    if (fpAt(x, z) < 0 && Math.random() < 0.6) continue;
    rubbleAt(x, z, rand(0.9, 2.6), Math.random() < 0.55 ? S.rubCol : CONCRETE, C.pileH * (1 - (r / half) * (r / half)) * rand(0.4, 1.05), Math.random() < 0.3);
  }
  // anything that had landed on the roof comes down with it
  for (const R of RUB) for (let i = 0; i < Math.min(RUB_CAP, R.n); i++) {
    if (R.x[i] < S.bb[0] || R.x[i] > S.bb[2] || R.z[i] < S.bb[1] || R.z[i] > S.bb[3]) continue;
    const gy = groundY(R.x[i], R.z[i]); if (R.y[i] < gy + C.pileH + 2) continue;
    R.mesh.getMatrixAt(i, _m); _m.elements[13] = gy + rand(0, C.pileH * 0.7); R.y[i] = _m.elements[13]; R.mesh.setMatrixAt(i, _m);
    if (i < R.lo) R.lo = i; if (i > R.hi) R.hi = i;
  }
  for (let k = 0; k < 5; k++) { const a = rand(0, 6.283), r = rand(0, half * 0.6), fx = S.cx + Math.cos(a) * r, fz = S.cz + Math.sin(a) * r; addFire(fx, groundY(fx, fz) + C.pileH * 0.5, fz, rand(25, 40), rand(2.5, 4.5), null, true); }
  scorch(S.cx, S.cz, half * 1.1, 0);
  for (let i = 0; i < 70; i++) { const a = rand(0, 6.283), r = Math.sqrt(Math.random()) * half, x = S.cx + Math.cos(a) * r, z = S.cz + Math.sin(a) * r; emit(SMOKE, x, groundY(x, z) + rand(1, 8), z, rand(-2, 2), rand(1, 5), rand(-2, 2), rand(10, 16), 8, rand(26, 40), S.dust[0] * 0.9, S.dust[1] * 0.88, S.dust[2] * 0.85, 0.4, 0.4, -0.15, 0, 1, rand(0, 1.5)); }
  sfxRumble(_v.set(S.cx, S.ymin, S.cz), 2.5);
}
function hitGroup(S, p, R, power) {
  let hits = 0;
  for (const pt of S.parts) {
    if (!pt.alive || pt.fixed) continue;
    _v.copy(pt.c).sub(p); const len = _v.length(), d = Math.max(0, len - pt.r * 0.5); if (d > R) continue;
    const k = d / R; if (Math.random() > (k < 0.6 ? 1 : (1 - k) / 0.4)) continue;
    const sp = power * Math.sqrt(1 - k) * rand(0.4, 1); if (len > 1e-3) _v.multiplyScalar(1 / len); else _v.set(0, 1, 0);
    detachPart(S, pt, _v.x * sp, _v.y * sp + sp * 0.5 + 2, _v.z * sp, 2 + 3 * (1 - k));
    for (let n = 0; n < 2; n++) spawnChunk(true, pt.c.x, pt.c.y, pt.c.z, _v.x * sp * rand(0.4, 1) + rand(-3, 3), rand(2, 8), _v.z * sp * rand(0.4, 1) + rand(-3, 3), rand(0.25, 0.6), GRAY, 0);
    hits++;
  }
  if (hits) { labelHP(S); if (!S.dead && integrity(S) < 0.5) killGroup(S); }
}
function detachPart(S, pt, vx, vy, vz, spin) {
  pt.alive = false; S.alive--; S.wAlive -= pt.w; aimDirty = true;
  scene.attach(pt.m);
  addDebris(pt.m, new V3(vx, vy, vz), spin, clamp(pt.r * 0.5, 0.3, 6), { own: false, col: GRAY, n: 1 });
  addScore(S.counts ? 40 : 15, S.value / S.total);
}
function killGroup(S) {
  S.dead = true; aimDirty = true;
  for (const pt of S.parts) if (pt.alive && !pt.fixed) detachPart(S, pt, rand(-2, 2), rand(0, 3), rand(-2, 2), 1);
  const cen = new V3(S.cx, (S.ymin + S.ymax) / 2, S.cz); sfxRumble(cen, 2.5); addShake(cen, 0.5);
  for (let i = 0; i < 40; i++) { const a = rand(0, 6.283), sp = rand(3, 10); emit(SMOKE, S.cx, S.ymin + rand(0.5, 3), S.cz, Math.cos(a) * sp, rand(0.5, 3), Math.sin(a) * sp, rand(5, 9), 3, rand(12, 20), 0.6, 0.56, 0.5, 0.5, 0.8, -0.15, 0, 1); }
  kill(S);
}

// ------------------------------------------------------------------ trees
const BURNT = new THREE.Color(0.07, 0.055, 0.045);
function hitTrees(p, R) {
  if (!TREES.tr) return;
  const R1 = R * 1.1; let dirty = false;
  for (const t of TREES.list) {
    if (t.state === 2) continue;
    const dx = t.x - p.x, dz = t.z - p.z; if (Math.abs(dx) > R1 || Math.abs(dz) > R1) continue;
    const d = Math.hypot(dx, dz); if (d > R1 || p.y - (t.y + t.h) > R || t.y - p.y > R) continue;
    const im = t.pine ? TREES.pine : TREES.dec;
    if (d < R * 0.5) {
      _m.makeScale(0, 0, 0); im.setMatrixAt(t.k, _m); TREES.tr.setMatrixAt(t.i, _m); t.state = 2;
      for (let k = 0; k < 6; k++) emit(FIRE, t.x + rand(-2, 2), t.y + rand(1, t.h), t.z + rand(-2, 2), rand(-3, 3), rand(2, 8), rand(-3, 3), rand(0.5, 1), rand(2, 4), rand(4, 6), 0, 0, 0, 0.9, 1.5, -2, 1, 0.2);
      for (let k = 0; k < 6; k++) spawnChunk(true, t.x, t.y + rand(0.5, t.h * 0.6), t.z, rand(-6, 6), rand(3, 10), rand(-6, 6), rand(0.2, 0.5), BURNT, 0);
    } else if (t.state === 0) {
      t.state = 1;
      const ang = 0.2 + 0.9 * (1 - d / R1);
      _v.set(dz, 0, -dx).normalize(); _q.setFromAxisAngle(_v, ang);
      _m.makeTranslation(t.x, t.y, t.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(_q)).multiply(new THREE.Matrix4().makeTranslation(-t.x, -t.y, -t.z));
      for (const [mesh, idx] of [[im, t.k], [TREES.tr, t.i]]) { const mm = new THREE.Matrix4(); mesh.getMatrixAt(idx, mm); mm.premultiply(_m); mesh.setMatrixAt(idx, mm); }
      im.setColorAt(t.k, BURNT);
      if (Math.random() < 0.3) addFire(t.x + dx / d * t.h * 0.3 * ang, t.y + t.h * 0.5, t.z + dz / d * t.h * 0.3 * ang, rand(4, 8), 1.3, null);
    }
    dirty = true;
  }
  if (dirty) for (const im of [TREES.dec, TREES.pine, TREES.tr]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
}

// ------------------------------------------------------------------ persistent fires (with embers)
const fires = [];
function addFire(x, y, z, dur, size, S, smoky) { fires.push({ x, y, z, t: 0, dur, size, S, smoky, fa: 0, sa: 0 }); if (fires.length > 90) fires.shift(); }
function stepFires(dt) {
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i]; f.t += dt;
    if (f.t > f.dur) { fires.splice(i, 1); continue; }
    const k = f.t / f.dur, str = k < 0.7 ? 1 : (1 - k) / 0.3;
    f.fa += dt * 12 * Math.sqrt(f.size) * str * (f.smoky ? 0.6 : 1);
    while (f.fa > 1) { f.fa--; emit(FIRE, f.x + rand(-1, 1) * f.size * 0.8, f.y + rand(0, f.size * 0.4), f.z + rand(-1, 1) * f.size * 0.8, rand(-0.6, 0.6), rand(2, 5) * Math.sqrt(f.size), rand(-0.6, 0.6), rand(0.45, 0.9), f.size * rand(0.5, 0.8), f.size * rand(0.9, 1.3), 0, 0, 0, 0.42, 1.2, -2.5, 1, 0.3); }
    f.sa += dt * 5 * str * (f.smoky ? 1.8 : 1);
    while (f.sa > 1) { f.sa--; const gc = rand(0.1, 0.17); emit(SMOKE, f.x + rand(-1, 1) * f.size * 0.5, f.y + f.size * 0.8, f.z + rand(-1, 1) * f.size * 0.5, rand(-0.5, 0.5), rand(3, 6), rand(-0.5, 0.5), rand(7, 11), f.size * 1.3, f.size * rand(5, 7), gc, gc * 0.95, gc * 0.9, 0.5, 0.25, -0.5, 4, 1, 0, 0.35); }
    if (Math.random() < dt * 3 * str) spark(f.x + rand(-1, 1) * f.size, f.y + f.size * 0.6, f.z + rand(-1, 1) * f.size, rand(-1, 1), rand(2, 6), rand(-1, 1), rand(1.5, 3.5), 0.07, 0.05, 2, 1, 0.5, 0.15, 0.6, -1.2);
  }
}

// ------------------------------------------------------------------ ground craters (heightfield + mesh) and scorch / dug-earth texture
const groundMesh = scene.getObjectByName('ground');
const GP = groundMesh.geometry.attributes.position, GN = groundMesh.geometry.attributes.normal;
let gRow0 = 1e9, gRow1 = -1;
const HFI = HF.slice();                                            // the terrain as built, to measure how deep a pit goes
const MAX_DIG = 30;
function crater(x, z, rad, depth) {
  const ext = rad * 1.5;
  const i0 = clamp(Math.floor(x - X0 - ext), 1, DW - 2), i1 = clamp(Math.ceil(x - X0 + ext), 1, DW - 2);
  const j0 = clamp(Math.floor(z - Z0 - ext), 1, DH - 2), j1 = clamp(Math.ceil(z - Z0 + ext), 1, DH - 2);
  const A = GP.array, Nn = GN.array;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot(X0 + i - x, Z0 + j - z) / rad; if (d > 1.5) continue;
    const k = j * DW + i, dh = -depth * Math.max(0, 1 - d * d) * rand(0.85, 1.1) + depth * 0.26 * Math.exp(-Math.pow((d - 1.05) / 0.2, 2));
    HF[k] = Math.max(HFI[k] - MAX_DIG, HF[k] + dh); A[k * 3 + 1] = HF[k];
  }
  for (let j = Math.max(1, j0 - 1); j <= Math.min(DH - 2, j1 + 1); j++) for (let i = Math.max(1, i0 - 1); i <= Math.min(DW - 2, i1 + 1); i++) {
    const k = j * DW + i, nx = HF[k - 1] - HF[k + 1], nz = HF[k - DW] - HF[k + DW], L = Math.hypot(nx, 2, nz);
    Nn[k * 3] = nx / L; Nn[k * 3 + 1] = 2 / L; Nn[k * 3 + 2] = nz / L;
  }
  gRow0 = Math.min(gRow0, j0 - 1); gRow1 = Math.max(gRow1, j1 + 1);
  dig(x, z, ext);
}
const SD = SCORCH.image.data, hot = [];
let scorchDirty = false, heatTick = 0;
// exposed earth, painted by how deep the ground now sits below where it started: topsoil → clay → banded sand → bedrock;
// thrown-up rims get loose dirt. The ground shader blends it over the surface texture.
const DG = new THREE.DataTexture(new Uint8Array(DW * DH * 4), DW, DH, THREE.RGBAFormat);
DG.magFilter = DG.minFilter = THREE.LinearFilter; DG.needsUpdate = true;
let digDirty = false;
(function patchGround() {
  const m = groundMesh.material, base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base(sh, r); sh.uniforms.tDig = { value: DG };
    sh.fragmentShader = 'uniform sampler2D tDig;\n' + sh.fragmentShader.replace('diffuseColor.rgb *= scH.rgb;',
      'vec4 dgT = texture2D(tDig, (vWxz - uScO.xy + 0.5) / uScO.zw); diffuseColor.rgb = mix(diffuseColor.rgb, dgT.rgb, dgT.a); diffuseColor.rgb *= mix(scH.rgb, vec3(1.0), dgT.a * 0.72);');
  };
  m.needsUpdate = true;
  // the flat overlays laid on the ground (pitch, court) would hide a pit, so they open up wherever the ground has been dug
  const uScO = { value: new THREE.Vector4(X0, Z0, DW, DH) };
  scene.traverse((o) => {
    const mt = o.isMesh && o.material;
    if (!mt || Array.isArray(mt) || !mt.polygonOffset || !mt.map || o === groundMesh) return;
    mt.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { tDig: { value: DG }, uScO });
      sh.vertexShader = 'varying vec2 vWxz;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'uniform sampler2D tDig; uniform vec4 uScO; varying vec2 vWxz;\n' + sh.fragmentShader.replace('#include <map_fragment>', 'if (texture2D(tDig, (vWxz - uScO.xy + 0.5) / uScO.zw).a > 0.22) discard;\n#include <map_fragment>');
    };
    mt.customProgramCacheKey = () => 'overlay-dig'; mt.needsUpdate = true;
  });
})();
function soil(d, i, j, out) {
  const n = (Math.sin(i * 0.37 + j * 0.21) + Math.sin(i * 0.11 - j * 0.29)) * 0.035;
  if (d < 1.2) out.setRGB(0.29, 0.21, 0.14);
  else if (d < 3.2) out.setRGB(0.5, 0.36, 0.22);
  else if (d < 7) { const band = Math.sin(d * 4.2) * 0.06 + Math.sin(d * 1.3) * 0.03; out.setRGB(0.62 + band, 0.55 + band, 0.43 + band); }
  else out.setRGB(0.42, 0.41, 0.4);
  out.r += n; out.g += n; out.b += n; return out;
}
function dig(x, z, rad) {
  const i0 = clamp(Math.floor(x - X0 - rad), 0, DW - 1), i1 = clamp(Math.ceil(x - X0 + rad), 0, DW - 1);
  const j0 = clamp(Math.floor(z - Z0 - rad), 0, DH - 1), j1 = clamp(Math.ceil(z - Z0 + rad), 0, DH - 1), Dd = DG.image.data;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * DW + i, d = HFI[k] - HF[k], o = k * 4;
    let a;
    if (d > 0.12) { soil(d, i, j, _c); a = Math.min(1, (d - 0.12) * 2.5); }
    else if (d < -0.08) { _c.setRGB(0.4, 0.31, 0.21); a = Math.min(0.7, -d * 1.4); }
    else continue;
    if (a * 255 < Dd[o + 3] && d <= 0.12) continue;                 // loose rim dirt never paints over a dug pit
    Dd[o] = clamp(_c.r, 0, 1) * 255; Dd[o + 1] = clamp(_c.g, 0, 1) * 255; Dd[o + 2] = clamp(_c.b, 0, 1) * 255; Dd[o + 3] = Math.max(Dd[o + 3], a * 255);
  }
  digDirty = true;
}
function scorch(x, z, rad, heat) {
  const i0 = clamp(Math.floor(x - X0 - rad), 0, DW - 1), i1 = clamp(Math.ceil(x - X0 + rad), 0, DW - 1);
  const j0 = clamp(Math.floor(z - Z0 - rad), 0, DH - 1), j1 = clamp(Math.ceil(z - Z0 + rad), 0, DH - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot(X0 + i - x, Z0 + j - z) / rad; if (d > 1) continue;
    // radial streaks: blast soot is thrown out in rays, not a clean disc
    const ang = Math.atan2(Z0 + j - z, X0 + i - x), ray = 0.75 + 0.25 * Math.sin(ang * 7 + x) * Math.sin(ang * 13 + z);
    const f = Math.pow(1 - d, 0.6) * rand(0.75, 1.1) * (d > 0.4 ? ray : 1), m = 1 - 0.85 * Math.min(1, f), k = (j * DW + i) * 4;
    SD[k] = Math.min(SD[k], 255 * m); SD[k + 1] = Math.min(SD[k + 1], 255 * m * 0.93); SD[k + 2] = Math.min(SD[k + 2], 255 * m * 0.88);
    if (heat) SD[k + 3] = Math.min(SD[k + 3], 255 - 255 * heat * Math.pow(1 - d, 1.5));
  }
  if (heat) hot.push({ i0, i1, j0, j1 });
  scorchDirty = true;
}
function coolDown() {
  for (let r = hot.length - 1; r >= 0; r--) {
    const H = hot[r]; let warm = false;
    for (let j = H.j0; j <= H.j1; j++) for (let i = H.i0; i <= H.i1; i++) { const k = (j * DW + i) * 4 + 3; if (SD[k] < 255) { SD[k] = Math.min(255, SD[k] + 5); warm = true; } }
    if (!warm) hot.splice(r, 1);
  }
  scorchDirty = true;
}

// ------------------------------------------------------------------ explosions and structural damage
function applyDamage(p, R, power, o) {
  o = o || {};
  // the mountain itself takes dents and scorch but scores nothing; only the tower (a structure) counts
  if (!inCampusAt(p.x, p.z)) { hitElephants(p, R); if (V.namsanHit(p.x, p.z, R) && Math.random() < 0.4) addFire(p.x, p.y, p.z, rand(4, 8), R * 0.6, null, true); }
  const Rg = o.laser ? R : R * 2.4;
  for (const S of structs) {
    if (S.dead) continue;
    const r = S.type === 'b' ? Rg : R;
    if (p.x < S.bb[0] - r || p.x > S.bb[2] + r || p.z < S.bb[1] - r || p.z > S.bb[3] + r || p.y < S.ymin - r || p.y > S.ymax + r) continue;
    if (S.type === 'b') hitBuilding(S, p, R, power, o); else hitGroup(S, p, R, power);
  }
  if (!o.laser) { pushDebris(p, R, power); pushChunks(p, R * 1.5, power); }
  hitTrees(p, o.laser ? R * 0.8 : R);
  const gy = groundY(p.x, p.z);
  if (o.crater && p.y < gy + Math.max(2, R * 0.35)) crater(p.x, p.z, o.craterR, o.craterD);
  if (!o.clean && p.y < gy + Math.max(3, R * 0.5)) scorch(p.x, p.z, o.laser ? R * 0.9 : R * 0.95, o.heat || 0);
}
const DIRT = lin('#5a4a3a');
function fxBlast(p, R, o) {
  const gy = groundY(p.x, p.z), nearG = p.y - gy < R * 0.7, big = !!o.big, lk = 0.75 + R / 36, q = o.lite ? 0.5 : 1;
  const gp = new V3(p.x, Math.max(p.y, gy) + 0.3, p.z);
  // 1. blinding core + a lingering orange glow + light that cools from white to red
  flash(p, R * (big ? 5 : 3.6), 0.1 + R * 0.006, FLASH_C);
  flash(p, R * 2.3, 0.45 + R * 0.02, GLOW_C);
  flashLight(p, R);
  // 2. the shock front: a fast, faint shell, and a dust ring racing over the ground
  if (big) shockwave(p, R * 3.6, 0.2 + R * 0.006, 0.1);
  if (nearG) ring(gp, R * 1.1, 0.45 + R * 0.015, 0xfff0d8);
  // 3. fireball: puffs shot out against heavy drag so they balloon to size, then boil upward
  const nF = Math.min(260, Math.round(R * 9 * q));
  for (let i = 0; i < nF; i++) {
    randDir(_v); if (nearG) _v.y = Math.abs(_v.y) * 0.8 + 0.15;
    const sp = R * rand(1.2, 3.4), off = rand(0, R * 0.25);
    emit(FIRE, p.x + _v.x * off, p.y + _v.y * off, p.z + _v.z * off, _v.x * sp, _v.y * sp + R * 0.4, _v.z * sp, rand(0.35, 0.95) * lk, R * rand(0.25, 0.45), R * rand(0.75, 1.15), 0, 0, 0, rand(0.35, 0.6), 4.2, -R * 0.35, 1, 0.15, rand(0, 0.05));
  }
  // 4. smoke wrapping the fireball, lit orange from inside, then cooling to soot that rises and drifts
  const nS = Math.min(200, Math.round(R * 6 * q));
  for (let i = 0; i < nS; i++) {
    randDir(_v); _v.y = Math.abs(_v.y) * 0.8 + 0.2; const off = rand(R * 0.1, R * 0.7), gc = rand(0.09, 0.2);
    emit(SMOKE, p.x + _v.x * off, p.y + _v.y * off * 0.7 + R * 0.15, p.z + _v.z * off, _v.x * rand(1, 5), rand(2, 7) * (0.6 + R / 25), _v.z * rand(1, 5), rand(4, 9) * lk, R * 0.5, R * rand(1.4, 2.2), gc, gc * 0.95, gc * 0.9, 0.72, 0.8, -rand(0.6, 1.4), 4, 1, rand(0.04, 0.25), rand(0.6, 1.1));
  }
  // 5. fragments: hot streaks that skip off whatever they hit
  const nK = Math.min(320, Math.round(R * 16 * q));
  for (let i = 0; i < nK; i++) {
    randDir(_v); if (nearG) _v.y = Math.abs(_v.y) * 0.9 + 0.05;
    const sp = rand(18, 75) * (0.55 + R / 22);
    spark(p.x, p.y, p.z, _v.x * sp, _v.y * sp, _v.z * sp, rand(0.35, 1.3), rand(0.05, 0.12) * (1 + R / 14), 0.035, 0, 1, 1, 1, 0.5, 14);
  }
  if (nearG) {
    // 6. earth: a dark dirt plume that falls back, clods, and a dust skirt racing outward
    const nD = Math.min(140, Math.round(R * 6 * q));
    for (let i = 0; i < nD; i++) {
      const a = rand(0, 6.283), s = rand(0, 0.5); _v.set(Math.cos(a) * s, 1, Math.sin(a) * s).normalize(); const sp = rand(10, 28) * (0.6 + R / 20);
      emit(SMOKE, gp.x, gp.y, gp.z, _v.x * sp, _v.y * sp, _v.z * sp, rand(1.5, 3.2), R * 0.2, R * rand(0.5, 0.9), 0.24, 0.2, 0.16, 0.75, 1.2, GRAV * 0.8, 0, 0.3);
    }
    const nC = Math.min(40, Math.round(R * 2.2));
    for (let i = 0; i < nC; i++) {
      const a = rand(0, 6.283), s = rand(0.2, 0.9), sp = rand(6, 22) * (0.5 + R / 20);
      spawnChunk(true, gp.x + rand(-1, 1), gp.y + 0.5, gp.z + rand(-1, 1), Math.cos(a) * s * sp, sp, Math.sin(a) * s * sp, rand(0.25, 0.8) * (0.6 + R / 25), DIRT, R >= 8 ? 1 : 0);
    }
    const nR = Math.min(150, Math.round(R * 6 * q));
    for (let i = 0; i < nR; i++) {
      const a = rand(0, 6.283), sp = rand(10, 30) * (0.5 + R / 22), ca = Math.cos(a), sa = Math.sin(a);
      emit(SMOKE, gp.x + ca * R * 0.3, gp.y + rand(0.3, 1.5), gp.z + sa * R * 0.3, ca * sp, rand(0.3, 2), sa * sp, rand(3, 6) * lk, R * 0.3, R * rand(0.9, 1.4), 0.62, 0.57, 0.5, 0.5, 2.0, -0.25, 0, 0.6);
    }
  }
  // 7. embers drifting away afterwards
  const nE = Math.min(80, Math.round(R * 3 * q));
  for (let i = 0; i < nE; i++) { randDir(_v); spark(p.x + _v.x * R * 0.3, p.y + _v.y * R * 0.3, p.z + _v.z * R * 0.3, _v.x * rand(2, 9), Math.abs(_v.y) * rand(2, 8) + 2, _v.z * rand(2, 9), rand(1.5, 4), rand(0.06, 0.1), 0.05, 2, 1, 0.5, 0.15, 1, -1.5); }
  if (big) mushroom(gp, R);
  if (R >= 4) shockPush(p, R);
  if (R >= 9) screenFlash(p, R);
  addShake(p, R * (big ? 0.075 : 0.045));
  sfxBoom(R, p, { air: !nearG, fire: (o.heat || 0) > 0.5 });
}
// rising stem of fire-lit smoke with a rolling cap
function mushroom(gp, R) {
  for (let i = 0; i < 110; i++) {
    const dl = rand(0, 1.8), a = rand(0, 6.283), r = rand(0, R * 0.25);
    emit(SMOKE, gp.x + Math.cos(a) * r, gp.y + rand(0, R * 0.3), gp.z + Math.sin(a) * r, rand(-1.5, 1.5), rand(20, 32) * (0.5 + R / 48), rand(-1.5, 1.5), rand(6, 10), R * 0.35, R * rand(0.9, 1.3), 0.17, 0.15, 0.13, 0.75, 0.85, -0.6, 4, 0.5, dl, rand(0.6, 1));
  }
  for (let i = 0; i < 60; i++) emit(FIRE, gp.x + rand(-1, 1) * R * 0.2, gp.y + rand(0, R * 0.5), gp.z + rand(-1, 1) * R * 0.2, rand(-2, 2), rand(14, 28), rand(-2, 2), rand(0.8, 1.5), R * 0.35, R * 0.7, 0, 0, 0, 1, 0.9, -3, 1, 0.2, rand(0, 0.6));
  const capY = gp.y + R * 1.5;
  for (let i = 0; i < 70; i++) {
    const a = rand(0, 6.283), sp = rand(5, 12) * (0.5 + R / 48);
    emit(SMOKE, gp.x + Math.cos(a) * R * 0.3, capY + rand(-R * 0.2, R * 0.3), gp.z + Math.sin(a) * R * 0.3, Math.cos(a) * sp, rand(-1, 3), Math.sin(a) * sp, rand(8, 13), R * 0.5, R * rand(1.4, 1.9), 0.2, 0.18, 0.16, 0.7, 0.6, -0.35, 4, 0.7, rand(0.9, 1.6), rand(0.4, 0.8));
  }
}
function fxLaser(p) {
  for (let i = 0; i < 9; i++) { randDir(_v); _v.y = Math.abs(_v.y) + 0.3; const sp = rand(10, 34); spark(p.x, p.y + 0.3, p.z, _v.x * sp, _v.y * sp, _v.z * sp, rand(0.4, 1.1), rand(0.05, 0.1), 0.04, 0, 1, 1, 1, 0.4, 14); }
  for (let i = 0; i < 3; i++) emit(FIRE, p.x + rand(-1, 1), p.y + rand(0, 1), p.z + rand(-1, 1), rand(-2, 2), rand(3, 8), rand(-2, 2), rand(0.3, 0.6), rand(2, 3), rand(3.5, 5), 0, 0, 0, 0.9, 1.5, -2, 1, 0.2);
  if (Math.random() < 0.6) emit(SMOKE, p.x, p.y + 1, p.z, rand(-1, 1), rand(4, 8), rand(-1, 1), rand(3, 6), 2.5, rand(9, 14), 0.2, 0.19, 0.18, 0.5, 0.6, -0.8, 4, 1, 0, 0.9);
}
let lastBlast = -99;
function explode(p, o) {
  const R = o.R; lastBlast = G.time;
  if (o.laser) fxLaser(p); else fxBlast(p, R, o);
  applyDamage(p, R, o.power, o);
}

// ------------------------------------------------------------------ aiming: buildings by a voxel walk over their cells (the stock raycaster tests
// every triangle of every mesh the ray passes near — ~5 ms per ray here), landmark parts by the raycaster, the ground by a heightfield march
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const vkey = (ix, iy, iz) => ((ix + 600) * 256 + iy) * 2048 + (iz + 600);
function buildRayIndex(S) {
  let n = 0; for (const c of S.cells) n += c.tris[0].length + c.tris[1].length + c.tris[2].length;
  const Tr = new Float32Array(n * 9), own = new Array(n), vox = new Map(); let i = 0;
  for (const c of S.cells) for (const m of [0, 1, 2]) for (const tr of c.tris[m]) {
    const p = tr.p; Tr.set(p, i * 9); own[i] = c;
    const x0 = Math.floor(Math.min(p[0], p[3], p[6]) / CS), x1 = Math.floor(Math.max(p[0], p[3], p[6]) / CS);
    const y0 = Math.max(0, Math.floor((Math.min(p[1], p[4], p[7]) - S.ymin) / CS)), y1 = Math.max(0, Math.floor((Math.max(p[1], p[4], p[7]) - S.ymin) / CS));
    const z0 = Math.floor(Math.min(p[2], p[5], p[8]) / CS), z1 = Math.floor(Math.max(p[2], p[5], p[8]) / CS);
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) { const k = vkey(ix, iy, iz); let l = vox.get(k); if (!l) vox.set(k, l = []); l.push(i); }
    i++;
  }
  S.rt = Tr; S.rown = own; S.vox = vox;
}
for (const S of structs) if (S.type === 'b') buildRayIndex(S);
let rayTri = -1;
function triHit(Tr, i, ox, oy, oz, dx, dy, dz) {                    // Möller–Trumbore, both faces
  const o = i * 9, ax = Tr[o], ay = Tr[o + 1], az = Tr[o + 2];
  const e1x = Tr[o + 3] - ax, e1y = Tr[o + 4] - ay, e1z = Tr[o + 5] - az, e2x = Tr[o + 6] - ax, e2y = Tr[o + 7] - ay, e2z = Tr[o + 8] - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
  if (det > -1e-9 && det < 1e-9) return -1;
  const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az, u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) return -1;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}
function rayStruct(S, o, d, tMax) {
  let t0 = 0, t1 = tMax;
  const lo = [S.bb[0], S.ymin - 0.5, S.bb[1]], hi = [S.bb[2], S.ymax + 0.5, S.bb[3]], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < 1e-12) { if (oo[a] < lo[a] || oo[a] > hi[a]) return Infinity; continue; }
    let ta = (lo[a] - oo[a]) / dd[a], tb = (hi[a] - oo[a]) / dd[a]; if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return Infinity;
  }
  const Tr = S.rt, own = S.rown, vox = S.vox;
  let t = t0 + 1e-4;
  let ix = Math.floor((o.x + d.x * t) / CS), iy = Math.floor((o.y + d.y * t - S.ymin) / CS), iz = Math.floor((o.z + d.z * t) / CS);
  const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
  const tdx = Math.abs(CS / d.x), tdy = Math.abs(CS / d.y), tdz = Math.abs(CS / d.z);
  let tnx = d.x !== 0 ? ((ix + (sx > 0 ? 1 : 0)) * CS - o.x) / d.x : Infinity, tny = d.y !== 0 ? ((iy + (sy > 0 ? 1 : 0)) * CS + S.ymin - o.y) / d.y : Infinity, tnz = d.z !== 0 ? ((iz + (sz > 0 ? 1 : 0)) * CS - o.z) / d.z : Infinity;
  let best = Infinity, bi = -1;
  for (let it = 0; it < 600 && t <= t1 + 1e-3; it++) {
    const tEnd = Math.min(tnx, tny, tnz);
    if (iy >= 0) {
      const l = vox.get(vkey(ix, iy, iz));
      if (l) for (let k = 0; k < l.length; k++) { const i = l[k]; if (!own[i].alive) continue; const th = triHit(Tr, i, o.x, o.y, o.z, d.x, d.y, d.z); if (th > 1e-4 && th < best) { best = th; bi = i; } }
    }
    if (best <= tEnd + 1e-3) break;
    if (tnx <= tny && tnx <= tnz) { t = tnx; tnx += tdx; ix += sx; } else if (tny <= tnz) { t = tny; tny += tdy; iy += sy; } else { t = tnz; tnz += tdz; iz += sz; }
  }
  if (best <= tMax) { rayTri = bi; return best; }
  return Infinity;
}
// nearest structure hit along o + d·t (t ≤ maxD): { d, p, n }
const _rayHit = { d: 0, p: new V3(), n: new V3(), S: null };
function rayStructs(o, d, maxD) {
  let best = maxD, hit = null, tri = -1;
  for (const S of structs) {
    if (S.type !== 'b' || S.dead) continue;
    const t = rayStruct(S, o, d, best); if (t < best) { best = t; hit = S; tri = rayTri; }
  }
  if (aimDirty) rebuildAim();
  ray.set(o, d); ray.far = best;
  const h = aimObjs.length ? ray.intersectObjects(aimObjs, false)[0] : null; ray.far = Infinity;
  if (h) { _rayHit.d = h.distance; _rayHit.p.copy(h.point); _rayHit.n.copy(h.face ? h.face.normal : UP).transformDirection(h.object.matrixWorld); _rayHit.S = null; }
  else if (hit) {
    const Tr = hit.rt, k = tri * 9;
    _rayHit.d = best; _rayHit.p.copy(o).addScaledVector(d, best); _rayHit.S = hit;
    _rayHit.n.set(Tr[k + 3] - Tr[k], Tr[k + 4] - Tr[k + 1], Tr[k + 5] - Tr[k + 2]).cross(_v.set(Tr[k + 6] - Tr[k], Tr[k + 7] - Tr[k + 1], Tr[k + 8] - Tr[k + 2])).normalize();
  } else return null;
  if (_rayHit.n.dot(d) > 0) _rayHit.n.negate();
  return _rayHit;
}
let aimObjs = [];
function rebuildAim() {
  aimObjs = [];
  for (const S of structs) if (S.type === 'g') for (const pt of S.parts) if (pt.fixed || (pt.alive && !S.dead)) aimObjs.push(pt.m);
  aimDirty = false;
}
function marchGround(o, d, maxD) {
  let t = 0, above = o.y - groundY(o.x, o.z), it = 0;
  if (above < 0) return null;
  const lim = Math.min(maxD, 5000);
  while (t < lim && it++ < 900) {
    const prev = t; t += Math.max(0.8, above * 0.5);
    above = o.y + d.y * t - groundY(o.x + d.x * t, o.z + d.z * t);
    if (above < 0) {
      let a = prev, b = t;
      for (let k = 0; k < 10; k++) { const m = (a + b) / 2; if (o.y + d.y * m - groundY(o.x + d.x * m, o.z + d.z * m) > 0) a = m; else b = m; }
      return { d: b, p: new V3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b) };
    }
  }
  return null;
}
const _ro = new V3(), _rd = new V3();
function castRay(o, d) {
  const h = rayStructs(o, d, 1e5);
  const g = marchGround(o, d, h ? h.d : Infinity);
  const near = g && (!h || g.d < h.d) ? g : h, e = rayEle(o, d, near ? near.d : 6000);
  if (e) return e;
  if (g && (!h || g.d < h.d)) return g.p;
  return h ? h.p.clone() : null;
}
function aimAt(x, y) { ndc.set(x / innerWidth * 2 - 1, -y / innerHeight * 2 + 1); ray.setFromCamera(ndc, camera); return castRay(_ro.copy(ray.ray.origin), _rd.copy(ray.ray.direction)); }
function aimFromRay(origin, dir) { return castRay(_ro.copy(origin), _rd.copy(dir).normalize()); }
function surfaceAt(x, z) { return castRay(_ro.set(x, 3000, z), _rd.set(0, -1, 0)) || new V3(x, groundY(x, z), z); }
// short segment test against structures, with the surface normal (for bouncing)
function hitStructs(origin, dir, maxD) {
  const h = rayStructs(_ro.copy(origin), _rd.copy(dir), maxD);
  return h ? { p: h.p.clone(), n: h.n.clone(), d: h.d } : null;
}

// ------------------------------------------------------------------ weapons
const WEAPONS = [
  { id: "cannon", name: "기관포", mode: "auto", gauge: true, tip: "누르고 있으면 연사, 끌면서 쓸어 버리세요. 오래 쏘면 과열됩니다", touchTip: "누른 채로 끌면 연사로 쓸어 버립니다. 오래 쏘면 과열됩니다" },
  { id: "missile", name: "미사일", mode: "semi", cd: 0.55, tip: "솟구쳤다가 조준점에 내리꽂힙니다. 누르고 있으면 계속 발사" },
  { id: "bolt", name: "낙뢰", mode: "semi", cd: 0.8, tip: "조준한 자리에 번개가 정확히 떨어집니다. 높은 건물 꼭대기를 노리세요" },
  { id: "rail", name: "레일건", mode: "semi", cd: 2.0, tip: "건물을 꿰뚫고 뒤에 있는 것까지 관통합니다. 건물이 일렬로 선 곳을 노리세요" },
  { id: "meteor", name: "운석", mode: "semi", gauge: true, tip: "건물을 부술수록 충전되는 필살기. 가득 차면 한 방" }
];
const glowMat = (hex) => new THREE.SpriteMaterial({ map: GLOW, color: hex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const addMat = (hex, o) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: o == null ? 1 : o, blending: THREE.AdditiveBlending, depthWrite: false });
function texCanvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; }
// a soft flame cone texture: white-hot root fading through yellow to transparent
const FLAME_TEX = texCanvas(64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,240,170,.95)'); gr.addColorStop(0.5, 'rgba(255,150,50,.6)'); gr.addColorStop(1, 'rgba(255,60,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const m = g.createLinearGradient(0, 0, w, 0); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.5, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = m; g.fillRect(0, 0, w, h);
});
FLAME_TEX.encoding = THREE.LinearEncoding;

// missile: an ogive-nosed body with a red band and seeker window, mid-body wings, tail fins, a nozzle and a flame with shock diamonds
const mBody = new THREE.MeshStandardMaterial({ color: 0xeef0f2, metalness: 0.35, roughness: 0.38 }), mRed = new THREE.MeshStandardMaterial({ color: 0xc8261a, roughness: 0.5 });
const mDark = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.55, metalness: 0.4 }), mSeek = new THREE.MeshStandardMaterial({ color: 0x182028, roughness: 0.08, metalness: 0.8 });
const mOlive = new THREE.MeshStandardMaterial({ color: 0x4b5a35, roughness: 0.7, metalness: 0.2 }), mSteel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.85 });
const MISSILE = new THREE.Group();
{
  const prof = [[0, 2.35], [0.06, 2.25], [0.14, 2.0], [0.21, 1.7], [0.26, 1.35], [0.28, 1.0], [0.28, -1.15], [0.25, -1.3], [0.19, -1.36], [0, -1.36]].map(([r, y]) => new THREE.Vector2(r, y));
  MISSILE.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 24), mBody));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.284, 0.284, 0.16, 24, 1, true), mRed); band.position.y = 0.85; MISSILE.add(band);
  const seek = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), mSeek); seek.position.y = 2.28; MISSILE.add(seek);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.75, 0.32), mDark); wing.position.set(Math.cos(a) * 0.42, 0.15, Math.sin(a) * 0.42); wing.rotation.y = -a; MISSILE.add(wing);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.55, 0.5), mDark); fin.position.set(Math.cos(a) * 0.5, -1.0, Math.sin(a) * 0.5); fin.rotation.y = -a; fin.rotation.z = 0.0; MISSILE.add(fin);
  }
  const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.22, 16, 1, true), mDark); noz.position.y = -1.45; MISSILE.add(noz);
  const fx = new THREE.Group(); fx.name = 'flame'; fx.visible = false; MISSILE.add(fx);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 2.4, 14, 1, true), new THREE.MeshBasicMaterial({ map: FLAME_TEX, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  cone.rotation.x = Math.PI; cone.position.y = -2.7; fx.add(cone);
  for (let i = 0; i < 3; i++) { const d = new THREE.Sprite(glowMat(0xfff0c0)); d.scale.setScalar(0.5 - i * 0.1); d.position.y = -1.8 - i * 0.5; fx.add(d); }
  const glow = new THREE.Sprite(glowMat(0xffa040)); glow.scale.setScalar(3.2); glow.position.y = -1.9; fx.add(glow);
  MISSILE.traverse((m) => { if (m.isMesh && m.material !== cone.material) m.castShadow = true; });
  MISSILE.scale.setScalar(1.5);
}
// grenade: a ribbed "pineapple" body, fuse head, safety lever (flies off when thrown) and pull ring
const PINE_TEX = texCanvas(128, 128, (g, w, h) => {
  g.fillStyle = '#56653d'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2f3a20'; g.lineWidth = 5;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke(); }
  for (let j = 1; j < 6; j++) { g.beginPath(); g.moveTo(0, j * h / 6); g.lineTo(w, j * h / 6); g.stroke(); }
  for (let i = 0; i < 200; i++) { g.fillStyle = 'rgba(255,255,255,' + Math.random() * 0.06 + ')'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
});
const GRENADE = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), new THREE.MeshStandardMaterial({ map: PINE_TEX, roughness: 0.75, metalness: 0.25 })); body.scale.y = 1.25; GRENADE.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.2, 12), mSteel); neck.position.y = 0.47; GRENADE.add(neck);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.1, 12), mDark); cap.position.y = 0.6; GRENADE.add(cap);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.04), mSteel); lever.position.set(0.2, 0.28, 0); lever.rotation.z = -0.32; lever.name = 'lever'; GRENADE.add(lever);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 16), mSteel); ring.position.set(-0.17, 0.52, 0); ring.rotation.y = Math.PI / 2; ring.name = 'ring'; GRENADE.add(ring);
  const blink = new THREE.Sprite(glowMat(0xff3a22)); blink.scale.setScalar(1.3); blink.position.y = 0.62; blink.name = 'blink'; GRENADE.add(blink);
  GRENADE.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  GRENADE.scale.setScalar(1.4);
}
// meteor: dark scorched rock split by glowing lava veins, wrapped in a plasma sheath
const rockGeo = new THREE.IcosahedronGeometry(1, 3);
{ const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = Math.sin(x * 3.1 + y * 1.7) * 0.08 + Math.sin(y * 4.3 - z * 2.9) * 0.06 + Math.sin(z * 5.7 + x * 3.3) * 0.05, hs = Math.sin(x * 12.9 + y * 78.2 + z * 37.7) * 43758.5, k = 0.86 + n + (hs - Math.floor(hs)) * 0.12; p.setXYZ(i, x * k, y * k, z * k); } rockGeo.computeVertexNormals(); }
const LAVA_TEX = texCanvas(256, 128, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    let x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 8; s++) { x += rand(-22, 22); y += rand(-14, 14); g.lineTo(x, y); }
    g.strokeStyle = 'rgba(255,' + (90 + Math.random() * 120 | 0) + ',20,1)'; g.lineWidth = rand(1.5, 4.5); g.shadowColor = '#ff6a10'; g.shadowBlur = 8; g.stroke();
  }
});
const ROCK_TEX = texCanvas(256, 128, (g, w, h) => { g.fillStyle = '#2b2420'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { const v = 25 + Math.random() * 40 | 0; g.fillStyle = 'rgb(' + (v + 8) + ',' + v + ',' + (v - 4) + ')'; g.fillRect(Math.random() * w, Math.random() * h, rand(1, 4), rand(1, 4)); } });
const rockMat = new THREE.MeshStandardMaterial({ map: ROCK_TEX, roughness: 0.95, emissive: 0xffffff, emissiveMap: LAVA_TEX, emissiveIntensity: 1.6, flatShading: true });
const sheathMat = new THREE.MeshBasicMaterial({ map: FLAME_TEX, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0xffb070 });
const warnGeo = new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2);
const meteorLight = new THREE.PointLight(0xff8a3a, 0, 200, 2); scene.add(meteorLight);

// guns sit just off-screen, bottom corners of the view
const camF = new V3(), camR = new V3(), camU = new V3();
function camBasis() { camera.getWorldDirection(camF); camR.crossVectors(camF, UP).normalize(); camU.crossVectors(camR, camF).normalize(); }
function gunOrigin(side) { camBasis(); return camera.position.clone().addScaledVector(camF, 3).addScaledVector(camR, side * 3.5).addScaledVector(camU, -2.6); }

const projs = [], pending = [];
function launchMissile(target) {
  G.mside = -(G.mside || 1);
  const o = gunOrigin(G.mside * 1.8);
  const vel = new V3().addScaledVector(camU, 9).addScaledVector(UP, 8).addScaledVector(camF, 10).addScaledVector(camR, G.mside * 4);
  const mesh = MISSILE.clone(); mesh.position.copy(o); scene.add(mesh);
  projs.push({ k: 'missile', mesh, pos: o, vel, target: target.clone(), t: 0, acc: 0, lit: false, R: 10, power: 44, ele: target.ele || null, eoff: target.ele ? target.clone().sub(target.ele.g.position) : null });
  sfxWhoosh(0.3, 0.12, 400, 1100); if (live()) chain(osc('sine', AC.currentTime, 0.12, 160, 60, 0.1), gEnv(AC.currentTime, 0.3, 0.002, 0.1), OUT);   // ejection thunk
}
function throwGrenade(target) {
  const o = gunOrigin(-1.3), T = clamp(o.distanceTo(target) / 75, 0.7, 2.4), g = 22;
  const vel = new V3().subVectors(target, o).multiplyScalar(1 / T); vel.y += 0.5 * g * T;
  const mesh = GRENADE.clone(); mesh.position.copy(o); scene.add(mesh);
  mesh.getObjectByName('ring').visible = false;
  projs.push({ k: 'grenade', mesh, pos: o, vel, t: 0, fuse: T + rand(0.9, 1.3), rest: false, bounces: 0, spin: new V3(rand(-12, 12), rand(-12, 12), rand(-12, 12)), g, target: target.clone(), spoon: false });
  sfxWhoosh(0.45, 0.1, 900, 380); if (live()) modal(OUT, AC.currentTime + 0.01, 3100, [1, 2.6, 4.7], 0.05, 0.25);    // the pin coming out
}
let meteorFocus = null;
function launchMeteor(target, scale, R) {
  const dir = new V3(rand(-0.6, -0.2), 1, rand(0.15, 0.5)).normalize(), dist = 700, start = target.clone().addScaledVector(dir, dist);
  const mesh = new THREE.Mesh(rockGeo, rockMat); mesh.scale.setScalar(scale); mesh.position.copy(start); mesh.castShadow = true;
  const glow = new THREE.Sprite(glowMat(0xff7a2a)); glow.scale.setScalar(5); mesh.add(glow); scene.add(mesh);
  const sheath = new THREE.Mesh(new THREE.ConeGeometry(1.3, 7, 18, 1, true), sheathMat); scene.add(sheath);
  const warn = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false }));
  warn.position.copy(target); warn.position.y += 0.4; warn.scale.setScalar(R); warn.renderOrder = 9; scene.add(warn);
  const p = { k: 'meteor', mesh, sheath, pos: start, dir: dir.clone().negate(), speed: 320, left: dist, total: dist, target: target.clone(), R, scale, warn, t: 0, spin: new V3(rand(-2, 2), rand(-2, 2), rand(-2, 2)), snd: startLoop('meteor', start), boomed: false };
  projs.push(p); meteorFocus = p;
}
// the double crack of something supersonic passing overhead
function sfxSonic(p) {
  if (!voice(0.2, 1)) return; const P = place(p, true);
  for (const dt of [0, 0.11]) chain(noise(NB, P.t + dt, 0.03), flt('highpass', 600), SHAPE_HARD, gEnv(P.t + dt, 0.7, 0.0005, 0.03), P.node);
}
function meteorImpact(p) {
  const R = p.R, at = p.target.clone();
  explode(at, { R, power: 46 * R / 24, crater: true, craterR: R * 0.6, craterD: R * 0.3, heat: 1, big: true });
  const n = Math.round(R * 1.1);                                      // burning ejecta thrown out of the crater
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283), s = rand(0.3, 0.9), sp = rand(15, 42) * (R / 24 + 0.4);
    spawnChunk(true, at.x, at.y + 1, at.z, Math.cos(a) * s * sp, sp * rand(0.6, 1), Math.sin(a) * s * sp, rand(0.5, 1.4) * (R / 24 + 0.5), Math.random() < 0.5 ? DIRT : GRAY, 2);
  }
  pending.push({ at: G.time + 0.2, fn: () => {                        // a second wave of dust rolling out over the ground
    for (let i = 0; i < 90; i++) { const a = rand(0, 6.283), sp = rand(14, 30) * (R / 24 + 0.3); emit(SMOKE, at.x + Math.cos(a) * R * 0.5, groundY(at.x, at.z) + rand(0.5, 3), at.z + Math.sin(a) * R * 0.5, Math.cos(a) * sp, rand(0.5, 3), Math.sin(a) * sp, rand(6, 10), R * 0.3, R * rand(1, 1.5), 0.6, 0.55, 0.48, 0.42, 1.1, -0.15, 0, 0.8); }
  } });
}
function stepProjs(dt) {
  for (let i = pending.length - 1; i >= 0; i--) if (G.time >= pending[i].at) { const f = pending[i].fn; pending.splice(i, 1); f(); }
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.t += dt; let done = false;
    if (p.k === 'missile') {
      if (p.t < 0.16) p.vel.y -= 9.8 * dt;                                  // ejected, motor not lit yet
      else {
        if (!p.lit) {
          p.lit = true; p.mesh.getObjectByName('flame').visible = true; flash(p.pos, 7, 0.15, GLOW_C); p.snd = startLoop('missile', p.pos);
          for (let k = 0; k < 14; k++) { randDir(_v); emit(SMOKE, p.pos.x, p.pos.y, p.pos.z, _v.x * 4, _v.y * 4, _v.z * 4, rand(1.5, 3), 1, rand(3, 5), 0.85, 0.85, 0.85, 0.5, 2, -0.2, 0, 0.5); }
          if (live()) { const P = place(p.pos, false); chain(noise(PB, P.t, 0.25), flt('lowpass', 2500), SHAPE, gEnv(P.t, 0.5, 0.004, 0.22), P.node); }
        }
        const speed = Math.min(220, p.vel.length() + 280 * dt);
        if (p.ele && (p.ele.state === 'walk' || p.ele.state === 'pop')) p.target.copy(p.ele.g.position).add(p.eoff);   // follow a walking elephant
        // top attack: chase a point above the target that drops onto it as the missile closes in
        const hd = Math.hypot(p.target.x - p.pos.x, p.target.z - p.pos.z);
        _v.copy(p.target); if (hd > 12) _v.y += Math.min(90, hd * 0.42);
        _v.sub(p.pos).normalize(); _v2.copy(p.vel).normalize().lerp(_v, Math.min(1, dt * (2.2 + p.t * 3.5))).normalize();
        p.vel.copy(_v2).multiplyScalar(speed);
      }
      const step = p.vel.length() * dt; _v2.copy(p.vel).normalize();
      const hs = p.lit ? hitStructs(p.pos, _v2, step + 1) : null;
      const close = p.pos.distanceTo(p.target) < step * 1.4 + 0.5;
      if (hs || close || p.pos.y < groundY(p.pos.x, p.pos.z) || p.t > 9) {
        explode(hs ? hs.p.clone() : close ? p.target.clone() : p.pos.clone(), { R: p.R, power: p.power, crater: true, craterR: p.R * 0.55, craterD: p.R * 0.26, heat: 0.7 }); done = true;
      } else {
        p.pos.addScaledVector(p.vel, dt); p.mesh.position.copy(p.pos); p.mesh.quaternion.setFromUnitVectors(UP, _v2);
        if (p.lit) {
          const fl = p.mesh.getObjectByName('flame'); fl.scale.set(rand(0.85, 1.15), rand(0.8, 1.25), rand(0.85, 1.15));
          const tx = p.pos.x - _v2.x * 3, ty = p.pos.y - _v2.y * 3, tz = p.pos.z - _v2.z * 3;
          p.acc += step;
          while (p.acc > 1.1) { p.acc -= 1.1; const gc = rand(0.84, 0.94); emit(SMOKE, tx + rand(-0.3, 0.3), ty + rand(-0.3, 0.3), tz + rand(-0.3, 0.3), rand(-0.6, 0.6), rand(0, 1), rand(-0.6, 0.6), rand(4, 7), 1.0, rand(5, 8), gc, gc, gc * 0.98, 0.5, 0.35, -0.15, 0, 1); }
          emit(FIRE, tx, ty, tz, -_v2.x * 20, -_v2.y * 20, -_v2.z * 20, 0.12, 2, 0.8, 0, 0, 0, 1, 0, 0, 1, 0);
          spark(tx, ty, tz, -_v2.x * 40 + rand(-4, 4), -_v2.y * 40 + rand(-4, 4), -_v2.z * 40 + rand(-4, 4), 0.08, 0.15, 0.02, 3, 1, 0.75, 0.35, 0, 0);
          updateLoop(p.snd, p.pos, dt, 0.9);
        }
      }
    } else if (p.k === 'grenade') {
      const blink = p.mesh.getObjectByName('blink'), left = p.fuse - p.t;
      blink.visible = Math.sin(p.t * (left < 0.8 ? 40 : 14)) > 0;
      if (!p.spoon && p.t > 0.08) {                                     // the safety lever springs away
        p.spoon = true; const lv = p.mesh.getObjectByName('lever'); lv.visible = false;
        const sp = new THREE.Mesh(lv.geometry, mSteel); sp.scale.setScalar(1.4); sp.position.copy(p.pos); scene.add(sp);
        addDebris(sp, p.vel.clone().multiplyScalar(0.6).add(new V3(rand(-4, 4), 6, rand(-4, 4))), 14, 0.3, { own: false, col: GRAY, n: 0 });
        if (live()) modal(place(p.pos, false).node, AC.currentTime + 0.01, 2600, [1, 2.9], 0.04, 0.12);
      }
      if (!p.rest) {
        p.vel.y -= p.g * dt;
        const step = p.vel.length() * dt; _v2.copy(p.vel).normalize();
        const hs = step > 1e-4 ? hitStructs(p.pos, _v2, step + 0.3) : null;
        let n = null, hp = null;
        if (hs) { n = hs.n; hp = hs.p; }
        else { p.pos.addScaledVector(p.vel, dt); const gy = groundY(p.pos.x, p.pos.z); if (p.pos.y < gy + 0.35) { hp = _v3.set(p.pos.x, gy, p.pos.z); n = groundNormal(p.pos.x, p.pos.z, new V3()); } }
        if (n) {
          const vn = p.vel.dot(n), sp = p.vel.length();
          p.vel.addScaledVector(n, -vn).multiplyScalar(0.45).addScaledVector(n, -0.28 * vn);   // bounce: restitution 0.28 with friction
          // stay near where it was aimed: the throw's sideways speed doesn't survive the impact, and it drifts back toward the mark
          const cap = p.bounces ? 2.5 : 4, hv = Math.hypot(p.vel.x, p.vel.z);
          if (hv > cap) { p.vel.x *= cap / hv; p.vel.z *= cap / hv; }
          const ox = p.target.x - hp.x, oz = p.target.z - hp.z, od = Math.hypot(ox, oz);
          if (od > 2.5) { p.vel.x = p.vel.x * 0.4 + ox / od * Math.min(cap, od); p.vel.z = p.vel.z * 0.4 + oz / od * Math.min(cap, od); }
          p.vel.y = Math.min(p.vel.y, p.bounces ? 3 : 5.5);
          p.pos.copy(hp).addScaledVector(n, 0.4); p.bounces++; p.spin.multiplyScalar(0.6);
          if (sp > 4) { sfxClink(p.pos); emit(SMOKE, hp.x, hp.y + 0.2, hp.z, 0, 0.5, 0, rand(0.8, 1.5), 0.4, 1.6, 0.6, 0.56, 0.5, 0.4, 2, -0.2, 0, 0); }
          if ((p.vel.length() < 2.2 && n.y > 0.6) || p.bounces > 4) { p.rest = true; p.vel.set(0, 0, 0); }
        }
        p.mesh.position.copy(p.pos);
      }
      if (p.t > 0.1 && Math.random() < 0.5) emit(SMOKE, p.pos.x, p.pos.y + 0.6, p.pos.z, 0, 1.2, 0, rand(0.8, 1.4), 0.2, 0.9, 0.78, 0.78, 0.76, 0.3, 1, -0.4, 0, 0.5);   // fuse smoke
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt; if (p.rest) p.spin.multiplyScalar(Math.exp(-dt * 5));
      if (p.t >= p.fuse) { explode(p.pos.clone().add(_v.set(0, 0.4, 0)), { R: 6, power: 30, crater: true, craterR: 3, craterD: 1.6, heat: 0.6 }); done = true; }
    } else if (p.k === 'meteor') {
      const step = p.speed * dt; p.left -= step; p.pos.addScaledVector(p.dir, step); p.mesh.position.copy(p.pos);
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
      const s = p.scale;
      // plasma sheath streaming back from the rock
      p.sheath.position.copy(p.pos).addScaledVector(p.dir, -s * 3.2); p.sheath.quaternion.setFromUnitVectors(UP, _v.copy(p.dir).negate());
      p.sheath.scale.set(s * rand(0.9, 1.1), s * rand(0.9, 1.25), s * rand(0.9, 1.1));
      for (let k = 0; k < 6; k++) emit(FIRE, p.pos.x + rand(-s, s), p.pos.y + rand(-s, s), p.pos.z + rand(-s, s), -p.dir.x * rand(10, 40), -p.dir.y * rand(10, 40), -p.dir.z * rand(10, 40), rand(0.3, 0.7), s * 2.5, s * 4.5, 0, 0, 0, 1, 1.5, 0, 1, 0);
      for (let k = 0; k < 3; k++) emit(SMOKE, p.pos.x + rand(-s, s), p.pos.y, p.pos.z + rand(-s, s), -p.dir.x * 5, -p.dir.y * 5, -p.dir.z * 5, rand(5, 9), s * 2, s * 7, 0.22, 0.19, 0.17, 0.6, 0.4, -0.2, 4, 1, 0, 0.8);
      for (let k = 0; k < 3; k++) spark(p.pos.x + rand(-s, s), p.pos.y + rand(-s, s), p.pos.z + rand(-s, s), -p.dir.x * rand(30, 80) + rand(-8, 8), -p.dir.y * rand(30, 80) + rand(-8, 8), -p.dir.z * rand(30, 80) + rand(-8, 8), rand(0.3, 0.8), rand(0.1, 0.25), 0.03, 0, 1, 1, 1, 0.6, 2);
      p.warn.material.opacity = 0.35 + 0.35 * Math.sin(p.t * 18); p.warn.scale.setScalar(p.R * (1.2 - 0.2 * (1 - p.left / p.total)));
      if (meteorFocus === p) { meteorLight.position.copy(p.pos); meteorLight.intensity = 3 + 12 * (1 - p.left / p.total); meteorLight.distance = 260; }
      updateLoop(p.snd, p.pos, dt, 0.4 + 1.4 * (1 - p.left / p.total));
      if (!p.boomed && p.left < 160) { p.boomed = true; sfxSonic(p.pos); }
      if (p.left <= 0) { meteorImpact(p); done = true; if (meteorFocus === p) { meteorFocus = null; meteorLight.intensity = 0; } }
    }
    if (done) { stopLoop(p.snd); scene.remove(p.mesh); if (p.sheath) scene.remove(p.sheath); if (p.warn) { scene.remove(p.warn); p.warn.material.dispose(); } projs.splice(i, 1); }
  }
}

// beam pieces shared by the 파괴포 shot
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
const bMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });

// ------------------------------------------------------------------ lightning: lock onto the exact spot, a faint stepped leader feels its way down, a streamer rises to meet it,
// then the return stroke slams onto the mark — blinding channel, re-strikes, a scorched Lichtenberg pattern and thunder
const BOLT_V = 'attribute vec3 aTail; attribute vec4 aCol; attribute float aW; attribute float aSide; attribute float aEnd; uniform float uScale; varying vec4 vC; varying float vS;\n' +
  'void main(){ vec4 h = modelViewMatrix * vec4(position, 1.0), t = modelViewMatrix * vec4(aTail, 1.0);\n' +
  ' vec2 d = t.xy / max(0.1, -t.z) - h.xy / max(0.1, -h.z); float L = length(d); vec2 dir = L > 1e-6 ? d / L : vec2(0.0, 1.0);\n' +
  ' vec4 p = aEnd > 0.5 ? t : h; float w = max(aW, -p.z * 1.5 / uScale);\n' +
  ' p.xy += vec2(-dir.y, dir.x) * aSide * w; gl_Position = projectionMatrix * p; vC = aCol; vS = aSide; }';
const BOLT_F = 'uniform float uA; varying vec4 vC; varying float vS; void main(){ gl_FragColor = vec4(vC.rgb, vC.a * uA * (1.0 - vS * vS)); }';
function boltMaterial() { return new THREE.ShaderMaterial({ uniforms: { uScale: pScale, uA: { value: 1 } }, vertexShader: BOLT_V, fragmentShader: BOLT_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); }
// segs: [a, b, width] — one ribbon quad each, kept in order so a prefix can be revealed
function ribbonMesh(segs, wMul, r, g, b, a) {
  const n = segs.length, H = new Float32Array(n * 12), Tl = new Float32Array(n * 12), C = new Float32Array(n * 16), W = new Float32Array(n * 4), Sd = new Float32Array(n * 4), En = new Float32Array(n * 4), idx = new Uint16Array(n * 6);
  segs.forEach(([p, q, w], i) => {
    for (let v = 0; v < 4; v++) { const o = i * 4 + v; H.set([p.x, p.y, p.z], o * 3); Tl.set([q.x, q.y, q.z], o * 3); C.set([r, g, b, a], o * 4); W[o] = w * wMul; }
    Sd.set([-1, 1, -1, 1], i * 4); En.set([0, 0, 1, 1], i * 4); const v0 = i * 4; idx.set([v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2], i * 6);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(H, 3)); geo.setAttribute('aTail', new THREE.BufferAttribute(Tl, 3)); geo.setAttribute('aCol', new THREE.BufferAttribute(C, 4));
  geo.setAttribute('aW', new THREE.BufferAttribute(W, 1)); geo.setAttribute('aSide', new THREE.BufferAttribute(Sd, 1)); geo.setAttribute('aEnd', new THREE.BufferAttribute(En, 1)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(geo, boltMaterial()); m.frustumCulled = false; m.renderOrder = 8; scene.add(m); return m;
}
function jag(a, b, disp, depth, w, out) {
  if (depth === 0) { out.push([a, b, w]); return; }
  const m = a.clone().lerp(b, 0.5); randDir(_v); m.addScaledVector(_v, disp * rand(0.4, 1));
  jag(a, m, disp * 0.55, depth - 1, w, out); jag(m, b, disp * 0.55, depth - 1, w, out);
}
const disposeMesh = (m) => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); };
const SUN = V.sun, HEMI = scene.children.find((o) => o.isHemisphereLight), SKY0 = [SUN.intensity, HEMI ? HEMI.intensity : 0];
let skyDim = 0, skyFlash = 0;                                      // storm darkening while a bolt is building, the flash of the stroke
function stepSky(dt) {
  skyFlash = Math.max(0, skyFlash - dt * 3.5); skyDim = Math.max(0, skyDim - dt * 1.4);
  const k = 1 - skyDim * 0.55 + skyFlash * 1.6;
  SUN.intensity = SKY0[0] * k; if (HEMI) HEMI.intensity = SKY0[1] * (1 - skyDim * 0.4 + skyFlash * 2.2);
}
// branching scorch burned into the ground around a strike
function lichtenberg(x, z) {
  const walk = (px, pz, ang, len, w, depth) => {
    for (let s = 0; s < len; s++) {
      ang += rand(-0.55, 0.55); px += Math.cos(ang) * 0.8; pz += Math.sin(ang) * 0.8;
      const i = Math.round(px - X0), j = Math.round(pz - Z0); if (i < 1 || j < 1 || i >= DW - 1 || j >= DH - 1) return;
      const m = 0.25 + 0.5 * (s / len), k = (j * DW + i) * 4;
      SD[k] = Math.min(SD[k], 255 * m); SD[k + 1] = Math.min(SD[k + 1], 255 * m * 0.95); SD[k + 2] = Math.min(SD[k + 2], 255 * m * 0.92); SD[k + 3] = Math.min(SD[k + 3], 120 + 130 * s / len);
      if (depth < 2 && Math.random() < 0.12) walk(px, pz, ang + rand(-1.1, 1.1), Math.floor(len * 0.5), w, depth + 1);
    }
  };
  for (let b = 0; b < 7; b++) walk(x, z, b / 7 * 6.283 + rand(-0.3, 0.3), Math.floor(rand(12, 26)), 1, 0);
  hot.push({ i0: clamp(Math.floor(x - X0 - 25), 0, DW - 1), i1: clamp(Math.ceil(x - X0 + 25), 0, DW - 1), j0: clamp(Math.floor(z - Z0 - 25), 0, DH - 1), j1: clamp(Math.ceil(z - Z0 + 25), 0, DH - 1) });
  scorchDirty = true;
}
const bolts = [], strikes = [];
const lockGeo = new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2), lockGeo2 = new THREE.RingGeometry(0.6, 0.66, 3).rotateX(-Math.PI / 2);
function strikeBolt(target) {
  // the channel: high and almost straight above the mark, with a dead-straight last stretch so it lands exactly on it
  const top = target.clone().add(new V3(rand(-16, 16), rand(360, 420), rand(-16, 16)));
  const kink = target.clone().add(new V3(rand(-1.5, 1.5), rand(16, 24), rand(-1.5, 1.5)));
  const main = []; jag(top, kink, top.distanceTo(kink) * 0.065, 6, 1, main); main.push([kink, target.clone(), 1.25]);
  const forks = [];
  for (let i = 3; i < main.length - 8; i++) {
    if (Math.random() > 0.11) continue;
    const a = main[i][0], len = rand(25, 95); randDir(_v); _v.y = -Math.abs(_v.y) - 0.6; _v.normalize();
    jag(a, a.clone().addScaledVector(_v, len), len * 0.2, 4, 0.35, forks);
  }
  const ring = new THREE.Mesh(lockGeo, new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  const tri = new THREE.Mesh(lockGeo2, ring.material.clone()); ring.add(tri);
  ring.position.copy(target).add(_v.set(0, 0.4, 0)); ring.renderOrder = 10; scene.add(ring);
  const leader = ribbonMesh(main, 0.3, 0.55, 0.65, 1, 0.55); leader.geometry.setDrawRange(0, 0);
  const glow = new THREE.Sprite(glowMat(0x9fd4ff)); glow.position.copy(target).add(_v.set(0, 1, 0)); glow.scale.setScalar(0.1); scene.add(glow);
  strikes.push({ target: target.clone(), t: 0, main, forks, ring, leader, glow, hit: false });
  sfxCrackle(target, 0.26); skyDim = 1;
}
const STRIKE_AT = 0.24;
function returnStroke(S) {
  const tg = S.target, segs = S.main.concat(S.forks);
  for (let k = 0; k < 6; k++) { const a = rand(0, 6.283), len = rand(7, 16), e = tg.clone().add(_v.set(Math.cos(a) * len, 0, Math.sin(a) * len)); e.y = groundY(e.x, e.z) + 0.25; jag(tg.clone().add(_v2.set(0, 0.25, 0)), e, len * 0.3, 3, 0.3, segs); }   // arcs crawling over the ground
  const core = ribbonMesh(segs, 1, 0.95, 0.97, 1, 1), halo = ribbonMesh(segs, 3.2, 0.45, 0.6, 1, 0.22);
  bolts.push({ ms: [core, halo], t: 0, strikes: [0, 0.085, 0.2], dur: 0.6 });
  disposeMesh(S.leader); S.leader = null;
  // the impact on the exact mark
  flashLightBlue(tg, 24); screenFlash(tg, 36, '#e3f0ff'); flash(tg.clone().add(_v.set(0, 1.5, 0)), 26, 0.28, new THREE.Color(0.8, 0.9, 1));
  skyFlash = 1; skyDim = 0; trauma = Math.min(1, trauma + 0.55);
  explode(tg, { R: 8, power: 40, crater: true, craterR: 4.5, craterD: 2.6, heat: 1, lite: true });
  for (let i = 0; i < 90; i++) { randDir(_v); _v.y = Math.abs(_v.y) * 0.8 + 0.1; const sp = rand(10, 50); spark(tg.x, tg.y + 0.5, tg.z, _v.x * sp, _v.y * sp, _v.z * sp, rand(0.2, 0.7), rand(0.05, 0.12), 0.03, 1, 0.65, 0.82, 1, 1, 9); }
  for (let i = 0; i < 30; i++) { randDir(_v); emit(SMOKE, tg.x + _v.x * 3, tg.y + Math.abs(_v.y) * 4, tg.z + _v.z * 3, _v.x * 2, rand(1, 4), _v.z * 2, rand(3, 6), 2, rand(7, 11), 0.55, 0.57, 0.62, 0.45, 0.8, -0.4, 0, 0.6, 0.05); }
  lichtenberg(tg.x, tg.z);
  if (Math.random() < 0.7) addFire(tg.x, tg.y + 0.5, tg.z, rand(8, 15), rand(1.5, 2.5), null);
  sfxThunder(tg);
}
function stepBolts(dt) {
  for (let i = strikes.length - 1; i >= 0; i--) {
    const S = strikes[i]; S.t += dt;
    if (!S.hit) {
      const k = Math.min(1, S.t / STRIKE_AT);
      S.ring.scale.setScalar(lerp(16, 2.2, k * k)); S.ring.rotation.y += dt * 4; S.ring.material.opacity = 0.5 + 0.5 * Math.sin(S.t * 60);
      S.leader.geometry.setDrawRange(0, Math.floor(S.main.length * Math.min(1, k * 1.1)) * 6);
      S.leader.material.uniforms.uA.value = 0.4 + Math.random() * 0.5;
      S.glow.scale.setScalar(2 + k * 6); skyDim = 1;
      if (Math.random() < 0.8) spark(S.target.x + rand(-1, 1), S.target.y + 0.3, S.target.z + rand(-1, 1), rand(-2, 2), rand(14, 30), rand(-2, 2), 0.18, 0.06, 0.04, 1, 0.7, 0.85, 1, 0, 0);   // streamer rising to meet it
      if (S.t >= STRIKE_AT) { S.hit = true; returnStroke(S); }
    } else {
      const k = (S.t - STRIKE_AT) / 0.5;
      S.ring.material.opacity = Math.max(0, 1 - k); S.ring.scale.setScalar(2.2 + k * 10); S.glow.scale.setScalar(Math.max(0.01, 14 * (1 - k)));
      if (k >= 1) { scene.remove(S.ring); scene.remove(S.glow); strikes.splice(i, 1); }
    }
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.t += dt;
    if (b.t > b.dur) { for (const m of b.ms) disposeMesh(m); bolts.splice(i, 1); continue; }
    let a = 0; for (const s of b.strikes) { const k = b.t - s; if (k >= 0 && k < 0.09) a = Math.max(a, 1 - k / 0.09); }
    if (b.t > 0.08 && a > 0.5 && Math.random() < 0.5) skyFlash = Math.max(skyFlash, 0.6);
    a = Math.max(a, 0.22 * (1 - b.t / b.dur)) * (0.8 + Math.random() * 0.4);
    for (const m of b.ms) m.material.uniforms.uA.value = a;
  }
  stepSky(dt);
}

// ------------------------------------------------------------------ 레일건: a hypervelocity slug that punches through whatever stands in the line of fire
const rails = [];
const coilGeo = new THREE.RingGeometry(0.75, 1, 40);
function fireRail() {
  if (G.cd.rail > 0) { sfxClink(null); return; }
  camBasis();
  const dir = aimP ? aimP.clone().sub(camera.position).normalize() : camF.clone();
  const hit = aimFromRay(camera.position.clone(), dir.clone()), end = hit || camera.position.clone().addScaledVector(dir, 1500);
  const muz = camera.position.clone().addScaledVector(camF, 4).addScaledVector(camR, 1.8).addScaledVector(camU, -1.8);
  const bd = end.clone().sub(muz), len = bd.length(); bd.normalize();
  const ms = [[0xffffff, 1, 0.35], [0x55d8ff, 0.5, 1.5], [0x2a7fff, 0.12, 4.5]].map(([c, o, w]) => {
    const m = new THREE.Mesh(beamGeo, bMat(c, o)); m.position.copy(muz).addScaledVector(bd, len / 2); m.quaternion.setFromUnitVectors(UP, bd); m.scale.set(w, len, w); m.userData = { w, o }; scene.add(m); return m;
  });
  // magnetic coil rings punched out of the muzzle
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(coilGeo, bMat(0x9fe8ff, 0.8)); r.position.copy(muz).addScaledVector(bd, 3 + i * 5); r.quaternion.setFromUnitVectors(_v.set(0, 0, 1), bd); r.userData = { w: 1 + i * 0.4, o: 0.8, ring: true }; r.scale.setScalar(r.userData.w); scene.add(r); ms.push(r);
  }
  rails.push({ ms, t: 0, len });
  const ax = new V3().crossVectors(bd, UP); if (ax.lengthSq() < 0.01) ax.set(1, 0, 0); ax.normalize(); const ay = new V3().crossVectors(bd, ax);
  const n = Math.min(180, Math.floor(len / 2.2));
  for (let i = 0; i < n; i++) {                                        // vapour corkscrew left along the slug's path
    const t = i / n, a = t * len * 0.32, ca = Math.cos(a), sa = Math.sin(a);
    _v.copy(muz).addScaledVector(bd, t * len).addScaledVector(ax, ca * 1.6).addScaledVector(ay, sa * 1.6);
    emit(SMOKE, _v.x, _v.y, _v.z, (ax.x * ca + ay.x * sa) * 1.5, (ax.y * ca + ay.y * sa) * 1.5, (ax.z * ca + ay.z * sa) * 1.5, rand(1.4, 2.6), 0.7, rand(3, 5), 0.86, 0.93, 1, 0.32, 1.2, -0.1, 0, 0.3, t * 0.06);
    if (i % 5 === 0) spark(_v.x, _v.y, _v.z, rand(-6, 6), rand(-6, 6), rand(-6, 6), rand(0.2, 0.5), 0.06, 0.03, 1, 0.6, 0.85, 1, 1, 0);
  }
  if (hit) {
    explode(hit.clone(), { R: 13, power: 72, crater: true, craterR: 7.5, craterD: 4.5, heat: 1 });
    for (const [dl, at, R, pw] of [[10, 0.05, 10, 52], [20, 0.11, 7, 36]]) {          // the slug punches on through
      const q = hit.clone().addScaledVector(bd, dl), gy = groundY(q.x, q.z), under = q.y < gy;
      if (under) q.y = gy + 0.3;
      pending.push({ at: G.time + at, fn: () => explode(q, { R, power: pw, crater: true, craterR: R * 0.6, craterD: under ? R * 0.45 : R * 0.25, heat: 0.8 }) });
    }
  }
  flashLightBlue(muz, 6);
  G.cd.rail = 2.0; trauma = Math.min(1, trauma + 0.5);
  sfxRail();
}
function stepRails(dt) {
  for (let i = rails.length - 1; i >= 0; i--) {
    const r = rails[i]; r.t += dt; const k = r.t / 0.55;
    if (k >= 1) { for (const m of r.ms) { scene.remove(m); m.material.dispose(); } rails.splice(i, 1); continue; }
    for (const m of r.ms) {
      if (m.userData.ring) { m.scale.setScalar(m.userData.w * (1 + k * 5)); m.material.opacity = m.userData.o * (1 - k); continue; }
      const w = m.userData.w * (1 + k * 2.5); m.scale.x = m.scale.z = w; m.material.opacity = m.userData.o * (1 - k) * (1 - k);
    }
  }
}

// ------------------------------------------------------------------ game state: one 60 s round. Points come from destroyed cells and collapses;
// collapses in quick succession raise a chain multiplier, and destruction charges the meteor.
const ROUND = 60, CHAIN = 7, METEOR_PTS = 7000, GRACE = 2.6, CELL_K = 0.12;
const G = { playing: false, live: false, ended: false, time: 0, left: ROUND, score: 0, kills: 0, dmg: 0, combo: 0, maxCombo: 0, lastKill: -99, cur: -1, cd: {}, heat: 0, overheat: false, meteor: 0.6, tok: null, quit: false };
const curId = () => G.cur >= 0 ? WEAPONS[G.cur].id : null;
const chainOn = () => G.combo >= 2 && G.time - G.lastKill < CHAIN;
const mult = () => chainOn() ? Math.min(3, 1 + 0.25 * (G.combo - 1)) : 1;
let scoreDirty = false;
// broken walls and floors earn a little; a building that comes down earns a lot (see kill)
function addScore(pts, val, raw) {
  if (!G.playing || G.quit) return;
  const p = pts * (raw ? 1 : CELL_K) * mult(); G.score += p; G.dmg += val || 0;
  if (!G.ended) G.meteor = Math.min(1, G.meteor + p / METEOR_PTS);
  scoreDirty = true;
}
function kill(S) {
  if (!S.counts) { addScore(120, 0, true); return; }
  G.kills++;
  G.combo = G.time - G.lastKill < CHAIN ? G.combo + 1 : 1; G.lastKill = G.time; G.maxCombo = Math.max(G.maxCombo, G.combo);
  const base = 1000 + Math.min(S.value || 0, 1500), bonus = Math.round(base * mult());
  addScore(base, 0, true);
  feed('<b>' + esc(S.name || '건물') + '</b> 붕괴<em>+' + fmtNum(bonus) + '</em>');
  if (S.cx != null) popup('+' + fmtNum(bonus), new V3(S.cx, (S.ymax || 0) + 6, S.cz), 'big');
  if (G.combo > 1) { sfxChime(); banner('연쇄 ×' + G.combo, '점수 ' + mult().toFixed(2).replace(/0$/, '') + '배'); }
  if (S.label) { const L = S.label; L.el.classList.add('dead'); setTimeout(() => { const i = labels.indexOf(L); if (i >= 0) labels.splice(i, 1); L.el.remove(); }, 4000); }
  if (G.kills === TOTAL && G.live && G.mode === 'time') { const b = Math.round(G.left * 1500); addScore(b / mult(), 0, true); sysFeed('캠퍼스 전멸! 남은 시간 보너스 +' + fmtNum(b)); endRound(); }
}
function feed(html, cls) {
  const box = $('#feed'), el = document.createElement('div'); if (cls) el.className = cls; el.innerHTML = html; box.prepend(el);
  setTimeout(() => el.classList.add('out'), 2600); setTimeout(() => el.remove(), 3200);
  while (box.children.length > 3) box.lastChild.remove();
}
const sysFeed = (t) => feed(esc(t), 'sys');
const pops = [];
function popup(text, pos, cls) { if (pops.length > 14) return; const el = document.createElement('div'); el.className = 'pop ' + (cls || ''); el.textContent = text; $('#pops').appendChild(el); pops.push({ el, pos: pos.clone(), t: 0 }); }
function stepPops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt; p.pos.y += dt * 6;
    if (p.t > 1.6) { p.el.remove(); pops.splice(i, 1); continue; }
    _v.copy(p.pos).project(camera);
    if (_v.z > 1) { p.el.style.display = 'none'; continue; }
    p.el.style.display = ''; p.el.style.opacity = String(Math.min(1, (1.6 - p.t) * 2));
    p.el.style.transform = 'translate(' + ((_v.x + 1) / 2 * innerWidth).toFixed(0) + 'px,' + ((1 - _v.y) / 2 * innerHeight).toFixed(0) + 'px) translate(-50%,-50%)';
  }
}
let bannerT = 0;
function banner(big, small) {
  const el = $('#banner'); el.innerHTML = esc(big) + (small ? '<small>' + esc(small) + '</small>' : '');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

// weapon icons (drawn, so they look the same on every phone)
const ICONS = {
  cannon: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 22 L20 8"/><path d="M10 26 L24 12"/><path d="M14 30 L28 16" opacity=".55"/><circle cx="21.5" cy="6.5" r="2.2" fill="#ffd36b" stroke="none"/><circle cx="25.5" cy="10.5" r="2.2" fill="#ffd36b" stroke="none"/></svg>',
  missile: '<svg viewBox="0 0 32 32"><path d="M25 4c-6 1-11 5-14 10l7 7c5-3 9-8 10-14z" fill="#f2f3f5"/><path d="M25 4c-2 .3-3.8 1-5.4 1.9l5.5 5.5C26 9.8 26.7 8 27 6z" fill="#e2412a"/><path d="M11 14l-5 1-3 4 6 1zM18 21l-1 5-4 3-1-6z" fill="#8a929c"/><path d="M9 20c-3 1-4 4-5 8 4-1 7-2 8-5z" fill="#ffb23f"/><path d="M8 22c-1.5.8-2 2-2.6 4 2-.6 3.3-1.2 4-2.6z" fill="#fff3c4"/></svg>',
  bolt: '<svg viewBox="0 0 32 32"><path d="M18 2 6 18h8l-3 12 15-18h-8l4-10z" fill="#9fd0ff" stroke="#e9f4ff" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  rail: '<svg viewBox="0 0 32 32" fill="none" stroke-linecap="round"><path d="M3 16h26" stroke="#6ff0ff" stroke-width="3"/><path d="M3 16h26" stroke="#fff" stroke-width="1.2"/><ellipse cx="9" cy="16" rx="2" ry="6" stroke="#9fe8ff" stroke-width="1.6"/><ellipse cx="15" cy="16" rx="1.6" ry="4.6" stroke="#9fe8ff" stroke-width="1.4" opacity=".75"/><ellipse cx="20" cy="16" rx="1.2" ry="3.2" stroke="#9fe8ff" stroke-width="1.2" opacity=".5"/></svg>',
  meteor: '<svg viewBox="0 0 32 32"><path d="M4 4l13 9-2 2z" fill="#ffb23f" opacity=".7"/><path d="M2 12l14 4-1 3z" fill="#ff6a1f" opacity=".6"/><path d="M12 2l7 13-3 1z" fill="#ffd36b" opacity=".6"/><circle cx="21" cy="21" r="8" fill="#3a2c26"/><path d="M16 19c3 1 5 0 7-3M18 25c2-1 4-1 6 1M23 19c1 2 3 3 4 2" stroke="#ff7a2a" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>'
};
const slots = WEAPONS.map((w, i) => {
  const b = document.createElement('button'); b.className = 'slot'; b.dataset.id = w.id; b.setAttribute('aria-label', w.name);
  b.innerHTML = '<span class="key">' + (i + 1) + '</span><span class="cd"></span><span class="ic">' + ICONS[w.id] + '</span><span class="nm">' + w.name + '</span>' + (w.gauge ? '<span class="bar"><b></b></span>' : '');
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); audioInit(); selectWeapon(i); });
  $('#dock').appendChild(b);
  const d = document.createElement('div'); d.innerHTML = ICONS[w.id] + w.name; $('#weapIntro').appendChild(d);
  return { b, cd: b.querySelector('.cd'), bar: b.querySelector('.bar') && b.querySelector('.bar b'), last: {} };
});
let tipTimer = 0;
const reticleMat = new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false });
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), reticleMat);
reticle.renderOrder = 10; reticle.visible = false; scene.add(reticle);
const arcLine = { visible: false };
// choosing the selected weapon again (or Esc) puts it away and frees the pointer for the camera
function selectWeapon(i, quiet) {
  if (i === G.cur || i == null || i < 0 || i >= WEAPONS.length) i = -1;
  leftDown = false;
  G.cur = i; slots.forEach((s, k) => s.b.classList.toggle('sel', k === i));
  applyControlMode();
  if (!quiet) showTip();
}
function showTip() {
  const i = G.cur, t = $('#wtip');
  if (i >= 0) { const w = WEAPONS[i]; reticleMat.color.set(w.id === 'bolt' ? 0x9fc8ff : w.id === 'rail' ? 0x6ff0ff : 0xff5a1f); t.textContent = w.name + ': ' + (TOUCH ? w.touchTip || w.tip : w.tip); }
  else if (monk.on) { reticle.visible = false; t.textContent = TOUCH ? '왼쪽 조이스틱으로 걷기, 한 손가락으로 시점 돌리기' : 'WASD 걷기, Shift 달리기, 드래그로 시점 돌리기'; }
  else { reticle.visible = false; t.textContent = TOUCH ? '한 손가락으로 이동, 두 손가락으로 확대하고 비틀면 360도 회전' : '시점 이동: 드래그 회전, 우클릭 드래그 이동, 휠 확대'; }
  if (monk.on && i >= 0) t.textContent = TOUCH ? '조이스틱으로 걷고, 탭으로 ' + WEAPONS[i].name + ' 발사. 두 손가락으로 시점 회전' : 'WASD로 걷고, 클릭으로 ' + WEAPONS[i].name + ' 발사. 우클릭 드래그로 시점 회전';
  t.classList.add('show'); clearTimeout(tipTimer); tipTimer = setTimeout(() => t.classList.remove('show'), monk.on ? 3400 : 2400);
}
function setIf(el, prop, val, cache, key) { if (el && cache[key] !== val) { cache[key] = val; el.style[prop] = val; } }
const hud = { timer: $('#timer'), score: $('#score'), mult: $('#mult'), multTxt: $('#multTxt'), multBar: $('#multBar'), last: {} };
let shownSec = -1, shownMult = 0;
function stepHUD(dt) {
  for (const w of WEAPONS) if (G.cd[w.id] > 0) G.cd[w.id] = Math.max(0, G.cd[w.id] - dt);
  WEAPONS.forEach((w, i) => {
    const s = slots[i];
    setIf(s.cd, 'height', w.cd ? Math.round((G.cd[w.id] || 0) / w.cd * 100) + '%' : '0%', s.last, 'cd');
    if (w.id === 'cannon') { setIf(s.bar, 'width', Math.round(G.heat) + '%', s.last, 'bar'); setIf(s.bar, 'background', G.overheat ? '#ff6b4a' : '#ffd36b', s.last, 'bg'); }
    if (w.id === 'meteor') {
      setIf(s.bar, 'width', Math.round(G.meteor * 100) + '%', s.last, 'bar');
      const ready = G.meteor >= 1; if (s.last.ready !== ready) { s.last.ready = ready; s.b.classList.toggle('ready', ready); s.b.classList.toggle('empty', !ready); }
    }
  });
  if (!G.playing) return;
  if (G.live && !G.ended && G.mode === 'time') {
    G.left = Math.max(0, G.left - dt);
    if (G.left <= 0) endRound();
  }
  const sec = Math.ceil(G.left);
  if (sec !== shownSec && G.mode === 'time') {
    shownSec = sec; hud.timer.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    hud.timer.classList.toggle('low', G.live && sec <= 10 && sec > 0);
    if (G.live && sec <= 5 && sec > 0) sfxBeep(880, 0.06);
  }
  if (scoreDirty) { scoreDirty = false; const t = fmtNum(G.score); if (hud.score.textContent !== t) { hud.score.textContent = t; hud.score.classList.remove('bump'); void hud.score.offsetWidth; hud.score.classList.add('bump'); } }
  const m = mult();
  if (m !== shownMult) { shownMult = m; hud.mult.classList.toggle('on', m > 1); hud.multTxt.textContent = '연쇄 ×' + G.combo + '  점수 ' + m.toFixed(2).replace(/0$/, '') + '배'; }
  if (m > 1) setIf(hud.multBar, 'transform', 'scaleX(' + clamp(1 - (G.time - G.lastKill) / CHAIN, 0, 1).toFixed(3) + ')', hud.last, 'mb');
}

// ------------------------------------------------------------------ camera (orbit + WASD) and aiming
const mouse = { x: innerWidth / 2, y: innerHeight / 2, in: true };
const keys = {};
let leftDown = false, aimP = null, fireAcc = 0, camTween = null;
const TOUCH = matchMedia('(pointer: coarse)').matches;
if (TOUCH) document.body.classList.add('touch');
// every view looks across the campus toward N Seoul Tower (south-west), so Namsan and the tower stand behind the school.
// The look-at point sits a little above the ground, which tilts the view up enough to keep the tower in the frame.
const TOWER_XZ = new V3(-1040, 0, 780);
const START_B = new V3(CXc + 5, camGround(CXc, CZc), CZc - 5), START_BP = new V3(-90, camGround(-90, 60), 60);   // tall screens: aimed past the main quad, so the camera stands just outside the fence rather than over the open notch
const START_T = START_B.clone().add(new V3(0, 82, 0)), START_TP = START_BP.clone().add(new V3(0, 95, 0));
const startTarget = () => innerWidth / innerHeight < 1 ? START_TP : START_T;
// the camera stands back from a point on the ground; the view is aimed above that point (START_T), which tilts it up toward the tower
function towardTower(B, back, up) { const d = new V3(TOWER_XZ.x - B.x, 0, TOWER_XZ.z - B.z).normalize(); return B.clone().addScaledVector(d, -back).add(new V3(0, up, 0)); }
// tall phone screens: a wider lens, so the campus and the mountain behind it both fit
function fitFov() {
  const a = innerWidth / innerHeight, f = a < 1 ? clamp(45 + (1 - a) * 22, 45, 58) : 45;
  if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); updPScale(); }
}
fitFov(); window.addEventListener('resize', () => setTimeout(fitFov, 0));
function startView() {
  const a = innerWidth / innerHeight;
  if (a < 1) return towardTower(START_BP, 360, 215);
  return towardTower(START_B, 360, 175);
}
function menuView() { return towardTower(START_B, 420, 120); }
function tweenCam(p, t, dur) { camTween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p.clone(), t1: t.clone(), s: G.time, d: dur }; }
function cameraStep(dt) {
  if (camTween) {
    const k = clamp((G.time - camTween.s) / camTween.d, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(camTween.p0, camTween.p1, e); controls.target.lerpVectors(camTween.t0, camTween.t1, e);
    if (k >= 1) camTween = null;
  } else if (monk.on) monkStep(dt);
  else {
    const rIn = (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0);
    camBasis();
    const fx = camF.x, fz = camF.z, fl = Math.hypot(fx, fz) || 1, ux = fx / fl, uz = fz / fl;
    const fIn = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const sIn = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const dist = camera.position.distanceTo(controls.target), speed = clamp(dist * 0.6, 25, 300) * (keys.ShiftLeft || keys.ShiftRight ? 2.4 : 1);
    if (fIn || sIn) {
      const mx = (ux * fIn - uz * sIn) * speed * dt, mz = (uz * fIn + ux * sIn) * speed * dt;
      const tx = clamp(controls.target.x + mx, BX0 - 30, BX1 + 30), tz = clamp(controls.target.z + mz, BZ0 - 30, BZ1 + 30);
      camera.position.x += tx - controls.target.x; camera.position.z += tz - controls.target.z; controls.target.x = tx; controls.target.z = tz;
    }
    // panning may not wander off over the drop: the target stays over the campus
    const tx = clamp(controls.target.x, BX0 - 30, BX1 + 30), tz = clamp(controls.target.z, BZ0 - 30, BZ1 + 30);
    if (tx !== controls.target.x || tz !== controls.target.z) { camera.position.x += tx - controls.target.x; camera.position.z += tz - controls.target.z; controls.target.x = tx; controls.target.z = tz; }
    const ty = camGround(controls.target.x, controls.target.z), dy = (ty - controls.target.y) * Math.min(1, dt * 3);
    controls.target.y += dy; camera.position.y += dy;
    if (rIn) { _v.subVectors(camera.position, controls.target).applyAxisAngle(UP, -rIn * 1.3 * dt); camera.position.copy(controls.target).add(_v); }
  }
  controls.update();
  const floor = monk.on ? Math.max(roofTopAt(camera.position.x, camera.position.z), groundY(camera.position.x, camera.position.z)) + 1.2
    : Math.max(roofTopAt(camera.position.x, camera.position.z), groundY(camera.position.x, camera.position.z), BASEY + 10) + 4;
  if (camera.position.y < floor) { camera.position.y = floor; camera.lookAt(controls.target); }
  camera.updateMatrixWorld();
}
const RET = { cannon: 3.5, missile: 10, bolt: 8, rail: 12, meteor: 22 };
function aimStep() {
  const id = curId(), cr = $('#crosshair');
  if (!TOUCH) { cr.style.left = mouse.x + 'px'; cr.style.top = mouse.y + 'px'; }
  if (!id || G.ended || (TOUCH && !touches.size)) { if (!id || G.ended) aimP = null; reticle.visible = false; return; }
  aimP = aimAt(mouse.x, mouse.y);
  if (aimP) { reticle.visible = true; reticle.position.copy(aimP); reticle.position.y += 0.4; reticle.scale.setScalar(RET[id] || 4); }
  else reticle.visible = false;
}
function fireCannon() {
  if (G.overheat || !aimP) return;
  const o = gunOrigin(1.2), dir = new V3().subVectors(aimP, o).normalize(), spread = 0.006;
  dir.x += rand(-spread, spread); dir.y += rand(-spread, spread); dir.z += rand(-spread, spread); dir.normalize();
  const hit = aimFromRay(o.clone(), dir.clone()), end = hit || o.clone().addScaledVector(dir, 700);
  const tt = o.distanceTo(end) / 950;
  spark(o.x, o.y, o.z, dir.x * 950, dir.y * 950, dir.z * 950, tt, 0.24, 0.028, 3, 1, 0.82, 0.45, 0, 0);
  const mz = o.clone().addScaledVector(dir, 1.6); flash(mz, rand(2.6, 3.6), 0.05, GLOW_C); flash(mz, 1.2, 0.035, FLASH_C);
  emit(SMOKE, mz.x, mz.y, mz.z, dir.x * rand(3, 8) + rand(-1, 1), dir.y * rand(3, 8) + rand(0, 1.5), dir.z * rand(3, 8) + rand(-1, 1), rand(0.8, 1.6), 0.4, rand(1.8, 2.6), 0.8, 0.79, 0.76, 0.35, 2.5, -0.3, 0, 0.3);
  if (hit) pending.push({ at: G.time + tt, fn: () => explode(hit, { R: 3.6, power: 17, crater: true, craterR: 1.6, craterD: 0.55, heat: 0.35 }) });
  G.heat = Math.min(100, G.heat + 2.4); if (G.heat >= 100) { G.overheat = true; sysFeed('기관포 과열, 잠시 식히는 중'); }
  sfxCannon(); trauma = Math.max(trauma, 0.1);
}
function fireOnce() {
  const id = curId(); if (!id || !aimP || G.ended) return;
  if (id === 'missile') launchMissile(aimP);
  else if (id === 'meteor') { if (G.meteor < 1) { sfxClink(null); sysFeed('운석은 건물을 부술수록 충전됩니다'); return; } G.meteor = 0; launchMeteor(aimP, rand(3.6, 4.4), 24); }
  else if (id === 'bolt') strikeBolt(aimP);
  else if (id === 'rail') fireRail();
  G.cd[id] = WEAPONS[G.cur].cd || 0;
}
function handleFiring(dt) {
  const id = curId();
  if (id === 'cannon' && !G.ended) { if (leftDown) { fireAcc += dt; while (fireAcc >= 0.085) { fireAcc -= 0.085; fireCannon(); } } else fireAcc = Math.min(fireAcc, 0.085); }
  if (!(leftDown && id === 'cannon')) { G.heat = Math.max(0, G.heat - 32 * dt); if (G.overheat && G.heat < 35) G.overheat = false; }
  // missiles, bolts and the rail fire again by themselves while held, as soon as they are ready
  if (leftDown && id && id !== 'cannon' && id !== 'meteor' && !(G.cd[id] > 0)) fireOnce();
}

// input: with no weapon out the pointer belongs to the camera (OrbitControls); with one out, a press fires
canvas.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true; });
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') { if (e.target === canvas && touches.size === 1) { mouse.x = e.clientX; mouse.y = e.clientY; } return; }
  mouse.x = e.clientX; mouse.y = e.clientY;
});
function pressFire() {
  const id = curId(); if (!id || G.ended || !G.playing) return;
  leftDown = true; aimStep();
  if (id !== 'cannon' && !(G.cd[id] > 0)) fireOnce();
}
// a finger waits a moment before it fires: if a second one lands, this was a pinch and nothing should go off
const touches = new Set();
let touchFire = 0;
function cancelTouchFire() { clearTimeout(touchFire); touchFire = 0; }
function touchDown(e) {
  if (e.isPrimary) touches.clear();
  touches.add(e.pointerId);
  cancelTouchFire();
  if (touches.size > 1) { leftDown = false; return; }
  if (curId()) touchFire = setTimeout(() => { touchFire = 0; pressFire(); }, 70);
}
function touchUp(e, cancelled) {
  if (!touches.delete(e.pointerId)) return;
  if (cancelled) { cancelTouchFire(); leftDown = false; return; }
  if (touchFire) { cancelTouchFire(); pressFire(); if (curId() === 'cannon') fireCannon(); }
  if (!touches.size) leftDown = false;
}
window.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') touchUp(e, false); else if (e.button === 0) leftDown = false; });
window.addEventListener('pointercancel', (e) => { if (e.pointerType === 'touch') touchUp(e, true); });
canvas.addEventListener('pointerdown', (e) => {
  if (!G.playing) return; audioInit(); mouse.x = e.clientX; mouse.y = e.clientY;
  if (e.pointerType === 'touch') { touchDown(e); return; }
  if (curId() && e.button === 0) pressFire();
});
window.addEventListener('blur', () => { leftDown = false; cancelTouchFire(); touches.clear(); for (const k in keys) keys[k] = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  keys[e.code] = true;
  if (!G.playing) return;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  if (/^Digit[1-5]$/.test(e.code)) selectWeapon(Number(e.code[5]) - 1);
  else if (e.code === 'Digit6' || e.code === 'KeyF') setMonk(!monk.on);
  else if (e.code === 'Escape') selectWeapon(-1);
  else if (e.code === 'KeyP') capture();
  else if (e.code === 'KeyR' && !monk.on) tweenCam(startView(), startTarget(), 1.0);
  else if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// phones have no right button: a two-finger twist turns the view around the campus (the angle between the fingers drives the azimuth),
// while the same two fingers still pinch to zoom and drag to move
const tpos = new Map(); let twistA = null;
function twistAngle() { const [a, b] = [...tpos.values()]; return Math.atan2(b.y - a.y, b.x - a.x); }
canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; tpos.set(e.pointerId, { x: e.clientX, y: e.clientY }); twistA = tpos.size === 2 ? twistAngle() : null; });
window.addEventListener('pointermove', (e) => {
  const q = e.pointerType === 'touch' && tpos.get(e.pointerId); if (!q) return;
  q.x = e.clientX; q.y = e.clientY;
  if (tpos.size !== 2 || twistA == null) return;
  const a = twistAngle(); let d = a - twistA; twistA = a;
  if (monk.on || camTween || !(G.playing || angle.on)) return;
  d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > 0.6) return;
  _v.subVectors(camera.position, controls.target).applyAxisAngle(UP, d); camera.position.copy(controls.target).add(_v);
});
const twistEnd = (e) => { if (tpos.delete(e.pointerId)) twistA = tpos.size === 2 ? twistAngle() : null; };
window.addEventListener('pointerup', twistEnd); window.addEventListener('pointercancel', twistEnd);

// ------------------------------------------------------------------ 무자비 풀소유: a monk in grey robes walks the campus in third person.
// The weapons still fire the usual way (from the gun positions and out of the sky, at the point you aim at); only the viewpoint
// rides along with him. Phones get a stick on the left; the keyboard uses WASD.
const MONK_K = 1.25, MONK_HEAD = 1.2, MONK_WALK = 7, MONK_RUN = 13;
const monk = { on: false, pos: new V3(), yaw: 0, walkT: 0, spd: 0, mesh: null, parts: null, step: 0, joy: { id: null, x: 0, y: 0 } };
function buildMonk() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const std = (hex, r) => new THREE.MeshStandardMaterial({ color: lin(hex), roughness: r == null ? 0.85 : r, metalness: 0 });
  const robe = std('#8f928d'), kasa = std('#8a4724', 0.75), skin = std('#f0c9a2', 0.5), bead = std('#4a2b17', 0.4), shoe = std('#f3f2ec', 0.45), wood = std('#a0622c', 0.5);
  const ink = new THREE.MeshBasicMaterial({ color: 0x1c1410 });
  const add = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; (parent || body).add(o); return o; };
  // a little 동자승: big round head, short body, about 1.2 m tall
  add(new THREE.CylinderGeometry(0.16, 0.25, 0.42, 18), robe, 0, 0.27, 0);                      // robe
  add(new THREE.CylinderGeometry(0.15, 0.17, 0.26, 18), robe, 0, 0.6, 0);                       // upper body
  add(new THREE.CylinderGeometry(0.172, 0.182, 0.05, 18), kasa, 0, 0.49, 0);                    // sash at the waist
  const k = add(new THREE.CylinderGeometry(0.162, 0.176, 0.09, 18, 1, true), new THREE.MeshStandardMaterial({ color: lin('#8a4724'), roughness: 0.75, side: THREE.DoubleSide }), 0, 0.6, 0);
  k.rotation.z = 0.62;                                                                         // 가사 across the chest
  const head = add(new THREE.SphereGeometry(0.2, 22, 16), skin, 0, 0.9, 0); head.scale.set(1.05, 1, 1);
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.045, 8, 6), skin, s * 0.205, 0.89, 0);                       // ears
    const eye = add(new THREE.BoxGeometry(0.05, 0.013, 0.01), ink, s * 0.07, 0.92, 0.19);      // calm, closed eyes
    eye.rotation.z = s * -0.15;
    const ck = add(new THREE.SphereGeometry(0.032, 8, 6), std('#f2a5a0', 0.6), s * 0.115, 0.86, 0.165); ck.scale.set(1, 0.6, 0.4);   // rosy cheeks
  }
  const smile = add(new THREE.TorusGeometry(0.028, 0.006, 4, 10, Math.PI), ink, 0, 0.845, 0.192); smile.rotation.z = Math.PI;
  const beads = add(new THREE.TorusGeometry(0.13, 0.018, 6, 22), bead, 0, 0.71, 0.03); beads.rotation.x = Math.PI / 2 - 0.45;   // 염주
  const arms = [], feet = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * 0.18, 0.69, 0); body.add(a);
    const sl = add(new THREE.CylinderGeometry(0.05, 0.1, 0.3, 12), robe, 0, -0.15, 0, a); sl.rotation.z = s * 0.12;
    add(new THREE.SphereGeometry(0.045, 10, 8), skin, s * 0.02, -0.32, 0.01, a);
    if (s > 0) { const mk = add(new THREE.SphereGeometry(0.065, 12, 8), wood, 0.03, -0.38, 0.05, a); mk.scale.set(1, 0.8, 0.9); }   // 목탁
    arms.push(a);
    const f = add(new THREE.BoxGeometry(0.08, 0.06, 0.17), shoe, s * 0.075, 0.03, 0.03, g); feet.push(f);   // 고무신
  }
  g.scale.setScalar(MONK_K);
  monk.parts = { body, arms, feet };
  return g;
}
// open ground inside the fence: not over the drop, not inside a building that still stands
function monkFree(x, z) {
  if (!inCampusAt(x, z)) return false;
  const fi = fpAt(x, z); if (fi >= 0) { const S = fpStruct[fi]; if (S && !S.dead) return false; }
  return true;
}
function monkSpawn() {
  const c = aimAt(innerWidth / 2, innerHeight * 0.6) || controls.target;
  for (let r = 0; r < 260; r += 4) for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    if (monkFree(x, z) && monkFree(x + 3, z) && monkFree(x - 3, z) && monkFree(x, z + 3) && monkFree(x, z - 3)) return new V3(x, groundY(x, z), z);
  }
  return new V3(CXc, groundY(CXc, CZc), CZc);
}
function setMonk(on, instant) {
  if (on === monk.on) return;
  if (on && (!G.playing || G.ended)) return;
  monk.on = on; document.body.classList.toggle('monk', on); monkBtn.classList.toggle('sel', on);
  monk.joy.id = null; monk.joy.x = monk.joy.y = 0; joyKnob.style.transform = '';
  if (on) {
    camBasis();
    monk.pos.copy(monkSpawn()); monk.walkT = 0; monk.spd = 0;
    // face the most open way (leaning toward where the camera was looking), so the first view isn't a wall
    let bestS = -1, cy = Math.atan2(camF.x, camF.z); monk.yaw = cy;
    for (let k = 0; k < 16; k++) {
      const a = cy + k / 16 * Math.PI * 2; let r = 0;
      while (r < 80 && monkFree(monk.pos.x + Math.sin(a) * (r + 3), monk.pos.z + Math.cos(a) * (r + 3))) r += 3;
      const s = r * (1.2 + Math.cos(a - cy) * 0.4); if (s > bestS) { bestS = s; monk.yaw = a; }
    }
    if (!monk.mesh) monk.mesh = buildMonk();
    scene.add(monk.mesh); poseMonk(0);
    const head = monk.pos.clone().add(_v.set(0, MONK_HEAD, 0));
    playControls(true);
    tweenCam(head.clone().add(_v.set(-Math.sin(monk.yaw) * 7, 2.4, -Math.cos(monk.yaw) * 7)), head, 1.1);
    sfxMoktak(); banner('무자비 풀소유', '스님 시점으로 캠퍼스를 걸어 다닙니다');
  } else {
    if (monk.mesh) scene.remove(monk.mesh);
    playControls(G.playing);
    const B = new V3(monk.pos.x, camGround(monk.pos.x, monk.pos.z), monk.pos.z), P = towardTower(B, 320, 190);
    if (instant) { camTween = null; camera.position.copy(P); controls.target.copy(B); controls.update(); }
    else tweenCam(P, B, 1.0);
  }
  showTip();
}
function poseMonk(dt) {
  const m = monk.mesh, P = monk.parts; if (!m) return;
  m.position.copy(monk.pos); m.rotation.y = monk.yaw;
  const w = clamp(monk.spd / MONK_WALK, 0, 1.6), s = Math.sin(monk.walkT);
  P.body.position.y = Math.abs(s) * 0.035 * w; P.body.rotation.x = 0.06 * w; P.body.rotation.z = s * 0.06 * w;   // a toddling waddle
  P.arms[0].rotation.x = s * 0.6 * w; P.arms[1].rotation.x = -s * 0.6 * w;
  P.feet[0].position.z = 0.03 + s * 0.12 * w; P.feet[1].position.z = 0.03 - s * 0.12 * w;
  P.feet[0].position.y = 0.03 + Math.max(0, s) * 0.05 * w; P.feet[1].position.y = 0.03 + Math.max(0, -s) * 0.05 * w;
}
function monkStep(dt) {
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  if (monk.joy.id != null) { ix += monk.joy.x; iz -= monk.joy.y; }
  const mag = Math.min(1, Math.hypot(ix, iz)), ox = monk.pos.x, oz = monk.pos.z;
  if (mag > 0.08) {
    camBasis();
    const fl = Math.hypot(camF.x, camF.z) || 1, ux = camF.x / fl, uz = camF.z / fl, n = Math.hypot(ix, iz);
    const dx = (ux * iz - uz * ix) / n, dz = (uz * iz + ux * ix) / n;
    const run = keys.ShiftLeft || keys.ShiftRight || (monk.joy.id != null && mag > 0.9);
    const sp = (run ? MONK_RUN : MONK_WALK) * (monk.joy.id != null ? mag : 1) * dt;
    if (monkFree(monk.pos.x + dx * sp, monk.pos.z)) monk.pos.x += dx * sp;
    if (monkFree(monk.pos.x, monk.pos.z + dz * sp)) monk.pos.z += dz * sp;
    let d = Math.atan2(dx, dz) - monk.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); monk.yaw += d * Math.min(1, dt * 10);
  }
  const moved = Math.hypot(monk.pos.x - ox, monk.pos.z - oz);
  monk.spd = lerp(monk.spd, dt > 0 ? moved / dt : 0, Math.min(1, dt * 12)); monk.walkT += moved * 1.25 / MONK_K;
  const st = Math.floor(monk.walkT / Math.PI); if (st !== monk.step) { monk.step = st; if (moved > 0) sfxStep(monk.pos); }
  monk.pos.y = lerp(monk.pos.y, groundY(monk.pos.x, monk.pos.z), Math.min(1, dt * 12));
  poseMonk(dt);
  // the view rides along: target and camera move together by however far his head moved
  const hx = monk.pos.x - controls.target.x, hy = monk.pos.y + MONK_HEAD - controls.target.y, hz = monk.pos.z - controls.target.z;
  controls.target.x += hx; controls.target.y += hy; controls.target.z += hz; camera.position.x += hx; camera.position.y += hy; camera.position.z += hz;
  const rIn = (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0);
  if (rIn) { _v.subVectors(camera.position, controls.target).applyAxisAngle(UP, -rIn * 1.6 * dt); camera.position.copy(controls.target).add(_v); }
}
// a temple woodblock: two dry knocks
function sfxMoktak() {
  if (!voice(0.5, 2)) return;
  const out = place(null, false).node;
  for (const dt of [0, 0.2]) {
    const t = AC.currentTime + 0.01 + dt;
    chain(osc('sine', t, 0.14, 880, 700, 0.1), gEnv(t, 0.32, 0.001, 0.12), out);
    chain(osc('sine', t, 0.06, 1960), gEnv(t, 0.08, 0.001, 0.05), out);
    chain(noise(NB, t, 0.02), flt('bandpass', 2400, 3), gEnv(t, 0.2, 0.001, 0.02), out);
  }
}
// the dock button and the thumb stick
const MONK_ICON = '<svg viewBox="0 0 32 32"><path d="M5 31c1-7 5-10 11-10s10 3 11 10z" fill="#9a9d98"/><path d="M9.5 23.5 19 31h-4l-7.5-6z" fill="#a0542a"/><circle cx="16" cy="12.5" r="8" fill="#f0c8a0"/><circle cx="8.2" cy="13" r="1.7" fill="#e2b086"/><circle cx="23.8" cy="13" r="1.7" fill="#e2b086"/><path d="M12.3 13h2.4M17.3 13h2.4" stroke="#2a201a" stroke-width="1.5" stroke-linecap="round"/><path d="M13.6 16.4q2.4 1.8 4.8 0" stroke="#2a201a" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M9.5 21q6.5 4.5 13 0" stroke="#5a3418" stroke-width="2.2" stroke-dasharray="1.7 1.1" fill="none"/></svg>';
const monkBtn = document.createElement('button');
monkBtn.className = 'slot monkslot'; monkBtn.setAttribute('aria-label', '무자비 풀소유');
monkBtn.innerHTML = '<span class="key">6</span><span class="ic">' + MONK_ICON + '</span><span class="nm">무자비<br>풀소유</span>';
monkBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); audioInit(); setMonk(!monk.on); });
$('#dock').appendChild(monkBtn);
{ const d = document.createElement('div'); d.innerHTML = MONK_ICON + '풀소유'; $('#weapIntro').appendChild(d); }
const joyEl = $('#joy'), joyKnob = joyEl.querySelector('i');
function joyMove(e) {
  const r = joyEl.getBoundingClientRect(), R = r.width / 2;
  let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  monk.joy.x = x; monk.joy.y = y; joyKnob.style.transform = 'translate(' + (x * R * 0.6).toFixed(1) + 'px,' + (y * R * 0.6).toFixed(1) + 'px)';
}
joyEl.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audioInit(); monk.joy.id = e.pointerId; try { joyEl.setPointerCapture(e.pointerId); } catch (er) {} joyMove(e); });
joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === monk.joy.id) joyMove(e); });
const joyUp = (e) => { if (e.pointerId !== monk.joy.id) return; monk.joy.id = null; monk.joy.x = monk.joy.y = 0; joyKnob.style.transform = ''; };
joyEl.addEventListener('pointerup', joyUp); joyEl.addEventListener('pointercancel', joyUp); joyEl.addEventListener('lostpointercapture', joyUp);

// ------------------------------------------------------------------ elephants on Namsan: big round cartoon elephants ambling over the slope that
// faces the campus. Any weapon can knock one flying; it comes back a little later somewhere else. They score nothing (only the tower does).
const NS_C = { x: -1000, z: 805 }, ELE_S = 22, ELE_N = 4;
const ELE_A = Math.atan2(CZc - NS_C.z, CXc - NS_C.x);
const eleMat = new THREE.MeshLambertMaterial({ vertexColors: true });
function partGeo(geo, m4, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo; g.applyMatrix4(m4);
  const n = g.attributes.position.count, c = new Float32Array(n * 3), col = lin(hex);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function mergeGeos(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
  for (const g of list) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.computeBoundingSphere(); return out;
}
const M4 = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new V3(sx, sy == null ? sx : sy, sz == null ? sx : sz));
// elephants that walk upright like people. Each is three geometries: the body with head, ears, trunk and face baked together,
// one leg (drawn twice) and one arm (drawn twice), so the limbs can swing
function eleGeos(hex, earHex, bellyHex) {
  const S = () => new THREE.SphereGeometry(1, 18, 12), parts = [];
  parts.push(partGeo(S(), M4(0, 0.56, 0, 0.22, 0.27, 0.19), hex));                                  // round upright body
  parts.push(partGeo(S(), M4(0, 0.52, 0.085, 0.15, 0.18, 0.11), bellyHex));                         // pale belly
  parts.push(partGeo(S(), M4(0, 0.93, 0.03, 0.23, 0.21, 0.2), hex));                                 // head
  for (const s of [-1, 1]) {
    parts.push(partGeo(S(), M4(s * 0.25, 0.95, -0.02, 0.17, 0.19, 0.035), hex));                     // big round ears
    parts.push(partGeo(S(), M4(s * 0.25, 0.95, 0.008, 0.12, 0.14, 0.03), earHex));                    // pink inside
    parts.push(partGeo(S(), M4(s * 0.085, 0.97, 0.2, 0.034), '#1e1a1c'));                             // eyes
    parts.push(partGeo(S(), M4(s * 0.08, 0.982, 0.228, 0.011), '#ffffff'));                           // eye shine
    parts.push(partGeo(S(), M4(s * 0.14, 0.89, 0.17, 0.04, 0.028, 0.02), '#f2a8b2'));                 // cheeks
    parts.push(partGeo(new THREE.ConeGeometry(0.018, 0.08, 8), M4(s * 0.06, 0.82, 0.2, 1, 1, 1, 2.0, 0, 0), '#f4f0e6'));   // tusks
  }
  parts.push(partGeo(new THREE.CylinderGeometry(0.04, 0.06, 0.22, 12), M4(0, 0.8, 0.23, 1, 1, 1, 0.3, 0, 0), hex));   // trunk
  parts.push(partGeo(S(), M4(0, 0.69, 0.265, 0.045, 0.035, 0.045), hex));                            // trunk tip
  parts.push(partGeo(new THREE.CylinderGeometry(0.01, 0.014, 0.14, 6), M4(0, 0.38, -0.2, 1, 1, 1, -0.7, 0, 0), hex));   // tail
  parts.push(partGeo(S(), M4(0, 0.33, -0.25, 0.025), '#55505a'));
  const leg = mergeGeos([partGeo(new THREE.CylinderGeometry(0.075, 0.08, 0.3, 12), M4(0, -0.15, 0, 1), hex), partGeo(S(), M4(0, -0.3, 0.03, 0.09, 0.045, 0.11), '#e2ddd3')]);
  const arm = mergeGeos([partGeo(new THREE.CylinderGeometry(0.05, 0.055, 0.26, 10), M4(0, -0.13, 0, 1), hex), partGeo(S(), M4(0, -0.27, 0, 0.06), hex)]);
  return { body: mergeGeos(parts), leg, arm };
}
const ELE_KINDS = [eleGeos('#a7b2c1', '#f0b6c0', '#dfe4ea'), eleGeos('#9aa3ad', '#efb0ba', '#d8dbe0'), eleGeos('#efc0cc', '#f7d9e0', '#fbe6ec')];
const eles = [];
function eleOk(x, z) {
  const dx = x - NS_C.x, dz = z - NS_C.z, r = Math.hypot(dx, dz);
  let a = Math.atan2(dz, dx) - ELE_A; a = Math.atan2(Math.sin(a), Math.cos(a));
  return r > 120 && r < 680 && Math.abs(a) < 1.2 && V.namsanSurf(x, z) > V.CLOUD_Y + 30 && Math.hypot(x - TOWER_XZ.x, z - TOWER_XZ.z) > 75;
}
function eleSpot() {
  for (let k = 0; k < 80; k++) { const a = ELE_A + rand(-1.1, 1.1), r = rand(150, 600), x = NS_C.x + Math.cos(a) * r, z = NS_C.z + Math.sin(a) * r; if (eleOk(x, z)) return new V3(x, V.namsanSurf(x, z), z); }
  const x = NS_C.x + Math.cos(ELE_A) * 300, z = NS_C.z + Math.sin(ELE_A) * 300; return new V3(x, V.namsanSurf(x, z), z);
}
for (let i = 0; i < ELE_N; i++) {
  const K = ELE_KINDS[i === 2 ? 2 : i % 2], g = new THREE.Group();
  g.add(new THREE.Mesh(K.body, eleMat));
  const legs = [-1, 1].map((s) => { const l = new THREE.Mesh(K.leg, eleMat); l.position.set(s * 0.1, 0.32, 0); g.add(l); return l; });
  const arms = [-1, 1].map((s) => { const a = new THREE.Mesh(K.arm, eleMat); a.position.set(s * 0.22, 0.7, 0); a.rotation.z = s * 0.2; g.add(a); return a; });
  const sc = ELE_S * rand(0.9, 1.1), p = eleSpot(); g.position.copy(p); g.scale.setScalar(sc); scene.add(g);
  eles.push({ g, legs, arms, sc, h: rand(0, 6.28), sp: rand(4, 6), ph: rand(0, 6), turn: 0, state: 'walk', t: 0, vel: new V3(), spin: new V3(), back: 0 });
}
function stepElephants(dt) {
  for (const e of eles) {
    e.t += dt;
    if (e.state === 'walk' || e.state === 'pop') {
      if (e.state === 'pop') { const k = Math.min(1, e.t / 0.7); e.g.scale.setScalar(e.sc * (k < 1 ? 1 - Math.pow(1 - k, 3) * 1.0 + Math.sin(k * Math.PI) * 0.15 : 1)); if (k >= 1) { e.state = 'walk'; e.g.scale.setScalar(e.sc); } }
      e.turn -= dt; if (e.turn < 0) { e.turn = rand(2, 6); e.dh = rand(-0.5, 0.5); }
      e.h += (e.dh || 0) * dt;
      const s = e.sp * dt, nx = e.g.position.x + Math.sin(e.h) * s, nz = e.g.position.z + Math.cos(e.h) * s;
      let crowd = null;                                                // keep out of each other's way
      for (const o of eles) if (o !== e && o.state !== 'gone' && Math.hypot(o.g.position.x - nx, o.g.position.z - nz) < (o.sc + e.sc) * 0.75 && Math.hypot(o.g.position.x - nx, o.g.position.z - nz) < Math.hypot(o.g.position.x - e.g.position.x, o.g.position.z - e.g.position.z)) crowd = o;
      if (crowd) { e.h = Math.atan2(e.g.position.x - crowd.g.position.x, e.g.position.z - crowd.g.position.z) + rand(-0.5, 0.5); e.turn = rand(2, 4); e.dh = 0; }
      else if (eleOk(nx, nz)) { e.g.position.x = nx; e.g.position.z = nz; }
      else { const a = Math.atan2(NS_C.x + Math.cos(ELE_A) * 350 - e.g.position.x, NS_C.z + Math.sin(ELE_A) * 350 - e.g.position.z); e.h = a + rand(-0.6, 0.6); }   // turn back toward the middle of the slope
      e.g.position.y = V.namsanSurf(e.g.position.x, e.g.position.z) - 1.5;
      let d = e.h - e.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); e.g.rotation.y += d * Math.min(1, dt * 2);
      e.ph += dt * e.sp * 6.28 / (e.sc * 0.6);                        // two steps per cycle
      const sw = Math.sin(e.ph) * 0.55;
      e.legs[0].rotation.x = sw; e.legs[1].rotation.x = -sw; e.arms[0].rotation.x = -sw * 0.8; e.arms[1].rotation.x = sw * 0.8;
      const body = e.g.children[0]; body.position.y = Math.abs(Math.cos(e.ph)) * 0.03; body.rotation.z = Math.sin(e.ph) * 0.06;   // a side-to-side waddle
    } else if (e.state === 'fly') {
      e.vel.y -= 55 * dt; e.g.position.addScaledVector(e.vel, dt);
      e.g.rotation.x += e.spin.x * dt; e.g.rotation.y += e.spin.y * dt; e.g.rotation.z += e.spin.z * dt;
      if (e.t > 2.4) e.g.scale.setScalar(e.sc * Math.max(0.001, 1 - (e.t - 2.4) / 0.5));
      if (e.t > 2.9) { e.state = 'gone'; e.g.visible = false; e.back = G.time + rand(4, 8); }
    } else if (e.state === 'gone' && G.time > e.back) {
      e.g.position.copy(eleSpot()); e.g.rotation.set(0, rand(0, 6.28), 0); e.h = e.g.rotation.y;
      e.g.visible = true; e.g.scale.setScalar(0.001); e.state = 'pop'; e.t = 0;
    }
  }
}
const _ec = new V3();
function hitElephants(p, R) {
  for (const e of eles) {
    if (e.state !== 'walk' && e.state !== 'pop') continue;
    _ec.copy(e.g.position); _ec.y += e.sc * 0.6;
    if (_ec.distanceTo(p) > R + e.sc * 0.55) continue;
    e.state = 'fly'; e.t = 0;
    _v2.subVectors(_ec, p); _v2.y = 0; if (_v2.lengthSq() < 1) _v2.set(rand(-1, 1), 0, rand(-1, 1)); _v2.normalize();
    e.vel.copy(_v2).multiplyScalar(rand(30, 45)); e.vel.y = rand(75, 100); e.spin.set(rand(-3, 3), rand(-4, 4), rand(-3, 3));
    popup('코끼리 명중!', _ec.clone().add(_v2.set(0, e.sc * 0.7, 0)), 'big');
    G.eleHits = (G.eleHits || 0) + 1; sfxTrumpet();
  }
}
// rays can stop on an elephant (a sphere around its body), so you can aim straight at one
function rayEle(o, d, maxD) {
  let best = maxD, hit = null;
  for (const e of eles) {
    if (e.state !== 'walk' && e.state !== 'pop') continue;
    _ec.copy(e.g.position); _ec.y += e.sc * 0.6;
    const r = e.sc * 0.5, ox = o.x - _ec.x, oy = o.y - _ec.y, oz = o.z - _ec.z, b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc); if (t > 0 && t < best) { best = t; hit = e; }
  }
  if (!hit) return null;
  const p = new V3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best); p.ele = hit; return p;
}
// a short trumpet, a little indignant
function sfxTrumpet() {
  if (!voice(0.9, 1)) return;
  const t = AC.currentTime + 0.02, out = place(null, false, rand(-0.5, -0.2)).node;
  for (const [type, m, v, bp] of [['sawtooth', 1, 0.2, 1100], ['square', 2.01, 0.05, 2400]]) {
    const o = osc(type, t, 0.85, 360 * m); o.frequency.linearRampToValueAtTime(700 * m, t + 0.12); o.frequency.linearRampToValueAtTime(600 * m, t + 0.55); o.frequency.linearRampToValueAtTime(400 * m, t + 0.8);
    const vib = osc('sine', t, 0.85, 22), vg = AC.createGain(); vg.gain.value = 18 * m; vib.connect(vg); vg.connect(o.frequency);
    chain(o, flt('bandpass', bp, 1.6), gEnv(t, v, 0.04, 0.55, 0.2), out);
  }
}

// ------------------------------------------------------------------ round flow: menu → round (60 s) → result with ranking
const MB_FREE = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
const MB_ARMED = { LEFT: -1, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };   // with a weapon out the left button fires; right-drag still turns the view
const MB_VIEW = Object.assign({}, controls.mouseButtons);
function applyControlMode() {
  const id = curId();
  document.body.classList.toggle('armed', !!id && G.playing);
  controls.touches.ONE = id && G.playing ? null : monk.on ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN;
  controls.touches.TWO = monk.on ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN;
  controls.enablePan = !monk.on;
  if (!G.playing) { controls.mouseButtons = MB_VIEW; return; }
  controls.mouseButtons = id ? MB_ARMED : MB_FREE;
}
function playControls(on) {
  controls.enabled = true; controls.autoRotate = !on; controls.autoRotateSpeed = 0.5;
  controls.screenSpacePanning = false;
  if (on && monk.on) { controls.minDistance = 3; controls.maxDistance = 60; controls.maxPolarAngle = Math.PI * 0.5; }
  else if (on) { controls.minDistance = 25; controls.maxDistance = 900; controls.maxPolarAngle = Math.PI * 0.46; }
  applyControlMode();
}
const $start = $('#start'), $result = $('#result'), $rank = $('#rank');
function show(el, on) { el.classList.toggle('hide', !on); }
// a second round needs an untouched campus: craters, scorch and broken buildings can't be put back cheaply, so the page reloads
// and goes straight into the round (the files come from the browser cache)
function start(mode) {
  mode = mode === 'free' ? 'free' : 'time';
  if (G.round) { try { sessionStorage.setItem('campusSmashAuto', mode); } catch (e) {} location.reload(); return; }
  audioInit();
  G.mode = mode; document.body.classList.toggle('free', mode === 'free');
  Object.assign(G, { playing: true, live: false, ended: false, quit: false, left: ROUND, score: 0, kills: 0, dmg: 0, combo: 0, maxCombo: 0, lastKill: -99, heat: 0, overheat: false, meteor: 0.6, tok: null, cd: {} });
  G.round = (G.round || 0) + 1; const round = G.round;
  scoreDirty = true; shownSec = -1; shownMult = 0; $('#feed').innerHTML = '';
  document.body.classList.remove('menu', 'result'); document.body.classList.add('playing');
  show($start, false); show($result, false); show($rank, false);
  playControls(true); tweenCam(startView(), startTarget(), 1.3);
  selectWeapon(TOUCH ? 1 : 0, true);
  quitArm = 0; $('#quitBtn').textContent = '그만';
  if (mode === 'time') window.RANK && RANK.start().then((t) => { if (G.round === round) G.tok = t; }).catch(() => {});
  if (mode === 'free') { hud.timer.textContent = '자유'; $('#quitBtn').textContent = '끝내기'; }
  banner('시작!', mode === 'free' ? '시간 제한 없이 마음껏' : '1분 동안 최대한 부수세요');
  setTimeout(() => { if (G.round === round && G.playing) { G.live = true; showTip(); } }, 1300);
  try { gtag('event', 'round_start', { mode }); } catch (e) {}
}
function endRound() {
  if (G.ended) return;
  G.ended = true; G.live = false; G.left = 0; leftDown = false; reticle.visible = false;
  banner(G.mode === 'free' ? '끝!' : G.quit ? '그만!' : '끝!', fmtNum(G.score) + '점');
  sfxChime();
  const round = G.round;
  setTimeout(() => { if (G.round === round) finish(); }, G.quit ? 900 : GRACE * 1000);
}
let quitArm = 0;
$('#quitBtn').addEventListener('click', () => {
  if (!G.playing || G.ended) return;
  if (G.mode === 'free') { G.quit = true; endRound(); return; }
  if (!quitArm) { quitArm = setTimeout(() => { quitArm = 0; $('#quitBtn').textContent = '그만'; }, 2200); $('#quitBtn').textContent = '정말 그만?'; return; }
  clearTimeout(quitArm); quitArm = 0; G.quit = true; endRound();
});
const res = { data: null, img: null, blob: null };
function finish() {
  const final = { score: Math.round(G.score), kills: G.kills, combo: G.maxCombo };
  selectWeapon(-1, true);
  // a still of the wreckage, taken from where the player left the camera
  const c = grabView(); res.blob = null;
  if (monk.on) setMonk(false, true);
  if (c) { brandShot(c, final); c.toBlob((b) => { res.blob = b; if (res.img) URL.revokeObjectURL(res.img); res.img = URL.createObjectURL(b); $('#shotImg').src = res.img; }, 'image/jpeg', 0.9); }
  G.playing = false;
  document.body.classList.remove('playing', 'armed'); document.body.classList.add('result');
  playControls(false); controls.autoRotate = true;
  $('#resScore').textContent = fmtNum(final.score);
  $('#resKills').textContent = final.kills + '/' + TOTAL;
  $('#resCombo').textContent = final.combo > 1 ? '×' + final.combo : '없음';
  $('#resName').textContent = (RANK.me.name || '') + (G.mode === 'free' ? ' 자유 파괴 점수' : ' 타임어택 점수');
  $('#resBest').hidden = true; $('#resRank').textContent = '집계 중';
  $('#resNote').textContent = '';
  $('#resList').innerHTML = '<li class="empty">랭킹을 불러오는 중</li>';
  show($result, true); $result.scrollTop = 0;
  try { gtag('event', 'round_end', { value: final.score }); } catch (e) {}
  if (G.mode === 'free') { $('#resRank').textContent = '랭킹 제외'; $('#resNote').textContent = '자유 파괴는 랭킹에 올라가지 않습니다. 랭킹은 타임어택만 집계합니다.'; loadBoard(true); return; }
  if (G.quit) { $('#resRank').textContent = '미집계'; $('#resNote').textContent = '1분을 다 채운 판만 랭킹에 올라갑니다.'; loadBoard(true); return; }
  if (!G.tok) { $('#resRank').textContent = '미집계'; $('#resNote').textContent = '랭킹 서버에 연결하지 못해 이번 판은 기록되지 않았습니다.'; loadBoard(true); return; }
  RANK.submit(G.tok, final).then((d) => {
    res.data = d;
    if (d.me) $('#resRank').textContent = d.me.rank + '위';
    $('#resBest').hidden = !(final.score > (d.prevBest || 0));
    $('#resNote').textContent = d.me ? '참가자 ' + fmtNum(d.total) + '명 중 ' + d.me.rank + '위' + (d.me.best > final.score ? ', 내 최고 ' + fmtNum(d.me.best) + '점' : '') : '';
    renderBoard($('#resList'), d);
  }).catch((e) => {
    $('#resRank').textContent = '미집계';
    $('#resNote').textContent = e.code === 'name' ? '닉네임에 쓸 수 없는 말이 있어 랭킹에 올리지 못했습니다. 닉네임을 바꿔 주세요.' : e.code === 'rate' ? '짧은 시간에 너무 많이 제출되어 잠시 기록되지 않습니다.' : '랭킹 서버에 연결하지 못해 이번 판은 기록되지 않았습니다.';
    loadBoard(true);
  });
}
function loadBoard(intoResult) {
  return RANK.board().then((d) => { res.data = d; if (intoResult) renderBoard($('#resList'), d); renderTeaser(d); if (!$rank.classList.contains('hide')) renderBoard($('#rankUl'), d); return d; })
    .catch(() => { const t = '<li class="empty">랭킹을 불러오지 못했습니다</li>'; if (intoResult) $('#resList').innerHTML = t; $('#rankUl').innerHTML = t; $('#teaserBody').textContent = '랭킹 서버에 연결하지 못했습니다'; });
}
function renderBoard(ul, d) {
  if (!d) return;
  let html = '';
  d.players.forEach((p, i) => { html += '<li class="' + (p.me ? 'me' : '') + '"><span class="rk">' + (i + 1) + '</span><span class="who"><b>' + esc(p.name) + '</b></span><span class="sc num">' + fmtNum(p.best) + '</span></li>'; });
  if (d.me && !d.players.some((p) => p.me)) html += '<li class="me"><span class="rk">' + d.me.rank + '</span><span class="who"><b>' + esc(d.me.name) + '</b></span><span class="sc num">' + fmtNum(d.me.best) + '</span></li>';
  if (!d.players.length) html = '<li class="empty">아직 기록이 없습니다. 첫 번째 1위가 되어 보세요</li>';
  ul.innerHTML = html;
}
function renderTeaser(d) {
  const top = d.players.slice(0, 3);
  $('#teaserBody').innerHTML = top.length ? top.map((x, i) => (i + 1) + '위 <b>' + esc(x.name) + '</b> ' + fmtNum(x.best) + '점').join('<br>') : '아직 1위가 없습니다. 지금 시작하면 바로 1위';
}
$('#openRank').addEventListener('click', () => { show($rank, true); $('#rankUl').innerHTML = '<li class="empty">불러오는 중</li>'; if (res.data) renderBoard($('#rankUl'), res.data); loadBoard(false); });
$('#rankClose').addEventListener('click', () => show($rank, false));
$rank.addEventListener('click', (e) => { if (e.target === $rank) show($rank, false); });

// entry form: a nickname, remembered in this browser
if (RANK.me.name) $('#nick').value = RANK.me.name;
function tryStart(mode) {
  const name = $('#nick').value.normalize('NFC').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim(), err = $('#formErr');
  if (!name) { err.textContent = '닉네임을 적어 주세요 (한글, 영문, 숫자 10자 이내)'; $('#nick').focus(); return; }
  err.textContent = ''; $('#nick').value = name; RANK.setMe(name);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  start(mode);
}
$('#btnStart').addEventListener('click', () => tryStart('time'));
$('#btnFree').addEventListener('click', () => tryStart('free'));
$('#nick').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tryStart('time'); } });
$('#btnAgain').addEventListener('click', () => start(G.mode));
loadBoard(false);
let autoStart = false;
try { autoStart = sessionStorage.getItem('campusSmashAuto') || false; sessionStorage.removeItem('campusSmashAuto'); } catch (e) {}

function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : MASTER_V; if (muted) for (const L of loops.slice()) stopLoop(L); $('#muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('#muteBtn').addEventListener('click', toggleMute);

// ------------------------------------------------------------------ result picture and sharing
const SITE_URL = 'https://elliott-json-park.github.io/campus-smash/';
const canShareFile = (f) => TOUCH && !!navigator.canShare && navigator.canShare({ files: [f] });
function grabView() {
  // the drawing buffer doesn't outlive this task, so render and copy back to back, at more than the adaptive live resolution
  const pr = renderer.getPixelRatio(), rv = reticle.visible;
  reticle.visible = false;
  renderer.setPixelRatio(clamp(1600 / Math.max(innerWidth, innerHeight), pr, 2)); updPScale();
  const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
  const x = c.getContext('2d');
  const copy = () => { renderer.render(scene, camera); x.drawImage(canvas, 0, 0); return x.getImageData(c.width >> 1, c.height >> 1, 1, 1).data.slice(0, 3).some(Boolean); };
  const ok = copy() || copy();
  reticle.visible = rv;
  renderer.setPixelRatio(pr); updPScale();
  renderer.render(scene, camera);
  if (!ok) return null;
  // the result card shows a 16:10 crop: cut it here so the saved picture matches
  const W = c.width, H = c.height, want = 16 / 10;
  let cw = W, ch = H; if (W / H > want) cw = Math.round(H * want); else ch = Math.round(W / want);
  const o = document.createElement('canvas'); o.width = cw; o.height = ch;
  o.getContext('2d').drawImage(c, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, cw, ch);
  return o;
}
function brandShot(c, r) {
  r = r || {};
  const x = c.getContext('2d'), W = c.width, H = c.height, u = Math.min(W, H) / 100, m = 5 * u;
  const font = (w, s) => w + ' ' + s + 'px Pretendard, "Apple SD Gothic Neo", sans-serif';
  const g = x.createLinearGradient(0, H - 36 * u, 0, H); g.addColorStop(0, 'rgba(10,12,18,0)'); g.addColorStop(1, 'rgba(10,12,18,.82)');
  x.fillStyle = g; x.fillRect(0, H - 36 * u, W, 36 * u);
  x.textBaseline = 'alphabetic'; x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = u;
  x.font = font(900, 7.5 * u); x.fillStyle = '#fff'; x.fillText(fmtNum(r.score) + '점', m, H - 15 * u);
  x.font = font(700, 3.8 * u); x.fillStyle = '#ffd36b'; x.fillText((RANK.me.name || '') + ', 건물 ' + (r.kills || 0) + '채 붕괴' + (G.mode === 'free' ? ', 자유 파괴' : ''), m, H - 9 * u);
  x.font = font(800, 3.4 * u); x.textAlign = 'right'; x.fillStyle = '#fff'; x.fillText('캠퍼스 부수기', W - m, H - 9 * u);
  x.font = font(600, 2.7 * u); x.fillStyle = 'rgba(255,255,255,.75)'; x.fillText(SITE_URL.replace(/^https:\/\/|\/$/g, ''), W - m, H - 4.6 * u);
  x.textAlign = 'left';
}
const shareText = () => {
  const d = res.data, rk = G.mode === 'time' && d && d.me ? ' 지금 ' + d.me.rank + '위,' : '';
  return '캠퍼스 부수기 ' + (G.mode === 'free' ? '자유 파괴로 ' : '1분 만에 ') + fmtNum(G.score) + '점!' + rk + ' 나 이겨 봐 ';
};
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch (e) {}
  const t = document.createElement('textarea'); t.value = s; t.style.cssText = 'position:fixed;left:0;top:0;opacity:0;user-select:text;-webkit-user-select:text';
  document.body.appendChild(t); t.select(); t.setSelectionRange(0, s.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
  t.remove(); return ok;
}
const note = (t) => { $('#resNote').textContent = t; };
// the picture viewer: a still with save and send; "다시 찍기" goes back to framing when it came from the angle mode
const shot = { open: false, url: '', blob: null, from: '' };
function openShot(c, from) {
  shot.from = from; shot.open = true;
  $('#shotAgain').hidden = from !== 'angle';
  $('#shotTip').textContent = '';
  c.toBlob((b) => {
    if (!shot.open) return;
    shot.blob = b; if (shot.url) URL.revokeObjectURL(shot.url); shot.url = URL.createObjectURL(b);
    $('#shotPic').src = shot.url; $('#shotSend').hidden = !(TOUCH && navigator.canShare && navigator.canShare({ files: [new File([b], 'a.jpg', { type: 'image/jpeg' })] }));
    $('#shotTip').textContent = TOUCH ? '저장이 안 되면 사진을 길게 눌러 저장하세요' : '';
    show($('#shot'), true);
  }, 'image/jpeg', 0.92);
}
function closeShot(again) {
  shot.open = false; show($('#shot'), false);
  if (shot.from === 'angle') { if (again) return; endAngle(); }
}
$('#shotClose').addEventListener('click', () => closeShot(false));
$('#shotAgain').addEventListener('click', () => closeShot(true));
$('#shotSave').addEventListener('click', () => { if (!shot.url) return; const a = document.createElement('a'); a.href = shot.url; a.download = 'campus-smash-' + Date.now() + '.jpg'; document.body.appendChild(a); a.click(); a.remove(); $('#shotTip').textContent = '사진을 저장했습니다'; });
$('#shotSend').addEventListener('click', async () => {
  if (!shot.blob) return;
  try { await navigator.share({ files: [new File([shot.blob], 'campus-smash.jpg', { type: 'image/jpeg' })], title: '캠퍼스 부수기', text: shareText() + SITE_URL }); }
  catch (e) { if (e.name !== 'AbortError') $('#shotTip').textContent = '보내지 못했습니다. 사진을 저장해서 보내 주세요'; }
});
// in the round: the 📷 button (or P) keeps the current view as a picture; the round keeps running
function capture() {
  if (!G.playing || shot.open) return;
  const c = grabView(); if (!c) return;
  brandShot(c, { score: Math.round(G.score), kills: G.kills });
  sfxBeep(1500, 0.05); const fl = $('#flashFx'); fl.style.transition = 'none'; fl.style.opacity = '0.7'; requestAnimationFrame(() => { fl.style.transition = 'opacity .4s'; fl.style.opacity = '0'; });
  openShot(c, 'live');
}
$('#capBtn').addEventListener('click', (e) => { e.stopPropagation(); capture(); });
// 자랑하기: the result card steps aside, the camera is free, the player frames the wreckage and presses the shutter
const angle = { on: false, p: new V3(), t: new V3() };
function startAngle() {
  angle.on = true; angle.p.copy(camera.position); angle.t.copy(controls.target);
  controls.autoRotate = false; controls.enabled = true; controls.mouseButtons = MB_FREE; controls.touches.ONE = THREE.TOUCH.ROTATE; controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.minDistance = 20; controls.maxDistance = 1400; controls.maxPolarAngle = Math.PI * 0.49;
  show($result, false); document.body.classList.add('angle');
  $('#angleHint').textContent = TOUCH ? '한 손가락으로 돌리고, 두 손가락으로 옮기고 확대해 앵글을 잡으세요' : '드래그로 돌리고, 우클릭 드래그로 옮기고, 휠로 확대해 앵글을 잡으세요';
}
function endAngle() {
  angle.on = false; document.body.classList.remove('angle'); show($result, true);
  controls.touches.ONE = THREE.TOUCH.PAN; controls.autoRotate = true;
}
function takeAngle() {
  const c = grabView(); if (!c) { $('#angleHint').textContent = '찍지 못했습니다. 다시 눌러 주세요'; return; }
  brandShot(c, { score: Math.round(G.score), kills: G.kills }); sfxBeep(1500, 0.05);
  openShot(c, 'angle');
}
$('#btnBrag').addEventListener('click', startAngle);
$('#angleCancel').addEventListener('click', endAngle);
$('#angleTake').addEventListener('click', takeAngle);
// 공유하기: the link, with a line about the score
async function shareLink() {
  const text = shareText();
  try { gtag('event', 'share'); } catch (e) {}
  if (TOUCH && navigator.share) {
    try { await navigator.share({ title: '캠퍼스 부수기', text, url: SITE_URL }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  if (await copyText(text + SITE_URL)) note('링크와 자랑 문구를 복사했습니다. 단톡방에 붙여넣어 보세요');
  else note('친구에게 이 주소를 보내세요: ' + SITE_URL);
}
$('#btnShare').addEventListener('click', shareLink);
$('#shareStart').addEventListener('click', async () => {
  if (TOUCH && navigator.share) { try { await navigator.share({ title: '캠퍼스 부수기', text: '1분 동안 캠퍼스를 부수는 게임, 같이 하자 ', url: SITE_URL }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  $('#formErr').textContent = (await copyText(SITE_URL)) ? '링크를 복사했습니다' : SITE_URL;
});

// phones drop the GPU context when memory runs short or the page sits in the background; three.js rebuilds from the CPU copies once it returns
let glLostTimer = 0;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); leftDown = false; cancelTouchFire();
  $('#loadTxt').textContent = '화면을 되살리는 중'; $('#reloadBtn').hidden = true; $('#loading').classList.add('show');
  clearTimeout(glLostTimer);
  glLostTimer = setTimeout(() => { $('#loadTxt').textContent = '화면이 끊겼습니다'; $('#reloadBtn').hidden = false; }, 6000);
});
canvas.addEventListener('webglcontextrestored', () => {
  clearTimeout(glLostTimer); $('#loading').classList.remove('show');
  renderer.shadowMap.needsUpdate = true; SCORCH.needsUpdate = true; DG.needsUpdate = true;
});
$('#reloadBtn').addEventListener('click', () => location.reload());

// menu: a slow orbit over the campus with Namsan behind it
camera.position.copy(menuView()); controls.target.copy(START_T); controls.update();
playControls(false);

// compile every effect material up front, so the first explosion / missile / meteor doesn't stall the frame
(function warmUp() {
  const tmp = [], add = (o) => { o.position.set(CXc, -9999, CZc); scene.add(o); tmp.push(o); };
  add(new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
  add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  add(new THREE.Mesh(shockGeo, new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uC: { value: new THREE.Color() } }, vertexShader: SHOCK_V, fragmentShader: SHOCK_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  add(new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false })));
  add(MISSILE.clone()); add(new THREE.Mesh(rockGeo, rockMat)); add(new THREE.Mesh(new THREE.ConeGeometry(1, 2, 8, 1, true), sheathMat));
  add(ribbonMesh([[new V3(), new V3(0, 1, 0), 1]], 1, 1, 1, 1, 1));
  const S = structs.find((s) => s.type === 'b'); if (S) add(new THREE.Mesh(S.mesh.geometry, S.debMats));
  try { renderer.compile(scene, camera); } catch (e) { console.warn(e); }
  for (const o of tmp) scene.remove(o);
})();
if (autoStart && RANK.me.name) setTimeout(() => start(autoStart), 60);

// ------------------------------------------------------------------ per-frame hook (called by the scene loop before render)
function pre(dt) {
  G.time += dt; adaptBudget(dt);
  if (G.playing) { cameraStep(dt); aimStep(); handleFiring(dt); }
  stepProjs(dt); stepBolts(dt); stepRails(dt); stepCollapse(dt); stepCrumble(dt); stepElephants(dt);
  let moved = false;
  for (const S of structs) {
    if (S.geoDirty) { S.mesh.geometry.attributes.position.needsUpdate = true; S.geoDirty = false; moved = true; }
    if (S.slabDirty) { S.slabMesh.geometry.attributes.position.needsUpdate = true; S.slabDirty = false; }
  }
  stepDebris(dt); stepChunks(dt); stepFires(dt);
  stepPS(FIRE, dt); stepPS(SMOKE, dt); stepSparks(dt); stepFx(dt); coolMarks(dt);
  heatTick += dt; if (heatTick > 0.1) { heatTick = 0; if (hot.length) coolDown(); }
  if (scorchDirty) { SCORCH.needsUpdate = true; scorchDirty = false; }
  if (digDirty) { DG.needsUpdate = true; digDirty = false; }
  if (gRow1 >= 0) {
    const off = Math.max(0, gRow0) * DW * 3, cnt = (Math.min(DH - 1, gRow1) - Math.max(0, gRow0) + 1) * DW * 3;
    GP.updateRange.offset = GN.updateRange.offset = off; GP.updateRange.count = GN.updateRange.count = cnt;
    GP.needsUpdate = GN.needsUpdate = true; gRow0 = 1e9; gRow1 = -1;
  }
  flushRubble();
  stepHUD(dt); stepPops(dt);
  applyShake(dt);
  // the sun's shadow map is only redrawn while something that casts a shadow is moving (it is the single biggest GPU cost otherwise)
  if (moved || G.time - lastBlast < 4 || projs.length || debris.length || collapsing.length || CHUNKS[0].n + CHUNKS[1].n) renderer.shadowMap.needsUpdate = true;
}

// test hooks: fire any weapon at a world point, step without input
function fireAt(id, p) {
  aimP = p.clone(); const i = WEAPONS.findIndex((w) => w.id === id); if (i < 0) return;
  G.cur = i; applyControlMode();
  if (id === 'cannon') fireCannon(); else { G.cd[id] = 0; if (id === 'meteor') G.meteor = 1; fireOnce(); }
}
return { capture, startAngle, audio: () => ({ SMP, AC, master, sfxBoom, sfxThunder, sfxRail, sfxCannon, sfxGlass, sfxCreak, sfxDebris }), pre, G, structs, projs, bolts, strikes, strikeBolt, explode, aimAt, surfaceAt, selectWeapon, start, endRound, WEAPONS, fireAt, collapse, collapsing, TOTAL, setAim: (p) => { aimP = p; },
  hideAim: () => { reticle.visible = false; },
  stats: () => ({ pq: +PQ.toFixed(2), ema: +frameEma.toFixed(1), fire: FIRE.n, smoke: SMOKE.n, sparks: SPK.n, chunks: CHUNKS[0].n + CHUNKS[1].n, rubble: RUB[0].n + RUB[1].n, debris: debris.length, projs: projs.length }) };
}
})();
