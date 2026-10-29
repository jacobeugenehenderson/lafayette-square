// THE TAG RUN (Zob's ruling (A), 2026-10-28; DESIGN-candidate-3.md). What several same-way tags on ONE eroded segment mean.
// `tags` [{ ring, i }] (a tag is a source edge: ring id, edge index), `SRC[ring]` the source ring's integer points ({X, Y}).
// → { ok: true, kind: 'one' | 'run' | 'line', ring, from, to, gaps } or { ok: false, clause, … } (the caller refuses by name).
//  · ONE RING: the tags are one run on the ring, in its own cyclic order and direction (the shortest arc holding them, read
//    from → to), gaps allowed. The segment stands for source edges from … to, and the dilation emits their own vertices.
//    A GAP (an edge in the arc that no tag names) is a run member iff every vertex of it lies within NODE_BOUND of the path
//    the CUT alternative would draw (L_from to lineCrossOf(L_from, L_to), then L_to; one line when they are the same line).
//    Then the two answers differ by less than the lattice's own rounding: the edge was removed by the ROUNDING of the erode,
//    not by the morphology, and keeping it is round-once. ⭐ PAST THE BOUND it is a genuine removal at a corner whose two
//    sides the rounding collapsed into one short segment (Zob's revised clause 3, 2026-10-28, on Huron's 22): kind 'cut',
//    the segment emits the CUT POINT lineCrossOf(L_from, L_to), under the same miter limit as any cut, never a refusal.
//    ⭐ PARALLEL AND DISTINCT ends (a lattice jog; an open never removes a STEP, only a protrusion; Zob (2)): every gap vertex
//    within the band between the two lines widened by NODE_BOUND → the run, the jog kept; else clause
//    'parallel-protrusion' (something stood out between them and the join would need a new line: unruled until one exists).
//  · TWO OR MORE RINGS: every tag's source line is ONE line (latticeNode.js#sameLine, exact) → kind 'line', that one line;
//    otherwise two rings' tags are a TRANSITION collapsed by rounding (kind 'transition', below), guarded by the walls' distance.
import { NODE_BOUND, lineCrossOf, sameLine } from '../../src/lib/latticeNode.js'

const segRaw = (R, i) => { const a = R[i], b = R[(i + 1) % R.length]; return { a: [a.X, a.Y], b: [b.X, b.Y] } }
// ⭐ an edge's line is its BIRTH line when the caller has one (Zob, 2026-10-29: provenance crosses the stage boundary; the emission
// invariant found this reading the open's rounded vertices instead), else its own two points
let LINE_OF = null
const segOf = (R, i, g) => { const L = LINE_OF ? LINE_OF(g, i) : null; return L ? { a: L[0], b: L[1] } : segRaw(R, i) }
const distSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }
const distLine = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.hypot(dx, dy) }

