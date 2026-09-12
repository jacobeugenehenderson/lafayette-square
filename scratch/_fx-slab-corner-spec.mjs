// ⛔ THE CORNER SPEC, READ OFF THE SHIPPED SLAB — the previous correct map, as an artifact.
// The current build is used ONLY to say WHERE the corners are; every depth below is measured on
// the slab. For each corner: the two legs' cross-sections 10 m out, and the corner's own, taken at
// the ARC'S MIDPOINT on a true inward normal — the earlier version fired from the corner vertex
// along a near-tangent and returned junk (83 of 173 "neither"), which is why its numbers are void.
import { feed, buildProto } from './_proto-feed.mjs'
import { matAt } from './_fx-slab-xsection.mjs'
const SLAB = process.argv[2], scene = process.argv[3] || 'lafayette-square'
const f = feed(scene)
const T = buildProto(f, { protoArtifact: true }).protoShapeTiles

const profile = (px, pz, nx, nz) => {
  const seq = []
  for (let d = -2; d <= 10; d += 0.05) seq.push([d, matAt(px + nx * d, pz + nz * d)])
  const i0 = seq.findIndex(([, m]) => m === 'walk' || m === 'grass')
  if (i0 < 0) return null
  const z0 = seq[i0][0]
  const span = (cls) => { const h = seq.filter(([d, m]) => m === cls && d >= z0 - 1e-9)
    return h.length ? [h[0][0] - z0, h[h.length - 1][0] - z0] : null }
  return { walk: span('walk'), grass: span('grass') }
}
const both = (P, tan) => { const [tx, tz] = tan
  for (const [nx, nz] of [[-tz, tx], [tz, -tx]]) { const r = profile(P[0], P[1], nx, nz); if (r) return r }
  return null }
const unit = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L] }

const rows = []
for (let ti = 0; ti < T.length; ti++) {
  const st = T[ti], iA = st.iaFull || []
  for (let ri = 0; ri < iA.length; ri++) {
    const ring = iA[ri], n = ring.length, mark = st.iaCorner?.[ri], arc = st.iaArc?.[ri]
    if (!mark || !arc) continue
    const seen = new Set()
    for (let q = 0; q < n; q++) {
      if (!mark[q] || arc[q] == null || seen.has(arc[q])) continue
      seen.add(arc[q])
      // the arc's extent: the maximal run carrying this same arc id
      let s = q; while (arc[(s - 1 + n) % n] === arc[q]) { s = (s - 1 + n) % n; if (s === q) break }
      let e = q; while (arc[(e + 1) % n] === arc[q]) { e = (e + 1) % n; if (e === q) break }
      const len = ((e - s + n) % n) || 1
      const mid = (s + Math.floor(len / 2)) % n
      // ⭐ the corner's own depth, at the arc's MIDPOINT, on the normal to the arc there
      const C = both(ring[mid], unit(ring[(mid - 1 + n) % n], ring[(mid + 1) % n]))
      // the two legs, 10 m of ARC LENGTH beyond each tangent
      const march = (from, dir) => { let i = from, d = 0
        for (let k = 0; k < n; k++) { const j = (i + dir + n) % n
          d += Math.hypot(ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]); i = j; if (d >= 10) break }
        return i }
      const ia = march(s, -1), ib = march(e, +1)
      const A = both(ring[ia], unit(ring[(ia - 1 + n) % n], ring[(ia + 1) % n]))
      const B = both(ring[ib], unit(ring[(ib - 1 + n) % n], ring[(ib + 1) % n]))
      if (!A?.walk || !B?.walk || !C?.walk) continue
      const kind = (r) => (r.grass && r.grass[0] < 0.35) ? 'TL' : 'SW'
      rows.push({ cfg: [kind(A), kind(B)].sort().join('↔'), a: A.walk[1], b: B.walk[1], c: C.walk[1],
        cg: C.grass, arcLen: len })
    }
  }
}
const med = (a) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null
const by = {}
for (const r of rows) (by[r.cfg] = by[r.cfg] || []).push(r)
console.log(`corners measured on the SHIPPED SLAB: ${rows.length}\n`)
for (const cfg of Object.keys(by).sort()) {
  const R = by[cfg]
  let mn = 0, mx = 0, other = 0, kerb = 0
  for (const r of R) { const lo = Math.min(r.a, r.b), hi = Math.max(r.a, r.b)
    if (Math.abs(r.c - lo) <= 0.3) mn++; else if (Math.abs(r.c - hi) <= 0.3) mx++; else other++
    if (r.cg && r.cg[0] < 0.35) kerb++ }
  console.log(`══ ${cfg} · ${R.length} corners`)
  console.log(`   legs (median)      shallower ${med(R.map(r=>Math.min(r.a,r.b))).toFixed(2)} m · deeper ${med(R.map(r=>Math.max(r.a,r.b))).toFixed(2)} m`)
  console.log(`   corner walk depth  median ${med(R.map(r=>r.c)).toFixed(2)} m`)
  console.log(`   matches            MIN ${mn}  ·  MAX ${mx}  ·  neither ${other}`)
  console.log(`   grass at the kerb  ${kerb} of ${R.length}\n`)
}
