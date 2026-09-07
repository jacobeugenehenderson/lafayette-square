#!/usr/bin/env node
// ⭐⭐⭐ JACOB'S RULE, MADE CHECKABLE: "A treelawn swap NEVER happens mid-leg, period. It's
// illogical. That's what the corners are for." (2026-09-07; `SECTION §4` rule 1.)
// ▶ node scratch/claims-a-swap-never-happens-mid-street.mjs [scene...]
//
// ⛔ MEASURE THE DEFINITION, NOT THE CUT SET. The tempting check is "what does the leg cut fire on"
// — and it answers the wrong question. A leg boundary with the SAME owner on both sides resolves to
// the same cross-section on both sides BY CONSTRUCTION (one owner, one resolution), so no seam can
// appear there however the cut was found. ⭐ What matters is where the CROSS-SECTION actually
// changes, and whether that place is a corner. Measured on LS: 418 of 609 owner-changing boundaries
// resolve identically and are invisible. A cut-set census would have reported all 609.
//
// THE FOUR OUTCOMES, and only two of them are defects:
//   · two different ROADS meet          ✅ a real corner — what corners are for
//   · same chain, different SIDE        ✅ a cap fold: the end coupler (`SECTION §6.3`)
//   · same ROAD, different CHAIN        ⛔ the kit cuts one road into many chains and each carries
//                                          its own measure. `SECTION §4` rule 5: a chain cut is NOT
//                                          a corner. ⛔⛔ AND THE CURE IS NOT TO MERGE THEM —
//                                          rule 4: a road's chains genuinely carry different
//                                          treelawn (South 18th: twelve values on one side), and
//                                          merging averages away the survey. A road-level merge was
//                                          built on 2026-09-07 and excised for exactly that.
//                                          ⇒ Jacob's rule 3 is the cure and it is UNBUILT: "even if
//                                          we think something changes mid-leg, that's what the
//                                          ANGLED SLOPE CORNER JOINER is for." ASPIRATION, filed.
//   · same chain, same side, segOrd     ⛔ an authoring ordinal is not a place on the map
import fs from 'fs'
import { feed, buildProto, ribbonsPath } from './_proto-feed.mjs'
import { resolvePedDepths } from '../src/lib/tileGround.js'

const TOL = 18 * Math.PI / 180          // ⛔ FILLET_TURN_TOL, the ruled constant — not a new one
const KP = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
// the resolved cross-section, exactly as `stampMeasure` builds it — depths AND the arrangement
const xs = (run, bc) => { if (!run) return null
  const c = bc?.[run.skelId]?.[run.side]?.[run.segOrd] || null
  const d = resolvePedDepths(run.baseMeasure, run.side, c)
  return `${(d.tl || 0).toFixed(3)}|${(d.sw || 0).toFixed(3)}|${c?.materials?.outer ?? (d.hasTL ? 'LU' : 'SW')}|${c?.materials?.inner ?? (d.hasTL ? 'SW' : 'LU')}` }

