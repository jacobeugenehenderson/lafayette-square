// ⛔ THE CORNER CONSTRUCTION MUST FIRE AT EVERY CORNER — `RIBBONS §1` invariant 3: "the ADA corner
// pad is a band-slice, NOT predicated on the arc — so it works square OR round."
// ③'s corner (`sectionPassProtoTile`, the `st.fillets` loop) iterates FILLETS and skips silently
// (`if (a == null || b == null) continue`) when a tangent is not a ring vertex. Its LEG CUT, ten
// lines above, finds corners BOTH ways — fillet tangents AND a per-vertex turn >= FILLET_TURN_TOL
// (the R=0 square corner). So a corner the leg cut knows about can still get NO cross-section.
// This counts that gap: corners the LEG CUT sees, minus corners the CONSTRUCTION reaches.
// A corner with no construction shows neither of the three configurations — it shows the two legs'
// own arrangements butting, which is the FOURTH thing (`SECTION §6.1`: two depth ranges that do not
// overlap, "the sidewalk simply stops").
// ⛔⛔ A MID-BLOCK BEND IN THIS TABLE IS NOT A DEFECT, AND AN EARLIER VERSION OF THIS CHECK SAID IT
// WAS — measured FALSE by LEGS on 2026-09-07 and confirmed here by reading the code. A leg boundary
// with the SAME owner on both sides resolves to the same cross-section on both sides BY
// CONSTRUCTION: `stampMeasure(run, blockCustoms, curbWidth)` is a pure function of the run, so two
// spans whose winning run is the same run get byte-identical measures. Nothing changes across such a
// boundary however the cut was found, so it cannot mint the seam rule 2 forbids. It is invisible.
// ⭐ A CENSUS OF THE CUT SET ANSWERS THE WRONG QUESTION. The question is where the CROSS-SECTION
// CHANGES and whether that place is a corner — which is a different check, and it exists:
// ▶ node checks/claims-a-swap-never-happens-mid-street.mjs
// This check answers only its own narrower question: which corners get NO corner construction.
// ▶ node checks/claims-every-corner-is-configured.mjs [scene ...]
import { feed, buildProto } from '../scratch/_proto-feed.mjs'

const FILLET_TURN_TOL = 18 * Math.PI / 180
const KP = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
const signedArea = (g) => { let a = 0; for (let i = 0; i < g.length; i++) { const [x1, y1] = g[i], [x2, y2] = g[(i + 1) % g.length]; a += x1 * y2 - x2 * y1 } return a / 2 }
const road = (id) => String(id ?? '').replace(/-\d+$/, '')
const turnAt = (g, q) => { const n = g.length, P = g[(q - 1 + n) % n], V = g[q], N = g[(q + 1) % n]
  const t = Math.atan2(N[1] - V[1], N[0] - V[0]) - Math.atan2(V[1] - P[1], V[0] - P[0])
  return Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) }

