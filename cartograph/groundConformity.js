/**
 * groundConformity.js — the ground stretches, it does not break.
 *
 * The runtime displaces every ground vertex by the DEM. Two triangles that share
 * an edge stay joined only if they share that edge's VERTICES: a vertex sitting in
 * the middle of a neighbour's edge (a T-junction) is lifted to the terrain while
 * the neighbour's edge chords straight past it, and the difference opens as a
 * crack you can see foundations through. Invisible from overhead, glaring at
 * street level.
 *
 * The per-polygon triangulator it replaces was conforming only WITHIN one polygon.
 * The flattened ground is one plane of disjoint groups (land use, sidewalk, curb,
 * asphalt, treelawn…), so almost every shared edge runs BETWEEN groups — and
 * ribbons are never refined while fills are, so every midpoint a fill put on its
 * border landed mid-edge on a ribbon. ROADMAP H-21; brief
 * docs/briefs/BRIEF-ground-cross-polygon-conformity.md.
 *
 * `conformAndRefine` therefore works on the UNION of the groups it is given:
 *   1. weld every ring vertex of every group by quantised world XZ, and triangulate
 *      each polygon exactly as before (rings untouched, so interiors do not move);
 *   2. close every crack the input carries: split each triangle whose unshared edge
 *      has another group's (or another polygon's) boundary vertex on it;
 *   3. run the longest-edge bisection over the union with ONE midpoint cache keyed by
 *      welded vertex pairs, each triangle keeping its own group's policy (a ribbon
 *      never splits on its own account but takes the closures its neighbours force),
 *      then close again;
 *   4. split back into per-group buffers. A shared vertex is duplicated into each
 *      group with bit-identical XZ, so the GPU lifts both copies identically.
 *
 * ⛔ No partial weld: if the repair cannot converge, or the result still carries a
 * T-junction, the bake THROWS. A split without conformity is worse than none.
 */
import * as THREE from 'three'

// ⭐ The weld quantum is the clipper lattice, not a tolerance picked to make a
// number go away: flattenPaintStack rounds every ring to CLIP_SCALE = 1000 units
// per metre, so two rings that share a vertex share it to the millimetre. It is
// ~4× coarser than float32's resolution at ±4 km (~0.25 mm), so a round-trip
// through the .bin cannot move a vertex across a bucket boundary in practice.
export const WELD_QUANTUM_M = 0.001
// A vertex within this distance of an edge's interior is ON that edge. 5 mm: well
// above the weld quantum + float32 noise, well below any crack worth seeing.
export const ON_EDGE_M = 0.005
// A SLIVER: area below this fraction of its longest edge squared (an equilateral triangle is ~0.43).
// A shape ratio, unitless — it describes a triangle, not a town.
export const SLIVER_RATIO = 0.01

const Q = 1 / WELD_QUANTUM_M
const KEY_BIAS = 2 ** 23, KEY_MUL = 2 ** 24          // ±8.3 km at 1 mm, exact in a double
function weldKey(x, z) {
  const qx = Math.round(x * Q), qz = Math.round(z * Q)
  if (Math.abs(qx) >= KEY_BIAS || Math.abs(qz) >= KEY_BIAS) {
    throw new Error(`[groundConformity] vertex (${x}, ${z}) is outside the ±${KEY_BIAS * WELD_QUANTUM_M / 1000} km weld range`)
  }
  return (qx + KEY_BIAS) * KEY_MUL + (qz + KEY_BIAS)
}
const EDGE_MUL = 2 ** 26
const edgeKey = (a, b) => (a < b ? a * EDGE_MUL + b : b * EDGE_MUL + a)

