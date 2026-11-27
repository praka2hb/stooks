// Draws stocks.svg, hooks.svg and stooks.svg from scratch. No dependencies:
//   node lettering.mjs            writes the three SVGs next to this file
// Letters are rounded polygons on an upright grid (baseline 552, x-height 236,
// ascender 160), then sheared so the word climbs to the right.
import { writeFileSync, renameSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))

export const CFG = {
  climb: 0.0595,        // baseline rise per unit of x (about 3.4 degrees)
  red: 40,              // cherry backing, distance out from the letters
  white: 69.5,          // sticker border, distance out from the letters
  redFillet: 20,        // softens the creases where two outlines meet
  whiteFillet: 30,
  face: ['#ffa9cd', '#fd90bd', '#fb84b4'],
  back: ['#fb1736', '#e80a28'],
  faceFrom: [170, 552], backFrom: [120, 600], // upright y range each gradient covers
  // dx, dy, colour, width, opacity, blur: soft strokes clipped inside each letter
  gloss: [[0, 0, '#e0558c', 8, 0.5, 3.6], [-2, -5, '#fb7fb2', 10, 0.8, 3.6], [4, 7, '#ffe3ee', 10, 0.95, 3.6]],
}

// ---------------------------------------------------------------- letters
// Each vertex: [x, y, t] or [x, y, tIn, tOut]. t is how far from the vertex
// the corner starts to turn. Clockwise for solids, counters listed separately.
const STEM = 94
const LETTERS = {
  s: { w: 306, solid: [
    [0, 236, 88], [294, 236, 62, 54], [294, 342, 48], [186, 342, 32, 30],
    [186, 302, 9], [114, 302, 18], [114, 353, 18], [306, 353, 96, 94],
    [306, 553, 80], [0, 553, 68, 62], [0, 434, 48], [121, 434, 34, 32],
    [121, 482, 9], [190, 482, 16], [190, 423, 20], [0, 423, 104, 92],
  ] },
  t: { w: 214, solid: [
    [44, 160, 41], [44 + STEM, 160, 41], [44 + STEM, 240, 8], [214, 240, 40, 42],
    [214, 326, 42, 40], [44 + STEM, 326, 8], [44 + STEM, 456, 10], [214, 456, 42, 46],
    [214, 554, 50], [44, 554, 100, 108], [44, 326, 8], [0, 326, 34, 40],
    [0, 240, 42, 34], [44, 240, 8],
  ], plate: [[100, 250], [206, 250], [206, 520], [100, 520]] },
  o: { w: 290, solid: [
    [0, 234, 112, 116], [290, 234, 116, 112], [290, 555, 112, 116], [0, 555, 116, 112],
  ], counter: [[82, 318, 38], [208, 318, 38], [208, 470, 38], [82, 470, 38]] },
  c: { w: 290, solid: [
    [0, 234, 112, 116], [290, 234, 102, 90], [290, 352, 24], [210, 352, 24, 18],
    [210, 318, 16, 34], [82, 318, 38], [82, 470, 38], [210, 470, 34, 16],
    [210, 436, 18, 24], [290, 436, 24], [290, 555, 90, 102], [0, 555, 116, 112],
  ], shell: [
    [0, 234, 112, 116], [290, 234, 102, 90], [290, 555, 90, 102], [0, 555, 116, 112],
  ] },
  k: { w: 254, solid: [
    [0, 160, 42], [98, 160, 42], [98, 322, 7], [195, 215, 52], [273, 297, 54],
    [161, 396, 9], [274, 500, 54], [197, 577, 52], [98, 458, 7], [98, 556, 42], [0, 556, 42],
  ], plate: [[161, 396], [246, 318], [246, 478]] },
  h: { w: 282, solid: [
    [0, 160, 40], [STEM - 2, 160, 40], [STEM - 2, 262, 6], [140, 235, 34, 30],
    [282, 235, 110, 122], [282, 555, 38], [192, 555, 38], [192, 324, 46, 40],
    [STEM - 2, 324, 36, 46], [STEM - 2, 555, 38], [0, 555, 38],
  ], shell: [
    [0, 160, 40], [STEM - 2, 160, 40], [STEM - 2, 262, 6], [140, 235, 34, 30],
    [282, 235, 110, 122], [282, 555, 42], [192, 555, 42, 18], [192, 526, 8],
    [STEM - 2, 526, 8], [STEM - 2, 555, 18, 42], [0, 555, 42],
  ] },
}

