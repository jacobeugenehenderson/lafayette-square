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
import { nodeCrossings, lineCrossOf, sameLine, NODE_BOUND } from '../../src/lib/latticeNode.js'
import { facesOf } from '../../src/lib/latticeFaces.js'
import { isRoundingSliver } from '../../cartograph/structures.mjs'
import { tagRun } from './tagRun.mjs'
const { IntPoint, Clipper } = clipperLib
const SCALE = 1000, MITER_LIM = 0.5                 // clipper's constant for MiterLimit 2: parity only (Boz: derive or justify after)

const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], f = 1 / Math.hypot(dx, dy); return [dy * f, -dx * f] }   // clipper's GetUnitNormal
// a ring's raw offset curve at d, each point tagged with the region edge its OUTGOING raw edge offsets (null: a join's own edge)
function rawOffset(R, d, g, squares = null) {
  const n = R.length, N = R.map((a, j) => unit([a.X, a.Y], [R[(j + 1) % n].X, R[(j + 1) % n].Y])), out = []
  const put = (x, y, tag) => out.push({ X: Math.round(x), Y: Math.round(y), tag })
  for (let j = 0; j < n; j++) { const k = (j - 1 + n) % n, p = R[j], nk = N[k], nj = N[j], edge = { ring: g, i: j }
    let sinA = nk[0] * nj[1] - nj[0] * nk[1]; const cosA = nk[0] * nj[0] + nk[1] * nj[1]
    if (Math.abs(sinA * d) < 1.0 && cosA > 0) { put(p.X + nk[0] * d, p.Y + nk[1] * d, edge); continue }
    sinA = Math.max(-1, Math.min(1, sinA))
    if (sinA * d < 0) { put(p.X + nk[0] * d, p.Y + nk[1] * d, null); put(p.X, p.Y, null); put(p.X + nj[0] * d, p.Y + nj[1] * d, edge); continue }
    const r = 1 + cosA
    if (r >= MITER_LIM) { const q = d / r; put(p.X + (nk[0] + nj[0]) * q, p.Y + (nk[1] + nj[1]) * q, edge) }
    else { const t = Math.tan(Math.atan2(sinA, cosA) / 4); if (squares) squares.push([p.X, p.Y])
      put(p.X + d * (nk[0] - nk[1] * t), p.Y + d * (nk[1] + nk[0] * t), null); put(p.X + d * (nj[0] + nj[1] * t), p.Y + d * (nj[1] - nj[0] * t), edge) } }
  return out
}
const clean = (r) => { const o = []; for (const q of r) { const l = o[o.length - 1]; if (!l || l.X !== q.X || l.Y !== q.Y) o.push(q) }
  while (o.length > 1 && o[0].X === o[o.length - 1].X && o[0].Y === o[o.length - 1].Y) o.pop(); return o }
const distinct3 = (r) => new Set(r.map(q => q.X + ',' + q.Y)).size >= 3

// node `sets` (each a list of rings [{X, Y, tag?}]) together, self included, then the faces `keep` holds. → { rings, tags }
export function arrange(sets, keep, who, allTags = false) {
  const rings = [], setOf = []
  sets.forEach((S, si) => S.forEach(r => { const c = clean(r); if (distinct3(c)) { rings.push(c); setOf.push(si) } }))
  if (!rings.length) return { rings: [], tags: [] }
  const input = rings.map((r, ri) => ({ p: r.map(q => [q.X / SCALE, q.Y / SCALE]), tag: `${who}#${ri}` }))
  let R
  try { R = nodeCrossings(input, { pairs: () => true, self: true, who }) }
  catch (e) { // ⭐ Zob's minimal repro: the rings the verifier names, saved as given (before noding) with their set, to a fixture
    const ids = [...String(e.message).matchAll(new RegExp(`${who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}#(\\d+)`, 'g'))].map(m => +m[1])
    if (ids.length && process.env.CUTONCE_REPRO) writeFileSync(process.env.CUTONCE_REPRO, JSON.stringify({ who, error: String(e.message), rings: [...new Set(ids)].map(i => ({ i, set: setOf[i], tag: input[i].tag, p: input[i].p })) }))
    throw e }
  const edges = []
  R.forEach((o, ri) => o.forEach((v, q) => { const w = o[(q + 1) % o.length]; edges.push({ a: v.k, b: w.k, set: setOf[ri], tag: rings[ri][v.edge]?.tag ?? null }) }))
  return facesOf(edges, keep, { sets: sets.length, who, allTags })
}

