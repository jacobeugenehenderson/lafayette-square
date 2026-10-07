// kerbLift.mjs — THE RAISED KERB, as geometry the ground bake applies (`BRIEF-corner-ramps-and-kerb §3` step 5).
//
// ⭐ RULED (2026-10-06): the WHOLE block inboard of the kerb face lifts by the town's authored height h (curb, walk, lawn,
// land use — alleys and paths painted inside it included); the road stays at 0. A RISER stands where the kerb is drawn;
// each curb cut slopes h → 0.
// ⭐ WHAT LIFTS is the painter's own block (`pr.block`, the partition Section paints into: every land use, lawn, walk and
// curb lies inside it and no road does — measured LS + Huron, 2026-10-07). One source; never a second list of groups.
// ⭐ h lives in the mesh's own y, UNEXAGGERATED: the runtime adds terrain × uExag on top (`terrainShader.js`), and a
// 15 cm kerb that grew with the town's exaggeration would be a Class D constant in disguise.
//
// The construction reads the mesh, never snaps to it:
//   · a cut is a RAMP (the cut's kerb-face span × the ramp run h/rampSlope, inward) and two FLARE triangles (run
//     h/flareSlope along the kerb). Their outlines are CUT INTO THE CONFORMED MESH (`groundConformity.js#cutAlong`), so
//     their crease lines are mesh edges — the paint is never sliced.
//   · each triangle lifts by its group's class; a vertex both a lifted and an unlifted triangle use is split in two,
//     and a lifted vertex takes the height field (`liftBuffer`).
//   · the riser is every mesh edge with a lifted triangle on one side and an unlifted one on the other — built from
//     the conformed mesh itself, so it shares the ground's vertices and cannot crack (`riserFromEdges`).
// ⭐ WHERE NO CURB IS DRAWN, THE BLOCK SLOPES DOWN FLUSH (Jacob, 2026-10-06, Q1): a highway shoulder, an alley mouth, land
//   that just meets the road. Every stretch of a block ring's OWN edge with no curb drawn inboard of it (`curblessEdges`
//   — split exactly where the post-paint curb starts and stops, never a rounded copy) carries a TAPER `taperRun` deep
//   (the town's value), 0 at the road to h at the run. ⛔ A step left without a riser after that is a defect, counted.
// ⚠️ A region claims a point within `TOL` of it: the partition sits on Clipper's 1 mm grid, so a curbless edge's own
//   vertices can sit half a millimetre off the taper base drawn along it, and the clamp then puts them exactly on it.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1]

