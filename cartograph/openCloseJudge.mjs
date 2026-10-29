// THE OPEN/CLOSE'S JUDGE, one home (Zob's ruling, 2026-10-29: the runtime net will import it from here): the checks
// (checks/claims-the-open-close-cuts-once.mjs and its Huron ratchet) import it from cartograph/. It judges, it never produces: the
// geometry the kit ships is openClose.mjs's; this only measures it against the DEFINITION and refuses or records.
//   definitionOf · e2e   the DEFINITION: the same operation (P − the open's taken FEATURES ∪ the close's filled FEATURES, a feature
//                        surviving an erode by NODE_BOUND; open = offset(offset(P, −h), +h) ∩ P, close = offset(offset(open, +h), −h)
//                        ∪ open; jtMiter, MiterLimit 2) by clipper-lib on a lattice 1000× FINER, then region to region against the
//                        output: each side's pieces past NODE_BOUND and past 2·NODE_BOUND, counted, m², the largest placed
//   ownEdge              BRIEF §3.1's yardstick: every output edge against the SOURCE is new, own, or a COPY (along a source edge
//                        within COPY_U and not its own edge: a second, re-rounded copy, the defect)
//   crossings · short · topo   crossings left, edges ≤ 2 mm, outer and hole counts
import clipperLib from 'clipper-lib'
import { NODE_BOUND, crossOf } from '../src/lib/latticeNode.js'
const { IntPoint, Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, PolyTree, Paths, JoinType, EndType } = clipperLib
export const ip = (pp) => pp.map(p => p.map(q => (Array.isArray(q) ? new IntPoint(q[0], q[1]) : new IntPoint(q.X, q.Y))))
const F = 1000, bound = NODE_BOUND * F                                                  // OUR rounding bound, on the fine lattice
const up = (pp) => pp.map(p => p.map(q => new IntPoint(q.X * F, q.Y * F)))
const off = (pp, d) => { const co = new ClipperOffset(2), o = new Paths(); co.AddPaths(pp, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, d); return o }
const op = (type, a, b) => { const c = new Clipper(), o = new Paths(); c.AddPaths(a, PolyType.ptSubject, true); if (b) c.AddPaths(b, PolyType.ptClip, true); c.Execute(type, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const piecesOf = (pp) => { const c = new Clipper(), t = new PolyTree(); c.AddPaths(pp, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, t, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const o = []; const w = (n) => { for (const ch of n.Childs()) { o.push([ch.Contour(), ...ch.Childs().map(x => x.Contour())]); for (const hh of ch.Childs()) w(hh) } }; w(t); return o }
const survivesBy = (pp, b) => off(pp, -b).some(q => Clipper.Area(q) > 0)
const area = (pp) => pp.reduce((t, q) => t + Clipper.Area(q), 0)
export const union = (pp) => op(ClipType.ctUnion, pp)
// the definition's k for P (clipper paths in OUR units), on the fine lattice
export function definitionOf(P, stepM) { const Pf = up(op(ClipType.ctUnion, P)), h = (stepM / 2) * 1000 * F
  const open = op(ClipType.ctIntersection, off(off(Pf, -h), h), Pf), closedK = op(ClipType.ctUnion, [...open, ...off(off(open, h), -h)])
  const tf = piecesOf(op(ClipType.ctDifference, Pf, open)).filter(pp => survivesBy(pp, bound)), ff = piecesOf(op(ClipType.ctDifference, closedK, open)).filter(pp => survivesBy(pp, bound))
  let k = tf.length ? op(ClipType.ctDifference, Pf, tf.flat()) : Pf; if (ff.length) k = op(ClipType.ctUnion, [...k, ...ff.flat()]); return k }
// END TO END: an output k (OUR units) against the definition's k for its source P, each side's count and m² past NB and past 2·NB,
// the pieces past 2·NB listed largest first. `def` may be given precomputed (the fine-lattice k), so a mutant reuses it
export function e2e(k, P, stepM, def = definitionOf(P, stepM)) { const K = up(k), out = { list: [] }
  const sides = [...piecesOf(op(ClipType.ctDifference, K, def)).map(pp => ({ pp, side: 'candidate only' })), ...piecesOf(op(ClipType.ctDifference, def, K)).map(pp => ({ pp, side: 'definition only' }))]
  for (const x of sides) { if (!survivesBy(x.pp, bound)) continue; const v = (out[x.side] ||= { nb: 0, nbM2: 0, twoNb: 0, twoNbM2: 0 }), m2 = area(x.pp) / F / F / 1e6
    v.nb++; v.nbM2 += m2; if (!survivesBy(x.pp, 2 * bound)) continue; v.twoNb++; v.twoNbM2 += m2
    const o = x.pp[0]; let cx = 0, cy = 0; for (const q of o) { cx += q.X; cy += q.Y } out.list.push({ side: x.side, m2: +m2.toFixed(5), at: [+(cx / o.length / F / 1000).toFixed(3), +(cy / o.length / F / 1000).toFixed(3)] }) }
  for (const s of ['candidate only', 'definition only']) { const v = (out[s] ||= { nb: 0, nbM2: 0, twoNb: 0, twoNbM2: 0 }); v.nbM2 = +v.nbM2.toFixed(4); v.twoNbM2 = +v.twoNbM2.toFixed(4) }
  out.list.sort((a, b) => b.m2 - a.m2); return out }
// BRIEF §3.1's yardstick. COPY_U is 2 units: the integer re-offset's copies sit 0.6–1.41 units off (the brief, §2), past NODE_BOUND,
// and an edge within 2 mm of a parallel source edge is a rounding, never a feature. An END is good on source edge s if it is one of
// s's own vertices, or a CUT POINT (within NODE_BOUND of s, where the output's neighbouring edge leaves s). ⭐ A RUN of output edges
// along ONE source edge whose every interior vertex lies within NODE_BOUND of s (the noding split s at a hot pixel) is s itself,
// judged by the run's two ends (Zob, 2026-10-29: 103 of Huron's 104 were this kind)
export const COPY_U = 2
export function ownEdge(source, output) {
  const S = []; for (const p of source) for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; if (a.X !== b.X || a.Y !== b.Y) S.push([a, b]) }
  const C = 2000, cells = new Map(), key = (cx, cy) => cx * 1e6 + cy
  S.forEach(([a, b], k) => { for (let cx = Math.floor((Math.min(a.X, b.X) - 2) / C); cx <= Math.floor((Math.max(a.X, b.X) + 2) / C); cx++)
    for (let cy = Math.floor((Math.min(a.Y, b.Y) - 2) / C); cy <= Math.floor((Math.max(a.Y, b.Y) + 2) / C); cy++) { const c = key(cx, cy); (cells.get(c) || cells.set(c, []).get(c)).push(k) } })
  const dist = (q, [a, b]) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((q.X - a.X) * dx + (q.Y - a.Y) * dy) / L2))
    return Math.hypot(q.X - a.X - t * dx, q.Y - a.Y - t * dy) }
  const isV = (q, [a, b]) => (q.X === a.X && q.Y === a.Y) || (q.X === b.X && q.Y === b.Y)
  const out = { own: 0, copy: 0, new: 0, copies: [] }
  for (const p of output) { const n = p.length
    const along = p.map((a, i) => { const b = p[(i + 1) % n]; if (a.X === b.X && a.Y === b.Y) return []
      const cand = new Set([...(cells.get(key(Math.floor(a.X / C), Math.floor(a.Y / C))) || []), ...(cells.get(key(Math.floor(b.X / C), Math.floor(b.Y / C))) || [])])
      return [...cand].map(k => ({ k, d: Math.max(dist(a, S[k]), dist(b, S[k])) })).filter(x => x.d <= COPY_U).sort((x, y) => x.d - y.d).map(x => x.k) })
    for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; if (a.X === b.X && a.Y === b.Y) continue
      if (!along[i].length) { out.new++; continue }
      const good = (q, nb, s) => isV(q, S[s]) || (dist(q, S[s]) <= NODE_BOUND && !nb.includes(s))
      // the run along s through i: extend while the neighbour runs along s and the shared vertex is within NODE_BOUND of s's line
      const at = (k) => ((k % n) + n) % n, splits = (k, s) => dist(p[at(k)], S[s]) <= NODE_BOUND && !isV(p[at(k)], S[s])
      const runOf = (s) => { let lo = i, hi = i                  // edges lo..hi; edge k runs p[k] → p[k + 1]
        while (hi - lo < n - 1 && along[at(lo - 1)].includes(s) && splits(lo, s)) lo--
        while (hi - lo < n - 1 && along[at(hi + 1)].includes(s) && splits(hi + 1, s)) hi++
        return [p[at(lo)], along[at(lo - 1)], p[at(hi + 1)], along[at(hi + 1)]] }
      if (along[i].some(s => { const [A, pv, B, nx] = runOf(s); return good(A, pv, s) && good(B, nx, s) })) out.own++
      else { out.copy++; if (out.copies.length < 5) out.copies.push([[a.X / 1000, a.Y / 1000], [b.X / 1000, b.Y / 1000]]) } } }
  return out }
