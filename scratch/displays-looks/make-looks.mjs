#!/usr/bin/env node
/**
 * make-looks.mjs: draft 1 of the Light Show's starter looks (BRIEF-the-monument-lights-up §1).
 *
 *   node scratch/displays-looks/make-looks.mjs   → scratch/displays-looks/looks/*.svg + looks.json
 *
 * Each look is an SVG at the FRAME: the cone unrolled, x = around (FRAME_W strands), y = down a strand (FRAME_H bulbs,
 * 0 = the crown). One pixel = one bulb. A glyph that must be seen from every side repeats on every face (FACE_W columns,
 * centred on faceCx(k)); bands wrap the whole cone. Black is "bulbs off". Seeded, so a re-run is byte-identical.
 * ⚠️ Draft for Jacob's contact sheet: not wired to anything.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'looks')
export const FRAME_W = 192, FRAME_H = 96, FACES = 4, FACE_W = FRAME_W / FACES
const faceCx = (k) => FACE_W * k + FACE_W / 2
const perFace = (fn) => Array.from({ length: FACES }, (_, k) => fn(faceCx(k), k)).join('')

function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const f = (n) => +n.toFixed(2)
const rect = (x, y, w, h, c, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${c}"${extra}/>`
const band = (y0, y1, c) => rect(0, y0, FRAME_W, y1 - y0, c)
const circle = (cx, cy, r, c, extra = '') => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${c}"${extra}/>`
const poly = (pts, c, extra = '') => `<polygon points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${c}"${extra}/>`
const path = (d, stroke, w, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`
const star = (cx, cy, r, c, points = 5, inner = 0.45) => poly(Array.from({ length: points * 2 }, (_, i) => {
  const a = -Math.PI / 2 + i * Math.PI / points, rr = i % 2 ? r * inner : r
  return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]
}), c)
/** A scatter that wraps around the cone: anything near an edge is drawn again one frame-width over. */
const wrapped = (x, draw) => draw(x) + (x < 8 ? draw(x + FRAME_W) : '') + (x > FRAME_W - 8 ? draw(x - FRAME_W) : '')

const C = {
  red: '#ff1f2d', white: '#fff6e8', gold: '#ffc23a', green: '#14c24a', deepGreen: '#0a7a2c', blue: '#1f5cff',
  navy: '#0a1e66', brown: '#a8521c', tan: '#f0a860', orange: '#ff7a12', purple: '#a23cff', silver: '#d8e4ff',
  teal: '#14e0c0', amber: '#c98a12',
}

const LOOKS = []
const look = (id, name, motion, body, notes) => LOOKS.push({ id, name, motion, body, notes })

// ── 1. Santa (Jacob's, band by band, bottom to top). The buckle repeats on every face (ruled 2026-10-30). ──────────────
look('santa', 'Santa', { kind: 'still' }, () =>
  band(0, 26, C.white) + band(26, 42, C.red) + band(42, 50, '#000') + band(50, 64, C.red) + band(64, 70, C.white) +
  band(70, 90, C.red) + band(90, 96, C.white) +
  perFace((cx) => rect(cx - 8, 39, 16, 14, C.gold) + rect(cx - 4.5, 42.5, 9, 7, '#000') + rect(cx - 1, 45, 6, 2, C.gold)),
  'White to the crown · red coat · black belt with a gold buckle on every face · red coat · white trim · red pants · white boot tops.')

// ── 1b. Santa's Hat (Jacob: "We MUST do one"): the cone IS the hat. Red, a fur brim at the ground, a pompom at the crown.
look('santas-hat', "Santa's Hat", { kind: 'twinkle', only: C.white }, () => {
  const r = rng(101)
  let brim = `M0,96 L0,78`, pom = `M0,0 L0,9`
  for (let x = 0; x <= FRAME_W; x += 3) brim += ` L${x},${78 + (r() - 0.5) * 3}`
  for (let x = 0; x <= FRAME_W; x += 3) pom += ` L${x},${9 + r() * 3}`
  return band(0, FRAME_H, C.red) + `<path d="${brim} L${FRAME_W},96 Z" fill="${C.white}"/>` + `<path d="${pom} L${FRAME_W},0 Z" fill="${C.white}"/>`
}, 'The whole tree is the hat: red, a fluffy white brim at the ground ring and a white pompom at the crown; the fur sparkles.')

