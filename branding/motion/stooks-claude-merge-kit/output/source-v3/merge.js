/* stooks merge v3 — v2's merge, then a plain text line, then back to the two words.
 * Every frame is a pure function of t, so t = 8.9 is the same frame as t = 0.
 * Faces are the letters' vector paths. The red backing and white border are distance
 * fields, which is what lets two stickers fuse: while the words hold and once "stooks"
 * has settled they are the exact outlines from the SVGs. */

/* ───────────── TIMELINE: edit here ───────────── */
const CFG = {
  W: 2172, H: 724, FPS: 60, DUR: 8.9,
  slope: -0.0595,            // the wordmarks' baseline climbs at this slope
  restGap: 150,              // white-to-white gap while the two words hold (SVG units)
  restWidth: 1990,           // px, both words plus the gap
  mergedScale: 0.735,        // px per unit at the instant the letters meet
  finalScale: 0.825,         // px per unit once "stooks" has settled

  enter:  { start: -0.31, omega: 7.6, zeta: 0.76, travelL: 1160, travelR: 1030 }, // spring; px
  merge:  { start: 1.80, pull: 1.95, pullBy: 46, end: 3.10, endVel: -620 },
  hTuckFrom: 760,            // separation at which "h" starts going behind the first "o"
  settle: { start: 3.10, omega: 17, zeta: 0.42, squash: 0.03 },
  sweep:  { start: 3.62, end: 4.62, width: 62, angle: 16, opacity: 0.78 },
  lift:   { start: 5.10, dip: 0.17, dipBy: 16, end: 5.66, rise: 760, tilt: -3.2, grow: 0.05 },

  // "built on base + uniswap": words rise one by one as the sticker lifts, hold, then lift out too
  text:   { size: 152, color: '#07163a', baseline: 399, start: 5.40, stagger: 0.075, omega: 10, zeta: 0.74, travel: 520,
            out: 8.10, outStagger: 0.028, dip: 0.17, dipBy: 12, dur: 0.50, rise: 620 },

  red: 40, white: 69.5,      // offsets from the letter edge, as in lettering.mjs
  crease: 40,                // rounds the dip between neighbouring letters while they move
  goo: 70,                   // how far the borders reach for each other on contact
  halo: 36,                  // red rim that covers a letter sliding behind
};
/* ─────────────────────────────────────────────── */

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const hermite = (p0, v0, p1, v1, T, k) => {
  const k2 = k * k, k3 = k2 * k;
  return (2*k3 - 3*k2 + 1) * p0 + (k3 - 2*k2 + k) * T * v0 + (-2*k3 + 3*k2) * p1 + (k3 - k2) * T * v1;
};
// remaining distance (1 → 0) of an underdamped spring released from rest
const spring = (tau, w, z, v0 = 0) => {
  if (tau <= 0) return 1;
  const wd = w * Math.sqrt(1 - z * z);
  return Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w + v0) / wd) * Math.sin(wd * tau));
};

