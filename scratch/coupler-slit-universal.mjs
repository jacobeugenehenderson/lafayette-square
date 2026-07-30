// coupler-slit-universal.mjs — TRUNK PORT (2026-07-30). Checks 1–2 of POLYGON-FIRST §2.1.
//
// Is every dead-end tip a zero-width slit in the FROZEN FACE, and is the "width" some
// of them appear to have real — or is it the FILL-layer mouth-wrap SNAP displacing
// run.poly off the ring after the freeze?
//
// Derives its folds from the frozen artifact via coupler-fold-legs.mjs (integer ring
// spans, never position). The branch original read Slice-1 `run.foldBranch`; this reads
// `ribbons.tiles[].caps`. Run it on trunk:  node scratch/coupler-slit-universal.mjs
import { foldLegs, tipGap, distToRing, fillByRing, loadRibbons, ringKey, EPS } from './coupler-fold-legs.mjs'

const ribbons = loadRibbons()
const folds = foldLegs(ribbons)
const { byRing } = await fillByRing(ribbons)

let slitRing = 0, widedRing = 0, snapped = 0, unsnapped = 0, noFill = 0
const rows = []
for (const f of folds) {
  const gap = tipGap(f)
  const slit = gap < EPS
  slit ? slitRing++ : widedRing++

  // the FILL's runs for this chain on this face — how far off the frozen ring did they move?
  const st = byRing.get(ringKey(f.ring))
  let disp = null
  if (st?.runs) {
    const mine = st.runs.filter(r => r.skelId === f.skelId)
    if (mine.length) {
      disp = 0
      for (const r of mine) for (const p of r.poly) disp = Math.max(disp, distToRing(p, f.ring))
    }
  }
  if (disp == null) noFill++
  else if (disp > EPS) snapped++
  else unsnapped++

  rows.push(`  ${slit ? 'FACE=SLIT ' : 'FACE=WIDTH'} gap=${gap.toFixed(3)}m  poly-displaced=${disp == null ? 'no FILL run ' : disp > EPS ? `YES ${disp.toFixed(2)}m` : 'no       '}  legs=${f.legs.length}  ${f.skelId}[${f.capEnd}]`)
}

console.log(`── POLYGON-FIRST §2.1 Checks 1–2, on the FROZEN face (${folds.length} dead-end tips) ──`)
console.log(`FACE ring is a zero-width slit at the tip: ${slitRing}   ⛔ target 0`)
console.log(`FACE ring genuinely has width at the tip:  ${widedRing}`)
console.log(`run.poly displaced off the ring (snap):    ${snapped}`)
console.log(`run.poly still exactly on the ring:        ${unsnapped}`)
if (noFill) console.log(`(no FILL run found for the chain on that face:  ${noFill})`)
console.log(rows.sort().join('\n'))

// Check 5 (POLYGON-FIRST §2.1): does each tip present TWO bounded legs?
const twoLegs = folds.filter(f => f.legs.length === 2).length
console.log(`\n── Check 5 — tips presenting two fold legs ──`)
console.log(`tips with 2 legs: ${twoLegs} / ${folds.length}`)
const odd = folds.filter(f => f.legs.length !== 2)
if (odd.length) console.log(odd.map(f => `  legs=${f.legs.length}  ${f.skelId}[${f.capEnd}] tile#${f.tileIdx}`).join('\n'))

// Why does the snap fire on some and not others? It is bounded to detected MOUTHS.
console.log('\n── mouth coverage per fold tile ──')
let withM = 0, noM = 0
const nm = []
for (const f of folds) {
  const st = byRing.get(ringKey(f.ring))
  const ms = (st?.mouths || []).map(m => m.spurSkel)
  if (ms.includes(f.skelId)) withM++
  else { noM++; nm.push(f.skelId) }
}
console.log(`fold chains WITH a mouth disc on their cap tile: ${withM}`)
console.log(`fold chains with NO mouth disc (snap can't fire): ${noM}`)
if (nm.length) console.log('  ' + [...new Set(nm)].sort().join('\n  '))
