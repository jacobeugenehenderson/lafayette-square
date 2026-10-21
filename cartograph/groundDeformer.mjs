// groundDeformer.mjs — THE GROUND'S TERRAIN HEIGHT NEAR THE STREETS (BRIEF-the-ground-knows-its-height §5 step 2).
//
// ⭐ ONE CONTINUOUS FUNCTION OF POSITION, D(x, z), raw metres like terrain.bin (the runtime multiplies it by uExag). The
// kerb is NOT in it: the kerb is the mesh's own y, unexaggerated (`kerbLift.mjs`), and D is continuous across the kerb
// face, so the only step in the drawn ground is the kerb's, which lives where the curb meets the road.
// ⭐ THE CARRIER IS ②, the curb contour uncut (`tile.iaFull`, the stamps' own ring), never ①'s sharp runs: ② is smooth through its corner
// fillets, so a point's nearest station on it does not jump at a corner. Its height H is the line's, asked at the point
// (`lineHeight.mjs`, through the edge's own owner), and on a CORNER ARC (`iaArc`) H is blended along the arc's own length
// between its two tangent points — the
// owner changes along a fillet, and blending is what keeps H one continuous value through the change (A10: a corner is a
// slice of one continuous band, not a join).
// ⭐ THE PROFILE, read off the DRAWN bands (authoring included) along the ray from the station into the block:
//   road (the street side of ②) → THE SWEEP, below · curb → H · then THE GIRDLE (Jacob, 2026-10-11): the ped band takes up the rise R from
//   H to the terrain at its back edge, the walk at most its limit (`walk.crossSlopeMax`) and the lawn at most its own
//   (`lawn.slopeMax`), both divided by the town's exaggeration ceiling so they hold as DRAWN · whatever is left is eased
//   LINEARLY into the terrain over B (`design.json#groundBlendM`, else one terrain grid step) · past that, the terrain.
// ⭐ THE ROAD IS SWEPT FROM ① TO ② (Boz, 2026-10-17): a road point P takes D = (1 − s)·L(P) + s·H②(q), s = d① / (d① + d②),
//   q its nearest point on ②. L is ①'s own height at P: the line of the street whose ① edge it lies beside (`tile.ringOwner`,
//   the edge's own label), so the road is exactly the line on ① and exactly ② at the curb, and a corner arc reaches the road
//   only through H②. Near a ① vertex where the owner changes, L blends the owners' lines (THE OWNERS' BLEND, below). The ink
//   (① between tiles, `shape.json#ink`) takes its owners' lines the same way, so the road meets itself on the centreline.
// ⛔ Outside every tile and every ink piece (the sea, the rim's perimeter beyond the disc) D is null: the caller draws the
//   terrain there and COUNTS it.

import { LATTICE_M as LATTICE } from '../src/lib/lattice.js'   // the partition's own grid: crossings closer than LATTICE are one crossing point

const sq = (x) => x * x
const SIDESTEP = 1e-5   // metres: far below the 1 mm lattice, far above float64 noise
const ulp32 = (v) => 2 ** (Math.floor(Math.log2(Math.max(Math.abs(v), 1))) - 23)   // a float32's spacing at v
// ⭐ THE WALK'S LIMIT IS SHARED, HALF AND HALF: the profile may tilt a walk by at most half of it; the other half is the
// DRAWING's — the chord error of the triangles that carry the profile, which the bake refines against (`refineTol`).
const WALK_SHARE = 0.5   // derived, not free (Boz, 2026-10-11): the profile's tilt and the mesh's chord error share the town's own walk norm

/** @param tiles shape.json tiles (runs and caps carry their chain's name, `skelId`, and `noLine` where it has none; `ringOwner`
 *  per ① edge) · @param ink shape.json `ink`: [{ rings, owners }], ① between the tiles as owned pieces · @param bands { curb, lawn, walk }: arrays of {outer, holes}|ring, AS
 *  PAINTED (before the flatten punches overlays through them) · @param stencil the town's disc ring (beyond it nothing is
 *  drawn: the rim is an edge of the drawing, never a lot) · @param raw (x, z) → terrain raw
 *  @param line { heightAt(skelId, [x, z]) → the line's raw height, step } (lineHeight.mjs, the coast's high water folded in by the caller)
 *  @param limits { walkMax, lawnMax (null = none), exag, blend } · @param town the scene, named in every refusal
 *  @param legs per tile, each perpendicular corner's own ground with the leg edge that built it ([{ tile, perp: [{ cls, kind,
 *  si, i, atEnd, spans, rings }] }], tileGround's `bandPiecesOfTile` `perp`, live — never frozen) · @param rims per tile index, its ①
 *  ring noded with its paint's own rim crossings ({ ring, owners }, tileGround's `rimRings`, live); a tile with none reads its own ring */
// ⭐ THE MEMO IS BOUNDED BY THE RUNTIME, NOT BY A TOWN. A V8 Map holds at most 2^24 entries (measured: node 22 throws
// `RangeError: Map maximum size exceeded` at the 16,777,217th) and Provincetown's conformity asks more distinct points than
// that (2026-10-21). At the cap the memo is CLEARED and a fresh one starts: memory stays one Map's worth, and a point asked
// again is recomputed (the answer is a function of the exact point, so it is the same answer). A town under the cap never
// turns and pays nothing. ⛔ After a turn the counters in `stats` count RESOLVES, not distinct points; the turn is printed and
// bake-ground writes `memoTurns` into ground.json's deform block. `memoCap` exists for the turn test.
// ▶ checks/claims-the-ground-height-is-a-function-of-the-point.mjs
export const V8_MAP_MAX_ENTRIES = 2 ** 24

