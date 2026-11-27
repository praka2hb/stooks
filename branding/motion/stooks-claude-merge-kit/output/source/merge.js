/* stooks merge — deterministic renderer.
 * Every frame is a pure function of t, so t = 5.9 is the same frame as t = 0.
 * Faces are the original vector paths. The red backing and white border are exact
 * offsets of those paths (distance fields), which is what lets two stickers fuse. */

/* ───────────── TIMELINE: edit here ───────────── */
const CFG = {
  W: 2172, H: 724, FPS: 60, DUR: 5.9,
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

  red: 40, white: 69, whiteFinal: 69.5, // offsets from the letter edge, from the SVG strokes
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
const attr = (svg, id) => {
  const tag = [...svg.matchAll(/<path\b[^>]*>/g)].map(m => m[0]).find(s => id ? s.includes(`id="${id}"`) : !/\bid="/.test(s));
  return tag.match(/\sd="([^"]*)"/)[1].split(/(?=M)/).map(s => s.trim()).filter(Boolean);
};
const A = window.STOOKS_ASSETS;
const ink = { stocks: attr(A.stocks, 'ink'), hooks: attr(A.hooks, 'ink') };
const shell = { stocks: attr(A.stocks, 'shell'), hooks: attr(A.hooks, 'shell') };
const outlineD = attr(A.stooks, null)[0];

const nums = d => d.match(/-?\d*\.?\d+/g).map(Number);
const bbox = d => {
  const n = nums(d), b = [1e9, 1e9, -1e9, -1e9];
  for (let i = 0; i < n.length; i += 2) { b[0] = Math.min(b[0], n[i]); b[2] = Math.max(b[2], n[i]); b[1] = Math.min(b[1], n[i+1]); b[3] = Math.max(b[3], n[i+1]); }
  return b;
};
// flatten M/L/Q/Z into a closed polyline
function flatten(d) {
  const pts = []; let x = 0, y = 0;
  for (const m of d.matchAll(/([MLQZ])([^MLQZ]*)/g)) {
    const a = m[2].match(/-?\d*\.?\d+/g)?.map(Number) || [];
    if (m[1] === 'M' || m[1] === 'L') for (let i = 0; i < a.length; i += 2) { x = a[i]; y = a[i+1]; pts.push([x, y]); }
    else if (m[1] === 'Q') for (let i = 0; i < a.length; i += 4) {
      const [cx, cy, ex, ey] = a.slice(i, i + 4);
      const n = Math.max(1, Math.ceil(Math.sqrt(Math.hypot(x - 2*cx + ex, y - 2*cy + ey) / 4 / 0.04)));
      for (let k = 1; k <= n; k++) { const u = k / n, v = 1 - u; pts.push([v*v*x + 2*u*v*cx + u*u*ex, v*v*y + 2*u*v*cy + u*u*ey]); }
      x = ex; y = ey;
    }
  }
  return pts;
}
const clipPoly = (P, x0, x1) => {
  const cut = (Q, x, keep) => Q.flatMap((p, i) => {
    const q = Q[(i + 1) % Q.length], a = keep(p[0]), b = keep(q[0]), out = [];
    if (a) out.push(p);
    if (a !== b) { const k = (x - p[0]) / (q[0] - p[0]); out.push([x, lerp(p[1], q[1], k)]); }
    return out;
  });
  return cut(cut(P, x0, x => x >= x0), x1, x => x <= x1);
};
function sdfGrid(polys, box, step) {
  const w = Math.ceil((box[2] - box[0]) / step) + 1, h = Math.ceil((box[3] - box[1]) / step) + 1;
  const out = new Float32Array(w * h).fill(1e9);
  for (const P of polys) {
    const n = P.length;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const px = box[0] + i * step, py = box[1] + j * step;
      let best = 1e18, inside = false;
      for (let a = 0, b = n - 1; a < n; b = a++) {
        const ax = P[a][0], ay = P[a][1], ex = P[b][0] - ax, ey = P[b][1] - ay, wx = px - ax, wy = py - ay;
        const L = ex*ex + ey*ey, k = L ? Math.min(1, Math.max(0, (wx*ex + wy*ey) / L)) : 0;
        const dx = wx - ex*k, dy = wy - ey*k, d = dx*dx + dy*dy;
        if (d < best) best = d;
        if ((ay > py) !== (P[b][1] > py) && px < ax + ex * (py - ay) / ey) inside = !inside;
      }
      const s = inside ? -Math.sqrt(best) : Math.sqrt(best);
      if (s < out[j * w + i]) out[j * w + i] = s;
    }
  }
  return { data: out, w, h, box, step };
}

