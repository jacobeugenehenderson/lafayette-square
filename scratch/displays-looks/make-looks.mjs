#!/usr/bin/env node
/**
 * make-looks.mjs: draft 2 of the Light Show's starter looks (BRIEF-the-monument-lights-up §1), after Jacob's notes on
 * draft 1 (2026-10-31).
 *
 *   node scratch/displays-looks/make-looks.mjs   → cartograph/data/provincetown/content/displays/monument-lights/{looks.json, looks/<id>/*.svg}
 *
 * THE FRAME is FRAME_W × FRAME_H, one pixel = one bulb, in two regions stacked:
 *   rows 0 … PIN_H-1      the PINNACLE: the tower's upper stage, its four faces unrolled (lit like the Empire State's top)
 *   rows PIN_H … FRAME_H-1 the CONE: the strands from the top of the tower to the ground ring (row PIN_H = the top)
 * x is around: FACES faces of FACE_W columns. A glyph that must be seen from every side repeats on every face; bands
 * wrap. Black is "bulbs off".
 * A look is LAYERS, bottom to top, each with one built-in motion. A layer whose motion turns its glyphs in place
 * (turn, swing, tumble) is rendered here as FRAMES of that motion: the system draws them, the operator never does.
 * Seeded, so a re-run is byte-identical. ⚠️ Draft for Jacob's contact sheet: not wired to anything.
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// The town's drawer: Provincetown's looks for its monument's Light Show (the town's data, not the plugin's).
const DRAWER = join(HERE, '../../cartograph/data/provincetown/content/displays/monument-lights'), OUT = join(DRAWER, 'looks')
export const FRAME_W = 192, CONE_H = 96, PIN_H = 18, FRAME_H = PIN_H + CONE_H, FACES = 4, FACE_W = FRAME_W / FACES
const faceCx = (k) => FACE_W * k + FACE_W / 2
const perFace = (fn) => Array.from({ length: FACES }, (_, k) => fn(faceCx(k), k)).join('')
const halves = (fn) => [0, 1].map(k => fn(FRAME_W / 4 + k * FRAME_W / 2, k)).join('')   // two big glyphs, opposite sides

function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const f = (n) => +(+n).toFixed(2)
const rect = (x, y, w, h, c, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${c}"${extra}/>`
const band = (y0, y1, c, extra = '') => rect(-2, y0, FRAME_W + 4, y1 - y0, c, extra)
const bands = (cols, y0 = 0, y1 = CONE_H) => cols.map((c, i) => band(y0 + (y1 - y0) * i / cols.length, y0 + (y1 - y0) * (i + 1) / cols.length + 0.01, c)).join('')
const circle = (cx, cy, r, c, extra = '') => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${c}"${extra}/>`
const poly = (pts, c, extra = '') => `<polygon points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${c}"${extra}/>`
const path = (d, stroke, w, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`
const fillPath = (d, c, extra = '') => `<path d="${d}" fill="${c}"${extra}/>`
const g = (x, y, rot, body, s = 1) => `<g transform="translate(${f(x)},${f(y)}) rotate(${f(rot)}) scale(${f(s)})">${body}</g>`
const star = (cx, cy, r, c, points = 5, inner = 0.45) => poly(Array.from({ length: points * 2 }, (_, i) => {
  const a = -Math.PI / 2 + i * Math.PI / points, rr = i % 2 ? r * inner : r
  return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]
}), c)
const heart = (cx, cy, s, c) => fillPath(`M${f(cx)},${f(cy + 3 * s)} C${f(cx - 6 * s)},${f(cy - 1 * s)} ${f(cx - 3 * s)},${f(cy - 5 * s)} ${f(cx)},${f(cy - 2 * s)} C${f(cx + 3 * s)},${f(cy - 5 * s)} ${f(cx + 6 * s)},${f(cy - 1 * s)} ${f(cx)},${f(cy + 3 * s)} Z`, c)
/** Anything near the seam is drawn again one frame-width over, so it wraps around the cone. */
const wrapped = (x, draw, m = 14) => draw(x) + (x < m ? draw(x + FRAME_W) : '') + (x > FRAME_W - m ? draw(x - FRAME_W) : '')
const scatter = (seed, n, y0, y1, draw) => { const r = rng(seed); let s = ''; for (let i = 0; i < n; i++) { const x = r() * FRAME_W, y = y0 + r() * (y1 - y0); s += wrapped(x, (xx) => draw(xx, y, r)) } return s }
/** Poisson-ish: random, but never closer than `min` (irregular without clumps). */
function scatterApart(seed, n, y0, y1, min, draw) {
  const r = rng(seed), pts = []
  for (let tries = 0; pts.length < n && tries < n * 60; tries++) {
    const x = r() * FRAME_W, y = y0 + r() * (y1 - y0)
    if (pts.every(([px, py]) => { const dx = Math.min(Math.abs(px - x), FRAME_W - Math.abs(px - x)); return dx * dx + (py - y) ** 2 >= min * min })) pts.push([x, y])
  }
  return pts.map(([x, y]) => wrapped(x, (xx) => draw(xx, y, r))).join('')
}

