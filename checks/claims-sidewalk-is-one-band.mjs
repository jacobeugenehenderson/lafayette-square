#!/usr/bin/env node
// ⭐⭐⭐ THE ACCEPTANCE, IN THE OPERATOR'S WORDS.
// ▶ node checks/claims-sidewalk-is-one-band.mjs [scene]
//
//   `SECTION §7`: "The sidewalk should be one continuous smooth line all around the entire polygon."
//   (2026-09-07): "The sidewalk creates one continuous band around the block; it has 3 different
//    corner configs to do it."
//
// ⇒ Whatever the legs carry — swapped, authored, TL-Y, TL-N — THE WALK MUST CLOSE AS ONE LOOP.
// The three corner configurations (`SECTION §6.1`: TL↔TL · SW↔SW · SW↔TL) exist for exactly that:
// to carry the band across a change of arrangement. So the test is CONNECTIVITY of the drawn walk,
// not per-leg coverage.
//
// ⛔ THINGS THAT ARE NOT DEFECTS, and I gated on two of them before being corrected:
//   · a leg whose strips are swapped — that is AUTHORING (Layer 0 q3, "the override IS the product")
//   · a leg carrying a different depth from its neighbour — a street genuinely changes block to
//     block (`SURVEY §4`); the corner is what absorbs it
// ⛔ AND NOT THIS EITHER: counting unstamped CONTOUR POINTS. 0.5% of points is 4.7% of LENGTH,
// because one long frontage is a single edge. Measure what the eye sees: metres, and closure.
import { feed, buildProto } from '../scratch/_proto-feed.mjs'
import { sectionPassProtoTile, resolvePedDepths } from '../src/lib/tileGround.js'
import { differenceRings } from '../src/lib/buildBlockGeometryV2.js'
const SA = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i+1)%r.length; a += r[i][0]*r[j][1] - r[j][0]*r[i][1] } return a/2 }
let bad = 0
for (const scene of (process.argv[2] ? [process.argv[2]] : ['lafayette-square', 'hipointe-demun'])) {
  const f = feed(scene); if (!f) { bad++; continue }
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
  let one = 0, broken = 0, none = 0, legs = 0, multi = 0
  const worst = []
  for (const [ti, t] of T.entries()) {
    const r = sectionPassProtoTile(t, f.curbWidth, { outer:'LU', inner:'SW' }, f.blockCustoms)
    // ① THE BAND CLOSES — the acceptance
    const outers = differenceRings(r.Wacc, []).filter(g => SA(g) > 0)
    if (!outers.length) none++
    else if (outers.length === 1) one++
    else { broken++; worst.push({ ti, lu: t.lu, n: outers.length }) }
    // ② and the painter still emits ONE arrangement per leg (a swap may not happen mid-leg)
    for (let ri = 0; ri < t.iaFull.length; ri++) {
      const stp = t.iaStamp[ri], c = t.iaCorner?.[ri], n = t.iaFull[ri].length
      const cuts = []; if (c) for (let q = 0; q < n; q++) if (!!c[q] !== !!c[(q-1+n)%n]) cuts.push(q)
      const spans = cuts.length ? cuts.map((x, i2) => [x, ((cuts[(i2+1)%cuts.length]-x+n)%n)||n]) : [[0, n]]
      for (const [s0, len] of spans) {
        legs++
        const seen = new Set()
        for (let k = 0; k < len; k++) { const s = stp[(s0+k)%n]; if (s == null) continue
          const run = t.runs[s], cu = f.blockCustoms?.[run.skelId]?.[run.side]?.[run.segOrd] || null
          const d = resolvePedDepths(run.baseMeasure, run.side, cu)
          seen.add((d.hasTL?'Y':'N') + d.tl.toFixed(2) + d.sw.toFixed(2)) }
        if (seen.size > 1) multi++
      }
    }
  }
  console.log(`\n══ ${scene} · ${T.length} blocks · ${legs} legs ══`)
  console.log(`  ✅ walk closes as ONE continuous band: ${one}`)
  console.log(`  ⛔ walk in SEVERAL pieces:             ${broken}`)
  console.log(`  ·  no walk at all:                    ${none}`)
  console.log(`  legs whose SOURCE carries >1 arrangement (resolved to one by the painter): ${multi}`)
  worst.sort((a, b) => b.n - a.n)
  for (const w of worst.slice(0, 6)) console.log(`     tile ${String(w.ti).padStart(4)} ${w.lu.padEnd(14)} ${w.n} pieces`)
  if (broken) { console.log(`  ⛔ FAIL — the band is the acceptance and it does not close on ${broken} of ${T.length}.`); bad++ }
}
console.log(bad ? `\n⛔ ${bad} FAILURE(S) — the corner is not carrying the band across.`
                : `\n✅ PASS — one continuous band per block.`)
process.exit(bad ? 1 : 0)