// name, word, ink sub-paths (outer first, then counters)
const PIECES = [
  { id: 's1', word: 'stocks', sub: [0], role: 'L' },
  { id: 't',  word: 'stocks', sub: [1], role: 'L' },
  { id: 'to', word: 'stocks', sub: [2, 6], role: 'tuckL' },
  { id: 'tc', word: 'stocks', sub: [3], role: 'tuckL' },
  { id: 'tk', word: 'stocks', sub: [4], role: 'tuckL' },
  { id: 'ts', word: 'stocks', sub: [5], role: 'tuckL' },
  { id: 'h',  word: 'hooks',  sub: [0], role: 'tuckR' },
  { id: 'o1', word: 'hooks',  sub: [1, 5], role: 'R' },
  { id: 'o2', word: 'hooks',  sub: [2, 6], role: 'R' },
  { id: 'k',  word: 'hooks',  sub: [3], role: 'R' },
  { id: 's2', word: 'hooks',  sub: [4], role: 'R' },
];
const WORD_BOX = { stocks: [241, 134, 1938, 598], hooks: [477, 134, 1938, 590], stooks: [241, 134, 1938, 598] };
const OUT_BOX = bbox(outlineD);
const CX = (241 + 1938) / 2, CY = 366.5;
const PAD = 170, STEP = 2;

for (const p of PIECES) {
  const list = ink[p.word];
  p.outer = list[p.sub[0]];
  p.path = new Path2D(p.sub.map(i => list[i]).join(' '));
  p.solid = new Path2D(p.outer);
  p.b = bbox(p.outer);
  p.c = [(p.b[0] + p.b[2]) / 2, (p.b[1] + p.b[3]) / 2];
}
for (const word of ['stocks', 'hooks']) {
  const bar = flatten(shell[word].at(-1)), ps = PIECES.filter(p => p.word === word);
  ps.forEach((p, i) => {
    const x0 = i ? (ps[i-1].b[2] + p.b[0]) / 2 : -1e5, x1 = i < ps.length - 1 ? (p.b[2] + ps[i+1].b[0]) / 2 : 1e5;
    const part = clipPoly(bar, x0, x1);
    p.polys = part.length > 2 ? [flatten(p.outer), part] : [flatten(p.outer)];
  });
}
const P = Object.fromEntries(PIECES.map(p => [p.id, p]));
// the t is open on its right; this plate closes the notch so nothing shows through it while letters slide behind
const T_PLATE = [[640, 215], [762, 215], [762, 540], [640, 540]];
P.t.cover = new Path2D(P.t.outer + 'M' + T_PLATE.map(q => q.join(' ')).join('L') + 'Z');
P.o1.cover = P.o1.solid;

/* ───────────── motion ───────────── */
const D_REST = (1938 + CFG.white) - (477 - CFG.white) + CFG.restGap; // how far "hooks" sits right of its final spot
const D_TOUCH = 1938 - 477 + 12;                                     // the two words' letters are neighbours
const SPAN = 1938 - 241 + 2 * CFG.white;
const S_REST = CFG.restWidth / (SPAN + D_REST);
const R_END = P.o1.c[0] - P.h.c[0];

