/**
 * outer-coast.mjs — THE WATER PAST THE TOWN'S RIM, ALONG THE REAL COAST (BRIEF-the-coast-runs-on-past-the-rim,
 * Jacob 2026-10-06, option b; Argon).
 *
 * Past the rim the view runs to the horizon. Where the rim is water, that water used to be carried out in 256 pie
 * slices, each all water or all land — a straight radial water/land edge wherever a wet slice met a dry one, at right
 * angles to the real shore, and lake painted over land (and land over lake) wherever the coast bent. Ruled: past the
 * rim, the water/land boundary FOLLOWS THE REAL COAST — the coast the kit fetched, out to the edge of the fetched
 * square — and from there carries on along the coast's own heading to the horizon's fade.
 *
 * THE CONSTRUCTION, one for a lake, a sea and a river mouth:
 *   1. the coast rings inside the fetched square (coastline.mjs#coastRings — the bake's own coast, closed against the
 *      square's edge, water side chosen there);
 *   2. for each run of a ring along the square's edge (water reaching the square's edge), the region past the square:
 *      bounded by the coast's heading at each end of the run, carried out beyond the horizon, and closed on the far
 *      side — so the water on past the square is bounded by the two coast headings, never by a radial line;
 *   3. a ring that never reaches the square's edge is a body CLOSED inside it (a lake or bay cut by the rim): it ends
 *      at its own far shore and is never extended;
 *   4. the union, minus the town's disc (inside the rim the drawn ground owns the water), inside the horizon's fade.
 * ⭐ Every distance is the town's own: the square is what was fetched, a heading is taken over the last town-radius of
 *    coast, the reach is horizonFor(R).fadeOuter. ⛔ No fallback: a heading that turns back into the square is
 *    REFUSED by name and that run is not extended — never guessed.
 */
import clipperLib from 'clipper-lib'
import { horizonFor } from '../src/lib/horizonReach.js'

const C = clipperLib
const S = 100   // clipper works in integers: centimetres
const toC = (pts) => pts.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) }))
const fromC = (path) => path.map((p) => [+(p.X / S).toFixed(2), +(p.Y / S).toFixed(2)])
const circle = (cx, cz, r, n) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r] })

/** The vertices of `ring` that lie on the square's edge (within `eps` metres). */
const onEdge = (bb, eps) => ([x, z]) => Math.min(Math.abs(x - bb.x0), Math.abs(x - bb.x1), Math.abs(z - bb.z0), Math.abs(z - bb.z1)) < eps

/** Walk `ring` from index `i` in direction `dir` (±1) along non-edge vertices until `len` metres; return that point. */
function backAlong(ring, i, dir, len, isEdge) {
  const n = ring.length
  let acc = 0, cur = ring[i], k = i
  for (let step = 0; step < n; step++) {
    const nk = (k + dir + n) % n, nxt = ring[nk]
    if (isEdge(nxt) && step > 0) break
    const d = Math.hypot(nxt[0] - cur[0], nxt[1] - cur[1])
    if (acc + d >= len) { const t = (len - acc) / (d || 1); return [cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t] }
    acc += d; cur = nxt; k = nk
  }
  return cur
}

/**
 * rings  — [[[x, z], …], …] water rings inside the fetched square (coastRings().rings)
 * bb     — { x0, x1, z0, z1 } the fetched square, town metres
 * center — [x, z]; R — the town's radius
 * Returns { polygons: [{ outer, holes, ring }], exits, rings, refused, fadeOuter }.
 */