const C = {
  red: '#ff1f2d', white: '#fff6e8', gold: '#ffc23a', green: '#14c24a', deepGreen: '#0a7a2c', blue: '#1f5cff',
  navy: '#0a1e66', brown: '#a8521c', tan: '#f0a860', orange: '#ff6200', purple: '#a23cff', silver: '#d8e4ff',
  amber: '#c98a12', pink: '#ff3fa4', cyan: '#18e6ff', lime: '#9dff1a', yellow: '#ffe81a',
}

const LOOKS = []
/** A look: layers bottom to top. layer = { motion, pin, cone, frames, fps }; pin/cone are SVG or (phase) => SVG. */
const look = (id, name, notes, layers) => LOOKS.push({ id, name, notes, layers })
const L = (motion, cone, pin = '', extra = {}) => ({ motion, cone, pin, ...extra })

// ═══ SANTA ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
look('santa', 'Santa', 'White at the pinnacle and down to the coat · red coat · black belt with a gold buckle on every face · red coat · white trim · red pants · white boot tops.', [
  L({ kind: 'still' },
    band(0, 18, C.white) + band(18, 36, C.red) + band(36, 44, '#000') + band(44, 60, C.red) + band(60, 66, C.white) + band(66, 88, C.red) + band(88, 96, C.white) +
    perFace((cx) => rect(cx - 8, 33, 16, 14, C.gold) + rect(cx - 4.5, 36.5, 9, 7, '#000') + rect(cx - 1, 39, 6, 2, C.gold)),
    band(0, PIN_H, C.white)),
])

look('santas-hat', "Santa's Hat", 'The whole tree is the hat: red up to the balcony ridge, a fluffy white brim at the ground ring, and the pinnacle is the white puff. The fur sparkles.', [
  L({ kind: 'twinkle', only: C.white }, () => {
    const r = rng(101); let brim = `M-2,96 L-2,78`
    for (let x = 0; x <= FRAME_W + 2; x += 3) brim += ` L${x},${78 + (r() - 0.5) * 3}`
    return band(0, CONE_H, C.red) + fillPath(`${brim} L${FRAME_W + 2},96 Z`, C.white)
  }, band(0, PIN_H, C.white)),
])

// ═══ SNOWMAN: abstract, a stack of bands (Jacob, 2026-10-31), with the coal buttons kept and the nose orange circles. ═══
/** Diagonal stripes in one band, rows y0…y1: seamless round the tree (the repeat, sw × colours, divides FRAME_W). */
function diagBand(y0, y1, cols, sw = 6) {
  if (FRAME_W % (sw * cols.length)) throw new Error(`diagBand: a repeat of ${sw * cols.length} does not divide ${FRAME_W}, so the stripes would break at the seam`)
  const h = y1 - y0; let s = ''
  for (let i = -Math.ceil(h / sw) - 2; i * sw < FRAME_W + 2; i++) { const x = i * sw; s += poly([[x, y0], [x + sw + 0.2, y0], [x + sw + 0.2 + h, y1], [x + h, y1]], cols[((i % cols.length) + cols.length) % cols.length]) }
  return s
}
look('snowman', 'Snowman', 'Abstract, in bands from the ground up: a snowball, a line, a snowball with coal buttons, thin brown arms, white, a diagonally striped red-and-white scarf, white, orange circles for the nose, white, a thin black band of eyes, a white forehead. His black hat with a red band is the pinnacle.', [
  L({ kind: 'still' }, () =>
    band(0, CONE_H, C.white) +
    band(8, 10.5, '#000') +                                                    // the eyes
    perFace((cx) => circle(cx, 16, 2.6, C.orange)) +                           // the nose
    diagBand(22, 30, [C.red, C.white]) +                                       // the scarf
    band(36, 38.5, C.brown) +                                                  // the arms
    band(62, 63.3, '#000') +                                                   // the line between the snowballs
    perFace((cx) => circle(cx, 46, 2.4, '#000') + circle(cx, 55, 2.4, '#000') + circle(cx, 76, 2.6, '#000')),   // the buttons
  band(0, PIN_H, '#000') + band(11, 14, C.red)),
])