export function tagRun(tags, SRC, { againstDirection = false, refuseGap = false, noBand = false, twoH = null, lineOf = null } = {}) {
  LINE_OF = lineOf
  if (tags.length === 1) return { ok: true, kind: 'one', ring: tags[0].ring, from: tags[0].i, to: tags[0].i, gaps: 0 }
  const rings = [...new Set(tags.map(t => t.ring))]
  if (rings.length > 1) {
    const s0 = segOf(SRC[tags[0].ring], tags[0].i, tags[0].ring)
    const same = tags.every(t => sameLine(s0, segOf(SRC[t.ring], t.i, t.ring)))
    if (same) return { ok: true, kind: 'line', ring: tags[0].ring, from: tags[0].i, to: tags[0].i, gaps: 0, rings }
    // ⭐ Zob's ruling, 2026-10-28 (PTown's deck): two rings' tags on one segment are a TRANSITION collapsed by rounding, emitted
    // as any tag change (the caller orders the two by its neighbours and cuts between them). The classifier is a GUARD: the two
    // source walls no farther apart than 2h there is the walls-meet question (Boz's), refused by name. Read off the source, in
    // doubles; within 1e-6 u of 2h refuses as a tie.
    if (rings.length !== 2 || tags.length !== 2) return { ok: false, clause: 'cross-ring-not-a-pair', rings, tags }
    if (!(twoH > 0)) throw new Error('⛔ tagRun: a cross-ring transition needs { twoH } (the open\'s 2h, in units) for its guard')
    const sa = segOf(SRC[tags[0].ring], tags[0].i, tags[0].ring), sb = segOf(SRC[tags[1].ring], tags[1].i, tags[1].ring)
    const wall = Math.min(distSeg(sa.a, sb.a, sb.b), distSeg(sa.b, sb.a, sb.b), distSeg(sb.a, sa.a, sa.b), distSeg(sb.b, sa.a, sa.b))
    if (Math.abs(wall - twoH) < 1e-6) return { ok: false, clause: 'walls-at-2h-tie', rings, tags, wallU: wall }
    if (wall <= twoH) return { ok: false, clause: 'walls-meet', rings, tags, wallU: +wall.toFixed(3) }
    return { ok: true, kind: 'transition', tags, wallU: +wall.toFixed(3), gaps: 0 }
  }
  const ring = rings[0], R = SRC[ring], n = R.length, is = [...new Set(tags.map(t => t.i))].sort((x, y) => x - y)
  // the shortest arc holding them: the complement of the largest cyclic gap between consecutive indices
  let big = -1, at = 0
  for (let k = 0; k < is.length; k++) { const g = ((is[(k + 1) % is.length] - is[k]) + n) % n || n; if (g > big) { big = g; at = k } }
  let from = is[(at + 1) % is.length], to = is[at]
  if (againstDirection) [from, to] = [to, from]                                   // ⛔ the mutant: the run read against the ring
  const arc = []; for (let j = from; ; j = (j + 1) % n) { arc.push(j); if (j === to) break; if (arc.length > n) break }
  const named = new Set(is), gapEdges = arc.filter(j => !named.has(j))
  if (!gapEdges.length) return { ok: true, kind: 'run', ring, from, to, gaps: 0 }
  // the cut alternative's path between the run's first and last line
  const f = segOf(R, from, ring), l = segOf(R, to, ring)
  let path
  if (sameLine(f, l)) path = (p) => distLine(p, f.a, f.b)
  else if (BigInt(f.b[0] - f.a[0]) * BigInt(l.b[1] - l.a[1]) === BigInt(f.b[1] - f.a[1]) * BigInt(l.b[0] - l.a[0])) { // parallel and DISTINCT: no cut exists; the band test (Zob (2)). Signed offsets across f's line: the band is [0, off(l)] ± NODE_BOUND
    const L = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]), side = (p) => ((p[0] - f.a[0]) * (f.b[1] - f.a[1]) - (p[1] - f.a[1]) * (f.b[0] - f.a[0])) / L
    const o = side(l.a), lo = Math.min(0, o) - NODE_BOUND, hi = Math.max(0, o) + NODE_BOUND
    const out = gapEdges.flatMap(j => [R[j], R[(j + 1) % n]]).filter(v => { const d = side([v.X, v.Y]); return !noBand && (d < lo || d > hi) })
    if (!out.length) return { ok: true, kind: 'jog', ring, from, to, gaps: gapEdges.length, offsetU: +Math.abs(o).toFixed(3) }
    return { ok: false, clause: 'parallel-protrusion', ring, from, to, gaps: gapEdges.length, at: [out[0].X, out[0].Y], tags } }
  else { const X = lineCrossOf(f, l, 'tagRun'); path = (p) => Math.min(distSeg(p, f.a, X), distSeg(p, X, l.b)) }
  let worst = 0, worstAt = null
  for (const j of gapEdges) for (const v of [R[j], R[(j + 1) % n]]) { const d = path([v.X, v.Y]); if (d > worst) { worst = d; worstAt = [v.X, v.Y] } }
  if (worst <= NODE_BOUND) return { ok: true, kind: 'run', ring, from, to, gaps: gapEdges.length, worst }
  // ⭐ the run's two ends on ONE birth line, its skipped edges off it (Plumb, 2026-10-29, flagged to Zob): the segment carries both
  // tags, so it lies on that ONE line's offset, and the boundary runs straight along it; the skipped edges are not on this
  // segment. Emitted as that line alone (kind 'line'), no vertices; the emission invariant checks it
  if (sameLine(f, l)) return { ok: true, kind: 'line', ring, from, to: from, gaps: gapEdges.length, sameLineSkip: true, worstU: +worst.toFixed(3) }
  if (refuseGap) return { ok: false, clause: 'gap-past-bound', ring, from, to, gaps: gapEdges.length, worstU: +worst.toFixed(3), at: worstAt, tags }   // ⛔ the mutant: clause 3 as first ruled
  return { ok: true, kind: 'cut', ring, from, to, gaps: gapEdges.length, worstU: +worst.toFixed(3), at: worstAt, X: lineCrossOf(f, l, 'tagRun') }
}
