#!/usr/bin/env node
// ⭐⭐⭐ THE ACCEPTANCE FOR THE RAMP, AND IT IS A CONTINUITY TEST, NOT A DIMENSION ONE.
// `RIBBONS §1`: "an AUTHORED feature is checked by DIMENSION; a DERIVED feature is checked by
// CONTINUITY." The ramp is derived — nothing authors its length — so the only honest question is
// whether the walk's outer boundary MOVES ACROSS ONE VERTEX, which is the chevron the operator
// photographed. It is measured on the DENSIFIED ring (`sectionDump.ramp`), because that is where
// the depth the offset is handed actually lives; reading the ① edges cannot see the ramp at all
// and reports the very step the ramp removes.
// ⛔ It reads the painter's own disclosure channel. It re-derives nothing and writes nothing —
// "a probe that WRITES a value cannot see that the value was already there."
// ▶ SECTION_DUMP=1 node scratch/claims-the-slope-is-on-the-leg.mjs [scene]
process.env.SECTION_DUMP = '1'
import { feed, buildProto } from './_proto-feed.mjs'
const scene = process.argv[2] || 'lafayette-square'
const { sectionPassProtoTile, sectionDump } = await import('../src/lib/tileGround.js')
sectionDump.on = true
const f = feed(scene); if (!f) process.exit(1)
const r = buildProto(f, { quiet: true, protoProducer: true })
const T = r.protoShapeTiles || []
const S = (v) => Array.isArray(v) ? v[0] : v, E = (v) => Array.isArray(v) ? v[1] : v
let tiles = 0, edges = 0, steps = 0, ramps = 0, threw = 0
const jump = []
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
      const d = Math.abs(S(nxt.walkFrom) - E(cur.walkFrom))
      if (d > 0.05) { steps++; jump.push(d) }
    }
  }
}
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * p))] : 0 }
console.log(`${scene}: ${tiles} tile(s) painted${threw ? ` · ⛔ ${threw} THREW` : ''}`)
console.log(`  densified edges                        : ${edges}`)
console.log(`  edges the walk's outer depth TRAVELS on : ${ramps}  ← the slope, on the leg`)
console.log(`  DISCONTINUITIES > 5 cm across one vertex: ${steps}  ← the chevron. 0 is the acceptance`)
if (jump.length) console.log(`     jump size (m): median ${q(jump, .5).toFixed(2)} · p90 ${q(jump, .9).toFixed(2)} · max ${q(jump, 1).toFixed(2)}`)
