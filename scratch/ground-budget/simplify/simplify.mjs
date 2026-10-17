// simplify.mjs — SIMPLIFY THE FINE GROUND AFTER IT IS BUILT (BRIEF-the-ground-stays-in-budget §3 step 6; prototype, scratch).
//
// Reads a finished slab (ground.json + ground.bin), read-only, and writes a copy whose groups carry fewer triangles. The
// drawn surface is `aRaw × uExag + y` (src/lib/drawnGround.js); a vertex is removed only where the surface without it
// stays within TOL of the ORIGINAL surface at every original vertex it covers, at every exaggeration the town draws:
// |Δraw|·E + |Δy| ≤ TOL, E = the town's authored `terrainExag` ceiling (scene.json, read). Because every original
// vertex's raw IS the deformer's heightAt there (bake-ground.js terrainPart), this is the deformer's own refine contract
// (chord vs heightAt ≤ refineTol), kept at every sample the refiner took.
//
// ⭐ THE METHOD: half-edge collapse u → v (u removed, v kept where it is), cheapest first. Survivors never move, so their
//   raw and y are untouched; aGrad is recomputed from the simplified mesh with bake-ground.js#terrainPart's own rule
//   (area-weighted mean of the incident triangles' gradients) — ⚠️ ported, not imported: the bake's is a closure.
// ⭐ THE CHECK IS EXACT, not sampled: every original vertex a new triangle covers, plus every crossing of an original edge
//   with a new edge (the overlay's vertices; the difference is linear inside each overlay cell).
// ⭐ SEAMS: a vertex on a group's boundary, on a non-manifold edge, on an xz twin, or at a position another group also
//   uses is LOCKED (phase 1). Seams are therefore byte-identical and no T-junction can be made or removed.
// ⭐ A collapse is refused if any new triangle flips, overlaps a live triangle around the ring (no new fold), or its altitude
//   falls under the partition's lattice (LATTICE_M, read).
//
//   node --max-old-space-size=8192 scratch/ground-budget/simplify/simplify.mjs --in=<slab dir> --out=<dir> --tol=<m>
//        --scene=<scene.json> [--only=<substr,…>]
// Refuses loudly: a group with no baked raw, a group carrying field sections, a scene with no terrainExag.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { LATTICE_M } from '../../../src/lib/lattice.js'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const IN = arg('in'), OUT = arg('out'), TOL = +arg('tol'), SCENE = arg('scene')
const ONLY = arg('only')?.split(',')
if (!IN || !OUT || !(TOL > 0) || !SCENE) throw new Error('usage: --in= --out= --tol=<m> --scene=<scene.json>')
const E = JSON.parse(readFileSync(SCENE, 'utf8')).terrainExag
if (!(E > 0)) throw new Error(`simplify: ${SCENE} names no terrainExag — the bound cannot be held at an exaggeration nobody stated`)