/* ───────────── geometry from the SVGs ───────────── */
const A = window.STOOKS_ASSETS;   // written by render.mjs from ../lettering/lettering.mjs
const polyBox = P => P.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]);
// flatten M/L/C/Z into a closed polyline
function flatten(d) {
  const pts = []; let x = 0, y = 0;
  for (const m of d.matchAll(/([MLC])([^MLCZ]*)/g)) {
    const a = m[2].match(/-?\d*\.?\d+/g).map(Number);
    if (m[1] !== 'C') { [x, y] = a; pts.push([x, y]); }
    else {
      const [bx, by, cx, cy, ex, ey] = a, n = Math.max(2, Math.ceil(Math.hypot(ex - x, ey - y) / 5));
      for (let k = 1; k <= n; k++) { const u = k / n, v = 1 - u; pts.push([v*v*v*x + 3*v*v*u*bx + 3*v*u*u*cx + u*u*u*ex, v*v*v*y + 3*v*v*u*by + 3*v*u*u*cy + u*u*u*ey]); }
      x = ex; y = ey;
    }
  }
  return pts;
}
function sdfGrid(polys, box, step) {
  const w = Math.ceil((box[2] - box[0]) / step) + 1, h = Math.ceil((box[3] - box[1]) / step) + 1;
  const out = new Float32Array(w * h).fill(1e9);
  for (const P of polys) {
    const n = P.length, chunks = [];       // runs of outline with bounding boxes, so far ones can be skipped
    for (let i = 0; i < n; i += 12) { const q = []; for (let k = i; k <= Math.min(i + 12, n); k++) q.push(P[k % n]); chunks.push({ q, b: polyBox(q) }); }
    for (let j = 0; j < h; j++) {
      const py = box[1] + j * step, cross = [];
      for (let a = 0, b = n - 1; a < n; b = a++) if ((P[a][1] > py) !== (P[b][1] > py)) cross.push(P[a][0] + (P[b][0] - P[a][0]) * (py - P[a][1]) / (P[b][1] - P[a][1]));
      for (let i = 0; i < w; i++) {
        const px = box[0] + i * step; let best = 1e18;
        for (const { q, b } of chunks) {
          const gx = px < b[0] ? b[0] - px : px > b[2] ? px - b[2] : 0, gy = py < b[1] ? b[1] - py : py > b[3] ? py - b[3] : 0;
          if (gx*gx + gy*gy >= best) continue;
          for (let k = 0; k + 1 < q.length; k++) {
            const ax = q[k][0], ay = q[k][1], ex = q[k+1][0] - ax, ey = q[k+1][1] - ay, wx = px - ax, wy = py - ay;
            const L = ex*ex + ey*ey, u = L ? Math.min(1, Math.max(0, (wx*ex + wy*ey) / L)) : 0;
            const dx = wx - ex*u, dy = wy - ey*u, d = dx*dx + dy*dy;
            if (d < best) best = d;
          }
        }
        let inside = false; for (const c of cross) if (px < c) inside = !inside;
        const s = inside ? -Math.sqrt(best) : Math.sqrt(best);
        if (s < out[j * w + i]) out[j * w + i] = s;
      }
    }
  }
  return { data: out, w, h, box, step };
}

// pieces: s1 t to tc tk ts (stocks) · h o1 o2 k s2 (hooks)
const PIECES = A.pieces;
for (const p of PIECES) {
  p.path = new Path2D(p.d); p.solid = new Path2D(p.outer);
  p.b = polyBox(p.polys[0]);
  p.c = [(p.b[0] + p.b[2]) / 2, (p.b[1] + p.b[3]) / 2];
}
const P = Object.fromEntries(PIECES.map(p => [p.id, p]));
// exact outlines of the three SVGs: red then white
const OUTLINES = ['stocks', 'hooks', 'stooks'].flatMap(w => [A.outlines[w].red, A.outlines[w].white]).map(flatten);
const X0 = P.s1.b[0], X1 = P.s2.b[2], HX0 = P.h.b[0];
const CX = (X0 + X1) / 2, CY = (P.k.b[1] + P.s1.b[3]) / 2;
const PAD = 170, STEP = 2;
// the t is open on its right; this plate closes the notch so nothing shows through it while letters slide behind
const T_PLATE = [[632, 215], [P.t.b[2] - 4, 215], [P.t.b[2] - 4, 540], [632, 540]];
P.t.cover = new Path2D(P.t.outer + 'M' + T_PLATE.map(q => q.join(' ')).join('L') + 'Z');
P.o1.cover = P.o1.solid;

/* ───────────── text line ───────────── */
// glyph outlines from text/words.json (Nunito ExtraBold, 1000 units per em); the last entry is the space
const TEXT = (() => {
  const words = A.text.slice(0, -1), gap = A.text.at(-1).adv, k = CFG.text.size / 1000;
  let x = 0;
  const list = words.map(w => { const q = { path: new Path2D(w.d), x: x * k, k }; x += w.adv + gap; return q; });
  const width = (x - gap) * k;
  list.forEach(q => { q.x += (CFG.W - width) / 2; });
  return list;
})();
// vertical offset of word i at time t: springs up from below the frame, later dips and lifts out of the top
function textY(i, t) {
  const T = CFG.text, tau = t - T.start - i * T.stagger;
  const y = T.travel * spring(tau, T.omega, T.zeta) * (1 - sstep(0.9, 1.2, tau));
  const o = t - T.out - i * T.outStagger;
  if (o <= 0) return y;
  const d = clamp(o / T.dip), up = clamp((o - T.dip * 0.8) / (T.dur - T.dip * 0.8));
  return T.dipBy * Math.sin(Math.PI * Math.min(1, d * 0.5 + up)) - T.rise * up * up * up;
}
function drawText(out, t) {
  out.fillStyle = CFG.text.color;
  TEXT.forEach((q, i) => { out.setTransform(q.k, 0, 0, q.k, q.x, CFG.text.baseline + textY(i, t)); out.fill(q.path); });
  out.setTransform(1, 0, 0, 1, 0, 0);
}

