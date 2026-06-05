// Mercator — THE SPIKE (prebake polygon-ization, HANDOFF-prebake-polygonization-scope)
//
// Demonstrates the corner-identity decision made ONCE, as a polygon fact, at the
// prebake level: at a divided↔undivided transition, the block corner = the
// intersection of the two STRAIGHT legs —
//   leg A = the cross-street curb  (chain ⊕ its block-side pavementHW)
//   leg B = the corridor outer-edge (carriageway STRAIGHT BODY ⊕ its outer hw)
// — never the carriageway stub taper. Detection is via the frozen
// phase.spineAtStart/spineAtEnd link (no node-matching at build time).
//
// This is NOT a tileGround patch: it consumes only frame facts (chains, phase,
// measures) — exactly the inputs prebake holds — and produces the corner as a
// polygon identity. Verified against the operator's correct-target strokes.
import { readFileSync } from 'fs'

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const marks = JSON.parse(readFileSync(new URL('./correct-target-mississippi-lafayette.json', import.meta.url)))
const streets = r.streets || []
const byId = new Map(streets.map(s => [s.skelId, s]))

// ── 1. Enumerate divided-transition ends from the frozen spineAt* link ─────
const transitions = []
for (const s of streets) {
  const ph = s.phase
  if (!ph || ph.kind !== 'divided') continue
  for (const [field, idx] of [['spineAtStart', 0], ['spineAtEnd', s.points.length - 1]]) {
    const spineId = ph[field]
    if (!spineId) continue
    transitions.push({ carriageway: s, spineId, node: s.points[idx], atStart: field === 'spineAtStart' })
  }
}
console.log(`divided-transition carriageway ends (via spineAt*): ${transitions.length}`)
const nodeKey = p => p[0].toFixed(1) + ',' + p[1].toFixed(1)
const byNode = new Map()
for (const t of transitions) {
  const k = nodeKey(t.node)
  if (!byNode.has(k)) byNode.set(k, [])
  byNode.get(k).push(t)
}
console.log(`distinct transition nodes: ${byNode.size}`)

// ── 2. The Mississippi×Lafayette node ───────────────────────────────────────
const NODE = [166.5, 221.9]
const TRUE_C = (() => {
  // operator ground truth: where stroke 0 (Mississippi west curb) meets stroke 1
  // (Lafayette park-side curb) — their nearest endpoints
  const a = marks['0'][marks['0'].length - 1], b = marks['1'][0]
  return [(a.x + b.x) / 2, (a.z + b.z) / 2]
})()
console.log(`\noperator TRUE corner: (${TRUE_C[0].toFixed(1)},${TRUE_C[1].toFixed(1)})`)
const FALSE_C = [214.0, 216.2]   // production's nearest block vertex (mercator-forensic.mjs)

const here = byNode.get(nodeKey(NODE))
console.log(`carriageways at the node:`, here.map(t => `${t.carriageway.skelId}(${t.carriageway.phase.role})`).join(', '))

// the park-side carriageway = carriageway-B (lafayette-avenue-6); the park tile's
// boundary run (forensic: tile#11 in-edge = lafayette-avenue-6/right)
const cwB = here.find(t => t.carriageway.skelId === 'lafayette-avenue-6')

// ── 3. Leg B: the carriageway's STRAIGHT BODY (drop the taper) ──────────────
// Walk from the node outward; the taper = trailing segment(s) whose heading
// deviates from the established body heading. Body heading = the heading of
// the segments beyond ~2 segments out (they agree to <0.5° here).
function straightBody(points, atStart, TAPER_TOL_DEG = 4) {
  const pts = atStart ? points : [...points].reverse()   // pts[0] = the node
  // headings of each segment walking outward
  const segs = []
  for (let i = 0; i < pts.length - 1; i++) {
    const d = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]]
    segs.push({ a: pts[i], b: pts[i + 1], h: Math.atan2(d[1], d[0]) })
  }
  // body heading = heading of the outermost long segment(s): use the median of
  // segments 1.. (all but the node segment) — robust to a curving far end
  const ref = segs[Math.min(2, segs.length - 1)].h
  let k = 0
  while (k < segs.length - 1) {
    let dh = Math.abs(segs[k].h - ref) * 180 / Math.PI
    if (dh > 180) dh = 360 - dh
    if (dh <= TAPER_TOL_DEG) break
    k++
  }
  // the straight body line: through segs[k].a→b
  return { p: segs[k].a, q: segs[k].b, taperSegs: k }
}
const body = straightBody(cwB.carriageway.points, cwB.atStart)
console.log(`\ncw-B straight body: (${body.p[0].toFixed(1)},${body.p[1].toFixed(1)})→(${body.q[0].toFixed(1)},${body.q[1].toFixed(1)}), taper segments dropped: ${body.taperSegs}`)

