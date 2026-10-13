// groundDeformer.mjs — THE GROUND'S TERRAIN HEIGHT NEAR THE STREETS (BRIEF-the-ground-knows-its-height §5 step 2).
//
// ⭐ ONE CONTINUOUS FUNCTION OF POSITION, D(x, z), raw metres like terrain.bin (the runtime multiplies it by uExag). The
// kerb is NOT in it: the kerb is the mesh's own y, unexaggerated (`kerbLift.mjs`), and D is continuous across the kerb
// face, so the only step in the drawn ground is the kerb's, which lives where the curb meets the road.
// ⭐ THE CARRIER IS ②, the curb contour uncut (`tile.iaFull`, the stamps' own ring), never ①'s sharp runs: ② is smooth through its corner
// fillets, so a point's nearest station on it does not jump at a corner. Its height H is the line's (`tile.runs[].h`,
// `lineHeight.mjs`), and on a CORNER ARC (`iaArc`) H is blended along the arc between its two tangent points — the
// owner changes along a fillet, and blending is what keeps H one continuous value through the change (A10: a corner is a
// slice of one continuous band, not a join).
// ⭐ THE PROFILE, read off the DRAWN bands (authoring included) along the ray from the station into the block:
//   road (the street side of ②) · curb → H · then THE GIRDLE (Jacob, 2026-10-11): the ped band takes up the rise R from
//   H to the terrain at its back edge, the walk at most its limit (`walk.crossSlopeMax`) and the lawn at most its own
//   (`lawn.slopeMax`), both divided by the town's exaggeration ceiling so they hold as DRAWN · whatever is left is eased
//   LINEARLY into the terrain over B (`design.json#groundBlendM`, else one terrain grid step) · past that, the terrain.
// ⛔ Outside every tile (the rim's perimeter road, a highway stroke, water) D is null: the caller draws the terrain there
//   and COUNTS it.

import { LATTICE_M as LATTICE } from '../src/lib/lattice.js'   // the partition's own grid: crossings closer than LATTICE are one crossing point

const sq = (x) => x * x
const SIDESTEP = 1e-5   // metres: far below the 1 mm lattice, far above float64 noise
const ulp32 = (v) => 2 ** (Math.floor(Math.log2(Math.max(Math.abs(v), 1))) - 23)   // a float32's spacing at v
// ⭐ THE WALK'S LIMIT IS SHARED, HALF AND HALF: the profile may tilt a walk by at most half of it; the other half is the
// DRAWING's — the chord error of the triangles that carry the profile, which the bake refines against (`refineTol`).
const WALK_SHARE = 0.5   // derived, not free (Boz, 2026-10-11): the profile's tilt and the mesh's chord error share the town's own walk norm

/** @param tiles shape.json tiles (runs carry `h`) · @param bands { curb, lawn, walk }: arrays of {outer, holes}|ring, AS
 *  PAINTED (before the flatten punches overlays through them) · @param stencil the town's disc ring (beyond it nothing is
 *  drawn: the rim is an edge of the drawing, never a lot) · @param raw (x, z) → terrain raw
 *  @param limits { walkMax, lawnMax (null = none), exag, blend } */
