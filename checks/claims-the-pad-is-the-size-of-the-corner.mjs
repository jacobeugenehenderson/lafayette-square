#!/usr/bin/env node
// ⭐⭐⭐ THE ADA PAD IS THE SIZE OF THE CORNER — the gate on the canary Jacob marked 2026-09-07.
// ▶ SECTION_DUMP=1 node checks/claims-the-pad-is-the-size-of-the-corner.mjs [scene ...]
//
// THE DEFECT. The pad's extent came from a fillet's arc where one existed, and otherwise from
// "the one edge the owners meet across". Two things went wrong at once and both are `RIBBONS §1`:
//   · the corner test was a CHAIN LABEL, so a corner was minted where ① does not turn and nothing
//     rounds it (▶ claims-a-corner-is-where-one-turns.mjs);
//   · the arc's extent was stamped `k <= len` — an EDGE span counted as VERTICES — so every corner
//     also claimed THE FIRST EDGE OF THE NEXT LEG, and on ①'s sparse contour a straight frontage
//     is ONE EDGE. One quadrilateral block: 458 m of 458 m painted as curb ramp.
//
// ⛔⛔ BY LENGTH, NEVER BY VERTEX COUNT. ② eases one corner into ~12 vertices while a straight leg
// needs 2, so counting contour EDGES inside a corner over-weights the arc several-fold. That unit
// is how "58.8% of contour edges sit inside a corner extent" came to be read as "a third of the
// map is pad". The eye asks a question in METRES; so does this.
//
// ⛔ IT READS THE PAINTER, IT DOES NOT RESTATE IT (`SECTION_DUMP=1`). `c9a0d783`: an acceptance
// that re-implements the rule carries the same blind spot as the code — two instruments with one
// blind spot are one instrument.
// ⛔ AND THE EXPECTATION IS DERIVED, NOT TUNED: a corner's pad should be about its own arc, so the
// map-wide share is compared against the arc length the FILLETS THEMSELVES declare. No constant.
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { sectionPassProtoTile, sectionDump } from '../src/lib/tileGround.js'

if (!sectionDump.on) {
  console.log('⛔ NOT RUN. This check reads ③\'s own per-edge resolution and will not reconstruct it.')
  console.log('   ▶ SECTION_DUMP=1 node checks/claims-the-pad-is-the-size-of-the-corner.mjs [scene ...]')
  process.exit(1)
}
const scenes = feedScenes().filter(a => !a.startsWith('--'))

let failures = 0
for (const scene of scenes) {
  const f = feed(scene); if (!f) { failures++; continue }
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
  let padLen = 0, totLen = 0, lawnLen = 0, erased = 0, arcLen = 0, nArc = 0
  const worst = []
  for (const [ti, st] of T.entries()) {
    const rings = (st.iaFull || []).filter(r => r?.length >= 3)
    // what the fillets themselves say a corner is worth, in metres of kerb
    for (const fl of st.fillets || []) { if (fl?.r > 0) { arcLen += fl.r * Math.PI / 2; nArc++ } }
    sectionDump.rows.length = 0
    sectionPassProtoTile(st, f.curbWidth, { outer: 'LU', inner: 'SW' }, f.blockCustoms)
    let tPad = 0, tTot = 0
    for (const row of sectionDump.rows) {
      const rg = rings[row.ri]; if (!rg) continue
      const a = rg[row.i], b = rg[(row.i + 1) % rg.length]
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      totLen += L; tTot += L
      if (row.corner != null) { padLen += L; tPad += L }
      if (!row.outWalk && row.inWalk) { lawnLen += L; if (row.corner != null) erased += L }
    }
    if (tTot > 0) worst.push({ ti, share: tPad / tTot, tot: tTot })
  }
  worst.sort((a, b) => b.share - a.share)
  // ⭐ THE EXPECTATION, DERIVED: the pad should be roughly the fillets' own arc length. A generous
  // ceiling of 3× that keeps the check from policing legitimate square corners (len = 0 stamps one
  // edge) while still catching a pad that has taken a frontage. ⛔ It is a RATIO to the geometry's
  // own declaration, never a fixed share of the map — a town of tiny blocks is mostly corner and
  // must not fail for it.
  const budget = arcLen * 3
  const ok = padLen <= budget
  if (!ok) failures++
  console.log(`\n══ ${scene} · the ADA pad's extent, BY LENGTH ══`)
  console.log(`  kerb total                              ${totLen.toFixed(0)} m`)
  console.log(`  inside a corner extent (the pad)        ${padLen.toFixed(0)} m  (${(100 * padLen / totLen).toFixed(1)}%)`)
  console.log(`  what ${nArc} fillets declare their arcs are worth  ${arcLen.toFixed(0)} m  (budget 3× = ${budget.toFixed(0)} m)`)
  console.log(`  kerb whose lawn is the OUTER strip      ${lawnLen.toFixed(0)} m`)
  console.log(`  ...of which the pad erases the lawn     ${erased.toFixed(0)} m  (${(100 * erased / Math.max(1, lawnLen)).toFixed(1)}%)`)
  console.log(`  most pad-covered blocks:`)
  for (const w of worst.slice(0, 4)) console.log(`     tile ${String(w.ti).padStart(4)}  ${(100 * w.share).toFixed(0)}% of ${w.tot.toFixed(0)} m`)
  console.log(ok ? `  ✅ the pad is the size of the corner.` : `  ⛔ FAIL — the pad is ${(padLen / Math.max(1, arcLen)).toFixed(1)}× the arc length the fillets declare.`)
}
// ⚠️ THIS IS NOT AN EYE VERDICT. `SECTION §6.2`: verify corner changes on a render. A pad that is
// the right SIZE can still be in the wrong PLACE, and this cannot see that.
process.exit(failures ? 1 : 0)