/** A point-in-rings test over many rings (even-odd), bucketed by z rows so a point costs one row. */
export function ringsInside(rings) {
  const ROW = 8, rows = new Map()
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[j], b = r[i]; if (a[1] === b[1]) continue
    for (let k = Math.floor(Math.min(a[1], b[1]) / ROW); k <= Math.floor(Math.max(a[1], b[1]) / ROW); k++)
      (rows.get(k) || rows.set(k, []).get(k)).push([a, b])
  }
  return (P) => { let c = false
    for (const [a, b] of rows.get(Math.floor(P[1] / ROW)) || [])
      if ((a[1] > P[1]) !== (b[1] > P[1]) && P[0] < (b[0] - a[0]) * (P[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c
    return c }
}

/** The stretches of the block rings' own edges with NO curb drawn inboard of them. `blockRings` (the painter's block),
 *  `curbRings` (the post-paint curb + cut strips: an alley painted over the curb makes its mouth curbless). Each edge is
 *  split where a line 1 mm inboard of it crosses the curb, and each piece kept when its middle lies on no curb. Returns
 *  [{ A, B, inward }] on the block edge's own line, `inward` toward the block. */
export function curblessEdges(blockRings, curbRings) {
  const inBlock = ringsInside(blockRings), inCurb = ringsInside(curbRings), E = 1e-3, CELL = 8, cells = new Map()
  for (const r of curbRings) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]
    for (let x = Math.floor(Math.min(a[0], b[0]) / CELL); x <= Math.floor(Math.max(a[0], b[0]) / CELL); x++)
      for (let z = Math.floor(Math.min(a[1], b[1]) / CELL); z <= Math.floor(Math.max(a[1], b[1]) / CELL); z++)
        (cells.get(`${x},${z}`) || cells.set(`${x},${z}`, []).get(`${x},${z}`)).push([a, b]) }
  const out = []
  for (const r of blockRings) for (let i = 0; i < r.length; i++) {
    const A = r[i], B = r[(i + 1) % r.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 1e-6) continue
    const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]
    let n = [-u[1], u[0]]; if (!inBlock([M[0] + n[0] * E, M[1] + n[1] * E])) n = [-n[0], -n[1]]
    const P0 = [A[0] + n[0] * E, A[1] + n[1] * E], d = [B[0] - A[0], B[1] - A[1]]
    // where the inboard line crosses a curb edge, as fractions of the edge
    const ts = [0, 1], seen = new Set()
    for (let x = Math.floor(Math.min(A[0], B[0]) / CELL) - 1; x <= Math.floor(Math.max(A[0], B[0]) / CELL) + 1; x++)
      for (let z = Math.floor(Math.min(A[1], B[1]) / CELL) - 1; z <= Math.floor(Math.max(A[1], B[1]) / CELL) + 1; z++)
        for (const s2 of cells.get(`${x},${z}`) || []) { if (seen.has(s2)) continue; seen.add(s2)
          const [c, e] = s2, f = [e[0] - c[0], e[1] - c[1]], den = d[0] * f[1] - d[1] * f[0]; if (Math.abs(den) < 1e-12) continue
          const w = [c[0] - P0[0], c[1] - P0[1]], t = (w[0] * f[1] - w[1] * f[0]) / den, v = (w[0] * d[1] - w[1] * d[0]) / den
          if (t > 0 && t < 1 && v >= 0 && v <= 1) ts.push(t) }
    ts.sort((a, b) => a - b)
    for (let k = 0; k + 1 < ts.length; k++) { const t0 = ts[k], t1 = ts[k + 1]; if ((t1 - t0) * L < 1e-6) continue
      const tm = (t0 + t1) / 2; if (inCurb([P0[0] + d[0] * tm, P0[1] + d[1] * tm])) continue
      const at = (t) => t === 0 ? A : t === 1 ? B : [A[0] + d[0] * t, A[1] + d[1] * t]
      out.push({ A: at(t0), B: at(t1), inward: n }) }
  }
  return out
}

/** Everything the bake needs to lift its ground: `blockRings` (the painter's block — what lifts), `curbRings` (the
 *  post-paint curb + cut strips), the curb cuts' `ramps`, the town's `kerb`. Returns { inBlock, curbless, curblessM,
 *  regions }. Throws when the block has curbless edges and the town's kerb norm gives no taperRun. */
export function kerbPlan({ blockRings, curbRings, ramps, kerb }) {
  const curbless = curblessEdges(blockRings, curbRings)
  const curblessM = curbless.reduce((n, { A, B }) => n + Math.hypot(B[0] - A[0], B[1] - A[1]), 0)
  if (curbless.length && !(kerb.taperRun > 0))
    throw new Error(`[kerbLift] ⛔ the kerb stands ${kerb.height} m and ${curblessM.toFixed(0)} m of block edge has NO curb drawn (alleys, shoulders, land meeting the road), where the block slopes down flush — but the town's kerb norm gives no taperRun, the town's value, never the kit's (norms.json → kerb.taperRun, metres).`)
  return { inBlock: ringsInside(blockRings), curbless, curblessM, regions: [...kerbRegions(ramps, kerb), ...taperRegions(curbless, kerb.taperRun)] }
}