// ── 2. Frosty ────────────────────────────────────────────────────────────────────────────────────────────────────────
look('frosty', 'Frosty', { kind: 'still' }, () =>
  band(0, 14, '#000') + band(9, 12, C.red) + band(14, 34, C.white) + band(34, 40, C.red) + band(40, 96, C.white) +
  perFace((cx) =>
    circle(cx - 5, 21, 1.8, '#000') + circle(cx + 5, 21, 1.8, '#000') +
    poly([[cx, 25], [cx + 11, 27.5], [cx, 29]], C.orange) +
    rect(cx + 6, 40, 5, 13, C.red) +
    circle(cx, 56, 2.4, '#000') + circle(cx, 68, 2.4, '#000') + circle(cx, 80, 2.4, '#000')),
  'Black hat with a red band at the crown · face with coal eyes and a carrot nose on every face · red scarf · coal buttons.')

// ── 3. Rudolph: the nose alone pulses (a motion scoped to one colour). ──────────────────────────────────────────────
look('rudolph', 'Rudolph', { kind: 'pulse', only: C.red }, () =>
  band(30, 96, C.brown) + band(60, 74, C.tan) +
  perFace((cx) =>
    path(`M${cx - 6},30 L${cx - 12},12 L${cx - 18},4 M${cx - 12},12 L${cx - 20},14 M${cx - 9},21 L${cx - 4},10`, C.gold, 2.2) +
    path(`M${cx + 6},30 L${cx + 12},12 L${cx + 18},4 M${cx + 12},12 L${cx + 20},14 M${cx + 9},21 L${cx + 4},10`, C.gold, 2.2) +
    circle(cx - 5, 36, 1.5, C.white) + circle(cx + 5, 36, 1.5, C.white) + circle(cx, 44, 4.5, C.red)),
  'Gold antlers branching at the crown · brown coat · tan band · a red nose on every face, the only thing that pulses.')

// ── 4. Snowfall ──────────────────────────────────────────────────────────────────────────────────────────────────────
look('snowfall', 'Snowfall', { kind: 'fall', speed: 6 }, () => {
  const r = rng(4); let s = band(0, FRAME_H, C.navy)
  for (let i = 0; i < 150; i++) { const x = r() * FRAME_W, y = r() * FRAME_H, rr = 0.6 + r() * 0.7; s += wrapped(x, (xx) => circle(xx, y, rr, C.white)) }
  return s
}, 'White flakes on night blue, falling.')

// ── 5. Snowflakes ────────────────────────────────────────────────────────────────────────────────────────────────────
function flake(cx, cy, R, c) {
  let d = ''
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, ex = cx + R * Math.cos(a), ey = cy + R * Math.sin(a)
    d += `M${f(cx)},${f(cy)} L${f(ex)},${f(ey)} `
    for (const t of [0.55]) {
      const bx = cx + R * t * Math.cos(a), by = cy + R * t * Math.sin(a)
      for (const s of [-1, 1]) d += `M${f(bx)},${f(by)} L${f(bx + R * 0.32 * Math.cos(a + s * 0.9))},${f(by + R * 0.32 * Math.sin(a + s * 0.9))} `
    }
  }
  return path(d, c, 1.4)
}
look('snowflakes', 'Snowflakes', { kind: 'twinkle' }, () =>
  band(0, FRAME_H, '#0d3fa8') + perFace((cx) => flake(cx - 11, 24, 9, C.white) + flake(cx + 11, 52, 10, C.white) + flake(cx - 8, 80, 9, C.silver)),
  'Six-armed flakes, three to a face, on bright blue; they twinkle.')

// ── 6. Gifts ─────────────────────────────────────────────────────────────────────────────────────────────────────────
look('gifts', 'Gifts', { kind: 'still' }, () => {
  const paper = [C.red, C.green, C.blue, C.gold], ribbon = [C.gold, C.gold, C.white, C.red]
  return perFace((cx, k) =>
    rect(cx - FACE_W / 2, 0, FACE_W, FRAME_H, paper[k]) + rect(cx - 3, 0, 6, FRAME_H, ribbon[k]) + rect(cx - FACE_W / 2, 54, FACE_W, 6, ribbon[k]) +
    `<ellipse cx="${cx - 7}" cy="16" rx="7" ry="4.5" fill="none" stroke="${ribbon[k]}" stroke-width="2.4"/>` +
    `<ellipse cx="${cx + 7}" cy="16" rx="7" ry="4.5" fill="none" stroke="${ribbon[k]}" stroke-width="2.4"/>` +
    circle(cx, 16, 2.6, ribbon[k])) + rect(0, 0, 1, FRAME_H, '#000') // the seam between parcels stays dark
}, 'Four parcels, one to a face, in red, green, blue and gold; a ribbon cross and a bow on each.')

