#!/usr/bin/env node
/**
 * ROADMAP A01 — compare two prebake artifacts STRUCTURALLY, not by byte.
 *
 * Usage:  node scratch/repro-a01-artifact-diff.mjs <A> <B>
 *   where each arg is a clean/map.json OR a ribbons.json (either shape is accepted).
 *
 * Why this exists: `promote-ribbons.js`'s clobber guard compares 6 COUNT fields.
 * The 2026-07-31 divergence that destroyed the map three times moved a count
 * (junction nodes 233→228) — but the part that was actually visible to the eye
 * was a CONTENT change the counts cannot see: 23 of 209 streets came back with
 * a different `measure` (operator-measured pavement half-widths replaced by
 * skeleton seeds, e.g. mississippi-avenue right 11.83 m → 4.74 m). A same-count
 * different-geometry run passes the count guard silently. This prints both.
 *
 * ⛔ Read-only. Writes nothing.
 */
import { readFileSync } from 'fs'
import { gunzipSync } from 'zlib'

const ribbonsOf = (p) => {
  // .gz accepted so the preserved evidence artifact can stay small in-repo.
  const raw = p.endsWith('.gz') ? gunzipSync(readFileSync(p)).toString('utf8')
                                : readFileSync(p, 'utf8')
  const j = JSON.parse(raw)
  return j.layers?.ribbons ?? j
}

const counts = (r) => ({
  streets:   r.streets?.length || 0,
  tiles:     r.tiles?.length || 0,
  faces:     r.faces?.length || 0,
  medians:   r.medians?.length || 0,
  corridors: r.corridors?.length || 0,
  nodes:     r.junctionMap?.nodes?.length || 0,
  caps:      (r.tiles || []).reduce((a, t) => a + (t.caps?.length || 0), 0),
})

const [pa, pb] = process.argv.slice(2)
if (!pa || !pb) {
  console.error('usage: node scratch/repro-a01-artifact-diff.mjs <A.json> <B.json>')
  process.exit(2)
}
const A = ribbonsOf(pa), B = ribbonsOf(pb)
const ca = counts(A), cb = counts(B)

console.log(`A = ${pa}\nB = ${pb}\n`)
console.log('── COUNTS (what the promote guard sees) ──')
let countsMoved = 0
for (const k of Object.keys(ca)) {
  const flag = ca[k] === cb[k] ? '   ' : ' ! '
  if (ca[k] !== cb[k]) countsMoved++
  console.log(`${flag}${k.padEnd(10)} ${String(ca[k]).padStart(6)}  →  ${String(cb[k]).padStart(6)}`)
}
console.log(`  ${countsMoved} count field(s) moved\n`)

// ── CONTENT: per-street geometry + measure, keyed by skelId ──
const ma = new Map((A.streets || []).map(s => [s.skelId, s]))
const mb = new Map((B.streets || []).map(s => [s.skelId, s]))
const onlyA = [...ma.keys()].filter(k => !mb.has(k))
const onlyB = [...mb.keys()].filter(k => !ma.has(k))

let ptsDiff = 0, measureDiff = 0, maxShift = 0, maxShiftId = null, reshaped = 0
const measureExamples = []
for (const [id, a] of ma) {
  const b = mb.get(id)
  if (!b) continue
  if (JSON.stringify(a.points) !== JSON.stringify(b.points)) {
    ptsDiff++
    // ⛔ Index-to-index only when the vertex COUNT matches. When one side has
    // been densified, ordinal i is a different place on the road and the
    // comparison reports hundreds of metres of "movement" that never happened.
    if (a.points.length === b.points.length) {
      for (let i = 0; i < a.points.length; i++) {
        const d = Math.hypot(a.points[i][0] - b.points[i][0], a.points[i][1] - b.points[i][1])
        if (d > maxShift) { maxShift = d; maxShiftId = `${id}@${i}` }
      }
    } else {
      reshaped++
    }
  }
  if (JSON.stringify(a.measure) !== JSON.stringify(b.measure)) {
    measureDiff++
    if (measureExamples.length < 8) {
      const hw = (m) => m ? `L${(m.left?.pavementHW ?? '·')} R${(m.right?.pavementHW ?? '·')}${m.source ? ' [' + m.source + ']' : ''}` : '(none)'
      measureExamples.push(`   ${id.padEnd(28)} ${hw(a.measure)}  →  ${hw(b.measure)}`)
    }
  }
}

console.log('── CONTENT (what the guard is BLIND to) ──')
console.log(`   streets only in A: ${onlyA.length}${onlyA.length ? ' ' + onlyA.slice(0, 8).join(',') : ''}`)
console.log(`   streets only in B: ${onlyB.length}${onlyB.length ? ' ' + onlyB.slice(0, 8).join(',') : ''}`)
console.log(`   shared streets with DIFFERENT points:  ${ptsDiff} of ${ma.size}`)
console.log(`   of those, ${reshaped} were RESHAPED (vertex count changed — not comparable index-wise)\n   max vertex displacement, count-matched streets only: ${maxShift.toFixed(3)} m${maxShiftId ? ' at ' + maxShiftId : ''}`)
console.log(` ! shared streets with DIFFERENT measure: ${measureDiff} of ${ma.size}`)
if (measureExamples.length) console.log(measureExamples.join('\n'))

const materially = countsMoved > 0 || ptsDiff > 0 || measureDiff > 0 || onlyA.length || onlyB.length
console.log(`\n${materially ? '⛔ ARTIFACTS DIVERGE' : '✅ artifacts agree'}`)
process.exit(materially ? 1 : 0)