/* ───────────── motion ───────────── */
const D_REST = (X1 + CFG.white) - (HX0 - CFG.white) + CFG.restGap; // how far "hooks" sits right of its final spot
const D_TOUCH = X1 - HX0 + 12;                                     // the two words' letters are neighbours
const SPAN = X1 - X0 + 2 * CFG.white;
const S_REST = CFG.restWidth / (SPAN + D_REST);
const R_END = P.o1.c[0] - P.h.c[0];

function state(tIn) {
  const t = ((tIn % CFG.DUR) + CFG.DUR) % CFG.DUR;
  const { enter: E, merge: M, settle: S, lift: LF } = CFG;
  const s = { t, ox: 0, oy: 0, sx: 1, sy: 1, rot: 0, scenes: [] };
  const entering = t >= CFG.DUR + E.start;
  const words = entering || t < M.end;

  // word phase ──────────────
  const wordScene = tt => {
    const w = { kind: 'words', D: D_REST, scale: S_REST, in: 0, q: 0, r: 0, goo: 0, plug: 0, m: 0, e: 1 };
    w.in = spring(tt - E.start, E.omega, E.zeta) * (1 - sstep(0.6, 0.8, tt)); // lands exactly on the hold
    if (tt > M.start) {
      w.D = tt < M.pull
        ? lerp(D_REST, D_REST + M.pullBy, sstep(M.start, M.pull, tt))
        : hermite(D_REST + M.pullBy, 0, 0, M.endVel, M.end - M.pull, clamp((tt - M.pull) / (M.end - M.pull)));
      w.D = Math.max(0, w.D);
      const tucked = Math.max(0, D_TOUCH - w.D);
      w.r = R_END * sstep(CFG.hTuckFrom, 0, w.D);
      w.q = Math.max(0, tucked - w.r);
      w.scale = lerp(S_REST, CFG.mergedScale, Math.pow(1 - clamp(w.D / D_REST), 1.35));
      w.goo = CFG.goo * sstep(D_REST + M.pullBy, D_TOUCH + 120, w.D) * sstep(0, 420, w.D);
      w.plug = sstep(D_TOUCH + 190, D_TOUCH + 95, w.D) * sstep(0, 420, w.D);
      w.e = 1 - sstep(M.start, M.start + 0.35, tt);   // exact SVG outlines ease into free-moving ones
    }
    return w;
  };
  // sticker phase ──────────────
  const stickerScene = tt => {
    const w = { kind: 'sticker', D: 0, scale: 1, in: 0, q: 0, r: 0, goo: 0, m: 1, e: 0, oy: 0, rot: 0, sx: 1, sy: 1, plug: 0 };
    const tau = tt - S.start;
    w.m = sstep(0, 0.1, tau);                                          // ease onto the exact stooks.svg outlines
    w.scale = CFG.finalScale + (CFG.mergedScale - CFG.finalScale) * spring(tau, S.omega, S.zeta);
    const sq = S.squash * Math.exp(-7.5 * tau) * Math.sin(21 * tau);   // sideways squeeze from the impact
    w.sx = 1 - sq; w.sy = 1 + sq;
    if (tt > CFG.sweep.start && tt < CFG.sweep.end) w.sweep = sstep(CFG.sweep.start, CFG.sweep.end, tt);
    if (tt > LF.start) {
      const d = clamp((tt - LF.start) / LF.dip), up = clamp((tt - LF.start - LF.dip * 0.8) / (LF.end - LF.start - LF.dip * 0.8));
      const dip = Math.sin(Math.PI * Math.min(1, d * 0.5 + up)) , lift = up * up * up;
      w.oy = LF.dipBy * dip - LF.rise * lift;
      w.scale *= 1 - 0.012 * dip + LF.grow * lift;
      w.rot = LF.tilt * lift * Math.PI / 180;
    }
    return w;
  };
  if (t < M.end) s.scenes.push(wordScene(t));
  else {
    const T = CFG.text;
    if (t >= T.start && t < T.out + T.dur + T.outStagger * (TEXT.length - 1)) s.scenes.push({ kind: 'text', t });
    if (t < LF.end) s.scenes.push(stickerScene(t)); if (entering) s.scenes.push(wordScene(t - CFG.DUR)); }
  return s;
}