// ⭐ SHARDED MAPS — so no single JS Map reaches its hard 2^24-entry cap. Every map here is keyed per
// EDGE, VERTEX or TRIANGLE of the whole union, so its size grows with the town: Provincetown's first pour
// refined to 11.3M triangles (> 16.7M edges) and threw "Map maximum size exceeded" (2026-09-24).
// ⛔ Byte-identical by construction: the mesh is built only through get/set/has, never by iterating a map,
// so where an entry lives cannot change what is drawn. (The detector iterates its edge map; its totals are
// order-free, only the order of its findings — which one an error message names first — can differ.)
// 64 shards × 2^24 each is far past what the heap can hold, so the heap is the only limit left.
const SHARDS = 64
const shardOfNum = (k) => k % SHARDS                  // keys are non-negative integers, exact in a double
class ShardedMap {
  constructor(shardOf = shardOfNum) { this.m = Array.from({ length: SHARDS }, () => new Map()); this.of = shardOf }
  get(k) { return this.m[this.of(k)].get(k) }
  set(k, v) { this.m[this.of(k)].set(k, v); return this }
  has(k) { return this.m[this.of(k)].has(k) }
  *[Symbol.iterator]() { for (const s of this.m) yield* s }
}
class ShardedSet {
  constructor(shardOf = shardOfNum) { this.m = Array.from({ length: SHARDS }, () => new Set()); this.of = shardOf }
  add(k) { this.m[this.of(k)].add(k); return this }
  has(k) { return this.m[this.of(k)].has(k) }
}

// Uniform grid over vertex ids, for "which vertices lie near this edge".
function makeGrid(PX, PZ, ids, cell) {
  const grid = new ShardedMap()
  const B = 2 ** 20, M = 2 ** 21
  const ck = (cx, cz) => (cx + B) * M + (cz + B)
  for (const i of ids) {
    const k = ck(Math.floor(PX[i] / cell), Math.floor(PZ[i] / cell))
    let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i)
  }
  // Vertices strictly interior to segment (ax,az)-(bx,bz): within ON_EDGE_M of it and
  // more than ON_EDGE_M from both ends. Returns [{i, t}] sorted by t.
  function onSegment(ax, az, bx, bz, skip) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
    if (L2 < 1e-12) return []
    const L = Math.sqrt(L2)
    const x0 = Math.floor((Math.min(ax, bx) - ON_EDGE_M) / cell), x1 = Math.floor((Math.max(ax, bx) + ON_EDGE_M) / cell)
    const z0 = Math.floor((Math.min(az, bz) - ON_EDGE_M) / cell), z1 = Math.floor((Math.max(az, bz) + ON_EDGE_M) / cell)
    const out = []
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const a = grid.get(ck(cx, cz)); if (!a) continue
      for (const i of a) {
        if (skip && skip(i)) continue
        const px = PX[i], pz = PZ[i]
        const t = ((px - ax) * dx + (pz - az) * dz) / L2
        if (t * L <= ON_EDGE_M || (1 - t) * L <= ON_EDGE_M) continue
        if (Math.hypot(px - (ax + t * dx), pz - (az + t * dz)) > ON_EDGE_M) continue
        out.push({ i, t })
      }
    }
    out.sort((p, q) => p.t - q.t)
    return out
  }
  return { onSegment }
}

// The per-polygon path's refine policy, normalised; 'none' = emit as triangulated.
function normalizePolicy(refine) {
  let mode, maxEdge, tol, minEdge = 0, sampler = null
  if (refine && typeof refine === 'object') {
    mode = refine.mode || 'uniform'; maxEdge = refine.maxEdge; tol = refine.tol
    minEdge = refine.minEdge || 0; sampler = refine.sampler || null
  } else { mode = 'uniform'; maxEdge = refine }
  if (mode === 'adaptive' && (!sampler || !(tol > 0))) mode = 'uniform'
  const hasCap = maxEdge && maxEdge > 0 && Number.isFinite(maxEdge)
  if (mode === 'uniform' && !hasCap) mode = 'none'
  return { mode, maxEdgeSq: hasCap ? maxEdge * maxEdge : Infinity, minEdgeSq: minEdge * minEdge, tol, sampler,
           passes: mode === 'adaptive' ? 10 : mode === 'uniform' ? 8 : 0 }
}

/**
 * @param groupSpecs [{ polys: [{outer, holes}], refine, yLift }]
 * @returns [{ positions: Float32Array, indices: Uint32Array }] — one per spec, same order
 * @param stats optional object; filled with { inputTJunctions, closures, refineTJunctions }
 */
