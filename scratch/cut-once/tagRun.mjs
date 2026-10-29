// THE TAG RUN (Zob's ruling (A), 2026-10-28; DESIGN-candidate-3.md). What several same-way tags on ONE eroded segment mean.
// `tags` [{ ring, i }] (a tag is a source edge: ring id, edge index), `SRC[ring]` the source ring's integer points ({X, Y}).
// → { ok: true, kind: 'one' | 'run' | 'line', ring, from, to, gaps } or { ok: false, clause, … } (the caller refuses by name).
//  · ONE RING: the tags are one run on the ring, in its own cyclic order and direction (the shortest arc holding them, read
//    from → to), gaps allowed. The segment stands for source edges from … to, and the dilation emits their own vertices.
//    A GAP (an edge in the arc that no tag names) is a run member iff every vertex of it lies within NODE_BOUND of the path
//    the CUT alternative would draw (L_from to lineCrossOf(L_from, L_to), then L_to; one line when they are the same line).
//    Then the two answers differ by less than the lattice's own rounding: the edge was removed by the ROUNDING of the erode,
//    not by the morphology, and keeping it is round-once. Past the bound: clause 'gap-past-bound' (a genuine removal shows
//    as a tag CHANGE between segments, never inside one).
//  · TWO OR MORE RINGS: every tag's source line is ONE line (latticeNode.js#sameLine, exact) → kind 'line', that one line;
//    otherwise clause 'cross-ring-different-lines'. ⛔ Never a null tag: a fresh +h line would nearly coincide with both walls.
import { NODE_BOUND, lineCrossOf, sameLine } from '../../src/lib/latticeNode.js'

const segOf = (R, i) => { const a = R[i], b = R[(i + 1) % R.length]; return { a: [a.X, a.Y], b: [b.X, b.Y] } }
const distSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }
const distLine = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.hypot(dx, dy) }

export function tagRun(tags, SRC, { againstDirection = false } = {}) {
  if (tags.length === 1) return { ok: true, kind: 'one', ring: tags[0].ring, from: tags[0].i, to: tags[0].i, gaps: 0 }
  const rings = [...new Set(tags.map(t => t.ring))]
  if (rings.length > 1) {
    const s0 = segOf(SRC[tags[0].ring], tags[0].i)
    const same = tags.every(t => sameLine(s0, segOf(SRC[t.ring], t.i)))
    return same ? { ok: true, kind: 'line', ring: tags[0].ring, from: tags[0].i, to: tags[0].i, gaps: 0, rings }
      : { ok: false, clause: 'cross-ring-different-lines', rings, tags }
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
  const f = segOf(R, from), l = segOf(R, to)
  let path
  if (sameLine(f, l)) path = (p) => distLine(p, f.a, f.b)
  else if (BigInt(f.b[0] - f.a[0]) * BigInt(l.b[1] - l.a[1]) === BigInt(f.b[1] - f.a[1]) * BigInt(l.b[0] - l.a[0]))
    // parallel and DISTINCT: the cut alternative has no crossing (unruled; measured and sent to Zob, never guessed)
    return { ok: false, clause: 'run-ends-parallel-distinct', ring, from, to, gaps: gapEdges.length, offsetU: +distLine(l.a, f.a, f.b).toFixed(3), tags }
  else { const X = lineCrossOf(f, l, 'tagRun'); path = (p) => Math.min(distSeg(p, f.a, X), distSeg(p, X, l.b)) }
  let worst = 0, worstAt = null
  for (const j of gapEdges) for (const v of [R[j], R[(j + 1) % n]]) { const d = path([v.X, v.Y]); if (d > worst) { worst = d; worstAt = [v.X, v.Y] } }
  if (worst <= NODE_BOUND) return { ok: true, kind: 'run', ring, from, to, gaps: gapEdges.length, worst }
  return { ok: false, clause: 'gap-past-bound', ring, from, to, gaps: gapEdges.length, worstU: +worst.toFixed(3), at: worstAt, tags }
}