// Shared slots, so "st" and "ooks" sit at identical coordinates in all three.
const SLOT = { a: 241, b: 546, c: 773, d: 1075, e: 1377, f: 1640, h: 480 }
const WORDS = {
  stocks: [['s', 'a'], ['t', 'b'], ['o', 'c'], ['c', 'd'], ['k', 'e'], ['s', 'f']],
  hooks: [['h', 'h'], ['o', 'c'], ['o', 'd'], ['k', 'e'], ['s', 'f']],
  stooks: [['s', 'a'], ['t', 'b'], ['o', 'c'], ['o', 'd'], ['k', 'e'], ['s', 'f']],
}

// --------------------------------------------------------------- geometry
const skew = (x, y) => [x, y + 65 - CFG.climb * x]
// Rounded polygon -> list of cubic corners joined by straight runs.
function corners(poly, dx) {
  const n = poly.length
  return poly.map(([x, y, a, b = a], i) => {
    const p = poly[(i + n - 1) % n], q = poly[(i + 1) % n]
    const u = [p[0] - x, p[1] - y], v = [q[0] - x, q[1] - y]
    const lu = Math.hypot(...u), lv = Math.hypot(...v)
    const cos = (u[0] * v[0] + u[1] * v[1]) / (lu * lv)
    const turn = Math.PI - Math.acos(Math.max(-1, Math.min(1, cos)))
    const circ = (4 / 3) * Math.tan(turn / 4) / Math.tan(turn / 2)
    const k = circ + (1 - circ) * (Math.max(a, b) > 60 ? 0.22 : 0.04) // a touch squarer than a circle
    const at = (w, l, d) => skew(x + dx + (w[0] / l) * d, y + (w[1] / l) * d)
    return [at(u, lu, a), at(u, lu, a * (1 - k)), at(v, lv, b * (1 - k)), at(v, lv, b)]
  })
}
function checkRoom(name, poly) {
  poly.forEach(([x, y, , b], i) => {
    const q = poly[(i + 1) % poly.length], out = b ?? poly[i][2]
    const len = Math.hypot(q[0] - x, q[1] - y)
    if (out + q[2] > len + 0.01) throw new Error(`${name}: corners ${i} and ${(i + 1) % poly.length} overlap (${out}+${q[2]} > ${len.toFixed(1)})`)
  })
}
const f = (v) => +v.toFixed(1)
const pt = (p) => `${f(p[0])} ${f(p[1])}`
const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.15
function toPath(cs) {
  let d = `M${pt(cs[0][0])}`, cur = cs[0][0]
  for (const [p0, c1, c2, p3] of cs) {
    if (!same(cur, p0)) d += `L${pt(p0)}`
    d += `C${pt(c1)} ${pt(c2)} ${pt(p3)}`
    cur = p3
  }
  return d + 'Z'
}
function flatten(cs) {
  const out = []
  for (const [p0, c1, c2, p3] of cs) {
    const steps = Math.max(6, Math.ceil(Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) / 2.5))
    for (let i = 0; i <= steps; i++) {
    const t = i / steps, s = 1 - t
    out.push([0, 1].map((j) => s * s * s * p0[j] + 3 * s * s * t * c1[j] + 3 * s * t * t * c2[j] + t * t * t * p3[j]))
    }
  }
  return out
}