export function conformAndRefine(groupSpecs, stats = {}) {
  const PX = [], PZ = []
  const weld = new ShardedMap()
  const vid = (x, z) => {
    const k = weldKey(x, z)
    let i = weld.get(k)
    if (i === undefined) { i = PX.length; PX.push(x); PZ.push(z); weld.set(k, i) }
    return i
  }

  // (1) Weld and triangulate. ⭐ The RINGS ARE LEFT EXACTLY AS THEY ARE, so earcut
  // returns the same triangles the per-polygon path did and a polygon's interior
  // does not move. (Inserting the neighbours' vertices into the rings first was
  // built and measured: it closes the same cracks, but earcut re-triangulates every
  // polygon it touches, and on LS 20k changed triangles sat >10 m from any boundary.)
  // Winding: ShapeUtils emits CCW in (x,z), which is CW seen from +Y — flip at emit.
  let T = [], TG = []
  groupSpecs.forEach((g, gi) => {
    for (const p of g.polys) {
      const rings = [p.outer, ...(p.holes || [])].map(ring => {
        const ids = []
        for (const [x, z] of ring) { const i = vid(x, z); if (ids[ids.length - 1] !== i) ids.push(i) }
        while (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop()
        return ids
      })
      if (rings[0].length < 3) continue
      const [outer, ...holes] = [rings[0], ...rings.slice(1).filter(h => h.length >= 3)]
      const contourV = outer.map(i => new THREE.Vector2(PX[i], PZ[i]))
      const holesV = holes.map(h => h.map(i => new THREE.Vector2(PX[i], PZ[i])))
      const tris = THREE.ShapeUtils.triangulateShape(contourV, holesV)
      // triangulateShape strips a duplicated closing point IN PLACE; the rings were
      // de-duplicated above, so a length change here means the indices would lie.
      if (contourV.length !== outer.length || holesV.some((h, k) => h.length !== holes[k].length)) {
        throw new Error('[groundConformity] triangulateShape altered a ring — indices would not match')
      }
      const flat = [...outer, ...holes.flat()]
      for (const t of tris) {
        const a = flat[t[0]], b = flat[t[2]], c = flat[t[1]]
        if (a === b || b === c || c === a) continue          // collapsed by the weld: zero area
        T.push(a, b, c); TG.push(gi)
      }
    }
  })
  // ⭐ Per-group triangles and SLIVERS, before and after refinement — bookkeeping only (reads T/TG, writes
  // nothing the mesh uses). Red-green quarters a sliver into four slivers, so refinement MULTIPLYING a group's
  // slivers is the signature of the Provincetown explosion; `checks/claims-ground-refinement-does-not-breed-slivers`
  // reads these from ground.json.
  const shape = (withBoundary = false) => {
    const out = groupSpecs.map(() => ({ tris: 0, slivers: 0, areaM2: 0, ...(withBoundary ? { boundaryVerts: 0 } : {}) }))
    if (withBoundary) {
      // a group's own BOUNDARY vertices (on an edge only one of its triangles uses) — the closure fans'
      // reach, which grows with a group's perimeter, not its area
      const use = groupSpecs.map(() => new ShardedMap()), onB = groupSpecs.map(() => new ShardedSet())
      for (let t = 0; t < TG.length; t++) for (let k = 0; k < 3; k++) {
        const ek = edgeKey(T[t * 3 + k], T[t * 3 + (k + 1) % 3]), m = use[TG[t]]
        m.set(ek, (m.get(ek) || 0) + 1)
      }
      for (let t = 0; t < TG.length; t++) for (let k = 0; k < 3; k++) {
        const p = T[t * 3 + k], q = T[t * 3 + (k + 1) % 3], g = TG[t]
        if (use[g].get(edgeKey(p, q)) === 1) for (const v of [p, q]) if (!onB[g].has(v)) { onB[g].add(v); out[g].boundaryVerts++ }
      }
    }
    for (let t = 0; t < TG.length; t++) {
      const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2], r = out[TG[t]]
      const ar = Math.abs((PX[b] - PX[a]) * (PZ[c] - PZ[a]) - (PX[c] - PX[a]) * (PZ[b] - PZ[a])) / 2
      const L2 = Math.max((PX[a] - PX[b]) ** 2 + (PZ[a] - PZ[b]) ** 2, (PX[b] - PX[c]) ** 2 + (PZ[b] - PZ[c]) ** 2, (PX[c] - PX[a]) ** 2 + (PZ[c] - PZ[a]) ** 2)
      r.tris++; r.areaM2 += ar; if (L2 > 0 && ar / L2 < SLIVER_RATIO) r.slivers++
    }
    return out
  }
  stats.shapeBefore = shape()
  if (PX.length >= EDGE_MUL) throw new Error(`[groundConformity] ${PX.length} vertices exceeds the edge-key range`)

  // (2) Close every crack the input already has — exactly the detector's findings: a
  // boundary vertex on a BOUNDARY edge of the union (an edge one triangle uses). Most
  // are a group's border vertex lying mid-edge on its neighbour; the rest are ring
  // vertices earcut filtered as collinear, and mm-scale near-collinear chains where a
  // vertex 4.99 mm off an edge is "on" it and one 5.01 mm off is not. Run again after
  // refinement (3), which puts midpoints on one side of a hairline gap in the
  // partition within reach of the other side. ⛔ Throws if it does not reach a fixpoint.
  //
  // ⚠️ It can take many passes, and that is expected: across a hairline gap where one
  // side is a long straight chain of vertices (refinement midpoints ~9 cm apart) and
  // the other one edge a few cm off it, each pass snaps ONE more chain vertex,
  // because each split bends the sub-edge toward the next (measured on huron). It is
  // finite — every split consumes an existing boundary vertex, and the only vertex it
  // ever adds is a centroid, which is interior — so the cap guards a defect, not a budget.
  const MAX_PASSES = 256
  const closeAll = (label) => {
    let closed = 0, pass = 0
    for (; ; pass++) {
      const n = closeBoundaryTJunctions(PX, PZ, T, TG)
      if (!n) break
      closed += n.found
      T = n.T; TG = n.TG
      if (pass >= MAX_PASSES) throw new Error(`[groundConformity] boundary T-junctions (${label}) did not close after ${pass + 1} passes (${n.found} on the last) — refusing a partial weld`)
    }
    stats.passes = Math.max(stats.passes || 0, pass)
    return closed
  }
  stats.inputTJunctions = closeAll('before refinement')

  // (3) Red-green over the union. Same criterion and same conformity rule as the
  // per-polygon path, but `bisected` and the midpoint cache are GLOBAL, so a
  // split on one group's side of a shared edge is seen by the other group.
  const policies = groupSpecs.map(g => normalizePolicy(g.refine))
  // ⭐ F1: a 4-way split halved every edge per pass; longest-edge bisection halves ONE per pass, so the same
  // refinement depth takes TWICE the passes — the budget is the policy's, doubled by the construction.
  const LEB_PASSES_PER_LEVEL = 2
  const PASSES = Math.max(0, ...policies.map(p => p.passes * LEB_PASSES_PER_LEVEL))
  const midCache = new ShardedMap()
  const midpointIndex = (a, b) => {
    const k = edgeKey(a, b)
    let i = midCache.get(k)
    if (i === undefined) { i = PX.length; PX.push((PX[a] + PX[b]) * 0.5); PZ.push((PZ[a] + PZ[b]) * 0.5); midCache.set(k, i) }
    return i
  }
  const edgeSq = (a, b) => { const dx = PX[a] - PX[b], dz = PZ[a] - PZ[b]; return dx * dx + dz * dz }
  function terrainDev(s, a, b, c) {
    const ax = PX[a], az = PZ[a], bx = PX[b], bz = PZ[b], cx = PX[c], cz = PZ[c]
    const ya = s(ax, az), yb = s(bx, bz), yc = s(cx, cz)
    let d = 0, e
    e = Math.abs(s((ax + bx) / 2, (az + bz) / 2) - (ya + yb) / 2); if (e > d) d = e
    e = Math.abs(s((bx + cx) / 2, (bz + cz) / 2) - (yb + yc) / 2); if (e > d) d = e
    e = Math.abs(s((cx + ax) / 2, (cz + az) / 2) - (yc + ya) / 2); if (e > d) d = e
    e = Math.abs(s((ax + bx + cx) / 3, (az + bz + cz) / 3) - (ya + yb + yc) / 3); if (e > d) d = e
    return d
  }
  let closures = 0
  for (let pass = 0; pass < PASSES; pass++) {
    const n = TG.length
    const red = new Uint8Array(n)
    let anyRed = false
    for (let i = 0; i < n; i++) {
      const pol = policies[TG[i]]
      if (pol.mode === 'none' || pass >= pol.passes * LEB_PASSES_PER_LEVEL) continue
      const v0 = T[i * 3], v1 = T[i * 3 + 1], v2 = T[i * 3 + 2]
      const e01 = edgeSq(v0, v1), e12 = edgeSq(v1, v2), e20 = edgeSq(v2, v0)
      const longest = Math.max(e01, e12, e20)
      const split = pol.mode === 'adaptive'
        ? longest > pol.maxEdgeSq || (longest > pol.minEdgeSq && terrainDev(pol.sampler, v0, v1, v2) > pol.tol)
        : longest > pol.maxEdgeSq
      if (split) { red[i] = 1; anyRed = true }
    }
    if (!anyRed) break

    // ⭐ F1 — LONGEST-EDGE BISECTION (Rivara), not 4-way red-green. A red triangle bisects only its LONGEST
    // edge; the old 4-way split made four copies of a sliver's shape at every level, so a 12 km earcut
    // sliver became 4^k slivers (Provincetown's bay: 30,643 → 10.3M). Bisecting the longest edge halves the
    // long dimension, so a sliver's pieces grow with its LENGTH, not its area, and the minimum angle stays
    // bounded. CONFORMITY — the closure: every triangle with any bisected edge also bisects its OWN longest
    // edge (propagated by queue until stable), so a neighbour always splits the shared edge at the same
    // midpoint (the global cache). Then each triangle splits its longest edge first, and each child splits
    // the other bisected edge it carries.
    const longestK = (i) => { let best = 0, bk = 0
      for (let k = 0; k < 3; k++) { const L = edgeSq(T[i * 3 + k], T[i * 3 + (k + 1) % 3]); if (L > best) { best = L; bk = k } }
      return bk }
    const adj = new ShardedMap()
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
      const ek = edgeKey(T[i * 3 + k], T[i * 3 + (k + 1) % 3])
      const a = adj.get(ek); if (a) a.push(i); else adj.set(ek, [i])
    }
    const bisected = new ShardedSet()
    const queue = []
    const mark = (ek) => { if (bisected.has(ek)) return; bisected.add(ek); for (const j of adj.get(ek)) queue.push(j) }
    for (let i = 0; i < n; i++) if (red[i]) { const k = longestK(i); mark(edgeKey(T[i * 3 + k], T[i * 3 + (k + 1) % 3])) }
    while (queue.length) {
      const i = queue.pop()
      const k = longestK(i), ek = edgeKey(T[i * 3 + k], T[i * 3 + (k + 1) % 3])
      if (bisected.has(ek)) continue
      for (let q = 0; q < 3; q++) if (bisected.has(edgeKey(T[i * 3 + q], T[i * 3 + (q + 1) % 3]))) { mark(ek); break }
    }

    const nT = [], nG = []
    const push = (a, b, c, g) => { if (a !== b && b !== c && c !== a) { nT.push(a, b, c); nG.push(g) } }
    // split triangle (a,b,c) — orientation kept — on its bisected edges; (a,b) is its longest if split at all
    const splitChild = (a, b, c, g) => {
      // children of the longest bisection carry at most one more bisected edge, never (a,b) again
      if (bisected.has(edgeKey(b, c))) { const r = midpointIndex(b, c); push(a, b, r, g); push(a, r, c, g) }
      else if (bisected.has(edgeKey(c, a))) { const q = midpointIndex(c, a); push(a, b, q, g); push(q, b, c, g) }
      else push(a, b, c, g)
    }
    for (let i = 0; i < n; i++) {
      const g = TG[i]
      const k = longestK(i), a = T[i * 3 + k], b = T[i * 3 + (k + 1) % 3], c = T[i * 3 + (k + 2) % 3]
      if (!bisected.has(edgeKey(a, b))) { push(a, b, c, g); continue }
      if (!red[i]) closures++
      const m = midpointIndex(a, b)
      splitChild(a, m, c, g)          // child (a, m, c): its original edge (c, a) sits in splitChild's (C, A) slot
      splitChild(m, b, c, g)          // child (m, b, c): its original edge (b, c) sits in the (B, C) slot
    }
    T = nT; TG = nG
  }
  stats.closures = closures
  stats.refineTJunctions = closeAll('after refinement')
  stats.shapeAfter = shape(true)

  // (4) Back out to per-group buffers.
  return emit(groupSpecs, PX, PZ, T, TG)
}

