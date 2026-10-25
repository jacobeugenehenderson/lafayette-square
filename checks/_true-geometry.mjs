// ⭐ THE TRUE-GEOMETRY SITES OF ①'s SUB-INK EDGES — one predicate, read by both checks that need it, so they cannot drift:
//   checks/claims-no-sub-ink-edge-between-two-owners.mjs (allows a sub-ink edge only at a site)
//   checks/claims-no-corner-at-a-true-geometry-edge.mjs   (no ② corner at a site's edge)
// ① is the exact ε ink of the mint's input polylines. Where two centrelines CROSS (no shared vertex: no node, no cut) near a
// vertex or end of one of them, the exact ink's boundary can have an edge shorter than subInk there; that is the ink's true
// shape, and removing it needs a mm tolerance, so it stays (Boz's ruling, BRIEF-the-ink-meets-inside-the-ink §5a, 2026-10-25).
// ⭐ "Near" is REACH = 2ε + 2 grid steps: a vertex's outline corner points lie up to ε from it and the other stroke's ε side
// passes within ε of the crossing, plus the rounding's own bound (ε off `protopolygon.eps`, the grid off lattice.js; refused by
// name if either is missing). ⛔ Not subInk: that is the EDGE threshold, not the crossing's reach (HPDM's crossing sits 9.2 mm
// from its vertex, past subInk, and makes a 5.1 mm edge). ⛔ Computed from the polylines, never a site list.
// A site is { a, b, x, d, R }: the two skelIds, the crossing point, its distance to the nearest vertex of either, and R = ε / sin(θ/2) + subInk, where θ is the acute angle
// between the two segments. Each of the four points where the two inks' ε sides cross lies ε/sin(θ/2) or ε/cos(θ/2) from x, so
// any edge the exact ink makes at this crossing lies within R of x.
import { CLIP_SCALE } from '../src/lib/lattice.js'   // the partition's grid, from its one home

/** subInk = 2ε less two grid steps (rounding). ⛔ Refuses by name when ε or the grid is missing; never a default. */
export function subInkOf(eps) {
  if (!(eps > 0)) throw new Error('protopolygon carries no ε (eps) — NOT CHECKED')
  if (!(CLIP_SCALE > 0)) throw new Error('src/lib/lattice.js exports no CLIP_SCALE — NOT CHECKED')
  return 2 * eps - 2 / CLIP_SCALE
}

const qk = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`   // the mint's own shared-vertex key (0.1 mm)

/** REACH = 2ε + 2 grid steps: how far from a vertex a crossing can make a sub-ink edge (header). Refuses by name. */
export function reachOf(eps) { subInkOf(eps); return 2 * eps + 2 / CLIP_SCALE }

/** Every true-geometry site among `streets` (ribbons.json streets: the mint's input polylines). */
export function trueGeometrySites(streets, eps) {
  const sub = subInkOf(eps), reach = reachOf(eps), C = 25, G = new Map(), segs = []
  const S = (streets || []).filter(s => s?.points?.length >= 2)
  const verts = S.map(s => new Set(s.points.map(qk)))
  S.forEach((s, si) => { for (let i = 0; i + 1 < s.points.length; i++) { const a = s.points[i], b = s.points[i + 1], id = segs.push({ si, a, b }) - 1
    for (let x = Math.floor(Math.min(a[0], b[0]) / C); x <= Math.floor(Math.max(a[0], b[0]) / C); x++)
      for (let z = Math.floor(Math.min(a[1], b[1]) / C); z <= Math.floor(Math.max(a[1], b[1]) / C); z++) { const k = x + ',' + z; let c = G.get(k); if (!c) G.set(k, c = []); c.push(id) } } })
  const nearestVertex = (P, x) => P.reduce((m, p) => Math.min(m, Math.hypot(p[0] - x[0], p[1] - x[1])), Infinity)
  const out = [], seen = new Set()
  for (const ids of G.values()) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const A = segs[ids[i]], B = segs[ids[j]]; if (A.si === B.si) continue
    const key = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`; if (seen.has(key)) continue; seen.add(key)
    const r = [A.b[0] - A.a[0], A.b[1] - A.a[1]], s = [B.b[0] - B.a[0], B.b[1] - B.a[1]], den = r[0] * s[1] - r[1] * s[0]
    if (!den) continue
    const t = ((B.a[0] - A.a[0]) * s[1] - (B.a[1] - A.a[1]) * s[0]) / den, u = ((B.a[0] - A.a[0]) * r[1] - (B.a[1] - A.a[1]) * r[0]) / den
    if (t < 0 || t > 1 || u < 0 || u > 1) continue
    const x = [A.a[0] + t * r[0], A.a[1] + t * r[1]]
    // a shared vertex is a node or a cut, which the mint outlines; never a true-geometry site
    if (verts[A.si].has(qk(x)) && verts[B.si].has(qk(x))) continue
    const d = Math.min(nearestVertex(S[A.si].points, x), nearestVertex(S[B.si].points, x))
    if (d >= reach) continue
    const cosT = Math.abs(r[0] * s[0] + r[1] * s[1]) / (Math.hypot(...r) * Math.hypot(...s)), half = Math.acos(Math.min(1, cosT)) / 2
    out.push({ a: S[A.si].skelId, b: S[B.si].skelId, x, d, R: eps / Math.sin(half) + sub })
  }
  return out
}

/** The site a sub-ink edge (p→q, owners skelA/skelB) belongs to, or null. */
export function siteOf(sites, skelA, skelB, p, q) {
  return sites.find(s => ((s.a === skelA && s.b === skelB) || (s.a === skelB && s.b === skelA))
    && Math.hypot(p[0] - s.x[0], p[1] - s.x[1]) <= s.R && Math.hypot(q[0] - s.x[0], q[1] - s.x[1]) <= s.R) || null
}