/** A TAPER per curbless edge: the edge × `taperRun` inward (toward the lifted group), 0 → h linearly. */
export function taperRegions(edges, taperRun) {
  const out = []
  for (const { A, B, inward: n } of edges) {
    const w = Math.hypot(B[0] - A[0], B[1] - A[1]), u = [(B[0] - A[0]) / w, (B[1] - A[1]) / w]
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

const TOL = 2e-3                                    // a region claims a point within 2 mm of it (Clipper's 1 mm slices)

// whether P lies on region g, in g's own frame (s along the face, t inward), and the height g asks for there
function regionAt(g, P, h) {
  const d = sub(P, g.A), s = dot(d, g.u), t = dot(d, g.inward)
  if (t < -TOL || t > g.R + TOL) return null
  const tc = Math.max(0, Math.min(g.R, t))
  if (g.kind === 'ramp') return s < -TOL || s > g.w + TOL ? null : h * tc / g.R
  const ds = g.kind === 'flareA' ? -s : s - g.w                      // distance past the ramp's end, along the kerb
  if (ds < -TOL || ds > g.F * (1 - tc / g.R) + TOL) return null
  return Math.min(h, h * (tc / g.R + Math.max(0, ds) / g.F))
}

const bboxOf = (rings) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const r of rings) for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return [a, b, c, d] }

/** The height field: `y(P)` = h, or less on a cut's ramp/flares or a curbless taper (the lowest region wins). */
export function makeHeightField(regions, h) {
  const CELL = 16, cells = new Map()
  regions.forEach((g, gi) => { const [a, b, c, d] = bboxOf([g.poly])
    for (let x = Math.floor((a - TOL) / CELL); x <= Math.floor((c + TOL) / CELL); x++) for (let z = Math.floor((b - TOL) / CELL); z <= Math.floor((d + TOL) / CELL); z++)
      (cells.get(`${x},${z}`) || cells.set(`${x},${z}`, []).get(`${x},${z}`)).push(gi) })
  const y = (P) => { let v = h
    for (const gi of cells.get(`${Math.floor(P[0] / CELL)},${Math.floor(P[1] / CELL)}`) || []) {
      const r = regionAt(regions[gi], P, h); if (r != null) v = Math.min(v, r) }
    return v }
  return { y }
}

/** Lift one group's buffer: each triangle `liftAt` its centroid takes the field's height at its vertices (added to the y
 *  it already has); a vertex used by a lifted AND an unlifted triangle is split. Returns new buffers + per-triangle side. */
export function liftBuffer({ positions, indices }, field, liftAt) {
  const nt = indices.length / 3, side = new Uint8Array(nt)
  for (let t = 0; t < nt; t++) {
    const a = indices[3 * t] * 3, b = indices[3 * t + 1] * 3, c = indices[3 * t + 2] * 3
    side[t] = liftAt([(positions[a] + positions[b] + positions[c]) / 3, (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3]) ? 1 : 0
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
  const pos = [], idx = [], bareM = {}, bareAt = {}
  let kerbM = 0
  for (const { in: I, out: O } of edges.values()) {
    if (!I || !O) continue
    const L = Math.hypot(I.b[0] - I.a[0], I.b[2] - I.a[2])
    if (!kerbKeys.has(I.key)) { if (I.a[1] > 1e-6 || I.b[1] > 1e-6) { const k = `${I.key}|${O.key}`; bareM[k] = (bareM[k] || 0) + L
      const at = (bareAt[k] ||= []); if (at.length < 6) at.push([(I.a[0] + I.b[0]) / 2, (I.a[2] + I.b[2]) / 2]) } continue }
    // bottom = the unlifted side's own vertices at the same xz (their y), top = the lifted side's
    const bot = (p) => (Math.abs(O.a[0] - p[0]) + Math.abs(O.a[2] - p[2]) < 1e-9 ? O.a : O.b)
    const ta = I.a, tb = I.b, ba = bot(ta), bb = bot(tb)
    if (ta[1] - ba[1] <= 1e-6 && tb[1] - bb[1] <= 1e-6) continue   // the cut's flush span: nothing stands
    const o = pos.length / 3
    pos.push(...ba, ...bb, ...tb, ...ta)
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3)
    kerbM += L
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx), kerbM, bareM, bareAt }
}