const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square']
for (const scene of scenes) {
  const f = feed(scene); if (!f || f.curbWidth == null) continue
  const tg = buildProto(f, { protoArtifact: true })
  const tiles = tg.protoShapeTiles || []
  if (!tiles.length) { console.log(`⛔ ${scene}: no protoShapeTiles — NOT measured`); continue }
  let legCutCorners = 0, builtCorners = 0, filletsTotal = 0, filletsUnmatched = 0, tilesNoFillets = 0, tilesSeen = 0
  let tanHit = 0, tanMiss = 0
  const near = [0, 0, 0, 0]
  const cls = { twoRoads: 0, sameRoad: 0, bend: 0, unstamped: 0, hole: 0 }
  const sharpOnly = []            // corners the leg cut found by TURN with no fillet tangent there
  for (const st of tiles) {
    const iA = st.iaFull || []
    if (!iA.length) continue
    tilesSeen++
    const parts = iA.map((ring, si) => ({ ring, si })).filter(o => o.ring?.length >= 3)
      .map((o, n) => ({ ring: o.ring, si: o.si, ri: n, hole: signedArea(o.ring) < 0 }))
    const runs = st.runs || []
    const stamps = st.iaStamp || []
    const fillets = st.fillets || []
    if (!fillets.length) tilesNoFillets++
    for (const p of parts) {
      const ring = p.ring, n = ring.length
      const ix = new Map()
      for (let q = 0; q < n; q++) { const kk = KP(ring[q]); if (!ix.has(kk)) ix.set(kk, q) }
      const tangentIdx = new Set()
      for (const fl of fillets) {
        const a = ix.get(KP(fl.tA)), b = ix.get(KP(fl.tB))
        if (a == null || b == null) continue
        tangentIdx.add(a); tangentIdx.add(b)
      }
      // the leg cut's own corner set on this ring
      const cut = new Set()
      for (let q = 0; q < n; q++) if (turnAt(ring, q) >= FILLET_TURN_TOL) cut.add(q)
      for (const q of tangentIdx) cut.add(q)
      // a TURN corner with no tangent within 1 vertex is a corner the construction cannot reach
      // ⛔ CLASSIFY THE UNREACHED ONES BY CARRIED IDENTITY. The two
      // adjoining EDGES of vertex q are (q-1) and q — `stp[q]` is the stamp of edge q->q+1, the
      // same indexing the leg block uses when it measures that edge's length.
      const stp = stamps[p.si] || []
      for (const q of cut) {
        legCutCorners++
        if (tangentIdx.has(q)) { builtCorners++; continue }
        const rA = stp[(q - 1 + n) % n], rB = stp[q]
        if (p.hole) cls.hole++
        else if (rA == null || rB == null) cls.unstamped++
        else if (rA === rB) cls.bend++
        // ⛔ `skelId` CARRIES A CHAIN ORDINAL SUFFIX — "south-18th-street-4" and "-5" are the SAME
        // ROAD, cut into chains. A chain cut is NOT a corner (① has no nodes, `SECTION §4` rule 5),
        // so comparing raw skelIds counts a chain cut as "two roads meet". Strip the suffix.
        else if (road(runs[rA]?.skelId) === road(runs[rB]?.skelId)) cls.sameRoad++
        else cls.twoRoads++
      }
    }
    // ⛔⛔ "SILENTLY SKIPPED" WAS ONE NUMBER HIDING TWO POPULATIONS, and `if (a == null || b == null)
    // continue` at :3542 swallows both alike. Split by HOW FAR the tangent is from the nearest ring
    // vertex: inside Clipper's 1 mm integer grid (SCALE = 1000) the point is ON the contour and only
    // the exact 6-decimal `KP` key cannot see it — a key-precision miss. Ten centimetres away it is
    // not on the contour at all, and that is a different animal.
    // ⛔ CAUSE NOT ESTABLISHED for the far class. ⭐ AND DO NOT "FIX" THIS WITH A KEY TOLERANCE: it
    // would look like a cure on the town we have stared at most and do almost nothing on the other.
    const keys = new Set()
    for (const p of parts) for (const pt of p.ring) keys.add(KP(pt))
    for (const fl of fillets) {
      filletsTotal++
      for (const P of [fl.tA, fl.tB]) {
        if (keys.has(KP(P))) { tanHit++; continue }
        tanMiss++
        let d = Infinity
        for (const p of parts) for (const pt of p.ring) { const e = Math.hypot(pt[0] - P[0], pt[1] - P[1]); if (e < d) d = e }
        near[d < 0.001 ? 0 : d < 0.01 ? 1 : d < 0.1 ? 2 : 3]++
      }
      const un = !keys.has(KP(fl.tA)) || !keys.has(KP(fl.tB))
      if (un) filletsUnmatched++
    }
  }
  const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : 'n/a'
  console.log(`\n=== ${scene} (look ${f.look}, ${f.slots} authored slots, curbWidth ${f.curbWidth}) ===`)
  console.log(`tiles measured                              : ${tilesSeen}   (${tilesNoFillets} carry NO fillets at all)`)
  console.log(`frozen fillets                              : ${filletsTotal}`)
  console.log(`  ⛔ whose tangents match no ring vertex     : ${filletsUnmatched}  ${pct(filletsUnmatched, filletsTotal)}  — silently skipped at :3542`)
  console.log(`     TANGENT POINTS: ${tanHit} on a ring vertex · ${tanMiss} missed — and the misses are TWO CLASSES:`)
  console.log(`       ·  < 1 mm  — inside Clipper's integer grid; the exact KP key cannot see it : ${near[0]}`)
  console.log(`       ·  < 1 cm                                                                 : ${near[1]}`)
  console.log(`       ·  < 10 cm                                                                : ${near[2]}`)
  console.log(`       ⛔ >= 10 cm — the tangent is NOT ON THE CONTOUR. Cause not established.    : ${near[3]}`)
  console.log(`corners the LEG CUT sees                    : ${legCutCorners}`)
  console.log(`  ✅ reached by the corner construction      : ${builtCorners}  ${pct(builtCorners, legCutCorners)}`)
  console.log(`  ⛔ SQUARE / unfilleted, NO cross-section   : ${legCutCorners - builtCorners}  ${pct(legCutCorners - builtCorners, legCutCorners)}`)
  console.log(`     of those, by CARRIED IDENTITY across the vertex:`)
  console.log(`       ✅ two different ROADS meet — a real corner : ${cls.twoRoads}`)
  console.log(`       ·  same road, different run (a chain cut)   : ${cls.sameRoad}   ⛔ NOT a corner (① has no nodes)`)
  console.log(`       ·  same run both sides — a mid-block BEND   : ${cls.bend}   INVISIBLE, not a defect (see below)`)
  console.log(`       ·  a stamp is null on one side             : ${cls.unstamped}`)
  console.log(`       ·  on a HOLE ring                          : ${cls.hole}`)
}