// the back-offset: one eroded (or dilated) ring with its tags → the morphed ring's points, the region's own wherever unchanged
function emit(E, T, SRC, d, who, stat) {
  // tokens: L = a line { int: [a, b] } (a region edge) or { flt: [a, b] } (a new line); V = a fixed point
  const tok = []
  const Lsrc = (g, i) => { const R = SRC[g], a = R[i], b = R[(i + 1) % R.length]; return { kind: 'L', g, i, int: [[a.X, a.Y], [b.X, b.Y]] } }
  for (let e = 0; e < E.length; e++) { const tg = T[e], p = E[e], q = E[(e + 1) % E.length]
    const tags = tg == null ? [] : Array.isArray(tg) ? tg : [tg]
    if (!tags.length) { // a null edge: a NEW line, the cap's own back-offset by −d
      const n = unit([p.X, p.Y], [q.X, q.Y]); tok.push({ kind: 'L', flt: [[p.X - n[0] * d, p.Y - n[1] * d], [q.X - n[0] * d, q.Y - n[1] * d]], at: p }); stat.newLines++; continue }
    const r = tagRun(tags, SRC, { twoH: 2 * Math.abs(d) })
    if (!r.ok) throw new Error(`[${who}] ⛔ the back-offset: the eroded segment (${[p.X, p.Y].map(v => v / SCALE)}) → (${[q.X, q.Y].map(v => v / SCALE)}) carries tags ${JSON.stringify(tags)}: ${r.clause}. Refusing.`)
    stat[r.kind] = (stat[r.kind] || 0) + 1
    if (r.kind === 'transition') { // ordered by the neighbours: the tag of the ring the previous edge carries comes first
      const prev = T[(e - 1 + E.length) % E.length], pr = new Set((prev == null ? [] : Array.isArray(prev) ? prev : [prev]).map(t => t.ring))
      const [x, y] = pr.has(r.tags[1].ring) && !pr.has(r.tags[0].ring) ? [r.tags[1], r.tags[0]] : [r.tags[0], r.tags[1]]
      tok.push(Lsrc(x.ring, x.i), Lsrc(y.ring, y.i)); continue }
    const R = SRC[r.ring], n = R.length
    if (r.kind === 'cut') { tok.push(Lsrc(r.ring, r.from), { kind: 'V', p: r.X, cut: true }, Lsrc(r.ring, r.to)); continue }
    for (let j = r.from; ; j = (j + 1) % n) { tok.push(Lsrc(r.ring, j)); if (j === r.to) break; tok.push({ kind: 'V', p: [R[(j + 1) % n].X, R[(j + 1) % n].Y], own: true }) } }
  // one line twice in a row is one line: the same region edge, or (exactly) the same line
  const t2 = []
  for (const t of tok) { const l = t2[t2.length - 1]
    if (t.kind === 'L' && l?.kind === 'L' && ((t.g != null && t.g === l.g && t.i === l.i) || (t.int && l.int && sameLine({ a: t.int[0], b: t.int[1] }, { a: l.int[0], b: l.int[1] })))) continue
    t2.push(t) }
  while (t2.length > 1 && t2[0].kind === 'L' && t2[t2.length - 1].kind === 'L' && ((t2[0].g != null && t2[0].g === t2[t2.length - 1].g && t2[0].i === t2[t2.length - 1].i))) t2.pop()
  // the joins: between two consecutive lines with no fixed point between
  const out = [], N = t2.length
  for (let k = 0; k < N; k++) { const t = t2[k], u = t2[(k + 1) % N]
    if (t.kind === 'V') { out.push(t.p); origin(t.p, t.cut ? 'cut-point' : 'run-vertex'); continue }
    if (u.kind === 'V') continue
    if (t.g != null && u.g === t.g && u.i === (t.i + 1) % SRC[t.g].length) { const v = SRC[t.g][u.i]; out.push([v.X, v.Y]); origin([v.X, v.Y], 'own'); stat.own++; continue }
    // a cut join between two lines
    const A = t.int || t.flt, B = u.int || u.flt
    const na = unit(A[0], A[1]), nb = unit(B[0], B[1]), cosA = na[0] * nb[0] + na[1] * nb[1], sinA = na[0] * nb[1] - nb[0] * na[1]
    if (t.int && u.int && sameLine({ a: A[0], b: A[1] }, { a: B[0], b: B[1] })) continue
    if (t.int && u.int && BigInt(A[1][0] - A[0][0]) * BigInt(B[1][1] - B[0][1]) === BigInt(A[1][1] - A[0][1]) * BigInt(B[1][0] - B[0][0])) {
      // ⭐ PARALLEL AND DISTINCT at a join: no cut exists (Zob's ruling, 2026-10-28, one rule for any order):
      //  · separation ≤ NODE_BOUND, exact (2·cross(dir, offset)² ≤ |dir|²): the lines differ by less than the lattice's own
      //    rounding (a staircase in the trace), so the join gets NO vertex: the last emitted point runs straight to the next
      //  · separation > NODE_BOUND, FORWARD on one ring: the jog, the band test (ruling (2)), the region's own vertices
      //  · else (backward, two rings, a failed band): refuse by name (a swallowtail: unruled until one exists)
      { const [dx, dy, ox, oy] = [A[1][0] - A[0][0], A[1][1] - A[0][1], B[0][0] - A[0][0], B[0][1] - A[0][1]].map(BigInt), cr = dx * oy - dy * ox
        if (2n * cr * cr <= dx * dx + dy * dy) { stat.staircase = (stat.staircase || 0) + 1; continue } }
      const fwd = t.g != null && u.g === t.g ? (u.i - t.i + SRC[t.g].length) % SRC[t.g].length : null, bwd = fwd == null ? null : SRC[t.g].length - fwd
      if (t.g == null || u.g !== t.g || !(fwd < bwd)) throw new Error(`[${who}] ⛔ the back-offset: parallel distinct lines ${JSON.stringify(A)} and ${JSON.stringify(B)} meet ${t.g == null || u.g !== t.g ? 'from two rings' : `BACKWARD (edge ${t.i} then ${u.i} of ${SRC[t.g].length})`}, farther apart than the lattice's rounding (clause swallowtail). Refusing.`)
      const R = SRC[t.g], n = R.length, L = Math.hypot(A[1][0] - A[0][0], A[1][1] - A[0][1])
      const side = (p) => ((p[0] - A[0][0]) * (A[1][1] - A[0][1]) - (p[1] - A[0][1]) * (A[1][0] - A[0][0])) / L, o = side(B[0])
      const lo = Math.min(0, o) - NODE_BOUND, hi = Math.max(0, o) + NODE_BOUND, arc = []
      for (let j = (t.i + 1) % n; ; j = (j + 1) % n) { arc.push([R[j].X, R[j].Y]); if (j === u.i) break; if (arc.length > n) throw new Error(`[${who}] ⛔ the back-offset: the jog's arc does not close. Refusing.`) }
      const off = arc.find(p => { const s = side(p); return s < lo || s > hi })
      if (off) throw new Error(`[${who}] ⛔ the back-offset: parallel distinct lines meet across a protrusion at (${off.map(v => v / SCALE)}) (clause parallel-protrusion: lines ${JSON.stringify(A)} and ${JSON.stringify(B)}, ${Math.abs(o).toFixed(3)} u apart; the vertex ${side(off).toFixed(3)} u across, the band [${lo.toFixed(3)}, ${hi.toFixed(3)}]; arc of ${arc.length} vertices; t = (${t.g}, ${t.i}), u = (${u.g}, ${u.i}) of ${n}). Refusing.`)
      out.push(...arc); arc.forEach(q => origin(q, 'jog')); stat.jogJoin = (stat.jogJoin || 0) + 1; continue }
    if (Math.abs(sinA) < 1e-15 && cosA > 0) throw new Error(`[${who}] ⛔ the back-offset: a new line parallel to its neighbour at (${A[1]}). Refusing.`)
    const Xf = fcross(A, B)                                                    // the lines' crossing, unrounded
    const dLine = (q, L) => { const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1]; return Math.abs((q[0] - L[0][0]) * dy - (q[1] - L[0][1]) * dx) / Math.hypot(dx, dy) }
    // ⭐ THE GAP RULE AT ANY NON-ADJACENT JOIN (Zob, 2026-10-29; clause 3 made general): every skipped source vertex within
    // NODE_BOUND of the cut path (L_a to X, then L_b) → the two answers differ by less than the lattice's own rounding, so the
    // source vertices are emitted, never X
    if (t.g != null && u.g === t.g) { const R = SRC[t.g], n = R.length, fwd = (u.i - t.i + n) % n
      if (fwd > 1 && fwd < n / 2) { const sk = []; for (let j2 = (t.i + 1) % n; ; j2 = (j2 + 1) % n) { sk.push([R[j2].X, R[j2].Y]); if (j2 === u.i) break }
        const dS = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, tt = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(q[0] - a[0] - tt * dx, q[1] - a[1] - tt * dy) }
        if (sk.every(q => Math.min(dS(q, A[0], Xf), dS(q, Xf, B[1])) <= NODE_BOUND)) { out.push(...sk); sk.forEach(q => origin(q, 'gap-arc')); stat.gapArc = (stat.gapArc || 0) + 1; continue } } }
    if (1 + cosA < MITER_LIM && sinA * -d > 0) {    // squared, as clipper squares the join (parity; the limit JUSTIFIED below)
      // ⭐ THE CAP'S ENDS ARE ITS CROSSINGS WITH ITS NEIGHBOURS (Zob, 2026-10-29): the cap is a NEW line, placed as clipper places
      // its square (at |d| from the offset vertex, across the bisector), and each end is lineCross(L_cap, L_a) and
      // lineCross(L_cap, L_b), rounded once; an end farther than NODE_BOUND from its neighbour line refuses by name
      const tt = Math.tan(Math.atan2(sinA, cosA) / 4), dd = -d
      const c = [Xf[0] - (na[0] + nb[0]) * dd / (1 + cosA), Xf[1] - (na[1] + nb[1]) * dd / (1 + cosA)]   // the offset vertex, unrounded
      const cap = [[c[0] + dd * (na[0] - na[1] * tt), c[1] + dd * (na[1] + na[0] * tt)], [c[0] + dd * (nb[0] + nb[1] * tt), c[1] + dd * (nb[1] - nb[0] * tt)]]
      const e1 = fcross(cap, A).map(Math.round), e2 = fcross(cap, B).map(Math.round)
      for (const [e, L, nm] of [[e1, A, 'a'], [e2, B, 'b']]) if (dLine(e, L) > NODE_BOUND) throw new Error(`[${who}] ⛔ the back-offset: a squared join's cap end (${e.map(v => v / SCALE)}) lies ${dLine(e, L).toFixed(3)} u off its neighbour line ${nm}, past NODE_BOUND. Refusing.`)
      out.push(e1, e2); [e1, e2].forEach(q => origin(q, 'square')); stat.squared++; (stat.squares ||= []).push(Xf.map(Math.round)); continue }
    const X = t.int && u.int ? lineCrossOf({ a: A[0], b: A[1] }, { a: B[0], b: B[1] }, who) : fcross(A, B).map(Math.round)
    // ⭐ A CUT WHOSE CROSSING THE NEXT BOOLEAN TRIMS EMITS THAT BOOLEAN'S EXACT RESULT: THE REGION'S OWN ARC (Zob's ruling,
    // 2026-10-29). L_a and L_b are the region's own edge lines: in the open, X = L_a ∩ L_b outside the region is trimmed by ∩P,
    // which in exact arithmetic follows L_a to a's end, the skipped source arc, then L_b; the close is the mirror (X inside,
    // unioned away). So the arc is emitted and X never is. The side, exact (BigInt): the local loop arc-then-X wound
    // clockwise ⇔ X outside (the region lies LEFT of every ring)
    if (t.g != null && u.g === t.g) { const R = SRC[t.g], n = R.length, fwd = (u.i - t.i + n) % n
      if (fwd > 0 && fwd < n / 2) { const arc = []; for (let j = (t.i + 1) % n; ; j = (j + 1) % n) { arc.push([R[j].X, R[j].Y]); if (j === u.i) break }
        const loop = [...arc, X]; let a2 = 0n; for (let k = 0; k < loop.length; k++) { const p = loop[k], q = loop[(k + 1) % loop.length]; a2 += BigInt(p[0]) * BigInt(q[1]) - BigInt(q[0]) * BigInt(p[1]) }
        if (TRIM_INVERTED ? !(d < 0 ? a2 < 0n : a2 > 0n) : (d < 0 ? a2 < 0n : a2 > 0n)) { out.push(...arc); arc.forEach(q => origin(q, 'trimmed-arc')); stat.trimmedArc = (stat.trimmedArc || 0) + 1; continue } } }
    out.push(X); origin(X, t.flt || u.flt ? 'new-line-join' : 'cut-join'); stat.cutJoin++
    const par = (L, q) => { const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1]; return ((q[0] - L[0][0]) * dx + (q[1] - L[0][1]) * dy) / (dx * dx + dy * dy) }
    DETAIL.set(X[0] + ',' + X[1], { who, t: t.g != null ? { g: t.g, i: t.i } : 'new', u: u.g != null ? { g: u.g, i: u.i } : 'new', ta: +par(A, Xf).toFixed(4), tb: +par(B, Xf).toFixed(4), A, B }) }
  return out.map(([X, Y]) => ({ X, Y }))
}
export const ORIGIN = new Map(), DETAIL = new Map()
let TRIM_INVERTED = false                          // ⛔ the mutant only (setTrimInverted): the side test inverted
export const setTrimInverted = (v) => { TRIM_INVERTED = !!v }
const origin = (p, kind) => { const k = p[0] + ',' + p[1], o = ORIGIN.get(k); ORIGIN.set(k, o && o !== kind ? o + '|' + kind : kind) }
const fcross = (A, B) => { const r = [A[1][0] - A[0][0], A[1][1] - A[0][1]], s = [B[1][0] - B[0][0], B[1][1] - B[0][1]], den = r[0] * s[1] - r[1] * s[0]
  if (!den) throw new Error('⛔ the back-offset: a new line parallel to its neighbour. Refusing.')
  const t = ((B[0][0] - A[0][0]) * s[1] - (B[0][1] - A[0][1]) * s[0]) / den; return [A[0][0] + t * r[0], A[0][1] + t * r[1]] }