// ── 7. Candy Cane: a barber-pole spiral ───────────────────────────────────────────────────────────────────────────────
look('candy-cane', 'Candy Cane', { kind: 'spin', speed: 10 }, () => {
  let s = band(0, FRAME_H, C.white)
  for (let x0 = -FRAME_W; x0 < FRAME_W * 2; x0 += 24) s += poly([[x0, 0], [x0 + 12, 0], [x0 + 12 + 48, FRAME_H], [x0 + 48, FRAME_H]], C.red)
  return s
}, 'Red and white spiralling down the cone, turning.')

// ── 8. Peppermint ────────────────────────────────────────────────────────────────────────────────────────────────────
look('peppermint', 'Peppermint', { kind: 'spin', speed: -8 }, () =>
  band(0, FRAME_H, '#000') + perFace((cx) => {
    let s = circle(cx, 52, 18, C.white)
    for (let i = 0; i < 8; i += 2) {
      const a0 = i * Math.PI / 4, a1 = (i + 1) * Math.PI / 4
      s += poly([[cx, 52], [cx + 18 * Math.cos(a0), 52 + 18 * Math.sin(a0)], [cx + 18 * Math.cos((a0 + a1) / 2), 52 + 18 * Math.sin((a0 + a1) / 2)], [cx + 18 * Math.cos(a1), 52 + 18 * Math.sin(a1)]], C.red)
    }
    return s + circle(cx, 52, 3, C.red)
  }) + band(0, 10, C.green) + band(86, 96, C.green),
  'A peppermint pinwheel on every face between green bands, turning the other way.')

// ── 9. Holly ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function leaf(cx, cy, len, ang, c) {
  const pts = [], n = 5
  for (let i = 0; i <= n; i++) { const t = i / n, w = Math.sin(t * Math.PI) * len * 0.32; pts.push([t * len, -w * (i % 2 ? 0.7 : 1)]) }
  for (let i = n - 1; i > 0; i--) { const t = i / n, w = Math.sin(t * Math.PI) * len * 0.32; pts.push([t * len, w * (i % 2 ? 0.7 : 1)]) }
  return poly(pts.map(([x, y]) => [cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)]), c)
}
look('holly', 'Holly', { kind: 'twinkle', only: C.red }, () =>
  band(0, FRAME_H, '#000') + perFace((cx) => [[cx - 6, 30], [cx + 10, 70]].map(([x, y]) =>
    leaf(x, y, 16, -2.5, C.green) + leaf(x, y, 16, -0.6, C.deepGreen) + leaf(x, y, 14, 1.4, C.green) +
    circle(x - 1.5, y - 1, 2.2, C.red) + circle(x + 2, y + 1.5, 2.2, C.red) + circle(x - 2, y + 3, 2.2, C.red)).join('')),
  'Holly sprigs, two to a face, with red berries that twinkle.')

// ── 10. Bells ────────────────────────────────────────────────────────────────────────────────────────────────────────
const bell = (cx, cy, s, c) => `<path d="M${cx - 6 * s},${cy + 8 * s} Q${cx - 6 * s},${cy - 6 * s} ${cx},${cy - 7 * s} Q${cx + 6 * s},${cy - 6 * s} ${cx + 6 * s},${cy + 8 * s} Z" fill="${c}"/>` + circle(cx, cy + 9.5 * s, 1.6 * s, c)
look('bells', 'Bells', { kind: 'pulse', speed: 1.2 }, () =>
  band(0, FRAME_H, C.deepGreen) + perFace((cx) =>
    bell(cx - 6, 52, 1.6, C.gold) + bell(cx + 6, 54, 1.6, C.gold) +
    path(`M${cx - 6},38 L${cx},34 L${cx + 6},38`, C.red, 2) + `<ellipse cx="${cx - 5}" cy="30" rx="5" ry="3" fill="${C.red}"/><ellipse cx="${cx + 5}" cy="30" rx="5" ry="3" fill="${C.red}"/>`),
  'A pair of gold bells under a red bow on every face, on green; they pulse like a ring.')

