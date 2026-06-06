// Gunter (D1): distance profile — park-side block edge vs lafayette-avenue-6
// chain, per 10m station along the chain. Separates the D1 cure (mid-run
// curb offset ≈ 7m) from the remaining D3 corner construction near the node.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const which = process.argv[2] || 'src/data/ribbons.json'
const r = JSON.parse(readFileSync(new URL('../' + which, import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, scl = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * scl, cz + (z - cz) * scl])
const pr = buildTileGround(r, { stencil: clip, curbWidth: d.curbWidth, smooth: 0, blockLandUse: d.blockLandUse, cornerRadiusScale: 1, cornerCornerRadiusOverrides: d.cornerCornerRadiusOverrides || null, blockCustoms: d.blockCustoms || null })

const pts = r.streets.find(s => s.skelId === 'lafayette-avenue-6').points
// stations every 10m along the chain
const stations = []
let acc = 0
for (let i = 0; i < pts.length - 1; i++) {
  const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  for (let s = 0; s < L; s += 10) {
    const t = s / L
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1]
    const nl = Math.hypot(dx, dz)
    stations.push({ at: acc + s, p: [pts[i][0] + t * dx, pts[i][1] + t * dz], perp: [-dz / nl, dx / nl] }) // measure-RIGHT (outer)
  }
  acc += L
}
// for each station: march outward along the right-perp, find first block-ring hit
const inside = (p, ring) => {
  let inS = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j]
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) inS = !inS
  }
  return inS
}
// Only count rings that genuinely live on the outer/park side: ring centroid
// strictly on the probe side of the chain (excludes the bare-median ring,
// which legitimately touches the chain from the inboard side post-D1).
const centroid = (ring) => {
  let x = 0, z = 0
  for (const p of ring) { x += p[0]; z += p[1] }
  return [x / ring.length, z / ring.length]
}
const southRings = pr.block.filter(ring => {
  const c = centroid(ring)
  let bi = 0, bd = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const vx = pts[i + 1][0] - pts[i][0], vz = pts[i + 1][1] - pts[i][1]
    const t = Math.max(0, Math.min(1, ((c[0] - pts[i][0]) * vx + (c[1] - pts[i][1]) * vz) / (vx * vx + vz * vz || 1)))
    const dd = Math.hypot(c[0] - (pts[i][0] + t * vx), c[1] - (pts[i][1] + t * vz))
    if (dd < bd) { bd = dd; bi = i }
  }
  const dx = pts[bi + 1][0] - pts[bi][0], dz = pts[bi + 1][1] - pts[bi][1]
  return (c[0] - pts[bi][0]) * (-dz) + (c[1] - pts[bi][1]) * dx > 0   // measure-RIGHT = outer
})
const rows = []
for (const st of stations) {
  let hit = null
  for (let r0 = 0.25; r0 <= 15; r0 += 0.25) {
    const q = [st.p[0] + st.perp[0] * r0, st.p[1] + st.perp[1] * r0]
    if (southRings.some(ring => inside(q, ring))) { hit = r0; break }
  }
  rows.push(`${String(st.at.toFixed(0)).padStart(4)}m  curb-offset=${hit == null ? '>15' : hit.toFixed(2)}`)
}
console.log(rows.join('\n'))