// One pass: split every triangle whose boundary edge carries a boundary vertex.
// Returns null when there is nothing to split.
function closeBoundaryTJunctions(PX, PZ, T, TG) {
  const n = TG.length
  const cnt = new ShardedMap()
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const ek = edgeKey(T[t * 3 + k], T[t * 3 + (k + 1) % 3])
    cnt.set(ek, cnt.has(ek) ? -1 : t)                 // -1 = shared; else the one owner
  }
  const bnd = new Uint8Array(PX.length)             // boundary vertices: the detector's candidates
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const p = T[t * 3 + k], q = T[t * 3 + (k + 1) % 3]
    if (cnt.get(edgeKey(p, q)) === t) { bnd[p] = 1; bnd[q] = 1 }
  }
  const ids = []; for (let i = 0; i < bnd.length; i++) if (bnd[i]) ids.push(i)
  // ⭐ Decide on the geometry the .bin will CARRY: float32. The mesh is built in
  // float64 (so earcut and the refiner match the per-polygon path exactly), but the
  // detector reads float32, and at 3 km a vertex 5.001 mm off an edge here was 4.999
  // mm once written (huron: 20 left over). Rounding the whole build instead moved
  // near-threshold refine decisions across entire polygons — measured, rejected.
  const FX = Float32Array.from(PX), FZ = Float32Array.from(PZ)
  const { onSegment } = makeGrid(FX, FZ, ids, 4)
  const splits = new ShardedMap()                      // tri → [pts on edge 0, 1, 2]
  let found = 0
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const p = T[t * 3 + k], q = T[t * 3 + (k + 1) % 3]
    if (cnt.get(edgeKey(p, q)) !== t) continue
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2]
    const pts = onSegment(FX[p], FZ[p], FX[q], FZ[q], i => i === a || i === b || i === c).map(s => s.i)
    if (!pts.length) continue
    let sp = splits.get(t); if (!sp) splits.set(t, sp = [[], [], []])
    sp[k] = pts; found += pts.length
  }
  if (!found) return null
  const oT = [], oG = []
  // A child with a repeated corner is zero-area: drop it.
  const push = (a, b, c, g) => { if (a !== b && b !== c && c !== a) { oT.push(a, b, c); oG.push(g) } }
  for (let t = 0; t < n; t++) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2], g = TG[t]
    const sp = splits.get(t)
    if (!sp) { oT.push(a, b, c); oG.push(g); continue }
    const sides = [[a, b, c], [b, c, a], [c, a, b]]
    const hit = [0, 1, 2].filter(k => sp[k].length)
    if (hit.length === 1) {
      const [p, q, o] = sides[hit[0]]
      const seq = [p, ...sp[hit[0]], q]
      for (let k = 0; k < seq.length - 1; k++) push(seq[k], seq[k + 1], o, g)
      continue
    }
    const ring = []
    for (let k = 0; k < 3; k++) ring.push(sides[k][0], ...sp[k])
    const m = PX.length
    PX.push((PX[a] + PX[b] + PX[c]) / 3); PZ.push((PZ[a] + PZ[b] + PZ[c]) / 3)
    for (let k = 0; k < ring.length; k++) push(ring[k], ring[(k + 1) % ring.length], m, g)
  }
  return { T: oT, TG: oG, found }
}

