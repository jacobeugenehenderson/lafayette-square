// kerbLift.mjs — THE RAISED KERB, as geometry the ground bake applies (`BRIEF-corner-ramps-and-kerb §3` step 5).
//
// ⭐ RULED (2026-10-06): the WHOLE block inboard of the kerb face lifts by the town's authored height h (curb, walk, lawn,
// land use — everything inside the frozen curb ring `iA`, alleys and paths painted inside it included); the asphalt —
// everything outside `iA` — stays at 0. A RISER stands where the kerb is drawn; each curb cut slopes h → 0.
// ⭐ h lives in the mesh's own y, UNEXAGGERATED: the runtime adds terrain × uExag on top (`terrainShader.js`), and a
// 15 cm kerb that grew with the town's exaggeration would be a Class D constant in disguise.
//
// The construction reads the mesh, never snaps to it:
//   · a cut is a RAMP (the cut's kerb-face span × the ramp run h/rampSlope, inward) and two FLARE triangles (run
//     h/flareSlope along the kerb). Their outlines are SLICED into every ground polygon before triangulation, so their
//     crease lines are mesh edges and the height on them is exact (`sliceByRegions`).
//   · each triangle is inside or outside the block by its centroid; a vertex both sides use is split in two, and an
//     inside vertex takes the height field (`liftBuffer`).
//   · the riser is every mesh edge with a lifted triangle on one side and an unlifted one on the other — built from
//     the conformed mesh itself, so it shares the ground's vertices and cannot crack (`riserFromEdges`).
// ⭐ WHERE NO CURB IS DRAWN, THE BLOCK SLOPES DOWN FLUSH (Jacob, 2026-10-06, Q1): a highway shoulder, an alley mouth, land
//   that just meets the road. Each curbless stretch of the block's edge (`curblessSegments`) carries a TAPER — a slice
//   `taperRun` deep (the town's value, `kerb.taperRun`), 0 at the road to h at the run — so it has no step and no riser.
//   Raised where a curb is, flush where none is. ⛔ A step left without a riser after that is a defect, and is counted.
import clipperLib from 'clipper-lib'

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1]
const SCALE = 1000                                  // clipper integer units per metre → 1 mm, as the rest of the bake

/** The stretches of the block edge with NO curb drawn: the block rings' outlines, as open paths, less the drawn curb
 *  (the post-paint curb + cut strips, grown by 1 mm so a shared edge reads as covered). Returns [[A, B], …] segments. */
export function curblessSegments(blockRings, curbRings) {
  const { Clipper, ClipperOffset, PolyTree, ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib
  const toP = (r) => r.map(([x, z]) => ({ X: Math.round(x * SCALE), Y: Math.round(z * SCALE) }))
  const co = new ClipperOffset()
  for (const r of curbRings) if (r?.length >= 3) co.AddPath(toP(r), JoinType.jtMiter, EndType.etClosedPolygon)
  const grown = []; co.Execute(grown, 1)              // 1 clipper unit = 1 mm
  const c = new Clipper()
  for (const r of blockRings) if (r?.length >= 3) c.AddPath([...toP(r), toP(r)[0]], PolyType.ptSubject, false)
  for (const g of grown) c.AddPath(g, PolyType.ptClip, true)
  const tree = new PolyTree()
  c.Execute(ClipType.ctDifference, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const segs = []
  for (const path of Clipper.OpenPathsFromPolyTree(tree))
    for (let i = 0; i + 1 < path.length; i++) segs.push([[path[i].X / SCALE, path[i].Y / SCALE], [path[i + 1].X / SCALE, path[i + 1].Y / SCALE]])
  return segs.filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-3)
}

/** A TAPER per curbless segment: the segment × `taperRun` inward (the block side, by `inside`), 0 → h linearly. */
export function taperRegions(segments, taperRun, inside) {
  const out = []
  for (const [A, B] of segments) {
    const w = Math.hypot(B[0] - A[0], B[1] - A[1]), u = [(B[0] - A[0]) / w, (B[1] - A[1]) / w]
    const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], n0 = [-u[1], u[0]], dl = 1e-3 * w
    const n = inside([M[0] + n0[0] * dl, M[1] + n0[1] * dl]) ? n0 : [-n0[0], -n0[1]]
    const at = (s, t) => [A[0] + u[0] * s + n[0] * t, A[1] + u[1] * s + n[1] * t]
    out.push({ kind: 'ramp', taper: true, A, u, inward: n, w, R: taperRun, F: null, poly: [at(0, 0), at(w, 0), at(w, taperRun), at(0, taperRun)] })
  }
  return out
}