export function buildDeformer({ tiles, bands, stencil = null, raw, limits }) {
  const { walkMax, lawnMax, exag, blend, sigma } = limits
  if (!(sigma > 0)) throw new Error(`groundDeformer: the smoothing window must be metres > 0, got ${sigma}`)
  if (!(blend > 0)) throw new Error(`groundDeformer: the blend must be metres > 0, got ${blend}`)
  if (!(exag > 0)) throw new Error(`groundDeformer: the exaggeration ceiling must be > 0, got ${exag}`)
  if (!(walkMax >= 0)) throw new Error('groundDeformer: the town names no walk cross-slope limit — the girdle cannot hold the walk level')
  const stats = { noFull: 0, stations: 0, absorbClamped: 0, tiles: 0, noH: 0, hFilled: 0, arcBlended: 0, outside: 0, deep: 0, evaluated: 0, rays: 0, eased: 0, lawnFull: 0, byBand: 0, unowned: 0 }

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
  if (disc) for (let i = 0; i < disc.length; i++) addSeg('beyond', disc[i], disc[(i + 1) % disc.length])
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

  // ── the tiles: their ① ring (which tile holds a point), ② with H per vertex ──
  const T = []
  const TCELL = 64, tileGrid = new Map()
  for (const [ti, t] of (tiles || []).entries()) {
    if (!(t?.ring?.length >= 3) || !t.iA?.length) continue
    // ⭐ THE CARRIER IS `iaFull`, ② UNCUT: `iaStamp` and `iaArc` are parallel to IT, never to `iA` (the cut ring the block is
    // drawn with — measured on HPDM: iA and iaFull differ on 237 of 266 rings). A tile without it cannot name its runs.
    if (!t.iaFull?.length || !t.iaStamp?.length) { stats.noFull++; continue }
    // the line's h at a ② vertex, read through the vertex's own stamp (`iaStamp` → its run): exact where the vertex is one
    // of the run's own poly points, else projected onto THAT run's poly and interpolated — the run is named, never searched
    const runs = t.runs || []
    const hOfRun = (ri, p) => { const run = runs[ri]; if (!run || !Array.isArray(run.h)) return null
      let best = Infinity, out = null
      for (let i = 0; i + 1 < run.poly.length; i++) { const a = run.poly[i], b = run.poly[i + 1], ha = run.h[i], hb = run.h[i + 1]; if (ha == null || hb == null) continue
        const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
        const d2 = sq(p[0] - a[0] - u * dx) + sq(p[1] - a[1] - u * dz); if (d2 < best) { best = d2; out = ha + u * (hb - ha) } }
      if (out == null && run.poly.length === 1 && run.h[0] != null) out = run.h[0]
      return out }
    const rings = []
    t.iaFull.forEach((ring, ri) => {
      if (!(ring?.length >= 3)) return
      const n = ring.length, H = new Array(n).fill(null), arc = t.iaArc?.[ri] || []
      const stamp = t.iaStamp?.[ri] || []
      for (let i = 0; i < n; i++) if (arc[i] == null && stamp[i] != null) { const h = hOfRun(stamp[i], ring[i]); if (h != null) H[i] = h }
      // a corner arc: blend H by arclength between the straight vertex before it and the one after it
      for (let i = 0; i < n; i++) {
        if (arc[i] == null || arc[(i + n - 1) % n] === arc[i]) continue          // i starts an arc
        let j = i; const id = arc[i], span = []
        while (arc[j % n] === id && span.length < n) { span.push(j % n); j++ }
        const before = (i + n - 1) % n, after = j % n
        const hb = H[before] ?? (stamp[before] != null ? hOfRun(stamp[before], ring[before]) : null), ha = H[after] ?? (stamp[after] != null ? hOfRun(stamp[after], ring[after]) : null)
        if (hb == null || ha == null) continue
        const pts = [before, ...span, after]; let L = 0; const cum = [0]
        for (let k = 1; k < pts.length; k++) { L += Math.hypot(ring[pts[k]][0] - ring[pts[k - 1]][0], ring[pts[k]][1] - ring[pts[k - 1]][1]); cum.push(L) }
        span.forEach((v, k) => { H[v] = L > 0 ? hb + (ha - hb) * cum[k + 1] / L : hb }); stats.arcBlended += span.length
      }
      // a vertex still without H (its run has no line: a highway edge, the rim) takes its neighbours' along the ring —
      // COUNTED (`hFilled`); a ring with no line at all is not deformed (`noH`)
      const known = H.filter(h => h != null).length
      if (!known) { stats.noH++; return }
      if (known < n) stats.hFilled += n - known
      if (known < n) for (let pass = 0; pass < n && H.some(h => h == null); pass++) for (let i = 0; i < n; i++) if (H[i] == null) {
        const a = H[(i + n - 1) % n], b = H[(i + 1) % n]; if (a != null || b != null) H[i] = a != null && b != null ? (a + b) / 2 : (a ?? b) }
      rings.push({ ring, H, stamp, arc, t: ti, k: ri })
    })
    if (!rings.length) continue
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
    for (const [x, z] of t.ring) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) }
    const rec = { ti, ring: frozenCopy(t.ring), iA: t.iA.filter(r => r?.length >= 3).map(frozenCopy), rings, bb: [a, b, c, d], segs: new Map() }
    for (const R of rings) for (let i = 0; i < R.ring.length; i++) {
      const p = R.ring[i], q = R.ring[(i + 1) % R.ring.length], s = { p, q, hp: R.H[i], hq: R.H[(i + 1) % R.ring.length], R, i }
      const x0 = Math.floor(Math.min(p[0], q[0]) / CELL), x1 = Math.floor(Math.max(p[0], q[0]) / CELL), z0 = Math.floor(Math.min(p[1], q[1]) / CELL), z1 = Math.floor(Math.max(p[1], q[1]) / CELL)
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 1000003 + z; (rec.segs.get(k) || rec.segs.set(k, []).get(k)).push(s) }
    }
    T.push(rec); stats.tiles++
    for (let x = Math.floor(a / TCELL); x <= Math.floor(c / TCELL); x++) for (let z = Math.floor(b / TCELL); z <= Math.floor(d / TCELL); z++) { const k = x * 1000003 + z; (tileGrid.get(k) || tileGrid.set(k, []).get(k)).push(rec) }
  }
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
          if (d2 < bd) { bd = d2; best = { px, pz, H: s.hp + u * (s.hq - s.hp), R: s.R, i: s.i, u } }
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
      const cur = m.get(key); if (!cur || d < cur.d) m.set(key, { px, pz, H: s.hp + u * (s.hq - s.hp), R: s.R, i: s.i, u, d, key, run: a != null ? null : s.R.stamp[s.i] })
    }
    return [...by.values()].flatMap(m => [...m.values()]).sort((a, b) => a.d - b.d)
  }
  // the bands along a ray from (px, pz) in direction (ux, uz), out to `len`: [{ from, to, cls }]. Cells are walked in
  // order along the ray; each class's state starts from one point-in-polygon just inside ② and toggles at every crossing
  // of its own boundary, so no interval needs a polygon test; the walk stops once a lot follows the band.
  const bandsAlong = (px, pz, ux, uz, len) => {
    stats.rays++
    // ⛔ the first state is probed PAST the lattice: the bands are on Clipper's 1 mm grid and ② is not, so a probe nearer
    // than the grid can sit outside a curb whose edge is ② itself — and the whole band read as lot (measured, HPDM)
    const eps = 2 * LATTICE, held = { walk: itemsAt('walk', px + ux * eps, pz + uz * eps), lawn: itemsAt('lawn', px + ux * eps, pz + uz * eps), curb: itemsAt('curb', px + ux * eps, pz + uz * eps) }
    let beyond = !!disc && !pipRings(px + ux * eps, pz + uz * eps, [disc])
    const cls = () => beyond ? 'beyond' : held.walk.size ? 'walk' : held.lawn.size ? 'lawn' : held.curb.size ? 'curb' : 'lot'
    const out = [{ from: 0, to: len, cls: cls() }]
    const seen = new Set()
    let cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL)
    const stepX = ux > 0 ? 1 : -1, stepZ = uz > 0 ? 1 : -1
    let tMaxX = ux !== 0 ? (((ux > 0 ? cx + 1 : cx) * CELL) - px) / ux : Infinity, tMaxZ = uz !== 0 ? (((uz > 0 ? cz + 1 : cz) * CELL) - pz) / uz : Infinity
    const tDX = ux !== 0 ? CELL / Math.abs(ux) : Infinity, tDZ = uz !== 0 ? CELL / Math.abs(uz) : Infinity
    let tCell = 0, sawBand = out[0].cls !== 'lot'
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
      while (pending.length && pending[0].t <= tExit) {
        const t0 = pending[0].t
        while (pending.length && pending[0].t - t0 <= LATTICE) { const h = pending.shift()
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
    const ring = R.ring, n = ring.length, st = [], segStart = new Array(n)
    let s0 = 0
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]), k = Math.max(1, Math.ceil(L / STATION_M))
      segStart[i] = st.length
      for (let j = 0; j < k; j++) st.push({ i, u: j / k, s: s0 + L * j / k })
      s0 += L
    }
    const total = s0
    const nrm = (i) => { const p = ring[i], q = ring[(i + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [-(q[1] - p[1]) / L, (q[0] - p[0]) / L] }
    // which way is into the block: tested once per ring on its longest segment
    let li = 0, lL = -1; for (let i = 0; i < n; i++) { const L = Math.hypot(ring[(i + 1) % n][0] - ring[i][0], ring[(i + 1) % n][1] - ring[i][1]); if (L > lL) { lL = L; li = i } }
    const [m0, m1] = nrm(li), mx = (ring[li][0] + ring[(li + 1) % n][0]) / 2, mz = (ring[li][1] + ring[(li + 1) % n][1]) / 2
    const sideSign = pipRings(mx + m0 * 0.01, mz + m1 * 0.01, t.iA) ? 1 : -1
    for (const S of st) {
      const p = ring[S.i], q = ring[(S.i + 1) % n], px = p[0] + (q[0] - p[0]) * S.u, pz = p[1] + (q[1] - p[1]) * S.u
      let [ux, uz] = nrm(S.i)
      if (S.u === 0) { const [ax, az] = nrm((S.i + n - 1) % n), L = Math.hypot(ux + ax, uz + az); if (L > 1e-9) { ux = (ux + ax) / L; uz = (uz + az) / L } }
      ux *= sideSign; uz *= sideSign
      const H = R.H[S.i] + S.u * (R.H[(S.i + 1) % n] - R.H[S.i])
      const B = bandsAlong(px - uz * SIDESTEP, pz + ux * SIDESTEP, ux, uz, CAP)
      const { ped, back } = pedOf(B); let lawnW = 0, walkW = 0
      for (const b of ped) { if (b.cls === 'lawn') lawnW += b.to - b.from; else if (b.cls === 'walk') walkW += b.to - b.from }
      const head = 4 * ulp32(H)
      S.Araw = raw(px + ux * back, pz + uz * back) - H
      S.cap = (lawnW > 0 ? (lawnMax == null ? Infinity : Math.max(0, lawnMax * lawnW / exag - head)) : 0) + Math.max(0, WALK_SHARE * walkMax * walkW / exag - head)
      if (walkW > 0) walkWidths.push(walkW)
    }
    stats.stations += st.length
    // the gap from each station to the next round the closed ring
    const m = st.length, gap = st.map((S, a) => a + 1 < m ? st[a + 1].s - S.s : total - S.s + st[0].s)
    // smooth A_raw along the ring (Gaussian, σ), walking out both ways to 3σ
    const A = new Float64Array(m)
    for (let a = 0; a < m; a++) {
      let w = 1, v = st[a].Araw
      for (let b = a, d = 0, g = 0; g < m - 1; g++) { d += gap[b]; b = (b + 1) % m; if (d > 3 * sigma) break; const k = Math.exp(-d * d / (2 * sigma * sigma)); w += k; v += k * st[b].Araw }
      for (let b = a, d = 0, g = 0; g < m - 1; g++) { b = (b + m - 1) % m; d += gap[b]; if (d > 3 * sigma) break; const k = Math.exp(-d * d / (2 * sigma * sigma)); w += k; v += k * st[b].Araw }
      A[a] = v / w
    }
    // the capacity's lower envelope with slope kk along the ring (two passes each way, so it closes round the ring).
    // ⭐ kk IS THE WALK'S OWN LIMIT, not a new constant (Boz, 2026-10-11): "the walk follows the street's grade along"
    // (Jacob) — so the walk's along-street departure from the line is bounded by the same norm that bounds its fall across.
    const kk = walkMax / exag, env = st.map(S => S.cap)
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < m; a++) { const b = (a + 1) % m; env[b] = Math.min(env[b], env[a] + kk * gap[a]) }
      for (let a = m - 1; a >= 0; a--) { const b = (a + m - 1) % m; env[b] = Math.min(env[b], env[a] + kk * gap[b]) }
    }
    st.forEach((S, a) => { const c = Math.max(-env[a], Math.min(env[a], A[a])); if (c !== A[a]) stats.absorbClamped++; S.A = c })
    R.st = st; R.segStart = segStart
  }
  // the absorption at (ring R, segment i, parameter u): linear between the two stations that bracket it
  const absorbAt = (R, i, u) => { const st = R.st, a0 = R.segStart[i], a1 = i + 1 < R.segStart.length ? R.segStart[i + 1] : st.length
    // the last station of segment i at or before u (stations are in increasing u within a segment): by bisection
    let a = a0, hi = a1 - 1; while (a < hi) { const m = (a + hi + 1) >> 1; if (st[m].u <= u) a = m; else hi = m - 1 }
    const next = a + 1 < st.length ? st[a + 1] : st[0], uN = a + 1 < a1 ? next.u : 1
    const f = uN > st[a].u ? (u - st[a].u) / (uN - st[a].u) : 0
    return st[a].A + f * (next.A - st[a].A) }

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
    const v = resolveUncached(x, z); memo.set(mk, v); return v
  }
  function resolveUncached(x, z) {
    const t = tileAt(x, z)
    if (!t) { stats.outside++; return NONE }
    const n = nearest(t, x, z, CAP)
    if (!n || n.d > CAP) { stats.deep++; return NONE }
    stats.evaluated++
    if (!pipRings(x, z, t.iA) || n.d < 1e-9) return { v: n.H, owner: own(n) }     // road side, or on ② itself
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
      if (p.held) { if (c.R !== n.R || c.key !== nearKey(n)) stats.byBand++; return { v: p.v, owner: own(c) } }
    }
    if (inBand(x, z)) { stats.unowned++; return { v: null, owner: null, unowned: t.ti } }
    return { v: profile(n, x, z).v, owner: own(n) }
  }
  const nearKey = (n) => n.R.arc[n.i] != null ? `a${n.R.arc[n.i]}` : `r${n.R.stamp[n.i]}`
  const inBand = (x, z) => inClass('walk', x, z) || inClass('lawn', x, z) || inClass('curb', x, z)
  // THE PROFILE from one ② span `n` (its station, H, ring position) at (x, z): { v, held } — held = the point lies in
  // that span's own ped band (to the lattice)
  function profile(n, x, z) {
    const ux = (x - n.px) / n.d, uz = (z - n.pz) / n.d
    // ⛔ the ray is aimed AT this point, which is often a band polygon's own vertex: run it 10 µm to the side, so it never
    // passes exactly through a boundary vertex (where the half-open crossing rule can count a boundary 0 or 2 times)
    const B = bandsAlong(n.px - uz * SIDESTEP, n.pz + ux * SIDESTEP, ux, uz, CAP)
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
    return { station: [n.px, n.pz], H: n.H, d: n.d, inBlock: pipRings(x, z, t.iA), bands: n.d > 0 ? bandsAlong(n.px - uz * SIDESTEP, n.pz + ux * SIDESTEP, ux, uz, CAP) : [] } }
  // for probes: every owner candidate at (x, z) with the bands its ray finds (never used by the bake)
  const _owners = (x, z) => { const t = tileAt(x, z); if (!t) return []
    return owners(t, x, z, CAP).map(c => { const ux = (x - c.px) / c.d, uz = (z - c.pz) / c.d
      return { key: c.key, run: c.run, d: c.d, H: c.H, bands: c.d > 0 ? bandsAlong(c.px - uz * SIDESTEP, c.pz + ux * SIDESTEP, ux, uz, CAP) : [] } }) }
  // the drawing's half of the walk limit, as a vertical chord tolerance over the town's narrower walks (p10 of the walk
  // widths the stations measured): what the bake refines the ped bands to. Null where the town names no walk limit.
  walkWidths.sort((a, b) => a - b)
  const walkP10 = walkWidths.length ? walkWidths[Math.floor(0.1 * (walkWidths.length - 1))] : null
  // over HALF the walk: the gate judges each half of the cross-section (front→middle, middle→back), so the drawing's
  // chord error is spent over a half-width, never the whole one
  const refineTol = walkMax > 0 && walkP10 ? (1 - WALK_SHARE) * walkMax * (walkP10 / 2) / exag : null
  return { heightAt, stats, reach: CAP, explain, refineTol, walkP10, stationM: STATION_M, unownedIn, ownerAt, _owners, _inClass: inClass, _bandsAlong: bandsAlong }
}