// ── 4. Leg A: the cross-street (passes THROUGH the node) on the block side ──
// cross-street = a non-carriageway street with the node as an INTERIOR vertex
const isAtNode = (p) => Math.hypot(p[0] - NODE[0], p[1] - NODE[1]) < 0.5
const cross = streets.find(s => {
  if (s.phase?.kind === 'divided') return false
  const i = s.points.findIndex(isAtNode)
  return i > 0 && i < s.points.length - 1
})
const ci = cross.points.findIndex(isAtNode)
console.log(`cross-street: ${cross.skelId}, node at interior vertex ${ci}/${cross.points.length - 1}`)
// the block-side segment = the one on the park side (away from the corridor):
// the corridor extends toward +x from the node; the park quadrant is the one
// whose cross-street segment heads away from the spine side. Take the segment
// south of the node (toward decreasing z) — the segment whose far end has z < node z.
const segDown = cross.points[ci + 1][1] < cross.points[ci - 1][1]
  ? [cross.points[ci], cross.points[ci + 1]]
  : [cross.points[ci], cross.points[ci - 1]]
// which measure side faces the park quadrant (x > chain)? Ground truth from the
// DCEL forensic: the park tile's Mississippi run is side 'left' (hw 7.52) — so
// measure-LEFT is the (-dz,dx) side of the chain direction (the axis trap:
// +x=WEST flips the geometric-left/right naming; trust the forensic, not the eye).
const d = [segDown[1][0] - segDown[0][0], segDown[1][1] - segDown[0][1]]
const L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L
const leftPerp = [-d[1], d[0]]
// park quadrant is +x of the chain here; pick the side whose perp points +x
const parkSide = leftPerp[0] > 0 ? 'left' : 'right'
const hwA = cross.measure?.[parkSide]?.pavementHW || 0
console.log(`cross-street block side: ${parkSide}, pavementHW: ${hwA.toFixed(2)}`)

// ── 5. The corner = line(legA curb) × line(legB outer edge) ─────────────────
function lineIntersect(p1, d1, p2, d2) {
  const det = d1[0] * d2[1] - d1[1] * d2[0]
  if (Math.abs(det) < 1e-12) return null
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / det
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t]
}
const offsetLine = (p, dir, perpSign, w) => {
  const n = [-dir[1] * perpSign, dir[0] * perpSign]
  return [p[0] + n[0] * w, p[1] + n[1] * w]
}
// leg A (cross-street curb): offset toward the park (+x side)
const perpA = leftPerp[0] > 0 ? leftPerp : [d[1], -d[0]]
const pA = [segDown[0][0] + perpA[0] * hwA, segDown[0][1] + perpA[1] * hwA]
// leg B (corridor outer edge): the straight body offset toward the park (−z side)
const dB = [body.q[0] - body.p[0], body.q[1] - body.p[1]]
const LB = Math.hypot(dB[0], dB[1]); dB[0] /= LB; dB[1] /= LB
let perpB = [-dB[1], dB[0]]
if (perpB[1] > 0) perpB = [dB[1], -dB[0]]   // park side = −z
// the carriageway outer half-width: TODAY'S DATA = 0 on the outer side (the
// side-swap defect, see report §data); sweep candidate widths to show the
// residual is a pure width datum, not a structure problem.
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
console.log(`\nproduction (live tileGround): nearest block vertex to TRUE = (${FALSE_C.join(',')}), off by ${dist2(FALSE_C, TRUE_C).toFixed(1)}m`)
console.log(`\ncorridor-leg corner = legA(cross curb ${hwA.toFixed(2)}m) × legB(straight body ⊕ hwB):`)
const inboardHw = cwB.carriageway.measure?.[cwB.carriageway.innerSign === +1 ? 'right' : 'left']?.pavementHW || 0
for (const [label, hwB] of [
  ['hwB = 0      (today\'s frozen outer datum)', 0],
  [`hwB = ${inboardHw.toFixed(2)}   (the width datum filed on the median side)`, inboardHw],
  ['hwB = 9.00   (operator-stroke-implied width)', 9.0],
]) {
  const pB = offsetLine(body.p, dB, 0, 0)
  const pBo = [body.p[0] + perpB[0] * hwB, body.p[1] + perpB[1] * hwB]
  const C = lineIntersect(pA, d, pBo, dB)
  console.log(`  ${label} → corner (${C[0].toFixed(1)},${C[1].toFixed(1)})  d(TRUE)=${dist2(C, TRUE_C).toFixed(1)}m`)
}