// ── 11. Stars ────────────────────────────────────────────────────────────────────────────────────────────────────────
look('stars', 'Stars', { kind: 'twinkle' }, () => {
  const r = rng(11); let s = band(0, FRAME_H, '#06134a')
  for (let i = 0; i < 26; i++) { const x = r() * FRAME_W, y = 18 + r() * 76, rr = 2.4 + r() * 3; s += wrapped(x, (xx) => star(xx, y, rr, r() > 0.3 ? C.gold : C.white)) }
  return s + perFace((cx) => star(cx, 8, 6, C.white))
}, 'Gold and white stars on night blue, a big star at the crown on every face; they twinkle.')

// ── 12. Menorah (Hanukkah): nine candles, the shamash raised. The flames flicker. ───────────────────────────────────
look('menorah', 'Menorah', { kind: 'twinkle', only: C.gold }, () =>
  band(0, FRAME_H, '#0b2f9a') + perFace((cx) => {
    let s = rect(cx - 18, 70, 36, 2.5, C.white) + rect(cx - 1.5, 72, 3, 14, C.white) + rect(cx - 8, 86, 16, 3, C.white)
    for (let i = -4; i <= 4; i++) {
      const x = cx + i * 4, top = i === 0 ? 40 : 46
      s += rect(x - 1, top, 2, 70 - top, C.white) + `<ellipse cx="${x}" cy="${top - 3}" rx="1.4" ry="2.6" fill="${C.gold}"/>`
    }
    return s
  }),
  'A nine-branched menorah on every face, white on blue, the shamash raised; only the flames flicker.')

// ── 13. Star of David (Hanukkah) ─────────────────────────────────────────────────────────────────────────────────────
look('star-of-david', 'Star of David', { kind: 'pulse', speed: 0.5 }, () =>
  band(0, FRAME_H, C.white) + band(8, 16, C.blue) + band(80, 88, C.blue) + perFace((cx) => {
    const tri = (rot) => poly([0, 1, 2].map(i => { const a = rot + i * 2 * Math.PI / 3; return [cx + 15 * Math.cos(a), 48 + 15 * Math.sin(a)] }), 'none', ` stroke="${C.blue}" stroke-width="3"`)
    return tri(-Math.PI / 2) + tri(Math.PI / 2)
  }),
  'A blue Star of David on white on every face, between two blue bands, breathing slowly.')

// ── 14. Kinara (Kwanzaa): three red, one black, three green. Black is bulbs off, so it reads as a dark candle. ────────
look('kinara', 'Kinara', { kind: 'twinkle', only: C.gold }, () =>
  band(0, FRAME_H, '#5c3f0a') + perFace((cx) => {
    let s = rect(cx - 17, 70, 34, 5, C.amber) + rect(cx - 13, 75, 26, 4, C.amber)
    const col = [C.red, C.red, C.red, '#000', C.green, C.green, C.green]
    for (let i = 0; i < 7; i++) {
      const x = cx + (i - 3) * 4.6, top = 44 + Math.abs(i - 3) * 2
      s += rect(x - 1.4, top, 2.8, 70 - top, col[i]) + `<ellipse cx="${x}" cy="${top - 3}" rx="1.4" ry="2.6" fill="${C.gold}"/>`
    }
    return s
  }),
  'A kinara on every face: three red candles, the black one in the centre, three green; only the flames flicker.')

// ── 15. Kwanzaa Bands (the bendera: red, black, green) ────────────────────────────────────────────────────────────────
look('kwanzaa-bands', 'Kwanzaa Bands', { kind: 'rise', speed: 4 }, () =>
  band(0, 32, C.red) + band(32, 64, '#000') + band(64, 96, C.green),
  'Red over black over green, rising slowly.')