look('rudolph', 'Rudolph', 'No antlers: brown, the tan stripe, and a scalloped hem low on the tree; where each pair of scallops meets, a red nose glows and pulses, two eyes above it. The pinnacle washes red.', [
  L({ kind: 'pulse', only: C.red, speed: 0.9 }, () => {
    const W = FRAME_W / 8, y = 70                               // eight scallops round the tree
    let s = band(0, CONE_H, C.brown) + band(30, 42, C.tan), d = `M${-W},96 L${-W},${y}`
    for (let i = -1; i <= 8; i++) d += ` Q${i * W + W / 2},${y + 16} ${(i + 1) * W},${y}`
    s += fillPath(d + ` L${FRAME_W + W},96 Z`, '#f3d9b0')
    for (let i = 0; i < 8; i++) s += wrapped(i * W, (x) => circle(x, y, 4.5, C.red) + circle(x - 5, y - 11, 1.8, C.white) + circle(x + 5, y - 11, 1.8, C.white) + circle(x - 5, y - 11, 0.9, '#000') + circle(x + 5, y - 11, 0.9, '#000'))
    return s
  }, band(0, PIN_H, C.red)),
])
// ═══ SNOW ════════════════════════════════════════════════════════════════════════════════════════════════════════════
function treeline(seed) {   // a ring of pines round the base, black = bulbs off, in front of the falling snow
  const r = rng(seed); let s = band(90, 96, '#000')
  for (let x = -6; x < FRAME_W + 6; x += 5 + r() * 5) {
    const h = 14 + r() * 16, w = 5 + r() * 4, base = 96
    s += poly([[x, base - h], [x - w, base - h * 0.45], [x - w * 0.6, base - h * 0.45], [x - w * 1.3, base], [x + w * 1.3, base], [x + w * 0.6, base - h * 0.45], [x + w, base - h * 0.45]], '#000')
  }
  return s
}
look('snowfall', 'Snowfall', 'Snow falling in front of a ring of dark pines, the night sky brightening to a glow just above the treetops.', [
  L({ kind: 'still' }, `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050f3d"/><stop offset="0.5" stop-color="#0d2a80"/><stop offset="0.78" stop-color="#3f7ad6"/><stop offset="0.9" stop-color="#a8d0ff"/></linearGradient></defs>` + band(0, CONE_H, 'url(#sky)'), band(0, PIN_H, '#050f3d')),
  L({ kind: 'still' }, treeline(7)),
  L({ kind: 'fall', speed: 6 }, scatter(4, 170, 0, 96, (x, y, r) => circle(x, y, 0.6 + r() * 0.7, C.white)), scatter(5, 30, 0, 18, (x, y, r) => circle(x, y, 0.7, C.white))),
])
function flake(R, c, w = 1.4) {
  let d = ''
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, ex = R * Math.cos(a), ey = R * Math.sin(a)
    d += `M0,0 L${f(ex)},${f(ey)} `
    const bx = R * 0.55 * Math.cos(a), by = R * 0.55 * Math.sin(a)
    for (const s of [-1, 1]) d += `M${f(bx)},${f(by)} L${f(bx + R * 0.32 * Math.cos(a + s * 0.9))},${f(by + R * 0.32 * Math.sin(a + s * 0.9))} `
  }
  return path(d, c, w)
}
const TUMBLE = 8
look('snowflakes', 'Snowflakes', 'Six-armed flakes tumbling as they fall, on bright blue; the pinnacle glows white.', [
  L({ kind: 'still' }, band(0, CONE_H, '#0d3fa8'), band(0, PIN_H, C.white)),
  L({ kind: 'fall', speed: 5 }, (ph) => perFace((cx, k) =>
    g(cx - 11, 14, ph * 60 + k * 9, flake(9, C.white)) + g(cx + 11, 44, -ph * 60 + k * 5, flake(10, C.white)) + g(cx - 7, 76, ph * 60, flake(9, C.silver))),
  '', { frames: TUMBLE, fps: 6, turn: 'tumble' }),
])

// ═══ GIFTS: two parcels, opposite sides; a ribbon wrapping each diagonally, a big bow in the middle of the top. ═════
/** Wrapping paper: stripes `sw` rows thick, running the LONG way round the tree, a shallow diagonal that drops `lap`
 *  rows per lap (Jacob, 2026-10-31: "horizontally diagonal instead of vertically; on the long dimension"). dir ±1 slants
 *  them either way. ⭐ Seamless only if a lap drops a whole number of repeats (sw × colours): refused otherwise. */
