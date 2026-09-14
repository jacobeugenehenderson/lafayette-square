#!/usr/bin/env node
// ⭐⭐⭐ THE RAMP NEEDS SOMEWHERE TO HAPPEN, AND ① HAS NOWHERE TO PUT IT.
// ▶ SECTION_DUMP=1 node checks/claims-the-ramp-has-room.mjs [scene ...]
//
// TWO NUMBERS, AND THEY ARE ONE FINDING (`SECTION §4`, "THE RAMP"):
//  1. how big is the step the band takes at a corner?   — the chevron, sized
//  2. how many LONG edges does a frontage have to spread that step across?
// The grass must go from full width to nothing between the leg and the corner (`§6.1` step 3), and
// `§6.1` step 5 says that transition belongs ON THE LEG. Depth is per-EDGE, so a frontage with one
// long edge has exactly one place to put a value — and the change can only be a STEP.
//
// ⛔⛔ REPORT THE LONG-EDGE COUNT, NEVER THE RAW EDGE COUNT. At the span level ①'s contour looks
// rich (median ~13 edges per frontage) and that reading REFUTES this finding. Nearly four fifths of
// its vertices are spent inside the eased corner arcs, where the depth must be CONSTANT. Only the
// straight run can carry a ramp. The forensic that found this nearly reported it the other way.
//
// ⛔ Reads the painter's own resolution through `SECTION_DUMP` — it does not restate the ladder.
// Derived from the forensic's `_fx-corner-step.mjs` + `_fx-taper-room.mjs` (2026-09-07).
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { sectionPassProtoTile, sectionDump } from '../src/lib/tileGround.js'

if (!sectionDump.on) {
  console.log('⛔ NOT RUN — ▶ SECTION_DUMP=1 node checks/claims-the-ramp-has-room.mjs [scene ...]')
  process.exit(1)
}
const scenes = feedScenes().filter(a => !a.startsWith('--'))
const med = (a) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0
const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)] : 0

let failures = 0
for (const scene of scenes) {
  const f = feed(scene); if (!f) { failures++; continue }
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
  const steps = [], lawnKilled = [0, 0]
  sectionDump.ramp.length = 0
  let short = 0, edges = 0
  const longPerFrontage = []
  for (const st of T) {
    const rings = (st.iaFull || []).filter(r => r?.length >= 3)
    sectionDump.rows.length = 0
    sectionPassProtoTile(st, f.curbWidth, { outer: 'LU', inner: 'SW' }, f.blockCustoms)
    const by = new Map()
    for (const r of sectionDump.rows) { if (!by.has(r.ri)) by.set(r.ri, []); by.get(r.ri)[r.i] = r }
    for (const [ri, rows] of by) {
      const rg = rings[ri]; if (!rg) continue
      const n = rows.length
      const eLen = (q) => { const a = rg[q], b = rg[(q + 1) % rg.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]) }
      // the ramp's room: LONG edges per contiguous frontage (an arc edge cannot carry a ramp)
      let run = 0, own = null
      for (let i = 0; i < n; i++) {
        const r = rows[i]; if (!r) continue
        edges++; const L = eLen(i); if (L < 1) short++
        const k = r.owner
        if (k !== own) { if (own != null) longPerFrontage.push(run); own = k; run = 0 }
        if (L > 5) run++
      }
      if (own != null) longPerFrontage.push(run)
      // ⛔ measured on the ORIGINAL edges only for the room count above; the STEP is measured on
      // the DENSIFIED ring below, because that is what the offset is handed.
    }
  }
  // ⭐ THE STEP, ON THE RING THE OFFSET IS ACTUALLY HANDED. A jump between one edge's END depth
  // and the next edge's START depth is a discontinuity the offset must bridge — the chevron. Where
  // the ramp has room, those two agree and the change happens ALONG an edge instead.
  const jumps = [], ramped = []
  for (let x = 0; x < sectionDump.ramp.length; x++) {
    const a = sectionDump.ramp[x], b = sectionDump.ramp[x + 1]
    if (b && b.ri === a.ri) jumps.push(Math.abs(a.walkFrom[1] - b.walkFrom[0]))
    if (Math.abs(a.walkFrom[0] - a.walkFrom[1]) > 1e-9) ramped.push(a.len)
  }
  console.log(`\n══ ${scene} · has the RAMP anywhere to happen? ══`)
  console.log(`  corner↔leg boundaries                    ${lawnKilled[1] || steps.length}`)
  console.log(`  ⭐ edges that RAMP (depth varies along them) ${ramped.length} · median length ${med(ramped).toFixed(2)} m`)
  console.log(`  ⛔ depth JUMPS between adjacent edges     ${jumps.filter(v => v > 1e-6).length} of ${jumps.length} · max ${jumps.reduce((m,v)=>v>m?v:m,0).toFixed(2)} m`)
  console.log(`  contour edges under 1 m (inside the arcs) ${short} of ${edges}  (${(100 * short / Math.max(1, edges)).toFixed(1)}%)`)
  console.log(`  ⛔ LONG (>5 m) edges per frontage — the ramp's only room — median ${med(longPerFrontage)}`)
  // ⭐ THE ACCEPTANCE IS THE JUMP, NOT THE ROOM. Room on ①'s own contour is a fact about ① and
  // does not change; what must be true is that the depth handed to the offset is CONTINUOUS.
  const bad = jumps.filter(v => v > 1e-6).length
  if (bad) { failures++; console.log(`  ⛔ FAIL — ${bad} discontinuities remain; the offset must bridge them, and the bridge is the chevron.`) }
  else console.log(`  ✅ the depth is continuous — a step is not constructible.`)
}
// ⚠️ NOT AN EYE VERDICT. This says the ramp CANNOT be expressed, not that anything looks wrong.
process.exit(failures ? 1 : 0)
