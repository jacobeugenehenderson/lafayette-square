// BRIEF-cut-once-in-full-precision §3.1's yardstick (and §4's new check's core): every OUTPUT edge of an open/close, against
// the SOURCE it was given, is one of
//   new  — no source edge has both its ends within COPY_U: a cut side the operation made (a feature's own edge)
//   own  — it runs along a source edge s and each END is either one of s's own vertices or a CUT POINT: within the rounding's
//          bound of s (latticeNode.js#NODE_BOUND, a crossing rounded once) where the output leaves s (its other edge there is
//          new, or along another source edge). The lattice rule, ORIENTATION "Rounding, three kinds" (3): a cut rounds once
//   copy — along s and not own: a second, re-rounded copy of an edge the operation did not change (the defect)
// COPY_U is 2 units: the integer re-offset's copies sit 0.6–1.41 units off (the brief, §2), past NODE_BOUND, and an edge within
// 2 mm of a parallel source edge is a rounding, never a feature. Paths are clipper integer paths ({X, Y}), exact in doubles here.
import { NODE_BOUND } from '../../src/lib/latticeNode.js'
export const COPY_U = 2

export function ownEdge(source, output) {
  const S = []; for (const p of source) for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; if (a.X !== b.X || a.Y !== b.Y) S.push([a, b]) }
  const C = 2000, cells = new Map(), key = (cx, cy) => cx * 1e6 + cy
  S.forEach(([a, b], k) => { for (let cx = Math.floor((Math.min(a.X, b.X) - 2) / C); cx <= Math.floor((Math.max(a.X, b.X) + 2) / C); cx++)
    for (let cy = Math.floor((Math.min(a.Y, b.Y) - 2) / C); cy <= Math.floor((Math.max(a.Y, b.Y) + 2) / C); cy++) { const c = key(cx, cy); (cells.get(c) || cells.set(c, []).get(c)).push(k) } })
  const dist = (q, [a, b]) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((q.X - a.X) * dx + (q.Y - a.Y) * dy) / L2))
    return Math.hypot(q.X - a.X - t * dx, q.Y - a.Y - t * dy) }
  const isV = (q, [a, b]) => (q.X === a.X && q.Y === a.Y) || (q.X === b.X && q.Y === b.Y)
  const out = { own: 0, copy: 0, new: 0, ownM: 0, copyM: 0, copies: [] }
  for (const p of output) {
    const n = p.length
    // pass 1: each edge's source edges (both ends within COPY_U), nearest first
    const along = p.map((a, i) => { const b = p[(i + 1) % n]; if (a.X === b.X && a.Y === b.Y) return []
      const cand = new Set([...(cells.get(key(Math.floor(a.X / C), Math.floor(a.Y / C))) || []), ...(cells.get(key(Math.floor(b.X / C), Math.floor(b.Y / C))) || [])])
      return [...cand].map(k => ({ k, d: Math.max(dist(a, S[k]), dist(b, S[k])) })).filter(x => x.d <= COPY_U).sort((x, y) => x.d - y.d).map(x => x.k) })
    // pass 2: an end is good on s if it is s's vertex, or a cut point where the neighbouring edge does not run along s
    for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; if (a.X === b.X && a.Y === b.Y) continue
      const L = Math.hypot(b.X - a.X, b.Y - a.Y) / 1000
      if (!along[i].length) { out.new++; continue }
      const prev = along[(i - 1 + n) % n], next = along[(i + 1) % n]
      const good = (q, nb, s) => isV(q, S[s]) || (dist(q, S[s]) <= NODE_BOUND && !nb.includes(s))
      const own = along[i].some(s => good(a, prev, s) && good(b, next, s))
      if (own) { out.own++; out.ownM += L } else { out.copy++; out.copyM += L; if (out.copies.length < 20) out.copies.push({ a: [a.X / 1000, a.Y / 1000], b: [b.X / 1000, b.Y / 1000], mm: +(L * 1000).toFixed(3) }) } } }
  out.ownM = +out.ownM.toFixed(3); out.copyM = +out.copyM.toFixed(3)
  return out
}