function wrapPaper(cols, sw, dir, lap = 48) {
  if (lap % (sw * cols.length)) throw new Error(`wrapPaper: a lap of ${lap} rows is not a whole number of ${sw * cols.length}-row repeats, so the stripes would break at the seam`)
  const k = dir * lap / FRAME_W; let s = ''
  for (let i = -Math.ceil((lap + sw) / sw) - 1; i * sw < CONE_H + lap + sw; i++) {
    const y = i * sw - (dir > 0 ? lap : 0)
    s += poly([[-2, y - 2 * k], [FRAME_W + 2, y + (FRAME_W + 2) * k], [FRAME_W + 2, y + sw + 0.2 + (FRAME_W + 2) * k], [-2, y + sw + 0.2 - 2 * k]], cols[((i % cols.length) + cols.length) % cols.length])
  }
  return s
}
look('gift-red', 'Red Gift', 'The whole tree wrapped like a present: stripes of red and gold spiralling the long way round it.', [
  L({ kind: 'still' }, () => wrapPaper([C.red, C.gold], 8, 1), band(0, PIN_H, C.gold)),
])
look('gift-pride', 'Pride Gift', 'The whole tree wrapped like a present in the Pride flag: stripes red through violet, spiralling the long way round it.', [
  L({ kind: 'still' }, () => wrapPaper(RAINBOW, 8, 1), band(0, PIN_H, C.white)),
])
// ═══ CANDY ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
look('candy-cane', 'Candy Cane', 'Red and white spiralling from the ridge to the ground, turning.', [
  L({ kind: 'spin', speed: 10 }, () => {
    let s = band(0, CONE_H, C.white)
    for (let x0 = -FRAME_W; x0 < FRAME_W * 2; x0 += 24) s += poly([[x0, 0], [x0 + 12, 0], [x0 + 12 + 48, CONE_H], [x0 + 48, CONE_H]], C.red)
    return s
  }, () => { let s = band(0, PIN_H, C.white); for (let x0 = -FRAME_W; x0 < FRAME_W * 2; x0 += 24) s += poly([[x0, 0], [x0 + 12, 0], [x0 + 21, PIN_H], [x0 + 9, PIN_H]], C.red); return s }),
])

const PEPPER = 6
look('peppermint', 'Peppermint', 'A peppermint pinwheel on every face, each spinning in place, between bands of diagonal green and gold stripes; red pinnacle.', [
  L({ kind: 'still' }, () => diagBand(0, 10, [C.green, C.gold]) + band(10, 86, '#000') + diagBand(86, 96, [C.green, C.gold]), band(0, PIN_H, C.red)),
  L({ kind: 'still' }, (ph) => perFace((cx) => {
    let s = circle(cx, 48, 18, C.white)
    for (let i = 0; i < 8; i += 2) {
      const a0 = i * Math.PI / 4 + ph * Math.PI / 2, a1 = a0 + Math.PI / 4
      s += poly([[cx, 48], [cx + 18 * Math.cos(a0), 48 + 18 * Math.sin(a0)], [cx + 18 * Math.cos((a0 + a1) / 2), 48 + 18 * Math.sin((a0 + a1) / 2)], [cx + 18 * Math.cos(a1), 48 + 18 * Math.sin(a1)]], C.red)
    }
    return s + circle(cx, 48, 3, C.red)
  }), '', { frames: PEPPER, fps: 8, turn: 'turn' }),
])

// ═══ HOLLY & BELLS ═══════════════════════════════════════════════════════════════════════════════════════════════════
function leaf(cx, cy, len, ang, c) {
  const pts = [], n = 5
  for (let i = 0; i <= n; i++) { const t = i / n, w = Math.sin(t * Math.PI) * len * 0.32; pts.push([t * len, -w * (i % 2 ? 0.7 : 1)]) }
  for (let i = n - 1; i > 0; i--) { const t = i / n, w = Math.sin(t * Math.PI) * len * 0.32; pts.push([t * len, w * (i % 2 ? 0.7 : 1)]) }
  return poly(pts.map(([x, y]) => [cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)]), c)
}
look('holly', 'Holly', 'Holly sprigs, two to a face, on dark green; the red berries twinkle, and the pinnacle is a berry.', [
  L({ kind: 'twinkle', only: C.red }, band(0, CONE_H, '#0b3a17') + perFace((cx) => [[cx - 6, 26], [cx + 10, 66]].map(([x, y]) =>
    leaf(x, y, 16, -2.5, C.green) + leaf(x, y, 16, -0.6, '#7dff5a') + leaf(x, y, 14, 1.4, C.green) +
    circle(x - 1.5, y - 1, 2.2, C.red) + circle(x + 2, y + 1.5, 2.2, C.red) + circle(x - 2, y + 3, 2.2, C.red)).join('')),
  band(0, PIN_H, C.red)),
])