export function outerCoast({ rings, bb, center, R, rimSegments = 512 }) {
  const [cx, cz] = center
  const { fadeOuter } = horizonFor(R)
  const FAR = fadeOuter * 2 + Math.hypot(bb.x1 - bb.x0, bb.z1 - bb.z0)   // past the horizon from anywhere in the square
  const isEdge = onEdge(bb, 0.5)
  const exits = [], refused = [], ringInfo = [], subjects = []
  rings.forEach((ring, ri) => {
    const n = ring.length
    const edge = ring.map(isEdge)
    const reaches = edge.some(Boolean)
    ringInfo.push({ ring: ri, vertices: n, reachesSquare: reaches, closed: !reaches })
    subjects.push({ path: ring, ri })
    if (!reaches) return   // a body closed inside the square ends at its own shore
    if (edge.every(Boolean)) {   // water to the square's edge all round: water to the horizon in every direction
      subjects.push({ path: circle(cx, cz, FAR, rimSegments), ri })
      return
    }
    // each run of the ring along the square's edge, between the coast arriving at it and the coast leaving it
    for (let s = 0; s < n; s++) {
      if (!edge[s] || edge[(s - 1 + n) % n]) continue   // s = first edge vertex of a run
      let e = s; while (edge[(e + 1) % n] && (e + 1) % n !== s) e = (e + 1) % n
      const ps = ring[s], pe = ring[e]
      // headings, pointing OUT of the square: the coast arriving at ps (taken over the last town-radius before it),
      // and the coast leaving pe (taken over the first town-radius after it), reversed to point out
      const qs = backAlong(ring, (s - 1 + n) % n, -1, R, isEdge), qe = backAlong(ring, (e + 1) % n, +1, R, isEdge)
      let hs = [ps[0] - qs[0], ps[1] - qs[1]], he = [pe[0] - qe[0], pe[1] - qe[1]]
      const ls = Math.hypot(...hs) || 1, le = Math.hypot(...he) || 1
      hs = [hs[0] / ls, hs[1] / ls]; he = [he[0] / le, he[1] / le]
      // ⛔ a heading that turns back into the square cannot carry the coast on: refused, by name
      const outN = ([x, z]) => Math.abs(x - bb.x0) < 0.5 ? [-1, 0] : Math.abs(x - bb.x1) < 0.5 ? [1, 0] : Math.abs(z - bb.z0) < 0.5 ? [0, -1] : [0, 1]
      const bad = [[ps, hs], [pe, he]].filter(([p, h]) => { const o = outN(p); return h[0] * o[0] + h[1] * o[1] <= 0 })
      exits.push({ ring: ri, at: ps.map((v) => +v.toFixed(1)), heading: +(Math.atan2(hs[1], hs[0]) * 180 / Math.PI).toFixed(1) },
                 { ring: ri, at: pe.map((v) => +v.toFixed(1)), heading: +(Math.atan2(he[1], he[0]) * 180 / Math.PI).toFixed(1) })
      if (bad.length) { refused.push({ ring: ri, at: bad.map(([p]) => p.map((v) => +v.toFixed(1))), why: 'the coast\'s heading at the square\'s edge turns back into the square — not carried on past it' }); continue }
      // the region past the square: ps → out along hs → round the far side → back along he → pe → the edge run back
      const A = [ps[0] + hs[0] * FAR, ps[1] + hs[1] * FAR], B = [pe[0] + he[0] * FAR, pe[1] + he[1] * FAR]
      const ang = (p) => Math.atan2(p[1] - cz, p[0] - cx)
      // sweep from A to B on the side that passes OUTSIDE the edge run (through the run's own direction from the centre)
      const run = []; for (let k = s; ; k = (k + 1) % n) { run.push(ring[k]); if (k === e) break }
      const mid = run[Math.floor(run.length / 2)]
      const a0 = ang(A), a1 = ang(B), am = ang(mid)
      const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      let sweep = norm(a1 - a0)                       // counter-clockwise from A to B
      if (norm(am - a0) > sweep) sweep -= 2 * Math.PI // the run is not on that side: go the other way
      const steps = Math.max(8, Math.ceil(Math.abs(sweep) / (2 * Math.PI) * rimSegments))
      const arc = Array.from({ length: steps + 1 }, (_, i) => { const a = a0 + sweep * i / steps; return [cx + Math.cos(a) * FAR, cz + Math.sin(a) * FAR] })
      subjects.push({ path: [ps, A, ...arc, B, pe, ...run.slice(1, -1).reverse()], ri })
    }
  })
  // per ring: union of the ring and its regions past the square, minus the disc, inside the fade
  const disc = toC(circle(cx, cz, R, rimSegments)), fade = toC(circle(cx, cz, fadeOuter, rimSegments))
  const polygons = []
  for (let ri = 0; ri < rings.length; ri++) {
    const own = subjects.filter((q) => q.ri === ri)
    const cl = new C.Clipper()
    for (const q of own) cl.AddPath(toC(q.path), C.PolyType.ptSubject, true)
    cl.AddPath(fade, C.PolyType.ptClip, true)
    const inFade = new C.Paths()
    cl.Execute(C.ClipType.ctIntersection, inFade, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)
    const cl2 = new C.Clipper()
    cl2.AddPaths(inFade, C.PolyType.ptSubject, true)
    cl2.AddPath(disc, C.PolyType.ptClip, true)
    const tree = new C.PolyTree()
    cl2.Execute(C.ClipType.ctDifference, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)
    const walk = (node) => { for (const ch of node.Childs()) {
      if (!ch.IsHole()) polygons.push({ ring: ri, outer: fromC(ch.Contour()), holes: ch.Childs().map((h) => fromC(h.Contour())) })
      for (const h of ch.Childs()) walk(h) } }
    walk(tree)
  }
  return { fadeOuter, polygons, exits, rings: ringInfo, refused }
}