// A shared vertex is duplicated into each group that draws it, with identical XZ.
function emit(groupSpecs, PX, PZ, T, TG) {
  const out = groupSpecs.map(() => ({ local: new ShardedMap(), pos: [], idx: [] }))
  for (let t = 0; t < TG.length; t++) {
    const gi = TG[t], r = out[gi], y = groupSpecs[gi].yLift || 0
    for (let k = 0; k < 3; k++) {
      const v = T[t * 3 + k]
      let li = r.local.get(v)
      if (li === undefined) { li = r.pos.length / 3; r.pos.push(PX[v], y, PZ[v]); r.local.set(v, li) }
      r.idx.push(li)
    }
  }
  return out.map(r => ({ positions: new Float32Array(r.pos), indices: new Uint32Array(r.idx) }))
}

/**
 * The detector. A crack is a BOUNDARY vertex (one with an unshared edge) lying in the
 * interior of a BOUNDARY edge of the UNION — an edge used by exactly one triangle
 * across ALL the groups given, welded on the lattice. ⭐ Union, not per group: an edge two groups share is closed; and a
 * zero-area triangle (a,c,b) sharing a–b with its neighbour is closed too (lifted, it
 * is a vertical sliver filling the gap), so it is not counted as a crack; nor is a
 * sliver's own apex on its unshared edge.
 * Reads baked buffers, so it runs on any slab on disk.
 * @param groups [{ id, positions: Float32Array, indices: Uint32Array }]
 * @param lift optional (x,z) → world-Y lift; with it each finding carries its crack height
 */