const bellShape = (s, c, rim) => fillPath(`M${-9 * s},${12 * s} Q${-9 * s},${-8 * s} 0,${-10 * s} Q${9 * s},${-8 * s} ${9 * s},${12 * s} Z`, c) +
  rect(-10 * s, 11 * s, 20 * s, 3 * s, rim) + circle(0, 16 * s, 2.4 * s, rim) + circle(0, -11 * s, 1.6 * s, rim)
const SWING = 8
look('bells', 'Bells', 'Two big pairs of gold bells on opposite sides, swinging under a red bow, on green; gold pinnacle.', [
  L({ kind: 'still' }, band(0, CONE_H, C.deepGreen) + halves((cx) =>
    `<ellipse cx="${cx - 9}" cy="20" rx="9" ry="6" fill="${C.red}"/><ellipse cx="${cx + 9}" cy="20" rx="9" ry="6" fill="${C.red}"/>` +
    poly([[cx - 2, 22], [cx - 10, 40], [cx - 5, 40], [cx, 25]], C.red) + poly([[cx + 2, 22], [cx + 10, 40], [cx + 5, 40], [cx, 25]], C.red) + circle(cx, 21, 3.2, C.red)),
  band(0, PIN_H, C.gold)),
  L({ kind: 'still' }, (ph) => halves((cx) => {
    const a = 16 * Math.sin(ph * 2 * Math.PI)
    return g(cx - 13, 30, a, `<g transform="translate(0,22)">${bellShape(1.9, C.gold, C.amber)}</g>`) +
      g(cx + 13, 30, -a, `<g transform="translate(0,22)">${bellShape(1.9, C.gold, C.amber)}</g>`)
  }), '', { frames: SWING, fps: 6, turn: 'swing' }),
])

look('stars', 'Stars', 'Gold and white stars spread evenly over night blue, never clumped; they twinkle; the pinnacle washes gold.', [
  L({ kind: 'twinkle' }, band(0, CONE_H, '#06134a') + scatterApart(11, 34, 6, 92, 15, (x, y, r) => star(x, y, 2.6 + r() * 2.6, r() > 0.3 ? C.gold : C.white)), band(0, PIN_H, C.gold)),
])
// ═══ HANUKKAH ════════════════════════════════════════════════════════════════════════════════════════════════════════
look('menorah', 'Menorah', 'The whole tree is one menorah, kept geometric: nine white candle stripes rising from a white bar round the tree, the shamash taller, a gold square flame on each; only the flames flicker.', [
  L({ kind: 'twinkle', only: C.gold }, () => {
    let s = band(0, CONE_H, '#0b2a8c') + band(80, 84, C.white) + band(84, CONE_H, '#04124a')
    for (let i = 0; i < 9; i++) {
      const x = FRAME_W * (i + 0.5) / 9, top = i === 4 ? 30 : 40                  // the shamash stands taller
      s += wrapped(x, (xx) => rect(xx - 2, top, 4, 80 - top, C.white) + rect(xx - 2, top - 6, 4, 4, C.gold))
    }
    return s
  }, band(0, PIN_H, '#9fc0ff')),
])

const DREIDEL_LETTERS = ['נ', 'ג', 'ה', 'ש']
look('dreidel', 'Dreidel', 'The whole tree is one dreidel: a silver handle at the pinnacle, a blue body, one great gold letter on each face (nun, gimel, hey, shin), tapering to its point; the tree turns, so it spins its letters past you.', [
  L({ kind: 'spin', speed: 12 }, () => band(0, CONE_H, '#123a9e') + band(0, 5, C.silver) + perFace((cx, k) => {
    const x0 = cx - FACE_W / 2
    return ''+
      `<text x="${cx}" y="60" text-anchor="middle" font-family="Arial Hebrew, David, Arial, sans-serif" font-weight="700" font-size="46" fill="${C.gold}">${DREIDEL_LETTERS[k]}</text>` +
      poly([[x0, 72], [cx, 95], [x0 + FACE_W, 72], [x0 + FACE_W, 97], [x0, 97]], '#06134a')
  }), band(0, PIN_H, C.silver)),
])
// ═══ KWANZAA ═════════════════════════════════════════════════════════════════════════════════════════════════════════
const KWANZAA_SPARKS = 8
look('kwanzaa-bands', 'Kwanzaa Bands', 'Red over black over green, rising slowly, with gold sparkles in the black; red pinnacle.', [
  L({ kind: 'rise', speed: 4 }, bands([C.red, '#000', C.green]), band(0, PIN_H, C.red)),
  // the sparkles ride with the bands (the same rise), and the system draws them coming and going, frame by frame
  L({ kind: 'rise', speed: 4 }, (ph) => scatter(300 + Math.round(ph * KWANZAA_SPARKS), 36, CONE_H / 3 + 1.5, CONE_H * 2 / 3 - 1.5, (x, y) => circle(x, y, 0.9, C.gold)),
    '', { frames: KWANZAA_SPARKS, fps: 6, turn: 'sparkle' }),
])