// ── 16. Peace ────────────────────────────────────────────────────────────────────────────────────────────────────────
look('peace', 'Peace', { kind: 'pulse', speed: 0.6 }, () =>
  band(0, FRAME_H, '#123a9e') + perFace((cx) =>
    `<circle cx="${cx}" cy="50" r="16" fill="none" stroke="${C.white}" stroke-width="3"/>` +
    path(`M${cx},34 L${cx},66 M${cx},50 L${cx - 11.3},61.3 M${cx},50 L${cx + 11.3},61.3`, C.white, 3)),
  'A white peace sign on every face, on blue, breathing slowly.')

// ── 17. Plaid ────────────────────────────────────────────────────────────────────────────────────────────────────────
look('plaid', 'Plaid', { kind: 'still' }, () => {
  let s = band(0, FRAME_H, '#d0101c')
  for (let y = 4; y < FRAME_H; y += 24) s += rect(0, y, FRAME_W, 9, C.deepGreen, ' opacity="0.85"') + rect(0, y + 12, FRAME_W, 1.2, C.gold)
  for (let x = 6; x < FRAME_W; x += 24) s += rect(x, 0, 9, FRAME_H, C.deepGreen, ' opacity="0.6"') + rect(x + 12, 0, 1.2, FRAME_H, C.gold) + rect(x + 3.5, 0, 2, FRAME_H, '#000', ' opacity="0.6"')
  return s
}, 'Red tartan with green bands, dark threads and a gold line.')

// ── 18. Bows ─────────────────────────────────────────────────────────────────────────────────────────────────────────
look('bows', 'Bows', { kind: 'still' }, () =>
  band(0, FRAME_H, C.deepGreen) + band(44, 52, C.red) + perFace((cx) =>
    poly([[cx, 48], [cx - 14, 38], [cx - 14, 58]], C.red) + poly([[cx, 48], [cx + 14, 38], [cx + 14, 58]], C.red) +
    poly([[cx - 2, 50], [cx - 8, 66], [cx - 4, 66]], C.red) + poly([[cx + 2, 50], [cx + 8, 66], [cx + 4, 66]], C.red) +
    circle(cx, 48, 3.4, C.gold)),
  'A red ribbon around the tree, tied in a bow with a gold knot on every face.')

// ── 19. Gingerbread ──────────────────────────────────────────────────────────────────────────────────────────────────
look('gingerbread', 'Gingerbread', { kind: 'still' }, () => {
  let s = band(0, FRAME_H, C.brown)
  for (const y of [14, 38, 62, 86]) {
    let d = `M0,${y}`; for (let x = 0; x <= FRAME_W; x += 6) d += ` L${x},${y + ((x / 6) % 2 ? 3 : -3)}`
    s += path(d, C.white, 1.8)
  }
  const r = rng(19)
  for (let y of [26, 50, 74]) for (let x = 6; x < FRAME_W; x += 12) s += circle(x, y, 2.2, r() > 0.5 ? C.red : C.green)
  return s
}, 'Brown with white icing zigzags and gumdrops in red and green.')

// ── 20. Ornaments ────────────────────────────────────────────────────────────────────────────────────────────────────
look('ornaments', 'Ornaments', { kind: 'twinkle' }, () => {
  const r = rng(20), cols = [C.red, C.gold, C.blue, C.silver, C.purple]; let s = band(0, FRAME_H, '#063d18')
  for (let i = 0; i < 40; i++) {
    const x = r() * FRAME_W, y = 8 + r() * 84, rr = 2.6 + r() * 2.4, c = cols[Math.floor(r() * cols.length)]
    s += wrapped(x, (xx) => circle(xx, y, rr, c) + circle(xx - rr * 0.35, y - rr * 0.35, rr * 0.3, C.white))
  }
  return s
}, 'Baubles in red, gold, blue, silver and purple on deep green; they twinkle.')

// ── 21. Garland ──────────────────────────────────────────────────────────────────────────────────────────────────────
look('garland', 'Garland', { kind: 'still' }, () =>
  band(0, FRAME_H, '#073d1a') + [20, 46, 72].map((y, row) =>
    Array.from({ length: FACES * 2 }, (_, i) => {
      const x0 = i * FACE_W / 2 + (row % 2 ? FACE_W / 4 : 0), x1 = x0 + FACE_W / 2
      return path(`M${x0},${y} Q${(x0 + x1) / 2},${y + 14} ${x1},${y}`, C.gold, 2.2) + circle(x1, y, 2.4, C.red) + (x0 < 1 ? circle(x0 + FRAME_W, y, 0, C.red) : '')
    }).join('')).join(''),
  'Gold swags in three tiers, a red bead where each swag meets the next.')

