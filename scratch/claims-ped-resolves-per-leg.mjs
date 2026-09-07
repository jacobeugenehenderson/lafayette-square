#!/usr/bin/env node
// ⭐⭐⭐ A TREELAWN SWAP NEVER HAPPENS MID-LEG. *(Jacob, 2026-09-07)*
// ▶ node scratch/claims-ped-resolves-per-leg.mjs [scene]
//
//   "A treelawn swap never happens mid-leg, period. It's illogical. That's what the corners are
//    for, they are designed to accommodate shifts/swaps."
//
// `SECTION §3.3` step 1 says the same as a rule — "resolve a SINGLE per-edge depth… use this ONE
// resolution everywhere" — and §5, "Section edits are ALWAYS per-fe". ⛔ Resolving per contour
// POINT is finer than the ruled unit, and that is what let the arrangement change inside a leg:
// the operator's join line, a diagonal cut across the ribbon with a different width either side.
//
// ⭐⭐ A LEG IS THE CONTOUR BETWEEN TWO CORNERS, AND A CORNER IS WHERE THE CONTOUR TURNS.
// ⛔ NOT where the owner changes: ① HAS NO NODES. A chain cut and a segOrd boundary are chain-world
// bookkeeping — the contour runs straight through them, and a change of LABEL is not a change of
// PLACE. LS cuts South 18th Street into eleven chains; 58 of 174 roads are multi-chain.
//
// ⭐ The turn constants are ruled, not invented: `FILLET_TURN_TOL` (18°, below which a vertex is a
// curve sample) and `PROTO_HARD_TURN` (60°, derived from the tessellation's 0.10 m arc tolerance).
import { feed, buildProto } from './_proto-feed.mjs'
import { sectionPassProtoTile, resolvePedDepths } from '../src/lib/tileGround.js'
const TURN = 18
const turnAt = (g, q) => { const n = g.length, P = g[(q-1+n)%n], V = g[q], N = g[(q+1)%n]
  const t = Math.atan2(N[1]-V[1], N[0]-V[0]) - Math.atan2(V[1]-P[1], V[0]-P[0])
  return Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) * 180 / Math.PI }
let bad = 0
for (const scene of (process.argv[2] ? [process.argv[2]] : ['lafayette-square', 'hipointe-demun'])) {
  const f = feed(scene); if (!f) { bad++; continue }
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
  let legs = 0, midLeg = 0, tieBreaks = 0, pads = 0
  for (const t of T) {
    const r = sectionPassProtoTile(t, f.curbWidth, { outer:'LU', inner:'SW' }, f.blockCustoms)
    tieBreaks += r.legSplit || 0; pads += r.padsBuilt || 0
    for (let ri = 0; ri < t.iaFull.length; ri++) {
      const ring = t.iaFull[ri], stp = t.iaStamp[ri], n = ring.length; if (n < 3) continue
      const cuts = []; for (let q = 0; q < n; q++) if (turnAt(ring, q) >= TURN) cuts.push(q)
      const spans = cuts.length ? cuts.map((c, x) => [c, ((cuts[(x+1)%cuts.length] - c + n) % n) || n]) : [[0, n]]
      for (const [s0, len] of spans) {
        legs++
        const seen = new Set()
        for (let k = 0; k < len; k++) {
          const s = stp[(s0 + k) % n]; if (s == null) continue
          const run = t.runs[s]
          const c = f.blockCustoms?.[run.skelId]?.[run.side]?.[run.segOrd] || null
          const d = resolvePedDepths(run.baseMeasure, run.side, c)
          seen.add((d.hasTL ? 'Y' : 'N') + '|' + d.tl.toFixed(2) + '|' + d.sw.toFixed(2))
        }
        if (seen.size > 1) midLeg++
      }
    }
  }
  console.log(`\n══ ${scene} · ${T.length} tiles ══`)
  console.log(`  legs (contour between two corners): ${legs} · ADA pads: ${pads}`)
  console.log(`  legs spanning >1 frontage, so the leg's ONE value was tie-broken by length: ${tieBreaks}`)
  console.log(`  ⛔ legs whose SOURCE data carries more than one arrangement: ${midLeg}`)
  console.log(`     ⇒ those are resolved to ONE by the painter; this is the size of the ambiguity, not a defect count.`)
  // THE GATE: what the painter actually emits must be single-valued per leg, always.
  let emitted = 0
  for (const t of T) {
    const r = sectionPassProtoTile(t, f.curbWidth, { outer:'LU', inner:'SW' }, f.blockCustoms)
    if (r.legMulti) emitted += r.legMulti
  }
  if (emitted) { console.log(`  ⛔ FAIL — the painter emitted ${emitted} leg(s) with more than one arrangement.`); bad++ }
  else console.log(`  ✅ the painter emits ONE arrangement per leg — a mid-leg swap is unconstructible.`)
}
console.log(bad ? `\n⛔ ${bad} FAILURE(S)` : `\n✅ PASS — the swap lives at the corner, which is what corners are for.`)
process.exit(bad ? 1 : 0)
