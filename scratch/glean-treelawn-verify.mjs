// Verify the per-street treelawn glean (Step 1 default) against the frozen
// ribbons measures. DATA-only — does NOT touch geometry. Mirrors the new
// gleanTreelawn rule in src/lib/tileGround.js so the change is attributable.
import fs from 'fs'

const rib = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const survey = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/raw/survey.json', 'utf8')).streets
const TH = 0.6
const VALLEY_LO = 0.25, VALLEY_HI = 0.75

const gap = (m, s) => Math.max(0, Number.isFinite(m?.[s]?.treelawn) ? m[s].treelawn : 0)
const rawGlean = (m, s) => gap(m, s) >= TH
const other = s => (s === 'left' ? 'right' : 'left')

// NEW rule (mirror of tileGround.gleanTreelawn): a side terminating in 'lawn'
// is the INFERRED/unmeasured side of a one-sided street — it inherits the
// measured (sidewalk-terminal) side's verdict instead of its bad inferred gap.
function newGlean(m, s) {
  const side = m?.[s]
  if (side && side.terminal === 'lawn') {
    const o = m?.[other(s)]
    if (o && o.terminal === 'sidewalk') return rawGlean(m, other(s))
  }
  return rawGlean(m, s)
}

let runSidesChanged = 0
const flippedRunSides = []
const valley = []          // two-sided sidewalk straddles to surface
const assessorGuess = []   // assessor / no-measure streets to flag

for (const c of rib.streets) {
  const m = c.measure
  if (!m) continue
  const name = c.name
  const src = survey[name]?.source || '?'
  for (const s of ['left', 'right']) {
    const sd = m[s]
    if (!sd) continue
    const before = rawGlean(m, s)
    const after = newGlean(m, s)
    if (before !== after) {
      runSidesChanged++
      flippedRunSides.push(`${name} [${c.skelId}] ${s}: ${before ? 'Y' : 'N'}→${after ? 'Y' : 'N'} (terminal=${sd.terminal}, gap=${gap(m, s).toFixed(2)})`)
    }
    // Valley surface: a sidewalk-terminal side whose gap sits in the bimodal
    // valley (operator's eye-call, NOT auto-flipped).
    if (sd.terminal === 'sidewalk') {
      const g = gap(m, s)
      if (g >= VALLEY_LO && g <= VALLEY_HI) valley.push(`${name} [${c.skelId}] ${s}: gap=${g.toFixed(2)} (src=${src})`)
    }
    // Assessor / ROW-only flag: surveyed without a sidewalk measure → the
    // treelawn is a GUESS (neighborhood-dominant Y default), flag it.
    if ((src === 'assessor') ) {
      assessorGuess.push(`${name} [${c.skelId}] ${s}: gap=${gap(m, s).toFixed(2)} verdict=${after ? 'Y' : 'N'} (assessor ROW-only — GUESS)`)
    }
  }
}

console.log('=== RUN-SIDES FLIPPED Y/N (new default vs old) ===')
console.log(`count: ${runSidesChanged}`)
for (const f of [...new Set(flippedRunSides)].sort()) console.log('  ' + f)

console.log('\n=== VALLEY CASES TO SURFACE (gap 0.25-0.75, sidewalk-terminal) — operator sets deliberately ===')
console.log(`count: ${[...new Set(valley)].length}`)
for (const v of [...new Set(valley)].sort()) console.log('  ' + v)

console.log('\n=== ASSESSOR / ROW-ONLY GUESSES (flag) ===')
console.log(`count: ${[...new Set(assessorGuess)].length}`)
for (const a of [...new Set(assessorGuess)].sort()) console.log('  ' + a)

console.log('\n=== SPOT-CHECK: circled streets (before → after, per side) ===')
const byname = {}
for (const c of rib.streets) (byname[c.name] ||= []).push(c)
for (const name of ['Kennett Place', 'Dillon Street', 'Carroll Street', 'Mackay Place', 'Vail Place']) {
  for (const c of byname[name] || []) {
    const m = c.measure
    const L = `L ${rawGlean(m, 'left') ? 'Y' : 'N'}→${newGlean(m, 'left') ? 'Y' : 'N'}(${gap(m, 'left').toFixed(2)},${m.left?.terminal})`
    const R = `R ${rawGlean(m, 'right') ? 'Y' : 'N'}→${newGlean(m, 'right') ? 'Y' : 'N'}(${gap(m, 'right').toFixed(2)},${m.right?.terminal})`
    console.log(`  ${name} [${c.skelId}] src=${survey[name]?.source}: ${L} | ${R}`)
  }
}
