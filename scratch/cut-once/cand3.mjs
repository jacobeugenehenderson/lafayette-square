// Candidate 3, built (DESIGN-candidate-3.md; Zob's rulings 2026-10-28): the cut-once open/close with PROVENANCE, every boolean on
// one noded arrangement (latticeNode.js#nodeCrossings with `self`, then latticeFaces.js#facesOf). Scratch first, measured against
// the integer form (compare.mjs --cand=provenance), then it moves into structures.mjs in place of openCloseAtStep.
//
// morph(region, d): offset the region's rings by d WITH TAGS (each raw edge names the region edge (ring, i) it offsets), resolve,
// then offset back by −d EMITTING THE REGION'S OWN LINES: the back-offset of an edge tagged (ring, i) IS that edge's line, so
//   · consecutive tags i, i+1 on one ring → the region's own vertex v₍ᵢ₊₁₎, integer, no arithmetic
//   · a tag run (tagRun.mjs) → the run's own vertices · a jog → kept · a cut → lineCrossOf(L_from, L_to), rounded once
//   · non-adjacent tags (a feature removed between two segments) → the cut join: one line twice (latticeNode#sameLine) → no
//     vertex; else lineCrossOf, or SQUARED past clipper's miter limit (parity, kept for the comparison: Boz) → a new cap line
//   · a null tag (an erode's square cap) → a NEW line, the cap's own back-offset, its joins computed once and rounded at birth
// Every failure refuses by name (the deck's cross-ring segment does, until Zob rules it).
import clipperLib from 'clipper-lib'
import { writeFileSync } from 'fs'
import { nodeCrossings, lineCrossOf, sameLine, NODE_BOUND, crossOf } from '../../src/lib/latticeNode.js'
import { facesOf } from '../../src/lib/latticeFaces.js'
import { isRoundingSliver } from '../../cartograph/structures.mjs'
import { tagRun } from './tagRun.mjs'
const { IntPoint, Clipper } = clipperLib
const SCALE = 1000, MITER_LIM = 0.5                 // clipper's constant for MiterLimit 2: parity only (Boz: derive or justify after)

const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], f = 1 / Math.hypot(dx, dy); return [dy * f, -dx * f] }   // clipper's GetUnitNormal
// a ring's raw offset curve at d, each point tagged with the region edge its OUTGOING raw edge offsets (null: a join's own edge)
// ⭐ STEP 1 AS THE DESIGN SAYS (Zob, 2026-10-29; no longer ClipperOffset point for point): EVERY join is the intersection of
// its two adjacent offset lines (in doubles: the raw curve is intermediate and only its topology leaves); a CONVEX join (the
// lines diverge: sinA·d > 0) past the miter limit is SQUARED, both cap ends on the two offset lines; a REFLEX join always takes
// the intersection. ⛔ No single-point branch and no detour through the source vertex: those are points that are not line
// intersections, and they gave Huron's backward step of two (a reflex near-straight chain with a 24 u middle edge)
function rawOffset(R, d, g, squares = null) {
  const n = R.length, N = R.map((a, j) => unit([a.X, a.Y], [R[(j + 1) % n].X, R[(j + 1) % n].Y])), out = []
  const put = (x, y, tag) => out.push({ X: Math.round(x), Y: Math.round(y), tag })
  for (let j = 0; j < n; j++) { const k = (j - 1 + n) % n, p = R[j], nk = N[k], nj = N[j], edge = { ring: g, i: j }
    if (SINGLE_POINT_BRANCH) { const sA = nk[0] * nj[1] - nj[0] * nk[1], cA = nk[0] * nj[0] + nk[1] * nj[1]   // ⛔ the mutant only
      if (Math.abs(sA * d) < 1.0 && cA > 0) { put(p.X + nk[0] * d, p.Y + nk[1] * d, edge); continue } }
    const sinA = Math.max(-1, Math.min(1, nk[0] * nj[1] - nj[0] * nk[1])), cosA = nk[0] * nj[0] + nk[1] * nj[1], r = 1 + cosA
    if (sinA * d > 0 && r < MITER_LIM) { const t = Math.tan(Math.atan2(sinA, cosA) / 4); if (squares) squares.push([p.X, p.Y])
      put(p.X + d * (nk[0] - nk[1] * t), p.Y + d * (nk[1] + nk[0] * t), null); put(p.X + d * (nj[0] + nj[1] * t), p.Y + d * (nj[1] - nj[0] * t), edge); continue }
    if (!(r > 0)) throw new Error(`⛔ the offset: ring ${g} turns straight back on itself at (${p.X / SCALE}, ${p.Y / SCALE}) (antiparallel edges): no join exists. Refusing.`)
    const q = d / r; put(p.X + (nk[0] + nj[0]) * q, p.Y + (nk[1] + nj[1]) * q, edge) }
  return out
}
const clean = (r) => { const o = []; for (const q of r) { const l = o[o.length - 1]; if (!l || l.X !== q.X || l.Y !== q.Y) o.push(q) }
  while (o.length > 1 && o[0].X === o[o.length - 1].X && o[0].Y === o[o.length - 1].Y) o.pop(); return o }
const distinct3 = (r) => new Set(r.map(q => q.X + ',' + q.Y)).size >= 3

// node `sets` (each a list of rings [{X, Y, tag?}]) together, self included, then the faces `keep` holds. → { rings, tags }
export function arrange(sets, keep, who, allTags = false, prefer = null) {
  const rings = [], setOf = []
  sets.forEach((S, si) => S.forEach(r => { const c = clean(r); if (distinct3(c)) { rings.push(c); setOf.push(si) } }))
  if (!rings.length) return { rings: [], tags: [] }
  const input = rings.map((r, ri) => ({ p: r.map(q => [q.X / SCALE, q.Y / SCALE]), tag: `${who}#${ri}` }))
  let R
  try { R = nodeCrossings(input, { pairs: () => true, self: true, who }) }
  catch (e) { const m = /#(\d+) at \(.*collapsed/.exec(String(e.message)); if (m) { const r = rings[+m[1]]; e.message += ` [the ring as given: ${r.length} points ${JSON.stringify(r.map(q => [q.X, q.Y, q.tag ? `${q.tag.ring}:${q.tag.i}` : null]))}]` }
    // ⭐ Zob's minimal repro: the rings the verifier names, saved as given (before noding) with their set, to a fixture
    const ids = [...String(e.message).matchAll(new RegExp(`${who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}#(\\d+)`, 'g'))].map(m => +m[1])
    if (ids.length && process.env.CUTONCE_REPRO) writeFileSync(process.env.CUTONCE_REPRO, JSON.stringify({ who, error: String(e.message), rings: [...new Set(ids)].map(i => ({ i, set: setOf[i], tag: input[i].tag, p: input[i].p })) }))
    throw e }
  const edges = []
  R.forEach((o, ri) => o.forEach((v, q) => { const w = o[(q + 1) % o.length]; edges.push({ a: v.k, b: w.k, set: setOf[ri], tag: rings[ri][v.edge]?.tag ?? null }) }))
  return facesOf(edges, keep, { sets: sets.length, who, allTags, prefer })
}