const shift = w => ({ a: -w.D / 2 - w.in * CFG.enter.travelL / w.scale, b: w.D / 2 + w.in * CFG.enter.travelR / w.scale });
// per-piece placement in stooks units
function place(w) {
  const k = CFG.slope, { a, b } = shift(w);
  return PIECES.map(p => {
    let x = p.word === 'stocks' ? a : b, sc = 1, on = true;
    if (p.role === 'tuckL') {
      x -= w.q;
      sc = 1 - 0.15 * sstep(905, 690, p.c[0] - w.q);   // recede slightly on the way behind "t"
      on = w.kind === 'words';
    }
    if (p.role === 'tuckR') { x += w.r; sc = 1 - 0.3 * sstep(0.12, 0.86, w.r / R_END); on = w.kind === 'words'; }
    return { p, x, y: x * k, sc, on };
  });
}
const matrix = w => {
  const c = Math.cos(w.rot || 0), n = Math.sin(w.rot || 0), sx = w.scale * (w.sx || 1), sy = w.scale * (w.sy || 1);
  const m = [c * sx, n * sx, -n * sy, c * sy, CFG.W / 2, CFG.H / 2 + (w.oy || 0)];
  m[4] -= m[0] * CX + m[2] * CY; m[5] -= m[1] * CX + m[3] * CY;
  return m;
};

