// Read-only probe (Keel, 2026-09-23): replicate bake-ground's stripe path for a closed-loop
// centerStripe — polylineToRing (copied verbatim, it is not exported) → THREE.ShapeUtils.triangulateShape
// (what triangulateAndRefine calls) — and compare triangle area to the true band area.
import fs from 'fs'
import * as THREE from 'three'
const town = process.argv[2] || 'huron'
const mP = `cartograph/data/${town}/clean/map.json`
console.log('#', mP, fs.statSync(mP).mtime.toISOString())
function polylineToRing(coords, halfWidth) {
  const n = coords.length, left = new Array(n), right = new Array(n)
  for (let i = 0; i < n; i++) {
    const c = coords[i], prev = coords[Math.max(0, i - 1)], next = coords[Math.min(n - 1, i + 1)]
    const px = prev.x ?? prev[0], pz = prev.z ?? prev[1], nx = next.x ?? next[0], nz = next.z ?? next[1], cx = c.x ?? c[0], cz = c.z ?? c[1]
    const dx = nx - px, dz = nz - pz, l = Math.hypot(dx, dz) || 1, ux = -dz / l, uz = dx / l
    left[i] = [cx + ux * halfWidth, cz + uz * halfWidth]; right[i] = [cx - ux * halfWidth, cz - uz * halfWidth]
  }
  const ring = []; for (let i = 0; i < n; i++) ring.push(left[i]); for (let i = n - 1; i >= 0; i--) ring.push(right[i]); return ring
}
const HW = 0.10   // POLYLINE_HALF_WIDTHS.stripe
const L = JSON.parse(fs.readFileSync(mP)).layers.centerStripe || []
let closed = 0, filled = 0, open = 0, openBad = 0
const rows = []
for (const it of L) {
  const c = it.coords.map(p => [p.x ?? p[0], p.z ?? p[1]]); if (c.length < 3) continue
  const isClosed = Math.hypot(c[0][0] - c.at(-1)[0], c[0][1] - c.at(-1)[1]) < 1e-3
  let len = 0; for (let i = 1; i < c.length; i++) len += Math.hypot(c[i][0] - c[i-1][0], c[i][1] - c[i-1][1])
  const ring = polylineToRing(c, HW)
  const tris = THREE.ShapeUtils.triangulateShape(ring.map(p => new THREE.Vector2(p[0], p[1])), [])
  let A = 0; for (const [a, b, d] of tris) { const P = ring[a], Q = ring[b], R = ring[d]; A += Math.abs((Q[0]-P[0])*(R[1]-P[1]) - (R[0]-P[0])*(Q[1]-P[1])) / 2 }
  const band = len * 2 * HW, ratio = A / band
  if (isClosed) { closed++; if (ratio > 2) filled++ } else { open++; if (ratio > 2) openBad++ }
  if (isClosed) { let s = 0; for (let i = 0; i < c.length - 1; i++) s += c[i][0]*c[i+1][1] - c[i+1][0]*c[i][1]
    rows.push(`${String(it.name).padEnd(24)} n=${String(c.length).padStart(3)} loopArea=${Math.abs(s/2).toFixed(0).padStart(6)} m²  band=${band.toFixed(1).padStart(6)} m²  triangulated=${A.toFixed(1).padStart(7)} m²  ×${ratio.toFixed(1)}`) }
}
console.log(rows.join('\n'))
console.log(`\ncenterStripe items: closed ${closed} (triangulated >2× their band: ${filled}) · open ${open} (>2×: ${openBad})`)