// the back-offset: one eroded (or dilated) ring with its tags → the morphed ring's points, the region's own wherever unchanged
function emit(E, T, SRC, d, who, stat, LINES = null) {
  // tokens: L = a line { int: [a, b] } (a region edge) or { flt: [a, b] } (a new line); V = a fixed point
  // ⭐ PROVENANCE CROSSES THE STAGE BOUNDARY (Zob, 2026-10-29): a region edge's line is the LINE IT WAS BORN ON (`LINES[g][i]`:
  // P's own line, or a born line's two integer points), never a line re-derived through the region's rounded vertices
  const tok = []
  const lineOf = (g, i) => { const L = LINES?.[g]?.[i]; if (L) return L; const R = SRC[g], a = R[i], b = R[(i + 1) % R.length]; return [[a.X, a.Y], [b.X, b.Y]] }
  const Lsrc = (g, i) => ({ kind: 'L', g, i, int: lineOf(g, i) })
  let prevRunKey = null, lastRun = null
  for (let e = 0; e < E.length; e++) { const tg = T[e], p = E[e], q = E[(e + 1) % E.length]
    const tags = tg == null ? [] : Array.isArray(tg) ? tg : [tg]
    if (!tags.length) stat.lostTags = (stat.lostTags || 0) + 1, (stat.lostAt ||= []).length < 6 && stat.lostAt.push([p.X / SCALE, p.Y / SCALE, who])
    if (tags.some(x => x?.near)) stat.nearOut = (stat.nearOut || 0) + 1
    const lineTags = tags.filter(x => x && x.ring != null)
    const bornL = tags.find(x => x?.born)?.born
    if (tags.length && !lineTags.length && !tags.some(x => x?.base) && bornL) {
      // the born line ORIENTED ALONG THE BOUNDARY it now bounds (p → q, the region on its left), so its normal points outward:
      // a piece's own winding (reversed for the erode) says nothing about which side the region lies
      const BL = (bornL[1][0] - bornL[0][0]) * (q.X - p.X) + (bornL[1][1] - bornL[0][1]) * (q.Y - p.Y) < 0 ? [bornL[1], bornL[0]] : bornL, n = unit(BL[0], BL[1]), bornL2 = BL
      tok.push({ kind: 'L', flt: [[bornL2[0][0] - n[0] * d, bornL2[0][1] - n[1] * d], [bornL2[1][0] - n[0] * d, bornL2[1][1] - n[1] * d]], born: JSON.stringify(bornL2), at: p }); stat.newLines++; continue }
    if (tags.length && !lineTags.length && !tags.some(x => x?.base)) { tags.length = 0 }                   // near only: a new line from its own points
    else if (lineTags.length !== tags.length && !tags.some(x => x?.base)) { tags.splice(0, tags.length, ...lineTags) }
    if (tags.some(x => x?.base)) throw new Error(`[${who}] ⛔ the back-offset: (${JSON.stringify(tags.find(x => x?.base))}; with ${JSON.stringify(tags.filter(x => !x?.base).map(x => x.ring != null ? `${x.ring}:${x.i}` : x.born ? 'born' : 'near'))}) an eliminated stretch's base side (${[p.X, p.Y].map(v => v / SCALE)}) → (${[q.X, q.Y].map(v => v / SCALE)}) reached the boundary (it is born interior). Refusing.`)
    if (!tags.length) { // a null edge: a NEW line, the cap's own back-offset by −d
      const n = unit([p.X, p.Y], [q.X, q.Y]); tok.push({ kind: 'L', flt: [[p.X - n[0] * d, p.Y - n[1] * d], [q.X - n[0] * d, q.Y - n[1] * d]], at: p }); stat.newLines++; continue }
    // ⭐ consecutive eroded segments carrying the SAME tag set are one stretch of that run (the lines lie within rounding of each
    // other, so the noding cut the stretch into pieces each claimed by all of them): the run is emitted once, not once per piece
    const tkey = tags.length > 1 ? JSON.stringify(tags.filter(x => x?.ring != null).map(x => x.ring + ':' + x.i).sort()) : null
    if (tkey && tkey === prevRunKey) { stat.runRepeat = (stat.runRepeat || 0) + 1; continue }
    prevRunKey = tkey
    const r = tagRun(tags, SRC, { twoH: 2 * Math.abs(d) })
    if (!r.ok) throw new Error(`[${who}] ⛔ the back-offset: the eroded segment (${[p.X, p.Y].map(v => v / SCALE)}) → (${[q.X, q.Y].map(v => v / SCALE)}) carries tags ${JSON.stringify(tags)}: ${r.clause}. Refusing.`)
    stat[r.kind] = (stat[r.kind] || 0) + 1
    if (r.kind === 'transition') { // ordered by the neighbours: the tag of the ring the previous edge carries comes first
      const prev = T[(e - 1 + E.length) % E.length], pr = new Set((prev == null ? [] : Array.isArray(prev) ? prev : [prev]).map(t => t.ring))
      const [x, y] = pr.has(r.tags[1].ring) && !pr.has(r.tags[0].ring) ? [r.tags[1], r.tags[0]] : [r.tags[0], r.tags[1]]
      tok.push(Lsrc(x.ring, x.i), Lsrc(y.ring, y.i)); continue }
    const R = SRC[r.ring], n = R.length
    if (r.kind === 'cut') { tok.push(Lsrc(r.ring, r.from), { kind: 'V', p: r.X, cut: true }, Lsrc(r.ring, r.to)); continue }
    // ⭐ A RUN ALREADY EMITTED IS NOT RE-EMITTED (Huron, 2026-10-29): when the noding cuts one stretch of nearly collinear lines into
    // pieces claimed by overlapping runs, a run that starts INSIDE the stretch just emitted on this ring emits only its part
    // beyond it, and nothing if it is covered
    let from = r.from
    if (lastRun && lastRun.ring === r.ring) { const pos = (x) => (x - lastRun.from + n) % n
      const inside = (x) => pos(x) <= pos(lastRun.to)
      if (inside(r.to) && !inside(r.from)) throw new Error(`[${who}] ⛔ the back-offset: a tag run ${r.from}…${r.to} of ring ${r.ring} overlaps the stretch just emitted (${lastRun.from}…${lastRun.to}) and extends BACKWARD past its start. Refusing.`)
      if (inside(r.from)) { if (pos(r.to) <= pos(lastRun.to)) { stat.runCovered = (stat.runCovered || 0) + 1; continue } from = (lastRun.to + 1) % n; tok.push({ kind: 'V', p: [R[from].X, R[from].Y], own: true }); stat.runTrimmed = (stat.runTrimmed || 0) + 1 } }
    for (let j = from; ; j = (j + 1) % n) { tok.push(Lsrc(r.ring, j)); if (j === r.to) break; tok.push({ kind: 'V', p: [R[(j + 1) % n].X, R[(j + 1) % n].Y], own: true }) }
    lastRun = { ring: r.ring, from: lastRun && lastRun.ring === r.ring && from !== r.from ? lastRun.from : r.from, to: r.to } }
  // one line twice in a row is one line: the same region edge, or (exactly) the same line
  const t2 = []
  for (const t of tok) { const l = t2[t2.length - 1]
    if (t.kind === 'L' && l?.kind === 'L' && ((t.born && t.born === l.born) || (t.g != null && t.g === l.g && t.i === l.i) || (t.int && l.int && sameLine({ a: t.int[0], b: t.int[1] }, { a: l.int[0], b: l.int[1] })))) continue
    t2.push(t) }
  while (t2.length > 1 && t2[0].kind === 'L' && t2[t2.length - 1].kind === 'L' && ((t2[0].g != null && t2[0].g === t2[t2.length - 1].g && t2[0].i === t2[t2.length - 1].i))) t2.pop()
  // the joins: between two consecutive lines with no fixed point between
  const RUN = SRC.map((R, g) => (LINES?.[g] && !BY_EDGES ? runsOf(R, LINES[g]) : null))
  const out = [], outL = [], N = t2.length
  // the region's own arc from t's edge to u's, FORWARD IN THE RING'S OWN ORDER whatever its length (Zob, 2026-10-29; the
  // 'under n/2' heuristic is deleted), and VALID only if no interior edge of it appears elsewhere in this ring's lines (else
  // the jump runs BACKWARD against the ring); each arc point with its outgoing edge's line
  const present = new Set(t2.filter(x => x.kind === 'L' && x.g != null).map(x => x.g + ':' + x.i))
  const arcOf = (t, u) => { const R = SRC[t.g], n = R.length, pts = [], lns = []; let valid = true
    for (let j = (t.i + 1) % n; ; j = (j + 1) % n) { pts.push([R[j].X, R[j].Y]); lns.push(lineOf(t.g, j)); if (j === u.i) break; if (present.has(t.g + ':' + j)) valid = false; if (pts.length > n) break }
    return { pts, lns, valid } }
  const pushArc = (a, kind) => { a.pts.forEach((q, k) => { out.push(q); outL.push(a.lns[k]); origin(q, kind) }) }
  for (let k = 0; k < N; k++) { const t = t2[k], u = t2[(k + 1) % N]
    if (t.kind === 'V') { out.push(t.p); outL.push(u.kind === 'L' ? (u.int || null) : null); origin(t.p, t.cut ? 'cut-point' : 'run-vertex'); continue }
    if (u.kind === 'V') continue
    if (t.g != null && u.g === t.g && RUN[t.g] && RUN[t.g].runOf[u.i] === (RUN[t.g].runOf[t.i] + 1) % RUN[t.g].runs.length) { const v = SRC[t.g][RUN[t.g].runs[RUN[t.g].runOf[u.i]].s]; out.push([v.X, v.Y]); outL.push(u.int || null); origin([v.X, v.Y], 'own'); stat.own++; continue }
    if (t.g != null && u.g === t.g && u.i === (t.i + 1) % SRC[t.g].length) { const v = SRC[t.g][u.i]; out.push([v.X, v.Y]); outL.push(u.int || null); origin([v.X, v.Y], 'own'); stat.own++; continue }
    // a cut join between two lines
    const A = t.int || t.flt, B = u.int || u.flt
    const na = unit(A[0], A[1]), nb = unit(B[0], B[1]), cosA = na[0] * nb[0] + na[1] * nb[1], sinA = na[0] * nb[1] - nb[0] * na[1]
    if (t.int && u.int && sameLine({ a: A[0], b: A[1] }, { a: B[0], b: B[1] })) continue
    if (t.int && u.int && t.g != null && u.g === t.g) { const v = SRC[t.g][u.i], nearV = (l) => { const dx = BigInt(l[1][0] - l[0][0]), dy = BigInt(l[1][1] - l[0][1]), cr = dx * BigInt(v.Y - l[0][1]) - dy * BigInt(v.X - l[0][0]); return 2n * cr * cr <= dx * dx + dy * dy }
      // ⭐ ACROSS A TRANSITION, NO VERTEX (Zob, 2026-10-29; ruling (2) generalised from exactly parallel to within rounding)
      if (cosA > 0 && nearV(A) && nearV(B) && Math.abs(sinA) < 0.5) { stat.transitionJoin = (stat.transitionJoin || 0) + 1; continue } }
    if (t.int && u.int && BigInt(A[1][0] - A[0][0]) * BigInt(B[1][1] - B[0][1]) === BigInt(A[1][1] - A[0][1]) * BigInt(B[1][0] - B[0][0])) {
      // ⭐ PARALLEL AND DISTINCT at a join: no cut exists (Zob's ruling, 2026-10-28, one rule for any order):
      //  · separation ≤ NODE_BOUND, exact (2·cross(dir, offset)² ≤ |dir|²): the lines differ by less than the lattice's own
      //    rounding (a staircase in the trace), so the join gets NO vertex: the last emitted point runs straight to the next
      //  · separation > NODE_BOUND, FORWARD on one ring: the jog, the band test (ruling (2)), the region's own vertices
      //  · else (backward, two rings, a failed band): refuse by name (a swallowtail: unruled until one exists)
      { const [dx, dy, ox, oy] = [A[1][0] - A[0][0], A[1][1] - A[0][1], B[0][0] - A[0][0], B[0][1] - A[0][1]].map(BigInt), cr = dx * oy - dy * ox
        if (2n * cr * cr <= dx * dx + dy * dy) { stat.staircase = (stat.staircase || 0) + 1; continue } }
      const ja = t.g != null && u.g === t.g ? arcOf(t, u) : null
      if (!ja || !ja.valid) throw new Error(`[${who}] ⛔ the back-offset: parallel distinct lines ${JSON.stringify(A)} and ${JSON.stringify(B)} meet ${!ja ? 'from two rings' : `BACKWARD (edge ${t.i} then ${u.i} of ${SRC[t.g].length}, ring ${t.g}${area(SRC[t.g]) < 0 ? ', a HOLE' : ', an outer'})`}, farther apart than the lattice's rounding (clause swallowtail). Refusing.`)
      const R = SRC[t.g], n = R.length, L = Math.hypot(A[1][0] - A[0][0], A[1][1] - A[0][1])
      const side = (p) => ((p[0] - A[0][0]) * (A[1][1] - A[0][1]) - (p[1] - A[0][1]) * (A[1][0] - A[0][0])) / L, o = side(B[0])
      const lo = Math.min(0, o) - NODE_BOUND, hi = Math.max(0, o) + NODE_BOUND, arc = []
      for (let j = (t.i + 1) % n; ; j = (j + 1) % n) { arc.push([R[j].X, R[j].Y]); if (j === u.i) break; if (arc.length > n) throw new Error(`[${who}] ⛔ the back-offset: the jog's arc does not close. Refusing.`) }
      const off = arc.find(p => { const s = side(p); return s < lo || s > hi })
      if (off) throw new Error(`[${who}] ⛔ the back-offset: parallel distinct lines meet across a protrusion at (${off.map(v => v / SCALE)}) (clause parallel-protrusion: lines ${JSON.stringify(A)} and ${JSON.stringify(B)}, ${Math.abs(o).toFixed(3)} u apart; the vertex ${side(off).toFixed(3)} u across, the band [${lo.toFixed(3)}, ${hi.toFixed(3)}]; arc of ${arc.length} vertices; t = (${t.g}, ${t.i}), u = (${u.g}, ${u.i}) of ${n}). Refusing.`)
      pushArc(ja, 'jog'); stat.jogJoin = (stat.jogJoin || 0) + 1; continue }
    if (Math.abs(sinA) < 1e-15 && cosA > 0) throw new Error(`[${who}] ⛔ the back-offset: a new line parallel to its neighbour at (${A[1]}). Refusing.`)
    const Xf = fcross(A, B)                                                    // the lines' crossing, unrounded
    const dLine = (q, L) => { const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1]; return Math.abs((q[0] - L[0][0]) * dy - (q[1] - L[0][1]) * dx) / Math.hypot(dx, dy) }
    // ⭐ THE GAP RULE AT ANY NON-ADJACENT JOIN (Zob, 2026-10-29; clause 3 made general): every skipped source vertex within
    // NODE_BOUND of the cut path (L_a to X, then L_b) → the two answers differ by less than the lattice's own rounding, so the
    // source vertices are emitted, never X
    const AR = t.g != null && u.g === t.g ? arcOf(t, u) : null
    if (AR && AR.valid && AR.pts.length > 1) { const sk = AR.pts; {
        const dS = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, tt = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(q[0] - a[0] - tt * dx, q[1] - a[1] - tt * dy) }
        if (sk.every(q => Math.min(dS(q, A[0], Xf), dS(q, Xf, B[1])) <= NODE_BOUND)) { pushArc(AR, 'gap-arc'); stat.gapArc = (stat.gapArc || 0) + 1; continue } } }
    if (1 + cosA < MITER_LIM && sinA * -d > 0) {    // squared, as clipper squares the join (parity; the limit JUSTIFIED below)
      // ⭐ THE CAP'S ENDS ARE ITS CROSSINGS WITH ITS NEIGHBOURS (Zob, 2026-10-29): the cap is a NEW line, placed as clipper places
      // its square (at |d| from the offset vertex, across the bisector), and each end is lineCross(L_cap, L_a) and
      // lineCross(L_cap, L_b), rounded once; an end farther than NODE_BOUND from its neighbour line refuses by name
      const tt = Math.tan(Math.atan2(sinA, cosA) / 4), dd = -d
      const c = [Xf[0] - (na[0] + nb[0]) * dd / (1 + cosA), Xf[1] - (na[1] + nb[1]) * dd / (1 + cosA)]   // the offset vertex, unrounded
      const cap = [[c[0] + dd * (na[0] - na[1] * tt), c[1] + dd * (na[1] + na[0] * tt)], [c[0] + dd * (nb[0] + nb[1] * tt), c[1] + dd * (nb[1] - nb[0] * tt)]]
      const e1 = fcross(cap, A).map(Math.round), e2 = fcross(cap, B).map(Math.round)
      for (const [e, L, nm] of [[e1, A, 'a'], [e2, B, 'b']]) if (dLine(e, L) > NODE_BOUND) throw new Error(`[${who}] ⛔ the back-offset: a squared join's cap end (${e.map(v => v / SCALE)}) lies ${dLine(e, L).toFixed(3)} u off its neighbour line ${nm}, past NODE_BOUND. Refusing.`)
      out.push(e1, e2); outL.push([e1, e2], u.int || null); [e1, e2].forEach(q => origin(q, 'square')); stat.squared++; (stat.squares ||= []).push(Xf.map(Math.round)); continue }
    const X = t.int && u.int ? lineCrossOf({ a: A[0], b: A[1] }, { a: B[0], b: B[1] }, who) : fcross(A, B).map(Math.round)
    // ⭐ A CUT WHOSE CROSSING THE NEXT BOOLEAN TRIMS EMITS THAT BOOLEAN'S EXACT RESULT: THE REGION'S OWN ARC (Zob's ruling,
    // 2026-10-29). L_a and L_b are the region's own edge lines: in the open, X = L_a ∩ L_b outside the region is trimmed by ∩P,
    // which in exact arithmetic follows L_a to a's end, the skipped source arc, then L_b; the close is the mirror (X inside,
    // unioned away). So the arc is emitted and X never is. The side, exact (BigInt): the local loop arc-then-X wound
    // clockwise ⇔ X outside (the region lies LEFT of every ring)
    if (AR && AR.valid) { const arc = AR.pts; {
        const loop = [...arc, X]; let a2 = 0n; for (let k = 0; k < loop.length; k++) { const p = loop[k], q = loop[(k + 1) % loop.length]; a2 += BigInt(p[0]) * BigInt(q[1]) - BigInt(q[0]) * BigInt(p[1]) }
        if (TRIM_INVERTED ? !(d < 0 ? a2 < 0n : a2 > 0n) : (d < 0 ? a2 < 0n : a2 > 0n)) { pushArc(AR, 'trimmed-arc'); stat.trimmedArc = (stat.trimmedArc || 0) + 1; continue } } }
    // ⛔ a BACKWARD cut between non-parallel lines of one ring: refuse by name (Zob, 2026-10-29; unruled until one exists)
    // ⭐ BACKWARD BUT ADJACENT (Zob, 2026-10-29): u = t − 1 on one ring: the two lines are adjacent source edges, and their
    // crossing must BE the shared source vertex v_t, integer for integer (checked, never assumed), which is emitted. Why the
    // eroded ring meets t before t − 1 is not established (Breakwater 6, decks 1, all one step back).
    if (AR && !AR.valid && !REFUSE_ALL_BACKWARD && (t.i - u.i + SRC[t.g].length) % SRC[t.g].length === 1) { const v = SRC[t.g][t.i]
      if (X[0] !== v.X || X[1] !== v.Y) throw new Error(`[${who}] ⛔ the back-offset: a backward-adjacent join (edge ${t.i} then ${u.i} of ring ${t.g}) crosses at (${X}), not at their shared vertex (${v.X}, ${v.Y}). Refusing.`)
      out.push(X); outL.push(u.int || null); origin(X, 'backward-adjacent'); stat.backwardAdjacent = (stat.backwardAdjacent || 0) + 1; continue }
    if (AR && !AR.valid) { const n = SRC[t.g].length, inner = []; for (let j = (t.i + 1) % n; j !== u.i; j = (j + 1) % n) inner.push(j)
      const where = inner.slice(0, 4).map(j => ({ edge: j, atTokens: t2.map((x, q) => (x.kind === 'L' && x.g === t.g && x.i === j ? q : -1)).filter(q => q >= 0) }))
      const around = t2.slice(Math.max(0, k - 6), k + 8).map((x, q) => x.kind === 'L' ? (x.g != null ? `${x.g}:${x.i}` : 'new') : 'V')
      const lo = (t.i - 2 + n) % n, srcV = []; for (let q = 0; q < 7; q++) { const v = SRC[t.g][(lo + q) % n]; srcV.push(`${(lo + q) % n}:(${v.X},${v.Y})`) }
      const tagsOf = (tg) => (tg == null ? [] : Array.isArray(tg) ? tg : [tg]).filter(x => x.ring === t.g).map(x => x.i)
      const eroded = E.map((q, e2) => ({ e2, q, tg: tagsOf(T[e2]) })).filter(o => o.tg.some(i => ((i - lo + n) % n) < 7)).slice(0, 14).map(o => `e${o.e2}(${o.q.X},${o.q.Y})[${o.tg.join('+')}]`)
      // Zob's confirmation: each involved region edge's BIRTH LINE (LINES: P's line as two points, or none = born from its own points)
      const seen = t2.slice(Math.max(0, k - 6), k + 8).filter(x => x.kind === 'L' && x.g === t.g).map(x => x.i), lo2 = Math.min(...seen), hi2 = Math.max(...seen)
      const ids = []; for (let i = lo2; i <= hi2 && ids.length < 40; i++) ids.push(i)
      const births = ids.map(i => { const p0 = SRC[t.g][i], p1 = SRC[t.g][(i + 1) % n], L = LINES?.[t.g]?.[i]
        return { edge: i, inTokens: seen.includes(i), lenU: +Math.hypot(p1.X - p0.X, p1.Y - p0.Y).toFixed(2), deg: +(Math.atan2(p1.Y - p0.Y, p1.X - p0.X) * 180 / Math.PI).toFixed(3),
          line: L ? JSON.stringify(L) : 'born', lineDeg: L ? +(Math.atan2(L[1][1] - L[0][1], L[1][0] - L[0][0]) * 180 / Math.PI).toFixed(3) : null, pts: `(${p0.X},${p0.Y})→(${p1.X},${p1.Y})` } })
      if (process.env.CUTONCE_DUMP) writeFileSync(process.env.CUTONCE_DUMP, JSON.stringify({ src: srcV, eroded, tokens: around, births }, null, 1))
      throw new Error(`[${who}] ⛔ the back-offset: a cut joins edge ${t.i} to edge ${u.i} of ring ${t.g}${area(SRC[t.g]) < 0 ? ' (a HOLE)' : ' (an outer)'} and its skipped arc's edges appear ELSEWHERE in this ring (not a forward removal: ${JSON.stringify(where)}; this join at token ${k} of ${t2.length}; tokens around [${around.join(' ')}]), lines ${JSON.stringify(A)} and ${JSON.stringify(B)}. Refusing.`) }
    out.push(X); outL.push(u.int || null); origin(X, t.flt || u.flt ? 'new-line-join' : 'cut-join'); stat.cutJoin++
    const par = (L, q) => { const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1]; return ((q[0] - L[0][0]) * dx + (q[1] - L[0][1]) * dy) / (dx * dx + dy * dy) }
    DETAIL.set(X[0] + ',' + X[1], { who, t: t.g != null ? { g: t.g, i: t.i } : 'new', u: u.g != null ? { g: u.g, i: u.i } : 'new', ta: +par(A, Xf).toFixed(4), tb: +par(B, Xf).toFixed(4), A, B }) }
  if (outL.length !== out.length) throw new Error(`[${who}] ⛔ the back-offset: ${out.length} points but ${outL.length} outgoing lines. Refusing.`)
  return out.map(([X, Y], k) => ({ X, Y, tag: TAGS_BY_SEGMENT ? null : outL[k] }))
}
export const ORIGIN = new Map(), DETAIL = new Map()
// a piece edge's tag: its line (ring, i), BORN (a strip end, a cap: a new line), or NEAR (on the region's own edge: interior after the
// boolean). An output edge with NO tag at all is a LOST tag (Zob's gate, 2026-10-29), counted
const BORN = { born: true }, NEAR = { near: true }
let TAGS_BY_SEGMENT = false                       // ⛔ the mutant only (setTagsBySegment): the close tags by the open's segments
export const setTagsBySegment = (v) => { TAGS_BY_SEGMENT = !!v }
let REFUSE_ALL_BACKWARD = false                   // ⛔ the mutant only (setRefuseAllBackward)
export const setRefuseAllBackward = (v) => { REFUSE_ALL_BACKWARD = !!v }
let SINGLE_POINT_BRANCH = false                   // ⛔ the mutant only (setSinglePointBranch): clipper's single-point join restored
export const setSinglePointBranch = (v) => { SINGLE_POINT_BRANCH = !!v }
let RAW_CURVE = false                             // ⛔ the mutant only (setRawCurve): the raw curve selected by winding > 0
export const setRawCurve = (v) => { RAW_CURVE = !!v }
let BY_EDGES = false                              // ⛔ the mutant only (setByEdges): the close morphs the open's edges, not its runs
export const setByEdges = (v) => { BY_EDGES = !!v }
let NO_TOPOLOGY_GUARD = false                     // ⛔ the mutant only (setNoTopologyGuard)
export const setNoTopologyGuard = (v) => { NO_TOPOLOGY_GUARD = !!v }
let FOLDED_QUAD = false, NO_FOLD_TRIANGLE = false   // ⛔ the mutants only (setFoldMutant)
export const setFoldMutant = (m) => { FOLDED_QUAD = m === 'quad'; NO_FOLD_TRIANGLE = m === 'no-triangle' }
let TRIM_INVERTED = false                          // ⛔ the mutant only (setTrimInverted): the side test inverted
export const setTrimInverted = (v) => { TRIM_INVERTED = !!v }
const origin = (p, kind) => { const k = p[0] + ',' + p[1], o = ORIGIN.get(k); ORIGIN.set(k, o && o !== kind ? o + '|' + kind : kind) }
const fcross = (A, B) => { const r = [A[1][0] - A[0][0], A[1][1] - A[0][1]], s = [B[1][0] - B[0][0], B[1][1] - B[0][1]], den = r[0] * s[1] - r[1] * s[0]
  if (!den) throw new Error('⛔ the back-offset: a new line parallel to its neighbour. Refusing.')
  const t = ((B[0][0] - A[0][0]) * s[1] - (B[0][1] - A[0][1]) * s[0]) / den; return [A[0][0] + t * r[0], A[0][1] + t * r[1]] }

