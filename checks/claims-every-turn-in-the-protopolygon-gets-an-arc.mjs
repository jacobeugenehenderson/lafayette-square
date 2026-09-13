#!/usr/bin/env node
// ⭐⭐⭐ THE COMPLEMENT OF `claims-the-ease-is-the-corner`, AND THE HALF THAT WAS NEVER BUILT.
//
// That gate asks: of the arcs the EASE MADE, how many does the label license? It walks `iaArc`, so
// **a corner that never made an arc cannot enter its loop.** It reports 100% while the operator is
// looking at a junction with no corner — measured 2026-09-08 at Mississippi × Park and
// Mississippi × Lafayette (Jacob: "one corner doesn't draw an eligible corner geometry so all the
// ADA/treelawn, etc. doesn't work"). ⛔ That is the FALSE-NEGATIVE blindness `RIBBONS §1` names when
// it retires the one-sided safety argument — *"name the error it CANNOT catch"* — live, and costing
// a corner. **A one-sided gate is not a gate; this is the other side.**
//
// THE CLAIM: **every vertex where ① TURNS past `FILLET_TURN_TOL` gets an arc in ②.**
//
// ⛔⛔ AND THE OUTCOME SPLITS FOUR WAYS, NOT TWO — measured 2026-09-08, because reporting "no arc
// stamped for this ① vertex" as one class **overstated the defect by 5×**. An arc frequently EXISTS
// at the expected offset while carrying no stamp back to the ① vertex that caused it: the union
// re-resolved the point. That is a TRACEABILITY gap, not a lost corner, and the two must never share
// a number. ⭐ The control that settles it: reached vertices sit p25 5.48 / median 7.79 / p75 11.21 m
// from their contour; the genuinely-arcless ones sit 5.50 / 8.54 / 14.58 — **the same position**, so
// the curb is right there and simply made no corner.
// `RIBBONS §1`: "a corner is a vertex where ① TURNS — and that is the whole test", and "THE EASE IS
// THE CORNER TEST." If ① turns and no arc exists, a corner was silently dropped.
//
// ⭐ EXACT, NOT PROXIMITY — AND IT ASKS THE STAMP, NOT THE ARC's ID.
// ⛔⛔ `iaArc`'s VALUE IS NOT AN ① INDEX, and assuming it was is how the first version of this probe
// reported a confident 45%. `easeContour` stamps each arc point with the corner's index **in the
// ring handed to the ease** (`tileGround.js:1622`) — the pre-ease offset ring — and 243 of 1045 ids
// fall outside `ring.length`, which is what caught it. **A carried value must be read as the thing
// it IS** (`RIBBONS §1`'s arity law).
// ⇒ THE QUESTION IS ASKED THROUGH `iaStamp` INSTEAD, whose documented job is exactly this: it is the
// ① vertex index each contour point was struck from (`tileGround.js:7672`). For ① vertex i: find the
// contour points stamped i, and ask whether ANY of them lies in an arc (`iaArc != null`). No id
// space assumed, no coordinates matched — `A15`'s forbidden proximity recovery avoided.
// ⛔ MEASURED ON ①'s OWN SHARP RING, never on ②: ② eases one corner into ~12 vertices of ~7°, so a
// turn test there finds no corners at all (this is why an earlier pass of mine read the WORKING
// corners as cornerless).
// ⛔ NO THRESHOLD INVENTED: `FILLET_TURN_TOL` is read out of the source and dies loudly if it moves.
// ⛔ NO SILENT SKIP (`POLYGON-FIRST §5` RULE 2): a tile with no curb ring or no arc stamp is its own
// counted class. The 25 blocks that legitimately yield no curb are a REAL ABSENCE, reported, not
// dropped into a percentage.
// ▶ node checks/claims-every-turn-in-the-protopolygon-gets-an-arc.mjs [scene] [--list]
import fs from 'fs'
import { feed, buildProto } from '../scratch/_proto-feed.mjs'

const src = fs.readFileSync(new URL('../src/lib/tileGround.js', import.meta.url), 'utf8')
const m = src.match(/const FILLET_TURN_TOL\s*=\s*([0-9.]+)\s*\*\s*Math\.PI\s*\/\s*180/)
if (!m) { console.log('⛔ LOUD FAIL: cannot read FILLET_TURN_TOL out of tileGround.js — the ruled constant moved. FIX THE PROBE; do not guess it.'); process.exit(1) }
const TOL = Number(m[1])

const LIST = process.argv.includes('--list')
const scene = process.argv.slice(2).find(a => !a.startsWith('--')) || 'lafayette-square'
const f = feed(scene); if (!f) process.exit(1)
const prev = console.log; console.log = () => {}
const R = buildProto(f, { quiet: true, protoArtifact: true }); console.log = prev