// ═══ DOVES: peace, ecclesiastical ═══════════════════════════════════════════════════════════════════════════════════
const dove = (c) =>
  fillPath('M-12,2 Q-4,-3 6,-1 Q10,-4 13,-2 L16,-1 L13,1 Q11,5 4,6 Q-6,8 -14,6 L-19,9 L-17,4 L-20,1 Z', c) +   // body, tail fan, head
  fillPath('M-4,-1 Q-10,-14 2,-20 Q0,-10 4,-2 Z', c) + fillPath('M0,-1 Q6,-12 16,-14 Q8,-6 4,0 Z', c) +   // two raised wings
  path('M14,0 Q20,4 22,10', C.green, 1.2) + `<ellipse cx="19" cy="4" rx="1.6" ry="0.8" fill="${C.green}"/><ellipse cx="21" cy="8" rx="1.6" ry="0.8" fill="${C.green}"/>`
look('doves', 'Doves', 'A white dove with an olive sprig on every face, among gold rays that shimmer; white pinnacle.', [
  L({ kind: 'twinkle', only: C.gold }, band(0, CONE_H, '#0c2470') + perFace((cx) => { let s = ''; for (let i = -3; i <= 3; i++) s += path(`M${cx + i * 1.5},0 L${cx + i * 7},96`, C.gold, 1.1); return s }), band(0, PIN_H, C.white)),
  L({ kind: 'still' }, perFace((cx, k) => g(cx + (k % 2 ? 6 : -6), [44, 60, 76, 52][k], 0, dove(C.white), 1.1))),
])
// ═══ PRIDE ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
const RAINBOW = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787']
look('progress-pride', 'Progress Pride', 'Two flags on opposite sides, turned upright: the rainbow in vertical stripes, and the Progress chevron rising from the ground, white at its heart, through pink, light blue and brown to black. The chevron is a motion object: in the Chevron transition it rises into place, pauses, and rises on to reveal the next look.', [
  L({ kind: 'still' }, () => halves((cx) => RAINBOW.map((c, i) => rect(cx - 48 + i * 16, 0, 16.2, CONE_H, c)).join('')), bands(['#5bcefa', '#f5a9b8', C.white], 0, PIN_H)),
  L({ kind: 'still' }, () => halves((cx) => ['#000', '#784f17', '#5bcefa', '#f5a9b8', C.white].map((c, i) => { const w = i ? 46 - i * 8 : 49;   // the black legs reach the seam, so neighbouring flags' chevrons meet at the ground
    return poly([[cx - w, 97], [cx, 26 + i * 10], [cx + w, 97]], c) }).join('')), '', { enter: 'rise' }),
])
const BEAR = ['#623804', '#d56300', '#fedd63', '#fee6b8', '#ffffff', '#555555', '#000000']
look('bear', 'Bear', 'A plaid woven from the bear pride colours, each kept distinct as light: dark brown and rust crossed with gold, tan, white and grey threads. The brown, tan and grey glow less, so they read as themselves beside the bright ones.', [
  L({ kind: 'still' }, () => {
    const BROWN = '#3e1c02', RUST = '#e05200', GOLD = '#ffcc1a', TAN = '#b8895a', WHITE = '#ffffff', GREY = '#3a3a3a'
    let s = band(0, CONE_H, BROWN)
    for (let y = 0; y < CONE_H; y += 24) s += band(y + 2, y + 11, RUST) + band(y + 13, y + 16, GOLD) + band(y + 18, y + 21, TAN)
    for (let x = 0; x < FRAME_W; x += 24) s += rect(x + 5, 0, 7, CONE_H, RUST, ' opacity="0.6"') + rect(x + 15, 0, 2.5, CONE_H, WHITE) + rect(x + 20, 0, 3, CONE_H, GREY) + rect(x, 0, 2, CONE_H, '#000')
    return s
  }, band(0, PIN_H, '#e05200')),
])
look('trans', 'Trans', 'Light blue, pink, white, pink, light blue, sparkling, with their average, a bright lilac, washing in over them and back out again. The look arrives on the lilac, and the lilac sparkles away, bulb by bulb, into the flag (Jacob, 2026-10-31: after the Progress flag\u2019s chevron rises off to the lilac).', [
  L({ kind: 'twinkle' }, bands(['#5bcefa', '#f5a9b8', '#ffffff', '#f5a9b8', '#5bcefa']), band(0, PIN_H, C.white)),
  L({ kind: 'fade', out: 2.5 }, band(0, CONE_H, '#b46cff'), band(0, PIN_H, '#b46cff')),
])
const RIBBON_FRAMES = 300, RIBBON_FPS = 12                  // 25 s, played ONCE from the look's start, holding its last frame
/** One diagonal line of the ribbon, drawn from the ridge down to row `d`: its top centred at column xt, slanting s = ±1
 *  (48 columns across the cone's height), drawn again a frame-width over each way so it wraps round the tree. */