/** Ramp + flare regions for every cut. Each: { kind, poly, A, u, inward, w, R, F }. */
export function kerbRegions(ramps, { height: h, rampSlope, flareSlope }) {
  const R = h / rampSlope, F = h / flareSlope, out = []
  for (const c of ramps) {
    const [A, B] = c.face, n = c.inward, w = Math.hypot(B[0] - A[0], B[1] - A[1])
    if (!(w > 1e-6)) continue
    const u = [(B[0] - A[0]) / w, (B[1] - A[1]) / w], at = (s, t) => [A[0] + u[0] * s + n[0] * t, A[1] + u[1] * s + n[1] * t]
    const base = { A, u, inward: n, w, R, F }
    out.push({ ...base, kind: 'ramp', poly: [at(0, 0), at(w, 0), at(w, R), at(0, R)] })
    out.push({ ...base, kind: 'flareA', poly: [at(-F, 0), at(0, 0), at(0, R)] })
    out.push({ ...base, kind: 'flareB', poly: [at(w, 0), at(w + F, 0), at(w, R)] })
  }
  return out
}

// the height a region asks for at P (h where it does not reach)
function regionY(g, P, h) {
  const d = sub(P, g.A), s = dot(d, g.u), t = Math.max(0, Math.min(g.R, dot(d, g.inward)))
  if (g.kind === 'ramp') return h * t / g.R
  const ds = g.kind === 'flareA' ? -s : s - g.w
  return Math.min(h, h * (t / g.R + Math.max(0, ds) / g.F))
}

function inPoly(P, poly) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if ((zi > P[1]) !== (zj > P[1]) && P[0] < (xj - xi) * (P[1] - zi) / (zj - zi) + xi) c = !c
  }
  return c
}

const bboxOf = (rings) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const r of rings) for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return [a, b, c, d] }
const overlaps = (p, q) => p[0] <= q[2] && q[0] <= p[2] && p[1] <= q[3] && q[1] <= p[3]

/** Split rings by every region they overlap, so each region's outline becomes edges. `ops` = { intersect, difference }
 *  over rings (even-odd). Returns rings. A ring set no region touches is returned as is. */
export function sliceByRegions(rings, regions, ops) {
  if (!regions.length || !rings.length) return rings
  const bb = bboxOf(rings), hit = regions.filter(g => overlaps(bb, bboxOf([g.poly])))
  if (!hit.length) return rings
  let rest = rings
  const pieces = []
  for (const g of hit) {
    if (!rest.length) break
    const inside = ops.intersect(rest, [g.poly])
    if (!inside.length) continue
    pieces.push(...inside)
    rest = ops.difference(rest, [g.poly])
  }
  return [...rest, ...pieces]
}