export function morph(region, d, who, stat) {
  const raw = region.map((R, g) => rawOffset(R, d, g, (stat.squares ||= [])))
  const F = arrange([raw], w => w[0] > 0, `${who} offset`, true)
  return F.rings.map((E, k) => emit(E, F.tags[k], region, d, who, stat))
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
  const Pt = P.map(r => r.map(q => ({ ...q })))
  // open = morph(P, −h) ∩ P
  const D = morph(Pt, -h, `${what} open`, stat)
  const open = arrange([Pt, D], w => w[0] > 0 && w[1] > 0, `${what} ∩P`).rings
  // closedK = morph(open, +h) ∪ open
  const C = morph(open, h, `${what} close`, stat)
  const taken = pieces(arrange([Pt, open], w => w[0] > 0 && !(w[1] > 0), `${what} taken`).rings)
  const closedK = arrange([open, C], w => w[0] > 0 || w[1] > 0, `${what} closedK`).rings
  const filled = pieces(arrange([closedK, open], w => w[0] > 0 && !(w[1] > 0), `${what} filled`).rings)
  const tf = taken.filter(pp => !isRoundingSliver(toIP(pp))), ff = filled.filter(pp => !isRoundingSliver(toIP(pp)))
  const k = arrange([Pt, tf.flat(), ff.flat()], w => (w[0] > 0 && !(w[1] > 0)) || w[2] > 0, `${what} cut`).rings
  return { paths: toIP(k), rings: k, P: Pt, stat, opened: tf.map(pp => +m2(pp).toFixed(3)), closed: ff.map(pp => +m2(pp).toFixed(3)), slivers: { taken: taken.length - tf.length, filled: filled.length - ff.length } }
}