// ── 22. Classic Tree: the full-colour Christmas tree ──────────────────────────────────────────────────────────────────
look('classic-tree', 'Classic Tree', { kind: 'twinkle' }, () => {
  const r = rng(22), cols = [C.red, C.gold, C.blue, C.green, C.orange, C.purple]; let s = band(0, FRAME_H, '#052e12')
  for (let y = 16; y < FRAME_H; y += 5) for (let x = (y % 10 ? 0 : 3); x < FRAME_W; x += 6) s += circle(x + r() * 1.5, y, 1.3, cols[Math.floor(r() * cols.length)])
  return s + perFace((cx) => star(cx, 7, 6.5, C.gold))
}, 'Multicoloured lights on deep green, a gold star at the crown on every face; they twinkle.')

// ── 23. Joy ──────────────────────────────────────────────────────────────────────────────────────────────────────────
look('joy', 'Joy', { kind: 'pulse', speed: 0.8 }, () =>
  band(0, FRAME_H, '#c40d1c') + band(0, 6, C.gold) + band(90, 96, C.gold) + perFace((cx) =>
    `<text x="${cx}" y="60" text-anchor="middle" font-family="Arial Black, Helvetica, sans-serif" font-weight="900" font-size="26" fill="${C.white}">JOY</text>`),
  'JOY in white on red on every face, between gold bands.')

// ── 24. Northern Lights ──────────────────────────────────────────────────────────────────────────────────────────────
look('northern-lights', 'Northern Lights', { kind: 'spin', speed: 5 }, () => {
  let s = band(0, FRAME_H, '#020a2a') + `<defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#020a2a"/></linearGradient></defs>`
  const cols = [C.teal, C.green, C.purple, C.teal]
  for (let i = 0; i < 8; i++) {
    const x = i * 24, c = cols[i % cols.length]
    s += `<path d="M${x},6 C${x + 10},20 ${x - 6},34 ${x + 6},50 L${x + 18},50 C${x + 6},34 ${x + 22},20 ${x + 12},6 Z" fill="${c}" opacity="0.9"/>`
  }
  return s + rect(0, 30, FRAME_W, 22, 'url(#v)') + perFace((cx) => star(cx - 14, 76, 1.6, C.white) + star(cx + 12, 86, 1.4, C.white))
}, 'Curtains of teal, green and violet in the upper tree, drifting around it.')

// ── 25. Yule Fire ────────────────────────────────────────────────────────────────────────────────────────────────────
look('yule-fire', 'Yule Fire', { kind: 'rise', speed: 9 }, () => {
  const r = rng(25); let s = band(0, FRAME_H, '#000')
  for (let x = 0; x < FRAME_W; x += 8) {
    const h = 30 + r() * 40
    s += poly([[x - 2, 96], [x + 4 + (r() - 0.5) * 6, 96 - h], [x + 10, 96]], C.red)
    s += poly([[x, 96], [x + 4 + (r() - 0.5) * 4, 96 - h * 0.7], [x + 8, 96]], C.orange)
    s += poly([[x + 2, 96], [x + 4, 96 - h * 0.4], [x + 6, 96]], C.gold)
  }
  for (let i = 0; i < 40; i++) s += circle(r() * FRAME_W, r() * 50, 0.8, C.gold)
  return s
}, 'Flames climbing from the ground ring with gold sparks above, rising.')

mkdirSync(OUT, { recursive: true })
const manifest = []
for (const L of LOOKS) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W}" height="${FRAME_H}" viewBox="0 0 ${FRAME_W} ${FRAME_H}">${L.body()}</svg>\n`
  writeFileSync(join(OUT, `${L.id}.svg`), svg)
  manifest.push({ id: L.id, name: L.name, file: `looks/${L.id}.svg`, motion: L.motion, notes: L.notes })
}
writeFileSync(join(HERE, 'looks.json'), JSON.stringify({ frame: { w: FRAME_W, h: FRAME_H, faces: FACES }, looks: manifest }, null, 2) + '\n')
console.log(`${manifest.length} looks → ${OUT}`)
