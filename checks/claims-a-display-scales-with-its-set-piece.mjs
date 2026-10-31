#!/usr/bin/env node
/**
 * "DOES A DISPLAY LOOK RIGHT ON A SET-PIECE NOBODY TUNED IT FOR?" (Zob's review and Boz's ruling, 2026-10-31; Layer 0's
 * quietest form: a constant whose value happened to be right for town #1.)
 *
 * The Light Show's sizes and strengths come from src/displays/lightShow/geometry.js. Asked of the Pilgrim Monument (its
 * declared extent, read from src/setpieces/pilgrimMonument.js#displayExtent) and of a set-piece a quarter its size:
 *   1. bulbs never merge: on every strand a bulb's diameter is less than its spacing, by the SAME fraction on both;
 *   2. the one average glow lights the foot of each the same (its illuminance at its own height's distance is equal);
 *   3. strands follow the ridge's sides: a 6-sided ridge places 6 faces of strands round it (the tops on 6 faces), and
 *      a frame whose faces differ from the ridge's sides refuses by name;
 *   4. LightShow.jsx takes its bulb size and its glow from geometry.js, with no number of its own for either.
 *
 * Usage: node checks/claims-a-display-scales-with-its-set-piece.mjs [--mutants]
 *   --mutants: a fixed 0.22 m bulb → (1) red; a fixed 4000 cd glow → (2) red; a fixed quarter-turn per face → (3) red.
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

async function verdict(transform) {
  const fails = []
  const G = await importSource('src/displays/lightShow/geometry.js', transform ? { transform } : {})
  const { displayExtent } = await importSource('src/setpieces/pilgrimMonument.js')
  const big = { ...displayExtent(), ring: 31, foot: 6.1 }
  const small = { ridge: { sides: 4, yM: big.ridge.yM / 4, halfWidthM: big.ridge.halfWidthM / 4 }, pinnacle: { ...big.pinnacle, fromM: big.pinnacle.fromM / 4, toM: big.pinnacle.toM / 4, halfWidthM: big.pinnacle.halfWidthM / 4 }, ring: 31 / 4, foot: 6.1 / 4 }
  const rows = 96, ratio = (x) => {
    const e = G.strandEnds(60, x.ridge.sides, x.ridge.halfWidthM, x.ring)[0], len = Math.hypot(e.bx - e.tx, x.ridge.yM - x.foot, e.bz - e.tz)
    return 2 * G.bulbRadius(len, rows) / (len / rows)
  }
  // 1. bulbs never merge, and keep one look at any size
  for (const [name, x] of [['the Pilgrim Monument', big], ['a quarter-size set-piece', small]]) if (!(ratio(x) < 1)) fails.push(`${name}: a bulb's diameter is ${ratio(x).toFixed(2)}× its spacing; the strand is a solid tube`)
  if (Math.abs(ratio(big) - ratio(small)) > 1e-9) fails.push(`bulbs are ${ratio(big).toFixed(2)}× their spacing on the monument and ${ratio(small).toFixed(2)}× on a smaller piece: a bulb size tuned to one tower`)
  // 1b. the cord: thinner than the bulb and the same fraction of the spacing at any size
  const cord = (x) => { const e = G.strandEnds(60, x.ridge.sides, x.ridge.halfWidthM, x.ring)[0], len = Math.hypot(e.bx - e.tx, x.ridge.yM - x.foot, e.bz - e.tz); return G.cordRadius(len, rows) / G.bulbRadius(len, rows) }
  if (!(cord(big) < 1) || Math.abs(cord(big) - cord(small)) > 1e-9) fails.push(`the cord is ${cord(big).toFixed(3)}× a bulb on the monument and ${cord(small).toFixed(3)}× on a smaller piece: a cord thickness tuned to one tower`)
  // 2. the average glow lights the foot of each alike
  const lux = (x) => { const g = G.avgGlow(x, 1); return g.intensity / (g.y * g.y) }
  if (Math.abs(lux(big) - lux(small)) > 1e-6 * lux(big)) fails.push(`the average glow gives ${lux(big).toFixed(2)} lx at the monument's foot and ${lux(small).toFixed(2)} lx at a smaller piece's: a glow tuned to one tower`)
  // 3. strands follow the ridge's sides; a mismatch refuses
  // Each face's centre (the mean of its two strands' tops): six faces, 60° apart.
  const hex = { ridge: { sides: 6, yM: 20, halfWidthM: 3 } }, e12 = G.strandEnds(12, 6, 3, 10)
  const centres = [0, 1, 2, 3, 4, 5].map(k => Math.round(((Math.atan2(e12[2 * k].tx + e12[2 * k + 1].tx, e12[2 * k].tz + e12[2 * k + 1].tz) * 180 / Math.PI) + 360) % 360)).sort((p, q) => p - q)
  const evenly = new Set(centres).size === 6 && centres.every((c, i) => i === 0 || Math.abs(c - centres[i - 1] - 60) <= 1)
  if (!evenly) fails.push(`a 6-sided ridge's faces centre at ${centres.join('°, ')}°, not six faces 60° apart: the strands do not follow the ridge's sides`)
  let refused = false; try { G.checkFaces(4, hex, 'check') } catch { refused = true }
  if (!refused) fails.push('a 4-face frame on a 6-sided ridge was accepted: a count the geometry cannot place must refuse')
  // 4. the renderer has no size or strength of its own
  const ls = code(sourceOf('src/displays/lightShow/LightShow.jsx'))
  if (!/bulbRadius\(/.test(ls) || !/cordRadius\(/.test(ls) || !/avgGlow\(/.test(ls)) fails.push('LightShow.jsx does not take its bulb size, cord and glow from geometry.js')
  if (/SphereGeometry\(\s*0\.\d/.test(ls) || /intensity\s*=\s*\d{3,}/.test(ls)) fails.push('LightShow.jsx sets a bulb size or a glow strength of its own')
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ a display does not scale with its set-piece:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ a display scales with its set-piece: bulbs keep their spacing and never merge, the glow lights each foot alike, strands follow the ridge\'s sides')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['a fixed 0.22 m bulb', (s) => s.replace('export const bulbRadius = (length, rows) => BULB_OF_SPACING * length / rows', 'export const bulbRadius = (length, rows) => 0.22')],
    ['a fixed 3 cm cord', (s) => s.replace('export const cordRadius = (length, rows) => CORD_OF_SPACING * length / rows', 'export const cordRadius = (length, rows) => 0.015')],
    ['a fixed 4000 cd glow', (s) => s.replace('intensity: AVG_GLOW_LUX * d * d * lum', 'intensity: 4000 * lum')],
    ['a quarter-turn per face', (s) => s.replace('const rot = -k * 2 * Math.PI / sides, half', 'const rot = -k * Math.PI / 2, half')],
  ]
  let bad = 0
  for (const [name, t] of mutants) { const f = await verdict(t); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