function state(tIn) {
  const t = ((tIn % CFG.DUR) + CFG.DUR) % CFG.DUR;
  const { enter: E, merge: M, settle: S, lift: LF } = CFG;
  const s = { t, ox: 0, oy: 0, sx: 1, sy: 1, rot: 0, goo: 0, m: 0, style: 0, sweep: null, scenes: [] };
  const entering = t >= CFG.DUR + E.start;
  const words = entering || t < M.end;

  // word phase ──────────────
  const wordScene = tt => {
    const w = { kind: 'words', D: D_REST, scale: S_REST, in: 0, q: 0, r: 0, goo: 0, plug: 0, m: 0, style: 0, sh: 0 };
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
      w.style = sstep(2.1, 3.1, tt);
    }
    return w;
  };
  // sticker phase ──────────────
  const stickerScene = tt => {
    const w = { kind: 'sticker', D: 0, scale: 1, in: 0, q: 0, r: 0, goo: 0, m: 1, style: 1, sh: 0, oy: 0, rot: 0, sx: 1, sy: 1, plug: 0 };
    const tau = tt - S.start;
    w.m = sstep(0, 0.1, tau);                                          // ease onto the exact stooks.svg outline
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
  else { if (t < LF.end) s.scenes.push(stickerScene(t)); if (entering) s.scenes.push(wordScene(t - CFG.DUR)); }
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
  grids.push(sdfGrid([flatten(outlineD)], [OUT_BOX[0] - PAD, OUT_BOX[1] - PAD, OUT_BOX[2] + PAD, OUT_BOX[3] + PAD], STEP));
  let x = 0, y = 0, row = 0;
  for (const g of grids) { if (x + g.w > AT_W) { x = 0; y += row + 2; row = 0; } g.x = x; g.y = y; x += g.w + 2; row = Math.max(row, g.h); }
  const H = y + row, buf = new Float32Array(AT_W * H).fill(999);
  for (const g of grids) for (let j = 0; j < g.h; j++) buf.set(g.data.subarray(j * g.w, (j + 1) * g.w), (g.y + j) * AT_W + g.x);
  return { grids, buf, H };
}
const N = PIECES.length;
const FRAG = `#version 300 es
precision highp float; precision highp sampler2D;
out vec4 o; uniform sampler2D atlas; uniform vec2 res;
uniform mat3 inv; uniform float px;               // pixel -> units, px per unit
uniform vec4 box[${N + 1}]; uniform vec4 slot[${N + 1}]; // unit box, atlas origin + size
uniform vec4 xf[${N}]; uniform vec2 ctr[${N}];    // x,y,scale,on
uniform float goo, plug, m, style, clipL, clipR, shadeL, shadeR, uA, uB, kSlope;
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
float grad(vec2 p, vec4 b){ vec2 u = (p - b.xy) / (b.zw - b.xy); return clamp((.15 * u.x + u.y) / 1.0225, 0., 1.); }
void main(){
  vec2 f = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 p = (inv * vec3(f, 1.)).xy;
  float dt = pc(1, p), L = min(pc(0, p), dt);
  float train = min(min(pc(2, p), pc(3, p)), min(pc(4, p), pc(5, p)));
  // fills the notch on the right of "stocks" as "hooks" arrives, so the borders meet in the middle and trap no hole
  vec2 nq = abs(p - xf[5].xy - vec2(1886., 322.)) - vec2(38., 70.);
  if (plug > 0.) train = min(train, length(max(nq, 0.)) + min(max(nq.x, nq.y), 0.) + 110. * (1. - plug));
  train = max(train, clipL - p.x);
  float h = max(pc(6, p), p.x - clipR);
  float do1 = pc(7, p), R = min(min(do1, pc(8, p)), min(pc(9, p), pc(10, p)));
  float LL = min(L, train), RR = min(R, h);
  float d = smin(LL, RR, goo);
  vec2 pf = p - vec2(uA, uA * kSlope);            // "stooks" rides in the left frame; identical once merged
  if (m > 0.) d = mix(d, tex(${N}, pf) + ${CFG.red.toFixed(1)}, m);
  float white = clamp(.5 - (d - mix(${CFG.white.toFixed(1)}, ${CFG.whiteFinal}, m)) * px, 0., 1.);
  float red = clamp(.5 - (d - ${CFG.red.toFixed(1)}) * px, 0., 1.);
  float w = clamp(.5 + .5 * (LL - RR) / 90., 0., 1.);
  float g0 = mix(grad(p - vec2(uA, uA * kSlope), vec4(241., 134., 1938., 598.)), grad(p - vec2(uB, uB * kSlope), vec4(477., 134., 1938., 590.)), w);
  vec3 c0 = mix(vec3(248., 25., 54.), vec3(232., 12., 41.), g0);
  vec3 c1 = mix(vec3(251., 22., 54.), vec3(233., 8., 38.), grad(pf, vec4(${OUT_BOX.map(v => v.toFixed(2)).join(',')})));
  vec3 rc = mix(c0, c1, style) / 255.;
  // contact shade where a letter slips behind the t / the first o
  vec2 bq = abs(p - xf[1].xy - vec2(701., 377.5)) - vec2(61., 162.5);   // T_PLATE
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
  const loc = Object.fromEntries(['inv', 'px', 'xf', 'goo', 'plug', 'm', 'style', 'clipL', 'clipR', 'shadeL', 'shadeR', 'uA', 'uB', 'kSlope'].map(n => [n, U(n)]));
  return { cv, gl, loc };
}

/* ───────────── faces (Canvas 2D, vector) ───────────── */
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, k) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => lerp(v, y[i], k).toFixed(2)).join(',')})`; };
const STYLE = {
  word:   { stops: [[0, '#fea1c8'], [.56, '#fc8ebc'], [1, '#fb85b6']],
            gloss: [[-2, -4, '#fb85b6', 10, .85, 3.5], [4, 7, '#fdcfe0', 10, .95, 3.5]] },
  stooks: { stops: [[0, '#ffafd0'], [.55, '#ff91be'], [1, '#fc83b3']],
            gloss: [[0, 0, '#da487e', 9, .68, 4], [4, 7, '#fff0f6', 9, .85, 4], [-3, -5, '#ffd1e4', 7, .62, 2.6]] },
};
const GP = 40;
// gaussian blur via an off-canvas shadow (sigma = shadowBlur / 2); ctx.filter is unreliable in headless Chrome
const FAR = 4000, softly = (g, color, sigma) => { g.shadowColor = color; g.shadowBlur = sigma * 2; g.shadowOffsetX = FAR; };
function glossBitmap(p, style) {
  const c = document.createElement('canvas'); c.width = Math.ceil(p.b[2] - p.b[0]) + 2 * GP; c.height = Math.ceil(p.b[3] - p.b[1]) + 2 * GP;
  const g = c.getContext('2d', { willReadFrequently: true });   // CPU-backed: GPU canvases can be dropped silently
  for (const [dx, dy, col, lw, op, bl] of STYLE[style].gloss) {
    g.save(); softly(g, col, bl); g.globalAlpha = op; g.strokeStyle = '#000'; g.lineWidth = lw; g.lineJoin = 'round';
    g.translate(GP - p.b[0] + dx - FAR, GP - p.b[1] + dy); g.stroke(p.path); g.restore();
  }
  return c;
}