export function findTJunctions(groups, lift = null) {
  const PX = [], PZ = [], PG = []
  const cnt = new ShardedMap((ek) => Number(ek.slice(0, ek.indexOf(':'))) % SHARDS)   // union edge → { n, endpoints, group, opposite corner }
  groups.forEach((g, gi) => {
    const { positions: pos, indices: idx } = g
    const used = new Uint8Array(pos.length / 3)
    for (const v of idx) used[v] = 1
    for (let i = 0; i < used.length; i++) if (used[i]) { PX.push(pos[i * 3]); PZ.push(pos[i * 3 + 2]); PG.push(gi) }
    const wk = (i) => weldKey(pos[i * 3], pos[i * 3 + 2])
    for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
      const a = idx[t + k], b = idx[t + (k + 1) % 3]
      const ka = wk(a), kb = wk(b)
      if (ka === kb) continue
      const ek = ka < kb ? ka + ':' + kb : kb + ':' + ka
      const e = cnt.get(ek)
      if (e) e.n++
      else cnt.set(ek, { n: 1, ax: pos[a * 3], az: pos[a * 3 + 2], bx: pos[b * 3], bz: pos[b * 3 + 2], g: gi,
                         o: wk(idx[t + (k + 2) % 3]) })
    }
  })
  const edges = []
  const onBoundary = new ShardedSet()
  for (const [ek, e] of cnt) if (e.n === 1) {
    edges.push(e)
    const [ka, kb] = ek.split(':').map(Number); onBoundary.add(ka); onBoundary.add(kb)
  }
  // ⭐ Only a BOUNDARY vertex can open a crack: a crack is two unshared chains running
  // along each other (a→b on one side, a→P→b on the other). A vertex whose every edge
  // is shared is interior to the surface even when it sits millimetres from the rim —
  // the midpoints of a rim sliver do.
  const ids = []
  for (let i = 0; i < PX.length; i++) if (onBoundary.has(weldKey(PX[i], PZ[i]))) ids.push(i)
  const { onSegment } = makeGrid(PX, PZ, ids, 4)
  let within = 0, cross = 0
  const pairs = new Map()
  const found = []
  for (const { ax, az, bx, bz, g: eg, o } of edges) {
    const seen = new Set()
    for (const { i, t } of onSegment(ax, az, bx, bz)) {
      const k = weldKey(PX[i], PZ[i]); if (seen.has(k)) continue; seen.add(k)
      // The edge's own opposite corner is not a crack: that is a sliver on the rim of
      // the drawing, and lifted it is a surface, not a gap.
      if (k === o) continue
      const vg = PG[i]
      if (vg === eg) within++; else cross++
      const pn = groups[vg].id + ' → ' + groups[eg].id
      pairs.set(pn, (pairs.get(pn) || 0) + 1)
      const f = { x: PX[i], z: PZ[i], vertexGroup: groups[vg].id, edgeGroup: groups[eg].id, edgeLen: Math.hypot(bx - ax, bz - az) }
      if (lift) f.crack = Math.abs(lift(f.x, f.z) - (lift(ax, az) * (1 - t) + lift(bx, bz) * t))
      found.push(f)
    }
  }
  return { total: within + cross, within, cross, pairs, found, boundaryEdges: edges.length }
}