// ⭐ THE OFFSET AS A BOOLEAN OF EXACT PIECES (Zob, 2026-10-29): not a winding selection of one self-crossing curve (with pure
// intersection joins "winding > 0" keeps a narrow spike's loops, which the erosion removes; Huron's 30 u spike). Each edge's
// STRIP on the d side (the rectangle from the edge to L_i(d)), and at each join where the offset lines DIVERGE (sinA·d > 0:
// a reflex vertex for the erode, a convex one for the dilate) the WEDGE v → v + n_k·d → X → v + n_j·d (X = their crossing),
// SQUARED past the miter limit (both cap ends on the lines, the cap a born line). Erode = region − ∪ pieces; dilate = region ∪
// pieces. A strip's far side carries its edge's tag, a wedge's two outer sides theirs; the strip ends and the caps are born
// (null). Every corner is in doubles, rounded once at birth: intermediate, only the tags leave.
// ⛔ ② (tileGround.js#offsetRingByRects) cannot share it: a variable-depth, per-owner, labelled offset with ease and water
// joins, whose booleans are clipper's union (the integer re-rounding this brief removes); moving ② onto the face walk is a ②
// change outside this brief. structures.mjs#stripOf widens a centreline symmetrically, not one side of an edge.
// ⭐ RUNS (Zob, 2026-10-29): the morph reads the region's LINE SEQUENCE, not its rounded vertex list. Consecutive edges born on the
// SAME line are one run: a vertex between them is a rounding point, not a corner, and enters no piece. Without birth lines
// (P itself) each edge is its own run. → per ring: runs [{ s, e, line }] (edge indices s…e) and runOf[i]
export function runsOf(R, lines) {
  const n = R.length, key = (i) => (lines?.[i] ? JSON.stringify(lines[i]) : `own:${i}`), runOf = new Array(n)
  let start = 0; while (start < n && key(start) === key((start - 1 + n) % n) && n > 1) start++
  if (start === n) start = 0
  const runs = []
  for (let c = 0; c < n; c++) { const i = (start + c) % n
    if (c === 0 || key(i) !== key((i - 1 + n) % n)) runs.push({ s: i, e: i, line: lines?.[i] || [[R[i].X, R[i].Y], [R[(i + 1) % n].X, R[(i + 1) % n].Y]] })
    else runs[runs.length - 1].e = i
    runOf[i] = runs.length - 1 }
  return { runs, runOf }
}
function offsetPieces(R, d, g, squares, lines = null, stat0 = {}) {
  // ⭐ A JOIN'S CORNER IS COMPUTED ONCE AND SHARED (Zob, 2026-10-29), FROM THE TWO LINES (never the region's rounded points): each
  // RUN's piece runs between its two join corners [v_s, v_e, C_end, C_start]; at each change of line, V* = the two lines' exact
  // crossing (doubles: intermediate), and DIVERGING → X = L_a(d) ∩ L_b(d), one point for both pieces; past the miter limit the
  // cap's two ends and a cap triangle [V*, C_a, C_b]; CONVERGING → the rectangle corners V* + n_a·d and V* + n_b·d
  const n = R.length, { runs } = runsOf(R, lines), m = runs.length, pieces = []
  const P = (x, y) => ({ X: Math.round(x), Y: Math.round(y) })
  const ccw = (pp) => { let a2 = 0; for (let k = 0; k < pp.length; k++) { const p = pp[k], q = pp[(k + 1) % pp.length]; a2 += p.X * q.Y - q.X * p.Y }
    if (a2 > 0) return pp
    const r = pp.slice().reverse(); return r.map((q, k) => ({ ...q, tag: pp[(pp.length - 1 - k - 1 + pp.length) % pp.length].tag })) }
  const N = runs.map(r => unit(r.line[0], r.line[1]))
  // the corner between run k and the run r after it (ruling (d)'s classes): { end: k's end corner, start: r's start corner, cap }
  const cornerOf = (k, r, v) => { const nk = N[k], nj = N[r]
    const sinA = Math.max(-1, Math.min(1, nk[0] * nj[1] - nj[0] * nk[1])), cosA = nk[0] * nj[0] + nk[1] * nj[1], rr = 1 + cosA
    const Lk = runs[k].line, Lr = runs[r].line, den = (Lk[1][0] - Lk[0][0]) * (Lr[1][1] - Lr[0][1]) - (Lk[1][1] - Lk[0][1]) * (Lr[1][0] - Lr[0][0])
    const nearV = (l) => { const dx = BigInt(l[1][0] - l[0][0]), dy = BigInt(l[1][1] - l[0][1]), cr = dx * BigInt(v.Y - l[0][1]) - dy * BigInt(v.X - l[0][0]); return 2n * cr * cr <= dx * dx + dy * dy }
    // ⭐ both lines within rounding of the region vertex between them: that vertex is the corner (a transition, or the ordinary
    // case where both pass through it), never a far crossing of two nearly parallel lines
    const V = nearV(Lk) && nearV(Lr) ? [v.X, v.Y] : m > 1 && den !== 0 ? fcross(Lk, Lr) : [v.X, v.Y]
    if (!(sinA * d > 0)) return { end: P(V[0] + nk[0] * d, V[1] + nk[1] * d), start: P(V[0] + nj[0] * d, V[1] + nj[1] * d), cap: false, conv: true }
    if (rr < MITER_LIM) { const t = Math.tan(Math.atan2(sinA, cosA) / 4)
      return { end: P(V[0] + d * (nk[0] - nk[1] * t), V[1] + d * (nk[1] + nk[0] * t)), start: P(V[0] + d * (nj[0] + nj[1] * t), V[1] + d * (nj[1] - nj[0] * t)), cap: true } }
    const qq = d / rr, X = P(V[0] + (nk[0] + nj[0]) * qq, V[1] + (nk[1] + nj[1]) * qq); return { end: X, start: X, cap: false } }
  const vAt = (r) => R[runs[r].s]                                                   // the region vertex where run r starts
  // ⭐ EVERY PIECE IS LOCAL (Zob, 2026-10-29; the elimination pass, Y, the fan and the base polygon are withdrawn): the dilation is
  // the union of EVERY run's strip and EVERY diverging join's wedge, so a run between converging neighbours can be outermost and
  // nothing is swallowed by construction. Corners per ruling (d), computed once; C[k] the corner between run k and the next
  const C = runs.map((_, k) => cornerOf(k, (k + 1) % m, vAt((k + 1) % m)))
  for (let k = 0; k < m; k++) { const c = C[k], r = (k + 1) % m
    if (c.cap) { if (squares) squares.push([vAt(r).X, vAt(r).Y]); pieces.push(ccw([{ X: vAt(r).X, Y: vAt(r).Y, tag: BORN }, { ...c.end, tag: BORN }, { ...c.start, tag: BORN }])) } }
  for (let q = 0; q < m; q++) { const k = (q - 1 + m) % m, a = vAt(q), b = vAt((q + 1) % m), L = runs[q].line, nn = N[q]
    if (a.X === b.X && a.Y === b.Y && m > 1) continue
    const s0 = C[k].start, e0 = C[q].end, along = (e0.X - s0.X) * (L[1][0] - L[0][0]) + (e0.Y - s0.Y) * (L[1][1] - L[0][1])
    const lineTag = { ring: g, i: runs[q].s }
    if (along > 0) { pieces.push(ccw([{ X: a.X, Y: a.Y, tag: NEAR }, { X: b.X, Y: b.Y, tag: BORN }, { ...e0, tag: lineTag }, { ...s0, tag: BORN }])); continue }
    if (along <= 0 && FOLDED_QUAD) { pieces.push(ccw([{ X: a.X, Y: a.Y, tag: NEAR }, { X: b.X, Y: b.Y, tag: BORN }, { ...e0, tag: lineTag }, { ...s0, tag: BORN }])); continue }   // ⛔ the mutant only
    // a run whose far side would fold: its PLAIN RECTANGLE, plus at each DIVERGING end the triangle [v, X, R] (X the end's shared
    // join point, the same integer point the neighbour's quad ends at; R this run's rectangle corner at v). With the
    // neighbour's quad half [v, R_prev, X] it covers the true wedge [v, R_prev, X, R_next]; a converging end needs nothing
    const Ra = P(a.X + nn[0] * d, a.Y + nn[1] * d), Rb = P(b.X + nn[0] * d, b.Y + nn[1] * d)
    pieces.push(ccw([{ X: a.X, Y: a.Y, tag: NEAR }, { X: b.X, Y: b.Y, tag: BORN }, { ...Rb, tag: lineTag }, { ...Ra, tag: BORN }]))
    if (!C[k].conv && !NO_FOLD_TRIANGLE) pieces.push(ccw([{ X: a.X, Y: a.Y, tag: BORN }, { ...s0, tag: lineTag }, { ...Ra, tag: BORN }]))
    if (!C[q].conv && !NO_FOLD_TRIANGLE) pieces.push(ccw([{ X: b.X, Y: b.Y, tag: BORN }, { ...Rb, tag: lineTag }, { ...e0, tag: BORN }]))
    stat0.folded = (stat0.folded || 0) + 1 }
  // ⭐ A BORN LINE IS ITS TWO BIRTH POINTS (Zob, 2026-10-29), the whole strip end or cap edge: never a noded fragment of it,
  // whose two rounded points a unit apart would quantise its direction to the lattice's axes (the decks' axis-aligned box)
  for (const pp of pieces) pp.forEach((q, k) => { if (q.tag === BORN) { const w = pp[(k + 1) % pp.length]; q.tag = { born: [[q.X, q.Y], [w.X, w.Y]] } } })
  return pieces
}
export function morph(region, d, who, stat, lines = null) {
  let F
  if (RAW_CURVE) { const raw = region.map((R, g) => rawOffset(R, d, g, (stat.squares ||= []))); F = arrange([raw], w => w[0] > 0, `${who} offset`, true) }   // ⛔ the mutant only
  else { let pieces = region.flatMap((R, g) => offsetPieces(R, d, g, (stat.squares ||= []), BY_EDGES ? null : lines?.[g], stat))
    // ⭐ THE ERODE'S PIECES WIND CLOCKWISE (Plumb, 2026-10-29, measured on the decks): facesOf takes a boundary edge's tag from the
    // inputs running the SAME way as the boundary (the kept face on its left). In an erode the kept region lies OUTSIDE the
    // pieces, so a counter-clockwise piece's tagged far side runs AGAINST the boundary and every eroded edge came out tagless
    // (each back-offset then a fresh line, a near-copy of P's). Wound clockwise (tags moved with their edges), the far side runs
    // with the boundary; coverage is then winding < 0
    if (d < 0) pieces = pieces.map(pp => { const r = pp.slice().reverse(); return r.map((q, k) => ({ ...q, tag: pp[(pp.length - 1 - k - 1 + pp.length) % pp.length].tag })) })
    const base = region.map(R => R.map(q => ({ X: q.X, Y: q.Y, tag: null })))
    F = arrange([base, pieces], d < 0 ? (w => w[0] > 0 && !(w[1] < 0)) : (w => w[0] > 0 || w[1] > 0), `${who} offset`, true) }
  // TRACE (diagnostic only, CUTONCE_TRACE_AT=x,y metres): every eroded/dilated edge within 2 m of the place, with its tags
  if (process.env.CUTONCE_TRACE_AT) { const [tx, ty] = process.env.CUTONCE_TRACE_AT.split(',').map(v => +v * SCALE)
    F.rings.forEach((E, k) => E.forEach((q, e) => { const r2 = E[(e + 1) % E.length]; if (Math.hypot(q.X - tx, q.Y - ty) > 2000) return
      console.log(`TRACE ${who} ring ${k} e${e} (${q.X},${q.Y})→(${r2.X},${r2.Y}) tags ${JSON.stringify(F.tags[k][e])}`) })) }
  const OUT = F.rings.map((E, k) => emit(E, F.tags[k], region, d, who, stat, lines))
  if (process.env.CUTONCE_TRACE_AT) { const [tx, ty] = process.env.CUTONCE_TRACE_AT.split(',').map(v => +v * SCALE)
    OUT.forEach((E, k) => E.forEach((q, e) => { const r2 = E[(e + 1) % E.length]; if (Math.hypot(q.X - tx, q.Y - ty) > 2000) return
      console.log(`TRACE-OUT ${who} ring ${k} v${e} (${q.X},${q.Y})→(${r2.X},${r2.Y}) line ${JSON.stringify(q.tag)}`) })) }
  if (process.env.CUTONCE_LOST) console.log(`LOST ${who}: ${stat.lostTags || 0} edge(s) with no tag ${JSON.stringify(stat.lostAt || [])} · near sides out ${stat.nearOut || 0}`)
  return OUT
}