let bad = 0
const scenes = process.argv.slice(2).filter(a => !a.startsWith('--'))
for (const scene of (scenes.length ? scenes : ['lafayette-square', 'hipointe-demun'])) {
  const f = feed(scene); if (!f) { bad++; continue }
  const rb = JSON.parse(fs.readFileSync(ribbonsPath(scene), 'utf8'))
  const road = new Map()
  for (const s of rb.streets || []) road.set(s.skelId || s.id, { r: s.roadId || null, t: s.throughId || null })
  // ⛔ EITHER union agrees — `RIBBONS §3.3`. `throughId ?? roadId` makes `roadId` unreachable and is
  // a recorded regression; this is the restored form.
  const sameRoad = (a, b) => { const A = road.get(a) || {}, B = road.get(b) || {}
    return (!!A.r && A.r === B.r) || (!!A.t && A.t === B.t) || a === b }
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles

  let bounds = 0, invisible = 0, corner = 0, capFold = 0, chainCut = 0, ordinal = 0
  const inst = new Map()
  for (const t of T) {
    const runs = t.runs || []
    for (const [ri, ring] of (t.iaFull || []).entries()) {
      const stp = t.iaStamp[ri] || [], n = ring.length; if (n < 3) continue
      const turnAt = (q) => { const P = ring[(q - 1 + n) % n], V = ring[q], N = ring[(q + 1) % n]
        const a = Math.atan2(N[1] - V[1], N[0] - V[0]) - Math.atan2(V[1] - P[1], V[0] - P[0])
        return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) }
      const cutSet = new Set(); for (let q = 0; q < n; q++) if (turnAt(q) >= TOL) cutSet.add(q)
      const ix = new Map(); for (let q = 0; q < n; q++) { const k = KP(ring[q]); if (!ix.has(k)) ix.set(k, q) }
      for (const fl of t.fillets || []) { const a = ix.get(KP(fl.tA)), b = ix.get(KP(fl.tB))
        if (a != null) cutSet.add(a); if (b != null) cutSet.add(b) }
      const cuts = []; for (let q = 0; q < n; q++) if (cutSet.has(q) !== cutSet.has((q - 1 + n) % n)) cuts.push(q)
      const spans = cuts.length ? cuts.map((c, x) => [c, ((cuts[(x + 1) % cuts.length] - c + n) % n) || n]) : [[0, n]]
      if (spans.length < 2) continue
      const winOf = spans.map(([s0, len]) => {
        const byRun = new Map()
        for (let k = 0; k < len; k++) { const q = (s0 + k) % n, r = stp[q]; if (r == null) continue
          const a = ring[q], b = ring[(q + 1) % n]
          byRun.set(r, (byRun.get(r) || 0) + Math.hypot(b[0] - a[0], b[1] - a[1])) }
        const auth = (r) => !!f.blockCustoms?.[runs[r].skelId]?.[runs[r].side]?.[runs[r].segOrd]
        let win = null, best = -1, wa = false
        for (const [r, L] of byRun) { const a2 = auth(r); if ((a2 && !wa) || (a2 === wa && L > best)) { best = L; win = r; wa = a2 } }
        return win })
      for (let x = 0; x < spans.length; x++) {
        const a = winOf[x], b = winOf[(x + 1) % spans.length]
        bounds++
        if (a == null || b == null || a === b) continue
        const ra = runs[a], rb2 = runs[b]
        if (xs(ra, f.blockCustoms) === xs(rb2, f.blockCustoms)) { invisible++; continue }
        if (ra.skelId !== rb2.skelId) {
          if (sameRoad(ra.skelId, rb2.skelId)) { chainCut++
            const k = `${ra.skelId} ↔ ${rb2.skelId}`; inst.set(k, (inst.get(k) || 0) + 1) }
          else corner++
        } else if (ra.side !== rb2.side) capFold++
        else { ordinal++; const k = `${ra.skelId}|${ra.side} segOrd ${ra.segOrd} ↔ ${rb2.segOrd}`
          inst.set(k, (inst.get(k) || 0) + 1) }
      }
    }
  }
  console.log(`\n══ ${scene} · ${T.length} tile(s) · ${bounds} leg boundaries ══`)
  console.log(`   ·  owner changes resolving to the SAME cross-section  ${invisible}   (no seam — invisible)`)
  console.log(`   ✅ two different ROADS meet — a real corner           ${corner}`)
  console.log(`   ✅ same chain, different SIDE — a cap fold            ${capFold}`)
  console.log(`   ⛔ same ROAD, different CHAIN                         ${chainCut}   ← the gate (rule 5)`)
  console.log(`   ⛔ same chain + side, different segOrd                ${ordinal}   ← the gate (an ordinal is not a place)`)
  for (const [k, v] of [...inst].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`        ×${v}  ${k}`)
  if (chainCut || ordinal) bad++
}
console.log(bad ? `\n⛔ FAIL — the cross-section changes where no corner is. ⛔ THE CURE IS NOT TO MERGE THE CHAINS
   (SECTION §4 rule 4 — that averages away the survey, and it was built and excised on 2026-09-07).
   It is Jacob's rule 3, and it is UNBUILT: "that's what the angled slope corner joiner is for."`
                : `\n✅ PASS — every cross-section change sits at a corner or a cap fold.`)
process.exit(bad ? 1 : 0)
