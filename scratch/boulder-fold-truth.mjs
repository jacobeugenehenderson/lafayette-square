/**
 * boulder-fold-truth.mjs — DID THE BAND EVER FOLD, OR WAS IT THE INSTRUMENT?
 * ▶ node scratch/boulder-fold-truth.mjs
 *
 * ⛔ This probe reported "7 of 14 arcs fold" using MINIMUM TURN RADIUS < band width.
 * That test was reporting the TRACE'S JITTER, not the coast's curvature. ⚠️ Precisely:
 * circumradius is sampling-INDEPENDENT on a smooth curve (the turn angle shrinks with
 * the spacing and they cancel — a 50 m circle reads 50.0 m at every spacing from 20 m
 * down to 0.5 m), but on a noisy polyline the angle does not shrink, so the reading
 * collapses toward the noise amplitude. ⛔ Not "circumradius measures sampling".
 * ⭐ So before claiming the band-derived tolerance FIXED anything, the raw trace has
 * to be re-measured with the honest test (`bandFolds` — metric band self-overlap).
 * If the raw arcs never folded, the fix fixed nothing and the report must say so.
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadHuronShore, profileArc, bandFolds } from '../src/harness/boulders/huron.js'
import { RIPRAP_REPOSE_DEG } from '../cartograph/shore-armour.mjs'

const TAN = Math.tan(RIPRAP_REPOSE_DEG * Math.PI / 180)
const ROOT = path.resolve(import.meta.dirname, '..')
const local = (u) => path.join(ROOT, u.startsWith('/baked') ? 'public' + u : u.replace(/^\//, ''))
const fetcher = {
  json: async (u) => JSON.parse(fs.readFileSync(local(u), 'utf8')),
  bin: async (u) => { const b = fs.readFileSync(local(u)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) },
}

const { arcs, elevAt, armourAt } = await loadHuronShore({ fetcher })
console.log('\n  arc     RAW trace                  SIMPLIFIED (band-derived tol)')
let rawFold = 0, simpFold = 0, live = 0
for (const arc of arcs) {
  if (arc.refused || arc.poly.length < 3) continue
  live++
  // RAW: profile the untouched trace, same predicate, same band rule.
  const rawArc = { ...arc, poly: arc.raw }
  const pr = profileArc(rawArc, elevAt, armourAt)
  const rawPoly = arc.flip ? [...arc.raw].reverse() : arc.raw
  const fr = bandFolds(rawPoly, (i) => (pr.armour[i] ? pr.crest[i] / TAN : 0))
  // SIMPLIFIED: what is live.
  const ps = profileArc(arc, elevAt, armourAt)
  const simpPoly = arc.flip ? [...arc.poly].reverse() : arc.poly
  const fs_ = bandFolds(simpPoly, (i) => (ps.armour[i] ? ps.crest[i] / TAN : 0))
  if (fr.folds) rawFold++
  if (fs_.folds) simpFold++
  console.log(`  #${String(arc.id).padStart(2)}   ` +
    (fr.folds ? `⛔ ${String(fr.pairs).padStart(5)} pairs, worst ${fr.worst.toFixed(1).padStart(5)} m` : '   clear                  ').padEnd(27) +
    (fs_.folds ? `⛔ ${String(fs_.pairs).padStart(5)} pairs, worst ${fs_.worst.toFixed(1)} m` : '   clear'))
}
console.log(`\n  ⇒ RAW: ${rawFold} / ${live} arcs fold   ·   SIMPLIFIED: ${simpFold} / ${live} arcs fold\n`)