// ------------------------------------------------ offset outline (union)
// Signed distance on a grid, contoured, so touching letters fuse cleanly.
const CELL = 2.5
function field(polys, box) {
  const nx = Math.ceil((box[2] - box[0]) / CELL) + 1, ny = Math.ceil((box[3] - box[1]) / CELL) + 1
  const parts = polys.map((p) => ({ // chunks of outline with bounding boxes, to skip far ones
    p, chunks: Array.from({ length: Math.ceil(p.length / 12) }, (_, c) => {
      const q = p.slice(c * 12, c * 12 + 13); if (q.length < 13) q.push(p[0])
      return { q, x0: Math.min(...q.map((v) => v[0])), x1: Math.max(...q.map((v) => v[0])), y0: Math.min(...q.map((v) => v[1])), y1: Math.max(...q.map((v) => v[1])) }
    }) }))
  const chunks = parts.flatMap((r) => r.chunks)
  const g = new Float64Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = box[0] + i * CELL, y = box[1] + j * CELL
    let best = 1e18
    for (const { q, x0, x1, y0, y1 } of chunks) {
      const gx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, gy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0
      if (gx * gx + gy * gy >= best) continue
      for (let s = 0; s + 1 < q.length; s++) {
      const ax = q[s][0], ay = q[s][1], bx = q[s + 1][0], by = q[s + 1][1]
      const ex = bx - ax, ey = by - ay, l = ex * ex + ey * ey
      let t = l ? ((x - ax) * ex + (y - ay) * ey) / l : 0
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const px = x - ax - t * ex, py = y - ay - t * ey, d = px * px + py * py
      if (d < best) best = d
      }
    }
    const inside = polys.some((p) => {
      let odd = false
      for (let a = 0, b = p.length - 1; a < p.length; b = a++)
        if (p[a][1] > y !== p[b][1] > y && x < ((p[b][0] - p[a][0]) * (y - p[a][1])) / (p[b][1] - p[a][1]) + p[a][0]) odd = !odd
      return odd
    })
    g[j * nx + i] = inside ? -Math.sqrt(best) : Math.sqrt(best)
  }
  return { g, nx, ny, box }
}
const area = (p) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1] }, 0) / 2
function contour({ g, nx, ny, box }, level) {
  const link = new Map(), pts = new Map()
  const v = (i, j) => g[j * nx + i] - level
  const edge = (i, j, vert) => { // crossing on the edge leaving node (i,j)
    const key = (j * nx + i) * 2 + (vert ? 1 : 0)
    if (!pts.has(key)) {
      const a = v(i, j), b = vert ? v(i, j + 1) : v(i + 1, j), t = a / (a - b)
      pts.set(key, [box[0] + (i + (vert ? 0 : t)) * CELL, box[1] + (j + (vert ? t : 0)) * CELL])
    }
    return key
  }
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const c = (v(i, j) < 0) | ((v(i + 1, j) < 0) << 1) | ((v(i + 1, j + 1) < 0) << 2) | ((v(i, j + 1) < 0) << 3)
    if (!c || c === 15) continue
    const T = () => edge(i, j, false), B = () => edge(i, j + 1, false), L = () => edge(i, j, true), R = () => edge(i + 1, j, true)
    const add = (a, b) => link.set(a, b)
    const cases = { 1: [[T, L]], 2: [[R, T]], 3: [[R, L]], 4: [[B, R]], 5: [[T, L], [B, R]], 6: [[B, T]], 7: [[B, L]], 8: [[L, B]], 9: [[T, B]], 10: [[R, T], [L, B]], 11: [[R, B]], 12: [[L, R]], 13: [[T, R]], 14: [[L, T]] }
    for (const [a, b] of cases[c]) add(a(), b())
  }
  const loops = []
  while (link.size) {
    const start = link.keys().next().value, loop = []
    for (let k = start; link.has(k);) { loop.push(pts.get(k)); const nk = link.get(k); link.delete(k); k = nk }
    loops.push(loop)
  }
  // Keep the outside edge of each island, drop holes.
  const big = loops.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a))
  return loops.filter((l) => Math.sign(area(l)) === Math.sign(area(big)))
}
function offset(polys, dist, fillet, box) {
  const grown = contour(field(polys, box), dist + fillet)
  return contour(field(grown, box), -fillet)
}