const gj = JSON.parse(readFileSync(join(IN, 'ground.json'), 'utf8'))
const buf = readFileSync(join(IN, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
for (const g of gj.groups) {
  if (g.fieldByteOffset != null) throw new Error(`simplify: group ${g.id} carries field sections — not handled by this prototype`)
  if (g.rawByteOffset == null || g.gradByteOffset == null) throw new Error(`simplify: group ${g.id} carries no baked raw/grad — this slab predates the deformer`)
}
const t0 = Date.now()

// positions in ≥ 2 groups (welded on the lattice, as groundConformity.js#weldKey does): locked everywhere (phase 1 never touches a seam)
const xzKey = (x, z) => Math.round(x / LATTICE_M) + ',' + Math.round(z / LATTICE_M)   // the conformity weld's own grid
const groupsAt = new Map()
gj.groups.forEach((g, gi) => { const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3)
  for (let v = 0; v < g.vertexCount; v++) { const k = xzKey(P[v * 3], P[v * 3 + 2]), s = groupsAt.get(k); if (s === undefined) groupsAt.set(k, gi); else if (s !== gi) groupsAt.set(k, -1) } })

function simplifyGroup(g) {
  const nv = g.vertexCount, P = new Float32Array(AB, g.vertexByteOffset, nv * 3), R = new Float32Array(AB, g.rawByteOffset, nv)
  const I0 = new Uint32Array(AB, g.indexByteOffset, g.indexCount), nt = I0.length / 3
  const T = Int32Array.from(I0), alive = new Uint8Array(nt).fill(1)
  const X = (v) => P[v * 3], Y = (v) => P[v * 3 + 1], Z = (v) => P[v * 3 + 2]
  const area2 = (a, b, c) => (X(b) - X(a)) * (Z(c) - Z(a)) - (X(c) - X(a)) * (Z(b) - Z(a))
  const sgn = new Int8Array(nt)
  for (let t = 0; t < nt; t++) { const s = area2(T[3 * t], T[3 * t + 1], T[3 * t + 2]); sgn[t] = s > 0 ? 1 : s < 0 ? -1 : 0 }
  // vertex → triangles
  const vt = Array.from({ length: nv }, () => [])
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) vt[T[3 * t + k]].push(t)
  // locks
  const lock = new Uint8Array(nv), ec = new Map()
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const a = T[3 * t + k], b = T[3 * t + (k + 1) % 3]; const e = a < b ? a * nv + b : b * nv + a; ec.set(e, (ec.get(e) || 0) + 1) }
  for (const [e, n] of ec) if (n !== 2) { lock[Math.floor(e / nv)] = 1; lock[e % nv] = 1 }
  const seen = new Map()
  for (let v = 0; v < nv; v++) { const k = xzKey(X(v), Z(v)); if (groupsAt.get(k) === -1) lock[v] = 1
    if (seen.has(k)) { lock[v] = 1; lock[seen.get(k)] = 1 } else seen.set(k, v) }
  for (let t = 0; t < nt; t++) if (sgn[t] === 0) for (let k = 0; k < 3; k++) lock[T[3 * t + k]] = 1   // a collinear triangle: leave its corners
  for (let v = 0; v < nv; v++) if (vt[v].length === 0) lock[v] = 1
  // ⭐ A FOLD: the input covers the same xz twice inside one group (measured: overlap.mjs — HPDM HEAD's sidewalk has 41,622
  //   vertices strictly inside another of its own triangles). There "the surface" is not one height, so nothing there is
  //   simplified: every corner of a triangle that overlaps another of the group's triangles (2D SAT, interior overlap
  //   deeper than LATTICE_M) is locked, and counted.
  let folds = 0
  { const C = 1, grid = new Map()
    const tb = (t) => { const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; return [Math.min(X(a), X(b), X(c)), Math.min(Z(a), Z(b), Z(c)), Math.max(X(a), X(b), X(c)), Math.max(Z(a), Z(b), Z(c))] }
    for (let t = 0; t < nt; t++) { if (!sgn[t]) continue; const [x0, z0, x1, z1] = tb(t)
      for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++) for (let gz = Math.floor(z0 / C); gz <= Math.floor(z1 / C); gz++) { const k = gx * 1e6 + gz; const L = grid.get(k); if (L) L.push(t); else grid.set(k, [t]) } }
    const sep = (s, t) => {   // true if s and t are separated (or touch) on some edge normal
      for (const [p, q] of [[s, t], [t, s]]) for (let k = 0; k < 3; k++) {
        const a = T[3 * p + k], b = T[3 * p + (k + 1) % 3], nx = Z(b) - Z(a), nz = X(a) - X(b), len = Math.hypot(nx, nz); if (!len) continue
        let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity
        for (let j = 0; j < 3; j++) { const w = T[3 * p + j], d = (X(w) * nx + Z(w) * nz) / len; p0 = Math.min(p0, d); p1 = Math.max(p1, d) }
        for (let j = 0; j < 3; j++) { const w = T[3 * q + j], d = (X(w) * nx + Z(w) * nz) / len; q0 = Math.min(q0, d); q1 = Math.max(q1, d) }
        if (Math.min(p1, q1) - Math.max(p0, q0) <= LATTICE_M) return true }
      return false }
    const fold = new Uint8Array(nt)
    for (const L of grid.values()) for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const s = L[i], t = L[j]; if (fold[s] && fold[t]) continue; if (!sep(s, t)) { fold[s] = 1; fold[t] = 1 } }
    for (let t = 0; t < nt; t++) if (fold[t]) { folds++; for (let k = 0; k < 3; k++) lock[T[3 * t + k]] = 1 } }
  // ⭐ THE CROSSINGS: two piecewise-linear surfaces part most at the vertices of their overlay — the original vertices,
  //   the kept ones (exact), and where an ORIGINAL edge crosses a NEW edge. The last is a property of the new edge alone
  //   (the original is linear along its own edge, the new one along its), so each new edge is checked once and cached.
  //   (Measured without it: 2.4% of the walk's area over the bound, up to 571 mm — worst.mjs.)
  const EA = [], EB = []
  for (const e of ec.keys()) { EA.push(Math.floor(e / nv)); EB.push(e % nv) }
  const egrid = new Map(), EC = 1
  for (let i = 0; i < EA.length; i++) { const a = EA[i], b = EB[i]
    for (let gx = Math.floor(Math.min(X(a), X(b)) / EC); gx <= Math.floor(Math.max(X(a), X(b)) / EC); gx++) for (let gz = Math.floor(Math.min(Z(a), Z(b)) / EC); gz <= Math.floor(Math.max(Z(a), Z(b)) / EC); gz++) {
      const k = gx * 1e6 + gz; const L = egrid.get(k); if (L) L.push(i); else egrid.set(k, [i]) } }
  const edgeCache = new Map()
  function crossErr(v, w) {
    const key = v < w ? v * nv + w : w * nv + v, hit = edgeCache.get(key); if (hit !== undefined) return hit
    let worst = 0; const seen = new Set()
    const vx = X(v), vz = Z(v), dx = X(w) - vx, dz = Z(w) - vz
    for (let gx = Math.floor(Math.min(vx, X(w)) / EC); gx <= Math.floor(Math.max(vx, X(w)) / EC) && worst <= TOL; gx++) for (let gz = Math.floor(Math.min(vz, Z(w)) / EC); gz <= Math.floor(Math.max(vz, Z(w)) / EC); gz++) {
      for (const i of egrid.get(gx * 1e6 + gz) || []) { if (seen.has(i)) continue; seen.add(i)
        const a = EA[i], b = EB[i]; if (a === v || a === w || b === v || b === w) continue
        const ex = X(b) - X(a), ez = Z(b) - Z(a), den = dx * ez - dz * ex; if (den === 0) continue
        const qx = X(a) - vx, qz = Z(a) - vz, s = (qx * ez - qz * ex) / den, t = (qx * dz - qz * dx) / den
        if (s <= 0 || s >= 1 || t <= 0 || t >= 1) continue
        const e = Math.abs((R[v] + s * (R[w] - R[v])) - (R[a] + t * (R[b] - R[a]))) * E + Math.abs((Y(v) + s * (Y(w) - Y(v))) - (Y(a) + t * (Y(b) - Y(a))))
        if (e > worst) worst = e } }
    edgeCache.set(key, worst); return worst
  }
  // triangles s and t (u read as v in both) separated, or touching, on some edge normal — the fold test, after a collapse
  const corner = (t, k, u, v) => { const w = T[3 * t + k]; return w === u ? v : w }
  function sepSub(s, t, u, v) {
    for (const [p, q] of [[s, t], [t, s]]) for (let k = 0; k < 3; k++) {
      const a = corner(p, k, u, v), b = corner(p, (k + 1) % 3, u, v), nx = Z(b) - Z(a), nz = X(a) - X(b), len = Math.hypot(nx, nz); if (!len) continue
      let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity
      for (let j = 0; j < 3; j++) { const w = corner(p, j, u, v), d = (X(w) * nx + Z(w) * nz) / len; if (d < p0) p0 = d; if (d > p1) p1 = d }
      for (let j = 0; j < 3; j++) { const w = corner(q, j, u, v), d = (X(w) * nx + Z(w) * nz) / len; if (d < q0) q0 = d; if (d > q1) q1 = d }
      if (Math.min(p1, q1) - Math.max(p0, q0) <= LATTICE_M) return true }
    return false }
  const pts = new Array(nt).fill(null)   // removed original vertices, by the triangle that now covers them
  const dead = new Uint8Array(nv)
  let maxErrSeen = 0

  // where p falls in triangle t (with u read as v): barycentric weights or null
  const EPSB = 1e-7
  function bary(t, u, v, p) {
    let a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; if (a === u) a = v; else if (b === u) b = v; else if (c === u) c = v
    const d = area2(a, b, c); if (d === 0) return null
    const px = X(p), pz = Z(p)
    const wa = ((X(b) - px) * (Z(c) - pz) - (X(c) - px) * (Z(b) - pz)) / d
    const wb = ((X(c) - px) * (Z(a) - pz) - (X(a) - px) * (Z(c) - pz)) / d
    const wc = 1 - wa - wb
    if (wa < -EPSB || wb < -EPSB || wc < -EPSB) return null
    return [a, b, c, wa, wb, wc]
  }
  const errAt = (w, p) => Math.abs(R[w[0]] * w[3] + R[w[1]] * w[4] + R[w[2]] * w[5] - R[p]) * E + Math.abs(Y(w[0]) * w[3] + Y(w[1]) * w[4] + Y(w[2]) * w[5] - Y(p))

  // the cost of u → v (the worst error it makes), or Infinity; with `apply`, does it
  const nbr = (u) => { const s = new Set(); for (const t of vt[u]) for (let k = 0; k < 3; k++) { const w = T[3 * t + k]; if (w !== u) s.add(w) } return s }
  function tryCollapse(u, v, apply) {
    const ring = vt[u], dt = [], mt = []
    for (const t of ring) (T[3 * t] === v || T[3 * t + 1] === v || T[3 * t + 2] === v ? dt : mt).push(t)
    if (dt.length !== 2) return Infinity
    // link condition: u and v share exactly the two opposite corners
    const nu = nbr(u), opp = new Set()
    for (const t of dt) for (let k = 0; k < 3; k++) { const w = T[3 * t + k]; if (w !== u && w !== v) opp.add(w) }
    let common = 0; for (const t of vt[v]) for (let k = 0; k < 3; k++) { const w = T[3 * t + k]; if (w !== v && w !== u && nu.has(w)) { if (!opp.has(w)) return Infinity } }
    for (const w of opp) if (nu.has(w)) common++
    if (common !== 2) return Infinity
    for (const t of mt) {
      let a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; if (a === u) a = v; else if (b === u) b = v; else c = v
      const d = area2(a, b, c); if ((d > 0 ? 1 : d < 0 ? -1 : 0) !== sgn[t]) return Infinity
      const lab = Math.hypot(X(b) - X(a), Z(b) - Z(a)), lbc = Math.hypot(X(c) - X(b), Z(c) - Z(b)), lca = Math.hypot(X(a) - X(c), Z(a) - Z(c))
      if (Math.abs(d) / Math.max(lab, lbc, lca) < LATTICE_M) return Infinity
    }
    // ⭐ NO NEW FOLD: a new triangle may not overlap any live triangle around the ring (2D SAT, deeper than LATTICE_M).
    //   Orientation alone let it through (fold-sites.mjs, x1: sidewalk 241 → 2,711 overlapping pairs).
    { const near = new Set(); for (const w of nu) for (const t of vt[w]) near.add(t); for (const t of vt[v]) near.add(t)
      for (const t of dt) near.delete(t)
      for (const t of mt) for (const o of near) if (o !== t && !sepSub(t, o, u, v)) return Infinity }
    let worst = 0
    const place = apply ? [] : null
    const check = (p) => { for (const t of mt) { const w = bary(t, u, v, p); if (w) { const e = errAt(w, p); if (e > TOL) return false; if (e > worst) worst = e; if (place) place.push(t, p); return true } } return false }
    if (!check(u)) return Infinity
    for (const t of ring) if (pts[t]) for (const p of pts[t]) if (!check(p)) return Infinity
    for (const w of nu) if (w !== v && !opp.has(w)) { const e = crossErr(v, w); if (e > TOL) return Infinity; if (e > worst) worst = e }
    if (!apply) return worst
    for (const t of ring) pts[t] = null
    for (let i = 0; i < place.length; i += 2) (pts[place[i]] || (pts[place[i]] = [])).push(place[i + 1])
    for (const t of dt) { alive[t] = 0; for (let k = 0; k < 3; k++) { const w = T[3 * t + k]; if (w !== u) { const L = vt[w]; L.splice(L.indexOf(t), 1) } } }
    for (const t of mt) { for (let k = 0; k < 3; k++) if (T[3 * t + k] === u) T[3 * t + k] = v; vt[v].push(t) }
    vt[u] = []; dead[u] = 1
    if (worst > maxErrSeen) maxErrSeen = worst
    return worst
  }
  function best(u) { if (lock[u] || dead[u]) return [Infinity, -1]; let bc = Infinity, bv = -1
    for (const v of nbr(u)) { const c = tryCollapse(u, v, false); if (c < bc) { bc = c; bv = v } } return [bc, bv] }

  // binary heap on cost, lazy (a stamp per vertex)
  const hc = [], hu = [], hs = [], stamp = new Int32Array(nv)
  const push = (c, u) => { let i = hc.length; hc.push(c); hu.push(u); hs.push(stamp[u])
    while (i > 0) { const p = (i - 1) >> 1; if (hc[p] <= hc[i]) break; [hc[p], hc[i]] = [hc[i], hc[p]]; [hu[p], hu[i]] = [hu[i], hu[p]]; [hs[p], hs[i]] = [hs[i], hs[p]]; i = p } }
  const pop = () => { const r = [hc[0], hu[0], hs[0]], lc = hc.pop(), lu = hu.pop(), ls = hs.pop()
    if (hc.length) { hc[0] = lc; hu[0] = lu; hs[0] = ls; let i = 0
      for (;;) { const l = 2 * i + 1, r2 = l + 1; let m = i; if (l < hc.length && hc[l] < hc[m]) m = l; if (r2 < hc.length && hc[r2] < hc[m]) m = r2; if (m === i) break
        [hc[m], hc[i]] = [hc[i], hc[m]]; [hu[m], hu[i]] = [hu[i], hu[m]]; [hs[m], hs[i]] = [hs[i], hs[m]]; i = m } }
    return r }
  for (let u = 0; u < nv; u++) { const [c] = best(u); if (c < Infinity) push(c, u) }
  let removed = 0
  while (hc.length) {
    const [, u, s] = pop()
    if (s !== stamp[u] || dead[u]) continue
    const [c, v] = best(u)
    if (c === Infinity) continue
    tryCollapse(u, v, true); removed++
    const touched = new Set([v]); for (const t of vt[v]) for (let k = 0; k < 3; k++) touched.add(T[3 * t + k])
    for (const w of touched) { stamp[w]++; const [cw] = best(w); if (cw < Infinity) push(cw, w) }
  }

  // compact: survivors in their original order, live triangles in their original order
  const remap = new Int32Array(nv).fill(-1); let nv2 = 0
  for (let v = 0; v < nv; v++) if (!dead[v] && vt[v].length) remap[v] = nv2++
  const P2 = new Float32Array(nv2 * 3), R2 = new Float32Array(nv2)
  for (let v = 0; v < nv; v++) if (remap[v] >= 0) { const w = remap[v]; P2[w * 3] = P[v * 3]; P2[w * 3 + 1] = P[v * 3 + 1]; P2[w * 3 + 2] = P[v * 3 + 2]; R2[w] = R[v] }
  let nt2 = 0; for (let t = 0; t < nt; t++) if (alive[t]) nt2++
  const I2 = new Uint32Array(nt2 * 3); let j = 0
  for (let t = 0; t < nt; t++) if (alive[t]) { I2[j++] = remap[T[3 * t]]; I2[j++] = remap[T[3 * t + 1]]; I2[j++] = remap[T[3 * t + 2]] }
  // aGrad: bake-ground.js#terrainPart's rule, on the simplified mesh
  const G2 = new Float32Array(nv2 * 4), W = new Float32Array(nv2)
  for (let t = 0; t < I2.length; t += 3) {
    const a = I2[t], b = I2[t + 1], c = I2[t + 2]
    const e1x = P2[b * 3] - P2[a * 3], e1z = P2[b * 3 + 2] - P2[a * 3 + 2], e2x = P2[c * 3] - P2[a * 3], e2z = P2[c * 3 + 2] - P2[a * 3 + 2]
    const det = e1x * e2z - e2x * e1z, area = Math.abs(det) / 2; if (!(area > 0)) continue
    const gr = (h0, h1, h2) => { const d1 = h1 - h0, d2 = h2 - h0; return [(d1 * e2z - d2 * e1z) / det, (e1x * d2 - e2x * d1) / det] }
    const gd = gr(R2[a], R2[b], R2[c]), gy = gr(P2[a * 3 + 1], P2[b * 3 + 1], P2[c * 3 + 1])
    for (const v of [a, b, c]) { G2[v * 4] += gd[0] * area; G2[v * 4 + 1] += gd[1] * area; G2[v * 4 + 2] += gy[0] * area; G2[v * 4 + 3] += gy[1] * area; W[v] += area }
  }
  for (let v = 0; v < nv2; v++) if (W[v] > 0) for (let k = 0; k < 4; k++) G2[v * 4 + k] /= W[v]
  let locked = 0; for (let v = 0; v < nv; v++) locked += lock[v]
  return { P: P2, I: I2, R: R2, G: G2, stats: { v0: nv, t0: nt, v1: nv2, t1: nt2, locked, folds, removed, maxErr: maxErrSeen } }
}