// a face set's rings → pieces [outer, …holes] (a hole into the smallest outer holding its first vertex)
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.X * q.Y - q.X * p.Y } return a / 2 }
const inR = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a.Y > y) !== (b.Y > y) && x < (b.X - a.X) * (y - a.Y) / (b.Y - a.Y) + a.X) c = !c } return c }
function pieces(rings) {
  const outs = rings.filter(r => area(r) > 0).map(r => ({ r, a: area(r), holes: [] })), holes = rings.filter(r => area(r) < 0)
  for (const h of holes) { const m = h.find(() => true), own = outs.filter(o => inR(m.X + 0.25, m.Y + 0.25, o.r) || o.r.some(q => q.X === m.X && q.Y === m.Y)).sort((x, y) => x.a - y.a)[0]
    if (!own) throw new Error('⛔ pieces: a hole inside no outer. Refusing.'); own.holes.push(h) }
  return outs.map(o => [o.r, ...o.holes])
}
const toIP = (pp) => pp.map(r => r.map(q => new IntPoint(q.X, q.Y)))
const m2 = (pp) => pp.reduce((t, r) => t + area(r), 0) / SCALE / SCALE

/** The cut-once open/close at the step, with provenance. `paths` clipper paths (any winding; unioned first, nonzero). */
export { pieces, area }
export function openCloseProvenance(paths, stepM, what) {
  const h = (stepM / 2) * SCALE, stat = { own: 0, cutJoin: 0, squared: 0, newLines: 0 }
  const P = arrange([paths.map(p => p.map(q => ({ X: q.X, Y: q.Y })))], w => w[0] !== 0, `${what} union`).rings
  const Pt = P.map(r => r.map((q, i) => ({ X: q.X, Y: q.Y, tag: [[q.X, q.Y], [r[(i + 1) % r.length].X, r[(i + 1) % r.length].Y]] })))
  // open = morph(P, −h) ∩ P
  const D = morph(Pt, -h, `${what} open`, stat)
  const OPEN = arrange([Pt, D], w => w[0] > 0 && w[1] > 0, `${what} ∩P`, false, 0), open = OPEN.rings
  // closedK = morph(open, +h) ∪ open
  // ⭐ a TRANSITION edge of the open (two lines within rounding) gives the close the line its neighbour runs on, so the run
  // continues straight across it (Zob, 2026-10-29: across a transition, no vertex)
  const openLines = OPEN.tags.map(T => T.map((tg, i) => { if (!(Array.isArray(tg) && Array.isArray(tg[0]?.[0]))) return tg
    const key = (x) => JSON.stringify(x), prev = T[(i - 1 + T.length) % T.length], next = T[(i + 1) % T.length]
    stat.transitions = (stat.transitions || 0) + 1
    return tg.find(l => key(l) === key(prev)) || tg.find(l => key(l) === key(next)) || tg[0] }))
  const C = morph(open, h, `${what} close`, stat, TAGS_BY_SEGMENT ? null : openLines)
  const taken = pieces(arrange([Pt, open], w => w[0] > 0 && !(w[1] > 0), `${what} taken`).rings)
  const closedK = arrange([open, C], w => w[0] > 0 || w[1] > 0, `${what} closedK`).rings
  const filled = pieces(arrange([closedK, open], w => w[0] > 0 && !(w[1] > 0), `${what} filled`).rings)
  const tf = taken.filter(pp => !isRoundingSliver(toIP(pp))), ff = filled.filter(pp => !isRoundingSliver(toIP(pp)))
  const k = arrange([Pt, tf.flat(), ff.flat()], w => (w[0] > 0 && !(w[1] > 0)) || w[2] > 0, `${what} cut`).rings
  // ⭐ THE TOPOLOGY GUARD ON k (Zob, 2026-10-29): a hole of P that k no longer holds (it opened to the outside), or two parts of P
  // that k joins, is the topology change Boz rules on: refused by name. Intermediate merges inside the open that the close
  // undoes are not refused. A test point per ring: half a unit to the side of its longest edge (P's material for an outer, the
  // hole for a hole)
  const wnd = (rs, x, y) => rs.reduce((t, r) => { let c = false; for (let a2 = 0, b2 = r.length - 1; a2 < r.length; b2 = a2++) { const p = r[a2], q = r[b2]; if ((p.Y > y) !== (q.Y > y) && x < (q.X - p.X) * (y - p.Y) / (q.Y - p.Y) + p.X) c = !c } return t + (c ? Math.sign(area(r)) : 0) }, 0)
  const probe = (r) => { let best = 0, bi = 0; r.forEach((p, i) => { const q = r[(i + 1) % r.length], L = Math.hypot(q.X - p.X, q.Y - p.Y); if (L > best) { best = L; bi = i } })
    const p = r[bi], q = r[(bi + 1) % r.length], L = best, nx = -(q.Y - p.Y) / L, ny = (q.X - p.X) / L, side = area(r) > 0 ? 0.5 : -0.5
    return [(p.X + q.X) / 2 + nx * side, (p.Y + q.Y) / 2 + ny * side] }
  const kOuters = k.filter(r => area(r) > 0)
  const ownerIn = (pt) => kOuters.map((r, i) => ({ i, a: area(r), inside: wnd([r], pt[0], pt[1]) !== 0 })).filter(x => x.inside).sort((x, y) => x.a - y.a)[0]?.i ?? null
  if (!NO_TOPOLOGY_GUARD) {
    for (const r of Pt.filter(r => area(r) < 0)) { const pt = probe(r); if (wnd(k, pt[0], pt[1]) !== 0) continue          // filled by the close: a sub-2h hole, accounted by the change gate
      if (ownerIn(pt) == null) throw new Error(`[${what}] ⛔ the topology guard: P's hole at (${(r[0].X / SCALE).toFixed(3)}, ${(r[0].Y / SCALE).toFixed(3)}) (${(-area(r) / SCALE / SCALE).toFixed(2)} m²) is no longer a hole of the output: it opened to the outside. The topology change is Boz's. Refusing.`) }
    const seen = new Map(); for (const r of Pt.filter(r => area(r) > 0)) { const o = ownerIn(probe(r)); if (o == null) continue
      if (seen.has(o)) throw new Error(`[${what}] ⛔ the topology guard: two parts of P (at (${(seen.get(o)[0].X / SCALE).toFixed(3)}, ${(seen.get(o)[0].Y / SCALE).toFixed(3)}) and (${(r[0].X / SCALE).toFixed(3)}, ${(r[0].Y / SCALE).toFixed(3)})) are joined by the output. The topology change is Boz's. Refusing.`)
      seen.set(o, r) } }
  return { paths: toIP(k), rings: k, P: Pt, stat, opened: tf.map(pp => +m2(pp).toFixed(3)), closed: ff.map(pp => +m2(pp).toFixed(3)), slivers: { taken: taken.length - tf.length, filled: filled.length - ff.length } }
}