export function crossings(paths) {
  const E = []; paths.forEach((p, ri) => p.forEach((a, i) => { const b = p[(i + 1) % p.length]; E.push({ ri, i, n: p.length, a: [a.X, a.Y], b: [b.X, b.Y] }) }))
  const C = 4000, cells = new Map(); E.forEach((e, k) => { for (let cx = Math.floor(Math.min(e.a[0], e.b[0]) / C); cx <= Math.floor(Math.max(e.a[0], e.b[0]) / C); cx++) for (let cy = Math.floor(Math.min(e.a[1], e.b[1]) / C); cy <= Math.floor(Math.max(e.a[1], e.b[1]) / C); cy++) { const c = cx * 1e6 + cy; (cells.get(c) || cells.set(c, []).get(c)).push(k) } })
  const seen = new Set(), at = []
  for (const l of cells.values()) for (let u = 0; u < l.length; u++) for (let w = u + 1; w < l.length; w++) { const s = E[l[u]], t = E[l[w]]
    if (s.ri === t.ri && (Math.abs(s.i - t.i) === 1 || Math.abs(s.i - t.i) === s.n - 1)) continue
    const k = l[u] < l[w] ? l[u] + ':' + l[w] : l[w] + ':' + l[u]; if (seen.has(k)) continue; seen.add(k)
    const X = crossOf(s, t); if (X) at.push(X.map(v => v / 1000)) }
  return at }
export const short = (paths) => paths.reduce((t, p) => t + p.filter((a, i) => { const b = p[(i + 1) % p.length]; return Math.hypot(b.X - a.X, b.Y - a.Y) <= 2 }).length, 0)
export const topo = (paths) => { const t = new PolyTree(), c = new Clipper(); c.AddPaths(paths, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, t, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  let outers = 0, holes = 0; const w = (n, depth) => { for (const ch of n.Childs()) { depth % 2 ? holes++ : outers++; w(ch, depth + 1) } }; w(t, 0); return { outers, holes } }