const ribbonLine = (s, xt, d = CONE_H, op = 1) => d <= 0 ? '' : [-FRAME_W, 0, FRAME_W].map(o => poly([[xt + o - 6, 0], [xt + o + 6, 0], [xt + o + 6 + s * 48 * d / CONE_H, d], [xt + o - 6 + s * 48 * d / CONE_H, d]], C.red, op < 1 ? ` opacity="${f(op)}"` : '')).join('')
const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }
// Every face's crossing: a /\ whose legs cross a quarter of the way down, like the ribbon's loop. The KEPT face is the
// one that stays: the AIDS ribbon (Jacob, 2026-10-31: "the central /\").
const RIBBON_KEEP = [0]
const RIBBON_LINES = Array.from({ length: FACES }, (_, k) => [[1, faceCx(k) - 12, k], [-1, faceCx(k) + 12, k]]).flat()
look('red-ribbon', 'Red Ribbon', 'Starts black. Red ribbons draw on, one after another, swirling round the tree into a lattice; the pinnacle comes up to half; every ribbon but the central /\\ fades away, leaving the AIDS ribbon; the pinnacle comes up to full, and it holds. One play is 25 seconds.', [
  L({ kind: 'still' }, (ph) => {
    const T = ph * RIBBON_FRAMES / RIBBON_FPS, others = 1 - ease((T - 15) / 3)       // draw on 1–11 s · the rest fade 15–18 s
    return band(0, CONE_H, '#000') + RIBBON_LINES.map(([sl, xt, k], i) => {
      const d = ease((T - 1 - i * 1.2) / 1.6) * CONE_H, op = RIBBON_KEEP.includes(k) ? 1 : others
      return op > 0.01 ? ribbonLine(sl, xt, d, op) : ''
    }).join('')
  }, (ph) => {
    const T = ph * RIBBON_FRAMES / RIBBON_FPS, p = 0.5 * ease((T - 11) / 1.5) + 0.5 * ease((T - 18) / 1.5)   // half at 11–12.5 s, full at 18–19.5 s
    return band(0, PIN_H, '#000') + (p > 0.01 ? band(0, PIN_H, C.red, ` opacity="${f(p)}"`) : '')
  }, { frames: RIBBON_FRAMES, fps: RIBBON_FPS, turn: 'build', once: true }),
])
// ═══ TREES & TRIMMINGS ═══════════════════════════════════════════════════════════════════════════════════════════════
look('plaid', 'Plaid', 'Red tartan with green bands, dark threads and a gold line; green pinnacle.', [
  L({ kind: 'still' }, () => {
    let s = band(0, CONE_H, '#d0101c')
    for (let y = 4; y < CONE_H; y += 24) s += band(y, y + 9, C.deepGreen, ' opacity="0.85"') + band(y + 12, y + 13.2, C.gold)
    for (let x = 6; x < FRAME_W; x += 24) s += rect(x, 0, 9, CONE_H, C.deepGreen, ' opacity="0.6"') + rect(x + 12, 0, 1.2, CONE_H, C.gold) + rect(x + 3.5, 0, 2, CONE_H, '#000', ' opacity="0.6"')
    return s
  }, band(0, PIN_H, C.deepGreen)),
])