/* ───────────── backing (WebGL distance fields) ───────────── */
const AT_W = 2048;
function buildAtlas() {
  const grids = PIECES.map(p => sdfGrid(p.polys, [p.b[0] - PAD, p.b[1] - PAD, p.b[2] + PAD, p.b[3] + PAD], STEP));
  for (const o of OUTLINES) { const b = polyBox(o); grids.push(sdfGrid([o], [b[0] - 60, b[1] - 60, b[2] + 60, b[3] + 60], STEP)); }
  let x = 0, y = 0, row = 0;
  for (const g of grids) { if (x + g.w > AT_W) { x = 0; y += row + 2; row = 0; } g.x = x; g.y = y; x += g.w + 2; row = Math.max(row, g.h); }
  const H = y + row, buf = new Float32Array(AT_W * H).fill(999);
  for (const g of grids) for (let j = 0; j < g.h; j++) buf.set(g.data.subarray(j * g.w, (j + 1) * g.w), (g.y + j) * AT_W + g.x);
  return { grids, buf, H };
}
const N = PIECES.length, NT = N + 6, rgbf = h => `vec3(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) + '.').join(',')})`;
const FRAG = `#version 300 es
precision highp float; precision highp sampler2D;
out vec4 o; uniform sampler2D atlas; uniform vec2 res;
uniform mat3 inv; uniform float px;               // pixel -> units, px per unit
uniform vec4 box[${NT}]; uniform vec4 slot[${NT}]; // unit box, atlas origin + size
uniform vec4 xf[${N}]; uniform vec2 ctr[${N}];    // x,y,scale,on
uniform float goo, plug, m, e, clipL, clipR, shadeL, shadeR, uA, uB, kSlope;
float tex(int i, vec2 p){
  vec2 q = clamp(p, box[i].xy, box[i].zw);
  vec2 uv = (slot[i].xy + (q - box[i].xy) / ${STEP}.0 + .5) / vec2(textureSize(atlas, 0));
  return texture(atlas, uv).r + length(p - q);
}
float pc(int i, vec2 p){
  if (xf[i].w < .5) return 1e4;
  float s = xf[i].z; vec2 q = (p - xf[i].xy - ctr[i]) / s + ctr[i];
  return s * tex(i, q);
}
float smin(float a, float b, float k){ if (k < .01) return min(a, b); float h = max(k - abs(a - b), 0.) / k; return min(a, b) - h * h * k * .25; }
void main(){
  vec2 f = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 p = (inv * vec3(f, 1.)).xy;
  vec2 pa = p - vec2(uA, uA * kSlope), pb = p - vec2(uB, uB * kSlope);
  const float K = ${CFG.crease.toFixed(1)};
  float dt = pc(1, p), L = smin(pc(0, p), dt, K);
  float train = smin(smin(pc(2, p), pc(3, p), K), smin(pc(4, p), pc(5, p), K), K);
  // fills the notch on the right of "stocks" as "hooks" arrives, so the borders meet in the middle and trap no hole
  vec2 nq = abs(p - xf[5].xy - vec2(${(X1 - 52).toFixed(1)}, 322.)) - vec2(38., 70.);
  if (plug > 0.) train = min(train, length(max(nq, 0.)) + min(max(nq.x, nq.y), 0.) + 110. * (1. - plug));
  train = -smin(-train, p.x - clipL, 90.);          // rounded cut, hidden behind the t
  float h = -smin(-pc(6, p), clipR - p.x, 90.);
  float do1 = pc(7, p), R = smin(smin(do1, pc(8, p), K), smin(pc(9, p), pc(10, p), K), K);
  float LL = smin(L, train, K), RR = smin(R, h, K);
  vec2 dL = LL - vec2(${CFG.red.toFixed(1)}, ${CFG.white.toFixed(1)}), dR = RR - vec2(${CFG.red.toFixed(1)}, ${CFG.white.toFixed(1)}); // red, white
  if (e > 0.) { dL = mix(dL, vec2(tex(${N}, pa), tex(${N + 1}, pa)), e); dR = mix(dR, vec2(tex(${N + 2}, pb), tex(${N + 3}, pb)), e); }
  float g = max(goo, K);
  vec2 d = vec2(smin(dL.x, dR.x, g), smin(dL.y, dR.y, g));
  if (m > 0.) d = mix(d, vec2(tex(${N + 4}, pa), tex(${N + 5}, pa)), m);
  float red = clamp(.5 - d.x * px, 0., 1.), white = clamp(.5 - d.y * px, 0., 1.);
  float u = clamp((${A.climb} * p.x + p.y - ${(65 + A.backFrom[0]).toFixed(1)}) / ${(A.backFrom[1] - A.backFrom[0]).toFixed(1)}, 0., 1.);
  vec3 rc = mix(${rgbf(A.back[0])}, ${rgbf(A.back[1])}, u) / 255.;
  // contact shade where a letter slips behind the t / the first o
  vec2 bq = abs(p - xf[1].xy - vec2(${((T_PLATE[0][0] + T_PLATE[1][0]) / 2).toFixed(2)}, 377.5)) - vec2(${((T_PLATE[1][0] - T_PLATE[0][0]) / 2).toFixed(2)}, 162.5);   // T_PLATE
  float ct = min(dt, length(max(bq, 0.)) + min(max(bq.x, bq.y), 0.));
  float st = smoothstep(26., 0., ct - ${CFG.halo}.) * step(${CFG.halo}., ct) * step(clipL, p.x) * smoothstep(30., 0., train);
  float so = smoothstep(26., 0., do1 - ${CFG.halo}.) * step(${CFG.halo}., do1) * step(p.x, clipR) * smoothstep(30., 0., h);
  rc *= 1. - .34 * max(shadeL * st, shadeR * so);
  vec3 c = mix(vec3(1.), rc, red);
  o = vec4(c * white, white);
}`;

function makeGL() {
  const cv = document.createElement('canvas'); cv.width = CFG.W; cv.height = CFG.H;
  const gl = cv.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!gl.getExtension('OES_texture_float_linear')) throw new Error('float textures need linear filtering');
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, `#version 300 es\nvoid main(){vec2 p=vec2(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.);gl_Position=vec4(p,0.,1.);}`));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  const at = buildAtlas();
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, AT_W, at.H, 0, gl.RED, gl.FLOAT, at.buf);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const U = n => gl.getUniformLocation(pr, n);
  gl.uniform2f(U('res'), CFG.W, CFG.H);
  // sampling box is the grid actually stored, which can exceed the piece box by < 1 step
  gl.uniform4fv(U('box'), at.grids.flatMap(g => [g.box[0], g.box[1], g.box[0] + (g.w - 1) * STEP, g.box[1] + (g.h - 1) * STEP]));
  gl.uniform4fv(U('slot'), at.grids.flatMap(g => [g.x, g.y, g.w, g.h]));
  gl.uniform2fv(U('ctr'), PIECES.flatMap(p => p.c));
  const loc = Object.fromEntries(['inv', 'px', 'xf', 'goo', 'plug', 'm', 'e', 'clipL', 'clipR', 'shadeL', 'shadeR', 'uA', 'uB', 'kSlope'].map(n => [n, U(n)]));
  return { cv, gl, loc };
}