const out = [], report = []
for (const g of gj.groups) {
  const tg = Date.now()
  const pick = !ONLY || ONLY.some(s => `${g.kind}:${g.id}`.includes(s))
  const r = pick ? simplifyGroup(g) : (() => { const nv = g.vertexCount
    return { P: new Float32Array(AB, g.vertexByteOffset, nv * 3), I: new Uint32Array(AB, g.indexByteOffset, g.indexCount), R: new Float32Array(AB, g.rawByteOffset, nv),
      G: new Float32Array(AB, g.gradByteOffset, nv * 4), stats: { v0: nv, t0: g.indexCount / 3, v1: nv, t1: g.indexCount / 3, locked: nv, removed: 0, maxErr: 0 } } })()
  out.push(r); report.push({ group: `${g.kind}:${g.id}`, ...r.stats, ms: Date.now() - tg })
  console.log(`  ${`${g.kind}:${g.id}`.padEnd(30)} V ${r.stats.v0} → ${r.stats.v1} · T ${r.stats.t0} → ${r.stats.t1} · locked ${r.stats.locked} · fold tris ${r.stats.folds ?? '-'} · max err ${(r.stats.maxErr * 1000).toFixed(2)} mm · ${((Date.now() - tg) / 1000).toFixed(1)} s`)
}
const simplifyMs = Date.now() - t0

