// BRIEF-cut-once-in-full-precision §3.1's yardstick (and §4's new check's core): every OUTPUT edge of an open/close, against
// the SOURCE it was given, is one of
//   own  — both ends lie EXACTLY on one source edge (integer cross product 0, within its extent): the source's own line
//   copy — both ends lie within COPY_U of one source edge, and not exactly on it: a second, re-rounded copy of an edge the
//          operation did not change (the defect). COPY_U is 2 units: the integer re-offset's copies sit 0.6–1.41 units off (the
//          brief, §2), past NODE_BOUND (√½), and an edge within 2 mm of a parallel source edge is a rounding, never a feature
//   new  — neither: a cut side the operation made (a feature's own edge)
// Paths are clipper integer paths ({X, Y}); exact in doubles while coordinates stay under 2^26 (they do: |x| < 1e4 m · 1000).
export const COPY_U = 2

export function ownEdge(source, output) {
  const S = []; for (const p of source) for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; if (a.X !== b.X || a.Y !== b.Y) S.push([a, b]) }
  const C = 2000, cells = new Map(), key = (cx, cy) => cx * 1e6 + cy
  S.forEach(([a, b], k) => { for (let cx = Math.floor((Math.min(a.X, b.X) - 2) / C); cx <= Math.floor((Math.max(a.X, b.X) + 2) / C); cx++)
    for (let cy = Math.floor((Math.min(a.Y, b.Y) - 2) / C); cy <= Math.floor((Math.max(a.Y, b.Y) + 2) / C); cy++) { const c = key(cx, cy); (cells.get(c) || cells.set(c, []).get(c)).push(k) } })
  const exact = (q, [a, b]) => { const dx = b.X - a.X, dy = b.Y - a.Y, cr = (q.X - a.X) * dy - (q.Y - a.Y) * dx, dot = (q.X - a.X) * dx + (q.Y - a.Y) * dy
    return cr === 0 && dot >= 0 && dot <= dx * dx + dy * dy }
  const near = (q, [a, b]) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((q.X - a.X) * dx + (q.Y - a.Y) * dy) / L2))
    return Math.hypot(q.X - a.X - t * dx, q.Y - a.Y - t * dy) <= COPY_U }
  const out = { own: 0, copy: 0, new: 0, copies: [] }
  for (const p of output) for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; if (a.X === b.X && a.Y === b.Y) continue
    const cand = new Set([...(cells.get(key(Math.floor(a.X / C), Math.floor(a.Y / C))) || []), ...(cells.get(key(Math.floor(b.X / C), Math.floor(b.Y / C))) || [])])
    let cls = 'new'
    for (const k of cand) { const s = S[k]; if (exact(a, s) && exact(b, s)) { cls = 'own'; break } if (near(a, s) && near(b, s)) cls = 'copy' }
    out[cls]++; if (cls === 'copy' && out.copies.length < 20) out.copies.push({ a: [a.X / 1000, a.Y / 1000], b: [b.X / 1000, b.Y / 1000], mm: +(Math.hypot(b.X - a.X, b.Y - a.Y)).toFixed(3) }) }
  return out
}
