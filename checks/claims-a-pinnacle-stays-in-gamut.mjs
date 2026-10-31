#!/usr/bin/env node
/**
 * "DOES THE PINNACLE'S WASH STAY THE LOOK'S COLOUR?" (Jacob, 2026-10-31: the red pinnacle went pink, "out of gamut or
 * something")
 *
 * The wash is drawn without tone mapping, so a channel past 1 is not brighter light but another colour. So, for every
 * colour a look can give its pinnacle and every height up a face, the wash from src/displays/lightShow/geometry.js
 * `pinnacleWash`:
 *   1. never has a channel past 1;
 *   2. keeps the colour's HUE: its channels stay in the ratio the look gave them (a cap per channel would turn a
 *      bright red pink and a bright gold green-white);
 *   3. is still brightest at the strip, and never brighter than the gain allows (the cap only ever darkens).
 * The renderer must draw the pinnacle through it, not beside it.
 *
 * Usage: node checks/claims-a-pinnacle-stays-in-gamut.mjs [--mutants]
 *   --mutants: no cap · a cap per channel · the renderer not using the wash, each red.
 */
import { importSource, sourceOf } from './_importSource.mjs'

// Colours a look gives its pinnacle (0…255): saturated primaries, the town's own, white, and dim ones.
const COLOURS = [[255, 31, 45], [255, 194, 58], [31, 92, 255], [255, 255, 255], [20, 194, 74], [180, 108, 255], [255, 92, 154], [40, 10, 10], [0, 0, 0]]
const UPS = Array.from({ length: 21 }, (_, i) => i / 20)

async function verdict({ geometryMutant, rendererMutant } = {}) {
  const G = await importSource('src/displays/lightShow/geometry.js', geometryMutant ? { transform: geometryMutant } : {})
  const fails = []
  for (const c of COLOURS) {
    const lo = c.map(v => v / 255), out = [0, 0, 0]
    let prev = Infinity
    for (const up of UPS) {
      const w = G.pinnacleWash(lo, lo, up, out), k = Math.max(...w)
      if (k > 1 + 1e-9) { fails.push(`rgb(${c}) at ${up.toFixed(2)} up the face: a channel at ${k.toFixed(2)}, past 1`); break }
      const ci = c.indexOf(Math.max(...c))
      if (c[ci] > 0 && c.some((v, i) => Math.abs(w[i] / w[ci] - v / c[ci]) > 1e-6)) { fails.push(`rgb(${c}) at ${up.toFixed(2)} up the face: its hue shifted (${w.map(v => v.toFixed(3))})`); break }
      if (k > prev + 1e-9) { fails.push(`rgb(${c}): brighter at ${up.toFixed(2)} than below it`); break }
      if (k > G.PIN_STRIP_GAIN * Math.max(...lo) + 1e-9) { fails.push(`rgb(${c}): brighter than its gain allows`); break }
      prev = k
    }
  }
  let ls = sourceOf('src/displays/lightShow/LightShow.jsx'); if (rendererMutant) ls = rendererMutant(ls)
  if (!/pinnacleWash\(/.test(ls.replace(/\/\/.*$/gm, ''))) fails.push('LightShow.jsx does not draw the pinnacle through pinnacleWash')
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ the pinnacle leaves its colour:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log(`✅ the pinnacle stays in gamut: ${COLOURS.length} colours × ${UPS.length} heights, no channel past 1, every hue kept, brightest at the strip; the renderer draws through the wash`)

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['no cap', { geometryMutant: (s) => s.replace('if (k > 1) for (let i = 0; i < 3; i++) out[i] /= k', '') }],
    ['a cap per channel', { geometryMutant: (s) => s.replace('if (k > 1) for (let i = 0; i < 3; i++) out[i] /= k', 'for (let i = 0; i < 3; i++) out[i] = Math.min(1, out[i])') }],
    ['the renderer not using the wash', { rendererMutant: (s) => s.replace('const w = pinnacleWash(L, Hc, pos.getY(i) / H + 0.5, tmp.w)', 'const w = [L[0] * 1.6, L[1] * 1.6, L[2] * 1.6]') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