export function buildDeformer({ town, tiles, ink, bands, stencil = null, raw, line, limits, legs = [], rims = [], memoCap = V8_MAP_MAX_ENTRIES }) {
  if (!Number.isInteger(memoCap) || memoCap < 1 || memoCap > V8_MAP_MAX_ENTRIES) throw new Error(`groundDeformer: the memo cap must be 1…${V8_MAP_MAX_ENTRIES} answers (V8's Map cap), got ${memoCap}`)
  if (!town) throw new Error('groundDeformer: the caller names no town — a refusal could not say where')
  if (typeof line?.heightAt !== 'function' || !(line.step > 0)) throw new Error(`groundDeformer: ⛔ ${town}: the caller passes no line (lineHeight.mjs: heightAt and its station step) — ② cannot take its height`)
  if (!Array.isArray(ink)) throw new Error(`groundDeformer: ⛔ ${town}: the caller passes no ink (shape.json \`ink\`, ① between the tiles as owned pieces; a --legacy freeze carries none) — the road on the centreline has no owner`)
  const { walkMax, lawnMax, exag, blend, sigma } = limits
  if (!(sigma > 0)) throw new Error(`groundDeformer: the smoothing window must be metres > 0, got ${sigma}`)
  if (!(blend > 0)) throw new Error(`groundDeformer: the blend must be metres > 0, got ${blend}`)
  if (!(exag > 0)) throw new Error(`groundDeformer: the exaggeration ceiling must be > 0, got ${exag}`)
  if (!(walkMax >= 0)) throw new Error('groundDeformer: the town names no walk cross-slope limit — the girdle cannot hold the walk level')
  const stats = { memoTurns: 0, frameExempt: 0, noFull: 0, stations: 0, absorbClamped: 0, tiles: 0, onTerrain: 0, arcBlended: 0, outside: 0, deep: 0, evaluated: 0, rays: 0, eased: 0, lawnFull: 0, byBand: 0, unowned: 0,
    road: 0, roadBlended: 0, ink: 0, inkCrossing: 0, inkOnGrid: 0, byLeg: 0, legCross: 0, legCrossMaxDH: 0, rayAndLeg: 0, legNotHeld: 0 }

  // ── the band boundaries, as segments in a grid, one class each ──
  const CELL = 8
  const segGrid = new Map()
  // ⭐ A POINT IS IN A CLASS WHEN SOME PAINTED PIECE OF IT HOLDS THE POINT. Parity runs within one piece (its outer and its
  //   holes), never across a class: two pieces of one class that overlap (two lawns' land uses, a curb and a curb cut) would
  //   otherwise read as OUT where they overlap, which is a lot that isn't there (measured, HPDM 2026-10-12).
  // ⛔ THE RINGS A POINT IS TESTED AGAINST ARE THE DEFORMER'S OWN: copied at build and frozen, so the row index each one
  // keeps (`rowIndex`) can never go stale under a caller that edits its geometry afterwards; the deformer's own writes throw.
  const frozenCopy = (r) => Object.freeze(r.map(p => Object.freeze([p[0], p[1]])))
  let nItems = 0
  const ringsOf = (items) => (items || []).flatMap(it => { const item = nItems++
    return (Array.isArray(it?.[0]) && typeof it[0][0] === 'number' ? [it] : [it.outer, ...(it.holes || [])]).filter(r => r?.length >= 3).map(r => ({ r: frozenCopy(r), item })) })
  const classRings = { curb: ringsOf(bands.curb), lawn: ringsOf(bands.lawn), walk: ringsOf(bands.walk) }
  const addSeg = (cls, a, b, item = -1) => {
    const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL)
    const z0 = Math.floor(Math.min(a[1], b[1]) / CELL), z1 = Math.floor(Math.max(a[1], b[1]) / CELL)
    const s = { cls, a, b, item }
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 1000003 + z; (segGrid.get(k) || segGrid.set(k, []).get(k)).push(s) }
  }
  for (const [cls, rings] of Object.entries(classRings)) for (const { r, item } of rings) for (let i = 0; i < r.length; i++) addSeg(cls, r[i], r[(i + 1) % r.length], item)
  const disc = stencil?.length >= 3 ? frozenCopy(stencil) : null
  // ⭐ EVEN-ODD THROUGH A ROW INDEX, per ring: an edge can cross the ray at z only if z lies in its own z-span, so each ring
  // keeps its edges by row (as many rows as edges, over its z-extent) and a point tests only its row's edges. The same
  // test on the same edges, in the same arithmetic, as walking the whole ring: the answer is identical, only cheaper (a
  // curb piece runs to thousands of vertices). Built on first use, held by the ring.
  const rowsOf = new WeakMap()
  const rowIndex = (r) => { let ix = rowsOf.get(r); if (ix) return ix
    const n = r.length; let z0 = Infinity, z1 = -Infinity; for (const p of r) { if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1] }
    const h = (z1 - z0) / n, row = (z) => Math.min(n - 1, Math.max(0, Math.floor((z - z0) / h))), rows = Array.from({ length: n }, () => [])
    if (h > 0) for (let i = 0, j = n - 1; i < n; j = i++) { const zi = r[i][1], zj = r[j][1]; if (zi === zj) continue
      for (let k = row(Math.min(zi, zj)), k1 = row(Math.max(zi, zj)); k <= k1; k++) rows[k].push(i) }
    rowsOf.set(r, ix = { z0, z1, h, row, rows }); return ix }
  const ringOdd = (x, z, r) => { const ix = rowIndex(r); if (!(ix.h > 0 && z >= ix.z0 && z <= ix.z1)) return false
    let c = false
    for (const i of ix.rows[ix.row(z)]) { const j = i === 0 ? r.length - 1 : i - 1, [xi, zi] = r[i], [xj, zj] = r[j]
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c }
    return c }
  const pipRings = (x, z, rings) => { let c = false; for (const r of rings) if (ringOdd(x, z, r)) c = !c; return c }
  // ⭐ A SEGMENT WHOLLY OUTSIDE THE DISC: both ends outside it and no crossing of its edge (the disc's own segments).
  // ⛔ No disc, nothing is outside it.
  const outsideDisc = (a, b) => { if (!disc || pipRings(a[0], a[1], [disc]) || pipRings(b[0], b[1], [disc])) return false
    const sx = b[0] - a[0], sz = b[1] - a[1]
    for (let k = 0; k < disc.length; k++) { const ga = disc[k], gb = disc[(k + 1) % disc.length], gx = gb[0] - ga[0], gz = gb[1] - ga[1], den = sx * gz - sz * gx; if (Math.abs(den) < 1e-15) continue
      const wx = ga[0] - a[0], wz = ga[1] - a[1], t = (wx * gz - wz * gx) / den, v = (wx * sz - wz * sx) / den
      if (t >= 0 && t <= 1 && v >= 0 && v <= 1) return false }
    return true }
  // per-class point-in-polygon through a coarse ring index (rings by bbox cell)
  const ringIdx = {}
  for (const [cls, rings] of Object.entries(classRings)) {
    const g = new Map(); ringIdx[cls] = g
    rings.forEach(({ r, item }) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
      for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) }
      const bb = [a, b, c, d]
      for (let x = Math.floor(a / 64); x <= Math.floor(c / 64); x++) for (let z = Math.floor(b / 64); z <= Math.floor(d / 64); z++) { const k = x * 1000003 + z; (g.get(k) || g.set(k, []).get(k)).push({ r, bb, item }) } })
  }
  // the pieces of a class holding (x, z): each piece's own even-odd over its outer and holes
  const itemsAt = (cls, x, z) => { const odd = new Set()
    for (const { r, bb, item } of ringIdx[cls].get(Math.floor(x / 64) * 1000003 + Math.floor(z / 64)) || []) {
      if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) continue
      if (ringOdd(x, z, r)) { if (odd.has(item)) odd.delete(item); else odd.add(item) } }
    return odd }
  const inClass = (cls, x, z) => itemsAt(cls, x, z).size > 0

  // ── ①'s OWNERS: who a road point's line belongs to ──
  // An owner is a ① edge's own label (`tile.ringOwner`) or an ink piece's (`ink[].owners`): a street's chain, the rim, the
  // coast. Its line at a point: the chain's (`line.heightAt`), the high water on the coast; the TERRAIN for an owner with no
  // at-grade line — the highway, a grade-separated chain (Jacob, 2026-10-17), the rim (the edge of the drawing). ⛔ A chain
  // the line does not know throws: never a neighbour's height.
  const bridges = new Set()
  for (const t of tiles || []) { for (const o of t?.ringOwner || []) if (o?.gradeSeparated) bridges.add(o.skelId)
    for (const r of t?.runs || []) if (r?.noLine === 'bridge') bridges.add(r.skelId) }
  const ownedBy = new Map()
  const owned = (o, where) => {
    const id = typeof o === 'string' ? o : o?.kind === 'rim' ? '__rim__' : o?.kind === 'water' ? '__water__' : o?.skelId
    if (!id) throw new Error(`groundDeformer: ⛔ ${town}: ${where} names no owner — its road has no line`)
    let w = ownedBy.get(id); if (w) return w
    const terrain = id === '__rim__' || id === '__highway__' || id === '__boundary__' || bridges.has(id) || o?.gradeSeparated === true
    ownedBy.set(id, w = { id, ground: !terrain || id === '__rim__', at: terrain ? (x, z) => raw(x, z) : (x, z) => { const v = line.heightAt(id, [x, z])
      if (v == null) throw new Error(`groundDeformer: ⛔ ${town}: ① owner ${id} (${where}) has no line and no rule for its class — the road at (${x.toFixed(2)}, ${z.toFixed(2)}) has no height`)
      return v } })
    return w }
  // the owned ① segments, in a grid of CELL cells: every tile's ① edges, and every single-owner ink piece's boundary
  const addOwned = (grid, p, q, o) => { const s = { p, q, o }
    const x0 = Math.floor(Math.min(p[0], q[0]) / CELL), x1 = Math.floor(Math.max(p[0], q[0]) / CELL), z0 = Math.floor(Math.min(p[1], q[1]) / CELL), z1 = Math.floor(Math.max(p[1], q[1]) / CELL)
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 1000003 + z; (grid.get(k) || grid.set(k, []).get(k)).push(s) } }
  const oneGrid = new Map()
  const segD = (s, x, z) => { const dx = s.q[0] - s.p[0], dz = s.q[1] - s.p[1], L2 = dx * dx + dz * dz
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - s.p[0]) * dx + (z - s.p[1]) * dz) / L2)) : 0
    return Math.hypot(x - s.p[0] - u * dx, z - s.p[1] - u * dz) }
  // the owners whose ① segments in `grid` lie within maxD of (x, z): Map owner → its nearest distance
  const ownersNear = (grid, x, z, maxD) => { const by = new Map(), R = Math.ceil(maxD / CELL), cx = Math.floor(x / CELL), cz = Math.floor(z / CELL)
    for (let ix = cx - R; ix <= cx + R; ix++) for (let iz = cz - R; iz <= cz + R; iz++) for (const s of grid.get(ix * 1000003 + iz) || []) {
      const d = segD(s, x, z); if (d <= maxD && !(by.get(s.o) <= d)) by.set(s.o, d) }
    return by }
  // the nearest ① segment in `grid` to (x, z), searching rings of cells outward to maxD: { o, d } or null
  const nearestOwned = (grid, x, z, maxD, only = null) => { let best = null, bd = Infinity
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), R = Math.ceil(maxD / CELL) + 1
    for (let r = 0; r <= R; r++) {
      for (let ix = cx - r; ix <= cx + r; ix++) for (let iz = cz - r; iz <= cz + r; iz++) {
        if (Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== r) continue
        for (const s of grid.get(ix * 1000003 + iz) || []) { if (only && s.o !== only) continue; const d = segD(s, x, z); if (d < bd) { bd = d; best = s.o } } }
      if (best && bd <= r * CELL) break }
    return best && bd <= maxD ? { o: best, d: bd } : null }
  // ⭐ THE OWNERS' BLEND: L(P) = Σ w_k·line_k(P) / Σ w_k over the owners near P, w_k = (W − d_k)⁺ / d_k, d_k P's distance to
  // owner k's own ① edges. On an owner's own edge (d_k = 0) L is exactly its line; across the bisector of two owners it is
  // one continuous value (no Voronoi step); and an owner farther than W adds nothing, so away from a ① vertex L is the one
  // owner's line. W is the reach the caller measures at P (the road's own width there: d① + d②); with no reach (the ink's
  // crossings, a few ε across, every owner named) w_k = 1 / d_k. ⛔ Pure 1/d on the road never reduces to one owner: a
  // point h from its ① edge and r along it from the corner keeps h/(h + r) of the other owner, so the road would stand off
  // its own line by → h × its grade, however far along. One rule, no junction branch.
  const lineBlend = (by, x, z, W = Infinity) => { let on = null, sw = 0, sv = 0
    for (const [o, d] of by) { if (d < 1e-9) { (on ??= []).push(o); continue }
      const w = (W === Infinity ? 1 : Math.max(0, W - d)) / d; if (w > 0) { sw += w; sv += w * o.at(x, z) } }
    if (on) return on.reduce((a, o) => a + o.at(x, z), 0) / on.length
    if (sw > 0) return sv / sw
    let nk = null, nd = Infinity; for (const [o, d] of by) if (d < nd) { nd = d; nk = o }
    return nk.at(x, z) }

  // ── the tiles: their ① ring (which tile holds a point), ② with H per edge ──
  const T = []
  const TCELL = 64, tileGrid = new Map()
  for (const [ti, t] of (tiles || []).entries()) {
    if (!(t?.ring?.length >= 3) || !t.iA?.length) continue
    // ⭐ THE CARRIER IS `iaFull`, ② UNCUT: `iaStamp` and `iaArc` are parallel to IT, never to `iA` (the cut ring the block is
    // drawn with — measured on HPDM: iA and iaFull differ on 237 of 266 rings). A tile without it cannot name its runs.
    if (!t.iaFull?.length || !t.iaStamp?.length) { stats.noFull++; continue }
    // ⛔ ① WITH NO OWNERS cannot sweep its road: the road side's line is its ① edge's own (`ringOwner`, one per edge)
    if (t.ringOwner?.length !== t.ring.length) throw new Error(`groundDeformer: ⛔ ${town}: the tile whose ① ring starts at (${t.ring[0][0].toFixed(1)}, ${t.ring[0][1].toFixed(1)}) carries ${t.ringOwner?.length ?? 'no'} ① owner(s) for ${t.ring.length} edge(s) — its road has no line (tileGround's \`ringOwner\`)`)
    // ⭐ THE LINE IS ASKED AT THE POINT (Boz, 2026-10-17): a point of ② takes its height from the line of the edge's OWN
    // owner, AT THAT POINT — `line.heightAt(skelId, p)`, a projection onto the NAMED chain (the edge's label carries the name:
    // A15-legal). ⛔ Never a height interpolated between ② vertices: ② runs straight for hundreds of metres, and its two ends
    // were carried across the terrain between them (HPDM: 92% of the ② stations more than 1 m off their terrain sat on
    // edges over 20 m; one 300 m edge of maryland-avenue-1 stood 2.4 m over its own line). Each straight edge holds its line
    // sampled at the line's own station spacing (`line.step`), so what is read between two samples is what lineHeight
    // interpolates itself. An edge whose owner has no at-grade line (a `__highway__` edge, a grade-separated chain's run:
    // bake-ground's `noLine`) takes THE TERRAIN UNDER IT, raw(x, z) at the point (Jacob, 2026-10-17): the highway and the
    // bridge are not on the ground, and the block edge beside them is the ground there.
    const runs = t.runs || []
    const rings = []
    t.iaFull.forEach((ring, ri) => {
      if (!(ring?.length >= 3)) return
      const n = ring.length, arc = t.iaArc?.[ri] || [], stamp = t.iaStamp?.[ri] || [], cap = t.iaCap?.[ri] || []
      const onTerrain = (o) => o.noLine === 'highway' || o.noLine === 'bridge'
      // the owner of edge i (vertex i → i+1): its run (`iaStamp`), else its dead-end cap (`iaCap`: an end coupler of its own
      // chain, never a run), else none
      const ownerOf = (i) => stamp[i] != null ? runs[stamp[i]] ?? null : cap[i] != null ? t.caps?.[cap[i]] ?? null : null
      const hOf = (o, p) => !o ? null : onTerrain(o) ? raw(p[0], p[1]) : o.noLine ? null : line.heightAt(o.skelId, p)
      const isArcEdge = (i) => arc[i] != null && arc[(i + 1) % n] === arc[i]
      const at = (i, u) => { const p = ring[i], q = ring[(i + 1) % n]; return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u] }
      const len = (i) => { const p = ring[i], q = ring[(i + 1) % n]; return Math.hypot(q[0] - p[0], q[1] - p[1]) }
      const E = new Array(n)
      let refused = null   // the first edge with no height: { k, o, arcId, end }
      // ⭐ A FRAME EDGE OUTSIDE THE DRAWING HAS NO HEIGHT TO GIVE (Jacob, 2026-10-20): an edge whose run is the frame's
      // (`__boundary__`) and which lies WHOLLY outside the disc is not part of the drawing (①'s blocks run to the fetch frame,
      // and ② is carried uncut). It takes no height and leaves the nearest-span search and the stations along ②, and a corner
      // arc wholly outside the disc with such an edge at a tangent goes with it. ⛔ The same edge inside the disc still refuses
      // (the frame must contain the disc), and so does an unstamped edge: no rim height, no fallback.
      const exempt = new Uint8Array(n)
      for (let i = 0; i < n; i++) { const o = ownerOf(i); if (o?.skelId === '__boundary__' && !isArcEdge(i) && outsideDisc(ring[i], ring[(i + 1) % n])) exempt[i] = 1 }
      // ⭐ A CORNER ARC blends by ITS OWN arclength between its two tangent points (its first and last vertex), each end the
      // line's h there read through the straight edge that meets it — so H is one continuous value round the fillet, where
      // the owner changes. ⛔ The approach edges never count: counted (fb953109), an arc's first vertex took nearly the far
      // end's height (HPDM: 641 of 1,085 arcs had approaches longer than themselves, up to 772 m against an arc of ~7 m).
      for (let i = 0; i < n; i++) {
        if (!isArcEdge(i) || isArcEdge((i + n - 1) % n)) continue          // i is an arc's first tangent point
        const span = []; let j = i, L = 0
        while (isArcEdge(j % n) && span.length < n) { span.push(j % n); L += len(j % n); j++ }
        const A = i, B = j % n, oA = ownerOf((A + n - 1) % n), oB = ownerOf(B)
        if ((exempt[(A + n - 1) % n] || exempt[B]) && span.every(k => outsideDisc(ring[k], ring[(k + 1) % n]))) { for (const k of span) exempt[k] = 1; continue }
        const hA = hOf(oA, ring[A]), hB = hOf(oB, ring[B])
        if (hA == null || hB == null) { refused ??= { k: hA == null ? A : B, o: hA == null ? oA : oB, arcId: arc[i], end: true }; continue }
        let s0 = 0; for (const k of span) { E[k] = { arc: true, s0, len: len(k), L, hA, hB }; s0 += len(k) }
        stats.arcBlended += span.length
      }
      for (let i = 0; i < n; i++) { if (E[i] || exempt[i]) continue
        const o = ownerOf(i)
        if (!o || o.noLine && !onTerrain(o) || isArcEdge(i)) { refused ??= { k: i, o, arcId: isArcEdge(i) ? arc[i] : null }; continue }
        if (onTerrain(o)) { E[i] = { terrain: true }; stats.onTerrain++; continue }
        const m = Math.max(1, Math.ceil(len(i) / line.step)), h = new Float64Array(m + 1)
        for (let j = 0; j <= m; j++) { const v = line.heightAt(o.skelId, at(i, j / m)); if (v == null) { refused ??= { k: i, o }; break } h[j] = v }
        E[i] = { h, m }
      }
      // ⛔ A ② EDGE WITH NO HEIGHT THROWS: unstamped (② lost its run's label), or on a run with no line and no rule (the rim,
      // a label naming no chain). Never a neighbour's height: filled so, a highway edge carried one street's end 906 m along ②
      // and stood the asphalt 23.8 m under its terrain (HPDM, 2026-10-17)
      if (refused) { const { k, o, arcId, end } = refused, p = ring[k], c = t.ring.reduce((s, q) => [s[0] + q[0] / t.ring.length, s[1] + q[1] / t.ring.length], [0, 0])
        throw new Error(`groundDeformer: ⛔ ${town}: the ② edge from (${p[0].toFixed(3)}, ${p[1].toFixed(3)}) has no height — ${o ? `its ${(t.caps || []).includes(o) ? 'dead-end cap' : 'run'} ${o.skelId} (${o.side ?? '?'} · segOrd ${o.segOrd ?? '?'}) carries no line${o.noLine ? ` (${o.noLine})` : ''} and no rule for that class` : `it carries no run and no cap (iaStamp and iaCap empty there)`}${end ? ` — a tangent point of corner arc ${arcId}, so the arc cannot be blended` : arcId != null ? `, on corner arc ${arcId}` : ''} · in the tile whose ① ring centres on (${c[0].toFixed(1)}, ${c[1].toFixed(1)}), ② ring ${ri} · vertex ${k} of ${n}`) }
      // the height at parameter u along edge i
      const Hat = (i, u) => { const e = E[i]
        if (e.arc) return e.L > 0 ? e.hA + (e.hB - e.hA) * (e.s0 + u * e.len) / e.L : e.hA
        if (e.terrain) { const p = at(i, u); return raw(p[0], p[1]) }
        const f = u * e.m, j = Math.min(e.m - 1, Math.floor(f)); return e.h[j] + (f - j) * (e.h[j + 1] - e.h[j]) }
      if (exempt.some(v => v)) stats.frameExempt += exempt.reduce((a, v) => a + v, 0)
      rings.push({ ring, Hat, stamp, arc, t: ti, k: ri, exempt })
    })
    if (!rings.length) continue
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
    for (const [x, z] of t.ring) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) }
    const rec = { ti, ring: frozenCopy(t.ring), iA: t.iA.filter(r => r?.length >= 3).map(frozenCopy), full: t.iaFull.filter(r => r?.length >= 3).map(frozenCopy), rings, bb: [a, b, c, d], segs: new Map(), one: new Map(), diag: Math.hypot(c - a, d - b) }
    for (let i = 0; i < t.ring.length; i++) { const o = owned(t.ringOwner[i], `① edge ${i} of the tile whose ring starts at (${t.ring[0][0].toFixed(1)}, ${t.ring[0][1].toFixed(1)})`)
      addOwned(rec.one, rec.ring[i], rec.ring[(i + 1) % t.ring.length], o); addOwned(oneGrid, rec.ring[i], rec.ring[(i + 1) % t.ring.length], o) }
    for (const R of rings) for (let i = 0; i < R.ring.length; i++) { if (R.exempt[i]) continue
      const p = R.ring[i], q = R.ring[(i + 1) % R.ring.length], s = { p, q, R, i }
      const x0 = Math.floor(Math.min(p[0], q[0]) / CELL), x1 = Math.floor(Math.max(p[0], q[0]) / CELL), z0 = Math.floor(Math.min(p[1], q[1]) / CELL), z1 = Math.floor(Math.max(p[1], q[1]) / CELL)
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 1000003 + z; (rec.segs.get(k) || rec.segs.set(k, []).get(k)).push(s) }
    }
    T.push(rec); stats.tiles++
    for (let x = Math.floor(a / TCELL); x <= Math.floor(c / TCELL); x++) for (let z = Math.floor(b / TCELL); z <= Math.floor(d / TCELL); z++) { const k = x * 1000003 + z; (tileGrid.get(k) || tileGrid.set(k, []).get(k)).push(rec) }
  }
  // ⭐ BEYOND IS PAST THE DRAWING'S OWN RIM (BRIEF-the-rim-is-cut-once (B), Boz 2026-10-21: "the drawing decides"). The rim is
  // each rim tile's ① ring edges the disc cut made (`ringOwner` { kind: 'rim' }), which carry the block's own rim crossings
  // (tileGround's `shareRimCrossings`), so the paint, cut by that block, meets them with no lot between. ⛔ Never the stencil's
  // exact chord: the cut rounds its crossings up to √2/2 step off it, and a ray meeting the rim 65° off its normal read the
  // wedge between as ~1.1 mm of lot (HPDM B1: 341 points). A tile with no rim edge has no beyond.
  // ⭐ and where the paint minted its own rim crossings, the rim is the painter's NODED ring (`rims`, live): the paint's rim is
  // then a piece of it, so a ray from past the rim enters paint with nothing between (HPDM tile 49's 7.7 mm wedge)
  for (const t of T) { const N = rims?.[t.ti], R = N?.ring?.length >= 3 ? frozenCopy(N.ring) : t.ring, O = N?.ring?.length >= 3 ? N.owners : tiles[t.ti].ringOwner, n = R.length
    t.rim = false; t.rimRing = R
    for (let i = 0; i < n; i++) if (O[i]?.kind === 'rim') { t.rim = true; addSeg('beyond', R[i], R[(i + 1) % n]) } }
  const recOf = new Map(T.map(r => [r.ti, r]))
  // ── THE INK: ① between the tiles, as owned pieces (`shape.json#ink`) ──
  // ⭐ A piece is one NONZERO region (a hole wound against its outer), so a point is in it where the winding of its rings is
  // not 0. A single owner's piece is that owner's ① too: its boundary joins the owned segments, so a crossing reads every
  // owner's distance to the owner's own ① (a tile edge, or its own ink).
  const windingAt = (x, z, r) => { const ix = rowIndex(r); if (!(ix.h > 0 && z >= ix.z0 && z <= ix.z1)) return 0
    let w = 0
    for (const i of ix.rows[ix.row(z)]) { const j = i === 0 ? r.length - 1 : i - 1, [xi, zi] = r[i], [xj, zj] = r[j]
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) w += zi > zj ? 1 : -1 }
    return w }
  const inkGrid = new Map()
  for (const [pi, piece] of ink.entries()) {
    const rings = (piece?.rings || []).filter(r => r?.length >= 3).map(frozenCopy)
    if (!rings.length) continue
    if (!(piece.owners?.length >= 1)) throw new Error(`groundDeformer: ⛔ ${town}: ink piece ${pi} (at (${rings[0][0][0].toFixed(2)}, ${rings[0][0][1].toFixed(2)})) names no owner — the road on the centreline there has no line`)
    // ⭐ A BRIDGE IS NOT ON THE GROUND (lineHeight.mjs; Boz, 2026-10-17): where a piece's owners include an at-grade one, the
    // ground is the at-grade owners' alone — the grade-separated chain or highway passing over contributes nothing to D (it is
    // its own object above). A piece of only grade-separated owners keeps their rule, the terrain.
    const all = piece.owners.map(o => owned(o, `ink piece ${pi}`)), owners = all.some(o => o.ground) ? all.filter(o => o.ground) : all
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
    for (const r of rings) for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) }
    const rec = { pi, rings, owners, bb: [a, b, c, d] }
    if (owners.length === 1) for (const r of rings) for (let i = 0; i < r.length; i++) addOwned(oneGrid, r[i], r[(i + 1) % r.length], owners[0])
    for (let x = Math.floor(a / TCELL); x <= Math.floor(c / TCELL); x++) for (let z = Math.floor(b / TCELL); z <= Math.floor(d / TCELL); z++) { const k = x * 1000003 + z; (inkGrid.get(k) || inkGrid.set(k, []).get(k)).push(rec) }
  }
  const inkAt = (x, z) => { for (const p of inkGrid.get(Math.floor(x / TCELL) * 1000003 + Math.floor(z / TCELL)) || []) {
    if (x < p.bb[0] || x > p.bb[2] || z < p.bb[1] || z > p.bb[3]) continue
    let w = 0; for (const r of p.rings) w += windingAt(x, z, r); if (w !== 0) return p } return null }
  // how far a crossing's owner may be searched for: the whole drawing (an owner with no ① of its own anywhere throws)
  let gx0 = Infinity, gz0 = Infinity, gx1 = -Infinity, gz1 = -Infinity
  for (const k of oneGrid.keys()) { const x = Math.round(k / 1000003), z = k - x * 1000003; gx0 = Math.min(gx0, x); gx1 = Math.max(gx1, x); gz0 = Math.min(gz0, z); gz1 = Math.max(gz1, z) }
  const SPAN = Number.isFinite(gx0) ? Math.hypot(gx1 - gx0 + 1, gz1 - gz0 + 1) * CELL : 0
  const tileAt = (x, z) => { for (const t of tileGrid.get(Math.floor(x / TCELL) * 1000003 + Math.floor(z / TCELL)) || []) {
    if (x < t.bb[0] || x > t.bb[2] || z < t.bb[1] || z > t.bb[3]) continue
    if (pipRings(x, z, [t.ring])) return t } return null }
  // nearest point on the tile's ②, searching rings of cells outward
  const nearest = (t, x, z, maxD) => {
    let best = null, bd = Infinity
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), R = Math.ceil(maxD / CELL) + 1
    for (let r = 0; r <= R; r++) {
      for (let ix = cx - r; ix <= cx + r; ix++) for (let iz = cz - r; iz <= cz + r; iz++) {
        if (Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== r) continue
        for (const s of t.segs.get(ix * 1000003 + iz) || []) {
          const dx = s.q[0] - s.p[0], dz = s.q[1] - s.p[1], L2 = dx * dx + dz * dz
          const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - s.p[0]) * dx + (z - s.p[1]) * dz) / L2)) : 0
          const px = s.p[0] + u * dx, pz = s.p[1] + u * dz, d2 = sq(x - px) + sq(z - pz)
          if (d2 < bd) { bd = d2; best = { px, pz, H: s.R.Hat(s.i, u), R: s.R, i: s.i, u } }
        }
      }
      if (best && Math.sqrt(bd) <= r * CELL) break
    }
    return best && { ...best, d: Math.sqrt(bd) }
  }
  // every OWNER within maxD: one candidate per ② span — a corner arc, or a stretch of one run (`iaStamp`) — at the span's
  // nearest point to (x, z), nearest first. The owner a point belongs to is chosen from these by its BAND, never by distance.
  const owners = (t, x, z, maxD) => {
    const by = new Map()
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), R = Math.ceil(maxD / CELL)
    for (let ix = cx - R; ix <= cx + R; ix++) for (let iz = cz - R; iz <= cz + R; iz++) for (const s of t.segs.get(ix * 1000003 + iz) || []) {
      const dx = s.q[0] - s.p[0], dz = s.q[1] - s.p[1], L2 = dx * dx + dz * dz
      const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - s.p[0]) * dx + (z - s.p[1]) * dz) / L2)) : 0
      const px = s.p[0] + u * dx, pz = s.p[1] + u * dz, d = Math.hypot(x - px, z - pz)
      if (d > maxD) continue
      const a = s.R.arc[s.i], key = a != null ? `a${a}` : `r${s.R.stamp[s.i]}`, k = s.R
      let m = by.get(k); if (!m) by.set(k, m = new Map())
      const cur = m.get(key); if (!cur || d < cur.d) m.set(key, { px, pz, H: s.R.Hat(s.i, u), R: s.R, i: s.i, u, d, key, run: a != null ? null : s.R.stamp[s.i] })
    }
    return [...by.values()].flatMap(m => [...m.values()]).sort((a, b) => a.d - b.d)
  }
  // the bands along a ray from (px, pz) in direction (ux, uz), out to `len`: [{ from, to, cls }]. Cells are walked in
  // order along the ray; each class's state starts from one point-in-polygon just inside ② and toggles at every crossing
  // of its own boundary, so no interval needs a polygon test; the walk stops once a lot follows the band.
  const bandsAlong = (px, pz, ux, uz, len, tr) => {
    stats.rays++
    // ⛔ the first state is probed PAST the lattice: the bands are on Clipper's 1 mm grid and ② is not, so a probe nearer
    // than the grid can sit outside a curb whose edge is ② itself — and the whole band read as lot (measured, HPDM)
    const eps = 2 * LATTICE, held = { walk: itemsAt('walk', px + ux * eps, pz + uz * eps), lawn: itemsAt('lawn', px + ux * eps, pz + uz * eps), curb: itemsAt('curb', px + ux * eps, pz + uz * eps) }
    let beyond = !!tr?.rim && !pipRings(px + ux * eps, pz + uz * eps, [tr.rimRing])
    const cls = () => beyond ? 'beyond' : held.walk.size ? 'walk' : held.lawn.size ? 'lawn' : held.curb.size ? 'curb' : 'lot'
    const out = [{ from: 0, to: len, cls: cls() }]
    const seen = new Set()
    let cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL)
    const stepX = ux > 0 ? 1 : -1, stepZ = uz > 0 ? 1 : -1
    let tMaxX = ux !== 0 ? (((ux > 0 ? cx + 1 : cx) * CELL) - px) / ux : Infinity, tMaxZ = uz !== 0 ? (((uz > 0 ? cz + 1 : cz) * CELL) - pz) / uz : Infinity
    const tDX = ux !== 0 ? CELL / Math.abs(ux) : Infinity, tDZ = uz !== 0 ? CELL / Math.abs(uz) : Infinity
    // ⭐ 'beyond' is the drawing's edge, never a band (`pedOf` skips it too): a ray that starts past the rim has seen no band
    // yet, so the paint it meets before or after the rim crossing is not cut off as "lot after a band" (HPDM B1, Mitre 2026-10-21)
    let tCell = 0, sawBand = out[0].cls !== 'lot' && out[0].cls !== 'beyond'
    const pending = []                     // crossings found but beyond the current cell's exit, kept sorted
    while (tCell <= len) {
      for (const sg of segGrid.get(cx * 1000003 + cz) || []) {
        if (seen.has(sg)) continue; seen.add(sg)
        const sx = sg.b[0] - sg.a[0], sz = sg.b[1] - sg.a[1], den = ux * sz - uz * sx
        if (Math.abs(den) < 1e-12) continue
        const wx = sg.a[0] - px, wz = sg.a[1] - pz, t = (wx * sz - wz * sx) / den, v = (wx * uz - wz * ux) / den
        if (t > eps && t <= len && v >= 0 && v < 1) pending.push({ t, cls: sg.cls, item: sg.item })   // crossings inside the probe distance are the lattice's, not the band's
      }
      const tExit = Math.min(tMaxX, tMaxZ)
      pending.sort((a, b) => a.t - b.t)
      // ⛔ every crossing at ONE point is applied before the class is read: where the curb's inner edge IS the lawn's outer
      // edge, reading between the two toggles saw a 'lot' that is not there and ended the band at the curb
      // ⭐ THE WINDOW IS CHAINED (Jacob, 2026-10-20; Tern's forensic): a crossing within one lattice of the PREVIOUS joins the
      // group, so a sub-lattice gap between two pieces of a band (0.8 mm on Huron's fox-road) is never read as a lot. Grouped
      // from the FIRST crossing instead, the next piece's entry 1.3 mm on fell outside and the band ended there.
      // ▶ node checks/claims-the-ray-reads-the-bands-the-point-test-reads.mjs [--selftest]
      while (pending.length && pending[0].t <= tExit) {
        const t0 = pending[0].t
        let tp = t0; while (pending.length && pending[0].t - tp <= LATTICE) { const h = pending.shift(); tp = h.t
          if (h.cls === 'beyond') beyond = !beyond; else { const H = held[h.cls]; if (H.has(h.item)) H.delete(h.item); else H.add(h.item) } }
        const c = cls(), last = out[out.length - 1]
        if (c !== last.cls) { last.to = t0; out.push({ from: t0, to: len, cls: c }) }
        if (c !== 'lot' && c !== 'beyond') sawBand = true
        else if (sawBand) return out
      }
      if (tMaxX < tMaxZ) { tCell = tMaxX; tMaxX += tDX; cx += stepX } else { tCell = tMaxZ; tMaxZ += tDZ; cz += stepZ }
    }
    return out
  }

  // the ped band a ray finds: the run of curb/lawn/walk from ② inward, up to the first lot. Beyond the disc is the
  // drawing's edge, not a lot: a band whose station lies outside the disc starts where the disc does (the rim cut it)
  const pedOf = (B) => { const ped = []; let back = 0
    for (const b of B) { if (b.cls === 'beyond') { if (ped.length) break; continue } if (b.cls === 'lot') break; ped.push(b); back = b.to }
    return { ped, back } }
  // the deepest a ped band reaches past ② (for the early-out): measured off the drawn bands, never a constant
  const REACH = (() => { let m = 0; for (const rings of [classRings.walk, classRings.lawn, classRings.curb]) for (const { r } of rings) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) }
    m = Math.max(m, Math.min(c - a, d - b)) } return m })()
  const CAP = Math.min(REACH, 60) + blend

  // ── THE ABSORPTION, ALONG ② (continuity along the street) ──
  // At stations along every ② ring (every vertex, and every STATION_M between): the ped band its ray finds, the rise
  // A_raw from H to the terrain at the band's back edge, and the CAPACITY the band has to take it up (the lawn's limit
  // over its width, the walk's over its own). The absorption the profile uses is A_raw SMOOTHED along the ring (σ, the
  // line's own window), then held inside ±env, where env is the capacity's lower envelope with an along-street slope of
  // the walk's own limit: so the absorption never exceeds what the band at a station can take, and never changes along
  // the street faster than a walk may slope — at a lawn's end it tapers off BEFORE the end, never steps there.
  const STATION_M = sigma / 10
  const walkWidths = []
  for (const t of T) for (const R of t.rings) {
    const ring = R.ring, n = ring.length, st = [], segStart = new Array(n), segEnd = new Array(n), ex = R.exempt
    // ⭐ OPEN RUNS AT A FRAME EDGE (Boz, 2026-10-20): where ② has exempt edges (outside the drawing) its stations are walked
    // from the edge after one, and each run of in-drawing edges is OPEN — it closes on its last edge's far vertex (that edge's
    // own end, u = 1), and the smoothing and the envelope below neither bridge the gap nor read a value across it. A ring with
    // none is one closed run, exactly as before.
    const e0 = ex.indexOf(1), open = e0 >= 0, runOf = []
    let s0 = 0, run = -1
    for (let c = 0; c < n; c++) { const i = open ? (e0 + 1 + c) % n : c
      const p = ring[i], q = ring[(i + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]), k = Math.max(1, Math.ceil(L / STATION_M))
      segStart[i] = st.length
      if (!ex[i]) { if (!st.length || ex[(i + n - 1) % n]) run++
        for (let j = 0; j < k; j++) { st.push({ i, u: j / k, s: s0 + L * j / k }); runOf.push(run) }
        if (open && ex[(i + 1) % n]) { st.push({ i, u: 1, s: s0 + L }); runOf.push(run) } }
      segEnd[i] = st.length
      s0 += L
    }
    const total = s0
    const nrm = (i) => { const p = ring[i], q = ring[(i + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [-(q[1] - p[1]) / L, (q[0] - p[0]) / L] }
    // which way is into the block: tested once per ring on its longest segment, against the UNCUT ② (`iaFull`), the contour
    // the stations sit on. ⛔ Never the disc-cut block (`iA`): where a rim ring's longest segment lies outside the disc, iA
    // does not hold it, and every station normal on the ring pointed OUT of the block (Mitre, 2026-10-21: HPDM 45 rings,
    // 59.7 km of ② · LS 30, 32.1 km · Huron 16, 153.6 km). ▶ node checks/claims-the-height-code-owns-what-is-drawn.mjs
    let li = 0, lL = -1; for (let i = 0; i < n; i++) { const L = Math.hypot(ring[(i + 1) % n][0] - ring[i][0], ring[(i + 1) % n][1] - ring[i][1]); if (L > lL) { lL = L; li = i } }
    const [m0, m1] = nrm(li), mx = (ring[li][0] + ring[(li + 1) % n][0]) / 2, mz = (ring[li][1] + ring[(li + 1) % n][1]) / 2
    const sideSign = pipRings(mx + m0 * 0.01, mz + m1 * 0.01, t.full) ? 1 : -1
    R.side = sideSign
    for (const S of st) {
      const p = ring[S.i], q = ring[(S.i + 1) % n], px = p[0] + (q[0] - p[0]) * S.u, pz = p[1] + (q[1] - p[1]) * S.u
      let [ux, uz] = nrm(S.i)
      if (S.u === 0) { const [ax, az] = nrm((S.i + n - 1) % n), L = Math.hypot(ux + ax, uz + az); if (L > 1e-9) { ux = (ux + ax) / L; uz = (uz + az) / L } }
      ux *= sideSign; uz *= sideSign
      const H = R.Hat(S.i, S.u)
      const B = bandsAlong(px - uz * SIDESTEP, pz + ux * SIDESTEP, ux, uz, CAP, t)
      const { ped, back } = pedOf(B); let lawnW = 0, walkW = 0
      for (const b of ped) { if (b.cls === 'lawn') lawnW += b.to - b.from; else if (b.cls === 'walk') walkW += b.to - b.from }
      const head = 4 * ulp32(H)
      S.Araw = raw(px + ux * back, pz + uz * back) - H
      S.cap = (lawnW > 0 ? (lawnMax == null ? Infinity : Math.max(0, lawnMax * lawnW / exag - head)) : 0) + Math.max(0, WALK_SHARE * walkMax * walkW / exag - head)
      if (walkW > 0) walkWidths.push(walkW)
    }
    stats.stations += st.length
    // the gap from each station to the next round the closed ring (in an open run, the last station's is never read)
    const m = st.length, gap = st.map((S, a) => a + 1 < m ? st[a + 1].s - S.s : total - S.s + st[0].s)
    const joined = (a, b) => !open || runOf[a] === runOf[b]          // b is a's neighbour within the same run
    // smooth A_raw along the ring (Gaussian, σ), walking out both ways to 3σ
    const A = new Float64Array(m)
    for (let a = 0; a < m; a++) {
      let w = 1, v = st[a].Araw
      for (let b = a, d = 0, g = 0; g < m - 1; g++) { const b1 = (b + 1) % m; if (!joined(b, b1) || (open && b1 === 0)) break; d += gap[b]; b = b1; if (d > 3 * sigma) break; const k = Math.exp(-d * d / (2 * sigma * sigma)); w += k; v += k * st[b].Araw }
      for (let b = a, d = 0, g = 0; g < m - 1; g++) { const b1 = (b + m - 1) % m; if (!joined(b, b1) || (open && b === 0)) break; b = b1; d += gap[b]; if (d > 3 * sigma) break; const k = Math.exp(-d * d / (2 * sigma * sigma)); w += k; v += k * st[b].Araw }
      A[a] = v / w
    }
    // the capacity's lower envelope with slope kk along the ring (two passes each way, so it closes round the ring).
    // ⭐ kk IS THE WALK'S OWN LIMIT, not a new constant (Boz, 2026-10-11): "the walk follows the street's grade along"
    // (Jacob) — so the walk's along-street departure from the line is bounded by the same norm that bounds its fall across.
    const kk = walkMax / exag, env = st.map(S => S.cap)
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < m; a++) { const b = (a + 1) % m; if (open && (b === 0 || !joined(a, b))) continue; env[b] = Math.min(env[b], env[a] + kk * gap[a]) }
      for (let a = m - 1; a >= 0; a--) { const b = (a + m - 1) % m; if (open && (a === 0 || !joined(a, b))) continue; env[b] = Math.min(env[b], env[a] + kk * gap[b]) }
    }
    st.forEach((S, a) => { const c = Math.max(-env[a], Math.min(env[a], A[a])); if (c !== A[a]) stats.absorbClamped++; S.A = c })
    R.st = st; R.segStart = segStart; R.segEnd = segEnd
  }
  // the absorption at (ring R, segment i, parameter u): linear between the two stations that bracket it
  const absorbAt = (R, i, u) => { const st = R.st, a0 = R.segStart[i], a1 = R.segEnd[i]
    // the last station of segment i at or before u (stations are in increasing u within a segment): by bisection
    let a = a0, hi = a1 - 1; while (a < hi) { const m = (a + hi + 1) >> 1; if (st[m].u <= u) a = m; else hi = m - 1 }
    const next = a + 1 < st.length ? st[a + 1] : st[0], uN = a + 1 < a1 ? next.u : 1
    const f = uN > st[a].u ? (u - st[a].u) / (uN - st[a].u) : 0
    return st[a].A + f * (next.A - st[a].A) }

  // ── THE PERPENDICULAR LEGS: each extension (and cut) owned by the leg edge that built it (Jacob, 2026-10-20) ──
  // A perpendicular corner's legs run their bands straight on past the tangent, where no ② station's ray reaches and the arc
  // carries no band. The painter hands each such region with its leg (`legs`: the ② ring `si` and edge `i` of `iaFull`, the
  // tangent at its end when `atEnd`), so the leg is READ, never found by distance: a point in it takes the leg's profile along
  // the leg's own inward normal at its tangent station, at the point's depth on that normal. ⛔ A region whose leg is not a ②
  // edge of its tile here throws: never a neighbour's.
  const legGrid = new Map(), byTi = new Map(T.map(r => [r.ti, r]))
  for (const { tile, perp } of legs || []) for (const x of perp || []) {
    if (x.kind === 'hull' || x.i == null) continue                     // the hull is the arc's, not a leg's
    const t = byTi.get(tile); if (!t) continue                         // a tile the deformer does not carry (no ②): nothing of it is resolved here
    const R = t.rings.find(r => r.k === x.si)
    if (!R || !(x.i >= 0 && x.i < R.ring.length) || R.exempt[x.i]) throw new Error(`groundDeformer: ⛔ ${town}: a perpendicular leg of tile ${tile} names ② ring ${x.si} edge ${x.i}, which the deformer does not carry — its extension has no owner`)
    const rings = (x.rings || []).filter(r => r?.length >= 3).map(frozenCopy); if (!rings.length) continue
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const r of rings) for (const [px, pz] of r) { a = Math.min(a, px); b = Math.min(b, pz); c = Math.max(c, px); d = Math.max(d, pz) }
    const rec = { t, R, i: x.i, atEnd: !!x.atEnd, rings, bb: [a, b, c, d] }
    for (let gx = Math.floor(a / TCELL); gx <= Math.floor(c / TCELL); gx++) for (let gz = Math.floor(b / TCELL); gz <= Math.floor(d / TCELL); gz++) { const k = gx * 1000003 + gz; (legGrid.get(k) || legGrid.set(k, []).get(k)).push(rec) }
  }
  // the legs whose own regions hold (x, z) in tile t: one per leg edge
  const legsAt = (t, x, z) => { const by = new Map()
    for (const L of legGrid.get(Math.floor(x / TCELL) * 1000003 + Math.floor(z / TCELL)) || []) {
      if (L.t !== t || x < L.bb[0] || x > L.bb[2] || z < L.bb[1] || z > L.bb[3]) continue
      const k = `${L.R.k}|${L.i}`; if (!by.has(k) && pipRings(x, z, L.rings)) by.set(k, L) }
    return [...by.values()] }
  // the leg's profile at (x, z): its tangent station, its inward normal there, the point's depth along it
  const legProfile = (L, x, z) => { const ring = L.R.ring, n = ring.length, p = ring[L.i], q = ring[(L.i + 1) % n], len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
    const ux = -(q[1] - p[1]) / len * L.R.side, uz = (q[0] - p[0]) / len * L.R.side, T0 = L.atEnd ? q : p, u = L.atEnd ? 1 : 0
    const d = (x - T0[0]) * ux + (z - T0[1]) * uz, H = L.R.Hat(L.i, u)
    if (d < LATTICE) return { v: H, held: d > -LATTICE }
    return profile({ px: T0[0], pz: T0[1], d, H, R: L.R, i: L.i, u }, T0[0] + ux * d, T0[1] + uz * d) }

  /** D(x, z): the deformed raw height, or null where the deformer does not reach (the caller draws the terrain). */
  const memo = new Map()
  const heightAt = (x, z) => resolve(x, z).v
  /** who owns (x, z): `${tile}|${ring}|${span}` of the ② span whose band holds it (or, in the lot, the nearest span), or null */
  const ownerAt = (x, z) => resolve(x, z).owner
  const NONE = { v: null, owner: null }
  /** the shape tile (index into `tiles`) where (x, z) lies in a drawn ped band that no ② span's band reaches — its own
   *  failure class, never the nearer line — else null */
  const unownedIn = (x, z) => resolve(x, z).unowned ?? null
  const own = (c) => `${c.R.t}|${c.R.k}|${c.key ?? nearKey(c)}`
  // ⛔ THE MEMO KEYS THE EXACT POSITION, so D is a function of (x, z). A 1 mm lattice key let the first point into a cell
  // answer for every later one, and the bake's heights, owners and unowned verdicts followed the order it sampled in
  // (measured on Huron 2026-10-12: forward vs reversed, 13,789 heights by up to 0.62 m raw). ▶ checks/claims-the-ground-height-is-a-function-of-the-point.mjs
  function resolve(x, z) {
    const mk = `${x},${z}`
    if (memo.has(mk)) return memo.get(mk)
    const v = resolveUncached(x, z)
    if (memo.size >= memoCap) { memo.clear(); stats.memoTurns++
      console.warn(`  [deform] ⛔ ${town}: the memo reached ${memoCap} answers (V8's Map cap) and was cleared, turn ${stats.memoTurns} — a point asked again is recomputed; the deformer's counters now count resolves, not distinct points`) }
    memo.set(mk, v); return v
  }
  function resolveUncached(x, z) {
    const t = tileAt(x, z)
    if (!t) return onInk(x, z)
    if (!pipRings(x, z, t.iA)) return road(t, x, z)
    const n = nearest(t, x, z, CAP)
    if (!n || n.d > CAP) { stats.deep++; return NONE }
    stats.evaluated++
    if (n.d < 1e-9) return { v: n.H, owner: own(n) }                                // on ② itself
    // ⭐⭐ THE BAND DECIDES, NEVER THE NEARER LINE (Jacob, 2026-10-11, via Boz). A point in a ped band takes its height
    // from the ② span whose own band holds it: the spans within reach, nearest first, each tracing its band inward from
    // its own station; the first whose band reaches the point owns it. Where two streets run close, the nearer ② can be
    // the other street's, whose band (or bare edge) never reaches this walk — measured on HPDM, central-avenue-0: a walk
    // read off the highway's ② sat 5 m below its own street.
    // A point no band holds is the lot: the nearest span's ease, as before (`nearest`).
    // ⛔ A point INSIDE a drawn ped band that no span's band reaches has no owner: COUNTED by name (`unowned`), and its
    // height is null — never the nearer line's.
    for (const c of owners(t, x, z, Math.min(CAP, REACH + LATTICE))) {
      // within the lattice of ② the point IS on ②: the bands are on the 1 mm grid and ② is not, so a ray aimed from a
      // station a fraction of a millimetre away points nowhere in particular (measured: 536 of 664 orphan clusters on HPDM)
      if (c.d < LATTICE) return { v: c.H, owner: own(c) }
      const p = profile(c, x, z)
      if (p.held) { if (c.R !== n.R || c.key !== nearKey(n)) stats.byBand++; if (legGrid.size && legsAt(t, x, z).length) stats.rayAndLeg++; return { v: p.v, owner: own(c) } }
    }
    // ⭐ NO RAY HOLDS IT: a perpendicular leg's own region does (Boz, 2026-10-20: the leg applies only here, so nothing a ray
    // holds changes). Where two legs' regions cross, the point is BOTH legs' (the band pieces' ruling): the two profiles'
    // equal-weight mean — symmetric, no distance, no tiebreak.
    const Ls = legGrid.size ? legsAt(t, x, z) : []
    if (Ls.length) { const P = Ls.map(L => ({ L, p: legProfile(L, x, z) })).filter(o => o.p.held)
      if (P.length) { stats.byLeg++
        if (P.length > 1) { stats.legCross++; const vs = P.map(o => o.p.v); stats.legCrossMaxDH = Math.max(stats.legCrossMaxDH, Math.max(...vs) - Math.min(...vs)) }
        return { v: P.reduce((a, o) => a + o.p.v, 0) / P.length, owner: `${t.ti}|leg|${P.map(o => `${o.L.R.k}:r${o.L.R.stamp[o.L.i]}`).join('+')}` } }
      stats.legNotHeld++ }
    if (inBand(x, z)) { stats.unowned++; return { v: null, owner: null, unowned: t.ti } }
    return { v: profile(n, x, z).v, owner: own(n) }
  }
  // ⭐ THE SWEEP (the road side of tile t): D = (1 − s)·L + s·H②, s = d① / (d① + d②). L is the owners' blend of t's own ①
  // edges within the road's width at P; H② is ②'s height at P's nearest point on it. ⛔ No reach bounds it: the road is
  // bounded by ① and ②, so ② is searched as far as the tile is wide.
  function road(t, x, z) {
    const n = nearest(t, x, z, t.diag), o1 = nearestOwned(t.one, x, z, t.diag)
    if (!n || !o1) throw new Error(`groundDeformer: ⛔ ${town}: the road point (${x.toFixed(3)}, ${z.toFixed(3)}) in the tile whose ① ring starts at (${t.ring[0][0].toFixed(1)}, ${t.ring[0][1].toFixed(1)}) finds no ${n ? '①' : '②'} in its tile`)
    stats.road++
    const W = o1.d + n.d, by = ownersNear(t.one, x, z, W)
    if (by.size > 1) stats.roadBlended++
    if (!(W > 0)) return { v: n.H, owner: `①|${t.ti}|${o1.o.id}` }
    const s = o1.d / W
    return { v: s >= 1 ? n.H : (1 - s) * lineBlend(by, x, z, W) + s * n.H, owner: `①|${t.ti}|${o1.o.id}` }
  }
  // ⭐ THE INK: a point in no tile takes its piece's owners' lines — one owner's exactly; a crossing's blended by each
  // owner's distance to its own ① (exactly each owner's on its own edge). ⛔ A point in no piece is beyond ① (the sea, the
  // rim): NONE, counted — save within the boolean's own grid (2 lattice units) of an owned edge, where tile and ink were
  // rounded apart and the point is on that edge.
  function onInk(x, z) {
    const p = inkAt(x, z)
    if (!p) { const e = nearestOwned(oneGrid, x, z, 2 * LATTICE)
      if (!e) { stats.outside++; return NONE }
      stats.inkOnGrid++; return { v: e.o.at(x, z), owner: `ink|${e.o.id}` } }
    stats.ink++
    if (p.owners.length === 1) return { v: p.owners[0].at(x, z), owner: `ink|${p.owners[0].id}` }
    stats.inkCrossing++
    const by = new Map()
    for (const o of p.owners) { const e = nearestOwned(oneGrid, x, z, SPAN, o)
      if (!e) throw new Error(`groundDeformer: ⛔ ${town}: ink crossing ${p.pi} names ${o.id}, which has no ① edge and no ink of its own anywhere — its line's reach cannot be measured`)
      by.set(o, e.d) }
    return { v: lineBlend(by, x, z), owner: `ink|${p.owners.map(o => o.id).join('+')}` }
  }
  const nearKey = (n) => n.R.arc[n.i] != null ? `a${n.R.arc[n.i]}` : `r${n.R.stamp[n.i]}`
  const inBand = (x, z) => inClass('walk', x, z) || inClass('lawn', x, z) || inClass('curb', x, z)
  // THE PROFILE from one ② span `n` (its station, H, ring position) at (x, z): { v, held } — held = the point lies in
  // that span's own ped band (to the lattice)
  function profile(n, x, z) {
    const ux = (x - n.px) / n.d, uz = (z - n.pz) / n.d
    // ⛔ the ray is aimed AT this point, which is often a band polygon's own vertex: run it 10 µm to the side, so it never
    // passes exactly through a boundary vertex (where the half-open crossing rule can count a boundary 0 or 2 times)
    const B = bandsAlong(n.px - uz * SIDESTEP, n.pz + ux * SIDESTEP, ux, uz, CAP, recOf.get(n.R.t))
    const { ped, back } = pedOf(B)
    const held = ped.length > 0 && n.d <= back + LATTICE
    const R = absorbAt(n.R, n.i, n.u)                        // the absorption along ②, continuous along the street
    let walkW = 0, lawnW = 0; for (const b of ped) { if (b.cls === 'walk') walkW += b.to - b.from; else if (b.cls === 'lawn') lawnW += b.to - b.from }
    // THE GIRDLE, in Jacob's order: the LAWN takes the rise first (up to its limit), the walk only what the lawn cannot,
    // the rest goes to the ease. Each share leaves the float32 headroom D is stored at (4 ulps of H over the width), so
    // a walk at its limit is never pushed over it by rounding.
    const head = 4 * ulp32(n.H)
    const sgn = Math.sign(R), lawnCap = lawnMax == null ? Infinity : Math.max(0, lawnMax * lawnW / exag - head)
    const byLawn = lawnW > 0 ? Math.min(Math.abs(R), lawnCap) : 0
    const byWalk = Math.min(Math.abs(R) - byLawn, Math.max(0, WALK_SHARE * walkMax * walkW / exag - head))
    if (lawnW > 0 && byLawn >= lawnCap && Math.abs(R) > byLawn) stats.lawnFull++
    // the height at depth s within the ped band: the walk's and lawn's shares spread over their own widths
    const at = (s) => { let h = n.H
      for (const b of ped) { const w = b.to - b.from; if (w <= 0) continue
        const share = b.cls === 'walk' ? (walkW > 0 ? byWalk * w / walkW : 0) : b.cls === 'lawn' ? (lawnW > 0 ? byLawn * w / lawnW : 0) : 0
        if (s <= b.to) return h + sgn * share * (s - b.from) / w
        h += sgn * share }
      return h }
    if (n.d <= back) return { v: at(n.d), held }
    const hBack = at(back)
    if (n.d >= back + blend) return { v: raw(x, z), held }
    stats.eased++
    const f = (n.d - back) / blend
    return { v: hBack + (raw(x, z) - hBack) * f, held }
  }
  // for probes: the station, the depth and the band intervals a point's ray finds (never used by the bake)
  const explain = (x, z) => { const t = tileAt(x, z); if (!t) return { outside: true }; const n = nearest(t, x, z, CAP); if (!n) return { deep: true }
    const ux = (x - n.px) / n.d, uz = (z - n.pz) / n.d
    return { station: [n.px, n.pz], H: n.H, d: n.d, inBlock: pipRings(x, z, t.iA), bands: n.d > 0 ? bandsAlong(n.px - uz * SIDESTEP, n.pz + ux * SIDESTEP, ux, uz, CAP, t) : [] } }
  // for probes: every owner candidate at (x, z) with the bands its ray finds (never used by the bake)
  const _owners = (x, z) => { const t = tileAt(x, z); if (!t) return []
    return owners(t, x, z, CAP).map(c => { const ux = (x - c.px) / c.d, uz = (z - c.pz) / c.d
      return { key: c.key, run: c.run, d: c.d, H: c.H, bands: c.d > 0 ? bandsAlong(c.px - uz * SIDESTEP, c.pz + ux * SIDESTEP, ux, uz, CAP, t) : [] } }) }
  // the drawing's half of the walk limit, as a vertical chord tolerance over the town's narrower walks (p10 of the walk
  // widths the stations measured): what the bake refines the ped bands to. Null where the town names no walk limit.
  walkWidths.sort((a, b) => a - b)
  const walkP10 = walkWidths.length ? walkWidths[Math.floor(0.1 * (walkWidths.length - 1))] : null
  // over HALF the walk: the gate judges each half of the cross-section (front→middle, middle→back), so the drawing's
  // chord error is spent over a half-width, never the whole one
  const refineTol = walkMax > 0 && walkP10 ? (1 - WALK_SHARE) * walkMax * (walkP10 / 2) / exag : null
  return { heightAt, stats, reach: CAP, explain, refineTol, walkP10, stationM: STATION_M, unownedIn, ownerAt, _owners, _inClass: inClass, _bandsAlong: bandsAlong, _memoSize: () => memo.size }
}