// ------------------------------------------------ least-squares cubic fit
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add2 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1], unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l] }
const bez = (c, t) => { const s = 1 - t; return [0, 1].map((j) => s * s * s * c[0][j] + 3 * s * s * t * c[1][j] + 3 * s * t * t * c[2][j] + t * t * t * c[3][j]) }
function fit(p, t1, t2, tol) {
  const n = p.length, len = [0]
  for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(...sub(p[i], p[i - 1])))
  let u = len.map((l) => l / len[n - 1]), best
  if (n < 3) { const d = len[n - 1] / 3; return [[p[0], add2(p[0], t1, d), add2(p[n - 1], t2, d), p[n - 1]]] }
  for (let it = 0; it < 6; it++) {
    let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0
    for (let i = 0; i < n; i++) {
      const t = u[i], s = 1 - t, b1 = 3 * s * s * t, b2 = 3 * s * t * t
      const a1 = [t1[0] * b1, t1[1] * b1], a2 = [t2[0] * b2, t2[1] * b2]
      const base = add2(add2([0, 0], p[0], s * s * s + b1), p[n - 1], b2 + t * t * t), r = sub(p[i], base)
      c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2); x0 += dot(a1, r); x1 += dot(a2, r)
    }
    const det = c00 * c11 - c01 * c01
    let a = det ? (x0 * c11 - x1 * c01) / det : 0, b = det ? (c00 * x1 - c01 * x0) / det : 0
    if (a < 1e-3 * len[n - 1] || b < 1e-3 * len[n - 1]) a = b = len[n - 1] / 3
    const c = [p[0], add2(p[0], t1, a), add2(p[n - 1], t2, b), p[n - 1]]
    let err = 0, at = 0
    for (let i = 1; i < n - 1; i++) { const e = Math.hypot(...sub(bez(c, u[i]), p[i])); if (e > err) { err = e; at = i } }
    if (!best || err < best.err) best = { c, err, at }
    if (err < tol) return [c]
    u = u.map((t, i) => { // one Newton step towards the nearest parameter
      const q = bez(c, t), s = 1 - t
      const d1 = [0, 1].map((j) => 3 * (s * s * (c[1][j] - c[0][j]) + 2 * s * t * (c[2][j] - c[1][j]) + t * t * (c[3][j] - c[2][j])))
      const d2 = [0, 1].map((j) => 6 * (s * (c[2][j] - 2 * c[1][j] + c[0][j]) + t * (c[3][j] - 2 * c[2][j] + c[1][j])))
      const r = sub(q, p[i]), den = dot(d1, d1) + dot(r, d2)
      return i === 0 ? 0 : i === n - 1 ? 1 : Math.max(0, Math.min(1, den ? t - dot(r, d1) / den : t))
    })
  }
  const m = Math.max(1, Math.min(n - 2, best.at)), w = Math.max(1, Math.min(4, m, n - 1 - m)) // symmetric, or the joint kinks
  const tm = unit(sub(p[Math.max(0, m - w)], p[Math.min(n - 1, m + w)]))
  return [...fit(p.slice(0, m + 1), t1, tm, tol), ...fit(p.slice(m), [-tm[0], -tm[1]], t2, tol)]
}
// Even spacing and a light smooth, so tangents are steady and arcs stay round.
function even(loop, gap = 2) {
  const n = loop.length, len = [0]
  for (let i = 0; i < n; i++) len.push(len[i] + Math.hypot(...sub(loop[(i + 1) % n], loop[i])))
  const m = Math.round(len[n] / gap), out = []
  for (let k = 0, i = 0; k < m; k++) {
    const at = (k / m) * len[n]
    while (len[i + 1] < at) i++
    out.push(add2(loop[i], sub(loop[(i + 1) % n], loop[i]), (at - len[i]) / (len[i + 1] - len[i] || 1)))
  }
  const w = [0.06, 0.24, 0.4, 0.24, 0.06]
  return out.map((_, i) => [0, 1].map((j) => w.reduce((a, v, k) => a + v * out[(i + k - 2 + m) % m][j], 0)))
}
function fitLoop(raw, tol = 0.15) {
  const loop = even(raw)
  const n = loop.length, at = (i) => loop[(i + n * 4) % n]
  // Start on the flattest run so the seam is invisible.
  let s = 0, flat = -2
  for (let i = 0; i < n; i++) {
    let m = 1
    for (let k = 4; k <= 16; k += 4) m = Math.min(m, dot(unit(sub(at(i), at(i - k))), unit(sub(at(i + k), at(i)))))
    if (m > flat) { flat = m; s = i }
  }
  const p = Array.from({ length: n + 1 }, (_, i) => at(s + i)), t = unit(sub(at(s + 4), at(s - 4)))
  return toPath(fit(p, t, [-t[0], -t[1]], tol))
}