const ang = (a, b, c) => {
  const u = [b[0]-a[0], b[1]-a[1]], v = [c[0]-b[0], c[1]-b[1]]
  const lu = Math.hypot(...u), lv = Math.hypot(...v)
  if (lu < 1e-9 || lv < 1e-9) return null
  return Math.acos(Math.max(-1, Math.min(1, (u[0]*v[0]+u[1]*v[1])/(lu*lv)))) * 180/Math.PI
}

const FAR = 20   // m — beyond this there is no curb near the vertex at all; the block collapsed.
// ⛔ Not a tuning knob: the REACHED control sits at p25 5.48 / median 7.79 / p75 11.21 m, so 20 m is
// well outside the offset population rather than a line drawn through it. Re-derive the control
// before moving it.
let turns = 0, withArc = 0, dropped = [], lostStamp = [], absent = [], noCurb = 0, noStamp = 0
for (const st of R.protoShapeTiles) {
  const ring = st.ring || []
  if (ring.length < 3) continue
  const arcs = st.iaArc
  if (!(st.iaFull?.length)) { noCurb++; continue }            // ⛔ counted, never skipped
  if (!arcs?.length)        { noStamp++; continue }
  const stamps = st.iaStamp
  if (!stamps?.length) { noStamp++; continue }
  // ① vertex index → was any contour point struck from it inside an arc?
  const eased = new Map()                                      // ① index → true/false (seen at all)
  for (let ri = 0; ri < stamps.length; ri++) {
    const S = stamps[ri] || [], A = arcs[ri] || []
    for (let j = 0; j < S.length; j++) {
      const i = S[j]; if (i == null) continue
      eased.set(i, (eased.get(i) || false) || (A[j] != null))
    }
  }
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const t = ang(ring[(i-1+n)%n], ring[i], ring[(i+1)%n])
    if (t === null || t <= TOL) continue                       // curve sample — ① makes no corner
    turns++
    if (eased.get(i)) { withArc++; continue }
    // ⛔⛔ "UNREACHED" IS NOT ONE THING, AND REPORTING IT AS ONE OVERSTATES BY 5×. Establish which:
    // is there an arc at the expected offset (⇒ the corner WAS built and only its ① provenance was
    // lost in the union) or is there none (⇒ a corner genuinely absent)? Measured, not assumed.
    let d = Infinity, nearArc = null
    for (let ri = 0; ri < st.iaFull.length; ri++) {
      const Rg = st.iaFull[ri] || [], Ar = arcs[ri] || []
      for (let j = 0; j < Rg.length; j++) {
        const dd = Math.hypot(Rg[j][0]-ring[i][0], Rg[j][1]-ring[i][1])
        if (dd < d) { d = dd; nearArc = Ar[j] } } }
    if (!eased.has(i) && nearArc != null) { lostStamp.push({ turn: t, at: ring[i] }); continue }
    if (d > FAR) { absent.push({ turn: t, at: ring[i], d }); continue }
    dropped.push({ tile: st, i, turn: t, at: ring[i], d })
  }
}

const pct = (a, b) => b ? (100*a/b).toFixed(1) + '%' : '—'
console.log(`\n${scene} — every vertex where ① TURNS past ${TOL}°, did ② make an arc?`)
console.log(`  ① turning vertices (⇒ a corner, by the ruling) : ${turns}`)
console.log(`    ✅ an arc was made                            : ${withArc}  (${pct(withArc, turns)})`)
console.log(`    ◐ arc EXISTS at the offset, ① stamp lost in the union : ${lostStamp.length}  (${pct(lostStamp.length, turns)})`)
console.log(`       ⇒ the corner was BUILT. A traceability gap, ⛔ NOT a missing corner.`)
console.log(`    ⛔ NO ARC, and a curb is right there  ⬅ THE DEFECT   : ${dropped.length}  (${pct(dropped.length, turns)})`)
console.log(`    · no curb within ${FAR} m (block collapsed — legitimate)      : ${absent.length}  (${pct(absent.length, turns)})`)
console.log(`  ⛔ tiles with NO curb ring (a real absence)      : ${noCurb}`)
console.log(`  ⛔ tiles with a curb but NO arc stamp            : ${noStamp}`)
if (dropped.length && LIST) {
  console.log(`\n  the dropped corners, sharpest first — ⭐ each is a place the operator gets no ADA pad:`)
  for (const d of [...dropped].sort((a,b) => b.turn - a.turn).slice(0, 25))
    console.log(`    turn ${d.turn.toFixed(0).padStart(3)}°  ①v${String(d.i).padStart(3)}  lu=${String(d.tile.lu).padEnd(12)} @ ${d.at[0].toFixed(1)},${d.at[1].toFixed(1)}`)
}
console.log(`\n  ⛔ THIS GATE IS RED WHILE A CORNER IS DROPPED. Its complement, \`claims-the-ease-is-the-corner\`,`)
console.log(`     reads 100% through exactly the same map — it can only see arcs that EXIST. Run BOTH.\n`)
process.exit(dropped.length ? 1 : 0)
