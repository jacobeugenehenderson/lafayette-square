#!/usr/bin/env node
/**
 * make-looks.mjs: draft 2 of the Light Show's starter looks (BRIEF-the-monument-lights-up §1), after Jacob's notes on
 * draft 1 (2026-10-31).
 *
 *   node scratch/displays-looks/make-looks.mjs   → scratch/displays-looks/looks/<id>/*.svg + looks.json
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
const OUT = join(HERE, 'looks')
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
  amber: '#c98a12', pink: '#ff3fa4', cyan: '#18e6ff', lime: '#9dff1a', yellow: '#ffe81a', snowShade: '#8fa6d6',
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

// ═══ FROSTY: three stacked snowballs, each shaded round; a diagonally striped scarf; a proper carrot. ══════════════
function snowball(y0, y1) {   // lit in the middle, falling to blue-grey at its top and bottom edges
  const id = `sb${y0}`
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.snowShade}"/><stop offset="0.35" stop-color="${C.white}"/><stop offset="0.6" stop-color="${C.white}"/><stop offset="1" stop-color="#5a6f9e"/></linearGradient></defs>` + band(y0, y1, `url(#${id})`)
}
look('frosty', 'Frosty', 'His black hat with a red band is the pinnacle. Three shaded snowballs stacked down the tree, coal eyes and a bright carrot on every face, a red-and-white striped scarf, coal buttons.', [
  L({ kind: 'still' }, () => {
    let s = snowball(0, 24) + snowball(31, 58) + snowball(59, 96) + band(58, 59.2, '#000')
    // the scarf: diagonal red and white stripes around the neck, with a hanging end on every face
    s += `<defs><pattern id="scarf" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="4" height="8" fill="${C.red}"/><rect x="4" width="4" height="8" fill="${C.white}"/></pattern></defs>`
    s += band(24, 31, 'url(#scarf)') + perFace((cx) => rect(cx + 7, 30, 7, 16, 'url(#scarf)'))
    s += perFace((cx) =>
      circle(cx - 5.5, 9, 2, '#000') + circle(cx + 5.5, 9, 2, '#000') +
      poly([[cx - 1, 12.5], [cx + 14, 15.5], [cx - 1, 18]], C.orange) + circle(cx - 3, 20.5, 0.9, '#000') + circle(cx, 21.4, 0.9, '#000') + circle(cx + 3, 20.5, 0.9, '#000') +
      circle(cx, 39, 2.4, '#000') + circle(cx, 48, 2.4, '#000') + circle(cx, 71, 2.6, '#000'))
    return s
  }, band(0, PIN_H, '#000') + band(11, 14, C.red)),
])

look('rudolph', 'Rudolph', 'The pinnacle is his nose, glowing red to light the way, and it pulses; gold antlers, brown coat, a tan band, a small nose on every face too.', [
  L({ kind: 'pulse', only: C.red, speed: 0.9 },
    band(24, 96, C.brown) + band(56, 70, C.tan) + perFace((cx) =>
      path(`M${cx - 6},24 L${cx - 12},8 L${cx - 18},1 M${cx - 12},8 L${cx - 20},10 M${cx - 9},16 L${cx - 4},6`, C.gold, 2.2) +
      path(`M${cx + 6},24 L${cx + 12},8 L${cx + 18},1 M${cx + 12},8 L${cx + 20},10 M${cx + 9},16 L${cx + 4},6`, C.gold, 2.2) +
      circle(cx - 5, 30, 1.5, C.white) + circle(cx + 5, 30, 1.5, C.white) + circle(cx, 38, 4.5, C.red)),
    band(0, PIN_H, C.red)),
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
look('snowfall', 'Snowfall', 'Snow falling on night blue, behind a ring of dark pines around the base of the tree.', [
  L({ kind: 'still' }, band(0, CONE_H, C.navy), band(0, PIN_H, C.navy)),
  L({ kind: 'fall', speed: 6 }, scatter(4, 170, 0, 96, (x, y, r) => circle(x, y, 0.6 + r() * 0.7, C.white)), scatter(5, 30, 0, 18, (x, y, r) => circle(x, y, 0.7, C.white))),
  L({ kind: 'still' }, treeline(7)),
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
look('gifts', 'Gifts', 'Two big parcels on opposite sides, red with gold ribbon and green with white, each ribbon wrapping round diagonally to a big bow; gold sparkles above.', [
  L({ kind: 'still' }, () => halves((cx, k) => {
    const paper = [C.red, C.green][k], rib = [C.gold, C.white][k], x0 = cx - 44, x1 = cx + 44, top = 34
    return rect(x0, top, 88, 62, paper) + rect(x0, top, 88, 5, rib, ' opacity="0.55"') +
      poly([[x0, top + 10], [x0 + 12, top], [x1, top + 52], [x1 - 12, top + 62]], rib) +            // diagonal wrap
      poly([[x1 - 30, top], [x1 - 18, top], [x1, top + 16], [x1, top + 28]], rib) +
      poly([[x0, top + 40], [x0, top + 52], [x0 + 10, top + 62], [x0 + 22, top + 62]], rib) +
      `<ellipse cx="${cx - 11}" cy="${top - 9}" rx="12" ry="8" fill="none" stroke="${rib}" stroke-width="4"/>` +
      `<ellipse cx="${cx + 11}" cy="${top - 9}" rx="12" ry="8" fill="none" stroke="${rib}" stroke-width="4"/>` +
      poly([[cx - 2, top - 2], [cx - 12, top + 14], [cx - 6, top + 14], [cx, top + 2]], rib) + poly([[cx + 2, top - 2], [cx + 12, top + 14], [cx + 6, top + 14], [cx, top + 2]], rib) +
      circle(cx, top - 3, 4, rib)
  }) + band(0, 13, '#000'), band(0, PIN_H, C.gold)),
  L({ kind: 'twinkle' }, scatter(66, 26, 0, 14, (x, y) => circle(x, y, 0.8, C.gold))),
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
look('peppermint', 'Peppermint', 'A peppermint pinwheel on every face, each spinning in place, between green bands; red pinnacle.', [
  L({ kind: 'still' }, band(0, 10, C.green) + band(10, 86, '#000') + band(86, 96, C.green), band(0, PIN_H, C.red)),
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

look('stars', 'Stars', 'Gold and white stars on night blue, a big star on every face of the pinnacle; they twinkle.', [
  L({ kind: 'twinkle' }, band(0, CONE_H, '#06134a') + scatter(11, 26, 6, 92, (x, y, r) => star(x, y, 2.4 + r() * 3, r() > 0.3 ? C.gold : C.white)),
    band(0, PIN_H, '#06134a') + perFace((cx) => star(cx, 9, 8, C.gold))),
])

// ═══ HANUKKAH ════════════════════════════════════════════════════════════════════════════════════════════════════════
look('menorah', 'Menorah', 'A nine-branched menorah on every face, the shamash raised, on bands of blue: blue, darkest blue, dark blue, blue, lighter blue. Only the flames flicker.', [
  L({ kind: 'twinkle', only: C.gold }, bands(['#1f5cff', '#04124a', '#0b2a8c', '#1f5cff', '#6fa0ff']) + perFace((cx) => {
    let s = rect(cx - 18, 70, 36, 2.5, C.white) + rect(cx - 1.5, 72, 3, 14, C.white) + rect(cx - 8, 86, 16, 3, C.white)
    for (let i = -4; i <= 4; i++) {
      const x = cx + i * 4, top = i === 0 ? 40 : 46
      s += rect(x - 1, top, 2, 70 - top, C.white) + `<ellipse cx="${x}" cy="${top - 3}" rx="1.4" ry="2.6" fill="${C.gold}"/>`
    }
    return s
  }), band(0, PIN_H, '#9fc0ff')),
])

const DREIDEL_LETTERS = ['נ', 'ג', 'ה', 'ש']
look('dreidel', 'Dreidel', 'A dreidel on every face, each showing a different letter (nun, gimel, hey, shin), and the whole tree turns, so the dreidel spins its letters past you.', [
  L({ kind: 'spin', speed: 14 }, band(0, CONE_H, '#08206e') + scatter(13, 40, 0, 96, (x, y) => circle(x, y, 0.6, C.silver)) + perFace((cx, k) => {
    const body = [C.blue, C.silver, C.gold, '#6fa0ff'][k], ink = k === 1 || k === 2 ? '#08206e' : C.white
    return rect(cx - 2, 14, 4, 12, C.silver) + rect(cx - 15, 26, 30, 34, body) + poly([[cx - 15, 60], [cx + 15, 60], [cx, 80]], body) +
      `<text x="${cx}" y="52" text-anchor="middle" font-family="Arial Hebrew, David, Arial, sans-serif" font-weight="700" font-size="24" fill="${ink}">${DREIDEL_LETTERS[k]}</text>`
  }), band(0, PIN_H, C.gold)),
])

// ═══ KWANZAA ═════════════════════════════════════════════════════════════════════════════════════════════════════════
const kente = (x, y, w, h) => { let s = ''; const cols = [C.gold, C.red, C.green, '#000', C.gold, C.green, C.red]; for (let i = 0; i * 3 < w; i++) s += rect(x + i * 3, y, 3, h, cols[i % cols.length]); return s }
look('kinara', 'Kinara', 'A kinara on every face, its holder woven in kente colours: three red candles, the black one in the centre, three green; behind it, warm bands with a kente stripe; the pinnacle is red, black and green. Only the flames flicker.', [
  L({ kind: 'twinkle', only: C.gold }, bands(['#5c3f0a', '#7a530c', '#9c6b10', '#7a530c', '#4a3208']) + kente(0, 22, FRAME_W, 4) + kente(0, 90, FRAME_W, 3) + perFace((cx) => {
    let s = kente(cx - 18, 70, 36, 5) + rect(cx - 14, 75, 28, 4, C.amber) + kente(cx - 10, 79, 20, 3)
    const col = [C.red, C.red, C.red, '#000', C.green, C.green, C.green]
    for (let i = 0; i < 7; i++) {
      const x = cx + (i - 3) * 4.6, top = 44 + Math.abs(i - 3) * 2
      s += rect(x - 1.4, top, 2.8, 70 - top, col[i]) + `<ellipse cx="${x}" cy="${top - 3}" rx="1.4" ry="2.6" fill="${C.gold}"/>`
    }
    return s
  }), bands([C.red, '#000', C.green], 0, PIN_H)),
])

look('kwanzaa-bands', 'Kwanzaa Bands', 'Red over black over green, rising slowly; red pinnacle.', [
  L({ kind: 'rise', speed: 4 }, bands([C.red, '#000', C.green]), band(0, PIN_H, C.red)),
])

// ═══ DOVES: peace, ecclesiastical ═══════════════════════════════════════════════════════════════════════════════════
const dove = (c) =>
  fillPath('M-12,2 Q-4,-3 6,-1 Q10,-4 13,-2 L16,-1 L13,1 Q11,5 4,6 Q-6,8 -14,6 L-19,9 L-17,4 L-20,1 Z', c) +   // body, tail fan, head
  fillPath('M-4,-1 Q-10,-14 2,-20 Q0,-10 4,-2 Z', c) + fillPath('M0,-1 Q6,-12 16,-14 Q8,-6 4,0 Z', c) +   // two raised wings
  path('M14,0 Q20,4 22,10', C.green, 1.2) + `<ellipse cx="19" cy="4" rx="1.6" ry="0.8" fill="${C.green}"/><ellipse cx="21" cy="8" rx="1.6" ry="0.8" fill="${C.green}"/>`
look('doves', 'Doves', 'Gold rays streaming down from a white pinnacle, and a white dove with an olive sprig on every face, rising; the rays shimmer.', [
  L({ kind: 'twinkle', only: C.gold }, band(0, CONE_H, '#0c2470') + perFace((cx) => {
    let s = ''; for (let i = -3; i <= 3; i++) s += path(`M${cx + i * 1.5},0 L${cx + i * 7},96`, C.gold, 1.1)
    return s
  }), band(0, PIN_H, C.white)),
  L({ kind: 'rise', speed: 3 }, perFace((cx, k) => g(cx + (k % 2 ? 6 : -6), 50 + (k % 2 ? 14 : 0), 0, dove(C.white), 1.1))),
])

// ═══ PRIDE ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
const RAINBOW = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787']
look('pride', 'Pride', 'The rainbow flag, ridge to ground, rising slowly; white pinnacle.', [
  L({ kind: 'rise', speed: 3 }, bands(RAINBOW), band(0, PIN_H, C.white)),
])
look('progress-pride', 'Progress Pride', 'The rainbow with the Progress chevron (white, pink, light blue, brown, black) pointing round the tree from every face.', [
  L({ kind: 'still' }, bands(RAINBOW) + perFace((cx) => {
    const x0 = cx - FACE_W / 2, tip = x0 + 30, cols = ['#000', '#784f17', '#5bcefa', '#f5a9b8', C.white]
    return cols.map((c, i) => poly([[x0 - 1, -1], [tip - i * 5, 48], [x0 - 1, 97]], c)).join('')   // nested, black outermost
  }), bands(['#5bcefa', '#f5a9b8', C.white], 0, PIN_H)),
])
const BEAR = ['#623804', '#d56300', '#fedd63', '#fee6b8', '#ffffff', '#555555', '#000000']
const paw = (x, y) => `<ellipse cx="${x}" cy="${y + 5}" rx="7" ry="5.5" fill="#000"/>` + [[-7, -3], [-2.5, -6], [2.5, -6], [7, -3]].map(([dx, dy]) => `<ellipse cx="${x + dx}" cy="${y + dy}" rx="2.2" ry="2.8" fill="#000"/>`).join('')
look('bear', 'Bear', 'The bear pride stripes, dark brown to black, with a black paw on every face; brown pinnacle.', [
  L({ kind: 'still' }, bands(BEAR) + perFace((cx) => paw(cx - 12, 14)), band(0, PIN_H, '#623804')),
])
look('trans', 'Trans', 'Light blue, pink, white, pink, light blue, breathing slowly; white pinnacle.', [
  L({ kind: 'pulse', speed: 0.35 }, bands(['#5bcefa', '#f5a9b8', '#ffffff', '#f5a9b8', '#5bcefa']), band(0, PIN_H, C.white)),
])
look('red-ribbon', 'Red Ribbon', 'A red ribbon on every face, breathing slowly, among small white lights like a vigil of candles; red pinnacle.', [
  L({ kind: 'twinkle' }, scatter(31, 60, 0, 96, (x, y) => circle(x, y, 0.55, '#ffe9c0')), band(0, PIN_H, '#000')),
  L({ kind: 'pulse', speed: 0.25 }, perFace((cx) =>
    path(`M${cx - 10},84 L${cx + 3},44 Q${cx + 9},24 ${cx},20 Q${cx - 9},24 ${cx - 3},44 L${cx + 10},84`, C.red, 5)), band(0, PIN_H, C.red)),
])
const NEON = [C.pink, C.cyan, C.yellow, C.purple, C.lime, '#ff7a12']
look('rainbow-explosion', 'Rainbow Explosion', 'Neon rays bursting from the pinnacle and turning, neon garlands swagged round in every colour, hearts and stars sprinkled over all of it.', [
  L({ kind: 'spin', speed: 6 }, () => {
    let s = band(0, CONE_H, '#14002a')
    for (let i = 0; i < 24; i++) { const x = i * 8; s += poly([[x + 4, -2], [x + 4 + 2, -2], [x + 16, 98], [x - 6, 98]], NEON[i % NEON.length], ' opacity="0.8"') }
    return s
  }, band(0, PIN_H, C.pink)),
  L({ kind: 'still' }, () => swags([22, 48, 74], (row, i) => NEON[(row * 3 + i) % NEON.length], '#fff')),
  L({ kind: 'twinkle' }, scatter(77, 34, 4, 92, (x, y, r) => r() > 0.5 ? heart(x, y, 0.9, NEON[Math.floor(r() * 6)]) : star(x, y, 2.6, C.white))),
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
look('garland', 'Garland', 'Gold swags in three tiers, a red bead where each swag meets the next; the repeat closes all the way round.', [
  L({ kind: 'still' }, band(0, CONE_H, '#073d1a') + swags([20, 46, 72], () => C.gold, C.red), band(0, PIN_H, C.gold)),
])

look('classic-tree', 'Classic Tree', 'A green tree with multicoloured bulbs placed irregularly, never in rows; the pinnacle is the gold star; they twinkle.', [
  L({ kind: 'twinkle' }, band(0, CONE_H, '#0b6b25') + scatterApart(22, 300, 2, 94, 3.6, (x, y, r) => circle(x, y, 1.3, [C.red, C.gold, C.blue, '#ff7a12', C.purple, C.white][Math.floor(r() * 6)])),
    band(0, PIN_H, '#000') + perFace((cx) => star(cx, 9, 8.5, C.gold))),
])
look('white-bulbs', 'White Bulbs', 'The classic: a deep green tree with individual warm-white bulbs, irregular, and a gold star at the pinnacle.', [
  L({ kind: 'twinkle' }, band(0, CONE_H, '#033a14') + scatterApart(23, 330, 2, 94, 3.4, (x, y) => circle(x, y, 1.2, '#fff1cf')),
    band(0, PIN_H, '#000') + perFace((cx) => star(cx, 9, 8.5, C.gold))),
])

// ═══ JOY: block letters with real separation, lower on the tree, with snow falling over them. ═════════════════════
const LW = 12, LH = 26, ST = 4, GAP = 5
const J = (x, y) => rect(x, y, LW, ST, C.white) + rect(x + LW - ST - 2, y, ST, LH - 4, C.white) + `<path d="M${x},${y + LH - 9} L${x},${y + LH - 4} Q${x},${y + LH} ${x + 4},${y + LH} L${x + 6},${y + LH} Q${x + LW - 2},${y + LH} ${x + LW - 2},${y + LH - 5}" fill="none" stroke="${C.white}" stroke-width="${ST}"/>`
const O = (x, y) => `<rect x="${x + ST / 2}" y="${y + ST / 2}" width="${LW - ST}" height="${LH - ST}" rx="5" fill="none" stroke="${C.white}" stroke-width="${ST}"/>`
const Y = (x, y) => poly([[x, y], [x + ST, y], [x + LW / 2, y + 11], [x + LW - ST, y], [x + LW, y], [x + LW / 2 + ST / 2, y + 14], [x + LW / 2 + ST / 2, y + LH], [x + LW / 2 - ST / 2, y + LH], [x + LW / 2 - ST / 2, y + 14]], C.white)
look('joy', 'Joy', 'JOY on every face, block letters with clear gaps, low on the tree where it is widest, white on red between gold bands, with snow falling over it.', [
  L({ kind: 'still' }, band(0, CONE_H, '#c40d1c') + band(0, 5, C.gold) + band(91, 96, C.gold) + perFace((cx) => {
    const x = cx - (3 * LW + 2 * GAP) / 2, y = 54
    return J(x, y) + O(x + LW + GAP, y) + Y(x + 2 * (LW + GAP), y)
  }), band(0, PIN_H, C.gold)),
  L({ kind: 'fall', speed: 5 }, scatter(41, 70, 6, 90, (x, y, r) => circle(x, y, 0.55 + r() * 0.4, C.white))),
])

// ── write ────────────────────────────────────────────────────────────────────────────────────────────────────────────
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
      writeFileSync(join(HERE, file), frameSvg(layer, k / n)); files.push(file)
    }
    return { motion: layer.motion, ...(n > 1 ? { turn: layer.turn, fps: layer.fps } : {}), frames: files }
  })
  manifest.push({ id: look.id, name: look.name, notes: look.notes, layers })
}
writeFileSync(join(HERE, 'looks.json'), JSON.stringify({ frame: { w: FRAME_W, h: FRAME_H, pinH: PIN_H, faces: FACES }, looks: manifest }, null, 2) + '\n')
console.log(`${manifest.length} looks → ${OUT}`)
