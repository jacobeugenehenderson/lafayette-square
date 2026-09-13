#!/usr/bin/env node
// ⭐⭐⭐ THE ACCEPTANCE FOR THE RAMP, AND IT IS A CONTINUITY TEST, NOT A DIMENSION ONE.
// `RIBBONS §1`: "an AUTHORED feature is checked by DIMENSION; a DERIVED feature is checked by
// CONTINUITY." The ramp is derived — nothing authors its length — so the only honest question is
// whether the walk's boundary MOVES ACROSS ONE VERTEX, which is the chevron the operator
// photographed.
// ⛔⛔ BOTH EDGES. A BAND HAS TWO, AND A GATE THAT WATCHES ONE OF THEM IS A FALLBACK. This read
// only `walkFrom` and reported 0 while the INNER edge stepped by a whole sidewalk width at every
// mixed corner — 376 on LS, 1228 on HPDM — because `sectionDump.ramp` did not even disclose
// `walkTo`. A clean pass over half the evidence is the silent substitution `CLAUDE.md` Layer 0 q2
// names, inside the detector. The steps are also CLASSIFIED, because "at a corner" and "at a
// frontage change with no corner" are two different defects that shared one counter.
// It is measured on the DENSIFIED ring (`sectionDump.ramp`), because that is where
// the depth the offset is handed actually lives; reading the ① edges cannot see the ramp at all
// and reports the very step the ramp removes.
// ⛔ It reads the painter's own disclosure channel. It re-derives nothing and writes nothing —
// "a probe that WRITES a value cannot see that the value was already there."
// ▶ SECTION_DUMP=1 node checks/claims-the-slope-is-on-the-leg.mjs [scene]
process.env.SECTION_DUMP = '1'
import { feed, buildProto } from '../scratch/_proto-feed.mjs'
const scene = process.argv[2] || 'lafayette-square'
const { sectionPassProtoTile, sectionDump } = await import('../src/lib/tileGround.js')
sectionDump.on = true
const f = feed(scene); if (!f) process.exit(1)
const r = buildProto(f, { quiet: true, protoProducer: true })
const T = r.protoShapeTiles || []
const S = (v) => Array.isArray(v) ? v[0] : v, E = (v) => Array.isArray(v) ? v[1] : v
let tiles = 0, edges = 0, steps = 0, ramps = 0, threw = 0
const jump = [], byClass = {}
for (const st of T) {
  sectionDump.ramp.length = 0
  try { sectionPassProtoTile(st, f.curbWidth, { outer: 'LU', inner: 'SW' }, f.blockCustoms) } catch (e) { threw++; continue }
  tiles++
  const byRing = new Map()
  for (const row of sectionDump.ramp) { const a = byRing.get(row.ri) || byRing.set(row.ri, []).get(row.ri); a.push(row) }
  for (const [, arr] of byRing) {
    arr.sort((a, b) => a.j - b.j); const n = arr.length
    for (let k = 0; k < n; k++) {
      const cur = arr[k], nxt = arr[(k + 1) % n]
      edges++
      // an edge whose two ends differ IS a ramp edge — the depth travels ALONG it
      if (Math.abs(E(cur.walkFrom) - S(cur.walkFrom)) > 1e-6) ramps++
      // a STEP is a discontinuity BETWEEN two edges: this edge ends at one depth, the next starts
      // at another. That is the jog; there is no length over which it happens.
      // OUTER edge
      const d = Math.abs(S(nxt.walkFrom) - E(cur.walkFrom))
      // INNER edge — the half this gate used to be blind to
      const di = (cur.walkTo != null && nxt.walkTo != null) ? Math.abs(S(nxt.walkTo) - E(cur.walkTo)) : 0
      const worst = Math.max(d, di)
      if (worst > 0.05) {
        steps++; jump.push(worst)
        // ⛔ A step AT A TANGENT is the corner. A step between two legs with no corner between
        // them is the frontage-change class — a different defect, never folded into this counter.
        // ⭐⭐⭐ A BLUNT END IS NOT A CHEVRON. `_archive/CORNER_DEBUG.md`: "Treelawn always
        // dead-ends (ADA curb ramp). The sidewalk fills through behind the treelawn's blunt end."
        // At a TL↔TL tangent the lawn runs full width and STOPS, and the pad fills to the kerb —
        // so `walkFrom` steps by exactly the lawn's width onto an arc that is AT the kerb. That is
        // the authoring gesture's intended output, and a gate that scores it as damage is
        // `CLAUDE.md` Layer 0 q3 committed by an instrument.
        // ⛔ It is RECOGNISED, never suppressed: the predicate is the arc side sitting at the kerb
        // and the step measuring the leg's own outer strip. Anything else at a tangent is a real
        // chevron and still counts.
        const arcSide = cur.inArc ? cur : nxt.inArc ? nxt : null
        const legSide = cur.inArc ? nxt : nxt.inArc ? cur : null
        const blunt = arcSide && legSide
          && Math.abs(S(arcSide.walkFrom)) < 1e-6                 // the pad is at the kerb
          && Math.abs(worst - Math.abs(E(legSide.walkFrom))) < 0.02  // the step IS the lawn width
        const k = (cur.inArc && nxt.inArc) ? 'inside one arc'
                : blunt ? 'BLUNT treelawn end at a tangent (the ADA pad — EXPECTED)'
                : (cur.inArc || nxt.inArc) ? 'leg <-> ARC (the corner)'
                                           : 'leg <-> leg (frontage change, NO corner)'
        if (!blunt) byClass[k] = (byClass[k] || 0) + 1
        else { byClass[k] = (byClass[k] || 0) + 1; steps-- ; jump.pop() }
      }
    }
  }
}
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * p))] : 0 }
console.log(`${scene}: ${tiles} tile(s) painted${threw ? ` · ⛔ ${threw} THREW` : ''}`)
console.log(`  densified edges                        : ${edges}`)
console.log(`  edges the walk's outer depth TRAVELS on : ${ramps}  ← the slope, on the leg`)
console.log(`  DISCONTINUITIES > 5 cm across one vertex: ${steps}  ← the chevron, EITHER edge. 0 is the acceptance`)
if (jump.length) console.log(`     jump size (m): median ${q(jump, .5).toFixed(2)} · p90 ${q(jump, .9).toFixed(2)} · max ${q(jump, 1).toFixed(2)}`)
for (const k of Object.keys(byClass).sort()) console.log(`     ${String(byClass[k]).padStart(6)}  ${k}`)
if (!steps) console.log('  \u2705 both edges continuous across every vertex.')
