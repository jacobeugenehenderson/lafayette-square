#!/usr/bin/env node
// ⭐⭐⭐ THE CORNER'S EXTENT IS CARRIED, NOT RECOVERED — and this reads the artifact, never a rule.
// `iaCorner` says WHERE a corner is (① turns AND the owner changes, stamped pre-easing off ①'s own
// vertices). `iaArc` says HOW FAR it reaches (stamped BY the ease that made the arc). The FILL
// needs both: the mark alone gives it one edge to change depth over, which is the step.
//
// ⛔ IT ALSO SCORES THE CONSTRUCTION IT REPLACED, on the same artifact, so the two can be compared
// rather than argued: matching the frozen `fillets`' TANGENT COORDINATES back onto the contour
// through a 1 mm grid hash. That is proximity recovery of a carried fact (`A15`), done across a
// boolean that is allowed to move a point, and its own site conceded a far class it could not
// reach. ⭐ Both columns come out of one run: a claim about which is better is measured here.
// ▶ node checks/claims-the-corner-extent-is-carried.mjs [scene]
import { feed, buildProto } from '../scratch/_proto-feed.mjs'
const scene = process.argv[2] || 'lafayette-square'
const f = feed(scene); if (!f) process.exit(1)
const r = buildProto(f, { quiet: true, protoProducer: true })
const T = r.protoShapeTiles || []
if (!T.length) { console.log('⛔ no proto tiles — NOT a pass'); process.exit(1) }
const QK = (x, y) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`
let marks = 0, carried = 0, matched = 0, carriedEdges = 0, matchedEdges = 0, noArcField = 0
for (const st of T) {
  const iA = st.iaFull || [], fil = st.fillets || []
  for (let si = 0; si < iA.length; si++) {
    const ring = iA[si]; if (!(ring?.length >= 3)) continue
    const mark = st.iaCorner?.[si], arc = st.iaArc?.[si], n = ring.length
    if (!arc) { noArcField++; continue }
    // ── CARRIED: an arc is a run of one `iaArc` value; a CORNER's arc carries the mark.
    const lic = new Set()
    for (let q = 0; q < n; q++) if (arc[q] != null && mark?.[q]) lic.add(arc[q])
    const span = new Map()
    for (let q = 0; q < n; q++) if (arc[q] != null && arc[q] === arc[(q + 1) % n] && lic.has(arc[q]))
      span.set(arc[q], (span.get(arc[q]) || 0) + 1)
    // ── MATCHED: the tangent-coordinate lookup this replaces, run on the same rings.
    const ix = new Map()
    for (let q = 0; q < n; q++) { const k = QK(ring[q][0], ring[q][1]); const a = ix.get(k); if (a) a.push(q); else ix.set(k, [q]) }
    const find = (P) => { const cx = Math.round(P[0] * 1000), cy = Math.round(P[1] * 1000)
      let b = null, bd = Infinity
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = ix.get(`${cx + dx},${cy + dy}`); if (!a) continue
        for (const q of a) { const d = Math.hypot(ring[q][0] - P[0], ring[q][1] - P[1]); if (d < bd) { bd = d; b = q } } }
      return bd <= 0.001 ? b : null }
    const hit = new Map()
    for (const fl of fil) { const a = find(fl.tA), b = find(fl.tB); if (a == null || b == null) continue
      const fwd = (b - a + n) % n, bwd = (a - b + n) % n
      const [s0, len] = fwd <= bwd ? [a, fwd] : [b, bwd]
      if (len === 0 || len * 2 > n) continue
      for (let k = 0; k < len; k++) hit.set((s0 + k) % n, len) }
    for (let q = 0; q < n; q++) {
      if (!mark?.[q]) continue
      marks++
      const c = arc[q] != null && lic.has(arc[q])
      if (c) { carried++; carriedEdges += span.get(arc[q]) || 0 }
      if (hit.has(q)) { matched++; matchedEdges += hit.get(q) }
    }
  }
}
const pc = (a) => `${a} (${(100 * a / Math.max(1, marks)).toFixed(1)}%)`
console.log(`${scene}: ${T.length} tile(s) · ${marks} corner(s) marked by ① (\`iaCorner\`)`)
console.log(`  extent CARRIED off the ease  (\`iaArc\`) : ${pc(carried)} · ${(carriedEdges / Math.max(1, carried)).toFixed(1)} contour edges each`)
console.log(`  extent RECOVERED by tangent match       : ${pc(matched)} · ${(matchedEdges / Math.max(1, matched)).toFixed(1)} contour edges each`)
console.log(`  ⛔ corners the RECOVERY could not reach  : ${pc(marks - matched)}  ← each of these had ONE edge to change depth over`)
if (noArcField) console.log(`  ⚠️ ${noArcField} ring(s) carry NO \`iaArc\` at all — a compound face loses the stamp through the hole subtraction, so its corners have no extent. Honest absence, counted here.`)
console.log(carried >= matched ? '  ✅ the carried extent reaches at least as many corners as the match did.'
                                : '  ⛔ the carried extent reaches FEWER corners than the match — that is a finding, not a pass.')