/* ───────────── faces (Canvas 2D, vector) ───────────── */
const GP = 40;
// gaussian blur via an off-canvas shadow (sigma = shadowBlur / 2); ctx.filter is unreliable in headless Chrome
const FAR = 4000, softly = (g, color, sigma) => { g.shadowColor = color; g.shadowBlur = sigma * 2; g.shadowOffsetX = FAR; };
function glossBitmap(p) {
  const c = document.createElement('canvas'); c.width = Math.ceil(p.b[2] - p.b[0]) + 2 * GP; c.height = Math.ceil(p.b[3] - p.b[1]) + 2 * GP;
  const g = c.getContext('2d', { willReadFrequently: true });   // CPU-backed: GPU canvases can be dropped silently
  for (const [dx, dy, col, lw, op, bl] of A.gloss) {
    g.save(); softly(g, col, bl); g.globalAlpha = op; g.strokeStyle = '#000'; g.lineWidth = lw; g.lineJoin = 'round';
    g.translate(GP - p.b[0] + dx - FAR, GP - p.b[1] + dy); g.stroke(p.path); g.restore();
  }
  return c;
}

function faceGradient(g) {                // square to the climbing baseline, so every letter shades alike
  const [y0, y1] = A.faceFrom, c = A.climb, h = (y1 - y0) / (1 + c * c);
  const gr = g.createLinearGradient(0, 65 + y0, c * h, 65 + y0 + h);
  A.face.forEach((col, i) => gr.addColorStop([0, .55, 1][i], col));
  return gr;
}
const layer = () => { const c = document.createElement('canvas'); c.width = CFG.W; c.height = CFG.H; return c.getContext('2d', { willReadFrequently: true }); };
const faceCtx = layer(), tuckCtx = layer();
const clear = g => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.filter = 'none'; g.clearRect(0, 0, CFG.W, CFG.H); };
const use = (g, M, q) => { g.setTransform(...M); g.translate(q.x + q.p.c[0], q.y + q.p.c[1]); g.scale(q.sc, q.sc); g.translate(-q.p.c[0], -q.p.c[1]); };
function drawFace(g, M, q) {
  g.save(); use(g, M, q);
  g.fillStyle = faceGradient(g); g.fill(q.p.path, 'evenodd');
  g.clip(q.p.path, 'evenodd'); g.imageSmoothingQuality = 'high';
  g.drawImage(q.p.gloss, q.p.b[0] - GP, q.p.b[1] - GP);
  g.restore();
}
// draw letters that slide behind `cover`, cut by its red rim
function drawTucked(list, cover, M, rim, keep, shadow) {
  const g = tuckCtx; clear(g);
  g.save(); g.setTransform(...M); g.beginPath(); g.rect(...keep); g.clip();
  for (const q of list) drawFace(g, M, q);
  g.restore();
  if (rim > 0) {
    if (shadow > 0) {  // soft contact shade on the faces
      g.save(); use(g, [M[0], M[1], M[2], M[3], M[4] - FAR, M[5]], cover); g.lineJoin = 'round';
      softly(g, `rgba(150,0,48,${0.42 * shadow})`, 9 * M[0]);
      g.globalCompositeOperation = 'source-atop'; g.strokeStyle = '#000'; g.lineWidth = 2 * rim + 20; g.stroke(cover.p.cover); g.restore();
    }
    g.save(); use(g, M, cover); g.lineJoin = 'round';
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = g.strokeStyle = '#000'; g.lineWidth = 2 * rim;
    g.fill(cover.p.cover); g.stroke(cover.p.cover); g.restore();
  }
  faceCtx.setTransform(1, 0, 0, 1, 0, 0); faceCtx.drawImage(g.canvas, 0, 0);
}

