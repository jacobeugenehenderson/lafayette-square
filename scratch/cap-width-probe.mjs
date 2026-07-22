// cap-width-probe.mjs — measure the DRAWN asphalt half-width on each side of a
// chain's centreline, to compare against the authored per-side pavementHW.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const skelId = process.argv[2] || 'nicholson-place'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const s = ribbons.streets.find(x => (x.skelId || x.name) === skelId)
const o = console.log; console.log = () => {}
const g = buildTileGround(ribbons, { smooth: 0 })
console.log = o
console.log(`${skelId} authored: left.pavementHW=${s.measure?.left?.pavementHW}  right.pavementHW=${s.measure?.right?.pavementHW}`)
const p = s.points, n = p.length
const a = p[Math.floor(n / 2) - (n > 2 ? 0 : 0)], b = p[n - 1]
// sample at 40% along the chain, away from both ends
const A = p[0], B = p[n - 1]
const cx = A[0] + (B[0] - A[0]) * 0.4, cz = A[1] + (B[1] - A[1]) * 0.4
const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz)
const nx = -dz / L, nz = dx / L   // left normal (matches frameAtPoint)
const inside = (rings, x, z) => {
  let c = false
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > z) !== (r[j][1] > z) && x < (r[j][0] - r[i][0]) * (z - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c
  }
  return c
}
for (const [label, sgn] of [['+normal (right by resolveStripHit)', 1], ['-normal (left)', -1]]) {
  let last = 0
  for (let d = 0; d <= 15; d += 0.05) {
    if (inside(g.asphalt, cx + nx * sgn * d, cz + nz * sgn * d)) last = d
  }
  console.log(`  drawn asphalt reach ${label}: ${last.toFixed(2)} m`)
}