function faceGradient(g, p, k) {
  const b0 = WORD_BOX[p.word], b1 = WORD_BOX.stooks, b = b0.map((v, i) => lerp(v, b1[i], k));
  const gx = .15 / (b[2] - b[0]) / 1.0225, gy = 1 / (b[3] - b[1]) / 1.0225, n = gx * gx + gy * gy;
  const gr = g.createLinearGradient(b[0], b[1], b[0] + gx / n, b[1] + gy / n);
  STYLE.word.stops.forEach(([o, c], i) => gr.addColorStop(lerp(o, STYLE.stooks.stops[i][0], k), mixHex(c, STYLE.stooks.stops[i][1], k)));
  return gr;
}
const layer = () => { const c = document.createElement('canvas'); c.width = CFG.W; c.height = CFG.H; return c.getContext('2d', { willReadFrequently: true }); };
const faceCtx = layer(), tuckCtx = layer();
const clear = g => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.filter = 'none'; g.clearRect(0, 0, CFG.W, CFG.H); };
const use = (g, M, q) => { g.setTransform(...M); g.translate(q.x + q.p.c[0], q.y + q.p.c[1]); g.scale(q.sc, q.sc); g.translate(-q.p.c[0], -q.p.c[1]); };
function drawFace(g, M, q, k) {
  g.save(); use(g, M, q);
  g.fillStyle = faceGradient(g, q.p, k); g.fill(q.p.path, 'evenodd');
  g.clip(q.p.path, 'evenodd'); g.imageSmoothingQuality = 'high';
  if (k < 1) { g.globalAlpha = 1 - k; g.drawImage(q.p.gloss.word, q.p.b[0] - GP, q.p.b[1] - GP); }
  if (k > 0) { g.globalAlpha = k; g.drawImage(q.p.gloss.stooks, q.p.b[0] - GP, q.p.b[1] - GP); }
  g.restore();
}
// draw letters that slide behind `cover`, cut by its red rim
function drawTucked(list, cover, M, k, rim, keep, shadow) {
  const g = tuckCtx; clear(g);
  g.save(); g.setTransform(...M); g.beginPath(); g.rect(...keep); g.clip();
  for (const q of list) drawFace(g, M, q, k);
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
  for (const p of PIECES) for (const k of ['word', 'stooks']) {
    const c = p.gloss[k], d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
    if (n < 2000) throw new Error(`gloss lost: ${p.id}/${k}`);
  }
}
async function init() {
  for (const p of PIECES) p.gloss = { word: glossBitmap(p, 'word'), stooks: glossBitmap(p, 'stooks') };
  checkGloss();
  GL = makeGL();
  bg = new Image(); bg.src = A.background; await bg.decode();
}
function drawScene(out, w) {
  const M = matrix(w), pl = place(w), by = id => pl.find(q => q.p.id === id);
  const t = by('t'), o1 = by('o1'), { a, b } = shift(w);
  const clipL = t.x + 682, clipR = o1.x + P.o1.c[0] + 10;
  const tuck = sstep(0, 60, w.q), tuckR = sstep(0, 50, w.r);
  // backing
  const { gl, loc, cv } = GL, det = M[0] * M[3] - M[1] * M[2];
  const i = [M[3] / det, -M[1] / det, 0, -M[2] / det, M[0] / det, 0, (M[2] * M[5] - M[3] * M[4]) / det, (M[1] * M[4] - M[0] * M[5]) / det, 1];
  gl.uniformMatrix3fv(loc.inv, false, i); gl.uniform1f(loc.px, Math.sqrt(det));
  gl.uniform4fv(loc.xf, pl.flatMap(q => [q.x, q.y, q.sc, q.on ? 1 : 0]));
  gl.uniform1f(loc.goo, w.goo); gl.uniform1f(loc.plug, w.plug); gl.uniform1f(loc.m, w.m); gl.uniform1f(loc.style, w.style);
  gl.uniform1f(loc.clipL, w.q > 0 ? clipL : -1e5); gl.uniform1f(loc.clipR, w.r > 0 ? clipR : 1e5);
  gl.uniform1f(loc.shadeL, tuck * (1 - w.m)); gl.uniform1f(loc.shadeR, tuckR * (1 - w.m));
  gl.uniform1f(loc.uA, a); gl.uniform1f(loc.uB, b); gl.uniform1f(loc.kSlope, CFG.slope);
  gl.drawArrays(gl.TRIANGLES, 0, 3); if (gl.isContextLost()) throw new Error('WebGL context lost'); out.drawImage(cv, 0, 0);
  // faces
  clear(faceCtx);
  if (w.kind === 'words') {
    drawTucked(pl.filter(q => q.p.role === 'tuckL'), t, M, w.style, Math.min(CFG.halo, w.q * 0.8), w.q > 0 ? [clipL, -4000, 1e4, 9000] : [-1e4, -4000, 3e4, 9000], tuck);
    drawTucked([by('h')], o1, M, w.style, Math.min(CFG.halo, w.r * 0.8), w.r > 0 ? [clipR - 1e4, -4000, 1e4, 9000] : [-1e4, -4000, 3e4, 9000], tuckR);
  }
  for (const q of pl) if (q.p.role === 'L' || q.p.role === 'R') drawFace(faceCtx, M, q, w.style);
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