look('gingerbread', 'Gingerbread', 'Brown with white icing zigzags and gumdrops in red and green; the pinnacle is icing.', [
  L({ kind: 'still' }, () => {
    let s = band(0, CONE_H, C.brown)
    for (const y of [14, 38, 62, 86]) { let d = `M-2,${y}`; for (let x = 0; x <= FRAME_W + 2; x += 6) d += ` L${x},${y + ((x / 6) % 2 ? 3 : -3)}`; s += path(d, C.white, 1.8) }
    const r = rng(19); for (const y of [26, 50, 74]) for (let x = 6; x < FRAME_W; x += 12) s += circle(x, y, 2.2, r() > 0.5 ? C.red : C.green)
    return s
  }, band(0, PIN_H, C.white)),
])

look('ornaments', 'Ornaments', 'Baubles in red, gold, blue, silver and purple on deep green; they twinkle; gold pinnacle.', [
  L({ kind: 'twinkle' }, band(0, CONE_H, '#063d18') + scatter(20, 40, 4, 92, (x, y, r) => {
    const rr = 2.6 + r() * 2.4, c = [C.red, C.gold, C.blue, C.silver, C.purple][Math.floor(r() * 5)]
    return circle(x, y, rr, c) + circle(x - rr * 0.35, y - rr * 0.35, rr * 0.3, C.white)
  }), band(0, PIN_H, C.gold)),
])

/** Swags round the tree: a whole number of swags per row, so the repeat closes at the seam. */
function swags(rows, colour, bead) {
  const N = FACES * 2, W = FRAME_W / N
  return rows.map((y, row) => Array.from({ length: N + 1 }, (_, i) => {
    const x0 = i * W + (row % 2 ? W / 2 : 0) - W, x1 = x0 + W
    return path(`M${f(x0)},${y} Q${f((x0 + x1) / 2)},${y + 13} ${f(x1)},${y}`, colour(row, i), 2.4) + circle(x1, y, 2.4, bead)
  }).join('')).join('')
}
look('classic-tree', 'Classic Tree', 'A green tree hung with gold garland swags, a red bead where each meets the next, and multicoloured bulbs placed irregularly that twinkle; the pinnacle washes gold.', [
  L({ kind: 'twinkle' }, band(0, CONE_H, '#0b6b25') + scatterApart(22, 300, 2, 94, 3.6, (x, y, r) => circle(x, y, 1.3, [C.red, C.gold, C.blue, '#ff7a12', C.purple, C.white][Math.floor(r() * 6)])), band(0, PIN_H, C.gold)),
  L({ kind: 'still' }, swags([20, 46, 72], () => C.gold, C.red)),
])
look('white-bulbs', 'White Bulbs', 'The classic: a deep green tree with individual warm-white bulbs, irregular; the pinnacle washes gold.', [
  L({ kind: 'twinkle' }, band(0, CONE_H, '#033a14') + scatterApart(23, 330, 2, 94, 3.4, (x, y) => circle(x, y, 1.2, '#fff1cf')), band(0, PIN_H, C.gold)),
])
const resolve = (v, ph) => typeof v === 'function' ? v(ph) : (v || '')
function frameSvg(layer, ph) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W}" height="${FRAME_H}" viewBox="0 0 ${FRAME_W} ${FRAME_H}">` +
    `<defs><clipPath id="pin"><rect width="${FRAME_W}" height="${PIN_H}"/></clipPath><clipPath id="cone"><rect y="${PIN_H}" width="${FRAME_W}" height="${CONE_H}"/></clipPath></defs>` +
    `<g clip-path="url(#pin)">${resolve(layer.pin, ph)}</g>` +
    `<g clip-path="url(#cone)"><g transform="translate(0,${PIN_H})">${resolve(layer.cone, ph)}</g></g></svg>\n`
}
rmSync(OUT, { recursive: true, force: true })
const manifest = []
for (const look of LOOKS) {
  mkdirSync(join(OUT, look.id), { recursive: true })
  const layers = look.layers.map((layer, li) => {
    const n = layer.frames || 1, files = []
    for (let k = 0; k < n; k++) {
      const file = `looks/${look.id}/${li}${n > 1 ? `-${k}` : ''}.svg`
      writeFileSync(join(DRAWER, file), frameSvg(layer, k / n)); files.push(file)
    }
    return { motion: layer.motion, ...(n > 1 ? { turn: layer.turn, fps: layer.fps, ...(layer.once ? { once: true } : {}) } : {}), ...(layer.enter ? { enter: layer.enter } : {}), frames: files }
  })
  manifest.push({ id: look.id, name: look.name, notes: look.notes, layers })
}
writeFileSync(join(DRAWER, 'looks.json'), JSON.stringify({ frame: { w: FRAME_W, h: FRAME_H, pinH: PIN_H, faces: FACES }, looks: manifest }, null, 2) + '\n')
console.log(`${manifest.length} looks → ${OUT}`)
