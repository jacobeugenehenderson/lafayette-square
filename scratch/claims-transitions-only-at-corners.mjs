#!/usr/bin/env node
// ⭐⭐⭐ JACOB'S ACCEPTANCE, IN HIS WORDS (2026-09-07, on the 18th Street break):
//   "The corners need to be one of the 3 configs only, and transitions only happen at corners."
// ▶ node scratch/claims-transitions-only-at-corners.mjs [scene ...]
//
// ⛔ WHY THE BAND-CLOSURE COUNTER CANNOT SEE THIS. `claims-sidewalk-is-one-band` counts PIECES. A
// walk that simply STOPS with a clean square end mid-block — the defect in his screenshot — leaves
// the rest of the band one piece, so closure is unchanged and the counter reports success. Measured:
// the 18th Street tiles went 7/16 → 15/24 closing across the very commits he is calling a break.
// ⇒ This check asks the other question: WHERE does the cross-section change, and is that a corner?
//
// A transition is legal ONLY at a corner. A corner is (a) a frozen fillet ARC, or (b) two different
// ROADS meeting — `skelId` minus its chain-ordinal suffix, because a chain cut is NOT a corner
// (① has no nodes). Anything else is a mid-run seam and is the defect.
import { feed, buildProto } from './_proto-feed.mjs'
import { resolvePedDepths } from '../src/lib/tileGround.js'
const KP = p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
const road = id => String(id||'').replace(/-\d+$/, '')
const scenes = process.argv.slice(2)
let bad = 0
for (const scene of (scenes.length ? scenes : ['lafayette-square','hipointe-demun'])) {
  const f = feed(scene); if (!f) { bad++; continue }
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
  let legal = 0, illegal = 0; const worst = []
  for (const [ti, t] of T.entries()) {
    for (const [ri, ring] of (t.iaFull || []).entries()) {
      const n = ring.length, stp = t.iaStamp[ri] || []
      if (n < 3) continue
      // the corner mask: fillet arcs, tangent to tangent
      const ix = new Map(); for (let q = 0; q < n; q++) { const k = KP(ring[q]); if (!ix.has(k)) ix.set(k, q) }
      const ARC = new Set()
      for (const fl of (t.fillets || [])) { const a = ix.get(KP(fl.tA)), b = ix.get(KP(fl.tB)); if (a == null || b == null) continue
        const fwd=(b-a+n)%n, bwd=(a-b+n)%n, d=fwd<=bwd?1:-1
        for (let k=0,q=a;;k++,q=(q+d+n)%n){ ARC.add(q); if(q===b||k>n) break } }
      const arr = (q) => { const r = stp[q]; if (r == null) return null
        const run = t.runs[r], cu = f.blockCustoms?.[run.skelId]?.[run.side]?.[run.segOrd] || null
        const d = resolvePedDepths(run.baseMeasure, run.side, cu)
        return { key: `${d.hasTL?'Y':'N'}|${d.tl.toFixed(2)}|${d.sw.toFixed(2)}`, road: road(run.skelId) } }
      for (let q = 0; q < n; q++) {
        const A = arr((q-1+n)%n), B = arr(q)
        if (!A || !B || A.key === B.key) continue          // no transition here
        const atCorner = ARC.has(q) || ARC.has((q-1+n)%n) || A.road !== B.road
        if (atCorner) { legal++; continue }
        illegal++
        const P = ring[q]
        worst.push({ ti, at: [P[0].toFixed(0), P[1].toFixed(0)].join(','), from: A.key, to: B.key, road: A.road })
      }
    }
  }
  console.log(`\n══ ${scene} ══`)
  console.log(`  ✅ transitions AT a corner (arc, or two roads meeting): ${legal}`)
  console.log(`  ⛔ transitions MID-RUN — the seam Jacob's rule disqualifies: ${illegal}`)
  const byRoad = {}; for (const w of worst) byRoad[w.road] = (byRoad[w.road]||0)+1
  for (const [r,c] of Object.entries(byRoad).sort((a,b)=>b[1]-a[1]).slice(0,8)) console.log(`     ${String(c).padStart(4)}  ${r}`)
  for (const w of worst.filter(w=>w.road.includes('18th')).slice(0,6)) console.log(`     ⛔ tile ${w.ti} at (${w.at})  ${w.from} → ${w.to}  on ${w.road}`)
  if (illegal) bad++
}
console.log(bad ? `\n⛔ FAIL — a transition happens where there is no corner.` : `\n✅ PASS — every transition is at a corner.`)
process.exit(bad ? 1 : 0)