/* ───────────── compose ───────────── */
let GL = null, bg = null;
function checkGloss() {
  for (const p of PIECES) {
    const c = p.gloss, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
    if (n < 2000) throw new Error(`gloss lost: ${p.id}`);
  }
}
async function init() {
  for (const p of PIECES) p.gloss = glossBitmap(p);
  checkGloss();
  GL = makeGL();
  bg = new Image(); bg.src = A.background; await bg.decode();
}
function drawScene(out, w) {
  if (w.kind === 'text') return drawText(out, w.t);
  const M = matrix(w), pl = place(w), by = id => pl.find(q => q.p.id === id);
  const t = by('t'), o1 = by('o1'), { a, b } = shift(w);
  const clipL = t.x + P.t.b[2] - 86, clipR = o1.x + P.o1.c[0] + 10;
  const tuck = sstep(0, 60, w.q), tuckR = sstep(0, 50, w.r);
  // backing
  const { gl, loc, cv } = GL, det = M[0] * M[3] - M[1] * M[2];
  const i = [M[3] / det, -M[1] / det, 0, -M[2] / det, M[0] / det, 0, (M[2] * M[5] - M[3] * M[4]) / det, (M[1] * M[4] - M[0] * M[5]) / det, 1];
  gl.uniformMatrix3fv(loc.inv, false, i); gl.uniform1f(loc.px, Math.sqrt(det));
  gl.uniform4fv(loc.xf, pl.flatMap(q => [q.x, q.y, q.sc, q.on ? 1 : 0]));
  gl.uniform1f(loc.goo, w.goo); gl.uniform1f(loc.plug, w.plug); gl.uniform1f(loc.m, w.m); gl.uniform1f(loc.e, w.e);
  gl.uniform1f(loc.clipL, w.q > 0 ? clipL : -1e5); gl.uniform1f(loc.clipR, w.r > 0 ? clipR : 1e5);
  gl.uniform1f(loc.shadeL, tuck * (1 - w.m)); gl.uniform1f(loc.shadeR, tuckR * (1 - w.m));
  gl.uniform1f(loc.uA, a); gl.uniform1f(loc.uB, b); gl.uniform1f(loc.kSlope, CFG.slope);
  gl.drawArrays(gl.TRIANGLES, 0, 3); if (gl.isContextLost()) throw new Error('WebGL context lost'); out.drawImage(cv, 0, 0);
  // faces
  clear(faceCtx);
  if (w.kind === 'words') {
    drawTucked(pl.filter(q => q.p.role === 'tuckL'), t, M, Math.min(CFG.halo, w.q * 0.8), w.q > 0 ? [clipL, -4000, 1e4, 9000] : [-1e4, -4000, 3e4, 9000], tuck);
    drawTucked([by('h')], o1, M, Math.min(CFG.halo, w.r * 0.8), w.r > 0 ? [clipR - 1e4, -4000, 1e4, 9000] : [-1e4, -4000, 3e4, 9000], tuckR);
  }
  for (const q of pl) if (q.p.role === 'L' || q.p.role === 'R') drawFace(faceCtx, M, q);
  if (w.sweep != null) {
    const S = CFG.sweep, g = faceCtx; g.setTransform(...M); g.globalCompositeOperation = 'source-atop';
    g.translate(lerp(120, 2060, w.sweep), CY); g.transform(1, 0, -Math.tan(S.angle * Math.PI / 180), 1, 0, 0);
    const gr = g.createLinearGradient(-S.width * 1.6, 0, S.width * 1.6, 0);
    for (let k = 0; k <= 24; k++) { const u = k / 24 * 2 - 1; gr.addColorStop(k / 24, `rgba(255,250,253,${(S.opacity * Math.max(0, Math.exp(-u * u * 5.2) - Math.exp(-5.2))).toFixed(4)})`); }
    g.fillStyle = gr; g.fillRect(-S.width * 1.6, -600, S.width * 3.2, 1200);
  }
  out.drawImage(faceCtx.canvas, 0, 0);
}
function renderFrame(out, t) {
  out.setTransform(1, 0, 0, 1, 0, 0); out.globalAlpha = 1; out.globalCompositeOperation = 'source-over';
  out.drawImage(bg, 0, 0, CFG.W, CFG.H);
  for (const w of state(t).scenes) drawScene(out, w);
}
window.STOOKS = { CFG, state, init, renderFrame, checkGloss };