// -------------------------------------------------------------------- svg
export function build(word) {
  const seen = {}
  const glyphs = WORDS[word].map(([ch, slot]) => {
    const L = LETTERS[ch], dx = SLOT[slot]
    seen[ch] = (seen[ch] || 0) + 1
    const many = WORDS[word].filter(([c]) => c === ch).length > 1
    const solid = corners(L.solid, dx), counter = L.counter && corners([...L.counter].reverse().map(([x, y, a, b = a]) => [x, y, b, a]), dx)
    return { ch, id: many ? `${ch}${seen[ch]}` : ch, d: toPath(solid) + (counter ? toPath(counter) : ''), outer: toPath(solid), shell: flatten(corners(L.shell || L.solid, dx)),
      plate: L.plate && L.plate.map(([x, y]) => skew(x + dx, y)) }
  })
  const polys = glyphs.map((g) => g.shell), xy = polys.flat()
  const lo = (j) => Math.min(...xy.map((p) => p[j])), hi = (j) => Math.max(...xy.map((p) => p[j]))
  const m = CFG.white + CFG.whiteFillet + 9, box = [lo(0) - m, lo(1) - m, hi(0) + m, hi(1) + m].map(Math.round)
  const border = offset(polys, CFG.white, CFG.whiteFillet, box).map((l) => fitLoop(l)).join('')
  const back = offset(polys, CFG.red, CFG.redFillet, box).map((l) => fitLoop(l)).join('')
  const pad = CFG.white + 12, vb = [Math.floor(lo(0) - pad), Math.floor(lo(1) - pad)]
  vb.push(Math.ceil(hi(0) + pad) - vb[0], Math.ceil(hi(1) + pad) - vb[1])
  // Colour runs square to the climbing baseline, so every letter shades alike.
  const c = CFG.climb, n2 = 1 + c * c
  const grad = (id, top, bot, stops) => {
    const y0 = 65 + top, h = (bot - top) / n2
    const o = stops.map(([s, col]) => `<stop${s ? ` offset="${s}"` : ''} stop-color="${col}"/>`).join('')
    return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${f(y0)}" x2="${f(c * h)}" y2="${f(y0 + h)}">${o}</linearGradient>`
  }
  const uses = glyphs.map((g) => `<use xlink:href="#${g.id}"/>`).join('')
  return { glyphs, border, back, svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${vb[2]}" height="${vb[3]}" viewBox="${vb.join(' ')}" role="img" aria-label="${word}">
<title>${word}</title>
<defs>
${glyphs.map((g) => `<path id="${g.id}" fill-rule="evenodd" d="${g.d}"/>`).join('\n')}
${grad('back', ...CFG.backFrom, [[0, CFG.back[0]], [1, CFG.back[1]]])}
${grad('face', ...CFG.faceFrom, [[0, CFG.face[0]], [0.55, CFG.face[1]], [1, CFG.face[2]]])}
${[...new Set(CFG.gloss.map((g) => g[5]))].map((b) => `<filter id="soft${b}" filterUnits="userSpaceOnUse" x="${vb[0] - 20}" y="${vb[1] - 20}" width="${vb[2] + 40}" height="${vb[3] + 40}"><feGaussianBlur stdDeviation="${b}"/></filter>`).join('\n')}
${glyphs.map((g) => `<clipPath id="in-${g.id}"><use xlink:href="#${g.id}" clip-rule="evenodd"/></clipPath>`).join('\n')}
</defs>
<path id="border" fill="#fff" d="${border}"/>
<path id="backing" fill="url(#back)" d="${back}"/>
<g id="letters" fill="url(#face)">${uses}</g>
<g id="gloss" fill="none" stroke-linejoin="round">
${glyphs.map((g) => `<g clip-path="url(#in-${g.id})">${CFG.gloss.map(([x, y, col, w, o, b]) => `<use xlink:href="#${g.id}"${x || y ? ` transform="translate(${x} ${y})"` : ''} stroke="${col}" stroke-opacity="${o}" stroke-width="${w}" filter="url(#soft${b})"/>`).join('')}</g>`).join('\n')}
</g>
</svg>
` }
}

for (const [k, L] of Object.entries(LETTERS)) for (const part of ['solid', 'counter', 'shell']) if (L[part]) checkRoom(`${k}.${part}`, L[part])
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  for (const word of Object.keys(WORDS)) {
    const { svg } = build(word), file = join(HERE, `${word}.svg`)
    writeFileSync(file + '.tmp', svg)   // never leave a half-written file behind
    renameSync(file + '.tmp', file)
    console.log(word, svg.length, 'bytes,', (svg.match(/[MLC]/g) || []).length, 'path commands')
  }
}
