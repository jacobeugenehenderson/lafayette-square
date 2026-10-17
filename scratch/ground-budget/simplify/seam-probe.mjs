// seam-probe.mjs — what phase 1 left on the seams, and what phase 2 could take (an ESTIMATE, nothing is written).
// (1) Per group of a simplified slab: the share of its triangles that touch a LOCKED vertex (simplify.mjs's own lock rules:
//     group boundary · non-manifold edge · xz twin · position another group also uses · collinear triangle).
// (2) Phase 2's candidates: a seam position p can go only if EVERY group holding p has it on its boundary with exactly two
//     boundary neighbours, the SAME two positions a and b in every group (both sides agree on the new vertex set, so no
//     T-junction can open), p lies within LATTICE_M of the line a–b, and in every group the drawn height along a–b stays
//     within TOL of p's own (|Δraw|·E + |Δy|). Taken greedily along each chain, every removed point checked against the
//     kept span it falls in. Counts positions; the triangle saving is estimated, not built.
//   node --max-old-space-size=8192 scratch/ground-budget/simplify/seam-probe.mjs --slab=<simplified dir> --scene=<scene.json> --tol=<m>
import { readFileSync } from 'fs'
import { join } from 'path'
import { LATTICE_M } from '../../../src/lib/lattice.js'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const TOL = +arg('tol'), E = JSON.parse(readFileSync(arg('scene'), 'utf8')).terrainExag
if (!(E > 0) || !(TOL > 0)) throw new Error('seam-probe: --tol and a scene with terrainExag are required')
const dir = arg('slab'), gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const key = (x, z) => Math.round(x / LATTICE_M) + ',' + Math.round(z / LATTICE_M)
const G = gj.groups.map(g => ({ g, P: new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I: new Uint32Array(AB, g.indexByteOffset, g.indexCount), R: new Float32Array(AB, g.rawByteOffset, g.vertexCount) }))
const owners = new Map()   // position key → [{gi, v}]
G.forEach(({ g, P }, gi) => { for (let v = 0; v < g.vertexCount; v++) { const k = key(P[v * 3], P[v * 3 + 2]); (owners.get(k) || owners.set(k, []).get(k)).push({ gi, v }) } })
let T = 0, Tl = 0, cand = 0, seamPos = 0, removable = 0
const rows = []
const bnbr = []   // per group: boundary neighbours of each vertex (Map v → [w…]), and the lock flags
G.forEach(({ g, P, I }, gi) => {
  const nv = g.vertexCount, ec = new Map()
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3], e = a < b ? a * nv + b : b * nv + a; ec.set(e, (ec.get(e) || 0) + 1) }
  const lock = new Uint8Array(nv), nb = new Map()
  for (const [e, n] of ec) { const a = Math.floor(e / nv), b = e % nv
    if (n !== 2) { lock[a] = 1; lock[b] = 1 }
    if (n === 1) { (nb.get(a) || nb.set(a, []).get(a)).push(b); (nb.get(b) || nb.set(b, []).get(b)).push(a) } }
  const seen = new Map()
  for (let v = 0; v < nv; v++) { const k = key(P[v * 3], P[v * 3 + 2]); if (new Set(owners.get(k).map(o => o.gi)).size > 1) lock[v] = 1
    if (seen.has(k)) { lock[v] = 1; lock[seen.get(k)] = 1 } else seen.set(k, v) }
  for (let t = 0; t < I.length; t += 3) { const [a, b, c] = [I[t], I[t + 1], I[t + 2]]
    if ((P[b * 3] - P[a * 3]) * (P[c * 3 + 2] - P[a * 3 + 2]) - (P[c * 3] - P[a * 3]) * (P[b * 3 + 2] - P[a * 3 + 2]) === 0) { lock[a] = lock[b] = lock[c] = 1 } }
  let tl = 0; for (let t = 0; t < I.length; t += 3) if (lock[I[t]] || lock[I[t + 1]] || lock[I[t + 2]]) tl++
  T += I.length / 3; Tl += tl
  rows.push([`${g.kind}:${g.id}`, I.length / 3, tl])
  bnbr.push(nb)
})
// phase 2's agreeable seam positions
const agree = new Set()
for (const [k, L] of owners) {
  let ok = true, pair = null
  for (const { gi, v } of L) { const nb = bnbr[gi].get(v); if (!nb || nb.length !== 2) { ok = false; break }
    const P = G[gi].P, pk = nb.map(w => key(P[w * 3], P[w * 3 + 2])).sort().join('|'); if (pair === null) pair = pk; else if (pair !== pk) { ok = false; break } }
  if (!L.some(({ gi, v }) => bnbr[gi].has(v))) continue
  seamPos++
  if (ok) { agree.add(k); cand++ }
}
// greedy along each agreeable chain, checked in every owning group (xz within LATTICE_M of the span; height within TOL)
const done = new Set()
for (const k0 of agree) {
  if (done.has(k0)) continue
  // walk out from k0 to both ends of its run of agreeable positions, using the first owner's boundary graph
  const { gi, v } = owners.get(k0)[0], { P } = G[gi], nb = bnbr[gi]
  const run = [v]; done.add(k0)
  for (const dirn of [0, 1]) { let prev = v, cur = nb.get(v)[dirn]
    for (;;) { const k = key(P[cur * 3], P[cur * 3 + 2]); if (dirn === 0) run.unshift(cur); else run.push(cur)
      if (!agree.has(k) || done.has(k)) break; done.add(k); const n2 = nb.get(cur); const nx = n2[0] === prev ? n2[1] : n2[0]; prev = cur; cur = nx } }
  // run = [anchor, …agreeable…, anchor]; greedy spans
  const posOf = (w) => [P[w * 3], P[w * 3 + 2]]
  const okSpan = (i, j) => { const [ax, az] = posOf(run[i]), [bx, bz] = posOf(run[j]), dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; if (!L2) return false
    for (let m = i + 1; m < j; m++) { const [px, pz] = posOf(run[m]), s = ((px - ax) * dx + (pz - az) * dz) / L2
      if (s <= 0 || s >= 1 || Math.abs((px - ax) * dz - (pz - az) * dx) / Math.sqrt(L2) > LATTICE_M) return false
      const km = key(px, pz), ka = key(ax, az), kb = key(bx, bz)
      for (const o of owners.get(km)) { const Q = G[o.gi], oa = owners.get(ka).find(x => x.gi === o.gi), ob = owners.get(kb).find(x => x.gi === o.gi); if (!oa || !ob) return false
        const h = (w) => Q.R[w] * E, y = (w) => Q.P[w * 3 + 1]
        if (Math.abs((h(oa.v) + s * (h(ob.v) - h(oa.v))) - h(o.v)) + Math.abs((y(oa.v) + s * (y(ob.v) - y(oa.v))) - y(o.v)) > TOL) return false } }
    return true }
  let i = 0
  while (i < run.length - 1) { let j = i + 1; while (j + 1 < run.length && okSpan(i, j + 1)) j++; removable += j - i - 1; i = j }
}
rows.sort((a, b) => b[2] - a[2])
console.log(`${dir} · tol ${(TOL * 1000).toFixed(2)} mm @ E ${E}`)
console.log(`triangles touching a locked vertex: ${Tl} of ${T} (${(100 * Tl / T).toFixed(1)}%)`)
for (const [n, t, tl] of rows.slice(0, 14)) console.log(`  ${n.padEnd(30)} ${String(tl).padStart(7)} of ${String(t).padStart(7)}  ${(100 * tl / t).toFixed(1)}%`)
console.log(`seam positions ${seamPos} · agreeable (every side: boundary, degree 2, same neighbours) ${cand} · removable at tol along their chains ${removable} (${(100 * removable / seamPos).toFixed(1)}% of seam positions)`)
