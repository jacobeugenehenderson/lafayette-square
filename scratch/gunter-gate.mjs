// Gunter (D1) gate-check: production buildTileGround, HEAD ribbons vs re-derived.
//  G1 — the park block must no longer touch the lafayette-avenue-6 chain:
//       min distance chain→block-ring along the straight run ≈ pav 6.70 + curb.
//  G2 — the Lafayette median (gap tile between -5 and -6) must stop flooding
//       to asphalt: a ground ring must exist between the two chains.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const which = process.argv[2] || 'src/data/ribbons.json'
const r = JSON.parse(readFileSync(new URL('../' + which, import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, scl = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * scl, cz + (z - cz) * scl])
const base = { stencil: clip, curbWidth: d.curbWidth, smooth: 0, blockLandUse: d.blockLandUse, cornerRadiusScale: 1, cornerCornerRadiusOverrides: d.cornerCornerRadiusOverrides || null, blockCustoms: d.blockCustoms || null }

const pr = buildTileGround(r, base)
const byId = new Map(r.streets.map(s => [s.skelId, s]))
const cwB = byId.get('lafayette-avenue-6')
const cwA = byId.get('lafayette-avenue-5')

const segDist = (p, a, b) => {
  const vx = b[0] - a[0], vz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / (vx * vx + vz * vz || 1)))
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vz))
}
const distToChain = (p, pts) => {
  let m = Infinity
  for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, segDist(p, pts[i], pts[i + 1]))
  return m
}

// G1 — park block: the ring south of cwB (park side: z below the chain) whose
// vertices hug the chain's mid-run. Sample the chain's interior (skip 20m at
// each end to stay off the intersection wedges — the CORNER is D3, not D1)
// and measure the min distance to any block-ring vertex on the park side.
const pts = cwB.points
const chainLen = pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0)
let best = { d: Infinity }
for (const ring of pr.block) {
  for (const p of ring) {
    const dc = distToChain(p, pts)
    if (dc > 12) continue
    // outer/park side = the measure-RIGHT of point order: perp (-dz,dx) of the
    // nearest segment's tangent must point TOWARD p (innerSign=-1 → inboard
    // left → the right side is the outer/park side for this chain).
    let bi = 0, bd = Infinity
    for (let i = 0; i < pts.length - 1; i++) { const dd = segDist(p, pts[i], pts[i + 1]); if (dd < bd) { bd = dd; bi = i } }
    const dx = pts[bi + 1][0] - pts[bi][0], dz = pts[bi + 1][1] - pts[bi][1]
    const side = (p[0] - pts[bi][0]) * (-dz) + (p[1] - pts[bi][1]) * dx
    if (side <= 0) continue                   // measure-left → median side, skip
    // mid-run only: at least 25m from both chain endpoints
    const dEnd = Math.min(Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]), Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]))
    if (dEnd < 25) continue
    if (dc < best.d) best = { d: dc, p }
  }
}
console.log(`G1 park-side block edge: min dist to lafayette-avenue-6 chain (mid-run) = ${best.d.toFixed(2)} m  at (${best.p?.[0].toFixed(1)},${best.p?.[1].toFixed(1)})`)
console.log(`   expect ≈ pav ${cwB.measure[cwB.innerSign === 1 ? 'left' : 'right']?.pavementHW?.toFixed?.(2) ?? '—'} + curb ${d.curbWidth}; FLUSH (≈0) = the defect`)

// G2 — median ground between the chains: midpoint between the two chains at
// several stations; count stations covered by a ground (block) ring.
const inside = (p, ring) => {
  let inS = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j]
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) inS = !inS
  }
  return inS
}
let covered = 0, total = 0
for (let t = 0.25; t <= 0.75; t += 0.05) {
  const i = Math.floor(t * (pts.length - 1))
  const pB = pts[i]
  // nearest point on cwA
  let pA = cwA.points[0]
  for (const q of cwA.points) if (Math.hypot(q[0] - pB[0], q[1] - pB[1]) < Math.hypot(pA[0] - pB[0], pA[1] - pB[1])) pA = q
  if (Math.hypot(pA[0] - pB[0], pA[1] - pB[1]) > 20) continue   // off the paired run
  const mid = [(pA[0] + pB[0]) / 2, (pA[1] + pB[1]) / 2]
  total++
  if (pr.block.some(ring => inside(mid, ring))) covered++
}
console.log(`G2 median ground coverage between chains: ${covered}/${total} stations have bare-ground ring (0 = fully asphalt-flooded)`)