// the bin, in the bake's own section order: positions · indices · raw · grad (absolute offsets, bake-ground.js)
const groups = gj.groups.map(g => ({ ...g }))
let pos = 0, idx = 0, raw = 0, grad = 0
for (let i = 0; i < groups.length; i++) { const g = groups[i], r = out[i]
  g.vertexCount = r.P.length / 3; g.indexCount = r.I.length; g.vertexByteOffset = pos; g.indexByteOffset = idx; g.rawByteOffset = raw; g.gradByteOffset = grad
  pos += r.P.byteLength; idx += r.I.byteLength; raw += r.R.byteLength; grad += r.G.byteLength }
const bin = new Uint8Array(pos + idx + raw + grad)
let o = 0
for (const k of ['P', 'I', 'R', 'G']) for (const r of out) { bin.set(new Uint8Array(r[k].buffer, r[k].byteOffset, r[k].byteLength), o); o += r[k].byteLength }
for (const g of groups) { g.indexByteOffset += pos; g.rawByteOffset += pos + idx; g.gradByteOffset += pos + idx + raw }
mkdirSync(OUT, { recursive: true })
const manifest = { ...gj, groups, simplified: { from: IN, tolM: TOL, exag: E, bound: '|Δraw|·terrainExag + |Δy| at every original vertex', seams: 'locked', ms: simplifyMs } }
writeFileSync(join(OUT, 'ground.bin'), bin)
writeFileSync(join(OUT, 'ground.json'), JSON.stringify(manifest))
for (const f of readdirSync(IN)) if (!['ground.bin', 'ground.json'].includes(f)) copyFileSync(join(IN, f), join(OUT, f))
writeFileSync(join(OUT, 'simplify-report.json'), JSON.stringify({ tolM: TOL, exag: E, ms: simplifyMs, bytes: bin.byteLength, groups: report }, null, 1))
const V0 = report.reduce((a, r) => a + r.v0, 0), V1 = report.reduce((a, r) => a + r.v1, 0), T0 = report.reduce((a, r) => a + r.t0, 0), T1 = report.reduce((a, r) => a + r.t1, 0)
console.log(`simplify tol ${(TOL * 1000).toFixed(2)} mm @ E ${E}: V ${V0} → ${V1} · T ${T0} → ${T1} · bytes ${buf.byteLength} → ${bin.byteLength} · ${(simplifyMs / 1000).toFixed(1)} s → ${OUT}`)