/** `inside(P)` = within the block union (even-odd over the curb rings), bucketed by z rows so a point costs one row. */
export function blockInside(blockRings) {
  const ROW = 8, rows = new Map()
  for (const r of blockRings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[j], b = r[i]; if (a[1] === b[1]) continue
    for (let k = Math.floor(Math.min(a[1], b[1]) / ROW); k <= Math.floor(Math.max(a[1], b[1]) / ROW); k++)
      (rows.get(k) || rows.set(k, []).get(k)).push([a, b])
  }
  const inside = (P) => { let c = false
    for (const [a, b] of rows.get(Math.floor(P[1] / ROW)) || [])
      if ((a[1] > P[1]) !== (b[1] > P[1]) && P[0] < (b[0] - a[0]) * (P[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c
    return c }
  return inside
}

/** The height field: `inside` (from `blockInside`), and `y(P)` = h, or less inside a cut's ramp/flares or a curbless
 *  taper (the lowest region wins). */
export function makeHeightField(inside, regions, h) {
  const CELL = 16, cells = new Map()
  regions.forEach((g, gi) => { const [a, b, c, d] = bboxOf([g.poly])
    for (let x = Math.floor(a / CELL); x <= Math.floor(c / CELL); x++) for (let z = Math.floor(b / CELL); z <= Math.floor(d / CELL); z++)
      (cells.get(`${x},${z}`) || cells.set(`${x},${z}`, []).get(`${x},${z}`)).push(gi) })
  const y = (P) => { let v = h
    for (const gi of cells.get(`${Math.floor(P[0] / CELL)},${Math.floor(P[1] / CELL)}`) || []) {
      const g = regions[gi]
      // on or inside the region (its own edges included: a vertex ON a crease belongs to both, and both agree there)
      if (inPoly(P, g.poly) || onEdge(P, g.poly)) v = Math.min(v, regionY(g, P, h))
    }
    return v }
  return { inside, y }
}

function onEdge(P, poly) {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i], ab = sub(b, a), L2 = dot(ab, ab); if (!L2) continue
    const t = dot(sub(P, a), ab) / L2; if (t < -1e-9 || t > 1 + 1e-9) continue
    const q = [a[0] + ab[0] * t, a[1] + ab[1] * t]; if (Math.hypot(P[0] - q[0], P[1] - q[1]) <= 1e-6 * Math.sqrt(L2)) return true
  }
  return false
}

/** Lift one group's buffer: each triangle inside the block takes the field's height at its vertices (added to the y it
 *  already has); a vertex used by an inside AND an outside triangle is split. Returns new buffers + per-triangle side. */
export function liftBuffer({ positions, indices }, field) {
  const nt = indices.length / 3, side = new Uint8Array(nt)
  for (let t = 0; t < nt; t++) {
    const a = indices[3 * t] * 3, b = indices[3 * t + 1] * 3, c = indices[3 * t + 2] * 3
    side[t] = field.inside([(positions[a] + positions[b] + positions[c]) / 3, (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3]) ? 1 : 0
  }
  const nv = positions.length / 3, usedIn = new Uint8Array(nv), usedOut = new Uint8Array(nv)
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) (side[t] ? usedIn : usedOut)[indices[3 * t + k]] = 1
  const extra = []                       // vertices both sides use: the inside triangles get a copy
  const copyOf = new Int32Array(nv).fill(-1)
  for (let v = 0; v < nv; v++) if (usedIn[v] && usedOut[v]) { copyOf[v] = nv + extra.length; extra.push(v) }
  const P = new Float32Array((nv + extra.length) * 3); P.set(positions)
  extra.forEach((v, i) => { P[(nv + i) * 3] = positions[v * 3]; P[(nv + i) * 3 + 1] = positions[v * 3 + 1]; P[(nv + i) * 3 + 2] = positions[v * 3 + 2] })
  const I = new Uint32Array(indices)
  for (let t = 0; t < nt; t++) if (side[t]) for (let k = 0; k < 3; k++) { const v = I[3 * t + k]; if (copyOf[v] >= 0) I[3 * t + k] = copyOf[v] }
  const lifted = new Uint8Array(nv + extra.length)
  for (let t = 0; t < nt; t++) if (side[t]) for (let k = 0; k < 3; k++) lifted[I[3 * t + k]] = 1
  for (let v = 0; v < lifted.length; v++) if (lifted[v]) P[v * 3 + 1] += field.y([P[v * 3], P[v * 3 + 2]])
  return { positions: P, indices: I, side, split: extra.length }
}

/** The riser: every mesh edge between a LIFTED triangle and an UNLIFTED one, across all partition groups. Kerb where
 *  the lifted side is one of `kerbKeys`; anywhere else it is a step with no riser, counted by the pair of groups.
 *  `groups`: [{ key, positions, indices, side }] (after `liftBuffer`). Returns { positions, indices, kerbM, bareM }. */
export function riserFromEdges(groups, kerbKeys) {
  const k2 = (x, z) => `${x},${z}`, edges = new Map()
  for (const g of groups) {
    const { positions: P, indices: I, side } = g
    for (let t = 0; t < side.length; t++) for (let e = 0; e < 3; e++) {
      const a = I[3 * t + e], b = I[3 * t + (e + 1) % 3]
      const ka = k2(P[a * 3], P[a * 3 + 2]), kb = k2(P[b * 3], P[b * 3 + 2]), key = ka < kb ? ka + '|' + kb : kb + '|' + ka
      const rec = edges.get(key) || edges.set(key, { in: null, out: null }).get(key)
      const v = { key: g.key, a: [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], b: [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]] }
      if (side[t]) rec.in = rec.in || v; else rec.out = rec.out || v
    }
  }
  const pos = [], idx = [], bareM = {}
  let kerbM = 0
  for (const { in: I, out: O } of edges.values()) {
    if (!I || !O) continue
    const L = Math.hypot(I.b[0] - I.a[0], I.b[2] - I.a[2])
    if (!kerbKeys.has(I.key)) { if (I.a[1] > 1e-6 || I.b[1] > 1e-6) { const k = `${I.key}|${O.key}`; bareM[k] = (bareM[k] || 0) + L } continue }
    // bottom = the unlifted side's own vertices at the same xz (their y), top = the lifted side's
    const bot = (p) => (Math.abs(O.a[0] - p[0]) + Math.abs(O.a[2] - p[2]) < 1e-9 ? O.a : O.b)
    const ta = I.a, tb = I.b, ba = bot(ta), bb = bot(tb)
    if (ta[1] - ba[1] <= 1e-6 && tb[1] - bb[1] <= 1e-6) continue   // the cut's flush span: nothing stands
    const o = pos.length / 3
    pos.push(...ba, ...bb, ...tb, ...ta)
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3)
    kerbM += L
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx), kerbM, bareM }
}
